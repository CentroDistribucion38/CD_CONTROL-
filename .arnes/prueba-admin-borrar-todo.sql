\set ON_ERROR_STOP on
set client_min_messages = notice;
-- =====================================================================
-- BORRAR DATOS · TODA LA LISTA
--   · todo lo que tiene la app está en la lista (los módulos que faltaban);
--   · cada punto cuenta, exporta y borra sin error de SQL;
--   · las claves caben en lo que acepta el servidor (letras, un punto);
--   · con datos de verdad: cargas, simulador y visitas se cuentan por su
--     fecha y se borran solo en su rango.
-- =====================================================================
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.quiebra_simulador (anio, mes, cona, pct_quiebra) values (2026, 8, 1, 1), (2026, 9, 1, 1) on conflict do nothing;
insert into public.uso_visitas (usuario, ruta, modulo, entro_en, activo_seg)
select '11111111-1111-1111-1111-111111111111', '/x', 'x', ts, 5
  from (values ('2026-09-01 10:00-05'::timestamptz), ('2026-09-10 10:00-05'), ('2026-09-20 10:00-05')) v(ts);

-- Datos de verdad con lo que cuelga: un conteo con línea, módulo y fotos; un inventario fiscal con hoja, conteo y «terminé».
insert into public.bodegas (id, codigo, nombre) values ('b0000000-0000-0000-0000-000000000001', 'TB1', 'Bodega de prueba') on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle) values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'ZZ1', 'Z') on conflict do nothing;
insert into public.productos (id, sku, nombre) values ('d0000000-0000-0000-0000-000000000001', 'SKU-T', 'Producto de prueba') on conflict do nothing;
insert into public.conteos (id, codigo, bodega_id) values ('e0000000-0000-0000-0000-000000000001', 'CT-T1', 'b0000000-0000-0000-0000-000000000001');
insert into public.conteo_lineas (id, conteo_id, producto_id) values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');
insert into public.conteo_fotos (conteo_id, linea_id, ruta) values ('e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'CT-T1/foto1.jpg');
insert into public.conteo_modulos (conteo_id, ubicacion_id, ruta) values ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'CT-T1/modulo.jpg');
insert into public.inv_fiscales (id, bodega_id, nombre) values ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Fiscal de prueba');
insert into public.inv_fiscal_hojas (id, fiscal_id, numero) values ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 1);
insert into public.inv_fiscal_miembros (hoja_id, fiscal_id, equipo, user_id) values ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'OL', '11111111-1111-1111-1111-111111111111');
insert into public.inv_fiscal_conteos (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, cajas)
values ('f0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'OL', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 5);
insert into public.inv_fiscal_terminos (hoja_id, user_id) values ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

do $prueba$
declare
  v_falla text := '';
  r record; c record; n bigint; esperadas text[] := array[
    'traspasos.plan','traspasos.viajes','traspasos.sap','rotlinea.registro','rotlinea.hojas','roturas.reportes','roturas.salidas',
    'roturas.eliminadas','quiebra.diario','quiebra.bajas','quiebra.produccion','quiebra.cargas','quiebra.simulador',
    'sider.viajes','sider.novedades','sider.ai','sider.zlde','sider.fichas','sider.eliminados',
    'acciones.reportes','acciones.hallazgos','acciones.programadas',
    'inventario.conteos','inventario.averias','inventario.cortes','inventario.fiscal','inventario.envase','inventario.rotulos','admin.uso'];
  k text; cuantas int;
begin
  set local role probador;
  /* ---- A · ESTÁ TODO ---- */
  foreach k in array esperadas loop
    if not exists (select 1 from public.admin_borrado_catalogo() x where x.clave = k) then
      v_falla := v_falla || ' A(falta ' || k || ' en la lista)'; end if;
  end loop;
  for c in select * from public.admin_borrado_catalogo() loop
    if c.clave !~ '^[a-z]+\.[a-z]+$' then v_falla := v_falla || ' B(la clave ' || c.clave || ' no la acepta el servidor)'; end if;
  end loop;
  select count(*) into cuantas from public.admin_borrado_catalogo();
  raise notice 'lista: % puntos', cuantas;

  /* ---- C · CADA PUNTO CUENTA Y EXPORTA ---- */
  for c in select * from public.admin_borrado_catalogo() loop
    begin
      perform * from public.admin_borrado_contar(c.clave, null, null);
      perform * from public.admin_borrado_contar(c.clave, '2026-09-01', '2026-09-30');
      perform * from public.admin_borrado_filas(c.clave, null, null);
    exception when others then v_falla := v_falla || ' C(' || c.clave || ' no cuenta o no exporta: ' || sqlerrm || ')'; end;
  end loop;

  /* ---- D · DATOS DE VERDAD, EN SU RANGO ---- */
  select a.filas into n from public.admin_borrado_contar('admin.uso', '2026-09-01', '2026-09-10') a;
  if n <> 2 then v_falla := v_falla || ' D(visitas del 1 al 10: ' || n || ' y eran 2)'; end if;
  select a.filas into n from public.admin_borrado_contar('quiebra.simulador', '2026-09-01', '2026-09-30') a;
  if n <> 1 then v_falla := v_falla || ' D2(simulador de septiembre: ' || n || ' y era 1)'; end if;
  begin perform * from public.admin_borrar('admin.uso', '2026-09-01', '2026-09-10', 'BORRAR', 2); exception when others then v_falla := v_falla || ' D3(' || sqlerrm || ')'; end;
  reset role;
  if (select count(*) from public.uso_visitas) <> 1 then v_falla := v_falla || ' D4(las visitas fuera del rango no quedaron)'; end if;
  set local role probador;

  /* ---- F · LO QUE CUELGA: archivos del conteo y un fiscal con conteo y «terminé» ---- */
  select * into r from public.admin_borrado_contar('inventario.conteos', null, null);
  if r.filas <> 1 or r.archivos <> 2 then v_falla := v_falla || ' F(el conteo cuenta ' || r.filas || ' filas y ' || r.archivos || ' archivos; eran 1 y 2)'; end if;
  begin select * into r from public.admin_borrar('inventario.conteos', null, null, 'BORRAR', 1);
    if r.bucket is distinct from 'inventario' or coalesce(array_length(r.rutas, 1), 0) <> 2 then v_falla := v_falla || ' F2(no devuelve las 2 rutas del bucket inventario)'; end if;
  exception when others then v_falla := v_falla || ' F3(conteo: ' || sqlerrm || ')'; end;
  reset role;
  if exists (select 1 from public.conteo_lineas) or exists (select 1 from public.conteo_fotos) or exists (select 1 from public.conteo_modulos) then
    v_falla := v_falla || ' F4(lo que colgaba del conteo no se fue)'; end if;
  set local role probador;
  begin perform * from public.admin_borrar('inventario.fiscal', null, null, 'BORRAR', 1);
  exception when others then v_falla := v_falla || ' F5(fiscal con conteo y terminé: ' || sqlerrm || ')'; end;
  reset role;
  if exists (select 1 from public.inv_fiscal_hojas) or exists (select 1 from public.inv_fiscal_conteos) then
    v_falla := v_falla || ' F6(lo que colgaba del fiscal no se fue)'; end if;
  set local role probador;

  /* ---- E · CADA PUNTO BORRA (sin error de SQL), con lo que haya ---- */
  for c in select * from public.admin_borrado_catalogo() where clave not in ('admin.uso','quiebra.simulador') loop
    begin
      select a.filas into n from public.admin_borrado_contar(c.clave, null, null) a;
      perform * from public.admin_borrar(c.clave, null, null, 'BORRAR', n);
    exception when others then v_falla := v_falla || ' E(' || c.clave || ' no borra: ' || sqlerrm || ')'; end;
  end loop;
  reset role;

  if v_falla <> '' then raise exception 'BORRAR DATOS (todo):%', v_falla; end if;
  raise notice 'BORRAR DATOS (todo) ok';
end $prueba$;
