-- =====================================================================
-- SIDER · SORTING — LA MISMA REVISIÓN, DESPUÉS DE DESCARGAR
--
-- «En Certificar, aparte de la asignación de AI, debemos poner la
--  asignación de lo mismo pero llamado Sorting, con el fin de que yo
--  también de manera interna haga esa inspección… apenas certifiquen la
--  llegada en tránsito, si esa tiene asignación de Sorting pues pase a
--  Sorting para que allí los muchachos no se enreden, y luego pasa a la
--  base de datos con esa categoría de Sorting.»
--
-- ---------------------------------------------------------------------
-- LO QUE HAY QUE CAMBIAR Y POR QUÉ NO ES SOLO UNA ETIQUETA
-- ---------------------------------------------------------------------
-- `sider_ai_revisiones` tiene `viaje_id uuid unique`: UNA revisión por
-- viaje, impuesto por la base. Un viaje que lleve AI y Sorting a la vez
-- necesita DOS filas, y eso solo cabe si la llave pasa a ser
-- (viaje, tipo). Poner una columna `tipo` sin tocar la llave habría
-- dejado guardar la AI y rechazado el Sorting con un error de llave
-- duplicada que no le dice nada a quien está en el muelle.
--
-- ---------------------------------------------------------------------
-- EL RIESGO QUE ESTA MIGRACIÓN CIERRA, Y ES EL QUE IMPORTA
-- ---------------------------------------------------------------------
-- La revisión AI es un DOCUMENTO DE COBRO al socio. Todo lo que lee
-- `v_sider_ai` —el informe, el PDF, el tablero— suma plata. Si una fila
-- de Sorting entra en esa vista, el cobro sube sin que nadie lo haya
-- decidido, y no hay forma de verlo desde la pantalla: el número es
-- grande pero coherente consigo mismo.
--
-- Así que hay CUATRO sitios donde «una revisión del viaje» tiene que
-- pasar a querer decir «una revisión AI»:
--
--   1. v_sider_ai, v_sider_ai_detalle      → solo tipo 'ai'
--   2. v_sider_ai_pendientes               → el «ya la hicieron» mira
--                                            solo AI. Sin esto, hacer el
--                                            Sorting apagaba la marca de
--                                            AI pendiente y el camión
--                                            NUNCA se revisaba.
--   3. sider_ai_marcar                     → «no se puede quitar si ya
--                                            hay revisión» mira solo AI.
--   4. sider_ai_guardar (on conflict)      → la llave es (viaje, tipo).
--
-- Cada uno tiene su prueba en `.arnes/prueba-sider-sorting.sql`, y cada
-- prueba se comprobó rompiendo la defensa a propósito.
--
-- ---------------------------------------------------------------------
-- QUIÉN PUEDE QUÉ — Y UN HUECO QUE HABÍA
-- ---------------------------------------------------------------------
-- Los muchachos de Sorting son OPERADORES, y `es_editor()` no mira la
-- pantalla: es cierto si el rol tiene CUALQUIER permiso «editar» en
-- CUALQUIER sección. Darle a un operador «editar» en Sorting lo volvía
-- editor a los ojos de `sider_ai_guardar` —que exigía `es_editor()`—, o
-- sea que podía guardar una revisión AI (el cobro al socio) llamando la
-- función a mano.
--
-- Por eso el permiso se pide por pantalla, no en general:
--
--   · Sorting →  puede_editar('/sider/sorting')
--   · AI      →  es_editor() Y puede_editar('/sider/transito')
--
-- Lo segundo es lo que la pantalla ya exigía —la revisión AI se hace
-- dentro de Tránsito y esa página pide «editar» en /sider/transito—; la
-- base solo se pone de acuerdo con la pantalla. El supervisor que trae
-- la semilla tiene las dos cosas y no nota nada.
--
-- NO SE LE DA «EDITAR» A NINGÚN OPERADOR AQUÍ. Una sección nueva nace
-- cerrada, y quien decide qué operadores hacen Sorting es el
-- administrador, en Administración → Roles. (Ojo: eso vuelve `es_editor()`
-- cierto para ese rol en los OTROS módulos que lo usan; es el trato que
-- ya tenía el proyecto con cualquier permiso «editar», no algo nuevo.)
--
-- Se puede correr varias veces.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.sider_viajes') is null then
    raise exception 'Falta la tabla sider_viajes: corre supabase/modulos/sider.sql primero.';
  end if;
  if to_regclass('public.sider_ai_revisiones') is null then
    raise exception 'Falta el módulo AI: corre supabase/modulos/sider-ai.sql primero.';
  end if;
  /* ESTA MIGRACIÓN COPIA LA VISTA v_sider_ai TAL COMO LA DEJARON LAS
     ANTERIORES, y si esas no corrieron copiaría una versión vieja y
     borraría columnas que la pantalla ya lee. Se comprueba y se PARA:
     avisar y seguir dejaría el informe sin sus tres totales. */
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sider_ai_revisiones'
                    and column_name = 'origen') then
    raise exception 'Falta 2026-09-sider-ai-historico.sql: la revisión todavía no tiene «origen».';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sider_ai_defectos'
                    and column_name = 'en_total_hoja') then
    raise exception 'Falta 2026-09-sider-ai-tres-totales.sql: los defectos todavía no traen las banderas de la hoja.';
  end if;
