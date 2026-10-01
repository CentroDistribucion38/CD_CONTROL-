#!/usr/bin/env bash
cd /home/claude/cd38-inventario
C=src/components/CalendarioRango.tsx; B="src/app/(app)/inventario/base/Base.tsx"; X=src/app/api/inventario/exportar/route.ts; T=.arnes/inv-base-calendario.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m $C 'const listo = ini && (fin || unDia);' 'const listo = ini && fin;' $T
m $C 'const finEf = fin || ini;' 'const finEf = fin;' $T
m $C 'marcados?.has(f) ? "marcado" : ""' '""' $T
m $C 'flechaAntes={flechaAntesEnMovil && k === 1}' 'flechaAntes={false}' $T
m "$B" 'c.fecha_analisis >= desde && c.fecha_analisis <= hasta' 'c.fecha_analisis === desde' $T
m "$B" 'exportar?desde=${desde}&hasta=${hasta}' 'exportar?desde=${desde}&hasta=${desde}' $T
m "$B" 'marcados={dias} unDia' 'marcados={dias}' $T
m "$B" '"Sin FEFO enviados en esas fechas"' '"Exportar consolidado"' $T
