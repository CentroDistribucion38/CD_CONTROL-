/**
 * EL CONSOLIDADO DEL DÍA EN EXCEL — inventario.
 *
 * «Consolidar los inventarios del día en una base y exportar la data,
 * espectacular, con el logo, como lo del sider: un Excel donde yo pueda
 * validar todo.»
 *
 * UNA BASE, NO LA SUMA DE LOS RECORRIDOS. Si ese día se caminó la calle A
 * dos veces, vale el último recorrido que pasó por cada ubicación (la
 * misma regla del tablero, medirRiesgo). Los renglones que quedaron
 * reemplazados no se pierden: salen en «Validar», para ver qué cambió.
 *
 * Seis hojas:
 *   Resumen          logo, cifras del día, franjas, recorridos y el
 *                    semáforo de la validación.
 *   Base             la base consolidada, renglón por renglón, con filtro,
 *                    encabezado fijo, totales que siguen al filtro y la
 *                    franja pintada.
 *   Por material     la base agrupada por código.
 *   Por ubicación    lo que hay en cada módulo contra lo que cabe.
 *   Validar          todo lo que alguien tiene que mirar, con el porqué.
 *   Sin contar       las posiciones activas que ese día nadie caminó.
 *
 * Puro de datos: recibe los renglones y el maestro, no lee la base. Se
 * corre con datos de prueba y se abre el archivo para ver cómo quedó.
 */
import ExcelJS from "exceljs";
import { unzipSync, zipSync } from "fflate";
import type { Renglon, ConteoFefo, Material, Ubicacion } from "./fefo";
import { medirRiesgo, franja, FRANJAS, type Franja } from "./riesgo";

type BufferDeExcel = Parameters<ExcelJS.Workbook["addImage"]>[0]["buffer"];

export type InsumosDia = {
  fecha: string;               // YYYY-MM-DD (el primer día)
  hasta?: string;              // YYYY-MM-DD: si viene y es otro día, el libro es de un período
  bodega: string;
  quien: string;
  conteos: ConteoFefo[];       // los ENVIADOS de ese día
  lineas: Renglon[];           // sus renglones
  materiales: Material[];
  ubicaciones: Ubicacion[];    // de la bodega
  logo: Buffer | null;         // public/marca/logo-b.png (el sello de la B)
  /** Los colores del tema de quien exporta; sin ellos, los de la marca. */
  colores?: ColoresLibro;
  /** Cuántos FEFO se enviaron ese día, si se escogieron solo algunos. */
  totalDelDia?: number;
  /** Las fotos de los renglones (la camarita de Contar). Si no hay ninguna,
   *  el libro sale IGUAL que siempre: la hoja «Evidencias» solo existe
   *  cuando hay con qué llenarla. */
  evidencias?: EvidenciaRenglon[];
  /** Fotos que no se pudieron meter (techo de peso o no bajaron): la hoja lo dice. */
  fotosRecortadas?: number;
};

export type EvidenciaRenglon = {
  linea_id: string;
  /** Los bytes del JPEG, ya bajados del bucket por quien arma el libro. */
  foto: Buffer;
  ancho: number | null;
  alto: number | null;
  tomada_en: string | null;
};

/* ---------- La paleta: la del tema de quien exporta ----------
   «Que quede así (el gris claro)… con el tema de ámbar y así: sabes que
   varía dependiendo la preferencia.» Del tema llegan dos colores —la
   tinta y el de la banda— y de la tinta salen los grises: con un pelo de
   su tono, así el gris de pizarra tira a verde y el de la marca a azul.
   Los colores que dicen algo (vencido, con margen…) no cambian. */
export type ColoresLibro = { tinta: string; banda: string };   // RRGGBB
export const COLORES_MARCA: ColoresLibro = { tinta: "12263A", banda: "FFC000" };
const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const aHex = (c: number[]) => "FF" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
/** La tinta llevada hacia el blanco: t = cuánto de tinta queda. */
const aclarar = (h: string, t: number) => aHex(hex(h).map((c) => 255 - (255 - c) * t));
const oscurecer = (h: string, k: number) => aHex(hex(h).map((c) => c * k));
const BLANCO = "FFFFFFFF", ROJO = "FFC6202A", VERDE = "FF1F7A45", ROSA = "FFFFF4F4", MENTA = "FFEFF8F2";
let TINTA = "", BANDA = "", GRIS = "", LINEA = "", FONDO = "", CAJA = "", PANEL = "", CABEZA = "", ENLACE = "";
function usarColores(c: ColoresLibro) {
  const ok = (x: string) => /^[0-9a-f]{6}$/i.test(x);
  const t = ok(c.tinta) ? c.tinta : COLORES_MARCA.tinta, b = ok(c.banda) ? c.banda : COLORES_MARCA.banda;
  TINTA = aHex(hex(t)); BANDA = aHex(hex(b));
  GRIS = aclarar(t, 0.64);      // rótulos y notas
  LINEA = aclarar(t, 0.12);     // la raya entre renglones
  FONDO = aclarar(t, 0.045);    // rayado y fila de totales
  CAJA = aclarar(t, 0.035);     // las tarjetas
  PANEL = aclarar(t, 0.055);    // el avance del conteo
  CABEZA = aclarar(t, 0.15);    // encabezado claro de las tablas del resumen
  ENLACE = oscurecer(b, 0.54);  // el dorado hondo de los vínculos
}
const FR: Record<Franja, { fondo: string; tinta: string }> = {
  vencido: { fondo: "FFFDE3E3", tinta: "FFC6202A" },
  pasado: { fondo: "FFFDE3E3", tinta: "FFC6202A" },
  semana: { fondo: "FFFDEBDB", tinta: "FFB4530A" },
  quince: { fondo: "FFFFF4D1", tinta: "FF8A6A00" },
  mes: { fondo: "FFF1F6DC", tinta: "FF5E7314" },
  ok: { fondo: "FFE3F2E8", tinta: "FF1F7A45" },
  sinfecha: { fondo: "FFF0F0EE", tinta: "FF6B6B66" },
};
const rotFr = (f: Franja) => FRANJAS.find((x) => x.clave === f)!.rot;
const NUM = "#,##0;\\-#,##0;\\–", PCT = "0.0%;\\-0.0%;\\–";

const raya = () => ({ style: "thin" as const, color: { argb: LINEA } });
const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const fechaLarga = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
/* LA HORA DE COLOMBIA, TAL CUAL SE LEE EN EL RELOJ. Excel no guarda husos: escribe el reloj que le des. ExcelJS
   toma el instante UTC de un Date como ese reloj, así que un `contado_en` de las 08:28 en Bogotá (13:28 UTC) salía
   «13:28» —5 horas adelantado, incluso «en el futuro» respecto de la hora de exportar—. Colombia no tiene horario
   de verano: es UTC−5 todo el año. Un día suelto (AAAA-MM-DD) se ancla al mediodía UTC para que ningún huso lo mueva de día. */
const UTC_COLOMBIA_MS = 5 * 3600 * 1000;
const aFecha = (s: string | null) => {
  if (!s) return null;
  if (s.length === 10) return new Date(s + "T12:00:00Z");
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t - UTC_COLOMBIA_MS);
};
const col = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };
const letra = (size: number, color: string, bold = false, italic = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
/** Un vínculo a otra hoja que se ve bien aunque no se recalcule. */
const vinculo = (hoja: string, texto: string) => ({ formula: `HYPERLINK("#'${hoja}'!A1","${texto.replace(/"/g, '""')}")`, result: texto });

/** Lo de arriba de cada hoja de datos: la banda del tema, el título, el
 *  día y el vínculo de vuelta al resumen. */
function cabecera(h: ExcelJS.Worksheet, titulo: string, sub: string, ancho: number) {
  h.views = [{ showGridLines: false }];
  h.getRow(1).height = 6;
  for (let c = 1; c <= ancho; c++) h.getRow(1).getCell(c).fill = relleno(BANDA);
  h.getRow(2).height = 8; h.getRow(3).height = 26; h.getRow(4).height = 16; h.getRow(5).height = 16;
  const t = h.getCell(3, 1); t.value = titulo; t.font = letra(16, TINTA, true); t.alignment = { vertical: "middle" };
  const s = h.getCell(4, 1); s.value = sub; s.font = letra(9.5, GRIS);
  const v = h.getCell(5, 1); v.value = vinculo("Resumen", "← volver al resumen"); v.font = letra(9.5, ENLACE, true);
}

/** Encabezado de tabla: la tinta del tema con letra blanca. */
function encabezado(h: ExcelJS.Worksheet, fila: number, titulos: string[], nums: number[] = []) {
  const r = h.getRow(fila); r.height = 26;
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1); c.value = t;
    c.font = letra(9, BLANCO, true); c.fill = relleno(TINTA);
    /* Texto a la izquierda y cifras a la derecha, arriba y abajo por igual. */
    c.alignment = { vertical: "middle", horizontal: nums.includes(i + 1) ? "right" : "left", wrapText: true, indent: 1 };
  });
}

/** Rayado suave, raya fina abajo y formatos de una fila de datos. */
function filaDatos(r: ExcelJS.Row, n: number, par: boolean, fmts: Record<number, string>, nums: number[] = []) {
  r.height = 18;
  for (let c = 1; c <= n; c++) {
    const cel = r.getCell(c);
    cel.border = { bottom: raya() }; cel.font = letra(9.5, TINTA);
    cel.alignment = { vertical: "middle", horizontal: nums.includes(c) ? "right" : "left", indent: 1 };
    if (par) cel.fill = relleno(FONDO);
    if (fmts[c]) cel.numFmt = fmts[c];
  }
}

