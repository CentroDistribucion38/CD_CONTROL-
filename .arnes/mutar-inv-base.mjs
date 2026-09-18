/* =====================================================================
   ¿DE VERDAD CAZA ALGO EL ARNÉS DE LA BASE?

   Se rompe la pantalla a propósito, UNA COSA A LA VEZ, y se exige un
   mensaje CONCRETO. Una aserción que se pone roja por otro motivo no
   prueba nada de lo que dice probar.

     node .arnes/mutar-inv-base.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TSX = "src/app/(app)/inventario/base/Base.tsx";
const PGX = "src/app/(app)/inventario/base/page.tsx";
const CSS = "src/app/(app)/inventario/base/base.css";
const DAT = "src/modulos/inventario/fefo.ts";
const REG = "src/modulos/registro.ts";

const archivos = [TSX, PGX, CSS, DAT, REG];
const original = Object.fromEntries(archivos.map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);

let fallos = 0;

function probar(nombre, cambios, espera) {
  restaurar();
  for (const [archivo, de, a] of cambios) {
    const antes = readFileSync(archivo, "utf8");
    if (!antes.includes(de)) {
      console.log(`  ROTA  ✘  ${nombre}  ← la mutación ya no aplica: no encontré el texto`);
      fallos++; return;
    }
    writeFileSync(archivo, antes.replace(de, a));
  }
  let salida;
  try {
    salida = execFileSync("node", [".arnes/inv-base.mjs"], { encoding: "utf8" });
  } catch (e) {
    salida = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  if (salida.includes(espera)) console.log(`  ROJA  ✔  ${nombre}`);
  else {
    console.log(`  VERDE ✘  ${nombre}  ← LA PRUEBA NO CAZA ESTO`);
    console.log(`           esperaba: «${espera}»`);
    fallos++;
  }
}

console.log("Rompiendo la base a propósito, una cosa a la vez:\n");

/* ---------- LOS DOS MONTONES ---------- */
probar("lo enviado y los borradores no se mezclan",
  [[DAT, "    abiertas: lineas.filter((r) => !deEnviados.has(r.conteo_id)),",
         "    abiertas: lineas.filter((r) => deEnviados.has(r.conteo_id)),"]],
  "no se separan por el estado del recorrido");

probar("la tabla lee un montón u otro según la pestaña",
  [[TSX, 'const crudas = pestania === "base" ? enviadas : abiertas;',
         "const crudas = [...enviadas, ...abiertas];"]],
  "junta los dos montones");

probar("el total sale de lo que se está viendo",
  [[TSX, "const cajas = filas.reduce((a, r) => a + Number(r.total_cajas), 0);",
         "const cajas = crudas.reduce((a, r) => a + Number(r.total_cajas), 0);"]],
  "el total de cajas no sale de las filas que se están viendo");

probar("el anulado no se cuela en ningún montón",
  [[DAT, '  const abiertos = conteos.filter((x) => x.estado === "en_proceso" || x.estado === "borrador");',
         '  const abiertos = conteos.filter((x) => x.estado !== "cerrado");']],
  "no se parten por estado con nombre propio");

/* ---------- DE LOS BORRADORES NO SE TOCA NADA ---------- */
probar("la pantalla no escribe en la base",
  [[TSX, "  const [pestania, setPestania] = useState",
         "  const borrar = (id: string) => conteo_fefo_borrar(id);\n  const [pestania, setPestania] = useState"]],
  "esta pantalla solo lee");

/* ---------- EL TOPE ---------- */
probar("se detecta el tope de filas",
  [[DAT, "    tope: lineas.length === TOPE_BASE,", "    tope: false,"]],
  "no se detecta cuándo se llegó al tope");

probar("el tope se dice en pantalla",
  [[TSX, "      {tope && (", "      {false && ("]],
  "no dice cuándo se llegó al tope");

