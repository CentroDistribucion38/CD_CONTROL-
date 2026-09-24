-- =====================================================================
-- ACCIONES SE PARTE EN DOS: OL Y ABI
--
-- «Dentro de acciones, dos módulos como En sitio y Salida: OL y ABI.
--  Con el OL ya está, ya lo hicimos. Con ABI es cargar evidencias,
--  hallazgos, colocar la información, guardar, y luego nosotros darle
--  como que reescribir en palabras técnicas y que se genere el informe
--  de los hallazgos.»
--
-- ---------------------------------------------------------------------
-- LAS DOS RAMAS MIDEN COSAS DISTINTAS, Y POR ESO SE SEPARAN
-- ---------------------------------------------------------------------
--   OL    una ACCIÓN: algo que hay que corregir, con responsable, plazo
--         y verificación de si de verdad sirvió. Ya existe entera.
--   ABI   un HALLAZGO: lo que se encontró en una auditoría. No tiene
--         responsable ni plazo — tiene EVIDENCIA y una redacción que va
--         a un informe que sale del CD.
--
-- Un hallazgo no es una acción a medias: es el paso de antes. De un
-- hallazgo PUEDE nacer una acción, y por eso se amarran (punto 5);
-- pero hay hallazgos que solo se documentan, y meterlos en la tabla de
-- acciones los volvería acciones sin dueño que el tablero señalaría
-- para siempre.
--
-- ---------------------------------------------------------------------
-- SE GUARDAN **DOS** TEXTOS, Y ESA ES LA DECISIÓN IMPORTANTE
-- ---------------------------------------------------------------------
--   `lo_que_se_vio`  como se dictó en la bodega, con guante y de pie.
--   `redaccion`      la versión técnica, la que sale en el informe.
--
-- Guardar solo la técnica sería lo cómodo y es lo que no se puede
-- hacer: el día que alguien discuta el informe, la única forma de
-- comprobar que la redacción dice lo mismo que se vio es tener las dos.
-- Y si la reescribe una máquina, con más razón.
--
-- `ia_borrador` VA APARTE DE `redaccion` por lo mismo: una es lo que
-- PROPUSO la máquina y la otra es lo que APROBÓ una persona. Si fueran
-- la misma columna, no habría forma de contestar «¿esto lo revisó
-- alguien?» — y esa es la pregunta que se hace cuando un informe se
-- cae.
--
-- SE PUEDE CORRER VARIAS VECES SIN ROMPER NADA.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. LOS TIPOS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'hallazgo_estado') then
    create type hallazgo_estado as enum ('borrador', 'firme', 'cerrado', 'anulado');
  end if;
  if not exists (select 1 from pg_type where typname = 'hallazgo_severidad') then
    /* TRES Y NO CINCO. Una escala de cinco obliga a discutir si algo es
       3 o 4 en vez de qué se hace con ello, y en la práctica todo cae
       en los extremos. */
    create type hallazgo_severidad as enum ('observacion', 'hallazgo', 'critico');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. EL MAESTRO DE TEMAS
--
-- De qué trata el hallazgo: inocuidad, seguridad, 5S, infraestructura…
-- ES UNA TABLA Y NO UN ENUM, por lo mismo que las causales de averías:
-- el día que ABI llegue con un tema nuevo se agrega desde la pantalla y
-- no esperando un despliegue. Un enum obliga a una migración para
-- agregar una palabra.
-- ---------------------------------------------------------------------
create table if not exists public.acciones_hallazgos_temas (
  clave     text primary key,
  nombre    text not null,
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now()
);

insert into public.acciones_hallazgos_temas (clave, nombre, orden) values
  ('inocuidad',       'Inocuidad',                 1),
  ('seguridad',       'Seguridad industrial',      2),
  ('cinco_s',         '5S y orden',                3),
  ('infraestructura', 'Infraestructura',           4),
  ('proceso',         'Proceso y método',          5),
  ('documental',      'Documental',                6),
  ('otro',            'Otro',                     90)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 3. EL HALLAZGO
