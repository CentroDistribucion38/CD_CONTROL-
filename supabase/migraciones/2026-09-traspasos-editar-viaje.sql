-- =====================================================================
-- TRASPASOS · CORREGIR UN VIAJE YA REGISTRADO
--
-- Requiere: supabase/modulos/traspasos.sql
--
-- QUÉ PROBLEMA RESUELVE.
--
-- Hasta hoy, un viaje mal registrado solo se podía ANULAR y volver a
-- teclear entero. Por una placa con un dígito cambiado eso son ocho
-- campos otra vez, a las cinco de la mañana y con guantes: nadie lo
-- hace, y el viaje malo se queda. Un dato que no se puede corregir es
-- un dato que se deja mal.
--
-- QUIÉN. SOLO EL ADMINISTRADOR, y el candado está en la base, no en la
-- pantalla — esconder un botón no es un permiso. Anular sigue igual que
-- estaba: quien lo registró o un administrador. Son dos cosas
-- distintas: anular dice "esto no pasó" y lo deja escrito; editar
-- reescribe lo que pasó, y eso pesa más.
--
-- QUEDA RASTRO DE TODO. Cada corrección guarda la fila ENTERA como
-- estaba y como quedó. Un administrador que puede cambiar cualquier
-- cosa sin dejar huella no es una herramienta, es un agujero: dentro de
-- tres meses nadie podría responder por qué ese viaje dice otra cosa.
--
-- LO QUE NO SE PUEDE. Un viaje ANULADO no se edita: primero se
-- devuelve. Y el código TR-#### no cambia nunca — es el nombre del
-- viaje, y un nombre que cambia no sirve para nombrar.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. QUIÉN LO TOCÓ POR ÚLTIMA VEZ
--
-- En la fila del viaje, para poder pintar "corregido" en la lista sin
-- consultar otra tabla por cada renglón.
-- ---------------------------------------------------------------------
alter table public.traspasos_viajes
  add column if not exists editado_en  timestamptz,
  add column if not exists editado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists ediciones   smallint not null default 0;


-- ---------------------------------------------------------------------
-- 2. EL RASTRO COMPLETO
--
-- Una fila por corrección, con la foto de ANTES y la de DESPUÉS. Se
-- guardan enteras y en jsonb en vez de columna por columna: el día que
-- el viaje gane un campo, este rastro lo recoge solo.
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_viajes_ediciones (
  id        uuid primary key default gen_random_uuid(),
  viaje     uuid not null references public.traspasos_viajes(id) on delete cascade,
  editado_por uuid references public.perfiles(id) on delete set null,
  editado_en  timestamptz not null default now(),
  motivo    text,
  antes     jsonb not null,
  despues   jsonb not null
);

create index if not exists traspasos_viajes_ediciones_viaje_idx
  on public.traspasos_viajes_ediciones (viaje, editado_en desc);


-- ---------------------------------------------------------------------
-- 3. CORREGIR
--
-- Se manda la fila COMPLETA como tiene que quedar, no solo lo que
-- cambió. Es lo mismo que hace guardar_plan con la rejilla: lo que
-- manda es lo que la persona está viendo. Con "solo lo que cambió" hay
-- que inventar un valor para decir "esto déjalo", y entonces no se
-- puede borrar una observación nunca más.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_editar_viaje(
  uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text);

