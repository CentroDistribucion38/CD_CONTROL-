/* =====================================================================
   EL VIDRIO SE AMARRA AL REGISTRAR — la pantalla de Registrar, de
   verdad, en Chromium.

   «Coloqué tolva y no veo qué placas tengo allí con tolva y la
    cantidad. Eso viene del registro de salida: es lo que te trato de
    decir.»

   LO QUE ESTABA MAL ERA DE FONDO, no de maquetación. El vidrio se
   amarraba por la placa AL FINAL, en facturación; eso funciona solo si
   alguien escribió la misma placa en los dos sitios, y si se equivoca
   no pasa nada visible: el viaje sale sin vidrio y la cédula se queda
   esperando un camión que ya se fue.

   POR QUÉ UN ARNÉS: lo que hay que demostrar no es que el bloque se
   pinte —eso se ve— sino que AL TOCAR UNA CÉDULA queden puestas la
   placa Y la cantidad, y que el viaje salga hacia la base AMARRADO. Eso
   solo se ve tocando y leyendo el paquete que sale. Una captura no
   distingue una pantalla que amarra de una que no.

     node .arnes/tp-vidrio-registro.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-tv.ts"),
  `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
   export const useSearchParams = () => new URLSearchParams("");`);

/* EL DOBLE GUARDA LO QUE SE MANDA Y DEVUELVE UN id, porque el amarre
   sale del id que devuelve registrar. Un doble que devuelva null haría
   pasar la prueba sin que el amarre se llegue a intentar. */
writeFileSync(R(".arnes/_supa-tv.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).rpcs = [...((window as any).rpcs ?? []), { f, a }];
    if ((window as any).amarreFalla && f === "traspaso_amarrar_cedula")
      return { error: { message: "La cédula SR-0044 ya está cargada en otro viaje." }, data: null };
    return { error: null, data: [{ id: "viaje-nuevo-1", codigo: "TR-0171" }] };
  },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
});`);

const CEDULAS = `[
  { id: "c1", cedula: "SR-0044", placa: "NLW428", tolvas: 3, neto_kg: 2412.5,
    observacion: null, dias_esperando: 0 },
  { id: "c2", cedula: "SR-0045", placa: "FSV898", tolvas: 5, neto_kg: 4010.0,
    observacion: null, dias_esperando: 2 },
]`;

writeFileSync(R(".arnes/_tv-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Registrar } from "../src/app/(app)/traspasos/Registrar";
const tipos = [
  { clave: "casco_vidrio", nombre: "Casco vidrio", activo: true, orden: 1, cuenta_plan: true, pregunta_arenosa: false },
  { clave: "tolvas_vidrio", nombre: "Tolvas de Vidrio", activo: true, orden: 10, cuenta_plan: false, pregunta_arenosa: false },
];
const puntos = [
  { clave: "fabrica", nombre: "FABRICA", externo: false, activo: true, orden: 1, descripcion: "Planta" },
  { clave: "bodega38", nombre: "BODEGA 38", externo: false, activo: true, orden: 2, descripcion: "Bodega propia" },
];
createRoot(document.getElementById("r")!).render(
  <Registrar tipos={tipos as any} puntos={puntos as any}
             placas={[{ placa: "FSV898", veces: 9 }, { placa: "NLW428", veces: 4 }, { placa: "PRUEBA", veces: 1 }]}
             placasM={[{ placa: "FSV898", nota: null, activo: true, orden: 1 },
                       { placa: "NLW428", nota: null, activo: true, orden: 2 },
                       { placa: "PRUEBA", nota: null, activo: true, orden: 3 }] as any}
             vidrio={${CEDULAS} as any}
             fecha="2026-09-23" turnoSugerido="A" planTurno={{ A: 10 }} hechosTurno={{ A: 6 }}
             planPorTipo={{}} viajes={[] as any} nombres={{}} />);
`);

