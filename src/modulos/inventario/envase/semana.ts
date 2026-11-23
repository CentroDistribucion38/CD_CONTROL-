import { createClient } from "@/lib/supabase/server";
import { estadoDia, maestro, masDias, papeles, type FilaPlanBD } from "./calc";
import { hoyBogota, lunesDe, movimientosContab, planesDeSemana, productosDe, ultimaEntrada } from "./datos";

/**
 * EL CIERRE DE LA SEMANA PASADA Y CÓMO VA LA ACTUAL.
 *
 * «Así como subo toda la MB51 para revisar todo, me debería dar primero el cierre del plan de la semana pasada y la actual.»
 * «Con el reporte de adherencia yo cierro la semana y así digo qué quedó del plan de producción, y con eso validamos.»
 *
 * Por semana (lunes a domingo), SKU por SKU y día por día, en UNIDADES (la pantalla pasa a HL, cajas o estibas):
 *   · plan inicial y plan vigente (cada día con el último corte que lo cubre; si no hay corte, el inicial);
 *     en la semana actual, hoy cuenta hasta esta hora y los días que vienen no cuentan
 *   · notificado = Z01 − Z02 con fecha de contabilización de ese día (lo de madrugada cuenta en su día)
 *   · REAL = el reporte de adherencia de la semana (cajas × unidades por caja), si se cargó
 * La semana pasada queda CERRADA cuando la MB51 trae algo digitado desde las 6:00 del lunes siguiente.
 */
export type DiaSku = { planIni: number; planVig: number; planHasta: number; notif: number };
export type SkuSemana = { sku: string; nombre: string; dias: DiaSku[]; realUn: number | null; realCajas: number | null };
export type ResumenSemana = {
  lunes: string; domingo: string; semana: number | null; estado: "cerrada" | "abierta" | "en curso" | "sin plan";
  dias: { dia: string; estado: "cerrado" | "abierto" | "sin" | "futuro" }[];
  skus: SkuSemana[];
  /** Hay reporte de adherencia (lo real) de esta semana: cuándo se subió. */
  real: { subido: string; archivo: string | null } | null;
};
export type MaestroPlano = Record<string, { nombre: string; ml: number; ref: number; cpe: number }>;

type FilaAdh = { lunes: string; sku: string; producto: string | null; ref_nombre: number | null; cajas_real: number; archivo: string | null; subido_en: string };

