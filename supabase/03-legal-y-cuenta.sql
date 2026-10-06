-- ============================================================================
--  Mi Bodega Digital · Legal y cuenta  (pegar en Supabase → SQL Editor)
--  Preparado el 2026-10-06, NO ejecutado en ningún proyecto real.
--
--  Requiere 01-endurecer-esquema.sql y 02-membresias-prepago.sql ya aplicados.
--  Se puede correr más de una vez: todo es `if not exists`, `create or replace`
--  o `drop ... if exists` antes de crear. Probado en Postgres descartable con
--  test/cuenta-schema.sql (aplica 01 → 02 → 03 → 03 y comprueba cada caso).
--
--  Qué agrega:
--    1. El candado del plan decide por el rol real, no por un claim (S3).
--    2. Devolver un pedido ya no deja sus meses dentro de los pedidos de
--       después: la vigencia se recalcula entera (S6 / N1).
--    3. Borrar la cuenta: datos del negocio y de terceros fuera, pedidos de
--       membresía conservados para SUNAT pero sin dueño (S2).
--    4. Libro de Reclamaciones virtual: tabla `complaints` sin acceso directo y
--       una función que solo inserta y devuelve la constancia.
-- ============================================================================
begin;


-- ----------------------------------------------------------------------------
-- 1. Candado del plan por rol real (S3)
--
--    PROBLEMA: 01/02 deciden con `request.jwt.claims ->> 'role'`. Ese claim
--    solo existe cuando la consulta llega por la API (PostgREST). En el SQL
--    Editor o en una conexión directa vale NULL, así que una conciliación
--    manual con aplicar_pago_membresia marcaba el pedido como pagado y el
--    trigger devolvía en silencio la vigencia de la bodega a su valor anterior.
--
--    SOLUCIÓN: decidir por `current_user`. Por la API, el navegador corre como
--    `anon` o `authenticated`; el webhook como `service_role`; el SQL Editor
--    como `postgres`; las RPC `security definer` como su dueño. Solo los dos
--    primeros son "el navegador". Sin `security definer`: si el trigger corriera
--    como su dueño, `current_user` siempre sería el dueño y el candado no
--    serviría.
-- ----------------------------------------------------------------------------
create or replace function public.proteger_suscripcion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.user_id := auth.uid();
      new.subscription_status := 'trial';
      new.trial_ends_at := now() + interval '7 days';
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
create trigger merchants_proteger_suscripcion
  before insert or update on public.merchants
  for each row execute function public.proteger_suscripcion();


-- ----------------------------------------------------------------------------
-- 2. Vigencia recalculada desde los pedidos pagados (S6 / N1)
--
--    PROBLEMA: en 02, cada pedido aprobado se sumaba sobre el vencimiento que
--    tenía la bodega en ese momento y guardaba su `granted_until` para siempre.
--    Si después se devolvía el pedido A, el pedido B (comprado después) seguía
--    contando los meses de A: el cliente se quedaba con un mes que no pagó.
--
--    SOLUCIÓN: la vigencia es un cálculo, no un acumulado. Se recorren los
--    pedidos `paid` en el orden en que se aprobaron y cada uno empieza donde
--    termina el anterior (o el día que se aprobó, si ya había vencido). Una
--    devolución o contracargo simplemente saca su pedido de la cadena.
--    `subscription_ends_at` queda derivado de los pedidos: no lo edites a mano,
--    se pisa en el siguiente pago.
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
      + case when v_order.plan_type = 'monthly' then interval '1 month' else interval '12 months' end;
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
           when v_plan = 'monthly' then 'active_monthly'
           when v_plan = 'yearly' then 'active_yearly'
           else 'inactive' end
   where id = p_merchant_id;
  return v_fin;
end;
$$;

