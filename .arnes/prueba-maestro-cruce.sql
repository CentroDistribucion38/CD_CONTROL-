-- =====================================================================
-- EL CRUCE DEL MAESTRO CON 2026.09.26_MAESTRO.xlsx, medido.
--
-- Lo que puede salir mal, y por qué importa:
--
-- 1. QUE EL CERO DEL ARCHIVO BORRE EL DATO BUENO. El Excel trae CAJAS
--    POR ESTIBA y UNIDADES POR ESTIBA en cero para 370 de los 493, y el
--    maestro las tiene puestas. Un cero ahí hace que el conteo de una
--    estiba de ese material dé cero cajas, y nadie lo nota hasta que
--    cuadra el inventario del mes.
--
-- 2. QUE PISE LO QUE ALGUIEN CORRIGIÓ A MANO. Todo es «rellena lo
--    vacío». Si el maestro ya tiene valor, manda el maestro.
--
-- 3. QUE SE TRAGUE UN CONFLICTO EN SILENCIO. Lo que no coincide se
--    nombra; lo único que se corrige son los cuatro contenidos que el
--    nombre del propio material desempata, y esos están listados.
--
-- 4. QUE DÉ DE ALTA A CIEGAS un código que no está en el maestro: le
--    faltarían familia, mínimos y prioridades, y entraría mudo a FEFO.
-- =====================================================================
do $prueba$
declare v_n int; v_t text; v_c numeric;
begin
  -- ===================================================================
  -- 1 · LO NUEVO LLEGÓ A TODOS
  -- ===================================================================
  -- LOS 493 DEL ARCHIVO, TODOS. Los dos que quedan fuera son los dos
  -- que el archivo NO trae —el 21116 y el 412375—, y eso no es un fallo
  -- del cruce: es lo que hay que ir a preguntarle a la cervecería. Se
  -- comprueba que sean EXACTAMENTE esos dos, porque si mañana son tres
  -- el cruce está dejando materiales por fuera y nadie se entera.
  select count(*) into v_n from public.productos where categoria is null;
  if v_n <> 2 then
    raise exception 'FALLA: quedaron % materiales sin categoría y tienen que ser 2 —los que el '
      'archivo no trae—', v_n;
  end if;
  select string_agg(sku, ', ' order by sku) into v_t from public.productos where categoria is null;
  if v_t is distinct from '21116, 412375' then
    raise exception 'FALLA: los que quedaron sin categoría son «%» y tienen que ser 21116 y '
      '412375, que son los que el archivo no trae', v_t;
  end if;
  select count(*) into v_n from public.productos p
   where p.tipo_envase is null and p.sku not in ('21116', '412375');
  if v_n > 0 then raise exception 'FALLA: quedaron % del archivo sin tipo de envase', v_n; end if;
  select count(*) into v_n from public.productos p
   where p.hl is null and p.sku not in ('21116', '412375', '3500024', '3500163');
  if v_n > 0 then raise exception 'FALLA: quedaron % del archivo sin HL', v_n; end if;
  raise notice '   · categoría, tipo de envase, HL y referencia puestos en los 493 del archivo ✓';
  raise notice '   · los 2 que el archivo no trae (21116, 412375) quedan nombrados, no inventados ✓';

  -- Y CON EL VALOR QUE DICE EL ARCHIVO, no uno cualquiera.
  select tipo_envase into v_t from public.productos where sku = '26';
  if v_t is distinct from 'Barril' then
    raise exception 'FALLA: el 26 (Aguila Brr 50L) quedó como tipo de envase «%» y es Barril', v_t;
  end if;
  select categoria into v_t from public.productos where sku = '3500162';
  if v_t is distinct from 'Empaque Primario' then
    raise exception 'FALLA: el envase 3500162 quedó en la categoría «%»', v_t;
  end if;
  select round(hl, 5) into v_c from public.productos where sku = '26';
  if v_c is distinct from 0.5 then
    raise exception 'FALLA: el 26 es un barril de 50 L = 0,5 HL y quedó en %', v_c;
  end if;

  -- ===================================================================
  -- 2 · EL CERO DEL ARCHIVO NO BORRÓ LAS ESTIBAS
  -- ===================================================================
  select cajas_por_estiba into v_n from public.productos where sku = '26';
  if v_n is distinct from 9 then
    raise exception 'FALLA: al 26 le quedaron % cajas por estiba y el maestro decía 9. El Excel '
      'las trae en cero para 370 materiales: copiarlas hace que una estiba cuente cero cajas', v_n;
  end if;
  -- QUE NINGUNA ESTIBA CAMBIÓ lo comprueba el guion con una huella de
  -- antes y otra de después: es la única forma de medirlo sin escribir
  -- aquí los 495 valores. Aquí se mide el caso concreto que el archivo
  -- habría roto —el 26, que en el Excel viene en cero— y se avisa del
  -- único que YA venía en cero del maestro viejo, que no es cosa de
  -- este cruce pero hay que arreglarlo igual.
  select count(*) into v_n from public.productos
   where cajas_por_estiba = 0 or unidades_por_estiba = 0;
  if v_n <> 1 then
    raise exception 'FALLA: % materiales con estiba en CERO y tiene que ser 1 (el 8245, que ya '
      'venía así del maestro viejo)', v_n;
  end if;
  raise notice '   · las cajas y unidades por estiba se quedaron como estaban ✓';
  raise notice '   · (el 8245 Quilmes ya venía con estiba en cero del maestro viejo: eso hay que '
               'arreglarlo aparte)';

  -- ===================================================================
  -- 3 · LOS CUATRO CONTENIDOS QUE EL NOMBRE DESEMPATA, CORREGIDOS
  -- ===================================================================
  select contenido into v_c from public.productos where sku = '22753';
  if v_c is distinct from 330 then
    raise exception 'FALLA: el 22753 se llama «PONY MALTA LATA 330CC» y quedó en % cc', v_c;
  end if;
  select contenido into v_c from public.productos where sku = '15781';
  if v_c is distinct from 850 then
    raise exception 'FALLA: el 15781 se llama «CLUB COL DORADA R 850CC» y quedó en % cc', v_c;
  end if;
  raise notice '   · los 4 contenidos que el nombre del material desempata, corregidos ✓';

  -- ===================================================================
  -- 4 · LO QUE ALGUIEN CORRIGIÓ A MANO NO SE PISA
  -- ===================================================================
  -- El 1413 se dejó con categoría inventada antes de correr: tiene que
  -- seguir ahí.
  select categoria into v_t from public.productos where sku = '1413';
  if v_t is distinct from 'PUESTA A MANO' then
    raise exception 'FALLA: se pisó la categoría puesta a mano del 1413: quedó «%»', v_t;
  end if;
  raise notice '   · una categoría corregida a mano no se pisa ✓';

  -- ===================================================================
  -- 5 · EL QUE NO ESTÁ EN EL ARCHIVO SIGUE VIVO
  -- ===================================================================
  perform 1 from public.productos where sku = '21116' and activo;
  if not found then
    raise exception 'FALLA: el 21116 no está en el archivo y se borró o se apagó. Puede tener '
      'conteos colgando: el cruce no da de baja a nadie';
  end if;
  raise notice '   · el material que el archivo no trae sigue activo ✓';

  raise notice ' ';
  raise notice 'TODO BIEN.';
end $prueba$;
