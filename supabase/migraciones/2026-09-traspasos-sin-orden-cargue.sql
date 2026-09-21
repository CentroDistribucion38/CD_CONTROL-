-- =====================================================================
-- TRASPASOS · LA ORDEN DE CARGUE DEJA DE PEDIRSE AL REGISTRAR
-- ---------------------------------------------------------------------
-- «En el registro de traspaso elimina orden de cargue.»
--
-- El número que se cruza con SAP es el de FACTURACIÓN, que lo pone al
-- confirmar la salida (2026-09-traspasos-facturacion.sql). La orden de
-- cargue del patio ya no la usa nadie para cruzar: pedirla solo frenaba
-- el registro. Este archivo vuelve a crear registrar y corregir,
-- iguales a los de 2026-09-traspasos-documento.sql, sin exigir el
-- documento. La columna y lo que ya se guardó se quedan como están.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('public.traspaso_documento_donde(text)') is null then
    raise exception 'Falta supabase/migraciones/2026-09-traspasos-documento.sql. Ese va primero.';
  end if;
end $$;

create or replace function public.traspaso_registrar(
  p_fecha    date,
  p_turno    text,
  p_tipo     text,
  p_placa    text,
  p_origen   text,
  p_destino  text,
  p_viajes   integer default 1,
  p_vacio    boolean default false,
  p_carga    integer default null,
  p_unidad   text    default null,
  p_nota     text    default null,
  p_documento text   default null
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_cod text; v_placa text; v_doc text;
  v_o text; v_d text; v_ot text; v_dt text;
  v_hoy date; v_turno text; v_hora timestamptz; v_atras integer;
begin
  if not public.es_editor() then
    raise exception 'Registrar un viaje requiere rol de supervisor o administrador';
  end if;

  v_turno := upper(btrim(coalesce(p_turno, '')));
  if v_turno not in ('A','B','C') then
    raise exception 'El turno tiene que ser A, B o C';
  end if;

  if coalesce(p_viajes, 1) < 1 then
    raise exception 'Un registro tiene que representar al menos un viaje';
  end if;

  /* ------------------------------------------------------------------
     LA FECHA.

     HACIA ADELANTE, CERRADO. Un viaje que no ha salido no se registra,
     se planea: son dos pantallas distintas justamente porque son dos
     cosas distintas. Sin este tope, un dedo que escribe 2027 en vez de
     2026 mete un cumplido que ningún informe vuelve a mirar.

     HACIA ATRÁS, ABIERTO —con un tope de un año contra el error de
     dedo, que no es lo mismo que un permiso—. El administrador pasa
     por encima de ese tope: si dice que la fecha es correcta, es
     correcta. */
  if p_fecha is null then
    raise exception 'Hay que decir de qué día es el viaje';
  end if;

  v_hoy := public.traspaso_hoy();

  if p_fecha > v_hoy then
    raise exception 'No se puede registrar un viaje de % : todavía no ha pasado. Lo de adelante va en Planear',
      to_char(p_fecha, 'DD/MM/YYYY');
  end if;

  v_atras := v_hoy - p_fecha;

  if v_atras > 365 and coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Esa fecha tiene más de un año (%). Si de verdad es correcta, tiene que meterla un administrador',
      to_char(p_fecha, 'DD/MM/YYYY');
  end if;

  /* LA HORA. Hoy, la de verdad; otro día, el arranque de su turno.
     Ponerle now() a un viaje de la semana pasada es escribir un dato
     falso en una columna que se llama "hora". */
  v_hora := case when v_atras = 0 then now()
                 else public.traspaso_arranque_turno(p_fecha, v_turno) end;

  /* ------------------------------------------------------------------
     EL REGISTRO DE VACÍOS es corto a propósito: es un número de viajes
     por turno y ya. No lleva tipo, ni placa, ni ruta, NI DOCUMENTO —
     pedirlos obligaría a inventarlos, y datos inventados son peores
     que datos que faltan. */
  if p_vacio then
    v_cod := 'TR-' || lpad(nextval('public.traspasos_codigo_seq')::text, 4, '0');
    insert into public.traspasos_viajes
      (codigo, fecha, turno, viajes, vacio, nota, hora, registrado_por)
    values
      (v_cod, p_fecha, v_turno, coalesce(p_viajes, 1), true,
       nullif(btrim(coalesce(p_nota, '')), ''), v_hora, auth.uid())
    returning traspasos_viajes.id into v_id;
    return query select v_id, v_cod;
    return;
  end if;

  /* ------------------------------------------------------------------ */
  if not exists (select 1 from public.traspasos_tipos
                  where clave = p_tipo and activo) then
    raise exception 'Ese tipo de viaje no existe o está desactivado';
  end if;

  v_placa := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_placa = '' then
    raise exception 'Hay que decir la placa del vehículo';
  end if;

  /* EL DOCUMENTO. Se guarda en mayúscula y sin espacios de sobra —tal
     como está en el papel por lo demás—, y lo que decide si dos son el
     mismo es la columna generada, no esto. */
  /* LA ORDEN DE CARGUE YA NO SE PIDE AL REGISTRAR: «en el registro de
     traspaso elimina orden de cargue». Si alguna llamada la manda, se
     guarda y se sigue cuidando que no se repita; si no, queda vacía. */
  v_doc := nullif(upper(btrim(coalesce(p_documento, ''))), '');

  /* La comprobación amable: dice CUÁL viaje ya lo tiene. No es el
     candado —ese es el índice, más abajo, y es el que aguanta dos
     personas digitando a la vez—; es para que el mensaje sirva. */
  if v_doc is not null and public.traspaso_documento_donde(v_doc) is not null then
    raise exception '%', public.traspaso_documento_donde(v_doc);
  end if;

  /* El punto se busca en el maestro. Si está, se guarda la clave —que
     es lo que agrupa los informes—; si no, se guarda el texto marcado,
     para que el viaje se registre igual y el punto aparezca en la lista
     de "faltan en el maestro". */
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

  /* REGLA 2, también para lo escrito a mano: "Ag01" y "ag 01" son el
     mismo sitio aunque el maestro no los tenga. */
  if upper(regexp_replace(coalesce(v_o, v_ot), '[^A-Za-z0-9]', '', 'g'))
   = upper(regexp_replace(coalesce(v_d, v_dt), '[^A-Za-z0-9]', '', 'g')) then
    raise exception 'El viaje sale y llega al mismo sitio. Revisa el origen y el destino';
  end if;

  v_cod := 'TR-' || lpad(nextval('public.traspasos_codigo_seq')::text, 4, '0');

  /* EL CANDADO DE VERDAD. Entre el `if` de arriba y este insert caben
     microsegundos, y en esos microsegundos entra el otro supervisor.
     El índice no tiene ese hueco; lo que se hace aquí es traducir su
     error a algo que se pueda leer de pie al lado del camión. */
  begin
    insert into public.traspasos_viajes
      (codigo, fecha, turno, tipo, placa, documento, origen, destino,
       origen_texto, destino_texto, viajes, vacio, carga, unidad, nota,
       hora, registrado_por)
    values
      (v_cod, p_fecha, v_turno, p_tipo, v_placa, v_doc, v_o, v_d,
       v_ot, v_dt, coalesce(p_viajes, 1), false,
       p_carga, nullif(btrim(coalesce(p_unidad, '')), ''),
       nullif(btrim(coalesce(p_nota, '')), ''), v_hora, auth.uid())
    returning traspasos_viajes.id into v_id;
  exception when unique_violation then
    raise exception '%', coalesce(
      public.traspaso_documento_donde(v_doc),
      'Ese documento ya está registrado en otro viaje.');
  end;

  return query select v_id, v_cod;
end $$;

grant execute on function
  public.traspaso_registrar(date, text, text, text, text, text, integer, boolean, integer, text, text, text)
to authenticated;



create or replace function public.traspaso_editar_viaje(
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
  p_motivo  text    default null,
  p_documento text  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes  jsonb;
  v_estado traspaso_estado;
  v_placa  text; v_doc text;
  v_o text; v_d text; v_ot text; v_dt text;
begin
  /* COALESCE, Y NO ES ADORNO. mi_rol() devuelve NULL para quien no
     tiene perfil —una cuenta recién creada, un perfil borrado—, y en SQL
     `null <> 'admin'` no es cierto NI falso: es NULL, así que el `if` no
     dispara y la función SIGUE DE LARGO. El candado se abría justo para
     el caso que menos se conoce. Lo cazó la prueba, no el ojo. */
  if coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Corregir un viaje registrado es solo del administrador. Si te equivocaste al registrar, anúlalo y vuelve a registrarlo';
  end if;

  select to_jsonb(v), v.estado into v_antes, v_estado
    from public.traspasos_viajes v where v.id = p_id;
  if v_antes is null then raise exception 'Ese viaje no existe'; end if;

  /* UN VIAJE ANULADO NO SE EDITA. Corregir algo que ya se declaró que
     no pasó deja una fila que se contradice a sí misma. */
  if v_estado = 'anulado' then
    raise exception 'Ese viaje está anulado. Un viaje anulado no se corrige: se registra de nuevo';
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
     VIAJE VACÍO. No lleva tipo, ni placa, ni ruta, ni documento: se
     limpian en vez de dejarlos como estaban. Un vacío que conserva el
     documento del viaje con carga que fue antes es un dato que miente
     —y peor: es un documento ocupado por un viaje que no lo tiene—. */
  if p_vacio then
    update public.traspasos_viajes
       set fecha = p_fecha, turno = upper(btrim(p_turno)),
           tipo = null, placa = null, documento = null,
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

    /* Opcional: la pantalla manda la que el viaje ya tenía, para no
       borrársela al corregir otra cosa. */
    v_doc := nullif(upper(btrim(coalesce(p_documento, ''))), '');

    /* «Ya está en otro viaje» — EN OTRO. Guardar el viaje sin cambiarle
       el documento no puede fallar contra sí mismo, que es el error que
       convierte «corregir la placa» en imposible. */
    if exists (
      select 1 from public.traspasos_viajes w
       where w.estado = 'registrado' and w.id <> p_id
         and w.documento_clave
           = nullif(upper(regexp_replace(v_doc, '[^A-Za-z0-9]', '', 'g')), '')
    ) then
      raise exception '%', public.traspaso_documento_donde(v_doc);
    end if;

    /* LAS MISMAS REGLAS QUE AL REGISTRAR, y salen de las mismas
       funciones. */
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

    begin
      update public.traspasos_viajes
         set fecha = p_fecha, turno = upper(btrim(p_turno)),
             tipo = p_tipo, placa = v_placa, documento = v_doc,
             origen = v_o, destino = v_d, origen_texto = v_ot, destino_texto = v_dt,
             viajes = coalesce(p_viajes, 1), vacio = false,
             carga = p_carga, unidad = nullif(btrim(coalesce(p_unidad, '')), ''),
             nota = nullif(btrim(coalesce(p_nota, '')), ''),
             editado_en = now(), editado_por = auth.uid(), ediciones = ediciones + 1
       where id = p_id;
    exception when unique_violation then
      raise exception '%', coalesce(
        public.traspaso_documento_donde(v_doc),
        'Ese documento ya está registrado en otro viaje.');
    end;
  end if;

  /* ------------------------------------------------------------------
     EL RASTRO. Va después del update para poder guardar el DESPUÉS de
     verdad —lo que quedó en la tabla— y no lo que se pidió. */
  insert into public.traspasos_viajes_ediciones (viaje, editado_por, motivo, antes, despues)
  select p_id, auth.uid(), nullif(btrim(coalesce(p_motivo, '')), ''),
         v_antes, to_jsonb(v)
    from public.traspasos_viajes v where v.id = p_id;
end $$;

revoke all on function public.traspaso_editar_viaje(
  uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text, text)
  from public, anon;
grant execute on function public.traspaso_editar_viaje(
  uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text, text)
  to authenticated;


commit;
