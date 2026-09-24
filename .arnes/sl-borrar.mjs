/* =====================================================================
   ESCOGER SALIDAS Y BORRARLAS EN LOTE — medido, no mirado.

   «Que el súper admin pueda seleccionar una o varias y eliminarlas, por
    si quiero empezar mi data de cero.»

   ESTO BORRA PESOS. Cada salida se lleva sus tolvas: lo que alguien
   leyó en la báscula y la tara con la que se pesó ese día. Cinco cosas
   tienen que ser ciertas o la pantalla es peligrosa:

   1. QUE A QUIEN NO MANDA NI SIQUIERA LE SALGAN LAS CASILLAS. Una
      pantalla que ofrece algo y después la base lo niega convierte una
      regla correcta en un regaño.

   2. QUE «TODAS» SEA TODAS LAS QUE SE VEN, no todas las que hay. Con
      el filtro puesto, marcar la casilla de arriba y borrar se llevaría
      lo que no está en pantalla — y eso no se ve hasta después.

   3. QUE AL CAMBIAR DE FILTRO SE SUELTE LA SELECCIÓN. Si no, el botón
      sigue diciendo «Borrar 3» sin que se vea cuáles: se borra a
      ciegas.

   4. QUE VIAJE UNA SOLA LLAMADA CON TODOS LOS ids. Once llamadas son
      once formas de quedar a medias: se borran cinco, se cae la red, y
      quedan seis que nadie sabe si iban a irse.

   5. QUE PIDA MOTIVO Y PIDA TECLEAR «BORRAR N». En una lista con la
      casilla en la misma columna, marcar una de más es cuestión de
      tiempo.

     node .arnes/sl-borrar.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE. Sin esto, una excepción
   a mitad de camino deja la consola en blanco y parece que pasó. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_nav-sl.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);

/* La base de mentiras ANOTA la llamada entera: es la única forma de
   comprobar que viaja UNA sola con todos los ids, y no once. */
writeFileSync(R(".arnes/_supa-sl.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    return { data: (a?.p_ids ?? []).length, error: null };
  },
});`);

const SALIDAS = `
const sal = (i, o) => ({
  id: "s" + i, codigo: "SR-000" + i, estado: "cerrada", placa: "ABC12" + i,
  observacion: null, creada_por: "u1", creada_en: "2026-09-22T12:00:00Z",
  tolvas: 1, neto_kg: 100 * i, bruto_kg: 100 * i + 111, tara_kg: 111,
  firmas: 2, completa: true, mismo_firmante: false,
  supervisora_en: "2026-09-22T13:00:00Z", verificador_en: "2026-09-22T14:00:00Z",
  validador_en: null, despachada_en: null, viaje_codigo: null,
  reaperturas: 0, reabierta_nota: null, motivo_anulacion: null, anulada_en: null, ...o,
});
const nombres = { u1: "Genesis Visbal" };
`;

writeFileSync(R(".arnes/_sl-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Salidas } from "../src/app/(app)/roturas/salida/Salidas";
${SALIDAS}
/* TRES ABIERTAS Y DOS QUE YA SALIERON: es lo que hace medible que
   «todas» sea todas LAS QUE SE VEN y no todas las que hay. Con las
   cinco en el mismo estado, esa prueba pasaría sin probar nada. */
/* LOS CUATRO ESTADOS, uno de cada: con tres despachadas y ninguna
   anulada, «cada estado tiene su chip» pasaría sin probar tres de los
   cuatro. */
const salidas = [
  sal(1, { estado: "abierta", firmas: 0, completa: false, supervisora_en: null,
           verificador_en: null }),
  sal(2, { estado: "abierta", firmas: 0, completa: false, supervisora_en: null,
           verificador_en: null }),
  sal(3, { estado: "abierta", firmas: 0, completa: false, supervisora_en: null,
           verificador_en: null }),
  sal(4, { despachada_en: "2026-09-23T10:00:00Z", viaje_codigo: "VJ-9",
           mismo_firmante: true }),
  sal(5),                                   // cerrada sin despachar
  sal(6, { firmas: 1, completa: false, verificador_en: null }),  // media firma
  sal(7, { estado: "anulada", firmas: 0, completa: false,
           supervisora_en: null, verificador_en: null, placa: null }),
];
createRoot(document.getElementById("r")!).render(
  <Salidas salidas={salidas as any} nombres={nombres}
           puedeAbrir manda={(window as any).__MANDA__} />);
`);