/** Totales que SIGUEN AL FILTRO (SUBTOTAL 109): filtras y la cifra cambia. */
function totales(h: ExcelJS.Worksheet, fila: number, desde: number, hasta: number, cols: number[], ancho: number, rotulo = "TOTAL (lo filtrado)", fmt: Record<number, string> = {}) {
  const r = h.getRow(fila); r.height = 22;
  for (let c = 1; c <= ancho; c++) { const cel = r.getCell(c); cel.fill = relleno(FONDO); cel.border = { top: { style: "medium", color: { argb: TINTA } } }; cel.font = letra(9.5, TINTA, true); cel.alignment = { vertical: "middle" } }
  r.getCell(1).value = rotulo;
  for (const c of cols) {
    const L = col(c);
    /* El resultado va calculado: así se ve bien aunque el programa no
       recalcule al abrir (vista previa del correo, LibreOffice). */
    let suma = 0;
    for (let f = desde; f <= hasta; f++) {
      const v = h.getRow(f).getCell(c).value;
      if (typeof v === "number") suma += v;
      else if (v && typeof v === "object" && "result" in v && typeof v.result === "number") suma += v.result;
    }
    r.getCell(c).value = { formula: `SUBTOTAL(109,${L}${desde}:${L}${hasta})`, result: suma };
    r.getCell(c).numFmt = fmt[c] ?? NUM;
  }
}

function pintarFranja(cel: ExcelJS.Cell, f: Franja) {
  cel.fill = relleno(FR[f].fondo);
  cel.font = letra(9.5, FR[f].tinta, true);
}

/** El orden del almacén: calle, módulo (01, 02… 10 antes que PASILLO), lado y
 *  nombre. Se cuente en el orden que se cuente, el libro sale así. */
const natural = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").localeCompare(b ?? "", "es", { numeric: true });
export function porSitio<T extends { calle?: string | null; modulo?: string | null; lado?: string | null }>(
  a: T, b: T, nombre: (x: T) => string,
): number {
  return natural(a.calle, b.calle) || natural(a.modulo, b.modulo) || natural(a.lado, b.lado) || natural(nombre(a), nombre(b));
}

const siNo = (b: boolean | null | undefined) => (b ? "Sí" : "");

