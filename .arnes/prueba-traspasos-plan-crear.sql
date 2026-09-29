\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- TRASPASOS · EL PLAN LO CREA QUIEN SE ESCOJA; LO PUBLICADO, SOLO QUIEN MANDA
--
-- Cada bloque termina con un aviso numerado: el arnés exige que salgan
-- todos, porque un bloque que no llega a correr no falla, solo calla.
-- =====================================================================

/* «Espera este error»: corre un texto con la identidad de quien llama
   (es invoker, no definer) y exige que falle con ESE mensaje. Que falle
   con otro mensaje también es un fallo: una función que revienta por
   otra razón no está probando el candado. */
create or replace function public._espera(p_sql text, p_patron text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALLA: no falló y debía fallar: %', p_sql;
exception when others then
  if sqlerrm like 'FALLA:%' then raise; end if;
  if sqlerrm not like p_patron then
    raise exception 'FALLA: falló con otro mensaje (%) y se esperaba «%»: %', sqlerrm, p_patron, p_sql;
  end if;
end $$;
grant execute on function public._espera(text, text) to probador;

/* La huella del plan de un día: lo publicado, el borrador y los vacíos.
   Si un intento bloqueado toca algo, la huella cambia. */
create or replace function public._huella(p_fecha date)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select string_agg(turno || tipo || planeado || publicado::text || estado::text,
                                     ',' order by turno, tipo, publicado)
                     from public.traspasos_plan where fecha = p_fecha), '')
      || '|' ||
         coalesce((select string_agg(turno || vacios, ',' order by turno)
                     from public.traspasos_plan_vacios where fecha = p_fecha), '')
$$;
grant execute on function public._huella(date) to probador;

-- ---------- LA GENTE ----------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('22222222-2222-2222-2222-222222222222','creador@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','super@cdcontrol.local'),
  ('44444444-4444-4444-4444-444444444444','peon@cdcontrol.local'),
  ('55555555-5555-5555-5555-555555555555','planeador@cdcontrol.local'),
  ('66666666-6666-6666-6666-666666666666','bajado@cdcontrol.local'),
  ('77777777-7777-7777-7777-777777777777','inactivo@cdcontrol.local')
on conflict do nothing;

/* Un rol que SÍ trae «Editar» en el plan, para probar el camino por rol. */
insert into public.roles (clave, nombre, descripcion, manda, sistema, orden)
values ('planeador', 'Planeador', 'Arma el plan', false, false, 9)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, seccion, nivel)
values ('planeador', '/traspasos/plan', 'editar')
on conflict (rol, seccion) do update set nivel = 'editar';

insert into public.perfiles (id, usuario, nombre, rol, activo, permisos_extra) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true,'{}'),
  -- a esta PERSONA se le abrió el plan; su rol (operador) no lo tiene
  ('22222222-2222-2222-2222-222222222222','creador','Creador','operador',true,'{"/traspasos/plan":"editar"}'),
  ('33333333-3333-3333-3333-333333333333','super','Super','supervisor',true,'{}'),
  ('44444444-4444-4444-4444-444444444444','peon','Peon','operador',true,'{}'),
  ('55555555-5555-5555-5555-555555555555','planeador','Planeador','planeador',true,'{}'),
  -- su rol edita el plan, pero a ella en particular se le bajó a «ver»
  ('66666666-6666-6666-6666-666666666666','bajado','Bajado','planeador',true,'{"/traspasos/plan":"ver"}'),
  -- tiene el permiso, pero ya no trabaja aquí
  ('77777777-7777-7777-7777-777777777777','inactivo','Inactivo','operador',false,'{"/traspasos/plan":"editar"}')
on conflict (id) do update set rol = excluded.rol, activo = excluded.activo,
                               permisos_extra = excluded.permisos_extra;

insert into public.traspasos_tipos (clave, nombre, activo, orden) values
  ('pet','PET',true,1), ('casco','Casco vidrio',true,2)
