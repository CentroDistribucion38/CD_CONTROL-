-- =====================================================================
-- SIDER · REVISIÓN AI NORMAL Y CERTIFICADA, Y EL «+» DE TRÁNSITO — LA BASE
--
-- Esto mueve PLATA y mueve LA VERDAD DE LA CERTIFICACIÓN. Lo que puede
-- salir mal, y ninguna pantalla lo va a mostrar:
--
--   1. QUE LO QUE YA SE COBRABA CAMBIE. La migración hace entrar el
--      Sorting al informe a propósito; las AI de antes tienen que dar la
--      misma huella, al peso.
--   2. QUE UN INTERNO CUENTE COMO CERTIFICADO POR SIDER. Lo crea alguien
--      de control con el «+»: sin salida, sin GPS, sin fotos. Si entra al
--      % de certificación, el indicador sube con camiones que Sider nunca
--      certificó.
--   3. QUE UN INTERNO QUEDE TRANCADO. Sin salida no hay tres fotos de
--      salida: si la llegada se las exige, nunca se puede recibir.
--   4. QUE NO SE PUEDA SALTAR LA REGLA A LA INVERSA: que un camión NORMAL
--      (de Sider) sin fotos de salida se pueda recibir por parecerse a un
--      interno.
--   5. QUE LA BASE NO SE FÍE DE LOS DESPLEGABLES: origen, destino y
--      material se validan contra el maestro.
--   6. QUE EL PERMISO SE PIDA MAL: `es_editor()` es cierto con cualquier
--      «editar» en cualquier pantalla; Portería edita otra y no guarda.
--
-- Se corre con `bash .arnes/correr-sider-revision.sh`.
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function public._espera_error(p_sql text, p_patron text, p_desc text) returns text
language plpgsql as $$
begin
  begin
    execute p_sql;
    return E'\n   · ' || p_desc;
  exception when others then
    if sqlerrm like p_patron then return ''; end if;
    return E'\n   · ' || p_desc || ' (falló, pero con otra cosa: ' || sqlerrm || ')';
  end;
end $$;
create or replace function public._espera_bien(p_sql text, p_desc text) returns text
language plpgsql as $$
begin
  begin
    execute p_sql; return '';
  exception when others then
    return E'\n   · ' || p_desc || ' — falló y no debía: ' || sqlerrm;
  end;
end $$;
grant execute on function public._espera_error(text, text, text), public._espera_bien(text, text) to public;

create or replace function public._guardar(p_viaje uuid, p_tipo text,
                                           p_revisadas int default 4104, p_rota int default 37)
returns text language plpgsql as $$
begin
  return public._espera_bien(format(
    $q$select public.sider_ai_guardar(%L,'T1','t1',null,'G175',false,82080,%s,
       jsonb_build_object('rota', %s), null, null, %L)$q$, p_viaje, p_revisadas, p_rota, p_tipo),
    'guardar la revisión de tipo ' || p_tipo);
end $$;
grant execute on function public._guardar(uuid, text, int, int) to public;

create table if not exists public._ids (k text primary key, id uuid);
grant all on public._ids to public;

/* LA LLAMADA DE CREAR, escrita una vez. */
create or replace function public._crear(p_clave text, p_placa text, p_planta text, p_destino text,
                                         p_sku text, p_estibas numeric) returns text
language plpgsql as $$
declare v uuid;
begin
  begin
    v := public.sider_viaje_interno_crear(p_placa, p_planta, p_destino, p_sku, p_estibas);
  exception when others then
    return E'\n   · crear ' || p_clave || ' falló: ' || sqlerrm;
  end;
  insert into public._ids values (p_clave, v) on conflict (k) do update set id = excluded.id;
  return '';
end $$;
grant execute on function public._crear(text, text, text, text, text, numeric) to public;

