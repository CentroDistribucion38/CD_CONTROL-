-- ==============================================================
-- CONTROL · Fiscal: familias + culminar sin huecos (TODO en uno)
-- Pégalo completo en el SQL Editor de Supabase de CONTROL y dale Run.
-- Requiere ya aplicados: 2026-10-fiscal-TODO.sql y 2026-10-fiscal-conciliar-ol.sql
-- Se puede volver a correr sin problema.
-- ==============================================================

-- ########## PARTE 1 · FAMILIAS (EER y catálogo) ##########
-- =====================================================================
-- INVENTARIO FISCAL · FAMILIAS POR HOJA
--
-- «Cuando estoy creando las parejas del fiscal quiero poder asignarles las
--  familias: a una pareja le toca Lata y Barril. Y en la hoja del conteo, un
--  ícono pequeño que abra un toolbox con esas familias y sus códigos: SKU,
--  descripción y factor de estibado.»
--
-- LAS FAMILIAS NO SE CARGAN DE NUEVO. Ya están en el maestro (productos.familia)
-- y coinciden con la hoja «Codigos» de la Plantilla de Frescura (6-nov-2026):
--     Lata · Tw · Ret · Pet · Barril      (462 materiales, todos iguales)
-- Esto solo agrega lo que falta para guardar cuáles le tocan a cada hoja.
--
-- QUÉ HACE
--   1. inv_fiscal_hojas.familias      las familias de la hoja (0, 1 o 2).
--   2. productos.familia              corrige el único «TW» (código 23224) a «Tw».
--   3. inv_fiscal_familias_validas    revisa las familias que llegan: que existan en
--                                     el maestro (sin importar mayúsculas), sin repetir, máximo 2.
--   4. inv_fiscal_guardar             la misma de siempre (calle incluida) + las familias.
--   5. inv_fiscal_hoja_familias       las familias de UNA hoja, para quien la cuenta
--                                     (la pareja de la hoja o quien ve el plan fiscal).
--
-- Las familias son de CONSULTA: no limitan lo que se puede anotar.
-- Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.inv_fiscal_hojas add column if not exists familias text[] not null default '{}';

update public.productos set familia = 'Tw' where familia = 'TW';

-- ---------------------------------------------------------------------
-- Las familias de una hoja, ya revisadas y con la escritura del maestro («lata» → «Lata»).
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_familias_validas(p_json jsonb, p_hoja integer)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_fams  text[] := '{}';
  v_x     text;
  v_canon text;
begin
  if p_json is null or jsonb_typeof(p_json) <> 'array' then
    return v_fams;
  end if;
  for v_x in select btrim(e) from jsonb_array_elements_text(p_json) as e loop
    if v_x = '' then continue; end if;
    select familia into v_canon from public.productos where lower(familia) = lower(v_x) limit 1;
    if v_canon is null then
      raise exception 'La familia «%» de la hoja % no existe en el maestro', v_x, p_hoja;
    end if;
    if not (v_canon = any (v_fams)) then v_fams := v_fams || v_canon; end if;
  end loop;
  if coalesce(array_length(v_fams, 1), 0) > 2 then
    raise exception 'La hoja % puede llevar como máximo 2 familias', p_hoja;
  end if;
  return v_fams;
end $$;

-- ---------------------------------------------------------------------
-- GUARDAR UN INVENTARIO FISCAL COMPLETO (igual que antes, con calle, + familias)
--   p_hojas: [{"numero":1,"ol":"<uuid|null>","bavaria":"<uuid|null>","calle":"A","familias":["Lata","Barril"]}, …]
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_guardar(uuid, uuid, text, date, jsonb);
create function public.inv_fiscal_guardar(
  p_id     uuid,
  p_bodega uuid,
  p_nombre text,
  p_fecha  date,
  p_hojas  jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid := p_id;
  v_estado  text;
  v_h       jsonb;
  v_num     integer;
  v_nums    integer[] := '{}';
  v_gente   uuid[] := '{}';
  v_hoja    uuid;
  v_p       uuid;
  v_ol      uuid;
  v_ba      uuid;
  v_calle   text;
  v_fams    text[];
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Armar el inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'El inventario fiscal necesita un nombre';
  end if;
  if p_fecha is null then
    raise exception 'El inventario fiscal necesita una fecha';
  end if;
  if p_hojas is null or jsonb_typeof(p_hojas) <> 'array' or jsonb_array_length(p_hojas) = 0 then
    raise exception 'El inventario fiscal necesita al menos una hoja';
  end if;
  if not exists (select 1 from public.bodegas where id = p_bodega) then
    raise exception 'Esa bodega no existe';
  end if;

  /* Se revisa todo ANTES de escribir: o queda completo o no queda nada. */
  for v_h in select * from jsonb_array_elements(p_hojas) loop
    v_num := nullif(v_h ->> 'numero', '')::integer;
    if v_num is null or v_num < 1 then
      raise exception 'Cada hoja lleva un número desde el 1';
    end if;
    if v_num = any (v_nums) then
      raise exception 'La hoja % está repetida', v_num;
    end if;
    v_nums := v_nums || v_num;
    v_ol := nullif(v_h ->> 'ol', '')::uuid;
    v_ba := nullif(v_h ->> 'bavaria', '')::uuid;
    if v_ol is not null and v_ol = v_ba then
      raise exception 'En la hoja % la misma persona no puede ser del OL y de Bavaria', v_num;
    end if;
    foreach v_p in array array_remove(array[v_ol, v_ba], null) loop
      if v_p = any (v_gente) then
        raise exception 'Una persona solo puede estar en una hoja del mismo inventario (hoja %)', v_num;
      end if;
      if not exists (select 1 from public.perfiles where id = v_p and activo) then
        raise exception 'Una de las personas de la hoja % no existe o está desactivada', v_num;
      end if;
      v_gente := v_gente || v_p;
    end loop;
    perform public.inv_fiscal_familias_validas(v_h -> 'familias', v_num);
  end loop;

  if v_id is null then
    insert into public.inv_fiscales (bodega_id, nombre, fecha)
         values (p_bodega, btrim(p_nombre), p_fecha)
      returning id into v_id;
  else
    select estado into v_estado from public.inv_fiscales where id = v_id for update;
    if v_estado is null then raise exception 'Ese inventario fiscal ya no existe'; end if;
    /* UN CERRADO SOLO LO TOCA QUIEN ADMINISTRA: «que el super admin pueda
       editar, borrar y eliminar el plan». El resto lo ve cerrado y ya. */
    if v_estado <> 'abierto' and not public.manda() then raise exception 'Ese inventario fiscal ya está cerrado'; end if;
    update public.inv_fiscales set nombre = btrim(p_nombre), fecha = p_fecha, bodega_id = p_bodega
     where id = v_id;
    /* Las hojas que ya no están. Las parejas de las que quedan se reponen abajo. */
    delete from public.inv_fiscal_hojas where fiscal_id = v_id and numero <> all (v_nums);
    delete from public.inv_fiscal_miembros where fiscal_id = v_id;
  end if;

  for v_h in select * from jsonb_array_elements(p_hojas) loop
    v_num := (v_h ->> 'numero')::integer;
    v_calle := nullif(upper(btrim(coalesce(v_h ->> 'calle', ''))), '');
    if v_calle is not null and length(v_calle) > 20 then
      raise exception 'La calle de la hoja % es demasiado larga', v_num;
    end if;
    v_fams := public.inv_fiscal_familias_validas(v_h -> 'familias', v_num);
    insert into public.inv_fiscal_hojas (fiscal_id, numero, calle, familias) values (v_id, v_num, v_calle, v_fams)
      on conflict (fiscal_id, numero) do update set calle = excluded.calle, familias = excluded.familias
      returning id into v_hoja;
    v_ol := nullif(v_h ->> 'ol', '')::uuid;
    v_ba := nullif(v_h ->> 'bavaria', '')::uuid;
    if v_ol is not null then
      insert into public.inv_fiscal_miembros (hoja_id, fiscal_id, equipo, user_id) values (v_hoja, v_id, 'OL', v_ol);
    end if;
    if v_ba is not null then
      insert into public.inv_fiscal_miembros (hoja_id, fiscal_id, equipo, user_id) values (v_hoja, v_id, 'BAVARIA', v_ba);
    end if;
  end loop;

  return v_id;
end $$;

revoke all on function public.inv_fiscal_guardar(uuid, uuid, text, date, jsonb) from public, anon;
grant execute on function public.inv_fiscal_guardar(uuid, uuid, text, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- LAS FAMILIAS DE UNA HOJA, para el toolbox de Contar.
-- La ven las dos personas de la hoja y quien tiene permiso de ver el plan fiscal;
-- para cualquier otra devuelve null (la pantalla no muestra nada).
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_hoja_familias(p_hoja uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select h.familias
    from public.inv_fiscal_hojas h
   where h.id = p_hoja
     and (
       public.puede_ver('/inventario/fiscal')
       or exists (select 1 from public.inv_fiscal_miembros m where m.hoja_id = h.id and m.user_id = auth.uid())
     );
$$;
revoke all on function public.inv_fiscal_hoja_familias(uuid) from public, anon;
grant execute on function public.inv_fiscal_hoja_familias(uuid) to authenticated;

commit;


-- =====================================================================
-- INVENTARIO FISCAL · FAMILIAS: SIN TOPE Y CON LOS ENVASES (EER)
--
-- «Aquí debo poder seleccionar varias familias a la vez, no solo dos, y faltan
--  los SKU de envase (EER): esos sí los tienes del maestro.»
--
-- QUÉ CAMBIA (corre DESPUÉS de 2026-11-fiscal-familias.sql)
--   1. inv_fiscal_familias_validas   ya no limita a 2: una hoja lleva las que se le pongan.
--                                    Acepta las familias del maestro de PRODUCTO (Lata, Tw, Ret, Pet,
--                                    Barril) y las del maestro de ENVASES / pasivos (Envase, Caja,
--                                    Estiba, No retornable…), sin importar mayúsculas.
--   2. inv_fiscal_familias_catalogo  las familias que se ofrecen al armar el plan, con su tipo
--                                    (PT = producto, EER = envase) y cuántos códigos tiene cada una.
--   3. inv_fiscal_hoja_codigos       los códigos de las familias de UNA hoja (SKU, descripción y
--                                    factor de estibado), de los dos maestros, para el toolbox de Contar.
--
-- Todo es de CONSULTA: no limita lo que se puede anotar. Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.inv_fiscal_hojas add column if not exists familias text[] not null default '{}';

create or replace function public.inv_fiscal_familias_validas(p_json jsonb, p_hoja integer)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_fams  text[] := '{}';
  v_x     text;
  v_canon text;
begin
  if p_json is null or jsonb_typeof(p_json) <> 'array' then
    return v_fams;
  end if;
  for v_x in select btrim(e) from jsonb_array_elements_text(p_json) as e loop
    if v_x = '' then continue; end if;
    v_canon := null;
    select familia into v_canon from public.productos where lower(familia) = lower(v_x) limit 1;
    if v_canon is null then
      select familia into v_canon from public.pasivos_maestro where lower(familia) = lower(v_x) limit 1;
    end if;
    if v_canon is null then
      raise exception 'La familia «%» de la hoja % no existe en el maestro', v_x, p_hoja;
    end if;
    if not (v_canon = any (v_fams)) then v_fams := v_fams || v_canon; end if;
  end loop;
  return v_fams;
end $$;

-- ---------------------------------------------------------------------
-- LAS FAMILIAS QUE SE OFRECEN AL ARMAR EL PLAN
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_familias_catalogo()
returns table (nombre text, tipo text, n integer)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select min(p.familia) as nombre, 'PT'::text as tipo, count(*)::int as n
      from public.productos p
     where p.activo and p.tipo_material = 'PRODUCTO' and btrim(coalesce(p.familia, '')) <> ''
     group by lower(p.familia)
    union all
    select min(m.familia), 'EER'::text, count(*)::int
      from public.pasivos_maestro m
     where m.activo and btrim(coalesce(m.familia, '')) <> ''
     group by lower(m.familia)
  ) x
  where public.puede_ver('/inventario/fiscal')
$$;
revoke all on function public.inv_fiscal_familias_catalogo() from public, anon;
grant execute on function public.inv_fiscal_familias_catalogo() to authenticated;

-- ---------------------------------------------------------------------
-- LOS CÓDIGOS DE LAS FAMILIAS DE UNA HOJA (toolbox de Contar)
-- La ven las dos personas de la hoja y quien tiene permiso de ver el plan fiscal.
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_hoja_codigos(p_hoja uuid)
returns table (sku text, descripcion text, familia text, tipo text, cajas_por_estiba numeric, unidades_por_caja numeric)
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select hh.id, hh.familias
      from public.inv_fiscal_hojas hh
     where hh.id = p_hoja
       and (
         public.puede_ver('/inventario/fiscal')
         or exists (select 1 from public.inv_fiscal_miembros mm where mm.hoja_id = hh.id and mm.user_id = auth.uid())
       )
  )
  select p.sku::text, p.nombre::text, p.familia::text, 'PT'::text, p.cajas_por_estiba::numeric, p.unidades_por_caja::numeric
    from h join public.productos p on lower(p.familia) = any (select lower(f) from unnest(h.familias) f)
   where p.activo and p.tipo_material = 'PRODUCTO'
  union all
  select m.codigo::text, m.descripcion::text, m.familia::text, 'EER'::text, m.cajas_por_estiba::numeric, m.unidades_por_caja::numeric
    from h join public.pasivos_maestro m on lower(m.familia) = any (select lower(f) from unnest(h.familias) f)
   where m.activo
$$;
revoke all on function public.inv_fiscal_hoja_codigos(uuid) from public, anon;
grant execute on function public.inv_fiscal_hoja_codigos(uuid) to authenticated;

commit;


-- ########## PARTE 2 · CULMINAR SIN HUECOS ##########
-- =====================================================================
-- INVENTARIO FISCAL · CULMINAR SIN HUECOS
--
-- «Apenas ellos le dan enviar y el fiscal aprueba, ya ellos no pueden hacer nada. No quiero que pase a otra calle y se les
--  quede abierta la anterior con posibilidades de que registren, cambien o editen. Para culminar, que me muestre qué quedó
--  pendiente; y que también se pueda culminar por hoja, por pareja.»
--
-- QUÉ CAMBIA (corre DESPUÉS de 2026-10-fiscal-TODO.sql y de 2026-10-fiscal-conciliar-ol.sql; se puede correr dos veces)
--
--  1. UN MÓDULO APROBADO SE BLOQUEA. Nadie anota, corrige ni quita renglones (ni fotos ni marcas) en un módulo que el fiscal
--     aprobó. Para tocarlo, el fiscal lo manda a validar otra vez. Una hoja CULMINADA tampoco se toca.
--  2. CADA HOJA SE CUENTA EN SU CALLE. Si la hoja tiene calle, solo se anota en ubicaciones de esa calle.
--  3. «SIGUIENTE CALLE» NO DEJA NADA ABIERTO: antes de pasar, todo lo contado en la calle de turno tiene que estar aprobado
--     (si no, dice qué módulos faltan). Además se acaba cualquier OK de reabrir que quedara pendiente.
--  4. EL OK DE REABRIR SE ACABA AL VOLVER A ENVIAR (terminar), no solo al reabrir.
--  5. LAS COMPENSACIONES Y EL CONTEO DEFINITIVO NO SE PIERDEN. Al pasar a La base, cada módulo toma su conteo definitivo
--     (el que el fiscal dejó, o el del operador) sin importar quién tocó «Terminé» en la calle de turno. Antes, si en la
--     última calle solo una persona de la pareja enviaba, TODA la hoja se tomaba solo de esa persona.
--  6. CULMINAR (la versión estricta, «B»):
--       · inv_fiscal_pendientes(fiscal, hoja?)   qué quedó pendiente (hoja, calle, módulo, motivo, personas).
--       · inv_fiscal_cerrar_hoja(hoja)           culmina UNA pareja si todo lo contado está aprobado.
--       · inv_fiscal_cerrar_todo(fiscal)         culmina TODO el fiscal, pero SOLO si no queda nada pendiente. No aprueba por su cuenta.
--       Al culminar cada hoja se pasa lo aprobado a La base y se COMPRUEBA que La base quedó igual a lo aprobado; si no, no se cierra.
--  7. «FINALIZADA» para quien cuenta: inv_fiscal_mis_hojas trae `finalizada` y la pantalla de Contar deja de mostrar el conteo.
-- =====================================================================
begin;


-- ---------------------------------------------------------------------
-- AYUDAS
-- ---------------------------------------------------------------------
-- ¿El módulo de esa ubicación (los dos lados) ya lo aprobó el fiscal?
create or replace function public.inv_fiscal_modulo_aprobado(p_hoja uuid, p_ubi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = (select regexp_replace(u.clave, '_(IZQ|DER)$', '') from public.ubicaciones u where u.id = p_ubi))
$$;
revoke all on function public.inv_fiscal_modulo_aprobado(uuid, uuid) from public, anon, authenticated;

-- Los módulos de una hoja con renglones (o en validación) que el fiscal todavía NO aprobó.
create or replace function public.inv_fiscal_modulos_pendientes(p_hoja uuid)
returns table (modulo text, motivo text)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select regexp_replace(u.clave, '_(IZQ|DER)$', '') as k
      from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
     where c.hoja_id = p_hoja
    union
    select regexp_replace(ur.clave, '_(IZQ|DER)$', '')
      from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
     where r.hoja_id = p_hoja and r.estado = 'A_VALIDAR')
  select m.k,
         case when exists (select 1 from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
                            where r.hoja_id = p_hoja and r.estado = 'A_VALIDAR'
                              and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = m.k)
              then 'En validación' else 'Sin aprobar' end
    from m
   where not exists (select 1 from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
                      where r.hoja_id = p_hoja and r.estado = 'APROBADA'
                        and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = m.k)
   order by m.k
