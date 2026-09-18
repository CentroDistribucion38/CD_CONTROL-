/* =====================================================================
   POR CADA RUTA REGISTRADA: QUÉ ENLACES DIBUJA EL RIEL.
   Se comprueba contra el REGISTRO, no contra lo que uno se acuerda.

   Desde que Roturas se mudó dentro de Quiebra hay módulos CON RAMAS, y
   eso cambia lo que el riel enseña: estando dentro de una rama se ven
   SUS pantallas, y parado en la bifurcación se ven las ramas. Las
   catorce pantallas de Quiebra no salen nunca juntas — y un arnés que
   las listara todas de corrido estaría imprimiendo algo que no pasa.
   ===================================================================== */
import { execSync } from 'child_process';
import { unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const salida = '.arnes/reg.mjs';
execSync(`npx esbuild src/modulos/registro.ts --bundle --format=esm --outfile=${salida}`, { stdio: 'pipe' });
const { MODULOS, moduloPorRuta, ramaDeRuta, rutasRegistradas } =
  await import(pathToFileURL(salida).href + '?t=' + Date.now());
unlinkSync(salida);

let malas = 0;

/* ---------- 1. NINGUNA FUGA A OTRO MÓDULO ---------- */
for (const r of rutasRegistradas()) {
  const m = moduloPorRuta(r);
  if (!m) { console.log(`SIN MÓDULO ${r}`); malas++; continue }

  /* Lo que el riel dibujaría estando en `r`: la vuelta, el módulo, la
     rama en la que se está (si hay) y las pantallas que correspondan —
     las de esa rama, o las ramas mismas si se está en la bifurcación. */
  const rama = ramaDeRuta(m, r);
  const visibles = m.secciones.filter((s) => !s.oculto);
  const pantallas = m.ramas?.length
    ? (rama ? visibles.filter((s) => s.rama === rama.id) : m.ramas.map((x) => ({ ruta: x.ruta })))
    : visibles;

  const dibuja = ['/inicio', m.ruta, ...(rama ? [rama.ruta] : []), ...pantallas.map((s) => s.ruta)];
  const ajenas = dibuja.filter((x) => x !== '/inicio' && moduloPorRuta(x)?.id !== m.id);
  if (ajenas.length) { console.log(`FUGA en ${r}: ${ajenas.join(', ')}`); malas++ }

  /* UN MÓDULO CON RAMAS NUNCA DEJA EL RIEL VACÍO. Si estando dentro de
     una rama no salieran sus pantallas, la persona se quedaría con un
     riel de una sola línea y sin forma de moverse. */
  if (m.ramas?.length && rama && pantallas.length === 0) {
    console.log(`RIEL VACÍO en ${r}: la rama «${rama.nombre}» no tiene pantallas visibles`);
    malas++;
  }
}
console.log(malas ? `${malas} problemas` : `las ${rutasRegistradas().length} rutas dibujan solo su propio módulo ✓`);

/* ---------- 2. LO QUE SE VE, TAL COMO SE VE ---------- */
console.log('\nLo que se ve en el riel:');
for (const m of MODULOS.filter((x) => x.activo)) {
  const visibles = m.secciones.filter((s) => !s.oculto);
  if (!m.ramas?.length) {
    console.log(`  ${m.nombre.padEnd(20)} ${visibles.length} pantallas: ${visibles.map((s) => s.nombre).join(', ')}`);
    continue;
  }
  console.log(`  ${m.nombre.padEnd(20)} ${m.ramas.length} submódulos (nunca se ven todas las pantallas juntas):`);
  for (const r of m.ramas) {
    const suyas = visibles.filter((s) => s.rama === r.id);
    console.log(`    · ${r.nombre.padEnd(16)} ${suyas.length} pantallas: ${suyas.map((s) => s.nombre).join(', ')}`);
  }
  const huerfanas = visibles.filter((s) => !s.rama);
  if (huerfanas.length) {
    console.log(`    SIN RAMA: ${huerfanas.map((s) => s.nombre).join(', ')} — no saldrían en ningún riel`);
    malas++;
  }
}

if (malas) process.exitCode = 1;
