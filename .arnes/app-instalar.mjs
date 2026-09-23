/* =====================================================================
   «NO ME SALE PARA DESCARGAR» — el botón de instalar, medido.

   EL FALLO ERA ESTE: el botón colgaba de `beforeinstallprompt`, el
   evento con el que Chrome avisa que puede instalar. Si el evento no
   llegaba, NO SE PINTABA NADA: ni botón, ni explicación, ni motivo. La
   persona se queda mirando una pantalla que no menciona la palabra
   instalar y concluye que la app no se puede instalar.

   Y ese evento no llega en un montón de casos normales: Safari no lo
   tiene, Chrome en iPhone tampoco —en iOS todos los navegadores son
   Safari por dentro—, y Chrome en Android lo dispara UNA vez por visita.

   POR QUÉ UN ARNÉS Y NO PROBARLO A MANO: haría falta un iPhone, un
   iPad, un Android y un computador, y probarlo otra vez cada vez que
   alguien toque este archivo. Aquí se monta el componente de verdad con
   la identificación de cada aparato y se mide qué sale.

   Y SE MIDE EL IPAD DISFRAZADO, que es el caso que de verdad se
   rompía: desde iPadOS 13 el iPad dice ser un Mac, así que buscar
   «ipad» en el texto da falso justo en el aparato en el que más se usa
   esto en la bodega.

   OJO CON LAS CAPTURAS que deja este arnés: la ventana de pasos se
   maqueta con clases de Tailwind, y Tailwind entra por un @import que
   aquí no se resuelve. Salen sin estilo a propósito. Lo que este arnés
   mide es QUÉ DICE cada una, no cómo se ve; para lo segundo está la app.

     node .arnes/app-instalar.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => U("../" + p).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* LOS CINCO APARATOS, con su identificación de verdad y sus puntos
   táctiles. `maxTouchPoints` es lo único que distingue un iPad de un
   Mac, así que va en la mesa de pruebas como un dato más. */
const APARATOS = [
  { id: "iphone", nombre: "iPhone · Safari", tacto: 5,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    espera: { titulo: /iPhone o iPad/i, dice: [/Compartir/i, /pantalla de inicio/i] } },

  { id: "ipad", nombre: "iPad · Safari (dice ser un Mac)", tacto: 5,
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    espera: { titulo: /iPhone o iPad/i, dice: [/Compartir/i, /pantalla de inicio/i] } },

  { id: "chrome-ios", nombre: "iPhone · Chrome", tacto: 5,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
    espera: { titulo: /Safari/i, dice: [/solo Safari/i] } },

  { id: "android", nombre: "Android · Chrome", tacto: 5,
    ua: "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    espera: { titulo: /Android/i, dice: [/tres puntos/i, /Instalar aplicación/i] } },

  { id: "pc", nombre: "Computador · Chrome", tacto: 0,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    espera: { titulo: /computador/i, dice: [/barra de direcciones/i] } },
];

writeFileSync(R(".arnes/_ai-inst.tsx"), `
import { createRoot } from "react-dom/client";
import { AccionesApp } from "../src/components/AccionesApp";
createRoot(document.getElementById("r")!).render(
  <div className="sh"><AccionesApp variante="enlace" /></div>);
`);

let js;
try {
  js = buildSync({
    entryPoints: [R(".arnes/_ai-inst.tsx")], bundle: true, write: false,
    format: "iife", jsx: "automatic",
    alias: { "@": R("src") },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "window.process = window.process || { env: {} };" },
    logLevel: "silent",
  }).outputFiles[0].text;
} catch (e) {
  console.error("No compiló la entrada del arnés:\n" + (e.message ?? e));
  process.exit(1);
}

