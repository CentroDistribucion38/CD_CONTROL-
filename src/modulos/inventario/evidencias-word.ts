/**
 * EL WORD DE EVIDENCIAS — pinta la lista de bloques de `evidencias-informe.ts` como un .docx.
 *
 * No hay librería de Word en el proyecto: un .docx es un zip con unos pocos XML, y `fflate` (que ya
 * está) lo arma. Horizontal (A4), mismos módulos que el PDF, cada uno en hoja nueva; las gráficas
 * y las fotos van como imágenes; las tablas son tablas de Word (se pueden editar).
 * Se abre en Word, LibreOffice y Google Docs.
 */
import { strToU8, zipSync } from "fflate";
import type { Bloque, CeldaT } from "./evidencias-informe";

export type ExtraWord = { periodo: string; filtros: string; generado: string; tinta?: string; acento?: string; logo?: string };

const TW_ANCHO = 16838, TW_ALTO = 11906, MARGEN = 720;
const CW = TW_ANCHO - 2 * MARGEN;                    // 15398 twips de ancho útil
const EMU_TW = 635;                                  // 1 twip = 635 EMU
const X = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Run = { t: string; b?: boolean; sz?: number; color?: string };
const run = (r: Run) =>
  `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${r.b ? "<w:b/>" : ""}${r.color ? `<w:color w:val="${r.color}"/>` : ""}<w:sz w:val="${r.sz ?? 20}"/><w:szCs w:val="${r.sz ?? 20}"/></w:rPr><w:t xml:space="preserve">${X(r.t)}</w:t></w:r>`;

