/* =====================================================================
   ACCIONES · MAESTRO — el color, escoger varias, y «quién recibe».

   «Si está en ámbar, ¿qué hace rojo? Acuérdate, todo depende del tema.»
   «Que aquí yo pueda seleccionar varios y eliminar.»
   «Arregla la vista de quién recibe.»

   ---------------------------------------------------------------------
   EL ERROR QUE SE ESTÁ CAZANDO AQUÍ
   ---------------------------------------------------------------------
   `--c-oro` NO ES DORADO. En los tres temas de la marca —negro, gris y
   halo— vale #ff0000, ROJO PURO. Este módulo lo usaba para veinticinco
   cosas que no alertan nada: la pestaña escogida, el botón de
   confirmar, las barras, el avatar. Resultado: la pestaña activa salía
   ROJA, que se lee como «algo está mal aquí».

   ES LA CUARTA VEZ que este token muerde en este proyecto —el Sankey,
   el chip de PESÁNDOSE, la minibarra de tara/neto— y por eso esto no
   comprueba «se ve bien»: comprueba que NINGÚN elemento de escoger o
   confirmar use el rojo de alerta, EN LOS SIETE TEMAS.

   Lo que tiene que ser cierto:

   1. LA PESTAÑA ESCOGIDA NO ES ROJA en ningún tema, y contrasta.
   2. NINGÚN «escogido» USA EL TOKEN DE ALERTA. Se mide el color
      pintado contra el valor de `--c-oro` de ESE tema: comparar contra
      «#ff0000» a secas dejaría pasar el tema ámbar, donde el token es
      otro y el error sería el mismo.
   3. SE PUEDEN ESCOGER VARIAS Y ELIMINARLAS, y solo las que nadie ha
      usado ofrecen casilla — con las casillas es fácil marcar seis de
      un barrido, y una con histórico colgando se llevaría el histórico.
   4. CAMBIAR DE HOJA LIMPIA LA SELECCIÓN. Marcar tres zonas, pasarse a
      Motivos y darle Eliminar borraría cosas que ya no están en
      pantalla, y eso no se ve hasta después.
   5. «QUIÉN RECIBE» CABE EN LA PANTALLA: varias columnas, casilla a la
      vista y el dedo alcanza.

     node .arnes/ac-maestro-color.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_nav-acm.ts"),
  `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams("");`);

writeFileSync(R(".arnes/_supa-acm.ts"), `
const apuntar = (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
};
export const createClient = () => ({
  rpc: async (f: string, a: any) => { apuntar(f, a); return { data: null, error: null } },
  from: (t: string) => ({
    delete: () => ({
      eq: async (col: string, v: any) => { apuntar("delete1:" + t, { col, v }); return { error: null } },
      in: async (col: string, v: any[]) => { apuntar("delete:" + t, { col, v }); return { error: null } },
    }),
    update: () => ({ eq: async () => ({ error: null }) }),
    insert: async () => ({ error: null }),
  }),
});`);

writeFileSync(R(".arnes/_acm-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Maestro } from "../src/app/(app)/acciones/maestro/Maestro";
import { QuienRecibe } from "../src/app/(app)/acciones/maestro/QuienRecibe";

const areas = [
  { clave: "almacenamiento", nombre: "Almacenamiento", activo: true },
  { clave: "despacho", nombre: "Despacho", activo: true },
];
/* UNA CON HISTÓRICO Y CINCO SIN ÉL, a propósito: con todas iguales,
   «solo las que nadie ha usado ofrecen casilla» pasaría sin probar
   nada. */
const zonas = [
  { codigo: "AG01-PAS-01", nombre: "Pasillo 1", proceso: "Picking",
    area: "almacenamiento", activo: true, lat: null, lng: null, orden: 1 },
  { codigo: "AG01-PAS-02", nombre: "Pasillo 2", proceso: "Picking",
    area: "almacenamiento", activo: true, lat: null, lng: null, orden: 2 },
  { codigo: "AG01-PAS-04", nombre: "Pasillo 4", proceso: "Picking",
    area: "almacenamiento", activo: true, lat: null, lng: null, orden: 3 },
  { codigo: "AG01-CAR-01", nombre: "Pasillo de cargue", proceso: "Cargue",
    area: "despacho", activo: true, lat: null, lng: null, orden: 4 },
  { codigo: "AG01-CAR-02", nombre: "Zona de cargue", proceso: "Cargue",
    area: "despacho", activo: true, lat: null, lng: null, orden: 5 },
  { codigo: "AG01-DEV-01", nombre: "Zona de envase", proceso: "Quiebra",
    area: "despacho", activo: false, lat: null, lng: null, orden: 6 },
];
const motivos = [
  { clave: "orden", nombre: "Orden y aseo", area: "almacenamiento", critico: false, activo: true },
];

