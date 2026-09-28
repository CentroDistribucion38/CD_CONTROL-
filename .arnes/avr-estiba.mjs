/* =====================================================================
   AVERÍAS · LA ESTIBA FANTASMA — el encabezado del tablero, medido.

   El dibujo es el argumento de la pantalla, así que se mide como un
   argumento y no como un adorno. Lo que puede salir mal:

   1. QUE NO SE PINTE NADA. Un lienzo en blanco no se nota leyendo el
      código: se nota abriendo la pantalla. Aquí se leen los píxeles.

   2. QUE EL DIBUJO MIENTA. La estiba dice tres cosas —cuántas cajas, de
      qué causal, y cuál causal pesa más— y las tres tienen que salir de
      los datos. Se cuentan los píxeles de cada color y se comparan con
      las cifras: si el reparto por causal se rompe, el montón cambia de
      color y esto se pone rojo.

   3. QUE SE ARRODILLE EL TELÉFONO. La promesa es «diez dibujos por
      cuadro, no setecientos». Se cuentan de verdad, interceptando las
      llamadas de dibujo del navegador.

   4. QUE NO HAYA RESPALDO. Sin WebGL tiene que aparecer la MISMA estiba
      dibujada plana, con el mismo número de canastas. Se apaga WebGL y
      se comprueba.

   5. QUE NO SE LEA, o que se salga. Siete temas y cuatro anchos.

     node .arnes/avr-estiba.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
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

/* ---------- los postizos ---------- */
writeFileSync(R(".arnes/_nav-avr.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-avr.ts"), `export const createClient = () => ({
  rpc: async () => ({ data: null, error: null }),
  from: () => ({ insert: async () => ({ error: null }), update: () => ({ eq: async () => ({ error: null }) }) }),
});`);
/* `next/dynamic` de mentiras: el de verdad necesita el armazón de Next.
   Este hace lo único que importa aquí —cargar el módulo aparte y pintar
   cuando llegue—, que es exactamente lo que se quiere medir. */
writeFileSync(R(".arnes/_dyn-avr.tsx"), `
import { lazy, Suspense, createElement } from "react";
export default function dynamic(cargar: any) {
  const L = lazy(() => cargar().then((m: any) => ({ default: m.default ?? m })));
  return (props: any) => createElement(Suspense, { fallback: null }, createElement(L, props));
}`);

/* ---------- los datos: 36 cajas pendientes repartidas 20 / 12 / 4 ----
   Son exactamente el cupo de la estiba, para que el dibujo quede lleno y
   se pueda contar canasta por canasta. */
const CAJAS = { deposito: 20, transporte: 12, contaminado: 4 };

