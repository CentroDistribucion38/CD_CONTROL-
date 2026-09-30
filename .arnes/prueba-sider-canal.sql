-- El Vh Interno dice si es de un socio o de T1; la revisión lo trae precargado.
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

-- ---------------------------------------------------------------------
-- C1 · CADA MATERIAL SABE SU ENVASE, Y RE-CORRER NO PISA LO PUESTO A MANO
-- (los materiales de prueba se sembraron antes de la segunda corrida)
-- ---------------------------------------------------------------------
do $$
declare f text := ''; r record;
begin
  for r in select * from (values
    ('G175','G175'), ('TM330','M330'), ('TF1000','F750'), ('TCB','CB320'),
    ('TCJ',null), ('TX',null)) as t(sku, esperado)
  loop
    if (select envase_ai from public.sider_skus where sku = r.sku) is distinct from r.esperado then
      f := f || E'\n   · ' || r.sku || ' quedó con envase «' ||
           coalesce((select envase_ai from public.sider_skus where sku = r.sku), 'nulo') ||
           '» y debía ser «' || coalesce(r.esperado, 'nulo') || '»';
    end if;
  end loop;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'C1 · el envase sale del nombre (M330, CB320, G175), las cajas no llevan y lo puesto a mano no se pisa';
end $$;

/* Un camión certificado por Sider al que el administrador pidió la AI. */
insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado, requiere_ai)
values ('eeeeeeee-0000-0000-0000-0000000000c1','CER001','BAQ','G175',20,'2026-09-20','recibido',true);
insert into public.sider_certificaciones (viaje_id, punta, lat, lng)
values ('eeeeeeee-0000-0000-0000-0000000000c1','llegada',10.96,-74.79);

-- ---------------------------------------------------------------------
-- C2 · UN SOCIO NO LLEVA DOCUMENTO; T1 SÍ, Y NO LLEVA SOCIO
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
begin
  perform public.sider_viaje_interno_crear('SOC001','GAL','Barranquilla','G175',10,null,null,null,'socios','sociox');
  perform public.sider_viaje_interno_crear('TUN001','GAL','Barranquilla','G175',10,'123456',null,null,'t1','sociox');
end $$;
reset role;
do $$
declare f text := ''; v record;
begin
  select * into v from public.sider_viajes where placa = 'SOC001';
  if v.ai_canal is distinct from 'socios' or v.ai_socio is distinct from 'sociox' then
    f := f || E'\n   · el viaje del socio no guardó canal y socio'; end if;
  if v.factura is not null then f := f || E'\n   · el viaje del socio quedó con factura'; end if;
  if not v.interno or v.estado <> 'recibido' then f := f || E'\n   · el del socio no nació interno y recibido'; end if;

  select * into v from public.sider_viajes where placa = 'TUN001';
  if v.ai_canal is distinct from 't1' then f := f || E'\n   · el de T1 no guardó el canal'; end if;
  if v.ai_socio is not null then f := f || E'\n   · el de T1 guardó un socio que no le toca'; end if;
  if v.factura is distinct from '123456' then f := f || E'\n   · el de T1 no guardó su factura'; end if;

  if not exists (select 1 from public.v_sider_revision_pendientes
                  where placa = 'SOC001' and tipo = 'sorting' and canal = 'socios'
                    and socio = 'sociox' and envase = 'G175') then
    f := f || E'\n   · la lista de Revisión AI no trae canal, socio y envase del camión del socio'; end if;
  if not exists (select 1 from public.v_sider_revision_pendientes
                  where placa = 'TUN001' and canal = 't1' and socio is null and envase = 'G175') then
    f := f || E'\n   · la lista no trae canal y envase del camión de T1'; end if;
  /* Y en la otra mitad de la lista (la certificada) también. */
  update public.sider_viajes set requiere_ai = true where placa = 'SOC001';
  if not exists (select 1 from public.v_sider_revision_pendientes
                  where placa = 'SOC001' and tipo = 'ai' and canal = 'socios' and socio = 'sociox' and envase = 'G175') then
    f := f || E'\n   · la mitad certificada de la lista no trae canal, socio y envase'; end if;
  /* Un certificado por Sider no trae canal, pero sí el envase de su material. */
  if not exists (select 1 from public.v_sider_revision_pendientes
                  where placa = 'CER001' and canal is null and socio is null and envase = 'G175') then
    f := f || E'\n   · el camión certificado por Sider debía traer solo el envase'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'C2 · socio sin documento con su socio, T1 con su factura y sin socio, y la lista los trae precargados';
end $$;

