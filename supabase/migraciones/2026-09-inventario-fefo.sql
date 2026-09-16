-- =====================================================================
-- INVENTARIO · MAESTRO COMPLETO Y PLANTILLA DE CONTEO (FEFO)
-- ---------------------------------------------------------------------
-- Todo esto vive DENTRO de inventario, que es donde ya está el catálogo
-- y donde ya están los conteos físicos. No es un módulo aparte.
--
-- SACADO DE «FEFO 002.xlsx», leyendo las FÓRMULAS y no los resultados.
-- Las cuatro hojas hacen esto:
--
--   MAESTRO (494 materiales, 18 columnas)
--       La hoja CONTEO le pregunta CINCO cosas por el código:
--       descripción, «Factor estibas», vida útil, «Mínimo T1» y P/E.
--       Las otras trece no las toca — van al maestro igual, pero no
--       hacen falta para contar.
--
--   Hoja1 (32 códigos)
--       Los 32 envases. Están TODOS en MAESTRO y con valores idénticos:
--       cero diferencias, cero códigos nuevos. Es con lo que se armó la
--       columna P/E. Aquí no es una tabla: es `tipo_material='ENVASE'`.
--
--   CAPACIDAD DE MODULOS (428 ubicaciones + 9 listas)
--       Hace dos trabajos: la lista de ubicaciones con familia y
--       capacidad, y las listas desplegables — calle, los módulos de
--       CADA calle, lado, y ESTADO_ENVASE con 35 valores.
--
--   CONTEO (25 columnas)
--       La plantilla. Solo DIEZ se teclean; las quince restantes son
--       VLOOKUP contra el maestro o cuentas.
--
-- EL DATO QUE MANDA EN EL DISEÑO: 38 de las 152 filas del conteo real
-- —un cuarto— apuntan a una ubicación que no existe. No porque falte el
-- módulo: «A29», «C08», «E01», «C29», «B29» existen, pero como A29_DER y
-- A29_IZQ, y la fila se dejó SIN LADO. Más «E6» donde el maestro dice
-- «E06» y «EST8» donde dice «EST08». El desplegable del Excel no lo
-- evitó porque sus listas traen '01' como texto y 10 como número, y
-- encima se puede escribir a mano.
-- Por eso aquí la ubicación es una LLAVE FORÁNEA y no un texto: no se
-- teclea, se escoge, y no hay tres formas de escribir lo mismo.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EL MATERIAL: LAS 18 COLUMNAS DEL MAESTRO
-- ---------------------------------------------------------------------
-- CUIDADO CON LOS NOMBRES DEL EXCEL, que no dicen lo que parecen:
--   «Factor Cajas»      = unidades por caja       (6 latas)
--   «Factor estibas»    = CAJAS por estiba        (480)  ← el que multiplica
--   «CAJAS POR ESTIBA»  = UNIDADES por estiba     (2880)
-- El que usa el conteo es el de la mitad. Aquí lleva el nombre de lo que
-- ES y no el de la columna, porque el del Excel ya confundió a alguien:
-- en la hoja CONTEO esa misma cifra se llama «FACTOR ESTIBADO».
alter table public.productos
  add column if not exists unidades_por_caja   integer,
  add column if not exists cajas_por_estiba    integer,
  add column if not exists unidades_por_estiba bigint,
  add column if not exists contenido           numeric(12,2),
  add column if not exists familia             text,
  add column if not exists presentacion        text,
  add column if not exists vida_util           integer,
  add column if not exists f_limite_desp       integer,
  -- LOS DÍAS QUE TIENE QUE SALIR ANTES DE VENCER. «Mínimo T1» en el
  -- Excel, y es lo que resta «DIAS PARA SALIR».
  --
  -- NO SE DEDUCE DE LA VIDA ÚTIL, aunque lo parezca. Con vida útil 180
  -- hay materiales con 90, con 120 y con 49; con 120 los hay con 90 y
  -- con 49. Es un dato propio de cada material y tiene que venir del
  -- maestro: calcularlo sería inventar la fecha de salida de media
  -- bodega.
  add column if not exists dias_minimo         integer not null default 0,
  add column if not exists prioridad_t1        integer,
  add column if not exists minimo_t2           integer,
  add column if not exists prioridad_t2        integer,
  add column if not exists minimo_ka           integer,
  add column if not exists origen              text,
  add column if not exists foraneo             text,
  -- El envase retornable no vence, y por eso necesita distinguirse: sus
  -- «días para vencer» son cero y no una fecha absurda a treinta años.
  add column if not exists tipo_material       text not null default 'PRODUCTO';