$$;
revoke all on function public.inv_fiscal_modulos_pendientes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1 y 2. NADIE TOCA UN MÓDULO APROBADO, UNA HOJA CULMINADA NI OTRA CALLE
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_conteos_hoja_cerrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoja uuid := coalesce(new.hoja_id, old.hoja_id);
  v_calle text; v_cerrada boolean;
begin
  select nullif(upper(btrim(coalesce(h.calle, ''))), ''), (h.cerrada_en is not null)
    into v_calle, v_cerrada
    from public.inv_fiscal_hojas h where h.id = v_hoja;
  if not found then return coalesce(new, old); end if;   -- se está borrando la hoja entera (el plan)
  if v_cerrada then
    raise exception 'Esta hoja ya la culminó el fiscal: no se puede anotar ni cambiar nada en ella.';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and public.inv_fiscal_modulo_aprobado(v_hoja, old.ubicacion_id) then
    raise exception 'Ese módulo ya lo aprobó el fiscal: no se puede anotar ni cambiar nada en él. Si hay que cambiarlo, el fiscal lo manda a validar otra vez.';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if public.inv_fiscal_modulo_aprobado(v_hoja, new.ubicacion_id) then
      raise exception 'Ese módulo ya lo aprobó el fiscal: no se puede anotar ni cambiar nada en él. Si hay que cambiarlo, el fiscal lo manda a validar otra vez.';
    end if;
    -- Cada hoja se cuenta en su calle (solo si esa calle existe en las ubicaciones: no se bloquea por un nombre mal escrito).
    if v_calle is not null
       and exists (select 1 from public.ubicaciones x where upper(btrim(x.calle)) = v_calle)
       and not exists (select 1 from public.ubicaciones x where x.id = new.ubicacion_id and upper(btrim(x.calle)) = v_calle) then
      raise exception 'Esa ubicación no es de la calle de tu hoja (calle %).', v_calle;
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists inv_fiscal_conteos_cerrada on public.inv_fiscal_conteos;
create trigger inv_fiscal_conteos_cerrada before insert or update or delete on public.inv_fiscal_conteos
  for each row execute function public.inv_fiscal_conteos_hoja_cerrada();

-- Las fotos de los renglones y las marcas de módulo (mezclado / sin acceso) siguen la misma regla.
create or replace function public.inv_fiscal_fotos_bloqueo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid := coalesce(new.hoja_id, old.hoja_id); v_ubi uuid;
begin
  if not exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja) then return coalesce(new, old); end if;
  if exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja and h.cerrada_en is not null) then
    raise exception 'Esta hoja ya la culminó el fiscal: no se puede anotar ni cambiar nada en ella.';
  end if;
  select c.ubicacion_id into v_ubi from public.inv_fiscal_conteos c where c.id = coalesce(new.conteo_id, old.conteo_id);
  if v_ubi is not null and public.inv_fiscal_modulo_aprobado(v_hoja, v_ubi) then
    raise exception 'Ese módulo ya lo aprobó el fiscal: no se puede cambiar nada en él.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists inv_fiscal_fotos_bloqueo on public.inv_fiscal_fotos;
create trigger inv_fiscal_fotos_bloqueo before insert or update or delete on public.inv_fiscal_fotos
  for each row execute function public.inv_fiscal_fotos_bloqueo();

create or replace function public.inv_fiscal_modulos_bloqueo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid := coalesce(new.hoja_id, old.hoja_id); v_ubi uuid := coalesce(new.ubicacion_id, old.ubicacion_id);
begin
  if not exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja) then return coalesce(new, old); end if;
  if exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja and h.cerrada_en is not null) then
    raise exception 'Esta hoja ya la culminó el fiscal: no se puede anotar ni cambiar nada en ella.';
  end if;
  if public.inv_fiscal_modulo_aprobado(v_hoja, v_ubi) then
    raise exception 'Ese módulo ya lo aprobó el fiscal: no se puede cambiar nada en él.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists inv_fiscal_modulos_bloqueo on public.inv_fiscal_modulos;
create trigger inv_fiscal_modulos_bloqueo before insert or update or delete on public.inv_fiscal_modulos
  for each row execute function public.inv_fiscal_modulos_bloqueo();

