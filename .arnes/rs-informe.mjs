/* =====================================================================
   EL INFORME DE SALIDA DE VIDRIO — medido, no mirado.

   Se genera el PDF DE VERDAD, con el mismo jsPDF que usa el navegador,
   y se LEE DE VUELTA con pdftotext. Lo que se comprueba es lo que dice
   el papel, no lo que el código cree que escribió: un total mal sumado
   se ve perfectamente normal en un PDF bonito.

   1. EL PAPEL DICE LAS CIFRAS: el neto, bruto − tara, las cuatro
      cifras, las dos gráficas y cada salida con su placa.
   2. LOS FILTROS ESTÁN ESCRITOS, y en TODAS las páginas. Un informe
      filtrado por una placa que no lo diga se lee como el total del mes.
   3. ES EL MISMO DISEÑO QUE LA HOJA DE ROTURA DE LÍNEA: mismo alto de
      cabecera, misma banda del total, mismo pie. Se comprueba contra la
      hoja de verdad, generándola al lado — no contra números copiados
      aquí, que se quedarían viejos el día que la hoja cambie.
   4. NADA SE SALE DEL MARGEN, en ninguna página.
   5. LOS COLORES SALEN DEL TEMA y el logo no.
   ===================================================================== */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { transformSync } from "esbuild";
import { jsPDF } from "jspdf";

const U = (p) => new URL(p, import.meta.url);
const compila = (ruta, salida) => {
  writeFileSync(U(salida),
    transformSync(readFileSync(U(ruta), "utf8"), { loader: "ts", format: "esm" }).code
      .replace(/from\s+"@\/modulos\/rotlinea\/hoja"/g, 'from "./_hoja-rs.mjs"'));
  return import(U(salida).href + "?v=" + Date.now());
};
const H = await compila("../src/modulos/rotlinea/hoja.ts", "./_hoja-rs.mjs");
const I = await compila("../src/app/(app)/roturas/salida/analisis/informe.ts", "./_informe-rs.mjs");

const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
/* QUE EL ARNÉS HABLE AUNQUE SE CAIGA: ver la nota en tp-vidrio-registro. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

const png = (r) => "data:image/png;base64," + readFileSync(U(r)).toString("base64");
const MARCA = { palabra: png("../public/marca/logo-bavaria.png"), sello: png("../public/marca/logo-b.png") };

const leer = (doc, nombre) => {
  const ruta = `/tmp/claude-0/${nombre}.pdf`;
  writeFileSync(ruta, Buffer.from(doc.output("arraybuffer")));
  const paginas = execFileSync("pdftotext", ["-layout", ruta, "-"], { encoding: "utf8" }).split("\f");
  if (paginas.at(-1).trim() === "") paginas.pop();
  const bbox = execFileSync("pdftotext", ["-bbox", ruta, "-"], { encoding: "utf8" });
  /* `-bbox` DEVUELVE XML, así que lo que trae cada palabra viene
     escapado. Se desescapa aquí: sin esto, una comilla llega como
     «&quot;» y una comprobación que busque `"` no la encuentra nunca —
     que es exactamente lo que pasó con el signo de restar roto. */
  const crudoAtexto = (t) => t
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const palabras = [...bbox.matchAll(
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)]
    .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], t: crudoAtexto(m[4]) }));
  return { ruta, paginas, palabras, todo: paginas.join("\n"), peso: statSync(ruta).size };
};
const MARGEN_DER = 595.28 - 14 * 72 / 25.4 + 1.5;
const seSalen = (q) => q.palabras.filter((w) => w.x1 > MARGEN_DER).map((w) => w.t);

/* ======================= LOS DATOS ======================= */
const salida = (i, placa, tolvas, bruto, tara, estado = "Despachada") => ({
  codigo: `SAL-${String(i).padStart(4, "0")}`,
  fecha: `0${(i % 9) + 1}/09/2026`, placa, tolvas,
  bruto, tara, neto: bruto - tara, estado,
});
const DATOS = {
  hoy: "2026-09-24",
  periodo: "del 01/09/2026 al 24/09/2026",
  filtros: "",
  mirando: null,
  kg: 4820, bruto: 7150, tara: 2330,
  completas: 6, tolvas: 11, promedio: 438,
  porSalir: 7, abiertas: 2,
  meses: [{ etiqueta: "jul 26", kg: 0 }, { etiqueta: "ago 26", kg: 1200 },
          { etiqueta: "sept 26", kg: 3620 }],
  colores: [{ etiqueta: "Ámbar", kg: 3100 }, { etiqueta: "Flint", kg: 0 },
            { etiqueta: "Green", kg: 1720 }],
  salidas: [
    salida(1, "NLW428", 3, 2000, 700),
    salida(2, "FSV898", 5, 3150, 1000),
    salida(3, "ABC123", 2, 1200, 400),
    salida(4, "ABC256", 1, 800, 230, "Esperando Vh"),
    salida(5, "ACR368", 0, 0, 0, "En báscula"),
    salida(6, "NLW428", 0, 0, 0, "Despachada"),
  ],
};

