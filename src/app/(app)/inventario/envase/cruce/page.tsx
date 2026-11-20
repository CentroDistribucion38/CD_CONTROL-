import Link from "next/link";
import { entrada, maestro, masDias, papeles, validarDia } from "@/modulos/inventario/envase/calc";
import { hoyBogota, lunesDe, movimientosContab, planesDeSemana, productosDe, ultimaEntrada } from "@/modulos/inventario/envase/datos";
import "../../fefo.css";
import "../../balance/analisis/analisis.css";
import "../envase.css";
import { CruceHora, type DetalleSku, type FilaCruceHora } from "./CruceHora";

export const dynamic = "force-dynamic";

const esF = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const esH = (s?: string) => !!s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * INVENTARIO › PLAN VS NOTIFICADO › CRUCE A LA HORA — PRODUCTO Y ENVASE JUNTOS.
 *
 * «Quiero otra, ya en general, para el cruce: ver a la hora, de acuerdo al plan y las notificaciones.»
 * «Envase y producto: ese sería otro módulo, algo para ver ambos.»
 *
 * A una hora del día (por defecto, HOY a esta hora), con el plan vigente sumado hora por hora (cada columna del instructivo es
 * una hora; la hora en curso, en proporción a los minutos):
 *   · PRODUCTO: lo que debería ir envasado según el plan, lo notificado (Z01 − Z02) y lo pendiente por notificar, por línea.
 *   · ENVASE (retornables): las botellas y cajas que el plan dice que ya se consumieron, el 261 de SAP y lo que SAP todavía tiene
 *     de más en AG22 — lo que, al cruzar contra el conteo físico, sale como diferencia.
 * Lo notificado y el 261 son lo DIGITADO en SAP hasta esa hora (y hasta donde llegue la última MB51 cargada).
 */
export default async function CruceHoraPage({ searchParams }: { searchParams: Promise<{ d?: string; h?: string }> }) {
  const q = await searchParams;
  const hoy = hoyBogota();
  const d = esF(q.d) ? q.d! : hoy;
  const ahoraBog = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  /* La hora: la escogida; si no, hoy es «ahora» y un día pasado es el día completo (23:59). */
  const hora = esH(q.h) ? q.h! : d === hoy ? ahoraBog : "23:59";
  const [hh, mm] = hora.split(":").map(Number);

  const u = await ultimaEntrada();
  if (u.falta) {
    return (
      <div className="fe pe">
        <section className="cabeza"><div><p className="ojo">INVENTARIO · PLAN VS NOTIFICADO</p><h1>Cruce a la hora</h1></div></section>
        <p className="pe-vacio">Corre <b>supabase/migraciones/2026-11-plan-envase.sql</b> en Supabase y sube el instructivo y la MB51 en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      </div>
    );
  }

  const [ps, mv] = await Promise.all([planesDeSemana(lunesDe(d)), movimientosContab(masDias(d, -28), d)]);
  const P = papeles(ps.planes);
  const ini = P.inicial ? ps.filas.filter((f) => f.plan_id === P.inicial!.id) : [];
  const c = P.corteDe(d);
  const cor = c ? ps.filas.filter((f) => f.plan_id === c.id) : null;
  const vig = (cor ?? ini).filter((f) => f.fecha === d && f.sku);
  const skus = new Set<string>(ps.filas.map((f) => f.sku).filter((s): s is string => !!s));
  for (const m of mv.filas) if (/^Z0[12]$/.test(m.clase)) skus.add(m.material.replace(/P$/i, ""));
  const M = maestro(ps.filas, await productosDe([...skus]));

  /* Lo notificado y el 261 A ESA HORA: solo lo digitado en SAP hasta la hora escogida (lo de días anteriores queda, para saber
     qué SKU son retornables). Así una hora pasada muestra lo que SAP tenía en ese momento, no lo que se digitó después. */
  const corteH = `${d}T${hora}:59`;
  const movs = mv.filas.filter((m) => m.fecha_contab < d || entrada(m) <= corteH);
  const v = validarDia(d, ini, cor, movs, M);

  /* El plan vigente por línea y SKU: el del día y hasta la hora. */
  const unDe = (f: (typeof vig)[number]) => f.unidades ?? (f.formato_ml ? (f.hl * 1e5) / f.formato_ml : 0);
  const L = new Map<string, FilaCruceHora>();
  for (const f of vig) {
    const k = `${f.tren}|${f.sku}`;
    const x = L.get(k) ?? { tren: f.tren, sku: f.sku!, planDia: 0, planHasta: 0 };
    const peso = f.hora < hh ? 1 : f.hora === hh ? mm / 60 : 0;
    x.planDia += unDe(f); x.planHasta += unDe(f) * peso;
    L.set(k, x);
  }
  /* EL CÓDIGO DEL ENVASE de cada SKU (botella y caja): el material del 261 de sus órdenes en las últimas 4 semanas (el más usado). */
  const skuOrden = new Map<string, string>();
  for (const m of mv.filas) if (m.orden && /^Z0[12]$/.test(m.clase) && /P$/i.test(m.material)) skuOrden.set(m.orden, m.material.replace(/P$/i, ""));
  const usos = new Map<string, Map<string, { cod: string; txt: string; n: number; caja: boolean }>>();
  for (const m of mv.filas) {
    if (m.clase !== "261" || !m.orden || !skuOrden.has(m.orden)) continue;
    const sku = skuOrden.get(m.orden)!, k = sku;
    if (!usos.has(k)) usos.set(k, new Map());
    const x = usos.get(k)!.get(m.material) ?? { cod: m.material, txt: m.texto, n: 0, caja: /caja/i.test(m.texto) };
    x.n++; usos.get(k)!.set(m.material, x);
  }
  const envaseDe = (sku: string, caja: boolean) => {
    const xs = [...(usos.get(sku)?.values() ?? [])].filter((x) => x.caja === caja).sort((a, b) => b.n - a.n);
    return xs[0] ? { cod: xs[0].cod, txt: xs[0].txt } : null;
  };
  const detalle: Record<string, DetalleSku> = Object.fromEntries(v.filas.map((f) => [f.sku, {
    nombre: f.nombre, notif: f.notif, retornable: f.retornable, ref: f.ref, b261: f.b261, c261: f.c261,
    botella: envaseDe(f.sku, false), caja: envaseDe(f.sku, true),
  }]));

  return (
    <div className="fe pe">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · PLAN VS NOTIFICADO</p>
        <h1>Cruce a la hora · producto y envase</h1>
        <p className="sub">Lo que el plan dice que ya se envasó a esa hora, contra lo notificado (producto) y contra el 261 de SAP (envase).
          Plan {c ? <b>vigente (corte del {c.generado.slice(8, 10)}/{c.generado.slice(5, 7)} {c.generado.slice(11, 16)})</b> : P.inicial ? <b>inicial</b> : <b className="mal">no hay</b>}.</p>
      </div></section>
      {(ps.error || mv.error) && <p className="pe-error">No se pudo leer todo: {ps.error ?? mv.error}</p>}
      <CruceHora dia={d} hoy={hoy} hora={hora} esAhora={!esH(q.h) && d === hoy} mb51={u.valor} filas={[...L.values()]} detalle={detalle}
                 maestro={Object.fromEntries(M)} />
    </div>
  );
}
