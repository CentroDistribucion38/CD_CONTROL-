import {
  PESO, aEstado, inicioPeriodo,
  type Disparador, type Estado, type Indicador, type Proceso, type Resultado,
} from "./semaforo";

/**
 * EL MAPA DE GESTIÓN — el árbol de KPI y el flujo de procesos, armados con lo que ya está en el Maestro.
 * No guarda nada: solo ordena indicadores, procesos y resultados del día que se mire.
 *
 *   · ÁRBOL   cada KPI con sus PI colgando (el «padre» que se pone en el Maestro), agrupado por el proceso del KPI.
 *   · FLUJO   los procesos en su orden, cada uno con sus indicadores y cuántos cumplen; y qué PI de un proceso
 *             alimenta un KPI de otro (ahí es donde un proceso depende de otro).
 */
export type Nodo = {
  i: Indicador;
  /** Cumple (verde) o no cumple (rojo) en el periodo de la fecha; null si no hay captura. Si hay varios turnos, vale el peor. */
  estado: Estado | null;
  /** Cuántos resultados hay en el periodo y cuántos cumplen. */
  n: number; cumplen: number;
  /** El último valor capturado del periodo. */
  valor: number | null;
  /** Tiene un disparador activo. */
  disparo: boolean;
  hijos: Nodo[];
};
export type Grupo = { id: string; nombre: string; raices: Nodo[] };
export type Paso = {
  id: string; nombre: string; orden: number; nodos: Nodo[];
  total: number; cumplen: number; no: number; sin: number; disparos: number;
};
export type Conexion = { desde: Indicador; desdeProceso: string; hacia: Indicador; haciaProceso: string; desdeEstado: Estado | null };

const porCodigo = (a: Indicador, b: Indicador) =>
  a.tipo === b.tipo ? a.orden - b.orden || a.codigo.localeCompare(b.codigo, "es", { numeric: true }) : a.tipo === "kpi" ? -1 : 1;

/** El estado de cada indicador activo en el periodo de la fecha. */
export function nodosDelDia(indicadores: Indicador[], resultados: Resultado[], disparadores: Disparador[], fecha: string): Map<string, Nodo> {
  const activos = new Set(disparadores.filter((d) => d.estado === "activo").map((d) => d.indicador_id));
  const porInd = new Map<string, Resultado[]>();
  for (const r of resultados) { const a = porInd.get(r.indicador_id); a ? a.push(r) : porInd.set(r.indicador_id, [r]); }
  const m = new Map<string, Nodo>();
  for (const i of indicadores) {
    if (!i.activo) continue;
    const ini = inicioPeriodo(fecha, i.frecuencia);
    const del = (porInd.get(i.id) ?? []).filter((r) => r.fecha === ini);
    const estados = del.map((r) => aEstado(r.estado));
    const peor = estados.reduce<Estado | null>((a, e) => (a == null || PESO[e] > PESO[a] ? e : a), null);
    const ultimo = [...del].sort((a, b) => a.capturado_en.localeCompare(b.capturado_en)).pop();
    m.set(i.id, {
      i, estado: peor, n: del.length, cumplen: estados.filter((e) => e === "verde").length,
      valor: ultimo ? ultimo.valor : null, disparo: activos.has(i.id), hijos: [],
    });
  }
  return m;
}

/** KPI con sus PI debajo, agrupado por el proceso del KPI (los procesos en su orden; al final «Sin proceso»). */
export function armarArbol(procesos: Proceso[], nodos: Map<string, Nodo>): Grupo[] {
  const copia = new Map([...nodos].map(([k, n]) => [k, { ...n, hijos: [] as Nodo[] }]));
  const raices: Nodo[] = [];
  for (const n of copia.values()) {
    const padre = n.i.padre_id ? copia.get(n.i.padre_id) : undefined;
    if (padre && padre !== n) padre.hijos.push(n); else raices.push(n);
  }
  for (const n of copia.values()) n.hijos.sort((a, b) => porCodigo(a.i, b.i));
  const activos = procesos.filter((p) => p.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const idsActivos = new Set(activos.map((p) => p.id));
  const grupos: Grupo[] = activos.map((p) => ({ id: p.id, nombre: p.nombre, raices: raices.filter((n) => n.i.proceso_id === p.id).sort((a, b) => porCodigo(a.i, b.i)) }));
  grupos.push({ id: "ninguno", nombre: "Sin proceso", raices: raices.filter((n) => !n.i.proceso_id || !idsActivos.has(n.i.proceso_id)).sort((a, b) => porCodigo(a.i, b.i)) });
  return grupos.filter((g) => g.raices.length);
}

/** Cada proceso con sus indicadores y sus conteos. */
export function armarFlujo(procesos: Proceso[], nodos: Map<string, Nodo>): { pasos: Paso[]; conexiones: Conexion[] } {
  const activos = procesos.filter((p) => p.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const idsActivos = new Set(activos.map((p) => p.id));
  const todos = [...nodos.values()];
  const paso = (id: string, nombre: string, orden: number, xs: Nodo[]): Paso => {
    const ordenados = [...xs].sort((a, b) => porCodigo(a.i, b.i));
    return {
      id, nombre, orden, nodos: ordenados, total: ordenados.length,
      cumplen: ordenados.filter((n) => n.estado === "verde").length,
      no: ordenados.filter((n) => n.estado === "rojo").length,
      sin: ordenados.filter((n) => n.estado == null).length,
      disparos: ordenados.filter((n) => n.disparo).length,
    };
  };
  const pasos = activos.map((p, k) => paso(p.id, p.nombre, k + 1, todos.filter((n) => n.i.proceso_id === p.id)));
  const resto = todos.filter((n) => !n.i.proceso_id || !idsActivos.has(n.i.proceso_id));
  if (resto.length) pasos.push(paso("ninguno", "Sin proceso", 0, resto));

  const nombreProc = new Map(activos.map((p) => [p.id, p.nombre]));
  const conexiones: Conexion[] = [];
  for (const n of todos) {
    const padre = n.i.padre_id ? nodos.get(n.i.padre_id) : undefined;
    if (!padre || !n.i.proceso_id || !padre.i.proceso_id || n.i.proceso_id === padre.i.proceso_id) continue;
    conexiones.push({
      desde: n.i, desdeProceso: nombreProc.get(n.i.proceso_id) ?? "—", hacia: padre.i, haciaProceso: nombreProc.get(padre.i.proceso_id) ?? "—",
      desdeEstado: n.estado,
    });
  }
  conexiones.sort((a, b) => a.desdeProceso.localeCompare(b.desdeProceso, "es") || porCodigo(a.desde, b.desde));
  return { pasos, conexiones };
}
