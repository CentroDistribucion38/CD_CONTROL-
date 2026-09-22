/* =====================================================================
   TRASPASOS · EL CIERRE POR TURNO Y DEL DÍA — los componentes de
   verdad, en Chromium.

   «Que en el tablero de control pueda tener un icono y visualizar el
   cierre por turno o del día.»

   SE COMPRUEBA:

   1. EL ICONO ES SUTIL PERO ESTÁ. Casi apagado en reposo y entero al
      pasar por encima: si se quedara invisible, la función no existe.

   2. LO QUE SE TOCA ES LA TARJETA ENTERA y mide ≥ 44 px. Un icono de
      14 px no se acierta con el dedo en la bodega.

   3. EL CIERRE DEL TURNO DICE LAS CIFRAS DE ESE TURNO, no las del día.
      Es el error que haría inútil toda la ficha.

   4. LAS CIFRAS DEL CIERRE SON LAS MISMAS DEL TABLERO. La ficha suma
      las filas que le bajan; si hiciera su propia cuenta, un redondeo
      bastaría para que el cierre y el tablero se contradijeran.

   5. EL CIERRE DEL DÍA SUMA LOS TRES TURNOS.

   6. LOS VIAJES SE PIDEN AL ABRIR —no al cargar el tablero— y con el
      turno puesto en la dirección.

   7. LO QUE HAY QUE MIRAR SOLO SALE SI HAY ALGO: un renglón que dice
      «0 sin orden de cargue» es un renglón que la gente se salta.

   8. ESCAPE Y LA X CIERRAN, y tocar por fuera también.

   9. NADA SE SALE a 1440 / 820 / 390 / 360.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_tc-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Turnos } from "../src/app/(app)/traspasos/control/Turnos";
const w = window as any;
createRoot(document.getElementById("r")!).render(
  <div className="tp">
    <section className="medidor">
      <Turnos anillos={w.ANILLOS} filas={w.FILAS} desde={w.DESDE} hasta={w.HASTA}
              rotulo="Lunes, 21 de septiembre de 2026" adherencia={w.ADH}
              adheridos={w.ADHERIDOS} planeado={w.PLANEADO} />
    </section>
  </div>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_tc-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/traspasos/traspasos.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

/* ---------- LOS DATOS ----------
   Un día, tres turnos. El A cumplió de sobra, el B se quedó corto y el
   C no movió nada: los tres casos que pintan distinto. */
const ORDEN = { A: 1, B: 2, C: 3 };
const F = (turno, tipo, nombre, orden, planeado, cumplido) => {
  const adheridos = Math.min(cumplido, planeado);
  return { fecha: "2026-09-21", turno, turno_orden: ORDEN[turno], tipo, tipo_nombre: nombre,
    tipo_orden: orden, plan_id: planeado ? "p1" : null, planeado, vacios_planeados: 0, nota: null,
    cumplido, registros: cumplido, carga: cumplido * 100, placas: 2,
    adheridos, adicionales: Math.max(cumplido - planeado, 0), faltan: Math.max(planeado - cumplido, 0),
    sin_planear: planeado === 0,
    adherencia: planeado ? Math.min(Math.round((adheridos / planeado) * 100), 100) : null,
    cumplimiento: planeado ? Math.round((cumplido / planeado) * 100) : null };
};
const FILAS = [
  F("A", "casco", "Casco vidrio", 1, 10, 10),
  F("A", "canastas", "Canastas", 2, 4, 6),
  F("B", "casco", "Casco vidrio", 1, 8, 5),
  F("C", "casco", "Casco vidrio", 1, 5, 0),
];
const sumT = (t, k) => FILAS.filter((f) => !t || f.turno === t).reduce((a, f) => a + f[k], 0);
const ANILLOS = ["A", "B", "C"].map((t) => {
  const pl = sumT(t, "planeado"), ad = sumT(t, "adheridos");
  return { turno: t, planeado: pl, adheridos: ad, pct: pl ? Math.round((ad / pl) * 100) : 0, hay: pl > 0 };
});
const PLANEADO = sumT(null, "planeado"), ADHERIDOS = sumT(null, "adheridos");
const ADH = Math.round((ADHERIDOS / PLANEADO) * 100);

