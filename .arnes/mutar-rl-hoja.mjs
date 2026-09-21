/* =====================================================================
   ¿DE VERDAD CAZA ALGO EL ARNÉS DE LA HOJA PARA FIRMAR?

   Se le vuelve a meter CADA error que dice cazar —incluidos los dos que
   se vieron mirando el PDF y el arnés no cazaba— y se exige que se
   ponga rojo POR SU PROPIA AFIRMACIÓN.

     node .arnes/mutar-rl-hoja.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TS = "src/modulos/rotlinea/hoja.ts";
const COMP = "src/app/(app)/quiebra/rotura/HojaFirma.tsx";
const PAG = "src/app/(app)/quiebra/rotura/page.tsx";

const original = Object.fromEntries([TS, COMP, PAG].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(s, () => { restaurar(); process.exit(130) });

let fallos = 0;
function probar(nombre, cambios, espera) {
  restaurar();
  for (const [archivo, de, a] of cambios) {
    const antes = readFileSync(archivo, "utf8");
    /* `replace` NO AVISA cuando no encuentra nada. */
    if (!antes.includes(de)) {
      console.log(`  ROTA  ✘  ${nombre}  ← la mutación ya no aplica: no encontré el texto`);
      fallos++; return;
    }
    writeFileSync(archivo, antes.replace(de, a));
  }
  let salida;
  try {
    salida = execFileSync("node", [".arnes/rl-hoja.mjs"], { encoding: "utf8" });
  } catch (e) {
    salida = (e.stdout ?? "") + (e.stderr ?? "");
    if (salida.includes(espera)) { console.log(`  ROJA  ✔  ${nombre}`); return }
    console.log(`  OTRA  ✘  ${nombre}  ← se puso rojo, pero por otra cosa`);
    console.log(`           esperaba: «${espera}»`);
    for (const l of salida.split("\n").filter((l) => l.startsWith("✗") || /Error/.test(l)).slice(0, 2))
      console.log(`           salió:    ${l}`);
    fallos++; return;
  }
  console.log(`  VERDE ✘  ${nombre}  ← LA PRUEBA NO CAZA ESTO`);
  console.log(`           esperaba: «${espera}»`);
  fallos++;
}

console.log("");

/* ---------- LAS CIFRAS ---------- */
probar("la hoja deja de sumar PALE-DEPA dentro de PASTEURIZADORA",
  [[TS, "const destino = (item: number) => maq.get(maq.get(item)?.suma_en ?? item) ?? maq.get(item);",
        "const destino = (item: number) => maq.get(item);"]],
  "debe dar 107 = 100 + 7 de PALE-DEPA");

probar("la hoja pierde unidades al juntar",
  [[TS, "    fila.turnos[t] += und;\n    fila.total += und;",
        "    fila.turnos[t] = und;\n    fila.total += und;"]],
  "debe dar 107");

probar("el total del día se suma de otra cosa que las líneas",
  [[TS, "    und: lineas.reduce((a, l) => a + l.und[3], 0),",
        "    und: lineas.reduce((a, l) => a + l.und[0], 0),"]],
  "juntar no puede restar");

probar("las máquinas salen en el orden en que se anotaron",
  [[TS, "filas: [...porLinea.get(n)!.values()].sort((a, b) => ordenMaq(a.item) - ordenMaq(b.item)),",
        "filas: [...porLinea.get(n)!.values()],"]],
  "no salen en el orden del tren");

probar("el más roto no sale primero en envases",
  [[TS, "const envases = [...env.values()].sort((a, b) => b.und - a.und);",
        "const envases = [...env.values()].sort((a, b) => a.und - b.und);"]],
  "el envase más roto debe ser 3500005");

/* ---------- EL PAPEL ---------- */
probar("la fecha se corre un día por la zona horaria",
  [[TS, '  new Date(f + "T00:00:00").toLocaleDateString("es-CO",',
        '  new Date(f + "T00:00:00Z").toLocaleDateString("es-CO", { timeZone: "America/Bogota", ...'],
   [TS, '    { weekday: "long", day: "numeric", month: "long", year: "numeric" });',
        '    { weekday: "long", day: "numeric", month: "long", year: "numeric" } });']],
  "el papel no dice el día");

probar("el total del día deja de salir arriba",
  [[TS, "  const cifra = nf.format(hoja.und);", "  const cifra = \"\";"]],
  "el total del día no sale en el papel");

probar("falta el recuadro del supervisor",
  [[TS, '  firma(M + media + 8, "REVISÓ Y APRUEBA — SUPERVISOR", datos.supervisor.trim());', ""]],
  "falta el recuadro del supervisor");

probar("los recuadros quedan sin espacio de firma",
  [[TS, '    doc.text("Firma", x + 4, y + 33);', ""]],
  "no hay un espacio de firma en cada recuadro");

probar("la firma que ya hay en la app no sale en el papel",
  [[TS, "    if (l.firmas.length > 0) {", "    if (false) {"]],
  "la firma que ya hay en la app no sale");

