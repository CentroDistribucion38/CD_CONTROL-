-- =====================================================================
-- SIDER · AI — QUÉ COBRA Y QUÉ NO
--
-- HAY QUE CORRER ESTE ARCHIVO AUNQUE YA SE HAYA CORRIDO `sider-ai.sql`
-- OTRA VEZ. La siembra de ese módulo trae `on conflict do update` pero
-- NO pisa la columna `cobra` —a propósito: si alguien cambia la política
-- desde el maestro, volver a correr el módulo no debe deshacérselo—. O
-- sea que la corrección de abajo no llega sola. Tiene que venir aquí.
--
-- QUÉ ESTABA MAL. Tres banderas al revés: hongo y etiqueta asoleada
-- cobraban, y mezclado no. Es al contrario.
--
-- POR QUÉ IMPORTA. El índice multiplica las botellas recibidas para
-- sacar el NO ABONO, y esa es la cifra que viaja a SAP. No es un rótulo
-- en una pantalla: es lo que se le descuenta al socio. Sobre las 296
-- revisiones de «BD AI BAQ» —mayo a agosto de 2026— eran 3.600 botellas
-- cobradas de más, un 4,5 %.
--
-- DE DÓNDE SALIÓ EL ERROR. La hoja de Excel tiene DOS sumas de defectos
-- que no son la misma, y yo seguí la que no cobra:
--
--   T   «TOTAL BOTELLAS CON DEFECTOS» = SUM(U:AD)
--       10 categorías: con hongo y etiqueta asoleada, SIN mezclado.
--       Suma 7.427 en las 296 filas.
--
--   M   «% ÍNDICE DE COBRO» = (U+V+W+X+Y+Z+AA+AB+AE)/S
--       9 categorías: con mezclado, SIN hongo ni etiqueta asoleada.
--       Suma 7.140 en las mismas 296 filas.
--
-- La que factura es M, y está idéntica en las 296 filas del archivo: no
-- es el descuido de una fila, es la regla. Las dos columnas conviven en
-- la misma hoja y difieren en 252 de las 296 filas, que es justamente
-- por lo que un número puede leerse en una pantalla y facturarse otro
-- sin que nadie lo note.
--
-- Se puede correr varias veces.
-- =====================================================================

do $$
begin
  if to_regclass('public.sider_ai_defectos') is null then
    raise exception
      'Falta crear el módulo Sider AI. Corre primero supabase/modulos/sider-ai.sql y vuelve a este archivo.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. ANTES DE TOCAR NADA, DECIR QUÉ VA A CAMBIAR
--
-- Una migración que corrige plata no puede pasar en silencio. Si ya hay
-- revisiones guardadas, sus índices cambian al correr esto, y quien la
-- corre tiene que poder ver cuánto ANTES de que el tablero empiece a
-- mostrar cifras distintas a las que se facturaron el mes pasado.
-- ---------------------------------------------------------------------
do $$
declare
  v_revisiones integer;
  v_viejo      bigint;
  v_nuevo      bigint;
begin
  select count(*) into v_revisiones from public.sider_ai_revisiones;
  if v_revisiones = 0 then
    raise notice 'No hay revisiones guardadas todavía: la corrección no cambia ninguna cifra ya facturada.';
    return;
  end if;

  /* El no-abono con las banderas de hoy y con las corregidas, sobre las
     mismas revisiones. Se suman los redondeos por revisión y no el
     total, porque así es como se factura: una orden por viaje. */
  select
    coalesce(sum(round(r.recibidas * v.viejo / r.revisadas)), 0),
    coalesce(sum(round(r.recibidas * v.nuevo / r.revisadas)), 0)
    into v_viejo, v_nuevo
  from public.sider_ai_revisiones r
  join lateral (
    select
      coalesce(sum(k.unidades) filter (where d.cobra), 0)::numeric as viejo,
      coalesce(sum(k.unidades) filter (
        where k.defecto not in ('hongo', 'etiq_asoleada', 'cuerpo_extra', 'cajas_malas', 'estiba_mala')
      ), 0)::numeric as nuevo
    from public.sider_ai_conteos k
    join public.sider_ai_defectos d on d.clave = k.defecto
    where k.revision_id = r.id
  ) v on true
  where r.revisadas > 0;

  raise notice '% revisiones guardadas. No abono: % → % botellas (%).',
    v_revisiones, v_viejo, v_nuevo,
    case when v_viejo = 0 then 'sin base de comparación'
         else round((v_nuevo - v_viejo) * 100.0 / v_viejo, 2)::text || ' %' end;
end $$;


-- ---------------------------------------------------------------------
-- 2. LA CORRECCIÓN
--
-- Las tres, nombradas una por una y no con un `case`: así el diff dice
-- qué cambió sin tener que leer la lógica, y una cuarta bandera que
-- alguien haya cambiado a mano desde el maestro se queda como está.
-- ---------------------------------------------------------------------
update public.sider_ai_defectos set cobra = false where clave = 'hongo'         and cobra;
update public.sider_ai_defectos set cobra = false where clave = 'etiq_asoleada' and cobra;
update public.sider_ai_defectos set cobra = true  where clave = 'mezclado'      and not cobra;


-- ---------------------------------------------------------------------
-- 3. QUE QUEDE COMO DEBE
--
-- Nueve cobran y cinco no. Si el conteo no da, algo más movió las
-- banderas y es mejor que la migración reviente aquí —con el estado a la
-- vista— que dejar el cobro a medio corregir.
-- ---------------------------------------------------------------------
do $$
declare
  v_cobran integer;
  v_lista  text;
begin
  select count(*) filter (where cobra),
         string_agg(clave || case when cobra then '=cobra' else '=no' end, ', ' order by orden)
    into v_cobran, v_lista
    from public.sider_ai_defectos;

  if v_cobran <> 9 then
    raise exception 'Deberían cobrar 9 categorías y cobran %. Estado: %', v_cobran, v_lista;
  end if;

  if exists (select 1 from public.sider_ai_defectos
              where clave in ('hongo', 'etiq_asoleada') and cobra) then
    raise exception 'Hongo o etiqueta asoleada siguen cobrando. Estado: %', v_lista;
  end if;

  if not exists (select 1 from public.sider_ai_defectos where clave = 'mezclado' and cobra) then
    raise exception 'Mezclado sigue sin cobrar. Estado: %', v_lista;
  end if;

  raise notice 'Listo. Cobran 9: %', v_lista;
end $$;
