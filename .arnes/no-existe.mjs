/* =====================================================================
   LA PANTALLA DE 404 — medida, no mirada.

   POR QUÉ MERECE ARNÉS UNA PANTALLA QUE «NADIE VE». La ve cualquiera que
   tenga una pantalla abierta cuando entra un cambio, que en una
   plataforma a medio construir es todo el mundo. Y la ve JUSTO en el
   momento en que no sabe si la aplicación se rompió: si además está en
   inglés, sin logo y sin salida, la conclusión razonable es que se
   rompió. Eso pasó hoy.

   QUÉ SE MIDE:

   1. QUE LAS CLASES DEL ARMAZÓN EXISTAN EN EL COMPONENTE. Por palabra
      completa contra los literales del TSX y las clases de la hoja. Un
      arnés que monta un `div` que la aplicación no tiene aprueba
      siempre: en este proyecto eso ya mandó una pantalla sin CSS a
      producción.

   2. CONTRASTE EN LOS SIETE TEMAS. Tres parejas: el texto del botón
      sobre el acento —que en ámbar NO puede ser blanco—, el gris del
      párrafo sobre el papel, y el rótulo de la marca. El acento sale de
      las preferencias de cada equipo, así que las siete apariencias
      tienen que funcionar sin una regla por tema.

   3. QUE HAYA SALIDA. Un 404 sin un enlace de vuelta deja a alguien
      mirando un número. Se comprueba que exista al menos uno y que
      apunte a una ruta que existe de verdad — un botón «Ir al inicio»
      que lleve a otro 404 es peor que no tenerlo.

   4. QUE EL DEDO ALCANCE Y NADA SE SALGA a 1440 / 820 / 390 / 360. Aquí
      se llega desde la tablet de piso tanto como desde el escritorio.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const nx = readFileSync(new URL("../src/app/no-existe.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const tsx = readFileSync(new URL("../src/app/not-found.tsx", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]];

const ARMAZON = `
<div class="nx-tarjeta">
  <div class="nx-marca">
    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
         alt="Bavaria" style="height:26px;width:60px">
    <span>CD38 · CONTROL</span>
  </div>
  <p class="nx-num">404</p>
  <h1>Esta dirección ya no existe</h1>
  <p>La plataforma se está construyendo y las pantallas se mueven. Lo más probable es que
    <b>esta la tenía abierta desde antes</b> y entró un cambio: al recargar, la dirección
    vieja ya no lleva a ningún lado.</p>
  <p>Nada se perdió y nada se rompió — lo que se hizo en esa pantalla está guardado. Lo que
    cambió es por dónde se llega.</p>
  <div class="nx-pie">
    <a class="nx-btn" href="/inicio">Ir al inicio</a>
    <a class="nx-btn plano" href="/inventario">Inventario</a>
  </div>
</div>`;

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ---------- */
const sueltas = [...tsx.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)]
  .map((m) => m[1]).join(" ").split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([...sueltas, ...sueltas.map((w) => w.toLowerCase()),
  ...[...nx.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])]);
const inventadas = [...new Set([...ARMAZON.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/)))].filter(Boolean).filter((c) => !palabras.has(c));

