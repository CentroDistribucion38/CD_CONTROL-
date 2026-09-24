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
  <VistoBueno roturas={roturas as any} nombres={nombres} puedeDecidir
              cifras={{ aCobro: 4, enDesacuerdo: 0, noSeCobran: 3 }} />);
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
  <Desacuerdos roturas={roturas as any} nombres={nombres} puedeResolver
               cifras={{ porAcuerdo: 12, loSostuvoAbi: 2, noSeCobran: 1 }} />);
`);

/* Y la de ABI sin poder resolver: los botones no pueden estar. */
writeFileSync(R(".arnes/_cad-des-ve.tsx"), `
import { createRoot } from "react-dom/client";
import { Desacuerdos } from "../src/app/(app)/roturas/en-sitio/desacuerdos/Desacuerdos";
${ROTURAS}
createRoot(document.getElementById("r")!).render(
  <Desacuerdos roturas={[base(3, { ol_respuesta: "rechaza", ol_por: "u2",
    ol_en: "2026-09-21T09:00:00Z", ol_nota: "No fue nuestra", etapa: "desacuerdo" })] as any}
    nombres={nombres} puedeResolver={false}
    cifras={{ porAcuerdo: 12, loSostuvoAbi: 2, noSeCobran: 1 }} />);
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
  /* LA MAQUETA CAMBIÓ LAS PALABRAS —«Aceptar / Objetar» en vez de «De
     acuerdo / En desacuerdo»— y ESO NO ES LO QUE ESTA PRUEBA CUIDA. Lo
     que cuida es que no vuelvan «Cuenta / No cuenta», que era el idioma
     de quien COBRA: con ese botón la pantalla le estaría pidiendo a
     Easy que decida su propio cobro. Clavar la copia exacta convierte
     cualquier retoque de redacción en una prueba roja, y una prueba que
     se pone roja por motivos que no importan se acaba desactivando. */
  const btns = await pg.$$eval(".rt .vb-btns button", (b) => b.map((x) => x.textContent.trim()));
  ok(btns.some((x) => /^Aceptar/.test(x)) && btns.some((x) => /^Objetar$/.test(x)),
     `los dos botones de la fila no están: ${btns.join(" | ")}`);
  ok(!btns.some((x) => /^Cuenta$|^No cuenta$/i.test(x)),
     `los botones viejos siguen vivos: ${btns.join(" | ")}`);
  /* Y SE DICE QUE LO ACEPTADO NO PASA POR ABI: es la parte del pedido
     que una pantalla puede tragarse sin que se note. */
  ok(/no le llega a ABI|no pasa por ABI|va a ABI|sin pasar/i.test(t),
     "no se dice qué le pasa a lo aceptado frente a lo objetado");

  /* LAS CUATRO CIFRAS, Y LA PRIMERA ES LA SUYA. Las otras tres están
     para que sepa cómo va la conciliación sin ir a otra pantalla; si la
     suya no fuera la destacada, entraría a leer la del mes. */
  const cifras = await pg.$$eval(".rt .rt-cifras .rt-c",
    (d) => d.map((x) => ({ n: x.querySelector("b")?.textContent, aqui: x.classList.contains("aqui") })));
  ok(cifras.length === 4, `salen ${cifras.length} cifras y deben ser cuatro`);
  ok(cifras[0]?.aqui && cifras[0]?.n === "2",
     `la primera cifra debe ser la que decide él (2 esperando) y salió ${JSON.stringify(cifras[0])}`);

  /* LA MÁS VIEJA ARRIBA. Al revés, lo de hace tres días no se mira
     nunca porque cada mañana entra algo encima. */
  const codigos = await pg.$$eval(".rt .vb-grupo .vb-cod", (d) => d.map((x) => x.textContent));
  ok(codigos[0] === "RB-0001", `la lista no arranca por la más vieja: ${codigos.join(" | ")}`);
}

/* ---------------------------------------------------------------------
   2 · ACEPTAR NO PIDE NADA
   ------------------------------------------------------------------ */
{
  /* La primera fila —RB-0001— es la que SÍ se puede aceptar. */
  await pg.click(".rt .vb-grupo >> nth=0 >> .vb-btns button.si");
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
  /* Y ACEPTAR NO SUBE NINGUNA FOTO NI ABRE NINGÚN PANEL: cobrarle un
     trámite a quien está de acuerdo es lo que enseña a rechazar por
     costumbre. */
  ok(!(await llamadas()).some((x) => x.que === "subir"),
     "aceptar subió una foto que nadie pidió");
  ok((await pg.$$(".rt .vb-obj")).length === 0,
     "aceptar abrió un panel: quien acepta no está probando nada");
}

