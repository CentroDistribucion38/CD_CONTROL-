-- =====================================================================
-- FISCAL NOVIEMBRE 2026 · lunes 09/11 · HOJA 1 · CARGAR EL CONTEO EN PAPEL DEL OL (Dayra Suárez)
--
-- Dayra contó la hoja 1 en papel y su hoja coincide con la de Jair Díaz (Bavaria). Esto carga
-- esos mismos renglones a NOMBRE DE DAYRA como equipo OL y marca su hoja como terminada, para que
-- el cruce se calcule.
--
-- Queda constancia: cada renglón cargado lleva en la nota «Pasado de la hoja en papel del OL
-- (cargado por el administrador)». Las fotos NO se copian (son de Jair).
--
-- IMPORTANTE: esto da por hecho que el papel de Dayra es IGUAL al de Jair. Guarda esa hoja en papel;
-- si algún renglón del papel difiere, corrígelo después (o dímelo y lo cargo con sus cantidades).
-- Se detiene sin cambiar nada si Dayra ya tiene renglones en esa hoja. Córrelo UNA sola vez.
-- =====================================================================
begin;

do $$
declare
  v_num    int := 1;                 -- ← la hoja
  v_fiscal uuid;
  v_n      int;
  v_hoja   uuid;
  v_ol     uuid;
  v_ba     uuid;
  v_cols   text;
  v_k      int;
  v_nota   constant text := 'Pasado de la hoja en papel del OL (cargado por el administrador)';
begin
  select count(*), max(id::text)::uuid into v_n, v_fiscal
    from public.inv_fiscales
   where fecha = date '2026-11-09' and nombre ilike '%NOVIEMBRE%2026%';
  if v_n <> 1 then
    raise exception 'Esperaba UN inventario fiscal del 09/11/2026 con «NOVIEMBRE 2026» en el nombre y encontré %.', v_n;
  end if;
  select id into v_hoja from public.inv_fiscal_hojas where fiscal_id = v_fiscal and numero = v_num;
  if v_hoja is null then raise exception 'No encuentro la hoja %.', v_num; end if;

  select user_id into v_ol from public.inv_fiscal_miembros where hoja_id = v_hoja and equipo = 'OL';
  select user_id into v_ba from public.inv_fiscal_miembros where hoja_id = v_hoja and equipo = 'BAVARIA';
  if v_ol is null or v_ba is null then raise exception 'La hoja % necesita al OL y a Bavaria asignados.', v_num; end if;

  select count(*) into v_k from public.inv_fiscal_conteos where hoja_id = v_hoja and contado_por = v_ol;
  if v_k > 0 then raise exception 'El OL ya tiene % renglones en la hoja %: no se mezcla (nada cambió).', v_k, v_num; end if;
  select count(*) into v_k from public.inv_fiscal_conteos where hoja_id = v_hoja and contado_por = v_ba;
  if v_k = 0 then raise exception 'Bavaria no tiene renglones en la hoja % para copiar.', v_num; end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'inv_fiscal_conteos'
     and column_name not in ('id', 'equipo', 'contado_por', 'nota', 'contado_en');

  alter table public.inv_fiscal_conteos disable trigger user;   -- el seguro de «hoja terminada» no aplica a esta carga
  execute format(
    'insert into public.inv_fiscal_conteos (%s, equipo, contado_por, nota, contado_en)
     select %s, ''OL'', $1, left(coalesce(nota || '' · '', '''') || $3, 500), now()
       from public.inv_fiscal_conteos where hoja_id = $2 and contado_por = $4', v_cols, v_cols)
    using v_ol, v_hoja, v_nota, v_ba;
  get diagnostics v_k = row_count;
  alter table public.inv_fiscal_conteos enable trigger user;

  /* Los módulos que recorrió (sin las fotos de Jair) y su «terminé». */
  insert into public.inv_fiscal_modulos (hoja_id, user_id, ubicacion_id, mezclado, sin_acceso)
  select hoja_id, v_ol, ubicacion_id, mezclado, sin_acceso
    from public.inv_fiscal_modulos where hoja_id = v_hoja and user_id = v_ba
  on conflict do nothing;

  if exists (select 1 from public.inv_fiscal_terminos where hoja_id = v_hoja and user_id = v_ba) then
    insert into public.inv_fiscal_terminos (hoja_id, user_id) values (v_hoja, v_ol) on conflict do nothing;
  end if;

  raise notice 'Listo: % renglones cargados al OL de la hoja %.', v_k, v_num;
end $$;

commit;

-- Cómo quedó: la hoja 1 con los dos equipos y la misma cantidad de renglones.
select h.numero as hoja, c.equipo, p.nombre as persona, count(*) as renglones
  from public.inv_fiscal_conteos c
  join public.inv_fiscal_hojas h on h.id = c.hoja_id
  join public.inv_fiscales f on f.id = h.fiscal_id
  left join public.perfiles p on p.id = c.contado_por
 where f.fecha = date '2026-11-09' and f.nombre ilike '%NOVIEMBRE%2026%' and h.numero = 1
 group by h.numero, c.equipo, p.nombre
 order by c.equipo;
