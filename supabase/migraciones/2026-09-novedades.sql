-- =====================================================================
-- NOVEDADES DE T1 / T2
--
-- Una bandeja para lo que sale mal: sello roto, faltante, cliente
-- cerrado, vehículo varado. Se reporta, se mira, se cierra.
--
-- TRES DECISIONES QUE MANDAN SOBRE TODO LO DEMÁS
--
-- 1. EL VIAJE ES OPCIONAL.
--    Si la novedad es de un viaje de T1 que ya está registrado, se
--    escoge la placa de la lista y queda colgando de ese viaje: así se
--    puede decir "de 40 viajes, 6 con novedad", que es la cifra por la
--    que existe esto. Pero T2 —el reparto— todavía no tiene viajes en la
--    plataforma, y una novedad de reparto no puede esperar a que los
--    haya. Con viaje_id nulo se escribe la placa y la fecha a mano.
--
-- 2. LA PLACA SE GUARDA SIEMPRE, aunque haya viaje.
--    Es lo único que se repite a propósito. Un viaje se puede anular o
--    corregir, y una novedad que dependa de él para saber de qué
--    vehículo habla se quedaría muda. La placa es lo que alguien busca
--    seis meses después.
--
-- 3. TIENE UN CD RESPONSABLE Y UN HILO DE SEGUIMIENTO.
--    Una novedad sin dueño es una queja. Lo que la vuelve útil entre
--    plantas es que diga A QUIÉN le toca responder —el CD de origen,
--    cuando lo que llegó mal viene de allá— y que el de allá pueda
--    contestar SIN cerrarla: comprometerse a una fecha, decir qué está
--    haciendo. Cerrar es el final; el seguimiento es lo que pasa antes,
--    y es lo que hoy ocurre por teléfono y no queda en ninguna parte.
--
-- 4. EL MOTIVO SALE DE UN CATÁLOGO, no de texto libre.
--    Con texto libre, a los tres meses hay doscientas novedades y
--    ninguna forma de agruparlas: "sello roto", "SELLO ROTO" y "roto el
--    sello" son tres cosas distintas para una consulta. El catálogo es
--    una tabla —se edita sin tocar el código, como los roles— y la
--    descripción libre sigue estando, al lado, para el detalle.
--
-- Correr en el editor SQL de Supabase. Se puede correr dos veces.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. De qué tramo habla, y de qué tipo es.
--
-- 'tramo' es T1 o T2 y no se deduce del viaje: una novedad SUELTA no
-- tiene viaje de donde sacarlo, y es justamente el caso de T2.
-- ---------------------------------------------------------------------
do $$ begin
  create type tramo_novedad as enum ('t1', 't2');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 'viaje'   lo que le pasó al vehículo o al recorrido
  -- 'entrega' lo que le pasó a la carga o al cliente
  create type tipo_novedad as enum ('viaje', 'entrega');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_novedad as enum ('abierta', 'cerrada');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. EL CATÁLOGO DE MOTIVOS. Datos, no código.
-- ---------------------------------------------------------------------
create table if not exists public.sider_novedad_motivos (
  clave   text primary key,
  nombre  text not null,
  -- null = sirve para los dos tramos. Así un motivo común no se escribe
  -- dos veces y después divergen.
  tramo   tramo_novedad,
  tipo    tipo_novedad not null default 'viaje',
  orden   smallint not null default 100,
  activo  boolean not null default true
);

insert into public.sider_novedad_motivos (clave, nombre, tramo, tipo, orden) values
  -- T1 · lo que llega de otro CD
  ('sello_roto',        'Sello roto',                       't1', 'viaje',   10),
  ('faltante',          'Faltante de envase',               't1', 'entrega', 20),
  ('sobrante',          'Sobrante de envase',               't1', 'entrega', 30),
  ('estibas_golpeadas', 'Estibas golpeadas',                't1', 'entrega', 40),
  ('envase_sucio',      'Envase sucio o extrasucio',        't1', 'entrega', 50),
  ('fuera_horario',     'Llegó fuera de horario',           't1', 'viaje',   60),
  ('otro_conductor',    'Conductor distinto al despachado', 't1', 'viaje',   70),
  -- T2 · el reparto
  ('cliente_cerrado',   'Cliente cerrado',                  't2', 'entrega', 10),
  ('rechazo',           'Rechazo del cliente',              't2', 'entrega', 20),
  ('faltante_entrega',  'Faltante en la entrega',           't2', 'entrega', 30),
  ('direccion_errada',  'Dirección errada',                 't2', 'entrega', 40),
  ('sin_quien_reciba',  'No hubo quien reciba',             't2', 'entrega', 50),
  ('devolucion',        'Devolución de envase',             't2', 'entrega', 60),
  -- Los dos tramos
  ('varado',            'Vehículo varado',                  null, 'viaje',   80),
  ('accidente',         'Accidente en la vía',              null, 'viaje',   85),
  ('documento',         'Documento incompleto',             null, 'viaje',   90),
  ('otro',              'Otro',                             null, 'viaje',  999)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 3. LA BANDEJA.
