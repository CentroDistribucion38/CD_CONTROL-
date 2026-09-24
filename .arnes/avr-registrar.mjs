/* =====================================================================
   AVERÍAS · REGISTRAR — la ubicación del maestro, el buscador y la hora.

   «En ubicación, que venga como desplegable del maestro que tenemos en
    inventario; esa ubicación debería ser calle, módulo, lado, así como
    el inventario. En producto que la persona pueda escribir para buscar
    más rápido, sea por código o material. El día en que pasó quítalo,
    porque quiero trazabilidad de en qué turno, a qué hora, en qué fecha
    se hizo ese registro.»

   Lo que tiene que ser cierto:

   1. LA UBICACIÓN SALE DEL MAESTRO Y EN CASCADA: calle → módulo →
      lado, y cada uno apagado hasta que haya el de antes. Un
      desplegable vacío y encendido se toca tres veces antes de que
      alguien entienda que falta el de la izquierda.

   2. LO QUE VIAJA ES EL **ID** DEL MAESTRO, no el texto. Con el texto,
      la misma calle se escribe de cuatro formas y la concentración por
      calle reparte un pasillo en tres.

   3. EL PRODUCTO SE BUSCA ESCRIBIENDO, y POR CÓDIGO tanto como por
      nombre. Quien tiene el código de la estiba a la vista lo teclea, y
      un `<select>` nativo solo salta por el PRINCIPIO del nombre.

   4. «DÍA EN QUE PASÓ» YA NO ESTÁ, y NO viaja ninguna fecha de
      registro: la pone la base. Si la pantalla mandara `p_fecha`, todo
      lo demás sería decoración.

   5. SE DICE QUE SE VA A GUARDAR CON LA FECHA, LA HORA Y EL TURNO. Sin
      eso, quitar el campo parece que se perdió el dato.

   6. NADA QUE SE SALGA Y 44 px PARA EL GUANTE.

      AQUÍ NO SE MIDE «NADA REDONDO», a propósito. Los campos de
      Inventario llevan `border-radius: 2px` desde fefo.css y eso es de
      todo el módulo: lo cuadrado se pidió para Roturas y para
      Acciones, no para este. Poner la comprobación aquí habría sido
      inventar un requisito que nadie pidió y, peor, invitar a
      «arreglarlo» cambiando el criterio de otras veinte pantallas
      desde este arnés.

     node .arnes/avr-registrar.mjs
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

/* ---------------------------------------------------------------------
   4b. LA PANTALLA NO PUEDE MANDAR LA FECHA — leído del código.

   Se mide aquí además de en la pantalla porque es la regla entera: el
   día que alguien «arregle» algo volviendo a mandar `p_fecha`, esto se
   pone rojo antes de que una avería vuelva a poder fecharse a mano.
   ------------------------------------------------------------------ */
{
  const tsx = readFileSync(R("src/app/(app)/inventario/averias/Averias.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok(!/p_fecha/.test(tsx),
     "la pantalla todavía manda `p_fecha`: la fecha se podría volver a teclear");
  ok(!/p_ubicacion\b\s*:/.test(tsx),
     "la pantalla todavía manda `p_ubicacion` como texto en vez del id del maestro");
  ok(/p_ubicacion_id/.test(tsx), "no viaja el id de la ubicación");

  const sql = readFileSync(R("supabase/migraciones/2026-09-averias-ubicacion-y-turno.sql"), "utf8");
  ok(/drop function if exists public\.averia_registrar\(/.test(sql),
     "no se borra la función vieja: quedarían dos y la pantalla vieja seguiría guardando texto libre");
  ok(/drop function if exists public\.averia_corregir\(/.test(sql),
     "«corregir» se quedó con la firma vieja: el texto libre entraría por la puerta de atrás");
}

/* ------------------------- EL MONTAJE ------------------------- */
writeFileSync(R(".arnes/_nav-avr2.ts"),
  `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams("");`);

writeFileSync(R(".arnes/_supa-avr2.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    return { data: { id: "x", codigo: "AV-0001" }, error: null };
  },
});`);

writeFileSync(R(".arnes/_avr2-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Averias } from "../src/app/(app)/inventario/averias/Averias";

/* DOS CALLES, Y UNA CON MÓDULO DE UN SOLO LADO Y OTRA DE DOS: con
   todos iguales, «si el módulo no tiene lados se escoge solo» pasaría
   sin probar nada. */
const ubicaciones = [
  { id: "u1", clave: "A03_IZQ", calle: "A03", modulo: "M12", lado: "IZQ", activa: true },
  { id: "u2", clave: "A03_DER", calle: "A03", modulo: "M12", lado: "DER", activa: true },
  { id: "u3", clave: "A03_M13", calle: "A03", modulo: "M13", lado: null, activa: true },
  { id: "u4", clave: "B01_IZQ", calle: "B01", modulo: "M01", lado: "IZQ", activa: true },
];

/* CIEN PRODUCTOS: con siete, un desplegable nativo bastaba y el
   buscador no probaría nada. */
const productos = Array.from({ length: 100 }, (_, i) => ({
  sku: "SKU" + String(1000 + i),
  nombre: (i === 42 ? "Aguila Cero Lta 355Cc X 24" : "Producto de prueba " + i),
}));

const causales = [
  { clave: "transporte", nombre: "Avería transporte", externa: true, activo: true, orden: 1 },
  { clave: "deposito", nombre: "Avería depósito", externa: false, activo: true, orden: 2 },
];

createRoot(document.getElementById("r")!).render(
  <Averias lista={[]} causales={causales as any} productos={productos as any}
           ubicaciones={ubicaciones as any} puedeEditar manda
           quien="Administrador" modo="registrar" />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_avr2-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-avr2.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-avr2.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const fefo = readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
const avr = readFileSync(R("src/app/(app)/inventario/averias/averias.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

const monta = async (ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1200 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${fefo}${avr} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="fe avr" id="r"></div></main></div></div>
    <script>${js.replace(/<\/script/g, "\\u003c/script")}</script></body></html>`);
  await pg.waitForSelector(".avr .avr-form", { timeout: 10000 });
  await pg.evaluate(() => { window.llamadas = [] });
};

