#!/usr/bin/env bash
cd /home/claude/cd38-inventario
K=src/modulos/inventario/fiscal.ts; F="src/app/(app)/inventario/fiscal/Fiscal.tsx"
TC=.arnes/inv-fiscal-cuentas.mjs; TP=.arnes/inv-fiscal-pantalla.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$K" 'while (usados.has(k)) k++;' '' $TC
m "$K" 'hojas.filter((h) => h.numero !== numero)' 'hojas.filter((h) => h.numero < numero)' $TC
m "$K" '.sort((a, b) => a.numero - b.numero);
}' '.sort((a, b) => b.numero - a.numero);
}' $TC
m "$K" 'Array.from({ length: Math.max(0, Math.floor(n)) }' 'Array.from({ length: Math.max(1, Math.floor(n)) }' $TC
m "$K" 'h.numero === numero ? { ...h, [equipo]: id } : h' 'true ? { ...h, [equipo]: id } : h' $TC
m "$K" 'if (!id) continue;' '' $TC
m "$K" 'filter(([, v]) => v.length > 1)' 'filter(([, v]) => v.length > 2)' $TC
m "$K" 'if (hojas.length === 0) errores.push' 'if (false) errores.push' $TC
m "$K" 'if (n === 2) completas++; else if (n === 1) aMedias++; else vacias++;' 'if (n >= 1) completas++; else vacias++;' $TC
m "$K" 'ol: h.ol || null, bavaria: h.bavaria || null' 'ol: h.ol, bavaria: h.bavaria' $TC
m "$K" '.sort((a, b) => a.numero - b.numero)
    .map(' '.map(' $TC
m "$K" 'if (r.aMedias > 0)' 'if (false)' $TC
m "$K" 'if (r.vacias > 0) partes' 'if (false) partes' $TC
m "$F" 'disabled={otra}' 'disabled={false}' $TP
m "$F" 'const otra = en != null && p.id !== h[eq];' 'const otra = en != null;' $TP
m "$F" 'const puede = !ocupado && !sinNombre && r.errores.length === 0 && form.fecha !== "";' 'const puede = !ocupado && r.errores.length === 0 && form.fecha !== "";' $TP
m "$F" 'const puede = !ocupado && !sinNombre && r.errores.length === 0 && form.fecha !== "";' 'const puede = !ocupado && !sinNombre && form.fecha !== "";' $TP
m "$F" 'p_nombre: form.nombre.trim()' 'p_nombre: form.nombre' $TP
m "$F" 'p_id: form.id,' 'p_id: null,' $TP
m "$F" 'fecha: diaColombia(ahora)' 'fecha: ahora.slice(0, 10)' $TP
m "$F" 'hojas: hojasVacias(2)' 'hojas: hojasVacias(3)' $TP
m "$F" '{puedeEditar && f.estado === "abierto" && (' '{puedeEditar && (' $TP
m "$F" '{manda && (borrar === f.id' '{true && (borrar === f.id' $TP
m "$F" 'if (error) return setMal(traducirError(error.message));
    setForm(null);' 'if (error) { setForm(null); return setMal(traducirError(error.message)) }
    setForm(null);' $TP
m "$F" '{puedeEditar && (
            <div className="cl-acciones">' '{true && (
            <div className="cl-acciones">' $TP
m "$F" 'Math.min(100, Math.max(1, Math.floor(Number(cuantas) || 1)))' '1' $TP
