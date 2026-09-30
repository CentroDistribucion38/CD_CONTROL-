#!/usr/bin/env bash
cd /home/claude/cd38-inventario
C="src/app/(app)/inventario/corte/Corte.tsx"; T=.arnes/inv-corte-sinsenal.mjs; Q=src/modulos/inventario/cola.ts
m(){ bash .arnes/_mutar.sh "$@"; }
m "$C" 'if (typeof navigator !== "undefined" && !navigator.onLine) return onPendiente(pend);' '' $T
m "$C" 'if (error && esFalloDeRed(error.message)) return onPendiente(pend);' '' $T
m "$C" 'if (error) return setMal(traducirError(error.message));
    onGuardado(tipo);' 'if (error) return onPendiente(pend);
    onGuardado(tipo);' $T
m "$C" 'if (data && data.length > 0) return { ok: true };' '' $T
m "$C" 'ponerCola(r.quedan);' 'ponerCola([]);' $T
m "$C" 'if (navigator.onLine && colaRef.current.length > 0) void enviarColaRef.current();' '' $T
m "$C" 'const sube = () => { setEnLinea(true); void enviarColaRef.current() };' 'const sube = () => { setEnLinea(true) };' $T
m "$C" 'ponerCola([...colaRef.current, it]);' 'ponerCola([it, ...colaRef.current]);' $T
m "$C" '.eq("tipo", "inicial")' '' $T
m "$C" 'p_bodega: p.bodega, p_tipo: p.tipo, p_inicial: p.inicial,' 'p_bodega: p.bodega, p_tipo: p.tipo, p_inicial: null,' $T
m "$C" 'guardarCola(llaveCola, nueva);' '' $T
m "$C" 'ponerCola(colaRef.current.filter((x) => x.id !== it.id))' 'ponerCola([])' $T
m "$Q" 'ya tiene su corte final' 'NOEXISTE' $T
echo FIN
