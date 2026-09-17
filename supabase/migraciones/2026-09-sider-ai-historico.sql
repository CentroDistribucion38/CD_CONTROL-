-- =====================================================================
-- SIDER · AI — LA HISTORIA QUE VIENE DEL EXCEL
--
-- El informe de la revisión AI no sirve de nada con tres revisiones
-- dentro: una tendencia de tres puntos no es una tendencia, y un índice
-- por socio con una sola muestra no dice si ese socio manda envase malo
-- o si ese día tocó una estiba mala. Las 293 filas buenas de
-- «Registro Cobro AI COL V02.xlsx» —hoja BD AI BAQ, mayo a agosto de
-- 2026— son lo que hace que la pantalla abra diciendo algo.
--
-- EL PROBLEMA QUE HAY QUE RESOLVER PRIMERO. `sider_ai_revisiones` exige
-- un viaje: `viaje_id uuid NOT NULL references sider_viajes`. Y esas 293
-- revisiones no tienen viaje — se hicieron antes de que existiera este
-- módulo, sobre camiones que nadie registró en Tránsito.
--
-- LA SALIDA FÁCIL ERA INVENTAR LOS VIAJES, y está mal: metería 293
-- camiones fantasma en Tránsito, en la lista de lo que llegó, en las
-- cuentas del CD. Un dato inventado para satisfacer una llave es un dato
-- inventado, y dentro de un mes nadie recordaría cuáles eran.
--
-- Así que el viaje pasa a ser OPCIONAL y la revisión dice DE DÓNDE SALIÓ.
-- Una revisión importada es tan real como una del formulario —se hizo,
-- se cobró— pero no tiene camión que mirar, y la pantalla tiene que
-- poder decirlo.
--
-- Se puede correr varias veces.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.sider_ai_revisiones') is null then
    raise exception
      'Falta crear el módulo Sider AI. Corre primero supabase/modulos/sider-ai.sql.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. EL VIAJE, OPCIONAL
--
-- `unique` se queda: dos revisiones del mismo viaje siguen siendo un
-- error. Postgres no considera iguales dos nulos en un índice único, así
-- que las 293 importadas —todas con viaje nulo— conviven sin chocar.
-- ---------------------------------------------------------------------
alter table public.sider_ai_revisiones
  alter column viaje_id drop not null;


-- ---------------------------------------------------------------------
-- 2. DE DÓNDE SALIÓ
--
-- Va con `check` y no como texto libre: son dos orígenes y van a seguir
-- siendo dos. Y el valor por defecto es 'formulario', que es lo que son
-- todas las que ya existen.
-- ---------------------------------------------------------------------
alter table public.sider_ai_revisiones
  add column if not exists origen text not null default 'formulario';

alter table public.sider_ai_revisiones
  drop constraint if exists sider_ai_origen_valido;
alter table public.sider_ai_revisiones
  add constraint sider_ai_origen_valido check (origen in ('formulario', 'importado'));

comment on column public.sider_ai_revisiones.origen is
  'formulario = la contó alguien en esta app, con su viaje. '
  'importado = viene del Excel histórico y no tiene viaje que mirar.';

/* Y EL CANDADO QUE LO AMARRA: sin viaje solo se puede estar si se es
   importada. Sin esto, un error en el formulario podría guardar una
   revisión sin camión y nadie notaría la diferencia. */
alter table public.sider_ai_revisiones
  drop constraint if exists sider_ai_viaje_o_importada;
alter table public.sider_ai_revisiones
  add constraint sider_ai_viaje_o_importada
  check (viaje_id is not null or origen = 'importado');


-- ---------------------------------------------------------------------
-- 3. LA VISTA, CON EL ORIGEN
--
-- `drop` y no `create or replace`: gana una columna. Postgres solo deja
-- reemplazar una vista si las columnas viejas quedan iguales y en el
-- mismo orden, y con `replace` revienta con «cannot change name of view
-- column».
--
-- El resto va COPIADO de `sider-ai.sql`, no reescrito de memoria: en
-- este mismo proyecto reescribir una vista «parecida» costó una
-- migración a medio aplicar.
-- ---------------------------------------------------------------------
drop view if exists public.v_sider_ai;

create view public.v_sider_ai as
select
  r.id, r.viaje_id, r.origen, r.fecha, r.planta, r.placa, r.turno,
  r.canal,  c.nombre  as canal_nombre,
  r.socio,  s.nombre  as socio_nombre,
  r.envase, e.descripcion as envase_nombre, e.litros,
  r.certificado, r.recibidas, r.revisadas, r.zcl3, r.comentarios,
  r.revisado_por, r.revisado_en, r.editado_por, r.editado_en, r.ediciones,

  coalesce(t.defectos, 0)::integer  as defectos,
  coalesce(t.otros,    0)::integer  as otros,
  coalesce(t.total,    0)::integer  as marcadas,

  round(coalesce(t.defectos, 0)::numeric / r.revisadas, 6) as indice,

  round(r.recibidas * coalesce(t.defectos, 0)::numeric / r.revisadas)::integer as no_abono,
  r.recibidas
    - round(r.recibidas * coalesce(t.defectos, 0)::numeric / r.revisadas)::integer as abono_sap,

  round(coalesce(t.defectos, 0) * e.litros / 100, 4) as hl_defectos
