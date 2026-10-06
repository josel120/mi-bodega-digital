\set ON_ERROR_STOP on
-- Base descartable de CI; nunca ejecutar este fixture en el proyecto real.
-- Aplica 01 → 02 → 03 → 03 (idempotencia) sobre un Supabase mínimo simulado y
-- comprueba: candado del plan por rol (S3), vigencia sin meses de pedidos
-- devueltos (S6), borrado de cuenta con pedidos conservados (S2) y Libro de
-- Reclamaciones sin lectura anónima.

-- Lo mínimo de Supabase: roles de la API, auth.users y auth.uid().
-- Los roles son de todo el servidor: en CI ya los creó payment-schema.sql.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated, service_role;

-- Tablas base tal como las usa la app (src/types/database.ts). Las políticas
-- reales no están versionadas (S1): estas son una reconstrucción para probar.
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  business_name text not null,
  yape_number text,
  currency text not null default 'S/',
  subscription_status text not null default 'trial',
  trial_ends_at timestamptz default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id),
  type text not null,
  amount numeric(12,2) not null,
  description text,
  payment_method text not null default 'Efectivo',
  created_at timestamptz not null default now()
);
create table public.customers_debts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id),
  customer_name text not null,
  phone_number text,
  balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.merchants enable row level security;
alter table public.transactions enable row level security;
alter table public.customers_debts enable row level security;
create policy merchants_propias on public.merchants for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_propias on public.transactions for all to authenticated
  using (merchant_id in (select id from public.merchants where user_id = auth.uid()));
create policy customers_debts_propias on public.customers_debts for all to authenticated
  using (merchant_id in (select id from public.merchants where user_id = auth.uid()));
grant select, insert, update, delete on public.merchants, public.transactions, public.customers_debts to authenticated;
grant all on public.merchants, public.transactions, public.customers_debts to service_role;

\ir ../supabase/01-endurecer-esquema.sql
\ir ../supabase/02-membresias-prepago.sql
\ir ../supabase/03-legal-y-cuenta.sql
\ir ../supabase/03-legal-y-cuenta.sql

-- Datos: dos cuentas con su bodega. U1 = aaaa…, U2 = cccc….
insert into auth.users values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'uno@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dos@example.test');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
insert into public.merchants (id, user_id, business_name, subscription_status, trial_ends_at, subscription_ends_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bodega Uno', 'active_yearly', '2099-01-01', '2099-01-01');
-- Un claim falsificado ya no sirve: decide el rol real de la conexión.
select set_config('request.jwt.claims', '{"role":"service_role","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
update public.merchants set subscription_status = 'active_yearly', subscription_ends_at = '2099-01-01';
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}', true);
insert into public.merchants (id, user_id, business_name)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Bodega Dos');
insert into public.transactions (merchant_id, type, amount) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'income', 10);
insert into public.customers_debts (merchant_id, customer_name, phone_number, balance)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Cliente de Dos', '999999999', 5);
commit;

do $$ begin
  if exists(select 1 from public.merchants where subscription_status <> 'trial' or subscription_ends_at is not null or trial_ends_at > now() + interval '8 days') then
    raise exception 'S3: el navegador pudo regalarse el plan';
  end if;
  if (select prosecdef from pg_proc where proname = 'proteger_suscripcion') then raise exception 'S3: el trigger sigue siendo security definer'; end if;
  if has_function_privilege('authenticated', 'public.borrar_datos_bodega(uuid)', 'execute') then raise exception 'Borrado expuesto al navegador'; end if;
  if has_function_privilege('anon', 'public.recalcular_vigencia(uuid)', 'execute') then raise exception 'Recalculo expuesto'; end if;
end $$;

