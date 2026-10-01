/* =====================================================================
   LA BASE · EL CRUCE (base-cruce.ts) — la regla, sin pantalla.
   De cada ubicación VALE EL ÚLTIMO recorrido que pasó por ella; la ubicación se reemplaza ENTERA.
   Es la misma regla que el tablero (medirRiesgo) y el Excel consolidado: tres sitios que dicen cosas
   distintas del mismo inventario son peor que ninguno.
   ===================================================================== */
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const out = buildSync({ entryPoints: [R("src/modulos/inventario/base-cruce.ts")], bundle: true, write: false, format: "esm", logLevel: "silent" }).outputFiles[0].text;
const { cruzar, sufijoRecorrido } = await import("data:text/javascript;base64," + Buffer.from(out).toString("base64"));
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const C = (id, codigo, enviado, fecha = "2026-10-01") => ({ id, codigo, estado: "cerrado", fecha_analisis: fecha, enviado_en: enviado, responsable: "x", envio_nombre: "x", renglones: 0, ubicaciones: 0, total_cajas: 0, bodega: "CD38" });
let n = 0;
const L = (conteo, codigoConteo, ubic, codigo, cajas, ubicId = "u-" + ubic) => ({ id: "l" + ++n, conteo_id: conteo, conteo: codigoConteo, codigo, ubicacion: ubic, ubicacion_id: ubicId, total_cajas: cajas });
const c1 = C("c1", "FEFO-20261001-01", "2026-10-01T14:00:00Z"), c2 = C("c2", "FEFO-20261001-02", "2026-10-01T15:00:00Z"), c3 = C("c3", "FEFO-20261001-03", "2026-10-01T16:00:00Z");
const ids = (r) => r.vigentes.map((v) => v.id).sort().join(",");

/* 1 · vacío y sin repetidas */
let r = cruzar([], []);
ok(r.vigentes.length === 0 && r.repetidas === 0 && r.reemplazados.length === 0, "vacío");
const a = L("c1", c1.codigo, "A01", "100", 10), b = L("c1", c1.codigo, "A02", "100", 20);
r = cruzar([a, b], [c1]);
ok(r.vigentes.length === 2 && r.repetidas === 0 && r.vigentes.every((v) => v.reemplaza === null && v.antes === null), "un solo recorrido: todo vale, nada reemplaza");

/* 2 · gana el más reciente, sin importar el orden de llegada */
const v1 = L("c1", c1.codigo, "A01", "100", 216), v3 = L("c3", c3.codigo, "A01", "100", 270);
for (const orden of [[v1, v3], [v3, v1]]) {
  r = cruzar(orden, [c1, c3]);
  ok(r.vigentes.length === 1 && r.vigentes[0].id === v3.id && r.reemplazados.length === 1 && r.reemplazados[0].id === v1.id, "vale -03, no el que llegó primero");
  ok(r.repetidas === 1, "una ubicación repetida");
  ok(r.vigentes[0].reemplaza?.conteoId === "c1" && r.vigentes[0].reemplaza.conteo === c1.codigo && r.vigentes[0].reemplaza.cuando === c1.enviado_en, "dice a quién reemplazó y cuándo se envió ese");
  ok(r.vigentes[0].antes === 216, "«antes 216»: " + r.vigentes[0].antes);
  ok(r.actualiza.get("c3")?.ubicaciones === 1 && r.actualiza.get("c3").de.join() === c1.codigo && !r.actualiza.has("c1"), "actualiza: c3 actualiza 1 ubicación de -01");
}

/* 3 · mismo total → no hay «antes» (no cambió nada que mostrar) */
r = cruzar([L("c1", c1.codigo, "A01", "100", 270), L("c3", c3.codigo, "A01", "100", 270)], [c1, c3]);
ok(r.vigentes[0].antes === null && r.vigentes[0].reemplaza !== null, "mismo total: sin «antes», pero sí reemplaza");

/* 4 · la ubicación se reemplaza ENTERA: lo que solo estaba en el viejo deja de valer */
const viejoOtro = L("c1", c1.codigo, "A01", "999", 50);
r = cruzar([viejoOtro, L("c1", c1.codigo, "A01", "100", 216), L("c3", c3.codigo, "A01", "100", 270)], [c1, c3]);
ok(r.vigentes.length === 1 && r.vigentes[0].codigo === "100" && r.reemplazados.length === 2 && r.repetidas === 1, "el material 999 que solo estaba en -01 deja de valer");

/* 5 · «antes» suma los renglones del mismo material del recorrido reemplazado; sin ese material, null */
r = cruzar([L("c1", c1.codigo, "A01", "100", 100), L("c1", c1.codigo, "A01", "100", 16), L("c3", c3.codigo, "A01", "100", 270), L("c3", c3.codigo, "A01", "200", 40)], [c1, c3]);
const v100 = r.vigentes.find((v) => v.codigo === "100"), v200 = r.vigentes.find((v) => v.codigo === "200");
ok(v100.antes === 116 && v200.antes === null, `antes suma (116) y un material nuevo no tiene: ${v100.antes}, ${v200.antes}`);

