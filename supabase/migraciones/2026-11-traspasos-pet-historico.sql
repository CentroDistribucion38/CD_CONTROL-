-- =====================================================================
-- TRASPASOS › PET · LOS VIAJES DE PET DE ANTES, CON SU FORMATO
--
-- «Necesito que estén los Vhs que se han movido estos días: ellos relacionan el SKU y la cantidad, que sería el
--  viaje; si dice PONY 330X24, por ejemplo, sería formato 330: debes identificarlos.»
--
-- «Eso arranca desde ayer: antes no poníamos SKU, desde ayer le ponemos. Si lees 200 es formato 200, si es 1.0 es
--  formato 1000, si es 1.5 es formato 1500 y si es 330 es formato 330.»
--
-- La vista trae TODOS los Vhs del tipo PET, y a cada uno le busca el SKU en este orden:
--   1. lo que se escogió al registrar: los renglones de PET (traspasos_viaje_pet) o los de material del viaje
--      (traspasos_viaje_materiales: el SKU y las estibas que se le ponen al registrar desde ayer);
--   2. el documento SAP del viaje (traspasos_sap_mov, lo de Traspasos › Importar): material, descripción y
--      cantidad de cada renglón del documento, cruzado por el documento del viaje;
--   3. la nota del viaje, si dice el producto («PONY 330X24»);
--   4. si nada de eso, «Sin formato», con la carga del viaje.
-- El formato sale del maestro de productos (contenido) y, si no, del texto: 330 CC, 1.5 L, 1000ML, 330X24, 200X30…
-- Se puede correr varias veces.
-- =====================================================================

/* EL FORMATO ESCRITO EN UN TEXTO, en ml. Entiende «330 CC», «1000ML», «1.5 L», «1,5LTS», «330X24», «PET 200 X 30». */
create or replace function public.traspasos_formato_texto(p text)
returns integer language plpgsql immutable as $$
declare t text := lower(coalesce(p, '')); m text[]; v numeric;
begin
  if t = '' then return null; end if;
  m := regexp_match(t, '(\d+(?:[.,]\d+)?)\s*(cc|ml|lts?|litros?|l)\M');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric;
    if m[2] not in ('cc', 'ml') then v := v * 1000; end if;
    if v between 100 and 5000 then return round(v); end if;
  end if;
  /* «330X24», «200 X 30», «1000x15»: el número antes de la X es el formato. */
  m := regexp_match(t, '(?:^|[^\d.,])(\d{3,4})\s*x\s*\d');
  if m is not null and m[1]::int between 100 and 5000 then return m[1]::int; end if;
  /* «1.5X6», «1,5 x 6»: litros antes de la X. */
  m := regexp_match(t, '(?:^|[^\d])([1-3])[.,]([0-9])\s*x\s*\d');
  if m is not null then return (m[1] || '.' || m[2])::numeric * 1000; end if;
  /* «1.0», «1.5», «2.0» sueltos: litros (1.0 = 1000, 1.5 = 1500). */
  m := regexp_match(t, '(?:^|[^\d.,])([1-3])[.,]([05])(?:$|[^\d])');
  if m is not null then return (m[1] || '.' || m[2])::numeric * 1000; end if;
  /* «200», «330», «1000», «1500» sueltos: el formato tal cual. */
  m := regexp_match(t, '(?:^|[^\d.,])(200|220|237|250|269|300|330|350|355|400|473|500|600|750|1000|1250|1500|2000|2500|3000)(?:$|[^\d.,])');
  if m is not null then return m[1]::int; end if;
  return null;
end $$;

/* Se rehace (no «replace»): cambian los tipos de algunas columnas al juntar las tres fuentes. */
drop view if exists public.v_traspasos_pet;
create view public.v_traspasos_pet with (security_invoker = true) as
/* 1 · lo registrado con su SKU */
select x.id, x.viaje, v.fecha, v.turno,
       (v.hora at time zone 'America/Bogota')::time as hora,
       v.placa,
       coalesce(po.nombre, v.origen_texto, v.origen)   as origen,
       coalesce(pd.nombre, v.destino_texto, v.destino) as destino,
       x.sku, coalesce(p.nombre, x.sku) as descripcion,
       coalesce(x.formato_ml, public.traspasos_formato_ml(p.nombre, p.contenido), public.traspasos_formato_texto(p.nombre)) as formato_ml,
       x.estibas,
       round(x.estibas * p.cajas_por_estiba, 0)              as pacas,
       round(x.estibas * public.casco_hl_estiba(x.sku), 2)  as hl
  from public.traspasos_viaje_pet x
  join public.traspasos_viajes v on v.id = x.viaje and v.estado = 'registrado'
  left join public.productos p on p.sku = x.sku
  left join public.traspasos_puntos po on po.clave = v.origen
  left join public.traspasos_puntos pd on pd.clave = v.destino
