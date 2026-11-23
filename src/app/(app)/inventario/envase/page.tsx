import Link from "next/link";
import { estadoDia, maestro, masDias, papeles, validarDia, type Alerta, type FilaDia, type FilaPlanBD } from "@/modulos/inventario/envase/calc";
import { hoyBogota, lunesDe, movimientosContab, planesDeSemana, productosDe, ultimaEntrada } from "@/modulos/inventario/envase/datos";
import "../fefo.css";
import "../balance/analisis/analisis.css";
import "./envase.css";
import { ValidacionDia } from "./ValidacionDia";

export const dynamic = "force-dynamic";

const esF = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const largo = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const corto = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());
const hora = (g: string) => new Date(g.replace(" ", "T") + "Z").toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

/**
 * INVENTARIO › PLAN VS NOTIFICADO › VALIDACIÓN DEL DÍA.
 *
 * «Yo valido las notificaciones por día.» Se escoge el día y se compara contra el plan de ESE día: lo notificado
 * con fecha de contabilización del día y el envase de sus órdenes.
 *
 * «Quiero que me muestre el del día de hoy y me diga, según la hora y el plan, cuál es el pendiente por notificar; quiero el dato
 *  real y que siempre muestre el actual.» Por defecto abre HOY. Para hoy se suma el plan HORA POR HORA del instructivo (cada
 * columna es una hora, de las 00:00 a las 23:00) hasta la hora actual —la hora en curso, en proporción a los minutos—, con el
 * plan vigente (el último corte; si no hay, el inicial): eso es lo que debería ir notificado, y el pendiente es eso menos lo notificado.
 */
