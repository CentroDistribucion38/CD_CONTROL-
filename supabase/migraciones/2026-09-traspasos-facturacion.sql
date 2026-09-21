-- =====================================================================
-- TRASPASOS · FACTURACIÓN: EL NÚMERO DE DOCUMENTO Y LA SALIDA DEL VIAJE
--
-- «Que el documento que está en Registrar se llame Orden de cargue, y
--  crear un módulo de Facturación, donde reposarían los viajes para que
--  el de facturación ponga el número de documento y confirme la salida
--  del viaje.»
--
-- ---------------------------------------------------------------------
-- LAS DECISIONES
-- ---------------------------------------------------------------------
-- 1. LA ORDEN DE CARGUE ES LA COLUMNA `documento` DE SIEMPRE. Solo cambia
--    el nombre en pantalla: la columna, su índice único, su regla de diez
--    cifras y las dos funciones que la escriben se quedan como están.
--    Renombrar la columna obligaría a reescribir esas funciones enteras
--    —y ya se han perdido reglas reescribiéndolas— por un cambio que la
--    gente no ve.
--
-- 2. EL NÚMERO DE FACTURACIÓN ES UNA COLUMNA NUEVA, con las mismas reglas
--    que la orden: solo cifras, diez como máximo, y el mismo número no
--    va en dos viajes registrados.
--
-- 3. EL CRUCE CON SAP PASA AL NÚMERO DE FACTURACIÓN. Es el que SAP trae.
--    La orden de cargue queda como la referencia del patio.
--
-- 4. LO QUE YA ESTABA REGISTRADO: hasta hoy, lo que el patio escribía en
--    «Documento» ERA el número de SAP. Para que el cruce de esos días no
--    se quede vacío, ese número se copia al de facturación y el viaje se
--    marca como salido, pero marcado HISTÓRICO: no lo confirmó nadie de
--    facturación, y la pantalla lo dice. Por eso este archivo se corre
--    ANTES de publicar la app nueva: un viaje registrado con la app
--    nueva ya trae la orden de cargue, y copiarla como número de SAP
--    sería inventar un dato.
--
-- 5. UN VIAJE QUE YA SALIÓ NO SE CORRIGE NI SE ANULA EN EL PATIO: sería
--    cambiarle la placa o la ruta a algo que facturación ya dio por
--    salido. Si hay que corregirlo, quien administra reabre la salida
--    —con motivo—, se corrige, y facturación lo vuelve a confirmar.
--    Va por un disparador y no dentro de las funciones del patio, para
--    no reescribirlas.
--
-- 6. SOLO FACTURACIÓN CONFIRMA. Rol nuevo «Facturación», con su pantalla
--    /facturacion. Quien administra también entra. El patio no.
--
-- 7. CADA CONFIRMACIÓN Y CADA REAPERTURA QUEDA EN EL RASTRO de ediciones
--    del viaje, con quién, cuándo, el antes y el después.
--
-- Va DESPUÉS de las migraciones de traspasos (documento, documento-diez,
-- sap-movimientos). SE PUEDE CORRER VARIAS VECES.
-- El delimitador de bloque de dos signos no se escribe en ningún
-- comentario: el editor de Supabase lo cuenta para trocear.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES
--
-- Sin esto, el archivo revienta a la mitad con un «no existe» de
-- Postgres que no dice qué falta correr.
-- ---------------------------------------------------------------------
do $bloque$
declare v_falta text := '';
begin
  if to_regclass('public.traspasos_viajes') is null then
    v_falta := v_falta || ' supabase/modulos/traspasos.sql'; end if;
  if to_regclass('public.traspasos_viajes_ediciones') is null then
    v_falta := v_falta || ' 2026-09-traspasos-editar-viaje.sql'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'documento_clave') then
    v_falta := v_falta || ' 2026-09-traspasos-documento.sql'; end if;
  if to_regprocedure('public.traspaso_candado_dia()') is null then
    v_falta := v_falta || ' 2026-09-traspasos-dia-cerrado.sql'; end if;
  if to_regclass('public.traspasos_sap_mov') is null then
    v_falta := v_falta || ' 2026-09-traspasos-sap-movimientos.sql'; end if;
  if v_falta <> '' then
    raise exception 'Antes de este archivo falta correr:%', v_falta;
  end if;
end $bloque$;


-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS
-- ---------------------------------------------------------------------
alter table public.traspasos_viajes
  add column if not exists factura_documento text,
  add column if not exists salida_en         timestamptz,
  add column if not exists salida_por        uuid references public.perfiles(id) on delete set null,
  /* Salió antes de que existiera facturación: el número se copió de lo
     que el patio escribía. Nadie de facturación lo confirmó. */
  add column if not exists salida_historica  boolean not null default false;

