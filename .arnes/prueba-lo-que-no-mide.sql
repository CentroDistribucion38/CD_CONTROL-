\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- LO QUE SE MOVIÓ Y NO MIDE
--
-- «Nosotros dejamos que los viajes de tolvas y estibas que no eran para
--  Arenosa no contaran en el %. Pero necesitamos dejar la tarjeta para
--  visualizar cuántos viajes hicieron.»   — Santiago L, Bavaria
--
-- LO QUE SE COMPRUEBA NO ES «¿SALE LA TARJETA?» —eso es maquetación—
-- sino las cuatro cosas que pueden romperse al sacar algo de un
-- porcentaje y a la vez mostrarlo:
--
--   1. Lo que no mide SIGUE SIN CONTAR en el cumplido. Es la regla de
--      Bavaria y es lo primero que se pierde cuando algo vuelve a la
--      pantalla: se ve, alguien lo suma, y el porcentaje cambia.
--   2. Pero YA SE VE, con sus viajes contados por tipo.
--   3. NINGÚN VIAJE ESTÁ EN LAS DOS VISTAS, y entre las dos están
--      TODOS. Es lo único que garantiza que nada desaparezca: un viaje
--      que se cae de las dos no da error, simplemente no existe.
--   4. Las estibas SÍ DE ARENOSA cuentan, y no salen en la tarjeta. El
--      mismo tipo cae de un lado o del otro según el viaje, y esa es la
--      parte fácil de romper.
-- =====================================================================

insert into public.traspasos_tipos (clave, nombre, activo, orden, cuenta_plan, pregunta_arenosa)
values ('tolvas_vidrio', 'Tolvas de Vidrio', true, 20, false, false)
on conflict (clave) do update set cuenta_plan = false, pregunta_arenosa = false, activo = true;

insert into public.traspasos_puntos (clave, nombre, activo)
values ('CD38', 'CD38', true), ('PELDAR', 'Peldar', true)
on conflict (clave) do update set activo = true;

/* SE VACÍA EL DÍA ANTES DE EMPEZAR. Cualquier viaje que otra prueba
   haya dejado descuadraría los números de esta, y nadie sabría cuál de
   las dos está mal.

   Y SE USA HOY Y NO UNA FECHA VIEJA: el candado del día cerrado rechaza
   registrar en días pasados —«lo registra un administrador»— y con
   razón. Pelearse con esa regla para montar una prueba sería empezar
   por apagar un freno de verdad. */
delete from public.traspasos_viajes where fecha = current_date;
delete from public.traspasos_plan where fecha = current_date;

insert into public.traspasos_plan (fecha, turno, tipo, planeado, estado, publicado)
values (current_date, 'A', 'casco_vidrio', 10, 'registrado', true)
on conflict do nothing;

insert into public.traspasos_viajes
  (codigo, fecha, turno, tipo, placa, origen, destino, viajes, vacio, estado, salida_en, factura_documento, arenosa)
values
  /* LO QUE MIDE: casco que salió, y casco que todavía espera el papel. */
  ('NM-A', current_date, 'A', 'casco_vidrio',  'AAA111', 'CD38', 'PELDAR', 3, false, 'registrado', now(), '8100000001', false),
  ('NM-B', current_date, 'A', 'casco_vidrio',  'BBB222', 'CD38', 'PELDAR', 2, false, 'registrado', null,  null,        false),
  /* LO QUE NO MIDE POR EL TIPO: tolvas de vidrio. */
  ('NM-C', current_date, 'A', 'tolvas_vidrio', 'CCC333', 'CD38', 'PELDAR', 4, false, 'registrado', now(), '8100000003', false),
  ('NM-D', current_date, 'A', 'tolvas_vidrio', 'DDD444', 'CD38', 'PELDAR', 1, false, 'registrado', null,  null,        false),
  /* LO QUE NO MIDE POR EL VIAJE: estibas que no eran de Arenosa. */
  ('NM-E', current_date, 'A', 'estibas',       'EEE555', 'CD38', 'PELDAR', 6, false, 'registrado', now(), '8100000005', false),
  /* Y LAS ESTIBAS QUE SÍ ERAN: el mismo tipo, del otro lado. */
  ('NM-F', current_date, 'A', 'estibas',       'FFF666', 'CD38', 'PELDAR', 5, false, 'registrado', now(), '8100000006', true);

