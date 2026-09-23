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
const REJ = "src/app/(app)/quiebra/rotura/Rejilla.tsx";
const DEDO = "src/app/(app)/quiebra/rotura/FirmaDedo.tsx";
const CSS0 = "src/app/(app)/quiebra/rotura/rotura.css";

const original = Object.fromEntries([TS, COMP, PAG, REJ, DEDO, CSS0].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(s, () => { restaurar(); process.exit(130) });

let fallos = 0, total = 0;
function probar(nombre, cambios, espera, arnes = ".arnes/rl-hoja.mjs") {
  /* PARA TRABAJAR SIN ESPERAR LA CORRIDA ENTERA: con SOLO="firma" puesto
     solo se prueban las mutaciones cuyo nombre lleve esa palabra. Sin
     SOLO no cambia nada, para que una corrida normal siga siendo todas. */
  if (process.env.SOLO && !nombre.includes(process.env.SOLO)) return;
  total++;
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
    salida = execFileSync("node", [arnes], { encoding: "utf8" });
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

/* El rótulo del espacio de firma dejó de ser fijo: cuando la firma va
   dibujada dice «Firma (digital, en CONTROL)». Se quita el renglón
   entero, que es lo mismo que rompía antes: los recuadros se quedan sin
   dónde firmar. */
probar("los recuadros quedan sin espacio de firma",
  [[TS, '    doc.text(firmada ? "Firma (digital, en CONTROL)" : "Firma", x + 4, y + 33);', ""]],
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
  [[COMP, 'import { useEffect, useMemo, useRef, useState } from "react";',
          'import { useEffect, useMemo, useRef, useState } from "react";\nimport { jsPDF as _J } from "jspdf";']],
  "son 350 KB que quien solo registra no necesita");

probar("se comparte sin preguntar si el equipo sabe",
  [[COMP, "navigator.canShare?.({ files: [archivo] })", "true"]],
  "sin preguntar si el equipo sabe compartir archivos");

probar("cerrar el menú de compartir se cuenta como error",
  [[COMP, '          if (!(e instanceof DOMException && e.name === "AbortError")) throw e;', "          throw e;"]],
  "cerrar el menú de compartir se cuenta como error");

probar("sin compartir, tampoco se descarga",
  [[COMP, "        doc.save(nombre);\n", ""]],
  "si no se puede compartir, no se descarga");

probar("la hoja se ofrece antes de la rejilla",
  [[PAG, "        <Rejilla fecha={fecha}", "        <HojaFirma fecha={fecha} filas={dia.filas} maquinas={m.maquinas} lineas={m.lineas} firmas={dia.firmas} elaboro={quien} />\n        <Rejilla fecha={fecha}"]],
  "no va después de la rejilla");

/* ---------- GUARDAR Y SALE LA VENTANA ---------- */
probar("la hoja se manda antes de guardarla",
  [[COMP, "      const fallo = await guardarEnHistorial(blob);\n", ""],
   [COMP, "      if (fallo) {", "      const fallo = await guardarEnHistorial(blob);\n      if (fallo) {"]],
  "la hoja se manda antes de guardarla");

probar("Guardar en la rejilla ya no pide la ventana",
  [[REJ, "router.replace(`?d=${fecha}&hoja=1`", "router.replace(`?d=${fecha}`"]],
  "Guardar en la rejilla no pide la ventana");

probar("la página no le dice a la hoja que se acaba de guardar",
  [[PAG, 'abrir={q.hoja === "1"}', "abrir={false}"]],
  "la página no le pasa a la hoja que se acaba de guardar");

probar("la ventana no se abre sola después de guardar",
  [[COMP, "if (abrir && !vacio && ventana.current && !ventana.current.open) {", "if (false) {"]],
  "después de guardar no sale la ventana");

/* ---------- LAS ANULADAS ---------- */
probar("la tarjeta toma una anulada como la hoja del día",
  [[COMP, "  const ultima = vigentes[0] ?? null;", "  const ultima = hojas[0] ?? null;"]],
  "la tarjeta toma una hoja anulada");

probar("la tarjeta no dice que se anuló",
  [[COMP, "«{anuladaUltima.anulada_motivo}»", "«…»"]],
  "la tarjeta no dice que la hoja del día se anuló");

/* ---------- LOS COLORES DEL TEMA ---------- */
probar("el PDF no recibe los colores del tema",
  [[COMP, "        paleta: leerPaleta(ventana.current),\n", ""]],
  "el PDF no recibe los colores del tema");

probar("la hoja no lee el acento hondo del tema",
  [[COMP, 'hondo = leer("--c-marca-hondo")', 'hondo = leer("--c-marca")']],
  "la hoja no lee las variables del tema");

probar("la banda del total se queda en el azul de la marca",
  [[TS, "  doc.setFillColor(...TINTA);\n  doc.rect(M, y, ANCHO, ALTO_KPI, \"F\");",
        "  doc.setFillColor(18, 38, 58);\n  doc.rect(M, y, ANCHO, ALTO_KPI, \"F\");"]],
  "con ámbar, la banda del total no es la tinta del tema");

probar("los títulos de columna se quedan en el azul de la marca",
  [[TS, "    doc.setFillColor(...TINTA);\n    doc.rect(M, y, ANCHO, FILA, \"F\");",
        "    doc.setFillColor(18, 38, 58);\n    doc.rect(M, y, ANCHO, FILA, \"F\");"]],
  "con ámbar, los títulos de columna no son la tinta del tema");

probar("la raya de la banda se queda roja",
  [[TS, "  doc.setFillColor(...P.acento);\n  doc.rect(M, y, 3, ALTO_KPI, \"F\");",
        "  doc.setFillColor(255, 0, 15);\n  doc.rect(M, y, 3, ALTO_KPI, \"F\");"]],
  "con ámbar, la raya de la banda no es el acento del tema");

probar("el cuadrito de cada línea se queda rojo",
  [[TS, "    doc.setFillColor(...P.acento);\n    doc.rect(M, y + 1.2, 2.6, 2.6, \"F\");",
        "    doc.setFillColor(255, 0, 15);\n    doc.rect(M, y + 1.2, 2.6, 2.6, \"F\");"]],
  "con ámbar, el cuadrito de cada línea no es el acento del tema");

probar("la cinta se queda con los colores del aro",
  [[TS, "      const [ta, a] = P.cinta[k], [tb, b] = P.cinta[k + 1];",
        "      const C = PALETA_MARCA.cinta; while (k > C.length - 2) k--;\n      const [ta, a] = C[k], [tb, b] = C[k + 1];"]],
  "con ámbar, la cinta no arranca del acento hondo del tema");

probar("sin tema, la hoja pierde la marca",
  [[TS, "  const P = datos.paleta ?? PALETA_MARCA;",
        "  const P = datos.paleta ?? paletaDeTema([18, 38, 58], [228, 0, 43], [184, 0, 31]);"]],
  "sin tema, la hoja no sale con la marca");

probar("se lee mal un color que el navegador calculó con color-mix",
  [[TS, "map((v) => Math.round(v * 255)) as RGB", "map((v) => Math.round(v)) as RGB"]],
  "no se leen bien los colores que calcula el navegador");

/* ---------- EN PANTALLA ---------- */
const CSS = "src/app/(app)/quiebra/rotura/rotura.css";
original[CSS] = readFileSync(CSS, "utf8");

probar("el botón de generar usa el acento de letra y no de fondo",
  [[CSS, ".rl-hoja-si { background: var(--rl-ojo); color: var(--rl-sobre); border: 1.5px solid var(--rl-ojo) }",
         ".rl-hoja-si { background: var(--rl-papel); color: var(--rl-ojo); border: 1.5px solid var(--rl-ojo) }"]],
  "«ventana · generar» contrasta");

probar("el botón de generar se encoge por debajo del dedo",
  [[CSS, "min-height: 48px; padding: 0 18px;", "min-height: 30px; padding: 0 18px;"]],
  "el botón de generar mide");

probar("en el celular los campos no bajan a una columna y la ventana se sale",
  [[CSS, "  .rl-hoja-campos { grid-template-columns: 1fr }",
         "  .rl-hoja-campos { grid-template-columns: repeat(2, 260px) }"]],
  "se sale de la pantalla");

probar("el pie vuelve a decir el centro de distribución",
  [[TS, '    doc.text("Bavaria", W / 2, PIE, { align: "center" });',
        '    doc.text("Bavaria · Centro de distribución CD38", W / 2, PIE, { align: "center" });']],
  "no dice solo «Bavaria»");

/* ESTA SE QUEDA ROTA A PROPÓSITO, Y NO SE BORRA.
   No es que la mutación haya caducado: es que la pantalla YA ESTÁ ASÍ.
   `paletaDeTema` en src/modulos/rotlinea/hoja.ts devuelve hoy
   `cinta: [[0, acentoHondo], [1, acento]]` —dos paradas—, que es
   exactamente lo que esta mutación metía a propósito, y encima del
   propio comentario que explica por qué tienen que ser tres. El arnés lo
   dice en limpio, sin mutar nada: «con ámbar, la cinta no tiene la forma
   de la de la marca». O sea que el arnés SÍ caza esto; lo que falta es
   arreglar la pantalla, y eso no se toca desde aquí. Cuando la cinta
   vuelva a tener las tres paradas, esta mutación vuelve a aplicar sola. */
probar("la cinta del tema vuelve a dos paradas y sale casi lisa",
  [[TS, "cinta: [[0, acentoHondo], [0.35, acento], [1, tinta]] });", "cinta: [[0, acentoHondo], [1, acento]] });"]],
  "la cinta no tiene la forma de la de la marca");

probar("la cinta de la ventana vuelve a dos paradas",
  [[CSS, "var(--c-marca-hondo) 0%, var(--c-marca) 35%, var(--c-04203f) 100%)", "var(--c-marca-hondo) 0%, var(--c-marca) 100%)"]],
  "no tiene tres paradas");

probar("la ventana se va a la esquina con el margin: 0 de Tailwind",
  [[CSS, "  position: fixed; inset: 0; margin: auto; height: fit-content;\n", ""]],
  "no sale en el centro de la pantalla");

probar("la cinta de la ventana no cambia con el tema",
  [[CSS, "    linear-gradient(90deg, var(--c-marca-hondo) 0%, var(--c-marca) 35%, var(--c-04203f) 100%) top / 100% 5px no-repeat,",
         "    linear-gradient(90deg, #B58735 0%, #ECC644 35%, #FF000F 100%) top / 100% 5px no-repeat,"]],
  "la cinta de la ventana no es la del tema");

/* ---------- LA FIRMA CON EL DEDO ---------- */
const FIRMA = ".arnes/rl-firma.mjs";
probar("la firma dibujada no llega al PDF",
  [[TS, '  firma(M, "ELABORÓ", datos.elaboro.trim(), datos.firmaElaboro);', '  firma(M, "ELABORÓ", datos.elaboro.trim());']],
  "la firma dibujada no sale en el PDF");
probar("la firma cae en el recuadro del supervisor",
  [[TS, '  firma(M, "ELABORÓ", datos.elaboro.trim(), datos.firmaElaboro);\n  firma(M + media + 8, "REVISÓ Y APRUEBA — SUPERVISOR", datos.supervisor.trim());',
        '  firma(M, "ELABORÓ", datos.elaboro.trim());\n  firma(M + media + 8, "REVISÓ Y APRUEBA — SUPERVISOR", datos.supervisor.trim(), datos.firmaElaboro);']],
  "la firma no cae dentro del recuadro de quien elaboró");
probar("la firma se estira a todo el hueco y se sale",
  [[TS, "const altoMax = 14, anchoMax = media - 8;", "const altoMax = 22, anchoMax = media - 8;"]],
  "se sale del hueco o sale diminuta");
probar("la firma digital no lleva la fecha",
  [[TS, "      ? `Fecha y hora: ${datos.generado.toLocaleDateString(\"es-CO\")} ` +", "      ? `Fecha y hora: ` +"]],
  "la firma digital no lleva la fecha");
probar("una firma que no se lee tumba la hoja",
  [[TS, "      } catch { /* sin la imagen, se firma a mano */ }", "      } finally { /* sin la imagen, se firma a mano */ }"]],
  "con una firma que no se puede leer");
probar("se puede generar sin firma",
  [[COMP, ': !firma ? "Falta la firma de quien elaboró" : null;', ': null;']],
  "sin nombre o sin firma");
probar("«Solo descargar» no se bloquea sin firma",
  [[COMP, 'disabled={vacio || haciendo || !!falta}\n                  onClick={() => generar("descargar")}', 'disabled={vacio || haciendo}\n                  onClick={() => generar("descargar")}']],
  "algún botón de generar no se bloquea");
probar("la firma no se le pasa al PDF desde la ventana",
  [[COMP, "firmaElaboro: firma ?? undefined", "firmaElaboro: undefined"]],
  "la firma dibujada no llega al PDF");
probar("la rejilla vuelve a pedir firmar el turno",
  [[REJ, "export function Rejilla", "function firmar() {}\nexport function Rejilla"]],
  "la rejilla todavía pide firmar el turno");
probar("el espacio de firmar se encoge y no cabe un dedo",
  [[CSS0, "  display: block; width: 100%; height: 150px;", "  display: block; width: 100%; height: 80px;"]],
  "no cabe un dedo");
probar("el dedo mueve la página en vez de firmar (ventana)",
  [[CSS0, "  touch-action: none; cursor: crosshair;", "  cursor: crosshair;"]],
  "touch-action");
probar("el papel de la firma toma el fondo oscuro del tema",
  [[CSS0, "calc(100% - 40px) 1px no-repeat, #FFFFFF }", "calc(100% - 40px) 1px no-repeat, var(--rl-tinta) }"]],
  "el papel de la firma no es blanco");
probar("«Borrar firma» se encoge por debajo del dedo",
  [[CSS0, "  align-self: flex-end; min-height: 44px; padding: 0 12px;", "  align-self: flex-end; min-height: 24px; padding: 0 12px;"]],
  "«Borrar firma» mide");
/* Y EL COMPONENTE, EN EL NAVEGADOR. */
probar("la firma se manda con el lienzo entero, sin recortar",
  [[DEDO, "    if (c && hayYa.current) alCambiar(recortar(c));", "    if (c && hayYa.current) alCambiar(c.toDataURL(\"image/png\"));"]],
  "no se recortó al trazo", FIRMA);
probar("borrar no avisa que ya no hay firma",
  [[DEDO, "    marcar(false);\n    alCambiar(null);\n  }", "    marcar(false);\n  }"]],
  "«Borrar firma» no la quita", FIRMA);
probar("el lienzo se dibuja a resolución de pantalla y sale escalonado",
  [[DEDO, "const ESCALA = 2;", "const ESCALA = 1;"]],
  "doble de resolución", FIRMA);
probar("la firma trae fondo blanco pegado",
  [[DEDO, "  out.getContext(\"2d\")?.drawImage(", "  { const o = out.getContext(\"2d\"); if (o) { o.fillStyle = \"#fff\"; o.fillRect(0, 0, out.width, out.height) } }\n  out.getContext(\"2d\")?.drawImage("]],
  "la firma trae fondo", FIRMA);

restaurar();
console.log("");
if (fallos > 0) {
  console.log(`${fallos} aserción(es) no cazan lo que dicen cazar.`);
  process.exit(1);
}
console.log(`Las ${total} se pusieron rojas. El arnés caza lo que dice cazar.`);
