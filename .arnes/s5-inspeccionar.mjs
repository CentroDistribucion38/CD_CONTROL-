/* 5S · INSPECCIONAR, HISTORIAL Y MAESTRO en el navegador, con la base de mentiras. */
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_nav-s5.ts"), `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });`);
writeFileSync(R(".arnes/_link-s5.tsx"), `export default function Link(p: any) { return <a href={p.href} className={p.className}>{p.children}</a> }`);
writeFileSync(R(".arnes/_supa-s5.ts"), `
const w = window as any;
const rec = (k: string, v: any) => { w.log = [...(w.log ?? []), { k, v }] };
const q = (tabla: string) => {
  const o: any = { _t: tabla, _f: [] as any[],
    select() { return o }, eq(c: string, v: any) { o._f.push([c, v]); return o }, order() { return o },
    insert(v: any) { rec("insert:" + tabla, v); return Promise.resolve({ error: w.falla?.[tabla] ?? null }) },
    update(v: any) { rec("update:" + tabla, v); return { eq: (c: string, id: any) => Promise.resolve({ error: null }) } },
    then(ok: any) { const d = (w.datos?.[tabla] ?? []).filter((r: any) => o._f.every(([c, v]: any) => r[c] === v)); return Promise.resolve({ data: d, error: null }).then(ok) },
  };
  return o;
};
export const createClient = () => ({
  from: q,
  rpc: async (f: string, a: any) => { rec("rpc:" + f, a); if (w.rpcFalla) return { error: { message: w.rpcFalla }, data: null }; return { error: null, data: f === "s5_borrar" ? ["x/1.jpg"] : "ok" } },
  storage: { from: () => ({
    upload: async (ruta: string, blob: Blob) => { rec("subir", { ruta, bytes: blob.size }); return { error: null } },
    remove: async (r: string[]) => { rec("quitar", r); return { error: null } },
    createSignedUrls: async (r: string[]) => ({ data: r.map((p) => ({ path: p, signedUrl: w.fotoUrl })) }),
  }) },
});`);

const AREAS = [
  { id: "a1", nombre: "BODEGA 38", descripcion: null, responsable_id: "r1", meta: 92, activa: true, orden: 1 },
  { id: "a2", nombre: "FABRICA", descripcion: "Calle fábrica", responsable_id: null, meta: null, activa: true, orden: 2 },
];
const RESP = [{ id: "r1", nombre: "Genesis Visbal", cedula: "123", cargo: "Supervisora de bodega", activo: true }];
const S = ["clasificar", "ordenar", "limpiar", "estandarizar", "disciplina"];
const PREG = {
  clasificar: ["No hay materiales, herramientas ni equipos que no se usen en el área.", "Lo dañado, vencido o para baja está identificado y separado.", "No hay estibas, cajas ni envase fuera de su lugar o abandonados."],
  ordenar: ["Cada cosa tiene un lugar marcado y está en su lugar.", "Pasillos, salidas de emergencia y extintores libres y señalizados.", "Las ubicaciones y la demarcación del piso están visibles y completas."],
  limpiar: ["Pisos, estanterías y equipos limpios, sin derrames ni vidrio.", "Las canecas están identificadas y no rebosan.", "Se cumple el cronograma de aseo del área."],
  estandarizar: ["Los estándares visuales (fotos, rótulos, demarcación) están al día.", "Las novedades de la auditoría anterior están cerradas.", "Los responsables del área están publicados y vigentes."],
  disciplina: ["El personal usa la dotación y los EPP completos.", "El personal conoce y aplica las 5S del área.", "Se respetan las normas del área (no comer, no fumar, celulares)."],
};
let n = 0;
const PUNTOS = S.flatMap((s) => PREG[s].map((q, i) => ({ id: "p" + (++n), area_id: null, s, pregunta: q, peso: 1, exige_foto: n === 2 || n === 5, orden: n, activo: true })));
PUNTOS.push({ id: "p99", area_id: "a1", s: "limpiar", pregunta: "Calle de envase sin vidrio roto", peso: 2, exige_foto: false, orden: 20, activo: true });
const INSP = [
  { id: "i1", fecha: "2026-11-17", area_id: "a1", area: "BODEGA 38", responsable: "Genesis Visbal", auditor_nombre: "Cristian Padilla", cumplimiento: 87.5, meta: 92, evaluados: 15, no_cumple: 2, nota: "Turno B con mucho movimiento.", creado: "2026-11-17T15:00:00Z", por_s: { clasificar: 100, ordenar: 66.7, limpiar: 80, estandarizar: 100, disciplina: 100 }, fotos: 2 },
  { id: "i2", fecha: "2026-11-10", area_id: "a2", area: "FABRICA", responsable: null, auditor_nombre: "Cristian Padilla", cumplimiento: 100, meta: 90, evaluados: 14, no_cumple: 0, nota: null, creado: "2026-11-10T15:00:00Z", por_s: { clasificar: 100, ordenar: 100, limpiar: 100, estandarizar: 100, disciplina: 100 }, fotos: 0 },
];
const ITEMS = PUNTOS.slice(0, 15).map((p, i) => ({ id: "it" + i, inspeccion_id: "i1", orden: p.orden, s: p.s, pregunta: p.pregunta, peso: 1,
  resultado: i === 4 || i === 6 ? "no_cumple" : i === 2 ? "na" : "cumple", severidad: i === 4 ? "alta" : i === 6 ? "media" : null,
  observacion: i === 4 ? "Extintor de la calle 3 tapado por estibas." : i === 6 ? "Vidrio junto a la columna 12." : null }));

