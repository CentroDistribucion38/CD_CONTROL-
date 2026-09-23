/* =====================================================================
   ROTURA EN SITIO — el formulario de verdad, en Chromium.

   Tres cosas pedidas, y ninguna se puede dar por buena escribiéndola:

   1. EL EER NO PIDE MATERIAL. «Si en EER no es material, ¿para qué
      está? Quita ese campo de allí porque no me deja continuar.» Se
      comprueba que el campo NO esté en EER, que SÍ esté en producto
      terminado, y —lo que de verdad importaba— que en EER el botón de
      Siguiente quede ENCENDIDO sin haber escogido nada más.

   2. EL PROCESO HABILITA LAS CAUSAS. Sin proceso no hay causas que
      tocar; con proceso salen las siete, dos de ellas no asumidas.

   3. EL ÁREA, DEL MAESTRO Y COMO DESPLEGABLE. Las trece, en el orden
      del maestro, y obligatoria: sin ella el botón no manda.

   Y dos más que son del rediseño:

   4. NO ES OTRA PANTALLA. El formulario no puede estar en
      `position: fixed` ni taparlo todo: tiene que vivir DENTRO de la
      página, con la lista de lo ya registrado abajo.

   5. NADA SE SALE a 1440 / 820 / 390 / 360, y lo que se toca mide
      44 px o más.

     node .arnes/rt-sitio.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-rt.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);

/* La base de mentiras ANOTA lo que se le manda: es la única forma de
   comprobar que en EER se manda el color y no un material inventado. */
