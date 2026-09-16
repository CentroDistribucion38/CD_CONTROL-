/* =====================================================================
   EL PARETO POR MÁQUINA, medido

   CON LAS CIFRAS DE VERDAD: las 13 máquinas y los 1.889.816 de 2026
   salen de Postgres, no de datos inventados. Un pareto de prueba con
   cuatro barras y nombres de tres letras se ve perfecto y esconde
   justo lo que rompe al de verdad: «PASTEURIZADORA - ETIQUETADORA»
   girada mide 190 píxeles y trece barras no caben donde caben cuatro.

   QUÉ SE COMPRUEBA, y por qué cada cosa:

   1. QUE LA CUENTA ESTÉ BIEN. El último punto de la curva tiene que dar
      100,0 %. Si el acumulado no cierra, el dibujo miente aunque se vea
      bien — y es la clase de error que nadie nota mirando.

   2. QUE NADA SE SALGA DEL LIENZO. Los nombres girados salen del área
      de las barras hacia abajo; si el viewBox no los cubre, el
      navegador los recorta sin avisar. Se mide la caja de cada texto
      contra el viewBox.

   3. QUE LOS NOMBRES NO SE PISEN ENTRE SÍ. Trece barras en mil
      unidades dan 76 de ancho por máquina; un rótulo girado ocupa su
      ALTURA en ese eje, no su largo. Se comprueba el espacio real.

   4. QUE LAS DOS CLASES DE BARRA SE DISTINGAN. La gracia del pareto es
      que las oscuras son las del 80 %: si el tono claro no se separa
      lo suficiente del oscuro, contar barras deja de funcionar y el
      dibujo pierde la mitad de lo que dice. En los siete temas.

   5. QUE LA CURVA SE VEA SOBRE LAS BARRAS. Va en tinta encima de
      rellenos del color del dato: hay que comprobar que contrasta con
      los dos, no solo con el papel.
   ===================================================================== */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BD = process.env.RLDB || "rl";
