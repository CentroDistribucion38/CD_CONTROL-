"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DatosAlertas } from "@/modulos/inventario/balance-alertas";
import { Rango } from "../../../sider/seguimiento/Rango";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const n0 = (v: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(v));
const larga = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Una línea por alerta: qué estado, qué material, cuánto había ayer y cuánto hoy, y qué decidir. */
export function Alertas({ datos }: { datos: DatosAlertas }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const [hechas, setHechas] = useState<Set<string>>(new Set());
  const { fecha, anterior, dias, alertas, error } = datos;
  const marca = (id: string) => setHechas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const balance = fecha ? `/inventario/balance?fecha=${fecha}` : "/inventario/balance";

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · ALERTAS</p>
          <h1>Alertas del Balance</h1>
          <p className="sub">
            Lo que ayer estaba en el Balance y hoy no aparece igual, para decidir si toca <b>ajustar</b> o <b>reasignar</b>.
          </p>
        </div>
        <div className="bal-dias">
          <div className="sd bal-cal">
            <Rango rotulo="Conteo del día" desde={fecha ?? ""} hasta={fecha ?? ""}
                   dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => startCambio(() => router.push(`/inventario/balance/alertas?fecha=${d}`))} />
          </div>
          {cambiando && <em>Trayendo…</em>}
        </div>
      </section>

      {error && <p className="al-error">Error: {error}</p>}
      {!error && !fecha && <p className="al-vacio">Todavía no hay conteos enviados.</p>}
      {!error && fecha && !anterior && (
        <p className="al-vacio">No hay un día anterior con conteo enviado para comparar con el {larga(fecha)}. <Link href={balance}>Ver el Balance →</Link></p>
      )}

      {!error && fecha && anterior && (
        <>
          <p className="al-compara">
            <b>{larga(anterior)}</b> → <b>{larga(fecha)}</b>
            <span>{alertas.length ? `${alertas.filter((a) => !hechas.has(a.id)).length} por decidir` : ""}</span>
          </p>

          {!alertas.length && <p className="al-ok">Sin alertas: hoy no cambió nada contra ayer que haya que ajustar o reasignar.</p>}

          <ul className="al-lista">
            {alertas.map((a) => (
              <li key={a.id} className={`${a.tipo}${hechas.has(a.id) ? " hecha" : ""}`}>
                <div className="al-que">
                  <b>{a.haciaEstado ? `${a.estado} → ${a.haciaEstado}` : a.estado}</b>
                  <span>{a.material ?? a.codigo} <small className="mono">{a.codigo} · {a.zona}</small></span>
                </div>
                <div className="al-num">
                  {a.haciaEstado
                    ? <>{n0(a.cajas)} cajas pasaron de estado</>
                    : <>Ayer <b>{n0(a.ayer.conteo)}</b> → Hoy <b>{n0(a.hoy.conteo)}</b></>}
                  <small>{a.haciaEstado ? "Parece reasignación" : `−${n0(a.cajas)} cajas${a.estibas != null ? ` · ${nf.format(a.estibas)} est.` : ""} sin contar`}</small>
                </div>
                <div className="al-acc">
                  <Link href={balance}>{a.haciaEstado ? "Reasignar" : "Ajustar o reasignar"} →</Link>
                </div>
                <label className="al-hecho"><input type="checkbox" checked={hechas.has(a.id)} onChange={() => marca(a.id)} />Hecho</label>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
