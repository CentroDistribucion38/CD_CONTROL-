-- =====================================================================
-- INVENTARIO FISCAL · PALLETS DE CARNAVAL
--
-- «Cuando cuenten Carnaval debes dar la opción de pallet, y si es pallet debe calcular de acuerdo a ese factor.»
--
-- 1. inv_fiscal_factores_pallet(): las unidades por pallet del maestro de Carnaval (el mismo del Cuadre SAP AG07), para
--    que Contar ofrezca «Pallets» en las ubicaciones de Carnaval. Un renglón en pallets se guarda como unidades
--    (pallets × factor = cajas completas + sueltas) y la nota dice «Pallet: 166 × 5.616 = 932.256 un.».
--
-- 2. EL ARREGLO DEL FISCAL DEL 09/11 (CARNAVAL_01): los renglones que dicen «Pallet» se anotaron como estibas.
--      · Flint 3500213: se queda en su hoja, en pallets × su factor (1 × 4.347, no 1 estiba).
--      · Costeñita 3500005: pasa a una HOJA NUEVA de Carnaval, solo con ella, en pallets × su factor (166 × 5.616),
--        aprobada como estaba, con su planilla propia.
--    Después vuelve a pasar a La base las dos hojas (la de siempre y la nueva) con lo corregido.
--    Si ya se corrió, no hace nada (no quedan renglones «Pallet» anotados en estibas).
--
-- Se puede correr varias veces. Si algo no cuadra, no cambia nada (todo va en una sola transacción).
-- =====================================================================
begin;

create or replace function public.inv_fiscal_factores_pallet()
returns table (sku text, und_por_pallet integer)
language sql stable security definer set search_path = public
as $$ select c.codigo::text, c.und_por_pallet from public.carnaval_productos c where c.und_por_pallet > 0 $$;
revoke all on function public.inv_fiscal_factores_pallet() from public, anon;
grant execute on function public.inv_fiscal_factores_pallet() to authenticated;

do $$
declare
  v_fiscal uuid; v_h1 uuid; v_num1 int; v_nueva uuid; v_num int; v_ubi uuid; v_quien uuid; v_n int; v_m int;
  r record; v_u bigint; v_fp int; v_upc int;
