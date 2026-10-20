/**
 * EL EXCEL DE LO PENDIENTE POR DARLE DE BAJA — con las columnas de la hoja «Conteos» del CONSOLIDADO_BAJA.
 *
 * «De acuerdo a mi balance necesito exportar lo que está pendiente por darle de baja, en la plantilla
 *  de conteo, a nivel zona.»
 *
 * De dónde sale: de las dos hojas de BAJA del Balance, tal cual se ven en pantalla.
 *   Baja · Fábrica         (SORTING,    AG18)
 *   Baja · Bodega 38       (PRESORTING, AG22)
 * Una sola línea por material y zona, con la cantidad completa (no se parte en dos).
 * Pendiente = Dif cajas × factor caja, SOLO si es positivo (físico mayor que el casco). Lo que sobra en el
 * casco y lo que no tiene factor no se da de baja aquí: sale en «Revisión por zona».
 *
 * ANDINA / HEINEKEN: no tienen factor, así que NUNCA salen como código. Se abren en los SKU de donde provienen
 * (lo reasignado en el Balance): cada SKU con sus unidades (cajas × su propio factor), como línea de ANDINA o de
 * HEINEKEN. Es lo pendiente: el físico del dueño menos su casco (Dif en estibas), repartido entre sus SKU en
 * proporción a lo que cada uno aportó. Los envases nuevos y la estiba de madera no van (como en Pasivos).
 *
 * ROTURA DE LÍNEA: se agrega lo que se subió al pasivo de ese mismo día (causal ROTURA DE LINEA): impacto SUPPLY,
 * movimiento 951, una línea por cada fila del pasivo, en el almacén en que se subió.
 *
 * Hoja 1 «Conteos»: A–S con los mismos encabezados de la plantilla, lista para copiar y pegar. Costo Lote COP
 * y BAJA HL (I y J) quedan vacías: en la plantilla ya traen su fórmula. DOCUMENTO y RESPONSABLE los llena quien
 * hace la baja en SAP. Hoja 2 «Revisión por zona»: la cuenta material por material.
 * Se arma en el navegador (exceljs se carga al pedirlo).
 */
import ExcelJS from "exceljs";
import { pendientePorSku, esDueno } from "@/modulos/inventario/duenos";
import { esExcluido } from "@/modulos/pasivos/excluidos";

export type FilaBajaPend = {
  estado: string; alcance: string; codigo: string; material: string | null;
  cajas_estiba: number | null; un_caja: number | null;
  fisico_cajas: number; cajas_casco: number; dif_cajas: number; unidades: number | null;
  /** Solo ANDINA / HEINEKEN: sus estibas físicas, su diferencia en estibas y los SKU de donde provienen. */
  fisico_estibas?: number | null; dif_estibas?: number | null;
  provenientes?: { codigo: string; material: string | null; ubicacion: string; cajas: number; cajas_estiba: number | null; estibas: number | null; un_caja: number | null; unidades: number | null }[];
};

/** Una fila del pasivo del día con causal ROTURA DE LINEA (más los factores del maestro de pasivos). */
export type FilaRoturaLinea = {
  codigo: string; descripcion: string; unidades: number; almacen: string;
  unidades_por_caja: number | null; cajas_por_estiba: number | null;
};
/** El COBAAG de cada envase en la rotura de línea, como en tus últimas bajas (13 de octubre; el 250 cc, del 22 de septiembre). Lo que no está, se deja vacío. */
const COBAAG_ROTURA: Record<string, string> = {
  "3500005": "COBAAG3162", "3500162": "COBAAG3163", "3501430": "COBAAG3163", "3500887": "COBAAG3174", "3500888": "COBAAG3174",
  "3501225": "COBAAG3165", "3501226": "COBAAG3165",
};

/** Cómo se parte la baja de cada zona (lo que se viene haciendo en la plantilla). */
const ZONAS = [
  { estado: "BAJA", alcance: "SORTING", desc: "SORTING", nombre: "Fábrica", alm: "AG18", tipo: "BAJA SORTING", mov: "945 (85%) / 925 (15%)" },
  { estado: "BAJA", alcance: "PRESORTING", desc: "PRESORTING", nombre: "Bodega 38", alm: "AG22", tipo: "BAJA PRESORTING", mov: "945" },
] as const;
const CENTRO = "COBAAG2070", IMPACTO = "SCOH";

const TINTA = "FF111111", BANDA = "FFFFC20E", BLANCO = "FFFFFFFF", GRIS = "FF6B6B6B", FONDO = "FFF6F6F4", RAYA = "FFE3E3E0";
const VERDE = "FF0F7A4A", ROJO = "FFB42318";
const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (size: number, color: string, bold = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold, color: { argb: color } });
const NUM = '#,##0;[Red]-#,##0;"0"';

