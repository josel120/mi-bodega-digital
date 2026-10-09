-- ============================================================================
--  Mi Bodega Digital · Plan Fundador (S/ 19 por mes, 30 bodegas)
--  Preparado el 2026-10-09, NO ejecutado en ningún proyecto real.
--
--  Requiere 01, 02, 03 y 04 ya aplicados (no se editan: este guion los extiende).
--  Se puede correr más de una vez: todo es `if not exists`, `create or replace`
--  o `drop ... if exists` antes de crear. Probado en Postgres descartable con
--  test/payment-schema.sql y test/cuenta-schema.sql (aplican 01 → 02 → 03 → 05).
--
--  Regla (DEC-20261006-MBD-PROMOS): plan fundador = S/ 19, 1 mes prepagado, sin
--  renovación automática, para un máximo de 30 bodegas (bodegas distintas, no
--  pedidos). Una bodega que ya pagó un pedido fundador puede seguir comprando
--  meses fundador a S/ 19 aunque los 30 cupos ya estén tomados. Mensual (29) y
--  anual (279) no cambian.
--
--  PENDIENTE DEL DUEÑO (no se aplica ninguna fecha en este guion):
--    · D2: cuánto dura el precio fundador (¿para siempre, 6 meses, 12?). Hoy una
--      bodega fundadora puede renovar a S/ 19 sin límite de tiempo.
--    · D3: fecha límite para tomar los 30 cupos. Hoy no hay fecha: el único
--      límite es el cupo. Cuando se decidan, se agregan en `cupo_fundador()` /
--      `fundadores_ocupados()` y se ajusta la prueba.
--
--  Qué cambia:
--    1. `plan_type` acepta 'founder' y el precio se valida en la base:
--       founder solo con monto 19.
--    2. `recalcular_vigencia` (la versión de 03): founder suma 1 mes y deja la
--       bodega como `active_monthly` (es un mes pagado; no se agrega un estado
--       nuevo en `merchants` para no chocar con restricciones que no están
--       versionadas, ver S1 en 01).
--    3. `reservar_membresia` (la versión de 02; 03 no la tocó) valida el cupo.
--    4. `cupo_fundador()` es el ÚNICO lugar donde vive el tope (30).
--    5. `estado_fundador()` deja que la pantalla sepa si quedan cupos.
--
--  CÓMO SE CUIDA EL CUPO (todo en la base, la pantalla solo informa)
--    · Ocupa cupo una bodega con al menos un pedido founder en estado `paid`
--      (una devolución o contracargo lo libera) o con un pedido founder en
--      curso (`creating` / `pending`) que no ha vencido. Se cuentan bodegas
--      distintas. Una cuenta borrada pierde el vínculo (merchant_id null) y ya
--      no ocupa cupo.
--    · RETENCIÓN: el pedido founder en curso vence a los 30 minutos (los demás
--      planes siguen en 24 horas). Esos 30 minutos son el tiempo que guarda el
--      cupo mientras la persona paga. Mercado Pago recibe esa misma hora de
--      vencimiento (`expiration_date_to` en crear-preferencia), así que un
--      pedido vencido ya no se puede pagar y no hay pagos "fantasma" sobre un
--      cupo ya liberado. Sin retención, dos personas podrían pagar el último
--      cupo; con 24 horas, un curioso bloquearía cupos todo el día.
--    · CARRERAS: antes de contar, la reserva toma un candado de la base
--      (`pg_advisory_xact_lock`) que se suelta al terminar la transacción. Dos
--      reservas del último cupo se turnan: la segunda ve el pedido de la
--      primera y recibe `sold_out`.
--    · Si ya no hay cupo, `reservar_membresia` NO falla: devuelve
--      {created:false, sold_out:true} y crear-preferencia responde 409 con un
--      mensaje claro. Una bodega que ya pagó un pedido founder nunca recibe
--      sold_out.
--    · Si aun así un pago llega aprobado sobre un pedido vencido (relojes
--      distintos), el dinero ya se cobró: `aplicar_pago_membresia` lo aplica
--      igual y el dueño decide a mano si lo devuelve. No se pierde un pago.
--
--  PASOS DEL DUEÑO (nada de esto se ejecutó desde el repositorio):
--    1. Pegar este archivo en Supabase → SQL Editor y ejecutarlo. Debe terminar
--       sin error; la comprobación del final lista las 4 funciones y la
--       restricción de precio.
--    2. Desplegar las Edge Functions con el plan nuevo (no hay secretos nuevos):
--         supabase functions deploy crear-preferencia
--         supabase functions deploy webhook-mercadopago
--    3. Decidir D2 y D3 (arriba). Los planes siguen ocultos tras
--       MOSTRAR_PLANES=false hasta que lo enciendas tú.
-- ============================================================================
begin;