create function public.traspaso_editar_viaje(
  p_id      uuid,
  p_fecha   date,
  p_turno   text,
  p_tipo    text    default null,
  p_placa   text    default null,
  p_origen  text    default null,
  p_destino text    default null,
  p_viajes  integer default 1,
  p_vacio   boolean default false,
  p_carga   integer default null,
  p_unidad  text    default null,
  p_nota    text    default null,
  p_motivo  text    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes  jsonb;
  v_estado traspaso_estado;
  v_placa  text;
  v_o text; v_d text; v_ot text; v_dt text;
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Corregir un viaje registrado es solo del administrador. Si te equivocaste al registrar, anúlalo y vuelve a registrarlo';
  end if;

  select to_jsonb(v), v.estado into v_antes, v_estado
    from public.traspasos_viajes v where v.id = p_id;
  if v_antes is null then raise exception 'Ese viaje no existe'; end if;

  /* UN VIAJE ANULADO NO SE EDITA. Corregir algo que ya se declaró que
     no pasó deja una fila que se contradice a sí misma. Primero se
     devuelve, después se corrige. */
  if v_estado = 'anulado' then
    raise exception 'Ese viaje está anulado. Devuélvelo primero y después corrígelo';
  end if;

  if upper(btrim(coalesce(p_turno, ''))) not in ('A','B','C') then
    raise exception 'El turno tiene que ser A, B o C';
  end if;
  if p_fecha is null then
    raise exception 'Hay que decir de qué día es el viaje';
  end if;
  if coalesce(p_viajes, 1) < 1 then
    raise exception 'Un registro tiene que representar al menos un viaje';
  end if;

  /* ------------------------------------------------------------------
     VIAJE VACÍO. No lleva tipo, ni placa, ni ruta: se limpian en vez de
     dejarlos como estaban. Un vacío que conserva la placa del viaje con
     carga que fue antes es un dato que miente. */
  if p_vacio then
    update public.traspasos_viajes
       set fecha = p_fecha, turno = upper(btrim(p_turno)),
           tipo = null, placa = null,
           origen = null, destino = null, origen_texto = null, destino_texto = null,
           carga = null, unidad = null,
           viajes = coalesce(p_viajes, 1), vacio = true,
           nota = nullif(btrim(coalesce(p_nota, '')), ''),
           editado_en = now(), editado_por = auth.uid(), ediciones = ediciones + 1
     where id = p_id;

  else
    /* ---------------------------------------------------------------- */
    if not exists (select 1 from public.traspasos_tipos
                    where clave = p_tipo and activo) then
      raise exception 'Ese tipo de viaje no existe o está desactivado';
    end if;

    v_placa := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
    if v_placa = '' then
      raise exception 'Hay que decir la placa del vehículo';
    end if;

    /* LAS MISMAS REGLAS QUE AL REGISTRAR, y salen de las mismas
       funciones. Si fueran dos juegos de reglas, por la puerta de
       "corregir" entrarían viajes que por la de "registrar" no pasan. */
    v_o := public.traspaso_punto(p_origen);
    v_d := public.traspaso_punto(p_destino);
    v_ot := case when v_o is null then nullif(btrim(coalesce(p_origen, '')), '') end;
    v_dt := case when v_d is null then nullif(btrim(coalesce(p_destino, '')), '') end;

    if v_o is null and v_ot is null then
      raise exception 'Hay que decir de dónde sale el viaje';
    end if;
    if v_d is null and v_dt is null then
      raise exception 'Hay que decir a dónde va el viaje';
    end if;
    if upper(regexp_replace(coalesce(v_o, v_ot), '[^A-Za-z0-9]', '', 'g'))
     = upper(regexp_replace(coalesce(v_d, v_dt), '[^A-Za-z0-9]', '', 'g')) then
      raise exception 'El viaje sale y llega al mismo sitio. Revisa el origen y el destino';
    end if;

    update public.traspasos_viajes
       set fecha = p_fecha, turno = upper(btrim(p_turno)),
           tipo = p_tipo, placa = v_placa,
           origen = v_o, destino = v_d, origen_texto = v_ot, destino_texto = v_dt,
           viajes = coalesce(p_viajes, 1), vacio = false,
           carga = p_carga, unidad = nullif(btrim(coalesce(p_unidad, '')), ''),
           nota = nullif(btrim(coalesce(p_nota, '')), ''),
           editado_en = now(), editado_por = auth.uid(), ediciones = ediciones + 1
     where id = p_id;
  end if;

  /* ------------------------------------------------------------------
     EL RASTRO. Va después del update para poder guardar el DESPUÉS de
     verdad —lo que quedó en la tabla— y no lo que se pidió: si alguna
     regla de la base cambiara un valor, el rastro lo recogería igual. */
  insert into public.traspasos_viajes_ediciones (viaje, editado_por, motivo, antes, despues)
  select p_id, auth.uid(), nullif(btrim(coalesce(p_motivo, '')), ''),
         v_antes, to_jsonb(v)
    from public.traspasos_viajes v where v.id = p_id;
end $$;

revoke all on function public.traspaso_editar_viaje(
  uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text) from public;
grant execute on function public.traspaso_editar_viaje(
  uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text)
to authenticated;


-- ---------------------------------------------------------------------
-- 4. LA SEGURIDAD DEL RASTRO
--
-- Se lee, no se escribe. La única forma de que entre una fila aquí es
-- por traspaso_editar_viaje, que es security definer: así el rastro no
-- se puede fabricar ni maquillar desde el navegador.
-- ---------------------------------------------------------------------
alter table public.traspasos_viajes_ediciones enable row level security;

drop policy if exists traspasos_ediciones_select on public.traspasos_viajes_ediciones;
create policy traspasos_ediciones_select on public.traspasos_viajes_ediciones
  for select to authenticated using (true);

grant select on public.traspasos_viajes_ediciones to authenticated;


-- ---------------------------------------------------------------------
-- 5. LA LISTA LO DICE
--
-- La vista de viajes gana las tres columnas del rastro. Sin esto, un
-- viaje corregido se ve igual que uno recién registrado y la corrección
-- queda escondida en una tabla que nadie abre — que es exactamente lo
-- que el rastro venía a evitar.
--
-- Se recrea entera y no con un "add column": una vista no se amplía, se
-- reemplaza, y tenerla escrita completa aquí es lo que permite leerla
-- de un vistazo dentro de tres meses.
-- ---------------------------------------------------------------------
/* Sin CASCADE a propósito: hoy nadie cuelga de esta vista, y si mañana
   alguien cuelga, este archivo tiene que fallar ruidosamente en vez de
   llevarse por delante lo que no sabe que existe. */
drop view if exists public.v_traspasos_viajes;

create view public.v_traspasos_viajes as
select
  v.id, v.codigo, v.fecha, v.turno,
  public.traspaso_orden_turno(v.turno)          as turno_orden,
  v.tipo, t.nombre                              as tipo_nombre,
  v.placa,
  v.origen,  coalesce(po.nombre, v.origen_texto)  as origen_nombre,
  v.destino, coalesce(pd.nombre, v.destino_texto) as destino_nombre,
  (v.origen  is null and v.origen_texto  is not null) as origen_suelto,
  (v.destino is null and v.destino_texto is not null) as destino_suelto,
  v.viajes, v.vacio, v.carga, v.unidad, v.nota,
  v.hora, v.registrado_por, v.registrado_en,
  v.estado::text as estado,
  (v.estado = 'registrado') as vale,
  v.motivo_anulacion, v.anulado_en, v.anulado_por,
  v.ediciones, v.editado_en, v.editado_por
from public.traspasos_viajes v
left join public.traspasos_tipos t on t.clave = v.tipo
left join public.traspasos_puntos po on po.clave = v.origen
left join public.traspasos_puntos pd on pd.clave = v.destino;

grant select on public.v_traspasos_viajes to authenticated;


-- ---------------------------------------------------------------------
-- 6. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := '';
begin
  if to_regclass('public.traspasos_viajes_ediciones') is null then
    v_falta := v_falta || ' traspasos_viajes_ediciones'; end if;
  if to_regprocedure('public.traspaso_editar_viaje(uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text)') is null then
    v_falta := v_falta || ' traspaso_editar_viaje'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='traspasos_viajes'
                    and column_name='ediciones') then
    v_falta := v_falta || ' traspasos_viajes.ediciones'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;
  raise notice 'Listo: el administrador ya puede corregir un viaje, y queda el rastro.';
end $$;
