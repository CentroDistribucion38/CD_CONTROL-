// src/modulos/traspasos/libro.ts
import ExcelJS from "exceljs";
import { unzipSync, zipSync } from "fflate";

// src/modulos/traspasos/formato.ts
var TURNOS = ["C", "A", "B"];

// src/modulos/traspasos/libro.ts
var COLORES_MARCA = { tinta: "12263A", banda: "FFC000" };
var hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
var aHex = (c) => "FF" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
var aclarar = (h, t) => aHex(hex(h).map((c) => 255 - (255 - c) * t));
var oscurecer = (h, k) => aHex(hex(h).map((c) => c * k));
var BLANCO = "FFFFFFFF";
var ROJO = "FFC6202A";
var VERDE = "FF1F7A45";
var AMBAR = "FF8A6000";
var NUM = "#,##0;\\-#,##0;\\\u2013";
var PCT = "0%;\\-0%;\\\u2013";
function paleta(c) {
  const ok = (x) => /^[0-9a-f]{6}$/i.test(x);
  const t = ok(c.tinta) ? c.tinta : COLORES_MARCA.tinta;
  const b = ok(c.banda) ? c.banda : COLORES_MARCA.banda;
  return {
    TINTA: aHex(hex(t)),
    BANDA: aHex(hex(b)),
    GRIS: aclarar(t, 0.64),
    LINEA: aclarar(t, 0.12),
    FONDO: aclarar(t, 0.045),
    CAJA: aclarar(t, 0.035),
    PANEL: aclarar(t, 0.055),
    ENLACE: oscurecer(b, 0.54),
    /* El hueco de la barra: bastante más oscuro que el panel donde se
       pinta, o no se ve y la barra parece llena. */
    HUECO: aclarar(t, 0.26)
  };
}
var relleno = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
var letra = (size, color, bold = false, italic = false) => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
var col = (n) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
var vinculo = (hoja, texto) => ({ formula: `HYPERLINK("#'${hoja}'!A1","${texto.replace(/"/g, '""')}")`, result: texto });
var fechaLarga = (s) => (/* @__PURE__ */ new Date(s + "T12:00:00")).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
var aFecha = (s) => s ? new Date(s.length === 10 ? s + "T12:00:00" : s) : null;
var colorPct = (p, P) => p == null ? P.GRIS : p >= 100 ? VERDE : p > 0 ? AMBAR : ROJO;
async function armarInformeTraspasos(d) {
  const P = paleta(d.colores ?? COLORES_MARCA);
  const raya = () => ({ style: "thin", color: { argb: P.LINEA } });
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL \xB7 Traspasos";
  wb.created = /* @__PURE__ */ new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logoId = d.logo ? wb.addImage({ buffer: d.logo, extension: "png" }) : null;
  const cabecera = (h, titulo2, sub2, ancho) => {
    h.views = [{ showGridLines: false }];
    h.getRow(1).height = 6;
    for (let c = 1; c <= ancho; c++) h.getRow(1).getCell(c).fill = relleno(P.BANDA);
    h.getRow(2).height = 8;
    h.getRow(3).height = 26;
    h.getRow(4).height = 16;
    h.getRow(5).height = 16;
    const t = h.getCell(3, 1);
    t.value = titulo2;
    t.font = letra(16, P.TINTA, true);
    t.alignment = { vertical: "middle" };
    const s = h.getCell(4, 1);
    s.value = sub2;
    s.font = letra(9.5, P.GRIS);
    const v = h.getCell(5, 1);
    v.value = vinculo("Resumen", "\u2190 volver al resumen");
    v.font = letra(9.5, P.ENLACE, true);
  };
  const encabezado = (h, fila, titulos) => {
    const r = h.getRow(fila);
    r.height = 26;
    titulos.forEach((t, i) => {
      const c = r.getCell(i + 1);
      c.value = t;
      c.font = letra(9, BLANCO, true);
      c.fill = relleno(P.TINTA);
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
  };
  const filaDatos = (r, n, par, fmts) => {
    r.height = 18;
    for (let c = 1; c <= n; c++) {
      const cel = r.getCell(c);
      cel.border = { bottom: raya() };
      cel.font = letra(9.5, P.TINTA);
      cel.alignment = { vertical: "middle" };
      if (par) cel.fill = relleno(P.FONDO);
      if (fmts[c]) cel.numFmt = fmts[c];
    }
  };
  const totales = (h, fila, desde, hasta, cols, ancho) => {
    const r = h.getRow(fila);
    r.height = 22;
    for (let c = 1; c <= ancho; c++) {
      const cel = r.getCell(c);
      cel.fill = relleno(P.FONDO);
      cel.border = { top: { style: "medium", color: { argb: P.TINTA } } };
      cel.font = letra(9.5, P.TINTA, true);
      cel.alignment = { vertical: "middle" };
    }
    r.getCell(1).value = "TOTAL (lo filtrado)";
    for (const c of cols) {
      const L = col(c);
      let suma = 0;
      for (let f = desde; f <= hasta; f++) {
        const v = h.getRow(f).getCell(c).value;
        if (typeof v === "number") suma += v;
      }
      r.getCell(c).value = { formula: `SUBTOTAL(109,${L}${desde}:${L}${hasta})`, result: suma };
      r.getCell(c).numFmt = NUM;
    }
  };
  const sum = (l, k) => l.reduce((a, f) => a + (Number(f[k]) || 0), 0);
  const planeado = sum(d.filas, "planeado");
  const cumplido = sum(d.filas, "cumplido");
  const adheridos = sum(d.filas, "adheridos");
  const adicionales = sum(d.filas, "adicionales");
  const carga = sum(d.filas, "carga");
  const faltan = planeado - adheridos;
  const adherencia = planeado > 0 ? Math.round(adheridos / planeado * 100) : null;
  const cumplimiento = planeado > 0 ? Math.round(cumplido / planeado * 100) : null;
  const sinPlanear = d.filas.filter((f) => f.sin_planear).length;
  const unDia = d.desde === d.hasta;
  const titulo = "Traspasos \xB7 control y ejecuci\xF3n";
  const rotulo = unDia ? fechaLarga(d.desde) : `${fechaLarga(d.desde)} a ${fechaLarga(d.hasta)}`;
  const filtro = [
    d.turnos.length ? `turno ${d.turnos.join(", ")}` : "todos los turnos",
    d.tipos.length ? `${d.tipos.length} tipo(s) escogido(s)` : "todos los tipos"
  ].join(" \xB7 ");
  const sub = `${rotulo.replace(/^./, (c) => c.toUpperCase())}  \xB7  ${filtro}  \xB7  export\xF3 ${d.quien}`;
  const porDiaTurno = /* @__PURE__ */ new Map();
  for (const f of d.filas) {
    const k = `${f.fecha}|${f.turno}`;
    const x = porDiaTurno.get(k) ?? {
      fecha: f.fecha,
      turno: f.turno,
      orden: f.turno_orden ?? 9,
      planeado: 0,
      cumplido: 0,
      adheridos: 0,
      adicionales: 0,
      faltan: 0,
      carga: 0,
      registros: 0,
      tipos: 0,
      sinPlanear: 0
    };
    x.planeado += f.planeado;
    x.cumplido += f.cumplido;
    x.adheridos += f.adheridos;
    x.adicionales += f.adicionales;
    x.faltan += f.faltan;
    x.carga += f.carga;
    x.registros += f.registros;
    x.tipos += 1;
    x.sinPlanear += f.sin_planear ? 1 : 0;
    porDiaTurno.set(k, x);
  }
  const dias = [...porDiaTurno.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.orden - b.orden);
  const porTipo = /* @__PURE__ */ new Map();
  for (const f of d.filas) {
    const x = porTipo.get(f.tipo) ?? {
      tipo: f.tipo,
      nombre: f.tipo_nombre ?? f.tipo,
      orden: f.tipo_orden ?? 99,
      planeado: 0,
      cumplido: 0,
      adheridos: 0,
      adicionales: 0,
      faltan: 0,
      carga: 0,
      registros: 0,
      placas: 0
    };
    x.planeado += f.planeado;
    x.cumplido += f.cumplido;
    x.adheridos += f.adheridos;
    x.adicionales += f.adicionales;
    x.faltan += f.faltan;
    x.carga += f.carga;
    x.registros += f.registros;
    x.placas = Math.max(x.placas, f.placas);
    porTipo.set(f.tipo, x);
  }
  const tipos = [...porTipo.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const porTurno = TURNOS.map((tu) => {
    const l = d.filas.filter((f) => f.turno === tu);
    const pl = sum(l, "planeado"), ad = sum(l, "adheridos"), ex = sum(l, "adicionales");
    return {
      turno: tu,
      planeado: pl,
      adheridos: ad,
      adicionales: ex,
      faltan: pl - ad,
      pct: pl > 0 ? Math.round(ad / pl * 100) : null,
      hay: l.length > 0
    };
  });
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: P.BANDA } } });
    h.columns = [2, 13.5, 11, 11.5, 11.5, 11, 11.5, 11, 11, 2].map((w) => ({ width: w }));
    h.views = [{ showGridLines: false }];
    const alto = (f2, v) => {
      h.getRow(f2).height = v;
    };
    const pon = (f2, c, v, fuente, extra = {}) => {
      const cel = h.getCell(f2, c);
      cel.value = v;
      cel.font = fuente;
      Object.assign(cel, extra);
      return cel;
    };
    const pintar = (f2, c1, c2, argb) => {
      for (let c = c1; c <= c2; c++) h.getCell(f2, c).fill = relleno(argb);
    };
    const unir = (f2, c1, c2) => {
      if (c2 > c1) h.mergeCells(f2, c1, f2, c2);
    };
    [6, 9.75, 33.75, 18, 13.5].forEach((v, i) => alto(i + 1, v));
    pintar(1, 1, 10, P.BANDA);
    if (logoId != null) h.addImage(logoId, { tl: { col: 1.05, row: 2.08 }, ext: { width: 42, height: 42 } });
    unir(3, 3, 7);
    pon(3, 3, titulo, letra(22, P.TINTA, true), { alignment: { vertical: "middle" } });
    unir(4, 3, 7);
    pon(4, 3, rotulo.replace(/^./, (c) => c.toUpperCase()), letra(9.5, P.GRIS), { alignment: { vertical: "middle" } });
    unir(5, 3, 7);
    pon(5, 3, `${filtro}  \xB7  export\xF3 ${d.quien}`, letra(9.5, P.GRIS), { alignment: { vertical: "top" } });
    unir(3, 8, 9);
    pon(3, 8, "D\xCDAS DEL RANGO", letra(7.5, P.GRIS, true), { alignment: { horizontal: "right", vertical: "bottom" } });
    const nDias = Math.round((Date.parse(d.hasta + "T12:00:00") - Date.parse(d.desde + "T12:00:00")) / 864e5) + 1;
    unir(4, 8, 9);
    pon(4, 8, nDias, letra(12, P.TINTA, true), { numFmt: NUM, alignment: { horizontal: "right", vertical: "top" } });
    const avance = planeado > 0 ? adheridos / planeado : 0;
    const BL = 12;
    const bloques = Math.max(avance > 0 ? 1 : 0, Math.min(BL, Math.round(avance * BL)));
    [15.75, 43.5, 19.5, 12].forEach((v, i) => alto(6 + i, v));
    for (let f2 = 6; f2 <= 9; f2++) {
      pintar(f2, 2, 9, P.PANEL);
      h.getCell(f2, 2).border = { left: { style: "thick", color: { argb: P.BANDA } } };
    }
    pon(6, 2, "  ADHERENCIA AL PLAN", letra(8.5, P.GRIS, true), { alignment: { vertical: "bottom" } });
    unir(7, 2, 4);
    pon(
      7,
      2,
      adherencia == null ? "\u2014" : adherencia / 100,
      letra(40, colorPct(adherencia, P), true),
      { numFmt: adherencia == null ? "@" : "0%", alignment: { horizontal: "left", vertical: "middle", indent: 1 } }
    );
    unir(8, 2, 4);
    pon(
      8,
      2,
      `${adheridos.toLocaleString("es-CO")} de ${planeado.toLocaleString("es-CO")} viajes planeados`,
      letra(10, P.GRIS, true),
      { alignment: { vertical: "bottom", indent: 1 } }
    );
    unir(7, 5, 7);
    pon(7, 5, { richText: [
      { font: letra(20, P.BANDA), text: "\u2588".repeat(bloques) },
      { font: letra(20, P.HUECO), text: "\u2588".repeat(BL - bloques) }
    ] }, letra(20, P.BANDA), { alignment: { vertical: "middle" } });
    unir(8, 5, 7);
    pon(8, 5, "cada bloque \u2248 " + Math.max(1, Math.round(planeado / BL)) + " viajes del plan", letra(9, P.GRIS), { alignment: { vertical: "middle" } });
    unir(7, 8, 9);
    pon(7, 8, faltan, letra(32, faltan ? ROJO : VERDE, true), { numFmt: "#,##0", alignment: { horizontal: "right", vertical: "middle", indent: 1 } });
    unir(8, 8, 9);
    pon(8, 8, "FALTARON  ", letra(9, P.GRIS, true), { alignment: { horizontal: "right", vertical: "bottom" } });
    const tarjetas = (f2, rot, cs) => {
      alto(f2 - 1, 13.5);
      alto(f2, 15.75);
      alto(f2 + 1, 18);
      alto(f2 + 2, 33.75);
      pon(f2, 2, rot, letra(8, P.TINTA, true));
      cs.forEach(([r, v, fmt, borde, color], i) => {
        const c0 = 2 + i * 2;
        unir(f2 + 1, c0, c0 + 1);
        unir(f2 + 2, c0, c0 + 1);
        pintar(f2 + 1, c0, c0 + 1, P.CAJA);
        pintar(f2 + 2, c0, c0 + 1, P.CAJA);
        const lados = { left: { style: "thick", color: { argb: borde } }, right: { style: "thick", color: { argb: BLANCO } } };
        pon(f2 + 1, c0, r, letra(7.5, P.GRIS, true), { border: lados, alignment: { horizontal: "left", vertical: "bottom", indent: 1 } });
        pon(f2 + 2, c0, v, letra(22, color ?? P.TINTA, true), { numFmt: fmt, border: lados, alignment: { horizontal: "left", vertical: "middle", indent: 1 } });
      });
    };
    tarjetas(11, "EL PER\xCDODO", [
      ["VIAJES PLANEADOS", planeado, NUM, P.BANDA],
      ["VIAJES CUMPLIDOS", adheridos, NUM, P.BANDA],
      ["ADICIONALES", adicionales, NUM, adicionales ? AMBAR : P.BANDA, adicionales ? AMBAR : P.TINTA],
      ["FALTARON", faltan, NUM, faltan ? ROJO : VERDE, faltan ? ROJO : VERDE]
    ]);
    tarjetas(15, "LO DEM\xC1S", [
      ["% CUMPLIMIENTO", cumplimiento == null ? "\u2014" : cumplimiento / 100, cumplimiento == null ? "@" : "0%", P.BANDA, colorPct(cumplimiento, P)],
      /* LOS VACÍOS VAN APARTE Y LO DICEN: cuestan igual pero no mueven
         producto, y sumarlos al cumplido inflaría la adherencia. */
      ["VIAJES VAC\xCDOS (aparte)", d.vacios, NUM, P.BANDA],
      ["CARGA MOVIDA", carga, NUM, P.BANDA],
      ["TIPOS SIN PLANEAR", sinPlanear, NUM, sinPlanear ? AMBAR : P.BANDA, sinPlanear ? AMBAR : P.TINTA]
    ]);
    alto(18, 13.5);
    alto(19, 6);
    const cols = [[2, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9]];
    const fila = (f2, vals, tipo, fmts = []) => {
      alto(f2, tipo === "dato" ? 19.5 : 21.75);
      vals.forEach((v, i) => {
        const [c1, c2] = cols[i];
        unir(f2, c1, c2);
        const cel = h.getCell(f2, c1);
        if (v !== void 0) cel.value = v;
        if (fmts[i]) cel.numFmt = fmts[i];
        cel.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right", indent: 1 };
        for (let c = c1; c <= c2; c++) {
          const x = h.getCell(f2, c);
          if (tipo === "cabeza") {
            x.fill = relleno(aclarar(d.colores?.tinta ?? COLORES_MARCA.tinta, 0.15));
            x.font = letra(8.5, P.TINTA, true);
          } else if (tipo === "total") {
            x.fill = relleno(P.FONDO);
            x.font = letra(10, P.TINTA, true);
            x.border = { top: { style: "medium", color: { argb: P.TINTA } } };
          } else {
            x.font = letra(10, P.TINTA);
            x.border = { bottom: raya() };
          }
        }
      });
    };
    let f = 20;
    pon(f, 2, "C\xD3MO VA POR TURNO", letra(8, P.TINTA, true));
    alto(f, 15.75);
    f++;
    fila(f++, ["TURNO", "PLANEADO", "CUMPLIDO", "ADICIONAL", "FALTAN", "% ADHER.", ""], "cabeza");
    for (const t of porTurno) {
      fila(
        f,
        [
          t.turno + (t.hay ? "" : "  (sin movimiento)"),
          t.planeado,
          t.adheridos,
          t.adicionales,
          t.faltan,
          t.pct == null ? "\u2014" : t.pct / 100,
          ""
        ],
        "dato",
        [void 0, NUM, NUM, NUM, NUM, t.pct == null ? "@" : "0%"]
      );
      h.getCell(f, 8).font = letra(10, colorPct(t.pct, P), true);
      f++;
    }
    fila(
      f++,
      [
        "TODOS LOS TURNOS",
        planeado,
        adheridos,
        adicionales,
        faltan,
        adherencia == null ? "\u2014" : adherencia / 100,
        ""
      ],
      "total",
      [void 0, NUM, NUM, NUM, NUM, adherencia == null ? "@" : "0%"]
    );
    alto(f++, 12);
    pon(f, 2, "LAS HOJAS DE ESTE LIBRO", letra(8, P.TINTA, true));
    alto(f, 15.75);
    f++;
    const links = [
      ["D\xEDa por turno", `una fila por fecha y turno \xB7 ${dias.length} fila(s)`],
      ["Por tipo", `cada tipo de viaje en todo el rango \xB7 ${tipos.length} tipo(s)`],
      ["Viajes", `viaje por viaje, la data cruda \xB7 ${d.viajes.length} viaje(s)`]
    ];
    for (const [hoja, que] of links) {
      alto(f, 18);
      unir(f, 2, 3);
      const a = h.getCell(f, 2);
      a.value = vinculo(hoja, "\u2192 " + hoja);
      a.font = letra(10, P.ENLACE, true);
      a.alignment = { vertical: "middle", indent: 1 };
      unir(f, 4, 9);
      const b = h.getCell(f, 4);
      b.value = que;
      b.font = letra(9.5, P.GRIS);
      b.alignment = { vertical: "middle" };
      f++;
    }
    alto(f++, 12);
    alto(f, 30);
    unir(f, 2, 9);
    const n = h.getCell(f, 2);
    n.value = "C\xF3mo se cuenta: adherencia = cumplidos \xF7 planeados (tope 100%). Cumplimiento = todo lo movido \xF7 planeados, adicionales incluidos. Los viajes vac\xEDos y los anulados no entran en ninguna de las dos. Los tipos marcados como \xABno miden\xBB en el maestro (tolvas de vidrio) quedan fuera del libro, y las estibas solo cuentan cuando el viaje es de Arenosa.";
    n.font = letra(8.5, P.GRIS, false, true);
    n.alignment = { wrapText: true, vertical: "top" };
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  {
    const h = wb.addWorksheet("D\xEDa por turno", { properties: { tabColor: { argb: P.TINTA } } });
    const C = ["Fecha", "Turno", "Planeado", "Cumplido", "Adicionales", "Faltan", "% Adherencia", "% Cumplimiento", "Carga", "Registros", "Tipos", "Sin planear"];
    h.columns = [12, 8, 11, 11, 12, 10, 13, 14, 11, 11, 9, 11].map((w) => ({ width: w }));
    cabecera(h, "D\xEDa por turno", sub, C.length);
    encabezado(h, 6, C);
    dias.forEach((x, i) => {
      const r = h.getRow(7 + i);
      const ad = x.planeado > 0 ? x.adheridos / x.planeado : null;
      const cu = x.planeado > 0 ? x.cumplido / x.planeado : null;
      r.values = [
        aFecha(x.fecha),
        x.turno,
        x.planeado,
        x.adheridos,
        x.adicionales,
        x.faltan,
        ad,
        cu,
        x.carga,
        x.registros,
        x.tipos,
        x.sinPlanear
      ];
      filaDatos(
        r,
        C.length,
        i % 2 === 1,
        { 3: NUM, 4: NUM, 5: NUM, 6: NUM, 7: PCT, 8: PCT, 9: NUM, 10: NUM, 11: "0", 12: "0" }
      );
      r.getCell(1).numFmt = "dd/mm/yyyy";
      r.getCell(2).font = letra(9.5, P.TINTA, true);
      r.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
      if (ad != null) r.getCell(7).font = letra(9.5, colorPct(Math.round(ad * 100), P), true);
      if (x.faltan > 0) r.getCell(6).font = letra(9.5, ROJO, true);
    });
    const fin = 6 + Math.max(dias.length, 1);
    totales(h, fin + 1, 7, fin, [3, 4, 5, 6, 9, 10], C.length);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", xSplit: 2, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
  }
  {
    const h = wb.addWorksheet("Por tipo", { properties: { tabColor: { argb: VERDE } } });
    const C = ["Tipo de viaje", "Planeado", "Cumplido", "Adicionales", "Faltan", "% Adherencia", "% Cumplimiento", "Carga", "Registros"];
    h.columns = [30, 11, 11, 12, 10, 13, 14, 12, 11].map((w) => ({ width: w }));
    cabecera(h, "Por tipo de viaje", sub, C.length);
    encabezado(h, 6, C);
    tipos.forEach((x, i) => {
      const r = h.getRow(7 + i);
      const ad = x.planeado > 0 ? x.adheridos / x.planeado : null;
      const cu = x.planeado > 0 ? x.cumplido / x.planeado : null;
      r.values = [x.nombre, x.planeado, x.adheridos, x.adicionales, x.faltan, ad, cu, x.carga, x.registros];
      filaDatos(r, C.length, i % 2 === 1, { 2: NUM, 3: NUM, 4: NUM, 5: NUM, 6: PCT, 7: PCT, 8: NUM, 9: NUM });
      r.getCell(1).font = letra(9.5, P.TINTA, true);
      if (ad != null) r.getCell(6).font = letra(9.5, colorPct(Math.round(ad * 100), P), true);
      if (x.faltan > 0) r.getCell(5).font = letra(9.5, ROJO, true);
    });
    const fin = 6 + Math.max(tipos.length, 1);
    totales(h, fin + 1, 7, fin, [2, 3, 4, 5, 8, 9], C.length);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", xSplit: 1, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
  }
  {
    const h = wb.addWorksheet("Viajes", { properties: { tabColor: { argb: P.GRIS } } });
    const C = [
      "Fecha",
      "Turno",
      "C\xF3digo",
      "Placa",
      "Tipo",
      "Origen",
      "Destino",
      "Orden de cargue",
      "Viajes",
      "Carga",
      "Unidad",
      "Vac\xEDo",
      "Estado",
      "Hora",
      "Registr\xF3",
      "D\xEDas atr\xE1s",
      "Nota"
    ];
    h.columns = [12, 7, 13, 11, 18, 20, 20, 16, 8, 10, 10, 8, 11, 8, 20, 10, 34].map((w) => ({ width: w }));
    cabecera(h, "Viajes del rango", `${d.viajes.length} viaje(s)  \xB7  ${sub}`, C.length);
    encabezado(h, 6, C);
    const orden = [...d.viajes].sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.turno_orden ?? 9) - (b.turno_orden ?? 9) || a.hora.localeCompare(b.hora));
    orden.forEach((v, i) => {
      const r = h.getRow(7 + i);
      r.values = [
        aFecha(v.fecha),
        v.turno,
        v.codigo ?? "",
        v.placa ?? "",
        v.tipo_nombre ?? v.tipo ?? "",
        v.origen_nombre ?? v.origen ?? "",
        v.destino_nombre ?? v.destino ?? "",
        v.documento ?? "",
        v.viajes,
        v.carga,
        v.unidad ?? "",
        v.vacio ? "S\xED" : "",
        v.estado === "anulado" ? "ANULADO" : "Registrado",
        v.hora ? new Date(v.hora).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "",
        v.registrado_por && d.nombres[v.registrado_por] || "\u2014",
        v.dias_atras,
        v.nota ?? ""
      ];
      filaDatos(r, C.length, i % 2 === 1, { 9: "0", 10: NUM, 16: "0" });
      r.getCell(1).numFmt = "dd/mm/yyyy";
      r.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
      r.getCell(3).font = letra(9.5, P.TINTA, true);
      if (v.estado === "anulado") r.getCell(13).font = letra(9.5, ROJO, true);
      if (v.vacio) r.getCell(12).font = letra(9.5, AMBAR, true);
      if (v.atrasado) r.getCell(16).font = letra(9.5, AMBAR, true);
      if (v.sin_documento) r.getCell(8).font = letra(9.5, ROJO, true);
    });
    const fin = 6 + Math.max(orden.length, 1);
    totales(h, fin + 1, 7, fin, [9, 10], C.length);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", xSplit: 3, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
  }
  for (const h of wb.worksheets) h.pageSetup = {
    ...h.pageSetup,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
  };
  for (const h of wb.worksheets) h.eachRow((r) => r.eachCell((c) => {
    c.font = { name: "Calibri", ...c.font ?? {} };
  }));
  const crudo = Buffer.from(await wb.xlsx.writeBuffer());
  return remendarFiltros(crudo, wb);
}
function remendarFiltros(zip, wb) {
  try {
    const partes = unzipSync(new Uint8Array(zip));
    let xml = new TextDecoder().decode(partes["xl/workbook.xml"]);
    const trozos = [];
    wb.worksheets.forEach((h, i) => {
      if (typeof h.autoFilter !== "string") return;
      const [a, b] = h.autoFilter.split(":");
      const abs = (x) => x.replace(/([A-Z]+)(\d+)/, "$$$1$$$2");
      const ref = /[\s()]/.test(h.name) || /[^A-Za-z0-9_]/.test(h.name) ? `'${h.name}'` : h.name;
      trozos.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${ref}!${abs(a)}:${abs(b)}</definedName>`);
    });
    const otros = (xml.match(/<definedNames>([\s\S]*?)<\/definedNames>/)?.[1] ?? "").replace(/<definedName[^>]*name="_xlnm\._FilterDatabase"[^>]*>[\s\S]*?<\/definedName>/g, "");
    const bloque = trozos.length || otros ? `<definedNames>${trozos.join("")}${otros}</definedNames>` : "";
    xml = xml.includes("<definedNames>") ? xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, bloque) : xml.replace("</sheets>", `</sheets>${bloque}`);
    partes["xl/workbook.xml"] = new TextEncoder().encode(xml);
    return Buffer.from(zipSync(partes));
  } catch {
    return zip;
  }
}
export {
  COLORES_MARCA,
  armarInformeTraspasos
};
