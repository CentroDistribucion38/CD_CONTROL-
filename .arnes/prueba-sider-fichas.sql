-- La salida en dos tiempos: ficha (patio) y dar salida con factura (facturador).
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

insert into public.roles (clave, nombre, descripcion, manda, sistema, orden) values
  ('patio', 'Patio', 'Certifica en el patio.', false, false, 91),
  ('facturador', 'Facturador', 'Da salida con la factura.', false, false, 92)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, seccion, nivel) values
  ('patio', '/sider/certificar', 'editar'),
  ('facturador', '/sider/salida', 'editar')
on conflict do nothing;
insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001','patio1@x.local'),
  ('a1a1a1a1-0000-0000-0000-000000000002','patio2@x.local'),
  ('f1f1f1f1-0000-0000-0000-000000000001','fact@x.local'),
  ('99999999-0000-0000-0000-000000000001','jefe@x.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('a1a1a1a1-0000-0000-0000-000000000001','patio1','Patio Uno','patio',true),
  ('a1a1a1a1-0000-0000-0000-000000000002','patio2','Patio Dos','patio',true),
  ('f1f1f1f1-0000-0000-0000-000000000001','fact','Facturador','facturador',true),
  ('99999999-0000-0000-0000-000000000001','jefe','Jefe','admin',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
insert into public.sider_origenes (planta, cd_origen, activo) values ('GAL','CD Galapa',true), ('OFF','CD Apagado',false)
  on conflict (planta) do update set activo = excluded.activo;
insert into public.sider_skus (sku, descripcion, activo) values
  ('G175','Costeñita 175',true), ('G350','Costeñita 350',true), ('G000','Apagado',false)
  on conflict (sku) do update set activo = excluded.activo;
create table if not exists public._f (k text primary key, id uuid);
grant all on public._f to public;
grant execute on function public.sider_ficha_guardar(text,text,numeric,numeric,numeric,timestamptz,text,text,text,jsonb) to authenticated;

-- ---------- F1: el patio guarda; NO nace ningún viaje ----------
set request.jwt.claim.sub = 'a1a1a1a1-0000-0000-0000-000000000001';
set role probador;
do $$
declare v uuid;
begin
  v := public.sider_ficha_guardar('fic001','GAL',10.96,-74.79,12,now(),'Calle 1','nota','l1',
       '[{"sku":"G175","estibas":40},{"sku":"G350","estibas":12}]'::jsonb);
  insert into public._f values ('a', v);
  insert into public.sider_ficha_fotos (ficha_id, ranura, ruta) values
    (v,'costado_izq','fichas/a/i.jpg'), (v,'costado_der','fichas/a/d.jpg'), (v,'placa','fichas/a/p.jpg');
  /* una segunda con solo dos fotos */
  v := public.sider_ficha_guardar('FIC002','GAL',10.96,-74.79,12,now(),null,null,null,'[{"sku":"G175","estibas":5}]'::jsonb);
  insert into public._f values ('b', v);
  insert into public.sider_ficha_fotos (ficha_id, ranura, ruta) values (v,'placa','fichas/b/p.jpg');
  raise notice 'F1a · el patio guarda dos fichas y sube sus fotos';
end $$;
reset role;
do $$
declare f text := '';
begin
  if exists (select 1 from public.sider_viajes where placa in ('FIC001','FIC002')) then f := f || E'\n   · guardar la ficha creó viajes: aparecerían en Tránsito sin factura'; end if;
  if (select count(*) from public.sider_ficha_lineas l join public.sider_fichas h on h.id = l.ficha_id where h.placa = 'FIC001') <> 2 then f := f || E'\n   · la ficha no guardó sus dos materiales'; end if;
  if (select placa from public.sider_fichas where id = (select id from public._f where k='a')) <> 'FIC001' then f := f || E'\n   · la placa no quedó en mayúsculas'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'F1 · guardar la ficha no crea viajes, guarda sus materiales';
end $$;

-- ---------- F2: quién ve qué ----------
set request.jwt.claim.sub = 'a1a1a1a1-0000-0000-0000-000000000001'; set role probador;
do $$ declare f text := ''; begin
  if (select count(*) from public.sider_fichas) <> 2 then f := f || E'\n   · quien creó no ve sus fichas'; end if;
  if (select count(*) from public.sider_ficha_lineas) <> 3 or (select count(*) from public.sider_ficha_fotos) <> 4 then f := f || E'\n   · quien creó no ve las líneas o fotos de las suyas'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
set request.jwt.claim.sub = 'a1a1a1a1-0000-0000-0000-000000000002';
do $$ declare f text := ''; begin
  if (select count(*) from public.sider_fichas) <> 0 then f := f || E'\n   · otra persona del patio ve las fichas de alguien más'; end if;
  if (select count(*) from public.sider_ficha_lineas) <> 0 or (select count(*) from public.sider_ficha_fotos) <> 0 then f := f || E'\n   · otra persona ve las líneas o fotos ajenas'; end if;
  f := f || public._espera_error($q$insert into public.sider_ficha_fotos (ficha_id, ranura, ruta) select id, 'costado_izq', 'x' from public._f where k='b'$q$, '%row-level security%', 'subió una foto a la ficha de otro');
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
set request.jwt.claim.sub = 'f1f1f1f1-0000-0000-0000-000000000001';
do $$ declare f text := ''; begin
  if (select count(*) from public.sider_fichas) <> 2 then f := f || E'\n   · el facturador no ve todas las pendientes'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
set request.jwt.claim.sub = '99999999-0000-0000-0000-000000000001';
do $$ declare f text := ''; begin
  if (select count(*) from public.sider_fichas) <> 2 then f := f || E'\n   · el administrador no ve todas'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if; raise notice 'F2 · cada uno ve las suyas, el facturador y el administrador ven todas'; end $$;

-- ---------- F3: dar salida ----------
set request.jwt.claim.sub = 'a1a1a1a1-0000-0000-0000-000000000001';
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida((select id from public._f where k='a'), '77')$q$, '%permiso%', 'quien creó la ficha le dio salida sin ser facturador');
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
set request.jwt.claim.sub = 'f1f1f1f1-0000-0000-0000-000000000001';
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida((select id from public._f where k='a'), '   ')$q$, '%factura%', 'dio salida sin número de factura');
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida((select id from public._f where k='b'), '77')$q$, '%faltan fotos%', 'dio salida a una ficha con menos de 3 fotos');
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida((select id from public._f where k='a'), repeat('9', 11))$q$, '%muy largo%', 'aceptó una factura de 11 dígitos');
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida((select id from public._f where k='a'), 'FE-4471')$q$, '%solo números%', 'aceptó una factura con letras');
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida((select id from public._f where k='a'), '123 456')$q$, '%solo números%', 'aceptó una factura con espacio adentro');
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida(gen_random_uuid(), '77')$q$, '%no existe%', 'dio salida a una ficha que no existe');
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
reset role;
do $$ declare f text := ''; begin
  if exists (select 1 from public.sider_viajes where placa = 'FIC001') then f := f || E'\n   · los intentos fallidos dejaron viajes a medias'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
