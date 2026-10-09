"use client";

/**
 * TRASPASOS POR PLACA, EN EL TABLERO.
 *
 * «Quiero por placa poder evaluar Traspasos» y «que pueda filtrar por placa». Del rango, turnos y
 * tipos que están puestos arriba: cada placa con sus viajes en orden de hora, la carga, el
 * documento de facturación de cada viaje y los saltos de ruta (sale de un sitio distinto a donde
 * había llegado). La placa se filtra aquí mismo, sin volver al servidor.
 */
import { useMemo, useState } from "react";
import type { Viaje } from "@/modulos/traspasos/datos";
import { placaClave } from "@/modulos/traspasos/formato";
import { armarPorPlaca, documentoDe } from "@/modulos/traspasos/por-placa";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const ddmm = (f: string) => f.slice(8, 10) + "/" + f.slice(5, 7);
const PRIMERAS = 24;

export function PorPlaca({ viajes, placaInicial = "", varios }: {
  viajes: Viaje[];
  placaInicial?: string;
  /** El rango tiene más de un día: cada viaje dice su fecha. */
  varios: boolean;
}) {
  const [q, setQ] = useState(placaInicial);
  const [todas, setTodas] = useState(false);
  const grupos = useMemo(() => armarPorPlaca(viajes), [viajes]);
  const buscado = placaClave(q);
  const vistos = buscado ? grupos.filter((g) => g.clave.includes(buscado)) : grupos;
  const nViajes = vistos.reduce((a, g) => a + g.vs.length, 0);
  const nSaltos = vistos.reduce((a, g) => a + g.nSaltos, 0);
  const mostrar = todas || buscado ? vistos : vistos.slice(0, PRIMERAS);

  return (
    <section className="panel-tabla tp-porplaca">
      <div className="cab-tabla tp-pp-cab">
        <div>
          <h2>Por placa</h2>
          <p className="tp-pp-sub">
            {vistos.length} placa{vistos.length === 1 ? "" : "s"} · {nf.format(nViajes)} viaje{nViajes === 1 ? "" : "s"} en orden de hora
            {nSaltos > 0 && <> · <b className="tp-pp-mal">{nSaltos} salto{nSaltos === 1 ? "" : "s"} de ruta</b></>}
          </p>
        </div>
        <label className="sel tp-pp-busca">
          <span>Placa</span>
          <input value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} placeholder="SNR719"
                 autoComplete="off" spellCheck={false} />
        </label>
      </div>

      {vistos.length === 0 ? (
        <p className="tp-pp-nada">{buscado ? `Ninguna placa con «${q}» en este rango.` : "No hay viajes registrados en este rango."}</p>
      ) : (
        <div className="tp-ci-placas">
          {mostrar.map((g) => (
            <div className="ci-placa" key={g.clave}>
              <div className="ci-placa-cab">
                <b>{g.placa}</b>
                <span>{g.vs.length} viaje{g.vs.length === 1 ? "" : "s"} · carga {nf.format(g.carga)}</span>
              </div>
              <ol>
                {g.vs.map((v, i) => {
                  const d = documentoDe(v);
                  return (
                    <li key={v.id} className={g.saltos[i] ? "salto" : undefined}>
                      {g.saltos[i] && <span className="ci-salto">Había llegado a {g.saltos[i]}: falta un viaje o la ruta está mal</span>}
                      <span className="h">{varios && `${ddmm(v.fecha)} `}{v.hora ? hhmm(v.hora) : "—"}</span>
                      <span className="r">{(v.origen_nombre ?? v.origen ?? "—")} → {(v.destino_nombre ?? v.destino ?? "—")}</span>
                      <span className={"d" + (d.sin ? " sin" : "")}>{d.txt}{d.hora && <small> · salió {hhmm(d.hora)}</small>}</span>
                      <span className="t">{v.tipo_nombre ?? v.tipo ?? "—"}{v.vacio ? " · vacío" : v.carga != null ? ` · ${nf.format(v.carga)}` : ""}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
      {!todas && !buscado && vistos.length > PRIMERAS && (
        <button type="button" className="tp-pp-mas" onClick={() => setTodas(true)}>
          Ver las {vistos.length} placas
        </button>
      )}
    </section>
  );
}
