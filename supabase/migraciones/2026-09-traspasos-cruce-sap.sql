-- =====================================================================
-- TRASPASOS · EL CRUCE CONTRA SAP
--
-- «Necesito hacer cruces con ese Excel: ingresa lo de importar con el
--  fin de comparar si lo que registraron coincide con lo del sistema, y
--  ahí mismo en el tablero, en la parte de abajo, debe decir qué
--  documentos faltaron.»
--
-- ---------------------------------------------------------------------
-- LA REGLA DE CONTEO, QUE ES TODO EL ASUNTO
-- ---------------------------------------------------------------------
-- El Excel de SAP trae MOVIMIENTOS, no documentos. Una misma referencia
-- puede salir tres veces:
--
--   7687019429   -36   clase 647     ← se sacó
--   7687019429   +36   clase 648     ← se anuló
--   7687019429   -28   clase 647     ← se rehízo bien
--
-- Eso es UN documento, no tres. Y al revés:
--
--   7687019429   +36
--   7687019429   -36
--
-- eso es un documento que se anuló y ya: NO cuenta.
--
-- LA REGLA SALE SOLA DE LOS DOS EJEMPLOS: se agrupa por referencia, se
-- SUMAN las cantidades, y el documento cuenta si el neto es distinto de
-- cero. Tenga uno o tenga cinco movimientos.
--
-- Y NO DEPENDE DE CONOCER LAS CLASES DE MOVIMIENTO. Se podría haber
-- escrito «647 suma, 648 resta», pero eso obliga a mantener una lista de
-- códigos de SAP aquí adentro y a adivinar qué hacer con el código que
-- aparezca mañana. La suma no necesita saber qué significa cada clase:
-- si SAP la anotó con signo, el signo ya lo dice.
--
-- LO ANULADO NO SE TIRA, SE MARCA. `cuenta` guarda si el neto quedó en
-- cero. Borrarlo dejaría a alguien buscando en el Excel por qué un
-- documento que ve con sus ojos no aparece por ningún lado; marcado, la
-- pantalla puede decir «ese se anuló en SAP» en vez de callarse.
--
-- ---------------------------------------------------------------------
-- LOS DOS LADOS DEL CRUCE
-- ---------------------------------------------------------------------
--   · FALTA  — está en SAP y nadie lo registró. Es lo que se pidió.
--   · SOBRA  — está registrado y SAP no lo tiene. No se pidió, pero es
--     el que caza el DEDAZO: un documento tecleado mal sale como
--     «falta» el bueno y, sin este lado, el malo no aparece por ningún
--     sitio y nadie sabe que está ahí.
--   · CUADRA — los dos lo tienen.
--
-- EL CRUCE SE ENCIERRA EN LAS FECHAS DEL EXCEL. Sin eso, todo viaje
-- registrado antes del primer día importado saldría como «sobra» —
-- cientos de renglones que no son un problema, solo son de otra semana.
--
-- ---------------------------------------------------------------------
-- POR QUÉ TODO VA EN UN SOLO BLOQUE
-- ---------------------------------------------------------------------
-- El editor de Supabase no ejecuta un archivo como una sola
-- transacción: un `begin;` arriba no lo agrupa como uno espera. Y por
-- eso el delimitador del bloque no se escribe en ningún comentario de
-- este archivo: el editor cuenta esos signos para saber dónde acaba cada
-- sentencia, y uno suelto en un comentario parte el bloque por la mitad.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-documento.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

create table if not exists public.traspasos_sap (
  /* LA REFERENCIA YA NORMALIZADA es la llave. Se guarda como viene
     también —`referencia_cruda`— porque el día que algo no cruce, lo
     primero que se quiere ver es qué decía el Excel exactamente. */
  referencia       text primary key,
  referencia_cruda text,
  fecha            date not null,
  hora             time,
  material         text,
  descripcion      text,
  /* EL NETO, no la cantidad de un movimiento: es la suma del grupo. */
  neto             integer not null,
  movimientos      integer not null default 1,
  /* Si el documento cuenta. Falso = se anuló en SAP y quedó en cero. */
  cuenta           boolean not null default true,
  centro           text,
  almacen          text,
  importado_por    uuid references public.perfiles(id) on delete set null,
  importado_en     timestamptz not null default now()
);

create index if not exists traspasos_sap_fecha_idx on public.traspasos_sap (fecha);

alter table public.traspasos_sap enable row level security;

