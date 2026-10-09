-- ============================================================================
--  Mi Bodega Digital · Copia automática de la hoja de reclamación
--  Preparado el 2026-10-09, NO ejecutado en ningún proyecto real.
--
--  Requiere 03-legal-y-cuenta.sql ya aplicado. Se puede correr más de una vez.
--  No toca RLS ni políticas: `complaints` sigue sin acceso para anon/authenticated
--  y solo la Edge Function `copia-reclamo` (service_role) lee y marca la fila.
--
--  Reglamento del Libro de Reclamaciones, art. 4-B: el proveedor que vende en
--  línea envía al consumidor una copia automática de su hoja por correo.
--
--  PASOS DEL DUEÑO (nada de esto se ejecutó desde el repositorio):
--    1. Pegar este archivo en Supabase → SQL Editor y ejecutarlo.
--    2. En la terminal, con el CLI de Supabase vinculado al proyecto:
--         supabase secrets set RESEND_API_KEY=<clave de Resend> APP_URL=<URL de la app>
--       (APP_URL ya existe si desplegaste las otras funciones. El dominio
--       gaia-nexus.com debe estar verificado en Resend para enviar desde
--       no-reply@gaia-nexus.com.) Opcional: CONTACT_EMAIL para cambiar el
--       correo que recibe copia oculta y al que responden los consumidores
--       (por defecto josegomez120@gmail.com).
--    3. supabase functions deploy copia-reclamo
--    4. Probar con una hoja de prueba propia y revisar la bandeja.
-- ============================================================================
begin;

-- Marca de "copia ya enviada". La función la fija ANTES de enviar (así dos
-- llamadas a la vez no mandan dos correos) y la borra si el envío falla.
alter table public.complaints add column if not exists copia_enviada_at timestamptz;

commit;