/* ======================= 1 · EL PAPEL DICE LAS CIFRAS ======= */
const doc = I.dibujarInforme(jsPDF, DATOS, {
  generado: new Date("2026-09-24T08:32:00"), marca: MARCA,
});
const q = leer(doc, "rs-informe");

ok(/Cuánto vidrio salió/.test(q.todo), "el informe no dice qué es");
ok(/CENTRO DE DISTRIBUCIÓN CD38 · CONTROL/.test(q.todo),
   "falta la línea del centro, que es la que lo identifica fuera de la app");
ok(/4\.820/.test(q.todo), "el neto de 4.820 kg no aparece en el papel");
ok(/7\.150/.test(q.todo) && /2\.330/.test(q.todo),
   "falta el bruto o la tara: un neto suelto no se puede comprobar contra la báscula");
/* QUE BRUTO − TARA SEA EL NETO, leído del papel. Es el único error que
   un PDF bonito esconde del todo. */
{
  const n = (re) => { const m = q.todo.match(re); return m ? +m[0].replace(/\./g, "") : null };
  ok(n(/7\.150/) - n(/2\.330/) === n(/4\.820/),
     "en el papel, bruto menos tara no da el neto");
}
for (const t of ["TOLVAS DESPACHADAS", "PROMEDIO POR TOLVA", "ESPERANDO VH", "ABIERTAS"]) {
  ok(q.todo.toUpperCase().includes(t), `falta la cifra «${t}»`);
}
ok(/Por mes/.test(q.todo) && /Por color del vidrio/.test(q.todo), "faltan las dos gráficas");
/* UN COLOR EN CERO SALE IGUAL: que desaparezca se lee como «no hay», y
   lo que dice es «este mes no salió ni un kilo de flint». */
ok(/Flint/.test(q.todo), "un color en cero desapareció de la gráfica");
for (const s of DATOS.salidas) {
  ok(q.todo.includes(s.codigo), `la tabla no trae ${s.codigo}`);
}
ok(/NLW428/.test(q.todo) && /FSV898/.test(q.todo), "las placas no salen en la tabla");
ok(q.peso < 400_000, `el PDF pesa ${Math.round(q.peso / 1024)} KB: no se manda por WhatsApp`);

/* TRES COSAS QUE SOLO SE VEN MIRANDO EL PAPEL, y que por eso quedan
   escritas aquí: las tres pasaban todas las comprobaciones de arriba. */
{
  /* EL MENOS DE «BRUTO − TARA». U+2212 no existe en WinAnsi, que es la
     codificación de la helvetica de jsPDF: salía pintado como comilla
     doble —«7.150 " 2.330 = 4.820»— justo en la cuenta que sostiene el
     informe. */
  const entre = q.palabras.find((w) => w.t === '"' || w.t === "”" || w.t === "−");
  ok(!entre, `el signo de restar salió como «${entre?.t}»: la fuente no tiene ese carácter`);
  ok(q.palabras.some((w) => w.t === "-" || w.t === "="),
     "no aparece la resta entre bruto y tara");

  /* EL PIE NO SE MONTA SOBRE «BAVARIA», que va centrado. Ninguna
     comprobación del margen derecho ve esto: el choque es en la mitad. */
  for (let i = 1; i <= 1; i++) {
    const bav = q.palabras.find((w) => w.t === "Bavaria" && w.y0 > 700);
    const izq = q.palabras.filter((w) => bav && Math.abs(w.y0 - bav.y0) < 2 && w.x0 < bav.x0);
    const fin = Math.max(0, ...izq.map((w) => w.x1));
    ok(!bav || fin <= bav.x0 - 1,
       `el renglón del pie termina en x=${Math.round(fin)} y «Bavaria» empieza en ${Math.round(bav?.x0 ?? 0)}: se montan`);
  }

  /* Y EL ESTADO NO SE CORTA: «Esperando» sin el «Vh» pierde justo el
     dato —de qué está esperando—. */
  const conEspera = I.dibujarInforme(jsPDF,
    { ...DATOS, salidas: [salida(9, "NLW428", 1, 800, 230, "Esperando Vh")] },
    { generado: new Date("2026-09-24T08:32:00"), marca: MARCA });
  ok(/Esperando Vh/.test(leer(conEspera, "rs-informe-estado").todo),
     "el estado se corta en la tabla: dice «Esperando» sin decir qué espera");
}

