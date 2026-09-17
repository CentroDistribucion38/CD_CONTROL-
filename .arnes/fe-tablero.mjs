/* =====================================================================
   INVENTARIO · EL TABLERO — medido, no mirado.

   QUÉ ES. La pantalla que contesta QUÉ SE DESPACHA PRIMERO con lo que
   los conteos enviados dejaron. Tres grupos, «a quién llamar», la tabla
   renglón por renglón, y la lista de lo firmado. Es la única de las tres
   del módulo sobre la que alguien decide un despacho, así que lo que
   aquí se mide no es el gusto: es si la cifra se puede leer y creer.

   QUÉ SE MIDE Y POR QUÉ:

   1. QUE LAS CLASES DEL ARMAZÓN EXISTAN. Un arnés que mide `.fe-grupo`
      cuando la pantalla escribe `.fe-caja` aprueba siempre. Ya pasó
      cuatro veces en este proyecto, y la cuarta llegó a producción: el
      panel de la revisión AI se montó con un `div class="sd ai"` que la
      aplicación no tiene, los tokens quedaron indefinidos y la pantalla
      salió SIN CSS con el arnés en verde.

   2. CONTRASTE EN LOS SIETE TEMAS, con dos parejas que nadie emparejó a
      propósito y que aquí importan más que en el maestro:
        · los DÍAS en la fila vencida: --fe-mal sobre el rosa #FDF2F3,
          que es un color fijo y no cambia con el tema mientras el rojo
          sí, porque sale del acento en algunos temas;
        · el blanco del KPI en alarma sobre --fe-mal.
      Y el rótulo del encabezado de la tabla, que va gris sobre
      --fe-fondo — la misma pareja que en otra pantalla de este proyecto
      cayó a 4,39 en el tema ámbar.

   3. QUE LA TABLA SE DESLICE SOLA Y LA PÁGINA NO. Seis columnas en 360
      px no caben, y la decisión de diseño fue que la tabla se arrastre
      de lado dentro de su tarjeta. Si lo que se arrastra es la PÁGINA,
      el tablero entero se mueve bajo el dedo de quien solo quería leer
      la tabla. Aquí se comprueba lo uno y lo otro por separado.

   4. QUE LAS BARRAS SE DIBUJEN. La barra es una fracción del material
      que más pesa, y un tope en cero da NaN: `width: NaN%` se descarta
      y las barras desaparecen sin un solo error en la consola. Es
      exactamente lo que dejó la chispa del tablero de rotura en blanco
      con una serie plana. Se mide con TODOS LOS PESOS EN CERO, que es
      el caso que lo rompe.

   5. QUE LA PANTALLA NO AFIRME SOBRE BORRADORES. La regla es de datos y
      no de pintura, así que se comprueba en el código: `tableroFefo`
      tiene que filtrar por conteos cerrados.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const fefo = readFileSync(new URL("../src/app/(app)/inventario/fefo.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/app/(app)/shell.css", import.meta.url), "utf8");
const pgx = readFileSync(new URL("../src/app/(app)/inventario/page.tsx", import.meta.url), "utf8");
const dat = readFileSync(new URL("../src/modulos/inventario/fefo.ts", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]];

/* Renglones como los del conteo de verdad: descripciones de sesenta
   caracteres, ubicaciones combinadas con AVERIA y PNC, y días en
   negativo, que es la fila que hay que poder leer de un vistazo. */
const FILAS = [
  [-12, "3128", "CERVEZA AGUILA LATA 269 CC X 6 UND TERMOENCOGIBLE", "E06_IZQ AVERIA VACIOS", 1440, "12/03/26", "JOSÉ M. CANTILLO"],
  [-3, "9013", "CERVEZA PILSEN BOTELLA 330 CC NO RETORNABLE X 24 UNIDADES", "A29_DER", 288, "24/03/26", "JOSÉ M. CANTILLO"],
  [0, "7842", "ENVASE COSTEÑITA 175 ML RETORNABLE CAJA X 30", "P_12_IZQ PNC", 96, "27/03/26", "YULIETH PATERNINA"],
  [5, "4410", "CERVEZA CLUB COLOMBIA DORADA BOTELLA 330 CC", "EST07", 2160, "02/04/26", "YULIETH PATERNINA"],
];

