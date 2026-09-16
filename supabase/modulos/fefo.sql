-- =====================================================================
-- FEFO · CONTEO FÍSICO POR UBICACIÓN
-- ---------------------------------------------------------------------
-- QUÉ ES. Alguien camina el almacén módulo por módulo y anota qué hay en
-- cada uno: el material, cuántas estibas o cajas, y la fecha de
-- vencimiento que lleva impresa. De ahí sale el FEFO —first expired,
-- first out—: qué se despacha primero y qué se está por vencer.
--
-- REEMPLAZA A «FEFO 002.xlsx», hoja CONTEO. El análisis de esa hoja es
-- lo que decide casi todo lo de abajo, así que queda escrito:
--
--   DE 25 COLUMNAS, SOLO 7 SE ESCRIBEN. Las otras 18 o se traen del
--   maestro por el código, o son una cuenta. Contando en un celular,
--   parado frente a un módulo, esas 18 columnas son 18 formas de
--   equivocarse escribiendo algo que la base ya sabe.
--
--     se escribe .... código, calle, módulo, lado, estibas O cajas,
--                     rotación, y el vencimiento en día/mes/año
--     se trae ....... descripción, factor estibado, vida útil, tipo
--     se calcula .... total cajas, total estibas, la fecha de
--                     vencimiento, días para vencer, días para salir,
--                     la ubicación
--
--   LAS CUATRO COLUMNAS DE NOVEDAD CASI NO SE USAN: en 152 renglones,
--   AVERÍA salió 2 veces, PNC 1, ESTADO 10 y COMENTARIO ninguna. Existen
--   —cuando pasan, importan— pero no pueden ocupar sitio en la pantalla
--   de todos los días.
--
--   SE CAMINA EN ORDEN. 89 ubicaciones distintas para 152 renglones, y
--   88 cambios de ubicación en 151 saltos: nadie salta de la calle A a
--   la E y vuelve. Por eso la ubicación es del CONTEO en curso y no de
--   cada renglón: se escoge una vez y los materiales que se vayan
--   agregando caen ahí hasta que se cambie.
--
-- LAS FÓRMULAS NO SE REINVENTARON: se leyeron del propio archivo y van
-- copiadas tal cual, cada una con la del Excel al lado. La de «días para
-- salir» es la que más se presta a inventarla mal —parecía una constante
-- de 90 días— y no lo es: sale de «Mínimo T1» del maestro, que cambia
-- por material (90, 49, 30…).
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EL MAESTRO DE MATERIALES
-- ---------------------------------------------------------------------
-- Los 494 de la hoja MAESTRO más los 32 envases de Hoja1. Se importa, no
-- se escribe a mano: es la misma hoja que ya mantiene alguien.
create table if not exists public.fefo_materiales (
  codigo          bigint primary key,
  descripcion     text not null,
  /* CUIDADO CON LOS NOMBRES DEL EXCEL, que no dicen lo que parecen:
       «Factor Cajas»      = unidades por caja       (6 latas)
       «Factor estibas»    = CAJAS por estiba        (480)  ← el que multiplica
       «CAJAS POR ESTIBA»  = UNIDADES por estiba     (2880)
     El que usa el conteo es el de la mitad. Se le puso el nombre de lo
     que ES y no el de la columna, porque el del Excel ya confundió a
     alguien: en la hoja CONTEO esa misma cifra se llama «FACTOR
     ESTIBADO». */
  unidades_por_caja   integer,
  cajas_por_estiba    integer,
  unidades_por_estiba bigint,
  contenido       numeric(12,2),
  familia         text,
  presentacion    text,
  vida_util       integer,
  /* LOS DÍAS QUE TIENE QUE SALIR ANTES DE VENCER. En el Excel se llama
     «Mínimo T1» y es lo que el VLOOKUP de «DIAS PARA SALIR» resta. No es
     una constante: 90 días para lo de vida 180/270/365, 49 para lo de
     120, 30 para lo de 60. */
  dias_minimo     integer not null default 0,
  origen          text,
  foraneo         text,
  tipo            text not null default 'PRODUCTO'
                  check (tipo in ('PRODUCTO', 'ENVASE')),
  activo          boolean not null default true,
  actualizado_en  timestamptz not null default now()
);

create index if not exists fefo_materiales_desc_idx
  on public.fefo_materiales using gin (to_tsvector('spanish', descripcion));

