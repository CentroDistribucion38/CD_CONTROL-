-- =====================================================================
-- ROTURAS EN SITIO · EL ÁREA, LAS CAUSAS DE VERDAD, Y EL EER SIN MATERIAL
-- ---------------------------------------------------------------------
-- Tres cosas pedidas, y las tres son del mismo formulario:
--
--   1. «Si en EER no es material, ¿para qué está? Quita ese campo de
--      allí porque no me deja continuar.»
--   2. «Que primero pongan a qué proceso corresponde y así es que se
--      habilitan las causas» — con OTRAS causas, las que se usan.
--   3. «Agrega el Área como desplegable, y del maestro, no quemadas.»
--
-- ---------------------------------------------------------------------
-- 1. EL EER YA NO PIDE MATERIAL
--
-- No se le quita la columna a la tabla: en EER el material SE DEDUCE
-- DEL COLOR. Se escoge ámbar y el registro guarda EER-AMBAR, sin
-- preguntar nada. La pantalla pierde un campo; los informes no pierden
-- una columna, y lo ya registrado sigue leyéndose igual.
--
-- Esos tres materiales tienen que existir y estar activos, porque
-- ahora son la única puerta del EER. Aquí se aseguran: si alguien los
-- desactivó desde el maestro, esto los vuelve a prender.
--
-- ---------------------------------------------------------------------
-- 2. EL ÁREA
--
-- Nueva y aparte del proceso. El PROCESO dice de qué operación salió la
-- rotura —y es lo que habilita las causas—; el ÁREA dice EN QUÉ PARTE
-- DE LA BODEGA pasó. Se parecen en los nombres porque la bodega está
-- organizada por lo que se hace en cada sitio, pero no son lo mismo:
-- una rotura de Traspasos puede pasar en la Plazoleta.
--
-- Lista cerrada y en tabla, no quemada en el programa: «Calle A»
-- escrita de cuatro maneras son cuatro áreas distintas en el informe
-- del mes, y agregar la quinta calle no puede necesitar un despliegue.
--
-- QUEDA OPCIONAL EN LA TABLA aunque la pantalla la pida con asterisco:
-- las roturas de antes no tienen área y no se les puede inventar una.
-- Quien exige es `rotura_registrar`, de aquí en adelante.
--
-- ---------------------------------------------------------------------
-- 3. LAS CAUSAS
--
-- Las diez de antes eran una lista de arranque. Estas siete son las que
-- se usan, con la redacción corregida:
--
--   ASUMIDAS POR EL OL          NO ASUMIDAS (exigen foto)
--   · Estibas en mal estado     · Falla de las máquinas
--   · Módulo mal arrumado       · Falla del pallet DEPA
--   · Condiciones del sitio
--   · Comportamiento del personal
--   · Falla mecánica del montacargas
--
-- LAS VIEJAS NO SE BORRAN, SE APAGAN. Hay roturas registradas que
-- apuntan a ellas —y la llave foránea lo impediría igual—: borrarlas
-- dejaría los informes de los meses pasados sin poder decir de qué fue
-- la rotura. Apagadas no salen en el formulario y siguen leyéndose.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.roturas') is null then
    raise exception 'Falta supabase/modulos/roturas.sql. Ese va primero.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. EL MAESTRO DE ÁREAS
-- ---------------------------------------------------------------------
create table if not exists public.roturas_areas (
  clave     text primary key,
  nombre    text not null,
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now()
);

comment on table public.roturas_areas is
  'En qué parte de la bodega pasó la rotura. Distinto del proceso: el proceso es la operación, el área es el sitio.';

/* Semilla, no verdad: se edita desde el maestro y re-correr el archivo
   no pisa lo que alguien haya corregido. El orden es el del recorrido
   de la bodega, no alfabético. */
insert into public.roturas_areas (clave, nombre, orden) values
  ('bahias_t1',       'Bahías T1',        1),
  ('tandem_lineas',   'Tándem Líneas',    2),
  ('traspasos',       'Traspasos',        3),
  ('maquila',         'Maquila',          4),
  ('antiguo_patio_t2','Antiguo Patio T2', 5),
  ('sorting',         'Sorting',          6),
  ('plazoleta',       'Plazoleta',        7),
  ('calle_a',         'Calle A',          10),
  ('calle_b',         'Calle B',          11),
  ('calle_c',         'Calle C',          12),
  ('calle_d',         'Calle D',          13),
  ('calle_e',         'Calle E',          14),
  ('estanteria',      'Estantería',       20)
