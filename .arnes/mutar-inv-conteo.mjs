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
/* Y TAMBIÉN SI A ESTO LO MATAN. `exit` no salta con SIGTERM ni con
   SIGINT, y un arnés que tarda seis minutos se mata: la vez que pasó,
   el árbol se quedó con una mutación puesta y la siguiente corrida la
   tomó por el original. Lo cazó un `grep`, no el arnés. */
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(s, () => { restaurar(); process.exit(130) });

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
  [[TSX, "p_venc_dia: ent(bb.dia),", "p_venc_dia: null,"]],
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
  /* La forma cambió —ahora sale antes con `!== 2` en vez de entrar con
     `=== 2`— pero lo que se rompe es lo mismo: que el salto lo dispare
     lo TECLEADO en bruto y no lo que quedó dentro de la casilla. */
  [[TSX, "if (limpio.length !== 2) return;", "if (v.length !== 2) return;"]],
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
  [[TSX, 'p_saldo: bb.modo === "estibas" ? ent(bb.saldo) : null,',
         'p_saldo: bb.modo === "saldo" ? ent(bb.saldo) : null,']],
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
          '    if (bb.rot == null) return "Falta decir si rota.";\n    /* DE «CÓMO ESTÁ» EN ADELANTE NO SE VALIDA NADA.']],
  "volvió a frenar el renglón por la rotación");

probar("la rotación se manda resuelta y no nula",
  [[TSX, "p_rotacion: bb.rot === true,", "p_rotacion: bb.rot,"]],
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

probar("sin casilla siguiente el teclado se cierra",
  [[TSX, "    document.activeElement instanceof HTMLElement && document.activeElement.blur();",
          "    void 0;"]],
  "el teclado se queda abierto");

probar("al acabar el año el cursor pasa a la cantidad",
  [[TSX, 'tecleaFecha("anio", e.target.value, campoCantidad)',
          'tecleaFecha("anio", e.target.value)']],
  "anio→campoCantidad");

probar("la cantidad lleva la misma referencia en los dos modos",
  [[TSX, '<input ref={campoCantidad} inputMode="numeric" value={b.cajas}',
          '<input inputMode="numeric" value={b.cajas}']],
  "y van 2 —estibas y cajas—");

probar("el código y las cantidades encadenan con Enter",
  [[TSX, "  function saltaCon(", "  function saltaConQuitado("]],
  "no encadenan con Enter");

probar("el teclado se cierra DESPUÉS de intentar pasar a la siguiente",
  [[TSX, "    if (limpio.length !== 2) return;\n    if (siguiente?.current) {",
          "    if (limpio.length !== 2) return;\n    document.activeElement instanceof HTMLElement && document.activeElement.blur();\n    if (siguiente?.current) {"]],
  "se cerraría también al pasar de día a mes");

/* =====================================================================
   LA PRE-ANOTACIÓN D-1 Y EL LADO QUE FALTA

   Todo lo que sigue nació de una queja concreta: «coloco Calle A módulo
   01 y solo sale izquierdo, y no debe ser así», y de una idea suya:
   «podríamos hacer una pre-anotación D-1, para que solo confirmen si la
   posición sigue igual».

   Cada aserción de allá tiene aquí su error de vuelta.
   ===================================================================== */

/* EL BLOQUE ENTERO DE LAS TARJETAS, sacado del archivo y no escrito
   aquí: para mover algo de sitio hay que tener el texto exacto, y una
   copia a mano se queda vieja el día que se toque una línea. Si el
   recorte sale vacío, `probar` lo canta como «la mutación no aplica». */
const BLOQUE_PREVIO = (original[TSX].match(
  /        \{\/\* ================= LA PRE-ANOTACIÓN D-1[\s\S]*?\n        \)\}\n\n/) ?? [""])[0];
const ANCLA_CUANTO = "        {/* ============ 3 · CUÁNTO";

