-- =====================================================================
-- TRASPASOS · EL PLAN LO PUEDE CREAR QUIEN TÚ ESCOJAS; CAMBIARLO, SOLO
-- QUIEN MANDA
--
-- «Necesito que en Traspasos un usuario, o el que yo quiera, pueda hacer
--  el plan de traspasos pero que no lo pueda cambiar, a diferencia del
--  super admin, que sí puede.»
--
-- ---------------------------------------------------------------------
-- LA REGLA
-- ---------------------------------------------------------------------
-- «Crear» y «cambiar» se distinguen por una cosa que el plan ya tiene:
-- estar PUBLICADO.
--
--   · Un día SIN plan publicado: quien tenga «Editar» en /traspasos/plan
--     puede armar el borrador, corregirlo, publicarlo, borrarlo y
--     repetirlo en varios días.
--   · Un día CON plan publicado: solo quien manda (`manda()`) puede
--     guardar otro borrador encima, publicar, o dejar el día sin plan.
--
-- Publicar es el punto sin vuelta: el que publica un error no lo puede
-- arreglar solo, y ese es justo el trato que se pidió.
--
-- «Editar» en /traspasos/plan se le da a la PERSONA (Administración →
-- Usuarios) o a un rol (Administración → Roles), como cualquier permiso.
-- Dárselo a la persona tiene una ventaja: un permiso de rol vuelve a ese
-- rol `es_editor()` en los otros módulos que lo usan, y uno de persona no.
--
-- ---------------------------------------------------------------------
-- EL HUECO QUE HABÍA, Y QUE ESTO TAMBIÉN CIERRA
-- ---------------------------------------------------------------------
-- Las cuatro funciones que arman el plan pedían `es_editor()`, que no
-- mira la pantalla: es cierto con «Editar» en CUALQUIER sección. La
-- pantalla de plan solo dibuja la rejilla editable para quien tiene
-- «Editar» en /traspasos/plan (por defecto, solo el administrador), pero
-- un supervisor que la ve en solo lectura podía cambiar el plan llamando
-- la función a mano. La comentaba la propia semilla: «Planear es del
-- administrador». Ahora la base pide lo mismo que la pantalla.
--
-- Las tablas del plan NO tienen política de escritura (solo se escriben
-- por estas funciones), así que este candado no tiene puerta lateral.
--
-- Se puede correr varias veces.
-- =====================================================================

begin;

do $$
declare v_falta text := '';
begin
  if to_regprocedure('public.mi_nivel_pantalla(text)') is null then
    raise exception 'Falta 2026-09-roles-supervisor-borrable.sql: sin mi_nivel_pantalla no hay permiso por persona.';
  end if;
  if to_regprocedure('public.manda()') is null then
    raise exception 'Falta supabase/02-roles.sql: no existe manda().';
  end if;
  if to_regclass('public.traspasos_plan_vacios') is null then
    raise exception 'Falta 2026-09-traspasos-plan-rejilla.sql: el plan todavía no es una rejilla.';
  end if;
  if to_regprocedure('public.traspaso_guardar_plan(date, jsonb, jsonb)') is null then v_falta := v_falta || ' traspaso_guardar_plan'; end if;
  if to_regprocedure('public.traspaso_publicar_plan(date)') is null then v_falta := v_falta || ' traspaso_publicar_plan'; end if;
  if to_regprocedure('public.traspaso_borrar_plan(date)') is null then v_falta := v_falta || ' traspaso_borrar_plan'; end if;
  if to_regprocedure('public.traspaso_plan_a_varios(date[], jsonb, jsonb)') is null then v_falta := v_falta || ' traspaso_plan_a_varios'; end if;
  if v_falta <> '' then
    raise exception 'Faltan las migraciones del plan (rejilla, varios días y borrar): no existe%', v_falta;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. LAS DOS PREGUNTAS, UNA SOLA VEZ
--
-- Todas las funciones del plan preguntan lo mismo; escrito en cada una,
-- el día que la regla cambie una se queda con la vieja.
-- ---------------------------------------------------------------------

