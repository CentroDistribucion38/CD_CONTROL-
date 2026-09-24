/* =====================================================================
   LA BIFURCACIÓN DE INVENTARIO — medida, no mirada.

   POR QUÉ EXISTE ESTA PANTALLA. «Le doy a Conteos y no me sale nada.»
   No salía nada porque /inventario ERA el tablero de FEFO: entrar al
   módulo era entrar ya a Conteos, y la pantalla donde se escoge rama no
   existía. No daba error, no avisaba — salía una pantalla cualquiera
   donde debía estar la portada. El tablero se mudó a
   /inventario/tablero y aquí quedó la bifurcación.

   QUÉ SE COMPRUEBA Y POR QUÉ:

   1. QUE LAS DOS TARJETAS LLEVEN A OTRA PARTE. Una tarjeta que apunta a
      la pantalla donde está la tarjeta es un botón que no lleva a ningún
      lado, y se ve exactamente igual que uno que sí.

   2. QUE LOS DOS NÚMEROS QUEDEN A LA MISMA ALTURA. Es lo que se lee de
      un barrido; desalineados hay que buscarlos de uno en uno. En la
      portada de Quiebra esto lo cazó el arnés y no el ojo: la
      diferencia era de 18 px y parecía un descuido de espaciado.

   3. QUE LA PANTALLA DIGA QUE LAS DOS CIFRAS NO SE RESTAN. La tentación
      es «contadas − averiadas = buenas», y está mal por dos lados: la
      avería sigue en su posición y YA ESTÁ DENTRO de lo contado, y las
      dos cifras ni siquiera son del mismo momento. Una portada que pone
      dos números juntos sin decir eso está invitando a la resta.

   4. QUE NADA SE SALGA a 1440 / 820 / 390 / 360.

   5. CONTRASTE EN LOS SIETE TEMAS.

   6. QUE EL DEDO ALCANCE: 44 px con guante.

   Se monta EL COMPONENTE DE VERDAD, no una copia del HTML: una copia se
   queda vieja en silencio el día que alguien toque la pantalla.

     node .arnes/inv-portada.mjs
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => new URL("../" + p, import.meta.url).pathname;

const glob = readFileSync(U("../src/app/globals.css"), "utf8");
const shell = readFileSync(U("../src/app/(app)/shell.css"), "utf8");
const fefo = readFileSync(U("../src/app/(app)/inventario/fefo.css"), "utf8");
const port = readFileSync(U("../src/app/(app)/inventario/portada.css"), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [820, "tableta"], [390, "celular"], [360, "360"]];

const fallas = [];

/* =====================================================================
   EL COMPONENTE ES UN SERVER COMPONENT ASÍNCRONO: devuelve una promesa
   de JSX. Se le cambian por debajo los dos módulos que tocan la red
   —los permisos y el cliente de Supabase— y se espera lo que devuelve.

   ASÍ SE PRUEBA LA PANTALLA Y NO UNA MAQUETA. Las cifras, los pies, los
   enlaces y el aviso salen del archivo que se va a subir.
   ===================================================================== */
writeFileSync(U("./_portada-falso-permisos.ts"), `
export const misPermisos = async () => ({
  rol: "supervisor", nombreRol: "Supervisor", manda: false,
  nivel: () => "editar", puedeVer: () => true, puedeEditar: () => true,
  modulos: [], falta: false,
});
`);

/* EL CLIENTE FALSO CONTESTA POR TABLA. Encadena igual que el de verdad
   —select().eq().order().limit()— y lo que devuelve al final es lo que
   se le pidió; así la pantalla no sabe que no está hablando con nadie. */
writeFileSync(U("./_portada-falso-supabase.ts"), `
const DATOS: Record<string, unknown[]> = (globalThis as any).__DATOS__;
function cadena(tabla: string) {
  const api: any = {
    select: () => api, eq: () => api, is: () => api, order: () => api,
    limit: () => Promise.resolve({ data: DATOS[tabla] ?? [], error: null }),
    then: (f: any) => Promise.resolve({ data: DATOS[tabla] ?? [], error: null }).then(f),
  };
  return api;
}
export const createClient = async () => ({ from: (t: string) => cadena(t) });
`);

