-- =====================================================================
-- INVENTARIO · LA FECHA DE FABRICACIÓN, Y EL VENCIMIENTO CALCULADO
--
-- «Tengo que meter fecha de fabricación y mira cómo calcula la del
-- vencimiento.»
--
-- Y la cuenta ya estaba en el maestro: `vida_util`, en días, por
-- material. Vencimiento = fabricación + vida útil. Se comprobó que el
-- dato alcance antes de construir nada: los 462 productos activos tienen
-- vida útil, SIN UNA SOLA EXCEPCIÓN. Los 32 envases no la tienen y no la
-- necesitan —el envase retornable no trae fecha impresa— así que para
-- ellos esto no cambia nada.
--
-- POR QUÉ SE GUARDAN LAS DOS FECHAS, y no solo la que se tecleó:
--
--   · EL VENCIMIENTO ES LO QUE MANDA. De él salen «días para vencer» y
--     «días para salir», que es sobre lo que se decide un despacho.
--     Calcularlo en cada consulta a partir de la fabricación obligaría a
--     recalcularlo también en el tablero, en el informe y en el PDF — y
--     con eso a que puedan discrepar.
--
--   · LA FABRICACIÓN ES LO QUE SE LEYÓ EN LA ESTIBA. Si mañana alguien
--     corrige la vida útil de un material en el maestro, lo contado
--     ayer NO cambia: el vencimiento de ese renglón sigue siendo el que
--     se calculó ese día. Eso es correcto —un conteo es una foto— pero
--     sin la fabricación guardada no habría forma de recontar contra lo
--     que dice el cartón.
--
-- SE CALCULA EN LA BASE Y NO EN LA PANTALLA. Es la misma razón de
-- siempre: una cuenta escrita en dos sitios es una cuenta que algún día
-- dirá dos cosas.
--
-- Se puede correr varias veces.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.conteo_lineas') is null then
    raise exception 'Falta el módulo Inventario. Corre supabase/modulos/inventario.sql primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'conteo_lineas' and column_name = 'saldo') then
    raise exception
      'Falta supabase/migraciones/2026-09-conteo-saldo.sql. Ese va antes que este.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. LAS TRES CASILLAS DE LA FABRICACIÓN
--
-- Tres smallint y no una `date`, igual que el vencimiento: en la estiba
-- se lee «10 05 27» y se teclea en tres casillas. Guardarlo como fecha
-- obligaría a armarla en la pantalla, y una fecha a medio teclear —día
-- puesto, mes todavía no— no es una fecha.
-- ---------------------------------------------------------------------
alter table public.conteo_lineas
  add column if not exists fab_dia   smallint,
  add column if not exists fab_mes   smallint,
  add column if not exists fab_anio  smallint;

alter table public.conteo_lineas
  drop constraint if exists conteo_lineas_fab_completa;
alter table public.conteo_lineas
  add constraint conteo_lineas_fab_completa
  check ((fab_dia is null and fab_mes is null and fab_anio is null)
      or (fab_dia is not null and fab_mes is not null and fab_anio is not null));

comment on column public.conteo_lineas.fab_dia is
  'Día de la fecha de FABRICACIÓN leída en la estiba, cuando se tecleó esa '
  'en vez del vencimiento. El vencimiento se calcula y se guarda aparte.';


-- ---------------------------------------------------------------------
-- 2. LAS DOS FUNCIONES
--
-- `p_fab_*` va DE ÚLTIMO, después de `p_saldo`. Los que llaman lo hacen
-- por nombre, y meter parámetros en medio le cambia la posición a todos
-- los de atrás: una llamada posicional empezaría a pasar la fabricación
-- donde esperaba otra cosa, sin error y sin aviso.
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
  p_saldo       integer  default null,
  p_fab_dia     smallint default null,
  p_fab_mes     smallint default null,
  p_fab_anio    smallint default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod uuid; v_tipo text; v_factor integer; v_vida integer;
  v_estado estado_conteo; v_dueno uuid; v_bodega uuid; v_linea uuid;
  v_fab date; v_venc date;
  v_vd smallint; v_vm smallint; v_va smallint;