-- ---------------------------------------------------------------------
-- QUIÉNES SON Y QUÉ HAY EN LOS MAESTROS
-- ---------------------------------------------------------------------
insert into public.roles (clave, nombre, descripcion, manda, sistema, orden)
values ('porteria', 'Portería', 'Solo certifica salidas.', false, false, 9)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, seccion, nivel)
values ('porteria', '/sider/certificar', 'editar') on conflict do nothing;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('44444444-4444-4444-4444-444444444444','op@cdcontrol.local'),
  ('55555555-5555-5555-5555-555555555555','por@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true),
  ('44444444-4444-4444-4444-444444444444','op','Muchacho','operador',true),
  ('55555555-5555-5555-5555-555555555555','por','Portero','porteria',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.sider_origenes (planta, cd_origen, activo) values
  ('GAL','CD Galapa',true), ('OFF','CD Apagado',false), ('BAQ','Barranquilla',true)
on conflict (planta) do update set activo = excluded.activo;
insert into public.sider_skus (sku, descripcion, activo) values
  ('G175','Costeñita 175',true), ('G350','Costeñita 350',true), ('G000','Material apagado',false)
on conflict (sku) do update set activo = excluded.activo;

insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado) values
  ('eeeeeeee-0000-0000-0000-000000000001','NEW001','BAQ','G175',20,'2026-09-20','en_transito'),
  ('eeeeeeee-0000-0000-0000-000000000002','NEW002','BAQ','G175',20,'2026-09-20','recibido'),
  ('eeeeeeee-0000-0000-0000-000000000003','NEW003','BAQ','G175',20,'2026-09-20','recibido'),
  ('eeeeeeee-0000-0000-0000-000000000004','NEW004','BAQ','G175',20,'2026-09-20','recibido');
insert into public.sider_certificaciones (viaje_id, punta, lat, lng) values
  ('eeeeeeee-0000-0000-0000-000000000002','llegada',10.96,-74.79),
  ('eeeeeeee-0000-0000-0000-000000000003','llegada',10.96,-74.79),
  ('eeeeeeee-0000-0000-0000-000000000004','llegada',10.96,-74.79);


-- =====================================================================
-- 1 · LO DE ANTES NO CAMBIÓ, Y EL SORTING ENTRA CON SU MARCA
-- =====================================================================
do $$
declare f text := ''; h record; m text; v_sorting int; v_det int;
begin
  select md5(string_agg(id::text || ':' || indice::text || ':' || no_abono::text || ':' ||
                        hl_defectos::text || ':' || defectos_hoja::text, '|' order by id))
    into m from public.v_sider_ai where tipo = 'ai';
  select * into h from public._rev_huella;
  if m is distinct from h.md5 then
    f := f || E'\n   · LAS AI DE ANTES CAMBIARON: la huella del cobro no es la misma';
  end if;
  if (select count(*) from public.v_sider_ai where tipo = 'ai') <> h.filas then
    f := f || E'\n   · cambió cuántas AI hay en el informe';
  end if;

  select count(*) into v_sorting from public.v_sider_ai where tipo = 'sorting';
  if v_sorting <> 1 then
    f := f || E'\n   · el Sorting hecho antes de migrar no entró al informe (entraron ' || v_sorting || ')';
  end if;
  if (select no_abono from public.v_sider_ai where tipo = 'sorting')
     is distinct from (select no_abono from public._rev_sorting_esperado) then
    f := f || E'\n   · el no-abono del Sorting que entra no es el calculado a mano';
  end if;
  if (select count(*) from public.v_sider_ai) <> h.filas + 1 then
    f := f || E'\n   · el informe no suma las dos clases';
  end if;

  /* EL DETALLE TAMBIÉN, o un informe por defecto no vería los conteos del
     Sorting aunque su fila ya esté sumando. */
  select count(*) into v_det from public.v_sider_ai_detalle
   where revision_id = 'dddddddd-0000-0000-0000-000000000004';
  if v_det <> 1 then
    f := f || E'\n   · v_sider_ai_detalle no trae los conteos del Sorting';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '1 · las AI de antes dan la misma huella, y el Sorting entra al informe con tipo (no-abono %)',
    (select no_abono from public.v_sider_ai where tipo = 'sorting');
end $$;


-- =====================================================================
-- 2 · CREAR EL CAMIÓN INTERNO — QUIÉN PUEDE
-- =====================================================================
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Barranquilla','G175',3)$q$,
    '%permiso «Camión interno»%', 'un operador SIN permiso creó un camión interno');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

/* Portería es es_editor() —edita Certificar— y aun así no crea: el permiso
   es el de la pantalla de Tránsito, no «cualquier editar». */
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role probador;
do $$
declare f text := '';
begin
  if not public.es_editor() then
    raise exception 'FALLA: el arnés está mal armado — Portería debería ser es_editor()';
  end if;
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Barranquilla','G175',3)$q$,
    '%permiso «Camión interno»%', 'UN ROL QUE EDITA OTRA PANTALLA creó un camión interno: se pide es_editor() y no el permiso «Camión interno»');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Barranquilla','G175',3)$q$,
    '%permiso «Camión interno»%', 'alguien SIN PERFIL creó un camión interno');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

/* EDITAR TRÁNSITO NO ALCANZA: recibir camiones no es poder inventarlos. Al
   operador se le abre Tránsito y sigue sin poder; con «ver» en el permiso
   nuevo tampoco; solo con «editar» en «Camión interno» sí. Se guarda lo que
   tenía para devolverlo igual. */
create table public._op_antes as
  select seccion, nivel from public.rol_permisos
   where rol = 'operador' and seccion in ('/sider/transito', '/sider/transito/nuevo');