on conflict (clave) do update set activo = true;

/* CLAVE PARA ENTENDER EL HUECO: el supervisor de la semilla ve el plan
   en «ver» y aun así tiene «editar» en otras pantallas, o sea que
   es_editor() es cierto para él. Sin las dos cosas la prueba no prueba. */
do $$
begin
  if (select nivel::text from public.rol_permisos
       where rol = 'supervisor' and seccion = '/traspasos/plan') is distinct from 'ver' then
    raise exception 'FALLA · el supervisor de la semilla debía ver el plan en «ver»';
  end if;
  if not exists (select 1 from public.rol_permisos
                  where rol = 'supervisor' and nivel = 'editar') then
    raise exception 'FALLA · el supervisor de la semilla debía tener «editar» en alguna otra pantalla';
  end if;
  raise notice '0 · la semilla es la que se creía: supervisor ve el plan y edita en otro sitio';
end $$;

-- =====================================================================
-- 1-4, 5. EL CREADOR (permiso de persona, rol operador)
-- =====================================================================
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role probador;

do $$
declare
  d1 date := public.traspaso_hoy() + 10;
  v_huella text;
begin
  -- 1. UN DÍA SIN PLAN: arma y publica.
  perform public.traspaso_guardar_plan(d1,
    '[{"turno":"A","tipo":"pet","planeado":6},{"turno":"B","tipo":"casco","planeado":4}]'::jsonb,
    '[{"turno":"A","vacios":3}]'::jsonb);
  perform public.traspaso_publicar_plan(d1);
  if (select count(*) from public.traspasos_plan where fecha = d1 and publicado) <> 2 then
    raise exception 'FALLA 1 · no quedó publicado';
  end if;
  if public.traspaso_plan_publicado(d1) is not true then
    raise exception 'FALLA 1 · traspaso_plan_publicado dice que no está publicado';
  end if;
  raise notice '1 · el creador arma y publica un día sin plan';

  -- 2. LO PUBLICADO YA NO LO CAMBIA: ni el borrador, ni publicar, ni borrar.
  v_huella := public._huella(d1);
  perform public._espera(format($q$select public.traspaso_guardar_plan(%L, '[{"turno":"C","tipo":"pet","planeado":9}]'::jsonb, '[]'::jsonb)$q$, d1),
                         '%ya tiene el plan publicado%');
  perform public._espera(format('select public.traspaso_publicar_plan(%L)', d1),
                         '%ya tiene el plan publicado%');
  perform public._espera(format('select public.traspaso_borrar_plan(%L)', d1),
                         '%ya tiene el plan publicado%');
  if public._huella(d1) <> v_huella then
    raise exception 'FALLA 2 · un intento bloqueado tocó el plan: antes % y ahora %', v_huella, public._huella(d1);
  end if;
  raise notice '2 · con el día publicado, el creador no guarda, no publica y no borra, y el plan no se movió';
end $$;

do $$
declare
  d2 date := public.traspaso_hoy() + 11;
  n int;
begin
  -- 3. ANTES DE PUBLICAR PUEDE CORREGIR SU BORRADOR: es suyo.
  perform public.traspaso_guardar_plan(d2, '[{"turno":"A","tipo":"pet","planeado":5}]'::jsonb, '[]'::jsonb);
  perform public.traspaso_guardar_plan(d2, '[{"turno":"A","tipo":"pet","planeado":7}]'::jsonb, '[{"turno":"B","vacios":1}]'::jsonb);
  if (select planeado from public.traspasos_plan where fecha = d2 and not publicado) is distinct from 7 then
    raise exception 'FALLA 3 · el borrador no se pudo corregir';
  end if;
  n := public.traspaso_borrar_plan(d2);
  if n <> 1 or public._huella(d2) <> '|' then
    raise exception 'FALLA 3 · no pudo tirar su propio borrador (borró %, huella %)', n, public._huella(d2);
  end if;
  raise notice '3 · antes de publicar, el creador corrige y tira su propio borrador';
