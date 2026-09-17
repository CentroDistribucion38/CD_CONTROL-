/* =====================================================================
   SIDER · AI — EL INFORME, medido y no mirado.

   QUÉ ES. La hoja que el Excel no tenía: cuánto se le cobra al socio,
   qué defecto lo explica, y a quién llamar. Es una pantalla de DECISIÓN
   —de aquí sale una llamada a un socio y una orden a SAP— así que lo que
   se mide no es el gusto: es si la cifra se puede leer y creer.

   QUÉ SE MIDE Y POR QUÉ CADA COSA:

   1. QUE LAS CLASES DEL ARMAZÓN EXISTAN. Por palabra completa contra los
      literales del componente y las clases de la hoja. Un arnés que
      monta un envoltorio que la aplicación no tiene aprueba siempre: en
      este proyecto eso mandó una pantalla SIN CSS a producción, con el
      arnés en verde.

   2. LOS TOKENS SE RESUELVEN, y esto va ANTES de medir un solo color.
      Una declaración con una variable indefinida no se degrada: SE
      DESCARTA ENTERA. `border: 1px solid var(--ia-ramp)` sin el token da
      CERO borde, no un borde por defecto. Si los tokens no resuelven, lo
      que midan los puntos 3 y 4 no dice nada de la pantalla.

   3. CONTRASTE EN LOS SIETE TEMAS. Las parejas que nadie emparejó a
      propósito: el blanco de la cifra grande sobre la banda del tema, el
      acento como TEXTO sobre papel blanco —que es la que falla, y van
      tres veces en este proyecto—, el gris de los pies, el rótulo de la
      tabla sobre su fondo, y el sello de origen.

   4. QUE LA TABLA SE DESLICE SOLA Y LA PÁGINA NO. Once columnas no caben
      en 360 px; la decisión fue que la tabla se arrastre dentro de su
      tarjeta. Si lo que se arrastra es la PÁGINA, el informe entero se
      mueve bajo el dedo de quien solo quería leer la tabla.

   5. QUE LA TENDENCIA SE DIBUJE CON UNA SERIE PLANA. Con todas las
      semanas iguales el rango es cero, la división da NaN, el `d` del
      path sale con «NaN» dentro y el SVG no dibuja NADA — sin un solo
      error en la consola. Es exactamente lo que dejó la chispa del
      tablero de rotura en blanco.

   6. QUE LAS BARRAS NO SE DIBUJEN LLENAS CON EL TOPE EN CERO. Mismo
      silencio: `width: NaN%` se descarta y un bloque sin ancho se estira
      hasta llenar la pista. No se ve como una barra que falta: se ve
      como todas llenas, que parece un dato.

   7. QUE LA ESCALA ARRANQUE EN CERO. Empezarla en el mínimo convierte
      dos décimas en un precipicio. Exagerar la pendiente es la forma
      más fácil de mentir con una gráfica y no hace falta mala intención.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const U = (p) => new URL(p, import.meta.url);
const info  = readFileSync(U("../src/app/(app)/sider/seguimiento/ai/informe.css"), "utf8");
const sider = readFileSync(U("../src/app/(app)/sider/sider.css"), "utf8");
const glob  = readFileSync(U("../src/app/globals.css"), "utf8");
const shell = readFileSync(U("../src/app/(app)/shell.css"), "utf8");
const tsx   = readFileSync(U("../src/app/(app)/sider/seguimiento/ai/Informe.tsx"), "utf8");
const pgx   = readFileSync(U("../src/app/(app)/sider/seguimiento/ai/page.tsx"), "utf8");
const dat   = readFileSync(U("../src/modulos/sider/informe-ai.ts"), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [1100, "tableta"], [390, "celular"], [360, "360"]];

/* Datos de la hoja de verdad: los cuatro defectos que más pesan en las
   285 filas de BD AI BAQ, y socios con los nombres largos que tiene el
   archivo —son los que se salen, no los de ejemplo—. */