-- ---------------------------------------------------------------------
create table if not exists public.acciones_hallazgos (
  id      uuid primary key default gen_random_uuid(),
  codigo  text unique not null,

  /* LA FECHA DE LA AUDITORÍA, no la de la fila. Se audita el martes y
     se pasa a la plataforma el jueves: el informe es del martes. */
  fecha   date not null default (now() at time zone 'America/Bogota')::date,

  tema      text not null references public.acciones_hallazgos_temas(clave),
  severidad hallazgo_severidad not null default 'hallazgo',

  /* DÓNDE. Se reusan los maestros de Acciones —área y zona— en vez de
     inventar unos propios: el día que se abra una calle nueva se
     agrega una vez y las dos ramas la ven. Dos maestros para el mismo
     sitio es como una calle termina llamándose de dos formas. */
  area      text references public.acciones_areas(clave),
  zona      text references public.acciones_zonas(codigo),
  ubicacion text,

  /* LOS DOS TEXTOS. Ver la nota larga de arriba: si se pierde el
     primero, nadie puede comprobar que el segundo dice lo mismo. */
  lo_que_se_vio text not null,
  redaccion     text,
  redactado_por uuid references public.perfiles(id) on delete set null,
  redactado_en  timestamptz,

  /* LO QUE PROPUSO LA MÁQUINA, sin aprobar. Aparte de `redaccion` para
     poder contestar «¿esto lo revisó alguien?». */
  ia_borrador text,
  ia_en       timestamptz,

  /* LO QUE SE RECOMIENDA. Va aparte del hallazgo: el hallazgo es lo que
     SE VIO y la recomendación es lo que ALGUIEN OPINA que se haga.
     Mezclarlos es como un informe termina diciendo que se vio una cosa
     que en realidad se supuso. */
  recomendacion text,

  estado hallazgo_estado not null default 'borrador',

  /* LA ACCIÓN QUE NACIÓ DE ÉL, cuando nació alguna. `set null` y no
     cascada: si alguien borra la acción, el hallazgo no desaparece con
     ella — el hallazgo pasó, la acción era lo que se iba a hacer. */
  accion_id uuid references public.acciones(id) on delete set null,

  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en  timestamptz not null default now(),

  anulado_en   timestamptz,
  anulado_por  uuid references public.perfiles(id) on delete set null,
  motivo_anulacion text,

  /* UN HALLAZGO FIRME LLEVA REDACCIÓN. «Firme» quiere decir que puede
     salir en el informe, y lo que sale en el informe es la redacción:
     dejar firmar sin ella es publicar un renglón en blanco. */
  constraint hallazgo_firme_con_redaccion
    check (estado in ('borrador', 'anulado') or btrim(coalesce(redaccion, '')) <> ''),
  constraint hallazgo_anulado_con_motivo
    check (estado <> 'anulado' or btrim(coalesce(motivo_anulacion, '')) <> ''),
  /* Y TIENE SITIO. Un hallazgo sin lugar no se puede ir a mirar; es la
     misma regla que ya tienen las acciones. */
  constraint hallazgo_tiene_lugar
    check (zona is not null or btrim(coalesce(ubicacion, '')) <> '')
);

create index if not exists acciones_hallazgos_fecha_idx
  on public.acciones_hallazgos (fecha desc);
create index if not exists acciones_hallazgos_estado_idx
  on public.acciones_hallazgos (estado);

-- LAS EVIDENCIAS. Misma forma que `acciones_fotos`, y con la hora y el
-- lugar DE LA FOTO y no de la fila: una foto tomada a las 9 y subida a
-- las 11 —porque en ese pasillo no hay señal— tiene que seguir
-- diciendo las 9.
create table if not exists public.acciones_hallazgos_fotos (
  id          uuid primary key default gen_random_uuid(),
  hallazgo_id uuid not null references public.acciones_hallazgos(id) on delete cascade,
  ruta        text not null,
  nota        text,
  bytes       integer,
  tomada_en   timestamptz,
  lat         numeric(10,7),
  lng         numeric(10,7),
  precision_m numeric(8,2),
  subida_por  uuid references public.perfiles(id) on delete set null,
  subida_en   timestamptz not null default now()
);
create index if not exists acciones_hallazgos_fotos_idx
  on public.acciones_hallazgos_fotos (hallazgo_id);

