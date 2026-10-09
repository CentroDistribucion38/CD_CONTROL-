-- =====================================================================
-- SIDER · REVISIÓN AI: CORREGIR TIENE SU PERMISO, Y ENTRA «ÓXIDO»
--
-- «Que el usuario de AISORTING no pueda corregir la ficha.»
--   Corregir una revisión ya cerrada pasa a ser la casilla «Corregir
--   revisión AI» (`/sider/sorting/corregir`) en Roles y en la ficha de
--   cada persona. Quien MANDA la tiene siempre; a nadie más se le da
--   sola. Cerrar una revisión nueva sigue igual: «editar» en Revisión AI.
--
-- «Y en defectos incluir óxido.»
--   Una fila más en el maestro, y ENTRA AL COBRO. Si no debe cobrar:
--     update public.sider_ai_defectos set cobra = false where clave = 'oxido';
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- 1. ÓXIDO -----------------------------------------------------------
/* Va de último entre los que cobran (orden 15). Entra también a los dos
   totales «de la hoja» —son de lectura: cuántas botellas tenían algún
   defecto—; lo viejo tiene óxido en cero, así que no descuadra nada. */
insert into public.sider_ai_defectos (clave, nombre, cobra, orden, activo)
values ('oxido', 'Óxido', true, 15, true)
on conflict (clave) do update set nombre = excluded.nombre, activo = true;

update public.sider_ai_defectos
   set en_total_hoja = true, en_hl_hoja = true
 where clave = 'oxido';


