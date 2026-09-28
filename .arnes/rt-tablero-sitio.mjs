/* =====================================================================
   ROTURAS · EN SITIO · EL TABLERO — la tabla de todo lo registrado.

   ESTA PANTALLA NO TENÍA ARNÉS, y por eso se pudo pasar meses enseñando
   la mitad del dato sin que nada se pusiera rojo: se registraban 200
   rotas y 100 contaminadas —las dos guardadas en el mismo renglón— y la
   tabla decía «200». Las contaminadas no salían en ninguna columna, ni
   en el KPI de arriba. Desde afuera parecía que no se habían
   registrado.

   Lo que se mide:

   1. LAS DOS CIFRAS, EN DOS COLUMNAS. Rotas y contaminadas no se suman
      porque no cuestan lo mismo: la rota pierde el líquido Y el envase;
      la contaminada solo el líquido, porque la botella vuelve entera.

   2. EL EER NO TIENE CONTAMINADAS. Es envase vacío: no hay líquido que
      contaminar, y un «0» ahí diría «se contaminaron cero», que es un
      dato. Dice «—», que es «no aplica».

   3. QUÉ SE VA A COBRAR, al abrir la fila: en producto terminado
      líquido y envase; en EER solo envase.

   4. EL ESTADO DE CADA UNA, con su nombre y su color.

   5. NADA SE SALE, en los cuatro anchos, y se lee en los siete temas.

     node .arnes/rt-tablero-sitio.mjs
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

writeFileSync(R(".arnes/_nav-rt.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-rt.ts"), `export const createClient = () => ({
  rpc: async () => ({ data: null, error: null }),
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
});`);

/* ---------- LOS DATOS ----------
   El caso de Cristian, tal cual: 200 rotas y 100 contaminadas en una
   sola rotura de producto terminado. Más un EER —que no lleva
   contaminadas— y una de causa que NO es del OL, que nace decidida. */
writeFileSync(R(".arnes/_rt-tab.tsx"), `
import { createRoot } from "react-dom/client";
import { Tablero } from "../src/app/(app)/roturas/en-sitio/tablero/Tablero";

const base = {
  color: "ambar" as const, area: "bahias_t1", area_nombre: "Bahías T1",
  proceso: "lineas", proceso_nombre: "Líneas",
  exige_foto: false, descripcion: null, lat: null, lng: null, precision_m: null,
  reportada_por: "u-sup", reportada_en: "2026-09-28T14:23:00Z", minutos: 30,
  fotos: 0, le_falta_foto: false, ol_respuesta: null, ol_por: null, ol_en: null,
  ol_nota: null, nota_decision: null, motivo_anulacion: null, anulada_en: null,
  cobro_por: null, fotos_descargo: 0, origen: "opm", opm_nombre: null,
};
const roturas = [
  /* LA DE LA CAPTURA: 200 rotas + 100 contaminadas, esperando al OL.
     30 botellas por empaque, así que el envase son 6.000 botellas y el
     líquido 300 empaques (las rotas y las contaminadas lo pierden). */
  { ...base, id: "r1", codigo: "RB-0012", material: "3128",
    material_nombre: "Aguila RN 330cc X 30", tipo: "producto_terminado" as const,
    unidades: 200, contaminadas: 100, botellas: 6000,
    unidades_liquido: 300, unidades_vidrio: 6000,
    causa: "condiciones", causa_nombre: "Condiciones del sitio", grupo: "asumida" as const,
    estado: "esperando" as const, etapa: "espera_ol", esperando: true, cuenta: false },
  /* ENVASE: no hay líquido que contaminar. */
  { ...base, id: "r2", codigo: "RB-0011", material: "3500162",
    material_nombre: "Envase Marron 330R", tipo: "eer" as const,
    unidades: 20, contaminadas: null, botellas: null,
    unidades_liquido: 0, unidades_vidrio: 20,
    causa: "estibas_malas", causa_nombre: "Estibas en mal estado", grupo: "asumida" as const,
    estado: "esperando" as const, etapa: "espera_ol", esperando: true, cuenta: false },
  /* NO ES DEL OL: nace en «no se cobra» y no pasa por su bandeja. */
  { ...base, id: "r3", codigo: "RB-0010", material: "3128",
    material_nombre: "Aguila RN 330cc X 30", tipo: "producto_terminado" as const,
    unidades: 15, contaminadas: 0, botellas: 450,
    unidades_liquido: 15, unidades_vidrio: 450,
    causa: "falla_maquinas", causa_nombre: "Falla de las máquinas", grupo: "no_asumida" as const,
    estado: "no_cuenta" as const, etapa: "no_cuenta", esperando: false, cuenta: false, exige_foto: true, fotos: 1 },
  /* YA A COBRO. */
  { ...base, id: "r4", codigo: "RB-0009", material: "3128",
    material_nombre: "Aguila RN 330cc X 30", tipo: "producto_terminado" as const,
    unidades: 100, contaminadas: 0, botellas: 3000,
    unidades_liquido: 100, unidades_vidrio: 3000,
    causa: "comportamiento", causa_nombre: "Comportamiento del personal", grupo: "asumida" as const,
    estado: "cuenta" as const, etapa: "cobro", esperando: false, cuenta: true,
    ol_respuesta: "acepta", cobro_por: "acuerdo" },
];
createRoot(document.getElementById("r")!).render(
  <Tablero roturas={roturas as any} nombres={{ "u-sup": "sleal" }} manda />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_rt-tab.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-rt.ts"),
           "@/lib/supabase/client": R(".arnes/_supa-rt.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/roturas/roturas.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

const monta = async (ancho = 1440, alto = 1000, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <style>${P}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>${js}<\/script></body></html>`);
  await pg.waitForSelector(".rt .tb-tabla tbody tr");
};

