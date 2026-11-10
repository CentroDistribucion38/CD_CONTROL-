-- =====================================================================
-- FISCAL NOVIEMBRE 2026 · lunes 09/11 · REABRIR LA HOJA 1 PARA AGREGAR RENGLONES
--
-- Jair Díaz (Bavaria) terminó la hoja 1 y le faltaron renglones. Esto le quita el «terminé» para que
-- vuelva a poder contar en esa hoja (entra a Contar, agrega lo que falta y vuelve a pulsar «Terminé»).
--
--   · No borra ningún renglón ni ninguna aprobación: solo reabre la hoja.
--   · Se puede correr dos veces (la segunda avisa que ya estaba abierta).
--   · Cambia el número de abajo (v_num) si algún día necesitas reabrir otra hoja.
-- =====================================================================
begin;

do $$
declare
  v_num    int := 1;                 -- ← la hoja que se reabre
  v_fiscal uuid;
  v_n      int;
  v_hoja   uuid;
  v_k      int;
begin
  select count(*), max(id::text)::uuid into v_n, v_fiscal
    from public.inv_fiscales
   where fecha = date '2026-11-09' and nombre ilike '%NOVIEMBRE%2026%';
  if v_n <> 1 then
    raise exception 'Esperaba UN inventario fiscal del 09/11/2026 con «NOVIEMBRE 2026» en el nombre y encontré %.', v_n;
  end if;

  select id into v_hoja from public.inv_fiscal_hojas where fiscal_id = v_fiscal and numero = v_num;
  if v_hoja is null then raise exception 'No encuentro la hoja % de ese inventario.', v_num; end if;

  /* Quien terminó la hoja deja de estar «terminado» (y se limpia cualquier pedido de reapertura viejo). */
  delete from public.inv_fiscal_terminos where hoja_id = v_hoja;
  get diagnostics v_k = row_count;
  if to_regclass('public.inv_fiscal_reaperturas') is not null then
    delete from public.inv_fiscal_reaperturas where hoja_id = v_hoja;
  end if;
  /* Si la hoja estaba cerrada del todo, se abre también. */
  update public.inv_fiscal_hojas set cerrada_en = null where id = v_hoja and cerrada_en is not null;

  if v_k = 0 then
    raise notice 'La hoja % ya estaba abierta: nadie tenía «terminé».', v_num;
  else
    raise notice 'Listo: la hoja % está abierta otra vez (% persona(s) pueden volver a contar).', v_num, v_k;
  end if;
end $$;

commit;

-- Cómo quedó: sin filas = nadie tiene «terminé» en la hoja 1.
select h.numero as hoja, p.nombre as persona, t.termino_en
  from public.inv_fiscal_terminos t
  join public.inv_fiscal_hojas h on h.id = t.hoja_id
  join public.inv_fiscales f on f.id = h.fiscal_id
  left join public.perfiles p on p.id = t.user_id
 where f.fecha = date '2026-11-09' and f.nombre ilike '%NOVIEMBRE%2026%' and h.numero = 1;
