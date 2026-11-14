-- =====================================================================
-- SEGURIDAD · CERTIFICACIONES — LA CADENA DEL AVISO
-- La app le avisa al Interventor ABI y el interventor a su Coordinador de la contratista: cada coordinador
-- queda amarrado a su interventor. Si a una empresa solo se le pone el coordinador, su interventor sale solo.
-- Se puede correr varias veces.
-- =====================================================================
alter table public.seg_responsables add column if not exists interventor_id uuid references public.seg_responsables(id) on delete set null;

drop view if exists public.v_seg_personas;
create view public.v_seg_personas with (security_invoker = true) as
select p.cedula, p.nombre, p.departamento, p.estado, p.motivo, p.actualizado,
       p.empresa_id, e.nombre as empresa,
       p.grupo_id, g.nombre as grupo,
       v.expedicion, v.vencimiento, coalesce(v.permisos, '{}') as permisos, v.nivel, v.validador, v.sop,
       coalesce(gi.nombre, ei.nombre, gci.nombre, eci.nombre) as interventor,
       coalesce(gc.nombre, ec.nombre) as coordinador,
       (select count(*) from public.seg_validaciones x where x.cedula = p.cedula)::int as validaciones
  from public.seg_personas p
  left join public.seg_empresas e on e.id = p.empresa_id
  left join public.seg_grupos g on g.id = p.grupo_id
  left join lateral (select * from public.seg_validaciones x where x.cedula = p.cedula order by x.expedicion desc limit 1) v on true
  left join public.seg_responsables gi on gi.id = g.interventor_id
  left join public.seg_responsables gc on gc.id = g.coordinador_id
  left join public.seg_responsables ei on ei.id = e.interventor_id
  left join public.seg_responsables ec on ec.id = e.coordinador_id
  -- Si solo se asignó el coordinador, el interventor sale de a quién responde ese coordinador.
  left join public.seg_responsables gci on gci.id = gc.interventor_id
  left join public.seg_responsables eci on eci.id = ec.interventor_id;
grant select on public.v_seg_personas to authenticated;

notify pgrst, 'reload schema';