begin
  /* La hoja del fiscal del 09/11 que tiene renglones «Pallet» en Carnaval anotados como estibas. */
  select c.fiscal_id, c.hoja_id, count(*) into v_fiscal, v_h1, v_n
    from public.inv_fiscal_conteos c
    join public.inv_fiscales f on f.id = c.fiscal_id
    join public.ubicaciones u on u.id = c.ubicacion_id
   where f.fecha = date '2026-11-09' and u.clave ilike 'CARNAVAL%'
     and c.nota ilike 'pallet%' and c.nota not ilike 'pallet:%' and c.estibas is not null
   group by c.fiscal_id, c.hoja_id;
  if v_h1 is null then
    raise notice 'Nada que arreglar: los renglones «Pallet» de Carnaval ya están en pallets.';
    return;
  end if;
  select numero into v_num1 from public.inv_fiscal_hojas where id = v_h1;

  /* Quien aprobó Carnaval: con su usuario se vuelve a pasar a La base (la función pide el permiso del fiscal). */
  select r2.aprobado_por, r2.ubicacion_id into v_quien, v_ubi
    from public.inv_fiscal_revisiones r2 join public.ubicaciones u on u.id = r2.ubicacion_id
   where r2.hoja_id = v_h1 and u.clave ilike 'CARNAVAL%' and r2.estado = 'APROBADA'
   order by r2.aprobado_en desc nulls last limit 1;
  if v_quien is null then raise exception 'CARNAVAL no está aprobado en la hoja %: no se toca nada.', v_num1; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  /* 1 · Cada renglón «Pallet» (Costeñita y Flint, de las dos personas): estibas → pallets × factor, en unidades. */
  for r in
    select c.id, c.estibas, c.nota, p.sku, p.unidades_por_caja
      from public.inv_fiscal_conteos c
      join public.productos p on p.id = c.producto_id
      join public.ubicaciones u on u.id = c.ubicacion_id
     where c.hoja_id = v_h1 and u.clave ilike 'CARNAVAL%'
       and c.nota ilike 'pallet%' and c.nota not ilike 'pallet:%' and c.estibas is not null
  loop
    select cp.und_por_pallet into v_fp from public.carnaval_productos cp where cp.codigo = r.sku;
    v_upc := r.unidades_por_caja;
    if v_fp is null or v_fp <= 0 then raise exception 'El % no tiene unidades por pallet en el maestro de Carnaval.', r.sku; end if;
    if v_upc is null or v_upc <= 0 then raise exception 'El % no tiene unidades por caja en el maestro.', r.sku; end if;
    v_u := r.estibas::bigint * v_fp;
    update public.inv_fiscal_conteos
       set estibas = null, saldo = null,
           cajas = (v_u / v_upc)::int,
           unidades = nullif((v_u % v_upc)::int, 0),
           nota = 'Pallet: ' || replace(to_char(r.estibas, 'FM999,999,999'), ',', '.') || ' × ' || replace(to_char(v_fp, 'FM999,999,999'), ',', '.')
                  || ' = ' || replace(to_char(v_u, 'FM999,999,999'), ',', '.') || ' un.'
                  || coalesce(' · ' || nullif(btrim(regexp_replace(r.nota, '^\s*pallet\s*·?\s*', '', 'i')), ''), '')
     where id = r.id;
    raise notice '% · % pallets × % = % unidades (antes % estibas)', r.sku, r.estibas, v_fp, v_u, r.estibas;
  end loop;

  /* 2 · La hoja nueva de Carnaval, solo con la Costeñita en pallets. */
  select coalesce(max(numero), 0) + 1 into v_num from public.inv_fiscal_hojas where fiscal_id = v_fiscal;
  insert into public.inv_fiscal_hojas (fiscal_id, numero, familia, familias, calle, nombre, cerrada_en, cerrada_por)
  select fiscal_id, v_num, familia, familias, calle, 'Carnaval · Costeñita en pallets', cerrada_en, cerrada_por
    from public.inv_fiscal_hojas where id = v_h1
  returning id into v_nueva;

  update public.inv_fiscal_conteos c
     set hoja_id = v_nueva
    from public.productos p, public.ubicaciones u
   where p.id = c.producto_id and u.id = c.ubicacion_id
     and c.hoja_id = v_h1 and u.clave ilike 'CARNAVAL%' and p.sku = '3500005' and c.nota ilike 'pallet:%';
  get diagnostics v_m = row_count;
  if v_m = 0 then raise exception 'No encontré la Costeñita en pallets para pasarla a la hoja nueva.'; end if;

  /* Aprobada como estaba en la hoja de siempre; y terminada por las mismas personas. */
  insert into public.inv_fiscal_revisiones (hoja_id, ubicacion_id, estado, ronda, nota, pedido_por, pedido_en, aprobado_por, aprobado_en, adoptado, compensado)
  select v_nueva, r2.ubicacion_id, r2.estado, r2.ronda, 'Separada de la hoja ' || v_num1 || ': Costeñita en pallets',
         r2.pedido_por, r2.pedido_en, r2.aprobado_por, r2.aprobado_en, r2.adoptado, r2.compensado
    from public.inv_fiscal_revisiones r2
   where r2.hoja_id = v_h1
     and r2.ubicacion_id in (select distinct c.ubicacion_id from public.inv_fiscal_conteos c where c.hoja_id = v_nueva);
  insert into public.inv_fiscal_terminos (hoja_id, user_id)
  select distinct v_nueva, c.contado_por from public.inv_fiscal_conteos c where c.hoja_id = v_nueva
  on conflict do nothing;

  /* 3 · Las dos hojas otra vez a La base, con lo corregido. */
  perform public.inv_fiscal_consolidar(v_h1);
  perform public.inv_fiscal_consolidar(v_nueva);

  raise notice '──────────────────────────────────────────────';
  raise notice 'Hoja % : Flint en pallets, Costeñita en pallets salió a la hoja nueva.', v_num1;
  raise notice 'Hoja % («Carnaval · Costeñita en pallets»): % renglones, aprobada y en La base.', v_num, v_m;
end $$;

commit;
