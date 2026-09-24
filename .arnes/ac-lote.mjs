/* =====================================================================
   ACCIONES · ESCOGER VARIAS Y ELIMINARLAS — medido.

   «Que al súper admin le permita eliminar una, varias o todas.»
   «Quítales el borde, ponlas más rectangulares.»

   ESTO BORRA HISTORIA. Una acción se lleva su hilo y sus fotos, y si
   estaba cerrada, se lleva algo que alguien ya verificó. Lo que tiene
   que ser cierto o la pantalla es peligrosa:

   1. QUE A QUIEN NO ADMINISTRA NI SIQUIERA LE SALGAN LAS CASILLAS. Una
      pantalla que ofrece algo y después la base lo niega convierte una
      regla correcta en un regaño.

   2. QUE «TODAS» SEA TODAS LAS QUE SE VEN. Con el filtro en «solo
      vencidas», marcar arriba y eliminar se llevaría las que no están
      en pantalla — y eso no se ve hasta después.

   3. QUE SE AVISE LO YA CERRADO ANTES DE CONFIRMAR: es historia que
      alguien verificó, no un error de dedo de esta mañana.

   4. QUE PIDA MOTIVO Y TECLEAR «ELIMINAR N», y que viaje UNA sola
      llamada con todos los ids: trescientas llamadas son trescientas
      formas de quedar a medias.

   5. QUE NO QUEDE NI UNA ESQUINA REDONDEADA en el módulo.

     node .arnes/ac-lote.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE: sin esto una excepción a
   mitad de camino deja la consola en blanco y parece que pasó. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

/* ---------------------------------------------------------------------
   5. NADA REDONDO — se lee del CSS, no se adivina
   ------------------------------------------------------------------ */
for (const arch of ["src/app/(app)/acciones/acciones.css",
                    "src/app/(app)/acciones/analisis/indicadores.css"]) {
  /* FUERA LOS COMENTARIOS ANTES DE MEDIR. Este proyecto explica cada
     regla, y la explicación de por qué algo dejó de ser redondo lleva
     escrito «border-radius: 14px» en la prosa: el arnés lo leía como
     una regla de verdad y se ponía rojo por su propio texto. */
  const css = readFileSync(R(arch), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const malos = [...css.matchAll(/border-radius:\s*([^;}]+)/g)]
    .map((m) => m[1].trim())
    .filter((v) => !/^0$/.test(v) && !/50%/.test(v));
  ok(malos.length === 0,
     `${arch.split("/").pop()} tiene ${malos.length} esquina(s) redondeada(s): ` +
     `${[...new Set(malos)].join(", ")}`);
}

writeFileSync(R(".arnes/_nav-acl.ts"),
  `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams("");`);
writeFileSync(R(".arnes/_supa-acl.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    return { data: (a?.p_ids ?? []).length, error: null };
  },
});`);
writeFileSync(R(".arnes/_link-acl.tsx"),
  `export default function Link(p: any) { const { href, ...r } = p; return <a href={href} {...r} /> }`);

writeFileSync(R(".arnes/_acl-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Todas } from "../src/app/(app)/acciones/Todas";

const base = (i, o = {}) => ({
  id: "a" + i, codigo: "AC-000" + i, tipo: "correctiva",
  titulo: "Pasillo obstruido " + i, descripcion: null,
  motivo: "orden", motivo_nombre: "Orden y aseo", motivo_critico: false,
  area: "almacenamiento", area_nombre: "Almacenamiento",
  zona: null, zona_nombre: null, zona_proceso: null, ubicacion: "Pasillo " + i,
  lat: null, lng: null, precision_m: null,
  prioridad: "media", plazo: null, vence_en: "2026-09-20T12:00:00Z",
  estado: "abierta", viva: true, vencida: true, horas_restantes: -50, dias: 2,
  equipo: null, equipo_nombre: null, responsable: null, sin_dueno: true,
  reportada_por: "u1", reportada_en: "2026-09-18T12:00:00Z", fotos: 0,
  que_se_hizo: null, cerrada_por: null, ...o,
});
/* CUATRO VIVAS Y DOS CERRADAS a propósito: con todas en el mismo
   estado, «se avisa lo ya cerrado» y «todas es todas LAS QUE SE VEN»
   pasarían sin probar nada —el filtro arranca en «abiertas»—. */
const acciones = [
  base(1), base(2), base(3), base(4),
  base(5, { estado: "cerrada", viva: false, vencida: false, que_se_hizo: "Se despejó" }),
  base(6, { estado: "cerrada", viva: false, vencida: false, que_se_hizo: "Se despejó" }),
];
createRoot(document.getElementById("r")!).render(
  <Todas acciones={acciones as any} nombres={{ u1: "Genesis Visbal" }}
         zonas={[]} motivos={[]} areas={[{ clave: "almacenamiento", nombre: "Almacenamiento" }]}
         plazos={{}} gente={[]} puedeEditar
         manda={(window as any).__MANDA__} />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_acl-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-acl.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-acl.ts"),
    "next/link": R(".arnes/_link-acl.tsx"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = readFileSync(R("src/app/(app)/acciones/acciones.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

const monta = async (manda = true, ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1100 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${css} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="ac" id="r"></div></main></div></div>
    <script>window.__MANDA__ = ${manda};</script>
    <script>${js.replace(/<\/script/g, "\\u003c/script")}</script></body></html>`);
  await pg.waitForSelector(".ac .fila", { timeout: 10000 });
  await pg.evaluate(() => { window.llamadas = [] });
};
const verTodas = async () => {
  await pg.selectOption(".ac .filtros select", "");
  await pg.waitForFunction(() => document.querySelectorAll(".ac .fila").length === 6,
                           null, { timeout: 3000 });
};

