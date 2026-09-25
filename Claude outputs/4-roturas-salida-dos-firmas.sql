-- =====================================================================
-- SALIDA DE VIDRIO · DOS FIRMAS, NO TRES. SE VA VERIFICACIÓN
-- ---------------------------------------------------------------------
-- «Quita lo de Verificación, que solo sean dos firmas, dos procesos:
--  Pesar y Validación, nada más.»
--
-- La cadena queda:
--
--   PESAR       el supervisor (a) pesa tolva por tolva y cierra.
--   VALIDACIÓN  quien valida da el aval y el vidrio sale por la puerta.
--
-- LO QUE NO CAMBIA, Y ES LO QUE IMPORTA: siguen siendo DOS PERSONAS
-- DISTINTAS. Quien pesó no valida. Esa era la razón de ser de la
-- cadena —que nadie firme solo lo que él mismo midió— y no se toca; lo
-- que se quita es el paso de en medio, no el control.
--
-- LO YA VERIFICADO NO SE BORRA. Las columnas verificador_por,
-- verificador_en y verificador_nota se quedan en la tabla con lo que
-- tengan: son el registro de quién verificó qué, y borrarlas dejaría
-- las salidas de los meses pasados sin poder decirlo. Simplemente
-- dejan de pedirse y de contarse.
--
-- LAS SALIDAS QUE ESTABAN ESPERANDO VERIFICACIÓN pasan solas a poder
-- validarse: la validación ya no la exige. No hay que tocar ninguna
-- fila a mano.
--
-- EL ROL «verificador» NO SE BORRA —si es que está—. Puede haber gente
-- con ese rol puesto, y borrarlo los dejaría sin ninguno. Se queda
-- inactivo: no tiene pantalla ni firma que poner, y quien administra
-- decide a qué rol pasa a esa gente. Borrarlo aquí sería decidirlo por
-- él.
--
-- Y SI NO ESTÁ, no pasa nada. En la base de la bodega ese rol nunca se
-- creó: los tres papeles de la cadena se resuelven por PERMISO de
-- pantalla, no por el nombre del rol. Esta migración no falla por eso
-- —una primera versión sí lo hacía, y estaba mal—.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.roturas_salidas') is null then
    raise exception 'Falta supabase/modulos/roturas.sql. Ese va primero.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. FIRMAR: DOS PAPELES
