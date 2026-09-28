/* =====================================================================
   RECIBIR Y ROTULAR — la pantalla pintada.

   El rótulo ya tiene su arnés (rc-rotulo) y mide el PDF. Este mide la
   PANTALLA, que es otra cosa y falla distinto:

   1. LOS DOS TIPOS CAMBIAN EL FORMULARIO. Producto pide fecha de
      producción y lote; envase pide color y origen. Si los campos del
      otro se quedaran, medio formulario estaría siempre en blanco —que
      es lo que hace que la gente teclee cualquier cosa por pasar.

   2. CAMBIAR DE TIPO LIMPIA EL MATERIAL. Un SKU de envase escogido y
      después el tipo en «producto» imprimiría un rótulo de producto con
      un código de envase en letra de siete centímetros.

   3. NO SE IMPRIME A MEDIAS, Y SE DICE QUÉ FALTA. Un botón apagado sin
      explicación se lee como que la pantalla está rota.

   4. EL VENCIMIENTO SE VE ANTES DE GASTAR PAPEL, y grita cuando no se
      puede calcular.

   5. NADA SE SALE ni se aplasta, en los cuatro anchos. Es la lección de
      la pantalla de al lado: una caja más chica que su contenido no se
      ve leyendo el CSS.

     node .arnes/rc-pantalla.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_nav-rc.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-rc.ts"), `export const createClient = () => ({
  rpc: async () => ({ data: null, error: null }),
  from: () => ({ insert: async () => ({ error: null }) }),
});`);

writeFileSync(R(".arnes/_rc-pant.tsx"), `
import { createRoot } from "react-dom/client";
import { Recibir } from "../src/app/(app)/inventario/recibir/Recibir";

const base = { unidades_por_caja: 30, cajas_por_estiba: 36, unidades_por_estiba: 1080,
  contenido: 330, presentacion: "Tw", f_limite_desp: 7, dias_minimo: 30,
  origen: "NACIONAL", foraneo: "LOCAL", activo: true };
const materiales = [
  /* CON PATRÓN DE ESTIBA DEL MAESTRO: 3 × 3 × 4 = 36, que es su factor
     de estiba. Los tres números llegan con el código y no se teclean. */
  { ...base, id: "m1", sku: "9845", nombre: "Aguila Tw 330Cc X 30", familia: "Tw",
    vida_util: 180, tipo_material: "PRODUCTO", en_sitio: true,
    pat_largo: 3, pat_ancho: 3, pat_nivel: 4 },
  /* SIN VIDA ÚTIL EN EL MAESTRO: es el que no se puede ordenar por FEFO
     y la pantalla tiene que avisarlo ANTES de gastar papel. */
  /* SIN VIDA ÚTIL Y SIN PATRÓN: el material al que le falta todo en el
     maestro. La pantalla tiene que decir las dos cosas. */
  { ...base, id: "m2", sku: "2182", nombre: "Pony Malta R 330cc X 30", familia: "Ret",
    vida_util: null, tipo_material: "PRODUCTO", en_sitio: true,
    pat_largo: null, pat_ancho: null, pat_nivel: null },
  /* EL QUE PELEA CONSIGO MISMO: el patrón da 45 y el factor de estiba
     dice 36. Los dos salen del mismo maestro y uno está mal. */
  { ...base, id: "m5", sku: "3128", nombre: "Aguila RN 330cc X 30", familia: "Ret",
    vida_util: 180, tipo_material: "PRODUCTO", en_sitio: true,
    cajas_por_estiba: 36, pat_largo: 3, pat_ancho: 3, pat_nivel: 5 },
  /* EL PATRÓN A MEDIO LLENAR: alguien puso el largo en la pantalla del
     maestro y dejó los otros dos en blanco. Es lo que pasa de verdad
     cuando se corrige un maestro a mano. Completarlo con unos daría
     «3 × 1 × 1 = 3 cajas» impreso en el papel de la estiba, que es un
     dato inventado con cara de dato. */
  { ...base, id: "m6", sku: "3583", nombre: "Aguila R 750cc X 16", familia: "Ret",
    vida_util: 180, tipo_material: "PRODUCTO", en_sitio: true,
    pat_largo: 3, pat_ancho: null, pat_nivel: null,
    /* Y SIN FACTOR ESTIBADO: es el material al que el código no le puede
       traer las cajas por estiba. La pantalla tiene que dejar el campo
       vacío y decir por qué, no inventarle un número. */
    cajas_por_estiba: null },
  { ...base, id: "m3", sku: "3500162", nombre: "Envase Marron 330R", familia: "Ret",
    vida_util: null, tipo_material: "ENVASE", en_sitio: true, cajas_por_estiba: null },
  { ...base, id: "m4", sku: "3500213", nombre: "Envase Flint 330R", familia: "Ret",
    vida_util: null, tipo_material: "ENVASE", en_sitio: false },
];
const ubicaciones = [
  { id: "u1", bodega_id: "b1", clave: "A03-M12-IZQ", calle: "A03", modulo: "M12",
    lado: "IZQ", familia: null, capacidad: 30, activa: true },
  { id: "u2", bodega_id: "b1", clave: "A03-M12-DER", calle: "A03", modulo: "M12",
    lado: "DER", familia: null, capacidad: 30, activa: true },
  { id: "u3", bodega_id: "b1", clave: "B07-M04", calle: "B07", modulo: "M04",
    lado: null, familia: null, capacidad: 20, activa: true },
];
createRoot(document.getElementById("r")!).render(
  <Recibir materiales={materiales as any} ubicaciones={ubicaciones as any}
           quien="Genesis Visbal" puedeRecibir />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_rc-pant.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-rc.ts"),
           "@/lib/supabase/client": R(".arnes/_supa-rc.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const fefo = readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
const rc = readFileSync(R("src/app/(app)/inventario/recibir/recibir.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

const monta = async (ancho = 1440, alto = 1100, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${P}${glob}${shell}${fefo}${rc}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <div class="sh-marco sin-riel"><main class="sh-main">
    <div class="fe"><div class="rc-aviso"><b>Por ahora esto solo imprime el rótulo.</b>
    El inventario no se entera de lo que entra por aquí.</div><div id="r"></div></div>
    </main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".fe .rc-tipo");
  /* El aviso lo pinta la página, no el componente: se monta a mano para
     poder medirle el contraste como a todo lo demás. */
};

/* EL CAMPO LO LLENA UN EFECTO, Y UN EFECTO CORRE DESPUÉS DEL PINTADO.
   Leer el valor justo después del clic devuelve el de antes: el arnés
   salía rojo por rapidez, no por un error de la pantalla —y un arnés
   que falla a veces se acaba ignorando siempre—. */
const esperaValor = async (sel, v) => {
  await pg.waitForFunction(
    ([s, q]) => (document.querySelector(s)?.value ?? null) === q, [sel, v], { timeout: 6000 },
  ).then(() => true, () => false);
  return pg.inputValue(sel);
};

/* POR ID Y NO POR `:has(...)`. El selector de Playwright con `:has()` y
   `:text-is()` lo entiende Playwright, pero NO `document.querySelector`
   dentro de la página — y `waitForFunction` corre ahí. La espera
   reventaba en silencio, devolvía «no cupo» y seguía de largo: o sea,
   no esperaba nada, y el arnés fallaba una de cada dos corridas por
   rapidez. */
const porEstiba = "#rc-cant";
const ayudaEstiba = () => pg.textContent(".fe .rc-c:has(#rc-cant) em");

const escoger = async (codigo) => {
  await pg.click("#rc-mat");
  await pg.waitForSelector(".fe .bl-lista");
  await pg.click(`.fe .bl-op:has(span:text-is("${codigo}"))`);
};
const falta = async () =>
  (await pg.$(".fe .rc-falta")) ? (await pg.textContent(".fe .rc-falta")) : "";
const apagado = () => pg.isDisabled(".fe .rc-sacar");

await monta();
ok(rotos.length === 0, `la pantalla tiró un error: ${rotos[0]}`);

/* =====================================================================
   3 · NO SE IMPRIME A MEDIAS, Y SE DICE QUÉ FALTA
   ===================================================================== */
{
  ok(await apagado(), "de entrada deja imprimir sin haber escogido nada");
  const f = await falta();
  ok(/producto/.test(f), `no se nombra que falta el material: «${f}»`);
  /* LA UBICACIÓN YA NO SE EXIGE: no se escoge desde aquí todavía.
     Pedirla era pedir algo que la pantalla no ofrece, y eso deja el
     botón apagado sin que se pueda hacer nada al respecto. */
  ok(!/ubicación/i.test(f),
     `sigue pidiendo la ubicación y ya no se escoge desde aquí: «${f}» — el botón se queda ` +
     "apagado y no hay forma de encenderlo");
  ok(/cuántas/i.test(f), `no se nombra que falta la cantidad: «${f}»`);
}

/* =====================================================================
   1 y 4 · PRODUCTO: SE TECLEA EL VENCIMIENTO Y LO DEMÁS LO TRAE EL CÓDIGO
   ---------------------------------------------------------------------
   Es el cambio que pidió Cristian: «que pueda colocar el sku y traiga
   toda la informacion y solo sea agregarle fecha de vencimiento». Así
   que lo que se mide es justo eso: que la ÚNICA fecha que se teclea sea
   el vencimiento, y que la producción salga de restar la vida útil del
   maestro en vez de pedirse.
   ===================================================================== */
{
  const t = await pg.textContent(".fe .rc-forma");
  ok(/Vence el/.test(t), "en producto no se pide la fecha de vencimiento");
  ok(!/Producido el/.test(t),
     "la pantalla sigue pidiendo la fecha de producción: es la que NO está impresa en la caja, " +
     "y obligaba a hacer la resta de cabeza en el muelle");
  /* LA TARJETA PIDE LÍNEA Y HORA, NO LOTE. Es lo que permite devolverse
     a la planta cuando un lote sale malo: sin la línea, el reclamo es
     «algo de ese día». */
  ok(/Línea/.test(t), "en producto no se pide la línea de producción");
  ok(/Hora/.test(t), "en producto no se pide la hora");
  ok(/Cómo llegó armado el arrume/.test(t),
     "no se preguntan las dimensiones del arrume: doce estibas pueden ir 12×1×1 o 3×2×2 y el " +
     "número de estibas no lo dice");
  ok(!/Color del vidrio/.test(t), "en producto salen los campos del envase");
  ok(!/Viene de/.test(t), "en producto sale «viene de», que es del envase");
  /* LA PLACA SE FUE. Era opcional, nadie la llenaba, y un campo opcional
     que nadie llena es un renglón más que leer de pie para llegar a los
     que sí importan. */
  ok(!/Placa/.test(t), "sigue el campo de la placa, que se quitó");

  await escoger("9845");

  /* ===================================================================
     EL CÓDIGO LLENA LAS CAJAS POR ESTIBA
     -------------------------------------------------------------------
     «La idea es que yo llene solo código y la fecha y traiga todo.»

     Estaba de PISTA en el renglón gris de abajo y había que copiarla a
     mano al campo de al lado. Copiar de pie, con guante y con el camión
     esperando un número que la pantalla ya tiene es donde se cuela el
     dedazo que sale impreso en letra de siete centímetros.
     =================================================================== */
  /* POR ID Y NO POR `:has(...)`. El selector de Playwright con `:has()` y
   `:text-is()` lo entiende Playwright, pero NO `document.querySelector`
   dentro de la página — y `waitForFunction` corre ahí. La espera
   reventaba en silencio, devolvía «no cupo» y seguía de largo: o sea,
   no esperaba nada, y el arnés fallaba una de cada dos corridas por
   rapidez. */
const porEstiba = "#rc-cant";
  ok(await esperaValor(porEstiba, "36") === "36",
     `al escoger el 9845 el campo «Por estiba» quedó en «${await pg.inputValue(porEstiba)}» y el ` +
     "maestro dice 36: el código tiene que traerlo");
  {
    const ay = await ayudaEstiba();
    ok(/maestro/.test(ay), `no dice de dónde salió el número: «${ay}»`);
  }

  /* Y SI SE CAMBIA, SE DICE. Es lo que impide que rellenarlo se vuelva
     una mentira el día que la estiba venga incompleta: antes ese aviso
     vivía de que nadie tocara el campo; ahora vive de comparar. */
  await pg.fill(porEstiba, "30");
  {
    const ay = await ayudaEstiba();
    ok(/cambiaste/i.test(ay) && /36/.test(ay),
       `al bajar de 36 a 30 el renglón dice «${ay}»: tiene que decir que se cambió y cuánto ` +
       "decía el maestro, o el rótulo sale con 30 y nadie se entera");
    ok(await pg.isVisible(".fe .rc-c em.rc-cambiado"),
       "el aviso de que se cambió no se distingue del texto de ayuda de al lado");
  }

  /* AL MATERIAL SIN FACTOR EN EL MAESTRO NO SE LE INVENTA UNO. */
  await escoger("3583");
  ok(await esperaValor(porEstiba, "") === "",
     `el 3583 no tiene factor estibado en el maestro y el campo quedó en ` +
     `«${await pg.inputValue(porEstiba)}»: se le inventó un número`);
  {
    const ay = await ayudaEstiba();
    ok(/falta el factor/i.test(ay),
       `sin factor en el maestro el renglón dice «${ay}»: tiene que decir que el dato falta ALLÁ, ` +
       "o quien recibe va a creer que la pantalla no sirve");
  }
  await escoger("9845");
  await esperaValor(porEstiba, "36");
  await pg.fill(porEstiba, "1080");
  /* ANTES DE TECLEAR LA FECHA, la vista ya grita que va a salir sin
     vencimiento. Ahora que la fecha se teclea, «vacío» quiere decir «se
     le olvidó», y eso hay que verlo antes de gastar la hoja. */
  ok(await pg.isVisible(".fe .rc-v-vence.falta"),
     "sin fecha tecleada la vista del rótulo no marca que va a salir sin vencimiento");
  await pg.fill("input[type=date]", "2026-09-20");
  ok(!(await pg.isVisible(".fe .rc-v-vence.falta")),
     "con la fecha puesta la vista sigue marcando que falta el vencimiento");
  /* 20/09/2026 menos 180 días de vida útil es el 24/03/2026. La cuenta
     va HACIA ATRÁS y es la que el muelle ya no tiene que hacer. */
  const ayuda = await pg.textContent(".fe .rc-c:has(input[type=date]) em");
  ok(/24\/03\/2026/.test(ayuda),
     `la producción no se calcula del vencimiento: «${ayuda}» — con 180 días de vida útil, un ` +
     "vencimiento el 20/09/2026 sale de producir el 24/03/2026");
  const vista = await pg.textContent(".fe .rc-vista");
  ok(/20\/09\/2026/.test(vista), `la vista del rótulo no muestra el vencimiento: «${vista}»`);
  ok(/9845/.test(vista) && /1.080/.test(vista), "la vista no muestra el código y la cantidad");

  /* ---------- EL PATRÓN DE ESTIBA LLEGA CON EL CÓDIGO ----------
     Los tres números NO se teclean: salen del maestro al escoger el
     material. Es la mitad de lo que se pidió. */
  const pat = await pg.textContent(".fe .rc-patron");
  ok(/Largo/.test(pat) && /Ancho/.test(pat) && /Niveles/.test(pat),
     `el patrón de estiba no nombra sus tres números: «${pat}»`);
  ok(/3/.test(pat) && /4/.test(pat), `el patrón no trae los números del maestro: «${pat}»`);
  ok(/36 cajas/.test(pat),
     `el patrón no da el resultado: 3 × 3 × 4 son 36 cajas por estiba, y es la cifra que se usa. «${pat}»`);
  ok(/1\.080 unidades/.test(pat), `el patrón no trae las unidades por estiba: «${pat}»`);
  /* LOS DOS BLOQUES DE TRES NÚMEROS SE LLAMAN DISTINTO. Es el riesgo de
     toda esta pantalla: uno dice cómo se arma UNA estiba y el otro
     cuántas ESTIBAS llegaron. Con el mismo nombre, alguien arma mal. */
  ok(/Cómo va armada cada estiba/.test(t) && /Cómo llegó armado el arrume/.test(t),
     "los dos bloques de tres números no se distinguen por el título: uno es cajas sobre una " +
     "estiba y el otro estibas del arrume");

  /* ---------- CUANDO EL MAESTRO SE CONTRADICE ----------
     El 3128 tiene patrón 3 × 3 × 5 = 45 y factor de estiba 36. Los dos
     salen del mismo maestro y uno está mal: hay que verlo ANTES de
     pegar el papel. */
  await escoger("3128");
  const avisos = await pg.textContent(".fe .rc-forma");
  ok(/45.*cajas por estiba.*36|patrón da 45/.test(avisos.replace(/\s+/g, " ")),
     `con el patrón y el factor de estiba peleados la pantalla no avisa: no sale el aviso en «${avisos.slice(0, 400)}»`);

  /* ---------- EL QUE NO TIENE VIDA ÚTIL NI PATRÓN ----------
     Se avisa AQUÍ: descubrirlo en el papel impreso es haber gastado la
     hoja. */
  await escoger("2182");
  const ayuda2 = await pg.textContent(".fe .rc-c:has(input[type=date]) em");
  ok(/falta la vida útil/i.test(ayuda2),
     `con un material sin vida útil la pantalla dice «${ayuda2}» en vez de avisar`);
  /* Y EL PATRÓN A MEDIO LLENAR SE TRATA COMO SI NO ESTUVIERA. Tres
     números o ninguno: dos de tres no dicen cómo se arma nada, y el
     tercero puesto en 1 es una estiba de tres cajas que nadie armó. */
  await escoger("3583");
  const pat3 = await pg.textContent(".fe .rc-patron");
  ok(/no trae el patrón/i.test(pat3),
     `con el patrón a medio llenar la pantalla lo completa e imprime un patrón inventado: «${pat3}»`);

  await escoger("2182");
  const pat2 = await pg.textContent(".fe .rc-patron");
  ok(/no trae el patrón/i.test(pat2),
     `sin patrón en el maestro la pantalla no lo dice: «${pat2}» — un bloque vacío se lee como ` +
     "que ese material no lleva patrón, y lo que pasa es que falta un dato");
}

/* =====================================================================
   2 · CAMBIAR DE TIPO LIMPIA EL MATERIAL
   ===================================================================== */
{
  await pg.click(".fe .rc-tipo button:has-text('EER')");
  const vista = await pg.textContent(".fe .rc-vista");
  ok(!/2182/.test(vista),
     `al pasar a envase se quedó el producto escogido: «${vista}» — imprimiría un rótulo de ` +
     "envase con un código de producto en letra de siete centímetros");
  ok(await apagado(), "tras cambiar de tipo deja imprimir con el material del tipo anterior");
  /* EL CANDADO DE VERDAD: el material se busca dentro de la lista del
     tipo, así que un SKU del otro tipo no se encuentra y no hay nada
     que imprimir. Se comprueba desde el otro lado —volviendo a producto
     con un envase a medio escoger— porque limpiar el campo, por sí
     solo, no impide nada. */
  await pg.click(".fe .rc-tipo button:has-text('Producto terminado')");
  await pg.click(".fe .rc-tipo button:has-text('EER')");
  ok(await apagado(),
     "con el tipo cambiado y un material del tipo anterior en el estado, el botón se enciende: " +
     "imprimiría un rótulo con el código del material equivocado");
}

/* =====================================================================
   1 · ENVASE: COLOR Y ORIGEN, Y NI RASTRO DEL VENCIMIENTO
   ===================================================================== */
{
  const t = await pg.textContent(".fe .rc-forma");
  ok(/Color del vidrio/.test(t), "en envase no se pide el color del vidrio");
  ok(/Viene de/.test(t), "en envase no se pregunta de dónde vino");
  ok(!/Producido el/.test(t),
     "en envase se sigue pidiendo la fecha de producción: el envase retornable no vence");
  ok(!/Línea/.test(t), "en envase se sigue pidiendo la línea: el envase no sale de una línea");
  ok((await pg.$$(".fe .rc-v-vence")).length === 0,
     "la vista del rótulo de envase lleva renglón de vencimiento");

  /* SOLO LOS ENVASES EN EL DESPLEGABLE: mezclarlos obliga a leer la
     palabra ENVASE en cada renglón para saber cuál es cuál. */
  await pg.click("#rc-mat");
  await pg.waitForSelector(".fe .bl-lista");
  const ops = await pg.$$eval(".fe .bl-op span", (e) => e.map((x) => x.textContent.trim()));
  ok(ops.length > 0 && ops.every((c) => c.startsWith("35")),
     `en envase el desplegable ofrece ${JSON.stringify(ops)}: se coló un producto terminado`);
  await pg.keyboard.press("Escape");
}

/* =====================================================================
   LA UBICACIÓN TODAVÍA NO SE ASIGNA DESDE AQUÍ
   ---------------------------------------------------------------------
   «Pon que aún no se ponga, o sea que parezca ubicación y solo ese un -,
    para que a futuro la desarrollemos pero aún no.»

   AQUÍ VIVÍA LA CASCADA calle → módulo → lado, con su prueba de que el
   módulo sin lados se escogía solo. Los tres desplegables se fueron:
   apagarlos no habría servido —un desplegable apagado se toca tres o
   cuatro veces antes de que alguien entienda que no va a abrir, y
   después se reporta como que la pantalla está trabada—.

   Lo que queda, y es lo que se mide: el RENGLÓN sigue ahí diciendo que
   este sitio existe y que le falta, y lo que se va a imprimir dice una
   raya y no una ubicación inventada.
   ===================================================================== */
await monta();
{
  const txt = await pg.textContent(".fe");
  ok(/Dónde queda/.test(txt),
     "se fue el renglón de «dónde queda»: el sitio se reserva desde ahora, si no, el día que se " +
     "conecte nadie sabrá que esa parte existía");
  ok(/Todavía no se asigna desde aquí/.test(txt),
     "no dice que la ubicación todavía no se asigna: un hueco mudo se lee como algo roto");

  const sel = (rot) => `.fe .rc-c:has(span:text-is('${rot}')) select`;
  for (const rot of ["Calle", "Módulo", "Lado"]) {
    ok((await pg.$$(sel(rot))).length === 0,
       `quedó el desplegable de «${rot}»: no escoge nada y se toca cuatro veces antes de que ` +
       "alguien entienda que no va a abrir");
  }

  /* Y LO QUE SE VA A IMPRIMIR DICE UNA RAYA. Si el retrato dijera una
     ubicación y el papel otra, dejarían de reconocerse. */
  const vista = await pg.textContent(".fe .rc-vista");
  ok(/ubicación/i.test(vista), "el retrato de la tarjeta perdió la banda de la ubicación");
  ok(!/A03|B07/.test(vista),
     `el retrato enseña una ubicación y esa parte no está desarrollada: «${vista}»`);
}

/* =====================================================================
   5 · NADA SE SALE NI SE APLASTA, EN LOS CUATRO ANCHOS
   ===================================================================== */
console.log("");
for (const [nombre, ancho] of [["pc", 1440], ["tab", 820], ["cel", 390], ["360", 360]]) {
  await monta(ancho, 1600);
  const fuera = await pg.evaluate((w) => {
    const mal = [];
    document.querySelectorAll(".fe *").forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width && (r.right > w + 1 || r.left < -1)) mal.push((e.className || e.tagName) + " → " + Math.round(r.right));
    });
    return mal.slice(0, 3);
  }, ancho);
  ok(fuera.length === 0, `a ${ancho}px se sale del ancho: ${JSON.stringify(fuera)}`);

  /* NINGUNA CAJA MÁS CHICA QUE SU CONTENIDO. Es lo que acaba de pasar
     en Tránsito: la barra de pasos medía 14 px con botones de 59
     adentro, y eso no se ve leyendo el CSS. */
  const aplastados = await pg.evaluate(() => {
    const mal = [];
    document.querySelectorAll(".fe .rc-forma, .fe .rc-lado, .fe .rc-vista, .fe .rc-tipo")
      .forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.height + 2 < e.scrollHeight) mal.push((e.className || e.tagName) +
          " " + Math.round(r.height) + " < " + e.scrollHeight);
      });
    return mal;
  });
  ok(aplastados.length === 0,
     `a ${ancho}px hay cajas más chicas que su contenido: ${JSON.stringify(aplastados)}`);

  /* LO QUE SE TOCA, DE 44 px: se llena en el muelle y con guante. */
  const bajos = await pg.$$eval(".fe .rc-c input, .fe .rc-c select, .fe .rc-tipo button, .fe .rc-sacar",
    (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)).filter((h) => h > 0 && h < 44));
  ok(bajos.length === 0, `a ${ancho}px hay controles de ${JSON.stringify(bajos)} px`);
  console.log(`${nombre.padEnd(5)} ${String(ancho).padStart(4)}px  ${fuera.length ? "SE SALE" : "bien"}`);
}

