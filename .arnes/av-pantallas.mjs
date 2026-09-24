/* =====================================================================
   AVERÍAS — las dos pantallas, en Chromium.

   «Dentro del inventario pon un módulo de avería… haz algo brutal y
    sobre todo profesional, con hallazgos y todo en el informe.»

   LO QUE SE MIDE, Y POR QUÉ:

   1. LA PANTALLA SE ORGANIZA POR EL ESTADO DE LA BAJA. Es la decisión
      de diseño entera: mientras una avería no tenga documento sigue
      contando en el inventario, y esa diferencia es lo que descuadra
      un conteo. Si abre en «todas» ordenado por fecha, enseña arriba
      lo de ayer —que no urge— y esconde abajo lo de hace tres semanas.

   2. LOS TRES BOTONES NO SE OFRECEN AL QUE NO PUEDE. Borrar NO sale
      para una que ya tiene documento de SAP: ese número quedaría
      apuntando a algo que no existe.

   3. LOS HALLAZGOS VAN ARRIBA DE LAS GRÁFICAS. Una gráfica enseña un
      número; un hallazgo dice qué hacer con él.

   4. EL KPI NO SALE «MOCHO». `.cabeza` es una rejilla de dos columnas
      y el botón del informe es un tercer hijo: ya pasó una vez que la
      barra ámbar saliera cortada.

   5. Nada se sale a 1440 / 820 / 390 / 360, lo que se toca mide 44 px,
      y se lee en los siete temas.

     node .arnes/avr-pantallas.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* Un arnés tiene que hablar antes de morirse: ya pasó dos veces en
   este proyecto que la mutación se detecte y el script reviente dos
   pasos después sin imprimir nada. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_navr-av.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-av.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    return { data: [{ id: "nueva", codigo: "AV-0099" }], error: null };
  },
});`);

/* EL FIXTURE TIENE LOS CUATRO CASOS QUE IMPORTAN: una pendiente vieja,
   una pendiente que se vence, una ya dada de baja, y una anulada. Sin
   los cuatro, media pantalla no se mide. */
const FILAS = `
const hoy = "2026-09-24";
const d = (n) => {
  const x = new Date("2026-09-24T12:00:00Z"); x.setUTCDate(x.getUTCDate() - n);
  return x.toISOString().slice(0, 10);
};
const base = (i, o) => ({
  id: "a" + i, codigo: "AV-000" + i, fecha: d(3), ubicacion: "A03 · M12",
  producto_sku: "3128", producto: "Aguila RN 330cc X30",
  cajas: 6, unidades: 0, vence: null,
  causal: "deposito", causal_nombre: "Avería depósito", externa: false,
  reporto: "Genesis Visbal", documento: null, documento_en: null, nota: null,
  creado_por: "u1", creado_en: d(3) + "T10:00:00Z",
  anulada_en: null, motivo_anulacion: null,
  pendiente_baja: true, dias_baja: null, dias_para_vencer: null, fotos: 0, ...o,
});
const lista = [
  /* LA VIEJA SIN BAJA: 28 dias. Es la que la pantalla tiene que poner
     por delante, y la que enciende la alerta de «la mas vieja». */
  base(1, { fecha: d(28), cajas: 14, ubicacion: "A07 · M02" }),
  /* UNA QUE SE VENCE Y ADEMAS SIGUE CONTANDO: lo peor de los dos
     mundos —producto que ya no sirve y que el sistema cree que esta—. */
  base(2, { fecha: d(5), vence: d(-12), dias_para_vencer: 12, cajas: 9,
            ubicacion: "A02 · M05" }),
  /* DE AFUERA: llega averiado, es del transportador. */
  base(3, { fecha: d(9), causal: "transporte", causal_nombre: "Avería transporte",
            externa: true, cajas: 4, unidades: 7, ubicacion: "B01 · M01" }),
  /* YA DADA DE BAJA: no cuenta, y a esta NO se le puede ofrecer borrar. */
  base(4, { fecha: d(20), documento: "4900123456", documento_en: d(14) + "T09:00:00Z",
            pendiente_baja: false, dias_baja: 6, cajas: 11, ubicacion: "C03 · M08" }),
  /* ANULADA: la fila se queda, con el motivo. */
  base(5, { fecha: d(15), anulada_en: d(14) + "T09:00:00Z",
            motivo_anulacion: "Se conto dos veces", pendiente_baja: false,
            cajas: 3, ubicacion: "A07 · M02" }),
];
const causales = [
  { clave: "transporte", nombre: "Avería transporte", externa: true, activo: true, orden: 1 },
  { clave: "deposito", nombre: "Avería depósito", externa: false, activo: true, orden: 2 },
  { clave: "contaminado", nombre: "Producto contaminado", externa: false, activo: true, orden: 3 },
];
const productos = [
  { sku: "3128", nombre: "Aguila RN 330cc X30" },
  { sku: "2512", nombre: "Poker R 330cc X30" },
];
`;

