/**
 * EL CONSOLIDADO DEL DÍA EN EXCEL — inventario.
 *
 * «Consolidar los inventarios del día en una base y exportar la data,
 * espectacular, con el logo, como lo del sider: un Excel donde yo pueda
 * validar todo.»
 *
 * UNA BASE, NO LA SUMA DE LOS RECORRIDOS. Si la misma persona caminó la
 * calle A dos veces, vale su último recorrido en cada ubicación; si la
 * contaron personas distintas, se suman (la misma regla del tablero,
 * medirRiesgo → cruzar). Los renglones que quedaron
 * reemplazados no se pierden: salen en «Validar», para ver qué cambió.
 *
 * Seis hojas:
 *   Tablero          la hoja de gerencia: logo, avance, ocupación, donas,
 *                    clases, calles, riesgo, recorridos y focos de atención.
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
import { armarTablero, inyectarDonas } from "./libro-tablero";
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
  if (s.length === 10) return new Date(s + "T00:00:00Z");
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t - UTC_COLOMBIA_MS);
};
/* Un DÍA (fabricación, vencimiento…): fecha entera, sin horas, para que Excel la reconozca como fecha y no como texto
   ni como fecha-con-hora. Si llega con hora (AAAA-MM-DDTHH…), se toma solo el día que trae. */