-- ---------------------------------------------------------------------
create table if not exists public.sider_novedades (
  id           uuid primary key default gen_random_uuid(),

  tramo        tramo_novedad not null,
  tipo         tipo_novedad not null,
  motivo       text not null references public.sider_novedad_motivos(clave),

  -- Opcional a propósito: ver la explicación de arriba.
  viaje_id     uuid references public.sider_viajes(id) on delete set null,
  -- Siempre, aunque haya viaje.
  placa        text not null check (btrim(placa) <> ''),
  -- Cuándo PASÓ, que no es cuándo se escribió.
  fecha        date not null,

  descripcion  text,
  -- Ruta de la foto en el bucket 'sider'. La imagen no vive en la base.
  foto_ruta    text,

  -- A QUIÉN LE TOCA RESPONDER. En T1 es el CD de origen —lo que llegó
  -- mal salió de allá—; en T2 es la ruta o la transportadora. Se guarda
  -- como texto y no como llave al maestro de orígenes a propósito: en T2
  -- el responsable no es un CD y no está en ese maestro.
  cd_responsable   text,

  -- Lo que el responsable se compromete a hacer, y para cuándo. Nulo
  -- mientras no haya contestado: así se ve de un golpe cuáles llevan
  -- días abiertas sin que nadie diga nada.
  compromiso       text,
  fecha_compromiso date,

  estado       estado_novedad not null default 'abierta',
  que_se_hizo  text,
  cerrada_por  uuid references public.perfiles(id) on delete set null,
  cerrada_en   timestamptz,

  creada_por   uuid references public.perfiles(id) on delete set null,
  creada_en    timestamptz not null default now(),

  -- Una novedad cerrada tiene que decir qué se hizo. Sin esto, "cerrada"
  -- no significa "resuelta": significa "alguien le dio al botón".
  constraint novedad_cerrada_explica check (
    estado <> 'cerrada'
    or (que_se_hizo is not null and btrim(que_se_hizo) <> '' and cerrada_en is not null)
  )
);

create index if not exists sider_novedades_fecha_idx on public.sider_novedades (fecha desc);
create index if not exists sider_novedades_placa_idx on public.sider_novedades (upper(btrim(placa)));
create index if not exists sider_novedades_viaje_idx on public.sider_novedades (viaje_id)
  where viaje_id is not null;
-- Las abiertas son las que se miran todos los días: índice parcial, que
-- solo pesa lo que pesan ellas.
create index if not exists sider_novedades_abiertas_idx on public.sider_novedades (fecha desc)
  where estado = 'abierta';

-- ---------------------------------------------------------------------
-- 3b. EL HILO. Lo que se conversa mientras la novedad sigue abierta.
--
-- Existe para que el CD de origen pueda CONTESTAR sin cerrar: "ya lo
-- revisamos", "el jueves reponemos", "no fue nuestro, salió sellado".
-- Hoy eso pasa por teléfono y no queda en ninguna parte, y a la semana
-- nadie se acuerda de quién dijo qué.
--
-- Las respuestas no se borran ni se editan: un hilo que se puede
-- reescribir no sirve para ponerse de acuerdo.
-- ---------------------------------------------------------------------
create table if not exists public.sider_novedad_hilo (
  id          uuid primary key default gen_random_uuid(),
  novedad_id  uuid not null references public.sider_novedades(id) on delete cascade,
  texto       text not null check (btrim(texto) <> ''),
  -- Desde dónde contesta quien escribe. Se guarda en la respuesta y no
  -- se saca del perfil: el día que alguien cambie de CD, lo que dijo
  -- entonces tiene que seguir diciendo desde dónde lo dijo.
  desde       text,
  escrita_por uuid references public.perfiles(id) on delete set null,
  escrita_en  timestamptz not null default now()
);

