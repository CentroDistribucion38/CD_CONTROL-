/* ===================================================================
   INVENTARIO FISCAL · EL AVANCE Y EL CRUCE (lógica pura, sin pantalla ni base)

   Cada hoja la cuentan dos personas —una del operador logístico y una de Bavaria—, cada
   una a ciegas. Aquí vive lo que se sabe de ellas SIN mirar lo que contaron:

   - EL AVANCE: cuántos renglones lleva cada equipo y si ya terminó. Solo cifras: nunca
     lo contado, para no soplarle a una persona lo que anotó la otra.
   - EL CRUCE: cuando las dos terminaron, quien arma el plan compara. Un renglón es
     «lo mismo» si coincide el sitio, el material y el vencimiento; y COINCIDE si además
     las cajas son las mismas. Lo que solo contó uno de los dos cuenta como diferencia.
   =================================================================== */

export type AvanceHoja = {
  olRenglones: number; olTermino: string | null;
  bavariaRenglones: number; bavariaTermino: string | null;
};

/** Lo que devuelve `inv_fiscal_avance` (una fila por hoja). */
export type AvanceBD = {
  fiscal_id: string; hoja_id: string; numero: number;
  ol_renglones: number | string | null; ol_termino: string | null;
  bavaria_renglones: number | string | null; bavaria_termino: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function avanceDesdeBD(f: AvanceBD): AvanceHoja {
  return {
    olRenglones: num(f.ol_renglones), olTermino: f.ol_termino ?? null,
    bavariaRenglones: num(f.bavaria_renglones), bavariaTermino: f.bavaria_termino ?? null,
  };
}

/** Para dibujar y probar: en qué punto está una hoja. */
export type EstadoHoja = "sin-empezar" | "contando" | "una-termino" | "lista";

export function estadoHoja(a: AvanceHoja): EstadoHoja {
  const ol = a.olTermino !== null, ba = a.bavariaTermino !== null;
  if (ol && ba) return "lista";
  if (ol || ba) return "una-termino";
  if (a.olRenglones > 0 || a.bavariaRenglones > 0) return "contando";
  return "sin-empezar";
}

/** El cruce solo se puede pedir cuando las dos personas terminaron. */
export const puedeCruzar = (a: AvanceHoja | undefined): boolean => !!a && estadoHoja(a) === "lista";

/** Terminó una sola persona (y contó algo): el fiscal igual puede ver lo que hay y aprobarlo, sin cruce. */
export const unaSolaTermino = (a: AvanceHoja | undefined): boolean =>
  !!a && estadoHoja(a) === "una-termino" && (a.olTermino !== null ? a.olRenglones : a.bavariaRenglones) > 0;

export const TEXTO_ESTADO: Record<EstadoHoja, string> = {
  "sin-empezar": "Sin empezar",
  "contando": "Contando",
  "una-termino": "Falta una",
  "lista": "Lista para cruzar",
};

/** «3 renglones · terminó» / «1 renglón · contando» / «sin empezar». */
export function textoEquipo(renglones: number, termino: string | null): string {
  if (termino !== null) return `${renglones} ${renglones === 1 ? "renglón" : "renglones"} · terminó`;
  if (renglones === 0) return "sin empezar";
  return `${renglones} ${renglones === 1 ? "renglón" : "renglones"} · contando`;
}

/* ---------------------------------------------------------------- el cruce */
export type EstadoFila = "COINCIDE" | "DIFIERE" | "SOLO_OL" | "SOLO_BAVARIA";

export type FilaCruce = {
  /** El id de la ubicación (para mandarla a validar o aprobarla). */
  ubicacionId?: string | null;
  ubicacion: string; sku: string; material: string;
  /** Estado del envase (BAJA, RETORNO…); null si es producto. */
  estadoEnvase?: string | null;
  averia?: boolean; pnc?: boolean;
  vencDia: number | null; vencMes: number | null; vencAnio: number | null;
  cajasOl: number | null; cajasBavaria: number | null; diferencia: number; estado: EstadoFila;
  /** true = esta diferencia se compensa con otra igual y de signo contrario en el mismo módulo (ver `compensarCruce`). */
  compensada?: boolean;
};

/** Lo que devuelve `inv_fiscal_cruce`. */
export type FilaCruceBD = {
  ubicacion_id?: string | null;
  ubicacion: string; sku: string; material: string;
  venc_dia: number | null; venc_mes: number | null; venc_anio: number | null;
  cajas_ol: number | string | null; cajas_bavaria: number | string | null; diferencia: number | string | null; estado: string;
  estado_envase?: string | null;
  averia?: boolean | null; pnc?: boolean | null;
};

const ESTADOS: EstadoFila[] = ["COINCIDE", "DIFIERE", "SOLO_OL", "SOLO_BAVARIA"];
const nul = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

export function filaDesdeBD(f: FilaCruceBD): FilaCruce {
  const estado = (ESTADOS as string[]).includes(f.estado) ? (f.estado as EstadoFila) : "DIFIERE";
  return {
    ubicacionId: f.ubicacion_id ?? null,
    ubicacion: f.ubicacion, sku: f.sku, material: f.material, estadoEnvase: f.estado_envase ?? null, averia: !!f.averia, pnc: !!f.pnc,
    vencDia: nul(f.venc_dia), vencMes: nul(f.venc_mes), vencAnio: nul(f.venc_anio),
    cajasOl: nul(f.cajas_ol), cajasBavaria: nul(f.cajas_bavaria), diferencia: num(f.diferencia), estado,
  };
}

/* ------------------------------------- lo que contó cada persona (para el Excel) */
export type ConteoPersona = {
  equipo: "OL" | "BAVARIA"; persona: string; ubicacion: string; sku: string; material: string;
  cajasPorEstiba: number | null; estibas: number | null; saldo: number | null; cajas: number | null; totalCajas: number;
  vencDia: number | null; vencMes: number | null; vencAnio: number | null; nota: string | null; contadoEn: string | null;
};
/** Lo que devuelve `inv_fiscal_conteos`. */
export type ConteoPersonaBD = {
  equipo: string; persona: string | null; ubicacion: string; sku: string; material: string;
  cajas_por_estiba: number | string | null; estibas: number | string | null; saldo: number | string | null; cajas: number | string | null;
  total_cajas: number | string | null; venc_dia: number | null; venc_mes: number | null; venc_anio: number | null;
  nota: string | null; contado_en: string | null;
};
export function conteoDesdeBD(c: ConteoPersonaBD): ConteoPersona {
  return {
    equipo: c.equipo === "BAVARIA" ? "BAVARIA" : "OL", persona: c.persona || "—", ubicacion: c.ubicacion, sku: c.sku, material: c.material,
    cajasPorEstiba: nul(c.cajas_por_estiba), estibas: nul(c.estibas), saldo: nul(c.saldo), cajas: nul(c.cajas), totalCajas: num(c.total_cajas),
    vencDia: nul(c.venc_dia), vencMes: nul(c.venc_mes), vencAnio: nul(c.venc_anio), nota: c.nota?.trim() ? c.nota.trim() : null, contadoEn: c.contado_en,
  };
}

/** «25/12/2026», «12/2026» (sin día) o «sin vencimiento». */
export function textoVenc(dia: number | null, mes: number | null, anio: number | null): string {
  if (anio == null && mes == null && dia == null) return "sin vencimiento";
  const p2 = (n: number) => String(n).padStart(2, "0");
  const partes: string[] = [];
  if (dia != null) partes.push(p2(dia));
  if (mes != null) partes.push(p2(mes));
  if (anio != null) partes.push(String(anio));
  return partes.join("/");
}

export type ResumenCruce = {
  total: number; coinciden: number; difieren: number; soloOl: number; soloBavaria: number;
  /** Renglones que no coinciden (los tres tipos de diferencia juntos). */
  conDiferencia: number;
  cajasOl: number; cajasBavaria: number;
};

export function resumenCruce(filas: FilaCruce[]): ResumenCruce {
  const r: ResumenCruce = { total: filas.length, coinciden: 0, difieren: 0, soloOl: 0, soloBavaria: 0, conDiferencia: 0, cajasOl: 0, cajasBavaria: 0 };
  for (const f of filas) {
    if (f.estado === "COINCIDE") r.coinciden++;
    else if (f.estado === "DIFIERE") r.difieren++;
    else if (f.estado === "SOLO_OL") r.soloOl++;
    else r.soloBavaria++;
    r.cajasOl += f.cajasOl ?? 0;
    r.cajasBavaria += f.cajasBavaria ?? 0;
  }
  r.conDiferencia = r.difieren + r.soloOl + r.soloBavaria;
  return r;
}

/** «Todo coincide» / «3 de 12 renglones no coinciden». */
export function titularCruce(r: ResumenCruce): string {
  if (r.total === 0) return "Ninguno de los dos contó nada en esta hoja.";
  if (r.conDiferencia === 0) return `Todo coincide: ${r.total} ${r.total === 1 ? "renglón" : "renglones"} iguales.`;
  return `${r.conDiferencia} de ${r.total} ${r.total === 1 ? "renglón no coincide" : "renglones no coinciden"}.`;
}

export const TEXTO_FILA: Record<EstadoFila, string> = {
  COINCIDE: "Coincide",
  DIFIERE: "Difiere",
  SOLO_OL: "Solo el operador",
  SOLO_BAVARIA: "Solo Bavaria",
};

/** Las que no coinciden primero (la base ya las manda así; esto lo garantiza aunque cambie). */
export function ordenarCruce(filas: FilaCruce[]): FilaCruce[] {
  return filas
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.estado === "COINCIDE" ? 1 : 0) - (b.f.estado === "COINCIDE" ? 1 : 0) || a.i - b.i)
    .map((x) => x.f);
}