insert into public.rol_permisos (rol, seccion, nivel) values ('operador', '/sider/transito', 'editar')
on conflict (rol, seccion) do update set nivel = 'editar';
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('OPE100','GAL','Barranquilla','G175',3)$q$,
    '%permiso «Camión interno»%', 'QUIEN EDITA TRÁNSITO creó un camión interno sin el permiso propio');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
insert into public.rol_permisos (rol, seccion, nivel) values ('operador', '/sider/transito/nuevo', 'ver')
on conflict (rol, seccion) do update set nivel = 'ver';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('OPE100','GAL','Barranquilla','G175',3)$q$,
    '%permiso «Camión interno»%', 'con «ver» en Camión interno se pudo crear');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
update public.rol_permisos set nivel = 'editar' where rol = 'operador' and seccion = '/sider/transito/nuevo';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._crear('op', 'OPE111', 'GAL', 'Barranquilla', 'G175', 1);
  if f <> '' then raise exception E'FALLA: con «editar» en Camión interno el operador no pudo crear:%', f; end if;
end $$;
reset role;
delete from public.rol_permisos where rol = 'operador' and seccion in ('/sider/transito', '/sider/transito/nuevo');
insert into public.rol_permisos (rol, seccion, nivel) select 'operador', seccion, nivel from public._op_antes;

do $$ begin raise notice '2 · crear un interno: solo con «editar» en Camión interno (editar Tránsito, «ver», Portería, sin permiso y sin perfil, no)'; end $$;

/* DE AQUÍ EN ADELANTE quien crea es el supervisor, y se le abre el permiso
   nuevo como lo haría el administrador en Roles. De fábrica nadie lo trae. */
insert into public.rol_permisos (rol, seccion, nivel) values ('supervisor', '/sider/transito/nuevo', 'editar')
on conflict (rol, seccion) do update set nivel = 'editar';


-- =====================================================================
-- 3 · CREAR EL CAMIÓN INTERNO — LO QUE LA BASE NO ACEPTA
-- ---------------------------------------------------------------------
-- Los desplegables no son una defensa: alguien llama la función a mano.
-- =====================================================================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('   ','GAL','Barranquilla','G175',3)$q$, '%Falta la placa%', 'aceptó una placa vacía');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear(null,'GAL','Barranquilla','G175',3)$q$, '%Falta la placa%', 'aceptó una placa nula');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('AB1234','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa AB1234 (2 letras y 4 números)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABCD12','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa ABCD12 (4 letras y 2 números)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('AB123','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa AB123 (5 caracteres)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC12','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa ABC12 (ABC12)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC1234','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa ABC1234 (siete caracteres)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABCD123','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa ABCD123 (una letra de más al principio)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('1ABC123','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa 1ABC123 (un número de más al principio)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('123ABC','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa 123ABC (números primero)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC 123','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa ABC 123 (con espacio en medio)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('AB-123','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa AB-123 (con guion)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ÑAB123','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa ÑAB123 (letra fuera de A-Z)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC12A','GAL','Barranquilla','G175',3)$q$, '%3 letras y 3 números%', 'aceptó la placa ABC12A (letra al final)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','ZZZ','Barranquilla','G175',3)$q$, '%origen no existe%', 'aceptó un origen inventado');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','OFF','Barranquilla','G175',3)$q$, '%origen no existe o está apagado%', 'aceptó un origen APAGADO');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','','G175',3)$q$, '%Falta el destino%', 'aceptó un destino vacío');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Atlantis','G175',3)$q$, '%destino no es un CD%', 'aceptó un destino que no es del maestro');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','CD Apagado','G175',3)$q$, '%destino no es un CD%', 'aceptó un destino APAGADO');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','cd galapa','G175',3)$q$, '%mismo CD%', 'aceptó origen y destino iguales (en minúsculas)');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Barranquilla','NOPE',3)$q$, '%material no existe%', 'aceptó un material inventado');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Barranquilla','G000',3)$q$, '%material no existe%', 'aceptó un material APAGADO');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Barranquilla','G175',0)$q$, '%Las estibas tienen que ser más de cero%', 'aceptó cero estibas');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Barranquilla','G175',-2)$q$, '%Las estibas tienen que ser más de cero%', 'aceptó estibas negativas');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ABC123','GAL','Barranquilla','G175',null)$q$, '%Las estibas tienen que ser más de cero%', 'aceptó estibas nulas');
  if f <> '' then raise exception E'FALLA:%', f; end if;

  raise notice '3 · la base rechaza placa vacía o que no sea 3 letras + 3 números, origen/destino/material inventados o apagados, mismo CD y estibas ≤ 0';
