/* ¿CAZA ALGO EL ARNÉS DE LA RELACIÓN? Cada error se vuelve a meter y se
   exige que se ponga rojo por su propia afirmación.
     node .arnes/mutar-rl-relacion.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const REL = "src/modulos/rotlinea/relacion.ts";
const INF = "src/app/(app)/quiebra/rotura/tablero/informes/Informes.tsx";
const PAG = "src/app/(app)/quiebra/rotura/tablero/informes/page.tsx";
const orig = Object.fromEntries([REL, INF, PAG].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(orig)) writeFileSync(f, t) };
process.on("exit", restaurar);
let fallos = 0, total = 0;
function probar(nombre, [archivo, de, a], espera) {
  total++; restaurar();
  if (!orig[archivo].includes(de)) { console.log(`  ROTA  ✘  ${nombre}`); fallos++; return }
  writeFileSync(archivo, orig[archivo].replace(de, a));
  try { execFileSync("node", [".arnes/rl-relacion.mjs"], { encoding: "utf8" }) }
  catch (e) {
    const s = (e.stdout ?? "") + (e.stderr ?? "");
    if (s.includes(espera)) { console.log(`  ROJA  ✔  ${nombre}`); return }
    console.log(`  OTRA  ✘  ${nombre}\n           ${s.split("\n").find((l) => l.startsWith("✗"))}`); fallos++; return;
  }
  console.log(`  VERDE ✘  ${nombre}`); fallos++;
}
probar("se cuelan días sin rotura", [REL, ".filter(([, v]) => v.und > 0)", ".filter(() => true)"], "no son los de rotura");
probar("no se filtra el rango", [REL, "    if (d.fecha < desde || d.fecha > hasta) continue;\n", ""], "no son los de rotura");
probar("una anulada cuenta como hoja", [REL, "const m = h.anulada_en != null ? anulada : vigente;", "const m = vigente;"], "no toma la última que no se anuló");
probar("no se nota que cambió", [REL, '(Number(h!.unidades) === v.und ? "vigente" : "cambio")', '"vigente"'], "no dice que la hoja cambió");
probar("los días viejos salen como sin hoja", [REL, ': fecha < DESDE_HOJAS ? "antes" : "sin";', ': "sin";'], "un día de antes de la hoja");
probar("la hora sale en 12 horas y se corta", [REL, 'hourCycle: "h23", timeZone', 'timeZone'], "la hora, en 24 horas");
probar("al partir no se repiten los títulos", [REL, "    y = 22;\n    titulos();\n", "    y = 22;\n"], "no repite los títulos");
probar("se pierde la última fila de cada página", [REL, "      if (y + FILA > TOPE) hojaNueva();", "      if (y + FILA > TOPE) { hojaNueva(); return }"], "se perdieron filas");
probar("sin compresión pesa de más", [REL, ', compress: true });', ' });'], "la relación larga pesa");
probar("sin rotura se encima el mensaje", [REL, "    y += 12;\n", ""], "no lo dice");
probar("el total no cierra la tabla", [REL, 'doc.text("TOTAL DEL PERÍODO"', 'doc.text("TOTAL"'], "no cierra con el total");
probar("el pie no dice Bavaria", [REL, 'doc.text("Bavaria", W / 2, PIE', 'doc.text("CD38", W / 2, PIE'], "el pie no dice Bavaria");
probar("la página no pasa el rango", [PAG, " desde={desde} hasta={hasta} />", " desde=\"\" hasta=\"\" />"], "no le pasa el rango");
probar("se deja tocar sin rotura", [INF, "disabled={armando || rel.filas.length === 0}", "disabled={armando}"], "se deja tocar sin rotura");
probar("no toma el tema", [INF, "paleta: leerPaleta(raiz.current),", "paleta: undefined,"], "colores del tema");
restaurar();
console.log(fallos ? `\n${fallos} no cazan lo que dicen.` : `\nLas ${total} se pusieron rojas.`);
process.exit(fallos ? 1 : 0);