writeFileSync(R(".arnes/_s5-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Inspeccionar } from "../src/app/(app)/5s/Inspeccionar";
import { Historial } from "../src/app/(app)/5s/historial/Historial";
import { Maestro5S } from "../src/app/(app)/5s/maestro/Maestro5S";
const w = window as any;
const D = ${JSON.stringify({ AREAS, RESP, PUNTOS, INSP, ITEMS })};
w.datos = { s5_inspeccion_puntos: D.ITEMS, s5_fotos: [{ inspeccion_id: "i1", item_id: "it4", ruta: "i1/p5-1.jpg" }, { inspeccion_id: "i1", item_id: "it6", ruta: "i1/p7-1.jpg" }] };
const pant = new URLSearchParams(location.hash.slice(1)).get("p") ?? "insp";
createRoot(document.getElementById("r")!).render(
  pant === "hist" ? <Historial filas={D.INSP as any} areas={D.AREAS as any} puedeBorrar />
  : pant === "maestro" ? <Maestro5S meta={90} areas={D.AREAS as any} responsables={D.RESP as any} puntos={D.PUNTOS as any} puedeEditar />
  : <Inspeccionar areas={D.AREAS as any} responsables={D.RESP as any} puntos={D.PUNTOS as any} metaGeneral={90} auditor="Cristian Padilla" puedeEditar />);
`);
const r = await build({ entryPoints: [R(".arnes/_s5-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-s5.ts"), "next/link": R(".arnes/_link-s5.tsx"), "@/lib/supabase/client": R(".arnes/_supa-s5.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error" });
const js = r.outputFiles[0].text;
const css = readFileSync(R("src/app/globals.css"), "utf8") + readFileSync(R("src/app/(app)/shell.css"), "utf8") + readFileSync(R("src/app/(app)/5s/cinco-s.css"), "utf8");
const foto = "data:image/jpeg;base64," + readFileSync("/tmp/s5-foto.jpg").toString("base64");
writeFileSync(R("public/__s5.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style></head>
<body style="background:#EEF1F5"><div style="padding:18px" id="r"></div><script>window.fotoUrl=${JSON.stringify(foto)}</script><script>${js}</script></body></html>`);

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
pg.on("pageerror", (e) => fallas.push("error: " + e.message));
const abrir = async (p, ancho = 1400) => { await pg.setViewportSize({ width: ancho, height: 1000 }); await pg.goto(`http://localhost:8765/__s5.html#p=${p}`); await pg.reload(); await pg.waitForSelector(".s5 h1") };

/* ---------------- INSPECCIONAR ---------------- */
await abrir("insp");
const t = () => pg.textContent(".s5");
ok(/Genesis Visbal/.test(await t()) && /Cristian Padilla/.test(await t()), "no salen responsable y auditor solos");
ok((await pg.$$(".s5-p")).length === 16, "BODEGA 38 debe tener 15 generales + 1 propio: " + (await pg.$$(".s5-p")).length);
ok(/Calle de envase sin vidrio roto/.test(await t()), "falta el punto propio del área");
await pg.click(".s5-guardar");
ok(await pg.isVisible(".s5-m-faltas"), "guardar sin responder no dice qué falta");
ok(/16 sin responder/.test(await pg.textContent(".s5-m-faltas")), "conteo de faltas: " + await pg.textContent(".s5-m-faltas"));
ok((await pg.evaluate(() => (window.log ?? []).length)) === 0, "intentó guardar incompleto");
/* responder: todo cumple, el 7 no cumple, el 3 N/A */
const filas = pg.locator(".s5-p");
for (let i = 0; i < 16; i++) {
  const v = i === 6 ? "No cumple" : i === 2 ? "N/A" : "Cumple";
  await filas.nth(i).locator(`.s5-res button:text-is("${v}")`).click();
}
ok(/no cumple sin decir/.test(JSON.stringify(await pg.textContent(".s5-m-faltas")))|| /por completar/.test(await pg.textContent(".s5-m-faltas")), "no pide la observación del no cumple");
await filas.nth(6).locator("textarea").fill("Vidrio en la calle 4, junto a la columna 12.");
await filas.nth(6).locator('.s5-sev button:text-is("Alta")').click();
ok(/2 por completar/.test(await pg.textContent(".s5-m-faltas")), "faltan las 2 fotos exigidas: " + await pg.textContent(".s5-m-faltas"));
for (const i of [1, 4]) {
  const [fc] = await Promise.all([pg.waitForEvent("filechooser"), filas.nth(i).locator(".s5-foto-bt").click()]);
  await fc.setFiles("/tmp/s5-foto.jpg");
  await pg.waitForFunction((k) => document.querySelectorAll(".s5-p")[k].querySelectorAll(".s5-fotos figure").length === 1, i);
}
/* % en vivo: pesos 1 x15 + 2; NA el 3 → evaluable 16, falla el 7 (peso 1) → 15/16 */
ok(/93,8/.test(await pg.textContent(".s5-m-top b")), "el % en vivo: " + await pg.textContent(".s5-m-top b"));
ok(/Sobre la meta de 92/.test(await pg.textContent(".s5-m-top")), "no compara con la meta del área (92)");
await pg.screenshot({ path: "/tmp/s5-insp.png", fullPage: true });
await pg.click(".s5-guardar");
await pg.waitForSelector(".s5-hecha");
const log = await pg.evaluate(() => window.log);
const subidas = log.filter((l) => l.k === "subir"), rpc = log.find((l) => l.k === "rpc:s5_guardar");
ok(subidas.length === 2 && subidas.every((s) => s.v.ruta.startsWith(rpc.v.p.id + "/")), "fotos con la ruta de la inspección");
ok(log.findIndex((l) => l.k === "subir") < log.findIndex((l) => l.k === "rpc:s5_guardar"), "las fotos deben subir antes");
const pts = rpc.v.p.puntos;
ok(pts.length === 16 && pts[6].resultado === "no_cumple" && pts[6].severidad === "alta" && /columna 12/.test(pts[6].observacion), "punto 7 mal enviado");
ok(pts[0].observacion === null && pts[2].resultado === "na" && pts[2].fotos.length === 0, "observación/NA mal enviados");
ok(rpc.v.p.area_id === "a1", "área mal enviada");
ok(/93,8/.test(await pg.textContent(".s5-hecha")) && (await pg.$$(".s5-p.cumple")).length === 0, "después de guardar no limpia");
await pg.screenshot({ path: "/tmp/s5-hecha.png" });

/* error de la base: borra las fotos subidas */
await abrir("insp");
for (let i = 0; i < 16; i++) await filas.nth(i).locator('.s5-res button:text-is("N/A")').click();
await filas.nth(0).locator('.s5-res button:text-is("Cumple")').click();
ok(/Guardar inspección/.test(await pg.textContent(".s5-guardar")), "N/A no exige foto (o algo más falta)");
await pg.evaluate(() => { window.log = []; window.rpcFalla = "Faltan 2 puntos" });
await pg.click(".s5-guardar"); await pg.waitForTimeout(300);
ok((await pg.$$(".s5-p.na")).length === 15, "con error de la base se borraron las respuestas");
const avTxt = await pg.textContent(".av-pila").catch(() => "(sin avisos)"); ok(/Faltan 2 puntos/.test(avTxt), "no muestra el error de la base: " + avTxt + JSON.stringify(await pg.evaluate(() => window.log)));
await pg.evaluate(() => { window.rpcFalla = null });

/* celular */
await abrir("insp", 390);
await filas.nth(0).locator('.s5-res button:text-is("No cumple")').click();
await pg.screenshot({ path: "/tmp/s5-cel.png", fullPage: false });
ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "en 390 se sale de ancho");

