-- =====================================================================
-- SALIDA DE VIDRIO · CORREGIRLA Y ANULARLA, SOLO QUIEN MANDA
-- ---------------------------------------------------------------------
-- «Que aquí yo pueda editar o eliminar o anular esas tolvas, y que solo
--  el súper admin tenga acceso.»
--
-- HASTA HOY, UNA SALIDA CERRADA ERA DEFINITIVA. `salida_quitar_tolva`
-- solo funciona mientras la salida está ABIERTA, y una vez cerrada no
-- había forma de corregir un peso mal tecleado: la cifra quedaba mal
-- para siempre y el informe del mes la arrastraba.
--
-- ---------------------------------------------------------------------
-- REABRIR, NO «EDITAR DIRECTO»
-- ---------------------------------------------------------------------
-- Lo pedido es «editar las tolvas». Se hace REABRIENDO la salida, y no
-- con un camino aparte que edite una tolva cerrada, por dos razones:
--
--   1. YA EXISTE TODO LO DE EDITAR. Con la salida abierta, pesar y
--      quitar tolvas funciona como el primer día, con sus reglas y su
--      arnés. Un segundo camino sería una segunda copia de esas reglas,
--      y las dos copias se separan.
--   2. REABRIR DEJA RASTRO Y «EDITAR» NO. Queda escrito quién la
--      reabrió, cuándo, por qué, y cuántas veces. Una salida que se
--      reabrió tres veces es un dato que alguien tiene que ver.
--
-- ---------------------------------------------------------------------
-- LO QUE NO SE PUEDE REABRIR
-- ---------------------------------------------------------------------
-- LA QUE YA SALIÓ POR LA PUERTA. Una salida despachada ya se fue con un
-- viaje y un documento: cambiarle los kilos después es cambiar un
-- número que ya se facturó y que ya está en un informe firmado. Si de
-- verdad está mal, primero se deshace el despacho en Facturación —que
-- deja su propio rastro— y después se reabre aquí.
--
-- Y LA ANULADA NO SE REABRE: anular es decir «esto no pasó». Para
-- volver atrás se abre una salida nueva.
--
-- ---------------------------------------------------------------------
-- «SÚPER ADMIN» ES `manda()`, NO EL TEXTO 'admin'
-- ---------------------------------------------------------------------
-- `salida_anular` preguntaba `mi_rol() <> 'admin'`. Eso es comparar
-- contra un NOMBRE, y los roles de este proyecto son datos: el día que
-- se cree un segundo rol que mande —o que alguien renombre el de
-- siempre— la comprobación deja de proteger lo que cree proteger, y en
-- la dirección peligrosa. `manda()` lee la casilla del rol, que es lo
-- que de verdad quiere decir «súper admin».
--
-- BORRAR DE VERDAD NO SE OFRECE, y es a propósito: una salida borrada
-- no deja nada que mirar cuando alguien pregunte por qué el mes cerró
-- distinto. Anular deja la fila, el motivo y quién lo hizo.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. EL RASTRO DE LAS REAPERTURAS
-- ---------------------------------------------------------------------
alter table public.roturas_salidas
  add column if not exists reabierta_por   uuid references public.perfiles(id) on delete set null,
  add column if not exists reabierta_en    timestamptz,
  add column if not exists reabierta_nota  text,
  /* CUÁNTAS VECES, y no solo la última: una salida reabierta cinco
     veces y una reabierta una sola vez no son lo mismo, y con una sola
     fecha las dos se ven igual. */
  add column if not exists reaperturas     integer not null default 0;

-- ---------------------------------------------------------------------
-- 2. REABRIR
-- ---------------------------------------------------------------------
create or replace function public.salida_reabrir(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.roturas_salidas%rowtype;
begin
  if not public.manda() then
    raise exception 'Reabrir una salida es del administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se reabre';
  end if;

  select * into s from public.roturas_salidas where id = p_id;
  if not found then raise exception 'Esa salida no existe'; end if;

  if s.estado = 'abierta' then
    raise exception 'Esa salida ya está abierta';
  end if;
  if s.estado = 'anulada' then
    raise exception 'Esa salida está anulada: para volver atrás se abre una nueva';
  end if;

  /* LA QUE YA SALIÓ POR LA PUERTA, NO. Ver el encabezado. La columna
     puede no existir si la migración del vidrio no se ha corrido, así
     que se pregunta por el catálogo antes de mirarla: exigirla
     convertiría un «falta un SQL» en una función que revienta. */
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'roturas_salidas'
                and column_name = 'despachada_en')
     and (select despachada_en from public.roturas_salidas where id = p_id) is not null then
    raise exception
      'Esa salida ya se despachó con un viaje: primero hay que deshacer el despacho en Facturación';
  end if;

  update public.roturas_salidas
     set estado = 'abierta',
         /* LAS FIRMAS SE CAEN. Una salida que se vuelve a tocar tiene
            que volver a firmarse: dejar la firma puesta sería sostener
            con la firma de ayer unos kilos de hoy. Es la regla entera
            de esta cadena. */
         supervisora_por = null, supervisora_en = null, supervisora_nota = null,
         verificador_por = null, verificador_en = null, verificador_nota = null,
         validador_por  = null, validador_en  = null, validador_nota  = null,
         reabierta_por = auth.uid(), reabierta_en = now(),
         reabierta_nota = btrim(p_motivo),
         reaperturas = coalesce(reaperturas, 0) + 1
   where id = p_id;
