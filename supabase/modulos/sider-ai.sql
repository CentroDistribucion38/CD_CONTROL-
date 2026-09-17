-- =====================================================================
-- SIDER · REVISIÓN AI DEL ENVASE
-- ---------------------------------------------------------------------
-- QUÉ ES. A algunos camiones que llegan con envase retornable se les
-- hace una revisión de calidad: se toma una muestra, se cuentan las
-- botellas malas por tipo de defecto, y de ahí sale un ÍNDICE DE COBRO
-- que decide cuántas unidades NO se le abonan al socio. Es plata.
--
-- NO SE LE HACE A TODOS. Por eso el administrador marca en Tránsito a
-- cuáles, y solo esos piden el formulario al llegar.
--
-- REEMPLAZA A «Registro Cobro AI COL V02.xlsx». Al analizar las 296
-- filas de Barranquilla de ese archivo salieron dos cosas que este
-- módulo arregla, y conviene que queden escritas porque son la razón
-- de la mitad de las decisiones de abajo:
--
--   1. EL ÍNDICE SE DIGITABA, y no siempre con la misma regla. Se
--      probaron cinco fórmulas contra las 296 filas y ninguna acierta
--      siempre; la más parecida —defectos + mezclado— acierta 168. Y en
--      112 filas el índice era MENOR que defectos ÷ revisadas, cosa
--      imposible si sale de sumar categorías. Aquí el índice NO se
--      digita: lo calcula la vista, siempre igual, y siempre se puede
--      explicar de dónde salió.
--
--   2. LOS HECTOLITROS ESTABAN MAL. Para G175 —175 cc— el litraje por
--      botella debería ser siempre 0,175; en el archivo salían 64
--      valores distintos, hasta 0,3417. Fórmulas arrastradas mal. Aquí
--      el Hl sale del litraje del envase en el maestro, que se escribe
--      una vez.
--
-- LAS TRES FÓRMULAS QUE SÍ CUADRABAN se respetan tal cual —cuadran en
-- las 296 filas sin una sola excepción— y están marcadas abajo.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LOS MAESTROS
-- ---------------------------------------------------------------------

/* LOS TIPOS DE DEFECTO SON UNA TABLA, no catorce columnas.
   El Excel tenía una columna por defecto, y por eso agregar uno era
   tocar el archivo entero y todos los que ya existían. Aquí es una fila
   más en un maestro.

   Y «COBRA» ES UN DATO, no un if en el código. De los catorce, solo
   diez entran en el total que se cobra: mezclado, cuerpo extraño, cajas
   malas y estiba mala se cuentan —hay que saber que pasaron— pero no
   suben el índice. Eso se comprobó contra las 296 filas: la suma de
   esas diez da exactamente «TOTAL BOTELLAS CON DEFECTOS» en todas, sin
   excepción. El día que la política cambie, se cambia el campo y no se
   despliega nada. */
create table if not exists public.sider_ai_defectos (
  clave   text primary key,
  nombre  text not null,
  cobra   boolean not null default true,
  orden   smallint,
  activo  boolean not null default true
);

/* EL LITRAJE VIVE AQUÍ Y SE ESCRIBE UNA VEZ. Es lo que convierte
   botellas en hectolitros, y es justo lo que estaba mal en el Excel.
   El código del envase ya lleva la capacidad —G175 son 175 cc— así que
   la siembra la deduce del nombre; queda editable por si alguna no
   sigue la regla. */
create table if not exists public.sider_ai_envases (
  clave       text primary key,
  descripcion text,
  litros      numeric(8,4) not null check (litros > 0),
  orden       smallint,
  activo      boolean not null default true
);

create table if not exists public.sider_ai_socios (
  clave   text primary key,
  nombre  text not null,
  activo  boolean not null default true,
  orden   smallint
);

/* De dónde sale el envase: de un socio o de un traslado propio (T1). */
create table if not exists public.sider_ai_canales (
  clave   text primary key,
  nombre  text not null,
  activo  boolean not null default true,
  orden   smallint
);


