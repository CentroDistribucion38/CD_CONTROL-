-- =====================================================================
-- ROTURAS · OPERARIOS: EL PIN PASA A SER LOS ÚLTIMOS 4 DÍGITOS DE LA CÉDULA
--
-- Cambia el PIN de los 70 operarios de la lista «Base_datos_OPMs». Se busca a cada uno por su NOMBRE
-- (sin tildes ni mayúsculas); la cédula no se guarda, solo el PIN de 4 dígitos que sale de ella.
--
-- ANTES DE CAMBIAR NADA revisa dos cosas, y si algo falla NO cambia ninguno (todo o nada):
--   · que cada nombre de la lista exista en el maestro de operarios;
--   · que el PIN nuevo no choque con el de un operario que NO está en la lista.
-- Las roturas ya reportadas siguen a nombre de cada operario: se guardan por operario, no por PIN.
-- Se puede correr más de una vez (la segunda no cambia nada).
--
-- OJO: cada operario tiene que enterarse de su PIN nuevo. El anterior deja de servir.
-- =====================================================================
begin;

create temp table _pin_nuevo (nombre text, pin text) on commit drop;
insert into _pin_nuevo (nombre, pin) values
    ('ABEL FERNANDO LÓPEZ ESTRADA', '1755'),
    ('JABID JUNIOR CAMACHO BURGOS', '4864'),
    ('ARIS JOSÉ DOMINGUEZ LÓPEZ', '5848'),
    ('DEIVIS MANUEL PUELLO DE AVILA', '9271'),
    ('EDINSON MANUEL MARQUEZ VASQUEZ', '8355'),
    ('JAIR JUNIOR RIOS OLIVEROS', '9822'),
    ('JOSE YAIR RIVERA ZAPATA', '5689'),
    ('JUAN CARLOS ORELLANO SIERRA', '5226'),
    ('MARLON ENRIQUE SARMIENTO PEDRAZA', '0853'),
    ('WILLIAM RAFAEL SAUCEDO TORRES', '5196'),
    ('FERNANDO RAFAEL PULIDO MARRIAGA', '9534'),
    ('JESUS DANIEL ESTRADA GARCIA', '2034'),
    ('VICTOR MANUEL BUELVAS VERGEL', '9391'),
    ('FABIAN ANDRES AMADOR PONNETH', '4938'),
    ('CARLOS DAMIAN VARGAS BAYUELO', '3393'),
    ('FRANKLIN ANTONIO GONZALEZ VALERA', '6085'),
    ('JAIRO JOSE SALCEDO DE LA HOZ', '2378'),
    ('ADOLFO GUAY CAÑIZARES TAFUR', '2387'),
    ('ALBEIRO MORENO RAMIREZ', '4371'),
    ('ALDAIR CERVERA GARCIA', '6214'),
    ('CARLOS JULIO GAZABON MARTINEZ', '0471'),
    ('DORISMEL TORRES CARMONA', '7682'),
    ('GILMAR MONDUL SEPULVEDA', '3224'),
    ('HAMILTON MANUEL NAVARRO OSORIO', '7342'),
    ('JABID ANTONIO CAMACHO GIRALDO', '4812'),
    ('JEISON MANUEL RUIZ BLANCO', '9337'),
    ('JESUS RAFAEL ALVAREZ CASTRO', '4870'),
    ('JHONATAN JESUS CAMPO RICIOLIS', '7461'),
    ('JHONN JAIRO PEDROZA QUINTERO', '7405'),
    ('JOSE GREGORIO PEREZ SEPULVEDA', '5926'),
    ('JULIO FERNANDO GARCIA PACHECO', '5229'),
    ('KEINER DE JESUS VIDES MARIOTA', '4645'),
    ('LARRY CECILIO RICO LORA', '4197'),
    ('LUIS ALFONSO MORENO OROZCO', '9078'),
    ('LUIS GABRIEL LAFAURE OSPINO', '1214'),
    ('MAURICIO SUANCHA AVILA', '7196'),
    ('ROBERTO ENRIQUE JIMENEZ IBAÑEZ', '6367'),
    ('RODOLFO JAVIER ALTAMAR OLMOS', '7217'),
    ('YEINER ENRIQUE CASSIANI CAICEDO', '7052'),
    ('JOSE ARMANDO SANTANA GAMARRA', '7941'),
    ('ANDRES FELIPE ZABALETA GUZMAN', '2905'),
    ('CARLOS ALFREDO VITAL ARISCAPA', '1233'),
    ('CHENIER PINEDA HERNÁNDEZ', '4487'),
    ('DARIO JOSE GONZALEZ BARROS', '0692'),
    ('DONYS DE JESUS MERCADO ESCORCIA', '6615'),
    ('EDILBERTO AVILA RAMOS', '8396'),
    ('EDINSON DAVID VELASQUEZ YANES', '0132'),
    ('EDUARDO JOSE DIAZ AHUMADA', '6098'),
    ('FRAN ALEXANDER ORDOÑEZ BLANCO', '5349'),
    ('FREDDY JUNIOR CHAMORRO MORENO', '5098'),
    ('GASTON JUNIOR ESCALANTE DE AVILA', '6384'),
    ('GERSON JESUS GONZALEZ DE LA CRUZ', '5852'),
    ('GUSTAVO EDWIN HINCAPIE PEREZ', '9811'),
    ('HENRY JUNIOR TORRES TABOADA', '4375'),
    ('JEFERSON MORA TRESPALACIO', '5779'),
    ('JESUS MANUEL PAJARO RODRIGUEZ', '7212'),
    ('KEIVIS EDUARDO MOLINA SALAS', '5510'),
    ('LUIS EDUARDO CAICEDO HERRERA', '2452'),
    ('NASSER WALID CHIBLE LUGO', '6591'),
    ('ORLANDO DE JESUS CUETO OROZCO', '9711'),
    ('STARLYN GIOVANNY ARIZA ZUÑIGA', '9865'),
    ('YENDRIS DAVID DUQUE SARABIA', '4544'),
    ('YOSIMAR SANDOVAL SARABIA', '3894'),
    ('VICTOR ALFONSO PERTUZ CANTILLO', '9903'),
    ('DUBAN DUARTE SANDOVAL', '9562'),
    ('FREDDY ENRRIQUE ALVAREZ SOTO', '2639'),
    ('JHON JAIRO PACHECO PACHECO', '4262'),
    ('MIGUEL MOISES VEGA MENDOZA', '1139'),
    ('NEVIN AGUANCHE LOPEZ', '5433'),
    ('WILLIAM DE JESUS OCAMPO BUSTAMANTE', '8613');

