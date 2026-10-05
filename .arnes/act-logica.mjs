/* Cuándo se actualiza sola una pantalla: node .arnes/act-logica.mjs */
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/actualizar.ts")], bundle: true, format: "esm", outfile: R(".arnes/tmp/actualizar.mjs"), logLevel: "silent" });
const { sinBoton, esDeConsulta, puedeActualizarSola, haceCuanto, CADA_MS } = await import(pathToFileURL(R(".arnes/tmp/actualizar.mjs")).href);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
for (const r of ["/inicio", "/inventario/tablero", "/sider/transito", "/sider/seguimiento", "/roturas/en-sitio/tablero", "/acciones/mias", "/acciones/abi/informe", "/inventario/base"]) ok(esDeConsulta(r), "debía ser de consulta: " + r);
for (const r of ["/inventario/conteo", "/inventario/corte", "/sider/certificar", "/roturas/en-sitio", "/traspasos/plan", "/admin/inicio", "/admin/roles", "/perfil", "/"]) ok(!esDeConsulta(r), "NO debía actualizarse sola (se digita o es administración): " + r);
for (const r of ["/", "/inicio", "/perfil", "/perfil/seguridad"]) ok(sinBoton(r), "sin botón (está «Cerrar sesión»): " + r);
for (const r of ["/inventario/tablero", "/admin/inicio", "/traspasos/plan", "/sider/transito"]) ok(!sinBoton(r), "dentro de un módulo sí hay botón: " + r);
const base = { pathname: "/inventario/tablero", visible: true, escribiendo: false, dialogo: false, ocupado: false };
ok(puedeActualizarSola(base), "el caso normal");
ok(!puedeActualizarSola({ ...base, escribiendo: true }), "no si está escribiendo");
ok(!puedeActualizarSola({ ...base, dialogo: true }), "no con un cuadro abierto");
ok(!puedeActualizarSola({ ...base, visible: false }), "no con la pestaña oculta");
ok(!puedeActualizarSola({ ...base, ocupado: true }), "no si ya está actualizando");
ok(!puedeActualizarSola({ ...base, pathname: "/inventario/conteo" }), "no en una pantalla de digitar");
ok(CADA_MS === 60000, "cada minuto");
ok(haceCuanto(1000) === "ahora mismo" && haceCuanto(30000) === "hace 30 s" && haceCuanto(125000) === "hace 2 min" && haceCuanto(7300000) === "hace 2 h", "el «hace cuánto»");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Actualizar: solo las pantallas de consulta se actualizan solas, y no si se está escribiendo, hay un cuadro, la pestaña está oculta o ya está actualizando.");
