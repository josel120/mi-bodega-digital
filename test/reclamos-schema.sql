-- Libro de Reclamaciones (lo incluye test/cuenta-schema.sql después de aplicar 03).
-- El navegador anónimo registra y recibe su constancia, pero no lee nada.
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare
  base jsonb := jsonb_build_object(
    'consumerName', 'Ana Pérez', 'documentType', 'DNI', 'documentNumber', '12345678',
    'address', 'Av. Siempre Viva 123, Lima', 'phone', '987654321', 'email', 'Ana@Example.test',
    'isMinor', 'No', 'itemType', 'Servicio', 'itemDescription', 'Plan mensual',
    'claimType', 'Reclamo', 'detail', 'Me cobraron dos veces.', 'request', 'Devolución de S/ 29.',
    'responseChannel', 'Por correo electrónico', 'declaration', 'Acepto',
    'claimedAmount', '29.00', 'paymentDate', '2026-10-01');
  r1 jsonb; r2 jsonb; malo jsonb;
begin
  r1 := public.registrar_reclamo(base);
  r2 := public.registrar_reclamo(base || '{"claimType":"Queja"}');
  if r1->>'codigo' !~ '^MBD-[0-9]{4}-[0-9]{6}$' or r1->>'fecha' is null then raise exception 'Constancia inválida: %', r1; end if;
  if right(r2->>'codigo', 6)::int <> right(r1->>'codigo', 6)::int + 1 then raise exception 'Correlativo no consecutivo: % %', r1, r2; end if;
  if r1 ?| array['id', 'datos', 'email'] then raise exception 'La constancia devuelve datos de más'; end if;

  -- Cada caso inválido debe rechazarse en la base, no solo en el navegador.
  foreach malo in array array[
    base - 'detail',                                   -- falta obligatorio
    base || '{"detail":"   "}',                        -- obligatorio en blanco
    base || '{"claimType":"Sugerencia"}',              -- opción inexistente
    base || '{"declaration":"No"}',                    -- sin firma
    base || '{"isMinor":"Sí"}',                        -- menor sin apoderado
    base || '{"claimedAmount":"-5"}',                  -- monto negativo
    base || '{"claimedAmount":"1e3"}',                 -- monto raro
    base || '{"paymentDate":"2999-01-01"}',            -- fecha futura
    base || '{"campoExtra":"x"}',                      -- campo no previsto
    base || '{"phone":987654321}',                     -- no es texto
    base || jsonb_build_object('detail', repeat('x', 3001)),
    base || '{"email":"sin-arroba"}'
  ] loop
    begin
      perform public.registrar_reclamo(malo);
      raise exception 'Aceptó un reclamo inválido: %', malo - 'detail';
    exception
      when raise_exception or check_violation then
        if sqlerrm like 'Aceptó%' then raise; end if;
    end;
  end loop;
  -- Menor con apoderado sí pasa.
  perform public.registrar_reclamo(base || '{"isMinor":"Sí","guardianName":"Rosa Pérez","guardianContact":"999888777"}');
  -- Freno por correo: 3 registrados, 2 más pasan y el sexto se rechaza.
  perform public.registrar_reclamo(base);
  perform public.registrar_reclamo(base);
  begin
    perform public.registrar_reclamo(base);
    raise exception 'Sin freno por correo';
  exception when raise_exception then
    if sqlerrm <> 'RECLAMO_LIMITE' then raise; end if;
  end;
  -- Otro correo no queda bloqueado por el anterior.
  perform public.registrar_reclamo(base || '{"email":"otra@example.test"}');
end $$;
commit;

do $$ begin
  if has_table_privilege('anon', 'public.complaints', 'select')
     or has_table_privilege('authenticated', 'public.complaints', 'select')
     or has_table_privilege('anon', 'public.complaints', 'insert')
     or has_table_privilege('authenticated', 'public.complaints', 'update') then
    raise exception 'La tabla de reclamos quedó expuesta';
  end if;
  if (select count(*) from public.complaints) <> 6 then raise exception 'Cantidad de reclamos inesperada'; end if;
  if exists(select 1 from public.complaints where email <> lower(email)) then raise exception 'Correo sin normalizar'; end if;
end $$;

-- Lectura directa como anónimo: debe fallar por permisos.
begin;
set local role anon;
do $$ begin
  perform 1 from public.complaints;
  raise exception 'Anónimo pudo leer reclamos';
exception when insufficient_privilege then null;
end $$;
commit;
