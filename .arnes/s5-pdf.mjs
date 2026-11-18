/* 5S PASO 2: Cronograma (Gantt), Tablero (+ imagen), Informe (hojas + PDF) y zonas. */
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const hoy = new Date().toLocaleDateString("sv", { timeZone: "America/Bogota" });
const mas = (f, n) => new Date(new Date(f + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
const AREAS = [
  { id: "a1", nombre: "BODEGA 38", descripcion: null, responsable_id: "r1", meta: 92, activa: true, orden: 1 },
  { id: "a2", nombre: "FABRICA", descripcion: null, responsable_id: "r2", meta: null, activa: true, orden: 2 },
  { id: "a3", nombre: "PATIO", descripcion: null, responsable_id: "r1", meta: null, activa: true, orden: 3 },
  { id: "a4", nombre: "OFICINAS", descripcion: null, responsable_id: null, meta: null, activa: true, orden: 4 },
];
const RESP = [{ id: "r1", nombre: "Genesis Visbal", cedula: null, cargo: "Warehouse Supervisor", activo: true }, { id: "r2", nombre: "Carlos Mejía", cedula: null, cargo: "Jefe de turno", activo: true }];
const S = ["clasificar", "ordenar", "limpiar", "estandarizar", "disciplina"];
const ps = (b) => Object.fromEntries(S.map((s, i) => [s, Math.max(40, Math.min(100, b + (i % 2 ? -12 : 6) + (i === 2 ? -10 : 0)))]));
const INSP = [];
let k = 0;
for (let w = 0; w < 10; w++) for (const a of AREAS.slice(0, 3)) {
  const f = mas(hoy, -w * 7 - (k % 3)); const c = Math.round((78 + ((k * 37) % 22)) * 10) / 10;
  INSP.push({ id: "i" + (++k), fecha: f, area_id: a.id, area: a.nombre, responsable: RESP.find((r) => r.id === a.responsable_id)?.nombre ?? null,
    auditor_nombre: k % 2 ? "Cristian Padilla" : "Josué Ruiz", cumplimiento: c, meta: a.meta ?? 90, evaluados: 15, no_cumple: c < 90 ? 2 : 0, nota: null,
    creado: f + "T14:42:00Z", por_s: ps(c), fotos: 2 });
}
INSP.sort((a, b) => b.fecha.localeCompare(a.fecha));
const NC = INSP.filter((i) => i.no_cumple).flatMap((i, j) => [
  { inspeccion_id: i.id, s: "limpiar", pregunta: "Pisos, estanterías y equipos limpios, sin derrames ni vidrio.", zona: j % 2 ? "CALLE 4" : "CALLE 2", severidad: "media" },
  { inspeccion_id: i.id, s: j % 3 ? "ordenar" : "disciplina", pregunta: j % 3 ? "Pasillos, salidas de emergencia y extintores libres y señalizados." : "El personal usa la dotación y los EPP completos.", zona: "CALLE 3", severidad: j % 4 ? "media" : "alta" },
]);
const PLAN = [
  { id: "c1", area_id: "a1", area: "BODEGA 38", auditor_id: "r2", auditor: "Carlos Mejía", actividad: "Auditoría 5S", desde: mas(hoy, -9), hasta: mas(hoy, -5), prioridad: "media", nota: null, cancelada: false, estado: "hecha", inspeccion_id: "i1", hecha_el: mas(hoy, -7), cumplimiento: 77.8, meta: 90 },
  { id: "c2", area_id: "a1", area: "BODEGA 38", auditor_id: "r2", auditor: "Carlos Mejía", actividad: "Auditoría 5S", desde: mas(hoy, -2), hasta: mas(hoy, 2), prioridad: "alta", nota: null, cancelada: false, estado: "en_curso", inspeccion_id: null, hecha_el: null, cumplimiento: null, meta: null },
  { id: "c3", area_id: "a2", area: "FABRICA", auditor_id: "r1", auditor: "Genesis Visbal", actividad: "Auditoría 5S", desde: mas(hoy, -12), hasta: mas(hoy, -8), prioridad: "media", nota: null, cancelada: false, estado: "vencida", inspeccion_id: null, hecha_el: null, cumplimiento: null, meta: null },
  { id: "c4", area_id: "a2", area: "FABRICA", auditor_id: "r1", auditor: "Genesis Visbal", actividad: "Auditoría 5S", desde: mas(hoy, 5), hasta: mas(hoy, 9), prioridad: "baja", nota: null, cancelada: false, estado: "programada", inspeccion_id: null, hecha_el: null, cumplimiento: null, meta: null },
  { id: "c5", area_id: "a3", area: "PATIO", auditor_id: null, auditor: null, actividad: "Auditoría 5S", desde: mas(hoy, 1), hasta: mas(hoy, 3), prioridad: "media", nota: null, cancelada: false, estado: "programada", inspeccion_id: null, hecha_el: null, cumplimiento: null, meta: null },
  { id: "c6", area_id: "a3", area: "PATIO", auditor_id: null, auditor: null, actividad: "Auditoría 5S", desde: mas(hoy, 2), hasta: mas(hoy, 6), prioridad: "media", nota: null, cancelada: false, estado: "programada", inspeccion_id: null, hecha_el: null, cumplimiento: null, meta: null },
  { id: "c8", area_id: "a4", area: "OFICINAS", auditor_id: "r2", auditor: "Andres Palacio", actividad: "Auditoría 5S", desde: mas(hoy, 2), hasta: mas(hoy, 2), prioridad: "alta", nota: null, cancelada: false, estado: "programada", inspeccion_id: null, hecha_el: null, cumplimiento: null, meta: null },
  { id: "c7", area_id: "a4", area: "OFICINAS", auditor_id: null, auditor: null, actividad: "Auditoría 5S", desde: mas(hoy, 12), hasta: mas(hoy, 16), prioridad: "media", nota: null, cancelada: true, estado: "cancelada", inspeccion_id: null, hecha_el: null, cumplimiento: null, meta: null },
];
const foto = "data:image/jpeg;base64," + readFileSync("/tmp/inf/f1.jpg").toString("base64");
const foto2 = "data:image/jpeg;base64," + readFileSync("/tmp/inf/f2.jpg").toString("base64");
const PREG = ["No hay materiales, herramientas ni equipos que no se usen en el área.", "Lo dañado, vencido o para baja está identificado y separado.", "No hay estibas, cajas ni envase fuera de su lugar o abandonados.",
  "Cada cosa tiene un lugar marcado y está en su lugar.", "Pasillos, salidas de emergencia y extintores libres y señalizados.", "Las ubicaciones y la demarcación del piso están visibles y completas.",
  "Pisos, estanterías y equipos limpios, sin derrames ni vidrio.", "Las canecas están identificadas y no rebosan.", "Se cumple el cronograma de aseo del área.", "Calle de envase sin vidrio roto.",
  "Los estándares visuales (fotos, rótulos, demarcación) están al día.", "Las novedades de la auditoría anterior están cerradas.", "Los responsables del área están publicados y vigentes.",
  "El personal usa la dotación y los EPP completos.", "El personal conoce y aplica las 5S del área.", "Se respetan las normas del área (no comer, no fumar, celulares)."];
const SS = [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4];
const ITEMS = PREG.map((p, i) => ({ id: "it" + i, orden: i, s: S[SS[i]], pregunta: p, peso: 1,
  resultado: i === 4 || i === 6 ? "no_cumple" : i === 2 ? "na" : "cumple", severidad: i === 4 ? "alta" : i === 6 ? "media" : null,
  observacion: i === 4 ? "Extintor de la calle 3 tapado por estibas de envase vacío." : i === 6 ? "Vidrio roto junto a la columna 12." : null, zona: i === 4 ? "CALLE 3" : i === 6 ? "CALLE 4" : null }));
const DATOS = { insp: { ...INSP[0], id: "x1", area: "BODEGA 38", fecha: "2026-11-18", creado: "2026-11-18T14:42:00Z", cumplimiento: 77.8, meta: 90, evaluados: 15, no_cumple: 2, nota: "Turno B con mucho movimiento de envase. El extintor de la calle 3 se despejó durante la visita.", por_s: { clasificar: 100, ordenar: 66.7, limpiar: 80, estandarizar: 100, disciplina: 100 }, fotos: 3, responsable: "ANDRES PALACIO", auditor_nombre: "Cristian Padilla" },
  items: ITEMS, fotos: [{ item_id: "it4", url: foto }, { item_id: "it6", url: foto2 }, { item_id: "it1", url: foto }, { item_id: "it3", url: foto2 }, { item_id: "it5", url: foto }, { item_id: "it8", url: foto2 }, { item_id: "it9", url: foto }], cargo: "Warehouse Supervisor", anterior: 91, numero: "5S-2026-0147" };

writeFileSync(R(".arnes/_s5b-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Cronograma } from "../src/app/(app)/5s/cronograma/Cronograma";
import { Tablero } from "../src/app/(app)/5s/tablero/Tablero";
import { Informe5S } from "../src/app/(app)/5s/informe/[id]/Informe5S";
const D = ${JSON.stringify({ AREAS, RESP, INSP, NC, PLAN, DATOS })};
const pant = new URLSearchParams(location.hash.slice(1)).get("p") ?? "crono";
createRoot(document.getElementById("r")!).render(
  pant === "tab" ? <Tablero filas={D.INSP as any} areas={D.AREAS as any} responsables={D.RESP as any} meta={90} plan={D.PLAN as any} noCumple={D.NC as any} />
  : pant === "inf" ? <Informe5S datos={D.DATOS as any} descargar={false} />
  : <Cronograma filas={D.PLAN as any} areas={D.AREAS as any} responsables={D.RESP as any} puedeEditar />);
`);
const r = await build({ entryPoints: [R(".arnes/_s5b-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-s5.ts"), "next/link": R(".arnes/_link-s5.tsx"), "@/lib/supabase/client": R(".arnes/_supa-s5.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error", loader: { ".css": "empty" } });
const js = r.outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/5s/cinco-s.css", "src/app/(app)/5s/informe/[id]/informe.css", "src/components/foto-compartir.css"].map((f) => readFileSync(R(f), "utf8")).join("\n");
const fuentes = `@font-face{font-family:Archivo;font-weight:900;src:url(/__f/archivo-latin-900-normal.woff2)}@font-face{font-family:Archivo;font-weight:800;src:url(/__f/archivo-latin-800-normal.woff2)}@font-face{font-family:Archivo;font-weight:700;src:url(/__f/archivo-latin-700-normal.woff2)}@font-face{font-family:"IBM Plex Sans";font-weight:400;src:url(/__f/ibm-plex-sans-latin-400-normal.woff2)}@font-face{font-family:"IBM Plex Sans";font-weight:600;src:url(/__f/ibm-plex-sans-latin-600-normal.woff2)}@font-face{font-family:"IBM Plex Sans";font-weight:700;src:url(/__f/ibm-plex-sans-latin-700-normal.woff2)}`;
writeFileSync(R("public/__s5b.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${fuentes}${css}</style></head>
<body style="background:#EEF1F5"><div style="padding:18px" id="r"></div><script>${js}</script></body></html>`);

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctxB = await nav.newContext({ acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
const pg = await ctxB.newPage();
pg.on("pageerror", (e) => fallas.push("error: " + e.message));
const abrir = async (p, ancho = 1440) => { await pg.setViewportSize({ width: ancho, height: 1000 }); await pg.goto(`http://localhost:8765/__s5b.html#p=${p}`); await pg.reload(); await pg.waitForSelector(".s5 h1, .i5 h1") };

/* ---------- INFORME ---------- */
await abrir("inf");
await pg.screenshot({ path: "/tmp/s5-vista.png", clip: { x: 0, y: 0, width: 1440, height: 760 } });
await pg.hover(".i5-x"); await pg.screenshot({ path: "/tmp/s5-x.png", clip: { x: 1100, y: 0, width: 340, height: 130 } });
const hojas = await pg.$$(".i5-hoja");
ok(hojas.length >= 2, "hojas del informe: " + hojas.length);
const desborda = await pg.$$eval(".i5-cuerpo", (cs) => cs.map((c) => { const h = c.closest(".i5-hoja"); return c.getBoundingClientRect().bottom > h.getBoundingClientRect().bottom - 34 }));
ok(!desborda.some(Boolean), "alguna hoja se desborda: " + desborda);
ok(!(await pg.textContent(".i5-barra")).includes("Historial") && await pg.isVisible(".i5-x"), "falta la X");
ok(/Página: 1 de/.test(await pg.textContent(".i5-hoja")), "sin «Página X de N»");
ok(/Inspeccion 5S - BODEGA 38 - 18-11-2026 09-42\.pdf/.test(await pg.textContent(".i5-barra")), "nombre del archivo: " + await pg.textContent(".i5-barra .s5-sub"));
for (const [i, h] of hojas.entries()) await h.screenshot({ path: `/tmp/s5-inf-${i + 1}.png` });
const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 30000 }), pg.click('button:has-text("Descargar PDF")')]);
await dl.saveAs("/tmp/s5-informe-hd.pdf");
ok(dl.suggestedFilename() === "Inspeccion 5S - BODEGA 38 - 18-11-2026 09-42.pdf", "archivo: " + dl.suggestedFilename());
await nav.close();
console.log(fallas.length ? "FALLAS:\n- " + fallas.join("\n- ") : "TODO OK");