const aDia = (s: string | null) => (s ? aFecha(s.slice(0, 10)) : null);
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
  const v = h.getCell(5, 1); v.value = vinculo("Tablero", "← volver al tablero"); v.font = letra(9.5, ENLACE, true);
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
     «Conteo consolidado» (y esta, sobre «Maestro»): aquí se calcula también
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
  type Clase = "Producto" | "Envase" | "Libre" | "Otro envase";
  const CLASES: Clase[] = ["Producto", "Envase", "Libre", "Otro envase"];
  const esCajaPlastica = (l: Renglon) => /CAJA PL/i.test(l.material);
  const claseDe = (l: Renglon): Clase =>
    l.tipo_material !== "ENVASE" ? "Producto" : esCajaPlastica(l) ? "Libre" : /BARRIL|ESTIBA/i.test(l.material) ? "Otro envase" : "Envase";
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
    return { l, clase, estibas, saldo, factor, cajas, fisicas: estibas + (saldo > 0 ? 1 : 0), plast: clase === "Otro envase" ? 0 : cajas,
      uxc: u, unid: cajas * u, hl: cajas * u * Number(hlu[l.codigo] ?? 0) };
  });
  const codigosBase = [...new Set(base.map((l) => l.codigo))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const finM = 6 + Math.max(codigosBase.length, 1);
  const fin = 6 + Math.max(base.length, 1);      // última fila de «Conteo consolidado»
  const BC = "'Conteo consolidado'";
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
      fisicas: x.fisicas, plast: x.plast, uxc: x.uxc, unid: x.unid, fab: aDia(l.fabricacion), venc: aDia(l.vencimiento), dvenc: l.dias_para_vencer, dsal: l.dias_para_salir,
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
  type UbiX = { ubicacion: string; calle: string | null; modulo: string | null; lado: string | null; capacidad: number | null; estibas: number; envase: number; producto: number; libre: number; cajas: number; renglones: number; materiales: Set<string> };
  const porUbi = new Map<string, UbiX>();
  for (const x0 of filas) {
    const l = x0.l, k = ub(l);
    const x = porUbi.get(k) ?? { ubicacion: k, calle: l.calle, modulo: l.modulo, lado: l.lado, capacidad: l.capacidad, estibas: 0, envase: 0, producto: 0, libre: 0, cajas: 0, renglones: 0, materiales: new Set<string>() };
    x.estibas += x0.fisicas; x.cajas += x0.cajas; x.renglones += 1; x.materiales.add(l.codigo);
    if (x0.clase === "Producto") x.producto += x0.fisicas; else if (x0.clase === "Libre") x.libre += x0.fisicas; else x.envase += x0.fisicas;
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
  const sinUsarDe = (x: UbiX) => (x.capacidad ? Math.max(0, x.capacidad - x.estibas) : null);
  const sumaU = (f: (x: UbiX) => number | null) => us.reduce((a, x) => a + (f(x) ?? 0), 0);
  const fx = (formula: string, result: number | string) => ({ formula, result });

  /* ================= 1 · TABLERO =================
     La hoja de gerencia: el diseño sale de `tablero-plantilla.ts` y lo que
     dice cada celda, de `libro-tablero.ts` (todo fórmulas sobre «Base
     consolidada» y «Por ubicación»). Las donas se meten al final, en el zip. */
  const finV = 6 + Math.max(ojos.length, 1);
  const donas = armarTablero({
    wb, logoId, titulo: `INVENTARIO CONSOLIDADO · ${d.bodega.toUpperCase()}`, sub, bodega: d.bodega.toUpperCase(), activas, contadas: nUbi,
    filas: filas.map((x, i) => ({ clase: x.clase, tipo: x.l.tipo_material, franja: String(planos[i].franja), tieneVenc: !!x.l.vencimiento,
      fisicas: x.fisicas, cajas: x.cajas, plast: x.plast, unid: x.unid, hl: x.hl })),
    us: us.map((x) => ({ calle: x.calle, capacidad: x.capacidad, estibas: x.estibas, envase: x.envase, producto: x.producto, libre: x.libre })),
    recorridos: d.conteos.map((c) => ({ codigo: c.codigo, cajas: Number(c.total_cajas), renglones: c.renglones, ubicaciones: c.ubicaciones,
      enviado: aFecha(c.enviado_en) })),
    graves, rb, ru, rv: `Validar!$B$7:$B$${finV}`, vinculo, clases: CLASES, natural: (a, b) => natural(a, b),
  });


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
      case "clase": return `IF(${c("tipo")}="PRODUCTO","Producto",IF(ISNUMBER(SEARCH("CAJA PL",${c("mat")})),"Libre",IF(OR(ISNUMBER(SEARCH("BARRIL",${c("mat")})),ISNUMBER(SEARCH("ESTIBA",${c("mat")}))),"Otro envase","Envase")))`;
      case "factor": return buscar("D", n);
      case "cajas": return `${c("estibas")}*${c("factor")}+${c("saldo")}`;
      case "fisicas": return `${c("estibas")}+IF(${c("saldo")}>0,1,0)`;
      case "plast": return `IF(${c("clase")}="Otro envase",0,${c("cajas")})`;
      case "uxc": return buscar("E", n);
      case "unid": return `${c("cajas")}*${c("uxc")}`;
      case "hl": return `${c("unid")}*${buscar("F", n)}`;
      default: return null;
    }
  };
  const SUMAS_B = ["estibas", "saldo", "cajas", "fisicas", "plast", "unid", "hl"];
  {
    const h = wb.addWorksheet("Conteo consolidado", { properties: { tabColor: { argb: "FFFF9100" } } });
    h.columns = CB.map((c) => ({ width: c.w }));
    cabecera(h, "Conteo consolidado del día", `${base.length.toLocaleString("es-CO")} renglones: los mismos que «La base» de la pantalla para este período  ·  ${sub}`, CB.length);
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
    wb.definedNames.add(`${BC}!$A$6:$${col(CB.length)}$${fin}`, "ConteoConsolidado");
  }

  /* ================= 2b · BASE ENVASE y BASE PRODUCTO =================
     Los mismos renglones de «Conteo consolidado», apartados por clase. Cada
     celda es una referencia a la fila de origen: tocas la base y estas
     hojas siguen. Cada una trae solo las columnas que le sirven. */
  const derivada = (nombre: string, titulo: string, tab: string, quien: (x: Fila) => boolean, keys: string[], nombreRango: string) => {
    const idx = filas.map((x, i) => (quien(x) ? i : -1)).filter((i) => i >= 0);
    const h = wb.addWorksheet(nombre, { properties: { tabColor: { argb: tab } } });
    const cs = keys.map((k) => CB[K[k] - 1]);
    h.columns = cs.map((c) => ({ width: c.w }));
    cabecera(h, titulo, `${idx.length.toLocaleString("es-CO")} renglones, tomados de «Conteo consolidado» (cada celda apunta a su fila)  ·  ${sub}`, cs.length);
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
  derivada("Conteo envase", "Conteo de envase", "FFFFB000", (x) => x.clase !== "Producto",
    [...comunes, "plast", "uxc", "unid", "estenv", "averia", "pnc", "nota", "hl"], "ConteoEnvase");
  derivada("Conteo producto", "Conteo de producto", "FFFFD000", (x) => x.clase === "Producto",
    [...comunes, "uxc", "unid", "fab", "venc", "dvenc", "dsal", "franja", "rota", "averia", "pnc", "nota", "hl"], "ConteoProducto");

  /* ================= 2c · ANÁLISIS: LAS TABLAS DINÁMICAS CON FÓRMULAS =================
     «Quiero que esa base me sirva para muchísimos análisis.» Una tabla
     dinámica de verdad hay que armarla en Excel (Insertar › Tabla
     dinámica › ConteoConsolidado); estas son cruces ya armados con SUMIFS
     que se recalculan solos: cambia la medida en la celda de arriba y
     todas las tablas siguen. */
  {
    const h = wb.addWorksheet("Análisis", { properties: { tabColor: { argb: "FF475569" } } });
    h.columns = [38, 14, 14, 14, 14, 14, 14, 14, 14, 14, 3, 3, ...Array(12).fill(20)].map((w) => ({ width: w }));
    cabecera(h, "Análisis · cruces con fórmula", `Escoge la medida, las filas y las columnas: la tabla se arma sola · ${sub}`, 10);
    const medidaRango = `INDEX(${BC}!$A$7:$${col(CB.length)}$${fin},0,MATCH($B$7,${BC}!$A$6:$${col(CB.length)}$6,0))`;
    const lab = h.getCell(7, 1); lab.value = "MEDIDA"; lab.font = letra(9, GRIS, true); lab.alignment = { vertical: "middle", indent: 1 };
    const sel = h.getCell(7, 2); sel.value = "Total cajas"; sel.font = letra(11, TINTA, true); sel.fill = relleno(FR.quince.fondo);
    sel.border = { top: raya(), bottom: raya(), left: raya(), right: raya() };
    sel.dataValidation = { type: "list", allowBlank: false, formulae: [`"${MEDIDAS.map((m) => m.t).join(",")}"`] };
    h.mergeCells(7, 2, 7, 3);
    const nota = h.getCell(7, 4); nota.value = "◄ escoge: estibas físicas, total cajas, cajas plásticas, unidades u hectolitros (vale para todas las tablas)"; nota.font = letra(8.5, GRIS, false, true);
    h.getRow(7).height = 24;
    const medida = MEDIDAS.find((m) => m.t === "Total cajas")!.k;
    /* ---------- TU CRUCE: tú escoges qué va en las filas y qué en las columnas ----------
       «Que pueda colocar material, estado y así.» Las listas de valores de cada campo
       (material, estado del envase, franja, calle…) salen de la base y van a la derecha,
       en las columnas M:X escondidas (mostrar columnas para verlas); la tabla lee la lista del campo escogido y suma con SUMIFS. */
    const DIMS: { t: string; k: string; lista: () => string[] }[] = [
      { t: "Material", k: "mat", lista: () => [] }, { t: "Código", k: "cod", lista: () => [] }, { t: "Clase", k: "clase", lista: () => [...CLASES] },
      { t: "Tipo", k: "tipo", lista: () => [] }, { t: "Familia", k: "fam", lista: () => [] }, { t: "Calle", k: "calle", lista: () => [] },
      { t: "Módulo", k: "modulo", lista: () => [] }, { t: "Ubicación", k: "ubic", lista: () => [] }, { t: "Estado envase", k: "estenv", lista: () => [] },
      { t: "Franja", k: "franja", lista: () => FRANJAS.map((x) => x.rot) }, { t: "Recorrido", k: "rec", lista: () => [] }, { t: "Contó", k: "conto", lista: () => [] },
    ];
    const valoresDe = (k: string) => planos.map((p) => String(p[k] ?? "")).filter((v) => v !== "");
    const listas = DIMS.map((dm) => {
      const fija = dm.lista();
      const reales = new Set(valoresDe(dm.k));
      return (fija.length ? fija.filter((v) => reales.has(v)) : [...reales].sort(natural)).slice(0, 400);
    });
    const LISTA_INI = 8, LISTA_FIN = LISTA_INI + 399, C0 = 13;                   // columnas M..X
    const rl = `$${col(C0)}$${LISTA_INI}:$${col(C0 + DIMS.length - 1)}$${LISTA_FIN}`, rn = `$${col(C0)}$7:$${col(C0 + DIMS.length - 1)}$7`;
    const gris9 = { ...letra(8.5, GRIS) };
    h.getCell(6, C0).value = "Listas del selector (salen de la base; no tocar)"; h.getCell(6, C0).font = letra(8.5, GRIS, true, true);
    DIMS.forEach((dm, i) => {
      const c = h.getCell(7, C0 + i); c.value = dm.t; c.font = letra(8.5, GRIS, true);
      listas[i].forEach((v, j) => { const x = h.getCell(LISTA_INI + j, C0 + i); x.value = v; x.font = gris9 });
    });
    for (let c = C0; c < C0 + DIMS.length; c++) h.getColumn(c).hidden = true;      // las listas trabajan escondidas
    const dimRango = (celda: string) => `INDEX(${BC}!$A$7:$${col(CB.length)}$${fin},0,MATCH(${celda},${BC}!$A$6:$${col(CB.length)}$6,0))`;
    const listaDe = (celda: string) => `INDEX(${rl},0,MATCH(${celda},${rn},0))`;
    const selector = (fila: number, rotulo: string, ini: string) => {
      const a = h.getCell(fila, 1); a.value = rotulo; a.font = letra(9, GRIS, true); a.alignment = { vertical: "middle", indent: 1 };
      const b = h.getCell(fila, 2); b.value = ini; b.font = letra(11, TINTA, true); b.fill = relleno(FR.quince.fondo);
      b.border = { top: raya(), bottom: raya(), left: raya(), right: raya() };
      b.dataValidation = { type: "list", allowBlank: false, formulae: [`"${DIMS.map((dm) => dm.t).join(",")}"`] };
      h.mergeCells(fila, 2, fila, 3); h.getRow(fila).height = 24;
    };
    selector(8, "FILAS", "Material"); selector(9, "COLUMNAS", "Clase");
    const nF = h.getCell(8, 4); nF.value = "◄ escoge: material, código, clase, tipo, familia, calle, módulo, ubicación, estado del envase, franja, recorrido o quién contó"; nF.font = letra(8.5, GRIS, false, true);
    const nC = h.getCell(9, 4); nC.value = "◄ lo mismo para las columnas (se muestran hasta 8 valores; la columna Total suma todos)"; nC.font = letra(8.5, GRIS, false, true);
    const FIL = 40, NC = 8;                                                       // filas y columnas de la tabla
    const TT = 11, HD = 12, TOT = 13, FUE = 14, B0 = 15, B1 = B0 + FIL - 1;
    const tt = h.getCell(TT, 1); tt.value = { formula: '"Tu cruce: "&$B$8&" por "&$B$9&" · "&LOWER($B$7)', result: "Tu cruce: Material por Clase · total cajas" }; tt.font = letra(11, TINTA, true); h.getRow(TT).height = 22;
    const dFil = DIMS.find((dm) => dm.t === "Material")!, dCol = DIMS.find((dm) => dm.t === "Clase")!;
    const lFil = listas[DIMS.indexOf(dFil)], lCol = listas[DIMS.indexOf(dCol)];
    const medIni = MEDIDAS.find((m) => m.t === "Total cajas")!.k;
    const cel = (kf: string, vf: string, kc?: string, vc?: string) => planos.reduce((a, p2, i) => a + (String(p2[kf] ?? "") === vf && (kc == null || String(p2[kc!] ?? "") === vc) ? Number(filas[i][medIni]) : 0), 0);
    const totalGlobal = filas.reduce((a, x) => a + Number(x[medIni]), 0);
    const hd = h.getRow(HD); hd.height = 21;
    const cab = (c: number, v: ExcelJS.CellValue) => { const x = h.getCell(HD, c); x.value = v; x.font = letra(9, TINTA, true); x.fill = relleno(CABEZA); x.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "right", indent: 1, wrapText: true } };
    cab(1, { formula: '$B$8', result: "Material" });
    for (let j = 1; j <= NC; j++) cab(j + 1, { formula: `IFERROR(INDEX(${listaDe("$B$9")},${j})&"","")`, result: lCol[j - 1] ?? "" });
    cab(NC + 2, "Total");
    const fmtN = "#,##0;\\-#,##0;\\–";
    /* La fila de total (arriba, como en una dinámica) y la que dice cuánto quedó fuera de la tabla. */
    const filaTot = h.getRow(TOT); filaTot.height = 20;
    filaTot.getCell(1).value = "Total"; 
    for (let j = 1; j <= NC; j++) { const L = col(j + 1);
      filaTot.getCell(j + 1).value = { formula: `IF(${L}$${HD}="","",SUMIFS(${dimRango("$B$7")},${dimRango("$B$9")},${L}$${HD}))`, result: lCol[j - 1] != null ? cel(dCol.k, lCol[j - 1]) : "" } }
    filaTot.getCell(NC + 2).value = { formula: `SUM(${dimRango("$B$7")})`, result: totalGlobal };
    for (let c = 1; c <= NC + 2; c++) { const x = filaTot.getCell(c); x.fill = relleno(FR.quince.fondo); x.border = { top: { style: "medium", color: { argb: TINTA } }, bottom: raya() }; x.font = letra(9.5, TINTA, true); x.numFmt = fmtN; x.alignment = { horizontal: c === 1 ? "left" : "right", indent: 1, vertical: "middle" } }
    const filaFue = h.getRow(FUE); filaFue.height = 16;
    filaFue.getCell(1).value = "Fuera de la tabla (más de 40 filas o sin dato)";
    for (let c = 2; c <= NC + 2; c++) { const L = col(c);
      filaFue.getCell(c).value = { formula: `IF(${L}$${HD}="","",${L}${TOT}-SUM(${L}${B0}:${L}${B1}))`, result: c === NC + 2 ? 0 : (lCol[c - 2] != null ? 0 : "") } }
    for (let c = 1; c <= NC + 2; c++) { const x = filaFue.getCell(c); x.font = letra(8.5, GRIS, false, true); x.numFmt = fmtN; x.alignment = { horizontal: c === 1 ? "left" : "right", indent: 1, vertical: "middle" } }
    for (let i = 0; i < FIL; i++) {
      const r = B0 + i, row = h.getRow(r); row.height = 18;
      row.getCell(1).value = { formula: `IFERROR(INDEX(${listaDe("$B$8")},${i + 1})&"","")`, result: lFil[i] ?? "" };
      for (let j = 1; j <= NC; j++) { const L = col(j + 1);
        row.getCell(j + 1).value = { formula: `IF(OR($A${r}="",${L}$${HD}=""),"",SUMIFS(${dimRango("$B$7")},${dimRango("$B$8")},$A${r},${dimRango("$B$9")},${L}$${HD}))`,
          result: lFil[i] != null && lCol[j - 1] != null ? cel(dFil.k, lFil[i], dCol.k, lCol[j - 1]) : "" } }
      row.getCell(NC + 2).value = { formula: `IF($A${r}="","",SUMIFS(${dimRango("$B$7")},${dimRango("$B$8")},$A${r}))`, result: lFil[i] != null ? cel(dFil.k, lFil[i]) : "" };
      for (let c = 1; c <= NC + 2; c++) { const x = row.getCell(c); x.border = { bottom: raya() }; x.numFmt = fmtN; x.font = letra(9.5, TINTA, c === 1 || c === NC + 2); x.alignment = { horizontal: c === 1 ? "left" : "right", indent: 1, vertical: "middle" }; if (i % 2 === 1) x.fill = relleno(FONDO) }
    }
    /* Con hectolitros las cifras llevan un decimal. */
    h.addConditionalFormatting({ ref: `B${TOT}:${col(NC + 2)}${B1}`, rules: [{ type: "expression", formulae: ['$B$7="Hectolitros"'], priority: 1, style: { numFmt: "#,##0.0;\\-#,##0.0;\\–" } }] });
    let f = B1 + 1;

    /* ---------- UBICACIONES POR ESTADO: el selector y la tabla van en su propia hoja ----------
       «El filtro no iría dentro de la misma tabla.» Aquí solo queda el enlace a la hoja. */
    f += 2;
    { const c = h.getCell(f, 1); c.value = vinculo("Ubicaciones por estado", "► Ubicaciones por estado: escoge BAJA, LAVADO, RETORNO… y ve dónde está cada material"); c.font = letra(10.5, ENLACE, true) }

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
        for (let c = 1; c <= cab.length; c++) { const cel = r.getCell(c); cel.border = { bottom: raya() }; if (c > 1) { cel.numFmt = "#,##0;\\-#,##0;\\–"; cel.alignment = { horizontal: "right", indent: 1 } } else cel.alignment = { indent: 1 }; if (c === 1) cel.font = letra(9.5, TINTA, true); else cel.font = letra(9.5, TINTA, c === cab.length && clases.length > 1) }
      }
      const b = f; f += 1;
      const tr = h.getRow(f); tr.height = 20;
      tr.getCell(1).value = "Total";
      for (let c = 2; c <= cab.length; c++) {
        const L = col(c), v = filas.filter((x) => (!solo || x.clase === solo) && etiquetas.includes(dimK!(x)) && (c > clases.length + 1 || x.clase === clases[c - 2])).reduce((s2, x) => s2 + Number(x[medida]), 0);
        tr.getCell(c).value = { formula: `SUM(${L}${a}:${L}${b})`, result: v };
      }
      for (let c = 1; c <= cab.length; c++) { const cel = tr.getCell(c); cel.fill = relleno(FONDO); cel.border = { top: { style: "medium", color: { argb: TINTA } } }; cel.font = letra(9.5, TINTA, true); if (c > 1) { cel.numFmt = "#,##0;\\-#,##0;\\–"; cel.alignment = { horizontal: "right", indent: 1 } } else cel.alignment = { indent: 1 } }
    };
    const dimKey: Record<string, string> = { Calle: "calle", Familia: "fam", Contó: "conto", Recorrido: "rec", "Estado envase": "estenv", Franja: "franja" };
    const unicos = (g: (x: Fila) => string) => [...new Set(filas.map(g))].sort(natural);
    const todas: Clase[] = ["Producto", "Envase", "Libre", "Otro envase"];
    cruce("Por calle y clase", "Calle", unicos((x) => x.l.calle ?? ""), todas, (x) => x.l.calle ?? "");
    cruce("Por familia y clase", "Familia", unicos((x) => x.l.familia ?? "Sin familia"), todas, (x) => x.l.familia ?? "Sin familia");
    cruce("Por quién contó y clase", "Contó", unicos((x) => x.l.conto ?? ""), todas, (x) => x.l.conto ?? "");
    cruce("Por recorrido y clase", "Recorrido", unicos((x) => x.l.conteo), todas, (x) => x.l.conteo);
    cruce("Envase por estado (retorno, lavado…)", "Estado envase", unicos((x) => x.l.tipo_material !== "ENVASE" ? "" : (x.l.estado_envase ?? "")).filter((e) => e !== ""), ["Envase", "Libre", "Otro envase"], (x) => x.l.estado_envase ?? "", undefined);
    cruce("Producto por franja de vencimiento", "Franja", FRANJAS.map((x) => x.rot), ["Producto"], (x) => rotFr(franja(x.l)), "Producto");
    h.views = [{ showGridLines: false, state: "frozen", ySplit: 9 }];
  }

  /* ================= UBICACIONES POR ESTADO =================
     «Lo quiero así (como la hoja de casco: COD · DESCRIPCIÓN · UBICACIONES), con el filtro de BAJA y
     después evalúo el de LAVADO.» «El filtro no va dentro de la tabla.» «Y en UBICACIONES van todas las
     que estén bajo ese filtro, de una.»
     Arriba se ESCOGE EL ESTADO (una celda con lista) y la tabla de abajo se rehace sola: un renglón por
     material que tenga algo en ese estado, con TODAS sus ubicaciones en una celda separadas con « - ».
     Funciona en cualquier Excel (sin FILTER ni TEXTJOIN): las listas de cada estado ya van armadas en
     columnas escondidas a la derecha y la tabla las lee con INDEX según el estado escogido.
     El estado es la condición del envase (BAJA, LAVADO, RETORNO…); sin condición, NORMAL. Avería y
     PNC, si se marcaron, van pegados («LAVADO + AVERÍA»). */
  {
    const estadoDe = (x: Fila) => [x.l.estado_envase?.trim().toUpperCase() || "", x.l.averia ? "AVERÍA" : "", x.l.pnc ? "PNC" : ""]
      .filter(Boolean).join(" + ") || "NORMAL";
    /* LAS UBICACIONES, ENTENDIBLES: «que la división de ubicaciones no sea enredada». Una línea por
       CALLE, en orden, y la ubicación SIN la palabra del estado (si el filtro es BAJA, «C04_IZQ BAJA»
       dice lo mismo dos veces):
           C:  C04_IZQ - C05_DER
           D:  D11_IZQ
       Si la zona de la ubicación no es la del estado escogido, se deja (dice algo distinto). */
    const ordenarUbicaciones = (xs: Fila[]) => {
      const porCalle = new Map<string, Set<string>>();
      for (const x of xs) {
        const base = (x.l.ubicacion ?? x.l.ubicacion_combinada ?? "").trim();
        const comb = (x.l.ubicacion_combinada ?? base).trim();
        const zona = comb.startsWith(base) ? comb.slice(base.length).trim().toUpperCase() : "";
        const estadoFila = (x.l.estado_envase ?? "").trim().toUpperCase();
        const nombre = zona && zona !== estadoFila ? comb : base;
        if (!nombre) continue;
        const calle = (x.l.calle ?? nombre.match(/^[A-Za-zÑñ]+/)?.[0] ?? "—").toUpperCase();
        (porCalle.get(calle) ?? porCalle.set(calle, new Set()).get(calle)!).add(nombre);
      }
      return [...porCalle.entries()].sort((a, b) => natural(a[0], b[0]))
        .map(([calle, us]) => `${calle}:  ${[...us].sort(natural).join(" - ")}`).join("\n");
    };
    const porEstado = new Map<string, Map<string, Fila[]>>();
    for (const x of filas) {
      const e = estadoDe(x);
      const m = porEstado.get(e) ?? porEstado.set(e, new Map()).get(e)!;
      (m.get(x.l.codigo) ?? m.set(x.l.codigo, []).get(x.l.codigo)!).push(x);
    }
    const estados = [...porEstado.keys()].sort(natural);
    /* Y POR UBICACIÓN: «faltaría ubicaciones, pero específico para colocar FÁBRICA… y poner el resto».
       FABRICA = las que se llaman FABRICA_… (patios, líneas de sorting); RESTO = todas las demás (la
       bodega). Cada combinación estado × ubicación lleva su propia lista escondida, con sus estibas y
       cajas contadas SOLO en esas ubicaciones. */
    const ZONAS = ["FABRICA", "RESTO", "TODAS"] as const;
    const esFab = (x: Fila) => /^\s*FABRICA/i.test(x.l.ubicacion ?? x.l.ubicacion_combinada ?? "");
    const enZona = (x: Fila, z: string) => z === "TODAS" || (z === "FABRICA" ? esFab(x) : !esFab(x));
    type Item = { cod: string; desc: string; ubic: string; est: number; cajas: number };
    const claves: string[] = [];
    const listas: Item[][] = [];
    for (const e of estados) for (const z of ZONAS) {
      const items: Item[] = [];
      for (const xs0 of porEstado.get(e)!.values()) {
        const xs = xs0.filter((x) => enZona(x, z));
        if (!xs.length) continue;
        items.push({ cod: xs[0].l.codigo, desc: xs[0].l.material.toUpperCase(), ubic: ordenarUbicaciones(xs),
                     est: xs.reduce((t, x) => t + x.fisicas, 0), cajas: xs.reduce((t, x) => t + x.cajas, 0) });
      }
      claves.push(`${e}|${z}`);
      listas.push(items.sort((x, y) => natural(x.cod, y.cod)));
    }
    const N = Math.max(1, ...listas.map((l) => l.length));

    /* «REPLICARLO AL LADO PARA TENER LOS DOS»: dos tablas lado a lado, cada una con SUS dos selectores.
       Abren como las tablas del casco: la de la izquierda en LAVADO · FABRICA (AG18) y la de la
       derecha en BAJA · RESTO (AG22, la bodega). */
    const est = (pref: string) => (estados.includes(pref) ? pref : estados[0] ?? "");
    const TABLAS = [
      { c0: 1, estado: est("LAVADO"), zona: "FABRICA" },
      { c0: 7, estado: est("BAJA"), zona: "RESTO" },
    ];
    const G = 5, C0 = 14;                                    // tablas A:E y G:K · listas escondidas desde N
    const ANCHO = 11;
    const h = wb.addWorksheet("Ubicaciones por estado", { properties: { tabColor: { argb: "FFFFC000" } } });
    h.columns = [14, 40, 58, 11, 11, 3, 14, 40, 58, 11, 11].map((w) => ({ width: w }));
    cabecera(h, "Ubicaciones por estado", `Escoge el estado y la ubicación de cada tabla y se arma sola · ${sub}`, ANCHO);
    const F0 = 11, F1 = F0 + N - 1;
    const borde = { top: raya(), bottom: raya(), left: raya(), right: raya() };
    const marco = { top: { style: "medium" as const }, bottom: { style: "medium" as const }, left: { style: "medium" as const }, right: { style: "medium" as const } };
    const CAB = ["COD", "DESCRIPCIÓN", "UBICACIONES", "ESTIBAS", "CAJAS"];

    /* Las listas escondidas: por estado × ubicación, 5 columnas (cod, descripción, ubicaciones, estibas, cajas). */
    const ult = col(C0 + claves.length * G - 1);
    claves.forEach((k, j) => {
      h.getCell(F0 - 1, C0 + j * G).value = k;
      listas[j].forEach((m, i) => {
        const r = F0 + i;
        h.getCell(r, C0 + j * G).value = m.cod; h.getCell(r, C0 + j * G + 1).value = m.desc; h.getCell(r, C0 + j * G + 2).value = m.ubic;
        h.getCell(r, C0 + j * G + 3).value = m.est; h.getCell(r, C0 + j * G + 4).value = m.cajas;
      });
    });
    for (let c = C0; c <= C0 + claves.length * G - 1; c++) h.getColumn(c).hidden = true;
    const rango = `$${col(C0)}$${F0}:$${ult}$${F1}`, cab = `$${col(C0)}$${F0 - 1}:$${ult}$${F0 - 1}`;

    h.getRow(7).height = 26; h.getRow(8).height = 26; h.getRow(9).height = 18; h.getRow(F0 - 1).height = 30;
    const altos: number[] = Array(N).fill(20);
    for (const t of TABLAS) {
      const cE = col(t.c0 + 1);                              // la celda del estado (B o H)
      const sel = (fila: number, rot: string, valor: string, lista: string[], ayuda: string) => {
        const l = h.getCell(fila, t.c0); l.value = rot; l.font = letra(10, TINTA, true); l.alignment = { vertical: "middle", horizontal: "center" };
        const s = h.getCell(fila, t.c0 + 1); s.value = valor; s.font = letra(12.5, "FF000000", true); s.fill = relleno("FFFFE699");
        s.alignment = { vertical: "middle", horizontal: "center" }; s.border = marco;
        s.dataValidation = { type: "list", allowBlank: false, formulae: [`"${lista.join(",")}"`], showErrorMessage: true, errorTitle: rot, error: "Escoge uno de la lista." };
        const n = h.getCell(fila, t.c0 + 2); n.value = ayuda; n.font = letra(9, GRIS, false, true); n.alignment = { vertical: "middle", wrapText: true };
      };
      sel(7, "ESTADO", t.estado, estados, "◄ escoge: " + estados.join(" · "));
      sel(8, "UBICACIÓN", t.zona, [...ZONAS], "◄ FABRICA (patios y sorting de Fábrica) · RESTO (la bodega, lo que no es Fábrica) · TODAS");
      const llave = `$${cE}$7&"|"&$${cE}$8`;
      const iSel = Math.max(0, claves.indexOf(`${t.estado}|${t.zona}`));
      const A = col(t.c0), D = col(t.c0 + 3), E = col(t.c0 + 4);
      const r9 = h.getCell(9, t.c0 + 1);
      r9.value = { formula: `COUNTIF(${A}${F0}:${A}${F1},"?*")&" material(es) · "&TEXT(SUM(${D}${F0}:${D}${F1}),"#,##0")&" estibas · "&TEXT(SUM(${E}${F0}:${E}${F1}),"#,##0")&" cajas"`,
                   result: `${listas[iSel]?.length ?? 0} material(es) · ${(listas[iSel] ?? []).reduce((x, m) => x + m.est, 0)} estibas · ${(listas[iSel] ?? []).reduce((x, m) => x + m.cajas, 0)} cajas` };
      r9.font = letra(9.5, GRIS, true); r9.alignment = { horizontal: "center" };
      CAB.forEach((tt, i) => { const c = h.getCell(F0 - 1, t.c0 + i); c.value = tt; c.font = letra(11, "FF000000", true); c.fill = relleno("FFD9D9D9"); c.border = borde; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true } });
      for (let k = 0; k < N; k++) {
        const r = F0 + k, fila = h.getRow(r);
        const m = listas[iSel]?.[k];
        const largo = Math.max((m?.ubic ?? "").split("\n").reduce((x, l) => x + Math.max(1, Math.ceil(l.length / 54)), 0), Math.ceil((m?.desc.length ?? 0) / 38), 1);
        altos[k] = Math.max(altos[k], 6 + 14 * largo);
        for (let c = 0; c < G; c++) {
          const idx = `INDEX(${rango},${k + 1},MATCH(${llave},${cab},0)+${c})`;
          const res = m ? [m.cod, m.desc, m.ubic, m.est, m.cajas][c] : "";
          const x = fila.getCell(t.c0 + c);
          x.value = { formula: `IFERROR(IF(${idx}="","",${idx}),"")`, result: res };
          x.border = borde; x.font = letra(11, "FF000000", c === 0);
          x.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center", wrapText: c === 1 || c === 2, indent: c === 2 ? 1 : 0 };
          if (c >= 3) x.numFmt = "#,##0;\\-#,##0;";
        }
      }
    }
    altos.forEach((a, k) => { h.getRow(F0 + k).height = Math.min(409, a) });
    h.views = [{ state: "frozen", ySplit: F0 - 1, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${F0 - 1}:${F0 - 1}` };
    h.pageSetup.printArea = `A1:K${F1}`;
  }

  /* ================= 3 · POR MATERIAL ================= */
  {
    const h = wb.addWorksheet("Por material", { properties: { tabColor: { argb: "FF64748B" } } });
    /* «DÓNDE ESTÁ», EN UNA CELDA: las ubicaciones del material separadas con un guion, con su zona
       (D11_IZQ RETORNO) y en orden natural (A2 antes que A10). EL ESTADO NO SE MEZCLA AQUÍ: «el estado
       lo quiero como filtro» — va en la hoja «Análisis», un renglón por material y estado. */
    const C = ["Código", "Material", "Tipo", "Clase", "Familia", "Ubicaciones", "Dónde está", "Estibas físicas", "Cajas", "Unidades", "Vence primero", "Días p/salir", "Franja", "En riesgo (cajas)", "Hectolitros"];
    h.columns = [10, 36, 11, 12, 14, 11, 46, 11, 11, 12, 13, 11, 20, 14, 13].map((w) => ({ width: w }));
    cabecera(h, "Por material", `${sub}  ·  las cifras son fórmulas sobre «Conteo consolidado» · por estado, en la hoja «Análisis»`, C.length);
    encabezado(h, 6, C, [6, 8, 9, 10, 12, 14, 15]);
    /* TODO LO CONTADO, envase incluido: esta hoja es el inventario del
       día, no el riesgo. El envase sale con su tipo y su franja «Sin
       fecha», que es exactamente lo que es. */
    const mats = [...inventario.materiales].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
    mats.forEach((m, i) => {
      const n = 7 + i, r = h.getRow(n);
      const delCodigo = filas.filter((x) => x.l.codigo === m.codigo), sm = (k: keyof Fila) => delCodigo.reduce((a, x) => a + Number(x[k]), 0);
      const crit = `${rb("cod")},$A${n}`;
      const donde = [...new Set(delCodigo.map((x) => (x.l.ubicacion_combinada ?? x.l.ubicacion ?? "").trim()).filter(Boolean))].sort(natural);
      r.values = [m.codigo, m.nombre, matPorSku.get(m.codigo)?.tipo_material ?? "",
        fx(`IFERROR(INDEX(${rb("clase")},MATCH($A${n},${rb("cod")},0)),"")`, delCodigo[0]?.clase ?? ""), m.familia ?? "",
        fx(`COUNTIFS(${crit})`, delCodigo.length), donde.join(" - "),
        fx(`SUMIFS(${rb("fisicas")},${crit})`, sm("fisicas")), fx(`SUMIFS(${rb("cajas")},${crit})`, sm("cajas")),
        fx(`SUMIFS(${rb("unid")},${crit})`, sm("unid")), aDia(m.vence), m.diasSalir, rotFr(m.franja), m.enRiesgoCajas, fx(`SUMIFS(${rb("hl")},${crit})`, sm("hl"))];
      filaDatos(r, C.length, i % 2 === 1, { 6: "#,##0", 8: "#,##0", 9: "#,##0", 10: "#,##0", 11: "dd/mm/yyyy", 12: "0", 14: "#,##0", 15: "#,##0.00" }, [6, 8, 9, 10, 12, 14, 15]);
      r.getCell(1).font = letra(9.5, TINTA, true);
      /* La lista larga se parte en renglones dentro de la celda y la fila crece (≈ 46 caracteres por línea). */
      r.getCell(7).alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
      const lineas = Math.max(Math.ceil(donde.join(" - ").length / 46), 1);
      if (lineas > 1) r.height = Math.min(409, 6 + 13 * lineas);
      pintarFranja(r.getCell(13), m.franja);
    });
    const fm = 6 + Math.max(mats.length, 1);
    totales(h, fm + 1, 7, fm, [6, 8, 9, 10, 14, 15], C.length, "TOTAL (lo filtrado)", { 15: "#,##0.00" });
    h.autoFilter = `A6:${col(C.length)}${fm}`;
    h.views = [{ state: "frozen", xSplit: 2, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
  }

  /* ================= 4 · POR UBICACIÓN =================
     Cada puesto de un módulo es una estiba: aquí se ve, módulo por
     módulo, cuántas caben, cuántas tienen envase, plástico o producto y
     cuántas están libres. */
  {
    const h = wb.addWorksheet("Por ubicación", { properties: { tabColor: { argb: "FF94A3B8" } } });
    const C = ["Ubicación", "Calle", "Módulo", "Lado", "Capacidad (estibas)", "Con envase", "Con producto", "Libres", "Estibas ocupadas", "Sin usar", "Ocupación", "Cajas", "Materiales", "Renglones"];
    h.columns = [16, 8, 9, 8, 12, 10, 10, 10, 11, 9, 11, 11, 11, 11].map((w) => ({ width: w }));
    cabecera(h, "Por ubicación", `${sub}  ·  Libres = estibas contadas como libres · Sin usar = capacidad − estibas ocupadas · cifras con fórmula sobre «Conteo consolidado»`, C.length);
    encabezado(h, 6, C, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    us.forEach((x, i) => {
      const n = 7 + i, r = h.getRow(n);
      const occ = x.capacidad ? x.estibas / x.capacidad : "";
      const sf = (cl: string) => `SUMIFS(${rb("fisicas")},${rb("ubic")},$A${n},${rb("clase")},"${cl}")`;
      r.values = [x.ubicacion, x.calle ?? "", x.modulo ?? "", x.lado ?? "", x.capacidad,
        fx(`${sf("Envase")}+${sf("Otro envase")}`, x.envase), fx(sf("Producto"), x.producto), fx(sf("Libre"), x.libre),
        fx(`SUM(F${n}:H${n})`, x.estibas), fx(`IF(N(E${n})=0,"",MAX(0,E${n}-I${n}))`, sinUsarDe(x) ?? ""), fx(`IF(N(E${n})=0,"",I${n}/E${n})`, occ),
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
    const h = wb.addWorksheet("Validar", { properties: { tabColor: { argb: "FFDC2626" } } });
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
    const h = wb.addWorksheet("Sin contar", { properties: { tabColor: { argb: "FF71717A" } } });
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
    const h = wb.addWorksheet("Maestro", { properties: { tabColor: { argb: "FF52525B" } } });
    const C = ["Código", "Material", "Tipo", "Cajas por estiba", "Unidades por caja", "Hectolitros por unidad"];
    h.columns = [10, 40, 11, 14, 14, 16].map((w) => ({ width: w }));
    cabecera(h, "Maestro de la base", `${codigosBase.length} códigos · de aquí leen «Conteo consolidado» el factor de estibado, las unidades por caja y los hectolitros  ·  ${sub}`, C.length);
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

  /* ================= 6B · CÓMO LEER (las notas que antes iban al pie del resumen) ================= */
  {
    const h = wb.addWorksheet("Cómo leer", { properties: { tabColor: { argb: "FFA1A1AA" } } });
    h.columns = [130].map((w) => ({ width: w }));
    cabecera(h, "Cómo leer este libro", sub, 1);
    const notas: [string, string][] = [
      ["Las clases", "Producto = producto terminado. Envase = botellas y envase en general. Libre = los plásticos (cajas plásticas) que cuentas como libres. Otro envase = barriles y estibas de madera. La clase sale del nombre del material (columna Clase de «Conteo consolidado»)."],
      ["Estibas y cajas", "Total cajas = estibas completas × cajas por estiba (del Maestro) + saldo. Estibas físicas = completas + una por cada saldo (la estiba incompleta también ocupa un puesto). Plástico = las cajas plásticas del producto, del envase y las libres; los barriles y las estibas de madera no cuentan."],
      ["La ocupación", "Se mide con los módulos que TIENEN capacidad cargada: estibas de esos módulos ÷ su capacidad. Los módulos sin capacidad cargada no entran ni arriba ni abajo y salen aparte, en gris, al final de «Ocupación por calle»."],
      ["De dónde sale la base", "De cada ubicación y zona (RETORNO, BAJA, LAVADO…) se toma el ÚLTIMO recorrido que pasó por ella: una calle caminada dos veces no se suma dos veces, pero contar el producto de un módulo no borra el envase que otro contó en su zona. Solo cuenta lo ya ENVIADO."],
      ["Qué es fórmula", "Casi todas las cifras son fórmulas (sobre Conteo consolidado, Por ubicación y Maestro) para que se vea de dónde salen. Conteo envase y Conteo producto son la misma base apartada por clase. Las dos donas del Tablero leen sus datos de las celdas de apoyo de la derecha (columnas AZ:BA), fuera del área de impresión."],
      ["Las horas", "Son las de Colombia."],
    ];
    notas.forEach(([t, x], i) => {
      const a = h.getCell(7 + i * 2, 1), b = h.getCell(8 + i * 2, 1);
      a.value = t; a.font = letra(10.5, TINTA, true);
      b.value = x; b.font = letra(10, TINTA); b.alignment = { wrapText: true, vertical: "top" };
      h.getRow(8 + i * 2).height = Math.max(30, Math.ceil(x.length / 150) * 15 + 6);
    });
  }

  /* ================= 7 · EVIDENCIAS (solo si hay fotos) =================
     LA FOTO VA EN SU PROPIA HOJA, no en «Base»: así el libro de siempre no
     se mueve ni se ensancha, y quien no usa la cámara no ve nada nuevo.
     Cada foto trae al lado el renglón al que respalda. */
  const evid = (d.evidencias ?? []).filter((e) => e.foto?.byteLength);
  if (evid.length) {
    const porLinea = new Map(d.lineas.map((l) => [l.id, l]));
    const h = wb.addWorksheet("Evidencias", { properties: { tabColor: { argb: "FFDC2626" } } });
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

  /* ANCHOS A LA MEDIDA: cada columna se ensancha hasta que quepa lo más largo que trae (título, texto o cifra
     con su formato). Así se abre y se ve todo, sin tener que estirar nada. Las columnas con texto en varias
     líneas (Detalle, Nota…) y la hoja Análisis (que mezcla tablas) se dejan como están. */
  const mide = (v: ExcelJS.CellValue, fmt?: string): number => {
    if (v == null) return 0;
    if (typeof v === "object" && "result" in v) return mide(v.result as ExcelJS.CellValue, fmt);
    if (typeof v === "object" && "text" in v) return String((v as { text: string }).text).length;
    if (v instanceof Date) return /h/.test(fmt ?? "") ? 14 : 10;
    if (typeof v === "number") { const dec = /0\.(0+)/.exec(fmt ?? "")?.[1].length ?? 0; return v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }).length + 1 }
    return String(v).length;
  };
  for (const h of wb.worksheets) {
    if (["Tablero", "Análisis", "Ubicaciones por estado", "Cómo leer", "Evidencias"].includes(h.name)) continue;
    const n = h.columnCount;
    for (let c = 1; c <= n; c++) {
      let largo = 0, ajusta = false;
      h.eachRow({ includeEmpty: false }, (r, f) => {
        if (f < 6) return;
        const cel = r.getCell(c);
        if (cel.alignment?.wrapText && f > 6) { ajusta = true; return }
        largo = Math.max(largo, f === 6 ? Math.max(...String(cel.value ?? "").split(/\s+/).map((w) => w.length), 0) + 4 : mide(cel.value, cel.numFmt) * 1.1 + 2);
      });
      if (ajusta) continue;
      const col = h.getColumn(c);
      col.width = Math.min(70, Math.max(col.width ?? 8, Math.ceil(largo)));
    }
  }

  /* Cada hoja cabe a lo ancho de la página al imprimir. */
  for (const h of wb.worksheets) if (h.name !== "Tablero") h.pageSetup = { ...h.pageSetup, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    orientation: "landscape", margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  /* Una sola letra en todo el libro: Calibri. */
  for (const h of wb.worksheets) h.eachRow((r) => r.eachCell((c) => { c.font = { name: "Calibri", ...(c.font ?? {}) } }));
  const crudo = Buffer.from(await wb.xlsx.writeBuffer());
  return inyectarDonas(remendarFiltros(crudo, wb), donas);
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