-- ---------------------------------------------------------------------
-- 2. LA MARCA EN EL VIAJE
--
-- Vive en sider_viajes y no en una tabla aparte: es un atributo del
-- viaje —«a este le toca revisión»— y ponerlo aparte obligaría a un
-- join en la pantalla de Tránsito, que es donde se mira.
--
-- SE GUARDA QUIÉN Y CUÁNDO, porque esto cuesta plata y media hora de
-- muelle: el día que alguien pregunte por qué revisaron ese camión,
-- tiene que haber respuesta.
-- ---------------------------------------------------------------------
alter table public.sider_viajes add column if not exists requiere_ai   boolean not null default false;
alter table public.sider_viajes add column if not exists ai_pedido_por uuid references public.perfiles(id) on delete set null;
alter table public.sider_viajes add column if not exists ai_pedido_en  timestamptz;
alter table public.sider_viajes add column if not exists ai_motivo     text;

create index if not exists sider_viajes_ai_idx
  on public.sider_viajes (requiere_ai, estado) where requiere_ai;


-- ---------------------------------------------------------------------
-- 3. LA REVISIÓN
--
-- UNA POR VIAJE. No es una lista de revisiones: es la revisión de ese
-- camión. La llave única lo impone en la base y no en la pantalla.
-- ---------------------------------------------------------------------
create table if not exists public.sider_ai_revisiones (
  id        uuid primary key default gen_random_uuid(),
  viaje_id  uuid not null unique references public.sider_viajes(id) on delete cascade,

  /* LA CABECERA. Fecha, placa y planta se copian del viaje al guardar y
     no se piden: ya están, y volver a digitarlas es una oportunidad de
     equivocarse. Se GUARDAN aquí igual —no se leen del viaje cada vez—
     porque una revisión es un documento de cobro: si mañana alguien
     corrige la placa del viaje, lo que se le cobró al socio no cambia
     solo. */
  fecha     date not null,
  planta    text not null,
  placa     text not null,
  turno     text not null check (turno in ('T1','T2','T3')),

  canal     text not null references public.sider_ai_canales(clave),
  socio     text     references public.sider_ai_socios(clave),
  envase    text not null references public.sider_ai_envases(clave),

  /* Si el envase venía certificado por el socio. Cambia la conversación
     con él, no el cálculo. */
  certificado boolean not null default false,

  /* LAS DOS CIFRAS QUE MANDAN. Todo lo demás se deriva de ellas y de
     los conteos. */
  recibidas integer not null check (recibidas > 0),
  revisadas integer not null check (revisadas > 0),

  zcl3        text,
  comentarios text,

  /* EL ÍNDICE NO ESTÁ AQUÍ, y esa ausencia es la decisión más
     importante de este archivo. Se calcula en v_sider_ai a partir de
     los conteos. Guardarlo sería poder contradecirlo —una fila con
     índice 2 % y conteos que dan 0,8 %— y entonces habría que decidir
     cuál de los dos manda cuando el socio reclame. Calculado, esa
     pregunta no existe. */

  revisado_por uuid references public.perfiles(id) on delete set null,
  revisado_en  timestamptz not null default now(),
  editado_por  uuid references public.perfiles(id) on delete set null,
  editado_en   timestamptz,
  ediciones    integer not null default 0,

  /* La muestra no puede ser más grande que lo que llegó. */
  constraint sider_ai_muestra_valida check (revisadas <= recibidas)
);

create index if not exists sider_ai_rev_fecha_idx  on public.sider_ai_revisiones (fecha desc);
create index if not exists sider_ai_rev_socio_idx  on public.sider_ai_revisiones (socio, fecha desc);
create index if not exists sider_ai_rev_envase_idx on public.sider_ai_revisiones (envase, fecha desc);


-- ---------------------------------------------------------------------
-- 4. LOS CONTEOS
--
-- Una fila por defecto CON UNIDADES. Los que dieron cero no se guardan:
-- catorce filas por revisión, la mayoría en cero, es basura que hay que
-- filtrar en cada consulta. «No está» y «está en cero» significan lo
-- mismo aquí, y cuando dos cosas significan lo mismo se guarda una.
-- ---------------------------------------------------------------------
create table if not exists public.sider_ai_conteos (
  revision_id uuid not null references public.sider_ai_revisiones(id) on delete cascade,
  defecto     text not null references public.sider_ai_defectos(clave),
  unidades    integer not null check (unidades > 0),
  primary key (revision_id, defecto)
);


