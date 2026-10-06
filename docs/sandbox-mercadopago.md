# Sandbox de Mercado Pago: guion de prueba

Preparado el 2026-10-06. **No se corrió**: todavía no hay credenciales de prueba
de Mercado Pago ni proyecto Supabase de prueba. Este guion lo sigue una persona
con permiso del dueño. Nada de esto toca el proyecto de producción
(`jvjcifyfepwhdmhnzzjo`) ni enciende `MOSTRAR_PLANES`.

Lo que sí está verificado sin red (2026-10-06):

- `01 → 02 → 03 → 03` aplican limpio en Postgres 18 (PGlite) sobre un Supabase
  simulado, y pasan `test/cuenta-schema.sql` y `test/payment-schema.sql`.
- Handlers del checkout, webhook y `borrar-cuenta` con proveedores falsos
  (`npm test`).
- La cuenta de vigencia de `scripts/verificar-sandbox.mjs` da lo mismo que
  Postgres (`timestamptz + interval` en UTC, fin de mes y bisiesto).

Lo que **solo** se puede comprobar acá: el formato de fechas que acepta Mercado
Pago (N2), si los pagos de usuarios de prueba vienen con `live_mode = false`,
la firma real de `x-signature`, y las devoluciones de verdad.

## 0. Permisos que hacen falta (los da el dueño)

| Qué | Quién | Por qué necesita OK |
|---|---|---|
| Crear proyecto Supabase de prueba (plan gratis) | dueño | crea un recurso |
| Crear app y cuentas de prueba en Mercado Pago Developers | dueño | cuenta del negocio |
| Cargar secretos de funciones en el proyecto de prueba | dueño o devops con OK | secretos |
| Desplegar funciones en el proyecto de prueba | devops con OK | despliegue |

Nada de esto usa plata real: las tarjetas de prueba no cobran.

## 1. Proyecto Supabase de prueba

1. En supabase.com crear un proyecto nuevo, por ejemplo `mi-bodega-sandbox`, región
   São Paulo. Anotar su `ref` (el pedazo antes de `.supabase.co`). **Nunca** usar
   el proyecto real.
2. Crear las tablas base. Las de producción no están versionadas (hallazgo S1):
   exportar el esquema real con *Database → Schema visualizer* o
   `supabase db dump --schema public` hecho por el dueño, y aplicarlo acá. Si
   todavía no se puede, usar como mínimo el bloque "Tablas base" de
   `test/cuenta-schema.sql` (desde `create table public.merchants` hasta los
   `grant`), **sin** las líneas de roles ni de `auth`: Supabase ya los trae.
3. En SQL Editor, en este orden, una sola vez cada uno:
   - `supabase/01-endurecer-esquema.sql` (su sección 0 borra filas `QA AUDIT%`:
     en un proyecto nuevo no hay ninguna).
   - `supabase/02-membresias-prepago.sql`
   - `supabase/03-legal-y-cuenta.sql` (se puede repetir sin daño).
4. Comprobar que el final de 03 devuelve `proteger_suscripcion` con
   `prosecdef = false` y la FK con `confdeltype = n`.
5. Authentication → Users: crear dos usuarios de prueba con correos propios del
   equipo (no mailinator: S8). Entrar con cada uno en la app de prueba (paso 3)
   para que se cree su bodega.

## 2. Mercado Pago: app, cuentas y tarjetas de prueba

1. developers.mercadopago.com → *Tus integraciones* → crear aplicación
   "Mi Bodega Digital sandbox", producto Checkout Pro, país Perú.
2. *Cuentas de prueba*: crear una **vendedora** y una **compradora**, país Perú.
   Las credenciales del integrador salen de entrar como la vendedora de prueba.
3. Anotar de la vendedora de prueba: Access Token y su **user id** (es el
   `collector_id`, no el id de la aplicación).
4. *Webhooks*: URL `https://<ref>.supabase.co/functions/v1/webhook-mercadopago`,
   evento **Pagos** (`payment`). Copiar la **clave secreta** que muestra. No
   activar IPN (no lleva firma).