on conflict (clave) do nothing;

alter table public.roturas
  add column if not exists area text references public.roturas_areas(clave);

comment on column public.roturas.area is
  'En qué parte de la bodega pasó. Nulo en lo registrado antes de que existiera el campo: a eso no se le puede inventar un área.';

create index if not exists roturas_area_idx on public.roturas (area);

-- ---------------------------------------------------------------------
-- 2. LAS CAUSAS QUE SE USAN
-- ---------------------------------------------------------------------
/* Primero se apagan TODAS: así una causa vieja que nadie nombró aquí
   queda fuera sin tener que listarla. Enseguida se prenden las siete
   buenas. El orden importa —al revés, las siete quedarían apagadas—. */
update public.roturas_causas set activo = false;

insert into public.roturas_causas (clave, nombre, grupo, exige_foto, orden) values
  ('estibas_malas',   'Estibas en mal estado',          'asumida',    false, 1),
  ('mal_arrumado',    'Módulo mal arrumado',            'asumida',    false, 2),
  ('condiciones',     'Condiciones del sitio',          'asumida',    false, 3),
  ('comportamiento',  'Comportamiento del personal',    'asumida',    false, 4),
  ('falla_montacarga','Falla mecánica del montacargas', 'asumida',    false, 5),
  ('falla_maquinas',  'Falla de las máquinas',          'no_asumida', true, 10),
  ('falla_depa',      'Falla del pallet DEPA',          'no_asumida', true, 11)
on conflict (clave) do update set
  nombre     = excluded.nombre,
  grupo      = excluded.grupo,
  exige_foto = excluded.exige_foto,
  orden      = excluded.orden,
  activo     = true;

-- ---------------------------------------------------------------------
-- 3. LOS TRES MATERIALES DEL EER, ENCENDIDOS
--
-- Son la única puerta del EER desde que el campo dejó de preguntarse.
-- Si el desplegable salía vacío —que es lo que pasaba— era justamente
-- porque alguno de estos no estaba.
-- ---------------------------------------------------------------------
insert into public.roturas_materiales (clave, nombre, tipo, color, botellas_x_empaque, orden) values
  ('EER-AMBAR', 'Envase retornable ámbar', 'eer', 'ambar', null, 1),
  ('EER-FLINT', 'Envase retornable flint', 'eer', 'flint', null, 2),
  ('EER-GREEN', 'Envase retornable green', 'eer', 'green', null, 3)
on conflict (clave) do update set activo = true, nombre = excluded.nombre;

-- ---------------------------------------------------------------------
-- 4. REGISTRAR, CON ÁREA Y SIN PREGUNTAR MATERIAL EN EER
--
-- `p_material` se vuelve opcional: en EER se manda el color y la
-- función busca el material sola. Si llegan los dos, manda el material
-- —quien ya lo sabe no tiene por qué dejar de decirlo—.
-- ---------------------------------------------------------------------
drop function if exists public.rotura_registrar(text, integer, integer, integer, text, text, text, numeric, numeric, numeric);

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

  /* EL MATERIAL, O EL COLOR. En EER la pantalla ya no pregunta material
     —«si en EER no es material, ¿para qué está?»—: manda el color y de
     aquí sale el material. Es una traducción, no una adivinanza: hay
     exactamente un material de EER por color. */
  v_mat := nullif(btrim(coalesce(p_material, '')), '');
  if v_mat is null then
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

grant execute on function public.rotura_registrar(
  text, integer, integer, integer, text, text, text, numeric, numeric, numeric, text, text)
to authenticated;

-- ---------------------------------------------------------------------
-- 5. LAS VISTAS
--
-- `v_roturas` se vuelve a crear con el área al final —así
-- `create or replace` sirve— y el join es LEFT: lo de antes no tiene
-- área y un join normal lo haría desaparecer de la pantalla.
-- ---------------------------------------------------------------------
create or replace view public.v_roturas as
with cnt_fotos as (
  select rotura_id, count(*) n from public.roturas_fotos group by rotura_id)
