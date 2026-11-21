-- PASIVOS · LOS DÍAS QUE TIENEN BASE, EN UNA SOLA LECTURA.
-- El Cuadre SAP AG22 (y Pasivos e Informe) sacaban la lista de días leyendo TODA la tabla pasivos_base de a 1.000 filas, y en cada
-- fila Supabase revisaba el permiso (mi_nivel_pantalla). Con la tabla grande, las últimas páginas se pasaban del tiempo, la lista
-- quedaba cortada en un día viejo (p. ej. 04/11) y el cuadre abría ese día aunque se pidiera el de hoy.
-- Aquí: el permiso se revisa UNA vez y se devuelven los días distintos, del más nuevo al más viejo. Se puede correr varias veces.
begin;

create index if not exists pasivos_base_fecha_idx on public.pasivos_base (fecha desc);

create or replace function public.pasivos_dias()
returns setof date
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.mi_nivel_pantalla('/inventario/balance/pasivos') in ('ver', 'editar')
       or public.mi_nivel_pantalla('/inventario/balance/cuadre') in ('ver', 'editar')) then
    raise exception 'No tienes permiso para ver los pasivos.' using errcode = '42501';
  end if;
  return query select distinct b.fecha from public.pasivos_base b order by b.fecha desc;
end
$$;
revoke all on function public.pasivos_dias() from public;
grant execute on function public.pasivos_dias() to authenticated;

analyze public.pasivos_base;
commit;
