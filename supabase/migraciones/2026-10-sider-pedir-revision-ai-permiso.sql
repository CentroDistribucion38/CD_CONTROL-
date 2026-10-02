-- =====================================================================
-- SIDER · PEDIR / QUITAR LA REVISIÓN AI TIENE SU PROPIA CASILLA EN ROLES
--
-- «Quitar revisión o pedirla, ayúdame que entre en uno de los permisos.»
--
-- Antes era «solo el administrador» (`mi_rol() = 'admin'`): para que otra
-- persona pudiera pedir o quitar una revisión AI había que volverla
-- administradora. Ahora es la casilla «Pedir / quitar revisión AI»
-- (`/sider/transito/revision-ai`, junto a En tránsito, en Roles y en la
-- ficha de cada persona). Quien MANDA —el administrador— la tiene siempre;
-- a nadie más se le da sola: lo que ya podía pedir antes sigue pudiendo, y
-- lo que no podía, no.
--
-- Lo demás de la función no cambia: un interno no lleva la certificada, y
-- no se quita una revisión que ya tiene la AI hecha.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create or replace function public.sider_ai_marcar(
  p_viaje  uuid,
  p_marcar boolean,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_interno boolean;
begin
  /* `puede_editar` es falso para quien no tiene perfil (mi_nivel da
     'ninguno'), así que aquí no hay el hueco del el hueco de comparar con null. */
  if not coalesce(public.puede_editar('/sider/transito/revision-ai'), false) then
    raise exception 'Pedir o quitar una revisión AI necesita el permiso «Pedir / quitar revisión AI»';
  end if;

  select estado::text, interno into v_estado, v_interno from public.sider_viajes where id = p_viaje;
  if v_estado is null then
    raise exception 'Ese viaje no existe';
  end if;

  if p_marcar and coalesce(v_interno, false) then
    raise exception 'Un camión interno no lleva revisión AI certificada: pasa a la normal';
  end if;

  if not p_marcar and exists (
       select 1 from public.sider_ai_revisiones
        where viaje_id = p_viaje and tipo = 'ai') then
    raise exception 'Ese viaje ya tiene la revisión AI hecha. Primero hay que anular la revisión';
  end if;

  update public.sider_viajes
     set requiere_ai   = p_marcar,
         ai_pedido_por = case when p_marcar then auth.uid() end,
         ai_pedido_en  = case when p_marcar then now() end,
         ai_motivo     = case when p_marcar then nullif(btrim(coalesce(p_motivo, '')), '') end
   where id = p_viaje;
end $$;

grant execute on function public.sider_ai_marcar(uuid, boolean, text) to authenticated;

/* COMPROBACIÓN: la función quedó pidiendo el permiso nuevo y no el rol. */
do $$
declare v_src text;
begin
  select pg_get_functiondef(to_regprocedure('public.sider_ai_marcar(uuid,boolean,text)')) into v_src;
  if v_src not like '%/sider/transito/revision-ai%' then
    raise exception 'sider_ai_marcar no pide el permiso «Pedir / quitar revisión AI».';
  end if;
  if v_src like '%<> ''admin''%' then
    raise exception 'sider_ai_marcar sigue pidiendo ser administrador.';
  end if;
end $$;

commit;