end $$;

do $$
declare
  d1 date := public.traspaso_hoy() + 10;
  d3 date := public.traspaso_hoy() + 12;
  d4 date := public.traspaso_hoy() + 13;
  v_huella text := public._huella(public.traspaso_hoy() + 10);
  r record; v_res text := '';
begin
  -- 4. VARIOS DÍAS: los nuevos se planean, el ya publicado se salta y no se toca.
  for r in select * from public.traspaso_plan_a_varios(array[d3, d1, d4],
             '[{"turno":"A","tipo":"pet","planeado":2}]'::jsonb, '[]'::jsonb) order by fecha
  loop
    v_res := v_res || r.fecha::text || '=' || r.resultado || ' ';
  end loop;
  if v_res <> d1::text || '=ya_tenia ' || d3::text || '=planeado ' || d4::text || '=planeado ' then
    raise exception 'FALLA 4 · resultado inesperado: %', v_res;
  end if;
  if public._huella(d1) <> v_huella then
    raise exception 'FALLA 4 · «varios días» tocó el día ya publicado';
  end if;
  perform public._espera(format($q$select * from public.traspaso_plan_a_varios(array[%L]::date[], '[{"turno":"A","tipo":"pet","planeado":2}]'::jsonb, '[]'::jsonb)$q$, d1),
                         '%ya tenían plan publicado%');
  raise notice '4 · varios días: planea los nuevos, salta el publicado y no lo toca';
end $$;

do $$
declare d1 date := public.traspaso_hoy() + 10; v_huella text;
begin
  -- 5. NO HAY PUERTA LATERAL: las tablas del plan no se escriben directo.
  v_huella := public._huella(d1);
  perform public._espera(format('update public.traspasos_plan set planeado = 99 where fecha = %L', d1), '%permission denied%');
  perform public._espera(format('delete from public.traspasos_plan where fecha = %L', d1), '%permission denied%');
  perform public._espera(format($q$insert into public.traspasos_plan (fecha, turno, tipo, planeado, publicado) values (%L,'C','pet',1,true)$q$, d1), '%permission denied%');
  perform public._espera(format('update public.traspasos_plan_vacios set vacios = 99 where fecha = %L', d1), '%permission denied%');
  perform public._espera(format('delete from public.traspasos_plan_vacios where fecha = %L', d1), '%permission denied%');
  if public._huella(d1) <> v_huella then
    raise exception 'FALLA 5 · una escritura directa cambió el plan';
  end if;
  raise notice '5 · escribir directo en las tablas del plan se rechaza y el plan no se movió';
end $$;

-- =====================================================================
-- 6. QUIEN MANDA SÍ CAMBIA LO PUBLICADO
-- =====================================================================
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;

do $$
declare
  d1 date := public.traspaso_hoy() + 10;
  n int;
begin
  perform public.traspaso_guardar_plan(d1, '[{"turno":"A","tipo":"pet","planeado":9}]'::jsonb, '[]'::jsonb);
  perform public.traspaso_publicar_plan(d1);
  if (select string_agg(turno || tipo || planeado, ',' order by turno) from public.traspasos_plan
       where fecha = d1 and publicado) is distinct from 'Apet9' then
    raise exception 'FALLA 6 · el administrador no pudo reemplazar lo publicado: %', public._huella(d1);
  end if;
  if exists (select 1 from public.traspasos_plan_vacios where fecha = d1) then
    raise exception 'FALLA 6 · el reemplazo debía dejar los vacíos como se mandaron (ninguno)';
  end if;
  n := public.traspaso_borrar_plan(d1);
  if n <> 1 or public._huella(d1) <> '|' then
    raise exception 'FALLA 6 · el administrador no pudo dejar el día sin plan (borró %)', n;
  end if;
  raise notice '6 · quien manda cambia, reemplaza y borra lo publicado';
