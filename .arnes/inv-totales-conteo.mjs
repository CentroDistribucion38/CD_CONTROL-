/* La ficha de totales del borrador: estibas, cajas y unidades, y a quién no se le pudo calcular. */
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const js = buildSync({ entryPoints: [R("src/modulos/inventario/totales-conteo.ts")], bundle: true, write: false, format: "esm" }).outputFiles[0].text;
const { totalesDelConteo } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const cerca = (a, b) => Math.abs(a - b) < 1e-9;

const mats = [
  { sku: "3128", unidades_por_caja: 30, cajas_por_estiba: 36 },
  { sku: "3500887", unidades_por_caja: 12, cajas_por_estiba: 60 },
  { sku: "9999", unidades_por_caja: null, cajas_por_estiba: null },
];
const P = (codigo, total_cajas, factor_estibado = null, tipo_material = "PRODUCTO") => ({ codigo, total_cajas, factor_estibado, tipo_material });

/* 1 · lo básico: 3 estibas de producto (108 cajas) y 2 de envase (120 cajas). */
let f = totalesDelConteo([P("3128", 108, 36), P("3500887", 120, 60, "ENVASE")], mats);
ok(f.general.cajas === 228 && cerca(f.general.estibas, 5) && f.general.unidades === 108 * 30 + 120 * 12, "general: " + JSON.stringify(f.general));
ok(f.producto.cajas === 108 && cerca(f.producto.estibas, 3) && f.producto.unidades === 3240, "producto: " + JSON.stringify(f.producto));
ok(f.envase.cajas === 120 && cerca(f.envase.estibas, 2) && f.envase.unidades === 1440, "envase: " + JSON.stringify(f.envase));
ok(f.general.renglones === 2 && f.producto.renglones === 1 && f.envase.renglones === 1, "renglones por tipo");

/* 2 · estibas con decimales y cajas que llegan como texto (la base manda numeric como string). */
f = totalesDelConteo([P("3128", "50", 36)], mats);
ok(cerca(f.general.estibas, 50 / 36) && f.general.cajas === 50, "texto y decimales: " + JSON.stringify(f.general));

/* 3 · el factor del renglón manda sobre el del material; si no trae, se usa el del material. */
f = totalesDelConteo([P("3128", 120, 40)], mats);
ok(cerca(f.general.estibas, 3), "manda el factor del renglón");
f = totalesDelConteo([P("3128", 72, null)], mats);
ok(cerca(f.general.estibas, 2) && f.general.sinFactor === 0, "sin factor en el renglón: el del material");

/* 4 · lo que no se puede calcular no suma y se cuenta aparte, pero las cajas sí cuentan. */
f = totalesDelConteo([P("9999", 100, null), P("0000", 10, 0)], mats);
ok(f.general.cajas === 110 && f.general.estibas === 0 && f.general.unidades === 0, "sin datos no inventa: " + JSON.stringify(f.general));
ok(f.general.sinFactor === 2 && f.general.sinUnidades === 2, "cuenta lo que no pudo calcular: " + JSON.stringify(f.general));
f = totalesDelConteo([P("3128", 36, 0)], mats);
ok(f.general.sinFactor === 1 && f.general.estibas === 0 && f.general.unidades === 1080, "factor 0 no divide: " + JSON.stringify(f.general));

f = totalesDelConteo([P("0", 36, 36)], [{ sku: "0", unidades_por_caja: 0, cajas_por_estiba: 36 }]);
ok(f.general.sinUnidades === 1 && f.general.unidades === 0, "unidades por caja 0 no es un dato: " + JSON.stringify(f.general));

/* 5 · vacío. */
f = totalesDelConteo([], mats);
ok(f.general.renglones === 0 && f.general.cajas === 0 && f.general.estibas === 0, "vacío");

if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Totales del conteo: cajas, estibas (con decimales) y unidades, por producto y envase, y lo que no se puede calcular se cuenta aparte sin inventarlo.");
