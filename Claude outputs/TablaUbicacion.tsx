"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { porTandas } from "@/modulos/inventario/paginas";
import { diaEfectivo } from "@/modulos/casco/comparar";
import { armarTablaUbicacion, type RenglonConteo, type Sitio } from "@/modulos/casco/comparar-ubicacion";

/**
 * LA TABLA, IGUAL A TU EXCEL: material · almacén · módulo · número · estado del envase, con las
 * estibas del conteo A y del conteo B y la diferencia (verde si no subió, rojo si subió).
 *
 * Sale del CONTEO físico. Cada día se toma el último conteo cerrado igual o anterior a la fecha
 * escogida arriba. Los colores son los del Excel a propósito (no los del tema): es la misma hoja.
 */
export type ConteoDia = { id: string; fecha: string };

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const celda = (v: number) => (Math.abs(v) < 0.0005 ? "" : nf.format(v));
const dif = (v: number) => (Math.abs(v) < 0.0005 ? "0" : (v > 0 ? "" : "-") + nf.format(Math.abs(v)));
const claseSitio: Record<Sitio, string> = { "BODEGA 38": "bod", FABRICA: "fab", EXPORTACION: "exp", BTS: "bts" };

export function TablaUbicacion({ conteos, diaA, diaB }: { conteos: ConteoDia[]; diaA: string; diaB: string }) {
  const fechas = useMemo(() => [...new Set(conteos.map((c) => c.fecha))].sort(), [conteos]);
  const fA = diaEfectivo(fechas, diaA), fB = diaEfectivo(fechas, diaB);
  const [datos, setDatos] = useState<Record<string, RenglonConteo[]>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);   // null = todavía no se escogió (arranca en LAVADO si hay)
  const [soloCambios, setSoloCambios] = useState(false);
  const pedidas = useRef(new Set<string>());

  /* Se leen solo los dos conteos que hacen falta, una vez cada uno. */
  useEffect(() => {
    const faltan = [fA, fB].filter((f): f is string => !!f && !pedidas.current.has(f));
    if (!faltan.length) return;
    let vivo = true;
    setCargando(true); setError(null);
    (async () => {
      const sb = createClient();
      for (const f of [...new Set(faltan)]) {
        const ids = conteos.filter((c) => c.fecha === f).map((c) => c.id);
        const r = await porTandas<RenglonConteo & { id?: number }>(ids, (t, d, h) =>
          sb.from("v_conteo_fefo").select("conteo_id, codigo, material, ubicacion, estado_envase, total_estibas").in("conteo_id", t).order("id").range(d, h));
        if (!vivo) return;
        if (r.error) { setError(r.error); setCargando(false); return }
        pedidas.current.add(f);
        setDatos((x) => ({ ...x, [f]: r.data }));
      }
      if (vivo) setCargando(false);
    })();
    return () => { vivo = false };
  }, [fA, fB, conteos]);

  const rA = useMemo(() => (fA ? datos[fA] ?? [] : []), [datos, fA]);
  const rB = useMemo(() => (fB ? datos[fB] ?? [] : []), [datos, fB]);
  const listo = (!fA || !!datos[fA]) && (!fB || !!datos[fB]);
  const todosEstados = useMemo(() => armarTablaUbicacion(rA, rB, "", false).estados, [rA, rB]);
  const est = estado ?? (todosEstados.includes("LAVADO") ? "LAVADO" : "");
  const t = useMemo(() => armarTablaUbicacion(rA, rB, est, soloCambios), [rA, rB, est, soloCambios]);

  if (!conteos.length) return <p className="cvt-vacio">Todavía no hay conteos cerrados para comparar por ubicación.</p>;

  let n = 0;
  return (
    <section className="cvt-caja cvx-caja" aria-label="Tabla por ubicación">
      <header className="cvt-cab">
        <h2>TABLA POR UBICACIÓN · CONTEO DEL {fA ? dmy(fA) : "—"} AL {fB ? dmy(fB) : "—"}</h2>
        <span className="cvc-chips">
          <button type="button" className="cvc-chip" aria-pressed={est === ""} onClick={() => setEstado("")}>Todos los estados</button>
          {todosEstados.map((e) => (
            <button key={e} type="button" className="cvc-chip" aria-pressed={est === e} onClick={() => setEstado(e)}>{e}</button>
          ))}
          <button type="button" className="cvc-chip" aria-pressed={soloCambios} onClick={() => setSoloCambios(!soloCambios)}>Solo cambios</button>
        </span>
      </header>
      {fA && fB && fA === fB && <p className="cvc-nota">Los dos días caen en el mismo conteo ({dmy(fA)}): no hay nada que comparar. Escoge otra fecha arriba.</p>}
      {(!fA || !fB) && <p className="cvc-nota">No hay un conteo cerrado hasta {!fA ? "el día A" : "el día B"}: escoge una fecha más reciente.</p>}
      {error && <p className="cl-mal" role="alert">No se pudo leer el conteo: {error}</p>}
      {cargando && !listo && <p className="cvc-nota" role="status">Leyendo los conteos…</p>}
      {listo && !error && (t.grupos.length === 0 ? (
        <p className="cvc-nota">No hay renglones con ese estado{soloCambios ? " y esos cambios" : ""}.</p>
      ) : (
        <div className="cvx-caja-tabla">
          <table className="cvx" aria-label="Estibas por ubicación en los dos conteos">
            <thead>
              <tr className="cvx-titulo"><th colSpan={6} className="izq">Suma de TOTAL ESTIBAS</th><th colSpan={2}>FECHA</th><th /></tr>
              <tr>
                <th>CODIGO</th><th>UBICACIÓN</th><th>DESCRIPCION</th><th>MODULO</th><th>NUMERO</th><th>ESTADO ENVASE</th>
                <th>{fA ? dmy(fA) : "—"}</th><th>{fB ? dmy(fB) : "—"}</th><th className="cvx-dif-cab">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {t.grupos.map((g) => (
                <Fragment key={g.codigo}>
                  {g.filas.map((f) => (
                    <tr key={[f.sitio, f.modulo, f.numero, f.estado].join("|")} className={n++ % 2 === 0 ? "gris" : "blanco"}>
                      <td className="b">{f.codigo}</td>
                      <td className={"cvx-sitio " + claseSitio[f.sitio]}>{f.sitio}</td>
                      <td className="b">{f.material}</td>
                      <td>{f.modulo}</td>
                      <td className="b">{f.numero}</td>
                      <td className="cvx-estado">{f.estado}</td>
                      <td>{celda(f.a)}</td><td>{celda(f.b)}</td>
                      <td className={"cvx-d " + (f.d > 0.0005 ? "sube" : "bien")}>{dif(f.d)}</td>
                    </tr>
                  ))}
                  <tr className="cvx-total">
                    <td colSpan={6} className="izq">Total {g.codigo}</td>
                    <td>{celda(g.a)}</td><td>{celda(g.b)}</td>
                    <td className={"cvx-d " + (g.d > 0.0005 ? "sube" : "bien")}>{dif(g.d)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="cvx-total general">
                <td colSpan={6} className="izq">Total general</td>
                <td>{celda(t.a)}</td><td>{celda(t.b)}</td>
                <td className={"cvx-d " + (t.d > 0.0005 ? "sube" : "bien")}>{dif(t.d)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </section>
  );
}
