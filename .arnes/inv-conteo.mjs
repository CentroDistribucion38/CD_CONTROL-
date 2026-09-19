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

    <div class="fe-bloque">
      <p class="fe-bloque-cab">Dónde</p>
      <div class="fe-tres dos">
        <label><span>Calle</span>
          <div class="bs"><input class="bs-campo" value="Todas"><span class="bs-flecha">▾</span>
            <ul class="bs-lista"><li class="on"><b>A</b></li><li><b>ALAR</b></li>
              <li><b>JAULA_PNC</b><em>PRODUCTO NO CONFORME</em></li></ul></div></label>
        <label><span>Módulo</span>
          <div class="bs"><input class="bs-campo" value="ALAR06"><span class="bs-flecha">▾</span></div></label>
      </div>
      <div class="fe-lado-campo">
        <span class="fe-lado-rot">Lado</span>
        <div class="fe-segmento" role="group">
          <button type="button" class="on">Izquierdo</button>
          <button type="button">Derecho</button>
        </div>
      </div>
    </div>

    <div class="fe-bloque">
      <p class="fe-bloque-cab">Qué</p>
      <div class="fe-cod-dos">
        <label><span>Código</span><input inputmode="numeric" value="3128"></label>
        <label><span>Descripción</span>
          <output class="fe-desc-campo">CERVEZA AGUILA LATA 269 CC X 6 UND TERMOENCOGIBLE</output></label>
      </div>
      <p class="fe-eco"><b>45</b> cajas por estiba</p>

      <div class="fe-fecha">
        <div class="fe-que-fecha">
          <span class="fe-etiq-fecha">Vence</span>
          <em class="fe-opcional">el envase no trae fecha</em>
        </div>
        <div class="fe-dma">
          <input inputmode="numeric" maxlength="2" placeholder="DD" value="11">
          <input inputmode="numeric" maxlength="2" placeholder="MM" value="03">
          <input inputmode="numeric" maxlength="2" placeholder="AA" value="27">
        </div>
        <div class="fe-dias">
          <span class="fe-dias-par"><b>249</b><em>días para salir</em></span>
          <span class="fe-dias-par suave"><b>339</b><em>días para vencer</em></span>
        </div>
      </div>
    </div>

    <div class="fe-bloque">
      <p class="fe-bloque-cab">Cuánto</p>
      <div class="fe-segmento" role="group">
        <button type="button" class="on">Estibas</button>
        <button type="button">Cajas</button>
      </div>
      <div class="fe-dos">
        <label><span>Estibas completas</span><input inputmode="numeric" value="12"></label>
        <label><span>Saldo · cajas sueltas</span><input inputmode="numeric" value="8"></label>
      </div>
      <label class="fe-estado"><span>Estado del envase</span>
        <select><option>—</option><option>PIROGRABADO</option></select></label>
      <p class="fe-total"><span class="fe-formula">12 × 45 + 8</span><b>548</b> cajas</p>
    </div>

    <div class="fe-bloque">
      <p class="fe-bloque-cab">Cómo está</p>
      <div class="fe-rota"><span>¿Rota?</span>
        <div class="fe-si-no una"><button type="button">Sí, rota</button></div></div>
      <div class="fe-marcas dos">
        <button type="button" class="fe-marca on">Avería</button>
        <button type="button" class="fe-marca">PNC</button>
      </div>
      <label class="fe-nota"><span>Observación</span>
        <input placeholder="Opcional — lo que haya que decir de esta estiba"></label>
    </div>

    <div class="fe-barra-fija">
      <p class="fe-fija-cuenta"><b>152</b> en el borrador</p>
      <button type="button" class="btn grande">Anotar renglón</button>
    </div>
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
      <button type="button" class="btn fe-mandar-ya">Enviar el conteo</button>
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
          <div><dt>Estibas + saldo</dt><dd>80 + 12</dd></div>
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

/* LOS DOS ESTADOS DE LAS CIFRAS DEL FEFO. Son los que hay que poder leer
   con el sol de frente, y son la única pareja de la pantalla que NO sale
   de los tokens del tema: rojo sobre rosa y ámbar sobre crema. */
const DIAS_MAL = ARMAZON
  .replace('<div class="fe-dias">', '<div class="fe-dias mal">')
  .replace("<b>249</b><em>días para salir</em>",
           "<b>se pasó por 12</b><em>días de su fecha de salida</em>");
const DIAS_OJO = ARMAZON
  .replace('<div class="fe-dias">', '<div class="fe-dias ojo">')
  .replace("<b>249</b>", "<b>4</b>");

/* CORRIGIENDO: el otro estado real del formulario. Se llega tocando
   «Corregir» en una fila de abajo, y el formulario se pinta distinto
   para que nadie escriba encima de un renglón creyéndolo nuevo. */
const CORRIGIENDO = ARMAZON
  .replace('class="fe-anotar"', 'class="fe-anotar corrigiendo"')
  .replace('<p class="fe-paso">Anotar lo que hay</p>',
    '<p class="fe-paso">Corrigiendo un renglón</p>' +
    '<button type="button" class="fe-mini">Dejarlo como estaba</button>')
  .replace(">Anotar renglón<", ">Guardar la corrección<");

/* EL MÓDULO CON UN SOLO LADO —EST07, JAULA_PNC— no pregunta nada: lo
   enseña. Es otro estado real y tiene que leerse igual de bien. */
const UN_LADO = ARMAZON.replace(
  `<div class="fe-segmento" role="group">
          <button type="button" class="on">Izquierdo</button>
          <button type="button">Derecho</button>
        </div>`,
  '<output class="fe-lado">Este módulo no tiene lados</output>');

/* LA PRE-ANOTACIÓN D-1, que es el estado NORMAL de un módulo que ya se
   ha contado alguna vez: se escoge la posición y salen las tarjetas de
   lo que se contó ahí la última vez. Va aparte del armazón porque el
   armazón mide el otro estado —posición nueva, o tarjetas cerradas— y
   ahí «Anotar renglón» tiene que caber sin rodar.

   Aquí lo que tiene que caber sin rodar son LOS DOS BOTONES de la
   primera tarjeta: si la respuesta es «sigue igual», el renglón se
   acabó ahí. */