/* ---------------------------------------------------------------------
   3 · OBJETAR PIDE MOTIVO **Y** FOTO, Y LA FOTO VA PRIMERO
   ------------------------------------------------------------------ */
await monta(jsVB);
{
  await pg.click(".rt .vb-grupo >> nth=0 >> .vb-btns button:not(.si)");
  await pg.waitForSelector(".rt .vb-obj");

  /* EL BOTÓN DICE QUÉ FALTA. Apagado y mudo se toca tres veces y
     después se llama a preguntar. */
  ok(/Escoge el motivo/i.test(await pg.textContent(".rt .vb-enviar")),
     "sin motivo el botón no dice qué falta");
  ok(await pg.isDisabled(".rt .vb-enviar"), "deja objetar sin motivo");

  /* LOS MOTIVOS SON BOTONES Y NO UN CAMPO DE TEXTO: pedirlo escribiendo,
     con guante y de pie, es lo que hace que la gente acepte por no
     teclear — y entonces la conciliación mide quién tiene tiempo. */
  const motivos = await pg.$$eval(".rt .vb-motivos button", (b) => b.length);
  ok(motivos >= 4, `hay ${motivos} motivos de un toque y deben ser al menos cuatro`);
  await pg.click(".rt .vb-motivos button:first-child");

  ok(/Falta la foto/i.test(await pg.textContent(".rt .vb-enviar")),
     "con motivo y sin foto el botón no pide la evidencia: «en todo se requiere evidencia»");
  ok(await pg.isDisabled(".rt .vb-enviar"),
     "deja mandar el desacuerdo sin evidencia");

  /* EL DETALLE ES OPCIONAL Y LA FOTO NO. No es incoherente: sin foto,
     ABI resuelve un pleito donde una parte trajo pruebas y la otra una
     opinión. El detalle lo puede suplir el motivo; la prueba no. */
  await teclear(".rt .vb-detalle", "El montacargas de ese turno no era nuestro");
  ok(await pg.isDisabled(".rt .vb-enviar"),
     "con detalle y sin foto ya deja mandar: el detalle no suple la prueba");

  await pg.setInputFiles(".rt .vb-obj input[type=file]",
    { name: "descargo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x".repeat(64)) });
  ok(!(await pg.isDisabled(".rt .vb-enviar")),
     "con motivo y foto el botón sigue apagado");
  ok(/Enviar a ABI/i.test(await pg.textContent(".rt .vb-enviar")),
     "el botón no dice adónde va lo objetado");

  await pg.click(".rt .vb-enviar");
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
  /* EL MOTIVO VA PRIMERO EN LA NOTA y el detalle detrás: es lo que ABI
     lee de un vistazo en su bandeja. Con el detalle delante, cuatro
     objeciones distintas empiezan las cuatro con una frase distinta y
     no se pueden agrupar de un barrido. */
  ok(/^No fue en nuestro turno/.test(l?.a?.p_nota ?? ""),
     `la nota no empieza por el motivo: ${JSON.stringify(l?.a?.p_nota)}`);
  ok(/montacargas/.test(l?.a?.p_nota ?? ""), "el detalle no viajó");
}

/* ---------------------------------------------------------------------
   4 · LA QUE EXIGE FOTO Y NO LA TIENE, SE DICE EN EL BOTÓN

   Un «SIN FOTO» en rojo al lado de la causa dice que falta algo, no que
   por eso no se pueda aceptar. Y un «Aceptar» normal que revienta al
   tocarlo se toca tres veces y después se llama a preguntar. El botón
   se apaga y DICE.
   ------------------------------------------------------------------ */
await monta(jsVB);
{
  const fila = ".rt .vb-grupo >> nth=1";
  ok(/SIN FOTO/.test(await pg.textContent(fila + " >> .vb-causa")),
     "no se marca la rotura a la que le falta la foto que exige su causa");
  const bt = fila + " >> .vb-btns button.si";
  ok(/No se puede aceptar/i.test(await pg.textContent(bt)),
     `el botón de aceptar dice «${(await pg.textContent(bt)).trim()}» y debe decir por qué no se puede`);
  ok(await pg.isDisabled(bt),
     "deja aceptar una rotura cuya causa exige foto y no la tiene: la base la va a rechazar");
  /* NO SE ESCONDE: escondido parecería que a esa rotura no hay nada que
     hacerle, y sí lo hay — objetarla. */
  ok((await pg.$$(fila + " >> .vb-btns button:not(.si)")).length === 1,
     "sin foto también se escondió «Objetar», y objetar sí se puede");
}

