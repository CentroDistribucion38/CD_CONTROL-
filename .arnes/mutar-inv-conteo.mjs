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

/* ---------- EL LADO ---------- */
probar("el lado no vuelve a ser una rueda",
  [[TSX, `<div className="fe-segmento" role="group" aria-labelledby="fe-rot-lado">
                {lados.map((l) => (
                  <button key={l} type="button" className={b.lado === l ? "on" : ""}
                          aria-pressed={b.lado === l}
                          onClick={() => pon("lado", l)}>{nombreLado(l)}</button>
                ))}
              </div>`,
         `<select value={b.lado} onChange={(e) => pon("lado", e.target.value)}>
                {lados.map((l) => <option key={l} value={l}>{nombreLado(l)}</option>)}
              </select>`]],
  "el lado volvió a ser un desplegable");

probar("los botones del lado salen de los lados que el módulo tiene",
  [[TSX, "{lados.map((l) => (", "{[\"IZQ\", \"DER\"].map((l) => ("]],
  "están escritos a mano");

probar("con un solo lado se enseña, no se pregunta",
  [[TSX, "            ) : lados.length === 1 ? (", "            ) : false ? ("]],
  "con un solo lado posible se sigue preguntando");

probar("el lado va en su propio renglón",
  [[TSX, '<div className="fe-lado-campo">', '<div className="fe-lado-metido">']],
  "no está el renglón propio del lado");

/* LA MUTACIÓN VA CON EL SELECTOR PEGADO Y NO SOLO CON LA DECLARACIÓN.
   La escribí con la línea del color a secas y pegó en `.fe-si-no
   button` —que tiene esa misma línea cuatrocientas antes— así que
   rompía el botón «No» y dejaba el lado intacto: verde por el motivo
   equivocado, que es la trampa de siempre. */
probar("el «1 lado» se lee sobre el panel",
  [[CSS, `.fe .fe-lado {
  display: flex; align-items: center; min-height: 48px; padding: 0 12px;
  background: var(--fe-fondo); border: 1.5px solid var(--fe-linea); border-radius: 2px;
  font: 700 15px var(--fe-titulo); color: var(--fe-gris-panel);
}`, `.fe .fe-lado {
  display: flex; align-items: center; min-height: 48px; padding: 0 12px;
  background: var(--fe-fondo); border: 1.5px solid var(--fe-linea); border-radius: 2px;
  font: 700 15px var(--fe-titulo); color: #C9CDD2;
}`]],
  "«unLado» contrasta");

/* ---------- LA OBSERVACIÓN ---------- */
probar("la observación se puede escribir",
  [[TSX, "<input value={b.nota} placeholder", "<input placeholder"]],
  "no hay dónde escribirla");

/* ---------- LO QUE SE PIDIÓ HOY ---------- */
probar("la calle no levanta el teclado del celular",
  [[TSX, '                teclado="ninguno"', '                teclado="texto"']],
  "vuelve a levantar el teclado");

probar("el módulo abre el teclado numérico",
  [[TSX, 'teclado="numerico"', 'teclado="texto"']],
  "ya no abre el teclado numérico");

probar("el módulo va sin la letra de la calle (o el numérico no podría teclearlo)",
  [[TSX, "texto: m.modulo,", "texto: `${m.calle}${m.modulo}`,"]],
  "volvió a llevar la letra de la calle");

probar("sin calle escogida, la calle va como pista para distinguir el 01 de A del de B",
  [[TSX, 'pista: b.calle === "" ? `Calle ${m.calle}` : null,', "pista: null,"]],
  "se verían iguales");

probar("no se frena el renglón por la rotación",
  [[TSX, "    /* DE «CÓMO ESTÁ» EN ADELANTE NO SE VALIDA NADA.",
          '    if (b.rot == null) return "Falta decir si rota.";\n    /* DE «CÓMO ESTÁ» EN ADELANTE NO SE VALIDA NADA.']],
  "volvió a frenar el renglón por la rotación");

probar("la rotación se manda resuelta y no nula",
  [[TSX, "p_rotacion: b.rot === true,", "p_rotacion: b.rot,"]],
  "se manda sin resolver");

probar("Avería y PNC miden lo mismo",
  [[CSS, ".fe .fe-marcas {\n  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));",
         ".fe .fe-marcas {\n  display: grid; grid-template-columns: 2fr 1fr;"]],
  "se pidieron del mismo tamaño");

probar("el cuadro marcado se rellena con el acento y no lo usa de letra",
  [[CSS, ".fe .fe-marca.on {\n  background: var(--fe-acento); border-color: var(--fe-acento); color: var(--fe-sobre);",
         ".fe .fe-marca.on {\n  background: var(--fe-papel); border-color: var(--fe-acento); color: var(--fe-acento);"]],
  "«siOn» contrasta");

probar("el estado del envase va debajo de las cantidades",
  [[TSX, '          <label className="fe-estado"><span>Estado del envase</span>',
          '          <label className="fe-estado zzz"><span>Estado del envase X</span>']],
  "Estado del envase");

restaurar();
console.log("");
if (fallos > 0) {
  console.log(`${fallos} aserción(es) no cazan lo que dicen cazar.`);
  process.exit(1);
}
console.log("Las 37 se pusieron rojas. El arnés caza lo que dice cazar.");
