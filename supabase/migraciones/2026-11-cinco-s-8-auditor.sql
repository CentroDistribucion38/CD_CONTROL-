-- =====================================================================
-- 5S · PASO 8 — ESCOGER EL AUDITOR EN LA INSPECCIÓN
--
-- «Había que seleccionar la persona como desplegable, mas no así fijo.»
-- El auditor sale como quien entró a la app; si se toca, se escoge otra persona de la lista de responsables
-- de 5S. La inspección guarda el nombre escogido (auditor_nombre). Quién la registró sigue quedando en
-- «auditor» (el usuario que entró), para saber siempre quién la subió.
--
-- Va después de 2026-11-cinco-s-7-responsable.sql. Se puede correr varias veces.
-- =====================================================================
begin;

create or replace function public.s5_guardar(p jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id      uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_fecha   date := (p->>'fecha')::date;
  v_hoy     date := (now() at time zone 'America/Bogota')::date;
  v_area    public.s5_areas%rowtype;
  v_fmt     public.s5_formatos%rowtype;
  v_meta    numeric;
  v_resp    text;
  v_aud     text;
  r         jsonb;
  f         jsonb;
  v_pt      public.s5_puntos%rowtype;
  v_item    uuid;
  v_res     text;
  v_sev     text;
  v_obs     text;
  v_zid     uuid;
  v_znom    text;
  v_nfotos  integer;
  v_eval    numeric := 0;
  v_ok      numeric := 0;
  v_n       integer := 0;
  v_nc      integer := 0;
  v_vistos  uuid[] := '{}';
  v_falta   integer;
begin
  if not public.s5_edita('/5s') then
    raise exception 'No tienes permiso para registrar inspecciones.';
  end if;
  if v_fecha is null then raise exception 'Falta la fecha de la inspección.'; end if;
  if v_fecha > v_hoy then raise exception 'La fecha no puede ser de un día que no ha llegado.'; end if;

  select * into v_area from public.s5_areas where id = (p->>'area_id')::uuid;
  if not found or not v_area.activa then raise exception 'Escoge un área activa.'; end if;
  if nullif(p->>'formato_id', '') is null then
    select * into v_fmt from public.s5_formatos where clave = '5s';
  else
    select * into v_fmt from public.s5_formatos where id = (p->>'formato_id')::uuid;
  end if;
  if not found or not v_fmt.activo then raise exception 'Escoge un formato activo.'; end if;
  if exists (select 1 from public.s5_inspecciones where id = v_id) then
    raise exception 'Esta inspección ya quedó guardada.';
  end if;

  /* La meta: la del área, si no la del formato, si no la general. */
  select coalesce(v_area.meta, v_fmt.meta, (select meta from public.s5_reglas where id = 1), 90) into v_meta;
  /* EL RESPONSABLE: el que se escogió en la inspección; si no se escogió, el del área. */
  select nombre into v_resp from public.s5_responsables
   where id = coalesce(nullif(p->>'responsable_id', '')::uuid, v_area.responsable_id);
  /* EL AUDITOR: el que se escogió en la inspección; si no se escogió, quien entró a la app. */
  if nullif(p->>'auditor_id', '') is not null then
    select nombre into v_aud from public.s5_responsables where id = (p->>'auditor_id')::uuid;
    if v_aud is null then raise exception 'El auditor escogido ya no está en la lista. Vuelve a escogerlo.'; end if;
  else
    select nullif(trim(nombre), '') into v_aud from public.perfiles where id = auth.uid();
  end if;

  insert into public.s5_inspecciones (id, fecha, area_id, area, responsable, auditor, auditor_nombre, cumplimiento, meta, nota, formato_id, formato)
  values (v_id, v_fecha, v_area.id, v_area.nombre, v_resp, auth.uid(), v_aud, 0, v_meta, nullif(trim(p->>'nota'), ''), v_fmt.id, v_fmt.nombre);

  for r in select * from jsonb_array_elements(coalesce(p->'puntos', '[]'::jsonb)) loop
    select * into v_pt from public.s5_puntos
     where id = (r->>'punto_id')::uuid and activo and formato_id = v_fmt.id and (area_id is null or area_id = v_area.id);
    if not found then raise exception 'Uno de los puntos ya no está en el checklist de %. Vuelve a abrir la inspección.', v_area.nombre; end if;
    if v_pt.id = any(v_vistos) then raise exception 'Un punto vino dos veces.'; end if;
    v_vistos := v_vistos || v_pt.id;

    v_res := r->>'resultado';
    if v_res is null or v_res not in ('cumple', 'no_cumple', 'na') then
      raise exception 'Falta responder: «%».', v_pt.pregunta;
    end if;
    v_obs := nullif(trim(r->>'observacion'), '');
    v_sev := case when v_res = 'no_cumple' then coalesce(nullif(r->>'severidad', ''), 'media') end;
    if v_sev is not null and v_sev not in ('baja', 'media', 'alta') then raise exception 'Severidad no válida.'; end if;
    if v_res = 'no_cumple' and v_obs is null then
      raise exception 'Escribe qué se encontró en «%» (no cumple).', v_pt.pregunta;
    end if;
    v_nfotos := jsonb_array_length(coalesce(r->'fotos', '[]'::jsonb));
    if v_pt.exige_foto and v_res <> 'na' and v_nfotos = 0 then
      raise exception '«%» exige foto.', v_pt.pregunta;
    end if;

    v_zid := null; v_znom := null;
    if nullif(r->>'zona_id', '') is not null and v_res <> 'na' then
      select id, nombre into v_zid, v_znom from public.s5_zonas where id = (r->>'zona_id')::uuid and area_id = v_area.id;
      if v_zid is null then raise exception 'La zona de «%» no es de %.', v_pt.pregunta, v_area.nombre; end if;
    end if;

    insert into public.s5_inspeccion_puntos (inspeccion_id, punto_id, orden, s, pregunta, peso, resultado, severidad, observacion, zona_id, zona)
    values (v_id, v_pt.id, v_pt.orden, v_pt.s, v_pt.pregunta, v_pt.peso, v_res, v_sev, v_obs, v_zid, v_znom)
    returning id into v_item;

    for f in select * from jsonb_array_elements(coalesce(r->'fotos', '[]'::jsonb)) loop
      if coalesce(f->>'ruta', '') not like v_id::text || '/%' then raise exception 'Ruta de foto no válida.'; end if;
      insert into public.s5_fotos (inspeccion_id, item_id, ruta, bytes)
      values (v_id, v_item, f->>'ruta', nullif(f->>'bytes', '')::integer);
    end loop;

    if v_res <> 'na' then
      v_eval := v_eval + v_pt.peso; v_n := v_n + 1;
      if v_res = 'cumple' then v_ok := v_ok + v_pt.peso; else v_nc := v_nc + 1; end if;
    end if;
  end loop;

  select count(*) into v_falta from public.s5_puntos
   where activo and formato_id = v_fmt.id and (area_id is null or area_id = v_area.id) and not (id = any(v_vistos));
  if v_falta > 0 then
    raise exception '%', case when v_falta = 1 then 'Falta 1 punto del checklist por responder.'
                              else 'Faltan ' || v_falta || ' puntos del checklist por responder.' end;
  end if;
  if v_eval = 0 then raise exception 'Todo quedó en N/A: no hay nada que calificar.'; end if;

  update public.s5_inspecciones
     set cumplimiento = round(100 * v_ok / v_eval, 2), evaluados = v_n, no_cumple = v_nc
   where id = v_id;
  return v_id;
end $$;
revoke all on function public.s5_guardar(jsonb) from public, anon;
grant execute on function public.s5_guardar(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
