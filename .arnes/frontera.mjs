/* =====================================================================
   LA FRONTERA ENTRE EL SERVIDOR Y EL CLIENTE

   ESTE ARNÉS EXISTE POR UN ERROR QUE YA PASÓ DOS VECES. Una página del
   servidor importaba `conDia` del calendario, que es "use client". Next
   no le entrega la función: le entrega una REFERENCIA al cliente, y
   llamarla en el servidor tumba la pantalla entera con «Application
   error: a server-side exception has occurred».

   Y LO PEOR NO ES QUE FALLE: es CUÁNDO falla. `conDia` solo se llamaba
   cuando la fecha no era hoy. La pantalla funcionaba perfecto todos los
   días y reventaba el día que alguien se movía al día anterior. La
   compilación pasa limpia —no es un error de tipos ni de sintaxis—, así
   que no hay nada que avise: se descubre en producción, y se descubre
   como «no me deja registrar días anteriores», que suena a un permiso y
   no a lo que es.

   LA REGLA QUE SE COMPRUEBA: una página del servidor puede importar
   COMPONENTES de un archivo "use client" —para eso está la frontera—,
   pero no puede importar VALORES ni FUNCIONES para usarlos ella misma.

   CÓMO SE DISTINGUE UN COMPONENTE, y la primera versión de esto se
   equivocó: daba por componente cualquier nombre que empezara en
   mayúscula. Con esa regla, `CORTES` —una lista de constantes— pasó el
   arnés, la página del servidor le hizo `.some()` y tumbó el tablero
   entero con «a server-side exception». Un nombre en mayúscula no es
   un componente: un nombre en PascalCase lo es.

       EscogerCorte   → mayúscula y sigue minúscula: componente, pasa
       CORTES         → TODO mayúsculas: es una constante, se reporta
       conDia         → minúscula: función, se reporta

   La diferencia son dos caracteres en una expresión regular y es la
   diferencia entre cazar el error y dejarlo salir a producción.

   Los `import type` no cuentan: se borran al compilar.
   ===================================================================== */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const SRC = join(RAIZ, "src");

/* Todos los .ts/.tsx de src, sin node_modules. */
function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { archivos(p, out); continue; }
    if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

const esCliente = (p) => {
  const primera = readFileSync(p, "utf8").trimStart().slice(0, 20);
  return primera.startsWith('"use client"') || primera.startsWith("'use client'");
};

/* Resuelve un import a un archivo real: alias @/, relativo, con o sin
   extensión, y carpeta/index. */
function resolver(desde, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(desde), spec);
  else return null;                       // paquete de node_modules
  for (const c of [base + ".tsx", base + ".ts",
                   join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/* Los nombres que trae un import, marcando los `type`. */
function importes(texto) {
  const out = [];
  const re = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(texto))) {
    const todoTipo = Boolean(m[1]);
    for (let n of m[2].split(",")) {
      n = n.trim();
      if (!n) continue;
      const soloTipo = todoTipo || /^type\s/.test(n);
      n = n.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (n) out.push({ nombre: n, spec: m[3], soloTipo });
    }
  }
  return out;
}

const fallas = [];
let revisados = 0;

for (const f of archivos(SRC)) {
  if (esCliente(f)) continue;             // el cliente puede importar lo que quiera
  revisados += 1;
  const texto = readFileSync(f, "utf8");

  for (const { nombre, spec, soloTipo } of importes(texto)) {
    if (soloTipo) continue;               // los tipos se borran al compilar
    const destino = resolver(f, spec);
    if (!destino || !esCliente(destino)) continue;

    /* PascalCase = componente de React: cruzar la frontera es
       exactamente para lo que sirve. Cualquier otra cosa —minúscula o
       TODO_MAYÚSCULAS— es un valor, y si el servidor lo usa, revienta. */
    const esComponente = /^[A-Z][a-z]/.test(nombre);
    if (!esComponente) {
      fallas.push(
        `${f.replace(RAIZ, "")}\n      importa  ${nombre}  de  ${spec}\n` +
        `      …que es "use client". El servidor recibe una referencia, no el valor:\n` +
        `      al usarlo tumba la pantalla. Múdalo a un archivo sin "use client".`);
    }
  }
}

console.log(`Revisados ${revisados} archivos del servidor.`);
if (fallas.length) {
  console.error("\nCRUZAN LA FRONTERA:\n\n  · " + fallas.join("\n\n  · ") + "\n");
  process.exit(1);
}
console.log("Ninguno llama funciones que viven del otro lado de la frontera.");
