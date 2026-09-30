#!/usr/bin/env bash
cd /home/claude/cd38-inventario
C="src/app/(app)/inventario/corte/Corte.tsx"; K=src/modulos/inventario/corte.ts; CSS="src/app/(app)/inventario/corte/corte.css"
TC=.arnes/inv-corte-cuentas.mjs; TX=.arnes/inv-corte-cruce.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$K" '.filter((l) => !l.averia && !l.pnc).reduce((t, l) => t + Number(l.total_cajas), 0);' '.reduce((t, l) => t + Number(l.total_cajas), 0);' $TC
m "$K" 'const delMaterial = enModulo.filter((l) => l.producto_id === material);' 'const delMaterial = enModulo;' $TC
m "$K" 'const difIni = m.ini == null ? null : buenas - m.ini;' 'const difIni = m.ini == null ? null : m.ini - buenas;' $TC
m "$K" 'const difFin = m.fin == null ? null : buenas - m.fin;' 'const difFin = m.fin == null ? null : buenas - m.ini!;' $TC
m "$K" 'buenas >= Math.min(m.ini as number, m.fin as number) && buenas <= Math.max(m.ini as number, m.fin as number)' 'buenas >= (m.ini as number) && buenas <= (m.fin as number)' $TC
m "$K" 'buenas <= Math.max(m.ini as number, m.fin as number)' 'buenas < Math.max(m.ini as number, m.fin as number)' $TC
m "$K" 'const delConteo = lineas.filter((l) => l.conteo_id === conteoId);' 'const delConteo = lineas;' $TC
m "$K" 'if (enModulo.length === 0) {' 'if (false) {' $TC
m "$K" 'origen: cruceLado(f.origen, f.envase_id,' 'origen: cruceLado(f.origen, f.material_id,' $TC
m "$K" 'destino: cruceLado(f.destino, f.material_id,' 'destino: cruceLado(f.destino, f.envase_id,' $TC
m "$K" 'lectura: !hayRango ? "sin_rango" : entre ? "entre" : "fuera",' 'lectura: entre ? "entre" : "fuera",' $TC
m "$K" 'if (conteos.length === 0) return null;' '' $TC
m "$K" 'Date.parse(iso) - 5 * 3600000' 'Date.parse(iso)' $TC
m "$C" 'const id = escogido ?? conteoPorDefecto(ini, conteos);' 'const id = escogido ?? conteos[0]?.id ?? null;' $TX
m "$C" '[a, id, lineas]);' '[a, lineas]);' $TX
m "$C" '{m.aparte > 0 && <small>' '{false && <small>' $TX
m "$C" '<span data-k="Conteo − final">{dif(m.difFin)}</span>' '<span data-k="Conteo − final">{dif(m.difIni)}</span>' $TX
m "$C" 'className={"l-" + m.lectura}' 'className="l-entre"' $TX
m "$C" '["Ubicados en", c.destino]' '["Ubicados", c.destino]' $TX
m "$CSS" '.fe .cl-cruce-mods li.cab { display: none }' '.fe .cl-cruce-mods li.cab { display: grid }' $TX
echo FIN
