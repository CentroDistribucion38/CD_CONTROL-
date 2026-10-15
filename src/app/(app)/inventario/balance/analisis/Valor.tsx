"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { FilaAjuste, Guardado, Precio } from "@/modulos/inventario/analisis-ajustes";
import { analisisFinal } from "@/modulos/inventario/compensa";

/**
 * VALOR $ — «cada diferencia y cada ajuste con su valor: así ves cuánta plata hay en juego, no solo unidades».
 * Unidades × precio por unidad (el de la botella del MM60; si no lo tiene, el costo del maestro de Pasivos).
 * Sale del análisis guardado y de lo marcado como hecho, igual que el análisis final.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const $ = (v: number) => (v < 0 ? "−" : v > 0 ? "+" : "") + pesos.format(Math.abs(v));
const largo = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function Valor({ fecha, guardado, ajustes, precios }: { fecha: string; guardado: Guardado | null; ajustes: FilaAjuste[]; precios: Record<string, Precio> }) {
  const [orden, setOrden] = useState<"familia" | "valor">("valor");
  const filas = useMemo(() => analisisFinal(ajustes).map((f) => {
    const p = precios[f.codigo];
    const u = p?.precio ?? 0;
    return { ...f, precio: p?.precio ?? null, fuente: p?.fuente ?? null, vDif: f.diferencia * u, vAjuste: f.ajuste * u, vComp: f.compensa * u, vFinal: f.difFinal * u };
  }), [ajustes, precios]);
  type F = (typeof filas)[number];
  const s = (k: (f: F) => number, xs: F[] = filas) => xs.reduce((t, f) => t + k(f), 0);
  const sinPrecio = filas.filter((f) => f.precio == null && (f.diferencia !== 0 || f.ajuste !== 0));
  const vistas = useMemo(() => {
    const xs = filas.filter((f) => f.diferencia !== 0 || f.ajuste !== 0 || f.difFinal !== 0);
    return orden === "valor" ? [...xs].sort((a, b) => Math.abs(b.vDif) - Math.abs(a.vDif)) : xs;
  }, [filas, orden]);
  const grupos = useMemo(() => {
    if (orden === "valor") return [["", vistas] as const];
    const m = new Map<string, F[]>();
    for (const f of vistas) (m.get(f.familia) ?? m.set(f.familia, []).get(f.familia)!).push(f);
    return [...m];
  }, [vistas, orden]);
  const [armando, setArmando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  async function bajarExcel() {
    setArmando(true); setMal(null);
    try {
      const { armarLibroValor } = await import("@/modulos/inventario/libro-ajustes");
      const buf = await armarLibroValor({ fechaLarga: largo(fecha), guardadoEn: guardado?.guardado_en ?? null, guardadoPor: guardado?.guardado_por ?? null,
        filas: filas.map((f) => ({ familia: f.familia, codigo: f.codigo, descripcion: f.descripcion, precio: f.precio, fuente: f.fuente, diferencia: f.diferencia, vDif: f.vDif, compensa: f.compensa, vComp: f.vComp, ajuste: f.ajuste, vAjuste: f.vAjuste, difFinal: f.difFinal, vFinal: f.vFinal, observacion: f.observacion })) });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `valor-diferencia-bodega38-${fecha}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { setMal("No se pudo armar el Excel. Vuelve a intentar.") }
    finally { setArmando(false) }
  }

  if (!guardado) return (
    <section className="ad-caja">
      <h2>Todavía no se ha guardado el análisis del {largo(fecha)}</h2>
      <p className="ad-nota">El valor sale del análisis guardado. Vuelve al paso 1 y dale <b>Guardar y pasar a ajustes</b>.</p>
      <p className="ad-ir"><Link className="ad-bt" href={`/inventario/balance/analisis?fecha=${fecha}`}>← Ir al análisis</Link></p>
    </section>
  );

  return (
    <>
      <div className="ad-barra">
        <div className="ad-carga">
          <b>Valor en pesos · {largo(fecha)}</b>
          <small>Unidades × precio por unidad: el de la botella del MM60 (maestro de productos) y, si no lo tiene, el costo del maestro de Pasivos.</small>
        </div>
        <button type="button" className="ad-bt" disabled={armando} onClick={() => void bajarExcel()}>{armando ? "Armando el Excel…" : "Descargar Excel"}</button>
      </div>
      {mal && <p className="ad-msg mal">{mal}</p>}
      {sinPrecio.length > 0 && <p className="ad-msg mal">Sin precio ({sinPrecio.length}): {sinPrecio.map((f) => f.codigo).join(", ")}. Su valor sale en $0 hasta que tengan precio en el maestro.</p>}

      <div className="ad-k ad-k4">
        <div><span>VALOR DE LA DIFERENCIA</span><b className={s((f) => f.vDif) < 0 ? "ad-rojo" : ""}>{$(s((f) => f.vDif))}</b><small>neto, antes de compensar</small></div>
        <div className="sobra"><span>SOBRANTE</span><b>{$(s((f) => Math.max(0, f.vAjuste)))}</b><small>lo que se ajusta subiendo SAP</small></div>
        <div className="falta"><span>FALTANTE</span><b>{$(s((f) => Math.min(0, f.vAjuste)))}</b><small>lo que se ajusta bajando SAP</small></div>
        <div className={s((f) => f.vFinal) === 0 ? "sobra" : "falta"}><span>PENDIENTE</span><b>{$(s((f) => f.vFinal))}</b><small>lo que sigue con diferencia</small></div>
      </div>

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Valor por código</h2>
          <div className="ad-ver" role="tablist" aria-label="Orden">
            <button type="button" role="tab" aria-selected={orden === "valor"} className={orden === "valor" ? "on" : ""} onClick={() => setOrden("valor")}>Mayor valor primero</button>
            <button type="button" role="tab" aria-selected={orden === "familia"} className={orden === "familia" ? "on" : ""} onClick={() => setOrden("familia")}>Por familia</button>
          </div>
        </div>
        <div className="ad-tabla-caja">
          <table className="ad-t ad-piv ad-aj">
            <thead><tr>
              {orden === "familia" && <th>Familia</th>}<th>Código</th><th>Descripción</th><th className="n">Precio u.</th>
              <th className="n">Diferencia</th><th className="n">Valor diferencia</th><th className="n">Ajuste</th><th className="n">Valor ajuste</th><th className="n">Pendiente</th><th className="n">Valor pendiente</th>
            </tr></thead>
            <tbody>
              {grupos.map(([fam, xs]) => (
                <Fragment key={fam || "todo"}>
                  {xs.map((f, i) => (
                    <tr key={f.codigo}>
                      {orden === "familia" && i === 0 && <td className="fam" rowSpan={xs.length}>{fam}</td>}
                      <td className="mono">{f.codigo}</td>
                      <td>{f.descripcion}</td>
                      <td className="n">{f.precio != null ? <>{pesos.format(f.precio)}<small>{f.fuente}</small></> : <span className="ad-sent falta">Sin precio</span>}</td>
                      <td className={"n" + (f.diferencia < 0 ? " neg" : " pos")}>{signo(f.diferencia)}</td>
                      <td className={"n b" + (f.vDif < 0 ? " neg" : " pos")}>{$(f.vDif)}</td>
                      <td className="n">{f.ajuste ? signo(f.ajuste) : "0"}</td>
                      <td className={"n b" + (f.vAjuste < 0 ? " neg" : f.vAjuste > 0 ? " pos" : "")}>{$(f.vAjuste)}</td>
                      <td className="n">{f.difFinal ? signo(f.difFinal) : "0"}</td>
                      <td className={"n b" + (f.vFinal < 0 ? " neg" : f.vFinal > 0 ? " pos" : "")}>{$(f.vFinal)}</td>
                    </tr>
                  ))}
                  {orden === "familia" && (
                    <tr className="sub"><td colSpan={4}>Total {fam.split(" · ")[0]}</td>
                      <td className="n">{signo(s((f) => f.diferencia, xs as F[]))}</td><td className="n">{$(s((f) => f.vDif, xs as F[]))}</td>
                      <td className="n">{signo(s((f) => f.ajuste, xs as F[]))}</td><td className="n">{$(s((f) => f.vAjuste, xs as F[]))}</td>
                      <td className="n">{signo(s((f) => f.difFinal, xs as F[]))}</td><td className="n">{$(s((f) => f.vFinal, xs as F[]))}</td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot><tr>
              <td colSpan={orden === "familia" ? 4 : 3}>Total</td>
              <td className="n">{signo(s((f) => f.diferencia))}</td><td className="n">{$(s((f) => f.vDif))}</td>
              <td className="n">{signo(s((f) => f.ajuste))}</td><td className="n">{$(s((f) => f.vAjuste))}</td>
              <td className="n">{signo(s((f) => f.difFinal))}</td><td className="n">{$(s((f) => f.vFinal))}</td>
            </tr></tfoot>
          </table>
        </div>
        <p className="ad-nota">Valor = unidades × precio por unidad. Ajuste = diferencia + compensación (la compensación R ↔ NR mueve unidades entre dos códigos de la misma botella). Pendiente = lo que sigue con diferencia después de lo marcado como hecho.</p>
      </section>
    </>
  );
}
