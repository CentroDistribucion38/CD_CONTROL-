-- =====================================================================
-- AVERÍAS · ACCIONES DEL CONTEO
--
-- «Cuando guardan el conteo, en el módulo de averías quedan como acciones cargadas todo lo que se
--  identificó, para darle cierre.»
--
-- LA ACCIÓN NO SE COPIA: sale sola del conteo guardado (todo conteo FEFO que no esté en borrador ni
-- anulado), con la misma cuenta de las Evidencias. Cada avería, PNC, módulo mezclado y módulo sin
-- acceso es UNA acción. Aquí solo se guarda lo que le pasa después:
--   averias_acciones   estado (en_gestion | cerrada), qué se hizo, documento, comentario, quién y cuándo.
--   Sin renglón aquí = «Abierta».
--
--   averias_acciones_conteo(desde, hasta)   las novedades del conteo, con el permiso de esta pantalla
--                                           (quien cierra acciones no tiene por qué ver el tablero del conteo).
--
-- No toca el conteo, ni las averías registradas a mano, ni las Evidencias. Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.averias_acciones (
  clave           text primary key,           -- tipo:linea_id  ó  tipo:conteo_id:ubicacion_id (las de módulo)
  tipo            text not null check (tipo in ('averia', 'pnc', 'mezclado', 'sin_acceso')),
  conteo_id       uuid,
  linea_id        uuid,
  ubicacion_id    uuid,
  estado          text not null default 'en_gestion' check (estado in ('abierta', 'en_gestion', 'cerrada')),
  que_se_hizo     text,
  documento       text,
  comentario      text,
  gestion_por     uuid,
  gestion_en      timestamptz,
  cerrada_por     uuid,
  cerrada_en      timestamptz,
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists averias_acciones_estado on public.averias_acciones (estado);

alter table public.averias_acciones enable row level security;
drop policy if exists averias_acciones_ver on public.averias_acciones;
create policy averias_acciones_ver on public.averias_acciones for select
  using (public.mi_nivel_pantalla('/inventario/averias/acciones') <> 'ninguno');
drop policy if exists averias_acciones_ins on public.averias_acciones;
create policy averias_acciones_ins on public.averias_acciones for insert
  with check (public.mi_nivel_pantalla('/inventario/averias/acciones') = 'editar');
drop policy if exists averias_acciones_upd on public.averias_acciones;
create policy averias_acciones_upd on public.averias_acciones for update
  using (public.mi_nivel_pantalla('/inventario/averias/acciones') = 'editar');
drop policy if exists averias_acciones_del on public.averias_acciones;
create policy averias_acciones_del on public.averias_acciones for delete
  using (public.mi_nivel_pantalla('/inventario/averias/acciones') = 'editar');
grant select, insert, update, delete on public.averias_acciones to authenticated;

-- «Acciones» es una dirección nueva: quien ya tenía Averías conserva el mismo nivel aquí. No pisa lo puesto a mano.
insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/inventario/averias/acciones', p.nivel
  from public.rol_permisos p
 where p.seccion = '/inventario/averias'
on conflict (rol, seccion) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles'
                and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = permisos_extra
           || jsonb_build_object('/inventario/averias/acciones', permisos_extra -> '/inventario/averias')
     where permisos_extra ? '/inventario/averias'
       and not (permisos_extra ? '/inventario/averias/acciones');
  end if;
end $$;

-- Las novedades del conteo guardado: la MISMA cuenta de conteo_evidencias, con el permiso de Acciones.
drop function if exists public.averias_acciones_conteo(date, date);
create function public.averias_acciones_conteo(p_desde date, p_hasta date)
returns table (
  dia date, conteo_id uuid, conteo text, ubicacion_id uuid, ubicacion text, calle text, modulo text, lado text,
  tipo text, linea_id uuid, codigo text, material text, cajas bigint,
  persona text, hora timestamptz, ruta text,
  pnc_rotulo boolean, pnc_bloqueo_mecanico boolean, cumple boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mi_nivel_pantalla('/inventario/averias/acciones') = 'ninguno' then
    raise exception 'Sin permiso para ver las acciones de averías';
  end if;
  return query
  with lin as (
    select cl.id, cl.conteo_id, cl.ubicacion_id, cl.producto_id, cl.averia, cl.pnc, cl.pnc_rotulo, cl.pnc_bloqueo_mecanico,
           cl.contado_por, coalesce(cl.registrado_en, cl.contado_en) as t,
           (coalesce(cl.estibas, 0) * coalesce(p.cajas_por_estiba, 0) + coalesce(cl.cajas, 0))::bigint as cj,
           p.sku::text as sku, p.nombre::text as nom
      from public.conteo_lineas cl
      join public.conteos c on c.id = cl.conteo_id and c.tipo = 'fefo' and c.estado not in ('anulado', 'borrador')
      left join public.productos p on p.id = cl.producto_id
     where (cl.averia or cl.pnc) and coalesce(cl.registrado_en, cl.contado_en) is not null
  ),
  de_renglon as (
    select (l.t at time zone 'America/Bogota')::date as d, l.conteo_id as cid, l.ubicacion_id as uid,
           case when l.averia then 'averia' else 'pnc' end as tp,
           l.id as lid, l.sku, l.nom, l.cj, l.contado_por as quien, l.t as h, f.ruta,
           l.pnc_rotulo as rot, l.pnc_bloqueo_mecanico as blo
      from lin l left join public.conteo_fotos f on f.linea_id = l.id
    union all
    select (l.t at time zone 'America/Bogota')::date, l.conteo_id, l.ubicacion_id, 'pnc',
           l.id, l.sku, l.nom, l.cj, l.contado_por, l.t, f.ruta, l.pnc_rotulo, l.pnc_bloqueo_mecanico
      from lin l left join public.conteo_fotos f on f.linea_id = l.id
     where l.averia and l.pnc
  ),
  de_modulo as (
    select (m.marcado_en at time zone 'America/Bogota')::date as d, m.conteo_id as cid, m.ubicacion_id as uid,
           case when m.sin_acceso then 'sin_acceso' else 'mezclado' end as tp,
           null::uuid as lid, null::text as sku, null::text as nom, null::bigint as cj, m.marcado_por as quien,
           coalesce(m.tomada_en, m.marcado_en) as h, m.ruta, null::boolean as rot, null::boolean as blo
      from public.conteo_modulos m
      join public.conteos c on c.id = m.conteo_id and c.tipo = 'fefo' and c.estado not in ('anulado', 'borrador')
     where m.sin_acceso or m.mezclado
    union all
    select (m.marcado_en at time zone 'America/Bogota')::date, m.conteo_id, m.ubicacion_id, 'mezclado',
           null, null, null, null, m.marcado_por, coalesce(m.tomada_en, m.marcado_en), m.ruta, null, null
      from public.conteo_modulos m
      join public.conteos c on c.id = m.conteo_id and c.tipo = 'fefo' and c.estado not in ('anulado', 'borrador')
     where m.sin_acceso and m.mezclado
  ),
  todo as (select * from de_renglon union all select * from de_modulo)
  select t.d, t.cid, c.codigo::text, t.uid, u.clave::text, u.calle::text, u.modulo::text, u.lado::text,
         t.tp, t.lid, t.sku, t.nom, t.cj,
         per.nombre::text, t.h, t.ruta,
         t.rot, t.blo,
         case when t.tp = 'pnc' and t.rot is not null and t.blo is not null then (t.rot and t.blo) else null end
    from todo t
    join public.conteos c on c.id = t.cid
    left join public.ubicaciones u on u.id = t.uid
    left join public.perfiles per on per.id = t.quien
   where t.d between p_desde and p_hasta
   order by t.h desc;
end $$;
revoke all on function public.averias_acciones_conteo(date, date) from public, anon;
grant execute on function public.averias_acciones_conteo(date, date) to authenticated;

commit;
