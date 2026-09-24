begin;

-- =====================================================================
-- AVERÍAS · LA UBICACIÓN SALE DEL MAESTRO, Y LA HORA LA PONE LA BASE
--
-- «En averías, en ubicación, que venga como desplegable del maestro que
--  tenemos en inventario; o sea esa ubicación debería ser calle, módulo,
--  lado, así como el inventario, esa parte llevaría la misma lógica.
--  El día en que pasó quítalo, porque por defecto quiero trazabilidad
--  de en qué turno, a qué hora, en qué fecha se hizo ese registro.»
--
-- ---------------------------------------------------------------------
-- ESTO CAMBIA DE OPINIÓN A PROPÓSITO, Y HAY QUE DECIRLO
-- ---------------------------------------------------------------------
-- La migración de averías dejó la ubicación como TEXTO LIBRE, y lo dejó
-- por escrito: «un maestro obligaría a dar de alta la calle antes de
-- poder registrar una avería, y eso es exactamente cómo se pierde el
-- registro de algo que ya pasó».
--
-- El argumento no era malo, pero la otra mitad pesa más: con texto
-- libre la misma calle se escribe «A03 M12», «a03-m12» y «A3 · M12», y
-- entonces el hallazgo de «concentración por calle» —que es para lo que
-- existe el tablero— reparte una misma calle en tres y no detecta nada.
-- El maestro de ubicaciones YA EXISTE en Inventario con sus 428 filas:
-- no hay que inventarlo, hay que usarlo.
--
-- LA CONTRAPARTIDA SE ACEPTA CON LOS OJOS ABIERTOS: si la ubicación no
-- está en el maestro, hay que darla de alta primero. Es lo que se
-- escogió.
--
-- ---------------------------------------------------------------------
-- LA FECHA DEJA DE SER UN CAMPO DEL FORMULARIO
-- ---------------------------------------------------------------------
-- Antes se podía teclear «el día en que pasó», y una fecha que se
-- teclea es una fecha que se puede poner mal —sin mala intención: el
-- dedo se va—. Ahora la ponen `now()` y el reloj de Colombia, junto con
-- LA HORA y EL TURNO, y no hay forma de tocarlas desde la pantalla.
--
-- Y SE GUARDA APARTE UN «PASÓ ANTES» OPCIONAL, para lo que se encuentra
-- hoy y se dañó ayer. Son dos datos distintos y por eso son dos
-- columnas: cuándo se registró es un hecho del sistema, cuándo pasó es
-- lo que alguien cree. Los informes cuentan por la de registro; la otra
-- solo explica.
--
-- Se puede correr varias veces sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. LAS DOS TABLAS QUE HACEN FALTA
--
-- SE COMPRUEBA ARRIBA Y CON EL NOMBRE DEL ARCHIVO. Sin esto, el error
-- sale ochenta renglones más abajo como «relation "ubicaciones" does
-- not exist», que no le dice a nadie qué correr.
-- ---------------------------------------------------------------------
do $bloque$
declare v_falta text := '';
begin
  if to_regclass('public.averias') is null then
    v_falta := v_falta || ' 2026-09-averias.sql'; end if;
  if to_regclass('public.ubicaciones') is null then
    v_falta := v_falta || ' 2026-09-inventario-fefo.sql'; end if;
  if v_falta <> '' then
    raise exception 'Falta correr antes:% — corre ese o esos archivos primero y vuelve a correr este.', v_falta;
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 1. EL TURNO DEL CENTRO DE DISTRIBUCIÓN, EN UN SOLO SITIO
--
-- SON OTROS QUE LOS DE LA PLANTA DE ENVASADO. En la planta el turno A
-- arranca a medianoche; aquí el 1 arranca a las 06:00. Ya hay dos
-- definiciones distintas de «turno» en este proyecto a propósito, y
-- esta es la tercera —la del CD—, que hasta hoy vivía escrita dentro
-- del encabezado de la aplicación y en ningún otro lado.
--
--   1   06:00 – 14:00
--   2   14:00 – 22:00
--   3   22:00 – 06:00
--
-- VA EN LA BASE Y NO EN LA PANTALLA porque es lo que se GUARDA. El
-- reloj del computador de la bodega se descuadra —ya pasó— y un turno
-- calculado en el navegador es un turno que se puede cambiar cambiando
-- la hora de Windows. El de aquí sale de `now()` del servidor.
-- ---------------------------------------------------------------------
create or replace function public.turno_cd(p_cuando timestamptz default now())
returns smallint
language sql
immutable
set search_path = public
as $$
  select case
           when extract(hour from (p_cuando at time zone 'America/Bogota')) >= 6
            and extract(hour from (p_cuando at time zone 'America/Bogota')) < 14 then 1
           when extract(hour from (p_cuando at time zone 'America/Bogota')) >= 14
            and extract(hour from (p_cuando at time zone 'America/Bogota')) < 22 then 2
           else 3
         end::smallint
