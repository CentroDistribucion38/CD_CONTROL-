\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('22222222-2222-2222-2222-222222222222','peon@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('22222222-2222-2222-2222-222222222222','peon','Peon','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

-- La prueba se limpia a si misma: tiene que poder correrse dos veces
-- seguidas y dar lo mismo, o no sirve para volver a correrla manana.
delete from public.rotlinea_produccion where orden in ('12438157','99999999');
delete from public.rotlinea_registro where fecha in (date '2026-09-01', date '2026-09-02');

-- ===================== EL OPERADOR =====================
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role probador;
do $$
begin
  perform public.rotlinea_guardar(date '2026-09-01', 1::smallint, 1::smallint, '3500005',
    '[{"maquina":1,"kg":10}]'::jsonb);
  raise exception '1 FALLO: el operador pudo guardar';
exception when others then
  if sqlerrm like '%requiere rol%' then raise warning 'operador rechazado: 1 de 1';
  else raise; end if;
end $$;

-- ===================== EL SUPERVISOR =====================
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare
  f date := date '2026-09-01'; v_falla text := ''; n int; v bigint; p numeric;
begin
  -- 2. Guarda la rejilla. El cero NO se guarda.
  n := public.rotlinea_guardar(f, 1::smallint, 1::smallint, '3500005',
    '[{"maquina":9,"kg":31},{"maquina":1,"kg":25},{"maquina":12,"kg":0},
      {"maquina":6,"kg":14},{"maquina":13,"kg":39}]'::jsonb);
  if n <> 4 then v_falla := v_falla || ' 2(guardo ' || n || ', se esperaban 4)'; end if;
  if (select count(*) from public.rotlinea_registro where fecha = f) <> 4 then
    v_falla := v_falla || ' 2b(el cero entro)'; end if;

  -- 3. EL TECHO, contra filas reales del Excel: 31 kg / 0.177 = 175.14 → 176.
  --    Con round() habrian salido 175 y el informe no cuadraria con la hoja.
  select und into v from public.rotlinea_registro where fecha = f and maquina = 9;
  if v <> 176 then v_falla := v_falla || ' 3(31kg dio ' || v || ', no 176)'; end if;
  select und into v from public.rotlinea_registro where fecha = f and maquina = 1;
  if v <> 142 then v_falla := v_falla || ' 3b(25kg dio ' || v || ', no 142)'; end if;
  select und into v from public.rotlinea_registro where fecha = f and maquina = 6;
  if v <> 80 then v_falla := v_falla || ' 3c(14kg dio ' || v || ', no 80)'; end if;

  -- 4. GUARDAR OTRA VEZ AGREGA UNA PESADA, no reemplaza. Es el caso de
  --    los 822 turnos repetidos del Excel: la linea paro y volvio a
  --    arrancar, y las dos pesadas son rotura de verdad.
  n := public.rotlinea_guardar(f, 1::smallint, 1::smallint, '3500005',
    '[{"maquina":9,"kg":22},{"maquina":1,"kg":19}]'::jsonb);
  if (select count(*) from public.rotlinea_registro where fecha = f) <> 6 then
    v_falla := v_falla || ' 4(quedaron ' ||
      (select count(*) from public.rotlinea_registro where fecha = f) || ' filas, se esperaban 6)'; end if;
  if (select max(toma) from public.rotlinea_registro where fecha = f) <> 2 then
    v_falla := v_falla || ' 4b(no numero la segunda pesada)'; end if;
  -- Y SE SUMAN: la maquina 9 llevaba 176 y ahora 176 + ceil(22/0.177)=125 = 301.
  select sum(und) into v from public.rotlinea_registro where fecha = f and maquina = 9;
  if v <> 301 then v_falla := v_falla || ' 4c(la maquina 9 sumo ' || v || ', no 301)'; end if;

  -- 4d. CORREGIR una pesada toca esa y solo esa.
  n := public.rotlinea_guardar(f, 1::smallint, 1::smallint, '3500005',
    '[{"maquina":9,"kg":30}]'::jsonb, 2::smallint);
  if (select count(*) from public.rotlinea_registro where fecha = f and toma = 2) <> 1 then
    v_falla := v_falla || ' 4d(la correccion no reemplazo la toma 2)'; end if;
  if (select count(*) from public.rotlinea_registro where fecha = f and toma = 1) <> 4 then
    v_falla := v_falla || ' 4e(la correccion toco la toma 1)'; end if;
  -- 4f. Corregir una pesada que no existe se dice claro.
  begin
    perform public.rotlinea_guardar(f, 1::smallint, 1::smallint, '3500005',
      '[{"maquina":9,"kg":1}]'::jsonb, 7::smallint);
    v_falla := v_falla || ' 4f(corrigio una pesada inexistente)';
  exception when others then
    if sqlerrm not like '%no tiene una pesada%' then v_falla := v_falla || ' 4f(' || sqlerrm || ')'; end if;
  end;
  -- Se deja el turno en una sola pesada para lo que sigue.
  delete from public.rotlinea_registro where fecha = f and toma = 2;

  -- 5. Las reglas: turno, linea, envase y maquina.
  begin
    perform public.rotlinea_guardar(f, 1::smallint, 4::smallint, '3500005', '[]'::jsonb);
    v_falla := v_falla || ' 5(acepto turno 4)';
  exception when others then
    if sqlerrm not like '%1, 2 o 3%' then v_falla := v_falla || ' 5(' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.rotlinea_guardar(f, 9::smallint, 1::smallint, '3500005', '[]'::jsonb);
    v_falla := v_falla || ' 5b(acepto linea 9)';
  exception when others then
    if sqlerrm not like '%no existe o está apagada%' then v_falla := v_falla || ' 5b(' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.rotlinea_guardar(f, 1::smallint, 1::smallint, 'NOEXISTE', '[]'::jsonb);
    v_falla := v_falla || ' 5c(acepto envase inventado)';
  exception when others then
    if sqlerrm not like '%no existe o está apagado%' then v_falla := v_falla || ' 5c(' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.rotlinea_guardar(f, 1::smallint, 2::smallint, '3500005',
      '[{"maquina":999,"kg":5}]'::jsonb);
    v_falla := v_falla || ' 5d(acepto maquina inventada)';
  exception when others then
    if sqlerrm not like '%La máquina%' then v_falla := v_falla || ' 5d(' || sqlerrm || ')'; end if;
  end;

  -- 6. Y un intento fallido no deja nada a medias.
  if (select count(*) from public.rotlinea_registro where fecha = f and turno = 2) <> 0 then
    v_falla := v_falla || ' 6(el intento fallido dejo filas)'; end if;

  -- 7. LA BAJA. Una vez marcada, el turno no se reescribe.
  n := public.rotlinea_marcar_baja(f, 1::smallint, 1::smallint, '3500005');
  if n <> 4 then v_falla := v_falla || ' 7(marco ' || n || ')'; end if;
  begin
    perform public.rotlinea_guardar(f, 1::smallint, 1::smallint, '3500005',
      '[{"maquina":9,"kg":99}]'::jsonb, 1::smallint);
    v_falla := v_falla || ' 7b(reescribio lo dado de baja)';
  exception when others then
    if sqlerrm not like '%dada de baja en SAP%' then v_falla := v_falla || ' 7b(' || sqlerrm || ')'; end if;
  end;
  -- 7c. Pero AGREGAR una pesada nueva si se puede: es rotura que paso
  --     despues, y no toca lo que ya salio por SAP.
  n := public.rotlinea_guardar(f, 1::smallint, 1::smallint, '3500005',
    '[{"maquina":9,"kg":5}]'::jsonb);
  if n <> 1 then v_falla := v_falla || ' 7c(no dejo agregar una pesada nueva)'; end if;
  delete from public.rotlinea_registro where fecha = f and toma = 2;
  perform public.rotlinea_marcar_baja(f, 1::smallint, 1::smallint, '3500005', false);

  -- 8. EL INDICADOR. Sin produccion cargada, el % es NULO, no cero.
  select pct_rotura into p from public.v_rotlinea_indicador
   where fecha = f and linea = 1 and envase = '3500005';
  if p is not null then v_falla := v_falla || ' 8(dio % sin produccion: ' || p || ')'; end if;

  -- 9. Con produccion, el % sale. La toma 1 dejo 4 maquinas:
  --    176 + 142 + 80 + 221 = 619 rotas de 100.000 = 0.619 %.
  insert into public.rotlinea_produccion (orden, fecha, linea, sku, cantidad, hl)
  values ('12438157', f, 1, '3617P', 100000, 175.0)
  on conflict (orden) do update set cantidad = excluded.cantidad;
  select rotas, pct_rotura into v, p from public.v_rotlinea_indicador
   where fecha = f and linea = 1 and envase = '3500005';
  if v <> 619 then v_falla := v_falla || ' 9(rotas=' || v || ', se esperaban 619)'; end if;
  if p is null or abs(p - 0.619) > 0.0001 then
    v_falla := v_falla || ' 9b(%=' || coalesce(p::text,'nulo') || ')'; end if;

  -- 10. EL FULL JOIN: un dia con produccion y SIN rotura tiene que salir,
  --     o nadie se entera de que a nadie se le olvido registrar.
  insert into public.rotlinea_produccion (orden, fecha, linea, sku, cantidad)
  values ('99999999', date '2026-09-02', 2, '3128P', 500000)
  on conflict (orden) do nothing;
  if not exists (select 1 from public.v_rotlinea_indicador
                  where fecha = date '2026-09-02' and rotas = 0 and producidas = 500000) then
    v_falla := v_falla || ' 10(el dia sin rotura no salio)'; end if;

  -- 11. Y al reves: rotura sin produccion tambien sale, con producidas en 0.
  if not exists (select 1 from public.v_rotlinea_indicador
                  where fecha = f and producidas = 100000) then
    v_falla := v_falla || ' 11(no cruzo con la produccion)'; end if;

  -- 12. El pareto por maquina.
  select rotas into v from public.v_rotlinea_maquina
   where fecha = f and linea = 1 and maquina = 9;
  if v <> 176 then v_falla := v_falla || ' 12(pareto dio ' || v || ')'; end if;

  -- 13. Lo pendiente de baja.
  if not exists (select 1 from public.v_rotlinea_sin_baja
                  where fecha = f and linea = 1 and turno = 1
                    and maquinas = 4 and pesadas = 1) then
    v_falla := v_falla || ' 13(no salio como pendiente de baja)'; end if;

  -- 14. La llave unica: la misma maquina dos veces en el mismo turno, no.
  begin
    insert into public.rotlinea_registro (fecha, linea, turno, envase, maquina, toma, kg, und)
    values (f, 1, 1, '3500005', 9, 1, 5, 29);
    v_falla := v_falla || ' 14(dejo duplicar la misma pesada)';
  exception when unique_violation then null;
  end;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'supervisor: 17 de 17';
end $$;

reset role;
reset request.jwt.claim.sub;
