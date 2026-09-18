/* =====================================================================
   LA BIFURCACIÓN DE QUIEBRA — tres submódulos, una tarjeta cada uno.

   Es la primera pantalla del módulo desde que Roturas se mudó aquí
   adentro. Se mide lo que de verdad puede salir mal en ella:

   1. QUE LAS TRES CIFRAS ESTÉN A LA MISMA ALTURA. Es el punto del
      `margin-top: auto`: las descripciones tienen largos distintos y si
      cada número quedara donde le tocara, las tres habría que buscarlas
      de una en una. Alineadas se leen de un barrido.

   2. QUE NADA SE SALGA de su tarjeta ni arrastre la página de lado. A
      360 px, con tres tarjetas, es donde revienta.

   3. QUE SE LEA EN LOS SIETE TEMAS. Y midiendo contra el fondo DE
      VERDAD: una tarjeta sin fondo propio deja ver el de atrás, y medir
      contra ella devuelve un contraste inventado. Ya me pasó esta
      semana — daba 1,3 para un texto perfectamente legible.

   4. QUE LAS TRES QUEPAN SIN BAJAR en una pantalla de escritorio. Si la
      tercera queda bajo el pliegue, la bifurcación tiene dos opciones
      visibles y una escondida, que es peor que no tenerla.
   ===================================================================== */
import { chromium } from "playwright";
import fs from "node:fs";