const sel = (n) => `.avr .avr-campos .avr-c:nth-of-type(${n}) select`;

/* =====================================================================
   1. LA UBICACIÓN, EN CASCADA
   ===================================================================== */
await monta();
ok(rotos.length === 0, `la pantalla tiró un error al montarse: ${rotos[0]}`);
{
  /* NO QUEDA NINGÚN CAMPO DE TEXTO LIBRE PARA LA UBICACIÓN. */
  ok((await pg.$$(".avr datalist")).length === 0,
     "quedó el datalist de las ubicaciones tecleadas: la ubicación sigue siendo texto libre");

  const calles = await pg.$$eval(`${sel(1)} option`, (o) => o.map((x) => x.textContent.trim()));
  ok(calles.includes("A03") && calles.includes("B01"),
     `el desplegable de calles no trae el maestro: ${calles.join(", ")}`);

  ok(await pg.isDisabled(sel(2)),
     "el módulo está encendido sin haber escogido calle: se toca tres veces sin entender");
  ok(await pg.isDisabled(sel(3)), "el lado está encendido sin haber escogido módulo");
  ok(/calle primero/i.test(await pg.textContent(sel(2))),
     "el módulo apagado no dice qué falta");

  await pg.selectOption(sel(1), "A03");
  const mods = await pg.$$eval(`${sel(2)} option`, (o) => o.map((x) => x.value).filter(Boolean));
  ok(mods.length === 2 && mods.includes("M12") && mods.includes("M13"),
     `al escoger A03 salen ${mods.length} módulos: ${mods.join(", ")}`);
  ok(!(await pg.isDisabled(sel(2))), "con la calle puesta el módulo sigue apagado");

  /* UN MÓDULO SIN LADOS SE ESCOGE SOLO: pedir «escoge el lado» donde no
     hay lados es pedir algo que no existe. */
  await pg.selectOption(sel(2), "M13");
  ok(await pg.inputValue(sel(3)) === "u3",
     "el módulo de un solo lado no se escogió solo: pide escoger algo que no hay");
  ok(await pg.isDisabled(sel(3)), "con un solo lado, el desplegable debería quedar apagado");

  /* Y UNO CON DOS LADOS SÍ PIDE ESCOGER. */
  await pg.selectOption(sel(2), "M12");
  ok(await pg.inputValue(sel(3)) === "",
     "con dos lados se escogió uno solo: alguien registraría en el lado equivocado sin mirar");
  ok(!(await pg.isDisabled(sel(3))), "con dos lados el desplegable quedó apagado");
  const lados = await pg.$$eval(`${sel(3)} option`, (o) => o.map((x) => x.textContent.trim()));
  ok(lados.includes("IZQ") && lados.includes("DER"), `los lados salen mal: ${lados.join(", ")}`);

  /* CAMBIAR DE CALLE LIMPIA LO DE ABAJO: si no, queda un módulo de la
     calle vieja puesto sobre la calle nueva y se guarda un sitio que no
     existe. */
  await pg.selectOption(sel(3), "u1");
  await pg.selectOption(sel(1), "B01");
  ok(await pg.inputValue(sel(2)) === "" && await pg.inputValue(sel(3)) === "",
     "al cambiar de calle se quedó el módulo y el lado de la calle anterior");
}

