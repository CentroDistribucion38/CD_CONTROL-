-- =====================================================================
-- ROTURAS EN SITIO · LA CADENA, AL DERECHO
-- ---------------------------------------------------------------------
-- «Registran, llega a Visto bueno, allí EASY dice si está de acuerdo o
--  no. Si está de acuerdo va para cobro de una y no llega notificación,
--  sino que llega a la data. Si no está de acuerdo llega la
--  notificación a ABI, y ABI culmina de decir si se cobra o no. Y en
--  todo se requiere evidencia.»
--
-- ---------------------------------------------------------------------
-- ESTO INVIERTE LA CADENA QUE HABÍA
-- ---------------------------------------------------------------------
-- La versión anterior —`2026-09-roturas-descargo-del-ol.sql`, que NO SE
-- CORRIÓ— tenía el orden al revés:
--
--     registro  →  ABI dice que cuenta  →  el OL responde  →  ABI resuelve
--
-- Es decir: ABI cobraba primero y el OL objetaba después. Eso obliga a
-- que TODA rotura pase por ABI, y a que el OL reciba una cuenta antes
-- de haber podido decir nada. La cadena pedida es la contraria:
--
--     registro  →  EASY dice si está de acuerdo
--                    ├─ de acuerdo   → cobro, y ABI ni se entera
--                    └─ en desacuerdo → ABI resuelve, y es la última
--
-- Y NO ES UN DETALLE DE ORDEN. En la cadena vieja, ABI tenía que mirar
-- las cien roturas del mes. En esta solo mira LAS QUE ALGUIEN OBJETÓ,
-- que son las únicas donde su criterio cambia algo. Lo demás se
-- concilia solo, que es de lo que se trataba.
--
-- Aquel archivo queda muerto: esta migración lo reemplaza entero. Si ya
-- se hubiera corrido, esta lo deja consistente igual.
--
-- ---------------------------------------------------------------------
-- POR QUÉ `estado` SIGUE SIN TOCARSE
-- ---------------------------------------------------------------------
-- Lo evidente sería meterle estados nuevos al enum `rotura_estado`
-- —«en_desacuerdo», «aceptada»— y sería un error caro: `estado =
-- 'cuenta'` lo leen hoy la vista, las cifras, tres índices y toda
-- pantalla que pregunte si una rotura se cobra. Agregarle significados
-- reinterpreta TODO lo ya decidido, hacia atrás y en silencio.
--
-- `estado` sigue queriendo decir exactamente lo que dice hoy: SI SE
-- COBRA O NO, ya resuelto. Quién lo dijo y por qué camino va en sus
-- propias columnas.
--
-- UNA ROTURA QUE EASY RECHAZÓ SIGUE EN 'esperando', y eso es lo
-- correcto: todavía no está decidida. Lo que la distingue de una recién
-- registrada es `ol_respuesta = 'rechaza'`, y eso es lo que la pone en
-- la bandeja de ABI.
--
-- ---------------------------------------------------------------------
-- «Y EN TODO SE REQUIERE EVIDENCIA»
-- ---------------------------------------------------------------------
-- Evidencia en los DOS lados, y no solo al registrar:
--
--   AL REGISTRAR   la foto de la rotura. Ya existía, por causa.
--   AL RECHAZAR    foto del descargo. Sin ella, «no estoy de acuerdo»
--                  es una opinión, y ABI tendría que resolver un pleito
--                  donde una parte trajo pruebas y la otra no.
--
-- Por eso `roturas_fotos` gana un `papel`: la misma tabla, dos momentos.
-- Dos tablas de fotos serían dos veces el mismo manejo de subida, y el
-- día que se agregue «quién la tomó» habría que acordarse de las dos.
--
-- ACEPTAR NO EXIGE FOTO. Quien acepta no está probando nada: está
-- diciendo que sí. Exigírsela sería cobrarle un trámite por estar de
-- acuerdo, y eso es exactamente lo que hace que la gente empiece a
-- rechazar por costumbre.
--
-- ---------------------------------------------------------------------
-- «NO LLEGA NOTIFICACIÓN, SINO QUE LLEGA A LA DATA»
-- ---------------------------------------------------------------------
-- Cuando Easy está de acuerdo, la rotura NO aparece en ninguna bandeja:
-- pasa a cobro y se queda en el histórico. La vista lo dice con
-- `etapa`, y las pantallas leen eso — no vuelven a decidir por su
-- cuenta qué es una notificación.
--
-- ---------------------------------------------------------------------
-- QUIÉN ES QUIÉN
-- ---------------------------------------------------------------------
-- No se crea ningún rol. Desde «roles-supervisor-borrable», quien
-- decide es QUIEN TIENE «EDITAR» EN LA PANTALLA de esa decisión:
--
--   EASY  → /roturas/en-sitio/visto-bueno   (la de siempre, que CAMBIA
--           de dueño: antes era de ABI)
--   ABI   → /roturas/en-sitio/desacuerdos   (nueva)
--
-- EL CAMBIO DE DUEÑO SE HACE AQUÍ Y UNA SOLA VEZ, para que nadie gane
-- ni pierda una decisión en silencio: ver la sección 7.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. LA RESPUESTA DE EASY
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'rotura_ol') then
    create type rotura_ol as enum ('acepta', 'rechaza');
  end if;
