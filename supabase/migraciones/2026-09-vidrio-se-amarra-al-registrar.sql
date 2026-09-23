-- =====================================================================
-- EL VIDRIO SE AMARRA AL REGISTRAR EL VIAJE, NO AL FACTURARLO
-- ---------------------------------------------------------------------
-- «Coloqué tolva y no veo qué placas tengo allí con tolva y la cantidad.
--  Eso viene del registro de salida: es lo que te trato de decir.»
--
-- ---------------------------------------------------------------------
-- LO QUE ESTABA MAL, Y ERA DE FONDO
-- ---------------------------------------------------------------------
-- El vidrio se amarraba al viaje por la PLACA, al final, en facturación.
-- Eso funciona solo si alguien escribió la misma placa en los dos
-- sitios; y si se equivoca, no pasa nada visible: el viaje sale sin
-- vidrio y la cédula se queda esperando un camión que ya se fue.
--
-- El problema no estaba al final: estaba al principio. Quien registra
-- un traspaso de Tolvas de Vidrio SABE que va a cargar vidrio, y es
-- justo ahí donde la pantalla tenía la información y no la mostraba.
--
-- ---------------------------------------------------------------------
-- COMO QUEDA
-- ---------------------------------------------------------------------
-- Al escoger «Tolvas de Vidrio» en Registrar, la pantalla ofrece LAS
-- PLACAS QUE TIENEN VIDRIO PESADO ESPERANDO, con sus tolvas y sus
-- kilos. Se toca una y quedan puestas la placa y la cantidad. El viaje
-- nace ya amarrado a su cédula.
--
-- Después, facturación solo pone el documento: la cédula ya viene
-- resuelta, no hay nada que escoger ni que contar.
--
-- ---------------------------------------------------------------------
-- TRES ESTADOS, Y HACEN FALTA LOS TRES
-- ---------------------------------------------------------------------
--   DISPONIBLE   cerrada, sin viaje. Se puede escoger al registrar.
--   RESERVADA    tiene `viaje` y no tiene `despachada_en`. El patio ya
--                la cargó en ese camión; el camión todavía no ha salido.
--   DESPACHADA   tiene `despachada_en`. Salió por la puerta.
--
-- RESERVADA NO ES DESPACHADA, y mezclarlas sería mentir en las dos
-- direcciones: una cédula cargada pero sin documento no ha salido del
-- CD, y contarla como salida inflaría el informe de kilos que salieron.
--
-- ---------------------------------------------------------------------
-- Y LO QUE PASA CUANDO ALGO SE DESHACE
-- ---------------------------------------------------------------------
-- · Se ANULA el viaje → la cédula SE SUELTA y vuelve a estar
--   disponible. El vidrio no se fue a ninguna parte.
-- · Facturación REABRE la salida → la cédula sigue RESERVADA para ese
--   viaje. Reabrir es corregir un documento, no descargar el camión.
--   (Antes el disparador la soltaba entera; con el amarre en el
--   registro eso borraría un dato que nadie volvió a escribir.)
--
-- Va DESPUÉS de 2026-09-vidrio-cedula-facturacion.sql (el SQL 8).
-- SE PUEDE CORRER VARIAS VECES.
-- El delimitador de bloque de dos signos no se escribe en ningún
-- comentario: el editor de Supabase lo cuenta para trocear.
-- =====================================================================
begin;

do $bloque$
begin
  if to_regclass('public.v_salidas_por_despachar') is null then
    raise exception 'Falta correr antes: 2026-09-vidrio-cedula-facturacion.sql (el SQL 8) — corre ese primero y vuelve a correr este.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'roturas_salidas'
                    and column_name = 'viaje') then
    raise exception 'Falta correr antes: 2026-09-vidrio-cedula-facturacion.sql (el SQL 8).';
  end if;
end $bloque$;