end $$;

-- 6b. Un BORRADOR de quien manda encima de un día publicado: el creador no lo pisa.
do $$
declare d5 date := public.traspaso_hoy() + 14; v_huella text;
begin
  perform public.traspaso_guardar_plan(d5, '[{"turno":"A","tipo":"pet","planeado":3}]'::jsonb, '[]'::jsonb);
  perform public.traspaso_publicar_plan(d5);
  perform public.traspaso_guardar_plan(d5, '[{"turno":"A","tipo":"pet","planeado":8}]'::jsonb, '[]'::jsonb); -- borrador nuevo
  v_huella := public._huella(d5);
  if v_huella not like '%pet3true%' or v_huella not like '%pet8false%' then
    raise exception 'FALLA 6b · se esperaba plan publicado y borrador del administrador: %', v_huella;
  end if;
  create temp table _huella_6b as select v_huella as h, d5 as f;
  grant select on _huella_6b to probador;
  raise notice '6b · el administrador deja un borrador sobre un día publicado';
end $$;

reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role probador;
do $$
declare d5 date := (select f from _huella_6b);
begin
  perform public._espera(format($q$select public.traspaso_guardar_plan(%L, '[{"turno":"C","tipo":"casco","planeado":1}]'::jsonb, '[]'::jsonb)$q$, d5),
                         '%ya tiene el plan publicado%');
  perform public._espera(format('select public.traspaso_publicar_plan(%L)', d5), '%ya tiene el plan publicado%');
  if public._huella(d5) <> (select h from _huella_6b) then
    raise exception 'FALLA 6c · el creador tocó el borrador del administrador';
  end if;
  raise notice '6c · el creador no pisa ni publica el borrador que dejó quien manda';
end $$;

-- =====================================================================
-- 7. EL HUECO: es_editor() SIN PERMISO DE PLAN NO PLANEA
-- =====================================================================
reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare d6 date := public.traspaso_hoy() + 20;
begin
  if not public.es_editor() then
    raise exception 'FALLA 7 · la prueba no prueba: el supervisor debía ser es_editor()';
  end if;
  if public.mi_nivel_pantalla('/traspasos/plan') <> 'ver' then
    raise exception 'FALLA 7 · el supervisor debía ver el plan solo en «ver»';
  end if;
  perform public._espera(format($q$select public.traspaso_guardar_plan(%L, '[{"turno":"A","tipo":"pet","planeado":6}]'::jsonb, '[]'::jsonb)$q$, d6),
                         '%permiso de edición en Plan%');
  perform public._espera(format('select public.traspaso_publicar_plan(%L)', d6), '%permiso de edición en Plan%');
  perform public._espera(format('select public.traspaso_borrar_plan(%L)', d6), '%permiso de edición en Plan%');
  perform public._espera($q$select * from public.traspaso_plan_a_varios(array[current_date + 30]::date[], '[{"turno":"A","tipo":"pet","planeado":2}]'::jsonb, '[]'::jsonb)$q$,
                         '%permiso de edición en Plan%');
  if exists (select 1 from public.traspasos_plan where fecha = d6) then
    raise exception 'FALLA 7 · el supervisor dejó plan escrito';
  end if;
  raise notice '7 · un editor de otras pantallas (es_editor) que ve el plan en solo lectura ya no lo puede armar';
end $$;

-- 8. Un operador sin nada.
reset role;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare d6 date := public.traspaso_hoy() + 20;
begin
  perform public._espera(format($q$select public.traspaso_guardar_plan(%L, '[{"turno":"A","tipo":"pet","planeado":6}]'::jsonb, '[]'::jsonb)$q$, d6),
                         '%permiso de edición en Plan%');
  perform public._espera(format('select public.traspaso_borrar_plan(%L)', d6), '%permiso de edición en Plan%');
  raise notice '8 · un operador sin permiso de plan no planea';