await monta();
ok(rotos.length === 0, `la pantalla tiró un error: ${rotos[0]}`);

/* =====================================================================
   1 y 2 · LAS DOS CIFRAS, Y EL EER SIN CONTAMINADAS
   ===================================================================== */
{
  const cabs = await pg.$$eval(".rt .tb-tabla thead th", (t) => t.map((x) => x.textContent.trim()));
  ok(cabs.includes("Rotas") && cabs.includes("Contam."),
     `la tabla no separa rotas de contaminadas: [${cabs.join(", ")}] — con una sola columna «Und.» ` +
     "las contaminadas no salen en ninguna parte y parece que no se registraron");
  ok(!cabs.includes("Und."),
     "quedó la columna «Und.» de antes: dos columnas para lo mismo es peor que una mala");

  const filas = await pg.$$eval(".rt .tb-tabla tbody tr:not(.tb-detalle)", (ts) =>
    ts.map((t) => [...t.querySelectorAll("td")].map((d) => d.textContent.trim())));
  const rb12 = filas.find((f) => f[0] === "RB-0012");
  ok(!!rb12, "no está la fila de la rotura con contaminadas");
  ok(rb12 && rb12[3] === "200",
     `RB-0012 dice ${rb12?.[3]} rotas y son 200`);
  ok(rb12 && rb12[4] === "100",
     `RB-0012 dice «${rb12?.[4]}» en contaminadas y son 100 — es exactamente lo que no se veía`);

  const rb11 = filas.find((f) => f[0] === "RB-0011");
  ok(rb11 && rb11[4] === "—",
     `en el EER la columna de contaminadas dice «${rb11?.[4]}» y debería decir «—»: no hay líquido ` +
     "que contaminar, y un cero se lee como «se contaminaron cero», que es un dato que nadie midió");
}

/* =====================================================================
   3 · QUÉ SE VA A COBRAR, AL ABRIR LA FILA
   ---------------------------------------------------------------------
   En producto terminado se cobran las dos cosas —el líquido perdido y
   el envase roto— y en EER solo el envase. Quien decide tiene que ver
   sobre qué se cobra sin sacar la cuenta.
   ===================================================================== */
{
  await pg.click(".rt .tb-tabla tbody tr td.tb-cod button:text-is('RB-0012')");
  await pg.waitForSelector(".rt .tb-detalle");
  const d = (await pg.textContent(".rt .tb-detalle")).replace(/\s+/g, " ");
  ok(/200 rotas \(6000 botellas\)/.test(d),
     `al abrir la de producto no dice las rotas con sus botellas: «${d.slice(0, 300)}»`);
  ok(/100 contaminadas/.test(d),
     `al abrir la de producto no dice las contaminadas: «${d.slice(0, 300)}»`);
  /* NO SE INVENTA EL COBRO. Los precios van por BOTELLA y de las
     contaminadas solo se guardan los empaques, así que hasta que ese
     dato exista este renglón dice lo que se CONTÓ y no lo que se cobra.
     Un número de plata puesto a ojo en pantalla no se vuelve a
     cuestionar. */
  ok(!/\$/.test(d), `el detalle ya está poniendo plata y todavía no se puede: «${d.slice(0, 300)}»`);

  await pg.click(".rt .tb-tabla tbody tr td.tb-cod button:text-is('RB-0011')");
  await pg.waitForSelector(".rt .tb-detalle");
  const e = (await pg.textContent(".rt .tb-detalle")).replace(/\s+/g, " ");
  ok(/20 de envase/.test(e) && !/l[ií]quido/.test(e),
     `en EER se está hablando de líquido, y no hay: «${e.slice(0, 300)}»`);
  await pg.click(".rt .tb-tabla tbody tr td.tb-cod button:text-is('RB-0011')");
}