end $$;

/* CUÁNTAS REVISIONES HAY ANTES DE TOCAR NADA. Al final se compara: todas
   las que existen hoy son AI, así que la vista de AI tiene que dar
   exactamente el mismo número. Si baja o sube, algo se coló o se perdió. */
create temp table _sorting_antes on commit drop as
  select count(*)::int as n from public.sider_ai_revisiones;


-- ---------------------------------------------------------------------
-- 1. EL VIAJE PUEDE PEDIR SORTING
--
-- Las mismas tres columnas que la AI y por lo mismo: quién y cuándo. Un
-- Sorting cuesta el tiempo de los muchachos, y el día que alguien
-- pregunte por qué revisaron ese camión tiene que haber respuesta.
-- NO lleva «motivo»: la AI tuvo ese campo y se quitó porque nadie lo
-- llenaba.
-- ---------------------------------------------------------------------
alter table public.sider_viajes add column if not exists requiere_sorting   boolean not null default false;
alter table public.sider_viajes add column if not exists sorting_pedido_por uuid references public.perfiles(id) on delete set null;
alter table public.sider_viajes add column if not exists sorting_pedido_en  timestamptz;

create index if not exists sider_viajes_sorting_idx
  on public.sider_viajes (requiere_sorting, estado) where requiere_sorting;


-- ---------------------------------------------------------------------
-- 2. LA REVISIÓN DICE DE QUÉ TIPO ES, Y LA LLAVE PASA A SER (VIAJE, TIPO)
-- ---------------------------------------------------------------------
alter table public.sider_ai_revisiones
  add column if not exists tipo text not null default 'ai';

alter table public.sider_ai_revisiones drop constraint if exists sider_ai_tipo_valido;
alter table public.sider_ai_revisiones
  add constraint sider_ai_tipo_valido check (tipo in ('ai', 'sorting'));

/* UN SORTING SIEMPRE SALE DE UN FORMULARIO. Lo importado del Excel es
   histórico de AI; un «Sorting importado» no existe, y si aparece es un
   error de carga que hay que ver, no un dato válido. */
alter table public.sider_ai_revisiones drop constraint if exists sider_sorting_es_de_formulario;
alter table public.sider_ai_revisiones
  add constraint sider_sorting_es_de_formulario check (tipo = 'ai' or origen = 'formulario');

comment on column public.sider_ai_revisiones.tipo is
  'ai = la revisión de la muestra que se cobra al socio. '
  'sorting = la misma inspección hecha internamente después de descargar; '
  'NO entra en v_sider_ai ni en nada que sume el cobro.';

