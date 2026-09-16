-- =====================================================================
-- ROTURA DE LÍNEA · LA TARJETA DE «TURNOS SIN FIRMAR» DECÍA MENTIRAS
-- ---------------------------------------------------------------------
-- EL SÍNTOMA FUE UN NÚMERO DEMASIADO REDONDO. La tarjeta mostraba
-- exactamente 1000 turnos sin firmar. No 998, no 1013: mil clavado.
-- Un número así no sale de contar turnos, sale de un tope.
--
-- Y ERA UN TOPE. PostgREST —la capa por la que Supabase sirve las
-- tablas— devuelve como mucho 1.000 filas por consulta si nadie le dice
-- otra cosa. v_rotlinea_sin_firma tiene 1.790 filas en 2026: llegaban
-- las primeras mil y el resto no existía para la pantalla. La misma
-- trampa se estaba comiendo el pareto por máquina, que pedía 10.477
-- filas y recibía 1.000 — por eso solo se veían dos máquinas de trece,
-- y el «acumulado» del detalle llegaba al 11,7 % en vez del 100 %.
--
-- LO PEOR DE ESTE ERROR ES QUE NO SE QUEJA. No hay excepción, ni aviso,
-- ni una fila roja: la consulta funciona, devuelve datos, y los datos
-- son un pedazo. Una pantalla que se cae se arregla el mismo día; una
-- que contesta de menos se cree durante meses.
--
-- LA REGLA QUE SE SACA DE AQUÍ, y vale para todo el proyecto: lo que se
-- va a SUMAR se suma en la base. No porque sea más rápido —que lo es—
-- sino porque traerse las filas para sumarlas aquí obliga a acertar con
-- un límite que nadie puso y que nadie ve cuando se queda corto.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- EL RESUMEN: cuántos turnos y cuántas unidades esperan firma
--
-- Devuelve UNA fila. No hay tope que valga sobre una fila.
-- ---------------------------------------------------------------------
/* SE TIRA Y SE VUELVE A CREAR, no «create or replace». Postgres no deja
   cambiarle el tipo de retorno a una función existente, y esta lo
   cambió al pasar de tres columnas a cinco: sin el drop, el archivo
   falla la segunda vez que alguien lo corre —o la primera, si ya venía
   la versión de tres—. */
drop function if exists public.rotlinea_sin_firma_resumen(date, date, smallint);

create function public.rotlinea_sin_firma_resumen(
  p_desde date,
  p_hasta date,
  p_linea smallint default null
)
returns table (turnos bigint, unidades bigint, kg numeric,
               turnos_app bigint, unidades_app bigint)
language sql
stable
set search_path = public
as $$
  /* DOS CIFRAS Y NO UNA, y la segunda es la que importa.
     ---------------------------------------------------------------
     El histórico de 2026 entró por SQL desde el Excel: nadie lo firmó
     nunca y nadie lo va a firmar, porque esos turnos pasaron hace
     meses. Contarlos como «pendientes de firma» convierte la tarjeta
     en un 1.790 permanente, y una alarma que nunca se puede apagar
     deja de leerse a la semana.

     Lo que sí es un pendiente de verdad es un turno REGISTRADO EN LA
     APP que nadie firmó: ese sí tiene a quién reclamarle y sí se
     puede cerrar hoy. La marca que los separa ya existe y no hubo que
     inventarla: las filas importadas tienen registrado_por en nulo
     —no las metió ninguna persona— y las de la app traen el uuid de
     quien las digitó. */
  select count(*)::bigint,
         coalesce(sum(s.und), 0)::bigint,
         coalesce(sum(s.kg), 0),
         count(*) filter (where s.de_la_app)::bigint,
         coalesce(sum(s.und) filter (where s.de_la_app), 0)::bigint
    from (
      select v.fecha, v.linea, v.turno, v.und, v.kg,
             exists (select 1 from public.rotlinea_registro r
                      where r.fecha = v.fecha and r.linea = v.linea
                        and r.turno = v.turno and r.registrado_por is not null)
               as de_la_app
        from public.v_rotlinea_sin_firma v
       where v.fecha between p_desde and p_hasta
         and (p_linea is null or v.linea = p_linea)
    ) s
$$;

grant execute on function public.rotlinea_sin_firma_resumen(date, date, smallint)
  to authenticated;


-- ---------------------------------------------------------------------
-- LOS ÚLTIMOS, para la lista
--
-- La pantalla muestra seis y dice «y 994 más». Los seis salen de aquí
-- ya ordenados y ya recortados; el 994 sale del resumen de arriba.
-- Antes se traían los 1.790 —bueno, 1.000— para mostrar seis.
--
-- MÁS RECIENTES PRIMERO, que es el orden en que le sirven a alguien:
-- un turno sin firmar de anteayer todavía se puede reclamar; uno de
-- marzo ya es historia.
-- ---------------------------------------------------------------------
drop function if exists public.rotlinea_sin_firma_ultimos(date, date, smallint, integer);

create function public.rotlinea_sin_firma_ultimos(
  p_desde date,
  p_hasta date,
  p_linea smallint default null,
  p_cuantos integer default 6
)
returns table (fecha date, linea smallint, turno smallint, und bigint, kg numeric)
language sql
stable
set search_path = public
as $$
  select s.fecha, s.linea, s.turno, s.und, s.kg
    from public.v_rotlinea_sin_firma s
   where s.fecha between p_desde and p_hasta
     and (p_linea is null or s.linea = p_linea)
   order by s.fecha desc, s.linea, s.turno
   limit greatest(coalesce(p_cuantos, 6), 1)
$$;

grant execute on function public.rotlinea_sin_firma_ultimos(date, date, smallint, integer)
  to authenticated;


-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare
  v_falta text := '';
  v_turnos bigint; v_und bigint; v_n integer;
begin
  if to_regprocedure('public.rotlinea_sin_firma_resumen(date, date, smallint)') is null then
    v_falta := v_falta || ' rotlinea_sin_firma_resumen'; end if;
  if to_regprocedure('public.rotlinea_sin_firma_ultimos(date, date, smallint, integer)') is null then
    v_falta := v_falta || ' rotlinea_sin_firma_ultimos'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;

  select turnos, unidades into v_turnos, v_und
    from public.rotlinea_sin_firma_resumen('2026-01-01', '2026-12-31', null);
  select count(*) into v_n
    from public.rotlinea_sin_firma_ultimos('2026-01-01', '2026-12-31', null, 6);

  /* Si esto vuelve a dar mil redondo, sospecha otra vez. */
  raise notice 'Listo: % turnos sin firmar en 2026, % unidades. La lista corta trae %.',
    v_turnos, v_und, v_n;
end $$;
