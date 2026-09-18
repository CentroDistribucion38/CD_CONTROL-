\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- QUE NADIE PIERDA EL TABLERO DE QUIEBRA
--
-- Roturas se mudó dentro de Quiebra y las direcciones de Roturas no se
-- tocaron —los permisos están guardados como el texto de la ruta—. La
-- única que cambió es el tablero: /quiebra pasó a ser la bifurcación y
-- el tablero se fue a /quiebra/tablero.
--
-- Lo que se comprueba no es «¿insertó filas?» sino QUE CADA UNO QUEDÓ
-- CON LO MISMO QUE TENÍA. Contar filas no dice nada: podrían estar todas
-- con el nivel equivocado.
-- =====================================================================

do $$
declare
  v_falla text := ''; v_n text; v_c int;
begin
  -- 1. CADA ROL CON SU NIVEL, no con uno fijo. El supervisor tenía
  --    'ver' y el jefe de planta 'editar': si la migración copiara un
  --    valor a secas, uno de los dos saldría mal.
  select nivel into v_n from public.rol_permisos
   where rol = 'supervisor' and seccion = '/quiebra/tablero';
  if v_n is distinct from 'ver' then
    v_falla := v_falla || ' 1(supervisor quedo con ' || coalesce(v_n,'nada') || ' en vez de ver)'; end if;

  select nivel into v_n from public.rol_permisos
   where rol = 'jefeplanta' and seccion = '/quiebra/tablero';
  if v_n is distinct from 'editar' then
    v_falla := v_falla || ' 2(jefeplanta quedo con ' || coalesce(v_n,'nada') || ' en vez de editar)'; end if;

  -- 3. UN ROL QUE NO TIENE /quiebra NO ACABA CON EL TABLERO. Repartir de
  --    más es tan error como repartir de menos, y este no se nota nunca:
  --    nadie reclama una pantalla que no debería ver.
  select count(*) into v_c from public.rol_permisos
   where rol = 'porteria' and seccion = '/quiebra/tablero';
  if v_c <> 0 then
    v_falla := v_falla || ' 3(porteria acabo con el tablero sin tener /quiebra)'; end if;

  -- 4. LO QUE YA ESTABA PUESTO A MANO NO SE PISA.
  select nivel into v_n from public.rol_permisos
   where rol = 'yatiene' and seccion = '/quiebra/tablero';
  if v_n is distinct from 'editar' then
    v_falla := v_falla || ' 4(le piso el nivel puesto a mano: quedo ' || coalesce(v_n,'nada') || ')'; end if;

  -- 5. A QUIEN LE CERRARON /quiebra EN PARTICULAR se le queda cerrado el
  --    tablero. Si solo se copiaran los roles, lo recuperaría por la
  --    puerta de atrás — y eso nadie lo vuelve a revisar.
  select permisos_extra ->> '/quiebra/tablero' into v_n
    from public.perfiles where usuario = 'cerrado';
  if v_n is distinct from 'ninguno' then
    v_falla := v_falla || ' 5(al que le cerraron /quiebra le quedo el tablero en '
               || coalesce(v_n,'nada') || ')'; end if;

  -- 6. Y A QUIEN SE LO ABRIERON POR ENCIMA de su rol, se le queda
  --    abierto con el mismo nivel.
  select permisos_extra ->> '/quiebra/tablero' into v_n
    from public.perfiles where usuario = 'abierto';
  if v_n is distinct from 'editar' then
    v_falla := v_falla || ' 6(al que le abrieron /quiebra le quedo el tablero en '
               || coalesce(v_n,'nada') || ')'; end if;

  -- 7. A QUIEN NO LE TOCARON NADA no se le inventa un permiso propio.
  --    Su tablero tiene que salir de su rol, como todo lo demás.
  select count(*) into v_c from public.perfiles
   where usuario = 'normal' and permisos_extra ? '/quiebra/tablero';
  if v_c <> 0 then
    v_falla := v_falla || ' 7(le invento un permiso propio a quien no tenia ninguno)'; end if;

  -- 8. /quiebra SIGUE EXISTIENDO. Es la puerta del módulo: quien no la
  --    tenga no vería ni la bifurcación. Se copia, no se mueve.
  select count(*) into v_c from public.rol_permisos
   where seccion = '/quiebra' and rol in ('supervisor','operador','jefeplanta','yatiene');
  if v_c <> 4 then
    v_falla := v_falla || ' 8(se perdio el permiso sobre /quiebra: quedan ' || v_c || ' de 4)'; end if;

  -- 9. Y NINGUNA RUTA DE ROTURAS SE MOVIÓ. No las toca esta migración y
  --    no las puede tocar: lo que se mudó es dónde se entra, no dónde
  --    vive.
  select count(*) into v_c from public.rol_permisos
   where seccion like '/quiebra/roturas%';
  if v_c <> 0 then
    v_falla := v_falla || ' 9(aparecieron rutas /quiebra/roturas: las direcciones no debian cambiar)'; end if;

  if v_falla <> '' then raise exception 'PERMISOS:%', v_falla; end if;
  raise notice 'PERMISOS ok';
end $$;

do $$ begin raise notice 'ROTURAS EN QUIEBRA: nadie perdió nada'; end $$;
