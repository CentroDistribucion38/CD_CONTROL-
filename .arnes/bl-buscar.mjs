/* =====================================================================
   EL BUSCADOR COMPARTIDO — que se vea, en los siete temas.

   «Mira cómo se ve de horrible.»

   ---------------------------------------------------------------------
   EL ERROR QUE SE ESTÁ CAZANDO
   ---------------------------------------------------------------------
   Al sacar este componente de Roturas a `components/`, su CSS se llevó
   `var(--c-papel-m)` del bloque de al lado. Ese NO es un token de tema:
   es una variable LOCAL declarada dentro de `.ml-caja`. Fuera de ese
   selector no resuelve, así que `background` se quedó en TRANSPARENTE y
   la lista de materiales salió encima del formulario dejando ver los
   botones y el contador atravesados con el texto de las opciones. En el
   teléfono era ilegible.

   UN COLOR QUE NO RESUELVE NO SE VE EN EL CÓDIGO: `var(--lo-que-sea)`
   se lee igual esté definido o no. Solo se ve midiendo lo pintado, y
   por eso esto mide el color COMPUTADO y no el CSS.

   Lo que tiene que ser cierto, en los SIETE temas:

   1. LA LISTA ES OPACA. Un desplegable que deja ver lo de abajo no es
      un desplegable.
   2. CADA OPCIÓN ES OPACA TAMBIÉN. Con la lista opaca pero las
      opciones transparentes pasa exactamente lo mismo.
   3. EL TEXTO CONTRASTA contra ese fondo — 4.5 como en todo lo demás.
   4. LA LISTA ESTÁ POR ENCIMA de lo que hay debajo.
   5. NINGÚN COLOR DEL BLOQUE SE QUEDA SIN RESOLVER. Se mira el CSS y
      se exige que cada `var(--x)` de `bl-` tenga respaldo o esté
      declarado en el propio bloque.

     node .arnes/bl-buscar.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

const glob = readFileSync(R("src/app/globals.css"), "utf8");

/* ---------- 5. NINGÚN COLOR SIN RESOLVER, leído del CSS ---------- */
{
  // SE QUITAN LOS COMENTARIOS **ANTES** DE CORTAR. Cortando primero, el
  // trozo empezaba en MITAD del comentario de cabecera —donde este mismo
  // arnés explica el error— y el cierre suelto dejaba la prosa dentro:
  // el arnés se ponía rojo leyendo su propia explicación.
  //
  // Y ESTA NOTA VA CON `//` Y NO CON BLOQUE, porque al escribirla con
  // bloque metí dentro la secuencia que lo cierra y partí el archivo en
  // dos. Tres veces ya con lo mismo en este proyecto.
  const limpio = glob.replace(/\/\*[\s\S]*?\*\//g, "");
  const bloque = limpio.slice(limpio.lastIndexOf(".bl {"));
  /* LO QUE EL PROPIO BLOQUE DECLARA no hace falta que lleve respaldo. */
  const propias = new Set([...bloque.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));
  const sinRespaldo = [...bloque.matchAll(/var\((--[a-z0-9-]+)\s*\)/g)]
    .map((m) => m[1])
    .filter((v) => !propias.has(v));
  ok(sinRespaldo.length === 0,
     `el bloque bl- usa ${[...new Set(sinRespaldo)].join(", ")} sin respaldo y sin declararlo: ` +
     "si ese token no existe, el color no resuelve y no se ve en el código");
}

writeFileSync(R(".arnes/_bl-entrada.tsx"), `
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BuscarEnLista } from "../src/components/BuscarEnLista";

/* DEBAJO DEL BUSCADOR VA CONTENIDO A PROPÓSITO: es lo que la lista tapa
   cuando se abre, y lo que se veía atravesado cuando el fondo no
   resolvía. Sin esto, «la lista es opaca» no se podría comprobar
   mirando. */
function Caja() {
  const [v, setV] = useState("");
  return (
    <div style={{ padding: 16 }}>
      <BuscarEnLista id="p" valor={v} cambiar={setV}
        opciones={Array.from({ length: 40 }, (_, i) => ({
          clave: "SKU" + (1000 + i),
          nombre: i === 3 ? "AGUA ZALVA SIN GAS PET 1.5 L X 6" : "Producto " + i,
          codigo: String(13799 + i),
        }))} />
      <div id="debajo" style={{ background: "#111111", color: "#ffffff", padding: 40 }}>
        UNIDADES CONTAMINADAS · Atrás · Siguiente
      </div>
    </div>
  );
}
createRoot(document.getElementById("r")!).render(<Caja />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_bl-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", alias: { "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const temas = [...new Set([...glob.matchAll(/\[data-tema="([a-z]+)"\]/g)].map((m) => m[1]))];

const aRgb = (s) => {
  const srgb = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
  if (srgb) return [1, 2, 3].map((i) => Math.round(Number(srgb[i]) * 255));
  const m = s.match(/(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/);
  return m ? [1, 2, 3].map((i) => Math.round(Number(m[i]))) : null;
};
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 };
  return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
};
const contraste = (a, b) => {
  if (!a || !b) return 0;   /* «no se encontró» es 0, nunca un número alto. */
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + .05) / (y + .05);
};
/* TRANSPARENTE ES `rgba(0,0,0,0)` O `transparent`. Es exactamente lo
   que devolvía el fondo cuando el token no resolvía. */
const opaco = (c) => !!c && !/transparent/i.test(c) && !/,\s*0\s*\)$/.test(c);

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

console.log("tema      lista opaca  opción opaca  texto  código  encima");
for (const t of ["", ...temas]) {
  await pg.setViewportSize({ width: 420, height: 900 });
  await pg.setContent(`<!doctype html><html${t ? ` data-tema="${t}"` : ""}>
    <head><meta charset="utf-8"><style>${glob} html,body{margin:0}</style></head>
    <body><div id="r"></div>
    <script>${js.replace(/<\/script/g, "\\u003c/script")}</script></body></html>`);
  await pg.waitForSelector(".bl-campo", { timeout: 10000 });
  await pg.click(".bl-campo");
  await pg.waitForSelector(".bl-lista", { timeout: 3000 });

  const m = await pg.evaluate(() => {
    const lista = document.querySelector(".bl-lista");
    const op = document.querySelector(".bl-op");
    const nom = op.querySelector("b"), cod = op.querySelector("span");
    const debajo = document.getElementById("debajo");
    const rl = lista.getBoundingClientRect(), rd = debajo.getBoundingClientRect();
    /* ¿DE VERDAD ESTÁ ENCIMA? Se pregunta al navegador quién recibe el
       toque en el punto donde se cruzan: un z-index alto no sirve si el
       de abajo está en otra capa. */
    const cruce = rl.bottom > rd.top && rl.top < rd.bottom
      ? document.elementFromPoint(rl.left + 20, Math.max(rl.top, rd.top) + 5) : null;
    return {
      lista: getComputedStyle(lista).backgroundColor,
      op: getComputedStyle(op).backgroundColor,
      nom: getComputedStyle(nom).color,
      cod: getComputedStyle(cod).color,
      tapa: cruce ? (lista.contains(cruce) || cruce === lista) : true,
      solapa: rl.bottom > rd.top,
    };
  });

  const cNom = contraste(aRgb(m.op), aRgb(m.nom));
  const cCod = contraste(aRgb(m.op), aRgb(m.cod));
  console.log(`${(t || "(base)").padEnd(9)} ${(opaco(m.lista) ? "sí" : "NO").padEnd(12)} ` +
    `${(opaco(m.op) ? "sí" : "NO").padEnd(13)} ${cNom.toFixed(1).padStart(5)} ` +
    `${cCod.toFixed(1).padStart(7)}  ${m.tapa ? "sí" : "NO"}`);

  ok(rotos.length === 0, `la pantalla tiró un error: ${rotos[0]}`);
  ok(opaco(m.lista),
     `${t || "base"}: la lista del buscador es TRANSPARENTE (${m.lista}) — se ve el formulario debajo`);
  ok(opaco(m.op),
     `${t || "base"}: las opciones son TRANSPARENTES (${m.op}) — el texto se mezcla con lo de abajo`);
  ok(cNom >= 4.5, `${t || "base"}: el nombre contrasta ${cNom.toFixed(2)} y el piso es 4.5`);
  ok(cCod >= 4.5, `${t || "base"}: el código contrasta ${cCod.toFixed(2)} y el piso es 4.5`);
  ok(m.solapa, `${t || "base"}: la lista no llega a solapar nada — la prueba no está midiendo`);
  ok(m.tapa, `${t || "base"}: la lista NO queda por encima de lo que hay debajo`);
}

await pg.screenshot({ path: R(".arnes/_bl-buscar.png"), fullPage: true });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log(`✓ El buscador compartido: en los ${temas.length + 1} temas la lista y sus opciones ` +
            "son opacas, el nombre y el código contrastan, la lista queda por encima de lo que " +
            "tapa, y ningún color del bloque se queda sin resolver.");
