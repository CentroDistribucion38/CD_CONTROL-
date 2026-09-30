#!/usr/bin/env bash
cd /home/claude/cd38-inventario
D="src/app/(app)/inventario/corte/Diferencia.tsx"; K=src/modulos/inventario/corte.ts; CSS="src/app/(app)/inventario/corte/corte.css"
TC=.arnes/inv-corte-cuentas.mjs; TX=.arnes/inv-corte-cruce.mjs; TP=.arnes/inv-corte-pantalla.mjs
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
m "$K" 'origen: cruceLado(f.origen, f.envase_id,' 'origen: cruceLado(f.origen, f.material_id,' $TC
m "$K" 'destino: cruceLado(f.destino, f.material_id,' 'destino: cruceLado(f.destino, f.envase_id,' $TC
m "$K" 'lineas, f.pasadas, -1),' 'lineas, f.pasadas, 1),' $TC
m "$K" 'const esperado = signo * pasadas;' 'const esperado = pasadas;' $TC
m "$K" 'const completo = contados.length === comparables.length;' 'const completo = true;' $TC
m "$K" 'const comparables = modulos.filter((m) => m.movCorte !== null);' 'const comparables = modulos;' $TC
m "$K" 'if (conteos.length === 0) return null;' '' $TC
m "$K" 'Date.parse(iso) - 5 * 3600000' 'Date.parse(iso)' $TC
m "$K" 'mov * esperado < 0 ? (esperado < 0 ? "subió cuando debía bajar" : "bajó cuando debía subir")' 'mov * esperado < 0 ? (esperado < 0 ? "bajó cuando debía bajar" : "bajó cuando debía subir")' $TC
m "$K" '`${dif > 0 ? "Sobran" : "Faltan"} · ${porque}`' '`${dif < 0 ? "Sobran" : "Faltan"} · ${porque}`' $TC
m "$K" 'if (!parejo(d)) noCuadra = true;' '' $TC
m "$K" 'if (m.lectura === "no_cuadra") noCuadra = true;' '' $TC
m "$K" 'estado: noCuadra ? "no_cuadra" : incompleto ? "incompleto" : "cuadra"' 'estado: noCuadra ? "no_cuadra" : "cuadra"' $TC
m "$K" 'if (l.motivo || mods.length === 0) { incompleto = true; return g; }' 'if (l.motivo || mods.length === 0) { return g; }' $TC
m "$K" 'if (mods.length === 1 && t) {' 'if (false && t) {' $TC
m "$D" 'const id = escogido ?? conteoPorDefecto(ini, conteos);' 'const id = escogido ?? conteos[0]?.id ?? null;' $TX
m "$D" '[a, id, lineasConteo],' '[a, lineasConteo],' $TX
m "$D" 'conteo.fecha < d1 || conteo.fecha > d2' 'false' $TX
m "$D" 'conteo.fecha < d1 || conteo.fecha > d2' 'conteo.fecha < d1' $TX
m "$D" 'cajas / f.porEstiba;' 'cajas * f.porEstiba;' $TX
m "$D" 'cajas * f.porCaja;' 'cajas / f.porCaja;' $TX
m "$D" '{(fila.aparte ?? 0) > 0 && <small>' '{false && <small>' $TX
m "$D" 'const est = cajas === null || !(f.porEstiba && f.porEstiba > 0) ? null : cajas / f.porEstiba;' 'const est = cajas === null || !(f.porEstiba && f.porEstiba > 0) || conSigno === undefined ? null : cajas / f.porEstiba;' $TX
m "$D" 'const factores = (mid: string | null): Factores' 'const factores = (mid: string | null): Factores' $TX
m "$D" 'const fDepa = factores(f.material_id ?? f.envase_id);' 'const fDepa = factores(f.envase_id);' $TX
m "$D" 'g.titulo === "Tomando de" ? fOrigen : fDestino' 'fDestino' $TX
m "$D" 'chip = { cuadra: "CUADRA", no_cuadra: "NO CUADRA"' 'chip = { cuadra: "NO CUADRA", no_cuadra: "NO CUADRA"' $TX
m "$CSS" '.fe .dq thead { display: none }' '.fe .dq thead { display: table-header-group }' $TX
m "$CSS" '.fe .dq td.lec.mal { color: var(--fe-mal) }' '.fe .dq td.lec.mal { color: var(--fe-bien) }' $TX
m "$CSS" '.fe .dq td.x[data-b]::after { content: attr(data-b);' '.fe .dq td.x[data-b]::after { content: "";' $TX
echo FIN