const css  = fs.readFileSync("src/app/(app)/quiebra/rotura/rotura.css", "utf8");
const glob = fs.readFileSync("src/app/globals.css", "utf8");
const TEMAS = ["oficial", "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [1440, 820, 390, 360];

const sql = (q) => JSON.parse(execSync(
  `sudo -u postgres psql -d ${BD} -tAc "select coalesce(json_agg(t),'[]') from (${q}) t"`,
  { encoding: "utf8", maxBuffer: 20e6 }).trim());

const MAQ = sql(`select m.nombre as rotulo, sum(r.und)::int as valor
  from public.rotlinea_registro r join public.rotlinea_maquinas m on m.item=r.maquina
  group by m.nombre order by 2 desc`);
if (MAQ.length < 5) { console.error("La base " + BD + " no tiene datos cargados."); process.exit(1) }
const TOT = MAQ.reduce((a, x) => a + x.valor, 0);
console.log(`${MAQ.length} máquinas · ${TOT.toLocaleString("es-CO")} unidades`);

/* La MISMA matemática del componente. Si se copia mal, la prueba
   aprueba un dibujo que no es el que sale en pantalla — así que se
   copia entera y a la vista. */
const W = 1000, ALTO = 300, IZQ = 4, DER = 4;
const masLargo = Math.max(...MAQ.map((d) => d.rotulo.length));
const PIE = Math.min(Math.max(90, Math.round(masLargo * 7.6) + 20), 300);
const H = ALTO + PIE;
const ancho = (W - IZQ - DER) / MAQ.length;
const barra = Math.min(ancho * 0.62, 58);
const tope = MAQ[0].valor;
let suma = 0;
const pasos = MAQ.map((d) => {
  suma += d.valor;
  return { ...d, acum: suma * 100 / TOT, pct: d.valor * 100 / TOT };
});
const cruce = pasos.findIndex((p) => p.acum >= 80);
const n80 = cruce === -1 ? MAQ.length : cruce + 1;
const x = (i) => IZQ + i * ancho + ancho / 2;
const yB = (v) => ALTO - (v / tope) * (ALTO - 18);
const yP = (p) => ALTO - (p / 100) * (ALTO - 18);
const curva = pasos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yP(p.acum).toFixed(1)}`).join("");

console.log(`${n80} de ${MAQ.length} máquinas hacen el 80 % · la primera pone ${pasos[0].pct.toFixed(1)} %`);

const svg = `<div class="rl-pareto"><svg viewBox="0 0 ${W} ${H}">
${[25, 50, 75, 100].map((p) => `<line x1="${IZQ}" x2="${W - DER}" y1="${yP(p)}" y2="${yP(p)}" class="rl-g-rejilla"/>`).join("")}
${pasos.map((p, i) => `<g><rect id="b${i}" x="${x(i) - barra / 2}" y="${yB(p.valor)}" width="${barra}" height="${ALTO - yB(p.valor)}" class="rl-p-barra${i < n80 ? "" : " cola"}"/>
<text id="r${i}" x="${x(i)}" y="${ALTO + 8}" class="rl-p-rotulo" transform="rotate(-90 ${x(i)} ${ALTO + 8})">${p.rotulo}</text></g>`).join("")}
<line x1="${IZQ}" x2="${W - DER}" y1="${yP(80)}" y2="${yP(80)}" class="rl-p-umbral"/>
<text x="${W - DER - 2}" y="${yP(80) - 6}" class="rl-p-umbral-txt" text-anchor="end">80 %</text>
<path d="${curva}" class="rl-p-forro"/><path id="curva" d="${curva}" class="rl-p-curva"/>
${pasos.map((p, i) => `<circle cx="${x(i)}" cy="${yP(p.acum)}" r="4" class="rl-p-punto"/>`).join("")}
</svg></div>`;

/* DOS FORMATOS, y la primera versión de este arnés se equivocó con el
   segundo. Chromium devuelve `rgb(230, 237, 244)` para un color normal,
   pero `color(srgb 0.86 0.69 0.71)` —de 0 a 1— para lo que salió de un
   color-mix(). Dividir eso entre 255 daba luminancias de casi cero, y
   el arnés reportó «no se distinguen» en los siete temas sobre un
   dibujo que estaba bien. Una prueba que falla sin razón es peor que no
   tenerla: enseña a ignorarla. */
const canales = (c) => {
  const n = c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const escala = c.startsWith("color(") ? 1 : 255;
  return n.map((v) => v / escala);
};
const lum = (c) => {
  const [r, g, b] = canales(c).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [p, q] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (p + 0.05) / (q + 0.05);
};

const fallas = [];

/* 1. La cuenta, antes de dibujar nada. */
const fin = pasos[pasos.length - 1].acum;
if (Math.abs(fin - 100) > 0.05) fallas.push(`el acumulado cierra en ${fin.toFixed(2)} % y no en 100`);
for (let i = 1; i < pasos.length; i++) {
  if (pasos[i].acum < pasos[i - 1].acum) fallas.push(`la curva baja entre ${i - 1} y ${i}: no es un acumulado`);
  if (pasos[i].valor > pasos[i - 1].valor) fallas.push(`las barras no están ordenadas en ${i}`);
}

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

for (const tema of TEMAS) {
  const pag = await navegador.newPage();
  await pag.setContent(`<!doctype html><html data-tema="${tema === "oficial" ? "" : tema}">
