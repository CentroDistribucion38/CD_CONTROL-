-- =====================================================================
-- EL VIDRIO SALE CON EL VIAJE · LA CÉDULA DE LA SALIDA
-- ---------------------------------------------------------------------
-- «Que facturación no haga doble trabajo validando allá en salida y en
--  traspaso. Que cuando hagan el registro se genere una cédula, un
--  número único, y cuando facturación vaya a dar salida a un Vh de
--  traspaso y ese Vh tenga tolvas, en un desplegable aparezcan los
--  registros únicos que tenemos, traiga cuántas tolvas tiene el Vh, y
--  si corresponde pues que le dé salida.»
--
-- ---------------------------------------------------------------------
-- LO PRIMERO, Y ES LO QUE EVITA INVENTAR UN NÚMERO: LA CÉDULA YA EXISTE
-- ---------------------------------------------------------------------
-- Cada salida de vidrio nace con `roturas_salidas.codigo` —SR-0001,
-- SR-0002...—, único desde el primer día, y nace amarrada a la PLACA
-- del Vh. Eso ES la cédula. Crear un segundo número único al lado
-- habría dejado dos identidades para la misma carga y, el día que no
-- cuadren, nadie sabría cuál manda.
--
-- Lo que faltaba no era el número: era que la cédula quedara LISTA PARA
-- DESPACHAR al terminar de pesar, y que alguien la consumiera.
--
-- ---------------------------------------------------------------------
-- LA CADENA QUEDA ASÍ
-- ---------------------------------------------------------------------
--   PESAR         el supervisor (a) pesa tolva por tolva y cierra.
--                 Al cerrar, la salida queda CERRADA y sin despachar:
--                 eso es la cédula lista.
--
--   FACTURACIÓN   al dar salida al viaje de traspaso, si la placa tiene
--                 cédulas pendientes, escoge la suya, cuenta las tolvas
--                 que el Vh lleva de verdad, y el mismo acto da salida
--                 al viaje Y despacha el vidrio.
--
-- SE VA VALIDACIÓN. Era el paso donde se daba el aval del vidrio por
-- segunda vez. La pantalla no se borra del registro de módulos —perdería
-- su casilla de permisos en /admin/roles y nadie podría volver a darla—:
-- queda oculta y avisa a dónde se mudó.
--
-- ---------------------------------------------------------------------
-- LAS TRES REGLAS QUE NO SE NEGOCIAN
-- ---------------------------------------------------------------------
-- 1. LA PLACA TIENE QUE CUADRAR. Una cédula de la placa ABC123 no se
--    despacha en el viaje de la placa XYZ789. Es lo único que amarra el
--    vidrio al Vh que se lo llevó; sin eso, la cédula es un papel suelto.
--
-- 2. LAS TOLVAS TIENEN QUE CUADRAR, y es freno duro, no aviso. Si la
--    cédula dice cuatro y facturación cuenta tres, el Vh no sale. Una
--    tolva de diferencia son cientos de kilos de vidrio que alguien va a
--    tener que explicar, y explicarlo después de que el Vh cruzó la
--    portería no se puede.
--
-- 3. SIGUEN SIENDO DOS PERSONAS. Quien pesó no da la salida. Es la razón
--    de ser de la cadena y NO se pierde al quitar el paso de en medio:
--    ahora el segundo par de ojos es facturación. El administrador pasa
--    —un domingo la bodega no se puede quedar parada— y la vista lo
--    marca, así que la excepción se ve en pantalla en vez de esconderse.
--
-- ---------------------------------------------------------------------
-- Y UNA CUARTA, QUE ES LA QUE DE VERDAD CIERRA EL HUECO
-- ---------------------------------------------------------------------
-- SI LA PLACA TIENE VIDRIO PENDIENTE, EL VIAJE NO SALE SIN ESCOGERLO.
-- Sin esto, facturación podría dar salida al viaje ignorando el
-- desplegable y el vidrio se iría sin cédula despachada: el registro
-- diría que sigue en el patio y el Vh ya va por la vía. El aviso no
-- basta; tiene que frenar.
--
-- Va DESPUÉS de 2026-09-roturas-salida-dos-firmas.sql y de
-- 2026-09-traspasos-facturacion-en-traspasos.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- El delimitador de bloque de dos signos no se escribe en ningún
-- comentario: el editor de Supabase lo cuenta para trocear.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. LO QUE TIENE QUE ESTAR ANTES
--
-- Sin esto, el archivo revienta a la mitad con un «no existe» de
-- Postgres que no dice qué falta correr.
-- ---------------------------------------------------------------------
do $bloque$
declare v_falta text := '';
begin
  if to_regclass('public.roturas_salidas') is null then
    v_falta := v_falta || ' supabase/modulos/roturas.sql'; end if;
  if to_regclass('public.roturas_salida_tolvas') is null then
    v_falta := v_falta || ' supabase/modulos/roturas.sql'; end if;
  if to_regclass('public.traspasos_viajes') is null then
    v_falta := v_falta || ' supabase/modulos/traspasos.sql'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'salida_en') then
    v_falta := v_falta || ' 2026-09-traspasos-facturacion.sql'; end if;
  if v_falta <> '' then
    raise exception 'Falta correr antes:%', v_falta;
  end if;
