import { armarCuadre, type Almacen, type FilaCuadre, type Grupo } from "@/modulos/inventario/cuadre";

/**
 * EL ANÁLISIS DE TODOS LOS ALMACENES — por SKU, lo contado y lo de SAP en AG22, AG18, AG17 y AG16, sacado de los
 * cuatro Cuadres SAP del día. Por almacén: lo contado (la meta), la ZEXI, lo movido (311 / 344) y lo que queda.
 * Si con lo movido todo quedó balanceado el SKU sale BALANCEADO; si algún almacén queda con diferencia, sale
 * DESCUADRE con la observación armada sola (qué almacén queda de más o de menos en SAP).
 */
export const ALMACENES = ["AG22", "AG18", "AG17", "AG16"] as const satisfies readonly Almacen[];
export type CeldaAlm = { conteo: number; sap: number | null; movido: number; sapDespues: number | null; queda: number | null; detalle: string | null };
export type EstadoSku = "BALANCEADO" | "DESCUADRE" | "SIN SAP";
export type FilaTodos = {
  codigo: string; material: string; grupo: Grupo;
  alm: Partial<Record<Almacen, CeldaAlm>>;
  /** Suma de los almacenes: lo contado, lo que SAP tiene antes de mover y lo que queda después de mover. */
  conteo: number; sap: number | null; queda: number | null;
  estado: EstadoSku; observacion: string;
};
export type ResumenAlm = { alm: Almacen; hayCuadre: boolean; hayZexi: boolean; zexiArchivo: string | null; descuadres: number; materiales: number; conteoEstibas: number };
export type Todos = { fecha: string; almacenes: ResumenAlm[]; filas: FilaTodos[]; avisos: string[] };

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const redondo = (v: number) => Math.round(v * 100) / 100;
const ESTIBA = "3500163";

export async function armarTodos(fecha: string): Promise<Todos> {
  const cuadres = await Promise.all(ALMACENES.map(async (alm) => ({ alm, c: await armarCuadre(fecha, alm) })));
  const avisos: string[] = [];
  const porCodigo = new Map<string, FilaTodos>();
  const almacenes: ResumenAlm[] = [];

  for (const { alm, c } of cuadres) {
    const hayCuadre = c.fecha === fecha;
    const hayZexi = hayCuadre && !!c.guardado?.zexi?.length;
    const r: ResumenAlm = { alm, hayCuadre, hayZexi, zexiArchivo: hayCuadre ? c.guardado?.zexi_archivo ?? null : null, descuadres: 0, materiales: 0, conteoEstibas: 0 };
    almacenes.push(r);
    if (!hayCuadre) { avisos.push(`${alm}: no hay Cuadre SAP de ese día (el cuadre más cercano es del ${c.fecha ?? "—"}); no se cuenta.`); continue }
    if (!hayZexi) avisos.push(`${alm}: el Cuadre SAP no tiene ZEXI cargada: se muestra lo contado, pero sin SAP no se puede decir si quedó balanceado.`);
    for (const f of c.filas as FilaCuadre[]) {
      const codigo = String(f.codigo);
      const x = porCodigo.get(codigo) ?? { codigo, material: f.material, grupo: f.grupo, alm: {}, conteo: 0, sap: null, queda: null, estado: "SIN SAP" as EstadoSku, observacion: "" };
      x.alm[alm] = { conteo: f.total, sap: f.sap, movido: f.movido, sapDespues: f.sapDespues, queda: f.queda, detalle: f.detalle };
      porCodigo.set(codigo, x);
      r.materiales++;
      if (codigo === ESTIBA) r.conteoEstibas += f.total;
    }
  }

  for (const x of porCodigo.values()) {
    const celdas = Object.entries(x.alm) as [Almacen, CeldaAlm][];
    x.conteo = redondo(celdas.reduce((t, [, k]) => t + k.conteo, 0));
    const conSap = celdas.filter(([, k]) => k.sap != null);
    x.sap = conSap.length ? redondo(conSap.reduce((t, [, k]) => t + (k.sap ?? 0), 0)) : null;
    const conQueda = celdas.filter(([, k]) => k.queda != null);
    x.queda = conQueda.length ? redondo(conQueda.reduce((t, [, k]) => t + (k.queda ?? 0), 0)) : null;
    const malos = conQueda.filter(([, k]) => Math.abs(k.queda ?? 0) >= 0.5);
    x.estado = !conQueda.length ? "SIN SAP" : malos.length ? "DESCUADRE" : "BALANCEADO";
    if (malos.length) {
      x.observacion = malos.map(([a, k]) => `${a} queda con SAP de ${(k.queda ?? 0) > 0 ? "más" : "menos"} (${nf.format(Math.abs(k.queda ?? 0))})`).join(" · ");
      for (const [a] of malos) { const r = almacenes.find((y) => y.alm === a); if (r) r.descuadres++; }
    }
  }

  const filas = [...porCodigo.values()]
    .filter((x) => x.conteo !== 0 || (x.sap ?? 0) !== 0 || Object.values(x.alm).some((k) => k.movido !== 0))
    .sort((a, b) => "ENVASE CAJA ESTIBA PRODUCTO".indexOf(a.grupo) - "ENVASE CAJA ESTIBA PRODUCTO".indexOf(b.grupo) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  return { fecha, almacenes, filas, avisos };
}
