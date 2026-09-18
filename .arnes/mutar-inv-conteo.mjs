/* =====================================================================
   ¿DE VERDAD CAZA ALGO EL ARNÉS DE LA PLANTILLA DE CONTEO?

   Se rompe la pantalla a propósito, UNA COSA A LA VEZ, y se exige un
   mensaje CONCRETO. Una aserción que se pone roja por otro motivo no
   prueba nada de lo que dice probar — y eso ya pasó cuatro veces en este
   proyecto, siempre porque la guardia de al lado saltó primero.

   Aquí el arnés imprime TODAS las fallas, así que basta con buscar la
   suya entre ellas: si sale, esa aserción es la que cazó el error.

     node .arnes/mutar-inv-conteo.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TSX = "src/app/(app)/inventario/conteo/Contar.tsx";
const CSS = "src/app/(app)/inventario/fefo.css";

const original = { [TSX]: readFileSync(TSX, "utf8"), [CSS]: readFileSync(CSS, "utf8") };
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);

let fallos = 0;

/** Rompe una cosa y exige un mensaje. `cambios` es [archivo, de, a]. */
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
    salida = execFileSync("node", [".arnes/inv-conteo.mjs"], { encoding: "utf8" });
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

console.log("Rompiendo la plantilla de conteo a propósito, una cosa a la vez:\n");

/* ---------- LA BARRA QUE NO SE VA ---------- */
probar("la barra de anotar va pegada abajo",
  [[CSS, "  position: sticky; bottom: 0; z-index: 3;", "  position: static;"]],
  "no va pegada abajo");

/* EL ASESINO SILENCIOSO DE `sticky`: basta un `overflow` en cualquier
   ancestro para que deje de pegarse, sin error y sin aviso. El botón se
   va al final del documento y nadie lo nota hasta que hay que contar. */
probar("un `overflow` de más rompe la barra en silencio",
  [[CSS, ".fe .fe-donde, .fe .fe-anotar, .fe .fe-recorrido, .fe .fe-arranque {",
         ".fe .fe-anotar { overflow: hidden }\n.fe .fe-donde, .fe .fe-anotar, .fe .fe-recorrido, .fe .fe-arranque {"]],
  "px fuera de la ventana");

/* ---------- LO QUE SE TOCA ---------- */
probar("las casillas de la fecha miden 56",
  [[CSS, "  flex: 1; min-width: 0; min-height: 56px; text-align: center;",
         "  flex: 1; min-width: 0; min-height: 48px; text-align: center;"]],
  "las casillas de la fecha miden 48 px de alto");

probar("la casilla de las estibas mide 56",
  [[CSS, `.fe .fe-dos input {
  min-height: 56px;`, `.fe .fe-dos input {
  min-height: 44px;`]],
  "la casilla de las estibas mide 44 px");

/* ---------- SE LEE ---------- */
probar("el total vivo se lee sobre el panel",
  [[CSS, "  font-variant-numeric: tabular-nums; color: var(--fe-tinta);\n}\n.fe .fe-total b.ojo",
         "  font-variant-numeric: tabular-nums; color: #C9CDD2;\n}\n.fe .fe-total b.ojo"]],
  "«total» contrasta");

probar("«ya se pasó» se lee sobre el rosa",
  [[CSS, ".fe .fe-dias.mal .fe-dias-par em { color: #8A1020 }",
         ".fe .fe-dias.mal .fe-dias-par em { color: #E88A96 }"]],
  "«diasSalir» contrasta");

probar("«sale esta semana» se lee sobre el crema",
  [[CSS, ".fe .fe-dias.ojo .fe-dias-par em { color: #5E4100 }",
         ".fe .fe-dias.ojo .fe-dias-par em { color: #C9A227 }"]],
  "«diasVencer» contrasta");

/* ---------- EL ORDEN DE LA HOJA ---------- */
probar("los cuatro momentos van en el orden en que se mira una estiba",
  [[TSX, '<p className="fe-bloque-cab">Cuánto</p>', '<p className="fe-bloque-cab">Lo otro</p>']],
  "los momentos del renglón salen");