$$;
grant execute on function public.turno_cd(timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 2. LAS COLUMNAS NUEVAS
--
-- `ubicacion` SE QUEDA. Es el texto combinado —«A03 · M12 · IZQ»— y
-- sigue siendo lo que se lee en la lista y en el PDF. Lo que se agrega
-- es el AMARRE al maestro: con solo el texto, el día que alguien
-- corrija «A03» a «A3» en el maestro, las averías viejas se quedan
-- apuntando a una calle que ya no se llama así.
-- ---------------------------------------------------------------------
alter table public.averias
  add column if not exists ubicacion_id uuid references public.ubicaciones(id),
  /* LA HORA Y EL TURNO DEL REGISTRO. `creado_en` ya tiene el instante,
     sí — pero el turno CALCULADO al vuelo cada vez que se consulta
     cambiaría si algún día se mueve el horario de los turnos, y
     entonces una avería del turno 2 pasaría a ser del 1 sin que nadie
     la tocara. Se congela en el momento de guardar. */
  add column if not exists turno smallint,
  /* LO QUE ALGUIEN CREE QUE PASÓ ANTES. Opcional y aparte de `fecha`,
     que es un hecho del sistema. */
  add column if not exists paso_antes date;

create index if not exists averias_ubicacion_id_idx on public.averias (ubicacion_id);

-- A LAS FILAS QUE YA ESTÁN se les pone el turno de cuando se crearon.
-- Dejarlas en nulo haría que el informe por turno tuviera un hueco sin
-- explicación; y `creado_en` ya dice la hora, así que no se inventa
-- nada — se calcula de lo que ya hay.
update public.averias set turno = public.turno_cd(creado_en) where turno is null;

-- Y SE LES AMARRA LA UBICACIÓN QUE SE PUEDA. Solo las que calcen exacto
-- con una clave del maestro: adivinar «A3 M12» → «A03_M12» es
-- justamente el tipo de arreglo silencioso que después nadie puede
-- auditar. Las que no calcen se quedan con su texto y sin amarre, que
-- es la verdad.
update public.averias a
   set ubicacion_id = u.id
  from public.ubicaciones u
 where a.ubicacion_id is null
   and upper(btrim(a.ubicacion)) = upper(u.clave);

-- ---------------------------------------------------------------------
-- 3. EL TEXTO DE LA UBICACIÓN, ARMADO EN UN SOLO SITIO
--
-- La pantalla lo pinta, el PDF lo imprime y la base lo guarda. Tres
-- sitios armando «calle · módulo · lado» son tres sitios donde un día
-- uno pone guion y otro pone punto, y entonces dejan de cuadrar dos
-- listas que hablan del mismo pasillo.
-- ---------------------------------------------------------------------
create or replace function public.ubicacion_texto(p_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case when u.lado is null then u.calle || ' · ' || u.modulo
              else u.calle || ' · ' || u.modulo || ' · ' || u.lado end
    from public.ubicaciones u where u.id = p_id
$$;
grant execute on function public.ubicacion_texto(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. REGISTRAR — CON UBICACIÓN DEL MAESTRO Y SIN FECHA A MANO
--
-- LA VIEJA SE BORRA, no se deja al lado. `create or replace` con otra
-- lista de argumentos deja DOS funciones con el mismo nombre, y la
-- pantalla vieja seguiría llamando a la vieja: el formulario nuevo
-- exigiría el maestro y cualquiera con la pantalla en caché seguiría
-- guardando texto libre, sin que nada avisara.
-- ---------------------------------------------------------------------
drop function if exists public.averia_registrar(text, text, integer, integer, text, text, date, date, text);

create or replace function public.averia_registrar(
  p_ubicacion_id uuid,
  p_sku          text,
  p_cajas        integer,
  p_unidades     integer,
  p_causal       text,
  p_reporto      text,
  p_vence        date default null,
  p_nota         text default null,
  p_paso_antes   date default null)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_cod text; v_nombre text;
  v_ahora timestamptz := now();
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_ubi public.ubicaciones%rowtype;
  v_texto text;
begin
  if not public.averia_puede_editar() then
    raise exception 'No tienes permiso para registrar averías';
  end if;

  /* LA UBICACIÓN TIENE QUE EXISTIR Y ESTAR ACTIVA. Una ubicación
     apagada es una que la bodega dejó de usar: registrar ahí es
     registrar en un sitio al que nadie va a ir a mirar. */
  if p_ubicacion_id is null then
    raise exception 'Falta la ubicación: una avería que no se sabe dónde está no se puede ir a ver';
  end if;
  select * into v_ubi from public.ubicaciones where ubicaciones.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa ubicación no está en el maestro de Inventario';
  end if;
  if not v_ubi.activa then
    raise exception 'Esa ubicación está apagada en el maestro: préndela primero o escoge otra';
  end if;

  if coalesce(p_cajas, 0) <= 0 and coalesce(p_unidades, 0) <= 0 then
    raise exception 'Hay que decir cuánto: cajas, unidades, o las dos';
  end if;
  if btrim(coalesce(p_reporto, '')) = '' then
    raise exception 'Falta el nombre de quien la reporta';
  end if;

  select p.nombre into v_nombre from public.productos p where p.sku = p_sku;
  if v_nombre is null then
    raise exception 'Ese producto no está en el maestro de inventario';
  end if;
  if not exists (select 1 from public.averias_causales c
                  where c.clave = p_causal and c.activo) then
    raise exception 'Esa causal no existe o está apagada';
  end if;

  /* «PASÓ ANTES» NO PUEDE SER DEL FUTURO NI DE HOY. Del futuro por lo
     obvio; de hoy porque entonces no es «antes» y lo único que haría es
     repetir la fecha del registro en otra columna — dos datos que dicen
     lo mismo son dos datos que un día dejan de decir lo mismo. */
  if p_paso_antes is not null and p_paso_antes >= v_hoy then
    raise exception 'Si pasó hoy no hace falta decirlo: la fecha del registro ya es la de hoy';
  end if;

  v_texto := public.ubicacion_texto(p_ubicacion_id);
  v_cod := 'AV-' || lpad(nextval('public.averias_codigo_seq')::text, 4, '0');

  insert into public.averias (codigo, fecha, ubicacion, ubicacion_id,
                              producto_sku, producto, cajas, unidades, vence,
                              causal, reporto, nota, turno, paso_antes,
                              creado_por, creado_en)
    values (v_cod,
            /* LA FECHA LA PONE LA BASE Y NO LLEGA POR PARÁMETRO: ya no
               hay forma de mandarla desde la pantalla. */
            v_hoy, v_texto, p_ubicacion_id,
            p_sku, v_nombre, coalesce(p_cajas, 0), coalesce(p_unidades, 0), p_vence,
            p_causal, btrim(p_reporto), nullif(btrim(coalesce(p_nota, '')), ''),
            public.turno_cd(v_ahora), p_paso_antes,
            auth.uid(), v_ahora)
    returning averias.id, averias.codigo into v_id, v_cod;

  id := v_id; codigo := v_cod;
  return next;
end $$;
grant execute on function public.averia_registrar(uuid, text, integer, integer, text, text, date, text, date)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4b. CORREGIR — LA MISMA REGLA, O NO SIRVE DE NADA
--
-- SI «CORREGIR» SIGUIERA ACEPTANDO TEXTO LIBRE, la regla nueva duraría
-- lo que tarde alguien en registrar bien y corregir mal: el maestro
-- guardaría la primera y el texto suelto entraría por la puerta de
-- atrás, sin que nada avisara. Una regla que solo se aplica en uno de
-- los dos caminos no es una regla.
--
-- LA FECHA TAMPOCO SE CORRIGE. Es el instante del registro, un hecho
-- del sistema: cambiarlo a mano es exactamente lo que se quitó del
-- formulario. Lo que sí se puede corregir es «pasó antes», que es lo
-- que alguien cree.
-- ---------------------------------------------------------------------
drop function if exists public.averia_corregir(uuid, text, text, integer, integer, text, text, date, date, text);

create or replace function public.averia_corregir(
  p_id           uuid,
  p_ubicacion_id uuid,
  p_sku          text,
  p_cajas        integer,
  p_unidades     integer,
  p_causal       text,
  p_reporto      text,
  p_vence        date default null,
  p_nota         text default null,
  p_paso_antes   date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.averias%rowtype; v_nombre text; v_ubi public.ubicaciones%rowtype;
begin
  if not public.manda() then
    raise exception 'Corregir una avería es del administrador';
  end if;

  select * into v from public.averias where averias.id = p_id;
  if not found then raise exception 'Esa avería no existe'; end if;
  if v.anulada_en is not null then
    raise exception 'Esa avería está anulada: para volver atrás se registra una nueva';
  end if;

  if p_ubicacion_id is null then
    raise exception 'Falta la ubicación';
  end if;
  select * into v_ubi from public.ubicaciones where ubicaciones.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa ubicación no está en el maestro de Inventario';
  end if;

  if coalesce(p_cajas, 0) <= 0 and coalesce(p_unidades, 0) <= 0 then
    raise exception 'Hay que decir cuánto: cajas, unidades, o las dos';
  end if;
  select p.nombre into v_nombre from public.productos p where p.sku = p_sku;
  if v_nombre is null then
    raise exception 'Ese producto no está en el maestro de inventario';
  end if;
  if not exists (select 1 from public.averias_causales c
                  where c.clave = p_causal and c.activo) then
    raise exception 'Esa causal no existe o está apagada';
  end if;
  if p_paso_antes is not null and p_paso_antes >= v.fecha then
    raise exception 'Eso no es «antes»: es la misma fecha del registro o después';
  end if;

  /* EL DOCUMENTO DE BAJA NO SE TOCA AQUÍ, a propósito: tiene sus dos
     funciones, y dejar que «corregir» lo cambiara sería un segundo
     camino para lo mismo, sin el rastro que aquellas dejan. NI LA
     FECHA, NI LA HORA, NI EL TURNO: son del registro. */
  update public.averias
     set ubicacion = public.ubicacion_texto(p_ubicacion_id),
         ubicacion_id = p_ubicacion_id,
         producto_sku = p_sku, producto = v_nombre,
         cajas = coalesce(p_cajas, 0), unidades = coalesce(p_unidades, 0),
         vence = p_vence, causal = p_causal, reporto = btrim(p_reporto),
         paso_antes = p_paso_antes,
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where averias.id = p_id;
end $$;
grant execute on function public.averia_corregir(uuid, uuid, text, integer, integer, text, text, date, text, date)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. LA VISTA — AHORA CON CALLE, MÓDULO, LADO, TURNO Y HORA
--
-- SE DESGLOSA AQUÍ Y NO EN LA PANTALLA. «Concentración por calle» hoy
-- saca la calle partiendo el texto de la ubicación con una expresión;
-- con la columna de verdad, eso deja de depender de cómo se escribió el
-- texto.
-- ---------------------------------------------------------------------
-- SE BORRA Y SE VUELVE A CREAR, no `create or replace`.
-- Postgres NO deja meter una columna en MEDIO de una vista que ya
-- existe: contesta «cannot change name of view column "producto_sku"
-- to "ubicacion_id"», que es un mensaje que no menciona el problema
-- real. Es el mismo error que dejó trancada `2026-09-corregir-viajes`.
--
-- SIN `cascade`, a propósito: si algún día algo cuelga de esta vista,
-- quiero que el archivo se caiga diciéndolo y no que se lleve por
-- delante lo que colgaba, en silencio.
drop view if exists public.v_averias;

create view public.v_averias as
  select a.id, a.codigo, a.fecha, a.ubicacion,
         a.ubicacion_id,
         u.calle, u.modulo, u.lado, u.clave as ubicacion_clave,
         a.producto_sku, a.producto,
         a.cajas, a.unidades, a.vence,
         a.causal, c.nombre as causal_nombre, c.externa,
         a.reporto, a.documento, a.documento_en, a.nota,
         a.creado_por, a.creado_en,
         a.turno,
         /* LA HORA, YA EN HORA DE COLOMBIA. Mandar el instante crudo y
            que cada pantalla lo convierta es cómo una lista termina
            diciendo que una avería del turno 3 se registró a las 4 de
            la mañana en un sitio y a las 9 de la noche en otro. */
         to_char(a.creado_en at time zone 'America/Bogota', 'HH24:MI') as hora,
         a.paso_antes,
         a.anulada_en, a.motivo_anulacion,
         (a.documento is null and a.anulada_en is null) as pendiente_baja,
         case when a.documento_en is not null
              then (a.documento_en at time zone 'America/Bogota')::date - a.fecha
         end as dias_baja,
         case when a.vence is not null
              then a.vence - (now() at time zone 'America/Bogota')::date
         end as dias_para_vencer,
         (select count(*) from public.averias_fotos f where f.averia_id = a.id) as fotos
    from public.averias a
    join public.averias_causales c on c.clave = a.causal
    /* IZQUIERDA Y NO INTERIOR: las averías viejas que se registraron con
       texto libre no tienen amarre, y con un join interior
       DESAPARECERÍAN de la lista sin que nadie se enterara. */
    left join public.ubicaciones u on u.id = a.ubicacion_id;

grant select on public.v_averias to authenticated;

-- ---------------------------------------------------------------------
-- 6. EL MAESTRO DE UBICACIONES SE PUEDE LEER DESDE AVERÍAS
--
-- Sin esto el desplegable sale vacío y la pantalla parece rota. Es de
-- LECTURA solamente: las ubicaciones se dan de alta en el maestro de
-- Inventario, que es donde se ven junto a todo lo demás.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_class where relname = 'ubicaciones'
              and relnamespace = 'public'::regnamespace and relrowsecurity) then
    drop policy if exists ubicaciones_ver_averias on public.ubicaciones;
    create policy ubicaciones_ver_averias on public.ubicaciones
      for select to authenticated
      using (public.mi_nivel_pantalla('/inventario/averias') <> 'ninguno' or public.manda());
  end if;
end $$;
grant select on public.ubicaciones to authenticated;

do $$
declare v_con int; v_sin int; v_tot int;
begin
  select count(*) into v_tot from public.averias;
  select count(*) into v_con from public.averias where ubicacion_id is not null;
  v_sin := v_tot - v_con;
  raise notice 'Averias: % en total, % amarradas al maestro de ubicaciones.', v_tot, v_con;
  if v_sin > 0 then
    raise notice '% quedaron con su texto viejo y sin amarre: no calzaban con ninguna clave del maestro. Se siguen viendo.', v_sin;
  end if;
  raise notice 'La fecha, la hora y el turno los pone ahora la base: el formulario ya no los pregunta.';
end $$;

commit;
