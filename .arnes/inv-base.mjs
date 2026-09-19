/* =====================================================================
   LA BASE DEL CONTEO — medida, no mirada.

   QUÉ ES. Todo lo contado, renglón por renglón y con todas sus columnas,
   para cuadrar contra la hoja. Se mira SENTADO, con el Excel al lado —no
   de pie frente a una estiba— así que aquí no se miden 48 px: se mide si
   veintiséis columnas se pueden recorrer sin perder el renglón y sin
   perder los filtros.

   QUÉ SE COMPRUEBA Y POR QUÉ:

   1. QUE LOS DOS MONTONES NO SE MEZCLEN. Lo enviado está firmado; los
      borradores son de quien los está caminando. Un renglón a medio
      contar sumando en un total del que alguien despacha no da error, no
      avisa, y la diferencia aparece semanas después.

   2. QUE DE LOS BORRADORES NO SE TOQUE NADA. Ni corregir ni borrar: una
      fila que alguien arregla «de paso» desde otra pantalla es un
      renglón que el que cuenta ya no reconoce.

   3. QUE LA TABLA NO ARRASTRE LA PÁGINA. Si la que se va de lado es la
      página, el menú y los filtros quedan inalcanzables mientras se mira
      la columna veinte.

   4. QUE LA CABECERA SE QUEDE PEGADA. En la fila ciento veinte, una
      hilera de números sin títulos a la vista es cómo se lee «saldo» en
      la columna de «cajas sueltas».

   5. CONTRASTE EN LOS SIETE TEMAS, incluidas las dos parejas que NO
      salen de los tokens: el aviso ámbar del borrador sobre crema y lo
      que ya se pasó, en rojo.

   6. QUE EL EXCEL LLEVE LAS MISMAS COLUMNAS QUE LA TABLA. Son tres
      sitios —cabecera, celdas y CSV— y si se escriben por separado, el
      que se olvida no da error: saca el archivo con los títulos de una
      columna y los datos de la de al lado.

   7. QUE EL TOPE SE DIGA. PostgREST contesta hasta cierto número de
      filas y no avisa: una lista corta se ve perfectamente normal y
      alguien cuadra contra ella.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const fefo = readFileSync(new URL("../src/app/(app)/inventario/fefo.css", import.meta.url), "utf8");
const base = readFileSync(new URL("../src/app/(app)/inventario/base/base.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/app/(app)/shell.css", import.meta.url), "utf8");
const tsx = readFileSync(new URL("../src/app/(app)/inventario/base/Base.tsx", import.meta.url), "utf8");
const pgx = readFileSync(new URL("../src/app/(app)/inventario/base/page.tsx", import.meta.url), "utf8");
const datos = readFileSync(new URL("../src/modulos/inventario/fefo.ts", import.meta.url), "utf8");
const reg = readFileSync(new URL("../src/modulos/registro.ts", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]];

/* LAS COLUMNAS SE LEEN DEL COMPONENTE, no se escriben aquí.
   Escribirlas a mano haría un armazón que se queda viejo en silencio: se
   agrega una columna a la pantalla, el arnés sigue midiendo las de antes
   y aprueba una tabla que ya no es esa. */