/* EN CELULAR LA VISTA DEL RÓTULO VA PRIMERO: es lo que se viene a
   revisar antes de gastar papel. */
await monta(390, 1600);
{
  const y = await pg.evaluate(() => {
    const v = document.querySelector(".fe .rc-lado").getBoundingClientRect().top;
    const f = document.querySelector(".fe .rc-forma").getBoundingClientRect().top;
    return { vista: Math.round(v), forma: Math.round(f) };
  });
  ok(y.vista < y.forma,
     `en celular la vista del rótulo (${y.vista}) queda debajo del formulario (${y.forma}): ` +
     "habría que desplazar la pantalla entera para comprobar lo que se acaba de teclear");
}

/* =====================================================================
   EN LOS SIETE TEMAS SE LEE

   Esta pantalla es nueva y usa tokens del módulo por su NOMBRE. En este
   proyecto eso ya salió mal tres veces con `--c-oro`, que suena a
   dorado y en los temas de Cristian vale #ff0000: un fondo entero de
   ese token con tinta oscura encima es ilegible, y no hay error que
   avise — solo se ve midiendo lo pintado.
   ===================================================================== */
const CANAL = (c) => {
  const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  return c.startsWith("color(") ? n : n.map((v) => v / 255);
};
const LUM = (c) => {
  const [r, g, b] = CANAL(c).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const CONTRA = (a, b) => {
  const [x, y] = [LUM(a), LUM(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
console.log("");
for (const tema of ["oficial", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, 1100, tema);
  await escoger("9845");

  /* EN EL BUCLE DE TEMAS SOLO HACE FALTA QUE EXISTA EL AVISO, para
     medirle el contraste: lo que dice y cuándo aparece ya se probó
     arriba UNA vez. Aquí estuvo el bloque entero repetido —siete
     corridas de lo mismo— porque mi reemplazo pegó en los dos sitios.
     Una prueba repetida no prueba más: tarda más y, cuando falla, sale
     siete veces y esconde a las demás. */
  await esperaValor(porEstiba, "36");
  await pg.fill(porEstiba, "30");
  await pg.fill("input[type=date]", "2026-09-20");
  const m = await pg.evaluate(() => {
    const detras = (e) => {
      for (let n = e; n; n = n.parentElement) {
        const b = getComputedStyle(n).backgroundColor;
        if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") return b;
      }
      return "rgb(255, 255, 255)";
    };
    const t = (s) => { const e = document.querySelector(s); if (!e) return null;
      const g = getComputedStyle(e), b = g.backgroundColor;
      return [g.color, (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") ? b : detras(e.parentElement)] };
    return { aviso: t(".fe .rc-aviso"), venceRot: t(".fe .rc-v-vence span"),
             venceVal: t(".fe .rc-v-vence b"), tipoOn: t(".fe .rc-tipo button.on"),
             falta: t(".fe .rc-c em"),
             /* EL AVISO DE QUE SE CAMBIÓ LO QUE DIJO EL MAESTRO: va en
                otro color para que se vea sin leerlo, así que hay que
                comprobar que ese color se lea. */
             cambiado: t(".fe .rc-c em.rc-cambiado"),
             sacar: t(".fe .rc-sacar") };
  });
  const pares = [["aviso", m.aviso], ["vence-rot", m.venceRot], ["vence", m.venceVal],
                 ["tipo", m.tipoOn], ["ayuda", m.falta], ["cambiado", m.cambiado],
                 ["botón", m.sacar]];
  const c = ([, p]) => CONTRA(p[0], p[1]);
  /* 4.5 PARA TEXTO PEQUEÑO; 3 para el rótulo VENCE y el botón, que van
     en negrita grande. Se mide lo que hay, no lo que debería haber. */
  const tope = (k) => (k === "vence" || k === "botón" || k === "tipo") ? 3 : 4.5;
  /* Y QUE EL AVISO EXISTA. Midiendo solo «lo que hay», un aviso que
     desaparece pasa por bueno: no hay color que leer, luego no hay
     falla. Se exige. */
  ok(m.cambiado, `en el tema ${tema} no salió el aviso de que se cambió lo que dijo el maestro`);
  const malos = pares.filter((x) => x[1] && c(x) < tope(x[0]));
  ok(malos.length === 0,
     `en el tema ${tema} no se lee: ${malos.map((x) => `${x[0]} ${c(x).toFixed(1)}`).join(", ")}`);
  console.log(`${tema.padEnd(8)} ` + pares.map((x) => x[1]
    ? `${x[0]} ${c(x).toFixed(1)}` : `${x[0]} —`).join("  "));
}

await monta();
await escoger("9845");
await pg.fill(porEstiba, "1080");
await pg.fill(".fe .rc-c:has(span:text-is('Estibas')) input", "3");
await pg.fill("input[type=date]", "2026-09-20");
/* SIN TOCAR LA UBICACIÓN: ya no se escoge desde aquí, y el botón tiene
   que encender igual. */
ok(!(await apagado()), "con todo puesto el botón sigue apagado");
ok(/Imprimir los 3/.test(await pg.textContent(".fe .rc-sacar")),
   "el botón no dice cuántos rótulos va a sacar");
await pg.screenshot({ path: ".arnes/rc-pantalla.png", fullPage: true });
await monta(390, 1600);
await pg.screenshot({ path: ".arnes/rc-pantalla-cel.png", fullPage: true });

await nav.close();
console.log("");
if (fallas.length) {
  console.log("FALLAS:");
  fallas.forEach((f) => console.log(" · " + f));
  process.exit(1);
}
console.log("✓ Recepción: los dos tipos cambian el formulario y cambiar de tipo limpia el " +
  "material, el patrón de estiba llega con el código y se distingue del arrume, se teclea SOLO " +
  "el vencimiento y la producción sale de restar, se avisa cuando el maestro se contradice, la " +
  "la ubicación todavía no se asigna desde aquí —el renglón se queda y el rótulo sale con una raya—, se dice qué falta en vez de apagar " +
  "el botón en silencio, y nada se sale ni se aplasta en los cuatro anchos.");
