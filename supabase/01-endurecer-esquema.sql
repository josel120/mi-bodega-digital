-- ============================================================================
--  Mi Bodega Digital · Endurecimiento del esquema  (pegar en Supabase → SQL Editor)
--  Ejecutar UNA vez, de arriba a abajo, antes de abrir la app a clientes reales.
--
--  Contexto: la app es un sitio estático. No hay servidor propio, así que la
--  ÚNICA defensa real es la base de datos. Todo lo que no bloquee Postgres se
--  puede hacer desde la consola del navegador con la clave publishable.
--
--  Verificado el 2026-09-15 contra el proyecto jvjcifyfepwhdmhnzzjo:
--    · El aislamiento entre bodegas YA funciona (un usuario no lee ni escribe
--      datos de otro). Eso está bien y no se toca.
--    · Lo de abajo son los agujeros que sí quedaron abiertos.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Limpieza de las filas de prueba de la auditoría
--    Las creé para comprobar el aislamiento entre bodegas. Bórralas.
--    Los usuarios qa-audit-a@mailinator.com y qa-audit-b@mailinator.com hay que
--    eliminarlos a mano en Authentication → Users (no se borran por SQL).
-- ----------------------------------------------------------------------------
delete from public.transactions
where merchant_id in (
  select id from public.merchants where business_name like 'QA AUDIT%'
);

delete from public.merchants where business_name like 'QA AUDIT%';


-- ----------------------------------------------------------------------------
-- 1. Una bodega por cuenta
--
--    PROBLEMA: merchants.user_id no tiene UNIQUE. Un segundo registro con la
--    misma cuenta deja dos bodegas; la app pedía la bodega con .single(), que
--    revienta con dos filas, y el usuario quedaba rebotando entre /dashboard y
--    /login sin poder entrar nunca más.
--    El lado del cliente ya se arregló (src/lib/merchant.ts), pero sin esta
--    restricción la base sigue aceptando duplicados y los datos del bodeguero
--    se parten en dos cuadernos.
-- ----------------------------------------------------------------------------

-- Primero, ver si ya hay cuentas con más de una bodega:
--   select user_id, count(*) from public.merchants group by user_id having count(*) > 1;
-- Si sale alguna, decide con cuál te quedas antes de correr el ALTER.

alter table public.merchants
  add constraint merchants_user_id_unico unique (user_id);


-- ----------------------------------------------------------------------------
-- 2. Que nadie se regale el plan pagado
--
--    PROBLEMA (probado en vivo): con su propia sesión, un usuario puede correr
--
--      await supabase.from('merchants')
--        .update({ subscription_status: 'active_yearly',
--                  trial_ends_at: '2099-01-01' })
--        .eq('id', <su id>)
--
--    y queda con plan anual gratis para siempre. Hoy no duele porque el piloto
--    es gratuito y la pantalla de planes está apagada, pero el día que cobres
--    esto es la puerta de atrás a tu facturación. Arréglalo ANTES de encender
--    Mercado Pago, no después.
--
--    SOLUCIÓN: un trigger que revierte cualquier cambio a esas dos columnas
--    hecho por un usuario normal. Solo el service_role (tu webhook de pago,
--    que corre en un servidor con la clave secreta) puede moverlas.
-- ----------------------------------------------------------------------------
create or replace function public.proteger_suscripcion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role'
     is distinct from 'service_role' then
    new.subscription_status := old.subscription_status;
    new.trial_ends_at       := old.trial_ends_at;
    new.user_id             := old.user_id;
    new.created_at          := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists merchants_proteger_suscripcion on public.merchants;

create trigger merchants_proteger_suscripcion
  before update on public.merchants
  for each row execute function public.proteger_suscripcion();


-- ----------------------------------------------------------------------------
-- 3. Montos con sentido
--
--    PROBLEMA: la app valida los montos en el navegador, y el navegador es del
--    usuario. Nada impide mandar amount = -5000 o un fiado negativo por la API.
--    Además un monto negativo descuadra la caja del día sin dejar rastro.
-- ----------------------------------------------------------------------------
alter table public.transactions
  add constraint transactions_monto_positivo check (amount > 0);

alter table public.customers_debts
  add constraint customers_debts_saldo_no_negativo check (balance >= 0);


-- ----------------------------------------------------------------------------
-- 4. Índices para que la caja del día abra rápido
--
--    La pantalla principal siempre pide: movimientos de ESTA bodega dentro de
--    ESTE día, ordenados por hora. Sin índice eso es un escaneo completo de la
--    tabla, y crece con cada venta de cada bodeguero.
-- ----------------------------------------------------------------------------
create index if not exists transactions_bodega_fecha_idx
  on public.transactions (merchant_id, created_at desc);

create index if not exists customers_debts_bodega_idx
  on public.customers_debts (merchant_id, updated_at desc);