set request.jwt.claim.sub = 'f1f1f1f1-0000-0000-0000-000000000001'; set role probador;
do $$ declare ids uuid[]; begin
  ids := public.sider_ficha_dar_salida((select id from public._f where k='a'), ' 7700123456 ');
  if array_length(ids,1) <> 2 then raise exception 'FALLA: no devolvió dos viajes'; end if;
end $$;
reset role;
do $$ declare f text := ''; begin
  if (select count(*) from public.sider_viajes where placa='FIC001' and factura='7700123456' and estado='en_transito' and lote='L1' and observacion='nota') <> 2 then f := f || E'\n   · no nacieron dos viajes en tránsito con la misma placa, factura, lote y nota'; end if;
  if (select count(distinct sku) from public.sider_viajes where placa='FIC001') <> 2 then f := f || E'\n   · los materiales no quedaron distintos'; end if;
  if (select sum(estibas) from public.sider_viajes where placa='FIC001') <> 52 then f := f || E'\n   · las estibas no son las de cada línea'; end if;
  if (select count(*) from public.v_sider_viajes where placa='FIC001' and fotos_salida = 3 and cert_salida_id is not null and cert_llegada_id is null) <> 2 then f := f || E'\n   · cada viaje debe traer su salida certificada con las 3 fotos'; end if;
  if (select count(*) from public.sider_certificaciones c join public.sider_viajes v on v.id=c.viaje_id where v.placa='FIC001' and c.punta='salida' and c.lat = 10.96 and c.direccion='Calle 1' and c.hecha_en > now() - interval '1 minute') <> 2 then f := f || E'\n   · la salida no lleva el lugar de la ficha o la hora de ahora'; end if;
  if (select estado || factura || salida_por::text from public.sider_fichas where id=(select id from public._f where k='a')) is distinct from 'con_salida7700123456f1f1f1f1-0000-0000-0000-000000000001' then f := f || E'\n   · la ficha no guarda quién dio la salida y con qué factura'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if; raise notice 'F3 · dar salida crea un viaje por material en tránsito, con la factura, las fotos y el rastro'; end $$;