end $$;

/* Y LO QUE SÍ: destino en minúsculas se guarda como está en el maestro,
   con las cifras opcionales normalizadas. */
do $$
declare f text := ''; v uuid;
begin
  v := public.sider_viaje_interno_crear(' jyn245 ','GAL','barranquilla','G175',2.5,' fe-71 ',' l-9 ',' llegó lloviendo ');
  insert into public._ids values ('a', v);
  perform public._crear('b', 'INT222', 'GAL', 'Barranquilla', 'G350', 4);
  f := f || public._crear('c', 'INT333', 'BAQ', 'CD Galapa', 'G175', 1);
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

/* NADA SE GUARDÓ A MEDIAS: ninguno de los rechazos de arriba dejó un viaje. */
do $$ begin
  if exists (select 1 from public.sider_viajes where placa = 'ABC123') then
    raise exception 'FALLA: un rechazo dejó un viaje a medias';
  end if;
end $$;

do $$
declare f text := ''; r public.sider_viajes%rowtype;
begin
  select * into r from public.sider_viajes where id = (select id from public._ids where k = 'a');
  if r.placa <> 'JYN245'                    then f := f || E'\n   · la placa no quedó en mayúsculas y sin espacios: ' || r.placa; end if;
  if r.cd_destino <> 'Barranquilla'         then f := f || E'\n   · el destino no quedó como en el maestro: ' || r.cd_destino; end if;
  if r.interno is not true                  then f := f || E'\n   · no quedó marcado como interno'; end if;
  if r.requiere_sorting is not true         then f := f || E'\n   · no quedó con la revisión normal pedida'; end if;
  if r.sorting_pedido_por is distinct from '33333333-3333-3333-3333-333333333333'
                                            then f := f || E'\n   · no guardó QUIÉN lo creó como pedido'; end if;
  if r.sorting_pedido_en is null            then f := f || E'\n   · no guardó CUÁNDO'; end if;
  if r.creado_por is distinct from '33333333-3333-3333-3333-333333333333'
                                            then f := f || E'\n   · no guardó creado_por'; end if;
  if r.estado <> 'en_transito'              then f := f || E'\n   · no nació en tránsito: ' || r.estado; end if;
  if r.estibas <> 2.5                       then f := f || E'\n   · las estibas cambiaron: ' || r.estibas; end if;
  if r.factura <> 'FE-71' or r.lote <> 'L-9' then f := f || E'\n   · la factura o el lote no se normalizaron: ' || coalesce(r.factura,'∅') || ' / ' || coalesce(r.lote,'∅'); end if;
  if r.observacion <> 'llegó lloviendo'     then f := f || E'\n   · la nota no se guardó limpia'; end if;
  if r.fecha is distinct from (now() at time zone 'America/Bogota')::date
                                            then f := f || E'\n   · la fecha no es la de hoy en Colombia: ' || coalesce(r.fecha::text,'∅'); end if;
  if r.requiere_ai then f := f || E'\n   · nació con AI certificada pedida'; end if;
  if exists (select 1 from public.sider_certificaciones where viaje_id = r.id) then
    f := f || E'\n   · tiene una certificación que nadie hizo: un interno no tiene salida'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '3b · el interno nace en tránsito, con la revisión normal pedida, sin salida, con la fecha de hoy y los datos limpios';
end $$;


-- =====================================================================
-- 4 · LA LLEGADA: UN INTERNO NO EXIGE FOTOS DE SALIDA, UN NORMAL SÍ
-- ---------------------------------------------------------------------
-- Las dos caras juntas: la regla se relajó para el interno y NO para el
-- que viene certificado por Sider. Una sola cara dejaría pasar el error
-- de relajarla para todos.
-- =====================================================================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare f text := '';
begin
  /* EL CONTROL: un camión NORMAL sin las tres fotos de salida sigue sin
     poder recibirse. */
  f := f || public._espera_error($q$select public.sider_certificar_llegada('eeeeeeee-0000-0000-0000-000000000001', 10.9, -74.8, 5, now())$q$,
    '%faltan fotos%', 'UN CAMIÓN NORMAL sin fotos de salida se pudo recibir: la regla se relajó para todos');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

do $$
declare f text := '';
begin
  /* ANTES de llegar no hay nada que revisar: no está en la lista. */
  if exists (select 1 from public.v_sider_revision_pendientes
              where viaje_id = (select id from public._ids where k = 'a')) then
    f := f || E'\n   · el interno aparece por revisar ANTES de llegar';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;

