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
  /** Si los módulos salieron del FEFO y no del corte: de cuál y para qué líneas. */
  fefo?: FefoPar;
};

/** De dónde salieron los módulos de un par cuando no se anotaron en el corte. */
export type FefoPar = {
  /** Las líneas cuyos módulos se leyeron del FEFO. */
  lineas: string[];
  /** El FEFO de ANTES del corte inicial y el de DESPUÉS del corte final. */
  antes: ConteoRef | null;
  despues: ConteoRef | null;
  /** Por qué no se pudo leer, si no se pudo. */
  falta: string | null;
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

/* ---------------------------------------------------------------------
   EL CORTE CONTRA EL CONTEO DEL INVENTARIO.

   Cada módulo que aparece en el corte se compara con lo que el conteo
   encontró en ESE módulo, del MISMO material: el envase de «Tomando de» y el
   producto de «Ubicados en». Son tres números, todos en cajas:
     corte inicial · conteo · corte final
   y dos diferencias: conteo − inicial y conteo − final.

   UN MÓDULO QUE SE ESTÁ CONSUMIENDO NO TIENE POR QUÉ DAR CERO contra cada
   corte: entre el inicial y el final baja. Lo que sí tiene que pasar, si el
   conteo se hizo entre los dos cortes, es que CAIGA ENTRE LOS DOS. Esa es la
   lectura: «entre los dos cortes» o «fuera del rango».

   NO SE INVENTA:
     · Un módulo que el conteo no visitó queda «sin contar», no en cero.
     · Si se visitó y ese material no aparece, son cero cajas, y se dice.
     · Lo averiado y el PNC del mismo material se suman APARTE: no son
       inventario bueno y mezclarlos taparía diferencias.
     · Si falta uno de los dos cortes en ese módulo (no estaba, o son estibas
       sin factor) no hay rango: se muestra la diferencia que sí existe.
   --------------------------------------------------------------------- */
export type ConteoRef = { id: string; codigo: string; /** «2026-09-30», el día del análisis. */ fecha: string; enviado_en: string | null };
export type LineaConteo = { conteo_id: string; producto_id: string; ubicacion_id: string | null; total_cajas: number; averia: boolean; pnc: boolean };

export type ModuloCruce = {
  ubicacion_id: string;
  /** Lo que había en el corte inicial y en el final, en cajas. */
  ini: number | null;
  fin: number | null;
  /** Cajas buenas de ese material contadas en el módulo (null = el conteo no visitó el módulo). */
  conteo: number | null;
  /** Cajas del mismo material marcadas como avería o PNC. */
  aparte: number;
  /** Lo que cambió entre los dos cortes (final − inicial, con signo: el origen baja, el destino sube). */
  movCorte: number | null;
  /** Lo que cambió según el inventario (conteo − inicial). */
  movConteo: number | null;
  /** movConteo − movCorte, que es conteo − final: > 0 sobran cajas, < 0 faltan. */
  dif: number | null;
  lectura: "cuadra" | "no_cuadra" | "sin_contar" | "sin_rango";
  nota: string | null;
};
/** El lado entero contra la depa. «esperado» es lo que la depa dice que cambió (origen −, destino +). */
export type TotalCruce = {
  esperado: number;
  ini: number; fin: number;
  /** Suma de lo que cambió entre los cortes, y cuánto se aparta de la depa. */
  corte: number; difCorte: number;
  /** Lo contado: null si falta contar algún módulo (no se puede comparar contra la depa completa). */
  conteo: number | null; movConteo: number | null; difConteo: number | null;
  sinContar: number;
};
export type CruceLado = {
  material_id: string | null; modulos: ModuloCruce[]; motivo: string | null; total: TotalCruce | null;
  /** Lo que dice el análisis del lado cuando no pudo sumar todo (módulo que cambió, estibas sin factor…). */
  nota: string | null;
};
export type CruceLinea = { linea: string; depaIni: number; depaFin: number; pasadas: number; origen: CruceLado; destino: CruceLado;
  /** Los módulos salieron del FEFO y solo cuenta el envase: no hay «Ubicados en». */
  soloEnvase?: boolean };

/** Por debajo de media caja es redondeo, no diferencia. */
const parejo = (n: number) => Math.abs(n) < 0.5;

function cruceLado(lado: Lado, material: string | null, que: string, conteoId: string, lineas: LineaConteo[],
                   pasadas: number, signo: 1 | -1): CruceLado {
  if (!material) return { material_id: null, modulos: [], total: null, nota: null, motivo: `La línea no dice ${que}: no se sabe qué buscar en el conteo` };
  const delConteo = lineas.filter((l) => l.conteo_id === conteoId);
  const modulos = lado.modulos.map((m): ModuloCruce => {
    const movCorte = m.ini == null || m.fin == null ? null : m.fin - m.ini;
    const enModulo = delConteo.filter((l) => l.ubicacion_id === m.ubicacion_id);
    if (enModulo.length === 0) {
      return { ubicacion_id: m.ubicacion_id, ini: m.ini, fin: m.fin, conteo: null, aparte: 0, movCorte, movConteo: null, dif: null,
               lectura: "sin_contar", nota: "El conteo no pasó por este módulo" };
    }
    const delMaterial = enModulo.filter((l) => l.producto_id === material);
    const buenas = delMaterial.filter((l) => !l.averia && !l.pnc).reduce((t, l) => t + Number(l.total_cajas), 0);
    const aparte = delMaterial.filter((l) => l.averia || l.pnc).reduce((t, l) => t + Number(l.total_cajas), 0);
    const movConteo = m.ini == null ? null : buenas - m.ini;
    const dif = m.fin == null ? null : buenas - m.fin;
    const hayCortes = movCorte !== null && dif !== null;
    return {
      ubicacion_id: m.ubicacion_id, ini: m.ini, fin: m.fin, conteo: buenas, aparte, movCorte, movConteo, dif,
      lectura: !hayCortes ? "sin_rango" : parejo(dif as number) ? "cuadra" : "no_cuadra",
      nota: delMaterial.length === 0 ? "El material no apareció en el conteo" : null,
    };
  });
  /* Contra la depa: solo los módulos que se pudieron comparar entre los dos cortes (los mismos de la suma del análisis). */
  const comparables = modulos.filter((m) => m.movCorte !== null);
  let total: TotalCruce | null = null;
  if (lado.mov !== null && comparables.length > 0) {
    const esperado = signo * pasadas;
    const corte = comparables.reduce((t, m) => t + (m.movCorte as number), 0);
    const contados = comparables.filter((m) => m.conteo !== null && m.movConteo !== null);
    const completo = contados.length === comparables.length;
    const movConteo = completo ? contados.reduce((t, m) => t + (m.movConteo as number), 0) : null;
    total = {
      esperado,
      ini: comparables.reduce((t, m) => t + (m.ini as number), 0),
      fin: comparables.reduce((t, m) => t + (m.fin as number), 0),
      corte, difCorte: corte - esperado,
      conteo: completo ? contados.reduce((t, m) => t + (m.conteo as number), 0) : null,
      movConteo, difConteo: movConteo === null ? null : movConteo - esperado,
      sinContar: comparables.length - contados.length,
    };
  }
  return { material_id: material, modulos, motivo: null, total, nota: lado.motivo ?? lado.aviso };
}

export function cruzar(a: Analisis, conteoId: string, lineas: LineaConteo[]): CruceLinea[] {
  return a.filas.map((f) => ({
    linea: f.linea, depaIni: f.ini, depaFin: f.fin, pasadas: f.pasadas,
    /* El origen BAJA lo que pasó por la depa; el destino SUBE. */
    origen: cruceLado(f.origen, f.envase_id, "el envase", conteoId, lineas, f.pasadas, -1),
    destino: cruceLado(f.destino, f.material_id, "el material", conteoId, lineas, f.pasadas, 1),
    soloEnvase: !!a.fefo?.lineas.includes(f.linea),
  }));
}

/** El día de Colombia de un instante, «2026-09-30» (Colombia es siempre UTC−5). */
export const diaColombia = (iso: string): string =>
  new Date(Date.parse(iso) - 5 * 3600000).toISOString().slice(0, 10);

/**
 * CON QUÉ CONTEO SE COMPARA SI NADIE ESCOGE: el del mismo día del corte
 * inicial (si hay varios, el enviado más tarde); si no hay, el de la fecha
 * más cercana. Sin conteos, ninguno.
 */
export function conteoPorDefecto(ini: Corte, conteos: ConteoRef[]): string | null {
  if (conteos.length === 0) return null;
  const dia = diaColombia(ini.cortado_en);
  const dist = (c: ConteoRef) => Math.abs(Date.parse(c.fecha + "T00:00:00Z") - Date.parse(dia + "T00:00:00Z"));
  const orden = [...conteos].sort((x, y) =>
    dist(x) - dist(y) || (y.enviado_en ?? "").localeCompare(x.enviado_en ?? "") || x.codigo.localeCompare(y.codigo));
  return orden[0].id;
}


/* =====================================================================
   LA TABLA DE LA DIFERENCIA (una por línea)

   Una fila por cosa que se mide, y cada una con lo que había AL EMPEZAR, lo que
   había AL TERMINAR, cuánto SE MOVIÓ (final − inicial, con signo) y la
   DIFERENCIA CON LA DEPA: lo que se movió − lo que debía moverse. El origen
   debe BAJAR lo que pasó por la depa y el destino debe SUBIR lo mismo:

       origen:  debía moverse −pasadas      destino:  debía moverse +pasadas

   «Según el corte» es inicial → final. «Según el inventario» es el corte
   inicial → lo que contó el inventario. Con UN módulo por lado, esas dos filas
   son las que se comparan con la depa. Con varios, cada módulo trae sus dos
   filas (sin diferencia con la depa: un módulo solo no tiene por qué mover lo
   de toda la línea) y la comparación va en las filas de TOTAL.
   Todo en cajas: la pantalla lo pasa a estibas y unidades con los factores.
   ===================================================================== */
export type Tono = "ok" | "mal" | "gris";
export type FilaTabla = {
  clase: "depa" | "corte" | "inv" | "total";
  etiqueta: string;
  ini: number | null; fin: number | null;
  /** Se movió (final − inicial) y la diferencia con la depa (se movió − debía moverse). */
  mov: number | null; dif: number | null;
  lectura: string; tono: Tono | null;
  /** Cajas del mismo material marcadas como avería o PNC en el conteo: van aparte, no se suman. */
  aparte?: number;
};
export type GrupoTabla = {
  titulo: "Tomando de" | "Ubicados en";
  /** «A · 01 · DER», o «A · 01 · DER → A · 02 · DER» si cambió de módulo, o «2 módulos». */
  donde: string;
  material_id: string | null;
  debe: "BAJAR" | "SUBIR";
  /** Por qué no hay filas o por qué la suma no es de todo. */
  nota: string | null;
  filas: FilaTabla[];
};
export type TablaLinea = {
  linea: string;
  depa: FilaTabla;
  contadorAtras: boolean;
  grupos: GrupoTabla[];
  /** NO CUADRA si alguna comparación con la depa se aparta; CUADRA si todas coinciden; INCOMPLETO si falta algo por comparar. */
  estado: "cuadra" | "no_cuadra" | "incompleto";
};

const cajasTxt = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(Math.abs(n));

/** La lectura de una comparación con la depa: «Cuadra», o «Sobran · por qué». */
function lecturaDepa(mov: number, esperado: number, dif: number, nota: string | null): { lectura: string; tono: Tono } {
  if (parejo(dif)) return { lectura: "Cuadra con la depa", tono: "ok" };
  const porque = nota
    ? nota.charAt(0).toLowerCase() + nota.slice(1)
    : mov * esperado < 0 ? (esperado < 0 ? "subió cuando debía bajar" : "bajó cuando debía subir")
    : Math.abs(mov) < Math.abs(esperado) ? "se movió menos de lo que pasó por la depa"
    : "se movió más de lo que pasó por la depa";
  return { lectura: `${dif > 0 ? "Sobran" : "Faltan"} · ${porque}`, tono: "mal" };
}

export function armarTabla(c: CruceLinea, hayConteo: boolean, nombreUbi: (id: string) => string = (id) => id): TablaLinea {
  let incompleto = false, noCuadra = false;
  const depa: FilaTabla = {
    clase: "depa", etiqueta: "Depaletizadora", ini: c.depaIni, fin: c.depaFin, mov: c.pasadas, dif: null,
    lectura: c.pasadas < 0 ? "El contador retrocedió" : `Pasaron ${cajasTxt(c.pasadas)} cajas`, tono: null,
  };
  /* DEL FEFO: solo el envase (de dónde tomaba), y se compara con la depa sin segundo conteo: el FEFO ya es la fuente. */
  const fefo = !!c.soloEnvase;
  const de = fefo ? "FEFO" : "corte";
  const conteo = hayConteo && !fefo;
  const lados = fefo ? ([["Tomando de", c.origen, "BAJAR"]] as const) : ([["Tomando de", c.origen, "BAJAR"], ["Ubicados en", c.destino, "SUBIR"]] as const);
  const grupos = lados.map(([titulo, l, debe]): GrupoTabla => {
    const mods = l.modulos;
    const donde = mods.length === 0 ? "" : mods.length === 1 ? nombreUbi(mods[0].ubicacion_id)
      : mods.length === 2 && mods.every((m) => m.ini === null || m.fin === null) && mods.some((m) => m.ini === null) && mods.some((m) => m.fin === null)
        ? mods.map((m) => nombreUbi(m.ubicacion_id)).join(" → ")
        : `${mods.length} módulos`;
    const g: GrupoTabla = { titulo, donde, material_id: l.material_id, debe, nota: l.motivo ?? l.nota, filas: [] };
    if (l.motivo || mods.length === 0) { incompleto = true; return g; }
    const t = l.total;
    const corteFila = (etiqueta: string, m: { ini: number | null; fin: number | null; movCorte: number | null }, conDepa: boolean): FilaTabla => {
      if (!conDepa || !t) return { clase: "corte", etiqueta, ini: m.ini, fin: m.fin, mov: m.movCorte, dif: null, lectura: "", tono: null };
      const d = t.difCorte, r = lecturaDepa(t.corte, t.esperado, d, null);
      if (!parejo(d)) noCuadra = true;
      return { clase: "corte", etiqueta, ini: m.ini, fin: m.fin, mov: m.movCorte, dif: d, lectura: r.lectura, tono: r.tono };
    };
    if (mods.length === 1 && t) {
      const m = mods[0];
      g.filas.push(corteFila(`Según el ${de}`, m, true));
      if (conteo) {
        if (m.lectura === "sin_contar") {
          incompleto = true;
          g.filas.push({ clase: "inv", etiqueta: "Según el inventario", ini: m.ini, fin: null, mov: null, dif: null, lectura: "Sin contar · el conteo no pasó por este módulo", tono: "gris" });
        } else if (t.difConteo !== null && t.movConteo !== null) {
          const r = lecturaDepa(t.movConteo, t.esperado, t.difConteo, m.nota);
          if (!parejo(t.difConteo)) noCuadra = true;
          g.filas.push({ clase: "inv", etiqueta: "Según el inventario", ini: m.ini, fin: m.conteo, mov: t.movConteo, dif: t.difConteo, lectura: r.lectura, tono: r.tono, aparte: m.aparte });
        }
      }
      return g;
    }
    /* VARIOS MÓDULOS (o uno que cambió por otro): el detalle de cada uno y los totales. */
    for (const m of mods) {
      const nombre = nombreUbi(m.ubicacion_id);
      g.filas.push(corteFila(`${nombre} · según el ${de}`, m, false));
      if (!conteo) continue;
      const lect = m.lectura === "sin_contar" ? { lectura: "Sin contar · el conteo no pasó por este módulo", tono: "gris" as Tono }
        : m.lectura === "sin_rango" ? { lectura: "Falta un corte en este módulo", tono: "gris" as Tono }
        : m.lectura === "cuadra" ? { lectura: "Cuadra con el corte final", tono: "ok" as Tono }
        : { lectura: `${(m.dif as number) > 0 ? "Sobran" : "Faltan"} ${cajasTxt(m.dif as number)} cajas contra el corte final${m.nota ? " · " + m.nota.charAt(0).toLowerCase() + m.nota.slice(1) : ""}`, tono: "mal" as Tono };
      if (m.lectura === "sin_contar") incompleto = true;
      if (m.lectura === "no_cuadra") noCuadra = true;
      g.filas.push({ clase: "inv", etiqueta: `${nombre} · según el inventario`, ini: m.ini, fin: m.conteo, mov: m.movConteo, dif: null, lectura: lect.lectura, tono: lect.tono, aparte: m.aparte });
    }
    if (t) {
      g.filas.push({ ...corteFila(`Total según el ${de}`, { ini: t.ini, fin: t.fin, movCorte: t.corte }, true), clase: "total" });
      if (conteo) {
        if (t.difConteo === null || t.movConteo === null) {
          incompleto = true;
          g.filas.push({ clase: "total", etiqueta: "Total según el inventario", ini: t.ini, fin: null, mov: null, dif: null,
            lectura: `Falta contar ${t.sinContar} ${t.sinContar === 1 ? "módulo" : "módulos"}: no se puede comparar con la depa`, tono: "gris" });
        } else {
          const r = lecturaDepa(t.movConteo, t.esperado, t.difConteo, null);
          if (!parejo(t.difConteo)) noCuadra = true;
          g.filas.push({ clase: "total", etiqueta: "Total según el inventario", ini: t.ini, fin: t.conteo, mov: t.movConteo, dif: t.difConteo, lectura: r.lectura, tono: r.tono });
        }
      }
    } else incompleto = true;
    return g;
  });
  return { linea: c.linea, depa, contadorAtras: c.pasadas < 0, grupos, estado: noCuadra ? "no_cuadra" : incompleto ? "incompleto" : "cuadra" };
}

/* EL ENVASE DE UN RENGLÓN: el que se anotó en el corte; si no se anotó, el que
   el maestro dice que le corresponde al producto (`envase_sku`). `delMaestro`
   avisa que no lo escribió nadie en el corte sino que se dedujo del producto. */
export type MatEnv = { id: string; sku: string; nombre: string; envase_sku?: string | null };
export function envaseDelRenglon(envase_id: string | null, material_id: string | null, mats: MatEnv[]): { m: MatEnv | null; delMaestro: boolean } {
  const por = new Map(mats.map((x) => [x.id, x]));
  const anotado = envase_id ? por.get(envase_id) : undefined;
  if (anotado) return { m: anotado, delMaestro: false };
  const prod = material_id ? por.get(material_id) : undefined;
  const sku = prod?.envase_sku ?? null;
  const deducido = sku ? mats.find((x) => x.sku === sku) : undefined;
  return deducido ? { m: deducido, delMaestro: true } : { m: null, delMaestro: false };
}


/* =====================================================================
   LOS MÓDULOS SALEN DEL FEFO

   Al hacer el corte solo se pide el contador de la depa de cada línea. De
   DÓNDE TOMABA el envase y se lee del FEFO por
   DIFERENCIA, con dos recorridos enviados:

     ANTES   = el último recorrido enviado antes del corte inicial.
     DESPUÉS = el primer recorrido enviado después del corte final
               (o el que se escoja en «Conteo»).

   El envase de la línea es «Tomando de» en los módulos donde BAJÓ entre uno
   y otro. SOLO EL ENVASE: el producto y dónde queda ubicado no entran en
   este análisis. Con eso se arman los módulos que antes se tecleaban y el
   análisis de siempre (`analizar`, `cruzar`) corre igual.

   Si dos líneas corren el mismo material, lo que bajó o subió se REPARTE
   entre ellas según lo que cada una pasó por la depa: sin repartir, cada
   línea cargaría con lo de la otra.

   SOLO SE LEEN LAS LÍNEAS SIN MÓDULOS. Un corte que sí trae sus módulos
   (los hechos antes, o los anotados a mano) se analiza tal cual.
   ===================================================================== */

/** ¿Este renglón no trae módulos? Entonces salen del FEFO. */
export const sinModulos = (r: RenglonCorte) => r.origenes.length === 0 && r.destinos.length === 0;

/** ¿Alguna línea del final necesita los módulos del FEFO? */
export const usaFefo = (fin: Corte) => fin.renglones.some(sinModulos);

/** El recorrido enviado más reciente ANTES del corte inicial (sin contar `excepto`). */
export function fefoAntes(ini: Corte, conteos: ConteoRef[], excepto: string | null): ConteoRef | null {
  const dia = diaColombia(ini.cortado_en);
  const antes = conteos.filter((c) => c.id !== excepto &&
    (c.enviado_en ? Date.parse(c.enviado_en) <= Date.parse(ini.cortado_en) : c.fecha < dia));
  antes.sort((x, y) => (y.enviado_en ?? y.fecha).localeCompare(x.enviado_en ?? x.fecha) || y.codigo.localeCompare(x.codigo));
  return antes[0] ?? null;
}

/** El primer recorrido enviado DESPUÉS del corte final: el que ya refleja lo que pasó. */
export function fefoDespues(fin: Corte, conteos: ConteoRef[]): ConteoRef | null {
  const dia = diaColombia(fin.cortado_en);
  const despues = conteos.filter((c) => (c.enviado_en ? Date.parse(c.enviado_en) >= Date.parse(fin.cortado_en) : c.fecha > dia));
  despues.sort((x, y) => (x.enviado_en ?? x.fecha).localeCompare(y.enviado_en ?? y.fecha) || x.codigo.localeCompare(y.codigo));
  return despues[0] ?? null;
}

/** Con qué conteo se compara un par si nadie escoge: el FEFO de después si sus módulos salen de ahí; si no, el del día del inicial. */
export function conteoDelPar(ini: Corte, fin: Corte, conteos: ConteoRef[]): string | null {
  return usaFefo(fin) ? fefoDespues(fin, conteos)?.id ?? null : conteoPorDefecto(ini, conteos);
}

/** Cajas buenas de un material por módulo en un conteo. */
function cajasPorModulo(lineas: LineaConteo[] | undefined, material: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lineas ?? []) {
    if (l.producto_id !== material || !l.ubicacion_id || l.averia || l.pnc) continue;
    m.set(l.ubicacion_id, (m.get(l.ubicacion_id) ?? 0) + Number(l.total_cajas));
  }
  return m;
}