/* ---------- UNA SOLA LISTA DE COLUMNAS ---------- */
probar("las columnas salen de una sola lista para los tres sitios",
  [[TSX, "    COLUMNAS.map((c) => escapa(c.t)).join(\";\"),",
         '    "Calle;Módulo;Lado",']],
  "y tienen que ser cuatro");

/* ---------- EL EXCEL ---------- */
probar("el CSV dice el separador",
  [[TSX, '    "sep=;",', '    "",']],
  "no dice el separador");

probar("el CSV lleva BOM",
  [[TSX, 'new Blob(["\\uFEFF" + lineas.join("\\r\\n")]', 'new Blob([lineas.join("\\r\\n")]']],
  "va sin BOM");

probar("el Excel baja lo filtrado",
  [[TSX, "onClick={() => bajar(filas,", "onClick={() => bajar(crudas,"]],
  "el Excel no baja lo filtrado");

/* ---------- EL ORDEN NO MUTA ---------- */
probar("ordenar no muta la lista que vino del servidor",
  [[TSX, "    return [...vistas].sort((a, b) => {", "    return vistas.sort((a, b) => {"]],
  "se ordena mutando la lista");

/* ---------- LA TABLA ---------- */
probar("la tabla se desplaza dentro de su caja",
  [[CSS, ".fe .ba-marco {\n  overflow: auto; max-height: 70vh;",
         ".fe .ba-marco {\n  overflow: visible; max-height: none;"]],
  "la tabla no se desplaza dentro de su caja");

probar("la cabecera de la tabla se queda pegada",
  [[CSS, ".fe .ba-tabla thead th {\n  position: sticky; top: 0; z-index: 2;",
         ".fe .ba-tabla thead th {\n  position: static;"]],
  "no se queda pegada");

probar("el título que ordena se alcanza con el dedo",
  [[CSS, "  min-height: 38px; padding: 10px 11px; cursor: pointer;",
         "  min-height: 0; padding: 2px 11px; cursor: pointer;"]],
  "el título que ordena mide");

/* ---------- SE LEE ---------- */
probar("lo que ya se pasó se lee",
  [[CSS, ".fe .ba-tabla .ba-mal { font-weight: 800; color: var(--fe-mal) }",
         ".fe .ba-tabla .ba-mal { font-weight: 800; color: #F0A8B2 }"]],
  "«pasado» contrasta");

probar("el aviso del borrador se lee sobre el crema",
  [[CSS, ".fe .ba-dice.ojo { background: #FFF8E6; color: #5E4100; box-shadow: inset 4px 0 0 #C08A16 }",
         ".fe .ba-dice.ojo { background: #FFF8E6; color: #D4B44A; box-shadow: inset 4px 0 0 #C08A16 }"]],
  "«borrador» contrasta");

probar("la celda se lee sobre el rayado",
  [[CSS, ".fe .ba-tabla td { padding: 9px 11px; color: var(--fe-tinta) }",
         ".fe .ba-tabla td { padding: 9px 11px; color: #C9CDD2 }"]],
  "«celda» contrasta");

/* ---------- EL MENÚ Y LA PUERTA ---------- */
probar("la base va antes que el tablero en el menú",
  [[REG, '      { nombre: "La base", ruta: "/inventario/base" },\n      { nombre: "Tablero", ruta: "/inventario" },',
         '      { nombre: "Tablero", ruta: "/inventario" },\n      { nombre: "La base", ruta: "/inventario/base" },']],
  "las pantallas de Inventario salen");

probar("la puerta se comprueba en el servidor",
  [[PGX, '  if (!permisos.puedeVer("/inventario/base")) {', "  if (false) {"]],
  "no comprueba el permiso");

restaurar();
console.log("");
if (fallos > 0) {
  console.log(`${fallos} aserción(es) no cazan lo que dicen cazar.`);
  process.exit(1);
}
console.log("Las 19 se pusieron rojas. El arnés caza lo que dice cazar.");
