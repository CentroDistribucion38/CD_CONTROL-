/* 5S PASO 3 (plan de acción, firmas, visor B) — basado en el paso 2: Cronograma (Gantt), Tablero (+ imagen), Informe (hojas + PDF) y zonas. */
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
  observacion: i === 4 ? "Extintor de la calle 3 tapado por estibas de envase vacío." : i === 6 ? "Vidrio roto junto a la columna 12." : null, zona: i === 4 ? "CALLE 3" : i === 6 ? "CALLE 4" : null,
  accion: i === 4 ? "Retirar las estibas de envase y demarcar el área del extintor." : null, accion_resp: i === 4 ? "Carlos Mejía" : null, accion_fecha: i === 4 ? "2026-11-20" : null,
  cerrada_el: i === 6 ? "2026-11-19T15:00:00Z" : null, cerrada_por: i === 6 ? "Cristian" : null, cierre_nota: i === 6 ? "Se barrió y se retiró el vidrio; se dejó caneca de vidrio en la columna 12." : null }));
const HALL = [
  { id: "h1", inspeccion_id: "x1", fecha: mas(hoy, -9), area_id: "a1", area: "BODEGA 38", area_responsable: "Genesis Visbal", orden: 4, s: "ordenar", pregunta: "Pasillos, salidas de emergencia y extintores libres y señalizados.", severidad: "alta", observacion: "Extintor de la calle 3 tapado por estibas de envase vacío.", zona: "CALLE 3", accion: "Retirar las estibas y demarcar el área del extintor.", accion_resp_id: "r2", accion_resp: "Carlos Mejía", accion_fecha: mas(hoy, -2), cerrada_el: null, cerrada_por: null, cierre_nota: null, estado: "vencida", dias: 9, fotos_antes: 1, fotos_despues: 0 },
  { id: "h2", inspeccion_id: "x1", fecha: mas(hoy, -1), area_id: "a2", area: "FABRICA", area_responsable: "Carlos Mejía", orden: 6, s: "limpiar", pregunta: "Pisos, estanterías y equipos limpios, sin derrames ni vidrio.", severidad: "media", observacion: "Derrame de cerveza junto a la llenadora 2.", zona: null, accion: null, accion_resp_id: null, accion_resp: null, accion_fecha: null, cerrada_el: null, cerrada_por: null, cierre_nota: null, estado: "sin_plan", dias: 1, fotos_antes: 0, fotos_despues: 0 },
  { id: "h3", inspeccion_id: "x2", fecha: mas(hoy, -3), area_id: "a1", area: "BODEGA 38", area_responsable: "Genesis Visbal", orden: 9, s: "estandarizar", pregunta: "Los estándares visuales están al día.", severidad: "baja", observacion: "Rótulo de la calle 5 caído.", zona: "CALLE 5", accion: "Volver a pegar el rótulo.", accion_resp_id: "r1", accion_resp: "Genesis Visbal", accion_fecha: mas(hoy, 4), cerrada_el: null, cerrada_por: null, cierre_nota: null, estado: "abierta", dias: 3, fotos_antes: 1, fotos_despues: 0 },
  { id: "h4", inspeccion_id: "x3", fecha: mas(hoy, -12), area_id: "a3", area: "PATIO", area_responsable: "Genesis Visbal", orden: 2, s: "clasificar", pregunta: "Lo dañado está identificado y separado.", severidad: "media", observacion: "Estibas rotas mezcladas con las buenas.", zona: null, accion: "Separar estibas rotas.", accion_resp_id: "r1", accion_resp: "Genesis Visbal", accion_fecha: mas(hoy, -6), cerrada_el: mas(hoy, -7) + "T15:00:00Z", cerrada_por: "Cristian", cierre_nota: "Se separaron 14 estibas rotas en la zona de baja.", estado: "cerrada", dias: 5, fotos_antes: 1, fotos_despues: 1 },
];
const FOTOSH = { h1: { antes: [foto], despues: [] }, h3: { antes: [foto2], despues: [] }, h4: { antes: [foto2], despues: [foto] } };
const DATOS = { insp: { ...INSP[0], id: "x1", area: "BODEGA 38", fecha: "2026-11-18", creado: "2026-11-18T14:42:00Z", cumplimiento: 77.8, meta: 90, evaluados: 15, no_cumple: 2, nota: "Turno B con mucho movimiento de envase. El extintor de la calle 3 se despejó durante la visita.", por_s: { clasificar: 100, ordenar: 66.7, limpiar: 80, estandarizar: 100, disciplina: 100 }, fotos: 3, responsable: "ANDRES PALACIO", auditor_nombre: "Cristian Padilla" },
  items: ITEMS, fotos: [{ item_id: "it4", url: foto }, { item_id: "it6", url: foto2 }, { item_id: "it1", url: foto }, { item_id: "it3", url: foto2 }, { item_id: "it5", url: foto }, { item_id: "it8", url: foto2 }, { item_id: "it9", url: foto }, { item_id: "it6", url: foto, momento: "despues" }], cargo: "Warehouse Supervisor", anterior: 91, numero: "5S-2026-0147" };