export type ParArmado = { ini: Corte; fin: Corte; a: Analisis };

/**
 * El par listo para mirar: con los módulos del FEFO en las líneas que no los
 * traen. `despuesId` es el recorrido de DESPUÉS (el que se escogió, o el de
 * `conteoDelPar`); el de ANTES se busca solo.
 */
export function armarPar(
  ini: Corte, fin: Corte, porEstiba: CajasPorEstiba, nombre: (id: string) => string,
  ctx: {
    conteos: ConteoRef[]; lineasPorConteo: Map<string, LineaConteo[]>;
    /** El envase de un renglón: el anotado o el del maestro. */
    envaseDe: (r: RenglonCorte) => string | null;
  },
  despuesId: string | null,
): ParArmado {
  if (!usaFefo(fin)) return { ini, fin, a: analizar(ini, fin, porEstiba, nombre) };

  const despues = ctx.conteos.find((c) => c.id === despuesId) ?? null;
  const antes = fefoAntes(ini, ctx.conteos, despues?.id ?? null);
  const mapaIni = new Map(ini.renglones.map((r) => [r.linea, r]));
  const lineasFefo: string[] = [];
  const sinEnvase: string[] = [];
  const falta = !antes ? "No hay un FEFO enviado antes del corte inicial para ver de dónde tomaba y dónde quedó."
    : !despues ? "Falta un FEFO enviado después del corte final: escoge uno en «Conteo» o espera a que se envíe."
    : null;

  /* Lo que pasó cada línea por la depa, para repartir cuando comparten material. */
  const pasadas = (r: RenglonCorte) => Math.max(0, r.cajas_depa - (mapaIni.get(r.linea)?.cajas_depa ?? 0));
  const envDe = (r: RenglonCorte) => ctx.envaseDe(r);
  const grupo = (clave: (r: RenglonCorte) => string | null, r: RenglonCorte) => {
    const k = clave(r);
    const mismos = k ? fin.renglones.filter((x) => sinModulos(x) && clave(x) === k) : [r];
    const tot = mismos.reduce((t, x) => t + pasadas(x), 0);
    return mismos.length <= 1 ? 1 : tot > 0 ? pasadas(r) / tot : 1 / mismos.length;
  };

  const hIni = new Map<string, RenglonCorte>(), hFin = new Map<string, RenglonCorte>();
  for (const r of fin.renglones) {
    if (!sinModulos(r)) continue;
    const base = mapaIni.get(r.linea);
    if (!base) continue;
    lineasFefo.push(r.linea);
    const env = envDe(r) ?? envDe(base), prod = r.material_id ?? base.material_id;
    const ri: RenglonCorte = { ...base, envase_id: env, material_id: prod, origenes: [], destinos: [] };
    const rf: RenglonCorte = { ...r, envase_id: env, material_id: prod, origenes: [], destinos: [] };
    if (!env) sinEnvase.push(r.linea);
    if (antes && despues) {
      const A = ctx.lineasPorConteo.get(antes.id), B = ctx.lineasPorConteo.get(despues.id);
      const compartido = () => grupo((x) => envDe(x), r);
      if (env) {
        const a = cajasPorModulo(A, env), b = cajasPorModulo(B, env), s = compartido();
        /* SOLO LOS MÓDULOS QUE EL FEFO DE DESPUÉS VISITÓ: uno que no pasó por ahí no está vacío, está sin contar. */
        const vistos = new Set((B ?? []).map((l) => l.ubicacion_id).filter(Boolean));
        for (const [u, ca] of a) { if (!vistos.has(u)) continue; const baja = ca - (b.get(u) ?? 0); if (baja > 0) { ri.origenes.push({ ubicacion_id: u, cant: ca, unidad: "cajas" }); rf.origenes.push({ ubicacion_id: u, cant: ca - baja * s, unidad: "cajas" }) } }
      }
    }
    hIni.set(r.linea, ri); hFin.set(r.linea, rf);
  }
  const nIni: Corte = { ...ini, renglones: ini.renglones.map((r) => hIni.get(r.linea) ?? r) };
  const nFin: Corte = { ...fin, renglones: fin.renglones.map((r) => hFin.get(r.linea) ?? r) };
  const a = analizar(nIni, nFin, porEstiba, nombre);
  /* Solo cuenta el ENVASE: de dónde tomaba. Si el FEFO no vio bajar nada, se dice eso y no «falta anotar». */
  for (const f of a.filas) {
    if (!lineasFefo.includes(f.linea)) continue;
    const l = f.origen;
    if (l.motivo && /^Falta de dónde/.test(l.motivo)) {
      l.motivo = sinEnvase.includes(f.linea) ? "Falta escoger el envase de esta línea en el corte: sin él no se sabe qué buscar en el FEFO."
        : falta ?? `El FEFO no ve que haya bajado ese envase entre ${antes!.codigo} y ${despues!.codigo}.`;
    }
  }
  a.fefo = { lineas: lineasFefo, antes, despues, falta };
  return { ini: nIni, fin: nFin, a };
}