/* ---------------------------------------------------------------- el cruce por MÓDULO
   El lado (izquierdo/derecho) NO cuenta: es muy perceptivo y delata dónde está cada cosa.
   Se compara por calle + módulo (A01): lo que una persona puso en un lado y la otra en el otro
   suma en el mismo módulo. Un mismo material con el mismo estado se junta, sin mirar el vencimiento. */
export const moduloDeUbicacion = (clave: string): string => clave.replace(/_(IZQ|DER)$/i, "");

export function cruceModulo(filas: FilaCruce[]): FilaCruce[] {
  const m = new Map<string, FilaCruce>();
  for (const f of filas) {
    const mod = moduloDeUbicacion(f.ubicacion);
    /* Se compara módulo, código y estado: la fecha de vencimiento NO entra (daría diferencias de más). */
    const k = [mod, f.sku, f.estadoEnvase ?? "", f.averia ? "A" : "", f.pnc ? "P" : ""].join("|");
    const x = m.get(k);
    if (!x) { m.set(k, { ...f, ubicacion: mod }); continue }
    /* De las fechas de un mismo renglón se muestra la más próxima. */
    if (f.vencDia != null && f.vencMes != null && f.vencAnio != null) {
      const nueva = f.vencAnio * 10000 + f.vencMes * 100 + f.vencDia;
      const vieja = x.vencDia != null && x.vencMes != null && x.vencAnio != null ? x.vencAnio * 10000 + x.vencMes * 100 + x.vencDia : null;
      if (vieja == null || nueva < vieja) { x.vencDia = f.vencDia; x.vencMes = f.vencMes; x.vencAnio = f.vencAnio }
    }
    x.cajasOl = f.cajasOl == null ? x.cajasOl : (x.cajasOl ?? 0) + f.cajasOl;
    x.cajasBavaria = f.cajasBavaria == null ? x.cajasBavaria : (x.cajasBavaria ?? 0) + f.cajasBavaria;
    if (!x.ubicacionId && f.ubicacionId) x.ubicacionId = f.ubicacionId;
  }
  return [...m.values()].map((f) => {
    const estado: EstadoFila = f.cajasOl == null ? "SOLO_BAVARIA" : f.cajasBavaria == null ? "SOLO_OL" : f.cajasOl === f.cajasBavaria ? "COINCIDE" : "DIFIERE";
    return { ...f, diferencia: (f.cajasOl ?? 0) - (f.cajasBavaria ?? 0), estado };
  });
}