end $$;

alter table public.roturas
  add column if not exists ol_respuesta rotura_ol,
  add column if not exists ol_por  uuid references public.perfiles(id) on delete set null,
  add column if not exists ol_en   timestamptz,
  add column if not exists ol_nota text;

/* UNA RESPUESTA SIN QUIÉN NI CUÁNDO NO SIRVE PARA CONCILIAR: la
   pregunta del acta es «¿quién aceptó esto y qué día?». */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roturas_ol_con_firma') then
    alter table public.roturas add constraint roturas_ol_con_firma
      check (ol_respuesta is null or (ol_en is not null));
  end if;
  /* Y UN RECHAZO SIN MOTIVO NO ES UN RECHAZO. */
  if not exists (select 1 from pg_constraint where conname = 'roturas_rechazo_con_motivo') then
    alter table public.roturas add constraint roturas_rechazo_con_motivo
      check (ol_respuesta is distinct from 'rechaza' or btrim(coalesce(ol_nota, '')) <> '');
  end if;
end $$;

create index if not exists roturas_ol_pendiente_idx
  on public.roturas (reportada_en desc)
  where ol_respuesta is null and estado = 'esperando';

create index if not exists roturas_desacuerdo_idx
  on public.roturas (ol_en desc)
  where ol_respuesta = 'rechaza' and estado = 'esperando';

-- ---------------------------------------------------------------------
-- 2. LA EVIDENCIA DEL DESCARGO
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'rotura_foto_papel') then
    create type rotura_foto_papel as enum ('rotura', 'descargo');
  end if;
end $$;

alter table public.roturas_fotos
  add column if not exists papel rotura_foto_papel not null default 'rotura';

