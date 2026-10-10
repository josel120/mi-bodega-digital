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
-- 05 agrega el plan fundador y reemplaza reservar_membresia y recalcular_vigencia; corre dos veces (idempotente).
\ir ../supabase/05-plan-fundador.sql
\ir ../supabase/05-plan-fundador.sql

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
insert into public.merchants (id, user_id, business_name, subscription_status, trial_ends_at, subscription_ends_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Prueba', 'active_yearly', '2099-01-01', '2099-01-01');
update public.merchants set subscription_status = 'active_yearly', subscription_ends_at = '2099-01-01';
do $$ begin
  if exists(select 1 from public.merchants where subscription_status <> 'trial' or subscription_ends_at is not null or trial_ends_at > now() + interval '15 days') then raise exception 'Usuario pudo regalarse plan'; end if;
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

-- Plan fundador (05): precio, cupo de 30 bodegas, retención y renovación.
begin;
-- La fecha de cierre (D3) es real: pasado 2026-12-31 estos casos no pueden depender de now().
-- Dentro de esta transacción (se deshace con rollback) el cierre se corre al año 2100;
-- los casos de fechas están en los bloques de más abajo y pasan la hora a mano.
create or replace function public.cierre_fundador() returns timestamptz language sql immutable
  as $$ select timestamptz '2100-01-01 00:00:00-05' $$;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- 31 bodegas: M01 (aaaa…0001) a M31; los uuid se derivan del número.
insert into public.merchants (id, user_id, business_name)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Bodega ' || n
  from generate_series(1, 33) n;
do $$ declare r jsonb; v_exp timestamptz; v_vigencia timestamptz; v_estado text; v_creado timestamptz; v_vence timestamptz; begin
  -- Mensual y anual no cambian de precio.
  insert into public.membership_orders(id, merchant_id, plan_type, amount, status)
    values ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000033', 'monthly', 29, 'refunded'),
           ('a0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000033', 'yearly', 279, 'refunded');
  -- Precios cruzados y montos ajenos se rechazan en la base.
  for v_estado in select unnest(array['founder,18', 'founder,29', 'founder,0', 'founder,19.01', 'monthly,19', 'yearly,19', 'monthly,28', 'weekly,19']) loop
    begin
      insert into public.membership_orders(id, merchant_id, plan_type, amount)
        values (gen_random_uuid(), '00000000-0000-4000-8000-000000000033', split_part(v_estado, ',', 1), split_part(v_estado, ',', 2)::numeric);
      raise exception 'Precio aceptado: %', v_estado;
    exception when check_violation then null; end;
  end loop;
  begin perform public.reservar_membresia('10000000-0000-4000-8000-000000000033', 'founders', gen_random_uuid()); raise exception 'Plan raro aceptado';
  exception when raise_exception then if sqlerrm <> 'Plan inválido' then raise; end if; end;

  -- Fundador a S/ 19, un mes, y la bodega queda con plan mensual activo.
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000001', 'founder', 'b0000000-0000-4000-8000-000000000001');
  if r->>'created' <> 'true' or (r->'order'->>'amount')::numeric <> 19 or r->'order'->>'plan_type' <> 'founder' then raise exception 'Reserva fundador: %', r; end if;
  select created_at, expires_at into v_creado, v_vence from public.membership_orders where id = 'b0000000-0000-4000-8000-000000000001';
  if v_vence - v_creado <> interval '30 minutes' then raise exception 'Retención distinta de 30 minutos'; end if;
  perform public.aplicar_pago_membresia('b0000000-0000-4000-8000-000000000001', '9001', 'approved', now());
  select subscription_ends_at, subscription_status into v_vigencia, v_estado from public.merchants where id = '00000000-0000-4000-8000-000000000001';
  if v_vigencia <> now() + interval '1 month' or v_estado <> 'active_monthly' then raise exception 'Vigencia fundador: % %', v_vigencia, v_estado; end if;

  -- M02..M30 pagan fundador: con M01 son 30 bodegas.
  for i in 2..30 loop
    insert into public.membership_orders(id, merchant_id, plan_type, amount, status, payment_id, approved_at)
      values (gen_random_uuid(), ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'founder', 19, 'paid', (9000 + i)::text, now());
  end loop;
  -- Dos pedidos de la misma bodega cuentan una sola vez.
  insert into public.membership_orders(id, merchant_id, plan_type, amount, status, payment_id, approved_at)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'founder', 19, 'paid', '9102', now());
  if public.fundadores_ocupados() <> 30 then raise exception 'Conteo de bodegas distintas: %', public.fundadores_ocupados(); end if;

  -- La 31.ª bodega no entra; ni siquiera crea un pedido.
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000031', 'founder', 'b0000000-0000-4000-8000-000000000031');
  if r->>'sold_out' <> 'true' or r->>'created' <> 'false' or r ? 'order' then raise exception 'La 31.ª entró: %', r; end if;
  if exists(select 1 from public.membership_orders where id = 'b0000000-0000-4000-8000-000000000031') then raise exception 'Se creó pedido sin cupo'; end if;
  -- Las demás opciones siguen abiertas para la bodega sin cupo fundador.
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000031', 'monthly', 'b0000000-0000-4000-8000-0000000000a1');
  if (r->'order'->>'amount')::numeric <> 29 then raise exception 'Mensual cambió: %', r; end if;
  update public.membership_orders set status = 'refunded' where id = 'b0000000-0000-4000-8000-0000000000a1';

  -- Una bodega fundadora sigue comprando a S/ 19 con los 30 cupos tomados.
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000001', 'founder', 'b0000000-0000-4000-8000-000000000101');
  if r->>'created' <> 'true' or (r->'order'->>'amount')::numeric <> 19 then raise exception 'Fundador no pudo renovar: %', r; end if;
  perform public.aplicar_pago_membresia('b0000000-0000-4000-8000-000000000101', '9201', 'approved', now());
  select subscription_ends_at into v_vigencia from public.merchants where id = '00000000-0000-4000-8000-000000000001';
  if v_vigencia <> now() + interval '2 months' then raise exception 'Renovación fundador sin apilar: %', v_vigencia; end if;
  if public.fundadores_ocupados() <> 30 then raise exception 'Renovar no debe gastar otro cupo'; end if;

  -- Devolver un pedido libera el cupo (M30) y se retiene 30 minutos para quien lo pide.
  update public.membership_orders set status = 'refunded' where merchant_id = '00000000-0000-4000-8000-000000000030';
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000031', 'founder', 'b0000000-0000-4000-8000-000000000032');
  if r->>'created' <> 'true' then raise exception 'Cupo liberado no se pudo tomar: %', r; end if;
  -- Con el cupo retenido por un pedido en curso, la siguiente persona no puede apartar el mismo.
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000032', 'founder', 'b0000000-0000-4000-8000-000000000033');
  if r->>'sold_out' <> 'true' then raise exception 'Retención no cuenta: %', r; end if;
  -- Quien ya tiene su pedido en curso lo recupera, sin gastar otro cupo.
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000031', 'founder', 'b0000000-0000-4000-8000-000000000034');
  if r->>'created' <> 'false' or r->'order'->>'id' <> 'b0000000-0000-4000-8000-000000000032' then raise exception 'Pedido en curso no se reutilizó: %', r; end if;
  -- Al vencer la retención, el cupo vuelve a estar libre.
  update public.membership_orders set expires_at = now() - interval '1 minute' where id = 'b0000000-0000-4000-8000-000000000032';
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000032', 'founder', 'b0000000-0000-4000-8000-000000000033');
  if r->>'created' <> 'true' then raise exception 'Retención vencida seguía ocupando: %', r; end if;

  -- D2: 6 meses fundador por bodega. M02 ya tiene 2 pagados; con 4 más llega a 6 y el 7.º se rechaza.
  for i in 1..4 loop
    insert into public.membership_orders(id, merchant_id, plan_type, amount, status, payment_id, approved_at)
      values (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'founder', 19, 'paid', (9400 + i)::text, now());
  end loop;
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000002', 'founder', 'b0000000-0000-4000-8000-000000000201');
  if r->>'founder_ended' <> 'true' or r->>'created' <> 'false' or r ? 'order' then raise exception 'Séptimo mes fundador: %', r; end if;
  if exists(select 1 from public.membership_orders where id = 'b0000000-0000-4000-8000-000000000201') then raise exception 'Pedido de más'; end if;
  -- Mensual y anual siguen disponibles para quien agotó sus 6 meses.
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000002', 'yearly', 'b0000000-0000-4000-8000-000000000202');
  if (r->'order'->>'amount')::numeric <> 279 then raise exception 'Anual tras 6 meses: %', r; end if;
  update public.membership_orders set status = 'refunded' where id = 'b0000000-0000-4000-8000-000000000202';
  -- Una devolución no cuenta como mes usado: con 5 pagados + 1 devuelto aún puede comprar el 6.º.
  update public.membership_orders set status = 'refunded'
   where id = (select id from public.membership_orders where merchant_id = '00000000-0000-4000-8000-000000000002' and plan_type = 'founder' and status = 'paid' limit 1);
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000002', 'founder', 'b0000000-0000-4000-8000-000000000203');
  if r->>'created' <> 'true' then raise exception 'Devuelto contó como mes: %', r; end if;
  -- El pedido en curso ya cuenta como 6.º mes: no puede comprar otro en paralelo.
  if public.decidir_fundador('00000000-0000-4000-8000-000000000002') <> 'ended' then raise exception 'Pedido en curso no cuenta como mes'; end if;
  if public.meses_fundador_usados('00000000-0000-4000-8000-000000000002') <> 6 then raise exception 'Meses usados: %', public.meses_fundador_usados('00000000-0000-4000-8000-000000000002'); end if;

  -- Contracargo de un fundador libera su cupo y su vigencia.
  perform public.aplicar_pago_membresia('b0000000-0000-4000-8000-000000000033', '9301', 'approved', now());
  if public.fundadores_ocupados() <> 30 then raise exception 'Conteo final: %', public.fundadores_ocupados(); end if;
  perform public.aplicar_pago_membresia('b0000000-0000-4000-8000-000000000033', '9301', 'charged_back', now());
  if public.fundadores_ocupados() <> 29 then raise exception 'Contracargo no liberó cupo'; end if;
