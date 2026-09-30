#!/usr/bin/env bash
cd /home/claude/cd38-inventario
C="src/app/(app)/inventario/corte/Corte.tsx"; K=src/modulos/inventario/corte.ts
TC=.arnes/inv-corte-cuentas.mjs; TM=.arnes/inv-corte-multi.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$K" 'const mov = entran.reduce((t, m) => t + (m.mov as number), 0);' 'const mov = entran[0].mov as number;' $TC
m "$K" 'const entran = modulos.filter((m) => m.mov !== null);' 'const entran = modulos.filter((m) => m.a && m.b);' $TC
m "$K" '    mov, dif: pasadas - mov, motivo: null, modulos,
    aviso: fuera.length' '    mov, dif: pasadas - mov, motivo: null, modulos,
    aviso: false' $TC
m "$K" 'mov: signo * (ini - fin), nota: null };' 'mov: Math.abs(ini - fin), nota: null };' $TC
m "$K" '[...sit].sort((a, b) => a.orden - b.orden).forEach' '[...sit].forEach' $TC
m "$K" 'nuevos?.origen.length ? nuevos.origen : viejo(' 'viejo(r.origen_ubicacion_id, r.origen_cant, r.origen_unidad).length ? [] : viejo(' $TC
m "$K" '...b.filter((x) => !enA.has(x.ubicacion_id)).map((x) => x.ubicacion_id)]' ']' $TC
m "$C" 'else if (vistos.has(u.id)) aqui.push' 'else if (false) aqui.push' $TM
m "$C" 'if (i > 0 && !s.calle && !s.modulo && !s.cant.trim()) return;' '' $TM
m "$C" '[k]: [...l[k], sitioVacio(l[k][l[k].length - 1]?.unidad)]' '[k]: [...l[k], sitioVacio()]' $TM
m "$C" 'lista.length > 1 && (
                <div className="cl-mod-cab">' 'true && (
                <div className="cl-mod-cab">' $TM
m "$C" 'r.origenes.length ? r.origenes.map(desdeSitio) : [sitioVacio()]' '[sitioVacio()]' $TM
m "$C" 'l.map((x) => `${nombreUbi(x.ubicacion_id)}: ${fmt(x.cant)} ${x.unidad}`).join(" + ")' 'l.slice(0, 1).map((x) => `${nombreUbi(x.ubicacion_id)}: ${fmt(x.cant)} ${x.unidad}`).join(" + ")' $TM
m "$C" 'lugares(l.origen) !== lugares(base.origen)' 'false' .arnes/inv-corte-pantalla.mjs
m "$C" 'const sencillo = mods.length === 1 ||' 'const sencillo = true ||' $TM
m "$C" 'filter((_, j) => j !== i)' 'filter((_, j) => j !== 0)' $TM
echo FIN
