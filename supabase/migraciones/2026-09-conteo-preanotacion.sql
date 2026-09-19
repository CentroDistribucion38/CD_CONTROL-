-- =====================================================================
-- EL CONTEO SE VUELVE CONFIRMAR, NO ESCRIBIR
--
-- «Yo cuento hoy el A01 con 96 estibas de A1000. Que mañana, al
--  seleccionar el módulo, me aparezca la misma información preguardada
--  con la info de hoy, por si sigue igual, y un botón de registrar por
--  si cambia. Así solo sería confirmar el registro o editar únicamente
--  la cantidad.»
--
-- Y dos cosas más que salen del mismo sitio:
--
--   «Siempre siempre en el registro debe salir izquierdo y derecho.»
--   «Faltaría una tabla que les muestre si quedó algún módulo sin
--    contar.»
--
-- ---------------------------------------------------------------------
-- LO QUE ESTE ARCHIVO PONE
-- ---------------------------------------------------------------------
--
--   1. conteo_ubicacion_asegurar()  el lado que falta se crea al usarlo
--   2. v_conteo_ultimo_por_ubicacion  lo último contado en cada posición
--   3. conteo_sin_contar()          qué posiciones faltan del recorrido
--
-- ---------------------------------------------------------------------
-- POR QUÉ EL DELIMITADOR DE BLOQUE NO APARECE EN NINGÚN COMENTARIO
-- ---------------------------------------------------------------------
-- El editor de Supabase no ejecuta el archivo como una sola
-- transacción, y cuenta esos signos para saber dónde acaba cada
-- sentencia. Uno suelto dentro de un comentario parte una función por la
-- mitad y el error no señala el comentario.
--
-- ORDEN: después de supabase/migraciones/2026-09-inventario-fefo.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · EL LADO QUE FALTA SE CREA AL USARLO
--
-- La pantalla ofrecía solo los lados que el maestro tenía cargados, y en
-- la bodega hay módulos a medias: A01 existe como A01_IZQ y no como
-- A01_DER, así que contar el lado derecho de ese pasillo era imposible.
--
-- SE CREA AQUÍ Y NO EN LA PANTALLA porque la pantalla no puede: la
-- tabla de ubicaciones solo la escribe quien administra el maestro, y
-- quien cuenta no lo es. Esta función es `security definer` y da de alta
-- ESA ubicación y nada más.
--
-- HEREDA FAMILIA Y CAPACIDAD DEL OTRO LADO. Los dos lados de un módulo
-- guardan lo mismo casi siempre; copiarlas evita que el lado nuevo
-- nazca huérfano y que alguien tenga que ir al maestro a completarlo.
--
-- Y NO CREA NADA QUE YA EXISTA, ni siquiera inactivo: si el lado estaba
-- dado de baja a propósito, lo reactiva en vez de duplicarlo — la llave
-- única es (bodega, clave) y un segundo A01_DER no cabría.
-- ---------------------------------------------------------------------
create or replace function public.conteo_ubicacion_asegurar(
  p_bodega uuid,
  p_calle  text,
  p_modulo text,
  p_lado   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calle text := upper(btrim(coalesce(p_calle, '')));
  v_mod   text := upper(btrim(coalesce(p_modulo, '')));
  v_lado  text := nullif(upper(btrim(coalesce(p_lado, ''))), '');
  v_clave text; v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hay que haber entrado para contar.';
  end if;
  if v_calle = '' then
    raise exception 'Falta la calle.';
  end if;
  if v_lado is not null and v_lado not in ('IZQ', 'DER') then
    raise exception 'El lado solo puede ser IZQ o DER.';
  end if;
  if not exists (select 1 from public.bodegas where id = p_bodega) then
    raise exception 'Esa bodega no existe.';
  end if;

  /* LA CLAVE SE ARMA IGUAL QUE LAS 428 QUE YA ESTÁN: «A01_DER». Si se
     armara distinto, el módulo nuevo no se ordenaría ni se agruparía
     con los suyos y nadie sabría por qué. */
  v_clave := v_calle || v_mod || coalesce('_' || v_lado, '');

  select id into v_id from public.ubicaciones
   where bodega_id = p_bodega and clave = v_clave;

  if v_id is not null then
    update public.ubicaciones set activa = true where id = v_id and not activa;
    return v_id;
  end if;

  insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
  select p_bodega, v_clave, v_calle, v_mod, v_lado,
         /* Del otro lado del mismo módulo, si lo hay. */
         (select u.familia   from public.ubicaciones u
           where u.bodega_id = p_bodega and u.calle = v_calle and u.modulo = v_mod
             and u.familia is not null limit 1),
         (select u.capacidad from public.ubicaciones u
           where u.bodega_id = p_bodega and u.calle = v_calle and u.modulo = v_mod
             and u.capacidad is not null limit 1),
         true
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.conteo_ubicacion_asegurar(uuid, text, text, text) from public;
grant execute on function public.conteo_ubicacion_asegurar(uuid, text, text, text) to authenticated;

comment on function public.conteo_ubicacion_asegurar(uuid, text, text, text) is
  'Devuelve el id de la ubicación calle+módulo+lado, creándola si el maestro no la tiene. Es lo que permite que la pantalla de conteo ofrezca siempre izquierdo y derecho sin que el maestro esté completo.';

-- ---------------------------------------------------------------------
-- 2 · LO ÚLTIMO CONTADO EN CADA POSICIÓN
--
-- Es la pre-anotación: al escoger calle + módulo + lado, la pantalla
-- trae lo que se contó la última vez ahí, para confirmarlo o corregirle
-- la cantidad. Contar deja de ser escribir once campos y pasa a ser
-- mirar la estiba y decir «sigue igual».
--
-- SE TRAEN TODOS LOS RENGLONES DE ESE ÚLTIMO CONTEO, no el último
-- renglón. Una posición puede tener dos códigos —o el mismo con dos
-- vencimientos— y quedarse con uno solo obligaría a escribir el otro a
-- mano cada día, que es justo el trabajo que esto viene a quitar.
--
-- «EL ÚLTIMO» ES EL ÚLTIMO, venga de cuando venga. Si el A01_IZQ no se
-- cuenta hace tres días, trae el de hace tres días: una posición en
-- blanco por un día sin contar sería un formulario vacío justo donde
-- más ayuda hace falta.
--
-- `dense_rank` Y NO `row_number`: lo que se busca es el CONTEO más
-- reciente y TODAS sus líneas. Con `row_number` saldría una sola.
-- ---------------------------------------------------------------------
create or replace view public.v_conteo_ultimo_por_ubicacion as
with ordenadas as (
  select
    cl.id              as linea_id,
    cl.ubicacion_id,
    cl.conteo_id,
    c.codigo           as conteo_codigo,
    c.estado::text     as conteo_estado,
    coalesce(c.cerrado_en, c.iniciado_en, c.creado_en) as contado_en,
    cl.producto_id,
    p.sku              as codigo,
    p.nombre           as material,
    p.cajas_por_estiba as factor_estibado,
    cl.estibas, cl.cajas,
    cl.venc_dia, cl.venc_mes, cl.venc_anio,
    cl.rotacion, cl.averia, cl.pnc, cl.estado_envase, cl.nota,
    (coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0)
       + coalesce(cl.cajas, 0))::bigint as total_cajas,
    dense_rank() over (
      partition by cl.ubicacion_id
      order by coalesce(c.cerrado_en, c.iniciado_en, c.creado_en) desc, c.id desc
    ) as vuelta
  from public.conteo_lineas cl
  join public.conteos  c on c.id = cl.conteo_id
  join public.productos p on p.id = cl.producto_id
  where cl.ubicacion_id is not null
)
select linea_id, ubicacion_id, conteo_id, conteo_codigo, conteo_estado, contado_en,
       producto_id, codigo, material, factor_estibado,
       estibas, cajas, venc_dia, venc_mes, venc_anio,
       rotacion, averia, pnc, estado_envase, nota, total_cajas
  from ordenadas
 where vuelta = 1;

