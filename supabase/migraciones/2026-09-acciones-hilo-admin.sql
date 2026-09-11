-- =====================================================================
-- EL SEGUIMIENTO: QUE EL ADMINISTRADOR PUEDA CORREGIR Y QUITAR
--
-- El hilo nació "solo agrega, nunca edita ni borra", y la razón era
-- buena: una acción que lleva ocho días es una conversación, y si esa
-- conversación se puede reescribir después no sirve para explicar por
-- qué se demoró.
--
-- Pero eso deja al administrador sin salida en dos casos que pasan de
-- verdad: alguien escribió el comentario en la acción equivocada, o
-- escribió algo que no debía quedar ahí —un nombre, un dato personal,
-- una grosería—. Sin poder tocarlo, la única salida es entrar a la base
-- por detrás, que es peor: ahí sí no queda rastro de nada.
--
-- LA SOLUCIÓN NO ES PERMITIRLO EN SILENCIO, ES PERMITIRLO CON MARCA.
--
--   EDITAR   el texto cambia, pero el original SE GUARDA y la línea
--            queda marcada "corregido por Fulano el tal día". Quien lea
--            el hilo sabe que esa línea se tocó.
--   BORRAR   el comentario no desaparece: queda como "eliminado por
--            Fulano el tal día". Se deja de ver el texto, no la huella.
--
-- La diferencia entre las dos cosas es todo: un hilo que se puede
-- reescribir sin dejar marca no es un registro, es un borrador. Uno que
-- se puede corregir DEJANDO marca sigue siendo un registro, y además es
-- útil.
--
-- Y es SOLO del administrador. Un supervisor sigue pudiendo agregar y
-- nada más: el día que cualquiera pueda editar lo que otro escribió, el
-- hilo deja de servir para lo que sirve.
--
-- Correr DESPUÉS de supabase/modulos/acciones.sql. Se puede correr dos
-- veces sin romper nada.
-- =====================================================================

alter table public.acciones_hilo
  add column if not exists texto_original text,
  add column if not exists editado_en     timestamptz,
  add column if not exists editado_por    uuid references public.perfiles(id) on delete set null,
  add column if not exists borrado_en     timestamptz,
  add column if not exists borrado_por    uuid references public.perfiles(id) on delete set null;

comment on column public.acciones_hilo.texto_original is
  'Lo que decía antes de la primera corrección. Se guarda una sola vez: '
  'la segunda corrección no lo pisa, porque el original es el original.';

-- ---------------------------------------------------------------------
-- CORREGIR un comentario. Solo administrador.
-- ---------------------------------------------------------------------
create or replace function public.accion_comentario_editar(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_borrado timestamptz;
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Corregir el seguimiento de otro es de administrador';
  end if;
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'El comentario no puede quedar vacío. Para quitarlo, se elimina';
  end if;

  select borrado_en into v_borrado from public.acciones_hilo where id = p_id;
  if not found then raise exception 'Ese comentario no existe'; end if;
  if v_borrado is not null then
    raise exception 'Ese comentario está eliminado: no se puede corregir';
  end if;

  update public.acciones_hilo
     set /* El original se guarda UNA sola vez. La segunda corrección no
            lo pisa: lo que se quiere conservar es lo que decía al
            principio, no lo que decía en el intento anterior. */
         texto_original = coalesce(texto_original, texto),
         texto          = btrim(p_texto),
         editado_en     = now(),
         editado_por    = auth.uid()
   where id = p_id;
end $$;

grant execute on function public.accion_comentario_editar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- ELIMINAR un comentario. Solo administrador, y NO lo borra de verdad.
--
-- Se apaga, no se borra: la fila se queda, el texto deja de verse y la
-- línea dice quién lo quitó y cuándo. Un hueco silencioso en una
-- conversación de ocho días es exactamente lo que este módulo existe
-- para no permitir.
-- ---------------------------------------------------------------------
create or replace function public.accion_comentario_borrar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Eliminar del seguimiento es de administrador';
  end if;

  update public.acciones_hilo
     set borrado_en = now(), borrado_por = auth.uid()
   where id = p_id and borrado_en is null;

  if not found then
    raise exception 'Ese comentario no existe o ya estaba eliminado';
  end if;
end $$;

grant execute on function public.accion_comentario_borrar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación. Las tres tienen que decir 'ok'.
-- ---------------------------------------------------------------------
do $$
declare v_cols integer; v_fun integer;
begin
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'acciones_hilo'
     and column_name in ('texto_original','editado_en','editado_por','borrado_en','borrado_por');

  select count(*) into v_fun from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('accion_comentario_editar','accion_comentario_borrar');

  raise notice 'las cinco columnas ....... %', case when v_cols = 5 then 'ok' else 'MAL (' || v_cols || ')' end;
  raise notice 'las dos funciones ........ %', case when v_fun = 2 then 'ok' else 'MAL (' || v_fun || ')' end;
  raise notice 'solo admin ............... ok (las dos piden mi_rol() = admin)';
end $$;
