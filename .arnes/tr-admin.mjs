/* =====================================================================
   EN TRÁNSITO — CORREGIR Y ANULAR DESDE LA TARJETA

   «Ayúdame a poder eliminar/anular los vehículos en tránsito del
    registro, o sea el super admin que pueda editar, eliminar, borrar.»

   Un vehículo que se digitó dos veces, o que nunca salió, se quedaba en
   «en camino» para siempre: ensuciaba la cifra de arriba y las horas
   del más viejo, y arreglarlo obligaba a salir a Fuente principal y
   buscar la placa entre casi doscientas filas.

   LO QUE HAY QUE SOSTENER, y nada de esto se puede dar por bueno
   leyendo el código:

   1. LOS BOTONES SOLO SALEN PARA QUIEN MANDA. Esconderlos no es el
      candado —el candado está en la base, que comprueba `manda()`—,
      pero un botón que sale y da error al tocarlo es peor que no tener
      botón.

   2. LLAMAN A LAS FUNCIONES QUE YA EXISTEN, con los nombres y los
      parámetros exactos. Un `p_motivo` mal escrito no revienta el
      build: revienta en la cara de quien está anulando.

   3. ANULAR EXIGE MOTIVO. La base lo exige; si la pantalla deja mandar
      sin él, el único resultado posible es un error.

   4. AL QUE LLEGÓ Y ESPERA REVISIÓN AI NO SE LE OFRECE CORREGIR: esa
      tarjeta está pidiendo que alguien cuente la muestra, y corregirle
      las estibas ahí es cambiar el dato justo antes de contrastarlo.

     node .arnes/tr-admin.mjs
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

writeFileSync(R(".arnes/_nav-tr.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);

/* LA BASE DE MENTIRAS ANOTA LO QUE SE LE MANDA. Es la única forma de
   comprobar que se llama a `sider_viaje_anular` con `p_motivo` y no a
   una función inventada con otro nombre: el build no lo mira, porque
   el nombre de una RPC es una cadena de texto. */