/* ---------------------------------------------------------------------
   5 · LA BANDEJA DE ABI ENSEÑA LAS DOS VERSIONES SIN ABRIR NADA

   ES EL TRABAJO DE ESA PANTALLA. Quien decide tiene que leer lo que
   dijo el que registró Y lo que dijo el que objetó. Si una de las dos
   estuviera detrás de un «Ver», la decisión se toma habiendo leído un
   solo lado —y el lado que se lee siempre es el de arriba—. Eso no es
   decidir, es firmar.
   ------------------------------------------------------------------ */
await monta(jsDes);
{
  const t = await pg.textContent(".rt .vb-caja");

  /* LAS DOS CARAS, LAS DOS VISIBLES. */
  const caras = await pg.$$eval(".rt .ds-cara", (d) => d.map((x) => ({
    quien: (x.querySelector(".ds-quien")?.textContent ?? "").trim(),
    dice: (x.querySelector(".ds-dice")?.textContent ?? "").trim(),
    ancho: Math.round(x.getBoundingClientRect().width),
  })));
  ok(caras.length === 2, `salen ${caras.length} versiones y deben salir las dos`);
  ok(/REGISTR/i.test(caras[0]?.quien ?? ""), `la primera cara dice «${caras[0]?.quien}»`);
  ok(/OPERADOR LOG/i.test(caras[1]?.quien ?? ""), `la segunda cara dice «${caras[1]?.quien}»`);
  ok(/El montacargas de ese turno no era nuestro/.test(caras[1]?.dice ?? ""),
     "el descargo no se ve sin abrir nada: se decidiría habiendo leído solo un lado");
  ok(/Se cayó una estiba/.test(caras[0]?.dice ?? ""),
     "no se ve lo que dijo quien la registró: la otra mitad de la decisión");

  /* DEL MISMO ANCHO LAS DOS. Una más angosta que la otra dice, sin
     decirlo, cuál de las dos versiones pesa más — y quien decide no
     puede llegar con eso puesto. */
  if (caras.length === 2) {
    const d = Math.abs(caras[0].ancho - caras[1].ancho);
    ok(d <= 2, `una versión mide ${caras[0].ancho} px y la otra ${caras[1].ancho}: ` +
               "la columna más ancha dice cuál de las dos pesa más");
  }

  ok(/1 foto de descargo/.test(t), "no se dice cuánta evidencia trajo el descargo");
  ok(/foto.? de la rotura|sin foto de la rotura/.test(t),
     "no se dice cuánta evidencia trajo quien registró");
  ok(/Se cobra igual/.test(t) && /No se cobra/.test(t),
     "los dos botones de ABI no están");

  /* LOS DOS LADOS EXIGEN MOTIVO, no solo el que va en contra de
     alguien: un desacuerdo cerrado sin una línea se vuelve a discutir
     el mes entrante, gane quien gane. */
  for (const [boton, sel] of [["Se cobra igual", ".vb-btns button.si"],
                              ["No se cobra", ".vb-btns button.mal"]]) {
    await pg.click(".rt .vb-grupo >> nth=0 >> " + sel);
    await pg.waitForSelector(".rt .vb-obj");
    ok(await pg.isDisabled(".rt .vb-enviar"),
       `«${boton}» deja cerrar el desacuerdo sin decir por qué`);
    ok(/Escribe por qué/i.test(await pg.textContent(".rt .vb-enviar")),
       `«${boton}» no dice qué falta con el botón apagado`);
    await pg.click(".rt .vb-obj .btn.plano");
  }

  await pg.click(".rt .vb-grupo >> nth=0 >> .vb-btns button.si");
  await pg.waitForSelector(".rt .vb-obj");
  await teclear(".rt .vb-detalle", "El acta de entrega del turno los tiene a ellos");
  await pg.click(".rt .vb-enviar");
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 2000 })
    .catch(() => {});
  const l = (await llamadas()).find((x) => x.que === "rpc");
  ok(l?.f === "rotura_resolver", `ABI llamó a «${l?.f}»`);
  ok(l?.a?.p_cuenta === true, `p_cuenta viajó como ${l?.a?.p_cuenta}`);
  ok((l?.a?.p_nota ?? "").length > 5, "no viajó el argumento de ABI");
}

/* Y quien solo mira no toca nada. */
await monta(jsDesVe);
ok((await pg.$$(".rt .vb-btns button")).length === 0,
   "a quien solo VE le salen los botones de resolver");
/* Pero SÍ lee las dos versiones: mirar la bandeja es media razón de
   tener permiso de ver. */
ok(/No fue nuestra/.test(await pg.textContent(".rt .vb-caja")),
   "quien solo mira no puede leer el descargo");

/* ---------------------------------------------------------------------
   6 · LOS CUATRO ANCHOS, Y LO QUE SE TOCA
   ------------------------------------------------------------------ */