set role probador;
do $$
declare f text := ''; v uuid := (select id from public._ids where k = 'a');
begin
  f := f || public._espera_bien(format($q$select public.sider_certificar_llegada(%L, 10.9, -74.8, 5, now(), 'ok', 'Patio')$q$, v),
    'recibir un camión interno sin fotos de salida');
  /* Y NO SE RECIBE DOS VECES. */
  f := f || public._espera_error(format($q$select public.sider_certificar_llegada(%L, 10.9, -74.8, 5, now())$q$, v),
    '%ya está recibido%', 'recibió dos veces el mismo interno');
  /* SIN UBICACIÓN NO: eso no se relajó. */
  f := f || public._espera_error(format($q$select public.sider_certificar_llegada(%L, null, null, 5, now())$q$, (select id from public._ids where k = 'b')),
    '%Falta la ubicación%', 'recibió un interno sin ubicación');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

do $$
declare f text := ''; v uuid := (select id from public._ids where k = 'a');
begin
  if (select estado from public.sider_viajes where id = v) <> 'recibido' then
    f := f || E'\n   · el interno no quedó recibido'; end if;
  if not exists (select 1 from public.v_sider_revision_pendientes
                  where viaje_id = v and tipo = 'sorting' and interno) then
    f := f || E'\n   · al certificar la llegada NO pasó a «revisión normal»'; end if;
  if exists (select 1 from public.v_sider_revision_pendientes where viaje_id = v and tipo = 'ai') then
    f := f || E'\n   · el interno aparece también como AI certificada'; end if;
  if (select llego_en from public.v_sider_revision_pendientes where viaje_id = v and tipo = 'sorting') is null then
    f := f || E'\n   · la lista no trae cuándo llegó'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '4 · el interno se recibe sin fotos de salida y pasa a revisión normal; el normal sin fotos sigue sin poder';
end $$;


-- =====================================================================
-- 5 · GUARDAR LA REVISIÓN DEL INTERNO ENTRA AL COBRO, MARCADA
-- =====================================================================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare f text := ''; v uuid := (select id from public._ids where k = 'a');
begin
  f := f || public._guardar(v, 'sorting', 4104, 37);
  /* UN INTERNO NO LLEVA AI CERTIFICADA: nadie la pidió y la base no la deja. */
  f := f || public._espera_error(format($q$select public.sider_ai_guardar(%L,'T1','t1',null,'G175',false,82080,4104,'{}'::jsonb)$q$, v),
    '%no está marcado para revisión AI certificada%', 'guardó una AI certificada de un camión interno');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

do $$
declare f text := ''; v uuid := (select id from public._ids where k = 'a'); h record; esperado int;
begin
  select * into h from public._rev_huella;
  esperado := round(82080 * 37::numeric / 4104)::int;
  if not exists (select 1 from public.v_sider_ai where viaje_id = v and tipo = 'sorting') then
    f := f || E'\n   · la revisión normal no entró al informe'; end if;
  if (select no_abono from public.v_sider_ai where viaje_id = v and tipo = 'sorting') <> esperado then
    f := f || E'\n   · el no-abono de la revisión normal no es el calculado a mano (' || esperado || ')'; end if;
  if (select sum(no_abono) from public.v_sider_ai)
     <> h.no_abono + (select no_abono from public._rev_sorting_esperado) + esperado then
    f := f || E'\n   · el cobro total del informe no es AI de antes + normal viejo + normal nuevo'; end if;
  if exists (select 1 from public.v_sider_revision_pendientes where viaje_id = v) then
    f := f || E'\n   · después de guardar sigue en la lista de por hacer'; end if;
  if (select count(*) from public.v_sider_ai_detalle d
        join public.v_sider_ai a on a.id = d.revision_id where a.viaje_id = v) <> 1 then
    f := f || E'\n   · el detalle de la revisión nueva no está en v_sider_ai_detalle'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '5 · la revisión normal entra al informe con tipo y suma al cobro (no-abono %)', esperado;
end $$;


-- =====================================================================
-- 6 · QUIÉN GUARDA — UN SOLO PERMISO PARA LAS DOS, POR PANTALLA
-- ---------------------------------------------------------------------
-- El hueco viejo: es_editor() es cierto con cualquier «editar». Portería
-- edita Certificar y no debe guardar NINGUNA de las dos.
-- =====================================================================
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
begin
  /* El administrador pide la certificada de dos camiones que ya llegaron
     (NEW002, NEW003) y la normal de NEW003 y NEW004. */
  perform public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000002', true, null);
  perform public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000003', true, null);
  perform public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000003', true);
  perform public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000004', true);
end $$;
reset role;

