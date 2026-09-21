/* =====================================================================
   EL RESUMEN DEL DÍA DE TRASPASOS — medido, no mirado.

   QUÉ ES. Lo que se ve al pie de Control: una frase que contesta cómo
   quedó el día —«ese día se registraron 16 traspasos: 7 con documento y
   9 sin documento»— y cuatro montones que se abren.

   QUÉ SE COMPRUEBA Y POR QUÉ:

   1. QUE LAS CLASES DEL ARMAZÓN EXISTAN. Por palabra completa contra
      los literales del componente y las clases de la hoja. Un arnés que
      mide `.rz-frase` cuando la pantalla usa `.tp-rz-frase` aprueba
      siempre y no mide nada — ya pasó dos veces en este proyecto.

   2. CONTRASTE EN LOS SIETE TEMAS. Aquí hay dos parejas peligrosas:
      el resaltado de la frase pinta --tp-sobre-acento SOBRE --tp-acento,
      y el acento cambia con las preferencias de cada quien; y la marca
      del día cambiado es la única pareja de la pantalla que no sale de
      los tokens del tema.

   3. QUE NADA SE SALGA a 1440 / 820 / 390 / 360. La tabla se desplaza
      DENTRO de su caja; si la que se va de lado es la página, el menú
      queda inalcanzable mientras se mira la última columna.

   4. QUE LA TAPA SE PUEDA TOCAR. Es un botón, no una flecha: 44 px de
      alto como mínimo, también en el celular.

   5. LO QUE DECIDE Y NO SE VE: que la frase traiga el denominador, que
      los dos montones que dependen del corte no se pinten sin corte, y
      que solo uno abra al entrar.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const tp    = readFileSync(new URL("../src/app/(app)/traspasos/traspasos.css", import.meta.url), "utf8");
const cruce = readFileSync(new URL("../src/app/(app)/traspasos/cruce/cruce.css", import.meta.url), "utf8");
const glob  = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/app/(app)/shell.css", import.meta.url), "utf8");
const tsx   = readFileSync(new URL("../src/app/(app)/traspasos/control/Diferencias.tsx", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]];

const fila = (n) => `
  <tr class="${n === 3 ? "ojo" : ""}">
    <td class="cr-doc">TR-00${50 + n}</td>
    <td>45001234${40 + n}${n === 3 ? '<em class="tp-rz-marca">SAP lo reporta en otro día</em>' : ""}</td>
    <td>C</td><td>08:44 a. m.</td><td>NLW428</td><td>Casco vidrio</td>
    <td class="num">1.248 canastas</td>
    <td class="cr-ruta">BODEGA 38 → BODEGA EXPORTACION</td>
    <td>G. Visbal</td>
  </tr>`;

const ARMAZON = `
<div class="tp">
  <section class="caja tp-rz">
    <p class="tp-rz-ojo">TRASPASOS · JUEVES 17 DE SEPTIEMBRE DE 2026</p>
    <h2 class="tp-rz-frase">Ese día se registraron <em>16 traspasos</em>:
      7 con documento y <span class="mal">9 sin documento</span>.</h2>
    <p class="tp-rz-sub">Y en el corte de SAP hay <b>7 documentos</b> que salieron y nadie
      registró. El corte va del <b>14/09/2026</b> al <b>18/09/2026</b>.</p>

    <div class="tp-rz-barra"><i class="bien" style="width:43.75%"></i><i class="ojo" style="width:56.25%"></i></div>
    <p class="tp-rz-leg">
      <span><i class="bien"></i> 7 con documento</span>
      <span><i class="ojo"></i> 9 sin documento</span>
    </p>

    <div class="tp-rz-lista">
      <div class="tp-rz-monton bien">
        <button type="button" class="tp-rz-tapa">
          <span class="n">7</span>
          <span class="tx"><b>Con documento y en SAP</b><span>El viaje tiene su número de papel y el corte lo confirma</span></span>
          <span class="pct">44 %</span><span class="fl">▾</span>
        </button>
      </div>

      <div class="tp-rz-monton ojo on">
        <button type="button" class="tp-rz-tapa">
          <span class="n">9</span>
          <span class="tx"><b>Sin documento</b><span>Salieron con carga y nadie apuntó el número del papel</span></span>
          <span class="pct">56 %</span><span class="fl">▴</span>
        </button>
        <div class="tp-rz-cuerpo">
          <p class="tp-rz-nota">No aparecen en el corte de SAP: no hay número con qué
            emparejarlos, así que este es el único sitio donde se ven.</p>
          <div class="cr-marco"><table class="cr-tabla">
            <thead><tr><th>Viaje</th><th>Documento</th><th>Turno</th><th>Hora</th><th>Placa</th>
              <th>Tipo</th><th class="num">Carga</th><th>Origen → destino</th><th>Registró</th></tr></thead>
            <tbody>${[1, 2, 3, 4].map(fila).join("")}</tbody>
          </table></div>
        </div>
      </div>

      <div class="tp-rz-monton mal">
        <button type="button" class="tp-rz-tapa">
          <span class="n">7</span>
          <span class="tx"><b>En SAP y sin registrar</b><span>SAP los tiene y nadie los registró en CONTROL</span></span>
          <span class="pct"></span><span class="fl">▾</span>
        </button>
      </div>
    </div>
  </section>
</div>`;

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ---------- */
const literales = [...tsx.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)].map((m) => m[1]).join(" ");
const sueltas = literales.split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([
  ...sueltas, ...sueltas.map((w) => w.toLowerCase()),
  ...[...`${tp}${cruce}`.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
]);
const usadas = [...new Set([...ARMAZON.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/)))].filter(Boolean);
const inventadas = usadas.filter((c) => !palabras.has(c));
/* Y LAS PROPIAS DEL RESUMEN, EN EL COMPONENTE Y NO SOLO EN LA HOJA.
   `palabras` junta los literales del componente CON las clases del
   CSS, así que renombrar una clase en la pantalla y dejar la regla
   vieja en la hoja pasaba: la clase seguía existiendo… en el sitio
   equivocado. Lo que ata el arnés a la pantalla es el componente. */
