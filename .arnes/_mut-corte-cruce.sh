#!/usr/bin/env bash
cd /home/claude/cd38-inventario
C="src/app/(app)/inventario/corte/Corte.tsx"; K=src/modulos/inventario/corte.ts; CSS="src/app/(app)/inventario/corte/corte.css"
TC=.arnes/inv-corte-cuentas.mjs; TX=.arnes/inv-corte-cruce.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$K" '.filter((l) => !l.averia && !l.pnc).reduce' '.reduce' $TC
m "$K" 'const delMaterial = enModulo.filter((l) => l.producto_id === material);' 'const delMaterial = enModulo;' $TC
m "$K" 'const movConteo = m.ini == null ? null : buenas - m.ini;' 'const movConteo = m.ini == null ? null : m.ini - buenas;' $TC
m "$K" 'const dif = m.fin == null ? null : buenas - m.fin;' 'const dif = m.fin == null ? null : buenas - m.ini!;' $TC
m "$K" 'const movCorte = m.ini == null || m.fin == null ? null : m.fin - m.ini;' 'const movCorte = m.ini == null || m.fin == null ? null : m.ini - m.fin;' $TC
m "$K" 'const parejo = (n: number) => Math.abs(n) < 0.5;' 'const parejo = (n: number) => Math.abs(n) < 0.0001;' $TC
m "$K" 'const parejo = (n: number) => Math.abs(n) < 0.5;' 'const parejo = (n: number) => Math.abs(n) < 1.5;' $TC
m "$K" 'const delConteo = lineas.filter((l) => l.conteo_id === conteoId);' 'const delConteo = lineas;' $TC
m "$K" 'if (enModulo.length === 0) {' 'if (false) {' $TC
m "$K" 'origen: cruceLado(f.origen, f.envase_id, "el envase", conteoId, lineas, f.pasadas, -1),' 'origen: cruceLado(f.origen, f.material_id, "el envase", conteoId, lineas, f.pasadas, -1),' $TC
m "$K" 'destino: cruceLado(f.destino, f.material_id, "el material", conteoId, lineas, f.pasadas, 1),' 'destino: cruceLado(f.destino, f.envase_id, "el material", conteoId, lineas, f.pasadas, 1),' $TC
m "$K" 'lineas, f.pasadas, -1),' 'lineas, f.pasadas, 1),' $TC
m "$K" 'const esperado = signo * pasadas;' 'const esperado = pasadas;' $TC
m "$K" 'const completo = contados.length === comparables.length;' 'const completo = true;' $TC
m "$K" 'movConteo = completo ? contados.reduce' 'movConteo = contados.reduce' $TC
m "$K" 'lectura: !hayCortes ? "sin_rango" : parejo(dif as number) ? "cuadra" : "no_cuadra",' 'lectura: parejo(dif as number) ? "cuadra" : "no_cuadra",' $TC
m "$K" 'const comparables = modulos.filter((m) => m.movCorte !== null);' 'const comparables = modulos;' $TC
m "$K" 'if (conteos.length === 0) return null;' '' $TC
m "$K" 'Date.parse(iso) - 5 * 3600000' 'Date.parse(iso)' $TC
m "$C" 'const id = escogido ?? conteoPorDefecto(ini, conteos);' 'const id = escogido ?? conteos[0]?.id ?? null;' $TX
m "$C" '[a, id, lineas]);' '[a, lineas]);' $TX
m "$C" 'm.aparte > 0 ? `+ ${fmt(m.aparte)} en avería/PNC (no se suma)` : null' 'null' $TX
m "$C" 'movimiento={dif(m.movConteo)}' 'movimiento={dif(m.movCorte)}' $TX
m "$C" 'className="cl-cruce-l">{c.linea}</b>' 'className="cl-cruce-l">{c.linea}</b>' $TX
m "$C" 'clase={"r-inv l-" + m.lectura}' 'clase="r-inv l-cuadra"' $TX
m "$C" 'fin={m.conteo === null ? "—" : fmt(m.conteo)}' 'fin={m.fin === null ? "—" : fmt(m.fin)}' $TX
m "$C" 'const cuanto = (n: number) => `${n > 0 ? "sobran" : "faltan"}' 'const cuanto = (n: number) => `${n > 0 ? "faltan" : "sobran"}' $TX
m "$C" '"Total en el inventario" k=' '"Total en el inventario" k=' $TX
m "$C" 'movimiento={dif(c.pasadas)}' 'movimiento={dif(c.depaFin)}' $TX
m "$CSS" '.fe .cl-cruce-mods li.cab { display: none }' '.fe .cl-cruce-mods li.cab { display: grid }' $TX
m "$CSS" '.fe .cl-cruce-mods li.l-no_cuadra em { color: var(--fe-mal) }' '.fe .cl-cruce-mods li.l-no_cuadra em { color: var(--fe-bien) }' $TX
echo FIN
