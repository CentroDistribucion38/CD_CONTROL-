import "server-only";
import { leerSupabase, refProyecto, type DatosSupabase } from "./supabase";
import { leerVercel, aUnidadDelTope, type DatosVercel } from "./vercel";
import { SUPABASE, VERCEL_HOBBY, CREDITO_PRO_USD, type PlanSupabase, type PlanVercel } from "./limites";

export type Nivel = "ok" | "atencion" | "alto" | "sin";
export type Medida = {
  id: string; fuente: "Supabase" | "Vercel"; titulo: string;
  usado: string; limite: string | null; pct: number | null; nivel: Nivel;
  /** Solo lo que se acumula en el mes (Vercel): a este ritmo, ¿cuánto al cerrar el mes? */
  proyeccion?: string; proyeccionPct?: number;
};

export type Panel = {
  generado: string;
  planSupabase: PlanSupabase; planVercel: PlanVercel; ref: string | null;
  supabase: DatosSupabase; vercel: DatosVercel;
  medidas: Medida[];
  lecturas: string[];
  diaDelMes: number; diasDelMes: number;
};

const nf = (d = 0) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: d });
export const fBytes = (b: number) => b >= 1024 ** 3 ? `${nf(2).format(b / 1024 ** 3)} GB` : b >= 1024 ** 2 ? `${nf(1).format(b / 1024 ** 2)} MB` : `${nf(0).format(b / 1024)} KB`;
const nivelDe = (p: number | null): Nivel => p == null ? "sin" : p >= 90 ? "alto" : p >= 70 ? "atencion" : "ok";
const planS = (): PlanSupabase => { const v = (process.env.CONSUMO_PLAN_SUPABASE ?? "free").toLowerCase(); return v === "pro" || v === "team" ? v : "free" };
const planV = (): PlanVercel => ((process.env.CONSUMO_PLAN_VERCEL ?? "hobby").toLowerCase() === "pro" ? "pro" : "hobby");

export async function armarPanel(): Promise<Panel> {
  const [supabase, vercel] = await Promise.all([leerSupabase(), leerVercel()]);
  const ps = planS(), pv = planV();
  const ahora = new Date();
  const dia = ahora.getUTCDate();
  const dias = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 0)).getUTCDate();
  const medidas: Medida[] = [];
  const lecturas: string[] = [];
  const L = SUPABASE[ps];

  if (supabase.ok) {
    const pct = (u: number, l: number) => (u / l) * 100;
    medidas.push({ id: "bd", fuente: "Supabase", titulo: "Base de datos", usado: fBytes(supabase.dbBytes!), limite: fBytes(L.bd), pct: pct(supabase.dbBytes!, L.bd), nivel: nivelDe(pct(supabase.dbBytes!, L.bd)) });
    medidas.push({ id: "alm", fuente: "Supabase", titulo: "Almacenamiento (fotos y archivos)", usado: fBytes(supabase.storageBytes!), limite: fBytes(L.almacenamiento), pct: pct(supabase.storageBytes!, L.almacenamiento), nivel: nivelDe(pct(supabase.storageBytes!, L.almacenamiento)) });
    medidas.push({ id: "usr", fuente: "Supabase", titulo: "Usuarios activos del mes", usado: nf().format(supabase.activosMes!), limite: nf().format(L.usuarios), pct: pct(supabase.activosMes!, L.usuarios), nivel: nivelDe(pct(supabase.activosMes!, L.usuarios)) });
    const t0 = supabase.tablas?.[0];
    lecturas.push(`La base de datos ocupa ${fBytes(supabase.dbBytes!)} de ${fBytes(L.bd)} (${nf(1).format(pct(supabase.dbBytes!, L.bd))} %).` +
      (t0 && supabase.dbBytes ? ` La tabla que más pesa es «${t0.tabla}»: ${fBytes(t0.bytes)}, el ${nf(0).format(pct(t0.bytes, supabase.dbBytes))} % de la base.` : ""));
    const b0 = supabase.buckets?.[0];
    if (b0 && supabase.storageBytes) lecturas.push(`En almacenamiento, el balde «${b0.bucket}» guarda ${fBytes(b0.bytes)} en ${nf().format(b0.objetos)} archivos (${nf(0).format(pct(b0.bytes, supabase.storageBytes))} % de lo guardado).`);
    const c0 = supabase.consultas?.[0];
    if (c0) lecturas.push(`La consulta que más tiempo de base se lleva: ${nf().format(c0.llamadas)} llamadas, ${nf(0).format(c0.segTotal)} s en total, ${nf(0).format(c0.msMedio)} ms cada una. «${c0.q.slice(0, 90)}…»`);
  }

  if (vercel.ok) {
    const servicios = vercel.servicios ?? [];
    if (pv === "hobby") {
      for (const m of VERCEL_HOBBY) {
        const filas = servicios.filter((s) => m.re.test(s.servicio));
        if (!filas.length) continue;
        const usado = filas.reduce((t, s) => t + aUnidadDelTope(s.cantidad, s.unidad, m.tipo), 0);
        const pct = (usado / m.limite) * 100, proy = (usado / Math.max(1, dia)) * dias;
        const f = (n: number) => `${nf(m.tipo === "n" ? 0 : 1).format(n)}${m.unidad ? " " + m.unidad : ""}`;
        medidas.push({ id: "v-" + m.titulo, fuente: "Vercel", titulo: m.titulo, usado: f(usado), limite: f(m.limite), pct, nivel: nivelDe(pct), proyeccion: f(proy), proyeccionPct: (proy / m.limite) * 100 });
      }
    } else {
      const pct = (vercel.costoMes! / CREDITO_PRO_USD) * 100, proy = (vercel.costoMes! / Math.max(1, dia)) * dias;
      medidas.push({ id: "v-pro", fuente: "Vercel", titulo: "Crédito mensual de uso (Pro)", usado: `US$ ${nf(2).format(vercel.costoMes!)}`, limite: `US$ ${nf(0).format(CREDITO_PRO_USD)}`, pct, nivel: nivelDe(pct), proyeccion: `US$ ${nf(2).format(proy)}`, proyeccionPct: (proy / CREDITO_PRO_USD) * 100 });
    }
    const s0 = servicios.find((s) => s.efectivo > 0) ?? servicios[0];
    if (s0) lecturas.push(`En Vercel, lo que más consume este mes es «${s0.servicio}»: ${nf(1).format(s0.cantidad)} ${s0.unidad}${s0.efectivo > 0 ? ` (US$ ${nf(2).format(s0.efectivo)})` : ""}.`);
    const alto = medidas.filter((m) => m.fuente === "Vercel" && m.proyeccionPct != null).sort((a, b) => b.proyeccionPct! - a.proyeccionPct!)[0];
    if (alto) lecturas.push(`A este ritmo, «${alto.titulo}» llegaría a ${alto.proyeccion} al cerrar el mes (${nf(0).format(alto.proyeccionPct!)} % de lo que incluye el plan).`);
  }

  medidas.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  return { generado: ahora.toISOString(), planSupabase: ps, planVercel: pv, ref: refProyecto(), supabase, vercel, medidas, lecturas, diaDelMes: dia, diasDelMes: dias };
}