alter table public.productos drop constraint if exists productos_tipo_material_chk;
alter table public.productos add constraint productos_tipo_material_chk
  check (tipo_material in ('PRODUCTO', 'ENVASE'));

create index if not exists productos_familia_idx on public.productos (familia);

-- ---------------------------------------------------------------------
-- 2. LAS UBICACIONES DE LA BODEGA
-- ---------------------------------------------------------------------
-- Una ubicación NO es una bodega: «A01_DER» es un módulo de una calle
-- dentro del CD. Meterlas como bodegas habría convertido un centro de
-- distribución en cuatrocientos.
create table if not exists public.ubicaciones (
  id         uuid primary key default gen_random_uuid(),
  bodega_id  uuid not null references public.bodegas(id) on delete cascade,
  clave      text not null,              -- A01_DER
  calle      text not null,              -- A
  modulo     text not null default '',   -- 01
  lado       text check (lado in ('IZQ', 'DER')),
  familia    text,
  capacidad  integer,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now(),
  unique (bodega_id, clave)
);

create index if not exists ubicaciones_orden_idx
  on public.ubicaciones (bodega_id, calle, modulo, lado);

-- ---------------------------------------------------------------------
-- 3. EL ESTADO DEL ENVASE
-- ---------------------------------------------------------------------
-- La lista ESTADO_ENVASE del Excel: 35 valores. Se usó en 10 de las 152
-- filas y solo sobre envases — pero cuando se usa es el dato: un módulo
-- de envase VACÍO y uno LLENO son dos cosas distintas.
--
-- Va en tabla y no en un `check`, porque esta lista la mantiene la
-- bodega: aparece un tipo de envase nuevo y alguien lo agrega desde el
-- maestro. Un `check` habría exigido una migración cada vez.
create table if not exists public.envase_estados (
  clave  text primary key,
  orden  integer not null default 100,
  activo boolean not null default true
);

-- ---------------------------------------------------------------------
-- 4. EL CONTEO SABE DE QUÉ CLASE ES
-- ---------------------------------------------------------------------
-- UN CONTEO GENERAL Y UNO FEFO NO SE RECORREN IGUAL:
--   · el general arranca con una línea por cada producto activo y se va
--     tachando;
--   · el FEFO arranca VACÍO y crece mientras se camina, porque hasta no
--     pararse frente al módulo nadie sabe qué hay ahí.
-- Sin esta columna, `iniciar_conteo` le sembraría 494 renglones en
-- blanco a quien va a caminar la bodega.
alter table public.conteos
  add column if not exists tipo text not null default 'general';

alter table public.conteos drop constraint if exists conteos_tipo_chk;
alter table public.conteos add constraint conteos_tipo_chk
  check (tipo in ('general', 'fefo'));

-- ---------------------------------------------------------------------
-- 5. EL RENGLÓN DE LA PLANTILLA
-- ---------------------------------------------------------------------
alter table public.conteo_lineas
  add column if not exists ubicacion_id  uuid references public.ubicaciones(id) on delete restrict,
  -- ESTIBAS O CAJAS, NUNCA LAS DOS. En la hoja real se cumple en 151 de
  -- 152 renglones; el que traía las dos es un dedazo, y aquí no puede
  -- repetirse.
  add column if not exists estibas       integer,
  add column if not exists cajas         integer,
  -- La fecha va en tres pedazos porque así está impresa en la estiba y
  -- así se teclea. Armarla aquí obligaría a escoger un formato y a que
  -- alguien lo escribiera al revés.
  add column if not exists venc_dia      smallint,
  add column if not exists venc_mes      smallint,
  add column if not exists venc_anio     smallint,
  -- ROT SE CONTESTA SIEMPRE: 94 «SI» y 58 «NO» en las 152 filas. Queda
  -- NULA a propósito —«no contestado» no es «no»— y la función de
  -- agregar la exige.
  add column if not exists rotacion      boolean,
  add column if not exists averia        boolean not null default false,
  add column if not exists pnc           boolean not null default false,
  add column if not exists estado_envase text references public.envase_estados(clave);