let n = 0;
const V = (o) => ({ id: "v" + ++n, codigo: "TR-" + (1000 + n), fecha: "2026-09-21", turno: o.turno,
  turno_orden: ORDEN[o.turno], tipo: "casco", tipo_nombre: "Casco vidrio", placa: "ABC12" + n,
  documento: o.sinDoc ? null : "OC-" + (5000 + n), sin_documento: !!o.sinDoc,
  origen: "cd38", origen_nombre: "CD38", destino: "ag01", destino_nombre: "AG01",
  origen_suelto: false, destino_suelto: false, viajes: 1, vacio: !!o.vacio,
  carga: o.vacio ? null : 100, unidad: "canastas", nota: null,
  hora: "2026-09-21T1" + n + ":30:00Z", registrado_por: "u1", registrado_en: "2026-09-21T20:00:00Z",
  dias_atras: o.atras ?? 0, atrasado: (o.atras ?? 0) > 0, ediciones: 0, editado_en: null, editado_por: null,
  estado: o.anulado ? "anulado" : "registrado", vale: !o.anulado, motivo_anulacion: null,
  anulado_en: null, anulado_por: null });
const VIAJES_A = [V({ turno: "A" }), V({ turno: "A", sinDoc: true }), V({ turno: "A", atras: 2 })];
const VIAJES_TODOS = [...VIAJES_A, V({ turno: "B" }), V({ turno: "B", vacio: true }), V({ turno: "C", anulado: true })];
const NOMBRES = { u1: "Génesis Visbal" };

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

/* La ruta del cierre, de mentira: se anota con qué se pidió. */
await pg.route("**/*", (r) => {
  const u = r.request().url();
  if (u.includes("/api/traspasos/cierre")) {
    const q = new URL(u).searchParams;
    const t = q.get("turno");
    const viajes = t ? VIAJES_TODOS.filter((v) => v.turno === t) : VIAJES_TODOS;
    const vacios = viajes.filter((v) => v.vacio && v.estado === "registrado").length;
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ viajes, vacios, nombres: NOMBRES }) });
  }
  /* El sello de la B, de verdad: si no llegara, el arnés aprobaría una
     cabecera con el hueco de una imagen rota. */
  if (u.includes("/marca/logo-b.png")) {
    return r.fulfill({ status: 200, contentType: "image/png", body: readFileSync(R("public/marca/logo-b.png")) });
  }
  return r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" });
});

const monta = async (ancho = 1440, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/traspasos/control");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main" id="m"><div id="r"></div></main></div></div>
    <script>window.ANILLOS=${JSON.stringify(ANILLOS)};window.FILAS=${JSON.stringify(FILAS)};
    window.DESDE="2026-09-21";window.HASTA="2026-09-21";window.ADH=${ADH};window.ADHERIDOS=${ADHERIDOS};window.PLANEADO=${PLANEADO};
    window.pedidos=[];const f=window.fetch;window.fetch=(u,o)=>{window.pedidos.push(String(u));return f(u,o)};</script>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".turnos .turno");
};

/* ---------- 1 · EL ICONO ES SUTIL PERO ESTÁ ---------- */
await monta();
{
  const o = await pg.evaluate(() => {
    const i = document.querySelector(".turno .tp-ver");
    if (!i) return null;
    const s = getComputedStyle(i);
    return { op: Number(s.opacity), w: i.getBoundingClientRect().width };
  });
  ok(!!o, "no hay icono en el anillo del turno");
  if (o) {
    ok(o.op > 0.15 && o.op < 0.6, `el icono está a ${o.op} de opacidad: o no se ve o compite con el porcentaje`);
    ok(o.w > 0, "el icono no ocupa nada: no se ve");
  }
  await pg.hover(".turnos .turno >> nth=0");
  await pg.waitForTimeout(250);
  const enc = await pg.evaluate(() => Number(getComputedStyle(document.querySelector(".turno .tp-ver")).opacity));
  ok(enc > 0.9, `al pasar por encima el icono queda en ${enc} y debería prenderse del todo`);
}

