-- =====================================================================
-- FACTURACIÓN VA DENTRO DE TRASPASOS
--
-- «No debías crearlo allí, sino en el mismo módulo.» La pantalla pasó de
-- /facturacion a /traspasos/facturacion, como una más de Traspasos,
-- después de Registrar.
--
-- LOS PERMISOS SE GUARDAN COMO EL TEXTO DE LA DIRECCIÓN, así que mudar la
-- pantalla sin mudar el permiso dejaría al rol Facturación sin su
-- pantalla, en silencio. Este archivo muda:
--   · el permiso de cada rol que tenía /facturacion,
--   · el permiso propio de cada persona que lo tuviera a mano,
--   · y la regla de quién confirma la salida, que pregunta por esa misma
--     dirección.
--
-- SOLO HACE FALTA si ya se había corrido 2026-09-traspasos-facturacion.sql
-- antes de este cambio. Si no, ese archivo ya trae la dirección nueva y
-- este no cambia nada. SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

do $bloque$
declare v_n int;
begin
  if to_regprocedure('public.traspaso_confirmar_salida(uuid, text)') is null then
    raise exception 'Primero corre supabase/migraciones/2026-09-traspasos-facturacion.sql.';
  end if;

  insert into public.rol_permisos (rol, seccion, nivel)
  select rol, '/traspasos/facturacion', nivel from public.rol_permisos where seccion = '/facturacion'
  on conflict (rol, seccion) do nothing;
  get diagnostics v_n = row_count;
  delete from public.rol_permisos where seccion = '/facturacion';
  raise notice 'Roles con Facturación mudados a Traspasos: %', v_n;

  update public.perfiles
     set permisos_extra = (permisos_extra - '/facturacion')
         || jsonb_build_object('/traspasos/facturacion', permisos_extra -> '/facturacion')
   where permisos_extra ? '/facturacion'
     and not (permisos_extra ? '/traspasos/facturacion');
  update public.perfiles set permisos_extra = permisos_extra - '/facturacion'
   where permisos_extra ? '/facturacion';
end $bloque$;

create or replace function public.traspaso_confirmar_salida(p_id uuid, p_documento text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.traspasos_viajes%rowtype;
  v_clave text := nullif(upper(regexp_replace(coalesce(p_documento, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_otro record;
begin
  if not public.puede_editar('/traspasos/facturacion') then
    raise exception 'Solo facturación confirma la salida de un viaje.' using errcode = '42501';
  end if;
  if v_clave is null then
    raise exception 'Falta el número de documento.';
  end if;
  if v_clave !~ '^[0-9]{1,10}$' then
    raise exception 'El número de documento va en cifras y con diez como máximo.';
  end if;

  select * into v from public.traspasos_viajes where id = p_id for update;
  if not found then raise exception 'Ese viaje no existe.'; end if;
  if v.estado <> 'registrado' then raise exception 'Ese viaje está anulado: no sale.'; end if;
  if v.vacio then raise exception 'Un viaje vacío no lleva documento de facturación.'; end if;
  if v.salida_en is not null then
    raise exception 'Ese viaje ya salió con el documento %.', v.factura_documento;
  end if;

  /* EL REPETIDO SE DICE CON EL VIAJE QUE YA LO TIENE: «ya está en otro
     viaje» a secas manda a buscarlo a mano. */
  select codigo, placa, fecha into v_otro from public.traspasos_viajes
   where factura_clave = v_clave and estado = 'registrado' limit 1;
  if found then
    raise exception 'El documento % ya está en el viaje % (placa %, %).',
      v_clave, coalesce(v_otro.codigo, '—'), coalesce(v_otro.placa, '—'), to_char(v_otro.fecha, 'DD/MM/YYYY');
  end if;

  update public.traspasos_viajes
     set factura_documento = btrim(p_documento),
         salida_en = now(), salida_por = auth.uid(), salida_historica = false
   where id = p_id;

  insert into public.traspasos_viajes_ediciones (viaje, editado_por, motivo, antes, despues)
  select p_id, auth.uid(), 'Facturación confirmó la salida', to_jsonb(v), to_jsonb(n)
    from public.traspasos_viajes n where n.id = p_id;
end $fn$;

do $bloque$
begin
  if not exists (select 1 from public.rol_permisos where rol = 'facturacion' and seccion = '/traspasos/facturacion') then
    raise exception 'NO QUEDÓ: el rol Facturación no tiene la pantalla /traspasos/facturacion.';
  end if;
  if exists (select 1 from public.rol_permisos where seccion = '/facturacion') then
    raise exception 'NO QUEDÓ: todavía hay permisos sobre /facturacion.';
  end if;
  raise notice 'LISTO: Facturación queda dentro de Traspasos, con los mismos permisos que tenía.';
end $bloque$;