create index if not exists sider_novedad_hilo_idx
  on public.sider_novedad_hilo (novedad_id, escrita_en);

-- ---------------------------------------------------------------------
-- 4. Vista para la pantalla: la novedad con el nombre del motivo y lo
--    que se sepa del viaje, resuelto de una vez.
-- ---------------------------------------------------------------------
drop view if exists public.v_sider_novedades;
create view public.v_sider_novedades as
select
  n.id, n.tramo, n.tipo, n.motivo,
  m.nombre                                   as motivo_nombre,
  n.viaje_id,
  n.placa,
  n.fecha,
  n.descripcion,
  n.foto_ruta,
  n.cd_responsable,
  n.compromiso,
  n.fecha_compromiso,
  n.estado,
  n.que_se_hizo,
  n.cerrada_por, n.cerrada_en,
  n.creada_por,  n.creada_en,

  -- Cuántos días lleva abierta. Es la cifra que hace que una novedad
  -- deje de ser un renglón y pase a ser un problema: "lleva 12 días" se
  -- entiende sin leer nada más.
  case when n.estado = 'cerrada'
       then (n.cerrada_en::date - n.fecha)
       else (current_date - n.fecha) end          as dias,

  -- Se pasó de lo que prometieron. Solo cuenta si hay compromiso: sin
  -- fecha prometida no hay nada que incumplir.
  (n.estado = 'abierta' and n.fecha_compromiso is not null
   and n.fecha_compromiso < current_date)         as vencida,

  (select count(*) from public.sider_novedad_hilo h where h.novedad_id = n.id) as respuestas,
  -- De qué viaje habla, cuando hay viaje.
  --
  -- OJO CON DE DÓNDE SALE cd_origen. En sider_viajes la columna NO
  -- existe: ahí lo que hay es "planta", que apunta al maestro
  -- sider_origenes, y el nombre bonito del CD —"CD La Arenosa"— vive en
  -- ese maestro. Igual pasa con la descripción del material, que vive en
  -- sider_skus. Se llega a los dos por su maestro, no por el viaje.
  --
  -- Y se llega POR LOS MAESTROS, no por la vista v_sider_viajes, que
  -- también los tiene: si esta vista dependiera de aquella, volver a
  -- correr supabase/modulos/sider.sql —que la bota y la vuelve a crear—
  -- se caería con "cannot drop view v_sider_viajes because other objects
  -- depend on it". Colgarse de las tablas deja los dos archivos
  -- independientes: cada uno se puede correr cuando sea, y dos veces.
  o.cd_origen,
  s.descripcion                              as material,
  v.estado::text                             as estado_viaje,
  (n.viaje_id is not null)                   as pegada_a_viaje
from public.sider_novedades n
join public.sider_novedad_motivos m on m.clave = n.motivo
left join public.sider_viajes   v on v.id     = n.viaje_id
left join public.sider_origenes o on o.planta = v.planta
left join public.sider_skus     s on s.sku    = v.sku;

grant select on public.v_sider_novedades to authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS. Todos leen; reportar y cerrar, solo quien edita.
--
-- Leer lo puede todo el que entre porque una novedad abierta le importa
-- a media bodega. Escribir no: una novedad es un señalamiento —dice que
-- algo llegó mal— y tiene que quedar claro quién lo hizo.
-- ---------------------------------------------------------------------
alter table public.sider_novedades       enable row level security;
alter table public.sider_novedad_motivos enable row level security;

drop policy if exists sider_novedades_select on public.sider_novedades;
create policy sider_novedades_select on public.sider_novedades
  for select to authenticated using (true);

drop policy if exists sider_novedades_write on public.sider_novedades;
create policy sider_novedades_write on public.sider_novedades
  for all to authenticated
  using (public.es_editor()) with check (public.es_editor());

drop policy if exists sider_motivos_select on public.sider_novedad_motivos;
create policy sider_motivos_select on public.sider_novedad_motivos
  for select to authenticated using (true);

drop policy if exists sider_motivos_write on public.sider_novedad_motivos;
create policy sider_motivos_write on public.sider_novedad_motivos
  for all to authenticated
  using (public.manda()) with check (public.manda());

alter table public.sider_novedad_hilo enable row level security;

drop policy if exists sider_hilo_select on public.sider_novedad_hilo;
create policy sider_hilo_select on public.sider_novedad_hilo
  for select to authenticated using (true);