/* VEINTE PERSONAS: es lo que tiene el centro de verdad, y es el número
   con el que la lista de una columna se volvía tres pantallazos. */
const gente = Array.from({ length: 20 }, (_, i) => ({
  id: "u" + i,
  usuario: ["admin", "abi", "operador", "inventario", "t2"][i % 5] + i,
  nombre: ["Administrador", "Andrespalacio", "ARENOSA", "Cañizares", "CDARENOSA"][i % 5] + " " + i,
  rol: ["admin", "abi", "operador", "inventario", "t2"][i % 5],
  recibe: i === 3 || i === 11,
}));

createRoot(document.getElementById("r")!).render(
  <>
    <Maestro zonas={zonas as any} motivos={motivos as any} areas={areas as any}
             equipos={[]} uso={{ zonas: { "AG01-PAS-01": 1 }, motivos: {}, equipos: {} } as any}
             puedeEditar />
    <QuienRecibe gente={gente as any} todos={false} falta={false} puedeEditar />
  </>);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_acm-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-acm.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-acm.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const acc = readFileSync(R("src/app/(app)/acciones/acciones.css"), "utf8");

/* LOS SIETE TEMAS, SACADOS DEL CSS Y NO ESCRITOS A MANO: una lista
   escrita aquí se queda vieja el día que se agregue el octavo, y el
   arnés diría verde sin haberlo mirado. */
const temas = [...new Set([...glob.matchAll(/\[data-tema="([a-z]+)"\]/g)].map((m) => m[1]))];
ok(temas.length >= 6, `solo se encontraron ${temas.length} temas en globals.css`);

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

const monta = async (tema = "", ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1200 });
  await pg.setContent(`<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}>
    <head><meta charset="utf-8">
    <style>${glob}${shell}${acc} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="ac" id="r"></div></main></div></div>
    <script>${js.replace(/<\/script/g, "\\u003c/script")}</script></body></html>`);
  await pg.waitForSelector(".ac .filtros .btn.si", { timeout: 10000 });
  await pg.evaluate(() => { window.llamadas = [] });
};

/* =====================================================================
   1 y 2. EL COLOR, EN LOS SIETE TEMAS
   ===================================================================== */
const aRgb = (s) => {
  /* ESTE CHROMIUM DEVUELVE UN `color-mix()` RESUELTO COMO
     `color(srgb 0.98 0.89 0.90)` EN 0–1, NO EN 0–255. Leerlo como
     0–255 daba 1.3 de contraste en todas partes y costó media hora
     arreglar un color que estaba bien. */
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
  if (!a || !b) return 0;   /* «no se encontró» es 0, NUNCA un número alto:
                               un 99 ahí pinta siete verdes de mentira. */
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + .05) / (y + .05);
};

console.log("tema      pestaña  ¿usa el rojo de alerta?   casilla  contraste");
for (const t of temas) {
  await monta(t);
  const m = await pg.evaluate(() => {
    const raiz = getComputedStyle(document.documentElement);
    const alerta = raiz.getPropertyValue("--c-oro").trim();
    const pest = document.querySelector(".ac .filtros .btn.si");
    const cs = getComputedStyle(pest);
    /* SE COMPARA CONTRA EL TOKEN DE ESE TEMA y no contra «#ff0000»:
       en ámbar el token es otro y el error sería exactamente el mismo. */
    const tinta = document.createElement("div");
    tinta.style.background = alerta;
    document.body.appendChild(tinta);
    const alertaRgb = getComputedStyle(tinta).backgroundColor;
    tinta.remove();

    const escogidos = [...document.querySelectorAll(
      ".ac .filtros .btn.si, .ac .ac-def-q.on .ac-q-caja, .ac .btn.si")];
    const conAlerta = escogidos.filter((e) =>
      getComputedStyle(e).backgroundColor === alertaRgb).length;

    const caja = document.querySelector(".ac .ac-def-q.on .ac-q-caja");
    return {
      fondo: cs.backgroundColor, texto: cs.color,
      alerta, alertaRgb, conAlerta, escogidos: escogidos.length,
      cajaFondo: caja ? getComputedStyle(caja).backgroundColor : null,
      cajaTexto: caja ? getComputedStyle(caja).color : null,
    };
  });

  const cPest = contraste(aRgb(m.fondo), aRgb(m.texto));
  const cCaja = contraste(aRgb(m.cajaFondo), aRgb(m.cajaTexto));
  console.log(`${t.padEnd(9)} ${m.fondo.padEnd(22)} ${String(m.conAlerta).padStart(2)} de ${String(m.escogidos).padEnd(3)}` +
              ` ${m.alerta.padEnd(9)} ${cPest.toFixed(2)} / ${cCaja.toFixed(2)}`);

  ok(m.escogidos > 0, `${t}: no se encontró ningún elemento «escogido» que medir`);
  ok(m.conAlerta === 0,
     `${t}: ${m.conAlerta} de ${m.escogidos} elementos «escogido» están pintados con ` +
     `el token de ALERTA (${m.alerta}). Escogido no es alarma.`);
  ok(cPest >= 4.5, `${t}: la pestaña escogida contrasta ${cPest.toFixed(2)} y el piso es 4.5`);
  ok(cCaja >= 4.5, `${t}: la casilla marcada contrasta ${cCaja.toFixed(2)} y el piso es 4.5`);
}

