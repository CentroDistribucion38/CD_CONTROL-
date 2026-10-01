/* La cola sin señal de Contar (lógica pura): node .arnes/inv-cola.mjs */
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/inventario/cola.ts")], bundle: true, format: "esm", outfile: R(".arnes/tmp/cola.mjs"), logLevel: "silent" });
const { esFalloDeRed, esDuplicado, leerCola, guardarCola, vaciarCola, yaEstaEnLaBase, entero } = await import(pathToFileURL(R(".arnes/tmp/cola.mjs")).href);
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const it = (n) => ({ id: "i" + n, t: n, bb: { n }, sku: "S" + n, lugar: "A0" + n, ubicacionId: null });
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m } };

/* 1 · QUÉ ES RED Y QUÉ NO */
for (const s of ["TypeError: Failed to fetch", "fetch failed", "NetworkError when attempting to fetch resource.", "Load failed", "Network request failed", "timeout"])
  ok(esFalloDeRed(s), "debía ser de red: " + s);
for (const s of ["duplicate key value violates unique constraint \"conteo_lineas_unico\"", "Falta decir si rota", "new row violates row-level security policy"])
  ok(!esFalloDeRed(s), "NO es de red: " + s);
ok(esDuplicado('duplicate key value violates unique constraint "conteo_lineas_unico"') && !esDuplicado("Failed to fetch"), "duplicado");

/* 2 · TODO ENVÍA, EN ORDEN */
{
  const orden = [];
  const r = await vaciarCola([it(1), it(2), it(3)], async (x) => { orden.push(x.id); return { ok: true } });
  ok(orden.join() === "i1,i2,i3" && r.enviados.length === 3 && r.quedan.length === 0, "no mandó todo en orden: " + orden);
}
/* 3 · SE CAE LA SEÑAL A LA MITAD: lo que falta queda intacto y en su sitio */
{
  let n = 0;
  const r = await vaciarCola([it(1), it(2), it(3), it(4)], async () => (++n <= 1 ? { ok: true } : { red: true }));
  ok(r.enviados.map((x) => x.id).join() === "i1" && r.quedan.map((x) => x.id).join() === "i2,i3,i4", "corte de señal: " + r.quedan.map((x) => x.id));
  ok(n === 2, "siguió intentando con la señal caída (" + n + " llamadas)");
  ok(r.quedan.every((x) => x.error === undefined), "marcó con error lo que solo esperaba señal");
}
/* 4 · UN RENGLÓN MALO NO ENCIERRA A LOS BUENOS, y queda con su error */
{
  const r = await vaciarCola([it(1), it(2), it(3)], async (x) => x.id === "i2" ? { error: "Falta decir si rota" } : { ok: true });
  ok(r.enviados.map((x) => x.id).join() === "i1,i3" && r.quedan.length === 1 && r.quedan[0].id === "i2", "el malo no se quedó solo");
  ok(r.quedan[0].error === "Falta decir si rota" && r.quedan[0].duplicado === false, "no guardó su error");
}
/* 5 · DUPLICADO: queda marcado para compararlo, no se descarta */
{
  const r = await vaciarCola([it(1)], async () => ({ error: 'duplicate key value violates unique constraint "conteo_lineas_unico"' }));
  ok(r.quedan.length === 1 && r.quedan[0].duplicado === true && r.enviados.length === 0, "el duplicado no quedó marcado");
}
/* 6 · UNA EXCEPCIÓN DE RED AL MANDAR se trata como señal caída */
{
  const r = await vaciarCola([it(1), it(2)], async () => { throw new Error("Failed to fetch") });
  ok(r.quedan.length === 2 && r.enviados.length === 0, "una excepción perdió renglones");
}
/* 7 · ALMACÉN: ida y vuelta, vacío borra la llave, basura no rompe */
{
  const a = mem();
  guardarCola("k", [it(1), it(2)], a);
  ok(leerCola("k", a).map((x) => x.id).join() === "i1,i2", "no leyó lo guardado");
  guardarCola("k", [], a);
  ok(!a.m.has("k"), "no borró la llave de una cola vacía");
  a.setItem("k", "{no es json"); ok(leerCola("k", a).length === 0, "JSON roto debía dar cola vacía");
  a.setItem("k", JSON.stringify([{ id: 5 }, null, it(9)])); ok(leerCola("k", a).map((x) => x.id).join() === "i9", "no filtró lo que no es un renglón");
  ok(leerCola(null, a).length === 0, "sin llave");
  ok(leerCola("k", { getItem() { throw new Error("privado") } }).length === 0, "sin almacenamiento debía dar vacío");
}
/* 7 · ¿LO QUE LA BASE YA TIENE ES ESTE RENGLÓN? El estado del envase cuenta:
       NUEVO, LAVADO y EXTRASUCIO del mismo material en el mismo módulo son tres renglones. */
{
  const pend = (estado, cajas) => ({ id: "p", t: 1, sku: "900", lugar: "A01_DER", ubicacionId: null, bb: { modo: "cajas", estibas: "", saldo: "", cajas, estado } });
  const base = (estado, cajas) => ({ codigo: "900", ubicacion: "A01_DER", estado_envase: estado, estibas: null, saldo: null, cajas });
  ok(yaEstaEnLaBase(base("NUEVO", 50), pend("NUEVO", "50")), "el mismo renglón (con estado) no se reconoció");
  ok(!yaEstaEnLaBase(base("LAVADO", 50), pend("NUEVO", "50")), "un renglón LAVADO con la misma cantidad dio por enviado a uno NUEVO");
  ok(!yaEstaEnLaBase(base("NUEVO", 50), pend("", "50")), "un renglón con estado dio por enviado a uno sin estado");
  ok(!yaEstaEnLaBase(base(null, 50), pend("NUEVO", "50")), "un renglón sin estado dio por enviado a uno con estado");
  ok(yaEstaEnLaBase(base(null, 50), pend("", "50")), "sin estado en ambos debía ser el mismo");
  ok(!yaEstaEnLaBase(base("NUEVO", 51), pend("NUEVO", "50")), "otra cantidad no debía ser el mismo");
  ok(!yaEstaEnLaBase({ ...base("NUEVO", 50), ubicacion: "A02_DER" }, pend("NUEVO", "50")), "otro módulo no debía ser el mismo");
  ok(!yaEstaEnLaBase({ ...base("NUEVO", 50), codigo: "901" }, pend("NUEVO", "50")), "otro material no debía ser el mismo");
  const e = { ...pend("NUEVO", ""), bb: { modo: "estibas", estibas: "2", saldo: "5", cajas: "", estado: "NUEVO" } };
  ok(yaEstaEnLaBase({ codigo: "900", ubicacion: "A01_DER", estado_envase: "NUEVO", estibas: 2, saldo: 5, cajas: null }, e), "estibas+saldo iguales no se reconocieron");
  ok(!yaEstaEnLaBase({ codigo: "900", ubicacion: "A01_DER", estado_envase: "NUEVO", estibas: 2, saldo: null, cajas: null }, e), "otro saldo debía ser otro renglón");
  ok(entero(" 1.200 ") === 1200 && entero("") === null && entero("0") === null, "entero");
}
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Cola sin señal: manda de a uno y en orden, se corta si se cae la señal sin perder lo que falta, un renglón malo no encierra a los buenos, y nada se descarta en silencio.");
