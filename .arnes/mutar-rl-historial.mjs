/* =====================================================================
   ¿DE VERDAD CAZA ALGO EL ARNÉS DE LAS HOJAS EN EL TABLERO?
   Cada error que dice cazar, metido de vuelta; tiene que ponerse rojo
   POR SU PROPIA AFIRMACIÓN.

     node .arnes/mutar-rl-historial.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const HIS = "src/modulos/rotlinea/historial.ts";
const COMP = "src/app/(app)/quiebra/rotura/tablero/Hojas.tsx";
const PAG = "src/app/(app)/quiebra/rotura/tablero/page.tsx";
const FILA = "src/app/(app)/quiebra/rotura/tablero/FilaHoja.tsx";
const CSS = "src/app/(app)/quiebra/rotura/rotura.css";
const original = Object.fromEntries([HIS, COMP, PAG, CSS, FILA].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => { restaurar(); process.exit(130) });

let fallos = 0, total = 0;
function probar(nombre, cambios, espera) {
  total++; restaurar();
  for (const [archivo, de, a] of cambios) {
    const antes = readFileSync(archivo, "utf8");
    if (!antes.includes(de)) { console.log(`  ROTA  ✘  ${nombre}  ← la mutación ya no aplica`); fallos++; return }
    writeFileSync(archivo, antes.replace(de, a));
  }
  let salida;
  try { salida = execFileSync("node", [".arnes/rl-historial.mjs"], { encoding: "utf8" }) }
  catch (e) {
    salida = (e.stdout ?? "") + (e.stderr ?? "");
    if (salida.includes(espera)) { console.log(`  ROJA  ✔  ${nombre}`); return }
    console.log(`  OTRA  ✘  ${nombre}  ← se puso rojo, pero por otra cosa`);
    console.log(`           esperaba: «${espera}»`);
    for (const l of salida.split("\n").filter((l) => l.startsWith("✗") || /Error/.test(l)).slice(0, 2))
      console.log(`           salió:    ${l}`);
    fallos++; return;
  }
  console.log(`  VERDE ✘  ${nombre}  ← LA PRUEBA NO CAZA ESTO`); fallos++;
}
console.log("");

/* ---------- LA CUENTA ---------- */
probar("cuenta como pendientes los días de antes de la hoja",
  [[HIS, "u > 0 && f >= DESDE_HOJAS && !ultima.has(f)", "u > 0 && !ultima.has(f)"]],
  "de antes de que la hoja existiera");
probar("pide hoja de un día sin rotura",
  [[HIS, "u > 0 && f >= DESDE_HOJAS", "u >= 0 && f >= DESDE_HOJAS"]],
  "pide hoja de un día sin rotura");
probar("los pendientes salen del más viejo al más nuevo",
  [[HIS, ".sort((a, b) => b.fecha.localeCompare(a.fecha));", ".sort((a, b) => a.fecha.localeCompare(b.fecha));"]],
  "el más nuevo primero");
probar("el día se compara con una sola línea",
  [[HIS, "undDia.set(d.fecha, (undDia.get(d.fecha) ?? 0) + Number(d.und));", "undDia.set(d.fecha, Number(d.und));"]],
  "el día que cambió después no se marca bien");
probar("se compara la PRIMERA hoja del día y no la última",
  [[HIS, "if (!u || h.generado_en > u.generado_en) ultima.set(h.fecha, h);", "if (!u || h.generado_en < u.generado_en) ultima.set(h.fecha, h);"]],
  "no distingue la última versión");
probar("con filtro de línea marca todo como cambiado",
  [[HIS, "  if (!conLinea) {", "  if (true) {"]],
  "con filtro de línea marca hojas como cambiadas");
probar("la lista no va de la más nueva a la más vieja",
  [[HIS, "b.fecha.localeCompare(a.fecha) || b.generado_en.localeCompare(a.generado_en));", "a.fecha.localeCompare(b.fecha) || a.generado_en.localeCompare(b.generado_en));"]],
  "la lista no va de la más nueva a la más vieja");

/* ---------- LAS ANULADAS ---------- */
probar("una hoja anulada cuenta como la hoja del día",
  [[HIS, "    if (anulada(h)) continue;\n", ""]],
  "una hoja anulada cuenta como la hoja del día");
probar("las anuladas se cuentan como hojas",
  [[HIS, "    total: hojas.length - anuladas,", "    total: hojas.length,"]],
  "y 2 anuladas; son 4 de 3");
probar("la anulada no se distingue en la lista",
  [[FILA, '<tr className={anulada ? "rl-hojas-anulada" : vieja ? "rl-hojas-vieja" : undefined}>',
          '<tr className={vieja ? "rl-hojas-vieja" : undefined}>']],
  "las hojas anuladas no se distinguen");
probar("la cifra de la anulada no sale tachada",
  [[FILA, '{anulada ? <s className="rl-hojas-cifra">{fmt(Number(h.unidades))}</s> : fmt(Number(h.unidades))}',
          '{fmt(Number(h.unidades))}']],
  "no sale tachada");
probar("la anulada no dice quién ni por qué",
  [[FILA, '<span className="rl-hojas-motivo">Anulada{h.anulada_nombre ? ` por ${h.anulada_nombre}` : ""}: {h.anulada_motivo}</span>',
          '<span className="rl-hojas-motivo">Anulada</span>']],
  "no dice quién la anuló ni por qué");
