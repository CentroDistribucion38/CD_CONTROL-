-- =====================================================================
-- INVENTARIO · EL CONTEO ES UN BORRADOR HASTA QUE SE ENVÍA
-- ---------------------------------------------------------------------
-- Cristian: «todo el conteo se va yendo para otra hoja como borrador
-- pero aún sin enviar, y cuando la persona culmine se va para allá,
-- valida si va a corregir algún registro, y luego enviar con fecha, hora
-- y nombre del usuario».
--
-- LOS RENGLONES SE SIGUEN GUARDANDO AL MOMENTO, y eso no cambia: un
-- borrador que viviera en el celular se perdería con la señal, y son
-- 152 renglones de una mañana. Lo que cambia es el ESTADO del conteo —
-- mientras se camina está `en_proceso`, o sea borrador; al terminar se
-- ENVÍA y queda `cerrado` con la firma de quien lo hizo.
--
-- ENVIAR NO TOCA EL KARDEX, y es a propósito. `cerrar_conteo` genera los
-- ajustes por diferencia, y eso solo tiene sentido cuando el conteo
-- cubrió TODA la bodega. Un recorrido FEFO normal es parcial —se caminan
-- los módulos que dio el turno— y ajustar el inventario con un conteo
-- parcial le restaría a cada producto lo que no se alcanzó a contar.
-- Enviar cierra y firma; ajustar el kardex sigue siendo un acto aparte y
-- explícito.
--
-- CORRER DESPUÉS DE 2026-09-inventario-fefo.sql.
-- Se puede correr varias veces.
-- =====================================================================

do $$
begin
  if to_regclass('public.ubicaciones') is null then
    raise exception
      'Falta la plantilla de conteo. Corre primero supabase/migraciones/2026-09-inventario-fefo.sql.';
  end if;
end $$;

-- QUIÉN Y CUÁNDO LO ENVIÓ. `responsable_id` dice de quién es el conteo
-- desde que se abre; esto dice quién le puso la firma al final, que no
-- siempre es lo mismo —un conteo se puede abrir a las 6 y enviar a las
-- 11— y es lo que hay que poder mostrar al lado del envío.
alter table public.conteos
  add column if not exists enviado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists enviado_en  timestamptz,
  add column if not exists nota_envio  text;

