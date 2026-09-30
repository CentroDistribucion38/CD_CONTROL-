#!/usr/bin/env bash
cd /home/claude/cd38-inventario
H="src/app/(app)/inventario/corte/Historial.tsx"; D="src/app/(app)/inventario/corte/Diferencia.tsx"
T=.arnes/inv-corte-historial.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$H" 'const POR_PAGINA = 15;' 'const POR_PAGINA = 20;' $T
m "$H" 'const POR_PAGINA = 15;' 'const POR_PAGINA = 10;' $T
m "$H" 'p.ini.id === primero' 'false' $T
m "$H" 'p.ini.id === primero' 'true' $T
m "$H" '(!desde || f.p.dia >= desde)' '(!desde || f.p.dia > desde)' $T
m "$H" '(!hasta || f.p.dia <= hasta)' '(!hasta || f.p.dia < hasta)' $T
m "$H" '(!estado || estadoDe(f) === estado)' 'true' $T
m "$H" '(!linea || f.tablas.some((t) => t.linea === linea))' 'true' $T
m "$H" 'const t = linea ? f.tablas.filter((x) => x.linea === linea) : f.tablas;' 'const t = f.tablas;' $T
m "$H" 'return t.length === 0 ? "incompleto"' 'return t.length === 0 ? "cuadra"' $T
m "$H" 'l.includes("no_cuadra") ? "no_cuadra" : l.includes("incompleto") ? "incompleto" : "cuadra"' 'l.includes("incompleto") ? "incompleto" : l.includes("no_cuadra") ? "no_cuadra" : "cuadra"' $T
m "$H" 'escogidos[p.ini.id] ?? p.porDefecto' 'p.porDefecto' $T
m "$H" 'setEscogidos((x) => ({ ...x, [p.ini.id]: id }))' 'setEscogidos((x) => x)' $T
m "$H" 'soloLinea={linea || undefined}' 'soloLinea={undefined}' $T
m "$H" 'pastillas = f.tablas.filter((t) => !linea || t.linea === linea)' 'pastillas = f.tablas' $T
m "$H" 'setMostrar((m) => m + POR_PAGINA)' 'setMostrar((m) => m)' $T
m "$H" 'const f1 = (fn: () => void) => () => { fn(); setMostrar(POR_PAGINA) };' 'const f1 = (fn: () => void) => () => { fn() };' $T
m "$H" 'pares.length > 1 && (
        <form' 'true && (
        <form' $T
m "$H" 'cortes.filter((c) => c.tipo === "inicial" && finalDe.has(c.id))' 'cortes.filter((c) => c.tipo === "inicial")' $T
m "$H" '{visibles.length > 0 && <> ·' '{false && <> ·' $T
m "$H" 'setTocados((x) => ({ ...x, [p.ini.id]: !abierto }))' 'setTocados((x) => ({ ...x, [p.ini.id]: abierto }))' $T
