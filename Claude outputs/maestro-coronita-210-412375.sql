-- =====================================================================
-- MAESTRO · 412375 Envase Flint 210NR Coronita
--   1.350 und por estiba · 45 cajas por estiba (30 und por caja) · Caja 330 (3500159, plástica 330 x30)
--
-- Arregla «Al maestro le falta botellas por estiba o HL» en Casco de vidrio → Registrar, y deja el dato
-- completo para Inventario y el Cuadre SAP. HL por botella = 0,0021 (210 cc, igual que el 421887).
-- Se puede correr varias veces.
-- =====================================================================
begin;

-- 1. EL MAESTRO DE INVENTARIO (productos) — lo que se ve en Inventario → Maestro
insert into public.productos (sku, nombre, tipo_material, color_vidrio, activo, en_sitio,
                              unidades_por_caja, cajas_por_estiba, unidades_por_estiba, hl, unidades_x_hl, contenido, tipo_envase,
                              pat_largo, pat_ancho, pat_nivel, categoria, familia, referencia)
values ('412375', 'Envase Flint 210NR Coronita', 'ENVASE', 'flint', true, false,
        30, 45, 1350, 0.0021, 476.190476, 210, 'Botella',
        3, 3, 5, 'Empaque Primario', 'Ret', 1)
on conflict (sku) do update set
  unidades_por_caja   = 30,
  cajas_por_estiba    = 45,
  unidades_por_estiba = 1350,
  hl                  = 0.0021,
  unidades_x_hl       = 476.190476,
  contenido           = 210,
  tipo_envase         = coalesce(public.productos.tipo_envase, 'Botella'),
  -- Patrón de estiba 3 × 3 × 5 = 45 cajas (es el «Factor estibado» de la pantalla del Maestro)
  pat_largo           = 3,
  pat_ancho           = 3,
  pat_nivel           = 5,
  categoria           = coalesce(public.productos.categoria, 'Empaque Primario'),
  familia             = coalesce(public.productos.familia, 'Ret'),
  referencia          = coalesce(public.productos.referencia, 1);

-- 2. EL MAESTRO DE PASIVOS Y CUADRE SAP (de qué caja es y cuántas lleva)
insert into public.pasivos_maestro (codigo, material, descripcion, familia, unidades_por_caja, cajas_por_estiba, hl_unidad, caja, activo)
values ('412375', '412375', 'Envase Flint 210NR Coronita', 'ENVASE', 30, 45, 0.0021, '3500159', true)
on conflict (codigo) do update set
  unidades_por_caja = 30, cajas_por_estiba = 45, hl_unidad = 0.0021, caja = '3500159', actualizado_en = now();

-- 3. LO QUE YA ESTUVIERA GUARDADO EN CASCO sin factor se recalcula
update public.casco_registros r
   set hl_estiba = public.casco_hl_estiba('412375'),
       hl = round((coalesce(r.inventario, 0) + coalesce(r.baja, 0)) * public.casco_hl_estiba('412375'), 4),
       actualizado_en = now()
 where r.sku = '412375' and r.hl_estiba is null;

commit;

-- COMPROBACIÓN: botellas por estiba debe dar 1350 y HL por estiba 2,835
select p.sku, p.nombre, p.unidades_por_caja, p.cajas_por_estiba, p.unidades_por_estiba, p.hl,
       public.casco_botellas_estiba('412375') as casco_botellas_por_estiba,
       public.casco_hl_estiba('412375')       as casco_hl_por_estiba,
       m.caja                                 as caja_plastica
  from public.productos p left join public.pasivos_maestro m on m.codigo = p.sku
 where p.sku = '412375';