-- 2. GUARDAR: CORREGIR PIDE SU PROPIO PERMISO ------------------------
-- Copiada de 2026-09-sider-revision-ai-interna.sql con UNA condición más.
-- Misma firma: `create or replace` la reemplaza sin dejar dos versiones.
create or replace function public.sider_ai_guardar(
  p_viaje       uuid,
  p_turno       text,
  p_canal       text,
  p_socio       text,
  p_envase      text,
  p_certificado boolean,
  p_recibidas   integer,
  p_revisadas   integer,
  p_conteos     jsonb,            -- {"rota": 4, "faltante": 0, ...}
  p_zcl3        text default null,
  p_comentarios text default null,
  p_tipo        text default 'ai'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_fecha date; v_placa text; v_planta text;
  v_pidio boolean; v_llego boolean;
  v_clave text; v_n integer; v_suma integer := 0;
  v_nombre text;
begin
  if p_tipo is null or p_tipo not in ('ai', 'sorting') then
    raise exception 'El tipo de revisión tiene que ser ai o sorting';
  end if;
  v_nombre := case p_tipo when 'ai' then 'revisión AI certificada' else 'revisión AI normal' end;

  /* UN SOLO PERMISO PARA LAS DOS REVISIONES. Las dos se hacen en la misma
     pantalla —«Revisión AI»— y las dos cobran, así que ya no hay una que
     un operador pueda guardar «sin querer» y la otra no: quien tiene
     «editar» en esa pantalla guarda las dos, y quien no, ninguna.

     Se sigue aceptando el permiso de antes —editor con «editar» en
     Tránsito— para que el supervisor que hacía la AI dentro de Tránsito
     no pierda nada. `es_editor()` solo, sin mirar la pantalla, NO alcanza:
     es cierto con cualquier «editar» en cualquier módulo. */
  if not (public.puede_editar('/sider/sorting')
          or (public.es_editor() and public.puede_editar('/sider/transito'))) then
    raise exception 'Registrar una revisión requiere permiso de edición en Revisión AI';
  end if;

  /* CORREGIR ES OTRO PERMISO. Cerrar una revisión lo hace quien cuenta;
     cambiarla DESPUÉS de cerrada mueve el cobro al socio y lo hace solo
     quien tiene «Corregir revisión AI» en Roles (el administrador la
     tiene siempre). La pantalla esconde el botón; esto es el candado. */
  if exists (select 1 from public.sider_ai_revisiones
              where viaje_id = p_viaje and tipo = p_tipo)
     and not coalesce(public.puede_editar('/sider/sorting/corregir'), false) then
    raise exception 'Esa revisión ya está cerrada. Corregirla necesita el permiso «Corregir revisión AI»';
  end if;

  select coalesce(v.fecha, v.creado_en::date), v.placa, v.planta,
         case p_tipo when 'ai' then v.requiere_ai else v.requiere_sorting end,
         (v.interno or exists (select 1 from public.sider_certificaciones c
                  where c.viaje_id = v.id and c.punta = 'llegada'))
    into v_fecha, v_placa, v_planta, v_pidio, v_llego
    from public.sider_viajes v where v.id = p_viaje;

  if v_fecha is null then raise exception 'Ese viaje no existe'; end if;
  if not v_pidio then
    raise exception 'Ese viaje no está marcado para %. Un administrador tiene que pedirlo primero (o crearse con el «+» de Vh Interno)', v_nombre;
  end if;
  /* LA REVISIÓN ES DE LO QUE LLEGÓ. Sin certificar la llegada no hay
     camión que revisar. */
  if not v_llego then
    raise exception 'Todavía no está certificada la llegada de ese viaje';
  end if;

  if upper(btrim(coalesce(p_turno, ''))) not in ('T1','T2','T3') then
    raise exception 'El turno tiene que ser T1, T2 o T3';
  end if;
  if coalesce(p_recibidas, 0) <= 0 then
    raise exception 'Hay que decir cuántas botellas llegaron de la referencia a revisar';
  end if;
  if coalesce(p_revisadas, 0) <= 0 then
    raise exception 'Hay que decir cuántas botellas se revisaron';
  end if;
  if p_revisadas > p_recibidas then
    raise exception 'Se revisaron % botellas de % que llegaron: la muestra no puede ser mayor que lo recibido',
      p_revisadas, p_recibidas;
  end if;

  if not exists (select 1 from public.sider_ai_envases where clave = p_envase and activo) then
    raise exception 'Ese tipo de envase no existe o está apagado';
  end if;
  if not exists (select 1 from public.sider_ai_canales where clave = p_canal and activo) then
    raise exception 'Ese canal de envase no existe o está apagado';
  end if;
  if p_canal = 'socios' and nullif(btrim(coalesce(p_socio, '')), '') is null then
    raise exception 'Una revisión del canal Socios tiene que decir de qué socio es';
  end if;
  if p_socio is not null and not exists (
       select 1 from public.sider_ai_socios where clave = p_socio and activo) then
    raise exception 'Ese socio no existe o está apagado';
  end if;

  for v_clave, v_n in select k.key, (k.value)::text::integer
                        from jsonb_each(coalesce(p_conteos, '{}'::jsonb)) k
  loop
    if not exists (select 1 from public.sider_ai_defectos where clave = v_clave and activo) then
      raise exception 'El defecto «%» no existe en el maestro', v_clave;
    end if;
    if v_n < 0 then
      raise exception 'El defecto «%» no puede venir en negativo', v_clave;
    end if;
    v_suma := v_suma + v_n;
  end loop;

  if v_suma > p_revisadas then
    raise exception 'Se marcaron % botellas con defecto de % revisadas', v_suma, p_revisadas;
  end if;

  insert into public.sider_ai_revisiones as r
    (viaje_id, tipo, fecha, planta, placa, turno, canal, socio, envase, certificado,
     recibidas, revisadas, zcl3, comentarios, revisado_por)
  values
    (p_viaje, p_tipo, v_fecha, v_planta, v_placa, upper(btrim(p_turno)),
     p_canal, nullif(btrim(coalesce(p_socio, '')), ''), p_envase,
     coalesce(p_certificado, false),
     p_recibidas, p_revisadas,
     nullif(btrim(coalesce(p_zcl3, '')), ''),
     nullif(btrim(coalesce(p_comentarios, '')), ''),
     auth.uid())
  /* LA LLAVE ES (VIAJE, TIPO): corregir el Sorting reescribe el Sorting y
     no toca la AI del mismo camión, ni al revés. */
  on conflict (viaje_id, tipo) do update set
     turno = excluded.turno, canal = excluded.canal, socio = excluded.socio,
     envase = excluded.envase, certificado = excluded.certificado,
     recibidas = excluded.recibidas, revisadas = excluded.revisadas,
     zcl3 = excluded.zcl3, comentarios = excluded.comentarios,
     editado_por = auth.uid(), editado_en = now(), ediciones = r.ediciones + 1
  returning r.id into v_id;

  delete from public.sider_ai_conteos where revision_id = v_id;
  insert into public.sider_ai_conteos (revision_id, defecto, unidades)
  select v_id, k.key, (k.value)::text::integer
    from jsonb_each(coalesce(p_conteos, '{}'::jsonb)) k
   where (k.value)::text::integer > 0;

  return v_id;
end $$;

grant execute on function public.sider_ai_guardar(
  uuid, text, text, text, text, boolean, integer, integer, jsonb, text, text, text
) to authenticated;


-- 3. COMPROBACIÓN — SE PARA, NO AVISA --------------------------------
do $$
declare v_src text; v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sider_ai_guardar';
  if v_n <> 1 then
    raise exception 'sider_ai_guardar tiene % versiones; debe ser una.', v_n;
  end if;

  select pg_get_functiondef(to_regprocedure(
    'public.sider_ai_guardar(uuid,text,text,text,text,boolean,integer,integer,jsonb,text,text,text)')) into v_src;
  if v_src not like '%/sider/sorting/corregir%' then
    raise exception 'sider_ai_guardar no pide el permiso «Corregir revisión AI».';
  end if;

  if not exists (select 1 from public.sider_ai_defectos where clave = 'oxido' and activo) then
    raise exception 'Óxido no quedó en el maestro de defectos.';
  end if;

  raise notice 'Listo: corregir pide su permiso y Óxido está en el conteo (cobra: %).',
    (select cobra from public.sider_ai_defectos where clave = 'oxido');
end $$;

commit;
