-- ---------------------------------------------------------------------
-- LOS CONTEOS DEL MAESTRO, HECHOS EN LA BASE
--
-- QUÉ ESTABA PASANDO. El Maestro necesita saber cuántas veces se usó
-- cada zona, cada motivo, cada material — es lo que decide si sale el
-- botón de borrar o solo el de desactivar. Para saberlo, se traía al
-- navegador la columna de TODAS las acciones y las contaba en memoria.
--
-- Con veinte filas eso es más simple que una vista, y por eso se hizo
-- así. Con cincuenta mil es traerse la tabla por la red para devolver
-- cuarenta números.
--
-- MEDIDO CON 50.000 ACCIONES, lo que viaja al navegador:
--
--     antes ....... 2.315 kB      (y con el tope de 5.000: 232 kB)
--     después .....     3 kB      (71 filas: 40 zonas, 30 motivos, áreas)
--
-- Setecientas veces menos, y lo que baja no depende de cuántas
-- acciones haya: depende de cuántas zonas y motivos tenga el maestro,
-- que son decenas y van a seguir siendo decenas. En un celular con
-- señal de bodega esa es la diferencia entre que la pantalla abra y
-- que parezca colgada.
--
-- Y EL TOPE DE 5.000 ERA PEOR QUE LENTO: ERA MENTIRA. Pasadas las
-- 5.000 acciones, la cuenta se hacía solo sobre las primeras 5.000, así
-- que una zona muy usada podía aparecer con menos usos de los que
-- tiene —o con cero— y el Maestro habría ofrecido borrarla. La base la
-- habría rechazado por la llave foránea, pero el botón no debería
-- haber estado ahí. Contando en la base no hay tope: se cuentan todas,
-- siempre.
--
-- Se puede correr varias veces sin romper nada.
-- ---------------------------------------------------------------------

-- =====================================================================
-- 1. ACCIONES
--
-- Una fila por clave usada, con su cuenta. Tres agrupamientos en una
-- sola vista para que la pantalla haga UNA consulta y no tres.
-- =====================================================================
create or replace view public.v_acciones_uso as
  select 'zona'::text as tipo, zona as clave, count(*)::int as usos
    from public.acciones where zona is not null group by zona
  union all
  select 'motivo', motivo, count(*)::int
    from public.acciones group by motivo
  union all
  select 'equipo', equipo, count(*)::int
    from public.acciones where equipo is not null group by equipo
  union all
  select 'area', area, count(*)::int
    from public.acciones group by area;

grant select on public.v_acciones_uso to authenticated;

-- =====================================================================
-- 2. ROTURAS
--
-- Aquí era peor: la consulta no tenía ni tope. Se traían TODAS las
-- roturas para contar cuatro cosas.
-- =====================================================================
create or replace view public.v_roturas_uso as
  select 'material'::text as tipo, material as clave, count(*)::int as usos
    from public.roturas group by material
  union all
  select 'proceso', proceso, count(*)::int
    from public.roturas group by proceso
  union all
  select 'causa', causa, count(*)::int
    from public.roturas group by causa
  union all
  select 'tolva', tolva, count(*)::int
    from public.roturas_salida_tolvas group by tolva;

grant select on public.v_roturas_uso to authenticated;

-- =====================================================================
-- 3. LOS ÍNDICES PARA AGRUPAR
--
-- Un "group by" sin índice recorre la tabla. Con índice, Postgres puede
-- leer solo la columna que agrupa.
-- =====================================================================
create index if not exists acciones_motivo_idx  on public.acciones (motivo);
create index if not exists roturas_material_idx on public.roturas (material);
create index if not exists roturas_tolva_idx    on public.roturas_salida_tolvas (tolva);