from public.sider_ai_revisiones r
join public.sider_ai_envases  e on e.clave = r.envase
join public.sider_ai_canales  c on c.clave = r.canal
left join public.sider_ai_socios s on s.clave = r.socio
left join (
  select k.revision_id,
         sum(k.unidades) filter (where d.cobra)     as defectos,
         sum(k.unidades) filter (where not d.cobra) as otros,
         sum(k.unidades)                            as total
    from public.sider_ai_conteos k
    join public.sider_ai_defectos d on d.clave = k.defecto
   group by k.revision_id
) t on t.revision_id = r.id;

grant select on public.v_sider_ai to authenticated;


-- ---------------------------------------------------------------------
-- 4. POR DÓNDE ENTRA LA HISTORIA
--
-- Una función y no un `insert` suelto en el archivo de datos, por tres
-- razones:
--
--   · SE PUEDE VOLVER A CORRER. La llave natural de una revisión
--     importada es planta+fecha+placa+envase; si ya está, se actualiza.
--     Correr el archivo dos veces no duplica el histórico.
--   · LOS CONTEOS SE REEMPLAZAN ENTEROS. Si una fila se corrige en el
--     Excel y se vuelve a importar, los defectos viejos tienen que
--     IRSE — sumarlos encima daría el doble sin avisar.
--   · LOS DEFECTOS ENTRAN COMO jsonb {clave: unidades}. Catorce
--     parámetros sueltos serían catorce oportunidades de correr uno de
--     sitio, y ese error no da error: da una cifra distinta.
--
-- NO CALCULA EL ÍNDICE. Lo calcula la vista, con las mismas nueve
-- categorías que cobran. El Excel traía su propio % en cada fila y esa
-- columna NO se importa: importarla sería poder contradecir la vista.
-- ---------------------------------------------------------------------
create or replace function public.sider_ai_importar(
  p_fecha       date,
  p_planta      text,
  p_placa       text,
  p_turno       text,
  p_canal       text,
  p_socio       text,
  p_envase      text,
  p_certificado boolean,
  p_recibidas   integer,
  p_revisadas   integer,
  p_defectos    jsonb,
  p_zcl3        text default null,
  p_comentarios text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.es_editor() then
    raise exception 'Importar el histórico requiere rol de supervisor.';
  end if;

  /* El envase y el socio tienen que existir en el maestro. Si no, se
     dice CUÁL falta: un «violates foreign key» no le sirve a nadie
     buscando entre 293 filas. */
  if not exists (select 1 from public.sider_ai_envases where clave = p_envase) then
    raise exception 'El envase % no está en el maestro de envases.', p_envase;
  end if;
  if p_socio is not null and not exists (select 1 from public.sider_ai_socios where clave = p_socio) then
    raise exception 'El socio % no está en el maestro de socios.', p_socio;
  end if;

  select id into v_id from public.sider_ai_revisiones
   where origen = 'importado' and planta = p_planta and fecha = p_fecha
     and placa = p_placa and envase = p_envase;

  if v_id is null then
    insert into public.sider_ai_revisiones
      (viaje_id, origen, fecha, planta, placa, turno, canal, socio, envase,
       certificado, recibidas, revisadas, zcl3, comentarios, revisado_por)
    values
      (null, 'importado', p_fecha, p_planta, p_placa, p_turno, p_canal, p_socio, p_envase,
       coalesce(p_certificado, false), p_recibidas, p_revisadas, p_zcl3, p_comentarios, auth.uid())
    returning id into v_id;
  else
    update public.sider_ai_revisiones set
      turno = p_turno, canal = p_canal, socio = p_socio,
      certificado = coalesce(p_certificado, false),
      recibidas = p_recibidas, revisadas = p_revisadas,
      zcl3 = p_zcl3, comentarios = p_comentarios,
      editado_por = auth.uid(), editado_en = now(), ediciones = ediciones + 1
    where id = v_id;
  end if;

  /* ENTEROS, NO SUMADOS. Volver a importar una fila corregida tiene que
     dejar los defectos que dice el Excel de hoy, no los de hoy más los
     de la vez pasada. */
  delete from public.sider_ai_conteos where revision_id = v_id;
  insert into public.sider_ai_conteos (revision_id, defecto, unidades)
  select v_id, k.key, (k.value #>> '{}')::integer
    from jsonb_each(coalesce(p_defectos, '{}'::jsonb)) k
   where (k.value #>> '{}')::integer > 0;

  return v_id;
end $$;

grant execute on function public.sider_ai_importar(
  date, text, text, text, text, text, text, boolean, integer, integer, jsonb, text, text
) to authenticated;


-- ---------------------------------------------------------------------
-- 5. QUE HAYA QUEDADO
-- ---------------------------------------------------------------------
do $$
declare v_falla text := '';
begin
  if (select is_nullable from information_schema.columns
       where table_name = 'sider_ai_revisiones' and column_name = 'viaje_id') <> 'YES' then
    v_falla := v_falla || ' el viaje sigue siendo obligatorio;';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_sider_ai' and column_name = 'origen') then
    v_falla := v_falla || ' la vista no trae el origen;';
  end if;
  if to_regproc('public.sider_ai_importar') is null then
    v_falla := v_falla || ' no se creó sider_ai_importar;';
  end if;
  if v_falla <> '' then raise exception 'Quedó a medias:%', v_falla; end if;
  raise notice 'Listo. El viaje es opcional, la revisión dice de dónde salió, y sider_ai_importar está lista.';
end $$;

commit;
