-- =====================================================================
-- ROTURAS EN SITIO · LO QUE SE COBRA, Y LA UNIDAD CON LA QUE SE CUENTA
--
-- Dos cosas, y la primera hay que hacerla antes de multiplicar por plata.
--
-- ---------------------------------------------------------------------
-- 1. UNA UNIDAD ES UNA BOTELLA
--
-- Al registrar, la base guardaba `botellas = unidades x botellas_por_
-- empaque`. Con 200 unidades de un material de 30 por caja escribia
-- 6.000, y `unidades_vidrio` --lo que pinta el analisis-- lee esa
-- columna. Todo el vidrio de en sitio esta inflado TREINTA VECES.
--
-- No se notaba desde la pantalla porque el numero era grande pero
-- coherente consigo mismo: nada cuadraba con nada de fuera.
--
-- Este archivo corrige las dos puntas: la funcion deja de multiplicar, y
-- las filas ya guardadas se ponen al dia. AVISA cuantas cambio, y cuales
-- tenian un valor que NO era el producto --esas no se tocan, porque
-- alguien pudo haberlas contado a mano cuando el campo existia--.
--
-- ---------------------------------------------------------------------
-- 2. CUANTO SE COBRA
--
--     ROTA         solo el envase.      unidades x precio del envase
--     CONTAMINADA  envase y producto.   contaminadas x (envase + producto)
--
-- Los precios salen del maestro (2026-09-roturas-precios.sql) y son POR
-- BOTELLA. En producto terminado el envase es el que dice `envase_sku`;
-- en EER el material ES el envase, asi que se cobra el suyo y no hay
-- producto que sumar.
--
-- LA VISTA NO DECIDE QUIEN PAGA: dice cuanto vale cada rotura. Sumar
-- solo lo que esta a cobro es cosa de quien lee, y la pantalla lo hace
-- con `etapa`. Poner aqui el filtro habria escondido el dato justo
-- cuando alguien quiere saber cuanto se dejo de cobrar.
--
-- SI FALTA UN PRECIO, LA PLATA SALE EN NULO Y NO EN CERO. Un cero se
-- suma sin hacer ruido y deja un cobro corto; un nulo se ve.
--
-- Se puede correr varias veces sin romper nada.
-- =====================================================================

do $bloque$
begin
  if to_regclass('public.roturas') is null then
    raise exception 'Faltan las tablas de roturas: corre antes supabase/modulos/roturas.sql y sus migraciones.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'productos'
                    and column_name = 'precio_botella') then
    raise exception 'Falta 2026-09-roturas-precios.sql: correlo antes que este.';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 1a. REGISTRAR, SIN MULTIPLICAR
--
-- La funcion va entera porque en Postgres se reemplaza completa. Es la
-- misma de 2026-09-roturas-camino-por-causa con una linea cambiada.
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
      /* AL ENVASE SIN COLOR SE LE DICE QUÉ LE FALTA Y DÓNDE. «No está
         en el maestro» sería mentira: está, y lo único que le falta es
         un dato que se pone en Inventario. */
      if exists (select 1 from public.v_roturas_materiales_maestro v
                  where v.clave = v_pedido and v.tipo = 'eer' and v.color is null) then
        raise exception 'Al envase % le falta el color del vidrio en el maestro de Inventario: pónselo ahí y vuelve a intentar', v_pedido;
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
    /* UNA UNIDAD ES UNA BOTELLA, y esto es lo que estaba mal.
       Aquí se multiplicaba por las botellas que caben en un empaque:
       200 unidades se guardaban como 6.000 botellas, y `unidades_vidrio`
       --que es lo que pinta el análisis y lo que se va a cobrar-- leía
       esa columna. Todo el vidrio de en sitio salía inflado TREINTA
       VECES, y no había forma de notarlo desde la pantalla: el número
       era grande pero coherente consigo mismo.

       La pantalla pide «unidades rotas» y quien la usa cuenta botellas
       --el contador de «botellas rotas adentro» se quitó justamente
       porque nadie las contaba--. Así que la botella ES la unidad, y el
       empaque no entra en esta cuenta. */
    p_botellas := coalesce(p_botellas, p_unidades);
  else
    p_botellas := null;
  end if;

  v_cod := 'RB-' || lpad(nextval('public.roturas_codigo_seq')::text, 4, '0');

  /* ---------- A QUIÉN LE TOCA DECIDIR ESTA ROTURA ----------
     ANTES TODAS IBAN A LA BANDEJA DEL OL, fuera de quien fuera la
     culpa, y eso le ponía delante roturas que por definición no son
     suyas: una falla de las máquinas o un pallet DEPA malo no se le
     cobran al operador logístico, así que no hay nada que él pueda
     aceptar ni objetar. La bandeja se llenaba de renglones que solo
     podían terminar de una forma.

     Ahora el grupo de la causa decide el camino:

       asumida     es del OL --estibas en mal estado, módulo mal
                   arrumado, condiciones del sitio, comportamiento del
                   personal, falla del montacargas--. Va a su bandeja:
                   la acepta o la objeta, y de ahí sale el cobro.
       no_asumida  NO es del OL --falla de las máquinas, pallet DEPA--.
                   Nace en «no se cobra». La evidencia ya se exigió al
                   registrarla: esas causas piden foto y sin ella la
                   pantalla no deja pasar.

     LO QUE ESTO CUESTA, dicho aquí para que nadie lo descubra después:
     una rotura registrada con la causa equivocada dentro del grupo
     «no asumida» ya NO pasa por la bandeja de nadie — nace decidida.
     Sigue saliendo en el tablero y quien manda puede corregirle la
     causa, pero ningún turno la va a mirar por su cuenta. */
  insert into public.roturas
    (codigo, material, tipo, color, unidades, contaminadas, botellas,
     proceso, area, causa, grupo,
     descripcion, lat, lng, precision_m, estado, reportada_por)
  values
    (v_cod, v_mat, v_tipo, v_color, p_unidades, p_contaminadas, p_botellas,
     p_proceso, p_area, p_causa, v_grupo,
     nullif(btrim(coalesce(p_descripcion, '')), ''),
     p_lat, p_lng, p_precision,
     /* CON EL TIPO PUESTO. `estado` es un enum, y un `case` devuelve
        texto: sin el cast Postgres rechaza el insert entero con
        «column "estado" is of type rotura_estado but expression is of
        type text», que no dice nada de lo que pasa. */
     case when v_grupo = 'no_asumida' then 'no_cuenta'::rotura_estado
          else 'esperando'::rotura_estado end,
     auth.uid())
  returning roturas.id into v_id;

  return query select v_id, v_cod, v_foto;
