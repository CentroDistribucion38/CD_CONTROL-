#!/usr/bin/env bash
cd /home/claude/cd38-inventario
M="src/app/(app)/roturas/Miniatura.tsx"; D="src/app/(app)/roturas/en-sitio/desacuerdos/Desacuerdos.tsx"; V="src/app/(app)/roturas/en-sitio/visto-bueno/VistoBueno.tsx"; C="src/app/(app)/roturas/roturas.css"; T=.arnes/rt-miniatura.mjs
m(){ bash .arnes/_mutar.sh "$@"; }
m "$D" '{r.fotos > 0 && <Miniatura id={r.id} cuantas={r.fotos} etiqueta={`Foto de ${r.codigo}`} />}' '' $T
m "$V" '{r.fotos > 0 && <Miniatura id={r.id} cuantas={r.fotos} etiqueta={`Foto de ${r.codigo}`} />}' '' $T
m "$M" 'if (cuantas <= 0 || !caja.current) return;' 'if (!caja.current) return;' $T
m "$M" '{url && !rota && (' '{false && (' $T
m "$M" 'onError={() => setRota(true)}' '' $T
m "$M" 'j.fotos?.find((f: { url: string | null }) => f.url)?.url' 'j.fotos?.[1]?.url' $T
m "$C" '.rt .vb-miniatura { position: absolute; inset: 0; overflow: hidden }' '.rt .vb-miniatura { overflow: hidden }' $T
m "$C" '  width: 96px; height: 72px;' '  width: 70px; height: 52px;' $T