const DEFECTOS = [
  ["Extrasucio / no recuperable", 2224, "0,52 %", "3,892"],
  ["Faltante", 1394, "0,33 %", "2,440"],
  ["Otras compañías", 971, "0,23 %", "1,699"],
  ["Cristalizado / meteorizada", 904, "0,21 %", "1,582"],
];
const SOCIOS = [
  ["Distribuidora La Bendicion Fb Sas", 28450, "0,74 %", 61],
  ["Logisinú S.A.S Zomac", 19870, "0,61 %", 149],
  ["Los Gavilanes Y Cia Ltda.", 9120, "0,49 %", 38],
];
const FILAS = [
  ["8 may", "JYM958", "Logisinú S.A.S Zomac", "G175", "82.080", "4.104", "34", "0,83 %", "680", "0,060", "Excel"],
  ["12 may", "SBL495", "Distribuidora La Bendicion Fb Sas", "G175", "20.520", "1.026", "10", "0,97 %", "200", "0,018", "Excel"],
  ["6 jul", "WCO324", "Los Gavilanes Y Cia Ltda.", "F330", "41.040", "2.052", "31", "1,51 %", "620", "0,102", "Contada aquí"],
];

const bar = (nom, val, pista, pie) => `
  <div class="ia-bar">
    <span class="nom">${nom}</span>
    <span class="pista"><i style="width:${pista}%"></i></span>
    <span class="val">${val}<em>${pie}</em></span>
  </div>`;

