/**
 * EXCEL DE LA BD DEL FISCAL: lo que se ve en la pestaña BD, en un archivo.
 *   Comparativo   una fila por módulo y código: lo del operador, lo de Bavaria, la diferencia y el estado.
 *   Renglones     lo que anotó cada persona, renglón por renglón: quién, hora real, estibas, saldo, cajas, avería, foto.
 * Una hoja por hoja del inventario en el Comparativo (columna «Hoja»), así se filtra y se analiza en Excel.
 */
import ExcelJS from "exceljs";
import { textoVenc } from "./fiscal-cruce";
import { TEXTO_MOD, type Modulo, type RenglonBd } from "./bd-fiscal";

export type HojaExcelBd = { numero: number; calle: string; ol: string; bavaria: string; modulos: Modulo[]; renglones: RenglonBd[] };

const ROJO = "FFB71C1C", TINTA = "FF1A1A1A", BLANCO = "FFFFFFFF", VERDE = "FFE3F3E8", ROSA = "FFFBE4E4", AMBAR = "FFFFF1D6";

function cabecera(ws: ExcelJS.Worksheet, cols: { h: string; w: number; num?: boolean }[]) {
  ws.columns = cols.map((c) => ({ header: c.h, width: c.w, style: c.num ? { numFmt: "#,##0" } : {} }));
  const r = ws.getRow(1);
  r.height = 24;
  r.eachCell((c) => {
    c.font = { bold: true, color: { argb: BLANCO } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA } };
    c.alignment = { vertical: "middle", horizontal: "left" };
    c.border = { bottom: { style: "medium", color: { argb: ROJO } } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}
const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

export async function armarBdExcel(o: { nombre: string; fecha: string; quien?: string; hojas: HojaExcelBd[] }): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Inventario fiscal"; wb.created = new Date();

  const rs = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: ROJO } } });
  const cp = wb.addWorksheet("Comparativo", { properties: { tabColor: { argb: ROJO } } });
  cabecera(cp, [
    { h: "Hoja", w: 7 }, { h: "Calle", w: 8 }, { h: "Módulo", w: 11 }, { h: "Código", w: 10 }, { h: "Material", w: 38 },
    { h: "Operador (cajas)", w: 16, num: true }, { h: "Bavaria (cajas)", w: 16, num: true }, { h: "Diferencia", w: 12, num: true },
    { h: "Estado del código", w: 18 }, { h: "Estado del módulo", w: 30 }, { h: "Quién cuenta operador", w: 22 }, { h: "Quién cuenta Bavaria", w: 22 },
  ]);
  for (const h of o.hojas) {
    for (const m of h.modulos) {
      for (const s of m.skus) {
        const estado = s.dif === 0 ? "Coincide" : s.compensado ? "Compensado" : s.solo === "OL" ? "Solo el operador" : s.solo === "BAVARIA" ? "Solo Bavaria" : "Difiere";
        const f = cp.addRow([h.numero, h.calle, m.clave, s.sku, s.material, s.sumOl, s.sumBav, s.dif, estado, TEXTO_MOD[m.estado], h.ol, h.bavaria]);
        const color = s.dif === 0 ? VERDE : s.compensado ? VERDE : ROSA;
        f.getCell(8).fill = relleno(color); f.getCell(9).fill = relleno(color);
        if (m.estado === "respondida" || m.estado === "validando") f.getCell(10).fill = relleno(AMBAR);
        if (m.estado === "aprobado") f.getCell(10).fill = relleno(VERDE);
      }
    }
  }

  const rg = wb.addWorksheet("Renglones", { properties: { tabColor: { argb: TINTA } } });
  cabecera(rg, [
    { h: "Hoja", w: 7 }, { h: "Módulo", w: 11 }, { h: "Ubicación", w: 12 }, { h: "Equipo", w: 12 }, { h: "Persona", w: 22 }, { h: "Hora", w: 18 },
    { h: "Código", w: 10 }, { h: "Material", w: 38 }, { h: "Vence", w: 14 }, { h: "Estibas", w: 9, num: true }, { h: "Saldo", w: 9, num: true },
    { h: "Cajas sueltas", w: 13, num: true }, { h: "Total cajas", w: 12, num: true }, { h: "Avería", w: 8 }, { h: "PNC", w: 7 }, { h: "Estado envase", w: 14 },
    { h: "Nota", w: 30 }, { h: "Con foto", w: 9 }, { h: "Ya en La base", w: 12 },
  ]);
  for (const h of o.hojas) {
    for (const r of h.renglones) {
      const hora = r.contadoEn ? new Date(r.contadoEn) : null;
      const fila = rg.addRow([
        h.numero, r.modulo, r.ubicacion, r.equipo === "OL" ? "Operador" : "Bavaria", r.persona, hora, r.sku, r.material,
        textoVenc(r.vencDia, r.vencMes, r.vencAnio), r.estibas, r.saldo, r.cajas, r.total, r.averia ? "Sí" : "", r.pnc ? "Sí" : "",
        r.estadoEnvase ?? "", r.nota ?? "", r.ruta ? "Sí" : "", r.enBase ? "Sí" : "",
      ]);
      fila.getCell(6).numFmt = "dd/mm/yyyy hh:mm";
      if (r.averia) fila.getCell(14).fill = relleno(AMBAR);
    }
  }

  rs.getColumn(1).width = 34; rs.getColumn(2).width = 16; rs.getColumn(3).width = 16; rs.getColumn(4).width = 16; rs.getColumn(5).width = 16; rs.getColumn(6).width = 16;
  rs.getCell("A1").value = o.nombre; rs.getCell("A1").font = { bold: true, size: 16 };
  rs.getCell("A2").value = `Inventario del ${o.fecha.split("-").reverse().join("/")} · BD del fiscal${o.quien ? ` · exportado por ${o.quien}` : ""}`;
  rs.getCell("A2").font = { color: { argb: "FF666666" } };
  const enc = rs.getRow(4);
  ["Hoja · pareja", "Módulos", "Coinciden", "Difieren", "Compensados", "Aprobados"].forEach((t, i) => {
    const c = enc.getCell(i + 1); c.value = t; c.font = { bold: true, color: { argb: BLANCO } }; c.fill = relleno(TINTA);
  });
  let fila = 5;
  for (const h of o.hojas) {
    const c = (e: string) => h.modulos.filter((m) => m.estado === e).length;
    rs.getRow(fila++).values = [`Hoja ${h.numero} · ${h.ol || "—"} / ${h.bavaria || "—"}`, h.modulos.length, c("coincide"), c("difiere") + c("validando") + c("respondida"), c("compensado"), c("aprobado")];
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
