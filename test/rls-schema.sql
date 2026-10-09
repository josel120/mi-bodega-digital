\set ON_ERROR_STOP on
-- Base descartable de CI con usuarios sintéticos; nunca ejecutar en el proyecto real.
-- S1: aislamiento A/B de RLS. Aplica 00 (políticas base) y 01 (debt_sync_ops y
-- aplicar_movimiento_fiado) sobre un Supabase mínimo simulado, comprueba que A no lee,
-- escribe ni llama la RPC sobre filas de B (y viceversa), y que borrar, abrir a "true"
-- o desactivar RLS de cualquier política hace fallar la prueba (mutaciones).

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
-- Como Supabase: toda tabla nueva de public nace con permisos para los tres roles de la API.
-- Lo único que separa a las bodegas es entonces RLS (y el revoke a anon de 00).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- Tablas base sin RLS ni políticas (esquema de la app, src/types/database.ts).
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

\ir ../supabase/00-rls-base.sql
\ir ../supabase/01-endurecer-esquema.sql
-- Idempotencia de 00: segunda pasada sin error.
\ir ../supabase/00-rls-base.sql

-- Datos sintéticos: A = aaaa…, B = cccc….
insert into auth.users values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'b@example.test');
insert into public.merchants (id, user_id, business_name) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bodega A'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Bodega B');
insert into public.transactions (id, merchant_id, type, amount) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'income', 10),
  ('b1b1b1b1-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'income', 20);
insert into public.customers_debts (id, merchant_id, customer_name, phone_number, balance) values
  ('a2a2a2a2-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Cliente de A', '900000001', 5),
  ('b2b2b2b2-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Cliente de B', '900000002', 7);
-- Fila de bitácora de cada bodega, para comprobar que no se ven entre sí.
insert into public.debt_sync_ops (op_id, merchant_id, debt_id, delta) values
  ('b3b3b3b3-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'b2b2b2b2-0000-4000-8000-000000000001', 1),
  ('a3a3a3a3-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a2a2a2a2-0000-4000-8000-000000000001', 1);

-- p_me actúa contra las filas de p_other. Lanza una excepción 'RLS: ...' ante cualquier fuga.
-- Se ejecuta como dueño y cambia de rol por dentro (set local role), como PostgREST.
create function public.rls_probar_aislamiento(
  p_me uuid, p_my_merchant uuid, p_my_debt uuid,
  p_other_user uuid, p_other_merchant uuid, p_other_debt uuid, p_other_tx uuid, p_other_op uuid
) returns void language plpgsql as $$
declare
  n int;
  v_saldo numeric;
  v_esperado numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_me)::text, true);
  set local role authenticated;

  -- Control positivo: lo propio sí se ve (una política borrada deja todo en deny).
  select count(*) into n from public.merchants where id = p_my_merchant;
  if n <> 1 then raise exception 'RLS: no ve su propia bodega'; end if;
  select count(*) into n from public.transactions where merchant_id = p_my_merchant;
  if n <> 1 then raise exception 'RLS: no ve sus propios movimientos'; end if;
  select count(*) into n from public.customers_debts where merchant_id = p_my_merchant;
  if n <> 1 then raise exception 'RLS: no ve sus propios fiados'; end if;
  select count(*) into n from public.debt_sync_ops where merchant_id = p_my_merchant;
  if n <> 1 then raise exception 'RLS: no ve su propia bitácora'; end if;

  -- Lectura ajena.
  select count(*) into n from public.merchants where id = p_other_merchant or user_id = p_other_user;
  if n <> 0 then raise exception 'RLS: lee merchants ajeno'; end if;
  select count(*) into n from public.transactions where merchant_id = p_other_merchant;
  if n <> 0 then raise exception 'RLS: lee transactions ajeno'; end if;
  select count(*) into n from public.customers_debts where merchant_id = p_other_merchant;
  if n <> 0 then raise exception 'RLS: lee customers_debts ajeno'; end if;
  select count(*) into n from public.debt_sync_ops where merchant_id = p_other_merchant;
  if n <> 0 then raise exception 'RLS: lee debt_sync_ops ajeno'; end if;

  -- Escritura ajena: UPDATE y DELETE no deben afectar ninguna fila.
  update public.merchants set business_name = 'hackeada' where id = p_other_merchant;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS: actualiza merchants ajeno'; end if;
  update public.transactions set amount = 999 where id = p_other_tx;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS: actualiza transactions ajeno'; end if;
  update public.customers_debts set balance = 0 where id = p_other_debt;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS: actualiza customers_debts ajeno'; end if;
  delete from public.transactions where id = p_other_tx;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS: borra transactions ajeno'; end if;
  delete from public.customers_debts where id = p_other_debt;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS: borra customers_debts ajeno'; end if;
  delete from public.merchants where id = p_other_merchant;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS: borra merchants ajeno'; end if;

  -- INSERT hacia la bodega ajena: debe chocar con WITH CHECK (42501).
  begin
    insert into public.transactions (merchant_id, type, amount) values (p_other_merchant, 'income', 1);
    raise exception 'RLS: inserta transactions en bodega ajena';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.customers_debts (merchant_id, customer_name, balance) values (p_other_merchant, 'x', 1);
    raise exception 'RLS: inserta customers_debts en bodega ajena';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.merchants (user_id, business_name) values (p_other_user, 'suplantada');
    raise exception 'RLS: crea bodega a nombre ajeno';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.debt_sync_ops (op_id, merchant_id, debt_id, delta)
    values (gen_random_uuid(), p_other_merchant, p_other_debt, 1);
    raise exception 'RLS: inserta debt_sync_ops en bodega ajena';
  exception when insufficient_privilege then null;
  end;

  -- RPC security invoker sobre un fiado ajeno: FIADO_NO_ENCONTRADO y no mueve nada.
  begin
    perform public.aplicar_movimiento_fiado(p_other_op, p_other_debt, 5);
    raise exception 'RLS: aplicar_movimiento_fiado actuó sobre fiado ajeno';
  exception when raise_exception then
    if sqlerrm <> 'FIADO_NO_ENCONTRADO' then raise; end if;
  end;

  -- Control positivo de la RPC sobre lo propio.
  select balance + 1 into v_esperado from public.customers_debts where id = p_my_debt;
  v_saldo := public.aplicar_movimiento_fiado(gen_random_uuid(), p_my_debt, 1);
  if v_saldo is distinct from v_esperado then raise exception 'RLS: la RPC no funciona sobre fiado propio (%)', v_saldo; end if;

  reset role;
