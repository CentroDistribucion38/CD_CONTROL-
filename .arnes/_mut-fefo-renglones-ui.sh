#!/usr/bin/env bash
cd /home/claude/cd38-inventario
B="src/app/(app)/inventario/base/Base.tsx"; Q="src/app/(app)/inventario/base/QuitarRenglones.tsx"; T=.arnes/inv-fefo-eliminar.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$B" 'const puedeQuitar = manda && pestania === "base";' 'const puedeQuitar = pestania === "base";' $T
m "$B" 'const puedeQuitar = manda && pestania === "base";' 'const puedeQuitar = manda;' $T
m "$B" 'puedeQuitar ? filas.filter((r) => marcadosR.has(r.id)) : [];' 'puedeQuitar ? crudas.filter((r) => marcadosR.has(r.id)) : [];' $T
m "$B" 'new Set(filas.map((r) => r.id))' 'new Set(crudas.map((r) => r.id))' $T
m "$B" 'const todosMarcados = filas.length > 0 && elegidosR.length === filas.length;' 'const todosMarcados = false;' $T
m "$B" 'alQuitar={() => setMarcadosR(new Set())}' 'alQuitar={() => {}}' $T
m "$B" 'className={puedeQuitar && marcadosR.has(r.id) ? "marcado" : undefined}' 'className={undefined}' $T
m "$Q" '{ p_lineas: ids }' '{ p_lineas: [] }' $T
m "$Q" '    alQuitar();
    router.refresh();' '    alQuitar();' $T
m "$Q" '    alQuitar();
    router.refresh();' '    router.refresh();' $T
m "$Q" 'disabled={n === 0 || ocupado}' 'disabled={ocupado}' $T
m "$Q" 'onClick={() => { setPide(true); setMal(null); setAviso(null) }}' 'onClick={() => { quitar() }}' $T
m "$Q" '    setPide(false);
    if (firma !== "") { setMal(null); setAviso(null) }' '    if (firma !== "") { setMal(null); setAviso(null) }' $T
m "$Q" 'if (firma !== "") { setMal(null); setAviso(null) }' 'setMal(null); setAviso(null)' $T
m "$Q" 'if (error) { setMal(`No se eliminó ningún renglón: ${traducirError(error.message)}`); return }' 'if (error) { setMal(`No se eliminó ningún renglón: ${traducirError(error.message)}`); alQuitar(); return }' $T
m "$Q" 'Se eliminaron ${ids.length} renglones' 'Se eliminaron ${ids.length}' $T
m "src/lib/errores.ts" '[/\bconteo_fefo_lineas_eliminar\b/, "supabase/migraciones/2026-10-fefo-renglones-eliminar.sql"],' '' $T
m "$Q" '.rpc("conteo_fefo_lineas_eliminar"' '.rpc("conteo_fefo_eliminar"' .arnes/inv-base.mjs
