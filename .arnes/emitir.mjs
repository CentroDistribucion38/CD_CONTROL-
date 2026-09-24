import fs from 'fs';
const T = JSON.parse(fs.readFileSync('.arnes/temas.json','utf8'));
const css = fs.readFileSync('src/app/globals.css','utf8');

/* Los encabezados de grupo del bloque oficial, para que los tres bloques
   nuevos se lean igual que los que ya están. */
const raiz = css.slice(css.indexOf('\n:root {'), css.indexOf('\n/* --- Tinta y ámbar'));
const lineas = raiz.split('\n');
const orden = [];           // [{grupo}|{token}]
for (const l of lineas) {
  const g = l.match(/^\s*\/\* (.+?) \*\/\s*$/);
  const t = l.match(/^\s*(--c-[0-9a-f]{6})\s*:\s*#[0-9a-f]{6};\s*\/\* (\d+×)/);
  if (g && !/^-/.test(g[1])) orden.push({ grupo: g[1] });
  else if (t) orden.push({ tok: t[1], uso: t[2] });
}

const CFG = {
  negro: { nombre:'1 · Negro y ámbar', tinta:'#0D0D0D', velo:'13,13,13',
           veloA:'rgba(255,192,0,.16)', grupo:'#3A3A3A' },
  gris:  { nombre:'2 · Gris claro y ámbar', tinta:'#141414', velo:'20,20,20',
           veloA:'rgba(255,192,0,.18)', grupo:'#3F3F3F' },
  halo:  { nombre:'3 · Negro con halo ámbar y rojo', tinta:'#111111', velo:'17,17,17',
           veloA:'rgba(255,192,0,.18)', grupo:'#3A3A3A' },
};

const ANCLA = new Set(['--c-04203f','--c-0b4ea2','--c-f4f7fb','--c-eef1f5','--c-d5dce5','--c-5b6b7f']);

function bloque(id) {
  const c = CFG[id];
  const val = Object.fromEntries(T[id].map(x=>[x.n, x.v]));
  const out = [];
  out.push(`[data-tema="${id}"] {`);
  for (const e of orden) {
    if (e.grupo) { out.push(``, `  /* ${e.grupo} */`); continue }
    const marca = ANCLA.has(e.tok) ? '   ← tuyo' : '';
    out.push(`  ${e.tok}:${' '.repeat(Math.max(1,13-e.tok.length))}${val[e.tok].toLowerCase()};   /* ${e.uso}${marca} */`);
  }
  out.push(``,
`  /* Translúcidos */`,
`  --c-velo:       rgba(${c.velo},.62);`,
`  --c-velo-hondo: rgba(${c.velo},.90);`,
`  --c-raya:       rgba(255,192,0,.35);`,
`  --c-degrade:    rgba(150,150,150,.40);`,
``,
`  /* El acento de marca y el texto que va ENCIMA de él. */`,
`  --c-marca:      #ffc000;   /* ← tuyo */`,
`  --c-marca-txt:  ${c.tinta.toLowerCase()};`,
`  --c-marca-vivo: #ffd24d;   /* hover */`,
`  --c-marca-hondo: #d9a300;`,
`  --c-marca-filo: #ffc000;`,
`  --c-marca-velo: ${c.veloA};`,
``,
`  /* Tu #FF0000 es el "ojo con esto" de estos tres temas. Va tal cual`,
`     donde es MANCHA —el avatar, el tajo del sello, la marca de una`,
`     cifra en alerta—, que es como lo usaste en el mockup. */`,
`  --c-oro:        #ff0000;   /* ← tuyo */`,
``,
`  /* La alarma del KPI —"el mes va corto de meta"— lleva texto blanco`,
`     encima. #FF0000 con blanco da 4,00:1 y no pasa 4,5:1, así que aquí`,
`     va el mismo rojo un paso más hondo: 5,9:1 y se lee como el mismo`,
`     color. Es el único sitio donde tu rojo no va literal, y es porque`,
`     ahí es texto y no mancha. */`,
`  --c-alarma:     #c00000;`,
`  --c-alarma-txt: #ffffff;`,
``,
`  /* La franja que agrupa columnas en las tablas. Gris oscuro, como`,
`     todo lo demás de estos temas. */`,
`  --c-grupo:      ${c.grupo.toLowerCase()};`,
``,
`  /* Los alias de Tailwind y los antiguos --bv-* se resuelven en :root,`,
`     que está por FUERA de este bloque: hay que volver a declararlos. */`,
`  --color-bv-azul:        var(--c-0060b0);`,
`  --color-bv-azul-oscuro: var(--c-004a8a);`,
`  --color-bv-tinta:       var(--c-f4f7fb);`,
`  --color-bv-linea:       var(--c-dbe4f0);`,
`  --color-bv-texto:       var(--c-0b1f35);`,
`  --color-bv-texto-2:     var(--c-5a7192);`,
`  --bv-azul:              var(--c-0060b0);`,
`  --bv-azul-oscuro:       var(--c-004a8a);`,
`  --bv-tinta:             var(--c-f4f7fb);`,
`  --bv-linea:             var(--c-dbe4f0);`,
`  --bv-texto:             var(--c-0b1f35);`,
`  --bv-texto-2:           var(--c-5a7192);`,
``,
`  /* Y el color y el fondo, por lo mismo. */`,
`  color: var(--bv-texto);`,
`  background: var(--bv-tinta);`,
`}`);
  return out.join('\n');
}
fs.writeFileSync('.arnes/bloques.css', ['negro','gris','halo'].map(bloque).join('\n\n'));
console.log(fs.readFileSync('.arnes/bloques.css','utf8').split('\n').length, 'líneas generadas');
console.log(bloque('negro').split('\n').slice(0,14).join('\n'));