const ARMAZON = `
<div class="sd">
  <section class="cabeza"><div>
    <p class="ojo">SIDER · REVISIÓN AI</p>
    <h1>Qué se le cobra al socio, y por qué</h1>
    <p class="sub">El índice de cobro sale de las <b>nueve categorías que cobran</b> sobre las
      botellas revisadas. No es el «% total de botellas con defectos», que suma diez y da
      otra cifra. <a href="/sider/seguimiento">Volver al seguimiento de envase</a></p>
  </div></section>

  <section class="ia-filtros">
    <label><span>Desde</span><input type="date" value="2026-05-08"></label>
    <label><span>Hasta</span><input type="date" value="2026-09-08"></label>
    <label><span>Socio</span><select><option>Todos</option>
      <option>Distribuidora La Bendicion Fb Sas</option></select></label>
    <label><span>Envase</span><select><option>Todos</option><option>G175</option></select></label>
    <label><span>Canal</span><select><option>Todos</option><option>Socios</option></select></label>
  </section>

  <section class="ia-cifras">
    <div class="ia-hero">
      <p class="rot">ÍNDICE DE COBRO DEL PERÍODO</p>
      <p class="num">0,69 %</p>
      <p class="pie">7.140 botellas que cobran de 1.038.291 revisadas · 285 revisiones · 34 socios</p>
    </div>
    <div class="ia-dato"><p class="rot">NO ABONADO</p><p class="num">80.619</p>
      <p class="pie">botellas · de 11.680.560 recibidas</p></div>
    <div class="ia-dato"><p class="rot">EN HECTOLITROS</p><p class="num">12,495</p>
      <p class="pie">Hl con defecto que cobra</p></div>
    <div class="ia-dato"><p class="rot">CONTADAS Y NO COBRADAS</p><p class="num">1.526</p>
      <p class="pie">hongo, etiqueta asoleada, cuerpo extraño, cajas y estibas</p></div>
  </section>

  <section class="ia-caja">
    <div class="ia-caja-cab"><h2>Cómo va el índice, semana a semana</h2>
      <p>Cada punto es una semana completa. La escala arranca en cero.</p></div>
    <div class="ia-linea">
      <svg viewBox="0 0 1000 150" preserveAspectRatio="none">
        <path class="area" d="M0,128 L0,90 L250,70 L500,96 L750,44 L1000,80 L1000,128 Z"></path>
        <polyline class="traza" points="0,90 250,70 500,96 750,44 1000,80"></polyline>
        <circle class="punto" cx="0" cy="90" r="4"></circle>
        <circle class="punto" cx="250" cy="70" r="4"></circle>
        <circle class="punto" cx="500" cy="96" r="4"></circle>
        <circle class="punto pico" cx="750" cy="44" r="6"></circle>
        <circle class="punto" cx="1000" cy="80" r="4"></circle>
      </svg>
      <div class="ia-rotulos">
        <span class="on" style="left:0%"><b>0,52 %</b><em>4 may</em></span>
        <span class="on" style="left:75%"><b>1,12 %</b><em>20 jul</em></span>
        <span class="on" style="left:100%"><b>0,71 %</b><em>1 sep</em></span>
      </div>
    </div>
  </section>

  <div class="ia-dos">
    <section class="ia-caja">
      <div class="ia-caja-cab"><h2>Qué defecto lo explica</h2>
        <p>Las nueve que cobran, de la que más pesa a la que menos. El porcentaje es sobre
          las 1.038.291 botellas revisadas del período.</p></div>
      <div class="ia-barras">
        ${DEFECTOS.map((d, i) => bar(d[0], d[1].toLocaleString("es-CO"),
            Math.round((d[1] / DEFECTOS[0][1]) * 100), `${d[2]} · ${d[3]} Hl`)).join("")}
      </div>
      <div class="ia-nocobra">
        <p class="rot">SE CUENTAN Y NO COBRAN</p>
        <ul><li><b>614</b> Etiqueta asoleada<em>0,14 %</em></li>
          <li><b>490</b> Cuerpo extraño<em>0,11 %</em></li>
          <li><b>219</b> Hongo<em>0,05 %</em></li></ul>
        <p class="nota">Están aquí porque alguien las contó y son botellas de verdad. No entran
          en el índice: así está la fórmula de cobro del archivo.</p>
      </div>
    </section>

    <section class="ia-caja">
      <div class="ia-caja-cab"><h2>A quién llamar</h2>
        <p>Por socio, ordenado por lo que NO se le abona — que es la conversación que hay que
          tener.</p></div>
      <div class="ia-barras">
        ${SOCIOS.map((s) => bar(`<button type="button">${s[0]}</button>`,
            s[1].toLocaleString("es-CO"),
            Math.round((s[1] / SOCIOS[0][1]) * 100), `${s[2]} · ${s[3]} rev.`)).join("")}
      </div>
      <p class="ia-mas">Se muestran los 12 que más pesan, de 34. Filtra por socio para ver el resto.</p>
    </section>
  </div>

  <section class="ia-caja">
    <div class="ia-caja-cab con-busca">
      <div><h2>Revisión por revisión</h2>
        <p>Es donde se mira la fila concreta cuando un socio reclama.</p></div>
      <div class="ia-herramientas">
        <label class="ia-busca"><span class="sr">Buscar</span>
          <input placeholder="Placa, socio, ZCL3…"></label>
        <label class="ia-ordenar"><span class="sr">Ordenar por</span>
          <select><option>Más reciente</option><option>Índice más alto</option></select></label>
      </div>
    </div>
    <div class="ia-tabla">
      <table>
        <thead><tr><th>Fecha</th><th>Placa</th><th>Socio</th><th>Envase</th>
          <th class="n">Recibidas</th><th class="n">Revisadas</th><th class="n">Defectos</th>
          <th class="n">Índice</th><th class="n">No abono</th><th class="n">Hl</th>
          <th>Origen</th></tr></thead>
        <tbody>
          ${FILAS.map((f) => `<tr>
            <td>${f[0]}</td><td><b>${f[1]}</b></td><td>${f[2]}</td><td>${f[3]}</td>
            <td class="n">${f[4]}</td><td class="n">${f[5]}</td><td class="n">${f[6]}</td>
            <td class="n destaca">${f[7]}</td><td class="n">${f[8]}</td><td class="n">${f[9]}</td>
            <td><span class="ia-sello${f[10] === "Excel" ? "" : " propio"}">${f[10]}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="ia-mas">285 revisiones. 285 vienen del Excel histórico.</p>
  </section>
