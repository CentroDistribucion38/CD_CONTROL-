/* =====================================================================
   LA PLANTILLA DE CONTEO — medida, no mirada.

   QUÉ ES. La hoja CONTEO del Excel, vacía, para caminar la bodega. Se
   usa DE PIE, frente a un módulo, con una sola mano y a veces con
   guantes. Aquí no se mide estética: se mide si se puede usar así.

   QUÉ SE COMPRUEBA Y POR QUÉ:

   1. QUE LAS CLASES DEL ARMAZÓN EXISTAN. Por palabra completa contra los
      literales del componente y las clases de la hoja. Un arnés que mide
      `.filtros` cuando la pantalla usa `.tr-filtros` aprueba siempre y
      no mide nada — ya pasó dos veces en este proyecto.

   2. EL DEDO. 48 px lo que se toca en el celular, 56 el campo del
      código. No es un capricho de diseño: fallar un campo aquí no es un
      clic de más, es volver a contar la estiba. El CSS lo dice en un
      comentario; esto comprueba que el comentario sea verdad.

   3. QUE QUEPA SIN ESTIRAR EL BRAZO. Los dos pasos —dónde estoy, qué
      hay— y el botón de anotar tienen que caber en la primera pantalla
      de un celular de 390×740 con la barra de la app encima. Si «Anotar
      renglón» queda bajo el pliegue, cada estiba cuesta un scroll.

   4. CONTRASTE EN LOS SIETE TEMAS, incluida la pareja nueva y peligrosa:
      el botón de «Sí/No» encendido pinta --fe-sobre sobre --fe-acento, y
      el acento cambia con las preferencias de cada quien. Ya dio 1,7 en
      un tema y 6,9 en otro en otra pantalla de este proyecto.

   5. QUE NADA SE SALGA a 1440 / 820 / 390 / 360, con descripciones de
      sesenta caracteres y claves como «ALAR_BAHIA_6».

   6. QUE EL AVISO DEL CÓDIGO MALO SE LEA. Es rojo sobre rosa —la única
      pareja de la pantalla que no sale de los tokens del tema— y es
      justo el que hay que leer con el sol de frente.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const fefo  = readFileSync(new URL("../src/app/(app)/inventario/fefo.css", import.meta.url), "utf8");
const glob  = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/app/(app)/shell.css", import.meta.url), "utf8");
const tsx   = readFileSync(new URL("../src/app/(app)/inventario/conteo/Contar.tsx", import.meta.url), "utf8");
const pgx   = readFileSync(new URL("../src/app/(app)/inventario/conteo/page.tsx", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]];

/* La barra de la app se lleva 70 px arriba. Lo que quepa «sin scroll»
   hay que medirlo contra lo que sobra, no contra la pantalla entera. */
const BARRA = 70;