writeFileSync(R(".arnes/_s5b-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Cronograma } from "../src/app/(app)/5s/cronograma/Cronograma";
import { Tablero } from "../src/app/(app)/5s/tablero/Tablero";
import { Informe5S } from "../src/app/(app)/5s/informe/[id]/Informe5S";
import { PlanAccion } from "../src/app/(app)/5s/plan/PlanAccion";
const D = ${JSON.stringify({ AREAS, RESP, INSP, NC, PLAN, DATOS, HALL, FOTOSH })};
const pant = new URLSearchParams(location.hash.slice(1)).get("p") ?? "crono";
createRoot(document.getElementById("r")!).render(
  pant === "tab" ? <Tablero filas={D.INSP as any} areas={D.AREAS as any} responsables={D.RESP as any} meta={90} plan={D.PLAN as any} noCumple={D.NC as any} hallazgos={D.HALL as any} />
  : pant === "inf" ? <Informe5S datos={D.DATOS as any} descargar={false} responsables={D.RESP as any} areaResp="r1" puedeFirmar />
  : pant === "plan" ? <PlanAccion filas={D.HALL as any} areas={D.AREAS as any} responsables={D.RESP as any} fotos={D.FOTOSH as any} puedeEditar />
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

/* ---------- PLAN DE ACCIÓN ---------- */
await abrir("plan");
const est = await pg.$$eval(".s5-hal > li", (ls) => ls.map((l) => l.className));
ok(est.join() === "est-vencida,est-sin_plan,est-abierta", "orden/pendientes: " + est.join());
ok(/Vencidos\s*1/.test(await pg.textContent(".s5-kpis")), "kpi vencidos");
await pg.screenshot({ path: "/tmp/s5-plan.png", fullPage: true });
await pg.click('.s5-hal > li.est-sin_plan button:has-text("Asignar plan")');
ok(/Derrame de cerveza/.test(await pg.textContent(".s5-mo-hal")), "la ventana no muestra el hallazgo");
ok(await pg.inputValue(".s5-mo select") === "r2", "no arranca en el responsable del área: " + await pg.inputValue(".s5-mo select"));
await pg.click('.s5-mo button[type=submit]');
ok(/Escribe qué se va a hacer/.test(await pg.textContent("body")), "dejó guardar sin acción");
await pg.fill(".s5-mo textarea", "Limpiar el derrame y revisar la válvula de la llenadora.");
await pg.click('.s5-mo button:has-text("1 semana")');
await pg.locator(".s5-mo").screenshot({ path: "/tmp/s5-plan-mo.png" });
await pg.click('.s5-mo button[type=submit]');
{ const l = (await pg.evaluate(() => window.log)).find((x) => x.k === "rpc:s5_plan");
  ok(l && l.v.p_item === "h2" && l.v.p_resp === "r2" && l.v.p_fecha === mas(hoy, 7) && /válvula/.test(l.v.p_accion), "rpc plan: " + JSON.stringify(l)); }
await pg.click('.s5-hal > li.est-vencida button:has-text("Cerrar con foto")');
await pg.fill(".s5-mo textarea", "Se retiraron las estibas.");
await pg.click('.s5-mo button[type=submit]');
ok(/foto del después/i.test(await pg.textContent("body")), "dejó cerrar sin foto");
ok(!(await pg.evaluate(() => window.log)).some((x) => x.k === "rpc:s5_cerrar"), "llamó cerrar sin foto");
await pg.setInputFiles("input[type=file]", "/tmp/inf/f1.jpg");
await pg.waitForSelector(".s5-despues figure img");
await pg.locator(".s5-mo").screenshot({ path: "/tmp/s5-cierre-mo.png" });
await pg.click('.s5-mo button[type=submit]');
await pg.waitForTimeout(300);
{ const log = await pg.evaluate(() => window.log);
  const sub = log.filter((x) => x.k === "subir"); const c = log.find((x) => x.k === "rpc:s5_cerrar");
  ok(sub.length === 1 && /^x1\/cierre-h1-\d+-1\.jpg$/.test(sub[0].v.ruta), "ruta de la foto: " + JSON.stringify(sub));
  ok(c && c.v.p_item === "h1" && c.v.p_fotos.length === 1 && c.v.p_fotos[0].ruta === sub[0]?.v.ruta, "rpc cerrar: " + JSON.stringify(c)); }
await pg.click('.s5-seg button:has-text("Cerrados")');
ok((await pg.$$(".s5-hal > li.est-cerrada")).length === 1 && /a tiempo/.test(await pg.textContent(".s5-hal")), "cerrados / a tiempo");
await pg.click('.s5-hal button:has-text("Reabrir")');
await pg.click('.cf-velo .cf-botones button:not(.plano)');
await pg.waitForTimeout(200);
ok((await pg.evaluate(() => window.log)).some((x) => x.k === "rpc:s5_reabrir"), "no reabrió");
await abrir("plan", 390);
await pg.screenshot({ path: "/tmp/s5-plan-cel.png", fullPage: true });

/* ---------- TABLERO (plan) ---------- */
await abrir("tab");
ok(/Plan de acción/.test(await pg.textContent(".s5-tab-grid")), "falta la tarjeta del plan");
await pg.locator('.s5-card:has(h2:has-text("Plan de acción"))').screenshot({ path: "/tmp/s5-tab-plan.png" });

/* ---------- INFORME (visor B) ---------- */
await abrir("inf");
await pg.waitForTimeout(300);
await pg.screenshot({ path: "/tmp/s5-visorB.png" });
ok(await pg.inputValue(".i5-lado .firmas select") === "r1", "firma ABI no arranca en el responsable del área");
await pg.fill(".i5-lado .firmas input", "Luis Pérez");
await pg.keyboard.press("Escape");
ok(await pg.isVisible(".i5-lado"), "Esc dentro del campo cerró el informe");
await pg.press(".i5-lado .firmas input", "Enter");
await pg.waitForTimeout(150);
{ const f = (await pg.evaluate(() => window.log)).filter((x) => x.k === "rpc:s5_firmas").pop();
  ok(f && f.v.p_ol === "Luis Pérez" && f.v.p_abi === "r1", "rpc firmas OL: " + JSON.stringify(f)); }
await pg.selectOption(".i5-lado .firmas select", "r2");
await pg.waitForTimeout(150);
{ const f = (await pg.evaluate(() => window.log)).filter((x) => x.k === "rpc:s5_firmas").pop();
  ok(f && f.v.p_ol === "Luis Pérez" && f.v.p_abi === "r2", "rpc firmas ABI: " + JSON.stringify(f)); }
ok(/Luis Pérez\s*Supervisor OL/.test(await pg.textContent(".i5-fir")) && /Carlos Mejía\s*Warehouse Supervisor ABI/.test(await pg.textContent(".i5-fir")), "las firmas no salen en la hoja: " + await pg.textContent(".i5-fir"));
await pg.evaluate(() => scrollTo(0, 0)); await pg.waitForTimeout(100); { const b = await pg.locator(".i5-lado .firmas").boundingBox(); await pg.screenshot({ path: "/tmp/s5-firmas.png", clip: { x: b.x, y: b.y, width: b.width, height: b.height } }) }
await pg.click('.i5-pag button[aria-label="Hoja siguiente"]');
await pg.waitForTimeout(700);
ok(/Hoja 2 de/.test(await pg.textContent(".i5-pag")), "paginación: " + await pg.textContent(".i5-pag"));
await pg.click('.i5-pag button[aria-label="Acercar"]');
ok(/\d+ %/.test(await pg.textContent(".i5-pag .z")), "zoom");
await pg.click('.i5-pag .z'); // vuelve a ajustar
const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 30000 }), pg.click('.i5-lado button:has-text("Descargar PDF")')]);
await dl.saveAs("/tmp/s5-informe-p3.pdf");
await abrir("inf", 390);
await pg.screenshot({ path: "/tmp/s5-visorB-cel.png" });
await nav.close();
console.log(fallas.length ? "FALLAS:\n- " + fallas.join("\n- ") : "TODO OK");