/* LA LLAVE ANTIGUA SE BUSCA POR LO QUE HACE, no por el nombre que Postgres
   le puso: si alguien la recreó a mano tendría otro y un `drop constraint`
   con el nombre supuesto falla en silencio o no encuentra nada. Se suelta
   la que sea única sobre EXACTAMENTE (viaje_id). */
do $$
declare v_nombre text;
begin
  select c.conname into v_nombre
    from pg_constraint c
   where c.conrelid = 'public.sider_ai_revisiones'::regclass
     and c.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname::text)
            from unnest(c.conkey) k
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
         = array['viaje_id'];
  if v_nombre is not null then
    execute format('alter table public.sider_ai_revisiones drop constraint %I', v_nombre);
  end if;
end $$;

/* Postgres no considera iguales dos nulos en un índice único, así que las
   293 importadas —todas con viaje nulo— siguen conviviendo sin chocar. */
do $$ begin
  alter table public.sider_ai_revisiones
    add constraint sider_ai_rev_viaje_tipo_key unique (viaje_id, tipo);
exception when duplicate_table or duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 3. LAS VISTAS: AI SOLO VE AI, SORTING SOLO VE SORTING
--
-- UN SOLO TEXTO PARA LAS DOS. Escribirlas por separado es escribir la
-- misma vista dos veces, y el día que a una se le agregue una columna a
-- la otra se le olvida: el informe de AI y el de Sorting empiezan a
-- calcular distinto el mismo índice. Aquí solo cambia el `where`.
--
-- El cuerpo va COPIADO de 2026-09-sider-ai-tres-totales.sql —la última
-- que la tocó—, no reescrito de memoria: `create or replace` exige las
-- mismas columnas, en el mismo orden y con el mismo tipo, y una vista
-- «parecida» revienta con «cannot change name of view column».
-- ---------------------------------------------------------------------
do $$
declare
  v_tipo   text;
  v_vista  text;
  v_det    text;
  v_sql    text;
begin
  foreach v_tipo in array array['ai', 'sorting'] loop
    v_vista := case v_tipo when 'ai' then 'v_sider_ai'         else 'v_sider_sorting'         end;
    v_det   := case v_tipo when 'ai' then 'v_sider_ai_detalle' else 'v_sider_sorting_detalle' end;

    v_sql := $v$
      create or replace view public.%1$I as
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
        round(coalesce(t.defectos, 0) * e.litros / 100, 4) as hl_defectos,

        coalesce(t.total_hoja, 0)::integer as defectos_hoja,
        round(coalesce(t.total_hoja, 0)::numeric / r.revisadas, 6) as pct_hoja,
        round(coalesce(t.hl_hoja, 0) * e.litros / 100, 4) as hl_hoja

      from public.sider_ai_revisiones r
      join public.sider_ai_envases  e on e.clave = r.envase
      join public.sider_ai_canales  c on c.clave = r.canal
      left join public.sider_ai_socios s on s.clave = r.socio
      left join (
        select k.revision_id,
               sum(k.unidades) filter (where d.cobra)         as defectos,
               sum(k.unidades) filter (where not d.cobra)     as otros,
               sum(k.unidades)                                as total,
               sum(k.unidades) filter (where d.en_total_hoja) as total_hoja,
               sum(k.unidades) filter (where d.en_hl_hoja)    as hl_hoja
          from public.sider_ai_conteos k
          join public.sider_ai_defectos d on d.clave = k.defecto
         group by k.revision_id
      ) t on t.revision_id = r.id
      where r.tipo = %2$L
    $v$;
    execute format(v_sql, v_vista, v_tipo);
    execute format('grant select on public.%I to authenticated', v_vista);

    v_sql := $v$
      create or replace view public.%1$I as
      select
        k.revision_id, k.defecto, d.nombre as defecto_nombre,
        d.cobra, d.en_total_hoja, d.en_hl_hoja, d.orden,
        k.unidades,
        round(k.unidades::numeric / r.revisadas, 6) as pct,
        round(k.unidades * e.litros / 100, 4)       as hl
      from public.sider_ai_conteos k
      join public.sider_ai_defectos d on d.clave = k.defecto
      join public.sider_ai_revisiones r on r.id = k.revision_id and r.tipo = %2$L
      join public.sider_ai_envases e on e.clave = r.envase
    $v$;
    execute format(v_sql, v_det, v_tipo);
    execute format('grant select on public.%I to authenticated', v_det);
  end loop;
