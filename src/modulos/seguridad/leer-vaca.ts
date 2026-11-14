/**
 * LEER EL EXCEL «Seguimiento VACA» en el navegador. Puro: recibe el módulo xlsx y el archivo; no toca la base.
 *
 *   · Busca la hoja que tenga la fila de títulos con «NO. DE CÉDULA» y «DEPARTAMENTO» (prefiere la que se llama
 *     «Seguimiento»; «Seguimiento (2)» es el historial viejo y no trae departamento).
 *   · Cada columna se encuentra por su título, no por su posición: si mañana agregan una columna, sigue leyendo.
 *   · Las fechas vienen como fecha de Excel o como texto dd/mm/aaaa; las dos se leen.
 *   · Solo quedan los departamentos de las Reglas; el resto se cuenta como «fuera».
 *   · Una cédula repetida: queda la fila con la expedición más nueva (y las más viejas viajan igual, como historial).
 */
import type { FilaImporte } from "@/app/(app)/seguridad/certificaciones/actions";
import { claveTexto } from "./certificaciones";

type XLSXMod = typeof import("xlsx");

const COLS: Record<string, (t: string) => boolean> = {
  empresa: (t) => t === "EMPRESA ALIADA" || t === "EMPRESA",
  nombre: (t) => t.startsWith("NOMBRE"),
  cedula: (t) => t.includes("CEDULA"),
  departamento: (t) => t === "DEPARTAMENTO",
  ALTURA: (t) => t === "ALTURA",
  CALIENTE: (t) => t === "CALIENTE",
  SQ: (t) => t === "SQ",
  "360": (t) => t === "$360" || t === "360",
  ELECTRICO: (t) => t === "ELECTRICO",
  EC: (t) => t === "EC",
  IZAJE: (t) => t === "IZAJE",
  HPRM: (t) => t === "HPRM",
  expedicion: (t) => t.startsWith("FECHA DE EXPEDICION"),
  vencimiento: (t) => t.startsWith("FECHA DE VENCIMIENTO"),
  sop: (t) => t.startsWith("SOP"),
  nivel: (t) => t === "NIVEL",
  validador: (t) => t.startsWith("QUIEN VALID"),
  estado: (t) => t === "ACTIVOS" || t === "ESTADO",
  motivo: (t) => t === "MOTIVO",
};
const PERM = ["ALTURA", "CALIENTE", "SQ", "360", "ELECTRICO", "EC", "IZAJE", "HPRM"];
const OBLIGATORIAS = ["empresa", "nombre", "cedula", "departamento", "expedicion"];

export type LecturaVaca = {
  hoja: string; filas: FilaImporte[]; leidas: number; fuera: number; sinFecha: number; repetidas: number;
  porDepto: { depto: string; n: number; entra: boolean }[];
  personas: number; activos: number; empresas: number;
};

const dos = (n: number) => String(n).padStart(2, "0");
function fecha(X: XLSXMod, v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = X.SSF.parse_date_code(v);
    return d && d.y > 1990 ? `${d.y}-${dos(d.m)}-${dos(d.d)}` : null;
  }
  if (v instanceof Date) return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`;
  const m = String(v).trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${dos(Number(m[2]))}-${dos(Number(m[1]))}` }
  const iso = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}
const texto = (v: unknown) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s && s !== "#N/A" ? s : null };
function nivel(v: unknown) {
  const k = claveTexto(String(v ?? ""));
  return k === "BASICO" ? "Básico" : k === "INTERMEDIO" ? "Intermedio" : k === "AVANZADO" ? "Avanzado" : null;
}

export async function leerVaca(X: XLSXMod, datos: ArrayBuffer, departamentos: string[]): Promise<LecturaVaca> {
  const wb = X.read(datos, { type: "array", cellDates: false });
  const deps = new Set(departamentos.map(claveTexto));

  /* LA HOJA: la que tiene los títulos; si hay varias, la que se llama «Seguimiento». */
  let mejor: { hoja: string; fila: number; col: Record<string, number> } | null = null;
  for (const nombre of wb.SheetNames) {
    const filas = X.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: true, blankrows: true, defval: null });
    for (let i = 0; i < Math.min(filas.length, 15); i++) {
      const tit = (filas[i] ?? []).map((c) => claveTexto(String(c ?? "")));
      const col: Record<string, number> = {};
      for (const [k, ok] of Object.entries(COLS)) { const j = tit.findIndex(ok); if (j >= 0) col[k] = j }
      if (OBLIGATORIAS.every((k) => k in col)) {
        if (!mejor || claveTexto(nombre) === "SEGUIMIENTO") mejor = { hoja: nombre, fila: i, col };
        break;
      }
    }
  }
  if (!mejor) throw new Error("No encontré la hoja de seguimiento: falta una fila de títulos con EMPRESA ALIADA, NOMBRE, NO. DE CÉDULA, DEPARTAMENTO y FECHA DE EXPEDICIÓN.");

  const { hoja, fila, col } = mejor;
  const filas = X.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: null }).slice(fila + 1);
  const conteo = new Map<string, number>();
  const salen: FilaImporte[] = [];
  let leidas = 0, fuera = 0, sinFecha = 0;
  for (const r of filas) {
    const cedula = String(r[col.cedula] ?? "").replace(/\.0+$/, "").replace(/[^0-9A-Za-z]/g, "");
    if (!cedula) continue;
    leidas++;
    const depto = claveTexto(String(r[col.departamento] ?? "")) || "SIN DEPARTAMENTO";
    conteo.set(depto, (conteo.get(depto) ?? 0) + 1);
    if (!deps.has(depto)) { fuera++; continue }
    const exp = fecha(X, r[col.expedicion]);
    if (!exp) { sinFecha++; continue }
    const est = claveTexto(String(r[col.estado] ?? ""));
    salen.push({
      cedula, nombre: texto(r[col.nombre]) ?? "", empresa: texto(r[col.empresa]) ?? "SIN EMPRESA", departamento: depto,
      estado: ["ACTIVO", "NO ACTIVO", "BLOQUEADO", "VACACIONES"].includes(est) ? est : "ACTIVO",
      motivo: col.motivo != null ? texto(r[col.motivo]) : null,
      expedicion: exp, vencimiento: col.vencimiento != null ? fecha(X, r[col.vencimiento]) : null,
      permisos: PERM.filter((k) => col[k] != null && claveTexto(String(r[col[k]] ?? "")) === "X"),
      nivel: col.nivel != null ? nivel(r[col.nivel]) : null,
      validador: col.validador != null ? texto(r[col.validador]) : null,
      sop: col.sop != null ? texto(r[col.sop]) : null,
    });
  }
  /* La más vieja primero: así, en la base, la más nueva entra de último y queda como la vigente. */
  salen.sort((a, b) => a.expedicion.localeCompare(b.expedicion));
  const ultima = new Map<string, FilaImporte>();
  for (const f of salen) ultima.set(f.cedula, f);
  const vigentes = [...ultima.values()];
  return {
    hoja, filas: salen, leidas, fuera, sinFecha, repetidas: salen.length - vigentes.length,
    porDepto: [...conteo].map(([depto, n]) => ({ depto, n, entra: deps.has(depto) })).sort((a, b) => b.n - a.n),
    personas: vigentes.length, activos: vigentes.filter((f) => f.estado === "ACTIVO").length,
    empresas: new Set(vigentes.map((f) => claveTexto(f.empresa))).size,
  };
}
