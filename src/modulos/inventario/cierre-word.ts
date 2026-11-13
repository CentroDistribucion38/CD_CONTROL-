/**
 * EL WORD DEL INFORME DE CIERRE (análisis de diferencia) — el mismo diseño del PDF (`cierre-pdf.ts`).
 *
 * Tamaño carta; en la cabecera de cada hoja el logo de Bavaria con el rótulo y la fecha, y detrás del texto
 * la B de marca de agua muy suave; estilo sobrio: tablas sin rellenos, encabezados en gris con raya de
 * tinta, rojo solo para negativos y estados como texto. Las tablas son tablas de Word (se pueden editar).
 *
 * Como el de evidencias, es un zip con unos pocos XML armado con `fflate`. No calcula nada.
 */
import { strToU8, zipSync } from "fflate";
import type { Bloque, CeldaT } from "./evidencias-informe";
import { dataUrlABytes } from "./evidencias-word";

export type OpcionesCierreWord = {
  pie: string; fechaHojas: string; ojo: string; titulo: string;
  /** data URL de /marca/logo-bavaria.png (540×160) y de la B YA ACLARADA (ver `aclararImagen`): Word, LibreOffice
   *  y Google Docs no leen igual la transparencia de una imagen en XML, así que la suavidad va en la imagen misma. */
  logo?: string; sello?: string;
};

/** LA B DE MARCA DE AGUA, ACLARADA EN LA IMAGEN: cada píxel se mezcla con blanco al `opacidad` (7 %). Solo navegador. */
export async function aclararImagen(dataUrl: string, opacidad = 0.07): Promise<string | null> {
  try {
    const img = new Image();
    await new Promise<void>((ok, mal) => { img.onload = () => ok(); img.onerror = () => mal(); img.src = dataUrl });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    g.globalAlpha = opacidad; g.drawImage(img, 0, 0);
    return cv.toDataURL("image/png");
  } catch { return null }
}

/* CARTA: 12240 × 15840 twips; márgenes de 0,5" a los lados (como el PDF: 12,7 mm). */
const TW_ANCHO = 12240, TW_ALTO = 15840, MARGEN = 720;
const CW = TW_ANCHO - 2 * MARGEN;
const EMU_TW = 635;
const TINTA = "15181C", ROTULO = "3B4047", GRIS = "6B7078", SUB = "4A4F57", TEXTO = "23272D", LINEA = "E1E3E6", SEP = "9A9EA4";
const X = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hex = (h: string) => h.replace("#", "").toUpperCase();