<head><meta charset="utf-8"><style>${glob}${css}
body{margin:0;background:#fff}.rl{padding:12px}</style></head>
<body><div class="rl">${svg}</div></body></html>`);

  for (const ancho of ANCHOS) {
    await pag.setViewportSize({ width: ancho, height: 900 });
    const r = await pag.evaluate((n) => {
      const svg = document.querySelector(".rl-pareto svg");
      const vb = svg.viewBox.baseVal;
      /* LA CAJA DE VERDAD, no getBBox().
         ------------------------------------------------------------
         getBBox() devuelve la caja del elemento en SU PROPIO sistema
         de coordenadas, ANTES del transform. Los rótulos van girados
         -90°, así que getBBox daba una caja horizontal de 190 de ancho
         y 12 de alto —la del texto sin girar— y la comprobación de
         «¿se sale por abajo?» miraba 12 donde en realidad había 190.
         Por eso el arnés dio todo verde sobre un dibujo en el que
         «SALIDA DE LAVADORA» salía como «LIDA DE LAVADORA».

         getBoundingClientRect() sí trae la caja ya girada, en píxeles
         de pantalla; se convierte a unidades del viewBox con la escala
         del svg y entonces sí se puede comparar contra él. */
      const svgCaja = svg.getBoundingClientRect();
      const esc = vb.width / svgCaja.width;
      const aVb = (el) => {
        const r = el.getBoundingClientRect();
        return { x: (r.left - svgCaja.left) * esc, y: (r.top - svgCaja.top) * esc,
                 width: r.width * esc, height: r.height * esc };
      };
      const cajas = [], rots = [];
      for (let i = 0; i < n; i++) {
        rots.push(aVb(document.getElementById("r" + i)));
        cajas.push(aVb(document.getElementById("b" + i)));
      }
      const e = (s) => getComputedStyle(document.querySelector(s));
      return {
        vb: { w: vb.width, h: vb.height },
        rots, cajas,
        /* ¿La caja del contenedor deja ver todo o corta? */
        caja: document.querySelector(".rl-pareto").getBoundingClientRect().width,
        anchoSvg: svg.getBoundingClientRect().width,
        barraCol: e(".rl-p-barra").fill,
        colaCol: e(".rl-p-barra.cola").fill,
        curvaCol: e(".rl-p-curva").stroke,
        forroCol: e(".rl-p-forro").stroke,
        papel: getComputedStyle(document.querySelector(".rl")).getPropertyValue("--rl-papel").trim() || "rgb(255,255,255)",
      };
    }, MAQ.length);

    const donde = `${tema} @${ancho}`;

    /* 2. Nada fuera del lienzo. */
    for (let i = 0; i < r.rots.length; i++) {
      const b = r.rots[i];
      if (b.y + b.height > r.vb.h + 0.5)
        fallas.push(`${donde}: el rótulo ${i} se sale ${(b.y + b.height - r.vb.h).toFixed(0)} por abajo`);
      if (b.x < -0.5 || b.x + b.width > r.vb.w + 0.5)
        fallas.push(`${donde}: el rótulo ${i} se sale de lado`);
    }

    /* 3. Los rótulos no se pisan. Girados, lo que ocupan en el eje
       horizontal es su ALTURA de línea, no su largo. */
    for (let i = 1; i < r.rots.length; i++) {
      const a = r.rots[i - 1], b = r.rots[i];
      if (a.x + a.width > b.x + 0.5)
        fallas.push(`${donde}: los rótulos ${i - 1} y ${i} se enciman`);
    }

    /* 3b. Y las barras tampoco. */
    for (let i = 1; i < r.cajas.length; i++) {
      if (r.cajas[i - 1].x + r.cajas[i - 1].width > r.cajas[i].x + 0.5)
        fallas.push(`${donde}: las barras ${i - 1} y ${i} se tocan`);
    }

    /* 4. Las dos clases de barra se distinguen. */
    const sep = contraste(r.barraCol, r.colaCol);
    if (sep < 1.6) fallas.push(`${donde}: la barra del 80 % y la cola casi no se distinguen (${sep.toFixed(2)})`);

    /* 5. LA CURVA SE VE SOBRE LO QUE SEA, gracias al forro. Se mide en
       dos saltos, que es como funciona: el forro tiene que separarse de
       la barra que hay debajo, y la tinta tiene que separarse del forro.
       Medir la tinta contra la barra directamente —como hacía la primera
       versión— ignora el forro y reporta un problema que ya no existe. */
    const forroSobreBarra = contraste(r.forroCol, r.barraCol);
    const tintaSobreForro = contraste(r.curvaCol, r.forroCol);
    if (forroSobreBarra < 2.2)
      fallas.push(`${donde}: el forro de la curva no se separa de la barra (${forroSobreBarra.toFixed(2)})`);
    if (tintaSobreForro < 3)
      fallas.push(`${donde}: la curva no se ve sobre su propio forro (${tintaSobreForro.toFixed(2)})`);

    if (ancho === 1440) {
      console.log(`${tema.padEnd(8)} barra/cola=${sep.toFixed(2)}  forro/barra=${forroSobreBarra.toFixed(2)}  curva/forro=${tintaSobreForro.toFixed(2)}`);
    }
  }
  await pag.close();
}
await navegador.close();

if (fallas.length) {
  console.error("\nFALLAS:\n" + [...new Set(fallas)].map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log(`\nListo: ${TEMAS.length * ANCHOS.length} combinaciones, el acumulado cierra en 100 %, nada se sale ni se encima.`);
