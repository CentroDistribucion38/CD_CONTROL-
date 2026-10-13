"use client";

import { useMemo, useState } from "react";
import type { Reasignacion } from "@/modulos/inventario/balance";

/**
 * LA HOJA «REASIGNACIONES» DEL BALANCE — el registro de los cambios de estado de lo contado ese día.
 *
 * «Dame un registro dentro del consolidado de esas reasignaciones que hice: dentro del Balance, la hoja
 *  de reasignaciones.»
 *
 * Dos orígenes: las que se hicieron a mano en la hoja Consolidado (con su motivo, quién y cuándo) y las
 * que pone sola la regla de fábrica (conteo_reglas_estado). Solo se miran aquí; se deshacen en Consolidado.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function Reasignaciones({ lineas }: { lineas: Reasignacion[] }) {
  const [q, setQ] = useState("");
  const [origen, setOrigen] = useState<"" | Reasignacion["origen"]>("");

  const vistas = useMemo(() => {
    const palabras = sinTilde(q).split(/[\s,;]+/).filter(Boolean);
    return lineas.filter((l) => (!origen || l.origen === origen)
      && (!palabras.length || palabras.some((p) => sinTilde(`${l.codigo} ${l.material ?? ""} ${l.ubicacion} ${l.motivo ?? ""}`).includes(p))));
  }, [lineas, q, origen]);

  const deBalance = lineas.filter((l) => l.origen === "Balance");
  const deRegla = lineas.filter((l) => l.origen === "Regla de fábrica");
  const suma = (xs: Reasignacion[]) => xs.reduce((t, x) => t + x.cajas, 0);

  if (!lineas.length) {
    return <p className="bal-sin-filas bal-reas-vacio">Este día no tiene reasignaciones: todo está en el estado con que se contó.</p>;
  }

  return (
    <div className="bal-conso bal-reas">
      <div className="bal-reas-res">
        <div><span>En el Balance (a mano)</span><b>{deBalance.length}</b><small>{n(suma(deBalance))} cajas</small></div>
        <div><span>Por la regla de fábrica</span><b>{deRegla.length}</b><small>{n(suma(deRegla))} cajas</small></div>
      </div>

      <div className="bal-conso-filtros">
        <label className="bal-conso-q">
          <span>SKU, material, ubicación o motivo</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="3500888 · patio · sorting…" />
        </label>
        <div className="bal-conso-grupo">
          <span>Origen</span>
          <div className="bal-chips">
            {(["Balance", "Regla de fábrica"] as const).map((o) => (
              <button key={o} type="button" className={origen === o ? "on" : ""} aria-pressed={origen === o} onClick={() => setOrigen(origen === o ? "" : o)}>{o}</button>
            ))}
            {origen && <button type="button" className="limpiar" onClick={() => setOrigen("")}>Todos</button>}
          </div>
        </div>
      </div>

      <div className="bal-tabla-wrap">
        <table className="bal-tabla bal-hoja">
          <thead>
            <tr>
              <th>Origen</th><th>Código</th><th>Material</th><th>Zona</th><th>Ubicación</th>
              <th>Cambio de estado</th><th className="r">Cajas</th><th className="r">Unidades</th>
              <th>Motivo</th><th>Quién</th><th>Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {vistas.map((l, i) => (
              <tr key={`${l.origen}-${l.codigo}-${l.ubicacion}-${l.de}-${l.a}-${i}`}>
                <td><span className={"bal-reas-or" + (l.origen === "Balance" ? " man" : " regla")}>{l.origen}</span></td>
                <td className="mono">{l.codigo}</td>
                <td>{l.material ?? "—"}</td>
                <td>{l.zona}</td>
                <td className="mono">{l.ubicacion}</td>
                <td className="bal-reas-de"><s>{l.de}</s> → <b>{l.a}</b></td>
                <td className="r">{n(l.cajas)}</td>
                <td className="r">{n(l.unidades)}</td>
                <td>{l.motivo || "—"}</td>
                <td>{l.quien || (l.origen === "Regla de fábrica" ? "Automática" : "—")}</td>
                <td>{cuando(l.cuando)}</td>
              </tr>
            ))}
            {vistas.length === 0 && <tr><td colSpan={11} className="bal-sin-filas">Nada con ese filtro.</td></tr>}
          </tbody>
          {vistas.length > 1 && (
            <tfoot>
              <tr><td colSpan={6}><b>Total</b> · {vistas.length} cambios</td><td className="r"><b>{n(suma(vistas))}</b></td><td className="r"><b>{n(vistas.reduce((t, x) => t + (x.unidades ?? 0), 0))}</b></td><td colSpan={3}></td></tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="bal-reas-nota">Las del Balance se deshacen en la hoja <b>Consolidado</b> (pasando la línea al estado con que se contó). Las de la regla de fábrica las pone sola la app: el conteo se guarda como lo registraron y la traza queda en la nota.</p>
    </div>
  );
}
