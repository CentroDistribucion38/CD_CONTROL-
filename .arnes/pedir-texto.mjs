/* =====================================================================
   EL CUADRO QUE PIDE ESCRIBIR — medido, no mirado.

   «Por qué me sale ese mensaje así, si debe salir como toolbox, o sea
    algo profesional presentable.»

   Salía el cuadro del NAVEGADOR: «cd-control-one.vercel.app dice»
   encima, en gris, con un campo pelado que no dice de qué fila habla y
   con los botones del sistema. Y no es solo feo: el navegador puede
   ofrecer «no permitir más cuadros de este sitio», y desde ese momento
   anular deja de funcionar EN SILENCIO.

   QUÉ SE COMPRUEBA Y POR QUÉ:

   1. QUE NO QUEDE NINGÚN `window.prompt` NI `window.confirm` EN TODA LA
      APLICACIÓN. Es la comprobación que de verdad importa: arreglar una
      pantalla y dejar tres es exactamente lo que pasó —esta vez había
      CINCO—, y no se ve hasta que alguien toca el botón.

   2. QUE EL BOTÓN DIGA QUÉ FALTA. Apagado y mudo se toca tres veces y
      después se llama a preguntar.

   3. QUE EL FOCO ARRANQUE EN EL CAMPO. Hay algo que escribir; dejarlo
      en un botón es un tabulador de más en el PC y un toque de más en
      el celular para abrir el teclado.

   4. QUE ESCAPE CANCELE Y NUNCA CONFIRME.

   5. QUE LO QUE NO SE DESHACE PIDA TECLEAR EL CÓDIGO. En una tabla de
      trescientas filas con el botón en la misma columna, borrar la de
      al lado es cuestión de tiempo.

   6. QUE SE LEA EN LOS SIETE TEMAS y que el dedo alcance a 390 px.

     node .arnes/pedir-texto.mjs
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
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

/* =====================================================================
   1. NINGÚN CUADRO DEL NAVEGADOR, EN NINGUNA PANTALLA

   Se barre el árbol entero y no una lista escrita a mano: una lista se
   queda vieja el día que alguien añade una pantalla, y justamente eso
   es lo que no se ve hasta que se toca el botón.
   ===================================================================== */
{
  const sospechosos = [];
  const mirar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { mirar(p); continue }
      if (!/\.tsx?$/.test(e.name)) continue;
      const txt = readFileSync(p, "utf8");
      /* Fuera los comentarios: estos archivos EXPLICAN por qué ya no se
         usa `window.prompt`, y esa frase no es una llamada. */
      const limpio = txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      for (const m of limpio.matchAll(/\bwindow\.(prompt|confirm|alert)\s*\(/g))
        sospechosos.push(`${p.replace(R(""), "")} → window.${m[1]}()`);
    }
  };
  mirar(R("src"));
  /* `evento.prompt()` de AccionesApp NO es esto: es la API de instalar
     la aplicación, y se llama sobre el evento, no sobre window. */
  for (const s of sospechosos)
    fallas.push(`sigue saliendo el cuadro gris del navegador: ${s}`);
  console.log(sospechosos.length === 0
    ? "cuadros del navegador: ninguno en toda la aplicación"
    : `cuadros del navegador: ${sospechosos.length}`);
}

/* =====================================================================
   2. EL CUADRO, EN CHROMIUM
   ===================================================================== */