end $$;


/* LOS PENDIENTES DE AI, AHORA MIRANDO SOLO AI.
   Es el cambio más silencioso de todo el archivo: la vista preguntaba
   «¿hay alguna revisión de este viaje?» y ahora hay dos tipos. Sin el
   `r.tipo = 'ai'`, terminar el Sorting de un camión marcado para AI
   hacía desaparecer su AI de la lista de pendientes: nadie contaba la
   muestra y el cobro al socio se perdía sin ningún error.
   Sí es `create or replace`: no cambia ninguna columna, solo el where. */
create or replace view public.v_sider_ai_pendientes as
select
  v.id as viaje_id, v.placa, v.planta, v.sku, v.estibas,
  coalesce(v.fecha, v.creado_en::date) as fecha,
  v.ai_pedido_en, v.ai_pedido_por, v.ai_motivo,
  p.nombre as pedido_nombre,
  (select max(c.hecha_en) from public.sider_certificaciones c
    where c.viaje_id = v.id and c.punta = 'llegada') as llego_en
from public.sider_viajes v
left join public.perfiles p on p.id = v.ai_pedido_por
where v.requiere_ai
  and v.estado <> 'anulado'
  and not exists (select 1 from public.sider_ai_revisiones r
                   where r.viaje_id = v.id and r.tipo = 'ai');

grant select on public.v_sider_ai_pendientes to authenticated;


/* LOS PENDIENTES DE SORTING: LA LISTA DE TRABAJO DE LOS MUCHACHOS.
   Son los que pidieron Sorting, YA LLEGARON y nadie ha cerrado.

   «YA LLEGARON» NO ES ADORNO, y es lo que cumple lo que se pidió —«apenas
   certifiquen la llegada pase a Sorting»—: mientras el camión viene en
   la vía no hay nada que inspeccionar, y ponerlo en la lista de los
   muchachos les mostraría trabajo que todavía no existe. Se pregunta por
   la certificación de llegada y no por el estado del viaje, con la misma
   regla que aplica `sider_ai_guardar` al guardar: que la lista y la
   función no puedan discrepar sobre qué es «ya llegó».

   Los anulados no esperan nada: mismo criterio que la AI. */
create or replace view public.v_sider_sorting_pendientes as
select
  v.id as viaje_id, v.placa, v.planta, v.sku, v.estibas,
  coalesce(v.fecha, v.creado_en::date) as fecha,
  v.sorting_pedido_en, v.sorting_pedido_por,
  p.nombre as pedido_nombre,
  (select max(c.hecha_en) from public.sider_certificaciones c
    where c.viaje_id = v.id and c.punta = 'llegada') as llego_en
from public.sider_viajes v
left join public.perfiles p on p.id = v.sorting_pedido_por
where v.requiere_sorting
  and v.estado <> 'anulado'
  and exists (select 1 from public.sider_certificaciones c
               where c.viaje_id = v.id and c.punta = 'llegada')
  and not exists (select 1 from public.sider_ai_revisiones r
                   where r.viaje_id = v.id and r.tipo = 'sorting');

grant select on public.v_sider_sorting_pendientes to authenticated;