do $bloque$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'factura_clave') then
    alter table public.traspasos_viajes
      add column factura_clave text
        generated always as (
          nullif(upper(regexp_replace(coalesce(factura_documento, ''), '[^A-Za-z0-9]', '', 'g')), '')
        ) stored;
  end if;
end $bloque$;

alter table public.traspasos_viajes drop constraint if exists traspasos_viajes_factura_diez;
alter table public.traspasos_viajes add constraint traspasos_viajes_factura_diez
  check (factura_clave is null or factura_clave ~ '^[0-9]{1,10}$');

/* SALIÓ ⇔ TIENE NÚMERO. Un viaje «salido» sin número no se puede cruzar
   con SAP, y uno con número y sin salida es un número que nadie
   confirmó. */
alter table public.traspasos_viajes drop constraint if exists traspasos_viajes_salida_completa;
alter table public.traspasos_viajes add constraint traspasos_viajes_salida_completa
  check ((salida_en is null) = (factura_clave is null));

create unique index if not exists traspasos_viajes_factura_unico
  on public.traspasos_viajes (factura_clave)
  where estado = 'registrado' and factura_clave is not null;

/* Lo que facturación tiene pendiente: se consulta cada vez que abre. */
create index if not exists traspasos_viajes_por_facturar
  on public.traspasos_viajes (fecha, hora)
  where estado = 'registrado' and not vacio and salida_en is null;


-- ---------------------------------------------------------------------
-- 1b. EL CANDADO DEL DÍA DEJA PASAR LA SALIDA
--
-- El día se cierra a las 06:00 del siguiente y después solo el
-- administrador toca sus viajes. Pero facturación confirma la salida
-- cuando le llega el papel, muchas veces al otro día: con el candado
-- como estaba, confirmar un viaje de ayer reventaría. Se deja pasar el
-- cambio que SOLO toca las columnas de la salida; cualquier otra cosa en
-- un día cerrado sigue cerrada. Lo demás de la función es el mismo.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_candado_dia()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_fecha date;
  v_cuando text;
  /* Las columnas de la salida, y las dos GENERADAS: en un disparador
     BEFORE las generadas todavía no están calculadas en NEW, así que
     compararlas daría «cambió» en cualquier update. Lo que las genera
     —`documento`, `factura_documento`— sí se compara. */
  v_salida text[] := array['factura_documento', 'factura_clave', 'salida_en', 'salida_por', 'salida_historica',
                           'documento_clave'];
begin
  if public.manda() then return coalesce(new, old); end if;

  /* SOLO LA SALIDA: pasa, esté el día abierto o cerrado. */
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - v_salida) is not distinct from (to_jsonb(old) - v_salida) then
    return new;
  end if;

  v_fecha := least(coalesce(new.fecha, old.fecha), coalesce(old.fecha, new.fecha));

  if public.traspaso_dia_abierto(v_fecha) then
    return new;
  end if;

  v_cuando := to_char(v_fecha, 'DD/MM/YYYY');
  if tg_op = 'INSERT' then
    raise exception 'El día % ya está cerrado: no se pueden registrar viajes de días anteriores. Si de verdad falta ese viaje, lo registra un administrador.', v_cuando;
  else
    raise exception 'El viaje del % ya no se puede tocar: ese día está cerrado. Dentro del día se anula y se vuelve a registrar; después, lo corrige un administrador.', v_cuando;
  end if;
end $fn$;


-- ---------------------------------------------------------------------
-- 2. LO QUE YA ESTABA: el número de SAP que el patio escribía
-- ---------------------------------------------------------------------
update public.traspasos_viajes
   set factura_documento = documento,
       salida_en         = registrado_en,
       salida_historica  = true
 where documento_clave is not null
   and factura_documento is null
   and salida_en is null
   and not vacio;


-- ---------------------------------------------------------------------
-- 3. EL ROL Y LA PANTALLA
-- ---------------------------------------------------------------------
insert into public.roles (clave, nombre, descripcion, manda, sistema, orden)
values ('facturacion', 'Facturación',
        'Pone el número de documento de cada viaje y confirma que salió.', false, false, 4)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, seccion, nivel)
values ('facturacion', '/facturacion', 'editar')
on conflict (rol, seccion) do nothing;