writeFileSync(R(".arnes/_avr-pant.tsx"), `
import { createRoot } from "react-dom/client";
import { Averias } from "../src/app/(app)/inventario/averias/Averias";

const hoy = new Date().toISOString().slice(0, 10);
const atras = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const base = {
  hora: "09:12", turno: 1, paso_antes: null, ubicacion_id: "u1", ubicacion_clave: "A03-M12-IZQ",
  modulo: "M12", lado: "IZQ", producto_sku: "9845", producto: "Aguila Tw 330Cc X 30",
  unidades: 0, externa: false, reporto: "Genesis Visbal", documento: null, documento_en: null,
  nota: null, creado_por: null, creado_en: hoy + "T09:12:00Z", anulada_en: null,
  motivo_anulacion: null, pendiente_baja: true, fotos: 0,
};
const reps = [
  { id: "a1", codigo: "AV-0012", fecha: atras(11), calle: "A", ubicacion: "A03 · M12 · IZQ",
    cajas: ${CAJAS.deposito}, vence: null, causal: "deposito", causal_nombre: "Avería depósito",
    dias_baja: 11, dias_para_vencer: 12 },
  { id: "a2", codigo: "AV-0018", fecha: atras(4), calle: "B", ubicacion: "B07 · M04",
    cajas: ${CAJAS.transporte}, vence: null, causal: "transporte", causal_nombre: "Avería transporte",
    dias_baja: 4, dias_para_vencer: 200, externa: true },
  { id: "a3", codigo: "AV-0021", fecha: atras(2), calle: "A", ubicacion: "A01 · M02 · DER",
    cajas: ${CAJAS.contaminado}, vence: null, causal: "contaminado", causal_nombre: "Producto contaminado",
    dias_baja: 2, dias_para_vencer: 400 },
  /* Una ya dada de baja: NO tiene que salir en la estiba. Si sale, el
     dibujo estaría contando lo que ya salió de la cuenta. */
  { id: "a4", codigo: "AV-0009", fecha: atras(30), calle: "C", ubicacion: "C01 · M01",
    cajas: 99, vence: null, causal: "deposito", causal_nombre: "Avería depósito",
    dias_baja: null, dias_para_vencer: 90, pendiente_baja: false, documento: "5000123456" },
].map((r) => ({ ...base, ...r }));

const causales = [
  { clave: "deposito", nombre: "Avería depósito", externa: false, activo: true, orden: 1 },
  { clave: "transporte", nombre: "Avería transporte", externa: true, activo: true, orden: 2 },
  { clave: "contaminado", nombre: "Producto contaminado", externa: false, activo: true, orden: 3 },
];
const ubicaciones = [
  { id: "u1", clave: "A03-M12-IZQ", calle: "A03", modulo: "M12", lado: "IZQ", activa: true },
];
createRoot(document.getElementById("r")!).render(
  <Averias modo="tablero" lista={reps as any} causales={causales as any}
           productos={[{ sku: "9845", nombre: "Aguila Tw 330Cc X 30" }]}
           ubicaciones={ubicaciones as any} puedeEditar manda quien="Genesis Visbal" />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_avr-pant.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-avr.ts"), "next/dynamic": R(".arnes/_dyn-avr.tsx"),
           "@/lib/supabase/client": R(".arnes/_supa-avr.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css",
             "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/averias/averias.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
const logo = readFileSync(R("public/marca/logo-b.png"));

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/* CONTADOR DE DIBUJOS. Se le pone un gancho a las dos llamadas con las
   que WebGL pinta, ANTES de que cargue nada. Es la única forma honesta
   de saber cuánto cuesta un cuadro: preguntárselo a la librería sería
   creerle a la parte interesada. */
const GANCHO = `(() => {
  window.__dibujos = 0;
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const k of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const f = P[k]; if (!f) continue;
      P[k] = function (...a) { window.__dibujos++; return f.apply(this, a) };
    }
  }
})()`;

async function abrir({ ancho = 1440, alto = 1100, tema = "", sinWebgl = false, nucleos = 0 } = {}) {
  const pg = await nav.newPage();
  const rotos = [];
  pg.on("pageerror", (e) => rotos.push(e.message));
  /* LA CONSOLA TAMBIÉN CUENTA. three avisa por consola cuando una figura
     no se pudo fundir y devuelve nada: la pantalla no se cae, solo queda
     el panel en blanco. Un error que no tumba nada es el que más tarda
     en encontrarse, así que aquí se trata como una falla. */
  pg.on("console", (m) => {
    /* Cuando se apaga WebGL a propósito, que three se queje por consola es
       la prueba de que el camino del respaldo es el de verdad. */
    if (m.type() !== "error") return;
    if (sinWebgl && /WebGL context/i.test(m.text())) return;
    rotos.push("consola: " + m.text());
  });
  await pg.addInitScript(GANCHO);
  /* LOS DOS NIVELES SE PRUEBAN, no solo el que le toque al servidor de
     integración. La escena decide por `hardwareConcurrency` si enciende
     sombras y antialias; en un contenedor sin escritorio eso da siempre
     el nivel flojo, así que el nivel fino —el que ve un computador de
     oficina— nunca se miraría. Se miente el número y se miran los dos. */
  if (nucleos) await pg.addInitScript(`Object.defineProperty(navigator, "hardwareConcurrency", { get: () => ${nucleos} })`);
  if (sinWebgl) {
    /* Apagar WebGL como lo apaga un equipo de verdad: `getContext` que
       devuelve nada. Así se recorre el MISMO camino que en la oficina
       donde el controlador de video está en lista negra. */
    await pg.addInitScript(`(() => {
      const f = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...r) {
        return /webgl/i.test(t) ? null : f.call(this, t, ...r);
      };
    })()`);
  }
  await pg.setViewportSize({ width: ancho, height: alto });
  /* SE SIRVE DESDE UN SITIO DE VERDAD y no con `setContent`: la escena
     pide /marca/logo-b.png, y en `about:blank` una ruta que empieza por
     barra no resuelve a ninguna parte. Es la misma trampa que ya costó
     tres arneses en este proyecto. */
  await pg.route("**/*", (ruta) => {
    const u = new URL(ruta.request().url());
    if (u.pathname === "/marca/logo-b.png")
      return ruta.fulfill({ contentType: "image/png", body: logo });
    if (u.pathname === "/") return ruta.fulfill({ contentType: "text/html", body:
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head>
       <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
       <div class="sh-marco sin-riel"><main class="sh-main">
       <div class="fe avr" id="r"></div></main></div></div>
       <script>${js}<\/script></body></html>` });
    return ruta.fulfill({ status: 404, body: "" });
  });
  await pg.goto("http://arnes.local/");
  await pg.waitForSelector(".avr .avr-hero");
  return { pg, rotos };
}

