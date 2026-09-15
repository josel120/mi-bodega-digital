# Propuestas del tech-lead

Ideas que **no** toqué en el código porque no eran el incendio del día.
Ordenadas por lo que le cuesta al negocio, no por lo que cuesta programarlas.

Auditoría del 2026-09-15 sobre el commit `674789e`.

---

## 1. Registrar ventas sin señal

**Problema.** El service worker hace que la app *abra* sin internet, pero
Supabase no responde y cada venta que anote en ese rato se pierde con un aviso
rojo. La bodega de barrio es justo el lugar donde el celular se queda sin datos:
le prometimos "funciona sin señal" y lo que funciona es la pantalla vacía. Es la
diferencia entre una app que reemplaza al cuaderno y una que lo acompaña.

**Solución.** Escribir primero en IndexedDB y sincronizar después:

1. Cada venta se guarda local con un `id` generado en el cliente (`crypto.randomUUID()`)
   y un estado `pendiente`.
2. La pantalla lee de local, así el saldo del día es correcto al instante.
3. Un worker de sincronización sube lo pendiente cuando vuelve la señal
   (`navigator.onLine` + reintentos). El `id` del cliente hace la subida
   idempotente: si se sube dos veces, la segunda choca con la clave primaria.
4. Un puntito gris en cada movimiento no sincronizado, y un contador arriba
   ("3 sin subir").

**A favor.** Es el argumento de venta más fuerte contra el cuaderno de papel.
**En contra.** Es la pieza más grande de la lista (dos o tres días). Obliga a
pensar qué pasa si el mismo usuario anota desde dos celulares. Yo lo haría
después del piloto, con diez bodegas ya usándolo y quejándose de esto.

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