/* ---------- 2 · LO QUE SE TOCA ES LA TARJETA ---------- */
{
  const m = await pg.evaluate(() => {
    const t = document.querySelector(".turnos .turno");
    const d = document.querySelector(".tp-cierre-dia");
    return { turno: t.getBoundingClientRect().height, tag: t.tagName, dia: d?.getBoundingClientRect().height ?? 0, dtag: d?.tagName };
  });
  ok(m.tag === "BUTTON", `el anillo es un <${m.tag}> y tiene que ser un botón para que se pueda tocar y tabular`);
  ok(m.turno >= 44, `el anillo mide ${Math.round(m.turno)} px de alto y el dedo necesita 44`);
  ok(m.dtag === "BUTTON" && m.dia >= 44, "no hay botón para el cierre del día entero, o mide menos de 44");
}

/* ---------- 3 y 4 · EL CIERRE DEL TURNO DICE LO DE ESE TURNO ---------- */
await pg.click(".turnos .turno >> nth=1");           // turno B: 5 de 8 = 63%
await pg.waitForSelector(".tp-ci");
{
  const cab = await pg.textContent(".tp-ci-cab");
  ok(/Cierre del turno B/.test(cab), `la ficha dice «${cab.trim().slice(0, 60)}…» y debe decir el turno B`);
  ok(/foto de las \d{1,2}:\d{2}/.test(cab), "la ficha no dice a qué hora se armó la foto");
  const gran = (await pg.textContent(".tp-ci-hero .ci-pct")).replace(/\s+/g, " ");
  ok(/63%/.test(gran), `el cierre del turno B da «${gran}» y su adherencia es 63% (5 de 8)`);
  ok(/5 de 8 del plan/.test(gran), `el cierre del turno B no dice «5 de 8 del plan»: «${gran}»`);
  /* Y NO las del día: 21 de 27 es el total, y no puede aparecer aquí. */
  const todo = await pg.textContent(".tp-ci-ancho");
  ok(!/21 de 27/.test(todo), "el cierre del turno B está mostrando las cifras del día entero");
}

/* ---------- 6 · LOS VIAJES SE PIDEN AL ABRIR, CON EL TURNO ---------- */
{
  const p = await pg.evaluate(() => window.pedidos.filter((u) => u.includes("/api/traspasos/cierre")));
  ok(p.length === 1, `se pidió el cierre ${p.length} veces y debe ser una sola al abrir`);
  const u = new URL(p[0], "https://control.prueba");
  ok(u.searchParams.get("turno") === "B", "el cierre no pide el turno que se abrió");
  ok(u.searchParams.get("desde") === "2026-09-21" && u.searchParams.get("hasta") === "2026-09-21",
     "el cierre no pide el rango que la pantalla está mostrando");
  await pg.waitForSelector(".tp-ci-t.tp-ci-viajes tbody tr");
  const filas = await pg.$$eval(".tp-ci-t.tp-ci-viajes tbody tr", (ns) => ns.length);
  ok(filas === 2, `el turno B trae ${filas} viajes y son 2 (uno de ellos vacío)`);
  const vacio = await pg.$(".tp-ci-t.tp-ci-viajes .ci-eti");
  ok(!!vacio, "el viaje vacío no sale marcado en la lista");
}

/* ---------- 7 · LO QUE HAY QUE MIRAR, SOLO SI HAY ---------- */
{
  /* El turno B no tiene nada sin orden de cargue ni digitado después,
     pero sí tiene 3 sin salir: eso sí sale. */
  const ojos = await pg.$$eval(".tp-ci-rev .ci-av b", (ns) => ns.map((x) => x.textContent.trim()));
  ok(!ojos.includes("Sin orden de cargue"),
     "el turno B no tiene viajes sin orden de cargue y aun así sale el renglón — un «0» que nadie lee");
  ok(ojos.includes("Sin salir"), "el turno B tiene 3 viajes sin salir y no lo dice");
}

/* ---------- 8 · ESCAPE, LA X Y TOCAR POR FUERA ---------- */
await pg.keyboard.press("Escape");
ok(!(await pg.$(".tp-ci")), "Escape no cierra la ficha");
await pg.click(".turnos .turno >> nth=0");
await pg.waitForSelector(".tp-ci");
await pg.click(".tp-ci-bt.ico");
ok(!(await pg.$(".tp-ci")), "la X no cierra la ficha");
await pg.click(".turnos .turno >> nth=0");
await pg.waitForSelector(".tp-ci");
await pg.mouse.click(8, 8);
await pg.waitForTimeout(150);
ok(!(await pg.$(".tp-ci")), "tocar por fuera no cierra la ficha");