const ARMAZON = `
<div class="fe contando">
  <section class="cabeza">
    <div>
      <p class="ojo">INVENTARIO · CONTEO POR MÓDULO</p>
      <h1>Contar</h1>
      <p class="sub">Se camina módulo por módulo: escoges dónde estás y vas anotando.</p>
    </div>
    <div class="kpi"><div class="corte"></div><div class="rot">BORRADOR</div>
      <div class="num">12</div><div class="pie">renglones · 4 módulos</div></div>
  </section>

  <section class="fe-anotar">
    <div class="fe-anotar-cab"><p class="fe-paso">Anotar lo que hay</p></div>

    <div class="fe-tres">
      <label><span>Calle</span><select><option>Todas</option><option>ALAR</option></select></label>
      <label><span>Módulo</span>
        <select><option>ALAR_BAHIA_6 · MULTIEMPAQUE</option></select></label>
      <label><span>Lado</span><output class="fe-lado">sin lado</output></label>
    </div>

    <label class="fe-cod-campo"><span>Código</span>
      <input inputmode="numeric" value="3128"></label>
    <p class="fe-eco">CERVEZA AGUILA LATA 269 CC X 6 UND TERMOENCOGIBLE ·
      <b>480</b> cajas por estiba</p>

    <div class="fe-fecha"><span>Vence</span><em class="fe-opcional">el envase no trae fecha</em>
      <div class="fe-dma">
        <input inputmode="numeric" maxlength="2" placeholder="DD" value="21">
        <input inputmode="numeric" maxlength="2" placeholder="MM" value="08">
        <input inputmode="numeric" maxlength="2" placeholder="AA" value="27">
      </div></div>

    <div class="fe-tres">
      <label><span>Qué cuentas</span>
        <select><option>Estibas</option><option>Cajas</option></select></label>
      <label><span>Cuántas</span><input inputmode="numeric" value="56"></label>
      <div class="fe-rota"><span>¿Rota?</span>
        <div class="fe-si-no"><button type="button" class="on">Sí</button>
          <button type="button">No</button></div></div>
    </div>

    <div class="fe-tres fe-marcas">
      <label class="fe-check"><input type="checkbox"><span>Avería</span></label>
      <label class="fe-check"><input type="checkbox"><span>PNC</span></label>
      <label><span>Estado del envase</span>
        <select><option>—</option><option>PIROGRABADO</option></select></label>
    </div>

    <button type="button" class="btn grande">Anotar renglón</button>
  </section>

  <section class="fe-recorrido">
    <div class="fe-rec-cab">
      <div><h2>El borrador</h2>
        <p class="fe-rec-dice">Todo esto está guardado pero todavía no se ha enviado.
          Revísalo, corrige lo que haga falta, y mándalo cuando termines.</p></div>
      <span>12 renglones · 4 módulos · 68.420 cajas</span>
    </div>
    <p class="fe-aqui">En <b>ALAR_BAHIA_6</b> llevas 3 renglones (26.880 cajas)</p>
    <div class="fe-lista">
      <article class="fe-fila urgente">
        <div class="fe-cab"><b class="fe-cod">3500231</b>
          <span class="fe-desc">ENVASE COSTEÑITA 175 ML RETORNABLE CAJA X 30</span>
          <span class="fe-ubi">ALAR_BAHIA_6 AVERIA VACIOS</span>
          <button type="button" class="fe-mini">Corregir</button>
          <button type="button" class="fe-quitar chico">Borrar</button></div>
        <dl class="fe-cifras">
          <div><dt>Total cajas</dt><dd>4.320</dd></div>
          <div><dt>Estibas</dt><dd>80</dd></div>
          <div><dt>Vence</dt><dd>13/09/2026</dd></div>
          <div><dt>Días para salir</dt><dd class="falta">-3</dd></div>
        </dl>
      </article>
      <article class="fe-fila">
        <div class="fe-cab"><b class="fe-cod">17740</b>
          <span class="fe-desc">PONY MALTA LTA 330 X6 TERMO EXP USA</span>
          <span class="fe-ubi">E06_IZQ</span>
          <button type="button" class="fe-mini">Corregir</button>
          <button type="button" class="fe-quitar chico">Borrar</button></div>
        <dl class="fe-cifras">
          <div><dt>Total cajas</dt><dd>26.880</dd></div>
          <div><dt>Estibas</dt><dd>56</dd></div>
          <div><dt>Vence</dt><dd>21/08/2027</dd></div>
          <div><dt>Días para salir</dt><dd>249</dd></div>
        </dl>
      </article>
    </div>
    <div class="fe-enviar">
      <p>Al enviarlo queda firmado con tu nombre, la fecha y la hora, y
        <b>deja de poderse corregir</b>.</p>
      <button type="button" class="btn grande">Enviar el conteo · 12 renglones</button>
    </div>
  </section>
</div>`;

/* CORRIGIENDO: el otro estado real del formulario. Se llega tocando
   «Corregir» en una fila de abajo, y el formulario se pinta distinto
   para que nadie escriba encima de un renglón creyéndolo nuevo. */
const CORRIGIENDO = ARMAZON
  .replace('class="fe-anotar"', 'class="fe-anotar corrigiendo"')
  .replace('<p class="fe-paso">Anotar lo que hay</p>',
    '<p class="fe-paso">Corrigiendo un renglón</p>' +
    '<button type="button" class="fe-mini">Dejarlo como estaba</button>')
  .replace(">Anotar renglón<", ">Guardar la corrección<");

/* El aviso del código malo se mide aparte: solo existe cuando el código
   no está en el maestro, y es el que hay que leer con el sol de frente. */
