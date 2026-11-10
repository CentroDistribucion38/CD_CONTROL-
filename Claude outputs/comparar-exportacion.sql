-- COMPARAR la hoja EXPORTACION: el conteo de Luis Prens (OL) y el de Fridheth Garcia (Bavaria)
-- contra la lista de referencia (la del Excel). Solo lee: no cambia nada.
-- Se compara por código + vencimiento, en cajas equivalentes (estibas × cajas por estiba + saldo + cajas) y en unidades sueltas.
with ref(sku, d, m, a, estibas, cajas, unid) as (values
  ('3819',  2,10,27, 0,6992,0),
  ('17740',23, 8,27, 0,1000,0),
  ('23224',19, 9,27, 0,1176,0),
  ('23224',19, 9,27, 0,1728,0),
  ('9458',  2,10,27, 0,29464,0),
  ('22753', 6,10,27, 8,0,0),
  ('22753', 7,10,27, 0,34,0),
  ('23223',19, 9,27, 16,39,8),
  ('2912',  2,10,27, 66,0,0),
  ('11635', 2,10,27, 23,0,0),
  ('17740',21, 8,27, 0,0,48),
  ('22753',13, 4,27, 4,111,0),
  ('22753',14, 4,27, 1,16,0),
  ('14588',11, 8,27, 2,9,6),
  ('2228', 24, 8,27, 0,53,18),
  ('19224',15, 4,27, 0,225,0),
  ('19224',15, 4,27, 0,120,0),
  ('23223',18, 9,27, 5,38,0),
  ('3128', 10, 3,27, 2,13,0),
  ('14588', 9, 7,27, 0,31,12),
  ('14588', 8, 6,27, 0,20,18)
),
hoja as (   -- la hoja EXPORTACION con conteos más reciente
  select c.hoja_id
    from public.inv_fiscal_conteos c
    join public.inv_fiscal_hojas h on h.id = c.hoja_id
   where upper(translate(coalesce(h.nombre, ''), 'ÓóÁáÉéÍíÚú', 'OoAaEeIiUu')) like 'EXPORTACION%'
   group by c.hoja_id order by max(c.contado_en) desc limit 1
),
cpe as (select p.sku::text as sku, coalesce(p.cajas_por_estiba, 0) as k, p.nombre from public.productos p),
r as (
  select ref.sku, ref.d, ref.m, ref.a,
         sum(ref.estibas * coalesce(cpe.k, 0) + ref.cajas)::int as cajas, sum(ref.unid)::int as unid, sum(ref.estibas)::int as est, max(coalesce(cpe.k, 0)) as k
    from ref left join cpe on cpe.sku = ref.sku group by 1,2,3,4
),
eq as (
  select p.sku::text as sku, c.venc_dia as d, c.venc_mes as m, c.venc_anio as a, c.equipo,
         sum(coalesce(c.estibas, 0) * coalesce(p.cajas_por_estiba, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::int as cajas,
         sum(coalesce(c.unidades, 0))::int as unid, sum(coalesce(c.estibas, 0))::int as est
    from public.inv_fiscal_conteos c
    join hoja on hoja.hoja_id = c.hoja_id
    join public.productos p on p.id = c.producto_id
   group by 1,2,3,4,5
),
llaves as (select sku, d, m, a from r union select sku, d, m, a from eq),
t as (
  select l.sku, l.d, l.m, l.a,
         coalesce(r.cajas, 0) as ref_cajas, coalesce(r.unid, 0) as ref_unid, coalesce(r.est, 0) as ref_est, coalesce(r.k, 0) as k,
         coalesce(o.cajas, 0) as ol_cajas, coalesce(o.unid, 0) as ol_unid, coalesce(o.est, 0) as ol_est,
         coalesce(b.cajas, 0) as bav_cajas, coalesce(b.unid, 0) as bav_unid, coalesce(b.est, 0) as bav_est
    from llaves l
    left join r on (r.sku, r.d, r.m, r.a) is not distinct from (l.sku, l.d, l.m, l.a)
    left join eq o on o.equipo = 'OL' and (o.sku, o.d, o.m, o.a) is not distinct from (l.sku, l.d, l.m, l.a)
    left join eq b on b.equipo = 'BAVARIA' and (b.sku, b.d, b.m, b.a) is not distinct from (l.sku, l.d, l.m, l.a)
),
f as (
  select t.*, (ol_cajas = ref_cajas and ol_unid = ref_unid and (k > 0 or ol_est = ref_est)) as ol_ok, (bav_cajas = ref_cajas and bav_unid = ref_unid and (k > 0 or bav_est = ref_est)) as bav_ok from t
)
select 1 as o, f.sku as codigo, (select nombre from cpe where cpe.sku = f.sku) as material,
       lpad(f.d::text,2,'0') || '/' || lpad(f.m::text,2,'0') || '/20' || f.a as vence,
       ref_est, ref_cajas, ref_unid, ol_est, ol_cajas, ol_unid, bav_est, bav_cajas, bav_unid,
       case when ol_ok then 'OK' else 'difiere' end as luis_ol,
       case when bav_ok then 'OK' else 'difiere' end as fridheth_bavaria
  from f
union all
select 2, 'RESUMEN', 'renglones que coinciden con la referencia (de ' || count(*) || ')', null,
       sum(ref_est), sum(ref_cajas), sum(ref_unid), sum(ol_est), sum(ol_cajas), sum(ol_unid), sum(bav_est), sum(bav_cajas), sum(bav_unid),
       count(*) filter (where ol_ok)::text, count(*) filter (where bav_ok)::text
  from f
order by 1, 2, 4;
