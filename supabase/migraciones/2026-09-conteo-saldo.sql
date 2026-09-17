-- =====================================================================
-- INVENTARIO · EL SALDO, COMO TERCERA CIFRA
--
-- Hasta hoy el renglón tenía dos cantidades —estibas o cajas— y el
-- formulario obligaba a escoger una. Falta la tercera, que es la que más
-- se camina: EL SALDO.
--
-- POR QUÉ NO ALCANZA CON METERLO EN «CAJAS». Aritméticamente daría lo
-- mismo: las tres terminan en cajas. Pero entonces el informe no podría
-- separar un saldo de unas cajas sueltas, y son dos cosas distintas en
-- el piso —un saldo es lo que queda de una estiba y se recuenta
-- mirándola; unas cajas sueltas están en otro lado—. Una vez guardadas
-- juntas no hay manera de volverlas a separar, así que la columna va
-- desde el principio.
--
-- QUÉ TOCA ESTE ARCHIVO
--   1. La columna `saldo` en `conteo_lineas`.
--   2. El candado de «una sola cantidad por renglón», que antes miraba
--      dos y ahora mira tres.
--   3. `v_conteo_fefo` y `v_conteos_fefo`: el total de cajas suma la
--      tercera. LAS DOS VISTAS, y esto importa — si solo se arregla una,
--      el tablero y el conteo dicen cifras distintas del mismo día.
--   4. `conteo_fefo_agregar` y `conteo_fefo_editar`: un parámetro más.
--
-- LO QUE NO TOCA: la llave única. El saldo NO entra en ella. La llave
-- dice qué es un renglón repetido —mismo conteo, producto, ubicación,
-- fecha, avería y PNC— y dos saldos distintos del mismo producto en el
-- mismo módulo y con la misma fecha SIGUEN siendo el mismo renglón: hay
-- que sumarlos o corregir el que está, no agregar otro.
--
-- Se puede correr varias veces.
-- =====================================================================

/* TODO EL ARCHIVO EN UNA TRANSACCIÓN. psql confirma cada sentencia por
   su cuenta, así que sin esto una falla a mitad deja la base con las
   vistas BORRADAS y la columna a medio agregar — que es exactamente lo
   que pasó la primera vez que corrí este archivo. Con `begin` no queda
   nada aplicado si algo revienta. */
begin;

do $$
begin
  if to_regclass('public.conteo_lineas') is null then
    raise exception
      'Falta el módulo Inventario. Corre supabase/modulos/inventario.sql, luego 2026-09-inventario-fefo.sql y 2026-09-conteo-borrador.sql, y vuelve aquí.';
  end if;
  if to_regproc('public.conteo_fefo_editar') is null then
    raise exception
      'Falta supabase/migraciones/2026-09-conteo-borrador.sql. Ese va antes que este.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. LA COLUMNA
-- ---------------------------------------------------------------------
alter table public.conteo_lineas
  add column if not exists saldo integer;

comment on column public.conteo_lineas.saldo is
  'Cajas que quedan en una estiba incompleta. Se guarda aparte de `cajas` '
  '—las sueltas— porque en el piso son dos cosas distintas y una vez '
  'sumadas no se pueden volver a separar.';


-- ---------------------------------------------------------------------
-- 2. UNA SOLA CANTIDAD POR RENGLÓN
--
-- El candado viejo miraba dos columnas. Con tres, `a is null or b is
-- null` ya no dice lo que hay que decir: hay que contar cuántas vienen
-- llenas. Se cuenta con `num_nonnulls`, que es exactamente para esto.
--
-- SE PERMITE CERO LLENAS a nivel de tabla, y no es un descuido: el
-- conteo general siembra 494 renglones vacíos para que alguien los
-- camine, y esos no tienen cantidad todavía. Quien exige que venga UNA
-- es la función de agregar, que es por donde entra el conteo FEFO.
-- ---------------------------------------------------------------------
alter table public.conteo_lineas
  drop constraint if exists conteo_lineas_una_cantidad;

/* El nombre viejo se va: decía «estibas o cajas» y ya son tres. Dejar
   los dos habría hecho que el candado nuevo no se pudiera violar nunca
   —el viejo revienta antes— y un candado que nunca se alcanza es un
   candado que nadie mantiene. */