-- ---------------------------------------------------------------------
-- 5. EL CONTEO DEFINITIVO DE CADA MÓDULO Y LO QUE PASA A LA BASE
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_equipo_definitivo(uuid, uuid);
create function public.inv_fiscal_equipo_definitivo(p_hoja uuid, p_ubi uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with m as (select regexp_replace(u.clave, '_(IZQ|DER)$', '') as k from public.ubicaciones u where u.id = p_ubi),
       a as (select r.adoptado from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = p_ubi)
  select case
    when (select adoptado from a) is not null
         and exists (select 1 from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
                      where c.hoja_id = p_hoja and c.equipo = (select adoptado from a)
                        and regexp_replace(u.clave, '_(IZQ|DER)$', '') = (select k from m))
      then (select adoptado from a)
    when exists (select 1 from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
                  where c.hoja_id = p_hoja and c.equipo = 'OL'
                    and regexp_replace(u.clave, '_(IZQ|DER)$', '') = (select k from m))
      then 'OL'
    else 'BAVARIA' end
$$;
revoke all on function public.inv_fiscal_equipo_definitivo(uuid, uuid) from public, anon;
grant execute on function public.inv_fiscal_equipo_definitivo(uuid, uuid) to authenticated;


drop function if exists public.inv_fiscal_consolidar(uuid);
create function public.inv_fiscal_consolidar(p_hoja uuid)
returns table (ubicaciones integer, renglones integer, sin_consolidar integer, conteo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_num integer; v_conteo uuid; v_fecha date; v_bodega uuid; v_codigo text;
  v_ok uuid[]; v_sin integer; v_ren integer; v_equipos integer; v_eq text := 'OL';
  rg record; v_lid uuid;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Consolidar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select h.numero, h.conteo_id, f.fecha into v_num, v_conteo, v_fecha
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_num is null then raise exception 'Esa hoja no existe.'; end if;

  -- ¿Terminó una sola persona? Entonces no hay cruce: lo aprobado se toma de la persona que terminó.
  select count(distinct m.equipo), coalesce(min(m.equipo), 'OL') into v_equipos, v_eq
    from public.inv_fiscal_miembros m
    join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
   where m.hoja_id = p_hoja;
  if v_equipos <> 1 then v_eq := 'OL'; end if;

  -- AHORA CADA MÓDULO SE TOMA POR SÍ SOLO (no por lo que terminó cada persona en la calle de turno): el conteo que el fiscal dejó
  -- como definitivo; si no escogió, el del operador; si el operador no contó ese módulo, el de Bavaria.
  -- Todo módulo APROBADO por el fiscal (coincida o no): ahí el fiscal ya concilió a las dos personas.
  v_ok := array(
    select r.ubicacion_id from public.inv_fiscal_revisiones r
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id)
       );
  select count(*) into v_sin from public.inv_fiscal_revisiones r
   where r.hoja_id = p_hoja and r.estado = 'APROBADA' and not (r.ubicacion_id = any (v_ok))
     and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id);

  if v_conteo is null then
    if coalesce(array_length(v_ok, 1), 0) = 0 then
      raise exception 'Todavía no hay ubicaciones aprobadas que coincidan en esta hoja: no hay nada que consolidar.';
    end if;
    select u.bodega_id into v_bodega from public.ubicaciones u where u.id = v_ok[1];
    v_codigo := 'FISCAL-' || to_char(v_fecha, 'YYYYMMDD') || '-H' || lpad(v_num::text, 2, '0');
    if exists (select 1 from public.conteos where codigo = v_codigo) then
      v_codigo := v_codigo || '-' || substr(p_hoja::text, 1, 4);
    end if;
    insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en, cerrado_en, enviado_por, enviado_en, nota)
    values (v_codigo, v_bodega, 'fefo', 'cerrado', v_yo, now(), now(), v_yo,
            ((v_fecha::timestamp + interval '12 hours') at time zone 'America/Bogota'),
            'Inventario fiscal · Hoja ' || v_num || case when v_equipos = 1 then ' · lo aprobado por el fiscal, contado por una sola persona (sin cruce)' else ' · lo aprobado por el fiscal (coincidente entre las dos personas, o el conteo que el fiscal dejó como definitivo)' end)
    returning id into v_conteo;
    update public.inv_fiscal_hojas set conteo_id = v_conteo where id = p_hoja;
  end if;

  -- Lo que ya no está aprobado y coincidente sale; lo que sí, se vuelve a poner tal cual está hoy.
  delete from public.conteo_lineas where conteo_id = v_conteo;
  delete from public.conteo_modulos where conteo_id = v_conteo;
  v_ren := 0;
  for rg in
    select c.id as cid, c.producto_id, c.ubicacion_id, c.estibas, c.cajas, c.saldo, c.venc_dia, c.venc_mes, c.venc_anio,
           c.averia, c.pnc, c.estado_envase, c.nota, c.contado_en, c.contado_por, c.pnc_rotulo, c.pnc_bloqueo_mecanico,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0) as total
      from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja and c.ubicacion_id = any (v_ok)
       -- De cada módulo se toma el conteo del equipo que el fiscal dejó como definitivo; si no escogió, el de la persona que terminó (o el del operador).
       and c.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, c.ubicacion_id)
     order by c.contado_en
  loop
    insert into public.conteo_lineas
      (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo, venc_dia, venc_mes, venc_anio,
       rotacion, averia, pnc, estado_envase, nota, cantidad_contada, contado_por, contado_en, pnc_rotulo, pnc_bloqueo_mecanico)
    values (v_conteo, rg.producto_id, rg.ubicacion_id, rg.estibas, rg.cajas, rg.saldo, rg.venc_dia, rg.venc_mes, rg.venc_anio,
            null, rg.averia, rg.pnc, rg.estado_envase, rg.nota, rg.total, coalesce(rg.contado_por, v_yo), rg.contado_en, rg.pnc_rotulo, rg.pnc_bloqueo_mecanico)
    returning id into v_lid;
    -- La foto del renglón (si la hay) viaja con él a La base.
    insert into public.conteo_fotos (linea_id, conteo_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
    select v_lid, v_conteo, f.ruta, f.bytes, f.ancho, f.alto, f.tomada_en, f.lat, f.lng, f.precision_m, f.subida_por, f.subida_en
      from public.inv_fiscal_fotos f where f.conteo_id = rg.cid;
    v_ren := v_ren + 1;
  end loop;
  -- La hora real del conteo: del primer al último renglón que pasó (no la de quien aprueba).
  update public.conteos cn
     set iniciado_en = coalesce((select min(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.iniciado_en),
         cerrado_en  = coalesce((select max(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.cerrado_en)
   where cn.id = v_conteo;
  -- Mezclado / sin acceso de quien contó: de lo que pasó a La base y de los módulos donde nadie anotó renglones.
  insert into public.conteo_modulos (conteo_id, ubicacion_id, mezclado, sin_acceso, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, marcado_por, marcado_en)
  select v_conteo, m.ubicacion_id, m.mezclado, m.sin_acceso, m.ruta, m.bytes, m.ancho, m.alto, m.tomada_en, m.lat, m.lng, m.precision_m, m.user_id, m.marcado_en
    from public.inv_fiscal_modulos m
    join public.inv_fiscal_miembros mi on mi.hoja_id = m.hoja_id and mi.user_id = m.user_id
   where m.hoja_id = p_hoja
     and mi.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, m.ubicacion_id)
     and (m.ubicacion_id = any (v_ok)
          or not exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = m.ubicacion_id));

  return query select coalesce(array_length(v_ok, 1), 0), v_ren, v_sin,
                      (select cn.codigo from public.conteos cn where cn.id = v_conteo);
end $$;
revoke all on function public.inv_fiscal_consolidar(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidar(uuid) to authenticated;


-- Aprobar: con una sola persona terminada, el módulo queda con lo de esa persona.
drop function if exists public.inv_fiscal_aprobar(uuid, uuid[], boolean);
drop function if exists public.inv_fiscal_aprobar(uuid, uuid[], boolean, text);
drop function if exists public.inv_fiscal_aprobar(uuid, uuid[], boolean, text, boolean);
create function public.inv_fiscal_aprobar(p_hoja uuid, p_ubicaciones uuid[], p_forzar boolean default false, p_adoptar text default null, p_compensar boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_ubi uuid; v_n integer := 0; v_estado text; v_rev text; v_ronda integer; v_envios integer; v_clave text; v_lista uuid[];
  v_equipos integer;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Aprobar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if coalesce(array_length(p_ubicaciones, 1), 0) = 0 then raise exception 'Escoge al menos un módulo.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_estado is null then raise exception 'Esa hoja no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  select count(distinct m.equipo) into v_equipos
    from public.inv_fiscal_miembros m
    join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
   where m.hoja_id = p_hoja;
  if v_equipos < 1 then
    raise exception 'Se aprueba cuando al menos una persona de la hoja terminó.';
  end if;
  -- Con una sola persona no hay cruce: se aprueba solo si el fiscal lo confirma.
  if v_equipos < 2 and not coalesce(p_forzar, false) then
    raise exception 'Solo terminó una persona de la hoja: no hay cruce. Confirma para aprobar con una sola persona.';
  end if;
  if p_adoptar is not null and p_adoptar not in ('OL', 'BAVARIA') then raise exception 'Escoge qué conteo queda como definitivo: el del operador o el de Bavaria.'; end if;
  -- «Dejar lo de un equipo» solo tiene sentido cuando hay dos conteos que cruzar.
  -- Con una sola persona terminada, el módulo queda con lo de esa persona (se anota, para que al pasar a La base no se pierda).
  if v_equipos < 2 then
    p_adoptar := (select m.equipo from public.inv_fiscal_miembros m
                    join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
                   where m.hoja_id = p_hoja limit 1);
    p_compensar := false;
  end if;

  v_lista := array(
    select distinct h
      from unnest(public.inv_fiscal_hermanas((select array_agg(distinct u) from unnest(p_ubicaciones) u))) h
     where h = any (p_ubicaciones)
        or exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = h)
        or exists (select 1 from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = h));
  foreach v_ubi in array v_lista loop
    select r.estado, r.ronda into v_rev, v_ronda
      from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = v_ubi;
    if v_rev = 'A_VALIDAR' and not coalesce(p_forzar, false) then
      select count(*) into v_envios from public.inv_fiscal_revision_envios e
       where e.hoja_id = p_hoja and e.ubicacion_id = v_ubi and e.ronda = v_ronda;
      if v_envios < 2 then
        select clave into v_clave from public.ubicaciones where id = v_ubi;
        raise exception 'En % todavía falta que las dos personas envíen su validación.', coalesce(regexp_replace(v_clave, '_(IZQ|DER)$', ''), 'un módulo');
      end if;
    end if;
    insert into public.inv_fiscal_revisiones (hoja_id, ubicacion_id, estado, ronda, aprobado_por, aprobado_en, adoptado, compensado)
    values (p_hoja, v_ubi, 'APROBADA', 0, v_yo, now(), p_adoptar, coalesce(p_compensar, false))
    on conflict (hoja_id, ubicacion_id) do update
      set estado = 'APROBADA', aprobado_por = v_yo, aprobado_en = now(), adoptado = p_adoptar, compensado = coalesce(p_compensar, false);
    v_n := v_n + 1;
  end loop;
  -- Al aprobar, lo que coincide pasa solo a La base (y sale del borrador de cada persona). Si aún no hay nada que pasar, no pasa nada.
  begin
    perform public.inv_fiscal_consolidar(p_hoja);
  exception when others then
    null;
  end;
  return v_n;
end $$;
revoke all on function public.inv_fiscal_aprobar(uuid, uuid[], boolean, text, boolean) from public, anon;
grant execute on function public.inv_fiscal_aprobar(uuid, uuid[], boolean, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 4. EL OK DE REABRIR SE ACABA AL VOLVER A ENVIAR; UNA HOJA CULMINADA NO SE REABRE DESDE AFUERA
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_terminar(uuid, boolean);
create function public.inv_fiscal_terminar(p_hoja uuid, p_terminado boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_estado text; v_pub timestamptz; v_fecha date;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select m.equipo, f.estado, f.publicado_en, f.fecha
    into v_equipo, v_estado, v_pub, v_fecha
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then
    raise exception 'El fiscal ya culminó tu hoja: no hay nada más que hacer en ella.';
  end if;
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Todavía no es el día: este inventario fiscal se cuenta el %.', to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  if coalesce(p_terminado, true) then
    if not exists (select 1 from public.inv_fiscal_conteos where hoja_id = p_hoja and contado_por = v_yo) then
      raise exception 'Anota al menos un renglón antes de terminar tu hoja.';
    end if;
    insert into public.inv_fiscal_terminos (hoja_id, user_id) values (p_hoja, v_yo)
      on conflict (hoja_id, user_id) do nothing;
    -- Al volver a enviar, el OK de reabrir que tenía se acaba: la próxima vez hace falta otro.
    delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja and user_id = v_yo;
  else
    -- Reabrir pide el OK del fiscal.
    if exists (select 1 from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_yo)
       and not exists (select 1 from public.inv_fiscal_reaperturas r
                        where r.hoja_id = p_hoja and r.user_id = v_yo and r.autorizado_en is not null) then
      raise exception 'Para reabrir tu hoja hace falta el OK del fiscal. Pídeselo con «Pedir que me reabran la hoja».';
    end if;
    delete from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_yo;
    delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja and user_id = v_yo;
  end if;
end $$;
revoke all on function public.inv_fiscal_terminar(uuid, boolean) from public, anon;
grant execute on function public.inv_fiscal_terminar(uuid, boolean) to authenticated;


drop function if exists public.inv_fiscal_reabrir_pedir(uuid);
create function public.inv_fiscal_reabrir_pedir(p_hoja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_yo uuid := auth.uid(); v_estado text;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_estado is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if not exists (select 1 from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_yo) then
    raise exception 'Tu hoja no está terminada: ya puedes anotar.';
  end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then
    raise exception 'El fiscal ya culminó tu hoja: no hay nada más que hacer en ella.';
  end if;
  insert into public.inv_fiscal_reaperturas (hoja_id, user_id, pedido_en) values (p_hoja, v_yo, now())
    on conflict (hoja_id, user_id) do update set pedido_en = coalesce(public.inv_fiscal_reaperturas.pedido_en, now());
end $$;
revoke all on function public.inv_fiscal_reabrir_pedir(uuid) from public, anon;
grant execute on function public.inv_fiscal_reabrir_pedir(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. SIGUIENTE CALLE: NADA SE QUEDA ABIERTO EN LA ANTERIOR
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_siguiente_calle(uuid, text);
create function public.inv_fiscal_siguiente_calle(p_hoja uuid, p_calle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text; v_calle text := nullif(upper(btrim(coalesce(p_calle, ''))), ''); v_pend text;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Pasar a la siguiente calle requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if v_calle is null then raise exception 'Escoge la calle.'; end if;
  if length(v_calle) > 20 then raise exception 'La calle es demasiado larga.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_estado is null then raise exception 'Esa hoja no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  -- Todo lo contado en la calle de turno tiene que estar aprobado: así la calle anterior queda cerrada de verdad.
  select string_agg(m.modulo || ' (' || lower(m.motivo) || ')', ', ' order by m.modulo) into v_pend
    from public.inv_fiscal_modulos_pendientes(p_hoja) m;
  if v_pend is not null then
    raise exception 'Antes de pasar a la siguiente calle hay que dejar aprobado todo lo de esta. Falta: %.', v_pend;
  end if;

  update public.inv_fiscal_hojas set calle = v_calle, cerrada_en = null, cerrada_por = null where id = p_hoja;
  delete from public.inv_fiscal_terminos where hoja_id = p_hoja;
  -- Ningún OK de reabrir de la calle anterior sirve en la nueva.
  delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja;
end $$;
revoke all on function public.inv_fiscal_siguiente_calle(uuid, text) from public, anon;
grant execute on function public.inv_fiscal_siguiente_calle(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. CULMINAR
-- ---------------------------------------------------------------------
-- ¿Lo que bajó a La base es igual a lo aprobado? Devuelve null si cuadra; si no, dice qué no cuadra.
drop function if exists public.inv_fiscal_hoja_cuadra(uuid);
create function public.inv_fiscal_hoja_cuadra(p_hoja uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_num integer; v_conteo uuid; v_esp numeric; v_base numeric;
begin
  select h.numero, h.conteo_id into v_num, v_conteo from public.inv_fiscal_hojas h where h.id = p_hoja;
  if v_num is null then return 'Esa hoja no existe.'; end if;
  select coalesce(sum(coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0)), 0)
    into v_esp
    from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja
     and public.inv_fiscal_modulo_aprobado(p_hoja, c.ubicacion_id)
     and c.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, c.ubicacion_id);
  select coalesce(sum(l.cantidad_contada), 0) into v_base from public.conteo_lineas l where l.conteo_id = v_conteo;
  if v_esp <> v_base then
    return 'en la hoja ' || v_num || ' lo que bajó a La base (' || v_base || ' cajas) no es lo aprobado (' || v_esp || ' cajas)';
  end if;
  return null;
end $$;
revoke all on function public.inv_fiscal_hoja_cuadra(uuid) from public, anon, authenticated;

-- Culminar UNA hoja (una pareja): solo si todo lo contado en ella está aprobado. Pasa lo aprobado a La base y comprueba que cuadre.
drop function if exists public.inv_fiscal_cerrar_hoja(uuid);
create function public.inv_fiscal_cerrar_hoja(p_hoja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_motivo text;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Culminar una hoja requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then return; end if;
  v_motivo := public.inv_fiscal_hoja_motivo_no_cierra(p_hoja);
  if v_motivo is not null then raise exception 'No se puede culminar la hoja: %', v_motivo; end if;
  begin
    perform public.inv_fiscal_consolidar(p_hoja);
  exception when others then
    if sqlerrm not ilike '%nada que consolidar%' then raise; end if;
  end;
  v_motivo := public.inv_fiscal_hoja_cuadra(p_hoja);
  if v_motivo is not null then raise exception 'No se puede culminar la hoja: %.', v_motivo; end if;
  update public.inv_fiscal_hojas set cerrada_en = now(), cerrada_por = auth.uid() where id = p_hoja;
  delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja;
end $$;
revoke all on function public.inv_fiscal_cerrar_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_cerrar_hoja(uuid) to authenticated;

-- Qué quedó pendiente (para mostrarlo antes de culminar). Una fila por módulo sin aprobar; las hojas sin ningún renglón salen
-- como aviso (bloquea = false): culminar las cierra, pero conviene saberlo.
drop function if exists public.inv_fiscal_pendientes(uuid, uuid);
create function public.inv_fiscal_pendientes(p_fiscal uuid, p_hoja uuid default null)
returns table (hoja integer, calle text, modulo text, motivo text, personas text, bloquea boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare h record; r record; v_n integer;
begin
  if not public.puede_ver('/inventario/fiscal') then return; end if;
  for h in
    select x.id as hid, x.numero as num, x.calle as cll from public.inv_fiscal_hojas x
     where x.fiscal_id = p_fiscal and x.cerrada_en is null and (p_hoja is null or x.id = p_hoja)
     order by x.numero
  loop
    v_n := 0;
    for r in select mp.modulo as mdl, mp.motivo as mtv from public.inv_fiscal_modulos_pendientes(h.hid) mp loop
      v_n := v_n + 1;
      hoja := h.num; calle := h.cll; modulo := r.mdl; motivo := r.mtv; bloquea := true;
      personas := (
        select string_agg(p.nombre || case when exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.hid and t.user_id = mi.user_id)
                                           then ' (envió)' else ' (contando)' end, ', ' order by mi.equipo)
          from public.inv_fiscal_miembros mi join public.perfiles p on p.id = mi.user_id
         where mi.hoja_id = h.hid
           and exists (select 1 from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
                        where c.hoja_id = h.hid and c.contado_por = mi.user_id
                          and regexp_replace(u.clave, '_(IZQ|DER)$', '') = r.mdl));
      return next;
    end loop;
    if v_n = 0
       and not exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = h.hid)
       and not exists (select 1 from public.inv_fiscal_revisiones rv where rv.hoja_id = h.hid) then
      hoja := h.num; calle := h.cll; modulo := null; motivo := 'Sin renglones contados'; bloquea := false;
      personas := (select string_agg(p.nombre, ', ' order by mi.equipo)
                     from public.inv_fiscal_miembros mi join public.perfiles p on p.id = mi.user_id where mi.hoja_id = h.hid);
      return next;
    end if;
  end loop;
end $$;
revoke all on function public.inv_fiscal_pendientes(uuid, uuid) from public, anon;
grant execute on function public.inv_fiscal_pendientes(uuid, uuid) to authenticated;

-- Culminar TODO el fiscal: solo si no queda NINGÚN módulo sin aprobar. No aprueba nada por su cuenta.
drop function if exists public.inv_fiscal_cerrar_todo(uuid);
create function public.inv_fiscal_cerrar_todo(p_fiscal uuid)
returns table (cerradas integer, modulos_forzados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text; h record; v_cerr integer := 0; v_n integer; v_lista text; v_dif text;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Culminar el fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select f.estado into v_estado from public.inv_fiscales f where f.id = p_fiscal;
  if v_estado is null then raise exception 'Ese inventario fiscal no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;

  select count(*), string_agg('hoja ' || p.hoja || ' · ' || p.modulo, ', ' order by p.hoja, p.modulo)
    into v_n, v_lista
    from public.inv_fiscal_pendientes(p_fiscal) p where p.bloquea;
  if v_n > 0 then
    raise exception 'No se puede culminar: % % sin aprobar (%).', v_n, case when v_n = 1 then 'módulo' else 'módulos' end, v_lista;
  end if;

  for h in select x.id as hid, x.numero as num from public.inv_fiscal_hojas x
            where x.fiscal_id = p_fiscal and x.cerrada_en is null order by x.numero loop
    begin
      perform public.inv_fiscal_consolidar(h.hid);
    exception when others then
      if sqlerrm not ilike '%nada que consolidar%' then raise; end if;
    end;
    v_dif := public.inv_fiscal_hoja_cuadra(h.hid);
    if v_dif is not null then raise exception 'No se puede culminar: %.', v_dif; end if;
    update public.inv_fiscal_hojas set cerrada_en = now(), cerrada_por = auth.uid() where id = h.hid;
    delete from public.inv_fiscal_reaperturas where hoja_id = h.hid;
    v_cerr := v_cerr + 1;
  end loop;
  return query select v_cerr, 0;
end $$;
revoke all on function public.inv_fiscal_cerrar_todo(uuid) from public, anon;
grant execute on function public.inv_fiscal_cerrar_todo(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. «FINALIZADA» PARA QUIEN CUENTA
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_mis_hojas();
create function public.inv_fiscal_mis_hojas()
returns table (
  fiscal_id uuid, nombre text, fecha date, hoja integer, equipo text,
  pareja text, pareja_equipo text,
  hoja_id uuid, puede_contar boolean, mis_renglones bigint,
  termine boolean, pareja_termino boolean, calle text, finalizada boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.nombre, f.fecha, h.numero, m.equipo,
         p.nombre, o.equipo,
         h.id,
         (f.fecha <= (now() at time zone 'America/Bogota')::date),
         (select count(*) from public.inv_fiscal_conteos c where c.hoja_id = h.id and c.contado_por = auth.uid()),
         (h.cerrada_en is not null or exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.id and t.user_id = auth.uid())),
         (h.cerrada_en is not null or exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.id and t.user_id = o.user_id)),
         h.calle,
         (h.cerrada_en is not null)
    from public.inv_fiscal_miembros m
    join public.inv_fiscales f on f.id = m.fiscal_id
    join public.inv_fiscal_hojas h on h.id = m.hoja_id
    left join public.inv_fiscal_miembros o on o.hoja_id = m.hoja_id and o.user_id <> m.user_id
    left join public.perfiles p on p.id = o.user_id
   where m.user_id = auth.uid()
     and f.publicado_en is not null
     and f.estado = 'abierto'
     and f.fecha >= (now() at time zone 'America/Bogota')::date
   order by f.fecha, h.numero
$$;
revoke all on function public.inv_fiscal_mis_hojas() from public, anon;
grant execute on function public.inv_fiscal_mis_hojas() to authenticated;


do $$
begin
  if to_regprocedure('public.inv_fiscal_pendientes(uuid,uuid)') is null
     or to_regprocedure('public.inv_fiscal_cerrar_todo(uuid)') is null
     or to_regprocedure('public.inv_fiscal_cerrar_hoja(uuid)') is null
     or to_regprocedure('public.inv_fiscal_siguiente_calle(uuid,text)') is null
     or to_regprocedure('public.inv_fiscal_mis_hojas()') is null then
    raise exception 'Faltó crear alguna función de culminar: revisa este archivo.';
  end if;
end $$;

commit;


-- =====================================================================
-- INVENTARIO FISCAL · LAS UNIDADES SUELTAS TAMBIÉN SON INVENTARIO
--
-- Hasta hoy el fiscal solo guardaba cajas enteras: si en un módulo había 20 cajas y
-- 5 botellas sueltas, las 5 se perdían. Ahora cada renglón puede llevar
-- «unidades sueltas» (menos de una caja) y cuentan en TODO el recorrido:
--   · se anotan en la hoja (Contar) y se ven en el borrador y en la BD del fiscal;
--   · el cruce, las diferencias, la compensación, la aprobación y el cuadre con La base
--     comparan en UNIDADES EXACTAS (cajas × unidades por caja + sueltas): 20 cajas y 5
--     sueltas NO es lo mismo que 20 cajas y 7;
--   · al aprobar, las sueltas bajan a La base (conteo_lineas.unidades) y salen en las planillas.
--
-- Requiere (en este orden): 2026-10-fiscal-TODO.sql, 2026-10-fiscal-conciliar-ol.sql,
-- 2026-11-fiscal-culminar.sql. Se puede correr varias veces.
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('public.inv_fiscal_hoja_cuadra(uuid)') is null then
    raise exception 'Falta correr antes 2026-11-fiscal-culminar.sql (que va después de 2026-10-fiscal-TODO.sql y 2026-10-fiscal-conciliar-ol.sql).';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS
-- ---------------------------------------------------------------------
alter table public.inv_fiscal_conteos add column if not exists unidades integer;
alter table public.inv_fiscal_conteos drop constraint if exists inv_fiscal_conteos_unidades_ok;
alter table public.inv_fiscal_conteos add constraint inv_fiscal_conteos_unidades_ok check (unidades is null or unidades >= 0);
alter table public.conteo_lineas add column if not exists unidades integer;
comment on column public.inv_fiscal_conteos.unidades is 'Unidades sueltas (menos de una caja) contadas junto a las cajas. Se suman a lo contado en unidades exactas.';
comment on column public.conteo_lineas.unidades is 'Unidades sueltas (menos de una caja) del renglón; vienen del inventario fiscal.';

-- ---------------------------------------------------------------------
-- 2. LA CUENTA EXACTA
--    «Unidades por caja» de un material (1 si no se sabe) y el total de un renglón en UNIDADES:
--    (estibas × cajas por estiba + saldo + cajas) × unidades por caja + sueltas.
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_upc(p_upc numeric) returns integer
language sql immutable as $$ select greatest(coalesce(nullif(p_upc, 0), 1), 1)::integer $$;

create or replace function public.inv_fiscal_tu(p_estibas numeric, p_saldo numeric, p_cajas numeric, p_unidades numeric, p_cpe numeric, p_upc numeric)
returns bigint language sql immutable as $$
  select (((coalesce(p_cpe, 0) * coalesce(p_estibas, 0) + coalesce(p_saldo, 0) + coalesce(p_cajas, 0)) * public.inv_fiscal_upc(p_upc))
          + coalesce(p_unidades, 0))::bigint
$$;
grant execute on function public.inv_fiscal_upc(numeric) to authenticated;
grant execute on function public.inv_fiscal_tu(numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- inv_fiscal_cruce_filas: se compara en unidades exactas
create or replace function public.inv_fiscal_cruce_filas(p_hoja uuid)
returns table (ubicacion_id uuid, estado text)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, c.equipo,
           sum(public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja))::bigint as cajas
      from public.inv_fiscal_conteos c
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     group by c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, c.equipo
  ), o as (select * from t where equipo = 'OL'), b as (select * from t where equipo = 'BAVARIA')
  select coalesce(o.ubicacion_id, b.ubicacion_id),
         case when o.cajas is null then 'SOLO_BAVARIA' when b.cajas is null then 'SOLO_OL'
              when o.cajas = b.cajas then 'COINCIDE' else 'DIFIERE' end
    from o full join b
      on o.ubicacion_id = b.ubicacion_id and o.producto_id = b.producto_id
     and coalesce(o.venc_dia, 0) = coalesce(b.venc_dia, 0)
     and coalesce(o.venc_mes, 0) = coalesce(b.venc_mes, 0)
     and coalesce(o.venc_anio, 0) = coalesce(b.venc_anio, 0)
$$;

-- inv_fiscal_mis_diferencias: se compara en unidades exactas
create or replace function public.inv_fiscal_mis_diferencias(p_hoja uuid)
returns table (conteo_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select m.equipo from public.inv_fiscal_miembros m where m.hoja_id = p_hoja and m.user_id = auth.uid()
  ), t as (
    select c.id, c.contado_por, c.equipo, c.producto_id,
           regexp_replace(u.clave, '_(IZQ|DER)$', '') as modulo,
           c.estado_envase as ee, c.averia as av, c.pnc as pn,
           public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja) as cajas
      from public.inv_fiscal_conteos c
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
  ), g as (
    -- Se compara módulo, código y estado (sin la fecha de vencimiento).
    select modulo, producto_id, ee, av, pn, equipo, sum(cajas) as cajas from t group by 1, 2, 3, 4, 5, 6
  )
  select t.id
    from t
    join yo on yo.equipo = t.equipo
   where t.contado_por = auth.uid()
     and not exists (
       select 1 from g mi join g otro
         on otro.modulo = mi.modulo and otro.producto_id = mi.producto_id and otro.ee is not distinct from mi.ee and otro.av = mi.av and otro.pn = mi.pn
        and otro.equipo <> mi.equipo
       where mi.modulo = t.modulo and mi.producto_id = t.producto_id and mi.ee is not distinct from t.ee and mi.av = t.av and mi.pn = t.pn
         and mi.equipo = t.equipo and otro.cajas = mi.cajas
     )
$$;

-- inv_fiscal_modulo_difiere: se compara en unidades exactas
create or replace function public.inv_fiscal_modulo_difiere(p_hoja uuid, p_ubi uuid, p_compensar boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select regexp_replace(u.clave, '_(IZQ|DER)$', '') as modulo, c.producto_id,
           c.estado_envase as ee, c.averia as av, c.pnc as pn, c.equipo, public.inv_fiscal_upc(p.unidades_por_caja) as upc,
           public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja) as cajas
      from public.inv_fiscal_conteos c
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
  ), g0 as (
    -- Sin fecha de vencimiento: se compara módulo, código y estado. Se calcula para TODA la hoja (la compensación mira otros módulos).
    select modulo, producto_id, ee, av, pn, max(upc) as upc,
           sum(case when equipo = 'OL' then cajas end) as co, sum(case when equipo = 'BAVARIA' then cajas end) as cb,
           coalesce(sum(case when equipo = 'OL' then cajas end), 0) - coalesce(sum(case when equipo = 'BAVARIA' then cajas end), 0) as dif
      from t
     group by 1, 2, 3, 4, 5
  ), g as (
    -- dc: la diferencia en CAJAS (con decimales si hay sueltas). Para emparejar materiales distintos se compara en cajas, como siempre;
    -- el mismo material se compara en unidades exactas (dif).
    select g0.*, round(g0.dif::numeric / g0.upc, 9) as dc from g0
  )
  -- Con «compensar», una diferencia no cuenta si (a) hay otra igual y de signo contrario en el mismo módulo, o (b) el MISMO
  -- material (mismo código y misma cantidad, sin mirar avería ni estado) tiene la diferencia contraria en otro módulo de la hoja (uno lo contó en un sitio y el otro en el de al lado).
  select exists (
    select 1 from g
     where g.modulo = (select regexp_replace(u2.clave, '_(IZQ|DER)$', '') from public.ubicaciones u2 where u2.id = p_ubi)
       and (g.co is null or g.cb is null or g.co <> g.cb)
       and not (coalesce(p_compensar, false)
                and ((select count(*) from g g2 where g2.modulo = g.modulo and g2.dc = g.dc)
                       = (select count(*) from g g3 where g3.modulo = g.modulo and g3.dc = -g.dc)
                     or exists (select 1 from g g4
                                 where g4.modulo <> g.modulo and g4.producto_id = g.producto_id and g4.dc = -g.dc)
                     -- (c) el mismo código que en TOTAL cuadra en toda la hoja (la suma de sus diferencias es 0)
                     or (select count(*) from g g5 where g5.producto_id = g.producto_id and (g5.co is null or g5.cb is null or g5.co <> g5.cb)) > 1
                        and (select sum(g6.dif) from g g6 where g6.producto_id = g.producto_id) = 0))
  )
$$;

-- inv_fiscal_cruce: en unidades exactas; entrega cajas + sueltas de cada equipo
drop function if exists public.inv_fiscal_cruce(uuid);
create function public.inv_fiscal_cruce(p_hoja uuid)
returns table (
  ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  venc_dia smallint, venc_mes smallint, venc_anio smallint,
  cajas_ol bigint, cajas_bavaria bigint, diferencia bigint, estado text, estado_envase text, averia boolean, pnc boolean,
  unidades_ol bigint, unidades_bavaria bigint, dif_unidades bigint, unidades_por_caja integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Cruzar el inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if not exists (select 1 from public.inv_fiscal_hojas where id = p_hoja) then
    raise exception 'Esa hoja no existe.';
  end if;
  if (select count(distinct m.equipo)
        from public.inv_fiscal_miembros m
        join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
       where m.hoja_id = p_hoja) < 1 then
    raise exception 'El cruce se hace cuando al menos una persona de la hoja terminó de contar.';
  end if;

  return query
  with t as (
    -- La fecha de vencimiento NO es parte de lo que se compara (daría diferencias de más): se compara sitio, código y estado.
    -- Se muestra la fecha más próxima de las anotadas.
    select c.ubicacion_id, c.producto_id, c.estado_envase, c.averia, c.pnc, m.equipo,
           min(case when c.venc_dia is not null then c.venc_anio * 10000 + c.venc_mes * 100 + c.venc_dia end) as venc,
           sum(public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja))::bigint as cajas,
           max(public.inv_fiscal_upc(p.unidades_por_caja)) as upc
      from public.inv_fiscal_conteos c
      join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     group by c.ubicacion_id, c.producto_id, c.estado_envase, c.averia, c.pnc, m.equipo
  ), o as (select * from t where equipo = 'OL'), b as (select * from t where equipo = 'BAVARIA'),
  j as (
    select coalesce(o.ubicacion_id, b.ubicacion_id) as ubi, coalesce(o.producto_id, b.producto_id) as prod,
           least(o.venc, b.venc) as vc,
           coalesce(o.estado_envase, b.estado_envase) as ee, coalesce(o.averia, b.averia) as av, coalesce(o.pnc, b.pnc) as pn, o.cajas as co, b.cajas as cb, coalesce(o.upc, b.upc) as upc
      from o full join b
        on o.ubicacion_id = b.ubicacion_id and o.producto_id = b.producto_id
       and o.estado_envase is not distinct from b.estado_envase
       and o.averia = b.averia and o.pnc = b.pnc
  )
  select j.ubi, u.clave, j.prod, pr.sku, pr.nombre,
         (j.vc % 100)::smallint, ((j.vc / 100) % 100)::smallint, (j.vc / 10000)::smallint, j.co / j.upc, j.cb / j.upc,
         ((coalesce(j.co, 0) - coalesce(j.cb, 0)) / j.upc)::bigint,
         case when j.co is null then 'SOLO_BAVARIA'
              when j.cb is null then 'SOLO_OL'
              when j.co = j.cb then 'COINCIDE'
              else 'DIFIERE' end,
         j.ee, j.av, j.pn,
         j.co % j.upc, j.cb % j.upc, (coalesce(j.co, 0) - coalesce(j.cb, 0))::bigint, j.upc
    from j
    join public.ubicaciones u on u.id = j.ubi
    join public.productos pr on pr.id = j.prod
   order by (case when j.co is not null and j.cb is not null and j.co = j.cb then 1 else 0 end), u.clave, pr.sku, j.vc;
end $$;
revoke all on function public.inv_fiscal_cruce(uuid) from public, anon;
grant execute on function public.inv_fiscal_cruce(uuid) to authenticated;

-- inv_fiscal_contar_mios: trae las sueltas
drop function if exists public.inv_fiscal_contar_mios(uuid);
create function public.inv_fiscal_contar_mios(p_hoja uuid)
returns table (
  id uuid, ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  estibas integer, saldo integer, cajas integer, total_cajas bigint,
  venc_dia smallint, venc_mes smallint, venc_anio smallint, nota text, contado_en timestamptz, estado_envase text,
  averia boolean, pnc boolean, pnc_rotulo boolean, pnc_bloqueo_mecanico boolean, en_base boolean,
  unidades integer, unidades_por_caja integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.ubicacion_id, u.clave, c.producto_id, p.sku, p.nombre,
         c.estibas, c.saldo, c.cajas,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.venc_dia, c.venc_mes, c.venc_anio, c.nota, c.contado_en, c.estado_envase,
         c.averia, c.pnc, c.pnc_rotulo, c.pnc_bloqueo_mecanico,
         (exists (select 1 from public.inv_fiscal_hojas h
                    join public.conteo_lineas cl on cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id
                   where h.id = c.hoja_id)
          or public.inv_fiscal_modulo_resuelto(c.hoja_id, c.ubicacion_id)),
         c.unidades, p.unidades_por_caja::integer
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.contado_por = auth.uid()
   order by c.contado_en desc
$$;
revoke all on function public.inv_fiscal_contar_mios(uuid) from public, anon;
grant execute on function public.inv_fiscal_contar_mios(uuid) to authenticated;

-- inv_fiscal_bd_hoja: trae las sueltas
drop function if exists public.inv_fiscal_bd_hoja(uuid);
create function public.inv_fiscal_bd_hoja(p_hoja uuid)
returns table (
  id uuid, equipo text, persona text, contado_en timestamptz, ubicacion_id uuid, ubicacion text, modulo text,
  sku text, material text, venc_dia integer, venc_mes integer, venc_anio integer,
  estibas integer, saldo integer, cajas integer, cajas_por_estiba integer, total_cajas bigint,
  estado_envase text, averia boolean, pnc boolean, nota text, ruta text, en_base boolean,
  unidades integer, unidades_por_caja integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'La BD del fiscal requiere el permiso «Inventario fiscal»';
  end if;
  return query
  select c.id, c.equipo::text, pe.nombre::text, c.contado_en, c.ubicacion_id, u.clave::text,
         regexp_replace(u.clave, '_(IZQ|DER)$', '')::text,
         p.sku::text, p.nombre::text, c.venc_dia::integer, c.venc_mes::integer, c.venc_anio::integer,
         coalesce(c.estibas, 0)::integer, coalesce(c.saldo, 0)::integer, coalesce(c.cajas, 0)::integer, coalesce(p.cajas_por_estiba, 0)::integer,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.estado_envase::text, coalesce(c.averia, false), coalesce(c.pnc, false), c.nota::text,
         (select f.ruta::text from public.inv_fiscal_fotos f where f.conteo_id = c.id limit 1),
         (exists (select 1 from public.inv_fiscal_hojas h
                    join public.conteo_lineas cl on cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id
                   where h.id = c.hoja_id)
          or public.inv_fiscal_modulo_resuelto(c.hoja_id, c.ubicacion_id)),
         coalesce(c.unidades, 0)::integer, coalesce(p.unidades_por_caja, 0)::integer
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
    left join public.perfiles pe on pe.id = c.contado_por
   where c.hoja_id = p_hoja
   order by u.clave, p.sku, c.equipo, c.contado_en;
end $$;
revoke all on function public.inv_fiscal_bd_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_bd_hoja(uuid) to authenticated;

-- inv_fiscal_borradores_base: las sueltas viajan con cada renglón
create or replace function public.inv_fiscal_borradores_base()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_filas jsonb; v_conteos jsonb;
begin
  if not public.puede_ver('/inventario/fiscal') then
    return jsonb_build_object('filas', '[]'::jsonb, 'conteos', '[]'::jsonb);
  end if;
  with b as (
    select c.id, h.id as hoja_id, h.numero, f.fecha, c.ubicacion_id, c.producto_id, c.estibas, c.saldo, c.cajas, c.unidades,
           c.venc_dia, c.venc_mes, c.venc_anio, c.averia, c.pnc, c.estado_envase, c.nota, c.contado_en,
           u.clave, u.calle, u.modulo, u.lado, p.sku, p.nombre as material, p.tipo_material, p.cajas_por_estiba, p.unidades_por_caja,
           pe.nombre as conto,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0) as total
      from public.inv_fiscal_conteos c
      join public.inv_fiscal_hojas h on h.id = c.hoja_id
      join public.inv_fiscales f on f.id = h.fiscal_id
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
      left join public.perfiles pe on pe.id = c.contado_por
     where f.estado = 'abierto'
       and not exists (select 1 from public.conteo_lineas cl where cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id)
        -- Ni lo de la otra persona de la pareja en un módulo que el fiscal ya aprobó: eso ya está en La base con el conteo definitivo.
        and not public.inv_fiscal_modulo_resuelto(h.id, c.ubicacion_id)
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'conteo_id', b.hoja_id,
      'conteo', 'FISCAL-' || to_char(b.fecha, 'YYYYMMDD') || '-H' || lpad(b.numero::text, 2, '0') || ' · en conteo',
      'estado', 'en_proceso', 'codigo', b.sku, 'material', b.material, 'tipo_material', b.tipo_material,
      'familia', null, 'factor_estibado', b.cajas_por_estiba,
      'ubicacion', b.clave, 'calle', b.calle, 'modulo', b.modulo, 'lado', b.lado,
      'estibas', b.estibas, 'cajas', b.cajas, 'saldo', b.saldo, 'unidades', b.unidades, 'unidades_por_caja', b.unidades_por_caja, 'total_cajas', b.total,
      'total_estibas', case when coalesce(b.cajas_por_estiba, 0) > 0 then round(b.total::numeric / b.cajas_por_estiba, 2) else 0 end,
      'capacidad', null, 'venc_dia', b.venc_dia, 'venc_mes', b.venc_mes, 'venc_anio', b.venc_anio,
      'fab_dia', null, 'fab_mes', null, 'fab_anio', null, 'fabricacion', null, 'vencimiento', null,
      'dias_para_vencer', null, 'dias_para_salir', null, 'rotacion', null,
      'averia', coalesce(b.averia, false), 'pnc', coalesce(b.pnc, false), 'estado_envase', b.estado_envase, 'nota', b.nota,
      'ubicacion_combinada', regexp_replace(b.clave, '_(IZQ|DER)$', ''), 'conto', b.conto, 'contado_en', b.contado_en,
      'producto_id', b.producto_id, 'ubicacion_id', b.ubicacion_id) order by b.contado_en desc) from b), '[]'::jsonb),
    coalesce((select jsonb_agg(x) from (
      select jsonb_build_object(
        'id', b.hoja_id,
        'codigo', 'FISCAL-' || to_char(b.fecha, 'YYYYMMDD') || '-H' || lpad(b.numero::text, 2, '0') || ' · en conteo',
        'estado', 'en_proceso', 'bodega', '', 'responsable', 'Inventario fiscal · Hoja ' || b.numero,
        'fecha_analisis', b.fecha, 'enviado_en', null, 'envio_nombre', null,
        'renglones', count(*), 'ubicaciones', count(distinct b.ubicacion_id), 'total_cajas', sum(b.total), 'unidades', coalesce(sum(b.unidades), 0)) as x
        from b group by b.hoja_id, b.numero, b.fecha) q), '[]'::jsonb)
  into v_filas, v_conteos;
  return jsonb_build_object('filas', v_filas, 'conteos', v_conteos);
end $$;

-- inv_fiscal_consolidados
drop function if exists public.inv_fiscal_consolidados(uuid);
create function public.inv_fiscal_consolidados(p_fiscal uuid)
returns table (hoja_id uuid, numero integer, conteo text, ubicaciones integer, renglones integer, cajas bigint, enviado_en timestamptz, unidades bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'Ver lo consolidado del inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query
  select h.id, h.numero, c.codigo,
         count(distinct cl.ubicacion_id)::integer, count(cl.id)::integer,
         coalesce(sum(coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0) + coalesce(cl.cajas, 0) + coalesce(cl.saldo, 0)), 0)::bigint,
         c.enviado_en,
         coalesce(sum(coalesce(cl.unidades, 0)), 0)::bigint
    from public.inv_fiscal_hojas h
    join public.conteos c on c.id = h.conteo_id
    left join public.conteo_lineas cl on cl.conteo_id = c.id
    left join public.productos p on p.id = cl.producto_id
   where h.fiscal_id = p_fiscal
   group by h.id, h.numero, c.codigo, c.enviado_en
   order by h.numero;
end $$;
revoke all on function public.inv_fiscal_consolidados(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidados(uuid) to authenticated;

-- inv_fiscal_consolidar: las sueltas bajan a La base
create or replace function public.inv_fiscal_consolidar(p_hoja uuid)
returns table (ubicaciones integer, renglones integer, sin_consolidar integer, conteo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_num integer; v_conteo uuid; v_fecha date; v_bodega uuid; v_codigo text;
  v_ok uuid[]; v_sin integer; v_ren integer; v_equipos integer; v_eq text := 'OL';
  rg record; v_lid uuid;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Consolidar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select h.numero, h.conteo_id, f.fecha into v_num, v_conteo, v_fecha
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_num is null then raise exception 'Esa hoja no existe.'; end if;

  -- ¿Terminó una sola persona? Entonces no hay cruce: lo aprobado se toma de la persona que terminó.
  select count(distinct m.equipo), coalesce(min(m.equipo), 'OL') into v_equipos, v_eq
    from public.inv_fiscal_miembros m
    join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
   where m.hoja_id = p_hoja;
  if v_equipos <> 1 then v_eq := 'OL'; end if;

  -- AHORA CADA MÓDULO SE TOMA POR SÍ SOLO (no por lo que terminó cada persona en la calle de turno): el conteo que el fiscal dejó
  -- como definitivo; si no escogió, el del operador; si el operador no contó ese módulo, el de Bavaria.
  -- Todo módulo APROBADO por el fiscal (coincida o no): ahí el fiscal ya concilió a las dos personas.
  v_ok := array(
    select r.ubicacion_id from public.inv_fiscal_revisiones r
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id)
       );
  select count(*) into v_sin from public.inv_fiscal_revisiones r
   where r.hoja_id = p_hoja and r.estado = 'APROBADA' and not (r.ubicacion_id = any (v_ok))
     and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id);

  if v_conteo is null then
    if coalesce(array_length(v_ok, 1), 0) = 0 then
      raise exception 'Todavía no hay ubicaciones aprobadas que coincidan en esta hoja: no hay nada que consolidar.';
    end if;
    select u.bodega_id into v_bodega from public.ubicaciones u where u.id = v_ok[1];
    v_codigo := 'FISCAL-' || to_char(v_fecha, 'YYYYMMDD') || '-H' || lpad(v_num::text, 2, '0');
    if exists (select 1 from public.conteos where codigo = v_codigo) then
      v_codigo := v_codigo || '-' || substr(p_hoja::text, 1, 4);
    end if;
    insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en, cerrado_en, enviado_por, enviado_en, nota)
    values (v_codigo, v_bodega, 'fefo', 'cerrado', v_yo, now(), now(), v_yo,
            ((v_fecha::timestamp + interval '12 hours') at time zone 'America/Bogota'),
            'Inventario fiscal · Hoja ' || v_num || case when v_equipos = 1 then ' · lo aprobado por el fiscal, contado por una sola persona (sin cruce)' else ' · lo aprobado por el fiscal (coincidente entre las dos personas, o el conteo que el fiscal dejó como definitivo)' end)
    returning id into v_conteo;
    update public.inv_fiscal_hojas set conteo_id = v_conteo where id = p_hoja;
  end if;

  -- Lo que ya no está aprobado y coincidente sale; lo que sí, se vuelve a poner tal cual está hoy.
  delete from public.conteo_lineas where conteo_id = v_conteo;
  delete from public.conteo_modulos where conteo_id = v_conteo;
  v_ren := 0;
  for rg in
    select c.id as cid, c.producto_id, c.ubicacion_id, c.estibas, c.cajas, c.saldo, c.unidades, c.venc_dia, c.venc_mes, c.venc_anio,
           c.averia, c.pnc, c.estado_envase, c.nota, c.contado_en, c.contado_por, c.pnc_rotulo, c.pnc_bloqueo_mecanico,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0) as total
      from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja and c.ubicacion_id = any (v_ok)
       -- De cada módulo se toma el conteo del equipo que el fiscal dejó como definitivo; si no escogió, el de la persona que terminó (o el del operador).
       and c.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, c.ubicacion_id)
     order by c.contado_en
  loop
    insert into public.conteo_lineas
      (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo, unidades, venc_dia, venc_mes, venc_anio,
       rotacion, averia, pnc, estado_envase, nota, cantidad_contada, contado_por, contado_en, pnc_rotulo, pnc_bloqueo_mecanico)
    values (v_conteo, rg.producto_id, rg.ubicacion_id, rg.estibas, rg.cajas, rg.saldo, rg.unidades, rg.venc_dia, rg.venc_mes, rg.venc_anio,
            null, rg.averia, rg.pnc, rg.estado_envase, rg.nota, rg.total, coalesce(rg.contado_por, v_yo), rg.contado_en, rg.pnc_rotulo, rg.pnc_bloqueo_mecanico)
    returning id into v_lid;
    -- La foto del renglón (si la hay) viaja con él a La base.
    insert into public.conteo_fotos (linea_id, conteo_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
    select v_lid, v_conteo, f.ruta, f.bytes, f.ancho, f.alto, f.tomada_en, f.lat, f.lng, f.precision_m, f.subida_por, f.subida_en
      from public.inv_fiscal_fotos f where f.conteo_id = rg.cid;
    v_ren := v_ren + 1;
  end loop;
  -- La hora real del conteo: del primer al último renglón que pasó (no la de quien aprueba).
  update public.conteos cn
     set iniciado_en = coalesce((select min(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.iniciado_en),
         cerrado_en  = coalesce((select max(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.cerrado_en)
   where cn.id = v_conteo;
  -- Mezclado / sin acceso de quien contó: de lo que pasó a La base y de los módulos donde nadie anotó renglones.
  insert into public.conteo_modulos (conteo_id, ubicacion_id, mezclado, sin_acceso, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, marcado_por, marcado_en)
  select v_conteo, m.ubicacion_id, m.mezclado, m.sin_acceso, m.ruta, m.bytes, m.ancho, m.alto, m.tomada_en, m.lat, m.lng, m.precision_m, m.user_id, m.marcado_en
    from public.inv_fiscal_modulos m
    join public.inv_fiscal_miembros mi on mi.hoja_id = m.hoja_id and mi.user_id = m.user_id
   where m.hoja_id = p_hoja
     and mi.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, m.ubicacion_id)
     and (m.ubicacion_id = any (v_ok)
          or not exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = m.ubicacion_id));

  return query select coalesce(array_length(v_ok, 1), 0), v_ren, v_sin,
                      (select cn.codigo from public.conteos cn where cn.id = v_conteo);
end $$;

-- inv_fiscal_hoja_cuadra: cuadra en unidades exactas
create or replace function public.inv_fiscal_hoja_cuadra(p_hoja uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_num integer; v_conteo uuid; v_esp numeric; v_base numeric;
begin
  select h.numero, h.conteo_id into v_num, v_conteo from public.inv_fiscal_hojas h where h.id = p_hoja;
  if v_num is null then return 'Esa hoja no existe.'; end if;
  select coalesce(sum(public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja)), 0)
    into v_esp
    from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja
     and public.inv_fiscal_modulo_aprobado(p_hoja, c.ubicacion_id)
     and c.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, c.ubicacion_id);
  select coalesce(sum(public.inv_fiscal_tu(l.estibas, l.saldo, l.cajas, l.unidades, p.cajas_por_estiba, p.unidades_por_caja)), 0) into v_base
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id where l.conteo_id = v_conteo;
  if v_esp <> v_base then
    return 'en la hoja ' || v_num || ' lo que bajó a La base (' || v_base || ' unidades en total, contando las sueltas) no es lo aprobado (' || v_esp || ' unidades)';
  end if;
  return null;
end $$;

-- inv_fiscal_contar_agregar: acepta las unidades sueltas (p_unidades)
drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean);
drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean, integer);
create function public.inv_fiscal_contar_agregar(
  p_hoja uuid, p_ubicacion uuid, p_producto uuid,
  p_estibas integer, p_saldo integer, p_cajas integer,
  p_dia smallint, p_mes smallint, p_anio smallint, p_nota text, p_estado text default null,
  p_averia boolean default false, p_pnc boolean default false, p_pnc_rotulo boolean default null, p_pnc_bloqueo boolean default null,
  p_unidades integer default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_fiscal uuid; v_estado text; v_pub timestamptz; v_fecha date;
  v_id uuid;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;

  select m.equipo, m.fiscal_id, f.estado, f.publicado_en, f.fecha
    into v_equipo, v_fiscal, v_estado, v_pub, v_fecha
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Todavía no es el día: este inventario fiscal se cuenta el %.', to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  if num_nonnulls(p_estibas, p_saldo, p_cajas) = 0 then raise exception 'Falta la cantidad.'; end if;
  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'Se cuentan estibas (con su saldo) o cajas, no las dos cosas.';
  end if;
  if coalesce(p_estibas, 0) < 0 or coalesce(p_saldo, 0) < 0 or coalesce(p_cajas, 0) < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if coalesce(p_unidades, 0) < 0 then raise exception 'Las cantidades no pueden ser negativas.'; end if;
  if coalesce(p_unidades, 0) > 0 then
    if p_cajas is null then raise exception 'Las unidades sueltas van junto a las cajas del renglón.'; end if;
    if coalesce((select pr.unidades_por_caja from public.productos pr where pr.id = p_producto), 0) <= 1 then
      raise exception 'Ese material no tiene «unidades por caja» en el maestro: cuéntalo por cajas.';
    end if;
    if p_unidades >= (select pr.unidades_por_caja from public.productos pr where pr.id = p_producto) then
      raise exception 'Las unidades sueltas son menos de una caja: pásalas a cajas.';
    end if;
  end if;
  if coalesce(p_averia, false) and coalesce(p_pnc, false) then raise exception 'Una estiba es avería o PNC, no las dos cosas.'; end if;
  if coalesce(p_pnc, false) and (p_pnc_rotulo is null or p_pnc_bloqueo is null) then
    raise exception 'El PNC pide dos respuestas: si tiene rótulo y si tiene bloqueo mecánico.';
  end if;
  if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
  if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then
    raise exception 'La fecha de vencimiento no es válida.';
  end if;

  begin
    insert into public.inv_fiscal_conteos
      (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, unidades, venc_dia, venc_mes, venc_anio, nota, estado_envase, averia, pnc, pnc_rotulo, pnc_bloqueo_mecanico)
    values
      (v_fiscal, p_hoja, v_equipo, v_yo, p_ubicacion, p_producto, p_estibas, p_saldo, p_cajas, nullif(p_unidades, 0), p_dia, p_mes, p_anio,
       nullif(btrim(coalesce(p_nota, '')), ''), nullif(btrim(coalesce(p_estado, '')), ''),
       coalesce(p_averia, false), coalesce(p_pnc, false),
       case when coalesce(p_pnc, false) then p_pnc_rotulo end, case when coalesce(p_pnc, false) then p_pnc_bloqueo end)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'No se pudo anotar el renglón.';
    when foreign_key_violation then
      raise exception 'Ese sitio o ese material no existe.';
  end;
  return v_id;
end $$;
revoke all on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean, integer) to authenticated;

-- inv_fiscal_contar_corregir: acepta las unidades sueltas (p_unidades)
drop function if exists public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean);
drop function if exists public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean, integer);
create function public.inv_fiscal_contar_corregir(
  p_id uuid, p_ubicacion uuid, p_producto uuid,
  p_estibas integer, p_saldo integer, p_cajas integer,
  p_dia smallint, p_mes smallint, p_anio smallint, p_nota text, p_estado text default null,
  p_averia boolean default false, p_pnc boolean default false, p_pnc_rotulo boolean default null, p_pnc_bloqueo boolean default null,
  p_unidades integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  c public.inv_fiscal_conteos%rowtype;
  v_estado text; v_pub timestamptz;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select * into c from public.inv_fiscal_conteos where id = p_id and contado_por = v_yo;
  if not found then raise exception 'Ese renglón no es tuyo o ya no existe.'; end if;
  select f.estado, f.publicado_en into v_estado, v_pub from public.inv_fiscales f where f.id = c.fiscal_id;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;

  -- Hoja terminada: solo se cambia lo que el fiscal mandó a validar y aún no respondiste (igual que anotar y quitar).
  if exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = c.hoja_id and t.user_id = v_yo) then
    if not exists (
      select 1 from public.inv_fiscal_revisiones r
       where r.hoja_id = c.hoja_id and r.ubicacion_id = c.ubicacion_id and r.estado = 'A_VALIDAR'
         and not exists (select 1 from public.inv_fiscal_revision_envios e
                          where e.hoja_id = r.hoja_id and e.ubicacion_id = r.ubicacion_id
                            and e.user_id = v_yo and e.ronda = r.ronda)
    ) then
      raise exception 'Ya terminaste tu hoja. Reábrela para corregir.';
    end if;
    if p_ubicacion <> c.ubicacion_id then raise exception 'Con la hoja terminada no se puede cambiar el sitio del renglón.'; end if;
  end if;

  if num_nonnulls(p_estibas, p_saldo, p_cajas) = 0 then raise exception 'Falta la cantidad.'; end if;
  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'Se cuentan estibas (con su saldo) o cajas, no las dos cosas.';
  end if;
  if coalesce(p_estibas, 0) < 0 or coalesce(p_saldo, 0) < 0 or coalesce(p_cajas, 0) < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if coalesce(p_unidades, 0) < 0 then raise exception 'Las cantidades no pueden ser negativas.'; end if;
  if coalesce(p_unidades, 0) > 0 then
    if p_cajas is null then raise exception 'Las unidades sueltas van junto a las cajas del renglón.'; end if;
    if coalesce((select pr.unidades_por_caja from public.productos pr where pr.id = p_producto), 0) <= 1 then
      raise exception 'Ese material no tiene «unidades por caja» en el maestro: cuéntalo por cajas.';
    end if;
    if p_unidades >= (select pr.unidades_por_caja from public.productos pr where pr.id = p_producto) then
      raise exception 'Las unidades sueltas son menos de una caja: pásalas a cajas.';
    end if;
  end if;
  if coalesce(p_averia, false) and coalesce(p_pnc, false) then raise exception 'Una estiba es avería o PNC, no las dos cosas.'; end if;
  if coalesce(p_pnc, false) and (p_pnc_rotulo is null or p_pnc_bloqueo is null) then
    raise exception 'El PNC pide dos respuestas: si tiene rótulo y si tiene bloqueo mecánico.';
  end if;
  if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
  if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then
    raise exception 'La fecha de vencimiento no es válida.';
  end if;

  begin
    update public.inv_fiscal_conteos set
      ubicacion_id = p_ubicacion, producto_id = p_producto,
      estibas = p_estibas, saldo = p_saldo, cajas = p_cajas, unidades = nullif(p_unidades, 0),
      venc_dia = p_dia, venc_mes = p_mes, venc_anio = p_anio,
      nota = nullif(btrim(coalesce(p_nota, '')), ''), estado_envase = nullif(btrim(coalesce(p_estado, '')), ''),
      averia = coalesce(p_averia, false), pnc = coalesce(p_pnc, false),
      pnc_rotulo = case when coalesce(p_pnc, false) then p_pnc_rotulo end,
      pnc_bloqueo_mecanico = case when coalesce(p_pnc, false) then p_pnc_bloqueo end
     where id = p_id;
  exception
    when unique_violation then raise exception 'No se pudo corregir el renglón.';
    when foreign_key_violation then raise exception 'Ese sitio o ese material no existe.';
  end;
