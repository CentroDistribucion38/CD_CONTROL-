/* =====================================================================
   EL MAESTRO DE FEFO — medido, no mirado.

   QUÉ ES. Materiales y ubicaciones: la lista con las tres cifras a la
   vista, el editor que se abre en la misma fila, y el botón de quitar.
   Se corrige de pie, con el celular en una mano, así que lo que aquí se
   mide no es estética: es si se puede usar.

   QUÉ SE MIDE Y POR QUÉ CADA COSA:

   1. QUE LAS CLASES DEL ARMAZÓN EXISTAN EN EL COMPONENTE. Es lo primero
      porque ya mintió dos veces en este proyecto: un arnés que mide
      `.filtros` cuando la pantalla usa `.tr-filtros` aprueba siempre y
      no mide nada. La comparación es por PALABRA COMPLETA — `includes`
      da verdadero para «filtros» dentro de «tr-filtros»— y contra los
      literales de cadena del TSX, porque las filas arman su clase en una
      variable.

   2. CONTRASTE EN LOS SIETE TEMAS. Seis pares que nadie emparejó a
      propósito: el blanco de la pestaña activa sobre --fe-banda, el
      --fe-sobre del botón sobre --fe-acento, el rojo de «falta» sobre
      --fe-fondo, el rojo de «Quitar» sobre el papel, el gris de la
      cuenta, y el enlace del acento sobre papel. El acento cambia con
      las preferencias de cada quien y ya dio 1,7 en un tema y 6,9 en
      otro en otra pantalla de este mismo proyecto.

   3. QUE NADA SE SALGA, a 1440 / 820 / 390 / 360. Con descripciones de
      sesenta caracteres y claves como «A01_DER», lo que se sale es el
      texto de la fila — y un botón se salió 14 px de su tarjeta en
      Tránsito hace dos semanas por exactamente esto.

   4. QUE EL DEDO ALCANCE: campos de 44 px y botones de 40 en el
      celular. Escrito en el CSS con un comentario; aquí se comprueba
      que el comentario sea verdad.

   5. QUE EL EDITOR NO SE VUELVA UNA COLUMNA en escritorio. Siete campos
      uno debajo de otro son un formulario de pantalla y media para
      corregir un factor.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync, readdirSync } from "node:fs";

const fefo = readFileSync(new URL("../src/app/(app)/inventario/fefo.css", import.meta.url), "utf8");
const glob = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
/* EL ARMAZÓN DE LA APLICACIÓN VA COMPLETO, no un `div` inventado. En
   otra pantalla de este proyecto el arnés envolvió la tabla en «us»
   cuando la página usa «rl us», los tokens --rl-* quedaron sin definir y
   un rótulo midió 15,78 de contraste: el negro del texto normal. El
   número era real y no decía nada. */
const shell = readFileSync(new URL("../src/app/(app)/shell.css", import.meta.url), "utf8");
const tsx  = readFileSync(new URL("../src/app/(app)/inventario/maestro/Maestro.tsx", import.meta.url), "utf8");
const pgx  = readFileSync(new URL("../src/app/(app)/inventario/maestro/page.tsx", import.meta.url), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]];

/* Descripciones y claves de las de verdad, sacadas del maestro
   importado: son las largas las que se salen, no las de ejemplo. */
const MATERIALES = [
  [3128, "CERVEZA AGUILA LATA 269 CC X 6 UND TERMOENCOGIBLE", "PRODUCTO", 480, 180, 90, "AGUILA LATA"],
  [7842, "ENVASE COSTEÑITA 175 ML RETORNABLE CAJA X 30", "ENVASE", null, null, 0, "RB F1000"],
  [9013, "CERVEZA PILSEN BOTELLA 330 CC NO RETORNABLE X 24 UNIDADES", "PRODUCTO", 96, 120, 49, "PILSEN NR"],
];
const UBICACIONES = [
  ["A01_DER", "A", "01", "DER", "RB F1000", 24],
  ["EST07", "EST", "07", null, "ESTIBAS DE PRODUCTO TERMINADO SIN CLASIFICAR", 12],
  ["P_12_IZQ", "P", "12", "IZQ", null, null],
];
/* LA TERCERA PESTAÑA. La bodega es de la que cuelgan las 428
   ubicaciones, y por eso su fila lleva esa cuenta: es el dato que
   decide si se puede apagar. */