</div>`;

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ----------
   Por PALABRA COMPLETA: `includes("caja")` da verdadero dentro de
   «ia-caja-cab», que es justo cómo un arnés de este proyecto midió un
   panel que la pantalla no tenía. */
const sueltas = [...`${tsx}\n${pgx}`.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)]
  .map((m) => m[1]).join(" ").split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([...sueltas, ...sueltas.map((w) => w.toLowerCase()),
  ...[...info.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
  ...[...sider.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])]);
const inventadas = [...new Set([...ARMAZON.matchAll(/class="([^"]+)"/g)]
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
  fallas.push(`el armazón usa clases que la pantalla no tiene: ${inventadas.join(", ")}`);

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();
const monta = async (tema, ancho, html = ARMAZON) => {
  await pag.setViewportSize({ width: ancho, height: 1100 });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${sider}${info} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">${html}</main></div>
    </div></body></html>`);
};

/* ---------- 2. LOS TOKENS, ANTES QUE CUALQUIER COLOR ---------- */
await monta(null, 1440);
const sinToken = await pag.evaluate(() => {
  const e = document.querySelector(".sd");
  const cs = getComputedStyle(e);
  return ["--ia-ramp", "--ia-ramp-suave", "--ia-dato"]
    .filter((t) => cs.getPropertyValue(t).trim() === "");
});
if (sinToken.length) {
  fallas.push(`estos tokens no resuelven en «.sd»: ${sinToken.join(", ")} — una declaración ` +
              "con variable indefinida NO se degrada, se descarta entera, y lo que midan " +
              "los colores de abajo no dice nada de la pantalla");
}

