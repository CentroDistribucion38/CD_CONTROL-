\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- LA SALIDA, CON DOS FIRMAS
--
-- «Quita lo de Verificación, que solo sean dos firmas, dos procesos.»
--
-- Lo que se comprueba no es «¿deja validar?» —eso ya lo dejaba— sino
-- las cuatro cosas que se pueden romper al quitar un paso de en medio:
--   · que la validación NO siga esperando al verificador;
--   · que la regla de las DOS PERSONAS siga en pie —quien pesó no
--     valida—, que es la razón de ser de la cadena;
--   · que la firma del verificador quede rechazada, y con un mensaje
--     que diga qué pasó y no «no tienes permiso»;
--   · que lo ya verificado se siga leyendo, y que una salida terminada
--     diga 2 de 2 y no 2 de 3.
-- =====================================================================

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('55555555-5555-5555-5555-555555555555','val@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true),
  ('55555555-5555-5555-5555-555555555555','val','Valida','validador',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.roturas_tolvas (codigo, modelo, tara_kg, orden) values
  ('TOLVA-P1', 'Tolva estándar', 111, 90)
on conflict (codigo) do update set activo = true;

-- ---------------------------------------------------------------------
-- UNA SALIDA PESADA Y CERRADA POR EL SUPERVISOR
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare v_id uuid; v_falla text := '';
begin
  select a.id into v_id from public.salida_abrir('ZZZ001') a;
  perform public.salida_pesar(v_id, 'TOLVA-P1', 'ambar', 900);
  perform public.salida_firmar(v_id, 'supervisora', 'pesadas 1 tolva');

  -- 1. LA FIRMA DEL VERIFICADOR YA NO EXISTE, y lo dice así.
  begin
    perform public.salida_firmar(v_id, 'verificador');
    v_falla := v_falla || ' 1(todavia acepta la firma del verificador)';
  exception when others then
    if sqlerrm not like '%ya no existe%' then
      v_falla := v_falla || ' 1(el mensaje no dice que ya no existe: ' || sqlerrm || ')'; end if;
  end;

  -- 2. QUIEN PESÓ NO VALIDA. Es la regla que NO se quita.
  begin
    perform public.salida_firmar(v_id, 'validador');
    v_falla := v_falla || ' 2(quien peso pudo validar)';
  exception when others then
    if sqlerrm not like '%quien pesó no valida%' and sqlerrm not like '%rol para poner%' then
      v_falla := v_falla || ' 2(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla = '' then
    raise notice 'SUPERVISOR: bien. La firma del verificador ya no existe y quien peso no valida.';
  else
    raise exception 'SUPERVISOR FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- Y OTRA PERSONA LA VALIDA, SIN PASAR POR VERIFICACIÓN
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role probador;
do $$
declare
  v_id uuid; v_falla text := '';
  v_firmas int; v_completa boolean; v_mismo boolean; v_ver timestamptz;
begin
  select id into v_id from public.roturas_salidas where placa = 'ZZZ001';

  -- 3. SE VALIDA DE UNA: la validación ya no espera al verificador.
  perform public.salida_firmar(v_id, 'validador', 'sale');

  select firmas, completa, mismo_firmante, verificador_en
    into v_firmas, v_completa, v_mismo, v_ver
    from public.v_roturas_salidas where id = v_id;

  -- 4. Y LA VISTA CUENTA DOS. Si contara tres, una salida terminada
  --    diria «2 de 3» para siempre y nadie sabria que le falta.
  if v_firmas <> 2 then v_falla := v_falla || ' 4(firmas=' || v_firmas || ')'; end if;
  if not v_completa then v_falla := v_falla || ' 4b(no quedo completa)'; end if;
  if v_mismo then v_falla := v_falla || ' 4c(dice que firmo la misma persona y son dos)'; end if;
  if v_ver is not null then v_falla := v_falla || ' 4d(le puso firma de verificador)'; end if;

  if v_falla = '' then
    raise notice 'VALIDACION: bien. Se valida sin pasar por verificacion y la vista cuenta 2 de 2.';
  else
    raise exception 'VALIDACION FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- LO YA VERIFICADO SE SIGUE LEYENDO
--
-- Una salida de antes, con las tres firmas puestas, tiene que seguir
-- diciendo quién la verificó. Borrar esas columnas habría dejado los
-- meses pasados sin poder decirlo.
-- ---------------------------------------------------------------------
do $$
declare v_id uuid; v_ver uuid; v_firmas int;
begin
  insert into public.roturas_salidas
    (codigo, placa, estado, creada_por,
     supervisora_por, supervisora_en,
     verificador_por, verificador_en, verificador_nota,
     validador_por, validador_en)
  values
    ('SV-VIEJA', 'AAA111', 'cerrada', '33333333-3333-3333-3333-333333333333',
     '33333333-3333-3333-3333-333333333333', now() - interval '30 days',
     '11111111-1111-1111-1111-111111111111', now() - interval '30 days', 'revisada',
     '55555555-5555-5555-5555-555555555555', now() - interval '30 days')
  on conflict (codigo) do nothing;

  select verificador_por, firmas into v_ver, v_firmas
    from public.v_roturas_salidas where codigo = 'SV-VIEJA';
  if v_ver is null then
    raise exception 'La salida vieja perdio quien la verifico';
  end if;
  if v_firmas <> 2 then
    raise exception 'La salida vieja cuenta % firmas y ahora son 2', v_firmas;
  end if;
  raise notice 'LO VIEJO: bien. Sigue diciendo quien la verifico, y cuenta 2 firmas como todas.';
end $$;

-- ---------------------------------------------------------------------
-- EL ROL NO SE BORRÓ
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.roles where clave = 'verificador') then
    raise exception 'Se borro el rol verificador: tenia que quedarse, por si hay gente con el puesto';
  end if;
  raise notice 'ROL: bien. El verificador sigue existiendo, sin pantalla y sin firma que poner.';
end $$;
