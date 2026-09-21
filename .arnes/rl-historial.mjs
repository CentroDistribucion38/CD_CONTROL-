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
buildSync({
  entryPoints: [R("src/app/(app)/quiebra/rotura/tablero/Pestanas.tsx")],
  bundle: true, format: "esm", platform: "node", jsx: "automatic",
  outfile: R(".arnes/_pestanas.mjs"),
  external: ["react", "react/jsx-runtime", "react-dom"],
  alias: { "next/link": R(".arnes/_link.mjs") }, logLevel: "silent",
});
const P = await import(U("./_pestanas.mjs").href + "?v=" + Date.now());
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

/* ======================= 2 · EL TABLERO Y SU HOJA DE INFORMES =======================
   «Quiero que esto sea una hoja dentro del tablero: que esa sea solo de
   los informes generados, y tener la visual de visualizar, descargar y
   demás.» */
const pag = readFileSync(U("../src/app/(app)/quiebra/rotura/tablero/page.tsx"), "utf8");
const pagInf = readFileSync(U("../src/app/(app)/quiebra/rotura/tablero/informes/page.tsx"), "utf8");
ok(/hojasGuardadas\(desde, hasta\)/.test(pag), "el tablero no trae las hojas del período");
{
  const firma = pag.indexOf("Turnos sin firmar"), hj = pag.indexOf("<ResumenHojas"), det = pag.indexOf("El detalle, en números");
  ok(firma > 0 && hj > firma && det > hj,
     "el renglón de informes no va después de los turnos sin firmar y antes del detalle: ese es el orden del día");
}
ok(/conLinea=\{linea != null\}/.test(pag), "el tablero no le dice a la sección si hay filtro de línea");
ok(/<Pestanas actual="tablero"/.test(pag) && /<Pestanas actual="informes"/.test(pagInf),
   "el tablero y los informes no tienen las pestañas para pasar de una hoja a la otra");
ok(/puedeVer\("\/quiebra\/rotura\/tablero"\)/.test(pagInf),
   "la hoja de informes no pide el mismo permiso que el tablero: sería otra casilla en Roles que nadie marca");
ok(/puedeAnular=\{permisos\.manda\}/.test(pagInf), "en la hoja de informes no anula quien administra");
ok(/base="\/quiebra\/rotura\/tablero\/informes"/.test(pagInf),
   "el período de la hoja de informes lleva al tablero y no a los informes");

/* EL RENGLÓN DEL TABLERO, pintado de verdad. */
const html = renderToStaticMarkup(createElement(C.ResumenHojas, { hojas: HOJAS, dias: DIAS, conLinea: false, falta: false, desde: "2026-09-01", hasta: "2026-09-30" }));
const resumen = html.replace(/<[^>]+>/g, "");
ok(/4 hojas de 3 días/.test(resumen) && /3 días sin hoja/.test(resumen) && /1 cambió después/.test(resumen),
   `el renglón del tablero no dice la respuesta: «${resumen}»`);
ok(/href="\/quiebra\/rotura\/tablero\/informes\?desde=2026-09-01&amp;hasta=2026-09-30"/.test(html),
   "el renglón del tablero no lleva a la hoja de informes con el mismo período");
{
  const h3 = renderToStaticMarkup(createElement(C.ResumenHojas, { hojas: [], dias: [], conLinea: false, falta: true, desde: "x", hasta: "y" }));
  ok(/2026-09-rotura-linea-hojas\.sql/.test(h3), "sin la migración no dice qué correr");
}

