/* Las causas técnicas de cada diferencia del cruce fiscal: node .arnes/fiscal-causas.mjs */
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/inventario/causas-cruce.ts")], bundle: true, format: "esm", platform: "node", outfile: R(".arnes/tmp/causas.mjs"), logLevel: "silent" });
const { causasDeHoja, textoConteo } = await import(pathToFileURL(R(".arnes/tmp/causas.mjs")).href);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

const F = (ubicacion, sku, venc, ol, ba) => ({ ubicacion, sku, material: "Mat " + sku, vencDia: venc[0], vencMes: venc[1], vencAnio: venc[2], cajasOl: ol, cajasBavaria: ba,
  diferencia: (ol ?? 0) - (ba ?? 0), estado: ol === null ? "SOLO_BAVARIA" : ba === null ? "SOLO_OL" : ol === ba ? "COINCIDE" : "DIFIERE" });
/* un conteo: por estibas (est, saldo, factor) o por cajas */
const C = (equipo, ubicacion, sku, venc, o) => {
  const factor = o.factor === undefined ? 54 : o.factor;
  const est = o.est ?? null, sal = o.sal ?? null, caj = o.caj ?? null;
  return { equipo, persona: equipo === "OL" ? "Carlos Mejía" : "Génesis Visbal", ubicacion, sku, material: "Mat " + sku, cajasPorEstiba: caj != null ? null : factor,
    estibas: est, saldo: sal, cajas: caj, totalCajas: caj != null ? caj : (factor ?? 0) * (est ?? 0) + (sal ?? 0),
    vencDia: venc[0], vencMes: venc[1], vencAnio: venc[2], nota: null, contadoEn: null };
};
const N = [null, null, null];
const filas = [
  /* 0 */ F("C · 04 · DER", "3617", [null, 9, 2026], null, 144),                       // omisión del operador
  /* 1 */ F("A · 03 · IZQ", "3128", [15, 11, 2026], 540, null),                        // vencimiento distinto (lado OL)
  /* 2 */ F("A · 03 · IZQ", "3128", [15, 12, 2026], null, 540),                        // vencimiento distinto (lado Bavaria)
  /* 3 */ F("B · 01 · DER", "3500005", [null, 3, 2027], 300, null),                    // sitio distinto
  /* 4 */ F("B · 02 · DER", "3500005", [null, 3, 2027], null, 300),
  /* 5 */ F("A · 01 · DER", "3500887", N, 3888, 3780),                                 // estibas
  /* 6 */ F("A · 02 · DER", "3500887", N, 552, 560),                                   // saldo
  /* 7 */ F("A · 04 · DER", "3500887", N, 960, 978),                                   // estibas y saldo compensados
  /* 8 */ F("A · 05 · DER", "3500887", N, 0, 36),                                      // cero
  /* 9 */ F("A · 06 · DER", "7777", N, 0, 270),                                        // sin factor
  /* 10 */ F("A · 07 · DER", "3500887", N, 960, 972),                                  // forma de registro
  /* 11 */ F("A · 08 · DER", "5555", N, 100, 90),                                      // cajas totales
  /* 12 */ F("A · 09 · DER", "3500887", N, 100, 90),                                   // sin detalle (no hay conteos de ese sitio)
  /* 13 */ F("A · 10 · DER", "3500887", N, 50, 50),                                    // coincide
  /* 14 */ F("D · 01 · DER", "9000", N, 90, null),                                     // omisión con pista (Bavaria sí anotó 9000 en otro sitio)
  /* 15 */ F("D · 02 · DER", "9000", N, null, 45),
];
const conteos = [
  C("OL", "A · 01 · DER", "3500887", N, { est: 72, sal: 0 }), C("BAVARIA", "A · 01 · DER", "3500887", N, { est: 70, sal: 0 }),
  C("OL", "A · 02 · DER", "3500887", N, { est: 10, sal: 12 }), C("BAVARIA", "A · 02 · DER", "3500887", N, { est: 10, sal: 20 }),
  C("OL", "A · 04 · DER", "3500887", N, { est: 17, sal: 42 }), C("BAVARIA", "A · 04 · DER", "3500887", N, { est: 18, sal: 6 }),
  C("OL", "A · 05 · DER", "3500887", N, { caj: 0 }), C("BAVARIA", "A · 05 · DER", "3500887", N, { caj: 36 }),
  C("OL", "A · 06 · DER", "7777", N, { est: 5, sal: 0, factor: null }), C("BAVARIA", "A · 06 · DER", "7777", N, { caj: 270 }),
  C("OL", "A · 07 · DER", "3500887", N, { caj: 960 }), C("BAVARIA", "A · 07 · DER", "3500887", N, { est: 18, sal: 0 }),
  C("OL", "A · 08 · DER", "5555", N, { caj: 100 }), C("BAVARIA", "A · 08 · DER", "5555", N, { caj: 90 }),
];
const H = { ol: "Carlos Mejía", bavaria: "Génesis Visbal", filas, conteos };
const c = causasDeHoja(H);
const cod = (i) => c[i]?.codigo;
ok(cod(0) === "OMISION_OL" && /Génesis Visbal \(Bavaria\) anotó 144 cj de 3617 Mat 3617 en C · 04 · DER/.test(c[0].detalle) && /Carlos Mejía \(operador\) no anotó ese material/.test(c[0].detalle), "omisión del operador: " + c[0]?.detalle);
ok(cod(1) === "VENC_DISTINTO" && cod(2) === "VENC_DISTINTO" && /vencimiento 15\/11\/2026 \(540 cj\)/.test(c[1].detalle) && /vencimiento 15\/12\/2026/.test(c[1].detalle) && /Las cajas son iguales/.test(c[1].detalle), "vencimiento distinto, lado del operador: " + c[1]?.detalle);
ok(/Génesis Visbal \(Bavaria\) anotó 3128 Mat 3128 con vencimiento 15\/12\/2026/.test(c[2].detalle), "vencimiento distinto, lado de Bavaria cuenta lo suyo: " + c[2]?.detalle);
ok(cod(3) === "SITIO_DISTINTO" && cod(4) === "SITIO_DISTINTO" && /B · 02 · DER/.test(c[3].detalle) && /mismo pallet/.test(c[3].detalle), "sitio distinto: " + c[3]?.detalle);
ok(cod(5) === "ESTIBAS" && /2 estibas de diferencia = 108 cj \(a 54 cj por estiba\)/.test(c[5].detalle) && /72 estibas/.test(c[5].detalle) && /70/.test(c[5].detalle), "estibas: " + c[5]?.detalle);
ok(cod(6) === "SALDO" && /Mismas estibas \(10\)/.test(c[6].detalle) && /diferencia 8 cj/.test(c[6].detalle), "saldo: " + c[6]?.detalle);
ok(cod(7) === "ESTIBAS_Y_SALDO" && /se compensan en parte/.test(c[7].detalle) && /17 est × 54 \+ 42 saldo = 960 cj/.test(c[7].detalle) && /18 est × 54 \+ 6 saldo = 978 cj/.test(c[7].detalle), "estibas y saldo, compensados: " + c[7]?.detalle);
ok(cod(8) === "CERO" && /Carlos Mejía \(operador\) anotó el sitio A · 05 · DER vacío \(0 cj\) y Génesis Visbal \(Bavaria\) anotó 36 cj/.test(c[8].detalle), "cero: " + c[8]?.detalle);
ok(cod(9) === "SIN_FACTOR" && /no tiene «cajas por estiba»/.test(c[9].detalle) && /maestro/.test(c[9].revisar), "sin factor (aunque su total sea 0, no es «cero»): " + c[9]?.codigo);
ok(cod(10) === "FORMA_REGISTRO" && /Carlos Mejía \(operador\) anotó cajas totales y Génesis Visbal \(Bavaria\) estibas \+ saldo/.test(c[10].detalle), "forma de registro: " + c[10]?.detalle);
ok(cod(11) === "CAJAS" && /100 cj y Génesis Visbal \(Bavaria\) 90 cj/.test(c[11].detalle) && /anotó menos/.test(c[11].revisar), "cajas totales: " + c[11]?.detalle);
ok(cod(12) === "SIN_DETALLE", "sin lo que anotó cada persona: " + cod(12));
ok(c[13] === null, "lo que coincide no tiene causa");
ok(cod(14) === "OMISION_BAVARIA" && /Génesis Visbal \(Bavaria\)/.test(c[14].detalle) && cod(15) === "OMISION_OL", "omisión de Bavaria y del operador");
ok(/Génesis Visbal \(Bavaria\) sí anotó 9000 en: D · 02 · DER/.test(c[14].detalle) || /sí anotó 9000/.test(c[14].detalle), "la omisión dice dónde sí anotó el otro: " + c[14]?.detalle);
/* sin conteos de nadie: lo que difiere queda «sin detalle», lo de «solo uno» sigue con su causa */
const c2 = causasDeHoja({ ...H, conteos: null });
ok(c2[5].codigo === "SIN_DETALLE" && c2[0].codigo === "OMISION_OL" && c2[1].codigo === "VENC_DISTINTO", "sin los conteos de las personas el cruce igual explica las omisiones");
/* sin nombres */
const c3 = causasDeHoja({ ol: null, bavaria: null, filas: [filas[0]], conteos: null });
ok(/Bavaria anotó 144 cj/.test(c3[0].detalle) && /el operador no anotó/.test(c3[0].detalle), "sin nombres usa «el operador» y «Bavaria»");
ok(textoConteo(C("OL", "x", "1", N, { est: 3, sal: 2 })) === "3 est × 54 + 2 saldo = 164 cj" && textoConteo(C("OL", "x", "1", N, { caj: 7 })) === "7 cj (anotó cajas totales)", "texto de un conteo");
/* una hoja sin diferencias */
ok(causasDeHoja({ ol: "A", bavaria: "B", filas: [filas[13]], conteos: [] }).every((x) => x === null), "hoja sin diferencias");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Causas del cruce fiscal: omisión (de quién), vencimiento distinto, sitio distinto, cero, sin cajas por estiba, forma de registro, estibas / saldo / ambos, cajas totales y sin detalle, con nombres y cifras.");