const canales = (c) => {
  const n = (c.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
  return c.startsWith("color(") ? n.map((v) => v * 255) : n;
};
const razon = (a, b) => {
  const lum = (c) => {
    const [r, g, bl] = canales(c).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const L1 = lum(a), L2 = lum(b);
  return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2);
};

const fallas = [];
if (inventadas.length)
  fallas.push(`el armazón usa clases que la pantalla no tiene: ${inventadas.join(", ")}`);

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();
const monta = async (tema, ancho) => {
  await pag.setViewportSize({ width: ancho, height: 900 });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${nx} html,body{margin:0}</style></head>
    <body><div class="nx"${tema ? ` data-tema="${tema}"` : ""}>${ARMAZON}</div></body></html>`);
};

/* ---------- 2. CONTRASTE ---------- */
console.log("tema      botón  párrafo  marca  título  botón plano");
for (const t of TEMAS) {
  await monta(t, 1440);
  const m = await pag.evaluate(() => {
    const g = (s, p) => getComputedStyle(document.querySelector(s)).getPropertyValue(p);
    return {
      btnTxt: g(".nx-btn", "color"), btnFondo: g(".nx-btn", "background-color"),
      pTxt: g(".nx p", "color"), papel: g(".nx-tarjeta", "background-color"),
      marcaTxt: g(".nx-marca span", "color"),
      h1: g(".nx h1", "color"),
      planoTxt: g(".nx-btn.plano", "color"),
    };
  });
  const c = {
    boton: razon(m.btnTxt, m.btnFondo),
    parrafo: razon(m.pTxt, m.papel),
    marca: razon(m.marcaTxt, m.papel),
    titulo: razon(m.h1, m.papel),
    plano: razon(m.planoTxt, m.papel),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(6) + "  ").join(""));
  for (const [k, v] of Object.entries(c))
    if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5)`);
}

/* ---------- 3 y 4: salida y geometría ---------- */
console.log("\nancho    se sale   arrastra  botón  botones por fila");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(null, ancho);
  const m = await pag.evaluate(() => {
    const t = document.querySelector(".nx-tarjeta");
    const c = t.getBoundingClientRect();
    const salen = [...t.querySelectorAll("*")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right - c.right > 0.5 || c.left - r.left > 0.5);
    }).map((e) => (e.className || e.tagName).toString().trim().split(/\s+/)[0]);
    const d = document.documentElement;
    const btns = [...document.querySelectorAll(".nx-btn")];
    const tops = new Set(btns.map((e) => Math.round(e.getBoundingClientRect().top)));
    return {
      salen: [...new Set(salen)], lado: d.scrollWidth - d.clientWidth,
      alto: Math.min(...btns.map((e) => Math.round(e.getBoundingClientRect().height))),
      porFila: btns.length / tops.size,
    };
  });
  console.log(`${etiqueta.padEnd(8)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(9)} ` +
              `${String(m.lado).padStart(8)}  ${String(m.alto).padStart(5)}  ` +
              `${String(m.porFila).padStart(16)}`);
  if (m.salen.length) fallas.push(`${etiqueta}: se sale de la tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado`);
  if (m.alto < 44) fallas.push(`${etiqueta}: el botón mide ${m.alto} px de alto (mínimo 44)`);
  /* En el celular los dos botones van uno por fila: lado a lado quedan
     de 150 px y se falla el toque con guante. */
  if (ancho <= 390 && m.porFila > 1)
    fallas.push(`${etiqueta}: los dos botones comparten fila — a este ancho quedan de menos ` +
                "de 160 px y se falla el toque con guante");
}

await navegador.close();

/* ---------- 3. QUE LA SALIDA LLEVE A ALGÚN LADO ----------
   Un «Ir al inicio» que caiga en otro 404 es peor que no tenerlo: le
   dice a quien llegó que la aplicación entera está rota. Así que las
   rutas de los enlaces se comprueban CONTRA EL DISCO, no contra una
   lista escrita aquí que se quedaría vieja sola. */
const salidas = [...tsx.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
if (salidas.length === 0)
  fallas.push("el 404 no tiene ni un enlace de vuelta: deja a alguien mirando un número");
for (const r of salidas) {
  const base = new URL(`../src/app/(app)${r}/`, import.meta.url);
  const hay = existsSync(base) &&
    readdirSync(base).some((f) => f === "page.tsx" || f === "page.ts");
  if (!hay) fallas.push(`la salida «${r}» no tiene página: el 404 llevaría a otro 404`);
}

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ 404: se lee en los 7 temas, tiene salida y la salida existe, el dedo alcanza " +
            "y nada se sale a 1440/820/390/360.");
