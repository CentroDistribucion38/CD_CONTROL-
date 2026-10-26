import { armarCuadre, type FilaCuadre, type Grupo } from "@/modulos/inventario/cuadre";
import { leerPasivos } from "@/modulos/pasivos/datos";

/**
 * EXISTENCIAS vs BASE DE PASIVOS — una hoja que solo valida: la existencia de SAP de AG18 y de AG22 (lo último que se cargó
 * ese día en el Cuadre SAP de cada almacén) tiene que ser igual a lo que dice la Base de pasivos.
 *
 *   EXISTENCIA  = la ZEXI que quedó guardada ese día (la última que se subió reemplaza a la anterior) + lo movido con el 311
 *                 (la misma «existencia final» del Cuadre SAP). En AG22 es el Bloqueado.
 *   BASE AG18   = Pasivos AG18 · BAJA (todas las causales, con el PENDIENTE BAJA enviado) + LAVADO.
 *   BASE AG22   = Pasivos AG22 · PRESORTING, ROTURA DE LINEA, LAVADO, EXTRASUCIO y BAJA PROYECTADA (la regla del Cuadre AG22).
 *   DIFERENCIA  = existencia − base. 0 = cuadra. Solo lee: no guarda nada.
 */
export type EstadoExist = "cuadra" | "falta" | "sobra" | "sin_sap";
export type FilaExist = {
  grupo: Grupo; codigo: string; material: string;
  /** La ZEXI tal cual (null si no hay ZEXI ese día). */
  sap: number | null;
  /** Lo movido con el 311 (neto). */
  movido: number;
  /** SAP + movido. */
  existencia: number | null;
  /** Lo que dice la Base de pasivos. */
  base: number;
  /** existencia − base. */
  dif: number | null;
  estado: EstadoExist;
};
export type BloqueExist = {
  almacen: "AG18" | "AG22";
  /** ¿Hay datos de este almacén en el día escogido? */
  hayDia: boolean;
  hayZexi: boolean; zexiArchivo: string | null; zexiEn: string | null;
  filas: FilaExist[];
  avisos: string[];
};
export type DatosExistencias = { fecha: string | null; dias: string[]; ag18: BloqueExist; ag22: BloqueExist; error: string | null };

const EPS = 0.5;
const r2 = (v: number) => Math.round(v * 100) / 100;
const estadoDe = (dif: number | null): EstadoExist => (dif == null ? "sin_sap" : Math.abs(dif) < EPS ? "cuadra" : dif < 0 ? "falta" : "sobra");
const ORDEN = "ENVASE CAJA ESTIBA";
const ordenar = (a: FilaExist, b: FilaExist) => ORDEN.indexOf(a.grupo) - ORDEN.indexOf(b.grupo) || a.codigo.localeCompare(b.codigo, "es", { numeric: true });

const sinDia = (almacen: "AG18" | "AG22", avisos: string[] = []): BloqueExist =>
  ({ almacen, hayDia: false, hayZexi: false, zexiArchivo: null, zexiEn: null, filas: [], avisos });

export async function existenciasPasivo(pedida?: string | null): Promise<DatosExistencias> {
  /* Los días que tienen algo en cualquiera de los dos cuadres. */
  const [a0, b0] = await Promise.all([armarCuadre(null, "AG18"), armarCuadre(null, "AG22")]);
  const dias = [...new Set([...a0.dias, ...b0.dias])].sort().reverse();
  const fecha = pedida && dias.includes(pedida) ? pedida : (dias[0] ?? null);
  const vacio = { fecha, dias, ag18: sinDia("AG18"), ag22: sinDia("AG22") };
  if (!fecha) return { ...vacio, error: a0.error ?? b0.error };

  const [c18, c22, pas] = await Promise.all([
    armarCuadre(fecha, "AG18"), armarCuadre(fecha, "AG22"), leerPasivos(fecha, fecha),
  ]);
  const error = c18.error ?? c22.error ?? pas.error ?? null;
  if (error) return { ...vacio, error };

  /* ---------------- AG18: existencia final de los envases vs BAJA + LAVADO de la Base ---------------- */
  let ag18 = sinDia("AG18");
  if (c18.fecha === fecha && !c18.faltaSql) {
    const base = new Map<string, number>();
    const nombres = new Map<string, string>();
    for (const f of pas.data) {
      if (f.almacen !== "AG18") continue;
      const e = String(f.estado).toUpperCase();
      if (e !== "BAJA" && e !== "LAVADO") continue;
      const k = String(f.codigo);
      base.set(k, (base.get(k) ?? 0) + (Number(f.unidades) || 0));
      nombres.set(k, f.descripcion);
    }
    const filas: FilaExist[] = [];
    const vistos = new Set<string>();
    for (const f of c18.filas as FilaCuadre[]) {
      if (f.grupo !== "ENVASE") continue;
      vistos.add(f.codigo);
      const b = r2(base.get(f.codigo) ?? 0), existencia = f.sapDespues ?? f.sap;
      if (!b && !existencia) continue;
      const dif = existencia == null ? null : r2(existencia - b);
      filas.push({ grupo: f.grupo, codigo: f.codigo, material: f.material, sap: f.sap, movido: f.movido, existencia, base: b, dif, estado: estadoDe(dif) });
    }
    for (const [k, v] of base) {
      if (vistos.has(k) || !r2(v)) continue;
      const dif = c18.guardado?.zexi?.length ? r2(0 - v) : null;
      filas.push({ grupo: "ENVASE", codigo: k, material: nombres.get(k) ?? k, sap: c18.guardado?.zexi?.length ? 0 : null, movido: 0, existencia: c18.guardado?.zexi?.length ? 0 : null, base: r2(v), dif, estado: estadoDe(dif) });
    }
    ag18 = {
      almacen: "AG18", hayDia: true, hayZexi: !!c18.guardado?.zexi?.length,
      zexiArchivo: c18.guardado?.zexi_archivo ?? null, zexiEn: c18.guardado?.zexi_en ?? null,
      filas: filas.sort(ordenar), avisos: c18.avisos,
    };
  } else if (c18.faltaSql) ag18 = sinDia("AG18", ["Falta crear las tablas del Cuadre SAP."]);

  /* ---------------- AG22: Bloqueado de SAP vs las causales de la Base ---------------- */
  let ag22 = sinDia("AG22");
  if (c22.fecha === fecha && !c22.faltaSql) {
    const hayZexi = !!c22.guardado?.zexi?.length;
    const filas: FilaExist[] = (c22.filas as FilaCuadre[]).map((f) => {
      const existencia = f.sapDespues ?? f.sap, b = r2(f.total);
      const dif = existencia == null ? null : r2(existencia - b);
      return { grupo: f.grupo, codigo: f.codigo, material: f.material, sap: f.sap, movido: f.movido, existencia, base: b, dif, estado: estadoDe(dif) };
    });
    ag22 = {
      almacen: "AG22", hayDia: true, hayZexi,
      zexiArchivo: c22.guardado?.zexi_archivo ?? null, zexiEn: c22.guardado?.zexi_en ?? null,
      filas: filas.sort(ordenar), avisos: c22.avisos,
    };
  } else if (c22.faltaSql) ag22 = sinDia("AG22", ["Falta crear las tablas del Cuadre SAP."]);

  return { fecha, dias, ag18, ag22, error: null };
}