/* ---------------------------------------------------------------------
   1 y 2 · SE PINTA, Y LO QUE PINTA ES VERDAD
   ------------------------------------------------------------------ */
const mirar = (archivo) => JSON.parse(execSync(`python3 - <<'PY'
from PIL import Image
import json
im = Image.open("${(process.env.FOTO ?? "/tmp")}/${archivo}").convert("RGB")
px = list(im.getdata())
o = {"colores": len(set(px))}
osc = [i for i, (r,g,b) in enumerate(px) if r < 90 and g < 90 and b < 90]
o["oscuro"] = len(osc) / len(px)
# LA SILUETA: el bulto tiene que ser MACIZO. Un montón de canastas a las
# que les falten paredes deja el mismo alto y el mismo ancho pero lleno
# de huecos, y eso no se nota contando píxeles oscuros sueltos.
if osc:
    W = im.size[0]
    xs = [i % W for i in osc]; ys = [i // W for i in osc]
    an = max(xs) - min(xs) + 1; al = max(ys) - min(ys) + 1
    o["silueta"] = {"an": an, "al": al, "macizo": len(osc) / (an * al)}
else:
    o["silueta"] = {"an": 0, "al": 0, "macizo": 0}
CAU = {"deposito": (200,16,46), "transporte": (232,166,0), "contaminado": (15,122,74)}
def cerca(p, c, t=60):
    return abs(p[0]-c[0]) < t and abs(p[1]-c[1]) < t and abs(p[2]-c[2]) < t
o["causal"] = {k: sum(1 for p in px if cerca(p, c)) for k, c in CAU.items()}
print(json.dumps(o))
PY`).toString());

const { pg, rotos } = await abrir({ nucleos: 2 });
ok(rotos.length === 0, `la pantalla tiró un error: ${rotos[0]}`);
await pg.waitForSelector(".avr .avr-lienzo canvas", { timeout: 20000 });
/* Se espera a que termine de caer la estiba: la animación dura menos de
   dos segundos y medio, y medir a mitad de la caída contaría las
   canastas que todavía van por el aire. */
await pg.waitForTimeout(3500);

writeFileSync((process.env.FOTO ?? "/tmp") + "/avr-estiba.png",
              await pg.locator(".avr .avr-fig").screenshot());