end $bloque$;


-- ---------------------------------------------------------------------
-- 1. DÓNDE QUEDA ESCRITO QUE LA CÉDULA SE DESPACHÓ
--
-- Cuatro columnas en la salida, no una tabla aparte: una salida se
-- despacha UNA vez y en UN viaje. Una tabla de por medio permitiría dos
-- filas para la misma salida y habría que prohibirlo con una regla más.
--
-- `tolvas_contadas` guarda lo que facturación contó de verdad frente al
-- Vh. Hoy tiene que ser igual a lo pesado —si no, no sale— pero queda
-- escrito igual: el día que se afloje la regla, el histórico ya tiene
-- el dato y no hay que salir a reconstruirlo.
-- ---------------------------------------------------------------------
alter table public.roturas_salidas
  add column if not exists despachada_en    timestamptz,
  add column if not exists despachada_por   uuid references public.perfiles(id) on delete set null,
  add column if not exists viaje            uuid references public.traspasos_viajes(id) on delete set null,
  add column if not exists tolvas_contadas  integer;

/* UN VIAJE NO LLEVA DOS CÉDULAS, Y UNA CÉDULA NO VA EN DOS VIAJES.
   Lo segundo ya lo impide `despachada_en`; lo primero no lo impedía
   nada, y sin esto dos salidas distintas podían colgarse del mismo
   viaje y las tolvas del informe saldrían sumadas dos veces. */
create unique index if not exists roturas_salidas_viaje_unico
  on public.roturas_salidas (viaje) where viaje is not null;

/* Para el desplegable: se busca por placa entre las que están sin
   despachar, y son pocas frente al histórico entero. */
create index if not exists roturas_salidas_pendientes
  on public.roturas_salidas (placa) where despachada_en is null;


