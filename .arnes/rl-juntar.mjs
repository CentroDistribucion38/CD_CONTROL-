/* =====================================================================
   TODOS LOS INFORMES DEL PERÍODO EN UN PDF — medido en Chromium.

   «Todos los informes que se generaron en ese período juntos en un PDF,
   así como están, en el período que uno filtra.»

   Se generan tres hojas DE VERDAD con dibujarHoja (una por día, y el
   primer día con dos), más una anulada; se sirven como si fueran los PDF
   guardados; se monta Informes.tsx tal cual y se toca el botón. El PDF
   que baja se lee con pdftotext:
   1. trae las páginas de todas las hojas vigentes, ninguna de la anulada;
   2. en orden: día más viejo primero y, en el día, la que se generó antes;
   3. cada hoja entra entera, como estaba (mismas páginas);
   4. el nombre del archivo lleva el período;
   5. sin informes el botón se apaga; si un PDF no baja, se dice.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildSync, transformSync } from "esbuild";
import { jsPDF } from "jspdf";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_hoja-j.mjs"), transformSync(readFileSync(R("src/modulos/rotlinea/hoja.ts"), "utf8"), { loader: "ts", format: "esm" }).code);
const H = await import(R(".arnes/_hoja-j.mjs") + "?v=" + Date.now());
const MAQ = [{ item: 1, nombre: "DESEMPACADORA", orden: 1, suma_en: null }, { item: 2, nombre: "LAVADORA", orden: 2, suma_en: null }];
const LIN = [{ linea: 1, tren: "TREN-1", centro_coste: "C1", orden: 1 }];
const pdf = (fecha, marca, und) => {
  const hoja = H.armarHoja({ fecha, filas: [{ fecha, linea: 1, turno: 2, envase: "400733", envase_nombre: "ENVASE", maquina: 1, und, kg: und / 5 }],
    maquinas: MAQ, lineas: LIN, firmas: [] });
  return Buffer.from(H.dibujarHoja(jsPDF, hoja, { elaboro: marca, supervisor: "", observaciones: "", generado: new Date(fecha + "T15:00:00") }).output("arraybuffer"));
};
const PDFS = {
  "a.pdf": pdf("2026-09-20", "ELABORO-A", 100),
  "b.pdf": pdf("2026-09-21", "ELABORO-B", 976),
  "c.pdf": pdf("2026-09-21", "ELABORO-C", 1597),
  "x.pdf": pdf("2026-09-19", "ELABORO-ANULADA", 50),
};
const U = (f) => `https://control.prueba/pdf/${f}`;
const hj = (id, fecha, gen, extra = {}) => ({ id, fecha, ruta: id, bytes: 1, unidades: 1, kg: 1, lineas: 1, elaboro: null, supervisor: null,
  observaciones: null, generado_nombre: "Admin", generado_en: gen, anulada_en: null, url: U(id + ".pdf"), ...extra });
/* Llegan desordenadas, como las manda la base (la más nueva primero). */
const HOJAS = [hj("c", "2026-09-21", "2026-09-21T16:57:00Z"), hj("b", "2026-09-21", "2026-09-21T14:53:00Z"),
               hj("x", "2026-09-19", "2026-09-19T15:00:00Z", { anulada_en: "2026-09-20T10:00:00Z", anulada_motivo: "mal" }),
               hj("a", "2026-09-20", "2026-09-20T15:00:00Z")];

