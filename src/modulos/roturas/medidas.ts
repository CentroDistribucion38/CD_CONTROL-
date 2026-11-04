import type { Rotura } from "./datos";

/**
 * LAS TRES MEDIDAS DE UNA ROTURA: CAJAS, UNIDADES Y HL.
 *
 * «Que esté en HL, en unidades y en cajas, para yo saber y conocer.»
 *
 * LO QUE SE REPORTA SON CAJAS (el cobro es cajas × unid. por caja × precio de la
 * botella). De ahí salen las otras dos:
 *
 *   cajas     rotas + contaminadas, tal como se registró.
 *   unidades  cajas × unid. por caja (botellas).
 *   hl        unidades × HL por unidad del Maestro de Pasivos.
 *
 * NULO Y NO CERO CUANDO FALTA UN DATO DEL MAESTRO: un cero se suma sin hacer
 * ruido y deja un total corto con cara de exacto; un nulo se cuenta aparte y se ve.
 *
 * Es puro (sin servidor ni navegador) para que lo usen la pantalla, el PDF y el Excel
 * con la MISMA cuenta: si cada uno sacara la suya, el día que cambie una regla dirían
 * cifras distintas y las dos serían creíbles.
 */
export type Medida = "cajas" | "unidades" | "hl";

export const MEDIDAS: { id: Medida; nombre: string; unidad: string }[] = [
  { id: "hl", nombre: "HL", unidad: "HL" },
  { id: "unidades", nombre: "Unidades", unidad: "Unid." },
  { id: "cajas", nombre: "Cajas", unidad: "Cajas" },
];

/** Por código de material: unidades por caja y HL por unidad (Maestro de Pasivos). */
export type MaestroHL = Map<string, { upc: number | null; hl: number | null }>;

export type Medidas = { cajas: number; unidades: number | null; hl: number | null };

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function medidasDe(r: Rotura, maestro?: MaestroHL | null): Medidas {
  const cajas = Math.max(0, Number(r.unidades_vidrio) || 0) + (Number(r.contaminadas) || 0);
  const m = maestro?.get(String(r.material ?? "").trim());
  const upc = Number(r.factor_caja) || m?.upc || null;
  const unidades = upc ? cajas * upc : null;
  const hu = m?.hl ?? null;
  const hl = unidades != null && hu != null ? r3(unidades * hu) : null;
  return { cajas, unidades, hl };
}

export const valorDe = (m: Medidas, medida: Medida): number | null => m[medida];

/** Las dimensiones de los Paretos. «registro» y «opm» son las dos lecturas honestas de «quién». */
export type Dim = "causa" | "area" | "registro" | "opm";

export const SIN_OPM = "Sin OPM · encontrada sin dueño";

/** El nombre de la barra de esa rotura en esa dimensión (null = «Sin dato»). */
export function nombreDim(r: Rotura, dim: Dim, nombres: Record<string, string>): string | null {
  switch (dim) {
    case "causa": return r.causa_nombre;
    case "area": return r.area_nombre ?? null;
    /* QUIÉN LA REGISTRÓ EN LA PLATAFORMA —el usuario—, no quién la rompió. */
    case "registro": return nombres[r.reportada_por ?? ""] || null;
    /* QUIÉN LA REPORTÓ DE VERDAD EN PISO: un OPM con su PIN. Las que alguien se encontró
       sin dueño no tienen OPM y se dice así, no «sin dato». */
    case "opm": return r.origen === "opm" ? (r.opm_nombre || "OPM sin nombre") : r.origen === "encontrada" ? SIN_OPM : (r.opm_nombre ?? null);
  }
}

/** La frase que dice lo que está pasando con quién reporta. Una sola, con números. */
export function lecturaReporte(rs: Rotura[], nombres: Record<string, string>) {
  const n = rs.length;
  const porUsuario = new Map<string, number>();
  let conOpm = 0;
  for (const r of rs) {
    const u = nombres[r.reportada_por ?? ""] || "Sin dato";
    porUsuario.set(u, (porUsuario.get(u) ?? 0) + 1);
    if (r.origen === "opm") conOpm++;
  }
  const top = [...porUsuario.entries()].sort((a, b) => b[1] - a[1])[0];
  const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);
  return {
    n, conOpm, pctOpm: pct(conOpm),
    usuario: top?.[0] ?? null, delUsuario: top?.[1] ?? 0, pctUsuario: pct(top?.[1] ?? 0),
  };
}
