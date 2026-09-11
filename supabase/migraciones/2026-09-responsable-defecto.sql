-- ---------------------------------------------------------------------
-- RESPONSABLE POR DEFECTO DE LAS ACCIONES
--
-- Quien reporta casi siempre le pasa la acción al mismo: el operador
-- logístico que responde por el centro. Obligarlo a escogerlo una por
-- una no aporta nada y es donde se pierden las asignaciones —se cierra
-- la app, entra una llamada, y la acción queda huérfana—.
--
-- Entonces la acción NACE ASIGNADA a quien esté puesto aquí. Se puede
-- cambiar en el mismo segundo, en la pantalla que confirma que quedó
-- reportada.
--
-- NO VA QUEMADO EN EL CÓDIGO. El nombre del contratista es un DATO de
-- este centro de distribución, no una regla del programa: el día que
-- cambie el OL se cambia en el Maestro y no hay que tocar nada más.
-- Nace vacío: sin nadie puesto, todo sigue igual que antes.
--
-- Se puede correr varias veces sin romper nada.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. DÓNDE SE GUARDA
--
-- Tabla aparte de acciones_parametros porque esa guarda NÚMEROS
-- (valor numeric) y esto es un uuid. Meterlo ahí obligaría a convertir
-- un id en número, que no se puede, o a aflojar la columna para todos.
-- ---------------------------------------------------------------------
create table if not exists public.acciones_ajustes (
  clave text primary key,
  valor text,
  nota  text
);

insert into public.acciones_ajustes (clave, valor, nota) values
  ('responsable_defecto', null,
   'A quién nace asignada una acción nueva. Vacío = nace sin dueño.')
on conflict (clave) do nothing;

alter table public.acciones_ajustes enable row level security;

drop policy if exists acciones_ajustes_select on public.acciones_ajustes;
create policy acciones_ajustes_select on public.acciones_ajustes
  for select to authenticated using (true);

/* Solo el administrador lo cambia. Un supervisor que pudiera mover esto
   estaría decidiendo a quién le cae TODO lo que se reporte de aquí en
   adelante, que es una decisión del centro y no de un turno. */
drop policy if exists acciones_ajustes_write on public.acciones_ajustes;
create policy acciones_ajustes_write on public.acciones_ajustes
  for all to authenticated
  using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

grant select on public.acciones_ajustes to authenticated;
grant insert, update on public.acciones_ajustes to authenticated;

-- ---------------------------------------------------------------------
-- 2. PONERLO Y QUITARLO
--
-- Pasa por función y no por un update suelto para que la comprobación
-- —que la persona exista y esté activa— viva en un solo sitio. Poner
-- de responsable por defecto a alguien desactivado dejaría todas las
-- acciones nuevas colgando de un usuario que ya no entra.
-- ---------------------------------------------------------------------
create or replace function public.accion_responsable_defecto(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Cambiar el responsable por defecto es del administrador';
  end if;

  if p_id is not null
     and not exists (select 1 from public.perfiles
                      where id = p_id and activo) then
    raise exception 'Esa persona no existe o está desactivada';
  end if;

  insert into public.acciones_ajustes (clave, valor)
  values ('responsable_defecto', p_id::text)
  on conflict (clave) do update set valor = excluded.valor;
end $$;

grant execute on function public.accion_responsable_defecto(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. QUE LA ACCIÓN NAZCA ASIGNADA
--
-- Va DENTRO de accion_reportar y no en la pantalla: si lo hiciera la
-- pantalla, una acción que entre por otro camino —la cola de sin
-- internet, mañana una importación— nacería sin dueño y nadie sabría
-- por qué unas sí y otras no.
--
-- Si la persona puesta ya no está activa, la acción nace SIN dueño en
-- vez de fallar: perder el default molesta; no poder reportar para el
-- trabajo, y quien está reportando no tiene cómo arreglar eso.
-- ---------------------------------------------------------------------
create or replace function public.accion_reportar(
  p_titulo      text,
  p_motivo      text,
  p_prioridad   text,
  p_zona        text default null,
  p_ubicacion   text default null,
  p_descripcion text default null,
  p_lat         numeric default null,
  p_lng         numeric default null,
  p_precision   numeric default null
)
returns table (id uuid, codigo text, vence_en timestamptz, reincidencia integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area   text;
  v_horas  integer;
  v_id     uuid;
  v_cod    text;
  v_vence  timestamptz;
  v_pri    accion_prioridad;
  v_zona   text;
  v_veces  integer;
  v_tope   integer;
  v_dueno  uuid;
begin
  if not public.es_editor() then
    raise exception 'Reportar una acción requiere rol de supervisor o administrador';
  end if;

  v_pri := p_prioridad::accion_prioridad;

  if p_zona is not null then
    select z.codigo, z.area into v_zona, v_area
      from public.acciones_zonas z
     where z.codigo = upper(btrim(p_zona)) and z.activo;
    if v_zona is null then
      raise exception 'La zona % no existe o está desactivada', p_zona;
    end if;
  end if;

  if v_area is null then
    select m.area into v_area from public.acciones_motivos m
     where m.clave = p_motivo and m.activo;
    if not found then
      raise exception 'El motivo % no existe o está desactivado', p_motivo;
    end if;
    v_area := coalesce(v_area, 'seguridad');
  end if;

  if v_zona is null and btrim(coalesce(p_ubicacion, '')) = '' then
    raise exception 'Hay que decir dónde: escanea el QR, escoge la zona o escríbela';
  end if;

  select horas into v_horas from public.acciones_plazos where prioridad = v_pri;
  v_vence := now() + make_interval(hours => v_horas);

  v_veces := public.accion_reincidencia(p_motivo, v_zona);
  select valor::int into v_tope from public.acciones_parametros
   where clave = 'reincidencia_veces';

  if v_zona is not null and v_veces >= v_tope then
    raise exception
      'Este motivo ya va % veces en esta zona. Aquí no va otra correctiva: '
      'hay que abrir acción preventiva con causa raíz.', v_veces
      using errcode = 'P0001';
  end if;

  /* EL DUEÑO POR DEFECTO. Si no hay nadie puesto, o el puesto ya no
     está activo, queda en null y la acción nace sin dueño, igual que
     antes de esta migración. */
  select a.valor::uuid into v_dueno
    from public.acciones_ajustes a
   where a.clave = 'responsable_defecto'
     and a.valor is not null
     and exists (select 1 from public.perfiles p
                  where p.id = a.valor::uuid and p.activo);

  v_cod := 'AC-' || lpad(nextval('public.acciones_codigo_seq')::text, 4, '0');

  insert into public.acciones
    (codigo, tipo, titulo, descripcion, motivo, area, zona, ubicacion,
     lat, lng, precision_m, prioridad, vence_en, estado, reportada_por,
     responsable, asignada_en)
  values
    (v_cod, 'correctiva', btrim(p_titulo),
     nullif(btrim(coalesce(p_descripcion, '')), ''),
     p_motivo, v_area, v_zona,
     nullif(btrim(coalesce(p_ubicacion, '')), ''),
     p_lat, p_lng, p_precision, v_pri, v_vence, 'abierta', auth.uid(),
     v_dueno, case when v_dueno is not null then now() end)
  returning acciones.id into v_id;

  return query select v_id, v_cod, v_vence, v_veces;
end $$;

grant execute on function
  public.accion_reportar(text, text, text, text, text, text, numeric, numeric, numeric)
to authenticated;
