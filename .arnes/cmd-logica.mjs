/* La barra de comandos: códigos, permisos y qué abre cada cosa. node .arnes/cmd-logica.mjs */
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/comandos.ts")], bundle: true, format: "esm", outfile: R(".arnes/tmp/comandos.mjs"), logLevel: "silent" });
buildSync({ entryPoints: [R("src/modulos/registro.ts")], bundle: true, format: "esm", outfile: R(".arnes/tmp/registro-cmd.mjs"), logLevel: "silent" });
const { armarComandos, buscar, interpretar, parsear, codigoDeRuta } = await import(pathToFileURL(R(".arnes/tmp/comandos.mjs")).href);
const { MODULOS, rutasRegistradas } = await import(pathToFileURL(R(".arnes/tmp/registro-cmd.mjs")).href);
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

const todas = rutasRegistradas();
const C = armarComandos(MODULOS, todas);
const por = (cod) => C.find((c) => c.codigo === cod);

/* 1 · Los códigos salen del registro y no se repiten. */
ok(new Set(C.map((c) => c.codigo)).size === C.length, "hay códigos repetidos: " + C.map((c) => c.codigo).sort().join(","));
ok(por("INV-CORTE")?.ruta === "/inventario/corte" && por("INV-CONTEO")?.ruta === "/inventario/conteo", "INV-CORTE e INV-CONTEO: " + JSON.stringify(por("INV-CORTE")));
ok(por("SID-TRANSITO")?.ruta === "/sider/transito" && por("SID")?.ruta === "/sider", "Sider: " + [por("SID-TRANSITO")?.ruta, por("SID")?.ruta]);
ok(por("INICIO")?.ruta === "/inicio", "INICIO");
ok(codigoDeRuta("/roturas/en-sitio/visto-bueno") === "ROT-EN-SITIO-VISTO-BUENO", "ruta larga: " + codigoDeRuta("/roturas/en-sitio/visto-bueno"));
ok(C.every((c) => !/oculto/.test(c.nombre)) && !C.some((c) => c.ruta === "/sider/transito/revision-ai" || c.ruta === "/roturas" ), "las pantallas ocultas no salen");

/* 2 · Solo sale lo que la persona puede abrir. */
{
  const poca = armarComandos(MODULOS, ["/inventario/corte", "/inventario/conteo"]);
  ok(poca.map((c) => c.codigo).sort().join() === "INICIO,INV-CONTEO,INV-CORTE", "solo lo permitido: " + poca.map((c) => c.codigo));
  ok(interpretar("SID-TRANSITO", poca).tipo === "error", "una pantalla cerrada no se abre escribiendo su código");
  ok(buscar(poca, "transito").length === 0, "ni se sugiere");
  ok(interpretar("inv-corte", poca).ruta === "/inventario/corte", "el permitido sí, sin importar mayúsculas");
}

/* 3 · /o abre otra ventana; /n y sin prefijo, esta. */
{
  const a = interpretar("/o INV-CORTE", C), b = interpretar("/n INV-CORTE", C), c = interpretar("INV-CORTE", C), d = interpretar("INV-CORTE", C, null, true);
  ok(a.nueva === true && a.ruta === "/inventario/corte", "/o → ventana nueva: " + JSON.stringify(a));
  ok(b.nueva === false && c.nueva === false, "/n y sin prefijo → esta ventana");
  ok(d.nueva === true, "Shift+Enter equivale a /o");
  /* Con «otra pestaña» por defecto (como queda la barra): Enter abre otra, Shift+Enter esta, /n esta, /o otra. */
  const D = (t, inv = false) => interpretar(t, C, null, inv, true);
  ok(D("INV-CORTE").nueva === true && D("INV-CORTE", true).nueva === false && D("/n INV-CORTE").nueva === false && D("/o INV-CORTE").nueva === true, "por defecto otra pestaña: " + [D("INV-CORTE").nueva, D("INV-CORTE", true).nueva, D("/n INV-CORTE").nueva, D("/o INV-CORTE").nueva]);
  ok(interpretar("/o", C).nueva === true && interpretar("/o", C).ruta === "/inicio", "/o solo → otra ventana en la portada");
  ok(parsear("/O  inv-corte").consulta === "inv-corte" && parsear("/otro").prefijo === false, "el prefijo es /o o /n seguido de espacio");
}

/* 4 · Por nombre, con tildes y a medias. */
{
  ok(interpretar("corte de lineas", C).ruta === "/inventario/corte", "por nombre sin tilde: " + JSON.stringify(interpretar("corte de lineas", C)));
  ok(buscar(C, "contar")[0]?.ruta === "/inventario/conteo", "«contar»: " + buscar(C, "contar").map((x) => x.codigo));
  ok(buscar(C, "tránsito")[0]?.codigo === "SID-TRANSITO", "«tránsito»: " + buscar(C, "tránsito").map((x) => x.codigo));
  ok(buscar(C, "inv").every((x) => /^INV/.test(x.codigo) || /inv/i.test(x.nombre + x.modulo)), "prefijo de módulo");
  const e = interpretar("zzzz", C);
  ok(e.tipo === "error" && /zzzz/.test(e.mensaje), "no existe: " + JSON.stringify(e));
  ok(interpretar("", C).tipo === "error", "vacío: pide un código");
  ok(interpretar("x", C, por("INV-CORTE")).ruta === "/inventario/corte", "la sugerencia escogida con las flechas manda");
}
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log(`✓ Barra de comandos: ${C.length} pantallas con código único, solo las permitidas, /o abre otra ventana, y se busca por código o nombre.`);
