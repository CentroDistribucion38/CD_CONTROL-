import Link from "next/link";
import type { ResumenSemana } from "@/modulos/inventario/envase/semana";

const n0 = (x: number) => Math.round(x).toLocaleString("es-CO");
const corta = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
const DIA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/* LO QUE QUEDÓ PENDIENTE POR NOTIFICAR, POR SKU. «En el cierre de la semana anterior, qué quedó pendiente por notificar.»
   Plan vigente − notificado de la semana (en la actual, hasta esta hora), en HL, unidades y cajas, del más grande al más chico.
   Lo notificado de más va al final, en gris. En la semana pasada abre de una; en la actual, cerrado. */
function Pendientes({ s, k }: { s: ResumenSemana; k: number }) {
  const pend = s.skus.filter((r) => r.pendUn > 0), mas = s.skus.filter((r) => r.pendUn < 0);
  if (!s.skus.length) return <p className="pe-nota">Nada pendiente por notificar: todo lo del plan está notificado.</p>;
  const tHl = pend.reduce((a, r) => a + r.pendHl, 0);
  return (
    <details className="pe-sem-p" open={k === 0}>
      <summary><b>Pendiente por notificar</b> · {pend.length} SKU · {n0(tHl)} HL{mas.length ? ` · ${mas.length} ${mas.length === 1 ? "notificado" : "notificados"} de más` : ""}</summary>
      <table className="pe-t">
        <thead><tr><th className="l">SKU</th><th>Plan vigente</th><th>Notificado</th><th>Pendiente HL</th><th>Pendiente un.</th><th>Pendiente cajas</th></tr></thead>
        <tbody>
          {pend.map((r) => (
            <tr key={r.sku}><td className="l"><b>{r.sku}</b> {r.nombre.slice(0, 32)}</td><td>{n0(r.planHl)}</td><td>{n0(r.notifHl)}</td>
              <td className="mal"><b>{n0(r.pendHl)}</b></td><td>{n0(r.pendUn)}</td><td>{r.pendCajas == null ? "—" : n0(r.pendCajas)}</td></tr>
          ))}
          {mas.map((r) => (
            <tr key={r.sku} className="mut"><td className="l"><b>{r.sku}</b> {r.nombre.slice(0, 32)} <small>· de más</small></td><td>{n0(r.planHl)}</td><td>{n0(r.notifHl)}</td>
              <td>+{n0(-r.pendHl)}</td><td>+{n0(-r.pendUn)}</td><td>{r.pendCajas == null ? "—" : `+${n0(-r.pendCajas)}`}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/**
 * CARGAR › EL CIERRE DE LA SEMANA PASADA Y CÓMO VA LA ACTUAL. Lo primero que se ve al subir la MB51: dos tarjetas (pasada y
 * actual) con plan inicial, plan vigente, notificado y cumplimiento en HL, y abajo los siete días. Cada día abre su Validación.
 */
export function CierreSemanas({ semanas, mb51 }: { semanas: ResumenSemana[]; mb51: string | null }) {
  const mb = mb51 ? `${corta(mb51.slice(0, 10))} ${mb51.slice(11, 16)}` : "—";
  return (
    <section className="pe-sem" aria-label="Cierre de la semana pasada y semana actual">
      {semanas.map((s, k) => {
        const base = k === 0 ? s.planVig : s.planHasta;
        const p = base ? s.notif / base : null;
        const tag = s.estado === "cerrada" ? <span className="pe-tag t-v">Cerrada</span>
          : s.estado === "abierta" ? <span className="pe-tag t-a">Falta la madrugada del domingo</span>
          : s.estado === "en curso" ? <span className="pe-tag t-g">En curso</span> : <span className="pe-tag t-g">Sin plan</span>;
        return (
          <article key={s.lunes} className="pe-card pe-sem-c">
            <header>
              <div><small>{k === 0 ? "SEMANA PASADA · CIERRE" : "SEMANA ACTUAL · A ESTA HORA"}</small>
                <h3>Semana {s.semana ?? "—"} <em>{corta(s.lunes)} al {corta(s.domingo)}</em></h3>
                <Link className="pe-sem-ver" href={`/inventario/envase?d=${s.lunes}&h=${k === 0 ? s.domingo : s.dias.filter((d) => d.estado !== "futuro").pop()?.dia ?? s.lunes}`}>Validar la semana por SKU →</Link></div>
              {tag}
            </header>
            {s.estado === "sin plan" ? <p className="pe-nota">No hay instructivo cargado para esta semana.</p> : (<>
              <div className="pe-sem-k">
                <div><span>Plan inicial</span><b>{n0(s.planIni)}<small>HL</small></b>{k === 1 && <em>semana completa</em>}</div>
                <div><span>{k === 0 ? "Plan vigente" : "Plan vigente a esta hora"}</span><b>{n0(base)}<small>HL</small></b>{k === 1 && <em>semana: {n0(s.planVig)} HL</em>}</div>
                <div><span>Notificado</span><b>{n0(s.notif)}<small>HL</small></b></div>
                <div className={p != null && p < 0.9 ? "mal" : ""}><span>Cumplimiento</span><b>{p == null ? "—" : `${Math.round(100 * p)} %`}</b>
                  <em>{base - s.notif > 0.5 ? `faltan ${n0(base - s.notif)} HL` : base - s.notif < -0.5 ? `${n0(s.notif - base)} HL de más` : "completo"}</em></div>
              </div>
              <table className="pe-t pe-sem-t">
                <thead><tr><th className="l" />{s.dias.map((d, i) => <th key={d.dia}><Link href={`/inventario/envase?d=${d.dia}`}>{DIA[i]} {d.dia.slice(8)}</Link></th>)}</tr></thead>
                <tbody>
                  <tr><td className="l">Plan vigente</td>{s.dias.map((d) => <td key={d.dia} className={d.estado === "futuro" ? "mut" : ""}>{d.planVig ? n0(d.planVig) : "—"}</td>)}</tr>
                  <tr><td className="l">Notificado</td>{s.dias.map((d) => <td key={d.dia}>{d.estado === "futuro" ? "" : n0(d.notif)}</td>)}</tr>
                  <tr><td className="l">Cumplimiento</td>{s.dias.map((d) => {
                    const b = d.planHasta || (d.estado === "futuro" ? 0 : d.planVig), x = b ? d.notif / b : null;
                    return <td key={d.dia} className={x != null && x < 0.9 ? "mal" : ""}>{d.estado === "futuro" ? "" : x == null ? "—" : `${Math.round(100 * x)} %`}{d.estado === "abierto" && <small className="mut"> abierto</small>}</td>;
                  })}</tr>
                </tbody>
              </table>
              <Pendientes s={s} k={k} />
            </>)}
          </article>
        );
      })}
      <p className="pe-nota pe-sem-n">En HL. Notificado = Z01 − Z02 por fecha de contabilización (lo de madrugada cuenta en su día). Última MB51: {mb}.
        La semana pasada queda cerrada cuando la MB51 trae lo digitado desde las 6:00 del lunes. Cada día abre su Validación.</p>
    </section>
  );
}
