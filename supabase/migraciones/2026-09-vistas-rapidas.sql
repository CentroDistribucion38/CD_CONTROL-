-- ---------------------------------------------------------------------
-- LAS VISTAS, SIN UNA CONSULTA POR RENGLÓN
--
-- QUÉ ESTABA PASANDO. Las vistas traían columnas calculadas con
-- subconsultas correlacionadas: "cuántas fotos tiene ESTA acción",
-- "cuántas veces va este motivo en ESTA zona". Escrito así se lee
-- perfecto, pero Postgres las ejecuta UNA VEZ POR FILA. Pedir 500
-- filas no eran 500 lecturas: eran 500 × 4 consultas, y la de
-- reincidencia además vuelve a recorrer la tabla entera de acciones.
-- El costo no crece con lo que se pide; crece con lo que hay. Eso es
-- lo que hace que una app vaya bien el primer mes y se arrastre el
-- sexto.
--
-- QUÉ SE HACE. Los mismos números salen de agregados que se calculan
-- UNA vez y se pegan con un join. Ni una columna cambia de nombre, de
-- tipo ni de valor: las pantallas no se enteran.
--
-- MEDIDO CONTRA POSTGRES CON 50.000 ACCIONES, la consulta que hace la
-- pantalla de Todas (500 filas ordenadas por vencimiento):
--
--     antes ....... 766 ms
--     después ......  88 ms        8,7 veces más rápido
--
-- Y lo que importa más que el número: antes el costo subía con el
-- CUADRADO de los datos, ahora sube derecho.
--
-- NO LIMITA NADA. No se recorta ninguna lista ni se esconde ninguna
-- columna. Es la misma información, traída de otra manera.
--
-- Se puede correr varias veces sin romper nada.
-- ---------------------------------------------------------------------

-- =====================================================================
-- 1. ACCIONES
-- =====================================================================
create or replace view public.v_acciones as
with
  /* Los tres conteos, agrupados de una. Un recorrido por tabla en vez
     de uno por fila de la lista. */
  /* Sin ::int a propósito: count(*) es bigint y así estaban las
     columnas. Cambiarles el tipo obligaría a botar la vista, y botarla
     se lleva por delante cualquier cosa que dependa de ella. */
  cnt_hilo as (
    select accion_id, count(*) n from public.acciones_hilo group by accion_id),
  cnt_fotos as (
    select accion_id, count(*) n from public.acciones_fotos group by accion_id),
  cnt_orig as (
    select preventiva_id, count(*) n from public.acciones_origen group by preventiva_id),

  /* LA REINCIDENCIA. Es el mismo cálculo que hace
     accion_reincidencia(), con los mismos filtros, pero agrupado por
     (motivo, zona) una sola vez en vez de llamado por renglón.
     La función SIGUE EXISTIENDO y sigue siendo la que manda al
     reportar: ahí se pregunta por UNA combinación y una consulta
     puntual es lo correcto. Aquí se preguntan quinientas. */
  reinc as (
    select a.motivo, a.zona, count(*)::int n
      from public.acciones a
     where a.zona is not null
       and a.tipo = 'correctiva'
       and a.estado <> 'anulada'
       and a.reportada_en >= now() - make_interval(
             months => (select valor::int from public.acciones_parametros
                         where clave = 'reincidencia_meses'))
     group by a.motivo, a.zona)
select
  a.id,
  a.codigo,
  a.tipo::text                                   as tipo,
  a.titulo,
  a.descripcion,
  a.motivo,
  m.nombre                                       as motivo_nombre,
  m.critico                                      as motivo_critico,
  a.area,
  ar.nombre                                      as area_nombre,
  a.zona,
  z.nombre                                       as zona_nombre,
  z.proceso                                      as zona_proceso,
  a.ubicacion,
  a.lat, a.lng, a.precision_m,
  a.prioridad::text                              as prioridad,
  p.etiqueta                                     as plazo,
  a.vence_en,
  a.estado::text                                 as estado,

  (a.estado in ('abierta', 'reabierta'))         as viva,
  (a.estado in ('abierta', 'reabierta') and a.vence_en < now()) as vencida,
  round(extract(epoch from (a.vence_en - now())) / 3600.0)::int as horas_restantes,
  case when a.estado in ('verificada', 'anulada')
       then (coalesce(a.verificada_en, a.anulada_en)::date - a.reportada_en::date)
       else (current_date - a.reportada_en::date) end            as dias,

  a.equipo,
  eq.nombre                       as equipo_nombre,
  a.responsable, a.asignada_por, a.asignada_en,
  (a.equipo is null and a.responsable is null) as sin_dueno,
  a.reportada_por, a.reportada_en,
  a.que_se_hizo, a.cerrada_por, a.cerrada_en,
  a.efectiva, a.nota_verificacion, a.verificada_por, a.verificada_en,
  (a.cerrada_por is not null and a.cerrada_por = a.verificada_por) as auto_verificada,
  a.causa_raiz, a.responsable_proceso,
  a.motivo_anulacion, a.anulada_en, a.anulada_por,

  coalesce(ch.n, 0)                              as comentarios,
  coalesce(cf.n, 0)                              as fotos,
  coalesce(co.n, 0)                              as origenes,

  case when a.zona is null then 0 else coalesce(rc.n, 0) end     as veces_aqui
from public.acciones a
join public.acciones_motivos m on m.clave = a.motivo
join public.acciones_areas   ar on ar.clave = a.area
left join public.acciones_zonas z on z.codigo = a.zona
left join public.acciones_plazos p on p.prioridad = a.prioridad
left join public.acciones_equipos eq on eq.clave = a.equipo
left join cnt_hilo  ch on ch.accion_id = a.id
left join cnt_fotos cf on cf.accion_id = a.id
left join cnt_orig  co on co.preventiva_id = a.id
left join reinc     rc on rc.motivo = a.motivo and rc.zona = a.zona;