end $$;

-- La pantalla lee cifras sin ver pedidos ajenos ni poder reservar.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
do $$ declare e jsonb; begin
  e := public.estado_fundador();
  if (e->>'cap')::int <> 30 or (e->>'is_founder')::boolean is not true or (e->>'can_buy')::boolean is not true then raise exception 'estado_fundador (fundador): %', e; end if;
  if has_function_privilege('authenticated', 'public.fundadores_ocupados(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.reservar_membresia(uuid,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.estado_fundador()', 'execute') then raise exception 'Funciones de cupo expuestas'; end if;
  select public.estado_fundador() into e;
end $$;
reset role;
set local role service_role;
-- Con 30 ocupados y sin ser fundadora, can_buy es false.
do $$ begin
  update public.membership_orders set status = 'paid', approved_at = now(), payment_id = '9999'
   where merchant_id = '00000000-0000-4000-8000-000000000030' and status = 'refunded' and plan_type = 'founder';
  if public.fundadores_ocupados() <> 30 then raise exception 'Preparación del estado agotado'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000031"}', true);
do $$ declare e jsonb; begin
  e := public.estado_fundador();
  if (e->>'remaining')::int <> 0 or (e->>'can_buy')::boolean is not false or (e->>'is_founder')::boolean is not false then raise exception 'estado_fundador (agotado): %', e; end if;
