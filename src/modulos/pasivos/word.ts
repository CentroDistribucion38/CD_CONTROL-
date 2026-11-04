/**
 * EL INFORME PASIVO EN WORD (.docx) — lo mismo que el PDF, editable.
 *
 * Igual que el Word del casco: sin librería nueva (los XML se escriben aquí y se empaquetan con
 * `fflate`), A4 vertical, márgenes de 14 mm, Arial, tablas con cabecera oscura que se repite en cada
 * hoja y pie con «Página i de n». Recibe los mismos datos y las mismas gráficas que el PDF.
 */
import { zipSync, strToU8 } from "fflate";
import { gruposDeUbicacion } from "@/modulos/casco/informe";
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import {
  COLOR_ALMACEN, colorEstado, corta, f0, f1, larga, mesDe, plata, rgbHex, MEDIDA,
  type DatosInformePasivo, type Graficas,
} from "./informe";

const MM_TW = 56.6929, MM_EMU = 36000;
const tw = (mm: number) => Math.round(mm * MM_TW);
const PAPEL = { w: 11906, h: 16838, m: tw(14) };
const ANCHO_MM = 182;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Texto = { t: string; b?: boolean; tam?: number; color?: string };
const run = ({ t, b, tam = 9, color }: Texto) =>
  `<w:r><w:rPr>${b ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${Math.round(tam * 2)}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
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
type Celda = { runs: Texto[]; xml?: string; fondo?: string; al?: "left" | "right" | "center"; izq?: string; arriba?: string };
const SIN = `<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>`;
function tabla(anchos: number[], filas: { celdas: Celda[]; cabecera?: boolean }[], o: { bordes?: boolean; junta?: boolean } = {}) {
  const keep = (i: number) => (o.junta && i < filas.length - 1 ? { keep: true } : {});
  const total = anchos.reduce((a, b) => a + b, 0);
  const bordes = o.bordes === false
    ? `<w:tblBorders>${SIN}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>`
    : `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="4" w:color="D5DCE5"/><w:right w:val="nil"/><w:insideH w:val="single" w:sz="2" w:color="E6EAF0"/><w:insideV w:val="nil"/></w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/>${bordes}<w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${tw(a)}"/>`).join("")}</w:tblGrid>` +
    filas.map((f, fi) => `<w:tr><w:trPr><w:cantSplit/>${f.cabecera ? "<w:tblHeader/>" : ""}</w:trPr>` +
      f.celdas.map((c, i) => `<w:tc><w:tcPr><w:tcW w:w="${tw(anchos[i])}" w:type="dxa"/>` +
        (c.izq || c.arriba ? `<w:tcBorders>${c.arriba ? `<w:top w:val="single" w:sz="18" w:color="${c.arriba}"/>` : ""}${c.izq ? `<w:left w:val="single" w:sz="36" w:color="${c.izq}"/>` : ""}</w:tcBorders>` : "") +
        (c.fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fondo}"/>` : "") + `<w:vAlign w:val="center"/></w:tcPr>` +
        (c.xml ?? par(c.runs, { al: c.al, ...keep(fi) })) + `</w:tc>`).join("") + `</w:tr>`).join("") + `</w:tbl>`;
}
const dataUrlBytes = (u: string) => {
  const b = atob(u.slice(u.indexOf(",") + 1)); const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

export function armarWordPasivo(d: DatosInformePasivo, extra: { generado: Date; paleta?: Paleta; graficas: Graficas; palabra?: string | null }): Uint8Array {
  const P = extra.paleta ?? PALETA_MARCA;
  const T = rgbHex(P.tinta), A = rgbHex(P.acento), G = "5F6B79", RAYA = "F7F9FB";
  const TEN = rgbHex(P.tinta.map((c) => Math.round(255 - (255 - c) * 0.16)) as [number, number, number]);
  const cuerpo: string[] = [];
  const imgs: { rid: string; archivo: string; src: string }[] = [];
  let nImg = 10;
  const meterImagen = (src: string | null, wmm: number, hmm: number, nombre: string) => {
    if (!src) { cuerpo.push(par([{ t: "La gráfica no se pudo dibujar en este equipo.", tam: 9, color: G }])); return }
    const rid = `rIdG${nImg}`; imgs.push({ rid, archivo: `g${nImg}.png`, src });
    cuerpo.push(par(imagen(rid, nImg, wmm, hmm, nombre))); nImg++;
  };
  const titulo = (t: string, nota?: string) => cuerpo.push(
    `<w:p><w:pPr><w:keepNext/><w:tabs><w:tab w:val="right" w:pos="${tw(ANCHO_MM)}"/></w:tabs><w:spacing w:before="200" w:after="100"/></w:pPr>` +
    run({ t: "■ ", color: A, tam: 11 }) + run({ t, b: true, tam: 12, color: T }) + (nota ? `<w:r><w:tab/></w:r>` + run({ t: nota, tam: 8.5, color: G }) : "") + `</w:p>`);
  const leyenda = () => cuerpo.push(par(d.estados.map((e) => run({ t: "■ ", color: colorEstado(e).slice(1), tam: 10 }) + run({ t: `${e}     `, tam: 8, color: G })).join(""), { despues: 60, keep: true }));
  const cab = (cols: { t: string; num?: boolean }[]) => ({ cabecera: true, celdas: cols.map((c) => ({ fondo: T, al: c.num ? "right" as const : "left" as const, runs: [{ t: c.t, b: true, tam: 7.8, color: "FFFFFF" }] })) });
  const fila = (vals: string[], nums: boolean[], i: number) => ({ celdas: vals.map((v, j) => ({ fondo: i % 2 ? RAYA : undefined, al: nums[j] ? "right" as const : "left" as const,
    runs: [{ t: v, b: nums[j] && !nums[j + 1] && j > 0, tam: j === 0 ? 8 : 8.5, color: nums[j] && v.startsWith("-") ? "C8102E" : j === 0 ? G : T }] })) });
  const tot = (vals: string[], nums: boolean[]) => ({ celdas: vals.map((v, j) => ({ arriba: T, al: nums[j] ? "right" as const : "left" as const, runs: [{ t: v, b: true, tam: 8.5, color: T }] })) });

  /* ---------- CABECERA ---------- */
  cuerpo.push(tabla([70, ANCHO_MM - 70], [{ celdas: [
    { runs: [], xml: par(extra.palabra ? imagen("rIdLogo", 1, 15 * 540 / 160, 15, "Bavaria") : run({ t: "Bavaria", b: true, tam: 18, color: "FF000F" })) },
    { runs: [{ t: "CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", b: true, tam: 7.5, color: G }], al: "right" },
  ] }], { bordes: false }));
  cuerpo.push(par([{ t: "Informe pasivo", b: true, tam: 20, color: T }], { al: "right" }));
  cuerpo.push(par([{ t: `EER bloqueados al ${larga(d.dia)}`, tam: 10, color: G }], { al: "right", despues: 120 }));
  cuerpo.push(`<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="8" w:color="${T}"/></w:pBdr><w:spacing w:before="0" w:after="120"/></w:pPr></w:p>`);
  if (d.filtros) cuerpo.push(tabla([ANCHO_MM], [{ celdas: [{ izq: T, runs: [{ t: "FILTRADO   ", b: true, tam: 7.5, color: G }, { t: d.filtros, tam: 8.5, color: T }] }] }], { bordes: false }), par("", { despues: 100 }));

  /* ---------- LA BANDA DEL TOTAL ---------- */
  const vs = d.anterior ? `${d.total - d.anterior.total >= 0 ? "+" : "-"}${f0(Math.abs(d.total - d.anterior.total))} HL vs ${corta(d.anterior.fecha)}` : "primer día del mes";
  const gen = `generado el ${extra.generado.toLocaleDateString("es-CO")} ${extra.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
  cuerpo.push(tabla([ANCHO_MM * 0.5, ANCHO_MM * 0.5], [{ celdas: [
    { fondo: T, izq: A, runs: [{ t: f0(d.total), b: true, tam: 26, color: "FFFFFF" }, { t: "  HL de pasivos", tam: 10.5, color: TEN }] },
    { fondo: T, al: "right", runs: [], xml: par([{ t: plata(d.costo), b: true, tam: 13, color: "FFFFFF" }], { al: "right" }) + par([{ t: `costo pasivos · ${vs} · ${gen}`, tam: 8, color: TEN }], { al: "right" }) },
  ] }], { bordes: false }));
  cuerpo.push(par("", { despues: 160 }));

  /* ---------- CADA ALMACÉN ---------- */
  titulo("Cómo está cada almacén", "HL y costo del día");
  const na = Math.max(1, d.almacenes.length), GAP = 3, kw = (ANCHO_MM - GAP * (na - 1)) / na;
  const anchos: number[] = []; d.almacenes.forEach((_, i) => { if (i) anchos.push(GAP); anchos.push(kw) });
  const fa = (f: (a: typeof d.almacenes[number], i: number) => Texto[]) => ({ celdas: d.almacenes.flatMap((a, i) => {
    const c: Celda = { fondo: "F3F6F9", runs: f(a, i) }; return i ? [{ runs: [] } as Celda, c] : [c];
  }) });
  cuerpo.push(tabla(anchos, [
    fa((a, i) => [{ t: "■ ", color: (COLOR_ALMACEN[i] ?? "#8C8C8C").slice(1), tam: 8 }, { t: `${a.a} · ${a.nombre}`.toUpperCase(), b: true, tam: 7, color: G }]),
    fa((a) => [{ t: `${f0(a.total)} HL`, b: true, tam: 17, color: T }, { t: `   ${d.total ? Math.round(a.total / d.total * 100) : 0} %`, b: true, tam: 10, color: T }]),
    fa((a) => [{ t: d.estados.map((e) => `${e} ${f0(a.e[e] ?? 0)}`).join(" · "), tam: 7.5, color: G }]),
    fa((a) => [{ t: plata(a.costo), tam: 7.5, color: G }]),
  ], { bordes: false }));

  /* ---------- GRÁFICAS ---------- */
  titulo(`EER bloqueados por día (HL) · ${mesDe(d.dia)}`); leyenda();
  meterImagen(extra.graficas.dias, MEDIDA.dias.ancho, MEDIDA.dias.alto, "Por día");
  cuerpo.push(par([{ t: "Una columna por día con pasivos en el mes: cada color es un estado, adentro su HL y encima el total del día.", tam: 7, color: G }], { antes: 40 }));
  titulo(`HL diarios · ${mesDe(d.dia)}`, `el ${corta(d.dia)} resaltado`);
  meterImagen(extra.graficas.linea, MEDIDA.linea.ancho, MEDIDA.linea.alto, "HL diarios");

  titulo("% de bloqueados por almacén");
  const cA = 30, cT = 26, cE = (ANCHO_MM - MEDIDA.dona.ancho - 6 - cA - cT) / Math.max(1, d.estados.length);
  const tablaAlm = tabla([cA, ...d.estados.map(() => cE), cT], [
    cab([{ t: "ALMACÉN" }, ...d.estados.map((e) => ({ t: e, num: true })), { t: "TOTAL HL", num: true }]),
    ...d.almacenes.map((a, i) => ({ celdas: [
      { fondo: i % 2 ? RAYA : undefined, runs: [{ t: "■ ", color: (COLOR_ALMACEN[i] ?? "#8C8C8C").slice(1), tam: 8 }, { t: a.a, tam: 8.5, color: T }] },
      ...d.estados.map((e) => ({ fondo: i % 2 ? RAYA : undefined, al: "right" as const, runs: [{ t: f0(a.e[e] ?? 0), tam: 8.5, color: T }] })),
      { fondo: i % 2 ? RAYA : undefined, al: "right" as const, runs: [{ t: f0(a.total), b: true, tam: 8.5, color: T }] },
    ] })),
    tot(["TOTAL", ...d.estados.map((e) => f0(d.almacenes.reduce((t, a) => t + (a.e[e] ?? 0), 0))), f0(d.total)], [false, ...d.estados.map(() => true), true]),
  ]);
  let donaXml = par([{ t: "", tam: 8 }]);
  if (extra.graficas.dona) { const rid = "rIdDona"; imgs.push({ rid, archivo: "dona.png", src: extra.graficas.dona }); donaXml = par(imagen(rid, 5, MEDIDA.dona.ancho, MEDIDA.dona.alto, "Por almacén")) }
  cuerpo.push(tabla([MEDIDA.dona.ancho + 6, ANCHO_MM - MEDIDA.dona.ancho - 6], [{ celdas: [{ runs: [], xml: donaXml }, { runs: [], xml: tablaAlm + par("") }] }], { bordes: false }));

  const b = MEDIDA.barras(d.sku.length);
  titulo("SKU bloqueados (HL)"); leyenda(); meterImagen(extra.graficas.skuHl, b.ancho, b.alto, "SKU HL");
  titulo("SKU bloqueados ($ millones)"); leyenda(); meterImagen(extra.graficas.skuCosto, b.ancho, b.alto, "SKU $");

  /* ---------- CONSOLIDADO POR ALMACÉN (la TD) ---------- */
  /* Con UBICACIÓN (del conteo de ese día) si alguno la tiene, como en el PDF. */
  const conUbi = d.consolidado.some((x) => x.ubic);
  const anchosC = conUbi ? [17, 46, 21, 16, 16, 27, 39] : [20, 66, 26, 20, 20, 30];
  const nums = conUbi ? [false, false, true, true, true, true, false] : [false, false, true, true, true, true];
  for (const a of d.almacenes) {
    const rs = d.consolidado.filter((x) => x.almacen === a.a);
    if (!rs.length) continue;
    titulo(`${a.a} · ${a.nombre}`, `${f1(a.total)} HL · ${plata(a.costo)}`);
    cuerpo.push(tabla(anchosC, [
      cab([{ t: "CÓDIGO" }, { t: "MATERIAL" }, { t: "UNIDADES", num: true }, { t: "CAJAS", num: true }, { t: "HL", num: true }, { t: "COSTO", num: true }, ...(conUbi ? [{ t: "UBICACIÓN" }] : [])]),
      ...rs.map((x, i) => fila([x.codigo, x.desc, f0(x.und), f0(x.cajas), f1(x.hl), plata(x.costo), ...(conUbi ? [gruposDeUbicacion(x.ubic).join("  ·  ")] : [])], nums, i)),
      tot(["TOTAL", `${rs.length} materiales`, f0(rs.reduce((t, x) => t + x.und, 0)), f0(rs.reduce((t, x) => t + x.cajas, 0)), f1(rs.reduce((t, x) => t + x.hl, 0)), plata(rs.reduce((t, x) => t + x.costo, 0)), ...(conUbi ? [""] : [])], nums),
    ], { junta: rs.length <= 30 }));
  }
  if (d.cajas.length) {
    titulo("Cajas plásticas comprometidas");
    cuerpo.push(tabla([26, 116, 40], [
      cab([{ t: "CAJA" }, { t: "DESCRIPCIÓN" }, { t: "CAJAS", num: true }]),
      ...d.cajas.map((c, i) => fila([c.caja, c.nombre, f0(c.cajas)], [false, false, true], i)),
      tot(["TOTAL", "", f0(d.cajas.reduce((t, c) => t + c.cajas, 0))], [false, false, true]),
    ], { junta: true }));
  }

  /* ---------- EL PAQUETE ---------- */
  const pieTxt = `Informe pasivo · ${corta(d.dia)}${d.filtros ? ` · ${d.filtros}` : ""}`;
  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`;
  const campo = (c: string) => `<w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:instrText xml:space="preserve"> ${c} </w:instrText></w:r><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="${G}"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>` +
    `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:color="${A}" w:space="4"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${PAPEL.w - 2 * PAPEL.m}"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>` +
    run({ t: pieTxt, tam: 7.5, color: G }) + `<w:r><w:tab/></w:r>` + run({ t: "Bavaria · Página ", tam: 7.5, color: G }) + campo("PAGE") + run({ t: " de ", tam: 7.5, color: G }) + campo("NUMPAGES") + `</w:p></w:ftr>`;
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
  for (const im of imgs) { archivos[`word/media/${im.archivo}`] = dataUrlBytes(im.src); rels.push(`<Relationship Id="${im.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${im.archivo}"/>`) }

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
      `<dc:title>Informe pasivo · ${esc(d.dia)}</dc:title><dc:creator>CONTROL · CD38</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${extra.generado.toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`),
    "word/document.xml": strToU8(documento),
    "word/styles.xml": strToU8(estilos),
    "word/footer1.xml": strToU8(footer),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`),
    ...archivos,
  });
}
