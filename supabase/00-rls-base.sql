-- ============================================================================
--  Mi Bodega Digital · Políticas RLS base (merchants, transactions, customers_debts)
--
--  ESTADO: PENDIENTE DE COMPARAR CON EL VOLCADO REAL (hallazgo S1).
--  Es una reconstrucción de las políticas que 01-endurecer-esquema.sql da por
--  verificadas "en vivo" el 2026-09-15. NO se ha comparado con el proyecto real.
--  Antes de aplicarla allí, el dueño debe exportar las políticas actuales
--  (consulta de solo lectura sobre pg_policies) y comparar nombre, comando,
--  rol y expresiones; si difieren, se corrige este archivo con el volcado real.
--
--  Idempotente: puede correr varias veces. Debe correr ANTES de 01.
--  La prueba test/rls-schema.sql falla si falta cualquiera de estas políticas.
-- ============================================================================

alter table public.merchants enable row level security;
alter table public.transactions enable row level security;
alter table public.customers_debts enable row level security;

-- El navegador anónimo no toca datos de negocio.
revoke all on public.merchants, public.transactions, public.customers_debts from anon;
grant select, insert, update, delete on public.merchants, public.transactions, public.customers_debts to authenticated;
grant all on public.merchants, public.transactions, public.customers_debts to service_role;

drop policy if exists merchants_propias on public.merchants;
create policy merchants_propias on public.merchants
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists transactions_propias on public.transactions;
create policy transactions_propias on public.transactions
  for all to authenticated
  using (merchant_id in (select id from public.merchants where user_id = auth.uid()))
  with check (merchant_id in (select id from public.merchants where user_id = auth.uid()));

drop policy if exists customers_debts_propias on public.customers_debts;
create policy customers_debts_propias on public.customers_debts
  for all to authenticated
  using (merchant_id in (select id from public.merchants where user_id = auth.uid()))
  with check (merchant_id in (select id from public.merchants where user_id = auth.uid()));