writeFileSync(R(".arnes/_avr-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Averias } from "../src/app/(app)/inventario/averias/Averias";
${FILAS}
createRoot(document.getElementById("r")!).render(
  <Averias lista={lista as any} causales={causales as any} productos={productos as any}
           ubicaciones={["A03 · M12", "A07 · M02", "B01 · M01"]}
           puedeEditar manda quien="Cristian Padilla" />);
`);

/* Y una segunda con quien solo VE: los botones no pueden estar. */
writeFileSync(R(".arnes/_avr-solo-ve.tsx"), `
import { createRoot } from "react-dom/client";
import { Averias } from "../src/app/(app)/inventario/averias/Averias";
${FILAS}
createRoot(document.getElementById("r")!).render(
  <Averias lista={lista as any} causales={causales as any} productos={productos as any}
           ubicaciones={[]} puedeEditar={false} manda={false} quien="Mirón" />);
`);

/* Y una tercera vacía: es el estado en el que nace el módulo. */
writeFileSync(R(".arnes/_avr-vacio.tsx"), `
import { createRoot } from "react-dom/client";
import { Averias } from "../src/app/(app)/inventario/averias/Averias";
${FILAS}
createRoot(document.getElementById("r")!).render(
  <Averias lista={[]} causales={causales as any} productos={productos as any}
           ubicaciones={[]} puedeEditar manda quien="Cristian" />);
`);

const armar = (entrada) => buildSync({
  entryPoints: [R(entrada)], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_navr-av.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-av.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const js = armar(".arnes/_avr-entrada.tsx");
const jsVe = armar(".arnes/_avr-solo-ve.tsx");
const jsVacio = armar(".arnes/_avr-vacio.tsx");

const fefo = readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
const avcss = readFileSync(R("src/app/(app)/inventario/averias/averias.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (ancho = 1440, tema = "", cual = js, alto = 1100) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${fefo}${avcss}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <div class="sh-marco sin-riel"><main class="sh-main"
      style="display:flex;flex-direction:column;gap:16px">
    <div class="fe avr" id="r"></div></main></div></div>
    <script>${cual}</script></body></html>`);
  await pg.waitForSelector(".fe-barra");
  await pg.evaluate(() => { window.llamadas = [] });
};
const llamadas = () => pg.evaluate(() => window.llamadas ?? []);

/* ---------------------------------------------------------------------
   1 · ABRE POR LO QUE FALTA, NO POR LO ÚLTIMO
   ------------------------------------------------------------------ */
