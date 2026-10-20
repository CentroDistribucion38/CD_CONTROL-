"use client";

/**
 * TODOS LOS ALMACENES — por SKU, lo contado y lo de SAP en AG22, AG18, AG17 y AG16 según sus Cuadres SAP.
 * Tocar un código abre el desglose por almacén. Balanceado o descuadre (con su observación).
 */
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ALMACENES, type Todos as Datos, type FilaTodos } from "@/modulos/inventario/todos-tipos";
import { Avisos } from "./Avisos";
import { EtiquetaEnLinea, LeyendaEnLinea, type MapaEnLinea } from "./EnLinea";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));
const signo = (v: number | null | undefined) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v)));
const GRUPOS = ["TODOS", "ENVASE", "CAJA", "ESTIBA", "PRODUCTO"] as const;
const ETQ_G: Record<string, string> = { TODOS: "Todos", ENVASE: "Envase", CAJA: "Cajas plásticas", ESTIBA: "Estibas", PRODUCTO: "Producto" };
const CLASE = { BALANCEADO: "ok", DESCUADRE: "falta", "SIN SAP": "parcial" } as const;

export function Todos({ datos, hoy, enLinea = {} }: { datos: Datos; hoy: string; enLinea?: MapaEnLinea }) {
  const router = useRouter();
  const [grupo, setGrupo] = useState<(typeof GRUPOS)[number]>("TODOS");
  const [soloDesc, setSoloDesc] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

  const filas = useMemo(() => datos.filas.filter((f) =>
    (grupo === "TODOS" || f.grupo === grupo) && (!soloDesc || f.estado === "DESCUADRE")
    && (!buscar.trim() || `${f.codigo} ${f.material}`.toLowerCase().includes(buscar.trim().toLowerCase()))), [datos.filas, grupo, soloDesc, buscar]);
  const nDesc = datos.filas.filter((f) => f.estado === "DESCUADRE").length;
  const estibasTot = datos.almacenes.reduce((t, a) => t + a.conteoEstibas, 0);

  return (
    <>
      <div className="ad-k ad-k4">
        {datos.almacenes.map((a) => (
          <div key={a.alm} title={a.zexiArchivo ?? undefined}>
            <span>{a.alm}</span><b>{a.hayCuadre ? n(a.materiales) : "—"}</b>
            <small>{!a.hayCuadre ? "sin cuadre ese día" : !a.hayZexi ? "sin ZEXI cargada" : a.descuadres ? `${a.descuadres} con descuadre` : "todo balanceado"}</small>
          </div>
        ))}
      </div>
      <Avisos avisos={datos.avisos} />

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Todos los almacenes · {new Date(datos.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
          <label className="ad-chk"><input type="date" value={datos.fecha} max={hoy} onChange={(e) => e.target.value && router.push(`/inventario/balance/analisis?fecha=${e.target.value}&paso=todos`)} /></label>
        </div>
        <p className="ad-nota" style={{ marginTop: 0 }}>
          <b>{nDesc}</b> de {datos.filas.length} códigos con descuadre. Estibas contadas en los cuatro almacenes: <b>{n(estibasTot)}</b>
          {" "}({datos.almacenes.map((a) => `${a.alm} ${n(a.conteoEstibas)}`).join(" · ")}).
        </p>
        <div className="ad-hoja-cab" style={{ gap: 10, flexWrap: "wrap" }}>
          {GRUPOS.map((g) => <button key={g} type="button" className={"ad-bt" + (grupo === g ? "" : " alt")} onClick={() => setGrupo(g)}>{ETQ_G[g]}</button>)}
          <label className="ad-chk"><input type="checkbox" checked={soloDesc} onChange={(e) => setSoloDesc(e.target.checked)} /> Solo descuadres</label>
          <input type="search" placeholder="Buscar código o material" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        {filas.length === 0 ? <p className="ad-vacio">No hay nada para ese día o ese filtro: falta el conteo o el Cuadre SAP.</p> : (
          <>
          <LeyendaEnLinea codigos={filas.map((f) => f.codigo)} enLinea={enLinea} />
          <div className="ad-tabla-caja">
            <table className="ad-t ad-piv">
              <thead><tr><th>Código</th><th>Material</th>{ALMACENES.map((a) => <th key={a} className="n">{a}</th>)}<th className="n">Conteo</th><th className="n">SAP</th><th className="n">Queda</th><th>Estado</th></tr></thead>
              <tbody>
                {filas.map((f: FilaTodos) => {
                  const ab = abierta === f.codigo;
                  return (
                    <Fragment key={f.codigo}>
                      <tr className={(ab ? "ab" : "") + (enLinea[f.codigo]?.length ? " enl" : "")}>
                        <td className="mono"><button type="button" className="ad-cod" aria-expanded={ab} onClick={() => setAbierta(ab ? null : f.codigo)}>{f.codigo}</button></td>
                        <td>{f.material}<EtiquetaEnLinea xs={enLinea[f.codigo]} />{f.estado === "DESCUADRE" && <small>{f.observacion}</small>}</td>
                        {ALMACENES.map((a) => <td key={a} className="n">{f.alm[a] ? n(f.alm[a]!.conteo) : "—"}</td>)}
                        <td className="n b">{n(f.conteo)}</td>
                        <td className="n">{n(f.sap)}</td>
                        <td className={"n b" + ((f.queda ?? 0) < -0.5 ? " neg" : (f.queda ?? 0) > 0.5 ? " pos" : "")}>{signo(f.queda)}</td>
                        <td><span className={"ad-est " + CLASE[f.estado]}>{f.estado}</span></td>
                      </tr>
                      {ab && (
                        <tr className="ad-det"><td colSpan={ALMACENES.length + 6}>
                          <table className="ad-t">
                            <thead><tr><th>Almacén</th><th className="n">Conteo</th><th className="n">SAP</th><th className="n">Movido</th><th className="n">SAP después</th><th className="n">Queda</th><th>Detalle</th></tr></thead>
                            <tbody>
                              {ALMACENES.map((a) => { const k = f.alm[a]; return k ? (
                                <tr key={a}><td><b>{a}</b></td><td className="n">{n(k.conteo)}</td><td className="n">{n(k.sap)}</td><td className="n">{signo(k.movido)}</td><td className="n">{n(k.sapDespues)}</td>
                                  <td className={"n b" + ((k.queda ?? 0) < -0.5 ? " neg" : (k.queda ?? 0) > 0.5 ? " pos" : "")}>{signo(k.queda)}</td><td>{k.detalle ?? ""}</td></tr>
                              ) : (
                                <tr key={a}><td><b>{a}</b></td><td colSpan={6} className="cero">no aparece en el cuadre de este almacén</td></tr>
                              ); })}
                            </tbody>
                          </table>
                          {f.estado === "DESCUADRE" && <p className="ad-nota"><b>Observación:</b> {f.observacion}.</p>}
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        <p className="ad-nota">Sale de los Cuadres SAP de AG22, AG18, AG17 y AG16 del día. Conteo = lo que debe haber en SAP según lo contado; Queda = SAP después de lo movido − conteo (+ SAP de más, − SAP de menos). Envase en unidades, cajas plásticas y producto en cajas, estibas por unidad.</p>
      </section>
    </>
  );
}
