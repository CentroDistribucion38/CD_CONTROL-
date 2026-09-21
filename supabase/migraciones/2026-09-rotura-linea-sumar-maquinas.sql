-- =====================================================================
-- ROTURA EN LÍNEA · DOS MÁQUINAS QUE SE SUMAN EN OTRA
--
-- «Cuando hagas la suma, PALE-DEPA y PASTEURIZADORA se sumen en uno solo
-- que sea PASTEURIZADORA; y CARGADOR + SALIDA DE LAVADORA, que sea la
-- suma de SALIDA DE LAVADORA.»
--
--     PALE-DEPA  (155)  ──se suma en──►  PASTEURIZADORA     (13)
--     CARGADOR    (66)  ──se suma en──►  SALIDA DE LAVADORA  (6)
--
-- ---------------------------------------------------------------------
-- SE JUNTA EN LA SUMA, NO EN EL REGISTRO.
--
-- Lo que el operador anotó en la rejilla sigue diciendo CARGADOR y
-- PALE-DEPA, fila por fila. Lo que cambia es cómo se agrupa al sumar:
-- el tablero por máquina ya no enseña esas dos barras, y sus unidades y
-- kilos aparecen dentro de PASTEURIZADORA y SALIDA DE LAVADORA.
--
-- La otra forma —reescribir los registros con el item de destino— era
-- una línea y se descartó: borra lo que de verdad se anotó y no tiene
-- vuelta. El día que la agrupación cambie, o que alguien pregunte
-- cuánto rompió el CARGADOR solo en marzo, el dato tiene que estar.
-- Aquí basta con poner `suma_en` en nulo y todo vuelve a separarse,
-- hacia atrás incluido.
--
-- VA COMO COLUMNA DEL MAESTRO Y NO COMO UN CASE DENTRO DE LA FUNCIÓN.
-- Un `case when maquina = 155 then 13` escondido en una consulta es una
-- regla que nadie ve y que la próxima consulta que sume por máquina se
-- olvida de copiar — y entonces dos pantallas del mismo mes dan dos
-- paretos distintos. En el maestro está a la vista y la leen todas.
--
-- UN SOLO SALTO. Una máquina que se suma en otra no puede recibir a
-- nadie, y la que recibe no puede sumarse en una tercera: con cadenas
-- (A→B→C) la suma de un solo nivel dejaría a A dentro de B mientras B
-- ya se fue a C, y el pareto enseñaría una B que no debería existir.
-- Lo impide un disparador, con un mensaje que dice qué hacer.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA COLUMNA
-- ---------------------------------------------------------------------
alter table public.rotlinea_maquinas
  add column if not exists suma_en smallint
  references public.rotlinea_maquinas(item) on update cascade on delete set null;

/* Sumarse en sí misma no hace nada útil y confunde a quien lo lea. */
do $bloque$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'rotlinea_maquinas_suma_en_no_ella') then
    alter table public.rotlinea_maquinas
      add constraint rotlinea_maquinas_suma_en_no_ella
      check (suma_en is null or suma_en <> item);
  end if;
end $bloque$;

comment on column public.rotlinea_maquinas.suma_en is
  'Al sumar por máquina, esta se cuenta dentro de la máquina indicada. '
  'No cambia el registro: solo cómo se agrupa. Un solo salto.';


-- ---------------------------------------------------------------------
-- 2. UN SOLO SALTO, y con un mensaje legible
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_maquinas_un_salto()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.suma_en is null then
    /* Esta deja de sumarse en otra: nada que revisar hacia adelante.
       Pero si OTRA se suma en esta, esta no puede irse a una tercera —
       eso ya lo cubre el caso de abajo al revés, así que aquí no hay
       nada más. */
    return new;
  end if;

  /* La de destino no puede, a su vez, sumarse en otra. */
  if exists (select 1 from public.rotlinea_maquinas
              where item = new.suma_en and suma_en is not null) then
    raise exception 'La máquina % ya se suma en otra; % no se puede sumar en ella. Súmala directamente en la de destino.',
      new.suma_en, new.item;
  end if;

  /* Y esta no puede recibir a nadie si se va a sumar en otra. */
  if exists (select 1 from public.rotlinea_maquinas
              where suma_en = new.item and item <> new.item) then
    raise exception 'Hay máquinas que se suman en %; esa no se puede sumar a su vez en %. Cambia primero las que apuntan a ella.',
      new.item, new.suma_en;
  end if;

  return new;
