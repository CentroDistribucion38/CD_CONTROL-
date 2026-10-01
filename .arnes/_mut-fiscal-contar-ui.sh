#!/usr/bin/env bash
cd /home/claude/cd38-inventario
C="src/app/(app)/inventario/conteo/ContarFiscal.tsx"; W="src/app/(app)/inventario/conteo/ContarConFiscal.tsx"; P="src/app/(app)/inventario/conteo/page.tsx"
K=src/modulos/inventario/fiscal-contar.ts; F=src/modulos/inventario/fiscal.ts; R=src/modulos/registro.ts; CSS="src/app/(app)/inventario/conteo/asignado.css"
TC=.arnes/inv-contar-fiscal-conteo.mjs; TP=.arnes/inv-contar-fiscal.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$W" 'useState<"fefo" | "fiscal">(hayHoy ? "fiscal" : "fefo")' 'useState<"fefo" | "fiscal">("fefo")' $TC
m "$W" 'useState<"fefo" | "fiscal">(hayHoy ? "fiscal" : "fefo")' 'useState<"fefo" | "fiscal">("fiscal")' $TC
m "$W" '<div hidden={modo !== "fefo"}>{children}</div>' '{modo === "fefo" && <div>{children}</div>}' $TC
m "$W" 'if (hojas.length === 0) return <>{children}</>;' '' $TC
m "$W" '{unaSola ? ` · Hoja ${unaSola.numero}` : ""}' '{` · Hoja ${hojas[0].numero}`}' $TC
m "$P" '<ContarConFiscal hojas={hojasContar}' '<ContarConFiscal hojas={hojasContar.filter(() => puedeContar)}' $TP
m "$F" 'if (!f.hoja_id || vistas.has(f.hoja_id)) continue;' 'if (vistas.has(f.hoja_id as string)) continue;' $TP
m "$F" 'puedeContar: f.puede_contar === true' 'puedeContar: true' $TP
m "$C" 'const mal = revisarFiscal(b, material, claveEscogida);' 'const mal = null as string | null;' $TC
m "$C" 'p_hoja: hoja.hojaId' 'p_hoja: hojaId' $TC
m "$K" 'p_estibas: b.modo === "estibas" ? cantidad(b.estibas) : null,' 'p_estibas: cantidad(b.estibas),' $TC
m "$K" 'p_cajas: b.modo === "cajas" ? cantidad(b.cajas) : null,' 'p_cajas: cantidad(b.cajas),' $TC
m "$K" 'p_dia: fecha ? cantidad(b.dia) : null,' 'p_dia: cantidad(b.dia),' $TC
m "$K" '  return d === "" ? null : Number(d);' '  return d === "" || Number(d) === 0 ? null : Number(d);' $TC
m "$K" 'if (!env && !(b.dia.trim()' 'if (false && !(b.dia.trim()' $TC
m "$K" 'if (f.getMonth() !== m - 1 || f.getDate() !== d)' 'if (false)' $TC
m "$K" 'if (e != null && e > 0 && mat.cajas_por_estiba == null) return' 'if (false) return' $TC
m "$K" 'if (d == null || m == null || a == null) return "La fecha de vencimiento va completa' 'if (false) return "La fecha de vencimiento va completa' $TC
m "$C" 'setB(VACIO_FISCAL);
    await leer(hoja.hojaId);' 'await leer(hoja.hojaId);' $TC
m "$C" '    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${material.sku}' '    avisar.bien(`${material.sku}' $TC
m "$C" 'p_id: r.id' 'p_id: mios![0].id' $TC
m "$C" 'if (!ok || !hoja) return;' 'if (!hoja) return;' $TC
m "$C" 'setTimeout(() => campoCalle.current?.focus(), 0);' '' $TC
m "$C" 'const contables = hojas.filter((h) => h.puedeContar);' 'const contables = hojas;' $TC
m "$C" '{!hoja.puedeContar ? (' '{false ? (' $TC
m "$C" 'disabled={!h.puedeContar}' 'disabled={false}' $TC
m "$C" 'if (hayAlgo) localStorage.setItem(llave, JSON.stringify(b)); else localStorage.removeItem(llave);' 'localStorage.removeItem(llave);' $TC
m "$C" 'const { data, error } = await supabase.rpc("inv_fiscal_contar_mios", { p_hoja: id });' 'const { data, error } = await supabase.rpc("inv_fiscal_contar_mios", { p_hoja: hojaId });' $TC
m "$CSS" '.fe .fc-lista .fe-mini { flex: none; width: auto; margin: 0;' '.fe .fc-lista .fe-mini { flex: none;' $TC
m "$CSS" '.fe .fc-ren { flex: 1 1 0;' '.fe .fc-ren { ' $TC
m "$R" '      { nombre: "Inventario fiscal", ruta: "/inventario/fiscal", rama: "conteos" },
' '' $TP
# el aviso «tienes un fiscal asignado»
m "$W" 'if (!hayHoy) return;
    let visto' 'let visto' $TC
m "$W" 'if (!visto) setAviso(true);' 'setAviso(true);' $TC
m "$W" 'if (!visto) setAviso(true);' 'if (visto) setAviso(true);' $TC
m "$W" 'onClick={() => { setModo("fefo"); cierraAviso() }}' 'onClick={() => { setModo("fiscal"); cierraAviso() }}' $TC
m "$W" 'onClick={() => { setModo("fiscal"); cierraAviso() }}' 'onClick={() => { setModo("fefo"); cierraAviso() }}' $TC
m "$W" 'try { sessionStorage.setItem(llaveAviso, "1") }' 'try { }' $TC
m "$W" 'const deHoy = hojas.filter((h) => h.puedeContar);' 'const deHoy = hojas;' $TC
m "$W" 'continuar.current?.focus();' '' $TC
m "$W" 'if (e.key === "Escape") cierraAviso()' 'if (false) cierraAviso()' $TC
