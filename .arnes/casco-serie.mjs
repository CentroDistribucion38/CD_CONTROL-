/* LAS CUENTAS DEL TABLERO DE CASCO contra tu hoja PARTIR: la dinámica fecha × ubicación, el filtro de SKU y el eje. */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
writeFileSync(R(".arnes/_serie.mjs"), buildSync({ entryPoints: [R("src/modulos/casco/serie.ts")], bundle: true, write: false, format: "esm", logLevel: "silent" }).outputFiles[0].text);
const S = await import(R(".arnes/_serie.mjs"));
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const cerca = (a, b, m) => ok(Math.abs(a - b) < 0.01, `${m}: ${a} ≠ ${b}`);

/* Los valores de la dinámica de tu hoja PARTIR (1-sep y 8-oct) como renglones por SKU. */
const P = (fecha, ubicacion, sku, hl, inv = null) => ({ fecha, ubicacion, sku, hl, inventario: inv, baja: null });
const puntos = [
  P("2026-09-01", "BODEGA 38", "A", 1000.716, 10), P("2026-09-01", "BODEGA 38", "B", 660, 5), P("2026-09-01", "FABRICA", "A", 2100.015, 20), P("2026-09-01", "CARNAVAL", "A", 2451.078, 30),
  P("2026-10-08", "BODEGA 38", "A", 922.203, 8), P("2026-10-08", "FABRICA", "A", 1842.444, 15), P("2026-10-08", "CARNAVAL", "B", 1120.095, 12), P("2026-10-08", "CARNAVAL PALMAR", "A", 26.73, 6),
];
const todo = S.porFecha(S.filtrar(puntos, {}));
ok(todo.length === 2 && todo[0].fecha === "2026-09-01", "orden de fechas");
cerca(todo[0].porSitio["BODEGA 38"], 1660.716, "Bodega 38 el 1-sep"); cerca(todo[0].total, 6211.809, "total 1-sep (tu 6212)");
cerca(todo[1].total, 3911.472, "total 8-oct con Palmar");
/* Filtro de SKU y de sitio. */
const soloA = S.porFecha(S.filtrar(puntos, { sku: "A" })); cerca(soloA[0].total, 5551.809, "solo SKU A el 1-sep");
const sinPalmar = S.porFecha(S.filtrar(puntos, { sitios: ["BODEGA 38", "FABRICA", "CARNAVAL"] })); cerca(sinPalmar[1].total, 3884.742, "8-oct sin Palmar (el total de tu hoja)");
ok(S.filtrar(puntos, { desde: "2026-10-01" }).length === 4, "filtro de fechas");
ok(S.filtrar(puntos, { sitios: [] }).length === puntos.length, "sitios vacío = todos");
/* Por material y estibas / viajes. */
const pm = S.porMaterial(puntos, "2026-10-08"); ok(pm[0].sku === "A" && pm[1].sku === "B" && pm.length === 2, "por material ordenado por HL");
cerca(S.estibasDelDia(puntos, "2026-10-08"), 41, "estibas del 8-oct"); cerca(S.viajesSerpro(1000), 10, "viajes SERPRO = estibas/100");
/* El eje. */
const e = S.ejeNice(6212); ok(e.tope >= 6212 && e.ticks[0] === 0 && e.ticks.length <= 8, "eje cubre el máximo: " + JSON.stringify(e));
const e2 = S.ejeNice(0); ok(e2.tope > 0, "eje con cero");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Tablero de casco: la dinámica fecha × sitio suma lo mismo que tu hoja, filtra por SKU, sitio y fechas, y el eje cubre el máximo.");
