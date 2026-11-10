"use client";

import type { Mov311 } from "@/modulos/inventario/analisis-dif";

/**
 * LAS PARTIDAS DE LOS 311 — todo lo que se movió entre AG22 y AG18 · AG17 · AG16 ese día, para ver siempre de dónde viene el BALANCE.
 * Va cerrado y se repite en Análisis, Ajustes y Análisis final (el análisis y las cifras van primero).
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));

export function Partidas311({ movimientos }: { movimientos?: Mov311[] }) {
  if (!movimientos?.length) return null;
  const ms = movimientos.slice().sort((x, y) => x.almacen.localeCompare(y.almacen) || x.codigo.localeCompare(y.codigo, "es", { numeric: true }));
  const porAlm = new Map<string, number>(); for (const m of ms) porAlm.set(m.almacen, (porAlm.get(m.almacen) ?? 0) + 1);
  return (
    <details className="ad-resto">
      <summary><b>Partidas de los 311</b> · {ms.length} movimientos · {[...porAlm].map(([a, k]) => `${a} ${k}`).join(" · ")} · lo que entró a AG22 suma a SAP y lo que salió resta</summary>
      <div className="ad-tabla-caja">
        <table className="ad-t">
          <thead><tr><th>Almacén</th><th>Código</th><th>Descripción</th><th>Tipo</th><th className="n">Movido en el almacén</th><th className="n">Efecto en SAP de AG22</th><th>Documentos</th><th className="n">Quedó sin cuadrar</th></tr></thead>
          <tbody>
            {ms.map((m) => (
              <tr key={m.almacen + m.codigo}>
                <td>{m.almacen}</td><td className="mono">{m.codigo}</td><td>{m.descripcion}</td>
                <td>{m.grupo === "CAJA" ? "Caja plástica" : m.grupo === "PRODUCTO" ? "Producto (no entra)" : m.grupo === "ESTIBA" ? "Estiba" : "Envase"}</td>
                <td className="n">{signo(m.movido)}</td>
                <td className={"n" + (m.movido > 0 ? " neg" : "")}>{m.entraAlAnalisis ? signo(-m.movido) : "—"}</td>
                <td className="mono">{m.documentos.length ? m.documentos.slice(0, 4).join(", ") + (m.documentos.length > 4 ? "…" : "") : "—"}</td>
                <td className="n">{m.queda != null && Math.abs(m.queda) >= 0.5 ? signo(Math.round(m.queda)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ad-nota">«Movido en el almacén»: + entró a ese almacén (salió de AG22), − salió de él (entró a AG22). El producto no entra al análisis; la caja plástica y el envase sí, del lado SAP.</p>
    </details>
  );
}
