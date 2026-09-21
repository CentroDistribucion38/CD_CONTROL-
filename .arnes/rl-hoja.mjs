/* =====================================================================
   LA HOJA DEL DÍA PARA FIRMAR — medida, no mirada.

   Se genera el PDF DE VERDAD, con el mismo jsPDF que usa el teléfono,
   y se LEE DE VUELTA con pdftotext. Lo que se comprueba es lo que dice
   el papel, no lo que el código cree que escribió: un total mal sumado
   se ve perfectamente normal en un PDF bonito.

   1. LAS CIFRAS. Que la hoja sume igual que el tablero: PALE-DEPA
      dentro de PASTEURIZADORA y CARGADOR dentro de SALIDA DE LAVADORA,
      sin perder ni una botella.
   2. EL PAPEL. Que diga el día, el total, cada línea, y que tenga los
      dos recuadros de firma con su espacio.
   3. LAS PÁGINAS. Que con un día largo la firma no quede partida ni
      separada de las observaciones, y que cada hoja diga «Página i de n».
   4. LO QUE NO SE VE: jsPDF se carga al tocar, se guarda antes de
      mandar, Guardar abre la ventana, se pregunta si el equipo sabe
      compartir archivos, y cerrar el menú no se cuenta como error.
   5. LOS COLORES DEL TEMA: con ámbar el papel pinta ámbar, sin tema la
      marca, y el logo sale idéntico en los dos.
   6. EN PANTALLA: la tarjeta y la ventana, en los siete temas.
   ===================================================================== */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { transformSync } from "esbuild";
import { jsPDF } from "jspdf";

const U = (p) => new URL(p, import.meta.url);
const ts = readFileSync(U("../src/modulos/rotlinea/hoja.ts"), "utf8");
const comp = readFileSync(U("../src/app/(app)/quiebra/rotura/HojaFirma.tsx"), "utf8");
const pag = readFileSync(U("../src/app/(app)/quiebra/rotura/page.tsx"), "utf8");
writeFileSync(U("./_hoja.mjs"), transformSync(ts, { loader: "ts", format: "esm" }).code);
const H = await import(U("./_hoja.mjs").href + "?v=" + Date.now());

const fallas = [];
const ok = (c, msg) => { if (!c) fallas.push(msg) };

/* LOS LOGOS DE VERDAD, los PNG de public/marca/, como los lee el
   teléfono. */
const png = (r) => "data:image/png;base64," + readFileSync(U(r)).toString("base64");
const MARCA = { palabra: png("../public/marca/logo-bavaria.png"), sello: png("../public/marca/logo-b.png") };

/* ---------------- EL MAESTRO, como está en la base ---------------- */
const MAQ = [
  { item: 9, nombre: "DESEMPACADORA", orden: 1 },
  { item: 12, nombre: "LAVADORA", orden: 3 },
  { item: 6, nombre: "SALIDA DE LAVADORA", orden: 4 },
  { item: 13, nombre: "PASTEURIZADORA", orden: 9 },
  { item: 10, nombre: "EMPACADORA", orden: 13 },
  { item: 66, nombre: "CARGADOR", orden: 14, suma_en: 6 },
  { item: 155, nombre: "PALE-DEPA", orden: 15, suma_en: 13 },
];
const LIN = [
  { linea: 1, tren: "TREN-1", centro_coste: "COBAAG3162", orden: 1 },
  { linea: 2, tren: "TREN-2", centro_coste: "COBAAG3163", orden: 2 },
  { linea: 4, tren: "TREN-4", centro_coste: "COBAAG3165", orden: 3 },
];
const f = (linea, turno, maquina, und, kg, envase = "3500005") =>
  ({ linea, turno, maquina, und, kg, envase, envase_nombre: envase === "3500005" ? "Envase Costeñita 175R" : "Envase Marron 330R" });

/* Cifras que no se confunden entre sí: si una suma sale bien por
   casualidad, sale con un número que delata de dónde vino. */
const FILAS = [
  f(1, 1, 13, 100, 17.7), f(1, 1, 155, 7, 1.2),       // PASTEURIZADORA A = 107
  f(1, 2, 6, 40, 7.1),    f(1, 2, 66, 3, 0.5),        // SALIDA DE LAVADORA B = 43
  f(1, 3, 12, 20, 3.5),                               // LAVADORA C = 20
  f(1, 1, 9, 5, 0.9, "3500162"),                      // DESEMPACADORA A = 5
  f(2, 1, 66, 900, 159.3),                            // línea 2: CARGADOR → SALIDA DE LAVADORA
];

/* ======================= 1 · LAS CIFRAS ======================= */
const hoja = H.armarHoja({ fecha: "2026-09-21", filas: FILAS, maquinas: MAQ, lineas: LIN,
  firmas: [{ linea: 1, turno: 1, firmado_nombre: "Génesis Visbal", firmado_en: "2026-09-21T13:05:00Z" }] });

const l1 = hoja.lineas.find((l) => l.linea === 1);
const fila = (l, nombre) => l?.filas.find((x) => x.nombre === nombre);

ok(fila(l1, "PASTEURIZADORA")?.turnos[0] === 107,
   `PASTEURIZADORA turno A da ${fila(l1, "PASTEURIZADORA")?.turnos[0]} y debe dar 107 = 100 + 7 de PALE-DEPA`);
ok(fila(l1, "SALIDA DE LAVADORA")?.turnos[1] === 43,
   `SALIDA DE LAVADORA turno B da ${fila(l1, "SALIDA DE LAVADORA")?.turnos[1]} y debe dar 43 = 40 + 3 de CARGADOR`);
ok(!hoja.lineas.some((l) => l.filas.some((x) => x.nombre === "PALE-DEPA" || x.nombre === "CARGADOR")),
   "la hoja enseña PALE-DEPA o CARGADOR aparte: el papel diría otra cosa que el tablero");