Tarjetas y nombres de prueba: confirmarlos en la página oficial antes de usarlos
(no se pudo abrir desde este entorno; el proxy bloquea mercadopago.com.pe):
<https://www.mercadopago.com.pe/developers/es/docs/checkout-pro/integration-test/test-cards>.
Lo habitual en la documentación de Mercado Pago:

| Tarjeta | Número | CVV | Vence |
|---|---|---|---|
| Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
| Visa | 4009 1753 3280 6176 | 123 | 11/30 |

El **nombre del titular** decide el resultado: `APRO` aprobado, `OTHE`
rechazado, `CONT` pendiente, `FUND` fondos insuficientes. Documento: el que
indique la página para Perú.

## 3. Funciones y app de prueba

1. Secretos del proyecto de prueba (*Edge Functions → Secrets*), sin
   `NEXT_PUBLIC`:

   | Variable | Valor |
   |---|---|
   | `APP_URL` | URL de la app de prueba sin barra final (ver punto 3) |
   | `PAYMENTS_ENABLED` | `on` |
   | `PAYMENTS_MODE` | `test` |
   | `MERCADOPAGO_ACCESS_TOKEN` | token de la vendedora de prueba |
   | `MERCADOPAGO_COLLECTOR_ID` | user id de la vendedora de prueba |
   | `MERCADOPAGO_WEBHOOK_SECRET` | clave secreta del webhook |

   `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya los pone
   Supabase.
2. Desplegar `crear-preferencia`, `webhook-mercadopago` y `borrar-cuenta` con
   `supabase functions deploy <nombre> --project-ref <ref>` (respeta
   `supabase/config.toml`: `verify_jwt = false`, cada función verifica sola).
3. App: `npm run dev` con `.env.local` del proyecto de **prueba** y
   `MOSTRAR_PLANES = true` **solo en la copia local, sin commit**. Para ese caso
   `APP_URL=http://localhost:3000` no sirve (CORS exige origen exacto y Mercado
   Pago pide https para `back_urls`): usar un túnel https gratuito o una
   rama publicada aparte con OK del dueño. Decidirlo antes de empezar.

## 4. Matriz de pruebas

Variables para las consultas: `:pedido` es el `id` de `membership_orders` (es el
`external_reference` del pago), `:bodega` el `id` de `merchants`.

```sql
-- Estado de un pedido y su bodega (SQL Editor del proyecto de PRUEBA).
select o.id, o.plan_type, o.status, o.payment_id, o.approved_at, o.granted_until,
       m.subscription_status, m.subscription_ends_at
from membership_orders o left join merchants m on m.id = o.merchant_id
where o.id = ':pedido';

-- Todos los pedidos de la bodega, en el orden de la cadena de vigencia.
select id, plan_type, status, payment_id, approved_at, granted_until
from membership_orders where merchant_id = ':bodega'
order by approved_at nulls last;
```

Después de cada caso, además:

```bash
SANDBOX_SUPABASE_URL=https://<ref>.supabase.co \
SANDBOX_SUPABASE_SERVICE_ROLE_KEY=<service_role del proyecto de PRUEBA> \
node scripts/verificar-sandbox.mjs <caso> --pedido <uuid>
```

El script solo hace GET, se niega a correr contra producción y sale con 1 si
algo no cuadra. Para `apilado` e `invariantes` se pasa `--bodega <uuid>`.

