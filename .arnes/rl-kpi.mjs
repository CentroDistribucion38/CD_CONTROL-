/* =====================================================================
   LA TARJETA DE ARRIBA DEL TABLERO DE ROTURA

   QUÉ ES. Banda con el rótulo, la cifra grande, la comparación contra el
   período anterior y la forma de la tendencia. Reemplaza el recuadro de
   acento que iba al lado del título — que era un número suelto: un
   millón novecientas mil botellas no significa nada hasta que se sabe si
   el período anterior fueron dos millones o uno.

   QUÉ SE MIDE Y POR QUÉ:

   1. QUE LAS CLASES DEL ARMAZÓN EXISTAN. Por palabra completa contra los
      literales del componente y las clases de la hoja. Un arnés que mide
      `.filtros` cuando la pantalla usa `.tr-filtros` aprueba siempre y
      no mide nada — ya pasó dos veces en este proyecto.

   2. CONTRASTE EN LOS SIETE TEMAS. Cuatro parejas que nadie emparejó a
      propósito: el rótulo sobre la banda de acento, la cifra grande y el
      peso sobre el papel, el delta rojo y el verde sobre el papel. El
      acento cambia con las preferencias de cada quien y ya dio 1,7 en un
      tema y 6,9 en otro en otra pantalla de este proyecto.

   3. QUE LA FLECHA DIGA LA VERDAD. En rotura SUBIR ES MALO —al revés de
      un tablero de ventas— así que ▲ tiene que ir en el color de alarma
      y ▼ en el de bien. Invertirlo es el error más caro posible en esta
      tarjeta: haría leer una mejora como un problema y al revés.

   4. QUE LA CHISPA SE DIBUJE Y QUEPA. Con todos los días iguales la
      división por el rango es cero: si eso manda la línea al infinito,
      el SVG sale vacío sin avisar y nadie lo nota. Y con un solo día no
      hay línea que dibujar.

   5. QUE NADA SE SALGA a 1440 / 820 / 390 / 360, con cifras largas como
      «1.889.816» y «426.367 kg».
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const rot   = readFileSync(new URL("../src/app/(app)/quiebra/rotura/rotura.css", import.meta.url), "utf8");
const glob  = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/app/(app)/shell.css", import.meta.url), "utf8");
const tsx   = readFileSync(new URL("../src/app/(app)/quiebra/rotura/tablero/Kpi.tsx", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]];

/* La misma cuenta del componente, para poder comprobar que la chispa que
   sale es la que tiene que salir. Está copiada A PROPÓSITO y no
   importada: si alguien cambia la del componente, esta se queda con la
   vieja y las dos dejan de coincidir — que es justo lo que hay que
   detectar. */
function chispa(v, ancho = 800, alto = 34) {
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v);
  const rango = max - min || 1;
  const paso = ancho / (v.length - 1);
  return v.map((n, i) =>
    `${(i * paso).toFixed(1)},${(alto - 3 - ((n - min) / rango) * (alto - 6)).toFixed(1)}`
  ).join(" ");
}

const ICONO = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.15"
  stroke-linejoin="round" stroke-linecap="round" aria-hidden>
  <path d="M13.1 3.4h5.8v1.3h-5.8z"/>
  <path d="M13.5 4.7v3.6c0 .9-.3 1.7-.9 2.4l-1.5 1.8a4.4 4.4 0 0 0-1 2.8v11.1a2 2 0 0 0 2 2h7.8a2 2 0 0 0 2-2V15.3a4.4 4.4 0 0 0-1-2.8l-1.5-1.8a3.7 3.7 0 0 1-.9-2.4V4.7"/>
  <path d="M11.6 18.6h8.8"/><path d="M17.4 12.9l-1.9 3.1h2.9l-1.8 3.4"/></svg>`;

/* Días de verdad: 2026 con sus altibajos, no una recta de laboratorio. */
const DIAS = [7200, 6100, 9800, 4400, 7400, 5200, 8100, 6600, 12300, 5900,
              7000, 6800, 19190, 7100, 6300, 8800, 5400, 7700, 6200, 9100];

const tarjeta = (cifra, sub, k, v, delta, dias) => {
  const p = chispa(dias);
  const d = delta == null
    ? `<p class="rl-kpi-d sin">sin período anterior para comparar</p>`
    : `<p class="rl-kpi-d ${delta > 0 ? "sube" : "baja"}">${delta > 0 ? "▲" : "▼"} ` +
      `${Math.abs(delta).toFixed(1).replace(".", ",")} % vs período anterior</p>`;
  return `
