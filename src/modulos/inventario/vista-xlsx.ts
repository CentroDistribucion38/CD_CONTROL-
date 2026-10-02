/**
 * «BAJAR ESTA VISTA» EN EXCEL DE VERDAD (.xlsx).
 *
 * Antes se bajaba un CSV, y Excel en español lo abría con las tildes rotas («MÃ³dulo»): con la línea
 * `sep=;` al principio, Excel se salta el BOM y lee el archivo como ANSI. Un .xlsx no tiene ese problema,
 * y de paso sale con el mismo aspecto del consolidado: banda del tema, título, encabezado de tinta con letra
 * blanca, rayado suave, filtro, fila de títulos congelada y totales que siguen al filtro.
 *
 * Se arma en el navegador con lo que ya está en pantalla (nada vuelve al servidor), y `exceljs` se carga
 * solo al tocar el botón: no pesa en la página.
 */
export type ColumnaVista = { t: string; num: boolean; /** La última fila la suma (cajas, estibas…); un factor o una capacidad no se suman. */ suma?: boolean };
export type EntradaVista = {
  titulo: string;
  sub: string;
  hoja: string;
  columnas: ColumnaVista[];
  /** Una fila por renglón, en el orden de `columnas`. Las cifras llegan como texto y se escriben como número. */
  filas: string[][];
  /** Colores del tema de quien baja (RRGGBB). */
  tinta: string;
  banda: string;
};

const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const aHex = (c: number[]) => "FF" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const aclarar = (h: string, t: number) => aHex(hex(h).map((c) => 255 - (255 - c) * t));
const col = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };
const esColor = (x: string) => /^[0-9a-f]{6}$/i.test(x);

export async function armarVistaXlsx(e: EntradaVista): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const t = esColor(e.tinta) ? e.tinta : "12263A", b = esColor(e.banda) ? e.banda : "FFC000";
  const TINTA = aHex(hex(t)), BANDA = aHex(hex(b)), GRIS = aclarar(t, 0.64), LINEA = aclarar(t, 0.12), FONDO = aclarar(t, 0.045);
  const BLANCO = "FFFFFFFF";
  const relleno = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
  const letra = (size: number, color: string, bold = false) => ({ name: "Calibri", size, bold, color: { argb: color } });

  const wb = new ExcelJS.Workbook();
  const h = wb.addWorksheet(e.hoja.slice(0, 31), { properties: { tabColor: { argb: TINTA } } });
  const n = e.columnas.length;
  const nums = e.columnas.map((c, i) => (c.suma ? i + 1 : 0)).filter(Boolean);

  /* Ancho de cada columna según lo que lleva (con tope), para que no salga todo apretado ni kilométrico. */
  h.columns = e.columnas.map((c, i) => {
    const mayor = e.filas.reduce((m, f) => Math.max(m, (f[i] ?? "").length), c.t.length);
    return { width: Math.max(8, Math.min(40, mayor + 3)) };
  });

  h.views = [{ state: "frozen", xSplit: 0, ySplit: 6, showGridLines: false }];
  h.getRow(1).height = 6;
  for (let c = 1; c <= n; c++) h.getRow(1).getCell(c).fill = relleno(BANDA);
  h.getRow(2).height = 8; h.getRow(3).height = 26; h.getRow(4).height = 16; h.getRow(5).height = 8;
  const ti = h.getCell(3, 1); ti.value = e.titulo; ti.font = letra(16, TINTA, true); ti.alignment = { vertical: "middle" };
  const su = h.getCell(4, 1); su.value = e.sub; su.font = letra(9.5, GRIS);

  const r6 = h.getRow(6); r6.height = 26;
  e.columnas.forEach((c, i) => {
    const x = r6.getCell(i + 1); x.value = c.t;
    x.font = letra(9, BLANCO, true); x.fill = relleno(TINTA);
    x.alignment = { vertical: "middle", horizontal: c.num ? "right" : "left", wrapText: true, indent: 1 };
  });

  const esNumero = (s: string) => s !== "" && /^-?\d+(\.\d+)?$/.test(s);
  const esDia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const suma = new Map<number, number>();
  e.filas.forEach((f, k) => {
    const r = h.getRow(7 + k); r.height = 18;
    e.columnas.forEach((c, i) => {
      const v = f[i] ?? "";
      const cel = r.getCell(i + 1);
      if (c.num && esNumero(v)) { cel.value = Number(v); cel.numFmt = "#,##0"; suma.set(i + 1, (suma.get(i + 1) ?? 0) + Number(v)); }
      else if (esDia(v)) { cel.value = new Date(v + "T12:00:00Z"); cel.numFmt = "dd/mm/yyyy"; }
      else cel.value = v;
      cel.font = letra(9.5, TINTA); cel.border = { bottom: { style: "thin", color: { argb: LINEA } } };
      cel.alignment = { vertical: "middle", horizontal: c.num ? "right" : "left", indent: 1 };
      if (k % 2 === 1) cel.fill = relleno(FONDO);
    });
  });

  const fin = 6 + Math.max(e.filas.length, 1);
  if (nums.length && e.filas.length) {
    const r = h.getRow(fin + 1); r.height = 22;
    for (let c = 1; c <= n; c++) {
      const cel = r.getCell(c); cel.fill = relleno(FONDO); cel.font = letra(9.5, TINTA, true);
      cel.border = { top: { style: "medium", color: { argb: TINTA } } }; cel.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "right", indent: 1 };
    }
    r.getCell(1).value = "TOTAL (lo filtrado)";
    for (const c of nums) {
      /* SUBTOTAL(109): sigue al filtro de Excel; el resultado va calculado para que se vea aunque no se recalcule. */
      r.getCell(c).value = { formula: `SUBTOTAL(109,${col(c)}7:${col(c)}${fin})`, result: suma.get(c) ?? 0 };
      r.getCell(c).numFmt = "#,##0";
    }
  }
  h.autoFilter = `A6:${col(n)}${fin}`;
  h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
