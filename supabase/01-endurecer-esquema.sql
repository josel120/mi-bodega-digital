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
