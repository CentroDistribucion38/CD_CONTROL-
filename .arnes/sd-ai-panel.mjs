/* =====================================================================
   LA REVISIÓN AI — panel al lado, contadores al frente

   QUÉ CAMBIÓ. Los catorce conteos eran casillas de teclear y ahora son
   botones de más y menos; y la cuenta —índice, lo que no se abona, lo
   que falta para cerrar— dejó de estar al final de la página para estar
   siempre a la vista: al lado en pantalla ancha, pegada abajo en el
   celular.

   QUÉ SE MIDE Y POR QUÉ:

   1. QUE LAS CLASES DEL ARMAZÓN EXISTAN. Por palabra completa contra los
      literales del componente y las clases de la hoja. Un arnés que mide
      `.filtros` cuando la pantalla usa `.tr-filtros` aprueba siempre y
      no mide nada — ya pasó dos veces en este proyecto.

   2. QUE LA CUENTA NUNCA SE PIERDA DE VISTA. Es la razón de ser del
      rediseño, así que es lo primero que hay que poder demostrar:
        · ancho: el panel va pegado (`position: sticky`) y cabe al lado;
        · angosto: el panel se va abajo Y aparece la barra fija.
      Si se angosta y NO aparece la barra, la pantalla volvió a ser la
      de antes: hay que bajar hasta el final para saber en qué va.

   3. EL DEDO. 44 px los botones del contador, 46 los campos y los de
      cerrar. Esto se llena de pie con el celular en una mano; fallar un
      botón aquí es descontar una botella que sí estaba mala.

   4. CONTRASTE EN LOS SIETE TEMAS. Cinco parejas que nadie emparejó a
      propósito: el índice en acento sobre la banda oscura, el abono
      final igual, el blanco de la placa sobre el acento, lo que falta en
      rosa sobre vinotinto, y el número del contador sobre el papel. El
      acento cambia con las preferencias de cada quien y ya dio 1,7 en un
      tema y 6,9 en otro en otra pantalla de este proyecto.

   5. QUE NADA SE SALGA a 1440 / 1100 / 820 / 390 / 360, con nombres de
      defecto largos como «Extrasucio · no recuperable».
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const ai    = readFileSync(new URL("../src/modulos/sider/ai.css", import.meta.url), "utf8");
const sd    = readFileSync(new URL("../src/app/(app)/sider/sider.css", import.meta.url), "utf8");
const glob  = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/app/(app)/shell.css", import.meta.url), "utf8");
const tsx   = readFileSync(new URL("../src/modulos/sider/FormularioAi.tsx", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [1100, "tableta"], [820, "tableta angosta"], [390, "celular"], [360, "360"]];

/* Los nombres de defecto son los de verdad: son los largos los que se
   salen, no los de ejemplo. */
const COBRAN = ["Rota o despicado", "Faltante", "Cemento o pintura", "No retornable",
                "Otras compañías", "Antiguo formato", "Extrasucio · no recuperable",
                "Cristalizado · meteorizada", "Hongo", "Etiqueta asoleada"];
const NO_COBRAN = ["Mezclado", "Cuerpo extraño", "Cajas malas", "Estiba mala"];
const CON = { "Rota o despicado": 4, "Faltante": 2, "Cemento o pintura": 1,
              "Otras compañías": 1, "Mezclado": 3, "Cajas malas": 1 };

const def = (n, nc) => {
  const v = CON[n] ?? 0;
  return `<div class="ai-def${v ? " hay" : ""}${nc ? " nc" : ""}">
    <span class="ai-nd">${n}</span>
    <div class="ai-step"><button${v ? "" : " disabled"}>−</button><output>${v}</output><button>+</button></div>
  </div>`;
};

