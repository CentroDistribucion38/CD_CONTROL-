-- =====================================================================
-- ROTURA DE LÍNEA · dentro de QUIEBRA
--
-- Requiere: supabase/00-nucleo.sql, 01-perfil.sql, 02-roles.sql
--
-- QUÉ ES.
--
-- El envase que se rompe MIENTRAS SE ENVASA, máquina por máquina, a lo
-- largo del tren: desempacadora, lavadora, llenadora, pasteurizadora,
-- etiquetadora, empacadora. Vive dentro de Quiebra porque es una
-- pérdida de material como las otras, pero se mide distinto: lo que
-- importa no es el número, es el PORCENTAJE CONTRA LA PRODUCCIÓN. Mil
-- botellas rotas en un día de tres millones y mil en un día de
-- ochocientas mil son dos cosas muy distintas.
--
-- POR QUÉ EL PREFIJO `rotlinea_` Y NO `roturas_`.
--
-- Ya hay un módulo ROTURAS en este mismo proyecto —el de las tolvas y
-- las salidas— y se quedó con `roturas_*` y con las funciones
-- `rotura_*`. Son dos cosas que se llaman igual y no son la misma:
-- aquella es producto que se rompe en bodega, esta es envase que se
-- rompe en la línea. Reusar el prefijo era garantizar que dentro de
-- seis meses alguien lea la tabla equivocada.
--
-- DE DÓNDE SALE LA ESTRUCTURA.
--
-- Del archivo «ROTURA DE LINEA 2026.xlsx» que se venía llevando a mano:
--   · hoja MAESTRO  → las cuatro listas de aquí abajo
--   · hoja BASE     → rotlinea_registro (un renglón por fecha, línea,
--                     turno, envase y máquina)
--   · hoja ZPREC    → rotlinea_produccion (las órdenes de SAP)
--   · P-R, DASH, RESUMEN → vistas; son cuentas, no datos que alguien
--                     tenga que mantener
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LAS LÍNEAS
--
-- Cuatro trenes. El centro de coste es el que usa contabilidad y es lo
-- que amarra esta rotura con el costo: sin él, el informe no se puede
-- cruzar con nada de SAP.
-- ---------------------------------------------------------------------
create table if not exists public.rotlinea_lineas (
  linea        smallint primary key,
  tren         text not null,
  centro_coste text not null,
  activo       boolean not null default true,
  orden        smallint,
  creado_en    timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. LAS MÁQUINAS
--
-- El ITEM no es un número de orden: es el código con el que la máquina
-- se conoce (el CARGADOR es el 66 y PALE-DEPA el 155). El orden en que
-- se muestran es `orden`, que sí es el recorrido de la línea — y ese
-- recorrido es lo que hace legible la rejilla: quien la llena va
-- siguiendo el tren de principio a fin, no una lista alfabética.
-- ---------------------------------------------------------------------
create table if not exists public.rotlinea_maquinas (
  item      smallint primary key,
  nombre    text not null,
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. LOS ENVASES, con su peso
--
-- EL PESO ES EL CORAZÓN DE ESTE MÓDULO. En el muelle se pesa la
-- canastilla de vidrio roto: sale un número en kilos. Las unidades
-- salen de dividir por el peso de ese envase. Un envase de 330 pesa
-- 0.21 kg y uno de litro 0.62: con el peso equivocado, el informe de
-- unidades se va al doble sin que nadie lo note.
-- ---------------------------------------------------------------------
create table if not exists public.rotlinea_envases (
  material    text primary key,
  descripcion text not null,
  /* Kilos por botella. Cuatro decimales porque el de 175 pesa 0.1595 y
     el de la Costeña Bacana 0.320816: redondear a dos ya movía las
     unidades. */
  peso_kg     numeric(10, 6) not null check (peso_kg > 0),
  activo      boolean not null default true,
  orden       smallint,
  creado_en   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 4. LOS SKU, y a qué envase corresponden
--
-- Esta tabla es el puente entre las DOS MITADES del módulo. La rotura
-- se registra por ENVASE —lo que se rompe es vidrio, no producto—, pero
-- la producción llega de SAP por SKU de producto (3617P, Costeñita R
-- 175cc X 38). Sin este puente no hay forma de dividir una cosa por la
-- otra, y sin esa división no hay porcentaje.
-- ---------------------------------------------------------------------
create table if not exists public.rotlinea_skus (
  sku         text primary key,           -- el material de producto: 3617P
  descripcion text not null,
  corto       text,                       -- 3617, como aparece en algunos informes
  envase      text not null references public.rotlinea_envases(material),
  activo      boolean not null default true,
  orden       smallint,
  creado_en   timestamptz not null default now()
);

create index if not exists rotlinea_skus_envase_idx on public.rotlinea_skus (envase);


-- ---------------------------------------------------------------------
-- 5. EL REGISTRO
--
-- Un renglón por (fecha, línea, turno, envase, máquina, TOMA). Es la
-- hoja BASE.
--
-- LA TOMA ES EL DATO QUE EL EXCEL NO TENÍA, y es lo que hace que este
-- módulo cuadre. En 2026 hay 822 turnos que aparecen dos veces en la
-- hoja, 716 de ellos con kilos distintos: el 3 de enero, línea 1, turno
-- 2, Costeñita, las trece máquinas están dos veces —lavadora 12 kg y
-- otra vez 22, llenadora 15 y 19—. No son copias: son DOS PESADAS del
-- mismo turno, porque la línea paró y volvió a arrancar, o porque se
-- pesa a mitad y al final. Las dos son rotura de verdad y se suman: son
-- 73.563 unidades, el 3,9 % del año.
--
-- En la hoja eso no se podía decir —dos renglones idénticos en llave y
-- distintos en valor— así que quedaba a la vista de nadie. Aquí la toma
-- se numera: 1, 2, 3. La llave única sigue existiendo e incluye la
-- toma, así que lo que sigue siendo imposible es lo que de verdad es un
-- error: la MISMA pesada metida dos veces.
--
-- SE GUARDAN LOS KILOS Y LAS UNIDADES, las dos. Podría guardarse solo
-- el kilo y dividir al leer, pero entonces el día que alguien corrija
-- el peso de un envase se moverían para atrás tres meses de informes ya
-- entregados. Las unidades se calculan AL GUARDAR, con el peso de ese
-- momento, y se quedan quietas.
-- ---------------------------------------------------------------------
create table if not exists public.rotlinea_registro (
  id        uuid primary key default gen_random_uuid(),
  fecha     date not null,
  linea     smallint not null references public.rotlinea_lineas(linea),
  turno     smallint not null check (turno in (1, 2, 3)),
  envase    text not null references public.rotlinea_envases(material),
  maquina   smallint not null references public.rotlinea_maquinas(item),

  /* Cuál pesada de ese turno: 1 la primera, 2 la segunda. Se suman. */
  toma      smallint not null default 1 check (toma >= 1),

  kg        numeric(10, 2) not null check (kg >= 0),
  und       integer not null check (und >= 0),

  /* Si ya se dio de baja en SAP. En el Excel era la columna BAJA: 'OK'
     o en blanco, y los resúmenes filtraban por ahí. Aquí es un estado
     con nombre, no una celda vacía que puede significar dos cosas. */
  baja      boolean not null default false,
  baja_en   timestamptz,

  registrado_por uuid references public.perfiles(id) on delete set null,
  registrado_en  timestamptz not null default now(),

  unique (fecha, linea, turno, envase, maquina, toma)
);

create index if not exists rotlinea_registro_fecha_idx   on public.rotlinea_registro (fecha desc);
create index if not exists rotlinea_registro_maquina_idx on public.rotlinea_registro (maquina, fecha desc);
create index if not exists rotlinea_registro_envase_idx  on public.rotlinea_registro (envase, fecha desc);
/* Para el pendiente de baja, que es una lista corta dentro de una tabla
   larga: índice parcial, que ocupa lo que ocupan esas filas y no más. */
create index if not exists rotlinea_registro_sin_baja_idx
  on public.rotlinea_registro (fecha) where not baja;


-- ---------------------------------------------------------------------
-- 6. LA PRODUCCIÓN
--
-- Lo que sale del ZPREC de SAP: una fila por orden de producción. Se
-- guarda la orden para poder importar dos veces el mismo día sin
-- duplicar —la orden es la llave, no la fecha— y para poder rastrear
-- una cifra hasta el documento del que salió.
-- ---------------------------------------------------------------------
create table if not exists public.rotlinea_produccion (
  orden      text primary key,          -- 12438157
  fecha      date not null,
  linea      smallint not null references public.rotlinea_lineas(linea),
  sku        text not null references public.rotlinea_skus(sku),
  cantidad   bigint not null check (cantidad >= 0),   -- unidades (UN)
  hl         numeric(12, 2),
  importado_por uuid references public.perfiles(id) on delete set null,
  importado_en  timestamptz not null default now()
);

create index if not exists rotlinea_produccion_fecha_idx on public.rotlinea_produccion (fecha desc, linea);


-- ---------------------------------------------------------------------
-- 7. LAS CUATRO LISTAS, sembradas
-- ---------------------------------------------------------------------
insert into public.rotlinea_lineas (linea, tren, centro_coste, orden) values
  (1, 'TREN-1', 'COBAAG3162', 1),
  (2, 'TREN-2', 'COBAAG3163', 2),
  (4, 'TREN-4', 'COBAAG3165', 3),
  (6, 'TREN-6', 'COBAAG3174', 4)
on conflict (linea) do update set tren = excluded.tren, centro_coste = excluded.centro_coste;

/* EN EL ORDEN DEL TREN, no en el del Excel. Así es como se llena la
   rejilla: siguiendo la botella desde que la sacan de la canastilla
   hasta que sale empacada. */
insert into public.rotlinea_maquinas (item, nombre, orden) values
  (9,   'DESEMPACADORA',                 1),
  (1,   'DESEMPACADORA - LAVADORA',      2),
  (12,  'LAVADORA',                      3),
  (6,   'SALIDA DE LAVADORA',            4),
  (2,   'LAVADORA - LLENADORA',          5),
  (8,   'OMNIVISION',                    6),
  (11,  'ENVASADORA',                    7),
  (3,   'LLENADORA - PASTEURITZADOR',    8),
  (13,  'PASTEURIZADORA',                9),
  (4,   'PASTEURIZADORA - ETIQUETADORA', 10),
  (7,   'ETIQUETADORA',                  11),
  (5,   'ETIQUETADORA - EMPACADORA',     12),
  (10,  'EMPACADORA',                    13),
  (66,  'CARGADOR',                      14),
  (155, 'PALE-DEPA',                     15)
on conflict (item) do update set nombre = excluded.nombre;

insert into public.rotlinea_envases (material, descripcion, peso_kg, orden) values
  ('400733', 'ENVASE MARRON 330NR CERVEZAS', 0.195, 1),
  ('412644', 'ENVASE MARRON 330NR NUEVO', 0.21, 2),
  ('412671', 'ENVASE MARRON 330NR CLUB COLOMBIA', 0.232, 3),
  ('412707', 'ENVASE FLINT AGUILA 330NR NUEVO', 0.21, 4),
  ('421887', 'ENV REUSA NORTE FLINT 210 CORONA', 0.185, 5),
  ('3500005', 'Envase Costeñita 175R', 0.177, 6),
  ('3500162', 'Envase Marron 330R', 0.21, 7),
  ('3500207', 'BOTELLA MARRON 225R', 0.181, 8),
  ('3500213', 'Envase Flint 330R', 0.21, 9),
  ('3500232', 'Envase Green 330R', 0.21, 10),
  ('3500313', 'Envase Flint 225R', 0.181, 11),
  ('3500373', 'Envase Marron 750R', 0.44, 12),
  ('3500383', 'Envase Flint 750R', 0.44, 13),
  ('3500446', 'Envase Marron Club Col 330R', 0.232, 14),
  ('3500472', 'Envase Flint 175R', 0.1595, 15),
  ('3500887', 'BOTELLA FLINT 1000R', 0.62, 16),
  ('3500888', 'BOTELLA MARRON 1000CC', 0.62, 17),
  ('3501225', 'Botella Flint 250R', 0.165, 18),
  ('3501226', 'Botella Marron 250R', 0.185, 19),
  ('3501430', 'ENVASE COSTENA BACANA 320CC R', 0.320816, 20),
  ('3501539', 'BOTELLA MARRON 850 ML R', 0.62, 21)
on conflict (material) do update
  set descripcion = excluded.descripcion, peso_kg = excluded.peso_kg;

insert into public.rotlinea_skus (sku, descripcion, corto, envase, orden) values
  ('2160P', 'Aguila Lig R 330cc X 30', '2160', '3500213', 1),
  ('2182P', 'Pony Malta R 330cc X 30', '2182', '3500162', 2),
  ('2228P', 'Aguila EXP BNR 330cc X 30 USA', '2228', '412644', 3),
  ('2512P', 'Poker R 330cc X 30', '2512', '3500162', 4),
  ('2912P', 'Pony Malta EXP BNR 330cc X 30 USA', '2912', '412644', 5),
  ('3128P', 'Aguila R 330cc X 30', '3128', '3500162', 6),
  ('3617P', 'Costeñita R 175cc X 38', '3617', '3500005', 7),
  ('3751P', 'Club Col R 330cc X 30 N', '3751', '3500446', 8),
  ('9139P', 'Aguila Light R 250cc X 38', '9139', '3501225', 9),
  ('9150P', 'Poker R 250cc X 38', '9150', '3501226', 10),
  ('9480P', 'POKER BR 1000cc X 13', '9480', '3500888', 11),
  ('9482P', 'Aguila Lig BR 1000cc X 13', '9482', '3500887', 12),
  ('9494P', 'AGUILA BR 1000cc X 13', '9494', '3500888', 13),
  ('9798P', 'Club Col Tw 330cc X 30', '9798', '412671', 14),
  ('9845P', 'Aguila TW 330cc X 30', '9845', '412644', 15),
  ('9846P', 'Aguila Lig Tw 330cc X 30', '9846', '3500213', 16),
  ('11635P', 'Pony Malta EXP NR 330ccX30 CHILE', '11635', '412644', 17),
  ('13451P', 'COSTENA BACANA BR 320CCX30', '13451', '3501430', 18),
  ('14588P', 'CLUB COL 330CC X 30 EXP USA', '14588', '412671', 19),
  ('14779P', 'SAMIRA BR 330 X 30', '14779', '3500162', 20),
  ('20546P', 'AGUILA ORIGINAL RB 250CC X38', '20546', '3501226', 21),
  ('20867P', 'COSTEÑA RB 330CC X30', '20867', '3500162', 22),
  ('22272P', 'PONY MALTA GO RB 330CC X30', '22272', '3500162', 23),
  ('22613P', 'AGUILA LIGHT RB 330CC X30 THERMO', '22613', '3500213', 24),
  ('22615P', 'AGUILA LIGHT NRB TW 330CC X30', '22615', '412707', 25)
on conflict (sku) do update
  set descripcion = excluded.descripcion, envase = excluded.envase;


-- ---------------------------------------------------------------------
-- 8. DE KILOS A UNIDADES
--
-- SE REDONDEA HACIA ARRIBA, y no es un detalle de gusto: se comprobó
-- contra las 24.243 filas de 2026 del Excel. Con `round` a la mitad,
-- 13.190 de esas filas quedaban con una unidad de diferencia; con
-- `ceil`, las 24.243 cuadran exactas. Tiene sentido: media botella rota
-- es una botella que no se vende.
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_unidades(p_kg numeric, p_envase text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_peso numeric;
begin
  select peso_kg into v_peso from public.rotlinea_envases where material = p_envase;
  if v_peso is null then
    raise exception 'El envase % no está en el maestro', p_envase;
  end if;
  return ceil(coalesce(p_kg, 0) / v_peso)::integer;
end $$;

grant execute on function public.rotlinea_unidades(numeric, text) to authenticated;


-- ---------------------------------------------------------------------
-- 9. GUARDAR UNA PESADA
--
-- Se manda el turno COMPLETO: línea, turno, envase y los kilos de cada
-- máquina. No una máquina a la vez.
--
-- POR QUÉ COMPLETO. Quien llena esto está viendo una rejilla con las
-- quince máquinas del tren y la llena de arriba abajo. Si cada celda
-- fuera una llamada, un turno serían quince viajes a la base y la
-- pantalla podría quedar a medias — con siete máquinas guardadas y ocho
-- no, que es peor que no haber guardado nada. Así es una sola
-- transacción: entra todo o no entra nada.
--
-- POR DEFECTO AGREGA UNA PESADA, NO REEMPLAZA. Un turno se pesa más de
-- una vez: la línea para, vuelve a arrancar, y hay otra canastilla que
-- pesar. Guardar de nuevo NO borra lo anterior — suma una toma. Esa es
-- la diferencia entre este módulo y la hoja de la que salió: allá las
-- dos pesadas quedaban como dos renglones repetidos que nadie sabía si
-- eran un error o no.
--
-- PARA CORREGIR UNA PESADA se manda su número en p_toma: esa se borra y
-- se vuelve a escribir, y las otras no se tocan. Sin eso, arreglar un
-- 12 que era 21 obligaría a borrar el turno entero y volver a teclearlo.
--
-- UN CERO BORRA LA LÍNEA. "Etiquetadora, 0 kg" y la ausencia de esa
-- línea dicen lo mismo, y tener las dos formas obliga a todas las
-- consultas a acordarse de filtrar los ceros.
-- ---------------------------------------------------------------------
drop function if exists public.rotlinea_guardar(date, smallint, smallint, text, jsonb);
drop function if exists public.rotlinea_guardar(date, smallint, smallint, text, jsonb, smallint);

create function public.rotlinea_guardar(
  p_fecha  date,
  p_linea  smallint,
  p_turno  smallint,
  p_envase text,
  p_kilos  jsonb,            -- [{"maquina":1,"kg":28}, …]
  p_toma   smallint default null   -- null = una pesada nueva
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb; v_kg numeric; v_maq smallint; v_peso numeric; v_n integer := 0;
  v_toma smallint;
begin
  if not public.es_editor() then
    raise exception 'Registrar rotura de línea requiere rol de supervisor o administrador';
  end if;
  if p_fecha is null then raise exception 'Hay que decir de qué día'; end if;
  if p_turno not in (1, 2, 3) then
    raise exception 'El turno tiene que ser 1, 2 o 3';
  end if;
  if not exists (select 1 from public.rotlinea_lineas where linea = p_linea and activo) then
    raise exception 'La línea % no existe o está apagada', p_linea;
  end if;

  select peso_kg into v_peso from public.rotlinea_envases
   where material = p_envase and activo;
  if v_peso is null then
    raise exception 'El envase % no existe o está apagado', p_envase;
  end if;

  /* QUÉ PESADA ES. Sin p_toma, la siguiente. Con p_toma, se corrige esa
     y solo esa: se borra y se vuelve a escribir, y las otras pesadas
     del mismo turno se quedan como están. */
  if p_toma is null then
    select coalesce(max(toma), 0) + 1 into v_toma
      from public.rotlinea_registro
     where fecha = p_fecha and linea = p_linea and turno = p_turno and envase = p_envase;
  else
    v_toma := p_toma;
    if not exists (select 1 from public.rotlinea_registro
                    where fecha = p_fecha and linea = p_linea and turno = p_turno
                      and envase = p_envase and toma = v_toma) then
      raise exception 'Ese turno no tiene una pesada %. Para agregar una nueva, no mandes el número', v_toma;
    end if;
  end if;

  /* LO QUE YA SE DIO DE BAJA EN SAP NO SE TOCA. Eso ya salió del
     sistema: reescribirlo aquí dejaría los dos lados diciendo cosas
     distintas y nadie sabría cuál creer. Agregar una pesada nueva sí se
     puede: es rotura que pasó después. */
  if p_toma is not null and exists (
       select 1 from public.rotlinea_registro
        where fecha = p_fecha and linea = p_linea and turno = p_turno
          and envase = p_envase and toma = v_toma and baja) then
    raise exception 'Esa pesada ya está dada de baja en SAP. No se puede reescribir';
  end if;

  delete from public.rotlinea_registro
   where fecha = p_fecha and linea = p_linea and turno = p_turno
     and envase = p_envase and toma = v_toma;

  for r in select * from jsonb_array_elements(coalesce(p_kilos, '[]'::jsonb))
  loop
    v_maq := (r->>'maquina')::smallint;
    v_kg  := coalesce((r->>'kg')::numeric, 0);
    continue when v_kg <= 0;
    if not exists (select 1 from public.rotlinea_maquinas where item = v_maq and activo) then
      raise exception 'La máquina % no existe o está apagada', v_maq;
    end if;

    insert into public.rotlinea_registro
      (fecha, linea, turno, envase, maquina, toma, kg, und, registrado_por)
    values
      (p_fecha, p_linea, p_turno, p_envase, v_maq, v_toma, v_kg,
       ceil(v_kg / v_peso)::integer, auth.uid());
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

revoke all on function public.rotlinea_guardar(date, smallint, smallint, text, jsonb, smallint) from public;
grant execute on function public.rotlinea_guardar(date, smallint, smallint, text, jsonb, smallint) to authenticated;


-- ---------------------------------------------------------------------
-- 10. MARCAR LA BAJA
--
-- Cuando el material ya salió por SAP. Va por turno completo, que es
-- como se da de baja en la vida real.
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_marcar_baja(
  p_fecha date, p_linea smallint, p_turno smallint, p_envase text, p_baja boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.es_editor() then
    raise exception 'Marcar la baja requiere rol de supervisor o administrador';
  end if;
  update public.rotlinea_registro
     set baja = p_baja, baja_en = case when p_baja then now() else null end
   where fecha = p_fecha and linea = p_linea and turno = p_turno and envase = p_envase;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.rotlinea_marcar_baja(date, smallint, smallint, text, boolean) to authenticated;


-- =====================================================================
-- 11. LAS VISTAS
--
-- Todo lo que en el Excel eran tablas dinámicas —P-R, DASH, RESUMEN,
-- ROTURA DIARIA, Conciliación— son CUENTAS sobre estas dos tablas, no
-- datos que alguien tenga que mantener. Por eso son vistas: no se
-- pueden desactualizar.
-- =====================================================================

/* EL DETALLE, con los nombres puestos. Es la base de todo lo demás. */
create or replace view public.v_rotlinea as
select
  r.id, r.fecha, r.linea, l.tren, l.centro_coste,
  r.turno, r.envase, e.descripcion as envase_nombre, e.peso_kg,
  r.maquina, m.nombre as maquina_nombre, m.orden as maquina_orden, r.toma,
  r.kg, r.und, r.baja, r.baja_en,
  r.registrado_por, r.registrado_en,
  extract(year  from r.fecha)::int as anio,
  extract(month from r.fecha)::int as mes,
  extract(week  from r.fecha)::int as semana
from public.rotlinea_registro r
join public.rotlinea_lineas   l on l.linea    = r.linea
join public.rotlinea_envases  e on e.material = r.envase
join public.rotlinea_maquinas m on m.item     = r.maquina;

grant select on public.v_rotlinea to authenticated;


/* LA PRODUCCIÓN, ya traducida a ENVASE.
   El ZPREC viene por SKU de producto; la rotura se registra por envase.
   La traducción se hace UNA vez aquí y no en cada informe: si cada
   consulta hiciera su propio join, bastaría que una se olvidara para
   que dos informes del mismo día dieran cifras distintas. */
create or replace view public.v_rotlinea_produccion as
select p.fecha, p.linea, s.envase, sum(p.cantidad)::bigint as producidas,
       sum(p.hl) as hl, count(*)::int as ordenes
from public.rotlinea_produccion p
join public.rotlinea_skus s on s.sku = p.sku
group by p.fecha, p.linea, s.envase;

grant select on public.v_rotlinea_produccion to authenticated;


/* EL INDICADOR: rotura contra producción, por día, línea y envase.
   Es la hoja P-R.

   FULL JOIN, y es lo que hace útil la vista. Con un join normal se
   perdería justo lo que hay que mirar: el día que hubo rotura y NO hubo
   producción cargada —alguien no importó el ZPREC— y el día que hubo
   producción y nadie registró rotura. Los dos casos salen con su lado
   en cero y se ven de una. */
create or replace view public.v_rotlinea_indicador as
select
  coalesce(r.fecha, p.fecha)   as fecha,
  coalesce(r.linea, p.linea)   as linea,
  coalesce(r.envase, p.envase) as envase,
  e.descripcion                as envase_nombre,
  coalesce(r.rotas, 0)         as rotas,
  coalesce(r.kg, 0)            as kg,
  coalesce(p.producidas, 0)    as producidas,
  /* El porcentaje solo existe si hubo producción. Dividir por cero
     daría "infinito"; poner cero diría "no hubo rotura", que es
     mentira. Que quede NULO es lo único cierto: todavía no se sabe. */
  case when coalesce(p.producidas, 0) > 0
       then round(coalesce(r.rotas, 0)::numeric * 100 / p.producidas, 4)
  end as pct_rotura
from (
  select fecha, linea, envase, sum(und)::bigint as rotas, sum(kg) as kg
    from public.rotlinea_registro group by fecha, linea, envase
) r
full join public.v_rotlinea_produccion p
  on p.fecha = r.fecha and p.linea = r.linea and p.envase = r.envase
left join public.rotlinea_envases e
  on e.material = coalesce(r.envase, p.envase);

grant select on public.v_rotlinea_indicador to authenticated;


/* EL PARETO POR MÁQUINA. Es la pregunta que de verdad se hace con esto:
   ¿cuál máquina se está comiendo el envase? */
create or replace view public.v_rotlinea_maquina as
select r.fecha, r.linea, r.maquina, m.nombre as maquina_nombre, m.orden,
       sum(r.und)::bigint as rotas, sum(r.kg) as kg
from public.rotlinea_registro r
join public.rotlinea_maquinas m on m.item = r.maquina
group by r.fecha, r.linea, r.maquina, m.nombre, m.orden;

grant select on public.v_rotlinea_maquina to authenticated;


/* LO QUE FALTA POR DAR DE BAJA. La columna BAJA del Excel: 715 filas de
   2026 estaban en blanco y nadie lo sabía porque en una hoja de 24.000
   renglones eso no se ve. */
create or replace view public.v_rotlinea_sin_baja as
select fecha, linea, turno, envase, sum(und)::bigint as rotas, sum(kg) as kg,
       count(*)::int as maquinas, count(distinct toma)::int as pesadas,
       min(registrado_en) as desde
from public.rotlinea_registro
where not baja
group by fecha, linea, turno, envase;

grant select on public.v_rotlinea_sin_baja to authenticated;


-- ---------------------------------------------------------------------
-- 12. LA SEGURIDAD
--
-- Mismo criterio que el resto del proyecto: todos los que entraron
-- leen, solo editores escriben, y escribir de verdad pasa por las
-- funciones de arriba.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rotlinea_lineas','rotlinea_maquinas','rotlinea_envases',
                           'rotlinea_skus','rotlinea_registro','rotlinea_produccion']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated
                      using (public.es_editor()) with check (public.es_editor())',
                   t || '_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 13. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := ''; v_l int; v_m int; v_e int; v_s int;
begin
  if to_regclass('public.rotlinea_registro') is null then
    v_falta := v_falta || ' rotlinea_registro'; end if;
  if to_regclass('public.v_rotlinea_indicador') is null then
    v_falta := v_falta || ' v_rotlinea_indicador'; end if;
  if to_regprocedure('public.rotlinea_guardar(date, smallint, smallint, text, jsonb, smallint)') is null then
    v_falta := v_falta || ' rotlinea_guardar'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;

  select count(*) into v_l from public.rotlinea_lineas;
  select count(*) into v_m from public.rotlinea_maquinas;
  select count(*) into v_e from public.rotlinea_envases;
  select count(*) into v_s from public.rotlinea_skus;
  raise notice 'Rotura de línea lista. líneas: %, máquinas: %, envases: %, SKU: %',
               v_l, v_m, v_e, v_s;
end $$;