/* SE MIDE CON EL PANEL ABIERTO: es cuando más cosas hay en la fila, y
   es justo lo que se sale. Las dos pantallas lo abren con un botón
   distinto —«Objetar» en el visto bueno, «Se cobra igual» en la de
   ABI— así que cada una dice cuál. */
const ABRIR = {
  vb: [".rt .vb-grupo >> nth=0 >> .vb-btns button:not(.si)", ".rt .vb-obj"],
  des: [".rt .vb-grupo >> nth=0 >> .vb-btns button.si", ".rt .vb-obj"],
};
for (const [cual, nombre] of [[jsVB, "vb"], [jsDes, "des"]]) {
  for (const ancho of [1440, 820, 390, 360]) {
    await monta(cual, ancho);
    await pg.click(ABRIR[nombre][0]);
    await pg.waitForSelector(ABRIR[nombre][1]);
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
    /* ESTE CHROMIUM NO RESUELVE `color-mix()` EN getComputedStyle: lo
       devuelve tal cual, «color-mix(in srgb, rgb(228,0,43) 11%, #fff)».
       El lector de antes agarraba los tres primeros números que
       encontraba —228, 0, 43— y media contra el ROJO PURO en vez de
       contra la crema. Resultado: decía que el descargo contrastaba 1.3
       en los siete temas, y no era verdad ni en uno.

       Es el mismo error de siempre visto al revés: una medida que
       miente en rojo es tan inútil como una que miente en verde, y
       cuesta más —se va media hora arreglando un color que estaba
       bien—. Lo que NO se puede leer devuelve null y el arnés se pone
       rojo diciendo cuál, en vez de inventarse un número. */
    const nums = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const rgbDe = (c) => {
      if (!c) return null;
      const mix = c.match(/^color-mix\(in srgb,\s*(rgba?\([^)]*\))\s*([\d.]+)%,\s*(\S[^)]*?)\s*\)$/);
      if (mix) {
        const a = rgbDe(mix[1]), b = rgbDe(mix[3]), p = Number(mix[2]) / 100;
        if (!a || !b) return null;
        return [0, 1, 2].map((i) => a[i] * p + b[i] * (1 - p));
      }
      /* `color(srgb 0.98 0.89 0.90)` — ASÍ es como este Chromium
         devuelve un `color-mix()` ya resuelto, y viene en 0–1, NO en
         0–255. Leerlo como 0–255 daba un color casi negro: por eso la
         crema salía contrastando 1.3 contra la tinta, cuando en la
         captura se ve perfectamente. La primera sospecha —que no
         resolvía el color-mix— era falsa; lo resolvía, y en otra
         escala. */
      const srgb = c.match(/^color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (srgb) return [1, 2, 3].map((i) => Number(srgb[i]) * 255);
      if (/^#/.test(c)) {
        const h = c.slice(1);
        const x = h.length === 3 ? [...h].map((k) => parseInt(k + k, 16))
                                 : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        return x.some(Number.isNaN) ? null : x;
      }
      const n = nums(c);
      return n.length >= 3 ? n.slice(0, 3) : null;
    };
    const lum = (c) => {
      const p = rgbDe(c);
      if (!p) return null;
      const [r, g, b] = p.map((v) => {
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
    /* `0` Y NO `99` CUANDO EL ELEMENTO NO ESTÁ.
       Devolvía 99 —un contraste altísimo— así que un selector que
       dejaba de existir pasaba la prueba sin medir nada. Pasó de
       verdad: al rehacer la pantalla, los cuatro selectores viejos
       murieron a la vez y la tabla salió «99 99 99 99» en los siete
       temas, toda en verde. Con 0 el arnés se pone rojo y dice cuál. */
    const razon = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 0;
      const a = lum(getComputedStyle(el).color), b = lum(fondoDe(el));
      /* -1 = no se pudo leer el color. Se distingue del 0 de «no está
         el elemento» para no salir a buscar la pantalla equivocada. */
      if (a == null || b == null) return -1;
      return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 10) / 10;
    };
    return { titulo: razon(".rt .vb-cab h2"), texto: razon(".rt .vb-como"),
             /* LAS DOS VERSIONES SON EL DATO DE ESTA PANTALLA: si una
                no se lee en dos de los siete temas, la pantalla no
                sirve donde se usa. Y la de la objeción va sobre crema,
                que es el fondo que más se rompe al cambiar de tema. */
             registro: razon(".rt .ds-cara .ds-dice"),
             descargo: razon(".rt .ds-cara.ds-contra .ds-dice"),
             quien: razon(".rt .ds-cara.ds-contra .ds-quien"),
             cifra: razon(".rt .rt-c.aqui b"),
             boton: razon(".rt .vb-btns button") };
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