-- ----------------------------------------------------------------------------
-- 1. Precio por plan, validado en la base
--
--    02 declaró dos restricciones: la de `plan_type` (generada, nombre
--    automático) y `membership_orders_precio`. Se borran las dos por su
--    definición, no por nombre, y se vuelven a crear con founder incluido.
-- ----------------------------------------------------------------------------
do $$
declare
  v_restriccion text;
begin
  for v_restriccion in
    select conname from pg_constraint
     where conrelid = 'public.membership_orders'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%plan_type%'
  loop
    execute format('alter table public.membership_orders drop constraint %I', v_restriccion);
  end loop;
end $$;

alter table public.membership_orders
  add constraint membership_orders_plan_type_check
  check (plan_type in ('monthly', 'yearly', 'founder'));
alter table public.membership_orders
  add constraint membership_orders_precio check (
    (plan_type = 'monthly' and amount = 29)
    or (plan_type = 'yearly' and amount = 279)
    or (plan_type = 'founder' and amount = 19)
  );


-- ----------------------------------------------------------------------------
-- 2. Tope y conteo de cupos fundador
-- ----------------------------------------------------------------------------

-- El tope de bodegas fundadoras vive SOLO aquí. D2 (duración del precio) y D3
-- (fecha límite) siguen sin decidir: no se aplica ninguna fecha.
create or replace function public.cupo_fundador()
returns int
language sql
immutable
set search_path = public
as $$ select 30 $$;

-- Bodegas que hoy ocupan un cupo, sin contar a `p_excluir` (la bodega que
-- consulta: su propio pedido en curso no le quita el cupo a sí misma).
create or replace function public.fundadores_ocupados(p_excluir uuid default null)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct merchant_id)::int
    from public.membership_orders
   where plan_type = 'founder'
     and merchant_id is not null
     and merchant_id is distinct from p_excluir
     and (status = 'paid' or (status in ('creating', 'pending') and expires_at > now()));
$$;

-- Lo que la pantalla necesita: sin datos de otras bodegas, solo cifras.
create or replace function public.estado_fundador()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_merchant uuid;
  v_propio boolean := false;
  v_cupo int := public.cupo_fundador();
  v_ocupados int;