alter table public.conteo_lineas
  drop constraint if exists conteo_lineas_estibas_o_cajas;

alter table public.conteo_lineas
  add constraint conteo_lineas_una_cantidad
  check (num_nonnulls(estibas, cajas, saldo) <= 1);


-- ---------------------------------------------------------------------
-- 3. LAS DOS VISTAS
--
-- Van con `drop` y no con `create or replace`: `v_conteo_fefo` gana la
-- columna `saldo` en medio, y Postgres solo deja reemplazar una vista si
-- las columnas viejas quedan iguales y en el mismo orden. Con `replace`
-- revienta con «cannot change name of view column» y la migración no
-- pasa ni la primera vez. Ya ocurrió en este proyecto.
--
-- Y EL ORDEN DE LOS DROP IMPORTA: `v_conteos_fefo` —la del resumen— no
-- depende de `v_conteo_fefo`, pero las dos dependen de las mismas
-- tablas, así que se rehacen juntas para que no quede media migración
-- aplicada si algo falla en medio.
-- ---------------------------------------------------------------------
drop view if exists public.v_conteos_fefo;
drop view if exists public.v_conteo_fefo;

/* LAS DOS VISTAS VAN COPIADAS DE LO QUE HAY, con el saldo agregado y
   nada más. La primera versión de este archivo las reescribió de
   memoria y se inventó columnas —`c.fecha` en vez de
   `c.creado_en::date`— y la migración reventó a mitad de camino, con
   las vistas ya borradas. De ahí salieron las dos cosas de abajo: esto
   se copia, y todo el archivo va en una transacción. */
create view public.v_conteo_fefo as
select
  cl.id, cl.conteo_id, c.codigo as conteo, c.estado, c.tipo,
  cl.producto_id,
  p.sku as codigo, p.nombre as material, p.tipo_material, p.familia, p.vida_util,
  p.cajas_por_estiba as factor_estibado,
  cl.ubicacion_id, u.clave as ubicacion, u.calle, u.modulo, u.lado, u.capacidad,
  cl.estibas, cl.cajas, cl.saldo,

  /* LAS TRES CANTIDADES CAEN AQUÍ. La estiba se multiplica por su
     factor; las cajas sueltas y el saldo entran como están. El material
     sin factor aporta CERO por la estiba —no se inventa un 1— y por eso
     el maestro grita cuáles le faltan. */
  (coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0)
     + coalesce(cl.cajas, 0)
     + coalesce(cl.saldo, 0))::bigint as total_cajas,
  coalesce(cl.estibas, 0) as total_estibas,

  cl.venc_dia, cl.venc_mes, cl.venc_anio,
  case when cl.venc_anio is null then null::date
       else make_date(2000 + cl.venc_anio, cl.venc_mes::integer, cl.venc_dia::integer) end as vencimiento,
  case when cl.venc_anio is null then null::integer
       when p.tipo_material = 'ENVASE' then 0
       else make_date(2000 + cl.venc_anio, cl.venc_mes::integer, cl.venc_dia::integer) - current_date
  end as dias_para_vencer,
  case when cl.venc_anio is null then null::integer
       else make_date(2000 + cl.venc_anio, cl.venc_mes::integer, cl.venc_dia::integer)
            - current_date - coalesce(p.dias_minimo, 0)
  end as dias_para_salir,

  cl.rotacion, cl.averia, cl.pnc, cl.estado_envase, cl.nota,
  u.clave as ubicacion_texto,
  u.clave
    || case when cl.averia then ' AVERIA' else '' end
    || case when cl.pnc then ' PNC' else '' end
    || case when cl.estado_envase is null then '' else ' ' || cl.estado_envase end
    || case when cl.nota is null or cl.nota = '' then '' else ' ' || cl.nota end
    as ubicacion_combinada,
  cl.cantidad_teorica, cl.cantidad_contada,
  cl.contado_por, per.nombre as conto, cl.contado_en
from public.conteo_lineas cl
join public.conteos c on c.id = cl.conteo_id
join public.productos p on p.id = cl.producto_id
left join public.ubicaciones u on u.id = cl.ubicacion_id
left join public.perfiles per on per.id = cl.contado_por;

