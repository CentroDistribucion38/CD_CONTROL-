-- =====================================================================
-- ROTURAS EN SITIO · UN SOLO MAESTRO, Y QUIÉN LA REPORTÓ
-- ---------------------------------------------------------------------
-- TRES COSAS QUE VAN JUNTAS PORQUE SE TOCAN EN LA MISMA PANTALLA:
--
--   1. EL DESPLEGABLE SALE DEL MAESTRO DE INVENTARIO. «Tenemos un
--      maestro de producto y envase; esa data la necesito también para
--      el desplegable de Quiebra en sitio: si dice producto terminado
--      debe salir producto terminado, y si dice EER debe salir el
--      envase.»
--   2. LA PRIMERA PREGUNTA ES DE DÓNDE SALE LA ROTURA: la reportó un
--      OPM, o alguien la encontró.
--   3. EL PIN DEL OPM, que es lo que convierte «alguien dijo» en un
--      nombre, un turno y una hora.
--
-- =====================================================================
-- 1. EL MAESTRO DE INVENTARIO YA SABE CUÁL ES CUÁL
-- =====================================================================
-- `productos.tipo_material` ya es 'PRODUCTO' o 'ENVASE' —494 y 32—, que
-- es exactamente la distinción que se pidió. No hay que inventar nada:
-- hay que darle las dos columnas que el maestro viejo de roturas tenía
-- y este no.
--
-- POR QUÉ NO SE DEJAN LOS DOS MAESTROS. Un material que existe en dos
-- tablas se edita en una y se queda viejo en la otra. Hoy el desplegable
-- de roturas ofrece SIETE materiales sembrados a mano, mientras el
-- inventario tiene 494: quien registra una rotura de un producto que no
-- está en esos siete, la registra con otro.
--
-- LAS DOS COLUMNAS QUE FALTAN, Y POR QUÉ NO SON UN CAPRICHO DE ROTURAS:
--
--   color_vidrio      de qué color es el vidrio del envase. Solo lo
--                     necesitan los 32 ENVASES. Sin él, el análisis de
--                     salida por color deja de cuadrar: el color no
--                     está en la salida, está en el material.
--   unidades_x_caja   cuántas botellas trae una caja. Es lo que
--                     convierte «12 cajas» en «360 unidades», y hoy el
--                     `factor_estibado` NO sirve para eso: ese dice
--                     cuántas cajas caben en una estiba.
--
-- Las dos son atributos del producto, no de roturas: cualquiera que
-- mire el maestro esperaría encontrarlas ahí.
-- =====================================================================
begin;

alter table public.productos
  add column if not exists color_vidrio    text,
  add column if not exists unidades_x_caja integer;

alter table public.productos drop constraint if exists productos_color_vidrio_chk;
alter table public.productos add constraint productos_color_vidrio_chk
  check (color_vidrio is null or color_vidrio in ('ambar', 'flint', 'green'));

alter table public.productos drop constraint if exists productos_unidades_caja_chk;
alter table public.productos add constraint productos_unidades_caja_chk
  check (unidades_x_caja is null or unidades_x_caja > 0);

/* LO QUE YA ESTABA EN EL MAESTRO VIEJO SE COPIA, emparejando por el
   nombre. No se adivina nada más: los 462 productos que no salían en el
   desplegable de roturas quedan sin color y sin unidades por caja, que
   es la verdad —nadie los ha llenado— y la pantalla lo va a decir en vez
   de inventarse un número. */
do $$
declare n int;
begin
  if to_regclass('public.roturas_materiales') is null then return; end if;
  update public.productos p
     set color_vidrio    = coalesce(p.color_vidrio, m.color::text),
         unidades_x_caja = coalesce(p.unidades_x_caja, m.botellas_x_empaque)
    from public.roturas_materiales m
   where upper(btrim(p.nombre)) = upper(btrim(m.nombre))
     and (m.color is not null or m.botellas_x_empaque is not null);
  get diagnostics n = row_count;
  raise notice 'Productos que heredaron color o unidades por caja del maestro viejo: %', n;
end $$;

/* LO QUE EL DESPLEGABLE VA A LEER. Una vista y no una consulta suelta:
   la pantalla de registrar y la de análisis tienen que ver lo mismo, y
   dos consultas parecidas se separan.

   SOLO LO ACTIVO, y ordenado por nombre: es una lista para escoger con
   el dedo, no un informe. */
