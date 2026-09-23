/* =====================================================================
   ADMINISTRACIÓN · SE VUELVEN A PONER DOS FRENOS QUE ESTABAN EN «if false»

   Dos funciones quedaron subidas con su comprobación apagada a mano:
   el «if» de verdad cambiado por «if false then», con el aviso intacto
   debajo. Así, el aviso no salía NUNCA.

     1) admin_borrar — no comparaba el conteo.
        Se cuenta lo que hay, se compara con lo que la persona vio en
        pantalla... y se ignoraba. Si alguien registra viajes mientras
        el jefe mira el conteo, esos viajes se borraban sin que nadie
        los hubiera visto.

     2) usuarios_lote — dejaba que uno se apagara a sí mismo.
        La pantalla sí lo frena, pero la base no: quien llamara el RPC
        derecho se podía quitar el rol o desactivar la cuenta y quedar
        fuera de la plataforma, sin nadie adentro que lo volviera a
        entrar.

   Esta migración vuelve a crear las dos funciones con el freno puesto.
   No toca datos, no toca permisos: solo el cuerpo de las dos.

   POR QUÉ ESTÁ ESCRITO ASÍ: las dos son «create or replace», así que
   se puede correr las veces que haga falta y nada se rompe.
   ===================================================================== */
begin;

create or replace function public.admin_borrar(
  p_clave text, p_desde date, p_hasta date, p_confirmacion text, p_esperadas bigint)
returns table (filas bigint, bucket text, rutas text[])
language plpgsql security definer
set search_path = public
as $$
declare c record; v_donde text; v_n bigint; v_x bigint := 0; v_hay bigint; v_rutas text[] := '{}';
begin
  if not public.manda() then raise exception 'Borrar datos es solo de quien administra la plataforma'; end if;
  if coalesce(p_confirmacion, '') <> 'BORRAR' then
    raise exception 'Para borrar hay que escribir BORRAR, en mayúsculas';
  end if;
  select * into c from public.admin_borrado_catalogo() k where k.clave = p_clave;
  if c.clave is null then raise exception 'Ese dato no está en la lista de lo que se puede borrar'; end if;

  select a.filas into v_hay from public.admin_borrado_contar(p_clave, p_desde, p_hasta) a;
  if v_hay is distinct from p_esperadas then
    raise exception 'Mientras mirabas cambió lo que hay: ahora son % filas y viste %. Vuelve a contar antes de borrar',
      v_hay, p_esperadas;
  end if;

  v_donde := public.admin_borrado_donde(c.fecha, p_desde, p_hasta);
  if c.rutas is not null then
    execute format('select coalesce(array_agg(r), ''{}'') from (' || c.rutas || ') x(r)', v_donde) into v_rutas;
  end if;

  execute format('delete from public.%1$I t where %2$s', c.tabla, v_donde);
  get diagnostics v_n = row_count;
  if c.extra is not null then
    execute format('delete from public.%1$I t where %2$s', c.extra,
                   public.admin_borrado_donde('t.fecha', p_desde, p_hasta));
    get diagnostics v_x = row_count;
  end if;

  insert into public.admin_borrados (clave, nombre, desde, hasta, filas, archivos)
  values (c.clave, c.modulo || ' · ' || c.nombre, p_desde, p_hasta, v_n + v_x, coalesce(array_length(v_rutas, 1), 0));

  filas := v_n + v_x; bucket := c.bucket; rutas := v_rutas;
  return next;
end $$;

create or replace function public.usuarios_lote(p_ids uuid[], p_accion text, p_rol text default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n int;
begin
  if not public.manda() then raise exception 'Solo quien administra cambia usuarios'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'No escogiste a nadie'; end if;
  if auth.uid() = any(p_ids) and p_accion in ('rol', 'desactivar') then
    raise exception 'Tú estás en la selección: no puedes cambiarte el rol ni desactivarte desde aquí. Quítate de la selección';
  end if;
  if p_accion = 'rol' then
    if not exists (select 1 from public.roles where clave = p_rol) then raise exception 'Ese rol no existe'; end if;
    update public.perfiles set rol = p_rol where id = any(p_ids);
  elsif p_accion = 'activar' then
    update public.perfiles set activo = true where id = any(p_ids);
  elsif p_accion = 'desactivar' then
    update public.perfiles set activo = false where id = any(p_ids);
  else
    raise exception 'Acción desconocida: %', p_accion;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

/* ---------- que quede dicho que el freno quedó puesto ---------- */
do $v$
declare f text;
begin
  select pg_get_functiondef(p.oid) into f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_borrar';
  if f is null or f like '%if false then%' then
    raise exception 'admin_borrar quedó sin el freno del conteo';
  end if;

  select pg_get_functiondef(p.oid) into f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'usuarios_lote';
  if f is null or f like '%if false then%' then
    raise exception 'usuarios_lote quedó sin el freno de no apagarse a uno mismo';
  end if;
end
$v$;

do $$ begin raise notice 'LISTO: los dos frenos de administración vuelven a estar puestos.'; end $$;
commit;
