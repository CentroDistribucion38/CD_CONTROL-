-- =====================================================================
-- ROTURAS EN SITIO · CADA CAUSA POR SU CAMINO
--
-- «rotura si es el opm se va a esperar a OL»
--
-- Hasta hoy TODA rotura nacía en «espera al OL», fuera cual fuera la
-- causa. La bandeja del operador logístico recibía así roturas que por
-- definición no son suyas —falla de las máquinas, pallet DEPA— y que él
-- no podía ni aceptar ni objetar de forma que cambiara algo.
--
-- De aquí en adelante el GRUPO DE LA CAUSA decide:
--
--   asumida     es del OL. Va a su bandeja y de ahí sale el cobro.
--   no_asumida  no es del OL. Nace en «no se cobra».
--
-- NO SE TOCA LO YA REGISTRADO. Las roturas que están esperando siguen
-- esperando: moverlas hoy sería decidir por el OL unas que él todavía
-- no ha visto, y en su bandeja ya hay trabajo hecho a medias.
--
-- Se puede correr varias veces sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. QUE ESTÉ LO DE ANTES
-- ---------------------------------------------------------------------
do $bloque$
begin
  if to_regclass('public.roturas') is null then
    raise exception 'Faltan las tablas de roturas: corre antes supabase/modulos/roturas.sql y sus migraciones.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'roturas' and column_name = 'area') then
    raise exception 'Falta 2026-09-roturas-sitio-area-causas.sql: córrelo antes que este.';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 1. REGISTRAR, CON EL CAMINO QUE LE TOCA
--
-- LA FUNCIÓN VA ENTERA Y NO A PEDAZOS: en Postgres una función se
-- reemplaza completa. Es la misma de 2026-09-roturas-material-del-maestro
-- con el estado inicial cambiado; lo demás no se tocó.
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
    p_botellas := coalesce(p_botellas, p_unidades * coalesce(v_bxe, 0));
    if v_bxe is not null and p_botellas > p_unidades * v_bxe then
      raise exception 'No pueden romperse más botellas (%) que las que caben en % unidades (%)',
        p_botellas, p_unidades, p_unidades * v_bxe;
    end if;
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
-- 2. CUÁNTAS QUEDARÍAN DE CADA LADO
--
-- Solo para mirarlo: no mueve nada. Dice cuántas de las que están
-- esperando son de causa «no asumida» —esas son las que, de aquí en
-- adelante, ya no van a llegar a la bandeja del OL—.
-- ---------------------------------------------------------------------
do $bloque$
declare v_esp int; v_no int;
begin
  select count(*) into v_esp from public.roturas where estado = 'esperando';
  select count(*) into v_no  from public.roturas where estado = 'esperando' and grupo = 'no_asumida';
  raise notice 'Esperando al OL: % roturas, de las cuales % son de causa no asumida (se quedan donde estan; solo cambia lo que se registre desde ahora).',
    v_esp, v_no;
end $bloque$;