grant select on public.v_conteo_ultimo_por_ubicacion to authenticated;

comment on view public.v_conteo_ultimo_por_ubicacion is
  'Todos los renglones del ÚLTIMO conteo que tocó cada ubicación. Es la pre-anotación: se escoge la posición y sale lo que había, para confirmarlo o corregir la cantidad.';

-- ---------------------------------------------------------------------
-- 3 · QUÉ POSICIONES FALTAN DEL RECORRIDO
--
-- «Necesito información con la que yo pueda tener alertas y la visual.»
--
-- Lo que no se contó no deja rastro en ninguna parte: el borrador
-- enseña lo anotado, y un módulo que nadie caminó no aparece ni como
-- cero. Esta función lo da vuelta: parte de las 428 posiciones activas
-- de la bodega y quita las que el conteo ya tiene.
--
-- ES UNA FUNCIÓN Y NO UNA VISTA a propósito. Una vista tendría que
-- cruzar cada conteo contra las 428 posiciones de su bodega, y eso
-- crece con el número de conteos aunque solo se mire uno. Con el conteo
-- como parámetro se calcula el que se está mirando y nada más.
--
-- TRAE CUÁNDO SE CONTÓ POR ÚLTIMA VEZ, que es lo que convierte la lista
-- en una alerta: «sin contar» a secas son 428 renglones el primer día;
-- «sin contar y la última vez fue hace 12 días» son los que de verdad
-- hay que ir a caminar.
-- ---------------------------------------------------------------------
create or replace function public.conteo_sin_contar(p_conteo uuid)
returns table (
  ubicacion_id uuid,
  clave        text,
  calle        text,
  modulo       text,
  lado         text,
  familia      text,
  capacidad    integer,
  ultimo_en    timestamptz,
  dias_sin_contar integer
)
language sql
stable
security definer
set search_path = public
as $$
  with dueno as (
    select bodega_id from public.conteos where id = p_conteo
  ),
  ultimo as (
    select cl.ubicacion_id,
           max(coalesce(c.cerrado_en, c.iniciado_en, c.creado_en)) as cuando
      from public.conteo_lineas cl
      join public.conteos c on c.id = cl.conteo_id
     where c.id <> p_conteo
     group by cl.ubicacion_id
  )
  select u.id, u.clave, u.calle, u.modulo, u.lado, u.familia, u.capacidad,
         ul.cuando,
         case when ul.cuando is null then null
              else (current_date - (ul.cuando at time zone 'America/Bogota')::date)::int
         end
    from public.ubicaciones u
    join dueno d on d.bodega_id = u.bodega_id
    left join ultimo ul on ul.ubicacion_id = u.id
   where u.activa
     and not exists (
       select 1 from public.conteo_lineas cl
        where cl.conteo_id = p_conteo and cl.ubicacion_id = u.id)
   order by u.calle, u.modulo, u.lado nulls first;
$$;

revoke all on function public.conteo_sin_contar(uuid) from public;
grant execute on function public.conteo_sin_contar(uuid) to authenticated;

comment on function public.conteo_sin_contar(uuid) is
  'Las posiciones activas de la bodega del conteo que ese conteo todavía no tiene, con cuándo se contaron por última vez. Lo que no se cuenta no deja rastro en ninguna parte; esto lo da vuelta.';

-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := '';
begin
  if to_regprocedure('public.conteo_ubicacion_asegurar(uuid, text, text, text)') is null then
    v_falta := v_falta || ' · la función que crea el lado que falta'; end if;
  if to_regclass('public.v_conteo_ultimo_por_ubicacion') is null then
    v_falta := v_falta || ' · la vista de lo último contado en cada posición'; end if;
  if to_regprocedure('public.conteo_sin_contar(uuid)') is null then
    v_falta := v_falta || ' · la función de lo que falta por contar'; end if;

  if v_falta <> '' then
    raise exception 'No quedó todo. Falta:%', v_falta;
  end if;

  raise notice 'Listo. El conteo ya puede ofrecer los dos lados, traer lo último contado';
  raise notice 'en cada posición para confirmarlo, y decir qué módulos quedaron sin contar.';
end $$;