ok(fila(l1, "LAVADORA")?.turnos[2] === 20, "LAVADORA cambió y no tenía por qué");

/* NO SE PIERDE NI UNA BOTELLA. */
const anotado = FILAS.reduce((a, x) => a + x.und, 0);
ok(hoja.und === anotado, `la hoja suma ${hoja.und} y lo anotado son ${anotado}: juntar no puede restar`);
ok(l1.und[3] === 175 && l1.und[0] + l1.und[1] + l1.und[2] === l1.und[3],
   `los totales por turno de la línea 1 no cuadran: ${l1.und.join(", ")}`);
ok(Math.abs(hoja.kg - FILAS.reduce((a, x) => a + x.kg, 0)) < 1e-9, "los kilos del día no cuadran con lo anotado");

/* EN EL ORDEN DEL TREN, no en el orden en que se anotó. */
ok(l1.filas.map((x) => x.nombre).join("|") ===
   "DESEMPACADORA|LAVADORA|SALIDA DE LAVADORA|PASTEURIZADORA",
   `las máquinas no salen en el orden del tren: ${l1.filas.map((x) => x.nombre).join(", ")}`);

/* SOLO LAS LÍNEAS CON ALGO. Una hoja con líneas en cero es una hoja
   donde lo que importa hay que buscarlo. */
ok(hoja.lineas.map((l) => l.linea).join(",") === "1,2",
   `salen las líneas ${hoja.lineas.map((l) => l.linea).join(",")} y solo tuvieron rotura la 1 y la 2`);

/* POR ENVASE, el más roto primero. */
ok(hoja.envases[0]?.envase === "3500005" && hoja.envases[0].und === 1070,
   `el envase más roto debe ser 3500005 con 1.070 y sale ${hoja.envases[0]?.envase} con ${hoja.envases[0]?.und}`);

/* SIN LA MIGRACIÓN, NO REVIENTA: salen las máquinas por separado, que
   es lo que dice el tablero en ese momento. */
{
  const sinRegla = H.armarHoja({ fecha: "2026-09-21", filas: FILAS,
    maquinas: MAQ.map(({ suma_en, ...m }) => m), lineas: LIN });
  const l = sinRegla.lineas.find((x) => x.linea === 1);
  ok(fila(l, "PALE-DEPA")?.total === 7 && fila(l, "PASTEURIZADORA")?.total === 100,
     "sin la regla de sumar, la hoja no enseña cada máquina por separado como el tablero");
  ok(sinRegla.und === anotado, "sin la regla de sumar, la hoja pierde unidades");
}

/* ======================= 2 · EL PAPEL ======================= */
const leer = (doc, nombre) => {
  const ruta = `/tmp/claude-0/${nombre}.pdf`;
  writeFileSync(ruta, Buffer.from(doc.output("arraybuffer")));
  const paginas = execFileSync("pdftotext", ["-layout", ruta, "-"], { encoding: "utf8" }).split("\f");
  if (paginas.at(-1).trim() === "") paginas.pop();
  /* DÓNDE CAE CADA PALABRA, en puntos. Es lo que deja medir que nada se
     salga del margen: el texto de una línea que se sale del recuadro se
     lee igual en pdftotext, y solo se ve mirando dónde quedó. */
  const bbox = execFileSync("pdftotext", ["-bbox", ruta, "-"], { encoding: "utf8" });
  const palabras = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)]
    .map((m) => ({ x0: +m[1], x1: +m[2], t: m[3] }));
  return { ruta, paginas, palabras, todo: paginas.join("\n"), peso: statSync(ruta).size };
};
/* EL MARGEN, en puntos: 14 mm de cada lado en un A4 de 595,28 pt.
   Con 1,5 pt de holgura: lo que se alinea A LA DERECHA termina justo
   en el margen, y la caja que pdftotext le da a cada palabra incluye el
   aire lateral de la última letra —0,9 pt medidos—. Sin holgura, «TOTAL»
   y el centro de coste salían como desbordados estando bien; con ella,
   el renglón de observaciones que se salía —varios milímetros— sigue
   saliendo. */
const MARGEN_DER = 595.28 - 14 * 72 / 25.4 + 1.5;
const seSalen = (q) => q.palabras.filter((w) => w.x1 > MARGEN_DER).map((w) => w.t);

const doc = H.dibujarHoja(jsPDF, hoja, {
  elaboro: "Santiago Leal", supervisor: "", observaciones: "", generado: new Date("2026-09-21T15:30:00"),
  marca: MARCA,
});
const p = leer(doc, "rl-hoja");

ok(/Rotura en línea/.test(p.todo) && /Hoja del día ·/.test(p.todo), "el papel no dice qué es");
/* EL DÍA, Y EL DÍA CORRECTO. Sin la «T00:00:00» el 21 se lee en UTC y
   en Barranquilla sale domingo 20: un papel firmado con el día de al
   lado. La coma después del día de la semana la pone el formato del
   idioma, no se exige. */
ok(/Lunes,? 21 de septiembre de 2026/.test(p.todo), "el papel no dice el día, o se corrió por la zona horaria");
ok(/1\.075 unidades rotas/.test(p.todo), `el total del día no sale en el papel (debía decir 1.075)`);

/* LA FILA SE LEE ENTERA EN UN RENGLÓN: máquina y cifra juntas. */
ok(p.paginas[0].split("\n").some((r) => /PASTEURIZADORA\s+107\s+—\s+—\s+107/.test(r)),
   "la fila de PASTEURIZADORA no dice 107 en el turno A y en el total");
ok(!/PALE-DEPA|CARGADOR/.test(p.todo), "el papel nombra PALE-DEPA o CARGADOR, y el tablero ya no");
ok(/MÁQUINA/.test(p.todo) && /Línea 1 · TREN-1/.test(p.todo),
   "los acentos no salen bien en el PDF: el papel diría «MÃ\u0081QUINA»");

