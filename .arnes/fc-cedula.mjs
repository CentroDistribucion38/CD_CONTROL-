/* =====================================================================
   EL VIDRIO SE VA CON EL VIAJE — la cédula, medida en la pantalla.

   «Que facturación no haga doble trabajo validando allá en salida y en
    traspaso. Que cuando hagan el registro se genere una cédula, un
    número único, y cuando facturación vaya a dar salida a un Vh de
    traspaso y ese Vh tenga tolvas, en un desplegable aparezcan los
    registros únicos que tenemos, traiga cuántas tolvas tiene el Vh, y
    si corresponde pues que le dé salida.»

   POR QUÉ ESTE ARNÉS Y NO MIRAR LA PANTALLA: el freno de las tolvas se
   puede perder sin que se vea NADA. El bloque sigue pintado, el
   desplegable sigue ahí, el número sigue pidiéndose — y el botón se
   deja tocar con un número que no cuadra. Una mirada no distingue esas
   dos pantallas; solo se distinguen TOCANDO el botón y mirando qué se
   manda.

   Por eso aquí se monta el componente de verdad en Chromium, se llena
   como se llena de pie, se toca «Confirmar», y se lee EL PAQUETE que
   sale hacia la base. El SQL tiene su propio arnés
   (.arnes/correr-vidrio-cedula.sh) para los frenos del lado de allá;
   este mide el lado de acá.

     node .arnes/fc-cedula.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => U("../" + p).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* ======================= 0 · EL REGISTRO Y LA RUTA VIEJA ================= */
{
  const reg = readFileSync(U("../src/modulos/registro.ts"), "utf8");
  const sal = reg.slice(reg.indexOf('{ nombre: "Pesar"'), reg.indexOf('{ nombre: "Tolvas"') + 200);
  /* VALIDACIÓN SE OCULTA, NO SE BORRA. Borrarla del registro le quitaría
     su casilla en /admin/roles y las filas de permiso que ya existen
     sobre esa dirección quedarían sin forma de verse ni de cambiarse. */
  ok(/ruta: "\/roturas\/salida\/validacion",\s*\n?\s*rama: "salida", oculto: true/.test(sal)
     || /"\/roturas\/salida\/validacion"[^}]*oculto: true/.test(sal),
     "Validación no quedó OCULTA en el registro: o sigue en el menú, o la borraron y perdió su casilla de permisos");

  const vieja = readFileSync(U("../src/app/(app)/roturas/salida/validacion/page.tsx"), "utf8");
  ok(/\/traspasos\/facturacion/.test(vieja),
     "la pantalla vieja de Validación no dice a dónde se mudó: quien tenga el enlace guardado se queda adivinando");
  ok(!/salida_firmar/.test(vieja),
     "la pantalla vieja de Validación todavía ofrece poner la firma que ya no existe");
}