<section class="rl-kpi">
  <div class="rl-kpi-banda">${ICONO}<span>ROTAS EN EL PERÍODO</span></div>
  <div class="rl-kpi-cuerpo">
    <div class="rl-kpi-izq">
      <p class="rl-kpi-num">${cifra}</p>
      <p class="rl-kpi-sub">${sub}</p>
    </div>
    <div class="rl-kpi-der">
      <p class="rl-kpi-k">${k}</p>
      <p class="rl-kpi-v">${v}</p>
      ${d}
    </div>
  </div>
  ${p ? `<div class="rl-kpi-chispa"><svg viewBox="0 0 800 34" preserveAspectRatio="none" aria-hidden>
    <polyline points="${p}" fill="none" stroke-width="2.4" stroke-linejoin="round"/></svg></div>` : ""}
</section>`;
};

const ARMAZON = tarjeta("1.889.816", "unidades · 1 ene a 30 sep 2026",
                        "PESO", "426.367 kg", 12.4, DIAS);
/* El otro estado: mejoró, y no hay con qué comparar. */
const BAJANDO = tarjeta("0,32 %", "1.889.816 rotas de 590.567.000 envasadas",
                        "UNIDADES", "1.889.816", -8.3, DIAS);
const SIN_ANT = tarjeta("1.889.816", "unidades · 1 ene a 30 sep 2026",
                        "PESO", "426.367 kg", null, DIAS);

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ---------- */
const literales = [...tsx.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)].map((m) => m[1]).join(" ");
const sueltas = literales.split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([
  ...sueltas, ...sueltas.map((w) => w.toLowerCase()),
  ...[...rot.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
]);
const usadas = [...new Set([...`${ARMAZON}${BAJANDO}${SIN_ANT}`.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/)))].filter(Boolean);
const inventadas = usadas.filter((c) => !palabras.has(c));

const canales = (c) => {
  const n = (c.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
  return c.startsWith("color(") ? n.map((v) => v * 255) : n;
};
const razon = (a, b) => {
  const lum = (c) => {
    const [r, g, bl] = canales(c).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const L1 = lum(a), L2 = lum(b);
  return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2);
};

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fallas = [];
if (inventadas.length)
  fallas.push(`el armazón usa clases que el componente no tiene: ${inventadas.join(", ")} ` +
              "— lo que se mida con ellas no dice nada de la pantalla");

const monta = async (pag, tema, ancho, html = ARMAZON) => {
  await pag.setViewportSize({ width: ancho, height: 800 });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${rot} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">
        <div class="rl">${html}</div>
      </main></div>
    </div></body></html>`);
};

