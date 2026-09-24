-- =====================================================================
-- AVERÍAS — lo que se dañó en la bodega, y su baja
-- ---------------------------------------------------------------------
-- «Dentro del inventario pon un módulo de avería. Me interesa:
--  ubicación, código, descripción, cantidad en cajas, cantidad en
--  unidades, fecha de vencimiento del producto, causal de la avería
--  —avería transporte, avería depósito, producto contaminado—, nombre
--  de quien la reporta, y # documento de baja cuando se le dé de baja.»
--
-- ---------------------------------------------------------------------
-- ES DE INVENTARIO Y NO DE ROTURAS, aunque se parezcan
-- ---------------------------------------------------------------------
-- Una rotura es vidrio que se rompió y que sale del CD en una tolva:
-- se pesa en kilos y termina en una salida. Una avería es PRODUCTO
-- que ya no se puede vender pero que sigue en la estiba, en su
-- ubicación, contando en el inventario hasta que llegue el documento
-- de baja de SAP. Se cuenta en cajas y unidades, no en kilos, y lo que
-- se pregunta de ella —en qué calle pasa, cuánto tarda la baja, qué se
-- está venciendo— no se le pregunta a una rotura.
--
-- Juntarlas habría obligado a que la mitad de las columnas de cada una
-- estuviera vacía en la otra.
--
-- ---------------------------------------------------------------------
-- EL DOCUMENTO DE BAJA ES LO QUE SEPARA LAS DOS MITADES
-- ---------------------------------------------------------------------
-- SIN DOCUMENTO, la avería sigue contando en el inventario: está
-- apartada en la bodega, nadie la va a vender, pero el sistema cree que
-- está. Esa diferencia es exactamente lo que descuadra un conteo.
-- CON DOCUMENTO, ya salió de la cuenta.
--
-- Por eso `documento` no es un dato más: es el ESTADO. Y por eso se
-- guarda CUÁNDO llegó —`documento_en`—, que es lo único que permite
-- decir «la baja se está demorando once días».
--
-- ---------------------------------------------------------------------
-- LA FOTO NO SE EXIGE, PERO SE PIDE
-- ---------------------------------------------------------------------
-- Una avería sin foto es la palabra de quien la reportó contra la de
-- quien la recibió. Pero trabarla por una foto que no subió es perder
-- el registro de algo que YA pasó: la avería existe igual. Se registra,
-- y la pantalla dice cuáles están sin foto.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. LAS CAUSALES, EN UNA TABLA Y NO EN UN ENUM
-- ---------------------------------------------------------------------
-- Son tres hoy. Un enum obligaría a una migración el día que aparezca
-- la cuarta —y aparece: «avería del proveedor» ya se mencionó—, y en
-- PostgreSQL un valor de enum no se puede quitar. Con tabla, se agrega
-- desde el maestro sin esperar un despliegue.
create table if not exists public.averias_causales (
  clave   text primary key,
  nombre  text not null,
  /* SI LA CULPA ES DE AFUERA. Una avería de transporte llega averiada
     —es del transportador—; una de depósito se hizo aquí. Es la
     distinción que decide a quién se le cobra, y no se puede sacar del
     nombre sin adivinar. */
  externa boolean not null default false,
  activo  boolean not null default true,
  orden   integer
);

insert into public.averias_causales (clave, nombre, externa, orden) values
  ('transporte',  'Avería transporte',   true,  1),
  ('deposito',    'Avería depósito',     false, 2),
  ('contaminado', 'Producto contaminado', false, 3)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 2. LAS AVERÍAS
-- ---------------------------------------------------------------------
create sequence if not exists public.averias_codigo_seq;