alter table public.conteo_lineas drop constraint if exists conteo_lineas_una_u_otra;
alter table public.conteo_lineas add constraint conteo_lineas_una_u_otra
  check (estibas is null or cajas is null);

alter table public.conteo_lineas drop constraint if exists conteo_lineas_fecha_completa;
alter table public.conteo_lineas add constraint conteo_lineas_fecha_completa
  check ((venc_dia is null and venc_mes is null and venc_anio is null)
      or (venc_dia between 1 and 31 and venc_mes between 1 and 12 and venc_anio between 0 and 99));

-- EL MISMO PRODUCTO SE CUENTA VARIAS VECES, y por eso la llave vieja ya
-- no sirve. `unique (conteo_id, producto_id)` era correcta para un
-- conteo general —una línea por producto— pero en FEFO la misma cerveza
-- está en ocho módulos con cuatro vencimientos distintos, y cada uno es
-- un renglón de verdad, no un duplicado.
--
-- `nulls not distinct` es lo que mantiene intacto el conteo general: sin
-- eso Postgres considera que dos nulos son distintos y dejaría meter el
-- mismo producto dos veces en un conteo sin ubicación — justo el
-- descuido que la llave vieja evitaba.
alter table public.conteo_lineas drop constraint if exists conteo_lineas_conteo_id_producto_id_key;
drop index if exists public.conteo_lineas_unico;
create unique index conteo_lineas_unico on public.conteo_lineas
  (conteo_id, producto_id, ubicacion_id, venc_dia, venc_mes, venc_anio, averia, pnc)
  nulls not distinct;

create index if not exists conteo_lineas_ubicacion_idx
  on public.conteo_lineas (ubicacion_id);

-- ---------------------------------------------------------------------
-- 6. LAS CUENTAS, CON LAS FÓRMULAS DEL EXCEL
-- ---------------------------------------------------------------------
-- LAS HACE LA BASE Y NO LA PANTALLA. Si cada pantalla calculara las
-- suyas, bastaría con que una redondeara distinto para que el informe y
-- el conteo dijeran cosas diferentes del mismo día.
create or replace view public.v_conteo_fefo as
select
  cl.id,
  cl.conteo_id,
  c.codigo      as conteo,
  c.estado,
  c.tipo,
  cl.producto_id,
  p.sku         as codigo,
  p.nombre      as material,          -- =VLOOKUP(...,2)   → DESCRIPCION
  p.tipo_material,                    -- =VLOOKUP(...,18)  → TIPO
  p.familia,
  p.vida_util,                        -- =VLOOKUP(...,9)   → VIDA UTIL
  p.cajas_por_estiba as factor_estibado,  -- =VLOOKUP(...,4) → FACTOR ESTIBADO
  cl.ubicacion_id,
  u.clave       as ubicacion,
  u.calle, u.modulo, u.lado, u.capacidad,
  cl.estibas,
  cl.cajas,
  -- =VLOOKUP(...,4)*F+G  → TOTAL CAJAS
  -- El material sin «Factor estibas» aporta CERO por la estiba y no
  -- falla: está en null a propósito —poner un 1 sería inventárselo— y
  -- la pantalla lo señala.
  (coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0)
     + coalesce(cl.cajas, 0))::bigint                  as total_cajas,
  coalesce(cl.estibas, 0)                              as total_estibas,  -- =F
  cl.venc_dia, cl.venc_mes, cl.venc_anio,
  -- =DATE(A+2000, M, D)
  case when cl.venc_anio is null then null
       else make_date(2000 + cl.venc_anio, cl.venc_mes, cl.venc_dia) end as vencimiento,
  -- =IF(TIPO="ENVASE", 0, S-TODAY())
  case when cl.venc_anio is null then null
       when p.tipo_material = 'ENVASE' then 0
       else make_date(2000 + cl.venc_anio, cl.venc_mes, cl.venc_dia) - current_date
  end                                                  as dias_para_vencer,
  -- =S - TODAY() - VLOOKUP(Mínimo T1, 11)
  case when cl.venc_anio is null then null
       else make_date(2000 + cl.venc_anio, cl.venc_mes, cl.venc_dia)
            - current_date - coalesce(p.dias_minimo, 0)
  end                                                  as dias_para_salir,
  cl.rotacion, cl.averia, cl.pnc, cl.estado_envase, cl.nota,
  -- =C&D&" "&E  → UBICACIÓN
  u.clave                                              as ubicacion_texto,
  -- =X & IF(AVER," AVERIA") & IF(PNC," PNC") & IF(COMENT," "&COMENT)
  -- Es la que SEPARA la estiba averiada de la buena dentro del mismo
  -- módulo, y por eso es la que sirve para agrupar.
  (u.clave
     || case when cl.averia then ' AVERIA' else '' end
     || case when cl.pnc    then ' PNC'    else '' end
     || case when cl.estado_envase is null then '' else ' ' || cl.estado_envase end
     || case when cl.nota is null or cl.nota = '' then '' else ' ' || cl.nota end
  )                                                    as ubicacion_combinada,
  cl.cantidad_teorica,
  cl.cantidad_contada,
  cl.contado_por,
  per.nombre    as conto,
  cl.contado_en