begin
  select id into v_merchant from public.merchants where user_id = auth.uid() order by created_at limit 1;
  if v_merchant is not null then
    v_propio := exists (select 1 from public.membership_orders
                         where merchant_id = v_merchant and plan_type = 'founder' and status = 'paid');
  end if;
  v_ocupados := public.fundadores_ocupados(null);
  return jsonb_build_object(
    'cap', v_cupo,
    'taken', v_ocupados,
    'remaining', greatest(v_cupo - v_ocupados, 0),
    'is_founder', v_propio,
    -- Quien ya es fundador siempre puede seguir comprando a S/ 19.
    'can_buy', v_propio or public.fundadores_ocupados(v_merchant) < v_cupo
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- 3. Vigencia: founder = 1 mes (base: la versión de 03, con su recálculo
--    completo desde los pedidos pagados; solo se agrega el plan nuevo)
-- ----------------------------------------------------------------------------
create or replace function public.recalcular_vigencia(p_merchant_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.membership_orders;
  v_fin timestamptz := null;
  v_plan text := null;
begin
  if p_merchant_id is null then return null; end if;
  for v_order in
    select * from public.membership_orders
     where merchant_id = p_merchant_id and status = 'paid'
     order by approved_at, id
  loop
    v_fin := greatest(coalesce(v_fin, v_order.approved_at), v_order.approved_at)
      + case when v_order.plan_type = 'yearly' then interval '12 months' else interval '1 month' end;
    v_plan := v_order.plan_type;
    update public.membership_orders set granted_until = v_fin
     where id = v_order.id and granted_until is distinct from v_fin;
  end loop;
  if v_fin is null or v_fin <= now() then
    v_fin := null;
    v_plan := null;
  end if;
  update public.merchants
     set subscription_ends_at = v_fin,
         subscription_status = case
           when v_plan in ('monthly', 'founder') then 'active_monthly'
           when v_plan = 'yearly' then 'active_yearly'
           else 'inactive' end
   where id = p_merchant_id;
  return v_fin;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. Reserva (base: la versión de 02; 03 no la reemplazó)
-- ----------------------------------------------------------------------------
create or replace function public.reservar_membresia(p_user_id uuid, p_plan text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant uuid;
  v_order public.membership_orders;
  v_created boolean;
  v_monto numeric;
  v_vence interval := interval '24 hours';
begin
  if p_plan is null or p_plan not in ('monthly', 'yearly', 'founder') then raise exception 'Plan inválido'; end if;
  -- Serializar reservas de una bodega: dos pestañas no crean dos checkouts.
  select id into v_merchant from public.merchants where user_id = p_user_id order by created_at limit 1 for update;
  if v_merchant is null then raise exception 'Falta registrar la bodega'; end if;
  select * into v_order from public.membership_orders where id = p_id;
  if found then
    if v_order.merchant_id <> v_merchant or v_order.plan_type <> p_plan then raise exception 'Pedido ajeno o plan distinto'; end if;
    return jsonb_build_object('created', false, 'order', to_jsonb(v_order));
  end if;
  -- Reutilizar una preferencia pendiente; no recrear una operación incierta.
  -- Un pedido founder en curso ya tiene su cupo retenido: se reutiliza sin
  -- volver a contar.
  select * into v_order from public.membership_orders
    where merchant_id = v_merchant and status in ('creating', 'pending') and expires_at > now()
    order by created_at desc limit 1;
  if found then
    if v_order.plan_type <> p_plan then raise exception 'Ya existe un pedido pendiente de otro plan'; end if;
    return jsonb_build_object('created', false, 'order', to_jsonb(v_order));
  end if;

  if p_plan = 'founder' then
    -- Un solo turno a la vez para el cupo (se suelta al terminar la transacción).
    -- Orden fijo: primero bodega, luego este candado; nadie hace lo contrario.
    perform pg_advisory_xact_lock(hashtext('mbd-cupo-fundador'));
    if not exists (select 1 from public.membership_orders
                    where merchant_id = v_merchant and plan_type = 'founder' and status = 'paid')
       and public.fundadores_ocupados(v_merchant) >= public.cupo_fundador() then
      return jsonb_build_object('created', false, 'sold_out', true);
    end if;
    -- Retención corta: el cupo se guarda 30 minutos mientras la persona paga.
    v_vence := interval '30 minutes';
  end if;

  v_monto := case p_plan when 'monthly' then 29 when 'yearly' then 279 else 19 end;
  insert into public.membership_orders(id, merchant_id, plan_type, amount, expires_at)
    values (p_id, v_merchant, p_plan, v_monto, now() + v_vence)
    on conflict (id) do nothing returning * into v_order;
  v_created := found;
  if not v_created then raise exception 'Pedido en uso'; end if;
  return jsonb_build_object('created', true, 'order', to_jsonb(v_order));
end;
$$;


-- Ninguna función de plata puede llamarse con la sesión del navegador; solo
-- `estado_fundador` (cifras sin datos personales) es para la pantalla.
revoke all on function public.recalcular_vigencia(uuid) from public, anon, authenticated;
grant execute on function public.recalcular_vigencia(uuid) to service_role;
revoke all on function public.reservar_membresia(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.reservar_membresia(uuid,text,uuid) to service_role;
revoke all on function public.cupo_fundador() from public, anon, authenticated;
grant execute on function public.cupo_fundador() to service_role;
revoke all on function public.fundadores_ocupados(uuid) from public, anon, authenticated;
grant execute on function public.fundadores_ocupados(uuid) to service_role;
revoke all on function public.estado_fundador() from public, anon;
grant execute on function public.estado_fundador() to authenticated, service_role;

commit;


-- ----------------------------------------------------------------------------
-- Comprobación (solo lectura). Debe devolver:
--    · 5 funciones (cupo_fundador, estado_fundador, fundadores_ocupados,
--      recalcular_vigencia, reservar_membresia)
--    · 2 restricciones: plan_type_check con 'founder' y precio con 19
-- ----------------------------------------------------------------------------
select p.proname, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('cupo_fundador', 'estado_fundador', 'fundadores_ocupados',
                    'recalcular_vigencia', 'reservar_membresia')
order by p.proname;

select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.membership_orders'::regclass and contype = 'c'
order by conname;