export async function armarLibroDia(d: InsumosDia): Promise<Buffer> {
  usarColores(d.colores ?? COLORES_MARCA);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Inventario"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logoId = d.logo ? wb.addImage({ buffer: d.logo as unknown as BufferDeExcel, extension: "png" }) : null;

  const uxc = Object.fromEntries(d.materiales.map((m) => [m.sku, m.unidades_por_caja]));
  /* DOS JUEGOS DE CIFRAS, A PROPÓSITO. `materiales`, `franjas` y
     `totalCajas` son SOLO producto terminado: son el riesgo de
     vencimiento, y el envase no se vence. `inventario` es TODO lo que se
     caminó. «LO CONTADO» y la hoja «Por material» van con `inventario`;
     si fueran con el riesgo, un día de solo envase saldría en cero. */
  const hlu = Object.fromEntries(d.materiales.map((m) => [m.sku, m.hl == null ? null : Number(m.hl)]));
  const { foto, franjas, materiales, totalCajas, totalUnidades, totalHl, ubicaciones: nUbi, inventario } = medirRiesgo(d.lineas, d.conteos, uxc, hlu);
  const enFoto = new Set(foto.map((l) => l.id));
  const reemplazados = d.lineas.filter((l) => !enFoto.has(l.id));
  const matPorSku = new Map(d.materiales.map((m) => [m.sku, m]));
  const orden = (a: Renglon, b: Renglon) =>
    porSitio(a, b, (x) => x.ubicacion_combinada ?? x.ubicacion ?? "") || natural(a.codigo, b.codigo) || natural(a.vencimiento, b.vencimiento);
  const base = [...foto].sort(orden);
  const titulo = `Inventario consolidado · ${d.bodega}`;
  const parcial = d.totalDelDia != null && d.totalDelDia > d.conteos.length;
  const periodo = !!d.hasta && d.hasta !== d.fecha;
  const cuando = periodo ? `Del ${fechaLarga(d.fecha)} al ${fechaLarga(d.hasta!)}` : fechaLarga(d.fecha);
  const sub = `${cuando.replace(/^./, (c) => c.toUpperCase())}  ·  ` +
    (parcial ? `${d.conteos.length} de ${d.totalDelDia} FEFO ${periodo ? "del período" : "del día"} (escogidos: ${d.conteos.map((c) => c.codigo).join(", ")})`
             : `${d.conteos.length} FEFO enviado${d.conteos.length === 1 ? "" : "s"}`) + ` · exportó ${d.quien} el ${new Date().toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }).replace(",", "")}`;


  /* ================= LAS CUENTAS, UNA SOLA VEZ =================
     «Quiero que esté formulado para saber de dónde sale la información.»
     Cada cifra derivada del libro es una FÓRMULA de Excel sobre la hoja
     «Base consolidada» (y esta, sobre «Maestro»): aquí se calcula también
     el resultado, para que el archivo se vea bien aunque el programa no
     recalcule al abrir (vista previa del correo, LibreOffice).

         Total cajas     = estibas completas × cajas por estiba + saldo
         Estibas físicas = estibas completas + 1 si hay saldo (la estiba
                           incompleta también ocupa un puesto)
         Unidades        = total cajas × unidades por caja
         Cajas plásticas = el total de cajas de lo que viaja en cajas
                           plásticas (el envase con botella y la caja vacía)
     «Cajas sueltas» ya no es una columna: las sueltas y el saldo son lo
     mismo —lo que no alcanza a ser una estiba completa— y van juntas. */
  type Clase = "Producto" | "Envase" | "Plástico" | "Otro envase";
  const CLASES: Clase[] = ["Producto", "Envase", "Plástico", "Otro envase"];
  const claseDe = (l: Renglon): Clase =>
    l.tipo_material !== "ENVASE" ? "Producto" : /CAJA PL/i.test(l.material) ? "Plástico" : /BARRIL|ESTIBA/i.test(l.material) ? "Otro envase" : "Envase";
  /* El factor de estibado de cada código: el que usó la aplicación para
     su total; si no vino, el del maestro; y si tampoco, el que se deduce. */
  const factorDe = new Map<string, number>();
  for (const l of base) {
    if (factorDe.get(l.codigo)) continue;
    const est = Number(l.estibas ?? 0), resto = Number(l.cajas ?? 0) + Number(l.saldo ?? 0);
    const f = Number(l.factor_estibado) || Number(matPorSku.get(l.codigo)?.cajas_por_estiba) || (est > 0 ? (Number(l.total_cajas) - resto) / est : 0);
    factorDe.set(l.codigo, f > 0 ? f : 0);
  }
  type Fila = { l: Renglon; clase: Clase; estibas: number; saldo: number; factor: number; cajas: number; fisicas: number; plast: number; uxc: number; unid: number; hl: number };
  const filas: Fila[] = base.map((l) => {
    const estibas = Number(l.estibas ?? 0), saldo = Number(l.cajas ?? 0) + Number(l.saldo ?? 0), factor = factorDe.get(l.codigo) ?? 0;
    const cajas = estibas * factor + saldo, clase = claseDe(l), u = Number(uxc[l.codigo] ?? 0);
    return { l, clase, estibas, saldo, factor, cajas, fisicas: estibas + (saldo > 0 ? 1 : 0), plast: clase === "Envase" || clase === "Plástico" ? cajas : 0,
      uxc: u, unid: cajas * u, hl: cajas * u * Number(hlu[l.codigo] ?? 0) };
  });
  const codigosBase = [...new Set(base.map((l) => l.codigo))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const finM = 6 + Math.max(codigosBase.length, 1);
  const fin = 6 + Math.max(base.length, 1);      // última fila de «Base consolidada»
  const BC = "'Base consolidada'";
  /* Las columnas de la base. `k` es el nombre con que se les llama aquí. */
  type ColB = { k: string; t: string; w: number; fmt?: string; num?: boolean };
  const CB: ColB[] = [
    { k: "rec", t: "Recorrido", w: 12 }, { k: "conto", t: "Contó", w: 18 }, { k: "cuando", t: "Contado", w: 16, fmt: "dd/mm/yy hh:mm" },
    { k: "calle", t: "Calle", w: 8 }, { k: "modulo", t: "Módulo", w: 8 }, { k: "lado", t: "Lado", w: 7 }, { k: "ubic", t: "Ubicación", w: 14 },
    { k: "cod", t: "Código", w: 10 }, { k: "mat", t: "Material", w: 34 }, { k: "tipo", t: "Tipo", w: 11 }, { k: "fam", t: "Familia", w: 13 },
    { k: "clase", t: "Clase", w: 13 },
    { k: "estibas", t: "Estibas completas", w: 11, fmt: "#,##0", num: true }, { k: "saldo", t: "Saldo (cajas)", w: 10, fmt: "#,##0", num: true },
    { k: "factor", t: "Cajas por estiba", w: 10, fmt: "#,##0", num: true }, { k: "cajas", t: "Total cajas", w: 11, fmt: "#,##0", num: true },
    { k: "fisicas", t: "Estibas físicas", w: 10, fmt: "#,##0", num: true }, { k: "plast", t: "Cajas plásticas", w: 11, fmt: "#,##0", num: true },
    { k: "uxc", t: "Unidades por caja", w: 10, fmt: "#,##0", num: true }, { k: "unid", t: "Unidades", w: 12, fmt: "#,##0", num: true },
    { k: "fab", t: "Fabricación", w: 12, fmt: "dd/mm/yyyy" }, { k: "venc", t: "Vencimiento", w: 12, fmt: "dd/mm/yyyy" },
    { k: "dvenc", t: "Días p/vencer", w: 10, fmt: "0", num: true }, { k: "dsal", t: "Días p/salir", w: 10, fmt: "0", num: true },
    { k: "franja", t: "Franja", w: 22 }, { k: "rota", t: "Rota", w: 6 }, { k: "averia", t: "Avería", w: 7 }, { k: "pnc", t: "PNC", w: 6 },
    { k: "estenv", t: "Estado envase", w: 14 }, { k: "nota", t: "Nota", w: 30 }, { k: "hl", t: "Hectolitros", w: 12, fmt: "#,##0.00", num: true },
  ];
  const K = Object.fromEntries(CB.map((c, i) => [c.k, i + 1])) as Record<string, number>;
  const LB = (k: string) => col(K[k]);
  const rb = (k: string) => `${BC}!$${LB(k)}$7:$${LB(k)}$${fin}`;      // el rango de una columna de la base
  const filaVal = (x: Fila): Record<string, string | number | Date | null> => {
    const l = x.l;
    return {
      rec: l.conteo, conto: l.conto ?? "", cuando: aFecha(l.contado_en), calle: l.calle ?? "", modulo: l.modulo ?? "", lado: l.lado ?? "", ubic: l.ubicacion_combinada ?? l.ubicacion ?? "Sin ubicación",
      cod: l.codigo, mat: l.material, tipo: l.tipo_material, fam: l.familia ?? "Sin familia", clase: x.clase, estibas: x.estibas, saldo: x.saldo, factor: x.factor, cajas: x.cajas,
      fisicas: x.fisicas, plast: x.plast, uxc: x.uxc, unid: x.unid, fab: aFecha(l.fabricacion), venc: aFecha(l.vencimiento), dvenc: l.dias_para_vencer, dsal: l.dias_para_salir,
      franja: rotFr(franja(l)), rota: siNo(l.rotacion), averia: siNo(l.averia), pnc: siNo(l.pnc), estenv: l.estado_envase ?? "", nota: l.nota ?? "", hl: x.hl,
    };
  };
  const planos = filas.map(filaVal);
  /* La medida que escoge quien mira: el título de la columna de la base. */
  const MEDIDAS: { t: string; k: keyof Fila }[] = [
    { t: "Estibas físicas", k: "fisicas" }, { t: "Total cajas", k: "cajas" }, { t: "Cajas plásticas", k: "plast" }, { t: "Unidades", k: "unid" }, { t: "Hectolitros", k: "hl" },
  ];

  /* ================= VALIDAR (se arma primero: el resumen la cuenta) ================= */
  type Ojo = { tipo: string; grave: boolean; ubicacion: string; codigo: string; material: string; detalle: string; recorrido: string };
  const ojos: Ojo[] = [];
  const ub = (l: Renglon) => l.ubicacion_combinada ?? l.ubicacion ?? "Sin ubicación";
  const vistos = new Map<string, Renglon>();
  for (const l of base) {
    const k = `${ub(l)}|${l.codigo}|${l.vencimiento ?? ""}`;
    if (vistos.has(k)) ojos.push({ tipo: "Repetido", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "Mismo material y vencimiento anotado dos veces en la misma ubicación.", recorrido: l.conteo });
    vistos.set(k, l);
    const f = franja(l);
    if (l.tipo_material !== "ENVASE" && !l.vencimiento) ojos.push({ tipo: "Sin fecha", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "Producto sin fecha de vencimiento: no se puede saber cuándo sale.", recorrido: l.conteo });
    if (f === "vencido") ojos.push({ tipo: "Vencido", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Vencido hace ${-(l.dias_para_vencer ?? 0)} día(s). ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
    else if (f === "pasado") ojos.push({ tipo: "Fuera de despacho", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Superó la fecha límite de despacho hace ${-(l.dias_para_salir ?? 0)} día(s). ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
    if (!matPorSku.has(l.codigo)) ojos.push({ tipo: "Código fuera del maestro", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "El código no está en el maestro de materiales.", recorrido: l.conteo });
    else if (l.tipo_material !== "ENVASE" && !uxc[l.codigo]) ojos.push({ tipo: "Sin unidades por caja", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "El maestro no trae unidades por caja: no suma en unidades.", recorrido: l.conteo });
    if (l.averia || l.pnc) ojos.push({ tipo: l.averia ? "Avería" : "PNC", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: l.nota ?? "Marcado en el conteo.", recorrido: l.conteo });
  }
  /* Módulos por encima de su capacidad (en estibas, como el maestro). */
  type UbiX = { ubicacion: string; calle: string | null; modulo: string | null; lado: string | null; capacidad: number | null; estibas: number; envase: number; plastico: number; producto: number; cajas: number; renglones: number; materiales: Set<string> };
  const porUbi = new Map<string, UbiX>();
  for (const x0 of filas) {
    const l = x0.l, k = ub(l);
    const x = porUbi.get(k) ?? { ubicacion: k, calle: l.calle, modulo: l.modulo, lado: l.lado, capacidad: l.capacidad, estibas: 0, envase: 0, plastico: 0, producto: 0, cajas: 0, renglones: 0, materiales: new Set<string>() };
    x.estibas += x0.fisicas; x.cajas += x0.cajas; x.renglones += 1; x.materiales.add(l.codigo);
    if (x0.clase === "Producto") x.producto += x0.fisicas; else if (x0.clase === "Plástico") x.plastico += x0.fisicas; else x.envase += x0.fisicas;
    porUbi.set(k, x);
  }
  /* Lo que la aplicación guardó contra lo que sale de la fórmula. Si no coinciden, el factor de estibado del maestro está mal. */
  for (const x of filas) if (Math.abs(x.cajas - Number(x.l.total_cajas)) > 0.5)
    ojos.push({ tipo: "No cuadra con la aplicación", grave: true, ubicacion: ub(x.l), codigo: x.l.codigo, material: x.l.material,
      detalle: `La fórmula da ${x.cajas.toLocaleString("es-CO")} cajas (${x.estibas} estibas × ${x.factor} + ${x.saldo}) y la aplicación guardó ${Number(x.l.total_cajas).toLocaleString("es-CO")}. Revisa el factor de estibado.`, recorrido: x.l.conteo });
  for (const x of porUbi.values()) if (x.capacidad && x.estibas > x.capacidad)
    ojos.push({ tipo: "Sobre capacidad", grave: false, ubicacion: x.ubicacion, codigo: "", material: "", detalle: `Hay ${x.estibas} estibas y caben ${x.capacidad}.`, recorrido: "" });
  for (const l of reemplazados)
    ojos.push({ tipo: "Reemplazado", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Esa ubicación (y zona) se volvió a contar: vale el recorrido más reciente. Aquí decía ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
  const graves = ojos.filter((o) => o.grave).length;

  /* Lo que nadie caminó ese día. */
  const contadas = new Set(foto.map((l) => l.ubicacion_id).filter(Boolean));
  const sinContar = d.ubicaciones.filter((u) => u.activa && !contadas.has(u.id))
    .sort((a, b) => porSitio(a, b, (x) => x.clave));
  const activas = d.ubicaciones.filter((u) => u.activa).length;
  /* «Por ubicación» se calcula aquí: el resumen suma sus columnas. */
  const us = [...porUbi.values()].sort((a, b) => porSitio(a, b, (x) => x.ubicacion));
  const finU = 6 + Math.max(us.length, 1);
  const PU = "'Por ubicación'";
  const ru = (c: number) => `${PU}!$${col(c)}$7:$${col(c)}$${finU}`;
  const libresDe = (x: UbiX) => (x.capacidad ? Math.max(0, x.capacidad - x.estibas) : null);
  const sumaU = (f: (x: UbiX) => number | null) => us.reduce((a, x) => a + (f(x) ?? 0), 0);
  const fx = (formula: string, result: number | string) => ({ formula, result });

  /* ================= 1 · RESUMEN =================
     Como el que mandó «gris claro»: la banda, el sello, el avance del
     conteo con su barra, dos filas de tarjetas, las franjas con su barrita,
     los recorridos con el cuadre de cajas y el aviso de lo que hay que
     validar. A = margen; B..I = ocho columnas; J = margen. */
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: BANDA } } });
    h.columns = [2, 13.5, 11, 11.5, 11.5, 11, 11.5, 11, 11, 2].map((w) => ({ width: w }));
    h.views = [{ showGridLines: false }];
    const alto = (f: number, v: number) => { h.getRow(f).height = v };
    const pon = (f: number, c: number, v: ExcelJS.CellValue, fuente: Partial<ExcelJS.Font>, extra: Partial<ExcelJS.Cell> = {}) => {
      const cel = h.getCell(f, c); cel.value = v; cel.font = fuente; Object.assign(cel, extra); return cel;
    };
    const pintar = (f: number, c1: number, c2: number, argb: string) => { for (let c = c1; c <= c2; c++) h.getCell(f, c).fill = relleno(argb) };
    const unir = (f: number, c1: number, c2: number) => { if (c2 > c1) h.mergeCells(f, c1, f, c2) };

    /* LA BANDA, EL SELLO, EL TÍTULO */
    [6, 9.75, 33.75, 18, 13.5].forEach((v, i) => alto(i + 1, v));
    pintar(1, 1, 10, BANDA);
    if (logoId != null) h.addImage(logoId, { tl: { col: 1.05, row: 2.08 }, ext: { width: 42, height: 42 } });
    pon(3, 3, titulo, letra(22, TINTA, true), { alignment: { vertical: "middle" } });
    pon(4, 3, sub, letra(9.5, GRIS));
    unir(3, 8, 9); pon(3, 8, "UBICACIONES DEL ALMACÉN", letra(7.5, GRIS, true), { alignment: { horizontal: "right", vertical: "bottom" } });
    unir(4, 8, 9); pon(4, 8, activas, letra(12, TINTA, true), { numFmt: NUM, alignment: { horizontal: "right", vertical: "top" } });

    /* EL AVANCE DEL CONTEO: cuánto del almacén se caminó ese día. */
    const avance = activas ? nUbi / activas : 0, bloques = Math.max(avance > 0 ? 1 : 0, Math.round(avance * 18));
    [15.75, 43.5, 19.5, 12].forEach((v, i) => alto(6 + i, v));
    for (let f = 6; f <= 9; f++) { pintar(f, 2, 9, PANEL); h.getCell(f, 2).border = { left: { style: "thick", color: { argb: BANDA } } } }
    pon(6, 2, "  AVANCE DEL CONTEO", letra(8.5, GRIS, true), { alignment: { vertical: "bottom" } });
    unir(7, 2, 4); pon(7, 2, avance, letra(40, TINTA, true), { numFmt: "0.0%", alignment: { horizontal: "left", vertical: "middle", indent: 1 } });
    unir(8, 2, 4); pon(8, 2, `${nUbi.toLocaleString("es-CO")} de ${activas.toLocaleString("es-CO")} ubicaciones`, letra(10, GRIS, true), { alignment: { vertical: "bottom", indent: 1 } });
    unir(7, 5, 7); pon(7, 5, "█".repeat(bloques) + "░".repeat(18 - bloques), letra(20, BANDA), { alignment: { vertical: "middle" } });
    unir(8, 5, 7); pon(8, 5, `cada bloque ≈ ${Math.max(1, Math.round(activas / 18))} ubicaciones`, letra(9, GRIS), { alignment: { vertical: "middle" } });
    unir(7, 8, 9); pon(7, 8, sinContar.length, letra(32, sinContar.length ? ROJO : VERDE, true), { numFmt: "#,##0", alignment: { horizontal: "right", vertical: "middle", indent: 1 } });
    unir(8, 8, 9); pon(8, 8, "SIN CONTAR  ", letra(9, GRIS, true), { alignment: { horizontal: "right", vertical: "bottom" } });

    /* LAS TARJETAS: rótulo chiquito arriba, la cifra grande abajo, y la
       raya de la izquierda que dice de qué color es la noticia. */
    const tarjetas = (f: number, titulo: string, cs: [string, ExcelJS.CellValue, string, string, string?][]) => {
      alto(f - 1, 13.5); alto(f, 15.75); alto(f + 1, 18); alto(f + 2, 33.75);
      pon(f, 2, titulo, letra(8, TINTA, true));
      cs.forEach(([rot, v, fmt, raya, color], i) => {
        const c0 = 2 + i * 2;
        unir(f + 1, c0, c0 + 1); unir(f + 2, c0, c0 + 1);
        pintar(f + 1, c0, c0 + 1, CAJA); pintar(f + 2, c0, c0 + 1, CAJA);
        const lados: Partial<ExcelJS.Borders> = { left: { style: "thick", color: { argb: raya } }, right: { style: "thick", color: { argb: BLANCO } } };
        pon(f + 1, c0, rot, letra(7.5, GRIS, true), { border: lados, alignment: { horizontal: "left", vertical: "bottom", indent: 1 } });
        pon(f + 2, c0, v, letra(22, color ?? TINTA, true), { numFmt: fmt, border: lados, alignment: { horizontal: "left", vertical: "middle", indent: 1 } });
      });
    };
    /* LAS CUATRO DE «LO CONTADO» SALEN DE LA MISMA FUENTE. Antes las
       estibas se sumaban aquí sobre la base y las cajas venían del
       riesgo: por eso un día de solo envase decía 150 estibas y 0 cajas.
       Cuatro cifras de la misma foto o ninguna. */
    const tot = (k: keyof Fila) => filas.reduce((a, x) => a + Number(x[k]), 0);
    tarjetas(11, "LO CONTADO", [["CAJAS", fx(`SUM(${rb("cajas")})`, tot("cajas")), NUM, BANDA], ["UNIDADES", fx(`SUM(${rb("unid")})`, tot("unid")), NUM, BANDA],
      ["ESTIBAS FÍSICAS", fx(`SUM(${rb("fisicas")})`, tot("fisicas")), NUM, BANDA], ["RENGLONES", fx(`COUNTA(${rb("cod")})`, filas.length), NUM, BANDA]]);
    const vencidas = franjas.vencido.cajas + franjas.pasado.cajas;
    const margen = totalCajas ? franjas.ok.cajas / totalCajas : 0;
    tarjetas(15, "PARA REVISAR", [
      ["MATERIALES", materiales.length, NUM, BANDA],
      ["VENCIDAS · CAJAS", vencidas, NUM, vencidas ? ROJO : VERDE, vencidas ? ROJO : VERDE],
      ["POR VALIDAR", graves, NUM, graves ? ROJO : VERDE, graves ? ROJO : VERDE],
      ["CON MARGEN", margen, PCT, VERDE, VERDE],
    ]);
    /* LAS ESTIBAS DE LOS MÓDULOS CONTADOS: cada estiba que se coloca —de
       envase, de plástico o de producto— ocupa un puesto del módulo. */
    tarjetas(19, "ESTIBAS DE LOS MÓDULOS CONTADOS", [
      ["LIBRES", fx(`SUM(${ru(10)})`, sumaU(libresDe)), NUM, VERDE, VERDE],
      ["CON ENVASE", fx(`SUM(${ru(6)})`, sumaU((x) => x.envase)), NUM, BANDA],
      ["CON PLÁSTICO", fx(`SUM(${ru(7)})`, sumaU((x) => x.plastico)), NUM, BANDA],
      ["CON PRODUCTO", fx(`SUM(${ru(8)})`, sumaU((x) => x.producto)), NUM, BANDA],
    ]);
    alto(22, 13.5);

    /* Una tabla del resumen: encabezado claro, raya fina, total con la
       raya de la tinta encima. B:C van juntas en la primera columna. */
    const cols = [[2, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9]];
    const fila = (f: number, vals: (ExcelJS.CellValue | undefined)[], tipo: "cabeza" | "dato" | "total", fmts: (string | undefined)[] = []) => {
      alto(f, tipo === "dato" ? 19.5 : 21.75);
      vals.forEach((v, i) => {
        const [a, b] = cols[i]; unir(f, a, b);
        const cel = h.getCell(f, a);
        if (v !== undefined) cel.value = v;
        cel.font = tipo === "cabeza" ? letra(9, TINTA, true) : letra(9.5, TINTA, tipo === "total");
        if (fmts[i]) cel.numFmt = fmts[i]!;
        cel.alignment = { vertical: "middle", horizontal: i === 0 || (tipo === "cabeza" && i === 6) ? "left" : "right", indent: 1 };
      });
      for (let c = 2; c <= 9; c++) {
        const cel = h.getCell(f, c);
        if (tipo === "cabeza") cel.fill = relleno(CABEZA);
        else if (tipo === "total") { cel.fill = relleno(FONDO); cel.border = { top: { style: "medium", color: { argb: TINTA } } } }
        else cel.border = { bottom: raya() };
      }
    };

    /* DEL CONTEO A CAJAS, PLÁSTICO Y UNIDADES: cada columna es una
       fórmula sobre «Base consolidada», así se ve de dónde sale. */
    let f = 22;
    f += 1; alto(f, 19.5); pon(f, 2, "Del conteo a cajas, plástico y unidades", letra(11, TINTA, true));
    unir(f, 5, 9);
    pon(f, 5, "estibas × cajas por estiba + saldo = cajas  ·  cajas × unidades por caja = unidades", letra(8.5, GRIS, false, true), { alignment: { horizontal: "right", vertical: "middle" } });
    f += 1; fila(f, ["Clase", "Renglones", "Estibas físicas", "Total cajas", "Cajas plásticas", "Unidades", "Hectolitros"], "cabeza");
    for (let c = 4; c <= 9; c++) h.getCell(f, c).alignment = { horizontal: "right", vertical: "middle", indent: 1, wrapText: true };
    const c1 = f + 1;
    const sumaClase = (c: Clase, k: keyof Fila) => filas.filter((x) => x.clase === c).reduce((a, x) => a + Number(x[k]), 0);
    for (const c of CLASES) {
      f += 1;
      fila(f, [c, fx(`COUNTIFS(${rb("clase")},$B${f})`, filas.filter((x) => x.clase === c).length),
        fx(`SUMIFS(${rb("fisicas")},${rb("clase")},$B${f})`, sumaClase(c, "fisicas")), fx(`SUMIFS(${rb("cajas")},${rb("clase")},$B${f})`, sumaClase(c, "cajas")),
        fx(`SUMIFS(${rb("plast")},${rb("clase")},$B${f})`, sumaClase(c, "plast")), fx(`SUMIFS(${rb("unid")},${rb("clase")},$B${f})`, sumaClase(c, "unid")),
        fx(`SUMIFS(${rb("hl")},${rb("clase")},$B${f})`, sumaClase(c, "hl"))], "dato", [, NUM, NUM, NUM, NUM, NUM, "#,##0.0;\\-#,##0.0;\\–"]);
      h.getCell(f, 2).font = letra(9.5, TINTA, true);
    }
    const c2 = f; f += 1;
    fila(f, ["Total", ...(["D", "E", "F", "G", "H", "I"] as const).map((L, i) => fx(`SUM(${L}${c1}:${L}${c2})`,
      (["renglones", "fisicas", "cajas", "plast", "unid", "hl"] as const)[i] === "renglones" ? filas.length : tot((["renglones", "fisicas", "cajas", "plast", "unid", "hl"] as const)[i] as keyof Fila)))], "total",
      [, NUM, NUM, NUM, NUM, NUM, "#,##0.0;\\-#,##0.0;\\–"]);
    f += 1; alto(f, 36); unir(f, 2, 9);
    pon(f, 2, "Estibas físicas = estibas completas + una por cada saldo (la estiba incompleta también ocupa su puesto). «Cajas plásticas» = las cajas del envase con botella y de la caja plástica vacía; barriles y estibas de madera no cuentan. La clase sale del nombre del material (columna Clase de «Base consolidada»).",
      letra(8, GRIS, false, true), { alignment: { wrapText: true, vertical: "top" } });
    f += 1; alto(f, 13.5);

    /* EL RIESGO DE VENCIMIENTO, por franja, con su barrita. */
    f += 1; alto(f, 19.5); pon(f, 2, "Riesgo de vencimiento", letra(11, TINTA, true));
    /* SI HAY ENVASE, DECIRLO AQUÍ. Si no, el que lee ve «LO CONTADO
       2.800 cajas» y tres renglones más abajo un total de riesgo en cero
       y piensa que el archivo está malo. La tabla está bien: el envase no
       se vence, y por eso no está en ella. */
    if (inventario.renglonesEnvase) {
      const cajasEnv = inventario.cajas - totalCajas;
      unir(f, 5, 9);
      pon(f, 5, `solo producto terminado — el envase (${inventario.renglonesEnvase} ${inventario.renglonesEnvase === 1 ? "renglón" : "renglones"}, ${cajasEnv.toLocaleString("es-CO")} cajas) no se vence  `,
        letra(8.5, GRIS, false, true), { alignment: { horizontal: "right", vertical: "middle" } });
    }
    f += 1; fila(f, ["Franja", "Cajas", "Unidades", "Materiales", "Ubicaciones", "% de cajas", ""], "cabeza");
    const d1 = f + 1, d2 = f + FRANJAS.length;
    for (const x of FRANJAS) {
      f += 1; const s = franjas[x.clave], pc = totalCajas ? s.cajas / totalCajas : 0;
      const crit = `${rb("franja")},$B${f},${rb("clase")},"Producto"`;
      fila(f, [x.rot, fx(`SUMIFS(${rb("cajas")},${crit})`, s.cajas), fx(`SUMIFS(${rb("unid")},${crit})`, s.unidades), s.materiales,
        fx(`COUNTIFS(${crit})`, s.renglones), fx(`IF(SUM(D$${d1}:D$${d2})=0,0,D${f}/SUM(D$${d1}:D$${d2}))`, pc), pc > 0 ? "█".repeat(Math.max(1, Math.round(pc * 8))) : ""], "dato", [, NUM, NUM, NUM, NUM, PCT]);
      pintarFranja(h.getCell(f, 2), x.clave);
      h.getCell(f, 8).font = letra(9.5, TINTA, true);
      const barra = h.getCell(f, 9); barra.font = letra(10, FR[x.clave].tinta); barra.alignment = { horizontal: "left", vertical: "middle" };
    }
    f += 1;
    fila(f, ["Total", { formula: `SUM(D${d1}:D${d2})`, result: totalCajas }, { formula: `SUM(E${d1}:E${d2})`, result: totalUnidades },
      `${materiales.length} distintos`, undefined, { formula: `SUM(H${d1}:H${d2})`, result: totalCajas ? 1 : 0 }, undefined], "total", [, NUM, NUM, , , PCT]);
    h.getCell(f, 6).font = letra(8.5, GRIS);

    /* LAS ESTIBAS POR CALLE: cuántas caben, cuántas hay de cada cosa y
       cuántas quedan libres en los módulos que se contaron. */
    f += 1; alto(f, 13.5);
    f += 1; alto(f, 19.5); pon(f, 2, "Estibas por calle", letra(11, TINTA, true));
    unir(f, 5, 9);
    pon(f, 5, "solo módulos contados · % ocupado: solo los que tienen capacidad en el maestro · detalle en «Por ubicación»", letra(8.5, GRIS, false, true), { alignment: { horizontal: "right", vertical: "middle" } });
    f += 1; fila(f, ["Calle", "Capacidad", "Con envase", "Con plástico", "Con producto", "Libres", "% ocupado"], "cabeza");
    for (let c = 4; c <= 9; c++) h.getCell(f, c).alignment = { horizontal: "right", vertical: "middle", indent: 1, wrapText: true };
    const calles = [...new Set(us.map((x) => x.calle ?? ""))].sort(natural);
    const k1 = f + 1;
    for (const ca of calles) {
      f += 1;
      const xs = us.filter((x) => (x.calle ?? "") === ca), cap = xs.reduce((a, x) => a + (x.capacidad ?? 0), 0);
      const env = xs.reduce((a, x) => a + x.envase, 0), pla = xs.reduce((a, x) => a + x.plastico, 0), pro = xs.reduce((a, x) => a + x.producto, 0);
      const lib = xs.reduce((a, x) => a + (libresDe(x) ?? 0), 0);
      fila(f, [ca || "(sin calle)", fx(`SUMIFS(${ru(5)},${ru(2)},$B${f})`, cap), fx(`SUMIFS(${ru(6)},${ru(2)},$B${f})`, env), fx(`SUMIFS(${ru(7)},${ru(2)},$B${f})`, pla),
        fx(`SUMIFS(${ru(8)},${ru(2)},$B${f})`, pro), fx(`SUMIFS(${ru(10)},${ru(2)},$B${f})`, lib),
        fx(`IF(D${f}=0,"",SUMIFS(${ru(9)},${ru(2)},$B${f},${ru(5)},">0")/D${f})`, cap ? xs.filter((x) => x.capacidad).reduce((a2, x) => a2 + x.estibas, 0) / cap : "")], "dato", [, NUM, NUM, NUM, NUM, NUM, "0%"]);
      h.getCell(f, 2).font = letra(9.5, TINTA, true);
    }
    const k2 = f; f += 1;
    const cap0 = sumaU((x) => x.capacidad), env0 = sumaU((x) => x.envase), pla0 = sumaU((x) => x.plastico), pro0 = sumaU((x) => x.producto);
    fila(f, ["Total", ...(["D", "E", "F", "G", "H"] as const).map((L, i) => fx(`SUM(${L}${k1}:${L}${k2})`, [cap0, env0, pla0, pro0, sumaU(libresDe)][i])),
      fx(`IF(D${f}=0,"",SUMIFS(${ru(9)},${ru(5)},">0")/D${f})`, cap0 ? us.filter((x) => x.capacidad).reduce((a2, x) => a2 + x.estibas, 0) / cap0 : "")], "total", [, NUM, NUM, NUM, NUM, NUM, "0%"]);

    /* LOS RECORRIDOS QUE ENTRAN, y el cuadre: lo que sumaban contra lo
       que quedó en la base (la diferencia es lo que se volvió a contar). */
    f += 1; alto(f, 13.5);
    f += 1; alto(f, 19.5); pon(f, 2, "Recorridos que entran en la base", letra(11, TINTA, true));
    f += 1; fila(f, ["Recorrido", "Contó", "Enviado", "Renglones", "Ubicaciones", "Cajas", ""], "cabeza");
    for (const c of [3, 4]) h.getCell(f, c + 1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    const r1 = f + 1;
    for (const c of d.conteos) {
      f += 1;
      const env = c.enviado_en ? new Date(c.enviado_en) : null;
      fila(f, [c.codigo, c.responsable ?? "—", env ? env.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }).replace(",", "") : "—",
        c.renglones, c.ubicaciones, Number(c.total_cajas), ""], "dato", [, , , NUM, NUM, NUM]);
      for (const k of [4, 5]) h.getCell(f, k).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    }
    const r2 = f, cajasRec = d.conteos.reduce((a, c) => a + Number(c.total_cajas), 0);
    f += 1;
    fila(f, ["Total", undefined, undefined,
      { formula: `SUM(F${r1}:F${r2})`, result: d.conteos.reduce((a, c) => a + c.renglones, 0) },
      { formula: `SUM(G${r1}:G${r2})`, result: d.conteos.reduce((a, c) => a + c.ubicaciones, 0) },
      { formula: `SUM(H${r1}:H${r2})`, result: cajasRec }, undefined], "total", [, , , NUM, NUM, NUM]);
    const filaRec = f;
    f += 1; alto(f, 21.75);
    unir(f, 2, 3); pon(f, 2, "Cuadre de cajas", letra(9, GRIS, true), { alignment: { vertical: "middle", indent: 1 } });
    /* EL CUADRE VA CONTRA «LO CONTADO», NO CONTRA EL RIESGO. Los
       recorridos traen todo lo que se caminó; la tabla de riesgo, solo
       producto. Restarle el riesgo a los recorridos daba, en un día con
       envase, una diferencia inventada del tamaño del envase. Por eso la
       fórmula apunta a la tarjeta CAJAS de «LO CONTADO» (B13), que es la
       misma foto que los recorridos. */
    unir(f, 4, 7); pon(f, 4, `${cajasRec.toLocaleString("es-CO")} en los recorridos  −  ${inventario.cajas.toLocaleString("es-CO")} en el consolidado (lo que se volvió a contar)`, letra(9, GRIS), { alignment: { vertical: "middle", wrapText: true } });
    const dif = cajasRec - inventario.cajas;
    pon(f, 8, { formula: `H${filaRec}-B13`, result: dif }, letra(10, dif ? ROJO : VERDE, true), { numFmt: NUM, alignment: { horizontal: "right", vertical: "middle", indent: 1 } });

    /* EL AVISO: rojo con vínculo a «Validar», o verde si no hay nada. */
    f += 1; alto(f, 12);
    f += 1; alto(f, 27.75); unir(f, 2, 9); pintar(f, 2, 9, graves ? ROSA : MENTA);
    pon(f, 2, graves ? vinculo("Validar", `  ⚠  ${graves} ${graves === 1 ? "renglón" : "renglones"} por validar  →  abrir la hoja Validar`) : "  ✓  Nada grave por validar",
      letra(10, graves ? ROJO : VERDE, true, false), { alignment: { vertical: "middle" }, border: { left: { style: "thick", color: { argb: graves ? ROJO : VERDE } } } });
    if (graves) h.getCell(f, 2).font = { ...letra(10, ROJO, true), underline: true };
    f += 1; alto(f, 43); unir(f, 2, 9);
    pon(f, 2, "La base toma, de cada ubicación y zona (RETORNO, BAJA, LAVADO…), el ÚLTIMO recorrido que pasó por ella: una calle caminada dos veces no se suma dos veces, pero contar el producto de un módulo no borra el envase que otro contó en su zona. El detalle está en las hojas Base consolidada, Base envase, Base producto, Análisis, Por material, Por ubicación, Sin contar y Maestro (de donde la base toma el factor de estibado). Solo cuenta lo ya ENVIADO (los borradores, que alguien está contando ahora, no entran). La hoja Base consolidada trae los mismos renglones que «La base» de la pantalla, sin recortar; casi todas sus cifras son fórmulas, para que se vea de dónde salen. Las horas son de Colombia.",
      letra(8, GRIS, false, true), { alignment: { wrapText: true, vertical: "top" } });
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true };
    h.pageSetup.printArea = `A1:J${f}`;
  }

  /* ================= 2 · BASE CONSOLIDADA =================
     Los datos que salen de la aplicación (recorrido, ubicación, estibas
     completas, saldo, fechas…) van como valores; todo lo demás es fórmula:
     clase, cajas por estiba (de «Maestro»), total cajas, estibas físicas,
     cajas plásticas, unidades y hectolitros. */
  const M = (c: string) => `Maestro!$${c}$7:$${c}$${finM}`;
  const buscar = (colM: string, n: number) => `IFERROR(INDEX(${M(colM)},MATCH($${LB("cod")}${n},${M("A")},0)),0)`;
  const formulaB = (k: string, n: number): string | null => {
    const c = (x: string) => `${LB(x)}${n}`;
    switch (k) {
      case "clase": return `IF(${c("tipo")}="PRODUCTO","Producto",IF(ISNUMBER(SEARCH("CAJA PL",${c("mat")})),"Plástico",IF(OR(ISNUMBER(SEARCH("BARRIL",${c("mat")})),ISNUMBER(SEARCH("ESTIBA",${c("mat")}))),"Otro envase","Envase")))`;
      case "factor": return buscar("D", n);
      case "cajas": return `${c("estibas")}*${c("factor")}+${c("saldo")}`;
      case "fisicas": return `${c("estibas")}+IF(${c("saldo")}>0,1,0)`;
      case "plast": return `IF(OR(${c("clase")}="Envase",${c("clase")}="Plástico"),${c("cajas")},0)`;
      case "uxc": return buscar("E", n);
      case "unid": return `${c("cajas")}*${c("uxc")}`;
      case "hl": return `${c("unid")}*${buscar("F", n)}`;
      default: return null;
    }
  };
  const SUMAS_B = ["estibas", "saldo", "cajas", "fisicas", "plast", "unid", "hl"];
  {
    const h = wb.addWorksheet("Base consolidada", { properties: { tabColor: { argb: TINTA } } });
    h.columns = CB.map((c) => ({ width: c.w }));
    cabecera(h, "Base consolidada del día", `${base.length.toLocaleString("es-CO")} renglones: los mismos que «La base» de la pantalla para este período  ·  ${sub}`, CB.length);
    const nums = CB.map((c, i) => (c.num ? i + 1 : 0)).filter(Boolean);
    encabezado(h, 6, CB.map((c) => c.t), nums);
    const fmts = Object.fromEntries(CB.map((c, i) => [i + 1, c.fmt]).filter(([, f]) => f));
    base.forEach((l, i) => {
      const n = 7 + i, r = h.getRow(n);
      CB.forEach((c, ci) => {
        const f = formulaB(c.k, n), v = planos[i][c.k];
        r.getCell(ci + 1).value = f ? { formula: f, result: v as number | string } : v;
      });
      filaDatos(r, CB.length, i % 2 === 1, fmts as Record<number, string>, nums);
      r.getCell(K.cod).font = letra(9.5, TINTA, true);
      r.getCell(K.cajas).font = letra(9.5, TINTA, true);
      if (l.tipo_material !== "ENVASE") pintarFranja(r.getCell(K.franja), franja(l));
      if ((l.dias_para_salir ?? 0) < 0) r.getCell(K.dsal).font = letra(9.5, ROJO, true);
    });
    totales(h, fin + 1, 7, fin, SUMAS_B.map((k) => K[k]), CB.length, "TOTAL (lo filtrado)", { [K.hl]: "#,##0.00" });
    h.autoFilter = `A6:${col(CB.length)}${fin}`;
    h.views = [{ state: "frozen", xSplit: 9, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
    /* Los nombres con que se arma una tabla dinámica en dos clics:
       Insertar › Tabla dinámica › escribir el nombre. */
    wb.definedNames.add(`${BC}!$A$6:$${col(CB.length)}$${fin}`, "BaseConsolidada");
  }

  /* ================= 2b · BASE ENVASE y BASE PRODUCTO =================
     Los mismos renglones de «Base consolidada», apartados por clase. Cada
     celda es una referencia a la fila de origen: tocas la base y estas
     hojas siguen. Cada una trae solo las columnas que le sirven. */
  const derivada = (nombre: string, titulo: string, tab: string, quien: (x: Fila) => boolean, keys: string[], nombreRango: string) => {
    const idx = filas.map((x, i) => (quien(x) ? i : -1)).filter((i) => i >= 0);
    const h = wb.addWorksheet(nombre, { properties: { tabColor: { argb: tab } } });
    const cs = keys.map((k) => CB[K[k] - 1]);
    h.columns = cs.map((c) => ({ width: c.w }));
    cabecera(h, titulo, `${idx.length.toLocaleString("es-CO")} renglones, tomados de «Base consolidada» (cada celda apunta a su fila)  ·  ${sub}`, cs.length);
    const nums = cs.map((c, i) => (c.num ? i + 1 : 0)).filter(Boolean);
    encabezado(h, 6, cs.map((c) => c.t), nums);
    const fmts = Object.fromEntries(cs.map((c, i) => [i + 1, c.fmt]).filter(([, f]) => f)) as Record<number, string>;
    idx.forEach((bi, i) => {
      const r = h.getRow(7 + i), orig = 7 + bi;
      keys.forEach((k, ci) => {
        const ref = `${BC}!${LB(k)}${orig}`, v = planos[bi][k];
        r.getCell(ci + 1).value = { formula: `IF(${ref}="","",${ref})`, result: (v ?? "") as number | string };
      });
      filaDatos(r, cs.length, i % 2 === 1, fmts, nums);
      r.getCell(keys.indexOf("cod") + 1).font = letra(9.5, TINTA, true);
      r.getCell(keys.indexOf("cajas") + 1).font = letra(9.5, TINTA, true);
      const fi = keys.indexOf("franja");
      if (fi >= 0) pintarFranja(r.getCell(fi + 1), franja(filas[bi].l));
      const di = keys.indexOf("dsal");
      if (di >= 0 && (filas[bi].l.dias_para_salir ?? 0) < 0) r.getCell(di + 1).font = letra(9.5, ROJO, true);
    });
    const fn = 6 + Math.max(idx.length, 1);
    totales(h, fn + 1, 7, fn, SUMAS_B.filter((k) => keys.includes(k)).map((k) => keys.indexOf(k) + 1), cs.length, "TOTAL (lo filtrado)", { [keys.indexOf("hl") + 1]: "#,##0.00" });
    h.autoFilter = `A6:${col(cs.length)}${fn}`;
    h.views = [{ state: "frozen", xSplit: 9, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
    wb.definedNames.add(`'${nombre}'!$A$6:$${col(cs.length)}$${fn}`, nombreRango);
  };
  const comunes = ["rec", "conto", "cuando", "calle", "modulo", "lado", "ubic", "cod", "mat", "tipo", "fam", "clase", "estibas", "saldo", "factor", "cajas", "fisicas"];
  derivada("Base envase", "Base de envase", "FF8A6A00", (x) => x.clase !== "Producto",
    [...comunes, "plast", "uxc", "unid", "estenv", "averia", "pnc", "nota", "hl"], "BaseEnvase");
  derivada("Base producto", "Base de producto", "FF1F7A45", (x) => x.clase === "Producto",
    [...comunes, "uxc", "unid", "fab", "venc", "dvenc", "dsal", "franja", "rota", "averia", "pnc", "nota", "hl"], "BaseProducto");

  /* ================= 2c · ANÁLISIS: LAS TABLAS DINÁMICAS CON FÓRMULAS =================
     «Quiero que esa base me sirva para muchísimos análisis.» Una tabla
     dinámica de verdad hay que armarla en Excel (Insertar › Tabla
     dinámica › BaseConsolidada); estas son cruces ya armados con SUMIFS
     que se recalculan solos: cambia la medida en la celda de arriba y
     todas las tablas siguen. */
  {
    const h = wb.addWorksheet("Análisis", { properties: { tabColor: { argb: "FF7A4FA0" } } });
    h.columns = [30, 14, 14, 14, 14, 14, 14, 14].map((w) => ({ width: w }));
    cabecera(h, "Análisis · cruces con fórmula", `Cambia la medida y todas las tablas se recalculan · ${sub}`, 8);
    const medidaRango = `INDEX(${BC}!$A$7:$${col(CB.length)}$${fin},0,MATCH($B$7,${BC}!$A$6:$${col(CB.length)}$6,0))`;
    const lab = h.getCell(7, 1); lab.value = "MEDIDA"; lab.font = letra(9, GRIS, true); lab.alignment = { vertical: "middle", indent: 1 };
    const sel = h.getCell(7, 2); sel.value = "Total cajas"; sel.font = letra(11, TINTA, true); sel.fill = relleno(FR.quince.fondo);
    sel.border = { top: raya(), bottom: raya(), left: raya(), right: raya() };
    sel.dataValidation = { type: "list", allowBlank: false, formulae: [`"${MEDIDAS.map((m) => m.t).join(",")}"`] };
    h.mergeCells(7, 2, 7, 3);
    const nota = h.getCell(7, 4); nota.value = "◄ escoge: estibas físicas, total cajas, cajas plásticas, unidades u hectolitros"; nota.font = letra(8.5, GRIS, false, true);
    h.getRow(7).height = 24;
    const medida = MEDIDAS.find((m) => m.t === "Total cajas")!.k;
    let f = 8;
    /* Un cruce: filas = valores de una columna de la base; columnas = las clases (o una sola). */
    const cruce = (titulo: string, dim: string, etiquetas: string[], clases: Clase[], porColumna?: (x: Fila) => string, solo?: Clase) => {
      if (!etiquetas.length) return;          // nada que cruzar: sin tabla vacía
      f += 2; h.getRow(f).height = 20;
      const t = h.getCell(f, 1); t.value = titulo; t.font = letra(11, TINTA, true);
      f += 1; const hd = f;
      const cab = [dim, ...clases, ...(clases.length > 1 ? ["Total"] : [])];
      cab.forEach((x, i) => { const c = h.getCell(hd, i + 1); c.value = x; c.font = letra(9, TINTA, true); c.fill = relleno(CABEZA); c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right", indent: 1 } });
      h.getRow(hd).height = 21;
      const a = f + 1;
      const dimK = porColumna;
      for (const e of etiquetas) {
        f += 1;
        const r = h.getRow(f); r.height = 18;
        r.getCell(1).value = e; r.getCell(1).font = letra(9.5, TINTA, true);
        clases.forEach((cl, i) => {
          const v = filas.filter((x) => dimK!(x) === e && x.clase === cl).reduce((s2, x) => s2 + Number(x[medida]), 0);
          r.getCell(i + 2).value = { formula: `SUMIFS(${medidaRango},${rb(dim === "Franja" ? "franja" : dimKey[dim])},$A${f},${rb("clase")},${col(i + 2)}$${hd})`, result: v };
        });
        if (clases.length > 1) { const L = col(clases.length + 1); r.getCell(clases.length + 2).value = { formula: `SUM(B${f}:${L}${f})`, result: filas.filter((x) => dimK!(x) === e).reduce((s2, x) => s2 + Number(x[medida]), 0) } }
        for (let c = 1; c <= cab.length; c++) { const cel = r.getCell(c); cel.border = { bottom: raya() }; if (c > 1) { cel.numFmt = "#,##0.##;\\-#,##0.##;\\–"; cel.alignment = { horizontal: "right", indent: 1 } } else cel.alignment = { indent: 1 }; if (c === 1) cel.font = letra(9.5, TINTA, true); else cel.font = letra(9.5, TINTA, c === cab.length && clases.length > 1) }
      }
      const b = f; f += 1;
      const tr = h.getRow(f); tr.height = 20;
      tr.getCell(1).value = "Total";
      for (let c = 2; c <= cab.length; c++) {
        const L = col(c), v = filas.filter((x) => (!solo || x.clase === solo) && etiquetas.includes(dimK!(x)) && (c > clases.length + 1 || x.clase === clases[c - 2])).reduce((s2, x) => s2 + Number(x[medida]), 0);
        tr.getCell(c).value = { formula: `SUM(${L}${a}:${L}${b})`, result: v };
      }
      for (let c = 1; c <= cab.length; c++) { const cel = tr.getCell(c); cel.fill = relleno(FONDO); cel.border = { top: { style: "medium", color: { argb: TINTA } } }; cel.font = letra(9.5, TINTA, true); if (c > 1) { cel.numFmt = "#,##0.##;\\-#,##0.##;\\–"; cel.alignment = { horizontal: "right", indent: 1 } } else cel.alignment = { indent: 1 } }
    };
    const dimKey: Record<string, string> = { Calle: "calle", Familia: "fam", Contó: "conto", Recorrido: "rec", "Estado envase": "estenv", Franja: "franja" };
    const unicos = (g: (x: Fila) => string) => [...new Set(filas.map(g))].sort(natural);
    const todas: Clase[] = ["Producto", "Envase", "Plástico", "Otro envase"];
    cruce("Por calle y clase", "Calle", unicos((x) => x.l.calle ?? ""), todas, (x) => x.l.calle ?? "");
    cruce("Por familia y clase", "Familia", unicos((x) => x.l.familia ?? "Sin familia"), todas, (x) => x.l.familia ?? "Sin familia");
    cruce("Por quién contó y clase", "Contó", unicos((x) => x.l.conto ?? ""), todas, (x) => x.l.conto ?? "");
    cruce("Por recorrido y clase", "Recorrido", unicos((x) => x.l.conteo), todas, (x) => x.l.conteo);
    cruce("Envase por estado (retorno, lavado…)", "Estado envase", unicos((x) => x.clase === "Producto" ? "" : (x.l.estado_envase ?? "")).filter((e) => e !== ""), ["Envase", "Plástico", "Otro envase"], (x) => x.l.estado_envase ?? "", undefined);
    cruce("Producto por franja de vencimiento", "Franja", FRANJAS.map((x) => x.rot), ["Producto"], (x) => rotFr(franja(x.l)), "Producto");
    h.views = [{ showGridLines: false, state: "frozen", ySplit: 7 }];
  }

  /* ================= 3 · POR MATERIAL ================= */
  {
    const h = wb.addWorksheet("Por material", { properties: { tabColor: { argb: VERDE } } });
    const C = ["Código", "Material", "Tipo", "Clase", "Familia", "Ubicaciones", "Estibas físicas", "Cajas", "Unidades", "Vence primero", "Días p/salir", "Franja", "En riesgo (cajas)", "Hectolitros"];
    h.columns = [10, 36, 11, 12, 14, 12, 11, 11, 12, 13, 11, 20, 14, 13].map((w) => ({ width: w }));
    cabecera(h, "Por material", `${sub}  ·  las cifras son fórmulas sobre «Base consolidada»`, C.length);
    encabezado(h, 6, C, [6, 7, 8, 9, 11, 13, 14]);
    /* TODO LO CONTADO, envase incluido: esta hoja es el inventario del
       día, no el riesgo. El envase sale con su tipo y su franja «Sin
       fecha», que es exactamente lo que es. */
    const mats = [...inventario.materiales].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
    mats.forEach((m, i) => {
      const n = 7 + i, r = h.getRow(n);
      const delCodigo = filas.filter((x) => x.l.codigo === m.codigo), sm = (k: keyof Fila) => delCodigo.reduce((a, x) => a + Number(x[k]), 0);
      const crit = `${rb("cod")},$A${n}`;
      r.values = [m.codigo, m.nombre, matPorSku.get(m.codigo)?.tipo_material ?? "",
        fx(`IFERROR(INDEX(${rb("clase")},MATCH($A${n},${rb("cod")},0)),"")`, delCodigo[0]?.clase ?? ""), m.familia ?? "",
        fx(`COUNTIFS(${crit})`, delCodigo.length), fx(`SUMIFS(${rb("fisicas")},${crit})`, sm("fisicas")), fx(`SUMIFS(${rb("cajas")},${crit})`, sm("cajas")),
        fx(`SUMIFS(${rb("unid")},${crit})`, sm("unid")), aFecha(m.vence), m.diasSalir, rotFr(m.franja), m.enRiesgoCajas, fx(`SUMIFS(${rb("hl")},${crit})`, sm("hl"))];
      filaDatos(r, C.length, i % 2 === 1, { 6: "#,##0", 7: "#,##0", 8: "#,##0", 9: "#,##0", 10: "dd/mm/yyyy", 11: "0", 13: "#,##0", 14: "#,##0.00" }, [6, 7, 8, 9, 11, 13, 14]);
      r.getCell(1).font = letra(9.5, TINTA, true);
      pintarFranja(r.getCell(12), m.franja);
    });
    const fm = 6 + Math.max(mats.length, 1);
    totales(h, fm + 1, 7, fm, [6, 7, 8, 9, 13, 14], C.length, "TOTAL (lo filtrado)", { 14: "#,##0.00" });
    h.autoFilter = `A6:${col(C.length)}${fm}`;
    h.views = [{ state: "frozen", xSplit: 2, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
  }

  /* ================= 4 · POR UBICACIÓN =================
     Cada puesto de un módulo es una estiba: aquí se ve, módulo por
     módulo, cuántas caben, cuántas tienen envase, plástico o producto y
     cuántas están libres. */
  {
    const h = wb.addWorksheet("Por ubicación", { properties: { tabColor: { argb: "FF2E6DA4" } } });
    const C = ["Ubicación", "Calle", "Módulo", "Lado", "Capacidad (estibas)", "Con envase", "Con plástico", "Con producto", "Estibas ocupadas", "Libres", "Ocupación", "Cajas", "Materiales", "Renglones"];
    h.columns = [16, 8, 9, 8, 12, 10, 10, 10, 11, 9, 11, 11, 11, 11].map((w) => ({ width: w }));
    cabecera(h, "Por ubicación", `${sub}  ·  estibas = puestos ocupados en el módulo; las cifras son fórmulas sobre «Base consolidada»`, C.length);
    encabezado(h, 6, C, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    us.forEach((x, i) => {
      const n = 7 + i, r = h.getRow(n);
      const occ = x.capacidad ? x.estibas / x.capacidad : "";
      const sf = (cl: string) => `SUMIFS(${rb("fisicas")},${rb("ubic")},$A${n},${rb("clase")},"${cl}")`;
      r.values = [x.ubicacion, x.calle ?? "", x.modulo ?? "", x.lado ?? "", x.capacidad,
        fx(`${sf("Envase")}+${sf("Otro envase")}`, x.envase), fx(sf("Plástico"), x.plastico), fx(sf("Producto"), x.producto),
        fx(`SUM(F${n}:H${n})`, x.estibas), fx(`IF(N(E${n})=0,"",MAX(0,E${n}-I${n}))`, libresDe(x) ?? ""), fx(`IF(N(E${n})=0,"",I${n}/E${n})`, occ),
        fx(`SUMIFS(${rb("cajas")},${rb("ubic")},$A${n})`, x.cajas), x.materiales.size, fx(`COUNTIFS(${rb("ubic")},$A${n})`, x.renglones)];
      filaDatos(r, C.length, i % 2 === 1, { 5: "#,##0", 6: "#,##0", 7: "#,##0", 8: "#,##0", 9: "#,##0", 10: "#,##0", 11: "0%", 12: "#,##0", 13: "0", 14: "0" }, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      r.getCell(1).font = letra(9.5, TINTA, true);
      if (typeof occ === "number" && occ > 1) { r.getCell(11).fill = relleno(FR.pasado.fondo); r.getCell(11).font = letra(9.5, FR.pasado.tinta, true) }
    });
    totales(h, finU + 1, 7, finU, [5, 6, 7, 8, 9, 10, 12, 14], C.length);
    h.autoFilter = `A6:${col(C.length)}${finU}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* ================= 5 · VALIDAR ================= */
  {
    const h = wb.addWorksheet("Validar", { properties: { tabColor: { argb: ROJO } } });
    const C = ["Qué", "Grave", "Ubicación", "Código", "Material", "Detalle", "Recorrido", "Revisado ✓"];
    h.columns = [22, 8, 14, 10, 32, 60, 14, 12].map((w) => ({ width: w }));
    cabecera(h, "Para validar", `${graves} grave(s) · ${ojos.length - graves} para mirar · ${sub}`, C.length);
    encabezado(h, 6, C);
    const orden2 = [...ojos].sort((a, b) => Number(b.grave) - Number(a.grave) || a.tipo.localeCompare(b.tipo) || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
    orden2.forEach((o, i) => {
      const r = h.getRow(7 + i);
      r.values = [o.tipo, o.grave ? "Sí" : "", o.ubicacion, o.codigo, o.material, o.detalle, o.recorrido, ""];
      filaDatos(r, C.length, i % 2 === 1, {});
      r.getCell(6).alignment = { wrapText: true, vertical: "middle" };
      if (o.detalle.length > 70) r.height = 32;
      if (o.grave) { r.getCell(1).font = letra(9.5, ROJO, true); r.getCell(2).font = letra(9.5, ROJO, true) }
      r.getCell(8).dataValidation = { type: "list", allowBlank: true, formulae: ['"✓,Pendiente"'] };
    });
    if (!orden2.length) { const c = h.getCell(7, 1); c.value = "✓ Nada para validar: la base del día está limpia."; c.font = letra(10, VERDE, true) }
    const fin = 6 + Math.max(orden2.length, 1);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* ================= 6 · SIN CONTAR ================= */
  {
    const h = wb.addWorksheet("Sin contar", { properties: { tabColor: { argb: GRIS } } });
    const C = ["Ubicación", "Calle", "Módulo", "Lado", "Familia", "Capacidad"];
    h.columns = [14, 8, 9, 8, 18, 12].map((w) => ({ width: w }));
    cabecera(h, "Sin contar ese día", `${sinContar.length} de ${activas} posiciones activas · ${sub}`, C.length);
    encabezado(h, 6, C, [6]);
    sinContar.forEach((u, i) => {
      const r = h.getRow(7 + i);
      r.values = [u.clave, u.calle, u.modulo, u.lado ?? "", u.familia ?? "", u.capacidad];
      filaDatos(r, C.length, i % 2 === 1, { 6: "#,##0" }, [6]);
    });
    const fin = 6 + Math.max(sinContar.length, 1);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* ================= MAESTRO · lo que la base consulta =================
     Por cada código de la base: cuántas cajas lleva una estiba, cuántas
     unidades lleva una caja y cuántos hectolitros es una unidad. «Base
     consolidada» lo busca aquí con BUSCAR: si un factor está mal, se
     corrige en esta hoja y todo el libro se recalcula. */
  {
    const h = wb.addWorksheet("Maestro", { properties: { tabColor: { argb: GRIS } } });
    const C = ["Código", "Material", "Tipo", "Cajas por estiba", "Unidades por caja", "Hectolitros por unidad"];
    h.columns = [10, 40, 11, 14, 14, 16].map((w) => ({ width: w }));
    cabecera(h, "Maestro de la base", `${codigosBase.length} códigos · de aquí leen «Base consolidada» el factor de estibado, las unidades por caja y los hectolitros  ·  ${sub}`, C.length);
    encabezado(h, 6, C, [4, 5, 6]);
    codigosBase.forEach((cod, i) => {
      const l = base.find((x) => x.codigo === cod)!, r = h.getRow(7 + i);
      r.values = [cod, l.material, l.tipo_material, factorDe.get(cod) ?? 0, Number(uxc[cod] ?? 0), Number(hlu[cod] ?? 0)];
      filaDatos(r, C.length, i % 2 === 1, { 4: "#,##0", 5: "#,##0", 6: "0.0000" }, [4, 5, 6]);
      r.getCell(1).font = letra(9.5, TINTA, true);
      for (const c of [4, 5, 6]) r.getCell(c).fill = relleno(FR.quince.fondo);   // lo que se puede corregir
    });
    h.autoFilter = `A6:${col(C.length)}${finM}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* ================= 7 · EVIDENCIAS (solo si hay fotos) =================
     LA FOTO VA EN SU PROPIA HOJA, no en «Base»: así el libro de siempre no
     se mueve ni se ensancha, y quien no usa la cámara no ve nada nuevo.
     Cada foto trae al lado el renglón al que respalda. */
  const evid = (d.evidencias ?? []).filter((e) => e.foto?.byteLength);
  if (evid.length) {
    const porLinea = new Map(d.lineas.map((l) => [l.id, l]));
    const h = wb.addWorksheet("Evidencias", { properties: { tabColor: { argb: ROJO } } });
    const C = ["Recorrido", "Ubicación", "Código", "Material", "Total cajas", "Estado envase", "Marca", "Nota", "Foto tomada", "Foto"];
    h.columns = [12, 14, 10, 30, 11, 14, 10, 30, 16, 40].map((w) => ({ width: w }));
    cabecera(h, "Evidencias del conteo", `${evid.length} foto${evid.length === 1 ? "" : "s"}${d.fotosRecortadas ? ` (otras ${d.fotosRecortadas} no entraron: exporta por días para verlas)` : ""} · ${sub}`, C.length);
    encabezado(h, 6, C, [5]);
    const ordenadas = evid
      .map((e) => ({ e, l: porLinea.get(e.linea_id) }))
      .sort((a, b) => (a.l && b.l ? orden(a.l, b.l) : a.l ? -1 : b.l ? 1 : 0));
    ordenadas.forEach(({ e, l }, i) => {
      const r = h.getRow(7 + i);
      r.values = [l?.conteo ?? "", l ? ub(l) : "(renglón que ya no está)", l?.codigo ?? "", l?.material ?? "", l ? Number(l.total_cajas) : null,
        l?.estado_envase ?? "", l ? (l.averia ? "Avería" : l.pnc ? "PNC" : "") : "", l?.nota ?? "", aFecha(e.tomada_en), ""];
      filaDatos(r, C.length, i % 2 === 1, { 5: "#,##0", 9: "dd/mm/yy hh:mm" }, [5]);
      r.height = 170;                       // alto de la foto
      for (let c = 1; c <= C.length; c++) r.getCell(c).alignment = { vertical: "top", horizontal: c === 5 ? "right" : "left", indent: 1, wrapText: true };
      r.getCell(3).font = letra(9.5, TINTA, true);
      /* La foto, a su tamaño y sin deformarla, dentro de la celda (cabe en
         250 × 215 px; la columna mide ~285 px y la fila ~227 px). */
      const aw = e.ancho && e.alto ? e.ancho : 4, ah = e.ancho && e.alto ? e.alto : 3;
      const k = Math.min(250 / aw, 215 / ah);
      const id = wb.addImage({ buffer: e.foto as unknown as BufferDeExcel, extension: "jpeg" });
      h.addImage(id, { tl: { col: C.length - 1 + 0.04, row: 6 + i + 0.03 } as ExcelJS.Anchor, ext: { width: Math.round(aw * k), height: Math.round(ah * k) }, editAs: "oneCell" });
    });
    h.autoFilter = `A6:${col(C.length)}${6 + ordenadas.length}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* Cada hoja cabe a lo ancho de la página al imprimir. */
  for (const h of wb.worksheets) h.pageSetup = { ...h.pageSetup, fitToPage: true, fitToWidth: 1, fitToHeight: h.name === "Resumen" ? 1 : 0,
    orientation: h.name === "Resumen" ? "portrait" : "landscape", margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  /* Una sola letra en todo el libro: Calibri. */
  for (const h of wb.worksheets) h.eachRow((r) => r.eachCell((c) => { c.font = { name: "Calibri", ...(c.font ?? {}) } }));
  const crudo = Buffer.from(await wb.xlsx.writeBuffer());
  return remendarFiltros(crudo, wb);
}

/**
 * LOS FILTROS, UNO POR HOJA. exceljs escribe el nombre _FilterDatabase de
 * cada hoja sin su ámbito, y con más de una hoja filtrada Excel dice
 * «encontramos un problema con parte del contenido» (lo mismo que se
 * arregló en el libro del sider). Se reescribe ese pedazo del XML.
 */
function remendarFiltros(zip: Buffer, wb: ExcelJS.Workbook): Buffer {
  try {
    const partes = unzipSync(new Uint8Array(zip));
    let xml = new TextDecoder().decode(partes["xl/workbook.xml"]);
    const trozos: string[] = [];
    wb.worksheets.forEach((h, i) => {
      if (typeof h.autoFilter !== "string") return;
      const [a, b] = h.autoFilter.split(":");
      const abs = (x: string) => x.replace(/([A-Z]+)(\d+)/, "$$$1$$$2");
      const ref = /[\s()]/.test(h.name) || /[^A-Za-z0-9_]/.test(h.name) ? `'${h.name}'` : h.name;
      trozos.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${ref}!${abs(a)}:${abs(b)}</definedName>`);
    });
    /* Los demás nombres (área de impresión, títulos que se repiten) se
       quedan; solo se cambian los de los filtros. */
    const otros = (xml.match(/<definedNames>([\s\S]*?)<\/definedNames>/)?.[1] ?? "")
      .replace(/<definedName[^>]*name="_xlnm\._FilterDatabase"[^>]*>[\s\S]*?<\/definedName>/g, "");
    const bloque = trozos.length || otros ? `<definedNames>${trozos.join("")}${otros}</definedNames>` : "";
    xml = xml.includes("<definedNames>")
      ? xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, bloque)
      : xml.replace("</sheets>", `</sheets>${bloque}`);
    partes["xl/workbook.xml"] = new TextEncoder().encode(xml);
    return Buffer.from(zipSync(partes));
  } catch {
    return zip;
  }
}