from public.conteo_lineas cl
join public.conteos    c  on c.id = cl.conteo_id
join public.productos  p  on p.id = cl.producto_id
left join public.ubicaciones u on u.id = cl.ubicacion_id
left join public.perfiles  per on per.id = cl.contado_por;

-- El encabezado de la hoja: responsable, fecha de análisis, y cómo va.
create or replace view public.v_conteos_fefo as
select
  c.id, c.codigo, c.estado, c.bodega_id, b.codigo as bodega,
  c.responsable_id,
  per.nombre                         as responsable,   -- «RESPONSABLE»
  c.creado_en::date                  as fecha_analisis, -- «FECHA DE ANALISIS»
  c.iniciado_en, c.cerrado_en,
  count(cl.id)                       as renglones,
  count(distinct cl.ubicacion_id)    as ubicaciones,
  coalesce(sum(coalesce(p.cajas_por_estiba,0)*coalesce(cl.estibas,0)
               + coalesce(cl.cajas,0)), 0)::bigint as total_cajas
from public.conteos c
join public.bodegas b on b.id = c.bodega_id
left join public.perfiles per on per.id = c.responsable_id
left join public.conteo_lineas cl on cl.conteo_id = c.id
left join public.productos p on p.id = cl.producto_id
where c.tipo = 'fefo'
group by c.id, c.codigo, c.estado, c.bodega_id, b.codigo,
         c.responsable_id, per.nombre, c.creado_en, c.iniciado_en, c.cerrado_en;