const x = mirar("avr-estiba.png");

ok(x.colores > 2000,
   `el lienzo tiene ${x.colores} colores distintos: está en blanco o pintó un plano de color, ` +
   "no una estiba");
ok(x.oscuro > 0.12 && x.oscuro < 0.62,
   `el plástico de las canastas ocupa el ${(x.oscuro * 100).toFixed(0)} % del panel ` +
   "(se espera entre 12 y 62): o no se armó la estiba, o se salió de cuadro");

/* EL ORDEN DE LOS COLORES ES EL ORDEN DE LAS CIFRAS. Depósito tiene 20
   cajas, transporte 12 y contaminado 4, así que en el dibujo tiene que
   haber más rojo que ámbar y más ámbar que verde. Es lo que se rompe si
   alguien toca el reparto o el mapa de colores. */
/* LAS TRES SE VEN. Es lo que se rompió armando esto: con la causal más
   grande al frente, las otras dos quedaban tapadas y el dibujo decía que
   solo había una. No se exige el orden exacto entre la segunda y la
   tercera —cuántos píxeles se ven depende de a qué capa le tocó el
   frente, y eso sería un arnés que se pone rojo por nada—; el reparto
   exacto se mide abajo, en el dibujo plano, donde se puede contar. */
ok(Object.values(x.causal).every((n) => n > 40),
   `alguna causal no se ve en la estiba: ${JSON.stringify(x.causal)} — están tapadas detrás de ` +
   "la causal más grande, y el dibujo dice que hay menos causales de las que hay");
ok(x.causal.deposito > x.causal.transporte && x.causal.deposito > x.causal.contaminado,
   `en el dibujo manda otra causal y no «depósito», que es la de más cajas: ${JSON.stringify(x.causal)}`);

/* EL BULTO ES MACIZO Y TIENE FORMA DE ESTIBA. Tres canastas de frente
   por cuatro de alto dan una silueta casi cuadrada y rellena. Si a la
   canasta le faltaran paredes —o si se armara mal— la silueta seguiría
   midiendo lo mismo pero quedaría calada, y eso no lo ve el porcentaje
   de píxeles oscuros: hay que mirar cuánto llena su propia caja. */
ok(x.silueta.macizo > 0.72,
   `la estiba llena solo el ${(x.silueta.macizo * 100).toFixed(0)} % de su silueta: está calada, ` +
   "a las canastas les faltan caras");
ok(x.silueta.an / x.silueta.al > 0.6 && x.silueta.an / x.silueta.al < 1.7,
   `la silueta mide ${x.silueta.an}×${x.silueta.al}: eso no tiene forma de estiba`);

/* ---------------------------------------------------------------------
   LA CIFRA GRANDE Y LA FRASE SALEN DE LOS DATOS
   ------------------------------------------------------------------ */
{
  const total = CAJAS.deposito + CAJAS.transporte + CAJAS.contaminado;
  const mega = (await pg.textContent(".avr .avr-mega b")).trim();
  ok(mega === String(total), `la cifra grande dice «${mega}» y las cajas pendientes son ${total}`);
  const frase = await pg.textContent(".avr .avr-frase");
  ok(/estiba entera/i.test(frase),
     `con ${total} cajas —una estiba exacta— la frase dice «${frase}»`);
  const ley = await pg.textContent(".avr .avr-ley");
  ok(/Avería depósito · 20/.test(ley) && /Avería transporte · 12/.test(ley),
     `la leyenda no dice las cajas por causal: «${ley}»`);
  /* LA QUE YA TIENE DOCUMENTO NO ENTRA. Son 99 cajas: si se colaran,
     la cifra grande diría 135 y la estiba estaría llena de mentiras. */
  ok(!/135/.test(mega), "la avería que ya tiene documento de baja se está contando");
}