writeFileSync(U("./_pt-entrada.tsx"), `
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { usePedirTexto } from "@/components/PedirTexto";

function Demo({ cual }: { cual: "motivo" | "borrar" }) {
  const [pedirTexto, cuadro] = usePedirTexto();
  const [salida, setSalida] = useState<string>("(nada)");
  useEffect(() => {
    (async () => {
      const v = cual === "motivo"
        ? await pedirTexto({
            titulo: "¿Anular RB-0007?",
            dice: "La fila se queda con el motivo y con quién la anuló, y deja de contar.",
            rotulo: "Por qué se anula",
            marcador: "Queda escrito en la fila",
            confirmar: "Anular", minimo: 4, largo: true,
          })
        : await pedirTexto({
            titulo: "¿Borrar RB-0007, que ya se decidió?",
            dice: "Borrarla no deja rastro: después no hay forma de saber que estuvo.",
            rotulo: "Por qué se borra",
            confirmar: "Borrar sin rastro", peligro: true, minimo: 8, largo: true,
            debesEscribir: "RB-0007",
          });
      setSalida(v === null ? "(cancelado)" : v);
    })();
  }, []);
  return <><div id="salida">{salida}</div>{cuadro}</>;
}

createRoot(document.getElementById("r")!).render(
  <Demo cual={(window as any).__CUAL__} />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_pt-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", alias: { "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (cual, ancho = 1440, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}>
    <head><meta charset="utf-8"><style>${glob}${shell} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div id="r"></div></main></div></div>
    <script>window.__CUAL__ = ${JSON.stringify(cual)};</script>
    <script>${js.replace(/<\/script/g, "<\\/script")}</script></body></html>`);
  await pg.waitForSelector(".cf-caja", { timeout: 8000 });
};

/* ---------- EL BOTÓN DICE QUÉ FALTA ---------- */
await monta("motivo");
{
  const bt = ".cf-caja .cf-botones .cf-btn:not(.plano)";
  ok(await pg.isDisabled(bt), "deja anular sin escribir el motivo");
  ok(/Escribe/i.test(await pg.textContent(bt)),
     `el botón apagado dice «${(await pg.textContent(bt)).trim()}» y debe decir qué falta`);

  /* EL FOCO ARRANCA EN EL CAMPO. */
  const donde = await pg.evaluate(() => document.activeElement?.tagName);
  ok(donde === "TEXTAREA" || donde === "INPUT",
     `el foco arranca en «${donde}» y debe arrancar en el campo`);

  await pg.fill(".pt-campo textarea", "Se registró dos veces");
  ok(!(await pg.isDisabled(bt)), "con el motivo escrito el botón sigue apagado");
  ok(/Anular/.test(await pg.textContent(bt)), "el botón no vuelve a decir el verbo");

  /* EL BOTÓN APAGADO SE TIENE QUE LEER: es el que dice qué falta. */
  await pg.fill(".pt-campo textarea", "");
  const c = await pg.evaluate((sel) => {
    const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 };
      return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
    };
    const el = document.querySelector(sel);
    const a = lum(rgb(getComputedStyle(el).color));
    const b = lum(rgb(getComputedStyle(el).backgroundColor));
    return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 100) / 100;
  }, bt);
  ok(c >= 4.5, `el botón apagado contrasta ${c}: es el que dice qué falta, así que tiene que leerse`);
  console.log(`botón apagado: contrasta ${c}`);

  /* ESCAPE CANCELA Y NUNCA CONFIRMA. */
  await pg.fill(".pt-campo textarea", "Se registró dos veces");
  await pg.keyboard.press("Escape");
  await pg.waitForSelector(".cf-caja", { state: "detached", timeout: 3000 }).catch(() => {});
  ok((await pg.textContent("#salida")) === "(cancelado)",
     `Escape devolvió «${await pg.textContent("#salida")}» y debe cancelar`);
}

