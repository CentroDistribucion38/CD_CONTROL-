"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { porTandas } from "@/modulos/inventario/paginas";
import { diaEfectivo, type Unidad } from "@/modulos/casco/comparar";
import { armarTablaUbicacion, enUnidad, totalEnUnidad, type Factores, type RenglonConteo, type Sitio } from "@/modulos/casco/comparar-ubicacion";
import type { DatosTablaFoto } from "@/modulos/casco/foto-comparativo";

/**
 * LA TABLA, IGUAL A TU EXCEL: material · almacén · módulo · número · estado del envase, con las
 * cantidades del conteo A y del conteo B y la diferencia (verde si no subió, rojo si subió).
 *
 * Sale del CONTEO físico (que viene en ESTIBAS). Cada día se toma el último conteo cerrado igual o
 * anterior a la fecha escogida arriba. Se pueden ver las tres unidades a la vez (HL, Estibas, Cajas):
 * cada una es un bloque de tres columnas con su nombre arriba. Los colores son los del Excel a propósito.
 */
export type ConteoDia = { id: string; fecha: string };
export type { Factores };

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const nfs = { est: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }), hl: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }), caj: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }) };
const TXT_NOMBRE: Record<Unidad, string> = { est: "Estibas", hl: "HL", caj: "Cajas" };
const TXT_UNIDAD: Record<Unidad, string> = { est: "ESTIBAS", hl: "HL", caj: "CAJAS" };
const claseSitio: Record<Sitio, string> = { "BODEGA 38": "bod", FABRICA: "fab", EXPORTACION: "exp", BTS: "bts" };
export const ORDEN_UNIDADES: Unidad[] = ["hl", "est", "caj"];

/**
 * Los datos de la tabla, aparte de su dibujo, para que el Comparativo pueda sacar la FOTO de la tabla
 * aunque esté en la pestaña del Dashboard. Solo lee los conteos cuando `activo` (pestaña Tabla) o
 * cuando se pide la foto (`cargar`), una vez cada uno.
 */
export function useTablaUbicacion(conteos: ConteoDia[], diaA: string, diaB: string, activo: boolean, unidades: Unidad[], factores: Factores) {
  const fechas = useMemo(() => [...new Set(conteos.map((c) => c.fecha))].sort(), [conteos]);
  const fA = diaEfectivo(fechas, diaA), fB = diaEfectivo(fechas, diaB);
  const [datos, setDatos] = useState<Record<string, RenglonConteo[]>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);   // null = todavía no se escogió (arranca en LAVADO si hay)
  const [soloCambios, setSoloCambios] = useState(false);
  const cache = useRef<Record<string, RenglonConteo[]>>({});
  const enVuelo = useRef<Record<string, Promise<RenglonConteo[]>>>({});

  const leer = useCallback((f: string): Promise<RenglonConteo[]> => {
    const hay = cache.current[f];
    if (hay) return Promise.resolve(hay);
    let p = enVuelo.current[f];
    if (!p) {
      p = (async () => {
        const sb = createClient();
        const ids = conteos.filter((c) => c.fecha === f).map((c) => c.id);
        const r = await porTandas<RenglonConteo & { id?: number }>(ids, (t, d, h) =>
          sb.from("v_conteo_fefo").select("conteo_id, codigo, material, ubicacion, estado_envase, total_estibas").in("conteo_id", t).order("id").range(d, h));
        if (r.error) throw new Error(r.error);
        cache.current[f] = r.data;
        setDatos((x) => ({ ...x, [f]: r.data }));
        return r.data;
      })().finally(() => { delete enVuelo.current[f] });
      enVuelo.current[f] = p;
    }
    return p;
  }, [conteos]);

  /* Se leen solo los dos conteos que hacen falta, una vez cada uno. */
  useEffect(() => {
    if (!activo) return;
    const faltan = [...new Set([fA, fB].filter((f): f is string => !!f && !cache.current[f]))];
    if (!faltan.length) return;
    let vivo = true;
    setCargando(true); setError(null);
    Promise.all(faltan.map(leer))
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : "error") })
      .finally(() => { if (vivo) setCargando(false) });
    return () => { vivo = false };
  }, [activo, fA, fB, leer]);

  const rA = useMemo(() => (fA ? datos[fA] ?? [] : []), [datos, fA]);
  const rB = useMemo(() => (fB ? datos[fB] ?? [] : []), [datos, fB]);
  const listo = (!fA || !!datos[fA]) && (!fB || !!datos[fB]);
  const todosEstados = useMemo(() => armarTablaUbicacion(rA, rB, "", false).estados, [rA, rB]);
  const est = estado ?? (todosEstados.includes("LAVADO") ? "LAVADO" : "");
  /* La tabla se arma SIEMPRE en estibas (lo que trae el conteo); HL y cajas se calculan por material al pintar. */
  const t = useMemo(() => armarTablaUbicacion(rA, rB, est, soloCambios), [rA, rB, est, soloCambios]);

  /* Por unidad, los materiales a la vista que el maestro no trae: no se inventan, salen con «—». */
  const sinFactor = useMemo(() => {
    const r: Partial<Record<Unidad, string[]>> = {};
    for (const u of unidades) {
      if (u === "est") continue;
      const s = t.grupos.filter((g) => enUnidad(u, g.codigo, 1, factores) == null).map((g) => g.codigo);
      if (s.length) r[u] = s;
    }
    return r;
  }, [t, unidades, factores]);

  /** Para la foto: lee lo que falte y entrega la tabla tal como se ve (null si no hay dos conteos distintos). */
  const cargar = useCallback(async (): Promise<DatosTablaFoto | null> => {
    if (!fA || !fB || fA === fB) return null;
    const [a, b] = await Promise.all([leer(fA), leer(fB)]);
    const estados = armarTablaUbicacion(a, b, "", false).estados;
    const e = estado ?? (estados.includes("LAVADO") ? "LAVADO" : "");
    return {
      tabla: armarTablaUbicacion(a, b, e, soloCambios), fA, fB, estado: e, soloCambios, unidades, factores,
      chips: [`Unidad${unidades.length > 1 ? "es" : ""}: ${unidades.map((u) => TXT_NOMBRE[u]).join(" · ")}`, e || "Todos los estados", ...(soloCambios ? ["Solo cambios"] : [])],
    };
  }, [fA, fB, leer, unidades, factores, estado, soloCambios]);

  return { fA, fB, cargando, error, listo, todosEstados, est, t, soloCambios, setEstado, setSoloCambios, cargar, hayConteos: conteos.length > 0, unidades, factores, sinFactor };
}
export type TablaUbDatos = ReturnType<typeof useTablaUbicacion>;

