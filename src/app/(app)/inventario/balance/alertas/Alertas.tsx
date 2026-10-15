"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Alerta, DatosAlertas, TipoAlerta } from "@/modulos/inventario/balance-alertas";
import { Rango } from "../../../sider/seguimiento/Rango";

const TIPOS: { k: TipoAlerta; nombre: string; verbo: string; ayuda: string }[] = [
  { k: "sin_contar", nombre: "Sin contar", verbo: "Recontar", ayuda: "Ayer estaba y hoy no lo contaron: recontar esa ubicación o ajustar." },
  { k: "reasignacion", nombre: "Reasignar", verbo: "Reasignar", ayuda: "Lo que bajó en un estado subió en otro: reasignar en Consolidado." },
  { k: "dif_nueva", nombre: "Diferencia nueva", verbo: "Revisar", ayuda: "Ayer cuadraba (o era otra) y hoy no cuadra." },
  { k: "persiste", nombre: "Sigue igual", verbo: "Pendiente", ayuda: "La misma diferencia de ayer sigue hoy." },
];
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const n0 = (v: number) => nf.format(Math.round(v));
const sg = (v: number) => (Math.abs(v) < 0.5 ? "0" : `${v > 0 ? "+" : "−"}${n0(Math.abs(v))}`);
const larga = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function Alertas({ datos }: { datos: DatosAlertas }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const [tipo, setTipo] = useState<TipoAlerta | "todas">("todas");
  const [zona, setZona] = useState<"todas" | "Fábrica" | "Bodega 38">("todas");
  const [hechas, setHechas] = useState<Set<string>>(new Set());
  const { fecha, anterior, dias, alertas, error } = datos;

  const cuenta = (t: TipoAlerta) => alertas.filter((a) => a.tipo === t).length;
  const vistas = useMemo(
    () => alertas.filter((a) => (tipo === "todas" || a.tipo === tipo) && (zona === "todas" || a.zona === zona)),
    [alertas, tipo, zona],
  );
  const marca = (id: string) => setHechas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pendientes = vistas.filter((a) => !hechas.has(a.id)).length;
  const T = (k: TipoAlerta) => TIPOS.find((t) => t.k === k)!;

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · ALERTAS</p>
          <h1>Alertas del Balance</h1>
          <p className="sub">
            El Balance del día contra el del <b>día anterior con conteo enviado</b>. Te dice qué dejaron de contar, qué parece contado
            con otro estado y qué diferencia es nueva o sigue igual, para saber si toca <b>recontar, reasignar o ajustar</b>.
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
        <p className="al-vacio">
          No hay un día anterior con conteo enviado para comparar con el {larga(fecha)}. Escoge un día más reciente o revisa el
          Balance de ese día directamente.
          {" "}<Link href={`/inventario/balance?fecha=${fecha}`}>Ver el Balance →</Link>
        </p>
      )}

      {!error && fecha && anterior && (
        <>
          <div className="al-compara">
            <span><small>Ayer</small><b>{larga(anterior)}</b></span>
            <i aria-hidden>→</i>
            <span><small>Hoy</small><b>{larga(fecha)}</b></span>
            <Link href={`/inventario/balance?fecha=${fecha}`} className="al-ver">Ver el Balance del día →</Link>
            <button type="button" className="al-imprimir" onClick={() => window.print()}>Imprimir</button>
          </div>

          <div className="al-cifras">
            {TIPOS.map((t) => (
              <button key={t.k} type="button" className={`al-cif ${t.k}${tipo === t.k ? " on" : ""}`} aria-pressed={tipo === t.k}
                      onClick={() => setTipo(tipo === t.k ? "todas" : t.k)} title={t.ayuda}>
                <span>{t.nombre}</span><b>{cuenta(t.k)}</b><small>{t.verbo}</small>
              </button>
            ))}
          </div>

          <div className="al-filtros">
            <div className="al-chips" role="group" aria-label="Zona">
              {(["todas", "Fábrica", "Bodega 38"] as const).map((z) => (
                <button key={z} type="button" className={zona === z ? "on" : ""} aria-pressed={zona === z} onClick={() => setZona(z)}>
                  {z === "todas" ? "Todas las zonas" : z}
                </button>
              ))}
            </div>
            <span className="al-cuenta">{vistas.length ? `${pendientes} por resolver de ${vistas.length}` : ""}</span>
          </div>

          {!alertas.length && (
            <p className="al-ok">Sin alertas: el Balance de hoy se comporta igual que el de ayer. No hay nada que recontar, reasignar ni ajustar.</p>
          )}
          {alertas.length > 0 && !vistas.length && <p className="al-vacio">Ninguna alerta con ese filtro.</p>}

          {vistas.length > 0 && (
            <div className="al-scroll">
              <table className="al-t">
                <thead>
                  <tr>
                    <th>Qué pasó</th><th>Material</th><th className="n">Cajas</th>
                    <th className="n">Ayer<small>conteo · casco · dif</small></th>
                    <th className="n">Hoy<small>conteo · casco · dif</small></th>
                    <th>Qué hacer</th><th>Dónde</th><th className="al-no-papel">Hecho</th>
                  </tr>
                </thead>
                <tbody>
                  {vistas.map((a: Alerta) => (
                    <tr key={a.id} className={`${a.tipo}${hechas.has(a.id) ? " hecha" : ""}`}>
                      <td>
                        <span className={`al-tag ${a.tipo}`}>{T(a.tipo).nombre}</span>
                        <small className="al-sub">{a.zona} · {a.haciaEstado ? `${a.estado} → ${a.haciaEstado}` : a.estado}</small>
                      </td>
                      <td><span className="mono">{a.codigo}</span><small className="al-sub">{a.material ?? "—"}</small></td>
                      <td className="n"><b>{n0(a.cajas)}</b>{a.estibas != null && <small className="al-sub">{nf.format(a.estibas)} est.</small>}
                        {a.unidades != null && <small className="al-sub">{n0(a.unidades)} un.</small>}</td>
                      <td className="n">{n0(a.ayer.conteo)} · {n0(a.ayer.casco)} · <b>{sg(a.ayer.dif)}</b></td>
                      <td className="n">{n0(a.hoy.conteo)} · {n0(a.hoy.casco)} · <b>{sg(a.hoy.dif)}</b></td>
                      <td className="al-que"><b>{T(a.tipo).verbo}:</b> {a.accion}<small className="al-sub">{a.detalle}</small></td>
                      <td className="al-donde">{a.donde || "—"}</td>
                      <td className="al-no-papel">
                        <input type="checkbox" checked={hechas.has(a.id)} onChange={() => marca(a.id)} aria-label={`Marcar ${a.codigo} como resuelta`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="al-nota">
            Las marcas «Hecho» son solo para esta pantalla (no se guardan). Cuando recuentes o ajustes, el Balance se recalcula solo y la
            alerta desaparece.
          </p>
        </>
      )}
    </>
  );
}