type PPr = { al?: "left" | "center" | "right"; antes?: number; despues?: number; sombra?: string; keep?: boolean; salto?: boolean; sangria?: number; colgante?: number; borde?: string };
const ppr = (p: PPr) =>
  `<w:pPr>${p.keep ? "<w:keepNext/>" : ""}${p.salto ? "<w:pageBreakBefore/>" : ""}${p.borde ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${p.borde}"/></w:pBdr>` : ""}${p.sombra ? `<w:shd w:val="clear" w:color="auto" w:fill="${p.sombra}"/>` : ""}<w:spacing w:before="${p.antes ?? 0}" w:after="${p.despues ?? 60}"/>${p.sangria != null ? `<w:ind w:left="${p.sangria}"${p.colgante ? ` w:hanging="${p.colgante}"` : ""}/>` : ""}${p.al ? `<w:jc w:val="${p.al}"/>` : ""}</w:pPr>`;
const para = (runs: Run[], p: PPr = {}) => `<w:p>${ppr(p)}${runs.map(run).join("")}</w:p>`;

const hex = (h: string) => h.replace("#", "").toUpperCase();

export function dataUrlABytes(url: string): { bytes: Uint8Array; ext: "png" | "jpeg" } {
  const [cab, b64] = url.split(",");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext: /jpe?g/i.test(cab) ? "jpeg" : "png" };
}

export function armarWord(bloques: Bloque[], x: ExtraWord): Uint8Array {
  const TINTA = hex(x.tinta ?? "#12263A"), ACENTO = hex(x.acento ?? "#FF7A1A");
  const media: Record<string, Uint8Array> = {};
  const rels: string[] = [];
  let nImg = 0;

  /** Registra una imagen y devuelve el XML en línea; `anchoTw` es el ancho que ocupa en la página. */
  const imagen = (url: string, w: number, h: number, anchoTw: number, maxAltoTw = 7600): string => {
    const { bytes, ext } = dataUrlABytes(url);
    nImg++;
    const id = `rIdImg${nImg}`, nombre = `imagen${nImg}.${ext === "jpeg" ? "jpg" : "png"}`;
    media[`word/media/${nombre}`] = bytes;
    rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombre}"/>`);
    let aw = anchoTw, ah = (h / w) * aw;
    if (ah > maxAltoTw) { ah = maxAltoTw; aw = (w / h) * ah }
    const cx = Math.round(aw * EMU_TW), cy = Math.round(ah * EMU_TW);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${nImg}" name="Imagen ${nImg}" descr="Gráfica o foto del informe"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${nImg}" name="${nombre}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };
  const parrafoImg = (xml: string, al: "left" | "center" = "center", despues = 80) => `<w:p>${ppr({ al, despues })}${xml}</w:p>`;

  /* Tablas: bordes finos, sin saltos de fila partidos. */
  const celda = (contenido: string, ancho: number, o: { fill?: string; borde?: boolean; v?: "top" | "center"; mar?: number } = {}) =>
    `<w:tc><w:tcPr><w:tcW w:w="${Math.round(ancho)}" w:type="dxa"/>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ""}<w:tcMar><w:top w:w="${o.mar ?? 40}" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="${o.mar ?? 40}" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar><w:vAlign w:val="${o.v ?? "center"}"/></w:tcPr>${contenido}</w:tc>`;
  const tabla = (anchos: number[], filas: string[], conBorde = true, repiteEncabezado = true) =>
    `<w:tbl><w:tblPr><w:tblW w:w="${Math.round(anchos.reduce((a, b) => a + b, 0))}" w:type="dxa"/>${conBorde
      ? `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D5DCE5"/><w:left w:val="single" w:sz="4" w:color="D5DCE5"/><w:bottom w:val="single" w:sz="4" w:color="D5DCE5"/><w:right w:val="single" w:sz="4" w:color="D5DCE5"/><w:insideH w:val="single" w:sz="4" w:color="E2E7EE"/><w:insideV w:val="single" w:sz="4" w:color="E2E7EE"/></w:tblBorders>`
      : ""}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${Math.round(a)}"/>`).join("")}</w:tblGrid>${filas.map((f, i) => `<w:tr><w:trPr><w:cantSplit/>${repiteEncabezado && i === 0 ? "<w:tblHeader/>" : ""}</w:trPr>${f}</w:tr>`).join("")}</w:tbl>`;
  const sinTexto = () => `<w:p>${ppr({ despues: 0 })}</w:p>`;
  const espacio = (n = 80) => `<w:p>${ppr({ despues: n })}<w:r><w:rPr><w:sz w:val="4"/></w:rPr><w:t></w:t></w:r></w:p>`;

  const body: string[] = [];

  for (const b of bloques) {
    switch (b.t) {
      case "portada": {
        if (x.logo) {
          try { body.push(parrafoImg(imagen(x.logo, 540, 160, 2800, 850), "left", 60)) } catch { /* sin logo */ }
        }
        body.push(para([{ t: "INVENTARIO · CONTEO", b: true, sz: 16, color: "5F6B79" }], { despues: 40, borde: TINTA }));
        body.push(para([{ t: b.titulo, b: true, sz: 44, color: TINTA }], { antes: 100, despues: 20 }));
        body.push(para([{ t: b.sub, sz: 24, color: "5F6B79" }], { despues: 60 }));
        for (const m of b.meta) body.push(para([{ t: m, sz: 19, color: "5F6B79" }], { despues: 20 }));
        body.push(espacio(40));
        break;
      }
      case "modulo": {
        body.push(para([{ t: b.n + "  ", b: true, sz: 17, color: "FFC21A" }, { t: b.titulo, b: true, sz: 30, color: "FFFFFF" }], { salto: true, sombra: TINTA, antes: 0, despues: 80, keep: true, sangria: 120 }));
        if (b.sub) body.push(para([{ t: b.sub, sz: 19, color: "5F6B79" }], { despues: 140 }));
        break;
      }
      case "sub": body.push(para([{ t: "■ ", sz: 16, color: ACENTO }, { t: b.texto, b: true, sz: 24, color: TINTA }], { antes: 160, despues: 80, keep: true })); break;
      case "p": body.push(para([{ t: b.texto, sz: 20, color: b.gris ? "5F6B79" : TINTA }], { despues: 80 })); break;
      case "lista": for (const it of b.items) body.push(para([{ t: "■  ", sz: 12, color: ACENTO }, { t: it, sz: 20, color: TINTA }], { despues: 60, sangria: 300, colgante: 300 })); break;
      case "kpis": {
        const n = b.items.length, w = CW / n;
        const fila = b.items.map((k) => celda(
          para([{ t: k.rotulo.toUpperCase(), b: true, sz: 14, color: "5F6B79" }], { despues: 20 }) +
          para([{ t: k.valor, b: true, sz: 44, color: k.color ? hex(k.color) : TINTA }], { despues: 0 }) +
          para([{ t: k.detalle ?? " ", sz: 14, color: "5F6B79" }], { despues: 0 }), w, { fill: "F4F6F9", mar: 90, v: "top" })).join("");
        body.push(tabla(Array(n).fill(w), [fila], true, false), espacio(120));
        break;
      }
      case "img": {
        body.push(parrafoImg(imagen(b.img.png, b.img.w, b.img.h, CW * (b.ancho ?? 1), 7300), "center", b.pie ? 20 : 100));
        if (b.pie) body.push(para([{ t: b.pie, sz: 16, color: "5F6B79" }], { al: "center", despues: 100 }));
        break;
      }
      case "imgs2": {
        const w = CW / 2;
        const c = (img: { png: string; w: number; h: number }, pie?: string) =>
          celda(`<w:p>${ppr({ al: "center", despues: 20 })}${imagen(img.png, img.w, img.h, w - 200, 4600)}</w:p>${pie ? para([{ t: pie, sz: 16, color: "5F6B79" }], { al: "center", despues: 0 }) : ""}`, w, { v: "top" });
        body.push(tabla([w, w], [c(b.a, b.pieA) + c(b.b, b.pieB)], false, false), espacio(100));
        break;
      }
      case "tabla": {
        const suma = b.cols.reduce((s, c) => s + c.w, 0);
        const anchos = b.cols.map((c) => (c.w / suma) * CW);
        const al = (c: "l" | "r" | "c" | undefined) => (c === "r" ? "right" : c === "c" ? "center" : "left") as "left" | "right" | "center";
        const enc = b.cols.map((c, i) => celda(para([{ t: c.h, b: true, sz: 15, color: "FFFFFF" }], { al: al(c.al), despues: 0 }), anchos[i], { fill: TINTA })).join("");
        const filas = b.filas.map((f, r) => f.map((c: CeldaT, i) => {
          const o = typeof c === "string" ? null : c;
          return celda(para([{ t: typeof c === "string" ? c : c.x, b: !!o?.bold, sz: b.compacta ? 14 : 16, color: o?.color ? hex(o.color) : TINTA }], { al: al(b.cols[i].al), despues: 0 }), anchos[i], { fill: o?.fill ? hex(o.fill) : r % 2 === 1 ? "F4F6F9" : undefined, mar: b.compacta ? 15 : 30 });
        }).join(""));
        body.push(tabla(anchos, [enc, ...filas]));
        if (!b.filas.length && b.nota) body.push(para([{ t: b.nota, sz: 18, color: "5F6B79" }], { antes: 60 }));
        else if (b.nota) body.push(para([{ t: b.nota, sz: 17, color: "5F6B79" }], { antes: 60 }));
        body.push(espacio(120));
        break;
      }
      case "fotos": {
        const COLS = 6, w = CW / COLS;
        for (let i = 0; i < b.items.length; i += COLS) {
          const grupo = b.items.slice(i, i + COLS);
          const celdas = grupo.map((it) => celda(
            `<w:p>${ppr({ al: "center", despues: 20 })}${imagen(it.foto.jpg, it.foto.w, it.foto.h, w - 200, 1750)}</w:p>` +
            para([{ t: it.titulo, b: true, sz: 14, color: TINTA }], { despues: 0 }) + para([{ t: it.detalle, sz: 12, color: "5F6B79" }], { despues: 0 }), w, { v: "top", mar: 60 }));
          while (celdas.length < COLS) celdas.push(celda(sinTexto(), w));
          body.push(tabla(Array(COLS).fill(w), [celdas.join("")], false, false));
        }
        if (b.nota) body.push(para([{ t: b.nota, sz: 17, color: "5F6B79" }], { antes: 80 }));
        body.push(espacio(60));
        break;
      }
    }
  }

  const ns = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`;
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body.join("")}<w:sectPr><w:headerReference w:type="default" r:id="rIdHead"/><w:footerReference w:type="default" r:id="rIdFoot"/><w:pgSz w:w="${TW_ANCHO}" w:h="${TW_ALTO}" w:orient="landscape"/><w:pgMar w:top="1000" w:right="${MARGEN}" w:bottom="900" w:left="${MARGEN}" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const campo = (instr: string) => `<w:r><w:rPr><w:color w:val="5F6B79"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="5F6B79"/><w:sz w:val="15"/></w:rPr><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:rPr><w:color w:val="5F6B79"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="5F6B79"/><w:sz w:val="15"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="5F6B79"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  const cabecera = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${ns}>${para([{ t: "Inventario · Informe de evidencias del conteo  ·  " + x.periodo, sz: 15, color: "5F6B79" }], { borde: "D5DCE5", despues: 0 })}</w:hdr>`;
  const pie = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${ns}><w:p>${ppr({ despues: 0, al: "right" })}${run({ t: x.filtros + "   ·   Página ", sz: 15, color: "5F6B79" })}${campo("PAGE")}${run({ t: " de ", sz: 15, color: "5F6B79" })}${campo("NUMPAGES")}</w:p></w:ftr>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

  const archivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X("Informe de evidencias del conteo · " + x.periodo)}</dc:title><dc:creator>Control CD38</dc:creator></cp:coreProperties>`),
    "word/document.xml": strToU8(documento),
    "word/styles.xml": strToU8(estilos),
    "word/header1.xml": strToU8(cabecera),
    "word/footer1.xml": strToU8(pie),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHead" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFoot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${rels.join("")}</Relationships>`),
    ...media,
  };
  /* El [Content_Types].xml va primero: algunos lectores lo exigen. */
  return zipSync(archivos, { level: 6 });
}

export const nombreEvidenciasWord = (desde: string, hasta: string) => `evidencias-inventario-${desde}${hasta !== desde ? `_${hasta}` : ""}.docx`;