/* ---------- LO QUE NO SE DESHACE PIDE TECLEAR EL CÓDIGO ---------- */
await monta("borrar");
{
  const bt = ".cf-caja .cf-botones .cf-btn.mal";
  ok((await pg.$$(".pt-copia input")).length === 1,
     "borrar lo ya decidido no pide teclear el código: en una tabla de trescientas filas " +
     "se borra la de al lado");
  await pg.fill(".pt-campo textarea", "Quedó duplicada con la del turno anterior");
  ok(await pg.isDisabled(bt), "con el motivo pero sin teclear el código ya deja borrar");
  ok(/RB-0007/.test(await pg.textContent(bt)), "el botón no dice que falta teclear el código");
  await pg.fill(".pt-copia input", "RB-0006");
  ok(await pg.isDisabled(bt), "acepta un código que NO es el de la fila");
  await pg.fill(".pt-copia input", "RB-0007");
  ok(!(await pg.isDisabled(bt)), "con el motivo y el código tecleado el botón sigue apagado");
  await pg.click(bt);
  await pg.waitForSelector(".cf-caja", { state: "detached", timeout: 3000 }).catch(() => {});
  ok(/duplicada/.test(await pg.textContent("#salida")),
     `no devolvió el motivo: «${await pg.textContent("#salida")}»`);
}

/* ---------- LOS SIETE TEMAS Y LOS CUATRO ANCHOS ---------- */
const PARES = [["título", ".cf-caja h2"], ["explicación", ".cf-dice"],
               ["rótulo", ".pt-campo > span"], ["campo", ".pt-campo textarea"]];
console.log("\ntema      " + PARES.map((p) => p[0].padStart(13)).join(""));
for (const tema of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta("motivo", 1440, tema);
  const r = await pg.evaluate((pares) => {
    const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 };
      return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
    };
    const fondo = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c);
      }
      return [255, 255, 255];
    };
    return pares.map(([, s]) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const a = lum(rgb(getComputedStyle(el).color)), b = lum(fondo(el));
      return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 100) / 100;
    });
  }, PARES);
  console.log((tema || "oficial").padEnd(10) + r.map((v) => String(v ?? "—").padStart(13)).join(""));
  r.forEach((v, i) => {
    if (v == null) fallas.push(`falta «${PARES[i][0]}» en el tema ${tema || "oficial"}`);
    else if (v < 4.5) fallas.push(`«${PARES[i][0]}» contrasta ${v} en el tema ${tema || "oficial"}`);
  });
}

console.log("\nancho    se sale    campo   botones");
for (const ancho of [1440, 820, 390, 360]) {
  await monta("borrar", ancho);
  const m = await pg.evaluate((a) => {
    const fuera = [...document.querySelectorAll(".cf-caja *")]
      .filter((e) => e.getBoundingClientRect().right > a + 1).map((e) => e.className || e.tagName);
    const chicos = [...document.querySelectorAll(".cf-caja button, .cf-caja input, .cf-caja textarea")]
      .filter((e) => e.getBoundingClientRect().height < 44)
      .map((e) => (e.className || e.tagName) + " h=" + Math.round(e.getBoundingClientRect().height));
    return { fuera: [...new Set(fuera)].slice(0, 3), chicos: [...new Set(chicos)].slice(0, 3),
             lado: document.documentElement.scrollWidth > a + 1 };
  }, ancho);
  console.log(`${String(ancho).padEnd(8)} ${(m.lado || m.fuera.length ? m.fuera.join(", ") || "sí" : "nada").padEnd(10)} ` +
              `${m.chicos.length ? m.chicos.join(", ") : "44+"}`);
  if (m.lado || m.fuera.length) fallas.push(`a ${ancho} px el cuadro se sale: ${m.fuera.join(", ") || "la página"}`);
  if (m.chicos.length) fallas.push(`a ${ancho} px no se alcanza con el dedo: ${m.chicos.join(", ")}`);
}

await monta("borrar", 1440);
/* EL CUADRO ENTRA CON UNA ANIMACIÓN DE 120 ms. La primera captura salió
   a medio aparecer y todo se veía lavado — un «problema de contraste»
   que no existía. Se espera a que termine. */
await pg.waitForTimeout(400);
await pg.screenshot({ path: R(".arnes/_pedir-texto.png") });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ El cuadro de escribir: no queda ni un prompt del navegador en toda la app, " +
            "el botón dice qué falta y se lee apagado, el foco arranca en el campo, Escape " +
            "cancela, lo que no se deshace pide teclear el código, y se lee en los 7 temas.");
