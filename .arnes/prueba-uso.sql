\set ON_ERROR_STOP on
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@x'), ('33333333-3333-3333-3333-333333333333','sup@x'),
  ('44444444-4444-4444-4444-444444444444','ana@x'), ('66666666-6666-6666-6666-666666666666','beto@x') on conflict (id) do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','operador',true),
  ('44444444-4444-4444-4444-444444444444','ana','Ana','operador',true),
  ('66666666-6666-6666-6666-666666666666','beto','Beto','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
delete from public.uso_visitas;

do $prueba$
declare v_falla text := ''; n bigint; r record; v1 bigint; v2 bigint; v3 bigint; k int;
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP constant text := '33333333-3333-3333-3333-333333333333';
  ANA constant text := '44444444-4444-4444-4444-444444444444';
begin
  /* 1 · ANOTA SOLO EL USO PROPIO; la misma pantalla en 2 s es un rebote */
  perform set_config('request.jwt.claim.sub', ANA, true);
  set local role probador;
  v1 := public.uso_visita('/roturas/salida', 'roturas');
  v2 := public.uso_visita('/roturas/salida', 'roturas');
  if v1 is null or v1 <> v2 then v_falla := v_falla || ' 1(no junta el rebote: ' || coalesce(v1::text,'null') || '/' || coalesce(v2::text,'null') || ')'; end if;
  v3 := public.uso_visita('/inventario', 'inventario');
  if v3 = v1 then v_falla := v_falla || ' 1b(otra pantalla cuenta como la misma)'; end if;
  perform public.uso_latido(v1, 30); perform public.uso_latido(v1, 30); perform public.uso_latido(v1, 9999);
  reset role;
  if (select activo_seg from public.uso_visitas where id = v1) <> 180 then v_falla := v_falla || ' 1c(el latido no suma 30+30+tope 120: ' || (select activo_seg from public.uso_visitas where id = v1) || ')'; end if;
  if (select count(*) from public.uso_visitas where usuario::text = ANA) <> 2 then v_falla := v_falla || ' 1d(no quedaron 2 visitas)'; end if;

  /* 2 · NADIE SUMA AL USO DE OTRO */
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  perform public.uso_latido(v1, 60);
  begin insert into public.uso_visitas (usuario, ruta) values (SUP::uuid, '/x'); v_falla := v_falla || ' 2(inserta directo)'; exception when others then null; end;
  reset role;
  if (select activo_seg from public.uso_visitas where id = v1) <> 180 then v_falla := v_falla || ' 2b(suma a la visita de otro)'; end if;

  /* 3 · SIN SESIÓN NO ANOTA */
  perform set_config('request.jwt.claim.sub', '', true);
  set local role probador;
  if public.uso_visita('/x', 'x') is not null then v_falla := v_falla || ' 3(anota sin sesión)'; end if;
  reset role;

  /* 4 · QUIEN NO ADMINISTRA no lee nada */
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  if exists (select 1 from public.uso_visitas) then v_falla := v_falla || ' 4(ve la tabla)'; end if;
  begin perform * from public.uso_usuarios(current_date - 7, current_date); v_falla := v_falla || ' 4b(uso_usuarios abierto)'; exception when others then null; end;
  begin perform * from public.uso_dias(current_date - 7, current_date); v_falla := v_falla || ' 4c(uso_dias abierto)'; exception when others then null; end;
  begin perform * from public.uso_pantallas(current_date - 7, current_date); v_falla := v_falla || ' 4d(uso_pantallas abierto)'; exception when others then null; end;
  reset role;

  /* 5 · ADMIN: todos los activos, también quien no usó nada */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select count(*) into k from public.uso_usuarios(current_date - 1, current_date + 1);
  if k <> 4 then v_falla := v_falla || ' 5(no lista a los 4 activos: ' || k || ')'; end if;
  select * into r from public.uso_usuarios(current_date - 1, current_date + 1) where usuario = 'ana';
  if r.visitas <> 2 or r.dias_activos <> 1 or r.minutos <> 3.0 or (r.modulos->>'roturas')::int <> 1 or (r.modulos->>'inventario')::int <> 1 or r.ultimo_uso is null then
    v_falla := v_falla || ' 5b(los números de Ana: ' || row_to_json(r)::text || ')'; end if;
  select * into r from public.uso_usuarios(current_date - 1, current_date + 1) where usuario = 'beto';
  if r.visitas <> 0 or r.minutos <> 0 or r.ultimo_uso is not null or r.modulos <> '{}'::jsonb then v_falla := v_falla || ' 5c(quien no usó nada no sale en cero: ' || row_to_json(r)::text || ')'; end if;
  if (select usuario from public.uso_usuarios(current_date - 1, current_date + 1) limit 1) <> 'ana' then v_falla := v_falla || ' 5d(no ordena por minutos)'; end if;
  reset role;

  /* 6 · EL DÍA ES EL DE COLOMBIA: 11 pm del 3 (hora Bogotá) = 4 am UTC del 4 */
  insert into public.uso_visitas (usuario, ruta, modulo, entro_en, activo_seg) values
    (ANA::uuid, '/inicio', 'inicio', timestamptz '2026-03-04 04:00:00+00', 60),
    (ANA::uuid, '/inicio', 'inicio', timestamptz '2026-03-04 06:00:00+00', 60);
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  if (select count(*) from public.uso_dias('2026-03-03', '2026-03-03') where usuario::text = ANA and visitas = 1) <> 1 then v_falla := v_falla || ' 6(la visita de las 11 pm no cae el día 3)'; end if;
  if (select count(*) from public.uso_dias('2026-03-04', '2026-03-04') where usuario::text = ANA and visitas = 1) <> 1 then v_falla := v_falla || ' 6b(la de la 1 am no cae el día 4)'; end if;
  if (select visitas from public.uso_pantallas('2026-03-03', '2026-03-04') where usuario::text = ANA and ruta = '/inicio') <> 2 then v_falla := v_falla || ' 6c(pantallas no junta las 2)'; end if;
  reset role;

  if v_falla <> '' then raise exception 'USO:%', v_falla; end if;
  raise notice 'USO ok';
end $prueba$;