const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const acc = (() => { try { return readFileSync(R("src/app/login/login.css"), "utf8") } catch { return "" } })();
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/** Monta el componente haciéndose pasar por un aparato. */
const montar = async (a, { yaInstalada = false } = {}) => {
  const ctx = await nav.newContext({ userAgent: a.ua, viewport: { width: 420, height: 800 } });
  const pg = await ctx.newPage();
  /* EL DISFRAZ VA EN LA PROPIA PÁGINA, antes del paquete, y no con
     `addInitScript`: con setContent el guion de arranque no siempre
     llega antes, y entonces el componente lee el `maxTouchPoints` de
     verdad. La prueba pasaba a decir que el iPad es un computador, que
     es exactamente el fallo que vino a cazar — pero por culpa del
     arnés, no del código. Media hora perdida ahí.

     `maxTouchPoints` es lo único que distingue un iPad de un Mac, y
     `display-mode: standalone` es como el navegador dice «ya estoy
     instalada». Los dos se falsean aquí para poder probar los cinco
     aparatos sin tener los cinco aparatos. */
  const disfraz = `
    Object.defineProperty(window.navigator, "maxTouchPoints", { get: () => ${a.tacto} });
    (function () {
      var real = window.matchMedia.bind(window);
      window.matchMedia = function (q) {
        return String(q).indexOf("standalone") >= 0
          ? { matches: ${yaInstalada ? "true" : "false"}, media: q, onchange: null,
              addEventListener: function () {}, removeEventListener: function () {},
              addListener: function () {}, removeListener: function () {} }
          : real(q);
      };
    })();`;
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${acc} html,body{margin:0;padding:12px}</style>
    <script>${disfraz}</script></head>
    <body><div id="r"></div><script>${js}</script></body></html>`);
  await pg.waitForFunction(() => document.querySelector("#r")?.children.length > 0, null, { timeout: 8000 })
    .catch(() => {});
  return { pg, ctx };
};

for (const a of APARATOS) {
  const { pg, ctx } = await montar(a);

  /* 1. EL BOTÓN ESTÁ. Es lo que fallaba: sin `beforeinstallprompt` no
        se pintaba nada, en ningún aparato. */
  const hay = await pg.isVisible("button.pedir").catch(() => false);
  ok(hay, `${a.nombre}: no aparece el botón de instalar — es justo el fallo que esto viene a arreglar`);
  if (!hay) { await ctx.close(); continue }

  const texto = (await pg.textContent("button.pedir")) ?? "";
  ok(/instalar/i.test(texto), `${a.nombre}: el botón dice «${texto.trim()}» y no menciona instalar`);

  /* 2. AL TOCARLO SALE EL CAMINO DE ESE NAVEGADOR. Un «instálala desde
        el menú» no sirve: hay tres menús y en uno la opción no existe. */
  await pg.click("button.pedir");
  await pg.waitForSelector("[role=dialog]", { timeout: 4000 }).catch(() => {});
  const abierto = await pg.isVisible("[role=dialog]").catch(() => false);
  ok(abierto, `${a.nombre}: el botón no explica nada — sin el instalador del navegador, no queda salida`);
  if (!abierto) { await ctx.close(); continue }

  const dlg = ((await pg.textContent("[role=dialog]")) ?? "").replace(/\s+/g, " ");
  ok(a.espera.titulo.test(dlg),
     `${a.nombre}: las instrucciones no son las suyas — dicen «${dlg.slice(0, 70)}…»`);
  for (const frase of a.espera.dice) {
    ok(frase.test(dlg), `${a.nombre}: las instrucciones no mencionan ${frase}`);
  }

  /* 3. Y NO LE DAN INSTRUCCIONES DE OTRO APARATO. Es el error más fácil
        de cometer al escribir cinco textos parecidos, y el que hace que
        alguien busque un botón que no existe en su pantalla. */
  /* LO QUE NO PUEDE DECIR CADA UNO, por su seña propia y no por una
     palabra suelta.

     Se intentó con «Compartir» y con «pantalla de inicio» a secas y las
     dos dieron fallas que no eran: el texto del computador nombra
     «Guardar y compartir» —un menú de Chrome de verdad— y el de Android
     nombra «Añadir a pantalla de inicio», que en Android es correcto,
     porque Chrome llama así a la opción en algunas versiones. La seña
     que de verdad separa los dos mundos es el BOTÓN COMPARTIR DE SAFARI
     y el menú de TRES PUNTOS. */
  const prohibido = {
    "iphone":     [/tres puntos/i, /barra de direcciones/i],
    "ipad":       [/tres puntos/i, /barra de direcciones/i],
    "chrome-ios": [/tres puntos/i, /barra de direcciones/i],
    "android":    [/botón Compartir/i, /Safari/i],
    "pc":         [/botón Compartir/i, /pantalla de inicio/i],
  }[a.id] ?? [];
  for (const mal of prohibido) {
    ok(!mal.test(dlg), `${a.nombre}: las instrucciones mencionan ${mal}, que no existe en ese navegador`);
  }

  console.log(`${a.nombre.padEnd(34)} botón ✓ · ${dlg.slice(0, 46)}…`);
  await pg.screenshot({ path: `.arnes/app-instalar-${a.id}.png` });
  await ctx.close();
}

/* ---------------------------------------------------------------------
   4 · YA INSTALADA: NO SE OFRECE

   Pintar «Instalar app» dentro de la app ya instalada es decirle a
   alguien que le falta algo que ya tiene.
   ------------------------------------------------------------------ */
{
  const a = APARATOS.find((x) => x.id === "android");
  const { pg, ctx } = await montar(a, { yaInstalada: true });
  await pg.waitForTimeout(300);
  const hay = await pg.isVisible("button.pedir").catch(() => false);
  ok(!hay, "con la app ya instalada sigue ofreciendo instalarla");
  await ctx.close();
}

await nav.close();

/* ---------------------------------------------------------------------
   5 · LO QUE HACE FALTA PARA QUE EL NAVEGADOR PUEDA INSTALAR

   Tres cosas, y si falta una no hay instalación — y ninguna da error en
   ninguna parte: la app funciona perfecto y simplemente no se puede
   instalar nunca. Por eso se comprueban aquí y no mirando la pantalla.
   ------------------------------------------------------------------ */
{
  const lay = readFileSync(R("src/app/layout.tsx"), "utf8");
  ok(/manifest:\s*"\/manifest\.webmanifest"/.test(lay),
     "el layout no enlaza el manifiesto: sin ese enlace el navegador nunca ofrece instalar");
  ok(/apple:\s*"\/icons\//.test(lay),
     "falta el apple-touch-icon: en iPhone el ícono sale como un recorte borroso de la pantalla");

  const man = readFileSync(R("src/app/manifest.ts"), "utf8");
  for (const campo of ["name", "short_name", "start_url", "display", "icons"]) {
    ok(new RegExp(`${campo}\\s*:`).test(man), `al manifiesto le falta «${campo}»`);
  }
  ok(/"192x192"/.test(man) && /"512x512"/.test(man),
     "el manifiesto no trae los dos tamaños de ícono que el navegador exige (192 y 512)");

  const sw = readFileSync(R("public/sw.js"), "utf8");
  ok(/addEventListener\("fetch"/.test(sw),
     "el service worker no responde peticiones: Chrome solo ofrece instalar si lo hace");

  const reg = readFileSync(R("src/components/RegistrarSW.tsx"), "utf8");
  ok(/register\("\/sw\.js"\)/.test(reg), "nadie registra el service worker");
  const raiz = readFileSync(R("src/app/layout.tsx"), "utf8");
  ok(/<RegistrarSW \/>/.test(raiz),
     "el service worker no se registra en el layout raíz: en la pantalla de acceso —que es donde " +
     "llega la gente por primera vez— no habría instalación");

  /* Y QUE EL MEDIO PERMITA PEDIRLOS SIN SESIÓN. El navegador pide el
     manifiesto y el service worker ANTES de que nadie entre; si el
     guardia los manda al login, llegan un HTML en vez de un JSON y la
     instalación no se ofrece jamás. */
  const mw = readFileSync(R("src/middleware.ts"), "utf8");
  ok(/manifest\.webmanifest/.test(mw) && /sw\.js/.test(mw),
     "el middleware no deja pasar el manifiesto y el service worker sin sesión");
}

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Instalar: el botón está en los cinco aparatos —iPad disfrazado de Mac incluido—, cada uno recibe los pasos de SU navegador, " +
            "la app ya instalada no lo ofrece, y el manifiesto, el ícono y el service worker están donde el navegador los busca.");