set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role probador;
do $$
declare f text := '';
begin
  if not public.es_editor() then
    raise exception 'FALLA: el arnés está mal armado — Portería debería ser es_editor()';
  end if;
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000002','T1','t1',null,'G175',false,1000,100,'{}'::jsonb)$q$,
    '%permiso de edición en Revisión AI%', 'un rol que edita OTRA pantalla guardó una AI certificada');
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000004','T1','t1',null,'G175',false,1000,100,'{}'::jsonb,null,null,'sorting')$q$,
    '%permiso de edición en Revisión AI%', 'un rol que edita OTRA pantalla guardó una revisión normal');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000002','T1','t1',null,'G175',false,1000,100,'{}'::jsonb)$q$,
    '%permiso de edición en Revisión AI%', 'un operador SIN permiso guardó una AI certificada');
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000004','T1','t1',null,'G175',false,1000,100,'{}'::jsonb,null,null,'sorting')$q$,
    '%permiso de edición en Revisión AI%', 'un operador SIN permiso guardó una revisión normal');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

/* El administrador le abre «Revisión AI» al operador (en la app: Roles). */
insert into public.rol_permisos (rol, seccion, nivel) values ('operador', '/sider/sorting', 'editar')
on conflict (rol, seccion) do update set nivel = 'editar';
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare f text := '';
begin
  /* CON EL PERMISO DE LA PANTALLA GUARDA LAS DOS —las dos cobran, y se
     hacen en la misma pantalla—, sin necesitar nada de Tránsito. */
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000002', 'ai', 4104, 20);
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000004', 'sorting', 4104, 8);
  /* Y SOLO SI EL VIAJE LO PIDIÓ: el permiso no reemplaza la marca. */
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000004','T1','t1',null,'G175',false,1000,100,'{}'::jsonb)$q$,
    '%no está marcado para revisión AI certificada%', 'guardó una AI certificada de un camión que no la pidió');
  /* NI PEDIR NI QUITAR: eso sigue siendo del administrador. */
  f := f || public._espera_error($q$select public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000001', true, null)$q$,
    '%solo del administrador%', 'el operador con permiso de revisión pudo pedir una AI');
  f := f || public._espera_error($q$select public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000001', true)$q$,
    '%solo del administrador%', 'el operador con permiso de revisión pudo pedir una revisión normal');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
delete from public.rol_permisos where rol = 'operador' and seccion = '/sider/sorting';

/* QUIEN SOLO EDITA TRÁNSITO SIGUE GUARDANDO, como antes de esta migración:
   la AI se hacía dentro de Tránsito y ese permiso no se puede perder. Es
   un rol aparte y no el supervisor porque el supervisor trae TAMBIÉN el
   permiso de Revisión AI y taparía si la puerta de Tránsito se cerrara. */
insert into public.roles (clave, nombre, descripcion, manda, sistema, orden)
values ('solo_transito', 'Solo Tránsito', 'Edita Tránsito y nada más.', false, false, 9)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, seccion, nivel)
values ('solo_transito', '/sider/transito', 'editar') on conflict do nothing;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666','tr@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo)
values ('66666666-6666-6666-6666-666666666666','tr','Solo Transito','solo_transito',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado, requiere_ai)
values ('eeeeeeee-0000-0000-0000-000000000008','NEW008','BAQ','G175',20,'2026-09-20','recibido',true);
insert into public.sider_certificaciones (viaje_id, punta, lat, lng)
values ('eeeeeeee-0000-0000-0000-000000000008','llegada',10.96,-74.79);
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
set role probador;
do $$
declare f text := '';
begin
  if public.puede_editar('/sider/sorting') then
    raise exception 'FALLA: el arnés está mal armado — este rol no debería editar Revisión AI';
  end if;
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000008', 'ai', 4104, 6);
  if f <> '' then raise exception E'FALLA: quien solo edita Tránsito perdió lo que ya podía:%', f; end if;
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('TRA111','GAL','Barranquilla','G175',3)$q$,
    '%permiso «Camión interno»%', 'quien solo edita Tránsito creó un camión interno');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

/* EL SUPERVISOR SIGUE GUARDANDO con la fila que sembró la migración
   anterior y el permiso de Tránsito de siempre. */
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000003', 'ai', 4104, 12);
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000003', 'sorting', 4104, 5);
  if f <> '' then raise exception E'FALLA: el supervisor perdió lo que ya podía:%', f; end if;
  raise notice '6 · un solo permiso (editar Revisión AI o Tránsito) guarda las dos; Portería y el operador sin permiso, ninguna';
end $$;
reset role;


