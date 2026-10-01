#!/usr/bin/env bash
cd /home/claude/cd38-inventario
E="src/app/(app)/inventario/base/EliminarFefos.tsx"; B="src/app/(app)/inventario/base/Base.tsx"; T=.arnes/inv-fefo-eliminar.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$E" 'p_codigo: c.codigo' 'p_codigo: ""' $T
m "$E" 'router.refresh();' '' $T
m "$E" 'if (error) return setMal(traducirError(error.message));' '' $T
m "$E" 'setPide(null);
    setAviso' 'setAviso' $T
m "$E" 'disabled={ocupado} onClick={() => setPide(null)}' 'disabled={ocupado} onClick={() => eliminar(c)}' $T
m "$E" '(b.fecha_analisis ?? "").localeCompare(a.fecha_analisis ?? "")' '(a.fecha_analisis ?? "").localeCompare(b.fecha_analisis ?? "")' $T
m "$B" '{manda && <EliminarFefos' '{true && <EliminarFefos' $T
m "$B" 'manda = false,' 'manda = true,' $T