/* ---------------- HISTORIAL ---------------- */
await abrir("hist");
ok(/87,5/.test(await t()) && /100 %/.test(await t()), "no salen los %");
ok(/1\b/.test(await pg.textContent(".s5-kpi:nth-child(3) b")), "bajo la meta debe ser 1");
await pg.click(".s5-tabla tr.fila >> nth=0");
await pg.waitForSelector(".s5-hz");
ok((await pg.$$(".s5-hz:not(.ok)")).length === 2, "faltan los 2 hallazgos");
ok(/Extintor/.test(await pg.textContent(".s5-hallazgos")) && (await pg.$$(".s5-hz img")).length === 2, "hallazgos sin texto o fotos");
const sev = await pg.$$eval(".s5-hz-sev", (e) => e.map((x) => x.textContent));
ok(sev[0] === "alta", "los hallazgos van de más a menos grave: " + sev);
await pg.screenshot({ path: "/tmp/s5-hist.png", fullPage: true });
await pg.click('button:has-text("Borrar inspección")');
await pg.click('.cf-caja button:has-text("Borrar inspección"), [role=dialog] button:has-text("Borrar inspección")');
await pg.waitForTimeout(200);
const lb = await pg.evaluate(() => window.log);
ok(lb.some((l) => l.k === "rpc:s5_borrar") && lb.some((l) => l.k === "quitar"), "borrar no llama la base o no quita las fotos");
ok((await pg.$$(".s5-tabla tr.fila")).length === 1, "la borrada sigue en la lista");
await abrir("hist", 390);
await pg.click(".s5-tabla tr.fila >> nth=0"); await pg.waitForSelector(".s5-hz");
await pg.screenshot({ path: "/tmp/s5-hist-cel.png", fullPage: true });

