/* =====================================================================
   EL MAESTRO DE OPERARIOS OPM — la pantalla, en Chromium.

   «Colocaré el PIN a cada OPM, que ese será como la clave para que en
    el informe oculto tengamos hora, turno, fecha, nombre del operador.»

   SIN ESTA PANTALLA, LA OTRA NO SIRVE. La de Registrar pide un PIN y
   contesta «ese PIN no es de ningún operario activo» — para siempre,
   porque no hay dónde cargarlos. Esa es exactamente la entrega a
   medias que ya se hizo una vez en este módulo.

   Lo que se mide:
     1. LOS PIN SE VEN. Es una decisión, no un descuido: taparlos con
        puntitos le quita al administrador la mitad de la razón de
        entrar aquí —recordarle el PIN al que lo olvidó—.
     2. NO HAY BORRAR, SE APAGA. Borrar a alguien que ya reportó deja
        esas roturas sin dueño.
     3. UN PIN REPETIDO SE FRENA EN LA PANTALLA, antes del viaje.
     4. EL PIN SE MANDA SIN PUNTOS NI LETRAS, y con el `p_id` en null
        cuando es nuevo.
     5. SE DICE CUÁNTOS NO HAN REPORTADO NADA: un maestro cargado que
        nadie usa se ve igual que uno que se usa todos los días.
     6. VACÍO SE EXPLICA: «mientras esté vacío, en Registrar solo se
        puede decir me la encontré».
     7. Nada se sale a 1440 / 820 / 390 / 360, y lo que se toca mide
        44 px o más.

     node .arnes/rt-operarios.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* Un arnés tiene que hablar antes de morirse: ya pasó dos veces que la
   mutación se detecta y el script revienta dos pasos después por otra
   cosa, sin imprimir ni verde ni roja. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_nav-op.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);

writeFileSync(R(".arnes/_supa-op.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    return { data: "id-nuevo", error: null };
  },
});`);

writeFileSync(R(".arnes/_op-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Operarios } from "../src/app/(app)/roturas/Operarios";

/* Doce para que salga el buscador —aparece pasando de ocho— y para que
   «cuántos no han reportado nada» mida algo. Uno apagado, y uno con
   roturas encima para el caso de «este no se puede borrar». */
const lista = [
  ["o1","4021","Genesis Visbal","Easy","B",true,null,37],
  ["o2","5510","Jose Palacio","Easy","A",true,null,12],
  ["o3","6677","Marta Ospino","Easy",null,true,null,0],
  ["o4","7781","Luis Carrillo","Easy","C",true,"Entro en septiembre",0],
  ["o5","8890","Andrea Mejia","Easy","A",true,null,4],
  ["o6","1123","Pedro Nieto","Easy","B",true,null,0],
  ["o7","2234","Sandra Gil","Easy","C",true,null,9],
  ["o8","3345","Ivan Robles","Easy","A",true,null,1],
  ["o9","4456","Carmen Daza","Easy","B",true,null,0],
  ["o10","5567","Hector Pava","Easy","C",true,null,2],
  ["o11","6678","Nubia Fontalvo","Easy","A",false,"Ya no esta",8],
  ["o12","7789","Oscar Bermudez","Easy","B",true,null,0],
].map(([id,pin,nombre,empresa,turno,activo,nota,roturas]: any) =>
  ({ id, pin, nombre, empresa, turno, activo, nota, roturas }));

createRoot(document.getElementById("r")!).render(
  <Operarios lista={lista as any} puedeEditar />);
`);

/* Y una segunda entrada con la lista VACÍA: es el estado en el que el
   módulo nace, y el único en el que la pantalla tiene que EXPLICARSE. */
writeFileSync(R(".arnes/_op-vacio.tsx"), `
import { createRoot } from "react-dom/client";
import { Operarios } from "../src/app/(app)/roturas/Operarios";
createRoot(document.getElementById("r")!).render(
  <Operarios lista={[]} puedeEditar />);
