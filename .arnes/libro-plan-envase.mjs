/* El Excel del plan de envase con el logo de Bavaria en cada hoja. node .arnes/libro-plan-envase.mjs */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const require = createRequire(import.meta.url);
mkdirSync(R(".arnes/tmp"), { recursive: true });
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const sal = buildSync({ entryPoints: [R(".arnes/_libro-pe-entrada.ts")], bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent", alias: { "@": R("src") } }).outputFiles[0].text;
writeFileSync(R(".arnes/tmp/_libro-pe.cjs"), sal);
const L = require(R(".arnes/tmp/_libro-pe.cjs"));
const XLSX = require("xlsx"), ExcelJS = require("exceljs");
const fac = new Map();
for (const ln of readFileSync(R("supabase/datos/inventario-maestro-cd38.sql"), "utf8").split("\n")) {
  const m = /^\s*\('([^']+)', '([^']*)', '[^']*', (\d+|null), (\d+|null)/.exec(ln);
  if (m) fac.set(m[1], { nombre: m[2], cajas_por_estiba: m[4] === "null" ? null : Number(m[4]) });
}
const s = L.leerPlanEnvase(XLSX.readFile(R(".arnes/datos/instructivo-envase-2026-08-21.xlsx"))).find((x) => x.semana === 34);
const otras = ["cajas", "unidades", "hl"].map((m) => ({ nombre: m + " por día", unidad: m, vista: L.vistaSemana(s, fac, m) }));
const logo = readFileSync(R("public/marca/logo-bavaria.png"));
const buf = await L.armarPlanEnvase({ semana: s, vista: L.vistaSemana(s, fac), borrador: false, archivo: "Instructivo.xlsx", logo, otras });
writeFileSync(R(".arnes/tmp/_plan-con-logo.xlsx"), Buffer.from(buf));
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
for (const w of wb.worksheets) ok(w.getImages().length === 1, `la hoja «${w.name}» no trae el logo (${w.getImages().length})`);
ok(wb.worksheets.length === 7, "hojas: " + wb.worksheets.length);
const sin = await L.armarPlanEnvase({ semana: s, vista: L.vistaSemana(s, fac), borrador: false, archivo: null });
const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(sin);
ok(w2.worksheets.every((w) => w.getImages().length === 0), "sin logo no debe haber imágenes");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ El Excel del plan trae el logo de Bavaria en las 7 hojas (y se arma igual si el logo no carga).");
