#!/usr/bin/env bash
# Mutantes de la lectura de código de La base (inv-base.mjs): cada uno debe hacerlo FALLAR.
cd /home/claude/cd38-inventario
BT="src/app/(app)/inventario/base/Base.tsx"; PG="src/app/(app)/inventario/base/page.tsx"; FE=src/modulos/inventario/fefo.ts; RG=src/modulos/registro.ts; ER=src/lib/errores.ts; MG=supabase/migraciones/2026-09-inventario-portada.sql
T=.arnes/inv-base.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m $FE 'enviadas: lineas.filter((r) => deEnviados.has(r.conteo_id)),' 'enviadas: lineas,' $T
m $FE 'abiertas: lineas.filter((r) => !deEnviados.has(r.conteo_id)),' 'abiertas: lineas,' $T
m "$BT" '"sep=;",' '' $T
m "$BT" 'new Blob(["﻿" +' 'new Blob([" " +' $T
m "$BT" 'bajar(filas, [...COLUMNAS' 'bajar(crudas, [...COLUMNAS' $T
m "$BT" 'return [...vistas].sort' 'return vistas.sort' $T
m "$BT" 'return cruzar(enviadas.filter((r) => ids.has(r.conteo_id)), incluidos);' 'return cruzar([...enviadas, ...abiertas], incluidos);' $T
m "$BT" '{manda && admin && (' '{admin && (' $T
m "$PG" 'permisos.puedeVer("/inventario/base")' 'true' $T
m "$PG" 'puedeMarcar={permisos.manda || permisos.puedeEditar("/inventario/base")}' 'puedeMarcar={true}' $T
m "$PG" 'manda={permisos.manda}' 'manda={true}' $T
m $ER '2026-10-base-pasados.sql' '2026-10-fiscal-contar.sql' $T
m $RG '      { nombre: "La base", ruta: "/inventario/base", rama: "conteos" },' '' $T
m $MG "update public.perfiles" "update public.perfil_x" $T
echo FIN