grant select on public.v_conteo_fefo to authenticated;

create view public.v_conteos_fefo as
select
  c.id, c.codigo, c.estado, c.bodega_id, b.codigo as bodega,
  c.responsable_id,
  per.nombre                         as responsable,
  c.creado_en::date                  as fecha_analisis,
  c.iniciado_en, c.cerrado_en,
  c.enviado_en,
  env.nombre                         as envio_nombre,
  c.nota_envio,
  count(cl.id)                       as renglones,
  count(distinct cl.ubicacion_id)    as ubicaciones,
  coalesce(sum(coalesce(p.cajas_por_estiba,0)*coalesce(cl.estibas,0)
               + coalesce(cl.cajas,0)
               + coalesce(cl.saldo,0)), 0)::bigint as total_cajas
from public.conteos c
join public.bodegas b on b.id = c.bodega_id
left join public.perfiles per on per.id = c.responsable_id
left join public.perfiles env on env.id = c.enviado_por
left join public.conteo_lineas cl on cl.conteo_id = c.id
left join public.productos p on p.id = cl.producto_id
where c.tipo = 'fefo'
group by c.id, c.codigo, c.estado, c.bodega_id, b.codigo, c.responsable_id,
         per.nombre, c.creado_en, c.iniciado_en, c.cerrado_en, c.enviado_en,
         env.nombre, c.nota_envio;

grant select on public.v_conteos_fefo to authenticated;


-- ---------------------------------------------------------------------
-- 4. LAS DOS FUNCIONES
--
-- `p_saldo` va DE ÚLTIMO en la lista de parámetros aunque en la pantalla
-- aparezca junto a estibas y cajas. Es a propósito: los que llaman lo
-- hacen por nombre, y agregarlo en medio le cambiaría la posición a
-- todos los de atrás. Una llamada posicional que hoy pasa la fecha
-- empezaría a pasar el saldo, sin error y sin aviso.
-- ---------------------------------------------------------------------
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
  p_nota        text     default null,
  p_saldo       integer  default null
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

  if not exists (select 1 from public.ubicaciones
                  where id = p_ubicacion and bodega_id = v_bodega and activa) then
    raise exception 'Esa ubicación no es de esta bodega o está inactiva.';
  end if;

  if coalesce(p_estibas, 0) + coalesce(p_cajas, 0) + coalesce(p_saldo, 0) <= 0 then
    raise exception 'Hay que anotar estibas, cajas o saldo.';
  end if;
  if num_nonnulls(p_estibas, p_cajas, p_saldo) > 1 then
    raise exception 'Una sola cantidad por renglón: estibas, cajas o saldo. Si hay de varias, van en renglones aparte.';
  end if;
  if p_rotacion is null then
    raise exception 'Falta decir si rota.';
  end if;
  if v_tipo = 'PRODUCTO' and p_venc_anio is null then
    raise exception 'Falta la fecha de vencimiento.';
  end if;

  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo,
     venc_dia, venc_mes, venc_anio, rotacion, averia, pnc, estado_envase, nota,
     cantidad_contada, contado_por, contado_en)
  values
    (p_conteo, v_prod, p_ubicacion, p_estibas, p_cajas, p_saldo,
     p_venc_dia, p_venc_mes, p_venc_anio, p_rotacion,
     coalesce(p_averia, false), coalesce(p_pnc, false),
     nullif(trim(coalesce(p_estado, '')), ''), nullif(trim(coalesce(p_nota, '')), ''),
     coalesce(v_factor, 0) * coalesce(p_estibas, 0)
       + coalesce(p_cajas, 0) + coalesce(p_saldo, 0),
     auth.uid(), now())
  returning id into v_linea;

  return v_linea;
end $$;


