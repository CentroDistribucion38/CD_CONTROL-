-- =====================================================================
-- SIDER · AI — LOS TRES TOTALES DE LA HOJA, CADA UNO CON SU NOMBRE
--
-- «No me cuadran los valores.» Y no cuadran porque «BD AI BAQ» tiene
-- TRES sumas de botellas con defecto en la misma fila, las tres se
-- llaman casi igual, y no coinciden en 252 de las 296 filas. La pantalla
-- mostraba solo una —la que cobra— así que era imposible cuadrarla
-- contra el archivo.
--
-- LAS TRES, CON LA FÓRMULA EXACTA DE LA HOJA:
--
--   T  «TOTAL BOTELLAS CON DEFECTOS»      = SUM(U:AD)
--      AI «% TOTAL BOTELLAS CON DEFECTOS» = T / S
--      Diez categorías. CON hongo y etiqueta asoleada, SIN mezclado y
--      SIN cuerpo extraño. Suma 7.427 en las 296 filas.
--      NO ES LA QUE COBRA. Es la que más se mira, y ahí está el lío.
--
--   M  «% ÍNDICE DE COBRO» = (U+V+W+X+Y+Z+AA+AB+AE) / S
--      BG «%AI» es la misma fórmula, repetida.
--      Nueve. CON mezclado, SIN hongo ni etiqueta asoleada. Suma 7.140.
--      ESTA ES LA QUE FACTURA: N y BH la multiplican por las recibidas
--      para sacar las unidades no abonadas, que es lo que viaja a SAP.
--
--   AU «TOTAL BOTELLAS CON DEFECTOS (Hl)» = SUM(AV:BF)
--      Once. Las diez de T más CUERPO EXTRAÑO. Suma 7.917.
--      O sea que el total en hectolitros de la hoja no corresponde a
--      ninguno de los dos totales en botellas. Tampoco es un error de
--      alguien: son once columnas de Hl y once categorías, y nadie se
--      dio cuenta de que la lista no era la misma.
--
-- QUÉ HACE ESTE ARCHIVO. Poner las tres en la vista, con nombre propio,
-- para que la pantalla pueda mostrarlas lado a lado y se pueda cuadrar
-- contra el Excel columna por columna.
--
-- LO QUE NO HACE: cambiar lo que cobra. `indice`, `no_abono` y
-- `abono_sap` siguen saliendo de las nueve. Las otras dos entran como
-- CIFRAS DE LECTURA y se llaman `_hoja` para que nadie las confunda con
-- las de cobro seis meses después.
--
-- Se puede correr varias veces.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.v_sider_ai') is null then
    raise exception
      'Falta el módulo Sider AI. Corre sider-ai.sql, 2026-09-sider-ai-que-cobra.sql y 2026-09-sider-ai-historico.sql, y vuelve aquí.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'sider_ai_revisiones' and column_name = 'origen') then
    raise exception
      'Falta supabase/migraciones/2026-09-sider-ai-historico.sql. Ese va antes que este.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- QUÉ CATEGORÍA ENTRA EN CUÁL TOTAL
--
-- Va en una tabla y no en tres listas repetidas dentro de la vista.
-- Escribir «hongo» en tres sitios es escribirlo mal en uno de los tres
-- el día que cambie la política, y ese error no da error: da una cifra
-- distinta en una pantalla y la misma en las otras dos.
--
-- `cobra` NO se toca aquí: esa bandera ya la maneja el maestro y
-- 2026-09-sider-ai-que-cobra.sql. Estas dos son solo para poder cuadrar
-- contra el archivo.
-- ---------------------------------------------------------------------
alter table public.sider_ai_defectos
  add column if not exists en_total_hoja boolean not null default false,
  add column if not exists en_hl_hoja    boolean not null default false;

comment on column public.sider_ai_defectos.en_total_hoja is
  'Entra en «TOTAL BOTELLAS CON DEFECTOS» (columna T del Excel, SUM(U:AD)). '
  'Es una cifra de LECTURA, no de cobro.';
comment on column public.sider_ai_defectos.en_hl_hoja is
  'Entra en «TOTAL BOTELLAS CON DEFECTOS (Hl)» (columna AU, SUM(AV:BF)). '
  'Es una cifra de LECTURA, no de cobro.';

-- T = SUM(U:AD): las diez primeras columnas de conteo de la hoja.
update public.sider_ai_defectos set en_total_hoja = clave in (
  'rota', 'faltante', 'cemento', 'no_retorn', 'otras_cias',
  'antiguo', 'extrasucio', 'cristalizado', 'hongo', 'etiq_asoleada'
);

-- AU = SUM(AV:BF): las mismas diez MÁS cuerpo extraño.
update public.sider_ai_defectos set en_hl_hoja = clave in (
  'rota', 'faltante', 'cemento', 'no_retorn', 'otras_cias',
  'antiguo', 'extrasucio', 'cristalizado', 'hongo', 'etiq_asoleada',
  'cuerpo_extra'
);


-- ---------------------------------------------------------------------
-- LA VISTA, CON LAS TRES
--
-- `drop` y no `create or replace`: gana columnas. El resto va COPIADO,
-- no reescrito de memoria.
-- ---------------------------------------------------------------------
drop view if exists public.v_sider_ai;

