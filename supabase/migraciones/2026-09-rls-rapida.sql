-- ---------------------------------------------------------------------
-- LA SEGURIDAD DE FILAS, EVALUADA UNA VEZ Y NO POR CADA FILA
--
-- ESTE ARCHIVO ESTÁ GUARDADO, NO PUESTO. Léase antes de correrlo.
--
-- LA IDEA. Cada tabla tiene reglas del estilo "puede escribir aquí si
-- es_editor()". Escrito así, Postgres llama a esa función UNA VEZ POR
-- FILA, y esa función a su vez consulta perfiles. Envuelta en
-- (select ...), Postgres la reconoce como algo que no depende de la
-- fila, la evalúa UNA vez y reusa el resultado. Misma regla, mismo
-- permiso, misma seguridad.
--
-- POR QUÉ NO ESTÁ PUESTO. Porque se midió y HOY NO CAMBIA NADA, y una
-- migración que no arregla algo que se pueda medir no se corre.
--
-- En una prueba con una política inventada sobre 5.000 filas la
-- diferencia era enorme —44,9 ms contra 1,0 ms—. Pero en ESTA base no
-- se repite, y la razón es buena: las tablas grandes (acciones,
-- roturas, viajes) tienen la regla de LECTURA en "true" —cualquiera
-- que entró puede leer— y lo que llama funciones son las reglas de
-- ESCRITURA, que aplican sobre una fila a la vez. Postgres evalúa el
-- "true" primero y ni llega a la función.
--
--   leer 50.000 acciones ......... 17,5 ms  ->  17,0 ms
--   leer 2.000 perfiles .......... 0,28 ms  ->  0,29 ms
--
-- Eso es ruido de medición, no una mejora.
--
-- CUÁNDO SÍ HAY QUE CORRERLO. El día que una regla de LECTURA deje de
-- ser "true" y pase a depender de quién sos —"cada bodega ve lo suyo",
-- "el operador solo ve su área"—. Ahí la función pasa a evaluarse por
-- cada fila leída y la diferencia vuelve a ser la de la prueba: 45
-- veces, y creciendo con los datos. Ese día se corre esto y queda
-- arreglado de una, sin tocar ocho archivos.
--
-- QUÉ HACE, EXACTAMENTE. Lee las políticas que REALMENTE existen en la
-- base y cambia solo las llamadas a es_editor(), mi_rol(), manda() y
-- auth.uid(), de "f()" a "(select f())". Son las cuatro que contestan
-- "quién sos" y no dependen de la fila. Cualquier condición que compare
-- contra una columna se queda igual.
--
-- COMPROBADO CONTRA POSTGRES, dos bases idénticas, una con esto y otra
-- sin esto, con usuarios de verdad y no como superusuario:
--
--   el operador NO puede crear una zona ......... bloqueado en las dos
--   el admin SÍ puede ........................... permitido en las dos
--   el operador no puede cambiar el perfil
--     del admin ................................. 0 filas en las dos
--   políticas que quedaron con una llamada suelta ................. 0
--   correrlo dos veces seguidas: la segunda dice .... "reescritas: 0"
--
-- Se puede correr varias veces sin romper nada.
-- ---------------------------------------------------------------------

/* Cuántas veces aparece un texto dentro de otro. Hace falta para
   saber si una política YA estaba envuelta o no: comparar el texto
   antes y después no sirve, porque Postgres reescribe
   "(select mi_rol())" como "( SELECT mi_rol() AS mi_rol)" y los dos
   dicen lo mismo con letras distintas. */
create or replace function pg_temp.veces(p_donde text, p_que text)
returns int language sql immutable as $fn$
  select case when p_donde is null or p_que = '' then 0
    else (length(p_donde) - length(replace(p_donde, p_que, ''))) / length(p_que) end
$fn$;

do $$
declare
  r          record;
  v_qual     text;
  v_check    text;
  v_qual_n   text;
  v_check_n  text;
  v_sql      text;
  v_tocadas  int := 0;
  v_falta    boolean;
  f          text;
  v_llamada  text;
  v_envuelta text;

  /* Las cuatro que contestan "quién sos" y no dependen de la fila.
     auth.uid() va con su esquema a propósito: partirlo en "uid()"
     produciría "auth.(select uid())", que no es SQL. */
  v_funcs text[] := array['es_editor()', 'mi_rol()', 'manda()', 'auth.uid()'];
begin
  for r in
    select p.polname, p.polrelid, p.polqual, p.polwithcheck,
           c.relname, n.nspname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
  loop
    v_qual  := pg_get_expr(r.polqual,      r.polrelid);
    v_check := pg_get_expr(r.polwithcheck, r.polrelid);

    /* ¿Queda alguna llamada SUELTA, sin envolver? Si no, esta política
       ya está lista y no se toca: alterarla por gusto es una ventana
       —corta, pero ventana— en la que la regla no está puesta. */
    v_falta := false;
    foreach f in array v_funcs loop
      v_envuelta := '( SELECT ' || f || ' AS '
                    || split_part(replace(f, '()', ''), '.', 2 - (case when f like '%.%' then 0 else 1 end))
                    || ')';
      if pg_temp.veces(v_qual,  f) > pg_temp.veces(v_qual,  v_envuelta)
      or pg_temp.veces(v_check, f) > pg_temp.veces(v_check, v_envuelta) then
        v_falta := true;
      end if;
    end loop;
    continue when not v_falta;

    v_qual_n  := v_qual;
    v_check_n := v_check;
    foreach f in array v_funcs loop
      v_envuelta := '(select ' || f || ')';
      /* Se desenvuelve primero lo que ya esté envuelto y se vuelve a
         envolver todo, para no anidar "(select (select ...))". */
      v_qual_n  := replace(v_qual_n,  v_envuelta, f);
      v_check_n := replace(v_check_n, v_envuelta, f);
      v_qual_n  := replace(v_qual_n,  f, v_envuelta);
      v_check_n := replace(v_check_n, f, v_envuelta);
    end loop;

    v_sql := format('alter policy %I on %I.%I', r.polname, r.nspname, r.relname);
    if v_qual_n  is not null then v_sql := v_sql || format(' using (%s)', v_qual_n); end if;
    if v_check_n is not null then v_sql := v_sql || format(' with check (%s)', v_check_n); end if;

    begin
      execute v_sql;
      v_tocadas := v_tocadas + 1;
    exception when others then
      /* Una política que no se deje reescribir NO puede tumbar la
         migración: la vieja sigue puesta y sigue protegiendo igual.
         Se dice cuál fue y se sigue con las demás. */
      raise notice 'No se pudo reescribir "%" en %.%: %',
        r.polname, r.nspname, r.relname, sqlerrm;
    end;
  end loop;

  raise notice 'Políticas reescritas: %', v_tocadas;
end $$;