set request.jwt.claim.sub = 'f1f1f1f1-0000-0000-0000-000000000001'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida((select id from public._f where k='a'), '78')$q$, '%ya se le dio salida%', 'dio salida dos veces a la misma ficha');
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
reset role;
do $$ begin if (select count(*) from public.sider_viajes where placa='FIC001') <> 2 then raise exception 'FALLA: la segunda salida duplicó viajes'; end if; raise notice 'F3b · una ficha no da salida dos veces'; end $$;

-- ---------- F4: descartar ----------
set request.jwt.claim.sub = 'a1a1a1a1-0000-0000-0000-000000000002'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.sider_ficha_descartar((select id from public._f where k='b'))$q$, '%Solo quien creó%', 'otro del patio descartó la ficha de alguien más');
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
set request.jwt.claim.sub = 'a1a1a1a1-0000-0000-0000-000000000001';
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.sider_ficha_descartar((select id from public._f where k='a'))$q$, '%ya se le dio salida%', 'descartó una ficha con salida');
  perform public.sider_ficha_descartar((select id from public._f where k='b'));
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
reset role;
do $$ declare f text := ''; begin
  if (select estado from public.sider_fichas where id=(select id from public._f where k='b')) <> 'descartada' then f := f || E'\n   · descartar no marcó la ficha'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
set request.jwt.claim.sub = 'f1f1f1f1-0000-0000-0000-000000000001'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.sider_ficha_dar_salida((select id from public._f where k='b'), '9')$q$, '%descartada%', 'dio salida a una ficha descartada');
  if f <> '' then raise exception E'FALLA:%', f; end if; raise notice 'F4 · descarta quien la creó o el facturador, no otro, y no la que ya salió'; end $$;

-- ---------- F5: lo que la base no acepta al guardar ----------
set request.jwt.claim.sub = 'a1a1a1a1-0000-0000-0000-000000000001';
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.sider_ficha_guardar('XXX111','GAL',1,1,1,now(),null,null,null,'[{"sku":"G175","estibas":5},{"sku":"G175","estibas":6}]'::jsonb)$q$, '%repetido%', 'aceptó el mismo material dos veces');
  f := f || public._espera_error($q$select public.sider_ficha_guardar('XXX111','GAL',1,1,1,now(),null,null,null,'[{"sku":"G175","estibas":5},{"sku":"G000","estibas":6}]'::jsonb)$q$, '%material%', 'aceptó un material apagado');
  f := f || public._espera_error($q$select public.sider_ficha_guardar('XXX111','GAL',1,1,1,now(),null,null,null,'[]'::jsonb)$q$, '%al menos un material%', 'aceptó cero materiales');
  f := f || public._espera_error($q$select public.sider_ficha_guardar('XXX111','GAL',1,1,1,now(),null,null,null,'[{"sku":"G175","estibas":0}]'::jsonb)$q$, '%más de cero%', 'aceptó cero estibas');
  f := f || public._espera_error($q$select public.sider_ficha_guardar('XXX111','GAL',1,1,1,now(),null,null,null,'[{"sku":"G175","estibas":"x"}]'::jsonb)$q$, '%no son un número%', 'aceptó estibas que no son número');
  f := f || public._espera_error($q$select public.sider_ficha_guardar('XXX111','OFF',1,1,1,now(),null,null,null,'[{"sku":"G175","estibas":5}]'::jsonb)$q$, '%origen%', 'aceptó un origen apagado');
  f := f || public._espera_error($q$select public.sider_ficha_guardar('XXX111','GAL',null,null,1,now(),null,null,null,'[{"sku":"G175","estibas":5}]'::jsonb)$q$, '%ubicación%', 'aceptó guardar sin ubicación');
  f := f || public._espera_error($q$select public.sider_ficha_guardar('  ','GAL',1,1,1,now(),null,null,null,'[{"sku":"G175","estibas":5}]'::jsonb)$q$, '%placa%', 'aceptó una placa vacía');
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
set request.jwt.claim.sub = 'f1f1f1f1-0000-0000-0000-000000000001';
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.sider_ficha_guardar('XXX111','GAL',1,1,1,now(),null,null,null,'[{"sku":"G175","estibas":5}]'::jsonb)$q$, '%permiso%', 'el facturador guardó una ficha sin permiso de Certificar');
  if f <> '' then raise exception E'FALLA:%', f; end if; end $$;
reset role;
do $$ begin
  if exists (select 1 from public.sider_fichas where placa = 'XXX111') then raise exception 'FALLA: un intento fallido dejó una ficha a medias (no es todo o nada)'; end if;
  raise notice 'F5 · la base no acepta repetidos, apagados, ceros, sin ubicación, sin permiso, y no deja fichas a medias';
end $$;
