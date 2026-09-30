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
 * VARIOS MÓDULOS POR LADO. Se toma de varios módulos y se deja en varios:
 * cada lado es una LISTA. Se empareja módulo con módulo (el mismo módulo en
 * el inicial y en el final), se calcula cuánto se movió en cada uno y el
 * total de la línea es la SUMA de los emparejados: es ese total el que se
 * compara con lo que contó la depa. Un módulo que bajó y otro que subió
 * (alguien repuso estibas) se compensan en la suma, y el detalle lo muestra.
 *
 * NO SE INVENTA LO QUE NO SE PUEDE COMPARAR. Un módulo que está en un corte
 * y en el otro no, o que trae estibas sin saber cuántas cajas lleva cada una
 * (falta el material), NO entra a la suma: queda con su nota, y el lado
 * dice cuáles quedaron por fuera (`aviso`) para que nadie lea el total como
 * completo. Si ningún módulo se puede emparejar, la comparación queda en
 * `null` con su `motivo`, en vez de mostrar un número que parece una
 * diferencia y es solo que se restaron cosas distintas.
 */

export type Unidad = "estibas" | "cajas";
export type Sitio = { ubicacion_id: string; cant: number; unidad: Unidad };

export type RenglonCorte = {
  linea: string;
  cajas_depa: number;
  /** El PRODUCTO que sale de la línea (pasa a cajas lo de «Ubicados en»). */
  material_id: string | null;
  /** El ENVASE que entra a la línea (pasa a cajas lo de «Tomando de»). */
  envase_id: string | null;
  /** De dónde tomaban: uno o varios módulos (vacío = no se anotó). */
  origenes: Sitio[];
  /** Dónde estaban ubicados: uno o varios módulos. */
  destinos: Sitio[];
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

/** Un módulo de un lado, con lo que tenía en cada corte. */
export type ModuloLado = {
  ubicacion_id: string;
  /** Lo que se anotó en cada corte, tal cual (null si no estaba en ese corte). */
  a: Sitio | null;
  b: Sitio | null;
  /** Ya en cajas (null si no se pudo pasar o no estaba). */
  ini: number | null;
  fin: number | null;
  /** Lo que se movió aquí: bajó (origen) o subió (destino). null = no se pudo comparar. */
  mov: number | null;
  /** Por qué este módulo no entró a la suma, si no entró. */
  nota: string | null;
};

export type Lado = {
  /** SUMA de los módulos que se pudieron comparar, ya en cajas (null si ninguno). */
  ini: number | null;
  fin: number | null;
  /** Lo que se movió en total: bajó (origen) o subió (destino). */
  mov: number | null;
  /** pasadas − mov. */
  dif: number | null;
  /** Por qué no hay diferencia, si no la hay. */
  motivo: string | null;
  /** Cada módulo, en el orden en que se anotaron (los que solo están en el final, al último). */
  modulos: ModuloLado[];
  /** Hay diferencia, pero NO es de todo: qué módulos quedaron por fuera de la suma. */
  aviso: string | null;
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
  /** El producto y el envase puestos en las dos fotos (manda el del final). */
  material_id: string | null;
  envase_id: string | null;
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

const vacio = (motivo: string): Lado => ({ ini: null, fin: null, mov: null, dif: null, motivo, modulos: [], aviso: null });

function lado(
  a: Sitio[], b: Sitio[], porEstiba: number | null,
  pasadas: number, signo: 1 | -1, falta: string, queFalta: "envase" | "material",
  nombre: (id: string) => string,
): Lado {
  if (a.length === 0 || b.length === 0) return vacio(falta);
  const enB = new Map(b.map((x) => [x.ubicacion_id, x]));
  const enA = new Map(a.map((x) => [x.ubicacion_id, x]));
  const ids = [...a.map((x) => x.ubicacion_id), ...b.filter((x) => !enA.has(x.ubicacion_id)).map((x) => x.ubicacion_id)];
  const modulos: ModuloLado[] = ids.map((id) => {
    const sa = enA.get(id) ?? null, sb = enB.get(id) ?? null;
    const ini = aCajas(sa, porEstiba), fin = aCajas(sb, porEstiba);
    if (!sa || !sb) {
      return { ubicacion_id: id, a: sa, b: sb, ini, fin, mov: null,
               nota: sa ? "Solo estaba en el inicial" : "Solo está en el final" };
    }
    if (ini == null || fin == null) {
      return { ubicacion_id: id, a: sa, b: sb, ini, fin, mov: null,
               nota: `Hay estibas y falta el ${queFalta} para pasarlas a cajas` };
    }
    /* signo = 1 para el origen (bajó = ini − fin) y −1 para el destino
       (subió = fin − ini): el mismo cálculo con el signo cambiado. */
    return { ubicacion_id: id, a: sa, b: sb, ini, fin, mov: signo * (ini - fin), nota: null };
  });
  const entran = modulos.filter((m) => m.mov !== null);
  if (entran.length === 0) {
    const sinFactor = modulos.find((m) => m.a && m.b && m.nota);
    const cajasDe = (l: Sitio[]) => {
      const v = l.map((x) => aCajas(x, porEstiba));
      return v.some((x) => x == null) ? null : v.reduce<number>((t, x) => t + (x as number), 0);
    };
    return {
      ini: cajasDe(a), fin: cajasDe(b), mov: null, dif: null,
      motivo: sinFactor ? sinFactor.nota : "Cambió de módulo entre el inicial y el final",
      modulos, aviso: null,
    };
  }
  const mov = entran.reduce((t, m) => t + (m.mov as number), 0);
  const fuera = modulos.filter((m) => m.mov === null);
  return {
    ini: entran.reduce((t, m) => t + (m.ini as number), 0),
    fin: entran.reduce((t, m) => t + (m.fin as number), 0),
    mov, dif: pasadas - mov, motivo: null, modulos,
    aviso: fuera.length
      ? `Quedaron por fuera de la suma: ${fuera.map((m) => `${nombre(m.ubicacion_id)} (${(m.nota ?? "").toLowerCase()})`).join("; ")}. La diferencia es solo de lo que sí se pudo comparar.`
      : null,
  };
}

export function analizar(
  ini: Corte, fin: Corte, porEstiba: CajasPorEstiba,
  /** Cómo se llama un módulo, para los avisos (por defecto, su id). */
  nombre: (id: string) => string = (id) => id,
): Analisis {
  const mapaIni = new Map(ini.renglones.map((r) => [r.linea, r]));
  const mapaFin = new Map(fin.renglones.map((r) => [r.linea, r]));
  const filas: FilaCorte[] = [];
  for (const [linea, a] of mapaIni) {
    const b = mapaFin.get(linea);
    if (!b) continue;
    /* El material del final manda: es el que corría al cerrar. Lo que se
       TOMA es envase y lo que queda UBICADO es producto: cada lado se pasa
       a cajas con el factor de SU material, no con el del otro. */
    const mat = b.material_id ?? a.material_id;
    const env = b.envase_id ?? a.envase_id;
    const estProducto = porEstiba(mat);
    const estEnvase = porEstiba(env);
    const pasadas = b.cajas_depa - a.cajas_depa;
    filas.push({
      linea, ini: a.cajas_depa, fin: b.cajas_depa, pasadas,
      contadorAtras: pasadas < 0,
      origen: lado(a.origenes, b.origenes, estEnvase, pasadas, 1, "Falta de dónde tomaba en uno de los dos cortes", "envase", nombre),
      destino: lado(a.destinos, b.destinos, estProducto, pasadas, -1, "Falta dónde estaba ubicado en uno de los dos cortes", "material", nombre),
      material_id: mat,
      envase_id: env,
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

/* ---------------------------------------------------------------------
   LEER LOS RENGLONES DE LA BASE. Los módulos de cada lado están en
   `inv_corte_sitios` (una fila por módulo). Los cortes hechos cuando solo
   cabía UN módulo no tienen filas ahí: su módulo está en las columnas viejas
   del renglón (origen_* / destino_*) y de ahí se lee. Sin esto, cada corte
   viejo saldría sin origen ni destino.
   --------------------------------------------------------------------- */
export type FilaRenglonBD = {
  id: string; corte_id: string; linea: string; cajas_depa: number | string;
  material_id: string | null; envase_id: string | null; nota: string | null;
  origen_ubicacion_id: string | null; origen_cant: number | string | null; origen_unidad: string | null;
  destino_ubicacion_id: string | null; destino_cant: number | string | null; destino_unidad: string | null;
};
export type FilaSitioBD = { renglon_id: string; rol: string; orden: number; ubicacion_id: string; cant: number | string; unidad: string };

export function renglonesPorCorte(ren: FilaRenglonBD[], sit: FilaSitioBD[]): Map<string, RenglonCorte[]> {
  const sitiosDe = new Map<string, { origen: Sitio[]; destino: Sitio[] }>();
  [...sit].sort((a, b) => a.orden - b.orden).forEach((x) => {
    const e = sitiosDe.get(x.renglon_id) ?? { origen: [], destino: [] };
    e[x.rol === "destino" ? "destino" : "origen"].push({ ubicacion_id: x.ubicacion_id, cant: Number(x.cant), unidad: x.unidad as Unidad });
    sitiosDe.set(x.renglon_id, e);
  });
  const viejo = (u: string | null, c: number | string | null, un: string | null): Sitio[] =>
    u && c !== null && un ? [{ ubicacion_id: u, cant: Number(c), unidad: un as Unidad }] : [];
  const porCorte = new Map<string, RenglonCorte[]>();
  for (const r of ren) {
    const l = porCorte.get(r.corte_id) ?? [];
    const nuevos = sitiosDe.get(r.id);
    l.push({
      linea: r.linea, cajas_depa: Number(r.cajas_depa), material_id: r.material_id, envase_id: r.envase_id,
      origenes: nuevos?.origen.length ? nuevos.origen : viejo(r.origen_ubicacion_id, r.origen_cant, r.origen_unidad),
      destinos: nuevos?.destino.length ? nuevos.destino : viejo(r.destino_ubicacion_id, r.destino_cant, r.destino_unidad),
      nota: r.nota,
    });
    porCorte.set(r.corte_id, l);
  }
  return porCorte;
}
