import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { armarAnalisisProducto, ciclicos, historicoProducto, leerAjustesProducto } from "@/modulos/inventario/producto-dif";
import { AnalisisProducto } from "./AnalisisProducto";
import { AjustesProducto, FinalProducto } from "./AjustesProducto";
import { SelectorCiclico } from "./SelectorCiclico";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../../balance/balance.css";
import "../../balance/analisis/analisis.css";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · PRODUCTO · ANÁLISIS DE DIFERENCIA.
 *
 * «Se toma el conteo de Bavaria y se compara con la existencia y se cruzan las dos, así como el análisis de
 *  diferencia que tenemos en el Balance: debe llevar la misma estructura.»
 *
 * Los mismos pasos del de Balance, por inventario cíclico (no por día):
 *   1 Análisis  — CONTEO (lo que contó Bavaria + novedades) contra SAP (ZEXI PRODUCTO + novedades), con la plantilla.
 *   2 Ajustes   — sobrante / faltante, lo ajustado en SAP y su observación.
 *   3 Análisis final — SAP + ajuste hecho contra el mismo conteo.
 *   4 Histórico — los cíclicos guardados.
 */
const largo = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function AnalisisProductoPage({ searchParams }: { searchParams: Promise<{ c?: string; paso?: string; rd?: string; rh?: string }> }) {
  const q = await searchParams;
  const PASOS = ["ajustes", "final", "historico"] as const;
  const paso = (PASOS as readonly string[]).includes(q.paso ?? "") ? (q.paso as (typeof PASOS)[number]) : "analisis";
  const [permisos, cs] = await Promise.all([misPermisos(), ciclicos()]);
  const puedeEditar = permisos.puedeEditar("/inventario/producto/analisis");
  const c = cs.lista.find((x) => x.id === q.c) ?? cs.lista[0] ?? null;
  const id = c?.id ?? "";

  const cabeza = (titulo: string, sub: React.ReactNode) => (
    <section className="cabeza"><div>
      <p className="ojo">INVENTARIO · PRODUCTO · ANÁLISIS DE DIFERENCIA</p>
      <h1>{titulo}</h1>
      <p className="sub">{sub}</p>
    </div></section>
  );
  const pasos = (
    <>
      <nav className="ad-pasos" aria-label="Pasos">
        <Link href={`/inventario/producto/analisis?c=${id}`} className={paso === "analisis" ? "on" : ""}><b>1</b> Análisis</Link>
        <Link href={`/inventario/producto/analisis?c=${id}&paso=ajustes`} className={paso === "ajustes" ? "on" : ""}><b>2</b> Ajustes</Link>
        <Link href={`/inventario/producto/analisis?c=${id}&paso=final`} className={paso === "final" ? "on" : ""}><b>3</b> Análisis final</Link>
        <Link href={`/inventario/producto/analisis?c=${id}&paso=historico`} className={paso === "historico" ? "on" : ""}><b>4</b> Histórico</Link>
      </nav>
      {paso !== "historico" && cs.lista.length > 0 && (
        <div className="ad-barra">
          <SelectorCiclico lista={cs.lista} actual={c?.id ?? null} paso={paso} />
          {c && <div className="ad-carga"><b>{largo(c.fecha)}</b><small>{c.hojas} {c.hojas === 1 ? "hoja" : "hojas"} · {c.familias.length ? c.familias.join(", ") : "todas las familias"} · {c.estado === "abierto" ? "abierto" : "cerrado"}{c.publicado ? " · visible en Contar" : ""}</small></div>}
        </div>
      )}
    </>
  );
  if (cs.falta) {
    return (
      <div className="fe bal ad">
        {cabeza("Análisis de diferencia", "El conteo de Bavaria del cíclico contra la existencia de SAP.")}
        <p className="ad-msg mal">{cs.falta}</p>
      </div>
    );
  }

  if (paso === "historico") {
    const h = await historicoProducto();
    const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
    const sg = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
    return (
      <div className="fe bal ad">
        {cabeza("Histórico", "Los inventarios cíclicos que se han guardado, con su diferencia y cómo quedaron después de los ajustes.")}
        {pasos}
        {h.falta ? <p className="ad-msg mal">{h.falta}</p> : (
          <section className="ad-caja ad-hoja">
            <div className="ad-tabla-caja">
              <table className="ad-t ad-piv">
                <thead><tr><th>Fecha</th><th>Inventario cíclico</th><th className="n">SAP</th><th className="n">Conteo</th><th className="n">Diferencia</th><th className="n">Códigos con diferencia</th><th className="n">Diferencia final</th><th /></tr></thead>
                <tbody>
                  {h.dias.map((d) => (
                    <tr key={d.fiscalId}>
                      <td className="mono">{d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}/{d.fecha.slice(0, 4)}</td>
                      <td>{d.nombre}</td>
                      <td className="n">{nf.format(d.sap)}</td>
                      <td className="n">{nf.format(d.conteo)}</td>
                      <td className={"n b" + (d.diferencia < 0 ? " neg" : d.diferencia > 0 ? " pos" : "")}>{sg(d.diferencia)}</td>
                      <td className="n">{d.conDif} de {d.codigos}</td>
                      <td className="n">{d.final ? <>{sg(d.final.diferencia)} <small>({d.final.pendientes} pend.)</small></> : <span className="ad-na">sin final</span>}</td>
                      <td><Link className="ad-bt alt" href={`/inventario/producto/analisis?c=${d.fiscalId}`}>Abrir</Link></td>
                    </tr>
                  ))}
                  {!h.dias.length && <tr><td colSpan={8} className="ad-vacio">Todavía no se ha guardado ningún análisis de Producto.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    );
  }

  if (paso === "ajustes" || paso === "final") {
    const aj = c ? await leerAjustesProducto(c.id) : { guardado: null, filas: [], final: null, falta: null };
    const props = { fiscalId: id, nombre: c?.nombre ?? "—", guardado: aj.guardado, filas: aj.filas, puedeEditar, falta: aj.falta, final: aj.final };
    return (
      <div className="fe bal ad">
        {paso === "ajustes"
          ? cabeza("Ajustes", <>Del análisis guardado: lo que queda por <b>ajustar</b> en SAP, sobrante o faltante, lo que ya se ajustó y la observación de cada código.</>)
          : cabeza("Análisis final", "Cómo queda SAP con los ajustes hechos: SAP + ajuste hecho = SAP final, contra el mismo conteo. Lo que siga con diferencia es lo que falta.")}
        {pasos}
        {!c ? <p className="ad-msg mal">Todavía no hay inventarios cíclicos.</p>
          : paso === "ajustes" ? <AjustesProducto {...props} key={`${id}-aj`} /> : <FinalProducto {...props} key={`${id}-fin`} />}
      </div>
    );
  }

  const [datos, aj] = await Promise.all([armarAnalisisProducto(c, q.rd, q.rh), c ? leerAjustesProducto(c.id) : Promise.resolve(null)]);
  return (
    <div className="fe bal ad">
      {cabeza("Análisis de diferencia", <>El conteo de <b>Bavaria</b> del inventario cíclico contra la <b>existencia de SAP</b> (la ZEXI, tal cual sale de SAP), por código y en unidades. Diferencia = CONTEO − SAP. Las novedades van en la misma plantilla del análisis de Balance, y los pasos son los mismos.</>)}
      {pasos}
      <AnalisisProducto key={`${id}|${q.rd ?? ""}|${q.rh ?? ""}`} datos={datos} puedeEditar={puedeEditar} guardadoEn={aj?.guardado?.guardado_en ?? null} />
    </div>
  );
}
