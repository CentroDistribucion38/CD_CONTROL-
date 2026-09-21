\set ON_ERROR_STOP on
set client_min_messages = notice;

/* COMO UN USUARIO DE VERDAD, NO COMO SUPERUSUARIO. El superusuario se
   salta el RLS, y una prueba que pasa saltándoselo no dice nada de lo
   que va a pasar en la app. */
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;

-- =====================================================================
-- DOS MÁQUINAS QUE SE SUMAN EN OTRA — lo que se comprueba y por qué
--
--   · QUE LA SUMA CAIGA DONDE DEBE: PALE-DEPA dentro de PASTEURIZADORA
--     y CARGADOR dentro de SALIDA DE LAVADORA, con la cifra exacta.
--   · QUE NO SE PIERDA NI UNA BOTELLA: el total del tablero antes y
--     después tiene que ser el mismo. Juntar no es restar.
--   · QUE EL REGISTRO NO SE TOQUE: lo anotado sigue diciendo CARGADOR.
--   · QUE SE PUEDA DESHACER: quitar `suma_en` separa todo otra vez,
--     hacia atrás incluido.
--   · QUE NO HAYA CADENAS: A→B→C dejaría una B que no debería existir.
--   · QUE LA VISTA Y LA FUNCIÓN DIGAN LO MISMO.
--   · QUE EL FILTRO DE LÍNEA SIGA FILTRANDO.
-- =====================================================================

do $prueba$
declare
  f date := date '2026-09-15';
  v_falla text := '';
  v bigint; k numeric; t_antes bigint; t_despues bigint; n int;