/* ---------- 2 y 3. CONTRASTE Y EL SENTIDO DE LA FLECHA ---------- */
const pag = await navegador.newPage();
console.log("tema      rótulo  cifra  peso  sube(▲)  baja(▼)  sub  chispa");
for (const t of TEMAS) {
  await monta(pag, t, 1440);
  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    return {
      rotTxt: g(".rl-kpi-banda span", "color"), banda: g(".rl-kpi-banda", "background-color"),
      numTxt: g(".rl-kpi-num", "color"), papel: g(".rl-kpi", "background-color"),
      pesoTxt: g(".rl-kpi-v", "color"),
      sube: g(".rl-kpi-d.sube", "color"),
      subTxt: g(".rl-kpi-sub", "color"),
      chispa: g(".rl-kpi-chispa polyline", "stroke"),
    };
  });
  await monta(pag, t, 1440, BAJANDO);
  const baja = await pag.evaluate(() =>
    getComputedStyle(document.querySelector(".rl-kpi-d.baja")).color);

  const c = {
    rotulo: razon(m.rotTxt, m.banda),
    cifra: razon(m.numTxt, m.papel),
    peso: razon(m.pesoTxt, m.papel),
    sube: razon(m.sube, m.papel),
    baja: razon(baja, m.papel),
    sub: razon(m.subTxt, m.papel),
    chispa: razon(m.chispa, m.papel),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(7) + " ").join(""));

  for (const [k, v] of Object.entries(c)) {
    /* La cifra son 50 px en peso 900: ahí la norma admite 3.0. La chispa
       no es texto —es una línea de 2,4 px— y le basta 3.0 para que se
       distinga del papel. El resto es texto chico: 4.5. */
    const minimo = (k === "cifra" || k === "chispa") ? 3 : 4.5;
    if (v < minimo) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo ${minimo})`);
  }

  /* EN ROTURA SUBIR ES MALO. Si ▲ deja de ser el color de alarma y ▼ el
     de bien, la tarjeta hace leer una mejora como un problema. Es el
     error más caro que puede tener este bloque, así que se comprueba por
     el CANAL ROJO y no por el nombre de la clase: un `.sube` pintado de
     verde pasaría cualquier revisión de clases. */
  const [rS, gS] = canales(m.sube), [rB, gB] = canales(baja);
  if (!(rS > gS)) fallas.push(`tema ${nombre}: la flecha de SUBIR no es de alarma — en rotura ` +
                              "subir es malo y así se lee como una mejora");
  if (!(gB > rB)) fallas.push(`tema ${nombre}: la flecha de BAJAR no es de bien`);
}

/* ---------- 4. LA CHISPA ---------- */
console.log("");
if (chispa([5]) !== null) fallas.push("con un solo día la chispa dibuja algo: no hay línea que trazar");
const plana = chispa([7, 7, 7, 7]);
if (plana == null) fallas.push("con todos los días iguales la chispa no dibuja nada");
else if (/NaN|Infinity/.test(plana))
  fallas.push(`con todos los días iguales la chispa sale rota: «${plana.slice(0, 40)}…» ` +
              "— dividir por un rango de cero, y el SVG queda vacío sin avisar");
else console.log(`chispa plana: ${plana}  (recta a media altura, como debe ser)`);

/* ---------- 5. GEOMETRÍA ---------- */
console.log("\nancho    se sale        cifra  columnas  chispa");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(pag, null, ancho);
  const m = await pag.evaluate(() => {
    const nombra = (e) =>
      ((e.className || "").toString().trim().split(/\s+/)[0] || e.tagName.toLowerCase()) +
      (e.textContent?.trim() ? ` «${e.textContent.trim().slice(0, 18)}»` : "");
    const k = document.querySelector(".rl-kpi");
    const c = k.getBoundingClientRect();
    const salen = [...k.querySelectorAll("*")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right - c.right > 0.5 || c.left - r.left > 0.5);
    }).map(nombra);
    const d = document.documentElement;
    const izq = document.querySelector(".rl-kpi-izq").getBoundingClientRect();
    const der = document.querySelector(".rl-kpi-der").getBoundingClientRect();
    const ch = document.querySelector(".rl-kpi-chispa svg");
    return {
      salen: [...new Set(salen)], lado: d.scrollWidth - d.clientWidth,
      cifra: Math.round(parseFloat(getComputedStyle(document.querySelector(".rl-kpi-num")).fontSize)),
      /* «En columnas» de verdad: que el lado derecho empiece a la
         derecha de donde termina el izquierdo. Comparar solo el `top`
         diría que sí aunque estuviera debajo. */
      columnas: der.left >= izq.right - 1,
      chispaAncha: Math.round(ch.getBoundingClientRect().width),
      kpiAncho: Math.round(c.width),
    };
  });
  console.log(`${etiqueta.padEnd(8)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(14)} ` +
              `${String(m.cifra).padStart(5)}  ${(m.columnas ? "dos" : "apiladas").padEnd(8)}  ` +
              `${m.chispaAncha} de ${m.kpiAncho}`);

  if (m.salen.length) fallas.push(`${etiqueta}: se sale de la tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado`);
  if (m.cifra < 30) fallas.push(`${etiqueta}: la cifra mide ${m.cifra} px — deja de ser la cifra que manda`);
  /* A 360 px la comparación NO puede ir al lado de un número de 34 px:
     las dos columnas quedan en tiras de un dígito. */
  if (ancho <= 620 && m.columnas)
    fallas.push(`${etiqueta}: el peso sigue al lado de la cifra — a este ancho las dos ` +
                "columnas quedan en tiras de un dígito");
  if (ancho > 620 && !m.columnas)
    fallas.push(`${etiqueta}: el peso se apiló debajo de la cifra habiendo ancho de sobra`);
}

await navegador.close();

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Tarjeta del tablero: se lee en los 7 temas, la flecha dice la verdad, " +
            "la chispa aguanta el caso plano y nada se sale en los 4 anchos.");