/* ---------- EL VENCIMIENTO ---------- */
probar("se manda el vencimiento que se teclea",
  [[TSX, "p_venc_dia: ent(b.dia),", "p_venc_dia: null,"]],
  "no manda el vencimiento que se teclea");

probar("no se manda además una fecha de fabricación",
  [[TSX, "p_fab_dia: null,", "p_fab_dia: ent(b.dia),"]],
  "sigue mandando una fecha de fabricación");

probar("al corregir se abre con el vencimiento que se tecleó",
  [[TSX, 'dia: String(r.venc_dia ?? ""),', 'dia: String(r.fab_dia ?? ""),']],
  "al corregir no se vuelve a abrir con el vencimiento");

probar("las dos cifras del FEFO se ven mientras se teclea",
  [[TSX, "const dias = useMemo", "const diasQuitado = useMemo"]],
  "no dice los días para salir y para vencer");

probar("los días para salir restan el mínimo T1",
  [[TSX, "salir: vencer - material.dias_minimo, minimo: material.dias_minimo",
         "salir: vencer, minimo: 0"]],
  "no restan el mínimo T1");

probar("no vuelve un campo de estado sin control que lo mueva",
  [[TSX, '  modo: Modo; estibas: string; saldo: string; cajas: string;',
         '  fecha: "vence"; modo: Modo; estibas: string; saldo: string; cajas: string;']],
  "volvió un campo de estado para escoger qué fecha es");

/* ---------- EL CURSOR PASA SOLO ---------- */
probar("las casillas están encadenadas DD → MM → AA",
  [[TSX, 'onChange={(e) => tecleaFecha("dia", e.target.value, campoMes)}',
         'onChange={(e) => tecleaFecha("dia", e.target.value, campoAnio)}']],
  "las casillas de la fecha están encadenadas");

probar("el retroceso devuelve a la casilla anterior",
  [[TSX, "onKeyDown={(e) => atrasFecha(e, b.mes, campoDia)}", ""]],
  "el retroceso va [");

probar("el salto se dispara por dos dígitos DENTRO, no por dos teclas",
  [[TSX, "if (limpio.length === 2 && siguiente?.current) {",
         "if (v.length === 2 && siguiente?.current) {"]],
  "no se dispara por tener dos dígitos dentro");

probar("al saltar se selecciona lo que ya había",
  [[TSX, "      siguiente.current.select();", ""]],
  "no se selecciona lo que ya había");

probar("la casilla se limpia a dos dígitos",
  [[TSX, 'const dosDigitos = (v: string) => v.replace(/\\D/g, "").slice(0, 2);',
         "const dosDigitos = (v: string) => v;"]],
  "no se limpia a dos dígitos");

/* ---------- LAS DOS FORMAS DE CONTAR ---------- */
probar("las estibas y el saldo viajan juntas",
  [[TSX, 'p_saldo: b.modo === "estibas" ? ent(b.saldo) : null,',
         'p_saldo: b.modo === "saldo" ? ent(b.saldo) : null,']],
  "no viajan juntas en el renglón de estibas");

probar("las tres cifras no vuelven a compartir una casilla",
  [[TSX, "  modo: Modo; estibas: string; saldo: string; cajas: string;",
         "  modo: Modo; estibas: string; saldo: string; cajas: string; cuantas: string;"]],
  "vuelven a compartir una sola casilla");

probar("el total se arma a la vista",
  [[TSX, "const cuenta = useMemo", "const cuentaQuitada = useMemo"]],
  "no se ve el total en cajas mientras se anota");

/* ---------- LA OBSERVACIÓN ---------- */
probar("la observación se puede escribir",
  [[TSX, "<input value={b.nota} placeholder", "<input placeholder"]],
  "no hay dónde escribirla");

restaurar();
console.log("");
if (fallos > 0) {
  console.log(`${fallos} aserción(es) no cazan lo que dicen cazar.`);
  process.exit(1);
}
console.log("Las 23 se pusieron rojas. El arnés caza lo que dice cazar.");