/* LOS PERMISOS DE TABLA, APARTE DE LA POLÍTICA. Son dos cosas distintas
   y hacen falta las dos: el GRANT dice si el rol puede tocar la tabla, y
   la política dice qué filas. Sin el GRANT, la política no llega a
   evaluarse nunca y el error es «permission denied for table», que no
   menciona ninguna política y manda a buscar el problema donde no está.
   Lo cazó el arnés en la primera corrida. */
grant select on public.traspasos_sap to authenticated;
grant insert, update, delete on public.traspasos_sap to authenticated;

do $$
begin
  drop policy if exists traspasos_sap_select on public.traspasos_sap;
  create policy traspasos_sap_select on public.traspasos_sap
    for select to authenticated using (true);
  /* ESCRIBIR ES DE QUIEN EDITA. La función lo comprueba igual —es
     `security definer`— pero la política cierra la puerta de al lado:
     escribir directo en la tabla saltándose la función. */
  drop policy if exists traspasos_sap_write on public.traspasos_sap;
  create policy traspasos_sap_write on public.traspasos_sap
    for all to authenticated using (public.es_editor()) with check (public.es_editor());
end $$;

-- ---------------------------------------------------------------------
-- IMPORTAR
--
-- Recibe los MOVIMIENTOS tal como salen del Excel y hace el agrupado
-- aquí, en la base, no en el navegador. Es a propósito: la regla de
-- conteo —agrupar y sumar— es la que decide qué falta y qué no, y una
-- regla que vive en la pantalla se queda en esa pantalla. Mañana el
-- tablero la necesita, pasado un informe, y ahí empiezan las tres
-- versiones.
--
-- SE ACTUALIZA, NO SE DUPLICA. Volver a importar el mismo archivo
-- —porque llegó corregido, o porque alguien lo subió dos veces— deja lo
-- mismo, no el doble.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_sap_importar(p_filas jsonb)
/* `movimientos_leidos` Y NO `movimientos`.
   La tabla tiene una columna que se llama `movimientos` —los del
   documento— y esto devuelve otra cosa: cuántas filas traía el archivo.
   Con el mismo nombre, el `returning` de abajo no sabe si te refieres a
   la columna o al parámetro de salida y Postgres revienta con «column
   reference is ambiguous», sin decir dónde. Y aparte son dos cifras
   distintas: una es del documento y la otra del archivo entero. */
