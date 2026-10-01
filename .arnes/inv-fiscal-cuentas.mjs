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

/* 7 · escoger a la persona: por rol. */
const roles = [{ clave: "admin", nombre: "Administrador" }, { clave: "operador", nombre: "Operador" }, { clave: "ol", nombre: "Operador logístico" },
               { clave: "bav", nombre: "Bavaria" }, { clave: "abi", nombre: "ABI" }, { clave: "facturacion", nombre: "Facturación" }];
ok(F.rolPorDefecto(roles, "ol") === "ol", "rol por defecto del OL: " + F.rolPorDefecto(roles, "ol"));
ok(F.rolPorDefecto(roles, "bavaria") === "bav", "rol por defecto de Bavaria: " + F.rolPorDefecto(roles, "bavaria"));
ok(F.rolPorDefecto([{ clave: "abi", nombre: "ABI" }, { clave: "operador", nombre: "Operador" }], "bavaria") === "abi", "ABI sirve para Bavaria");
ok(F.rolPorDefecto([{ clave: "abi", nombre: "ABI" }, { clave: "operador", nombre: "Operador" }], "ol") === "", "«Operador» a secas no es el rol del operador logístico");
ok(F.rolPorDefecto([{ clave: "x", nombre: "Operación Logística" }], "ol") === "x", "«Logística» sin tilde ni mayúscula");
ok(F.rolPorDefecto([{ clave: "admin", nombre: "Administrador" }], "ol") === "" && F.rolPorDefecto([], "bavaria") === "", "sin rol que se parezca: vacío (todos)");
ok(F.rolPorDefecto([{ clave: "abierto", nombre: "Abierto" }, { clave: "protocolo", nombre: "Protocolo" }], "bavaria") === "" && F.rolPorDefecto([{ clave: "cobol", nombre: "Cobol" }], "ol") === "", "«abi» y «ol» solo como palabra entera");
const gente = [
  { id: "u1", nombre: "Zoila", activo: true, rol: "ol" }, { id: "u2", nombre: "Álvaro", activo: true, rol: "ol" }, { id: "u3", nombre: "Beto", activo: true, rol: "bav" },
  { id: "u4", nombre: "Carlos", activo: false, rol: "ol" }, { id: "u5", nombre: "Dora", activo: true, rol: "admin" }, { id: "u6", nombre: "Eva", activo: true, rol: "ol" }];
const cr = F.conteoPorRol(gente, roles);
ok(cr.map((r) => `${r.clave}:${r.n}`).join() === "admin:1,bav:1,ol:3", "conteo por rol (sin desactivados ni roles vacíos): " + cr.map((r) => `${r.clave}:${r.n}`).join());
let op = F.opcionesPersonas({ personas: gente, roles, rol: "ol", ocupadas: new Set(), actual: "" });
ok(op[0].valor === "" && op.slice(1).map((x) => x.texto).join() === "Álvaro,Eva,Zoila", "solo el rol, sin desactivados, por nombre y con tildes: " + op.map((x) => x.texto).join());
ok(op[1].pista === "Operador logístico", "la pista es el nombre del rol");
op = F.opcionesPersonas({ personas: gente, roles, rol: "ol", ocupadas: new Set(["u2"]), actual: "" });
ok(!op.some((x) => x.valor === "u2"), "quien ya está en otra hoja no sale");
op = F.opcionesPersonas({ personas: gente, roles, rol: "ol", ocupadas: new Set(["u2"]), actual: "u2" });
ok(op.some((x) => x.valor === "u2"), "la persona de esta casilla se queda aunque esté en «ocupadas»");
op = F.opcionesPersonas({ personas: gente, roles, rol: "bav", ocupadas: new Set(), actual: "u4" });
ok(op.map((x) => x.valor).join() === ",u3,u4" && op[2].pista === "Operador logístico · desactivado", "la actual se queda aunque sea de otro rol y esté desactivada: " + JSON.stringify(op));
op = F.opcionesPersonas({ personas: gente, roles, rol: "", ocupadas: new Set(), actual: "" });
ok(op.length === 1 + 5, "sin filtro de rol salen todos los activos: " + op.length);

ok(F.completarRoles(gente, []).map((r) => r.clave).join() === "ol,bav,admin" && F.completarRoles(gente, roles).length === roles.length, "completarRoles: sin lista de roles salen los de las personas; con lista no agrega nada");
ok(F.completarRoles([{ id: "x", nombre: "X", activo: true, rol: "" }], []).length === 0, "una persona sin rol no inventa un rol vacío");

/* 8 · planificar: fechas. */
ok(F.diaSemana("2026-10-02") === "viernes" && F.diaSemana("2026-10-04") === "domingo" && F.diaSemana("2026-10-05") === "lunes", "día de la semana");
ok(F.sumarDias("2026-10-31", 1) === "2026-11-01" && F.sumarDias("2026-12-31", 1) === "2027-01-01" && F.sumarDias("2026-03-01", -1) === "2026-02-28", "sumar días cruza meses y años");
ok(F.diasHasta("2026-10-01", "2026-10-03") === 2 && F.diasHasta("2026-10-03", "2026-10-01") === -2 && F.diasHasta("2026-10-01", "2026-10-01") === 0, "días hasta");
ok(F.proximoDia("2026-10-01", 5) === "2026-10-02", "el viernes que viene desde un jueves");
ok(F.proximoDia("2026-10-02", 5) === "2026-10-02", "si hoy es viernes, el viernes es hoy");
ok(F.proximoDia("2026-10-03", 5) === "2026-10-09", "desde el sábado, el viernes de la otra semana");
ok(F.textoCuando("2026-10-01", "2026-10-01") === "hoy" && F.textoCuando("2026-10-01", "2026-10-02") === "mañana" && F.textoCuando("2026-10-01", "2026-09-30") === "ayer"
   && F.textoCuando("2026-10-01", "2026-10-05") === "en 4 días" && F.textoCuando("2026-10-05", "2026-10-01") === "hace 4 días", "texto de cuándo");
ok(F.fechaConDia("2026-10-02") === "viernes 02/10/2026", "fecha con día: " + F.fechaConDia("2026-10-02"));
const gr = F.agrupar([{ fecha: "2026-10-09" }, { fecha: "2026-09-20" }, { fecha: "2026-10-01" }, { fecha: "2026-10-03" }, { fecha: "2026-09-30" }], "2026-10-01");
ok(gr.proximos.map((x) => x.fecha).join() === "2026-10-01,2026-10-03,2026-10-09", "próximos: el más cercano primero, hoy incluido");
ok(gr.anteriores.map((x) => x.fecha).join() === "2026-09-30,2026-09-20", "anteriores: el más reciente primero");

if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Inventario fiscal, las cuentas: hojas sin número fijo (el menor número libre, sin renumerar), parejas OL/Bavaria, personas repetidas y el resumen.");
