/* =====================================================================
   ROTURAS · EN SITIO · LOS TRES PARETOS EN PANTALLA

   «El gráfico que sea un pareto de causa, área y OPM, que estén las 3.»

   La cuenta ya la mide `rl-pareto.mjs` sobre la función pura. Esto mide
   lo OTRO, que es lo que solo se ve montando la pantalla de verdad:

   1. QUE SE PIERDA EL ACUMULADO EN EL CELULAR. En 360 px sobra sitio
      para dos columnas de números y no para tres, y la tentación es
      quitar la última. La última es el acumulado —la única que dice
      hasta dónde hay que atacar—: sin ella esto deja de ser un Pareto y
      queda un ranking. La que se va es la plata.

   2. QUE UN NOMBRE LARGO ROMPA LA REJILLA. «Manipulación en el cargue
      de la bahía T1» no cabe en la columna, y una rejilla que se
      ensancha para meterlo empuja el acumulado fuera de la pantalla.

   3. QUE «OTROS» Y «SIN DATO» SE VEAN COMO UNA CAUSA MÁS. No lo son:
      una es «varias pequeñas» y la otra «no se sabe», y puestas con la
      misma cara se leen como problemas que atacar.

   4. QUE LA BARRA NO MIDA LO QUE DICE SU NÚMERO. Una barra que no
      cuadra con su cifra se ve bien y miente.

   5. QUE NO SE LEA: en los cuatro anchos y en los siete temas.

     node .arnes/rt-pareto-pantalla.mjs
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

/* LOS DATOS SALEN DE `pareto()`, NO ESCRITOS A MANO. Un fixture a mano
   mediría la pantalla contra un número inventado: el día que la función
   cambiara de criterio, la pantalla diría otra cosa y esto seguiría
   verde. Los nombres son los largos de verdad, que son los que rompen la
   rejilla. */
