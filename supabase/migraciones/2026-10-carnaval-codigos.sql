-- =====================================================================
-- CUADRE SAP · AG07 CARNAVAL · INVENTARIO AMARRADO A LOS SKU
--
-- Cada renglón de la hoja «Existencias diarias» lleva el CÓDIGO del maestro de SKU y su descripción sale del maestro, no de lo que
-- escriba la hoja o lea la foto. La equivalencia «sección + nombre en la hoja → código» se guarda aquí y se aprende: lo que se
-- asigna una vez en pantalla queda para todos los días. El código «-» quiere decir «este renglón no es un SKU» (estibas de madera…).
--
-- La semilla de abajo es el emparejamiento contra el maestro de CONTROL y los códigos que usa Casco de vidrio; cualquiera se corrige desde la pantalla (Inventario → columna
-- Código). Se puede correr varias veces: no pisa lo que ya se haya asignado a mano.
-- =====================================================================
begin;

create table if not exists public.carnaval_equivalencias (
  seccion        text not null,                 -- título de la sección, sin tildes y en minúscula
  concepto       text not null,                 -- nombre del renglón en la hoja, sin tildes y en minúscula
  codigo         text not null,                 -- SKU del maestro, o «-» si el renglón no es un SKU
  actualizado_por uuid default auth.uid(),
  actualizado_en timestamptz not null default now(),
  primary key (seccion, concepto)
);

alter table public.carnaval_equivalencias enable row level security;
drop policy if exists carnaval_eq_ver on public.carnaval_equivalencias;
create policy carnaval_eq_ver on public.carnaval_equivalencias for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno');
drop policy if exists carnaval_eq_ins on public.carnaval_equivalencias;
create policy carnaval_eq_ins on public.carnaval_equivalencias for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists carnaval_eq_upd on public.carnaval_equivalencias;
create policy carnaval_eq_upd on public.carnaval_equivalencias for update
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar')
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
grant select, insert, update on public.carnaval_equivalencias to authenticated;