end $$;

-- =====================================================================
-- 9. EL PERMISO POR ROL: crea; lo publicado no lo cambia
-- =====================================================================
reset role;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role probador;
do $$
declare d7 date := public.traspaso_hoy() + 21;
begin
  perform public.traspaso_guardar_plan(d7, '[{"turno":"B","tipo":"pet","planeado":4}]'::jsonb, '[]'::jsonb);
  perform public.traspaso_publicar_plan(d7);
  perform public._espera(format('select public.traspaso_borrar_plan(%L)', d7), '%ya tiene el plan publicado%');
  perform public._espera(format($q$select public.traspaso_guardar_plan(%L, '[{"turno":"B","tipo":"pet","planeado":5}]'::jsonb, '[]'::jsonb)$q$, d7),
                         '%ya tiene el plan publicado%');
  raise notice '9 · el permiso por rol también crea, y lo publicado tampoco lo cambia';
end $$;

-- 10. La persona manda sobre el rol, también hacia abajo.
reset role;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
set role probador;
do $$
declare d8 date := public.traspaso_hoy() + 22;
begin
  perform public._espera(format($q$select public.traspaso_guardar_plan(%L, '[{"turno":"A","tipo":"pet","planeado":6}]'::jsonb, '[]'::jsonb)$q$, d8),
                         '%permiso de edición en Plan%');
  raise notice '10 · a quien se le bajó el plan a «ver» no planea aunque su rol sí';
end $$;

-- 11. Quien ya no está activo no planea, aunque conserve el permiso.
reset role;
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
set role probador;
do $$
declare d8 date := public.traspaso_hoy() + 22;
begin
  perform public._espera(format($q$select public.traspaso_guardar_plan(%L, '[{"turno":"A","tipo":"pet","planeado":6}]'::jsonb, '[]'::jsonb)$q$, d8),
                         '%permiso de edición en Plan%');
  raise notice '11 · una persona inactiva no planea aunque conserve el permiso';
end $$;

-- =====================================================================
-- 12-14. QUÉ CUENTA COMO «PUBLICADO»
-- =====================================================================
reset role;
do $$
declare
  d9  date := public.traspaso_hoy() + 30;
  d10 date := public.traspaso_hoy() + 31;
begin
  -- Un día cuyas líneas publicadas están todas ANULADAS es un día sin plan.
  insert into public.traspasos_plan (fecha, turno, tipo, planeado, publicado, estado, motivo_anulacion)
  values (d9, 'A', 'pet', 5, true, 'anulado', 'prueba');
  -- Un día con una línea publicada en CERO tampoco tiene plan.
  insert into public.traspasos_plan (fecha, turno, tipo, planeado, publicado)
  values (d10, 'A', 'pet', 0, true);
  raise notice '12 · preparados dos días raros: uno solo con líneas anuladas y otro solo con una línea en cero';
end $$;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role probador;
do $$
declare
  d9  date := public.traspaso_hoy() + 30;
  d10 date := public.traspaso_hoy() + 31;
begin
  if public.traspaso_plan_publicado(d9) then raise exception 'FALLA 13 · una línea anulada cuenta como plan publicado'; end if;
  perform public.traspaso_guardar_plan(d9, '[{"turno":"C","tipo":"pet","planeado":2}]'::jsonb, '[]'::jsonb);
  raise notice '13 · un día con el plan solo anulado se puede volver a armar';

  if public.traspaso_plan_publicado(d10) then raise exception 'FALLA 14 · una línea en cero cuenta como plan publicado'; end if;
  perform public.traspaso_guardar_plan(d10, '[{"turno":"C","tipo":"pet","planeado":2}]'::jsonb, '[]'::jsonb);
  raise notice '14 · un día con una sola línea publicada en cero se puede armar (planear varios días lo trata igual)';
end $$;

reset role;
reset request.jwt.claim.sub;