union all
/* 1b · el SKU y las estibas que se le ponen al viaje al registrarlo (renglones de material), desde ayer */
select m.id, v.id, v.fecha, v.turno,
       (v.hora at time zone 'America/Bogota')::time,
       v.placa,
       coalesce(po.nombre, v.origen_texto, v.origen),
       coalesce(pd.nombre, v.destino_texto, v.destino),
       m.sku, coalesce(p.nombre, e.nombre, m.sku),
       coalesce(public.traspasos_formato_ml(p.nombre, p.contenido), public.traspasos_formato_texto(p.nombre), public.traspasos_formato_texto(e.nombre), public.traspasos_formato_texto(m.sku)),
       m.estibas::numeric,
       round(m.estibas * p.cajas_por_estiba, 0),
       round(m.estibas * public.casco_hl_estiba(m.sku), 2)
  from public.traspasos_viaje_materiales m
  join public.traspasos_viajes v on v.id = m.viaje and v.estado = 'registrado'
  join public.traspasos_tipos t on t.clave = v.tipo
  left join public.productos p on p.sku = m.sku
  left join public.casco_extras e on e.sku = m.sku
  left join public.traspasos_puntos po on po.clave = v.origen
  left join public.traspasos_puntos pd on pd.clave = v.destino
 where (t.materiales = 'pet' or t.clave = 'pet' or t.nombre ilike 'pet' or t.nombre ilike 'pet %')
   and not exists (select 1 from public.traspasos_viaje_pet x where x.viaje = v.id)
union all
/* 2 · del documento SAP del viaje (Importar), un renglón por material del documento */
select v.id, v.id, v.fecha, v.turno,
       (v.hora at time zone 'America/Bogota')::time,
       v.placa,
       coalesce(po.nombre, v.origen_texto, v.origen),
       coalesce(pd.nombre, v.destino_texto, v.destino),
       s.material, coalesce(p.nombre, s.descripcion, s.material),
       coalesce(public.traspasos_formato_ml(p.nombre, p.contenido), public.traspasos_formato_texto(s.descripcion), public.traspasos_formato_texto(p.nombre)),
       /* SAP trae CAJAS (pacas): estibas = cajas ÷ cajas por estiba. Sin ese dato, la carga del viaje si es un solo material. */
       round(coalesce(s.cajas / nullif(p.cajas_por_estiba, 0), case when s.n = 1 then v.carga end, 0)::numeric, 2),
       s.cajas::numeric,
       round(coalesce(s.cajas / nullif(p.cajas_por_estiba, 0), case when s.n = 1 then v.carga end, 0)::numeric * public.casco_hl_estiba(s.material), 2)
  from public.traspasos_viajes v
  join public.traspasos_tipos t on t.clave = v.tipo
  join lateral (
    select m.material, max(m.descripcion) as descripcion, abs(sum(m.cantidad))::numeric as cajas,
           count(*) over () as n
      from public.traspasos_sap_mov m
     where m.referencia = v.documento_clave and m.material is not null
     group by m.material
    having sum(m.cantidad) <> 0
  ) s on true
  left join public.productos p on p.sku = s.material
  left join public.traspasos_puntos po on po.clave = v.origen
  left join public.traspasos_puntos pd on pd.clave = v.destino
 where v.estado = 'registrado' and coalesce(v.vacio, false) = false
   and (t.materiales = 'pet' or t.clave = 'pet' or t.nombre ilike 'pet' or t.nombre ilike 'pet %')
   and v.documento_clave is not null
   and not exists (select 1 from public.traspasos_viaje_pet x where x.viaje = v.id)
   and not exists (select 1 from public.traspasos_viaje_materiales x where x.viaje = v.id)
union all
/* 3 y 4 · sin SKU ni documento SAP: el formato de la nota (si lo dice) o «Sin formato» */
select v.id, v.id, v.fecha, v.turno,
       (v.hora at time zone 'America/Bogota')::time,
       v.placa,
       coalesce(po.nombre, v.origen_texto, v.origen),
       coalesce(pd.nombre, v.destino_texto, v.destino),
       '' as sku, coalesce(nullif(btrim(v.nota), ''), 'Sin SKU') as descripcion,
       public.traspasos_formato_texto(v.nota) as formato_ml,
       coalesce(v.carga, 0)::numeric(12,2) as estibas,
       null::numeric as pacas, null::numeric as hl
  from public.traspasos_viajes v
  join public.traspasos_tipos t on t.clave = v.tipo
  left join public.traspasos_puntos po on po.clave = v.origen
  left join public.traspasos_puntos pd on pd.clave = v.destino
 where v.estado = 'registrado' and coalesce(v.vacio, false) = false
   and (t.materiales = 'pet' or t.clave = 'pet' or t.nombre ilike 'pet' or t.nombre ilike 'pet %')
   and not exists (select 1 from public.traspasos_viaje_pet x where x.viaje = v.id)
   and not exists (select 1 from public.traspasos_viaje_materiales x where x.viaje = v.id)
   and not exists (select 1 from public.traspasos_sap_mov m where m.referencia = v.documento_clave and m.material is not null);
grant select on public.v_traspasos_pet to authenticated;

notify pgrst, 'reload schema';

do $$
declare a int; b int; c int; d int;
begin
  select count(distinct viaje) filter (where sku <> '' and formato_ml is not null),
         count(distinct viaje) filter (where sku <> '' and formato_ml is null),
         count(distinct viaje) filter (where sku = '' and formato_ml is not null),
         count(distinct viaje) filter (where sku = '' and formato_ml is null)
    into a, b, c, d from public.v_traspasos_pet;
  raise notice '----------------------------------------------------------';
  raise notice 'Vhs de PET con SKU y formato ............ %', a;
  raise notice '(los que traen SKU salen en su formato: 200, 330, 1000, 1500)';
  raise notice 'Vhs con SKU pero sin formato en el maestro %', b;
  raise notice 'Vhs con el formato sacado de la nota .... %', c;
  raise notice 'Vhs sin formato (ni SKU, ni SAP, ni nota)  %', d;
  raise notice '----------------------------------------------------------';
end $$;
