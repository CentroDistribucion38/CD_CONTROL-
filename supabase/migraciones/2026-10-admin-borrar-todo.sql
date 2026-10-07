-- =====================================================================
-- ADMINISTRACIÓN · BORRAR DATOS — TODO LO QUE HAY EN LA APP
--
-- «En borrar datos debe estar lo que esté en la app, porque hay módulos que
--  necesito borrar y no están.»
--
-- Solo cambia LA LISTA (admin_borrado_catalogo): se agregan los puntos que
-- faltaban —cargas y simulador de Quiebra, fichas de Sider, hallazgos y
-- acciones programadas de Acciones, averías, cortes, inventarios fiscales,
-- plan de envase y rótulos de Inventario, las constancias de lo eliminado y
-- las visitas de uso— y el conteo ahora también quita las fotos de
-- evidencia. El conteo, la copia en Excel y el borrado siguen igual: se
-- eligen por clave de esta lista.
-- Los maestros, los usuarios, los roles y sus historiales NO están.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create or replace function public.admin_borrado_catalogo()
returns table (clave text, modulo text, nombre text, detalle text, tabla text,
               fecha text, extra text, bucket text, rutas text, orden int)
language sql stable
set search_path = public
as $$
  select * from (values
    ('traspasos.plan', 'Traspasos', 'Plan de viajes',
     'Lo planeado por día y turno, con los vacíos planeados.',
     'traspasos_plan', 't.fecha', 'traspasos_plan_vacios', null, null, 10),
    ('traspasos.viajes', 'Traspasos', 'Viajes registrados',
     'Cada viaje con sus tipos, su salida de facturación y su rastro de correcciones.',
     'traspasos_viajes', 't.fecha', null, null, null, 11),
    ('traspasos.sap', 'Traspasos', 'Movimientos de SAP importados',
     'Lo que se subió del corte de SAP para el cruce.',
     'traspasos_sap_mov', 't.fecha', null, null, null, 12),

    ('rotlinea.registro', 'Rotura de línea', 'Pesadas registradas',
     'Cada pesada por línea, turno, máquina y envase.',
     'rotlinea_registro', 't.fecha', null, null, null, 20),
    ('rotlinea.firmas', 'Rotura de línea', 'Firmas de turno (las de antes)',
     'Las firmas por turno que se quitaron de la pantalla.',
     'rotlinea_firmas', 't.fecha', null, null, null, 21),
    ('rotlinea.hojas', 'Rotura de línea', 'Hojas del día generadas',
     'Los PDF firmados y su lista en Informes generados, incluidas las anuladas.',
     'rotlinea_hojas', 't.fecha', null, 'rotlinea-hojas',
     'select t.ruta from public.rotlinea_hojas t where %s', 22),
    ('rotlinea.produccion', 'Rotura de línea', 'Producción importada',
     'Las órdenes de producción subidas para el índice.',
     'rotlinea_produccion', 't.fecha', null, null, null, 23),

    ('roturas.reportes', 'Roturas', 'Reportes de rotura',
     'Cada reporte con sus fotos.',
     'roturas', '(t.reportada_en at time zone ''America/Bogota'')::date', null, 'roturas',
     'select f.ruta from public.roturas_fotos f join public.roturas t on t.id = f.rotura_id where %s', 30),
    ('roturas.salidas', 'Roturas', 'Salidas de rotura',
     'Las salidas con sus tolvas y sus aprobaciones.',
     'roturas_salidas', '(t.creada_en at time zone ''America/Bogota'')::date', null, null, null, 31),

    ('quiebra.diario', 'Quiebra', 'Registro diario',
     'La producción y la baja escritas día por día, con sus causales.',
     'quiebra_diario', 't.fecha', null, null, null, 40),
    ('quiebra.bajas', 'Quiebra', 'Bajas importadas de SAP',
     'Las filas de bajas que se subieron por archivo.',
     'quiebra_bajas', 't.fecha', null, null, null, 41),
    ('quiebra.produccion', 'Quiebra', 'Producción importada de SAP',
     'Las filas de producción que se subieron por archivo.',
     'quiebra_produccion', 't.fecha', null, null, null, 42),

    ('sider.viajes', 'Sider', 'Viajes',
     'Cada viaje con sus certificaciones, sus fotos y sus revisiones de AI.',
     'sider_viajes', 't.fecha', null, 'sider',
     'select f.ruta from public.sider_fotos f join public.sider_certificaciones c on c.id = f.certificacion_id join public.sider_viajes t on t.id = c.viaje_id where %s', 50),
    ('sider.novedades', 'Sider', 'Novedades',
     'Las novedades con su hilo y su foto.',
     'sider_novedades', 't.fecha', null, 'sider',
     'select t.foto_ruta from public.sider_novedades t where t.foto_ruta is not null and %s', 51),
    ('sider.ai', 'Sider', 'Revisiones de AI',
     'Las revisiones de AI con sus conteos.',
     'sider_ai_revisiones', 't.fecha', null, null, null, 52),
    ('sider.zlde', 'Sider', 'ZLDE importado',
     'Lo que se subió del ZLDE.',
     'sider_zlde', 'coalesce(t.fecha, t.mes)', null, null, null, 53),

    ('acciones.reportes', 'Acciones', 'Acciones reportadas',
     'Cada acción con sus fotos y su hilo.',
     'acciones', '(t.reportada_en at time zone ''America/Bogota'')::date', null, 'acciones',
     'select f.ruta from public.acciones_fotos f join public.acciones t on t.id = f.accion_id where %s', 60),

    ('inventario.conteos', 'Inventario', 'Conteos',
     'Cada conteo con sus líneas, sus módulos y sus fotos de evidencia.',
     'conteos', '(t.creado_en at time zone ''America/Bogota'')::date', null, 'inventario',
     'select f.ruta from public.conteo_fotos f join public.conteos t on t.id = f.conteo_id where %1$s union all select m.ruta from public.conteo_modulos m join public.conteos t on t.id = m.conteo_id where m.ruta is not null and %1$s', 70),

    ('roturas.eliminadas', 'Roturas', 'Reportes eliminados (registro)',
     'La constancia de los reportes que se eliminaron, con su motivo.',
     'roturas_borradas', '(t.borrada_en at time zone ''America/Bogota'')::date', null, null, null, 32),
    ('roturas.salidaseliminadas', 'Roturas', 'Salidas eliminadas (registro)',
     'La constancia de las salidas que se eliminaron, con su motivo.',
     'roturas_salidas_borradas', '(t.borrada_en at time zone ''America/Bogota'')::date', null, null, null, 33),

    ('quiebra.cargas', 'Quiebra', 'Cargas de archivos (registro)',
     'La lista de archivos subidos. Las bajas y la producción que subieron NO se borran: quedan sin carga.',
     'quiebra_cargas', '(t.cargado_en at time zone ''America/Bogota'')::date', null, null, null, 43),
    ('quiebra.simulador', 'Quiebra', 'Simulador mensual',
     'Lo escrito en el simulador (cona, % de quiebra, baja manual) por mes.',
     'quiebra_simulador', 'make_date(t.anio, t.mes, 1)', null, null, null, 44),

    ('sider.fichas', 'Sider', 'Fichas de sorting',
     'Cada ficha con sus líneas y sus fotos.',
     'sider_fichas', '(t.creado_en at time zone ''America/Bogota'')::date', null, 'sider',
     'select f.ruta from public.sider_ficha_fotos f join public.sider_fichas t on t.id = f.ficha_id where %s', 54),
    ('sider.eliminados', 'Sider', 'Viajes eliminados (registro)',
     'La constancia de los viajes que se anularon o eliminaron.',
     'sider_viajes_eliminados', '(t.eliminado_en at time zone ''America/Bogota'')::date', null, null, null, 55),

    ('acciones.hallazgos', 'Acciones', 'Hallazgos ABI',
     'Cada hallazgo con sus fotos. Las acciones que salieron de él se quedan.',
     'acciones_hallazgos', 't.fecha', null, 'acciones',
     'select f.ruta from public.acciones_hallazgos_fotos f join public.acciones_hallazgos t on t.id = f.hallazgo_id where %s', 61),
    ('acciones.programadas', 'Acciones', 'Acciones programadas',
     'Las acciones que se repiten solas. Las ya creadas se quedan, sin programación.',
     'acciones_programadas', '(t.creada_en at time zone ''America/Bogota'')::date', null, null, null, 62),
    ('acciones.hallazgoseliminados', 'Acciones', 'Hallazgos eliminados (registro)',
     'La constancia de los hallazgos que se eliminaron.',
     'acciones_hallazgos_borrados', '(t.borrado_en at time zone ''America/Bogota'')::date', null, null, null, 63),

    ('inventario.averias', 'Inventario', 'Averías',
     'Cada avería registrada, con sus fotos.',
     'averias', 't.fecha', null, 'inventario',
     'select f.ruta from public.averias_fotos f join public.averias t on t.id = f.averia_id where %s', 71),
    ('inventario.cortes', 'Inventario', 'Cortes de línea',
     'Cada corte con sus renglones y sus sitios.',
     'inv_cortes', '(t.cortado_en at time zone ''America/Bogota'')::date', null, null, null, 72),
    ('inventario.fiscal', 'Inventario', 'Inventarios fiscales',
     'Cada inventario fiscal con sus hojas, sus miembros y sus conteos.',
     'inv_fiscales', 't.fecha', null, null, null, 73),
    ('inventario.envase', 'Inventario', 'Plan de envase',
     'Las semanas cargadas con sus bloques y sus pendientes.',
     'plan_envase_semanas', 't.fecha_ini', null, null, null, 74),
    ('inventario.rotulos', 'Inventario', 'Rótulos del plan',
     'Los rótulos del plan por día, con sus cierres.',
     'rotulos_plan', 't.fecha', 'rotulos_plan_cierre', null, null, 75),

    ('admin.uso', 'Administración', 'Visitas de uso',
     'El registro de quién entró a qué pantalla y cuánto estuvo.',
     'uso_visitas', '(t.entro_en at time zone ''America/Bogota'')::date', null, null, null, 90)
  ) as c(clave, modulo, nombre, detalle, tabla, fecha, extra, bucket, rutas, orden)
  -- Solo lo que existe en ESTA base: un módulo que no se instaló no sale.
  where to_regclass('public.' || c.tabla) is not null
  order by c.orden
$$;


do $$ begin raise notice 'LISTO: Borrar datos ofrece todo lo que hay en la app.'; end $$;
commit;
