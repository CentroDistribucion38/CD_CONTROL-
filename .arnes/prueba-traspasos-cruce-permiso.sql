\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- LA LLAVE DE «EL CRUCE»
--
-- A diferencia de la base del conteo, aquí el nivel se copia TAL CUAL:
-- subir el corte de SAP es escribir, así que quien edita Traspasos tiene
-- que poder importar. Recortarlo a 'ver' dejaría la pantalla a la vista
-- y sin el botón, que es peor que no darla.
-- =====================================================================

do $$
declare v_falla text := ''; v_n text;
begin
  /* 1. EL QUE EDITA TRASPASOS EDITA EL CRUCE. */
  select nivel into v_n from public.rol_permisos
   where rol = 'jefepatio' and seccion = '/traspasos/cruce';
  if v_n is distinct from 'editar' then
    v_falla := v_falla || ' 1(al que edita Traspasos le quedo «' || coalesce(v_n,'nada') || '» y debe editar)'; end if;

  /* 2. LOS ROLES DE VERDAD, los de 02-roles.sql. */
  select count(*)::text into v_n
    from public.rol_permisos p
   where p.seccion = '/traspasos'
     and not exists (select 1 from public.rol_permisos q
                      where q.rol = p.rol and q.seccion = '/traspasos/cruce');
  if v_n <> '0' then
    v_falla := v_falla || ' 2(' || v_n || ' rol(es) con Traspasos se quedaron sin el cruce)'; end if;

  /* 3. EL ROL CON TRASPASOS CERRADO. */
  select nivel into v_n from public.rol_permisos
   where rol = 'cerradorol' and seccion = '/traspasos/cruce';
  if v_n is distinct from 'ninguno' then
    v_falla := v_falla || ' 3(al rol con Traspasos cerrado le quedo «' || coalesce(v_n,'nada') || '»)'; end if;

  /* 4. EL QUE NO TIENE TRASPASOS no recibe nada. */
  if exists (select 1 from public.rol_permisos
              where rol = 'porteria' and seccion = '/traspasos/cruce') then
    v_falla := v_falla || ' 4(a porteria, que no tiene Traspasos, le llego el cruce)'; end if;

  /* 5. LO PUESTO A MANO NO SE PISA. */
  select nivel into v_n from public.rol_permisos
   where rol = 'yatiene' and seccion = '/traspasos/cruce';
  if v_n is distinct from 'editar' then
    v_falla := v_falla || ' 5(se piso el nivel puesto a mano: quedo «' || coalesce(v_n,'nada') || '»)'; end if;

  /* 6. LA PERSONA CON TRASPASOS CERRADO A MANO. */
  select permisos_extra ->> '/traspasos/cruce' into v_n
    from public.perfiles where usuario = 'cerrado';
  if v_n is distinct from 'ninguno' then
    v_falla := v_falla || ' 6(a la persona con Traspasos cerrado a mano le quedo «' || coalesce(v_n,'nada') || '»)'; end if;

  /* 7. LA PERSONA CON TRASPASOS ABIERTO A MANO, con su mismo nivel. */
  select permisos_extra ->> '/traspasos/cruce' into v_n
    from public.perfiles where usuario = 'abierto';
  if v_n is distinct from 'editar' then
    v_falla := v_falla || ' 7(a la persona con Traspasos en editar le quedo «' || coalesce(v_n,'nada') || '»)'; end if;

  /* 8. A QUIEN NO TENÍA PERMISOS PROPIOS no se le inventa ninguno:
        escribírselo lo saca del rol para siempre y nadie se acuerda. */
  select coalesce(permisos_extra::text, 'null') into v_n
    from public.perfiles where usuario = 'normal';
  if v_n not in ('null', '{}') then
    v_falla := v_falla || ' 8(a quien no tenia permisos propios se le invento uno: ' || v_n || ')'; end if;

  if v_falla <> '' then raise exception 'CRUCE:%', v_falla; end if;
  raise notice 'CRUCE ok';
end $$;

do $$ begin raise notice 'LA LLAVE DEL CRUCE: quedó donde tenía que quedar'; end $$;
