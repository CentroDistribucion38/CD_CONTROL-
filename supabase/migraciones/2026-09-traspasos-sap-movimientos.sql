-- =====================================================================
-- EL CORTE DE SAP SE GUARDA MOVIMIENTO POR MOVIMIENTO
--
-- QUÉ ESTABA MAL
--
-- La tabla guardaba el documento YA AGRUPADO: una fila por referencia,
-- con el neto y cuántos movimientos lo formaban. El agrupado se hacía
-- DENTRO DE CADA IMPORTACIÓN, y ahí estaba el hueco:
--
--   lunes   se importa el 17 → el documento 7687019429 trae -36
--   martes  se importa el 18 → ese mismo documento trae +36 (lo anularon)
--
-- La segunda importación no SUMA sobre la primera: la reemplaza. El
-- documento queda en +36 en vez de en cero, no da error, no avisa, y se
-- queda en «faltan» para siempre. Alguien va a ir a buscar un viaje que
-- sí se hizo.
--
-- Y no es un caso raro: el turno C cruza la medianoche. Anulan a las
-- 23:50 y rehacen a las 00:10, y eso cae en dos cortes distintos cada
-- vez que alguien importa día por día.
--
-- QUÉ SE HACE
--
-- La tabla pasa a guardar los MOVIMIENTOS, uno por uno, como vienen en
-- el Excel. El agrupado —sumar por referencia y contar el que no dé
-- cero— se mueve a una VISTA, que lo hace sobre TODO lo importado, no
-- sobre un archivo. Los dos movimientos del ejemplo se suman aunque
-- hayan entrado con una semana de diferencia.
--
-- CADA IMPORTACIÓN REEMPLAZA LOS DÍAS QUE TRAE, ENTEROS
--
-- No se acumulan filas encima de las que ya estaban: para cada fecha que
-- aparece en el archivo se borra lo que hubiera de ese día y se mete lo
-- del archivo. Es lo que hace que subir dos veces el mismo corte no
-- duplique nada sin necesitar una llave inventada por movimiento —el
-- Excel no trae ningún identificador de fila, y dos movimientos
-- idénticos del mismo documento SON dos movimientos, no uno repetido.
--
-- LA CONTRAPARTIDA, DICHA: el archivo manda sobre los días que cubre.
-- Si alguien sube un corte FILTRADO —un solo material, un solo
-- almacén—, ese día se queda con lo filtrado. Por eso la función
-- devuelve cuántos movimientos borró y cuántos metió: si borró más de
-- los que metió, la pantalla lo avisa.
--
-- LO QUE YA ESTABA IMPORTADO NO SE PIERDE. Cada documento de la tabla
-- vieja entra como UN movimiento con su neto, así que el cruce da hoy
-- exactamente lo mismo que daba ayer. La próxima vez que se importe ese
-- día, se reemplaza por sus movimientos de verdad y se arregla solo. La
-- tabla vieja no se borra: se le cambia el nombre a `traspasos_sap_viejo`
-- y queda ahí por si hay que mirarla.
--
-- POR QUÉ EL DELIMITADOR DE BLOQUE NO APARECE EN NINGÚN COMENTARIO
--
-- El editor de Supabase no ejecuta el archivo como una sola
-- transacción, y cuenta esos signos para saber dónde acaba cada
-- sentencia. Uno suelto dentro de un comentario parte una función por la
-- mitad y el error no señala el comentario.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-cruce-sap.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · LA TABLA DE MOVIMIENTOS
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_sap_mov (
  /* UNA LLAVE PROPIA Y NO UNA COMPUESTA. El Excel no trae ningún
     identificador de fila, y dos movimientos exactamente iguales del
     mismo documento son DOS movimientos. Una llave compuesta por sus
     columnas los colapsaría en uno y el documento dejaría de dar cero.
     Lo que impide duplicar al reimportar no es una llave: es que cada
     importación reemplaza los días que trae. */
  id               bigint generated always as identity primary key,
  /* La referencia YA NORMALIZADA —la misma regla que `documento_clave`
     en los viajes— y también como venía, porque el día que algo no
     cruce lo primero que se quiere ver es qué decía el Excel. */
  referencia       text not null,
  referencia_cruda text,
  fecha            date not null,
  hora             time,
  material         text,
  descripcion      text,
  /* LA CANTIDAD DE ESTE MOVIMIENTO, con su signo. Negativa es salida,
     positiva es la anulación que la devuelve. */
  cantidad         integer not null,
  centro           text,
  almacen          text,
  importado_por    uuid references public.perfiles(id) on delete set null,
  importado_en     timestamptz not null default now()
);