export default async function ValidacionPage({ searchParams }: { searchParams: Promise<{ d?: string; h?: string }> }) {
  const q = await searchParams;
  const hoy = hoyBogota();
  const u = await ultimaEntrada();
  const cabeza = (sub: React.ReactNode) => (
    <section className="cabeza"><div>
      <p className="ojo">INVENTARIO · PLAN VS NOTIFICADO</p>
      <h1>Validación del día</h1>
      <p className="sub">{sub}</p>
    </div></section>
  );
  if (u.falta) {
    return (
      <div className="fe pe">
        {cabeza("Falta crear esta parte en Supabase.")}
        <p className="pe-vacio">Corre <b>supabase/migraciones/2026-11-plan-envase.sql</b> en el editor de SQL de Supabase y después sube el instructivo y la MB51 en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      </div>
    );
  }

  /* LAS FECHAS: por defecto HOY. «Que esta validación la pueda ver en cualquier rango de fecha, semana, días, lo que yo quiera»:
     ?d=desde&h=hasta. Con un rango se valida DÍA POR DÍA (cada día contra el plan de su semana: su corte o su inicial) y se suma
     por SKU, por orden y por línea; las alertas llevan su día. Hasta 62 días y nunca después de hoy. */
  const d = esF(q.d) ? (q.d! > hoy ? hoy : q.d!) : hoy;
  let h = esF(q.h) && q.h! >= d ? q.h! : d;
  if (h > hoy) h = hoy;
  if (h > masDias(d, 61)) h = masDias(d, 61);
  const rango = h > d;
  const dias: string[] = [];
  for (let f = d; f <= h; f = masDias(f, 1)) dias.push(f);
  const lunesSet = [...new Set(dias.map(lunesDe))];
  const [semanas, mv] = await Promise.all([Promise.all(lunesSet.map((l) => planesDeSemana(l))), movimientosContab(masDias(d, -28), h)]);
  const PS = new Map(lunesSet.map((l, i) => [l, semanas[i]]));
  const todasFilas = semanas.flatMap((x) => x.filas);
  const skus = new Set<string>(todasFilas.map((f) => f.sku).filter((s): s is string => !!s));
  for (const m of mv.filas) if (/^Z0[12]$/.test(m.clase)) skus.add(m.material.replace(/P$/i, ""));
  const M = maestro(todasFilas, await productosDe([...skus]));
  const psErr = semanas.find((x) => x.error)?.error ?? null;

  const hm = h === hoy ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number) : null;
  const unDe = (f: FilaPlanBD) => f.unidades ?? (f.formato_ml ? (f.hl * 1e5) / f.formato_ml : 0);
  const F = new Map<string, FilaDia>();
  const alertas: Alerta[] = [];
  const planHasta: Record<string, number> = {};
  const porLinea = new Map<string, { tren: string; sku: string; ini: number; vig: number; hasta: number }>();
  const lin = (tren: string, sku: string) => {
    const k = `${tren}|${sku}`;
    let x = porLinea.get(k); if (!x) { x = { tren, sku, ini: 0, vig: 0, hasta: 0 }; porLinea.set(k, x) }
    return x;
  };
  let hayCorte = false;
  const cortes: string[] = [], iniciales: string[] = [];
  for (const dia of dias) {
    const ps = PS.get(lunesDe(dia))!;
    const P = papeles(ps.planes);
    const ini = P.inicial ? ps.filas.filter((f) => f.plan_id === P.inicial!.id) : [];
    const c = P.corteDe(dia);
    const cor = c ? ps.filas.filter((f) => f.plan_id === c.id) : null;
    if (c) { hayCorte = true; if (!cortes.includes(c.generado)) cortes.push(c.generado) }
    if (P.inicial && !iniciales.includes(P.inicial.generado)) iniciales.push(P.inicial.generado);
    const v = validarDia(dia, ini, cor, mv.filas, M);
    for (const f of v.filas) {
      const x = F.get(f.sku);
      if (!x) { F.set(f.sku, { ...f, planCorte: f.planCorte ?? (rango ? f.planIni : null), ordenes: f.ordenes.map((o) => ({ ...o })) }); continue }
      x.nombre ||= f.nombre; x.retornable ||= f.retornable; x.ref ||= f.ref;
      x.planIni += f.planIni; x.planCorte = (x.planCorte ?? x.planIni - f.planIni) + (f.planCorte ?? f.planIni);
      x.notif += f.notif; x.madrugada += f.madrugada;
      x.botTeo += f.botTeo; x.b261 += f.b261; x.b531 += f.b531; x.cajaTeo += f.cajaTeo; x.c261 += f.c261; x.c531 += f.c531;
      for (const o of f.ordenes) {
        const y = x.ordenes.find((z) => z.orden === o.orden);
        if (!y) { x.ordenes.push({ ...o }); continue }
        y.z += o.z; y.madrugada += o.madrugada; y.b261 += o.b261; y.b531 += o.b531; y.c261 += o.c261; y.c531 += o.c531;
        y.botella ??= o.botella; y.caja ??= o.caja;
      }
    }
    for (const a of v.alertas) alertas.push(rango ? { ...a, texto: `${corto(dia)} · ${a.texto}` } : a);
    /* Por línea y, si el rango llega a hoy, el plan hasta esta hora (los días anteriores completos; hoy, por horas). */
    for (const f of ini) if (f.fecha === dia && f.sku) lin(f.tren, f.sku).ini += unDe(f);
    for (const f of (cor ?? ini)) if (f.fecha === dia && f.sku) {
      const x = lin(f.tren, f.sku); x.vig += unDe(f);
      if (hm) {
        const peso = dia < hoy ? 1 : f.hora < hm[0] ? 1 : f.hora === hm[0] ? hm[1] / 60 : 0;
        x.hasta += unDe(f) * peso;
        if (peso > 0) planHasta[f.sku] = (planHasta[f.sku] ?? 0) + unDe(f) * peso;
      }
    }
  }
  /* Sin ningún corte en el rango, la columna «vigente» no aplica: se deja como en un día sin corte. */
  if (!hayCorte) for (const f of F.values()) f.planCorte = null;
  const filas = [...F.values()].sort((a, b) => b.planIni - a.planIni || b.notif - a.notif);
  const lineas = [...porLinea.values()];
  const ahora = hm ? { hora: `${String(hm[0]).padStart(2, "0")}:${String(hm[1]).padStart(2, "0")}`, planHasta, mb51: u.valor } : undefined;
  /* Los días con MB51 (un punto en el calendario): de los 60 días antes de hoy. */
  const conDatos: string[] = [];
  for (let f = masDias(hoy, -60); f <= hoy; f = masDias(f, 1)) { const e = estadoDia(f, u.valor, hoy); if (e === "cerrado" || e === "abierto") conDatos.push(f) }
  const nSem = [...new Set(semanas.map((x) => x.planes[0]?.semana).filter(Boolean))];
  const n = dias.length;

  return (
    <div className="fe pe">
      {cabeza(<>
        {rango ? <>{largo(d)} al {largo(h)} · {n} días</> : largo(d)}{nSem.length ? ` · semana ${nSem.join(" y ")}` : ""}. Plan inicial: {iniciales.length ? <b>instructivo del {iniciales.map(hora).join(" y del ")}</b> : <b className="mal">no hay</b>}
        {cortes.length ? <> · {cortes.length > 1 ? "cortes" : "corte"}: <b>{cortes.map(hora).join(", ")}</b></> : null}. MB51 cargada hasta <b>{u.valor ? hora(u.valor) : "—"}</b>.
      </>)}
      {(psErr || mv.error) && <p className="pe-error">No se pudo leer todo: {psErr ?? mv.error}</p>}
      {!iniciales.length && semanas.some((x) => x.planes.length > 0) && (
        <p className="pe-aviso">{rango ? "Alguna semana del rango" : "Esta semana"} no tiene plan inicial: los instructivos cargados empiezan después del lunes. Sube el que se sacó al arrancar la semana.</p>
      )}
      <ValidacionDia
        dia={d} hastaDia={h} hoy={hoy} conDatos={conDatos} antes={[masDias(d, -n), masDias(h, -n)]} despues={[masDias(d, n), masDias(h, n)]}
        filas={filas} alertas={alertas} maestro={Object.fromEntries(M)} hayCorte={hayCorte}
        estado={estadoDia(h, u.valor, hoy)} ahora={ahora} lineas={lineas}
      />

    </div>
  );
}
