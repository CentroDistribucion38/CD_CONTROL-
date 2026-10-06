/**
 * EL EXCEL DEL PLAN DE ENVASE — la semana en estibas.
 *
 *   Estibas por día   una fila por SKU, siete días y el total (con fórmulas de suma)
 *   Por línea         lo mismo por tren
 *   Bloques           cada bloque de la grilla: día, turno, hora, HL, unidades, cajas, estibas
 *   Cuadre            unidades → cajas → estibas de cada SKU, con el factor usado
 *
 * Se arma en el navegador con lo que la pantalla tiene a la vista: no lee la base.
 */
import ExcelJS from "exceljs";
import { BLANCO, cabecera, letra, paleta, relleno } from "@/modulos/admin/libro-accesos";
import { estibasDe, type SemanaPlan, type Vista } from "./plan-envase";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corto = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)} ${MES[Number(m) - 1]}` };
const col = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };

export async function armarPlanEnvase(o: {
  semana: Pick<SemanaPlan, "anio" | "semana" | "fecha_ini" | "fecha_fin" | "escenario" | "generado" | "pendientes" | "bloques">;
  vista: Vista; borrador: boolean; archivo: string | null;
}): Promise<ArrayBuffer> {
  const P = paleta();
  const { semana: s, vista: v } = o;
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Plan de envase"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const sub = `Semana ${s.semana} · ${corto(s.fecha_ini)} – ${corto(s.fecha_fin)} ${s.anio}${s.escenario ? " · " + s.escenario : ""}${o.archivo ? " · " + o.archivo : ""}${o.borrador ? " · SIN GUARDAR" : ""}`;

  const enc = (h: ExcelJS.Worksheet, fila: number, cols: string[], desde = 2) => {
    h.getRow(fila).height = 24;
    cols.forEach((t, i) => { const c = h.getCell(fila, desde + i); c.value = t; c.font = letra(9.5, BLANCO, true); c.fill = relleno(P.TINTA); c.alignment = { vertical: "middle", horizontal: i < 2 ? "left" : "right", indent: 1, wrapText: true } });
  };
  const num = (c: ExcelJS.Cell, fmt = "#,##0", bold = false) => { c.numFmt = fmt; c.font = letra(10, P.TINTA, bold); c.alignment = { horizontal: "right", indent: 1 }; c.border = { bottom: { style: "thin", color: { argb: P.LINEA } } } };
  const tx = (c: ExcelJS.Cell, bold = false) => { c.font = letra(10, P.TINTA, bold); c.alignment = { vertical: "middle", indent: 1 }; c.border = { bottom: { style: "thin", color: { argb: P.LINEA } } } };

  /* ───── Estibas por día ───── */
  const H = wb.addWorksheet("Estibas por día", { properties: { tabColor: { argb: P.BANDA } } });
  cabecera(H, P, null, "Plan de envase · estibas por día", sub, 12);
  H.getColumn(1).width = 2; H.getColumn(2).width = 9; H.getColumn(3).width = 38; H.getColumn(4).width = 9; H.getColumn(5).width = 11;
  for (let i = 0; i < 7; i++) H.getColumn(6 + i).width = 10;
  H.getColumn(13).width = 12;
  enc(H, 7, ["Línea", "SKU", "SAP", "Caj/est", ...v.dias.map((d, i) => `${DIAS[i]} ${corto(d)}`), "Total"]);
  let r = 8;
  const ini = r;
  v.skus.forEach((f, i) => {
    const nuevo = i === 0 || v.skus[i - 1].tren !== f.tren;
    tx(H.getCell(r, 2), true); H.getCell(r, 2).value = nuevo ? f.tren : "";
    tx(H.getCell(r, 3)); H.getCell(r, 3).value = f.sku;
    tx(H.getCell(r, 4)); H.getCell(r, 4).value = f.sap;
    num(H.getCell(r, 5)); H.getCell(r, 5).value = f.cpe ?? "—";
    v.dias.forEach((d, k) => { const c = H.getCell(r, 6 + k); num(c, "#,##0;-#,##0;\"·\""); c.value = Math.round((f.porDia[d]?.total ?? 0) * 100) / 100 });
    const t = H.getCell(r, 13); num(t, "#,##0", true); t.value = { formula: `SUM(F${r}:L${r})`, result: v.dias.reduce((a, d) => a + (f.porDia[d]?.total ?? 0), 0) };
    r++;
  });
  const fin = r - 1;
  tx(H.getCell(r, 2), true); H.getCell(r, 2).value = "Total de estibas";
  for (let k = 0; k < 7; k++) { const c = H.getCell(r, 6 + k); num(c, "#,##0", true); c.value = { formula: `SUM(${col(6 + k)}${ini}:${col(6 + k)}${fin})`, result: v.porDia[v.dias[k]] ?? 0 }; c.border = { top: { style: "medium", color: { argb: P.TINTA } } } }
  const tt = H.getCell(r, 13); num(tt, "#,##0", true); tt.value = { formula: `SUM(M${ini}:M${fin})`, result: v.total }; tt.border = { top: { style: "medium", color: { argb: P.TINTA } } };
  H.getRow(r + 2).getCell(2).value = "Estibas = unidades ÷ referencia ÷ cajas por estiba del Maestro. El día cuenta cuando se envasa (T1 0–8 h · T2 8–16 h · T3 16–24 h).";
  H.getRow(r + 2).getCell(2).font = letra(9, P.GRIS);
  H.views = [{ showGridLines: false, state: "frozen", xSplit: 4, ySplit: 7 }];

  /* ───── Por línea ───── */
  const L = wb.addWorksheet("Por línea", { properties: { tabColor: { argb: P.BANDA } } });
  cabecera(L, P, null, "Plan de envase · estibas por línea", sub, 10);
  L.getColumn(1).width = 2; L.getColumn(2).width = 12; for (let i = 0; i < 7; i++) L.getColumn(3 + i).width = 10; L.getColumn(10).width = 12;
  enc(L, 7, ["Línea", ...v.dias.map((d, i) => `${DIAS[i]} ${corto(d)}`), "Total"]);
  r = 8; const li = r;
  for (const t of v.trenes) {
    tx(L.getCell(r, 2), true); L.getCell(r, 2).value = t.tren;
    v.dias.forEach((d, k) => { const c = L.getCell(r, 3 + k); num(c, "#,##0;-#,##0;\"·\""); c.value = Math.round((t.porDia[d] ?? 0) * 100) / 100 });
    const c = L.getCell(r, 10); num(c, "#,##0", true); c.value = { formula: `SUM(C${r}:I${r})`, result: t.total };
    r++;
  }
  tx(L.getCell(r, 2), true); L.getCell(r, 2).value = "Total";
  for (let k = 0; k < 8; k++) { const c = L.getCell(r, 3 + k); num(c, "#,##0", true); c.value = { formula: `SUM(${col(3 + k)}${li}:${col(3 + k)}${r - 1})`, result: k < 7 ? v.porDia[v.dias[k]] ?? 0 : v.total }; c.border = { top: { style: "medium", color: { argb: P.TINTA } } } }
  L.views = [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 7 }];

  /* ───── Bloques ───── */
  const B = wb.addWorksheet("Bloques", { properties: { tabColor: { argb: P.BANDA } } });
  cabecera(B, P, null, "Plan de envase · bloques de la grilla", sub, 12);
  [2, 12, 10, 10, 38, 7, 7, 8, 12, 12, 12, 11].forEach((w, i) => { B.getColumn(i + 1).width = w });
  enc(B, 7, ["Fecha", "Línea", "SAP", "SKU", "Turno", "Desde (h)", "Horas", "HL", "Unidades", "Cajas", "Estibas"]);
  r = 8;
  const nombre = new Map(v.skus.map((f) => [f.tren + "|" + f.sap, f]));
  for (const b of o.semana.bloques) {
    const f = nombre.get(b.tren.toUpperCase() + "|" + b.sap);
    const cajas = f?.referencia ? b.unidades / f.referencia : null;
    const est = f ? estibasDe(b.unidades, f.referencia, f.cpe) : null;
    tx(B.getCell(r, 2)); B.getCell(r, 2).value = `${DIAS[Math.max(0, v.dias.indexOf(b.fecha))]} ${corto(b.fecha)}`;
    tx(B.getCell(r, 3), true); B.getCell(r, 3).value = b.tren;
    tx(B.getCell(r, 4)); B.getCell(r, 4).value = b.sap;
    tx(B.getCell(r, 5)); B.getCell(r, 5).value = f?.sku ?? b.sap;
    num(B.getCell(r, 6), "0"); B.getCell(r, 6).value = `T${b.turno}`;
    num(B.getCell(r, 7), "0"); B.getCell(r, 7).value = b.hora_ini;
    num(B.getCell(r, 8), "0"); B.getCell(r, 8).value = b.horas;
    num(B.getCell(r, 9)); B.getCell(r, 9).value = b.hl;
    num(B.getCell(r, 10)); B.getCell(r, 10).value = b.unidades;
    num(B.getCell(r, 11)); B.getCell(r, 11).value = cajas == null ? "—" : Math.round(cajas);
    num(B.getCell(r, 12), "#,##0.0"); B.getCell(r, 12).value = est == null ? "—" : est;
    r++;
  }
  B.views = [{ showGridLines: false, state: "frozen", ySplit: 7 }];

  /* ───── Cuadre ───── */
  const C = wb.addWorksheet("Cuadre", { properties: { tabColor: { argb: P.BANDA } } });
  cabecera(C, P, null, "Plan de envase · cuadre por SKU", sub, 10);
  [2, 10, 38, 9, 14, 11, 12, 10, 12].forEach((w, i) => { C.getColumn(i + 1).width = w });
  enc(C, 7, ["Línea", "SKU", "SAP", "Unidades", "Referencia", "Cajas", "Caj/est", "Estibas"]);
  r = 8;
  for (const f of v.skus) {
    tx(C.getCell(r, 2), true); C.getCell(r, 2).value = f.tren;
    tx(C.getCell(r, 3)); C.getCell(r, 3).value = f.sku;
    tx(C.getCell(r, 4)); C.getCell(r, 4).value = f.sap;
    num(C.getCell(r, 5)); C.getCell(r, 5).value = f.unidades;
    num(C.getCell(r, 6), "0"); C.getCell(r, 6).value = f.referencia ?? "—";
    num(C.getCell(r, 7)); C.getCell(r, 7).value = { formula: f.referencia ? `E${r}/F${r}` : "0", result: f.cajas ?? 0 };
    num(C.getCell(r, 8), "0"); C.getCell(r, 8).value = f.cpe ?? "—";
    num(C.getCell(r, 9), "#,##0.0", true); C.getCell(r, 9).value = f.cpe && f.referencia ? { formula: `G${r}/H${r}`, result: f.estibas ?? 0 } : "—";
    r++;
  }
  C.views = [{ showGridLines: false, state: "frozen", ySplit: 7 }];

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
