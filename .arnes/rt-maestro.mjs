/* =====================================================================
   EL MAESTRO DE EN SITIO, CON LA LISTA DE TRASPASOS — medido.

   «Mira el maestro de traspaso… que sea así, y quita Materiales.
    Los bordes más rectangulares porque todo está así.»

   QUÉ SE COMPRUEBA Y POR QUÉ:

   1. QUE «MATERIALES» YA NO ESTÉ. Los materiales salen del maestro de
      INVENTARIO desde que el desplegable pasó de siete a 494. Esa
      pestaña quedó apuntando a una tabla que ya nadie llena y salía en
      cero: no es una pestaña vacía, es una pestaña que MIENTE sobre
      dónde se agregan.

   2. QUE NADA QUEDE REDONDO. Ni en el módulo ni en la lista del
      maestro. Lo redondo venía de la plantilla con la que nació el
      repositorio — no era una decisión.
      LOS CÍRCULOS SE QUEDAN: un punto de color, una inicial y el riel
      del interruptor son redondos POR LO QUE SON. Cuadrar el riel lo
      convierte en una casilla, y una casilla y un interruptor no
      significan lo mismo: una escoge, el otro prende.

   3. QUE EL INTERRUPTOR ESTÉ A LA VISTA Y «BORRAR» NO. Apagar es lo
      que se hace casi siempre; borrar es irreversible. Tenerlos del
      mismo tamaño y al lado es cómo se toca el que no era.

   4. QUE LA CUENTA DE USO SE VEA SIEMPRE, no solo cuando es cero: es
      lo que decide si se puede borrar, y tiene que verse ANTES de
      abrir el menú.

   5. QUE EL DEDO ALCANCE y que nada se salga a 1440/820/390/360.

     node .arnes/rt-maestro.mjs
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
   1. «MATERIALES» SE FUE — se lee del archivo, no se adivina
   ------------------------------------------------------------------ */
{
  const pg = readFileSync(R("src/app/(app)/roturas/en-sitio/maestro/page.tsx"), "utf8");
  const hojas = (pg.match(/hojas=\{\[([^\]]*)\]\}/) ?? ["", ""])[1];
  ok(!/materiales/.test(hojas),
     `el maestro de en sitio sigue ofreciendo «materiales»: ${hojas.trim()}`);
  ok(/procesos/.test(hojas) && /areas/.test(hojas) && /causas/.test(hojas),
     `faltan hojas: ${hojas.trim()}`);
  /* Y SE DICE DÓNDE ESTÁN AHORA. Quitar la pestaña sin decir a dónde
     se fueron deja a alguien buscándola. */
  ok(/maestro de Inventario/i.test(pg),
     "se quitó la pestaña de materiales y no se dice dónde se agregan ahora");
}

/* ---------------------------------------------------------------------
   2. NADA REDONDO — se lee del CSS
   ------------------------------------------------------------------ */
for (const [arch, nom] of [["src/app/(app)/roturas/roturas.css", "roturas.css"]]) {
  /* FUERA LOS COMENTARIOS ANTES DE MEDIR. Este proyecto explica cada
     regla, y la explicación de por qué algo dejó de ser redondo lleva
     escrito «border-radius: 14px» en la prosa: el arnés lo leía como
     una regla de verdad y se ponía rojo por su propio texto. */
  const css = readFileSync(R(arch), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const malos = [...css.matchAll(/border-radius:\s*([^;}]+)/g)]
    .map((m) => m[1].trim())
    .filter((v) => !/^0$/.test(v) && !/50%/.test(v));
  ok(malos.length === 0,
     `${nom} tiene ${malos.length} esquina(s) redondeada(s): ${[...new Set(malos)].join(", ")}`);
}

/* ---------------------------------------------------------------------
   3–5. LA PANTALLA, EN CHROMIUM
   ------------------------------------------------------------------ */
writeFileSync(R(".arnes/_nav-mae.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-mae.ts"), `export const createClient = () => ({
  from: () => ({
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
    insert: async () => ({ error: null }),
  }),
});`);

