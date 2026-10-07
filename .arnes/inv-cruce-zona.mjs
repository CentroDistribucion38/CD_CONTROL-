/* La base cruza por UBICACIÓN Y ZONA: volver a contar «C02_DER» con producto no borra lo contado en «C02_DER RETORNO». */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const js = buildSync({ entryPoints: [R("src/modulos/inventario/base-cruce.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_cruce-zona.mjs"), js);
const { cruzar } = await import(R(".arnes/_cruce-zona.mjs") + "?" + Date.now());
let n = 0;
const L = (c, ubi, codigo, cajas, zona = null) => ({ id: "l" + ++n, conteo_id: c, conteo: c, ubicacion_id: "u-" + ubi, ubicacion: ubi, codigo, total_cajas: cajas, cajas, estado_envase: zona });
const C = (id, enviado) => ({ id, codigo: id, estado: "cerrado", fecha_analisis: "2026-10-07", enviado_en: enviado });
const conteos = [C("F05", "2026-10-07T12:46:00Z"), C("F01", "2026-10-07T14:24:00Z"), C("F08", "2026-10-07T16:40:00Z")];
const lineas = [
  L("F05", "C01_DER", "3500159", 48, "RETORNO"),   // lo reemplaza el F01 (misma ubicación y zona)
  L("F01", "C01_DER", "3500162", 3600, "RETORNO"),
  L("F05", "C02_DER", "3500159", 60, "RETORNO"),   // NO lo reemplaza el F08 (otra zona: producto, sin zona)
  L("F08", "C02_DER", "2912", 3600, null),
  L("F05", "D02_DER", "3500159", 10, "BAJA"),      // nadie más pasó
  L("F05", "E01_DER", "9909", 100, null),          // producto sin zona: el F08 lo reemplaza entero
  L("F08", "E01_DER", "9910", 50, null),
];
const v = cruzar(lineas, conteos).vigentes;
const sueltas = v.filter((l) => l.codigo === "3500159").reduce((s, l) => s + l.total_cajas, 0);
ok(sueltas === 70, `3500159 debe sumar 70 (60 + 10), sumó ${sueltas}`);
ok(!v.some((l) => l.ubicacion === "C01_DER" && l.codigo === "3500159"), "C01_DER RETORNO: el recorrido posterior debía reemplazar las 48");
ok(v.some((l) => l.ubicacion === "C02_DER" && l.codigo === "3500159"), "C02_DER RETORNO: las 60 se perdieron por contar C02_DER sin zona");
ok(v.some((l) => l.codigo === "2912") && v.some((l) => l.codigo === "9910") && !v.some((l) => l.codigo === "9909"), "sin zona, la ubicación se sigue reemplazando entera");
ok(v.length === 5, `vigentes: ${v.length} (5)`);
if (fallas.length) { console.error("✗ " + fallas.join("\n✗ ")); process.exit(1) }
console.log("✓ La base cruza por ubicación y zona: las 60 sueltas de C02_DER RETORNO sobreviven, las 48 de C01_DER RETORNO se reemplazan, sin zona sigue igual.");