/* POR FECHA, porque es por donde se borra en cada importación y por
   donde filtra el tablero; y por REFERENCIA, porque es por donde se
   agrupa y por donde cruza contra los viajes. */
create index if not exists traspasos_sap_mov_fecha_idx on public.traspasos_sap_mov (fecha);
create index if not exists traspasos_sap_mov_ref_idx   on public.traspasos_sap_mov (referencia);

alter table public.traspasos_sap_mov enable row level security;

/* EL GRANT Y LA POLÍTICA SON DOS COSAS DISTINTAS y hacen falta las dos:
   el GRANT dice si el rol puede tocar la tabla, la política dice qué
   filas. Sin el GRANT la política no llega a evaluarse y el error es
   «permission denied for table», que no menciona ninguna política y
   manda a buscar el problema donde no está. */
grant select on public.traspasos_sap_mov to authenticated;
grant insert, update, delete on public.traspasos_sap_mov to authenticated;

do $$
begin
  drop policy if exists traspasos_sap_mov_select on public.traspasos_sap_mov;
  create policy traspasos_sap_mov_select on public.traspasos_sap_mov
    for select to authenticated using (true);
  /* ESCRIBIR ES DE QUIEN EDITA. La función lo comprueba igual —es
     `security definer`— pero la política cierra la puerta de al lado:
     escribir directo en la tabla saltándose la función. */
  drop policy if exists traspasos_sap_mov_write on public.traspasos_sap_mov;
  create policy traspasos_sap_mov_write on public.traspasos_sap_mov
    for all to authenticated using (public.es_editor()) with check (public.es_editor());
end $$;

-- ---------------------------------------------------------------------
-- 2 · LO QUE YA ESTABA IMPORTADO SE TRAE
--
-- Cada documento de la tabla vieja entra como UN movimiento con su
-- neto. El cruce da hoy exactamente lo mismo que daba ayer; lo único
-- que cambia es que ese documento dice «1 movimiento» aunque hubiera
-- tenido tres. Se arregla solo la próxima vez que se importe ese día.
--
-- SOLO SI LA NUEVA ESTÁ VACÍA. Si no, correr esto dos veces duplicaría
-- todo lo importado, que es justamente el error que esta migración
-- viene a quitar.
-- ---------------------------------------------------------------------
do $$
declare v_traidos int := 0;
begin
  if to_regclass('public.traspasos_sap') is not null
     and not exists (select 1 from public.traspasos_sap_mov) then

    insert into public.traspasos_sap_mov
      (referencia, referencia_cruda, fecha, hora, material, descripcion,
       cantidad, centro, almacen, importado_por, importado_en)
    select referencia, referencia_cruda, fecha, hora, material, descripcion,
           neto, centro, almacen, importado_por, importado_en
      from public.traspasos_sap;

    get diagnostics v_traidos = row_count;
    raise notice 'Se trajeron % documentos de la tabla vieja, uno por movimiento.', v_traidos;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3 · EL AGRUPADO, AHORA EN UNA VISTA
--
-- Aquí vive la regla entera, y AHORA SE APLICA SOBRE TODO LO IMPORTADO
-- y no sobre un archivo:
--
--     -36  +36  -28   del mismo número  =  UN documento
--     +36  -36        del mismo número  =  NINGUNO
--
-- Da igual si esos movimientos entraron el mismo día o con una semana
-- de diferencia: se suman.
-- ---------------------------------------------------------------------
drop view if exists public.v_traspasos_cruce;
drop view if exists public.v_traspasos_sap_importaciones;
drop view if exists public.v_traspasos_sap;