export async function cierreDeSemanas(): Promise<{ semanas: ResumenSemana[]; maestro: MaestroPlano; mb51: string | null; error: string | null; faltaAdh: boolean }> {
  const hoy = hoyBogota();
  const ahora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const [hh, mm] = ahora.split(":").map(Number);
  const actual = lunesDe(hoy), pasada = masDias(actual, -7);
  const s = await createClient();
  const [u, pa, pb, mv, ad] = await Promise.all([
    ultimaEntrada(), planesDeSemana(pasada), planesDeSemana(actual), movimientosContab(pasada, masDias(actual, 6)),
    s.from("pe_adherencia").select("lunes, sku, producto, ref_nombre, cajas_real, archivo, subido_en").in("lunes", [pasada, actual]),
  ]);
  const faltaAdh = !!ad.error && /pe_adherencia|does not exist|PGRST20[25]|42P01/i.test(ad.error.message);
  const adh = ((ad.error ? [] : ad.data) ?? []).map((x) => ({ ...x, cajas_real: Number(x.cajas_real), ref_nombre: x.ref_nombre == null ? null : Number(x.ref_nombre) })) as FilaAdh[];
  const error = pa.error ?? pb.error ?? mv.error ?? (ad.error && !faltaAdh ? ad.error.message : null);

  const skus = new Set<string>();
  for (const f of [...pa.filas, ...pb.filas]) if (f.sku) skus.add(f.sku);
  const movZ = mv.filas.filter((m) => (m.clase === "Z01" || m.clase === "Z02") && /P$/i.test(m.material));
  for (const m of movZ) skus.add(m.material.replace(/P$/i, ""));
  for (const a of adh) skus.add(a.sku);
  const M = maestro([...pa.filas, ...pb.filas], await productosDe([...skus]));
  /* Lo que el maestro no sepa de un SKU que solo está en la adherencia: el nombre y las unidades por caja del reporte. */
  for (const a of adh) {
    const x = M.get(a.sku) ?? { nombre: "", ml: 0, ref: 0, cpe: 0 };
    M.set(a.sku, { ...x, nombre: x.nombre || a.producto || "", ref: x.ref || a.ref_nombre || 0 });
  }

  const semana = (lunes: string, ps: typeof pa): ResumenSemana => {
    const P = papeles(ps.planes);
    const ini = P.inicial ? ps.filas.filter((f) => f.plan_id === P.inicial!.id) : [];
    const unDe = (f: FilaPlanBD) => Number(f.unidades) || (f.formato_ml ? (Number(f.hl) * 1e5) / Number(f.formato_ml) : 0);
    const S = new Map<string, SkuSemana>();
    const x = (sku: string) => {
      let v = S.get(sku);
      if (!v) { v = { sku, nombre: M.get(sku)?.nombre ?? "", dias: Array.from({ length: 7 }, () => ({ planIni: 0, planVig: 0, planHasta: 0, notif: 0 })), realUn: null, realCajas: null }; S.set(sku, v) }
      return v;
    };
    const dias: ResumenSemana["dias"] = [];
    for (let i = 0; i < 7; i++) {
      const dia = masDias(lunes, i);
      dias.push({ dia, estado: estadoDia(dia, u.valor, hoy) });
      for (const f of ini) if (f.fecha === dia && f.sku) x(f.sku).dias[i].planIni += unDe(f);
      const c = P.corteDe(dia);
      for (const f of (c ? ps.filas.filter((r) => r.plan_id === c.id) : ini)) {
        if (f.fecha !== dia || !f.sku) continue;
        const d = x(f.sku).dias[i], un = unDe(f);
        d.planVig += un;
        d.planHasta += dia < hoy ? un : dia > hoy ? 0 : un * (f.hora < hh ? 1 : f.hora === hh ? mm / 60 : 0);
      }
    }
    for (const m of movZ) {
      const i = Math.round((Date.parse(m.fecha_contab + "T12:00:00Z") - Date.parse(lunes + "T12:00:00Z")) / 864e5);
      if (i < 0 || i > 6 || m.fecha_contab > hoy) continue;
      x(m.material.replace(/P$/i, "")).dias[i].notif += m.clase === "Z02" ? -Math.abs(m.cantidad) : m.cantidad;
    }
    const mias = adh.filter((a) => a.lunes === lunes);
    for (const a of mias) {
      const v = x(a.sku), ref = M.get(a.sku)?.ref || a.ref_nombre || 0;
      v.realCajas = (v.realCajas ?? 0) + a.cajas_real;
      v.realUn = ref ? (v.realUn ?? 0) + a.cajas_real * ref : v.realUn;
    }
    /* Con reporte, el SKU que no aparece en él produjo 0. */
    if (mias.length) for (const v of S.values()) {
      v.realCajas ??= 0;
      if (v.realUn == null) { const ref = M.get(v.sku)?.ref || 0; v.realUn = ref ? v.realCajas * ref : v.realCajas === 0 ? 0 : null }
    }
    const domingo = masDias(lunes, 6);
    const cerrada = !!u.valor && u.valor >= `${masDias(lunes, 7)}T06:00:00`;
    const ult = mias.map((a) => a.subido_en).sort().at(-1);
    return {
      lunes, domingo, semana: P.inicial?.semana ?? ps.planes[0]?.semana ?? null,
      estado: !ps.planes.length && !mias.length ? "sin plan" : domingo >= hoy ? "en curso" : cerrada ? "cerrada" : "abierta",
      dias, skus: [...S.values()], real: ult ? { subido: ult, archivo: mias.find((a) => a.subido_en === ult)?.archivo ?? null } : null,
    };
  };
  const semanas = [semana(pasada, pa), semana(actual, pb)];
  const usados = new Set(semanas.flatMap((w) => w.skus.map((k) => k.sku)));
  return { semanas, maestro: Object.fromEntries([...M].filter(([k]) => usados.has(k))), mb51: u.valor, error, faltaAdh };
}

/**
 * QUÉ SKU ESTÁ EN PRODUCCIÓN UN DÍA — para el análisis del cíclico de producto: «si tomo la familia de la Pet, debe salir el SKU
 * que está en producción». Del plan vigente de ese día (su corte; si no hay, el inicial): por SKU, en qué trenes y entre qué horas.
 * Lo de producción está en la línea o en palés sin ubicar, y explica diferencias del conteo.
 */
export type EnProduccion = Record<string, { trenes: string[]; desde: number; hasta: number; hl: number }>;
export async function enProduccionDe(dia: string): Promise<EnProduccion> {
  const ps = await planesDeSemana(lunesDe(dia));
  if (ps.error || !ps.planes.length) return {};
  const P = papeles(ps.planes), c = P.corteDe(dia), id = c?.id ?? P.inicial?.id;
  const out: EnProduccion = {};
  for (const f of ps.filas) {
    if (f.plan_id !== id || f.fecha !== dia || !f.sku || !(Number(f.hl) > 0)) continue;
    const x = out[f.sku] ?? { trenes: [], desde: 23, hasta: 0, hl: 0 };
    if (!x.trenes.includes(f.tren)) x.trenes.push(f.tren);
    x.desde = Math.min(x.desde, f.hora); x.hasta = Math.max(x.hasta, f.hora); x.hl += Number(f.hl);
    out[f.sku] = x;
  }
  return out;
}
