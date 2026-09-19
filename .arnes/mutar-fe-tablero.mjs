/* =====================================================================
   ¿DE VERDAD CAZA ALGO EL ARNÉS DEL TABLERO DE INVENTARIO?

   Un arnés en verde no prueba nada por sí solo: prueba que no encontró
   lo que buscó, y buscar mal también sale verde. Aquí se le vuelve a
   meter CADA error que dice cazar y se exige que se ponga rojo POR SU
   PROPIA AFIRMACIÓN.

     node .arnes/mutar-fe-tablero.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PGX = "src/app/(app)/inventario/page.tsx";
const DAT = "src/modulos/inventario/fefo.ts";
const CSS = "src/app/(app)/inventario/fefo.css";
const CON = "src/app/(app)/inventario/conteo/Contar.tsx";

const archivos = [PGX, DAT, CSS, CON];
const original = Object.fromEntries(archivos.map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);
/* Y TAMBIÉN SI A ESTO LO MATAN. `exit` no salta con SIGTERM ni con
   SIGINT, y la vez que pasó el árbol se quedó con una mutación puesta y
   la corrida siguiente la tomó por el original. */
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(s, () => { restaurar(); process.exit(130) });

let fallos = 0;

function probar(nombre, cambios, espera) {
  restaurar();
  for (const [archivo, de, a] of cambios) {
    const antes = readFileSync(archivo, "utf8");
    /* `replace` NO AVISA cuando no encuentra nada: reescribe el archivo
       idéntico y el arnés aprueba lo mismo de siempre. */
    if (!antes.includes(de)) {
      console.log(`  ROTA  ✘  ${nombre}  ← la mutación ya no aplica: no encontré el texto`);
      fallos++; return;
    }
    writeFileSync(archivo, antes.replace(de, a));
  }
  let salida;
  try {
    salida = execFileSync("node", [".arnes/fe-tablero.mjs"], { encoding: "utf8" });
  } catch (e) {
    salida = (e.stdout ?? "") + (e.stderr ?? "");
    if (salida.includes(espera)) { console.log(`  ROJA  ✔  ${nombre}`); return }
    console.log(`  OTRA  ✘  ${nombre}  ← se puso rojo, pero por otra cosa`);
    console.log(`           esperaba: «${espera}»`);
    for (const l of salida.split("\n").filter((l) => l.startsWith("✗")).slice(0, 2))
      console.log(`           salió:    ${l}`);
    fallos++; return;
  }
  console.log(`  VERDE ✘  ${nombre}  ← LA PRUEBA NO CAZA ESTO`);
  console.log(`           esperaba: «${espera}»`);
  fallos++;
}

console.log("");

/* ---------- LO QUE YA MEDÍA ---------- */

probar("la ocupación se compara contra las cajas y no contra las estibas",
  [[PGX, "x.estibas += Number(l.total_estibas);", "x.estibas += Number(l.total_cajas);"]],
  "no se compara en estibas");

probar("una capacidad en cero no se salta",
  [[PGX, "if (!l.ubicacion || l.capacidad == null || l.capacidad <= 0) continue;",
         "if (!l.ubicacion) continue;"]],
  "no se salta");

probar("contar se dejaría impedir por la sobreocupación",
  [[CON, "  const campoSaldo = useRef<HTMLInputElement>(null);",
         "  const campoSaldo = useRef<HTMLInputElement>(null);\n  const tope = ubicacion?.capacidad ?? null;"]],
  "la pantalla de contar mira la capacidad");

probar("el tablero afirma sobre borradores",
  [[DAT, '.filter((x) => x.estado === "cerrado")', ".filter(() => true)"]],
  "no filtra por conteos cerrados");

probar("el tope de las barras puede ser cero",
  [[PGX, "Math.max(1,", "Math.max(0,"]],
  "puede ser cero");

/* ---------- LO QUE QUEDÓ SIN CONTAR ---------- */

probar("lo sin contar se pide de todos los recorridos y no del último",
  [[DAT, "const ultimo = enviados[0] ?? null;", "const ultimo = null;"]],
  "no se pide del último recorrido");

probar("sin la migración, el tablero entero se cae",
  [[DAT, "    faltaSinContar: !!sc.error && sinTablas(sc.error.message),",
         "    faltaSinContar: false,"]],
  "el tablero entero se cae");

probar("la pantalla no dice qué migración falta",
  [[PGX, "          {t.faltaSinContar ? (", "          {false ? ("]],
  "no dice qué migración falta");

probar("lo sin contar sale en orden alfabético y no por días",
  [[PGX, "    (b.dias_sin_contar ?? Number.MAX_SAFE_INTEGER) - (a.dias_sin_contar ?? Number.MAX_SAFE_INTEGER)\n    || a.clave.localeCompare(b.clave, \"es\", { numeric: true }));",
         '    a.clave.localeCompare(b.clave, "es", { numeric: true }));']],
  "sale en orden alfabético");

probar("el «de cuántas» de cada calle se cuenta de lo que falta y no del maestro",
  [[PGX, "    for (const u of m.ubicaciones) {\n      if (!u.activa || u.bodega_id !== bodega?.id) continue;",
         "    for (const u of [] as typeof m.ubicaciones) {\n      if (!u.activa || u.bodega_id !== bodega?.id) continue;"]],
  "no sale del maestro");

probar("cuando no falta nada por contar, la pantalla se queda callada",
  [[PGX, "                <b>Nada quedó sin contar</b> en el último recorrido",
         "                <b>Sin novedad</b> en el último recorrido"]],
  "se queda callada");

probar("«nada quedó sin contar» se pinta en ámbar, como si fuera un problema",
  [[CSS, ".fe .fe-faltan.bien { background: #EAF6F0; border-color: #A9D8C2 }\n" +
         ".fe .fe-faltan.bien p { color: #17543C }",
         ".fe .fe-faltan.bien { background: #EAF6F0; border-color: #A9D8C2 }\n" +
         ".fe .fe-faltan.bien p { color: #B9D8C8 }"]],
  "«completo» contrasta");

probar("todas las barras de lo sin contar vuelven a ser rojas",
  [[CSS, ".fe .fe-sincontar .fe-barras .fe-mat .pista i { background: var(--fe-acento) }",
          ".fe .fe-sincontar .fe-barras .fe-mat .pista i { background: var(--fe-mal) }"]],
  "son todas del mismo color");

restaurar();
console.log("");
if (fallos > 0) {
  console.log(`${fallos} aserción(es) no cazan lo que dicen cazar.`);
  process.exit(1);
}
console.log("Las 13 se pusieron rojas. El arnés caza lo que dice cazar.");
