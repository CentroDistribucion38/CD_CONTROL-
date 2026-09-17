-- =====================================================================
-- INVENTARIO · TREINTA PERSONAS ABRIENDO CONTEO AL MISMO TIEMPO
--
-- «30 personas pueden contar a la vez.»
--
-- Contar, sí: cada renglón cuelga de su propio recorrido y la llave
-- única lleva el `conteo_id`, así que treinta personas pueden anotar el
-- mismo módulo el mismo día sin pisarse. Eso estaba bien.
--
-- LO QUE NO ESTABA BIEN ERA EMPEZAR. `conteo_fefo_abrir` armaba el
-- código del recorrido así:
--
--     'FEFO-' || hoy || '-' || lpad(1 + (select count(*) ... hoy), 2)
--
-- Un `count(*)` leído fuera de cualquier candado, y `conteos.codigo` es
-- UNIQUE. Treinta personas tocando «Empezar a contar» a las seis de la
-- mañana leen el mismo count, arman el mismo código, y el que llega
-- segundo revienta con «duplicate key value violates unique constraint».
--
-- NO ES TEÓRICO. Se probó con treinta sesiones simultáneas contra un
-- Postgres 16 de verdad: DIECISÉIS DE LAS TREINTA FALLARON. Catorce
-- personas pudieron empezar a contar; las otras dieciséis vieron un
-- error de base de datos al primer toque del turno.
--
-- Y no se habría visto nunca probando de a uno.
--
-- EL ARREGLO: un candado de transacción sobre EL DÍA. Solo serializa el
-- pedacito que lee la cuenta y escribe la fila —microsegundos, una vez
-- por persona y por jornada—; contar, que es lo que se hace las otras
-- ocho horas, no toca este candado ni una vez.
--
-- POR QUÉ UN ADVISORY LOCK Y NO UNA SECUENCIA. Una secuencia daría
-- números que no se reinician cada día, y el código dejaría de decir
-- «el cuarto conteo de hoy», que es lo que la gente lee en voz alta.
-- Y por qué no un reintento sobre el error: porque un reintento que
-- compite con otros veintinueve puede fallar dos y tres veces, y el
-- código quedaría lleno de vueltas para no poner un candado de una
-- línea.
--
-- Se puede correr varias veces.
-- =====================================================================

begin;

do $$
begin
  if to_regproc('public.conteo_fefo_abrir') is null then
    raise exception
      'Falta supabase/migraciones/2026-09-inventario-fefo.sql. Ese va primero.';
  end if;
end $$;


create or replace function public.conteo_fefo_abrir(p_bodega uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_cod text;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar para contar.';
  end if;

  -- El que ya tenga abierto, ese: quien vuelve del almuerzo sigue en su
  -- recorrido en vez de empezar otro y partir la mañana en dos.
  --
  -- VA ANTES DEL CANDADO a propósito: es el caso que ocurre el 99 % de
  -- las veces —se entra a la pantalla y ya hay recorrido— y no tiene por
  -- qué hacer cola detrás de nadie.
  select id into v_id
    from public.conteos
   where responsable_id = auth.uid() and tipo = 'fefo'
     and bodega_id = p_bodega and estado = 'en_proceso'
   order by creado_en desc limit 1;
  if v_id is not null then return v_id; end if;

  /* EL CANDADO DEL DÍA. `pg_advisory_xact_lock` se suelta solo al
     terminar la transacción —no hay forma de olvidarse de soltarlo— y
     es sobre un número, no sobre una fila: no bloquea la tabla, así que
     los otros veintinueve pueden seguir ANOTANDO mientras uno abre.

     El número sale del día, así que dos días distintos no se estorban.
     `hashtext` puede colisionar entre textos distintos, y da igual: dos
     días que compartan hash solo significa que se turnan para crear un
     código, que es lo que ya hacen. */
  perform pg_advisory_xact_lock(hashtext('conteo_fefo_abrir:' || current_date::text));

  /* Y SE VUELVE A MIRAR DESPUÉS DEL CANDADO. Entre la primera consulta
     y el candado pudo entrar el mismo usuario por otra pestaña —pasa:
     el celular en la mano y la tablet del pasillo—. Sin esta segunda
     mirada, esa persona acabaría con dos recorridos abiertos y la mitad
     de sus renglones en cada uno. */
  select id into v_id
    from public.conteos
   where responsable_id = auth.uid() and tipo = 'fefo'
     and bodega_id = p_bodega and estado = 'en_proceso'
   order by creado_en desc limit 1;
  if v_id is not null then return v_id; end if;

  v_cod := 'FEFO-' || to_char(current_date, 'YYYYMMDD') || '-' ||
           lpad((1 + (select count(*) from public.conteos
                       where tipo = 'fefo' and creado_en::date = current_date))::text, 2, '0');

  insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en)
       values (v_cod, p_bodega, 'fefo', 'en_proceso', auth.uid(), now())
    returning id into v_id;
  return v_id;
end $$;

grant execute on function public.conteo_fefo_abrir(uuid) to authenticated;


do $$
begin
  if (select prosrc from pg_proc
       where proname = 'conteo_fefo_abrir' and pronamespace = 'public'::regnamespace)
     not like '%pg_advisory_xact_lock%' then
    raise exception 'El candado no quedó puesto: treinta personas abriendo a la vez seguirían chocando.';
  end if;
  raise notice 'Listo. Abrir conteo está serializado por día; contar no toca ese candado.';
end $$;

commit;
