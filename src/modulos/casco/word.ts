/**
 * EL INFORME DEL CASCO EN WORD (.docx) — lo mismo que el PDF, editable.
 *
 * SIN LIBRERÍA NUEVA. Un .docx es un ZIP con unos XML: se escriben aquí y se empaquetan con
 * `fflate`, que ya está en el proyecto. Agregar `docx` (≈ 1 MB) obligaba a todos a correr
 * `npm install` antes del próximo `npm run dev`, y en Vercel a un package-lock nuevo; esto no.
 *
 * MISMO ORDEN Y MISMAS CIFRAS QUE EL PDF: recibe el mismo `DatosInformeCasco` y la misma imagen
 * de la gráfica, y las columnas de cada almacén salen de `columnasAlmacen`. Nada se recalcula.
 *
 * Word lo abre en cualquier versión (y Google Docs y LibreOffice también): A4 vertical, márgenes
 * de 14 mm, Arial, tablas con cabecera oscura que se repite en cada hoja, pie con «Página i de n».
 */
import { zipSync, strToU8 } from "fflate";
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import {
  celda, colorSitio, columnasAlmacen, conSigno, corta, fmt, larga, rgbHex,
  type DatosInformeCasco, GRAFICA,
} from "./informe";

/* Medidas de Word: twips (1/1440 de pulgada) para el papel, EMU para las imágenes. */
const MM_TW = 56.6929, MM_EMU = 36000;
const tw = (mm: number) => Math.round(mm * MM_TW);
const PAPEL = { w: 11906, h: 16838, m: tw(14) };
const ANCHO_MM = 182;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Texto = { t: string; b?: boolean; tam?: number; color?: string; may?: boolean };
const run = ({ t, b, tam = 9, color, may }: Texto) =>
  `<w:r><w:rPr>${b ? "<w:b/>" : ""}${may ? "<w:caps/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${Math.round(tam * 2)}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const par = (runs: Texto[] | string, o: { al?: "left" | "right" | "center"; antes?: number; despues?: number; keep?: boolean } = {}) =>
  `<w:p><w:pPr>${o.keep ? "<w:keepNext/>" : ""}<w:spacing w:before="${o.antes ?? 0}" w:after="${o.despues ?? 0}"/>${o.al && o.al !== "left" ? `<w:jc w:val="${o.al}"/>` : ""}</w:pPr>${typeof runs === "string" ? runs : runs.map(run).join("")}</w:p>`;

const imagen = (rid: string, id: number, wmm: number, hmm: number, nombre: string) => {
  const cx = Math.round(wmm * MM_EMU), cy = Math.round(hmm * MM_EMU);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${nombre}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${nombre}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
};

/* ---------- TABLAS ---------- */
type Celda = { runs: Texto[]; xml?: string; fondo?: string; al?: "left" | "right" | "center"; izq?: string; arriba?: string };
const SIN = `<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>`;
function tabla(anchos: number[], filas: { celdas: Celda[]; cabecera?: boolean; alto?: number }[], o: { bordes?: boolean; junta?: boolean } = {}) {
  /* JUNTA: cada renglón «se queda con el siguiente», así Word no parte la tabla de un almacén
     en dos hojas si cabe entera en una (si no cabe, la parte igual y repite la cabecera). */
  const keep = (i: number) => (o.junta && i < filas.length - 1 ? { keep: true } : {});
  const total = anchos.reduce((a, b) => a + b, 0);
  const bordes = o.bordes === false
    ? `<w:tblBorders>${SIN}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>`
    : `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="4" w:color="D5DCE5"/><w:right w:val="nil"/><w:insideH w:val="single" w:sz="2" w:color="E6EAF0"/><w:insideV w:val="nil"/></w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/>${bordes}<w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${tw(a)}"/>`).join("")}</w:tblGrid>` +
    filas.map((f, fi) => `<w:tr><w:trPr><w:cantSplit/>${f.cabecera ? "<w:tblHeader/>" : ""}${f.alto ? `<w:trHeight w:val="${tw(f.alto)}"/>` : ""}</w:trPr>` +
      f.celdas.map((c, i) => `<w:tc><w:tcPr><w:tcW w:w="${tw(anchos[i])}" w:type="dxa"/>` +
        (c.izq || c.arriba ? `<w:tcBorders>${c.arriba ? `<w:top w:val="single" w:sz="18" w:color="${c.arriba}"/>` : ""}${c.izq ? `<w:left w:val="single" w:sz="36" w:color="${c.izq}"/>` : ""}</w:tcBorders>` : "") +
        (c.fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fondo}"/>` : "") + `<w:vAlign w:val="center"/></w:tcPr>` +
        (c.xml ?? par(c.runs, { al: c.al, ...keep(fi) })) + `</w:tc>`).join("") + `</w:tr>`).join("") +
    `</w:tbl>`;
}