/* Solo INSERT: el hilo no se edita ni se borra. Una conversación que se
   puede reescribir no sirve para ponerse de acuerdo. */
drop policy if exists sider_hilo_insert on public.sider_novedad_hilo;
create policy sider_hilo_insert on public.sider_novedad_hilo
  for insert to authenticated with check (public.es_editor());

grant select, insert, update, delete on public.sider_novedades to authenticated;
grant select, insert on public.sider_novedad_hilo to authenticated;
grant select on public.sider_novedad_motivos to authenticated;

-- ---------------------------------------------------------------------
-- 6. Reportar.
--
-- Va como función y no como insert desde la pantalla porque "quién la
-- reportó" tiene que salir de la sesión: si el id viajara en el cuerpo
-- de la petición, cualquiera podría firmar una novedad a nombre de otro.
-- Y porque la placa, cuando hay viaje, se toma DEL VIAJE: dejar que la
-- mande el navegador permite una novedad que dice una placa y apunta a
-- un viaje de otra.
-- ---------------------------------------------------------------------
create or replace function public.sider_novedad_reportar(
  p_tramo       text,
  p_tipo        text,
  p_motivo      text,
  p_placa       text,
  p_fecha       date,
  p_descripcion text default null,
  p_viaje_id    uuid default null,
  p_foto_ruta   text default null,
  p_responsable text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placa text;
  v_resp  text;
  v_id    uuid;
begin
  if not public.es_editor() then
    raise exception 'Reportar una novedad requiere rol de supervisor o administrador';
  end if;

  if p_viaje_id is not null then
    /* La placa Y el responsable salen DEL VIAJE. Dejar que los mande el
       navegador permite una novedad que dice una placa y apunta a un
       viaje de otra, o que le echa la culpa al CD equivocado. */
    /* El CD sale del MAESTRO de orígenes, no del viaje: el viaje guarda
       "planta" ('Arenosa') y el nombre que la gente reconoce ('CD La
       Arenosa') está en sider_origenes. left join y no join, para que un
       viaje sin maestro siga dando placa —la novedad se reporta igual,
       solo queda sin responsable— en vez de contestar "ese viaje no
       existe", que sería mentira. */
    select upper(btrim(v.placa)), o.cd_origen into v_placa, v_resp
      from public.sider_viajes v
      left join public.sider_origenes o on o.planta = v.planta
     where v.id = p_viaje_id;
    if v_placa is null then
      raise exception 'Ese viaje no existe';
    end if;
  else
    v_placa := upper(btrim(coalesce(p_placa, '')));
    v_resp  := nullif(btrim(coalesce(p_responsable, '')), '');
    if v_placa = '' then
      raise exception 'Sin viaje hay que escribir la placa';
    end if;
  end if;

  if p_fecha > current_date then
    raise exception 'La fecha de la novedad no puede ser futura';
  end if;

  insert into public.sider_novedades
    (tramo, tipo, motivo, viaje_id, placa, fecha, descripcion, foto_ruta,
     cd_responsable, creada_por)
  values
    (p_tramo::tramo_novedad, p_tipo::tipo_novedad, p_motivo, p_viaje_id, v_placa,
     p_fecha, nullif(btrim(coalesce(p_descripcion, '')), ''), p_foto_ruta,
     v_resp, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.sider_novedad_reportar(
  text, text, text, text, date, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6b. RESPONDER, sin cerrar.
--
-- Es la función que hace que esto sirva entre plantas: el CD de origen
-- contesta, y de paso puede comprometerse a una fecha. El compromiso va
-- en la MISMA llamada que la respuesta a propósito: una fecha prometida
-- sin una frase que la explique no le sirve a nadie, y una frase sin
-- fecha se olvida.
--
-- Responder lo puede hacer cualquiera que pueda editar, no solo quien la
-- reportó: la gracia es que conteste el otro.
-- ---------------------------------------------------------------------
create or replace function public.sider_novedad_responder(
  p_id          uuid,
  p_texto       text,
  p_desde       text default null,
  p_compromiso  text default null,
  p_fecha_comp  date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado estado_novedad;
begin
  if not public.es_editor() then
    raise exception 'Responder una novedad requiere rol de supervisor o administrador';
  end if;
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'La respuesta no puede ir vacía';
  end if;

  select estado into v_estado from public.sider_novedades where id = p_id;
  if v_estado is null then raise exception 'Esa novedad ya no está'; end if;
  if v_estado = 'cerrada' then
    raise exception 'Esa novedad ya está cerrada: si hay algo más que decir, se abre una nueva';
  end if;

  insert into public.sider_novedad_hilo (novedad_id, texto, desde, escrita_por)
  values (p_id, btrim(p_texto), nullif(btrim(coalesce(p_desde, '')), ''), auth.uid());

  /* El compromiso se pisa con el último: si prometieron el jueves y
     después el lunes, lo que vale es el lunes. Las dos promesas quedan
     en el hilo, que es donde se ve que la fecha se corrió. */
  if btrim(coalesce(p_compromiso, '')) <> '' or p_fecha_comp is not null then
    update public.sider_novedades
       set compromiso = nullif(btrim(coalesce(p_compromiso, '')), ''),
           fecha_compromiso = p_fecha_comp
     where id = p_id;
  end if;
end $$;

grant execute on function public.sider_novedad_responder(uuid, text, text, text, date)
  to authenticated;

-- ---------------------------------------------------------------------
-- 7. Cerrar. Exige decir qué se hizo — la restricción de la tabla lo
--    impone igual, pero aquí el mensaje se entiende.
-- ---------------------------------------------------------------------
create or replace function public.sider_novedad_cerrar(
  p_id uuid,
  p_que_se_hizo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado estado_novedad;
begin
  if not public.es_editor() then
    raise exception 'Cerrar una novedad requiere rol de supervisor o administrador';
  end if;
  if btrim(coalesce(p_que_se_hizo, '')) = '' then
    raise exception 'Para cerrar hay que decir qué se hizo';
  end if;

  select estado into v_estado from public.sider_novedades where id = p_id;
  if v_estado is null then raise exception 'Esa novedad ya no está'; end if;
  if v_estado = 'cerrada' then raise exception 'Esa novedad ya estaba cerrada'; end if;

  update public.sider_novedades
     set estado = 'cerrada',
         que_se_hizo = btrim(p_que_se_hizo),
         cerrada_por = auth.uid(),
         cerrada_en = now()
   where id = p_id;
end $$;

grant execute on function public.sider_novedad_cerrar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. QUIÉN VE LA PANTALLA.
--
-- Una sección nueva nace CERRADA para todos menos para quien manda: en
-- rol_permisos solo se guarda lo concedido. Si esto no estuviera, el
-- supervisor y el operador no verían Novedades en el menú y nadie
-- sabría por qué —no da error, simplemente no aparece—.
--
-- El supervisor edita (reporta y cierra) y el operador mira: una
-- novedad es un señalamiento, dice que algo llegó mal, y tiene que
-- quedar claro quién lo hizo.
-- ---------------------------------------------------------------------
insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor', '/sider/novedades', 'editar'),
  ('operador',   '/sider/novedades', 'ver')
on conflict (rol, seccion) do nothing;

-- ---------------------------------------------------------------------
-- 9. Comprobación. Las cuatro tienen que decir 'ok'.
-- ---------------------------------------------------------------------
do $$
declare
  v_tabla   boolean;
  v_vista   boolean;
  v_motivos integer;
  v_fns     integer;
begin
  select exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'sider_novedades') into v_tabla;
  select exists (select 1 from information_schema.views
                  where table_schema = 'public' and table_name = 'v_sider_novedades') into v_vista;
  select count(*) into v_motivos from public.sider_novedad_motivos where activo;
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('sider_novedad_reportar', 'sider_novedad_cerrar', 'sider_novedad_responder');

  raise notice 'tabla sider_novedades ... %', case when v_tabla then 'ok' else 'MAL' end;
  raise notice 'vista v_sider_novedades . %', case when v_vista then 'ok' else 'MAL' end;
  raise notice 'motivos cargados ........ % (%)', case when v_motivos >= 16 then 'ok' else 'MAL' end, v_motivos;
  raise notice 'las tres funciones ...... % (%)', case when v_fns = 3 then 'ok' else 'MAL' end, v_fns;
  raise notice 'hilo de seguimiento ..... %',
    case when exists (select 1 from information_schema.tables
                       where table_schema = 'public' and table_name = 'sider_novedad_hilo')
         then 'ok' else 'MAL' end;
  raise notice 'permisos de la pantalla . %',
    case when (select count(*) from public.rol_permisos where seccion = '/sider/novedades') >= 2
         then 'ok' else 'MAL — nadie la va a ver en el menú' end;
end $$;
