-- =====================================================================
-- ADMINISTRACIÓN · BORRAR DATOS PUNTUALES PARA EMPEZAR DE CERO
-- ---------------------------------------------------------------------
-- «Que dentro de Administración haya algo donde pueda elegir algo en
-- específico y borrar la data con el fin de empezar de cero. No módulos
-- en general, sino puntos específicos.»
--
-- QUÉ SE PUEDE BORRAR: una lista cerrada, escrita aquí. No se le puede
-- pasar el nombre de una tabla cualquiera: la pantalla elige una CLAVE
-- de esta lista y nada más. Los maestros (tipos, puntos, placas,
-- máquinas, SKU…), los usuarios y los roles NO están en la lista: borrar
-- eso no es empezar de cero, es romper la aplicación.
--
-- CÓMO SE BORRA:
--   1. contar     cuántas filas y archivos se van, con el rango elegido;
--   2. exportar   las filas, para bajarlas en Excel ANTES de borrar;
--   3. borrar     solo si se escribe BORRAR y si el conteo sigue siendo
--                 el que se vio: si alguien registró algo en el medio, no
--                 se borra lo que no se vio.
-- Todo solo para un rol que administra la plataforma (manda()).
--
-- LO QUE CUELGA SE VA CON LO SUYO por las llaves de la base (ON DELETE
-- CASCADE): un viaje se lleva sus tipos y su rastro de ediciones, un
-- reporte sus fotos y su hilo. Los archivos (PDF y fotos) no se borran
-- desde SQL —Supabase no lo permite—: la función devuelve sus rutas y el
-- servidor los borra con la API de Storage.
--
-- QUEDA ESCRITO: cada borrado deja una fila en admin_borrados con quién,
-- cuándo, qué, el rango y cuántas filas.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.admin_borrados (
  id          bigint generated always as identity primary key,
  clave       text        not null,
  nombre      text        not null,
  desde       date,
  hasta       date,
  filas       bigint      not null,
  archivos    bigint      not null default 0,
  borrado_por uuid        default auth.uid(),
  borrado_en  timestamptz not null default now()
);
alter table public.admin_borrados enable row level security;
drop policy if exists admin_borrados_ver on public.admin_borrados;
create policy admin_borrados_ver on public.admin_borrados
  for select to authenticated using (public.manda());
-- Nadie escribe a mano en el registro: solo la función de borrar.
revoke insert, update, delete on public.admin_borrados from authenticated, anon;
grant select on public.admin_borrados to authenticated;

-- ---------------------------------------------------------------------
-- LA LISTA. Una fila por punto que se puede borrar, en el orden de los
-- módulos del menú y, dentro de cada uno, en el orden del proceso.
--
--   tabla    la tabla principal
--   fecha    la expresión del día de cada fila, sobre el alias t
--   extra    otra tabla del mismo punto que se borra con el mismo rango
--            por su columna `fecha` (el plan y sus vacíos)
--   bucket / rutas   dónde están sus archivos, y el select que los lista
-- ---------------------------------------------------------------------
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
     'Cada conteo con sus líneas.',
     'conteos', '(t.creado_en at time zone ''America/Bogota'')::date', null, null, null, 70)
  ) as c(clave, modulo, nombre, detalle, tabla, fecha, extra, bucket, rutas, orden)
  -- Solo lo que existe en ESTA base: un módulo que no se instaló no sale.
  where to_regclass('public.' || c.tabla) is not null
  order by c.orden
$$;

-- El «where» del rango, sobre el alias t. Sin fechas = todo.
create or replace function public.admin_borrado_donde(p_fecha text, p_desde date, p_hasta date)
returns text language sql immutable
as $$
  select case
    when p_desde is null and p_hasta is null then 'true'
    else format('(%1$s) between %2$L::date and %3$L::date', p_fecha,
                coalesce(p_desde, '0001-01-01'::date), coalesce(p_hasta, '9999-12-31'::date))
  end
$$;

-- ---------------------------------------------------------------------
-- 1. CONTAR
-- ---------------------------------------------------------------------
create or replace function public.admin_borrado_contar(p_clave text, p_desde date, p_hasta date)
returns table (filas bigint, archivos bigint, primera date, ultima date)
language plpgsql security definer
set search_path = public
as $$
declare c record; v_donde text; v_extra bigint := 0;
begin
  if not public.manda() then raise exception 'Borrar datos es solo de quien administra la plataforma'; end if;
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha inicial va después de la final';
  end if;
  select * into c from public.admin_borrado_catalogo() k where k.clave = p_clave;
  if c.clave is null then raise exception 'Ese dato no está en la lista de lo que se puede borrar'; end if;
  v_donde := public.admin_borrado_donde(c.fecha, p_desde, p_hasta);

  execute format('select count(*), min(%1$s), max(%1$s) from public.%2$I t where %3$s', c.fecha, c.tabla, v_donde)
    into filas, primera, ultima;
  if c.extra is not null then
    execute format('select count(*) from public.%1$I t where %2$s', c.extra,
                   public.admin_borrado_donde('t.fecha', p_desde, p_hasta)) into v_extra;
    filas := filas + v_extra;
  end if;
  archivos := 0;
  if c.rutas is not null then
    execute format('select count(*) from (' || c.rutas || ') x', v_donde) into archivos;
  end if;
  return next;