--
-- Va entera y no como un parche: en PostgreSQL no se remienda el cuerpo
-- de una función. Lo que cambia es la rama del verificador —que ahora
-- rechaza— y la de validación, que pasa a colgar de la firma del
-- supervisor (a).
-- ---------------------------------------------------------------------
create or replace function public.salida_firmar(
  p_salida uuid,
  p_papel  text,
  p_nota   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.roturas_salidas%rowtype;
  v_tolvas integer;
  v_nota   text;
begin
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  select * into s from public.roturas_salidas where id = p_salida;
  if not found then raise exception 'Esa salida no existe'; end if;
  if s.estado = 'anulada' then raise exception 'Esa salida está anulada'; end if;

  /* EL VERIFICADOR SE RECHAZA POR NOMBRE, y antes de mirar permisos.

     Si la pantalla vieja se quedara abierta en el computador de
     alguien, o si alguien llamara a la función a mano, el mensaje que
     recibe dice qué pasó —«ya no existe»— en vez de «no tienes el rol»,
     que mandaría a pedirle un permiso a quien administra por una firma
     que no hay que poner. */
  if p_papel = 'verificador' then
    raise exception 'La firma de verificación ya no existe: la salida va de Pesar a Validación, con dos firmas';
  end if;

  if not public.rotura_puede(p_papel) then
    raise exception 'No tienes el rol para poner la firma de %', p_papel;
  end if;

  if p_papel = 'supervisora' then
    select count(*) into v_tolvas
      from public.roturas_salida_tolvas where salida_id = p_salida;
    if v_tolvas = 0 then
      raise exception 'Una salida sin tolvas pesadas no se puede firmar';
    end if;
    if s.supervisora_en is not null then raise exception 'Ya está firmada por el supervisor (a)'; end if;
    update public.roturas_salidas
       set supervisora_por = auth.uid(), supervisora_en = now(),
           supervisora_nota = v_nota, estado = 'cerrada'
     where id = p_salida;

  elsif p_papel = 'validador' then
    /* AHORA CUELGA DE PESAR, no de verificación. Las salidas que
       estaban esperando al verificador pasan solas a poder validarse. */
    if s.supervisora_en is null then
      raise exception 'Todavía no la ha pesado y cerrado el supervisor (a): no hay qué validar';
    end if;

    /* SIGUEN SIENDO DOS PERSONAS. Esta es la regla que hace que la
       cadena sirva de algo, y es la que NO se quita al quitar el paso
       de en medio: quien pesó no se da el aval a sí mismo.

       EL ADMINISTRADOR PASA. Un domingo sin nadie más la bodega no se
       puede quedar parada esperando a que aparezca un segundo par de
       manos; y en pruebas, una sola persona tiene que poder recorrer la
       cadena entera. No se pierde nada: queda escrito quién firmó cada
       una, y la vista marca la salida como firmada por la misma persona
       —v_roturas_salidas.mismo_firmante—, así que la excepción se ve en
       la pantalla en vez de desaparecer. */
    if s.supervisora_por = auth.uid() and public.mi_rol() <> 'admin' then
      raise exception 'Son dos personas y dos momentos: quien pesó no valida';
    end if;
    if s.validador_en is not null then raise exception 'Ya está validada'; end if;
    update public.roturas_salidas
       set validador_por = auth.uid(), validador_en = now(), validador_nota = v_nota
     where id = p_salida;

  else
    raise exception 'Firma desconocida: %', p_papel;
  end if;
end $$;

grant execute on function public.salida_firmar(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. LA VISTA: DOS FIRMAS Y DOS PERSONAS
--
-- `firmas` deja de contar la del verificador —si no, una salida
-- completa diría «2 de 3» para siempre— y `mismo_firmante` compara las
-- dos que quedan.
--
-- Las columnas del verificador SE QUEDAN en la vista: las pantallas de
-- histórico las leen para decir quién verificó lo de antes.
-- ---------------------------------------------------------------------
create or replace view public.v_roturas_salidas as
with tol as (
  select salida_id,
         count(*)                  as tolvas,
         sum(bruto_kg)             as bruto_kg,
         sum(tara_kg)              as tara_kg,
         sum(bruto_kg - tara_kg)   as neto_kg
    from public.roturas_salida_tolvas
   group by salida_id)
select
  s.id,
  s.codigo,
  s.placa,
  s.estado::text                                 as estado,
  s.observacion,
  s.creada_por, s.creada_en,
  s.supervisora_por, s.supervisora_en, s.supervisora_nota,
  s.verificador_por, s.verificador_en, s.verificador_nota,
  s.validador_por, s.validador_en, s.validador_nota,
  s.motivo_anulacion, s.anulada_en, s.anulada_por,
  coalesce(t.tolvas, 0)                          as tolvas,
  coalesce(t.bruto_kg, 0)                        as bruto_kg,
  coalesce(t.tara_kg, 0)                         as tara_kg,
  coalesce(t.neto_kg, 0)                         as neto_kg,
  /* DOS FIRMAS: pesar y validar. */
  ((s.supervisora_en is not null)::int
   + (s.validador_en is not null)::int)          as firmas,
  (s.validador_en is not null)                   as completa,
  /* Y las dos son de personas distintas, salvo que un administrador
     haya puesto las dos. Eso no se prohíbe —hay domingos— pero se dice
     en la pantalla. */
  coalesce(
      (s.supervisora_por is not null and s.supervisora_por = s.validador_por)
  , false)                                       as mismo_firmante
from public.roturas_salidas s
left join tol t on t.salida_id = s.id;

grant select on public.v_roturas_salidas to authenticated;

-- ---------------------------------------------------------------------
-- 3. EL ROL «verificador» SE APAGA, NO SE BORRA
--
-- Si la tabla de roles tiene una columna para apagarlo, se apaga. Si no
-- —los roles del sistema se borran o se quedan—, se le quita el permiso
-- de la pantalla que ya no existe y se deja con lo que tenga. En ningún
-- caso se borra: puede haber gente con ese rol puesto, y borrarlo los
-- dejaría sin ninguno. A quién se pasa esa gente lo decide quien
-- administra, no esta migración.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'roles' and column_name = 'activo') then
    update public.roles set activo = false where clave = 'verificador';
  end if;

  /* La pantalla se va, así que el permiso sobre ella no tiene a qué
     apuntar. Se borra el renglón —no el rol—. */
  if to_regclass('public.rol_permisos') is not null then
    delete from public.rol_permisos where seccion = '/roturas/salida/verificacion';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. LA PORTADA TIENE QUE PODER VER SI ESTE ARCHIVO SE CORRIÓ
--
-- Aquí no nace nada: ni tabla, ni función, ni columna. `salida_firmar`
-- y `v_roturas_salidas` ya existían y siguen existiendo con el mismo
-- nombre — lo único que cambia es lo que HACEN.
--
-- Preguntar por la función diría «ya está» con el archivo sin correr, y
-- esa es la única mentira que la portada no se puede permitir: es la
-- pantalla que existe para no llevar la cuenta a mano.
--
-- Se agrega una cuarta forma: 'dice:esquema.funcion:texto', que mira el
-- código de la función y contesta si contiene ese texto. Sirve para
-- cualquier migración futura que cambie el comportamiento de algo sin
-- crear nada nuevo, que es el caso más incómodo de todos.
-- ---------------------------------------------------------------------
create or replace function public.admin_existe(p_objetos text[])
returns table (objeto text, existe boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare o text; e boolean; v_p text[]; v_src text;
begin
  if not public.manda() then raise exception 'Solo quien administra'; end if;
  foreach o in array coalesce(p_objetos, '{}') loop
    begin
      if o like 'tabla:%' then e := to_regclass(substr(o, 7)) is not null;
      elsif o like 'fn:%' then e := to_regproc(substr(o, 4)) is not null;
      elsif o like 'col:%' then
        /* 'col:public.v_traspasos_viajes.adelantado' → tres pedazos.
           Se parte por puntos y se piden los tres: sin esquema no se
           podría distinguir dos tablas con el mismo nombre. */
        v_p := string_to_array(substr(o, 5), '.');
        e := array_length(v_p, 1) = 3 and exists (
               select 1 from information_schema.columns c
                where c.table_schema = v_p[1]
                  and c.table_name   = v_p[2]
                  and c.column_name  = v_p[3]);
      elsif o like 'dice:%' then
        /* 'dice:public.salida_firmar:un texto'. Se parte en DOS por el
           primer ':' de la derecha del nombre, no por todos: el texto
           buscado puede traer dos puntos adentro. */
        v_p := array[split_part(substr(o, 6), ':', 1),
                     substr(substr(o, 6), length(split_part(substr(o, 6), ':', 1)) + 2)];
        select pg_get_functiondef(p.oid) into v_src
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname || '.' || p.proname = v_p[1]
         limit 1;
        e := v_src is not null and v_p[2] <> '' and position(v_p[2] in v_src) > 0;
      else e := false; end if;
    exception when others then e := true;   -- varias con el mismo nombre: existe
    end;
    objeto := o; existe := e; return next;
  end loop;
end $$;
revoke all on function public.admin_existe(text[]) from public, anon;
grant execute on function public.admin_existe(text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 5. COMPROBACIÓN, AQUÍ MISMO
-- ---------------------------------------------------------------------
do $$
declare
  v_src text;
  v_admin uuid;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'salida_firmar';

  if v_src not like '%La firma de verificación ya no existe%' then
    raise exception 'salida_firmar todavía acepta la firma del verificador';
  end if;
  if v_src like '%Todavía no la ha verificado nadie%' then
    raise exception 'La validación sigue exigiendo la firma del verificador';
  end if;

  /* La vista cuenta DOS firmas: si contara tres, una salida terminada
     diría «2 de 3» para siempre y nadie sabría qué le falta. */
  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_roturas_salidas' and column_name = 'firmas') then
    raise exception 'Falta la columna firmas en v_roturas_salidas';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_roturas_salidas' and column_name = 'verificador_en') then
    raise exception 'Se perdió verificador_en: lo ya verificado tiene que seguir leyéndose';
  end if;

  /* AQUÍ HABÍA UNA COMPROBACIÓN QUE EXIGÍA QUE EL ROL «verificador»
     EXISTIERA, y hacía fallar la migración entera en la base de la
     bodega —donde ese rol nunca se creó—.

     Era un falso positivo puro: esta migración no borra ningún rol. Lo
     único que le hace es apagarlo SI ESTÁ, y un `update` sobre cero
     filas no borra nada. La guardia protegía contra un error que el
     archivo no puede cometer, y a cambio rompía el caso normal de una
     base que nunca tuvo ese rol.

     Se queda escrito porque la lección no es sobre este rol: una
     comprobación que afirma algo del ESTADO ANTERIOR de la base —«esto
     tenía que estar»— no se puede escribir desde dentro de la
     migración, que solo ve el estado final. Lo que sí se puede
     comprobar es lo que la migración hace, y eso es lo que queda
     arriba. */

  /* Y LA PORTADA SABE PREGUNTAR POR LO QUE UNA FUNCIÓN DICE. Se
     comprueba con un texto que está y con uno que no: una forma nueva
     que siempre dijera «sí» sería peor que no tenerla.

     Hay que prestarle un administrador, como en la migración del área:
     admin_existe empieza rechazando a quien no manda, y aquí no hay
     nadie entrando. Se deshace al terminar la transacción. */
  select id into v_admin from public.perfiles where rol = 'admin' and activo limit 1;
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    if not (select existe from public.admin_existe(
              array['dice:public.salida_firmar:La firma de verificación ya no existe'])) then
      raise exception 'admin_existe no reconoce dice: para un texto que sí está en la función';
    end if;
    if (select existe from public.admin_existe(
          array['dice:public.salida_firmar:esto no lo dice en ninguna parte'])) then
      raise exception 'admin_existe dice que sí a un texto que no está';
    end if;
    if (select existe from public.admin_existe(
          array['dice:public.no_existe_esta_funcion:lo que sea'])) then
      raise exception 'admin_existe dice que sí para una función que no existe';
    end if;
  end if;
end $$;

do $$ begin raise notice 'LISTO: la salida va de Pesar a Validacion, con dos firmas y dos personas.'; end $$;
commit;
