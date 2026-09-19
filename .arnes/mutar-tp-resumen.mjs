/* =====================================================================
   ¿DE VERDAD CAZA ALGO EL ARNÉS DEL RESUMEN DEL DÍA?

   Un arnés en verde no prueba nada por sí solo: prueba que no encontró
   lo que buscó, y buscar mal también sale verde. Aquí se le vuelve a
   meter CADA error que dice cazar y se exige que se ponga rojo POR SU
   PROPIA AFIRMACIÓN — no por la guardia de al lado, que en este
   proyecto ya dio cuatro falsos positivos.

     node .arnes/mutar-tp-resumen.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TSX = "src/app/(app)/traspasos/control/Diferencias.tsx";
const CSS = "src/app/(app)/traspasos/cruce/cruce.css";

const original = { [TSX]: readFileSync(TSX, "utf8"), [CSS]: readFileSync(CSS, "utf8") };
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);
/* Y TAMBIÉN SI A ESTO LO MATAN. `exit` no salta con SIGTERM ni con
   SIGINT, y la vez que pasó el árbol se quedó con una mutación puesta y
   la corrida siguiente la tomó por el original. */
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(s, () => { restaurar(); process.exit(130) });

let fallos = 0;

/** Rompe una cosa y exige un mensaje. `cambios` es [archivo, de, a]. */
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
    salida = execFileSync("node", [".arnes/tp-resumen.mjs"], { encoding: "utf8" });
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

/* ---------- LO QUE CONTESTA LA PANTALLA ---------- */

probar("la frase del día se queda sin denominador",
  [[TSX, "  const registrados = conDocumento.length + sinDocumento.length;",
         "  const registrados = sinDocumento.length;"]],
  "sin denominador");

probar("el montón de «en SAP y sin registrar» se pinta sin corte importado",
  [[TSX, `        {hayCorte && (
          <Monton
            cual="falta"`, `        {true && (
          <Monton
            cual="falta"`]],
  "se esconden sin corte");

probar("el montón de los viajes sin documento se esconde sin corte",
  [[TSX, `        <Monton
          cual="sindoc"`, `        {hayCorte && (
          <Monton
          cual="sindoc"`],
   [TSX, `          hijos={tablaViajes(sinDocumento, false)} />`,
          `          hijos={tablaViajes(sinDocumento, false)} />)}`]],
  "quedaría escondido");

probar("al entrar se abre siempre el primero y no el que tiene trabajo",
  [[TSX, `    faltan.length > 0 ? "falta"
      : sinDocumento.length > 0 ? "sindoc"
        : dedazos.length > 0 ? "dedazo" : null);`, `    "ok");`]],
  "no se abre el montón que tiene trabajo");

probar("los montones ya no se cierran",
  [[TSX, "setAbierto((x) => (x === cual ? null : cual))", "setAbierto(cual)"]],
  "no se cierran");

probar("«con documento» deja de partirse mirando el corte",
  [[TSX, `    () => (hayCorte ? conDocumento.filter((v) => enSap.has(v.documento ?? "")) : conDocumento),`,
          `    () => conDocumento,`]],
  "saldrían de dos cuentas distintas");

probar("el día cambiado desaparece del resumen",
  [[TSX, "for (const l of lineas) if (l.dia_distinto && l.documento) s.add(l.documento);",
         "for (const l of lineas) if (false && l.documento) s.add(l.documento);"]],
  "el día cambiado desapareció");

/* ---------- LO QUE SE MIDE EN PANTALLA ---------- */

probar("el resaltado de la frase vuelve a ser el acento de letra",
  [[CSS, `.tp .tp-rz-frase em {
  font-style: normal; padding: 0 9px;
  background: var(--tp-acento); color: var(--tp-sobre-acento);
}`, `.tp .tp-rz-frase em {
  font-style: normal; padding: 0 9px;
  color: var(--tp-acento);
}`]],
  "no es el acento de FONDO");

probar("la nota del montón vuelve al gris del papel sobre el fondo del panel",
  [[CSS, "  font-size: 12.5px; line-height: 1.55; color: var(--tp-gris-panel);",
          "  font-size: 12.5px; line-height: 1.55; color: var(--tp-gris);"]],
  "«nota» contrasta");

probar("la tapa del montón se encoge por debajo del dedo",
  [[CSS, "  gap: 18px; align-items: center; padding: 15px 18px; min-height: 64px;",
          "  gap: 18px; align-items: center; padding: 2px 18px; min-height: 0;"],
   [CSS, "  .tp .tp-rz-tapa { grid-template-columns: auto 1fr auto; gap: 12px; padding: 12px 13px }",
          "  .tp .tp-rz-tapa { grid-template-columns: auto 1fr auto; gap: 12px; padding: 2px 13px }"],
   [CSS, "  font-variant-numeric: tabular-nums; min-width: 52px; color: var(--tp-tinta);",
          "  font-variant-numeric: tabular-nums; min-width: 52px; color: var(--tp-tinta); font-size: 11px;"]],
  "de alto (mínimo 44");

probar("la cifra del montón se vuelve un dato más",
  [[CSS, "  font: 900 34px/1 var(--tp-titulo); letter-spacing: -.04em;",
          "  font: 900 18px/1 var(--tp-titulo); letter-spacing: -.04em;"],
   [CSS, "  .tp .tp-rz-tapa .n { font-size: 26px; min-width: 40px }",
          "  .tp .tp-rz-tapa .n { font-size: 18px; min-width: 40px }"]],
  "la cifra del montón se lee");

probar("la frase del día se encoge hasta no leerse de lejos",
  [[CSS, "  margin: 10px 0 0; font: 900 30px/1.25 var(--tp-titulo); letter-spacing: -.035em;",
          "  margin: 10px 0 0; font: 900 15px/1.25 var(--tp-titulo); letter-spacing: -.035em;"],
   [CSS, "  .tp .tp-rz-frase { font-size: 22px }", "  .tp .tp-rz-frase { font-size: 15px }"]],
  "la frase del día se lee a");

probar("la frase del día cae debajo de los montones",
  [[CSS, ".tp .tp-rz-ojo {", ".tp .tp-rz { display: flex; flex-direction: column-reverse }\n.tp .tp-rz-ojo {"]],
  "no va arriba de los montones");

probar("la tabla deja de rodar dentro de su caja y se lleva la página de lado",
  [[CSS, ".tp .cr-marco { overflow: auto; max-height: 62vh;",
          ".tp .cr-marco { overflow: visible; max-height: none;"]],
  "se sale de la caja del resumen");

/* ---------- Y QUE LO MEDIDO SEA LO QUE EXISTE ---------- */
probar("el armazón mide una clase que la pantalla ya no usa",
  [[TSX, 'className="tp-rz-frase"', 'className="tp-rz-titular"']],
  "usa clases que el componente no tiene");

restaurar();
console.log("");
if (fallos > 0) {
  console.log(`${fallos} aserción(es) no cazan lo que dicen cazar.`);
  process.exit(1);
}
console.log("Las 15 se pusieron rojas. El arnés caza lo que dice cazar.");
