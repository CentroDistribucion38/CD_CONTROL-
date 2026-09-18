\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL DOCUMENTO: NÚMEROS, Y DIEZ COMO MÁXIMO
--
-- Lo que se comprueba no es «¿existe la regla?» sino las cuatro cosas
-- que de verdad pueden salir mal:
--
--   · que un documento normal siga entrando —la regla no puede trabar
--     el trabajo de todos los días—,
--   · que el de ONCE cifras no entre: es el pegado doble, que NO choca
--     con el índice único porque no es igual a ninguno de los dos, y se
--     queda registrado pareciendo bueno,
--   · que uno con letras no entre,
--   · y que los guiones y espacios NO cuenten como cifra: la regla va
--     sobre `documento_clave`, así que «12-345-678-90» son diez.
-- =====================================================================

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;

do $$
declare
  v_falla text := ''; v_id uuid; v_doc text;
begin
  /* 1. DIEZ CIFRAS JUSTAS: entra. Es el tope, no un número prohibido. */
  begin
    select r.id into v_id from public.traspaso_registrar(
      public.traspaso_hoy(),'A','pet','AAA111','ag01','planta',1,
      false, null, null, null, '1234567890') r;
    select documento_clave into v_doc from public.traspasos_viajes where id = v_id;
    if v_doc is distinct from '1234567890' then
      v_falla := v_falla || ' 1(guardo «' || coalesce(v_doc,'nada') || '»)'; end if;
  exception when others then
    v_falla := v_falla || ' 1b(no dejo entrar un documento de diez cifras: ' || sqlerrm || ')';
  end;

  /* 2. ONCE CIFRAS: no.
        ES EL CASO CARO Y NO ES UN CAPRICHO DE LARGO. Pegar dos
        documentos seguidos da un número que no choca con el índice
        único —no es igual a ninguno de los dos— así que se registra,
        parece bueno, y después no se encuentra buscando por ninguno de
        los dos documentos de verdad. */
  begin
    perform public.traspaso_registrar(
      public.traspaso_hoy(),'A','pet','BBB222','ag01','planta',1,
      false, null, null, null, '12345678901');
    v_falla := v_falla || ' 2(dejo entrar once cifras)';
  exception when others then
    if sqlerrm not like '%documento_diez%' then
      v_falla := v_falla || ' 2b(lo rechazo, pero no por la regla de las diez: ' || sqlerrm || ')'; end if;
  end;

  /* 3. CON LETRAS: no. */
  begin
    perform public.traspaso_registrar(
      public.traspaso_hoy(),'A','pet','CCC333','ag01','planta',1,
      false, null, null, null, 'T-12345');
    v_falla := v_falla || ' 3(dejo entrar un documento con letras)';
  exception when others then
    if sqlerrm not like '%documento_diez%' then
      v_falla := v_falla || ' 3b(lo rechazo, pero no por la regla de las diez: ' || sqlerrm || ')'; end if;
  end;

  /* 4. GUIONES Y ESPACIOS NO CUENTAN.
        La regla va sobre `documento_clave`, que es la versión
        normalizada. Puesta sobre `documento` a secas, «12-345-678-90»
        —que son diez cifras— contaría trece y se rechazaría un
        documento perfectamente bueno.

        Y EL NÚMERO ES OTRO, no el de la prueba 1. Lo escribí con el
        mismo y chocó con el índice único: la prueba salía roja diciendo
        «documento repetido», que es verdad y no tiene nada que ver con
        lo que esta prueba mide. */
  begin
    select r.id into v_id from public.traspaso_registrar(
      public.traspaso_hoy(),'A','pet','DDD444','ag01','planta',1,
      false, null, null, null, '98-765 432-10') r;
    select documento_clave into v_doc from public.traspasos_viajes where id = v_id;
    if v_doc is distinct from '9876543210' then
      v_falla := v_falla || ' 4(la clave quedo «' || coalesce(v_doc,'nada') || '» y debia ser 9876543210)'; end if;
  exception when others then
    v_falla := v_falla || ' 4b(rechazo «98-765 432-10», que son diez cifras: ' || sqlerrm || ')';
  end;

  /* 5. UNA SOLA CIFRA TAMBIÉN VALE. El tope es máximo, no exacto: nadie
        dijo que un documento tenga que llevar diez. */
  begin
    perform public.traspaso_registrar(
      public.traspaso_hoy(),'A','pet','EEE555','ag01','planta',1,
      false, null, null, null, '7');
  exception when others then
    v_falla := v_falla || ' 5(no dejo entrar un documento de una cifra: ' || sqlerrm || ')';
  end;

  /* 6. EL VACÍO SIGUE SIN DOCUMENTO. No es un olvido: un viaje vacío no
        lleva papel, y la regla no puede obligarlo a inventarse uno. */
  begin
    select r.id into v_id from public.traspaso_registrar(
      public.traspaso_hoy(),'B','pet',null,null,null,1, true) r;
    select documento_clave into v_doc from public.traspasos_viajes where id = v_id;
    if v_doc is not null then
      v_falla := v_falla || ' 6(al vacio le quedo documento: ' || v_doc || ')'; end if;
  exception when others then
    v_falla := v_falla || ' 6b(la regla tumbo el viaje vacio: ' || sqlerrm || ')';
  end;

  if v_falla <> '' then raise exception 'DIEZ:%', v_falla; end if;
  raise notice 'DIEZ ok';
end $$;
reset role;

do $$ begin raise notice 'DOCUMENTO DE DIEZ: todo en orden'; end $$;
