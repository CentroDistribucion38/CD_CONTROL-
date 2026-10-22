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
  vencDia: number | null; vencMes: number | null; vencAnio: number | null;
  cajasOl: number | null; cajasBavaria: number | null; diferencia: number; estado: EstadoFila;
};

/** Lo que devuelve `inv_fiscal_cruce`. */
export type FilaCruceBD = {
  ubicacion_id?: string | null;
  ubicacion: string; sku: string; material: string;
  venc_dia: number | null; venc_mes: number | null; venc_anio: number | null;
  cajas_ol: number | string | null; cajas_bavaria: number | string | null; diferencia: number | string | null; estado: string;
  estado_envase?: string | null;
};

const ESTADOS: EstadoFila[] = ["COINCIDE", "DIFIERE", "SOLO_OL", "SOLO_BAVARIA"];
const nul = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

export function filaDesdeBD(f: FilaCruceBD): FilaCruce {
  const estado = (ESTADOS as string[]).includes(f.estado) ? (f.estado as EstadoFila) : "DIFIERE";
  return {
    ubicacionId: f.ubicacion_id ?? null,
    ubicacion: f.ubicacion, sku: f.sku, material: f.material, estadoEnvase: f.estado_envase ?? null,
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
   suma en el mismo módulo. Un mismo material con el mismo vencimiento se junta. */
export const moduloDeUbicacion = (clave: string): string => clave.replace(/_(IZQ|DER)$/i, "");

export function cruceModulo(filas: FilaCruce[]): FilaCruce[] {
  const m = new Map<string, FilaCruce>();
  for (const f of filas) {
    const mod = moduloDeUbicacion(f.ubicacion);
    const k = [mod, f.sku, f.estadoEnvase ?? "", f.vencDia ?? "", f.vencMes ?? "", f.vencAnio ?? ""].join("|");
    const x = m.get(k);
    if (!x) { m.set(k, { ...f, ubicacion: mod }); continue }
    x.cajasOl = f.cajasOl == null ? x.cajasOl : (x.cajasOl ?? 0) + f.cajasOl;
    x.cajasBavaria = f.cajasBavaria == null ? x.cajasBavaria : (x.cajasBavaria ?? 0) + f.cajasBavaria;
    if (!x.ubicacionId && f.ubicacionId) x.ubicacionId = f.ubicacionId;
  }
  return [...m.values()].map((f) => {
    const estado: EstadoFila = f.cajasOl == null ? "SOLO_BAVARIA" : f.cajasBavaria == null ? "SOLO_OL" : f.cajasOl === f.cajasBavaria ? "COINCIDE" : "DIFIERE";
    return { ...f, diferencia: (f.cajasOl ?? 0) - (f.cajasBavaria ?? 0), estado };
  });
}