-- ---------------------------------------------------------------------
-- 2. LAS UBICACIONES
-- ---------------------------------------------------------------------
-- Las 428 de la hoja CAPACIDAD DE MODULOS. Existen para que en el
-- celular la ubicación se ESCOJA y no se teclee: «A01_DER» tecleado son
-- siete pulsaciones y al menos tres formas de escribirlo mal —en la hoja
-- conviven «E01 », «E6 DER» y «E06 IZQ» para lo mismo—.
create table if not exists public.fefo_ubicaciones (
  clave      text primary key,          -- A01_DER
  calle      text not null,             -- A
  modulo     text not null,             -- 01
  lado       text check (lado in ('IZQ', 'DER')),
  familia    text,
  capacidad  integer,
  activa     boolean not null default true
);

create index if not exists fefo_ubicaciones_calle_idx
  on public.fefo_ubicaciones (calle, modulo, lado);

-- ---------------------------------------------------------------------
-- 3. EL CONTEO Y SUS RENGLONES
-- ---------------------------------------------------------------------
-- UN CONTEO ES DE UNA PERSONA Y DE UN DÍA. Cristian lo pidió así: cada
-- quien llena el suyo y todo cae a un mismo sitio con el nombre de quien
-- lo hizo. El responsable no se escribe: sale de la sesión, que es la
-- única forma de que no se pueda contar a nombre de otro.
create table if not exists public.fefo_conteos (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default (now() at time zone 'America/Bogota')::date,
  responsable_id uuid not null references public.perfiles(id) on delete restrict,
  estado         text not null default 'abierto'
                 check (estado in ('abierto', 'cerrado')),
  nota           text,
  abierto_en     timestamptz not null default now(),
  cerrado_en     timestamptz
);

/* UNO ABIERTO POR PERSONA, y no uno por persona y día: si alguien deja
   el de ayer sin cerrar, lo que quiere es seguir ahí y no empezar uno
   nuevo que parta el recorrido en dos. */
create unique index if not exists fefo_conteos_abierto_unico
  on public.fefo_conteos (responsable_id) where estado = 'abierto';

create index if not exists fefo_conteos_fecha_idx
  on public.fefo_conteos (fecha desc);

create table if not exists public.fefo_lineas (
  id           uuid primary key default gen_random_uuid(),
  conteo_id    uuid not null references public.fefo_conteos(id) on delete cascade,
  codigo       bigint not null references public.fefo_materiales(codigo) on delete restrict,

  /* LA UBICACIÓN SE GUARDA DESARMADA Y ADEMÁS ARMADA. Desarmada porque
     es con lo que se agrupa y se ordena un recorrido; armada porque es
     lo que la gente dice en voz alta y lo que salía en el Excel. */
  calle        text not null,
  modulo       text not null,
  lado         text check (lado in ('IZQ', 'DER')),

  /* ESTIBAS O CAJAS, NO LAS DOS. Medido en la hoja: de 152 renglones,
     120 traen estibas, 33 traen cajas y UNO trae las dos. Lo que se ve
     de frente es una estiba entera o un resto suelto, no las dos cosas
     a la vez, y ese único renglón con ambas es casi seguro un error de
     digitación. La restricción lo vuelve imposible en vez de dejarlo
     pasar y salir en un informe. */
  estibas      integer check (estibas is null or estibas >= 0),
  cajas        integer check (cajas   is null or cajas   >= 0),
  constraint fefo_lineas_algo_que_contar
    check (coalesce(estibas, 0) + coalesce(cajas, 0) > 0),
  constraint fefo_lineas_una_u_otra
    check (estibas is null or cajas is null),

  rotacion     boolean not null default false,

  /* EL VENCIMIENTO, EN TRES CAMPOS Y NO EN UNO. No es pereza: quien
     cuenta lee «11 03 27» estampado en la estiba y lo teclea en ese
     orden. Un selector de calendario obliga a traducir a mes con nombre
     y a buscar el año, que con guantes y de pie es más lento y más
     fácil de errar. El año va de dos cifras porque así viene impreso.
     La fecha armada la hace la vista, una sola vez. */
  venc_dia     smallint check (venc_dia  between 1 and 31),
  venc_mes     smallint check (venc_mes  between 1 and 12),
  venc_anio    smallint check (venc_anio between 0 and 99),

  /* LAS NOVEDADES, QUE CASI NUNCA PASAN pero cuando pasan mandan. */
  averia         boolean not null default false,
  pnc            boolean not null default false,
  estado_envase  text,
  comentario     text,

  registrado_por uuid not null references public.perfiles(id) on delete restrict,
  registrado_en  timestamptz not null default now()
);

