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
const INF = "src/app/(app)/quiebra/rotura/tablero/informes/Informes.tsx";
const PINF = "src/app/(app)/quiebra/rotura/tablero/informes/page.tsx";
const PES = "src/app/(app)/quiebra/rotura/tablero/Pestanas.tsx";
const original = Object.fromEntries([HIS, COMP, PAG, CSS, FILA, INF, PINF, PES].map((f) => [f, readFileSync(f, "utf8")]));
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
  [[FILA, '"rl-inf" + (anulada ? " anulada" : vieja ? " vieja" : "")', '"rl-inf" + (vieja ? " vieja" : "")']],
  "las anuladas no se distinguen");
probar("la cifra de la anulada no sale tachada",
  [[FILA, '{anulada ? <s className="rl-hojas-cifra">{fmt(Number(h.unidades))}</s> : fmt(Number(h.unidades))}',
          '{fmt(Number(h.unidades))}']],
  "no sale tachada");
probar("la anulada no dice quién ni por qué",
  [[FILA, '<p className="rl-hojas-motivo">Anulada{h.anulada_nombre ? ` por ${h.anulada_nombre}` : ""}: {h.anulada_motivo}</p>',
          '<p className="rl-hojas-motivo">Anulada</p>']],
  "no dice quién la anuló ni por qué");
probar("quien no administra ve el botón de anular",
  [[FILA, "        {puedeAnular && (\n          <button", "        {true && (\n          <button"]],
  "quien no administra ve los botones");
probar("aparece un botón de borrar",
  [[FILA, '{anulada ? "Quitar anulación" : "Anular"}', '{anulada ? "Quitar anulación" : "Borrar"}']],
  "el administrador no tiene «Anular»");
probar("el motivo en un rojo que no se lee",
  [[CSS, "  color: #8A1C1C; white-space: normal; line-height: 1.35;", "  color: #E86A6A; white-space: normal; line-height: 1.35;"]],
  "«motivo de la anulación» contrasta");

/* ---------- LA HOJA DE INFORMES ---------- */
probar("no se puede ver el PDF en la pantalla",
  [[FILA, '<button type="button" className="rl-inf-btn si" onClick={ver} aria-pressed={elegida}>Ver</button>', ""]],
  "no hay «Ver» y «Descargar»");
probar("no se puede descargar",
  [[FILA, '<button type="button" className="rl-inf-btn" onClick={descargar}>Descargar</button>', ""]],
  "no hay «Ver» y «Descargar»");
probar("no se puede abrir en pestaña",
  [[FILA, '<a className="rl-inf-btn" href={h.url} target="_blank" rel="noopener noreferrer">Abrir en pestaña</a>', ""]],
  "no hay «Abrir en pestaña»");
probar("al entrar la vista previa muestra la anulada",
  [[INF, 'const primera = lista.find((h) => h.anulada_en == null && h.url) ?? lista.find((h) => h.url) ?? null;',
         'const primera = lista.find((h) => h.url) ?? null;']],
  "no muestra la hoja más nueva que vale");
probar("la vista previa no se pinta",
  [[INF, '<iframe key={elegida.id} src={elegida.url} title={`Hoja del día ${elegida.fecha}`} />', ""]],
  "no muestra la hoja más nueva que vale");
probar("se descarga con el nombre interno del archivo",
  [[INF, "enlace.download = nombreDescarga(h);", 'enlace.download = "";']],
  "no guarda el PDF con el nombre del día");
probar("en el celular «Ver» no abre la pestaña",
  [[INF, 'window.matchMedia("(max-width: 900px)").matches', "false"]],
  "en el celular «Ver» no abre el PDF");
probar("se pintan todos los informes del año",
  [[INF, "const lista = r.ordenadas.slice(0, MAX);", "const lista = r.ordenadas;"]],
  "pinta más de 60");
probar("la hoja de informes pide otro permiso",
  [[PINF, 'permisos.puedeVer("/quiebra/rotura/tablero")', 'permisos.puedeVer("/quiebra/rotura/informes")']],
  "no pide el mismo permiso que el tablero");