writeFileSync(R(".arnes/_supa-tr.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    if ((window as any).FALLA) return { data: null, error: { message: (window as any).FALLA } };
    return { data: null, error: null };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }),
                            createSignedUrl: async () => ({ data: null, error: null }) }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
                 insert: async () => ({ error: null }) }),
});`);

writeFileSync(R(".arnes/_tr-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Transito } from "../src/app/(app)/sider/transito/Transito";

const base = {
  planta: "P01", cd_origen: "CD Unión Apartado", sku: "3500887",
  descripcion: "BOTELLA FLINT 1000R", clase: "EER",
  estibas: 30, sider: 0.83, cajas: 1080, unidades: 14040, hl: 140.4,
  estado: "en_transito", importado: false, faltan_factores: false,
  observacion: null, motivo_anulacion: null, anulado_en: null, anulado_por: null,
  salida_en: "2026-09-10T12:41:00Z", llegada_en: null, en_camino: "357:00:00",
  fotos_salida: 3, fotos_llegada: 0,
  creado_por: "u1", salida_direccion: "Avenida Carrera 38",
  requiere_ai: false, ai_pendiente: false, ai_motivo: null,
  ai_pedido_por: null, ai_pedido_en: null,
};
const viajes = [
  { ...base, id: "v1", placa: "JGY577" },
  { ...base, id: "v2", placa: "JYN245", cd_origen: "CD OL Curumani",
    sku: "3501226", descripcion: "BOTELLA MARRON 250 CC", estibas: 20, sider: 0.56 },
  /* EL QUE LLEGÓ Y ESPERA QUE ALGUIEN CUENTE LA MUESTRA. A este no se
     le ofrece corregir: cambiarle las estibas justo antes de
     contrastarlas es cambiar el dato que se va a contrastar. */
  { ...base, id: "v3", placa: "KKL900", requiere_ai: true, ai_pendiente: true,
    llegada_en: "2026-09-24T10:00:00Z" },
];
const origenes = [
  { planta: "P01", cd_origen: "CD Unión Apartado" },
  { planta: "P02", cd_origen: "CD OL Curumani" },
  { planta: "P03", cd_origen: "CD La Arenosa" },
];
const skus = [
  { sku: "3500887", descripcion: "BOTELLA FLINT 1000R" },
  { sku: "3501226", descripcion: "BOTELLA MARRON 250 CC" },
];
createRoot(document.getElementById("r")!).render(
  <Transito viajes={viajes as any} nombres={{ u1: "arenosa" }}
            esEditor esAdmin={false}
            manda={(window as any).MANDA !== false}
            origenes={origenes} skus={skus}
            maestrosAi={null} trabados={1} sinEvidencia={0}
            cabeza={<div className="cabeza"><h1>En tránsito</h1></div>} />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_tr-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-tr.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-tr.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css   = readFileSync(R("src/app/(app)/sider/sider.css"), "utf8");
const ai    = readFileSync(R("src/modulos/sider/ai.css"), "utf8");
const glob  = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (manda = true, ancho = 1440, alto = 1000) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css}${ai}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="sd tr-pantalla" id="r"></div></main></div></div>
    <script>window.MANDA=${manda ? "true" : "false"}</script>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".sd .tr-botones");
  await pg.evaluate(() => { window.llamadas = []; window.FALLA = null });
};
const llamadas = () => pg.evaluate(() => window.llamadas ?? []);
/* La tarjeta de una placa concreta, para no medir la del vecino. */
const tarjeta = (placa) => `.sd .tr-vh:has(.placa:text-is("${placa}"))`;

/* =====================================================================
   1 · QUIEN NO MANDA NO VE LOS BOTONES

   Esconderlos NO es el candado —ese está en la base—, pero un botón que
   sale y da error al tocarlo enseña a la gente que la aplicación falla.
   ===================================================================== */
await monta(false);
{
  const t = await pg.textContent(".sd");
  ok(!/Corregir/.test(t), "a quien no administra le sale «Corregir» en el tránsito");
  ok(!/Anular/.test(t), "a quien no administra le sale «Anular» en el tránsito");
  /* Y LO DE SIEMPRE SIGUE AHÍ: quitarle los botones al que no manda no
     puede llevarse por delante certificar la llegada, que es de quien
     recibe. */
  ok(/Certificar llegada/.test(t),
     "esconder los botones de administrador se llevó por delante «Certificar llegada»");
}

/* =====================================================================
   2 · QUIEN MANDA LOS VE, Y NO EN LA TARJETA QUE ESPERA LA MUESTRA
   ===================================================================== */
await monta(true);
{
  const t = await pg.textContent(".sd");
  ok(/Corregir/.test(t), "al administrador no le sale «Corregir»");
  ok(/Anular/.test(t), "al administrador no le sale «Anular»");

  const conAi = await pg.textContent(tarjeta("KKL900"));
  ok(!/Corregir/.test(conAi),
     "al vehículo que llegó y espera la revisión AI se le ofrece corregir: eso cambia el dato " +
     "justo antes de contrastarlo con la muestra");
}

/* =====================================================================
   3 · ANULAR: EXIGE MOTIVO Y LLAMA A LA FUNCIÓN QUE EXISTE

   El nombre de una RPC es una cadena de texto: el build no la mira. Si
   estuviera mal escrita, el error saldría en la cara de quien anula.
   ===================================================================== */
{
  await pg.click(`${tarjeta("JGY577")} button:has-text('Anular')`);
  await pg.waitForSelector(".sd .vj-caja");
  const cuadro = await pg.textContent(".sd .vj-caja");
  ok(/JGY577/.test(cuadro), `el cuadro de anular no dice de qué placa habla: «${cuadro.slice(0, 60)}»`);
  /* SE DICE QUE NO SE BORRA, Y AQUÍ. Quien vino buscando «eliminar»
     tiene que enterarse en el momento de que la evidencia se queda, o
     va a seguir buscando por otro lado. */
  ok(/no se borra/.test(cuadro),
     "el cuadro no aclara que anular no borra: quien buscaba eliminar se queda con la duda");

  /* SIN MOTIVO NO SE MANDA. La base lo exige; dejar mandar aquí solo
     puede terminar en un error. */
  ok(await pg.isDisabled(".sd .vj-caja button:has-text('Anular el viaje')"),
     "deja anular sin escribir el motivo, y la base lo va a rechazar");
  await pg.fill(".sd .vj-caja .vj-motivo-campo input", "abc");
  ok(await pg.isDisabled(".sd .vj-caja button:has-text('Anular el viaje')"),
     "con tres letras de motivo ya deja anular: «abc» no explica nada en tres meses");

  await pg.fill(".sd .vj-caja .vj-motivo-campo input", "Se digitó dos veces");
  await pg.click(".sd .vj-caja button:has-text('Anular el viaje')");
  await pg.waitForTimeout(120);

  const l = await llamadas();
  ok(l.length === 1, `se mandaron ${l.length} llamadas al anular y debe ser una: ${JSON.stringify(l)}`);
  ok(l[0]?.f === "sider_viaje_anular",
     `se llamó a «${l[0]?.f}» y la función que existe es «sider_viaje_anular»`);
  ok(l[0]?.a?.p_id === "v1", `se anuló el viaje «${l[0]?.a?.p_id}» y se tocó el botón de JGY577 (v1)`);
  ok(l[0]?.a?.p_motivo === "Se digitó dos veces",
     `el motivo llegó como ${JSON.stringify(l[0]?.a?.p_motivo)}: la base lo exige y lo guarda con el nombre`);
}

/* =====================================================================
   4 · EL ERROR DE LA BASE SE ENSEÑA, NO SE TRAGA

   Si la base rechaza —porque el rol no manda de verdad, o porque el
   viaje ya no existe—, el cuadro tiene que quedarse abierto y DECIRLO.
   Cerrarse como si hubiera funcionado es la peor de las salidas: el
   vehículo sigue ahí y nadie sabe por qué.
   ===================================================================== */
await monta(true);
{
  await pg.evaluate(() => { window.FALLA = "Solo quien administra la plataforma puede anular un viaje." });
  await pg.click(`${tarjeta("JGY577")} button:has-text('Anular')`);
  await pg.fill(".sd .vj-caja .vj-motivo-campo input", "Prueba del rechazo");
  await pg.click(".sd .vj-caja button:has-text('Anular el viaje')");
  await pg.waitForTimeout(150);
  ok(await pg.isVisible(".sd .vj-caja"),
     "la base rechazó y el cuadro se cerró igual: parece que se anuló y el vehículo sigue ahí");
  const err = await pg.textContent(".sd .vj-mal").catch(() => "");
  ok(/administra la plataforma/.test(err),
     `no se enseña lo que contestó la base: «${err}»`);
}

/* =====================================================================
   5 · CORREGIR: DESPLEGABLES DEL MAESTRO, NO CAMPO LIBRE

   La base valida la planta y el material contra el maestro. Un campo
   de texto a mano solo puede acabar en «Ese CD de origen no está en el
   maestro» después de haber escrito todo.
   ===================================================================== */
await monta(true);
{
  await pg.click(`${tarjeta("JGY577")} button:has-text('Corregir')`);
  await pg.waitForSelector(".sd .vj-campos");

  const sel = await pg.$$(".sd .vj-campos select");
  ok(sel.length === 2,
     `el cuadro de corregir trae ${sel.length} desplegables y el origen y el material tienen ` +
     "que serlo: la base los valida contra el maestro");

  /* Y VIENEN PUESTOS CON LO QUE EL VIAJE YA TIENE. Un cuadro que abre
     en blanco obliga a volver a escoger lo que no se venía a cambiar, y
     ahí es donde se cambia sin querer. */
  const puestos = await pg.$$eval(".sd .vj-campos select", (e) => e.map((x) => x.value));
  ok(puestos[0] === "P01" && puestos[1] === "3500887",
     `el cuadro abre con ${JSON.stringify(puestos)} en vez de lo que el viaje ya tenía`);
  const placa = await pg.inputValue(".sd .vj-campos input");
  ok(placa === "JGY577", `la placa abre como «${placa}» en vez de la del viaje`);

  /* LA COMA DECIMAL. Aquí se escribe «0,83»; `Number("0,83")` es NaN y
     la base contesta un mensaje sobre las estibas que no dice nada del
     teclado. */
  await pg.fill(".sd .vj-campos label:has(span:text-is('Estibas')) input", "12,5");
  await pg.click(".sd .vj-caja button:has-text('Guardar la corrección')");
  await pg.waitForTimeout(120);

  const l = await llamadas();
  ok(l[0]?.f === "sider_viaje_editar",
     `se llamó a «${l[0]?.f}» y la función que existe es «sider_viaje_editar»`);
  ok(l[0]?.a?.p_estibas === 12.5,
     `«12,5» llegó a la base como ${JSON.stringify(l[0]?.a?.p_estibas)}: la coma no se cambió por punto`);
  ok(l[0]?.a?.p_id === "v1" && l[0]?.a?.p_planta === "P01" && l[0]?.a?.p_sku === "3500887",
     `los demás campos llegaron mal: ${JSON.stringify(l[0]?.a)}`);
}

/* =====================================================================
   6 · NADA SE SALE, Y LOS BOTONES SE TOCAN
   ===================================================================== */
console.log("");
for (const [nombre, ancho] of [["pc", 1440], ["tab", 820], ["cel", 390], ["360", 360]]) {
  await monta(true, ancho, 1400);
  const fuera = await pg.evaluate((w) => {
    const mal = [];
    document.querySelectorAll(".sd *").forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width && (r.right > w + 1 || r.left < -1)) mal.push((e.className || e.tagName) + " → " + Math.round(r.right));
    });
    return mal.slice(0, 3);
  }, ancho);
  ok(fuera.length === 0, `a ${ancho}px se sale del ancho: ${JSON.stringify(fuera)}`);

  /* EL CUADRO DE ANULAR TAMPOCO SE SALE, y es el que de verdad se abre
     en el teléfono: el de corregir se usa sentado. */
  await pg.click(`${tarjeta("JGY577")} button:has-text('Anular')`);
  await pg.waitForSelector(".sd .vj-caja");
  const c = await pg.$eval(".sd .vj-caja", (e) => { const r = e.getBoundingClientRect();
    return { d: r.right, i: r.left } });
  ok(c.d <= ancho + 1 && c.i >= -1,
     `a ${ancho}px el cuadro de anular se sale: de ${Math.round(c.i)} a ${Math.round(c.d)}`);
  const bot = await pg.$$eval(".sd .vj-caja button",
    (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)).filter((h) => h < 44));
  ok(bot.length === 0, `a ${ancho}px hay botones de ${JSON.stringify(bot)} px en el cuadro de anular`);
  console.log(`${nombre.padEnd(5)} ${String(ancho).padStart(4)}px  ${fuera.length ? "SE SALE" : "bien"}`);
}

await monta(true);
await pg.click(`${tarjeta("JGY577")} button:has-text('Anular')`);
await pg.waitForSelector(".sd .vj-caja");
await pg.screenshot({ path: ".arnes/tr-anular.png" });
await monta(true);
await pg.screenshot({ path: ".arnes/tr-admin.png" });

await nav.close();
console.log("");
if (fallas.length) {
  console.log("FALLAS:");
  fallas.forEach((f) => console.log(" · " + f));
  process.exit(1);
}
console.log("✓ En tránsito: corregir y anular solo para quien manda, no en la tarjeta que espera " +
  "la muestra, anular exige motivo de verdad y llama a sider_viaje_anular con su p_motivo, " +
  "corregir usa los desplegables del maestro y manda «12,5» como 12.5, el rechazo de la base se " +
  "enseña sin cerrar el cuadro, y nada se sale en los cuatro anchos.");