create or replace view public.v_roturas_materiales_maestro as
  select p.sku                      as clave,
         p.nombre,
         case when p.tipo_material = 'ENVASE' then 'eer' else 'producto_terminado' end as tipo,
         p.color_vidrio             as color,
         p.unidades_x_caja          as botellas_x_empaque,
         p.familia,
         /* LO QUE LE FALTA PARA PODER USARSE BIEN. La pantalla lo dice
            en vez de callarse: un envase sin color acaba en un análisis
            por color que no cuadra, y un producto sin unidades por caja
            obliga a teclear las unidades a mano. */
         (p.tipo_material = 'ENVASE' and p.color_vidrio is null)    as le_falta_color,
         (p.tipo_material = 'PRODUCTO' and p.unidades_x_caja is null) as le_falta_caja
    from public.productos p
   where p.activo;
grant select on public.v_roturas_materiales_maestro to authenticated;

-- =====================================================================
-- 2. EL MAESTRO DE OPERARIOS, Y SU PIN
-- =====================================================================
-- «Colocaré el PIN a cada OPM, que ese será como la clave para que en el
--  informe oculto tengamos hora, turno, fecha, nombre del operador. Que
--  a ellos no les aparezca, porque nos sirve para validar lo que están
--  registrando.»
--
-- NO SON USUARIOS DE LA APP. No entran a CONTROL, no tienen pantalla, no
-- tienen clave: se identifican con cuatro dígitos delante de quien está
-- registrando. Meterlos como usuarios sería crear cien cuentas que nadie
-- va a usar y cien claves que alguien va a tener que reponer.
--
-- ---------------------------------------------------------------------
-- EL PIN SE GUARDA TAL CUAL, Y ESO ES UNA DECISIÓN, NO UN DESCUIDO
-- ---------------------------------------------------------------------
-- Lo primero que uno piensa es cifrarlo. CON CUATRO DÍGITOS NO SIRVE DE
-- NADA: son diez mil combinaciones, y quien tenga el volcado las prueba
-- todas en un segundo. El cifrado daría una sensación de seguridad que
-- no existe y, de paso, impediría que el administrador vea el PIN para
-- decírselo al operario que lo olvidó.
--
-- LO QUE SÍ PROTEGE ES NO ENSEÑARLO: la tabla NO se le da a la
-- aplicación. Quien registra manda el PIN a una función y le vuelve el
-- NOMBRE; el PIN no viaja de vuelta ni aparece en ninguna pantalla que
-- no sea el maestro, que es de quien manda.
--
-- Y ESTO NO ES UNA CONTRASEÑA: es un código de operación, como el número
-- de un carné. No abre nada, no autoriza nada — solo deja escrito quién
-- dijo qué, que es justo para lo que se pidió.
-- =====================================================================
create table if not exists public.roturas_operarios (
  id        uuid primary key default gen_random_uuid(),
  /* CUATRO DÍGITOS, y único. El índice lo obliga: dos operarios con el
     mismo PIN convierten el informe en algo que no prueba nada. */
  pin       text not null unique check (pin ~ '^[0-9]{4,8}$'),
  nombre    text not null,
  /* DE QUÉ EMPRESA ES. Es el dato por el que se va a mirar el informe:
     una rotura reportada por un OPM del OL no es lo mismo que una
     reportada por alguien del centro. */
  empresa   text not null default 'Easy',
  turno     text,
  activo    boolean not null default true,
  nota      text,
  creado_en timestamptz not null default now()
);
create index if not exists roturas_operarios_activo_idx
  on public.roturas_operarios (nombre) where activo;

/* LA TABLA NO SE LE DA A LA APLICACIÓN. Ver arriba: el PIN no sale de
   la base. Solo quien manda la administra, y para eso usa las
   funciones de abajo. */
revoke all on public.roturas_operarios from authenticated;

/* QUIÉN ES ESTE PIN. Devuelve el nombre y el turno, NUNCA el pin.
   `security definer` porque la tabla no es de nadie.

   NO DICE SI EL PIN EXISTE CUANDO ESTÁ APAGADO: un operario dado de
   baja tiene que fallar igual que uno inventado, o el maestro se puede
   ir adivinando de a cuatro dígitos desde la pantalla de registrar. */