const dataUrlBytes = (u: string) => {
  const b = atob(u.slice(u.indexOf(",") + 1));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

export function armarWordCasco(
  d: DatosInformeCasco,
  extra: { generado: Date; paleta?: Paleta; grafica?: string | null; palabra?: string | null },
): Uint8Array {
  const P = extra.paleta ?? PALETA_MARCA;
  const T = rgbHex(P.tinta), A = rgbHex(P.acento), G = "5F6B79", CLARO = "F6F8FA", RAYA = "F7F9FB";
  const TEN = rgbHex(P.tinta.map((c) => Math.round(255 - (255 - c) * 0.16)) as [number, number, number]);
  const cuerpo: string[] = [];
  const titulo = (t: string, nota?: string, color = A) => cuerpo.push(
    `<w:p><w:pPr><w:keepNext/><w:tabs><w:tab w:val="right" w:pos="${tw(ANCHO_MM)}"/></w:tabs><w:spacing w:before="160" w:after="100"/></w:pPr>` +
    run({ t: "■ ", color, tam: 11 }) + run({ t, b: true, tam: 12, color: T }) +
    (nota ? `<w:r><w:tab/></w:r>` + run({ t: nota, tam: 8.5, color: G }) : "") + `</w:p>`);

  /* ---------- CABECERA ---------- */
  cuerpo.push(tabla([70, ANCHO_MM - 70], [{ celdas: [
    { runs: [], xml: par(extra.palabra ? imagen("rIdLogo", 1, 15 * 540 / 160, 15, "Bavaria") : run({ t: "Bavaria", b: true, tam: 18, color: "FF000F" })) },
    { runs: [{ t: "CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", b: true, tam: 7.5, color: G }], al: "right" },
  ] }], { bordes: false }));
  cuerpo.push(par([{ t: "Casco de vidrio por partir", b: true, tam: 20, color: T }], { al: "right" }));
  cuerpo.push(par([{ t: d.periodo.charAt(0).toUpperCase() + d.periodo.slice(1), tam: 10, color: G }], { al: "right", despues: 120 }));
  cuerpo.push(`<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="8" w:color="${T}"/></w:pBdr><w:spacing w:before="0" w:after="120"/></w:pPr></w:p>`);

  if (d.filtros) {
    cuerpo.push(tabla([ANCHO_MM], [{ celdas: [{ izq: T, runs: [{ t: "FILTRADO   ", b: true, tam: 7.5, color: G }, { t: d.filtros, tam: 8.5, color: T }] }] }],
      { bordes: false }), par("", { despues: 100 }));
  }

  /* ---------- LA CIFRA, EN LA BANDA OSCURA ---------- */
  const vs = d.anterior ? `${conSigno(d.total - d.anterior.total)} HL vs ${corta(d.anterior.fecha)}` : "sin día anterior";
  const gen = `generado el ${extra.generado.toLocaleDateString("es-CO")} a las ${extra.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
  cuerpo.push(tabla([ANCHO_MM * 0.55, ANCHO_MM * 0.45], [
    { celdas: [
      { fondo: T, izq: A, runs: [{ t: fmt.hl0(d.total), b: true, tam: 26, color: "FFFFFF" }, { t: `  HL por partir al ${corta(d.corte)}`, tam: 10.5, color: TEN }] },
      { fondo: T, al: "right", xml: par([{ t: `${fmt.viajes(d.viajes)} viajes SERPRO`, b: true, tam: 11, color: "FFFFFF" }], { al: "right" }) +
          par([{ t: `${vs} · ${gen}`, tam: 8.5, color: TEN }], { al: "right" }), runs: [] },
    ] },
  ], { bordes: false }));
  cuerpo.push(par("", { despues: 160 }));

  /* ---------- LAS CIFRAS DE CADA ALMACÉN: las tarjetas de «las cuatro cifras» ---------- */
  titulo("Cómo está cada almacén", "su último conteo en el periodo");
  const ns = Math.max(1, d.sitios.length), GAP = 3, tarj = (ANCHO_MM - GAP * (ns - 1)) / ns;
  const anchos: number[] = []; d.sitios.forEach((_, i) => { if (i) anchos.push(GAP); anchos.push(tarj) });
  const fila = (f: (s: typeof d.sitios[number]) => Texto[]) => ({ celdas: d.sitios.flatMap((s, i) => {
    const c: Celda = { fondo: "F3F6F9", runs: f(s) };
    return i ? [{ runs: [] } as Celda, c] : [c];
  }) });
  cuerpo.push(tabla(anchos, [
    fila((s) => [{ t: "■ ", color: colorSitio(s.clave).fondo.slice(1), tam: 8 }, { t: s.nombre.toUpperCase(), b: true, tam: 6.3, color: G }]),
    fila((s) => [{ t: fmt.hl(s.total), b: true, tam: 16, color: T }]),
    fila((s) => {
      const dl = s.anterior ? s.total - s.anterior.total : null;
      return [{ t: `HL al ${s.fecha ? corta(s.fecha) : "—"}${d.total > 0 ? ` · ${Math.round(s.total / d.total * 100)} %` : ""} · ` +
        (dl == null ? `${s.filas.length} mat.` : `${conSigno(dl, fmt.hl)} vs ${corta(s.anterior!.fecha)}`), tam: 6.5, color: dl != null && dl > 0.05 ? "C8102E" : G }];
    }),
  ], { bordes: false }));
  cuerpo.push(par([{ t: "El % es la parte de cada almacén en el total del último día. En rojo: subió contra su conteo anterior.", tam: 7, color: G }], { antes: 60, despues: 200 }));

  /* ---------- GRÁFICA ---------- */
  titulo("Envases pendientes por partir (HL)");
  cuerpo.push(par(d.claves.map((k) => run({ t: "■ ", color: colorSitio(k).fondo.slice(1), tam: 10 }) +
    run({ t: `${d.sitios.find((s) => s.clave === k)?.nombre ?? k}     `, tam: 8, color: G })).join(""), { despues: 60 }));
  if (extra.grafica) cuerpo.push(par(imagen("rIdGrafica", 2, GRAFICA.ancho, GRAFICA.alto, "Gráfica")));
  cuerpo.push(par([{ t: `Una barra por día con registros, del ${corta(d.serie[0]?.fecha ?? d.corte)} al ${corta(d.corte)}: cada color es un almacén y encima va el total del día.`, tam: 7, color: G }], { antes: 60, despues: 240 }));

  /* ---------- DETALLE DE CADA ALMACÉN ---------- */
  for (const s of d.sitios) {
    const cols = columnasAlmacen(s, ANCHO_MM);
    /* EL TÍTULO DEL ALMACÉN es el de todas las partes (párrafo con «mantener con el siguiente»,
       así nunca queda solo al pie de una hoja), con el cuadrito en SU color de la gráfica. */
    titulo(s.nombre, s.fecha ? `conteo del ${larga(s.fecha)} · ${fmt.hl(s.total)} HL` : "sin conteo en el periodo", colorSitio(s.clave).fondo.slice(1));
    if (!s.filas.length) {
      cuerpo.push(par([{ t: "Sin casco con inventario en este conteo.", tam: 9, color: G }], { despues: 240 }));
      continue;
    }
    const cab = { cabecera: true, celdas: cols.map((c) => ({ fondo: T, al: c.num ? "right" as const : "left" as const, runs: [{ t: c.titulo, b: true, tam: 8, color: "FFFFFF" }] })) };
    const filas = s.filas.map((f, i) => ({ celdas: cols.map((c) => ({
      fondo: i % 2 ? RAYA : undefined, al: c.num ? "right" as const : "left" as const,
      runs: [{ t: celda(c, f), b: c.id === "hl", tam: c.id === "cod" || c.id === "ubi" || c.id === "cal" ? 8 : 8.5, color: c.id === "cod" || c.id === "ubi" || c.id === "cal" ? G : T }],
    })) }));
    const tot = { celdas: cols.map((c) => {
      const v = c.id === "cod" ? "TOTAL" : c.id === "mat" ? `${s.filas.length} material${s.filas.length === 1 ? "" : "es"} con inventario`
        : c.id === "inv" ? fmt.est(s.filas.reduce((t, r) => t + r.inventario, 0))
        : c.id === "baja" ? fmt.est(s.filas.reduce((t, r) => t + r.baja, 0))
        : c.id === "hl" ? fmt.hl(s.total) : "";
      return { arriba: T, al: c.num ? "right" as const : "left" as const, runs: [{ t: v, b: c.id !== "mat", tam: c.id === "mat" ? 8 : 8.5, color: c.id === "mat" ? G : T }] };
    }) };
    cuerpo.push(tabla(cols.map((c) => c.mm), [cab, ...filas, tot], { junta: filas.length <= 30 }));
    cuerpo.push(par("", { despues: 280 }));
  }

  /* ---------- DINÁMICA ---------- */
  const TOPE_DIAS = 62;
  const dias = [...d.serie].reverse().slice(0, TOPE_DIAS);
  titulo("HL pendiente por disposición", d.serie.length > TOPE_DIAS ? `los ${TOPE_DIAS} días más recientes de ${d.serie.length}` : "el día más nuevo arriba");
  const cF = 26, cT = 28, cS = (ANCHO_MM - cF - cT) / Math.max(1, d.claves.length);
  const centro = (k: string) => d.sitios.find((s) => s.clave === k)?.centro ?? k;
  cuerpo.push(tabla([cF, ...d.claves.map(() => cS), cT], [
    { cabecera: true, celdas: [
      { fondo: T, runs: [{ t: "FECHA", b: true, tam: 7.5, color: "FFFFFF" }] },
      ...d.claves.map((k) => ({ fondo: T, al: "right" as const, runs: [{ t: centro(k), b: true, tam: 7.5, color: "FFFFFF" }] })),
      { fondo: T, al: "right", runs: [{ t: "TOTAL", b: true, tam: 7.5, color: "FFFFFF" }] },
    ] },
    ...dias.map((dia, i) => ({ celdas: [
      { fondo: i % 2 ? RAYA : undefined, runs: [{ t: corta(dia.fecha), b: i === 0, tam: 8.5, color: T }] },
      ...d.claves.map((k) => ({ fondo: i % 2 ? RAYA : undefined, al: "right" as const, runs: [{ t: dia.porSitio[k] == null ? "—" : fmt.hl0(dia.porSitio[k]), tam: 8.5, color: dia.porSitio[k] == null ? G : T }] })),
      { fondo: i % 2 ? RAYA : undefined, al: "right" as const, runs: [{ t: fmt.hl0(dia.total), b: true, tam: 8.5, color: T }] },
    ] })),
  ]));

  /* ---------- EL PAQUETE ---------- */
  const pieTxt = `Casco de vidrio · ${d.periodo} · ${d.filtros ? `Filtrado · ${d.filtros}` : "Sin filtros"}`;
  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`;
  const campo = (c: string) => `<w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:instrText xml:space="preserve"> ${c} </w:instrText></w:r><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>` +
    `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:color="${A}" w:space="4"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${PAPEL.w - 2 * PAPEL.m}"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>` +
    run({ t: pieTxt, tam: 7.5, color: G }) + `<w:r><w:tab/></w:r>` + run({ t: "Bavaria · Página ", tam: 7.5, color: G }) + campo("PAGE") + run({ t: " de ", tam: 7.5, color: G }) + campo("NUMPAGES") +
    `</w:p></w:ftr>`;

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${cuerpo.join("")}` +
    `<w:sectPr><w:footerReference w:type="default" r:id="rIdPie"/><w:pgSz w:w="${PAPEL.w}" w:h="${PAPEL.h}"/>` +
    `<w:pgMar w:top="${PAPEL.m}" w:right="${PAPEL.m}" w:bottom="${tw(18)}" w:left="${PAPEL.m}" w:header="${tw(8)}" w:footer="${tw(8)}" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

  const rels = [
    `<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rIdPie" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`,
  ];
  const archivos: Record<string, Uint8Array> = {};
  if (extra.palabra) { archivos["word/media/logo.png"] = dataUrlBytes(extra.palabra); rels.push(`<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>`) }
  if (extra.grafica) { archivos["word/media/grafica.png"] = dataUrlBytes(extra.grafica); rels.push(`<Relationship Id="rIdGrafica" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/grafica.png"/>`) }

  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>Casco de vidrio por partir · corte ${esc(d.corte)}</dc:title><dc:creator>CONTROL · CD38</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${extra.generado.toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`),
    "word/document.xml": strToU8(documento),
    "word/styles.xml": strToU8(estilos),
    "word/footer1.xml": strToU8(footer),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`),
    ...archivos,
  });
}
