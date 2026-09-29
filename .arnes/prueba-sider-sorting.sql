-- =====================================================================
-- SIDER · SORTING — LA BASE
--
-- La revisión AI es un DOCUMENTO DE COBRO al socio. Sorting es la misma
-- inspección hecha por dentro, y vive en la misma tabla. Lo que puede
-- salir mal no es que Sorting no funcione —eso se vería el primer día—
-- sino que se cuele donde no debe, y eso no se ve nunca:
--
--   1. QUE EL COBRO SUBA. Una fila de Sorting dentro de v_sider_ai suma
--      no-abono al socio sin que nadie lo decidiera.
--   2. QUE UNA AI DESAPAREZCA. Si «¿ya la hicieron?» mira cualquier
--      revisión, terminar el Sorting apaga la AI pendiente del mismo
--      camión y nadie cuenta la muestra.
--   3. QUE UN OPERADOR GUARDE UNA AI. es_editor() es cierto con cualquier
--      «editar» en cualquier pantalla: abrirle Sorting lo dejaba pasar.
--   4. QUE LA LLAVE SIGA SIENDO (viaje) y el segundo tipo rebote con un
--      error de llave duplicada.
--   5. QUE LO DE ANTES CAMBIE. Hay 293 importadas y las del muelle.
--
-- Se corre con `bash .arnes/correr-sider-sorting.sh`, que arma la base,
-- deja el estado de antes, migra DOS veces y después corre esto.
-- =====================================================================
\set ON_ERROR_STOP on
-- EN `notice` Y NO EN `warning`: cada bloque termina con un `raise notice`
-- que dice qué comprobó. Con `warning` se silencian, y una prueba que pasa
-- sin decir nada es indistinguible de una que no llegó a correr.
set client_min_messages = notice;

/* Dos ayudantes para no repetir «begin … exception when others» treinta
   veces. Cada verificación lleva SU descripción: devuelven vacío si salió
   lo esperado y, si no, la frase de lo que se rompió. Antes devolvían un
   mensaje genérico y se remendaba con `replace`, y un error que no
   coincidía con lo esperado salía sin decir qué se estaba probando. */
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

/* LA LLAMADA DE GUARDAR, escrita una vez. `p_tipo` va o no según el caso:
   omitirlo ES la llamada de antes de esta migración. */
create or replace function public._guardar(p_viaje uuid, p_tipo text default null,
                                           p_revisadas int default 4104, p_rota int default 37)
returns text language plpgsql as $$
begin
  if p_tipo is null then
    return public._espera_bien(format(
      $q$select public.sider_ai_guardar(%L,'T1','t1',null,'G175',false,82080,%s,
         jsonb_build_object('rota', %s))$q$, p_viaje, p_revisadas, p_rota),
      'guardar una revisión AI con la llamada de antes (sin p_tipo)');
  end if;
  return public._espera_bien(format(
    $q$select public.sider_ai_guardar(%L,'T1','t1',null,'G175',false,82080,%s,
       jsonb_build_object('rota', %s), null, null, %L)$q$, p_viaje, p_revisadas, p_rota, p_tipo),
    'guardar la revisión de tipo ' || p_tipo);
end $$;
grant execute on function public._guardar(uuid, text, int, int) to public;

-- ---------------------------------------------------------------------
-- QUIÉNES SON
-- ---------------------------------------------------------------------
insert into public.roles (clave, nombre, descripcion, manda, sistema, orden)
values ('porteria', 'Portería', 'Solo certifica salidas.', false, false, 9)
on conflict (clave) do nothing;
-- Portería edita UNA pantalla que no es de Sorting ni de Tránsito: es lo
-- que la vuelve es_editor() sin tener nada que ver con esto.
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

/* LOS VIAJES. Todos con el Sorting pedido por el administrador —se marca
   más abajo con la función, no a mano— salvo donde se dice. */
insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado) values
  ('eeeeeeee-0000-0000-0000-000000000001','NEW001','BAQ','G175',20,'2026-09-20','en_transito'),
  ('eeeeeeee-0000-0000-0000-000000000002','NEW002','BAQ','G175',20,'2026-09-20','recibido'),
  ('eeeeeeee-0000-0000-0000-000000000003','NEW003','BAQ','G175',20,'2026-09-20','recibido'),
  ('eeeeeeee-0000-0000-0000-000000000004','NEW004','BAQ','G175',20,'2026-09-20','recibido'),
  ('eeeeeeee-0000-0000-0000-000000000005','NEW005','BAQ','G175',20,'2026-09-20','recibido'),
  ('eeeeeeee-0000-0000-0000-000000000006','NEW006','BAQ','G175',20,'2026-09-20','recibido');
insert into public.sider_certificaciones (viaje_id, punta, lat, lng) values
  ('eeeeeeee-0000-0000-0000-000000000002','llegada',10.96,-74.79),
  ('eeeeeeee-0000-0000-0000-000000000003','llegada',10.96,-74.79),
  ('eeeeeeee-0000-0000-0000-000000000004','llegada',10.96,-74.79),
  ('eeeeeeee-0000-0000-0000-000000000005','llegada',10.96,-74.79),
  ('eeeeeeee-0000-0000-0000-000000000006','llegada',10.96,-74.79);


-- =====================================================================
-- 1 · LO DE ANTES NO CAMBIÓ
-- ---------------------------------------------------------------------
-- La huella se sacó ANTES de migrar. Si el no-abono o el md5 son otros,
-- a algún socio se le cobra distinto de un día para otro.
-- =====================================================================
do $$
declare h record; n record; f text := '';
begin
  select * into h from public._sorting_huella;
  select count(*)::int as filas,
         coalesce(sum(no_abono),0)::bigint as no_abono,
         coalesce(sum(abono_sap),0)::bigint as abono_sap,
         md5(string_agg(id::text || ':' || indice::text || ':' || no_abono::text || ':' ||
                        hl_defectos::text || ':' || defectos_hoja::text, '|' order by id)) as md5
    into n from public.v_sider_ai;

  if n.filas <> h.filas then
    f := f || E'\n   · la vista de AI tenía ' || h.filas || ' revisiones y ahora tiene ' || n.filas;
  end if;
  if n.no_abono <> h.no_abono or n.abono_sap <> h.abono_sap then
    f := f || E'\n   · el cobro al socio cambió: no-abono ' || h.no_abono || ' → ' || n.no_abono
           || ', abono SAP ' || h.abono_sap || ' → ' || n.abono_sap;
  end if;
  if n.md5 <> h.md5 then
    f := f || E'\n   · el índice, el no-abono o los Hl de alguna revisión cambiaron (huella distinta)';
  end if;
  /* Y LAS IMPORTADAS SIGUEN SIENDO AI, sin viaje: es lo que la llave con
     nulos tenía que respetar. */
  if (select count(*) from public.sider_ai_revisiones
       where origen = 'importado' and viaje_id is null and tipo = 'ai') <> 2 then
    f := f || E'\n   · las revisiones importadas dejaron de ser AI sin viaje';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '1 · lo de antes no cambió: % revisiones, no-abono % y abono SAP %',
    n.filas, n.no_abono, n.abono_sap;
end $$;


