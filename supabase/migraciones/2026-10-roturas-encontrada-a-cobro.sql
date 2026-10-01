-- =====================================================================
-- ROTURAS EN SITIO · «ME LA ENCONTRÉ» VA DIRECTO A COBRO
-- ---------------------------------------------------------------------
-- «En Quiebra, si yo registro "me la encontré" debe irse de una a cobro
--  al Tablero; allí no se objeta nada.»
--
-- LA CADENA QUEDA ASÍ:
--
--   reportada por OPM → Visto bueno (Easy) ├─ de acuerdo    → cobro
--                                          └─ en desacuerdo → Desacuerdos (ABI)
--   encontrada        → cobro, de una. No pasa por Visto bueno ni por
--                       Desacuerdos: no hay a quién objetarle.
--
-- POR QUÉ TIENE SENTIDO: el visto bueno es el momento en que Easy dice
-- «sí, esa la rompió mi gente» o «no, esa no». Una rotura encontrada ya
-- rota no tiene operario ni reporte: no hay nada que aceptar ni que
-- objetar, y dejarla en la bandeja de Easy solo la llena de roturas
-- que nadie puede discutir.
--
-- DÓNDE SE HACE: en `rotura_marcar_origen`, que es lo que la pantalla
-- llama justo después de registrar. `rotura_registrar` NO se toca (tiene
-- doce argumentos y ciento quince líneas de reglas; reescribirla entera
-- es como se han perdido reglas aquí).
--
-- `estado` SIGUE SIGNIFICANDO LO MISMO —si se cobra o no—: pasa a
-- 'cuenta', con quién y cuándo. La vista ya traduce 'cuenta' como etapa
-- 'cobro', así que el Tablero la ve en cobro sin cambiar nada más. Y NO
-- se le inventa una respuesta de Easy (`ol_respuesta` queda vacía): decir
-- que Easy estuvo de acuerdo sería inventar un acuerdo que nadie dio.
--
-- LAS QUE YA ESTABAN ESPERANDO COMO «ENCONTRADA» TAMBIÉN PASAN a cobro
-- (sección 2): si no, quedarían en una bandeja donde nadie debe tocarlas.
-- Las que Easy ya objetó o ABI ya resolvió NO se tocan.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. MARCAR EL ORIGEN: LA ENCONTRADA SE VA A COBRO
-- ---------------------------------------------------------------------
create or replace function public.rotura_marcar_origen(
  p_id uuid, p_origen text, p_pin text default null)
returns table (opm text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.roturas%rowtype;
  v_id uuid; v_nombre text;
begin
  if p_origen not in ('opm', 'encontrada') then
    raise exception 'El origen es «opm» o «encontrada»';
  end if;

  select * into v from public.roturas r where r.id = p_id for update;
  if not found then raise exception 'Esa rotura no existe'; end if;

  if p_origen = 'opm' then
    select o.id, o.nombre into v_id, v_nombre
      from public.operario_por_pin(p_pin) o;
    if v_id is null then
      raise exception 'Ese PIN no es de ningún operario activo';
    end if;
    /* UNA ENCONTRADA QUE YA FUE A COBRO NO SE «CONVIERTE» EN OPM: se
       saltaría el visto bueno de Easy, que es justo lo que hay que
       pasar. Si se marcó mal, se anula y se registra de nuevo. */
    if v.origen = 'encontrada' and v.estado = 'cuenta' and v.ol_respuesta is null then
      raise exception
        'Esa rotura ya pasó a cobro como «encontrada», sin visto bueno. Si estaba mal marcada, anúlala y regístrala de nuevo';
    end if;
  end if;

  update public.roturas
     set origen = p_origen::rotura_origen, opm_id = v_id
   where id = p_id;

  /* ENCONTRADA → COBRO, DE UNA. Solo si nadie la ha decidido: una que
     Easy ya contestó o ABI ya resolvió no se vuelve a decidir. */
  if p_origen = 'encontrada' and v.estado = 'esperando' and v.ol_respuesta is null then
    update public.roturas
       set estado = 'cuenta',
           decidida_por = auth.uid(), decidida_en = now(),
           nota_decision = 'Encontrada: pasa directo a cobro, sin visto bueno'
     where id = p_id;
  end if;

  return query select v_nombre;
end $$;
grant execute on function public.rotura_marcar_origen(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. LAS QUE YA ESTABAN ESPERANDO COMO «ENCONTRADA»
-- ---------------------------------------------------------------------
do $$
declare v_n int;
begin
  update public.roturas
     set estado = 'cuenta',
         decidida_por = null, decidida_en = now(),
         nota_decision = 'Encontrada: pasa directo a cobro, sin visto bueno'
   where origen = 'encontrada' and estado = 'esperando' and ol_respuesta is null;
  get diagnostics v_n = row_count;
  raise notice '--------------------------------------------------------';
  raise notice 'ENCONTRADA -> COBRO DE UNA: % rotura(s) que esperaban visto bueno pasaron a cobro.', v_n;
  raise notice 'De aqui en adelante, «Me la encontre» va directo a cobro y no se objeta.';
  raise notice '--------------------------------------------------------';
end $$;

commit;