/* CON TODOS LOS PESOS EN CERO: es el caso que borra las barras sin
   avisar, y el único que hace falta medir. Si se dibujan con esto, se
   dibujan con cualquier cosa. */
const MATERIALES = [["3128", "CERVEZA AGUILA LATA 269 CC X 6 UND TERMOENCOGIBLE", 0, 8],
                    ["9013", "CERVEZA PILSEN BOTELLA 330 CC NO RETORNABLE X 24", 0, 3]];
const TOPE = Math.max(1, ...MATERIALES.map((m) => m[2]));

const ARMAZON = `
<div class="fe">
  <section class="cabeza">
    <div>
      <p class="ojo">INVENTARIO · FEFO · CD38</p>
      <h1>Qué sale primero</h1>
      <p class="sub">De los conteos <b>enviados</b>. «Días para salir» no es cuándo se vence:
        es cuándo tiene que haber salido para llegar con vida útil suficiente — el vencimiento
        menos hoy menos el mínimo de cada material. En negativo ya se pasó.</p>
    </div>
    <div class="kpi alarma"><div class="corte"></div>
      <div class="rot">YA SE PASÓ DE SALIDA</div>
      <div class="num">1.728</div><div class="pie">cajas en 2 renglones</div></div>
  </section>

  <section class="fe-grupos">
    <div class="fe-grupo mal"><p class="rot">YA SE PASÓ</p><p class="n">1.728</p>
      <p class="u">cajas · 2 renglones — sale hoy</p></div>
    <div class="fe-grupo ojo"><p class="rot">SALE ESTA SEMANA</p><p class="n">2.256</p>
      <p class="u">cajas · 2 renglones — hay que programarlo</p></div>
    <div class="fe-grupo"><p class="rot">CONTADO</p><p class="n">3.984</p>
      <p class="u">cajas · 4 módulos · 2 conteos</p></div>
  </section>

  <section class="fe-faltan">
    <p><b>3 renglones de producto sin fecha de vencimiento</b> — no entran en ningún grupo
      porque no se les puede calcular cuándo salen. Son de conteos viejos: hoy la fecha es
      obligatoria.</p>
  </section>

  <section class="fe-caja">
    <div class="fe-caja-cab"><h2>A quién llamar</h2>
      <p>Lo urgente agrupado por material. Quince renglones del mismo código en ocho módulos
        son <b>un</b> problema, no quince.</p></div>
    <div class="fe-barras">
      ${MATERIALES.map((m) => `
      <div class="fe-mat">
        <span class="nom"><b>${m[0]}</b> ${m[1]}</span>
        <span class="pista"><i style="width:${(m[2] / TOPE) * 100}%"></i></span>
        <span class="val">${m[2]}<em>${m[3]} módulos</em></span>
      </div>`).join("")}
    </div>
  </section>

  <section class="fe-caja">
    <div class="fe-caja-cab"><h2>Renglón por renglón</h2>
      <p>Lo más urgente arriba. Con lo que pesa, para saber por dónde empezar.</p></div>
    <div class="fe-tabla">
      <table>
        <thead><tr><th>Días para salir</th><th>Material</th><th>Ubicación</th>
          <th class="n">Cajas</th><th>Vence</th><th>Contó</th></tr></thead>
        <tbody>
          ${FILAS.map((f) => `<tr class="${f[0] < 0 ? "mal" : ""}">
            <td class="dias">${f[0]}</td>
            <td><b>${f[1]}</b> <span>${f[2]}</span></td>
            <td>${f[3]}</td><td class="n">${f[4]}</td><td>${f[5]}</td><td>${f[6]}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>

  <section class="fe-caja">
    <div class="fe-caja-cab"><h2>Conteos enviados</h2><p>Quién caminó qué, y cuándo lo firmó.</p></div>
    <div class="fe-tabla">
      <table>
        <thead><tr><th>Conteo</th><th>Quien contó</th><th class="n">Renglones</th>
          <th class="n">Módulos</th><th class="n">Cajas</th><th>Enviado</th></tr></thead>
        <tbody><tr><td><b>CT-2026-0014</b></td><td>JOSÉ M. CANTILLO</td>
          <td class="n">152</td><td class="n">38</td><td class="n">18.402</td>
          <td>12 sep<em> · por YULIETH PATERNINA</em></td></tr></tbody>
      </table>
    </div>
  </section>