create view public.v_traspasos_sap as
select
  m.referencia,
  min(m.referencia_cruda)                                     as referencia_cruda,
  /* LA FECHA Y LA HORA DEL PRIMER MOVIMIENTO, que es cuando el
     documento existió. Con la del último, un documento anulado y
     rehecho se movería de día y dejaría de cuadrar con el turno en que
     de verdad salió. */
  min(m.fecha)                                                as fecha,
  (array_agg(m.hora order by m.fecha, m.hora nulls last))[1]  as hora,
  min(m.material)                                             as material,
  min(m.descripcion)                                          as descripcion,
  sum(m.cantidad)::integer                                    as neto,
  count(*)::integer                                           as movimientos,
  /* CUENTA SI LA SUMA NO DA CERO. Es la regla entera, en una línea. */
  sum(m.cantidad) <> 0                                        as cuenta,
  min(m.centro)                                               as centro,
  min(m.almacen)                                              as almacen,
  max(m.importado_en)                                         as importado_en
from public.traspasos_sap_mov m
group by m.referencia;

grant select on public.v_traspasos_sap to authenticated;

comment on view public.v_traspasos_sap is
  'Los documentos de SAP, agrupados desde los movimientos: -36 +36 -28 del mismo número es UN documento; +36 -36 no es ninguno. Se agrupa sobre todo lo importado, no sobre un archivo.';