export function TablaUbicacion({ tab }: { tab: TablaUbDatos }) {
  const { fA, fB, cargando, error, listo, todosEstados, est, t, soloCambios, setEstado, setSoloCambios, hayConteos, unidades, factores, sinFactor } = tab;
  const cel = (u: Unidad, v: number | null) => (v == null ? "—" : Math.abs(v) < 0.0005 ? "" : nfs[u].format(v));
  const dif = (u: Unidad, v: number | null) => (v == null ? "—" : Math.abs(v) < 0.0005 ? "0" : (v > 0 ? "" : "-") + nfs[u].format(Math.abs(v)));
  const cls = (v: number | null) => "cvx-d " + (v != null && v > 0.0005 ? "sube" : "bien");
  const sinTodos = [...new Set(Object.values(sinFactor).flat())];

  if (!hayConteos) return <p className="cvt-vacio">Todavía no hay conteos cerrados para comparar por ubicación.</p>;

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
      {sinTodos.length > 0 && (
        <details className="cvc-nota cvc-sin">
          <summary>{sinTodos.length} {sinTodos.length === 1 ? "material sale" : "materiales salen"} con «—» en {(Object.keys(sinFactor) as Unidad[]).map((u) => TXT_NOMBRE[u]).join(" y ")}: el maestro no trae su dato por estiba. En Estibas sí salen.</summary>
          <span>{sinTodos.join(", ")}</span>
        </details>
      )}
      {error && <p className="cl-mal" role="alert">No se pudo leer el conteo: {error}</p>}
      {cargando && !listo && <p className="cvc-nota" role="status">Leyendo los conteos…</p>}
      {listo && !error && (t.grupos.length === 0 ? (
        <p className="cvc-nota">No hay renglones con ese estado{soloCambios ? " y esos cambios" : ""}.</p>
      ) : (
        <div className="cvx-caja-tabla">
          <table className="cvx" aria-label="Cantidades por ubicación en los dos conteos">
            <thead>
              <tr className="cvx-titulo">
                <th colSpan={6} className="izq">Suma de TOTAL {unidades.map((u) => TXT_UNIDAD[u]).join(" · ")}</th>
                {unidades.map((u) => <th key={u} colSpan={3} className="cvx-band">{TXT_UNIDAD[u]}</th>)}
              </tr>
              <tr>
                <th>CODIGO</th><th>UBICACIÓN</th><th>DESCRIPCION</th><th>MODULO</th><th>NUMERO</th><th>ESTADO ENVASE</th>
                {unidades.map((u) => (
                  <Fragment key={u}>
                    <th className="cvx-ini">{fA ? dmy(fA) : "—"}</th><th>{fB ? dmy(fB) : "—"}</th><th className="cvx-dif-cab">Diferencia</th>
                  </Fragment>
                ))}
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
                      {unidades.map((u) => {
                        const a = enUnidad(u, f.codigo, f.a, factores), b = enUnidad(u, f.codigo, f.b, factores), d = enUnidad(u, f.codigo, f.d, factores);
                        return <Fragment key={u}><td className="cvx-ini">{cel(u, a)}</td><td>{cel(u, b)}</td><td className={cls(d)}>{dif(u, d)}</td></Fragment>;
                      })}
                    </tr>
                  ))}
                  <tr className="cvx-total">
                    <td colSpan={6} className="izq">Total {g.codigo}</td>
                    {unidades.map((u) => {
                      const a = enUnidad(u, g.codigo, g.a, factores), b = enUnidad(u, g.codigo, g.b, factores), d = enUnidad(u, g.codigo, g.d, factores);
                      return <Fragment key={u}><td className="cvx-ini">{cel(u, a)}</td><td>{cel(u, b)}</td><td className={cls(d)}>{dif(u, d)}</td></Fragment>;
                    })}
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="cvx-total general">
                <td colSpan={6} className="izq">Total general</td>
                {unidades.map((u) => {
                  const T = totalEnUnidad(t, u, factores);
                  return <Fragment key={u}><td className="cvx-ini">{cel(u, T.a)}</td><td>{cel(u, T.b)}</td><td className={cls(T.d)}>{dif(u, T.d)}</td></Fragment>;
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </section>
  );
}