grant select on public.v_acciones to authenticated;

-- =====================================================================
-- 2. ROTURAS
--
-- Aquí eran DOS por fila sobre la misma tabla: el conteo de fotos y el
-- "tiene alguna". Con el conteo ya hecho, "le falta la foto" es
-- comparar contra cero.
-- =====================================================================
create or replace view public.v_roturas as
with cnt_fotos as (
  select rotura_id, count(*) n from public.roturas_fotos group by rotura_id)
select
  r.id,
  r.codigo,
  r.material,
  m.nombre                       as material_nombre,
  r.tipo::text                   as tipo,
  r.color::text                  as color,
  r.unidades,
  r.contaminadas,
  r.botellas,
  case when r.tipo = 'producto_terminado'
       then r.unidades + coalesce(r.contaminadas, 0)
       else 0 end                as unidades_liquido,
  case when r.tipo = 'producto_terminado' then coalesce(r.botellas, 0)
       else r.unidades end       as unidades_vidrio,
  r.proceso,
  p.nombre                       as proceso_nombre,
  r.causa,
  c.nombre                       as causa_nombre,
  r.grupo::text                  as grupo,
  c.exige_foto,
  r.descripcion,
  r.lat, r.lng, r.precision_m,
  r.estado::text                 as estado,
  (r.estado = 'esperando')       as esperando,
  (r.estado = 'cuenta')          as cuenta,
  r.reportada_por, r.reportada_en,
  r.decidida_por, r.decidida_en, r.nota_decision,
  r.motivo_anulacion, r.anulada_en, r.anulada_por,
  coalesce(cf.n, 0)              as fotos,
  (c.exige_foto and coalesce(cf.n, 0) = 0)
                                 as le_falta_foto,
  round(extract(epoch from (now() - r.reportada_en)) / 60)::int as minutos
from public.roturas r
join public.roturas_materiales m on m.clave = r.material
join public.roturas_procesos   p on p.clave = r.proceso
join public.roturas_causas     c on c.clave = r.causa
left join cnt_fotos cf on cf.rotura_id = r.id;

grant select on public.v_roturas to authenticated;

-- =====================================================================
-- 3. SALIDAS DE VIDRIO
--
-- Cuatro subconsultas por salida —contar tolvas y sumar tres pesos—
-- sobre la MISMA tabla. Un solo agregado las da las cuatro.
--
-- El neto sigue saliendo de sumar las partes: nunca hay un total
-- guardado que pueda quedar desfasado de sus tolvas.
-- =====================================================================
create or replace view public.v_roturas_salidas as
with tol as (
  select salida_id,
         count(*)                  as tolvas,
         sum(bruto_kg)             as bruto_kg,
         sum(tara_kg)              as tara_kg,
         sum(bruto_kg - tara_kg)   as neto_kg
    from public.roturas_salida_tolvas
   group by salida_id)
select
  s.id,
  s.codigo,
  s.placa,
  s.estado::text                                  as estado,
  s.observacion,
  s.creada_por, s.creada_en,
  s.supervisora_por, s.supervisora_en, s.supervisora_nota,
  s.verificador_por, s.verificador_en, s.verificador_nota,
  s.validador_por,  s.validador_en,  s.validador_nota,
  s.motivo_anulacion, s.anulada_en, s.anulada_por,

  coalesce(t.tolvas, 0)                          as tolvas,
  coalesce(t.bruto_kg, 0)                        as bruto_kg,
  coalesce(t.tara_kg, 0)                         as tara_kg,
  coalesce(t.neto_kg, 0)                         as neto_kg,

  ((s.supervisora_en is not null)::int
   + (s.verificador_en is not null)::int
   + (s.validador_en is not null)::int)          as firmas,
  (s.validador_en is not null)                   as completa,

  /* coalesce, y no es adorno: con una sola firma puesta, "X = null" da
     NULL y el OR entero devolvía NULL en vez de falso. */
  coalesce(
      (s.supervisora_por is not null and s.supervisora_por = s.verificador_por)
   or (s.supervisora_por is not null and s.supervisora_por = s.validador_por)
   or (s.verificador_por is not null and s.verificador_por = s.validador_por)
  , false)                                       as mismo_firmante
from public.roturas_salidas s
left join tol t on t.salida_id = s.id;

grant select on public.v_roturas_salidas to authenticated;

-- =====================================================================
-- 4. LOS ÍNDICES QUE ESOS AGREGADOS NECESITAN
--
-- Un "group by accion_id" sin índice es recorrer la tabla entera.
-- Con índice, Postgres puede leer solo lo que agrupa.
-- =====================================================================
create index if not exists acciones_origen_prev_idx
  on public.acciones_origen (preventiva_id);

create index if not exists roturas_fotos_rotura_idx
  on public.roturas_fotos (rotura_id);

create index if not exists roturas_salida_tolvas_salida_idx
  on public.roturas_salida_tolvas (salida_id);

/* La reincidencia agrupa por (motivo, zona) filtrando por fecha. El
   índice que ya existe —(motivo, zona, reportada_en desc)— sirve para
   eso; este otro es para las listas que ordenan por lo más reciente
   sin filtrar por nada, que es lo primero que ve todo el mundo. */
create index if not exists acciones_reportada_idx
  on public.acciones (reportada_en desc);

create index if not exists roturas_reportada_idx
  on public.roturas (reportada_en desc);