/* LAS DOS FIRMAS, con su espacio. */
ok(/ELABORÓ/.test(p.todo), "falta el recuadro de quien elaboró");
ok(/REVISÓ Y APRUEBA — SUPERVISOR/.test(p.todo), "falta el recuadro del supervisor");
ok((p.todo.match(/\bFirma\b/g) ?? []).length === 2, "no hay un espacio de firma en cada recuadro");
ok(/Santiago Leal/.test(p.todo), "el nombre de quien elaboró no sale en el papel");
ok(/OBSERVACIONES/.test(p.todo), "falta el recuadro de observaciones");
ok(/Cerrado en CONTROL: turno A por Génesis Visbal/.test(p.todo),
   "la firma que ya hay en la app no sale en el papel");

/* PESA POCO: se manda por WhatsApp con datos del celular.
   EL TOPE SUBIÓ CON LA MARCA, y medido, no supuesto:

       sin marca (antes)        15 KB
       + las cintas doradas     49 KB   ← unos 400 rectángulos angostos
       + los dos logos         108 KB   ← los PNG de public/marca/

   150 KB deja aire para un día largo de varias páginas. Pasar de ahí es
   que algo se está dibujando de más. (Sospeché que el sello se pegaba
   dos veces —como marca de agua y en la cabecera— y lo medí: jsPDF ya lo
   pega una sola vez aunque se le pida con dos nombres.) */
ok(p.peso < 150_000, `el PDF pesa ${Math.round(p.peso / 1024)} KB: algo se está dibujando de más`);

/* Y LLEVA LA MARCA: los dos logos, pegados UNA vez cada uno. */
{
  const crudo = readFileSync(p.ruta, "latin1");
  const imagenes = (crudo.match(/\/Subtype \/Image/g) ?? []).length;
  /* LOS DOS, Y NO UNO CUALQUIERA: se reconocen por su ancho —540 la
     palabra, 128 el sello—. Contar imágenes a secas no bastaba: con la
     palabra quitada seguía habiendo dos (el sello y su canal de
     transparencia) y la comprobación pasaba. */
  const anchos = [...crudo.matchAll(/\/Subtype \/Image[\s\S]{0,200}?\/Width (\d+)/g)].map((m) => +m[1]);
  ok(anchos.includes(540), "falta el logo de Bavaria con la palabra (540 px de ancho)");
  ok(anchos.includes(128), "falta el sello de Bavaria (128 px de ancho)");
  ok(imagenes >= 2, `el PDF lleva ${imagenes} imagen(es): faltan los logos de Bavaria`);

  /* LA MARCA DE AGUA, DETRÁS DE LAS CIFRAS. jsPDF pinta en el orden en
     que se le pide: si el sello grande —120 mm, 340 pt— se dibujara
     después, quedaría encima de los números. Se busca en el contenido de
     la página dónde se dibuja el sello y dónde se escribe la primera
     máquina, y el sello tiene que ir antes. */
  const agua = crudo.search(/340\.1\d* 0 0 340\.1\d* [\d.]+ [\d.]+ cm\s*\/I\w+ Do/);
  const cifras = crudo.indexOf("(DESEMPACADORA) Tj");
  ok(agua >= 0, "no se dibuja la marca de agua");
  ok(agua >= 0 && cifras >= 0 && agua < cifras,
     "la marca de agua se pinta después de las cifras: quedaría encima de los números");
}

/* ---- LA FIRMA CON EL DEDO, EN EL RECUADRO DE QUIEN ELABORÓ ----
   «Que ponga el nombre de quien elaboró y algo para la firma con el dedo.»
   Un PNG transparente de verdad —un trazo en diagonal, 300 × 90—, como el
   que entrega el lienzo: que salga en el papel, dentro del recuadro de
   ELABORÓ y no en el del supervisor, y que diga que se firmó en CONTROL. */
const pngFirma = (() => {
  const W = 300, Hh = 90, filas = [];
  for (let y = 0; y < Hh; y++) {
    const f = Buffer.alloc(1 + W * 4);
    for (let x = 0; x < W; x++) {
      const enTrazo = Math.abs(y - (10 + x * 70 / W) - 8 * Math.sin(x / 18)) < 3;
      if (enTrazo) f.set([18, 38, 58, 255], 1 + x * 4);
    }
    filas.push(f);
  }
  const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)) } return ~c >>> 0 };
  const trozo = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(Hh, 4); ih.set([8, 6, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ih),
    trozo("IDAT", deflateSync(Buffer.concat(filas))), trozo("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + png.toString("base64");
})();
{
  const conFirma = H.dibujarHoja(jsPDF, hoja, {
    elaboro: "Santiago Leal", supervisor: "", observaciones: "", generado: new Date("2026-09-21T15:30:00"),
    marca: MARCA, firmaElaboro: pngFirma,
  });
  const f = leer(conFirma, "rl-hoja-firma");
  const crudo = readFileSync(f.ruta, "latin1");
  const anchos = [...crudo.matchAll(/\/Subtype \/Image[\s\S]{0,200}?\/Width (\d+)/g)].map((m) => +m[1]);
  ok(anchos.includes(300), "la firma dibujada no sale en el PDF");
  ok(anchos.includes(540) && anchos.includes(128), "con la firma, se perdió un logo de la marca");
  ok((f.todo.match(/Firma \(digital, en CONTROL\)/g) ?? []).length === 1,
     "el recuadro de quien elaboró no dice que la firma es digital, o lo dice también el del supervisor");
  ok(/Fecha y hora: 21\/9\/2026/.test(f.todo), "la firma digital no lleva la fecha en que se firmó");
  ok((f.todo.match(/____:____/g) ?? []).length === 1, "el supervisor perdió su espacio para fecha y hora a mano");
  /* DENTRO DEL RECUADRO DE ELABORÓ: a la izquierda de la mitad de la hoja.
     La firma se pinta con `W 0 0 H x y cm` justo antes de su `Do`. */
  const puesta = [...crudo.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s*\/(I\w+) Do/g)]
    .map((m) => ({ w: +m[1], h: +m[2], x: +m[3], y: +m[4] }))
    .filter((q) => Math.abs(q.w / q.h - 300 / 90) < 0.01);
  ok(puesta.length === 1, `la firma se pinta ${puesta.length} veces (debía ser una)`);
  if (puesta[0]) {
    const mm = (v) => v * 25.4 / 72;
    ok(mm(puesta[0].x) >= 14 && mm(puesta[0].x + puesta[0].w) < 595.28 / 2 * 25.4 / 72,
       "la firma no cae dentro del recuadro de quien elaboró");
    ok(mm(puesta[0].h) <= 14.01 && mm(puesta[0].h) > 10,
       `la firma mide ${mm(puesta[0].h).toFixed(1)} mm de alto: se sale del hueco o sale diminuta`);
  }
  ok(f.peso < 160_000, `con la firma el PDF pesa ${Math.round(f.peso / 1024)} KB`);
  /* Y SI LA IMAGEN NO SIRVE, NO SE CAE LA HOJA: queda la raya para firmar a mano. */
  let rota = null;
  try { rota = H.dibujarHoja(jsPDF, hoja, { elaboro: "Santiago Leal", supervisor: "", observaciones: "",
    generado: new Date("2026-09-21T15:30:00"), marca: MARCA, firmaElaboro: "data:image/png;base64,AAAA" }) } catch { rota = null }
  ok(rota && !/digital, en CONTROL/.test(leer(rota, "rl-hoja-rota").todo),
     "con una firma que no se puede leer, la hoja no sale o dice que está firmada");
}

