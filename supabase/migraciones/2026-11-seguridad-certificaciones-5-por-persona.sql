-- =====================================================================
-- SEGURIDAD · CERTIFICACIONES — INTERVENTOR Y COORDINADOR POR PERSONA
-- Desde la matriz de Personas se escogen varias personas y se les asigna su Interventor ABI y su Coordinador.
-- Lo puesto a la persona manda sobre el grupo y la empresa. Se puede correr varias veces.
-- =====================================================================
alter table public.seg_personas add column if not exists interventor_id uuid references public.seg_responsables(id) on delete set null;
alter table public.seg_personas add column if not exists coordinador_id uuid references public.seg_responsables(id) on delete set null;

drop view if exists public.v_seg_personas;
-- A quién se le exige: lo puesto a la persona manda; si no, su grupo; si no, su empresa. Si solo hay coordinador,
-- el interventor sale de a quién responde ese coordinador.
create view public.v_seg_personas with (security_invoker = true) as
select p.cedula, p.nombre, p.departamento, p.estado, p.motivo, p.actualizado,
       p.empresa_id, e.nombre as empresa,
       p.grupo_id, g.nombre as grupo,
       v.expedicion, v.vencimiento, coalesce(v.permisos, '{}') as permisos, v.nivel, v.validador, v.sop,
       coalesce(pi.nombre, pci.nombre, gi.nombre, ei.nombre, gci.nombre, eci.nombre) as interventor,
       coalesce(pc.nombre, gc.nombre, ec.nombre) as coordinador,
       p.interventor_id as interventor_propio_id, p.coordinador_id as coordinador_propio_id,
       (select count(*) from public.seg_validaciones x where x.cedula = p.cedula)::int as validaciones
  from public.seg_personas p
  left join public.seg_empresas e on e.id = p.empresa_id
  left join public.seg_grupos g on g.id = p.grupo_id
  left join lateral (select * from public.seg_validaciones x where x.cedula = p.cedula order by x.expedicion desc limit 1) v on true
  left join public.seg_responsables pi on pi.id = p.interventor_id
  left join public.seg_responsables pc on pc.id = p.coordinador_id
  left join public.seg_responsables gi on gi.id = g.interventor_id
  left join public.seg_responsables gc on gc.id = g.coordinador_id
  left join public.seg_responsables ei on ei.id = e.interventor_id
  left join public.seg_responsables ec on ec.id = e.coordinador_id
  left join public.seg_responsables pci on pci.id = pc.interventor_id
  left join public.seg_responsables gci on gci.id = gc.interventor_id
  left join public.seg_responsables eci on eci.id = ec.interventor_id;
grant select on public.v_seg_personas to authenticated;

notify pgrst, 'reload schema';