/* ¿HAY PLAN PUBLICADO ESE DÍA? Lo que cuenta es lo que ve el turno, no
   el borrador. Una línea en cero no se guarda nunca (la ausencia dice lo
   mismo), y aun así se pregunta por `planeado > 0` con la misma regla que
   usa «planear varios días» para saltarse un día. */
create or replace function public.traspaso_plan_publicado(p_fecha date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.traspasos_plan p
                  where p.fecha = p_fecha and p.publicado
                    and p.estado = 'registrado' and p.planeado > 0)
$$;

revoke all on function public.traspaso_plan_publicado(date) from public;
grant execute on function public.traspaso_plan_publicado(date) to authenticated;

/* ¿PUEDE ARMAR PLAN? Quien manda, o quien tiene «Editar» en la pantalla
   del plan —lo de su persona primero y si no lo de su rol, la misma regla
   que dibuja la pantalla—. */
create or replace function public.traspaso_plan_puede_armar()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.manda()
      or coalesce(public.mi_nivel_pantalla('/traspasos/plan'), 'ninguno') = 'editar'
$$;

revoke all on function public.traspaso_plan_puede_armar() from public;
grant execute on function public.traspaso_plan_puede_armar() to authenticated;

/* EL CANDADO. Sin fecha —«planear varios días», que ya se salta por su
   cuenta los días publicados— pide solo el permiso; con fecha pide además
   que el día no esté publicado, salvo para quien manda. */
create or replace function public.traspaso_plan_exige(p_fecha date default null)
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.manda() then return; end if;

  if not public.traspaso_plan_puede_armar() then
    raise exception 'Armar el plan requiere permiso de edición en Plan';
  end if;

  if p_fecha is not null and public.traspaso_plan_publicado(p_fecha) then
    raise exception 'Ese día ya tiene el plan publicado. Solo el administrador puede cambiarlo o borrarlo';
  end if;
end $$;

revoke all on function public.traspaso_plan_exige(date) from public;
grant execute on function public.traspaso_plan_exige(date) to authenticated;