/* ---------------------------------------------------------------------
   3 · POCOS DIBUJOS POR CUADRO
   ------------------------------------------------------------------ */
{
  const antes = await pg.evaluate(() => window.__dibujos);
  /* Un cuadro nuevo a la fuerza: se arrastra un poco la estiba. */
  const c = await pg.locator(".avr .avr-lienzo canvas").boundingBox();
  await pg.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await pg.mouse.down();
  await pg.mouse.move(c.x + c.width / 2 + 40, c.y + c.height / 2);
  await pg.mouse.up();
  await pg.waitForTimeout(400);
  const uno = (await pg.evaluate(() => window.__dibujos)) - antes;
  ok(uno > 0, "arrastrar la estiba no repinta nada");
  ok(uno <= 40,
     `un cuadro cuesta ${uno} dibujos: las piezas de la canasta dejaron de fundirse en una sola ` +
     "figura, o las 36 dejaron de pintarse instanciadas. Con 36 canastas sueltas serían ~700");
  console.log(`   dibujos por cuadro: ${uno}`);

  /* ---------- Y SE MIRA DESDE EL OTRO LADO ----------
     Una canasta a la que le falten paredes se ve maciza DE FRENTE —la
     cara del frente tapa el hueco— y se deshace al girarla. Girar la
     estiba es, además, lo que la convierte en un objeto y no en una
     lámina: si el arrastre dejara de funcionar, el gancho se pierde y
     nadie lo notaría leyendo el código. */
  await pg.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await pg.mouse.down();
  for (let i = 1; i <= 8; i++) await pg.mouse.move(c.x + c.width / 2 + i * 26, c.y + c.height / 2);
  await pg.mouse.up();
  await pg.waitForTimeout(600);
  writeFileSync((process.env.FOTO ?? "/tmp") + "/avr-estiba-girada.png",
                await pg.locator(".avr .avr-fig").screenshot());
  const g = mirar("avr-estiba-girada.png");
  ok(g.oscuro > 0.1,
     `girada, la estiba ocupa el ${(g.oscuro * 100).toFixed(0)} % del panel: se deshizo al girarla`);
  ok(g.silueta.macizo > 0.6,
     `girada, la estiba llena el ${(g.silueta.macizo * 100).toFixed(0)} % de su silueta: las canastas ` +
     "están huecas por los costados");
  ok(Math.abs(g.oscuro - x.oscuro) > 0.004,
     "girar la estiba no cambia nada de lo que se ve: el arrastre dejó de funcionar");
}

/* ---------------------------------------------------------------------
   EL NIVEL FINO — el que ve un computador de oficina
   ---------------------------------------------------------------------
   Con sombras y antialias encendidos es OTRO camino de código: es donde
   se rompen las cámaras de sombra y los materiales. Tiene que pintar la
   misma estiba y seguir costando poco. */
{
  const { pg: p4, rotos: r4 } = await abrir({ nucleos: 16 });
  /* EL NIVEL FINO TARDA MÁS AQUÍ que en un equipo de verdad: el
     contenedor no tiene tarjeta de video y pinta por programa. El plazo
     largo es del arnés, no de la pantalla. */
  await p4.waitForSelector(".avr .avr-lienzo canvas, .avr .avr-lienzo-plano", { timeout: 90000 });
  ok(!!(await p4.$(".avr .avr-lienzo canvas")),
     `el nivel fino se cayó al dibujo plano: ${r4.join(" | ") || "sin error visible"}`);
  if (!(await p4.$(".avr .avr-lienzo canvas")))
    fallas.push(`el nivel fino se cayó al dibujo plano: ${r4.join(" | ") || "sin error visible"}`);
  await p4.waitForTimeout(6000);
  ok(r4.length === 0, `en el nivel fino la pantalla tiró un error: ${r4[0]}`);
  writeFileSync((process.env.FOTO ?? "/tmp") + "/avr-estiba-fina.png",
                await p4.locator(".avr .avr-fig").screenshot());
  const f = mirar("avr-estiba-fina.png");
  ok(f.oscuro > 0.12 && f.oscuro < 0.62,
     `en el nivel fino el plástico ocupa el ${(f.oscuro * 100).toFixed(0)} % del panel`);
  ok(Object.values(f.causal).every((n) => n > 40),
     `en el nivel fino alguna causal no se ve: ${JSON.stringify(f.causal)}`);
  /* CON SOMBRAS SE PINTA DOS VECES —una para el mapa de sombra y otra
     para la imagen— así que el techo sube, pero no al doble de setenta:
     al doble de nueve. */
  const antes = await p4.evaluate(() => window.__dibujos);
  const c = await p4.locator(".avr .avr-lienzo canvas").boundingBox();
  await p4.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await p4.mouse.down(); await p4.mouse.move(c.x + c.width / 2 + 40, c.y + c.height / 2); await p4.mouse.up();
  await p4.waitForTimeout(400);
  const uno = (await p4.evaluate(() => window.__dibujos)) - antes;
  ok(uno > 0 && uno <= 40, `en el nivel fino un cuadro cuesta ${uno} dibujos`);
  console.log(`   dibujos por cuadro con sombras: ${uno}`);
  await p4.close();
}

