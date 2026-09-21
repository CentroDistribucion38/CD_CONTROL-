/* =====================================================================
   LAS HOJAS GENERADAS, EN EL TABLERO — medido, no mirado.

   «Y si no, que en el tablero de rotura haya una hoja con todos los PDF
   generados.»

   1. LA CUENTA. Qué días con rotura quedaron sin hoja —solo desde que la
      hoja existe—, cuál cambió DESPUÉS de generarla, y que con filtro de
      línea no se compare peras con manzanas.
   2. EL TABLERO. Que la sección esté, en su sitio, y que el día sin hoja
      lleve directo a generarla.
   3. EN PANTALLA. El componente DE VERDAD, pintado con React, en los
      siete temas y en un celular de 360.

     node .arnes/rl-historial.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => U("../" + p).pathname;
const fallas = [];
const ok = (c, msg) => { if (!c) fallas.push(msg) };

/* El componente y la cuenta, empaquetados como los ve el navegador. Lo
   único que se cambia es `next/link` por un <a>: fuera de Next no hay
   enrutador, y lo que se mide es a dónde lleva. */
writeFileSync(U("./_link.mjs"), `import { createElement } from "react";
export default function Link({ href, children, ...r }) { return createElement("a", { href, ...r }, children) }`);
writeFileSync(U("./_nav.mjs"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(U("./_supa.mjs"), `export const createClient = () => ({ rpc: async () => ({ error: null }) });`);
buildSync({
  entryPoints: [R("src/app/(app)/quiebra/rotura/tablero/Hojas.tsx")],
  bundle: true, format: "esm", platform: "node", jsx: "automatic",
  outfile: R(".arnes/_hojas-tablero.mjs"),
  external: ["react", "react/jsx-runtime", "react-dom"],
  alias: { "next/link": R(".arnes/_link.mjs"), "next/navigation": R(".arnes/_nav.mjs"),
           "@/lib/supabase/client": R(".arnes/_supa.mjs"), "@": R("src") },
  logLevel: "silent",
});
const C = await import(U("./_hojas-tablero.mjs").href + "?v=" + Date.now());
writeFileSync(U("./_historial.mjs"), buildSync({
  entryPoints: [R("src/modulos/rotlinea/historial.ts")], bundle: true, format: "esm", write: false,
}).outputFiles[0].text);
const Hs = await import(U("./_historial.mjs").href + "?v=" + Date.now());
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");

/* ======================= 1 · LA CUENTA ======================= */
const hoja = (id, fecha, unidades, generado_en, extra = {}) => ({
  id, fecha, ruta: `${fecha}/${id}.pdf`, bytes: 110000, unidades, kg: 1, lineas: 1,
  elaboro: "Santiago", supervisor: "Pedro", observaciones: null,
  generado_nombre: "Santiago Leal", generado_en, url: `https://x/${id}.pdf`, ...extra,
});
const HOJAS = [
  hoja("a1", "2026-09-22", 100, "2026-09-22T15:00:00+00:00"),   // versión vieja
  hoja("a2", "2026-09-22", 150, "2026-09-22T20:00:00+00:00"),   // la última: cuadra
  hoja("b1", "2026-09-23",  90, "2026-09-23T18:00:00+00:00"),   // cuadra con DOS líneas: 50 + 40
  hoja("c1", "2026-09-27",  10, "2026-09-27T18:00:00+00:00"),   // el día cambió después: ahora 12
  /* ANULADAS: se ven, pero no cuentan. */
  hoja("e1", "2026-09-22", 999, "2026-09-22T23:00:00+00:00",     // la más nueva del 22, pero anulada:
       { anulada_en: "2026-09-23T10:00:00+00:00", anulada_motivo: "Se generó con el turno abierto",
         anulada_nombre: "Jefe" }),                               //   la del 22 sigue siendo a2
  hoja("d1", "2026-09-28",  20, "2026-09-28T18:00:00+00:00",     // la única del 28, anulada:
       { anulada_en: "2026-09-28T19:00:00+00:00", anulada_motivo: "Día equivocado", anulada_nombre: "Jefe" }),
];
const DIAS = [
  { fecha: "2026-09-22", linea: 1, und: 150 },
  { fecha: "2026-09-23", linea: 1, und: 50 }, { fecha: "2026-09-23", linea: 2, und: 40 },
  { fecha: "2026-09-24", linea: 1, und: 70 },                    // sin hoja
  { fecha: "2026-09-25", linea: 1, und: 30 },                    // sin hoja, más nuevo
  { fecha: "2026-09-26", linea: 1, und: 0 },                     // sin rotura: no pide hoja
  { fecha: "2026-09-10", linea: 1, und: 99 },                    // antes de que existiera la hoja
  { fecha: "2026-09-27", linea: 1, und: 12 },
  { fecha: "2026-09-28", linea: 1, und: 20 },                    // su única hoja se anuló: pide otra
];
const r = Hs.resumirHojas(HOJAS, DIAS, { conLinea: false });
ok(r.total === 4 && r.dias === 3 && r.anuladas === 2,
   `cuenta ${r.total} hojas de ${r.dias} días y ${r.anuladas} anuladas; son 4 de 3 y 2 anuladas`);
ok(JSON.stringify(r.sinHoja.map((d) => d.fecha)) === '["2026-09-28","2026-09-25","2026-09-24"]',
   `los días sin hoja son ${JSON.stringify(r.sinHoja.map((d) => d.fecha))} y deben ser el 28 —su única hoja se anuló—, el 25 y el 24, el más nuevo primero`);
ok(r.esUltima(HOJAS[1]) && !r.esUltima(HOJAS[4]),
   "una hoja anulada cuenta como la hoja del día: la del 22 tiene que seguir siendo la de las 20:00");
ok(!r.sinHoja.some((d) => d.fecha === "2026-09-10"),
   "cuenta como «sin hoja» un día de antes de que la hoja existiera: una alarma que nadie puede cerrar");
ok(!r.sinHoja.some((d) => d.fecha === "2026-09-26"), "pide hoja de un día sin rotura");
ok(r.cambio.has("c1") && r.cambio.size === 1,
   `el día que cambió después no se marca bien: ${[...r.cambio].join(", ") || "ninguno"} (debe ser solo c1: 10 contra 12; b1 cuadra con 50 + 40)`);
ok(!r.cambio.has("a1"), "marca como cambiada una versión vieja: se compara solo la última de cada día");
ok(r.esUltima(HOJAS[1]) && !r.esUltima(HOJAS[0]), "no distingue la última versión de un día de las anteriores");
ok(r.ordenadas.map((h) => h.id).join() === "d1,c1,b1,e1,a2,a1",
   "la lista no va de la más nueva a la más vieja");
const conL = Hs.resumirHojas(HOJAS, DIAS.filter((d) => d.linea === 1), { conLinea: true });
ok(conL.cambio.size === 0,
   "con filtro de línea marca hojas como cambiadas: compara la línea con el día entero");

/* ======================= 2 · EL TABLERO ======================= */
const pag = readFileSync(U("../src/app/(app)/quiebra/rotura/tablero/page.tsx"), "utf8");
ok(/hojasGuardadas\(desde, hasta\)/.test(pag), "el tablero no trae las hojas del período");
{
  const firma = pag.indexOf("Turnos sin firmar"), hj = pag.indexOf("<HojasGeneradas"), det = pag.indexOf("El detalle, en números");
  ok(firma > 0 && hj > firma && det > hj,
     "las hojas no van después de los turnos sin firmar y antes del detalle: ese es el orden del día");
}
ok(/conLinea=\{linea != null\}/.test(pag), "el tablero no le dice a la sección si hay filtro de línea");
ok(/puedeAnular=\{permisos\.manda\}/.test(pag), "el tablero no deja anular a quien administra");

/* El componente pintado de verdad. */
const html = renderToStaticMarkup(createElement(C.HojasGeneradas, { hojas: HOJAS, dias: DIAS, conLinea: false, falta: false }));
ok(/<details[^>]*class="[^"]*rl-hojas/.test(html) && /<summary>/.test(html),
   "la sección no va cerrada con la respuesta en el renglón");
const resumen = html.match(/<summary>([\s\S]*?)<\/summary>/)?.[1].replace(/<[^>]+>/g, "") ?? "";
ok(/4 hojas de 3 días/.test(resumen) && /3 días sin hoja/.test(resumen) && /1 cambió después/.test(resumen) &&
   /2 anuladas/.test(resumen),
   `el renglón no dice la respuesta: «${resumen}»`);
ok(html.includes('href="/quiebra/rotura?d=2026-09-25&amp;hoja=1"'),
   "el día sin hoja no lleva directo a generarla (a Registrar con la ventana abierta)");
ok(html.includes('href="https://x/a2.pdf"'), "la hoja no tiene cómo abrirse");
ok(/class="rl-hojas-vieja"/.test(html), "las versiones viejas no se distinguen de la última");
/* LA ANULADA SE VE, TACHADA, CON QUIÉN Y POR QUÉ. */
ok((html.match(/class="rl-hojas-anulada"/g) ?? []).length === 2, "las hojas anuladas no se distinguen en la lista");
ok(/<s class="rl-hojas-cifra">999<\/s>/.test(html), "la cifra de una hoja anulada no sale tachada");
ok(html.includes("Anulada por Jefe: Se generó con el turno abierto"), "la hoja anulada no dice quién la anuló ni por qué");
/* SOLO QUIEN ADMINISTRA VE LOS BOTONES. */
ok(!/rl-hojas-accion/.test(html), "quien no administra ve los botones de anular");
const htmlAdm = renderToStaticMarkup(createElement(C.HojasGeneradas, { hojas: HOJAS, dias: DIAS, conLinea: false, falta: false, puedeAnular: true }));
ok((htmlAdm.match(/>Anular<\/button>/g) ?? []).length === 4 && (htmlAdm.match(/>Quitar anulación<\/button>/g) ?? []).length === 2,
   "el administrador no tiene «Anular» en las vigentes y «Quitar anulación» en las anuladas");
ok(!/>Borrar</.test(htmlAdm), "hay un botón de borrar: las hojas se anulan, no se borran");
{
  const muchas = Array.from({ length: 45 }, (_, i) =>
    hoja("m" + i, "2026-09-22", 150, `2026-09-22T${String(10 + (i % 12)).padStart(2, "0")}:${String(i).padStart(2, "0")}:00+00:00`));
  const h2 = renderToStaticMarkup(createElement(C.HojasGeneradas, { hojas: muchas, dias: DIAS, conLinea: false, falta: false }));
  const filas = (h2.match(/<tr[ >]/g) ?? []).length - 1;
  ok(filas <= 30, `con 45 hojas pinta ${filas} filas: un año entero serían cientos`);
}
{
  const h3 = renderToStaticMarkup(createElement(C.HojasGeneradas, { hojas: [], dias: [], conLinea: false, falta: true }));
  ok(/2026-09-rotura-linea-hojas\.sql/.test(h3), "sin la migración no dice qué correr");
}

/* ======================= 3 · EN PANTALLA ======================= */
{
  const { chromium } = await import("playwright");
  const css = readFileSync(U("../src/app/(app)/quiebra/rotura/rotura.css"), "utf8");
  const glob = readFileSync(U("../src/app/globals.css"), "utf8");
  const shell = readFileSync(U("../src/app/(app)/shell.css"), "utf8");
  const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0,0,0]).slice(0,3).map(Number);
                           return c.startsWith("color(") ? n.map((v) => v * 255) : n };
  const razon = (a, b) => {
    const lum = (c) => { const [r,g,bl] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4 });
                         return 0.2126*r + 0.7152*g + 0.0722*bl };
    const L1 = lum(a), L2 = lum(b);
    return +((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2);
  };
  /* LA FILA DE ANULAR ABIERTA —con el motivo a medio escribir y un
     error—. Se abre con un clic, que aquí no hay; va armada con las
     clases del componente, y se exige que sean ESAS clases. */
  const FILA = readFileSync(U("../src/app/(app)/quiebra/rotura/tablero/FilaHoja.tsx"), "utf8");
  const ABIERTA = `<tr class="rl-hojas-anular"><td colspan="6">
    <label><span>Por qué se anula la hoja del 22 sept de las 03:00 p. m.</span><input value="Se gener"></label>
    <p class="rl-hojas-error" role="alert">Escribe por qué se anula (al menos 5 letras).</p>
    <div class="rl-hojas-botones"><button type="button" class="rl-hojas-si">Anular la hoja</button>
      <button type="button" class="rl-hojas-no">Cancelar</button></div></td></tr>`;
  const sueltas = [...ABIERTA.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => !FILA.includes(c));
  ok(sueltas.length === 0, `la fila de anular de la prueba usa clases que el componente no tiene: ${sueltas.join(", ")}`);

  const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const pg = await nav.newPage();
  const monta = async (tema, ancho) => {
    await pg.setViewportSize({ width: ancho, height: 900 });
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${glob}${shell}${css}
      html,body{margin:0}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main"><div class="rl">${htmlAdm}</div></main></div></div></body></html>`);
    await pg.evaluate((abierta) => {
      const d = document.querySelector("details"); if (d) d.open = true;
      document.querySelector(".rl-hojas-tabla tbody tr")?.insertAdjacentHTML("afterend", abierta);
    }, ABIERTA);
  };
  for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
    await monta(t, 1200);
    const m = await pg.evaluate(() => {
      const fondo = (e) => {
        for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c }
        return "rgb(255, 255, 255)" };
      const par = (s) => { const e = document.querySelector(s);
                           return e ? { txt: getComputedStyle(e).color, fondo: fondo(e) } : { falta: s } };
      return { "título": par(".rl-hojas-tit"), "resumen": par(".rl-hojas-dice"), "lo pendiente": par(".rl-hojas-dice em"),
               "cambió después": par(".rl-hojas-cambio"), "abrir": par(".rl-hojas-tabla td a"),
               "versión vieja": par(".rl-hojas-vieja td"), "hora": par(".rl-hojas-tabla td small"),
               "día pendiente": par(".rl-chip-firma b"),
               "anulada": par(".rl-hojas-anulada td"), "motivo de la anulación": par(".rl-hojas-motivo"),
               "botón anular": par(".rl-hojas-accion"), "qué se anula": par(".rl-hojas-anular label span"),
               "motivo": par(".rl-hojas-anular input"), "error": par(".rl-hojas-error"),
               "anular la hoja": par(".rl-hojas-si"), "cancelar": par(".rl-hojas-botones .rl-hojas-no") };
    });
    for (const [k, v] of Object.entries(m)) {
      if (v.falta) { ok(false, `tema ${t ?? "oficial"}: en pantalla no está «${k}» (${v.falta})`); continue }
      const x = razon(v.txt, v.fondo);
      ok(x >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${x} (mínimo 4.5)`);
    }
  }
  for (const ancho of [1200, 390, 360]) {
    await monta(null, ancho);
    const g = await pg.evaluate(() => {
      const alto = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : 0 };
      return {
        lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        resumen: alto(".rl-hojas > summary"), abrir: alto(".rl-hojas-tabla td a"),
        accion: alto(".rl-hojas-accion"), si: alto(".rl-hojas-si"), motivo: alto(".rl-hojas-anular input"),
      };
    });
    ok(g.lado <= 0, `${ancho} px: las hojas arrastran la página ${g.lado} px de lado`);
    ok(g.resumen >= 44, `${ancho} px: el renglón que abre mide ${g.resumen} px (mínimo 44)`);
    ok(g.abrir >= 36, `${ancho} px: «Abrir» mide ${g.abrir} px de alto`);
    ok(g.accion >= 36, `${ancho} px: «Anular» mide ${g.accion} px de alto`);
    ok(g.si >= 44 && g.motivo >= 44, `${ancho} px: anular la hoja mide ${g.si} px y el motivo ${g.motivo} px (mínimo 44)`);
  }
  await nav.close();
}

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Hojas en el tablero: dice cuáles faltan y cuáles cambiaron, lleva a generarlas y se lee en los siete temas.");
