-- =====================================================================
-- INVENTARIO · LA FECHA DE UN FEFO ES LA DEL DÍA EN QUE SE ENVIÓ
--
-- «Estoy contando hoy 2 de octubre y la base dice que el recorrido vale
--  1 de octubre.»  Pasaba porque la fecha salía del día en que se ABRIÓ
-- el recorrido (y en hora UTC, que a las 7 p.m. de Colombia ya es el día
-- siguiente). Ahora:
--
--   · Un recorrido ya enviado vale el DÍA EN QUE SE ENVIÓ, en hora de
--     Colombia.
--   · Uno que todavía no se envía (borrador / en proceso) conserva el día
--     en que se abrió, también en hora de Colombia.
--
-- Los recorridos ya enviados que se abrieron un día y se enviaron otro
-- cambian solos de fecha: no hay que tocar nada.
--
-- «Cambiar la fecha de un FEFO» (el administrador) ahora mueve también el
-- día de envío, si ya estaba enviado: si no, la vista seguiría mostrando
-- el día del envío y el cambio no se notaría. Sigue sin borrar nada.
--
-- El CÓDIGO (FEFO-AAAAMMDD-NN) no cambia: dice el día en que se abrió.
-- Para que diga otro día está «Cambiar la fecha».
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create or replace view public.v_conteos_fefo as
select
  c.id, c.codigo, c.estado, c.bodega_id, b.codigo as bodega,
  c.responsable_id,
  per.nombre                         as responsable,
  coalesce((c.enviado_en at time zone 'America/Bogota')::date,
           (c.creado_en  at time zone 'America/Bogota')::date) as fecha_analisis,
  c.iniciado_en, c.cerrado_en,
  c.enviado_en,
  env.nombre                         as envio_nombre,
  c.nota_envio,
  count(cl.id)                       as renglones,
  count(distinct cl.ubicacion_id)    as ubicaciones,
  coalesce(sum(coalesce(p.cajas_por_estiba,0)*coalesce(cl.estibas,0)
               + coalesce(cl.cajas,0)
               + coalesce(cl.saldo,0)), 0)::bigint as total_cajas
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

drop function if exists public.conteo_fefo_cambiar_fecha(uuid, text, date);
create function public.conteo_fefo_cambiar_fecha(p_conteo uuid, p_codigo text, p_fecha date)
returns table (codigo_anterior text, codigo_nuevo text, fecha date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text; v_tipo text; v_hoy date; v_n int; v_nuevo text; v_medio timestamptz;
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede cambiar la fecha de un FEFO.';
  end if;
  if p_fecha is null then raise exception 'Falta la fecha.'; end if;
  v_hoy := (now() at time zone 'America/Bogota')::date;
  if p_fecha > v_hoy then raise exception 'La fecha no puede ser del futuro.'; end if;

  select c.codigo, c.tipo into v_codigo, v_tipo from public.conteos c where c.id = p_conteo for update;
  if v_codigo is null then raise exception 'Ese FEFO ya no existe.'; end if;
  if v_tipo <> 'fefo' then raise exception 'Eso no es un FEFO.'; end if;
  if v_codigo is distinct from btrim(coalesce(p_codigo, '')) then
    raise exception 'El código no coincide: pediste cambiar «%» y ese FEFO es «%». No se cambió nada.', coalesce(p_codigo, ''), v_codigo;
  end if;

  /* Mediodía de Colombia: así el día es el mismo en UTC y en Bogotá.
     Si el día elegido es hoy y aún no es mediodía, se usa «ahora»
     (un envío no puede quedar en el futuro). */
  v_medio := (to_char(p_fecha, 'YYYY-MM-DD') || ' 12:00:00-05')::timestamptz;
  update public.conteos set
    creado_en  = v_medio,
    enviado_en = case when enviado_en is null then null else least(v_medio, now()) end
   where id = p_conteo;

  /* Código nuevo: el siguiente número libre de ese día (solo si el código seguía el patrón de la fecha). */
  if v_codigo ~ '^FEFO-[0-9]{8}-[0-9]+$' then
    select count(*) into v_n from public.conteos c
     where c.tipo = 'fefo' and c.id <> p_conteo and c.codigo like 'FEFO-' || to_char(p_fecha, 'YYYYMMDD') || '-%';
    v_n := v_n + 1;
    loop
      v_nuevo := 'FEFO-' || to_char(p_fecha, 'YYYYMMDD') || '-' || lpad(v_n::text, 2, '0');
      exit when not exists (select 1 from public.conteos c where c.codigo = v_nuevo);
      v_n := v_n + 1;
    end loop;
    if v_codigo not like 'FEFO-' || to_char(p_fecha, 'YYYYMMDD') || '-%' then
      update public.conteos set codigo = v_nuevo where id = p_conteo;
    else
      v_nuevo := v_codigo;   -- ya decía ese día: no se renumera
    end if;
  else
    v_nuevo := v_codigo;
  end if;

  codigo_anterior := v_codigo; codigo_nuevo := v_nuevo; fecha := p_fecha;
  return next;
end $$;

revoke all on function public.conteo_fefo_cambiar_fecha(uuid, text, date) from public, anon;
grant execute on function public.conteo_fefo_cambiar_fecha(uuid, text, date) to authenticated;

do $$
begin
  if to_regprocedure('public.conteo_fefo_cambiar_fecha(uuid,text,date)') is null then
    raise exception 'No quedó la función de cambiar la fecha de un FEFO.';
  end if;
  raise notice 'Listo: la fecha de un FEFO es la del día en que se envió (hora de Colombia).';
end $$;

commit;
