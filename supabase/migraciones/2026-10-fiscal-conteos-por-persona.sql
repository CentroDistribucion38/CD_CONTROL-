-- =====================================================================
-- INVENTARIO FISCAL · LO QUE CONTÓ CADA PERSONA (para el Excel del cruce)
--
-- «Que baje los conteos cruzados Y los conteos por persona, por pareja.»
--
-- El cruce (inv_fiscal_cruce) solo trae las cajas totales de cada equipo.
-- Para el Excel hace falta además lo que anotó cada persona, renglón por
-- renglón: estibas, saldo, cajas sueltas, el factor de estiba con que se
-- sacaron las cajas, la nota y la hora.
--
-- inv_fiscal_conteos(p_hoja) devuelve eso, con las MISMAS reglas del cruce:
--   · solo quien edita «Inventario fiscal» (o el administrador);
--   · solo cuando LAS DOS personas de la hoja terminaron (el conteo sigue
--     siendo a ciegas mientras alguien cuenta);
--   · solo lo de las personas que hoy están en la hoja.
-- No escribe nada. Se puede correr dos veces. Necesita 2026-10-fiscal-cruce.sql.
-- =====================================================================
begin;

drop function if exists public.inv_fiscal_conteos(uuid);
create function public.inv_fiscal_conteos(p_hoja uuid)
returns table (
  equipo text, persona text, ubicacion text, sku text, material text,
  cajas_por_estiba numeric, estibas integer, saldo integer, cajas integer, total_cajas bigint,
  venc_dia smallint, venc_mes smallint, venc_anio smallint, nota text, contado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Ver lo que contó cada persona requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if not exists (select 1 from public.inv_fiscal_hojas where id = p_hoja) then
    raise exception 'Esa hoja no existe.';
  end if;
  if (select count(distinct m.equipo)
        from public.inv_fiscal_miembros m
        join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
       where m.hoja_id = p_hoja) < 2 then
    raise exception 'El cruce se hace cuando las dos personas de la hoja terminan de contar.';
  end if;

  return query
  select m.equipo, coalesce(pf.nombre, pf.usuario, '—'), u.clave, pr.sku, pr.nombre,
         pr.cajas_por_estiba::numeric, c.estibas, c.saldo, c.cajas,
         (coalesce(pr.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.venc_dia, c.venc_mes, c.venc_anio, c.nota, c.contado_en
    from public.inv_fiscal_conteos c
    join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
    join public.perfiles pf on pf.id = c.contado_por
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos pr on pr.id = c.producto_id
   where c.hoja_id = p_hoja
   order by m.equipo desc, u.clave, pr.sku, c.venc_anio, c.venc_mes, c.venc_dia;
end $$;
revoke all on function public.inv_fiscal_conteos(uuid) from public, anon;
grant execute on function public.inv_fiscal_conteos(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_conteos(uuid)') is null then
    raise exception 'No quedó la función de los conteos por persona del inventario fiscal.';
  end if;
  raise notice 'Listo: el Excel del cruce puede traer lo que contó cada persona.';
end $$;

commit;
