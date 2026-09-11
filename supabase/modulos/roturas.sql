-- =====================================================================
-- CONTROL · ROTURAS
--
-- Correr DESPUÉS de 00-nucleo.sql, 01-perfil.sql, 02-roles.sql y
-- 03-usuarios.sql. Es idempotente: se puede correr las veces que sea.
--
-- TODO LO QUE SE ROMPE EN LA BODEGA, desde que el operario lo levanta
-- del piso hasta que el vidrio sale por la puerta con las tres firmas.
--
--   01 SE RECOGE    Summar o Easy la levanta del piso
--   02 SE REGISTRA  unidades, proceso y causa, desde el celular
--   03 ABI DECIDE   cuenta o no cuenta
--   04 SE PESA      vidrio en tolvas, bruto menos tara
--   05 SALE         supervisora, verificador y validación
--
-- SON DOS SUBMÓDULOS QUE MIDEN COSAS DISTINTAS Y NO SE MEZCLAN:
--
--   EN SITIO   cuenta UNIDADES, por causa y por proceso. Contesta
--              "¿de quién fue y de dónde salió?".
--   SALIDA     pesa KILOS de vidrio en tolvas. Contesta "¿cuánto vidrio
--              salió por la puerta?".
--
-- Y NO SE CUADRAN ENTRE SÍ, a propósito. Son dos verdades distintas de
-- la misma bodega: una botella rota de 330 ml y una de 750 pesan
-- distinto, el vidrio se acumula días antes de salir, y parte de lo que
-- se pesa nunca se contó en sitio. El día que alguien "cuadre" las dos,
-- va a estar inventando un factor de conversión — y ese número no existe.
-- Por eso no hay ni una sola consulta aquí que sume unidades con kilos.
--
-- LAS OTRAS CUATRO REGLAS QUE EL SOFTWARE IMPONE:
--
--   1. LA TARA VIVE EN UN MAESTRO. Los 111 kg no se teclean en cada
--      salida. Pero se COPIAN a la línea al pesar: si mañana entra una
--      tolva de otro modelo y se cambia el maestro, las salidas viejas
--      siguen mostrando la tara con la que de verdad se pesaron.
--
--   2. LA FOTO SE EXIGE ANTES DE ENVIAR, no al revisar. Una causa "no
--      asumida" dice que la rotura no fue del OL, y eso hay que
--      probarlo en el momento y en el sitio. Pedirla después es pedirle
--      a alguien que vuelva a un pasillo donde ya no está el vidrio.
--
--   3. QUIEN DIGITA NO VERIFICA. Supervisora, verificador y validación
--      son tres personas y tres momentos. La base rechaza que la misma
--      persona ponga dos de las tres firmas.
--
--   4. EL PRODUCTO TERMINADO SE ABRE EN DOS. Unidades del empaque y
--      unidades de botella rota adentro. Si solo se contara el empaque,
--      el vidrio que va dentro del líquido se perdería del conteo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LOS TIPOS
-- ---------------------------------------------------------------------
do $$ begin
  create type rotura_tipo as enum ('producto_terminado', 'eer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vidrio_color as enum ('ambar', 'flint', 'green');
exception when duplicate_object then null; end $$;

/* El grupo de la causa. Es la línea que parte el módulo en dos:
     asumida     el OL reconoce que fue suya. No necesita evidencia.
     no_asumida  se está diciendo que NO fue del OL. Exige foto. */
do $$ begin
  create type causa_grupo as enum ('asumida', 'no_asumida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rotura_estado as enum ('esperando', 'cuenta', 'no_cuenta', 'anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type salida_estado as enum ('abierta', 'cerrada', 'anulada');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. LOS MAESTROS
-- ---------------------------------------------------------------------

/* EL MATERIAL. Maestro propio y no el de T1 / T2: aquel es el catálogo
   del envase retornable que VIAJA en sider, y aquí hace falta producto
   terminado y el color del vidrio, que allá no existen. */
create table if not exists public.roturas_materiales (
  clave     text primary key,
  nombre    text not null,
  tipo      rotura_tipo not null,
  /* Solo en EER: el vidrio se separa por color porque se vende por
     color. En producto terminado va nulo. */
  color     vidrio_color,
  /* Cuántas botellas trae un empaque. Es lo que permite proponer las
     botellas rotas de adentro cuando se rompe producto terminado; se
     puede corregir a mano, porque un empaque roto rara vez pierde todas
     sus botellas. */
  botellas_x_empaque smallint,
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now(),
  constraint roturas_mat_color check (
    (tipo = 'eer' and color is not null) or (tipo = 'producto_terminado'))
);

insert into public.roturas_materiales (clave, nombre, tipo, color, botellas_x_empaque, orden) values
  ('EER-AMBAR',  'Envase retornable ámbar',  'eer', 'ambar', null, 1),
  ('EER-FLINT',  'Envase retornable flint',  'eer', 'flint', null, 2),
  ('EER-GREEN',  'Envase retornable green',  'eer', 'green', null, 3),
  ('PT-COST-175','Envase Costeña 175R',      'producto_terminado', null, 30, 10),
  ('PT-COST-330','Cerveza Costeña 330 ml',   'producto_terminado', null, 30, 11),
  ('PT-MARR-330','Envase Marrón 330R',       'producto_terminado', null, 30, 12),
  ('PT-FLINT-250','Envase Flint 250',        'producto_terminado', null, 30, 13)
-- Semilla, no verdad: se edita desde la app y re-correr el archivo no
-- pisa lo que alguien haya corregido.
on conflict (clave) do nothing;

/* DE QUÉ PROCESO VIENE. La rotura se le carga a un proceso, y por eso
   es lista cerrada: "T1" escrito de cuatro maneras son cuatro procesos
   distintos en el informe del mes. */
create table if not exists public.roturas_procesos (
  clave     text primary key,
  nombre    text not null,
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now()
);

insert into public.roturas_procesos (clave, nombre, orden) values
  ('lineas',         'Líneas',          1),
  ('t1',             'T1',              2),
  ('traspaso',       'Traspaso',        3),
  ('maquila',        'Maquila',         4),
  ('sorting',        'Sorting',         5),
  ('sin_identificar','Sin identificar', 6),
  ('otro',           'Otro',            9)
on conflict (clave) do nothing;

/* LA CAUSA, y su grupo. "exige_foto" va POR CAUSA y no quemado en el
   código: hoy todas las no asumidas la exigen, y el día que aparezca
   una asumida que también deba probarse —o una no asumida obvia que
   no—, se cambia el maestro y no el programa. */
create table if not exists public.roturas_causas (
  clave      text primary key,
  nombre     text not null,
  grupo      causa_grupo not null,
  exige_foto boolean not null default false,
  activo     boolean not null default true,
  orden      smallint,
  creado_en  timestamptz not null default now()
);

insert into public.roturas_causas (clave, nombre, grupo, exige_foto, orden) values
  ('mal_estibado',    'Mal estibado',                     'asumida',    false, 1),
  ('caida_cargue',    'Caída en el cargue',               'asumida',    false, 2),
  ('manipulacion',    'Manipulación',                     'asumida',    false, 3),
  ('montacargas',     'Golpe de montacargas',             'asumida',    false, 4),
  ('apilado',         'Apilado por encima de lo permitido','asumida',   false, 5),
  ('falla_maquina',   'Falla de máquina',                 'no_asumida', true, 10),
  ('llego_roto',      'Llegó roto de planta',             'no_asumida', true, 11),
  ('mal_despacho',    'Mal despacho del origen',          'no_asumida', true, 12),
  ('dano_transporte', 'Daño en el transporte',            'no_asumida', true, 13),
  ('empaque_malo',    'Empaque en mal estado',            'no_asumida', true, 14)
on conflict (clave) do nothing;

/* LAS TOLVAS. La tara vive aquí y no en la cabeza de nadie. */
create table if not exists public.roturas_tolvas (
  codigo    text primary key,
  modelo    text not null,
  tara_kg   numeric(10,2) not null check (tara_kg > 0),
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now()
);

insert into public.roturas_tolvas (codigo, modelo, tara_kg, orden) values
  ('TOLVA-1', 'Tolva estándar', 111, 1),
  ('TOLVA-2', 'Tolva estándar', 111, 2),
  ('TOLVA-3', 'Tolva estándar', 111, 3),
  ('TOLVA-4', 'Tolva estándar', 111, 4)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- 3. LOS ROLES DE LA CADENA
--
-- ABI da el visto bueno; el verificador y quien valida firman la
-- salida. Van como ROLES y no como personas nombradas: el día que la
-- persona esté incapacitada o de vacaciones, la salida no se puede
-- quedar parada esperando a que alguien entre al maestro a cambiarle el
-- nombre. Se le pone el rol a otra persona y sigue.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.roles') is not null then
    insert into public.roles (clave, nombre, descripcion, manda, sistema, orden) values
      ('abi',         'ABI',          'Da el visto bueno de las roturas: decide qué cuenta.', false, false, 10),
      ('verificador', 'Verificador',  'Verifica el peso de la salida de vidrio.',             false, false, 11),
      ('validador',   'Validación',   'Da el aval final para que la salida de vidrio salga.',  false, false, 12)
    on conflict (clave) do nothing;
  end if;
end $$;

/* ¿Esta persona puede poner ESTA firma?
     El administrador siempre, porque si no, un domingo sin nadie más la
     bodega se queda parada. Pero queda escrito quién firmó, así que
     "siempre puede" no es lo mismo que "nadie se entera". */
create or replace function public.rotura_puede(p_papel text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_papel
    when 'visto_bueno' then public.mi_rol() in ('admin', 'abi')
    when 'supervisora' then public.mi_rol() in ('admin', 'supervisor')
    when 'verificador' then public.mi_rol() in ('admin', 'verificador')
    when 'validador'   then public.mi_rol() in ('admin', 'validador')
    else false
  end
$$;

grant execute on function public.rotura_puede(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. LAS ROTURAS — el submódulo EN SITIO, que cuenta UNIDADES
-- ---------------------------------------------------------------------
create sequence if not exists public.roturas_codigo_seq;

create table if not exists public.roturas (
  id         uuid primary key default gen_random_uuid(),
  codigo     text unique not null,

  material   text not null references public.roturas_materiales(clave),
  /* Tipo y color se COPIAN del maestro al registrar. No es redundancia:
     el maestro se puede editar, y una rotura de hace tres meses tiene
     que seguir diciendo de qué color era el vidrio que se rompió ese
     día, no de qué color quedó el material después. */
  tipo       rotura_tipo not null,
  color      vidrio_color,

  /* LAS DOS CIFRAS DEL PRODUCTO TERMINADO. En EER solo hay unidades. */
  unidades   integer not null check (unidades > 0),
  botellas   integer check (botellas is null or botellas >= 0),

  proceso    text not null references public.roturas_procesos(clave),
  causa      text not null references public.roturas_causas(clave),
  /* El grupo se copia también, por lo mismo: si mañana una causa cambia
     de grupo, lo que ya se decidió no se puede reinterpretar solo. */
  grupo      causa_grupo not null,

  descripcion text,

  lat         numeric(10,7),
  lng         numeric(10,7),
  precision_m numeric(8,2),

  estado     rotura_estado not null default 'esperando',

  reportada_por uuid references public.perfiles(id) on delete set null,
  reportada_en  timestamptz not null default now(),

  /* EL VISTO BUENO DE ABI. */
  decidida_por  uuid references public.perfiles(id) on delete set null,
  decidida_en   timestamptz,
  nota_decision text,

  anulada_por   uuid references public.perfiles(id) on delete set null,
  anulada_en    timestamptz,
  motivo_anulacion text,

  creado_en  timestamptz not null default now(),

  /* Las botellas de adentro solo existen en producto terminado, y ahí
     no pueden ser más que las del empaque completo — pero eso último no
     se puede comprobar aquí sin leer el maestro, así que lo comprueba
     la función al registrar. */
  constraint roturas_botellas_solo_pt
    check (tipo = 'producto_terminado' or botellas is null),
  constraint roturas_anulada_con_motivo
    check (estado <> 'anulada' or btrim(coalesce(motivo_anulacion, '')) <> '')
);

create index if not exists roturas_estado_idx  on public.roturas (estado, reportada_en desc);
create index if not exists roturas_proceso_idx on public.roturas (proceso, reportada_en desc);
create index if not exists roturas_causa_idx   on public.roturas (causa, reportada_en desc);
create index if not exists roturas_esperando_idx on public.roturas (reportada_en)
  where estado = 'esperando';

create table if not exists public.roturas_fotos (
  id          uuid primary key default gen_random_uuid(),
  rotura_id   uuid not null references public.roturas(id) on delete cascade,
  ruta        text not null,
  bytes       integer,
  ancho       integer,
  alto        integer,
  /* La hora y el lugar DE LA FOTO, no de la fila: entre tomarla y
     subirla pueden pasar veinte minutos sin señal en un pasillo. */
  tomada_en   timestamptz,
  lat         numeric(10,7),
  lng         numeric(10,7),
  precision_m numeric(8,2),
  subida_por  uuid references public.perfiles(id) on delete set null,
  subida_en   timestamptz not null default now()
);

create index if not exists roturas_fotos_idx on public.roturas_fotos (rotura_id);

-- ---------------------------------------------------------------------
-- 5. LAS SALIDAS — el submódulo SALIDA, que pesa KILOS
-- ---------------------------------------------------------------------
create sequence if not exists public.roturas_salida_seq;

/* DE "FACTURADOR" A "VALIDACIÓN".
   La primera versión llamó a la tercera firma "facturador". Pero lo que
   esa persona hace no es facturar: es dar el aval para que el camión
   salga. Se renombra aquí, de forma idempotente, para que quien ya haya
   corrido la versión anterior no pierda las salidas que tenga. Renombrar
   una columna conserva sus restricciones y sus datos; borrar y volver a
   crear los perdería. */
do $$
begin
  if to_regclass('public.roturas_salidas') is not null then
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'roturas_salidas'
                  and column_name = 'facturador_por') then
      alter table public.roturas_salidas rename column facturador_por to validador_por;
      alter table public.roturas_salidas rename column facturador_en  to validador_en;
    end if;
  end if;

  if to_regclass('public.roles') is not null then
    -- La vista vieja la lee; se quita antes de tocar las columnas.
    update public.roles set clave = 'validador', nombre = 'Validación',
           descripcion = 'Da el aval final para que la salida de vidrio salga.'
     where clave = 'facturador'
       and not exists (select 1 from public.roles where clave = 'validador');
  end if;

  if to_regclass('public.perfiles') is not null then
    update public.perfiles set rol = 'validador' where rol = 'facturador';
  end if;
end $$;

create table if not exists public.roturas_salidas (
  id       uuid primary key default gen_random_uuid(),
  codigo   text unique not null,
  estado   salida_estado not null default 'abierta',

  /* LA PLACA DEL CAMIÓN. Campo propio y no una frase dentro de la
     observación: es la identidad de la salida. El día que Peldar
     reclame por una carga, o que haya que cruzar lo que salió con la
     portería, se busca por placa; y un texto libre donde alguien
     escribió "camion de peldar placa xxx000" no se puede buscar.
     Se guarda en mayúsculas y sin espacios, como en T1 / T2, para que
     "abc123", "ABC 123" y "ABC-123" sean el mismo camión y no tres. */
  placa    text,

  observacion text,

  creada_por uuid references public.perfiles(id) on delete set null,
  creada_en  timestamptz not null default now(),

  /* LAS TRES FIRMAS, en cadena. Cada una guarda quién y cuándo: una
     firma sin hora no dice si se firmó antes o después de pesar. */
  supervisora_por uuid references public.perfiles(id) on delete set null,
  supervisora_en  timestamptz,
  verificador_por uuid references public.perfiles(id) on delete set null,
  verificador_en  timestamptz,
  validador_por  uuid references public.perfiles(id) on delete set null,
  validador_en   timestamptz,

  anulada_por uuid references public.perfiles(id) on delete set null,
  anulada_en  timestamptz,
  motivo_anulacion text,

  constraint salida_anulada_con_motivo
    check (estado <> 'anulada' or btrim(coalesce(motivo_anulacion, '')) <> ''),

  /* QUIEN DIGITA NO VERIFICA. Tres personas distintas, y lo dice la
     tabla y no una pantalla: una restricción que vive en la base no se
     puede saltar entrando por otro lado. */
  constraint salida_tres_personas check (
    (supervisora_por is null or verificador_por is null or supervisora_por <> verificador_por)
    and (supervisora_por is null or validador_por is null or supervisora_por <> validador_por)
    and (verificador_por is null or validador_por is null or verificador_por <> validador_por)
  )
);

create index if not exists roturas_salidas_idx on public.roturas_salidas (estado, creada_en desc);

/* LA PLACA, para quien ya tenía la tabla de antes. Se agrega vacía, se
   rellenan las salidas viejas con un marcador que se ve a la legua
   —'SIN PLACA' es buscable; una cadena vacía se confunde con un error de
   la app— y recién ahí se exige. Hacerlo al revés dejaría la migración
   trancada en la primera salida sin placa. */
alter table public.roturas_salidas add column if not exists placa text;
update public.roturas_salidas set placa = 'SIN PLACA'
 where placa is null or btrim(placa) = '';
alter table public.roturas_salidas alter column placa set not null;

create index if not exists roturas_salidas_placa_idx
  on public.roturas_salidas (upper(placa));

/* UNA TOLVA PESADA. El neto se CALCULA, no se guarda: un neto guardado
   puede quedar desfasado de su bruto y su tara el día que alguien
   corrija uno de los dos, y entonces la salida diría un total que no
   sale de sus propias partes. */
create table if not exists public.roturas_salida_tolvas (
  id        uuid primary key default gen_random_uuid(),
  salida_id uuid not null references public.roturas_salidas(id) on delete cascade,
  tolva     text not null references public.roturas_tolvas(codigo),
  color     vidrio_color not null,

  bruto_kg  numeric(10,2) not null check (bruto_kg > 0),
  /* LA TARA SE COPIA AL PESAR. Vive en el maestro para no teclearla,
     pero se guarda aquí para que el día que entre una tolva de otro
     modelo y se cambie el maestro, esta salida siga diciendo con qué
     tara se pesó de verdad. */
  tara_kg   numeric(10,2) not null check (tara_kg > 0),

  pesada_por uuid references public.perfiles(id) on delete set null,
  pesada_en  timestamptz not null default now(),

  /* El bruto tiene que ser mayor que la tara: si no, el neto sale
     negativo y eso no es una salida, es un error de dedo en la
     báscula. */
  constraint tolva_bruto_mayor check (bruto_kg > tara_kg)
);

create index if not exists roturas_salida_tolvas_idx
  on public.roturas_salida_tolvas (salida_id);

-- =====================================================================
-- 6. LAS FUNCIONES
-- =====================================================================

-- ---------------------------------------------------------------------
-- REGISTRAR una rotura, desde el celular.
--
-- Devuelve el código y si esa causa exige foto, para que la pantalla
-- sepa antes de dejar enviar. La foto se sube DESPUÉS, con el id, así
-- que la exigencia se comprueba también en la decisión de ABI: una no
-- asumida sin foto no se puede marcar "cuenta".
-- ---------------------------------------------------------------------
drop function if exists public.rotura_registrar(text, integer, integer, text, text, text, numeric, numeric, numeric);

create or replace function public.rotura_registrar(
  p_material    text,
  p_unidades    integer,
  p_botellas    integer default null,
  p_proceso     text default null,
  p_causa       text default null,
  p_descripcion text default null,
  p_lat         numeric default null,
  p_lng         numeric default null,
  p_precision   numeric default null
)
returns table (id uuid, codigo text, exige_foto boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo  rotura_tipo;
  v_color vidrio_color;
  v_bxe   smallint;
  v_grupo causa_grupo;
  v_foto  boolean;
  v_id    uuid;
  v_cod   text;
begin
  if not public.es_editor() then
    raise exception 'Registrar una rotura requiere rol de supervisor o administrador';
  end if;

  select m.tipo, m.color, m.botellas_x_empaque into v_tipo, v_color, v_bxe
    from public.roturas_materiales m where m.clave = p_material and m.activo;
  if not found then
    raise exception 'Ese material no existe o está desactivado';
  end if;

  if p_unidades is null or p_unidades <= 0 then
    raise exception 'Hay que decir cuántas unidades se rompieron';
  end if;

  if not exists (select 1 from public.roturas_procesos where clave = p_proceso and activo) then
    raise exception 'Ese proceso no existe o está desactivado';
  end if;

  select c.grupo, c.exige_foto into v_grupo, v_foto
    from public.roturas_causas c where c.clave = p_causa and c.activo;
  if not found then
    raise exception 'Esa causa no existe o está desactivada';
  end if;

  /* EL PRODUCTO TERMINADO SE ABRE EN DOS. Si no se dice cuántas
     botellas se rompieron adentro, se propone el empaque completo: es
     lo más probable cuando una estiba se cae, y la pantalla lo deja
     corregir. En EER no hay botellas que separar. */
  if v_tipo = 'producto_terminado' then
    p_botellas := coalesce(p_botellas, p_unidades * coalesce(v_bxe, 0));
    if v_bxe is not null and p_botellas > p_unidades * v_bxe then
      raise exception 'No pueden romperse más botellas (%) que las que caben en % empaques (%)',
        p_botellas, p_unidades, p_unidades * v_bxe;
    end if;
  else
    p_botellas := null;
  end if;

  v_cod := 'RB-' || lpad(nextval('public.roturas_codigo_seq')::text, 4, '0');

  insert into public.roturas
    (codigo, material, tipo, color, unidades, botellas, proceso, causa, grupo,
     descripcion, lat, lng, precision_m, estado, reportada_por)
  values
    (v_cod, p_material, v_tipo, v_color, p_unidades, p_botellas, p_proceso, p_causa, v_grupo,
     nullif(btrim(coalesce(p_descripcion, '')), ''),
     p_lat, p_lng, p_precision, 'esperando', auth.uid())
  returning roturas.id into v_id;

  return query select v_id, v_cod, v_foto;
end $$;

grant execute on function
  public.rotura_registrar(text, integer, integer, text, text, text, numeric, numeric, numeric)
to authenticated;

-- ---------------------------------------------------------------------
-- EL VISTO BUENO DE ABI: cuenta o no cuenta.
--
-- Dos botones y nada más. Lo único que la base agrega es que una causa
-- que exige foto no se puede marcar "cuenta" sin foto: es exactamente
-- lo que ABI devolvería, y devolverlo aquí ahorra el viaje.
-- ---------------------------------------------------------------------
create or replace function public.rotura_visto_bueno(
  p_id    uuid,
  p_cuenta boolean,
  p_nota  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado rotura_estado;
  v_causa  text;
  v_foto   boolean;
  v_tiene  boolean;
begin
  if not public.rotura_puede('visto_bueno') then
    raise exception 'El visto bueno de las roturas es de ABI';
  end if;

  select r.estado, r.causa into v_estado, v_causa from public.roturas r where r.id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if v_estado <> 'esperando' then
    raise exception 'Esa rotura ya fue decidida';
  end if;

  select c.exige_foto into v_foto from public.roturas_causas c where c.clave = v_causa;
  select exists (select 1 from public.roturas_fotos f where f.rotura_id = p_id) into v_tiene;

  if p_cuenta and v_foto and not v_tiene then
    raise exception
      'Esta causa exige foto y la rotura no tiene: es la que sostiene que la rotura no fue del OL';
  end if;

  if not p_cuenta and btrim(coalesce(p_nota, '')) = '' then
    raise exception 'Si no cuenta, hay que decir por qué';
  end if;

  update public.roturas
     set estado = case when p_cuenta then 'cuenta'::rotura_estado
                       else 'no_cuenta'::rotura_estado end,
         nota_decision = nullif(btrim(coalesce(p_nota, '')), ''),
         decidida_por = auth.uid(),
         decidida_en  = now()
   where id = p_id;
end $$;

grant execute on function public.rotura_visto_bueno(uuid, boolean, text) to authenticated;

create or replace function public.rotura_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Anular una rotura es de administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula';
  end if;
  update public.roturas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulada_por = auth.uid(), anulada_en = now()
   where id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
end $$;

grant execute on function public.rotura_anular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- LA SALIDA: abrir, pesar tolva por tolva, y las tres firmas.
-- ---------------------------------------------------------------------
/* La firma vieja recibía solo la observación. Se quita para que no
   queden las dos: con las dos, una pantalla sin actualizar seguiría
   abriendo salidas sin placa y nadie se enteraría. */
drop function if exists public.salida_abrir(text);

create or replace function public.salida_abrir(
  p_placa       text,
  p_observacion text default null
)
returns table (id uuid, codigo text, placa text)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_cod text; v_placa text;
begin
  if not public.rotura_puede('supervisora') then
    raise exception 'Abrir una salida de vidrio es de la supervisora de líneas';
  end if;

  /* Se normaliza AQUÍ y no en la pantalla: la pantalla es una de las
     formas de entrar, no la única. Fuera van los espacios y los guiones,
     de modo que "abc 123", "ABC-123" y "abc123" terminen siendo la misma
     placa y el informe del mes no cuente tres camiones donde hubo uno. */
  v_placa := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));

  if length(v_placa) < 5 then
    raise exception 'Falta la placa del camión. Es lo que amarra el vidrio al vehículo que se lo llevó';
  end if;

  v_cod := 'SR-' || lpad(nextval('public.roturas_salida_seq')::text, 4, '0');
  insert into public.roturas_salidas (codigo, placa, observacion, creada_por)
  values (v_cod, v_placa, nullif(btrim(coalesce(p_observacion, '')), ''), auth.uid())
  returning roturas_salidas.id into v_id;

  return query select v_id, v_cod, v_placa;
end $$;

grant execute on function public.salida_abrir(text, text) to authenticated;

/* PESAR UNA TOLVA. La tara la trae la función del maestro: no se
   recibe del navegador, que es lo que la hace imposible de negociar. */
create or replace function public.salida_pesar(
  p_salida uuid,
  p_tolva  text,
  p_color  text,
  p_bruto  numeric
)
returns table (id uuid, tara_kg numeric, neto_kg numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado salida_estado;
  v_tara   numeric(10,2);
  v_id     uuid;
begin
  if not public.rotura_puede('supervisora') then
    raise exception 'Pesar una tolva es de la supervisora de líneas';
  end if;

  /* s.id y no id a secas: esta función DEVUELVE una columna llamada
     "id", y dentro del cuerpo ese nombre le hace sombra al de la tabla.
     Postgres no adivina —contesta "column reference id is ambiguous"— y
     la función entera deja de servir. Se califica con el alias. */
  select s.estado into v_estado from public.roturas_salidas s where s.id = p_salida;
  if not found then raise exception 'Esa salida no existe'; end if;
  if v_estado <> 'abierta' then
    raise exception 'Esa salida ya está cerrada: no se le pueden agregar tolvas';
  end if;

  select tt.tara_kg into v_tara from public.roturas_tolvas tt
   where tt.codigo = p_tolva and tt.activo;
  if not found then raise exception 'Esa tolva no existe o está desactivada'; end if;

  if p_bruto is null or p_bruto <= v_tara then
    raise exception 'El bruto (% kg) tiene que ser mayor que la tara (% kg): revisa la báscula',
      coalesce(p_bruto, 0), v_tara;
  end if;

  insert into public.roturas_salida_tolvas
    (salida_id, tolva, color, bruto_kg, tara_kg, pesada_por)
  values (p_salida, p_tolva, p_color::vidrio_color, p_bruto, v_tara, auth.uid())
  returning roturas_salida_tolvas.id into v_id;

  return query select v_id, v_tara, (p_bruto - v_tara);
end $$;

grant execute on function public.salida_pesar(uuid, text, text, numeric) to authenticated;

create or replace function public.salida_quitar_tolva(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado salida_estado;
begin
  if not public.rotura_puede('supervisora') then
    raise exception 'Quitar una tolva es de la supervisora de líneas';
  end if;
  select s.estado into v_estado
    from public.roturas_salida_tolvas t
    join public.roturas_salidas s on s.id = t.salida_id
   where t.id = p_id;
  if not found then raise exception 'Esa tolva no está en ninguna salida'; end if;
  if v_estado <> 'abierta' then
    raise exception 'Esa salida ya está cerrada';
  end if;
  delete from public.roturas_salida_tolvas where id = p_id;
end $$;

grant execute on function public.salida_quitar_tolva(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- FIRMAR. Las tres, en cadena y en orden: no se puede verificar lo que
-- la supervisora todavía no cerró, ni facturar lo que nadie verificó.
--
-- Y NADIE FIRMA DOS VECES. La restricción de la tabla ya lo impide, pero
-- se comprueba aquí también para poder decirlo con palabras: el error de
-- una restricción dice "viola salida_tres_personas" y no le explica nada
-- a quien está de pie frente a la báscula.
-- ---------------------------------------------------------------------
create or replace function public.salida_firmar(p_salida uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.roturas_salidas%rowtype;
  v_tolvas integer;
begin
  select * into s from public.roturas_salidas where id = p_salida;
  if not found then raise exception 'Esa salida no existe'; end if;
  if s.estado = 'anulada' then raise exception 'Esa salida está anulada'; end if;

  if not public.rotura_puede(p_papel) then
    raise exception 'No tienes el rol para poner la firma de %', p_papel;
  end if;

  if p_papel = 'supervisora' then
    select count(*) into v_tolvas
      from public.roturas_salida_tolvas where salida_id = p_salida;
    if v_tolvas = 0 then
      raise exception 'Una salida sin tolvas pesadas no se puede firmar';
    end if;
    if s.supervisora_en is not null then raise exception 'Ya está firmada por la supervisora'; end if;
    update public.roturas_salidas
       set supervisora_por = auth.uid(), supervisora_en = now(), estado = 'cerrada'
     where id = p_salida;

  elsif p_papel = 'verificador' then
    if s.supervisora_en is null then
      raise exception 'Todavía no la ha firmado la supervisora: no hay qué verificar';
    end if;
    if s.supervisora_por = auth.uid() then
      raise exception 'Quien pesó no verifica: la firma del verificador es de otra persona';
    end if;
    if s.verificador_en is not null then raise exception 'Ya está verificada'; end if;
    update public.roturas_salidas
       set verificador_por = auth.uid(), verificador_en = now() where id = p_salida;

  elsif p_papel = 'validador' then
    if s.verificador_en is null then
      raise exception 'Todavía no la ha verificado nadie: no se puede dar salida';
    end if;
    if s.supervisora_por = auth.uid() or s.verificador_por = auth.uid() then
      raise exception 'Son tres personas y tres momentos: quien pesó o verificó no valida';
    end if;
    if s.validador_en is not null then raise exception 'Ya está validada'; end if;
    update public.roturas_salidas
       set validador_por = auth.uid(), validador_en = now() where id = p_salida;

  else
    raise exception 'Firma desconocida: %', p_papel;
  end if;
end $$;

grant execute on function public.salida_firmar(uuid, text) to authenticated;

create or replace function public.salida_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Anular una salida es de administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula';
  end if;
  update public.roturas_salidas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulada_por = auth.uid(), anulada_en = now()
   where id = p_id;
  if not found then raise exception 'Esa salida no existe'; end if;
end $$;

grant execute on function public.salida_anular(uuid, text) to authenticated;

-- =====================================================================
-- 7. LAS VISTAS
-- =====================================================================

drop view if exists public.v_roturas_salidas;
drop view if exists public.v_roturas;

create view public.v_roturas as
select
  r.id,
  r.codigo,
  r.material,
  m.nombre                       as material_nombre,
  r.tipo::text                   as tipo,
  r.color::text                  as color,
  r.unidades,
  r.botellas,
  /* LO QUE SE ROMPIÓ, EN UNA CIFRA COMPARABLE. En producto terminado
     son las botellas de adentro; en EER son las unidades. Es la única
     manera de sumar dos cosas que se cuentan distinto sin inventar un
     factor: no se convierte nada, se elige cuál de las dos cifras es
     "vidrio roto" en cada caso. */
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
  (select count(*) from public.roturas_fotos f where f.rotura_id = r.id) as fotos,
  /* La que ABI va a devolver: exige foto y no la tiene. Se calcula aquí
     para que la bandeja lo pueda mostrar ANTES de que alguien la abra. */
  (c.exige_foto and not exists (select 1 from public.roturas_fotos f where f.rotura_id = r.id))
                                 as le_falta_foto,
  round(extract(epoch from (now() - r.reportada_en)) / 60)::int as minutos
from public.roturas r
join public.roturas_materiales m on m.clave = r.material
join public.roturas_procesos   p on p.clave = r.proceso
join public.roturas_causas     c on c.clave = r.causa;

grant select on public.v_roturas to authenticated;

create view public.v_roturas_salidas as
select
  s.id,
  s.codigo,
  s.placa,
  s.estado::text                                  as estado,
  s.observacion,
  s.creada_por, s.creada_en,
  s.supervisora_por, s.supervisora_en,
  s.verificador_por, s.verificador_en,
  s.validador_por,  s.validador_en,
  s.motivo_anulacion, s.anulada_en, s.anulada_por,

  (select count(*) from public.roturas_salida_tolvas t where t.salida_id = s.id) as tolvas,
  /* EL NETO SALE DE SUMAR LAS PARTES, siempre. Nunca hay un total
     guardado que pueda quedar desfasado de sus tolvas. */
  coalesce((select sum(t.bruto_kg) from public.roturas_salida_tolvas t
             where t.salida_id = s.id), 0)        as bruto_kg,
  coalesce((select sum(t.tara_kg) from public.roturas_salida_tolvas t
             where t.salida_id = s.id), 0)        as tara_kg,
  coalesce((select sum(t.bruto_kg - t.tara_kg) from public.roturas_salida_tolvas t
             where t.salida_id = s.id), 0)        as neto_kg,

  /* Cuántas firmas lleva, de tres. Es lo que dibuja la cadena sin que
     la pantalla tenga que mirar tres campos. */
  ((s.supervisora_en is not null)::int
   + (s.verificador_en is not null)::int
   + (s.validador_en is not null)::int)          as firmas,
  (s.validador_en is not null)                   as completa
from public.roturas_salidas s;

grant select on public.v_roturas_salidas to authenticated;

-- =====================================================================
-- 8. RLS Y GRANTS
--
-- Leer lo puede todo el que entre. Escribir pasa por las funciones de
-- arriba, que es donde están las reglas. Los maestros sí se editan
-- directo: son datos, no decisiones.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['roturas','roturas_materiales','roturas_procesos','roturas_causas',
                           'roturas_tolvas','roturas_fotos','roturas_salidas',
                           'roturas_salida_tolvas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (true)', t, t);
  end loop;

  foreach t in array array['roturas_materiales','roturas_procesos','roturas_causas','roturas_tolvas']
  loop
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      'using (public.es_editor()) with check (public.es_editor())', t, t);
  end loop;
end $$;

drop policy if exists roturas_fotos_insert on public.roturas_fotos;
create policy roturas_fotos_insert on public.roturas_fotos
  for insert to authenticated with check (public.es_editor());

/* Los GRANT van aparte de las políticas y hacen falta los dos: la
   política dice QUÉ FILAS, el grant dice si puede tocar la tabla. Sin
   grant, Postgres contesta "permission denied for table" mucho antes de
   evaluar la política. */
grant select on public.roturas, public.roturas_fotos, public.roturas_salidas,
                public.roturas_salida_tolvas
to authenticated;

grant select, insert, update, delete on
  public.roturas_materiales, public.roturas_procesos,
  public.roturas_causas, public.roturas_tolvas
to authenticated;

grant insert on public.roturas_fotos to authenticated;
grant usage on sequence public.roturas_codigo_seq, public.roturas_salida_seq to authenticated;

-- El bucket de las fotos. Privado, como los otros dos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roturas', 'roturas', false, 15728640,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = 15728640,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists roturas_fotos_ver on storage.objects;
create policy roturas_fotos_ver on storage.objects
  for select to authenticated using (bucket_id = 'roturas');

drop policy if exists roturas_fotos_subir on storage.objects;
create policy roturas_fotos_subir on storage.objects
  for insert to authenticated with check (bucket_id = 'roturas' and public.es_editor());

drop policy if exists roturas_fotos_borrar on storage.objects;
create policy roturas_fotos_borrar on storage.objects
  for delete to authenticated using (bucket_id = 'roturas' and public.mi_rol() = 'admin');

-- Los permisos de las pantallas, sin pisar lo ajustado en /admin/roles.
do $$
begin
  if to_regclass('public.rol_permisos') is not null then
    insert into public.rol_permisos (rol, seccion, nivel)
    select r.clave, s.ruta,
           (case when r.clave in ('admin', 'supervisor', 'abi', 'verificador', 'validador') then 'editar' else 'ver' end)
             ::public.nivel_permiso
      from public.roles r
      cross join (values
        ('/roturas'),
        -- EN SITIO: cuenta unidades
        ('/roturas/en-sitio'),
        ('/roturas/en-sitio/visto-bueno'),
        ('/roturas/en-sitio/analisis'),
        ('/roturas/en-sitio/maestro'),
        -- SALIDA: pesa kilos. Una pantalla por etapa de la cadena, para
        -- que cada quien entre a la suya y no vea botones que no puede
        -- tocar.
        ('/roturas/salida'),
        ('/roturas/salida/verificacion'),
        ('/roturas/salida/validacion'),
        ('/roturas/salida/analisis'),
        ('/roturas/salida/tolvas')) as s(ruta)
    on conflict (rol, seccion) do nothing;

    /* Las rutas de la primera versión, cuando el módulo era un menú
       plano. Se borran para que no queden casillas fantasma en
       /admin/roles: un permiso sobre una pantalla que ya no existe no
       hace nada y confunde a quien reparte los roles. */
    delete from public.rol_permisos
     where seccion in ('/roturas/visto-bueno', '/roturas/salidas',
                       '/roturas/analisis', '/roturas/maestro');
  end if;
end $$;

-- =====================================================================
-- 9. COMPROBACIÓN. Todas tienen que decir 'ok'.
-- =====================================================================
do $$
declare
  v_tablas integer; v_fun integer; v_vistas integer;
  v_mat integer; v_cau integer; v_tol integer; v_roles integer; v_bucket boolean;
begin
  select count(*) into v_tablas from information_schema.tables
   where table_schema = 'public'
     and table_name in ('roturas','roturas_materiales','roturas_procesos','roturas_causas',
                        'roturas_tolvas','roturas_fotos','roturas_salidas','roturas_salida_tolvas');

  select count(*) into v_fun from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('rotura_registrar','rotura_visto_bueno','rotura_anular','rotura_puede',
                       'salida_abrir','salida_pesar','salida_quitar_tolva','salida_firmar',
                       'salida_anular');

  select count(*) into v_vistas from information_schema.views
   where table_schema = 'public' and table_name in ('v_roturas','v_roturas_salidas');

  select count(*) into v_mat from public.roturas_materiales;
  select count(*) into v_cau from public.roturas_causas;
  select count(*) into v_tol from public.roturas_tolvas;
  select count(*) into v_roles from public.roles where clave in ('abi','verificador','validador');
  select exists (select 1 from storage.buckets where id = 'roturas') into v_bucket;

  raise notice 'las ocho tablas .......... %', case when v_tablas = 8 then 'ok' else 'MAL (' || v_tablas || ')' end;
  raise notice 'las nueve funciones ...... %', case when v_fun >= 9 then 'ok' else 'MAL (' || v_fun || ')' end;
  raise notice 'las dos vistas ........... %', case when v_vistas = 2 then 'ok' else 'MAL (' || v_vistas || ')' end;
  raise notice 'materiales sembrados ..... % (%)', case when v_mat > 0 then 'ok' else 'MAL' end, v_mat;
  raise notice 'causas sembradas ......... % (%)', case when v_cau > 0 then 'ok' else 'MAL' end, v_cau;
  raise notice 'tolvas con su tara ....... % (%)', case when v_tol > 0 then 'ok' else 'MAL' end, v_tol;
  raise notice 'los tres roles ........... % (%)', case when v_roles = 3 then 'ok' else 'MAL' end, v_roles;
  raise notice 'bucket de fotos .......... %', case when v_bucket then 'ok' else 'MAL' end;
end $$;