/* ---------- 3. CONTRASTE ---------- */
console.log("tema      cifra  dato   pie    rótulo  sello  enlace");
for (const t of TEMAS) {
  await monta(t, 1440);
  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    const fondoReal = (sel) => {
      for (let e = document.querySelector(sel); e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    return {
      heroTxt: g(".ia-hero .num", "color"), heroFondo: g(".ia-hero", "background-color"),
      datoTxt: g(".ia-dato .num", "color"), papel: fondoReal(".ia-dato .num"),
      pieTxt: g(".ia-dato .pie", "color"),
      thTxt: g(".ia-tabla th", "color"), thFondo: fondoReal(".ia-tabla th"),
      selloTxt: g(".ia-sello.propio", "color"), selloFondo: g(".ia-sello.propio", "background-color"),
      linkTxt: g(".ia-bar .nom button", "color"), linkFondo: fondoReal(".ia-bar .nom button"),
    };
  });
  const c = {
    cifra: razon(m.heroTxt, m.heroFondo),
    dato: razon(m.datoTxt, m.papel),
    pie: razon(m.pieTxt, m.papel),
    rotulo: razon(m.thTxt, m.thFondo),
    sello: razon(m.selloTxt, m.selloFondo),
    enlace: razon(m.linkTxt, m.linkFondo),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(6) + " ").join(""));
  for (const [k, v] of Object.entries(c))
    if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5)`);
}

/* ---------- 4 y 6: geometría y barras ---------- */
console.log("\nancho    se sale           arrastra página  arrastra tabla  barras");
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
      (e.textContent?.trim() ? ` «${e.textContent.trim().slice(0, 20)}»` : "");
    const salen = [];
    for (const f of document.querySelectorAll(".ia-hero, .ia-dato, .ia-caja-cab, .ia-bar, .ia-filtros, .cabeza")) {
      const c = f.getBoundingClientRect();
      for (const e of f.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && !recortado(e, f) && (r.right - c.right > 0.5 || c.left - r.left > 0.5))
          salen.push(nombra(e));
      }
    }
    const d = document.documentElement;
    const tabla = document.querySelector(".ia-tabla");
    /* POR GRUPO Y NO EN UNA SOLA LISTA. Hay dos gráficos de barras
       —defectos y socios— y CADA UNO tiene su barra del tope, que sí
       llena la pista legítimamente. Mirándolos como una sola lista, la
       primera del segundo grupo salía marcada siempre: el arnés
       acusando a la pantalla de un fallo suyo. */
    const grupos = [...document.querySelectorAll(".ia-barras")]
      .map((g) => [...g.querySelectorAll(".ia-bar .pista")]);
    return {
      salen: [...new Set(salen)],
      lado: d.scrollWidth - d.clientWidth,
      ladoTabla: tabla.scrollWidth - tabla.clientWidth,
      /* Cada relleno tiene que ser MÁS ANGOSTO que su pista menos el de
         arriba: si mide lo mismo que la pista, el ancho salió NaN y el
         navegador lo descartó. La primera barra es la del tope y sí la
         llena, así que se miran de la segunda en adelante. */
      llenas: grupos.flatMap((g) => g.slice(1)).filter((p) => {
        const i = p.querySelector("i");
        return !i || i.getBoundingClientRect().width >= p.getBoundingClientRect().width - 0.5;
      }).length,
    };
  });
  console.log(`${etiqueta.padEnd(8)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(17)} ` +
              `${String(m.lado).padStart(15)}  ${String(m.ladoTabla).padStart(14)}  ` +
              `${(m.llenas === 0 ? "bien" : `${m.llenas} LLENAS`).padStart(9)}`);
  if (m.salen.length) fallas.push(`${etiqueta}: se sale de su tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado — ` +
                              "es la tabla la que debe deslizarse, no el informe entero");
  if (m.llenas > 0) fallas.push(`${etiqueta}: ${m.llenas} barras dibujadas LLENAS — el tope en ` +
                                "cero da NaN y el navegador descarta el ancho sin avisar");
  if (ancho <= 390 && m.ladoTabla <= 0)
    fallas.push(`${etiqueta}: la tabla no se desliza — once columnas no caben en ${ancho} px`);
}

await navegador.close();

/* ---------- 5 y 7: las dos trampas de la tendencia ----------
   Se comprueban en el CÓDIGO y no en la pintura: son aritmética, y el
   síntoma de las dos es que NO SE DIBUJA NADA, sin error. */
if (!/const techo = max > 0 \? max \* 1\.15 : 1/.test(tsx))
  fallas.push("el techo de la tendencia puede ser cero: con todas las semanas iguales la " +
              "división da NaN, el path sale con «NaN» dentro y el SVG no dibuja nada");
if (/Math\.min\(\.\.\.vals\)/.test(tsx))
  fallas.push("la escala de la tendencia arranca en el mínimo y no en cero: dos décimas de " +
              "diferencia se verían como un precipicio");
if (!/Math\.max\(1, \.\.\.cobran\.map/.test(tsx) || !/Math\.max\(1, \.\.\.socios\.map/.test(tsx))
  fallas.push("el tope de alguna barra puede ser cero: `width: NaN%` se descarta y la barra " +
              "se estira hasta llenar la pista");

/* ---------- LAS CUENTAS NO SE REHACEN AQUÍ ----------
   El índice, el no-abono y los Hl los hace `v_sider_ai`. Si esta capa
   volviera a dividir defectos entre revisadas, bastaría un redondeo
   distinto para que el informe y la orden de cobro dijeran cifras
   diferentes del mismo día — que es la enfermedad que tenía el Excel,
   con dos columnas de «total defectos» que no coincidían en 252 de 296
   filas. Lo único que SÍ se calcula aquí son los agregados, y esos van
   sobre SUMAS, nunca promediando porcentajes. */
if (/indice[^\n]*=[^\n]*\/\s*r\.revisadas/.test(tsx))
  fallas.push("el componente recalcula el índice en vez de leerlo de la vista");
if (!/total\.defectos \/ total\.revisadas/.test(dat))
  fallas.push("el índice del período no sale de sumar defectos y revisadas — promediar " +
              "porcentajes le da el mismo peso a una muestra de 200 que a una de 4.104");

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ SIDER · informe AI: los tokens resuelven, contrasta en los 7 temas, nada se " +
            "sale a 1440/1100/390/360, la tabla se desliza sola, las barras y la tendencia " +
            "aguantan el cero, y las cuentas salen de la vista.");
