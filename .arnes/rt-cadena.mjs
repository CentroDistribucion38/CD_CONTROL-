/* =====================================================================
   LA CADENA, AL DERECHO — las dos pantallas, en Chromium.

   «Registran, llega a Visto bueno, allí EASY dice si está de acuerdo o
    no. Si está de acuerdo va para cobro de una y NO LLEGA NOTIFICACIÓN,
    sino que llega a la data. Si no está de acuerdo llega la
    notificación a ABI, y ABI culmina de decir si se cobra o no. Y EN
    TODO SE REQUIERE EVIDENCIA.»

   LO QUE SE MIDE, Y POR QUÉ CADA COSA:

   1. EL VISTO BUENO YA NO DICE «CUENTA / NO CUENTA». Ese era el
      lenguaje de quien cobra. Ahora es de Easy y dice «de acuerdo / en
      desacuerdo», que es el lenguaje de quien responde. Si el botón
      siguiera diciendo lo de antes, la pantalla estaría pidiéndole a
      Easy que decida su propio cobro.

   2. «DE ACUERDO» NO PIDE NADA; «EN DESACUERDO» PIDE MOTIVO **Y**
      FOTO. La asimetría es deliberada: cobrarle un trámite a quien
      está de acuerdo es lo que enseña a rechazar por costumbre.

   3. LO QUE VIAJA ES `p_de_acuerdo`, no `p_cuenta`. Es la misma
      función con el argumento cambiado de significado: mandar el
      nombre viejo la haría hacer lo contrario en silencio.

   4. LA FOTO DEL DESCARGO SUBE ANTES QUE LA RESPUESTA. La base la
      exige; si fuera después, el rechazo lo rechazaría la base y la
      persona vería un error críptico teniendo la foto en la mano.

   5. LA BANDEJA DE ABI SOLO ENSEÑA LO OBJETADO, y enseña el descargo
      SIN ABRIR NADA: quien decide tiene que leer las dos versiones o
      está decidiendo con una.

   6. Nada se sale a 1440 / 820 / 390 / 360 y lo que se toca mide 44 px.

     node .arnes/rt-cadena.mjs
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

writeFileSync(R(".arnes/_nav-cad.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);

/* La base de mentiras ANOTA todo: es la única forma de comprobar que la
   foto sube ANTES que la respuesta, y con qué nombre viaja cada cosa. */
writeFileSync(R(".arnes/_supa-cad.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { que: "rpc", f, a }];
    return { data: null, error: null };
  },
  storage: { from: () => ({ upload: async (ruta: string) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { que: "subir", ruta }];
    return { error: null };
  } }) },
  from: (t: string) => ({ insert: async (fila: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { que: "insert", t, fila }];
    return { error: null };
  } }),
});`);

const ROTURAS = `
const base = (i, o) => ({
  id: "r" + i, codigo: "RB-000" + i, material: "EER-AMBAR",
  material_nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar",
  unidades: 10, contaminadas: null, botellas: null,
  unidades_liquido: 0, unidades_vidrio: 10,
  proceso: "lineas", proceso_nombre: "Líneas",
  area: "plazoleta", area_nombre: "Plazoleta",
  causa: "estibas_malas", causa_nombre: "Estibas en mal estado",
  grupo: "asumida", exige_foto: false, descripcion: "Se cayó una estiba",
  lat: null, lng: null, precision_m: null,
  estado: "esperando", esperando: true, cuenta: false,
  reportada_por: "u1", reportada_en: "2026-09-20T12:00:00Z",
  decidida_por: null, decidida_en: null, nota_decision: null,
  fotos: 1, le_falta_foto: false, minutos: 400,
  ol_respuesta: null, ol_por: null, ol_en: null, ol_nota: null,
  etapa: "espera_ol", cobro_por: null, fotos_descargo: 0, ...o,
});
const nombres = { u1: "Genesis Visbal", u2: "Easy OL" };
`;

writeFileSync(R(".arnes/_cad-vb.tsx"), `
import { createRoot } from "react-dom/client";
import { VistoBueno } from "../src/app/(app)/roturas/en-sitio/visto-bueno/VistoBueno";
${ROTURAS}
const roturas = [
  base(1),
  /* UNA CON CAUSA QUE EXIGE FOTO Y SIN FOTO: aceptarla dejaría un
     cobro sin con qué sostenerlo, y la pantalla tiene que decirlo. */
  base(2, { causa: "falla_maquinas", causa_nombre: "Falla de las máquinas",
            grupo: "no_asumida", exige_foto: true, le_falta_foto: true, fotos: 0 }),
];
createRoot(document.getElementById("r")!).render(
  <VistoBueno roturas={roturas as any} nombres={nombres} puedeDecidir />);
