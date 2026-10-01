/* El inventario fiscal, lo que no es pantalla: hojas sin número fijo, parejas, repetidos y resumen. */
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const js = buildSync({ entryPoints: [R("src/modulos/inventario/fiscal.ts")], bundle: true, write: false, format: "esm" }).outputFiles[0].text;
const F = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const nums = (h) => h.map((x) => x.numero).join(",");

/* 1 · el número de hojas no está fijo: 1, 3, 8 o 25. */
for (const n of [1, 3, 8, 25]) ok(F.hojasVacias(n).length === n && F.hojasVacias(n)[n - 1].numero === n, `hojasVacias(${n})`);
ok(F.hojasVacias(0).length === 0 && F.hojasVacias(-2).length === 0, "hojasVacias no acepta negativos");
ok(F.hojasVacias(2.9).length === 2, "hojasVacias con decimales");

/* 2 · agregar toma el menor número libre; quitar no renumera. */
let h = F.hojasVacias(5);
h = F.quitarHoja(h, 3);
ok(nums(h) === "1,2,4,5", "quitar la 3 no renumera: " + nums(h));
h = F.agregarHojas(h, 1);
ok(nums(h) === "1,2,3,4,5", "agregar llena el hueco: " + nums(h));
h = F.agregarHojas(h, 3);
ok(nums(h) === "1,2,3,4,5,6,7,8", "agregar varias: " + nums(h));
h = F.quitarHoja(F.quitarHoja(h, 2), 7);
h = F.agregarHojas(h, 3);
ok(nums(h) === "1,2,3,4,5,6,7,8,9", "huecos 2 y 7 y uno más: " + nums(h));
ok(nums(F.agregarHojas([], 2)) === "1,2", "agregar a la lista vacía");
ok(F.agregarHojas(F.hojasVacias(2), 0).length === 2 && F.agregarHojas(F.hojasVacias(2), -1).length === 2, "agregar 0 o menos no cambia nada");
ok(nums(F.quitarHoja(F.hojasVacias(2), 9)) === "1,2", "quitar una que no existe");

/* 3 · poner personas. */
h = F.ponerPersona(F.hojasVacias(2), 2, "bavaria", "u7");
ok(h[1].bavaria === "u7" && h[1].ol === "" && h[0].bavaria === "", "ponerPersona toca solo su hoja y su equipo");
h = F.ponerPersona(h, 2, "bavaria", "");
ok(h[1].bavaria === "", "quitar a la persona");

/* 4 · revisar. */
let r = F.revisar([]);
ok(r.errores.length === 1 && /al menos una hoja/.test(r.errores[0]), "sin hojas no se guarda");
h = F.hojasVacias(4);
h = F.ponerPersona(F.ponerPersona(h, 1, "ol", "a"), 1, "bavaria", "b");
h = F.ponerPersona(h, 2, "ol", "c");
r = F.revisar(h);
ok(r.errores.length === 0 && r.total === 4 && r.completas === 1 && r.aMedias === 1 && r.vacias === 2, "cuentas: " + JSON.stringify([r.total, r.completas, r.aMedias, r.vacias]));
h = F.ponerPersona(h, 3, "bavaria", "a");
r = F.revisar(h);
ok(r.errores.length === 1 && /hojas 1, 3/.test(r.errores[0]) && r.repetidas.get("a").join() === "1,3", "una persona en dos hojas: " + r.errores.join("|"));
h = F.ponerPersona(F.hojasVacias(1), 1, "ol", "z"); h = F.ponerPersona(h, 1, "bavaria", "z");
r = F.revisar(h);
ok(r.errores.length === 1 && /hoja 1 tiene a la misma persona en el OL y en Bavaria/.test(r.errores[0]), "la misma persona en los dos equipos: " + r.errores.join("|"));
h = F.ponerPersona(F.ponerPersona(F.ponerPersona(F.hojasVacias(3), 1, "ol", "q"), 2, "ol", "q"), 3, "bavaria", "q");
r = F.revisar(h);
ok(r.errores.length === 1 && /hojas 1, 2, 3/.test(r.errores[0]), "tres hojas con la misma persona: " + r.errores.join("|"));
ok(F.revisar(F.hojasVacias(8)).errores.length === 0, "hojas vacías no son un error (se arman de a poco)");

/* 5 · payload. */
h = F.ponerPersona(F.ponerPersona(F.hojasVacias(3).reverse(), 2, "ol", "a"), 3, "bavaria", "b");
const p = F.aPayload(h);
ok(p.map((x) => x.numero).join() === "1,2,3", "el payload va en orden");
ok(p[1].ol === "a" && p[1].bavaria === null && p[2].ol === null && p[2].bavaria === "b" && p[0].ol === null, "«» pasa a null: " + JSON.stringify(p));

/* 6 · el resumen. */
ok(F.textoResumen({ total: 1, completas: 1, aMedias: 0, vacias: 0 }) === "1 hoja · 1 pareja completa", F.textoResumen({ total: 1, completas: 1, aMedias: 0, vacias: 0 }));
ok(F.textoResumen({ total: 5, completas: 4, aMedias: 1, vacias: 0 }) === "5 hojas · 4 parejas completas · 1 a medias", "resumen a medias");
ok(F.textoResumen({ total: 7, completas: 3, aMedias: 2, vacias: 2 }) === "7 hojas · 3 parejas completas · 2 a medias · 2 sin nadie", "resumen con vacías");
ok(F.textoResumen({ total: 2, completas: 0, aMedias: 0, vacias: 2 }) === "2 hojas · 0 parejas completas · 2 sin nadie", "resumen sin parejas");

if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Inventario fiscal, las cuentas: hojas sin número fijo (el menor número libre, sin renumerar), parejas OL/Bavaria, personas repetidas y el resumen.");
