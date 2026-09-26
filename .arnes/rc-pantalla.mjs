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
  { ...base, id: "m1", sku: "9845", nombre: "Aguila Tw 330Cc X 30", familia: "Tw",
    vida_util: 180, tipo_material: "PRODUCTO", en_sitio: true },
  /* SIN VIDA ÚTIL EN EL MAESTRO: es el que no se puede ordenar por FEFO
     y la pantalla tiene que avisarlo ANTES de gastar papel. */
  { ...base, id: "m2", sku: "2182", nombre: "Pony Malta R 330cc X 30", familia: "Ret",
    vida_util: null, tipo_material: "PRODUCTO", en_sitio: true },
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
  ok(/ubicación/i.test(f), `no se nombra que falta la ubicación: «${f}»`);
  ok(/cuántas/i.test(f), `no se nombra que falta la cantidad: «${f}»`);
}

/* =====================================================================
   1 y 4 · PRODUCTO: FECHA, LOTE Y EL VENCIMIENTO ANTES DE IMPRIMIR
   ===================================================================== */
{
  const t = await pg.textContent(".fe .rc-forma");
  ok(/Producido el/.test(t), "en producto no se pide la fecha de producción");
  /* LA TARJETA PIDE LÍNEA Y HORA, NO LOTE. Es lo que permite devolverse
     a la planta cuando un lote sale malo: sin la línea, el reclamo es
     «algo de ese día». */
  ok(/Línea/.test(t), "en producto no se pide la línea de producción");
  ok(/Hora/.test(t), "en producto no se pide la hora");
  ok(/Cómo va armado el arrume/.test(t),
     "no se preguntan las dimensiones del arrume: doce estibas pueden ir 12×1×1 o 3×2×2 y el " +
     "número de estibas no lo dice");
  ok(!/Color del vidrio/.test(t), "en producto salen los campos del envase");
  ok(!/Viene de/.test(t), "en producto sale «viene de», que es del envase");

  await escoger("9845");
  await pg.fill(".fe .rc-c:has(span:text-is('Por estiba')) input", "1080");
  await pg.fill("input[type=date]", "2026-09-20");
  const ayuda = await pg.textContent(".fe .rc-c:has(input[type=date]) em");
  ok(/19\/03\/2027/.test(ayuda),
     `el vencimiento no se ve antes de imprimir: «${ayuda}» — es la única oportunidad de notar ` +
     "que la fecha de producción se tecleó mal");
  const vista = await pg.textContent(".fe .rc-vista");
  ok(/19\/03\/2027/.test(vista), `la vista del rótulo no muestra el vencimiento: «${vista}»`);
  ok(/9845/.test(vista) && /1.080/.test(vista), "la vista no muestra el código y la cantidad");

  /* EL QUE NO TIENE VIDA ÚTIL EN EL MAESTRO SE AVISA, y se avisa AQUÍ:
     descubrirlo en el papel impreso es haber gastado la hoja. */
  await escoger("2182");
  const ayuda2 = await pg.textContent(".fe .rc-c:has(input[type=date]) em");
  ok(/falta la vida útil/i.test(ayuda2),
     `con un material sin vida útil la pantalla dice «${ayuda2}» en vez de avisar`);
  ok(await pg.isVisible(".fe .rc-v-vence.falta"),
     "la vista del rótulo no marca que va a salir sin vencimiento");
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
   LA CASCADA DE LA UBICACIÓN, Y EL MÓDULO SIN LADOS
   ===================================================================== */
await monta();
{
  const sel = (rot) => `.fe .rc-c:has(span:text-is('${rot}')) select`;
  ok(await pg.isDisabled(sel("Módulo")), "el módulo se puede tocar sin haber escogido calle");
  ok(await pg.isDisabled(sel("Lado")), "el lado se puede tocar sin haber escogido módulo");

  await pg.selectOption(sel("Calle"), "A03");
  ok(!(await pg.isDisabled(sel("Módulo"))), "con la calle escogida el módulo sigue apagado");
  await pg.selectOption(sel("Módulo"), "M12");
  const lados = await pg.$$eval(`${sel("Lado")} option`, (o) => o.map((x) => x.textContent));
  ok(lados.includes("IZQ") && lados.includes("DER"),
     `el módulo con dos lados ofrece ${JSON.stringify(lados)}`);

  /* EL MÓDULO SIN LADOS SE ESCOGE SOLO: pedir «escoge el lado» donde no
     hay lados es pedir algo que no existe. */
  await pg.selectOption(sel("Calle"), "B07");
  await pg.selectOption(sel("Módulo"), "M04");
  const vista = await pg.textContent(".fe .rc-vista");
  ok(/B07-M04/.test(vista),
     `un módulo sin lados no se escogió solo: la vista dice «${vista}»`);
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
  await pg.fill(".fe .rc-c:has(span:text-is('Por estiba')) input", "1080");
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
             falta: t(".fe .rc-c em"), sacar: t(".fe .rc-sacar") };
  });
  const pares = [["aviso", m.aviso], ["vence-rot", m.venceRot], ["vence", m.venceVal],
                 ["tipo", m.tipoOn], ["ayuda", m.falta], ["botón", m.sacar]];
  const c = ([, p]) => CONTRA(p[0], p[1]);
  /* 4.5 PARA TEXTO PEQUEÑO; 3 para el rótulo VENCE y el botón, que van
     en negrita grande. Se mide lo que hay, no lo que debería haber. */
  const tope = (k) => (k === "vence" || k === "botón" || k === "tipo") ? 3 : 4.5;
  const malos = pares.filter((x) => x[1] && c(x) < tope(x[0]));
  ok(malos.length === 0,
     `en el tema ${tema} no se lee: ${malos.map((x) => `${x[0]} ${c(x).toFixed(1)}`).join(", ")}`);
  console.log(`${tema.padEnd(8)} ` + pares.map((x) => x[1]
    ? `${x[0]} ${c(x).toFixed(1)}` : `${x[0]} —`).join("  "));
}

await monta();
await escoger("9845");
await pg.fill(".fe .rc-c:has(span:text-is('Por estiba')) input", "1080");
await pg.fill(".fe .rc-c:has(span:text-is('Estibas')) input", "3");
await pg.fill("input[type=date]", "2026-09-20");
await pg.selectOption(".fe .rc-c:has(span:text-is('Calle')) select", "A03");
await pg.selectOption(".fe .rc-c:has(span:text-is('Módulo')) select", "M12");
await pg.selectOption(".fe .rc-c:has(span:text-is('Lado')) select", { index: 1 });
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
console.log("✓ Recibir: los dos tipos cambian el formulario y cambiar de tipo limpia el material, " +
  "el vencimiento se ve antes de gastar papel y grita cuando no se puede calcular, la cascada de " +
  "la ubicación escoge sola el módulo sin lados, se dice qué falta en vez de apagar el botón en " +
  "silencio, y nada se sale ni se aplasta en los cuatro anchos.");
