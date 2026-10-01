#!/usr/bin/env bash
cd /home/claude/cd38-inventario
K=src/modulos/inventario/modulos-hoja.ts; C="src/app/(app)/inventario/conteo/Contar.tsx"; T=.arnes/inv-conteo-modulos-hoja.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$K" '/^\d/.test(modulo)' 'true' $T
m "$K" 'if (!hay.has(`${c}|${m}`))' 'if (true)' $T
m "$K" 'C: [...numerados(36), "PASILLO", "TANDEM", "DEPA", "PALE", "H"]' 'C: [...numerados(36)]' $T
m "$K" 'P: numerados(49)' 'P: numerados(45)' $T
m "$K" 'D: [...numerados(36), "DEPA", "PALE", "H", "TUNEL"]' 'D: [...numerados(36), "DEPA", "PALE", "H", "TUNEL", "PASILLO"]' $T
m "$C" '...Object.keys(MODULOS_DE_LA_HOJA)])]' '])]' $T
m "$C" 'modulosQueFaltan(ubicaciones.filter((u) => u.activa), b.calle)' '[]' $T
m "$C" 'delModulo.length === 0 && b.base && !moduloConLados' 'false && !moduloConLados' $T
m "$C" 'u?.calle ?? base.split("|")[0] ?? x.calle' 'u?.calle ?? x.calle' $T