const BODEGAS = [
  ["CD38", "CENTRO DE DISTRIBUCIÓN BARRANQUILLA AG01", "Vía 40 # 79-341, Barranquilla", 428],
  ["CD99", "BODEGA DE AVERÍAS Y PRODUCTO NO CONFORME", null, 0],
];

const fila = (m) => `
<article class="fe-fila">
  <div class="fe-cab">
    <b class="fe-cod">${m[0]}</b>
    <span class="fe-desc">${m[1]}</span>
    <span class="fe-tipo ${m[2].toLowerCase()}">${m[2]}</span>
    <button type="button" class="fe-mini">Editar</button>
  </div>
  <dl class="fe-cifras">
    <div><dt>Cajas por estiba</dt>
      <dd class="${m[3] == null ? "falta" : ""}">${m[3] ?? "falta"}</dd></div>
    <div><dt>Vida útil</dt><dd>${m[4] ? m[4] + " d" : "—"}</dd></div>
    <div><dt>Sale antes de</dt><dd>${m[5] ? m[5] + " d" : "—"}</dd></div>
    <div><dt>Familia</dt><dd>${m[6] ?? "—"}</dd></div>
  </dl>
</article>`;

const filaU = (u) => `
<article class="fe-fila">
  <div class="fe-cab">
    <b class="fe-cod">${u[0]}</b>
    <span class="fe-desc">${u[4] ?? "sin familia"}</span>
    <button type="button" class="fe-mini">Editar</button>
  </div>
  <dl class="fe-cifras">
    <div><dt>Calle</dt><dd>${u[1]}</dd></div>
    <div><dt>Módulo</dt><dd>${u[2] || "—"}</dd></div>
    <div><dt>Lado</dt><dd>${u[3] ?? "—"}</dd></div>
    <div><dt>Capacidad</dt><dd>${u[5] ?? "—"}</dd></div>
  </dl>
</article>`;

const filaB = (b) => `
<article class="fe-fila">
  <div class="fe-cab">
    <b class="fe-cod">${b[0]}</b>
    <span class="fe-desc">${b[1]}</span>
    <button type="button" class="fe-mini">Editar</button>
  </div>
  <dl class="fe-cifras">
    <div><dt>Ubicaciones</dt><dd>${b[3]}</dd></div>
    <div><dt>Dirección</dt><dd>${b[2] ?? "—"}</dd></div>
  </dl>
</article>`;

const CAMPOS = `
<div class="fe-campos">
  <label class="ancho"><span>Descripción</span><input value="${MATERIALES[0][1]}"></label>
  <label><span>Cajas por estiba</span><input inputmode="numeric" value="480"></label>
  <label><span>Unidades por caja</span><input inputmode="numeric" value="6"></label>
  <label><span>Vida útil (días)</span><input inputmode="numeric" value="180"></label>
  <label><span>Días mínimo para salir</span><input inputmode="numeric" value="90"></label>
  <label><span>Familia</span><input value="AGUILA LATA"></label>
  <label><span>Tipo</span><select><option>Producto</option><option>Envase</option></select></label>
  <label class="fe-check"><input type="checkbox" checked><span>Activo</span></label>
</div>
<div class="fe-pie">
  <button type="button" class="btn">Guardar</button>
  <button type="button" class="btn plano">Cancelar</button>
  <button type="button" class="fe-quitar">Sacar del maestro</button>
</div>`;