create or replace function public.conteo_fefo_editar(
  p_linea       uuid,
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
  p_nota        text     default null,
  p_saldo       integer  default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod uuid; v_tipo text; v_factor integer;
  v_estado estado_conteo; v_dueno uuid; v_bodega uuid;
begin
  select c.estado, c.responsable_id, c.bodega_id
    into v_estado, v_dueno, v_bodega
    from public.conteo_lineas cl
    join public.conteos c on c.id = cl.conteo_id
   where cl.id = p_linea;

  if v_estado is null then raise exception 'Ese renglón no existe.'; end if;
  if v_dueno is distinct from auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  /* UN CONTEO ENVIADO YA NO SE CORRIGE. Cambiar lo que alguien dio por
     bueno, sin dejar rastro, no puede ser un botón. */
  if v_estado <> 'en_proceso' then raise exception 'El conteo ya se envió.'; end if;

  select id, tipo_material, cajas_por_estiba into v_prod, v_tipo, v_factor
    from public.productos where sku = p_sku and activo;
  if v_prod is null then
    raise exception 'El código % no está en el maestro.', p_sku;
  end if;

  if not exists (select 1 from public.ubicaciones
                  where id = p_ubicacion and bodega_id = v_bodega and activa) then
    raise exception 'Esa ubicación no es de esta bodega o está inactiva.';
  end if;

  if coalesce(p_estibas, 0) + coalesce(p_cajas, 0) + coalesce(p_saldo, 0) <= 0 then
    raise exception 'Hay que anotar estibas, cajas o saldo.';
  end if;
  if num_nonnulls(p_estibas, p_cajas, p_saldo) > 1 then
    raise exception 'Una sola cantidad por renglón: estibas, cajas o saldo.';
  end if;
  if p_rotacion is null then raise exception 'Falta decir si rota.'; end if;
  if v_tipo = 'PRODUCTO' and p_venc_anio is null then
    raise exception 'Falta la fecha de vencimiento.';
  end if;

  update public.conteo_lineas set
    producto_id = v_prod, ubicacion_id = p_ubicacion,
    estibas = p_estibas, cajas = p_cajas, saldo = p_saldo,
    venc_dia = p_venc_dia, venc_mes = p_venc_mes, venc_anio = p_venc_anio,
    rotacion = p_rotacion,
    averia = coalesce(p_averia, false), pnc = coalesce(p_pnc, false),
    estado_envase = nullif(trim(coalesce(p_estado, '')), ''),
    nota = nullif(trim(coalesce(p_nota, '')), ''),
    cantidad_contada = coalesce(v_factor, 0) * coalesce(p_estibas, 0)
                       + coalesce(p_cajas, 0) + coalesce(p_saldo, 0),
    contado_por = auth.uid(), contado_en = now()
  where id = p_linea;
end $$;

grant execute on function public.conteo_fefo_agregar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer) to authenticated;
grant execute on function public.conteo_fefo_editar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer) to authenticated;

/* LAS VERSIONES VIEJAS SE VAN. Postgres no reemplaza una función cuando
   cambia su firma: crea una SEGUNDA con la lista de parámetros vieja, y
   las dos quedan vivas. Entonces una llamada sin `p_saldo` seguiría
   entrando por la de antes —guardando bien, pero sin saldo— y nadie se
   enteraría hasta que el informe no cuadrara. */
drop function if exists public.conteo_fefo_agregar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text);
drop function if exists public.conteo_fefo_editar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text);


-- ---------------------------------------------------------------------
-- 5. QUE HAYA QUEDADO
-- ---------------------------------------------------------------------
do $$
declare v_falla text := '';
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'conteo_lineas' and column_name = 'saldo') then
    v_falla := v_falla || ' falta la columna saldo;';
  end if;

  if (select count(*) from pg_proc
       where proname = 'conteo_fefo_agregar' and pronamespace = 'public'::regnamespace) <> 1 then
    v_falla := v_falla || ' quedó más de una versión de conteo_fefo_agregar;';
  end if;
  if (select count(*) from pg_proc
       where proname = 'conteo_fefo_editar' and pronamespace = 'public'::regnamespace) <> 1 then
    v_falla := v_falla || ' quedó más de una versión de conteo_fefo_editar;';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_conteo_fefo' and column_name = 'saldo') then
    v_falla := v_falla || ' la vista no trae saldo;';
  end if;

  if v_falla <> '' then raise exception 'Quedó a medias:%', v_falla; end if;
  raise notice 'Saldo listo: la columna, el candado de una sola cantidad, las dos vistas y las dos funciones.';
end $$;

commit;