/* ---------------- MAESTRO ---------------- */
await abrir("maestro");
ok(/Checklist general/.test(await t()), "abre en checklist");
await pg.selectOption(".s5-card select", "a1");
ok(/Lo que se le pregunta a BODEGA 38/.test(await t()) && /Calle de envase sin vidrio roto/.test(await t()), "no muestra lo del área");
await pg.click('button:has-text("+ Nuevo punto")');
await pg.click('.s5-s-pick button:has-text("2S")');
await pg.fill(".s5-mo textarea", "Las estibas vacías van en su zona.");
await pg.click('.s5-mo button[type=submit]');
const ins = (await pg.evaluate(() => window.log)).find((l) => l.k === "insert:s5_puntos");
ok(ins && ins.v.s === "ordenar" && ins.v.area_id === "a1" && ins.v.orden === 7, "punto nuevo mal: " + JSON.stringify(ins?.v));
await pg.screenshot({ path: "/tmp/s5-maestro.png", fullPage: true });
await pg.click('.s5-tabs button:has-text("Áreas")');
await pg.click('button:has-text("+ Nueva área")');
await pg.fill('.s5-mo input >> nth=0', "patio");
await pg.fill('.s5-mo input >> nth=1', "150");
await pg.click('.s5-mo button[type=submit]');
ok(/1 a 100/.test(await pg.textContent("body")), "deja meta 150");
await pg.fill('.s5-mo input >> nth=1', "");
await pg.click('.s5-mo button[type=submit]');
const ia = (await pg.evaluate(() => window.log)).find((l) => l.k === "insert:s5_areas");
ok(ia && ia.v.nombre === "PATIO" && ia.v.meta === null, "área nueva mal: " + JSON.stringify(ia?.v));
await pg.screenshot({ path: "/tmp/s5-areas.png", fullPage: true });
await nav.close();
console.log(fallas.filter(Boolean).length ? "FALLAS:\n- " + fallas.filter(Boolean).join("\n- ") : "TODO OK");
