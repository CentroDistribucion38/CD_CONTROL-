-- =====================================================================
-- FISCAL → LA BASE · ESTADOS DEL ENVASE QUE FALTAN EN LA LISTA
--
-- Causa más probable del aviso «El estado del envase (lleno / vacío) todavía no está creado»:
-- en `envase_estados` falta «MAL ESTADO» (la pantalla de contar lo ofrece), o el fiscal trae un estado
-- escrito distinto (sin tilde, minúsculas, con espacio de más).
--
-- Esto, todo o nada y SIN tablas temporales:
--   0) Crea OTROS, MAL ESTADO, LLENO y VACÍO si faltan.
--   1) Si un estado del fiscal no está en la lista y es el mismo escrito distinto, lo corrige a la clave que existe.
--   2) Si es un estado nuevo de verdad, lo agrega a la lista (activo).
--   3) No borra nada ni toca cantidades.
-- El resultado final: cada estado que traen los conteos del fiscal y si ya está en la lista.
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

insert into public.envase_estados (clave, orden, activo) values
  ('OTROS', 6, true), ('MAL ESTADO', 7, true), ('LLENO', 8, true), ('VACÍO', 9, true)
on conflict (clave) do update set activo = true;

do $$
declare
  r record;
  v_clave text;
  v_orden int;
begin
  alter table public.inv_fiscal_conteos disable trigger user;   -- un renglón de hoja terminada no se toca: se apaga solo aquí
  for r in
    select distinct x.v as valor
      from (
        select estado_envase as v from public.inv_fiscal_conteos where estado_envase is not null
        union all
        select estado from public.conteo_reglas_estado where estado is not null
      ) x
     where not exists (select 1 from public.envase_estados e where e.clave = x.v)
     order by 1
  loop
    select e.clave into v_clave from public.envase_estados e
     where upper(btrim(translate(e.clave, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'))) = upper(btrim(translate(r.valor, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')))
     order by e.activo desc, e.orden limit 1;
    if v_clave is not null then
      update public.inv_fiscal_conteos set estado_envase = v_clave where estado_envase = r.valor;
      update public.conteo_reglas_estado set estado = v_clave where estado = r.valor;
    else
      select coalesce(max(orden), 0) + 10 into v_orden from public.envase_estados;
      insert into public.envase_estados (clave, orden, activo) values (r.valor, v_orden, true) on conflict (clave) do nothing;
    end if;
  end loop;
  alter table public.inv_fiscal_conteos enable trigger user;

  if exists (select 1 from public.inv_fiscal_conteos c where c.estado_envase is not null
              and not exists (select 1 from public.envase_estados e where e.clave = c.estado_envase)) then
    raise exception 'Todavía quedan estados del fiscal fuera de la lista. Avísame (nada cambió).';
  end if;
end $$;

commit;

-- Los estados que traen los conteos del fiscal y si ya están en la lista (todos deben decir «sí»).
select coalesce(c.estado_envase, '(sin estado: producto)') as estado, count(*) as renglones,
       case when c.estado_envase is null then '—'
            when exists (select 1 from public.envase_estados e where e.clave = c.estado_envase and e.activo) then 'sí' else 'NO' end as "está en la lista"
  from public.inv_fiscal_conteos c
 group by c.estado_envase
 order by 2 desc;