const ARMAZON = `
<div class="fe">
  <section class="cabeza">
    <div>
      <p class="ojo">INVENTARIO · MAESTRO</p>
      <h1>Las bases del conteo</h1>
      <p class="sub">Con lo que se cuenta: los materiales, los módulos por los que se camina
        y las bodegas de las que cuelgan. El código trae la descripción y el factor estibado
        que hacen las cuentas. Se agrega, se corrige y se apaga desde aquí.</p>
    </div>
    <div class="kpi"><div class="corte"></div><div class="rot">EN EL MAESTRO</div>
      <div class="num">494</div>
      <div class="pie">materiales (34 envases) · 428 ubicaciones · 2 bodegas</div></div>
  </section>

  <section class="fe-faltan">
    <p><b>9 materiales sin cajas por estiba</b> — de esa cifra sale el total de cajas de cada
      estiba contada. Sin ella, lo que se cuente de esos materiales sale en cero.</p>
    <p class="cuales">${MATERIALES.map((m) => m[1]).join(" · ")} … y 6 más</p>
  </section>

  <section class="fe-barra">
    <div class="fe-pes" role="tablist">
      <button type="button" role="tab" aria-selected="true" class="on">Materiales<em>494</em></button>
      <button type="button" role="tab" aria-selected="false">Ubicaciones<em>428</em></button>
      <button type="button" role="tab" aria-selected="false">Bodegas<em>2</em></button>
    </div>
    <label class="fe-busca"><span class="sr">Buscar</span>
      <input placeholder="Código o descripción — 3128, aguila, lata…"></label>
    <label class="fe-check"><input type="checkbox"><span>Ver los 7 apagados</span></label>
    <button type="button" class="btn">Agregar</button>
  </section>

  <p class="fe-cuenta">60 de 494. Se muestran los primeros 60 — afina la búsqueda para
    llegar al resto.</p>

  <section class="fe-editor nuevo">
    <h2>Material nuevo</h2>
    ${CAMPOS}
  </section>

  <div class="fe-lista">
    ${MATERIALES.map(fila).join("")}
    <article class="fe-fila apagada">
      <div class="fe-cab"><b class="fe-cod">4410</b>
        <span class="fe-desc">CERVEZA CLUB COLOMBIA DORADA BOTELLA 330 CC</span>
        <span class="fe-tipo producto">PRODUCTO</span>
        <span class="fe-off">apagado</span>
        <button type="button" class="fe-mini">Editar</button></div>
      <dl class="fe-cifras"><div><dt>Cajas por estiba</dt><dd>96</dd></div>
        <div><dt>Vida útil</dt><dd>365 d</dd></div>
        <div><dt>Sale antes de</dt><dd>90 d</dd></div>
        <div><dt>Familia</dt><dd>CLUB COLOMBIA</dd></div></dl>
      <div class="fe-editor">${CAMPOS}</div>
    </article>
    ${UBICACIONES.map(filaU).join("")}
    ${BODEGAS.map(filaB).join("")}
  </div>
</div>`;

/* ---------- 1. QUE LO MEDIDO SEA LO QUE EXISTE ----------
   Por palabra completa contra los literales de cadena del componente y
   de su página, MÁS las clases que el CSS del módulo define. Las dos
   fuentes hacen falta: «producto» y «envase» no aparecen escritas en el
   TSX —la fila arma su clase con `"fe-tipo " + tipo.toLowerCase()`— pero
   sí están en la hoja como `.fe-tipo.envase`, así que existen. Y la
   comparación es por PALABRA COMPLETA: `includes("filtros")` da
   verdadero dentro de «tr-filtros», que es exactamente como un arnés de
   este proyecto midió un panel que la pantalla no tiene. */