create index if not exists merchants_user_id_idx
  on public.merchants (user_id);


-- ----------------------------------------------------------------------------
-- 5. Comprobación final
--    Después de correr todo, esto debe devolver las 3 restricciones nuevas.
-- ----------------------------------------------------------------------------
select conname, conrelid::regclass as tabla
from pg_constraint
where conname in (
  'merchants_user_id_unico',
  'transactions_monto_positivo',
  'customers_debts_saldo_no_negativo'
);


-- ----------------------------------------------------------------------------
-- 6. Abonos y fiados anotados sin señal (exactamente una vez)
--
--    PROBLEMA: la app ahora deja anotar "Fió más" y "Abonó" sin internet y los
--    sube cuando vuelve la señal. Un saldo no es una fila nueva: es un número
--    que se mueve. Eso trae dos peligros que el navegador no puede resolver
--    solo:
--
--      a) Pisar al otro celular. Si el teléfono guarda "el saldo queda en 20"
--         calculado con datos de hace dos horas, y mientras tanto el hijo cobró
--         S/ 30 desde otro celular, subir ese 20 borra el cobro sin que nadie
--         se entere. Por eso el cliente manda la DIFERENCIA (+10, -30) y nunca
--         el total.
--
--      b) Cobrar dos veces. Si la respuesta del servidor se pierde después de
--         que el UPDATE ya se aplicó, el reintento vuelve a sumar la misma
--         diferencia. En los INSERT eso no pasa (el id lo genera el teléfono y
--         la llave primaria rechaza el duplicado); acá hace falta una bitácora.
--
--    SOLUCIÓN: una bitácora con el id de la operación como llave primaria, y
--    una función que anota en la bitácora y mueve el saldo en la MISMA
--    transacción. El segundo intento choca con el id y no mueve nada.
--
--    Mientras esta sección no esté corrida, la app cae a un compare-and-swap
--    (lee el saldo y escribe condicionando a que no haya cambiado). Eso ya
--    cubre (a), pero no (b). Corre esto para cerrar esa ventana.
-- ----------------------------------------------------------------------------
create table if not exists public.debt_sync_ops (
  op_id       uuid primary key,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  debt_id     uuid not null references public.customers_debts(id) on delete cascade,
  delta       numeric(12,2) not null,
  applied_at  timestamptz not null default now()
);

alter table public.debt_sync_ops enable row level security;

drop policy if exists debt_sync_ops_propias on public.debt_sync_ops;

create policy debt_sync_ops_propias on public.debt_sync_ops
  for all
  using (
    merchant_id in (select id from public.merchants where user_id = auth.uid())
  )
  with check (
    merchant_id in (select id from public.merchants where user_id = auth.uid())
  );

create index if not exists debt_sync_ops_fiado_idx
  on public.debt_sync_ops (debt_id, applied_at desc);

-- `security invoker` a propósito: la función tiene que seguir obedeciendo las
-- políticas RLS del usuario. Si fuera `security definer`, cualquiera podría
-- mover el saldo de una bodega ajena pasando su id.
create or replace function public.aplicar_movimiento_fiado(
  p_op_id   uuid,
  p_debt_id uuid,
  p_delta   numeric
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_merchant uuid;
  v_saldo    numeric;
begin
  select merchant_id into v_merchant
  from public.customers_debts
  where id = p_debt_id;

  if v_merchant is null then
    raise exception 'FIADO_NO_ENCONTRADO'
      using hint = 'Ese cliente ya no existe o no es de esta bodega.';
  end if;

  insert into public.debt_sync_ops (op_id, merchant_id, debt_id, delta)
  values (p_op_id, v_merchant, p_debt_id, p_delta)
  on conflict (op_id) do nothing;

  if not found then
    -- Reintento de algo que ya se aplicó. Devolvemos el saldo tal cual está.
    select balance into v_saldo from public.customers_debts where id = p_debt_id;
    return v_saldo;
  end if;

  -- Se suma sobre el saldo que haya AHORA, no sobre el que vio el teléfono.
  -- Si el resultado quedara negativo, el check `customers_debts_saldo_no_negativo`
  -- revienta y se cae también el registro en la bitácora: el reintento vuelve
  -- a empezar limpio y la app avisa en pantalla en vez de recortar en silencio.
  update public.customers_debts
     set balance    = round(balance + p_delta, 2),
         updated_at = now()
   where id = p_debt_id
  returning balance into v_saldo;

  return v_saldo;
end;
$$;

grant execute on function public.aplicar_movimiento_fiado(uuid, uuid, numeric)
  to authenticated;


-- ----------------------------------------------------------------------------
-- 7. Comprobación de la sección 6
--    Debe devolver una fila: la función instalada.
-- ----------------------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'aplicar_movimiento_fiado';