`);

const armar = (entrada) => buildSync({
  entryPoints: [R(entrada)], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-op.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-op.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const js = armar(".arnes/_op-entrada.tsx");
const jsVacio = armar(".arnes/_op-vacio.tsx");

const css   = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob  = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (ancho = 1440, tema = "", cual = js, alto = 1000) => {
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
const teclear = async (sel, v) => {
  /* CON EL SETTER NATIVO Y NO CON `fill`: en un campo controlado por
     React el rastreador de valor puede no ver el cambio de `fill`, y
     entonces el DOM dice una cosa y el componente sigue en otra. La
     pantalla se ve bien y la prueba falla por la razón equivocada.
     Costó media hora encontrarlo la primera vez. */
  await pg.evaluate(([s, val]) => {
    const el = document.querySelector(s);
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [sel, v]);
};

/* ---------------------------------------------------------------------
   1 · LOS PIN SE VEN, Y SE VEN TODOS
   ------------------------------------------------------------------ */
await monta();
{
  const pines = await pg.$$eval(".rt .fila .cod", (e) => e.map((x) => x.textContent.trim()));
  ok(pines.length === 12, `salen ${pines.length} operarios y el maestro tiene 12`);
  ok(pines.includes("4021") && pines.includes("7789"),
     `los PIN no salen en claro: ${pines.slice(0, 3).join(", ")}`);
  ok(!pines.some((p) => /[•*]/.test(p)),
     "los PIN salen tapados: entonces el administrador no puede recordárselo al que lo olvidó, que es media razón de entrar aquí");

  /* Y CADA FILA DICE DE QUIÉN ES. Un PIN suelto no sirve para nada. */
  const nombres = await pg.$$eval(".rt .fila .tit", (e) => e.map((x) => x.textContent.trim()));
  ok(nombres[0] === "Genesis Visbal", `la primera fila dice «${nombres[0]}»`);
}

/* ---------------------------------------------------------------------
   2 · NO HAY BORRAR — SE APAGA
   ------------------------------------------------------------------ */
{
  const botones = await pg.$$eval(".rt .fila .par button", (b) => b.map((x) => x.textContent.trim()));
  ok(!botones.some((t) => /borrar|eliminar/i.test(t)),
     "hay un botón de borrar: borrar a quien ya reportó deja esas roturas apuntando a nadie");
  ok(botones.includes("Apagar"), `no está el botón de apagar: ${[...new Set(botones)].join(" | ")}`);
  /* El apagado ofrece ENCENDER y se ve distinto. */
  ok((await pg.$$(".rt .fila.gris")).length === 1,
     "el operario apagado no se ve distinto de los demás");
  const gris = await pg.$$eval(".rt .fila.gris .par button", (b) => b.map((x) => x.textContent.trim()));
  ok(gris.includes("Encender"), `al apagado no se le ofrece encender: ${gris.join(" | ")}`);
  ok(/APAGADO/.test(await pg.textContent(".rt .fila.gris .meta")),
     "el apagado no dice que está apagado en su renglón");
}

/* ---------------------------------------------------------------------
   3 · APAGAR NO TOCA EL PIN NI EL NOMBRE

   Se guarda por la MISMA función que edita, así que es fácil que un
   descuido mande el resto en blanco y el operario quede apagado Y sin
   nombre. Se exige que viaje completo.
   ------------------------------------------------------------------ */
{
  await pg.click(".rt .fila:first-child .par button:has-text('Apagar')");
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 2000 })
    .catch(() => {});
  const l = (await llamadas()).find((x) => x.f === "operario_guardar");
  ok(!!l, "apagar no llama a la base");
  ok(l?.a?.p_activo === false, `al apagar se mandó p_activo = ${l?.a?.p_activo}`);
  ok(l?.a?.p_id === "o1", `apagar no dice a quién: ${l?.a?.p_id}`);
  ok(l?.a?.p_pin === "4021" && l?.a?.p_nombre === "Genesis Visbal",
     `apagar mandó el operario a medias: pin=${l?.a?.p_pin} nombre=${l?.a?.p_nombre}`);
}

/* ---------------------------------------------------------------------
   4 · EL PIN REPETIDO SE FRENA AQUÍ, NO EN LA BASE

   La base tiene el único índice de verdad y lo va a rechazar igual.
   Pero «duplicate key value violates unique constraint» llegando
   después de guardar no le dice nada a nadie, y el nombre ya se
   tecleó entero.
   ------------------------------------------------------------------ */
await monta();
{
  await pg.click(".rt .caja .cab button:has-text('Agregar')");
  await pg.waitForSelector("#op-pin");
  await teclear("#op-pin", "5510");            // ya es de Jose Palacio
  await teclear("#op-nom", "Otro Cualquiera");
  await pg.click(".rt .panel .acciones-panel button.si");
  const l = (await llamadas()).filter((x) => x.f === "operario_guardar");
  ok(l.length === 0, "un PIN repetido se manda igual a la base: el aviso llega después de guardar");
  const txt = await pg.textContent(".rt");
  ok(/Jose Palacio/.test(txt),
     "al repetir un PIN no se dice DE QUIÉN es ya: sin eso hay que buscarlo a mano en la lista");
}

/* ---------------------------------------------------------------------
   5 · UN PIN CORTO NO PASA, Y UN NOMBRE VACÍO TAMPOCO
   ------------------------------------------------------------------ */
await monta();
{
  await pg.click(".rt .caja .cab button:has-text('Agregar')");
  await pg.waitForSelector("#op-pin");
  await teclear("#op-pin", "12");
  await teclear("#op-nom", "Pedro Corto");
  await pg.click(".rt .panel .acciones-panel button.si");
  ok((await llamadas()).length === 0, "un PIN de dos dígitos se manda a la base igual");

  await teclear("#op-pin", "9999");
  await teclear("#op-nom", "");
  await pg.click(".rt .panel .acciones-panel button.si");
  ok((await llamadas()).length === 0,
     "se guarda un PIN sin nombre: un PIN que no trae un nombre no sirve para nada");
}

/* ---------------------------------------------------------------------
   6 · EL PIN VIAJA LIMPIO, Y NUEVO VA CON p_id EN NULL
   ------------------------------------------------------------------ */
await monta();
{
  await pg.click(".rt .caja .cab button:has-text('Agregar')");
  await pg.waitForSelector("#op-pin");
  /* Se teclea con basura a propósito: el campo tiene que quedarse solo
     con los dígitos. Un PIN con un espacio adentro es otro PIN. */
  await teclear("#op-pin", "90 1-2a");
  await teclear("#op-nom", "  Rosa Pérez  ");
  await teclear("#op-tur", "A");
  await pg.click(".rt .panel .acciones-panel button.si");
  await pg.waitForFunction(() => (window.llamadas ?? []).length > 0, null, { timeout: 2000 })
    .catch(() => {});
  const l = (await llamadas()).find((x) => x.f === "operario_guardar");
  ok(!!l, "agregar un operario no llama a la base");
  ok(l?.a?.p_pin === "9012", `el PIN viajó sucio: ${JSON.stringify(l?.a?.p_pin)}`);
  ok(l?.a?.p_id === null, `un operario nuevo viaja con p_id = ${JSON.stringify(l?.a?.p_id)} y debe ir en null`);
  ok(l?.a?.p_nombre === "Rosa Pérez", `el nombre viajó con espacios: ${JSON.stringify(l?.a?.p_nombre)}`);
  ok(l?.a?.p_turno === "A", `no se mandó el turno: ${JSON.stringify(l?.a?.p_turno)}`);
  ok(l?.a?.p_activo === true, "un operario nuevo no nace encendido");
}

/* ---------------------------------------------------------------------
   7 · SE DICE CUÁNTOS NO HAN REPORTADO NADA

   Es la única cifra que distingue un maestro que se usa de uno que se
   cargó y ahí quedó. Cinco activos con cero roturas en el fixture.
   ------------------------------------------------------------------ */
await monta();
{
  const cab = await pg.textContent(".rt .caja .cab");
  ok(/11 operarios con PIN/.test(cab), `la cabecera dice «${cab.split("\n")[0].trim()}» y hay 11 activos`);
  ok(/5 todavía no han reportado ninguna/.test(cab),
     "no se dice cuántos no han reportado nada: un maestro cargado que nadie usa se ve igual que uno que se usa a diario");
  /* Y cada fila lo dice por su cuenta. */
  ok(/sin roturas reportadas/.test(await pg.textContent(".rt .rueda")),
     "las filas no dicen cuáles no han reportado ninguna");
}

/* ---------------------------------------------------------------------
   8 · BUSCAR, PORQUE ESTO SE CARGA DE A CIEN
   ------------------------------------------------------------------ */
{
  ok(await pg.isVisible(".rt .op-busca"), "con doce operarios no hay dónde buscar");
  await teclear(".rt .op-busca", "ospino");
  ok((await pg.$$(".rt .fila")).length === 1,
     "buscar por nombre no filtra la lista");
  await teclear(".rt .op-busca", "7789");
  ok((await pg.$$(".rt .fila")).length === 1, "no se puede buscar por el PIN, que es lo que se tiene a mano");
  await teclear(".rt .op-busca", "zzz");
  ok(/Ninguno dice/.test(await pg.textContent(".rt .rueda")),
     "cuando no hay ninguno la lista se queda en blanco sin decir por qué");
}

/* ---------------------------------------------------------------------
   9 · VACÍO SE EXPLICA

   Es el estado en el que nace el módulo y el único en el que la
   pantalla TIENE que explicarse: quien entra por primera vez no sabe
   qué pasa en Registrar si esto está en cero.
   ------------------------------------------------------------------ */
await monta(1440, "", jsVacio);
{
  const t = await pg.textContent(".rt .rueda");
  ok(/Todavía no hay operarios/.test(t), "la lista vacía no dice que está vacía");
  ok(/me la encontré/i.test(t),
     "la lista vacía no dice qué pasa en Registrar mientras tanto: es la pregunta que va a hacer quien entre");
  ok(await pg.isVisible(".rt .caja .cab button:has-text('Agregar')"),
     "con la lista vacía ni siquiera está el botón de agregar el primero");
  ok((await pg.$$(".rt .op-busca")).length === 0,
     "con la lista vacía sale un buscador para buscar entre cero");
}

/* ---------------------------------------------------------------------
   10 · LOS CUATRO ANCHOS, Y LO QUE SE TOCA
   ------------------------------------------------------------------ */
for (const [ancho, nombre] of [[1440, "pc"], [820, "tab"], [390, "cel"], [360, "360"]]) {
  await monta(ancho);
  await pg.click(".rt .caja .cab button:has-text('Agregar')");
  await pg.waitForSelector("#op-pin");
  const r = await pg.evaluate(() => {
    const a = document.documentElement.clientWidth, fuera = [], chicos = [];
    for (const el of document.querySelectorAll(".rt *")) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.right > a + .5 || b.left < -.5)) fuera.push(el.className || el.tagName);
      if (["BUTTON", "SELECT", "INPUT"].includes(el.tagName) && b.height > 0 && b.height < 44)
        chicos.push((el.className || el.tagName) + " h=" + Math.round(b.height));
    }
    return { scroll: document.documentElement.scrollWidth, ancho: a,
             fuera: [...new Set(fuera)].slice(0, 4), chicos: [...new Set(chicos)].slice(0, 4) };
  });
  ok(r.scroll <= r.ancho + .5, `${nombre}: la página se desplaza a lo ancho (${r.scroll} > ${r.ancho})`);
  ok(!r.fuera.length, `${nombre}: se sale ${r.fuera.join(" | ")}`);
  ok(!r.chicos.length, `${nombre}: no se alcanza con el dedo ${r.chicos.join(" | ")}`);
  if (ancho === 390 || ancho === 1440) {
    await pg.screenshot({ path: `.arnes/rt-operarios-${nombre}.png`, fullPage: ancho < 900 });
  }
  console.log(`${nombre.padEnd(4)} ${String(ancho).padStart(5)}px  ${r.fuera.length || r.chicos.length ? "MAL" : "bien"}`);
}

/* ---------------------------------------------------------------------
   11 · SE LEE EN LOS SIETE TEMAS

   El PIN es el dato de esta pantalla: si en dos de los siete temas
   queda gris sobre gris, la pantalla no sirve justo donde se usa.
   ------------------------------------------------------------------ */
for (const tema of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, tema);
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
      const a = lum(getComputedStyle(el).color), b = lum(fondoDe(el));
      return Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 10) / 10;
    };
    return { pin: razon(".rt .fila .cod"), nombre: razon(".rt .fila .tit"),
             meta: razon(".rt .fila .meta span") };
  });
  const flojos = Object.entries(r).filter(([, v]) => v < 4.5);
  ok(flojos.length === 0,
     `${tema || "oficial"}: no se lee ${flojos.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`${(tema || "oficial").padEnd(8)} pin ${r.pin}  nombre ${r.nombre}  meta ${r.meta}`);
}

await nav.close();

if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\n✓ Operarios: los PIN se ven (a propósito), no hay borrar sino apagar, el PIN repetido y el corto se frenan en la pantalla, el PIN viaja limpio, se dice cuántos no han reportado nada, y la lista vacía explica qué pasa mientras tanto en Registrar.");