-- =====================================================================
-- 7 · LAS MARCAS DEL INTERNO NO SE TOCAN A MANO
-- =====================================================================
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare f text := ''; v uuid := (select id from public._ids where k = 'b');
begin
  f := f || public._espera_error(format($q$select public.sider_ai_marcar(%L, true, null)$q$, v),
    '%interno no lleva revisión AI certificada%', 'se le pidió AI certificada a un interno');
  f := f || public._espera_error(format($q$select public.sider_sorting_marcar(%L, false)$q$, v),
    '%interno siempre pasa%', 'se le quitó la revisión normal a un interno');
  /* El control: a un camión normal sí se le pide y se le quita. */
  f := f || public._espera_bien($q$select public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000001', true, null)$q$, 'pedir AI a un camión normal');
  f := f || public._espera_bien($q$select public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000001', false, null)$q$, 'quitar AI a un camión normal');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;

/* LA TABLA TAMBIÉN SE DEFIENDE, por si alguien salta la función. */
do $$
declare f text := '';
begin
  f := f || public._espera_error(format($q$update public.sider_viajes set requiere_sorting = false where id = %L$q$, (select id from public._ids where k = 'b')),
    '%sider_interno_pasa_a_revision%', 'la tabla dejó un interno sin revisión normal');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '7 · a un interno no se le pide AI certificada ni se le quita la normal (ni por la función ni por la tabla)';
end $$;


-- =====================================================================
-- 8 · EL SEGUIMIENTO NO CUENTA LOS INTERNOS
-- ---------------------------------------------------------------------
-- Dos caras: hoy solo hay internos (0 viajes certificados) y el 20 de
-- septiembre hay cinco normales (5). Si se cuentan los internos, o si se
-- dejan de contar los normales, una de las dos cifras se rompe.
-- =====================================================================
do $$
declare f text := ''; hoy date := (now() at time zone 'America/Bogota')::date;
        v_hoy bigint; v_20 bigint; esp_20 bigint; e_hoy numeric; d_hoy bigint; d_20 bigint;
begin
  select coalesce(sum(viajes),0), coalesce(sum(estibas),0) into v_hoy, e_hoy
    from public.sider_seguimiento(hoy, hoy);
  select coalesce(sum(viajes),0) into v_20 from public.sider_seguimiento('2026-09-20','2026-09-20');
  select count(*) into esp_20 from public.sider_viajes
   where fecha = '2026-09-20' and estado <> 'anulado' and not interno;

  if (select count(*) from public.sider_viajes where fecha = hoy and interno) < 3 then
    raise exception 'FALLA: el arnés está mal armado — debería haber internos de hoy';
  end if;
  if v_hoy <> 0 or e_hoy <> 0 then
    f := f || E'\n   · EL SEGUIMIENTO CUENTA LOS INTERNOS COMO CERTIFICADOS: ' || v_hoy || ' viajes y ' || e_hoy || ' estibas de hoy';
  end if;
  if v_20 <> esp_20 or esp_20 <> 5 then
    f := f || E'\n   · el seguimiento dejó de contar los camiones normales: ' || v_20 || ' de ' || esp_20;
  end if;

  select coalesce(sum(viajes),0) into d_hoy from public.v_sider_dias where fecha = hoy;
  select coalesce(sum(viajes),0) into d_20 from public.v_sider_dias where fecha = '2026-09-20';
  if d_hoy <> 0 then f := f || E'\n   · el calendario cuenta los internos como viajes del día'; end if;
  if d_20 <> 5 then f := f || E'\n   · el calendario dejó de contar los normales'; end if;

  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '8 · el %% de certificación y el calendario no cuentan internos y siguen contando los normales';
end $$;


-- =====================================================================
-- 9 · LA LISTA DE TRABAJO: LAS DOS CLASES, SIN PISARSE
-- =====================================================================
do $$
declare f text := '';
begin
  /* NEW002: certificada hecha (paso 6). NEW003: las dos hechas. NEW004:
     normal hecha. Se marca uno nuevo con las dos y se mira la lista. */
  insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado, requiere_ai, requiere_sorting)
  values ('eeeeeeee-0000-0000-0000-000000000005','NEW005','BAQ','G175',20,'2026-09-20','recibido',true,true),
         ('eeeeeeee-0000-0000-0000-000000000006','NEW006','BAQ','G175',20,'2026-09-20','recibido',false,true),
         ('eeeeeeee-0000-0000-0000-000000000007','NEW007','BAQ','G175',20,'2026-09-20','en_transito',true,true);
  insert into public.sider_certificaciones (viaje_id, punta, lat, lng) values
    ('eeeeeeee-0000-0000-0000-000000000005','llegada',10.96,-74.79),
    ('eeeeeeee-0000-0000-0000-000000000006','llegada',10.96,-74.79);

  if (select count(*) from public.v_sider_revision_pendientes where viaje_id = 'eeeeeeee-0000-0000-0000-000000000005') <> 2 then
    f := f || E'\n   · un camión con las dos marcas debe salir DOS veces (una por clase)'; end if;
  if exists (select 1 from public.v_sider_revision_pendientes where viaje_id = 'eeeeeeee-0000-0000-0000-000000000007') then
    f := f || E'\n   · un camión que no ha llegado aparece por revisar'; end if;
  if (select tipo from public.v_sider_revision_pendientes where viaje_id = 'eeeeeeee-0000-0000-0000-000000000006') <> 'sorting' then
    f := f || E'\n   · la clase de la normal no es sorting'; end if;
  /* Lo ya hecho no sale: NEW002 (certificada), NEW003 (las dos), NEW004 (normal). */
  if exists (select 1 from public.v_sider_revision_pendientes
              where viaje_id in ('eeeeeeee-0000-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000003','eeeeeeee-0000-0000-0000-000000000004')) then
    f := f || E'\n   · un camión con su revisión hecha sigue por hacer'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;

/* Hacer UNA clase no apaga la otra: es el error silencioso de siempre. */
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000005', 'sorting', 4104, 3);
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
do $$
declare f text := '';
begin
  if (select array_agg(tipo order by tipo) from public.v_sider_revision_pendientes
       where viaje_id = 'eeeeeeee-0000-0000-0000-000000000005') is distinct from array['ai'] then
    f := f || E'\n   · hacer la normal apagó la certificada del mismo camión (o no salió de la lista)';
  end if;
  /* Y AL REVÉS: hacer la CERTIFICADA tampoco apaga la normal del mismo
     camión (NEW009 nace con las dos y solo se guarda la certificada). */
  insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado, requiere_ai, requiere_sorting)
  values ('eeeeeeee-0000-0000-0000-000000000009','NEW009','BAQ','G175',20,'2026-09-20','recibido',true,true);
  insert into public.sider_certificaciones (viaje_id, punta, lat, lng)
  values ('eeeeeeee-0000-0000-0000-000000000009','llegada',10.96,-74.79);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  set local role probador;
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000009', 'ai', 4104, 3);
  reset role;
  if (select array_agg(tipo order by tipo) from public.v_sider_revision_pendientes
       where viaje_id = 'eeeeeeee-0000-0000-0000-000000000009') is distinct from array['sorting'] then
    f := f || E'\n   · hacer la certificada apagó la normal del mismo camión (o no salió de la lista)';
  end if;
  /* Anulado: no espera nada. */
  update public.sider_viajes set estado = 'anulado', motivo_anulacion = 'prueba', anulado_en = now() where id = 'eeeeeeee-0000-0000-0000-000000000006';
  if exists (select 1 from public.v_sider_revision_pendientes where viaje_id = 'eeeeeeee-0000-0000-0000-000000000006') then
    f := f || E'\n   · un anulado sigue esperando revisión'; end if;
  update public.sider_viajes set estado = 'recibido', motivo_anulacion = null, anulado_en = null where id = 'eeeeeeee-0000-0000-0000-000000000006';
  if not exists (select 1 from public.v_sider_revision_pendientes where viaje_id = 'eeeeeeee-0000-0000-0000-000000000006') then
    f := f || E'\n   · al devolver un anulado no vuelve a la lista'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '9 · la lista trae las dos clases sin pisarse; hacer una no apaga la otra; anulados fuera y de vuelta al devolverlos';
