import { armarCuadre } from "@/modulos/inventario/cuadre";
import { leerPasivos } from "@/modulos/pasivos/datos";

/**
 * VALIDACIÓN DE PASIVO · AG18 — una hoja aparte, solo para validar (no cambia el Cuadre ni la Base de pasivos).
 *
 * Por cada envase de AG18, en unidades:
 *   CONTEO FÍSICO        lo contado en la fábrica (el «Conteo fábrica» del Cuadre SAP).
 *   PASIVO               lo que está en el informe de pasivo: Baja + Lavado de AG18 del día.
 *   PENDIENTE POR BAJA   conteo físico − pasivo.            (231.270 − 113.520 = 117.750)
 *   EXISTENCIA FINAL SAP la del Cuadre SAP AG18: lo que dice SAP + lo ya movido con el 311.
 *   VALIDA               pasivo + pendiente por baja debe dar la existencia final de SAP.
 * Solo lee lo que ya calculan el Cuadre y Pasivos; no guarda nada.
 */
export type EstadoValidacion = "cuadra" | "falta" | "sobra" | "sin_sap";
export type FilaValidacion = {
  codigo: string; material: string;
  conteo: number; baja: number; lavado: number; pasivo: number;
  /** conteo − pasivo. Negativo = el pasivo es mayor que lo contado. */
  pendiente: number;
  /** Cajas del pendiente por baja (null si no hay unidades por caja). */
  pendienteCajas: number | null;
  /** SAP + lo movido con el 311 (null si no hay ZEXI guardada). */
  existencia: number | null;
  /** existencia final − (pasivo + pendiente). 0 = cuadra. */
  dif: number | null;
  estado: EstadoValidacion;
};
export type DatosValidacion = {
  fecha: string | null; dias: string[]; filas: FilaValidacion[]; hayZexi: boolean; avisos: string[]; error: string | null;
};

const EPS = 0.5;
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function validacionPasivo(pedida?: string | null): Promise<DatosValidacion> {
  const c = await armarCuadre(pedida, "AG18");
  const vacio: DatosValidacion = { fecha: c.fecha, dias: c.dias, filas: [], hayZexi: false, avisos: c.avisos, error: c.error };
  if (!c.fecha || c.error || c.faltaSql) return { ...vacio, error: c.error ?? (c.faltaSql ? "Falta crear las tablas del Cuadre SAP." : null) };

  const pas = await leerPasivos(c.fecha, c.fecha);
  if (pas.error) return { ...vacio, avisos: [...c.avisos, `No pude leer Pasivos: ${pas.error}`] };

  const baja = new Map<string, number>(), lavado = new Map<string, number>();
  for (const f of pas.data) {
    if (f.almacen !== "AG18") continue;
    const e = String(f.estado).toUpperCase(), k = String(f.codigo), u = Number(f.unidades) || 0;
    if (e === "BAJA") baja.set(k, (baja.get(k) ?? 0) + u);
    else if (e === "LAVADO") lavado.set(k, (lavado.get(k) ?? 0) + u);
  }

  const hayZexi = !!c.guardado?.zexi?.length;
  const filas: FilaValidacion[] = [];
  const vistos = new Set<string>();
  for (const f of c.filas) {
    if (f.grupo !== "ENVASE") continue;
    vistos.add(f.codigo);
    const b = baja.get(f.codigo) ?? 0, l = lavado.get(f.codigo) ?? 0, pasivo = r2(b + l);
    if (!f.conteo && !pasivo) continue;
    const pendiente = r2(f.conteo - pasivo);
    const existencia = f.sapDespues ?? f.sap;
    const dif = existencia == null ? null : r2(existencia - (pasivo + pendiente));
    filas.push({
      codigo: f.codigo, material: f.material, conteo: f.conteo, baja: r2(b), lavado: r2(l), pasivo, pendiente,
      pendienteCajas: f.upc > 1 ? r2(pendiente / f.upc) : null, existencia, dif,
      estado: dif == null ? "sin_sap" : Math.abs(dif) < EPS ? "cuadra" : dif < 0 ? "falta" : "sobra",
    });
  }
  /* Un pasivo de un código que el Cuadre no listó (nada contado): también se valida. */
  for (const k of new Set([...baja.keys(), ...lavado.keys()])) {
    if (vistos.has(k)) continue;
    const b = baja.get(k) ?? 0, l = lavado.get(k) ?? 0, pasivo = r2(b + l);
    if (!pasivo) continue;
    filas.push({ codigo: k, material: pas.data.find((x) => String(x.codigo) === k)?.descripcion ?? k, conteo: 0, baja: r2(b), lavado: r2(l), pasivo,
      pendiente: r2(-pasivo), pendienteCajas: null, existencia: null, dif: null, estado: "sin_sap" });
  }
  filas.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  return { fecha: c.fecha, dias: c.dias, filas, hayZexi, avisos: c.avisos, error: null };
}