const armar = () => buildSync({
  entryPoints: [R(".arnes/_sl-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-sl.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-sl.ts"),
    "next/link": R(".arnes/_link-sl.tsx"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

writeFileSync(R(".arnes/_link-sl.tsx"),
  `export default function Link(p: any) { const { href, ...r } = p; return <a href={href} {...r} /> }`);

const js = armar();
const css = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (manda = true, ancho = 1440, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: 1100 });
  await pg.setContent(`<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}>
    <head><meta charset="utf-8"><style>${glob}${shell}${css} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>window.__MANDA__ = ${manda};</script>
    <script>${js.replace(/<\/script/g, "<\\/script")}</script></body></html>`);
  await pg.waitForSelector(".rt .sx-fila", { timeout: 10000 });
  await pg.evaluate(() => { window.llamadas = [] });
};

const verTodas = async () => {
  await pg.selectOption(".rt .filtros select", "todas");
  await pg.waitForFunction(() => document.querySelectorAll(".rt .sx-fila").length === 7,
                           null, { timeout: 3000 });
};

/* ---------- 1. SIN PERMISO, NI CASILLAS ---------- */
await monta(false);
ok((await pg.$$(".rt .sl-caja")).length === 0,
   "a quien no manda le salen las casillas de escoger");
ok((await pg.$$(".rt .sl-sel")).length === 0,
   "a quien no manda le sale la barra de borrar");

/* ---------- 1b. LA BARRA DE FILTROS ES RECTA ----------
   «Aquí solo pon los bordecitos rectangulares, porque todo está así.»
   No era gusto: `globals.css` tiene un `.filtros` de la plantilla vieja
   con radio 14, sombra y relleno, y esta barra lo heredaba entero. No
   da error y solo se ve mirando — por eso ahora se mide. */
await monta(true);
{
  const f = await pg.evaluate(() => {
    const el = document.querySelector(".rt .filtros");
    if (!el) return null;
    const c = getComputedStyle(el);
    return { radio: c.borderTopLeftRadius, sombra: c.boxShadow, relleno: c.paddingLeft };
  });
  ok(f, "no está la barra de filtros");
  if (f) {
    ok(parseFloat(f.radio) === 0, `la barra de filtros tiene las esquinas redondeadas (${f.radio})`);
    ok(f.sombra === "none", `la barra de filtros lleva sombra: ${f.sombra}`);
    ok(parseFloat(f.relleno) === 0, `la barra de filtros lleva relleno heredado (${f.relleno})`);
  }
  /* Y LOS CHIPS TAMBIÉN RECTOS: el módulo entero es recto, y un botón
     redondeado en medio se lee como de otra aplicación. */
  const r = await pg.$$eval(".rt .filtros .btn, .rt .filtros select, .rt .filtros input",
    (e) => e.map((x) => getComputedStyle(x).borderTopLeftRadius));
  const curvos = r.filter((x) => parseFloat(x) > 2);
  ok(curvos.length === 0, `hay ${curvos.length} controles redondeados en la barra: ${curvos.join(", ")}`);
}

/* ---------- 2. «TODAS» ES TODAS LAS QUE SE VEN ---------- */
await monta(true);
{
  const visibles = (await pg.$$(".rt .sx-fila")).length;
  ok(visibles === 3, `el filtro arranca en «las que estoy pesando» y salen ${visibles}, deben ser 3`);

  await pg.click(".rt .sl-todas input");
  const marcadas = await pg.$$eval(".rt .sl-caja input", (e) => e.filter((x) => x.checked).length);
  ok(marcadas === 3, `«escoger todas» marcó ${marcadas} y en pantalla hay 3`);
  ok(/Borrar 3/.test(await pg.textContent(".rt .sl-acc")),
     "el botón no dice cuántas se van a borrar");
  ok(/3<\/b> escogidas|3 escogidas/.test((await pg.innerHTML(".rt .sl-cuenta")).replace(/<b>/g, "")),
     "no se dice cuántas están escogidas");

  /* Y LAS FILAS ESCOGIDAS SE VEN ESCOGIDAS. Sin esto, la única señal
     de que una fila se va a borrar es una casilla de 20 px al otro
     extremo de la pantalla. */
  const pintadas = (await pg.$$(".rt .sx-fila.sl-puesta")).length;
  ok(pintadas === 3, `${pintadas} filas se ven escogidas y hay 3 marcadas`);

  /* EL CÓDIGO NO SE PARTE EN DOS RENGLONES. La casilla le quitó ancho
     a una columna de 96 px fijos y «SR-0011» salía como «SR-» / «0011».
     Es lo que identifica la fila que se va a borrar: partido, se lee
     mal justo donde no se puede leer mal. Lo cazó la captura, no el
     arnés — ahora lo mide. */
  const codigos = await pg.$$eval(".rt .sx-id", (e) => e.map((x) => ({
    txt: x.textContent.trim(), alto: Math.round(x.getBoundingClientRect().height),
    linea: Math.round(parseFloat(getComputedStyle(x).lineHeight) || 20),
  })));
  const partidos = codigos.filter((c) => c.alto > c.linea * 1.6);
  ok(partidos.length === 0,
     `el código se parte en dos renglones: ${partidos.map((c) => `${c.txt} (${c.alto}px)`).join(", ")}`);
}

/* ---------- 3. CAMBIAR DE FILTRO SUELTA LA SELECCIÓN ---------- */
{
  await verTodas();
  const quedan = await pg.$$eval(".rt .sl-caja input", (e) => e.filter((x) => x.checked).length);
  ok(quedan === 0,
     `al cambiar de filtro quedaron ${quedan} escogidas de antes: el botón diría «Borrar N» ` +
     "sin que se vea cuáles");
  ok((await pg.$$(".rt .sl-acc")).length === 0,
     "la barra de borrar se queda puesta sin nada escogido");
}

/* ---------- 4. LO YA DESPACHADO SE AVISA ---------- */
{
  await pg.click(".rt .sl-todas input");
  const t = await pg.textContent(".rt .sl-cuenta");
  ok(/7/.test(t), `con el filtro en «todas» debería escoger las 7 y dice «${t.trim()}»`);
  /* ESE NÚMERO SE FACTURÓ: es la diferencia entre limpiar pruebas y
     borrar un mes cerrado, y tiene que verse ANTES de confirmar. */
  ok(/despachada/i.test(t), `no se avisa que hay salidas ya despachadas: «${t.trim()}»`);
}

/* ---------- 5. PIDE MOTIVO Y PIDE TECLEAR «BORRAR N» ---------- */
{
  await pg.click(".rt .sl-acc .btn.mal");
  await pg.waitForSelector(".cf-caja", { timeout: 5000 });

  const bt = ".cf-caja .cf-btn.mal";
  ok(await pg.isDisabled(bt), "deja borrar sin escribir el motivo");
  ok(/Escribe/i.test(await pg.textContent(bt)), "el botón apagado no dice qué falta");

  const dice = await pg.textContent(".cf-dice");
  ok(/tolvas/i.test(dice), "no se dice que se van las tolvas: el peso que se leyó en la báscula");
  ok(/no se puede deshacer/i.test(dice), "no se dice que no se puede deshacer");
  ok(/anúlalas|anularlas|anula/i.test(dice),
     "no se ofrece la salida buena: si solo tienen que dejar de contar, se anulan");

  await pg.fill(".pt-campo textarea", "Data de prueba, arrancamos el mes limpio");
  ok(await pg.isDisabled(bt), "con el motivo pero sin teclear la confirmación ya deja borrar");
  ok(/BORRAR 7/.test(await pg.textContent(bt)),
     `el botón no dice qué hay que teclear: «${(await pg.textContent(bt)).trim()}»`);

  await pg.fill(".pt-copia input", "BORRAR 6");
  ok(await pg.isDisabled(bt), "acepta un número que no es el de las escogidas");
  await pg.fill(".pt-copia input", "BORRAR 7");
  ok(!(await pg.isDisabled(bt)), "con todo puesto el botón sigue apagado");

  await pg.click(bt);
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 3000 })
    .catch(() => {});
  const ls = await pg.evaluate(() => window.llamadas ?? []);

  /* UNA SOLA LLAMADA CON LOS CINCO ids. */
  ok(ls.length === 1, `viajaron ${ls.length} llamadas y debe ser UNA con todos los ids`);
  ok(ls[0]?.f === "salidas_borrar", `se llamó «${ls[0]?.f}»`);
  ok((ls[0]?.a?.p_ids ?? []).length === 7,
     `viajaron ${(ls[0]?.a?.p_ids ?? []).length} ids y deben ser 7`);
  ok((ls[0]?.a?.p_motivo ?? "").length >= 8,
     `no viajó el motivo: ${JSON.stringify(ls[0]?.a?.p_motivo)}`);
  console.log(`\nllamada: ${ls[0]?.f}(${(ls[0]?.a?.p_ids ?? []).length} ids, «${ls[0]?.a?.p_motivo}»)`);
}

