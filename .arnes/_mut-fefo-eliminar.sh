#!/usr/bin/env bash
cd /home/claude/cd38-inventario
E="src/app/(app)/inventario/base/EliminarFefos.tsx"; B="src/app/(app)/inventario/base/Base.tsx"; T=.arnes/inv-fefo-eliminar.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$E" 'p_codigo: c.codigo' 'p_codigo: ""' $T
m "$E" 'router.refresh()' 'void 0' $T
m "$E" 'if (error) { falla =' 'if (false) { falla =' $T
m "$E" 'if (error) { falla = { codigo: c.codigo, texto: traducirError(error.message) }; break }' 'if (error) { falla = { codigo: c.codigo, texto: traducirError(error.message) } }' $T
m "$E" 'new Set([...m].filter((id) => !idos.includes(id)))' 'new Set<string>()' $T
m "$E" 'setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n });
    setPide(false);' 'setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n });' $T
m "$E" 'disabled={elegidos.length === 0 || ocupado}' 'disabled={ocupado}' $T
m "$E" 'new Set(lista.map((c) => c.id))' 'new Set(lista.slice(1).map((c) => c.id))' $T
m "$E" '(b.fecha_analisis ?? "").localeCompare(a.fecha_analisis ?? "")' '(a.fecha_analisis ?? "").localeCompare(b.fecha_analisis ?? "")' $T
m "$B" '{manda && <EliminarFefos' '{true && <EliminarFefos' $T
m "$B" 'manda = false,' 'manda = true,' $T