end $$;
rollback;

-- D3: cierre de cupos nuevos el 2026-12-31 (Lima). No depende de la fecha de hoy: decidir_fundador recibe la hora.
begin;
insert into public.merchants (id, user_id, business_name)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Bodega ' || n
  from generate_series(1, 3) n;
-- M01 ya es fundadora (1 mes pagado); M02 es nueva; M03 tiene 6 meses pagados.
insert into public.membership_orders(id, merchant_id, plan_type, amount, status, payment_id, approved_at)
  values (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'founder', 19, 'paid', '8001', '2026-11-01');
insert into public.membership_orders(id, merchant_id, plan_type, amount, status, payment_id, approved_at)
  select gen_random_uuid(), '00000000-0000-4000-8000-000000000003', 'founder', 19, 'paid', (8100 + i)::text, '2026-11-01' from generate_series(1, 6) i;
do $$ declare m1 uuid := '00000000-0000-4000-8000-000000000001'; m2 uuid := '00000000-0000-4000-8000-000000000002'; m3 uuid := '00000000-0000-4000-8000-000000000003'; begin
  if public.cierre_fundador() <> '2027-01-01 00:00:00-05'::timestamptz or public.cierre_fundador() <> '2027-01-01 05:00:00+00'::timestamptz then raise exception 'Cierre mal definido'; end if;
  if public.meses_fundador() <> 6 or public.cupo_fundador() <> 30 then raise exception 'Reglas mal definidas'; end if;
  -- Última hora de plazo: bodega nueva todavía entra.
  if public.decidir_fundador(m2, '2026-12-31 23:59:59-05') <> 'ok' then raise exception 'Cierre anticipado'; end if;
  -- Un segundo después: bodega nueva queda fuera.
  if public.decidir_fundador(m2, '2027-01-01 00:00:00-05') <> 'closed' then raise exception 'Bodega nueva entró tarde'; end if;
  if public.decidir_fundador(null, '2027-06-01 00:00:00-05') <> 'closed' then raise exception 'Sin bodega entró tarde'; end if;
  -- La bodega que ya era fundadora sigue hasta usar 6 meses, después de la fecha.
  if public.decidir_fundador(m1, '2027-02-01') <> 'ok' then raise exception 'Fundadora cortada por la fecha'; end if;
  if public.decidir_fundador(m3, '2027-02-01') <> 'ended' then raise exception 'Séptimo mes tras la fecha'; end if;
  if public.decidir_fundador(m3, '2026-10-10') <> 'ended' then raise exception 'Séptimo mes antes de la fecha'; end if;
end $$;
-- Con la reserva real: cierre en el pasado => bodega nueva `founder_closed`, fundadora sigue.
create or replace function public.cierre_fundador() returns timestamptz language sql immutable
  as $$ select timestamptz '2020-01-01 00:00:00-05' $$;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ declare r jsonb; begin
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000002', 'founder', 'c0000000-0000-4000-8000-000000000001');
  if r->>'founder_closed' <> 'true' or r->>'created' <> 'false' or r ? 'order' then raise exception 'Reserva tardía de bodega nueva: %', r; end if;
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000001', 'founder', 'c0000000-0000-4000-8000-000000000002');
  if r->>'created' <> 'true' then raise exception 'Fundadora no pudo renovar tras la fecha: %', r; end if;
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000003', 'founder', 'c0000000-0000-4000-8000-000000000003');
  if r->>'founder_ended' <> 'true' then raise exception 'Séptimo mes tras la fecha (reserva): %', r; end if;
  r := public.reservar_membresia('10000000-0000-4000-8000-000000000002', 'monthly', 'c0000000-0000-4000-8000-000000000004');
  if (r->'order'->>'amount')::numeric <> 29 then raise exception 'Mensual tras cierre: %', r; end if;
end $$;
rollback;