select
  r.id,
  r.codigo,
  r.material,
  m.nombre                       as material_nombre,
  r.tipo::text                   as tipo,
  r.color::text                  as color,
  r.unidades,
  r.contaminadas,
  r.botellas,
  case when r.tipo = 'producto_terminado'
       then r.unidades + coalesce(r.contaminadas, 0)
       else 0 end                as unidades_liquido,
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
  coalesce(cf.n, 0)              as fotos,
  (c.exige_foto and coalesce(cf.n, 0) = 0)
                                 as le_falta_foto,
  round(extract(epoch from (now() - r.reportada_en)) / 60)::int as minutos,
  r.area,
  a.nombre                       as area_nombre
from public.roturas r
join public.roturas_materiales m on m.clave = r.material
join public.roturas_procesos   p on p.clave = r.proceso
join public.roturas_causas     c on c.clave = r.causa
left join public.roturas_areas a on a.clave = r.area
left join cnt_fotos cf on cf.rotura_id = r.id;

grant select on public.v_roturas to authenticated;

/* Y el conteo de uso, para que el maestro sepa si un área se puede
   borrar. Es el mismo patrón de material/proceso/causa/tolva. */
create or replace view public.v_roturas_uso as
  select 'material'::text as tipo, material as clave, count(*)::int as usos
    from public.roturas group by material
  union all
  select 'proceso', proceso, count(*)::int
    from public.roturas group by proceso
  union all
  select 'causa', causa, count(*)::int
    from public.roturas group by causa
  union all
  select 'area', area, count(*)::int
    from public.roturas where area is not null group by area
  union all
  select 'tolva', tolva, count(*)::int
    from public.roturas_salida_tolvas group by tolva;

grant select on public.v_roturas_uso to authenticated;

-- ---------------------------------------------------------------------
-- 6. QUIÉN PUEDE VER Y TOCAR EL MAESTRO DE ÁREAS
--
-- Las mismas reglas que las otras cuatro tablas de maestro: leerlo
-- cualquiera que entre, cambiarlo solo quien administra.
-- ---------------------------------------------------------------------
alter table public.roturas_areas enable row level security;

drop policy if exists roturas_areas_ver on public.roturas_areas;
create policy roturas_areas_ver on public.roturas_areas
  for select to authenticated using (true);

drop policy if exists roturas_areas_manda on public.roturas_areas;
create policy roturas_areas_manda on public.roturas_areas
  for all to authenticated using (public.manda()) with check (public.manda());

grant select on public.roturas_areas to authenticated;
grant insert, update, delete on public.roturas_areas to authenticated;

-- ---------------------------------------------------------------------
-- 7. COMPROBACIÓN, AQUÍ MISMO
--
-- Si alguna falla, la migración se deshace entera.
-- ---------------------------------------------------------------------
do $$
declare
  v_n int;
begin
  select count(*) into v_n from public.roturas_areas where activo;
  if v_n < 13 then
    raise exception 'Quedaron % áreas activas y tienen que ser 13', v_n;
  end if;

  select count(*) into v_n from public.roturas_causas where activo;
  if v_n <> 7 then
    raise exception 'Quedaron % causas activas y tienen que ser 7', v_n;
  end if;

  select count(*) into v_n from public.roturas_causas
   where activo and grupo = 'no_asumida';
  if v_n <> 2 then
    raise exception 'Las no asumidas tienen que ser 2 —máquinas y pallet DEPA—, y quedaron %', v_n;
  end if;

  /* Y las dos no asumidas exigen foto: es lo que las hace no asumidas
     en la práctica —se está diciendo que no fue del OL y hay que
     probarlo—. */
  if exists (select 1 from public.roturas_causas
              where activo and grupo = 'no_asumida' and not exige_foto) then
    raise exception 'Hay una causa no asumida que no exige foto';
  end if;

  /* Las viejas siguen ahí, apagadas: los informes de antes tienen que
     poder decir de qué fue la rotura. */
  if not exists (select 1 from public.roturas_causas
                  where clave = 'mal_estibado' and not activo) then
    raise exception 'Se perdió una causa vieja: tenían que quedar apagadas, no borradas';
  end if;

  select count(*) into v_n from public.roturas_materiales
   where tipo = 'eer' and activo;
  if v_n < 3 then
    raise exception 'Faltan materiales de EER activos (hay %): el EER ya no pregunta material y sale de ahí', v_n;
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_roturas' and column_name = 'area_nombre') then
    raise exception 'Falta area_nombre en v_roturas';
  end if;
end $$;

do $$ begin raise notice 'LISTO: area en el maestro, las 7 causas que se usan, y el EER sin preguntar material.'; end $$;
commit;