end $$;



grant execute on function public.rotura_registrar(text, integer, integer, integer, text, text, text, numeric, numeric, numeric, text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 1b. LAS QUE YA ESTABAN GUARDADAS
--
-- Solo las que tienen EXACTAMENTE el producto unidades x botellas por
-- empaque: esas son las que puso la funcion. Si alguna trae otro numero,
-- lo puso una persona cuando el campo existia en la pantalla, y ese dato
-- es de alguien -- se deja y se avisa.
-- ---------------------------------------------------------------------
do $bloque$
declare v_n int; v_raras int;
begin
  update public.roturas r
     set botellas = r.unidades
    from public.roturas_materiales m
   where m.clave = r.material
     and r.tipo = 'producto_terminado'
     and m.botellas_x_empaque is not null
     and r.botellas = r.unidades * m.botellas_x_empaque
     and r.botellas <> r.unidades;
  get diagnostics v_n = row_count;

  select count(*) into v_raras
    from public.roturas r
    left join public.roturas_materiales m on m.clave = r.material
   where r.tipo = 'producto_terminado'
     and r.botellas is not null
     and r.botellas <> r.unidades
     and (m.botellas_x_empaque is null or r.botellas <> r.unidades * m.botellas_x_empaque);

  raise notice 'Botellas: % roturas corregidas (venian multiplicadas por el empaque).', v_n;
  if v_raras > 0 then
    raise warning '% roturas traen un numero de botellas que no es el producto: se dejaron como estaban. Revisalas en el tablero.', v_raras;
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 2. LA PLATA, EN LA VISTA
--
-- Se envuelve `v_roturas` otra vez, que es como se le han ido colgando
-- las columnas nuevas a esta vista. Asi la pantalla no tiene que
-- consultar dos sitios ni repetir la cuenta.
-- ---------------------------------------------------------------------
do $bloque$
declare v_def text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'v_roturas'
                and column_name = 'cobro_total') then
    raise notice 'La vista ya trae la plata.';
    return;
  end if;

  v_def := rtrim(btrim(pg_get_viewdef('public.v_roturas'::regclass, true)), ';');
  execute format($f$
    create or replace view public.v_roturas as
      with base as ( %s )
      select b.*,
             /* EL ENVASE QUE SE COBRA. En producto terminado es el que
                el maestro le asocia; en EER el material ES el envase. */
             pe.precio_botella  as precio_envase,
             /* EL PRODUCTO SOLO EXISTE EN PRODUCTO TERMINADO. */
             case when b.tipo = 'producto_terminado' then pp.precio_botella end as precio_producto,
             /* LA ROTA: SOLO EL ENVASE. */
             (b.unidades * pe.precio_botella)                     as cobro_rotas,
             /* LA CONTAMINADA: ENVASE Y PRODUCTO. El envase de un
                producto contaminado no se lava ni vuelve a la linea. */
             (coalesce(b.contaminadas, 0) * (pe.precio_botella + pp.precio_botella))
                                                                  as cobro_contaminadas,
             /* Y EL TOTAL. Si falta cualquiera de los dos precios sale
                NULO: un cero se suma sin hacer ruido y deja un cobro
                corto que nadie nota. */
             (b.unidades * pe.precio_botella)
               + case when coalesce(b.contaminadas, 0) = 0 then 0
                      else b.contaminadas * (pe.precio_botella + pp.precio_botella) end
                                                                  as cobro_total
        from base b
        left join public.productos pp on pp.sku = b.material
        left join public.productos pe
               on pe.sku = case when b.tipo = 'producto_terminado' then pp.envase_sku
                                else b.material end
  $f$, v_def);
  raise notice 'La vista ya dice cuanto vale cada rotura.';
end $bloque$;

grant select on public.v_roturas to authenticated;

-- ---------------------------------------------------------------------
-- 3. PARA MIRARLO
--
--   select codigo, material, tipo, unidades, contaminadas,
--          precio_envase, precio_producto, cobro_rotas, cobro_contaminadas, cobro_total, etapa
--     from public.v_roturas
--    order by reportada_en desc limit 20;
--
--   -- lo que se ha ido a cobro:
--   select sum(cobro_total) from public.v_roturas where etapa = 'cobro';
--
--   -- las que no se pueden cobrar porque falta un precio:
--   select codigo, material, tipo from public.v_roturas
--    where etapa = 'cobro' and cobro_total is null;
-- ---------------------------------------------------------------------