type Linea = { zona: (typeof ZONAS)[number]; f: FilaBajaPend; un: number; dueno?: string; /** Unidades que aporta ANDINA / HEINEKEN a esta línea (solo para la hoja de revisión; en Conteos no se nota). */ deDueno?: { dueno: string; un: number }[] };
type Descartada = { zona: (typeof ZONAS)[number]; f: FilaBajaPend; motivo: string; dueno?: string };

export function separarPendiente(filas: FilaBajaPend[]): { lineas: Linea[]; descartadas: Descartada[] } {
  const lineas: Linea[] = [], descartadas: Descartada[] = [];
  for (const zona of ZONAS) {
    const delaZona = filas.filter((f) => f.estado === zona.estado && f.alcance === zona.alcance && f.fisico_cajas !== 0)
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
    for (const f of delaZona) {
      if (esDueno(f.codigo)) {
        /* Se abre en los SKU de donde provienen: la diferencia en estibas del dueño (contado − casco) llevada a cada SKU con su factor.
           Es la misma cuenta que usa «Traer del balance» de Pasivos (pendientePorSku). */
        const dueno = f.codigo.trim().toUpperCase();
        if (!(f.provenientes ?? []).length) { descartadas.push({ zona, f, dueno, motivo: `${dueno}: no hay SKU de origen (nada se reasignó a ${dueno} en el Balance)` }); continue }
        const sku = pendientePorSku(f).filter((x) => x.cajas && !esExcluido(x.codigo, x.material));
        if (!sku.some((x) => x.cajas_pend > 0)) { descartadas.push({ zona, f, dueno, motivo: `${dueno}: lo contado no pasa del casco, no hay nada pendiente` }); continue }
        for (const x of sku) {
          if (!x.un_caja || x.unidades == null) { descartadas.push({ zona, f: { ...f, codigo: x.codigo, material: x.material }, dueno, motivo: `Viene de ${dueno}, pero falta el factor caja de este SKU en el maestro` }); continue }
          if (x.cajas_pend <= 0) continue;
          lineas.push({ zona, dueno, deDueno: [{ dueno, un: x.unidades }], un: x.unidades, f: { estado: f.estado, alcance: f.alcance, codigo: x.codigo, material: x.material, cajas_estiba: x.cajas_estiba, un_caja: x.un_caja,
            fisico_cajas: x.cajas, cajas_casco: x.cajas - x.cajas_pend, dif_cajas: x.cajas_pend, unidades: x.unidades } });
        }
        continue;
      }
      if (!f.un_caja) { descartadas.push({ zona, f, motivo: "Falta el factor caja en el maestro" }); continue }
      if (f.dif_cajas <= 0) { descartadas.push({ zona, f, motivo: f.dif_cajas < 0 ? "Sobra en casco: no hay nada pendiente" : "Cuadra: no hay nada pendiente" }); continue }
      lineas.push({ zona, f, un: Math.round(f.dif_cajas * f.un_caja) });
    }
  }
  return { lineas, descartadas };
}

const ENCABEZADOS = ["Planta/CD", "Tipo de baja ", "Motivo ", "Descripcion de la baja", "Código / SKU", "Descipcion Material", "Total Unidades",
  "Fecha Solicitud ", "Costo Lote COP", "BAJA HL", "RESPONSABLE", "Impacto ", "DOCUMENTO", "Movimiento", "semana", "sorting", "tipo", "estibas", "almacen"];
const ANCHOS = [13, 11, 10, 20, 12, 32, 14, 14, 14, 11, 16, 11, 14, 16, 24, 11, 18, 10, 10];