/* ---------- 1. SIN ADMINISTRAR, NI CASILLAS ---------- */
await monta(false);
ok(rotos.length === 0, `la pantalla tiró un error al montarse: ${rotos[0]}`);
ok((await pg.$$(".ac .ac-caja")).length === 0,
   "a quien no administra le salen las casillas de escoger");
ok((await pg.$$(".ac .ac-barra")).length === 0,
   "a quien no administra le sale la barra de eliminar");

/* ---------- 2. «TODAS» ES TODAS LAS QUE SE VEN ---------- */
await monta(true);
{
  const visibles = (await pg.$$(".ac .fila")).length;
  ok(visibles === 4, `el filtro arranca en «abiertas» y salen ${visibles}, deben ser 4`);

  await pg.click(".ac .ac-todas input");
  const marcadas = await pg.$$eval(".ac .ac-caja input", (e) => e.filter((x) => x.checked).length);
  ok(marcadas === 4, `«escoger todas» marcó ${marcadas} y en pantalla hay 4`);
  ok(/Eliminar 4/.test(await pg.textContent(".ac .ac-acc")),
     "el botón no dice cuántas se van a eliminar");
  /* Y LAS FILAS ESCOGIDAS SE VEN ESCOGIDAS: sin eso, la única señal es
     una casilla de 20 px al otro extremo de la pantalla. */
  const pintadas = await pg.$$eval(".ac .fila.ac-sel",
    (f) => f.filter((x) => getComputedStyle(x).boxShadow !== "none").length);
  ok(pintadas === 4, `${pintadas} filas se ven escogidas y hay 4 marcadas`);
}

/* ---------- 3. LO YA CERRADO SE AVISA ---------- */
{
  await verTodas();
  ok((await pg.$$(".ac .ac-acc")).length === 0,
     "al cambiar de filtro se quedó la selección de antes: se eliminaría a ciegas");
  await pg.click(".ac .ac-todas input");
  const t = await pg.textContent(".ac .ac-cuenta");
  ok(/6/.test(t), `con el filtro en «todas» debería escoger las 6 y dice «${t.trim()}»`);
  ok(/cerrada/i.test(t), `no se avisa que hay acciones ya cerradas: «${t.trim()}»`);
}

