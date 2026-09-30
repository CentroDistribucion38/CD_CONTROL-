/**
 * INVENTARIO · CORTE DE LÍNEAS — las cuentas.
 *
 * Un corte es una FOTO de cada línea (L1, L2, L4, L6) a una hora: las
 * cajas que han pasado por la depaletizadora —el contador—, de dónde
 * estaban tomando y dónde estaban ubicados, cada uno con su calle ·
 * módulo · lado y su cantidad en estibas o en cajas.
 *
 * DOS FOTOS —el inicial y el final— y la resta entre ellas dice qué pasó
 * en ese intervalo. Esa resta se hace AQUÍ, al mirar, y no se guarda: un
 * análisis guardado es una segunda versión de la misma cuenta.
 *
 * QUÉ SE COMPARA, LÍNEA POR LÍNEA
 *   pasadas   = contador final − contador inicial (cajas por la depa).
 *   bajó      = cajas del ORIGEN al inicio − cajas del ORIGEN al final.
 *   subió     = cajas del DESTINO al final − cajas del DESTINO al inicio.
 *   diferencia contra el origen  = pasadas − bajó
 *   diferencia contra el destino = pasadas − subió
 * Positiva: pasaron más cajas de las que se ven moverse en el módulo.
 * Negativa: el módulo se movió más de lo que contó la depa.
 *
 * NO SE INVENTA LO QUE NO SE PUEDE COMPARAR. Si el módulo cambió entre el
 * inicial y el final, o si hay estibas y no se sabe cuántas cajas trae
 * cada una (falta el material), esa comparación queda en `null` con su
 * `motivo`, en vez de mostrar un número que parece una diferencia y es
 * solo que se restaron cosas distintas.
 */

export type Unidad = "estibas" | "cajas";
export type Sitio = { ubicacion_id: string; cant: number; unidad: Unidad };

export type RenglonCorte = {
  linea: string;
  cajas_depa: number;
  material_id: string | null;
  origen: Sitio | null;
  destino: Sitio | null;
  nota: string | null;
};

export type Corte = {
  id: string;
  tipo: "inicial" | "final";
  inicial_id: string | null;
  cortado_en: string;
  nota: string | null;
  creado_por: string | null;
  renglones: RenglonCorte[];
};

/** Cajas que trae una estiba de ese material, o null si no se sabe. */
export type CajasPorEstiba = (materialId: string | null) => number | null;

/** Pasa un sitio a cajas. Las estibas necesitan las cajas por estiba. */
export function aCajas(s: Sitio | null, porEstiba: number | null): number | null {
  if (!s) return null;
  if (s.unidad === "cajas") return s.cant;
  if (porEstiba == null || !(porEstiba > 0)) return null;
  return s.cant * porEstiba;
}

export type Lado = {
  /** Del corte inicial y del final, ya en cajas (null si no se pudo pasar). */
  ini: number | null;
  fin: number | null;
  /** Lo que se movió en el módulo: bajó (origen) o subió (destino). */
  mov: number | null;
  /** pasadas − mov. */
  dif: number | null;
  /** Por qué no hay diferencia, si no la hay. */
  motivo: string | null;
};

export type FilaCorte = {
  linea: string;
  ini: number;
  fin: number;
  pasadas: number;
  /** El contador final quedó por debajo del inicial: se reinició o se digitó mal. */
  contadorAtras: boolean;
  origen: Lado;
  destino: Lado;
  /** Con el mismo material puesto en las dos fotos (o el del final). */
  material_id: string | null;
};

export type Analisis = {
  /** Horas entre el inicial y el final. */
  horas: number;
  filas: FilaCorte[];
  /** Líneas que se cortaron en un lado y en el otro no: no se pueden restar. */
  soloInicial: string[];
  soloFinal: string[];
  /** Total de cajas por la depa entre las líneas que sí se compararon. */
  totalPasadas: number;
};

const vacio = (motivo: string): Lado => ({ ini: null, fin: null, mov: null, dif: null, motivo });

function lado(
  a: Sitio | null, b: Sitio | null, porEstiba: number | null,
  pasadas: number, signo: 1 | -1, falta: string,
): Lado {
  if (!a || !b) return vacio(falta);
  const ini = aCajas(a, porEstiba), fin = aCajas(b, porEstiba);
  if (a.ubicacion_id !== b.ubicacion_id) {
    return { ini, fin, mov: null, dif: null, motivo: "Cambió de módulo entre el inicial y el final" };
  }
  if (ini == null || fin == null) {
    return { ini, fin, mov: null, dif: null, motivo: "Hay estibas y falta el material para pasarlas a cajas" };
  }
  /* signo = 1 para el origen (bajó = ini − fin) y −1 para el destino
     (subió = fin − ini): el mismo cálculo con el signo cambiado. */
  const mov = signo * (ini - fin);
  return { ini, fin, mov, dif: pasadas - mov, motivo: null };
}

export function analizar(ini: Corte, fin: Corte, porEstiba: CajasPorEstiba): Analisis {
  const mapaIni = new Map(ini.renglones.map((r) => [r.linea, r]));
  const mapaFin = new Map(fin.renglones.map((r) => [r.linea, r]));
  const filas: FilaCorte[] = [];
  for (const [linea, a] of mapaIni) {
    const b = mapaFin.get(linea);
    if (!b) continue;
    /* El material del final manda: es el que corría al cerrar. */
    const mat = b.material_id ?? a.material_id;
    const est = porEstiba(mat);
    const pasadas = b.cajas_depa - a.cajas_depa;
    filas.push({
      linea, ini: a.cajas_depa, fin: b.cajas_depa, pasadas,
      contadorAtras: pasadas < 0,
      origen: lado(a.origen, b.origen, est, pasadas, 1, "Falta de dónde tomaba en uno de los dos cortes"),
      destino: lado(a.destino, b.destino, est, pasadas, -1, "Falta dónde estaba ubicado en uno de los dos cortes"),
      material_id: mat,
    });
  }
  filas.sort((x, y) => x.linea.localeCompare(y.linea, "es", { numeric: true }));
  return {
    horas: (Date.parse(fin.cortado_en) - Date.parse(ini.cortado_en)) / 3600000,
    filas,
    soloInicial: [...mapaIni.keys()].filter((l) => !mapaFin.has(l)).sort(),
    soloFinal: [...mapaFin.keys()].filter((l) => !mapaIni.has(l)).sort(),
    totalPasadas: filas.reduce((s, f) => s + (f.contadorAtras ? 0 : f.pasadas), 0),
  };
}

/** «hace 2 h 10 min» / «3 h» — cuánto duró el intervalo. */
export function duracion(horas: number): string {
  const min = Math.max(0, Math.round(horas * 60));
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