-- ---------------------------------------------------------------------
-- 4. PEDIR Y QUITAR EL SORTING — SOLO EL ADMINISTRADOR
--
-- Igual que la AI y por lo mismo: pedirlo cuesta el tiempo de los
-- muchachos. El `coalesce` NO es adorno: mi_rol() devuelve NULL para
-- quien no tiene perfil, y `null <> 'admin'` no es cierto NI falso —es
-- NULL—, el `if` no entra y la función seguiría de largo.
-- ---------------------------------------------------------------------
create or replace function public.sider_sorting_marcar(
  p_viaje  uuid,
  p_marcar boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text;
begin
  if coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Pedir un Sorting es solo del administrador';
  end if;

  select estado::text into v_estado from public.sider_viajes where id = p_viaje;
  if v_estado is null then
    raise exception 'Ese viaje no existe';
  end if;

  /* QUITAR LA MARCA CON EL SORTING YA HECHO sería borrar el trabajo de los
     muchachos sin que quede rastro: la revisión seguiría en la tabla y el
     viaje diría que nunca le tocaba. Solo se mira el Sorting: que ya
     tenga su AI hecha no tiene nada que ver con esto. */
  if not p_marcar and exists (
       select 1 from public.sider_ai_revisiones
        where viaje_id = p_viaje and tipo = 'sorting') then
    raise exception 'Ese viaje ya tiene el Sorting hecho. Primero hay que anular la revisión';
  end if;

  update public.sider_viajes
     set requiere_sorting   = p_marcar,
         sorting_pedido_por = case when p_marcar then auth.uid() end,
         sorting_pedido_en  = case when p_marcar then now() end
   where id = p_viaje;
end $$;

grant execute on function public.sider_sorting_marcar(uuid, boolean) to authenticated;


/* LA AI SE QUITA IGUAL QUE ANTES, pero «ya tiene revisión» ahora es «ya
   tiene revisión AI»: con el Sorting hecho, el viejo `exists` decía que
   la AI estaba hecha y no dejaba quitarla. Va copiada de sider-ai.sql. */
create or replace function public.sider_ai_marcar(
  p_viaje  uuid,
  p_marcar boolean,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text;
begin
  if coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Pedir una revisión AI es solo del administrador';
  end if;

  select estado::text into v_estado from public.sider_viajes where id = p_viaje;
  if v_estado is null then
    raise exception 'Ese viaje no existe';
  end if;

  if not p_marcar and exists (
       select 1 from public.sider_ai_revisiones
        where viaje_id = p_viaje and tipo = 'ai') then
    raise exception 'Ese viaje ya tiene la revisión AI hecha. Primero hay que anular la revisión';
  end if;

  update public.sider_viajes
     set requiere_ai   = p_marcar,
         ai_pedido_por = case when p_marcar then auth.uid() end,
         ai_pedido_en  = case when p_marcar then now() end,
         ai_motivo     = case when p_marcar then nullif(btrim(coalesce(p_motivo, '')), '') end
   where id = p_viaje;
end $$;

grant execute on function public.sider_ai_marcar(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. GUARDAR LA REVISIÓN — LA MISMA FUNCIÓN, CON EL TIPO
--
-- SE MANTIENE EL NOMBRE `sider_ai_guardar` y se le agrega `p_tipo` con
-- 'ai' por defecto: todo lo que ya la llama —el formulario de Tránsito—
-- sigue funcionando sin tocarse, y guarda AI como siempre.
--
-- LA FIRMA VIEJA SE BORRA ANTES. Con `create or replace` y un parámetro
-- de más, Postgres NO reemplaza: crea una segunda función. Y una llamada
-- con los once parámetros de antes casaría con las dos y fallaría con
-- «function is not unique» — justo en el muelle, con el camión abierto.
-- ---------------------------------------------------------------------
drop function if exists public.sider_ai_guardar(
  uuid, text, text, text, text, boolean, integer, integer, jsonb, text, text
);

create or replace function public.sider_ai_guardar(
  p_viaje       uuid,
  p_turno       text,
  p_canal       text,
  p_socio       text,
  p_envase      text,
  p_certificado boolean,
  p_recibidas   integer,
  p_revisadas   integer,
  p_conteos     jsonb,            -- {"rota": 4, "faltante": 0, ...}
  p_zcl3        text default null,
  p_comentarios text default null,
  p_tipo        text default 'ai'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_fecha date; v_placa text; v_planta text;
  v_pidio boolean; v_llego boolean;
  v_clave text; v_n integer; v_suma integer := 0;
  v_nombre text;
begin
  if p_tipo is null or p_tipo not in ('ai', 'sorting') then
    raise exception 'El tipo de revisión tiene que ser ai o sorting';
  end if;
  v_nombre := case p_tipo when 'ai' then 'revisión AI' else 'Sorting' end;

  /* CADA TIPO SE PIDE POR SU PANTALLA. `es_editor()` es cierto con
     cualquier «editar» en cualquier sección, y con él un operador al que
     se le abre Sorting podía guardar una revisión AI llamando la función
     a mano: el cobro al socio en manos de quien solo iba a clasificar.
     La AI se hace dentro de Tránsito, así que pide «editar» ahí. */
  if p_tipo = 'sorting' then
    if not public.puede_editar('/sider/sorting') then
      raise exception 'Registrar un Sorting requiere permiso de edición en Sorting';
    end if;
  else
    if not (public.es_editor() and public.puede_editar('/sider/transito')) then
      raise exception 'Registrar una revisión AI requiere rol de supervisor o administrador';
    end if;
  end if;

  select coalesce(v.fecha, v.creado_en::date), v.placa, v.planta,
         case p_tipo when 'ai' then v.requiere_ai else v.requiere_sorting end,
         exists (select 1 from public.sider_certificaciones c
                  where c.viaje_id = v.id and c.punta = 'llegada')
    into v_fecha, v_placa, v_planta, v_pidio, v_llego
    from public.sider_viajes v where v.id = p_viaje;

  if v_fecha is null then raise exception 'Ese viaje no existe'; end if;
  if not v_pidio then
    raise exception 'Ese viaje no está marcado para %. Un administrador tiene que pedirlo primero', v_nombre;
  end if;
  /* LA REVISIÓN ES DE LO QUE LLEGÓ. Sin certificar la llegada no hay
     camión que revisar. */
  if not v_llego then
    raise exception 'Todavía no está certificada la llegada de ese viaje';
  end if;

  if upper(btrim(coalesce(p_turno, ''))) not in ('T1','T2','T3') then
    raise exception 'El turno tiene que ser T1, T2 o T3';
  end if;
  if coalesce(p_recibidas, 0) <= 0 then
    raise exception 'Hay que decir cuántas botellas llegaron de la referencia a revisar';
  end if;
  if coalesce(p_revisadas, 0) <= 0 then
    raise exception 'Hay que decir cuántas botellas se revisaron';
  end if;
  if p_revisadas > p_recibidas then
    raise exception 'Se revisaron % botellas de % que llegaron: la muestra no puede ser mayor que lo recibido',
      p_revisadas, p_recibidas;
  end if;

  if not exists (select 1 from public.sider_ai_envases where clave = p_envase and activo) then
    raise exception 'Ese tipo de envase no existe o está apagado';
  end if;
  if not exists (select 1 from public.sider_ai_canales where clave = p_canal and activo) then
    raise exception 'Ese canal de envase no existe o está apagado';
  end if;
  if p_canal = 'socios' and nullif(btrim(coalesce(p_socio, '')), '') is null then
    raise exception 'Una revisión del canal Socios tiene que decir de qué socio es';
  end if;
  if p_socio is not null and not exists (
       select 1 from public.sider_ai_socios where clave = p_socio and activo) then
    raise exception 'Ese socio no existe o está apagado';
  end if;

  for v_clave, v_n in select k.key, (k.value)::text::integer
                        from jsonb_each(coalesce(p_conteos, '{}'::jsonb)) k
  loop
    if not exists (select 1 from public.sider_ai_defectos where clave = v_clave and activo) then
      raise exception 'El defecto «%» no existe en el maestro', v_clave;
    end if;
    if v_n < 0 then
      raise exception 'El defecto «%» no puede venir en negativo', v_clave;
    end if;
    v_suma := v_suma + v_n;
  end loop;

  if v_suma > p_revisadas then
    raise exception 'Se marcaron % botellas con defecto de % revisadas', v_suma, p_revisadas;
  end if;

  insert into public.sider_ai_revisiones as r
    (viaje_id, tipo, fecha, planta, placa, turno, canal, socio, envase, certificado,
     recibidas, revisadas, zcl3, comentarios, revisado_por)
  values
    (p_viaje, p_tipo, v_fecha, v_planta, v_placa, upper(btrim(p_turno)),
     p_canal, nullif(btrim(coalesce(p_socio, '')), ''), p_envase,
     coalesce(p_certificado, false),
     p_recibidas, p_revisadas,
     nullif(btrim(coalesce(p_zcl3, '')), ''),
     nullif(btrim(coalesce(p_comentarios, '')), ''),
     auth.uid())
  /* LA LLAVE ES (VIAJE, TIPO): corregir el Sorting reescribe el Sorting y
     no toca la AI del mismo camión, ni al revés. */
  on conflict (viaje_id, tipo) do update set
     turno = excluded.turno, canal = excluded.canal, socio = excluded.socio,
     envase = excluded.envase, certificado = excluded.certificado,
     recibidas = excluded.recibidas, revisadas = excluded.revisadas,
     zcl3 = excluded.zcl3, comentarios = excluded.comentarios,
     editado_por = auth.uid(), editado_en = now(), ediciones = r.ediciones + 1
  returning r.id into v_id;

  delete from public.sider_ai_conteos where revision_id = v_id;
  insert into public.sider_ai_conteos (revision_id, defecto, unidades)
  select v_id, k.key, (k.value)::text::integer
    from jsonb_each(coalesce(p_conteos, '{}'::jsonb)) k
   where (k.value)::text::integer > 0;

  return v_id;
end $$;

grant execute on function public.sider_ai_guardar(
  uuid, text, text, text, text, boolean, integer, integer, jsonb, text, text, text
) to authenticated;


-- ---------------------------------------------------------------------
-- 6. LA PANTALLA NUEVA NACE CERRADA — SALVO PARA EL SUPERVISOR
--
-- El supervisor ya edita en Sider (Certificar, Tránsito, Importar) y ya
-- pasa por `es_editor()`, así que abrirle Sorting no le da nada que no
-- tuviera. A los operadores NO se les abre aquí: eso lo decide el
-- administrador en Administración → Roles, sabiendo lo que implica.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.rol_permisos') is not null then
    insert into public.rol_permisos (rol, seccion, nivel)
    select 'supervisor', '/sider/sorting', 'editar'
     where exists (select 1 from public.roles where clave = 'supervisor')
    on conflict (rol, seccion) do nothing;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 7. COMPROBACIÓN FINAL — SE PARA, NO AVISA
--
-- Avisar y seguir dejaría el informe de AI sumando Sorting.
-- ---------------------------------------------------------------------
do $$
declare v_antes int; v_ai int; v_mezcla int; v_sobrecargas int;
begin
  select n into v_antes from _sorting_antes;
  select count(*) into v_ai from public.v_sider_ai;
  if v_ai <> v_antes then
    raise exception 'v_sider_ai da % filas y antes de migrar había % revisiones (todas AI): algo se perdió o se coló.',
      v_ai, v_antes;
  end if;

  select count(*) into v_mezcla from public.v_sider_ai v
    join public.sider_ai_revisiones r on r.id = v.id where r.tipo <> 'ai';
  if v_mezcla > 0 then
    raise exception 'Hay % filas de Sorting dentro de v_sider_ai: el cobro al socio las sumaría.', v_mezcla;
  end if;

  select count(*) into v_sobrecargas from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sider_ai_guardar';
  if v_sobrecargas <> 1 then
    raise exception 'sider_ai_guardar tiene % versiones: con más de una, la llamada del muelle falla con «function is not unique».',
      v_sobrecargas;
  end if;

  raise notice 'Listo: % revisiones AI intactas y el Sorting aparte.', v_ai;
end $$;

commit;