/* ---------- 3bis · EL TURNO A, CON SUS AVISOS ---------- */
await monta();
await pg.click(".turnos .turno >> nth=0");           // turno A: 14 de 14 = 100%
await pg.waitForSelector(".tp-ci-t.tp-ci-viajes tbody tr");
{
  const gran = (await pg.textContent(".tp-ci-hero .ci-pct")).replace(/\s+/g, " ");
  ok(/100%/.test(gran), `el turno A cumplió 14 de 14 y la ficha dice «${gran}»`);
  const ojos = await pg.$$eval(".tp-ci-rev .ci-av b", (ns) => ns.map((x) => x.textContent.trim()));
  ok(ojos.includes("Sin orden de cargue"), "el turno A tiene un viaje sin orden de cargue y no lo avisa");
  ok(ojos.includes("Digitado después"), "el turno A tiene un viaje digitado después y no lo avisa");
  ok(!ojos.includes("Sin salir"), "el turno A cumplió todo: no puede decir que falta algo");
  /* Los adicionales del A (2 canastas de más) tienen que verse. */
  const tipos = (await pg.textContent(".tp-ci-t.tp-ci-tipos")).replace(/\s+/g, " ");
  ok(/Canastas/.test(tipos) && /Casco vidrio/.test(tipos), "el desglose por tipo no trae los dos tipos del turno A");
}

/* ---------- 5 · EL CIERRE DEL DÍA SUMA LOS TRES ---------- */
await monta();
await pg.click(".tp-cierre-dia");
await pg.waitForSelector(".tp-ci");
{
  const cab = await pg.textContent(".tp-ci-cab");
  ok(/Cierre del día/.test(cab), `la ficha del día dice «${cab.trim().slice(0, 50)}…»`);
  const gran = (await pg.textContent(".tp-ci-hero .ci-pct")).replace(/\s+/g, " ");
  ok(gran.includes(`${ADHERIDOS} de ${PLANEADO} del plan`),
     `el cierre del día dice «${gran}» y debe ser ${ADHERIDOS} de ${PLANEADO}`);
  ok(gran.includes(`${ADH}%`), `el cierre del día no trae el ${ADH}% del tablero`);
  await pg.waitForSelector(".tp-ci-t.tp-ci-viajes tbody tr");
  const filas = await pg.$$eval(".tp-ci-t.tp-ci-viajes tbody tr", (ns) => ns.length);
  ok(filas === VIAJES_TODOS.length, `el día trae ${filas} viajes y son ${VIAJES_TODOS.length}`);
  const anul = await pg.$(".tp-ci-t.tp-ci-viajes tr.anulado");
  ok(!!anul, "el viaje anulado no se distingue en la lista del día");
}

/* ---------- 9 · QUE QUEPA, Y QUE EL CELULAR SEA OTRA COSA ----------
   Debajo de 760 px la ficha no es la misma pagina encogida: las dos
   tablas se cierran en acordeones y los viajes se vuelven tarjetas. Se
   comprueban las dos formas, cada una en su ancho. */