create or replace function public.operario_por_pin(p_pin text)
returns table (id uuid, nombre text, empresa text, turno text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.nombre, o.empresa, o.turno
    from public.roturas_operarios o
   where o.activo and o.pin = btrim(coalesce(p_pin, ''))
$$;
grant execute on function public.operario_por_pin(text) to authenticated;

-- =====================================================================
-- 3. DE DÓNDE SALE LA ROTURA
-- =====================================================================
-- «La primera pregunta que debe salir, antes de iniciar, es: rotura
--  reportada por OPM o encontrada.»
--
-- SON DOS COSAS DISTINTAS Y HAY QUE PODER SEPARARLAS EN EL INFORME. Una
-- rotura que reportó un operario es el sistema funcionando; una
-- encontrada es una que nadie reportó, y un mes con muchas encontradas
-- dice algo que ninguna otra cifra dice.
do $$ begin
  create type rotura_origen as enum ('opm', 'encontrada');
exception when duplicate_object then null; end $$;

alter table public.roturas
  add column if not exists origen  rotura_origen,
  /* QUIÉN LA REPORTÓ. Solo cuando el origen es «opm»: en las
     encontradas no hay a quién apuntar, y poner ahí a quien la registró
     sería decir que él la reportó. */
  add column if not exists opm_id  uuid references public.roturas_operarios(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'roturas_opm_solo_si_reportada') then
    alter table public.roturas add constraint roturas_opm_solo_si_reportada
      check (origen is distinct from 'encontrada' or opm_id is null);
  end if;
end $$;

/* SE MARCA DESPUÉS DE REGISTRAR, en su propia función.

   `rotura_registrar` tiene doce argumentos y ciento quince líneas de
   reglas. En PostgreSQL no se le agrega un argumento a una función: hay
   que reescribirla entera, y en este proyecto ya se han perdido reglas
   reescribiendo funciones grandes. Es el mismo reparto que se usó para
   amarrar el vidrio al viaje.

   LO QUE QUEDA SIN ORIGEN SE VE. Ver la vista: `sin_origen`. Una rotura
   sin origen no es un error que se pueda esconder — es una que hay que
   ir a completar. */
create or replace function public.rotura_marcar_origen(
  p_id uuid, p_origen text, p_pin text default null)
returns table (opm text)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_nombre text;
begin
  if p_origen not in ('opm', 'encontrada') then
    raise exception 'El origen es «opm» o «encontrada»';
  end if;

  if p_origen = 'opm' then
    select o.id, o.nombre into v_id, v_nombre
      from public.operario_por_pin(p_pin) o;
    if v_id is null then
      raise exception 'Ese PIN no es de ningún operario activo';
    end if;
  end if;

  update public.roturas
     set origen = p_origen::rotura_origen, opm_id = v_id
   where id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;

  return query select v_nombre;
end $$;
grant execute on function public.rotura_marcar_origen(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3b. EL MAESTRO DE OPERARIOS, PARA QUIEN MANDA
-- ---------------------------------------------------------------------
-- VA AQUÍ Y NO ARRIBA, con el resto del maestro, por una razón de
-- PostgreSQL y no de orden: `operarios_listar` cuenta las roturas de
-- cada operario, y `roturas.opm_id` se crea unos bloques más arriba.
-- Una función `language sql` se valida al crearla, así que puesta antes
-- reventaba con «column r.opm_id does not exist» — y la migración se
-- caía a la mitad, dejando el maestro creado y el resto sin correr.

/* EL MAESTRO, PARA QUIEN MANDA. Tres funciones y no acceso directo a la
   tabla, por lo mismo: así el PIN solo sale cuando quien lo pide manda,
   y queda en un solo sitio comprobable. */
create or replace function public.operarios_listar()
returns table (id uuid, pin text, nombre text, empresa text, turno text,
               activo boolean, nota text, roturas bigint)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, case when public.manda() then o.pin else '••••' end,
         o.nombre, o.empresa, o.turno, o.activo, o.nota,
         (select count(*) from public.roturas r where r.opm_id = o.id)
    from public.roturas_operarios o
   where public.manda()
   order by o.activo desc, o.nombre
$$;

create or replace function public.operario_guardar(
  p_id uuid, p_pin text, p_nombre text, p_empresa text,
  p_turno text default null, p_activo boolean default true, p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.manda() then
    raise exception 'El maestro de operarios es del administrador';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El operario necesita un nombre: el PIN solo sirve para traerlo';
  end if;
  if btrim(coalesce(p_pin, '')) !~ '^[0-9]{4,8}$' then
    raise exception 'El PIN son de cuatro a ocho dígitos';
  end if;

  if p_id is null then
    insert into public.roturas_operarios (pin, nombre, empresa, turno, activo, nota)
      values (btrim(p_pin), btrim(p_nombre), coalesce(nullif(btrim(p_empresa),''),'Easy'),
              nullif(btrim(coalesce(p_turno,'')),''), coalesce(p_activo, true),
              nullif(btrim(coalesce(p_nota,'')),''))
      returning id into v_id;
  else
    update public.roturas_operarios
       set pin = btrim(p_pin), nombre = btrim(p_nombre),
           empresa = coalesce(nullif(btrim(p_empresa),''),'Easy'),
           turno = nullif(btrim(coalesce(p_turno,'')),''),
           activo = coalesce(p_activo, true),
           nota = nullif(btrim(coalesce(p_nota,'')),'')
     where id = p_id
     returning id into v_id;
    if v_id is null then raise exception 'Ese operario no existe'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya hay otro operario con ese PIN: dos con el mismo PIN no prueban nada';
end $$;


-- =====================================================================
-- 4. QUE LA VISTA LO DIGA
-- =====================================================================
do $$
declare v_def text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='v_roturas' and column_name='origen') then
    raise notice 'La vista ya trae el origen.';
    return;
  end if;
  /* Se envuelve la definición que ya tiene: `create or replace view` no
     acepta que la vista se nombre a sí misma, ni que le metan una
     columna en la mitad. */
  v_def := rtrim(btrim(pg_get_viewdef('public.v_roturas'::regclass, true)), ';');
  execute format($f$
    create or replace view public.v_roturas as
      select x.*,
             r.origen::text as origen,
             r.opm_id,
             o.nombre  as opm_nombre,
             o.empresa as opm_empresa,
             o.turno   as opm_turno,
             (r.origen is null) as sin_origen
        from ( %s ) x
        join public.roturas r on r.id = x.id
        left join public.roturas_operarios o on o.id = r.opm_id
  $f$, v_def);
  raise notice 'La vista ya dice de dónde salió cada rotura y quién la reportó.';
end $$;
grant select on public.v_roturas to authenticated;

-- =====================================================================
-- 5. CARGAR LA LISTA DE UNA, Y QUE EL PIN LO PONGA LA BASE
-- ---------------------------------------------------------------------
-- «La idea es que yo solo coloque los nombres de los operadores: copio
--  en Excel, pego allí, y de una genera los PIN y los nombres.»
--
-- EL PIN LO SORTEA LA BASE Y NO LA PANTALLA, y no es un detalle: dos
-- personas cargando su lista al mismo tiempo desde dos computadores
-- sortearían el mismo número sin enterarse. Aquí el sorteo y la
-- comprobación de que está libre ocurren dentro de la misma
-- transacción, y el índice único es el que manda.
--
-- ES AL AZAR Y NO CORRELATIVO. Lo cómodo sería 0001, 0002, 0003; con
-- eso, cualquiera que vea un PIN sabe los de todos sus compañeros, y el
-- PIN existe justamente para poder creerle al que registra.
--
-- Y SE SALTAN LOS PIN QUE NADIE DEBERÍA TENER: 0000, 1111 … 9999, 1234
-- y 4321. No son más débiles que otros —todos valen lo mismo en un
-- sorteo—, pero son los que alguien teclea cuando quiere probar suerte.
--
-- UN NOMBRE QUE YA ESTÁ NO SE DUPLICA: devuelve el PIN que ya tenía.
-- Así, pegar la lista entera otra vez no crea cien filas repetidas —es
-- la forma de volver a sacar los PIN de todos sin tocar nada—.
-- Se comparan los nombres en minúscula, sin espacios de sobra y sin
-- tildes; dos personas que de verdad se llamen igual quedan como una
-- sola, y eso hay que resolverlo con el segundo apellido.
-- =====================================================================
/* SIN TILDES, A MANO Y NO CON `unaccent`. La extensión existe pero hay
   que instalarla, y una migración que se cae con «extension unaccent is
   not available» en el proyecto de alguien no vale el ahorro: son seis
   vocales. */
create or replace function public.sin_tildes(t text)
returns text
language sql
immutable
set search_path = public
as $$ select translate(coalesce(t, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN') $$;

create or replace function public.operarios_cargar(p_lista jsonb)
returns table (nombre text, pin text, empresa text, turno text, estado text)
language plpgsql
security definer
set search_path = public
as $$
declare
  it        jsonb;
  v_nombre  text;
  v_turno   text;
  v_empresa text;
  v_pedido  text;
  v_pin     text;
  v_intento int;
  v_ya      public.roturas_operarios%rowtype;
begin
  if not public.manda() then
    raise exception 'Cargar la lista de operarios es del administrador';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb))
  loop
    v_nombre  := btrim(coalesce(it->>'nombre', ''));
    /* Los espacios de adentro también: pegado de Excel es normal que
       venga «Jose  Palacio» con dos. */
    v_nombre  := regexp_replace(v_nombre, '\s+', ' ', 'g');
    v_turno   := nullif(btrim(coalesce(it->>'turno', '')), '');
    v_empresa := coalesce(nullif(btrim(coalesce(it->>'empresa', '')), ''), 'Easy');
    v_pedido  := nullif(btrim(coalesce(it->>'pin', '')), '');

    if v_nombre = '' then
      continue;                              -- una línea en blanco no es nadie
    end if;

    /* ¿YA ESTÁ? Se contesta con el PIN que ya tiene. */
    select * into v_ya from public.roturas_operarios o
     where public.sin_tildes(lower(o.nombre)) = public.sin_tildes(lower(v_nombre))
     limit 1;
    if found then
      nombre := v_ya.nombre; pin := v_ya.pin; empresa := v_ya.empresa;
      turno := v_ya.turno;   estado := 'ya estaba';
      return next;
      continue;
    end if;

    /* EL PIN: el que vino en la lista, o uno sorteado. */
    if v_pedido is not null then
      if v_pedido !~ '^[0-9]{4,8}$' then
        nombre := v_nombre; pin := v_pedido; empresa := v_empresa;
        turno := v_turno;   estado := 'PIN mal escrito';
        return next;
        continue;
      end if;
      if exists (select 1 from public.roturas_operarios o where o.pin = v_pedido) then
        nombre := v_nombre; pin := v_pedido; empresa := v_empresa;
        turno := v_turno;   estado := 'ese PIN ya es de otro';
        return next;
        continue;
      end if;
      v_pin := v_pedido;
    else
      v_pin := null;
      for v_intento in 1..300 loop
        v_pin := lpad((floor(random() * 10000))::int::text, 4, '0');
        exit when v_pin not in ('0000','1111','2222','3333','4444','5555',
                                '6666','7777','8888','9999','1234','4321')
              and not exists (select 1 from public.roturas_operarios o where o.pin = v_pin);
        v_pin := null;
      end loop;
      if v_pin is null then
        /* Trescientos intentos fallidos con diez mil casillas significa
           que quedan muy pocas libres. Se dice, en vez de dejar al
           operario sin PIN y sin explicación. */
        raise exception 'Ya casi no quedan PIN de cuatro dígitos libres: hay que usar PIN más largos';
      end if;
    end if;

    insert into public.roturas_operarios (pin, nombre, empresa, turno, activo)
      values (v_pin, v_nombre, v_empresa, v_turno, true);

    nombre := v_nombre; pin := v_pin; empresa := v_empresa;
    turno := v_turno;   estado := 'nuevo';
    return next;
  end loop;
end $$;
grant execute on function public.operarios_cargar(jsonb) to authenticated;

do $$
declare v_sin int; v_env int;
begin
  select count(*) into v_sin from public.productos
   where activo and tipo_material = 'ENVASE' and color_vidrio is null;
  select count(*) into v_env from public.productos where activo and tipo_material = 'ENVASE';
  raise notice '--------------------------------------------------------';
  raise notice 'EL DESPLEGABLE DE QUIEBRA EN SITIO YA SALE DEL MAESTRO DE';
  raise notice 'INVENTARIO: Producto terminado trae los PRODUCTO y EER trae';
  raise notice 'los ENVASE.';
  raise notice 'FALTA LLENAR EL COLOR DEL VIDRIO en % de % envases.', v_sin, v_env;
  raise notice 'Sin color, el analisis de salida por color no cuadra.';
  raise notice 'Se llena en Inventario -> Maestro.';
  raise notice '--------------------------------------------------------';
  raise notice 'Y FALTA CARGAR LOS OPERARIOS con su PIN antes de que la';
  raise notice 'primera pregunta sirva de algo.';
  raise notice '--------------------------------------------------------';
end $$;

commit;