/* Un <Link> que es un <a>. El de Next arrastra el enrutador entero. */
writeFileSync(U("./_enlace.tsx"), `
export default function Link(p: any) { const { href, ...r } = p; return <a href={href} {...r} /> }
`);

writeFileSync(U("./_portada-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import Portada from "@/app/(app)/inventario/page";
(async () => {
  const el = await (Portada as any)();
  createRoot(document.getElementById("r")!).render(el);
})();
`);

let js = "";
try {
  js = buildSync({
    entryPoints: [R(".arnes/_portada-entrada.tsx")], bundle: true, format: "iife",
    platform: "browser", jsx: "automatic", write: false,
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": R("src"),
      "@/lib/permisos": R(".arnes/_portada-falso-permisos.ts"),
      "@/lib/supabase/server": R(".arnes/_portada-falso-supabase.ts"),
      "next/link": R(".arnes/_enlace.tsx"),
    },
    loader: { ".css": "empty" },
    logLevel: "silent",
  }).outputFiles[0].text;
} catch (e) {
  fallas.push(`la portada ni siquiera se puede empaquetar: ${String(e).slice(0, 300)}`);
}

/* LOS DATOS DE PRUEBA TRAEN LOS DOS PIES LARGOS A PROPÓSITO. Con un pie
   de una línea y otro de dos es cuando los números se desalinean — con
   dos pies cortos la prueba de la altura pasaría sin probar nada. */
const DATOS = {
  v_conteos_fefo: [{
    codigo: "FEFO-2026-09-18-A", fecha_analisis: "2026-09-18",
    enviado_en: new Date(Date.now() - 3 * 86400000).toISOString(),
    total_cajas: 12483, ubicaciones: 214,
  }],
  v_averias: [
    { cajas: 84, dias_baja: 41 }, { cajas: 12, dias_baja: 6 }, { cajas: 7, dias_baja: null },
  ],
};

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pag = await navegador.newPage();

const montar = async (tema, ancho) => {
  await pag.setViewportSize({ width: ancho, height: 1000 });
  await pag.setContent(`<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}><head>
    <meta charset="utf-8"><style>${glob}${shell}${fefo}${port} html,body{margin:0}</style></head>
    <body><div class="sh flex min-h-screen flex-col"><div class="sh-marco sin-riel">
    <main class="sh-main"><div id="r"></div></main></div></div>
    <script>window.__DATOS__ = ${JSON.stringify(DATOS)};</script>
    <script>${js.replace(/<\/script/g, "<\\/script")}</script></body></html>`);
  await pag.waitForSelector(".inv-rama", { timeout: 10000 }).catch(() => {});
};

const rotos = [];
pag.on("pageerror", (e) => rotos.push(e.message));

if (js) {
  await montar(null, 1440);
  if (rotos.length) fallas.push(`la portada tiró un error al montarse: ${rotos[0]}`);

  /* ---------- 1. LAS DOS TARJETAS, Y ADÓNDE LLEVAN ---------- */
  const tarjetas = await pag.evaluate(() => [...document.querySelectorAll(".inv-rama")].map((a) => ({
    href: a.getAttribute("href"),
    nombre: a.querySelector(".inv-nom")?.textContent ?? "",
    rot: a.querySelector(".inv-rot")?.textContent ?? "",
    cifra: a.querySelector(".inv-cifra b")?.textContent ?? "",
    unidad: a.querySelector(".inv-cifra i")?.textContent ?? "",
    pie: a.querySelector(".inv-cifra em")?.textContent ?? "",
    /* LA Y DEL NÚMERO, que es lo que se compara. */
    y: Math.round(a.querySelector(".inv-cifra b")?.getBoundingClientRect().top ?? 0),
    mal: !!a.querySelector(".inv-cifra.mal"),
    entrar: Math.round(a.querySelector(".inv-entrar")?.getBoundingClientRect().height ?? 0),
  })));

  if (tarjetas.length !== 2)
    fallas.push(`la portada pinta ${tarjetas.length} tarjeta(s) y deben ser dos: conteos y averías`);

  for (const t of tarjetas) {
    if (!t.href || t.href === "/inventario")
      fallas.push(`la tarjeta «${t.nombre.trim()}» lleva a «${t.href}», que es esta misma ` +
                  "pantalla: es un botón que no lleva a ningún lado");
    if (!t.cifra)
      fallas.push(`la tarjeta «${t.nombre.trim()}» no trae cifra: una portada que solo repite ` +
                  "dos nombres es un clic de peaje");
    if (t.entrar < 44)
      fallas.push(`«Entrar» de «${t.nombre.trim()}» mide ${t.entrar} px y con guante hacen falta 44`);
  }

  /* ---------- 2. LOS DOS NÚMEROS A LA MISMA ALTURA ---------- */
  if (tarjetas.length === 2) {
    const d = Math.abs(tarjetas[0].y - tarjetas[1].y);
    if (d > 2)
      fallas.push(`los dos números están a ${d} px de altura distinta: el número es lo que se ` +
                  "lee de un barrido y desalineados hay que buscarlos de uno en uno " +
                  "(le falta el alto reservado al pie)");
  }

  /* ---------- 3. NO SE RESTAN, Y LA PANTALLA LO DICE ---------- */
  const texto = (await pag.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  if (!/no se restan/i.test(texto) || !/ya está contada/i.test(texto))
    fallas.push("la portada pone las dos cifras juntas y NO dice que no se restan: " +
                "«contadas − averiadas = buenas» está mal por dos lados —la avería ya está " +
                "dentro de lo contado, y las dos cifras no son del mismo momento—");

  /* ---------- 4. LA CIFRA EN ROJO CUANDO TOCA ---------- */
  /* La avería más vieja del fixture lleva 41 días esperando la baja: es
     justo el problema que esta rama existe para destapar —la caja sigue
     sumando en el inventario y el conteo sigue cuadrando contra algo
     que ya no se vende—. Si no se pinta, no avisa de nada. */
  const av = tarjetas.find((t) => /aver/i.test(t.nombre));
  if (av && !av.mal)
    fallas.push("hay una avería esperando la baja hace 41 días y la cifra no sale marcada");
  const co = tarjetas.find((t) => /conteo/i.test(t.nombre));
  if (co && co.mal)
    fallas.push("el último conteo es de hace 3 días y la cifra sale marcada como problema: " +
                "marcar lo normal es cómo se deja de mirar lo marcado");

  console.log("\ntarjeta    lleva a                    cifra            pie");
  for (const t of tarjetas)
    console.log(`${t.nombre.trim().padEnd(10)} ${String(t.href).padEnd(26)} ` +
                `${(t.cifra + " " + t.unidad).padEnd(16)} ${t.pie.trim()}`);

  /* ---------- 5. CONTRASTE EN LOS SIETE TEMAS ---------- */
  const PARES = [
    ["nombre", ".inv-rama .inv-nom", ".inv-rama"],
    ["descripción", ".inv-rama .inv-des", ".inv-rama"],
    ["pie cifra", ".inv-rama .inv-cifra em", ".inv-rama"],
    ["unidad", ".inv-rama .inv-cifra i", ".inv-rama"],
    ["rótulo", ".inv-rama .inv-rot", ".inv-rama"],
    ["bajada", ".inv-cabeza .sub", "main"],
    ["ojo", ".inv-cabeza .ojo", "main"],
  ];
  console.log("\ntema      " + PARES.map((p) => p[0].padStart(12)).join(""));
  for (const tema of TEMAS) {
    await montar(tema, 1440);
    const r = await pag.evaluate((pares) => {
      const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const fondoDe = (el) => {
        let n = el;
        while (n) {
          const c = getComputedStyle(n).backgroundColor;
          const p = rgb(c);
          if (p.length === 3 && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return p;
          n = n.parentElement;
        }
        return [255, 255, 255];
      };
      return pares.map(([, sel]) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const a = lum(rgb(getComputedStyle(el).color));
        const b = lum(fondoDe(el));
        return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
      });
    }, PARES);
    console.log((tema ?? "oficial").padEnd(10) +
      r.map((v) => String(v ?? "—").padStart(12)).join(""));
    r.forEach((v, i) => {
      if (v == null) fallas.push(`no existe «${PARES[i][0]}» (${PARES[i][1]}) en el tema ${tema ?? "oficial"}`);
      else if (v < 4.5) fallas.push(`«${PARES[i][0]}» contrasta ${v} en el tema ${tema ?? "oficial"} y el piso es 4,5`);
    });
  }

  /* ---------- 6. NADA SE SALE ---------- */
  console.log("\nancho    se sale    tarjetas por fila   entrar");
  for (const [w, nom] of ANCHOS) {
    await montar(null, w);
    const m = await pag.evaluate((ancho) => {
      /* LO QUE ESTÁ RECORTADO POR UN `overflow: hidden` NO SE SALE.
         El adorno de la esquina de cada tarjeta está puesto a propósito
         fuera del borde y la tarjeta lo recorta: medir su rectángulo lo
         acusaba de irse de lado a 820 px cuando no se ve ni un píxel de
         él. Una aserción que se pone roja por eso no prueba nada y se
         acaba desactivando, que es peor. */
      const recortado = (e) => {
        let n = e.parentElement;
        while (n && n !== document.body) {
          const o = getComputedStyle(n);
          if (o.overflow === "hidden" || o.overflowX === "hidden") {
            if (e.getBoundingClientRect().right > n.getBoundingClientRect().right - 1) return true;
          }
          n = n.parentElement;
        }
        return false;
      };
      const fuera = [...document.querySelectorAll("main *")]
        .filter((e) => e.getBoundingClientRect().right > ancho + 1 && !recortado(e))
        .map((e) => e.className || e.tagName);
      const cajas = [...document.querySelectorAll(".inv-rama")].map((e) => Math.round(e.getBoundingClientRect().top));
      return {
        fuera: [...new Set(fuera)].slice(0, 3),
        lado: document.documentElement.scrollWidth > ancho + 1,
        porFila: new Set(cajas).size === 1 ? 2 : 1,
        entrar: Math.round(document.querySelector(".inv-entrar")?.getBoundingClientRect().height ?? 0),
      };
    }, w);
    console.log(`${nom.padEnd(8)} ${(m.lado || m.fuera.length ? m.fuera.join(", ") || "sí" : "nada").padEnd(10)} ` +
                `${String(m.porFila).padStart(17)}   ${String(m.entrar).padStart(6)}`);
    if (m.lado || m.fuera.length)
      fallas.push(`a ${w} px la portada se sale de lado: ${m.fuera.join(", ") || "la página entera"}`);
    if (m.entrar < 44)
      fallas.push(`a ${w} px «Entrar» mide ${m.entrar} px y con guante hacen falta 44`);
    /* EN EL CELULAR, UNA DEBAJO DE OTRA. Dos tarjetas de 150 px de ancho
       cada una es una portada que no se puede leer con el pulgar. */
    if (w <= 390 && m.porFila !== 1)
      fallas.push(`a ${w} px las dos tarjetas van en la misma fila`);
  }

  /* ---------- 7. SIN PERMISO EN NINGUNA RAMA, SE DICE QUÉ HACER ---------- */
  /* Quien llega a una portada vacía no tiene forma de adivinar que es
     cosa de permisos, y se queda pensando que la app está rota. */
  const pagina = readFileSync(U("../src/app/(app)/inventario/page.tsx"), "utf8");
  if (!/Administración → Roles/.test(pagina))
    fallas.push("si el rol no tiene ninguna rama abierta, la portada no dice dónde se arregla");
  if (!/permisos\.puedeVer\(s\.ruta\)/.test(pagina))
    fallas.push("la portada pinta tarjetas que el rol no puede abrir: manda a alguien a " +
                "estrellarse contra un «no tienes permiso»");
}

/* DOS CAPTURAS Y NO UNA. Esta sesión lleva tres errores que los arneses
   dejaron pasar y destapó una captura; y el ancho importa: el adorno
   rosado que cruzaba la descripción se veía en el celular, y la
   desalineación de los números solo se ve en el PC. */
await montar(null, 1440);
await pag.screenshot({ path: R(".arnes/_inv-portada.png"), fullPage: true });
await montar(null, 390);
await pag.screenshot({ path: R(".arnes/_inv-portada-celular.png"), fullPage: true });
await navegador.close();

console.log("");
if (fallas.length) {
  for (const f of fallas) console.log("✘ " + f);
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ La bifurcación de Inventario: las dos tarjetas llevan a otra parte, los dos " +
            "números quedan a la misma altura, se dice que no se restan, contrasta en los 7 " +
            "temas y a 390 px van una debajo de otra.");