writeFileSync(R(".arnes/_mae-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Maestro } from "../src/app/(app)/roturas/Maestro";

const proc = (c, n, a = true) => ({ clave: c, nombre: n, activo: a, orden: 0 });
const procesos = [proc("lineas", "Líneas"), proc("t1", "T1"),
                  proc("traspaso", "Traspaso"), proc("sorting", "Sorting", false)];
const areas = [proc("plazoleta", "Plazoleta"), proc("calle_f", "Calle F")];
const causas = [
  { clave: "estibas_malas", nombre: "Estibas en mal estado", activo: true,
    grupo: "asumida", exige_foto: false, orden: 1 },
  { clave: "falla_maquinas", nombre: "Falla de las máquinas", activo: true,
    grupo: "no_asumida", exige_foto: true, orden: 2 },
];
/* USOS DE VERDAD: uno con cero —que SÍ se puede borrar— y otro con
   muchos —que no—. Con todos en cero, «borrar solo aparece cuando
   nadie lo usó» pasaría sin probar nada. */
const uso = {
  materiales: {}, tolvas: {},
  procesos: { lineas: 159, t1: 0, traspaso: 46, sorting: 0 },
  areas: { plazoleta: 11, calle_f: 0 },
  causas: { estibas_malas: 4, falla_maquinas: 0 },
};
createRoot(document.getElementById("r")!).render(
  <Maestro hojas={["procesos", "areas", "causas"]}
           materiales={[]} procesos={procesos as any} areas={areas as any}
           causas={causas as any} tolvas={[]} uso={uso as any} puedeEditar />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_mae-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-mae.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-mae.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho = 1440, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: 1100 });
  await pg.setContent(`<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}>
    <head><meta charset="utf-8"><style>${glob}${shell}${css} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>${js.replace(/<\/script/g, "\\u003c/script")}</script></body></html>`);
  await pg.waitForSelector(".rt .ml-item", { timeout: 10000 });
};
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

await monta();
ok(rotos.length === 0, `el maestro tiró un error al montarse: ${rotos[0]}`);

/* ---------- LAS PESTAÑAS ---------- */
{
  const pes = await pg.$$eval(".rt .filtros .btn", (b) => b.map((x) => x.textContent.trim()));
  ok(!pes.some((t) => /material/i.test(t)),
     `«Materiales» sigue en las pestañas: ${JSON.stringify(pes)}`);
  ok(pes.length === 3, `salen ${pes.length} pestañas y deben ser tres: ${JSON.stringify(pes)}`);
  console.log(`\npestañas: ${pes.join(" · ")}`);
}

/* ---------- 3. EL INTERRUPTOR A LA VISTA, «BORRAR» NO ---------- */
{
  const filas = await pg.$$(".rt .ml-item");
  ok(filas.length === 4, `salen ${filas.length} renglones y el fixture trae cuatro procesos`);

  ok((await pg.$$(".rt .ml-item .ml-sw input")).length === 4,
     "no todos los renglones traen su interruptor a la vista");
  /* «BORRAR» NO PUEDE ESTAR EN EL RENGLÓN. Es irreversible y estaba
     del mismo tamaño que «Editar», que se toca a diario. */
  const sueltos = await pg.$$eval(".rt .ml-item", (f) =>
    f.flatMap((x) => [...x.querySelectorAll(":scope > *:not(.ml-mas) button")]
      .map((b) => b.textContent.trim())));
  ok(!sueltos.some((t) => /borrar/i.test(t)),
     `«Borrar» sigue suelto en el renglón: ${JSON.stringify(sueltos)}`);

  /* Y SE PUEDE ARRASTRAR: el orden de esta lista es el orden del
     desplegable al registrar. */
  ok((await pg.$$(".rt .ml-item .ml-asa")).length === 4, "no hay asa para arrastrar");
}

/* ---------- 4. LA CUENTA DE USO, SIEMPRE ---------- */
{
  const usos = await pg.$$eval(".rt .ml-item .ml-uso", (e) => e.map((x) => x.textContent.trim()));
  ok(usos.length === 4, `la cuenta de uso sale en ${usos.length} de 4 renglones`);
  ok(usos.some((t) => /159/.test(t)), `no sale la cuenta grande: ${JSON.stringify(usos)}`);
  ok(usos.every((t) => /rotura/.test(t)),
     `la cuenta no dice «rotura» —diría «viaje», que aquí sería mentira—: ${JSON.stringify(usos)}`);

  /* BORRAR SOLO EN LO QUE NADIE USÓ. Se comprueba abriendo los dos
     menús: el de un proceso con 159 roturas y el de uno con cero. */
  const abrir = async (n) => {
    await pg.click(`.rt .ml-item >> nth=${n} >> .ml-mas > button`);
    await pg.waitForSelector(".rt .ml-menu", { timeout: 3000 });
    const t = await pg.textContent(".rt .ml-menu");
    await pg.keyboard.press("Escape").catch(() => {});
    await pg.click("body", { position: { x: 5, y: 5 } }).catch(() => {});
    return t;
  };
  const conUso = await abrir(0);     // Líneas, 159 roturas
  ok(!/>Borrar</.test(conUso) && /No se puede borrar/.test(conUso),
     `el menú de un proceso con 159 roturas ofrece borrar: «${conUso.replace(/\s+/g, " ").trim()}»`);
  const sinUso = await abrir(1);     // T1, 0 roturas
  ok(/Borrar/.test(sinUso),
     `el menú de un proceso sin usar NO ofrece borrar: «${sinUso.replace(/\s+/g, " ").trim()}»`);
}