/* ======================= 1 · LA PANTALLA, MONTADA ======================= */
writeFileSync(U("./_nav-fc.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
/* EL DOBLE DE SUPABASE GUARDA LO QUE SE MANDA, no solo a quién se llama.
   Que se llame a traspaso_confirmar_salida no prueba nada: lo que
   decide si el Vh sale bien es si en el paquete van la cédula y las
   tolvas contadas. */
writeFileSync(U("./_supa-fc.js"),
  `export const createClient = () => ({ rpc: async (fn, args) => {
     (window.__llamadas ??= []).push({ fn, args }); return { data: null, error: null } } });`);

let js;
try {
  js = buildSync({
    entryPoints: [R(".arnes/_fc-entrada.tsx")], bundle: true, write: false,
    format: "iife", jsx: "automatic",
    alias: {
      "next/navigation": R(".arnes/_nav-fc.ts"),
      "@/lib/supabase/client": R(".arnes/_supa-fc.js"),
      "@": R("src"),
    },
    define: { "process.env.NODE_ENV": '"production"' },
    /* NEXT DEJA DENTRO DEL PAQUETE UNOS `process.env.NEXT_RUNTIME` QUE
       NO SE REEMPLAZAN, y en el navegador `process` no existe: el
       montaje se cae entero y el arnés se queda esperando un selector
       que nunca va a aparecer. Un `process` vacío alcanza. */
    banner: { js: "window.process = window.process || { env: {} };" },
    logLevel: "silent",
  }).outputFiles[0].text;
} catch (e) {
  console.error("No compiló la entrada del arnés:\n" + (e.message ?? e));
  process.exit(1);
}

const css = readFileSync(U("../src/app/(app)/traspasos/traspasos.css"), "utf8")
          + readFileSync(U("../src/app/(app)/traspasos/facturacion/facturacion.css"), "utf8");
const glob = readFileSync(U("../src/app/globals.css"), "utf8");
const shell = readFileSync(U("../src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (ancho, tema = null) => {
  await pg.setViewportSize({ width: ancho, height: 1100 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css} html,body{margin:0}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel">
    <main class="sh-main"><div id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".fc-viaje");
};

await monta(1200);

/* La tarjeta de cada placa, por el orden en que se pintaron. */
const T = { sin: ".fc-lista > .fc-viaje:nth-child(1)",
            una: ".fc-lista > .fc-viaje:nth-child(2)",
            dos: ".fc-lista > .fc-viaje:nth-child(3)" };

const r1 = await pg.evaluate((T) => {
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s)?.textContent ?? "").replace(/\s+/g, " ").trim();
  return {
    sinVidrio: !q(T.sin + " .fc-vidrio"),
    unaTieneBloque: !!q(T.una + " .fc-vidrio"),
    unaSinSelect: !q(T.una + " select"),
    unaDiceCedula: txt(T.una + " .fc-cedula-una"),
    unaPesadas: txt(T.una + " .fc-pesadas b"),
    unaEspera: txt(T.una + " .fc-espera"),
    dosTieneSelect: !!q(T.dos + " select"),
    dosOpciones: [...(q(T.dos + " select")?.options ?? [])].map((o) => o.textContent.replace(/\s+/g, " ").trim()),
    dosEscogida: q(T.dos + " select")?.value ?? null,
    dosSinPesadas: !q(T.dos + " .fc-pesadas"),
    botones: [...document.querySelectorAll(".fc-viaje button[type=submit]")]
               .map((b) => ({ t: b.textContent.trim(), off: b.disabled })),
  };
}, T);

/* 1. LA PLACA SIN VIDRIO NO VE NADA DEL VIDRIO. Casi ningún viaje lleva
      tolvas: una casilla vacía en cada tarjeta sería ruido en cincuenta
      tarjetas, y ruido repetido deja de leerse. */
ok(r1.sinVidrio, "un Vh sin vidrio pendiente igual le pinta el bloque del vidrio");

/* 2. UNA SOLA CÉDULA VIENE ESCOGIDA, y sin desplegable. Obligar a abrir
      una lista de un solo renglón es hacer tocar dos veces para decir lo
      único que se podía decir. */
ok(r1.unaTieneBloque, "un Vh CON vidrio pendiente no pinta el bloque del vidrio: el vidrio se iría sin despachar");
ok(r1.unaSinSelect, "con una sola cédula igual pinta un desplegable de un renglón");
ok(/SR-0041/.test(r1.unaDiceCedula), `con una sola cédula no dice cuál es: «${r1.unaDiceCedula}»`);

/* 2b. Y LA PLACA SE NORMALIZA. En la cédula está escrita «UNA 11» y en
       el viaje «UNA-11»: si el agrupado no quita espacios y guiones, ese
       Vh sale sin su vidrio y nadie se entera. Es el mismo criterio con
       el que la base guarda las placas. */
ok(r1.unaTieneBloque && /SR-0041/.test(r1.unaDiceCedula),
   "«UNA 11» y «UNA-11» no se reconocen como la misma placa: el Vh saldría sin su vidrio");

/* 3. LO PESADO SE VE, Y EN GRANDE. Es contra lo que se cuenta. */
ok(r1.unaPesadas === "4", `lo pesado no sale en la tarjeta: salió «${r1.unaPesadas}» y son 4 tolvas`);

/* 3b. Y SE DICE SI LLEVA DÍAS ESPERANDO. Una cédula de hace tres días es
       una carga que se quedó, no una que está por salir. */
ok(/3 día/.test(r1.unaEspera), `no avisa que la cédula lleva días esperando: «${r1.unaEspera}»`);

/* 4. CON VARIAS, DESPLEGABLE — y NINGUNA escogida. Dejar una puesta es
      escoger por quien tiene el camión enfrente. */
ok(r1.dosTieneSelect, "con dos cédulas pendientes no hay desplegable para escoger");
ok(r1.dosEscogida === "", "con dos cédulas pendientes ya viene una escogida: eso es escoger por quien mira el camión");
ok(r1.dosSinPesadas, "con dos cédulas y ninguna escogida ya muestra unas tolvas pesadas");
ok(r1.dosOpciones.length === 3, `el desplegable trae ${r1.dosOpciones.length} renglones y deberían ser 3 (el «escoge» y las dos)`);
/* 4b. CADA RENGLÓN DICE SUS TOLVAS Y SUS KILOS. Un desplegable de
       códigos —SR-0042, SR-0043— no dice nada: son dos números que se
       parecen, y escoger el de arriba es lo más fácil del mundo. */
ok(r1.dosOpciones.slice(1).every((o) => /\d+ tolvas?/.test(o) && /kg/.test(o)),
   `el desplegable no dice las tolvas y los kilos de cada cédula: ${JSON.stringify(r1.dosOpciones)}`);

/* 5. EL BOTÓN DICE QUE TAMBIÉN DESPACHA, y arranca apagado. */
ok(r1.botones[0].t === "Confirmar salida",
   `sin vidrio el botón debería decir «Confirmar salida» y dice «${r1.botones[0].t}»`);
ok(/despachar/i.test(r1.botones[1].t),
   `con vidrio el botón no dice que también despacha: «${r1.botones[1].t}»`);
ok(r1.botones.every((b) => b.off), "se puede confirmar antes de llenar nada");

/* ======================= 2 · EL FRENO, TOCÁNDOLO ======================= */
/* Aquí es donde un arnés que solo mire el marcado se queda corto: el
   bloque se pinta igual con el freno puesto y sin él. */
const freno = await pg.evaluate(async (T) => {
  const q = (s) => document.querySelector(s);
  const escribe = (el, v) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const esperar = () => new Promise((r) => setTimeout(r, 60));
  const boton = () => q(T.una + " button[type=submit]");

  window.__llamadas = [];
  const doc = q(T.una + " .fc-numero input");
  const cuenta = q(T.una + " .fc-cuenta input");

  // El número puesto, las tolvas todavía no: no puede dejar salir.
  escribe(doc, "7687019429"); await esperar();
  const sinContar = boton().disabled;

  // Las tolvas MAL —tres, y son cuatro—: sigue sin dejar, y lo dice.
  escribe(cuenta, "3"); await esperar();
  const malOff = boton().disabled;
  const malDice = (q(T.una + " .fc-cuadra")?.textContent ?? "").replace(/\s+/g, " ").trim();
  const malClase = q(T.una + " .fc-cuadra")?.className ?? "";
  boton().click(); await esperar();
  const mandoConMal = window.__llamadas.length;

  // Y BIEN: cuatro. Ahora sí.
  escribe(cuenta, "4"); await esperar();
  const bienOff = boton().disabled;
  const bienDice = (q(T.una + " .fc-cuadra")?.textContent ?? "").replace(/\s+/g, " ").trim();
  boton().click(); await esperar();

  return { sinContar, malOff, malDice, malClase, mandoConMal,
           bienOff, bienDice, llamadas: window.__llamadas };
}, T);

ok(freno.sinContar, "con el documento puesto y sin contar las tolvas, el botón ya deja dar salida");
ok(freno.malOff, "con las tolvas descuadradas el botón deja dar salida: el freno no frena");
ok(freno.mandoConMal === 0, "con las tolvas descuadradas ALCANZÓ A MANDAR la salida a la base");
ok(/no cuadra/i.test(freno.malDice) && /4/.test(freno.malDice) && /3/.test(freno.malDice),
   `cuando no cuadra no dice los dos números: «${freno.malDice}»`);
ok(/\bno\b/.test(freno.malClase), "el aviso de que no cuadra no se pinta como problema");
ok(!freno.bienOff, "aun cuadrando, el botón sigue apagado");
ok(/cuadra/i.test(freno.bienDice), `cuando cuadra no lo dice: «${freno.bienDice}»`);

/* Y EL PAQUETE. Es lo único que demuestra que la cédula y las tolvas
   llegan a la base: el resto es pintura. */
const ll = freno.llamadas.at(-1);
ok(ll?.fn === "traspaso_confirmar_salida", `no llamó a confirmar la salida: ${JSON.stringify(freno.llamadas)}`);
ok(ll?.args?.p_cedula === "c1", `no manda la cédula escogida: ${JSON.stringify(ll?.args)}`);
ok(ll?.args?.p_tolvas === 4, `no manda las tolvas CONTADAS: ${JSON.stringify(ll?.args)}`);
ok(ll?.args?.p_documento === "7687019429", `no manda el documento: ${JSON.stringify(ll?.args)}`);

/* Y EL VIAJE SIN VIDRIO NO MANDA CÉDULA. Mandar una cédula en null es
   lo mismo que no mandarla, pero mandar una que no es de ese viaje
   sería despachar vidrio ajeno. */
const limpio = await pg.evaluate(async (T) => {
  const q = (s) => document.querySelector(s);
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  const el = q(T.sin + " .fc-numero input");
  set.call(el, "7687019400"); el.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  window.__llamadas = [];
  q(T.sin + " button[type=submit]").click();
  await new Promise((r) => setTimeout(r, 60));
  return window.__llamadas.at(-1) ?? null;
}, T);
ok(limpio?.args && !("p_cedula" in limpio.args),
   `un viaje sin vidrio manda igual una cédula: ${JSON.stringify(limpio?.args)}`);

/* ======================= 3 · QUE SE LEA, EN LOS SIETE TEMAS ============== */
const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0,0,0]).slice(0,3).map(Number);
                         return c.startsWith("color(") ? n.map((v) => v * 255) : n };