/* =====================================================================
   5b · LA TABLA: UN CHIP POR ESTADO, LAS FIRMAS EN CADENA, Y LO
        IRREVERSIBLE DETRÁS DE «···»
   ===================================================================== */
await monta(true);
await verTodas();
{
  /* UN SOLO CHIP POR FILA, SIEMPRE. Antes eran tres etiquetas sueltas
     —CERRADA, COMPLETA, 1 DE 2 FIRMAS— que se leían como tres cosas
     distintas cuando son la misma: en qué punto va esta salida. */
  const porFila = await pg.$$eval(".rt .sx-fila",
    (f) => f.map((x) => x.querySelectorAll(".sx-est").length));
  ok(porFila.every((n) => n === 1),
     `hay filas con ${[...new Set(porFila)].join("/")} chips de estado y debe ser uno por fila`);

  const chips = await pg.$$eval(".rt .sx-est",
    (e) => e.map((x) => x.textContent.trim()));
  for (const q of ["PESÁNDOSE", "DESPACHADA", "ESPERANDO VH", "ANULADA"])
    ok(chips.includes(q), `falta el chip «${q}»: salieron ${JSON.stringify([...new Set(chips)])}`);

  /* EL COLOR NO PUEDE SER LA ÚNICA SEÑAL: no se lee en gris, ni
     impreso, ni por quien no distingue el verde del ámbar. Cada chip
     lleva su palabra además del punto. */
  const mudos = await pg.$$eval(".rt .sx-est",
    (e) => e.filter((x) => x.textContent.trim().length < 3).length);
  ok(mudos === 0, `${mudos} chips dicen el estado SOLO con el color`);

  /* LA CADENA S—V DICE CUÁL FALTA. «1 de 2» obliga a ir a mirar cuál
     de las dos es. */
  const firmas = await pg.$$eval(".rt .sx-fila", (f) => f.map((x) => ({
    id: x.querySelector(".sx-id")?.textContent,
    cadena: [...x.querySelectorAll(".sx-fir b")].map((b) => b.textContent + (b.classList.contains("ok") ? "+" : "-")).join(""),
    nada: !!x.querySelector(".sx-nada"),
  })));
  const media = firmas.find((f) => f.id === "SR-0006");
  ok(media?.cadena === "S+V-",
     `SR-0006 tiene una sola firma y la cadena salió «${media?.cadena}» (debe ser S+V-)`);
  const completa = firmas.find((f) => f.id === "SR-0005");
  ok(completa?.cadena === "S+V+", `SR-0005 está completa y salió «${completa?.cadena}»`);
  /* EN LO ABIERTO Y EN LO ANULADO NO HAY FIRMAS QUE ENSEÑAR: un «0 de
     2» ahí parecería un pendiente y no lo es. */
  ok(firmas.find((f) => f.id === "SR-0001")?.nada,
     "una salida que todavía se está pesando enseña firmas pendientes que no lo son");
  ok(firmas.find((f) => f.id === "SR-0007")?.nada,
     "una salida anulada enseña firmas pendientes");

  /* DOS FIRMAS DE LA MISMA PERSONA ES LA ÚNICA COMPROBACIÓN QUE TIENE
     ESTA CADENA. Sin avisarlo, la cédula parece firmada por dos. */
  ok((await pg.$$(".rt .sx-alerta")).length === 1,
     "no se avisa que firmó la misma persona");

  /* «ANULAR» NO PUEDE ESTAR AL LADO DE «VER». Es lo que se pidió con la
     maqueta: un botón rojo e irreversible a la misma altura y del mismo
     tamaño que el que se toca cien veces al día se toca por error. */
  const sueltos = await pg.$$eval(".rt .sx-acc",
    (a) => a.map((x) => [...x.children].filter((c) => !c.classList.contains("sx-menu"))
                                       .map((c) => c.textContent.trim())));
  const conAnular = sueltos.filter((b) => b.some((t) => /anular/i.test(t)));
  ok(conAnular.length === 0,
     `«Anular» sigue suelto en la fila, al lado de «Ver»: ${JSON.stringify(conAnular[0])}`);

  /* EL MENÚ: uno a la vez, y se cierra con Escape. Dos abiertos se
     solapan y se toca el de la fila de abajo creyendo que es el de
     arriba — en una lista cuyo menú tiene «Anular». */
  const mas = await pg.$$(".rt .sx-mas");
  ok(mas.length >= 2, `salieron ${mas.length} menús «···» y hacen falta al menos dos`);
  await mas[0].click();
  await pg.waitForSelector(".rt .sx-lista-menu", { timeout: 3000 });
  await mas[1].click();
  ok((await pg.$$(".rt .sx-lista-menu")).length === 1,
     "se pueden abrir dos menús a la vez: se solapan y se toca el de la fila de abajo");
  const dentro = await pg.$$eval(".rt .sx-lista-menu button", (b) => b.map((x) => ({
    t: x.textContent.trim(), h: Math.round(x.getBoundingClientRect().height),
  })));
  ok(dentro.some((d) => /anular/i.test(d.t)), "«Anular» no está en el menú");
  ok(dentro.every((d) => d.h >= 44),
     `en el menú hay opciones de ${dentro.map((d) => d.h).join("/")} px y con guante hacen falta 44`);
  await pg.keyboard.press("Escape");
  ok((await pg.$$(".rt .sx-lista-menu")).length === 0,
     "el menú no se cierra con Escape: se queda encima de la fila de abajo");

  /* Y EL MENÚ NO SALE DONDE NO HAY NADA QUE HACER: una salida anulada
     no se reabre ni se vuelve a anular, y un «···» que abre un cuadro
     vacío es peor que no tenerlo. */
  const anulada = await pg.$$eval(".rt .sx-fila", (f) => {
    const x = f.find((y) => y.querySelector(".sx-id")?.textContent === "SR-0007");
    return { mas: !!x?.querySelector(".sx-mas") };
  });
  ok(!anulada.mas, "a la salida anulada le sale el menú «···» sin nada adentro");

  console.log(`\nchips: ${[...new Set(chips)].join(" · ")}`);
}

