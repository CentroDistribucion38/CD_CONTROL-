-- =====================================================================
-- LOS PRECIOS DEL MM60 — lo que la migración tiene que dejar cierto.
-- =====================================================================
do $prueba$
declare n int; v record;
begin
  -- 1 · LAS DOS COLUMNAS
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='productos'
     and column_name in ('precio_botella','envase_sku');
  if n <> 2 then raise exception 'FALLA: faltan columnas de precio (hay %)', n; end if;

  -- 2 · UN PRECIO EN CERO NO ENTRA. Un cobro de cero no se cuestiona.
  begin
    update public.productos set precio_botella = 0 where sku = '2182';
    raise exception 'FALLA: dejo poner un precio en cero';
  exception when check_violation then null;
  end;

  -- 3 · UN ENLACE A UN ENVASE QUE NO EXISTE TAMPOCO
  begin
    update public.productos set envase_sku = 'NO-EXISTE' where sku = '2182';
    raise exception 'FALLA: dejo apuntar a un envase que no existe';
  exception when foreign_key_violation then null;
  end;

  -- 4 · EL EJEMPLO DE CRISTIAN, NÚMERO POR NÚMERO.
  --     2182 Pony Malta: la botella $233,50 y su envase 3500162 $100,00.
  select p.precio_botella as pp, p.envase_sku as es, e.precio_botella as pe
    into v
    from public.productos p
    left join public.productos e on e.sku = p.envase_sku
   where p.sku = '2182';
  raise notice '  · 2182 -> producto $%, envase % $%', v.pp, v.es, v.pe;
  if v.pp <> 233.50 then raise exception 'FALLA: el 2182 quedo en % y vale 233,50', v.pp; end if;
  if v.es <> '3500162' then raise exception 'FALLA: el 2182 apunta a % y va al 3500162', v.es; end if;
  if v.pe <> 100.00 then raise exception 'FALLA: el envase 3500162 quedo en % y vale 100,00', v.pe; end if;

  -- 5 · Y LA CUENTA DE LAS DOS FORMAS DE COBRAR, sobre 6.000 botellas
  --     (200 cajas de 30). Rota: solo el envase. Contaminada: las dos.
  raise notice '  · 6.000 botellas rotas       -> % (solo envase)', 6000 * v.pe;
  raise notice '  · 6.000 botellas contaminadas -> % (envase + producto)', 6000 * (v.pe + v.pp);
  if 6000 * v.pe <> 600000.00 then raise exception 'FALLA: la cuenta del envase no da'; end if;
  if 6000 * (v.pe + v.pp) <> 2001000.00 then raise exception 'FALLA: la cuenta de la contaminada no da'; end if;

  -- 6 · EL NO RETORNABLE NO APUNTA A NINGÚN ENVASE
  select envase_sku into v from public.productos where sku = '23204';
  if v.envase_sku is not null then
    raise exception 'FALLA: al MICHELOB ULTRA (no retornable) se le invento un envase: %', v.envase_sku;
  end if;

  -- 6b · EL QUE SE DIO DE ALTA QUEDÓ COMPLETO. Un envase sin color no
  --      llega a Quiebra en sitio —la restricción roturas_mat_color lo
  --      exige— y se quedaría fuera sin que nadie se entere.
  select tipo_material as tm, color_vidrio as cv, precio_botella as pb
    into v from public.productos where sku = '412375';
  raise notice '  · 412375 -> % vidrio % $%', v.tm, v.cv, v.pb;
  if v.tm <> 'ENVASE' or v.cv <> 'flint' then
    raise exception 'FALLA: el 412375 quedo como % vidrio %', v.tm, v.cv;
  end if;

  -- 7 · LA LISTA DE EN SITIO: 45, y ninguno sin precio
  select count(*) into n from public.productos where en_sitio;
  raise notice '  · en sitio: %', n;
  if n <> 45 then raise exception 'FALLA: quedaron % en sitio y son 45 (32 producto + 13 envase)', n; end if;
  select count(*) into n from public.productos where en_sitio and precio_botella is null;
  if n > 0 then raise exception 'FALLA: % materiales salen en el desplegable sin precio', n; end if;

  -- 8 · Y LOS QUE SALEN, SALIERON
  select count(*) into n from public.productos
   where sku in ('7599','21177','22003','22284','22398','23060') and en_sitio;
  if n > 0 then raise exception 'FALLA: % de los que salen siguen encendidos', n; end if;
  raise notice '  · los 6 que salen quedaron apagados ✓';
end $prueba$;