/* ======================= 3 · LAS PÁGINAS ======================= */
{
  /* UN DÍA LARGO: cuatro líneas, todas las máquinas, y observaciones.
     Así la hoja tiene que partirse, y es donde se ve si la firma queda
     separada de lo que firma. */
  const muchas = [];
  for (const l of [1, 2, 4]) for (const m of MAQ) for (const t of [1, 2, 3])
    muchas.push(f(l, t, m.item, 10 + l + t, 2));
  const maqs = [...MAQ, ...Array.from({ length: 10 }, (_, i) =>
    ({ item: 200 + i, nombre: `MÁQUINA DE PRUEBA ${i + 1}`, orden: 20 + i }))];
  for (const l of [1, 2, 4]) for (const m of maqs.slice(7)) muchas.push(f(l, 2, m.item, 5, 1));
  const larga = H.armarHoja({ fecha: "2026-09-21", filas: muchas, maquinas: maqs, lineas: LIN });
  const d = H.dibujarHoja(jsPDF, larga, {
    elaboro: "Santiago Leal", supervisor: "Génesis Visbal",
    observaciones: "Se cambió la guía de la pasteurizadora a media mañana. ".repeat(8),
    generado: new Date("2026-09-21T15:30:00"), marca: MARCA,
  });
  const q = leer(d, "rl-hoja-larga");
  const n = q.paginas.length;
  ok(n >= 2, `el día largo cupo en ${n} página: la prueba no midió nada sobre cómo se parte`);
  q.paginas.forEach((pg, i) =>
    ok(pg.includes(`Página ${i + 1} de ${n}`), `la página ${i + 1} no dice «Página ${i + 1} de ${n}»`));
  /* «ABAJO SOLO DEJA BAVARIA»: el pie de cada hoja dice Bavaria y ya.
     El centro de distribución lo dice la cabecera de la primera. */
  q.paginas.forEach((pg, i) =>
    ok(/\bBavaria\b/.test(pg) && !/Centro de distribución CD38/.test(pg),
       `el pie de la página ${i + 1} no dice solo «Bavaria»`));
  const ult = q.paginas[n - 1];
  ok(/OBSERVACIONES/.test(ult) && /ELABORÓ/.test(ult) && /SUPERVISOR/.test(ult),
     "las observaciones y las dos firmas no quedaron juntas en la última página");
  ok(q.paginas.slice(0, -1).every((pg) => !/ELABORÓ|SUPERVISOR/.test(pg)),
     "un recuadro de firma quedó en una página que no es la última");
  ok(/Génesis Visbal/.test(ult), "el nombre del supervisor no sale junto a su firma");
  ok(/guía de la pasteurizadora/.test(ult), "las observaciones no salen en el papel");

  /* NADA SE SALE DEL MARGEN. Las observaciones se medían con la letra
     de la tabla de envases y se escribían con otra más grande: cada
     renglón pasaba el borde del recuadro. pdftotext lo leía igual; solo
     se veía mirando el PDF. Ahora se mide dónde cae cada palabra. */
  const fuera = seSalen(q);
  ok(fuera.length === 0,
     `hay texto que se sale del margen derecho: «${fuera.slice(0, 4).join(" ")}»`);

  /* LA TABLA QUE SIGUE EN OTRA HOJA DICE DE QUÉ LÍNEA ES y repite los
     títulos. La hoja 2 empezaba con «MÁQUINA DE PRUEBA 9 — 5 — 5», sin
     decir de qué línea era ni qué turno cada columna. */
  q.paginas.slice(1).forEach((pg, i) => {
    /* SE SALTA LA CABECERA CHICA —«Rotura en línea / Hoja del día ·
       fecha»—, que va en todas las hojas desde que tienen la marca. Sin
       saltarla, el primer renglón siempre era ese y esta comprobación no
       podía ver una fila suelta aunque la hubiera. */
    const renglones = pg.split("\n").filter((r) => r.trim())
      .filter((r) => !/^\s*Rotura en línea\s*$/.test(r) && !/^\s*Hoja del día ·/.test(r));
    const primeras = renglones.slice(0, 3).join("\n");
    const empiezaConFila = /^\s*(DESEMPACADORA|LAVADORA|SALIDA DE LAVADORA|PASTEURIZADORA|EMPACADORA|MÁQUINA DE PRUEBA|Total)/m
      .test(primeras.split("\n")[0] ?? "");
    ok(!empiezaConFila,
       `la página ${i + 2} empieza con una fila suelta, sin decir de qué línea es: «${(primeras.split("\n")[0] ?? "").trim()}»`);
    if (/\(continúa\)/.test(primeras))
      ok(/MÁQUINA\s+TURNO A\s+TURNO B\s+TURNO C\s+TOTAL/.test(primeras),
         `la página ${i + 2} sigue una tabla sin repetir los títulos de las columnas`);
  });
  /* Y NINGUNA FILA SE PIERDE AL PARTIR: todas las máquinas de las tres
     líneas están en algún lado. */
  const filasEsperadas = larga.lineas.reduce((a, l) => a + l.filas.length, 0);
  const filasEnPapel = (q.todo.match(/^\s*(DESEMPACADORA|LAVADORA|SALIDA DE LAVADORA|PASTEURIZADORA|EMPACADORA|MÁQUINA DE PRUEBA \d+)\s+/gm) ?? []).length;
  ok(filasEnPapel === filasEsperadas,
     `al partir la hoja se perdieron filas: hay ${filasEsperadas} y en el papel salen ${filasEnPapel}`);
}