/* ---------- 6. EL DEDO ALCANZA, Y NADA SE SALE ---------- */
console.log("\nancho    se sale    casilla   lo que se toca");
for (const ancho of [1440, 820, 390, 360]) {
  await monta(true, ancho);
  await pg.click(".rt .sl-todas input");
  const m = await pg.evaluate((a) => {
    const fuera = [...document.querySelectorAll(".rt *")].filter((e) => {
      for (let p = e.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible") return false;
      }
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.right > a + .5;
    }).map((e) => e.className || e.tagName);
    const caja = document.querySelector(".sl-caja");
    const chicos = [...document.querySelectorAll(".rt .sl-sel button, .rt .sl-todas")]
      .filter((e) => e.getBoundingClientRect().height < 44)
      .map((e) => (e.className || e.tagName) + " h=" + Math.round(e.getBoundingClientRect().height));
    return {
      fuera: [...new Set(fuera)].slice(0, 3),
      lado: document.documentElement.scrollWidth > a + 1,
      caja: caja ? Math.round(Math.min(caja.getBoundingClientRect().width,
                                       caja.getBoundingClientRect().height)) : 0,
      chicos: [...new Set(chicos)].slice(0, 2),
    };
  }, ancho);
  console.log(`${String(ancho).padEnd(8)} ${(m.lado || m.fuera.length ? m.fuera.join(", ") || "sí" : "nada").padEnd(10)} ` +
              `${String(m.caja).padStart(7)}   ${m.chicos.length ? m.chicos.join(", ") : "44+"}`);
  if (m.lado || m.fuera.length)
    fallas.push(`a ${ancho} px se sale: ${m.fuera.join(", ") || "la página entera"}`);
  /* 44 px DE ÁREA TOCABLE. Fallar el clic aquí significa marcar la fila
     de al lado en una pantalla cuyo botón siguiente dice «Borrar». */
  if (m.caja < 44)
    fallas.push(`a ${ancho} px la casilla se toca en ${m.caja} px y con guante hacen falta 44`);
  if (m.chicos.length)
    fallas.push(`a ${ancho} px no se alcanza con el dedo: ${m.chicos.join(", ")}`);
}