begin
  select estado, responsable_id, bodega_id into v_estado, v_dueno, v_bodega
    from public.conteos where id = p_conteo;
  if v_estado is null then raise exception 'Ese conteo no existe.'; end if;
  if v_dueno is distinct from auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  if v_estado <> 'en_proceso' then raise exception 'El conteo ya está cerrado.'; end if;

  select id, tipo_material, cajas_por_estiba, vida_util
    into v_prod, v_tipo, v_factor, v_vida
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
  if p_rotacion is null then raise exception 'Falta decir si rota.'; end if;

  /* ---------- EL VENCIMIENTO, DE DONDE VENGA ----------
     Si se tecleó la fabricación, se calcula: fabricación + vida útil del
     maestro. Si se tecleó el vencimiento, ese manda y la fabricación se
     guarda como vino —si vino—.

     EL MENSAJE DICE QUÉ MATERIAL Y CUÁNTO LE FALTA. «No se puede
     calcular» a secas manda a buscar el problema a la pantalla, cuando
     está en el maestro. */
  v_vd := p_venc_dia; v_vm := p_venc_mes; v_va := p_venc_anio;

  if p_fab_anio is not null then
    if num_nonnulls(p_fab_dia, p_fab_mes, p_fab_anio) <> 3 then
      raise exception 'La fecha de fabricación va completa: día, mes y año.';
    end if;
    begin
      v_fab := make_date(2000 + p_fab_anio, p_fab_mes::integer, p_fab_dia::integer);
    exception when others then
      raise exception 'El %/%/% no existe como fecha de fabricación.',
        p_fab_dia, p_fab_mes, p_fab_anio;
    end;

    if v_va is null then
      if coalesce(v_vida, 0) <= 0 then
        raise exception 'El material % no tiene vida útil en el maestro, así que no se puede calcular el vencimiento desde la fabricación. Téclea el vencimiento, o pide que le pongan la vida útil.', p_sku;
      end if;
      v_venc := v_fab + v_vida;
      v_vd := extract(day   from v_venc)::smallint;
      v_vm := extract(month from v_venc)::smallint;
      v_va := (extract(year from v_venc)::integer - 2000)::smallint;
    end if;
  end if;

  -- El envase retornable no trae fecha impresa; el producto sí, siempre.
  if v_tipo = 'PRODUCTO' and v_va is null then
    raise exception 'Falta la fecha: el vencimiento, o la de fabricación para calcularlo.';
  end if;

  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo,
     venc_dia, venc_mes, venc_anio, fab_dia, fab_mes, fab_anio,
     rotacion, averia, pnc, estado_envase, nota,
     cantidad_contada, contado_por, contado_en)
  values
    (p_conteo, v_prod, p_ubicacion, p_estibas, p_cajas, p_saldo,
     v_vd, v_vm, v_va, p_fab_dia, p_fab_mes, p_fab_anio,
     p_rotacion, coalesce(p_averia, false), coalesce(p_pnc, false),
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
  p_saldo       integer  default null,
  p_fab_dia     smallint default null,
  p_fab_mes     smallint default null,
  p_fab_anio    smallint default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod uuid; v_tipo text; v_factor integer; v_vida integer;
  v_estado estado_conteo; v_dueno uuid; v_bodega uuid;
  v_fab date; v_venc date;
  v_vd smallint; v_vm smallint; v_va smallint;
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
  if v_estado <> 'en_proceso' then raise exception 'El conteo ya se envió.'; end if;

  select id, tipo_material, cajas_por_estiba, vida_util
    into v_prod, v_tipo, v_factor, v_vida
    from public.productos where sku = p_sku and activo;
  if v_prod is null then raise exception 'El código % no está en el maestro.', p_sku; end if;

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

  v_vd := p_venc_dia; v_vm := p_venc_mes; v_va := p_venc_anio;

  if p_fab_anio is not null then
    if num_nonnulls(p_fab_dia, p_fab_mes, p_fab_anio) <> 3 then
      raise exception 'La fecha de fabricación va completa: día, mes y año.';
    end if;
    begin
      v_fab := make_date(2000 + p_fab_anio, p_fab_mes::integer, p_fab_dia::integer);
    exception when others then
      raise exception 'El %/%/% no existe como fecha de fabricación.',
        p_fab_dia, p_fab_mes, p_fab_anio;
    end;
    if v_va is null then
      if coalesce(v_vida, 0) <= 0 then
        raise exception 'El material % no tiene vida útil en el maestro, así que no se puede calcular el vencimiento desde la fabricación.', p_sku;
      end if;
      v_venc := v_fab + v_vida;
      v_vd := extract(day   from v_venc)::smallint;
      v_vm := extract(month from v_venc)::smallint;
      v_va := (extract(year from v_venc)::integer - 2000)::smallint;
    end if;
  end if;

  if v_tipo = 'PRODUCTO' and v_va is null then
    raise exception 'Falta la fecha: el vencimiento, o la de fabricación para calcularlo.';
  end if;

  update public.conteo_lineas set
    producto_id = v_prod, ubicacion_id = p_ubicacion,
    estibas = p_estibas, cajas = p_cajas, saldo = p_saldo,
    venc_dia = v_vd, venc_mes = v_vm, venc_anio = v_va,
    fab_dia = p_fab_dia, fab_mes = p_fab_mes, fab_anio = p_fab_anio,
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
  smallint, smallint, smallint, boolean, boolean, text, text, integer,
  smallint, smallint, smallint) to authenticated;