end $$;

-- 1) Políticas, RLS y revoke presentes (el aviso más claro si alguien borra una).
do $$ declare p text; begin
  foreach p in array array['merchants_propias:merchants','transactions_propias:transactions',
                           'customers_debts_propias:customers_debts','debt_sync_ops_propias:debt_sync_ops'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public'
                   and policyname = split_part(p, ':', 1) and tablename = split_part(p, ':', 2)) then
      raise exception 'Falta la política %', p;
    end if;
  end loop;
  if exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace
             and c.relname in ('merchants','transactions','customers_debts','debt_sync_ops')
             and not c.relrowsecurity) then
    raise exception 'RLS desactivada en una tabla de negocio';
  end if;
  if has_table_privilege('anon', 'public.merchants', 'select') or has_table_privilege('anon', 'public.transactions', 'select')
     or has_table_privilege('anon', 'public.customers_debts', 'select') then
    raise exception 'anon tiene acceso a tablas de negocio';
  end if;
end $$;

-- 2) Aislamiento en ambos sentidos (A contra B y B contra A). Se revierte al final.
begin;
select public.rls_probar_aislamiento(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a2a2a2a2-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'b2b2b2b2-0000-4000-8000-000000000001',
  'b1b1b1b1-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001');
select public.rls_probar_aislamiento(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'b2b2b2b2-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a2a2a2a2-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002');
rollback;

-- 3) Mutaciones: la prueba debe FALLAR si se borra, se abre a "true" o se desactiva RLS
--    en cualquier política. Cada mutación se revierte con una excepción controlada.
do $$ declare
  r record;
  detectada boolean;
  m text;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
           and tablename in ('merchants','transactions','customers_debts','debt_sync_ops') loop
    foreach m in array array['drop', 'abrir', 'norls'] loop
      detectada := false;
      begin
        if m = 'drop' then
          execute format('drop policy %I on public.%I', r.policyname, r.tablename);
        elsif m = 'abrir' then
          execute format('drop policy %I on public.%I', r.policyname, r.tablename);
          execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', r.policyname, r.tablename);
        else
          execute format('alter table public.%I disable row level security', r.tablename);
        end if;
        begin
          perform public.rls_probar_aislamiento(
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a2a2a2a2-0000-4000-8000-000000000001',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'b2b2b2b2-0000-4000-8000-000000000001',
            'b1b1b1b1-0000-4000-8000-000000000001', gen_random_uuid());
        exception when others then
          if sqlerrm like 'RLS:%' or sqlstate = '42501' then detectada := true; else raise; end if;
        end;
        reset role;
        raise exception 'MUTACION_REVERTIDA';
      exception when others then
        if sqlerrm <> 'MUTACION_REVERTIDA' then raise; end if;
      end;
      if not detectada then
        raise exception 'La prueba NO detectó la mutación % en %.%', m, r.tablename, r.policyname;
      end if;
    end loop;
  end loop;
end $$;

-- 4) Tras las mutaciones (revertidas) los datos de B siguen intactos y la prueba vuelve a pasar.
do $$ begin
  if (select balance from public.customers_debts where id = 'b2b2b2b2-0000-4000-8000-000000000001') <> 7
     or (select amount from public.transactions where id = 'b1b1b1b1-0000-4000-8000-000000000001') <> 20
     or (select business_name from public.merchants where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 'Bodega B' then
    raise exception 'Datos de B alterados';
  end if;
end $$;
begin;
select public.rls_probar_aislamiento(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a2a2a2a2-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'b2b2b2b2-0000-4000-8000-000000000001',
  'b1b1b1b1-0000-4000-8000-000000000001', gen_random_uuid());
rollback;