-- ---------------------------------------------------------------------
-- 4 · EL CRUCE, SOBRE LA VISTA
--
-- Igual que antes; lo único que cambia es de dónde salen los documentos
-- de SAP. Y el rango que lo encierra sale ahora de los MOVIMIENTOS: sin
-- eso, todo viaje registrado antes del primer día importado saldría
-- como «sobra» — cientos de renglones que no son un problema, solo son
-- de otra semana.
-- ---------------------------------------------------------------------
create view public.v_traspasos_cruce as
with rango as (
  select min(fecha) as desde, max(fecha) as hasta from public.traspasos_sap_mov
),
sap as (
  select * from public.v_traspasos_sap where cuenta
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
  'Los documentos de SAP contra los viajes registrados, en las fechas que cubren los movimientos importados. falta = SAP lo tiene y nadie lo registró; sobra = está registrado y SAP no lo tiene (casi siempre un dedazo en el número); cuadra = los dos.';

-- ---------------------------------------------------------------------
-- 5 · LAS IMPORTACIONES ANTERIORES
--
-- «Se subió el corte a tal hora, trajo tantos documentos, tantos siguen
-- sin registrar.» Sale de agrupar por el momento en que se importó: no
-- hace falta una tabla de bitácora, `importado_en` ya lo guarda cada
-- movimiento, y un dato que se guarda y nadie mira es un dato que no
-- existe.
--
-- SE AGRUPA AL SEGUNDO. Todos los movimientos de una misma llamada
-- comparten el `now()` de esa transacción, así que un `date_trunc` al
-- segundo los junta exactamente por tanda y no por día: subir el corte
-- dos veces la misma mañana son dos renglones, que es lo que pasó.
--
-- `sin_registrar` SE CALCULA CONTRA LO DE AHORA y contra el documento
-- COMPLETO —no contra los movimientos de esa tanda—: si el resto del
-- documento llegó en otra importación y lo dejó en cero, este renglón
-- tiene que bajar solo.
-- ---------------------------------------------------------------------
create view public.v_traspasos_sap_importaciones as
select
  date_trunc('second', m.importado_en)                  as cuando,
  count(distinct m.referencia)::int                     as documentos,
  count(*)::int                                         as movimientos,
  count(distinct m.referencia) filter (where not s.cuenta)::int as anulados,
  min(m.fecha)                                          as desde,
  max(m.fecha)                                          as hasta,
  max(p.nombre)                                         as quien,
  count(distinct m.referencia) filter (
    where s.cuenta and not exists (
      select 1 from public.traspasos_viajes v
       where v.estado = 'registrado' and v.documento_clave = m.referencia))::int
                                                        as sin_registrar
from public.traspasos_sap_mov m
join public.v_traspasos_sap s on s.referencia = m.referencia
left join public.perfiles p on p.id = m.importado_por
group by date_trunc('second', m.importado_en);

grant select on public.v_traspasos_sap_importaciones to authenticated;

-- ---------------------------------------------------------------------
-- 6 · IMPORTAR
--
-- Recibe los movimientos tal como salen del Excel y los guarda tal
-- cual. No agrupa: de eso se encarga la vista, sobre todo lo importado.
--
-- CADA DÍA QUE TRAE EL ARCHIVO SE REEMPLAZA ENTERO. Es lo que hace que
-- subir dos veces el mismo corte deje lo mismo y no el doble, y lo que
-- permite importar rangos que se solapan sin pensarlo.
--
-- BORRAR Y METER VAN EN UNA SOLA SENTENCIA, con CTE que modifican. No
-- es un adorno: el editor de Supabase no envuelve el archivo en una
-- transacción, así que un `delete` y un `insert` sueltos dejarían una
-- ventana —corta, pero real— en la que el día está borrado y todavía no
-- reescrito. Y sin tabla temporal a propósito: una temporal no
-- sobrevive a volver a llamar la función en la misma transacción, y
-- este proyecto ya perdió una migración por eso.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_sap_importar(jsonb);

create function public.traspaso_sap_importar(p_filas jsonb)
returns table (documentos integer, movimientos_leidos integer,
               movimientos_guardados integer, reemplazados integer,
               dias integer, anulados integer, desde date, hasta date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leidas int; v_bor int; v_met int; v_dias int;
  v_doc int; v_anu int; v_desde date; v_hasta date;
begin
  if not public.es_editor() then
    raise exception 'Importar el corte de SAP requiere rol de supervisor o administrador';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no trae ningún movimiento. Revisa que sea el corte de SAP y que la hoja tenga la columna Referencia.';
  end if;

  /* CUÁNTAS FILAS DEL ARCHIVO SIRVEN, ANTES DE TOCAR NADA. Se mira aquí
     y no después de meter: lo que puede estar mal es que el archivo no
     sea el corte de SAP, y eso se sabe leyéndolo, no contando lo que
     entró. Si no se mirara antes, un archivo equivocado BORRARÍA los
     días que creyera ver y no metería nada. */
  select count(*) into v_leidas
    from jsonb_array_elements(p_filas) f
   where nullif(btrim(coalesce(f->>'referencia', '')), '') is not null
     and nullif(btrim(coalesce(f->>'fecha', '')), '') is not null;

  if v_leidas = 0 then
    raise exception 'Ninguna fila del archivo trae referencia y fecha. Revisa que sean las columnas «Referencia» y «Fecha de entrada».';
  end if;

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
  fechas as (
    select distinct fecha from buenas
  ),
  borradas as (
    delete from public.traspasos_sap_mov m
     using fechas d
     where m.fecha = d.fecha
    returning 1
  ),
  metidas as (
    insert into public.traspasos_sap_mov
      (referencia, referencia_cruda, fecha, hora, material, descripcion,
       cantidad, centro, almacen, importado_por, importado_en)
    select referencia, referencia_cruda, fecha, hora, material, descripcion,
           cantidad, centro, almacen, auth.uid(), now()
      from buenas
    returning 1
  )
  select (select count(*) from borradas)::int,
         (select count(*) from metidas)::int,
         (select count(*) from fechas)::int,
         (select min(fecha) from buenas),
         (select max(fecha) from buenas)
    into v_bor, v_met, v_dias, v_desde, v_hasta;

  /* Y AHORA LOS DOCUMENTOS, LEÍDOS DE LA VISTA. Son los del archivo,
     pero contados CON TODO lo que ya había: un documento cuyo otro
     movimiento llegó la semana pasada cuenta aquí como anulado, que es
     justamente lo que esta migración viene a arreglar. */
  select count(*)::int, count(*) filter (where not s.cuenta)::int
    into v_doc, v_anu
    from public.v_traspasos_sap s
   where s.referencia in (
     select nullif(upper(regexp_replace(coalesce(f->>'referencia', ''), '[^A-Za-z0-9]', '', 'g')), '')
       from jsonb_array_elements(p_filas) f);

  return query select v_doc, v_leidas, v_met, v_bor, v_dias, v_anu, v_desde, v_hasta;
end $$;

revoke all on function public.traspaso_sap_importar(jsonb) from public;
grant execute on function public.traspaso_sap_importar(jsonb) to authenticated;

comment on function public.traspaso_sap_importar(jsonb) is
  'Guarda los movimientos del corte de SAP tal cual. Cada fecha que trae el archivo se reemplaza entera, así que reimportar un rango solapado no duplica. El agrupado en documentos lo hace v_traspasos_sap, sobre todo lo importado.';

-- ---------------------------------------------------------------------
-- 7 · LA TABLA VIEJA SE JUBILA, NO SE BORRA
--
-- Cambiarle el nombre y no borrarla: si el traspaso de arriba dejó algo
-- fuera, los datos siguen ahí para mirarlos. Y el nombre nuevo dice lo
-- que es, para que nadie vuelva a leerla creyendo que está viva.
--
-- SOLO DESPUÉS DE REHACER LAS VISTAS. Una vista sigue a la tabla cuando
-- se renombra —Postgres la apunta por su identificador, no por su
-- nombre—, así que renombrar antes habría dejado el cruce leyendo en
-- silencio de la tabla jubilada.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.traspasos_sap') is not null then
    if not exists (select 1 from public.traspasos_sap_mov)
       and exists (select 1 from public.traspasos_sap) then
      raise exception 'La tabla vieja tiene documentos y la nueva quedó vacía: no se jubila nada hasta que eso se aclare.';
    end if;
    alter table public.traspasos_sap rename to traspasos_sap_viejo;
    raise notice 'La tabla vieja quedó como traspasos_sap_viejo. No se borró nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := '';
begin
  if to_regclass('public.traspasos_sap_mov') is null then
    v_falta := v_falta || ' · la tabla de movimientos'; end if;
  if to_regclass('public.v_traspasos_sap') is null then
    v_falta := v_falta || ' · la vista que agrupa los documentos'; end if;
  if to_regclass('public.v_traspasos_cruce') is null then
    v_falta := v_falta || ' · la vista del cruce'; end if;
  if to_regclass('public.v_traspasos_sap_importaciones') is null then
    v_falta := v_falta || ' · la vista de importaciones anteriores'; end if;
  if to_regprocedure('public.traspaso_sap_importar(jsonb)') is null then
    v_falta := v_falta || ' · la función de importar'; end if;

  /* QUE EL CRUCE LEA DE LA VISTA Y NO DE LA TABLA JUBILADA. Es el error
     que no daría ningún síntoma: seguiría funcionando, leyendo datos
     que ya nadie actualiza. */
  if exists (
    select 1 from pg_depend d
      join pg_rewrite r on r.oid = d.objid
      join pg_class v on v.oid = r.ev_class
     where v.relname = 'v_traspasos_cruce'
       and d.refobjid = to_regclass('public.traspasos_sap_viejo')) then
    v_falta := v_falta || ' · EL CRUCE SIGUE LEYENDO DE LA TABLA JUBILADA';
  end if;

  if v_falta <> '' then
    raise exception 'No quedó todo. Falta:%', v_falta;
  end if;

  raise notice 'Listo. El corte de SAP se guarda ahora movimiento por movimiento.';
  raise notice 'Un documento se agrupa sobre TODO lo importado: -36 el lunes y +36 el martes ya dan cero.';
  raise notice 'Cada importación reemplaza enteros los días que trae, así que los rangos se pueden solapar.';
end $$;