writeFileSync(R(".arnes/_pa-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Pareto } from "../src/app/(app)/roturas/en-sitio/analisis/Pareto";
import { pareto } from "../src/modulos/roturas/pareto";

const f = (nombre: any, valor: number, plata: any = 500) => ({ nombre, valor, plata });
const casos: Record<string, any> = {
  /* MÁS CATEGORÍAS QUE EL TOPE + UNA SIN NOMBRE: sale «Otros» y sale
     «Sin dato», que son los dos que no son una causa. */
  lleno: pareto([
    f("Manipulación en el cargue de la bahía T1", 400),
    f("Falla de la máquina despaletizadora", 170),
    f("Estibas en mal estado", 120), f("Montacargas", 90),
    f("Piso en mal estado", 60), f("Bandas transportadoras", 40),
    f("Golpe contra columna", 30), f("Estibas con clavos salidos", 20),
    f("Otras menores", 12), f("Arrume mal amarrado", 8),
    f(null, 25),
  ]),
  /* UNA PLATA QUE FALTA: tiene que salir raya y nunca «$ 0». */
  sinPrecio: pareto([
    f("Juan Pérez", 260, 14000), f("Encontrada sin dueño", 180, null),
    f("Carlos Ramírez", 120, 6000),
  ]),
  /* UNA SOLA QUE SE LO LLEVA TODO. */
  una: pareto([f("Estibas en mal estado", 200, 46700)]),
  /* NADA: ni hueco ni división por cero. */
  vacio: pareto([]),
};
const cual = new URL(location.href).searchParams.get("c") ?? "lleno";
createRoot(document.getElementById("r")!).render(
  <Pareto d={casos[cual]} medida="unidades" />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_pa-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", alias: { "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/roturas/roturas.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

const monta = async (caso = "lleno", ancho = 1440, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: 1200 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <style>${P}${css}</style></head>
      <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">
      <div class="rt" id="r"></div></main></div></div>
      <script>${js}<\/script></body></html>`,
  }));
  await pg.goto(`http://arnes.local/?c=${caso}`);
  if (caso !== "vacio") await pg.waitForSelector(".rt .rq-pareto-tabla tbody tr");
  else await pg.waitForSelector(".rt .vacio");
};

await monta();
ok(rotos.length === 0, `el Pareto tiró un error: ${rotos[0]}`);

/* =====================================================================
   1 · LA RESPUESTA, ESCRITA Y ARRIBA
   ---------------------------------------------------------------------
   Un Pareto sin esta línea es un ranking con una curva encima: contar a
   ojo en la gráfica cuántas barras tapan el 80 % es justo lo que nadie
   hace. Y tiene que decir la misma cifra que calculó la función, no una
   parecida.
   ===================================================================== */
{
  const lee = (await pg.$eval(".rt .rq-pareto-lee", (e) => e.textContent)).replace(/\s+/g, " ").trim();
  const n = await pg.$$eval(".rt .rq-pareto-tabla tbody tr", (s) => s.length);
  ok(/^\d+ de \d+ explican? el 80 % de [\d.]+ unidades\.$/.test(lee),
     `la línea de arriba dice «${lee}» y tiene que decir cuántas de cuántas explican el 80 %`);
  /* La cuenta a mano, para que el arnés no repita la del código: el
     total es 975 y el 80 % son 780. 400 + 170 + 120 = 690, que todavía
     no llega; con la cuarta (90) da 780 clavados y ya llega. Son 4. */
  ok(lee.startsWith(`4 de ${n}`),
     `dice «${lee}» con ${n} barras: el total es 975 y el 80 % son 780; 400 + 170 + 120 = 690 no ` +
     "llega y con la cuarta (90) da 780 justos, así que son 4 — si esta cifra miente, alguien " +
     "ataca de menos y se queda a mitad de camino creyendo que terminó");
}

/* =====================================================================
   2 · LA BARRA MIDE LO QUE DICE SU NÚMERO, Y LA CURVA SU ACUMULADO
   ---------------------------------------------------------------------
   Se leen por separado la geometría pintada y la cifra escrita: si
   salieran de dos cuentas distintas, un día dirían cosas distintas y las
   dos se verían bien. Es el error que una captura no enseña.
   ===================================================================== */
{
  const g = await pg.evaluate(() => {
    const svg = document.querySelector(".rt .rq-pareto-svg");
    const base = +svg.querySelector(".rq-pk-base").getAttribute("y1");
    const cero = +svg.querySelector(".rq-pk-raya").getAttribute("y1");
    return {
      base,
      raya80: cero,
      barras: [...svg.querySelectorAll(".rq-pk-barra")].map((r) => ({
        x: +r.getAttribute("x"), y: +r.getAttribute("y"), h: +r.getAttribute("height"),
        w: +r.getAttribute("width"),
      })),
      vals: [...svg.querySelectorAll(".rq-pk-val")].map((t) => Number(t.textContent.replace(/[^\d]/g, ""))),
      puntos: [...svg.querySelectorAll(".rq-pk-punto")].map((c) => ({
        cx: +c.getAttribute("cx"), cy: +c.getAttribute("cy") })),
      linea: svg.querySelector(".rq-pk-linea").getAttribute("points"),
      acums: [...document.querySelectorAll(".rt .rq-pareto-tabla .rq-pb-acum")]
        .map((t) => Number(t.textContent.replace(/[^\d]/g, ""))),
    };
  });
  const max = Math.max(...g.vals);
  /* CADA BARRA, CONTRA SU PROPIA CIFRA. */
  for (const [i, b] of g.barras.entries()) {
    /* el alto del área de dibujo es la base menos el margen de arriba */
    const alto = g.base - 16;
    const esperado = Math.max(1, (g.vals[i] / max) * alto);
    ok(Math.abs(b.h - esperado) < 0.6,
       `la barra ${i + 1} vale ${g.vals[i]} de ${max} y mide ${b.h.toFixed(1)} en vez de ` +
       `${esperado.toFixed(1)}: una barra que no cuadra con su cifra se ve bien y miente`);
    ok(Math.abs((b.y + b.h) - g.base) < 0.6,
       `la barra ${i + 1} no se apoya en la base (${(b.y + b.h).toFixed(1)} contra ${g.base}): ` +
       "una barra que flota deja de poderse comparar con la de al lado");
  }
  /* Y DE MAYOR A MENOR EN EL DIBUJO, no solo en la tabla. */
  const propias = g.barras.filter((_, i) => i < g.barras.length - 2);
  for (let i = 1; i < propias.length; i++) {
    ok(propias[i].h <= propias[i - 1].h + 0.01,
       `en el dibujo la barra ${i + 1} es más alta que la de antes: el Pareto va de mayor a menor`);
  }
  /* LA CURVA SE APOYA EN LOS MISMOS ACUMULADOS QUE DICE LA TABLA. Es el
     cruce que importa: papel, dibujo y número tienen que ser uno. */
  const alto = g.base - 16;
  for (const [i, pt] of g.puntos.entries()) {
    const esperado = 16 + alto - (g.acums[i] / 100) * alto;
    ok(Math.abs(pt.cy - esperado) < 0.6,
       `el punto ${i + 1} de la curva está en ${pt.cy.toFixed(1)} y su acumulado (${g.acums[i]} %) ` +
       `lo pone en ${esperado.toFixed(1)}: la curva y la tabla saldrían de dos cuentas distintas`);
    ok(Math.abs(pt.cx - (g.barras[i].x + g.barras[i].w / 2)) < 0.6,
       `el punto ${i + 1} no está sobre el centro de su barra`);
  }
  /* LA CURVA PASA POR TODOS LOS PUNTOS: una polilínea con menos vértices
     que barras se dibuja igual de bonita y se salta una categoría. */
  ok(g.linea.trim().split(/\s+/).length === g.puntos.length,
     `la curva tiene ${g.linea.trim().split(/\s+/).length} vértices y hay ${g.puntos.length} ` +
     "barras: se está saltando alguna");
  /* LA RAYA DEL 80 % ESTÁ DONDE DICE. Es contra lo que se mira la curva:
     puesta en otro sitio, el dibujo contesta mal la única pregunta. */
  ok(Math.abs(g.raya80 - (16 + alto * 0.2)) < 0.6,
     `la raya del 80 % está en ${g.raya80.toFixed(1)} y le toca ${(16 + alto * 0.2).toFixed(1)}: ` +
     "es contra lo que se lee la curva, y torcida hace atacar de más o de menos");
  /* Y LA CURVA CRUZA LA RAYA JUSTO EN hasta80. */
  const lee = await pg.$eval(".rt .rq-pareto-lee", (e) => e.textContent);
  const h80 = Number(lee.match(/^\s*(\d+) de/)[1]);
  ok(g.puntos[h80 - 1].cy <= g.raya80 + 0.01 && (h80 === 1 || g.puntos[h80 - 2].cy > g.raya80),
     `la frase dice ${h80} pero en el dibujo la curva no cruza la raya del 80 % ahí: el texto y ` +
     "el dibujo estarían contando cosas distintas");
}

/* =====================================================================
   3 · «OTROS» Y «SIN DATO» NO SE VEN COMO UNA CAUSA MÁS
   ---------------------------------------------------------------------
   Una es «varias pequeñas» y la otra «no se sabe». Con la misma cara que
   las demás se leen como problemas que atacar, y «sin dato» además es lo
   contrario: es un registro que hay que ir a arreglar.
   ===================================================================== */
{
  const cls = await pg.$$eval(".rt .rq-pareto-tabla tbody tr", (s) => s.map((tr) => ({
    nom: tr.querySelector("th").textContent.trim(),
    clase: tr.className,
    color: getComputedStyle(tr.querySelector("th")).color,
    negrita: getComputedStyle(tr.querySelector("th")).fontWeight,
  })));
  const otros = cls.find((c) => c.nom === "Otros");
  const sin = cls.find((c) => c.nom === "Sin dato");
  const normal = cls.find((c) => !c.clase);
  ok(otros && sin, `faltan «Otros» o «Sin dato»: salieron [${cls.map((c) => c.nom).join(" | ")}]`);
  ok(sin.nom === cls.at(-1).nom,
     `«Sin dato» quedó en medio de la lista: arriba se lee como si fuera el problema principal, y ` +
     "no es una causa que se pueda atacar sino un registro al que le falta un campo");
  for (const flojo of [otros, sin]) {
    ok(flojo.color !== normal.color || flojo.negrita !== normal.negrita,
       `«${flojo.nom}» se ve igual que una causa de verdad (${flojo.color}, ${flojo.negrita}): ` +
       "no lo es, y con la misma cara se lee como un problema que atacar");
  }
  /* Y EN EL DIBUJO TAMBIÉN, no solo en la tabla: quien mira la gráfica
     no baja a leer la tabla para saber cuál barra no es una causa. */
  {
    const barras = await pg.$$eval(".rt .rq-pareto-svg .rq-pk-g", (s) => s.map((g) => ({
      clase: g.getAttribute("class"),
      fill: getComputedStyle(g.querySelector(".rq-pk-barra")).fill,
    })));
    const nrm = barras.find((b) => b.clase === "rq-pk-g");
    for (const b of barras.filter((x) => x.clase !== "rq-pk-g")) {
      ok(b.fill !== nrm.fill,
         `en el dibujo la barra «${b.clase}» tiene el mismo relleno que una causa de verdad ` +
         `(${b.fill}): «otros» es «varias pequeñas» y «sin dato» es «no se sabe»`);
    }
  }
  /* Y EL PIE LO DICE CON PALABRAS, que es lo que de verdad se entiende. */
  const pie = (await pg.$eval(".rt .rq-pareto-pie", (e) => e.textContent)).replace(/\s+/g, " ");
  ok(/no es una categoría/.test(pie),
     `el pie dice «${pie.slice(0, 120)}» y no explica que «sin dato» no es una categoría`);
  ok(/están sumadas/.test(pie), "el pie no dice cuántas se juntaron en «otros»");
}

/* =====================================================================
   4 · UNA PLATA QUE FALTA SALE COMO RAYA, NUNCA COMO «$ 0»
   ---------------------------------------------------------------------
   Un cero ahí se lee como «no cuesta nada», que es lo contrario de que
   al material le falte el precio en el maestro.
   ===================================================================== */
{
  await monta("sinPrecio");
  const pl = await pg.$$eval(".rt .rq-pareto-tabla tbody tr", (s) => s.map((tr) => [
    tr.querySelector("th").textContent.trim(),
    tr.querySelector(".rq-pb-plata").textContent.trim()]));
  const enc = pl.find(([n]) => n === "Encontrada sin dueño");
  ok(enc && /^[—–-]$/.test(enc[1]),
     `a «Encontrada sin dueño» le falta el precio y la pantalla enseña «${enc?.[1]}»: tiene que ` +
     "ser una raya, porque un cero se lee como «no cuesta nada»");
  ok(!pl.some(([, p]) => /^\$\s*0$/.test(p)), `salió un «$ 0»: ${JSON.stringify(pl)}`);
}

/* =====================================================================
   5 · CON UNA SOLA BARRA, Y CON NINGUNA
   ---------------------------------------------------------------------
   «1 de 1 explica» —no «explican»— y sin dividir por cero.
   ===================================================================== */
{
  await monta("una");
  const lee = (await pg.$eval(".rt .rq-pareto-lee", (e) => e.textContent)).replace(/\s+/g, " ").trim();
  ok(/^1 de 1 explica el 80 %/.test(lee), `con una sola barra dice «${lee}»`);
  ok(!/NaN|Infinity|undefined/.test(await pg.$eval(".rt", (e) => e.textContent)),
     "salió basura con una sola barra");

  await monta("vacio");
  const v = await pg.$eval(".rt", (e) => e.textContent);
  ok(/Sin datos/.test(v) && !/NaN|Infinity|undefined/.test(v),
     `sin barras la pantalla enseña «${v.slice(0, 80)}» y tiene que decir que no hay datos`);
}

/* =====================================================================
   6 · EN EL CELULAR SE VA LA PLATA, NUNCA EL ACUMULADO
   ---------------------------------------------------------------------
   Es la comprobación entera de esta sección. En 360 px no caben tres
   columnas de números y hay que quitar una; la tentación es la última,
   que es justo la que no se puede quitar: sin el acumulado esto deja de
   ser un Pareto y queda un ranking bonito.

   Y NADA SE SALE DE ANCHO en ninguno de los cuatro: un acumulado que
   está en el DOM pero fuera de la pantalla no está.
   ===================================================================== */
for (const ancho of [360, 390, 820, 1440]) {
  await monta("lleno", ancho);
  const vista = await pg.$$eval(".rt .rq-pareto-tabla tbody tr", (s) => s.map((tr) => {
    const ve = (sel) => {
      const e = tr.querySelector(sel);
      if (!e) return false;
      const r = e.getBoundingClientRect();
      return getComputedStyle(e).display !== "none" && r.width > 0 && r.height > 0;
    };
    return { nom: ve("th"), acum: ve(".rq-pb-acum") };
  }));
  for (const [i, v] of vista.entries()) {
    ok(v.acum,
       `en ${ancho} px la fila ${i + 1} se quedó sin el acumulado: sin esa columna esto deja de ` +
       "ser un Pareto y queda un ranking — lo que se quita en el celular es la plata");
    ok(v.nom, `en ${ancho} px la fila ${i + 1} se quedó sin nombre`);
  }

  /* Y LA GRÁFICA SE VE EN LOS CUATRO. Un SVG con alto 0 no da error:
     desaparece en silencio, y la pantalla queda con la tabla sola. */
  const svg = await pg.$eval(".rt .rq-pareto-svg", (e) => {
    const r = e.getBoundingClientRect(); return { w: r.width, h: r.height };
  });
  ok(svg.w > 100 && svg.h > 120,
     `en ${ancho} px la gráfica mide ${Math.round(svg.w)}×${Math.round(svg.h)}: un SVG aplastado ` +
     "no da error, desaparece en silencio");

  /* NADA SE SALE DE ANCHO. `scrollWidth` del documento contra el ancho
     de la ventana: si sobra, hay que arrastrar la pantalla de lado para
     leer el acumulado, que es lo mismo que no tenerlo. */
  const sobra = await pg.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(sobra <= 1,
     `en ${ancho} px la pantalla se sale ${sobra} px de ancho: hay que arrastrarla de lado, y un ` +
     "acumulado que hay que ir a buscar arrastrando es un acumulado que nadie mira");

  /* CADA CIFRA, DEBAJO DE SU ENCABEZADO. En el celular se oculta la
     columna de la plata: si su encabezado se queda, el acumulado cae
     debajo de «Se cobra» y un 41 % se lee como plata. Se mide el centro
     de cada celda contra el centro de su encabezado. */
  {
    const cols = await pg.evaluate(() => {
      const t = document.querySelector(".rt .rq-pareto-tabla");
      const ve = (e) => getComputedStyle(e).display !== "none";
      const cab = [...t.querySelectorAll("thead tr > *")].filter(ve)
        .map((e) => { const r = e.getBoundingClientRect();
                      return { t: e.textContent.trim(), c: (r.left + r.right) / 2 } });
      const fila = [...t.querySelectorAll("tbody tr")][0];
      const cel = [...fila.querySelectorAll("th, td")].filter(ve)
        .map((e) => { const r = e.getBoundingClientRect();
                      return { t: e.textContent.trim(), c: (r.left + r.right) / 2 } });
      return { cab, cel };
    });
    ok(cols.cab.length === cols.cel.length,
       `en ${ancho} px hay ${cols.cab.length} encabezados visibles y ${cols.cel.length} celdas: ` +
       "sobra o falta un encabezado, y las cifras quedan debajo del rótulo equivocado");
    for (let i = 0; i < Math.min(cols.cab.length, cols.cel.length); i++) {
      ok(Math.abs(cols.cab[i].c - cols.cel[i].c) < 6,
         `en ${ancho} px «${cols.cel[i].t}» está a ${Math.round(cols.cel[i].c)} y su encabezado ` +
         `«${cols.cab[i].t}» a ${Math.round(cols.cab[i].c)}: la cifra se lee bajo el rótulo de al lado`);
    }
  }

  /* Y LAS FILAS NO SE MONTAN UNAS SOBRE OTRAS. */
  const cajas = await pg.$$eval(".rt .rq-pareto-tabla tbody tr",
    (s) => s.map((tr) => { const r = tr.getBoundingClientRect(); return [r.top, r.bottom] }));
  for (let i = 1; i < cajas.length; i++) {
    ok(cajas[i][0] >= cajas[i - 1][1] - 1.5,
       `en ${ancho} px la fila ${i + 1} arranca en ${Math.round(cajas[i][0])} y la de arriba ` +
       `termina en ${Math.round(cajas[i - 1][1])}: se están montando`);
  }
}

/* =====================================================================
   7 · Y SE LEE EN LOS SIETE TEMAS
   ---------------------------------------------------------------------
   El acumulado en gris claro sobre fondo claro está en la pantalla y no
   se ve, que es la misma pérdida que quitarlo.
   ===================================================================== */
{
  const TEMAS = ["", "oficial", "noche", "papel", "alto", "sobrio", "bosque"];
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+/g).map(Number).map((v) => {
      const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const t of TEMAS) {
    await monta("lleno", 1440, t);
    const medidas = await pg.$$eval(
      ".rt .rq-pareto-tabla .rq-pb-acum, .rt .rq-pareto-tabla tbody th, .rt .rq-pareto-lee", (s) =>
      s.map((e) => {
        let f = e, fondo = "rgba(0, 0, 0, 0)";
        while (f && /rgba\(0, 0, 0, 0\)|transparent/.test(fondo)) {
          fondo = getComputedStyle(f).backgroundColor; f = f.parentElement;
        }
        return { t: e.textContent.trim(), c: getComputedStyle(e).color, f: fondo,
                 q: e.className };
      }));
    for (const m of medidas) {
      const a = lum(m.c), b = lum(m.f);
      const razon = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      ok(razon >= 3,
         `en el tema «${t || "claro"}» el «${m.q}» («${m.t}») queda en ${m.c} sobre ${m.f}, ` +
         `razón ${razon.toFixed(1)}: está en la pantalla y no se ve, que es igual que no estar`);
    }
  }
}

await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Los Paretos en pantalla: la línea de arriba dice CUÁNTAS hacen falta para el 80 % " +
            "—y lo dice con la misma cifra que calculó la función, no una parecida—, cada barra " +
            "mide exactamente lo que dice su número, «Otros» y «Sin dato» no se visten de causa " +
            "porque no lo son, un precio que falta sale como raya y nunca como $ 0, y en el " +
            "celular lo que se va es la plata: el acumulado se queda en los cuatro anchos y en " +
            "los siete temas, porque sin él esto deja de ser un Pareto y queda un ranking.");
