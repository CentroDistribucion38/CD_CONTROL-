-- =====================================================================
-- CONTROL · ACCIONES CORRECTIVAS Y PREVENTIVAS
--
-- Correr DESPUÉS de 00-nucleo.sql, 01-perfil.sql, 02-roles.sql y
-- 03-usuarios.sql. Es idempotente: se puede correr las veces que sea.
--
-- QUÉ RESUELVE ESTO, Y POR QUÉ NO ES UNA LISTA DE PENDIENTES.
--
-- Una lista de pendientes se negocia: quien la tiene decide cuándo la
-- hace y, si le queda apretada, corre la fecha. Un sistema de acciones
-- correctivas no. Aquí hay cuatro reglas que el software impone y que
-- una persona no puede mover, porque el día que se puedan mover el
-- indicador de cumplimiento deja de significar algo:
--
--   1. EL PLAZO LO PONE LA PRIORIDAD, NO LA PERSONA.
--      Alta 24 horas, media 48, baja 72. La fecha la calcula
--      la base al reportar. Nadie escribe una fecha de vencimiento.
--
--   2. CERRAR NO ES RESOLVER.
--      Cerrar es decir "ya lo hice". Después alguien VERIFICA si de
--      verdad sirvió. La efectividad del mes se mide sobre lo
--      verificado, no sobre lo cerrado, que es lo que hace que no se
--      pueda inflar cerrando.
--
--   3. A LA TERCERA VEZ EN EL MISMO SITIO SE CORTA.
--      Si el mismo motivo vuelve a salir en la misma zona por tercera
--      vez en seis meses, el problema no es la estiba: es el proceso.
--      El sistema bloquea abrir una cuarta correctiva y obliga a
--      preventiva, que exige causa raíz y responsable de PROCESO.
--
--   4. LA FOTO Y EL LUGAR SE SELLAN AL TOMARLOS.
--      Hora, coordenadas y precisión quedan con la foto. Una foto de la
--      galería, tomada quién sabe cuándo y dónde, no es evidencia.
--
-- Y una que el software NO impone pero sí MUESTRA: quien cierra una
-- acción no debería ser quien la verifica. En un CD con tres personas
-- de turno eso a veces no se puede, así que en vez de trabar el
-- proceso se marca la fila —auto_verificada— y queda a la vista de
-- quien mire el tablero. Una regla que se puede saltar en silencio es
-- peor que una regla que no existe.
--
-- NADA DE ESTO TOCA NOVEDADES DE T1 / T2. Son dos cosas distintas a
-- propósito: una novedad es lo que pasó en un viaje —sello roto,
-- cliente cerrado— y se resuelve entre dos plantas; una acción es una
-- corrección con plazo, responsable y verificación, en cualquier área
-- de la bodega. Se parecen de lejos y se comportan distinto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LOS TIPOS
-- ---------------------------------------------------------------------
do $$ begin
  create type accion_prioridad as enum ('alta', 'media', 'baja');
exception when duplicate_object then null; end $$;

do $$ begin
  create type accion_tipo as enum ('correctiva', 'preventiva');
exception when duplicate_object then null; end $$;

/* LOS CINCO ESTADOS, Y POR QUÉ SON CINCO Y NO TRES.
     abierta     se reportó. Con o sin responsable.
     cerrada     el responsable dice qué hizo. ESPERANDO VERIFICACIÓN.
     verificada  alguien fue a mirar. Aquí se sabe si sirvió o no.
     reabierta   se verificó y NO sirvió. Vuelve a estar viva, con el
                 mismo código, para que la reincidencia se cuente bien.
     anulada     estaba mal reportada. No cuenta en ningún indicador.
   Sin "cerrada" separada de "verificada" el cumplimiento se infla
   solo: basta con cerrar. */
do $$ begin
  create type accion_estado as enum
    ('abierta', 'cerrada', 'verificada', 'reabierta', 'anulada');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. LAS ÁREAS
--
-- Son los renglones de "Cumplimiento por área" del tablero. Se guardan
-- como maestro y no como texto suelto porque el tablero agrupa por
-- ellas: con texto libre, "Almacenamiento" y "almacenamiento" son dos
-- barras distintas y el informe se parte solo.
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- LOS EQUIPOS QUE RESPONDEN. Easy y Summar son operadores logísticos,
-- no personas: la acción se le asigna al OL y después, si se quiere, a
-- alguien de adentro.
--
-- Maestro y no texto libre, por lo mismo que las áreas: con texto
-- suelto, "Easy", "EASY" y "easy " son tres responsables distintos y el
-- informe de cumplimiento se parte solo.
--
-- No son usuarios de la aplicación. Un login compartido por todo un OL
-- deja de decir QUIÉN cerró cada acción, que es justamente lo que este
-- módulo existe para saber. El día que alguien de Easy tenga su propia
-- cuenta, se le pone su equipo en el perfil y su bandeja lo filtra.
-- ---------------------------------------------------------------------
create table if not exists public.acciones_equipos (
  clave     text primary key,
  nombre    text not null,
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now()
);

-- SIN SEMILLA, A PROPÓSITO. La primera versión traía "Easy" y "Summar"
-- quemados aquí, y eso estaba mal por dos razones: los nombres de los
-- contratistas de UN centro de distribución no son parte del programa
-- —el día que cambie el OL habría que tocar código para algo que es un
-- dato—, y además Easy YA tiene su propio usuario, así que sembrarlo
-- como equipo crea un segundo "Easy" que no es el mismo que el de la
-- lista de personas.
--
-- El maestro nace vacío y se carga desde Acciones → Maestro → Equipos,
-- si hace falta. Mientras esté vacío, asignar funciona exactamente como
-- antes: se escoge la persona y ya.