/* ---------------------------------------------------------------------
   5 · NADA SE SALE, EN CUATRO ANCHOS
   ------------------------------------------------------------------ */
for (const [ancho, alto] of [[360, 780], [768, 1024], [1024, 900], [1440, 1100]]) {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.waitForTimeout(250);
  const m = await pg.evaluate(() => {
    const d = document.documentElement;
    const rot = document.querySelector(".avr .avr-mega");
    const fig = document.querySelector(".avr .avr-fig");
    const lienzo = document.querySelector(".avr .avr-lienzo");
    const fuera = [...document.querySelectorAll(".avr .avr-hero *")]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible")
      .map((e) => e.className);
    return {
      pagina: d.scrollWidth - d.clientWidth,
      mega: rot ? rot.getBoundingClientRect().height : 0,
      fig: fig ? fig.getBoundingClientRect() : null,
      lienzo: lienzo ? lienzo.getBoundingClientRect() : null,
      fuera: fuera.slice(0, 3),
    };
  });
  ok(m.pagina <= 1, `en ${ancho} px la página se corre de lado ${m.pagina} px`);
  ok(m.fuera.length === 0, `en ${ancho} px se sale: ${m.fuera.join(", ")}`);
  ok(m.fig && m.fig.height >= 240,
     `en ${ancho} px el panel del dibujo mide ${Math.round(m.fig?.height ?? 0)} px de alto: ` +
     "la estiba no se ve");
  /* EL LIENZO LLENA SU PANEL. Es la lección de «.ct-pasos»: una caja más
     chica que su contenido no se ve leyendo el CSS. */
  ok(m.lienzo && Math.abs(m.lienzo.height - m.fig.height) < 2 &&
     Math.abs(m.lienzo.width - m.fig.width) < 2,
     `en ${ancho} px el lienzo mide ${Math.round(m.lienzo?.width ?? 0)}×${Math.round(m.lienzo?.height ?? 0)} ` +
     `dentro de un panel de ${Math.round(m.fig.width)}×${Math.round(m.fig.height)}`);
}
await pg.setViewportSize({ width: 1440, height: 1100 });