probar("en la hoja de informes no anula quien administra",
  [[PINF, "puedeAnular={permisos.manda}", "puedeAnular={false}"]],
  "no anula quien administra");
probar("el período de los informes lleva al tablero",
  [[PINF, 'base="/quiebra/rotura/tablero/informes" ', ""]],
  "lleva al tablero y no a los informes");

/* ---------- EL TABLERO ---------- */
probar("el tablero no trae las hojas",
  [[PAG, "tablero(desde, hasta, linea), hojasGuardadas(desde, hasta),", "tablero(desde, hasta, linea), Promise.resolve({ falta: false, hojas: [] }),"]],
  "el tablero no trae las hojas del período");
probar("el tablero pierde las pestañas",
  [[PAG, '<Pestanas actual="tablero"', '<span data-x="tablero"']],
  "no tienen las pestañas");
probar("el tablero no avisa del filtro de línea",
  [[PAG, "conLinea={linea != null}", "conLinea={false}"]],
  "no le dice a la sección si hay filtro de línea");
probar("el renglón del tablero no dice cuántos días faltan",
  [[COMP, "{pend > 0 && <> · <em>{pend} {pend === 1 ? \"día\" : \"días\"} sin hoja</em></>}", ""]],
  "el renglón del tablero no dice la respuesta");
probar("el renglón del tablero no lleva a los informes con el período",
  [[COMP, "href={`/quiebra/rotura/tablero/informes?${q}`}", 'href="/quiebra/rotura/tablero/informes"']],
  "no lleva a la hoja de informes con el mismo período");
probar("el día sin hoja lleva a Registrar sin abrir la ventana",
  [[INF, "href={`/quiebra/rotura?d=${d.fecha}&hoja=1`}", "href={`/quiebra/rotura?d=${d.fecha}`}"]],
  "no lleva directo a generarla");
probar("sin la migración no dice qué correr",
  [[COMP, "<code>supabase/migraciones/2026-09-rotura-linea-hojas.sql</code>", "<code>la migración</code>"]],
  "sin la migración no dice qué correr");

/* ---------- EN PANTALLA ---------- */
probar("la pestaña de al lado en un gris que no se lee",
  [[CSS, "  font: 600 14px var(--rl-titulo); color: var(--rl-tinta); text-decoration: none; white-space: nowrap;",
         "  font: 600 14px var(--rl-titulo); color: var(--rl-gris); text-decoration: none; white-space: nowrap;"]],
  "«pestaña de al lado» contrasta");
probar("los botones se encogen por debajo del dedo en el celular",
  [[CSS, "  .rl-inf-btn { min-height: 44px; flex: 1 1 auto }", "  .rl-inf-btn { min-height: 26px; flex: 1 1 auto; padding: 0 4px }"],
   [CSS, "  display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 12px;",
         "  display: inline-flex; align-items: center; justify-content: center; min-height: 26px; padding: 0 12px;"]],
  "botones");
probar("en el celular los botones no bajan y se salen de la pantalla",
  [[CSS, ".rl-inf-acc { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px }", ".rl-inf-acc { display: flex; flex-wrap: nowrap; gap: 6px; margin-top: 4px }"]],
  "quedan fuera de la pantalla");
probar("la vista previa se mete en el celular",
  [[CSS, "  .rl-inf-vista { display: none }\n", ""]],
  "la vista previa se mete en el celular");
probar("en pantalla grande no hay vista previa al lado",
  [[CSS, "  display: grid; grid-template-columns: minmax(300px, 420px) minmax(0, 1fr); gap: 16px; align-items: start;",
         "  display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start;"]],
  "no se ve la vista previa al lado");

restaurar();
console.log("");
if (fallos) { console.log(`${fallos} de ${total} no cazan lo que dicen cazar.`); process.exit(1) }
console.log(`Las ${total} se pusieron rojas. El arnés caza lo que dice cazar.`);