/* ---------- 2b. NADA REDONDO, MEDIDO EN LA PANTALLA ---------- */
{
  const curvos = await pg.evaluate(() => {
    const fuera = [];
    for (const el of document.querySelectorAll(".rt *")) {
      const r = getComputedStyle(el).borderTopLeftRadius;
      const n = parseFloat(r);
      /* Los porcentajes son los círculos —punto, inicial, rueda— y se
         quedan. Y el riel del interruptor mide 20 px a propósito. */
      if (r.includes("%") || !n) continue;
      if (el.matches(".ml-sw i")) continue;
      fuera.push((el.className || el.tagName) + " = " + r);
    }
    return [...new Set(fuera)].slice(0, 6);
  });
  ok(curvos.length === 0, `queda algo redondeado: ${curvos.join(" | ")}`);
  console.log(`esquinas redondeadas que quedan: ${curvos.length}`);
}

/* ---------- 5. EL DEDO, Y LOS ANCHOS ---------- */
console.log("\nancho    se sale    interruptor   menú «⋯»");
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
    const fuera = [...document.querySelectorAll(".rt *")]
      .filter((e) => e.getBoundingClientRect().width > 0
                     && e.getBoundingClientRect().right > a + .5 && !recortado(e))
      .map((e) => e.className || e.tagName);
    const sw = document.querySelector(".ml-sw input");
    const mas = document.querySelector(".ml-mas > button");
    return { fuera: [...new Set(fuera)].slice(0, 3),
             lado: document.documentElement.scrollWidth > a + 1,
             sw: sw ? Math.round(sw.getBoundingClientRect().height) : 0,
             mas: mas ? Math.round(mas.getBoundingClientRect().height) : 0 };
  }, ancho);
  console.log(`${String(ancho).padEnd(8)} ${(m.lado || m.fuera.length ? m.fuera.join(", ") || "sí" : "nada").padEnd(10)} ` +
              `${String(m.sw).padStart(11)} px ${String(m.mas).padStart(9)} px`);
  if (m.lado || m.fuera.length)
    fallas.push(`a ${ancho} px se sale: ${m.fuera.join(", ") || "la página entera"}`);
  /* EL INTERRUPTOR SE VE DE 22 px PERO SE TOCA EN 40: el riel se
     dibuja pequeño —así se ve un interruptor— y el <input> se estira
     por arriba y por abajo. Menos de eso no lo acierta un dedo con
     guante en la tableta del muelle. */
  if (m.sw < 40) fallas.push(`a ${ancho} px el interruptor se toca en ${m.sw} px y hacen falta 40`);
}

/* ---------- CONTRASTE EN LOS SIETE TEMAS ---------- */
const PARES = [["nombre", ".rt .ml-item .ml-nom b"], ["subtítulo", ".rt .ml-item .ml-nom span"],
               ["cuenta de uso", ".rt .ml-uso"], ["título", ".rt .ml-cab h2"],
               ["explicación", ".rt .ml-cab p"], ["contador", ".rt .ml-cab h2 em"]];
console.log("\ntema      " + PARES.map((p) => p[0].padStart(15)).join(""));
for (const tema of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, tema);
  const r = await pg.evaluate((pares) => {
    /* `color(srgb 0.98 …)` viene en 0–1 y NO en 0–255: así devuelve
       este Chromium un `color-mix()` ya resuelto. */
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
      if (!el) return 0;
      const a = lum(rgb(getComputedStyle(el).color)), b = lum(fondo(el));
      return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 100) / 100;
    });
  }, PARES);
  console.log((tema || "oficial").padEnd(10) + r.map((v) => String(v).padStart(15)).join(""));
  r.forEach((v, i) => {
    if (v === 0) fallas.push(`falta «${PARES[i][0]}» (${PARES[i][1]}) en el tema ${tema || "oficial"}`);
    else if (v < 4.5) fallas.push(`«${PARES[i][0]}» contrasta ${v} en el tema ${tema || "oficial"}`);
  });
}

await monta(1440);
await pg.screenshot({ path: R(".arnes/_rt-maestro.png"), fullPage: true });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ El maestro de en sitio: sin «Materiales» y diciendo dónde están, con la lista " +
            "de Traspasos —interruptor a la vista, «Borrar» en el menú y solo en lo que nadie " +
            "usó, y la cuenta de uso siempre—, todo cuadrado y legible en los 7 temas.");