const razon = (a, b) => {
  const lum = (c) => { const [r,g,bl] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4 });
                       return 0.2126*r + 0.7152*g + 0.0722*bl };
  const L1 = lum(a), L2 = lum(b);
  return +((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2);
};
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1200, t);
  const m = await pg.evaluate((T) => {
    const fondo = (e) => {
      for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c }
      return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s);
                         return e ? { txt: getComputedStyle(e).color, fondo: fondo(e) } : { falta: s } };
    return {
      "el aviso de que lleva vidrio": par(T.una + " .fc-vidrio-ojo"),
      "la cédula": par(T.una + " .fc-cedula-una"),
      "los días que lleva esperando": par(T.una + " .fc-espera"),
      "el rótulo de lo pesado": par(T.una + " .fc-pesadas span"),
      "lo pesado": par(T.una + " .fc-pesadas b"),
      "los kilos": par(T.una + " .fc-pesadas i"),
      "¿cuántas lleva el Vh?": par(T.una + " .fc-cuenta label span"),
      "lo que se cuenta": par(T.una + " .fc-cuenta input"),
      "el desplegable": par(T.dos + " select"),
    };
  }, T);
  for (const [k, v] of Object.entries(m)) {
    if (v.falta) { ok(false, `tema ${t ?? "oficial"}: no está «${k}» (${v.falta})`); continue }
    const x = razon(v.txt, v.fondo);
    ok(x >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${x} (mínimo 4.5)`);
  }
}

/* ======================= 4 · PC, TABLET Y CELULAR ======================= */
for (const [ancho, nombre] of [[1440, "pc"], [1024, "tablet apaisada"], [820, "tablet"], [390, "celular"], [360, "celular chico"]]) {
  await monta(ancho);
  const g = await pg.evaluate((T) => {
    const caja = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null };
    const marco = caja(T.una + " .fc-vidrio");
    const cuenta = caja(T.una + " .fc-cuenta input");
    const sel = caja(T.dos + " select");
    const btn = caja(T.una + " button[type=submit]");
    const doc = caja(T.una + " .fc-numero input");
    /* EL RÓTULO DEL NÚMERO: cuántos renglones ocupa de verdad. Tres
       renglones para decir «Número de documento» es el síntoma de que
       la columna se ahogó — y el campo de al lado, con él. */
    const rot = document.querySelector(T.una + " .fc-numero span");
    const rr = document.createRange(); rr.selectNodeContents(rot);
    /* LA CIFRA GRANDE: cuántos renglones ocupa de verdad. Un «4» partido
       en dos renglones no rompe nada —no desborda, no tapa— y por eso
       ningún arnés de los que ya hay lo vería. */
    const b = document.querySelector(T.una + " .fc-pesadas b");
    const rg = document.createRange(); rg.selectNodeContents(b);
    return {
      lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fuera: [...document.querySelectorAll(".fc-vidrio, .fc-cuenta input, .fc-viaje select, .fc-viaje button[type=submit]")]
               .filter((e) => { const r = e.getBoundingClientRect();
                                return r.right > innerWidth + 0.5 || r.left < -0.5 }).length,
      marco: marco?.width ?? 0,
      cuentaAlto: cuenta?.height ?? 0, cuentaAncho: cuenta?.width ?? 0,
      selAlto: sel?.height ?? 0, selAncho: sel?.width ?? 0,
      btnAlto: btn?.height ?? 0,
      renglonesCifra: rg.getClientRects().length,
      cifra: parseFloat(getComputedStyle(b).fontSize),
      docAncho: doc?.width ?? 0,
      renglonesRotulo: rr.getClientRects().length,
    };
  }, T);
  ok(g.lado <= 0, `${nombre} (${ancho}): la bandeja arrastra la página ${g.lado} px de lado`);
  ok(g.fuera === 0, `${nombre} (${ancho}): ${g.fuera} cosa(s) del vidrio quedan fuera de la pantalla`);
  /* EL CAMPO DE CONTAR NO SE PUEDE AHOGAR. Es donde va el dedo de quien
     está de pie frente al camión. `auto` en la columna de al lado se
     come el ancho y no cede —ya pasó en la base del inventario—. */
  ok(g.cuentaAncho >= 90, `${nombre} (${ancho}): el campo de contar las tolvas vive en ${Math.round(g.cuentaAncho)} px`);
  ok(g.cuentaAlto >= 44 && g.selAlto >= 44 && g.btnAlto >= 44,
     `${nombre} (${ancho}): contar ${Math.round(g.cuentaAlto)} px, desplegable ${Math.round(g.selAlto)} px, botón ${Math.round(g.btnAlto)} px (mínimo 44)`);
  ok(g.selAncho <= g.marco + 1,
     `${nombre} (${ancho}): el desplegable (${Math.round(g.selAncho)} px) se sale de su marco (${Math.round(g.marco)} px)`);
  ok(g.renglonesCifra === 1,
     `${nombre} (${ancho}): las tolvas pesadas salen en ${g.renglonesCifra} renglones`);
  /* EL CAMPO DEL DOCUMENTO NO SE PUEDE AHOGAR AL METER EL VIDRIO. Son
     diez cifras: por debajo de 140 px no se ve lo que uno escribió. Ya
     pasó —una regla de dos columnas más específica le ganaba al @media
     del celular y el campo quedó en tres letras— y no se ve en una
     captura de PC. */
  ok(g.docAncho >= 140,
     `${nombre} (${ancho}): el campo del número de documento vive en ${Math.round(g.docAncho)} px`);
  ok(g.renglonesRotulo <= 2,
     `${nombre} (${ancho}): «Número de documento» sale en ${g.renglonesRotulo} renglones: la columna se ahogó`);
  ok(g.cifra >= 22, `${nombre} (${ancho}): las tolvas pesadas salen a ${g.cifra} px y no se leen desde el muelle`);
  await pg.screenshot({ path: `.arnes/fc-cedula-${ancho}.png` });
}

await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ La cédula: el Vh sin vidrio no ve nada, con una viene escogida, con varias hay desplegable con sus tolvas y sus kilos, " +
            "las tolvas descuadradas NO dejan mandar la salida, y el paquete lleva la cédula y lo contado. En los siete temas y en los cinco anchos.");
