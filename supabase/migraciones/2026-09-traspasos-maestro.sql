-- =====================================================================
-- TRASPASOS · EL MAESTRO SE DEFIENDE SOLO
--
-- Requiere: supabase/modulos/traspasos.sql
--           supabase/migraciones/2026-09-traspasos-plan-rejilla.sql
--
-- QUÉ PROBLEMA RESUELVE.
--
-- El registro deja escribir un sitio a mano cuando todavía no está en
-- el maestro. Eso está bien —no se traba a nadie— pero deja un rastro:
-- viajes con `origen_texto` y sin `origen`. Esos viajes NO cuentan en
-- ningún informe por punto. Un mes después "Ag01" tiene 142 viajes,
-- "AG-01" tiene 4 sueltos, y la suma por punto no cuadra con el total.
--
-- Esta migración le da al maestro las tres cosas que le faltaban para
-- cerrar esa puerta:
--
--   1. AGREGAR ADOPTA.  Cuando se agrega un punto que ya se venía
--      escribiendo a mano, los viajes viejos que lo nombraban pasan a
--      apuntar al punto nuevo. Antes se agregaba el punto y los viajes
--      viejos quedaban igual de sueltos: el contador bajaba y el
--      informe seguía partido.
--
--   2. UNIR.  Un texto suelto que se parece a un punto que ya existe
--      —"Planta Bquilla" contra "Planta Barranquilla"— se ofrece para
--      unir. La pantalla lo propone; la persona decide. Unir NO borra
--      nada: le pone `origen` al viaje y le quita el texto.
--
--   3. ORDEN.  `orden` existía y nadie lo escribía. Ahora la pantalla
--      lo escribe al arrastrar.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, dicho a propósito: no une dos puntos
-- del maestro entre sí. Eso sí sería destructivo —habría que borrar una
-- fila referenciada por viajes— y en la práctica no es el caso que se
-- da: los duplicados nacen como texto suelto, no como dos puntos
-- creados a mano con el mismo nombre. Si algún día se necesita, se
-- escribe aparte y con su propia confirmación.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EL SUBTÍTULO DEL PUNTO
--
-- "Bodega propia", "Planta", "Zona interna". No es decoración: en una
-- lista de veinte puntos es lo que distingue "CD Galapa" de "Galapa
-- (planta)" sin tener que meterlo dentro del nombre —que es lo que
-- termina pasando cuando no hay dónde escribirlo.
-- ---------------------------------------------------------------------
alter table public.traspasos_puntos
  add column if not exists descripcion text;