const tabla = [];
for (const ancho of [1440, 820, 390, 360]) {
  const angosto = ancho <= 760;
  await monta(ancho);
  await pg.click(".tp-cierre-dia");
  await pg.waitForSelector(".tp-ci-hero .ci-pct");
  /* Que lleguen los viajes antes de medir: una ficha a medio llenar
     siempre cabe. */
  await pg.waitForFunction(() => !/tray[eé]ndolos|Trayendo/.test(
    document.querySelector(".tp-ci-movil .tp-ci-acor:last-of-type summary")?.textContent ?? "x"), null, { timeout: 8000 });
  if (angosto) {
    ok(!(await pg.isVisible(".tp-ci-ancho")), `a ${ancho} px sigue saliendo la version ancha`);
    ok(await pg.isVisible(".tp-ci-movil"), `a ${ancho} px no sale la version de celular`);
    /* Los acordeones arrancan CERRADOS: lo que se mira de pie es el
       porcentaje y los avisos, no seis viajes. */
    ok(!(await pg.isVisible(".vcard")), `a ${ancho} px los viajes arrancan abiertos`);
    await pg.click(".tp-ci-movil .tp-ci-acor:last-of-type summary");
    await pg.waitForSelector(".vcard");
    const n = await pg.$$eval(".vcard", (ns) => ns.length);
    ok(n === VIAJES_TODOS.length, `a ${ancho} px salen ${n} tarjetas de viaje y son ${VIAJES_TODOS.length}`);
    const alto = await pg.evaluate(() => Math.round(document.querySelector(".tp-ci-fija button").getBoundingClientRect().height));
    ok(alto >= 44, `a ${ancho} px los botones de la barra de abajo miden ${alto} px`);
  } else {
    ok(await pg.isVisible(".tp-ci-ancho"), `a ${ancho} px no sale la version ancha`);
    ok(!(await pg.isVisible(".tp-ci-movil")), `a ${ancho} px sale tambien la version de celular`);
    await pg.waitForSelector(".tp-ci-t.tp-ci-viajes tbody tr");
  }
  const m = await pg.evaluate(() => {
    const caja = document.getElementById("m");
    const ficha = document.querySelector(".tp-ci");
    const velo = document.querySelector(".tp-velo");
    return {
      sale: Math.max(0, caja.scrollWidth - caja.clientWidth),
      salePagina: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      saleFicha: Math.max(0, ficha.scrollWidth - ficha.clientWidth),
      dentro: ficha.getBoundingClientRect().width <= velo.getBoundingClientRect().width + 1,
      x: Math.round(document.querySelector(".tp-ci-bt.ico").getBoundingClientRect().height),
      /* Quién se sale, si alguien se sale: sin esto, un «280 px» no
         dice qué hay que arreglar. */
      culpables: [...ficha.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().width > ficha.clientWidth + 1)
        .slice(0, 6).map((e) => e.className + " " + Math.round(e.getBoundingClientRect().width)),
    };
  });
  if (m.saleFicha > 1) console.log(ancho, "culpables:", m.culpables);
  tabla.push({ ancho, "se sale": m.salePagina ? m.salePagina + " px" : "nada",
               "la ficha": m.saleFicha ? m.saleFicha + " px" : "nada", "cerrar": m.x });
  ok(m.salePagina <= 1, `a ${ancho} px la página se sale ${m.salePagina} px con la ficha abierta`);
  ok(m.saleFicha <= 1, `a ${ancho} px la ficha se sale ${m.saleFicha} px por dentro`);
  ok(m.dentro, `a ${ancho} px la ficha es más ancha que el velo`);
  /* 40 con el ratón —es lo que pidió la maqueta— y 44 con el dedo. */
  const min = angosto ? 44 : 40;
  ok(m.x >= min, `a ${ancho} px la X mide ${m.x} px y necesita ${min}`);
  await pg.keyboard.press("Escape");
}

/* ---------- 10 · QUE SE LEA EN LOS SIETE TEMAS ----------
   La franja grande va pintada del ACENTO, y el acento cambia con las
   preferencias de cada quien: en un tema es ámbar y en otro es un rojo
   hondo. Lo que va encima sale de su pareja del tema, no de un negro
   escrito a mano — pero eso hay que MEDIRLO, no suponerlo: en otra
   pantalla de este mismo proyecto un par así dio 1,7 en un tema y 6,9
   en otro. */
const lum = (c) => { const [r, g, b] = c.map((v) => { const x = v / 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return .2126 * r + .7152 * g + .0722 * b };
const razon = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) };
const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
const TEMAS = ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const contraste = [];
for (const tema of TEMAS) {
  await monta(1300, tema);
  await pg.click(".tp-cierre-dia");
  await pg.waitForSelector(".tp-ci-hero .ci-pct");
  const c = await pg.evaluate(() => {
    const hero = document.querySelector(".tp-ci-hero");
    const fondo = getComputedStyle(hero).backgroundColor;
    const leer = (s) => getComputedStyle(hero.querySelector(s)).color;
    return { fondo, v: leer(".ci-pct .ci-v"), k: leer(".ci-pct .ci-k"), s: leer(".ci-pct .ci-s"), ley: leer(".ci-ley") };
  });
  const f = rgb(c.fondo);
  const filas = { tema: tema || "oficial" };
  for (const [nom, col] of [["70%", c.v], ["rótulo", c.k], ["19 de 27", c.s], ["leyenda", c.ley]]) {
    const r = razon(rgb(col), f);
    filas[nom] = r.toFixed(2);
    /* El rótulo chiquito y la leyenda son texto pequeño: 4,5. El 70% es
       enorme (66 px, peso 900) y le basta 3,0 por norma. */
    const pide = nom === "70%" ? 3 : 4.5;
    ok(r >= pide, `tema «${tema || "oficial"}»: «${nom}» sobre la franja contrasta ${r.toFixed(2)} y necesita ${pide}`);
  }
  contraste.push(filas);
  await pg.keyboard.press("Escape");
}

