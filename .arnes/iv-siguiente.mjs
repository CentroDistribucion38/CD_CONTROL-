/* =====================================================================
   EL DESPLEGABLE ARRANCA DONDE UNO QUEDÓ

   «Cuando vaya a seguir, que me quede cerca en el desplegable: si
    selecciono los que siguen, o sea C, y así, con el fin de que el
    scroll sea menos. Con el módulo igual: si antes tenía P40 y sigo y
    me sale P40, perfecto; pero si selecciono el módulo me debe aparecer
    el 41, o sea los que siguen.»

   POR QUÉ ESTE ARNÉS Y NO UNA MIRADA: una lista que abre arriba y una
   que abre en el renglón 41 se ven EXACTAMENTE IGUAL en una captura —la
   captura recorta lo mismo—. La diferencia es cuánto hay que rodar, y
   eso solo se ve midiendo el `scrollTop` de la lista y cuál renglón
   queda resaltado. Es además la clase de detalle que se pierde sola al
   tocar el componente por otra cosa.

   Y SE MIDE LO QUE DE VERDAD DUELE: cuántos renglones hay que rodar
   para llegar al siguiente. Antes eran cuarenta; tienen que ser cero.

     node .arnes/iv-siguiente.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => U("../" + p).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* VA DENTRO DE `.fe`: los estilos de la lista —el alto máximo y el
   scroll, que es justo lo que esto mide— cuelgan de esa clase. Fuera de
   ella la lista sale entera, no hay nada que rodar, y la prueba pasaría
   siempre sin medir nada. Pasó: la primera versión de este arnés decía
   que sí con la lista sin recortar.

   SE MONTA EL BUSCADOR DE VERDAD, no la pantalla entera de conteo: lo
   que se mide es el componente, y montarlo solo deja escribir el caso
   que duele —cincuenta módulos, parado en el 40— sin depender de un
   maestro de prueba que alguien cambie mañana por otra cosa.

   La pantalla de conteo tiene su propio arnés (.arnes/inv-conteo.mjs) y
   ahí se comprueba que los dos desplegables PIDAN esta conducta. */
writeFileSync(R(".arnes/_bs-entrada.tsx"), `
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Buscador } from "../src/components/Buscador";

const MODULOS = Array.from({ length: 50 }, (_, i) =>
  ({ valor: "P|" + String(i + 1).padStart(2, "0"), texto: String(i + 1).padStart(2, "0") }));
const CALLES = ["A", "B", "C", "D", "E"].map((c) => ({ valor: c, texto: c }));

function Caja() {
  const [mod, setMod] = useState("P|40");
  const [calle, setCalle] = useState("B");
  const [suelto, setSuelto] = useState("");
  return (
    <div className="fe" style={{ padding: 20, display: "grid", gap: 16, width: 320 }}>
      <label id="caja-mod"><span>Módulo</span>
        <Buscador valor={mod} opciones={MODULOS} onEscoge={setMod} desdeElSiguiente /></label>
      <label id="caja-calle"><span>Calle</span>
        <Buscador valor={calle} opciones={CALLES} onEscoge={setCalle} desdeElSiguiente /></label>
      {/* SIN NADA PUESTO: tiene que abrir arriba, como siempre. */}
      <label id="caja-suelto"><span>Sin escoger</span>
        <Buscador valor={suelto} opciones={MODULOS} onEscoge={setSuelto} desdeElSiguiente /></label>
      {/* Y EL QUE NO LO PIDE NO CAMBIA. */}
      <label id="caja-viejo"><span>Como antes</span>
        <Buscador valor={"P|40"} opciones={MODULOS} onEscoge={() => {}} /></label>
    </div>
  );
}
createRoot(document.getElementById("r")!).render(<Caja />);
`);

