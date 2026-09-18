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

  <div class="fe-pes fe-pes-conteo" role="tablist">
    <button type="button" role="tab" class="on">Anotar</button>
    <button type="button" role="tab">El borrador<em>152</em></button>
  </div>

  <section class="fe-anotar">
    <div class="fe-anotar-cab"><p class="fe-paso">Anotar lo que hay</p></div>

    <div class="fe-tres">
      <label><span>Calle</span>
        <div class="bs"><input class="bs-campo" value="Todas"><span class="bs-flecha">▾</span>
          <ul class="bs-lista"><li class="on"><b>A</b></li><li><b>ALAR</b></li>
            <li><b>JAULA_PNC</b><em>PRODUCTO NO CONFORME</em></li></ul></div></label>
      <label><span>Módulo</span>
        <div class="bs"><input class="bs-campo" value="ALAR06"><span class="bs-flecha">▾</span></div></label>
      <label><span>Lado</span>
        <select><option>Escoge…</option><option>Izquierdo</option><option>Derecho</option></select></label>
    </div>

    <div class="fe-cod-dos">
      <label><span>Código</span><input inputmode="numeric" value="3128"></label>
      <label><span>Descripción</span>
        <output class="fe-desc-campo">CERVEZA AGUILA LATA 269 CC X 6 UND TERMOENCOGIBLE</output></label>
    </div>
    <p class="fe-eco"><b>480</b> cajas por estiba</p>

    <div class="fe-fecha">
      <div class="fe-que-fecha">
        <button type="button">Vence</button>
        <button type="button" class="on">Se fabricó</button>
      </div>
      <em class="fe-opcional">el envase no trae fecha</em>
      <div class="fe-dma">
        <input inputmode="numeric" maxlength="2" placeholder="DD" value="21">
        <input inputmode="numeric" maxlength="2" placeholder="MM" value="08">
        <input inputmode="numeric" maxlength="2" placeholder="AA" value="27">
      </div>
      <p class="fe-calculada">Vence el <b>6/11/2027</b> · 180 días de vida útil</p>
    </div>

    <div class="fe-tres">
      <label><span>Qué cuentas</span>
        <select><option>Estibas</option><option>Saldo</option><option>Cajas</option></select></label>
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
    <div class="fe-alerta mal">
      <p><b>2 renglones ya se pasaron de su fecha de salida</b> — 3128 · 9139. No es que esté
        vencido: es que ya no alcanza a llegar al cliente con vida útil suficiente.</p>
      <p class="suave">Y 3 salen esta semana — 3751 · 17740 · 20050.</p>
    </div>
    <div class="fe-filtros">
      <label class="ancho"><span class="sr">Buscar</span>
        <input placeholder="Código o descripción — 3128, aguila…"></label>
      <label><span class="sr">Calle</span>
        <select><option>Todas las calles</option><option>ALAR</option></select></label>
      <label><span class="sr">Módulo</span>
        <select><option>Todos los módulos</option><option>ALAR_BAHIA_6</option></select></label>
      <button type="button" class="btn plano">Quitar filtros</button>
    </div>
    <p class="fe-cuenta-filtro">3 de 152 renglones. <b>Enviar manda los 152</b>, no solo los
      que se ven.</p>
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
  <div class="fe-cod-dos"><label><span>Código</span><input value="9999"></label>
  <label><span>Descripción</span>
    <output class="fe-desc-campo mal"><i>Ese código no está en el maestro.</i></output></label>
  </div></section></div>`;

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
      codTxt: g(".fe-cod-dos input", "color"), codFondo: g(".fe-cod-dos input", "background-color"),
      ecoTxt: g(".fe-eco", "color"), ecoFondo: g(".fe-eco", "background-color"),
      siOnTxt: g(".fe-si-no button.on", "color"), siOnFondo: g(".fe-si-no button.on", "background-color"),
      siOffTxt: g(".fe-si-no button:not(.on)", "color"), siOffFondo: g(".fe-si-no button:not(.on)", "background-color"),
      dmaTxt: g(".fe-dma input", "color"), dmaFondo: g(".fe-dma input", "background-color"),
      urgTxt: g(".fe-cifras dd.falta", "color"), urgFondo: fondoReal(".fe-cifras dd.falta"),
    };
  });
  await monta(pag, t, 1440, 600, ECO_MALO);
  const mal = await pag.evaluate(() => {
    const e = document.querySelector(".fe-desc-campo.mal"); const s = getComputedStyle(e);
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
      codigo: alto(".fe-cod-dos input"),
      toque: Math.min(alto(".fe-si-no button"), alto(".fe-dma input"),
                      alto(".fe-anotar .btn.grande"), alto(".fe-donde select, .fe-donde .bs-campo"),
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
const orden = ["Calle", "Módulo", "Lado", "Código", "Descripción", "Vence", "Qué cuentas",
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

/* ---------- LO QUE PIDIÓ HOY, COMPROBADO EN EL COMPONENTE ----------

   LAS LETRAS ANTES QUE LOS NOMBRES. Ordenado a secas la lista queda A,
   ALAR, B, BAHIA, C, CARPA… y encontrar la calle C obliga a leerla
   entera. Las de una letra son las que se caminan todos los días.
   Se comprueba ejecutando el comparador del componente, no leyendo que
   exista: un `sort()` con un comparador que no ordena pasa igual. */
{
  const m = limpio.match(/const ordenCalle = \(a: string, b: string\) => \{([\s\S]*?)\n\};/);
  if (!m) fallas.push("no hay un orden propio para las calles: quedarían A, ALAR, B, BAHIA…");
  else {
    const fn = new Function("a", "b", m[1].replace(/: string/g, ""));
    const dio = ["BAHIA", "C", "ALAR", "A", "JAULA_PNC", "B", "EST"].sort(fn);
    const debe = ["A", "B", "C", "ALAR", "BAHIA", "EST", "JAULA_PNC"];
    if (dio.join(",") !== debe.join(","))
      fallas.push(`las calles quedan [${dio.join(", ")}] y deben quedar [${debe.join(", ")}]`);
  }
}

/* EL MÓDULO VA SIN EL LADO PEGADO. Salía «A01_DER · RB F1000», que hacía
   escoger el lado dos veces: dentro del nombre y en el campo de al lado.
   La opción se arma con calle+módulo, nunca con `clave`. */
if (/valor: m\.base[\s\S]{0,200}?texto: `\$\{u?\.?clave/.test(limpio) || /texto: `\$\{m\.clave/.test(limpio))
  fallas.push("el módulo sigue mostrando la clave con el lado pegado");
if (!/texto: `\$\{m\.calle\}\$\{m\.modulo\}`/.test(limpio))
  fallas.push("el módulo no se arma con calle+módulo: volvería a traer el lado");

/* Y LA OPCIÓN DEL MÓDULO NO LLEVA NADA MÁS. La familia estaba detrás
   —«A01  RB F1000»— y se fue: quien está parado frente a un módulo sabe
   en cuál está, y «RB F1000» repetido en doscientas filas obliga a leer
   de más para encontrar el número. */
{
  const bloque = (limpio.match(/opciones=\{modulos\.map\([\s\S]{0,260}?\)\)\}/) ?? [""])[0];
  if (/pista:/.test(bloque))
    fallas.push("la lista de módulos volvió a traer la familia detrás del número");
}

/* Y EL LADO SE ESCOGE ENTRE LOS QUE EXISTEN, no entre los tres siempre.
   Ofrecer «izquierdo» en un módulo que no lo tiene es ofrecer una
   ubicación que no está — lo que dejó 38 de 152 filas sin ubicar. */
if (!/const lados = useMemo/.test(limpio))
  fallas.push("el lado no sale de las ubicaciones del módulo: ofrecería lados que no existen");

/* LOS DOS BUSCADORES SE TECLEAN. Con 428 ubicaciones un `<select>` solo
   deja saltar por la primera letra. */
if ((limpio.match(/<Buscador/g) ?? []).length < 2)
  fallas.push("calle o módulo siguen siendo un desplegable: con 428 ubicaciones no se puede buscar");

/* SALDO, LA TERCERA CANTIDAD, y arrancando en estibas —que es lo que más
   se cuenta—. Si `p_saldo` no viaja, el renglón se guarda con la cifra
   en la columna equivocada y el total sale corto. */
if (!/p_saldo:/.test(limpio))
  fallas.push("no manda el saldo: la cifra caería en cajas o se perdería");
if (!/modo: "estibas"/.test(limpio))
  fallas.push("«Qué cuentas» no arranca en estibas");
if (!/r\.estibas != null \? "estibas" : r\.saldo != null \? "saldo" : "cajas"/.test(limpio))
  fallas.push("al corregir no se distingue un saldo de unas cajas: se cargaría como cajas");

/* ---------- ANOTAR DEJA EL RENGLÓN EN CERO ----------
   Solo el sitio se queda —sigo parado frente al mismo módulo—. Código,
   fecha, cantidad, ¿rota? y las marcas vuelven a vacío, porque el
   siguiente renglón es otra estiba.

   LA FECHA ES LA QUE IMPORTA AQUÍ. Se quedaba puesta a propósito, y
   estaba mal por dos razones: hay que borrar tres casillas antes de
   teclear otra, y —peor— una fecha que quedó del renglón anterior no se
   ve como un campo por llenar sino como uno ya lleno, así que se anota
   sin que nadie lo note. */
if (!/function limpiar\(\) \{\s*\n\s*setCorrigiendo\(null\);\s*\n\s*setB\(VACIO\);/.test(limpio))
  fallas.push("al anotar no se limpia el renglón ENTERO: un campo que quedó lleno del " +
              "anterior no se ve como un campo por llenar, se ve como uno ya contestado");

/* Y EL MARCADOR DEL CÓDIGO NO PUEDE SER UN CÓDIGO DE VERDAD. Decía
   «3128» —la Águila 330— y en gris dentro de un campo grande se lee como
   un campo ya lleno, sobre todo justo después de anotar. */
if (/placeholder="\d+"/.test(limpio))
  fallas.push("el marcador del código es un número: se confunde con un código ya tecleado");

/* ---------- LA FECHA DE FÁBRICA, Y EL VENCIMIENTO CALCULADO ----------
   Unas estibas traen impreso el vencimiento y otras la fabricación, y
   hasta ahora había que hacer la cuenta de cabeza antes de teclear.

   LO QUE SE MANDA ES LO QUE SE TECLEÓ. Con la fabricación, el
   vencimiento viaja en NULL y lo calcula la base con la vida útil del
   maestro. Si la pantalla mandara un vencimiento ya calculado, habría
   dos versiones de la misma fórmula —una aquí y otra en la base—
   esperando a discrepar el día que alguien corrija una vida útil. */
if (!/p_fab_dia:/.test(limpio))
  fallas.push("no se puede teclear la fecha de fabricación");
if (!/p_venc_dia: b\.fecha === "vence" \? ent\(b\.dia\) : null/.test(limpio))
  fallas.push("con la fabricación puesta se sigue mandando un vencimiento: la cuenta " +
              "quedaría escrita en dos sitios");
/* Y LA VISTA PREVIA ES SOLO PARA ENSEÑAR. Que exista —es lo que se pidió
   ver— pero que NO sea lo que se guarda. */
if (!/const fechaCalculada = useMemo/.test(limpio))
  fallas.push("la pantalla no enseña cuándo vence mientras se teclea la fecha de fábrica");
if (/p_venc_[a-z]+: fechaCalculada/.test(limpio))
  fallas.push("se está guardando el vencimiento calculado EN LA PANTALLA en vez de mandar " +
              "la fabricación y dejar que la base haga la cuenta");
/* Al corregir se vuelve a abrir con la fecha que se tecleó, no con la
   calculada: quien vuelve a mirar la estiba lee el mismo número. */
if (!/fecha: r\.fab_anio != null \? "fabrica" : "vence"/.test(limpio))
  fallas.push("al corregir no se recuerda cuál de las dos fechas se había tecleado");

/* ---------- NO BAJARSE COLUMNAS QUE NO SE USAN ----------
   `productos` tiene 28 columnas y esta pantalla usa 16. Con `select("*")`
   son 413 KB por carga en vez de 259; con treinta personas abriendo al
   empezar el turno, cinco megas de más sobre el wifi de una bodega, cada
   vez. Aquí decía `*` con un comentario mío afirmando que daba igual.
   Medido, no daba igual. */
{
  const datos = readFileSync(new URL("../src/modulos/inventario/fefo.ts", import.meta.url), "utf8");
  if (/from\("productos"\)\.select\("\*"\)/.test(datos))
    fallas.push("el maestro de productos se baja con select(*): 28 columnas para usar 16, " +
                "134 KB de más por carga y por persona");
  if (/from\("ubicaciones"\)\.select\("\*"\)/.test(datos))
    fallas.push("el maestro de ubicaciones se baja con select(*)");
}

/* ---------- EL RENGLÓN A MEDIO ESCRIBIR NO SE PIERDE ----------
   Lo anotado está a salvo desde que se toca «Anotar»: cada renglón se
   guarda en la base al instante. Lo que no lo estaba era lo tecleado y
   todavía no anotado, y en una bodega eso se pierde por cualquier cosa
   —la señal se cae, el celular se bloquea, alguien recarga—.

   LA LLAVE LLEVA EL ID DEL CONTEO: sin eso, quien cierra un recorrido y
   abre otro se encontraría el renglón a medias del anterior, que ya no
   tiene sentido porque ese conteo está enviado.

   Y TIENE QUE IR EN try/catch: en modo privado, con el almacenamiento
   lleno o con permisos restringidos, `localStorage` LANZA. Sin el
   try/catch, la pantalla de contar se cae entera — y no poder contar es
   infinitamente peor que perder un renglón a medias. */
if (!/localStorage\.setItem/.test(limpio) || !/localStorage\.getItem/.test(limpio))
  fallas.push("el renglón a medio escribir no sobrevive a un refresco ni a una señal caída");
if (!/fefo\.renglon\.\$\{conteo\.id\}/.test(limpio))
  fallas.push("el renglón guardado no lleva el id del conteo: al abrir un recorrido nuevo " +
              "aparecería el renglón a medias del anterior");
{
  const usos = (limpio.match(/localStorage\./g) ?? []).length;
  const catches = (limpio.match(/\} catch/g) ?? []).length;
  if (catches < 3 || usos > catches + 1)
    fallas.push("algún uso de localStorage queda sin try/catch: en modo privado LANZA y " +
                "tumbaría la pantalla de contar entera");
}

/* Y AL ANOTAR SE BORRA EL GUARDADO: el renglón ya quedó en la base, así
   que restaurarlo mañana sería ofrecer volver a anotar lo ya anotado. */
if (!/localStorage\.removeItem/.test(limpio))
  fallas.push("al anotar no se borra el renglón guardado: volvería a aparecer mañana");

/* ---------- EL BORRADOR SE FILTRA ----------
   Ciento cincuenta renglones en una jornada: buscar el 3128 que se anotó
   hace dos horas rodando la lista es como se termina corrigiendo el
   renglón equivocado. */
for (const [re_, que] of [
  [/const \[fCodigo, setFCodigo\]/, "por código"],
  [/const \[fCalle, setFCalle\]/, "por calle"],
  [/const \[fModulo, setFModulo\]/, "por módulo"],
]) if (!re_.test(limpio)) fallas.push(`el borrador no se puede filtrar ${que}`);

/* Y LA LISTA TIENE QUE DIBUJAR LO FILTRADO. Con el filtro puesto pero la
   lista leyendo `renglones`, los campos se mueven y no pasa nada — que
   es peor que no tenerlos. */
if (!/\{vistos\.map\(\(r\) =>/.test(limpio))
  fallas.push("la lista del borrador no dibuja lo filtrado: los filtros no harían nada");

/* «ENVIAR MANDA LOS 152, NO LOS 3 QUE SE VEN». Un filtro puesto hace que
   la lista se vea corta, y de ahí a creer que el conteo va corto hay un
   paso — y ese paso termina en un conteo enviado a medias. */
if (!/Enviar manda los/.test(limpio))
  fallas.push("con el filtro puesto no se dice que enviar manda TODO: se podría creer que " +
              "el conteo va corto");

/* ---------- LA ALERTA DE FECHA CORTA ----------
   Quien acaba de anotar sigue parado frente a esa estiba: es el único
   instante en que puede mirarla otra vez y sacarla. Dicho media hora
   después, en el tablero, hay que volver a caminar hasta allá.

   Y EL NÚMERO LO TRAE LA VISTA. Si la pantalla lo recalculara, la alerta
   y el tablero podrían decir cosas distintas del mismo renglón. */
if (!/dias_para_salir/.test(limpio))
  fallas.push("no hay alerta de fecha corta al anotar");
if (/vida_util[\s\S]{0,80}-[\s\S]{0,40}dias_minimo/.test(limpio))
  fallas.push("la pantalla recalcula los días para salir en vez de leerlos de la vista");

/* ---------- DOS PESTAÑAS Y NO UNA PÁGINA LARGA ----------
   Contar y revisar son dos momentos: contando se mira UN renglón,
   revisando se miran los ciento cincuenta. Apilados, cada renglón
   anotado empujaba el formulario y había que buscarlo otra vez. */
if (!/hidden=\{pestania !== "anotar"\}/.test(limpio) ||
    !/hidden=\{pestania !== "borrador"\}/.test(limpio))
  fallas.push("el formulario y el borrador no están en pestañas: vuelven a ser una página larga");

/* CORREGIR TIENE QUE LLEVAR AL FORMULARIO. Se toca «Corregir» en una
   fila del borrador; si la pantalla se queda en la lista, el renglón se
   carga en un formulario que no se ve y el siguiente que se anote
   escribe encima de él. */
if (!/setPestania\("anotar"\);\s*\n\s*setCorrigiendo/.test(limpio))
  fallas.push("«Corregir» no lleva al formulario: se editaría a ciegas");

/* ---------- QUE `[hidden]` GANE AUNQUE ALGUIEN LE PONGA `display` ----------
   Hoy ninguna de las dos secciones fija `display`, así que el
   `display: none` que trae el navegador para `[hidden]` funciona solo.
   Comprobarlo tal cual sería una aserción que NO PUEDE FALLAR, y este
   proyecto ya aprendió lo que cuestan.

   Lo que se mide es el riesgo real: que mañana alguien le ponga
   `display: flex` a `.fe .fe-recorrido` —para alinear algo— y con eso
   (0,2,0) pise el (0,1,0) del navegador. La sección quedaría oculta en
   el papel y VISIBLE en pantalla, con las dos pestañas encendidas a la
   vez. Así que la regla se inyecta aquí y se mide si `[hidden]` aguanta.

   Verificado quitando `.fe [hidden] { display: none !important }`: sin
   esa línea, esto falla. */
{
  await monta(pag, null, 1440, 1100);
  const mal = await pag.evaluate(() => {
    const s = document.querySelector(".fe-recorrido");
    if (!s) return "no existe .fe-recorrido en el armazón";
    const hoja = document.createElement("style");
    hoja.textContent = ".fe .fe-recorrido { display: flex }";
    document.head.appendChild(hoja);
    s.setAttribute("hidden", "");
    const d = getComputedStyle(s).display;
    s.removeAttribute("hidden");
    hoja.remove();
    return d === "none" ? null : `con [hidden] y un display propio queda en display:${d}`;
  });
  if (mal) fallas.push(`el borrador no se ocultaría al cambiar de pestaña — ${mal}`);
}

await navegador.close();

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Plantilla de conteo: se lee en los 7 temas, nada se sale, el dedo alcanza " +
            "y «Anotar» cabe en la primera pantalla del celular.");