end $$;
grant execute on function public.salida_reabrir(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. ANULAR — misma regla, pero por la casilla y no por el nombre
-- ---------------------------------------------------------------------
create or replace function public.salida_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado salida_estado;
begin
  if not public.manda() then
    raise exception 'Anular una salida es del administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula';
  end if;

  select estado into v_estado from public.roturas_salidas where id = p_id;
  if not found then raise exception 'Esa salida no existe'; end if;
  if v_estado = 'anulada' then raise exception 'Esa salida ya está anulada'; end if;

  /* MISMO FRENO QUE REABRIR: lo que ya salió con un viaje no se anula
     desde aquí, o el viaje quedaría apuntando a una salida que dice que
     no existió. */
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'roturas_salidas'
                and column_name = 'despachada_en')
     and (select despachada_en from public.roturas_salidas where id = p_id) is not null then
    raise exception
      'Esa salida ya se despachó con un viaje: primero hay que deshacer el despacho en Facturación';
  end if;

  update public.roturas_salidas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulada_por = auth.uid(), anulada_en = now()
   where id = p_id;
end $$;
grant execute on function public.salida_anular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. QUITAR UNA TOLVA: NO HACE FALTA TOCARLA
-- ---------------------------------------------------------------------
-- La primera versión de esta migración le agregaba `manda()` a
-- `salida_quitar_tolva`, para que el administrador que acaba de reabrir
-- una salida pudiera quitar la tolva mal pesada. EL ARNÉS DEMOSTRÓ QUE
-- SOBRABA: `rotura_puede('supervisora')` pasa por `mi_nivel_pantalla`,
-- y esa función ya devuelve «editar» a quien manda. El administrador
-- siempre pudo.
--
-- Se quitó en vez de dejarla «por si acaso»: una condición que nunca
-- cambia nada hace creer que ahí había una regla, y el día que alguien
-- toque `mi_nivel_pantalla` va a respetar una que no existe.

-- ---------------------------------------------------------------------
-- 5. QUE LA PANTALLA PUEDA DECIRLO
-- ---------------------------------------------------------------------
-- Las columnas nuevas van AL FINAL: `create or replace view` no deja
-- meter una en la mitad.
do $$
declare v_def text;
begin
  if to_regclass('public.v_roturas_salidas') is null then
    raise notice 'v_roturas_salidas no existe todavía: se salta.';
    return;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'v_roturas_salidas'
                and column_name = 'reaperturas') then
    raise notice 'La vista ya trae el rastro de reaperturas.';
    return;
  end if;

  /* SE ENVUELVE LA DEFINICIÓN QUE YA TIENE, y no se copia aquí una de
     cuarenta columnas que quedaría vieja a la primera migración que la
     toque. `x.*` deja las columnas de siempre en su mismo orden —que es
     lo que `create or replace view` exige— y las tres nuevas van al
     final.

     NO SE PUEDE `select ... from v_roturas_salidas` dentro de su propio
     `create or replace`: Postgres lo rechaza por referencia circular.
     Por eso se mete la definición entera como subconsulta. */
  v_def := rtrim(btrim(pg_get_viewdef('public.v_roturas_salidas'::regclass, true)), ';');
  execute format($f$
    create or replace view public.v_roturas_salidas as
      select x.*,
             s.reabierta_por, s.reabierta_en, s.reabierta_nota,
             coalesce(s.reaperturas, 0) as reaperturas
        from ( %s ) x
        join public.roturas_salidas s on s.id = x.id
  $f$, v_def);
  raise notice 'La vista ya dice quién reabrió cada salida y cuántas veces.';
end $$;

grant select on public.v_roturas_salidas to authenticated;

do $$
begin
  raise notice '--------------------------------------------------------';
  raise notice 'REABRIR y ANULAR una salida: solo quien MANDA (la casilla';
  raise notice 'del rol, no el nombre «admin»). Reabrir tumba las firmas:';
  raise notice 'una salida que se vuelve a tocar se vuelve a firmar.';
  raise notice 'Lo ya despachado con un viaje no se reabre ni se anula';
  raise notice 'desde aqui: primero se deshace el despacho en Facturacion.';
  raise notice '--------------------------------------------------------';
end $$;

commit;