const literalesTsx = new Set(sueltas);
const huerfanas = usadas.filter((c) => c.startsWith("tp-rz") && !literalesTsx.has(c));

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
  fallas.push(`el armazón usa clases que el componente no tiene: ${inventadas.join(", ")} ` +
              "— lo que se mida con ellas no dice nada de la pantalla");
if (huerfanas.length)
  fallas.push(`el armazón usa clases que el componente no tiene: ${huerfanas.join(", ")} ` +
              "— quedaron solo en la hoja de estilos, así que lo que se mida con ellas no " +
              "dice nada de la pantalla");

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();

const monta = async (tema, ancho, alto) => {
  await pag.setViewportSize({ width: ancho, height: alto });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${tp}${cruce} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">${ARMAZON}</main></div>
    </div></body></html>`);
};

/* ---------- 2. CONTRASTE ---------- */
console.log("tema      resalte  «sin doc»  n bien  n mal  rótulo  nota  flecha  marca");
for (const t of TEMAS) {
  await monta(t, 1440, 1400);
  const m = await pag.evaluate(() => {
    /* EL FONDO DE VERDAD ES EL PRIMERO QUE PINTA, SUBIENDO: leer el del
       propio elemento devuelve «rgba(0, 0, 0, 0)» —que como color es
       NEGRO— en todo lo que no trae fondo propio. */
    const fondoDe = (e) => {
      for (let f = e; f; f = f.parentElement) {
        const c = getComputedStyle(f).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    const par = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const s = getComputedStyle(e);
      return { txt: s.color, fondo: /rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)
        ? fondoDe(e.parentElement ?? e) : s.backgroundColor };
    };
    return {
      resalte: par(".tp-rz-frase em"),
      sinDoc: par(".tp-rz-frase .mal"),
      nBien: par(".tp-rz-monton.bien .tp-rz-tapa .n"),
      nMal: par(".tp-rz-monton.mal .tp-rz-tapa .n"),
      rotulo: par(".tp-rz-tapa .tx span"),
      nota: par(".tp-rz-nota"),
      flecha: par(".tp-rz-monton.on .tp-rz-tapa .fl"),
      marca: par(".tp-rz-marca"),
    };
  });

  const c = {};
  for (const [k, v] of Object.entries(m)) {
    if (!v) { fallas.push(`tema ${t ?? "oficial"}: no se pinta «${k}»`); continue }
    c[k] = razon(v.txt, v.fondo);
  }
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(7) + " ").join(""));
  for (const [k, v] of Object.entries(c))
    if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5)`);
}