const PANEL = `
  <div class="ai-p-cab">
    <div class="ai-p-rot">ÍNDICE DE COBRO</div>
    <div class="ai-p-ind">6.67 %</div>
    <div class="ai-p-sub">8 con defecto de 120 revisadas</div>
  </div>
  <div class="ai-p-barra"><i style="width:6.67%"></i></div>
  <div class="ai-p-lista">
    <div class="ai-p-l"><span>Recibidas</span><b>1.440</b></div>
    <div class="ai-p-l"><span>No se abona</span><b>96</b></div>
    <div class="ai-p-l fuerte"><span>Abono final SAP</span><b>1.344</b></div>
    <div class="ai-p-l"><span>Hectolitros</span><b>2.4192</b></div>
    <div class="ai-p-l"><span>Que no cobran</span><b>4</b></div>
  </div>
  <div class="ai-p-faltan">
    <div class="t">FALTA PARA CERRAR</div>
    <ul><li>El socio</li><li>El tipo de envase</li></ul>
  </div>
  <div class="ai-p-acciones">
    <button class="b1" disabled>Cerrar revisión</button>
    <button class="b2">Después</button>
  </div>`;

const ARMAZON = `
<div class="ai-form">
  <div class="ai-cinta">
    <div class="ai-placa">JGY577</div>
    <div class="c"><div class="k">PLANTA</div><div class="v">Apartadó</div></div>
    <div class="c"><div class="k">LLEGADA</div><div class="v">10 sep, 05:41 p. m.</div></div>
    <div class="c"><div class="k">MATERIAL</div><div class="v">3500887</div></div>
  </div>

  <p class="ai-motivo"><b>Por qué se revisa:</b> envase con cemento en la salida —
    DE LEON HEINER</p>

  <div class="ai-marco">
    <div class="ai-izq">
      <section class="ai-caja">
        <div class="ai-cab"><h3>De quién y de qué</h3>
          <p>Sale del viaje certificado. Solo se escoge lo que el viaje no trae.</p></div>
        <div class="ai-cuerpo">
          <div class="ai-campos">
            <div class="ai-campo"><label id="rot-turno">TURNO</label>
              <div class="ai-seg"><button class="on">T1</button><button>T2</button><button>T3</button></div></div>
            <div class="ai-campo"><label>CANAL DE ENVASE</label>
              <select><option>Socios</option></select></div>
            <div class="ai-campo falta"><label>SOCIO</label>
              <select><option>— escoge el socio —</option></select>
              <div class="aviso">Falta</div></div>
            <div class="ai-campo falta"><label>TIPO DE ENVASE</label>
              <select><option>— escoge —</option></select>
              <div class="aviso">Falta</div></div>
            <div class="ai-campo"><label>BOTELLAS RECIBIDAS</label>
              <input class="num" value="1.440"></div>
            <div class="ai-campo"><label>BOTELLAS REVISADAS</label>
              <input class="num" value="120"></div>
            <div class="ai-campo"><label>N.° ZCL3</label><input value=""></div>
            <div class="ai-campo ai-check"><label class="plano">
              <input type="checkbox"><span>Venía certificado por el socio</span></label></div>
          </div>
        </div>
      </section>

      <section class="ai-caja">
        <div class="ai-cab"><h3>Conteo de la muestra</h3>
          <p>Se toca, no se digita. Lo de arriba entra al índice de cobro; lo de abajo
             se registra pero no cobra.</p></div>
        <div class="ai-cuerpo">
          <div class="ai-rot">ENTRAN AL COBRO</div>
          <div class="ai-grid">${COBRAN.map((n) => def(n, false)).join("")}</div>
          <div class="ai-rot mal">SE REGISTRAN · NO COBRAN</div>
          <div class="ai-grid">${NO_COBRAN.map((n) => def(n, true)).join("")}</div>
          <label class="ai-coment"><span>COMENTARIOS PARA EL FACTURADOR</span>
            <textarea rows="2"></textarea></label>
        </div>
      </section>
    </div>

    <aside class="ai-panel">${PANEL}</aside>
  </div>

  <div class="ai-fija">
    <div><div class="k">ÍNDICE DE COBRO</div><div class="v">6.67 %</div></div>
    <div class="ai-fija-der"><span>faltan 2 datos</span><button disabled>Cerrar</button></div>
  </div>
</div>`;

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ---------- */
const literales = [...tsx.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)].map((m) => m[1]).join(" ");
const sueltas = literales.split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([
  ...sueltas, ...sueltas.map((w) => w.toLowerCase()),
  ...[...ai.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
]);
const usadas = [...new Set([...ARMAZON.matchAll(/class="([^"]+)"/g)]
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

/* DENTRO DE LA CERTIFICACIÓN, que es donde se usa de verdad.
   El formulario no vive solo: es el tercer paso de la certificación de
   llegada y va DENTRO de una `.tarjeta`, con su relleno y su borde. Un
   bloque que cabe solo puede no caber adentro de otro, y ahí es donde
   se llena — en el muelle, no en el monitor del que programa.

   Va en el MISMO arnés y no en otro a propósito: el arnés que medía
   esto por separado tenía su propia copia del armazón, la pantalla
   cambió y él siguió midiendo la de antes — reprobaba por un rótulo
   que ya no existe. Dos copias del mismo armazón es cómo una se queda
   vieja sin que nadie lo note. */
const EN_TARJETA = `
<section class="tarjeta">
  <div class="ct-paso tr-llegada">
    <div class="tr-quien">
      <div><h2>Revisión AI de JGY577</h2>
        <p class="ct-dice"><b>La llegada ya quedó registrada.</b> Falta la muestra.</p></div>
      <button class="btn plano">← Volver al tránsito</button>
    </div>
    ${ARMAZON}
  </div>
</section>`;

/* EL ENVOLTORIO ES EL DE TRÁNSITO: «sd tr-pantalla», SIN la clase «ai».
   Este arnés montaba «sd ai» —un envoltorio que la aplicación no tiene—
   y por eso aprobó una pantalla que en producción salió sin un solo
   borde: los tokens colgaban de «.sd.ai» y ahí sí resolvían, aquí no.
   Es la cuarta vez en este proyecto que un arnés mide un armazón
   inventado, y la primera que llega hasta la pantalla del usuario. */
const monta = async (pag, tema, ancho, alto = 900, dentro = false) => {
  await pag.setViewportSize({ width: ancho, height: alto });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${sd}${ai} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">
        <div class="sd tr-pantalla">${dentro ? EN_TARJETA : ARMAZON}</div>
      </main></div>
    </div></body></html>`);
};

/* ---------- 3.5. QUE LOS TOKENS EXISTAN ----------
   ES LO PRIMERO QUE HAY QUE COMPROBAR Y NO LO ÚLTIMO. Una declaración
   con una variable CSS indefinida no se degrada: se descarta entera. Si
   los tokens no resuelven, la pantalla sale sin bordes ni fondos —y el
   contraste medido encima de eso da números perfectos, porque es texto
   negro sobre papel blanco. Un 16,65 puede ser una pantalla impecable o
   una pantalla sin CSS, y el número no los distingue.

   Por eso se comprueban por SEPARADO, antes de medir un solo color. */
const pag = await navegador.newPage();
await monta(pag, null, 1440);
const tokens = await pag.evaluate(() => {
  const cs = getComputedStyle(document.querySelector(".ai-form"));
  const nombres = ["--ai-papel", "--ai-fondo", "--ai-tinta", "--ai-gris",
                   "--ai-linea", "--ai-ojo", "--ai-sobre", "--ai-grupo",
                   "--ai-ojo-banda", "--ai-tenue"];
  return Object.fromEntries(nombres.map((n) => [n, cs.getPropertyValue(n).trim()]));
});
const sinResolver = Object.entries(tokens).filter(([, v]) => v === "");
if (sinResolver.length)
  fallas.push(`los tokens ${sinResolver.map(([n]) => n).join(", ")} no existen en el ` +
              "envoltorio real de la pantalla: cada regla que los use se descarta entera y " +
              "el formulario sale sin bordes ni fondos");
else console.log("tokens: los 10 resuelven en el envoltorio de Tránsito\n");

/* Y que lo que de verdad pinta, pinte: si `.ai-cinta` o `.ai-panel`
   quedan transparentes, la cinta negra y el panel no existen aunque el
   HTML esté completo. */
const fondos = await pag.evaluate(() => {
  const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : "" };
  return { cinta: g(".ai-cinta"), panel: g(".ai-panel"), caja: g(".ai-caja"),
           campo: g(".ai-campo select"), borde: getComputedStyle(
             document.querySelector(".ai-campo select")).borderTopWidth };
});
for (const [k, v] of Object.entries(fondos)) {
  if (k === "borde") continue;
  if (!v || /rgba\(0, 0, 0, 0\)/.test(v))
    fallas.push(`«${k}» quedó transparente: se ve como un formulario sin CSS`);
}
if (parseFloat(fondos.borde) < 1)
  fallas.push(`los campos no tienen borde (${fondos.borde}): la regla se descartó`);

/* ---------- 4. CONTRASTE ---------- */
console.log("tema      índice  abono  placa  falta  contador  «cerrar»  sub  rótulo  cinta");
for (const t of TEMAS) {
  await monta(pag, t, 1440);
  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    return {
      indTxt: g(".ai-p-ind", "color"), panelFondo: g(".ai-panel", "background-color"),
      abonoTxt: g(".ai-p-l.fuerte b", "color"),
      placaTxt: g(".ai-placa", "color"), placaFondo: g(".ai-placa", "background-color"),
      faltaTxt: g(".ai-p-faltan li", "color"), faltaFondo: g(".ai-p-faltan", "background-color"),
      cntTxt: g(".ai-step output", "color"), cntFondo: g(".ai-step output", "background-color"),
      b2Txt: g(".ai-p-acciones .b2", "color"), accFondo: g(".ai-p-acciones", "background-color"),
      /* El texto chico de la banda. Va aparte porque es el que más
         fácil se cuela: la banda de pizarra es un verde MEDIO, no
         oscuro, y blanco rebajado encima deja de leerse. */
      subTxt: g(".ai-p-sub", "color"), rotTxt: g(".ai-p-l span", "color"),
      cintaK: g(".ai-cinta .c .k", "color"), cintaFondo: g(".ai-cinta", "background-color"),
    };
  });
  /* El fondo de las acciones es negro al 22 % SOBRE el panel, no un color
     propio: leerlo a secas da «rgba(0,0,0,.22)», que como color es un
     negro casi opaco y regala contraste que no existe. */
  const sobre = (frente, fondo) => {
    const f = canales(frente), b = canales(fondo);
    const a = Number((frente.match(/[\d.]+\)$/) ?? ["1)"])[0].slice(0, -1));
    return `rgb(${f.map((v, i) => v * a + b[i] * (1 - a)).join(",")})`;
  };
  const fondoAcc = sobre(m.accFondo, m.panelFondo);

  const c = {
    indice: razon(m.indTxt, m.panelFondo),
    abono: razon(m.abonoTxt, m.panelFondo),
    placa: razon(m.placaTxt, m.placaFondo),
    falta: razon(m.faltaTxt, m.faltaFondo),
    contador: razon(m.cntTxt, m.cntFondo),
    cerrar: razon(m.b2Txt, fondoAcc),
    sub: razon(m.subTxt, m.panelFondo),
    rotulo: razon(m.rotTxt, m.panelFondo),
    cinta: razon(m.cintaK, m.cintaFondo),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(7) + " ").join(""));
  for (const [k, v] of Object.entries(c)) {
    /* 4.5 para todo menos el índice y el abono, que son cifras de 50 y
       20 px en peso 900: ahí la norma admite 3.0, y exigir 4.5 obligaría
       a apagar el acento de la marca. */
    const minimo = (k === "indice" || k === "abono") ? 3 : 4.5;
    if (v < minimo) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo ${minimo})`);
  }
}

/* ---------- 2, 3 y 5. GEOMETRÍA ---------- */
console.log("\nancho             se sale        panel        barra fija  contador  campo");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(pag, null, ancho, 900);
  const m = await pag.evaluate(() => {
    /* Lo que un antepasado recorta no se sale, y LO QUE ESTÁ FIJO
       TAMPOCO: la barra de abajo es `position: fixed` y ocupa el ancho
       de la pantalla a propósito — medirla contra la tarjeta que la
       contiene dice que se sale seis píxeles por lado, y es lo que
       tiene que hacer. Un arnés que grita por lo que está bien enseña a
       ignorarlo, que es peor que no tenerlo. */
    const recortado = (e, hasta) => {
      for (let p = e; p && p !== hasta.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (p !== e && cs.overflow !== "visible") return true;
        if (cs.position === "fixed") return true;
      }
      return false;
    };
    const nombra = (e) =>
      ((e.className || "").toString().trim().split(/\s+/)[0] || e.tagName.toLowerCase()) +
      (e.textContent?.trim() ? ` «${e.textContent.trim().slice(0, 20)}»` : "");
    const salen = [];
    for (const f of document.querySelectorAll(".ai-caja, .ai-panel, .ai-cinta, .ai-def, .ai-fija")) {
      const c = f.getBoundingClientRect();
      for (const e of f.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && !recortado(e, f) && (r.right - c.right > 0.5 || c.left - r.left > 0.5))
          salen.push(nombra(e));
      }
    }
    const alto = (s) => {
      const l = [...document.querySelectorAll(s)];
      return l.length ? Math.min(...l.map((e) => Math.round(e.getBoundingClientRect().height))) : Infinity;
    };
    const panel = document.querySelector(".ai-panel");
    const izq = document.querySelector(".ai-izq");
    const d = document.documentElement;
    return {
      salen: [...new Set(salen)], lado: d.scrollWidth - d.clientWidth,
      /* «Al lado» de verdad: que empiece más a la derecha de donde
         termina la columna del formulario. Comparar solo el `top` diría
         que sí aunque estuviera debajo. */
      alLado: panel.getBoundingClientRect().left >= izq.getBoundingClientRect().right - 1,
      pegado: getComputedStyle(panel).position,
      barra: getComputedStyle(document.querySelector(".ai-fija")).display !== "none",
      contador: alto(".ai-step button"),
      campo: alto(".ai-campo select, .ai-campo input:not([type=checkbox])"),
    };
  });

  console.log(`${etiqueta.padEnd(17)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(14)} ` +
              `${(m.alLado ? "al lado · " + m.pegado : "abajo").padEnd(12)} ` +
              `${(m.barra ? "sí" : "no").padEnd(10)}  ${String(m.contador).padStart(8)}  ` +
              `${String(m.campo).padStart(5)}`);

  if (m.salen.length) fallas.push(`${etiqueta}: se sale de su tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado`);
  if (m.contador < 44)
    fallas.push(`${etiqueta}: un botón del contador mide ${m.contador} px (mínimo 44: se toca ` +
                "catorce veces seguidas, de pie y con el celular en una mano)");
  if (m.campo < 46) fallas.push(`${etiqueta}: un campo mide ${m.campo} px (mínimo 46)`);

  /* EL CANDADO QUE IMPORTA: la cuenta no se puede perder de vista. */
  if (m.alLado && m.pegado !== "sticky")
    fallas.push(`${etiqueta}: el panel va al lado pero no está pegado — se va hacia arriba ` +
                "al bajar por los catorce contadores, que es justo cuando hace falta");
  if (!m.alLado && !m.barra)
    fallas.push(`${etiqueta}: el panel se fue abajo y NO aparece la barra fija. La pantalla ` +
                "volvió a ser la de antes: hay que bajar hasta el final para saber en qué va la cuenta");
  if (m.alLado && m.barra)
    fallas.push(`${etiqueta}: el panel está al lado Y además la barra fija — el mismo dato dos veces`);
}