const literales = [...`${tsx}\n${pgx}`.matchAll(/["'`]([^"'`\n]{0,200})["'`]/g)]
  .map((m) => m[1]).join(" ");
const sueltas = literales.split(/[^A-Za-z0-9_-]+/).filter(Boolean);
const palabras = new Set([
  ...sueltas,
  /* En minúsculas también: la fila arma la clase del tipo con
     `"fe-tipo " + m.tipo.toLowerCase()`, y lo que está escrito en el
     componente es «PRODUCTO». */
  ...sueltas.map((w) => w.toLowerCase()),
  ...[...fefo.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
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

const monta = async (pag, tema, ancho) => {
  await pag.setViewportSize({ width: ancho, height: 1100 });
  /* Sin fondo inventado: el de la página lo pone `.sh` con --bv-tinta y
     cambia con el tema. Medir contra un #EEF1F5 escrito aquí sería
     inventar una pareja de colores que en la aplicación no ocurre. */
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${fefo} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">${ARMAZON}</main></div>
    </div></body></html>`);
};

/* ---------- 2. CONTRASTE ---------- */
const pag = await navegador.newPage();
console.log("tema      pestaña  agregar  «falta»  quitar  cuenta  editar");
for (const t of TEMAS) {
  await monta(pag, t, 1440);
  const m = await pag.evaluate(() => {
    const g = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e).getPropertyValue(p) : "" };
    /* EL FONDO DE VERDAD ES EL PRIMERO QUE PINTA, subiendo. En el tema
       oficial `.sh` NO trae fondo —lo pone `body`— y leer el de `.sh` a
       secas devuelve «rgba(0, 0, 0, 0)», que como color es NEGRO. La
       primera versión de este arnés hizo justamente eso: dio 2,66 de
       contraste, me hizo «arreglar» un gris que estaba bien, y el
       arreglo empeoró el tema oficial. El número era falso, no el
       color. */
    const fondoReal = (sel) => {
      for (let e = document.querySelector(sel); e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    return {
      hoja: fondoReal(".fe-cuenta"),
      pesTxt: g(".fe-pes button.on", "color"), pesFondo: g(".fe-pes button.on", "background-color"),
      btnTxt: g(".fe-barra .btn", "color"),    btnFondo: g(".fe-barra .btn", "background-color"),
      faltaTxt: g(".fe-cifras dd.falta", "color"), faltaFondo: g(".fe-cifras > div", "background-color"),
      quitarTxt: g(".fe-quitar", "color"),     papel: g(".fe-fila", "background-color"),
      cuentaTxt: g(".fe-cuenta", "color"),
      miniTxt: g(".fe-mini", "color"),         miniFondo: g(".fe-mini", "background-color"),
    };
  });
  const c = {
    pestania: razon(m.pesTxt, m.pesFondo),
    agregar: razon(m.btnTxt, m.btnFondo),
    falta: razon(m.faltaTxt, m.faltaFondo),
    quitar: razon(m.quitarTxt, m.papel),
    cuenta: razon(m.cuentaTxt, m.hoja),
    editar: razon(m.miniTxt, m.miniFondo),
  };
  const nombre = t ?? "oficial";
  console.log(nombre.padEnd(9) + Object.values(c).map((v) => String(v).padStart(7) + " ").join(""));
  for (const [k, v] of Object.entries(c))
    if (v < 4.5) fallas.push(`tema ${nombre}: «${k}» contrasta ${v} (mínimo 4.5)`);
}

/* ---------- 3, 4 y 5: geometría ---------- */
console.log("\nancho    se sale           campo  botón  columnas del editor  cifras por fila");
for (const [ancho, etiqueta] of ANCHOS) {
  await monta(pag, null, ancho);
  const m = await pag.evaluate(() => {
    /* LO QUE UN ANTEPASADO RECORTA NO SE SALE. El corte diagonal de la
       tarjeta de cifras se dibuja a propósito más ancho que ella dentro
       de un `overflow: hidden`: geométricamente sobresale, en pantalla
       no se ve un píxel fuera. Contarlo como falla enseña a ignorar al
       arnés, que es peor que no tenerlo. */
    const recortado = (e, hasta) => {
      for (let p = e.parentElement; p && p !== hasta.parentElement; p = p.parentElement)
        if (getComputedStyle(p).overflow !== "visible") return true;
      return false;
    };
    const nombra = (e) =>
      ((e.className || "").toString().trim().split(/\s+/)[0] || e.tagName.toLowerCase()) +
      (e.textContent?.trim() ? ` «${e.textContent.trim().slice(0, 22)}»` : "");
    const dentro = (padre, hijos) => {
      const c = padre.getBoundingClientRect();
      return [...hijos].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && !recortado(e, padre) &&
               (r.right - c.right > 0.5 || c.left - r.left > 0.5);
      }).map(nombra);
    };
    const salen = [];
    for (const f of document.querySelectorAll(".fe-fila, .fe-barra, .fe-editor.nuevo, .cabeza, .fe-faltan"))
      salen.push(...dentro(f, f.querySelectorAll("*")));
    /* Y que el documento no se pueda arrastrar de lado: es el síntoma
       que se ve en el celular aunque cada tarjeta esté bien. */
    const ancho = document.documentElement;
    const lado = ancho.scrollWidth - ancho.clientWidth;

    const alto = (s) => Math.min(...[...document.querySelectorAll(s)]
      .map((e) => Math.round(e.getBoundingClientRect().height)));
    const tops = (s) => {
      const t = [...document.querySelectorAll(s)].map((e) => Math.round(e.getBoundingClientRect().top));
      return t.length / new Set(t).size;
    };
    return {
      salen: [...new Set(salen)], lado,
      campo: alto(".fe-campos input:not([type=checkbox]), .fe-campos select"),
      boton: alto(".fe-barra .btn, .fe-mini, .fe-pes button"),
      colsEditor: +tops(".fe-editor.nuevo .fe-campos > label").toFixed(2),
      colsCifras: +tops(".fe-lista .fe-fila:first-child .fe-cifras > div").toFixed(2),
    };
  });
  console.log(`${etiqueta.padEnd(8)} ${(m.salen.length ? m.salen.join(", ") : "nada").padEnd(17)} ` +
              `${String(m.campo).padStart(5)}  ${String(m.boton).padStart(5)}  ` +
              `${String(m.colsEditor).padStart(19)}  ${String(m.colsCifras).padStart(15)}`);

  if (m.salen.length) fallas.push(`${etiqueta}: se sale de su tarjeta: ${m.salen.join(", ")}`);
  if (m.lado > 0) fallas.push(`${etiqueta}: la página se arrastra ${m.lado} px de lado`);
  if (m.campo < 44) fallas.push(`${etiqueta}: un campo mide ${m.campo} px de alto (mínimo 44)`);
  if (m.boton < 34) fallas.push(`${etiqueta}: un botón mide ${m.boton} px de alto (mínimo 34)`);
  if (ancho >= 820 && m.colsEditor < 2)
    fallas.push(`${etiqueta}: el editor cae a una sola columna — ocho campos en fila son ` +
                "media pantalla para corregir un factor");
  if (m.colsCifras < 2)
    fallas.push(`${etiqueta}: las cuatro cifras caen una debajo de otra`);
}