type Run = { t: string; b?: boolean; sz?: number; color?: string; esp?: number };
const run = (r: Run) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${r.b ? "<w:b/>" : ""}${r.color ? `<w:color w:val="${r.color}"/>` : ""}${r.esp ? `<w:spacing w:val="${r.esp}"/>` : ""}<w:sz w:val="${r.sz ?? 20}"/><w:szCs w:val="${r.sz ?? 20}"/></w:rPr><w:t xml:space="preserve">${X(r.t)}</w:t></w:r>`;
type PPr = { al?: "left" | "center" | "right"; antes?: number; despues?: number; keep?: boolean; salto?: boolean; abajo?: { sz: number; color: string }; tab?: number; linea?: number };
const ppr = (p: PPr) =>
  `<w:pPr>${p.keep ? "<w:keepNext/>" : ""}${p.salto ? "<w:pageBreakBefore/>" : ""}${p.abajo ? `<w:pBdr><w:bottom w:val="single" w:sz="${p.abajo.sz}" w:space="3" w:color="${p.abajo.color}"/></w:pBdr>` : ""}${p.tab ? `<w:tabs><w:tab w:val="right" w:pos="${p.tab}"/></w:tabs>` : ""}<w:spacing w:before="${p.antes ?? 0}" w:after="${p.despues ?? 0}"${p.linea ? ` w:line="${p.linea}" w:lineRule="auto"` : ""}/>${p.al ? `<w:jc w:val="${p.al}"/>` : ""}</w:pPr>`;
const para = (runs: Run[], p: PPr = {}) => `<w:p>${ppr(p)}${runs.map(run).join("")}</w:p>`;
const tab = `<w:r><w:tab/></w:r>`;

type Borde = { sz: number; color: string } | null;
const celda = (contenido: string, ancho: number, o: { arriba?: Borde; abajo?: Borde; mar?: number } = {}) => {
  const b = (lado: string, x?: Borde) => (x ? `<w:${lado} w:val="single" w:sz="${x.sz}" w:color="${x.color}"/>` : `<w:${lado} w:val="nil"/>`);
  return `<w:tc><w:tcPr><w:tcW w:w="${Math.round(ancho)}" w:type="dxa"/><w:tcBorders>${b("top", o.arriba)}${b("left")}${b("bottom", o.abajo)}${b("right")}</w:tcBorders><w:tcMar><w:top w:w="${o.mar ?? 90}" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="${o.mar ?? 90}" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar><w:vAlign w:val="top"/></w:tcPr>${contenido}</w:tc>`;
};
const tablaXml = (anchos: number[], filas: string[], encabezado = true) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${Math.round(anchos.reduce((a, b) => a + b, 0))}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${Math.round(a)}"/>`).join("")}</w:tblGrid>${filas.map((f, i) => `<w:tr><w:trPr><w:cantSplit/>${encabezado && i === 0 ? "<w:tblHeader/>" : ""}</w:trPr>${f}</w:tr>`).join("")}</w:tbl>`;
const espacio = (n: number) => `<w:p>${ppr({ despues: n })}<w:r><w:rPr><w:sz w:val="4"/></w:rPr><w:t></w:t></w:r></w:p>`;

const txt = (c: CeldaT) => (typeof c === "string" ? c : c.x);
const col = (c: CeldaT, base: string) => (typeof c !== "string" && c.color ? hex(c.color) : base);
const neg = (c: CeldaT) => typeof c !== "string" && !!c.bold;

export function armarWordCierre(bloques: Bloque[], o: OpcionesCierreWord): Uint8Array {
  const media: Record<string, Uint8Array> = {};
  const relsCab: string[] = [];
  let nImg = 0;

  /* Las imágenes de la cabecera (logo y marca de agua) viven en los rels de la cabecera. */
  const imgCab = (url: string) => {
    const { bytes, ext } = dataUrlABytes(url);
    nImg++;
    const id = `rIdC${nImg}`, nombre = `cab${nImg}.${ext === "jpeg" ? "jpg" : "png"}`;
    media[`word/media/${nombre}`] = bytes;
    relsCab.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombre}"/>`);
    return { id, nombre };
  };
  const grafico = (id: string, nombre: string, cx: number, cy: number) =>
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${nombre}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;

  let logoXml = "", aguaXml = "";
  if (o.logo) {
    try {
      const { id, nombre } = imgCab(o.logo);
      const altoTw = 450, cx = Math.round(altoTw * 540 / 160 * EMU_TW), cy = Math.round(altoTw * EMU_TW);
      logoXml = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="9001" name="Logo Bavaria"/><wp:cNvGraphicFramePr/>${grafico(id, nombre, cx, cy)}</wp:inline></w:drawing></w:r>`;
    } catch { /* sin logo */ }
  }
  if (o.sello) {
    try {
      /* LA B DETRÁS DEL TEXTO, centrada en la hoja. Llega ya aclarada al 7 % (fondo blanco). */
      const { id, nombre } = imgCab(o.sello);
      const lado = Math.round(7800 * EMU_TW);
      aguaXml = `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${Math.round((TW_ALTO * 0.56 - 3900) * EMU_TW)}</wp:posOffset></wp:positionV><wp:extent cx="${lado}" cy="${lado}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="9002" name="Marca de agua"/><wp:cNvGraphicFramePr/>${grafico(id, nombre, lado, lado)}</wp:anchor></w:drawing></w:r>`;
    } catch { /* sin marca de agua */ }
  }

  const body: string[] = [];

  const titulo = (fuerte: string, suave: string | undefined, salto: boolean) => {
    body.push(para([{ t: fuerte, b: true, sz: 20, color: TINTA }, ...(suave ? [{ t: "   " + suave, sz: 20, color: GRIS }] : [])],
      { salto, antes: salto ? 0 : 400, despues: 140, keep: true, abajo: { sz: 6, color: TINTA } }));
  };

  for (const b of bloques) {
    switch (b.t) {
      case "portada": {
        body.push(para([{ t: b.titulo, b: true, sz: 34, color: TINTA }], { antes: 280, despues: 60 }));
        body.push(para([{ t: b.sub, sz: 17, color: SUB }], { despues: 120 }));
        for (const m of b.meta) body.push(para([{ t: m, sz: 14, color: GRIS }], { despues: 20 }));
        break;
      }
      case "modulo": {
        titulo(b.n, b.titulo, !b.seguido);
        if (b.sub) body.push(para([{ t: b.sub, sz: 14, color: GRIS }], { despues: 100 }));
        break;
      }
      case "sub": titulo(b.texto, b.extra, false); break;
      case "p": body.push(para([{ t: b.texto, sz: b.gris ? 13 : 16, color: b.gris ? GRIS : TEXTO }], { antes: b.gris ? 100 : 200, despues: 40, linea: b.gris ? 300 : 320 })); break;
      case "lista": for (const it of b.items) body.push(para([{ t: "·  " + it, sz: 16, color: TEXTO }], { despues: 60 })); break;
      case "pares": {
        const G = 420, wL = (CW - G) * 0.62 / 2, wV = (CW - G) * 0.38 / 2;
        const anchos = [wL, wV, G, wL, wV];
        const filas = b.filas.map((f, i) => {
          const arriba: Borde = i === 0 ? { sz: 8, color: TINTA } : f.sep ? { sz: 8, color: SEP } : null;
          const ultima = i === b.filas.length - 1;
          const abajoL: Borde = ultima ? { sz: 8, color: TINTA } : b.filas[i + 1].sep ? null : { sz: 4, color: LINEA };
          const lado = (p: [string, CeldaT] | undefined, grande: boolean) => p
            ? celda(para([{ t: p[0], sz: 16, color: ROTULO }]), wL, { arriba, abajo: abajoL }) +
              celda(para([{ t: txt(p[1]), b: true, sz: grande ? 18 : 16, color: col(p[1], TINTA) }], { al: "right" }), wV, { arriba, abajo: abajoL })
            : celda(para([]), wL, { arriba, abajo: ultima ? { sz: 8, color: TINTA } : null }) + celda(para([]), wV, { arriba, abajo: ultima ? { sz: 8, color: TINTA } : null });
          return lado(f.a, !!f.fuerte) + celda(para([]), G, { arriba, abajo: ultima ? { sz: 8, color: TINTA } : null }) + lado(f.b, false);
        });
        body.push(tablaXml(anchos, filas, false), espacio(60));
        break;
      }
      case "tabla": {
        const suma = b.cols.reduce((s, c) => s + c.w, 0);
        const anchos = b.cols.map((c) => (c.w / suma) * CW);
        const al = (c: "l" | "r" | "c" | undefined) => (c === "r" ? "right" : c === "c" ? "center" : "left") as "left" | "right" | "center";
        const mar = b.compacta ? 50 : 80;
        const enc = b.cols.map((c, i) => celda(para([{ t: c.h.toUpperCase(), b: true, sz: 12, color: GRIS, esp: 10 }], { al: al(c.al) }), anchos[i], { abajo: { sz: 6, color: TINTA }, mar: 100 })).join("");
        const filas = b.filas.map((f, r) => {
          const esTotal = !!b.total && r === b.filas.length - 1;
          return f.map((c: CeldaT, i) => celda(para([{ t: txt(c), b: esTotal || neg(c), sz: 14, color: col(c, TINTA) }], { al: al(b.cols[i].al) }), anchos[i],
            esTotal ? { arriba: { sz: 12, color: TINTA }, mar } : { abajo: { sz: 4, color: LINEA }, mar })).join("");
        });
        body.push(tablaXml(anchos, [enc, ...filas]));
        if (b.nota) body.push(para([{ t: b.nota, sz: 13, color: GRIS }], { antes: 120 }));
        body.push(espacio(80));
        break;
      }
      default: break;
    }
  }

  const ns = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`;
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body.join("")}<w:sectPr><w:headerReference w:type="default" r:id="rIdHead"/><w:footerReference w:type="default" r:id="rIdFoot"/><w:pgSz w:w="${TW_ANCHO}" w:h="${TW_ALTO}"/><w:pgMar w:top="1300" w:right="${MARGEN}" w:bottom="1000" w:left="${MARGEN}" w:header="690" w:footer="420" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const campo = (instr: string) => ["begin", null, "separate", "1", "end"].map((k, i) =>
    i === 1 ? `<w:r><w:rPr><w:color w:val="${GRIS}"/><w:sz w:val="13"/></w:rPr><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>`
      : i === 3 ? `<w:r><w:rPr><w:color w:val="${GRIS}"/><w:sz w:val="13"/></w:rPr><w:t>1</w:t></w:r>`
      : `<w:r><w:rPr><w:color w:val="${GRIS}"/><w:sz w:val="13"/></w:rPr><w:fldChar w:fldCharType="${k}"/></w:r>`).join("");
  /* LA CABECERA: logo + rótulo a la izquierda, la fecha a la derecha (tabulador), raya gruesa de tinta. */
  const cabecera = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${ns}><w:p>${ppr({ tab: CW, abajo: { sz: 12, color: TINTA } })}${aguaXml}${logoXml}${run({ t: (logoXml ? "   " : "") + o.ojo, b: true, sz: 15, color: TINTA, esp: 20 })}${tab}${run({ t: o.fechaHojas, sz: 13, color: GRIS })}</w:p></w:hdr>`;
  const pie = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${ns}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="CFD2D6"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${CW}"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>${run({ t: o.pie, sz: 13, color: GRIS })}${tab}${run({ t: "Página ", sz: 13, color: GRIS })}${campo("PAGE")}${run({ t: " de ", sz: 13, color: GRIS })}${campo("NUMPAGES")}</w:p></w:ftr>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

  const archivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(o.titulo)}</dc:title><dc:creator>Control CD38</dc:creator></cp:coreProperties>`),
    "word/document.xml": strToU8(documento),
    "word/styles.xml": strToU8(estilos),
    "word/header1.xml": strToU8(cabecera),
    "word/footer1.xml": strToU8(pie),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHead" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFoot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`),
    "word/_rels/header1.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsCab.join("")}</Relationships>`),
    ...media,
  };
  return zipSync(archivos, { level: 6 });
}
