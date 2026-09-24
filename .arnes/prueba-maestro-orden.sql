\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL ORDEN DEL MAESTRO DE EN SITIO
--
-- ES EL ORDEN DEL DESPLEGABLE AL REGISTRAR, con guante y de pie. Lo que
-- puede romperse:
--  1. Que lo pueda cambiar cualquiera.
--  2. Que dos renglones queden con el MISMO orden: la lista se
--     reordena sola al recargar y parece que no guardó.
--  3. Que una hoja inventada pase por buena — o peor, que el nombre de
--     la hoja termine concatenado dentro del SQL.
--  4. Que «guarde» sin guardar nada cuando las claves no existen.
-- =====================================================================

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','root@cd.local'),
  ('22222222-2222-2222-2222-222222222222','easy@cd.local')
on conflict do nothing;

do $prueba$
declare
  ROOT constant text := '44444444-4444-4444-4444-444444444444';
  EASY constant text := '22222222-2222-2222-2222-222222222222';
  v_falla text := '';
  v_n int;
  v_claves text[];
begin
  insert into public.roles (clave, nombre, manda) values
    ('mando_general','Mando general', true),
    ('logistico','Operador logístico', false)
  on conflict (clave) do update set manda = excluded.manda;
  update public.perfiles set rol = 'mando_general', activo = true where id = ROOT::uuid;
  update public.perfiles set rol = 'logistico', activo = true where id = EASY::uuid;
  -- Easy VE el maestro pero no lo edita: es justo el caso que la
  -- comprobación de permiso existe para separar.
  insert into public.rol_permisos (rol, seccion, nivel) values
    ('logistico','/roturas/en-sitio/maestro','ver')
  on conflict (rol, seccion) do update set nivel = excluded.nivel;

  -- ===================================================================
  -- 1. NO ES DE CUALQUIERA
  -- ===================================================================
  set role probador;
  perform set_config('request.jwt.claim.sub', EASY, true);
  begin
    perform public.rotura_maestro_ordenar('procesos', array['t1','lineas']);
    v_falla := v_falla || ' 1a(quien solo VE pudo reordenar el maestro)';
  exception when others then
    if position('Editar' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ===================================================================
  -- 2. QUIEN MANDA SÍ, Y EL ORDEN ES LA POSICIÓN EN LA LISTA
  -- ===================================================================
  perform set_config('request.jwt.claim.sub', ROOT, true);
  select array_agg(clave order by clave) into v_claves from public.roturas_procesos;
  select public.rotura_maestro_ordenar('procesos', v_claves) into v_n;
  if v_n <> array_length(v_claves, 1) then
    v_falla := v_falla || format(' 2a(reordenó %s de %s)', v_n, array_length(v_claves, 1));
  end if;
  -- NINGUNO REPETIDO: es lo que hace que la lista se reordene sola.
  select count(*) into v_n from (
    select orden from public.roturas_procesos group by orden having count(*) > 1) x;
  if v_n > 0 then v_falla := v_falla || format(' 2b(%s ordenes repetidos)', v_n); end if;
  -- Y EL PRIMERO DE LA LISTA QUEDÓ DE PRIMERO.
  select orden into v_n from public.roturas_procesos where clave = v_claves[1];
  if v_n <> 1 then v_falla := v_falla || format(' 2c(el primero quedó en %s)', v_n); end if;

  -- Al revés, y tiene que quedar al revés.
  select public.rotura_maestro_ordenar('procesos',
    (select array_agg(c order by i desc)
       from unnest(v_claves) with ordinality as u(c, i))) into v_n;
  select orden into v_n from public.roturas_procesos where clave = v_claves[1];
  if v_n <> array_length(v_claves, 1) then
    v_falla := v_falla || format(' 2d(al invertir, el primero quedó en %s)', v_n);
  end if;

  -- Las otras dos hojas también.
  perform public.rotura_maestro_ordenar('areas',
    (select array_agg(clave order by clave) from public.roturas_areas));
  perform public.rotura_maestro_ordenar('causas',
    (select array_agg(clave order by clave) from public.roturas_causas));

  -- ===================================================================
  -- 3. UNA HOJA INVENTADA NO PASA
  -- ===================================================================
  begin
    perform public.rotura_maestro_ordenar('perfiles', array['x']);
    v_falla := v_falla || ' 3a(aceptó una hoja que no existe)';
  exception when others then
    if position('No existe la hoja' in sqlerrm) = 0 then
      v_falla := v_falla || ' 3a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ===================================================================
  -- 4. NO DICE QUE GUARDÓ SI NO GUARDÓ
  -- ===================================================================
  begin
    perform public.rotura_maestro_ordenar('procesos', array['no_existe_esta_clave']);
    v_falla := v_falla || ' 4a(dijo que guardó sin guardar nada)';
  exception when others then
    if position('no se reordenó nada' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  begin
    perform public.rotura_maestro_ordenar('procesos', array[]::text[]);
    v_falla := v_falla || ' 4b(aceptó una lista vacía)';
  exception when others then
    if position('ninguna lista' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ===================================================================
  -- 5. NADIE QUEDA SIN ORDEN
  --
  -- SE METE UNA FILA SIN ORDEN A PROPÓSITO. La primera versión de esta
  -- comprobación solo miraba que no hubiera ninguna, y como la semilla
  -- las trae todas con orden, pasaba sin probar nada: la mutación que
  -- quitaba el relleno salió VERDE. Un null aparece justo cuando
  -- alguien mete una fila a mano desde el editor de SQL, que es el caso
  -- que esto existe para cubrir.
  -- ===================================================================
  set role postgres;
  insert into public.roturas_causas (clave, nombre, grupo, exige_foto, orden)
    values ('metida_a_mano', 'Metida a mano', 'asumida', false, null)
  on conflict (clave) do update set orden = null;
  select count(*) into v_n from public.roturas_causas where orden is null;
  if v_n <> 1 then v_falla := v_falla || ' 5a(el fixture no dejó ninguna sin orden)'; end if;

  select public.rotura_maestro_orden_completar() into v_n;
  if v_n <> 1 then v_falla := v_falla || format(' 5b(rellenó %s y había 1 sin orden)', v_n); end if;
  select count(*) into v_n from public.roturas_causas where orden is null;
  if v_n > 0 then v_falla := v_falla || format(' 5c(quedaron %s causas sin orden)', v_n); end if;

  set role postgres;
  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'BIEN: el orden del maestro se guarda de una sola vez, es la posicion en la';
  raise notice 'BIEN: lista —nunca dos iguales—, solo lo cambia quien tiene Editar en esa';
  raise notice 'BIEN: pantalla, una hoja inventada no pasa y no dice que guardo si no guardo.';
exception when others then
  set role postgres;
  raise exception 'FALLA:% — y ademas se murio en el camino: %', v_falla, sqlerrm;
end $prueba$;