returns table (documentos integer, movimientos_leidos integer, anulados integer,
               desde date, hasta date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov int; v_doc int; v_anu int; v_desde date; v_hasta date; v_leidas int;
begin
  if not public.es_editor() then
    raise exception 'Importar el corte de SAP requiere rol de supervisor o administrador';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no trae ningún movimiento. Revisa que sea el corte de SAP y que la hoja tenga la columna Referencia.';
  end if;

  /* CUÁNTAS FILAS DEL ARCHIVO SIRVEN, ANTES DE TOCAR NADA.
     Se mira aquí y no después de insertar: lo que puede estar mal es
     que el archivo no sea el corte de SAP —o que le falten las
     columnas— y eso se sabe leyéndolo, no contando lo que entró. */
  select count(*) into v_leidas
    from jsonb_array_elements(p_filas) f
   where nullif(btrim(coalesce(f->>'referencia', '')), '') is not null
     and nullif(btrim(coalesce(f->>'fecha', '')), '') is not null;

  if v_leidas = 0 then
    raise exception 'Ninguna fila del archivo trae referencia y fecha. Revisa que sean las columnas «Referencia» y «Fecha de entrada».';
  end if;

  /* TODO EN UNA SENTENCIA, CON CTE Y NO CON UNA TABLA TEMPORAL.
     Una temporal aquí funcionaría —es una sola llamada— pero volver a
     llamar la función dentro de la misma transacción reventaría con
     «ya existe», y este proyecto ya perdió una migración por una
     temporal que no sobrevivió a donde yo creía. Con CTE no hay estado
     que sobreviva a nada. */
  with crudo as (
    select
      /* LA MISMA NORMALIZACIÓN QUE `documento_clave` EN LOS VIAJES.
         Tiene que ser la misma o el cruce falla por un guion: SAP
         escribe «7687019429» y quien registró pudo teclear
         «7687-019429». Si las dos reglas se separan, el cruce dice que
         falta un documento que está registrado justo al lado. */
      nullif(upper(regexp_replace(coalesce(f->>'referencia', ''), '[^A-Za-z0-9]', '', 'g')), '') as referencia,
      btrim(coalesce(f->>'referencia', ''))                as referencia_cruda,
      nullif(f->>'fecha', '')::date                        as fecha,
      nullif(f->>'hora', '')::time                         as hora,
      nullif(btrim(coalesce(f->>'material', '')), '')      as material,
      nullif(btrim(coalesce(f->>'descripcion', '')), '')   as descripcion,
      coalesce(nullif(f->>'cantidad', ''), '0')::numeric::integer as cantidad,
      nullif(btrim(coalesce(f->>'centro', '')), '')        as centro,
      nullif(btrim(coalesce(f->>'almacen', '')), '')       as almacen
    from jsonb_array_elements(p_filas) f
  ),
  buenas as (
    select * from crudo where referencia is not null and fecha is not null
  ),
  agrupado as (
    select
      referencia,
      min(referencia_cruda) as referencia_cruda,
      /* LA FECHA Y LA HORA DEL PRIMER MOVIMIENTO, que es cuando el
         documento existió. Con la del último, un documento anulado y
         rehecho se movería de día y dejaría de cuadrar con el turno en
         que de verdad salió. */
      min(fecha) as fecha,
      (array_agg(hora order by fecha, hora nulls last))[1] as hora,
      min(material) as material, min(descripcion) as descripcion,
      sum(cantidad)::integer as neto,
      count(*)::integer as movimientos,
      sum(cantidad) <> 0 as cuenta,
      min(centro) as centro, min(almacen) as almacen
    from buenas
    group by referencia
  ),
  metidas as (
    insert into public.traspasos_sap
      (referencia, referencia_cruda, fecha, hora, material, descripcion,
       neto, movimientos, cuenta, centro, almacen, importado_por, importado_en)
    select referencia, referencia_cruda, fecha, hora, material, descripcion,
           neto, movimientos, cuenta, centro, almacen, auth.uid(), now()
      from agrupado
    on conflict (referencia) do update set
      referencia_cruda = excluded.referencia_cruda,
      fecha = excluded.fecha, hora = excluded.hora,
      material = excluded.material, descripcion = excluded.descripcion,
      neto = excluded.neto, movimientos = excluded.movimientos,
      cuenta = excluded.cuenta,
      centro = excluded.centro, almacen = excluded.almacen,
      importado_por = excluded.importado_por, importado_en = excluded.importado_en
    /* SE RENOMBRAN AL SALIR. `movimientos` es a la vez una columna de
       esta tabla Y una de las que devuelve la función —`returns table
       (… movimientos integer …)`—, y Postgres no sabe a cuál se refiere
       la suma de abajo: «column reference is ambiguous». No da un
       resultado raro, revienta, pero el mensaje no dice dónde. */
    returning fecha as f_fecha, cuenta as f_cuenta, movimientos as f_movs
  )
  select count(*)::int, coalesce(sum(m.f_movs), 0)::int,
         count(*) filter (where not m.f_cuenta)::int,
         min(m.f_fecha), max(m.f_fecha)
    into v_doc, v_mov, v_anu, v_desde, v_hasta
    from metidas m;

  /* NO SE COMPRUEBA AQUÍ SI ENTRARON DOCUMENTOS. Lo tenía así y estaba
     mal: un corte donde TODOS los documentos se anularon —todos con
     neto cero— es un archivo perfectamente válido, y se rechazaba con
     «ninguna fila trae referencia y fecha», que además es mentira. La
     comprobación de arriba, sobre las filas LEÍDAS, es la que
     corresponde: lo que puede estar mal es el archivo, no que la
     bodega haya anulado todo lo de esa noche. */

  return query select v_doc, v_mov, v_anu, v_desde, v_hasta;
end $$;

revoke all on function public.traspaso_sap_importar(jsonb) from public;
grant execute on function public.traspaso_sap_importar(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- EL CRUCE
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_cruce as
with rango as (
  select min(fecha) as desde, max(fecha) as hasta from public.traspasos_sap
),
sap as (
  select * from public.traspasos_sap where cuenta
),
sis as (
  select v.id, v.fecha, v.turno, v.placa, v.documento, v.documento_clave,
         v.registrado_por, v.registrado_en, v.codigo
    from public.traspasos_viajes v, rango r
   where v.estado = 'registrado'
     and v.documento_clave is not null
     and r.desde is not null
     and v.fecha between r.desde and r.hasta
)
select
  coalesce(sap.referencia, sis.documento_clave)          as documento,
  case when sap.referencia is null then 'sobra'
       when sis.documento_clave is null then 'falta'
       else 'cuadra' end                                 as estado,
  sap.fecha        as sap_fecha,
  sap.hora         as sap_hora,
  sap.neto         as sap_neto,
  sap.movimientos  as sap_movimientos,
  sap.descripcion  as sap_descripcion,
  sis.id           as viaje_id,
  sis.codigo       as viaje,
  sis.fecha        as sis_fecha,
  sis.turno        as sis_turno,
  sis.placa        as sis_placa,
  sis.registrado_por,
  /* MISMO DOCUMENTO, DÍA DISTINTO. Cuadra —está en los dos— pero el
     sistema lo puso en otro día que SAP, y eso descuadra el cumplido de
     los dos días a la vez sin que ninguna de las dos listas lo diga. */
  (sap.fecha is not null and sis.fecha is not null and sap.fecha <> sis.fecha) as dia_distinto
from sap
full outer join sis on sis.documento_clave = sap.referencia;

grant select on public.v_traspasos_cruce to authenticated;

comment on view public.v_traspasos_cruce is
  'Los documentos de SAP contra los viajes registrados, en las fechas que cubre el último corte importado. falta = SAP lo tiene y nadie lo registró; sobra = está registrado y SAP no lo tiene (casi siempre un dedazo en el número); cuadra = los dos.';

-- ---------------------------------------------------------------------
-- LAS IMPORTACIONES, UNA POR TANDA
--
-- «Se subió el corte a tal hora, trajo tantos documentos, tantos sin
-- registrar.» Sale de agrupar por el momento en que se importó — no
-- hace falta una tabla de bitácora: `importado_en` ya lo guarda cada
-- fila, y un dato que ya se guarda y nadie mira es un dato que no
-- existe.
--
-- SE AGRUPA AL SEGUNDO. Todas las filas de una misma llamada comparten
-- el `now()` de esa transacción, así que un `date_trunc('second')` las
-- junta exactamente por tanda y no por día: subir el corte dos veces la
-- misma mañana son dos renglones, que es lo que pasó.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_sap_importaciones as
select
  date_trunc('second', s.importado_en)                  as cuando,
  count(*)::int                                         as documentos,
  count(*) filter (where not s.cuenta)::int             as anulados,
  min(s.fecha)                                          as desde,
  max(s.fecha)                                          as hasta,
  max(p.nombre)                                         as quien,
  /* CUÁNTOS DE ESA TANDA SIGUEN SIN REGISTRAR. Es la cifra por la que
     se sube el corte, y se calcula CONTRA LO DE AHORA, no contra lo que
     había al importar: si alguien registró el viaje que faltaba, el
     renglón de la importación tiene que bajar. */
  count(*) filter (
    where s.cuenta and not exists (
      select 1 from public.traspasos_viajes v
       where v.estado = 'registrado' and v.documento_clave = s.referencia))::int
                                                        as sin_registrar
from public.traspasos_sap s
left join public.perfiles p on p.id = s.importado_por
group by date_trunc('second', s.importado_en);

grant select on public.v_traspasos_sap_importaciones to authenticated;

-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.traspasos_sap') is null then
    raise exception 'La tabla del corte de SAP no quedó.';
  end if;
  if to_regclass('public.v_traspasos_cruce') is null then
    raise exception 'La vista del cruce no quedó.';
  end if;
  if to_regprocedure('public.traspaso_sap_importar(jsonb)') is null then
    raise exception 'La función de importar no quedó.';
  end if;
  if to_regclass('public.v_traspasos_sap_importaciones') is null then
    raise exception 'La vista de importaciones no quedó.';
  end if;

  /* LA COLUMNA `cuenta` ES LA REGLA ENTERA. Si la tabla la pierde
     —porque alguien la creó a mano con otra forma—, todo lo anulado en
     SAP empieza a contar como documento que falta, y el cruce se llena
     de renglones que no existen. */
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_sap'
                    and column_name = 'cuenta') then
    raise exception 'A la tabla del corte de SAP le falta la columna «cuenta»: lo anulado contaría como documento que falta.';
  end if;

  raise notice 'Listo. La tabla del corte de SAP y la vista del cruce quedaron puestas.';
  raise notice 'Un documento cuenta si la suma de sus movimientos NO da cero: -36 +36 -28 es UNO; +36 -36 no es ninguno.';
  raise notice 'El cruce dice tres cosas: falta (SAP lo tiene y nadie lo registró), sobra (está registrado y SAP no) y cuadra.';
end $$;