create table if not exists public.averias (
  id           uuid primary key default gen_random_uuid(),
  codigo       text unique not null,
  /* LA FECHA DEL HECHO, aparte de `creado_en`. No son lo mismo: una
     avería que se encuentra el lunes y se registra el miércoles pasó
     el lunes, y el informe del mes tiene que contarla en su día. */
  fecha        date not null default (now() at time zone 'America/Bogota')::date,

  ubicacion    text not null,
  /* EL PRODUCTO SE GUARDA POR SKU **Y** POR NOMBRE. El SKU amarra con
     el maestro; el nombre se copia. Copiarlo parece redundante hasta
     que alguien le cambia el nombre a un producto en el maestro: sin
     la copia, una avería de hace seis meses empieza a decir otra cosa
     de la que decía el papel que se firmó. */
  producto_sku text not null references public.productos(sku) on delete restrict,
  producto     text not null,

  /* LAS CAJAS Y LAS UNIDADES VAN SEPARADAS, y las dos pueden ser cero
     —pero no las dos a la vez—. Media caja averiada es «0 cajas, 7
     unidades», y una estiba entera es «48 cajas, 0 unidades».
     Guardar solo unidades obligaría a dividir por las botellas de la
     caja para volver a decir «48 cajas», y ese factor cambia. */
  cajas        integer not null default 0 check (cajas    >= 0),
  unidades     integer not null default 0 check (unidades >= 0),
  constraint averias_algo_hay check (cajas > 0 or unidades > 0),

  vence        date,
  causal       text not null references public.averias_causales(clave),
  reporto      text not null,

  /* EL DOCUMENTO DE BAJA. Los dos van juntos o ninguno: un documento
     sin fecha no sirve para medir la demora, y una fecha sin documento
     es una baja que nadie puede buscar en SAP. */
  documento    text,
  documento_en timestamptz,
  constraint averias_documento_completo
    check ((documento is null) = (documento_en is null)),

  nota         text,
  creado_por   uuid references public.perfiles(id) on delete set null,
  creado_en    timestamptz not null default now(),

  anulada_en   timestamptz,
  anulada_por  uuid references public.perfiles(id) on delete set null,
  motivo_anulacion text
);

create index if not exists averias_fecha_idx     on public.averias (fecha desc);
create index if not exists averias_sin_doc_idx   on public.averias (fecha) where documento is null;
create index if not exists averias_ubicacion_idx on public.averias (ubicacion);

create table if not exists public.averias_fotos (
  id          uuid primary key default gen_random_uuid(),
  averia_id   uuid not null references public.averias(id) on delete cascade,
  ruta        text not null,
  ancho       integer, alto integer, bytes integer,
  tomada_en   timestamptz,
  subida_en   timestamptz not null default now()
);
create index if not exists averias_fotos_averia_idx on public.averias_fotos (averia_id);

-- ---------------------------------------------------------------------
-- 3. QUIÉN PUEDE
-- ---------------------------------------------------------------------
create or replace function public.averia_puede_editar()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.mi_nivel_pantalla('/inventario/averias') = 'editar' $$;

alter table public.averias           enable row level security;
alter table public.averias_fotos     enable row level security;
alter table public.averias_causales  enable row level security;

drop policy if exists averias_ver on public.averias;
create policy averias_ver on public.averias
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/averias') in ('ver', 'editar'));

drop policy if exists averias_fotos_ver on public.averias_fotos;
create policy averias_fotos_ver on public.averias_fotos
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/averias') in ('ver', 'editar'));

drop policy if exists averias_fotos_crear on public.averias_fotos;
create policy averias_fotos_crear on public.averias_fotos
  for insert to authenticated
  with check (public.averia_puede_editar());

drop policy if exists averias_causales_ver on public.averias_causales;
create policy averias_causales_ver on public.averias_causales
  for select to authenticated using (true);

/* LAS AVERÍAS NO SE ESCRIBEN DIRECTO, ni siquiera por quien puede
   editar: se escriben por las funciones de abajo. Así el código, la
   copia del nombre del producto y la regla del documento viven en UN
   solo sitio y no en cada pantalla que quiera insertar una fila. */
revoke insert, update, delete on public.averias from authenticated;
grant select on public.averias, public.averias_causales to authenticated;
grant select, insert on public.averias_fotos to authenticated;

-- ---------------------------------------------------------------------
-- 4. REGISTRAR
-- ---------------------------------------------------------------------
create or replace function public.averia_registrar(
  p_ubicacion text,
  p_sku       text,
  p_cajas     integer,
  p_unidades  integer,
  p_causal    text,
  p_reporto   text,
  p_vence     date default null,
  p_fecha     date default null,
  p_nota      text default null)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_cod text; v_nombre text; v_vence date; v_fecha date;