-- ---------------------------------------------------------------------
-- 2. NORMALIZAR: LA REGLA DE CUÁNDO DOS TEXTOS SON EL MISMO SITIO
--
-- Sin acentos, sin espacios ni guiones, en mayúsculas. Quien escribe
-- "ag 01" se refiere a AG01, y obligarlo a escribirlo igualito sería
-- inventar trabajo.
--
-- `translate` va carácter por carácter (no byte por byte), así que la
-- tabla de acentos funciona sin depender de la extensión `unaccent`,
-- que no está garantizada en todas las instalaciones.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_norm(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select upper(regexp_replace(
    translate(coalesce(p_texto, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'),
    '[^A-Za-z0-9]', '', 'g'))
$$;


-- ---------------------------------------------------------------------
-- 3. PARECIDO: TRIGRAMAS, A MANO
--
-- Cuánto se parecen dos textos, de 0 a 1. Se parte cada uno en pedazos
-- de tres letras y se mide cuántos comparten (Jaccard).
--
-- SE ESCRIBE A MANO Y NO CON pg_trgm a propósito: `similarity()` viene
-- de una extensión que hay que habilitar, y una función de detección
-- que existe en la base de pruebas pero no en la de producción es peor
-- que no tenerla. Son doce líneas y no dependen de nada.
--
--   "Planta Bquilla"  vs "Planta Barranquilla" ..... 0.57
--   "CD Galapa"       vs "CD Turbaco" ............... 0.12
-- ---------------------------------------------------------------------
create or replace function public.traspaso_parecido(p_a text, p_b text)
returns numeric
language sql
immutable
parallel safe
set search_path = public
as $$
  with
  a as (select '  ' || public.traspaso_norm(p_a) || ' ' as t),
  b as (select '  ' || public.traspaso_norm(p_b) || ' ' as t),
  ga as (select distinct substr(a.t, i, 3) as g
           from a, generate_series(1, greatest(length(a.t) - 2, 0)) i),
  gb as (select distinct substr(b.t, i, 3) as g
           from b, generate_series(1, greatest(length(b.t) - 2, 0)) i),
  u as (select count(*)::numeric n from (select g from ga union      select g from gb) z),
  x as (select count(*)::numeric n from (select g from ga intersect  select g from gb) z)
  select case when u.n = 0 then 0 else round(x.n / u.n, 3) end from u, x
$$;


-- ---------------------------------------------------------------------
-- 4. ¿EL MISMO SITIO?
--
-- Parecido alto, CON UNA EXCEPCIÓN QUE IMPORTA: si los dos textos son
-- iguales salvo por el número, son sitios distintos. "Muelle 2" y
-- "Muelle 3" se parecen en 0.60 y no son el mismo muelle. Unirlos
-- borraría una distinción real, y como el informe por punto los sumaría
-- nadie se daría cuenta.
--
-- EL ORDEN DE LAS PREGUNTAS ES LO QUE LA HACE RÁPIDA. La vista compara
-- cada texto suelto contra cada punto del maestro: con 40 textos y 60
-- puntos son 2.400 comparaciones, y calcular trigramas 2.400 veces
-- costaba dos segundos y medio. Las primeras preguntas son
-- comparaciones de texto sueltas —microsegundos— y descartan casi
-- todas; los trigramas solo se calculan para las que de verdad podrían
-- ser el mismo sitio.
--
-- La puerta barata: dos escrituras del mismo sitio o empiezan igual
-- ("Planta B…" contra "Planta B…") o una está metida dentro de la otra
-- ("Ag01" dentro de "Ag01 Norte"). Si no pasa ninguna de las dos, no
-- vale la pena mirarlas más de cerca.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_mismo_sitio(p_a text, p_b text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare a text; b text;
begin
  a := public.traspaso_norm(p_a);
  b := public.traspaso_norm(p_b);

  if a = '' or b = '' then return false; end if;
  if a = b then return true; end if;

  if regexp_replace(a, '[0-9]', '', 'g') = regexp_replace(b, '[0-9]', '', 'g')
     and regexp_replace(a, '[^0-9]', '', 'g') <> regexp_replace(b, '[^0-9]', '', 'g') then
    return false;
  end if;

  if left(a, 2) <> left(b, 2)
     and position(a in b) = 0 and position(b in a) = 0 then
    return false;
  end if;

  return public.traspaso_parecido(a, b) >= 0.45;
end $$;


-- ---------------------------------------------------------------------
-- 5. EL PUNTO DEL MAESTRO QUE CORRESPONDE A UN TEXTO
--
-- Se reemplaza el cuerpo viejo por dos razones: comparaba SOLO contra
-- la clave (si alguien renombra el punto, el nombre nuevo dejaba de
-- reconocerse) y no quitaba acentos (quien escribía "Bogotá" no caía
-- en BOGOTA). Misma firma, así que nada más cambia.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_punto(p_texto text)
returns text
language sql
stable
set search_path = public
as $$
  select p.clave from public.traspasos_puntos p
   where p.activo
     and (public.traspaso_norm(p.clave)  = public.traspaso_norm(p_texto)
       or public.traspaso_norm(p.nombre) = public.traspaso_norm(p_texto))
   order by (public.traspaso_norm(p.clave) = public.traspaso_norm(p_texto)) desc
   limit 1
$$;


-- ---------------------------------------------------------------------
-- 6. CUÁNTO SE USA CADA COSA DEL MAESTRO
--
-- Una vista y no tres consultas que bajan la tabla entera. El Maestro
-- solo necesita el número por clave; traer 50.000 filas al navegador
-- para contarlas ahí es el mismo error que ya se corrigió en Acciones
-- y en Roturas.
--
-- Un punto suma sus viajes como origen Y como destino: la pregunta que
-- contesta esta cifra es "¿se puede borrar?", y un punto que aparece
-- como destino está igual de usado.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_uso as
select clase, clave, sum(viajes)::int as viajes, max(ultima) as ultima
from (
  select 'tipo'::text as clase, v.tipo as clave, count(*)::bigint as viajes,
         max(v.fecha) as ultima
    from public.traspasos_viajes v
   where v.tipo is not null and v.estado = 'registrado'
   group by v.tipo
  union all
  select 'punto', v.origen, count(*), max(v.fecha)
    from public.traspasos_viajes v
   where v.origen is not null and v.estado = 'registrado'
   group by v.origen
  union all
  select 'punto', v.destino, count(*), max(v.fecha)
    from public.traspasos_viajes v
   where v.destino is not null and v.estado = 'registrado'
   group by v.destino
) z
group by clase, clave;

grant select on public.v_traspasos_uso to authenticated;


-- ---------------------------------------------------------------------
-- 7. LOS SITIOS ESCRITOS A MANO, CON SU POSIBLE DUEÑO
--
-- La vista vieja decía qué se escribió y cuántas veces. Le faltaba la
-- mitad de la respuesta: si eso que se escribió es un sitio NUEVO
-- (hay que agregarlo) o la MISMA DE SIEMPRE mal escrita (hay que
-- unirla). Son dos botones distintos y hasta ahora la pantalla no
-- podía saber cuál mostrar.
--
-- `veces_semana` alimenta la cifra de arriba: "escritos a mano 19
-- veces esta semana" pesa mucho más que "19 veces desde siempre".
-- ---------------------------------------------------------------------
/* Los textos sueltos son pocos entre muchos viajes. Sin estos índices
   las dos sumas de arriba son dos lecturas completas de la tabla; con
   ellos se leen solo las filas que tienen algo escrito a mano. */
create index if not exists traspasos_viajes_origen_texto_idx
  on public.traspasos_viajes (origen_texto, fecha)
  where origen_texto is not null;
create index if not exists traspasos_viajes_destino_texto_idx
  on public.traspasos_viajes (destino_texto, fecha)
  where destino_texto is not null;

drop view if exists public.v_traspasos_puntos_faltantes;

create view public.v_traspasos_puntos_faltantes as
with sueltos as (
  select texto,
         count(*)::int                                                  as veces,
         count(*) filter (where fecha >= current_date - 7)::int          as veces_semana,
         max(fecha)                                                     as ultima
  from (
    select origen_texto as texto, fecha from public.traspasos_viajes
     where origen_texto is not null and estado = 'registrado'
    union all
    select destino_texto, fecha from public.traspasos_viajes
     where destino_texto is not null and estado = 'registrado'
  ) x
  group by texto
),
/* UNA SOLA LLAMADA A LA REGLA POR PAREJA. Ordenar por el parecido
   volvería a calcularlo para cada fila que ya pasó; entre dos puntos
   que los dos dan "el mismo sitio" gana el que más viajes tiene, que
   además es el que la persona reconoce como el bueno. */
pareja as (
  select s.texto,
         p.clave                     as parecido,
         p.nombre                    as parecido_nombre,
         coalesce(u.viajes, 0)       as parecido_viajes,
         row_number() over (
           partition by s.texto
           order by coalesce(u.viajes, 0) desc, p.clave) as n
    from sueltos s
    join public.traspasos_puntos p
      on public.traspaso_mismo_sitio(s.texto, p.nombre)
    left join public.v_traspasos_uso u on u.clase = 'punto' and u.clave = p.clave
)
select s.texto, s.veces, s.veces_semana, s.ultima,
       j.parecido, j.parecido_nombre, j.parecido_viajes
  from sueltos s
  left join pareja j on j.texto = s.texto and j.n = 1;

grant select on public.v_traspasos_puntos_faltantes to authenticated;


-- ---------------------------------------------------------------------
-- 8. AGREGAR UN PUNTO — Y ADOPTAR LO QUE YA SE ESCRIBIÓ CON ESE NOMBRE
--
-- Este es el cambio que hace que el botón "Agregar" sirva de verdad.
-- Antes insertaba la fila y ya: los nueve viajes que decían "Bodega de
-- averías" seguían sueltos para siempre, y el informe por punto seguía
-- sin contarlos.
--
-- Devuelve cuántos viajes adoptó para poder decírselo a quien apretó
-- el botón. "Bodega de averías quedó en el maestro y se llevó 9 viajes
-- que estaban sueltos" es una frase que se entiende; "OK" no.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_agregar_punto(text, text, boolean);

create function public.traspaso_agregar_punto(
  p_nombre      text,
  p_descripcion text    default null,
  p_externo     boolean default false
)
returns table (clave text, adoptados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text;
  v_o integer := 0;
  v_d integer := 0;
  v_existe public.traspasos_puntos%rowtype;
begin
  if not public.es_editor() then
    raise exception 'Agregar un punto requiere rol de supervisor o administrador';
  end if;

  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El punto necesita un nombre';
  end if;

  v_clave := left(public.traspaso_norm(p_nombre), 40);
  if v_clave = '' then
    raise exception 'Ese nombre no deja ninguna letra ni número con qué armar la clave';
  end if;

  select * into v_existe from public.traspasos_puntos where traspasos_puntos.clave = v_clave;

  if found and v_existe.activo then
    raise exception 'Ya existe un punto con ese nombre: %', v_existe.nombre;
  elsif found then
    /* Estaba desactivado. Por eso se volvió a escribir a mano: el
       registro solo ofrece los activos. Reactivarlo es exactamente lo
       que la persona está pidiendo. */
    update public.traspasos_puntos p
       set activo = true,
           descripcion = coalesce(nullif(btrim(coalesce(p_descripcion, '')), ''), p.descripcion)
     where p.clave = v_clave;
  else
    insert into public.traspasos_puntos (clave, nombre, descripcion, externo, orden)
    values (v_clave, btrim(p_nombre),
            nullif(btrim(coalesce(p_descripcion, '')), ''),
            coalesce(p_externo, false),
            (select coalesce(max(orden), 0) + 1 from public.traspasos_puntos));
  end if;

  update public.traspasos_viajes v
     set origen = v_clave, origen_texto = null
   where v.origen is null
     and v.origen_texto is not null
     and public.traspaso_norm(v.origen_texto) = public.traspaso_norm(p_nombre);
  get diagnostics v_o = row_count;

  update public.traspasos_viajes v
     set destino = v_clave, destino_texto = null
   where v.destino is null
     and v.destino_texto is not null
     and public.traspaso_norm(v.destino_texto) = public.traspaso_norm(p_nombre);
  get diagnostics v_d = row_count;

  return query select v_clave, (v_o + v_d);
end $$;

revoke all on function public.traspaso_agregar_punto(text, text, boolean) from public;
grant execute on function public.traspaso_agregar_punto(text, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 9. UNIR UN TEXTO SUELTO EN UN PUNTO QUE YA EXISTE
--
-- NO BORRA NADA. Le pone `origen` (o `destino`) al viaje y le quita el
-- texto. El viaje sigue siendo el mismo viaje; lo único que cambia es
-- que ahora cuenta en el informe por punto.
--
-- No se comprueba aquí que los textos se parezcan: la pantalla es la
-- que propone la pareja y una persona la aprueba. Si alguien decide
-- que "Muelle 2" va en "Patio norte" porque así es en su centro, la
-- base no tiene por qué saberlo mejor.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_unir_punto(text, text);

create function public.traspaso_unir_punto(p_texto text, p_clave text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_o integer := 0; v_d integer := 0;
begin
  if not public.es_editor() then
    raise exception 'Unir puntos requiere rol de supervisor o administrador';
  end if;

  if not exists (select 1 from public.traspasos_puntos where clave = p_clave) then
    raise exception 'No existe el punto %', p_clave;
  end if;

  if public.traspaso_norm(p_texto) = '' then
    raise exception 'Falta el texto que se va a unir';
  end if;

  update public.traspasos_viajes v
     set origen = p_clave, origen_texto = null
   where v.origen is null
     and v.origen_texto is not null
     and public.traspaso_norm(v.origen_texto) = public.traspaso_norm(p_texto);
  get diagnostics v_o = row_count;

  update public.traspasos_viajes v
     set destino = p_clave, destino_texto = null
   where v.destino is null
     and v.destino_texto is not null
     and public.traspaso_norm(v.destino_texto) = public.traspaso_norm(p_texto);
  get diagnostics v_d = row_count;

  return v_o + v_d;
end $$;

revoke all on function public.traspaso_unir_punto(text, text) from public;
grant execute on function public.traspaso_unir_punto(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 10. EL ORDEN DE LAS LISTAS
--
-- `orden` existía desde el principio y nadie lo escribía nunca, así que
-- las listas salían en el orden en que se habían creado. Una sola
-- llamada con las claves ya ordenadas y no una por fila: arrastrar
-- cambia la posición de varias a la vez, y mandarlas de a una dejaría
-- la lista a medio guardar si se corta a la mitad.
--
-- SE EXIGE LA LISTA COMPLETA. Renumerar solo una parte deja dos filas
-- con el mismo `orden` y la lista sale en un orden que ya no es el que
-- nadie escogió — y sin error, que es la peor forma de fallar. Con la
-- lista completa el resultado es siempre 1..n sin repetir.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_ordenar_puntos(text[]);
drop function if exists public.traspaso_ordenar_tipos(text[]);

create function public.traspaso_ordenar_puntos(p_claves text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer; v_total integer;
begin
  if not public.es_editor() then
    raise exception 'Reordenar el maestro requiere rol de supervisor o administrador';
  end if;

  select count(*) into v_total from public.traspasos_puntos;
  if coalesce(array_length(p_claves, 1), 0) <> v_total
     or exists (select 1 from public.traspasos_puntos p
                 where p.clave <> all (p_claves)) then
    raise exception 'Para reordenar hay que mandar los % puntos, no una parte', v_total;
  end if;

  update public.traspasos_puntos p
     set orden = x.n
    from (select c, ord::smallint as n
            from unnest(p_claves) with ordinality as t(c, ord)) x
   where p.clave = x.c;
  get diagnostics v = row_count;
  return v;
end $$;

create function public.traspaso_ordenar_tipos(p_claves text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer; v_total integer;
begin
  if not public.es_editor() then
    raise exception 'Reordenar el maestro requiere rol de supervisor o administrador';
  end if;

  select count(*) into v_total from public.traspasos_tipos;
  if coalesce(array_length(p_claves, 1), 0) <> v_total
     or exists (select 1 from public.traspasos_tipos t
                 where t.clave <> all (p_claves)) then
    raise exception 'Para reordenar hay que mandar los % tipos, no una parte', v_total;
  end if;

  update public.traspasos_tipos t
     set orden = x.n
    from (select c, ord::smallint as n
            from unnest(p_claves) with ordinality as u(c, ord)) x
   where t.clave = x.c;
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function public.traspaso_ordenar_puntos(text[]) from public;
revoke all on function public.traspaso_ordenar_tipos(text[])  from public;
grant execute on function public.traspaso_ordenar_puntos(text[]) to authenticated;
grant execute on function public.traspaso_ordenar_tipos(text[])  to authenticated;


-- ---------------------------------------------------------------------
-- 11. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare
  v_falta text := '';
  v_sueltos int;
  v_dup int;
begin
  if to_regclass('public.v_traspasos_uso') is null then
    v_falta := v_falta || ' v_traspasos_uso';
  end if;
  if to_regclass('public.v_traspasos_puntos_faltantes') is null then
    v_falta := v_falta || ' v_traspasos_puntos_faltantes';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='traspasos_puntos'
                    and column_name='descripcion') then
    v_falta := v_falta || ' traspasos_puntos.descripcion';
  end if;

  if v_falta <> '' then
    raise exception 'FALTÓ:%', v_falta;
  end if;

  select count(*) into v_sueltos from public.v_traspasos_puntos_faltantes
   where parecido is null;
  select count(*) into v_dup from public.v_traspasos_puntos_faltantes
   where parecido is not null;

  raise notice 'Maestro de traspasos al día.';
  raise notice '  sitios escritos a mano sin agregar: %', v_sueltos;
  raise notice '  posibles duplicados detectados:     %', v_dup;
end $$;
