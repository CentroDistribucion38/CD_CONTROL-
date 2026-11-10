-- =====================================================================
-- FISCAL · LA BD MUESTRA SOLO LO DEL OPERADOR (OL)
--
-- «Que no muestre lo de Bavaria, solo lo del OL.»
--
-- Qué hace (todo o nada):
--   1. Quita de La base los renglones que contó Bavaria en los recorridos FISCAL-… (son copias:
--      lo contado por Bavaria sigue en el inventario fiscal, en el cruce y en el Excel del cruce).
--      Con ellos se van sus fotos y sus marcas de «mezclado / sin acceso» de La base.
--   2. Cambia las dos funciones que pasan datos a La base (Consolidar y la comprobación «quedó igual»)
--      para que de ahora en adelante pasen SOLO el conteo del operador, aunque el fiscal haya
--      escogido el de Bavaria como definitivo. Así Bavaria no vuelve a entrar.
--   3. Borradores tampoco muestra lo de Bavaria.
--
--   · OJO: los sitios que SOLO contó Bavaria quedan fuera de La base (no hay conteo del operador).
--   · Si algún renglón de Bavaria ya estaba marcado como PASADO al sistema oficial, se detiene
--     SIN cambiar nada y lo dice (para no perder esa marca).
--   · Se puede correr más de una vez.
-- =====================================================================
begin;

do $$
declare
  d text; v_n int; v_pas int := 0; v_mod int := 0;
begin
  /* 1 · Lo de Bavaria que hoy está en La base (solo recorridos del fiscal). */
  create temporary table _bav_lineas on commit drop as
    select cl.id
      from public.conteo_lineas cl
      join public.inv_fiscal_hojas h on h.conteo_id = cl.conteo_id
     where exists (select 1 from public.inv_fiscal_conteos c
                    where c.hoja_id = h.id and c.equipo = 'BAVARIA' and c.ubicacion_id = cl.ubicacion_id
                      and c.producto_id = cl.producto_id
                      and c.contado_en is not distinct from cl.contado_en
                      and c.contado_por is not distinct from cl.contado_por);
  select count(*) into v_n from _bav_lineas;

  if to_regclass('public.conteo_lineas_pasadas') is not null then
    execute 'select count(*) from public.conteo_lineas_pasadas where linea_id in (select id from _bav_lineas)' into v_pas;
    if v_pas > 0 then
      raise exception '% renglones de Bavaria ya están marcados como PASADO al sistema oficial: no se cambió nada. Avísame.', v_pas;
    end if;
  end if;

  delete from public.conteo_lineas where id in (select id from _bav_lineas);   -- las fotos y las marcas de pasado se van con ellos (cascade)

  /* Las marcas «mezclado / sin acceso» que puso una persona de Bavaria. */
  delete from public.conteo_modulos cm
   using public.inv_fiscal_hojas h
   where h.conteo_id = cm.conteo_id
     and exists (select 1 from public.inv_fiscal_miembros mi
                  where mi.hoja_id = h.id and mi.user_id = cm.marcado_por and mi.equipo = 'BAVARIA')
     and not exists (select 1 from public.inv_fiscal_miembros mi2
                      where mi2.hoja_id = h.id and mi2.user_id = cm.marcado_por and mi2.equipo = 'OL');
  get diagnostics v_mod = row_count;

  /* 2 · Consolidar y «quedó igual»: siempre el conteo del OL. */
  foreach d in array array['inv_fiscal_consolidar', 'inv_fiscal_hoja_cuadra'] loop
    declare v_def text; v_new text;
    begin
      select pg_get_functiondef(p.oid) into v_def from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = d limit 1;
      if v_def is null then raise exception 'No encuentro la función %: falta correr las migraciones del fiscal.', d; end if;
      v_new := regexp_replace(v_def, 'public\.inv_fiscal_equipo_definitivo\(\s*p_hoja\s*,\s*[a-z]+\.ubicacion_id\s*\)', '''OL''', 'g');
      if v_new <> v_def then execute v_new; end if;
    end;
  end loop;

  /* 3 · Borradores: solo el OL. */
  declare v_def text; v_new text;
  begin
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = 'inv_fiscal_borradores_base' limit 1;
    if v_def is null then raise exception 'No encuentro inv_fiscal_borradores_base.'; end if;
    if v_def !~ 'c\.equipo = ''OL''' then
      v_new := replace(v_def, 'where f.estado = ''abierto''', 'where f.estado = ''abierto'' and c.equipo = ''OL''');
      if v_new = v_def then raise exception 'No pude cambiar Borradores: no reconozco la función.'; end if;
      execute v_new;
    end if;
  end;

  raise notice 'Listo: % renglones de Bavaria salieron de La base, % marcas de módulo de Bavaria; de ahora en adelante solo entra el OL.', v_n, v_mod;
end $$;

commit;

-- Cómo quedó: renglones en La base por hoja del fiscal.
select h.numero as hoja, c.codigo as recorrido, count(cl.id) as renglones
  from public.inv_fiscal_hojas h
  join public.inv_fiscales f on f.id = h.fiscal_id
  left join public.conteos c on c.id = h.conteo_id
  left join public.conteo_lineas cl on cl.conteo_id = c.id
 where f.fecha = date '2026-11-09' and f.nombre ilike '%NOVIEMBRE%2026%'
 group by h.numero, c.codigo order by h.numero;