/* ---- EL BORDE: LA FIRMA NO SE PARTE, EN NINGÚN LARGO DE DÍA ----
   Un solo día largo no prueba nada sobre el borde: si al final de la
   hoja sobra sitio para las dos cosas, observaciones y firmas quedan
   juntas por suerte. La mutación que las separaba salió VERDE por eso.
   Aquí se barre el largo del día fila por fila, de modo que en alguna
   vuelta las observaciones caben justo y las firmas no. */
{
  let probados = 0, partidos = [];
  for (let extra = 0; extra <= 40; extra++) {
    const maqs = [...MAQ, ...Array.from({ length: extra }, (_, i) =>
      ({ item: 300 + i, nombre: `RELLENO ${i + 1}`, orden: 40 + i }))];
    const filas = [...FILAS, ...maqs.slice(7).map((m) => f(1, 2, m.item, 1, 0.2))];
    const h = H.armarHoja({ fecha: "2026-09-21", filas, maquinas: maqs, lineas: LIN });
    const d = H.dibujarHoja(jsPDF, h, {
      elaboro: "Santiago Leal", supervisor: "Génesis Visbal",
      observaciones: "Observación de prueba para ocupar sitio. ".repeat(4),
      generado: new Date("2026-09-21T15:30:00"), marca: MARCA,
    });
    const q = leer(d, "rl-hoja-borde");
    probados++;
    const pgObs = q.paginas.findIndex((pg) => /OBSERVACIONES/.test(pg));
    const pgEla = q.paginas.findIndex((pg) => /ELABORÓ/.test(pg));
    const pgSup = q.paginas.findIndex((pg) => /SUPERVISOR/.test(pg));
    if (!(pgObs === pgEla && pgEla === pgSup && pgSup === q.paginas.length - 1))
      partidos.push(`${extra} filas de más (observaciones en la ${pgObs + 1}, firmas en la ${pgEla + 1} y ${pgSup + 1}, de ${q.paginas.length})`);
  }
  ok(partidos.length === 0,
     `las firmas no quedaron juntas en la última página con las observaciones en ${partidos.length} de ${probados} largos de día: ${partidos.slice(0, 2).join("; ")}`);
}

/* ======================= 4 · LO QUE NO SE VE ======================= */
const rejilla = readFileSync(U("../src/app/(app)/quiebra/rotura/Rejilla.tsx"), "utf8");
const limpio = comp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
ok(!/^import .*jspdf/m.test(limpio) && /\bimport\("jspdf"\)/.test(limpio),
   "jsPDF se carga al abrir la pantalla: son 350 KB que quien solo registra no necesita");
ok(/navigator\.canShare\?\.\(\{ files: \[archivo\] \}\)/.test(limpio),
   "se intenta compartir sin preguntar si el equipo sabe compartir archivos: en un PC fallaría en vez de descargar");
ok(/if \(!\(e instanceof DOMException && e\.name === "AbortError"\)\) throw e;/.test(limpio),
   "cerrar el menú de compartir se cuenta como error");
ok(/doc\.save\(nombre\)/.test(limpio), "si no se puede compartir, no se descarga");
/* PRIMERO SE GUARDA, DESPUÉS SE MANDA: el menú de compartir se queda con
   la pantalla, y quien lo cierra puede irse antes de que se guarde. */
{
  const guarda = limpio.indexOf("await guardarEnHistorial(blob)");
  const manda = limpio.indexOf("navigator.share(");
  ok(guarda > 0 && manda > guarda, "la hoja se manda antes de guardarla: quien cierra el menú puede irse sin que quede");
}
/* «QUE GUARDE Y ME SALGA EL CUADRO»: Guardar pide la ventana en la
   dirección, y la ventana la lee. */