let js;
try {
  js = buildSync({
    entryPoints: [R(".arnes/_bs-entrada.tsx")], bundle: true, write: false,
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
const fefo = readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.setViewportSize({ width: 420, height: 900 });
await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
  <style>${PREFLIGHT}${glob}${fefo} html,body{margin:0}</style></head>
  <body><div id="r"></div><script>${js}</script></body></html>`);
await pg.waitForSelector("#caja-mod .bs-campo");

/* Abre una caja y devuelve lo que importa: cuál renglón quedó
   resaltado, cuántos renglones hay que rodar para verlo, y si el que
   estaba puesto quedó a la vista. */
const abrir = async (caja) => {
  await pg.click(`${caja} .bs-campo`);
  await pg.waitForSelector(`${caja} .bs-lista`);
  /* Dos cuadros: el scroll se acomoda en un requestAnimationFrame. */
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const r = await pg.evaluate((c) => {
    const ul = document.querySelector(`${c} .bs-lista`);
    const lis = [...ul.querySelectorAll("li")];
    const on = lis.findIndex((l) => l.classList.contains("on"));
    const puesta = lis.findIndex((l) => l.classList.contains("puesta"));
    const cajaUl = ul.getBoundingClientRect();
    const ver = (i) => {
      if (i < 0) return false;
      const b = lis[i].getBoundingClientRect();
      return b.top >= cajaUl.top - 1 && b.bottom <= cajaUl.bottom + 1;
    };
    return {
      on, puesta, texto: on >= 0 ? lis[on].textContent.trim() : null,
      scroll: Math.round(ul.scrollTop),
      seVeLaSiguiente: ver(on), seVeLaPuesta: ver(puesta),
      alto: Math.round(cajaUl.height),
      /* CUÁNTOS RENGLONES HAY QUE BAJAR LA VISTA para llegar al
         resaltado, contados desde el borde de arriba de la lista. Se
         mide por rectángulos y no por `offsetTop`, que cuenta desde el
         ancestro posicionado y da una cuenta corrida. */
      rodar: on >= 0
        ? Math.max(0, Math.round(
            (lis[on].getBoundingClientRect().top - cajaUl.top) /
            (lis[0].getBoundingClientRect().height || 1)))
        : -1,
    };
  }, caja);
  /* ESCAPE CIERRA PERO NO SUELTA EL FOCO —es lo correcto: quien cerró
     por error vuelve a abrir con una flecha—. Aquí sí hay que soltarlo,
     porque si no, el siguiente clic sobre el MISMO campo no dispara el
     `focus` y la lista no vuelve a abrir. */
  await pg.keyboard.press("Escape");
  await pg.evaluate(() => (document.activeElement)?.blur?.());
  return r;
};

/* ---------------------------------------------------------------------
   1 · EL MÓDULO: parado en el 40, abre en el 41
   ------------------------------------------------------------------ */
{
  const m = await abrir("#caja-mod");
  ok(m.on === 40, `estando en el 40 queda resaltado el renglón ${m.on} y debería ser el 41 (índice 40)`);
  ok(m.texto === "41", `el resaltado dice «${m.texto}» y debería decir «41»`);
  ok(m.seVeLaSiguiente, "el 41 quedó resaltado pero fuera de la parte visible de la lista: hay que rodar igual");
  ok(m.seVeLaPuesta, "el 40 —de donde uno viene— no se ve: el 41 se lee como un renglón cualquiera");
  ok(m.rodar <= 1, `hay que rodar ${m.rodar} renglón(es) para llegar al siguiente; antes eran cuarenta y tienen que ser cero`);
}

/* ---------------------------------------------------------------------
   2 · LA CALLE: parado en B, abre en C
   ------------------------------------------------------------------ */
{
  const c = await abrir("#caja-calle");
  ok(c.texto === "C", `estando en la calle B el resaltado dice «${c.texto}» y debería decir «C»`);
}

/* ---------------------------------------------------------------------
   3 · SIN NADA PUESTO, ABRE ARRIBA — como siempre

   Es el primer renglón del día. Saltar a la mitad de la lista sin que
   nadie haya escogido nada sería peor que el problema que esto arregla.
   ------------------------------------------------------------------ */
{
  const s = await abrir("#caja-suelto");
  ok(s.on === 0, `sin nada escogido la lista arranca en el renglón ${s.on} y tiene que arrancar arriba`);
  ok(s.scroll === 0, `sin nada escogido la lista ya viene rodada ${s.scroll} px`);
}

/* ---------------------------------------------------------------------
   4 · EL QUE NO LO PIDE NO CAMBIA

   La conducta es opcional a propósito: un desplegable donde uno CORRIGE
   lo que escogió mal tiene que abrir en lo que está puesto, no en lo
   siguiente. Si algún día se vuelve el comportamiento de todos, que sea
   una decisión y no un descuido.
   ------------------------------------------------------------------ */
{
  const v = await abrir("#caja-viejo");
  ok(v.on === 0, `el buscador que NO lo pide arranca en el renglón ${v.on} y debería arrancar arriba`);
  ok(v.scroll === 0, `el buscador que NO lo pide ya viene rodado ${v.scroll} px`);
}

/* ---------------------------------------------------------------------
   5 · TECLEAR MANDA SOBRE TODO

   Quien escribe «07» está buscando el 07, no el siguiente al 40. Si el
   resaltado se quedara en el 41, Enter escogería un módulo que no es el
   que se tecleó — y eso es peor que rodar.
   ------------------------------------------------------------------ */
{
  await pg.evaluate(() => (document.activeElement)?.blur?.());
  await pg.click("#caja-mod .bs-campo");
  await pg.type("#caja-mod .bs-campo", "07");
  await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const r = await pg.evaluate(() => {
    const lis = [...document.querySelectorAll("#caja-mod .bs-lista li")];
    const on = lis.findIndex((l) => l.classList.contains("on"));
    return { n: lis.length, on, texto: on >= 0 ? lis[on].textContent.trim() : null };
  });
  ok(r.n === 1 && r.texto === "07",
     `tecleando «07» la lista deja ${r.n} renglón(es) y el resaltado dice «${r.texto}»`);
  await pg.keyboard.press("Escape");
  await pg.evaluate(() => (document.activeElement)?.blur?.());
}

/* ---------------------------------------------------------------------
   6 · Y AL ESCOGER, LA SIGUIENTE VEZ ARRANCA EN LA NUEVA

   Es lo que hace que sirva contando: se anota el 41, se vuelve a abrir
   y está el 42. Si se quedara clavado en el 41 habría que rodar uno
   cada vez, que es el mismo problema más pequeño.
   ------------------------------------------------------------------ */
{
  await pg.evaluate(() => (document.activeElement)?.blur?.());
  await pg.click("#caja-mod .bs-campo");
  await pg.waitForSelector("#caja-mod .bs-lista");
  await pg.evaluate(() => {
    const li = [...document.querySelectorAll("#caja-mod .bs-lista li")]
      .find((l) => l.textContent.trim().startsWith("41"));
    li.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  const m = await abrir("#caja-mod");
  ok(m.texto === "42",
     `después de anotar el 41, al volver a abrir el resaltado dice «${m.texto}» y debería decir «42»`);
}

/* ---------------------------------------------------------------------
   7 · EL ÚLTIMO NO SE SALE POR EL FINAL
   ------------------------------------------------------------------ */
{
  await pg.evaluate(() => (document.activeElement)?.blur?.());
  await pg.click("#caja-mod .bs-campo");
  await pg.waitForSelector("#caja-mod .bs-lista");
  await pg.evaluate(() => {
    const lis = [...document.querySelectorAll("#caja-mod .bs-lista li")];
    lis[lis.length - 1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  const m = await abrir("#caja-mod");
  ok(m.on === 49 && m.texto === "50",
     `estando en el último, el resaltado queda en el renglón ${m.on} («${m.texto}») en vez de quedarse en el 50`);
  ok(m.seVeLaSiguiente, "estando en el último, el resaltado quedó fuera de la parte visible");
}

/* ---------------------------------------------------------------------
   8 · Y LOS DOS DESPLEGABLES DE CONTAR LO PIDEN

   Que el componente sepa hacerlo no sirve de nada si la pantalla no se
   lo pide. Se comprueba en el archivo, que es donde vive la decisión.
   ------------------------------------------------------------------ */
{
  const c = readFileSync(R("src/app/(app)/inventario/conteo/Contar.tsx"), "utf8");
  ok((c.match(/desdeElSiguiente/g) ?? []).length === 2,
     "los desplegables de Calle y Módulo de Contar no piden los dos arrancar en el siguiente");
}

await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Los desplegables arrancan donde uno quedó: parado en el 40 abre en el 41 sin rodar, en la calle B abre en la C, " +
            "sin nada escogido abre arriba, teclear manda, y al anotar el 41 la siguiente vez abre en el 42.");
