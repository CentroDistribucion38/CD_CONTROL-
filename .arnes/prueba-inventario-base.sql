\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- LA LLAVE DE LA BASE DEL CONTEO
--
-- Lo que se comprueba no es «¿se insertó la fila?» sino las cinco cosas
-- que de verdad pueden salir mal:
--
--   · que quien ve el tablero reciba la base, y en 'ver' —nunca en
--     'editar', porque la pantalla no escribe nada—,
--   · que a quien tiene el tablero CERRADO no se le abra,
--   · que a la persona con el tablero cerrado A MANO tampoco —es el
--     caso caro: la base trae más detalle que el tablero—,
--   · que a quien ya tenía la base puesta a mano no se le pise,
--   · y que a quien no tiene nada de Inventario no le aparezca.
-- =====================================================================

do $$
declare
  v_falla text := ''; v_n text;
begin
  /* 1. EL QUE EDITA EL TABLERO RECIBE LA BASE EN 'ver'.
        Si se copiara el nivel del tablero, aquí saldría 'editar' — y
        /admin/roles estaría ofreciendo un nivel que esta pantalla no
        tiene, que se lee como que desde ahí se corrige un renglón. */
  select nivel into v_n from public.rol_permisos
   where rol = 'jefebodega' and seccion = '/inventario/base';
  if v_n is distinct from 'ver' then
    v_falla := v_falla || ' 1(al que edita el tablero le quedo «' || coalesce(v_n, 'nada') || '» y debe ser «ver»)'; end if;

  /* 2. LOS ROLES DE VERDAD, los que trae 02-roles.sql. */
  select count(*)::text into v_n
    from public.rol_permisos p
   where p.seccion = '/inventario' and p.nivel <> 'ninguno'
     and not exists (select 1 from public.rol_permisos q
                      where q.rol = p.rol and q.seccion = '/inventario/base');
  if v_n <> '0' then
    v_falla := v_falla || ' 2(' || v_n || ' rol(es) que ven el tablero se quedaron sin la base)'; end if;

  /* 3. EL ROL CON EL TABLERO CERRADO no puede acabar viéndola. Queda
        escrito en 'ninguno' —no ausente— para que en /admin/roles se
        vea que la decisión está tomada. */
  select nivel into v_n from public.rol_permisos
   where rol = 'cerradorol' and seccion = '/inventario/base';
  if v_n is distinct from 'ninguno' then
    v_falla := v_falla || ' 3(al rol con el tablero cerrado le quedo «' || coalesce(v_n, 'nada') || '»)'; end if;

  /* 4. EL QUE NO TIENE INVENTARIO no recibe nada. Dar una pantalla a
        quien no tiene el módulo es abrir una puerta que nadie pidió. */
  if exists (select 1 from public.rol_permisos
              where rol = 'porteria' and seccion = '/inventario/base') then
    v_falla := v_falla || ' 4(a porteria, que no tiene Inventario, le llego la base)'; end if;

  /* 5. LO PUESTO A MANO NO SE PISA. */
  select nivel into v_n from public.rol_permisos
   where rol = 'yatiene' and seccion = '/inventario/base';
  if v_n is distinct from 'editar' then
    v_falla := v_falla || ' 5(se piso el nivel puesto a mano: quedo «' || coalesce(v_n, 'nada') || '» y era «editar»)'; end if;

  /* 6. LA PERSONA CON EL TABLERO CERRADO A MANO.
        ES EL CASO QUE MÁS IMPORTA. La base trae MÁS detalle que el
        tablero —renglón por renglón, con quién contó y cuándo—, así que
        colársela a quien le cerraron el tablero no sería devolverle lo
        que le quitaron: sería darle de más. */
  select permisos_extra ->> '/inventario/base' into v_n
    from public.perfiles where usuario = 'cerrado';
  if v_n is distinct from 'ninguno' then
    v_falla := v_falla || ' 6(a la persona con el tablero cerrado a mano le quedo «' || coalesce(v_n, 'nada') || '»)'; end if;

  /* 7. LA PERSONA CON EL TABLERO ABIERTO A MANO recibe la base, y en
        'ver' aunque a ella le hayan dado 'editar' en el tablero. */
  select permisos_extra ->> '/inventario/base' into v_n
    from public.perfiles where usuario = 'abierto';
  if v_n is distinct from 'ver' then
    v_falla := v_falla || ' 7(a la persona con el tablero abierto a mano le quedo «' || coalesce(v_n, 'nada') || '» y debe ser «ver»)'; end if;

  /* 8. A QUIEN NO TIENE PERMISOS PROPIOS no se le inventa ninguno.
        Escribirle un permiso propio a quien no lo tenía lo saca del
        rol para siempre: a partir de ahí, cambiar el rol ya no le
        cambia esa pantalla y nadie se acuerda de por qué. */
  select coalesce(permisos_extra::text, 'null') into v_n
    from public.perfiles where usuario = 'normal';
  if v_n not in ('null', '{}') then
    v_falla := v_falla || ' 8(a quien no tenia permisos propios se le invento uno: ' || v_n || ')'; end if;

  if v_falla <> '' then raise exception 'BASE:%', v_falla; end if;
  raise notice 'BASE ok';
end $$;

do $$ begin raise notice 'LA BASE DEL CONTEO: la llave quedó donde tenía que quedar'; end $$;