-- ---------------------------------------------------------------------
-- CORREGIR UN RENGLÓN
-- ---------------------------------------------------------------------
-- Se revisa antes de enviar, y ahí es donde aparecen los dedazos: la
-- estiba que eran 56 y no 65, la fecha del lote de al lado. Sin esto la
-- única salida era borrar y volver a teclear el renglón entero.
create or replace function public.conteo_fefo_editar(
  p_linea       uuid,
  p_sku         text,
  p_ubicacion   uuid,
  p_rotacion    boolean,
  p_estibas     integer  default null,
  p_cajas       integer  default null,
  p_venc_dia    smallint default null,
  p_venc_mes    smallint default null,
  p_venc_anio   smallint default null,
  p_averia      boolean  default false,
  p_pnc         boolean  default false,
  p_estado      text     default null,
  p_nota        text     default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conteo uuid; v_dueno uuid; v_estado estado_conteo; v_bodega uuid;
  v_prod uuid; v_tipo text; v_factor integer;
begin
  select l.conteo_id, c.responsable_id, c.estado, c.bodega_id
    into v_conteo, v_dueno, v_estado, v_bodega
    from public.conteo_lineas l join public.conteos c on c.id = l.conteo_id
   where l.id = p_linea;
  if v_conteo is null then raise exception 'Ese renglón no existe.'; end if;
  if v_dueno is distinct from auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  -- ENVIADO YA NO SE TOCA. La corrección es antes de firmar; después,
  -- cambiar un renglón sin dejar rastro sería cambiar lo que alguien ya
  -- dio por bueno.
  if v_estado <> 'en_proceso' then
    raise exception 'El conteo ya se envió: no se puede corregir.';
  end if;

  select id, tipo_material, cajas_por_estiba into v_prod, v_tipo, v_factor
    from public.productos where sku = p_sku and activo;
  if v_prod is null then
    raise exception 'El código % no está en el maestro.', p_sku;
  end if;
  if not exists (select 1 from public.ubicaciones
                  where id = p_ubicacion and bodega_id = v_bodega and activa) then
    raise exception 'Esa ubicación no es de esta bodega o está inactiva.';
  end if;
  if coalesce(p_estibas, 0) + coalesce(p_cajas, 0) <= 0 then
    raise exception 'Hay que anotar estibas o cajas.';
  end if;
  if p_estibas is not null and p_cajas is not null then
    raise exception 'Estibas o cajas, no las dos.';
  end if;
  if p_rotacion is null then raise exception 'Falta decir si rota.'; end if;
  if v_tipo = 'PRODUCTO' and p_venc_anio is null then
    raise exception 'Falta la fecha de vencimiento.';
  end if;

  update public.conteo_lineas set
    producto_id = v_prod, ubicacion_id = p_ubicacion,
    estibas = p_estibas, cajas = p_cajas,
    venc_dia = p_venc_dia, venc_mes = p_venc_mes, venc_anio = p_venc_anio,
    rotacion = p_rotacion,
    averia = coalesce(p_averia, false), pnc = coalesce(p_pnc, false),
    estado_envase = nullif(trim(coalesce(p_estado, '')), ''),
    nota = nullif(trim(coalesce(p_nota, '')), ''),
    cantidad_contada = coalesce(v_factor, 0) * coalesce(p_estibas, 0) + coalesce(p_cajas, 0),
    contado_por = auth.uid(), contado_en = now()
  where id = p_linea;
end $$;

-- ---------------------------------------------------------------------
-- ENVIAR
-- ---------------------------------------------------------------------
create or replace function public.conteo_fefo_enviar(p_conteo uuid, p_nota text default null)
returns table (renglones integer, enviado_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare v_dueno uuid; v_estado estado_conteo; v_n integer; v_cuando timestamptz;
begin
  select responsable_id, estado into v_dueno, v_estado
    from public.conteos where id = p_conteo;
  if v_estado is null then raise exception 'Ese conteo no existe.'; end if;
  if v_dueno is distinct from auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  if v_estado <> 'en_proceso' then raise exception 'Ese conteo ya se envió.'; end if;

  select count(*) into v_n from public.conteo_lineas where conteo_id = p_conteo;
  -- UN CONTEO VACÍO NO SE ENVÍA. Enviar cero renglones deja en la lista
  -- un recorrido firmado que dice que no había nada en la bodega, que es
  -- una afirmación muy distinta de «no alcancé a contar».
  if v_n = 0 then
    raise exception 'No hay nada que enviar: el conteo está vacío.';
  end if;

  v_cuando := now();
  update public.conteos
     set estado = 'cerrado', cerrado_en = v_cuando,
         enviado_por = auth.uid(), enviado_en = v_cuando,
         nota = coalesce(nullif(trim(coalesce(p_nota, '')), ''), nota)
   where id = p_conteo;

  return query select v_n, v_cuando;
end $$;

-- El nombre de quien envió, para poder mostrarlo al lado del conteo.
--
-- `drop` y no `create or replace`: la vista gana columnas en medio y
-- Postgres solo deja REEMPLAZAR una vista si las columnas viejas quedan
-- iguales y en el mismo orden. Con `replace` revienta con «cannot change
-- name of view column» y la migración no pasa ni la primera vez.
drop view if exists public.v_conteos_fefo;
create view public.v_conteos_fefo as
select
  c.id, c.codigo, c.estado, c.bodega_id, b.codigo as bodega,
  c.responsable_id,
  per.nombre                         as responsable,
  c.creado_en::date                  as fecha_analisis,
  c.iniciado_en, c.cerrado_en,
  c.enviado_en,
  env.nombre                         as envio_nombre,
  c.nota_envio,
  count(cl.id)                       as renglones,
  count(distinct cl.ubicacion_id)    as ubicaciones,
  coalesce(sum(coalesce(p.cajas_por_estiba,0)*coalesce(cl.estibas,0)
               + coalesce(cl.cajas,0)), 0)::bigint as total_cajas
from public.conteos c
join public.bodegas b on b.id = c.bodega_id
left join public.perfiles per on per.id = c.responsable_id
left join public.perfiles env on env.id = c.enviado_por
left join public.conteo_lineas cl on cl.conteo_id = c.id
left join public.productos p on p.id = cl.producto_id
where c.tipo = 'fefo'
group by c.id, c.codigo, c.estado, c.bodega_id, b.codigo, c.responsable_id,
         per.nombre, c.creado_en, c.iniciado_en, c.cerrado_en, c.enviado_en,
         env.nombre, c.nota_envio;

grant select on public.v_conteos_fefo to authenticated;
grant execute on function public.conteo_fefo_editar(uuid, text, uuid, boolean, integer, integer,
       smallint, smallint, smallint, boolean, boolean, text, text) to authenticated;
grant execute on function public.conteo_fefo_enviar(uuid, text) to authenticated;
