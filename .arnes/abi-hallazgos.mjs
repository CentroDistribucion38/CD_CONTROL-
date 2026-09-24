/* =====================================================================
   ABI · HALLAZGOS E INFORME — medido sobre lo que se pinta.

   «Con ABI es cargar evidencias, hallazgos, colocar la información,
    guardar y luego nosotros darle como que reescribir en palabras
    técnicas y que se genere el informe de los hallazgos.»

   LO QUE TIENE QUE SER CIERTO, o el módulo publica cosas que nadie
   revisó:

   1. LA MÁQUINA PROPONE Y NO DECIDE. Apretar «Redactar técnico» puede
      llamar a `hallazgo_ia_guardar` —dejar constancia de qué propuso—
      pero NUNCA a `hallazgo_redactar`. Si la propuesta se guardara como
      la redacción del informe, «lo aprobó alguien» sería mentira y no
      habría forma de notarlo.

   2. LOS DOS TEXTOS, A LA VISTA Y DEL MISMO ANCHO. Es lo único que deja
      comprobar que la redacción dice lo mismo que se vio. Con una
      detrás de un «Ver», nadie compara.

   3. EL BOTÓN DE APROBAR DICE QUÉ FALTA cuando está apagado. Apagado y
      mudo se toca tres veces y después se llama a preguntar.

   4. AL INFORME SOLO ENTRA LO APROBADO, y el informe DICE cuántos
      quedaron por fuera. Esconderlos hace creer que eso fue todo lo que
      se encontró.

   5. LA FOTO DEL DESPUÉS TIENE DÓNDE SUBIRSE Y SE VE QUE FALTA. Sin
      eso el informe sale siempre con la mitad derecha en blanco.

   6. NI UNA ESQUINA REDONDA, nada que se salga en tableta ni en
      celular, y 44 px para tocar con guante.

     node .arnes/abi-hallazgos.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

/* ---------------------------------------------------------------------
   6a. NADA REDONDO — leído del CSS, con los comentarios fuera.

   ESTE PROYECTO EXPLICA CADA REGLA, y la explicación de por qué algo
   dejó de ser redondo lleva escrito «border-radius: 14px» en la prosa:
   sin quitar los comentarios el arnés se pone rojo por su propio texto.
   Ya pasó dos veces.
   ------------------------------------------------------------------ */
{
  const arch = "src/app/(app)/acciones/abi/abi.css";
  const css = readFileSync(R(arch), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const malos = [...css.matchAll(/border-radius:\s*([^;}]+)/g)]
    .map((m) => m[1].trim())
    .filter((v) => !/^0$/.test(v) && !/50%/.test(v));
  ok(malos.length === 0,
     `abi.css tiene ${malos.length} esquina(s) redondeada(s): ${[...new Set(malos)].join(", ")}`);
}