-- ---------------------------------------------------------------------
-- 3. QUIÉN PUEDE QUÉ
-- ---------------------------------------------------------------------
create or replace function public.rotura_puede(p_papel text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_papel in ('visto_bueno', 'desacuerdos', 'supervisora', 'verificador', 'validador')
     and public.mi_nivel_pantalla(case p_papel
    when 'visto_bueno'  then '/roturas/en-sitio/visto-bueno'
    when 'desacuerdos'  then '/roturas/en-sitio/desacuerdos'
    when 'supervisora'  then '/roturas/salida'
    when 'verificador'  then '/roturas/salida/verificacion'
    when 'validador'    then '/roturas/salida/validacion'
  end) = 'editar'
$$;

-- ---------------------------------------------------------------------
-- 4. EL VISTO BUENO — AHORA ES DE EASY
-- ---------------------------------------------------------------------
-- CAMBIA EL SIGNIFICADO DEL SEGUNDO ARGUMENTO, así que se tira la
-- función y se hace de nuevo: en PostgreSQL no se puede renombrar un
-- parámetro con `create or replace`. Dejarlo llamándose `p_cuenta`
-- cuando ahora quiere decir «estoy de acuerdo» es cómo alguien lo lee
-- mal dentro de seis meses.
drop function if exists public.rotura_visto_bueno(uuid, boolean, text);

create or replace function public.rotura_visto_bueno(
  p_id uuid,
  p_de_acuerdo boolean,
  p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.roturas%rowtype;
  v_exige boolean;
  v_tiene boolean;
begin
  if not public.rotura_puede('visto_bueno') then
    raise exception 'El visto bueno de las roturas es del operador logístico';
  end if;

  select * into v from public.roturas r where r.id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if v.estado = 'anulada' then raise exception 'Esa rotura está anulada'; end if;
  if v.ol_respuesta is not null then
    raise exception 'Esa rotura ya se contestó: dijo «%»',
      case when v.ol_respuesta = 'acepta' then 'de acuerdo' else 'en desacuerdo' end;
  end if;
  if v.estado <> 'esperando' then raise exception 'Esa rotura ya está decidida'; end if;

  if p_de_acuerdo then
    /* LA EVIDENCIA DE LA ROTURA. Es la de siempre, por causa: si la
       causa la exige y no está, la rotura no se puede cobrar con una
       foto que nadie subió. */
    select c.exige_foto into v_exige from public.roturas_causas c where c.clave = v.causa;
    select exists (select 1 from public.roturas_fotos f
                    where f.rotura_id = p_id and f.papel = 'rotura') into v_tiene;
    if coalesce(v_exige, false) and not v_tiene then
      raise exception
        'Esta causa exige foto de la rotura y no la tiene: aceptarla así deja un cobro sin con qué sostenerlo';
    end if;

    /* DE ACUERDO → COBRO, Y ABI NI SE ENTERA. No pasa por ninguna
       bandeja: «no llega notificación, llega a la data». */
    update public.roturas
       set ol_respuesta = 'acepta', ol_por = auth.uid(), ol_en = now(),
           ol_nota = nullif(btrim(coalesce(p_nota, '')), ''),
           estado = 'cuenta',
           decidida_por = auth.uid(), decidida_en = now()
     where id = p_id;
  else
    if btrim(coalesce(p_nota, '')) = '' then
      raise exception 'Si no está de acuerdo, hay que decir por qué: ABI va a resolver con eso';
    end if;
    /* «Y EN TODO SE REQUIERE EVIDENCIA». Sin foto del descargo, ABI
       resolvería un pleito donde una parte trajo pruebas y la otra
       una opinión. Aceptar no la exige —quien acepta no está probando
       nada— y cobrarle el trámite a quien está de acuerdo es lo que
       enseña a rechazar por costumbre. */
    select exists (select 1 from public.roturas_fotos f
                    where f.rotura_id = p_id and f.papel = 'descargo') into v_tiene;
    if not v_tiene then
      raise exception 'Falta la evidencia del descargo: sin foto, el desacuerdo no se puede sostener';
    end if;

    /* EN DESACUERDO → SIGUE EN 'esperando'. Todavía no está decidida;
       lo que cambia es que ahora la mira ABI. */
    update public.roturas
       set ol_respuesta = 'rechaza', ol_por = auth.uid(), ol_en = now(),
           ol_nota = btrim(p_nota)
     where id = p_id;
  end if;
end $$;
grant execute on function public.rotura_visto_bueno(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. ABI RESUELVE — Y ES LA ÚLTIMA PALABRA
-- ---------------------------------------------------------------------
create or replace function public.rotura_resolver(
  p_id uuid,
  p_cuenta boolean,
  p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.roturas%rowtype;
begin
  if not public.rotura_puede('desacuerdos') then
    raise exception 'Resolver un desacuerdo es de ABI';
  end if;

  select * into v from public.roturas r where r.id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if v.estado = 'anulada' then raise exception 'Esa rotura está anulada'; end if;

  /* ABI SOLO TOCA LO QUE ALGUIEN OBJETÓ. Es la mitad de la razón de
     invertir la cadena: si ABI pudiera resolver cualquier rotura,
     volvería a tener que mirar las cien del mes y la conciliación se
     quedaría otra vez en una lista que nadie objetó a tiempo. */
  if v.ol_respuesta is distinct from 'rechaza' then
    raise exception
      'Esa rotura no está en desacuerdo: ABI resuelve lo que el operador logístico objetó, no lo demás';
  end if;
  if v.estado <> 'esperando' then raise exception 'Ese desacuerdo ya se resolvió'; end if;

  /* «EN TODO SE REQUIERE EVIDENCIA» — y del lado de ABI la evidencia
     es el argumento: por qué se sostiene o por qué se retira. Un
     desacuerdo que se cierra sin una línea es el que se vuelve a
     discutir el mes entrante. */
  if btrim(coalesce(p_nota, '')) = '' then
    raise exception 'Hay que decir por qué: es lo que queda en el acta del mes';
  end if;

  update public.roturas
     set estado = case when p_cuenta then 'cuenta'::rotura_estado
                       else 'no_cuenta'::rotura_estado end,
         nota_decision = btrim(p_nota),
         decidida_por = auth.uid(), decidida_en = now()
   where id = p_id;
end $$;
grant execute on function public.rotura_resolver(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5b. CORREGIR EL HISTÓRICO: ANULAR Y BORRAR
-- ---------------------------------------------------------------------
-- «La tabla de todos los registros con sus estados, para borrar o
--  anular si eres súper admin.»
--
-- `rotura_anular` PREGUNTABA `mi_rol() <> 'admin'`. Eso compara contra
-- un NOMBRE, y los roles de este proyecto son datos: el día que se cree
-- un segundo rol que mande —o que alguien renombre el de siempre— la
-- comprobación deja de proteger lo que cree proteger, Y EN LA DIRECCIÓN
-- PELIGROSA. `manda()` lee la casilla del rol, que es lo que de verdad
-- quiere decir «súper admin». Es el mismo arreglo que ya se le hizo a
-- `salida_anular`.
create or replace function public.rotura_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado rotura_estado;
begin
  if not public.manda() then
    raise exception 'Anular una rotura es del administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula';
  end if;
  select estado into v_estado from public.roturas where id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if v_estado = 'anulada' then raise exception 'Esa rotura ya está anulada'; end if;

  update public.roturas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulada_por = auth.uid(), anulada_en = now()
   where id = p_id;
end $$;
grant execute on function public.rotura_anular(uuid, text) to authenticated;

-- BORRAR ES PARA EL ERROR DE DEDO DEL MISMO DÍA: se registró dos veces,
-- o se registró en la pantalla equivocada. Y SOLO MIENTRAS NADIE LA
-- HAYA DECIDIDO: una rotura que ya pasó por el visto bueno entró en la
-- conciliación de alguien —se cobró o se descartó—, y borrarla cambia
-- un mes que ya se cerró sin dejar nada que mirar cuando pregunten por
-- qué. Esa se ANULA: la fila se queda, con el motivo y con quién.
-- «El admin: yo puedo editar, eliminar, anular, borrar.»
--
-- QUIEN MANDA BORRA CUALQUIERA, Y LO QUE CAMBIA ES LO QUE CUESTA.
-- La primera versión frenaba en seco todo lo ya decidido —«se anula, no
-- se borra»—. Defendía algo real: borrar no deja rastro, y una rotura
-- decidida puede estar dentro de un informe que alguien ya leyó. Pero
-- lo defendía convirtiendo una decisión del dueño de los datos en un
-- error de la base, y eso no es proteger: es que la pantalla conteste
-- «no» sin ofrecer la salida buena.
--
-- Ahora: borrar lo que NADIE ha decidido no pide nada más —es el error
-- de dedo del mismo día—; borrar algo YA DECIDIDO exige un motivo
-- escrito, y el motivo NO queda en la fila (la fila se va): queda en
-- `roturas_borradas`, que es el único sitio donde después se puede ver
-- que esa rotura existió.
--
-- ESO SÍ LO DIGO: anular sigue siendo lo correcto en casi todos los
-- casos. Anular deja la fila, el motivo y quién; esto no deja nada más
-- que un renglón en una bitácora que nadie mira por costumbre.

create table if not exists public.roturas_borradas (
  id          uuid primary key,
  codigo      text,
  -- La fila entera tal como estaba, para poder contestar «¿qué decía?».
  fila        jsonb not null,
  motivo      text not null,
  borrada_por uuid references auth.users(id),
  borrada_en  timestamptz not null default now()
);
alter table public.roturas_borradas enable row level security;
-- SOLO LA LEE QUIEN MANDA. Es el registro de lo que se hizo
-- desaparecer; si lo pudiera leer cualquiera, sería una segunda copia
-- de las roturas borradas al alcance de todos.
drop policy if exists roturas_borradas_ver on public.roturas_borradas;
create policy roturas_borradas_ver on public.roturas_borradas
  for select to authenticated using (public.manda());
-- EL GRANT Y LA POLÍTICA SON DOS COSAS Y HACEN FALTA LAS DOS. Sin el
-- grant, Postgres contesta «permission denied for table» —un error de
-- permiso de tabla, no de fila— y eso NO es lo mismo que la política
-- negando: la política devuelve cero filas, que es lo que se quiere.
-- Solo select: escribir aquí lo hace `rotura_borrar`, que es security
-- definer; nadie más tiene por qué tocar el registro de lo borrado.
grant select on public.roturas_borradas to authenticated;

-- El parámetro es nuevo, así que la firma cambia y hay que soltar la
-- vieja: `create or replace` no puede cambiar la lista de argumentos.
drop function if exists public.rotura_borrar(uuid);

create or replace function public.rotura_borrar(p_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.roturas%rowtype;
  v_fila jsonb;
begin
  if not public.manda() then
    raise exception 'Borrar una rotura es del administrador';
  end if;
  select * into v from public.roturas where id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;

  /* LO YA DECIDIDO EXIGE MOTIVO. Lo que nadie ha tocado, no: pedirle
     una justificación escrita a quien está deshaciendo el registro
     duplicado que acaba de hacer es el trámite que enseña a escribir
     «error» en todos los campos. */
  if (v.estado <> 'esperando' or v.ol_respuesta is not null)
     and btrim(coalesce(p_motivo, '')) = '' then
    raise exception
      'Esa rotura ya se decidió (%): para borrarla hay que decir por qué, y queda en el registro de borradas. Si solo quieres que deje de contar, anúlala —eso deja la fila y el motivo', v.estado;
  end if;

  select to_jsonb(v) into v_fila;
  insert into public.roturas_borradas (id, codigo, fila, motivo, borrada_por)
  values (v.id, v.codigo, v_fila,
          coalesce(nullif(btrim(coalesce(p_motivo, '')), ''),
                   'Sin decidir: se borró sin motivo escrito'),
          auth.uid())
  on conflict (id) do nothing;

  /* Las fotos se van con ella por la llave foránea; el archivo del
     bucket lo limpia la pantalla. */
  delete from public.roturas where id = p_id;
end $$;
grant execute on function public.rotura_borrar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. LO QUE LEE LA PANTALLA
-- ---------------------------------------------------------------------
-- Las columnas nuevas van AL FINAL: `create or replace view` no deja
-- meter una en la mitad, y no se puede leer la vista dentro de su
-- propio `create or replace` —Postgres lo rechaza por referencia
-- circular—, así que se envuelve su definición como subconsulta en vez
-- de copiar aquí una de cuarenta columnas que quedaría vieja a la
-- primera migración que la toque.
do $$
declare v_def text;
begin
  if to_regclass('public.v_roturas') is null then
    raise notice 'v_roturas no existe todavía: se salta.';
    return;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'v_roturas'
                and column_name = 'etapa') then
    raise notice 'La vista ya trae la etapa de la cadena.';
    return;
  end if;

  v_def := rtrim(btrim(pg_get_viewdef('public.v_roturas'::regclass, true)), ';');
  execute format($f$
    create or replace view public.v_roturas as
      select x.*,
             r.ol_respuesta::text as ol_respuesta,
             r.ol_por, r.ol_en, r.ol_nota,
             /* LA ETAPA, CALCULADA EN UN SOLO SITIO. Tres pantallas
                preguntándose «¿esta a quién le toca?» por su cuenta
                son tres sitios donde se puede contestar distinto. */
             case
               when r.estado = 'anulada' then 'anulada'
               when r.estado = 'esperando' and r.ol_respuesta is null then 'espera_ol'
               when r.estado = 'esperando' and r.ol_respuesta = 'rechaza' then 'desacuerdo'
               when r.estado = 'cuenta' then 'cobro'
               else 'no_cuenta'
             end as etapa,
             /* Y POR QUÉ CAMINO LLEGÓ AL COBRO. «De acuerdo» y
                «ABI lo sostuvo» los dos se cobran, y aun así son dos
                cosas distintas: en uno las partes estuvieron de
                acuerdo y en el otro una le ganó a la otra. El acta del
                mes tiene que poder decir cuál fue cuál.

                'antes' son las que se decidieron con la cadena vieja,
                cuando ABI decidía de entrada. NO SE REESCRIBEN: decir
                hoy que aquellas fueron «por acuerdo» sería inventar un
                acuerdo que nadie dio. */
             case
               when r.estado in ('esperando', 'anulada') then null
               when r.ol_respuesta = 'acepta'  then 'acuerdo'
               when r.ol_respuesta = 'rechaza' then 'abi'
               else 'antes'
             end as cobro_por,
             (select count(*) from public.roturas_fotos f
               where f.rotura_id = r.id and f.papel = 'descargo') as fotos_descargo
        from ( %s ) x
        join public.roturas r on r.id = x.id
  $f$, v_def);
  raise notice 'La vista ya dice en qué etapa va cada rotura y por qué camino se cobró.';
end $$;

grant select on public.v_roturas to authenticated;

-- ---------------------------------------------------------------------
-- 7. EL CAMBIO DE DUEÑO DEL VISTO BUENO, UNA SOLA VEZ
-- ---------------------------------------------------------------------
-- La pantalla /roturas/en-sitio/visto-bueno CAMBIA DE MANOS: era de ABI
-- y pasa a ser de Easy. Hacerlo callando dejaría a ABI decidiendo con
-- una función que ahora quiere decir otra cosa, y a Easy sin poder
-- entrar a la suya.
--
-- ASÍ QUE SE HACE AQUÍ Y SE IMPRIME: quien tenía «editar» en el visto
-- bueno lo conserva —nadie se queda por fuera de un día para otro— y
-- ADEMÁS se le da «editar» en /desacuerdos a quien manda, que es quien
-- de verdad tiene la última palabra. El reparto fino se ajusta en
-- Roles, que es donde vive.
do $$
declare v_n int;
begin
  if to_regclass('public.rol_permisos') is null then
    raise notice 'rol_permisos no existe todavía: los permisos se asignan después.';
    return;
  end if;

  /* ABI —y cualquier rol que mande— resuelve los desacuerdos. */
  insert into public.rol_permisos (rol, seccion, nivel)
    select r.clave, '/roturas/en-sitio/desacuerdos', 'editar'
      from public.roles r
     where r.manda
       and not exists (select 1 from public.rol_permisos x
                        where x.rol = r.clave and x.seccion = '/roturas/en-sitio/desacuerdos');
  get diagnostics v_n = row_count;
  raise notice 'Desacuerdos: % rol(es) que mandan quedaron con editar.', v_n;

  /* Y quien ya miraba el visto bueno lo sigue mirando: el reparto
     entre Easy y ABI se afina en Roles, no aquí a ciegas. */
  insert into public.rol_permisos (rol, seccion, nivel)
    select rp.rol, '/roturas/en-sitio/desacuerdos', 'ver'
      from public.rol_permisos rp
     where rp.seccion = '/roturas/en-sitio/visto-bueno'
       and rp.nivel in ('ver', 'editar')
       and not exists (select 1 from public.rol_permisos x
                        where x.rol = rp.rol and x.seccion = '/roturas/en-sitio/desacuerdos');
end $$;

do $$
declare v_esp int; v_des int;
begin
  select count(*) into v_esp from public.roturas
   where estado = 'esperando' and ol_respuesta is null;
  select count(*) into v_des from public.roturas
   where estado = 'esperando' and ol_respuesta = 'rechaza';
  raise notice '--------------------------------------------------------';
  raise notice 'LA CADENA QUEDO AL DERECHO:';
  raise notice '  registro -> EASY dice si esta de acuerdo';
  raise notice '     de acuerdo    -> cobro, y ABI ni se entera';
  raise notice '     en desacuerdo -> ABI resuelve, y es la ultima';
  raise notice 'EVIDENCIA EN LOS DOS LADOS: foto de la rotura al aceptar';
  raise notice '(si la causa la exige) y foto del descargo al rechazar.';
  raise notice 'Hoy: % esperando a Easy, % en desacuerdo esperando a ABI.', v_esp, v_des;
  raise notice 'FALTA en Admin -> Roles: dejar /en-sitio/visto-bueno en';
  raise notice 'EDITAR solo para el rol de EASY, y /en-sitio/desacuerdos';
  raise notice 'en EDITAR solo para ABI.';
  raise notice '--------------------------------------------------------';
end $$;

commit;
