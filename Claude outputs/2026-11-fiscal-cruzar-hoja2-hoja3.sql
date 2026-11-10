-- =====================================================================
-- FISCAL NOVIEMBRE 2026 · lunes 09/11 · CRUZAR LA HOJA 2 CON LA HOJA 3
--
-- Lo que pasó: Frideth Garcia (Bavaria) contó en la HOJA 2 y Luis Prens (OL) contó en la HOJA 3.
-- Eran la misma pareja, pero quedaron en hojas distintas y por eso cada hoja decía «solo terminó uno».
--
-- Qué hace (todo o nada):
--   · Pasa TODO lo que contó la persona del OL de la hoja 3 (renglones, fotos, módulos, «terminé»)
--     a la hoja 2. La hoja 2 queda con la pareja completa (OL de la hoja 3 + Bavaria de la hoja 2)
--     y el cruce se calcula solo.
--   · La hoja 3 queda sin nadie y vacía (después la borras desde «Editar parejas y hojas» o la reutilizas).
--   · NO borra ningún renglón contado. Si hay algo que no cuadra (la hoja 2 ya tiene conteo del OL,
--     la hoja 3 tiene conteo de Bavaria, o hay validaciones hechas), se detiene SIN cambiar nada y lo dice.
--
-- Córrelo UNA sola vez: si lo corres otra vez se detiene con un aviso y no cambia nada.
-- =====================================================================
begin;

do $$
declare
  v_fiscal uuid;
  v_n      int;
  v_h2     uuid;
  v_h3     uuid;
  v_ol3    uuid;
  v_ba2    uuid;
  v_k      int;
  v_pasan  int;
  t        text;
begin
  /* 1 · El inventario fiscal: el del lunes 09/11/2026 de noviembre. */
  select count(*), max(id::text)::uuid into v_n, v_fiscal
    from public.inv_fiscales
   where fecha = date '2026-11-09' and nombre ilike '%NOVIEMBRE%2026%';
  if v_n <> 1 then
    raise exception 'Esperaba UN inventario fiscal del 09/11/2026 con «NOVIEMBRE 2026» en el nombre y encontré %.', v_n;
  end if;

  select id into v_h2 from public.inv_fiscal_hojas where fiscal_id = v_fiscal and numero = 2;
  select id into v_h3 from public.inv_fiscal_hojas where fiscal_id = v_fiscal and numero = 3;
  if v_h2 is null or v_h3 is null then
    raise exception 'No encuentro la hoja 2 y la hoja 3 de ese inventario.';
  end if;

  select user_id into v_ol3 from public.inv_fiscal_miembros where hoja_id = v_h3 and equipo = 'OL';
  select user_id into v_ba2 from public.inv_fiscal_miembros where hoja_id = v_h2 and equipo = 'BAVARIA';
  if v_ol3 is null or v_ba2 is null then
    raise exception 'Hace falta el OL de la hoja 3 y Bavaria de la hoja 2 (o ya se cruzaron: corre esto solo una vez).';
  end if;

  /* 2 · Que no se pise nada. */
  select count(*) into v_k from public.inv_fiscal_conteos where hoja_id = v_h2 and equipo = 'OL';
  if v_k > 0 then raise exception 'La hoja 2 ya tiene % renglones contados por el OL: no se mezcla (nada cambió).', v_k; end if;
  select count(*) into v_k from public.inv_fiscal_conteos where hoja_id = v_h3 and equipo = 'BAVARIA';
  if v_k > 0 then raise exception 'La hoja 3 ya tiene % renglones contados por Bavaria: no se mezcla (nada cambió).', v_k; end if;
  select count(*) into v_pasan from public.inv_fiscal_conteos where hoja_id = v_h3 and contado_por = v_ol3;
  if v_pasan = 0 then
    raise exception 'La hoja 3 no tiene renglones del OL para pasar a la hoja 2 (¿ya se hizo?).';
  end if;
  if to_regclass('public.inv_fiscal_revisiones') is not null then
    select count(*) into v_k from public.inv_fiscal_revisiones where hoja_id in (v_h2, v_h3);
    if v_k > 0 then raise exception 'Las hojas 2 y 3 ya tienen % ubicaciones mandadas a validar o aprobadas: no las toco (nada cambió). Avísame.', v_k; end if;
  end if;

  /* 3 · La pareja de la hoja 2 pasa a ser (OL de la hoja 3) + (Bavaria de la hoja 2). */
  update public.inv_fiscal_miembros set user_id = v_ol3 where hoja_id = v_h2 and equipo = 'OL';
  if not found then
    insert into public.inv_fiscal_miembros (hoja_id, fiscal_id, equipo, user_id) values (v_h2, v_fiscal, 'OL', v_ol3);
  end if;
  /* Si el OL era el mismo en las dos hojas y quedó duplicado en una sola, no hay problema: ahora la hoja 3 lo suelta. */
  delete from public.inv_fiscal_miembros where hoja_id = v_h3;

  /* 4 · Lo que contó esa persona se pasa de hoja. Las fotos primero (dependen de los renglones). */
  if to_regclass('public.inv_fiscal_fotos') is not null then
    update public.inv_fiscal_fotos set hoja_id = v_h2
     where hoja_id = v_h3 and conteo_id in (select id from public.inv_fiscal_conteos where hoja_id = v_h3 and contado_por = v_ol3);
  end if;

  /* Un renglón de una hoja terminada no se puede tocar (por eso existe un seguro): se apaga solo mientras se pasa de hoja. */
  alter table public.inv_fiscal_conteos disable trigger user;
  update public.inv_fiscal_conteos set hoja_id = v_h2 where hoja_id = v_h3 and contado_por = v_ol3;
  alter table public.inv_fiscal_conteos enable trigger user;

  foreach t in array array['inv_fiscal_terminos', 'inv_fiscal_modulos', 'inv_fiscal_reaperturas', 'inv_fiscal_revision_envios'] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set hoja_id = $1 where hoja_id = $2 and user_id = $3', t) using v_h2, v_h3, v_ol3;
    end if;
  end loop;

  /* 5 · Aviso por si hay otra tabla del fiscal ligada a la hoja que este arreglo no conoce. */
  for t in
    select c.table_name from information_schema.columns c
     where c.table_schema = 'public' and c.column_name = 'hoja_id' and c.table_name like 'inv\_fiscal\_%'
       and c.table_name not in ('inv_fiscal_miembros', 'inv_fiscal_conteos', 'inv_fiscal_fotos', 'inv_fiscal_terminos',
                                'inv_fiscal_modulos', 'inv_fiscal_reaperturas', 'inv_fiscal_revision_envios', 'inv_fiscal_revisiones')
  loop
    raise notice 'Aviso: la tabla % también tiene hoja_id y no se tocó.', t;
  end loop;

  raise notice 'Listo: % renglones del OL pasaron de la hoja 3 a la hoja 2. Ahora la hoja 2 es la pareja completa.', v_pasan;
end $$;

commit;

-- Cómo quedó (debe ser: hoja 2 con los dos equipos, hoja 3 vacía).
select h.numero as hoja, c.equipo, count(*) as renglones
  from public.inv_fiscal_conteos c
  join public.inv_fiscal_hojas h on h.id = c.hoja_id
  join public.inv_fiscales f on f.id = h.fiscal_id
 where f.fecha = date '2026-11-09' and f.nombre ilike '%NOVIEMBRE%2026%' and h.numero in (2, 3)
 group by h.numero, c.equipo
 order by h.numero, c.equipo;