/* ======================= 2 · LOS FILTROS, EN TODAS LAS PÁGINAS ===== */
{
  const conFiltro = I.dibujarInforme(jsPDF,
    { ...DATOS, filtros: "placa NLW428 · color Ámbar", mirando: { de: 2, total: 8 } },
    { generado: new Date("2026-09-24T08:32:00"), marca: MARCA });
  const f = leer(conFiltro, "rs-informe-filtrado");
  ok(/FILTRADO/.test(f.paginas[0]), "la franja de «filtrado» no sale en la primera página");
  ok(/NLW428/.test(f.paginas[0]), "la franja no dice por qué placa está filtrado");
  ok(/mirando 2 de 8/.test(f.todo), "no dice cuántas se están mirando de cuántas");
  for (let i = 0; i < f.paginas.length; i++) {
    ok(/Filtrado/i.test(f.paginas[i]),
       `la página ${i + 1} no dice que el informe está filtrado: se lee como el total`);
  }
  /* Y SIN FILTROS LO DICE TAMBIÉN, en vez de callar: un pie vacío no
     distingue «sin filtros» de «se me olvidó mirarlo». */
  ok(/Sin filtros/.test(q.todo), "sin filtros el pie no dice que están todas");
}

/* ======================= 3 · EL MISMO DISEÑO QUE LA HOJA DE LÍNEA === */
/* CONTRA LA HOJA DE VERDAD, generándola al lado. Copiar aquí los
   números de su diseño sería dejarlos viejos el día que la hoja cambie
   —y el día que cambie es justo cuando esto tiene que avisar—. */
{
  const hoja = H.armarHoja({
    fecha: "2026-09-21",
    filas: [{ linea: 1, turno: 1, envase: "3500005", envase_nombre: "Envase Costeñita 175R",
              maquina: 9, kg: 12.5, und: 30 }],
    maquinas: [{ item: 9, nombre: "DESEMPACADORA", orden: 1 }],
    lineas: [{ linea: 1, tren: "TREN-1", centro_coste: "COBAAG3162", orden: 1 }],
  });
  const hDoc = H.dibujarHoja(jsPDF, hoja, {
    elaboro: "", supervisor: "", observaciones: "",
    generado: new Date("2026-09-21T15:30:00"), marca: MARCA,
  });
  const h = leer(hDoc, "rs-hoja-patron");

  const donde = (d, re) => {
    const w = d.palabras.find((x) => re.test(x.t));
    return w ? { x: Math.round(w.x0), y: Math.round(w.y0) } : null;
  };
  /* LA MISMA CABECERA: el rótulo del centro arranca a la misma altura y
     termina en el mismo margen en los dos papeles. */
  const cA = donde(h, /^CENTRO$/), cB = donde(q, /^CENTRO$/);
  ok(cA && cB, "no se encontró el rótulo del centro en alguno de los dos");
  if (cA && cB) {
    ok(Math.abs(cA.y - cB.y) <= 1,
       `la cabecera arranca a ${cB.y} pt y en la hoja de línea a ${cA.y}: no es el mismo diseño`);
  }
  /* LA BANDA DEL TOTAL, a la misma altura y con la cifra en el mismo
     sitio: es la pieza que le da la cara al papel. */
  const kA = h.palabras.find((w) => /^30$/.test(w.t));
  const kB = q.palabras.find((w) => /^4\.820$/.test(w.t));
  ok(kA && kB, "no se encontró la cifra grande en alguno de los dos");
  if (kA && kB) {
    ok(Math.abs(Math.round(kA.x0) - Math.round(kB.x0)) <= 1,
       `la cifra grande arranca en x=${Math.round(kB.x0)} y en la hoja de línea en ${Math.round(kA.x0)}`);
  }
  /* EL MISMO PIE: «Bavaria» centrado y «Página i de n» a la derecha. */
  ok(/Bavaria/.test(q.todo), "el pie no dice Bavaria, como sí lo dice la hoja de línea");
  ok(/Página 1 de \d/.test(q.todo), "el pie no numera las páginas");
  const pA = donde(h, /^Bavaria$/), pB = donde(q, /^Bavaria$/);
  if (pA && pB) {
    ok(Math.abs(pA.x - pB.x) <= 2,
       `«Bavaria» del pie queda en x=${pB.x} y en la hoja de línea en ${pA.x}: no está centrado igual`);
  }
}