do $$
declare v_sin text; v_choca text;
begin
  select string_agg(n.nombre, ', ' order by n.nombre) into v_sin
    from _pin_nuevo n
   where not exists (select 1 from public.roturas_operarios o
                      where public.sin_tildes(lower(regexp_replace(btrim(o.nombre), '\s+', ' ', 'g'))) = public.sin_tildes(lower(n.nombre)));
  if v_sin is not null then
    raise exception 'No están en el maestro de operarios (no se cambió nada): %', v_sin;
  end if;

  select string_agg(o.nombre || ' (' || o.pin || ')', ', ') into v_choca
    from public.roturas_operarios o
    join _pin_nuevo n on n.pin = o.pin
   where not exists (select 1 from _pin_nuevo m
                      where public.sin_tildes(lower(m.nombre)) = public.sin_tildes(lower(regexp_replace(btrim(o.nombre), '\s+', ' ', 'g'))));
  if v_choca is not null then
    raise exception 'Estos operarios NO están en la lista y ya tienen un PIN que le tocaría a otro (no se cambió nada): %', v_choca;
  end if;
end $$;

-- En dos pasos: si un PIN nuevo es el viejo de otro, el cambio directo chocaría a mitad de camino.
update public.roturas_operarios o
   set pin = '99' || lpad(t.rn::text, 6, '0')
  from (select o2.id, row_number() over (order by o2.id) as rn
          from public.roturas_operarios o2
          join _pin_nuevo n on public.sin_tildes(lower(regexp_replace(btrim(o2.nombre), '\s+', ' ', 'g'))) = public.sin_tildes(lower(n.nombre))
         where o2.pin <> n.pin) t
 where o.id = t.id;

update public.roturas_operarios o
   set pin = n.pin
  from _pin_nuevo n
 where public.sin_tildes(lower(regexp_replace(btrim(o.nombre), '\s+', ' ', 'g'))) = public.sin_tildes(lower(n.nombre))
   and o.pin <> n.pin;

do $$
declare v_mal int;
begin
  select count(*) into v_mal from public.roturas_operarios o
   join _pin_nuevo n on public.sin_tildes(lower(regexp_replace(btrim(o.nombre), '\s+', ' ', 'g'))) = public.sin_tildes(lower(n.nombre))
  where o.pin <> n.pin;
  if v_mal > 0 then raise exception 'Quedaron % operarios sin su PIN nuevo', v_mal; end if;
  raise notice 'Listo: los 70 operarios de la lista tienen como PIN los últimos 4 dígitos de su cédula.';
end $$;

commit;