-- S3: desde el SQL Editor (postgres, sin claims) la conciliación manual sí
-- cambia la vigencia. Con 02 el trigger la revertía en silencio.
select set_config('request.jwt.claims', '', false);
do $$ declare r jsonb; fin timestamptz; begin
  r := public.reservar_membresia('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'monthly', '11111111-1111-4111-8111-111111111111');
  perform public.aplicar_pago_membresia('11111111-1111-4111-8111-111111111111', '100', 'approved', now() - interval '1 minute');
  select subscription_ends_at into fin from public.merchants where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if fin is distinct from now() - interval '1 minute' + interval '1 month' then raise exception 'S3: conciliación manual revertida (%)', fin; end if;
  -- Corrección manual del dueño por SQL directo: también pasa.
  update public.merchants set business_name = 'Bodega Uno SAC' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
end $$;

-- S6: A (aprobado antes) y B (después) apilados; devolver A recorta B.
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare r jsonb; fin timestamptz; estado text; v_a timestamptz; begin
  -- Hora de aprobación de A, leída de la tabla: now() cambia entre transacciones.
  select approved_at into v_a from public.membership_orders where id = '11111111-1111-4111-8111-111111111111';
  r := public.reservar_membresia('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'yearly', '22222222-2222-4222-8222-222222222222');
  if r->>'created' <> 'true' then raise exception 'Reserva B no creada'; end if;
  perform public.aplicar_pago_membresia('22222222-2222-4222-8222-222222222222', '200', 'approved', now());
  select subscription_ends_at, subscription_status into fin, estado from public.merchants where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if fin <> v_a + interval '1 month' + interval '12 months' or estado <> 'active_yearly' then raise exception 'Apilado mensual+anual incorrecto (%)', fin; end if;
  -- Reintento del webhook: no suma.
  perform public.aplicar_pago_membresia('22222222-2222-4222-8222-222222222222', '200', 'approved', now());
  if (select subscription_ends_at from public.merchants where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> fin then raise exception 'Replay prolongó'; end if;
  -- Devolver A (el mensual, anterior): B ya no cuenta su mes.
  perform public.aplicar_pago_membresia('11111111-1111-4111-8111-111111111111', '100', 'refunded', null);
  select subscription_ends_at into fin from public.merchants where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if fin <> now() + interval '12 months' then raise exception 'S6: B conserva los meses de A devuelto (%)', fin; end if;
  if (select granted_until from public.membership_orders where id = '22222222-2222-4222-8222-222222222222') <> fin then raise exception 'granted_until de B sin recalcular'; end if;
  -- Contracargo de B: sin pedidos válidos la bodega queda inactiva.
  perform public.aplicar_pago_membresia('22222222-2222-4222-8222-222222222222', '200', 'charged_back', null);
  select subscription_ends_at, subscription_status into fin, estado from public.merchants where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if fin is not null or estado <> 'inactive' then raise exception 'Contracargo no revocó'; end if;
  -- Un pago devuelto no vuelve a activarse con un webhook viejo de aprobado.
  r := public.aplicar_pago_membresia('22222222-2222-4222-8222-222222222222', '200', 'approved', now());
  if r->>'ignored' <> 'true' then raise exception 'Aprobado tardío reactivó pedido devuelto'; end if;
end $$;
-- Notificaciones fuera de orden: el pago aprobado antes manda en la cadena.
do $$ declare r jsonb; fin timestamptz; begin
  r := public.reservar_membresia('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'monthly', '33333333-3333-4333-8333-333333333333');
  perform public.aplicar_pago_membresia('33333333-3333-4333-8333-333333333333', '300', 'approved', now());
  r := public.reservar_membresia('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'monthly', '44444444-4444-4444-8444-444444444444');
  perform public.aplicar_pago_membresia('44444444-4444-4444-8444-444444444444', '400', 'approved', now() - interval '2 days');
  select subscription_ends_at into fin from public.merchants where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if fin <> now() - interval '2 days' + interval '1 month' + interval '1 month' then raise exception 'Cadena fuera de orden incorrecta (%)', fin; end if;
  -- Un pedido pendiente para comprobar que el borrado no se traba con él.
  r := public.reservar_membresia('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'yearly', '55555555-5555-4555-8555-555555555555');
end $$;
commit;

-- Datos de la bodega U1 para borrar, incluida la bitácora de fiados de 01.
insert into public.transactions (merchant_id, type, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'income', 12.5);
insert into public.customers_debts (id, merchant_id, customer_name, phone_number, balance)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Doña Rosa', '987654321', 20);
select public.aplicar_movimiento_fiado('ffffffff-ffff-4fff-8fff-ffffffffffff', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', -5);
update public.membership_orders set status = 'pending', checkout_url = 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=test'
 where id = '55555555-5555-4555-8555-555555555555';

-- S2: borrar la cuenta U1.
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare r jsonb; begin
  r := public.borrar_datos_bodega('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if (r->>'merchants')::int <> 1 or (r->>'orders_detached')::int <> 5 then raise exception 'Borrado incompleto: %', r; end if;
  -- Reintento (la función murió antes de borrar Auth): no falla.
  r := public.borrar_datos_bodega('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if (r->>'merchants')::int <> 0 then raise exception 'Reintento de borrado: %', r; end if;
end $$;
commit;

do $$ declare r jsonb; begin
  if exists(select 1 from public.merchants where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'Quedó la bodega'; end if;
  if exists(select 1 from public.transactions where merchant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then raise exception 'Quedaron ventas'; end if;
  if exists(select 1 from public.customers_debts where merchant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then raise exception 'Quedaron fiados'; end if;
  if exists(select 1 from public.debt_sync_ops where merchant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then raise exception 'Quedó la bitácora'; end if;
  if (select count(*) from public.membership_orders) <> 5 then raise exception 'Se borraron pedidos que SUNAT necesita'; end if;
  if exists(select 1 from public.membership_orders where merchant_id is not null or checkout_url is not null or account_deleted_at is null) then raise exception 'Pedidos sin anonimizar'; end if;
  if (select payment_id from public.membership_orders where id = '22222222-2222-4222-8222-222222222222') <> '200' then raise exception 'Se perdió el id de pago'; end if;
  -- La otra cuenta sigue intacta.
  if (select count(*) from public.transactions where merchant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 1
     or (select count(*) from public.customers_debts where merchant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 1 then
    raise exception 'El borrado tocó otra bodega';
  end if;
  -- Webhook tardío sobre un pedido sin dueño: queda anotado, no revienta.
  r := public.aplicar_pago_membresia('55555555-5555-4555-8555-555555555555', '500', 'approved', now());
  if r->>'orphan' <> 'true' then raise exception 'Pago huérfano mal tratado: %', r; end if;
end $$;
-- Ya sin bodega, la API de Auth puede borrar al usuario (FK de merchants).
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
-- Y borrar una bodega directo ya no choca con `on delete restrict`.
insert into public.membership_orders (id, merchant_id, plan_type, amount, status)
values ('66666666-6666-4666-8666-666666666666', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'monthly', 29, 'refunded');
delete from public.customers_debts where merchant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
delete from public.transactions where merchant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
delete from public.merchants where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
do $$ begin
  if (select merchant_id from public.membership_orders where id = '66666666-6666-4666-8666-666666666666') is not null then raise exception 'FK sin set null'; end if;
end $$;

-- Libro de Reclamaciones: el navegador anónimo registra y recibe su
-- constancia, pero no lee nada.
\ir reclamos-schema.sql