-- ---------------------------------------------------------------------
-- 5. LA SIEMBRA
-- ---------------------------------------------------------------------
insert into public.sider_ai_defectos (clave, nombre, cobra, orden) values
  ('rota',         'Rota o despicado',          true,   1),
  ('faltante',     'Faltante',                  true,   2),
  ('cemento',      'Cemento o pintura',         true,   3),
  ('no_retorn',    'No retornable',             true,   4),
  ('otras_cias',   'Otras compañías',           true,   5),
  ('antiguo',      'Antiguo formato',           true,   6),
  ('extrasucio',   'Extrasucio / no recuperable', true, 7),
  ('cristalizado', 'Cristalizado / meteorizada', true,  8),
  /* HONGO Y ETIQUETA ASOLEADA NO COBRAN, Y MEZCLADO SÍ. Estas tres
     banderas estuvieron al revés y no era un detalle: el índice
     multiplica las botellas recibidas para sacar el no-abono, que es la
     cifra que viaja a SAP. Sobre las 296 revisiones de «BD AI BAQ» eran
     3.600 botellas cobradas de más a los socios, un 4,5 %.

     El error salió de seguir la columna equivocada del Excel. La hoja
     tiene DOS sumas de defectos que no son la misma:
        T  «TOTAL BOTELLAS CON DEFECTOS» = SUM(U:AD) — 10 categorías,
           con hongo y etiqueta asoleada, sin mezclado;
        M  «% ÍNDICE DE COBRO» = (U+V+W+X+Y+Z+AA+AB+AE)/S — 9, con
           mezclado, sin hongo ni etiqueta asoleada.
     La que cobra es M, idéntica en las 296 filas. Yo seguí T. */
  ('hongo',        'Hongo',                     false,  9),
  ('etiq_asoleada','Etiqueta asoleada',         false, 10),
  ('mezclado',     'Mezclado',                  true,  11),
  /* Los tres que se cuentan y no cobran. */
  ('cuerpo_extra', 'Cuerpo extraño',            false, 12),
  ('cajas_malas',  'Cajas malas',               false, 13),
  ('estiba_mala',  'Estiba mala',               false, 14)
on conflict (clave) do update
  set nombre = excluded.nombre, orden = excluded.orden;
/* `cobra` NO se pisa en el update: si alguien cambia la política desde
   el maestro, correr otra vez este archivo no debe deshacérselo. */

insert into public.sider_ai_canales (clave, nombre, orden) values
  ('socios', 'Socios', 1),
  ('t1',     'T1',     2)
on conflict (clave) do update set nombre = excluded.nombre;

/* EL LITRAJE SALE DEL CÓDIGO: G175 son 175 cc, M1000 son 1000. Es la
   regla que siguen los dieciocho códigos de la hoja «Datos», y
   deducirla es mejor que teclear dieciocho números a mano —donde uno
   se cuela sin que nadie lo note—. Queda editable por si alguna no la
   sigue. */
insert into public.sider_ai_envases (clave, descripcion, litros, orden)
select c.clave,
       c.descripcion,
       (regexp_replace(c.clave, '\D', '', 'g'))::numeric / 1000,
       row_number() over (order by c.clave)
from (values
  ('CB320','Costeña Bacana 320 R'), ('CC330','Cristal 330'),
  ('CC850','Cristal 850'),          ('CR210','Coronita 210 R'),
  ('CR330','Coronita 330 R'),       ('G175','Costeñita 175 R'),
  ('G320','Green 320'),             ('F175','Flint 175 R'),
  ('F250','Flint 250 R'),           ('F330','Flint 330 R'),
  ('F750','Flint 750 R'),           ('F1000','Flint 1000 R'),
  ('M225','Marrón 225 R'),          ('M250','Marrón 250 R'),
  ('M330','Marrón 330 R'),          ('M750','Marrón 750 R'),
  ('M850','Marrón 850 R'),          ('M1000','Marrón 1000 R')
) as c(clave, descripcion)
on conflict (clave) do update set descripcion = excluded.descripcion;