/* ---------- 7. SE LEE EN LOS SIETE TEMAS ---------- */
const PARES = [["cuenta", ".rt .sl-cuenta"], ["ya despachadas", ".rt .sl-ojo"],
               ["botón borrar", ".rt .sl-acc .btn.mal"],
               /* LOS CUATRO CHIPS: cada uno lleva su propio par de
                  colores, así que cada uno se puede romper por su
                  cuenta en un tema distinto. */
               ["despachada", ".rt .sx-est.sx-despachada"],
               ["esperando vh", ".rt .sx-est.sx-esperando"],
               ["pesándose", ".rt .sx-est.sx-pesando"],
               ["anulada", ".rt .sx-est.sx-anulada"],
               ["placa", ".rt .sx-placa"],
               ["sin placa", ".rt .sx-sinplaca"],
               ["kilos", ".rt .sx-peso b"],
               ["quién y cuándo", ".rt .sx-peso em"],
               ["firmó la misma", ".rt .sx-alerta"]];
console.log("\ntema      " + PARES.map((p) => p[0].padStart(15)).join(""));
for (const tema of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(true, 1440, tema);
  await verTodas();
  await pg.click(".rt .sl-todas input");
  const r = await pg.evaluate((pares) => {
    /* `color(srgb 0.98 …)` VIENE EN 0–1 Y NO EN 0–255: así devuelve
       este Chromium un `color-mix()` ya resuelto. Leerlo como 0–255 da
       un color casi negro y el arnés reporta 1.3 donde hay 13 — una
       medida que miente en rojo cuesta más que una que miente en
       verde: se va media hora arreglando un color que estaba bien. */
    const rgb = (s) => {
      const c = String(s).match(/^color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (c) return [1, 2, 3].map((i) => Number(c[i]) * 255);
      return (String(s).match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    };
    const lum = (p) => {
      const [r, g, b] = p.map((v) => {
        const s = v / 255; return s <= .03928 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
      });
      return .2126 * r + .7152 * g + .0722 * b;
    };
    const fondo = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c);
      }
      return [255, 255, 255];
    };
    return pares.map(([, s]) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const a = lum(rgb(getComputedStyle(el).color)), b = lum(fondo(el));
      return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 100) / 100;
    });
  }, PARES);
  console.log((tema || "oficial").padEnd(10) + r.map((v) => String(v ?? "—").padStart(15)).join(""));
  r.forEach((v, i) => {
    if (v == null) fallas.push(`falta «${PARES[i][0]}» (${PARES[i][1]}) en el tema ${tema || "oficial"}`);
    else if (v < 4.5) fallas.push(`«${PARES[i][0]}» contrasta ${v} en el tema ${tema || "oficial"}`);
  });
}

await monta(true, 1440);
await verTodas();
await pg.click(".rt .sl-todas input");
await pg.screenshot({ path: R(".arnes/_sl-borrar.png"), fullPage: true });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ Borrar salidas en lote: a quien no manda no le salen las casillas, «todas» es " +
            "todas LAS QUE SE VEN, cambiar de filtro suelta la selección, se avisa lo ya " +
            "despachado, se exige motivo y teclear «BORRAR N», y viaja UNA sola llamada con " +
            "todos los ids.");