create or replace function public.aplicar_pago_membresia(p_order_id uuid, p_payment_id text, p_state text, p_approved_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.membership_orders;
begin
  if p_state not in ('approved', 'refunded', 'charged_back') or p_state is null then raise exception 'Estado inválido'; end if;
  if p_payment_id is null or p_payment_id !~ '^[0-9]+$' then raise exception 'Pago inválido'; end if;
  -- Siempre candado bodega antes de pedido: evitar deadlock entre compra y webhook.
  select * into v_order from public.membership_orders where id = p_order_id;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_order.merchant_id is not null then
    perform 1 from public.merchants where id = v_order.merchant_id for update;
  end if;
  select * into v_order from public.membership_orders where id = p_order_id for update;
  if v_order.payment_id is not null and v_order.payment_id <> p_payment_id then raise exception 'Pedido con otro pago: revisar cobro duplicado'; end if;
  if p_state = 'approved' then
    if p_approved_at is null or p_approved_at > now() + interval '5 minutes' then raise exception 'Fecha inválida'; end if;
    if v_order.status in ('refunded', 'charged_back') then return jsonb_build_object('ignored', true); end if;
    if v_order.status = 'paid' then return jsonb_build_object('duplicate', true); end if;
    update public.membership_orders set status = 'paid', payment_id = p_payment_id, approved_at = p_approved_at
     where id = p_order_id;
  else
    update public.membership_orders set status = p_state, payment_id = p_payment_id where id = p_order_id;
  end if;
  -- Cuenta ya borrada: el pago queda registrado para devolverlo a mano, pero
  -- no hay bodega a la que darle vigencia.
  if v_order.merchant_id is null then
    return jsonb_build_object('applied', true, 'orphan', true);
  end if;
  perform public.recalcular_vigencia(v_order.merchant_id);
  return jsonb_build_object('applied', true);
end;
$$;

revoke all on function public.recalcular_vigencia(uuid) from public, anon, authenticated;
grant execute on function public.recalcular_vigencia(uuid) to service_role;
revoke all on function public.aplicar_pago_membresia(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.aplicar_pago_membresia(uuid,text,text,timestamptz) to service_role;


-- ----------------------------------------------------------------------------
-- 3. Borrar la cuenta (S2, Ley 29733)
--
--    PROBLEMA: `membership_orders.merchant_id ... on delete restrict` impedía
--    borrar una bodega que alguna vez pagó, y no había forma de borrar nada.
--
--    SOLUCIÓN: los pedidos se conservan (son el respaldo de cada cobro ante
--    SUNAT) pero pierden el vínculo con la bodega: `merchant_id` pasa a NULL y
--    se borra la URL del checkout. Queda plan, monto, estado, fechas y los ids
--    de Mercado Pago; el comprobante electrónico vive en SUNAT SOL.
--    La función la llama solo la Edge Function `borrar-cuenta` (service_role),
--    después de verificar la sesión. El usuario de Auth lo borra la función por
--    la API de administración, no este SQL.
-- ----------------------------------------------------------------------------
alter table public.membership_orders add column if not exists account_deleted_at timestamptz;
alter table public.membership_orders alter column merchant_id drop not null;
alter table public.membership_orders drop constraint if exists membership_orders_merchant_id_fkey;
alter table public.membership_orders
  add constraint membership_orders_merchant_id_fkey
  foreign key (merchant_id) references public.merchants(id) on delete set null;

create or replace function public.borrar_datos_bodega(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchants uuid[];
  v_pedidos int := 0;
begin
  if p_user_id is null then raise exception 'Usuario inválido'; end if;
  -- Todas las bodegas de la cuenta (antes del UNIQUE de 01 podía haber dos),
  -- bajo candado para que un webhook no les dé vigencia a medio borrar.
  select coalesce(array_agg(id), '{}') into v_merchants
    from (select id from public.merchants where user_id = p_user_id for update) m;
  if cardinality(v_merchants) = 0 then
    -- Reintento después de un borrado que ya pasó: no es error.
    return jsonb_build_object('merchants', 0, 'orders_detached', 0);
  end if;

  update public.membership_orders
     set merchant_id = null, checkout_url = null, account_deleted_at = now()
   where merchant_id = any(v_merchants);
  get diagnostics v_pedidos = row_count;

  -- Del más dependiente al menos: no confiamos en que las tablas base tengan
  -- `on delete cascade` (no están versionadas, ver S1).
  delete from public.debt_sync_ops where merchant_id = any(v_merchants);
  delete from public.customers_debts where merchant_id = any(v_merchants);
  delete from public.transactions where merchant_id = any(v_merchants);
  delete from public.merchants where id = any(v_merchants);

  return jsonb_build_object('merchants', cardinality(v_merchants), 'orders_detached', v_pedidos);
end;
$$;

revoke all on function public.borrar_datos_bodega(uuid) from public, anon, authenticated;
grant execute on function public.borrar_datos_bodega(uuid) to service_role;


-- ----------------------------------------------------------------------------
-- 4. Libro de Reclamaciones virtual (Código de Protección y Defensa del
--    Consumidor, DS 011-2011-PCM y modificatorias)
--
--    Decisión: una RPC `security definer` en vez de insert directo o Edge
--    Function.
--      · Insert directo con RLS: para devolver el código de la constancia,
--        PostgREST necesita permiso de SELECT sobre la fila, y con SELECT un
--        anónimo podría leer reclamos de otros.
--      · Edge Function: suma un despliegue y la clave service_role a la
--        superficie sin proteger nada más (sin captcha, valida lo mismo).
--      · RPC: `anon` y `authenticated` NO tienen ningún permiso sobre la tabla.
--        Solo pueden ejecutar `registrar_reclamo`, que valida, inserta y
--        devuelve código y fecha de ESE reclamo. El dueño los lee en
--        Table Editor (rol postgres).
--
--    Los nombres de los campos vienen de src/content/legal/reclamaciones.ts.
--    Si Legal cambia un campo obligatorio, actualiza `v_obligatorios` abajo:
--    test/reclamos.test.mjs falla si no coinciden.
--    Conservación: al menos 2 años desde el registro (norma del Libro). Estas
--    filas NO se borran con la cuenta: quien reclama puede no tener cuenta.
-- ----------------------------------------------------------------------------
create sequence if not exists public.complaints_correlativo_seq;

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  correlativo bigint not null unique default nextval('public.complaints_correlativo_seq'),
  codigo text not null unique,
  tipo text not null check (tipo in ('reclamo', 'queja')),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 20000),
  estado text not null default 'recibido' check (estado in ('recibido', 'respondido')),
  posible_spam boolean not null default false,
  respuesta text,
  respondido_at timestamptz,
  created_at timestamptz not null default now(),
  constraint complaints_respuesta_completa check (
    (estado = 'recibido') or (respuesta is not null and respondido_at is not null)
  )
);

-- Por si la tabla ya existía de una versión anterior de este guion.
alter table public.complaints add column if not exists posible_spam boolean not null default false;
alter sequence public.complaints_correlativo_seq owned by public.complaints.correlativo;
alter table public.complaints enable row level security;
revoke all on public.complaints from public, anon, authenticated;
revoke all on sequence public.complaints_correlativo_seq from public, anon, authenticated;
grant all on public.complaints to service_role;
create index if not exists complaints_email_fecha on public.complaints (lower(email), created_at desc);

create or replace function public.registrar_reclamo(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Deben coincidir con CAMPOS de src/content/legal/reclamaciones.ts:
  -- `v_obligatorios` = los de `obligatorio: true`; `v_permitidos` = todos.
  v_obligatorios text[] := array[
    'consumerName', 'documentType', 'documentNumber', 'address', 'phone', 'email',
    'isMinor', 'itemType', 'itemDescription', 'claimType', 'detail', 'request',
    'responseChannel', 'declaration'
  ];
  v_permitidos text[] := v_obligatorios || array[
    'guardianName', 'guardianContact', 'claimedAmount', 'paymentDate'
  ];
  v_clave text;
  v_valor jsonb;
  v_email text;
  v_tipo text;
  v_fila public.complaints;
  v_numero bigint;
  v_spam boolean;
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'RECLAMO_INVALIDO'; end if;
  for v_clave, v_valor in select key, value from jsonb_each(p_datos) loop
    if not (v_clave = any(v_permitidos)) or jsonb_typeof(v_valor) <> 'string'
       or char_length(v_valor #>> '{}') > 3000 then
      raise exception 'RECLAMO_INVALIDO' using detail = v_clave;
    end if;
  end loop;
  foreach v_clave in array v_obligatorios loop
    if btrim(coalesce(p_datos ->> v_clave, '')) = '' then
      raise exception 'RECLAMO_FALTA_CAMPO' using detail = v_clave;
    end if;
  end loop;

  -- Lo que el formato exige aunque el navegador se salte la validación.
  if p_datos ->> 'claimType' not in ('Reclamo', 'Queja')
     or p_datos ->> 'isMinor' not in ('No', 'Sí')
     or p_datos ->> 'declaration' <> 'Acepto' then
    raise exception 'RECLAMO_INVALIDO' using detail = 'opciones';
  end if;
  if p_datos ->> 'isMinor' = 'Sí'
     and (btrim(coalesce(p_datos ->> 'guardianName', '')) = ''
          or btrim(coalesce(p_datos ->> 'guardianContact', '')) = '') then
    raise exception 'RECLAMO_FALTA_CAMPO' using detail = 'guardianName';
  end if;
  if coalesce(p_datos ->> 'claimedAmount', '') !~ '^([0-9]{1,9}(\.[0-9]{1,2})?)?$' then
    raise exception 'RECLAMO_INVALIDO' using detail = 'claimedAmount';
  end if;
  if coalesce(p_datos ->> 'paymentDate', '') <> '' and (
       p_datos ->> 'paymentDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or (p_datos ->> 'paymentDate')::date > (now() at time zone 'America/Lima')::date) then
    raise exception 'RECLAMO_INVALIDO' using detail = 'paymentDate';
  end if;

  v_email := lower(btrim(p_datos ->> 'email'));
  v_tipo := lower(p_datos ->> 'claimType');

  -- El Libro SIEMPRE recibe. Nada se rechaza por el correo: el correo no está
  -- verificado, y un tope por correo dejaría que cualquiera mande 5 hojas con
  -- el correo de otra persona y le impida reclamar. Si un mismo correo ya
  -- tiene 5 o más hojas en 24 horas, la hoja entra igual y queda marcada como
  -- `posible_spam` para que el dueño la revise primero. Contra el relleno
  -- masivo quedan los topes de tamaño por hoja; un freno por IP o captcha
  -- iría en una Edge Function (pendiente, ver docs/sandbox-mercadopago.md).
  v_spam := (select count(*) from public.complaints
              where lower(email) = v_email and created_at > now() - interval '24 hours') >= 5;

  -- Código con el año de Lima y el correlativo: MBD-2026-000001. `now()` es la
  -- hora de la transacción, la misma que queda en created_at.
  v_numero := nextval('public.complaints_correlativo_seq');
  insert into public.complaints (correlativo, codigo, tipo, email, datos, posible_spam, created_at)
  values (
    v_numero,
    'MBD-' || to_char(now() at time zone 'America/Lima', 'YYYY') || '-' || lpad(v_numero::text, 6, '0'),
    v_tipo, v_email, p_datos, v_spam, now()
  )
  returning * into v_fila;

  return jsonb_build_object('codigo', v_fila.codigo, 'fecha', v_fila.created_at);
end;
$$;

revoke all on function public.registrar_reclamo(jsonb) from public;
grant execute on function public.registrar_reclamo(jsonb) to anon, authenticated, service_role;

commit;


-- ----------------------------------------------------------------------------
-- 5. Comprobación (solo lectura). Debe devolver:
--    · proteger_suscripcion con prosecdef = false
--    · 4 funciones nuevas o reemplazadas
--    · la FK de membership_orders con confdeltype = 'n' (set null)
-- ----------------------------------------------------------------------------
select p.proname, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('proteger_suscripcion', 'recalcular_vigencia', 'aplicar_pago_membresia',
                    'borrar_datos_bodega', 'registrar_reclamo')
order by p.proname;

select conname, confdeltype
from pg_constraint
where conname = 'membership_orders_merchant_id_fkey';