export async function armarLibroBajaPendiente(d: { fecha: string; filas: FilaBajaPend[]; roturaLinea?: FilaRoturaLinea[] }): Promise<ArrayBuffer> {
  const rotura = (d.roturaLinea ?? []).filter((x) => x.unidades > 0).sort((a, b) => a.almacen.localeCompare(b.almacen) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  const roturaNeg = (d.roturaLinea ?? []).filter((x) => x.unidades <= 0);
  const { lineas, descartadas } = separarPendiente(d.filas);
  const [y, m, dd] = d.fecha.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, dd));

  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Balance"; wb.created = new Date();

  /* ---------- 1 · CONTEOS: la plantilla ---------- */
  const h = wb.addWorksheet("Conteos", { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = ANCHOS.map((w) => ({ width: w }));
  const cab = h.getRow(1); cab.height = 24;
  ENCABEZADOS.forEach((t, i) => {
    const c = cab.getCell(i + 1); c.value = t; c.font = letra(10, BLANCO, true); c.fill = relleno(TINTA);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  let n = 2;
  for (const z of ZONAS) {
    for (const l of lineas.filter((x) => x.zona.tipo === z.tipo)) {
      const est = l.f.cajas_estiba && l.f.un_caja ? Math.round((l.un / l.f.un_caja / l.f.cajas_estiba) * 100) / 100 : "";
      const r = h.getRow(n++);
      r.values = ["Barranquilla", "EER", "ROTURA", z.desc, l.f.codigo, l.f.material ?? "", l.un, fecha, null, null, "", IMPACTO, "", CENTRO,
        z.mov, "", z.tipo, est, z.alm];
      r.getCell(7).numFmt = "#,##0"; r.getCell(8).numFmt = "yyyy-mm-dd"; r.getCell(18).numFmt = "0.00";
      r.eachCell((c) => { c.font = letra(10, TINTA); c.border = { bottom: { style: "thin", color: { argb: RAYA } } } });
    }
  }
  /* ROTURA DE LÍNEA: lo del pasivo del día, una línea por fila, impacto SUPPLY y movimiento 951. */
  for (const x of rotura) {
    const est = x.unidades_por_caja && x.cajas_por_estiba ? Math.round((x.unidades / x.unidades_por_caja / x.cajas_por_estiba) * 100) / 100 : "";
    const r = h.getRow(n++);
    r.values = ["Barranquilla", "EER", "ROTURA", "ROTURA DE LINEA", x.codigo, x.descripcion, x.unidades, fecha, null, null, "", "SUPPLY", "",
      COBAAG_ROTURA[x.codigo] ?? "", "951", "", "BAJA ROTURA DE MAQUINA", est, x.almacen];
    r.getCell(7).numFmt = "#,##0"; r.getCell(8).numFmt = "yyyy-mm-dd"; r.getCell(18).numFmt = "0.00";
    r.eachCell((c) => { c.font = letra(10, TINTA); c.border = { bottom: { style: "thin", color: { argb: RAYA } } } });
  }
  const finDatos = n - 1;
  const t = h.getRow(n + 1);
  t.getCell(6).value = "Total unidades"; t.getCell(6).font = letra(10, TINTA, true);
  t.getCell(7).value = finDatos >= 2 ? { formula: `SUBTOTAL(9,G2:G${finDatos})`, result: lineas.reduce((s, l) => s + l.un, 0) + rotura.reduce((s, x) => s + x.unidades, 0) } : 0;
  t.getCell(7).numFmt = "#,##0"; t.getCell(7).font = letra(10, TINTA, true); t.getCell(7).fill = relleno(BANDA);
  h.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, finDatos), column: ENCABEZADOS.length } };

  /* ---------- 2 · REVISIÓN POR ZONA ---------- */
  const r2 = wb.addWorksheet("Revisión por zona", { views: [{ showGridLines: false }] });
  const cols = [["Zona", 12], ["Almacén", 10], ["Código", 12], ["Material", 34], ["Físico (cajas)", 14], ["Cajas casco", 13], ["Dif cajas", 12],
    ["Factor caja", 11], ["Pendiente (unidades)", 17], ["Movimiento", 24], ["Estado", 44]] as const;
  r2.columns = cols.map(([, w]) => ({ width: w }));
  const t1 = r2.getCell(1, 1); t1.value = `PENDIENTE POR DARLE DE BAJA · conteo del ${d.fecha}`; t1.font = letra(14, TINTA, true);
  const t2 = r2.getCell(2, 1);
  t2.value = "Lo que muestra el Balance en Baja · Fábrica y Baja · Bodega 38: Dif cajas × factor caja, solo si el físico supera al casco. Lo de ANDINA y HEINEKEN se abre en los SKU de donde provienen en líneas aparte, con la descripción de la zona (en Conteos no se nombra).";
  t2.font = letra(9.5, GRIS);
  const hd = r2.getRow(4); hd.height = 26;
  cols.forEach(([tt], i) => {
    const c = hd.getCell(i + 1); c.value = tt; c.font = letra(9.5, BLANCO, true); c.fill = relleno(TINTA);
    c.alignment = { vertical: "middle", horizontal: i >= 4 && i <= 8 ? "center" : "left", wrapText: true, indent: i < 4 || i > 8 ? 1 : 0 };
  });
  let k = 5;
  for (const z of ZONAS) {
    const filas = [
      ...lineas.filter((l) => l.zona.tipo === z.tipo).map((l) => ({ f: l.f, un: l.un as number | null, motivo: "", dueno: l.deDueno?.map((d) => `${d.dueno} ${d.un.toLocaleString("es-CO")} u`).join(" + ") })),
      ...descartadas.filter((x) => x.zona.tipo === z.tipo).map((x) => ({ f: x.f, un: null as number | null, motivo: x.motivo, dueno: x.dueno })),
    ].sort((a, b) => a.f.codigo.localeCompare(b.f.codigo, "es", { numeric: true }));
    const ini = k;
    for (const x of filas) {
      const r = r2.getRow(k++);
      const reparto = x.un == null ? "—" : z.mov;
      r.values = [z.nombre, z.alm, x.f.codigo, x.f.material ?? "", x.f.fisico_cajas, x.f.cajas_casco, x.f.dif_cajas, x.f.un_caja ?? "—", x.un ?? "—", reparto,
        x.un == null ? x.motivo : x.dueno ? `A dar de baja · viene de ${x.dueno}` : "A dar de baja"];
      r.eachCell((c, i) => {
        c.font = letra(10, TINTA); c.border = { bottom: { style: "thin", color: { argb: RAYA } } };
        if (i >= 5 && i <= 9) { c.numFmt = NUM; c.alignment = { horizontal: "right" } }
      });
      const e = r.getCell(11); e.font = letra(9.5, x.un == null ? ROJO : VERDE, true);
      if (x.un == null) r.eachCell((c) => { c.fill = relleno(FONDO) });
    }
    const tot = r2.getRow(k++);
    tot.getCell(1).value = `Total ${z.nombre} · ${z.alm}`;
    const pend = lineas.filter((l) => l.zona.tipo === z.tipo).reduce((s, l) => s + l.un, 0);
    if (k - 1 > ini) tot.getCell(9).value = { formula: `SUM(I${ini}:I${k - 2})`, result: pend };
    for (let c = 1; c <= cols.length; c++) {
      const x = tot.getCell(c); x.fill = relleno(BANDA); x.font = letra(10, TINTA, true);
      x.border = { top: { style: "medium", color: { argb: TINTA } } };
    }
    tot.getCell(9).numFmt = NUM; tot.getCell(9).alignment = { horizontal: "right" };
    k++;
  }

  /* ---------- 3 · ROTURA DE LÍNEA ---------- */
  const r3 = wb.addWorksheet("Rotura de línea", { views: [{ showGridLines: false }] });
  const c3 = [["Almacén", 10], ["Código", 12], ["Material", 34], ["Unidades", 13], ["COBAAG", 14], ["Estado", 52]] as const;
  r3.columns = c3.map(([, w]) => ({ width: w }));
  const a1 = r3.getCell(1, 1); a1.value = `ROTURA DE LÍNEA · pasivo del ${d.fecha}`; a1.font = letra(14, TINTA, true);
  const a2 = r3.getCell(2, 1); a2.value = "Lo que se subió al pasivo de ese día con causal ROTURA DE LINEA. Va a Conteos con impacto SUPPLY y movimiento 951."; a2.font = letra(9.5, GRIS);
  const h3 = r3.getRow(4); h3.height = 24;
  c3.forEach(([tt], i) => { const c = h3.getCell(i + 1); c.value = tt; c.font = letra(9.5, BLANCO, true); c.fill = relleno(TINTA); c.alignment = { vertical: "middle", horizontal: i === 3 ? "center" : "left", indent: i === 3 ? 0 : 1 } });
  let q = 5;
  if (!rotura.length && !roturaNeg.length) {
    r3.getCell(q, 1).value = `No hay rotura de línea en el pasivo del ${d.fecha}. Súbela en Pasivos (archivo plano) y vuelve a exportar.`;
    r3.getCell(q, 1).font = letra(10, ROJO, true); q++;
  }
  for (const x of [...rotura, ...roturaNeg]) {
    const r = r3.getRow(q++);
    const aviso = x.unidades <= 0 ? "Cantidad en cero o negativa: no entra en Conteos" : !COBAAG_ROTURA[x.codigo] ? "Entra en Conteos, pero este envase no tiene COBAAG: complétalo" : "Entra en Conteos";
    r.values = [x.almacen, x.codigo, x.descripcion, x.unidades, COBAAG_ROTURA[x.codigo] ?? "—", aviso];
    r.eachCell((c) => { c.font = letra(10, TINTA); c.border = { bottom: { style: "thin", color: { argb: RAYA } } } });
    r.getCell(4).numFmt = NUM; r.getCell(4).alignment = { horizontal: "right" };
    r.getCell(6).font = letra(9.5, x.unidades > 0 && COBAAG_ROTURA[x.codigo] ? VERDE : ROJO, true);
  }
  if (rotura.length) {
    const t = r3.getRow(q);
    for (let c = 1; c <= c3.length; c++) { const x = t.getCell(c); x.fill = relleno(BANDA); x.font = letra(10, TINTA, true); x.border = { top: { style: "medium", color: { argb: TINTA } } } }
    t.getCell(1).value = "Total rotura de línea";
    t.getCell(4).value = { formula: `SUMIF(D5:D${q - 1},">0")`, result: rotura.reduce((s, x) => s + x.unidades, 0) }; t.getCell(4).numFmt = NUM; t.getCell(4).alignment = { horizontal: "right" };
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
