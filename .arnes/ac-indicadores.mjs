/* =====================================================================
   ACCIONES · INDICADORES — las cuentas y la pantalla de verdad.

   1. LAS CUENTAS (medir.ts) con acciones hechas a mano cuyo resultado se
      sabe de antemano: a tiempo, medianas, tendencia, antigüedad,
      reincidencia (la misma falla antes de 30 días), Pareto al 80 %,
      semáforo por responsable.
   2. LA PANTALLA (Indicadores.tsx) en Chromium con 300 acciones:
      1300 · 820 · 390 · 360 sin salirse; el periodo cambia las cifras;
      el mapa usa el plano cuando las zonas tienen coordenadas y las
      baldosas cuando no; modo reunión enseña UN bloque y se cambia; el
      PDF se baja; contraste ≥ 4.5 en los siete temas.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* ---------------- 1 · LAS CUENTAS ---------------- */
const med = buildSync({ entryPoints: [R("src/modulos/acciones/medir.ts")], bundle: true, write: false, format: "esm",
  platform: "node", alias: { "@": R("src") }, external: ["@/lib/*", "next/*"], logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_medir.mjs"), med);
const { medir, mediana, horas } = await import(R(".arnes/_medir.mjs") + "?" + Date.now());

const HOY = new Date("2026-09-22T15:00:00-05:00");
const H = 3_600_000, D = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
let n = 0;
const A = (o) => {
  const rep = HOY.getTime() - (o.haceD ?? 1) * D;
  const plazo = { alta: 24, media: 48, baja: 72 }[o.prioridad ?? "media"];
  const cerr = o.cerrarH != null ? rep + o.cerrarH * H : null;
  const estado = o.estado ?? (o.verificada ? "verificada" : cerr ? "cerrada" : "abierta");
  const viva = ["abierta", "reabierta"].includes(estado);
  return {
    id: "a" + ++n, codigo: "AC-" + n, tipo: "correctiva", titulo: "x", descripcion: null,
    motivo: o.motivo ?? "m1", motivo_nombre: o.motivo ?? "m1", motivo_critico: false, area: "s", area_nombre: "S",
    zona: o.zona ?? null, zona_nombre: o.zona ?? null, zona_proceso: null, ubicacion: "u", lat: null, lng: null, precision_m: null,
    prioridad: o.prioridad ?? "media", plazo: null, vence_en: iso(rep + plazo * H), estado, viva,
    vencida: viva && HOY.getTime() > rep + plazo * H, horas_restantes: 0, dias: 0,
    equipo: o.equipo ?? null, equipo_nombre: o.equipo ?? null, responsable: o.resp ?? null, sin_dueno: !o.resp && !o.equipo,
    asignada_por: null, asignada_en: o.asignarH != null ? iso(rep + o.asignarH * H) : null, reportada_por: null, reportada_en: iso(rep),
    que_se_hizo: null, cerrada_por: null, cerrada_en: cerr ? iso(cerr) : null,
    efectiva: o.verificada ? o.efectiva ?? true : null, nota_verificacion: null, verificada_por: null,
    verificada_en: o.verificada ? iso((cerr ?? rep) + 2 * H) : null, auto_verificada: false, causa_raiz: null,
  };
};
const metas = { efectividad: 90, aTiempo: 95 };
{
  n = 0;
  const lista = [
    A({ haceD: 10, cerrarH: 10, asignarH: 1, resp: "p1" }),                          // a tiempo (48 h)
    A({ haceD: 9, cerrarH: 30, asignarH: 3, resp: "p1" }),                           // a tiempo
    A({ haceD: 8, cerrarH: 60, resp: "p1" }),                                         // tarde
    A({ haceD: 7, cerrarH: 20, resp: "p2", verificada: true, efectiva: true, zona: "Z1", motivo: "fuga" }),
    A({ haceD: 5, cerrarH: 20, resp: "p2", verificada: true, efectiva: false }),
    A({ haceD: 2, zona: "Z1", motivo: "fuga", resp: "p2" }),                          // repite Z1 en < 30 d
    A({ haceD: 40, resp: "p3" }),                                                      // abierta vieja, vencida
    A({ haceD: 1, estado: "anulada" }),                                               // no cuenta
    A({ haceD: 3 }),                                                                  // sin dueño, vencida (48 h)
  ];
  const m = medir(lista, HOY, 30, metas, { p1: "Ana", p2: "Beto", p3: "Caro" });
  ok(m.kpis.cerradas === 5, `cerradas en 30 días: ${m.kpis.cerradas} (van 5)`);
  ok(m.kpis.aTiempo === 80, `a tiempo: ${m.kpis.aTiempo}% (4 de 5 = 80)`);
  ok(m.kpis.efectividad === null && m.kpis.verificadas === 2, `efectividad con 2 verificadas: ${m.kpis.efectividad} (no se dice: faltan 3)`);
  ok(m.kpis.abiertas === 3, `abiertas: ${m.kpis.abiertas} (3; la anulada no)`);
  ok(m.kpis.vencidas === 2, `vencidas: ${m.kpis.vencidas} (la de 40 días y la de 3)`);
  ok(m.kpis.cierreMedianaH === 20, `mediana de cierre: ${m.kpis.cierreMedianaH} h (10,20,20,30,60 → 20)`);
  const media = m.tiempos.find((t) => t.prioridad === "media");
  ok(media.plazoH === 48 && media.asignarH === 2, `tiempos media: plazo ${media.plazoH}, asignar ${media.asignarH} (48 y 2)`);
  ok(m.reincidencia.repeticiones === 1, `repeticiones: ${m.reincidencia.repeticiones} (la fuga de Z1 volvió a los 5 días)`);
  ok(m.reincidencia.real === 0, `efectividad real: ${m.reincidencia.real}% (la efectiva de Z1 se repitió → 0 de 2)`);
  ok(m.reincidencia.noEfectivas === 1, "no cuenta la verificada no efectiva");
  ok(m.franjas.find((f) => f.rot === "Más de 30").n === 1 && m.franjas.find((f) => f.rot === "Más de 30").vencidas === 1, "la abierta de 40 días no cae en «más de 30»");
  const sem = m.semanas.reduce((a, s) => a + s.entran, 0);
  ok(sem === 7, `las semanas suman ${sem} entradas (las 7 del periodo sin la anulada)`);
  ok(m.semanas.at(-1).quedan === 3, `abiertas al final de esta semana: ${m.semanas.at(-1).quedan} (3)`);
  ok(m.pareto[0].motivo === "m1" && m.pareto.at(-1).acumulado === 100, "el Pareto no termina en 100 % o no ordena");
  const sin = m.responsables.find((r) => r.nombre === "Sin dueño");
  ok(sin && sin.semaforo === "mal", "lo que no tiene dueño no sale en rojo");
  const ana = m.responsables.find((r) => r.nombre === "Ana");
  ok(ana && ana.aTiempo === 67 && ana.semaforo === "mal", `Ana: ${ana?.aTiempo}% a tiempo, semáforo ${ana?.semaforo} (67 %, 28 bajo la meta → mal)`);
  ok(m.zonas.find((z) => z.codigo === "Z1")?.repeticiones === 1, "la zona Z1 no marca su repetición");
  ok(mediana([5, 1, 3]) === 3 && mediana([]) === null, "mediana mal");
  ok(horas(0.5) === "30 min" && horas(5) === "5,0 h" && horas(48) === "2,0 días", `horas() se lee mal: ${horas(0.5)} ${horas(5)} ${horas(48)}`);
}

/* ---------------- 2 · LA PANTALLA ---------------- */
writeFileSync(R(".arnes/_ai-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Indicadores } from "../src/app/(app)/acciones/analisis/Indicadores";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Indicadores acciones={w.ACC} nombres={w.NOM} zonas={w.ZON}
  metas={{ efectividad: 90, aTiempo: 95 }} fotos={w.FOT} ahora={w.AHORA} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ai-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/acciones/acciones.css"), "utf8") + readFileSync(R("src/app/(app)/acciones/analisis/indicadores.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

/* 300 acciones de mentira en 180 días, con zonas, motivos y responsables. */
n = 0;
let semilla = 7; const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
const MOT = ["Derrame", "Estiba mal armada", "Pasillo obstruido", "Luminaria dañada", "Montacargas", "Señalización", "Orden y aseo", "Extintor"];
const ZONAS = Array.from({ length: 10 }, (_, i) => ({ codigo: "Z" + (i + 1), nombre: ["Muelle", "Pasillo A", "Pasillo B", "Patio", "Jaula PNC", "Cuarto frío", "Oficina", "Carga", "Descargue", "Taller"][i],
  proceso: null, area: "s", lat: 10.96 + (i % 5) * 0.0004, lng: -74.79 + Math.floor(i / 5) * 0.0006, activo: true, orden: i }));
const ACC = Array.from({ length: 300 }, () => {
  const hace = azar() * 180;
  const mot = MOT[Math.min(MOT.length - 1, Math.floor(Math.pow(azar(), 1.8) * MOT.length))];
  const zona = ZONAS[Math.floor(Math.pow(azar(), 1.5) * 10)].codigo;
  const pr = ["alta", "media", "baja"][Math.floor(azar() * 3)];
  const cerrada = hace > 6 ? azar() < .9 : azar() < .4;
  const a = A({ haceD: hace, prioridad: pr, motivo: mot, zona, resp: "p" + (1 + Math.floor(azar() * 6)),
    asignarH: azar() * 6, cerrarH: cerrada ? 2 + azar() * 90 : null, verificada: cerrada && azar() < .7, efectiva: azar() < .88 });
  return a;
});
const NOM = { p1: "Génesis Visbal", p2: "Santiago Leal", p3: "Ana María Pérez Gómez", p4: "Easy Logística", p5: "Summar", p6: "Carlos Ruiz" };
const PX = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="#8a9"/></svg>');
const FOT = [1, 2, 3].map((i) => ({ id: "f" + i, codigo: "AC-00" + i, titulo: "Derrame en muelle " + i, donde: "Muelle", efectiva: true,
  reportada_en: iso(HOY - 5 * D), cerrada_en: iso(HOY - 4 * D), antes: PX, despues: PX }));

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
await pg.route("**/marca/logo-b.png", (r) => r.fulfill({ status: 200, contentType: "image/png",
  body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
await pg.route("https://control.prueba/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }));
const monta = async (ancho, tema, zonas = ZONAS) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/acciones/analisis");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="ac" id="r"></div></main></div></div>
    <script>window.ACC=${JSON.stringify(ACC)};window.NOM=${JSON.stringify(NOM)};window.ZON=${JSON.stringify(zonas)};window.FOT=${JSON.stringify(FOT)};window.AHORA="${HOY.toISOString()}";</script>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".ai-kpis");
};

await monta(1300);
const bloques = await pg.$$eval("[data-bloque]", (b) => b.map((x) => x.dataset.bloque));
ok(bloques.join() === "resumen,tendencia,mapa,pareto,gente,antes", `faltan bloques: ${bloques}`);
ok((await pg.$$(".ai-graf .pto")).length === 10, "con coordenadas, el mapa no pinta el plano de la bodega");
const sub90 = await pg.textContent(".ai-sub");
await pg.click(".ai-seg button:has-text('30 días')");
const sub30 = await pg.textContent(".ai-sub");
ok(sub90 !== sub30 && /30 días/.test(sub30), `el periodo no cambia las cifras: «${sub90}» / «${sub30}»`);
ok((await pg.$$(".ai-graf rect.entran")).length >= 4, "la tendencia no pinta las semanas");
ok((await pg.$$(".ai-par.vital")).length >= 1, "el Pareto no marca los pocos vitales");
ok((await pg.$$(".ai-tabla tbody tr")).length === 6, `responsables: ${(await pg.$$(".ai-tabla tbody tr")).length} filas (6)`);
ok((await pg.$$(".ai-foto")).length === 3, "no salen los antes y después");
if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/ai-1300.png`, fullPage: true });

/* MODO REUNIÓN */
await pg.click(".ai-btn:has-text('Modo reunión')");
ok((await pg.$$("[data-bloque]")).length === 1 && (await pg.$$(".ai-puntos button")).length === 6, "el modo reunión no enseña un bloque a la vez");
await pg.click(".ai-puntos button:has-text('Mapa')");
ok((await pg.$eval("[data-bloque]", (b) => b.dataset.bloque)) === "mapa", "tocar «Mapa» en el modo reunión no lo enseña");
if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/ai-reunion.png` });
await pg.click(".ai-btn:has-text('Salir')");
ok((await pg.$$("[data-bloque]")).length === 6, "salir del modo reunión no devuelve todo");

/* PDF */
const [d] = await Promise.all([pg.waitForEvent("download", { timeout: 15000 }), pg.click(".ai-btn:has-text('Informe PDF')")]);
ok(/^acciones-indicadores-\d{4}-\d{2}-\d{2}\.pdf$/.test(d.suggestedFilename()), `el PDF sale con nombre ${d.suggestedFilename()}`);
const bytes = readFileSync(await d.path());
ok(bytes.subarray(0, 4).toString() === "%PDF" && bytes.length > 4000, `el PDF no es un PDF o está vacío (${bytes.length} bytes)`);

/* SIN COORDENADAS: baldosas */
await monta(1300, null, ZONAS.map((z) => ({ ...z, lat: null, lng: null })));
ok((await pg.$$(".ai-zona")).length === 10 && !(await pg.$(".ai-graf .pto")), "sin coordenadas, el mapa no cae a baldosas por zona");

/* ANCHOS */
for (const ancho of [1300, 820, 390, 360]) {
  await monta(ancho);
  const g = await pg.evaluate(() => {
    const cont = document.querySelector(".ai").getBoundingClientRect();
    const fuera = [...document.querySelectorAll(".ai *")].filter((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || e.closest(".ai-tabla-env") || e.closest("svg")) return false;
      return r.right > cont.right + 1 || r.left < cont.left - 1;
    }).map((e) => (e.className?.baseVal ?? e.className) + "").slice(0, 5);
    const chicos = [...document.querySelectorAll(".ai button")].filter((b) => b.getBoundingClientRect().height < 36).map((b) => b.textContent);
    return { lado: document.documentElement.scrollWidth - innerWidth, fuera, chicos };
  });
  ok(g.lado <= 0, `${ancho} px: la página se arrastra ${g.lado} px`);
  ok(!g.fuera.length, `${ancho} px: se sale ${g.fuera.join(", ")}`);
  ok(!g.chicos.length, `${ancho} px: botones de menos de 36 px: ${g.chicos}`);
  if (process.env.FOTO && ancho === 390) await pg.screenshot({ path: `${process.env.FOTO}/ai-390.png`, fullPage: true });
}

/* TEMAS */
const lum = (c) => { const k = c.startsWith("color(srgb") ? 1 : 255; const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= k; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1300, t);
  const p = await pg.evaluate(() => {
    const fondo = (e) => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255,255,255)" };
    const par = (s, fill) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return [fill ? c.fill : c.color, fondo(e)] };
    return { "rótulo kpi": par(".ai-kpi .rot"), "pie kpi": par(".ai-kpi .pie"), "cifra roja": par(".ai-kpi.mal .n"),
      "nota h2": par(".ai-caja h2 em"), "eje": par(".ai-graf .eje", true), "a tiempo chip": par(".ai-tp-cab em"),
      "periodo": par(".ai-seg button:not(.on)"), "periodo on": par(".ai-seg button.on"), "botón": par(".ai-btn:not(.sec)"),
      "baldosa fuerte": par(".ai-zona.fuerte b"), "responsable": par(".ai-tabla td small"), "leyenda": par(".ai-ley"),
      "pareto %": par(".ai-par em"), "reincidencia": par(".ai-rein span") };
  });
  for (const [k, v] of Object.entries(p)) if (v) ok(razon(v[0], v[1]) >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${razon(v[0], v[1]).toFixed(2)}`);
}
await nav.close();

if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Indicadores de acciones: cuentas exactas (a tiempo, medianas, tendencia, reincidencia a 30 días, Pareto, semáforo); " +
            "pantalla en 4 anchos, periodo, mapa con plano o baldosas, modo reunión, PDF y 7 temas.");
