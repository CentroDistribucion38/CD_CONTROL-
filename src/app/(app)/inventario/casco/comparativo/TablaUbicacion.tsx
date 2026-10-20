"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { porTandas } from "@/modulos/inventario/paginas";
import { diaEfectivo, type Unidad } from "@/modulos/casco/comparar";
import { armarTablaUbicacion, type RenglonConteo, type Sitio } from "@/modulos/casco/comparar-ubicacion";
import type { DatosTablaFoto } from "@/modulos/casco/foto-comparativo";

/**
 * LA TABLA, IGUAL A TU EXCEL: material · almacén · módulo · número · estado del envase, con las
 * estibas del conteo A y del conteo B y la diferencia (verde si no subió, rojo si subió).
 *
 * Sale del CONTEO físico. Cada día se toma el último conteo cerrado igual o anterior a la fecha
 * escogida arriba. Los colores son los del Excel a propósito (no los del tema): es la misma hoja.
 */
export type ConteoDia = { id: string; fecha: string };

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Cuánto vale una estiba de cada material en HL y en cajas (null = el maestro no lo trae). */
export type Factores = Record<string, { hl: number | null; caj: number | null }>;
const nfs = { est: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }), hl: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }), caj: new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }) };
const TXT_NOMBRE: Record<Unidad, string> = { est: "Estibas", hl: "HL", caj: "Cajas" };
const TXT_UNIDAD: Record<Unidad, string> = { est: "ESTIBAS", hl: "HL", caj: "CAJAS" };
const claseSitio: Record<Sitio, string> = { "BODEGA 38": "bod", FABRICA: "fab", EXPORTACION: "exp", BTS: "bts" };

/**
 * Los datos de la tabla, aparte de su dibujo, para que el Comparativo pueda sacar la FOTO de la tabla
 * aunque esté en la pestaña del Dashboard. Solo lee los conteos cuando `activo` (pestaña Tabla) o
 * cuando se pide la foto (`cargar`), una vez cada uno.
 */
export function useTablaUbicacion(conteos: ConteoDia[], diaA: string, diaB: string, activo: boolean, unidad: Unidad, factores: Factores) {
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

  /* Los conteos vienen en estibas: para HL o cajas se multiplica por lo que vale una estiba de ese material.
     El material sin ese dato no se inventa: se deja fuera y se avisa. */
  const convertir = useCallback((rs: RenglonConteo[]) => {
    if (unidad === "est") return { filas: rs, sin: [] as string[] };
    const sin = new Set<string>();
    const filas: RenglonConteo[] = [];
    for (const r of rs) {
      const f = factores[r.codigo]?.[unidad];
      if (f == null || !(f > 0)) { sin.add(r.codigo); continue }
      filas.push({ ...r, total_estibas: Number(r.total_estibas ?? 0) * f });
    }
    return { filas, sin: [...sin] };
  }, [unidad, factores]);
  const cA = useMemo(() => convertir(fA ? datos[fA] ?? [] : []), [datos, fA, convertir]);
  const cB = useMemo(() => convertir(fB ? datos[fB] ?? [] : []), [datos, fB, convertir]);
  const rA = cA.filas, rB = cB.filas;
  const sinFactor = useMemo(() => [...new Set([...cA.sin, ...cB.sin])].sort(), [cA, cB]);
  const listo = (!fA || !!datos[fA]) && (!fB || !!datos[fB]);
  const todosEstados = useMemo(() => armarTablaUbicacion(rA, rB, "", false).estados, [rA, rB]);
  const est = estado ?? (todosEstados.includes("LAVADO") ? "LAVADO" : "");
  const t = useMemo(() => armarTablaUbicacion(rA, rB, est, soloCambios), [rA, rB, est, soloCambios]);

  /** Para la foto: lee lo que falte y entrega la tabla tal como se ve (null si no hay dos conteos distintos). */
  const cargar = useCallback(async (): Promise<DatosTablaFoto | null> => {
    if (!fA || !fB || fA === fB) return null;
    const [crA, crB] = await Promise.all([leer(fA), leer(fB)]);
    const a = convertir(crA).filas, b = convertir(crB).filas;
    const estados = armarTablaUbicacion(a, b, "", false).estados;
    const e = estado ?? (estados.includes("LAVADO") ? "LAVADO" : "");
    return { tabla: armarTablaUbicacion(a, b, e, soloCambios), fA, fB, estado: e, soloCambios, chips: [`Unidad: ${TXT_NOMBRE[unidad]}`, e || "Todos los estados", ...(soloCambios ? ["Solo cambios"] : [])], unidad };
  }, [fA, fB, leer, convertir, unidad, estado, soloCambios]);

  return { fA, fB, cargando, error, listo, todosEstados, est, t, soloCambios, setEstado, setSoloCambios, cargar, hayConteos: conteos.length > 0, unidad, sinFactor };
}
export type TablaUbDatos = ReturnType<typeof useTablaUbicacion>;

export function TablaUbicacion({ tab }: { tab: TablaUbDatos }) {
  const { fA, fB, cargando, error, listo, todosEstados, est, t, soloCambios, setEstado, setSoloCambios, hayConteos, unidad, sinFactor } = tab;
  const nf = nfs[unidad];
  const celda = (v: number) => (Math.abs(v) < 0.0005 ? "" : nf.format(v));
  const dif = (v: number) => (Math.abs(v) < 0.0005 ? "0" : (v > 0 ? "" : "-") + nf.format(Math.abs(v)));
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
      {unidad !== "est" && sinFactor.length > 0 && (
        <p className="cvc-nota">Sin {unidad === "hl" ? "HL" : "cajas"} por estiba en el maestro, y por eso no salen aquí: {sinFactor.join(", ")}. Cámbialo a Estibas para verlos.</p>
      )}
      {error && <p className="cl-mal" role="alert">No se pudo leer el conteo: {error}</p>}
      {cargando && !listo && <p className="cvc-nota" role="status">Leyendo los conteos…</p>}
      {listo && !error && (t.grupos.length === 0 ? (
        <p className="cvc-nota">No hay renglones con ese estado{soloCambios ? " y esos cambios" : ""}.</p>
      ) : (
        <div className="cvx-caja-tabla">
          <table className="cvx" aria-label="Estibas por ubicación en los dos conteos">
            <thead>
              <tr className="cvx-titulo"><th colSpan={6} className="izq">Suma de TOTAL {TXT_UNIDAD[unidad]}</th><th colSpan={2}>FECHA</th><th /></tr>
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
