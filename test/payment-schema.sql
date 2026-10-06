\set ON_ERROR_STOP on
-- Base descartable de CI; nunca ejecutar este fixture en el proyecto real.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
create table public.merchants (
  id uuid primary key, user_id uuid not null unique,
  business_name text not null, subscription_status text not null default 'trial',
  trial_ends_at timestamptz default now() + interval '7 days', created_at timestamptz default now()
);
grant select, insert, update on public.merchants to authenticated, service_role;

\ir ../supabase/02-membresias-prepago.sql
-- 03 reemplaza el candado y la aplicación de pagos: los mismos casos deben seguir pasando.
\ir ../supabase/03-legal-y-cuenta.sql

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
insert into public.merchants (id, user_id, business_name, subscription_status, trial_ends_at, subscription_ends_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Prueba', 'active_yearly', '2099-01-01', '2099-01-01');
update public.merchants set subscription_status = 'active_yearly', subscription_ends_at = '2099-01-01';
do $$ begin
  if exists(select 1 from public.merchants where subscription_status <> 'trial' or subscription_ends_at is not null or trial_ends_at > now() + interval '8 days') then raise exception 'Usuario pudo regalarse plan'; end if;
  if has_function_privilege('authenticated', 'public.aplicar_pago_membresia(uuid,text,text,timestamptz)', 'execute') then raise exception 'RPC de pagos expuesto'; end if;
  if has_function_privilege('anon', 'public.reservar_membresia(uuid,text,uuid)', 'execute') then raise exception 'Reserva expuesta'; end if;
  if has_table_privilege('authenticated', 'public.membership_orders', 'insert') then raise exception 'Pedidos editables'; end if;
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare first jsonb; second jsonb; expiry timestamptz; repeat_expiry timestamptz; begin
  first := public.reservar_membresia('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'monthly', '11111111-1111-4111-8111-111111111111');
  second := public.reservar_membresia('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'monthly', '22222222-2222-4222-8222-222222222222');
  if first->>'created' <> 'true' or second->>'created' <> 'false' or first->'order'->>'id' <> second->'order'->>'id' then raise exception 'Reserva duplicada'; end if;
  perform public.aplicar_pago_membresia('11111111-1111-4111-8111-111111111111', '123', 'approved', now());
  select subscription_ends_at into expiry from public.merchants;
  if expiry <> now() + interval '1 month' then raise exception 'Periodo mensual incorrecto'; end if;
  perform public.aplicar_pago_membresia('11111111-1111-4111-8111-111111111111', '123', 'approved', now());
  select subscription_ends_at into repeat_expiry from public.merchants;
  if repeat_expiry <> expiry then raise exception 'Webhook prolongó dos veces'; end if;
  begin
    perform public.aplicar_pago_membresia('11111111-1111-4111-8111-111111111111', '456', 'approved', now());
    raise exception 'Segundo pago no se bloqueó';
  exception when raise_exception then
    if sqlerrm <> 'Pedido con otro pago: revisar cobro duplicado' then raise; end if;
  end;
  first := public.reservar_membresia('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'yearly', '33333333-3333-4333-8333-333333333333');
  perform public.aplicar_pago_membresia('33333333-3333-4333-8333-333333333333', '789', 'approved', now());
  select subscription_ends_at into repeat_expiry from public.merchants;
  if repeat_expiry <> expiry + interval '12 months' then raise exception 'Renovación anual incorrecta'; end if;
  perform public.aplicar_pago_membresia('33333333-3333-4333-8333-333333333333', '789', 'refunded', now());
  select subscription_ends_at into repeat_expiry from public.merchants;
  if repeat_expiry <> expiry then raise exception 'Devolución borró otro pago'; end if;
  perform public.aplicar_pago_membresia('11111111-1111-4111-8111-111111111111', '123', 'charged_back', now());
  if exists(select 1 from public.merchants where subscription_ends_at is not null or subscription_status <> 'inactive') then raise exception 'Contracargo no revocó'; end if;
end $$;
rollback;
