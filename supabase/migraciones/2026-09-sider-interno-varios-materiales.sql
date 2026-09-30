-- =====================================================================
-- SIDER · UN VH INTERNO CON VARIOS MATERIALES (mismo camión, misma factura)
--
-- «Si voy a agregar otro material relacionado a esa factura debe aparecer
--  un «+» de agregar, con su cantidad correspondiente.»
--
-- UN CAMIÓN PUEDE TRAER 2 O 3 REFERENCIAS. Cada material es SU PROPIA
-- LÍNEA: un viaje con su sku y sus estibas, y por tanto su propia tarjeta
-- de revisión con sus botellas recibidas. Lo que comparten es lo del
-- camión: placa, origen, destino y documento (factura).
--
-- ESTA FUNCIÓN NO INVENTA NINGUNA REGLA: llama, una vez por línea, a
-- `sider_viaje_interno_crear`, que ya valida placa, origen, destino,
-- material, estibas, documento y permiso. TODO O NADA: si una línea falla
-- —material apagado, estibas en cero— no queda ninguna, porque es una sola
-- llamada y Postgres deshace la transacción entera.
--
-- Es NUEVA y no toca la de siempre: con una sola línea la pantalla sigue
-- llamando a la vieja, así que subir el código antes de correr esto no
-- rompe el «+» de siempre.
--
-- `p_lineas`: [{"sku":"3501225","estibas":30}, {"sku":"3500887","estibas":12}]
-- Devuelve los ids de los viajes, en el mismo orden.
-- =====================================================================
begin;

create or replace function public.sider_viaje_interno_crear_varios(
  p_placa   text,
  p_planta  text,
  p_destino text,
  p_factura text,
  p_lineas  jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   uuid[] := '{}';
  v_l     jsonb;
  v_sku   text;
  v_est   numeric;
  v_vistos text[] := '{}';
begin
  /* El permiso se pide ANTES de mirar nada más: quien no puede crear no
     debe enterarse de qué materiales existen por los mensajes de error. */
  if not public.puede_editar('/sider/sorting/nuevo') then
    raise exception 'Crear un Vh Interno requiere el permiso «Vh Interno» (Roles)';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Falta al menos un material con sus estibas';
  end if;
  if jsonb_array_length(p_lineas) > 10 then
    raise exception 'Un Vh Interno lleva máximo 10 materiales';
  end if;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    if jsonb_typeof(v_l) <> 'object' then
      raise exception 'Cada material debe traer su código y sus estibas';
    end if;
    v_sku := btrim(coalesce(v_l ->> 'sku', ''));
    if v_sku = '' then
      raise exception 'A un material le falta el código';
    end if;
    /* EL MISMO MATERIAL DOS VECES NO: son las mismas botellas contadas
       dos veces y dos tarjetas que se pisarían al revisar. Si hay más,
       se suman en la misma línea. */
    if v_sku = any (v_vistos) then
      raise exception 'El material % está repetido: suma sus estibas en una sola línea', v_sku;
    end if;
    v_vistos := v_vistos || v_sku;

    begin
      v_est := (v_l ->> 'estibas')::numeric;
    exception when others then
      raise exception 'Las estibas del material % no son un número', v_sku;
    end;

    v_ids := v_ids || public.sider_viaje_interno_crear(
      p_placa, p_planta, p_destino, v_sku, v_est, p_factura, null, null);
  end loop;

  return v_ids;
end $$;

grant execute on function public.sider_viaje_interno_crear_varios(text, text, text, text, jsonb)
  to authenticated;

do $$
begin
  if to_regprocedure('public.sider_viaje_interno_crear_varios(text,text,text,text,jsonb)') is null then
    raise exception 'No quedó la función de varios materiales.';
  end if;
  if to_regprocedure('public.sider_viaje_interno_crear(text,text,text,text,numeric,text,text,text)') is null then
    raise exception 'Falta 2026-09-sider-revision-ai-interna.sql: córrelo primero.';
  end if;
  raise notice 'Listo: un Vh Interno puede llevar varios materiales.';
end $$;

commit;