</div>`;

const VACIO = `
<div class="fe">
  <section class="fe-vacio-grande">
    <h2>Todavía no hay conteos enviados</h2>
    <p>El tablero se llena con lo que se camina. Un borrador a medio recorrer no cuenta:
      diría que un módulo está vacío porque todavía no se ha llegado, y sobre eso alguien
      podría decidir un despacho.</p>
    <a class="btn grande" href="/inventario/conteo">Ir a contar</a>
  </section>
</div>`;

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ----------
   Por PALABRA COMPLETA contra los literales de la página más las clases
   que define la hoja: `includes("caja")` da verdadero dentro de
   «fe-caja-cab», que es justo cómo un arnés de este proyecto midió un
   panel inexistente. */
const sueltas = [...pgx.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)]
  .map((m) => m[1]).join(" ").split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([...sueltas, ...sueltas.map((w) => w.toLowerCase()),
  ...[...fefo.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])]);
const inventadas = [...new Set([...`${ARMAZON}${VACIO}`.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/)))].filter(Boolean).filter((c) => !palabras.has(c));

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

const fallas = [];
if (inventadas.length)
  fallas.push(`el armazón usa clases que la pantalla no tiene: ${inventadas.join(", ")} ` +
              "— lo que se mida con ellas no dice nada de la pantalla");

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();
const monta = async (tema, ancho, html = ARMAZON) => {
  await pag.setViewportSize({ width: ancho, height: 1100 });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${fefo} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">${html}</main></div>
    </div></body></html>`);
};

