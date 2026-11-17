#!/bin/sh
# ¿VERCEL SE SALTA ESTA COMPILACIÓN? (ignoreCommand de vercel.json)
#   exit 0 → no cambió nada que se compile: se salta.
#   exit 1 → compila.
# Una rama nueva no trae despliegue anterior (VERCEL_GIT_PREVIOUS_SHA vacío
# o fuera del clon): git saldría con 128 y Vercel lo marca como ERROR.
# Por eso cualquier duda termina en 1: compilar.
P="$VERCEL_GIT_PREVIOUS_SHA"
[ -n "$P" ] || exit 1
git cat-file -e "$P^{commit}" 2>/dev/null || exit 1
git diff --quiet "$P" HEAD -- src public package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs vercel.json scripts/vercel-ignorar.sh || exit 1
exit 0