begin
  delete from public.rotlinea_registro where fecha = f;

  /* Línea 1, un envase, cinco máquinas con cifras que no se pueden
     confundir entre sí: si una suma sale bien por casualidad, sale con
     un número que delata de dónde vino. */
  insert into public.rotlinea_registro (fecha, linea, turno, envase, maquina, kg, und) values
    (f, 1, 1, '3500005',  13, 10.00, 100),   -- PASTEURIZADORA
    (f, 1, 1, '3500005', 155,  2.00,   7),   -- PALE-DEPA        → 13
    (f, 1, 1, '3500005',   6,  5.00,  40),   -- SALIDA DE LAVADORA
    (f, 1, 1, '3500005',  66,  1.00,   3),   -- CARGADOR         → 6
    (f, 1, 1, '3500005',  12,  4.00,  20),   -- LAVADORA, no se toca
    /* Otra línea: el filtro de línea tiene que seguir dejándola fuera. */
    (f, 2, 1, '3500005',  66,  9.00, 900);

  select sum(und) into t_antes from public.rotlinea_registro where fecha = f and linea = 1;

  /* ---- 1 · LA SUMA CAE DONDE DEBE ---- */
  select rotas, kg into v, k from public.rotlinea_tablero_maquina(f, f, 1::smallint) where maquina = 13;
  if v is distinct from 107 then
    v_falla := v_falla || ' 1(PASTEURIZADORA da ' || coalesce(v::text,'nada') || ' y debe dar 107 = 100 + 7 de PALE-DEPA)'; end if;
  if k is distinct from 12.00 then
    v_falla := v_falla || ' 1b(los kilos de PASTEURIZADORA dan ' || coalesce(k::text,'nada') || ' y deben dar 12)'; end if;

  select rotas into v from public.rotlinea_tablero_maquina(f, f, 1::smallint) where maquina = 6;
  if v is distinct from 43 then
    v_falla := v_falla || ' 2(SALIDA DE LAVADORA da ' || coalesce(v::text,'nada') || ' y debe dar 43 = 40 + 3 de CARGADOR)'; end if;

  select rotas into v from public.rotlinea_tablero_maquina(f, f, 1::smallint) where maquina = 12;
  if v is distinct from 20 then
    v_falla := v_falla || ' 3(LAVADORA cambió: da ' || coalesce(v::text,'nada') || ' y no tenía por qué)'; end if;

  if exists (select 1 from public.rotlinea_tablero_maquina(f, f, 1::smallint) where maquina in (66, 155)) then
    v_falla := v_falla || ' 4(CARGADOR o PALE-DEPA siguen saliendo aparte en el tablero)'; end if;

  /* El nombre que se enseña es el de DESTINO. */
  if (select maquina_nombre from public.rotlinea_tablero_maquina(f, f, 1::smallint) where maquina = 13)
       is distinct from 'PASTEURIZADORA' then
    v_falla := v_falla || ' 4b(la barra de la 13 no se llama PASTEURIZADORA)'; end if;

  /* ---- 2 · NO SE PIERDE NI UNA BOTELLA ---- */
  select sum(rotas) into t_despues from public.rotlinea_tablero_maquina(f, f, 1::smallint);
  if t_despues is distinct from t_antes then
    v_falla := v_falla || ' 5(el tablero suma ' || coalesce(t_despues::text,'nada') ||
               ' y lo anotado son ' || t_antes || ': juntar no puede restar)'; end if;

  /* ---- 3 · EL REGISTRO NO SE TOCÓ ---- */
  select count(*) into n from public.rotlinea_registro
   where fecha = f and linea = 1 and maquina in (66, 155);
  if n <> 2 then
    v_falla := v_falla || ' 6(los registros de CARGADOR y PALE-DEPA se reescribieron: quedan ' || n || ' de 2)'; end if;

  /* Y EL HISTÓRICO, que es donde de verdad se ve: dos filas anotadas
     ANTES de la migración. Las de arriba nacieron después, así que una
     migración que reescribiera lo que ya estaba no las habría tocado. */
  if (select count(*) from public.rotlinea_registro
       where fecha = date '2026-01-02' and maquina in (66, 155)) <> 2 then
    v_falla := v_falla || ' 6b(la migración reescribió el histórico: lo anotado antes ya no dice CARGADOR y PALE-DEPA)'; end if;

  /* ---- 4 · EL FILTRO DE LÍNEA ---- */
  select rotas into v from public.rotlinea_tablero_maquina(f, f, 2::smallint) where maquina = 6;
  if v is distinct from 900 then
    v_falla := v_falla || ' 7(en la línea 2 SALIDA DE LAVADORA da ' || coalesce(v::text,'nada') || ' y debe dar 900)'; end if;
  select rotas into v from public.rotlinea_tablero_maquina(f, f, null) where maquina = 6;
  if v is distinct from 943 then
    v_falla := v_falla || ' 7b(sin filtro de línea SALIDA DE LAVADORA da ' || coalesce(v::text,'nada') || ' y debe dar 943)'; end if;

  /* ---- 5 · LA VISTA DICE LO MISMO ---- */
  if exists (
    select 1 from public.rotlinea_tablero_maquina(f, f, 1::smallint) t
    full join (select maquina, rotas from public.v_rotlinea_maquina where fecha = f and linea = 1) w
      using (maquina)
    where t.rotas is distinct from w.rotas) then
    v_falla := v_falla || ' 8(la vista diaria y la función dan paretos distintos del mismo día)'; end if;

  /* ---- 6 · SE DESHACE ---- */
  update public.rotlinea_maquinas set suma_en = null where item = 66;
  select rotas into v from public.rotlinea_tablero_maquina(f, f, 1::smallint) where maquina = 66;
  if v is distinct from 3 then
    v_falla := v_falla || ' 9(quitando la regla, CARGADOR no vuelve a salir solo con sus 3)'; end if;
  select rotas into v from public.rotlinea_tablero_maquina(f, f, 1::smallint) where maquina = 6;
  if v is distinct from 40 then
    v_falla := v_falla || ' 9b(quitando la regla, SALIDA DE LAVADORA no vuelve a sus 40)'; end if;
  update public.rotlinea_maquinas set suma_en = 6 where item = 66;

  /* ---- 7 · NO HAY CADENAS ---- */
  begin
    update public.rotlinea_maquinas set suma_en = 12 where item = 13;   -- 13 recibe a 155
    v_falla := v_falla || ' 10(PASTEURIZADORA se dejó sumar en otra teniendo a PALE-DEPA dentro)';
  exception when others then
    if sqlerrm not like '%Cambia primero las que apuntan a ella%' then
      v_falla := v_falla || ' 10b(lo rechazó, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;
  begin
    update public.rotlinea_maquinas set suma_en = 155 where item = 12;  -- 155 ya se suma en 13
    v_falla := v_falla || ' 11(LAVADORA se dejó sumar en PALE-DEPA, que ya se suma en otra)';
  exception when others then
    if sqlerrm not like '%Súmala directamente en la de destino%' then
      v_falla := v_falla || ' 11b(lo rechazó, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;

  delete from public.rotlinea_registro where fecha = f;

  if v_falla <> '' then raise exception 'SUMAR:%', v_falla; end if;
  raise notice 'SUMAR ok';
end $prueba$;

reset role;
do $fin$ begin raise notice 'PALE-DEPA Y CARGADOR SE SUMAN DONDE DEBEN: todo en orden'; end $fin$;