-- Semilla (solo lo que se deduce con seguridad del nombre; lo demás se elige en pantalla)
insert into public.carnaval_equivalencias (seccion, concepto, codigo) values
  ('caja mala', 'caja plastica cafe 225cc x 38', '3500231'),
  ('caja mala', 'caja plastica cafe 330cc x 30', '3500159'),
  ('caja mala', 'caja plastica marron 1000cc x13', '3501211'),
  ('caja mala', 'caja plastica marron 250cc x38', '3501224'),
  ('caja plastica', 'caja plastica cafe 225cc x 38', '3500231'),
  ('caja plastica', 'caja plastica cafe 330cc x 30', '3500159'),
  ('caja plastica', 'caja plastica marron 1000cc x13', '3501211'),
  ('caja plastica', 'caja plastica marron 250cc x38', '3501224'),
  ('caja plastica', 'caja plastica marron 750cc x 16', '3500374'),
  ('casco de vidrio b38', 'envase budweiser 250 casco vidrio', '3503016'),
  ('casco de vidrio b38', 'envase corona 330 caja 330', '3503486'),
  ('casco de vidrio b38', 'envase coronita 210 caja 225', '421887'),
  ('casco de vidrio b38', 'envase coronita 210 caja 250', '421887'),
  ('casco de vidrio b38', 'envase coronita 210 caja 330', '421887'),
  ('casco de vidrio b38', 'envase costena bacana', '3501430'),
  ('casco de vidrio b38', 'envase costenita 175r', '3500005'),
  ('casco de vidrio b38', 'envase flint 1000r', '3500887'),
  ('casco de vidrio b38', 'envase flint 175', '3500472'),
  ('casco de vidrio b38', 'envase flint 250', '3501225'),
  ('casco de vidrio b38', 'envase flint 250 caja 330', '3501225'),
  ('casco de vidrio b38', 'envase flint 330r', '3500213'),
  ('casco de vidrio b38', 'envase marron 1000cc', '3500888'),
  ('casco de vidrio b38', 'envase marron 225', '3500207'),
  ('casco de vidrio b38', 'envase marron 225 retorno', '3500207'),
  ('casco de vidrio b38', 'envase marron 250', '3501226'),
  ('casco de vidrio b38', 'envase marron 250 caja 330', '3501226'),
  ('casco de vidrio b38', 'envase marron 250 cc nuevo en caja 330', '3501226'),
  ('casco de vidrio b38', 'envase marron 330r', '3500162'),
  ('casco de vidrio b38', 'envase trophy', '3500446'),
  ('casco de vidrio b38', 'envase trophy 850', '3501539'),
  ('casco de vidrio b38', 'estiba casco de vidrio ambar 750', '3500373'),
  ('casco de vidrio b38', 'estiba casco de vidrio ambar 850', '3501539'),
  ('casco de vidrio b38', 'estiba casco de vidrio flint 750', '3500383'),
  ('casco vidrio cerveceria atlantico', 'caja plastica cafe 330cc x 30', '3500159'),
  ('casco vidrio cerveceria atlantico', 'envase coronita 210 caja 330', '421887'),
  ('casco vidrio cerveceria atlantico', 'estiba casco de vidrio ambar 330', '3500162'),
  ('casco vidrio cerveceria atlantico', 'estiba casco de vidrio flint 330', '3500213'),
  ('envase', 'envase budweiser 250 cc retorno', '3503016'),
  ('envase', 'envase clover cc320 nuevo', '3501430'),
  ('envase', 'envase clover cc320 retorno', '3501430'),
  ('envase', 'envase costenita 175r nuevo', '3500005'),
  ('envase', 'envase costenita 175r retorno', '3500005'),
  ('envase', 'envase flint 1000r', '3500887'),
  ('envase', 'envase flint 1000r retorno', '3500887'),
  ('envase', 'envase flint 250 cc retorno', '3501225'),
  ('envase', 'envase flint 250 cc retorno caja 330', '3501225'),
  ('envase', 'envase flint 250 nuevo', '3501225'),
  ('envase', 'envase flint 330r nuevo', '412707'),
  ('envase', 'envase flint 330r retorno', '3500213'),
  ('envase', 'envase flint 750r retorno', '3500383'),
  ('envase', 'envase flint coronita 210 retorno caja 225', '421887'),
  ('envase', 'envase flint coronita 210 retorno caja 250', '421887'),
  ('envase', 'envase flint coronita 210 retorno caja 330', '421887'),
  ('envase', 'envase marron 1000cc 36', '3500888'),
  ('envase', 'envase marron 1000cc 36 retorno', '3500888'),
  ('envase', 'envase marron 225 retorno', '3500207'),
  ('envase', 'envase marron 250 cc nuevo', '3501226'),
  ('envase', 'envase marron 250 cc nuevo en caja 330', '3501226'),
  ('envase', 'envase marron 250 cc retorno', '3501226'),
  ('envase', 'envase marron 250 cc retorno caja 330', '3501226'),
  ('envase', 'envase marron 330r nuevo', '412644'),
  ('envase', 'envase marron 330r retorno', '3500162'),
  ('envase', 'envase marron 750r retorno', '3500373'),
  ('envase', 'envase trophy', '3500446'),
  ('envase', 'envase trophy 850 retorno', '3501539'),
  ('envase', 'envase trophy retorno', '3500446'),
  ('envase lavado para reviison', 'cuerpo extrano costenita 175r', '3500005'),
  ('envase lavado para reviison', 'envase costenita 175r', '3500005'),
  ('envase lavado para reviison', 'envase costenita 175r pico arriba ok autorizado santiago', '3500005'),
  ('envase lavado para reviison', 'envase costenita 175r revisado pico abajo', '3500005'),
  ('envase lavado para reviison', 'envase costenita pendiente rev s antiago', '3500005'),
  ('pallet', 'costenita 175r', '3500005'),
  ('pallet', 'flint 1000r', '3500887'),
  ('pallet', 'flint 250', '3501225'),
  ('pallet', 'flint 330r', '412707'),
  ('pallet', 'marron 1000cc', '3500888'),
  ('pallet', 'marron 250 cc', '3501226'),
  ('pallet', 'marron 330r', '412644'),
  ('pallet', 'palleth clover cc320', '3501430'),
  ('pallet', 'trophy', '3500446'),
  ('pendiente de baja', 'envase costenita 175r', '3500005'),
  ('pendiente de baja', 'envase flint 1000r', '3500887'),
  ('pendiente de baja', 'envase marron 1000cc', '3500888'),
  ('pendiente de baja', 'envase trophy 850', '3501539')
-- Si se vuelve a correr, corrige la semilla pero NO pisa lo que una persona asignó a mano en pantalla (esas filas tienen quién las puso).
on conflict (seccion, concepto) do update set codigo = excluded.codigo, actualizado_en = now()
  where public.carnaval_equivalencias.actualizado_por is null;

commit;

-- COMPROBACIÓN: las equivalencias cuyo código NO está en ningún maestro (debe salir vacío)
select e.seccion, e.concepto, e.codigo
  from public.carnaval_equivalencias e
 where e.codigo <> '-'
   and not exists (select 1 from public.carnaval_productos c where c.codigo = e.codigo)
   and not exists (select 1 from public.pasivos_maestro m where m.codigo = e.codigo)
   and not exists (select 1 from public.productos p where p.sku = e.codigo);