/* =====================================================================
   3. EL PRODUCTO SE BUSCA — Y POR CÓDIGO
   ===================================================================== */
{
  ok((await pg.$$(".avr .avr-campos select[value]")).length === 0, "");
  ok((await pg.$$(".avr .bl")).length === 1,
     "no está el buscador de producto: con cien productos un desplegable es treinta pantallazos");

  await pg.click(".avr .bl-campo");
  await pg.fill(".avr .bl-teclea", "355");
  await pg.waitForTimeout(60);
  const porNombre = await pg.$$eval(".avr .bl-op b", (e) => e.map((x) => x.textContent));
  ok(porNombre.some((t) => /355Cc/.test(t)),
     `buscar «355» en mitad del nombre no encontró nada: ${porNombre.slice(0, 2).join(" | ")}`);

  await pg.fill(".avr .bl-teclea", "SKU1042");
  await pg.waitForTimeout(60);
  const porCodigo = await pg.$$eval(".avr .bl-op b", (e) => e.map((x) => x.textContent));
  ok(porCodigo.length === 1 && /355Cc/.test(porCodigo[0]),
     `buscar por el CÓDIGO de la estiba no encontró el producto: ${porCodigo.join(" | ")}`);
  await pg.click(".avr .bl-op");
  /* SE ESPERA A QUE LA LISTA SE CIERRE. Sin esto el arnés leía el campo
     medio paso antes de que React lo volviera a pintar y se ponía rojo
     por su propia prisa — una medición que miente en ROJO cuesta más
     que una que miente en verde. */
  await pg.waitForSelector(".avr .bl-campo.on", { timeout: 3000 });
  ok(/355Cc/.test(await pg.textContent(".avr .bl-campo")),
     "al escoger, el campo no muestra lo escogido: se vuelve a llenar");
}

/* =====================================================================
   4 y 5. LA FECHA YA NO SE TECLEA, Y SE DICE QUÉ SE GUARDA
   ===================================================================== */
{
  const fechas = await pg.$$eval(".avr .avr-campos input[type=date]",
    (e) => e.map((x) => x.closest(".avr-c")?.querySelector("span")?.textContent ?? "?"));
  ok(!fechas.some((t) => /día en que pasó/i.test(t)),
     `quedó el campo «día en que pasó»: ${fechas.join(", ")}`);

  const sello = await pg.textContent(".avr .avr-sello");
  ok(/fecha/i.test(sello) && /hora/i.test(sello) && /turno/i.test(sello),
     `no se dice que se guarda con fecha, hora y turno: «${sello.trim().slice(0, 70)}»`);

  /* «PASÓ ANTES» ESCONDIDO HASTA QUE ALGUIEN LO PIDA. */
  ok((await pg.$$(".avr .avr-antes input[type=date]")).length === 0,
     "«pasó antes» sale siempre: es el caso raro y vuelve a poner un campo de fecha a la vista");
  await pg.click(".avr .avr-enlace");
  await pg.waitForTimeout(40);
  const antes = await pg.$(".avr .avr-antes input[type=date]");
  ok(Boolean(antes), "el enlace de «pasó antes» no abre nada");
  const max = await pg.getAttribute(".avr .avr-antes input[type=date]", "max");
  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }))
    .toLocaleDateString("en-CA");
  ok(max < hoy, `«pasó antes» acepta hoy o después (max=${max}, hoy=${hoy}): eso no es «antes»`);
}