create view public.v_sider_ai as
select
  r.id, r.viaje_id, r.origen, r.fecha, r.planta, r.placa, r.turno,
  r.canal,  c.nombre  as canal_nombre,
  r.socio,  s.nombre  as socio_nombre,
  r.envase, e.descripcion as envase_nombre, e.litros,
  r.certificado, r.recibidas, r.revisadas, r.zcl3, r.comentarios,
  r.revisado_por, r.revisado_en, r.editado_por, r.editado_en, r.ediciones,

  /* ---- LO QUE COBRA. Nueve categorías, columna M del Excel. ---- */
  coalesce(t.defectos, 0)::integer  as defectos,
  coalesce(t.otros,    0)::integer  as otros,
  coalesce(t.total,    0)::integer  as marcadas,
  round(coalesce(t.defectos, 0)::numeric / r.revisadas, 6) as indice,
  round(r.recibidas * coalesce(t.defectos, 0)::numeric / r.revisadas)::integer as no_abono,
  r.recibidas
    - round(r.recibidas * coalesce(t.defectos, 0)::numeric / r.revisadas)::integer as abono_sap,
  round(coalesce(t.defectos, 0) * e.litros / 100, 4) as hl_defectos,

  /* ---- LAS DOS DE LECTURA, para cuadrar contra el archivo. ----
     Se llaman `_hoja` a propósito: dentro de seis meses, alguien que
     abra esta vista tiene que poder distinguir de un vistazo cuál es la
     que le cobra al socio y cuáles están aquí solo para cuadrar. */
  coalesce(t.total_hoja, 0)::integer as defectos_hoja,          -- columna T
  round(coalesce(t.total_hoja, 0)::numeric / r.revisadas, 6) as pct_hoja,  -- columna AI
  round(coalesce(t.hl_hoja, 0) * e.litros / 100, 4) as hl_hoja  -- columna AU

from public.sider_ai_revisiones r
join public.sider_ai_envases  e on e.clave = r.envase
join public.sider_ai_canales  c on c.clave = r.canal
left join public.sider_ai_socios s on s.clave = r.socio
left join (
  select k.revision_id,
         sum(k.unidades) filter (where d.cobra)         as defectos,
         sum(k.unidades) filter (where not d.cobra)     as otros,
         sum(k.unidades)                                as total,
         sum(k.unidades) filter (where d.en_total_hoja) as total_hoja,
         sum(k.unidades) filter (where d.en_hl_hoja)    as hl_hoja
    from public.sider_ai_conteos k
    join public.sider_ai_defectos d on d.clave = k.defecto
   group by k.revision_id
) t on t.revision_id = r.id;

grant select on public.v_sider_ai to authenticated;


-- ---------------------------------------------------------------------
-- Y EL DETALLE, CON LAS DOS BANDERAS
--
-- La pantalla necesita saber, defecto por defecto, si entra en cada
-- total: es lo que le permite poner las doce columnas de % y las doce
-- de Hl del archivo en el mismo orden y con el mismo contenido.
-- ---------------------------------------------------------------------
drop view if exists public.v_sider_ai_detalle;

create view public.v_sider_ai_detalle as
select
  k.revision_id, k.defecto, d.nombre as defecto_nombre,
  d.cobra, d.en_total_hoja, d.en_hl_hoja, d.orden,
  k.unidades,
  round(k.unidades::numeric / r.revisadas, 6) as pct,
  round(k.unidades * e.litros / 100, 4)       as hl
from public.sider_ai_conteos k
join public.sider_ai_defectos d on d.clave = k.defecto
join public.sider_ai_revisiones r on r.id = k.revision_id
join public.sider_ai_envases e on e.clave = r.envase;

grant select on public.v_sider_ai_detalle to authenticated;


-- ---------------------------------------------------------------------
-- QUE LAS TRES LISTAS SEAN LAS DEL ARCHIVO
--
-- No se cuenta cuántas hay: se comparan LAS LISTAS. Contar dejaría pasar
-- un intercambio —quitar mezclado y meter hongo sigue dando nueve— que
-- es exactamente el error que ya costó un 4,5 % de sobrecobro.
-- ---------------------------------------------------------------------
do $$
declare v_falla text := ''; v_l text;
begin
  select string_agg(clave, ',' order by clave) into v_l
    from public.sider_ai_defectos where cobra;
  if v_l is distinct from
     'antiguo,cemento,cristalizado,extrasucio,faltante,mezclado,no_retorn,otras_cias,rota' then
    v_falla := v_falla || ' cobran: ' || coalesce(v_l, '∅') || ';';
  end if;

  select string_agg(clave, ',' order by clave) into v_l
    from public.sider_ai_defectos where en_total_hoja;
  if v_l is distinct from
     'antiguo,cemento,cristalizado,etiq_asoleada,extrasucio,faltante,hongo,no_retorn,otras_cias,rota' then
    v_falla := v_falla || ' total de la hoja: ' || coalesce(v_l, '∅') || ';';
  end if;

  select string_agg(clave, ',' order by clave) into v_l
    from public.sider_ai_defectos where en_hl_hoja;
  if v_l is distinct from
     'antiguo,cemento,cristalizado,cuerpo_extra,etiq_asoleada,extrasucio,faltante,hongo,no_retorn,otras_cias,rota' then
    v_falla := v_falla || ' Hl de la hoja: ' || coalesce(v_l, '∅') || ';';
  end if;

  if v_falla <> '' then raise exception 'Las listas no son las del archivo:%', v_falla; end if;
  raise notice 'Listo. Los tres totales en la vista: indice (9 que cobran), pct_hoja (10) y hl_hoja (11).';
end $$;

commit;