-- ---------------------------------------------------------------------
-- 1. LO QUE SE PUEDE ESCOGER AL REGISTRAR
--
-- Cerradas, sin viaje y sin despachar. Se le agrega `and s.viaje is
-- null` a la vista de siempre: una cédula ya reservada para un viaje NO
-- puede ofrecerse para otro, o el mismo vidrio se cargaría dos veces.
-- ---------------------------------------------------------------------
create or replace view public.v_salidas_por_despachar as
with tol as (
  select salida_id,
         count(*)                as tolvas,
         sum(bruto_kg - tara_kg) as neto_kg
    from public.roturas_salida_tolvas
   group by salida_id)
select
  s.id,
  s.codigo                                  as cedula,
  s.placa,
  coalesce(t.tolvas, 0)                     as tolvas,
  round(coalesce(t.neto_kg, 0)::numeric, 1) as neto_kg,
  s.observacion,
  s.supervisora_por,
  s.supervisora_en,
  s.creada_en,
  (current_date - s.supervisora_en::date)   as dias_esperando
from public.roturas_salidas s
left join tol t on t.salida_id = s.id
where s.estado = 'cerrada'
  and s.despachada_en is null
  and s.viaje is null;                       -- ← NUEVO: la reservada no se ofrece

grant select on public.v_salidas_por_despachar to authenticated;


-- ---------------------------------------------------------------------
-- 2. LA CÉDULA QUE YA LLEVA UN VIAJE
--
-- Para que facturación la muestre sin tener que escogerla, y para que
-- el patio la vea al corregir. Una fila por viaje, como mucho.
-- ---------------------------------------------------------------------
create or replace view public.v_salidas_reservadas as
with tol as (
  select salida_id,
         count(*)                as tolvas,
         sum(bruto_kg - tara_kg) as neto_kg
    from public.roturas_salida_tolvas
   group by salida_id)
select
  s.id,
  s.viaje,
  s.codigo                                  as cedula,
  s.placa,
  coalesce(t.tolvas, 0)                     as tolvas,
  round(coalesce(t.neto_kg, 0)::numeric, 1) as neto_kg,
  s.observacion,
  s.supervisora_por,
  s.supervisora_en
from public.roturas_salidas s
left join tol t on t.salida_id = s.id
where s.viaje is not null
  and s.despachada_en is null
  and s.estado = 'cerrada';

grant select on public.v_salidas_reservadas to authenticated;