/* ---------- 11 · CÓMO SE IMPRIME ----------
   «Mira cómo se imprime y nooo, debe ser igual a como está.» Salía la
   barra de la app, las pestañas del módulo, y debajo la ficha en su
   versión de CELULAR —acordeones cerrados— sin un solo fondo.

   La hoja mide unos 700 px de ancho, o sea MENOS de 760: el navegador
   aplicaba las reglas del celular. Por eso se mide con el ancho de una
   hoja, no con el del monitor. */
{
  await monta(760, "");
  await pg.click(".tp-cierre-dia");
  /* A 760 px manda la versión de celular —es el ancho de una hoja—, así
     que se espera por lo que SÍ está a la vista y después se cambia el
     medio a «print», que es donde se comprueba que mande la ancha. */
  await pg.waitForSelector(".tp-ci-hero .ci-pct");
  await pg.waitForFunction(() => !/tray[eé]ndolos/.test(
    document.querySelector(".tp-ci-movil .tp-ci-acor:last-of-type summary")?.textContent ?? "x"), null, { timeout: 8000 });
  await pg.emulateMedia({ media: "print" });
  /* Se mete una barra de la app de mentira para comprobar que no se
     imprime: en el arnés no está el armazón entero. */
  await pg.evaluate(() => {
    const b = document.createElement("div");
    b.className = "sh-barra"; b.id = "falsa-barra"; b.textContent = "CONTROL · Traspasos";
    document.querySelector(".sh").prepend(b);
    /* Y un pedazo del tablero, para comprobar que tampoco se imprime:
       en el arnés solo está montado el bloque de los turnos. */
    const t = document.createElement("section");
    t.className = "cabeza-ctl"; t.id = "falso-tablero"; t.textContent = "Control y ejecución";
    document.querySelector(".tp").prepend(t);
  });
  const p = await pg.evaluate(() => {
    const ver = (s) => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== "none" };
    const fondo = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null };
    const exacto = (s) => { const e = document.querySelector(s); if (!e) return null;
      const c = getComputedStyle(e); return (c.printColorAdjust || c.webkitPrintColorAdjust) === "exact" };
    return {
      barra: ver("#falsa-barra"),
      ancha: ver(".tp-ci-ancho"), movil: ver(".tp-ci-movil"),
      tablero: ver("#falso-tablero"),
      anillos: ver(".turnos"),
      viajes: document.querySelectorAll(".tp-ci-t.tp-ci-viajes tbody tr").length,
      fondoCab: fondo(".tp-ci-cab"), fondoHero: fondo(".tp-ci-hero"),
      exactoCab: exacto(".tp-ci-cab"), exactoHero: exacto(".tp-ci-hero"),
      saleFicha: Math.max(0, document.querySelector(".tp-ci").scrollWidth - document.querySelector(".tp-ci").clientWidth),
    };
  });
  ok(p.barra === false, "al imprimir sale la barra de la app encima de la ficha");
  ok(p.tablero === false, "al imprimir sale el tablero de atrás con la ficha");
  ok(p.anillos === false, "al imprimir salen los anillos de turno detrás de la ficha");
  ok(p.ancha === true, "al imprimir NO sale la versión ancha — se está imprimiendo la del celular");
  ok(p.movil === false, "al imprimir sale también la versión de celular, con los acordeones cerrados");
  ok(p.viajes === VIAJES_TODOS.length, `al imprimir salen ${p.viajes} viajes y son ${VIAJES_TODOS.length}`);
  ok(p.saleFicha <= 1, `al imprimir la tabla se sale ${p.saleFicha} px del papel`);
  /* Los fondos: sin print-color-adjust el navegador los quita y queda
     texto suelto sobre blanco. */
  ok(p.exactoCab === true, "la banda negra no lleva print-color-adjust: sale en blanco en el papel");
  ok(p.exactoHero === true, "la franja del acento no lleva print-color-adjust: sale en blanco en el papel");
  ok(/rgb/.test(p.fondoCab ?? "") && p.fondoCab !== "rgba(0, 0, 0, 0)", "la banda de arriba perdió su fondo al imprimir");
  ok(/rgb/.test(p.fondoHero ?? "") && p.fondoHero !== "rgba(0, 0, 0, 0)", "la franja del acento perdió su fondo al imprimir");
  if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/cierre-print.png`, fullPage: true });
  await pg.emulateMedia({ media: "screen" });
}

/* ---------- 12 · COPIAR PARA ENVIAR ----------
   «Y que esté un copiar para enviar la info.» Lo que se manda por
   WhatsApp no es una tabla: es texto corto, con la hora de la foto y
   las cifras que se están viendo. */
{
  await monta(1300, "");
  await pg.evaluate(() => {
    /* El portapapeles de verdad pide permisos que el arnés no tiene:
       se apunta lo que se habría copiado. */
    navigator.clipboard.writeText = async (t) => { window.copiado = t };
  });
  await pg.click(".tp-cierre-dia");
  await pg.waitForSelector(".tp-ci-t.tp-ci-viajes tbody tr");
  await pg.click('.tp-ci-bt:has-text("Copiar")');
  await pg.waitForFunction(() => typeof window.copiado === "string", null, { timeout: 4000 });
  const t = await pg.evaluate(() => window.copiado);
  ok(/CIERRE DEL DÍA/.test(t), `el texto copiado no dice de qué es: «${t.slice(0, 40)}»`);
  ok(new RegExp(`Adherencia ${ADH}%`).test(t), `el texto no trae la adherencia (${ADH}%)`);
  ok(t.includes(`${ADHERIDOS} de ${PLANEADO} del plan`), "el texto no dice cuántos de cuántos");
  ok(/Foto de las \d{1,2}:\d{2}/.test(t), "el texto no lleva la hora de la foto — sin ella la cifra no se ubica");
  ok(/POR TIPO/.test(t) && /Casco vidrio/.test(t), "el texto no trae el desglose por tipo");
  ok(/PARA MIRAR/.test(t) && /sin orden de cargue/.test(t), "el texto no trae lo que hay que mirar");
  ok(/control\.prueba/.test(t), "el texto no lleva el enlace a lo que se está viendo");
  /* Y nada de tablas ni markdown: esto se lee en WhatsApp. */
  ok(!/\||#{1,6} |\*\*/.test(t), "el texto lleva formato de tabla o markdown: en WhatsApp se ve como basura");
  /* El botón avisa que copió; si no, se toca cinco veces. */
  ok(/Copiado/.test(await pg.textContent('.tp-ci-bt:has-text("Copiado")') ?? ""),
     "después de copiar el botón no dice que copió");
  await pg.keyboard.press("Escape");
}

/* Una foto para mirarla, cuando se pide. */
if (process.env.FOTO) {
  for (const [nom, ancho, turno] of [["pc", 1300, 0], ["cel", 390, 0], ["turno", 1300, 1]]) {
    await monta(ancho);
    await pg.click(turno ? ".turnos .turno >> nth=0" : ".tp-cierre-dia");
    if (ancho > 760) await pg.waitForSelector(".tp-ci-t.tp-ci-viajes tbody tr");
    else { await pg.waitForTimeout(500); await pg.click(".tp-ci-movil .tp-ci-acor:last-of-type summary") }
    await pg.waitForTimeout(200);
    await pg.screenshot({ path: `${process.env.FOTO}/cierre-${nom}.png`, fullPage: true });
  }
}

await nav.close();
console.log("");
console.table(tabla);
console.table(contraste);
console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Traspasos · cierre: icono sutil pero visible, la tarjeta entera se toca, el turno dice lo del turno "
          + "y el día suma los tres, los viajes se piden al abrir, los avisos solo si hay, y cabe en los 4 anchos.");
