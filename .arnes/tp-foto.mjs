/* =====================================================================
   TRASPASOS · EL CIERRE COMO FOTO — para mandarlo por WhatsApp.

   «Mira cómo se copia… y debería copiarse como foto, algo
   espectacular.»

   DOS MITADES, Y SE MIDEN DISTINTO:

   1. LAS CIFRAS, SIN NAVEGADOR. armarFoto() es una función pura, así
      que se le dan números conocidos y se comprueba renglón por
      renglón. Es lo único que de verdad importa: un total mal sumado
      se ve perfectamente normal DENTRO de una imagen, y ahí ya no hay
      forma de cazarlo.

   2. LA PINTURA, EN CHROMIUM. Que el canvas salga del tamaño que dice,
      que no salga en blanco, que lleve los colores del tema y que se
      pueda convertir en PNG.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

const js = buildSync({ entryPoints: [R("src/modulos/traspasos/foto.ts")], bundle: true, write: false,
  format: "esm", platform: "neutral", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_foto.mjs"), js);
const { armarFoto, altoFoto } = await import(R(".arnes/_foto.mjs") + "?" + Date.now());

/* ---------- 1 · LAS CIFRAS ----------
   Un turno con de todo: un tipo al 100%, uno en cero, uno a medias, y
   adicionales que se pasan del plan. */
const D = {
  titulo: "Cierre del turno A", ojo: "TURNO A · 06:00 · 14:00",
  fecha: "Martes, 22 de septiembre de 2026", hora: "04:21 p. m.",
  planeado: 10, adheridos: 5, adicionales: 2, faltan: 5, cumplido: 7, carga: 180,
  vacios: 1, registrados: 6,
  tipos: [
    { nombre: "Casco vidrio", planeado: 1, adheridos: 1, adicionales: 0, faltan: 0 },
    { nombre: "Plástico", planeado: 1, adheridos: 0, adicionales: 0, faltan: 1 },
    { nombre: "PET", planeado: 8, adheridos: 4, adicionales: 2, faltan: 4 },
  ],
  enlace: "cd-control-one.vercel.app/traspasos/control?desde=2026-09-22",
};
const p = armarFoto(D);

ok(p.titulo === D.titulo && p.ojo === D.ojo, "la foto no lleva el título y el turno");
ok(p.sub === "Martes, 22 de septiembre de 2026 · foto de las 04:21 p. m.",
   `el subtítulo dice «${p.sub}» y debe traer la fecha y la hora de la foto`);
ok(p.adherencia === 50, `la adherencia da ${p.adherencia} y son 5 de 10 = 50%`);
ok(p.bajo === "5 de 10 del plan", `debajo dice «${p.bajo}»`);

/* LA CINTA REPARTE SOBRE EL PLAN y los tres tramos suman 1. Si sumaran
   más, la barra se saldría de su caja; si menos, quedaría un hueco que
   nadie puso. */
{
  const s = p.tramos.ok + p.tramos.extra + p.tramos.falta;
  ok(Math.abs(s - 1) < 1e-9, `los tres tramos suman ${s} y tienen que sumar 1`);
  ok(Math.abs(p.tramos.ok - 0.5) < 1e-9, `el tramo cumplido da ${p.tramos.ok} y son 5 de 10`);
  ok(Math.abs(p.tramos.extra - 0.2) < 1e-9, `el tramo adicional da ${p.tramos.extra} y son 2 de 10`);
}
/* Y con MÁS adicionales que hueco, el tramo se recorta en vez de
   pasarse: es la misma regla de la pantalla. */
{
  const q = armarFoto({ ...D, planeado: 4, adheridos: 4, adicionales: 9, faltan: 0 });
  const s = q.tramos.ok + q.tramos.extra + q.tramos.falta;
  ok(Math.abs(s - 1) < 1e-9, `con adicionales de sobra los tramos suman ${s} y la cinta se saldría`);
  ok(q.tramos.extra === 0, "sin hueco que llenar, el tramo de adicionales tiene que quedar en cero");
}

/* Las cuatro tarjetas, con su tono. */
{
  const m = Object.fromEntries(p.mini.map((x) => [x.rot, x]));
  ok(m["PLANEADOS"]?.valor === "10", `PLANEADOS dice «${m["PLANEADOS"]?.valor}»`);
  ok(m["CUMPLIMIENTO"]?.valor === "70%", `CUMPLIMIENTO dice «${m["CUMPLIMIENTO"]?.valor}» y son 7 de 10`);
  ok(m["CARGA MOVIDA"]?.valor === "180", `CARGA MOVIDA dice «${m["CARGA MOVIDA"]?.valor}»`);
  ok(m["SIN SALIR"]?.valor === "5" && m["SIN SALIR"]?.tono === "mal",
     "SIN SALIR con 5 tiene que salir en rojo");
  const q = armarFoto({ ...D, faltan: 0 });
  ok(q.mini.find((x) => x.rot === "SIN SALIR")?.tono === "bien",
     "sin nada pendiente, SIN SALIR tiene que salir en verde");
}

/* Por tipo: el 0% NO puede quedar como «sin plan», que es otra cosa. */
{
  const t = Object.fromEntries(p.tipos.map((x) => [x.nombre, x]));
  ok(t["Casco vidrio"].pct === 100, `casco da ${t["Casco vidrio"].pct}%`);
  ok(t["Plástico"].pct === 0, `plástico se planeó y no salió: es 0%, no «sin plan» (dio ${t["Plástico"].pct})`);
  ok(t["PET"].pct === 50, `PET da ${t["PET"].pct}% y son 4 de 8`);
  ok(t["Casco vidrio"].falta === "—", "un tipo sin faltantes tiene que mostrar raya, no un cero");
  const q = armarFoto({ ...D, tipos: [{ nombre: "Estibas", planeado: 0, adheridos: 0, adicionales: 2, faltan: 0 }] });
  ok(q.tipos[0].pct === null, "un tipo movido SIN plan no tiene porcentaje: no hay contra qué medirlo");
}

