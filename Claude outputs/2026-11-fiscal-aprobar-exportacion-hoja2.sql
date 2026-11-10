-- =====================================================================
-- FISCAL NOVIEMBRE 2026 · HOJA 2 · APROBAR EXPORTACION1, EXPORTACION2 y EXPORTACION3
--
-- Para poder culminar: esos tres módulos de la hoja 2 están «sin aprobar» y la pareja
-- (Frideth Garcia · Luis Prens) ya envió. Se aprueban dejando como DEFINITIVO el conteo del
-- operador (Luis Prens). Donde el operador no anotó ese módulo (p. ej. solo envió Bavaria),
-- el definitivo es el único conteo que hay, el de Bavaria.
--
--   · No cambia ningún renglón contado; solo marca el módulo como APROBADO (como el botón del fiscal).
--   · Solo toca esos tres módulos de la hoja 2 del inventario del 09/11/2026.
--   · No pasa nada a La base: después corre «2026-11-fiscal-pasar-todo-a-la-bd.sql»
--     (o aprieta Consolidar en la app) y luego Culminar.
--   · Si algo no cuadra, se detiene SIN cambiar nada y lo dice. Se puede correr dos veces.
-- =====================================================================
begin;

do $$
declare
  v_fiscal uuid; v_n int; v_h2 uuid; v_k int; v_ubis uuid[]; v_ol_ubis uuid[]; v_mod text;
  v_aprobados int := 0;
begin
  select count(*), max(id::text)::uuid into v_n, v_fiscal
    from public.inv_fiscales
   where fecha = date '2026-11-09' and nombre ilike '%NOVIEMBRE%2026%';
  if v_n <> 1 then
    raise exception 'Esperaba UN inventario fiscal del 09/11/2026 con «NOVIEMBRE 2026» en el nombre y encontré %.', v_n;
  end if;
  select id into v_h2 from public.inv_fiscal_hojas where fiscal_id = v_fiscal and numero = 2;
  if v_h2 is null then raise exception 'No encuentro la hoja 2 de ese inventario.'; end if;

  foreach v_mod in array array['EXPORTACION1', 'EXPORTACION2', 'EXPORTACION3'] loop
    -- Todas las ubicaciones del módulo (con o sin lado) que tienen algo contado en la hoja 2.
    v_ubis := array(
      select distinct c.ubicacion_id
        from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
       where c.hoja_id = v_h2 and regexp_replace(u.clave, '_(IZQ|DER)$', '') = v_mod);
    if coalesce(array_length(v_ubis, 1), 0) = 0 then
      raise notice '% no tiene nada contado en la hoja 2: se salta.', v_mod;
      continue;
    end if;
    v_ol_ubis := array(
      select distinct c.ubicacion_id
        from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
       where c.hoja_id = v_h2 and c.equipo = 'OL' and regexp_replace(u.clave, '_(IZQ|DER)$', '') = v_mod);

    insert into public.inv_fiscal_revisiones (hoja_id, ubicacion_id, estado, ronda, aprobado_en, adoptado, compensado)
    select v_h2, x, 'APROBADA', 0, now(), case when coalesce(array_length(v_ol_ubis, 1), 0) > 0 then 'OL' else null end, false
      from unnest(v_ubis) x
    on conflict (hoja_id, ubicacion_id) do update
      set estado = 'APROBADA', aprobado_en = now(),
          adoptado = case when coalesce(array_length(v_ol_ubis, 1), 0) > 0 then 'OL' else null end, compensado = false
      where public.inv_fiscal_revisiones.estado <> 'APROBADA';
    get diagnostics v_k = row_count;
    v_aprobados := v_aprobados + v_k;
    raise notice '%: % ubicaciones aprobadas (definitivo: %).', v_mod, v_k, case when coalesce(array_length(v_ol_ubis, 1), 0) > 0 then 'operador' else 'Bavaria (el operador no lo anotó)' end;
  end loop;

  if v_aprobados = 0 then raise notice 'No había nada por aprobar (ya estaban aprobados o no tienen conteo).'; end if;
end $$;

commit;

-- Cómo quedó (todo debe decir APROBADA).
select regexp_replace(u.clave, '_(IZQ|DER)$', '') as modulo, u.clave, r.estado, r.adoptado as definitivo
  from public.inv_fiscal_revisiones r
  join public.inv_fiscal_hojas h on h.id = r.hoja_id and h.numero = 2
  join public.inv_fiscales f on f.id = h.fiscal_id
  join public.ubicaciones u on u.id = r.ubicacion_id
 where f.fecha = date '2026-11-09' and f.nombre ilike '%NOVIEMBRE%2026%' and u.clave like 'EXPORTACION%'
 order by 1, 2;