/* =====================================================================
   4 · EL ESTADO DE CADA UNA
   ===================================================================== */
{
  const est = await pg.$$eval(".rt .tb-tabla tbody tr:not(.tb-detalle)", (ts) =>
    Object.fromEntries(ts.map((t) => {
      const c = t.querySelectorAll("td");
      return [c[0].textContent.trim(), c[8].textContent.trim()];
    })));
  ok(est["RB-0012"] === "ESPERA AL OL", `RB-0012 (causa del OL) dice «${est["RB-0012"]}»`);
  ok(est["RB-0010"] === "NO SE COBRA",
     `RB-0010 es de causa que NO es del OL y dice «${est["RB-0010"]}»: esas nacen decididas y no ` +
     "pasan por la bandeja de nadie");
  ok(est["RB-0009"] === "A COBRO", `RB-0009 dice «${est["RB-0009"]}»`);
}

/* =====================================================================
   5 · NADA SE SALE, EN CUATRO ANCHOS
   ---------------------------------------------------------------------
   La tabla se desplaza sola a lo ancho; lo que NO puede es arrastrar la
   página entera, que es lo que hace que nadie la use de pie.
   ===================================================================== */
for (const [ancho, alto] of [[360, 780], [768, 1024], [1024, 900], [1440, 1000]]) {
  await monta(ancho, alto);
  const m = await pg.evaluate(() => {
    const d = document.documentElement;
    const t = document.querySelector(".rt .tb-tabla");
    const rueda = document.querySelector(".rt .tb-rueda");
    return {
      pagina: d.scrollWidth - d.clientWidth,
      tabla: t ? Math.round(t.getBoundingClientRect().width) : 0,
      rueda: rueda ? Math.round(rueda.clientWidth) : 0,
      corre: rueda ? getComputedStyle(rueda).overflowX : "",
    };
  });
  ok(m.pagina <= 1, `en ${ancho} px la página se corre de lado ${m.pagina} px`);
  ok(m.corre === "auto" || m.corre === "scroll",
     `en ${ancho} px la tabla no tiene su propio desplazamiento (${m.corre}): con nueve columnas ` +
     "eso arrastra la página entera");
  ok(m.tabla >= m.rueda - 1,
     `en ${ancho} px la tabla mide ${m.tabla} dentro de ${m.rueda}: se encogió al contenido`);
}

/* =====================================================================
   6 · SE LEE EN LOS SIETE TEMAS
   ===================================================================== */
const CANAL = (c) => {
  const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  return c.startsWith("color(") ? n : n.map((v) => v / 255);
};
const LUM = (c) => {
  const [r, g, b] = CANAL(c).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const CONTRA = (a, b) => {
  const [p, q] = [LUM(a), LUM(b)].sort((m, n) => n - m);
  return (p + 0.05) / (q + 0.05);
};
console.log("");
for (const tema of ["oficial", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, 1000, tema);
  const m = await pg.evaluate(() => {
    const detras = (e) => {
      for (let n = e; n; n = n.parentElement) {
        const b = getComputedStyle(n).backgroundColor;
        if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") return b;
      }
      return "rgb(255, 255, 255)";
    };
    const t = (s) => { const e = document.querySelector(s); if (!e) return null;
      const g = getComputedStyle(e), b = g.backgroundColor;
      return [g.color, (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") ? b : detras(e.parentElement)] };
    return { cab: t(".rt .tb-tabla thead th"), rotas: t(".rt .tb-tabla tbody td.tb-num"),
             cont: t(".rt .tb-tabla tbody td.tb-cont"), na: t(".rt .tb-tabla .tb-na"),
             esp: t(".rt .tb-eti.tb-esp"), cobro: t(".rt .tb-eti.tb-ok") };
  });
  const pares = [["cabecera", m.cab], ["rotas", m.rotas], ["contam", m.cont],
                 ["no aplica", m.na], ["espera", m.esp], ["cobro", m.cobro]];
  const c = ([, p]) => CONTRA(p[0], p[1]);
  /* 4,5 para el texto; 3 para las etiquetas de estado, que van en
     negrita sobre su propio fondo. */
  const tope = (k) => (k === "espera" || k === "cobro") ? 3 : 4.5;
  const malos = pares.filter((p) => p[1] && c(p) < tope(p[0]));
  ok(malos.length === 0,
     `en el tema ${tema} no se lee: ${malos.map((p) => `${p[0]} ${c(p).toFixed(1)}`).join(", ")}`);
  console.log(`${tema.padEnd(8)} ` + pares.map((p) => p[1]
    ? `${p[0]} ${c(p).toFixed(1)}` : `${p[0]} —`).join("  "));
}

await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("\n✓ El tablero de en sitio: rotas y contaminadas en dos columnas y el EER con «—», " +
            "al abrir dice lo que se contó —rotas con sus botellas y contaminadas— sin inventar el cobro, cada " +
            "estado con su nombre, y nada se sale ni se deja de leer en cuatro anchos y siete temas.");