do $$
declare
  v_falla text := '';
  v_cumplido int; v_porsalir int;
  v_fuera int; v_tolvas int; v_estibas_no int; v_estibas_si int;
  v_adentro int; v_todos int;
  v_motivos text;
begin
  -- 1. LO QUE NO MIDE NO CUENTA EN EL CUMPLIDO.
  --    Casco: 3 salieron, 2 esperan. Estibas de Arenosa: 5 salieron.
  --    Nada más puede estar ahí.
  select coalesce(sum(cumplido), 0), coalesce(sum(por_salir), 0)
    into v_cumplido, v_porsalir
    from public.v_traspasos_control where fecha = current_date;
  if v_cumplido <> 8 then
    v_falla := v_falla || ' 1(el cumplido da ' || v_cumplido || ' y son 8: 3 de casco y 5 de estibas de Arenosa)'; end if;
  if v_porsalir <> 2 then
    v_falla := v_falla || ' 1b(esperando a facturacion da ' || v_porsalir || ' y son 2)'; end if;

  -- 1c. Y NI UNA TOLVA se coló en el cumplido, por su nombre.
  select coalesce(sum(cumplido + por_salir), 0) into v_tolvas
    from public.v_traspasos_control
   where fecha = current_date and tipo = 'tolvas_vidrio';
  if v_tolvas <> 0 then
    v_falla := v_falla || ' 1c(las tolvas se colaron en el cumplido: ' || v_tolvas || ')'; end if;

  -- 2. PERO YA SE VEN. 4 + 1 tolvas y 6 estibas que no eran de Arenosa.
  select coalesce(sum(viajes), 0) into v_fuera
    from public.v_traspasos_fuera_del_plan where fecha = current_date;
  if v_fuera <> 11 then
    v_falla := v_falla || ' 2(la tarjeta muestra ' || v_fuera || ' viajes y son 11)'; end if;

  select coalesce(sum(viajes), 0) into v_tolvas
    from public.v_traspasos_fuera_del_plan
   where fecha = current_date and tipo = 'tolvas_vidrio';
  if v_tolvas <> 5 then
    v_falla := v_falla || ' 2b(las tolvas salen como ' || v_tolvas || ' y son 5)'; end if;

  select coalesce(sum(viajes), 0) into v_estibas_no
    from public.v_traspasos_fuera_del_plan
   where fecha = current_date and tipo = 'estibas';
  if v_estibas_no <> 6 then
    v_falla := v_falla || ' 2c(las estibas que no eran de Arenosa salen como ' || v_estibas_no || ' y son 6)'; end if;

  -- 2d. Y SE PARTE EN SALIDO Y ESPERANDO, igual que el cumplido. Dos
  --     cifras del mismo tablero no pueden contar cosas distintas.
  select coalesce(sum(salidos), 0), coalesce(sum(por_salir), 0)
    into v_tolvas, v_estibas_si
    from public.v_traspasos_fuera_del_plan where fecha = current_date;
  if v_tolvas <> 10 or v_estibas_si <> 1 then
    v_falla := v_falla || ' 2d(salidos=' || v_tolvas || ' esperando=' || v_estibas_si || ', y son 10 y 1)'; end if;

  -- 2e. LOS DOS MOTIVOS, SEPARADOS Y CON NOMBRE. Juntarlos en un
  --     «otros» borra que son dos decisiones distintas del negocio.
  select string_agg(distinct motivo, ',' order by motivo) into v_motivos
    from public.v_traspasos_fuera_del_plan where fecha = current_date;
  if v_motivos is distinct from 'no_arenosa,no_mide' then
    v_falla := v_falla || ' 2e(los motivos son «' || coalesce(v_motivos, 'ninguno') || '» y deben ser no_arenosa y no_mide)'; end if;
  if exists (select 1 from public.v_traspasos_fuera_del_plan
              where fecha = current_date and coalesce(motivo_nombre, '') = '') then
    v_falla := v_falla || ' 2f(hay motivos sin nombre en cristiano)'; end if;

  -- 3. NINGÚN VIAJE EN LAS DOS, Y NINGUNO EN NINGUNA.
  --    Es lo único que garantiza que nada desaparezca del tablero: un
  --    viaje que se cae de las dos vistas no da error, deja de existir.
  select coalesce(sum(cumplido + por_salir), 0) into v_adentro
    from public.v_traspasos_control where fecha = current_date;
  select coalesce(sum(v.viajes), 0) into v_todos
    from public.traspasos_viajes v
    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id
   where v.fecha = current_date and v.estado = 'registrado' and not v.vacio;
  if v_adentro + v_fuera <> v_todos then
    v_falla := v_falla || ' 3(adentro ' || v_adentro || ' + afuera ' || v_fuera
                       || ' = ' || (v_adentro + v_fuera) || ' y en total hay ' || v_todos || ')'; end if;

  -- 4. LAS ESTIBAS DE ARENOSA CUENTAN Y NO SALEN EN LA TARJETA.
  --    El mismo tipo cae de un lado o del otro según el viaje, y eso es
  --    lo más fácil de romper de todo esto.
  select coalesce(sum(cumplido), 0) into v_estibas_si
    from public.v_traspasos_control
   where fecha = current_date and tipo = 'estibas';
  if v_estibas_si <> 5 then
    v_falla := v_falla || ' 4(las estibas de Arenosa cuentan ' || v_estibas_si || ' y son 5)'; end if;
  /* 4b. Y LA TARJETA TRAE SOLO LA MITAD QUE NO ERA DE ARENOSA: un
     renglón de estibas, con su motivo, y con los 6 viajes — no con los
     11 del tipo entero. Si la tarjeta trajera los 11, los 5 de Arenosa
     estarían contados DOS veces en el tablero: una en el cumplido y
     otra aquí.

     OJO CON CÓMO SE PREGUNTA ESTO: la primera versión unía la vista con
     los viajes por fecha/turno/tipo y preguntaba si alguno era de
     Arenosa. Esa unión pega los DOS viajes de estibas —el de Arenosa y
     el que no— porque comparten las tres columnas, así que decía que sí
     siempre. Una prueba que no puede fallar por la razón correcta es
     peor que no tenerla. */
  select coalesce(sum(viajes), 0), count(*) into v_estibas_no, v_tolvas
    from public.v_traspasos_fuera_del_plan
   where fecha = current_date and tipo = 'estibas' and motivo = 'no_arenosa';
  if v_tolvas <> 1 or v_estibas_no <> 6 then
    v_falla := v_falla || ' 4b(la tarjeta trae ' || v_tolvas || ' renglon(es) de estibas con '
                       || v_estibas_no || ' viajes, y debe traer 1 renglon con 6: los 5 de Arenosa'
                       || ' ya estan en el cumplido y estarian contados dos veces)'; end if;
  if exists (select 1 from public.v_traspasos_fuera_del_plan
              where fecha = current_date and tipo = 'estibas' and motivo <> 'no_arenosa') then
    v_falla := v_falla || ' 4c(hay estibas en la tarjeta por un motivo que no es «no era de Arenosa»)'; end if;

  if v_falla = '' then
    raise notice 'NO MIDE: bien. El cumplido cuenta 8 y no se cuela ni una tolva; la tarjeta muestra 11 con sus dos motivos; y entre las dos vistas estan todos los viajes, sin repetir.';
  else
    raise exception 'NO MIDE FALLA:%', v_falla;
  end if;
end $$;

do $$ begin raise notice 'NO MIDE ok'; end $$;
