-- =====================================================================
-- TRASPASOS · EL SKU Y LAS ESTIBAS SOLO EN CASCO DE VIDRIO
--
-- «Solo era para casco de vidrio, no para el resto.» El SQL del material
-- marcó también Envase. Esto lo deja solo en Casco de vidrio; los demás
-- tipos (Envase, Plástico…) se registran como siempre, sin SKU.
-- Se puede correr las veces que sea.
-- =====================================================================
begin;

update public.traspasos_tipos
   set materiales = null
 where materiales = 'casco'
   and not (clave = 'casco_vidrio' or nombre ilike 'casco%vidrio%');

do $$
declare v_t text;
begin
  select string_agg(nombre, ', ' order by nombre) into v_t
    from public.traspasos_tipos where materiales = 'casco';
  raise notice 'PIDEN SKU DEL CASCO: %', coalesce(v_t, '(ninguno)');
end $$;

notify pgrst, 'reload schema';
commit;
