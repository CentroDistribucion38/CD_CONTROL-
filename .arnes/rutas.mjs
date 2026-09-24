/* Cada ruta registrada TIENE que encontrar su módulo. Una que no lo
   encuentre es una pantalla sin migas y sin riel: sin salida. */
import { execSync } from 'child_process';
import fs from 'fs';
execSync('npx esbuild src/modulos/registro.ts --bundle --format=esm --outfile=.arnes/reg.mjs', {stdio:'pipe'});
const { MODULOS, moduloPorRuta, rutasRegistradas } = await import('/home/claude/cd38-inventario/.arnes/reg.mjs');
let malas = 0;
for (const r of rutasRegistradas()) {
  const m = moduloPorRuta(r);
  const esperado = MODULOS.find(x => x.ruta === r || x.secciones.some(s => s.ruta === r));
  const ok = m && esperado && m.id === esperado.id;
  if (!ok) { console.log(`SIN MÓDULO  ${r}  -> ${m?.id ?? 'ninguno'} (esperaba ${esperado?.id})`); malas++ }
}
console.log(malas === 0
  ? `las ${rutasRegistradas().length} rutas registradas encuentran su módulo ✓`
  : `${malas} rutas huérfanas`);
/* Y una que no existe no debe inventarse un módulo. */
console.log('ruta inventada ->', moduloPorRuta('/no/existe')?.id ?? 'ninguno (bien)');