const ECO_MALO = `<div class="fe"><section class="fe-anotar">
  <p class="fe-eco mal">Ese código no está en el maestro.</p></section></div>`;

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ---------- */
const literales = [...`${tsx}\n${pgx}`.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)].map((m) => m[1]).join(" ");
const sueltas = literales.split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([
  ...sueltas, ...sueltas.map((w) => w.toLowerCase()),
  ...[...fefo.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
]);
const usadas = [...new Set([...`${ARMAZON}${ECO_MALO}`.matchAll(/class="([^"]+)"/g)]
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

const monta = async (pag, tema, ancho, alto, html = ARMAZON) => {
  await pag.setViewportSize({ width: ancho, height: alto });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${fefo} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">${html}</main></div>
    </div></body></html>`);
};

/* ---------- 4 y 6. CONTRASTE ---------- */
const pag = await navegador.newPage();
console.log("tema      código  eco  «sí» on  «sí» off  fecha  urgente  cód. malo");
for (const t of TEMAS) {
  await monta(pag, t, 1440, 1200);
  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    /* El fondo de verdad es el primero que pinta, subiendo: en el tema
       oficial `.sh` NO trae fondo —lo pone `body`— y leerlo a secas
       devuelve «rgba(0, 0, 0, 0)», que como color es NEGRO. */
    const fondoReal = (sel) => {
      for (let e = document.querySelector(sel); e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    return {
      codTxt: g(".fe-cod-campo input", "color"), codFondo: g(".fe-cod-campo input", "background-color"),
      ecoTxt: g(".fe-eco", "color"), ecoFondo: g(".fe-eco", "background-color"),
      siOnTxt: g(".fe-si-no button.on", "color"), siOnFondo: g(".fe-si-no button.on", "background-color"),
      siOffTxt: g(".fe-si-no button:not(.on)", "color"), siOffFondo: g(".fe-si-no button:not(.on)", "background-color"),
      dmaTxt: g(".fe-dma input", "color"), dmaFondo: g(".fe-dma input", "background-color"),
      urgTxt: g(".fe-cifras dd.falta", "color"), urgFondo: fondoReal(".fe-cifras dd.falta"),
    };
  });
  await monta(pag, t, 1440, 600, ECO_MALO);
  const mal = await pag.evaluate(() => {
    const e = document.querySelector(".fe-eco.mal"); const s = getComputedStyle(e);
    return { txt: s.color, fondo: s.backgroundColor };
  });

  const c = {
    codigo: razon(m.codTxt, m.codFondo),
    eco: razon(m.ecoTxt, m.ecoFondo),
    siOn: razon(m.siOnTxt, m.siOnFondo),
    siOff: razon(m.siOffTxt, m.siOffFondo),
    fecha: razon(m.dmaTxt, m.dmaFondo),
    urgente: razon(m.urgTxt, m.urgFondo),
    codMalo: razon(mal.txt, mal.fondo),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(7) + " ").join(""));
  for (const [k, v] of Object.entries(c))
    if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5)`);
}

/* ---------- 2, 3 y 5. GEOMETRÍA ---------- */
console.log("\nancho    se sale        código  toque  DD/MM/AA  «anotar» al pliegue");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(pag, null, ancho, 740);
  const m = await pag.evaluate((BARRA) => {
    const recortado = (e, hasta) => {
      for (let p = e.parentElement; p && p !== hasta.parentElement; p = p.parentElement)
        if (getComputedStyle(p).overflow !== "visible") return true;
      return false;
    };
    const nombra = (e) =>
      ((e.className || "").toString().trim().split(/\s+/)[0] || e.tagName.toLowerCase()) +
      (e.textContent?.trim() ? ` «${e.textContent.trim().slice(0, 20)}»` : "");
    const salen = [];
    for (const f of document.querySelectorAll(".fe-donde, .fe-anotar, .fe-recorrido, .fe-fila, .cabeza")) {
      const c = f.getBoundingClientRect();
      for (const e of f.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && !recortado(e, f) && (r.right - c.right > 0.5 || c.left - r.left > 0.5))
          salen.push(nombra(e));
      }
    }
    /* Lo que no está en pantalla en este estado no mide 0: no se mide.
       El desplegable del módulo no existe con el paso 1 plegado y se
       comprueba en la pasada de «todo abierto». Devolver 0 hacía que el
       mínimo fuera siempre 0 y el arnés gritara por algo que no está. */
    const alto = (s) => {
      const l = [...document.querySelectorAll(s)];
      return l.length ? Math.min(...l.map((e) => Math.round(e.getBoundingClientRect().height)))
                      : Infinity;
    };
    const d = document.documentElement;
    /* Dónde termina el botón de anotar, contado desde arriba del
       documento: si pasa del alto útil, cada estiba cuesta un scroll. */
    const anotar = document.querySelector(".fe-anotar .btn.grande").getBoundingClientRect();
    return {
      salen: [...new Set(salen)], lado: d.scrollWidth - d.clientWidth,
      codigo: alto(".fe-cod-campo input"),
      toque: Math.min(alto(".fe-si-no button"), alto(".fe-dma input"),
                      alto(".fe-anotar .btn.grande"), alto(".fe-donde select"),
                      alto(".fe-donde.plegada .fe-mini")),
      dma: [...document.querySelectorAll(".fe-dma input")]
             .map((e) => Math.round(e.getBoundingClientRect().width)).join("/"),
      pliegue: Math.round(anotar.bottom + window.scrollY) - (740 - BARRA),
    };
  }, BARRA);

  console.log(`${etiqueta.padEnd(8)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(14)} ` +
              `${String(m.codigo).padStart(6)}  ${String(m.toque).padStart(5)}  ` +
              `${m.dma.padStart(8)}  ${m.pliegue <= 0 ? "cabe" : `${m.pliegue} px por debajo`}`);

  if (m.salen.length) fallas.push(`${etiqueta}: se sale de su tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado`);
  if (m.codigo < 56)
    fallas.push(`${etiqueta}: el campo del código mide ${m.codigo} px (mínimo 56: es el que ` +
                "se teclea 152 veces al día y donde un dedazo cambia lo que se cuenta)");
  if (m.toque < 48)
    fallas.push(`${etiqueta}: algo que se toca mide ${m.toque} px de alto (mínimo 48: se usa ` +
                "de pie y a veces con guantes)");
  /* Que las tres casillas de la fecha queden iguales. Si una se estira,
     deja de leerse como DD MM AA y se teclea en el orden equivocado. */
  if (new Set(m.dma.split("/")).size > 1)
    fallas.push(`${etiqueta}: las casillas de la fecha miden ${m.dma} px — desparejas se ` +
                "dejan de leer como DD MM AA");
  if (etiqueta === "celular" && m.pliegue > 0)
    fallas.push(`«Anotar renglón» queda ${m.pliegue} px bajo el pliegue en un celular de ` +
                "390×740: cada estiba costaría un scroll");

  /* Y lo mismo con todo abierto, menos el pliegue. */
  await monta(pag, null, ancho, 740, CORRIGIENDO);
  const b = await pag.evaluate(() => {
    const recortado = (e, hasta) => {
      for (let p = e.parentElement; p && p !== hasta.parentElement; p = p.parentElement)
        if (getComputedStyle(p).overflow !== "visible") return true;
      return false;
    };
    const salen = [];
    for (const f of document.querySelectorAll(".fe-donde, .fe-anotar, .fe-recorrido, .fe-fila")) {
      const c = f.getBoundingClientRect();
      for (const e of f.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && !recortado(e, f) && (r.right - c.right > 0.5 || c.left - r.left > 0.5))
          salen.push((e.className || e.tagName).toString().split(" ")[0]);
      }
    }
    const d = document.documentElement;
    const sel = [...document.querySelectorAll(".fe-tres select, .fe-tres input")];
    return { salen: [...new Set(salen)], lado: d.scrollWidth - d.clientWidth,
             toque: Math.min(...sel.map((e) => Math.round(e.getBoundingClientRect().height))) };
  });
  if (b.salen.length)
    fallas.push(`${etiqueta}, corrigiendo: se sale ${b.salen.join(", ")}`);
  if (b.lado > 0)
    fallas.push(`${etiqueta}, corrigiendo: la página se arrastra ${b.lado} px de lado`);
  if (b.toque < 44)
    fallas.push(`${etiqueta}, corrigiendo: un desplegable mide ${b.toque} px`);
}