/* ---------------------------------------------------------------------
   1b. LA RUTA DE LA IA NO GUARDA — leído del código del servidor.

   Lo de arriba se mide en la pantalla; esto se mide en el servidor,
   que es donde alguien podría "arreglar" el ida y vuelta guardando de
   una vez. Si algún día aparece un `hallazgo_redactar` en esa ruta,
   esto se pone rojo antes de que salga un informe sin revisar.
   ------------------------------------------------------------------ */
{
  const ruta = readFileSync(R("src/app/api/acciones/redactar/route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok(!/hallazgo_redactar/.test(ruta),
     "la ruta de la IA guarda la redacción por su cuenta: eso deja de ser «lo aprobó alguien»");
  ok(/hallazgo_puede_editar/.test(ruta),
     "la ruta de la IA no comprueba el permiso: a una ruta se llega escribiéndola");
  ok(/ANTHROPIC_API_KEY/.test(ruta) && /process\.env/.test(ruta),
     "la llave del modelo no sale de una variable del servidor");
}

/* ------------------------- EL MONTAJE ------------------------- */
writeFileSync(R(".arnes/_nav-hz.ts"),
  `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });
export const useSearchParams = () => new URLSearchParams("");`);

/* EL DOBLE DE SUPABASE APUNTA TODO LO QUE LE PIDEN. Es la única forma
   de comprobar qué se guardó y qué no: mirar la pantalla no distingue
   un texto que está en el campo de uno que ya viajó a la base. */
writeFileSync(R(".arnes/_supa-hz.ts"), `
const apuntar = (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
};
export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    apuntar(f, a);
    return { data: f === "hallazgo_borrar" ? (a?.p_ids ?? []).length : { accion_codigo: "AC-0099" },
             error: null };
  },
  from: (t: string) => ({
    select: (c?: string) => ({
      eq: () => ({ order: () => Promise.resolve({ data: [], error: null }),
                   then: (r: any) => r({ data: [], error: null }) }),
      in: () => ({ order: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    }),
    insert: async (fila: any) => { apuntar("insert:" + t, fila); return { error: null } },
  }),
  storage: { from: () => ({
    upload: async (ruta: string) => { apuntar("upload", { ruta }); return { error: null } },
    createSignedUrl: async () => ({ data: { signedUrl: "" } }),
  }) },
});`);

writeFileSync(R(".arnes/_hz-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Hallazgos } from "../src/app/(app)/acciones/abi/hallazgos/Hallazgos";
import { Informe } from "../src/app/(app)/acciones/abi/informe/Informe";

const base = (i: number, o: any = {}) => ({
  id: "h" + i, codigo: "HZ-000" + i, fecha: "2026-09-10",
  tema: "inocuidad", tema_nombre: "Inocuidad", severidad: "hallazgo",
  area: "almacenamiento", area_nombre: "Almacenamiento",
  zona: "P3", zona_nombre: "Pasillo 3", ubicacion: "Estiba del fondo",
  lo_que_se_vio: "Había una estiba de producto terminado pegada a la pared del pasillo tres, " +
                 "tapando el extintor.",
  redaccion: null, redactado_por: null, redactado_en: null,
  ia_borrador: null, ia_en: null, recomendacion: "Reubicar la estiba y demarcar el acceso.",
  estado: "borrador", accion_id: null, accion_codigo: null, accion_estado: null,
  creado_por: "u1", creado_en: "2026-09-10T12:00:00Z",
  anulado_en: null, motivo_anulacion: null,
  fotos: 1, fotos_antes: 1, fotos_despues: 0,
  falta_redaccion: true, tal_cual_de_la_ia: false, tiene_accion: false, ...o,
});

/* DOS SIN REDACTAR Y DOS APROBADOS A PROPÓSITO: con todos iguales, «al
   informe solo entra lo aprobado» pasaría sin probar nada. */
const REDACTADO = {
  redaccion: "Se evidencia una estiba de producto terminado ubicada contra el muro del pasillo " +
             "tres, obstruyendo el acceso al extintor.",
  redactado_por: "u2", redactado_en: "2026-09-11T12:00:00Z",
  estado: "firme", falta_redaccion: false,
};
const hallazgos = [
  base(1),
  base(2, { severidad: "critico" }),
  base(3, REDACTADO),
  base(4, { ...REDACTADO, fotos: 2, fotos_antes: 1, fotos_despues: 1,
            tiene_accion: true, accion_id: "a1", accion_codigo: "AC-0042" }),
];

const cual = (window as any).__QUE__;
createRoot(document.getElementById("r")!).render(
  cual === "informe"
    ? <Informe hallazgos={hallazgos as any}
               temas={[{ clave: "inocuidad", nombre: "Inocuidad", activo: true, orden: 1 }]}
               nombres={{ u1: "Genesis Visbal", u2: "Cristian Pavia" }}
               hoy="2026-09-24" />
    : <Hallazgos hallazgos={hallazgos as any}
                 nombres={{ u1: "Genesis Visbal", u2: "Cristian Pavia" }}
                 motivos={[{ clave: "orden", nombre: "Orden y aseo" } as any]}
                 puedeEditar manda={(window as any).__MANDA__} />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_hz-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-hz.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-hz.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const acc = readFileSync(R("src/app/(app)/acciones/acciones.css"), "utf8");
const abi = readFileSync(R("src/app/(app)/acciones/abi/abi.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

/* LA PÁGINA SE SIRVE DESDE UNA DIRECCIÓN DE VERDAD, no con
   `setContent`. Con `setContent` la página vive en `about:blank` y un
   `fetch("/api/...")` no tiene contra qué resolverse: se cae sin decir
   nada y el arnés se pondría rojo por el montaje y no por el código.
   Costó media hora la primera vez. */
let html = "";
await pg.route("http://arnes.local/**", (r) => r.fulfill({
  status: 200, contentType: "text/html; charset=utf-8", body: html,
}));

/* LA RESPUESTA DE LA IA LA DA EL ARNÉS. Sin esto haría falta una llave
   de verdad para probar que la propuesta NO se guarda, que es justo lo
   que más importa comprobar. Se registra DESPUÉS de la de arriba
   porque la última que se registra es la que gana. */
await pg.route("**/api/acciones/redactar", (r) => r.fulfill({
  status: 200, contentType: "application/json",
  body: JSON.stringify({ texto: "Se evidencia una estiba obstruyendo el acceso al extintor." }),
}));

const monta = async (que = "hallazgos", manda = true, ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1200 });
  html = `<!doctype html><html><head><meta charset="utf-8">
    <style>${glob}${shell}${acc}${abi} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="ac" id="r"></div></main></div></div>
    <script>window.__MANDA__ = ${manda}; window.__QUE__ = ${JSON.stringify(que)};</script>
    <script>${js.replace(/<\/script/g, "\\u003c/script")}</script></body></html>`;
  await pg.goto("http://arnes.local/?" + Math.random());
  await pg.waitForSelector(que === "informe" ? ".ac .hz-hoja" : ".ac .hz-fila", { timeout: 10000 });
  await pg.evaluate(() => { window.llamadas = [] });
};

/* =====================================================================
   1. LA MÁQUINA PROPONE Y NO DECIDE
   ===================================================================== */
await monta("hallazgos");
ok(rotos.length === 0, `la pantalla tiró un error al montarse: ${rotos[0]}`);
{
  const fila = ".ac .hz-fila >> nth=0";
  await pg.click(`${fila} >> .hz-tecnica .hz-bot .btn`);
  await pg.waitForFunction(() =>
    (window.llamadas ?? []).some((l) => l.f === "hallazgo_ia_guardar"),
    null, { timeout: 5000 }).catch(() => {});
  const ls = await pg.evaluate(() => window.llamadas ?? []);

  ok(ls.some((l) => l.f === "hallazgo_ia_guardar"),
     "no queda constancia de qué propuso la máquina: sin eso no se puede decir quién revisó");
  ok(!ls.some((l) => l.f === "hallazgo_redactar"),
     "¡la propuesta de la IA se guardó SOLA como la redacción del informe!");

  const enPantalla = await pg.inputValue(`${fila} >> .hz-tecnica textarea`);
  ok(/extintor/.test(enPantalla),
     `la propuesta no cayó en el campo editable: «${enPantalla.slice(0, 40)}»`);

  /* Y APROBAR SÍ GUARDA — el otro lado de la misma regla: si «aprobar»
     tampoco guardara, la pantalla sería un adorno. */
  await pg.click(`${fila} >> .hz-tecnica .hz-bot .btn.si`);
  await pg.waitForFunction(() =>
    (window.llamadas ?? []).some((l) => l.f === "hallazgo_redactar"),
    null, { timeout: 5000 }).catch(() => {});
  const ls2 = await pg.evaluate(() => window.llamadas ?? []);
  const ap = ls2.find((l) => l.f === "hallazgo_redactar");
  ok(Boolean(ap), "aprobar no guarda nada");
  ok(/extintor/.test(ap?.a?.p_texto ?? ""),
     `lo que viajó al aprobar no es lo que estaba en el campo: «${ap?.a?.p_texto}»`);
}

/* =====================================================================
   2. LOS DOS TEXTOS, A LA VISTA Y DEL MISMO ANCHO
   ===================================================================== */
await monta("hallazgos");
{
  const m = await pg.evaluate(() => {
    const c = document.querySelector(".ac .hz-fila .hz-caras");
    const cs = [...c.children].map((e) => Math.round(e.getBoundingClientRect().width));
    const vio = c.querySelector(".hz-dice");
    return { cs, texto: (vio?.textContent ?? "").trim().length };
  });
  ok(m.cs.length === 2, `las caras no son dos, son ${m.cs.length}`);
  ok(Math.abs(m.cs[0] - m.cs[1]) <= 2,
     `las dos caras no miden lo mismo: ${m.cs[0]} px y ${m.cs[1]} px`);
  ok(m.texto > 40,
     "lo que se vio no está a la vista: sin él nadie puede comprobar la redacción");
}

/* =====================================================================
   3. EL BOTÓN APAGADO DICE QUÉ FALTA
   ===================================================================== */
{
  const bt = ".ac .hz-fila >> nth=0 >> .hz-tecnica .hz-bot .btn.si";
  const t = (await pg.textContent(bt)).trim();
  ok(await pg.isDisabled(bt), "deja aprobar una redacción vacía");
  ok(/escribe/i.test(t), `el botón apagado no dice qué falta: «${t}»`);
}

/* =====================================================================
   5. LA FOTO DEL DESPUÉS: SE PUEDE SUBIR Y SE VE QUE FALTA
   ===================================================================== */
{
  const m = await pg.evaluate(() => {
    const filas = [...document.querySelectorAll(".ac .hz-fila")];
    const con = filas.map((f) => ({
      sube: Boolean(f.querySelector('.hz-der input[type="file"]')),
      pendiente: Boolean(f.querySelector(".hz-der .hz-pendiente")),
      dice: (f.querySelector(".hz-der .hz-pendiente")?.textContent ?? "").trim(),
    }));
    return con;
  });
  ok(m.every((x) => x.sube),
     "no hay dónde subir la foto del después: el informe saldría siempre a medias");
  /* LOS TRES PRIMEROS NO TIENEN LA DEL DESPUÉS y el cuarto sí: si el
     aviso saliera en los cuatro, no estaría avisando nada. */
  ok(m.slice(0, 3).every((x) => x.pendiente),
     "falta la foto del después y no se ve por ninguna parte");
  ok(!m[3].pendiente,
     "el que YA tiene la foto del después sigue marcado como pendiente: el aviso no avisa");
  ok(/despu/i.test(m[0].dice), `el botón no dice de qué foto habla: «${m[0].dice}»`);
}

/* =====================================================================
   4. AL INFORME SOLO ENTRA LO APROBADO — Y SE DICE CUÁNTOS FALTAN
   ===================================================================== */
await monta("informe");
{
  const m = await pg.evaluate(() => ({
    enHoja: document.querySelectorAll(".hz-hoja .hz-hoja-hz").length,
    codigos: [...document.querySelectorAll(".hz-hoja .hz-hoja-hz h3")]
      .map((h) => h.textContent.trim().slice(0, 8)),
    aviso: (document.querySelector(".ac .aviso")?.textContent ?? "").trim(),
    boton: (document.querySelector(".hz-inf-barra .btn")?.textContent ?? "").trim(),
    pares: document.querySelectorAll(".hz-hoja .hz-hoja-par").length,
    huecos: [...document.querySelectorAll(".hz-hoja .hz-hueco")].map((h) => h.textContent.trim()),
  }));

  ok(m.enHoja === 2, `en el informe salen ${m.enHoja} hallazgos y solo 2 están aprobados`);
  ok(!m.codigos.some((c) => /HZ-0001|HZ-0002/.test(c)),
     `un borrador se coló en el informe: ${m.codigos.join(", ")}`);
  ok(/2 hallazgos.*no entran/i.test(m.aviso.replace(/\s+/g, " ")),
     `no se dice cuántos quedaron por fuera: «${m.aviso.slice(0, 90)}»`);
  ok(/redacci/i.test(m.aviso), "no se dice POR QUÉ quedaron por fuera");
  ok(/2/.test(m.boton), `el botón de exportar no dice cuántos van: «${m.boton}»`);

  /* EL ANTES Y EL DESPUÉS, UNO POR HALLAZGO, y el hueco dicho con
     palabras cuando falta: un recuadro vacío y mudo se lee como que la
     pantalla se rompió. */
  ok(m.pares === 2, `hay ${m.pares} pares de antes/después y deben ser 2`);
  ok(m.huecos.some((h) => /sin foto del despu/i.test(h)),
     `no se dice qué falta en el hueco: ${JSON.stringify(m.huecos)}`);
}

/* =====================================================================
   6. EL DEDO, LOS ANCHOS Y QUE NADA SE SALGA
   ===================================================================== */
console.log("\npantalla   ancho    se sale         toque    esquinas redondas");
for (const que of ["hallazgos", "informe"]) {
  for (const ancho of [1440, 820, 390, 360]) {
    await monta(que, true, ancho);
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

      /* EL TOQUE MÁS PEQUEÑO DE LA PANTALLA, no un elemento escogido a
         dedo: el que falla es el que nadie estaba mirando. */
      const tocables = [...document.querySelectorAll(
        ".ac button, .ac select, .ac .hz-der label, .ac input[type=checkbox]")]
        .map((e) => {
          const r = e.getBoundingClientRect();
          /* UNA CASILLA SE TOCA POR SU ETIQUETA: medir el cuadrito de
             20 px y no el área que de verdad recibe el dedo sería
             ponerse rojo por algo que está bien. */
          const caja = e.type === "checkbox" && e.closest("label")
            ? e.closest("label").getBoundingClientRect() : r;
          return { n: e.className || e.tagName, px: Math.round(Math.min(caja.width, caja.height)) };
        })
        .filter((x) => x.px > 0)
        .sort((x, y) => x.px - y.px);

      const curvos = [...document.querySelectorAll(".ac *")].filter((e) => {
        const r = getComputedStyle(e).borderTopLeftRadius;
        return !r.includes("%") && parseFloat(r) > 0;
      }).map((e) => (e.className || e.tagName) + " = " + getComputedStyle(e).borderTopLeftRadius);

      return {
        fuera: [...new Set(fuera)].slice(0, 3),
        lado: document.documentElement.scrollWidth > a + 1,
        toque: tocables[0] ?? { n: "—", px: 0 },
        curvos: [...new Set(curvos)].slice(0, 4),
      };
    }, ancho);

    console.log(`${que.padEnd(10)} ${String(ancho).padEnd(8)} ` +
      `${(m.lado || m.fuera.length ? (m.fuera.join(", ") || "sí") : "nada").padEnd(15)} ` +
      `${String(m.toque.px).padStart(4)} px  ${m.curvos.length ? m.curvos.join(" | ") : "0"}`);

    if (m.lado || m.fuera.length)
      fallas.push(`${que} a ${ancho} px se sale: ${m.fuera.join(", ") || "la página entera"}`);
    if (m.toque.px < 44)
      fallas.push(`${que} a ${ancho} px «${m.toque.n}» se toca en ${m.toque.px} px y ` +
                  "con guante hacen falta 44");
    if (m.curvos.length)
      fallas.push(`${que} a ${ancho} px queda algo redondeado: ${m.curvos.join(" | ")}`);
  }
}

await monta("hallazgos", true, 1440);
await pg.screenshot({ path: R(".arnes/_abi-hallazgos.png"), fullPage: true });
await monta("informe", true, 1440);
await pg.screenshot({ path: R(".arnes/_abi-informe.png"), fullPage: true });
await nav.close();

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log("✓ ABI: la IA propone y NO guarda, aprobar sí guarda lo que está en el campo, los " +
            "dos textos se ven del mismo ancho, el botón apagado dice qué falta, la foto del " +
            "después tiene dónde subirse y se ve cuando falta, al informe solo entran los " +
            "aprobados y dice cuántos quedaron por fuera, y no queda ni una esquina redonda.");