/* ---------------------------------------------------------------------
   4 · SIN WEBGL, LA MISMA ESTIBA PLANA
   ------------------------------------------------------------------ */
{
  const { pg: p2, rotos: r2 } = await abrir({ sinWebgl: true });
  await p2.waitForSelector(".avr .avr-lienzo-plano svg", { timeout: 20000 });
  ok(r2.length === 0, `sin WebGL la pantalla tiró un error: ${r2[0]}`);
  const n = await p2.evaluate(() => document.querySelectorAll(".avr .avr-lienzo-plano svg > g").length);
  /* Cada canasta son tres caras: si una se pierde, el bulto se ve como
     una silueta plana y deja de leerse como un montón. */
  const caras = await p2.evaluate(() =>
    document.querySelectorAll(".avr .avr-lienzo-plano svg > g > polygon").length);
  const total = CAJAS.deposito + CAJAS.transporte + CAJAS.contaminado;
  ok(n === total, `el dibujo plano tiene ${n} canastas y las cajas pendientes son ${total}`);
  ok(caras === total * 4, `el dibujo plano tiene ${caras} caras y deberían ser ${total * 4}`);
  const hojas = await p2.evaluate(() => {
    const c = {};
    for (const r of document.querySelectorAll(".avr .avr-lienzo-plano svg > g > polygon:last-child")) {
      const f = r.getAttribute("fill"); c[f] = (c[f] ?? 0) + 1;
    }
    return c;
  });
  ok(hojas["#C8102E"] === CAJAS.deposito && hojas["#E8A600"] === CAJAS.transporte
     && hojas["#0F7A4A"] === CAJAS.contaminado,
     `el dibujo plano reparte las causales mal: ${JSON.stringify(hojas)}`);
  ok(await p2.isVisible(".avr .avr-mega b"),
     "sin WebGL se pierde la cifra grande: el respaldo se comió media pantalla");
  writeFileSync((process.env.FOTO ?? "/tmp") + "/avr-estiba-plana.png",
                await p2.locator(".avr .avr-hero").screenshot());
  await p2.close();
}

/* ---------------------------------------------------------------------
   5 · EN LOS SIETE TEMAS SE LEE
   ------------------------------------------------------------------ */
const CANAL = (c) => {
  const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  return c.startsWith("color(") ? n : n.map((v) => v / 255);
};
const LUM = (c) => {
  const [r, g, b] = CANAL(c).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const CONTRA = (a, b) => {
  const [p, q] = [LUM(a), LUM(b)].sort((m, n) => n - m);
  return (p + 0.05) / (q + 0.05);
};
console.log("");
for (const tema of ["oficial", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  const { pg: p3 } = await abrir({ tema });
  const m = await p3.evaluate(() => {
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
    return { mega: t(".avr .avr-mega b"), sub: t(".avr .avr-mega span"),
             frase: t(".avr .avr-frase"), rojo: t(".avr .avr-frase em"),
             ley: t(".avr .avr-ley li"), rot: t(".avr .avr-hero .avr-rot"),
             pie: t(".avr .avr-hero .avr-pie"), cif: t(".avr .avr-hero .avr-cif b") };
  });
  const pares = [["cifra", m.mega], ["sub", m.sub], ["frase", m.frase], ["rojo", m.rojo],
                 ["leyenda", m.ley], ["rótulo", m.rot], ["pie", m.pie], ["cif", m.cif]];
  const c = ([, p]) => CONTRA(p[0], p[1]);
  /* 3 para lo que va en negrita grande —la cifra, la frase y su parte en
     rojo— y 4,5 para todo lo que se lee en tamaño de texto. */
  const tope = (k) => (k === "cifra" || k === "frase" || k === "rojo" || k === "cif") ? 3 : 4.5;
  const malos = pares.filter((p) => p[1] && c(p) < tope(p[0]));
  ok(malos.length === 0,
     `en el tema ${tema} no se lee: ${malos.map((p) => `${p[0]} ${c(p).toFixed(1)}`).join(", ")}`);
  console.log(`${tema.padEnd(8)} ` + pares.map((p) => p[1]
    ? `${p[0]} ${c(p).toFixed(1)}` : `${p[0]} —`).join("  "));
  await p3.close();
}

await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("\n✓ La estiba fantasma: se arma con una canasta por caja y las hojas de color en el " +
            "orden de las cifras, cuesta un puñado de dibujos por cuadro, cae al dibujo plano sin " +
            "WebGL con el mismo reparto, y se lee y no se sale en cuatro anchos y siete temas.");
