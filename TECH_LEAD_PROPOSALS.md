# Propuestas del tech-lead

Ideas que **no** toqué en el código porque no eran el incendio del día.
Ordenadas por lo que le cuesta al negocio, no por lo que cuesta programarlas.

Auditoría del 2026-09-15 sobre el commit `674789e`.

---

## 1. Registrar ventas sin señal — HECHO

Implementado. La caja del día y los fiados se leen del teléfono cuando Supabase
no contesta, y todo lo que se anota sin señal (ventas, gastos, ediciones,
borrados, clientes nuevos, "Fió más" y "Abonó") queda guardado en IndexedDB y
sube solo cuando vuelve el internet. El código vive en `src/lib/offline/`.

**Queda una cosa por hacer a mano**: correr la sección 6 de
`supabase/01-endurecer-esquema.sql`. Sin ella los abonos se suben con un
compare-and-swap que protege contra pisar el saldo de otro celular, pero no
contra sumar dos veces si se pierde la respuesta después de aplicarse. Con ella,
el abono se aplica exactamente una vez.

---

## 2. Historial de cada fiado

**Problema.** `customers_debts` guarda un solo número: el saldo. Cuando la
señora María diga "yo no debo cuarenta, debo veinte", la bodeguera no tiene qué
mostrarle. Un cuaderno de papel sí tiene el historial: cada línea con su fecha.
Estamos dando menos que el papel en lo único que genera discusiones con el
cliente.

**Solución.** Tabla `debt_movements` (`id`, `debt_id`, `tipo` fio/abono,
`monto`, `nota`, `created_at`). El saldo pasa a ser la suma de los movimientos
(columna calculada o trigger). En la pantalla, cada cliente se despliega y
muestra su cuenta corriente. El mensaje de WhatsApp puede incluir las últimas
tres líneas.

**A favor.** Resuelve la conversación difícil del negocio. Da trazabilidad y
permite deshacer un error sin inventar un movimiento al revés.
**En contra.** Migración de los saldos que ya existan (un movimiento inicial de
"saldo anterior" por cliente).

---

## 3. Cobro real con Mercado Pago

**Problema.** La pantalla de planes llama a `/api/mercadopago/create-preference`.
Ese endpoint no puede existir: un sitio estático no tiene backend. Está apagada
con `MOSTRAR_PLANES`, o sea que hoy no hay forma de cobrar.

**Solución.** Dos Edge Functions de Supabase (Deno, ya vienen con el proyecto,
no hace falta infraestructura nueva):

- `crear-preferencia`: valida la sesión, arma la preferencia con el token
  secreto de Mercado Pago y devuelve el `init_point`.
- `webhook-mercadopago`: recibe la notificación de pago, **verifica la firma**,
  y actualiza `subscription_status` con la clave `service_role` (la única que
  pasa el trigger de `supabase/01-endurecer-esquema.sql`).

**Antes de encender nada de esto**, correr ese guion SQL. Hoy cualquier usuario
puede darse el plan anual desde la consola del navegador; lo probé y funciona.

**A favor.** Es el interruptor entre piloto y negocio.
**En contra.** El webhook hay que probarlo con pagos de prueba de verdad; la
firma mal verificada es peor que no tener webhook.

---

## 4. Aviso de privacidad y términos

**Problema.** La app guarda nombres y números de celular de los clientes *de la
bodega*: datos personales de terceros que la bodeguera nos confía. En Perú eso
cae bajo la Ley 29733. No hay ni una línea que diga qué guardamos, por cuánto
tiempo, ni cómo se borra una cuenta.

**Solución.** Una página `/privacidad` en castellano llano (no copiada de una
plantilla gringa) enlazada desde el registro, diciendo: qué se guarda, dónde
(Supabase), quién lo ve (solo esa bodega), y a qué correo se escribe para pedir
el borrado. Más un botón real de "borrar mi cuenta y mis datos", que hoy además
no existe porque `merchants` no tiene política de DELETE.

**A favor.** Es barato y es exactamente el tipo de cosa que cuesta diez veces
más arreglar cuando ya tienes trescientos clientes.
**En contra.** Ninguno serio. Yo lo pondría antes del primer cliente que pague.

---

## 5. Cerrar el día y ver la semana

**Problema.** La app contesta "¿cómo me fue hoy?" pero no "¿cómo me fue esta
semana?" ni "¿qué día vendo más?". Es la información por la que un bodeguero
paga una mensualidad, y los datos ya están en la tabla: falta la consulta.

**Solución.** Una pestaña "Resumen" con los últimos 7 y 30 días: total vendido,
total gastado, ganancia, el día más fuerte y cuánto se cobró por Yape frente a
efectivo. Una sola consulta agregada por rango; `recharts` ya está instalado.

**A favor.** Es la funcionalidad que justifica el precio frente al cuaderno.
**En contra.** Cuidado con traer miles de filas al celular: agregar en Postgres
con una vista o un RPC, no en el navegador.

---

## 6. Editar los datos de la bodega

**Problema.** El nombre del negocio y el número de Yape se piden una vez en el
registro y no se pueden cambiar nunca más. Si se escribió mal el número de
Yape, todos los mensajes de cobro por WhatsApp salen con el número equivocado y
la bodeguera no tiene cómo arreglarlo.

**Solución.** Una pantalla de ajustes con nombre, número de Yape, moneda y
cerrar sesión. Poco trabajo; el trigger de suscripción del guion SQL ya deja
pasar estos campos y bloquea los sensibles.

---

## 7. Pruebas automatizadas de lo que toca plata

**Problema.** Cero tests. Los tres arreglos de hoy (la cuenta que quedaba
bloqueada, el monto con coma, el fallo silencioso al guardar) son exactamente
los que un test hubiera atajado, y ninguno da la cara hasta que un cliente
real se queja.

**Solución.** Vitest sobre lo puro, que es donde vive el riesgo: `parseMoney`,
`parseAmount`, los totales del día y el cálculo del saldo de fiados. Más un
Playwright corto del camino registro → anotar venta → ver saldo, corriendo en
el mismo workflow antes del deploy.

**A favor.** Barato para la parte pura y ataja justo los errores de plata.
**En contra.** El Playwright necesita un proyecto de Supabase de prueba para no
ensuciar el de producción.