begin
  if not public.averia_puede_editar() then
    raise exception 'No tienes permiso para registrar averías';
  end if;
  if btrim(coalesce(p_ubicacion, '')) = '' then
    raise exception 'Falta la ubicación: una avería que no se sabe dónde está no se puede ir a ver';
  end if;
  if coalesce(p_cajas, 0) <= 0 and coalesce(p_unidades, 0) <= 0 then
    raise exception 'Hay que decir cuánto: cajas, unidades, o las dos';
  end if;
  if btrim(coalesce(p_reporto, '')) = '' then
    raise exception 'Falta el nombre de quien la reporta';
  end if;

  select p.nombre into v_nombre from public.productos p where p.sku = p_sku;
  if v_nombre is null then
    raise exception 'Ese producto no está en el maestro de inventario';
  end if;
  if not exists (select 1 from public.averias_causales c
                  where c.clave = p_causal and c.activo) then
    raise exception 'Esa causal no existe o está apagada';
  end if;

  /* LA FECHA NO PUEDE SER DEL FUTURO. Un dedo de más en el año manda
     una avería a 2062 y ahí no la encuentra ningún informe: no está
     «mal», está fuera de todo rango que alguien vaya a mirar. */
  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Bogota')::date);
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Esa fecha todavía no ha llegado';
  end if;

  /* EL VENCIMIENTO SE TOMA COMO LLEGA, incluso si ya pasó: una avería
     de producto vencido es justamente uno de los casos que hay que
     poder registrar. */
  v_vence := p_vence;

  v_cod := 'AV-' || lpad(nextval('public.averias_codigo_seq')::text, 4, '0');

  insert into public.averias (codigo, fecha, ubicacion, producto_sku, producto,
                              cajas, unidades, vence, causal, reporto, nota, creado_por)
    values (v_cod, v_fecha, btrim(p_ubicacion), p_sku, v_nombre,
            coalesce(p_cajas, 0), coalesce(p_unidades, 0), v_vence,
            p_causal, btrim(p_reporto), nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
    returning averias.id, averias.codigo into v_id, v_cod;

  id := v_id; codigo := v_cod;
  return next;
end $$;
grant execute on function public.averia_registrar(text, text, integer, integer, text, text, date, date, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5. DARLE DE BAJA — el documento de SAP
-- ---------------------------------------------------------------------
create or replace function public.averia_dar_baja(p_id uuid, p_documento text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.averias%rowtype;
begin
  if not public.averia_puede_editar() then
    raise exception 'No tienes permiso para dar de baja averías';
  end if;
  if btrim(coalesce(p_documento, '')) = '' then
    raise exception 'Falta el número del documento de baja';
  end if;

  select * into v from public.averias where averias.id = p_id;
  if not found then raise exception 'Esa avería no existe'; end if;
  if v.anulada_en is not null then
    raise exception 'Esa avería está anulada: no se le da de baja';
  end if;
  /* PONERLE OTRO DOCUMENTO A UNA QUE YA LO TIENE NO ES CORREGIR, ES
     TAPAR. Si el primero estaba mal, se dice: se quita con
     `averia_quitar_baja`, que deja rastro de que hubo dos. */
  if v.documento is not null then
    raise exception 'Esa avería ya se dio de baja con el documento %', v.documento;
  end if;

  update public.averias
     set documento = btrim(p_documento), documento_en = now()
   where averias.id = p_id;
end $$;
grant execute on function public.averia_dar_baja(uuid, text) to authenticated;

create or replace function public.averia_quitar_baja(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.averias%rowtype;
begin
  /* QUITAR UNA BAJA ES DEL ADMINISTRADOR, y registrar no. Poner el
     documento es papeleo del día; quitarlo devuelve un producto a la
     cuenta del inventario después de que alguien ya cuadró el mes. */
  if not public.manda() then
    raise exception 'Quitar un documento de baja es del administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se quita';
  end if;

  select * into v from public.averias where averias.id = p_id;
  if not found then raise exception 'Esa avería no existe'; end if;
  if v.documento is null then raise exception 'Esa avería no tiene documento'; end if;

  update public.averias
     set documento = null, documento_en = null,
         nota = btrim(coalesce(nota || ' · ', '') ||
                'Se quitó el documento ' || v.documento || ': ' || btrim(p_motivo))
   where averias.id = p_id;
end $$;
grant execute on function public.averia_quitar_baja(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. ANULAR — no borrar
-- ---------------------------------------------------------------------
-- Una avería borrada no deja nada que mirar cuando alguien pregunte por
-- qué el mes cerró distinto. Anular deja la fila, el motivo y quién.
create or replace function public.averia_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.averias%rowtype;
begin
  if not public.manda() then
    raise exception 'Anular una avería es del administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula';
  end if;
  select * into v from public.averias where averias.id = p_id;
  if not found then raise exception 'Esa avería no existe'; end if;
  if v.anulada_en is not null then raise exception 'Esa avería ya está anulada'; end if;

  update public.averias
     set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
   where averias.id = p_id;
end $$;
grant execute on function public.averia_anular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6b. CORREGIR Y BORRAR — del administrador
-- ---------------------------------------------------------------------
-- «Que el admin yo pueda editar, eliminar, anular, borrar.»
--
-- SON TRES COSAS DISTINTAS Y HACEN FALTA LAS TRES:
--   CORREGIR  un dedo de más en las cajas, la ubicación mal escrita, la
--             causal equivocada. Es lo de todos los días.
--   ANULAR    «esto no pasó». Deja la fila, el motivo y quién, porque
--             una avería que desaparece es un mes que cerró distinto y
--             nadie sabe por qué.
--   BORRAR    para el error de dedo del mismo día: se registró dos
--             veces, o se registró en la pantalla equivocada.
--
-- BORRAR SOLO SI NO SE LE DIO DE BAJA. Una avería con documento de SAP
-- ya salió del inventario por ese número: borrarla deja el documento
-- apuntando a algo que no existe, y el día que alguien audite la baja
-- no encuentra contra qué cuadrarla. Esa se anula.
--
-- Y el correo de siempre: borrar no se ofrece para «limpiar». Lo que ya
-- no aplica se anula.
create or replace function public.averia_corregir(
  p_id        uuid,
  p_ubicacion text,
  p_sku       text,
  p_cajas     integer,
  p_unidades  integer,
  p_causal    text,
  p_reporto   text,
  p_vence     date default null,
  p_fecha     date default null,
  p_nota      text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.averias%rowtype; v_nombre text; v_fecha date;
begin
  if not public.manda() then
    raise exception 'Corregir una avería es del administrador';
  end if;

  select * into v from public.averias where averias.id = p_id;
  if not found then raise exception 'Esa avería no existe'; end if;
  if v.anulada_en is not null then
    raise exception 'Esa avería está anulada: para volver atrás se registra una nueva';
  end if;

  if btrim(coalesce(p_ubicacion, '')) = '' then
    raise exception 'Falta la ubicación';
  end if;
  if coalesce(p_cajas, 0) <= 0 and coalesce(p_unidades, 0) <= 0 then
    raise exception 'Hay que decir cuánto: cajas, unidades, o las dos';
  end if;
  select p.nombre into v_nombre from public.productos p where p.sku = p_sku;
  if v_nombre is null then
    raise exception 'Ese producto no está en el maestro de inventario';
  end if;
  if not exists (select 1 from public.averias_causales c
                  where c.clave = p_causal and c.activo) then
    raise exception 'Esa causal no existe o está apagada';
  end if;
  v_fecha := coalesce(p_fecha, v.fecha);
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Esa fecha todavía no ha llegado';
  end if;

  /* EL DOCUMENTO DE BAJA NO SE TOCA AQUÍ, a propósito: tiene sus dos
     funciones, y dejar que «corregir» lo cambiara sería un segundo
     camino para lo mismo, sin el rastro que aquellas dejan. */
  update public.averias
     set ubicacion = btrim(p_ubicacion), producto_sku = p_sku, producto = v_nombre,
         cajas = coalesce(p_cajas, 0), unidades = coalesce(p_unidades, 0),
         vence = p_vence, causal = p_causal, reporto = btrim(p_reporto),
         fecha = v_fecha, nota = nullif(btrim(coalesce(p_nota, '')), '')
   where averias.id = p_id;
end $$;
grant execute on function public.averia_corregir(uuid, text, text, integer, integer, text, text, date, date, text)
  to authenticated;

create or replace function public.averia_borrar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.averias%rowtype;
begin
  if not public.manda() then
    raise exception 'Borrar una avería es del administrador';
  end if;
  select * into v from public.averias where averias.id = p_id;
  if not found then raise exception 'Esa avería no existe'; end if;
  if v.documento is not null then
    raise exception
      'Esa avería ya se dio de baja con el documento %: se anula, no se borra', v.documento;
  end if;
  /* Las fotos se van con ella por la llave foránea `on delete cascade`;
     el archivo en el bucket lo limpia la pantalla. */
  delete from public.averias where averias.id = p_id;
end $$;
grant execute on function public.averia_borrar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. LA VISTA QUE LEE LA PANTALLA
-- ---------------------------------------------------------------------
create or replace view public.v_averias as
  select a.id, a.codigo, a.fecha, a.ubicacion,
         a.producto_sku, a.producto,
         a.cajas, a.unidades, a.vence,
         a.causal, c.nombre as causal_nombre, c.externa,
         a.reporto, a.documento, a.documento_en, a.nota,
         a.creado_por, a.creado_en,
         a.anulada_en, a.motivo_anulacion,
         /* LO QUE LA PANTALLA PREGUNTA, CALCULADO AQUÍ Y NO EN CADA
            PANTALLA. Tres pantallas calculando «está vencido» por su
            cuenta son tres sitios donde se puede calcular distinto. */
         (a.documento is null and a.anulada_en is null) as pendiente_baja,
         case when a.documento_en is not null
              then (a.documento_en at time zone 'America/Bogota')::date - a.fecha
         end as dias_baja,
         case when a.vence is not null
              then a.vence - (now() at time zone 'America/Bogota')::date
         end as dias_para_vencer,
         (select count(*) from public.averias_fotos f where f.averia_id = a.id) as fotos
    from public.averias a
    join public.averias_causales c on c.clave = a.causal;

grant select on public.v_averias to authenticated;

-- ---------------------------------------------------------------------
-- 8. LA PANTALLA EN EL REGISTRO DE PERMISOS
-- ---------------------------------------------------------------------
-- Sin esto, `mi_nivel_pantalla('/inventario/averias')` devuelve nada
-- para todo el mundo y la pantalla nace invisible hasta para el
-- administrador — que es como se pierde media tarde buscando el error
-- en el código.
do $$
begin
  if to_regclass('public.rol_permisos') is null then
    raise notice 'rol_permisos no existe todavía: los permisos se asignan después.';
    return;
  end if;
  /* A cada rol se le da en Averías lo MISMO que ya tiene en el maestro
     de inventario: quien mantiene el maestro es quien anda en la
     bodega. Solo a los que no tengan nada puesto. */
  insert into public.rol_permisos (rol, seccion, nivel)
    select rp.rol, '/inventario/averias', rp.nivel
      from public.rol_permisos rp
     where rp.seccion = '/inventario/maestro'
       and not exists (select 1 from public.rol_permisos x
                        where x.rol = rp.rol and x.seccion = '/inventario/averias');
  raise notice 'Averías hereda el permiso que cada rol tenía en Inventario -> Maestro.';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.averias_causales where activo;
  raise notice '--------------------------------------------------------';
  raise notice 'AVERIAS listo: % causales, codigo AV-0001 en adelante.', v_n;
  raise notice 'SIN DOCUMENTO DE BAJA la averia sigue contando en el';
  raise notice 'inventario: esa es la diferencia que descuadra un conteo,';
  raise notice 'y es lo que mide el tablero.';
  raise notice 'Se llena en Inventario -> Averias.';
  raise notice '--------------------------------------------------------';
end $$;

commit;