probar("los lados vuelven a salir de lo que el maestro tenga cargado",
  [[TSX, '    return ["IZQ", "DER"];', "    return delModulo.map((u) => u.lado ?? \"\");"]],
  "el lado derecho de un módulo a medias");

probar("a un módulo sin lados se le inventan izquierdo y derecho",
  [[TSX, 'delModulo.every((u) => (u.lado ?? "") === "")',
         'delModulo.every((u) => (u.lado ?? "") === "ZZZ")']],
  "se le inventan izquierdo y derecho");

probar("el lado que falta en el maestro ya no se da de alta",
  [[TSX, 'supabase.rpc("conteo_ubicacion_asegurar"', 'supabase.rpc("conteo_nada"']],
  "no tendría dónde guardar el renglón");

probar("el renglón corregido no va a la posición que se acaba de asegurar",
  [[TSX, 'p_linea: corrigiendo, ...argumentos(bb, mat, idU)',
         'p_linea: corrigiendo, ...argumentos(bb, mat, ubicacion!.id)']],
  "no se guarda en la posición que se acaba de asegurar");

probar("el renglón nuevo no va a la posición que se acaba de asegurar",
  [[TSX, 'p_conteo: conteo.id, ...argumentos(bb, mat, idU)',
         'p_conteo: conteo.id, ...argumentos(bb, mat, ubicacion!.id)']],
  "no se guarda en la posición que se acaba de asegurar");

probar("la pre-anotación deja de salir del último conteo de esa posición",
  [[TSX, 'from("v_conteo_ultimo_por_ubicacion")', 'from("v_conteo_fefo")']],
  "no sale de la vista del último conteo");

probar("la consulta que llega tarde pinta igual",
  [[TSX, "if (vivo) { setPrevio(", "if (true) { setPrevio("]],
  "quedaría en pantalla la pre-anotación del módulo anterior");

probar("«Sigue igual» se guarda por su propio camino",
  [[TSX, "  const confirmar = (pv: Previo) => guardar(desdePrevio(pv));",
         "  const confirmar = async (pv: Previo) => { await supabase.rpc(\"conteo_fefo_agregar\", { p_conteo: conteo!.id, p_sku: pv.codigo }) };"]],
  "no guarda por el mismo camino");

probar("dos sitios distintos agregan renglones",
  [[TSX, "      : await supabase.rpc(\"conteo_fefo_agregar\", { p_conteo: conteo.id",
         "      : await supabase.rpc(\"conteo_fefo_agregar\", { p_extra: \"conteo_fefo_agregar\", p_conteo: conteo.id"]],
  "hay más de un sitio que agrega renglones");

probar("el guardado lee el renglón que se está tecleando y no el que se le manda",
  [[TSX, "    const mal = revisar(bb);", "    const mal = revisar(b);"]],
  "confirmar una tarjeta guardaría otra cosa");

probar("las tarjetas se caen debajo del formulario",
  [[TSX, BLOQUE_PREVIO, ""], [TSX, ANCLA_CUANTO, BLOQUE_PREVIO + ANCLA_CUANTO]],
  "la pre-anotación no va entre «Dónde» y «Qué»");

probar("al escoger la posición se llenan solas las casillas",
  [[TSX, "      if (vivo) { setPrevio(",
         "      if (vivo) { setB((x) => x); setPrevio("]],
  "se llenan solas las casillas");

probar("una tarjeta ya contada hoy se puede volver a confirmar",
  [[TSX, "              const hecho = yaHoy(pv);", "              const hecho = false;"]],
  "renglón repetido");

probar("las tarjetas no se pueden quitar de un toque",
  [[TSX, "onClick={() => setVerPrevio(false)}", "onClick={() => setVerPrevio(true)}"]],
  "no se pueden quitar");

probar("«Cambió» guarda solo",
  [[TSX, "    setB(desdePrevio(pv));\n    /*", "    setB(desdePrevio(pv));\n    void guardar(desdePrevio(pv));\n    /*"]],
  "guardaría la cantidad de ayer");