/* ---------- 3 y 4. GEOMETRÍA ---------- */
console.log("\nancho    se sale       tapa  cifra  frase");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(null, ancho, 1100);
  const m = await pag.evaluate(() => {
    const d = document.documentElement;
    const salen = [];
    /* EL AIRE: el texto no puede ir pegado al borde de la caja ni
       cortarse arriba contra la esquina. «Que no se salga» no lo cazaba:
       pegado al borde sigue estando adentro. */
    for (const caja of document.querySelectorAll(".tp-rz")) {
      const c = caja.getBoundingClientRect();
      for (const s of [".tp-rz-ojo", ".tp-rz-frase", ".tp-rz-sub"]) {
        const e = caja.querySelector(s);
        if (!e) continue;
        const r = e.getBoundingClientRect();
        if (r.left - c.left < 12) salen.push("pegado al borde izquierdo: " + s);
      }
      const ojo = caja.querySelector(".tp-rz-ojo");
      if (ojo && ojo.getBoundingClientRect().top - c.top < 12) salen.push("cortado arriba: .tp-rz-ojo");
    }
    for (const caja of document.querySelectorAll(".tp-rz")) {
      const c = caja.getBoundingClientRect();
      for (const e of caja.querySelectorAll("*")) {
        /* La tabla se desplaza DENTRO de `.cr-marco`, así que lo que
           asoma por debajo de un contenedor con scroll no se sale: se
           rueda. Medirlo sería una falla que no existe. */
        /* HASTA LA CAJA, SIN INCLUIRLA. `.caja` lleva `overflow:
           hidden`, que RECORTA —no rueda—: incluyéndola, todo lo de
           adentro contaba como «se rueda» y esta medida no cazaba
           nada. Salió verde con la tabla desbordada a propósito, y por
           eso está escrito aquí. */
        let rodable = false;
        for (let p = e.parentElement; p && p !== caja; p = p.parentElement)
          if (getComputedStyle(p).overflow !== "visible") { rodable = true; break }
        if (rodable) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && (r.right - c.right > 0.5 || c.left - r.left > 0.5))
          salen.push((e.className || e.tagName).toString().split(" ")[0]);
      }
    }
    const alto = (s) => {
      const e = document.querySelector(s);
      return e ? Math.round(e.getBoundingClientRect().height) : 0;
    };
    const px = (s, p) => {
      const e = document.querySelector(s);
      return e ? Math.round(parseFloat(getComputedStyle(e)[p])) : 0;
    };
    return {
      salen: [...new Set(salen)], lado: d.scrollWidth - d.clientWidth,
      tapa: Math.min(...[...document.querySelectorAll(".tp-rz-tapa")]
        .map((e) => Math.round(e.getBoundingClientRect().height))),
      cifra: px(".tp-rz-tapa .n", "fontSize"),
      frase: px(".tp-rz-frase", "fontSize"),
      fraseArriba: (() => {
        const f = document.querySelector(".tp-rz-frase");
        const m = document.querySelector(".tp-rz-monton");
        return !!f && !!m && f.getBoundingClientRect().bottom <= m.getBoundingClientRect().top;
      })(),
    };
  });

  console.log(etiqueta.padEnd(9) + (m.salen.length ? m.salen.join(", ") : "nada").padEnd(14) +
              String(m.tapa).padStart(4) + String(m.cifra).padStart(7) + String(m.frase).padStart(7));

  if (m.salen.length)
    fallas.push(`${etiqueta}: se sale de la caja del resumen: ${m.salen.join(", ")}`);
  if (m.lado > 0)
    fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado — con la página ` +
                "yéndose de lado, el menú queda inalcanzable mientras se mira la tabla");
  if (m.tapa < 44)
    fallas.push(`${etiqueta}: la tapa de un montón mide ${m.tapa} px de alto (mínimo 44: es ` +
                "un botón y se toca)");
  /* LA CIFRA ES LA RESPUESTA DEL MONTÓN. Del tamaño del rótulo hay que
     buscarla, y el que entra mira cuatro cifras, no cuatro párrafos. */
  if (m.cifra < 24)
    fallas.push(`${etiqueta}: la cifra del montón se lee a ${m.cifra} px (mínimo 24)`);
  /* Y LA FRASE ES LA RESPUESTA DEL DÍA y se lee de lejos.
     ESTO MEDÍA OTRA COSA AL PRINCIPIO: exigía que la frase fuera MÁS
     GRANDE que la cifra del montón, y se puso roja con un diseño que
     está bien — 30 px contra 34. Comparar dos tamaños de letra no dice
     cuál manda: la cifra es UN glifo y la frase son dos renglones a
     peso 900 de lado a lado. Lo que sí se puede afirmar es que se lea
     de lejos, y eso es un mínimo. */
  if (m.frase < 22)
    fallas.push(`${etiqueta}: la frase del día se lee a ${m.frase} px (mínimo 22: es la ` +
                "respuesta y se lee de lejos)");
  /* Y QUE VAYA ARRIBA DE LOS MONTONES. Debajo, la respuesta queda
     detrás de cuatro cifras que no se entienden sin ella. */
  if (m.fraseArriba !== true)
    fallas.push(`${etiqueta}: la frase del día no va arriba de los montones`);
}

await navegador.close();

/* ---------- 5. LO QUE NO SE VE PERO DECIDE ---------- */
const limpio = tsx.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* LA FRASE TRAE EL DENOMINADOR. «9 sin documento» no dice nada sin
   decir sobre cuántos: nueve de doce es un día malo, nueve de ciento
   cuarenta es otra cosa, y sin el denominador las dos se leen igual. */
if (!/const registrados = conDocumento\.length \+ sinDocumento\.length;/.test(limpio))
  fallas.push("la frase del día no dice sobre cuántos traspasos: «9 sin documento» sin " +
              "denominador se lee igual siendo 9 de 12 que 9 de 140");

/* SIN CORTE NO SE AFIRMA NADA. Los dos montones que salen de comparar
   contra SAP no se pintan sin corte importado: un «0 sin registrar» sin
   haber comparado se lee como que todo cuadra, que es peor que callar. */
{
  const n = (limpio.match(/\{hayCorte && \(\s*\n\s*<Monton/g) ?? []).length;
  if (n !== 2)
    fallas.push(`${n} de los 2 montones que dependen del corte se esconden sin corte: sin ` +
                "haber comparado, un «0 sin registrar» se lee como que todo cuadra");
}
/* Y LOS QUE NO DEPENDEN DEL CORTE SE PINTAN SIEMPRE. Un viaje sin
   documento es un problema haya corte o no; atarlo al corte lo
   escondería justo los días en que nadie importó nada. */
if (!/cual="sindoc"/.test(limpio) ||
    /\{hayCorte && \(\s*\n\s*<Monton\s*\n?\s*cual="sindoc"/.test(limpio))
  fallas.push("el montón de los viajes sin documento depende del corte: quedaría escondido " +
              "justo los días en que nadie importó nada");

/* SOLO UNO ABIERTO AL ENTRAR, Y EL QUE TENGA TRABAJO. Con los cuatro
   desplegados la frase de arriba —que es la respuesta— queda a seis
   pantallazos; abriendo siempre el primero, el que tiene trabajo hay
   que ir a buscarlo. */
if (!/faltan\.length > 0 \? "falta"/.test(limpio) ||
    !/sinDocumento\.length > 0 \? "sindoc"/.test(limpio))
  fallas.push("al entrar no se abre el montón que tiene trabajo");
if (!/setAbierto\(\(x\) => \(x === cual \? null : cual\)\)/.test(limpio))
  fallas.push("los montones no se cierran, o se abren varios a la vez: la respuesta del día " +
              "quedaría a seis pantallazos de la pantalla");

/* LOS DOS MONTONES DE «CON DOCUMENTO» SALEN DEL MISMO CRUCE. Pedirle a
   la base una segunda lista de «los que SAP sí tiene» sería tener dos
   respuestas a la misma pregunta esperando a discrepar. */
/* LAS DOS MITADES, no «que aparezca». Con una sola bastando, mutar la
   otra salía verde: la afirmación la sostenía la mitad que no se había
   tocado. */
/* Y CON EL NÚMERO DE FACTURACIÓN, no con la orden de cargue: es el que
   SAP trae. Con la orden, nada cuadraría nunca. */
if ((limpio.match(/enSap\.has\(clave\(v\)\)/g) ?? []).length !== 2 ||
    !/const clave = \(v: Viaje\) => \(v\.factura_documento \?\? ""\)/.test(limpio))
  fallas.push("«con documento» no se parte mirando el corte: los dos montones saldrían de " +
              "dos cuentas distintas de lo mismo");

/* EL DÍA CAMBIADO NO SE PIERDE al pasar de listar documentos a listar
   viajes: cuadran por número, pero descuadran el cumplido de los DOS
   días a la vez, y eso hay que poder verlo. */
if (!/l\.dia_distinto && l\.documento/.test(limpio) || !/tp-rz-marca/.test(limpio))
  fallas.push("el día cambiado desapareció del resumen: cuadra por número y descuadra el " +
              "cumplido de dos días");

/* Y EL RESALTADO DE LA FRASE ES FONDO, NO LETRA. El acento del módulo
   está hecho para llevar texto encima; de color de letra dio 1,6 de
   contraste en tres temas de esta misma app. */
{
  /* SE MIRA LA REGLA, NO EL RESTO DE LA HOJA. Primero cortaba desde
     aquí hasta el final del archivo y saltaba con un `border-color:
     var(--tp-acento)` cuatro reglas más abajo — «border-color:»
     contiene «color:». Una aserción que se pone roja por otra cosa no
     prueba nada de lo que dice probar. */
  const regla = (cruce.match(/\.tp \.tp-rz-frase em \{[^}]*\}/) ?? [""])[0];
  if (!regla)
    fallas.push("no está la regla del resaltado de la frase");
  else if (!/background:\s*var\(--tp-acento\)/.test(regla) ||
           !/(?:^|[^-])color:\s*var\(--tp-sobre-acento\)/.test(regla))
    fallas.push("el resaltado de la frase no es el acento de FONDO con su letra encima: " +
                "de color de letra, el acento dio 1,6 de contraste en tres temas de esta app");
}

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ El resumen del día: la respuesta en una frase, los montones se abren de a uno, " +
            "nada se sale y los siete temas se leen.");
