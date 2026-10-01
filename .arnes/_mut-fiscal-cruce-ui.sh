#!/usr/bin/env bash
cd /home/claude/cd38-inventario
C="src/app/(app)/inventario/fiscal/Fiscal.tsx"; M=src/modulos/inventario/fiscal-cruce.ts; PG="src/app/(app)/inventario/fiscal/page.tsx"; CSS="src/app/(app)/inventario/fiscal/fiscal.css"
T=.arnes/inv-fiscal-cruce-ui.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$M" 'if (ol && ba) return "lista";' 'if (ol || ba) return "lista";' $T
m "$M" 'if (ol || ba) return "una-termino";' 'if (ol) return "una-termino";' $T
m "$M" 'if (a.olRenglones > 0 || a.bavariaRenglones > 0) return "contando";' 'if (a.olRenglones > 0) return "contando";' $T
m "$M" 'return !!a && estadoHoja(a) === "lista"' 'return !!a' $T
m "$M" 'if (termino !== null) return' 'if (termino !== undefined) return' $T
m "$M" 'renglones === 1 ? "renglón" : "renglones"} · terminó' 'renglones === 1 ? "renglón" : "renglones"} · contando' $T
m "$M" 'if (dia != null) partes.push(p2(dia));' '' $T
m "$M" 'padStart(2, "0")' 'padStart(3, "0")' $T
m "$M" 'estado = (ESTADOS as string[]).includes(f.estado) ? (f.estado as EstadoFila) : "DIFIERE"' 'estado = f.estado as EstadoFila' $T
m "$M" 'v === null || v === undefined ? null : num(v)' 'num(v)' $T
m "$M" 'else if (f.estado === "SOLO_OL") r.soloOl++;' 'else if (f.estado === "SOLO_OL") r.soloBavaria++;' $T
m "$M" 'r.cajasOl += f.cajasOl ?? 0;' 'r.cajasOl += f.cajasBavaria ?? 0;' $T
m "$M" 'r.conDiferencia = r.difieren + r.soloOl + r.soloBavaria;' 'r.conDiferencia = r.difieren;' $T
m "$M" 'if (r.conDiferencia === 0) return' 'if (r.difieren === 0) return' $T
m "$M" '(a.f.estado === "COINCIDE" ? 1 : 0) - (b.f.estado === "COINCIDE" ? 1 : 0) || a.i - b.i' 'a.i - b.i' $T
m "$M" '|| a.i - b.i' '|| b.i - a.i' $T
m "$C" 'const conAvance = conCruce && !!f.avance && !!f.publicado;' 'const conAvance = conCruce && !!f.avance;' $T
m "$C" 'puedeEditar && puedeCruzar(av) && f.hojaIds?.[h.numero] && (' 'puedeCruzar(av) && f.hojaIds?.[h.numero] && (' $T
m "$C" 'puedeEditar && puedeCruzar(av) && f.hojaIds?.[h.numero] && (' 'puedeEditar && f.hojaIds?.[h.numero] && (' $T
m "$C" '{ p_hoja: hojaId }' '{ p_hoja: f.id }' $T
m "$C" 'ordenarCruce(((data ?? [])' '(((data ?? [])' $T
m "$C" 'if (error) return setCruce((c) => (c && c.hojaId === hojaId ? { ...c, error: traducirError(error.message) } : c));' 'if (error) return;' $T
m "$C" 'setC({ ...c, soloDif: !c.soloDif })' 'setC({ ...c })' $T
m "$C" '(c.soloDif ? c.filas.filter((f) => f.estado !== "COINCIDE") : c.filas)' '(c.soloDif ? c.filas.filter((f) => f.estado === "COINCIDE") : c.filas)' $T
m "$C" 'r.conDiferencia > 0 && r.coinciden > 0 && (' 'r.coinciden > 0 && (' $T
m "$C" 'r.conDiferencia > 0 && r.coinciden > 0 && (' 'r.conDiferencia > 0 && (' $T
m "$C" 'onClick={() => setC(null)}>Cerrar' 'onClick={() => setC(c)}>Cerrar' $T
m "$C" '(r.conDiferencia === 0 ? " bien" : " mal")' '(" mal")' $T
m "$C" '{c.error && <p className="cl-mal" role="alert">{c.error}</p>}' '' $T
m "$C" '{!c.error && !c.filas && <p className="cl-nota" role="status">Cruzando…</p>}' '' $T
m "$C" 'f.cajasOl === null ? "—" : nf.format(f.cajasOl)' 'nf.format(f.cajasOl ?? 0)' $T
m "$C" '(f.diferencia > 0 ? "+" : "")' '""' $T
m "$C" 'setCruce({ fiscalId: f.id, hojaId, numero, filas: null, error: null, soloDif: false });' 'setCruce({ fiscalId: f.id, hojaId, numero, filas: null, error: null, soloDif: true });' $T
m "$C" '{cruce && cruce.fiscalId === f.id && <PanelCruce' '{cruce && <PanelCruce' $T
m "$C" '{!conCruce && puedeEditar && (' '{!conCruce && (' $T
m "$C" '{!conCruce && puedeEditar && (' '{false && (' $T
m "$PG" 'const conCruce = !ava.error;' 'const conCruce = true;' .arnes/inv-fiscal-page.mjs
echo FIN