/* =====================================================================
   2. LO QUE VIAJA ES EL ID
   ===================================================================== */
{
  await pg.selectOption(sel(1), "A03");
  await pg.selectOption(sel(2), "M12");
  await pg.selectOption(sel(3), "u2");
  await pg.fill(".avr .avr-campos input[type=number]", "5");
  await pg.click(".avr .avr-seg button");

  const btn = [...await pg.$$(".avr .btn, .avr button")]; // el de guardar dice «Registrar»
  for (const b of btn) {
    const t = (await b.textContent()) ?? "";
    if (/registrar|guardar/i.test(t) && !(await b.isDisabled())) { await b.click(); break }
  }
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 3000 })
    .catch(() => {});
  const ls = await pg.evaluate(() => window.llamadas ?? []);
  const r = ls.find((l) => l.f === "averia_registrar");
  ok(Boolean(r), `no se llamó a averia_registrar: ${ls.map((l) => l.f).join(", ") || "nada"}`);
  ok(r?.a?.p_ubicacion_id === "u2",
     `viajó «${r?.a?.p_ubicacion_id}» y debía viajar el id del maestro (u2)`);
  ok(!("p_fecha" in (r?.a ?? {})),
     "¡todavía viaja p_fecha! La fecha se puede seguir poniendo desde la pantalla");
  ok(!("p_ubicacion" in (r?.a ?? {})),
     "todavía viaja la ubicación como texto");
  console.log(`\nllamada: averia_registrar(ubicacion_id=${r?.a?.p_ubicacion_id}, ` +
              `sku=${r?.a?.p_sku}, sin p_fecha)`);
}

/* =====================================================================
   6. EL DEDO, LOS ANCHOS Y QUE NADA SE SALGA
   ===================================================================== */
console.log("\nancho    se sale         toque");
for (const ancho of [1440, 820, 390, 360]) {
  await monta(ancho);
  const m = await pg.evaluate((a) => {
    const recortado = (e) => {
      for (let p = e.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible") return true;
      }
      return false;
    };
    const fuera = [...document.querySelectorAll(".avr *")]
      .filter((e) => e.getBoundingClientRect().width > 0
                     && e.getBoundingClientRect().right > a + .5 && !recortado(e))
      .map((e) => e.className || e.tagName);
    const tocables = [...document.querySelectorAll(
      ".avr .avr-campos select, .avr .bl-campo, .avr .avr-enlace")]
      .map((e) => { const r = e.getBoundingClientRect();
                    return { n: e.className, px: Math.round(Math.min(r.width, r.height)) } })
      .filter((x) => x.px > 0).sort((x, y) => x.px - y.px);
    return {
      fuera: [...new Set(fuera)].slice(0, 3),
      lado: document.documentElement.scrollWidth > a + 1,
      toque: tocables[0] ?? { n: "—", px: 0 },
    };
  }, ancho);

  console.log(`${String(ancho).padEnd(8)} ` +
    `${(m.lado || m.fuera.length ? (m.fuera.join(", ") || "sí") : "nada").padEnd(15)} ` +
    `${String(m.toque.px).padStart(4)} px`);

  if (m.lado || m.fuera.length)
    fallas.push(`a ${ancho} px se sale: ${m.fuera.join(", ") || "la página entera"}`);
  if (m.toque.px < 44)
    fallas.push(`a ${ancho} px «${m.toque.n}» se toca en ${m.toque.px} px y con guante hacen falta 44`);
}

await monta(1440);
await pg.screenshot({ path: R(".arnes/_avr-registrar.png"), fullPage: true });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ Averías: la ubicación sale del maestro en cascada y viaja su ID, cambiar de " +
            "calle limpia lo de abajo, el producto se busca por nombre Y por código, «día en " +
            "que pasó» no existe y no viaja ninguna fecha, se dice que se guarda con fecha, " +
            "hora y turno, y nada se sale en ninguno de los cuatro anchos.");
