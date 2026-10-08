/* EL INFORME DE EVIDENCIAS LLEVA TODAS LAS FOTOS (sin tope de 24): 120 fotos entran en el PDF y en el Word. */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
import sharp from "sharp";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const bundle = (entry, out) => { writeFileSync(R(out), buildSync({ entryPoints: [R(entry)], bundle: true, write: false, format: "esm", platform: "node", external: ["jspdf", "fflate", "exceljs"], logLevel: "silent",
  alias: { "@": R("src") } }).outputFiles[0].text) };
bundle("src/modulos/inventario/evidencias-pdf.ts", ".arnes/_ev-pdf.mjs"); bundle("src/modulos/inventario/evidencias-word.ts", ".arnes/_ev-word.mjs");
const { dibujarEvidencias } = await import(R(".arnes/_ev-pdf.mjs")); const { armarWord } = await import(R(".arnes/_ev-word.mjs"));
const { jsPDF } = await import("jspdf");
/* DISTINTAS entre sí: jsPDF junta las imágenes idénticas en una sola y el conteo saldría engañoso. */
const jpgs = await Promise.all(Array.from({ length: 120 }, async (_, i) => "data:image/jpeg;base64," + (await sharp({ create: { width: 360, height: 270, channels: 3, background: { r: (i * 7) % 256, g: (i * 13) % 256, b: (i * 29) % 256 } } }).jpeg({ quality: 72 }).toBuffer()).toString("base64")));
const N = 120;
const bloques = [
  { t: "modulo", n: "MÓDULO 5", titulo: "Evidencias fotográficas", sub: "x" },
  { t: "fotos", items: Array.from({ length: N }, (_, i) => ({ foto: { jpg: jpgs[i], w: 360, h: 270 }, titulo: `C0${i % 9}_IZQ · Avería`, detalle: `Foto ${i + 1}` })) },
];
const doc = dibujarEvidencias(jsPDF, bloques, { periodo: "x", filtros: "x", generado: "x" });
const pags = doc.getNumberOfPages(); const imgs = (doc.output().match(/\/Subtype \/Image/g) ?? []).length;
console.log("PDF:", pags, "páginas,", imgs, "imágenes,", Math.round(doc.output().length / 1024), "KB");
if (imgs < N) fallas.push(`el PDF trae ${imgs} imágenes de ${N}`);
const w = armarWord(bloques, { periodo: "x", filtros: "x", generado: "x" });
const { unzipSync } = await import("fflate"); const z = unzipSync(w);
const medios = Object.keys(z).filter((k) => k.startsWith("word/media/")).length; const dr = (Buffer.from(z["word/document.xml"]).toString().match(/<w:drawing>/g) ?? []).length;
console.log("Word:", dr, "dibujos,", medios, "archivos de imagen,", Math.round(w.length / 1024), "KB");
if (dr < N) fallas.push(`el Word trae ${dr} fotos de ${N}`);
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ El informe de Evidencias lleva las 120 fotos en PDF y en Word, sin tope.");