/* El pie dice los vacíos y dice «aparte». */
ok(/6 viajes registrados/.test(p.pie), `el pie dice «${p.pie}»`);
ok(/1 vacío aparte/.test(p.pie), "el pie no dice los vacíos, o no dice que van aparte");
ok(/no entran en la adherencia/.test(p.pie), "el pie no explica qué no entra en la cifra");
/* La frase que explica qué no entra SIEMPRE nombra los vacíos; lo que
   no puede aparecer sin vacíos es la CUENTA. */
ok(!/\d+ vacío/.test(armarFoto({ ...D, vacios: 0 }).pie),
   "sin vacíos, el pie no puede decir cuántos vacíos hubo");

/* El alto crece con el contenido: si fuera fijo, un turno con nueve
   tipos saldría cortado por la mitad. */
{
  const chico = altoFoto(armarFoto({ ...D, tipos: [] }));
  const grande = altoFoto(armarFoto({ ...D,
    tipos: Array.from({ length: 9 }, (_, i) => ({ nombre: "Tipo " + i, planeado: 2, adheridos: 1, adicionales: 0, faltan: 1 })) }));
  ok(grande > chico + 400, `el alto no crece con el contenido (${chico} → ${grande})`);
}

/* ---------- 2 · LA PINTURA ---------- */
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.route("**/*", (r) => r.request().url().includes("/marca/logo-b.png")
  ? r.fulfill({ status: 200, contentType: "image/png", body: readFileSync(R("public/marca/logo-b.png")) })
  : r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }));
await pg.goto("https://control.prueba/");
await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`);
await pg.addScriptTag({ content: js.replace(/export\s*\{[^}]*\}\s*;?/g, "") + "\nwindow.armarFoto=armarFoto;window.dibujarFoto=dibujarFoto;window.altoFoto=altoFoto;" , type: "module" }).catch(() => {});
/* El bundle es ESM: se mete como módulo y se cuelga de window. */
await pg.evaluate(async (fuente) => {
  const url = URL.createObjectURL(new Blob([fuente], { type: "text/javascript" }));
  const m = await import(url);
  window.FOTO = m;
}, js);

const medida = await pg.evaluate(async ({ D }) => {
  const plan = window.FOTO.armarFoto(D);
  const b = await window.FOTO.dibujarFoto(plan, { tinta: "12263A", acento: "FFC000", sobre: "12263A" });
  /* Se vuelve a leer la imagen para mirarla por dentro. */
  const bm = await createImageBitmap(b);
  const cv = document.createElement("canvas"); cv.width = bm.width; cv.height = bm.height;
  cv.getContext("2d").drawImage(bm, 0, 0);
  const d = cv.getContext("2d").getImageData(0, 0, bm.width, bm.height).data;
  const colores = new Set(); let oscuros = 0;
  for (let i = 0; i < d.length; i += 4 * 97) {
    colores.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    if (d[i] + d[i + 1] + d[i + 2] < 200) oscuros++;
  }
  /* Un punto dentro de la banda de arriba y otro dentro de la franja. */
  const punto = (x, y) => { const i = (y * bm.width + x) * 4; return `${d[i]},${d[i + 1]},${d[i + 2]}` };
  return { w: bm.width, h: bm.height, alto: window.FOTO.altoFoto(plan), bytes: b.size, tipo: b.type,
           colores: colores.size, oscuros, banda: punto(1400, 60), franja: punto(1400, 640) };
}, { D });

ok(medida.tipo === "image/png", `la foto sale como «${medida.tipo}» y tiene que ser PNG`);
ok(medida.w === 2160, `la foto mide ${medida.w} px de ancho y debe ser 1080 al doble`);
ok(medida.h === medida.alto * 2, `el alto pintado (${medida.h}) no es el que dice altoFoto (${medida.alto * 2})`);
ok(medida.bytes > 12000, `la foto pesa ${medida.bytes} bytes: está casi vacía`);
ok(medida.colores > 20, `la foto tiene ${medida.colores} colores: algo no se pintó`);
ok(medida.oscuros > 200, "la foto no tiene texto oscuro: salió en blanco");
ok(medida.banda === "18,38,58", `la banda de arriba salió ${medida.banda} y debe ser la tinta 12263A`);
ok(medida.franja === "255,192,0", `la franja salió ${medida.franja} y debe ser el acento FFC000 (255,192,0)`);

if (process.env.FOTO) {
  const b64 = await pg.evaluate(async ({ D }) => {
    const b = await window.FOTO.dibujarFoto(window.FOTO.armarFoto(D), { tinta: "12263A", acento: "FFC000", sobre: "12263A" });
    return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.readAsDataURL(b) });
  }, { D });
  writeFileSync(`${process.env.FOTO}/cierre-foto.png`, Buffer.from(b64, "base64"));
}

await nav.close();
console.log("");
console.log(`  ${medida.w}×${medida.h} px · ${(medida.bytes / 1024).toFixed(0)} KB · ${medida.colores} colores`);
console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Traspasos · el cierre como foto: las cifras cuadran, la cinta suma 1, el alto crece con el "
          + "contenido, y el PNG sale con los colores del tema.");