/* =====================================================================
   3 y 4. ESCOGER VARIAS Y ELIMINARLAS
   ===================================================================== */
await monta("");
ok(rotos.length === 0, `la pantalla tiró un error al montarse: ${rotos[0]}`);
{
  const cajas = (await pg.$$(".ac .rueda .ac-m-caja")).length;
  const filas = (await pg.$$(".ac .rueda .fila")).length;
  ok(filas === 6, `salen ${filas} zonas y son 6`);
  /* CINCO Y NO SEIS: «Pasillo 1» tiene una acción colgando. */
  ok(cajas === 5,
     `hay ${cajas} casillas y deben ser 5 — la que ya se usó no puede ofrecer casilla`);

  await pg.click(".ac .ac-m-todas input");
  const puestas = await pg.$$eval(".ac .ac-m-caja input", (e) => e.filter((x) => x.checked).length);
  ok(puestas === 5, `«escoger todas» marcó ${puestas} y hay 5 que se pueden eliminar`);
  ok(/Eliminar 5/.test(await pg.textContent(".ac .ac-m-acc")),
     "el botón no dice cuántas se van a eliminar");

  /* LA SELECCIÓN SE VE: sin eso la única señal es una casilla de 20 px. */
  const pintadas = await pg.$$eval(".ac .fila.ac-m-puesta",
    (f) => f.filter((x) => getComputedStyle(x).boxShadow !== "none").length);
  ok(pintadas === 5, `${pintadas} filas se ven escogidas y hay 5 marcadas`);

  /* ---------- 4. CAMBIAR DE HOJA LIMPIA LA SELECCIÓN ---------- */
  await pg.click(".ac .filtros .btn:nth-child(2)");
  await pg.waitForTimeout(80);
  ok((await pg.$$(".ac .ac-m-acc")).length === 0,
     "al cambiar de hoja se quedó la selección de antes: se eliminaría a ciegas");
  await pg.click(".ac .filtros .btn:nth-child(1)");
  await pg.waitForTimeout(80);
  ok((await pg.$$(".ac .ac-m-acc")).length === 0,
     "al volver a la hoja de antes reapareció la selección vieja");

  /* ---------- UNA SOLA LLAMADA, CON MOTIVO Y CONFIRMACIÓN ---------- */
  await pg.click(".ac .ac-m-todas input");
  await pg.click(".ac .ac-m-acc .btn.mal");
  await pg.waitForSelector(".cf-caja", { timeout: 5000 });
  const bt = ".cf-caja .cf-btn.mal";
  ok(await pg.isDisabled(bt), "deja eliminar sin escribir el motivo");
  const dice = await pg.textContent(".cf-dice");
  ok(/no hay deshacer/i.test(dice), "no se dice que no hay deshacer");
  ok(/desactí|desactiv/i.test(dice), "no se ofrece la salida buena: desactivar deja el histórico");

  await pg.fill(".pt-campo textarea", "Zonas de prueba del montaje");
  await pg.fill(".pt-copia input", "ELIMINAR 5");
  ok(!(await pg.isDisabled(bt)), "con todo puesto el botón sigue apagado");
  await pg.click(bt);
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 3000 })
    .catch(() => {});
  const ls = await pg.evaluate(() => window.llamadas ?? []);
  ok(ls.length === 1, `viajaron ${ls.length} llamadas y debe ser UNA con todas las claves`);
  ok(/^delete:/.test(ls[0]?.f ?? ""), `se llamó «${ls[0]?.f}» y no un borrado en lote`);
  ok((ls[0]?.a?.v ?? []).length === 5,
     `viajaron ${(ls[0]?.a?.v ?? []).length} claves y deben ser 5`);
  ok(!(ls[0]?.a?.v ?? []).includes("AG01-PAS-01"),
     "¡se coló en el borrado la zona que YA TIENE una acción colgando!");
}