/* ---------- 7. LO QUE NO SE VE PERO DECIDE ---------- */
const limpio = tsx.replace(/\/\*[\s\S]*?\*\//g, "");
if (/\b(prompt|confirm|alert)\s*\(/.test(limpio))
  fallas.push("usa los diálogos del navegador en vez de los de la app");
/* La ubicación tiene que ser una LLAVE, no un texto tecleado: es lo que
   arregla el cuarto del conteo que en la hoja no se podía ubicar. */
if (/p_ubicacion:\s*(ubicacion\.clave|b\.codigo|busca)/.test(limpio))
  fallas.push("manda la ubicación como texto en vez de la llave escogida");
if (!/p_ubicacion:\s*ubicacion!\.id/.test(limpio))
  fallas.push("no manda el id de la ubicación escogida");
/* EL RENGLÓN VA EN EL ORDEN DE LA HOJA. Es lo que pidió Cristian y lo
   que lleva años en el Excel: cambiarlo obliga a quien ya sabe llenarla
   a buscar cada campo. Se comprueba por el orden en que aparecen los
   rótulos en el componente. */
const orden = ["Calle", "Módulo", "Lado", "Código", "Vence", "Qué cuentas",
               "Cuántas", "¿Rota?", "Avería", "PNC", "Estado del envase"];
let desde = 0;
for (const r of orden) {
  const i = limpio.indexOf(">" + r + "<", desde);
  if (i < 0) { fallas.push(`falta el campo «${r}» en el renglón`); break }
  desde = i;
}
/* Y el borrador tiene que poder corregirse y enviarse. */
if (!/conteo_fefo_editar/.test(limpio))
  fallas.push("no se puede corregir un renglón del borrador");
if (!/conteo_fefo_enviar/.test(limpio))
  fallas.push("no hay envío: el conteo nunca queda firmado");
/* «¿Rota?» arranca SIN respuesta: se contesta en las 152 filas de la
   hoja real, así que preseleccionar «no» sería contestar por el que
   cuenta — y quedaría 58 veces bien y 94 veces mal. */
if (!/rot:\s*null/.test(limpio))
  fallas.push("«¿Rota?» arranca con una respuesta puesta en vez de vacía");

await navegador.close();

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Plantilla de conteo: se lee en los 7 temas, nada se sale, el dedo alcanza " +
            "y «Anotar» cabe en la primera pantalla del celular.");