`);

writeFileSync(R(".arnes/_cad-des.tsx"), `
import { createRoot } from "react-dom/client";
import { Desacuerdos } from "../src/app/(app)/roturas/en-sitio/desacuerdos/Desacuerdos";
${ROTURAS}
const roturas = [
  base(3, { ol_respuesta: "rechaza", ol_por: "u2", ol_en: "2026-09-21T09:00:00Z",
            ol_nota: "El montacargas de ese turno no era nuestro",
            etapa: "desacuerdo", fotos: 2, fotos_descargo: 1 }),
];
createRoot(document.getElementById("r")!).render(
  <Desacuerdos roturas={roturas as any} nombres={nombres} puedeResolver />);
`);

/* Y la de ABI sin poder resolver: los botones no pueden estar. */
writeFileSync(R(".arnes/_cad-des-ve.tsx"), `
import { createRoot } from "react-dom/client";
import { Desacuerdos } from "../src/app/(app)/roturas/en-sitio/desacuerdos/Desacuerdos";
${ROTURAS}
createRoot(document.getElementById("r")!).render(
  <Desacuerdos roturas={[base(3, { ol_respuesta: "rechaza", ol_por: "u2",
    ol_en: "2026-09-21T09:00:00Z", ol_nota: "No fue nuestra", etapa: "desacuerdo" })] as any}
    nombres={nombres} puedeResolver={false} />);
`);

const armar = (e) => buildSync({
  entryPoints: [R(e)], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-cad.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-cad.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const jsVB = armar(".arnes/_cad-vb.tsx");
const jsDes = armar(".arnes/_cad-des.tsx");
const jsDesVe = armar(".arnes/_cad-des-ve.tsx");

const css = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (cual, ancho = 1440, tema = "", alto = 1100) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>${cual}</script></body></html>`);
  await pg.waitForSelector(".rt .caja");
  await pg.evaluate(() => { window.llamadas = [] });
};
const llamadas = () => pg.evaluate(() => window.llamadas ?? []);
const teclear = async (sel, v) => pg.evaluate(([s, val]) => {
  const el = document.querySelector(s);
  const proto = el.tagName === "TEXTAREA"
    ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, [sel, v]);

/* ---------------------------------------------------------------------
   1 · EL VISTO BUENO HABLA EL IDIOMA DE QUIEN RESPONDE
   ------------------------------------------------------------------ */
await monta(jsVB);
{
  const t = await pg.textContent(".rt");
  ok(/De acuerdo/.test(t) && /En desacuerdo/.test(t),
     "los botones no dicen «de acuerdo / en desacuerdo»");
  /* «CUENTA / NO CUENTA» ERA EL LENGUAJE DE QUIEN COBRA. Dejarlo sería
     pedirle a Easy que decida su propio cobro. */
  const btns = await pg.$$eval(".rt .par button", (b) => b.map((x) => x.textContent.trim()));
  ok(!btns.some((x) => /^Cuenta$|^No cuenta$/.test(x)),
     `los botones viejos siguen vivos: ${btns.join(" | ")}`);
  /* Y SE DICE QUE LO ACEPTADO NO PASA POR ABI: es la parte del pedido
     que una pantalla puede tragarse sin que se note. */
  ok(/no le llega a ABI|no pasa por ABI|sin pasar/i.test(t),
     "no se dice que lo aceptado pasa a cobro SIN llegarle a ABI");
}

/* ---------------------------------------------------------------------
   2 · «DE ACUERDO» NO PIDE NADA
   ------------------------------------------------------------------ */
{
  await pg.click(".rt .filas .par button:has-text('De acuerdo')");
  await pg.waitForSelector(".rt .panel");
  ok(!(await pg.isDisabled(".rt .panel .acciones-panel button.bien")),
     "aceptar pide algo antes de dejar: cobrarle un trámite a quien está de acuerdo enseña a rechazar por costumbre");
  ok((await pg.$$(".rt .panel input[type=file]")).length === 0,
     "aceptar pide foto de descargo: quien acepta no está probando nada");

  await pg.click(".rt .panel .acciones-panel button.bien");
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 2000 })
    .catch(() => {});
  const l = (await llamadas()).find((x) => x.que === "rpc");
  ok(l?.f === "rotura_visto_bueno", `se llamó «${l?.f}»`);
  /* EL ARGUMENTO CAMBIÓ DE SIGNIFICADO Y DE NOMBRE. Mandar `p_cuenta`
     haría que la función hiciera lo contrario en silencio. */
  ok("p_de_acuerdo" in (l?.a ?? {}),
     `no se manda p_de_acuerdo: ${JSON.stringify(Object.keys(l?.a ?? {}))}`);
  ok(l?.a?.p_de_acuerdo === true, `p_de_acuerdo viajó como ${l?.a?.p_de_acuerdo}`);
  ok(!("p_cuenta" in (l?.a ?? {})), "todavía se manda p_cuenta, que ya no existe");
  /* Y ACEPTAR NO SUBE NINGUNA FOTO. */
  ok(!(await llamadas()).some((x) => x.que === "subir"),
     "aceptar subió una foto que nadie pidió");
}