-- ---------------------------------------------------------------------
-- 4. QUIÉN PUEDE
--
-- POR LA PANTALLA Y NO POR EL NOMBRE DEL ROL. El día que se cree un rol
-- nuevo de auditoría, comparar contra 'abi' deja de proteger lo que
-- cree proteger —y en la dirección peligrosa—.
-- ---------------------------------------------------------------------
create or replace function public.hallazgo_puede_editar()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.manda()
      or public.mi_nivel_pantalla('/acciones/abi') = 'editar'
$$;
grant execute on function public.hallazgo_puede_editar() to authenticated;

alter table public.acciones_hallazgos        enable row level security;
alter table public.acciones_hallazgos_fotos  enable row level security;
alter table public.acciones_hallazgos_temas  enable row level security;

drop policy if exists hallazgos_ver on public.acciones_hallazgos;
create policy hallazgos_ver on public.acciones_hallazgos
  for select to authenticated
  using (public.mi_nivel_pantalla('/acciones/abi') <> 'ninguno' or public.manda());

drop policy if exists hallazgos_fotos_ver on public.acciones_hallazgos_fotos;
create policy hallazgos_fotos_ver on public.acciones_hallazgos_fotos
  for select to authenticated
  using (public.mi_nivel_pantalla('/acciones/abi') <> 'ninguno' or public.manda());
drop policy if exists hallazgos_fotos_subir on public.acciones_hallazgos_fotos;
create policy hallazgos_fotos_subir on public.acciones_hallazgos_fotos
  for insert to authenticated with check (public.hallazgo_puede_editar());

drop policy if exists hallazgos_temas_ver on public.acciones_hallazgos_temas;
create policy hallazgos_temas_ver on public.acciones_hallazgos_temas
  for select to authenticated using (true);
drop policy if exists hallazgos_temas_editar on public.acciones_hallazgos_temas;
create policy hallazgos_temas_editar on public.acciones_hallazgos_temas
  for all to authenticated
  using (public.hallazgo_puede_editar()) with check (public.hallazgo_puede_editar());

-- EL GRANT Y LA POLÍTICA SON DOS COSAS Y HACEN FALTA LAS DOS: sin el
-- grant, Postgres contesta «permission denied for table» —un error de
-- permiso de tabla— y eso NO es lo mismo que la política negando, que
-- devuelve cero filas.
grant select on public.acciones_hallazgos to authenticated;
grant select, insert on public.acciones_hallazgos_fotos to authenticated;
grant select, insert, update, delete on public.acciones_hallazgos_temas to authenticated;