grant execute on function public.conteo_fefo_editar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer,
  smallint, smallint, smallint) to authenticated;

/* LAS FIRMAS VIEJAS SE VAN. Postgres no reemplaza una función cuando le
   cambia la lista de parámetros: crea una SEGUNDA. Con las dos vivas,
   una llamada sin `p_fab_*` entraría por la de antes —guardando bien,
   sin fabricación— y nadie se enteraría hasta que hiciera falta
   recontar contra el cartón. */
drop function if exists public.conteo_fefo_agregar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer);
drop function if exists public.conteo_fefo_editar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer);


-- ---------------------------------------------------------------------
-- 3. LA VISTA, CON LA FABRICACIÓN
--
-- `drop` y no `create or replace`: gana columnas en medio. Copiada, no
-- reescrita de memoria.
-- ---------------------------------------------------------------------
drop view if exists public.v_conteo_fefo;

create view public.v_conteo_fefo as
select
  cl.id, cl.conteo_id, c.codigo as conteo, c.estado, c.tipo,
  cl.producto_id,
  p.sku as codigo, p.nombre as material, p.tipo_material, p.familia, p.vida_util,
  p.cajas_por_estiba as factor_estibado,
  cl.ubicacion_id, u.clave as ubicacion, u.calle, u.modulo, u.lado, u.capacidad,
  cl.estibas, cl.cajas, cl.saldo,

  (coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0)
     + coalesce(cl.cajas, 0)
     + coalesce(cl.saldo, 0))::bigint as total_cajas,
  coalesce(cl.estibas, 0) as total_estibas,

  cl.venc_dia, cl.venc_mes, cl.venc_anio,
  cl.fab_dia, cl.fab_mes, cl.fab_anio,
  case when cl.fab_anio is null then null::date
       else make_date(2000 + cl.fab_anio, cl.fab_mes::integer, cl.fab_dia::integer) end as fabricacion,
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


-- ---------------------------------------------------------------------
-- 4. QUE HAYA QUEDADO
-- ---------------------------------------------------------------------
do $$
declare v_falla text := '';
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'conteo_lineas' and column_name = 'fab_anio') then
    v_falla := v_falla || ' falta la columna fab_anio;';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_conteo_fefo' and column_name = 'fabricacion') then
    v_falla := v_falla || ' la vista no trae la fabricación;';
  end if;
  if (select count(*) from pg_proc
       where proname in ('conteo_fefo_agregar', 'conteo_fefo_editar')
         and pronamespace = 'public'::regnamespace) <> 2 then
    v_falla := v_falla || ' quedó viva alguna firma vieja de agregar/editar;';
  end if;
  if v_falla <> '' then raise exception 'Quedó a medias:%', v_falla; end if;
  raise notice 'Fabricación lista: se teclea la de fábrica y el vencimiento sale de la vida útil del maestro.';
end $$;

commit;