-- =====================================================================
-- 2 · LA TABLA: DOS TIPOS POR VIAJE, PERO NO DOS DEL MISMO
-- =====================================================================
do $$
declare f text := '';
begin
  /* La razón de toda la migración: con la llave vieja, esto rebota. */
  insert into public.sider_ai_revisiones (viaje_id, tipo, fecha, planta, placa, turno, canal, envase, recibidas, revisadas)
  values ('cccccccc-0000-0000-0000-000000000001','sorting','2026-08-01','BAQ','OLD001','T1','t1','G175',1000,100);
  if (select count(*) from public.sider_ai_revisiones
       where viaje_id = 'cccccccc-0000-0000-0000-000000000001') <> 2 then
    f := f || E'\n   · un viaje no puede tener su AI y su Sorting a la vez';
  end if;

  f := f || public._espera_error(
    $q$insert into public.sider_ai_revisiones (viaje_id, tipo, fecha, planta, placa, turno, canal, envase, recibidas, revisadas)
       values ('cccccccc-0000-0000-0000-000000000001','sorting','2026-08-01','BAQ','OLD001','T1','t1','G175',5,5)$q$,
    '%duplicate key%', 'dos Sorting del MISMO viaje no rebotan');
  f := f || public._espera_error(
    $q$insert into public.sider_ai_revisiones (viaje_id, tipo, fecha, planta, placa, turno, canal, envase, recibidas, revisadas, origen)
       values (null,'sorting','2026-08-01','BAQ','X','T1','t1','G175',5,5,'importado')$q$,
    '%sider_sorting_es_de_formulario%', 'se pudo guardar un «Sorting importado» (sin viaje, del Excel)');
  f := f || public._espera_error(
    $q$insert into public.sider_ai_revisiones (viaje_id, tipo, fecha, planta, placa, turno, canal, envase, recibidas, revisadas)
       values ('cccccccc-0000-0000-0000-000000000002','otro','2026-08-01','BAQ','X','T1','t1','G175',5,5)$q$,
    '%sider_ai_tipo_valido%', 'se pudo guardar un tipo de revisión inventado');

  /* Se limpia: esa fila de Sorting no es de esta prueba y ensuciaría los
     conteos de abajo. */
  delete from public.sider_ai_revisiones
   where viaje_id = 'cccccccc-0000-0000-0000-000000000001' and tipo = 'sorting';

  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '2 · la tabla: dos tipos por viaje sí, dos del mismo no, y el Sorting importado tampoco';
end $$;


-- =====================================================================
-- 3 · QUIÉN PIDE EL SORTING — SOLO EL ADMINISTRADOR
-- =====================================================================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000001', true)$q$, '%solo del administrador%', 'el supervisor pudo pedir un Sorting');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000001', true)$q$, '%solo del administrador%', 'un operador pudo pedir un Sorting');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
/* Y QUIEN NO TIENE PERFIL: el hueco del `mi_rol() <> 'admin'` sin
   coalesce (null <> 'admin' no es cierto ni falso y el if no entra). */
reset role;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000001', true)$q$, '%solo del administrador%', 'alguien SIN PERFIL pudo pedir un Sorting');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;

reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare f text := '';
begin
  /* EL ADMINISTRADOR PIDE SORTING PARA LOS CINCO. Al 002 y 003 también
     AI: esos dos son los que prueban que conviven. */
  for i in 1..6 loop
    perform public.sider_sorting_marcar(('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, true);
  end loop;
  perform public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000002', true, null);
  perform public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000003', true, null);
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
do $$
declare f text := '';
begin
  if not (select requiere_sorting from public.sider_viajes where id = 'eeeeeeee-0000-0000-0000-000000000002') then
    f := f || E'\n   · el Sorting no quedó marcado'; end if;
  if (select sorting_pedido_por from public.sider_viajes where id = 'eeeeeeee-0000-0000-0000-000000000002')
     is distinct from '11111111-1111-1111-1111-111111111111' then
    f := f || E'\n   · no guardó QUIÉN lo pidió'; end if;
  if (select sorting_pedido_en from public.sider_viajes where id = 'eeeeeeee-0000-0000-0000-000000000002') is null then
    f := f || E'\n   · no guardó CUÁNDO lo pidió'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '3 · pedir Sorting: solo el administrador; supervisor, operador y sin perfil, no';
end $$;


-- =====================================================================
-- 4 · «APENAS CERTIFIQUEN LA LLEGADA, PASA A SORTING»
-- ---------------------------------------------------------------------
-- El 001 viene en camino: no hay nada que inspeccionar, y ponerlo en la
-- lista de los muchachos les mostraría trabajo que todavía no existe.
-- =====================================================================
do $$
declare f text := '';
begin
  if exists (select 1 from public.v_sider_sorting_pendientes
              where viaje_id = 'eeeeeeee-0000-0000-0000-000000000001') then
    f := f || E'\n   · un camión que AÚN NO LLEGÓ sale en la lista de Sorting';
  end if;
  if not exists (select 1 from public.v_sider_sorting_pendientes
                  where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002') then
    f := f || E'\n   · un camión que YA LLEGÓ y pidió Sorting NO sale en la lista: se pierde la inspección';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;

  -- Llega el 001.
  insert into public.sider_certificaciones (viaje_id, punta, lat, lng)
  values ('eeeeeeee-0000-0000-0000-000000000001','llegada',10.96,-74.79);
  if not exists (select 1 from public.v_sider_sorting_pendientes
                  where viaje_id = 'eeeeeeee-0000-0000-0000-000000000001') then
    f := f || E'\n   · al certificar la llegada, el camión NO pasa a la lista de Sorting';
  end if;
  delete from public.sider_certificaciones
   where viaje_id = 'eeeeeeee-0000-0000-0000-000000000001' and punta = 'llegada';
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '4 · el Sorting aparece al certificar la llegada, no antes';
end $$;

-- El 001 sigue en camino: guardar su Sorting tiene que rebotar. La lista
-- y la función tienen que estar de acuerdo en qué es «ya llegó».
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000001','T1','t1',null,'G175',false,1000,100,'{}'::jsonb,null,null,'sorting')$q$, '%llegada%', 'se guardó un Sorting de un camión que no ha llegado');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;


-- =====================================================================
-- 5 · QUIÉN GUARDA QUÉ — EL HUECO DEL es_editor()
-- ---------------------------------------------------------------------
-- Portería edita /sider/certificar: es_editor() le da cierto en TODO. Si
-- el permiso de Sorting o el de AI se pidiera con es_editor(), Portería
-- guardaría las dos.
-- =====================================================================
reset role;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role probador;
do $$
declare f text := '';
begin
  if not public.es_editor() then
    raise exception 'FALLA: el arnés está mal armado — Portería debería ser es_editor() para que esta prueba diga algo';
  end if;
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000002','T1','t1',null,'G175',false,1000,100,'{}'::jsonb,null,null,'sorting')$q$, '%permiso de edición en Sorting%', 'un rol que edita OTRA pantalla guardó un Sorting: el permiso se está pidiendo con es_editor() y no por pantalla');
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000002','T1','t1',null,'G175',false,1000,100,'{}'::jsonb)$q$, '%supervisor o administrador%', 'un rol que edita OTRA pantalla guardó una revisión AI');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;

-- El operador todavía no tiene nada abierto.
reset role;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000002','T1','t1',null,'G175',false,1000,100,'{}'::jsonb,null,null,'sorting')$q$, '%permiso de edición en Sorting%', 'un operador SIN permiso guardó un Sorting');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;

-- El administrador le abre Sorting al operador. (En la app: Roles.)
reset role;
insert into public.rol_permisos (rol, seccion, nivel) values ('operador', '/sider/sorting', 'editar')
on conflict (rol, seccion) do update set nivel = 'editar';

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare f text := '';
begin
  if not public.es_editor() then
    raise exception 'FALLA: el arnés está mal armado — con «editar» en Sorting el operador es es_editor(), y ese es justo el hueco que se prueba';
  end if;
  /* ÉSTA ES LA PRUEBA DEL HUECO. El operador ahora ES es_editor(): con la
     puerta vieja de la AI pasaba, y el cobro al socio quedaba en manos de
     quien solo iba a clasificar. */
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000002','T1','t1',null,'G175',false,82080,4104,'{"rota":9999}'::jsonb)$q$, '%supervisor o administrador%', 'UN OPERADOR CON PERMISO DE SORTING GUARDÓ UNA REVISIÓN AI —el cobro al socio en manos de quien solo iba a clasificar—');
  /* Y NO PUEDE PEDIR NI QUITAR NADA. */
  f := f || public._espera_error($q$select public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000005', false)$q$, '%solo del administrador%', 'el operador pudo quitar una marca de Sorting');
  f := f || public._espera_error($q$select public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000005', true, null)$q$, '%solo del administrador%', 'el operador pudo pedir una revisión AI');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '5 · Portería y el operador sin permiso no guardan Sorting; el operador con Sorting NO guarda AI';
end $$;


-- =====================================================================
-- 6 · EL SORTING ENTRA, Y EL COBRO NO SE MUEVE
-- =====================================================================
-- El operador cierra el Sorting del 002 (que también pidió AI).
do $$
declare f text := '';
begin
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000002', 'sorting', 4104, 4000);
  if f <> '' then raise exception E'FALLA: el operador con permiso no pudo guardar el Sorting:%', f; end if;
end $$;

reset role;
do $$
declare f text := ''; h record;
begin
  select count(*)::int as filas, coalesce(sum(no_abono),0)::bigint as no_abono,
         coalesce(sum(abono_sap),0)::bigint as abono_sap
    into h from public.v_sider_ai;
  if h.filas <> 3 then
    f := f || E'\n   · v_sider_ai pasó de 3 a ' || h.filas || ' filas: EL SORTING SE COLÓ EN EL COBRO';
  end if;
  if h.no_abono <> (select no_abono from public._sorting_huella)
     or h.abono_sap <> (select abono_sap from public._sorting_huella) then
    f := f || E'\n   · EL COBRO AL SOCIO CAMBIÓ por guardar un Sorting: no-abono '
           || (select no_abono from public._sorting_huella) || ' → ' || h.no_abono;
  end if;
  if (select count(*) from public.v_sider_sorting) <> 1 then
    f := f || E'\n   · v_sider_sorting no tiene la fila del Sorting recién guardado';
  end if;
  /* Y NO ES UNA FILA DE AI DISFRAZADA. */
  if exists (select 1 from public.v_sider_sorting s join public.sider_ai_revisiones r on r.id = s.id
              where r.tipo <> 'sorting') then
    f := f || E'\n   · v_sider_sorting trae una fila que no es Sorting';
  end if;

  /* EL DETALLE TAMBIÉN: la suma de un defecto por informe leería estas
     filas si la vista de detalle no filtrara. */
  if (select count(*) from public.v_sider_sorting_detalle) <> 1 then
    f := f || E'\n   · el detalle del Sorting no tiene sus conteos (o tiene de más)';
  end if;
  if exists (select 1 from public.v_sider_ai_detalle d
               join public.sider_ai_revisiones r on r.id = d.revision_id where r.tipo <> 'ai') then
    f := f || E'\n   · v_sider_ai_detalle trae conteos de un Sorting: un informe por defecto los sumaría al cobro';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '6 · guardar un Sorting no movió el cobro: % revisiones AI, no-abono % igual que antes', h.filas, h.no_abono;
end $$;


-- 6c · EL SUPERVISOR TAMBIÉN, CON LA FILA QUE SEMBRÓ LA MIGRACIÓN
-- Nadie le dio «editar en Sorting» a mano en esta prueba: si guarda es
-- porque la migración se lo abrió. Sin esa fila, la pantalla de Sorting
-- nacía cerrada para el supervisor y solo la veía el administrador.
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000006', 'sorting', 4104, 8);
  if f <> '' then
    raise exception E'FALLA: el supervisor no pudo guardar un Sorting con lo que sembró la migración:%', f;
  end if;
  raise notice '6c · el supervisor guarda Sorting con la fila que sembró la migración';
end $$;
reset role;

-- =====================================================================
-- 7 · LAS DOS LISTAS DE TRABAJO NO SE PISAN
-- ---------------------------------------------------------------------
-- El 002 pidió AI Y Sorting. Con el Sorting hecho, su AI tiene que seguir
-- pendiente: es el cambio más silencioso de toda la migración, porque no
-- da ningún error — el camión simplemente nunca se revisa.
-- =====================================================================
do $$
declare f text := '';
begin
  if exists (select 1 from public.v_sider_sorting_pendientes
              where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002') then
    f := f || E'\n   · el Sorting ya está hecho y el camión sigue en la lista de Sorting';
  end if;
  if not exists (select 1 from public.v_sider_ai_pendientes
                  where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002') then
    f := f || E'\n   · AL TERMINAR EL SORTING DESAPARECIÓ LA AI PENDIENTE: nadie va a contar la muestra y el cobro al socio se pierde sin ningún error';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '7a · con el Sorting hecho, la AI del mismo camión sigue pendiente';
end $$;

-- El supervisor hace la AI del 002 (tiene editar en Tránsito, de la semilla).
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000002', null, 4104, 37);
  if f <> '' then raise exception E'FALLA: el supervisor no pudo guardar la AI (con la llamada de antes, sin p_tipo):%', f; end if;
end $$;
reset role;
do $$
declare f text := '';
begin
  if exists (select 1 from public.v_sider_ai_pendientes where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002') then
    f := f || E'\n   · la AI ya está hecha y el camión sigue en pendientes de AI';
  end if;
  if (select count(*) from public.sider_ai_revisiones where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002') <> 2 then
    f := f || E'\n   · el camión no quedó con DOS revisiones (su AI y su Sorting)';
  end if;
  if (select tipo from public.sider_ai_revisiones where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002'
       and revisado_por = '33333333-3333-3333-3333-333333333333') <> 'ai' then
    f := f || E'\n   · LA LLAMADA DE ANTES (sin p_tipo) NO GUARDÓ AI: el formulario de Tránsito guardaría otra cosa';
  end if;
  if (select count(*) from public.v_sider_ai) <> 4 then
    f := f || E'\n   · v_sider_ai debería tener 4 (3 de antes + la nueva AI) y tiene ' || (select count(*) from public.v_sider_ai);
  end if;
  /* 2 y no 1: el Sorting del 002 (el operador) y el del 006 (el
     supervisor, en 6c). Cada uno en su vista y ninguno en la de AI. */
  if (select count(*) from public.v_sider_sorting) <> 2 then
    f := f || E'\n   · v_sider_sorting debería tener 2 (el del operador y el del supervisor) y tiene '
           || (select count(*) from public.v_sider_sorting);
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '7b · el camión quedó con su AI y su Sorting, cada uno en su vista';
end $$;


-- =====================================================================
-- 8 · CORREGIR UNO NO TOCA EL OTRO
-- =====================================================================
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare f text := '';
begin
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000002', 'sorting', 4104, 55);
  if f <> '' then raise exception E'FALLA: no se pudo corregir el Sorting:%', f; end if;
end $$;
reset role;
do $$
declare f text := '';
begin
  if (select ediciones from public.sider_ai_revisiones
       where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002' and tipo = 'sorting') <> 1 then
    f := f || E'\n   · corregir el Sorting no dejó rastro (ediciones ≠ 1)';
  end if;
  if (select ediciones from public.sider_ai_revisiones
       where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002' and tipo = 'ai') <> 0 then
    f := f || E'\n   · CORREGIR EL SORTING REESCRIBIÓ LA AI del mismo camión';
  end if;
  if (select unidades from public.sider_ai_conteos c
        join public.sider_ai_revisiones r on r.id = c.revision_id
       where r.viaje_id = 'eeeeeeee-0000-0000-0000-000000000002' and r.tipo = 'ai' and c.defecto = 'rota') <> 37 then
    f := f || E'\n   · los conteos de la AI cambiaron al corregir el Sorting';
  end if;
  if (select count(*) from public.sider_ai_revisiones where viaje_id = 'eeeeeeee-0000-0000-0000-000000000002') <> 2 then
    f := f || E'\n   · corregir creó una revisión más en vez de reescribir la que había';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '8 · corregir el Sorting deja rastro y no toca la AI del mismo camión';
end $$;


-- =====================================================================
-- 9 · QUITAR LA MARCA: SOLO LO QUE NO TIENE TRABAJO HECHO
-- =====================================================================
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare f text := '';
begin
  -- 002 tiene las dos hechas: ninguna se puede quitar.
  f := f || public._espera_error($q$select public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000002', false)$q$, '%ya tiene el Sorting hecho%', 'se pudo quitar la marca de un Sorting YA HECHO: se borra el trabajo de los muchachos sin rastro');
  f := f || public._espera_error($q$select public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000002', false)$q$, '%ya tiene la revisión AI hecha%', 'se pudo quitar la marca de una AI YA HECHA');

  /* 003 pidió las dos y solo se hace el Sorting: quitar la AI TIENE que
     dejar. Con el `exists` viejo, la AI «ya estaba hecha» —lo estaba el
     Sorting— y no dejaba quitarla. */
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000003', 'sorting', 4104, 12);
  f := f || public._espera_bien($q$select public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000003', false)$q$, 'con solo el Sorting hecho, NO SE PUDO QUITAR la AI (el «ya hay revisión» mira los dos tipos): falló y no debía');

  /* 004: solo AI hecha; quitar el Sorting (sin hacer) tiene que dejar. */
  perform public.sider_ai_marcar('eeeeeeee-0000-0000-0000-000000000004', true, null);
  f := f || public._guardar('eeeeeeee-0000-0000-0000-000000000004', null, 4104, 20);
  f := f || public._espera_bien($q$select public.sider_sorting_marcar('eeeeeeee-0000-0000-0000-000000000004', false)$q$, 'con solo la AI hecha, no se pudo quitar el Sorting sin hacer: falló y no debía');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '9 · quitar la marca: no con el trabajo hecho, sí sin él, mirando solo su tipo';
end $$;


-- =====================================================================
-- 10 · LO QUE LA FUNCIÓN NO DEBE ACEPTAR
-- =====================================================================
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000005','T1','t1',null,'G175',false,1000,100,'{}'::jsonb,null,null,'otra')$q$, '%ai o sorting%', 'aceptó un tipo de revisión inventado');
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000005','T1','t1',null,'G175',false,1000,100,'{}'::jsonb,null,null,null)$q$, '%ai o sorting%', 'aceptó un tipo nulo: guardaría sin saber qué es');
  /* 005 pidió Sorting, no AI: guardarle una AI tiene que rebotar. */
  f := f || public._espera_error($q$select public.sider_ai_guardar('eeeeeeee-0000-0000-0000-000000000005','T1','t1',null,'G175',false,1000,100,'{}'::jsonb)$q$, '%no está marcado para revisión AI%', 'se guardó una AI de un camión que solo pidió Sorting: pedir una cosa habilita la otra');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '10 · no acepta tipos inventados, ni una cosa por la marca de la otra';
end $$;


-- =====================================================================
-- 11 · LA LISTA NO MUESTRA ANULADOS Y LOS TRAE DE VUELTA AL DEVOLVERLOS
-- =====================================================================
reset role;
do $$
declare f text := '';
begin
  update public.sider_viajes set estado = 'anulado', motivo_anulacion = 'Prueba', anulado_en = now()
   where id = 'eeeeeeee-0000-0000-0000-000000000005';
  if exists (select 1 from public.v_sider_sorting_pendientes where viaje_id = 'eeeeeeee-0000-0000-0000-000000000005') then
    f := f || E'\n   · un viaje ANULADO sigue en la lista de Sorting';
  end if;
  update public.sider_viajes set estado = 'recibido', motivo_anulacion = null, anulado_en = null
   where id = 'eeeeeeee-0000-0000-0000-000000000005';
  if not exists (select 1 from public.v_sider_sorting_pendientes where viaje_id = 'eeeeeeee-0000-0000-0000-000000000005') then
    f := f || E'\n   · al devolver el viaje anulado NO vuelve a la lista de Sorting';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice '11 · los anulados no esperan Sorting, y al devolverlos vuelven';
end $$;


-- =====================================================================
-- 12 · UNA SOLA FUNCIÓN GUARDAR
-- ---------------------------------------------------------------------
-- Con `create or replace` y un parámetro de más Postgres crea una
-- SEGUNDA función, y la llamada del muelle —con los once parámetros de
-- antes— casaría con las dos y fallaría con «function is not unique».
-- =====================================================================
do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'sider_ai_guardar';
  if n <> 1 then
    raise exception 'FALLA: hay % versiones de sider_ai_guardar; con más de una, la llamada del muelle falla con «function is not unique»', n;
  end if;
  raise notice '12 · una sola sider_ai_guardar';
end $$;

/* LIMPIEZA: las funciones de ayuda no son del proyecto. */
drop function if exists public._guardar(uuid, text, int, int);
drop function if exists public._espera_error(text, text);
drop function if exists public._espera_bien(text);
drop table if exists public._sorting_huella;
