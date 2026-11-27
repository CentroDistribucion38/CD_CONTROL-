-- =====================================================================
-- ROTURAS EN SITIO · EDITAR EL CASO COMPLETO (superadmin)
--
-- «Que yo pueda editar y cambiar hasta el código: cambiar el SKU si soy super admin.»
--
-- Antes el administrador solo corregía rotas y contaminadas (`rotura_corregir`). Ahora, en el mismo
-- panel del caso, cambia también el MATERIAL (SKU), la CAUSA, el PROCESO y el ÁREA. Las mismas reglas:
--   · solo quien manda (superadmin), con motivo obligatorio;
--   · lo de antes NO se pierde: cada cambio queda en `roturas_correcciones` (antes → después, motivo,
--     quién y cuándo);
--   · al cambiar el material se copian del maestro el tipo y el color (como al registrar) y el cobro
--     se recalcula solo, porque `v_roturas` lo calcula del material y las cajas;
--   · al cambiar la causa se copia su grupo (asumida / no asumida), como al registrar;
--   · el caso queda revisado.
-- Una rotura anulada no se edita.
--
-- Va después de 2026-10-roturas-corregir-cifras.sql. Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.roturas_correcciones add column if not exists antes_material   text;
alter table public.roturas_correcciones add column if not exists despues_material text;
alter table public.roturas_correcciones add column if not exists antes_causa      text;
alter table public.roturas_correcciones add column if not exists despues_causa    text;
alter table public.roturas_correcciones add column if not exists antes_proceso    text;
alter table public.roturas_correcciones add column if not exists despues_proceso  text;
alter table public.roturas_correcciones add column if not exists antes_area       text;
alter table public.roturas_correcciones add column if not exists despues_area     text;

create or replace function public.rotura_editar(
  p_id uuid, p_material text, p_causa text, p_proceso text, p_area text,
  p_rotas integer, p_contaminadas integer, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v        public.roturas%rowtype;
  v_mat    text;
  m        public.roturas_materiales%rowtype;
  v_grupo  causa_grupo;
  v_area   text := nullif(btrim(coalesce(p_area, '')), '');
  v_cont   integer;
  v_bot    integer;
begin
  if not public.manda() then
    raise exception 'Editar un caso es del superadministrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se edita: queda escrito junto a lo que había antes';
  end if;

  select * into v from public.roturas where id = p_id for update;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if v.estado = 'anulada' then raise exception 'Esa rotura está anulada: no se edita'; end if;

  /* EL MATERIAL (SKU). Si cambia, tiene que estar en el maestro; si no estaba en el de roturas, se da de
     alta desde el de Inventario (la misma regla que al registrar). */
  v_mat := nullif(btrim(coalesce(p_material, '')), '');
  if v_mat is null then raise exception 'Escoge el material'; end if;
  if v_mat <> v.material then
    v_mat := public.rotura_material_asegurar(v_mat);
    if v_mat is null then
      raise exception 'Ese material no está en el maestro, está apagado o es un envase sin color de vidrio. Revísalo en el maestro de Inventario';
    end if;
  end if;
  select * into m from public.roturas_materiales where clave = v_mat;

  /* LA CAUSA: si cambia, tiene que estar activa; su grupo se copia. */
  if coalesce(p_causa, '') = '' then raise exception 'Escoge la causa'; end if;
  if p_causa <> v.causa then
    select grupo into v_grupo from public.roturas_causas where clave = p_causa and activo;
    if not found then raise exception 'Esa causa no existe o está apagada'; end if;
  else
    v_grupo := v.grupo;
  end if;

  if coalesce(p_proceso, '') = '' then raise exception 'Escoge el proceso'; end if;
  if p_proceso <> v.proceso and not exists (select 1 from public.roturas_procesos where clave = p_proceso and activo) then
    raise exception 'Ese proceso no existe o está apagado';
  end if;
  if v_area is not null and v_area is distinct from v.area
     and not exists (select 1 from public.roturas_areas where clave = v_area and activo) then
    raise exception 'Esa área no existe o está apagada';
  end if;

  /* LAS CIFRAS, con las reglas de siempre. En EER no hay contaminadas. */
  if p_rotas is null or p_rotas < 0 then raise exception 'Las rotas no pueden ser negativas'; end if;
  v_cont := case when m.tipo = 'eer' then null else greatest(coalesce(p_contaminadas, 0), 0) end;
  if p_rotas + coalesce(v_cont, 0) <= 0 then
    raise exception 'Rotas y contaminadas no pueden quedar las dos en cero. Si no pasó nada, se anula';
  end if;

  if v_mat = v.material and p_causa = v.causa and p_proceso = v.proceso and v_area is not distinct from v.area
     and p_rotas = v.unidades and coalesce(v_cont, 0) = coalesce(v.contaminadas, 0) then
    raise exception 'No cambió nada';
  end if;

  /* Las botellas de adentro (producto terminado): con otro material se recalculan con SU botellas por
     empaque; con el mismo, siguen la regla de la corrección de cifras. */
  if m.tipo <> 'producto_terminado' then
    v_bot := null;
  elsif v_mat <> v.material then
    v_bot := case when m.botellas_x_empaque is not null then p_rotas * m.botellas_x_empaque end;
  else
    v_bot := v.botellas;
    if v.botellas is not null and m.botellas_x_empaque is not null then
      v_bot := case when v.botellas = v.unidades * m.botellas_x_empaque then p_rotas * m.botellas_x_empaque
                    else least(v.botellas, p_rotas * m.botellas_x_empaque) end;
    end if;
  end if;

  insert into public.roturas_correcciones
    (rotura_id, codigo, antes_rotas, antes_contaminadas, despues_rotas, despues_contaminadas, motivo, corregida_por,
     antes_material, despues_material, antes_causa, despues_causa, antes_proceso, despues_proceso, antes_area, despues_area)
  values
    (v.id, v.codigo, v.unidades, v.contaminadas, p_rotas, v_cont, btrim(p_motivo), auth.uid(),
     v.material, v_mat, v.causa, p_causa, v.proceso, p_proceso, v.area, v_area);

  update public.roturas
     set material = v_mat, tipo = m.tipo, color = m.color,
         causa = p_causa, grupo = v_grupo, proceso = p_proceso, area = v_area,
         unidades = p_rotas, contaminadas = v_cont, botellas = v_bot
   where id = p_id;

  insert into public.roturas_revision (rotura_id, revisada_por, revisada_en)
  values (p_id, auth.uid(), now())
  on conflict (rotura_id) do update set revisada_por = excluded.revisada_por, revisada_en = excluded.revisada_en;
end $$;

revoke all on function public.rotura_editar(uuid, text, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.rotura_editar(uuid, text, text, text, text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- PARA MIRARLO:
--   select codigo, antes_material, despues_material, antes_rotas, despues_rotas, motivo, corregida_en
--     from public.roturas_correcciones order by corregida_en desc limit 20;