/* 6 · cadena de tres: vale el último; «reemplazó a» es el inmediato anterior; actualiza lista los dos */
r = cruzar([L("c1", c1.codigo, "A01", "100", 1), L("c2", c2.codigo, "A01", "100", 2), L("c3", c3.codigo, "A01", "100", 3)], [c1, c2, c3]);
ok(r.vigentes.length === 1 && r.vigentes[0].conteo_id === "c3" && r.vigentes[0].reemplaza.conteoId === "c2" && r.vigentes[0].antes === 2, "cadena: vale -03, reemplazó a -02");
ok(r.repetidas === 1 && r.reemplazados.length === 2 && r.actualiza.get("c3").de.length === 2 && r.actualiza.get("c3").ubicaciones === 1, "cadena: una ubicación repetida, dos recorridos debajo");

/* 7 · cada ubicación por su cuenta */
r = cruzar([L("c1", c1.codigo, "A01", "100", 1), L("c1", c1.codigo, "A02", "100", 1), L("c2", c2.codigo, "A02", "100", 5), L("c3", c3.codigo, "A03", "100", 7)], [c1, c2, c3]);
const por = Object.fromEntries(r.vigentes.map((v) => [v.ubicacion, v.conteo_id]));
ok(por.A01 === "c1" && por.A02 === "c2" && por.A03 === "c3" && r.repetidas === 1, "cada ubicación vale su último: " + JSON.stringify(por));
ok(r.actualiza.get("c2").ubicaciones === 1 && !r.actualiza.has("c1") && !r.actualiza.has("c3"), "solo c2 actualiza");

/* 8 · sin ubicacion_id se agrupa por el nombre; sin ninguno, todos al mismo «—» (no se pierde nada) */
r = cruzar([L("c1", c1.codigo, "A01", "100", 1, null), L("c3", c3.codigo, "A01", "100", 2, null)], [c1, c3]);
ok(r.vigentes.length === 1 && r.vigentes[0].conteo_id === "c3", "sin id, por el nombre de la ubicación");

/* 9 · «último» = cuándo se ENVIÓ; sin envío, la fecha del recorrido; empate → el código mayor */
const cA = C("cA", "FEFO-20261001-09", "2026-10-01T10:00:00Z", "2026-10-01"), cB = C("cB", "FEFO-20260930-01", "2026-10-02T10:00:00Z", "2026-09-30");
r = cruzar([L("cA", cA.codigo, "A01", "100", 1), L("cB", cB.codigo, "A01", "100", 2)], [cA, cB]);
ok(r.vigentes[0].conteo_id === "cB", "vale el que se ENVIÓ último aunque su fecha de recorrido sea más vieja");
const sinEnvio1 = { ...C("s1", "FEFO-20260930-01", null, "2026-09-30") }, sinEnvio2 = { ...C("s2", "FEFO-20261001-01", null, "2026-10-01") };
r = cruzar([L("s1", sinEnvio1.codigo, "A01", "100", 1), L("s2", sinEnvio2.codigo, "A01", "100", 2)], [sinEnvio1, sinEnvio2]);
ok(r.vigentes[0].conteo_id === "s2", "sin envío, vale la fecha del recorrido");
const e1 = C("e1", "FEFO-20261001-9", "2026-10-01T10:00:00Z"), e2 = C("e2", "FEFO-20261001-10", "2026-10-01T10:00:00Z");
for (const orden of [[L("e1", e1.codigo, "A01", "100", 1), L("e2", e2.codigo, "A01", "100", 2)], [L("e2", e2.codigo, "A01", "100", 2), L("e1", e1.codigo, "A01", "100", 1)]]) {
  r = cruzar(orden, [e1, e2]);
  ok(r.vigentes[0].conteo_id === "e2", "empate: el código más alto (-10 > -9: comparación NUMÉRICA, no por letras), igual con cualquier orden de llegada");
}

/* 10 · no muta lo que recibe */
const entrada = [L("c1", c1.codigo, "A01", "100", 216), L("c3", c3.codigo, "A01", "100", 270)];
const copia = JSON.stringify(entrada);
cruzar(entrada, [c1, c3]);
ok(JSON.stringify(entrada) === copia, "no debe mutar los renglones que recibe");

/* 11 · el sufijo */
ok(sufijoRecorrido("FEFO-20261001-03") === "-03" && sufijoRecorrido("FEFO-2026-09-18-A") === "FEFO-2026-09-18-A" && sufijoRecorrido("-12") === "-12", "sufijo: " + sufijoRecorrido("FEFO-2026-09-18-A"));

if (fallas.length) { console.log("✗ " + fallas.length + " falla(s):\n - " + fallas.join("\n - ")); process.exit(1) }
console.log("✓ El cruce: gana el último enviado, la ubicación se reemplaza entera, «reemplazó a», «antes N», repetidas y empates.");