create table if not exists public.acciones_areas (
  clave     text primary key,
  nombre    text not null,
  orden     smallint,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

insert into public.acciones_areas (clave, nombre, orden) values
  ('recibo',          'Recibo',          1),
  ('almacenamiento',  'Almacenamiento',  2),
  ('despacho',        'Despacho',        3),
  ('seguridad',       'Seguridad',       4),
  ('quiebra',         'Quiebra',         5),
  ('calidad',         'Calidad',         6),
  ('mantenimiento',   'Mantenimiento',   7)
-- do nothing, NO do update: esto es una SEMILLA. Se edita desde la app
-- y volver a correr el archivo no debe pisar lo que alguien corrigió.
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 3. LAS ZONAS — el mapa de la bodega, con su QR
--
-- Cada pasillo, muelle y zona tiene un código pegado en la pared
-- (AG01-PAS-03). Al escanearlo, el área, el proceso y la ubicación se
-- llenan solos, y ahí está la mitad del valor: una acción que dice
-- "por ahí atrás" no se puede agrupar, no se puede contar y no revela
-- que el pasillo 3 lleva tres veces con lo mismo.
--
-- El código ES la llave. Se escribe pegado en la pared y se lee con la
-- cámara, así que tiene que ser el mismo string en los dos lados.
-- ---------------------------------------------------------------------
create table if not exists public.acciones_zonas (
  codigo    text primary key,
  nombre    text not null,
  proceso   text,
  area      text not null references public.acciones_areas(clave),
  /* Dónde queda, para poder decir "a 18 m" cuando el GPS ubica a la
     persona. Opcional: una zona sin coordenadas se sigue pudiendo
     escoger de la lista, solo que no aparece en "otras zonas cerca". */
  lat       numeric(10,7),
  lng       numeric(10,7),
  /* Quitar del maestro es DESACTIVAR, no borrar: una zona que ya tiene
     acciones no se puede borrar sin romper el histórico, y el histórico
     es justamente lo que cuenta la reincidencia. */
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now()
);

insert into public.acciones_zonas (codigo, nombre, proceso, area, orden) values
  ('AG01-PAS-01', 'Pasillo 1',        'Picking',  'almacenamiento', 1),
  ('AG01-PAS-02', 'Pasillo 2',        'Picking',  'almacenamiento', 2),
  ('AG01-PAS-03', 'Pasillo 3',        'Picking',  'almacenamiento', 3),
  ('AG01-PAS-04', 'Pasillo 4',        'Picking',  'almacenamiento', 4),
  ('AG01-CAR-01', 'Pasillo de cargue', 'Cargue',  'despacho',       5),
  ('AG01-CAR-02', 'Zona de cargue',    'Cargue',  'despacho',       6),
  ('AG01-MUE-01', 'Muelle 1',          'Cargue',  'despacho',       7),
  ('AG01-MUE-02', 'Muelle 2',          'Cargue',  'despacho',       8),
  ('AG01-REC-01', 'Zona de recibo',    'Recibo',  'recibo',         9),
  ('AG01-DEV-01', 'Zona de envase',    'Quiebra', 'quiebra',       10)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- 4. LOS MOTIVOS
--
-- La lista cerrada de lo que se puede reportar. Es lista y no texto
-- libre por la misma razón que las áreas: la reincidencia se cuenta por
-- MOTIVO y ZONA, y "estibas mal apiladas" escrito de catorce maneras no
-- se cuenta nunca como tres veces lo mismo.
--
-- El texto libre no desaparece: la descripción sigue siendo libre. Lo
-- que está cerrado es la etiqueta con la que se agrupa.
-- ---------------------------------------------------------------------
create table if not exists public.acciones_motivos (
  clave     text primary key,
  nombre    text not null,
  area      text references public.acciones_areas(clave),
  /* Los críticos arrancan proponiendo prioridad alta. Se puede bajar,
     pero hay que hacerlo a propósito: un extintor vencido no debería
     depender de que a alguien se le ocurra que es grave. */
  critico   boolean not null default false,
  orden     smallint,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

insert into public.acciones_motivos (clave, nombre, area, critico, orden) values
  ('apilado_incorrecto',  'Apilado incorrecto',                'almacenamiento', false,  1),
  ('estibas_golpeadas',   'Estibas golpeadas o rotas',         'almacenamiento', false,  2),
  ('pasillo_obstruido',   'Pasillo obstruido',                 'almacenamiento', true,   3),
  ('envase_sin_separar',  'Envase sin separar por clase',      'quiebra',        false,  4),
  ('envase_sucio',        'Envase sucio o extrasucio',         'quiebra',        false,  5),
  ('producto_averiado',   'Producto averiado sin reportar',    'quiebra',        false,  6),
  ('faltan_fotos',        'Viaje sin las tres fotos',          'despacho',       false,  7),
  ('cargue_mal_estibado', 'Cargue mal estibado',               'despacho',       false,  8),
  ('muelle_sin_cuna',     'Muelle sin cuña ni bloqueo',        'despacho',       true,   9),
  ('recibo_sin_soporte',  'Recibo sin soporte',                'recibo',         false, 10),
  ('extintor_vencido',    'Extintor con carga vencida',        'seguridad',      true,  11),
  ('demarcacion_borrada', 'Demarcación borrada',               'seguridad',      false, 12),
  ('rejilla_suelta',      'Rejilla o tapa suelta',             'seguridad',      true,  13),
  ('derrame',             'Derrame en el piso',                'seguridad',      true,  14),
  ('sin_epp',             'Persona sin elementos de protección','seguridad',     true,  15),
  ('luminaria',           'Luminaria apagada o intermitente',  'mantenimiento',  false, 16),
  ('equipo_dañado',       'Equipo o montacargas con falla',    'mantenimiento',  true,  17),
  ('otro',                'Otro',                              null,             false, 99)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 5. LOS PLAZOS — el corazón de la cosa
--
-- Están en una tabla y no quemados en una función para que se puedan
-- cambiar sin tocar código, pero NO se escriben por acción: se leen de
-- aquí al reportar. La diferencia es todo: un plazo en la tabla es una
-- política de la bodega; un plazo por acción es una negociación.
-- ---------------------------------------------------------------------
create table if not exists public.acciones_plazos (
  prioridad accion_prioridad primary key,
  horas     integer not null check (horas > 0),
  etiqueta  text not null
);

insert into public.acciones_plazos (prioridad, horas, etiqueta) values
  ('alta',   24, '24 horas'),
  ('media',  48, '48 horas'),
  ('baja',   72, '72 horas')
on conflict (prioridad) do nothing;

/* LOS PLAZOS SE ACORTARON: eran 48 h / 7 días / 15 días y pasaron a
   24 / 48 / 72 horas. Se actualizan SOLO si siguen en los valores
   viejos. Un "do update" a secas los pisaría cada vez que se corre el
   archivo, y el día que alguien ajuste el plazo de "media" desde la app
   lo perdería sin enterarse: la semilla es un punto de partida, no la
   verdad. */
update public.acciones_plazos set horas = 24, etiqueta = '24 horas'
 where prioridad = 'alta'  and horas = 48;
update public.acciones_plazos set horas = 48, etiqueta = '48 horas'
 where prioridad = 'media' and horas = 168;
update public.acciones_plazos set horas = 72, etiqueta = '72 horas'
 where prioridad = 'baja'  and horas = 360;

/* Cuántas veces tiene que repetirse algo antes de que deje de ser mala
   suerte, y en cuántos meses. También configurable, y también leído y
   no escrito. */
create table if not exists public.acciones_parametros (
  clave text primary key,
  valor numeric not null,
  nota  text
);

insert into public.acciones_parametros (clave, valor, nota) values
  ('reincidencia_veces', 3,  'A la tercera vez del mismo motivo en la misma zona se exige preventiva.'),
  ('reincidencia_meses', 6,  'Ventana en la que se cuentan esas veces.'),
  ('meta_efectividad',   90, 'Meta del % de acciones verificadas como efectivas.'),
  ('carga_saturado',     10, 'Acciones abiertas a partir de las cuales se avisa que la persona está saturada.')
on conflict (clave) do nothing;

/* LOS AJUSTES QUE NO SON NÚMEROS. acciones_parametros guarda numeric;
   el responsable por defecto es un uuid y no cabe ahí sin aflojar la
   columna para todos. */
create table if not exists public.acciones_ajustes (
  clave text primary key,
  valor text,
  nota  text
);

insert into public.acciones_ajustes (clave, valor, nota) values
  ('responsable_defecto', null,
   'A quién nace asignada una acción nueva. Vacío = nace sin dueño.')
on conflict (clave) do nothing;

/* QUIÉN RECIBE ACCIONES. La lista de asignar mostraría a todos los
   usuarios —el administrador, la cuenta de la bodega—, y a ninguno de
   esos se le asigna una correctiva. Nadie marcado = aparecen todos:
   una lista vacía dejaría la pantalla de asignar sin salida. */
create table if not exists public.acciones_asignables (
  perfil_id  uuid primary key references public.perfiles(id) on delete cascade,
  puesto_por uuid,
  puesto_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. LAS ACCIONES
-- ---------------------------------------------------------------------

/* El consecutivo AC-0001. Se usa una secuencia y no un "max + 1"
   porque max+1 con dos personas reportando al mismo tiempo entrega el
   mismo número dos veces, y el número es el que la gente dice en voz
   alta en la reunión. */
create sequence if not exists public.acciones_codigo_seq;

create table if not exists public.acciones (
  id          uuid primary key default gen_random_uuid(),
  codigo      text unique not null,
  tipo        accion_tipo not null default 'correctiva',

  titulo      text not null,
  descripcion text,

  motivo      text not null references public.acciones_motivos(clave),
  area        text not null references public.acciones_areas(clave),

  /* DÓNDE. La zona del maestro cuando se pudo identificar; el texto
     libre cuando no. Los dos pueden venir: el texto precisa el punto
     dentro de la zona ("estante 4, nivel alto"). Lo que NO puede pasar
     es que no venga ninguno, y eso lo asegura la restricción de abajo:
     una acción sin lugar no se puede ir a mirar. */
  zona        text references public.acciones_zonas(codigo),
  ubicacion   text,

  /* Dónde estaba el teléfono al reportar, con su precisión. La
     precisión se guarda porque una ubicación con dos kilómetros de
     error no es evidencia de nada, y sin el número nadie puede saber
     que lo era. */
  lat         numeric(10,7),
  lng         numeric(10,7),
  precision_m numeric(8,2),

  prioridad   accion_prioridad not null default 'media',
  /* La fecha de vencimiento. La calcula la base al reportar, a partir
     de la prioridad y de acciones_plazos. No hay camino para que el
     navegador la mande. */
  vence_en    timestamptz not null,

  estado      accion_estado not null default 'abierta',

  /* A QUIÉN LE TOCA, EN DOS NIVELES.

     PERSONA  el caso normal. Quien de verdad tiene que hacerlo, y de
              quien se sabe el nombre. Si el contratista tiene usuario
              propio, se le asigna aquí y no hace falta nada más.
     EQUIPO   opcional, y para un caso concreto: cuando se le pasa a un
              operador logístico y todavía no se sabe a quién de adentro
              le va a tocar. Un equipo sin persona ya es un dueño — el OL
              responde—, y ya le pondrán nombre.

     Los dos son opcionales y ninguno manda sobre el otro. "Sin equipo y
     sin persona" es la que de verdad no tiene dueño, y es la que el
     tablero tiene que señalar. */
  equipo        text references public.acciones_equipos(clave),
  responsable   uuid references public.perfiles(id) on delete set null,
  asignada_por  uuid references public.perfiles(id) on delete set null,
  asignada_en   timestamptz,

  reportada_por uuid references public.perfiles(id) on delete set null,
  reportada_en  timestamptz not null default now(),

  /* CERRAR = decir qué se hizo. El texto es obligatorio al cerrar
     (la función lo exige): "listo" no es un cierre, es un silencio con
     otro nombre. */
  que_se_hizo text,
  cerrada_por uuid references public.perfiles(id) on delete set null,
  cerrada_en  timestamptz,

  /* VERIFICAR = ir a mirar si sirvió. efectiva null = todavía nadie
     fue. true/false = alguien fue y esto fue lo que encontró. */
  efectiva        boolean,
  nota_verificacion text,
  verificada_por  uuid references public.perfiles(id) on delete set null,
  verificada_en   timestamptz,

  /* Solo en las preventivas. La causa raíz es obligatoria ahí: una
     preventiva sin causa raíz es una correctiva con nombre elegante. */
  causa_raiz            text,
  responsable_proceso   uuid references public.perfiles(id) on delete set null,

  anulada_en     timestamptz,
  anulada_por    uuid references public.perfiles(id) on delete set null,
  motivo_anulacion text,

  creado_en   timestamptz not null default now(),

  constraint acciones_tiene_lugar
    check (zona is not null or btrim(coalesce(ubicacion, '')) <> ''),
  constraint acciones_preventiva_con_causa
    check (tipo <> 'preventiva' or btrim(coalesce(causa_raiz, '')) <> ''),
  constraint acciones_anulada_con_motivo
    check (estado <> 'anulada' or btrim(coalesce(motivo_anulacion, '')) <> '')
);

/* Los índices siguen a las preguntas que hace el tablero, que son
   siempre las mismas cuatro: qué está vencido, qué vence hoy, qué
   tiene esta persona, y cuántas veces pasó esto aquí. */
create index if not exists acciones_estado_idx   on public.acciones (estado, vence_en);
create index if not exists acciones_resp_idx     on public.acciones (responsable, estado);
alter table public.acciones add column if not exists equipo text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'acciones_equipo_fkey') then
    alter table public.acciones add constraint acciones_equipo_fkey
      foreign key (equipo) references public.acciones_equipos(clave);
  end if;
end $$;

create index if not exists acciones_equipo_idx   on public.acciones (equipo, estado)
  where equipo is not null;
create index if not exists acciones_zona_idx     on public.acciones (motivo, zona, reportada_en desc);
create index if not exists acciones_area_idx     on public.acciones (area, reportada_en desc);
create index if not exists acciones_abiertas_idx on public.acciones (vence_en)
  where estado in ('abierta', 'reabierta');

-- ---------------------------------------------------------------------
-- 7. LAS FOTOS
--
-- Mismo patrón que la evidencia de T1 / T2: el archivo vive en el
-- bucket y aquí queda la fila que dice de qué es, cuándo se tomó y
-- dónde. Las dos ranuras son las dos puntas de la historia: cómo estaba
-- y cómo quedó.
-- ---------------------------------------------------------------------
do $$ begin
  create type accion_ranura as enum ('hallazgo', 'cierre');
exception when duplicate_object then null; end $$;

create table if not exists public.acciones_fotos (
  id          uuid primary key default gen_random_uuid(),
  accion_id   uuid not null references public.acciones(id) on delete cascade,
  ranura      accion_ranura not null,
  ruta        text not null,
  bytes       integer,
  ancho       integer,
  alto        integer,
  /* La hora y el lugar DE LA FOTO, no de la fila. Se separan a
     propósito: una foto tomada a las 9 y subida a las 11 —porque en
     ese pasillo no hay señal— tiene que seguir diciendo las 9. */
  tomada_en   timestamptz,
  lat         numeric(10,7),
  lng         numeric(10,7),
  precision_m numeric(8,2),
  subida_por  uuid references public.perfiles(id) on delete set null,
  subida_en   timestamptz not null default now()
);

create index if not exists acciones_fotos_idx on public.acciones_fotos (accion_id, ranura);

-- ---------------------------------------------------------------------
-- 8. EL HILO — lo que se fue diciendo
--
-- Solo agrega, nunca edita ni borra. Una acción que lleva ocho días es
-- una conversación, y si esa conversación se puede reescribir después
-- no sirve para explicar por qué se demoró.
-- ---------------------------------------------------------------------
create table if not exists public.acciones_hilo (
  id         uuid primary key default gen_random_uuid(),
  accion_id  uuid not null references public.acciones(id) on delete cascade,
  texto      text not null,
  escrito_por uuid references public.perfiles(id) on delete set null,
  escrito_en timestamptz not null default now()
);

create index if not exists acciones_hilo_idx on public.acciones_hilo (accion_id, escrito_en);

/* De qué acciones viejas nació una preventiva. Es la prueba de que el
   bloqueo de reincidencia funcionó: la preventiva AC-0160 existe
   porque AC-0075, AC-0118 y AC-0142 fueron lo mismo tres veces. */
create table if not exists public.acciones_origen (
  preventiva_id uuid not null references public.acciones(id) on delete cascade,
  accion_id     uuid not null references public.acciones(id) on delete cascade,
  primary key (preventiva_id, accion_id)
);

-- =====================================================================
-- 9. LAS FUNCIONES
--
-- Todo lo que ESCRIBE pasa por aquí, con security definer, y todo lo
-- que dice "quién hizo esto" sale de auth.uid(). Nunca del navegador:
-- un formulario que manda quién es permite mandar a otro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cuántas veces pasó esto aquí. La consulta que sostiene el bloqueo.
--
-- Cuenta por MOTIVO y ZONA dentro de la ventana, y cuenta las
-- correctivas vivas o resueltas —no las anuladas, que estaban mal
-- reportadas, ni las preventivas, que son la consecuencia y no el
-- síntoma—. Si contara las anuladas, bastaría reportar mal tres veces
-- para disparar una preventiva que nadie necesita.
-- ---------------------------------------------------------------------
create or replace function public.accion_reincidencia(p_motivo text, p_zona text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.acciones a
   where a.motivo = p_motivo
     and a.zona is not distinct from p_zona
     and a.zona is not null
     and a.tipo = 'correctiva'
     and a.estado <> 'anulada'
     and a.reportada_en >= now() - make_interval(
           months => (select valor::int from public.acciones_parametros
                       where clave = 'reincidencia_meses'))
$$;

grant execute on function public.accion_reincidencia(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- REPORTAR
--
-- Devuelve el id y el código. El plazo, el consecutivo, el área y quién
-- reporta los pone la base.
-- ---------------------------------------------------------------------
drop function if exists public.accion_reportar(text, text, text, text, text, text, numeric, numeric, numeric);

create or replace function public.accion_reportar(
  p_titulo      text,
  p_motivo      text,
  p_prioridad   text,
  p_zona        text default null,
  p_ubicacion   text default null,
  p_descripcion text default null,
  p_lat         numeric default null,
  p_lng         numeric default null,
  p_precision   numeric default null
)
returns table (id uuid, codigo text, vence_en timestamptz, reincidencia integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area   text;
  v_horas  integer;
  v_id     uuid;
  v_cod    text;
  v_vence  timestamptz;
  v_pri    accion_prioridad;
  v_zona   text;
  v_veces  integer;
  v_tope   integer;
  v_dueno  uuid;
begin
  if not public.es_editor() then
    raise exception 'Reportar una acción requiere rol de supervisor o administrador';
  end if;

  v_pri := p_prioridad::accion_prioridad;

  /* La zona tiene que existir Y estar activa. Una zona desactivada
     sigue viéndose en las acciones viejas —por eso no se borra— pero no
     se puede escoger para una nueva. */
  if p_zona is not null then
    select z.codigo, z.area into v_zona, v_area
      from public.acciones_zonas z
     where z.codigo = upper(btrim(p_zona)) and z.activo;
    if v_zona is null then
      raise exception 'La zona % no existe o está desactivada', p_zona;
    end if;
  end if;

  /* Sin zona, el área sale del motivo. Y si el motivo tampoco la
     tiene —"Otro"—, cae en seguridad, que es la que sí se mira todos
     los días. Es mejor que una acción aparezca en el área equivocada a
     que no aparezca en ninguna. */
  if v_area is null then
    select m.area into v_area from public.acciones_motivos m
     where m.clave = p_motivo and m.activo;
    if not found then
      raise exception 'El motivo % no existe o está desactivado', p_motivo;
    end if;
    v_area := coalesce(v_area, 'seguridad');
  end if;

  if v_zona is null and btrim(coalesce(p_ubicacion, '')) = '' then
    raise exception 'Hay que decir dónde: escanea el QR, escoge la zona o escríbela';
  end if;

  /* EL PLAZO. Nadie lo manda; se lee de la tabla de política. */
  select horas into v_horas from public.acciones_plazos where prioridad = v_pri;
  v_vence := now() + make_interval(hours => v_horas);

  /* EL BLOQUEO. Si esto ya pasó aquí las veces del parámetro, no se
     abre otra correctiva: se exige preventiva, que entra por la otra
     función porque necesita causa raíz y responsable de proceso.
     El mensaje dice el número, no "no se puede": quien lo lee tiene
     que entender qué pasó, no solo que no lo dejaron. */
  v_veces := public.accion_reincidencia(p_motivo, v_zona);
  select valor::int into v_tope from public.acciones_parametros
   where clave = 'reincidencia_veces';

  if v_zona is not null and v_veces >= v_tope then
    raise exception
      'Este motivo ya va % veces en esta zona. Aquí no va otra correctiva: '
      'hay que abrir acción preventiva con causa raíz.', v_veces
      using errcode = 'P0001';
  end if;

  /* EL DUEÑO POR DEFECTO. Quien reporta casi siempre le pasa la acción
     al mismo; escogerlo una por una es donde se pierden las
     asignaciones. Va AQUÍ y no en la pantalla: una acción que entre por
     otro camino —la cola de sin internet— nacería sin dueño y nadie
     sabría por qué unas sí y otras no.
     Si el puesto ya no está activo queda en null en vez de fallar:
     perder el default molesta; no poder reportar para el trabajo. */
  select a.valor::uuid into v_dueno
    from public.acciones_ajustes a
   where a.clave = 'responsable_defecto'
     and a.valor is not null
     and exists (select 1 from public.perfiles p
                  where p.id = a.valor::uuid and p.activo);

  v_cod := 'AC-' || lpad(nextval('public.acciones_codigo_seq')::text, 4, '0');

  insert into public.acciones
    (codigo, tipo, titulo, descripcion, motivo, area, zona, ubicacion,
     lat, lng, precision_m, prioridad, vence_en, estado, reportada_por,
     responsable, asignada_en)
  values
    (v_cod, 'correctiva', btrim(p_titulo),
     nullif(btrim(coalesce(p_descripcion, '')), ''),
     p_motivo, v_area, v_zona,
     nullif(btrim(coalesce(p_ubicacion, '')), ''),
     p_lat, p_lng, p_precision, v_pri, v_vence, 'abierta', auth.uid(),
     v_dueno, case when v_dueno is not null then now() end)
  returning acciones.id into v_id;

  return query select v_id, v_cod, v_vence, v_veces;
end $$;

grant execute on function
  public.accion_reportar(text, text, text, text, text, text, numeric, numeric, numeric)
to authenticated;

-- ---------------------------------------------------------------------
-- PONER EL RESPONSABLE POR DEFECTO
--
-- Solo el administrador: quien mueva esto decide a quién le cae TODO lo
-- que se reporte de aquí en adelante, que es una decisión del centro y
-- no de un turno.
-- ---------------------------------------------------------------------
create or replace function public.accion_responsable_defecto(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Cambiar el responsable por defecto es del administrador';
  end if;

  if p_id is not null
     and not exists (select 1 from public.perfiles
                      where id = p_id and activo) then
    raise exception 'Esa persona no existe o está desactivada';
  end if;

  insert into public.acciones_ajustes (clave, valor)
  values ('responsable_defecto', p_id::text)
  on conflict (clave) do update set valor = excluded.valor;
end $$;

grant execute on function public.accion_responsable_defecto(uuid) to authenticated;

create or replace function public.accion_asignable(p_id uuid, p_recibe boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Cambiar quién recibe acciones es del administrador';
  end if;

  if not exists (select 1 from public.perfiles where id = p_id and activo) then
    raise exception 'Esa persona no existe o está desactivada';
  end if;

  if p_recibe then
    insert into public.acciones_asignables (perfil_id, puesto_por)
    values (p_id, auth.uid())
    on conflict (perfil_id) do nothing;
  else
    /* Sacar al que recibe por defecto dejaría las acciones naciendo
       asignadas a alguien que la lista ya no muestra. */
    if exists (select 1 from public.acciones_ajustes
                where clave = 'responsable_defecto' and valor = p_id::text) then
      raise exception
        'Esa persona es la que recibe las acciones nuevas. Cambia primero el '
        'responsable por defecto y después sácala de la lista.';
    end if;
    delete from public.acciones_asignables where perfil_id = p_id;
  end if;
end $$;

grant execute on function public.accion_asignable(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- ASIGNAR
-- ---------------------------------------------------------------------
drop function if exists public.accion_asignar(uuid, uuid);

create or replace function public.accion_asignar(
  p_id          uuid,
  p_equipo      text,
  p_responsable uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado accion_estado;
begin
  if not public.es_editor() then
    raise exception 'Asignar una acción requiere rol de supervisor o administrador';
  end if;

  select estado into v_estado from public.acciones where id = p_id;
  if not found then raise exception 'Esa acción no existe'; end if;
  if v_estado in ('cerrada', 'verificada', 'anulada') then
    raise exception 'Esa acción ya no está abierta';
  end if;

  /* Se permite dejar sin asignar —los dos en null—: una acción sin dueño
     es visible y molesta, que es mejor que asignársela al primero que
     aparezca para que el tablero se vea limpio. */
  if p_equipo is not null
     and not exists (select 1 from public.acciones_equipos
                      where clave = p_equipo and activo) then
    raise exception 'Ese equipo no existe o está desactivado';
  end if;

  if p_responsable is not null
     and not exists (select 1 from public.perfiles
                      where id = p_responsable and activo) then
    raise exception 'Esa persona no existe o está inactiva';
  end if;

  /* LOS DOS SON OPCIONALES Y NINGUNO MANDA SOBRE EL OTRO.
     La primera versión exigía el equipo antes que la persona, y eso
     bloqueaba el caso más normal que hay: el contratista que YA tiene
     usuario propio y al que se le asigna directo, sin ningún equipo de
     por medio. Una regla que obliga a llenar un campo de más para hacer
     lo de siempre no protege nada: solo estorba.

     El equipo sirve para cuando se le pasa a un OL y todavía no se sabe
     a quién de adentro le va a tocar. Cuando hay persona, con la persona
     alcanza. */

  update public.acciones
     set equipo       = p_equipo,
         responsable  = p_responsable,
         asignada_por = auth.uid(),
         asignada_en  = now()
   where id = p_id;
end $$;

grant execute on function public.accion_asignar(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- CERRAR — decir qué se hizo
--
-- Puede cerrar el responsable o un editor. El texto es obligatorio.
-- Cerrar NO marca la acción como resuelta: la manda a verificación.
-- ---------------------------------------------------------------------
create or replace function public.accion_cerrar(p_id uuid, p_que_se_hizo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resp   uuid;
  v_estado accion_estado;
begin
  select responsable, estado into v_resp, v_estado
    from public.acciones where id = p_id;
  if not found then raise exception 'Esa acción no existe'; end if;

  if not (public.es_editor() or v_resp = auth.uid()) then
    raise exception 'Solo el responsable de la acción o un supervisor puede cerrarla';
  end if;
  if v_estado not in ('abierta', 'reabierta') then
    raise exception 'Esa acción no está abierta';
  end if;
  if btrim(coalesce(p_que_se_hizo, '')) = '' then
    raise exception 'Hay que escribir qué se hizo. Cerrar sin decir qué se hizo no es cerrar';
  end if;

  update public.acciones
     set estado      = 'cerrada',
         que_se_hizo = btrim(p_que_se_hizo),
         cerrada_por = auth.uid(),
         cerrada_en  = now()
   where id = p_id;
end $$;

grant execute on function public.accion_cerrar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- VERIFICAR — ir a mirar si sirvió
--
-- Aquí se decide si la acción cuenta como efectiva. Si no sirvió, la
-- acción REABRE con el mismo código: no se crea una nueva. Así la
-- reincidencia cuenta problemas, no intentos, y el historial de una
-- acción que costó tres intentos se lee en un solo sitio.
-- ---------------------------------------------------------------------
create or replace function public.accion_verificar(
  p_id      uuid,
  p_efectiva boolean,
  p_nota    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado accion_estado;
begin
  if not public.es_editor() then
    raise exception 'Verificar una acción requiere rol de supervisor o administrador';
  end if;

  select estado into v_estado from public.acciones where id = p_id;
  if not found then raise exception 'Esa acción no existe'; end if;
  if v_estado <> 'cerrada' then
    raise exception 'Solo se verifica lo que está cerrado esperando verificación';
  end if;
  if p_efectiva is false and btrim(coalesce(p_nota, '')) = '' then
    raise exception 'Si no fue efectiva hay que decir qué se encontró';
  end if;

  update public.acciones
     set efectiva          = p_efectiva,
         nota_verificacion = nullif(btrim(coalesce(p_nota, '')), ''),
         verificada_por    = auth.uid(),
         verificada_en     = now(),
         /* No sirvió: vuelve a estar viva, con su mismo código y su
            plazo original. El plazo NO se estira: la acción ya está
            vencida o a punto, y esconderlo sería el error que este
            módulo existe para no cometer. */
         estado            = case when p_efectiva then 'verificada'::accion_estado
                                  else 'reabierta'::accion_estado end
   where id = p_id;

  if not p_efectiva then
    insert into public.acciones_hilo (accion_id, texto, escrito_por)
    values (p_id, 'Se verificó y NO fue efectiva: ' || btrim(p_nota), auth.uid());
  end if;
end $$;

grant execute on function public.accion_verificar(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- ABRIR PREVENTIVA — lo que queda cuando la corrección ya no alcanza
--
-- Exige causa raíz y responsable de proceso. Recibe las acciones que la
-- originaron y las deja amarradas, que es lo que después permite
-- contar la historia completa en la reunión.
-- ---------------------------------------------------------------------
create or replace function public.accion_abrir_preventiva(
  p_titulo       text,
  p_motivo       text,
  p_causa_raiz   text,
  p_responsable_proceso uuid,
  p_zona         text default null,
  p_ubicacion    text default null,
  p_origen       uuid[] default null,
  p_prioridad    text default 'alta'
)
returns table (id uuid, codigo text, vence_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area  text;
  v_horas integer;
  v_id    uuid;
  v_cod   text;
  v_vence timestamptz;
  v_zona  text;
begin
  if not public.es_editor() then
    raise exception 'Abrir una preventiva requiere rol de supervisor o administrador';
  end if;
  if btrim(coalesce(p_causa_raiz, '')) = '' then
    raise exception 'Una preventiva sin causa raíz es una correctiva con otro nombre: hay que escribirla';
  end if;
  if p_responsable_proceso is null then
    raise exception 'La preventiva necesita responsable de PROCESO, no de turno';
  end if;

  if p_zona is not null then
    select z.codigo, z.area into v_zona, v_area
      from public.acciones_zonas z where z.codigo = upper(btrim(p_zona)) and z.activo;
  end if;
  if v_area is null then
    select m.area into v_area from public.acciones_motivos m where m.clave = p_motivo;
    v_area := coalesce(v_area, 'seguridad');
  end if;
  if v_zona is null and btrim(coalesce(p_ubicacion, '')) = '' then
    raise exception 'Hay que decir dónde';
  end if;

  select horas into v_horas from public.acciones_plazos
   where prioridad = p_prioridad::accion_prioridad;
  v_vence := now() + make_interval(hours => v_horas);

  v_cod := 'AC-' || lpad(nextval('public.acciones_codigo_seq')::text, 4, '0');

  insert into public.acciones
    (codigo, tipo, titulo, motivo, area, zona, ubicacion, prioridad,
     vence_en, estado, causa_raiz, responsable_proceso, responsable, reportada_por)
  values
    (v_cod, 'preventiva', btrim(p_titulo), p_motivo, v_area, v_zona,
     nullif(btrim(coalesce(p_ubicacion, '')), ''),
     p_prioridad::accion_prioridad, v_vence, 'abierta',
     btrim(p_causa_raiz), p_responsable_proceso, p_responsable_proceso, auth.uid())
  returning acciones.id into v_id;

  if p_origen is not null then
    insert into public.acciones_origen (preventiva_id, accion_id)
    select v_id, o from unnest(p_origen) o
     where exists (select 1 from public.acciones where acciones.id = o)
    on conflict do nothing;
  end if;

  return query select v_id, v_cod, v_vence;
end $$;

grant execute on function
  public.accion_abrir_preventiva(text, text, text, uuid, text, text, uuid[], text)
to authenticated;

-- ---------------------------------------------------------------------
-- ANULAR y COMENTAR
-- ---------------------------------------------------------------------
create or replace function public.accion_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Anular una acción es de administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula';
  end if;
  update public.acciones
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulada_por = auth.uid(), anulada_en = now()
   where id = p_id;
  if not found then raise exception 'Esa acción no existe'; end if;
end $$;

grant execute on function public.accion_anular(uuid, text) to authenticated;

create or replace function public.accion_comentar(p_id uuid, p_texto text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'El comentario viene vacío';
  end if;
  if not exists (select 1 from public.acciones where id = p_id) then
    raise exception 'Esa acción no existe';
  end if;
  insert into public.acciones_hilo (accion_id, texto, escrito_por)
  values (p_id, btrim(p_texto), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.accion_comentar(uuid, text) to authenticated;

-- =====================================================================
-- 10. LAS VISTAS
-- =====================================================================

drop view if exists public.v_acciones_carga;
drop view if exists public.v_acciones_area;
drop view if exists public.v_acciones;

create view public.v_acciones as
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

  /* VIVA = todavía hay algo que hacer. Se calcula una vez aquí y no en
     cada pantalla, porque el día que alguien la calcule distinto en
     una sola pantalla, dos números del mismo módulo dejan de cuadrar. */
  (a.estado in ('abierta', 'reabierta'))         as viva,

  /* VENCIDA. Solo lo vivo puede estar vencido: una acción cerrada el
     día 3 no se vuelve vencida el día 4. */
  (a.estado in ('abierta', 'reabierta') and a.vence_en < now()) as vencida,

  /* Cuántas horas faltan —o sobran, en negativo—. La app decide cómo
     lo dice; aquí solo está el número. */
  round(extract(epoch from (a.vence_en - now())) / 3600.0)::int as horas_restantes,

  /* Cuántos días lleva. Es la cifra que convierte un renglón en un
     problema: "lleva 11 días" se entiende sin leer nada más. */
  case when a.estado in ('verificada', 'anulada')
       then (coalesce(a.verificada_en, a.anulada_en)::date - a.reportada_en::date)
       else (current_date - a.reportada_en::date) end            as dias,

  a.equipo,
  eq.nombre                       as equipo_nombre,
  a.responsable, a.asignada_por, a.asignada_en,
  /* SIN DUEÑO de verdad: ni equipo ni persona. "Easy, sin persona" SÍ
     tiene dueño —el OL responde— y no debe contarse aquí; contarla
     mandaría a alguien a reasignar algo que ya está asignado. */
  (a.equipo is null and a.responsable is null) as sin_dueno,
  a.reportada_por, a.reportada_en,
  a.que_se_hizo, a.cerrada_por, a.cerrada_en,
  a.efectiva, a.nota_verificacion, a.verificada_por, a.verificada_en,

  /* La marca de la regla que no se impone pero se ve: la cerró y la
     verificó la misma persona. No está prohibido —en un turno de tres
     a veces no hay de otra— pero queda escrito. */
  (a.cerrada_por is not null and a.cerrada_por = a.verificada_por) as auto_verificada,

  a.causa_raiz, a.responsable_proceso,
  a.motivo_anulacion, a.anulada_en, a.anulada_por,

  (select count(*) from public.acciones_hilo h where h.accion_id = a.id)   as comentarios,
  (select count(*) from public.acciones_fotos f where f.accion_id = a.id)  as fotos,
  (select count(*) from public.acciones_origen o where o.preventiva_id = a.id) as origenes,

  /* Cuántas veces va este motivo en esta zona. Viaja en la fila para
     que la pantalla pueda avisar ANTES de que alguien abra la cuarta,
     sin una consulta por renglón. */
  case when a.zona is null then 0
       else public.accion_reincidencia(a.motivo, a.zona) end     as veces_aqui
from public.acciones a
join public.acciones_motivos m on m.clave = a.motivo
join public.acciones_areas   ar on ar.clave = a.area
left join public.acciones_zonas z on z.codigo = a.zona
left join public.acciones_plazos p on p.prioridad = a.prioridad
/* left join: un equipo borrado del maestro no puede hacer desaparecer
   la acción de la lista. Se quedaría sin nombre, que es un problema
   mucho menor que perderla de vista. */
left join public.acciones_equipos eq on eq.clave = a.equipo;

grant select on public.v_acciones to authenticated;

-- ---------------------------------------------------------------------
-- LA CARGA DE CADA QUIEN — lo que se mira ANTES de asignar
--
-- Doce acciones en la misma persona no se cierran: se acumulan. Esta
-- vista es la que hace que eso se vea en el momento de asignar y no en
-- la reunión del mes siguiente.
-- ---------------------------------------------------------------------
create view public.v_acciones_carga as
select
  pf.id,
  pf.usuario,
  pf.nombre,
  pf.rol::text                                                        as rol,
  count(*) filter (where a.estado in ('abierta','reabierta'))          as abiertas,
  count(*) filter (where a.estado in ('abierta','reabierta')
                     and a.vence_en < now())                          as vencidas,
  count(*) filter (where a.estado = 'cerrada')                        as por_verificar,
  (count(*) filter (where a.estado in ('abierta','reabierta'))
     >= (select valor::int from public.acciones_parametros
          where clave = 'carga_saturado'))                            as saturado
from public.perfiles pf
left join public.acciones a on a.responsable = pf.id
where pf.activo
  /* Solo los que reciben. Nadie marcado = todos: una lista vacía
     dejaría la pantalla de asignar sin salida. El filtro va EN LA
     VISTA para que no haya una pantalla que se acuerde de filtrar y
     otra que no. */
  and (not exists (select 1 from public.acciones_asignables)
       or exists (select 1 from public.acciones_asignables x
                   where x.perfil_id = pf.id))
group by pf.id, pf.usuario, pf.nombre, pf.rol;

grant select on public.v_acciones_carga to authenticated;

-- ---------------------------------------------------------------------
-- CUMPLIMIENTO POR ÁREA — las barras del tablero
--
-- El porcentaje es EFECTIVAS sobre VERIFICADAS, no cerradas sobre
-- abiertas. Es la diferencia entre medir trabajo y medir resultado: se
-- puede cerrar todo y tener 38% si nada de lo que se hizo sirvió.
-- ---------------------------------------------------------------------
create view public.v_acciones_area as
select
  ar.clave                                                      as area,
  ar.nombre                                                     as area_nombre,
  ar.orden,
  count(a.id) filter (where a.estado <> 'anulada')               as total,
  count(a.id) filter (where a.estado in ('abierta','reabierta')) as abiertas,
  count(a.id) filter (where a.estado in ('abierta','reabierta')
                        and a.vence_en < now())                  as vencidas,
  count(a.id) filter (where a.estado = 'verificada')             as verificadas,
  count(a.id) filter (where a.efectiva)                          as efectivas,
  case when count(a.id) filter (where a.estado = 'verificada') = 0 then null
       else round(100.0 * count(a.id) filter (where a.efectiva)
                        / count(a.id) filter (where a.estado = 'verificada'))
  end                                                            as pct
from public.acciones_areas ar
left join public.acciones a on a.area = ar.clave
where ar.activo
group by ar.clave, ar.nombre, ar.orden;

grant select on public.v_acciones_area to authenticated;

-- =====================================================================
-- 11. RLS — todos leen, escriben los que mandan
--
-- Leer lo puede todo el que entre: una acción vencida en el pasillo 3
-- le importa a media bodega, y esconderla no la resuelve. Escribir pasa
-- por las funciones de arriba, que es donde están las reglas.
-- =====================================================================
alter table public.acciones           enable row level security;
alter table public.acciones_zonas     enable row level security;
alter table public.acciones_areas     enable row level security;
alter table public.acciones_motivos   enable row level security;
alter table public.acciones_fotos     enable row level security;
alter table public.acciones_hilo      enable row level security;
alter table public.acciones_origen    enable row level security;
alter table public.acciones_plazos    enable row level security;
alter table public.acciones_parametros enable row level security;
alter table public.acciones_ajustes enable row level security;

drop policy if exists acciones_ajustes_select on public.acciones_ajustes;
create policy acciones_ajustes_select on public.acciones_ajustes
  for select to authenticated using (true);

drop policy if exists acciones_ajustes_write on public.acciones_ajustes;
create policy acciones_ajustes_write on public.acciones_ajustes
  for all to authenticated
  using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

grant select, insert, update on public.acciones_ajustes to authenticated;

alter table public.acciones_asignables enable row level security;

drop policy if exists acciones_asignables_select on public.acciones_asignables;
create policy acciones_asignables_select on public.acciones_asignables
  for select to authenticated using (true);

drop policy if exists acciones_asignables_write on public.acciones_asignables;
create policy acciones_asignables_write on public.acciones_asignables
  for all to authenticated
  using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

grant select, insert, delete on public.acciones_asignables to authenticated;

do $$
declare t text;
begin
  foreach t in array array['acciones','acciones_zonas','acciones_areas',
                           'acciones_motivos','acciones_fotos','acciones_hilo',
                           'acciones_origen','acciones_plazos','acciones_parametros',
                           'acciones_equipos']
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (true)', t, t);
  end loop;
end $$;

/* Los maestros SÍ se editan directo desde la pantalla de Maestro: son
   datos, no decisiones, y no hay regla que proteger al cambiar el
   nombre de un pasillo. Lo que no se edita directo son las acciones. */
do $$
declare t text;
begin
  foreach t in array array['acciones_zonas','acciones_areas','acciones_motivos',
                           'acciones_plazos','acciones_parametros','acciones_equipos']
  loop
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      'using (public.es_editor()) with check (public.es_editor())', t, t);
  end loop;
end $$;

/* Las fotos las inserta la app después de subir el archivo. Borrarlas
   no: son la evidencia. */
drop policy if exists acciones_fotos_insert on public.acciones_fotos;
create policy acciones_fotos_insert on public.acciones_fotos
  for insert to authenticated with check (public.es_editor());

-- ---------------------------------------------------------------------
-- LOS GRANTS. Van aparte de las políticas y hacen falta los dos.
--
-- Una política de RLS dice QUÉ FILAS puede tocar alguien. El grant dice
-- si puede tocar LA TABLA. Sin grant, la política no se llega a evaluar
-- siquiera: Postgres contesta "permission denied for table" mucho
-- antes. Supabase suele traer grants por omisión en el esquema public y
-- por eso esto se olvida; el día que el proyecto se monte de cero, o que
-- alguien apriete los permisos por defecto, el módulo deja de escribir
-- sin que nadie entienda por qué. Se declaran y no se suponen.
-- ---------------------------------------------------------------------
grant select on public.acciones, public.acciones_fotos, public.acciones_hilo,
                public.acciones_origen
to authenticated;

grant select, insert, update, delete on
  public.acciones_zonas, public.acciones_areas, public.acciones_motivos,
  public.acciones_plazos, public.acciones_parametros, public.acciones_equipos
to authenticated;

grant insert on public.acciones_fotos to authenticated;
grant usage on sequence public.acciones_codigo_seq to authenticated;

-- ---------------------------------------------------------------------
-- El bucket de las fotos. Privado, como el de T1 / T2: una foto de un
-- hallazgo de seguridad no puede quedar en una URL que adivine
-- cualquiera. La app las sirve con URL firmada de rato corto.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('acciones', 'acciones', false, 15728640,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = 15728640,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists acciones_fotos_ver on storage.objects;
create policy acciones_fotos_ver on storage.objects
  for select to authenticated using (bucket_id = 'acciones');

drop policy if exists acciones_fotos_subir on storage.objects;
create policy acciones_fotos_subir on storage.objects
  for insert to authenticated with check (bucket_id = 'acciones' and public.es_editor());

drop policy if exists acciones_fotos_borrar on storage.objects;
create policy acciones_fotos_borrar on storage.objects
  for delete to authenticated using (bucket_id = 'acciones' and public.mi_rol() = 'admin');

-- ---------------------------------------------------------------------
-- Los permisos de las pantallas, para los roles que ya existen.
-- Se agregan sin pisar lo que alguien haya ajustado en /admin/roles.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.rol_permisos') is not null then
    insert into public.rol_permisos (rol, seccion, nivel)
    select r.clave, s.ruta,
           (case when r.clave in ('admin', 'supervisor') then 'editar' else 'ver' end)
             ::public.nivel_permiso
      from public.roles r
      cross join (values
        ('/acciones'),
        ('/acciones/mias'),
        ('/acciones/verificar'),
        ('/acciones/tablero'),
        ('/acciones/analisis'),
        ('/acciones/maestro')) as s(ruta)
    on conflict (rol, seccion) do nothing;
  end if;
end $$;

-- =====================================================================
-- 12. COMPROBACIÓN. Todas tienen que decir 'ok'.
-- =====================================================================
do $$
declare
  v_tablas integer;
  v_func   integer;
  v_zonas  integer;
  v_mot    integer;
  v_plazos integer;
  v_vistas integer;
  v_bucket boolean;
begin
  select count(*) into v_tablas from information_schema.tables
   where table_schema = 'public'
     and table_name in ('acciones','acciones_zonas','acciones_areas','acciones_motivos',
                        'acciones_fotos','acciones_hilo','acciones_origen',
                        'acciones_plazos','acciones_parametros','acciones_equipos');

  select count(*) into v_func from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('accion_reportar','accion_asignar','accion_cerrar',
                       'accion_verificar','accion_abrir_preventiva','accion_anular',
                       'accion_comentar','accion_reincidencia');

  select count(*) into v_zonas  from public.acciones_zonas;
  select count(*) into v_mot    from public.acciones_motivos;
  select count(*) into v_plazos from public.acciones_plazos;

  select count(*) into v_vistas from information_schema.views
   where table_schema = 'public'
     and table_name in ('v_acciones','v_acciones_carga','v_acciones_area');

  select exists (select 1 from storage.buckets where id = 'acciones') into v_bucket;

  raise notice 'las nueve tablas ......... %', case when v_tablas = 9 then 'ok' else 'MAL (' || v_tablas || ')' end;
  raise notice 'las ocho funciones ....... %', case when v_func  >= 8 then 'ok' else 'MAL (' || v_func || ')' end;
  raise notice 'las tres vistas .......... %', case when v_vistas = 3 then 'ok' else 'MAL (' || v_vistas || ')' end;
  raise notice 'zonas sembradas .......... % (%)', case when v_zonas  > 0 then 'ok' else 'MAL' end, v_zonas;
  raise notice 'motivos sembrados ........ % (%)', case when v_mot    > 0 then 'ok' else 'MAL' end, v_mot;
  raise notice 'plazos por prioridad ..... % (%)', case when v_plazos = 3 then 'ok' else 'MAL' end, v_plazos;
  raise notice 'bucket de fotos .......... %', case when v_bucket then 'ok' else 'MAL' end;
end $$;