-- ---------------------------------------------------------------------
-- 4. CONFIRMAR LA SALIDA
-- ---------------------------------------------------------------------
create or replace function public.traspaso_confirmar_salida(p_id uuid, p_documento text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.traspasos_viajes%rowtype;
  v_clave text := nullif(upper(regexp_replace(coalesce(p_documento, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_otro record;
begin
  if not public.puede_editar('/facturacion') then
    raise exception 'Solo facturación confirma la salida de un viaje.' using errcode = '42501';
  end if;
  if v_clave is null then
    raise exception 'Falta el número de documento.';
  end if;
  if v_clave !~ '^[0-9]{1,10}$' then
    raise exception 'El número de documento va en cifras y con diez como máximo.';
  end if;

  select * into v from public.traspasos_viajes where id = p_id for update;
  if not found then raise exception 'Ese viaje no existe.'; end if;
  if v.estado <> 'registrado' then raise exception 'Ese viaje está anulado: no sale.'; end if;
  if v.vacio then raise exception 'Un viaje vacío no lleva documento de facturación.'; end if;
  if v.salida_en is not null then
    raise exception 'Ese viaje ya salió con el documento %.', v.factura_documento;
  end if;

  /* EL REPETIDO SE DICE CON EL VIAJE QUE YA LO TIENE: «ya está en otro
     viaje» a secas manda a buscarlo a mano. */
  select codigo, placa, fecha into v_otro from public.traspasos_viajes
   where factura_clave = v_clave and estado = 'registrado' limit 1;
  if found then
    raise exception 'El documento % ya está en el viaje % (placa %, %).',
      v_clave, coalesce(v_otro.codigo, '—'), coalesce(v_otro.placa, '—'), to_char(v_otro.fecha, 'DD/MM/YYYY');
  end if;

  update public.traspasos_viajes
     set factura_documento = btrim(p_documento),
         salida_en = now(), salida_por = auth.uid(), salida_historica = false
   where id = p_id;

  insert into public.traspasos_viajes_ediciones (viaje, editado_por, motivo, antes, despues)
  select p_id, auth.uid(), 'Facturación confirmó la salida', to_jsonb(v), to_jsonb(n)
    from public.traspasos_viajes n where n.id = p_id;
end $fn$;


-- ---------------------------------------------------------------------
-- 5. REABRIR UNA SALIDA — quien administra, con motivo
-- ---------------------------------------------------------------------
create or replace function public.traspaso_reabrir_salida(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v public.traspasos_viajes%rowtype;
begin
  if not public.manda() then
    raise exception 'Solo el administrador reabre la salida de un viaje.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se reabre (al menos 5 letras).';
  end if;
  select * into v from public.traspasos_viajes where id = p_id for update;
  if not found then raise exception 'Ese viaje no existe.'; end if;
  if v.salida_en is null then raise exception 'Ese viaje no ha salido: no hay nada que reabrir.'; end if;

  update public.traspasos_viajes
     set factura_documento = null, salida_en = null, salida_por = null, salida_historica = false
   where id = p_id;

  insert into public.traspasos_viajes_ediciones (viaje, editado_por, motivo, antes, despues)
  select p_id, auth.uid(), 'Se reabrió la salida: ' || btrim(p_motivo), to_jsonb(v), to_jsonb(n)
    from public.traspasos_viajes n where n.id = p_id;
end $fn$;

revoke all on function public.traspaso_confirmar_salida(uuid, text) from public, anon;
revoke all on function public.traspaso_reabrir_salida(uuid, text)   from public, anon;
grant execute on function public.traspaso_confirmar_salida(uuid, text) to authenticated;
grant execute on function public.traspaso_reabrir_salida(uuid, text)   to authenticated;


-- ---------------------------------------------------------------------
-- 6. LO QUE YA SALIÓ NO SE TOCA EN EL PATIO
--
-- Se compara la fila entera menos las columnas de la salida: si cambió
-- cualquier otra cosa —placa, ruta, orden, estado— en un viaje que ya
-- salió, se rechaza. Reabrir cambia solo las de la salida, y confirmar
-- parte de un viaje sin salida: ninguno de los dos choca.
-- ---------------------------------------------------------------------
create or replace function public.traspasos_viaje_salido_intocable()
returns trigger
language plpgsql
as $fn$
declare
  /* Las columnas de la salida, y las dos GENERADAS: en un disparador
     BEFORE las generadas todavía no están calculadas en NEW, así que
     compararlas daría «cambió» en cualquier update. Lo que las genera
     —`documento`, `factura_documento`— sí se compara. */
  v_salida text[] := array['factura_documento', 'factura_clave', 'salida_en', 'salida_por', 'salida_historica',
                           'documento_clave'];
begin
  if old.salida_en is not null
     and (to_jsonb(new) - v_salida) is distinct from (to_jsonb(old) - v_salida) then
    raise exception 'Este viaje ya salió: facturación confirmó la salida con el documento %. Para corregirlo, el administrador reabre la salida en Facturación.',
      old.factura_documento;
  end if;
  return new;
end $fn$;

drop trigger if exists traspasos_viaje_salido_intocable on public.traspasos_viajes;
create trigger traspasos_viaje_salido_intocable
  before update on public.traspasos_viajes
  for each row execute function public.traspasos_viaje_salido_intocable();


-- ---------------------------------------------------------------------
-- 7. LA VISTA DE VIAJES, CON LA SALIDA
--    (las columnas nuevas van al final: así `create or replace` sirve)
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_viajes as
select
  v.id, v.codigo, v.fecha, v.turno,
  public.traspaso_orden_turno(v.turno)          as turno_orden,
  v.tipo, t.nombre                              as tipo_nombre,
  v.placa,
  v.documento,
  (not v.vacio and v.estado = 'registrado' and v.documento is null) as sin_documento,
  v.origen,  coalesce(po.nombre, v.origen_texto)  as origen_nombre,
  v.destino, coalesce(pd.nombre, v.destino_texto) as destino_nombre,
  (v.origen  is null and v.origen_texto  is not null) as origen_suelto,
  (v.destino is null and v.destino_texto is not null) as destino_suelto,
  v.viajes, v.vacio, v.carga, v.unidad, v.nota,
  v.hora, v.registrado_por, v.registrado_en,
  greatest(((v.registrado_en at time zone 'America/Bogota')::date - v.fecha), 0)::int
                                                as dias_atras,
  ((v.registrado_en at time zone 'America/Bogota')::date > v.fecha)
                                                as atrasado,
  v.estado::text as estado,
  (v.estado = 'registrado') as vale,
  v.motivo_anulacion, v.anulado_en, v.anulado_por,
  v.ediciones, v.editado_en, v.editado_por,
  /* LA SALIDA. `por_facturar` no se guarda: es «con carga, registrado y
     sin salida». Guardado se podría contradecir. */
  v.factura_documento,
  v.salida_en, v.salida_por, ps.nombre          as salida_nombre,
  v.salida_historica,
  (not v.vacio and v.estado = 'registrado' and v.salida_en is null) as por_facturar
from public.traspasos_viajes v
left join public.traspasos_tipos t on t.clave = v.tipo
left join public.traspasos_puntos po on po.clave = v.origen
left join public.traspasos_puntos pd on pd.clave = v.destino
left join public.perfiles ps on ps.id = v.salida_por;

grant select on public.v_traspasos_viajes to authenticated;


-- ---------------------------------------------------------------------
-- 8. EL CRUCE CON SAP, CONTRA EL NÚMERO DE FACTURACIÓN
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_cruce as
with rango as (
  select min(fecha) as desde, max(fecha) as hasta from public.traspasos_sap_mov
),
sap as (
  select * from public.v_traspasos_sap where cuenta
),
sis as (
  select v.id, v.fecha, v.turno, v.placa, v.documento, v.factura_clave,
         v.registrado_por, v.registrado_en, v.codigo
    from public.traspasos_viajes v, rango r
   where v.estado = 'registrado'
     and v.factura_clave is not null
     and r.desde is not null
     and v.fecha between r.desde and r.hasta
)
select
  coalesce(sap.referencia, sis.factura_clave)            as documento,
  case when sap.referencia is null then 'sobra'
       when sis.factura_clave is null then 'falta'
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
  (sap.fecha is not null and sis.fecha is not null and sap.fecha <> sis.fecha) as dia_distinto
from sap
full outer join sis on sis.factura_clave = sap.referencia;

grant select on public.v_traspasos_cruce to authenticated;

create or replace view public.v_traspasos_sap_importaciones as
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
       where v.estado = 'registrado' and v.factura_clave = m.referencia))::int
                                                        as sin_registrar
from public.traspasos_sap_mov m
join public.v_traspasos_sap s on s.referencia = m.referencia
left join public.perfiles p on p.id = m.importado_por
group by date_trunc('second', m.importado_en);

grant select on public.v_traspasos_sap_importaciones to authenticated;


-- ---------------------------------------------------------------------
-- 9. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $bloque$
declare v_falta text := ''; v_n int;
begin
  if to_regprocedure('public.traspaso_confirmar_salida(uuid, text)') is null then
    v_falta := v_falta || ' · la función para confirmar la salida'; end if;
  if to_regprocedure('public.traspaso_reabrir_salida(uuid, text)') is null then
    v_falta := v_falta || ' · la función para reabrir'; end if;
  if not exists (select 1 from public.rol_permisos where rol = 'facturacion' and seccion = '/facturacion') then
    v_falta := v_falta || ' · el rol Facturación con su pantalla'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'traspasos_viaje_salido_intocable') then
    v_falta := v_falta || ' · el candado de los viajes que ya salieron'; end if;
  if v_falta <> '' then raise exception 'NO QUEDÓ TODO. Falta:%', v_falta; end if;

  select count(*) into v_n from public.traspasos_viajes where salida_historica;
  raise notice 'Viajes de antes, con su número de SAP pasado a facturación: %', v_n;
  raise notice 'LISTO: la orden de cargue queda en el patio, facturación pone el documento y confirma la salida, y el cruce con SAP va contra ese documento.';
end $bloque$;