-- ---------------------------------------------------------------------
-- 3. AMARRAR LA CÉDULA A UN VIAJE
--
-- Va en su propia función y NO como un argumento más de
-- `traspaso_registrar`. Esa función tiene cuatrocientas líneas de
-- reglas acumuladas —el día operativo, el tope de siete días adelante,
-- el candado del día cerrado, los sitios sueltos— y en PostgreSQL no se
-- remienda el cuerpo de una función: para agregarle un argumento hay
-- que reescribirla entera. Ya se han perdido reglas reescribiéndola.
--
-- La pantalla registra y, si escogió cédula, amarra. Si lo segundo
-- falla, el viaje YA EXISTE y eso es lo correcto: el viaje ocurrió. La
-- pantalla lo dice y se puede amarrar después.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_amarrar_cedula(p_viaje uuid, p_cedula uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.traspasos_viajes%rowtype;
  s public.roturas_salidas%rowtype;
  v_otra text;
begin
  if not public.puede_editar('/traspasos') and not public.puede_editar('/traspasos/facturacion') then
    raise exception 'No tienes permiso para amarrar el vidrio a un viaje.' using errcode = '42501';
  end if;

  select * into v from public.traspasos_viajes where id = p_viaje for update;
  if not found then raise exception 'Ese viaje no existe.'; end if;
  if v.estado <> 'registrado' then raise exception 'Ese viaje está anulado.'; end if;
  if v.salida_en is not null then
    raise exception 'Ese viaje ya salió: el vidrio se amarra antes, no después.';
  end if;

  /* UN VIAJE NO LLEVA DOS CÉDULAS. Se dice con la que ya tiene: «ya
     tiene una» a secas manda a buscarla a mano. */
  select codigo into v_otra from public.roturas_salidas
   where viaje = p_viaje and id <> p_cedula and despachada_en is null;
  if found then
    raise exception 'Ese viaje ya lleva la cédula %. Suéltala primero si era otra.', v_otra;
  end if;

  select * into s from public.roturas_salidas where id = p_cedula for update;
  if not found then raise exception 'Esa cédula de vidrio no existe.'; end if;
  if s.estado = 'anulada' then raise exception 'La cédula % está anulada.', s.codigo; end if;
  if s.supervisora_en is null then
    raise exception 'La cédula % todavía se está pesando: no está cerrada.', s.codigo;
  end if;
  if s.despachada_en is not null then
    raise exception 'La cédula % ya salió el %.', s.codigo, to_char(s.despachada_en, 'DD/MM/YYYY HH24:MI');
  end if;
  if s.viaje is not null and s.viaje <> p_viaje then
    raise exception 'La cédula % ya está cargada en otro viaje.', s.codigo;
  end if;

  /* LA PLACA TIENE QUE CUADRAR, también aquí. La pantalla ofrece solo
     las de esa placa, pero la regla vive en la base: una pantalla es
     una sugerencia, una función es una regla. */
  if upper(regexp_replace(coalesce(s.placa, ''), '[^A-Za-z0-9]', '', 'g'))
     is distinct from
     upper(regexp_replace(coalesce(v.placa, ''), '[^A-Za-z0-9]', '', 'g')) then
    raise exception 'La cédula % es de la placa % y el viaje es de la placa %.',
      s.codigo, coalesce(s.placa, '—'), coalesce(v.placa, '—');
  end if;

  update public.roturas_salidas set viaje = p_viaje where id = p_cedula;
  return s.codigo;
end $fn$;

grant execute on function public.traspaso_amarrar_cedula(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. SOLTARLA
--
-- Para corregir en el patio: se escogió la cédula equivocada y el
-- camión todavía no ha salido.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_soltar_cedula(p_viaje uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare v_cod text;
begin
  if not public.puede_editar('/traspasos') and not public.puede_editar('/traspasos/facturacion') then
    raise exception 'No tienes permiso para soltar el vidrio de un viaje.' using errcode = '42501';
  end if;

  select codigo into v_cod from public.roturas_salidas
   where viaje = p_viaje and despachada_en is null;
  if not found then return null; end if;

  update public.roturas_salidas set viaje = null
   where viaje = p_viaje and despachada_en is null;
  return v_cod;
end $fn$;

grant execute on function public.traspaso_soltar_cedula(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5. CONFIRMAR LA SALIDA: LA CÉDULA RESERVADA SE DESPACHA SOLA
--
-- Si el viaje ya trae su cédula del registro, facturación solo pone el
-- documento: no hay nada que escoger ni que contar. Las tolvas las
-- contó quien pesó y quedaron cerradas; volver a pedirlas sería pedir
-- que se cuente un camión ya cargado y sellado.
--
-- LO QUE NO SE PIERDE: siguen siendo DOS PERSONAS. Quien pesó no da la
-- salida — esa regla se comprueba igual, con cédula reservada o sin
-- ella. Es la razón de ser de la cadena.
--
-- Y SI NO VIENE AMARRADA —los viajes de antes, o alguien que registró
-- sin escoger— sigue funcionando como hasta ahora: se escoge la cédula
-- y se cuentan las tolvas. Quitar ese camino dejaría sin salida a todo
-- lo que ya está registrado.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_confirmar_salida(
  p_id        uuid,
  p_documento text,
  p_cedula    uuid    default null,
  p_tolvas    integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v       public.traspasos_viajes%rowtype;
  v_clave text := nullif(upper(regexp_replace(coalesce(p_documento, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_otro  record;
  s       public.roturas_salidas%rowtype;
  v_pesadas    integer;
  v_pendientes integer;
  v_reservada  uuid;
begin
  if not public.puede_editar('/traspasos/facturacion') then
    raise exception 'Solo facturación confirma la salida de un viaje.' using errcode = '42501';
  end if;
  if v_clave is null then
    raise exception 'Falta el número de documento.';
  end if;
  if v_clave !~ '^[0-9]{1,10}$' then
    raise exception 'El número de documento va en cifras y con diez como máximo.';
  end if;

  select * into v from public.traspasos_viajes where id = p_id for update;
  if not found then raise exception 'Ese viaje no existe.'; end if;
  if v.estado <> 'registrado' then raise exception 'Ese viaje está anulado: no sale.'; end if;
  if v.vacio then raise exception 'Un viaje vacío no lleva documento de facturación.'; end if;
  if v.salida_en is not null then
    raise exception 'Ese viaje ya salió con el documento %.', v.factura_documento;
  end if;

  select codigo, placa, fecha into v_otro from public.traspasos_viajes
   where factura_clave = v_clave and estado = 'registrado' limit 1;
  if found then
    raise exception 'El documento % ya está en el viaje % (placa %, %).',
      v_clave, coalesce(v_otro.codigo, '—'), coalesce(v_otro.placa, '—'), to_char(v_otro.fecha, 'DD/MM/YYYY');
  end if;

  -- ----- EL VIDRIO -----

  /* ¿YA VIENE AMARRADA DEL REGISTRO? Entonces esa es, y no se pregunta
     nada más. */
  select id into v_reservada from public.roturas_salidas
   where viaje = p_id and despachada_en is null and estado = 'cerrada';

  if v_reservada is not null then
    select * into s from public.roturas_salidas where id = v_reservada for update;

    /* SIGUEN SIENDO DOS PERSONAS, con cédula reservada o sin ella. */
    if s.supervisora_por = auth.uid() and public.mi_rol() <> 'admin' then
      raise exception 'Son dos personas y dos momentos: quien pesó el vidrio no le da la salida';
    end if;

    select count(*) into v_pesadas
      from public.roturas_salida_tolvas t where t.salida_id = s.id;

    update public.roturas_salidas
       set despachada_en = now(), despachada_por = auth.uid(),
           tolvas_contadas = v_pesadas
     where id = s.id;

  elsif p_cedula is null then
    /* SIN AMARRE Y SIN CÉDULA ESCOGIDA: si la placa tiene vidrio
       esperando, no sale. Es el freno que evita que el Vh se vaya con
       el vidrio y el registro diga que sigue en el patio. */
    select count(*) into v_pendientes
      from public.v_salidas_por_despachar d where d.placa = v.placa;
    if v_pendientes > 0 then
      raise exception 'Ese Vh (%) tiene % salida(s) de vidrio sin despachar. Escoge la cédula antes de dar la salida.',
        coalesce(v.placa, '—'), v_pendientes;
    end if;

  else
    /* EL CAMINO VIEJO, para lo que ya estaba registrado sin amarre. */
    select * into s from public.roturas_salidas where id = p_cedula for update;
    if not found then raise exception 'Esa cédula de vidrio no existe.'; end if;
    if s.estado = 'anulada' then raise exception 'La cédula % está anulada: no sale.', s.codigo; end if;
    if s.supervisora_en is null then
      raise exception 'La cédula % todavía se está pesando: no está cerrada.', s.codigo;
    end if;
    if s.despachada_en is not null then
      raise exception 'La cédula % ya se despachó el %.', s.codigo, to_char(s.despachada_en, 'DD/MM/YYYY HH24:MI');
    end if;

    if upper(regexp_replace(coalesce(s.placa, ''), '[^A-Za-z0-9]', '', 'g'))
       is distinct from
       upper(regexp_replace(coalesce(v.placa, ''), '[^A-Za-z0-9]', '', 'g')) then
      raise exception 'La cédula % es de la placa % y este viaje es de la placa %.',
        s.codigo, coalesce(s.placa, '—'), coalesce(v.placa, '—');
    end if;

    select count(*) into v_pesadas
      from public.roturas_salida_tolvas t where t.salida_id = s.id;
    if p_tolvas is null then
      raise exception 'Cuenta las tolvas que lleva el Vh: la cédula % tiene % pesada(s).', s.codigo, v_pesadas;
    end if;
    if p_tolvas <> v_pesadas then
      raise exception 'No cuadra: la cédula % tiene % tolva(s) pesada(s) y contaste %. El Vh no sale hasta que cuadre.',
        s.codigo, v_pesadas, p_tolvas;
    end if;
    if s.supervisora_por = auth.uid() and public.mi_rol() <> 'admin' then
      raise exception 'Son dos personas y dos momentos: quien pesó el vidrio no le da la salida';
    end if;

    update public.roturas_salidas
       set despachada_en = now(), despachada_por = auth.uid(),
           viaje = p_id, tolvas_contadas = p_tolvas
     where id = s.id;
  end if;

  update public.traspasos_viajes
     set factura_documento = btrim(p_documento),
         salida_en = now(), salida_por = auth.uid(), salida_historica = false
   where id = p_id;

  insert into public.traspasos_viajes_ediciones (viaje, editado_por, motivo, antes, despues)
  select p_id, auth.uid(),
         case when s.codigo is null then 'Facturación confirmó la salida'
              else 'Facturación confirmó la salida y despachó la cédula ' || s.codigo end,
         to_jsonb(v), to_jsonb(n)
    from public.traspasos_viajes n where n.id = p_id;
end $fn$;

grant execute on function public.traspaso_confirmar_salida(uuid, text, uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 6. REABRIR NO DESCARGA EL CAMIÓN
--
-- El disparador de antes soltaba la cédula entera al reabrir el viaje.
-- Con el amarre puesto en el REGISTRO, eso borraría un dato que nadie
-- volvió a escribir: el patio dijo «este vidrio va en este camión» y
-- reabrir es corregir un DOCUMENTO, no descargar el camión.
--
-- Así que reabrir deja de despacharla, pero la deja RESERVADA. Lo que
-- sí la suelta es ANULAR el viaje: ahí el vidrio no se fue a ninguna
-- parte y tiene que volver a estar disponible.
-- ---------------------------------------------------------------------
create or replace function public.salida_vidrio_sigue_al_viaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  /* Dejó de estar salido → deja de estar despachada, pero sigue cargada. */
  if old.salida_en is not null and new.salida_en is null then
    update public.roturas_salidas
       set despachada_en = null, despachada_por = null, tolvas_contadas = null
     where viaje = new.id;
  end if;

  /* Se anuló el viaje → el vidrio se suelta y vuelve a la lista. */
  if old.estado = 'registrado' and new.estado <> 'registrado' then
    update public.roturas_salidas
       set despachada_en = null, despachada_por = null,
           tolvas_contadas = null, viaje = null
     where viaje = new.id;
  end if;

  return new;
end $fn$;

drop trigger if exists tr_salida_vidrio_sigue_al_viaje on public.traspasos_viajes;
create trigger tr_salida_vidrio_sigue_al_viaje
  after update of salida_en, estado on public.traspasos_viajes
  for each row execute function public.salida_vidrio_sigue_al_viaje();


-- ---------------------------------------------------------------------
-- 7. QUE QUEDE DICHO SI QUEDÓ
-- ---------------------------------------------------------------------
do $bloque$
declare f text; n int;
begin
  for f in select unnest(array['traspaso_amarrar_cedula', 'traspaso_soltar_cedula']) loop
    if not exists (select 1 from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
                    where n2.nspname = 'public' and p.proname = f) then
      raise exception 'NO QUEDÓ: falta la función %.', f;
    end if;
  end loop;

  if to_regclass('public.v_salidas_reservadas') is null then
    raise exception 'NO QUEDÓ: falta la vista v_salidas_reservadas.';
  end if;

  select pg_get_viewdef('public.v_salidas_por_despachar'::regclass, true) into f;
  if f not like '%viaje IS NULL%' then
    raise exception 'NO QUEDÓ: una cédula ya cargada en un viaje se sigue ofreciendo para otro.';
  end if;

  /* NINGUNA CÉDULA PUEDE ESTAR A LA VEZ DISPONIBLE Y RESERVADA. */
  select count(*) into n
    from public.v_salidas_por_despachar a
    join public.v_salidas_reservadas b on b.id = a.id;
  if n > 0 then
    raise exception 'NO QUEDÓ: % cédula(s) salen a la vez como libres y como cargadas.', n;
  end if;

  select count(*) into n from public.v_salidas_reservadas;
  raise notice 'LISTO: el vidrio se amarra al registrar el viaje. Ahora mismo hay % cédula(s) ya cargadas esperando salir.', n;
end $bloque$;
commit;