/* ---------- 2. CONTRASTE ---------- */
console.log("tema      alarma  días(mal)  grupo mal  rótulo tabla  «u» grupo  vacío");
for (const t of TEMAS) {
  await monta(t, 1440);
  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    /* El fondo de verdad es el primero que PINTA, subiendo: en el tema
       oficial `.sh` no trae fondo y leerlo a secas devuelve
       «rgba(0,0,0,0)», que como color es NEGRO. Ese error dio 2,66 de
       contraste en este proyecto y me hizo «arreglar» un gris que
       estaba bien. */
    const fondoReal = (sel) => {
      for (let e = document.querySelector(sel); e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    return {
      alarmaTxt: g(".kpi.alarma .num", "color"), alarmaFondo: g(".kpi.alarma", "background-color"),
      diasTxt: g("tr.mal .dias", "color"), diasFondo: fondoReal("tr.mal .dias"),
      malTxt: g(".fe-grupo.mal .n", "color"), malFondo: fondoReal(".fe-grupo.mal .n"),
      thTxt: g(".fe-tabla th", "color"), thFondo: fondoReal(".fe-tabla th"),
      uTxt: g(".fe-grupo .u", "color"), uFondo: fondoReal(".fe-grupo .u"),
    };
  });
  await monta(t, 1440, VACIO);
  const v = await pag.evaluate(() => {
    const fondoReal = (sel) => {
      for (let e = document.querySelector(sel); e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    const e = document.querySelector(".fe-vacio-grande p");
    return { txt: getComputedStyle(e).color, fondo: fondoReal(".fe-vacio-grande p") };
  });
  const c = {
    alarma: razon(m.alarmaTxt, m.alarmaFondo),
    dias: razon(m.diasTxt, m.diasFondo),
    grupoMal: razon(m.malTxt, m.malFondo),
    rotulo: razon(m.thTxt, m.thFondo),
    u: razon(m.uTxt, m.uFondo),
    vacio: razon(v.txt, v.fondo),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((x) => String(x).padStart(8) + "  ").join(""));
  for (const [k, x] of Object.entries(c))
    if (x < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${x} (mínimo 4.5)`);
}

/* ---------- 3, 4: geometría y barras ---------- */
console.log("\nancho    se sale           arrastra página  arrastra tabla  barras dibujadas");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(null, ancho);
  const m = await pag.evaluate(() => {
    const recortado = (e, hasta) => {
      for (let p = e.parentElement; p && p !== hasta.parentElement; p = p.parentElement)
        if (getComputedStyle(p).overflow !== "visible") return true;
      return false;
    };
    const nombra = (e) =>
      ((e.className || "").toString().trim().split(/\s+/)[0] || e.tagName.toLowerCase()) +
      (e.textContent?.trim() ? ` «${e.textContent.trim().slice(0, 22)}»` : "");
    const salen = [];
    for (const f of document.querySelectorAll(".fe-grupo, .fe-caja-cab, .cabeza, .fe-faltan, .fe-mat")) {
      const c = f.getBoundingClientRect();
      for (const e of f.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && !recortado(e, f) && (r.right - c.right > 0.5 || c.left - r.left > 0.5))
          salen.push(nombra(e));
      }
    }
    const d = document.documentElement;
    const tabla = document.querySelector(".fe-tabla");
    return {
      salen: [...new Set(salen)],
      lado: d.scrollWidth - d.clientWidth,
      ladoTabla: tabla.scrollWidth - tabla.clientWidth,
      /* CON TODOS LOS PESOS EN CERO LA BARRA TIENE QUE MEDIR 0 px.
         Y medir el ancho es la única forma de saberlo: `width: NaN%` no
         lanza ningún error, el navegador DESCARTA la declaración, y un
         `<i>` de bloque sin ancho se estira hasta llenar la pista. O
         sea que el fallo no se ve como una barra que falta: se ve como
         DOS BARRAS LLENAS, que es peor, porque parece un dato. */
      anchos: [...document.querySelectorAll(".fe-barras .pista i")]
        .map((e) => e.getBoundingClientRect().width),
      pistas: [...document.querySelectorAll(".fe-barras .pista")]
        .map((e) => e.getBoundingClientRect().width),
    };
  });
  /* Los pesos del montaje son todos CERO a propósito, así que cada
     barra tiene que medir 0 px. Si mide lo mismo que su pista, el ancho
     salió NaN y el navegador lo descartó. */
  const barras = m.anchos.length === m.pistas.length &&
                 m.anchos.every((x, i) => Number.isFinite(x) && x < m.pistas[i] - 0.5);
  console.log(`${etiqueta.padEnd(8)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(17)} ` +
              `${String(m.lado).padStart(15)}  ${String(m.ladoTabla).padStart(14)}  ` +
              `${(barras ? "sí" : "NO").padStart(16)}`);

  if (m.salen.length) fallas.push(`${etiqueta}: se sale de su tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado — ` +
                              "es la tabla la que debe deslizarse, no el tablero entero");
  if (!barras) fallas.push(`${etiqueta}: una barra se dibujó LLENA con peso cero — el tope ` +
                           "en cero da NaN, el navegador descarta el ancho y la barra se " +
                           "estira hasta llenar la pista sin un solo error");
  if (ancho <= 390 && m.ladoTabla <= 0)
    fallas.push(`${etiqueta}: la tabla no se desliza — seis columnas no caben en ${ancho} px, ` +
                "así que o se encogió hasta ser ilegible o se está saliendo");
}

await navegador.close();

/* ---------- 5. NO AFIRMAR SOBRE BORRADORES ---------- */
if (!/estado === "cerrado"/.test(dat))
  fallas.push("`tableroFefo` no filtra por conteos cerrados: el tablero estaría afirmando " +
              "sobre recorridos a medio caminar");
if (!/Math\.max\(1,/.test(pgx))
  fallas.push("el tope de las barras puede ser cero: `width: NaN%` se descarta y las barras " +
              "desaparecen sin un solo error");

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ INVENTARIO · tablero: contrasta en los 7 temas, nada se sale a 1440/820/390/360, " +
            "la tabla se desliza sola, las barras se dibujan con el tope en cero y solo se lee " +
            "lo enviado.");
