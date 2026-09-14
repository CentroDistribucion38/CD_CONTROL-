/* EL PDF SALE DEL MISMO ARCHIVO QUE LA PÁGINA. Mantener dos fuentes es
   mantener dos instructivos que se van separando: el de la pared dice
   una cosa y el del celular otra.

   El archivo de la página no lleva doctype ni <body> —eso lo pone el
   servidor de artifacts al publicar—, así que aquí se envuelve igual
   antes de imprimirlo. */
import { chromium } from "playwright";
import fs from "node:fs";

const c = fs.readFileSync("manual/instructivo.html", "utf8");
const i = c.indexOf('<div class="hoja">');
fs.writeFileSync("manual/vista.html",
  '<!doctype html><html lang="es"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>img{max-width:100%}[hidden]{display:none!important}</style>'
  /* SIN loading="lazy" AQUÍ. En la página está bien —el celular no se
     traga nueve capturas de golpe—, pero al imprimir el navegador solo
     carga lo que cabe en la ventana y el PDF salía con la mitad de las
     figuras vacías: solo el pie, sin foto. */
  + c.slice(0, i) + '</head><body>'
  + c.slice(i).replaceAll(' loading="lazy"', '') + '</body></html>');

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await nav.newPage({ viewport: { width: 900, height: 1200 } });
await p.goto("file://" + process.cwd() + "/manual/vista.html", { waitUntil: "networkidle" });
/* Y se espera a que TODAS estén decodificadas, no solo pedidas. */
await p.evaluate(async () => {
  await Promise.all([...document.images].map((im) => im.complete ? null : im.decode().catch(() => null)));
  await document.fonts.ready;
});
const faltan = await p.evaluate(() =>
  [...document.images].filter((im) => !im.complete || im.naturalWidth === 0).map((im) => im.src));
if (faltan.length) { console.log("IMÁGENES QUE NO CARGARON:", faltan); process.exit(1) }
/* Se imprime en claro aunque el equipo esté en oscuro: el PDF va al
   papel, y el papel no tiene tema. */
await p.emulateMedia({ media: "print", colorScheme: "light" });
await p.pdf({
  path: "manual/Instructivo-Traspasos-CD38-Ag01.pdf",
  format: "A4", printBackground: true,
  margin: { top: "14mm", bottom: "16mm", left: "13mm", right: "13mm" },
  displayHeaderFooter: true,
  headerTemplate: `<div style="width:100%;font:8px 'IBM Plex Sans',system-ui;color:#8a8a88;padding:0 13mm">
    <span style="float:right">CONTROL · Traspasos · CD38 Ag01</span></div>`,
  footerTemplate: `<div style="width:100%;font:8px 'IBM Plex Sans',system-ui;color:#8a8a88;padding:0 13mm">
    <span style="float:left">Instructivo del módulo de Traspasos</span>
    <span style="float:right">pág. <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
});
await p.close(); await nav.close();
console.log("PDF listo: manual/Instructivo-Traspasos-CD38-Ag01.pdf");