ok(/router\.replace\(`\?d=\$\{fecha\}&hoja=1`/.test(rejilla.replace(/\/\*[\s\S]*?\*\//g, "")),
   "Guardar en la rejilla no pide la ventana de la hoja");
ok(/abrir=\{q\.hoja === "1"\}/.test(pag), "la página no le pasa a la hoja que se acaba de guardar");
ok(/if \(abrir && !vacio && ventana\.current && !ventana\.current\.open\)/.test(limpio) &&
   /ventana\.current\.showModal\(\)/.test(limpio),
   "después de guardar no sale la ventana de generar la hoja");
{
  const rej = pag.indexOf("<Rejilla");
  const hj = pag.indexOf("<HojaFirma");
  ok(rej >= 0 && hj > rej,
     "la hoja para firmar no va después de la rejilla: se ofrecería el papel de un día sin llenar");
}
/* LA HOJA DEL DÍA ES LA ÚLTIMA QUE NO SE ANULÓ: una anulada no cuenta. */
ok(/const vigentes = hojas\.filter\(\(h\) => h\.anulada_en == null\);/.test(limpio) &&
   /const ultima = vigentes\[0\] \?\? null;/.test(limpio),
   "la tarjeta toma una hoja anulada como la hoja del día");
ok(/anuladaUltima\.anulada_motivo/.test(limpio), "la tarjeta no dice que la hoja del día se anuló, ni por qué");
/* SIN NOMBRE O SIN FIRMA NO SE GENERA: «que cuando uno vaya a guardar
   ponga el nombre de quien elaboró y la firma». */
ok(/const falta = !elaboro\.trim\(\) \? "[^"]+" : !firma \? "[^"]+" : null;/.test(limpio),
   "la hoja se puede generar sin nombre o sin firma de quien elaboró");
ok((limpio.match(/disabled=\{vacio \|\| haciendo \|\| !!falta\}/g) ?? []).length === 2,
   "algún botón de generar no se bloquea cuando falta el nombre o la firma");
ok(/firmaElaboro: firma \?\? undefined/.test(limpio), "la firma dibujada no llega al PDF");
ok(/<FirmaDedo alCambiar=\{setFirma\} \/>/.test(limpio), "la ventana no tiene dónde firmar");
{
  const campos = limpio.indexOf('className="rl-hoja-campos"'), fr = limpio.indexOf("<FirmaDedo"),
        pie = limpio.indexOf('className="rl-hoja-pie"');
  ok(campos > 0 && fr > campos && pie > fr, "la firma no va entre los campos y los botones: es lo último antes de generar");
}
/* LA FIRMA DEL TURNO SE QUITÓ DE LA REJILLA. */
ok(!/rl-firmar\b/.test(rejilla) && !/function firmar\(/.test(rejilla),
   "la rejilla todavía pide firmar el turno");
/* LOS COLORES DEL TEMA LLEGAN AL PAPEL. */
ok(/paleta: leerPaleta\(ventana\.current\)/.test(limpio), "el PDF no recibe los colores del tema de quien lo genera");
ok(["--c-04203f", "--c-marca", "--c-marca-hondo"].every((v) => limpio.includes(`leer("${v}")`)),
   "la hoja no lee las variables del tema: con otro tema saldría con otros colores");

/* ======================= 5 · LOS COLORES DEL TEMA EN EL PAPEL =======================
   «Si tengo ámbar o gris, todo varía; pero el logo debe permanecer
   normal.» Se genera la misma hoja con la marca y con ámbar y se leen los
   colores que el PDF de verdad pinta. */
{
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  ok(JSON.stringify(H.aRGB("rgb(35, 38, 44)")) === "[35,38,44]" &&
     JSON.stringify(H.aRGB("color(srgb 1 0.752941 0)")) === "[255,192,0]",
     "no se leen bien los colores que calcula el navegador (rgb y color(srgb))");
  const AMBAR = H.paletaDeTema(rgb("#23262c"), rgb("#ffc000"), rgb("#dda600"));
  /* CADA PIEZA POR SU FORMA, no «algún relleno de ese color»: la tinta
     pinta la banda del total Y los títulos de columna, y una banda que se
     quedara en azul pasaría escondida detrás de los títulos. */
  const pt = (mm) => mm * 72 / 25.4;
  const pinta = (paleta) => {
    const d = H.dibujarHoja(jsPDF, hoja, { elaboro: "Santiago", supervisor: "", observaciones: "",
      generado: new Date(2026, 8, 21, 15, 30), marca: MARCA, paleta });
    const txt = d.output();
    const piezas = [...txt.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg\n([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re/g)]
      .map((m) => ({ c: m.slice(1, 4).map(Number), x: +m[4], y: +m[5], w: +m[6], h: -m[7] }));
    const imgs = [...txt.matchAll(/\/Subtype \/Image[\s\S]*?stream\r?\n([\s\S]*?)endstream/g)].map((m) => m[1]).sort();
    const pieza = (w, h, x) => piezas.find((q) => Math.abs(q.w - pt(w)) < 0.1 && Math.abs(q.h - pt(h)) < 0.1 &&
                                                  (x == null || Math.abs(q.x - pt(x)) < 0.1))?.c ?? null;
    return {
      banda: pieza(182, 21), raya: pieza(3, 21), cuadrito: pieza(2.6, 2.6), titulos: pieza(182, 6.2),
      /* La primera franja de la cinta de arriba, pegada al borde. */
      cinta: piezas.find((q) => q.x === 0 && Math.abs(q.h - pt(4.5)) < 0.1)?.c ?? null,
      /* LA ÚLTIMA franja de la cinta de arriba, pegada al borde derecho, y
         si en el camino pasa por el acento: la misma forma de la cinta de
         la marca, con los colores del tema. */
      cintaFin: piezas.filter((q) => Math.abs(q.h - pt(4.5)) < 0.1).sort((a, b) => b.x - a.x)[0]?.c ?? null,
      cintaPorAcento: piezas.filter((q) => Math.abs(q.h - pt(4.5)) < 0.1)
        .some((q) => es(q.c, paleta ? paleta.acento : [236, 198, 68])),
      rojo: piezas.some((q) => es(q.c, [255, 0, 15])), imgs,
    };
  };
  const es = (c, e) => c != null && c.every((v, i) => Math.abs(v - e[i] / 255) < 0.006);
  const marcaP = pinta(undefined), ambar = pinta(AMBAR);
  ok(es(marcaP.banda, [18, 38, 58]) && es(marcaP.raya, [255, 0, 15]) && es(marcaP.cinta, [181, 135, 53]),
     "sin tema, la hoja no sale con la marca (azul, rojo y el dorado del aro)");
  ok(es(ambar.banda, [35, 38, 44]), "con ámbar, la banda del total no es la tinta del tema");
  ok(es(ambar.titulos, [35, 38, 44]), "con ámbar, los títulos de columna no son la tinta del tema");
  ok(es(ambar.raya, [255, 192, 0]), "con ámbar, la raya de la banda no es el acento del tema");
  ok(es(ambar.cuadrito, [255, 192, 0]), "con ámbar, el cuadrito de cada línea no es el acento del tema");
  ok(es(ambar.cinta, [221, 166, 0]), "con ámbar, la cinta no arranca del acento hondo del tema");
  ok(es(ambar.cintaFin, [35, 38, 44]) && ambar.cintaPorAcento,
     "con ámbar, la cinta no tiene la forma de la de la marca: del hondo al acento y del acento a la tinta");
  ok(!ambar.rojo, "con ámbar, la hoja todavía pinta el rojo de la marca en algún relleno");
  ok(ambar.imgs.length >= 2 && JSON.stringify(ambar.imgs) === JSON.stringify(marcaP.imgs),
     "el logo cambia con el tema: tiene que salir igual en todos");
}

/* ======================= 6 · EN PANTALLA =======================
   La tarjeta y la ventana, con las clases del componente: que se lean
   en los siete temas, que se toquen con el dedo, que la ventana quepa en
   un celular de 360 y que su cinta sea la del tema. */
{
  const { chromium } = await import("playwright");
  const css = readFileSync(U("../src/app/(app)/quiebra/rotura/rotura.css"), "utf8");
  const glob = readFileSync(U("../src/app/globals.css"), "utf8");
  const shell = readFileSync(U("../src/app/(app)/shell.css"), "utf8");
  const BLOQUE = `<div class="rl"><section class="rl-caja rl-hoja">
    <div class="rl-hoja-fila">
      <div class="rl-hoja-estado"><h2>Hoja del día para firmar</h2>
        <p class="rl-hoja-dice ojo">La última hoja (15:30) decía <b>1.070</b> unidades y el día ahora lleva <b>1.075</b>: cambió después. Genera otra.</p></div>
      <div class="rl-hoja-acciones">
        <a class="rl-hoja-no" href="#">Abrir la última</a>
        <button type="button" class="rl-hoja-si">Generar otra</button>
      </div>
    </div>
    <p class="rl-hoja-aviso" role="status">Listo: quedó guardada y se abrió para compartir.</p>
  </section>
  <dialog class="rl-ventana">
    <div class="rl-ventana-cab">
      <p class="rl-ventana-ojo">GUARDADO · HOJA DEL DÍA PARA FIRMAR</p>
      <h2>1.075 unidades<span> · 2 líneas</span></h2>
      <p class="rl-ventana-sub">Lunes, 21 de septiembre de 2026. Sale en PDF con estas cifras y el espacio para que el supervisor firme.</p>
    </div>
    <div class="rl-hoja-campos">
      <label><span>Elaboró</span><input value="Santiago Leal"></label>
      <label><span>Supervisor que firma</span><input placeholder="Opcional"></label>
      <label class="ancho"><span>Observaciones</span><textarea rows="3"></textarea></label>
    </div>
    <p class="rl-hoja-aviso mal" role="status">El PDF salió, pero no quedó en el historial.</p>
    <div class="rl-hoja-firma">
      <span class="rl-hoja-firma-rot">Firma de quien elaboró</span>
      <div class="rl-firma-dedo"><canvas></canvas>
        <span class="rl-firma-guia">Firma aquí con el dedo o el mouse</span>
        <button type="button" class="rl-firma-borrar">Borrar firma</button></div>
    </div>
    <div class="rl-hoja-pie">
      <p class="rl-hoja-falta" role="status">Falta la firma de quien elaboró para generar la hoja.</p>
      <button type="button" class="rl-hoja-si">Generar PDF y compartir</button>
      <button type="button" class="rl-hoja-no">Solo descargar</button>
      <button type="button" class="rl-hoja-luego">Ahora no</button>
    </div>
  </dialog></div>`;
  /* LAS CLASES DEL ARMAZÓN TIENEN QUE SER LAS DEL COMPONENTE: medir una
     que la pantalla no usa aprueba siempre y no mide nada. */
  const usadas = [...new Set([...BLOQUE.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))]
    .filter((c) => /^rl-(hoja|ventana|firma)/.test(c));
  const dedo = readFileSync(U("../src/app/(app)/quiebra/rotura/FirmaDedo.tsx"), "utf8");
  const huerfanas = usadas.filter((c) => !comp.includes(c) && !dedo.includes(c));
  ok(huerfanas.length === 0, `el armazón de la pantalla usa clases que el componente no tiene: ${huerfanas.join(", ")}`);

  const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0,0,0]).slice(0,3).map(Number);
                           return c.startsWith("color(") ? n.map((v) => v * 255) : n };
  const razon = (a, b) => {
    const lum = (c) => { const [r,g,bl] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4 });
                         return 0.2126*r + 0.7152*g + 0.0722*bl };
    const L1 = lum(a), L2 = lum(b);
    return +((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2);
  };
  /* LO QUE TAILWIND LE HACE A TODO ANTES DE NUESTRO CSS: `margin: 0` y
     `padding: 0`. Sin ponerlo aquí, la ventana salía centrada en la prueba
     y en la esquina en la app. */
  const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
  const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const pg = await nav.newPage();
  const monta = async (tema, ancho) => {
    await pg.setViewportSize({ width: ancho, height: 900 });
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}
      html,body{margin:0}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">${BLOQUE}</main></div></div></body></html>`);
    await pg.evaluate(() => document.querySelector("dialog").showModal());
  };
  for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
    await monta(t, 1200);
    const m = await pg.evaluate(() => {
      const fondo = (e) => {
        for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c }
        return "rgb(255, 255, 255)" };
      const par = (s) => { const e = document.querySelector(s); return { txt: getComputedStyle(e).color, fondo: fondo(e) } };
      return {
        "tarjeta · generar": par(".rl-hoja .rl-hoja-si"), "tarjeta · abrir la última": par(".rl-hoja .rl-hoja-no"),
        "tarjeta · lo que dice": par(".rl-hoja-dice"), "tarjeta · aviso": par(".rl-hoja > .rl-hoja-aviso"),
        "ventana · generar": par(".rl-ventana .rl-hoja-si"), "ventana · descargar": par(".rl-ventana .rl-hoja-no"),
        "ventana · ahora no": par(".rl-hoja-luego"), "ventana · rótulo": par(".rl-hoja-campos span"),
        "ventana · campo": par(".rl-hoja-campos input"), "ventana · título": par(".rl-ventana h2"),
        "ventana · aviso": par(".rl-ventana .rl-hoja-aviso"),
        "ventana · rótulo de la firma": par(".rl-hoja-firma-rot"), "ventana · guía de la firma": par(".rl-firma-guia"),
        "ventana · borrar firma": par(".rl-firma-borrar"), "ventana · lo que falta": par(".rl-hoja-falta"),
        cinta: getComputedStyle(document.querySelector(".rl-ventana-cab")).backgroundImage,
        marca: (() => { const t = document.createElement("span"); t.style.color = "var(--c-marca)";
                        document.querySelector(".sh").appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c })(),
      };
    });
    const { cinta, marca, ...pares } = m;
    for (const [k, v] of Object.entries(pares)) {
      const r = razon(v.txt, v.fondo);
      ok(r >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${r} (mínimo 4.5)`);
    }
    /* LA CINTA DE LA VENTANA: la de la marca sin tema; la del tema con tema. */
    if (t) ok(cinta.includes(marca), `tema ${t}: la cinta de la ventana no es la del tema (${cinta.slice(0, 80)})`);
    else ok(/rgb\(255, 0, 15\)/.test(cinta), "sin tema, la cinta de la ventana no es la de la marca");
    if (t) ok((cinta.match(/rgb\(|color\(/g) ?? []).length >= 3,
              `tema ${t}: la cinta de la ventana no tiene tres paradas como la de la marca`);
  }
  for (const ancho of [1920, 390, 360]) {
    await monta(null, ancho);
    const g = await pg.evaluate(() => {
      const v = document.querySelector(".rl-ventana").getBoundingClientRect();
      const alto = (s) => Math.min(...[...document.querySelectorAll(s)].map((e) => Math.round(e.getBoundingClientRect().height)));
      return {
        lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        /* Que la ventana quepa Y que lo de adentro quepa en la ventana:
           un <dialog> con tope de ancho no se sale, se desborda por dentro
           y el campo queda cortado. */
        /* EN EL CENTRO: lo mismo de aire a cada lado, y arriba y abajo. */
        centro: Math.abs(v.left - (innerWidth - v.right)) <= 2 && Math.abs(v.top - (innerHeight - v.bottom)) <= 2,
        ventana: v.left < 0 || v.right > innerWidth ||
          [...document.querySelectorAll(".rl-ventana input, .rl-ventana textarea, .rl-ventana button")]
            .some((e) => { const r = e.getBoundingClientRect(); return r.left < v.left - 0.5 || r.right > v.right + 0.5 }),
        boton: alto(".rl-hoja-si, .rl-hoja-no, .rl-hoja-luego"),
        campo: alto(".rl-hoja-campos input"),
        borrar: alto(".rl-firma-borrar"),
        lienzo: (() => { const c = document.querySelector(".rl-firma-dedo canvas"), r = c.getBoundingClientRect();
          return { alto: Math.round(r.height), ancho: Math.round(r.width), tocar: getComputedStyle(c).touchAction,
                   fondo: getComputedStyle(c).backgroundColor,
                   dentro: r.left >= v.left && r.right <= v.right } })(),
        guia: (() => { const g = document.querySelector(".rl-firma-guia").getBoundingClientRect(),
                             c = document.querySelector(".rl-firma-dedo canvas").getBoundingClientRect();
          return g.top >= c.top - 0.5 && g.bottom <= c.bottom + 0.5 })(),
      };
    });
    ok(g.lado <= 0, `${ancho} px: la hoja arrastra la página ${g.lado} px de lado`);
    ok(!g.ventana, `${ancho} px: la ventana de la hoja se sale de la pantalla`);
    ok(g.centro, `${ancho} px: la ventana de la hoja no sale en el centro de la pantalla`);
    ok(g.boton >= 44, `${ancho} px: el botón de generar mide ${g.boton} px (mínimo 44)`);
    ok(g.campo >= 44, `${ancho} px: los campos miden ${g.campo} px (mínimo 44)`);
    ok(g.borrar >= 44, `${ancho} px: «Borrar firma» mide ${g.borrar} px (mínimo 44)`);
    ok(g.lienzo.alto >= 140, `${ancho} px: el espacio para firmar mide ${g.lienzo.alto} px de alto: no cabe un dedo`);
    ok(g.lienzo.ancho >= 280 && g.lienzo.dentro, `${ancho} px: el espacio para firmar mide ${g.lienzo.ancho} px o se sale de la ventana`);
    ok(g.lienzo.tocar === "none", `${ancho} px: firmar con el dedo mueve la página (touch-action: ${g.lienzo.tocar})`);
    ok(g.lienzo.fondo === "rgb(255, 255, 255)", `${ancho} px: el papel de la firma no es blanco (${g.lienzo.fondo}): la tinta oscura no se vería`);
    ok(g.guia, `${ancho} px: la guía «firma aquí» no cae sobre el espacio para firmar`);
  }
  await nav.close();
}

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log(`✓ Hoja del día: suma igual que el tablero, el papel dice lo que dice la base, ` +
            `las firmas no se parten y pesa ${Math.round(p.peso / 1024)} KB.`);
