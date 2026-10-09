-- Preparado, NO ejecutado. Requiere revisar/correr 01-endurecer-esquema.sql.
-- Prepago: 1 o 12 meses; no crea renovaciones automáticas ni guarda tarjetas.
begin;

alter table public.merchants add column if not exists subscription_ends_at timestamptz;

create table if not exists public.membership_orders (
  id uuid primary key,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  plan_type text not null check (plan_type in ('monthly', 'yearly')),
  amount numeric(12,2) not null,
  status text not null default 'creating' check (status in ('creating', 'pending', 'paid', 'refunded', 'charged_back')),
  preference_id text unique,
  checkout_url text,
  payment_id text unique,
  approved_at timestamptz,
  granted_until timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint membership_orders_precio check (
    (plan_type = 'monthly' and amount = 29) or (plan_type = 'yearly' and amount = 279)
  )
);
alter table public.membership_orders enable row level security;
revoke all on public.membership_orders from anon, authenticated;
grant select on public.membership_orders to authenticated;
grant all on public.membership_orders to service_role;
drop policy if exists membership_orders_propias on public.membership_orders;
create policy membership_orders_propias on public.membership_orders for select to authenticated
  using (merchant_id in (select id from public.merchants where user_id = auth.uid()));
create index if not exists membership_orders_bodega on public.membership_orders(merchant_id, created_at desc);

-- El navegador no puede prolongar prueba, cambiar dueño ni regalarse el plan,
-- tampoco al INSERT. El piloto conserva los datos del negocio y fija la prueba.
create or replace function public.proteger_suscripcion()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role' is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      new.user_id := auth.uid();
      new.subscription_status := 'trial';
      new.trial_ends_at := now() + interval '14 days';
      new.subscription_ends_at := null;
      new.created_at := now();
    else
      new.subscription_status := old.subscription_status;
      new.trial_ends_at := old.trial_ends_at;
      new.subscription_ends_at := old.subscription_ends_at;
      new.user_id := old.user_id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists merchants_proteger_suscripcion on public.merchants;
create trigger merchants_proteger_suscripcion before insert or update on public.merchants
  for each row execute function public.proteger_suscripcion();

create or replace function public.reservar_membresia(p_user_id uuid, p_plan text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_merchant uuid;
  v_order public.membership_orders;
  v_created boolean;
begin
  if p_plan not in ('monthly', 'yearly') or p_plan is null then raise exception 'Plan inválido'; end if;
  -- Serializar reservas de una bodega: dos pestañas no crean dos checkouts.
  select id into v_merchant from public.merchants where user_id = p_user_id order by created_at limit 1 for update;
  if v_merchant is null then raise exception 'Falta registrar la bodega'; end if;
  select * into v_order from public.membership_orders where id = p_id;
  if found then
    if v_order.merchant_id <> v_merchant or v_order.plan_type <> p_plan then raise exception 'Pedido ajeno o plan distinto'; end if;
    return jsonb_build_object('created', false, 'order', to_jsonb(v_order));
  end if;
  -- Reutilizar una preferencia pendiente; no recrear una operación incierta.
  select * into v_order from public.membership_orders
    where merchant_id = v_merchant and status in ('creating', 'pending') and expires_at > now()
    order by created_at desc limit 1;
  if found then
    if v_order.plan_type <> p_plan then raise exception 'Ya existe un pedido pendiente de otro plan'; end if;
    return jsonb_build_object('created', false, 'order', to_jsonb(v_order));
  end if;
  insert into public.membership_orders(id, merchant_id, plan_type, amount)
    values (p_id, v_merchant, p_plan, case when p_plan = 'monthly' then 29 else 279 end)
    on conflict (id) do nothing returning * into v_order;
  v_created := found;
  if not v_created then raise exception 'Pedido en uso'; end if;
  return jsonb_build_object('created', true, 'order', to_jsonb(v_order));
end;
$$;

create or replace function public.aplicar_pago_membresia(p_order_id uuid, p_payment_id text, p_state text, p_approved_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_order public.membership_orders;
  v_until timestamptz;
  v_status text;
begin
  if p_state not in ('approved', 'refunded', 'charged_back') or p_state is null then raise exception 'Estado inválido'; end if;
  if p_payment_id is null or p_payment_id !~ '^[0-9]+$' then raise exception 'Pago inválido'; end if;
  -- Siempre candado bodega antes de pedido: evitar deadlock entre compra y webhook.
  select * into v_order from public.membership_orders where id = p_order_id;
  if not found then raise exception 'Pedido inexistente'; end if;
  perform 1 from public.merchants where id = v_order.merchant_id for update;
  select * into v_order from public.membership_orders where id = p_order_id for update;
  if v_order.payment_id is not null and v_order.payment_id <> p_payment_id then raise exception 'Pedido con otro pago: revisar cobro duplicado'; end if;
  if p_state = 'approved' then
    if p_approved_at is null or p_approved_at > now() + interval '5 minutes' then raise exception 'Fecha inválida'; end if;
    if v_order.status in ('refunded', 'charged_back') then return jsonb_build_object('ignored', true); end if;
    if v_order.status = 'paid' then return jsonb_build_object('duplicate', true); end if;
    select greatest(coalesce(subscription_ends_at, p_approved_at), p_approved_at) into v_until
      from public.merchants where id = v_order.merchant_id;
    v_until := v_until + case when v_order.plan_type = 'monthly' then interval '1 month' else interval '12 months' end;
    update public.membership_orders set status = 'paid', payment_id = p_payment_id,
      approved_at = p_approved_at, granted_until = v_until where id = p_order_id;
  else
    update public.membership_orders set status = p_state, payment_id = p_payment_id where id = p_order_id;
  end if;
  -- Recalcular solo con pedidos válidos: una devolución no borra otra compra.
  select granted_until, case when plan_type = 'monthly' then 'active_monthly' else 'active_yearly' end
    into v_until, v_status from public.membership_orders
    where merchant_id = v_order.merchant_id and status = 'paid' and granted_until > now()
    order by granted_until desc limit 1;
  update public.merchants set subscription_ends_at = v_until,
    subscription_status = coalesce(v_status, 'inactive') where id = v_order.merchant_id;
  return jsonb_build_object('applied', true);
end;
$$;

-- Ninguna función de plata puede llamarse con la sesión del navegador.
revoke all on function public.reservar_membresia(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.reservar_membresia(uuid,text,uuid) to service_role;
revoke all on function public.aplicar_pago_membresia(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.aplicar_pago_membresia(uuid,text,text,timestamptz) to service_role;
commit;