probar("al editar una tarjeta el cursor cae antes de que exista la casilla",
  [[TSX, "    setEnfocarCantidad((n) => n + 1);", "    campoCantidad.current?.focus();"]],
  "el cursor no cae en la cantidad");

probar("la calle no recibe la referencia del cursor",
  [[TSX, "                campo={campoCalle}\n", ""]],
  "el cursor no puede volver ahí después de anotar");

probar("después de anotar el cursor no vuelve a la calle",
  [[TSX, "    campoCalle.current?.focus();\n  }", "    campoCodigo.current?.focus();\n  }"]],
  "el cursor no vuelve a la calle");

probar("anotar suelta la calle y el módulo",
  [[TSX, "      ? { ...VACIO, calle: x.calle, base: x.base, lado: x.lado }",
         "      ? { ...VACIO }"]],
  "habría que volver a escogerlos para cada renglón del mismo pasillo");

probar("el sitio se queda puesto también al corregir",
  [[TSX, "    limpiar(!corrigiendo);", "    limpiar(true);"]],
  "quedaría escogido un módulo que nadie tocó");

probar("al anotar deja de vaciarse el renglón",
  [[TSX, "      ? { ...VACIO, calle: x.calle, base: x.base, lado: x.lado }",
         "      ? { ...x, codigo: x.codigo }"]],
  "no se limpia el renglón ENTERO");

probar("los botones de la tarjeta se encogen por debajo del dedo",
  [[CSS, ".fe .fe-tarjeta-pie button {\n  flex: 1; min-height: 48px;",
         ".fe .fe-tarjeta-pie button {\n  flex: 1; min-height: 34px;"]],
  "los botones de la tarjeta miden");

probar("la cabecera de las tarjetas no deja sitio al botón de cerrar",
  [[CSS, "  gap: 10px; margin-bottom: 10px; flex-wrap: wrap;",
         "  gap: 10px; margin-bottom: 10px;"],
   [CSS, ".fe .fe-previo-cab .fe-mini { width: auto; margin-left: auto; flex: none }",
         ".fe .fe-previo-cab .fe-mini { margin-left: auto }"]],
  "la página se arrastra");

probar("el rótulo de las tarjetas se encoge hasta desaparecer",
  [[CSS, ".fe .fe-previo-cab .fe-mini { width: auto; margin-left: auto; flex: none }",
         ".fe .fe-previo-cab .fe-mini { width: auto; margin-left: auto; flex: none }\n" +
         ".fe .fe-previo-cab .fe-previo-rot { min-width: 0 }"],
   [CSS, "  gap: 10px; margin-bottom: 10px; flex-wrap: wrap;",
         "  gap: 10px; margin-bottom: 10px;"],
   [CSS, ".fe .fe-previo-cab .fe-mini { width: auto; margin-left: auto; flex: none }\n.fe .fe-previo-cab .fe-previo-rot { min-width: 0 }",
         ".fe .fe-previo-cab .fe-previo-rot { min-width: 0 }"]],
  "el rótulo de las tarjetas se recorta");

probar("la cantidad de la tarjeta se lee igual que el nombre del material",
  [[CSS, "  margin: 6px 0 0; font: 800 20px var(--fe-titulo);",
         "  margin: 6px 0 0; font: 500 14px var(--fe-titulo);"],
   /* Y TAMBIÉN EN EL CELULAR, que es donde se mide: la media query de
      abajo vuelve a fijar el tamaño y sin tocarla la mutación no
      cambiaba nada de lo medido —salió verde y por eso está aquí. */
   [CSS, "  .fe .fe-tarjeta-cifra { font-size: 19px }",
         "  .fe .fe-tarjeta-cifra { font-size: 14px }"]],
  "la cifra es lo que se compara con la estiba");

restaurar();
console.log("");
if (fallos > 0) {
  console.log(`${fallos} aserción(es) no cazan lo que dicen cazar.`);
  process.exit(1);
}
console.log("Las 67 se pusieron rojas. El arnés caza lo que dice cazar.");
