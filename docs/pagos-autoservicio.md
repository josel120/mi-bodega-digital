# Cobro autoservicio: primera entrega

Preparado el 2026-10-02. Checkout prepago mensual S/29 o anual S/279, precios que
ya estaban en la pantalla. No hay cargos recurrentes automáticos. No se habilitó
el cobro en producción: `MOSTRAR_PLANES=false` y `PAYMENTS_ENABLED` apagado por
defecto. No se ejecutó SQL ni se modificaron secretos.

## Flujo

1. Usuario registrado abre Plan cuando el piloto permita habilitarlo.
2. `supabase.functions.invoke('crear-preferencia')` envía su JWT y plan, sin precio
   ni dueño de bodega. La función verifica sesión en Auth y CORS del sitio.
3. RPC reserva un pedido por bodega bajo candado. La función crea una preferencia
   con importe fijo en PEN, referencia del pedido, vencimiento y regreso al
   prefijo `/mi-bodega-digital/subscription/`. Devuelve solo checkout permitido.
4. Mercado Pago procesa el cobro. El regreso muestra «comprobando»; no activa plan.
5. Webhook verifica HMAC y consulta el pago al proveedor. Valida ID, vendedor,
   referencia, moneda, importe, fecha y modo test/live antes de RPC de aplicación.
6. Postgres guarda pago y vigencia en una transacción. Reintentos no suman meses;
   una devolución/contracargo revoca ese pedido y recalcula los otros válidos.
   «Revisar mi plan» muestra el estado confirmado y la fecha de vencimiento.

Las funciones usan REST y WebCrypto; sin dependencias nuevas. Nunca guardan
tarjetas ni aceptan el body del webhook como prueba del estado. El modo test debe
usarse en un proyecto Supabase de prueba para no activar planes de cuentas reales.

## Configuración preparada

Funciones: `crear-preferencia`, `webhook-mercadopago`. Config TOML desactiva JWT de
plataforma porque la primera verifica explícitamente JWT en `/auth/v1/user`, y la
segunda autentica con firma del proveedor. No son endpoints anónimos de escritura.

Variables del servidor (ninguna `NEXT_PUBLIC`):

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | REST/Auth; claves disponibles en el entorno de funciones |
| `APP_URL` | URL exacta de app sin barra final; producción `https://josel120.github.io/mi-bodega-digital` |
| `PAYMENTS_ENABLED` | `on` habilita endpoints; cualquier otro valor los deja apagados |
| `PAYMENTS_MODE` | `test` o `live`; ausente/inválido mantiene apagado |
| `MERCADOPAGO_ACCESS_TOKEN` | Cuenta del vendedor, solo servidor |
| `MERCADOPAGO_COLLECTOR_ID` | ID esperado del vendedor, no el ID de aplicación |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto del webhook configurado en Your integrations |

Configurar en Mercado Pago el webhook `payment` hacia
`<SUPABASE_URL>/functions/v1/webhook-mercadopago`, incluyendo query `data.id` y
`type`, y comprobar que llega `x-signature`. No usar IPN sin firma.

## Verificación y habilitación pendiente

- Verificar `01-endurecer-esquema.sql` aplicado, sin ejecutar su limpieza de QA
  a ciegas. Revisar y aplicar `02-membresias-prepago.sql`; tablas nuevas guardan
  IDs de bodega y pago, deben incluirse en la política y proceso de borrado/retención.
- En proyecto de prueba: desplegar funciones, configurar secretos y modo test;
  probar pago sandbox real, notificaciones repetidas, pago pendiente/rechazado,
  importes erróneos, devolución y regreso con prefijo. Confirmar permisos RLS.
- Verificar SMTP/recuperación de cuenta, privacidad y términos. Definir valor del
  plan pagado y política de acceso; este cambio prepara cobro y vigencia, no
  restringe caja/fiados offline ni convierte automáticamente el piloto en negocio.
- Solo después habilitar funciones live y pantalla. Merge despliega el frontend
  por GitHub Pages, pero no despliega funciones ni aplica SQL.

## Recuperación

Si el proveedor creó la preferencia y se perdió la respuesta, el pedido queda
`creating`. El reintento no crea otra preferencia: responde revisión pendiente.
Comprobar en proveedor por `external_reference`, guardar preferencia recuperada
con service_role o dejar vencer antes de un nuevo pedido. No borrar pedidos ni
suponer que no hubo cobro. Dos pagos distintos para un mismo pedido quedan
bloqueados para revisión; no conceder doble acceso ni refund automático.

Webhook que no puede guardar devuelve 503 para reintento del proveedor. Conciliar
notificaciones agotadas por pago consultado al proveedor y mismo RPC; no activar
desde una captura o parámetro de URL. Refund parcial suspende ese pedido para
revisión, de forma conservadora. Al borrar la cuenta (`borrar-cuenta` +
`03-legal-y-cuenta.sql`) los pedidos se conservan para SUNAT sin dueño
(`merchant_id` nulo); un pago que llegue después queda como pedido huérfano para
devolverlo a mano. Desde 03 la vigencia se recalcula entera desde los pedidos
pagados: no edites `subscription_ends_at` a mano, usa `aplicar_pago_membresia`.

## Pruebas

`npm test` ejecuta handlers y adaptador REST con proveedores falsos, sin red.
CI además ejecuta `test/payment-schema.sql` (02 + 03) y `test/cuenta-schema.sql`
(01 → 02 → 03 → 03) en Postgres descartable: restricciones, permisos, reserva,
idempotencia, renovación, devolución, borrado de cuenta y reclamos. Guion del
sandbox: [sandbox-mercadopago.md](sandbox-mercadopago.md). No correr ese fixture
en una base real. `npx tsc --noEmit`, `npm run lint` y `npm run build` verifican app.

Fuentes consultadas 2026-10-02:
[Mercado Pago: notificaciones](https://www.mercadopago.com.pe/developers/en/docs/checkout-pro-orders/resources/notifications/webhooks),
[Supabase: funciones y autenticación](https://supabase.com/docs/guides/functions/auth).