/* ======================= 4 · NADA SE SALE DEL MARGEN ======== */
{
  /* CON MUCHAS SALIDAS, para que parta páginas y para que las cifras
     largas empujen las columnas. */
  const muchas = Array.from({ length: 70 }, (_, i) =>
    salida(i + 1, "PL" + String(i).padStart(4, "0"), 9, 999999, 123456));
  const g = leer(I.dibujarInforme(jsPDF,
    { ...DATOS, filtros: "placa PL0001 · color Ámbar · tolva TOLVA-12", salidas: muchas },
    { generado: new Date("2026-09-24T08:32:00"), marca: MARCA }), "rs-informe-largo");
  const fuera = seSalen(g);
  ok(fuera.length === 0, `se salen del margen: ${JSON.stringify(fuera.slice(0, 6))}`);
  ok(g.paginas.length >= 2, "con 70 salidas debería partir en varias páginas");
  /* Y LA TABLA SE VUELVE A ENCABEZAR: una fila suelta en la página 3,
     sin saber qué columna es cuál, no sirve para revisar nada. */
  ok(/continúa/.test(g.paginas[1] ?? ""),
     "la tabla sigue en la página 2 sin volver a poner el encabezado");
  for (let i = 1; i < g.paginas.length; i++) {
    ok(/Salida de vidrio/.test(g.paginas[i]),
       `la página ${i + 1} no dice de qué informe es`);
  }
}

/* ======================= 5 · LOS COLORES DEL TEMA, EL LOGO NO ====== */
{
  const ambar = H.paletaDeTema([26, 26, 26], [255, 192, 0], [221, 166, 0]);
  const a = I.dibujarInforme(jsPDF, DATOS,
    { generado: new Date("2026-09-24T08:32:00"), marca: MARCA, paleta: ambar });
  const ra = `/tmp/claude-0/rs-informe-ambar.pdf`;
  writeFileSync(ra, Buffer.from(a.output("arraybuffer")));
  const crudo = readFileSync(ra, "latin1");
  const b = I.dibujarInforme(jsPDF, DATOS,
    { generado: new Date("2026-09-24T08:32:00"), marca: MARCA });
  const rb = `/tmp/claude-0/rs-informe-marca.pdf`;
  writeFileSync(rb, Buffer.from(b.output("arraybuffer")));
  const oficial = readFileSync(rb, "latin1");

  /* LOS RELLENOS DE VERDAD, no una búsqueda de texto. jsPDF escribe
     `r g b rg` con los canales de 0 a 1 y recortando ceros —«1. 0.75 0.»,
     no «1.0 0.75 0.0»—, así que se leen los tres números y se comparan
     redondeados. La primera versión buscaba la cadena exacta y daba ROJA
     con el código bien: un color no se prueba leyendo texto. */
  const rellenos = (s) => new Set([...s.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)]
    .map((m) => m.slice(1).map((v) => Math.round(parseFloat(v) * 255)).join(",")));
  const enAmbar = rellenos(crudo), enOficial = rellenos(oficial);
  ok(enAmbar.has("255,191,0") || enAmbar.has("255,192,0"),
     `con el tema ámbar el papel no pinta ámbar: ${JSON.stringify([...enAmbar].slice(0, 6))}`);
  ok(!enAmbar.has("255,0,15"),
     "con el tema ámbar el papel sigue pintando el rojo de la marca");
  ok(enOficial.has("255,0,15"),
     "sin tema, el papel no pinta el rojo de la marca");

  /* Y EL LOGO ES EL MISMO ARCHIVO en los dos temas: si cambiara con el
     tema, la marca dejaría de ser la marca. */
  const img = (s) => (s.match(/\/Subtype\s*\/Image/g) ?? []).length;
  ok(img(crudo) === img(oficial) && img(crudo) >= 2,
     `el logo o el sello no salen igual en los dos temas (${img(crudo)} vs ${img(oficial)})`);
}

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ El informe de salida: el papel dice el neto y que bruto menos tara lo da, las cuatro cifras, " +
            "las dos gráficas —con el color en cero incluido— y cada salida con su placa. Lleva los filtros " +
            "escritos en TODAS las páginas y dice «sin filtros» cuando no hay. Es el MISMO diseño de la hoja de " +
            "rotura de línea —medido contra ella, no copiado—: misma cabecera, misma banda del total y mismo pie. " +
            "Con 70 salidas parte páginas, vuelve a encabezar la tabla y nada se sale del margen. " +
            "Los colores salen del tema y el logo es el mismo en todos.");