/* ---------- 6. LO MISMO, DENTRO DE LA CERTIFICACIÓN ---------- */
console.log("\ndentro de la tarjeta   se sale        panel   barra fija  contador");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(pag, null, ancho, 900, true);
  const m = await pag.evaluate(() => {
    /* Lo que un antepasado recorta no se sale, y LO QUE ESTÁ FIJO
       TAMPOCO: la barra de abajo es `position: fixed` y ocupa el ancho
       de la pantalla a propósito — medirla contra la tarjeta que la
       contiene dice que se sale seis píxeles por lado, y es lo que
       tiene que hacer. Un arnés que grita por lo que está bien enseña a
       ignorarlo, que es peor que no tenerlo. */
    const recortado = (e, hasta) => {
      for (let p = e; p && p !== hasta.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (p !== e && cs.overflow !== "visible") return true;
        if (cs.position === "fixed") return true;
      }
      return false;
    };
    const salen = [];
    for (const f of document.querySelectorAll(".ai-form, .ai-caja, .ai-panel, .ai-cinta, .ai-def")) {
      const c = f.getBoundingClientRect();
      for (const e of f.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && !recortado(e, f) && (r.right - c.right > 0.5 || c.left - r.left > 0.5))
          salen.push((e.className || e.tagName).toString().split(" ")[0]);
      }
    }
    const panel = document.querySelector(".ai-panel");
    const izq = document.querySelector(".ai-izq");
    const d = document.documentElement;
    const alto = (s) => {
      const l = [...document.querySelectorAll(s)];
      return l.length ? Math.min(...l.map((e) => Math.round(e.getBoundingClientRect().height))) : Infinity;
    };
    return {
      salen: [...new Set(salen)], lado: d.scrollWidth - d.clientWidth,
      alLado: panel.getBoundingClientRect().left >= izq.getBoundingClientRect().right - 1,
      barra: getComputedStyle(document.querySelector(".ai-fija")).display !== "none",
      contador: alto(".ai-step button"),
      /* La barra fija SÍ se mide, pero contra la pantalla. */
      barraSale: (() => {
        const b = document.querySelector(".ai-fija").getBoundingClientRect();
        return getComputedStyle(document.querySelector(".ai-fija")).display !== "none" &&
               (b.right > d.clientWidth + 0.5 || b.left < -0.5);
      })(),
    };
  });
  console.log(`${etiqueta.padEnd(22)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(14)} ` +
              `${(m.alLado ? "al lado" : "abajo").padEnd(7)} ${(m.barra ? "sí" : "no").padEnd(10)}  ` +
              `${String(m.contador).padStart(8)}`);
  if (m.salen.length)
    fallas.push(`${etiqueta}, dentro de la certificación: se sale ${m.salen.join(", ")}`);
  if (m.lado > 0)
    fallas.push(`${etiqueta}, dentro de la certificación: la página se arrastra ${m.lado} px`);
  if (m.contador < 44)
    fallas.push(`${etiqueta}, dentro de la certificación: el contador mide ${m.contador} px`);
  if (!m.alLado && !m.barra)
    fallas.push(`${etiqueta}, dentro de la certificación: el panel se fue abajo y no hay barra fija`);
  if (m.barraSale)
    fallas.push(`${etiqueta}, dentro de la certificación: la barra fija se sale de la pantalla`);
}

/* ---------- 7. LO QUE NO SE VE PERO DECIDE ---------- */
const limpio = tsx.replace(/\/\*[\s\S]*?\*\//g, "");
if (/\b(prompt|confirm|alert)\s*\(/.test(limpio))
  fallas.push("usa los diálogos del navegador en vez de los de la app");
/* Los conteos se TOCAN. Si vuelve a haber un input de número por
   defecto, el rediseño se deshizo sin que nadie lo note. */
if (/conteos\[.*\]\s*\?\?\s*""/.test(limpio) || /onChange=\{\(e\) => setConteos/.test(limpio))
  fallas.push("los conteos volvieron a ser casillas de teclear");
if (!/mover\(d\.clave, \+1\)/.test(limpio))
  fallas.push("no hay botón de sumar en el contador");
/* El índice que se pinta tiene que ser el mismo que calcula la base:
   defectos que cobran ÷ revisadas. */
if (!/cobran \/ rev/.test(limpio))
  fallas.push("el índice ya no es «defectos que cobran ÷ revisadas», que es lo que hace la base");

await navegador.close();

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Revisión AI: la cuenta nunca se pierde de vista, se lee en los 7 temas, " +
            "nada se sale y el dedo alcanza en los 5 anchos.");
