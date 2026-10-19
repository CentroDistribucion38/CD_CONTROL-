/** Constantes y tipos de «Todos los almacenes»: sin ningún import de servidor, para poder usarlos también en el navegador. */
export type Almacen = "AG18" | "AG17" | "AG16" | "AG22";
export type Grupo = "ENVASE" | "CAJA" | "ESTIBA" | "PRODUCTO";
export const ALMACENES = ["AG22", "AG18", "AG17", "AG16"] as const;
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