end $$;


-- =====================================================================
-- 10 · UNA SOLA FUNCIÓN GUARDAR, Y EL INTERNO EN LA VISTA GRANDE
-- =====================================================================
do $$
declare f text := '';
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'sider_ai_guardar') <> 1 then
    f := f || E'\n   · sider_ai_guardar tiene más de una versión'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'sider_viaje_interno_crear') <> 1 then
    f := f || E'\n   · sider_viaje_interno_crear tiene más de una versión'; end if;
  /* La vista grande lee al interno SIN salida: fecha, en_camino nulo,
     cero fotos de salida. La pantalla depende de eso. */
  if (select fotos_salida from public.v_sider_viajes where id = (select id from public._ids where k = 'b')) <> 0 then
    f := f || E'\n   · el interno trae fotos de salida'; end if;
  if (select salida_en from public.v_sider_viajes where id = (select id from public._ids where k = 'b')) is not null then
    f := f || E'\n   · el interno trae hora de salida'; end if;
  if (select en_camino from public.v_sider_viajes where id = (select id from public._ids where k = 'b')) is not null then
    f := f || E'\n   · el interno trae «en camino»'; end if;
  if (select fecha::date from public.v_sider_viajes where id = (select id from public._ids where k = 'b'))
     is distinct from (now() at time zone 'America/Bogota')::date then
    f := f || E'\n   · la fecha del interno en la vista no es la de hoy'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '10 · una sola función de cada una, y la vista grande lee al interno sin salida';
end $$;