/* LOS SOCIOS salen de la hoja «Datos» del mismo archivo. La clave se
   deriva del nombre porque el Excel no tenía código: se normaliza
   —minúsculas, sin tildes, sin puntuación— para que «Logisinú S.A.S
   Zomac» y «Logisinu S.A.S Zomac» —que en el archivo son dos socios
   distintos con 149 y 17 filas— caigan en la misma clave. Ese solo
   detalle ya arregla un informe que venía partido en dos. */
insert into public.sider_ai_socios (clave, nombre, orden)
select lower(regexp_replace(
         translate(s.nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'),
         '[^a-zA-Z0-9]+', '_', 'g')),
       s.nombre,
       row_number() over (order by s.nombre)
from (values
  ('Almar'),('Alvarado Garcia & Cia Ltda'),('Autosur'),('Bebidas De La Costa S.A.S'),
  ('Camacho Y Sanchez'),('Cardenas Betava Ltda.'),('Carocasbel'),('Cd Bodega Ext Pt Buca'),
  ('Cervellano'),('Cervesur'),('Cervezas Del Mar'),('Cervezas Del Pacifico Sas'),
  ('Cervezas Y Refrescos'),('Cervylicores Distribuciones Sas'),('Changuani'),('Chiquinquira'),
  ('Comercializadora Central Ltda.'),('Consulrosy'),('Coy Camargo Ltda.'),('Coy Salamanca Ltda'),
  ('Cubara'),('Dist Chaira Ltda'),('Distribuciones C Y R S.A.S'),('Distribuciones El Oasis Mc Ltda'),
  ('Distribuciones Felix Pabon Eu'),('Distribucion El Poblado'),('Distribuidora Cervezas Del Sur'),
  ('Distribuidora El Oasis'),('Distribuidora La Bendicion Fb Sas'),('Distribuidora La Paruma Ltda'),
  ('Distribuidora Villa Amazonica Ltda'),('Distrirefrescos Pacheco Y Capach'),('Disvilla'),
  ('Felix Pabon'),('Girardot'),('Habitat S.A.S'),('Ibague'),('Jj Ltda'),('Joaquin Ureña'),
  ('La Arenosa'),('Licoexpress'),('Logisinu S.A.S Zomac'),('Los Gavilanes Y Cia Ltda.'),
  ('Malaver Vargas, Angie Lizeth'),('Maripi'),('Miomi S.A.S'),('Montevideo'),('Negocios Core'),
  ('Neiva'),('Pe&Lu Sas'),('Plateña G&G Ltda'),('Prezole'),('Quiral D'),('Sibate'),('Siberia'),
  ('Tolisur'),('Torres Y Peña Ltda'),('Transp La Paz'),('Transportes Districemg Sas'),
  ('Uruena Orjuela, Joaquin'),('Villavicencio'),('Zipaquira'),('Zoman')
) as s(nombre)
on conflict (clave) do nothing;


-- ---------------------------------------------------------------------
-- 6. LA VISTA QUE CALCULA
--
-- AQUÍ VIVEN LAS CUENTAS, no en la pantalla ni en la tabla. Una sola
-- definición: el formulario, el tablero, el PDF y el informe del socio
-- leen de aquí y por construcción dicen lo mismo. En el Excel cada
-- pestaña tenía su propia fórmula y por eso no cuadraban entre sí.
--
-- LAS TRES QUE SE RESPETAN TAL CUAL —cuadran en las 296 filas del
-- archivo sin una sola excepción—:
--     defectos  = suma de las categorías que cobran
--     no_abono  = round(recibidas × índice)
--     abono_sap = recibidas − no_abono
--
-- Y LA QUE SE ARREGLA:
--     indice    = defectos ÷ revisadas
-- En el Excel se digitaba, y en 112 de 296 filas daba MENOS que esa
-- división —imposible si sale de sumar categorías—. Aquí sale de los
-- conteos y no se puede contradecir.
-- ---------------------------------------------------------------------
create or replace view public.v_sider_ai as
select
  r.id, r.viaje_id, r.fecha, r.planta, r.placa, r.turno,
  r.canal,  c.nombre  as canal_nombre,
  r.socio,  s.nombre  as socio_nombre,
  r.envase, e.descripcion as envase_nombre, e.litros,
  r.certificado, r.recibidas, r.revisadas, r.zcl3, r.comentarios,
  r.revisado_por, r.revisado_en, r.editado_por, r.editado_en, r.ediciones,

  coalesce(t.defectos, 0)::integer  as defectos,
  coalesce(t.otros,    0)::integer  as otros,
  coalesce(t.total,    0)::integer  as marcadas,

  /* EL ÍNDICE, redondeado a seis decimales. No es cosmética: sin
     redondear, dos revisiones idénticas guardadas en momentos distintos
     pueden diferir en el bit dieciséis y mostrar índices distintos en
     pantalla. Seis decimales sobran para un porcentaje y quitan el
     problema. */
  round(coalesce(t.defectos, 0)::numeric / r.revisadas, 6) as indice,

  /* Las unidades que NO se le abonan al socio. Es el número que viaja
     a SAP, así que se redondea a entero aquí y no en la pantalla:
     redondear en pantalla haría que el PDF y la orden pudieran diferir
     en una unidad. */
  round(r.recibidas * coalesce(t.defectos, 0)::numeric / r.revisadas)::integer as no_abono,
  r.recibidas
    - round(r.recibidas * coalesce(t.defectos, 0)::numeric / r.revisadas)::integer as abono_sap,

  /* EN HECTOLITROS, con el litraje del maestro. Es lo que estaba mal en
     el Excel: 64 litrajes distintos para el mismo envase de 175 cc. */
  round(coalesce(t.defectos, 0) * e.litros / 100, 4) as hl_defectos
from public.sider_ai_revisiones r
join public.sider_ai_envases  e on e.clave = r.envase
join public.sider_ai_canales  c on c.clave = r.canal
left join public.sider_ai_socios s on s.clave = r.socio
left join (
  select k.revision_id,
         sum(k.unidades) filter (where d.cobra)     as defectos,
         sum(k.unidades) filter (where not d.cobra) as otros,
         sum(k.unidades)                            as total
    from public.sider_ai_conteos k
    join public.sider_ai_defectos d on d.clave = k.defecto
   group by k.revision_id
) t on t.revision_id = r.id;

grant select on public.v_sider_ai to authenticated;


/* EL DETALLE, defecto por defecto y ya con su porcentaje y su Hl.
   Son las tres columnas que el Excel repetía catorce veces —conteo, %,
   Hl— y que aquí salen de una sola fila. */
create or replace view public.v_sider_ai_detalle as
select
  k.revision_id, k.defecto, d.nombre as defecto_nombre, d.cobra, d.orden,
  k.unidades,
  round(k.unidades::numeric / r.revisadas, 6)        as pct,
  round(k.unidades * e.litros / 100, 4)              as hl
from public.sider_ai_conteos k
join public.sider_ai_defectos d on d.clave = k.defecto
join public.sider_ai_revisiones r on r.id = k.revision_id
join public.sider_ai_envases e on e.clave = r.envase;

grant select on public.v_sider_ai_detalle to authenticated;


/* LOS QUE ESTÁN ESPERANDO REVISIÓN.
   El viaje se marcó, ya llegó, y nadie ha llenado el formulario. Es la
   lista de trabajo del módulo: sin ella, un camión marcado que nadie
   revisó no aparece en ningún lado y el cobro se pierde. */
create or replace view public.v_sider_ai_pendientes as
select
  v.id as viaje_id, v.placa, v.planta, v.sku, v.estibas,
  coalesce(v.fecha, v.creado_en::date) as fecha,
  v.ai_pedido_en, v.ai_pedido_por, v.ai_motivo,
  p.nombre as pedido_nombre,
  (select max(c.hecha_en) from public.sider_certificaciones c
    where c.viaje_id = v.id and c.punta = 'llegada') as llego_en
from public.sider_viajes v
left join public.perfiles p on p.id = v.ai_pedido_por
where v.requiere_ai
  and not exists (select 1 from public.sider_ai_revisiones r where r.viaje_id = v.id);

grant select on public.v_sider_ai_pendientes to authenticated;


-- ---------------------------------------------------------------------
-- 7. MARCAR UN VIAJE PARA REVISIÓN
--
-- SOLO EL ADMINISTRADOR. Pedir una revisión AI para un camión cuesta
-- media hora de muelle y termina en un cobro al socio: no es una
-- casilla que deba poder marcar cualquiera que entre a Tránsito.
--
-- El `coalesce` NO es adorno: mi_rol() devuelve NULL para quien no
-- tiene perfil, y `null <> 'admin'` no es cierto NI falso —es NULL—, o
-- sea que el `if` no entra y la función seguiría de largo. Es el mismo
-- hueco que ya apareció en este proyecto con las firmas de rotura, y se
-- cierra igual.
-- ---------------------------------------------------------------------
create or replace function public.sider_ai_marcar(
  p_viaje  uuid,
  p_marcar boolean,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text;
begin
  if coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Pedir una revisión AI es solo del administrador';
  end if;

  select estado::text into v_estado from public.sider_viajes where id = p_viaje;
  if v_estado is null then
    raise exception 'Ese viaje no existe';
  end if;

  /* QUITAR LA MARCA CUANDO YA HAY REVISIÓN SERÍA BORRAR EL COBRO sin
     que quede rastro: la revisión seguiría en la tabla y el viaje
     diría que nunca le tocaba. Si de verdad hay que deshacerlo, se
     borra la revisión primero y eso es una decisión aparte. */
  if not p_marcar and exists (
       select 1 from public.sider_ai_revisiones where viaje_id = p_viaje) then
    raise exception 'Ese viaje ya tiene la revisión AI hecha. Primero hay que anular la revisión';
  end if;

  update public.sider_viajes
     set requiere_ai   = p_marcar,
         ai_pedido_por = case when p_marcar then auth.uid() end,
         ai_pedido_en  = case when p_marcar then now() end,
         ai_motivo     = case when p_marcar then nullif(btrim(coalesce(p_motivo, '')), '') end
   where id = p_viaje;
end $$;

grant execute on function public.sider_ai_marcar(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- 8. GUARDAR LA REVISIÓN
--
-- TODO EN UNA SOLA LLAMADA: cabecera y conteos. Guardar la cabecera por
-- un lado y los conteos por otro dejaría, si algo falla en el medio,
-- una revisión con recibidas y revisadas pero sin defectos — o sea un
-- índice de cero, que es exactamente el error que le cuesta plata a
-- alguien. Una función, una transacción, o entra todo o no entra nada.
--
-- LA CABECERA SE COMPLETA DEL VIAJE. Fecha, placa y planta no se piden:
-- ya están, y volver a digitarlas es una oportunidad de equivocarse.
-- ---------------------------------------------------------------------
create or replace function public.sider_ai_guardar(
  p_viaje       uuid,
  p_turno       text,
  p_canal       text,
  p_socio       text,
  p_envase      text,
  p_certificado boolean,
  p_recibidas   integer,
  p_revisadas   integer,
  p_conteos     jsonb,            -- {"rota": 4, "faltante": 0, ...}
  p_zcl3        text default null,
  p_comentarios text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_fecha date; v_placa text; v_planta text;
  v_requiere boolean; v_llego boolean;
  v_clave text; v_n integer; v_suma integer := 0;
begin
  if not public.es_editor() then
    raise exception 'Registrar una revisión AI requiere rol de supervisor o administrador';
  end if;

  select coalesce(v.fecha, v.creado_en::date), v.placa, v.planta, v.requiere_ai,
         exists (select 1 from public.sider_certificaciones c
                  where c.viaje_id = v.id and c.punta = 'llegada')
    into v_fecha, v_placa, v_planta, v_requiere, v_llego
    from public.sider_viajes v where v.id = p_viaje;

  if v_fecha is null then raise exception 'Ese viaje no existe'; end if;
  if not v_requiere then
    raise exception 'Ese viaje no está marcado para revisión AI. Un administrador tiene que pedirla primero';
  end if;
  /* LA REVISIÓN ES DE LO QUE LLEGÓ. Sin certificar la llegada no hay
     camión que revisar, y permitirlo dejaría revisiones de envase que
     todavía viene en la vía. */
  if not v_llego then
    raise exception 'Todavía no está certificada la llegada de ese viaje';
  end if;

  if upper(btrim(coalesce(p_turno, ''))) not in ('T1','T2','T3') then
    raise exception 'El turno tiene que ser T1, T2 o T3';
  end if;
  if coalesce(p_recibidas, 0) <= 0 then
    raise exception 'Hay que decir cuántas botellas llegaron de la referencia a revisar';
  end if;
  if coalesce(p_revisadas, 0) <= 0 then
    raise exception 'Hay que decir cuántas botellas se revisaron';
  end if;
  if p_revisadas > p_recibidas then
    raise exception 'Se revisaron % botellas de % que llegaron: la muestra no puede ser mayor que lo recibido',
      p_revisadas, p_recibidas;
  end if;

  if not exists (select 1 from public.sider_ai_envases where clave = p_envase and activo) then
    raise exception 'Ese tipo de envase no existe o está apagado';
  end if;
  if not exists (select 1 from public.sider_ai_canales where clave = p_canal and activo) then
    raise exception 'Ese canal de envase no existe o está apagado';
  end if;
  /* EL SOCIO ES OBLIGATORIO CUANDO EL CANAL ES «SOCIOS» y estorba
     cuando es un traslado propio. La regla va aquí y no en la pantalla:
     una revisión de socio sin socio no se le puede cobrar a nadie. */
  if p_canal = 'socios' and nullif(btrim(coalesce(p_socio, '')), '') is null then
    raise exception 'Una revisión del canal Socios tiene que decir de qué socio es';
  end if;
  if p_socio is not null and not exists (
       select 1 from public.sider_ai_socios where clave = p_socio and activo) then
    raise exception 'Ese socio no existe o está apagado';
  end if;

  /* LOS CONTEOS SE VALIDAN ANTES DE ESCRIBIR NADA. Si el quinto defecto
     trae un nombre que no existe, no puede quedar una revisión a medias
     con los cuatro primeros metidos. */
  for v_clave, v_n in select k.key, (k.value)::text::integer
                        from jsonb_each(coalesce(p_conteos, '{}'::jsonb)) k
  loop
    if not exists (select 1 from public.sider_ai_defectos where clave = v_clave and activo) then
      raise exception 'El defecto «%» no existe en el maestro', v_clave;
    end if;
    if v_n < 0 then
      raise exception 'El defecto «%» no puede venir en negativo', v_clave;
    end if;
    v_suma := v_suma + v_n;
  end loop;

  /* NO SE PUEDEN MARCAR MÁS BOTELLAS MALAS QUE LAS REVISADAS. Suena
     obvio y es justo el error que nadie ve en una hoja de cálculo: un
     índice mayor que 100 % le cobra al socio más de lo que mandó. */
  if v_suma > p_revisadas then
    raise exception 'Se marcaron % botellas con defecto de % revisadas', v_suma, p_revisadas;
  end if;

  insert into public.sider_ai_revisiones as r
    (viaje_id, fecha, planta, placa, turno, canal, socio, envase, certificado,
     recibidas, revisadas, zcl3, comentarios, revisado_por)
  values
    (p_viaje, v_fecha, v_planta, v_placa, upper(btrim(p_turno)),
     p_canal, nullif(btrim(coalesce(p_socio, '')), ''), p_envase,
     coalesce(p_certificado, false),
     p_recibidas, p_revisadas,
     nullif(btrim(coalesce(p_zcl3, '')), ''),
     nullif(btrim(coalesce(p_comentarios, '')), ''),
     auth.uid())
  on conflict (viaje_id) do update set
     turno = excluded.turno, canal = excluded.canal, socio = excluded.socio,
     envase = excluded.envase, certificado = excluded.certificado,
     recibidas = excluded.recibidas, revisadas = excluded.revisadas,
     zcl3 = excluded.zcl3, comentarios = excluded.comentarios,
     /* CORREGIR DEJA RASTRO. Una revisión que se reescribe sin decirlo
        es un cobro que cambió y nadie sabe cuándo ni quién. */
     editado_por = auth.uid(), editado_en = now(), ediciones = r.ediciones + 1
  returning r.id into v_id;

  /* Se reemplazan los conteos enteros: es la misma revisión corregida,
     no una segunda. Y los ceros no se guardan —«no está» y «está en
     cero» quieren decir lo mismo—. */
  delete from public.sider_ai_conteos where revision_id = v_id;
  insert into public.sider_ai_conteos (revision_id, defecto, unidades)
  select v_id, k.key, (k.value)::text::integer
    from jsonb_each(coalesce(p_conteos, '{}'::jsonb)) k
   where (k.value)::text::integer > 0;

  return v_id;
end $$;

grant execute on function public.sider_ai_guardar(
  uuid, text, text, text, text, boolean, integer, integer, jsonb, text, text
) to authenticated;


-- ---------------------------------------------------------------------
-- 9. LA SEGURIDAD
-- ---------------------------------------------------------------------
alter table public.sider_ai_revisiones enable row level security;
alter table public.sider_ai_conteos    enable row level security;
alter table public.sider_ai_defectos   enable row level security;
alter table public.sider_ai_envases    enable row level security;
alter table public.sider_ai_socios     enable row level security;
alter table public.sider_ai_canales    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sider_ai_revisiones','sider_ai_conteos','sider_ai_defectos',
                           'sider_ai_envases','sider_ai_socios','sider_ai_canales']
  loop
    execute format('drop policy if exists %I_ver on public.%I', t, t);
    execute format('create policy %I_ver on public.%I for select to authenticated using (true)', t, t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

/* SIN POLÍTICA DE ESCRITURA en revisiones ni conteos, a propósito: la
   única forma de que entre o salga una revisión es por sider_ai_guardar,
   que es security definer y valida. Así un índice de cobro no se puede
   fabricar desde el navegador, que es lo único que le da valor a un
   documento de cobro.

   Los maestros sí se escriben desde la pantalla de maestros, y para eso
   se les da permiso al editor. */
do $$
declare t text;
begin
  foreach t in array array['sider_ai_defectos','sider_ai_envases','sider_ai_socios','sider_ai_canales']
  loop
    execute format('drop policy if exists %I_editar on public.%I', t, t);
    execute format($p$create policy %I_editar on public.%I for all to authenticated
                     using (public.es_editor()) with check (public.es_editor())$p$, t, t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 10. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := ''; v_d int; v_e int; v_s int;
begin
  if to_regclass('public.sider_ai_revisiones') is null then v_falta := v_falta || ' sider_ai_revisiones'; end if;
  if to_regclass('public.sider_ai_conteos')    is null then v_falta := v_falta || ' sider_ai_conteos'; end if;
  if to_regclass('public.v_sider_ai')          is null then v_falta := v_falta || ' v_sider_ai'; end if;
  if to_regclass('public.v_sider_ai_pendientes') is null then v_falta := v_falta || ' v_sider_ai_pendientes'; end if;
  if to_regprocedure('public.sider_ai_marcar(uuid, boolean, text)') is null then
    v_falta := v_falta || ' sider_ai_marcar'; end if;
  if to_regprocedure('public.sider_ai_guardar(uuid, text, text, text, text, boolean, integer, integer, jsonb, text, text)') is null then
    v_falta := v_falta || ' sider_ai_guardar'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;

  select count(*) into v_d from public.sider_ai_defectos;
  select count(*) into v_e from public.sider_ai_envases;
  select count(*) into v_s from public.sider_ai_socios;
  raise notice 'Listo: % defectos (% cobran), % envases, % socios.',
    v_d, (select count(*) from public.sider_ai_defectos where cobra), v_e, v_s;
end $$;
