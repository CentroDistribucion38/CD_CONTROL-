#!/usr/bin/env bash
cd /home/claude/cd38-inventario
C="src/app/(app)/inventario/conteo/ContarFiscal.tsx"; F=src/modulos/inventario/fiscal.ts
TC=.arnes/inv-contar-fiscal-conteo.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$C" 'if (!mios || mios.length === 0) { avisar.mal("Anota al menos un renglón antes de terminar tu hoja."); return }' '' $TC
m "$C" 'if (!ok) return;
    }
    setGuardando(true);' '}
    setGuardando(true);' $TC
m "$C" 'p_terminado: activo' 'p_terminado: true' $TC
m "$C" 'p_terminado: activo' 'p_terminado: false' $TC
m "$C" 'p_hoja: hoja.hojaId, p_terminado' 'p_hoja: "x", p_terminado' $TC
m "$C" 'if (error) { avisar.mal(error.message); return }
    setTerminos' 'setTerminos' $TC
m "$C" 'termine: activo, parejaTermino' 'termine: true, parejaTermino' $TC
m "$C" 'const cerrada = hoja.puedeContar && hoja.puedeTerminar && estadoT.termine;' 'const cerrada = false;' $TC
m "$C" 'const cerrada = hoja.puedeContar && hoja.puedeTerminar && estadoT.termine;' 'const cerrada = estadoT.termine;' $TC
m "$C" 'hidden={pestania !== "anotar" || cerrada}' 'hidden={pestania !== "anotar"}' $TC
m "$C" 'disabled={guardando || cerrada} onClick={() => quitar(r)}' 'disabled={guardando} onClick={() => quitar(r)}' $TC
m "$C" '{estadoT.parejaTermino
              ? "Tu pareja también terminó' '{!estadoT.parejaTermino
              ? "Tu pareja también terminó' $TC
m "$C" '`Falta que ${hoja.pareja ?? "tu pareja"} termine la suya.`' '"Falta que termine."' $TC
m "$C" '{hoja.puedeTerminar && (
              <button type="button" className="btn plano fc-terminar-ir"' '{(
              <button type="button" className="btn plano fc-terminar-ir"' $TC
m "$C" 'disabled={guardando || (mios?.length ?? 0) === 0}
                      title' 'disabled={guardando}
                      title' $TC
m "$C" '{!cerrada && hoja.puedeTerminar && hoja.puedeContar && (mios?.length ?? 0) > 0 && (' '{!cerrada && hoja.puedeContar && (mios?.length ?? 0) > 0 && (' $TC
m "$C" '{!cerrada && hoja.puedeTerminar && hoja.puedeContar && (mios?.length ?? 0) > 0 && (' '{!cerrada && hoja.puedeTerminar && (mios?.length ?? 0) > 0 && (' $TC
m "$C" '{!cerrada && hoja.puedeTerminar && hoja.puedeContar && (mios?.length ?? 0) > 0 && (' '{!cerrada && hoja.puedeTerminar && hoja.puedeContar && (' $TC
m "$C" 'onClick={() => terminar(false)}>Reabrir mi hoja</button>
        </div>' 'onClick={() => terminar(true)}>Reabrir mi hoja</button>
        </div>' $TC
m "$C" 'avisar.bien(activo ? "Hoja terminada." : "Hoja reabierta: ya puedes anotar y quitar renglones.");' 'avisar.bien("Hoja terminada.");' $TC
m "$C" '{nf.format(totalMio)} cajas' '0 cajas' $TC
m "$F" 'parejaTermino: ' 'parejaTermino: true || ' $TC
m "$F" 'puedeTerminar: ' 'puedeTerminar: true || ' $TC
echo FIN