let js;
try {
  js = buildSync({
    entryPoints: [R(".arnes/_tv-entrada.tsx")], bundle: true, write: false,
    format: "iife", jsx: "automatic",
    alias: { "next/navigation": R(".arnes/_nav-tv.ts"),
             "@/lib/supabase/client": R(".arnes/_supa-tv.ts"), "@": R("src") },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "window.process = window.process || { env: {} };" },
    logLevel: "silent",
  }).outputFiles[0].text;
} catch (e) {
  console.error("No compiló la entrada del arnés:\n" + (e.message ?? e));
  process.exit(1);
}

const css = readFileSync(R("src/app/(app)/traspasos/traspasos.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (ancho = 1300) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}
    ${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="tp" id="r"></div></main></div></div><script>${js}</script></body></html>`);
  await pg.waitForSelector(".tp .chips button");
  await pg.evaluate(() => { window.rpcs = []; window.amarreFalla = false });
};
const tipo = (n) => pg.click(`.tp .chips button:text-is("${n}")`);
const texto = () => pg.textContent(".tp");
const llenarRuta = async () => {
  await pg.click('.tp [aria-label="De dónde sale"]');
  await pg.click(".tp .desple .rollo button:first-child");
  await pg.click('.tp [aria-label="A dónde va"]');
  await pg.click(".tp .desple .rollo button:first-child");
};
const ultima = async (f) =>
  (await pg.evaluate(() => window.rpcs)).filter((r) => !f || r.f === f).at(-1) ?? null;

/* ---------------------------------------------------------------------
   1 · SIN TOLVAS NO SE VE NADA

   Un bloque que sale en todos los viajes deja de leerse, y la inmensa
   mayoría de los traspasos no llevan vidrio.
   ------------------------------------------------------------------ */
await monta();
await tipo("Casco vidrio");
ok(!(await pg.isVisible(".tp-vidrio")),
   "con Casco vidrio sale el bloque del vidrio y no tiene nada que decir ahí");

/* ---------------------------------------------------------------------
   2 · CON TOLVAS SALEN LAS PLACAS, CON SUS TOLVAS Y SUS KILOS

   Es lo que se pidió: «no veo qué placas tengo allí con tolva y la
   cantidad». Una lista de códigos SR-00xx no contesta esa pregunta.
   ------------------------------------------------------------------ */
await monta();
await tipo("Tolvas de Vidrio");
ok(await pg.isVisible(".tp-vidrio"),
   "con Tolvas de Vidrio no sale el vidrio que está esperando camión");
{
  const tarjetas = await pg.$$eval(".tp-vidrio-lista button",
    (bs) => bs.map((b) => b.textContent.replace(/\s+/g, " ").trim()));
  ok(tarjetas.length === 2, `salen ${tarjetas.length} placas con vidrio y deberían ser 2`);
  ok(tarjetas.every((x) => /[A-Z]{3}\d{3}/.test(x)), `las tarjetas no dicen la placa: ${JSON.stringify(tarjetas)}`);
  ok(tarjetas.every((x) => /\d+ tolvas?/.test(x)), `las tarjetas no dicen las tolvas: ${JSON.stringify(tarjetas)}`);
  ok(tarjetas.every((x) => /kg/.test(x)), `las tarjetas no dicen los kilos: ${JSON.stringify(tarjetas)}`);
  ok(tarjetas.some((x) => /SR-0044/.test(x)), "las tarjetas no dicen de qué cédula se trata");
}

/* ---------------------------------------------------------------------
   3 · AL TOCAR UNA, QUEDAN PUESTAS LA PLACA Y LA CANTIDAD

   «Que la cantidad se llene sola.» Es el corazón de esto: tecleárselo a
   mano al lado de un número que la báscula ya sabe es pedir que alguien
   se equivoque.
   ------------------------------------------------------------------ */
await pg.click('.tp-vidrio-lista button:has-text("NLW428")');
{
  const r = await pg.evaluate(() => {
    const t = (s) => (document.querySelector(s)?.textContent ?? "").replace(/\s+/g, " ").trim();
    const cant = [...document.querySelectorAll(".tp input")]
      .map((i) => ({ v: i.value, aria: i.getAttribute("aria-label") ?? "" }));
    return {
      placa: t('.tp [aria-label="Placa del vehículo"]'),
      marcada: !!document.querySelector(".tp-vidrio-lista button.on"),
      dice: t(".tp-vidrio-puesta"),
      cant,
    };
  });
  ok(/NLW428/.test(r.placa), `al escoger la cédula no quedó puesta la placa: «${r.placa}»`);
  ok(r.marcada, "la cédula escogida no se ve escogida");
  ok(/SR-0044/.test(r.dice) && /3 tolvas/.test(r.dice),
     `no dice qué cédula va a llevar el viaje: «${r.dice}»`);
  ok(r.cant.some((c) => c.v === "3"),
     `la cantidad no se llenó con las 3 tolvas pesadas: ${JSON.stringify(r.cant)}`);
}

/* 3b. Y SE PUEDE SOLTAR. Escoger mal no puede ser una puerta sin
       marcha atrás: se vuelve a tocar y se suelta. */
await pg.click('.tp-vidrio-lista button:has-text("NLW428")');
ok(!(await pg.isVisible(".tp-vidrio-puesta")),
   "una cédula escogida por error no se puede soltar volviéndola a tocar");
await pg.click('.tp-vidrio-lista button:has-text("NLW428")');

/* ---------------------------------------------------------------------
   4 · CON LA PLACA YA PUESTA, SOLO SE OFRECE SU VIDRIO

   Ofrecer el de otra placa es ofrecer cargar vidrio ajeno.
   ------------------------------------------------------------------ */
{
  const suyas = await pg.$$eval(".tp-vidrio-lista button",
    (bs) => bs.map((b) => b.textContent.replace(/\s+/g, " ").trim()));
  ok(suyas.length === 1 && /NLW428/.test(suyas[0]),
     `con la placa NLW428 puesta se ofrecen ${suyas.length} cédulas: ${JSON.stringify(suyas)}`);
}

/* ---------------------------------------------------------------------
   5 · Y EL VIAJE SALE AMARRADO

   Lo único que demuestra que esto sirve. Todo lo de arriba es pintura
   si el amarre no llega a la base.
   ------------------------------------------------------------------ */
await llenarRuta();
await pg.click(".tp .btn.si, .tp button.si");
await pg.waitForFunction(() => (window.rpcs ?? []).some((r) => r.f === "traspaso_amarrar_cedula"),
  null, { timeout: 5000 }).catch(() => {});
{
  const reg = await ultima("traspaso_registrar_varios");
  const am  = await ultima("traspaso_amarrar_cedula");
  ok(reg, "no se registró el viaje");
  ok(reg && reg.a.p_placa === "NLW428", `el viaje no sale con la placa del vidrio: ${JSON.stringify(reg?.a?.p_placa)}`);
  ok(reg && JSON.stringify(reg.a.p_tipos).includes('"cantidad":3'),
     `la cantidad que viaja no son las 3 tolvas pesadas: ${JSON.stringify(reg?.a?.p_tipos)}`);
  ok(am, "el viaje se registró pero NUNCA se amarró la cédula: el vidrio queda suelto y nadie se entera");
  ok(am && am.a.p_cedula === "c1", `se amarró otra cédula: ${JSON.stringify(am?.a)}`);
  ok(am && am.a.p_viaje === "viaje-nuevo-1",
     `se amarró al viaje equivocado: ${JSON.stringify(am?.a)}`);
  /* EL ORDEN IMPORTA: primero registrar, después amarrar. Al revés no
     hay viaje al que amarrar. */
  const orden = (await pg.evaluate(() => window.rpcs)).map((r) => r.f);
  ok(orden.indexOf("traspaso_registrar_varios") < orden.indexOf("traspaso_amarrar_cedula"),
     `se amarró antes de registrar: ${JSON.stringify(orden)}`);
}

/* ---------------------------------------------------------------------
   6 · SI EL AMARRE FALLA, SE DICE — Y EL VIAJE NO SE PIERDE

   El viaje ocurrió: el camión se cargó. Borrarlo porque no se pudo
   amarrar el vidrio sería perder el dato bueno por el accesorio. Pero
   callarlo es peor: el vidrio queda suelto y nadie se entera.
   ------------------------------------------------------------------ */
await monta();
await pg.evaluate(() => { window.amarreFalla = true });
await tipo("Tolvas de Vidrio");
await pg.click('.tp-vidrio-lista button:has-text("FSV898")');
await llenarRuta();
await pg.click(".tp .btn.si, .tp button.si");
await pg.waitForFunction(() => (window.rpcs ?? []).some((r) => r.f === "traspaso_amarrar_cedula"),
  null, { timeout: 5000 }).catch(() => {});
{
  const t = await texto();
  ok(/no qued[óo] amarrada|NO se amarr/i.test(t),
     "cuando el amarre falla la pantalla no lo dice: el viaje queda registrado y el vidrio suelto, en silencio");
  ok(/SR-0045/.test(t), "el aviso del amarre fallido no dice de qué cédula se trata");
}

/* ---------------------------------------------------------------------
   7 · SIN VIDRIO ESPERANDO, SE DICE QUÉ HACER

   Es exactamente el caso que hizo perder una tarde: se registró un
   viaje de tolvas con una placa que no tenía vidrio pesado y la
   pantalla no dijo nada.
   ------------------------------------------------------------------ */
{
  await pg.evaluate(() => {
    /* Se vuelve a montar sin cédulas, desde la misma página. */
    document.getElementById("r").innerHTML = "";
  });
  await monta();
  await tipo("Tolvas de Vidrio");
  /* Se escoge desde «las placas de la semana», que es como se escoge de
     verdad en el muelle: el camión que está en la puerta casi siempre ya
     pasó esta semana. */
  await pg.click('.tp .recientes button:text-is("PRUEBA")');
  const t = await pg.textContent(".tp-vidrio");
  ok(/PRUEBA/.test(t) && /no tiene vidrio/i.test(t),
     `con una placa sin vidrio no se dice: «${t.replace(/\s+/g, " ").slice(0, 110)}»`);
  ok(/cerrar/i.test(t) && /Pesar/.test(t),
     "no se dice QUÉ hacer ni DÓNDE: sin eso es un letrero de «no hay» y ya");
}

/* ---------------------------------------------------------------------
   8 · PC, TABLET Y CELULAR
   ------------------------------------------------------------------ */
for (const [ancho, nombre] of [[1440, "pc"], [1024, "tablet apaisada"], [820, "tablet"],
                               [390, "celular"], [360, "celular chico"]]) {
  await monta(ancho);
  await tipo("Tolvas de Vidrio");
  const m = await pg.evaluate(() => {
    const caja = document.querySelector(".tp").getBoundingClientRect();
    const bs = [...document.querySelectorAll(".tp-vidrio-lista button")];
    return {
      lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fuera: [...document.querySelectorAll(".tp-vidrio, .tp-vidrio *")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
      }).length,
      /* SE TOCAN CON GUANTE: 44 px es el mínimo, y la placa tiene que
         leerse desde la distancia a la que uno mira un camión. */
      chico: Math.min(...bs.map((b) => Math.round(b.getBoundingClientRect().height))),
      angosto: Math.min(...bs.map((b) => Math.round(b.getBoundingClientRect().width))),
      placa: parseFloat(getComputedStyle(document.querySelector(".tp-vidrio-lista b")).fontSize),
    };
  });
  ok(m.lado <= 0, `${nombre} (${ancho}): la página se arrastra ${m.lado} px de lado`);
  ok(m.fuera === 0, `${nombre} (${ancho}): ${m.fuera} cosa(s) del vidrio se salen del marco`);
  ok(m.chico >= 44, `${nombre} (${ancho}): las tarjetas del vidrio miden ${m.chico} px de alto`);
  ok(m.angosto >= 140, `${nombre} (${ancho}): las tarjetas miden ${m.angosto} px de ancho`);
  ok(m.placa >= 15, `${nombre} (${ancho}): la placa sale a ${m.placa} px y no se lee`);
  await pg.screenshot({ path: `.arnes/tp-vidrio-${ancho}.png` });
}

await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ El vidrio se amarra al registrar: sin tolvas no se ve, con tolvas salen las placas con sus tolvas y kilos, al tocar una quedan " +
            "puestas la placa y la cantidad, el viaje sale AMARRADO, si el amarre falla se dice, y una placa sin vidrio dice qué hacer. Cinco anchos.");