const css = fs.readFileSync("src/app/(app)/quiebra/quiebra.css", "utf8");
const glob = fs.readFileSync("src/app/globals.css", "utf8");
const TEMAS = ["oficial", "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const fallas = [];

const rama = (rot, nom, des, n, u, pie, mal) => `
<a class="rama"><span class="corte"></span><span class="rot">${rot}</span><span class="nom">${nom}</span>
<span class="des">${des}</span>
<span class="cifra-rama${mal ? " mal" : ""}"><b>${n}</b><i>${u}</i><em>${pie}</em></span>
<span class="entrar">Entrar <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 7l5 5-5 5"/></svg></span></a>`;

/* LAS TRES DESCRIPCIONES SON LAS DE VERDAD, con sus largos de verdad.
   Con tres textos del mismo tamaño, la alineación de las cifras saldría
   bien por casualidad y la prueba no probaría nada. */
const CUERPO = `<div class="qb">
<section class="cabeza-ramas"><div>
<p class="ojo">QUIEBRA · PÉRDIDA DE MATERIAL · CD38 AG01</p>
<h1>¿Qué vas a mirar?</h1>
<p class="sub">Tres cosas que se pierden y tres formas de medirlas: el envase se mide en <b>porcentaje</b> contra lo que se produjo, lo que se rompe en la bodega en <b>unidades</b>, y el vidrio que sale por la puerta en <b>kilos</b>. Ninguna pantalla suma dos de ellas, porque no existe el factor que convierta una en otra.</p>
</div></section>
<div class="ramas">
${rama("% CONTRA PRODUCCIÓN", "Envase", "El envase retornable que se da de baja, medido contra lo que se produjo. Contesta cómo vamos contra la meta del mes.", "1,42", "%", "de quiebra en agosto de 2026", false)}
${rama("UNIDADES", "En sitio", "Lo que se rompió en la bodega, contado por causa y por proceso. Contesta de quién fue y de dónde salió.", "9", "roturas", "esperando visto bueno · 2 sin la foto que exige su causa", true)}
${rama("KILOS", "Salida", "El vidrio que sale por la puerta, pesado en tolvas y firmado por tres personas. Contesta cuánto salió.", "3.276", "kg", "en 2 salidas abiertas · 1 esperando firma", true)}
</div></div>`;

const marco = (tema) => `<!doctype html><meta charset="utf-8"><style>${glob}
*{box-sizing:border-box}body{margin:0;background:var(--c-eef1f5,#EEF1F5);font:14px system-ui}
.marco{min-height:100vh;padding:18px}
${css}</style><div${tema && tema !== "oficial" ? ` data-tema="${tema}"` : ""}><div class="marco">${CUERPO}</div></div>`;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/* ---------- 1. GEOMETRÍA ---------- */
console.log("ancho    se arrastra  se sale  cifras alineadas  tarjetas por fila  las tres caben");
for (const [w, h, etiqueta] of [[1440, 900, "pc"], [1100, 900, "portátil"],
                                [820, 1180, "tableta"], [390, 844, "celular"], [360, 780, "360"]]) {
  const p = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.setContent(marco("oficial"));
  await p.waitForTimeout(200);

  const m = await p.evaluate(() => {
    const d = document.documentElement;
    const tarjetas = [...document.querySelectorAll(".rama")];

    /* Lo que se sale de SU tarjeta. `.corte` es la cuña decorativa y se
       sale a propósito —la tarjeta la recorta con overflow:hidden—, así
       que no cuenta. */
    let fuera = 0;
    for (const c of tarjetas) {
      const cb = c.getBoundingClientRect();
      for (const k of c.querySelectorAll("*")) {
        if (k.classList.contains("corte")) continue;
        const kb = k.getBoundingClientRect();
        if (kb.width > 0 && (kb.right > cb.right + 1 || kb.left < cb.left - 1 || kb.bottom > cb.bottom + 1)) fuera++;
      }
    }

    /* Las cifras, a la misma altura. Solo tiene sentido comparar entre
       tarjetas de la MISMA fila: apiladas en el celular, cada una está
       en su renglón y estar a distinta altura es lo correcto. */
    const filas = new Map();
    for (const c of tarjetas) {
      const y = Math.round(c.getBoundingClientRect().top);
      filas.set(y, [...(filas.get(y) ?? []), c]);
    }
    let desalineadas = 0;
    for (const grupo of filas.values()) {
      if (grupo.length < 2) continue;
      const ys = grupo.map((c) => Math.round(
        c.querySelector(".cifra-rama").getBoundingClientRect().top));
      if (Math.max(...ys) - Math.min(...ys) > 1) desalineadas++;
    }

    const porFila = Math.max(...[...filas.values()].map((g) => g.length));
    const ultima = tarjetas[tarjetas.length - 1].getBoundingClientRect();

    return {
      arrastra: d.scrollWidth - d.clientWidth,
      fuera, desalineadas, porFila,
      /* Cuánto sobresale la tercera tarjeta por debajo del pliegue. */
      pliegue: Math.round(ultima.bottom + window.scrollY - window.innerHeight),
    };
  });

  console.log(`${etiqueta.padEnd(8)} ${String(m.arrastra).padStart(11)}  ${String(m.fuera).padStart(7)}  `
    + `${(m.desalineadas === 0 ? "sí" : "NO").padStart(16)}  ${String(m.porFila).padStart(17)}  `
    + (m.pliegue <= 0 ? "sí" : `${m.pliegue} px por debajo`));

  if (m.arrastra > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.arrastra} px de lado`);
  if (m.fuera > 0) fallas.push(`${etiqueta}: ${m.fuera} cosa(s) se salen de su tarjeta`);
  if (m.desalineadas > 0)
    fallas.push(`${etiqueta}: las cifras de una misma fila no quedaron a la misma altura — `
      + "hay que buscarlas de una en una en vez de leerlas de un barrido");
  /* En el celular las tres van apiladas, y está bien. En escritorio
     tienen que caber las tres en una fila: una bifurcación con dos
     opciones a la vista y una escondida es peor que no tenerla. */
  if (etiqueta === "pc" && m.porFila !== 3)
    fallas.push(`en escritorio caben ${m.porFila} tarjeta(s) por fila y son tres submódulos`);
  if (etiqueta === "celular" && m.porFila !== 1)
    fallas.push(`en el celular quedan ${m.porFila} tarjetas por fila: no caben`);
  if (etiqueta === "pc" && m.pliegue > 0)
    fallas.push(`en escritorio la tercera tarjeta queda ${m.pliegue} px bajo el pliegue`);

  await p.screenshot({ path: `.arnes/qb-ramas-${etiqueta}.png`, fullPage: true });
  await p.close();
}

/* ---------- 2. CONTRASTE EN LOS SIETE TEMAS ---------- */
console.log("\ntema       rot    nom    des   cifra   pie   entrar");
for (const tema of TEMAS) {
  const p = await nav.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
  await p.setContent(marco(tema));
  await p.waitForTimeout(150);

  const r = await p.evaluate(() => {
    const leer = (s) => {
      const m = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
      if (m) return [1, 2, 3].map((i) => Number(m[i]) * 255);
      const n = s.match(/(\d+(?:\.\d+)?)/g) || [];
      return [0, 1, 2].map((i) => Number(n[i] || 0));
    };
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const razon = (a, b) => {
      const [A, B] = [lum(a), lum(b)].sort((x, y) => y - x);
      return Math.round(((A + 0.05) / (B + 0.05)) * 10) / 10;
    };

    /* EL FONDO DE VERDAD, subiendo por los padres hasta el primero que
       pinte algo. Un elemento sin fondo no es negro: deja ver el de
       atrás, y medir contra él da un contraste inventado. */
    const pinta = (n) => {
      const c = getComputedStyle(n).backgroundColor;
      return c && c !== "transparent" && !/rgba\([^)]*,\s*0\s*\)/.test(c);
    };
    const fondoDe = (el) => {
      let n = el;
      while (n && n !== document.documentElement && !pinta(n)) n = n.parentElement;
      return leer(getComputedStyle(n ?? document.body).backgroundColor);
    };

    const out = {};
    for (const [nom, sel] of [["rot", ".rama .rot"], ["nom", ".rama .nom"],
                              ["des", ".rama .des"], ["cifra", ".rama .cifra-rama b"],
                              ["pie", ".rama .cifra-rama em"], ["entrar", ".rama .entrar"]]) {
      const el = document.querySelector(sel);
      out[nom] = razon(leer(getComputedStyle(el).color), fondoDe(el));
    }
    return out;
  });

  /* 4,5 para texto normal; 3,0 para las cifras grandes, que es lo que
     dice la norma para texto de 24 px o más en negrita. */
  const MINIMO = { rot: 4.5, nom: 3, des: 4.5, cifra: 3, pie: 4.5, entrar: 4.5 };
  const mal = Object.entries(r).filter(([k, v]) => v < MINIMO[k]);
  console.log(tema.padEnd(9) + Object.values(r).map((v) => String(v).padStart(6) + " ").join("")
    + (mal.length ? "  MAL: " + mal.map(([k]) => k).join(",") : "  ok"));
  for (const [k, v] of mal)
    fallas.push(`tema ${tema}: «${k}» contrasta ${v} (mínimo ${MINIMO[k]})`);
  await p.close();
}

await nav.close();

console.log();
if (fallas.length) {
  for (const f of fallas) console.log("✗ " + f);
  process.exitCode = 1;
} else {
  console.log("✓ QUIEBRA · la bifurcación: se lee en los 7 temas, nada se sale a 1440/1100/820/390/360, "
    + "las tres cifras quedan a la misma altura y las tres tarjetas caben sin bajar.");
}
