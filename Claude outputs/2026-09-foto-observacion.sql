-- =====================================================================
-- LA FOTO DE LA OBSERVACIÓN EN LA LLEGADA
--
-- Hasta ahora una llegada podía dejar dicho "llegó con el sello roto",
-- pero no PROBARLO: la nota era texto suelto y las tres ranuras de foto
-- estaban tomadas por el costado izquierdo, el derecho y la placa.
-- Quien revisa un mes después tiene la palabra de alguien y nada más.
--
-- Esto agrega UNA ranura opcional más, la de la observación. Opcional de
-- verdad: se puede escribir la nota sin foto (a veces no hay nada que
-- fotografiar: llegó tarde, el conductor no era el mismo) y se puede
-- certificar sin nota y sin foto, igual que hoy.
--
-- LO QUE NO CAMBIA, Y ES LO IMPORTANTE
-- El contador de la Fuente principal sigue diciendo "3 de 3" y no
-- "4 de 3". Las tres fotos obligatorias son una cosa —la evidencia
-- mínima de que el viaje ocurrió— y la observación es otra. Si la foto
-- de la observación entrara en el mismo número, un viaje con las tres
-- fotos y una observación se vería MÁS completo que uno con las tres
-- fotos y sin problemas, que es exactamente al revés de la verdad.
-- Por eso el contador pasa a contar solo las tres ranuras de siempre y
-- la observación se guarda aparte, en su propia columna.
--
-- Correr en el editor SQL de Supabase. Se puede correr dos veces sin
-- romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La ranura nueva.
--
-- 'add value' dentro de una transacción está permitido desde Postgres 12
-- SIEMPRE Y CUANDO el valor nuevo no se USE en esa misma transacción. Por
-- eso más abajo no se escribe 'observacion' en ninguna consulta: se
-- pregunta por las TRES DE SIEMPRE y lo demás es la observación. No es
-- rodeo: es lo que permite pegar este archivo entero de una sola vez.
-- ---------------------------------------------------------------------
alter type ranura_foto add value if not exists 'observacion';

-- ---------------------------------------------------------------------
-- 2. Dónde se guarda que la observación trae foto.
--
-- Un booleano y no un conteo porque la regla del negocio es "una sola":
-- el unique (certificacion_id, ranura) que ya existe no deja meter dos,
-- así que un número solo podría valer 0 o 1 y se leería peor.
-- ---------------------------------------------------------------------
alter table public.sider_certificaciones
  add column if not exists foto_obs boolean not null default false;

comment on column public.sider_certificaciones.foto_obs is
  'La observación de esta punta trae foto. Va aparte de "fotos" para que '
  'el contador de la Fuente principal siga siendo sobre 3 y no sobre 4.';

-- ---------------------------------------------------------------------
-- 3. El disparador que mantiene los dos números al día.
--
-- Es el mismo de antes con dos cambios: 'fotos' ahora cuenta SOLO las
-- tres obligatorias, y se llena 'foto_obs' de paso. Se recalcula entero
-- en vez de sumar y restar porque recontar tres filas no cuesta nada y
-- un contador que se lleva a mano se desfasa el día que alguien borra
-- una foto por fuera de la aplicación.
-- ---------------------------------------------------------------------
create or replace function public.sider_fotos_contar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sider_certificaciones c
     set fotos = (select count(*) from public.sider_fotos f
                   where f.certificacion_id = c.id
                     and f.ranura in ('costado_izq', 'costado_der', 'placa')),
         foto_obs = exists (select 1 from public.sider_fotos f
                             where f.certificacion_id = c.id
                               and f.ranura not in ('costado_izq', 'costado_der', 'placa'))
   where c.id = coalesce(new.certificacion_id, old.certificacion_id);
  return null;
end $$;

drop trigger if exists sider_fotos_contar_tg on public.sider_fotos;
create trigger sider_fotos_contar_tg
  after insert or delete or update of certificacion_id on public.sider_fotos
  for each row execute function public.sider_fotos_contar();