end $$;

-- ---------------------------------------------------------------------
-- 2. EXPORTAR: las filas tal cual, como JSON, para el Excel. En orden
-- fijo (fecha y posición física) para poder pedirlas de a mil sin que
-- una página repita o salte filas.
-- ---------------------------------------------------------------------
create or replace function public.admin_borrado_filas(p_clave text, p_desde date, p_hasta date)
returns table (hoja text, fila jsonb)
language plpgsql security definer
set search_path = public
as $$
declare c record; v_donde text;
begin
  if not public.manda() then raise exception 'Borrar datos es solo de quien administra la plataforma'; end if;
  select * into c from public.admin_borrado_catalogo() k where k.clave = p_clave;
  if c.clave is null then raise exception 'Ese dato no está en la lista de lo que se puede borrar'; end if;
  v_donde := public.admin_borrado_donde(c.fecha, p_desde, p_hasta);
  return query execute format(
    'select %1$L::text, to_jsonb(t) from public.%1$I t where %2$s order by %3$s, t.ctid', c.tabla, v_donde, c.fecha);
  if c.extra is not null then
    return query execute format('select %1$L::text, to_jsonb(t) from public.%1$I t where %2$s order by t.fecha, t.ctid',
      c.extra, public.admin_borrado_donde('t.fecha', p_desde, p_hasta));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. BORRAR
--
-- Lo que cuelga se va por las llaves (ON DELETE CASCADE) y lo que solo
-- apuntaba queda sin apuntar (ON DELETE SET NULL). Ningún candado de los
-- módulos dispara al borrar: el del día cerrado y el de lo ya facturado
-- cuidan cambios, no borrados.
-- ---------------------------------------------------------------------
create or replace function public.admin_borrar(
  p_clave text, p_desde date, p_hasta date, p_confirmacion text, p_esperadas bigint)
returns table (filas bigint, bucket text, rutas text[])
language plpgsql security definer
set search_path = public
as $$
declare c record; v_donde text; v_n bigint; v_x bigint := 0; v_hay bigint; v_rutas text[] := '{}';
begin
  if not public.manda() then raise exception 'Borrar datos es solo de quien administra la plataforma'; end if;
  if coalesce(p_confirmacion, '') <> 'BORRAR' then
    raise exception 'Para borrar hay que escribir BORRAR, en mayúsculas';
  end if;
  select * into c from public.admin_borrado_catalogo() k where k.clave = p_clave;
  if c.clave is null then raise exception 'Ese dato no está en la lista de lo que se puede borrar'; end if;

  select a.filas into v_hay from public.admin_borrado_contar(p_clave, p_desde, p_hasta) a;
  if v_hay is distinct from p_esperadas then
    raise exception 'Mientras mirabas cambió lo que hay: ahora son % filas y viste %. Vuelve a contar antes de borrar',
      v_hay, p_esperadas;
  end if;

  v_donde := public.admin_borrado_donde(c.fecha, p_desde, p_hasta);
  if c.rutas is not null then
    execute format('select coalesce(array_agg(r), ''{}'') from (' || c.rutas || ') x(r)', v_donde) into v_rutas;
  end if;

  execute format('delete from public.%1$I t where %2$s', c.tabla, v_donde);
  get diagnostics v_n = row_count;
  if c.extra is not null then
    execute format('delete from public.%1$I t where %2$s', c.extra,
                   public.admin_borrado_donde('t.fecha', p_desde, p_hasta));
    get diagnostics v_x = row_count;
  end if;

  insert into public.admin_borrados (clave, nombre, desde, hasta, filas, archivos)
  values (c.clave, c.modulo || ' · ' || c.nombre, p_desde, p_hasta, v_n + v_x, coalesce(array_length(v_rutas, 1), 0));

  filas := v_n + v_x; bucket := c.bucket; rutas := v_rutas;
  return next;
end $$;

revoke all on function public.admin_borrado_catalogo() from public, anon;
revoke all on function public.admin_borrado_contar(text, date, date) from public, anon;
revoke all on function public.admin_borrado_filas(text, date, date) from public, anon;
revoke all on function public.admin_borrar(text, date, date, text, bigint) from public, anon;
grant execute on function public.admin_borrado_catalogo() to authenticated;
grant execute on function public.admin_borrado_contar(text, date, date) to authenticated;
grant execute on function public.admin_borrado_filas(text, date, date) to authenticated;
grant execute on function public.admin_borrar(text, date, date, text, bigint) to authenticated;

-- El registro, con el nombre de quien borró. Corre como su dueño para
-- poder poner el nombre, y por eso filtra él mismo: solo quien administra.
create or replace view public.v_admin_borrados as
select b.*, p.nombre as borrado_nombre
  from public.admin_borrados b left join public.perfiles p on p.id = b.borrado_por
 where public.manda();
grant select on public.v_admin_borrados to authenticated;

do $$ begin raise notice 'LISTO: Administración puede borrar datos puntuales, con conteo, copia y registro.'; end $$;
commit;
