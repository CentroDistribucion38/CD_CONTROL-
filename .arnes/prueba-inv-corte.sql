\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function public._espera_error(p_sql text, p_patron text, p_desc text) returns text
language plpgsql as $$
begin
  begin execute p_sql; return E'\n   · ' || p_desc;
  exception when others then
    if sqlerrm like p_patron then return ''; end if;
    return E'\n   · ' || p_desc || ' (falló, pero con otra cosa: ' || sqlerrm || ')';
  end;
end $$;
grant execute on function public._espera_error(text, text, text) to public;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('44444444-4444-4444-4444-444444444444','lector@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true),
  ('44444444-4444-4444-4444-444444444444','lector','Lector','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
grant probador to postgres; grant authenticated to probador;

/* El supervisor EDITA el corte; el operador solo lo VE. */
insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor','/inventario/corte','editar'), ('operador','/inventario/corte','ver')
on conflict (rol, seccion) do update set nivel = excluded.nivel;

insert into public.bodegas (id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001','CDT','CD de prueba'),
                                                       ('bbbbbbbb-0000-0000-0000-000000000002','OTR','Otra bodega');
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values
  ('bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER'),
  ('bbbbbbbb-1000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','B12_IZQ','B','12','IZQ'),
  ('bbbbbbbb-1000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000002','Z99_DER','Z','99','DER');

-- ---------------------------------------------------------------------
-- I1 · CORTE INICIAL COMPLETO: cabecera y renglones, y la línea sale del catálogo
-- ---------------------------------------------------------------------
create table public._ids (k text primary key, v uuid); grant all on public._ids to public;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare v_id uuid;
begin
  v_id := public.inv_corte_guardar('bbbbbbbb-0000-0000-0000-000000000001','inicial',null,
    now() - interval '10 hours', 'A las 6',
    '[{"linea":"L1","cajas_depa":18801,
       "origen":{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000001","cant":40,"unidad":"estibas"},
       "destino":{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000002","cant":900,"unidad":"cajas"}},
      {"linea":"L2","cajas_depa":5000}]'::jsonb);
  insert into public._ids values ('ini', v_id);
end $$;
reset role;
do $$
declare v_id uuid := (select v from public._ids where k='ini'); f text := '';
begin
  if (select count(*) from public.inv_corte_renglones where corte_id = v_id) <> 2 then f := f || E'\n   · no guardó los 2 renglones'; end if;
  if not exists (select 1 from public.inv_corte_renglones where corte_id = v_id and linea='L1' and cajas_depa = 18801
      and origen_cant = 40 and origen_unidad = 'estibas' and destino_cant = 900 and destino_unidad = 'cajas') then f := f || E'\n   · el renglón L1 no quedó como se mandó'; end if;
  if (select creado_por from public.inv_cortes where id = v_id) is distinct from '33333333-3333-3333-3333-333333333333'::uuid then f := f || E'\n   · no guardó quién hizo el corte'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'I1 · el corte inicial guarda cabecera, líneas, ubicaciones y quién lo hizo';
end $$;

-- ---------------------------------------------------------------------
-- I2 · LOS RECHAZOS, y un rechazo no deja nada a medias
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.inv_corte_guardar('bbbbbbbb-0000-0000-0000-000000000001','inicial',null, now() - interval '1 hour', null, '[{"linea":"L1","cajas_depa":1}]'::jsonb)$q$,
        '%requiere el permiso%', 'quien solo lee pudo guardar un corte');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := '';
  b constant text := 'bbbbbbbb-0000-0000-0000-000000000001';
begin
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() + interval ''3 hours'', null, ''[{"linea":"L1","cajas_depa":1}]''::jsonb)', '%del futuro%', 'aceptó una hora del futuro');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[]''::jsonb)', '%al menos una línea%', 'aceptó un corte sin líneas');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L9","cajas_depa":1}]''::jsonb)', '%no existe o está apagada%', 'aceptó una línea que no existe');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":1},{"linea":"L1","cajas_depa":2}]''::jsonb)', '%repetida%', 'aceptó la línea dos veces');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":-5}]''::jsonb)', '%número entero%', 'aceptó cajas negativas');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":12.5}]''::jsonb)', '%número entero%', 'aceptó cajas con decimales');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":1,"origen":{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000001","cant":5}}]''::jsonb)', '%incompleto%', 'aceptó un origen sin unidad');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":1,"destino":{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000003","cant":5,"unidad":"cajas"}}]''::jsonb)', '%no es de esta bodega%', 'aceptó una ubicación de otra bodega');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":1,"origen":{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000003","cant":5,"unidad":"cajas"}}]''::jsonb)', '%origen de L1 no es de esta bodega%', 'aceptó un ORIGEN de otra bodega');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''final'',null, now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":1}]''::jsonb)', '%necesita su corte inicial%', 'aceptó un final sin inicial');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',''' || (select v from public._ids where k='ini') || ''', now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":1}]''::jsonb)', '%no cierra otro%', 'un inicial pudo cerrar otro');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''final'',''' || (select v from public._ids where k='ini') || ''', now() - interval ''20 hours'', null, ''[{"linea":"L1","cajas_depa":1}]''::jsonb)', '%DESPUÉS del inicial%', 'aceptó un final ANTES del inicial');
  f := f || public._espera_error('select public.inv_corte_guardar(''bbbbbbbb-0000-0000-0000-000000000002'',''final'',''' || (select v from public._ids where k='ini') || ''', now() - interval ''1 hour'', null, ''[{"linea":"L1","cajas_depa":1}]''::jsonb)', '%misma bodega%', 'aceptó un final de otra bodega');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
do $$
begin
  /* Cada rechazo ocurrió DESPUÉS de insertar la cabecera: si algo quedó, no es transaccional. */
  if (select count(*) from public.inv_cortes) <> 1 then raise exception 'FALLA: un rechazo dejó una cabecera huérfana (hay % cortes)', (select count(*) from public.inv_cortes); end if;
  raise notice 'I2 · rechaza sin permiso, hora futura, sin líneas, línea inexistente o repetida, cajas malas, ubicación incompleta o de otra bodega, final sin inicial, antes del inicial; y no deja nada a medias';
end $$;

-- ---------------------------------------------------------------------
-- I3 · EL FINAL CIERRA EL INICIAL, UNA SOLA VEZ
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare v_id uuid; f text := '';
begin
  v_id := public.inv_corte_guardar('bbbbbbbb-0000-0000-0000-000000000001','final',(select v from public._ids where k='ini'),
    now() - interval '1 hour', null,
    '[{"linea":"L1","cajas_depa":30801,
       "origen":{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000001","cant":30,"unidad":"estibas"},
       "destino":{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000002","cant":1800,"unidad":"cajas"}}]'::jsonb);
  insert into public._ids values ('fin', v_id);
  f := f || public._espera_error('select public.inv_corte_guardar(''bbbbbbbb-0000-0000-0000-000000000001'',''final'',''' || (select v from public._ids where k='ini') || ''', now() - interval ''30 minutes'', null, ''[{"linea":"L1","cajas_depa":1}]''::jsonb)',
        '%ya tiene su corte final%', 'el mismo inicial aceptó dos finales');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.inv_cortes where tipo = 'final' and inicial_id = (select v from public._ids where k='ini')) then
    raise exception 'FALLA: el final no quedó atado a su inicial';
  end if;
  raise notice 'I3 · el final queda atado a su inicial y un inicial no admite dos finales';
end $$;

-- ---------------------------------------------------------------------
-- I4 · LEER: el operador ve; quien no tiene el permiso no ve nada
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$
begin
  if (select count(*) from public.inv_cortes) <> 2 or (select count(*) from public.inv_lineas) <> 4 then
    raise exception 'FALLA: quien puede ver no ve los cortes o las líneas';
  end if;
end $$;
reset role;
delete from public.rol_permisos where rol = 'operador' and seccion = '/inventario/corte';
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$
begin
  if (select count(*) from public.inv_cortes) <> 0 then raise exception 'FALLA: sin el permiso se ven los cortes'; end if;
  raise notice 'I4 · ver requiere el permiso: con él se ven los cortes, sin él no se ve ninguno';
end $$;
reset role;

-- ---------------------------------------------------------------------
-- I5 · ELIMINAR: solo quien administra; el inicial se lleva su final
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error('select public.inv_corte_eliminar(''' || (select v from public._ids where k='fin') || ''')', '%Solo quien administra%', 'quien no administra pudo eliminar un corte');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$ begin perform public.inv_corte_eliminar((select v from public._ids where k='fin')); end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.inv_cortes where id = (select v from public._ids where k='ini')) then raise exception 'FALLA: borrar el final se llevó el inicial'; end if;
  if exists (select 1 from public.inv_cortes where tipo = 'final') then raise exception 'FALLA: el final no se borró'; end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$ begin perform public.inv_corte_eliminar((select v from public._ids where k='ini')); end $$;
reset role;
do $$
begin
  if exists (select 1 from public.inv_corte_renglones) or exists (select 1 from public.inv_cortes) then raise exception 'FALLA: borrar el inicial no se llevó lo suyo'; end if;
  raise notice 'I5 · eliminar es solo de quien administra; el final se borra solo y el inicial se lleva sus renglones';
end $$;

-- ---------------------------------------------------------------------
-- I6 · LO QUE SE TOMA ES ENVASE: el envase del origen solo admite materiales
--      tipo ENVASE, y el producto que sale se guarda aparte
-- ---------------------------------------------------------------------
insert into public.productos (id, sku, nombre, activo, tipo_material) values
  ('bbbbbbbb-2000-0000-0000-000000000001', 'ENV1', 'Botella de prueba', true, 'ENVASE'),
  ('bbbbbbbb-2000-0000-0000-000000000002', 'PRO1', 'Producto de prueba', true, 'PRODUCTO');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := ''; v_id uuid;
  b constant text := 'bbbbbbbb-0000-0000-0000-000000000001';
begin
  v_id := public.inv_corte_guardar(b::uuid, 'inicial', null, now() - interval '2 hours', null,
    '[{"linea":"L1","cajas_depa":100,"material_id":"bbbbbbbb-2000-0000-0000-000000000002","envase_id":"bbbbbbbb-2000-0000-0000-000000000001",
       "origen":{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000001","cant":4,"unidad":"estibas"}}]'::jsonb);
  insert into public._ids values ('env', v_id);
  /* Un PRODUCTO no puede ir donde va el envase. */
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L2","cajas_depa":1,"envase_id":"bbbbbbbb-2000-0000-0000-000000000002"}]''::jsonb)',
        '%no es un envase%', 'aceptó un producto como envase');
  f := f || public._espera_error('select public.inv_corte_guardar(''' || b || ''',''inicial'',null, now() - interval ''1 hour'', null, ''[{"linea":"L2","cajas_depa":1,"envase_id":"bbbbbbbb-2000-0000-0000-00000000ffff"}]''::jsonb)',
        '%no es un envase%', 'aceptó un envase que no existe');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
do $$
declare f text := '';
begin
  if not exists (select 1 from public.inv_corte_renglones where corte_id = (select v from public._ids where k='env') and linea = 'L1'
       and envase_id = 'bbbbbbbb-2000-0000-0000-000000000001' and material_id = 'bbbbbbbb-2000-0000-0000-000000000002') then
    f := f || E'\n   · no guardó el envase y el producto por separado'; end if;
  if (select count(*) from public.inv_cortes) <> 1 then f := f || E'\n   · un rechazo dejó una cabecera huérfana'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'I6 · el envase del origen solo acepta materiales tipo ENVASE y se guarda aparte del producto';
end $$;