/* ---------- LAS PÁGINAS ---------- */
probar("las firmas se parten de las observaciones al cambiar de hoja",
  [[TS, "  cabe(altoObs + ALTO_FIRMAS + 6);", "  cabe(altoObs);\n  const _fin = y; void _fin;"],
   [TS, "  y += altoObs + 6;\n", "  y += altoObs + 6;\n  cabe(ALTO_FIRMAS);\n"]],
  "no quedaron juntas en la última página con las observaciones en");

probar("las páginas dejan de decir «Página i de n»",
  [[TS, "    doc.text(`Página ${i} de ${n}`, W - M, PIE, { align: \"right\" });", ""]],
  "no dice «Página 1 de");

/* LOS DOS QUE SE VIERON MIRANDO EL PDF Y EL ARNÉS NO CAZABA. */
probar("las observaciones se miden con otra letra y se salen del recuadro",
  [[TS, "  fuente(\"normal\", 9.5);\n  const lineasObs", "  fuente(\"normal\", 7);\n  const lineasObs"]],
  "hay texto que se sale del margen derecho");

probar("la tabla que sigue en otra hoja no dice de qué línea es",
  [[TS, "    if (y + alto > TOPE) { hojaNueva(); encabezado(l, true) }",
        "    if (y + alto > TOPE) { hojaNueva() }"]],
  "empieza con una fila suelta");

/* ---------- LA MARCA ---------- */
probar("el logo con la palabra Bavaria no se pega",
  [[TS, '      doc.addImage(marca.palabra, "PNG", M, 11, ALTO_LOGO * 540 / 160, ALTO_LOGO, "palabra", "FAST");\n      conLogo = true;',
        '      conLogo = false;']],
  "falta el logo de Bavaria con la palabra");

probar("el sello de Bavaria no se pega",
  [[TS, '      doc.addImage(marca.sello, "PNG", (W - lado) / 2, 118, lado, lado, "sello", "FAST");', ""],
   [TS, '      try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ }', ""]],
  "falta el sello de Bavaria");

/* LA MARCA DE AGUA VA DETRÁS, no encima de las cifras: pintada al
   final de la hoja quedaría sobre los números. Se mide que el PDF la
   dibuje ANTES del texto de la tabla. */
probar("la marca de agua se pinta encima de las cifras",
  [[TS, "  aguaDeFondo();\n  cinta(0, 0, W, 4.5);", "  cinta(0, 0, W, 4.5);"],
   [TS, "  const n = doc.getNumberOfPages();", "  aguaDeFondo();\n  const n = doc.getNumberOfPages();"]],
  "la marca de agua se pinta después de las cifras");

/* ---------- LO QUE NO SE VE ---------- */
probar("jsPDF se carga al abrir la pantalla",
  [[COMP, 'import { useMemo, useState } from "react";',
          'import { useMemo, useState } from "react";\nimport { jsPDF as _J } from "jspdf";']],
  "son 350 KB que quien solo registra no necesita");

probar("se comparte sin preguntar si el equipo sabe",
  [[COMP, "navigator.canShare?.({ files: [archivo] })", "true"]],
  "sin preguntar si el equipo sabe compartir archivos");

probar("cerrar el menú de compartir se cuenta como error",
  [[COMP, '      if (e instanceof DOMException && e.name === "AbortError") return;\n', ""]],
  "cerrar el menú de compartir se cuenta como error");

probar("sin compartir, tampoco se descarga",
  [[COMP, "        doc.save(nombre);\n", ""]],
  "si no se puede compartir, no se descarga");

probar("la hoja se ofrece antes de la rejilla",
  [[PAG, "        <Rejilla fecha={fecha}", "        <HojaFirma fecha={fecha} filas={dia.filas} maquinas={m.maquinas} lineas={m.lineas} firmas={dia.firmas} elaboro={quien} />\n        <Rejilla fecha={fecha}"]],
  "no va después de la rejilla");

/* ---------- EN PANTALLA ---------- */
const CSS = "src/app/(app)/quiebra/rotura/rotura.css";
original[CSS] = readFileSync(CSS, "utf8");

probar("el botón de generar usa el acento de letra y no de fondo",
  [[CSS, "  flex: 1 1 260px; background: var(--rl-ojo); color: var(--rl-sobre);",
         "  flex: 1 1 260px; background: var(--rl-papel); color: var(--rl-ojo);"]],
  "«si» de la hoja contrasta");

probar("el botón de generar se encoge por debajo del dedo",
  [[CSS, ".rl-hoja-pie button {\n  min-height: 48px; padding: 0 18px;",
         ".rl-hoja-pie button {\n  min-height: 30px; padding: 0 18px;"]],
  "el botón de generar mide");

probar("en el celular los campos no bajan a una columna y arrastran la página",
  [[CSS, "  .rl-hoja-campos { grid-template-columns: 1fr }",
         "  .rl-hoja-campos { grid-template-columns: repeat(2, 260px) }"]],
  "la hoja arrastra la página");

restaurar();
console.log("");
if (fallos > 0) {
  console.log(`${fallos} aserción(es) no cazan lo que dicen cazar.`);
  process.exit(1);
}
console.log("Las 25 se pusieron rojas. El arnés caza lo que dice cazar.");