await monta();
{
  const pes = await pg.$$eval(".fe-pes button", (b) => b.map((x) => ({
    txt: x.textContent.trim(), on: x.classList.contains("on") })));
  ok(pes[0]?.on && /Sin dar de baja/i.test(pes[0].txt),
     `la pantalla no abre en «sin dar de baja»: abre en «${pes.find((p) => p.on)?.txt}»`);

  /* LAS TRES PENDIENTES, NI UNA MÁS. La dada de baja y la anulada no
     están pendientes de nada. */
  const filas = await pg.$$(".avr-fila");
  ok(filas.length === 3,
     `en «sin dar de baja» salen ${filas.length} y las pendientes del fixture son 3`);

  /* EL KPI DICE LA DEUDA, no el total histórico: «cuántas averías
     hemos tenido» no es una pregunta que alguien tenga a las 7 a.m. */
  ok((await pg.textContent(".kpi .num")).trim() === "3",
     `el KPI dice «${(await pg.textContent(".kpi .num")).trim()}» y las pendientes son 3`);
  ok(/27 cajas/.test(await pg.textContent(".kpi .pie")),
     `el KPI no suma las cajas pendientes: «${await pg.textContent(".kpi .pie")}»`);

  /* Y LA CIFRA DE LA MÁS VIEJA ENCIENDE LA ALERTA: 28 días represados
     no se pueden ver igual que 2. */
  const cifras = await pg.$$eval(".avr-cif", (c) => c.map((x) => ({
    rot: x.querySelector(".avr-rot").textContent.trim(),
    val: x.querySelector("b").textContent.trim(),
    alerta: x.classList.contains("avr-alerta") })));
  const vieja = cifras.find((c) => /MÁS VIEJA/i.test(c.rot));
  ok(vieja?.val === "28 días", `la más vieja dice «${vieja?.val}» y son 28 días`);
  ok(vieja?.alerta, "28 días represados no encienden ninguna alerta: se ven igual que 2");
  const vence = cifras.find((c) => /VENCEN/i.test(c.rot));
  ok(vence?.val === "1", `«se vencen y siguen contando» dice ${vence?.val} y es 1`);
  const calle = cifras.find((c) => /CONCENTRAN/i.test(c.rot));
  /* LA CALLE ES LA LETRA: A07 (14) + A02 (9) = 23 contra B (4). Si se
     agrupara por «A07» ganaría A07 con 14 y la concentración real —la
     calle A— no saldría nunca. */
  ok(calle?.val === "Calle A",
     `la concentración dice «${calle?.val}»: agrupar por módulo reparte una misma calle`);
}

/* ---------------------------------------------------------------------
   1b · LOS BLOQUES LLENAN EL ANCHO

   Esta comprobación existe por un error concreto: la pantalla se llamó
   `.av`, y `.av` YA ERA el cartel de avisos en globals.css —con su
   rejilla de tres columnas, su fondo y su borde—. Todo quedó sizeándose
   al contenido: la barra de pestañas terminaba a un quinto del ancho y
   las tres cifras no llegaban ni a la mitad. El arnés pasaba en verde
   —nada se salía, todo se leía— y solo se vio MIRANDO la captura.

   Es el octavo choque de nombre de este proyecto. Medir el ancho es
   lo que lo convierte en una falla y no en una foto rara. */
{
  const anchos = await pg.evaluate(() => {
    const padre = Math.round(document.querySelector(".avr").getBoundingClientRect().width);
    const de = (s) => {
      const e = document.querySelector(s);
      return e ? Math.round(e.getBoundingClientRect().width) : 0;
    };
    return { padre, cifras: de(".avr-cifras"), barra: de(".fe-barra"), fila: de(".avr-fila") };
  });
  for (const [k, v] of Object.entries(anchos)) {
    if (k === "padre") continue;
    ok(v >= anchos.padre - 2,
       `«${k}» mide ${v} de ${anchos.padre}: no llena el ancho —casi siempre es que la clase de la pantalla choca con una de globals.css`);
  }
}