-- ---------------------------------------------------------------------
-- C3 · LAS REGLAS
-- ---------------------------------------------------------------------
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ERR001','GAL','Barranquilla','G175',3,null,null,null,'socios',null)$q$,
    '%Falta el socio%', 'aceptó un camión de socio sin socio');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ERR002','GAL','Barranquilla','G175',3,null,null,null,'socios','nadie')$q$,
    '%socio no existe%', 'aceptó un socio que no existe');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ERR003','GAL','Barranquilla','G175',3,null,null,null,'t1',null)$q$,
    '%documento%', 'aceptó un camión de T1 sin factura');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ERR004','GAL','Barranquilla','G175',3,'99',null,null,'zzz',null)$q$,
    '%canal%', 'aceptó un canal inventado');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ERR005','GAL','Barranquilla','G175',3)$q$,
    '%documento%', 'el código viejo (sin canal) dejó de exigir el documento');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ERR006','GAL','Barranquilla','G175',3,'12345678901',null,null,'t1',null)$q$,
    '%hasta 10 dígitos%', 'aceptó una factura de 11 dígitos');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ERR007','GAL','Barranquilla','G175',3,'12a',null,null,'t1',null)$q$,
    '%solo números%', 'aceptó una factura con letras');
  /* Un socio con factura escrita: se valida igual, por si alguien llama a mano. */
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear('ERR008','GAL','Barranquilla','G175',3,'12a',null,null,'socios','sociox')$q$,
    '%solo números%', 'aceptó una factura con letras en un socio');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
/* EL CÓDIGO DE ANTES SIGUE FUNCIONANDO: las ocho posiciones de siempre, sin canal. */
do $$ begin
  perform public.sider_viaje_interno_crear('ANT001','GAL','Barranquilla','G175',3,'9001',null,null);
end $$;
reset role;
do $$
declare f text := '';
begin
  if exists (select 1 from public.sider_viajes where placa like 'ERR%') then
    f := f || E'\n   · quedó un viaje de una llamada rechazada'; end if;
  if (select ai_canal from public.sider_viajes where placa = 'ANT001') is not null then
    f := f || E'\n   · la llamada vieja quedó con canal'; end if;
  begin
    update public.sider_viajes set ai_socio = 'sociox' where placa = 'TUN001';
    f := f || E'\n   · la base dejó un socio en un camión de T1';
  exception when check_violation then null;
  end;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'C3 · socio obligatorio, factura de T1 obligatoria y de 10 dígitos, canal del maestro, y la llamada vieja sigue sirviendo';
end $$;

-- ---------------------------------------------------------------------
-- C4 · VARIOS MATERIALES: MISMO CANAL Y MISMO SOCIO EN CADA LÍNEA
-- ---------------------------------------------------------------------
set role probador;
do $$
declare f text := '';
begin
  perform public.sider_viaje_interno_crear_varios('VSO001','GAL','Barranquilla',null,
    '[{"sku":"G175","estibas":5},{"sku":"G350","estibas":6}]'::jsonb, 'socios', 'sociox');
  perform public.sider_viaje_interno_crear_varios('VTU001','GAL','Barranquilla','555',
    '[{"sku":"G175","estibas":5},{"sku":"G350","estibas":6}]'::jsonb, 't1', null);
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VER001','GAL','Barranquilla',null,
    '[{"sku":"G175","estibas":5},{"sku":"G350","estibas":6}]'::jsonb, 't1', null)$q$,
    '%documento%', 'varios: T1 sin factura pasó');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VER002','GAL','Barranquilla',null,
    '[{"sku":"G175","estibas":5},{"sku":"G350","estibas":6}]'::jsonb, 'socios', null)$q$,
    '%Falta el socio%', 'varios: socio sin socio pasó');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
do $$
declare f text := '';
begin
  if (select count(*) from public.sider_viajes where placa = 'VSO001' and ai_canal = 'socios' and ai_socio = 'sociox' and factura is null) <> 2 then
    f := f || E'\n   · las dos líneas del socio no llevan canal, socio y factura vacía'; end if;
  if (select count(*) from public.sider_viajes where placa = 'VTU001' and ai_canal = 't1' and ai_socio is null and factura = '555') <> 2 then
    f := f || E'\n   · las dos líneas de T1 no llevan canal y factura'; end if;
  if exists (select 1 from public.sider_viajes where placa like 'VER%') then
    f := f || E'\n   · una llamada rechazada de varios dejó líneas'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'C4 · varios materiales: todas las líneas llevan el mismo canal y socio, y todo o nada';
end $$;
