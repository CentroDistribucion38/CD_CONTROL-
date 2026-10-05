/* TODO RECTO: ningún estilo del código puede redondear más de 3px (nada de óvalos, círculos ni píldoras).
   Revisa los .css, los estilos en línea, las clases de Tailwind y el lienzo de la tarjeta de acceso.
     node .arnes/recto.mjs */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const raiz = new URL("../src", import.meta.url).pathname;
const archivos = [];
(function ir(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? ir(p) : /\.(css|tsx?|jsx?)$/.test(n) && archivos.push(p) } })(raiz);
const f = [];
for (const a of archivos) {
  const t = readFileSync(a, "utf8"); const rel = a.slice(raiz.length - 3);
  t.split("\n").forEach((l, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(l)) return;           // comentarios
    for (const m of l.matchAll(/(?:border(?:-[a-z]+){0,2}-radius|borderRadius)\s*[:=]\s*([^;}\n]+)/g)) {
      const v = m[1]; if (v.includes("`") ) continue;
      for (const n of v.matchAll(/(\d+(?:\.\d+)?)(px|%|em|rem)?/g)) {
        const num = parseFloat(n[1]), u = n[2] ?? "px";
        if ((u === "%" && num > 0) || (u !== "%" && num > 3)) f.push(`${rel}:${i + 1}  radio ${v.trim()}`);
      }
    }
    if (/\brounded-(full|lg|xl|2xl|3xl|md)\b|\brounded-\[(\d{2,}|[4-9])px\]/.test(l)) f.push(`${rel}:${i + 1}  clase de Tailwind redonda`);
    if (/\.roundRect\([^)]*,\s*(\d{2,}|[4-9])\)/.test(l) || /\.arc\(/.test(l) && !/Estiba/.test(a)) f.push(`${rel}:${i + 1}  lienzo redondo`);
  });
}
if (f.length) { console.log(`✗ ${f.length} lugares redondos:\n  ` + f.slice(0, 40).join("\n  ")); process.exit(1) }
console.log("✓ Todo recto: ningún estilo redondea más de 3 px (css, estilos en línea, Tailwind y lienzos).");
