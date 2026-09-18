-- =====================================================================
-- «SIN ACCESO» A UNA SOLA PERSONA: la pantalla lo ofrece y la base lo
-- rechaza
--
-- ---------------------------------------------------------------------
-- QUÉ ESTÁ PASANDO
-- ---------------------------------------------------------------------
-- En /admin/usuarios, cada persona puede tener permisos propios por
-- encima de los de su rol, con tres niveles: «Sin acceso», «Ver» y
-- «Editar». La lista de niveles está escrita así en la pantalla:
--
--     const NIVELES: Nivel[] = ["ninguno", "ver", "editar"];
--     const ROTULO = { ninguno: "Sin acceso", ver: "Ver", editar: "Editar" };
--
-- Y el motor de permisos cuenta con ello, textualmente:
--
--     «`extra[ruta]` puede valer "ninguno" a propósito: es cómo se le
--      quita a una sola persona una pantalla que su rol sí da.»
--
-- PERO LA BASE NO LO DEJA GUARDAR. El CHECK que valida esa columna
-- admite solo dos de los tres valores:
--
--     select bool_and(e.value in ('ver', 'editar')) ...
--
-- Así que escoger «Sin acceso» para una persona en una pantalla que su
-- rol sí le da termina en un error de la base al guardar. La única forma
-- de quitarle UNA pantalla a UNA persona es inventarle un rol para ella
-- sola — que es exactamente lo que los roles venían a evitar.
--
-- ---------------------------------------------------------------------
-- CÓMO APARECIÓ
-- ---------------------------------------------------------------------
-- No lo buscaba. Estaba sembrando casos para probar la migración de
-- Roturas dentro de Quiebra, y uno de ellos era «a esta persona le
-- cerraron /quiebra a mano»: la siembra reventó contra este CHECK.
--
-- Es un fallo silencioso de los caros: no rompe ninguna pantalla, no
-- sale en ningún informe, y quien lo sufre —el administrador que intenta
-- quitarle una pantalla a alguien— se queda pensando que lo hizo mal.
--
-- ---------------------------------------------------------------------
-- EL ARREGLO
-- ---------------------------------------------------------------------
-- Una línea: que el CHECK admita también 'ninguno'.
--
-- NO SE TOCA NINGUNA FILA. Lo que ya está guardado es un subconjunto de
-- lo que se va a admitir, así que nada existente deja de valer. Se
-- amplía lo permitido, no se cambia lo escrito.
--
-- Y EL LADO SEGURO SIGUE SIENDO EL MISMO: lo que no está escrito vale
-- 'ninguno' igual. Esto no abre nada — sirve para CERRAR, que es
-- justamente lo que no se podía.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

do $$
begin
  if to_regclass('public.perfiles') is null then
    raise exception 'Falta supabase/01-perfil.sql. Ese va primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'perfiles'
                    and column_name = 'permisos_extra') then
    raise exception 'Falta supabase/03-usuarios.sql. Ese va primero.';
  end if;
end $$;

/* El CHECK llama a esta función, así que reemplazarla lo cambia. Va
   aparte del `do $$` de arriba porque `create or replace function` no
   puede ir dentro de un bloque sin ejecutarlo como texto, y un `execute`
   con una función entera adentro es de las cosas que nadie vuelve a
   leer. */
create or replace function public.permisos_extra_validos(p jsonb)
returns boolean
language sql
immutable
as $$
  /* LOS TRES NIVELES, no dos. 'ninguno' es un valor con significado —«a
     esta persona, esta pantalla no»— y no la ausencia de valor: la
     ausencia ya significa «lo que diga su rol». Sin él, quitarle UNA
     pantalla a UNA persona obliga a inventarle un rol propio.

     Se recorre con jsonb_each_text y no con un CHECK a secas porque
     Postgres no acepta subconsultas dentro de un CHECK. */
  select jsonb_typeof(p) = 'object'
     and coalesce(
           (select bool_and(e.value in ('ninguno', 'ver', 'editar'))
              from jsonb_each_text(p) e),
           true)   -- un objeto vacío no tiene nada que validar
$$;

/* La restricción se vuelve a poner para que Postgres la revalide contra
   la función nueva. Sin esto, el CHECK puede quedarse con el plan viejo
   hasta el siguiente reinicio, y entonces el arreglo «funciona» en unas
   conexiones y en otras no — un fallo intermitente, que es peor que el
   fallo. */
alter table public.perfiles
  drop constraint if exists perfiles_permisos_extra_validos;
alter table public.perfiles
  add constraint perfiles_permisos_extra_validos
  check (public.permisos_extra_validos(permisos_extra));

do $$
declare v_ok boolean;
begin
  /* SE COMPRUEBA CON EL VALOR, no leyendo la definición. Que el texto de
     la función diga 'ninguno' no prueba que el CHECK lo acepte: puede
     haber quedado otra restricción encima, o la vieja sin quitar. */
  select public.permisos_extra_validos('{"/quiebra": "ninguno"}'::jsonb) into v_ok;
  if not v_ok then
    raise exception 'El CHECK sigue sin admitir «Sin acceso» por persona';
  end if;

  select public.permisos_extra_validos('{"/quiebra": "inventado"}'::jsonb) into v_ok;
  if v_ok then
    raise exception 'El CHECK quedó admitiendo cualquier cosa, no solo los tres niveles';
  end if;

  raise notice 'Listo. Ya se le puede quitar UNA pantalla a UNA persona sin inventarle un rol.';
end $$;