-- ---------------------------------------------------------------------
-- 7. LAS DOS FUNCIONES QUE CAMBIAN DE COMPORTAMIENTO
-- ---------------------------------------------------------------------
create or replace function public.iniciar_conteo(p_conteo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_bodega uuid; v_tipo text;
begin
  select bodega_id, tipo into v_bodega, v_tipo
    from public.conteos where id = p_conteo_id and estado = 'borrador';
  if v_bodega is null then
    raise exception 'El conteo no existe o ya fue iniciado';
  end if;

  -- El general arranca con la lista completa; el FEFO arranca vacío.
  if v_tipo = 'general' then
    insert into public.conteo_lineas (conteo_id, producto_id, cantidad_teorica)
    select p_conteo_id, p.id, coalesce(e.cantidad, 0)
    from public.productos p
    left join public.existencias e on e.producto_id = p.id and e.bodega_id = v_bodega
    where p.activo
    on conflict do nothing;
  end if;

  update public.conteos set estado = 'en_proceso', iniciado_en = now() where id = p_conteo_id;
end $$;

-- `cerrar_conteo` SUMA POR PRODUCTO antes de ajustar.
--
-- Antes generaba un movimiento por renglón, lo cual daba igual cuando
-- había un renglón por producto. Con FEFO el mismo producto trae ocho
-- renglones —uno por módulo— y sin este `group by` el kardex recibiría
-- ocho ajustes parciales del mismo producto, cada uno restándole el
-- teórico COMPLETO. Eso no es un ajuste con ruido: es un inventario
-- destruido.
create or replace function public.cerrar_conteo(p_conteo_id uuid)
returns table (lineas_ajustadas integer)
language plpgsql
security definer
set search_path = public
as $$
declare v_bodega uuid; v_count integer := 0;
begin
  select bodega_id into v_bodega
    from public.conteos where id = p_conteo_id and estado = 'en_proceso';
  if v_bodega is null then
    raise exception 'El conteo no existe o no está en proceso';
  end if;

  with sumado as (
    select producto_id,
           sum(cantidad_contada) as contado,
           -- El teórico está repetido en cada renglón del mismo
           -- producto, así que se toma UNA vez y no se suma.
           max(cantidad_teorica) as teorico
      from public.conteo_lineas
     where conteo_id = p_conteo_id and cantidad_contada is not null
     group by producto_id
  ), dif as (
    select producto_id, (contado - teorico) as delta
      from sumado where contado <> teorico
  ), ins as (
    insert into public.movimientos
      (tipo, producto_id, bodega_id, cantidad, referencia, nota, conteo_id, usuario_id)
    select 'ajuste', producto_id, v_bodega, delta,
           'CONTEO', 'Ajuste automático por conteo físico', p_conteo_id, auth.uid()
    from dif
    returning 1
  )
  select count(*)::int into v_count from ins;

  update public.conteos set estado = 'cerrado', cerrado_en = now() where id = p_conteo_id;
  return query select v_count;
end $$;

-- ---------------------------------------------------------------------
-- 8. LO QUE USA EL CELULAR
-- ---------------------------------------------------------------------
-- NINGUNA ESCRITURA DIRECTA. El renglón no dice quién lo contó: se saca
-- de la sesión, que es la única forma de que no se pueda contar a nombre
-- de otro. Es lo que hace que «con el nombre de quien lo hizo» quiera
-- decir algo.
create or replace function public.conteo_fefo_abrir(p_bodega uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_cod text;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar para contar.';
  end if;

  -- El que ya tenga abierto, ese: quien vuelve del almuerzo sigue en su
  -- recorrido en vez de empezar otro y partir la mañana en dos.
  select id into v_id
    from public.conteos
   where responsable_id = auth.uid() and tipo = 'fefo'
     and bodega_id = p_bodega and estado = 'en_proceso'
   order by creado_en desc limit 1;
  if v_id is not null then return v_id; end if;

  v_cod := 'FEFO-' || to_char(current_date, 'YYYYMMDD') || '-' ||
           lpad((1 + (select count(*) from public.conteos
                       where tipo = 'fefo' and creado_en::date = current_date))::text, 2, '0');
  insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en)
       values (v_cod, p_bodega, 'fefo', 'en_proceso', auth.uid(), now())
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.conteo_fefo_agregar(
  p_conteo      uuid,
  p_sku         text,
  p_ubicacion   uuid,
  p_rotacion    boolean,
  p_estibas     integer  default null,
  p_cajas       integer  default null,
  p_venc_dia    smallint default null,
  p_venc_mes    smallint default null,
  p_venc_anio   smallint default null,
  p_averia      boolean  default false,
  p_pnc         boolean  default false,
  p_estado      text     default null,
  p_nota        text     default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod uuid; v_tipo text; v_factor integer;
  v_estado estado_conteo; v_dueno uuid; v_bodega uuid; v_linea uuid;
begin
  select estado, responsable_id, bodega_id into v_estado, v_dueno, v_bodega
    from public.conteos where id = p_conteo;
  if v_estado is null then raise exception 'Ese conteo no existe.'; end if;
  if v_dueno is distinct from auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  if v_estado <> 'en_proceso' then raise exception 'El conteo ya está cerrado.'; end if;

  select id, tipo_material, cajas_por_estiba into v_prod, v_tipo, v_factor
    from public.productos where sku = p_sku and activo;
  if v_prod is null then
    raise exception 'El código % no está en el maestro. Revísalo o pide que lo agreguen.', p_sku;
  end if;

  -- LA UBICACIÓN TIENE QUE SER DE ESTA BODEGA. Sin esto se podría contar
  -- un módulo de otro CD desde aquí — y como se escoge de una lista,
  -- pasaría sin que nadie lo notara.
  if not exists (select 1 from public.ubicaciones
                  where id = p_ubicacion and bodega_id = v_bodega and activa) then
    raise exception 'Esa ubicación no es de esta bodega o está inactiva.';
  end if;

  if coalesce(p_estibas, 0) + coalesce(p_cajas, 0) <= 0 then
    raise exception 'Hay que anotar estibas o cajas.';
  end if;
  if p_estibas is not null and p_cajas is not null then
    raise exception 'Estibas o cajas, no las dos: si hay estibas completas y sueltas, van en dos renglones.';
  end if;
  -- Se contesta en las 152 filas de la hoja real, así que aquí también.
  if p_rotacion is null then
    raise exception 'Falta decir si rota.';
  end if;
  -- El envase retornable no trae fecha impresa; el producto sí, siempre.
  if v_tipo = 'PRODUCTO' and p_venc_anio is null then
    raise exception 'Falta la fecha de vencimiento.';
  end if;

  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, cajas,
     venc_dia, venc_mes, venc_anio, rotacion, averia, pnc, estado_envase, nota,
     cantidad_contada, contado_por, contado_en)
  values
    (p_conteo, v_prod, p_ubicacion, p_estibas, p_cajas,
     p_venc_dia, p_venc_mes, p_venc_anio, p_rotacion,
     coalesce(p_averia, false), coalesce(p_pnc, false),
     nullif(trim(coalesce(p_estado, '')), ''), nullif(trim(coalesce(p_nota, '')), ''),
     coalesce(v_factor, 0) * coalesce(p_estibas, 0) + coalesce(p_cajas, 0),
     auth.uid(), now())
  returning id into v_linea;

  return v_linea;
end $$;

create or replace function public.conteo_fefo_borrar(p_linea uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_dueno uuid; v_estado estado_conteo;
begin
  select c.responsable_id, c.estado into v_dueno, v_estado
    from public.conteo_lineas l join public.conteos c on c.id = l.conteo_id
   where l.id = p_linea;
  if v_dueno is null then raise exception 'Ese renglón no existe.'; end if;
  if v_dueno is distinct from auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  if v_estado <> 'en_proceso' then raise exception 'El conteo ya está cerrado.'; end if;

  delete from public.conteo_lineas where id = p_linea;
end $$;

-- ---------------------------------------------------------------------
-- 9. PERMISOS
-- ---------------------------------------------------------------------
alter table public.ubicaciones    enable row level security;
alter table public.envase_estados enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ubicaciones','envase_estados'] loop
    execute format('drop policy if exists %I_ver on public.%I', t, t);
    execute format('create policy %I_ver on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_editar on public.%I', t, t);
    execute format($p$create policy %I_editar on public.%I for all to authenticated
                     using (public.es_editor()) with check (public.es_editor())$p$, t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Dar permiso sobre las tablas NO lo da sobre las vistas que las leen.
-- Se me olvidó una vez y la prueba lo cantó con «permission denied for
-- view».
grant select on public.v_conteo_fefo  to authenticated;
grant select on public.v_conteos_fefo to authenticated;

grant execute on function public.conteo_fefo_abrir(uuid) to authenticated;
grant execute on function public.conteo_fefo_agregar(uuid, text, uuid, boolean, integer, integer,
       smallint, smallint, smallint, boolean, boolean, text, text) to authenticated;
grant execute on function public.conteo_fefo_borrar(uuid) to authenticated;