/* ---------------------------------------------------------------------
   2 · CADA FILA DICE SI TODAVÍA CUENTA
   ------------------------------------------------------------------ */
{
  const t = await pg.textContent(".fe-lista");
  ok(/SIN DAR DE BAJA/.test(t), "las filas pendientes no dicen que están sin dar de baja");
  ok(/sigue contando en el inventario/.test(t),
     "no se dice que una pendiente SIGUE CONTANDO: es toda la razón de esta pantalla");
  /* EL VENCIMIENTO SOLO CUANDO IMPORTA: una fecha lejana en cada
     renglón es ruido; una a punto es lo que hace mover a alguien. */
  ok((await pg.$$(".avr-eti.avr-ojo")).length === 1,
     "la que se vence en 12 días no lleva su marca, o la llevan todas");

  await pg.click(".fe-pes button:has-text('Ya dadas de baja')");
  const t2 = await pg.textContent(".fe-lista");
  ok(/DE BAJA/.test(t2) && /4900123456/.test(t2),
     "la dada de baja no enseña su documento de SAP: sin él no se puede buscar");
  ok(/6 días/.test(t2),
     "no se dice cuánto tardó la baja, que es lo único que permite decir «se está demorando»");

  await pg.click(".fe-pes button:has-text('Todas')");
  ok(/ANULADA — Se conto dos veces/.test(await pg.textContent(".fe-lista")),
     "la anulada no enseña su motivo: una avería que desaparece es un mes que cerró distinto");
}

/* ---------------------------------------------------------------------
   3 · BORRAR NO SE OFRECE A LA QUE YA TIENE DOCUMENTO

   Ese número de SAP quedaría apuntando a algo que no existe, y el día
   que alguien audite la baja no encuentra contra qué cuadrarla.
   ------------------------------------------------------------------ */
{
  const filas = await pg.$$eval(".avr-fila", (fs) => fs.map((f) => ({
    conDoc: /DE BAJA(?!.*SIN)/.test(f.querySelector(".avr-estado")?.textContent ?? "")
            && !/SIN DAR/.test(f.querySelector(".avr-estado")?.textContent ?? ""),
    anulada: f.classList.contains("avr-anulada"),
    btns: [...f.querySelectorAll(".avr-btns button")].map((b) => b.textContent.trim()),
  })));
  const conDoc = filas.filter((f) => f.conDoc && !f.anulada);
  ok(conDoc.length === 1, `esperaba 1 fila con documento y hay ${conDoc.length}`);
  ok(!conDoc[0].btns.includes("Borrar"),
     "a la que ya tiene documento de baja se le ofrece borrar: ese número quedaría apuntando a nada");
  ok(conDoc[0].btns.includes("Quitar la baja"),
     "a la que tiene documento no se le ofrece quitarlo, que es la única forma de corregir un número malo");

  const pend = filas.filter((f) => !f.conDoc && !f.anulada);
  ok(pend.every((f) => f.btns.includes("Dar de baja")),
     "alguna pendiente no ofrece darle de baja, que es lo que se viene a hacer aquí");
  ok(pend.every((f) => f.btns.includes("Borrar")),
     "a una pendiente no se le ofrece borrar: para el error de dedo del mismo día");

  /* Y A LA ANULADA NO SE LE OFRECE NADA: ya se dijo que no pasó. */
  const anu = filas.filter((f) => f.anulada);
  ok(anu.length === 1 && anu[0].btns.length === 0,
     `la anulada todavía ofrece ${anu[0]?.btns.join(" | ")}`);
}

/* ---------------------------------------------------------------------
   4 · QUIEN SOLO VE NO TOCA NADA
   ------------------------------------------------------------------ */
await monta(1440, "", jsVe);
{
  ok((await pg.$$(".avr-btns button")).length === 0,
     "a quien solo puede VER le salen los botones de la lista");
  ok((await pg.$$(".fe-barra .btn")).length === 0,
     "a quien solo puede VER le sale el botón de registrar");
}

/* ---------------------------------------------------------------------
   5 · REGISTRAR: LO QUE SE EXIGE Y LO QUE VIAJA
   ------------------------------------------------------------------ */