/* LA COMPENSACIÓN. Un click del fiscal. Primero, un código que en total cuadra en la hoja (suma 0) se compensa entero. Luego lo más seguro: el mismo código y la misma cantidad (+N / −N) en cualquier sitio de la
   hoja. Después, en dos pasos:
     1. En cada módulo, una diferencia de +45 en un material y otra de −45 en otro se dan por compensadas (casi siempre es el
        mismo material anotado con otro código por cada persona).
     2. Entre módulos de la hoja, el MISMO código de material (sin mirar avería, estado ni PNC) y la misma cantidad, con +588 en un módulo y −588 en otro: uno
        contó esas cajas en un sitio y el otro en el de al lado, y en total cuadra.
   Solo se compensan cantidades EXACTAS y de signo contrario; lo demás queda como diferencia. */
export function compensarCruce(filas: FilaCruce[]): { filas: FilaCruce[]; pares: number } {
  const porModulo = new Map<string, FilaCruce[]>();
  for (const f of filas) {
    if (f.estado === "COINCIDE" || f.diferencia === 0) continue;
    const l = porModulo.get(f.ubicacion) ?? [];
    l.push(f); porModulo.set(f.ubicacion, l);
  }
  const marcadas = new Set<FilaCruce>();
  let pares = 0;
  /* Paso -1: un código que en TOTAL cuadra en la hoja (la suma de sus diferencias es 0: +52 +52 en un sitio y −104 en otro) se
     compensa entero, renglón por renglón, aunque las cantidades no sean iguales una a una. */
  const totales = new Map<string, FilaCruce[]>();
  for (const f of filas) {
    if (f.estado === "COINCIDE" || f.diferencia === 0) continue;
    const l = totales.get(f.sku) ?? [];
    l.push(f); totales.set(f.sku, l);
  }
  for (const l of totales.values()) {
    if (l.length < 2 || l.reduce((t, f) => t + f.diferencia, 0) !== 0) continue;
    for (const f of l) marcadas.add(f);
    pares += Math.max(1, Math.min(l.filter((f) => f.diferencia > 0).length, l.filter((f) => f.diferencia < 0).length));
  }
  /* Paso 0 (el primero): el MISMO código y la MISMA cantidad, una positiva y otra negativa, en cualquier sitio de la hoja
     (también dentro del mismo módulo). Va primero para que ese par no se lo «robe» otro material de +45/−45 en el módulo. */
  const porSku = new Map<string, FilaCruce[]>();
  for (const f of filas) {
    if (f.estado === "COINCIDE" || f.diferencia === 0 || marcadas.has(f)) continue;
    const l = porSku.get(f.sku) ?? [];
    l.push(f); porSku.set(f.sku, l);
  }
  for (const l of porSku.values()) {
    const usadas = new Set<FilaCruce>();
    for (const p of l.filter((f) => f.diferencia > 0)) {
      const q = l.find((n) => n.diferencia < 0 && !usadas.has(n) && -n.diferencia === p.diferencia);
      if (!q) continue;
      usadas.add(q); marcadas.add(p); marcadas.add(q); pares++;
    }
  }
  for (const l of porModulo.values()) {
    const neg = l.filter((f) => f.diferencia < 0 && !marcadas.has(f));
    const usadas = new Set<FilaCruce>();
    for (const p of l.filter((f) => f.diferencia > 0 && !marcadas.has(f))) {
      const q = neg.find((n) => !usadas.has(n) && -n.diferencia === p.diferencia);
      if (!q) continue;
      usadas.add(q); marcadas.add(p); marcadas.add(q); pares++;
    }
  }
  /* Paso 2: el mismo material, módulos distintos. */
  const porMaterial = new Map<string, FilaCruce[]>();
  for (const f of filas) {
    if (f.estado === "COINCIDE" || f.diferencia === 0 || marcadas.has(f)) continue;
    const k = f.sku; /* mismo código; la avería, el estado y el PNC no impiden compensar */
    const l = porMaterial.get(k) ?? [];
    l.push(f); porMaterial.set(k, l);
  }
  for (const l of porMaterial.values()) {
    const usadas = new Set<FilaCruce>();
    for (const p of l.filter((f) => f.diferencia > 0)) {
      const q = l.find((n) => n.diferencia < 0 && !usadas.has(n) && -n.diferencia === p.diferencia && n.ubicacion !== p.ubicacion);
      if (!q) continue;
      usadas.add(q); marcadas.add(p); marcadas.add(q); pares++;
    }
  }
  return { filas: filas.map((f) => (marcadas.has(f) ? { ...f, compensada: true } : f)), pares };
}

/** «BAJA · AVERÍA» / «PNC» / «»: lo que acompaña al material en el cruce (estado, avería, PNC). */
export const marcasDeFila = (f: Pick<FilaCruce, "estadoEnvase" | "averia" | "pnc">): string =>
  [f.estadoEnvase, f.averia && "AVERÍA", f.pnc && "PNC"].filter(Boolean).join(" · ");
