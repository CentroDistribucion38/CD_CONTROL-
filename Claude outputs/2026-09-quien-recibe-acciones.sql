-- ---------------------------------------------------------------------
-- QUIÉN RECIBE ACCIONES
--
-- La lista de asignar mostraba a TODOS los usuarios de la plataforma:
-- el administrador, la cuenta de la bodega, el operador de turno. A
-- ninguno de esos se le asigna una acción correctiva. Con cinco
-- usuarios ya estorba; con veinte, escoger al que es se vuelve buscar.
--
-- Entonces se marca quién recibe. Los que no están marcados siguen
-- entrando a la plataforma igual: esto no es un permiso, es una lista
-- de a quién se le puede pasar trabajo.
--
-- SI NO HAY NADIE MARCADO, APARECEN TODOS. Una lista vacía dejaría la
-- pantalla de asignar sin nadie, que es peor que la lista larga: de la
-- lista larga se sale escogiendo; de la vacía no se sale.
--
-- NO VA QUEMADO: quién responde por este centro es un dato, no una
-- regla del programa. El día que cambie el OL se cambia en el Maestro.
--
-- Se puede correr varias veces sin romper nada.
-- Va DESPUÉS de 2026-09-responsable-defecto.sql.
-- ---------------------------------------------------------------------

create table if not exists public.acciones_asignables (
  perfil_id  uuid primary key references public.perfiles(id) on delete cascade,
  puesto_por uuid,
  puesto_en  timestamptz not null default now()
);

alter table public.acciones_asignables enable row level security;

drop policy if exists acciones_asignables_select on public.acciones_asignables;
create policy acciones_asignables_select on public.acciones_asignables
  for select to authenticated using (true);

/* Solo el administrador. Un supervisor que pudiera sacar a alguien de
   la lista estaría decidiendo a quién NO se le puede pasar trabajo. */
drop policy if exists acciones_asignables_write on public.acciones_asignables;
create policy acciones_asignables_write on public.acciones_asignables
  for all to authenticated
  using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

grant select, insert, delete on public.acciones_asignables to authenticated;

-- ---------------------------------------------------------------------
-- PONER Y QUITAR
-- ---------------------------------------------------------------------
create or replace function public.accion_asignable(p_id uuid, p_recibe boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Cambiar quién recibe acciones es del administrador';
  end if;

  if not exists (select 1 from public.perfiles where id = p_id and activo) then
    raise exception 'Esa persona no existe o está desactivada';
  end if;

  if p_recibe then
    insert into public.acciones_asignables (perfil_id, puesto_por)
    values (p_id, auth.uid())
    on conflict (perfil_id) do nothing;
  else
    /* Quien está puesto de responsable por defecto no se puede sacar
       sin dejar antes otro —o ninguno—: sacarlo dejaría las acciones
       naciendo asignadas a alguien que la pantalla ya no muestra, y
       cambiarlas sería imposible desde la lista. */
    if exists (select 1 from public.acciones_ajustes
                where clave = 'responsable_defecto' and valor = p_id::text) then
      raise exception
        'Esa persona es la que recibe las acciones nuevas. Cambia primero el '
        'responsable por defecto y después sácala de la lista.';
    end if;
    delete from public.acciones_asignables where perfil_id = p_id;
  end if;
end $$;

grant execute on function public.accion_asignable(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- LA VISTA DE CARGA, FILTRADA
--
-- El filtro va EN LA VISTA y no en cada pantalla: si lo hiciera cada
-- pantalla, el día que alguien agregue una lista nueva y se le olvide
-- filtrar, aparecerían otra vez todos y nadie sabría por qué en una
-- pantalla sí y en otra no.
-- ---------------------------------------------------------------------
create or replace view public.v_acciones_carga as
select
  pf.id,
  pf.usuario,
  pf.nombre,
  pf.rol::text                                                        as rol,
  count(*) filter (where a.estado in ('abierta','reabierta'))          as abiertas,
  count(*) filter (where a.estado in ('abierta','reabierta')
                     and a.vence_en < now())                          as vencidas,
  count(*) filter (where a.estado = 'cerrada')                        as por_verificar,
  (count(*) filter (where a.estado in ('abierta','reabierta'))
     >= (select valor::int from public.acciones_parametros
          where clave = 'carga_saturado'))                            as saturado
from public.perfiles pf
left join public.acciones a on a.responsable = pf.id
where pf.activo
  /* Nadie marcado = todos. Ver el comentario de arriba: una lista
     vacía no tiene salida. */
  and (not exists (select 1 from public.acciones_asignables)
       or exists (select 1 from public.acciones_asignables x
                   where x.perfil_id = pf.id))
group by pf.id, pf.usuario, pf.nombre, pf.rol;

grant select on public.v_acciones_carga to authenticated;
