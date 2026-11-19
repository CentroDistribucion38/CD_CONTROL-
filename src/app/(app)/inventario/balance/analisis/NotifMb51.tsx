"use client";

import { useState } from "react";
import Link from "next/link";
import type { Analisis } from "@/modulos/inventario/analisis-dif";

/**
 * LAS NOTIFICACIONES DE LA MB51 DEL DÍA (Plan vs notificado), al corte de las 6: por código y orden, lo PENDIENTE POR
 * NOTIFICAR (suma al conteo) y la NOTIFICACION (suma a SAP), con el porqué de cada una. Si suman ya están en el
 * análisis; «Copiar para la plantilla» las deja listas para pegar en la hoja NOVEDADES (tipo, documento, código,
 * estibas, cajas, unidades) por si se prefiere llevarlas en la plantilla.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function NotifMb51({ datos }: { datos: NonNullable<Analisis["notificaciones"]> }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const pend = datos.filas.filter((f) => f.lado === "CONTEO"), notif = datos.filas.filter((f) => f.lado === "SAP");
  const tot = (xs: typeof datos.filas) => xs.reduce((a, f) => a + f.unidades, 0);

  async function copiar() {
    const tsv = datos.filas.map((f) => [f.tipo, f.documento, f.codigo, "", "", f.unidades].join("\t")).join("\n");
    try { await navigator.clipboard.writeText(tsv); setCopiado(`${datos.filas.length} filas copiadas: pégalas en la columna A de NOVEDADES.`) }
    catch { setCopiado("El navegador no dejó copiar. Selecciona la tabla y cópiala a mano.") }
  }

  return (
    <details className="ad-que">
      <summary>Notificaciones de la MB51 al corte de las 6 · {pend.length ? `pendiente por notificar ${nf.format(tot(pend))} u` : "nada pendiente"}{notif.length ? ` · notificación ${nf.format(tot(notif))} u` : ""} · {datos.sumadas ? "ya suman en el análisis" : "no suman"}</summary>
      <section className="ad-caja">
        <h2>Pendiente por notificar y notificaciones (MB51)</h2>
        <p className="ad-nota">
          La ZEXI de las 6 solo tiene lo <b>digitado</b> hasta las 6. <b>PENDIENTE POR NOTIFICAR</b> (suma al CONTEO): el 261 de una orden que se
          digitó después de las 6, o que todavía no aparece. <b>NOTIFICACION</b> (suma a SAP): el 262 (reverso) digitado después de las 6.
          {datos.motivo ? <> <b>{datos.motivo}</b></> : datos.sumadas ? " Ya están sumadas en el análisis: en el detalle de cada código salen con «(MB51)» y la orden." : ""}
          {!datos.alcanza && datos.ultima ? " La MB51 cargada no llega después de las 6 de este día: lo digitado tarde todavía no se ve." : ""}
        </p>
        {datos.filas.length ? (
          <div className="ad-tabla-caja">
            <table className="ad-t">
              <thead><tr><th>Tipo</th><th>Suma en</th><th>Código</th><th>Descripción</th><th className="n">Unidades</th><th>Orden</th><th>Por qué</th></tr></thead>
              <tbody>{datos.filas.map((f, i) => (
                <tr key={i}>
                  <td><b>{f.tipo}</b></td>
                  <td><span className={"ad-lado " + (f.lado === "SAP" ? "sap" : "con")}>{f.lado}</span></td>
                  <td className="mono">{f.codigo}</td><td>{f.texto}</td>
                  <td className="n b">{nf.format(f.unidades)}</td>
                  <td className="mono">{f.documento}</td>
                  <td><small>{f.porque}</small></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="ad-nota">Con la MB51 cargada no hay nada pendiente por notificar ni notificaciones al corte de las 6 de este día.</p>}
        <p className="ad-ir">
          {datos.filas.length > 0 && <button type="button" className="ad-bt alt" onClick={() => void copiar()}>Copiar para la plantilla</button>}
          <Link className="ad-bt alt" href="/inventario/envase/cargar">Subir otra MB51</Link>
          {copiado && <small role="status"> {copiado}</small>}
        </p>
      </section>
    </details>
  );
}