const TARJETAS = `
    <div class="fe-bloque fe-previo">
      <div class="fe-previo-cab">
        <p class="fe-previo-rot">La última vez en ALAR06_IZQ<em>hace 12 días</em></p>
        <button type="button" class="fe-mini">Aquí hay otra cosa</button>
      </div>
      <div class="fe-tarjeta">
        <p class="fe-tarjeta-que"><b>3128</b>
          <span>CERVEZA AGUILA LATA 269 CC X 6 UND TERMOENCOGIBLE</span></p>
        <p class="fe-tarjeta-cifra">96 estibas<em>vence 11/03/27</em></p>
        <p class="fe-tarjeta-marcas"><span>Rota</span><span>Avería</span><span>ENVASE SUCIO</span></p>
        <div class="fe-tarjeta-pie">
          <button type="button" class="fe-si">Sigue igual</button>
          <button type="button" class="fe-no">Cambió</button>
        </div>
      </div>
      <div class="fe-tarjeta hecha">
        <p class="fe-tarjeta-que"><b>17740</b><span>CANASTA PLASTICA RETORNABLE</span></p>
        <p class="fe-tarjeta-cifra">1.240 cajas</p>
        <p class="fe-tarjeta-hecha">Ya lo contaste en este recorrido.</p>
      </div>
    </div>
`;
const PREVIO = ARMAZON.replace('    <div class="fe-bloque">\n      <p class="fe-bloque-cab">Qué</p>',
  TARJETAS + '\n    <div class="fe-bloque">\n      <p class="fe-bloque-cab">Qué</p>');

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
const usadas = [...new Set([...`${ARMAZON}${TARJETAS}${ECO_MALO}`.matchAll(/class="([^"]+)"/g)]
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
console.log("tema      código  eco  «sí» on  «sí» off  fecha  total  1 lado  d.salir  d.vencer  urgente  malo");
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
      /* MARCADO Y SIN MARCAR, LA MISMA PIEZA EN SUS DOS ESTADOS. «¿Rota?»
         se quedó con un solo botón —no marcarlo es decir que no— así que
         el estado apagado se mide ahí, que es como se ve casi siempre, y
         el encendido en el cuadro de Avería, que es el mismo control.
         Medir un botón «No» que ya no existe daba contraste 1: no medía
         nada y salía en rojo por la razón equivocada. */
      siOnTxt: g(".fe-marca.on", "color"), siOnFondo: g(".fe-marca.on", "background-color"),
      siOffTxt: g(".fe-si-no button:not(.on)", "color"), siOffFondo: g(".fe-si-no button:not(.on)", "background-color"),
      dmaTxt: g(".fe-dma input", "color"), dmaFondo: g(".fe-dma input", "background-color"),
      /* EL TOTAL VIVO. Es la cifra que se mira de reojo mientras se
         teclea —548 cajas— y descansa en el panel tintado, que es
         justo donde --fe-gris se cae por debajo de la norma. */
      totTxt: g(".fe-total b", "color"), totFondo: fondoReal(".fe-total b"),
      urgTxt: g(".fe-cifras dd.falta", "color"), urgFondo: fondoReal(".fe-cifras dd.falta"),
    };
  });

  /* LOS DOS ESTADOS DE «DÍAS PARA SALIR», cada uno en su propia pasada:
     son la única pareja que no sale de los tokens del tema —rojo sobre
     rosa, ámbar sobre crema— y los dos existen solo cuando hay algo que
     hacer con la estiba que se tiene delante. */
  await monta(pag, t, 1440, 1200, DIAS_MAL);
  const dmal = await pag.evaluate(() => {
    const e = document.querySelector(".fe-dias.mal .fe-dias-par em"); const s = getComputedStyle(e);
    let f = e; for (; f; f = f.parentElement) {
      const c = getComputedStyle(f).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) break;
    }
    return { txt: s.color, fondo: f ? getComputedStyle(f).backgroundColor : "rgb(255,255,255)" };
  });
  await monta(pag, t, 1440, 1200, DIAS_OJO);
  const dojo = await pag.evaluate(() => {
    const e = document.querySelector(".fe-dias.ojo .fe-dias-par em"); const s = getComputedStyle(e);
    let f = e; for (; f; f = f.parentElement) {
      const c = getComputedStyle(f).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) break;
    }
    return { txt: s.color, fondo: f ? getComputedStyle(f).backgroundColor : "rgb(255,255,255)" };
  });
  await monta(pag, t, 1440, 1200, UN_LADO);
  const unlado = await pag.evaluate(() => {
    const e = document.querySelector(".fe-lado"); const s = getComputedStyle(e);
    let f = e; for (; f; f = f.parentElement) {
      const c = getComputedStyle(f).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) break;
    }
    return { txt: s.color, fondo: f ? getComputedStyle(f).backgroundColor : "rgb(255,255,255)",
             alto: Math.round(e.getBoundingClientRect().height) };
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
    total: razon(m.totTxt, m.totFondo),
    unLado: razon(unlado.txt, unlado.fondo),
    diasSalir: razon(dmal.txt, dmal.fondo),
    diasVencer: razon(dojo.txt, dojo.fondo),
    urgente: razon(m.urgTxt, m.urgFondo),
    codMalo: razon(mal.txt, mal.fondo),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(7) + " ").join(""));
  for (const [k, v] of Object.entries(c))
    if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5)`);
}

/* ---------- 2, 3 y 5. GEOMETRÍA ---------- */
console.log("\nancho    se sale        código  cifra  toque  DD/MM/AA  «anotar»");
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
    for (const f of document.querySelectorAll(".fe-anotar, .fe-recorrido, .fe-fila, .cabeza")) {
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
    /* ¿SE VE «ANOTAR RENGLÓN» SIN BAJAR? Antes se medía si CABÍA en la
       primera pantalla —su posición en el documento contra el alto
       útil— y por eso el formulario no podía crecer: cada campo nuevo
       empujaba el botón bajo el pliegue.

       Ahora la barra va pegada abajo, así que lo que hay que medir es
       otra cosa: que ESTÉ EN PANTALLA sin haber bajado nada. Con
       `position: sticky` eso es verdad por muy largo que sea el
       formulario; sin ella —o con un ancestro que tenga `overflow`, que
       es lo que la rompe en silencio— el botón se va al final del
       documento y esta medida lo caza. */
    const anotar = document.querySelector(".fe-anotar .btn.grande").getBoundingClientRect();
    return {
      salen: [...new Set(salen)], lado: d.scrollWidth - d.clientWidth,
      codigo: alto(".fe-cod-dos input"),
      cifra: alto(".fe-dos input"),
      fechaAlto: alto(".fe-dma input"),
      toque: Math.min(alto(".fe-si-no button"), alto(".fe-segmento button"),
                      alto(".fe-dma input"), alto(".fe-dos input"), alto(".fe-nota input"),
                      alto(".fe-marca"), alto(".fe-estado select"),
                      alto(".fe-anotar .btn.grande"), alto(".fe-tres select, .fe-tres .bs-campo")),
      /* AVERÍA Y PNC, DEL MISMO TAMAÑO — lo pidió así, y el motivo se ve
         en la pantalla vieja: eran casillas de verificación y lo que se
         podía tocar era la palabra, así que «PNC» daba tres letras. Se
         miden los dos rectángulos y se comparan; que sean «parecidos»
         no basta, porque lo que se sentía mal era justamente que uno
         fuera la mitad del otro. */
      marcas: [...document.querySelectorAll(".fe-marca")].map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height)];
      }),
      dma: [...document.querySelectorAll(".fe-dma input")]
             .map((e) => Math.round(e.getBoundingClientRect().width)).join("/"),
      /* Cuánto sobresale del borde de abajo de la ventana. 0 o menos =
         se ve sin bajar. */
      fuera: Math.round(anotar.bottom) - 740,
      pegada: getComputedStyle(document.querySelector(".fe-barra-fija")).position,
    };
  }, BARRA);

  console.log(`${etiqueta.padEnd(8)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(14)} ` +
              `${String(m.codigo).padStart(6)}  ${String(Math.min(m.cifra, m.fechaAlto)).padStart(5)}  ` +
              `${String(m.toque).padStart(5)}  ` +
              `${m.dma.padStart(8)}  ${m.fuera <= 0 ? "se ve" : `${m.fuera} px fuera`}`);

  if (m.salen.length) fallas.push(`${etiqueta}: se sale de su tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado`);
  if (m.codigo < 56)
    fallas.push(`${etiqueta}: el campo del código mide ${m.codigo} px (mínimo 56: es el que ` +
                "se teclea 152 veces al día y donde un dedazo cambia lo que se cuenta)");
  /* LAS CIFRAS Y LA FECHA, TAMBIÉN A 56. Son las otras casillas donde un
     dedazo no da error, no avisa y aparece cuadrando el mes — y la
     fecha, además, es la única que se teclea SIN MIRARLA, porque el
     cursor entra solo. */
  if (m.cifra < 56)
    fallas.push(`${etiqueta}: la casilla de las estibas mide ${m.cifra} px (mínimo 56: es el ` +
                "otro dato donde un dedazo no da error, no avisa y aparece cuadrando el mes)");
  if (m.fechaAlto < 56)
    fallas.push(`${etiqueta}: las casillas de la fecha miden ${m.fechaAlto} px de alto ` +
                "(mínimo 56: son las únicas que se teclean SIN MIRARLAS, porque el cursor " +
                "entra solo y los dedos van a donde estaba el dedo anterior)");
  if (m.marcas.length !== 2)
    fallas.push(`${etiqueta}: hay ${m.marcas.length} cuadros de marca y son dos, Avería y PNC`);
  else if (m.marcas[0][0] !== m.marcas[1][0] || m.marcas[0][1] !== m.marcas[1][1])
    fallas.push(`${etiqueta}: Avería mide ${m.marcas[0].join("×")} y PNC ${m.marcas[1].join("×")}, `
              + "y se pidieron del mismo tamaño");
  if (m.toque < 48)
    fallas.push(`${etiqueta}: algo que se toca mide ${m.toque} px de alto (mínimo 48: se usa ` +
                "de pie y a veces con guantes)");
  /* Que las tres casillas de la fecha queden iguales. Si una se estira,
     deja de leerse como DD MM AA y se teclea en el orden equivocado. */
  if (new Set(m.dma.split("/")).size > 1)
    fallas.push(`${etiqueta}: las casillas de la fecha miden ${m.dma} px — desparejas se ` +
                "dejan de leer como DD MM AA");
  if (m.pegada !== "sticky")
    fallas.push(`${etiqueta}: la barra de anotar no va pegada abajo (position: ${m.pegada}). ` +
                "Con los cuatro momentos a la vista el botón se va fuera de la pantalla y " +
                "cada estiba cuesta un scroll para encontrarlo");
  if (m.fuera > 0)
    fallas.push(`${etiqueta}: «Anotar renglón» queda ${m.fuera} px fuera de la ventana sin ` +
                "haber bajado nada. La barra tiene que estar pegada abajo — y basta con que " +
                "un ancestro traiga `overflow` para que sticky deje de funcionar en silencio");

  /* Y lo mismo con todo abierto, menos el pliegue. */
  await monta(pag, null, ancho, 740, CORRIGIENDO);
  const b = await pag.evaluate(() => {
    const recortado = (e, hasta) => {
      for (let p = e.parentElement; p && p !== hasta.parentElement; p = p.parentElement)
        if (getComputedStyle(p).overflow !== "visible") return true;
      return false;
    };
    const salen = [];
    for (const f of document.querySelectorAll(".fe-anotar, .fe-recorrido, .fe-fila")) {
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

/* ---------- 6a. LA PRE-ANOTACIÓN, MEDIDA ----------

   Si la respuesta es «sigue igual», el renglón entero se acaba en ese
   botón. Así que lo que tiene que caber en la primera pantalla no es
   «Anotar renglón» —eso se mide con el otro armazón— sino LOS DOS
   BOTONES DE LA PRIMERA TARJETA.

   Y del mismo tamaño que todo lo demás que se toca aquí: 48 px. Son la
   respuesta entera a la pregunta de la tarjeta y se tocan de pie, con
   guante. */
if (PREVIO === ARMAZON)
  fallas.push("el armazón con tarjetas salió idéntico al de siempre: lo que se mida con él " +
              "no dice nada de la pre-anotación");
console.log("");
for (const [ancho, etiqueta] of [[390, "celular"], [360, "360"]]) {
  await monta(pag, null, ancho, 740, PREVIO);
  const m = await pag.evaluate((BARRA) => {
    const t = document.querySelector(".fe-tarjeta");
    if (!t) return { falta: true };
    const bs = [...t.querySelectorAll(".fe-tarjeta-pie button")];
    const r = bs.length ? bs[bs.length - 1].getBoundingClientRect() : null;
    const salen = [];
    const c = t.getBoundingClientRect();
    for (const e of t.querySelectorAll("*")) {
      const b = e.getBoundingClientRect();
      if (b.width > 0 && (b.right - c.right > 0.5 || c.left - b.left > 0.5))
        salen.push((e.className || e.tagName).toString().split(" ")[0]);
    }
    const px = (s, p) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e)[p]) : 0 };
    const d = document.documentElement;
    /* EL RÓTULO, ¿ENTERO O RECORTADO? Es la otra forma de «no se sale»:
       medí el arrastre de la página y con `min-width: 0` en el rótulo
       la página dejaba de arrastrarse porque el rótulo se encogía a
       CERO —decía «La última vez en A01_IZQ» en un cuadro de 0 px—. El
       arnés lo daba por bueno. */
    const rot = document.querySelector(".fe-previo-rot");
    return {
      rotAncho: rot ? Math.round(rot.getBoundingClientRect().width) : 0,
      rotTexto: rot ? rot.scrollWidth : 0,
      botones: bs.length,
      alto: r ? Math.round(r.height) : 0,
      hasta: r ? Math.round(r.bottom) : 0,
      cabe: r ? r.bottom <= 740 - BARRA : false,
      salen: [...new Set(salen)],
      lado: d.scrollWidth - d.clientWidth,
      cifra: px(".fe-tarjeta-cifra", "fontSize"),
      nombre: px(".fe-tarjeta-que span", "fontSize"),
    };
  }, BARRA);

  if (m.falta) { fallas.push(`${etiqueta}: no se pinta ninguna tarjeta de pre-anotación`); continue }
  console.log(`pre-anotación ${etiqueta}: ${m.botones} botones de ${m.alto} px · ` +
              `el último acaba a ${m.hasta} px ${m.cabe ? "(cabe)" : "(HAY QUE BAJAR)"} · ` +
              `cifra ${m.cifra} vs nombre ${m.nombre}`);
  if (m.botones !== 2)
    fallas.push(`${etiqueta}: la tarjeta tiene ${m.botones} botón(es) y son dos — «sigue ` +
                "igual» y «cambió»");
  if (m.alto < 48)
    fallas.push(`${etiqueta}: los botones de la tarjeta miden ${m.alto} px (mínimo 48: son la ` +
                "respuesta entera al renglón y se tocan de pie, con guante)");
  if (!m.cabe)
    fallas.push(`${etiqueta}: para contestar la primera tarjeta hay que bajar (acaba a ` +
                `${m.hasta} px): si la respuesta es «sigue igual», el renglón se acaba ahí y ` +
                "no debería costar un scroll");
  if (m.salen.length)
    fallas.push(`${etiqueta}: se sale de la tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0)
    fallas.push(`${etiqueta}: con las tarjetas la página se arrastra ${m.lado} px de lado`);
  if (m.rotAncho < m.rotTexto)
    fallas.push(`${etiqueta}: el rótulo de las tarjetas se recorta (${m.rotAncho} px de ancho ` +
                `para ${m.rotTexto} px de texto): es lo que dice DÓNDE se contó y CUÁNDO`);
  /* LA CIFRA ES LO QUE SE COMPARA CON LA ESTIBA QUE SE TIENE DELANTE.
     Del mismo tamaño que el nombre del material hay que buscarla. */
  if (!(m.cifra > m.nombre + 3))
    fallas.push(`${etiqueta}: la cantidad de la tarjeta se lee a ${m.cifra} px y el nombre ` +
                `del material a ${m.nombre}: la cifra es lo que se compara con la estiba`);
}

/* ---------- 6b. LA FECHA Y EL BOTÓN DE ENVIAR ----------

   DOS COSAS QUE SE PIDIERON MIRANDO LA PANTALLA CON LA BODEGA DELANTE:

   · Que la fecha sea SIEMPRE la de fabricación. El interruptor
     «Vence | Se fabricó» sobraba —los 462 productos activos tienen vida
     útil— y era un toque de más por estiba, 152 al día, más una manera
     de guardar una fecha equivocada sin que nada avisara. Esta aserción
     existe para que no vuelva: es la clase de control que alguien
     reintroduce «por si acaso» dentro de seis meses.

   · Que se pueda enviar SIN BAJAR HASTA EL FINAL. Con 150 renglones el
     botón del final está a siete pantallazos, y el que ya revisó tiene
     que recorrer la lista entera otra vez solo para llegar a él.
     ------------------------------------------------------------------ */
await monta(pag, null, 390, 740);
const env = await pag.evaluate((BARRA) => {
  const botones = document.querySelectorAll(".fe-que-fecha button").length;
  const rot = document.querySelector(".fe-etiq-fecha");
  const bloques = [...document.querySelectorAll(".fe-anotar .fe-bloque-cab")]
    .map((e) => e.textContent.trim());
  const b = document.querySelector(".fe-rec-cab .fe-mandar-ya");
  const sec = document.querySelector(".fe-recorrido");
  if (!b || !sec) return { botones, bloques, rotulo: rot ? rot.textContent.trim() : null, falta: true };
  const rb = b.getBoundingClientRect(), rs = sec.getBoundingClientRect();
  return {
    botones, bloques,
    rotulo: rot ? rot.textContent.trim() : null,
    alto: Math.round(rb.height),
    /* Cuánto hay que bajar dentro del borrador para llegar al botón. La
       pestaña se abre por su principio, así que esto es exactamente lo
       que costaría alcanzarlo. */
    desde: Math.round(rb.bottom - rs.top),
    cabe: Math.round(rb.bottom - rs.top) <= 740 - BARRA,
  };
}, BARRA);

console.log(`\nfecha: ${env.botones} botón(es) de escoger · rótulo «${env.rotulo ?? "NO HAY"}»`);
console.log(`los cuatro momentos: ${env.bloques.join(" · ") || "NO ESTÁN"}`);
console.log(`enviar arriba: ${env.falta ? "NO ESTÁ" : `alto ${env.alto} px · a ${env.desde} px del principio del borrador · ${env.cabe ? "cabe sin bajar" : "HAY QUE BAJAR"}`}`);

if (env.botones > 0)
  fallas.push(`volvió el interruptor de escoger la fecha (${env.botones} botones). ` +
              "Aquí se anota el vencimiento, que es lo que trae impreso el cartón y lo que " +
              "lleva años poniéndose en la hoja");
if (!env.rotulo)
  fallas.push("la fecha no dice cuál es: la casilla solo pone DD MM AA y sin rótulo hay que " +
              "acordarse de qué fecha va ahí");
/* LOS CUATRO MOMENTOS, EN EL ORDEN EN QUE SE MIRA UNA ESTIBA. Es el
   orden de la hoja y es lo que se pidió: primero dónde estoy, luego qué
   es, luego cuánto hay, y de último lo raro.

   SE LEE DEL COMPONENTE Y NO DEL ARMAZÓN. Lo medí primero contra el
   armazón de aquí arriba —que lo escribo yo— y era una aserción QUE NO
   PODÍA FALLAR: cambiar el orden en la pantalla de verdad la dejaba
   verde. Lo cazó la mutación, que es para lo que está.

   El armazón se sigue midiendo, pero para otra cosa: que los cuatro
   bloques se pinten. Que ADEMÁS coincidan es lo que ata el armazón a la
   pantalla — si se separan, lo que se mide aquí deja de decir nada de
   lo que se usa allá. */
{
  const debe = ["Dónde", "Qué", "Cuánto", "Cómo está"];
  const enPantalla = [...tsx.matchAll(/className="fe-bloque-cab">([^<]+)</g)].map((m) => m[1].trim());
  if (enPantalla.join("|") !== debe.join("|"))
    fallas.push(`los momentos del renglón salen [${enPantalla.join(", ") || "ninguno"}] y ` +
                `deben salir [${debe.join(", ")}]: es el orden en que se mira una estiba`);
  if (env.bloques.join("|") !== enPantalla.join("|"))
    fallas.push(`el armazón del arnés pinta [${env.bloques.join(", ")}] y la pantalla ` +
                `[${enPantalla.join(", ")}]: lo que se mida aquí deja de decir nada de allá`);
}
if (env.falta)
  fallas.push("no está el botón de enviar arriba del borrador: con 150 renglones el de abajo " +
              "queda a siete pantallazos");
else {
  if (env.alto < 48)
    fallas.push(`el botón de enviar de arriba mide ${env.alto} px (mínimo 48: se usa de pie ` +
                "y a veces con guantes)");
  if (!env.cabe)
    fallas.push(`el botón de enviar de arriba queda a ${env.desde} px del principio del ` +
                "borrador: hay que bajar para verlo, que es justo lo que venía a evitar");
}

/* ---------- 7. LO QUE NO SE VE PERO DECIDE ---------- */
const limpio = tsx.replace(/\/\*[\s\S]*?\*\//g, "");
if (/\b(prompt|confirm|alert)\s*\(/.test(limpio))
  fallas.push("usa los diálogos del navegador en vez de los de la app");
/* La ubicación tiene que ser una LLAVE, no un texto tecleado: es lo que
   arregla el cuarto del conteo que en la hoja no se podía ubicar. */
if (/p_ubicacion:\s*(ubicacion\.clave|bb?\.codigo|busca)/.test(limpio))
  fallas.push("manda la ubicación como texto en vez de la llave escogida");
/* Y EL ID VIENE DE `idDeLaPosicion`, que devuelve la fila que ya estaba
   o la que la base acaba de crear para el lado que faltaba. */
if (!/p_ubicacion:\s*idUbicacion/.test(limpio))
  fallas.push("no manda el id de la ubicación escogida");
/* EL RENGLÓN VA EN EL ORDEN DE LA HOJA. Es lo que pidió Cristian y lo
   que lleva años en el Excel: cambiarlo obliga a quien ya sabe llenarla
   a buscar cada campo. Se comprueba por el orden en que aparecen los
   rótulos en el componente. */
const orden = [
  ["Calle", ">Calle<"], ["Módulo", ">Módulo<"], ["Lado", ">Lado<"],
  ["Código", ">Código<"], ["Descripción", ">Descripción<"],
  /* LA FECHA YA NO SE BUSCA POR SU RÓTULO, porque el rótulo es dinámico
     —«Se fabricó» casi siempre, «Vence» al corregir uno de antes— y un
     `indexOf(">Vence<")` diría que falta el paso entero. Se busca por el
     bloque, que es lo que de verdad ocupa ese lugar en el orden. */
  ["La fecha", 'className={"fe-fecha"'],
  ["Estibas completas", ">Estibas completas<"], ["Saldo", ">Saldo · cajas sueltas<"],
  /* EL ESTADO DEL ENVASE SUBIÓ AL BLOQUE «CUÁNTO», debajo de las
     cantidades. Lo pidió Cristian y tiene sentido: dice QUÉ se contó
     —envase bueno, sucio, roto— y separa la estiba dentro del mismo
     módulo; al final, quien anotaba ya había dado el renglón por
     terminado en el total. */
  ["Estado del envase", ">Estado del envase<"],
  ["¿Rota?", ">¿Rota?<"],
  ["Avería", ">Avería<"], ["PNC", ">PNC<"],
  ["Observación", ">Observación<"],
];
let desde = 0;
for (const [r, aguja] of orden) {
  const i = limpio.indexOf(aguja, desde);
  if (i < 0) { fallas.push(`falta el campo «${r}» en el renglón, o quedó fuera de orden`); break }
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

/* ---------- EL TECLADO QUE ABRE CADA CAMPO ----------

   De pie, el teclado del sistema tapa media pantalla y deja la lista
   debajo. La calle son doce opciones de una letra: la lista entera cabe
   y escribir no ahorra un solo toque, así que no se levanta el teclado.
   El módulo sí se escribe —«01»— y para eso está el numérico, que tiene
   las teclas al doble de tamaño y se acierta con guante.

   Se comprueba en el componente y no en el armazón: el armazón pinta el
   campo, pero quien decide qué teclado abre es la propiedad. */
{
  /* SE CORTA POR POSICIÓN Y NO CON UN `/>` AL FINAL: el Buscador cierra
     cuatrocientas líneas más abajo —lleva su `onEscoge` dentro— así que
     pedir la etiqueta de cierre no encontraba nada y la comprobación
     salía vacía, que es como se aprueba cualquier cosa. */
  const trozo = (marca) => {
    const i = limpio.indexOf(marca);
    return i < 0 ? "" : limpio.slice(i, i + 400);
  };
  if (!/teclado="ninguno"/.test(trozo("valor={b.calle}")))
    fallas.push("la calle vuelve a levantar el teclado del celular, y tapa la lista que hay que mirar");
  if (!/teclado="numerico"/.test(trozo("valor={b.base}")))
    fallas.push("el módulo ya no abre el teclado numérico");
}

/* DE «CÓMO ESTÁ» EN ADELANTE NO SE VALIDA NADA. Rotación, avería, PNC,
   estado del envase y observación son opcionales: no marcar la rotación
   ES decir que no. Un aviso que frena el renglón por algo que no cambia
   la cifra es un aviso que la gente aprende a esquivar. */
{
  const rev = (limpio.match(/function revisar\(bb: Borrador\)[\s\S]*?\n  \}/) ?? [""])[0];
  for (const [que, re] of [["la rotación", /bb\.rot/], ["la avería", /bb\.averia/],
                           ["el PNC", /bb\.pnc/], ["el estado del envase", /bb\.estado/]]) {
    if (re.test(rev))
      fallas.push(`volvió a frenar el renglón por ${que}, y de «Cómo está» en adelante no se valida nada`);
  }
  /* Y SE MANDA RESUELTO, no nulo: la base sigue rechazando el nulo, así
     que dejar de resolverlo aquí rompería el guardado entero. */
  if (!/p_rotacion: bb\.rot === true/.test(limpio))
    fallas.push("la rotación se manda sin resolver: sin marcar iría nula y la base la rechaza");
}

/* EL MÓDULO VA SIN EL LADO PEGADO Y SIN LA LETRA DE LA CALLE.

   Salía «A01_DER · RB F1000»: el lado dentro del nombre —que hacía
   escogerlo dos veces— y la familia detrás. Y desde hoy tampoco lleva la
   letra: el teclado del módulo es NUMÉRICO, así que un texto con letra
   sería un campo que no se puede teclear con su propio teclado. */
if (/valor: m\.base[\s\S]{0,200}?texto: `\$\{u?\.?clave/.test(limpio) || /texto: `\$\{m\.clave/.test(limpio))
  fallas.push("el módulo sigue mostrando la clave con el lado pegado");
if (/texto: `\$\{m\.calle\}/.test(limpio))
  fallas.push("el módulo volvió a llevar la letra de la calle pegada al número, y el teclado es numérico: no se podría teclear");
if (!/texto: m\.modulo\b/.test(limpio))
  fallas.push("el módulo ya no muestra solo el número");

/* Y LA OPCIÓN DEL MÓDULO NO LLEVA LA FAMILIA. «RB F1000» repetido en
   doscientas filas obliga a leer de más para encontrar el número. La
   única pista admitida es la CALLE, y solo cuando no hay ninguna
   escogida: sin ella, el 01 de A y el 01 de B se verían iguales. */
{
  const bloque = (limpio.match(/opciones=\{modulos\.map\([\s\S]{0,420}?\)\)\}/) ?? [""])[0];
  if (/pista:[^\n]*familia/.test(bloque))
    fallas.push("la lista de módulos volvió a traer la familia detrás del número");
  if (!/pista:[\s\S]{0,80}?b\.calle === ""/.test(bloque))
    fallas.push("sin calle escogida, el 01 de A y el 01 de B se verían iguales: falta la pista de la calle");
}

/* ---------- SIEMPRE IZQUIERDO Y DERECHO ----------

   La regla de antes era «solo los lados que el maestro tenga cargados»,
   y con eso A01 —que está en el maestro como A01_IZQ y no como A01_DER—
   dejaba el lado derecho del pasillo sin poder contarse. Quien está
   parado frente al módulo ve los dos lados.

   «Coloco Calle A módulo 01 y solo sale izquierdo, y no debe ser así.»

   LA EXCEPCIÓN ES DE VERDAD Y SE COMPRUEBA APARTE: un módulo cuyo
   maestro dice que NO tiene lados —EST07, JAULA_PNC— se respeta tal
   cual. Inventarle izquierdo y derecho crearía dos posiciones que en la
   bodega no existen y partiría en dos el conteo de ese sitio. */
{
  const bloque = (limpio.match(/const lados = useMemo\([\s\S]*?\}, \[[^\]]*\]\);/) ?? [""])[0];
  if (!bloque)
    fallas.push("no está el cálculo de los lados");
  else {
    if (!/return \["IZQ", "DER"\];/.test(bloque))
      fallas.push("los lados vuelven a salir de lo que el maestro tenga cargado: el lado " +
                  "derecho de un módulo a medias —A01_DER— seguiría sin poderse contar");
    if (!/every\(\(u\) => \(u\.lado \?\? ""\) === ""\)/.test(bloque))
      fallas.push("a un módulo sin lados —EST07, JAULA_PNC— se le inventan izquierdo y " +
                  "derecho: dos posiciones que en la bodega no existen");
  }
}

/* Y EL LADO QUE NO ESTÉ EN EL MAESTRO SE DA DE ALTA AL ANOTAR. Ofrecer
   los dos lados sin poder crear el que falta sería ofrecer un botón que
   revienta: la fila no existe y el renglón no tiene dónde guardarse.
   La pantalla no escribe en el maestro —quien cuenta no lo administra—:
   le pide a la base que se asegure de que esa posición exista. */
if (!/conteo_ubicacion_asegurar/.test(limpio))
  fallas.push("el lado que falta en el maestro no se da de alta: escoger A01_DER no tendría " +
              "dónde guardar el renglón");
/* Y EL RENGLÓN VA A ESA POSICIÓN, no a la que hubiera antes: el id que
   devuelve la base es el que viaja en `argumentos`. Con `argumentos`
   leyendo la ubicación por su cuenta, el lado recién creado se
   guardaría en el lado viejo y las dos caras del pasillo se sumarían
   en una. */
/* Y SE COMPRUEBAN LAS DOS LLAMADAS —agregar y corregir—, no «que
   aparezca». Con una sola bastando, mutar la otra salía verde: la
   afirmación la sostenía la llamada que no se había tocado. */
if ((limpio.match(/argumentos\(bb, mat, idU\)/g) ?? []).length !== 2)
  fallas.push("el renglón no se guarda en la posición que se acaba de asegurar");

/* ---------- EL LADO SE TOCA, NO SE DESPLIEGA ----------

   Era un `<select>`, y en un celular eso abre la rueda del sistema: un
   toque para abrirla, uno para escoger y a veces uno más para
   confirmar. Tres toques por renglón —152 al día— para una pregunta de
   DOS respuestas, y de pie y con guante la rueda es el control más
   fácil de fallar de todos.

   SE MIRA EL BLOQUE DEL LADO Y NO EL COMPONENTE ENTERO: quedan
   desplegables legítimos —el estado del envase, los filtros del
   borrador— y buscar «<select» a secas los cazaría a ellos y no a
   este. */
{
  const bloque = (limpio.match(/<div className="fe-lado-campo">[\s\S]*?\n          <\/div>/) ?? [""])[0];
  if (!bloque)
    fallas.push("no está el renglón propio del lado: metido en la fila de tres, los dos " +
                "botones quedan de 60 px y hay que apuntar");
  else {
    if (/<select/.test(bloque))
      fallas.push("el lado volvió a ser un desplegable: en el celular eso abre la rueda del " +
                  "sistema, que son tres toques por renglón para una pregunta de dos " +
                  "respuestas y es lo más fácil de fallar con guante");
    if (!/className="fe-segmento"/.test(bloque))
      fallas.push("el lado no se escoge con botones");
    /* Y LOS BOTONES SALEN DE `lados`, no escritos a mano. Dos botones
       fijos «Izquierdo | Derecho» ofrecerían un lado que ese módulo no
       tiene, que es exactamente lo que había que arreglar. */
    if (!/lados\.map\(\(l\) =>/.test(bloque))
      fallas.push("los botones del lado están escritos a mano en vez de salir de los lados " +
                  "que ese módulo tiene: ofrecerían una ubicación que no existe");
    /* CON UN SOLO LADO NO SE PREGUNTA: se enseña. Un botón solo, y
       encendido, invita a tocarlo esperando que cambie algo. */
    if (!/lados\.length === 1/.test(bloque))
      fallas.push("con un solo lado posible se sigue preguntando en vez de enseñarlo");
  }
}
/* Y EL NOMBRE ENTERO EN EL BOTÓN. En la clave va «IZQ» y «DER» porque
   una clave se escribe corta; en dos botones pegados que se tocan sin
   mirar, «IZQ» y «DER» se distinguen por una sola letra. */
if (!/const nombreLado =/.test(limpio) || !/"Izquierdo"/.test(limpio) || !/"Derecho"/.test(limpio))
  fallas.push("los botones del lado no dicen el nombre entero: «IZQ» y «DER» pegados se " +
              "distinguen por una letra y se tocan sin mirar");

/* =====================================================================
   LA PRE-ANOTACIÓN D-1

   «Yo cuento hoy el A01 con 96 estibas de A1000. Que mañana, al
   seleccionar el módulo, me aparezca la misma información preguardada
   con la info de hoy, por si sigue igual, y un botón de registrar por
   si cambia.»

   Contar deja de ser escribir once campos y pasa a ser mirar la estiba
   y contestar. Lo que se mide aquí es lo que hace que eso sea seguro.
   ===================================================================== */

/* 1 · LO QUE SE OFRECE ES LO QUE SE CONTÓ, y sale de la vista que
   escoge el último conteo de esa posición. Armarlo con los renglones
   que la pantalla ya tiene cargados traería los de HOY —los del
   recorrido abierto— y ofrecería confirmar lo que se acaba de anotar. */
if (!/v_conteo_ultimo_por_ubicacion/.test(limpio))
  fallas.push("la pre-anotación no sale de la vista del último conteo de esa posición");

/* 2 · Y LA RESPUESTA QUE LLEGA TARDE NO PINTA. Escogiendo módulo tras
   módulo, la consulta de A01 puede aterrizar DESPUÉS de la de A02: sin
   corte, en la pantalla queda la pre-anotación del módulo anterior con
   el de al lado delante, que es contar una estiba creyendo que es
   otra. */
{
  const ef = (limpio.match(/useEffect\(\(\) => \{\s*let vivo = true;[\s\S]*?\}, \[supabase, ubicacion\]\);/) ?? [""])[0];
  if (!ef)
    fallas.push("la pre-anotación no se vuelve a pedir al cambiar de posición");
  else if (!/if \(vivo\) \{ setPrevio/.test(ef))
    fallas.push("la consulta que llega tarde pinta igual: quedaría en pantalla la " +
                "pre-anotación del módulo anterior");
}

/* 3 · CONFIRMAR GUARDA POR EL MISMO CAMINO QUE ANOTAR. Con dos caminos
   —uno para lo tecleado y otro para lo confirmado— cualquier regla que
   se toque en uno queda distinta en el otro, y el renglón confirmado
   saldría del mismo módulo con otras cuentas. */
if (!/const confirmar = \(pv: Previo\) => guardar\(desdePrevio\(pv\)\);/.test(limpio))
  fallas.push("«Sigue igual» no guarda por el mismo camino que «Anotar»");
if ((limpio.match(/conteo_fefo_agregar/g) ?? []).length !== 1)
  fallas.push("hay más de un sitio que agrega renglones: las dos formas de anotar pueden " +
              "discrepar");
/* Y LO QUE SE GUARDA ES LA TARJETA, no el renglón que se estaba
   tecleando. `guardar` recibe el borrador; si leyera el del estado,
   confirmar una tarjeta guardaría el material a medio escribir. */
if (!/async function guardar\(bb: Borrador\)/.test(limpio) ||
    !/const mal = revisar\(bb\);/.test(limpio) ||
    !/const mat = materialDe\(bb\)!;/.test(limpio))
  fallas.push("el guardado lee el renglón que se está tecleando y no el que se le manda: " +
              "confirmar una tarjeta guardaría otra cosa");

/* 4 · LAS TARJETAS VAN ANTES DEL CÓDIGO. Si la respuesta es «sigue
   igual» el renglón se acabó y las once casillas de abajo no se tocan.
   Puestas debajo del formulario habría que rodar hasta el final para
   descubrir que no hacía falta escribir nada. */
{
  const tarjetas = limpio.indexOf('className="fe-bloque fe-previo"');
  const que = limpio.indexOf('<p className="fe-bloque-cab">Qué</p>');
  const donde = limpio.indexOf('<p className="fe-bloque-cab">Dónde</p>');
  if (tarjetas < 0) fallas.push("no están las tarjetas de la pre-anotación");
  else if (!(donde < tarjetas && tarjetas < que))
    fallas.push("la pre-anotación no va entre «Dónde» y «Qué»: o se ofrece antes de saber la " +
                "posición, o hay que rodar el formulario entero para descubrir que no hacía " +
                "falta escribirlo");
}

/* 5 · Y NO SE AUTOLLENA EL FORMULARIO. Llenar las casillas solo dejaría
   un renglón completo sin que nadie haya mirado la estiba, a un toque
   de guardarse. Lo que se cuenta es lo que hay, no lo que había: aquí
   hay que decir que sí. */
{
  const ef = (limpio.match(/useEffect\(\(\) => \{\s*let vivo = true;[\s\S]*?\}, \[supabase, ubicacion\]\);/) ?? [""])[0];
  if (/setB\(/.test(ef))
    fallas.push("al escoger la posición se llenan solas las casillas: quedaría un renglón " +
                "completo, a un toque de guardarse, sin que nadie haya mirado la estiba");
}

/* 6 · YA CONTADO EN ESTE RECORRIDO SE DICE. Confirmar dos veces la
   misma tarjeta sería un renglón repetido, y lo rechazaría la base con
   un mensaje que no habla de esto. */
if (!/const yaHoy = /.test(limpio) || !/const hecho = yaHoy\(pv\);/.test(limpio))
  fallas.push("una tarjeta ya contada hoy se puede volver a confirmar: renglón repetido");
if (!/hecho \? \([\s\S]{0,200}?Ya lo contaste/.test(limpio))
  fallas.push("la tarjeta ya contada sigue ofreciendo «Sigue igual»");

/* 7 · Y SE QUITAN DE UN TOQUE. «Si no es esa, sino que ya hay otra, que
   con un clic yo logre borrar la otra información.» El día que la
   posición cambió de material entero, las tarjetas estorban. */
if (!/setVerPrevio\(false\)/.test(limpio))
  fallas.push("las tarjetas no se pueden quitar: el día que la posición cambió de material " +
              "entero estorban y no hay cómo cerrarlas");

/* 8 · «CAMBIÓ» NO GUARDA NADA. Baja la tarjeta a las casillas y ahí se
   corrige lo único que cambió —casi siempre la cantidad—; guarda
   «Anotar», como siempre. Un botón que dijera «cambió» y guardara sería
   el peor de los dos mundos. */
{
  const fn = (limpio.match(/function editarPrevio\(pv: Previo\) \{[\s\S]*?\n  \}/) ?? [""])[0];
  if (!fn) fallas.push("no se puede editar una pre-anotación: o se confirma tal cual o se " +
                       "escribe de cero");
  else if (/supabase\.|guardar\(/.test(fn))
    fallas.push("«Cambió» guarda solo: guardaría la cantidad de ayer");
}

/* 9 · Y EL CURSOR CAE EN LA CANTIDAD, que es lo único que cambia casi
   siempre. Va DESPUÉS de que la pantalla se rehaga —por eso pasa por un
   contador— porque la casilla es «Estibas» o «Cajas» según el modo que
   traiga la tarjeta, y en el instante del clic la montada todavía es la
   del modo anterior. */
if (!/setEnfocarCantidad\(\(n\) => n \+ 1\)/.test(limpio) ||
    !/\}, \[enfocarCantidad\]\);/.test(limpio))
  fallas.push("al editar una tarjeta el cursor no cae en la cantidad, o cae antes de que la " +
              "casilla del modo nuevo exista");

/* ---------- DESPUÉS DE ANOTAR: EL CURSOR A CALLE, EL SITIO PUESTO ----------

   «Apenas yo guarde el registro me debe llevar el cursor automáticamente
   a calle.» Y: «Cuando guarden la posición, que la calle y el módulo se
   mantengan iguales.»

   Son las dos mitades de lo mismo: se sigue contando en el mismo
   módulo, así que el sitio se queda; y el cursor vuelve al primer campo
   del recorrido, que además es el único sin teclado, para que cambiarlo
   sea un toque y no haya que ir a buscarlo. */
if (!/campo=\{campoCalle\}/.test(limpio))
  fallas.push("la calle no recibe la referencia: el cursor no puede volver ahí después de " +
              "anotar");
{
  const fn = (limpio.match(/function limpiar\(dejarSitio = false\) \{[\s\S]*?\n  \}/) ?? [""])[0];
  if (!fn)
    fallas.push("«limpiar» ya no sabe distinguir vaciar el renglón de soltar el sitio");
  else {
    if (!/campoCalle\.current\?\.focus\(\)/.test(fn))
      fallas.push("después de anotar el cursor no vuelve a la calle");
    if (!/calle: x\.calle, base: x\.base, lado: x\.lado/.test(fn))
      fallas.push("anotar suelta la calle y el módulo: habría que volver a escogerlos para " +
                  "cada renglón del mismo pasillo");
  }
}
/* Y EL SITIO SE QUEDA SOLO AL ANOTAR. Corrigiendo se vuelve al
   borrador, que es de donde se vino: arrastrar el sitio del renglón
   corregido hasta el formulario dejaría puesto un módulo que nadie
   escogió. */
if (!/limpiar\(!corrigiendo\);/.test(limpio))
  fallas.push("el sitio se queda puesto también al corregir: quedaría escogido un módulo " +
              "que nadie tocó");

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
  fallas.push("la forma de contar no arranca en estibas, que es lo que más se cuenta");

/* ---------- ESTIBAS COMPLETAS **Y** SALDO, EN EL MISMO RENGLÓN ----------

   Doce completas más ocho sueltas son 548 cajas de un mismo material en
   un mismo sitio. Con «saldo» como TERCERA opción de un desplegable eso
   había que partirlo en dos renglones, y de ahí a que uno de los dos se
   quede sin anotar hay un paso.

   Las dos cifras tienen que VIAJAR JUNTAS. Si `p_saldo` solo se manda
   cuando el modo es «saldo», el renglón de estibas pierde el saldo sin
   avisar: la pantalla lo muestra en la casilla, el total de arriba lo
   suma, y la base guarda ocho cajas menos. Nadie lo nota hasta que el
   mes cuadra de menos. */
if (!/p_estibas: bb\.modo === "estibas" \? ent\(bb\.estibas\) : null/.test(limpio) ||
    !/p_saldo: bb\.modo === "estibas" \? ent\(bb\.saldo\) : null/.test(limpio))
  fallas.push("las estibas y el saldo no viajan juntas en el renglón de estibas: el saldo se " +
              "perdería en silencio y el total guardado saldría corto");
if (!/p_cajas: bb\.modo === "cajas" \? ent\(bb\.cajas\) : null/.test(limpio))
  fallas.push("las cajas no van solas: mezcladas con estibas el renglón no dice cómo se contó");
/* Y TRES CASILLAS DE VERDAD, no una compartida. Compartiendo `cuantas`,
   pasar de estibas a cajas conservaba el número: 56 estibas se volvían
   56 cajas sin que cambiara nada en pantalla. */
if (/\bcuantas\b/.test(limpio))
  fallas.push("las tres cifras vuelven a compartir una sola casilla: cambiar de forma de " +
              "contar conservaría el número y 56 estibas se volverían 56 cajas");
if (!/r\.cajas != null \? "cajas" : "estibas"/.test(limpio))
  fallas.push("al corregir no se distingue cómo se contó el renglón");

/* EL TOTAL, ARMADO A LA VISTA. 12 × 45 + 8 = 548. Se enseña la cuenta
   entera y no solo el resultado: 548 hay que creérselo, «12 × 45 + 8» se
   mira contra la estiba y se ve si el factor es el que corresponde. */
if (!/const cuenta = useMemo/.test(limpio))
  fallas.push("no se ve el total en cajas mientras se anota: la cuenta de estibas por factor " +
              "más el saldo habría que hacerla de cabeza");
if (!/cajas_por_estiba/.test(limpio))
  fallas.push("el total no usa el factor estibado del maestro");

/* ---------- ANOTAR DEJA EL RENGLÓN EN CERO ----------
   Código, fecha, cantidad, ¿rota? y las marcas vuelven a vacío, porque
   el siguiente renglón es otra estiba.

   LA FECHA ES LA QUE IMPORTA AQUÍ. Se quedaba puesta a propósito, y
   estaba mal por dos razones: hay que borrar tres casillas antes de
   teclear otra, y —peor— una fecha que quedó del renglón anterior no se
   ve como un campo por llenar sino como uno ya lleno, así que se anota
   sin que nadie lo note.

   EL SITIO ES LA EXCEPCIÓN Y SE MIDE APARTE, arriba: calle, módulo y
   lado se quedan puestos porque se sigue contando en el mismo pasillo,
   y AHORA SE VEN —las tarjetas de la pre-anotación los llevan escritos
   encima—, que es lo que faltaba las dos veces que esto se devolvió. */
{
  const fn = (limpio.match(/function limpiar\(dejarSitio = false\) \{[\s\S]*?\n  \}/) ?? [""])[0];
  const vacia = /codigo|dia|mes|anio|estibas|cajas|rot|averia|pnc|estado|nota/;
  if (!/setCorrigiendo\(null\)/.test(fn) || !/\.\.\.VACIO/.test(fn) || vacia.test(fn))
    fallas.push("al anotar no se limpia el renglón ENTERO: un campo que quedó lleno del " +
              "anterior no se ve como un campo por llenar, se ve como uno ya contestado");
}

/* Y EL MARCADOR DEL CÓDIGO NO PUEDE SER UN CÓDIGO DE VERDAD. Decía
   «3128» —la Águila 330— y en gris dentro de un campo grande se lee como
   un campo ya lleno, sobre todo justo después de anotar. */
if (/placeholder="\d+"/.test(limpio))
  fallas.push("el marcador del código es un número: se confunde con un código ya tecleado");

/* ---------- EL VENCIMIENTO, Y LAS DOS CIFRAS QUE SALEN DE ÉL ----------

   SE ANOTA EL VENCIMIENTO. Es lo que trae impreso el cartón y lo que
   lleva años poniéndose en la hoja —columnas I/J/K de CONTEO—, y de ahí
   salen las dos que deciden el FEFO:

     DÍAS PARA VENCER = vencimiento − hoy
     DÍAS PARA SALIR  = eso mismo − el mínimo T1 del maestro

   Esto estuvo un rato pidiendo la fecha de FABRICACIÓN y calculando el
   vencimiento con la vida útil. Se devolvió: quien está frente a la
   estiba lee lo que dice el cartón, y hacer la cuenta de cabeza al revés
   —restarle la vida útil para saber qué teclear— es justo lo que la
   pantalla venía a quitar. */
if (!/p_venc_dia: ent\(bb\.dia\)/.test(limpio))
  fallas.push("la pantalla no manda el vencimiento que se teclea");
if (!/p_fab_dia: null/.test(limpio))
  fallas.push("sigue mandando una fecha de fabricación: el renglón acabaría con las dos, y " +
              "el vencimiento guardado no sería el que se leyó en el cartón");
/* Y LAS DOS CIFRAS SE VEN MIENTRAS SE TECLEA. Es lo que se pidió: que la
   pantalla diga «sale en 249 días» ahí, frente a la estiba, que es el
   único momento en que se puede hacer algo con ella. */
if (!/const dias = useMemo/.test(limpio))
  fallas.push("la pantalla no dice los días para salir y para vencer mientras se teclea la " +
              "fecha: habría que esperar al tablero, y para entonces ya hay que volver a " +
              "caminar hasta el módulo");
if (!/dias_minimo/.test(limpio))
  fallas.push("los días para salir no restan el mínimo T1 del maestro: saldría el mismo " +
              "número que los días para vencer, que es el que NO manda");

/* NO PUEDE HABER UN CAMPO DE ESTADO SIN CONTROL QUE LO MUEVA.
   Hubo aquí un `fecha: "vence" | "fabrica"`: le quité el interruptor a la
   pantalla y dejé el estado adentro «por si acaso», y el borrador que se
   guarda en el teléfono trajo esa marca de vuelta después de actualizar.
   El formulario abría en un modo y NO HABÍA CÓMO SALIR, porque el único
   control que lo cambiaba ya no existía. */
if (/fecha:\s*"(vence|fabrica)"/.test(limpio) || /\[fecha, setFecha\]/.test(limpio))
  fallas.push("volvió un campo de estado para escoger qué fecha es, y en la pantalla no hay " +
              "control que lo mueva: el borrador guardado lo restauraría y el formulario " +
              "quedaría en un modo sin salida");
/* Y al corregir se abre con los TRES PEDAZOS como se teclearon, no con
   la fecha armada: quien vuelve a mirar la estiba lee el mismo número. */
if (!/dia: String\(r\.venc_dia \?\? ""\)/.test(limpio))
  fallas.push("al corregir no se vuelve a abrir con el vencimiento que se tecleó");

/* ---------- EL CURSOR PASA SOLO: DD → MM → AA ----------

   Eran tres toques por fecha y 152 fechas al día: 304 toques que no
   hacían falta, cada uno con su ocasión de caer en la casilla de al lado
   y escribir el mes donde va el día.

   EL SALTO ES POR DOS DÍGITOS DENTRO, no por dos teclas pulsadas:
   corregir el día borrando y volviendo a escribir tiene que saltar
   igual, y pegar «11» desde otro sitio también. Por eso se mide contra
   el valor ya limpio y no contra el evento.

   Y SE PUEDE VOLVER: llegar al mes, ver que el día quedó mal y no poder
   devolverse sin levantar la mano al teléfono sería cambiar un estorbo
   por otro. */
if (!/function tecleaFecha/.test(limpio))
  fallas.push("el cursor no pasa solo de DD a MM y de MM a AA: son tres toques por fecha y " +
              "152 fechas al día");
{
  const fn = (limpio.match(/function tecleaFecha[\s\S]{0,600}?\n  \}/) ?? [""])[0];
  /* Se admite escrito de las dos formas —«=== 2» para saltar, o
     «!== 2» para salir antes— porque lo que importa no es la forma sino
     QUÉ dispara el salto: el LARGO de lo que quedó dentro de la
     casilla, no cuántas teclas se pulsaron. Con un contador de teclas,
     corregir borrando y volviendo a escribir, o pegar la fecha, no
     saltaría. */
  if (!/limpio\.length (===|!==) 2/.test(fn))
    fallas.push("el salto de casilla no se dispara por tener dos dígitos dentro: corregir " +
                "borrando y volviendo a escribir, o pegar la fecha, no saltaría");
  if (!/\.focus\(\)/.test(fn))
    fallas.push("la casilla siguiente no recibe el cursor");
  if (!/\.select\(\)/.test(fn))
    fallas.push("al saltar no se selecciona lo que ya había en la casilla: teclear encima " +
                "dejaría cuatro cifras donde caben dos");
}
if (!/const dosDigitos =/.test(limpio) || !/replace\(\/\\D\/g, ""\)\.slice\(0, 2\)/.test(limpio))
  fallas.push("la casilla de la fecha no se limpia a dos dígitos: pegar «2027» en el año " +
              "dejaría cuatro dentro y la casilla nunca se daría por llena");
if (!/function atrasFecha/.test(limpio))
  fallas.push("el retroceso sobre una casilla vacía no devuelve a la anterior: para corregir " +
              "el día habría que levantar la mano al teléfono");
/* Y LAS TRES CASILLAS TIENEN QUE ESTAR ENCADENADAS EN ORDEN. Con el día
   apuntando al año —o el mes a sí mismo— el arnés de arriba pasaría
   igual y la fecha se tecleraría al revés. */
{
  const dma = (limpio.match(/<div className="fe-dma">[\s\S]*?<\/div>/) ?? [""])[0];
  const cadena = [...dma.matchAll(/tecleaFecha\("(\w+)"[^)]*?(?:, (campo\w+))?\)/g)]
    .map((m) => `${m[1]}→${m[2] ?? "fin"}`).join(" ");
  /* LA CADENA NO SE ACABA EN EL AÑO: SIGUE A LA CANTIDAD. Era el único
     corte del renglón —se terminaba la fecha y había que levantar la
     mano a tocar «Estibas completas»— y es justo lo que se pidió
     quitar. */
  if (cadena !== "dia→campoMes mes→campoAnio anio→campoCantidad")
    fallas.push(`las casillas de la fecha están encadenadas [${cadena || "de ninguna forma"}] ` +
                "y deben ir dia→campoMes mes→campoAnio anio→campoCantidad");
  const atras = [...dma.matchAll(/atrasFecha\(e, b\.(\w+), (campo\w+)\)/g)]
    .map((m) => `${m[1]}←${m[2]}`).join(" ");
  if (atras !== "mes←campoDia anio←campoMes")
    fallas.push(`el retroceso va [${atras || "a ninguna parte"}] y debe ir mes←campoDia ` +
                "anio←campoMes");
}

/* Y AL ACABAR EL AÑO SE CIERRA EL TECLADO. La última casilla no tiene
   siguiente, así que el cursor se quedaba ahí con el teclado abierto
   tapando media pantalla — justo encima del total y de los días para
   salir, que es lo que hay que mirar al terminar la fecha. Soltar el
   foco es lo único que lo cierra en un celular.

   SE COMPRUEBA DENTRO DE `tecleaFecha` y detrás del caso de «hay
   siguiente»: un `blur()` suelto en otra parte cerraría el teclado
   también al pasar de día a mes, que es lo contrario de lo que se
   quiere. */
{
  const fn = (limpio.match(/function tecleaFecha\([\s\S]*?\n  \}/) ?? [""])[0];
  /* LA RED, POR SI ALGÚN DÍA LA ÚLTIMA CASILLA NO TIENE SIGUIENTE:
     dejar el cursor ahí con el teclado abierto taparía el total y los
     días para salir. Y va DETRÁS del salto: delante cerraría el teclado
     también al pasar de día a mes, que es lo contrario. */
  if (!/\.blur\(\)/.test(fn))
    fallas.push("sin casilla siguiente el teclado se queda abierto, tapando el total y los días para salir");
  const iSig = fn.indexOf("siguiente.current.focus()");
  const iBlur = fn.indexOf(".blur()");
  if (iSig >= 0 && iBlur >= 0 && iBlur < iSig)
    fallas.push("el teclado se cierra ANTES de pasar a la casilla siguiente: se cerraría también al pasar de día a mes");
}

/* LA CASILLA DE LA CANTIDAD LLEVA LA MISMA REFERENCIA EN LOS DOS MODOS.
   «Estibas completas» y «Cajas» no existen a la vez, así que una sola
   referencia apunta siempre a la que está montada. Con una por modo
   habría que preguntar en cuál estamos cada vez que se salta, y ese
   `if` se olvida el día que aparezca un tercer modo. */
{
  const n = (limpio.match(/ref=\{campoCantidad\}/g) ?? []).length;
  if (n !== 2)
    fallas.push(`la referencia de la cantidad está en ${n} casilla(s) y van 2 —estibas y cajas—: `
              + "en el modo que le falte, el año no sabría adónde saltar");
}

/* Y EL CÓDIGO Y LAS CANTIDADES SALTAN CON ENTER. Su largo no se sabe
   —3128 o 17740, 8 estibas o 112— así que saltar por el largo sería
   adivinar; lo dice quien escribe. */
if (!/function saltaCon\(/.test(limpio))
  fallas.push("el código y las cantidades no encadenan con Enter: el renglón se corta donde el largo no se sabe");

/* LA OBSERVACIÓN SE GUARDABA Y NO SE PODÍA ESCRIBIR. El renglón manda
   `p_nota` desde el primer día y el formulario no tenía dónde teclearla:
   iba siempre vacía. */
if (!/value=\{b\.nota\}/.test(limpio))
  fallas.push("la observación se manda pero no hay dónde escribirla: iría siempre vacía");

/* EL BORRADOR GUARDADO ES DE AYER; EL FORMULARIO ES DE HOY.
   Restaurarlo con un `...guardado` a secas mete de vuelta campos de una
   versión anterior de la pantalla — que fue exactamente cómo un
   `fecha: "vence"` guardado antes de un cambio dejó el formulario en un
   modo que ya no tenía cómo cambiarse. */
if (!/for \(const k of Object\.keys\(VACIO\)/.test(limpio))
  fallas.push("el borrador guardado se restaura entero en vez de solo las claves que el " +
              "formulario tiene hoy: un campo viejo puede dejar la pantalla en un estado " +
              "sin salida");

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
console.log("✓ Plantilla de conteo: los cuatro momentos en el orden de la hoja, el " +
            "vencimiento con sus días para salir, el cursor pasa solo de DD a MM a AA, " +
            "el total se arma a la vista y «Anotar» no se va de la pantalla.");