writeFileSync(R(".arnes/_supa-rt.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    return { data: [{ id: "id-1", codigo: "RB-0099", exige_foto: false }], error: null };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  from: () => ({ insert: async () => ({ error: null }) }),
});`);

writeFileSync(R(".arnes/_rt-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { EnSitio } from "../src/app/(app)/roturas/en-sitio/EnSitio";

const materiales = [
  { clave: "EER-AMBAR", nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar", botellas_x_empaque: null, activo: true, orden: 1 },
  { clave: "EER-FLINT", nombre: "Envase retornable flint", tipo: "eer", color: "flint", botellas_x_empaque: null, activo: true, orden: 2 },
  { clave: "EER-GREEN", nombre: "Envase retornable green", tipo: "eer", color: "green", botellas_x_empaque: null, activo: true, orden: 3 },
  { clave: "PT-COST-330", nombre: "Cerveza Costeña 330 ml", tipo: "producto_terminado", color: null, botellas_x_empaque: 30, activo: true, orden: 11 },
];
const procesos = [
  { clave: "lineas", nombre: "Líneas", activo: true, orden: 1 },
  { clave: "t1", nombre: "T1", activo: true, orden: 2 },
  { clave: "traspaso", nombre: "Traspaso", activo: true, orden: 3 },
  { clave: "maquila", nombre: "Maquila", activo: true, orden: 4 },
  { clave: "sorting", nombre: "Sorting", activo: true, orden: 5 },
  { clave: "sin_identificar", nombre: "Sin identificar", activo: true, orden: 6 },
  { clave: "otro", nombre: "Otro", activo: true, orden: 9 },
];
/* Las trece del maestro, en el orden del maestro. */
const areas = [
  ["bahias_t1","Bahías T1",1],["tandem_lineas","Tándem Líneas",2],["traspasos","Traspasos",3],
  ["maquila","Maquila",4],["antiguo_patio_t2","Antiguo Patio T2",5],["sorting","Sorting",6],
  ["plazoleta","Plazoleta",7],["calle_a","Calle A",10],["calle_b","Calle B",11],
  ["calle_c","Calle C",12],["calle_d","Calle D",13],["calle_e","Calle E",14],
  ["estanteria","Estantería",20],
].map(([clave, nombre, orden]: any) => ({ clave, nombre, activo: true, orden }));
/* Las siete que se pidieron: cinco asumidas y dos no. */
const causas = [
  ["estibas_malas","Estibas en mal estado","asumida",false,1],
  ["mal_arrumado","Módulo mal arrumado","asumida",false,2],
  ["condiciones","Condiciones del sitio","asumida",false,3],
  ["comportamiento","Comportamiento del personal","asumida",false,4],
  ["falla_montacarga","Falla mecánica del montacargas","asumida",false,5],
  ["falla_maquinas","Falla de las máquinas","no_asumida",true,10],
  ["falla_depa","Falla del pallet DEPA","no_asumida",true,11],
].map(([clave, nombre, grupo, exige_foto, orden]: any) =>
  ({ clave, nombre, grupo, exige_foto, activo: true, orden }));

const roturas = [1, 2, 3].map((i) => ({
  id: "r" + i, codigo: "RB-000" + i, material: "EER-AMBAR",
  material_nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar",
  unidades: i * 4, contaminadas: null, botellas: null,
  unidades_liquido: 0, unidades_vidrio: i * 4,
  proceso: "lineas", proceso_nombre: "Líneas",
  area: "plazoleta", area_nombre: "Plazoleta",
  causa: "estibas_malas", causa_nombre: "Estibas en mal estado",
  grupo: "asumida", exige_foto: false, descripcion: null,
  lat: null, lng: null, precision_m: null,
  estado: "esperando", esperando: true, cuenta: false,
  reportada_por: "u1", reportada_en: "2026-09-23T12:00:00Z",
  decidida_por: null, decidida_en: null, nota_decision: null,
  fotos: 0, le_falta_foto: false, minutos: 30,
}));

createRoot(document.getElementById("r")!).render(
  <EnSitio roturas={roturas as any} nombres={{ u1: "Genesis Visbal" }}
           materiales={materiales as any} procesos={procesos as any}
           areas={areas as any} causas={causas as any} puedeEditar />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_rt-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-rt.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-rt.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css   = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob  = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (ancho = 1440, tema = "", alto = 900) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".cifras");
  await pg.evaluate(() => { window.llamadas = [] });
};
/* LA PANTALLA ABRE CON EL FORMULARIO PUESTO: quien puede editar entra a
   «Registrar» y ya está registrando. Abrir ya no es tocar el «+». */
const abrir = async () => { await pg.waitForSelector(".rt-rep") };
const llamadas = () => pg.evaluate(() => window.llamadas ?? []);

/* ---------------------------------------------------------------------
   0 · LA PANTALLA SE LLAMA «REGISTRAR» Y ABRE REGISTRANDO
   ------------------------------------------------------------------ */
await monta();
ok(await pg.isVisible(".rt-rep"),
   "al entrar no sale el formulario: la pantalla se llama Registrar y obliga a tocar el «+»");
ok(await pg.isVisible(".cifras"),
   "al abrir con el formulario puesto se perdieron las cifras de la pantalla");
/* Y se cierra con Cancelar, que devuelve la lista y el «+». */
await pg.click(".rt-rep .pie button:has-text('Cancelar')");
ok(!(await pg.isVisible(".rt-rep")), "Cancelar no cierra el formulario");
ok(await pg.isVisible(".mas"), "al cerrarlo no vuelve el «+» para abrirlo otra vez");
await pg.click(".mas");
await pg.waitForSelector(".rt-rep");

/* ---------------------------------------------------------------------
   1 · EL EER NO PIDE MATERIAL
   ------------------------------------------------------------------ */
await monta();
await abrir();
await pg.click(".rt-rep .opciones.dos button:has-text('EER')");
ok(!(await pg.isVisible("#rt-mat")),
   "en EER sigue apareciendo el campo Material");
ok(await pg.isVisible(".rt-rep .vidrios"),
   "en EER no está el color del vidrio, que es lo que ahora hace de material");

/* LO QUE DE VERDAD SE PIDIÓ: que DEJE CONTINUAR. */
ok(!(await pg.isDisabled(".rt-rep .pie button.si")),
   "en EER el botón de Siguiente sigue apagado — que era el problema entero");

/* Y en producto terminado el campo sigue, porque ahí sí decide algo. */
await pg.click(".rt-rep .opciones.dos button:has-text('Producto terminado')");
ok(await pg.isVisible("#rt-mat"),
   "en producto terminado desapareció el Material, y ahí sí hace falta");
ok(await pg.isDisabled(".rt-rep .pie button.si"),
   "en producto terminado deja seguir sin escoger material");

/* ---------------------------------------------------------------------
   2 · EL PROCESO HABILITA LAS CAUSAS · 3 · EL ÁREA
   ------------------------------------------------------------------ */
await monta();
await abrir();
await pg.click(".rt-rep .opciones.dos button:has-text('EER')");
await pg.click(".rt-rep .vidrios button.flint");
await pg.fill(".rt-rep .contador input", "15");
await pg.click(".rt-rep .pie button.si");
await pg.waitForSelector("#rt-area");

ok((await pg.$$(".rt-rep .opciones button")).length === 0,
   "las causas salen sin haber escogido proceso");
ok(await pg.isVisible(".rt-rep .nota.espera"),
   "sin proceso no dice que hay que escogerlo primero: el paso se ve vacío y ya");

const areas = await pg.$$eval("#rt-area option", (o) => o.map((x) => x.textContent.trim()));
ok(areas.length === 14, `el desplegable de Área trae ${areas.length - 1} áreas y tienen que ser 13`);
ok(areas[1] === "Bahías T1" && areas[13] === "Estantería",
   `las áreas no vienen en el orden del maestro: ${areas.slice(1, 4)} … ${areas[13]}`);

await pg.click(".rt-rep .chips button:has-text('Líneas')");
const causas = await pg.$$eval(".rt-rep .opciones button .p", (b) => b.map((x) => x.textContent.trim()));
ok(causas.length === 7, `con proceso salen ${causas.length} causas y tienen que ser 7`);
ok(causas[0] === "Estibas en mal estado" && causas.includes("Falla del pallet DEPA"),
   `las causas no son las que se pidieron: ${causas.join(" | ")}`);
ok((await pg.$$(".rt-rep .opciones button.roja")).length === 2,
   "las no asumidas no son exactamente dos (máquinas y pallet DEPA)");

/* EL BOTÓN DICE QUÉ FALTA, en vez de quedarse apagado y mudo. */
ok(/Falta el área/.test(await pg.textContent(".rt-rep .pie button.si")),
   "sin área el botón no dice que falta el área");
await pg.selectOption("#rt-area", "plazoleta");
await pg.click(".rt-rep .opciones button:has-text('Estibas en mal estado')");
ok(/Enviar a ABI/.test(await pg.textContent(".rt-rep .pie button.si")),
   "con proceso, área y causa el botón todavía dice que falta algo");

/* Y SE MANDA EL COLOR, NO UN MATERIAL INVENTADO. */
await pg.click(".rt-rep .pie button.si");
await pg.waitForFunction(() => (window.llamadas ?? []).some((l) => l.f === "rotura_registrar"));
const l = (await llamadas()).find((x) => x.f === "rotura_registrar");
ok(l.a.p_material === null, `en EER se mandó un material: ${l.a.p_material}`);
ok(l.a.p_color === "flint", `en EER no se mandó el color escogido: ${l.a.p_color}`);
ok(l.a.p_area === "plazoleta", `no se mandó el área: ${l.a.p_area}`);
ok(l.a.p_unidades === 15, `no se mandaron las unidades: ${l.a.p_unidades}`);

/* ---------------------------------------------------------------------
   4 · NO ES OTRA PANTALLA
   ------------------------------------------------------------------ */
await monta();
await abrir();
const sitio = await pg.evaluate(() => {
  const r = document.querySelector(".rt-rep");
  const cs = getComputedStyle(r), b = r.getBoundingClientRect();
  const cifras = document.querySelector(".cifras").getBoundingClientRect();
  const filas = document.querySelector(".filas").getBoundingClientRect();
  return {
    posicion: cs.position, ancho: Math.round(b.width),
    anchoPagina: document.documentElement.clientWidth,
    /* ¿El formulario está ARRIBA de lo que ya está registrado? */
    antesDeLaLista: b.top < filas.top,
    cifrasVisibles: cifras.width > 0,
  };
});
ok(sitio.posicion !== "fixed",
   "el formulario sigue en position:fixed — sigue siendo otra pantalla");
ok(sitio.ancho < sitio.anchoPagina,
   `el formulario ocupa todo el ancho de la página (${sitio.ancho} de ${sitio.anchoPagina})`);
ok(sitio.antesDeLaLista, "el formulario no quedó arriba de la lista de roturas");
ok(sitio.cifrasVisibles, "al abrir el formulario se perdieron las cifras de la pantalla");
ok(!(await pg.isVisible(".mas")),
   "el «+» flotante sigue encima del formulario abierto: le tapa una causa");

/* ---------------------------------------------------------------------
   4bis · EN EL COMPUTADOR, DOS COLUMNAS Y A TODO EL ANCHO
   ------------------------------------------------------------------ */
await monta(1440);
await abrir();
const anchos = await pg.evaluate(() => {
  const r = document.querySelector(".rt-rep").getBoundingClientRect();
  const c = document.querySelector(".cifras").getBoundingClientRect();
  const cols = [...document.querySelectorAll(".rt-rep .dos-col > .col")]
    .map((e) => Math.round(e.getBoundingClientRect().top));
  return { form: Math.round(r.width), pagina: Math.round(c.width),
           izq: Math.round(r.left), izqPagina: Math.round(c.left), cols };
});
ok(Math.abs(anchos.form - anchos.pagina) < 4,
   `el formulario no mide lo mismo que el resto de la pantalla (${anchos.form} contra ${anchos.pagina})`);
ok(Math.abs(anchos.izq - anchos.izqPagina) < 4,
   `el formulario no arranca donde arranca el resto de la pantalla (${anchos.izq} contra ${anchos.izqPagina})`);
ok(anchos.cols.length === 2, `esperaba dos columnas y hay ${anchos.cols.length}`);
ok(anchos.cols[0] === anchos.cols[1],
   `las dos columnas no arrancan a la misma altura (${anchos.cols})`);

/* Y en el celular se apilan: una debajo de otra, no media y media. */
await monta(390);
await abrir();
const apila = await pg.evaluate(() => {
  const c = [...document.querySelectorAll(".rt-rep .dos-col > .col")]
    .map((e) => e.getBoundingClientRect());
  return c.length === 2 && c[1].top >= c[0].bottom - 1;
});
ok(apila, "en el celular las dos columnas no se apilan");

await monta(1440, "", 1000);
await abrir();
await pg.screenshot({ path: ".arnes/rt-sitio-paso1.png" });
await pg.click(".rt-rep .opciones.dos button:has-text('EER')");
await pg.click(".rt-rep .pie button.si");
await pg.waitForSelector("#rt-area");
await pg.click(".rt-rep .chips button:has-text('Líneas')");
await pg.screenshot({ path: ".arnes/rt-sitio-paso2.png" });

/* ---------------------------------------------------------------------
   5 · LOS CUATRO ANCHOS, Y LO QUE SE TOCA
   ------------------------------------------------------------------ */
for (const [ancho, nombre] of [[1440, "pc"], [820, "tab"], [390, "cel"], [360, "360"]]) {
  await monta(ancho);
  await abrir();
  await pg.click(".rt-rep .opciones.dos button:has-text('EER')");
  await pg.click(".rt-rep .pie button.si");
  await pg.waitForSelector("#rt-area");
  await pg.click(".rt-rep .chips button:has-text('Líneas')");

  const r = await pg.evaluate(() => {
    const a = document.documentElement.clientWidth, fuera = [], chicos = [];
    for (const el of document.querySelectorAll(".rt-rep *")) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.right > a + .5 || b.left < -.5)) fuera.push(el.className || el.tagName);
      if ((el.tagName === "BUTTON" || el.tagName === "SELECT") && b.height > 0 && b.height < 44)
        chicos.push((el.className || el.tagName) + " h=" + Math.round(b.height));
    }
    return { scroll: document.documentElement.scrollWidth, ancho: a,
             fuera: [...new Set(fuera)].slice(0, 4), chicos: [...new Set(chicos)].slice(0, 4) };
  });
  ok(r.scroll <= r.ancho + .5, `${nombre}: la página se desplaza a lo ancho`);
  ok(!r.fuera.length, `${nombre}: se sale ${r.fuera.join(" | ")}`);
  ok(!r.chicos.length, `${nombre}: no se alcanza con el dedo ${r.chicos.join(" | ")}`);
  await pg.screenshot({ path: `.arnes/rt-sitio-${nombre}.png`, fullPage: ancho < 900 });
  console.log(`${nombre.padEnd(4)} ${String(ancho).padStart(5)}px  ${r.fuera.length || r.chicos.length ? "MAL" : "bien"}`);
}

await nav.close();

if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\n✓ Rotura en sitio: el EER no pide material y deja seguir, el proceso habilita las causas, el área sale del maestro, y el formulario vive DENTRO de la pantalla.");