const COLUMNAS = [...tsx.matchAll(/\{ k: "([\w]+)", t: "([^"]+)"/g)].map((m) => ({ k: m[1], t: m[2] }));

const fila = (v) => `
  <tr>
    <td>ALAR</td><td>BAHIA_6</td><td>DER</td><td>ALAR_BAHIA_6 AVERIA VACIOS</td>
    <td>3500231</td><td>ENVASE COSTEÑITA 175 ML RETORNABLE CAJA X 30</td>
    <td>RETORNABLE</td><td>ENVASE</td><td>13/09/2026</td><td></td>
    <td class="num">${v}</td><td class="num">87</td>
    <td class="num">80</td><td class="num">12</td><td class="num"></td>
    <td class="num"><b>4.320</b></td><td class="num">54</td><td class="num">90</td>
    <td>Sí</td><td>No</td><td>No</td><td>VACIOS</td>
    <td>Se movió del pasillo de al lado</td>
    <td>FEFO-2026-09-18-A</td><td>jefe</td><td>18/09/2026 05:41</td>
  </tr>`;

const TABLA = `
  <div class="ba-marco">
    <table class="ba-tabla">
      <thead><tr>${COLUMNAS.map((c) =>
        `<th><button type="button">${c.t}<i></i></button></th>`).join("")}</tr></thead>
      <tbody>
        ${fila('<span class="ba-mal">-3</span>')}
        ${/* CUARENTA FILAS Y NO TRES. Con tres, la tabla no llega al alto
              de su caja, no hay nada que desplazar, y la comprobación de
              la cabecera pegada aprueba sin haber medido nada: es
              exactamente el tipo de aserción que parece verde durante
              meses. Lo cazó la mutación. */ ""}
        ${Array.from({ length: 40 }, () => fila("249")).join("")}
      </tbody>
    </table>
  </div>`;

/* EL ESCOGEDOR DE INVENTARIO. Es lo primero de la pantalla y decide
   CUÁL tabla se mira, no cómo se recorta: por eso se mide aparte de los
   filtros.

   Y MIDE LO MISMO CON 3 QUE CON 300. Era una fila de tarjetas, una por
   recorrido; a un conteo diario eso son ciento ochenta en seis meses.
   Ahora es un buscador que se teclea más TRES atajos fijos. Aquí van
   seis recorridos en la lista del buscador a propósito: si el escogedor
   creciera con ellos, la medida del alto lo cazaría. */
const INVS = `
  <div class="ba-invs">
    <p class="ba-invs-rot">Qué inventario estás mirando<em>6 recorridos</em></p>
    <div class="ba-invs-fila">
      <label class="ba-inv-buscar"><span class="sr">Buscar un recorrido</span>
        <div class="bs"><input class="bs-campo" value="18/09/2026 · FEFO-2026-09-18-A">
          <span class="bs-flecha">▾</span></div></label>
      <button type="button" class="ba-inv todos"><b>Todos</b><span>6 recorridos</span></button>
      <button type="button" class="ba-inv on"><b>18/09/2026</b><span>-A · 241 rengl.</span></button>
      <button type="button" class="ba-inv"><b>17/09/2026</b><span>-C · 198 rengl.</span></button>
    </div>
  </div>`;

const FILTROS = `${INVS}
  <div class="ba-filtros">
    <label class="ancho"><span class="sr">Buscar</span>
      <input placeholder="Código, material, familia u observación — 3128, aguila…"></label>
    <div class="ba-tipos" role="group" aria-label="Producto o envase">
      <button type="button" class="on">Todo<em>1.284</em></button>
      <button type="button">Producto<em>908</em></button>
      <button type="button">Envase<em>376</em></button>
    </div>
    <label><span class="sr">Calle</span>
      <select><option>Todas las calles</option></select></label>
    <label><span class="sr">Módulo</span>
      <select><option>Todos los módulos</option></select></label>
    <label class="fe-check"><input type="checkbox"><span>Solo lo que ya se pasó</span></label>
    <button type="button" class="btn plano">Quitar filtros</button>
  </div>
  <div class="ba-cuenta">
    <p><b>152</b> renglones de 1.284 · <b>68.420</b> cajas · 41 ubicaciones</p>
    <button type="button" class="btn">Bajar a Excel</button>
  </div>`;

const cabeza = `
  <section class="cabeza">
    <div><p class="ojo">INVENTARIO · LA BASE</p><h1>La base</h1>
      <p class="sub">Todo lo contado, renglón por renglón y con todas sus columnas. Bodega <b>CD38</b>.</p></div>
  </section>
  <div class="fe-pes ba-pes" role="tablist">
    <button type="button" role="tab" class="on">La base<em>1284</em></button>
    <button type="button" role="tab">Borradores<em>37</em></button>
  </div>`;

const ARMAZON = `<div class="fe">${cabeza}
  <p class="ba-dice">Recorridos <b>enviados</b>: firmados con nombre, fecha y hora, y ya no se
    pueden corregir. Es lo único sobre lo que se puede afirmar algo.</p>
  ${FILTROS}${TABLA}</div>`;

const BORRADORES = `<div class="fe">${cabeza}
  <p class="ba-dice ojo">Recorridos que alguien tiene <b>abiertos ahora mismo</b> —
    FEFO-2026-09-18-B (Génesis). Están aquí <b>solo para mirar</b>: no entran en la base, no
    suman en ningún total, y desde aquí no se tocan. Para corregir uno se entra a
    <b>Contar</b>, que es donde está el recorrido.</p>
  ${FILTROS}${TABLA}</div>`;

const CON_TOPE = ARMAZON.replace('<p class="ba-dice">',
  `<p class="ba-tope"><b>Se llegó al tope de filas que esta pantalla trae de una.</b> Lo que
   ves está bien, pero no está todo: faltan los recorridos más viejos.</p><p class="ba-dice">`);

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ---------- */
const literales = [...`${tsx}\n${pgx}`.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)].map((m) => m[1]).join(" ");
const sueltas = literales.split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([
  ...sueltas, ...sueltas.map((w) => w.toLowerCase()),
  ...[...`${fefo}${base}`.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
]);
const usadas = [...new Set([...`${ARMAZON}${BORRADORES}${CON_TOPE}`.matchAll(/class="([^"]+)"/g)]
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

const fallas = [];
if (inventadas.length)
  fallas.push(`el armazón usa clases que la pantalla no tiene: ${inventadas.join(", ")} ` +
              "— lo que se mida con ellas no dice nada de la pantalla");
if (COLUMNAS.length < 20)
  fallas.push(`solo se leyeron ${COLUMNAS.length} columnas del componente: «toda la ` +
              "información» son más que eso, o el arnés dejó de saber leerlas");

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();

const monta = async (tema, ancho, alto, html = ARMAZON) => {
  await pag.setViewportSize({ width: ancho, height: alto });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${fefo}${base} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">${html}</main></div>
    </div></body></html>`);
};

/* ---------- 5. CONTRASTE ---------- */
console.log(`Columnas leídas del componente: ${COLUMNAS.length}`);
console.log("\ntema      celda  título  pasó  borrador  tope  cuenta  inv ON  inv fecha  inv pie  tipo ON  tipo off");
for (const t of TEMAS) {
  const fondoReal = () => {};
  await monta(t, 1440, 1000);
  const m = await pag.evaluate(() => {
    const sube = (e) => {
      for (let p = e; p; p = p.parentElement) {
        const c = getComputedStyle(p).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    const par = (sel) => {
      const e = document.querySelector(sel);
      return e ? { txt: getComputedStyle(e).color, fondo: sube(e) } : null;
    };
    return {
      /* LA CELDA SE MIDE EN UNA FILA PAR, que es la del rayado: es el
         fondo más oscuro de la tabla y por tanto el peor caso. Medirla
         en una impar daría un número bonito y falso. */
      celda: par(".ba-tabla tbody tr:nth-child(2) td"),
      titulo: par(".ba-tabla thead button"),
      malo: par(".ba-tabla .ba-mal"),
      cuenta: par(".ba-cuenta p"),
      /* EL INVENTARIO ESCOGIDO Y EL TIPO ESCOGIDO pintan --fe-sobre
         SOBRE --fe-acento, y el acento cambia con las preferencias de
         cada quien: en otra pantalla de esta app la misma pareja dio
         1,6 en tres temas y 6,9 en otro. */
      invOn: par(".ba-inv.on b"),
      invFecha: par(".ba-inv:not(.on) b"),
      invPie: par(".ba-inv:not(.on) span"),
      tipoOn: par(".ba-tipos button.on"),
      tipoOff: par(".ba-tipos button:not(.on)"),
    };
  });
  await monta(t, 1440, 1000, BORRADORES);
  const bor = await pag.evaluate(() => {
    const e = document.querySelector(".ba-dice.ojo");
    let f = e; for (; f; f = f.parentElement) {
      const c = getComputedStyle(f).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) break;
    }
    return { txt: getComputedStyle(e).color, fondo: getComputedStyle(f).backgroundColor };
  });
  await monta(t, 1440, 1000, CON_TOPE);
  const tope = await pag.evaluate(() => {
    const e = document.querySelector(".ba-tope");
    return { txt: getComputedStyle(e).color, fondo: getComputedStyle(e).backgroundColor };
  });

  /* SI ALGO NO SE PINTA, SE DICE. Antes reventaba con «Cannot read
     properties of null», que es un error del arnés y no un hallazgo:
     el que lo lee no sabe si la pantalla está mal o si el armazón se
     quedó viejo. */
  for (const [k, v] of Object.entries(m))
    if (!v) fallas.push(`tema ${t ?? "oficial"}: el armazón no pinta «${k}», así que lo que ` +
                        "se mida con ello no dice nada de la pantalla");
  if (Object.values(m).some((v) => !v)) continue;

  const c = {
    celda: razon(m.celda.txt, m.celda.fondo),
    titulo: razon(m.titulo.txt, m.titulo.fondo),
    pasado: razon(m.malo.txt, m.malo.fondo),
    borrador: razon(bor.txt, bor.fondo),
    tope: razon(tope.txt, tope.fondo),
    cuenta: razon(m.cuenta.txt, m.cuenta.fondo),
    invOn: razon(m.invOn.txt, m.invOn.fondo),
    invFecha: razon(m.invFecha.txt, m.invFecha.fondo),
    invPie: razon(m.invPie.txt, m.invPie.fondo),
    tipoOn: razon(m.tipoOn.txt, m.tipoOn.fondo),
    tipoOff: razon(m.tipoOff.txt, m.tipoOff.fondo),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(6) + "  ").join(""));
  for (const [k, v] of Object.entries(c))
    if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5)`);
  void fondoReal;
}

/* ---------- 3, 4 y geometría ---------- */
console.log("\nancho    la página se va de lado   la tabla se desplaza   cabecera pegada");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(null, ancho, 800);
  const m = await pag.evaluate(() => {
    const d = document.documentElement;
    const marco = document.querySelector(".ba-marco");
    const tabla = document.querySelector(".ba-tabla");
    const th = document.querySelector(".ba-tabla thead th");
    return {
      lado: d.scrollWidth - d.clientWidth,
      /* La tabla tiene que ser MÁS ANCHA que su marco —si no, no hay
         nada que desplazar y esta medida no dice nada— y el marco tiene
         que poder desplazarse. */
      desborda: Math.round(tabla.scrollWidth - marco.clientWidth),
      desplaza: getComputedStyle(marco).overflowX,
      pegada: getComputedStyle(th).position,
      /* Y el botón del título tiene que ser alcanzable con el dedo
         también en una tableta: es lo que ordena. */
      alto: Math.round(document.querySelector(".ba-tabla thead button").getBoundingClientRect().height),

      /* ---------- EL ESCOGEDOR DE INVENTARIO ----------
         RUEDA DE LADO Y NO SE APILA. Con cuarenta recorridos apilados,
         la tabla queda cuatro pantallas más abajo y la pantalla deja de
         servir para lo que sirve. En una fila que rueda, el alto es
         siempre el mismo y el más nuevo está a la vista. */
      invs: (() => {
        const f = document.querySelector(".ba-invs-fila");
        if (!f) return null;
        const b = [...f.querySelectorAll(".ba-inv")];
        return {
          alto: Math.round(f.getBoundingClientRect().height),
          atajos: b.length,
          buscador: !!f.querySelector(".ba-inv-buscar .bs-campo"),
          toque: Math.min(...b.map((e) => Math.round(e.getBoundingClientRect().height))),
          /* TODOS A LA VISTA, sin rodar ni cortarse: son cuatro cosas y
             no crecen, así que no hay excusa para esconder una. */
          dentro: b.every((e) =>
            e.getBoundingClientRect().right <= f.getBoundingClientRect().right + 0.5),
        };
      })(),
      tipos: (() => {
        const b = [...document.querySelectorAll(".ba-tipos button")];
        if (b.length === 0) return null;
        return {
          n: b.length,
          toque: Math.min(...b.map((e) => Math.round(e.getBoundingClientRect().height))),
        };
      })(),
    };
  });
  console.log(`${etiqueta.padEnd(8)} ${String(m.lado === 0 ? "no" : m.lado + " px").padEnd(23)} ` +
              `${(m.desplaza + (m.desborda > 0 ? ` (+${m.desborda} px)` : " (no desborda)")).padEnd(22)} ` +
              `${m.pegada}`);

  if (m.lado > 0)
    fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado. Con la página ` +
                "yéndose de lado, el menú y los filtros quedan inalcanzables mientras se " +
                "mira la columna veinte");
  if (!["auto", "scroll"].includes(m.desplaza))
    fallas.push(`${etiqueta}: la tabla no se desplaza dentro de su caja (overflow-x: ` +
                `${m.desplaza}): veintiséis columnas no caben en ninguna pantalla`);
  if (m.pegada !== "sticky")
    fallas.push(`${etiqueta}: la cabecera de la tabla no se queda pegada (position: ` +
                `${m.pegada}). En la fila ciento veinte, una hilera de números sin títulos ` +
                "a la vista es cómo se lee «saldo» en la columna de «cajas sueltas»");
  if (m.alto < 36)
    fallas.push(`${etiqueta}: el título que ordena mide ${m.alto} px de alto`);

  if (!m.invs) fallas.push(`${etiqueta}: no está el escogedor de inventario`);
  else {
    console.log(`         escogedor: ${m.invs.alto} px de alto · ` +
                `${m.invs.atajos} atajos de ${m.invs.toque} px · ` +
                `buscador ${m.invs.buscador ? "sí" : "NO"}`);
    /* LO QUE SE PROMETE ES QUE NO CREZCA. Era una fila de tarjetas, una
       por recorrido, y a un conteo diario eso son ciento ochenta en seis
       meses. Ahora la historia entera vive dentro del buscador, y lo
       que se pinta son tres atajos fijos. */
    if (!m.invs.buscador)
      fallas.push(`${etiqueta}: no está el buscador de recorridos: con cientos, escogerlos a ` +
                  "botones vuelve a ser una fila interminable");
    if (m.invs.atajos !== 3)
      fallas.push(`${etiqueta}: hay ${m.invs.atajos} atajos de recorrido y son tres —«Todos» ` +
                  "y los dos últimos—: si crecen con la historia, crece la pantalla");
    /* NO SE PUEDE COMER LA PANTALLA. Dos renglones en el celular —el
       buscador arriba y los tres atajos debajo— es el techo. */
    if (m.invs.alto > 130)
      fallas.push(`${etiqueta}: el escogedor de inventario mide ${m.invs.alto} px de alto y ` +
                  "empuja la tabla fuera de la primera pantalla");
    if (m.invs.toque < 44)
      fallas.push(`${etiqueta}: los atajos de inventario miden ${m.invs.toque} px (mínimo ` +
                  "44: se tocan)");
    if (!m.invs.dentro)
      fallas.push(`${etiqueta}: un atajo de inventario se sale de su fila`);
  }

  if (!m.tipos) fallas.push(`${etiqueta}: no están los botones de producto y envase`);
  else {
    if (m.tipos.n !== 3)
      fallas.push(`${etiqueta}: hay ${m.tipos.n} botones de tipo y son tres — todo, producto ` +
                  "y envase");
    if (m.tipos.toque < 36)
      fallas.push(`${etiqueta}: los botones de producto y envase miden ${m.tipos.toque} px`);
  }
}

/* Y QUE LA CABECERA DE VERDAD SE QUEDE al desplazar, no solo que lo diga
   el CSS: basta un `overflow` en el ancestro equivocado para que sticky
   deje de funcionar sin un solo error. */
{
  await monta(null, 1440, 600);
  const m = await pag.evaluate(async () => {
    const marco = document.querySelector(".ba-marco");
    const th = document.querySelector(".ba-tabla thead th");
    const antes = th.getBoundingClientRect().top;
    marco.scrollTop = 120;
    await new Promise((r) => requestAnimationFrame(r));
    return { antes: Math.round(antes), despues: Math.round(th.getBoundingClientRect().top),
             movio: marco.scrollTop };
  });
  if (m.movio === 0)
    fallas.push("la tabla no se pudo desplazar hacia abajo: la comprobación de la cabecera " +
                "pegada no midió nada");
  else if (Math.abs(m.despues - m.antes) > 2)
    fallas.push(`la cabecera se fue con el desplazamiento (de ${m.antes} a ${m.despues} px): ` +
                "basta un `overflow` en el ancestro equivocado para que sticky deje de " +
                "funcionar sin un solo error");
  console.log(`\ncabecera al desplazar 120 px: ${m.antes} → ${m.despues} px`);
}

await navegador.close();

/* ---------- LO QUE NO SE VE PERO DECIDE ---------- */
const limpio = tsx.replace(/\/\*[\s\S]*?\*\//g, "");
const limpioDatos = datos.replace(/\/\*[\s\S]*?\*\//g, "");

/* 1. LOS DOS MONTONES NO SE MEZCLAN.
   Es lo que se pidió con todas sus letras: «lo enviado en una parte y la
   hoja de borradores de todos, sin tocar nada de ellos, solo para ir
   teniendo la visual, pero no entra dentro de la base de datos fija».

   Y ES EL ERROR CARO. Un renglón a medio contar sumando en un total del
   que alguien despacha no da error, no avisa, y la diferencia aparece
   semanas después cuando ya nadie sabe de dónde salió. */
if (!/enviadas: lineas\.filter\(\(r\) => deEnviados\.has\(r\.conteo_id\)\)/.test(limpioDatos) ||
    !/abiertas: lineas\.filter\(\(r\) => !deEnviados\.has\(r\.conteo_id\)\)/.test(limpioDatos))
  fallas.push("lo enviado y los borradores no se separan por el estado del recorrido: un " +
              "renglón a medio contar acabaría sumando en un total del que alguien despacha");
if (!/const crudas = pestania === "base" \? enviadas : abiertas/.test(limpio))
  fallas.push("la tabla no lee un montón u otro según la pestaña: los dos acabarían juntos");
/* Y los totales de arriba se calculan sobre lo de ESA pestaña. Un total
   que suma los dos montones es exactamente lo que había que evitar, y se
   ve igual de bien escrito. */
if (!/const cajas = filas\.reduce/.test(limpio))
  fallas.push("el total de cajas no sale de las filas que se están viendo");
if (/\[\.\.\.enviadas, \.\.\.abiertas\]/.test(limpio))
  fallas.push("la pantalla junta los dos montones en una sola lista");

/* 2. DE LOS BORRADORES NO SE TOCA NADA. La pantalla entera es de
   lectura: no llama a ninguna función que escriba. */
for (const rpc of ["conteo_fefo_editar", "conteo_fefo_borrar", "conteo_fefo_enviar",
                   "conteo_fefo_agregar"]) {
  if (limpio.includes(rpc))
    fallas.push(`la base llama a ${rpc}: esta pantalla solo lee. Una fila que alguien ` +
                "arregla «de paso» desde aquí es un renglón que el que cuenta ya no reconoce");
}
if (/supabase|createClient/.test(limpio))
  fallas.push("la pantalla habla con la base desde el navegador: lo que lee se lo da el " +
              "servidor, ya filtrado por permisos");

/* 3. EL ANULADO NO ES NI LO UNO NI LO OTRO. Un recorrido anulado se
   anuló por algo, y arrastrarlo «para tener la visual» es exactamente
   cómo vuelve a contarse. */
if (!/x\.estado === "cerrado"/.test(limpioDatos) ||
    !/x\.estado === "en_proceso" \|\| x\.estado === "borrador"/.test(limpioDatos))
  fallas.push("los recorridos no se parten por estado con nombre propio: un anulado podría " +
              "colarse en alguno de los dos montones");

/* 4. EL TOPE SE DICE. PostgREST contesta hasta cierto número de filas y
   NO AVISA: la lista llega corta y se ve perfectamente normal. */
if (!/tope: lineas\.length === TOPE_BASE/.test(limpioDatos))
  fallas.push("no se detecta cuándo se llegó al tope de filas: la lista llegaría corta y " +
              "nadie lo sabría");
if (!/\{tope && \(/.test(limpio))
  fallas.push("la pantalla no dice cuándo se llegó al tope");

/* 5. UNA SOLA LISTA DE COLUMNAS PARA LOS TRES SITIOS.
   Cabecera, celdas y Excel. Escritas por separado, la que se olvida no
   da error: saca el archivo con los títulos de una columna y los datos
   de la de al lado. */
{
  /* CUATRO Y NO TRES: la cabecera de la tabla, sus celdas, la cabecera
     del CSV y los renglones del CSV. Lo puse en tres y la mutación
     —quitar uno de los cuatro— seguía pasando: con el umbral mal, la
     aserción cazaba la mitad de lo que decía cazar. */
  const usos = (limpio.match(/COLUMNAS\.map/g) ?? []).length;
  if (usos < 4)
    fallas.push(`las columnas se recorren ${usos} vez/veces y tienen que ser cuatro —la ` +
                "cabecera de la tabla, sus celdas, la cabecera del Excel y sus renglones—: " +
                "escritas por separado, la que se olvida saca el archivo con los títulos de " +
                "una columna y los datos de la de al lado");
}

/* 6. EL EXCEL SE ABRE BIEN EN ESPAÑOL.
   · `sep=;` o las veintiséis columnas se apilan en la A.
   · El BOM o «Águila» se abre como «Ãguila». */
if (!/"sep=;"/.test(limpio))
  fallas.push("el CSV no dice el separador: Excel en español apilaría las columnas en la A");
/* SE BUSCA EN EL CÓDIGO, NO EN LOS COMENTARIOS.
   Esta comprobación la escribí primero contra el archivo entero, y se
   daba por satisfecha con un COMENTARIO MÍO que menciona el BOM: quitar
   el BOM del código la dejaba verde porque el comentario seguía ahí. Lo
   cazó la mutación. Un arnés que se aprueba con la documentación de lo
   que debería hacer no comprueba nada. */
if (!/new Blob\(\["\\uFEFF"/.test(limpio))
  fallas.push("el CSV va sin BOM: «Águila» se abriría como «Ãguila»");
/* Y SE BAJA LO QUE SE ESTÁ VIENDO, no el total. Bajar siempre todo sería
   devolverle el trabajo de filtrar al Excel, que es de donde se venía. */
if (!/bajar\(filas,/.test(limpio))
  fallas.push("el Excel no baja lo filtrado");

/* 7. EL ORDEN NO MUTA LA LISTA QUE VINO DEL SERVIDOR. `sort` muta, y
   mutar aquí reordena el arreglo de origen: al cambiar de pestaña y
   volver, las filas ya no están donde el useMemo cree. */
if (!/return \[\.\.\.vistas\]\.sort/.test(limpio))
  fallas.push("se ordena mutando la lista que vino del servidor");

/* 8. LA PANTALLA ESTÁ REGISTRADA Y EN EL ORDEN DEL PROCESO.
   Se mantiene el maestro, se camina la bodega, queda el registro, y
   sobre ese registro se decide. La base va ANTES que el tablero porque
   el tablero SALE de ella. */
{
  const bloque = (reg.match(/id: "inventario"[\s\S]*?\n  \},/) ?? [""])[0];
  const rutas = [...bloque.matchAll(/ruta: "(\/inventario[^"]*)"/g)].map((m) => m[1]);
  const debe = ["/inventario", "/inventario/maestro", "/inventario/conteo",
                "/inventario/base", "/inventario"];
  if (rutas.join("|") !== debe.join("|"))
    fallas.push(`las pantallas de Inventario salen [${rutas.join(", ")}] y deben salir ` +
                `[${debe.join(", ")}]: la base va antes que el tablero porque el tablero ` +
                "sale de ella");
}

/* =====================================================================
   9. QUÉ INVENTARIO SE ESTÁ MIRANDO, Y PRODUCTO O ENVASE

   «Cuando entre a la base deberían aparecer por fecha los registros que
   hicieron, consolidados en una sola base, con el fin de seleccionar
   qué inventario ver… y dentro del inventario que se esté evaluando,
   que pueda filtrar por producto o por envase.»
   ===================================================================== */

/* POR FECHA, Y EL MÁS NUEVO ARRIBA. Se entra a mirar lo de ayer, no lo
   de hace cuatro meses; y con el orden al revés, el recorrido de hoy
   queda al final de la lista el día que haya cuarenta. */
{
  const bloque = (limpio.match(/const recorridos = useMemo\(\(\) => \{[\s\S]*?\}, \[crudas, conteos\]\);/) ?? [""])[0];
  if (!bloque)
    fallas.push("no está la lista de inventarios");
  else {
    if (!/\.sort\(\(a, b\) => \(b\.fecha \?\? ""\)\.localeCompare\(a\.fecha \?\? ""\)/.test(bloque))
      fallas.push("los inventarios no salen por fecha con el más nuevo arriba: el de hoy " +
                  "quedaría al final el día que haya cuarenta");
    /* Y CADA UNO TRAE SU FECHA Y SUS CIFRAS. Un desplegable que dice
       «FEFO-0007» no dice de qué día es ni cuánto trae: había que
       escoger uno, mirar la tabla y volver a escoger otro para saber si
       era ese. */
    for (const [que, re] of [["su fecha", /fecha: c\?\.fecha_analisis/],
                             ["quién lo firmó", /quien: c\?\.envio_nombre/],
                             ["cuántos renglones", /a\.renglones \+= 1;/],
                             ["cuántas cajas", /a\.cajas \+= Number\(r\.total_cajas\)/]])
      if (!re.test(bloque))
        fallas.push(`el inventario de la lista no dice ${que}: habría que escoger uno, mirar ` +
                    "la tabla y volver a escoger otro para saber si era ese");
    /* LAS CIFRAS SE CUENTAN DE LAS FILAS QUE HAY, no de la cabecera del
       recorrido: esta pestaña puede traer un tope, y enseñar «1.240
       renglones» encima de una tabla de 800 sería decir dos cosas
       distintas del mismo recorrido en la misma pantalla. */
    if (/renglones: c\?\.renglones|cajas: c\?\.total_cajas/.test(bloque))
      fallas.push("las cifras del inventario salen de la cabecera del recorrido y no de las " +
                  "filas que hay: con el tope puesto, la tarjeta y la tabla dirían cosas " +
                  "distintas del mismo recorrido");
  }
}

/* Y «TODOS» ES UNA OPCIÓN, LA PRIMERA Y ESCRITA. La base ES la suma de
   todos los recorridos: sin esa opción habría que escoger uno para
   poder entrar, y «cuánto hay contado en total» no tendría dónde
   contestarse. */
if (!/className=\{"ba-inv todos"/.test(limpio) ||
    !/onClick=\{\(\) => \{ setFRecorrido\(""\)/.test(limpio))
  fallas.push("no se puede volver a ver todos los recorridos juntos: habría que escoger uno " +
              "para poder entrar");

/* ESCOGER OTRO INVENTARIO SUELTA LA CALLE Y EL MÓDULO. Son de las
   posiciones del recorrido anterior: dejarlos puestos enseña una tabla
   vacía y hace pensar que ese inventario no contó nada. */
{
  const n = (limpio.match(/setFCalle\(""\); setFModulo\(""\)/g) ?? []).length;
  if (n !== 3)
    fallas.push(`${n} de las 3 formas de cambiar de inventario —el buscador, «Todos» y los ` +
                "atajos— sueltan la calle y el módulo: con el filtro del recorrido anterior " +
                "puesto, la tabla sale vacía y parece que ese inventario no contó nada");
}

/* LOS ATAJOS NO CRECEN CON LA HISTORIA. Es la queja entera: una fila
   de tarjetas, una por recorrido, con tres se ve bien y a un conteo
   diario son ciento ochenta en seis meses. La historia vive dentro del
   buscador; lo que se pinta son «Todos» y los DOS últimos. */
if (!/recorridos\.slice\(0, 2\)\.map/.test(limpio))
  fallas.push("los atajos de recorrido salen de la lista entera: vuelven a ser una fila que " +
              "crece un botón por conteo hasta empujar la tabla fuera de la pantalla");
if (!/<Buscador/.test(limpio))
  fallas.push("no hay buscador de recorridos: con cientos, escogerlos a botones no cabe");

/* Y AL ENTRAR SE MIRA EL ÚLTIMO, no la base entera. Con meses de
   conteos, «todos» son miles de renglones cada vez que se abre la
   pantalla, y la pregunta de todos los días es «¿cómo quedó el de
   ayer?». Verlos todos juntos sigue estando, a un toque. */
if (!/const recorridoActivo = fRecorrido \?\? recorridos\[0\]\?\.codigo \?\? "";/.test(limpio))
  fallas.push("al entrar a La base no se abre el último recorrido: con meses de conteos, " +
              "entrar a la base entera son miles de renglones cada vez");
/* Y EL «NO HE ESCOGIDO NADA» ES DISTINTO DE «QUIERO VERLOS TODOS». Con
   un solo `""` para las dos cosas no hay forma de volver al último al
   cambiar de pestaña. */
if (!/useState<string \| null>\(null\)/.test(limpio))
  fallas.push("«no he escogido» y «todos» son el mismo valor: al cambiar de pestaña no habría " +
              "forma de volver al último recorrido");

/* CADA RECORRIDO SE OFRECE CON SU FECHA **Y** SU CÓDIGO. El mismo día
   puede tener tres recorridos —turno A, B y C— y «18/9/2026» repetido
   tres veces no distingue nada. */
if (!/texto: `\$\{rc\.fecha \? fecha\(rc\.fecha\) : "sin fecha"\} · \$\{rc\.codigo\}`/.test(limpio))
  fallas.push("el buscador ofrece los recorridos sin el código: dos del mismo día se leen " +
              "idénticos y no hay cómo saber cuál se escogió");

/* Y EL RECORRIDO NO CUENTA COMO FILTRO. Escoger cuál se mira no es
   recortar una tabla: es decir CUÁL tabla. Contándolo, «Quitar filtros»
   te sacaría del recorrido que estás mirando. */
{
  const linea = (limpio.match(/const filtrando = [\s\S]*?;/) ?? [""])[0];
  if (/fRecorrido|recorridoActivo/.test(linea))
    fallas.push("el recorrido cuenta como filtro: «Quitar filtros» sacaría del inventario " +
                "que se está mirando, que es lo único que no se quería soltar");
}

/* PRODUCTO O ENVASE, Y QUE DE VERDAD FILTRE. Son los dos mundos de esta
   bodega y casi nunca se miran juntos. */
if (!/if \(fTipo && r\.tipo_material !== fTipo\) return false;/.test(limpio))
  fallas.push("el botón de producto/envase no filtra nada");
if (!/fTipo !== ""/.test(limpio))
  fallas.push("con producto o envase puesto, la pantalla no se da por filtrada: la cuenta " +
              "diría «1.284 renglones» sobre una tabla de 376 y no habría cómo quitarlo");
/* Y SE QUITA CON «QUITAR FILTROS», como los demás. Un filtro que no se
   puede quitar donde se quitan todos es el que queda puesto. */
if (!/setFModulo\(""\); setFTipo\(""\); setSoloPasados\(false\)/.test(limpio))
  fallas.push("«Quitar filtros» no quita el de producto/envase");
/* LA CIFRA AL LADO DE CADA BOTÓN. Un «Envase» que lleva a una tabla
   vacía hace dudar de si se perdió algo; con la cuenta se ve que ese
   recorrido no tocó envases y no hay nada que buscar. */
if (!/const porTipo = useMemo/.test(limpio) || !/porTipo\[v\] \?\? 0/.test(limpio))
  fallas.push("los botones de producto y envase no dicen cuántos hay: uno que lleva a una " +
              "tabla vacía hace dudar de si se perdió algo");
/* Y ESA CIFRA CUENTA DENTRO DEL INVENTARIO QUE SE ESTÁ MIRANDO. Contada
   sobre la base entera diría «376 envases» estando en un recorrido que
   no contó ninguno. */
if (!/crudas\.filter\(\(r\) => recorridoActivo === "" \|\| r\.conteo === recorridoActivo\)/.test(limpio))
  fallas.push("la cuenta de producto y envase se hace sobre la base entera y no sobre el " +
              "inventario escogido: diría «376 envases» en un recorrido que no contó ninguno");

/* EL EXCEL SE LLAMA COMO LO QUE TRAE. Bajando tres recorridos seguidos
   salían tres archivos con el mismo nombre y un (1) y un (2) detrás. */
if (!/recorridoActivo \|\| "todos"/.test(limpio))
  fallas.push("el archivo de Excel no dice de qué inventario es: tres recorridos seguidos " +
              "bajan tres archivos con el mismo nombre");

/* 10. Y LA PUERTA SE COMPRUEBA EN EL SERVIDOR. Una pantalla escondida del
   menú se alcanza igual escribiendo la dirección. */
if (!/permisos\.puedeVer\("\/inventario\/base"\)/.test(pgx))
  fallas.push("la página no comprueba el permiso: escribiendo la dirección se entraría igual");

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ La base: los dos montones no se mezclan, de los borradores no se toca nada, " +
            "las 26 columnas se recorren sin arrastrar la página, la cabecera se queda " +
            "pegada y el Excel lleva lo mismo que la tabla.");
