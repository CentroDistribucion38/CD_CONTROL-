begin;

-- =====================================================================
-- «ESE MATERIAL NO EXISTE O ESTÁ DESACTIVADO» — por qué salía
--
-- ---------------------------------------------------------------------
-- LA PANTALLA OFRECÍA UNA COSA Y LA BASE EXIGÍA OTRA
-- ---------------------------------------------------------------------
-- El desplegable de «qué se rompió» lee `v_roturas_materiales_maestro`,
-- que es el maestro de INVENTARIO: `public.productos`, con sus
-- cuatrocientos y pico de SKU. Eso se hizo a propósito —«tenemos un
-- maestro de producto y envase; esa data la necesito también para el
-- desplegable de Quiebra en sitio»—.
--
-- Pero `rotura_registrar` nunca se enteró: siguió comprobando contra
-- `public.roturas_materiales`, la tabla vieja del módulo, con los siete
-- de siempre. Así que al escoger cualquier producto del maestro que no
-- estuviera en esa tabla, la base lo rechazaba con «Ese material no
-- existe o está desactivado» — un mensaje que además echa la culpa al
-- maestro, cuando el maestro estaba bien.
--
-- ES EL PEOR TIPO DE ERROR DE ESTE PROYECTO y ya tiene nombre: una
-- pantalla que ofrece algo que la base niega convierte una regla
-- correcta en un regaño, y quien lo recibe está de pie en la bodega con
-- la estiba rota al lado.
--
-- ---------------------------------------------------------------------
-- EL ARREGLO: LA BASE MIRA DONDE MIRA LA PANTALLA
-- ---------------------------------------------------------------------
-- Si el material escogido no está en `roturas_materiales` pero SÍ está
-- en el maestro de Inventario, se da de alta ahí con los datos del
-- maestro y se sigue.
--
-- SE DA DE ALTA Y NO SE QUITA LA LLAVE FORÁNEA, a propósito:
-- `roturas.material` apunta a `roturas_materiales(clave)` y esa llave
-- es lo que impide que el histórico termine apuntando a un material que
-- ya no existe. Quitarla para «arreglar» esto habría cambiado un error
-- que se ve por uno que no se ve.
--
-- Se puede correr varias veces sin romper nada.
-- =====================================================================

