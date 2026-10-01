#!/usr/bin/env bash
cd /home/claude/cd38-inventario
K=src/modulos/inventario/totales-conteo.ts; F="src/app/(app)/inventario/conteo/Ficha.tsx"; C="src/app/(app)/inventario/conteo/Contar.tsx"
TU=.arnes/inv-totales-conteo.mjs; TP=.arnes/inv-conteo-ficha.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$K" 'if (factor != null && factor > 0) t.estibas += cajas / factor; else t.sinFactor += 1;' 'if (factor != null) t.estibas += cajas / factor; else t.sinFactor += 1;' $TU
m "$K" 'if (factor != null && factor > 0) t.estibas += cajas / factor; else t.sinFactor += 1;' 'if (factor != null && factor > 0) t.estibas += cajas * factor; else t.sinFactor += 1;' $TU
m "$K" 'if (factor != null && factor > 0) t.estibas += cajas / factor; else t.sinFactor += 1;' 'if (factor != null && factor > 0) t.estibas += Math.floor(cajas / factor); else t.sinFactor += 1;' $TU
m "$K" 'const factor = num(r.factor_estibado) ?? mat?.cajas_por_estiba ?? null;' 'const factor = mat?.cajas_por_estiba ?? num(r.factor_estibado);' $TU
m "$K" 'const factor = num(r.factor_estibado) ?? mat?.cajas_por_estiba ?? null;' 'const factor = num(r.factor_estibado);' $TU
m "$K" 't.unidades += cajas * porCaja; else t.sinUnidades += 1;' 't.unidades += cajas; else t.sinUnidades += 1;' $TU
m "$K" 'if (porCaja != null && porCaja > 0)' 'if (porCaja != null)' $TU
m "$K" 'r.tipo_material === "ENVASE" ? f.envase : f.producto' 'r.tipo_material === "ENVASE" ? f.producto : f.envase' $TU
m "$K" 'const cajas = num(r.total_cajas) ?? 0;' 'const cajas = 0;' $TU
m "$K" 'porSku.get(r.codigo)' 'porSku.get(r.material as any)' $TU
m "$F" 'const separar = ficha.producto.renglones > 0 && ficha.envase.renglones > 0;' 'const separar = true;' $TP
m "$F" 'const separar = ficha.producto.renglones > 0 && ficha.envase.renglones > 0;' 'const separar = false;' $TP
m "$F" '(g.sinFactor > 0 || g.sinUnidades > 0) && (' '(false) && (' $TP
m "$F" '{nf1.format(t.estibas)}</dd>' '{nf.format(t.estibas)}</dd>' $TP
m "$C" 'totalesDelConteo(vistos, materiales)' 'totalesDelConteo(renglones, materiales)' $TP
m "$C" 'totalesDelConteo(renglones, materiales);
  const' 'totalesDelConteo(vistos, materiales);
  const' $TP
m "$C" '{filtrando && <Ficha titulo="Lo que ves con el filtro"' '{false && <Ficha titulo="Lo que ves con el filtro"' $TP
m "$C" '{renglones.length > 0 && (
          <div className="fe-fichas">' '{true && (
          <div className="fe-fichas">' $TP
