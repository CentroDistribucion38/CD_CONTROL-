-- =====================================================================
-- INVENTARIO FISCAL · PASAR AL FISCAL UN CONTEO QUE SE HIZO EN FEFO POR ERROR
--
-- Andrés contó en el conteo diario (FEFO) lo que debía contar en el inventario fiscal.
-- Esto copia ESOS renglones a su hoja del fiscal, con su nombre y la hora real en que los contó,
-- junto con sus fotos y sus marcas de módulo (mezclado / sin acceso). Después ANULA ese conteo de
-- FEFO para que no cuente dos veces. No borra nada: el conteo anulado queda guardado.
--
-- ANTES DE CORRERLO, corre el PASO 1 (abajo) y revisa que sea lo que esperas.
-- Si Andrés tiene más de un conteo FEFO de hoy, pon el código del que es en v_codigo.
-- Se corre UNA sola vez: si se corre otra vez no encuentra el conteo (ya está anulado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 (solo mira; corre esto primero y revisa)
-- ---------------------------------------------------------------------
-- select 'conteo FEFO' as tipo, c.codigo as dato, c.estado as detalle, count(l.id)::text as renglones
--   from conteos c join perfiles pe on pe.id = c.responsable_id
--   left join conteo_lineas l on l.conteo_id = c.id
--  where pe.nombre ilike '%andr%palacio%' and c.tipo = 'fefo' and c.estado <> 'anulado'
--    and c.creado_en >= (now() at time zone 'America/Bogota')::date
--  group by c.codigo, c.estado
-- union all
-- select 'hoja del fiscal', f.nombre || ' · hoja ' || h.numero, m.equipo, ''
--   from inv_fiscal_miembros m join perfiles pe on pe.id = m.user_id
--   join inv_fiscal_hojas h on h.id = m.hoja_id join inv_fiscales f on f.id = h.fiscal_id
--  where pe.nombre ilike '%andr%palacio%' and f.estado = 'abierto';

-- ---------------------------------------------------------------------
-- PASO 2 (hace el cambio)
-- ---------------------------------------------------------------------
begin;

do $$
declare
  v_codigo text := '';            -- vacío = el único conteo FEFO de hoy de Andrés; o escribe aquí el código, ej. 'FEFO-20261022-01'
  v_user uuid; v_n integer;
  v_conteo uuid; v_cod text;
  v_hoja uuid; v_fiscal uuid; v_equipo text;
  r record; v_nuevo uuid; v_ren integer := 0; v_fotos integer := 0; v_marcas integer := 0;
begin
  select count(*) into v_n from public.perfiles where nombre ilike '%andr%palacio%';
  if v_n <> 1 then raise exception 'Encontré % personas llamadas Andrés Palacio; tiene que ser exactamente una.', v_n; end if;
  select id into v_user from public.perfiles where nombre ilike '%andr%palacio%';

  -- Su hoja en un inventario fiscal abierto (debe ser una sola).
  select count(*) into v_n
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.user_id = v_user and f.estado = 'abierto';
  if v_n <> 1 then raise exception 'Andrés está en % hojas de inventarios fiscales abiertos; tiene que ser exactamente una.', v_n; end if;
  select m.hoja_id, m.fiscal_id, m.equipo into v_hoja, v_fiscal, v_equipo
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.user_id = v_user and f.estado = 'abierto';

  -- Su conteo de FEFO.
  select count(*) into v_n from public.conteos c
   where c.responsable_id = v_user and c.tipo = 'fefo' and c.estado <> 'anulado'
     and (case when v_codigo <> '' then c.codigo = v_codigo else c.creado_en >= (now() at time zone 'America/Bogota')::date end);
  if v_n <> 1 then
    raise exception 'Andrés tiene % conteos FEFO que coinciden; escribe el código exacto en v_codigo para escoger uno.', v_n;
  end if;
  select c.id, c.codigo into v_conteo, v_cod from public.conteos c
   where c.responsable_id = v_user and c.tipo = 'fefo' and c.estado <> 'anulado'
     and (case when v_codigo <> '' then c.codigo = v_codigo else c.creado_en >= (now() at time zone 'America/Bogota')::date end);

  -- Los renglones, uno por uno, con su foto.
  for r in select * from public.conteo_lineas l where l.conteo_id = v_conteo order by l.contado_en loop
    insert into public.inv_fiscal_conteos
      (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas,
       venc_dia, venc_mes, venc_anio, nota, estado_envase, averia, pnc, pnc_rotulo, pnc_bloqueo_mecanico, contado_en)
    values
      (v_fiscal, v_hoja, v_equipo, v_user, r.ubicacion_id, r.producto_id, r.estibas, r.saldo, r.cajas,
       r.venc_dia, r.venc_mes, r.venc_anio, r.nota, r.estado_envase, coalesce(r.averia, false), coalesce(r.pnc, false),
       r.pnc_rotulo, r.pnc_bloqueo_mecanico, coalesce(r.contado_en, now()))
    returning id into v_nuevo;
    v_ren := v_ren + 1;

    insert into public.inv_fiscal_fotos (conteo_id, hoja_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
    select v_nuevo, v_hoja, f.ruta, f.bytes, f.ancho, f.alto, f.tomada_en, f.lat, f.lng, f.precision_m, f.subida_por, f.subida_en
      from public.conteo_fotos f where f.linea_id = r.id
     limit 1
    on conflict (conteo_id) do nothing;
    if found then v_fotos := v_fotos + 1; end if;
  end loop;

  -- Las marcas de módulo (mezclado / sin acceso).
  insert into public.inv_fiscal_modulos (hoja_id, user_id, ubicacion_id, mezclado, sin_acceso, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, marcado_en)
  select v_hoja, v_user, m.ubicacion_id, m.mezclado, m.sin_acceso, m.ruta, m.bytes, m.ancho, m.alto, m.tomada_en, m.lat, m.lng, m.precision_m, m.marcado_en
    from public.conteo_modulos m where m.conteo_id = v_conteo
  on conflict (hoja_id, user_id, ubicacion_id) do nothing;
  get diagnostics v_marcas = row_count;

  -- Se anula el conteo de FEFO para que no cuente dos veces (queda guardado).
  update public.conteos set estado = 'anulado' where id = v_conteo;

  raise notice 'Pasado al fiscal: % renglones, % fotos, % marcas de módulo, del conteo % (equipo %). El conteo FEFO quedó anulado.',
    v_ren, v_fotos, v_marcas, v_cod, v_equipo;
end $$;

commit;
select 'OK · el conteo de FEFO de Andrés pasó a su hoja del fiscal' as resultado;