-- ---------------------------------------------------------------------
-- 2. GUARDAR EL BORRADOR
--    (el cuerpo es el de 2026-09-traspasos-plan-rejilla.sql; solo cambia
--     la puerta)
-- ---------------------------------------------------------------------
create or replace function public.traspaso_guardar_plan(
  p_fecha   date,
  p_lineas  jsonb,            -- [{"turno":"A","tipo":"pet","planeado":6}, …]
  p_vacios  jsonb default '[]'::jsonb  -- [{"turno":"A","vacios":2}, …]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r       jsonb;
  v_turno text;
  v_n     integer := 0;
begin
  perform public.traspaso_plan_exige(p_fecha);

  /* Se borra el borrador anterior del día y se vuelve a escribir. Es
     más simple y más seguro que ir comparando línea por línea: lo que
     manda es la rejilla que la persona está viendo.
     LO YA PUBLICADO NO SE TOCA aquí —se reemplaza al publicar—, así
     que mientras alguien arma el borrador, el turno sigue viendo el
     plan que estaba vigente. */
  delete from public.traspasos_plan
   where fecha = p_fecha and not publicado and estado = 'registrado';

  for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_turno := upper(btrim(r->>'turno'));
    if v_turno not in ('A','B','C') then
      raise exception 'El turno % no existe: son A, B o C', r->>'turno';
    end if;
    if not exists (select 1 from public.traspasos_tipos
                    where clave = r->>'tipo' and activo) then
      raise exception 'El tipo % no existe o está desactivado', r->>'tipo';
    end if;
    /* El cero no se guarda: la ausencia de la línea dice lo mismo. */
    continue when coalesce((r->>'planeado')::int, 0) <= 0;

    insert into public.traspasos_plan
      (fecha, turno, tipo, planeado, publicado, creado_por)
    values
      (p_fecha, v_turno, r->>'tipo', (r->>'planeado')::int, false, auth.uid());
    v_n := v_n + 1;
  end loop;

  delete from public.traspasos_plan_vacios where fecha = p_fecha;
  for r in select * from jsonb_array_elements(coalesce(p_vacios, '[]'::jsonb))
  loop
    v_turno := upper(btrim(r->>'turno'));
    continue when v_turno not in ('A','B','C');
    continue when coalesce((r->>'vacios')::int, 0) <= 0;
    insert into public.traspasos_plan_vacios (fecha, turno, vacios, creado_por)
    values (p_fecha, v_turno, (r->>'vacios')::int, auth.uid());
  end loop;

  return v_n;
end $$;

grant execute on function public.traspaso_guardar_plan(date, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. PUBLICAR
--    (mismo cuerpo que en la rejilla; solo cambia la puerta)
-- ---------------------------------------------------------------------
create or replace function public.traspaso_publicar_plan(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  perform public.traspaso_plan_exige(p_fecha);

  select count(*) into v_n from public.traspasos_plan
   where fecha = p_fecha and not publicado and estado = 'registrado';
  if v_n = 0 then
    raise exception 'No hay nada sin publicar en ese día';
  end if;

  delete from public.traspasos_plan
   where fecha = p_fecha and publicado and estado = 'registrado';

  update public.traspasos_plan
     set publicado = true, publicado_en = now(), publicado_por = auth.uid()
   where fecha = p_fecha and not publicado and estado = 'registrado';

  return v_n;
end $$;

grant execute on function public.traspaso_publicar_plan(date) to authenticated;


-- ---------------------------------------------------------------------
-- 4. BORRAR EL PLAN DEL DÍA
--    (mismo cuerpo que en 2026-09-traspasos-borrar-plan.sql)
--
-- Quien arma puede tirar su propio borrador de un día sin publicar; un
-- día publicado solo lo deja sin plan quien manda.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_borrar_plan(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  perform public.traspaso_plan_exige(p_fecha);

  if p_fecha is null then
    raise exception 'Hay que decir de qué día';
  end if;

  /* SE VA TODO LO DEL DÍA: lo publicado y el borrador. Borrar solo lo
     publicado dejaría un borrador huérfano que reaparecería en la
     rejilla la próxima vez que alguien abriera ese día, y parecería que
     el borrado no sirvió. */
  delete from public.traspasos_plan where fecha = p_fecha;
  get diagnostics v_n = row_count;

  /* Los vacíos previstos son parte del plan del día, no un dato aparte.
     Si se quedaran, el día seguiría diciendo "se esperaban 3 vacíos" sin
     un plan que los explique. */
  delete from public.traspasos_plan_vacios where fecha = p_fecha;

  return v_n;
end $$;

revoke all on function public.traspaso_borrar_plan(date) from public;
grant execute on function public.traspaso_borrar_plan(date) to authenticated;


-- ---------------------------------------------------------------------
-- 5. PLANEAR VARIOS DÍAS
--    (mismo cuerpo que en 2026-09-traspasos-plan-varios-dias.sql)
--
-- Esta ya se salta por su cuenta los días con plan publicado —para todo
-- el mundo, también para quien manda—, así que aquí basta con pedir el
-- permiso de armar: un día publicado nunca se cambia por este camino.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_plan_a_varios(
  p_fechas  date[],
  p_lineas  jsonb,                       -- [{"turno":"A","tipo":"pet","planeado":6}, …]
  p_vacios  jsonb default '[]'::jsonb    -- [{"turno":"A","vacios":2}, …]
)
returns table (fecha date, resultado text, lineas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  f       date;
  r       jsonb;
  v_turno text;
  v_n     integer;
  v_total integer := 0;
begin
  perform public.traspaso_plan_exige();

  if coalesce(array_length(p_fechas, 1), 0) = 0 then
    raise exception 'No se escogió ningún día';
  end if;

  /* Un tope con una razón: un año. Más que eso no es una planeación,
     es un dedo que se resbaló en el calendario — y serían miles de
     filas escritas de un toque. */
  if array_length(p_fechas, 1) > 366 then
    raise exception 'Son % días. De una sola vez se pueden planear hasta 366',
      array_length(p_fechas, 1);
  end if;

  /* SE VALIDA TODO ANTES DE ESCRIBIR NADA. Si el turno o el tipo están
     mal, el error sale una vez y no una por cada día — y sobre todo,
     sale antes de haber escrito el primero. */
  for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_turno := upper(btrim(r->>'turno'));
    if v_turno not in ('A','B','C') then
      raise exception 'El turno % no existe: son A, B o C', r->>'turno';
    end if;
    if not exists (select 1 from public.traspasos_tipos
                    where clave = r->>'tipo' and activo) then
      raise exception 'El tipo % no existe o está desactivado', r->>'tipo';
    end if;
  end loop;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x
     where coalesce((x.value->>'planeado')::int, 0) > 0
  ) then
    raise exception 'La rejilla está vacía: no hay nada que aplicar';
  end if;

  foreach f in array p_fechas
  loop
    /* YA TENÍA PLAN: no se toca y se dice. */
    if exists (select 1 from public.traspasos_plan p
                where p.fecha = f and p.publicado
                  and p.estado = 'registrado' and p.planeado > 0) then
      fecha := f; resultado := 'ya_tenia'; lineas := 0;
      return next;
      continue;
    end if;

    /* El borrador de ese día, si lo hubiera, se va: la rejilla que se
       está aplicando es la que manda, y dejar un borrador viejo debajo
       de un plan publicado solo confunde al que vuelva a ese día.

       CON ALIAS, Y NO POR ADORNO: esta función DEVUELVE una columna que
       se llama `fecha`, así que un `where fecha = f` a secas es
       ambiguo —Postgres no sabe si es la columna de la tabla o la de
       salida— y revienta en tiempo de ejecución, no al crearla. */
    delete from public.traspasos_plan p
     where p.fecha = f and p.estado = 'registrado';

    v_n := 0;
    for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
    loop
      continue when coalesce((r->>'planeado')::int, 0) <= 0;
      insert into public.traspasos_plan
        (fecha, turno, tipo, planeado, publicado, publicado_en, publicado_por, creado_por)
      values
        (f, upper(btrim(r->>'turno')), r->>'tipo', (r->>'planeado')::int,
         true, now(), auth.uid(), auth.uid());
      v_n := v_n + 1;
    end loop;

    delete from public.traspasos_plan_vacios where traspasos_plan_vacios.fecha = f;
    for r in select * from jsonb_array_elements(coalesce(p_vacios, '[]'::jsonb))
    loop
      v_turno := upper(btrim(r->>'turno'));
      continue when v_turno not in ('A','B','C');
      continue when coalesce((r->>'vacios')::int, 0) <= 0;
      insert into public.traspasos_plan_vacios (fecha, turno, vacios, creado_por)
      values (f, v_turno, (r->>'vacios')::int, auth.uid());
    end loop;

    v_total := v_total + 1;
    fecha := f; resultado := 'planeado'; lineas := v_n;
    return next;
  end loop;

  if v_total = 0 then
    raise exception 'Los % días escogidos ya tenían plan publicado. Ninguno se cambió',
      array_length(p_fechas, 1);
  end if;
end $$;

revoke all on function public.traspaso_plan_a_varios(date[], jsonb, jsonb) from public;
grant execute on function public.traspaso_plan_a_varios(date[], jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 6. COMPROBACIÓN FINAL — SE PARA, NO AVISA
--
-- Avisar y seguir dejaría alguna de las cuatro puertas con el candado
-- viejo, y eso no se ve desde ninguna pantalla.
-- ---------------------------------------------------------------------
do $$
declare v_viejas text; v_sobrecargas int;
begin
  select string_agg(p.proname, ', ') into v_viejas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('traspaso_guardar_plan', 'traspaso_publicar_plan',
                       'traspaso_borrar_plan', 'traspaso_plan_a_varios')
     and p.prosrc like '%es_editor()%';
  if v_viejas is not null then
    raise exception 'Siguen con el candado viejo (es_editor): %', v_viejas;
  end if;

  select count(*) into v_sobrecargas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('traspaso_guardar_plan', 'traspaso_publicar_plan',
                       'traspaso_borrar_plan', 'traspaso_plan_a_varios');
  if v_sobrecargas <> 4 then
    raise exception 'Se esperaban 4 funciones del plan y hay %: quedó una versión repetida.', v_sobrecargas;
  end if;

  raise notice 'Listo: el plan lo crea quien tenga Editar en Plan y lo publicado solo lo cambia quien manda.';
end $$;

commit;