writeFileSync(R(".arnes/_nav-j.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} }); export const usePathname = () => "/";`);
writeFileSync(R(".arnes/_supa-j.ts"), `export const createClient = () => ({ rpc: async () => ({ error: null }) });`);
writeFileSync(R(".arnes/_link-j.tsx"), `export default function Link(p: any) { return <a href={p.href} className={p.className}>{p.children}</a> }`);
writeFileSync(R(".arnes/_j-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Informes } from "../src/app/(app)/quiebra/rotura/tablero/informes/Informes";
(window as any).montar = (hojas: any[]) => createRoot(document.getElementById("r")!).render(
  <Informes hojas={hojas} dias={[]} puedeAnular={false} desde="2026-09-01" hasta="2026-09-21" />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_j-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-j.ts"), "@/lib/supabase/client": R(".arnes/_supa-j.ts"), "next/link": R(".arnes/_link-j.tsx"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/quiebra/rotura/rotura.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
let fallaPdf = false;
await pg.route("**/*", (r) => {
  const u = r.request().url();
  const m = u.match(/\/pdf\/(\w\.pdf)$/);
  if (m) return fallaPdf && m[1] === "b.pdf" ? r.fulfill({ status: 400, body: "vencido" })
                                           : r.fulfill({ status: 200, contentType: "application/pdf", body: PDFS[m[1]] });
  return r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" });
});
const monta = async (hojas) => {
  await pg.goto("https://control.prueba/quiebra/rotura/tablero/informes");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="rl" id="r"></div><script>${js}</script></body></html>`);
  await pg.evaluate((h) => window.montar(h), hojas);
  await pg.waitForSelector(".rl-inf-rel button");
};

await monta(HOJAS);
const txt = await pg.textContent(".rl-inf-rel p");
ok(/3 informes del/.test(txt) && /sin las 1 anuladas/.test(txt), `no dice cuántos informes junta: «${txt}»`);
const [des] = await Promise.all([pg.waitForEvent("download", { timeout: 15000 }), pg.click(".rl-inf-rel button")]);
ok(des.suggestedFilename() === "informes-rotura-linea-2026-09-01-a-2026-09-21.pdf", `el archivo no lleva el período: ${des.suggestedFilename()}`);
const ruta = "/tmp/claude-0/rl-juntos.pdf";
await des.saveAs(ruta);
const paginas = execFileSync("pdftotext", ["-layout", ruta, "-"], { encoding: "utf8" }).split("\f").filter((p) => p.trim());
const pagsDe = (b) => { writeFileSync("/tmp/claude-0/_uno.pdf", b); return execFileSync("pdfinfo", ["/tmp/claude-0/_uno.pdf"], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)[1] * 1 };
const esperadas = pagsDe(PDFS["a.pdf"]) + pagsDe(PDFS["b.pdf"]) + pagsDe(PDFS["c.pdf"]);
ok(paginas.length === esperadas, `el PDF junto tiene ${paginas.length} páginas y las tres hojas suman ${esperadas}`);
const todo = paginas.join("\n");
ok(!/ELABORO-ANULADA/.test(todo), "se coló la hoja anulada");
const ia = todo.indexOf("ELABORO-A"), ib = todo.indexOf("ELABORO-B"), ic = todo.indexOf("ELABORO-C");
ok(ia >= 0 && ib > ia && ic > ib, `no van en orden de fecha y de hora (A ${ia}, B ${ib}, C ${ic})`);
ok(/1\.597 unidades rotas/.test(todo) && /976 unidades rotas/.test(todo), "las hojas no entraron como estaban");

/* SI UN PDF NO BAJA, SE DICE Y NO SE DESCARGA UNO A MEDIAS */
fallaPdf = true;
await monta(HOJAS);
let bajo = false; pg.once("download", () => { bajo = true });
await pg.click(".rl-inf-rel button");
await pg.waitForSelector(".rl-inf-aviso", { timeout: 10000 }).catch(() => {});
ok(!bajo && /No se pudieron juntar/.test((await pg.textContent(".rl-inf-aviso").catch(() => "")) ?? ""),
   "si un PDF no baja, igual descarga uno a medias o no avisa");
fallaPdf = false;

/* SIN INFORMES, APAGADO */
await monta([HOJAS[2]]);
ok(await pg.isDisabled(".rl-inf-rel button"), "sin informes vigentes el botón se deja tocar");
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log(`✓ Todos en un PDF: las 3 hojas vigentes enteras (${esperadas} páginas), en orden de fecha y hora, sin la anulada, con el período en el nombre.`);