/* ---------------------------------------------------------------------
   3 · «EN DESACUERDO» PIDE MOTIVO **Y** FOTO, Y LA FOTO VA PRIMERO
   ------------------------------------------------------------------ */
await monta(jsVB);
{
  await pg.click(".rt .filas .par button:has-text('En desacuerdo')");
  await pg.waitForSelector(".rt .panel");

  ok(/Falta decir por qué/i.test(await pg.textContent(".rt .panel button.mal")),
     "sin motivo el botón no dice qué falta");
  await teclear(".rt .panel textarea", "El montacargas de ese turno no era nuestro");
  ok(/Falta la evidencia/i.test(await pg.textContent(".rt .panel button.mal")),
     "con motivo y sin foto el botón no pide la evidencia: «en todo se requiere evidencia»");
  ok(await pg.isDisabled(".rt .panel button.mal"),
     "deja mandar el desacuerdo sin evidencia");

  await pg.setInputFiles(".rt .panel input[type=file]",
    { name: "descargo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x".repeat(64)) });
  ok(!(await pg.isDisabled(".rt .panel button.mal")),
     "con motivo y foto el botón sigue apagado");

  await pg.click(".rt .panel button.mal");
  await pg.waitForFunction(
    () => (window.llamadas ?? []).some((x) => x.que === "rpc"), null, { timeout: 3000 })
    .catch(() => {});
  const ls = await llamadas();
  const iSubir = ls.findIndex((x) => x.que === "subir");
  const iRpc = ls.findIndex((x) => x.que === "rpc");
  ok(iSubir >= 0, "el desacuerdo no subió la evidencia");
  /* LA FOTO VA ANTES QUE LA RESPUESTA. Al revés, la base rechazaría el
     rechazo por falta de evidencia y la persona vería un error
     críptico teniendo la foto en la mano. */
  ok(iSubir < iRpc,
     "la evidencia se sube DESPUÉS de contestar: la base va a rechazar el rechazo y el error no se va a entender");

  const fila = ls.find((x) => x.que === "insert");
  ok(fila?.t === "roturas_fotos", `la evidencia se registró en «${fila?.t}»`);
  /* Y SE REGISTRA COMO DESCARGO, NO COMO ROTURA: son dos momentos, y
     una foto de la rotura no prueba que la rotura no fue tuya. */
  ok(fila?.fila?.papel === "descargo",
     `la evidencia quedó con papel «${fila?.fila?.papel}» y debe ser «descargo»`);

  const l = ls.find((x) => x.que === "rpc");
  ok(l?.a?.p_de_acuerdo === false, `p_de_acuerdo viajó como ${l?.a?.p_de_acuerdo}`);
  ok((l?.a?.p_nota ?? "").length > 5, `no viajó el motivo: ${JSON.stringify(l?.a?.p_nota)}`);
}

/* ---------------------------------------------------------------------
   4 · LA QUE EXIGE FOTO Y NO LA TIENE, SE DICE
   ------------------------------------------------------------------ */
await monta(jsVB);
ok(/No se puede aceptar/i.test(await pg.textContent(".rt .filas")),
   "no se avisa que una causa que exige foto y no la tiene no se puede aceptar");

/* ---------------------------------------------------------------------
   5 · LA BANDEJA DE ABI ENSEÑA EL DESCARGO SIN ABRIR NADA

   Quien decide tiene que leer LAS DOS versiones. Si el descargo
   estuviera detrás de un «Ver», la decisión se toma habiendo leído
   solo un lado, que es el error entero.
   ------------------------------------------------------------------ */