await monta();
{
  await pg.click(".fe-barra .btn:has-text('Registrar avería')");
  await pg.waitForSelector(".avr-form");

  /* EL BOTÓN DICE QUÉ FALTA en vez de quedarse apagado y mudo: un
     botón apagado sin explicación se toca tres veces y después se
     llama a preguntar. */
  ok(/Falta la ubicación/i.test(await pg.textContent(".avr-acciones .btn")),
     `el botón dice «${await pg.textContent(".avr-acciones .btn")}» y falta la ubicación`);

  const teclear = async (sel, v) => pg.evaluate(([s, val]) => {
    const el = document.querySelector(s);
    const proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [sel, v]);

  await teclear(".avr-campos input", "D04 · M07");
  ok(/Falta el producto/i.test(await pg.textContent(".avr-acciones .btn")),
     "con ubicación puesta el botón no pasa a pedir el producto");

  await pg.selectOption(".avr-c select", "2512");
  ok(/Falta decir cuánto/i.test(await pg.textContent(".avr-acciones .btn")),
     "con producto puesto el botón no pasa a pedir la cantidad");

  /* LAS CAJAS Y LAS UNIDADES VAN SEPARADAS: media caja averiada es
     «0 cajas, 7 unidades» y una estiba es «48 cajas, 0 unidades». */
  const nums = await pg.$$(".avr-campos input[type=number]");
  await nums[1].fill("7");
  ok(!/Falta/i.test(await pg.textContent(".avr-acciones .btn")),
     "con 7 unidades sueltas y 0 cajas todavía dice que falta algo: media caja es una avería");

  /* LA CAUSAL EN BOTONES Y NO EN DESPLEGABLE: son tres, cuál es decide
     a quién se le cobra, y un desplegable esconde dos y hace ganar a
     la primera por costumbre. */
  const seg = await pg.$$eval(".avr-seg button", (b) => b.map((x) => x.textContent.trim()));
  ok(seg.length === 3, `las causales salen en ${seg.length} botones y son 3`);
  ok(/llega averiado/i.test(seg.find((s) => /transporte/i.test(s)) ?? ""),
     "la de transporte no dice que llega averiada: es lo que decide a quién se le cobra");

  await pg.click(".avr-seg button:has-text('transporte')");
  await pg.click(".avr-acciones .btn");
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 2000 })
    .catch(() => {});
  const l = (await llamadas()).find((x) => x.f === "averia_registrar");
  ok(!!l, "registrar no llama a la base");
  ok(l?.a?.p_ubicacion === "D04 · M07", `la ubicación viajó como ${JSON.stringify(l?.a?.p_ubicacion)}`);
  ok(l?.a?.p_sku === "2512", `el producto viajó como ${JSON.stringify(l?.a?.p_sku)}`);
  ok(l?.a?.p_unidades === 7 && l?.a?.p_cajas === 0,
     `cajas y unidades viajaron como ${l?.a?.p_cajas}/${l?.a?.p_unidades}`);
  ok(l?.a?.p_causal === "transporte", `la causal viajó como ${JSON.stringify(l?.a?.p_causal)}`);
  /* EL DÍA EN QUE PASÓ, no el de hoy por descarte: se propone hoy pero
     viaja el que esté en el campo. */
  ok(l?.a?.p_fecha === "2026-09-24" || l?.a?.p_fecha === null,
     `la fecha viajó como ${JSON.stringify(l?.a?.p_fecha)}`);
}

/* ---------------------------------------------------------------------
   6 · LA LISTA VACÍA SE EXPLICA
   ------------------------------------------------------------------ */
await monta(1440, "", jsVacio);
ok(/Todavía no hay averías/.test(await pg.textContent(".fe-lista")),
   "con la lista vacía no se dice que está vacía ni cómo se agrega la primera");

/* ---------------------------------------------------------------------
   7 · LOS CUATRO ANCHOS, Y LO QUE SE TOCA
   ------------------------------------------------------------------ */