-- ---------------------------------------------------------------------
-- 5. REGISTRAR
--
-- EL CÓDIGO LO PONE LA BASE. Un consecutivo que arme el navegador es un
-- consecutivo repetido el día que dos personas registren a la vez.
-- ---------------------------------------------------------------------
create or replace function public.hallazgo_registrar(
  p_tema        text,
  p_lo_que_se_vio text,
  p_severidad   text default 'hallazgo',
  p_area        text default null,
  p_zona        text default null,
  p_ubicacion   text default null,
  p_recomendacion text default null,
  p_fecha       date default null
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cod text;
  v_n integer;
begin
  if not public.hallazgo_puede_editar() then
    raise exception 'Levantar un hallazgo es de quien tiene Editar en ABI';
  end if;
  if btrim(coalesce(p_lo_que_se_vio, '')) = '' then
    raise exception 'Hay que decir qué se vio: un hallazgo sin eso es un renglón en blanco en el informe';
  end if;
  if p_zona is null and btrim(coalesce(p_ubicacion, '')) = '' then
    raise exception 'Falta dónde fue: un hallazgo sin sitio no se puede ir a mirar';
  end if;

  /* EL CONSECUTIVO ES POR AÑO. «HZ-2026-0007» dice de un vistazo de
     qué auditoría viene; un consecutivo corrido llega a cuatro mil y
     deja de decir nada. */
  select count(*) + 1 into v_n from public.acciones_hallazgos
   where extract(year from fecha) = extract(year from coalesce(p_fecha, current_date));
  v_cod := 'HZ-' || extract(year from coalesce(p_fecha, current_date))::text
           || '-' || lpad(v_n::text, 4, '0');

  insert into public.acciones_hallazgos
         (codigo, fecha, tema, severidad, area, zona, ubicacion,
          lo_que_se_vio, recomendacion, creado_por)
  values (v_cod, coalesce(p_fecha, (now() at time zone 'America/Bogota')::date),
          p_tema, p_severidad::hallazgo_severidad, p_area, p_zona,
          nullif(btrim(coalesce(p_ubicacion, '')), ''),
          btrim(p_lo_que_se_vio), nullif(btrim(coalesce(p_recomendacion, '')), ''),
          auth.uid())
  returning acciones_hallazgos.id into v_id;

  return query select v_id, v_cod;
end $$;
grant execute on function public.hallazgo_registrar(text, text, text, text, text, text, text, date) to authenticated;

-- ---------------------------------------------------------------------
-- 6. LA REDACCIÓN TÉCNICA
--
-- DOS FUNCIONES Y NO UNA, a propósito:
--   `hallazgo_ia_guardar`   deja lo que PROPUSO la máquina.
--   `hallazgo_redactar`     guarda lo que APROBÓ una persona.
--
-- Con una sola columna no habría forma de contestar «¿esto lo revisó
-- alguien?», que es la pregunta que se hace cuando un informe se cae.
-- ---------------------------------------------------------------------
create or replace function public.hallazgo_ia_guardar(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hallazgo_puede_editar() then
    raise exception 'Redactar un hallazgo es de quien tiene Editar en ABI';
  end if;
  update public.acciones_hallazgos
     set ia_borrador = btrim(p_texto), ia_en = now()
   where id = p_id and estado <> 'anulado';
  if not found then raise exception 'Ese hallazgo no existe o está anulado'; end if;
end $$;
grant execute on function public.hallazgo_ia_guardar(uuid, text) to authenticated;

create or replace function public.hallazgo_redactar(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.acciones_hallazgos%rowtype;
begin
  if not public.hallazgo_puede_editar() then
    raise exception 'Redactar un hallazgo es de quien tiene Editar en ABI';
  end if;
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'La redacción no puede quedar vacía: es lo que sale en el informe';
  end if;

  select * into v from public.acciones_hallazgos where id = p_id;
  if not found then raise exception 'Ese hallazgo no existe'; end if;
  if v.estado = 'anulado' then raise exception 'Ese hallazgo está anulado'; end if;
  /* UN HALLAZGO CERRADO NO SE REESCRIBE. Cerrado quiere decir que ya
     salió en un informe que alguien leyó; cambiarle el texto después
     es cambiar un documento que ya está afuera. */
  if v.estado = 'cerrado' then
    raise exception 'Ese hallazgo ya se cerró: su texto ya salió en un informe. Levanta uno nuevo';
  end if;

  update public.acciones_hallazgos
     set redaccion = btrim(p_texto),
         redactado_por = auth.uid(), redactado_en = now(),
         /* APROBAR LA REDACCIÓN ES LO QUE LO VUELVE FIRME. No hace
            falta un botón más: lo que hace falta para que salga en el
            informe es exactamente esto. */
         estado = case when estado = 'borrador' then 'firme'::hallazgo_estado else estado end
   where id = p_id;
end $$;
grant execute on function public.hallazgo_redactar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. DE UN HALLAZGO NACE UNA ACCIÓN
--
-- Es la mitad de por qué las dos ramas viven en el mismo módulo. Se
-- llama a `accion_reportar`, que es la que ya sabe calcular el plazo
-- por prioridad y el responsable por defecto: copiar aquí esa lógica
-- sería tener dos sitios que calculan el vencimiento y un día dan
-- distinto.
-- ---------------------------------------------------------------------
create or replace function public.hallazgo_abrir_accion(
  p_id        uuid,
  p_prioridad text,
  p_motivo    text,
  p_titulo    text default null
)
returns table (accion_id uuid, accion_codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.acciones_hallazgos%rowtype;
  r record;
begin
  if not public.hallazgo_puede_editar() then
    raise exception 'Abrir una acción desde un hallazgo es de quien tiene Editar en ABI';
  end if;
  select * into v from public.acciones_hallazgos where id = p_id;
  if not found then raise exception 'Ese hallazgo no existe'; end if;
  if v.estado = 'anulado' then raise exception 'Ese hallazgo está anulado'; end if;
  if v.accion_id is not null then
    raise exception 'Ese hallazgo ya tiene una acción abierta';
  end if;

  /* LA ACCIÓN SE LLEVA LA REDACCIÓN TÉCNICA SI YA HAY, Y SI NO, LO QUE
     SE VIO. Quien la recibe tiene que poder entenderla sin abrir el
     hallazgo. */
  select * into r from public.accion_reportar(
    p_titulo      => coalesce(nullif(btrim(coalesce(p_titulo, '')), ''),
                              left(coalesce(v.redaccion, v.lo_que_se_vio), 120)),
    p_motivo      => p_motivo,
    p_prioridad   => p_prioridad,
    p_zona        => v.zona,
    p_ubicacion   => v.ubicacion,
    p_descripcion => coalesce(v.redaccion, v.lo_que_se_vio)
                     || E'\n\nViene del hallazgo ' || v.codigo || ' de ABI.'
  );

  update public.acciones_hallazgos set accion_id = r.id where id = p_id;
  return query select r.id, r.codigo;
end $$;
grant execute on function public.hallazgo_abrir_accion(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. CERRAR, ANULAR Y BORRAR
-- ---------------------------------------------------------------------
create or replace function public.hallazgo_cerrar(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v public.acciones_hallazgos%rowtype;
begin
  if not public.hallazgo_puede_editar() then
    raise exception 'Cerrar un hallazgo es de quien tiene Editar en ABI';
  end if;
  select * into v from public.acciones_hallazgos where id = p_id;
  if not found then raise exception 'Ese hallazgo no existe'; end if;
  if v.estado <> 'firme' then
    raise exception 'Solo se cierra un hallazgo firme: primero se aprueba su redacción';
  end if;
  update public.acciones_hallazgos set estado = 'cerrado' where id = p_id;
end $$;
grant execute on function public.hallazgo_cerrar(uuid) to authenticated;

-- ANULAR DEJA LA FILA con el motivo y quién; BORRAR no deja nada. Es la
-- misma pareja que ya tienen las roturas y las salidas, y por la misma
-- razón: casi siempre lo correcto es anular.
create or replace function public.hallazgo_anular(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.hallazgo_puede_editar() then
    raise exception 'Anular un hallazgo es de quien tiene Editar en ABI';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula: queda escrito en la fila';
  end if;
  update public.acciones_hallazgos
     set estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = auth.uid(), anulado_en = now()
   where id = p_id and estado <> 'anulado';
  if not found then raise exception 'Ese hallazgo no existe o ya estaba anulado'; end if;
end $$;
grant execute on function public.hallazgo_anular(uuid, text) to authenticated;

create table if not exists public.acciones_hallazgos_borrados (
  id          uuid primary key,
  codigo      text,
  fila        jsonb not null,
  fotos       jsonb not null default '[]'::jsonb,
  motivo      text not null,
  borrado_por uuid references auth.users(id),
  borrado_en  timestamptz not null default now()
);
alter table public.acciones_hallazgos_borrados enable row level security;
drop policy if exists hallazgos_borrados_ver on public.acciones_hallazgos_borrados;
create policy hallazgos_borrados_ver on public.acciones_hallazgos_borrados
  for select to authenticated using (public.manda());
grant select on public.acciones_hallazgos_borrados to authenticated;

create or replace function public.hallazgo_borrar(p_ids uuid[], p_motivo text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n integer; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  /* BORRAR ES DEL ADMINISTRADOR y no de quien edita ABI: un hallazgo
     firme salió en un informe, y hacerlo desaparecer es otra cosa que
     corregirse. */
  if not public.manda() then
    raise exception 'Borrar hallazgos es del administrador';
  end if;
  if v_motivo = '' then
    raise exception 'Hay que decir por qué se borran: la fila se va y el motivo es lo único que queda';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'No se escogió ningún hallazgo';
  end if;

  /* EL RASTRO SE ESCRIBE ANTES DEL DELETE: al revés, las fotos ya se
     habrían ido con la cascada y el registro guardaría una lista
     vacía. */
  insert into public.acciones_hallazgos_borrados (id, codigo, fila, fotos, motivo, borrado_por)
  select h.id, h.codigo, to_jsonb(h),
         coalesce((select jsonb_agg(to_jsonb(f) order by f.id)
                     from public.acciones_hallazgos_fotos f where f.hallazgo_id = h.id),
                  '[]'::jsonb),
         v_motivo, auth.uid()
    from public.acciones_hallazgos h
   where h.id = any(p_ids)
  on conflict (id) do nothing;

  delete from public.acciones_hallazgos where id = any(p_ids);
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Ninguno de esos hallazgos existe ya'; end if;
  return v_n;
end $$;
grant execute on function public.hallazgo_borrar(uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. LO QUE LEE LA PANTALLA
--
-- `falta_redaccion` y `revisado` SE CALCULAN AQUÍ y no en cada
-- pantalla: tres sitios preguntándose «¿a este le falta algo?» son tres
-- sitios donde se puede contestar distinto el día que cambie la regla.
-- ---------------------------------------------------------------------
create or replace view public.v_hallazgos as
select h.*,
       t.nombre  as tema_nombre,
       a.nombre  as area_nombre,
       z.nombre  as zona_nombre,
       (select count(*) from public.acciones_hallazgos_fotos f where f.hallazgo_id = h.id)
         as fotos,
       (h.estado = 'borrador' and btrim(coalesce(h.redaccion, '')) = '') as falta_redaccion,
       /* LO ESCRIBIÓ LA MÁQUINA Y NADIE LO TOCÓ. No es un error —puede
          estar perfecto— pero un informe donde TODO salió así es un
          informe que nadie leyó, y eso se tiene que poder ver. */
       (h.ia_borrador is not null
        and btrim(coalesce(h.redaccion, '')) = btrim(coalesce(h.ia_borrador, '')))
         as tal_cual_de_la_ia,
       (h.accion_id is not null) as tiene_accion,
       ac.codigo as accion_codigo,
       ac.estado::text as accion_estado
  from public.acciones_hallazgos h
  left join public.acciones_hallazgos_temas t on t.clave = h.tema
  left join public.acciones_areas a on a.clave = h.area
  left join public.acciones_zonas z on z.codigo = h.zona
  left join public.acciones ac on ac.id = h.accion_id;

grant select on public.v_hallazgos to authenticated;

-- ---------------------------------------------------------------------
-- 10. «TODAS» SE MUDA DE /acciones A /acciones/todas
--
-- Y ES LO MISMO QUE PASÓ EN INVENTARIO. Con dos ramas, la ruta del
-- módulo tiene que ser la BIFURCACIÓN: estando parado en ella, el riel
-- debe mostrar las ramas y no las pantallas de una de ellas. Con
-- «Todas» encima de /acciones, entrar a Acciones sería entrar ya a OL y
-- no habría dónde escoger.
--
-- LOS PERMISOS SE GUARDAN COMO EL TEXTO DE LA DIRECCIÓN, así que mover
-- la pantalla sin mover el permiso deja a la gente sin ella EN
-- SILENCIO: ni error, ni aviso — deja de verse.
-- ---------------------------------------------------------------------
insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/acciones/todas', p.nivel
  from public.rol_permisos p
 where p.seccion = '/acciones'
on conflict (rol, seccion) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles'
                and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = permisos_extra
           || jsonb_build_object('/acciones/todas', permisos_extra -> '/acciones')
     where permisos_extra ? '/acciones'
       and not (permisos_extra ? '/acciones/todas');
  end if;
end $$;

/* Y LA RAMA DE ABI NACE CERRADA PARA TODOS menos para quien manda: una
   pantalla nueva que nace abierta es un permiso que nadie decidió dar.
   Se abre en Administración → Roles. */

do $$
declare n_rol int; n_hz int;
begin
  select count(*) into n_rol from public.rol_permisos where seccion = '/acciones/todas';
  select count(*) into n_hz from public.acciones_hallazgos;
  raise notice 'ABI listo: % hallazgo(s) en la base.', n_hz;
  raise notice '«Todas» se mudo a /acciones/todas: % rol(es) con el permiso copiado.', n_rol;
  raise notice 'La rama ABI nace CERRADA: abrela en Administracion -> Roles (/acciones/abi).';
end $$;

commit;