await monta(jsDes);
{
  const t = await pg.textContent(".rt .filas");
  ok(/El montacargas de ese turno no era nuestro/.test(t),
     "el descargo no se ve sin abrir nada: se decidiría habiendo leído solo un lado");
  ok(/Dice el operador log/i.test(t), "no se dice de quién es ese texto");
  ok(/1 foto de descargo/.test(t),
     "no se dice cuánta evidencia trajo el descargo");
  ok(/Se cobra igual/.test(t) && /No se cobra/.test(t),
     "los dos botones de ABI no están");

  /* LOS DOS LADOS EXIGEN MOTIVO, no solo el que va en contra de
     alguien: un desacuerdo cerrado sin una línea se vuelve a discutir
     el mes entrante, gane quien gane. */
  for (const [boton, clase] of [["Se cobra igual", "bien"], ["No se cobra", "mal"]]) {
    await pg.click(`.rt .filas .par button:has-text('${boton}')`);
    await pg.waitForSelector(".rt .panel");
    ok(await pg.isDisabled(`.rt .panel .acciones-panel button.${clase}`),
       `«${boton}» deja cerrar el desacuerdo sin decir por qué`);
    await pg.click(".rt .panel .acciones-panel button.plano");
  }

  await pg.click(".rt .filas .par button:has-text('Se cobra igual')");
  await pg.waitForSelector(".rt .panel");
  await teclear(".rt .panel textarea", "El acta de entrega del turno los tiene a ellos");
  await pg.click(".rt .panel .acciones-panel button.bien");
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 2000 })
    .catch(() => {});
  const l = (await llamadas()).find((x) => x.que === "rpc");
  ok(l?.f === "rotura_resolver", `ABI llamó a «${l?.f}»`);
  ok(l?.a?.p_cuenta === true, `p_cuenta viajó como ${l?.a?.p_cuenta}`);
  ok((l?.a?.p_nota ?? "").length > 5, "no viajó el argumento de ABI");
}

/* Y quien solo mira no toca nada. */
await monta(jsDesVe);
ok((await pg.$$(".rt .filas .par button.bien, .rt .filas .par button.mal")).length === 0,
   "a quien solo VE le salen los botones de resolver");
/* Pero SÍ lee el descargo: mirar la bandeja es media razón de tener
   permiso de ver. */
ok(/No fue nuestra/.test(await pg.textContent(".rt .filas")),
   "quien solo mira no puede leer el descargo");

/* ---------------------------------------------------------------------
   6 · LOS CUATRO ANCHOS, Y LO QUE SE TOCA
   ------------------------------------------------------------------ */
for (const [cual, nombre] of [[jsVB, "vb"], [jsDes, "des"]]) {
  for (const ancho of [1440, 820, 390, 360]) {
    await monta(cual, ancho);
    await pg.click(".rt .filas .par button:nth-child(2)");
    await pg.waitForSelector(".rt .panel");
    const r = await pg.evaluate(() => {
      const a = document.documentElement.clientWidth, fuera = [], chicos = [];
      for (const el of document.querySelectorAll(".rt *")) {
        const b = el.getBoundingClientRect();
        let recortado = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflow !== "visible" || cs.overflowX !== "visible") { recortado = true; break }
        }
        if (!recortado && b.width > 0 && (b.right > a + .5 || b.left < -.5)) {
          fuera.push(el.className || el.tagName);
        }
        if (["BUTTON", "SELECT"].includes(el.tagName) && b.height > 0 && b.height < 44
            && getComputedStyle(el).display !== "none") {
          chicos.push((el.className || el.tagName) + " h=" + Math.round(b.height));
        }
      }
      return { scroll: document.documentElement.scrollWidth, ancho: a,
               fuera: [...new Set(fuera)].slice(0, 3), chicos: [...new Set(chicos)].slice(0, 3) };
    });
    ok(r.scroll <= r.ancho + .5, `${nombre} ${ancho}: la página se desplaza a lo ancho`);
    ok(!r.fuera.length, `${nombre} ${ancho}: se sale ${r.fuera.join(" | ")}`);
    ok(!r.chicos.length, `${nombre} ${ancho}: no se alcanza con el dedo ${r.chicos.join(" | ")}`);
    if (ancho === 1440 || ancho === 390) {
      await pg.screenshot({ path: `.arnes/rt-cadena-${nombre}-${ancho}.png`, fullPage: ancho < 900 });
    }
  }
  console.log(`${nombre.padEnd(4)} los cuatro anchos: bien`);
}

/* ---------------------------------------------------------------------
   7 · SE LEE EN LOS SIETE TEMAS
   ------------------------------------------------------------------ */
for (const tema of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(jsDes, 1440, tema);
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
    return { titulo: razon(".rt .caja .cab h2"), texto: razon(".rt .caja .cab p"),
             /* EL DESCARGO ES EL DATO DE ESTA PANTALLA: si no se lee en
                dos de los siete temas, la pantalla no sirve donde se usa. */
             descargo: razon(".rt .aviso.rojo b"),
             boton: razon(".rt .par button") };
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
console.log("\n✓ La cadena al derecho: el visto bueno es de EASY y dice «de acuerdo / en desacuerdo» —no «cuenta / no cuenta», que era el idioma de quien cobra—; aceptar no pide nada y manda p_de_acuerdo, objetar pide motivo Y foto y la foto sube ANTES que la respuesta, marcada como descargo; la bandeja de ABI solo trae lo objetado, enseña el descargo sin abrir nada, y exige argumento gane quien gane.");