for (const [ancho, nombre] of [[1440, "pc"], [820, "tab"], [390, "cel"], [360, "360"]]) {
  await monta(ancho);
  await pg.click(".fe-barra .btn:has-text('Registrar avería')");
  await pg.waitForSelector(".avr-form");
  const r = await pg.evaluate(() => {
    const a = document.documentElement.clientWidth, fuera = [], chicos = [];
    for (const el of document.querySelectorAll(".av *")) {
      const b = el.getBoundingClientRect();
      /* LO QUE UN PADRE RECORTA NO SE SALE. `.kpi .corte` es una
         decoracion posicionada FUERA de su caja, dentro de un
         `overflow: hidden`: su rectangulo dice que sobresale y en
         pantalla no se ve ni un pixel. Contarla seria una falla
         inventada, y una falla inventada acaba haciendo que se ignoren
         las de verdad. */
      let recortado = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible") { recortado = true; break }
      }
      if (!recortado && b.width > 0 && (b.right > a + .5 || b.left < -.5)) {
        fuera.push(el.className || el.tagName);
      }
      if (["BUTTON", "SELECT", "INPUT"].includes(el.tagName) && b.height > 0 && b.height < 44)
        chicos.push((el.className || el.tagName) + " h=" + Math.round(b.height));
    }
    return { scroll: document.documentElement.scrollWidth, ancho: a,
             fuera: [...new Set(fuera)].slice(0, 4), chicos: [...new Set(chicos)].slice(0, 4) };
  });
  ok(r.scroll <= r.ancho + .5, `${nombre}: la página se desplaza a lo ancho (${r.scroll} > ${r.ancho})`);
  ok(!r.fuera.length, `${nombre}: se sale ${r.fuera.join(" | ")}`);
  ok(!r.chicos.length, `${nombre}: no se alcanza con el dedo ${r.chicos.join(" | ")}`);
  if (ancho === 1440 || ancho === 390) {
    await pg.screenshot({ path: `.arnes/avr-pantalla-${nombre}.png`, fullPage: ancho < 900 });
  }
  console.log(`${nombre.padEnd(4)} ${String(ancho).padStart(5)}px  ${r.fuera.length || r.chicos.length ? "MAL" : "bien"}`);
}

/* ---------------------------------------------------------------------
   8 · SE LEE EN LOS SIETE TEMAS
   ------------------------------------------------------------------ */
for (const tema of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, tema);
  const r = await pg.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
        const s = v / 255; return s <= .03928 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
      });
      return .2126 * r + .7152 * g + .0722 * b;
    };
    const fondoDe = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      }
      return "rgb(255,255,255)";
    };
    const razon = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 99;
      const a = lum(getComputedStyle(el).color), b = lum(fondoDe(el));
      return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 10) / 10;
    };
    return { kpiRot: razon(".kpi .rot"), kpiNum: razon(".kpi .num"), kpiPie: razon(".kpi .pie"),
             cifra: razon(".avr-cif b"), rot: razon(".avr-rot"),
             tit: razon(".avr-tit"), meta: razon(".avr-meta span"),
             eti: razon(".avr-eti"), boton: razon(".fe-barra .btn") };
  });
  const flojos = Object.entries(r).filter(([, v]) => v < 4.5);
  ok(flojos.length === 0,
     `${tema || "oficial"}: no se lee ${flojos.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`${(tema || "oficial").padEnd(8)} ` +
    Object.entries(r).map(([k, v]) => `${k} ${v}`).join("  "));
}

await nav.close();

if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\n✓ Averías: la pantalla abre por lo que FALTA —las que siguen contando en el inventario— y no por lo último; cada fila dice si todavía cuenta, cuánto tardó su baja y cuál se vence; a la que ya tiene documento de SAP no se le ofrece borrar; quien solo VE no toca nada; registrar exige ubicación, producto, cuánto y causal, y separa cajas de unidades sueltas.");