| # | Caso | Cómo | Respuesta esperada | Estado esperado en la base | Script |
|---|---|---|---|---|---|
| 1 | Aprobado mensual | Plan → mensual, pagar con titular `APRO` | webhook 200 | pedido `paid`, `payment_id` numérico, `granted_until = approved_at + 1 mes`; bodega `active_monthly`, `subscription_ends_at = granted_until` | `aprobado` |
| 2 | Rechazado | otro pedido, titular `OTHE` | 200 `{ignored}` | pedido `pending`, sin `payment_id`; bodega igual que antes | `rechazado` |
| 3 | Pendiente | titular `CONT` | 200 `{ignored}` | igual que 2 | `pendiente` |
| 4 | Duplicado / replay | Reenviar la notificación del caso 1 desde *Webhooks → historial* (o esperar los reintentos de Mercado Pago) | 200 `{received}` | sin cambios respecto al caso 1: la vigencia **no** se alarga | `duplicado` |
| 5 | Firma inválida | `curl -X POST "https://<ref>.supabase.co/functions/v1/webhook-mercadopago?data.id=<pago caso 1>&type=payment" -H "x-request-id: prueba" -H "x-signature: ts=1,v1=$(printf '0%.0s' {1..64})"` | **401** | ningún cambio | `firma-invalida` sobre un pedido pendiente |
| 6 | Monto alterado | Con el token de prueba, crear a mano una preferencia de S/ 1 con `external_reference` = un pedido pendiente y pagarla con `APRO` | **422** | pedido sigue `pending` sin `payment_id` | `monto-alterado` |
| 7 | Moneda alterada | No se puede en Perú (la cuenta solo cobra PEN) | — | cubierto por `npm test` | — |
| 8 | Reembolso | `POST https://api.mercadopago.com/v1/payments/<pago>/refunds` con el token de prueba | 200 | pedido `refunded`; bodega recalculada **sin** sus meses | `reembolso` |
| 9 | Contracargo | El sandbox no los genera. Simularlo en SQL Editor: `select aplicar_pago_membresia(':pedido', '<pago>', 'charged_back', null);` (con 03 ya no lo revierte el trigger) | — | pedido `charged_back`; bodega recalculada | `contracargo` |
| 10 | Anual + mensual apilados | Pagar mensual (A) y luego anual (B) con `APRO`; después reembolsar A | 200 | antes: `ends_at = A.approved + 1 mes + 12 meses`; tras reembolsar A: `ends_at = B.approved + 12 meses` (bug S6 corregido) | `apilado --bodega` y `reembolso --pedido A` |
| 11 | Regreso con prefijo | Al volver del checkout | — | la URL es `<APP_URL>/subscription/?payment=success` y la pantalla dice «comprobando», no activa nada | manual |
| 12 | Borrar cuenta | Con el usuario 2: Cuenta → Borrar → escribir BORRAR | 200 | sin filas en `merchants`, `transactions`, `customers_debts`, `debt_sync_ops` de esa bodega; sus pedidos con `merchant_id null`, `checkout_url null`, `account_deleted_at` puesto; usuario fuera de Authentication | consultas abajo |
| 13 | Libro de Reclamaciones | `/reclamaciones` sin sesión | constancia `MBD-AAAA-000001` | fila en `complaints`; con la clave publishable `select` sobre `complaints` da error de permisos | consultas abajo |

```sql
-- Caso 12 (cambiar el uuid del usuario borrado).
select (select count(*) from merchants where user_id = ':usuario') as bodegas,
       (select count(*) from membership_orders where account_deleted_at is not null) as pedidos_sin_dueno;

-- Caso 13: el dueño lee las hojas aquí (Table Editor o SQL). Las marcadas
-- posible_spam se revisan primero, pero también se responden.
select codigo, tipo, email, posible_spam, created_at, estado from complaints order by correlativo desc;
```

Si el caso 1 da **422** en vez de 200: consultar el pago con
`GET https://api.mercadopago.com/v1/payments/<id>` y el token de prueba, y
comparar `live_mode` (debe ser `false` con `PAYMENTS_MODE=test`),
`collector_id`, `currency_id` y `transaction_amount`. Hoy el webhook no deja log
del motivo (S5): es lo primero que conviene agregar si pasa.

Si `crear-preferencia` responde 503: revisar en los logs de la función si Mercado
Pago rechazó `expiration_date_from/to` (N2: van con microsegundos y `+00:00`).

## 5. Criterio de salida

Todos los casos 1–13 con el resultado esperado, el script en `OK` para cada uno,
y el detalle anotado (fecha, ids de pago, capturas de la respuesta del webhook)
en la revisión de pagos. Recién con eso y el OK del dueño se piensa en
`PAYMENTS_MODE=live`, con token de producción distinto del de prueba.

## Pendientes conocidos

- S5: log sin datos personales del motivo de cada 422/503 del webhook.
- Freno por IP o captcha para el Libro de Reclamaciones (hoy solo se marca
  `posible_spam`, nunca se rechaza). Cualquier herramienta nueva (por ejemplo,
  un captcha gratuito) pasa antes por evaluación.
- Copia de la hoja de reclamación al correo del consumidor: necesita un
  proveedor de correo (SMTP) que hoy no hay.