/* ---------- 4. MOTIVO, «ELIMINAR N» Y UNA SOLA LLAMADA ---------- */
{
  await pg.click(".ac .ac-acc .btn.mal");
  await pg.waitForSelector(".cf-caja", { timeout: 5000 });
  const bt = ".cf-caja .cf-btn.mal";

  ok(await pg.isDisabled(bt), "deja eliminar sin escribir el motivo");
  const dice = await pg.textContent(".cf-dice");
  ok(/hilo|fotos/i.test(dice), "no se dice que se van el hilo y las fotos");
  ok(/no se puede deshacer/i.test(dice), "no se dice que no se puede deshacer");
  ok(/anúlalas|anula/i.test(dice), "no se ofrece la salida buena: anular deja la fila");
  ok(/cerrad/i.test(dice), "el cuadro no avisa que hay cerradas entre las escogidas");

  await pg.fill(".pt-campo textarea", "Data de prueba del montaje");
  ok(await pg.isDisabled(bt), "con el motivo pero sin teclear la confirmación ya deja eliminar");
  ok(/ELIMINAR 6/.test(await pg.textContent(bt)),
     `el botón no dice qué hay que teclear: «${(await pg.textContent(bt)).trim()}»`);
  await pg.fill(".pt-copia input", "ELIMINAR 5");
  ok(await pg.isDisabled(bt), "acepta un número que no es el de las escogidas");
  await pg.fill(".pt-copia input", "ELIMINAR 6");
  ok(!(await pg.isDisabled(bt)), "con todo puesto el botón sigue apagado");

  await pg.click(bt);
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 3000 })
    .catch(() => {});
  const ls = await pg.evaluate(() => window.llamadas ?? []);
  ok(ls.length === 1, `viajaron ${ls.length} llamadas y debe ser UNA con todos los ids`);
  ok(ls[0]?.f === "accion_eliminar", `se llamó «${ls[0]?.f}»`);
  ok((ls[0]?.a?.p_ids ?? []).length === 6,
     `viajaron ${(ls[0]?.a?.p_ids ?? []).length} ids y deben ser 6`);
  ok((ls[0]?.a?.p_motivo ?? "").length >= 8,
     `no viajó el motivo: ${JSON.stringify(ls[0]?.a?.p_motivo)}`);
  console.log(`\nllamada: ${ls[0]?.f}(${(ls[0]?.a?.p_ids ?? []).length} ids, «${ls[0]?.a?.p_motivo}»)`);
}

/* ---------- EL DEDO, LOS ANCHOS Y QUE NADA SE SALGA ---------- */
console.log("\nancho    se sale    casilla   esquinas redondas");
for (const ancho of [1440, 820, 390, 360]) {
  await monta(true, ancho);
  await pg.click(".ac .ac-todas input");
  const m = await pg.evaluate((a) => {
    const recortado = (e) => {
      for (let p = e.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible") return true;
      }
      return false;
    };
    const fuera = [...document.querySelectorAll(".ac *")]
      .filter((e) => e.getBoundingClientRect().width > 0
                     && e.getBoundingClientRect().right > a + .5 && !recortado(e))
      .map((e) => e.className || e.tagName);
    const caja = document.querySelector(".ac-caja");
    const curvos = [...document.querySelectorAll(".ac *")].filter((e) => {
      const r = getComputedStyle(e).borderTopLeftRadius;
      return !r.includes("%") && parseFloat(r) > 0;
    }).map((e) => (e.className || e.tagName) + " = " + getComputedStyle(e).borderTopLeftRadius);
    return {
      fuera: [...new Set(fuera)].slice(0, 3),
      lado: document.documentElement.scrollWidth > a + 1,
      caja: caja ? Math.round(Math.min(caja.getBoundingClientRect().width,
                                       caja.getBoundingClientRect().height)) : 0,
      curvos: [...new Set(curvos)].slice(0, 4),
    };
  }, ancho);
  console.log(`${String(ancho).padEnd(8)} ${(m.lado || m.fuera.length ? m.fuera.join(", ") || "sí" : "nada").padEnd(10)} ` +
              `${String(m.caja).padStart(7)}   ${m.curvos.length ? m.curvos.join(" | ") : "0"}`);
  if (m.lado || m.fuera.length)
    fallas.push(`a ${ancho} px se sale: ${m.fuera.join(", ") || "la página entera"}`);
  /* 44 px DE ÁREA TOCABLE. Fallar el clic aquí significa marcar la fila
     de al lado en una pantalla cuyo botón siguiente dice «Eliminar». */
  if (m.caja < 44)
    fallas.push(`a ${ancho} px la casilla se toca en ${m.caja} px y con guante hacen falta 44`);
  if (m.curvos.length)
    fallas.push(`a ${ancho} px queda algo redondeado: ${m.curvos.join(" | ")}`);
}

await monta(true, 1440);
await pg.click(".ac .ac-todas input");
await pg.screenshot({ path: R(".arnes/_ac-lote.png"), fullPage: true });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ Acciones en lote: a quien no administra no le salen las casillas, «todas» es " +
            "todas LAS QUE SE VEN, se avisa lo ya cerrado, se exige motivo y teclear " +
            "«ELIMINAR N», viaja UNA sola llamada, y no queda ni una esquina redondeada.");