create index if not exists fefo_lineas_conteo_idx on public.fefo_lineas (conteo_id);
create index if not exists fefo_lineas_ubi_idx    on public.fefo_lineas (calle, modulo, lado);

-- ---------------------------------------------------------------------
-- 4. LA VISTA: LAS 18 COLUMNAS QUE NO SE ESCRIBEN
-- ---------------------------------------------------------------------
-- Cada cuenta lleva al lado la fórmula del Excel de la que salió. No es
-- documentación de adorno: es lo que permite que alguien abra el archivo
-- viejo, compare, y vea que dan lo mismo.
create or replace view public.v_fefo_lineas as
select
  l.id, l.conteo_id, l.codigo,
  m.descripcion,
  m.tipo,
  m.vida_util,
  m.cajas_por_estiba as factor_estibado,

  l.calle, l.modulo, l.lado,
  /* =C&D&" "&E  */
  trim(l.calle || l.modulo || ' ' || coalesce(l.lado, ''))                 as ubicacion,
  /* =C&D&" "&E & IF(L="","" ," AVERIA") & IF(M…," PNC") & IF(O…," "&O) */
  trim(l.calle || l.modulo || ' ' || coalesce(l.lado, '')
       || case when l.averia then ' AVERIA' else '' end
       || case when l.pnc    then ' PNC'    else '' end
       || case when coalesce(l.estado_envase, '') <> ''
               then ' ' || l.estado_envase else '' end)                    as ubicacion_combinada,

  l.estibas, l.cajas, l.rotacion,

  /* =VLOOKUP(factor estibas)*F + G   */
  (coalesce(m.cajas_por_estiba, 0) * coalesce(l.estibas, 0)
     + coalesce(l.cajas, 0))::bigint                                       as total_cajas,
  /* =F  — lo suelto NO se convierte a estibas, y así estaba en el Excel */
  coalesce(l.estibas, 0)                                                   as total_estibas,

  /* =DATE(A+2000, M, D)  */
  case when l.venc_dia is null or l.venc_mes is null or l.venc_anio is null
       then null
       else make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia) end      as vencimiento,

  /* =IF(TIPO="ENVASE", 0, S - TODAY())
     El envase no vence, así que su cuenta de días no dice nada y se deja
     en cero en vez de en un número que alguien pueda ordenar. */
  case when m.tipo = 'ENVASE' then 0
       when l.venc_dia is null or l.venc_mes is null or l.venc_anio is null then null
       else (make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia)
             - (now() at time zone 'America/Bogota')::date) end            as dias_para_vencer,

  /* =S - TODAY() - VLOOKUP(Minimo T1)
     Los días que quedan para que ESTO TENGA QUE SALIR, no para que se
     venza: si sale después, llega al cliente sin la vida útil mínima que
     el negocio promete. En negativo, ya se pasó. */
  case when l.venc_dia is null or l.venc_mes is null or l.venc_anio is null then null
       else (make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia)
             - (now() at time zone 'America/Bogota')::date
             - coalesce(m.dias_minimo, 0)) end                             as dias_para_salir,

  l.averia, l.pnc, l.estado_envase, l.comentario,
  l.registrado_por, l.registrado_en,
  c.fecha, c.estado, c.responsable_id
from public.fefo_lineas l
join public.fefo_conteos c   on c.id = l.conteo_id
join public.fefo_materiales m on m.codigo = l.codigo;

-- El resumen de cada conteo, para la lista: quién, cuándo, cuánto lleva.
create or replace view public.v_fefo_conteos as
select
  c.id, c.fecha, c.estado, c.nota, c.abierto_en, c.cerrado_en,
  c.responsable_id,
  p.nombre   as responsable_nombre,
  p.usuario  as responsable_usuario,
  count(l.id)                                   as renglones,
  count(distinct (l.calle || l.modulo || coalesce(l.lado, ''))) as ubicaciones,
  coalesce(sum(coalesce(l.estibas, 0)), 0)      as estibas
from public.fefo_conteos c
left join public.perfiles p   on p.id = c.responsable_id
left join public.fefo_lineas l on l.conteo_id = c.id
group by c.id, p.nombre, p.usuario;

