#!/usr/bin/env bash
# Mutantes de La base nueva: cada uno debe hacer FALLAR su prueba. Corre uno tras otro.
cd /home/claude/cd38-inventario
CR=src/modulos/inventario/base-cruce.ts; BT="src/app/(app)/inventario/base/Base.tsx"; BC="src/app/(app)/inventario/base/base.css"; MP="src/app/(app)/inventario/base/MarcarPasados.tsx"
U=.arnes/inv-base-cruce.mjs; N=.arnes/inv-base-nueva.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m $CR 'cuandoDe(b).localeCompare(cuandoDe(a))' 'cuandoDe(a).localeCompare(cuandoDe(b))' $U
m $CR '|| (codigo.get(b) ?? "").localeCompare(codigo.get(a) ?? "", "es", { numeric: true })' '|| (codigo.get(b) ?? "").localeCompare(codigo.get(a) ?? "", "es")' $U
m $CR 'for (const id of otros) reemplazados.push(...grupo.get(id)!);' '' $U
m $CR 'repetidas += 1;' '' $U
m $CR 'a.ubicaciones += 1;' '' $U
m $CR 'const previo = otros[0] ?? null;' 'const previo = otros[otros.length - 1] ?? null;' $U
m $CR 'antes !== num(l.total_cajas) ? antes : null' 'antes' $U
m $CR 'deAntes.filter((x) => x.codigo === l.codigo)' 'deAntes' $U
m $CR 'eran.reduce((s, x) => s + num(x.total_cajas), 0)' 'num(eran[0].total_cajas)' $U
m $CR 'c.enviado_en ?? c.fecha_analisis ?? ""' 'c.fecha_analisis ?? ""' $U
m $CR '-(\d+)$' '-(\d)$' $U
m "$BT" 'return cruzar(enviadas.filter((r) => ids.has(r.conteo_id)), incluidos);' 'return cruzar(enviadas, incluidos);' $N
m "$BT" 'pasado: yaPasados.has(r.id),' 'pasado: false,' $N
m "$BT" 'unidades: u ? Number(r.total_cajas) * u : null,' 'unidades: u ? Number(r.total_cajas) : null,' $N
m "$BT" '.sort((a, b) => (b.fecha_analisis ?? "").localeCompare(a.fecha_analisis ?? "")' '.sort((a, b) => (a.fecha_analisis ?? "").localeCompare(b.fecha_analisis ?? "")' $N
m "$BT" 'delPeriodo.filter((c) => !quitados.has(c.id)), [delPeriodo, quitados]' 'delPeriodo, [delPeriodo, quitados]' $N
m "$BT" 'repetidas: cruce.repetidas,' 'repetidas: 0,' $N
m "$BT" 'cajas: cruce.vigentes.reduce((a, r) => a + Number(r.total_cajas), 0),' 'cajas: cruce.vigentes.length,' $N
m "$BT" 'pestania === "base" && (puedeMarcar || manda);' 'pestania === "base" && puedeMarcar;' $N
m "$BT" 'pestania === "base" && (puedeMarcar || manda);' 'pestania === "base";' $N
m "$BT" '{manda && (
            <button type="button" className="ba-sec ba-adm"' '{(
            <button type="button" className="ba-sec ba-adm"' $N
m "$BT" 'pestania === "base" && puedeMarcar && (pasadosOk' 'pestania === "base" && (pasadosOk' $N
m "$BT" 'pestania === "base" && puedeMarcar && (pasadosOk' 'pestania === "base" && puedeMarcar && (true' $N
m "$BT" 'const visibles = filas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);' 'const visibles = filas;' $N
m "$BT" 'useEffect(() => { setPag(0) }, [firma]);' '' $N
m "$BT" '(todos ? "" : `&ids=${incluidos.map((c) => c.id).join(",")}`)' '`&ids=${incluidos.map((c) => c.id).join(",")}`' $N
m "$BT" ': abiertas.map((r) => enriquecer({ ...r, reemplaza: null, antes: null })),' ': cruce.vigentes.map(enriquecer),' $N
m "$BT" 'return pestania === "base" ? [...base, ESTADO] : base;' 'return [...base, ESTADO];' $N
m "$BT" 'etiqueta: !f || f === diaTope ? suf : `${ddmm(f)} ${suf}`,' 'etiqueta: suf,' $N
m "$BT" 'hourCycle: "h23"' 'hourCycle: "h12"' $N
m "$BT" 'return orden.asc ? c : -c;' 'return c;' $N
m "$BT" 'texto: (r) => (r.pasado ? "PASADO" : "POR PASAR")' 'texto: (r) => (r.pasado ? "POR PASAR" : "PASADO")' $N
m "$BT" 'if (fRec && r.conteo_id !== fRec) return false;' '' $N
m "$BT" 'MESES[Number(p.find((x) => x.type === "month")?.value) - 1]' '"mes"' $N
m "$BT" 'const act = on ? cruce.actualiza.get(c.id) : undefined;' 'const act = cruce.actualiza.get(c.id);' $N
m "$BT" 'elegidos.length === 0' 'false' $N
m "$MP" 'filas: Renglon[], pasado: boolean' 'filas: Renglon[], pasado: boolean' $N
m "$MP" '{ p_lineas: filas.map((r) => r.id), p_pasado: pasado }' '{ p_lineas: filas.map((r) => r.id), p_pasado: true }' $N
m "$MP" 'const porPasar = elegidos.filter((r) => !pasados.has(r.id));' 'const porPasar = elegidos;' $N
m "$MP" 'const yaPasados = elegidos.filter((r) => pasados.has(r.id));' 'const yaPasados = elegidos;' $N
m "$MP" '    alCambiar();
    router.refresh();' '    router.refresh();' $N
m "$BC" 'position: sticky; top: 0; z-index: 2; padding: 0; background: var(--fe-fondo)' 'position: static; top: 0; z-index: 2; padding: 0; background: var(--fe-fondo)' $N
m "$BC" '.fe .ba .ba-ch { min-height: 44px; padding: 0 12px 0 8px }' '.fe .ba .ba-ch { min-height: 30px; padding: 0 12px 0 8px }' $N
m "$BC" '.fe .ba .ba-sel select { width: 100%; min-height: 44px; height: 44px }' '.fe .ba .ba-sel select { width: 100%; min-height: 30px; height: 30px }' $N
m "$BC" '.fe .ba-kp { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));' '.fe .ba-kp { display: grid; grid-template-columns: repeat(1, minmax(0, 1fr));' $N
m "$BC" 'color: color-mix(in srgb, var(--fe-bien) 80%, #000) }' 'color: var(--fe-bien) }' $N
m "$BC" '.fe .ba-marco { overflow: auto; max-height: 70vh; overscroll-behavior: contain }' '.fe .ba-marco { overflow: visible; overscroll-behavior: contain }' $N
m "$BC" '.fe .ba .ba-seg button.on { background: var(--fe-acento); color: var(--fe-sobre) }' '.fe .ba .ba-seg button.on { background: var(--fe-acento); color: var(--fe-acento) }' $N
echo FIN