end
$fn$;

drop trigger if exists rotlinea_maquinas_un_salto on public.rotlinea_maquinas;
create trigger rotlinea_maquinas_un_salto
  before insert or update of suma_en on public.rotlinea_maquinas
  for each row execute function public.rotlinea_maquinas_un_salto();


-- ---------------------------------------------------------------------
-- 3. LAS DOS QUE PIDIÓ
--
-- Se busca por ITEM y no por nombre: el ITEM es el código con el que la
-- máquina se conoce en la planta (el CARGADOR es el 66, PALE-DEPA el
-- 155), y un nombre se corrige en el maestro sin avisar.
-- ---------------------------------------------------------------------
update public.rotlinea_maquinas set suma_en = 13 where item = 155;   -- PALE-DEPA → PASTEURIZADORA
update public.rotlinea_maquinas set suma_en = 6  where item = 66;    -- CARGADOR  → SALIDA DE LAVADORA


-- ---------------------------------------------------------------------
-- 4. EL TABLERO POR MÁQUINA, sumando en la de destino
--
-- Misma firma y mismas columnas que antes: la pantalla no se toca. Lo
-- único que cambia es por qué se agrupa — `coalesce(m.suma_en, item)` —
-- y que el nombre y el orden salen de la máquina de DESTINO, que es la
-- que se enseña.
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_tablero_maquina(
  p_desde date,
  p_hasta date,
  p_linea smallint default null
)
returns table (
  maquina smallint,
  maquina_nombre text,
  orden integer,
  rotas bigint,
  kg numeric
)
language sql
stable
set search_path = public
as $fn$
  select d.item, d.nombre, d.orden,
         sum(r.und)::bigint, sum(r.kg)
    from public.rotlinea_registro r
    join public.rotlinea_maquinas m on m.item = r.maquina
    join public.rotlinea_maquinas d on d.item = coalesce(m.suma_en, m.item)
   where r.fecha between p_desde and p_hasta
     and (p_linea is null or r.linea = p_linea)
   group by d.item, d.nombre, d.orden
$fn$;

grant execute on function public.rotlinea_tablero_maquina(date, date, smallint)
  to authenticated;


-- ---------------------------------------------------------------------
-- 5. Y LA VISTA DIARIA, con la misma regla
--
-- La pantalla ya no la lee —pasó a la función de arriba—, pero sigue
-- existiendo y cualquiera la puede consultar en el editor. Dejarla con
-- la regla vieja sería tener dos paretos del mismo día que no cuadran.
-- ---------------------------------------------------------------------
create or replace view public.v_rotlinea_maquina as
select r.fecha, r.linea,
       d.item   as maquina,
       d.nombre as maquina_nombre,
       d.orden,
       sum(r.und)::bigint as rotas, sum(r.kg) as kg
from public.rotlinea_registro r
join public.rotlinea_maquinas m on m.item = r.maquina
join public.rotlinea_maquinas d on d.item = coalesce(m.suma_en, m.item)
group by r.fecha, r.linea, d.item, d.nombre, d.orden;

grant select on public.v_rotlinea_maquina to authenticated;


-- ---------------------------------------------------------------------
-- 6. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $bloque$
declare v_falta text := '';
begin
  if (select suma_en from public.rotlinea_maquinas where item = 155) is distinct from 13 then
    v_falta := v_falta || ' · PALE-DEPA (155) no se suma en PASTEURIZADORA (13)'; end if;
  if (select suma_en from public.rotlinea_maquinas where item = 66) is distinct from 6 then
    v_falta := v_falta || ' · CARGADOR (66) no se suma en SALIDA DE LAVADORA (6)'; end if;
  if exists (select 1 from public.rotlinea_tablero_maquina('1900-01-01', '2999-12-31', null)
              where maquina in (66, 155)) then
    v_falta := v_falta || ' · el tablero sigue enseñando CARGADOR o PALE-DEPA aparte'; end if;

  if v_falta <> '' then
    raise exception 'NO QUEDÓ TODO. Falta:%', v_falta;
  end if;
  raise notice 'LISTO: PALE-DEPA se suma en PASTEURIZADORA y CARGADOR en SALIDA DE LAVADORA. Los registros no se tocaron.';
end $bloque$;