-- ---------------------------------------------------------------------
-- 5. ABRIR, AGREGAR, BORRAR, CERRAR
-- ---------------------------------------------------------------------
-- TODO PASA POR AQUÍ y no por un insert desde el navegador. La razón no
-- es ceremonia: el responsable sale de auth.uid() y no de lo que mande
-- la pantalla, así que nadie puede contar a nombre de otro — y el nombre
-- de quien contó es justamente lo que Cristian pidió que quedara.

/* El conteo abierto de quien está entrando, o uno nuevo. Se llama al
   abrir la pantalla: quien vuelve después del almuerzo sigue en el
   suyo en vez de empezar otro. */
create or replace function public.fefo_abrir()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar para contar.';
  end if;

  select id into v_id
    from public.fefo_conteos
   where responsable_id = auth.uid() and estado = 'abierto'
   limit 1;

  if v_id is null then
    insert into public.fefo_conteos (responsable_id)
         values (auth.uid())
      returning id into v_id;
  end if;

  return v_id;
end $$;

create or replace function public.fefo_agregar(
  p_conteo        uuid,
  p_codigo        bigint,
  p_calle         text,
  p_modulo        text,
  p_lado          text default null,
  p_estibas       integer default null,
  p_cajas         integer default null,
  p_rotacion      boolean default false,
  p_venc_dia      smallint default null,
  p_venc_mes      smallint default null,
  p_venc_anio     smallint default null,
  p_averia        boolean default false,
  p_pnc           boolean default false,
  p_estado_envase text default null,
  p_comentario    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_estado text; v_duenio uuid; v_tipo text;
begin
  select estado, responsable_id into v_estado, v_duenio
    from public.fefo_conteos where id = p_conteo;

  if v_estado is null then
    raise exception 'Ese conteo no existe.';
  end if;
  /* SOLO EN EL PROPIO. Un conteo es de quien lo camina; escribir en el
     de otro mezclaría dos recorridos y el nombre dejaría de significar
     nada. */
  if v_duenio <> auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  if v_estado <> 'abierto' then
    raise exception 'Ese conteo ya se cerró. Abre uno nuevo para seguir contando.';
  end if;

  select tipo into v_tipo from public.fefo_materiales where codigo = p_codigo and activo;
  if v_tipo is null then
    raise exception 'El código % no está en el maestro. Revísalo o pide que lo agreguen.', p_codigo;
  end if;

  /* EL VENCIMIENTO ES OBLIGATORIO EN PRODUCTO Y NO EN ENVASE, porque el
     envase no vence: pedírselo sería inventar una fecha para llenar un
     campo, y esa fecha inventada después ordena un informe de FEFO. */
  if v_tipo = 'PRODUCTO'
     and (p_venc_dia is null or p_venc_mes is null or p_venc_anio is null) then
    raise exception 'Falta la fecha de vencimiento: es lo que ordena el FEFO.';
  end if;

  /* Que la fecha EXISTA. «31 de febrero» pasa los tres checks de rango
     uno por uno y revienta al armarla en la vista, que es donde peor se
     descubre: en un informe, días después. */
  if p_venc_dia is not null and p_venc_mes is not null and p_venc_anio is not null then
    begin
      perform make_date(2000 + p_venc_anio, p_venc_mes, p_venc_dia);
    exception when others then
      raise exception 'Esa fecha no existe: % / % / %', p_venc_dia, p_venc_mes, p_venc_anio;
    end;
  end if;

  insert into public.fefo_lineas (
    conteo_id, codigo, calle, modulo, lado, estibas, cajas, rotacion,
    venc_dia, venc_mes, venc_anio, averia, pnc, estado_envase, comentario,
    registrado_por
  ) values (
    p_conteo, p_codigo, upper(btrim(p_calle)), btrim(p_modulo),
    nullif(upper(btrim(coalesce(p_lado, ''))), ''),
    nullif(p_estibas, 0), nullif(p_cajas, 0), coalesce(p_rotacion, false),
    p_venc_dia, p_venc_mes, p_venc_anio,
    coalesce(p_averia, false), coalesce(p_pnc, false),
    nullif(btrim(coalesce(p_estado_envase, '')), ''),
    nullif(btrim(coalesce(p_comentario, '')), ''),
    auth.uid()
  ) returning id into v_id;

  return v_id;
end $$;

/* BORRAR UN RENGLÓN es indispensable y no un lujo: contando de pie se
   teclea un código de más, y sin poder quitarlo la única salida es
   dejarlo mal. Solo el propio, solo mientras el conteo esté abierto. */
create or replace function public.fefo_borrar(p_linea uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_duenio uuid;
begin
  select c.estado, c.responsable_id into v_estado, v_duenio
    from public.fefo_lineas l join public.fefo_conteos c on c.id = l.conteo_id
   where l.id = p_linea;

  if v_estado is null then raise exception 'Ese renglón ya no está.'; end if;
  if v_duenio <> auth.uid() then raise exception 'Ese renglón es de otra persona.'; end if;
  if v_estado <> 'abierto' then
    raise exception 'El conteo ya se cerró: sus renglones no se tocan.';
  end if;

  delete from public.fefo_lineas where id = p_linea;
end $$;

create or replace function public.fefo_cerrar(p_conteo uuid, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_duenio uuid; v_n integer;
begin
  select estado, responsable_id into v_estado, v_duenio
    from public.fefo_conteos where id = p_conteo;

  if v_estado is null then raise exception 'Ese conteo no existe.'; end if;
  if v_duenio <> auth.uid() then raise exception 'Ese conteo es de otra persona.'; end if;
  if v_estado = 'cerrado' then return; end if;   -- cerrar dos veces no es un error

  select count(*) into v_n from public.fefo_lineas where conteo_id = p_conteo;
  /* UN CONTEO VACÍO NO SE CIERRA. Cerrado y en cero se lee después como
     «ese día no había nada», que es una afirmación, y lo que pasó fue
     que nadie contó. */
  if v_n = 0 then
    raise exception 'Este conteo no tiene ni un renglón: no hay nada que cerrar.';
  end if;

  update public.fefo_conteos
     set estado = 'cerrado', cerrado_en = now(), nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_conteo;
end $$;

-- ---------------------------------------------------------------------
-- 5 bis. QUITAR DEL MAESTRO: BORRAR O DESACTIVAR, LO DECIDE LA BASE
-- ---------------------------------------------------------------------
-- QUITAR NO ES BORRAR. Un material o una ubicación que ya usó un conteo
-- no se puede borrar sin llevarse el histórico por delante: el conteo de
-- la semana pasada quedaría apuntando a un código que ya no existe y su
-- descripción saldría en blanco en un informe de FEFO.
--
-- Así que la base mira si se usó: si no, borra; si sí, DESACTIVA —deja de
-- salir en las listas y lo viejo se sigue leyendo—. Y devuelve cuál de
-- las dos hizo, para que la pantalla lo diga en vez de dejar a alguien
-- adivinando por qué el código sigue ahí.
create or replace function public.fefo_quitar_material(p_codigo bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer; v_desc text;
begin
  if not public.es_editor() then
    raise exception 'Tocar el maestro requiere rol de supervisor o administrador.';
  end if;

  select descripcion into v_desc from public.fefo_materiales where codigo = p_codigo;
  if v_desc is null then return 'Ese código ya no estaba.'; end if;

  select count(*) into v_n from public.fefo_lineas where codigo = p_codigo;
  if v_n = 0 then
    delete from public.fefo_materiales where codigo = p_codigo;
    return 'Borrado: no lo había usado ningún conteo.';
  end if;

  update public.fefo_materiales set activo = false, actualizado_en = now()
   where codigo = p_codigo;
  return format('Desactivado: lo usan %s renglones de conteo, así que borrarlo ' ||
                'dejaría ese histórico sin descripción.', v_n);
end $$;

create or replace function public.fefo_quitar_ubicacion(p_clave text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer; v_u record;
begin
  if not public.es_editor() then
    raise exception 'Tocar el maestro requiere rol de supervisor o administrador.';
  end if;

  select * into v_u from public.fefo_ubicaciones where clave = p_clave;
  if v_u is null then return 'Esa ubicación ya no estaba.'; end if;

  /* LA UBICACIÓN NO ES LLAVE FORÁNEA en fefo_lineas —el renglón guarda
     calle, módulo y lado sueltos— así que aquí se cuenta por esos tres y
     no por la clave. Si se contara por la clave, siempre daría cero y
     esto borraría ubicaciones que sí se usaron. */
  select count(*) into v_n from public.fefo_lineas l
   where l.calle = v_u.calle and l.modulo = v_u.modulo
     and coalesce(l.lado, '') = coalesce(v_u.lado, '');

  if v_n = 0 then
    delete from public.fefo_ubicaciones where clave = p_clave;
    return 'Borrada: no la había usado ningún conteo.';
  end if;

  update public.fefo_ubicaciones set activa = false where clave = p_clave;
  return format('Desactivada: %s renglones de conteo están ahí.', v_n);
end $$;

-- ---------------------------------------------------------------------
-- 6. QUIÉN VE Y QUIÉN ESCRIBE
-- ---------------------------------------------------------------------
alter table public.fefo_materiales  enable row level security;
alter table public.fefo_ubicaciones enable row level security;
alter table public.fefo_conteos     enable row level security;
alter table public.fefo_lineas      enable row level security;

/* VER LO VE TODO EL MUNDO, y es a propósito: el valor del FEFO es que el
   de la tarde sepa qué contó el de la mañana. Esconder el conteo de cada
   quien obligaría a pedirlo por WhatsApp, que es de donde venimos. */
do $$
declare t text;
begin
  foreach t in array array['fefo_materiales','fefo_ubicaciones','fefo_conteos','fefo_lineas']
  loop
    execute format('drop policy if exists %I_ver on public.%I', t, t);
    execute format('create policy %I_ver on public.%I for select to authenticated using (true)', t, t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

/* ESCRIBIR EL CONTEO, SOLO POR LAS FUNCIONES. Sin política de escritura
   en fefo_conteos ni fefo_lineas: la única entrada es fefo_abrir /
   fefo_agregar / fefo_borrar / fefo_cerrar, que son security definer y
   sacan el responsable de la sesión. Es lo único que hace que «con el
   nombre de quien lo hizo» quiera decir algo. */

/* LOS MAESTROS SÍ se escriben desde la pantalla de importar, y para eso
   se le da permiso al editor. */
do $$
declare t text;
begin
  foreach t in array array['fefo_materiales','fefo_ubicaciones']
  loop
    execute format('drop policy if exists %I_editar on public.%I', t, t);
    execute format($p$create policy %I_editar on public.%I for all to authenticated
                     using (public.es_editor()) with check (public.es_editor())$p$, t, t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

/* LAS VISTAS TAMBIÉN SE CONCEDEN. Se me olvidó la primera vez y la
   prueba lo cantó con «permission denied for view v_fefo_lineas»: dar
   permiso sobre las tablas NO lo da sobre las vistas que las leen.

   Y van con los permisos de su dueño —el comportamiento normal de una
   vista— a propósito: v_fefo_conteos lee `perfiles` para poner el nombre
   de quien contó, y esa tabla tiene RLS. Con permisos del que consulta,
   el nombre saldría vacío para todos menos para uno mismo, que es
   justamente lo contrario de lo que se pidió. */
grant select on public.v_fefo_lineas  to authenticated;
grant select on public.v_fefo_conteos to authenticated;

grant execute on function public.fefo_abrir()  to authenticated;
grant execute on function public.fefo_agregar(uuid, bigint, text, text, text, integer, integer,
                                              boolean, smallint, smallint, smallint,
                                              boolean, boolean, text, text) to authenticated;
grant execute on function public.fefo_borrar(uuid) to authenticated;
grant execute on function public.fefo_cerrar(uuid, text) to authenticated;
grant execute on function public.fefo_quitar_material(bigint) to authenticated;
grant execute on function public.fefo_quitar_ubicacion(text)  to authenticated;

-- ---------------------------------------------------------------------
-- 7. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := ''; v_m int; v_u int;
begin
  if to_regclass('public.fefo_materiales')  is null then v_falta := v_falta || ' fefo_materiales';  end if;
  if to_regclass('public.fefo_ubicaciones') is null then v_falta := v_falta || ' fefo_ubicaciones'; end if;
  if to_regclass('public.fefo_conteos')     is null then v_falta := v_falta || ' fefo_conteos';     end if;
  if to_regclass('public.fefo_lineas')      is null then v_falta := v_falta || ' fefo_lineas';      end if;
  if v_falta <> '' then
    raise exception 'Faltaron tablas:%', v_falta;
  end if;

  select count(*) into v_m from public.fefo_materiales;
  select count(*) into v_u from public.fefo_ubicaciones;
  raise notice 'FEFO listo. Maestro: % materiales, % ubicaciones.', v_m, v_u;
  if v_m = 0 then
    raise notice 'El maestro está vacío: corre supabase/datos/fefo-maestro.sql.';
  end if;
end $$;