/* ---------- 6. QUE EL MAESTRO NO SE DIBUJE ENTERO ----------
   494 filas dibujadas son un segundo largo en el primer pintado y otro
   en cada tecla del buscador. El tope está en el componente; aquí se
   comprueba que exista y que la pantalla diga cuántos se están viendo,
   porque «60 de 494» sin decirlo se lee como «el maestro tiene 60». */
if (!/const TOPE = \d+/.test(tsx))
  fallas.push("no hay tope de filas dibujadas: con 494 materiales el celular se arrastra");
if (!/de \{total\}|\{total\}\./.test(tsx))
  fallas.push("la pantalla no dice cuántos de cuántos se están viendo");
if (/\b(prompt|confirm|alert)\s*\(/.test(tsx.replace(/\/\*[\s\S]*?\*\//g, "")))
  fallas.push("usa los diálogos del navegador en vez de los de la app");

/* ---------- 7. UN SOLO EDITOR POR TABLA ----------
   El módulo tenía SIETE entradas y dos pantallas que editaban
   `productos`: el maestro nuevo y la vieja «Productos» de la plantilla
   de ejemplo. Dos editores de la misma tabla es lo que se ve como un
   menú largo, pero el daño real es que se corrige en uno y se mira en
   el otro. Aquí se comprueba que no vuelvan: bajo /inventario solo
   `maestro` y `conteo` —el tablero es la raíz—, y el menú con las tres
   secciones EN EL ORDEN DEL PROCESO: primero las bases, después
   caminar, después leer lo caminado. */
const pantallas = readdirSync(new URL("../src/app/(app)/inventario/", import.meta.url),
                              { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name).sort();
/* LAS CARPETAS SE LEEN, NO SE ESCRIBEN A MANO Y YA. Desde que Inventario
   tiene dos ramas hay cinco: las tres de conteos, el tablero —que se
   mudó de /inventario a /inventario/tablero para dejar libre la ruta del
   módulo, que es la bifurcación— y averías, que trae las suyas dentro. */
if (pantallas.join(",") !== "averias,base,conteo,maestro,tablero")
  fallas.push(`bajo /inventario las carpetas son [${pantallas.join(", ")}] ` +
              "y deben ser [averias, base, conteo, maestro, tablero]");

const reg = readFileSync(new URL("../src/modulos/registro.ts", import.meta.url), "utf8");
/* SOLO EL BLOQUE `secciones`. El módulo y cada rama traen su propia
   `ruta:`, y contarlas como pantallas hacía que este arnés fallara
   diciendo que sobraban tres — su propio error de lectura, no un error
   del menú. */
const bloqueInv = (reg.match(/id: "inventario"[\s\S]*?\n  \},/) ?? [""])[0];
const secciones = [...(bloqueInv.match(/secciones: \[[\s\S]*$/) ?? [""])[0]
  .matchAll(/ruta: "(\/inventario[^"]*)"/g)].map((m) => m[1]);
const espera = ["/inventario/maestro", "/inventario/conteo",
                "/inventario/base", "/inventario/tablero",
                "/inventario/averias", "/inventario/averias/tablero",
                "/inventario/averias/analisis", "/inventario/averias/maestro"];
if (secciones.join(" ") !== espera.join(" "))
  fallas.push(`el menú de Inventario dice [${secciones.join(", ")}] y el proceso es ` +
              `[${espera.join(", ")}] — maestro, contar, la base, tablero; y después averías`);

const pes = [...tsx.matchAll(/\["materiales", "ubicaciones", "bodegas"\]/g)];
if (pes.length === 0)
  fallas.push("las tres pestañas del maestro no están en el orden materiales · ubicaciones · bodegas");

/* ---------- 8. DOS BLOQUES CON EL MISMO NOMBRE Y DISTINTO `display` ----------
   Esto es lo que se rompió hoy y no se vio en ningún TSX: el tablero
   llamó `.fe-barra` a la fila de su gráfico de barras, y ese nombre ya
   era la barra de pestañas del maestro cuatrocientas líneas más arriba.
   Misma especificidad, y gana el de abajo: el `flex-wrap` del maestro se
   volvió un `grid` de tres columnas y la página se arrastró 85 px de
   lado en un celular, sin que nadie tocara el maestro.

   La regla no es «no repetir selectores» —repetir para ajustar un color
   es normal y está por toda la hoja—: es que dos bloques con el mismo
   selector NO PUEDEN DECLARAR `display` DISTINTO, porque eso ya no es un
   ajuste, es otro componente con el nombre prestado. */
/* Solo el nivel de arriba: un `display: none` dentro de un @media es
   responder al ancho, no prestarse el nombre. Se recortan los bloques
   @ contando llaves, porque anidan. */
const sinMedia = (txt) => {
  let out = "", i = 0;
  while (i < txt.length) {
    const a = txt.indexOf("@", i);
    if (a < 0) { out += txt.slice(i); break }
    out += txt.slice(i, a);
    const llave = txt.indexOf("{", a);
    if (llave < 0) break;
    let n = 1, j = llave + 1;
    while (j < txt.length && n > 0) { if (txt[j] === "{") n++; else if (txt[j] === "}") n--; j++ }
    i = j;
  }
  return out;
};

const cuerpos = new Map();
for (const [, sel, cuerpo] of sinMedia(fefo.replace(/\/\*[\s\S]*?\*\//g, ""))
       .matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
  const s = sel.trim().replace(/\s+/g, " ");
  if (!s.startsWith(".fe")) continue;
  const d = cuerpo.match(/(?:^|;)\s*display\s*:\s*([^;]+)/);
  if (!d) continue;
  const antes = cuerpos.get(s);
  if (antes && antes !== d[1].trim())
    fallas.push(`«${s}» declara display dos veces y distinto (${antes} / ${d[1].trim()}) ` +
                "— son dos componentes con el mismo nombre, y gana el de abajo");
  cuerpos.set(s, d[1].trim());
}

await navegador.close();

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ FEFO · maestro: contrasta en los 7 temas, nada se sale a 1440/820/390/360, " +
            "el dedo alcanza y el editor no se vuelve una columna.");