do $bloque$
declare v_falta text := '';
begin
  if to_regclass('public.roturas_materiales') is null then
    v_falta := v_falta || ' supabase/modulos/roturas.sql'; end if;
  if to_regclass('public.v_roturas_materiales_maestro') is null then
    v_falta := v_falta || ' 2026-09-roturas-maestro-unico-y-opm.sql'; end if;
  if v_falta <> '' then
    raise exception 'Falta correr antes:% — corre ese o esos archivos primero y vuelve a correr este.', v_falta;
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 1. TRAER UN MATERIAL DEL MAESTRO DE INVENTARIO
--
-- EN UNA FUNCIÓN Y NO PEGADO DENTRO DE `rotura_registrar`: lo van a
-- necesitar también el registro de salida y el de línea el día que
-- escojan del mismo maestro. Copiado en tres sitios son tres reglas que
-- un día se contestan distinto — que es exactamente lo que acaba de
-- pasar aquí.
--
-- DEVUELVE LA CLAVE si el material se puede usar, y nulo si ni siquiera
-- está en el maestro de Inventario. Quien la llama decide qué decir.
-- ---------------------------------------------------------------------
create or replace function public.rotura_material_asegurar(p_clave text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_clave text; m record;
begin
  v_clave := nullif(btrim(coalesce(p_clave, '')), '');
  if v_clave is null then return null; end if;

  /* YA ESTÁ Y ESTÁ ACTIVO: no se toca nada. */
  if exists (select 1 from public.roturas_materiales r
              where r.clave = v_clave and r.activo) then
    return v_clave;
  end if;

  /* ESTÁ PERO APAGADO: NO se prende solo. Apagarlo fue una decisión de
     alguien —«deja de ofrecerse al registrar»— y volver a prenderlo por
     la puerta de atrás la anularía en silencio. Se devuelve nulo y el
     que llama dice que está apagado. */
  if exists (select 1 from public.roturas_materiales r where r.clave = v_clave) then
    return null;
  end if;

  /* NO ESTÁ. Si el maestro de Inventario lo tiene, se copia aquí: es el
     mismo material, y el desplegable ya lo estaba ofreciendo. */
  select * into m from public.v_roturas_materiales_maestro v where v.clave = v_clave;
  if not found then return null; end if;

  insert into public.roturas_materiales
         (clave, nombre, tipo, color, botellas_x_empaque, activo)
  values (m.clave, m.nombre, m.tipo::rotura_tipo,
          m.color::vidrio_color, m.botellas_x_empaque, true)
  /* SI DOS PERSONAS REGISTRAN A LA VEZ EL MISMO MATERIAL NUEVO, la
     segunda no se cae: el `do nothing` la deja seguir. */
  on conflict (clave) do nothing;

  return v_clave;
end $$;
grant execute on function public.rotura_material_asegurar(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. LAS QUE YA ESTABAN OFRECIÉNDOSE, DE UNA VEZ
--
-- Los materiales del maestro de Inventario que la pantalla lleva
-- ofreciendo desde que se hizo el cambio. Sin esto, el primero que
-- registre cada uno se lo encuentra en el momento malo.
-- ---------------------------------------------------------------------
insert into public.roturas_materiales (clave, nombre, tipo, color, botellas_x_empaque, activo)
select v.clave, v.nombre, v.tipo::rotura_tipo, v.color::vidrio_color,
       v.botellas_x_empaque, true
  from public.v_roturas_materiales_maestro v
 where not exists (select 1 from public.roturas_materiales r where r.clave = v.clave)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 3. REGISTRAR — MIRANDO DONDE MIRA LA PANTALLA
--
-- Se reescribe entera porque cambia la resolución del material. El
-- resto va igual que en 2026-09-roturas-sitio-area-causas.sql.
-- ---------------------------------------------------------------------
create or replace function public.rotura_registrar(
  p_material     text default null,
  p_unidades     integer default 1,
  p_contaminadas integer default null,
  p_botellas     integer default null,
  p_proceso      text default null,
  p_causa        text default null,
  p_descripcion  text default null,
  p_lat          numeric default null,
  p_lng          numeric default null,
  p_precision    numeric default null,
  p_area         text default null,
  p_color        text default null
)
returns table (id uuid, codigo text, exige_foto boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mat   text;
  v_pedido text;
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

  v_pedido := nullif(btrim(coalesce(p_material, '')), '');

  /* EL MATERIAL, O EL COLOR. En EER la pantalla puede mandar solo el
     color y de aquí sale el material: es una traducción, no una
     adivinanza — hay exactamente un material de EER por color. */
  if v_pedido is null then
    if p_color is null then
      raise exception 'Hay que decir qué se rompió: el material, o el color del envase';
    end if;
    select m.clave into v_mat
      from public.roturas_materiales m
     where m.tipo = 'eer' and m.color = p_color::vidrio_color and m.activo
     order by m.orden nulls last, m.clave
     limit 1;
    if v_mat is null then
      raise exception 'No hay envase retornable % activo en el maestro', p_color;
    end if;
  else
    /* AQUÍ ESTABA EL ERROR. Antes se comprobaba solo contra
       `roturas_materiales` y la pantalla ofrecía el maestro de
       Inventario: escoger cualquier producto del maestro daba «Ese
       material no existe o está desactivado» con la estiba rota al
       lado. */
    v_mat := public.rotura_material_asegurar(v_pedido);
    if v_mat is null then
      /* Y SE DICE CUÁL DE LAS DOS COSAS PASA, porque se arreglan en
         sitios distintos: apagado se prende en el maestro de Roturas;
         ausente quiere decir que ni siquiera está en Inventario. */
      if exists (select 1 from public.roturas_materiales r where r.clave = v_pedido) then
        raise exception 'El material % está apagado en el maestro de Roturas: préndelo ahí y vuelve a intentar', v_pedido;
      end if;
      raise exception 'El material % no está en el maestro de Inventario', v_pedido;
    end if;
  end if;

  select m.tipo, m.color, m.botellas_x_empaque into v_tipo, v_color, v_bxe
    from public.roturas_materiales m where m.clave = v_mat and m.activo;
  if not found then
    raise exception 'Ese material no existe o está desactivado';
  end if;

  p_unidades     := coalesce(p_unidades, 0);
  p_contaminadas := case when v_tipo = 'producto_terminado'
                         then coalesce(p_contaminadas, 0) else null end;

  if p_unidades + coalesce(p_contaminadas, 0) <= 0 then
    raise exception 'Hay que decir cuántas unidades se rompieron o se contaminaron';
  end if;

  if not exists (select 1 from public.roturas_procesos where clave = p_proceso and activo) then
    raise exception 'Ese proceso no existe o está desactivado';
  end if;

  /* EL ÁREA ES OBLIGATORIA DE AQUÍ EN ADELANTE. La columna admite nulo
     por lo de antes; lo nuevo no entra sin ella. */
  if nullif(btrim(coalesce(p_area, '')), '') is null then
    raise exception 'Hay que decir en qué área pasó la rotura';
  end if;
  if not exists (select 1 from public.roturas_areas where clave = p_area and activo) then
    raise exception 'Esa área no existe o está desactivada';
  end if;

  select c.grupo, c.exige_foto into v_grupo, v_foto
    from public.roturas_causas c where c.clave = p_causa and c.activo;
  if not found then
    raise exception 'Esa causa no existe o está desactivada';
  end if;

  /* EL PRODUCTO TERMINADO SE ABRE EN DOS. Si no se dice cuántas
     botellas se rompieron adentro, se proponen todas las que caben: es
     lo más probable cuando una estiba se cae, y la pantalla lo deja
     corregir. En EER no hay botellas que separar. */
  if v_tipo = 'producto_terminado' then
    p_botellas := coalesce(p_botellas, p_unidades * coalesce(v_bxe, 0));
    if v_bxe is not null and p_botellas > p_unidades * v_bxe then
      raise exception 'No pueden romperse más botellas (%) que las que caben en % unidades (%)',
        p_botellas, p_unidades, p_unidades * v_bxe;
    end if;
  else
    p_botellas := null;
  end if;

  v_cod := 'RB-' || lpad(nextval('public.roturas_codigo_seq')::text, 4, '0');

  insert into public.roturas
    (codigo, material, tipo, color, unidades, contaminadas, botellas,
     proceso, area, causa, grupo,
     descripcion, lat, lng, precision_m, estado, reportada_por)
  values
    (v_cod, v_mat, v_tipo, v_color, p_unidades, p_contaminadas, p_botellas,
     p_proceso, p_area, p_causa, v_grupo,
     nullif(btrim(coalesce(p_descripcion, '')), ''),
     p_lat, p_lng, p_precision, 'esperando', auth.uid())
  returning roturas.id into v_id;

  return query select v_id, v_cod, v_foto;
end $$;

grant execute on function public.rotura_registrar(text, integer, integer, integer, text, text, text, numeric, numeric, numeric, text, text)
  to authenticated;

do $$
declare v_n int; v_tot int;
begin
  select count(*) into v_tot from public.roturas_materiales;
  select count(*) into v_n from public.v_roturas_materiales_maestro v
   where not exists (select 1 from public.roturas_materiales r where r.clave = v.clave);
  raise notice 'Maestro de roturas: % materiales. Del maestro de Inventario quedan % sin copiar (deberia ser 0).', v_tot, v_n;
  raise notice 'La pantalla y la base ya miran el mismo maestro: escoger un producto de Inventario deja de dar «Ese material no existe».';
end $$;

commit;
