-- =====================================================================
-- PASIVOS · BASE: DESCARTAR RENGLONES
-- «Estarán ahí visualmente, pero no suman ni restan.»
-- Una fila descartada se ve (tachada) en la Base, pero no cuenta en los totales, el informe,
-- el cuadre ni el guardado del día. Se puede reactivar. Se puede correr varias veces.
-- =====================================================================
alter table public.pasivos_base add column if not exists descartada boolean not null default false;

create or replace view public.v_pasivos_base
with (security_invoker = true) as
  select b.id, b.fecha, b.estado, b.causal, m.caja, b.codigo,
         coalesce(m.descripcion, b.codigo) as descripcion,
         b.unidades, b.almacen,
         round(b.unidades * m.hl_unidad, 4)                                  as hl,
         round(b.unidades / nullif(m.unidades_por_caja, 0), 2)               as cajas,
         extract(year from b.fecha)::int  as anio,
         extract(month from b.fecha)::int as mes,
         extract(day from b.fecha)::int   as dia,
         round(b.unidades * m.costo, 2)                                      as costo,
         b.origen, b.archivo, b.nota, b.creado_en,
         (m.codigo is null) as sin_maestro,
         b.descartada
    from public.pasivos_base b
    left join public.pasivos_maestro m on m.codigo = b.codigo;
grant select on public.v_pasivos_base to authenticated;

-- Verificación: debe devolver la columna descartada
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'v_pasivos_base' and column_name = 'descartada';