/* LA HOJA DE INFORMES, pintada de verdad. */
buildSync({
  entryPoints: [R("src/app/(app)/quiebra/rotura/tablero/informes/Informes.tsx")],
  bundle: true, format: "esm", platform: "node", jsx: "automatic",
  outfile: R(".arnes/_informes.mjs"),
  external: ["react", "react/jsx-runtime", "react-dom"],
  alias: { "next/link": R(".arnes/_link.mjs"), "next/navigation": R(".arnes/_nav.mjs"),
           "@/lib/supabase/client": R(".arnes/_supa.mjs"), "@": R("src") },
  logLevel: "silent",
});
const I = await import(U("./_informes.mjs").href + "?v=" + Date.now());
const pinta = (p) => renderToStaticMarkup(createElement(I.Informes, { hojas: HOJAS, dias: DIAS, puedeAnular: true, ...p }));
const inf = pinta({});
ok((inf.match(/<article class="rl-inf/g) ?? []).length === 6, "la hoja de informes no pinta una tarjeta por informe");
ok((inf.match(/>Ver<\/button>/g) ?? []).length === 6 && (inf.match(/>Descargar<\/button>/g) ?? []).length >= 6,
   "no hay «Ver» y «Descargar» en cada informe");
ok((inf.match(/>Abrir en pestaña<\/a>/g) ?? []).length >= 6, "no hay «Abrir en pestaña» en cada informe");
/* AL ENTRAR SE VE LA MÁS NUEVA QUE VALE: la del 27, no la anulada del 28. */
ok(/<iframe src="https:\/\/x\/c1\.pdf"/.test(inf), "al entrar la vista previa no muestra la hoja más nueva que vale");
ok(/class="rl-inf elegida"/.test(inf) && inf.indexOf('class="rl-inf elegida"') < inf.indexOf("c1.pdf"),
   "la tarjeta que se está viendo no se distingue");
ok((inf.match(/class="rl-inf anulada/g) ?? []).length === 2, "las anuladas no se distinguen");
ok(/<s class="rl-hojas-cifra">999<\/s>/.test(inf), "la cifra de una hoja anulada no sale tachada");
ok(inf.includes("Anulada por Jefe: Se generó con el turno abierto"), "la hoja anulada no dice quién la anuló ni por qué");
ok(/class="rl-inf vieja/.test(inf), "la versión vieja de un día no se distingue de la última");
ok(/El día cambió después/.test(inf), "la hoja que quedó vieja no lo dice");
ok((inf.match(/>Anular<\/button>/g) ?? []).length === 4 && (inf.match(/>Quitar anulación<\/button>/g) ?? []).length === 2,
   "el administrador no tiene «Anular» en las vigentes y «Quitar anulación» en las anuladas");
ok(!/>Borrar</.test(inf), "hay un botón de borrar: las hojas se anulan, no se borran");
ok(inf.includes('href="/quiebra/rotura?d=2026-09-25&amp;hoja=1"'), "el día sin hoja no lleva directo a generarla");
ok(!/rl-hojas-accion/.test(pinta({ puedeAnular: false })), "quien no administra ve los botones de anular");
{
  const inf45 = renderToStaticMarkup(createElement(I.Informes, { dias: DIAS, puedeAnular: false,
    hojas: Array.from({ length: 75 }, (_, i) => hoja("m" + i, "2026-09-22", 150,
      `2026-09-22T${String(10 + (i % 12)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00+00:00`)) }));
  ok((inf45.match(/<article/g) ?? []).length <= 60, "con 75 informes pinta más de 60: un año entero serían cientos");
}
/* DESCARGAR, CON NOMBRE DE PERSONA y no con el del archivo interno. */
{
  const FILA_SRC = readFileSync(U("../src/app/(app)/quiebra/rotura/tablero/FilaHoja.tsx"), "utf8");
  const INF_SRC = readFileSync(U("../src/app/(app)/quiebra/rotura/tablero/informes/Informes.tsx"), "utf8");
  ok(/`rotura-linea-\$\{h\.fecha\}-/.test(FILA_SRC) && /enlace\.download = nombreDescarga\(h\)/.test(INF_SRC),
     "descargar no guarda el PDF con el nombre del día");
  ok(/window\.matchMedia\("\(max-width: 900px\)"\)\.matches/.test(INF_SRC) && /window\.open\(h\.url/.test(INF_SRC),
     "en el celular «Ver» no abre el PDF en su pestaña");
}

/* ======================= 3 · EN PANTALLA ======================= */
{
  const { chromium } = await import("playwright");
  const css = readFileSync(U("../src/app/(app)/quiebra/rotura/rotura.css"), "utf8");
  const glob = readFileSync(U("../src/app/globals.css"), "utf8");
  const shell = readFileSync(U("../src/app/(app)/shell.css"), "utf8");
  const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
  const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0,0,0]).slice(0,3).map(Number);
                           return c.startsWith("color(") ? n.map((v) => v * 255) : n };
  const razon = (a, b) => {
    const lum = (c) => { const [r,g,bl] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4 });
                         return 0.2126*r + 0.7152*g + 0.0722*bl };
    const L1 = lum(a), L2 = lum(b);
    return +((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2);
  };
  /* LA FILA DE ANULAR ABIERTA, con un error: se abre con un clic que aquí
     no hay; va armada con las clases del componente, y se exige que sean
     ESAS clases. */
  const FILA = readFileSync(U("../src/app/(app)/quiebra/rotura/tablero/FilaHoja.tsx"), "utf8");
  const ABIERTA = `<div class="rl-hojas-anular">
    <label><span>Por qué se anula la hoja del 22 sept de las 03:00 p. m.</span><input value="Se gener"></label>
    <p class="rl-hojas-error" role="alert">Escribe por qué se anula (al menos 5 letras).</p>
    <div class="rl-hojas-botones"><button type="button" class="rl-hojas-si">Anular la hoja</button>
      <button type="button" class="rl-hojas-no">Cancelar</button></div></div>`;
  const sueltas = [...ABIERTA.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => !FILA.includes(c));
  ok(sueltas.length === 0, `la fila de anular de la prueba usa clases que el componente no tiene: ${sueltas.join(", ")}`);
  const PES = renderToStaticMarkup(createElement(P.Pestanas, { actual: "informes", desde: "2026-09-01", hasta: "2026-09-30", informes: 4 }));
  const TAB = renderToStaticMarkup(createElement(C.ResumenHojas, { hojas: HOJAS, dias: DIAS, conLinea: false, falta: false, desde: "2026-09-01", hasta: "2026-09-30" }));

  const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const pg = await nav.newPage();
  const monta = async (tema, ancho) => {
    await pg.setViewportSize({ width: ancho, height: 900 });
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}
      html,body{margin:0}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main"><div class="rl">${PES}${TAB}${inf}</div></main></div></div></body></html>`);
    await pg.evaluate((abierta) => {
      document.querySelector(".rl-inf-acc")?.insertAdjacentHTML("afterend", abierta);
    }, ABIERTA);
  };
  for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
    await monta(t, 1300);
    const m = await pg.evaluate(() => {
      const fondo = (e) => {
        for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c }
        return "rgb(255, 255, 255)" };
      const par = (s) => { const e = document.querySelector(s);
                           return e ? { txt: getComputedStyle(e).color, fondo: fondo(e) } : { falta: s } };
      return { "pestaña puesta": par(".rl-pestanas a[aria-current]"), "pestaña de al lado": par(".rl-pestanas a:not([aria-current])"),
               "renglón del tablero": par(".rl-hojas-ir .rl-hojas-dice"), "ir a informes": par(".rl-hojas-flecha"),
               "día del informe": par(".rl-inf-dia b"), "hora": par(".rl-inf-dia span"), "unidades": par(".rl-inf-und"),
               "quién": par(".rl-inf-quien"), "ver": par(".rl-inf-btn.si"), "descargar": par(".rl-inf-acc button.rl-inf-btn:not(.si)"),
               "anulada": par(".rl-inf.anulada .rl-inf-dia b"), "motivo de la anulación": par(".rl-inf .rl-hojas-motivo"),
               "cambió después": par(".rl-inf .rl-hojas-cambio"), "versión vieja": par(".rl-inf-nota"),
               "botón anular": par(".rl-hojas-accion"), "qué se anula": par(".rl-hojas-anular label span"),
               "motivo": par(".rl-hojas-anular input"), "error": par(".rl-hojas-error"),
               "anular la hoja": par(".rl-hojas-si"), "cancelar": par(".rl-hojas-botones .rl-hojas-no"),
               "día pendiente": par(".rl-chip-firma b"), "cabecera de la vista": par(".rl-inf-vista header p") };
    });
    for (const [k, v] of Object.entries(m)) {
      if (v.falta) { ok(false, `tema ${t ?? "oficial"}: en pantalla no está «${k}» (${v.falta})`); continue }
      const x = razon(v.txt, v.fondo);
      ok(x >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${x} (mínimo 4.5)`);
    }
  }
  for (const ancho of [1300, 1024, 390, 360]) {
    await monta(null, ancho);
    const g = await pg.evaluate(() => {
      /* Solo lo que se ve: los botones de la vista previa no existen en el celular. */
      const alto = (s) => Math.min(...[...document.querySelectorAll(s)].filter((e) => e.offsetParent)
        .map((e) => Math.round(e.getBoundingClientRect().height)));
      const vista = document.querySelector(".rl-inf-vista");
      return {
        lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        boton: alto(".rl-inf-btn"), accion: alto(".rl-hojas-accion"), pestana: alto(".rl-pestanas a"),
        /* AL LADO de la lista, no debajo: debajo habría que bajar hasta el
           final de la lista para ver el papel. */
        vistaSe: vista ? getComputedStyle(vista).display !== "none" : false,
        vista: vista ? getComputedStyle(vista).display !== "none" && vista.getBoundingClientRect().width > 300
          && vista.getBoundingClientRect().left >= document.querySelector(".rl-inf-lista").getBoundingClientRect().right - 1 : false,
        fuera: [...document.querySelectorAll(".rl-inf-btn, .rl-hojas-accion")]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5 }).length,
      };
    });
    ok(g.lado <= 0, `${ancho} px: la hoja de informes arrastra la página ${g.lado} px de lado`);
    ok(g.fuera === 0, `${ancho} px: ${g.fuera} botón(es) de Ver, Descargar, Abrir o Anular quedan fuera de la pantalla`);
    ok(g.boton >= 40 && g.accion >= 40 && g.pestana >= 44,
       `${ancho} px: botones ${g.boton} px, anular ${g.accion} px, pestañas ${g.pestana} px`);
    /* LA VISTA PREVIA: al lado en pantalla grande, y en el celular no
       —ahí «Ver» abre la pestaña—. */
    if (ancho > 900) ok(g.vista, `${ancho} px: no se ve la vista previa al lado de la lista`);
    else ok(!g.vistaSe, `${ancho} px: la vista previa se mete en el celular, donde un PDF de 360 px no se lee`);
  }
  await nav.close();
}

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Informes generados: el tablero lleva a su hoja, y ahí cada informe se ve al lado, se descarga, " +
            "se abre o se anula; siete temas y cuatro anchos.");