end $$;
revoke all on function public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean, integer) to authenticated;

-- inv_fiscal_revision_enviar_modulo: los renglones nuevos pueden traer sueltas
create or replace function public.inv_fiscal_revision_enviar_modulo(p_hoja uuid, p_ubicaciones uuid[], p_renglones jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_fiscal uuid; v_estado text; v_pub timestamptz;
  v_lista uuid[]; v_ubi uuid; v_ronda integer; v_rev text; v_rondas integer[] := '{}'; v_i integer := 0;
  x jsonb; v_u uuid; v_est integer; v_sal integer; v_caj integer; v_uni integer; v_d smallint; v_m smallint; v_a smallint; v_prod uuid;
  v_keep uuid[] := '{}'; v_nuevos uuid[] := '{}'; v_nuevo uuid; v_desde uuid;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select m.equipo, m.fiscal_id, f.estado, f.publicado_en
    into v_equipo, v_fiscal, v_estado, v_pub
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if coalesce(array_length(p_ubicaciones, 1), 0) = 0 then raise exception 'Falta el módulo.'; end if;

  -- Solo las ubicaciones del módulo que el fiscal mandó a validar y que esta persona todavía no respondió.
  v_lista := array(select h from unnest(public.inv_fiscal_hermanas(p_ubicaciones)) h
                    where exists (select 1 from public.inv_fiscal_revisiones r
                                   where r.hoja_id = p_hoja and r.ubicacion_id = h and r.estado = 'A_VALIDAR'));
  if coalesce(array_length(v_lista, 1), 0) = 0 then raise exception 'El fiscal no te pidió validar ese módulo.'; end if;
  foreach v_ubi in array v_lista loop
    select r.ronda into v_ronda from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = v_ubi;
    if exists (select 1 from public.inv_fiscal_revision_envios e
                where e.hoja_id = p_hoja and e.ubicacion_id = v_ubi and e.user_id = v_yo and e.ronda = v_ronda) then
      raise exception 'Ya enviaste ese módulo. Espera a que el fiscal lo apruebe o lo mande otra vez.';
    end if;
    v_rondas := v_rondas || v_ronda;
  end loop;

  if p_renglones is not null then
    if jsonb_typeof(p_renglones) <> 'array' then raise exception 'Los renglones deben ir en una lista.'; end if;
    -- Los renglones que se conservan tal cual (con su foto) llegan solo con su «id»: no se tocan.
    v_keep := array(select (e->>'id')::uuid from jsonb_array_elements(p_renglones) e where nullif(e->>'id', '') is not null);
    for x in select * from jsonb_array_elements(p_renglones) loop
      if nullif(x->>'id', '') is not null then continue; end if;
      v_u := nullif(x->>'ubicacion_id', '')::uuid;
      if v_u is null or not (v_u = any (v_lista)) then raise exception 'A un renglón le falta el lado (izquierdo o derecho) de ese módulo.'; end if;
      v_prod := nullif(x->>'producto_id', '')::uuid;
      v_est := nullif(x->>'estibas', '')::integer; v_sal := nullif(x->>'saldo', '')::integer; v_caj := nullif(x->>'cajas', '')::integer; v_uni := nullif(x->>'unidades', '')::integer;
      v_d := nullif(x->>'dia', '')::smallint; v_m := nullif(x->>'mes', '')::smallint; v_a := nullif(x->>'anio', '')::smallint;
      if v_prod is null then raise exception 'A un renglón le falta el material.'; end if;
      if num_nonnulls(v_est, v_sal, v_caj) = 0 then raise exception 'A un renglón le falta la cantidad.'; end if;
      if v_caj is not null and (v_est is not null or v_sal is not null) then
        raise exception 'Se cuentan estibas (con su saldo) o cajas, no las dos cosas.';
      end if;
      if coalesce(v_est, 0) < 0 or coalesce(v_sal, 0) < 0 or coalesce(v_caj, 0) < 0 then
        raise exception 'Las cantidades no pueden ser negativas.';
      end if;
      if coalesce(v_uni, 0) < 0 then raise exception 'Las cantidades no pueden ser negativas.'; end if;
      if coalesce(v_uni, 0) > 0 and (v_caj is null or coalesce((select pr.unidades_por_caja from public.productos pr where pr.id = v_prod), 0) <= v_uni) then
        raise exception 'Las unidades sueltas van junto a las cajas y son menos de una caja.';
      end if;
      if num_nonnulls(v_d, v_m, v_a) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
      if v_d is not null and not (v_d between 1 and 31 and v_m between 1 and 12 and v_a between 0 and 99) then
        raise exception 'La fecha de vencimiento no es válida.';
      end if;
      begin
        insert into public.inv_fiscal_conteos
          (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, unidades, venc_dia, venc_mes, venc_anio, nota, estado_envase, averia, pnc, pnc_rotulo, pnc_bloqueo_mecanico)
        values (v_fiscal, p_hoja, v_equipo, v_yo, v_u, v_prod, v_est, v_sal, v_caj, nullif(v_uni, 0), v_d, v_m, v_a,
                nullif(btrim(coalesce(x->>'nota', '')), ''), nullif(btrim(coalesce(x->>'estado', '')), ''),
                coalesce((x->>'averia')::boolean, false), coalesce((x->>'pnc')::boolean, false),
                case when coalesce((x->>'pnc')::boolean, false) then (x->>'pnc_rotulo')::boolean end,
                case when coalesce((x->>'pnc')::boolean, false) then (x->>'pnc_bloqueo')::boolean end)
        returning id into v_nuevo;
        v_nuevos := v_nuevos || v_nuevo;
        -- Un renglón corregido conserva la foto del que reemplaza.
        v_desde := nullif(x->>'desde', '')::uuid;
        if v_desde is not null then
          update public.inv_fiscal_fotos set conteo_id = v_nuevo where conteo_id = v_desde and subida_por = v_yo;
        end if;
        -- Foto nueva tomada en el editor: reemplaza la que traía (o la pone si no tenía).
        if jsonb_typeof(x->'foto') = 'object' and nullif(btrim(coalesce(x->'foto'->>'ruta', '')), '') is not null then
          insert into public.inv_fiscal_fotos (conteo_id, hoja_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
          values (v_nuevo, p_hoja, x->'foto'->>'ruta', nullif(x->'foto'->>'bytes', '')::integer, nullif(x->'foto'->>'ancho', '')::integer,
                  nullif(x->'foto'->>'alto', '')::integer, nullif(x->'foto'->>'tomada', '')::timestamptz,
                  nullif(x->'foto'->>'lat', '')::numeric, nullif(x->'foto'->>'lng', '')::numeric, nullif(x->'foto'->>'precision', '')::numeric,
                  v_yo, now())
          on conflict (conteo_id) do update
            set ruta = excluded.ruta, bytes = excluded.bytes, ancho = excluded.ancho, alto = excluded.alto, tomada_en = excluded.tomada_en,
                lat = excluded.lat, lng = excluded.lng, precision_m = excluded.precision_m, subida_por = v_yo, subida_en = now();
        end if;
      exception
        when unique_violation then
          raise exception 'No se pudo guardar un renglón.';
        when foreign_key_violation then
          raise exception 'Ese material no existe.';
      end;
    end loop;
    -- Lo anterior que no se conservó ni se reemplazó se quita (su foto se va con él).
    delete from public.inv_fiscal_conteos
     where hoja_id = p_hoja and contado_por = v_yo and ubicacion_id = any (v_lista)
       and not (id = any (v_keep)) and not (id = any (v_nuevos));
  end if;

  foreach v_ubi in array v_lista loop
    v_i := v_i + 1;
    insert into public.inv_fiscal_revision_envios (hoja_id, ubicacion_id, user_id, ronda, enviado_en)
    values (p_hoja, v_ubi, v_yo, v_rondas[v_i], now())
    on conflict (hoja_id, ubicacion_id, user_id) do update set ronda = excluded.ronda, enviado_en = now();
  end loop;
end $$;

-- inv_fiscal_conteos (lo que contó cada persona, para el Excel)
drop function if exists public.inv_fiscal_conteos(uuid);
create function public.inv_fiscal_conteos(p_hoja uuid)
returns table (
  equipo text, persona text, ubicacion text, sku text, material text,
  cajas_por_estiba numeric, estibas integer, saldo integer, cajas integer, total_cajas bigint,
  venc_dia smallint, venc_mes smallint, venc_anio smallint, nota text, contado_en timestamptz,
  unidades integer, unidades_por_caja integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Ver lo que contó cada persona requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if not exists (select 1 from public.inv_fiscal_hojas where id = p_hoja) then
    raise exception 'Esa hoja no existe.';
  end if;
  if (select count(distinct m.equipo)
        from public.inv_fiscal_miembros m
        join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
       where m.hoja_id = p_hoja) < 2 then
    raise exception 'El cruce se hace cuando las dos personas de la hoja terminan de contar.';
  end if;

  return query
  select m.equipo, coalesce(pf.nombre, pf.usuario, '—'), u.clave, pr.sku, pr.nombre,
         pr.cajas_por_estiba::numeric, c.estibas, c.saldo, c.cajas,
         (coalesce(pr.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.venc_dia, c.venc_mes, c.venc_anio, c.nota, c.contado_en,
         c.unidades, pr.unidades_por_caja::integer
    from public.inv_fiscal_conteos c
    join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
    join public.perfiles pf on pf.id = c.contado_por
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos pr on pr.id = c.producto_id
   where c.hoja_id = p_hoja
   order by m.equipo desc, u.clave, pr.sku, c.venc_anio, c.venc_mes, c.venc_dia;
end $$;
revoke all on function public.inv_fiscal_conteos(uuid) from public, anon;
grant execute on function public.inv_fiscal_conteos(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- LA BASE: la vista del conteo trae las unidades sueltas (una columna más al final; lo demás queda igual)
-- ---------------------------------------------------------------------
do $$
declare d text;
begin
  if to_regclass('public.v_conteo_fefo') is null then
    raise notice 'No existe v_conteo_fefo: se omite.';
    return;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_conteo_fefo' and column_name = 'unidades') then
    return;
  end if;
  d := pg_get_viewdef('public.v_conteo_fefo'::regclass, true);
  if d !~* E'\\mFROM (public\\.)?conteo_lineas cl' then
    raise exception 'No pude agregar «unidades» a v_conteo_fefo: no reconozco su definición.';
  end if;
  d := regexp_replace(rtrim(d, E' \n;'), E'\\s+FROM (public\\.)?conteo_lineas cl', E',\n  cl.unidades\nFROM public.conteo_lineas cl', 'i');
  execute 'create or replace view public.v_conteo_fefo as ' || d;
end $$;

do $$
begin
  if to_regprocedure('public.inv_fiscal_tu(numeric,numeric,numeric,numeric,numeric,numeric)') is null
     or to_regprocedure('public.inv_fiscal_cruce(uuid)') is null
     or to_regprocedure('public.inv_fiscal_contar_agregar(uuid,uuid,uuid,integer,integer,integer,smallint,smallint,smallint,text,text,boolean,boolean,boolean,boolean,integer)') is null then
    raise exception 'No quedaron las funciones de las unidades sueltas del inventario fiscal.';
  end if;
  raise notice 'Listo: las unidades sueltas cuentan en el fiscal, el cruce, la aprobación, La base y las planillas.';
end $$;

commit;
select 'OK · unidades sueltas del fiscal listas' as resultado;