-- ---------------------------------------------------------------------
-- 2. FIRMAR: SE VA VALIDACIÓN
--
-- Va entera y no como un parche: en PostgreSQL no se remienda el cuerpo
-- de una función. Lo que cambia es la rama del validador —que ahora
-- rechaza, con el mismo trato que se le dio al verificador— y el aviso
-- que da.
--
-- LO YA VALIDADO NO SE BORRA. validador_por, validador_en y
-- validador_nota se quedan con lo que tengan: son el registro de quién
-- validó qué, y borrarlas dejaría las salidas de los meses pasados sin
-- poder decirlo. Dejan de pedirse, no de existir.
-- ---------------------------------------------------------------------
create or replace function public.salida_firmar(
  p_salida uuid,
  p_papel  text,
  p_nota   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.roturas_salidas%rowtype;
  v_tolvas integer;
  v_nota   text;
begin
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  select * into s from public.roturas_salidas where id = p_salida;
  if not found then raise exception 'Esa salida no existe'; end if;
  if s.estado = 'anulada' then raise exception 'Esa salida está anulada'; end if;

  /* LAS DOS FIRMAS QUE SE FUERON SE RECHAZAN POR NOMBRE, y antes de
     mirar permisos.

     Si una pantalla vieja se quedara abierta en el computador de
     alguien, o si alguien llamara a la función a mano, el mensaje que
     recibe dice QUÉ PASÓ y a DÓNDE SE MUDÓ, en vez de «no tienes el
     rol», que mandaría a pedirle un permiso a quien administra por una
     firma que ya no hay que poner. */
  if p_papel = 'verificador' then
    raise exception 'La firma de verificación ya no existe: la salida va de Pesar a Facturación';
  end if;
  if p_papel = 'validador' then
    raise exception 'La validación ya no se hace aquí: al cerrar el pesaje queda la cédula (%), y facturación la despacha al dar salida al viaje', coalesce(s.codigo, '—');
  end if;

  if not public.rotura_puede(p_papel) then
    raise exception 'No tienes el rol para poner la firma de %', p_papel;
  end if;

  if p_papel = 'supervisora' then
    select count(*) into v_tolvas
      from public.roturas_salida_tolvas where salida_id = p_salida;
    if v_tolvas = 0 then
      raise exception 'Una salida sin tolvas pesadas no se puede firmar';
    end if;
    if s.supervisora_en is not null then raise exception 'Ya está firmada por el supervisor (a)'; end if;
    update public.roturas_salidas
       set supervisora_por = auth.uid(), supervisora_en = now(),
           supervisora_nota = v_nota, estado = 'cerrada'
     where id = p_salida;

  else
    raise exception 'Firma desconocida: %', p_papel;
  end if;
end $fn$;

grant execute on function public.salida_firmar(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. LAS CÉDULAS QUE ESTÁN ESPERANDO VH
--
-- Es lo que alimenta el desplegable. Trae LA PLACA, LAS TOLVAS y LOS
-- KILOS, que es lo que facturación necesita para decir «sí, es este».
--
-- Solo las que están CERRADAS: una salida abierta todavía se está
-- pesando y ofrecerla sería despachar una carga a medio medir.
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
  /* CUÁNTOS DÍAS LLEVA ESPERANDO. Una cédula de hace una semana es una
     carga que se quedó, no una que está por salir, y en la pantalla
     tiene que verse distinta antes de que alguien la escoja por
     descuido. */
  (current_date - s.supervisora_en::date)   as dias_esperando
from public.roturas_salidas s
left join tol t on t.salida_id = s.id
where s.estado = 'cerrada'
  and s.despachada_en is null;

grant select on public.v_salidas_por_despachar to authenticated;


-- ---------------------------------------------------------------------
-- 4. LO QUE VE FACTURACIÓN ANTES DE DAR SALIDA
--
-- Una función y no una consulta desde el navegador: la pantalla no tiene
-- por qué saber que «pendiente» quiere decir cerrada-y-sin-despachar, y
-- el día que eso cambie no hay que salir a buscar la regla escrita en
-- dos sitios.
--
-- Devuelve SOLO las de esa placa. Un desplegable con todas las
-- pendientes del CD invita a escoger la de al lado: las placas se
-- parecen, y la de arriba es la que se toca.
-- ---------------------------------------------------------------------
create or replace function public.viaje_cedulas(p_viaje uuid)
returns table (
  id uuid, cedula text, placa text, tolvas integer,
  neto_kg numeric, dias_esperando integer, observacion text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare v_placa text;
begin
  if not public.puede_ver('/traspasos/facturacion') then
    raise exception 'Solo facturación ve las cédulas de vidrio de un viaje.' using errcode = '42501';
  end if;

  select v.placa into v_placa from public.traspasos_viajes v where v.id = p_viaje;
  if v_placa is null then return; end if;

  return query
    select d.id, d.cedula, d.placa, d.tolvas::integer,
           d.neto_kg, d.dias_esperando::integer, d.observacion
      from public.v_salidas_por_despachar d
     where d.placa = v_placa
     order by d.supervisora_en;
end $fn$;

grant execute on function public.viaje_cedulas(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5. CONFIRMAR LA SALIDA: EL VIAJE Y EL VIDRIO, EN UN SOLO ACTO
--
-- La función de siempre, con dos argumentos más y con defecto, así que
-- una llamada vieja de dos argumentos sigue entrando por aquí. La de dos
-- se borra para que no queden dos funciones con el mismo nombre: con
-- las dos puestas, Postgres no sabría cuál llamar y la llamada fallaría
-- con un «no es única» que no explica nada.
--
-- EL ORDEN DE LAS COMPROBACIONES IMPORTA. Primero todo lo del viaje
-- —permiso, documento, estado, repetido—, y solo al final el vidrio: si
-- el documento está repetido, el mensaje tiene que decir eso y no
-- «faltan las tolvas», que manda a mirar donde no es.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_confirmar_salida(uuid, text);

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
  v_pesadas   integer;
  v_pendientes integer;
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

  /* EL REPETIDO SE DICE CON EL VIAJE QUE YA LO TIENE: «ya está en otro
     viaje» a secas manda a buscarlo a mano. */
  select codigo, placa, fecha into v_otro from public.traspasos_viajes
   where factura_clave = v_clave and estado = 'registrado' limit 1;
  if found then
    raise exception 'El documento % ya está en el viaje % (placa %, %).',
      v_clave, coalesce(v_otro.codigo, '—'), coalesce(v_otro.placa, '—'), to_char(v_otro.fecha, 'DD/MM/YYYY');
  end if;

  -- ----- AQUÍ EMPIEZA EL VIDRIO -----

  /* SI HAY VIDRIO PENDIENTE PARA ESA PLACA, NO SE PUEDE IGNORAR.
     Es el freno que hace que quitar Validación no deje un hueco: sin
     esto, el Vh sale, el vidrio se va con él, y la cédula se queda
     diciendo que está en el patio. */
  if p_cedula is null then
    select count(*) into v_pendientes
      from public.v_salidas_por_despachar d where d.placa = v.placa;
    if v_pendientes > 0 then
      raise exception 'Ese Vh (%) tiene % salida(s) de vidrio sin despachar. Escoge la cédula antes de dar la salida.',
        coalesce(v.placa, '—'), v_pendientes;
    end if;

  else
    select * into s from public.roturas_salidas where id = p_cedula for update;
    if not found then raise exception 'Esa cédula de vidrio no existe.'; end if;
    if s.estado = 'anulada' then raise exception 'La cédula % está anulada: no sale.', s.codigo; end if;
    if s.supervisora_en is null then
      raise exception 'La cédula % todavía se está pesando: no está cerrada.', s.codigo;
    end if;
    if s.despachada_en is not null then
      raise exception 'La cédula % ya se despachó el %.', s.codigo, to_char(s.despachada_en, 'DD/MM/YYYY HH24:MI');
    end if;

    /* LA PLACA. Se comparan las dos normalizadas: la de la salida ya se
       guarda sin espacios ni guiones, la del viaje no necesariamente. */
    if upper(regexp_replace(coalesce(s.placa, ''), '[^A-Za-z0-9]', '', 'g'))
       is distinct from
       upper(regexp_replace(coalesce(v.placa, ''), '[^A-Za-z0-9]', '', 'g')) then
      raise exception 'La cédula % es de la placa % y este viaje es de la placa %.',
        s.codigo, coalesce(s.placa, '—'), coalesce(v.placa, '—');
    end if;

    /* LAS TOLVAS. Freno duro, no aviso: una tolva de diferencia son
       cientos de kilos que alguien va a tener que explicar, y
       explicarlo después de que el Vh cruzó la portería no se puede. */
    select count(*) into v_pesadas
      from public.roturas_salida_tolvas t where t.salida_id = s.id;
    if p_tolvas is null then
      raise exception 'Cuenta las tolvas que lleva el Vh: la cédula % tiene % pesada(s).', s.codigo, v_pesadas;
    end if;
    if p_tolvas <> v_pesadas then
      raise exception 'No cuadra: la cédula % tiene % tolva(s) pesada(s) y contaste %. El Vh no sale hasta que cuadre.',
        s.codigo, v_pesadas, p_tolvas;
    end if;

    /* SIGUEN SIENDO DOS PERSONAS. Quien pesó no da la salida. Al
       quitarse Validación, el segundo par de ojos es facturación, y la
       regla se muda con él en vez de perderse.
       EL ADMINISTRADOR PASA —un domingo la bodega no se queda parada—
       y queda escrito quién hizo cada cosa. */
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
         case when p_cedula is null then 'Facturación confirmó la salida'
              else 'Facturación confirmó la salida y despachó la cédula ' || s.codigo
                   || ' (' || p_tolvas || ' tolva(s))' end,
         to_jsonb(v), to_jsonb(n)
    from public.traspasos_viajes n where n.id = p_id;
end $fn$;

grant execute on function public.traspaso_confirmar_salida(uuid, text, uuid, integer) to authenticated;


-- ---------------------------------------------------------------------
-- 6. REABRIR LA SALIDA DEVUELVE TAMBIÉN EL VIDRIO
--
-- Sin esto, quien administra reabre el viaje para corregirlo y la cédula
-- se queda despachada contra un viaje que ya no salió: el vidrio
-- quedaría despachado para siempre sin nadie que lo despachara.
--
-- Va por un disparador sobre el viaje y no dentro de la función de
-- reabrir, para no reescribirla —ya se han perdido reglas
-- reescribiendo funciones de traspasos— y para que cubra también
-- cualquier otro camino que devuelva un viaje a no-salido.
-- ---------------------------------------------------------------------
create or replace function public.salida_vidrio_sigue_al_viaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if old.salida_en is not null and new.salida_en is null then
    update public.roturas_salidas
       set despachada_en = null, despachada_por = null,
           viaje = null, tolvas_contadas = null
     where viaje = new.id;
  end if;
  return new;
end $fn$;

drop trigger if exists tr_salida_vidrio_sigue_al_viaje on public.traspasos_viajes;
create trigger tr_salida_vidrio_sigue_al_viaje
  after update of salida_en on public.traspasos_viajes
  for each row execute function public.salida_vidrio_sigue_al_viaje();


-- ---------------------------------------------------------------------
-- 7. LA VISTA DE LAS SALIDAS DICE EN QUÉ VIAJE SE FUE CADA UNA
--
-- `firmas` y `completa` pasan a mirar el despacho: una salida pesada y
-- despachada está completa. Si siguieran contando la validación, toda
-- salida nueva diría «1 de 2» para siempre.
--
-- LAS COLUMNAS DEL VERIFICADOR Y DEL VALIDADOR SE QUEDAN: las pantallas
-- de histórico las leen para decir quién firmó lo de antes.
-- ---------------------------------------------------------------------
create or replace view public.v_roturas_salidas as
with tol as (
  select salida_id,
         count(*)                  as tolvas,
         sum(bruto_kg)             as bruto_kg,
         sum(tara_kg)              as tara_kg,
         sum(bruto_kg - tara_kg)   as neto_kg
    from public.roturas_salida_tolvas
   group by salida_id)
select
  s.id,
  s.codigo,
  s.placa,
  s.estado::text                                 as estado,
  s.observacion,
  s.creada_por, s.creada_en,
  s.supervisora_por, s.supervisora_en, s.supervisora_nota,
  s.verificador_por, s.verificador_en, s.verificador_nota,
  s.validador_por, s.validador_en, s.validador_nota,
  s.motivo_anulacion, s.anulada_en, s.anulada_por,
  coalesce(t.tolvas, 0)                          as tolvas,
  coalesce(t.bruto_kg, 0)                        as bruto_kg,
  coalesce(t.tara_kg, 0)                         as tara_kg,
  coalesce(t.neto_kg, 0)                         as neto_kg,
  /* PESAR y DESPACHAR. */
  ((s.supervisora_en is not null)::int
   + (s.despachada_en is not null)::int)         as firmas,
  (s.despachada_en is not null)                  as completa,
  /* Y las dos son de personas distintas, salvo que un administrador
     haya hecho las dos. Eso no se prohíbe —hay domingos— pero se dice
     en la pantalla. */
  coalesce(
      (s.supervisora_por is not null and s.supervisora_por = s.despachada_por)
  , false)                                       as mismo_firmante,
  /* LAS COLUMNAS NUEVAS VAN AL FINAL, Y NO ES CAPRICHO: «create or
     replace view» solo deja AGREGAR columnas por el final. Meter una en
     medio obliga a borrar la vista, y borrarla se lleva por delante a
     todo lo que cuelgue de ella. */
  s.despachada_en, s.despachada_por, s.viaje, s.tolvas_contadas,
  t2.codigo                                      as viaje_codigo,
  t2.factura_documento                           as viaje_documento
from public.roturas_salidas s
left join tol t on t.salida_id = s.id
left join public.traspasos_viajes t2 on t2.id = s.viaje;

grant select on public.v_roturas_salidas to authenticated;


-- ---------------------------------------------------------------------
-- 7b. EL ROL «validador» SE APAGA, NO SE BORRA
--
-- Mismo trato que se le dio al verificador, y por el mismo motivo:
-- puede haber gente con ese rol puesto, y borrarlo los dejaría SIN
-- NINGUNO. Se queda inactivo —no tiene pantalla ni firma que poner— y
-- quien administra decide a qué rol pasa a esa gente. Decidirlo desde
-- aquí sería decidirlo por él.
--
-- Y SI NO ESTÁ, no pasa nada. Esto no afirma nada sobre el estado
-- anterior de la base: una comprobación así, escrita adentro de una
-- migración, ya tumbó una vez la base de la bodega.
-- ---------------------------------------------------------------------
do $bloque$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'roles' and column_name = 'activo') then
    update public.roles set activo = false where clave = 'validador';
  end if;
  delete from public.rol_permisos where seccion = '/roturas/salida/validacion';
  update public.perfiles set permisos_extra = permisos_extra - '/roturas/salida/validacion'
   where permisos_extra ? '/roturas/salida/validacion';
end $bloque$;


-- ---------------------------------------------------------------------
-- 8. QUE QUEDE DICHO SI QUEDÓ
--
-- Una migración que «corre bien» y deja la mitad puesta es peor que una
-- que revienta: nadie va a volver a mirarla.
--
-- OJO CON LO QUE SE PUEDE COMPROBAR Y LO QUE NO: esto mira el estado
-- DESPUÉS, que es lo único que una migración puede afirmar de sí misma.
-- Una comprobación sobre el estado ANTERIOR de la base no se puede
-- escribir desde adentro —ya pasó una vez con el rol verificador, y
-- tumbó la migración en la base de la bodega—.
-- ---------------------------------------------------------------------
do $bloque$
declare f text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'roturas_salidas'
                    and column_name = 'despachada_en') then
    raise exception 'NO QUEDÓ: a roturas_salidas le falta despachada_en.';
  end if;
  if to_regclass('public.v_salidas_por_despachar') is null then
    raise exception 'NO QUEDÓ: falta la vista v_salidas_por_despachar.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'traspaso_confirmar_salida'
                    and p.pronargs = 4) then
    raise exception 'NO QUEDÓ: traspaso_confirmar_salida sigue sin recibir la cédula.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'traspaso_confirmar_salida'
                and p.pronargs = 2) then
    raise exception 'NO QUEDÓ: quedaron dos traspaso_confirmar_salida y Postgres no sabrá cuál llamar.';
  end if;

  select pg_get_functiondef(p.oid) into f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'salida_firmar';
  if f is null or f not like '%La validación ya no se hace aquí%' then
    raise exception 'NO QUEDÓ: salida_firmar todavía acepta la firma de validación.';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgname = 'tr_salida_vidrio_sigue_al_viaje') then
    raise exception 'NO QUEDÓ: falta el disparador que devuelve la cédula al reabrir el viaje.';
  end if;
end $bloque$;

do $bloque$ begin raise notice 'LISTO: el vidrio sale con el viaje. Pesar deja la cédula, facturación la despacha, y Validación se fue.'; end $bloque$;
commit;