-- ---------------------------------------------------------------------
-- 4. Poner al día lo que ya está guardado.
--
-- Hoy no hay ninguna foto de observación, así que esto no debería mover
-- ni una fila; se deja porque correr la migración después de que alguien
-- haya subido una tiene que dejar los números bien igual, y porque el
-- "is distinct from" hace que no reescriba la tabla entera al repetirla.
-- ---------------------------------------------------------------------
update public.sider_certificaciones c
   set fotos = x.n, foto_obs = x.obs
  from (
    select c2.id,
           (select count(*) from public.sider_fotos f
             where f.certificacion_id = c2.id
               and f.ranura in ('costado_izq', 'costado_der', 'placa')) as n,
           exists (select 1 from public.sider_fotos f
                    where f.certificacion_id = c2.id
                      and f.ranura not in ('costado_izq', 'costado_der', 'placa')) as obs
      from public.sider_certificaciones c2
  ) x
 where x.id = c.id
   and (c.fotos is distinct from x.n or c.foto_obs is distinct from x.obs);

-- ---------------------------------------------------------------------
-- 5. La observación es SOLO de la llegada, y la base lo hace cumplir.
--
-- No es una manía de orden. sider_certificar_llegada() decide si la
-- salida está probada así:
--
--     select count(*) from sider_fotos ... where punta = 'salida' < 3
--
-- cuenta FILAS, no ranuras. El día que una salida guardara una foto de
-- observación, un vehículo con dos fotos de verdad más la observación
-- daría 3 y pasaría la tranca: se cerraría un viaje sin evidencia
-- completa y nadie lo notaría, porque el número diría 3.
--
-- Se puede arreglar de dos formas: cambiando esa cuenta dentro de la
-- función, o impidiendo que el caso exista. Se hace lo segundo porque
-- la función vive en dos archivos y reescribirla desde aquí es la
-- receta para pisar una versión más nueva con una vieja. Esto es un
-- objeto pequeño, aparte, que no toca nada de lo que ya está.
--
-- Si algún día la salida también lleva observación con foto, hay que
-- quitar este disparador Y arreglar esa cuenta en la función, en ese
-- orden y las dos cosas.
-- ---------------------------------------------------------------------
create or replace function public.sider_foto_ranura_de_su_punta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ranura not in ('costado_izq', 'costado_der', 'placa')
     and (select c.punta from public.sider_certificaciones c
           where c.id = new.certificacion_id) = 'salida' then
    raise exception 'La foto de observación es de la llegada, no de la salida.';
  end if;
  return new;
end $$;

drop trigger if exists sider_fotos_ranura_tg on public.sider_fotos;
create trigger sider_fotos_ranura_tg
  before insert or update of ranura, certificacion_id on public.sider_fotos
  for each row execute function public.sider_foto_ranura_de_su_punta();

-- ---------------------------------------------------------------------
-- 6. Comprobación.
--
-- Debe devolver una fila con todo en 'ok'. Si alguna dice 'MAL', no
-- sigas: avísame antes de que alguien certifique una llegada.
-- ---------------------------------------------------------------------
do $$
declare
  v_enum  boolean;
  v_col   boolean;
  v_malos integer;
begin
  /* Se pregunta por el CATÁLOGO y no con enum_range(...)::text[]: comparar
     contra el literal 'observacion' hace que Postgres lo convierta al tipo
     enum, y eso es "usar" el valor nuevo —prohibido en la misma
     transacción en que se agregó—. Con esta consulta el archivo entero se
     puede pegar de una sola vez en el editor de Supabase. Lo encontré
     corriéndolo con --single-transaction, no leyéndolo. */
  select exists (select 1 from pg_enum e
                   join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'ranura_foto'
                    and e.enumlabel = 'observacion') into v_enum;

  select exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = 'sider_certificaciones'
                    and column_name = 'foto_obs') into v_col;

  select count(*) into v_malos
    from public.sider_certificaciones c
   where c.fotos <> (select count(*) from public.sider_fotos f
                      where f.certificacion_id = c.id
                        and f.ranura in ('costado_izq', 'costado_der', 'placa'));

  raise notice 'ranura observacion ....... %', case when v_enum then 'ok' else 'MAL' end;
  raise notice 'columna foto_obs ......... %', case when v_col  then 'ok' else 'MAL' end;
  raise notice 'contadores cuadrados ..... %', case when v_malos = 0 then 'ok'
                                                    else 'MAL (' || v_malos || ' descuadrados)' end;
end $$;