probar("quien no administra ve el botón de anular",
  [[FILA, "        {puedeAnular && (\n          <td className=\"cen\">", "        {true && (\n          <td className=\"cen\">"]],
  "quien no administra ve los botones");
probar("aparece un botón de borrar",
  [[FILA, '{anulada ? "Quitar anulación" : "Anular"}', '{anulada ? "Quitar anulación" : "Borrar"}']],
  "el administrador no tiene «Anular»");
probar("el motivo en un rojo que no se lee",
  [[CSS, "  color: #8A1C1C; white-space: normal; line-height: 1.35;", "  color: #E86A6A; white-space: normal; line-height: 1.35;"]],
  "«motivo de la anulación» contrasta");
probar("la columna oculta se escapa del scroll y arrastra la página",
  [[CSS, ".rl-hojas .rl-tabla-env { position: relative }\n", ""],
   [CSS, "  position: absolute; left: 0; top: 0;", "  position: absolute;"]],
  "las hojas arrastran la página");
probar("el botón de anular queda chico para el dedo",
  [[CSS, "  min-height: 36px; padding: 0 10px; border: 1px solid var(--rl-linea); border-radius: 3px;\n  background: var(--rl-papel); color: var(--rl-tinta); font: 600 12px var(--rl-texto);",
         "  min-height: 0; padding: 0 10px; border: 1px solid var(--rl-linea); border-radius: 3px;\n  background: var(--rl-papel); color: var(--rl-tinta); font: 600 12px var(--rl-texto);"]],
  "«Anular» mide");

/* ---------- EL TABLERO ---------- */
probar("el tablero no trae las hojas",
  [[PAG, "tablero(desde, hasta, linea), hojasGuardadas(desde, hasta),", "tablero(desde, hasta, linea), Promise.resolve({ falta: false, hojas: [] }),"]],
  "el tablero no trae las hojas del período");
probar("las hojas van arriba de todo el tablero",
  [[PAG, "      <HojasGeneradas hojas={hj.hojas} dias={t.dias} conLinea={linea != null} falta={hj.falta}\n                      puedeAnular={permisos.manda} />\n", ""],
   [PAG, "      <Periodo desde={desde}", "      <HojasGeneradas hojas={hj.hojas} dias={t.dias} conLinea={linea != null} falta={hj.falta}\n                      puedeAnular={permisos.manda} />\n      <Periodo desde={desde}"]],
  "ese es el orden del día");
probar("el tablero no le da los botones al administrador",
  [[PAG, "puedeAnular={permisos.manda}", "puedeAnular={false}"]],
  "el tablero no deja anular a quien administra");
probar("el tablero no avisa del filtro de línea",
  [[PAG, "conLinea={linea != null}", "conLinea={false}"]],
  "no le dice a la sección si hay filtro de línea");
probar("la sección sale abierta y larga, sin la respuesta en el renglón",
  [[COMP, "<details className={`rl-tarj rl-hojas${ojo ? \" ojo\" : \"\"}`}>", "<section className={`rl-tarj rl-hojas${ojo ? \" ojo\" : \"\"}`}>"],
   [COMP, "    </details>\n  );\n}", "    </section>\n  );\n}"]],
  "no va cerrada con la respuesta en el renglón");
probar("el renglón no dice cuántos días faltan",
  [[COMP, "{pend > 0 && <> · <em>{pend} {pend === 1 ? \"día\" : \"días\"} sin hoja</em></>}", ""]],
  "el renglón no dice la respuesta");
probar("el día sin hoja lleva a Registrar sin abrir la ventana",
  [[COMP, "href={`/quiebra/rotura?d=${d.fecha}&hoja=1`}", "href={`/quiebra/rotura?d=${d.fecha}`}"]],
  "no lleva directo a generarla");
probar("la hoja no se puede abrir",
  [[FILA, '? <a href={h.url} target="_blank" rel="noopener noreferrer">Abrir</a>', '? <span>Abrir</span>']],
  "la hoja no tiene cómo abrirse");
probar("se pintan todas las hojas del año",
  [[COMP, "r.ordenadas.slice(0, MAX_FILAS)", "r.ordenadas"]],
  "un año entero serían cientos");
probar("sin la migración no dice qué correr",
  [[COMP, "<code>supabase/migraciones/2026-09-rotura-linea-hojas.sql</code>", "<code>la migración</code>"]],
  "sin la migración no dice qué correr");

/* ---------- EN PANTALLA ---------- */
probar("lo pendiente en un ámbar que no se lee",
  [[CSS, ".rl-hojas-dice em { font-style: normal; font-weight: 700; color: #5E4100 }",
         ".rl-hojas-dice em { font-style: normal; font-weight: 700; color: #E0A800 }"]],
  "«lo pendiente» contrasta");
probar("el renglón que abre se encoge por debajo del dedo",
  [[CSS, "  padding: 14px 18px; min-height: 48px; cursor: pointer; list-style: none;", "  padding: 2px 18px; min-height: 0; cursor: pointer; list-style: none;"]],
  "el renglón que abre mide");
probar("«Abrir» es un enlace de 15 px",
  [[CSS, "  display: inline-flex; align-items: center; min-height: 36px; padding: 0 10px;", "  display: inline; align-items: center; min-height: 0; padding: 0;"]],
  "«Abrir» mide");

restaurar();
console.log("");
if (fallos) { console.log(`${fallos} de ${total} no cazan lo que dicen cazar.`); process.exit(1) }
console.log(`Las ${total} se pusieron rojas. El arnés caza lo que dice cazar.`);
