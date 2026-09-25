-- =====================================================================
-- EL ORDEN DEL MAESTRO DE EN SITIO SE GUARDA
--
-- QUÉ PASÓ. Al montar la lista nueva puse un aviso que decía «el orden
-- todavía no se guarda: falta la columna en la base». ERA FALSO y no lo
-- comprobé: `roturas_procesos`, `roturas_areas` y `roturas_causas`
-- TIENEN columna `orden` desde el día que se crearon. Lo que faltaba no
-- era la columna: era esto, la función que la escribe.
--
-- POR QUÉ UNA FUNCIÓN Y NO UN UPDATE POR FILA DESDE LA PANTALLA.
-- Arrastrar un renglón cambia la posición de TODOS los de abajo: con
-- veinte causas, soltar la primera son veinte llamadas y veinte formas
-- de quedar a medias —se escriben doce, se cae la red, y la lista queda
-- en un orden que nadie escogió—. Aquí o se reordena entera o no se
-- reordena.
--
-- Y EL ORDEN NO ES ADORNO: es el orden en que salen las opciones al
-- registrar una rotura, con guante y de pie. Poner «Falla de máquina»
-- de primera porque es la que más pasa ahorra un desplazamiento por
-- registro, y eso son cientos al mes.
--
-- SE PUEDE CORRER VARIAS VECES SIN ROMPER NADA.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. LA COLUMNA, POR SI ACASO
--
-- Está desde el principio en las tres, pero este archivo tiene que
-- poder correrse sobre una base a medio migrar sin reventar: es
-- exactamente la situación en la que alguien lo va a correr.
-- ---------------------------------------------------------------------
alter table public.roturas_procesos add column if not exists orden smallint;
alter table public.roturas_areas    add column if not exists orden smallint;
alter table public.roturas_causas   add column if not exists orden smallint;

-- ---------------------------------------------------------------------
-- 2. REORDENAR
--
-- LA HOJA VIAJA COMO TEXTO Y SE TRADUCE AQUÍ, no se arma la tabla
-- concatenando lo que mandó el navegador: `execute format('update %s',
-- p_hoja)` es una inyección de SQL con otro nombre. Tres ramas escritas
-- a mano son feas y son seguras.
--
-- EL ORDEN ES LA POSICIÓN EN EL ARREGLO, no un número que manda la
-- pantalla. Así dos renglones nunca pueden quedar con el mismo, que es
-- lo que hace que la lista se reordene sola al recargar.
-- ---------------------------------------------------------------------
create or replace function public.rotura_maestro_ordenar(p_hoja text, p_claves text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  /* SE PREGUNTA POR LA PANTALLA Y NO POR EL NOMBRE DEL ROL.
     `rotura_puede()` no sabe de maestros —solo conoce los cuatro
     papeles de la cadena de firmas— y usarla aquí habría dejado pasar
     solo al administrador, que no es la regla: el maestro lo mantiene
     quien tenga EDITAR en esa pantalla. El día que se cree un rol
     nuevo que mantenga maestros, esto sigue funcionando sin tocarlo;
     comparar contra 'admin' no. */
  if public.mi_nivel_pantalla('/roturas/en-sitio/maestro') <> 'editar'
     and not public.manda() then
    raise exception 'Cambiar el orden del maestro es de quien tiene Editar en esa pantalla';
  end if;

  if p_claves is null or array_length(p_claves, 1) is null then
    raise exception 'No llegó ninguna lista que ordenar';
  end if;

  if p_hoja = 'procesos' then
    update public.roturas_procesos t
       set orden = x.pos
      from unnest(p_claves) with ordinality as x(clave, pos)
     where t.clave = x.clave;
  elsif p_hoja = 'areas' then
    update public.roturas_areas t
       set orden = x.pos
      from unnest(p_claves) with ordinality as x(clave, pos)
     where t.clave = x.clave;
  elsif p_hoja = 'causas' then
    update public.roturas_causas t
       set orden = x.pos
      from unnest(p_claves) with ordinality as x(clave, pos)
     where t.clave = x.clave;
  else
    raise exception 'No existe la hoja «%» en el maestro de en sitio', p_hoja;
  end if;

  get diagnostics v_n = row_count;
  /* SI NO CAMBIÓ NINGUNA, ALGO ESTÁ MAL y se dice: una clave que ya no
     existe llegaría aquí y la pantalla se quedaría creyendo que guardó.
     Un «guardado» que no guardó es peor que un error. */
  if v_n = 0 then
    raise exception 'Ninguna de esas claves existe en %: no se reordenó nada', p_hoja;
  end if;
  return v_n;
end $$;

grant execute on function public.rotura_maestro_ordenar(text, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 3. QUE NADIE QUEDE SIN ORDEN
--
-- Una fila con `orden` en null se va al final o al principio según cómo
-- pregunte cada consulta, y entonces la lista sale distinta en dos
-- pantallas. Se les pone el que ya tienen por nombre.
--
-- ES UNA FUNCIÓN Y NO UN BLOQUE SUELTO, Y NO ES POR ELEGANCIA: un
-- `do $$ … $$` no se puede llamar, así que no se puede probar. Lo
-- escribí primero como bloque suelto y la mutación que lo desactivaba
-- VOLVIÓ VERDE — no porque el código estuviera bien, sino porque la
-- prueba no tenía cómo tocarlo. Como función, el arnés mete una fila
-- sin orden, la llama y comprueba que quedó arreglada.
--
-- Y SE PUEDE VOLVER A LLAMAR el día que alguien meta una fila a mano
-- por el editor de SQL, que es exactamente cuando aparece un null.
-- ---------------------------------------------------------------------
create or replace function public.rotura_maestro_orden_completar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer := 0; v_i integer;
begin
  update public.roturas_procesos t set orden = x.pos
    from (select clave, row_number() over (order by nombre) + 100 as pos
            from public.roturas_procesos where orden is null) x
   where t.clave = x.clave;
  get diagnostics v_i = row_count; v_n := v_n + v_i;

  update public.roturas_areas t set orden = x.pos
    from (select clave, row_number() over (order by nombre) + 100 as pos
            from public.roturas_areas where orden is null) x
   where t.clave = x.clave;
  get diagnostics v_i = row_count; v_n := v_n + v_i;

  update public.roturas_causas t set orden = x.pos
    from (select clave, row_number() over (order by nombre) + 100 as pos
            from public.roturas_causas where orden is null) x
   where t.clave = x.clave;
  get diagnostics v_i = row_count; v_n := v_n + v_i;

  return v_n;
end $$;

grant execute on function public.rotura_maestro_orden_completar() to authenticated;

select public.rotura_maestro_orden_completar();

do $$
declare n int;
begin
  select count(*) into n from public.roturas_procesos where orden is null;
  raise notice 'El orden del maestro de en sitio ya se guarda. Procesos sin orden: %.', n;
  raise notice 'Se arrastra un renglon y la lista queda asi para todos, tambien al registrar.';
end $$;

commit;