/* =====================================================================
   5. «QUIÉN RECIBE» CABE EN LA PANTALLA
   ===================================================================== */
console.log("\nancho    columnas  alto lista  toque   se sale");
for (const ancho of [1440, 820, 390, 360]) {
  await monta("", ancho);
  const m = await pg.evaluate((a) => {
    const rej = document.querySelector(".ac .ac-defecto");
    const cols = getComputedStyle(rej).gridTemplateColumns.split(" ").length;
    /* SE MIDE LO QUE SE AGREGÓ, NO TODO EL MÓDULO.
       `.ac .btn` vale 38 px de alto en todo Acciones, y está escrito a
       propósito en acciones.css: este módulo se usa casi siempre
       sentado. Subirlo entero a 44 por un arnés sería cambiar el
       criterio de veinte pantallas desde aquí. Lo que SÍ tiene que
       llegar a 44 es lo que se toca con el dedo y está al lado de un
       botón que dice «Eliminar»: las casillas y esa barra. */
    const tocables = [...document.querySelectorAll(
      ".ac .ac-def-q, .ac .ac-m-caja, .ac .ac-m-todas, .ac .ac-m-acc .btn")]
      .map((e) => { const r = e.getBoundingClientRect();
                    return { n: e.className, px: Math.round(Math.min(r.width, r.height)) } })
      .filter((x) => x.px > 0).sort((x, y) => x.px - y.px);
    const recortado = (e) => {
      for (let p = e.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible") return true;
      }
      return false;
    };
    const fuera = [...document.querySelectorAll(".ac *")]
      .filter((e) => e.getBoundingClientRect().width > 0
                     && e.getBoundingClientRect().right > a + .5 && !recortado(e))
      .map((e) => e.className || e.tagName);
    return {
      cols, alto: Math.round(rej.getBoundingClientRect().height),
      toque: tocables[0] ?? { n: "—", px: 0 },
      fuera: [...new Set(fuera)].slice(0, 3),
      lado: document.documentElement.scrollWidth > a + 1,
    };
  }, ancho);

  console.log(`${String(ancho).padEnd(8)} ${String(m.cols).padStart(5)}    ` +
    `${String(m.alto).padStart(6)} px  ${String(m.toque.px).padStart(3)} px  ` +
    `${m.lado || m.fuera.length ? (m.fuera.join(", ") || "sí") : "nada"}`);

  if (m.lado || m.fuera.length)
    fallas.push(`a ${ancho} px se sale: ${m.fuera.join(", ") || "la página entera"}`);
  if (m.toque.px < 44)
    fallas.push(`a ${ancho} px «${m.toque.n}» se toca en ${m.toque.px} px y con guante hacen falta 44`);
  /* EN PANTALLA ANCHA TIENEN QUE SER VARIAS COLUMNAS. Con una sola,
     veinte personas son tres pantallazos de bajar — que es justo lo
     que había que arreglar. */
  if (ancho >= 820 && m.cols < 3)
    fallas.push(`a ${ancho} px «quién recibe» sale en ${m.cols} columna(s): con 20 personas ` +
                "eso vuelve a ser tres pantallazos de bajar");
}

await monta("negro", 1440);
await pg.screenshot({ path: R(".arnes/_ac-maestro-negro.png"), fullPage: true });
await monta("ambar", 1440);
await pg.screenshot({ path: R(".arnes/_ac-maestro-ambar.png"), fullPage: true });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log(`✓ Maestro de Acciones: en los ${temas.length} temas nada «escogido» usa el token ` +
            "de alerta y todo contrasta, se escogen varias y viaja UNA sola llamada, la que " +
            "ya se usó no ofrece casilla, cambiar de hoja limpia la selección, y «quién " +
            "recibe» sale en varias columnas con el dedo alcanzando.");
