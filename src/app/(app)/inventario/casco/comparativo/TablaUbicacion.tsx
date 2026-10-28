"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { porTandas } from "@/modulos/inventario/paginas";
import { diaEfectivo, type Unidad } from "@/modulos/casco/comparar";
import { armarTablaUbicacion, estadoDe, partirUbicacion, enUnidad, totalEnUnidad, ORDEN_SITIO, type Factores, type RenglonConteo, type Sitio } from "@/modulos/casco/comparar-ubicacion";
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
const sinTildeF = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
  /* FILTROS MÚLTIPLES (como los de La base): SKU, ubicación (BODEGA 38 · FABRICA · EXPORTACION · BTS), módulo y número.
     Vacío = todos. Se combinan entre sí y valen para la tabla y para la foto. */
  const [fSku, setFSku] = useState<ReadonlySet<string>>(new Set());
  const [fSitio, setFSitio] = useState<ReadonlySet<string>>(new Set());
  const [fModulo, setFModulo] = useState<ReadonlySet<string>>(new Set());
  const [fNumero, setFNumero] = useState<ReadonlySet<string>>(new Set());
  const cumple = useCallback((r: RenglonConteo, omitir?: CampoFiltro) => {
    if (omitir !== "sku" && fSku.size && !fSku.has(r.codigo)) return false;
    const u = partirUbicacion(r.ubicacion);
    if (omitir !== "sitio" && fSitio.size && !fSitio.has(u.sitio)) return false;
    if (omitir !== "modulo" && fModulo.size && !fModulo.has(u.modulo)) return false;
    if (omitir !== "numero" && fNumero.size && !fNumero.has(u.numero || "—")) return false;
    return true;
  }, [fSku, fSitio, fModulo, fNumero]);
  const hayFiltro = fSku.size + fSitio.size + fModulo.size + fNumero.size > 0;
  const pasa = useMemo(() => (hayFiltro ? (r: RenglonConteo) => cumple(r) : null), [hayFiltro, cumple]);
  const quitarFiltros = () => { setFSku(new Set()); setFSitio(new Set()); setFModulo(new Set()); setFNumero(new Set()) };
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

  const rA0 = useMemo(() => (fA ? datos[fA] ?? [] : []), [datos, fA]);
  const rB0 = useMemo(() => (fB ? datos[fB] ?? [] : []), [datos, fB]);
  const rA = useMemo(() => (pasa ? rA0.filter(pasa) : rA0), [rA0, pasa]);
  const rB = useMemo(() => (pasa ? rB0.filter(pasa) : rB0), [rB0, pasa]);
  const listo = (!fA || !!datos[fA]) && (!fB || !!datos[fB]);
  const todosEstados = useMemo(() => armarTablaUbicacion(rA0, rB0, "", false).estados, [rA0, rB0]);
  const est = estado ?? (todosEstados.includes("LAVADO") ? "LAVADO" : "");
  /* Lo que se puede marcar en cada filtro: lo que hay en los dos conteos con el estado escogido y los OTROS filtros puestos
     (así la lista siempre muestra opciones que existen), con cuántos renglones tiene cada uno. */
  const opcionesDe = useCallback((campo: CampoFiltro): Opcion[] => {
    const m = new Map<string, Opcion>();
    for (const r of [...rA0, ...rB0]) {
      if (est && estadoDe(r.estado_envase) !== est) continue;
      if (!cumple(r, campo)) continue;
      const u = partirUbicacion(r.ubicacion);
      const clave = campo === "sku" ? r.codigo : campo === "sitio" ? u.sitio : campo === "modulo" ? u.modulo : (u.numero || "—");
      const x = m.get(clave) ?? { clave, detalle: campo === "sku" ? r.material ?? "" : "", n: 0 };
      x.n++;
      if (!x.detalle && campo === "sku" && r.material) x.detalle = r.material;
      m.set(clave, x);
    }
    const orden = (a: Opcion, b: Opcion) => campo === "sitio" ? ORDEN_SITIO.indexOf(a.clave as Sitio) - ORDEN_SITIO.indexOf(b.clave as Sitio) : a.clave.localeCompare(b.clave, "es", { numeric: true });
    return [...m.values()].sort(orden);
  }, [rA0, rB0, est, cumple]);
  const filtros = useMemo(() => ({
    sku: { elegidos: fSku, cambiar: setFSku, opciones: opcionesDe("sku") },
    sitio: { elegidos: fSitio, cambiar: setFSitio, opciones: opcionesDe("sitio") },
    modulo: { elegidos: fModulo, cambiar: setFModulo, opciones: opcionesDe("modulo") },
    numero: { elegidos: fNumero, cambiar: setFNumero, opciones: opcionesDe("numero") },
  }), [fSku, fSitio, fModulo, fNumero, opcionesDe]);
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
    const fa = pasa ? a.filter(pasa) : a, fb = pasa ? b.filter(pasa) : b;
    return {
      tabla: armarTablaUbicacion(fa, fb, e, soloCambios), fA, fB, estado: e, soloCambios, unidades, factores,
      chips: [`Unidad${unidades.length > 1 ? "es" : ""}: ${unidades.map((u) => TXT_NOMBRE[u]).join(" · ")}`, e || "Todos los estados", ...(soloCambios ? ["Solo cambios"] : []),
        ...(fSitio.size ? [`Ubicación: ${[...fSitio].join(", ")}`] : []), ...(fModulo.size ? [`Módulo: ${[...fModulo].sort().join(", ")}`] : []),
        ...(fNumero.size ? [`Número: ${[...fNumero].sort((a, b) => a.localeCompare(b, "es", { numeric: true })).join(", ")}`] : []),
        ...(fSku.size ? [`SKU: ${[...fSku].sort().join(", ")}`] : [])],
    };
  }, [fA, fB, leer, unidades, factores, estado, soloCambios, fSku, fSitio, fModulo, fNumero, pasa]);

  return { fA, fB, cargando, error, listo, todosEstados, est, t, soloCambios, setEstado, setSoloCambios, cargar, hayConteos: conteos.length > 0, unidades, factores, sinFactor, filtros, hayFiltro, quitarFiltros };
}
export type TablaUbDatos = ReturnType<typeof useTablaUbicacion>;

type CampoFiltro = "sku" | "sitio" | "modulo" | "numero";
type Opcion = { clave: string; detalle: string; n: number };

/**
 * SELECTOR DE SELECCIÓN MÚLTIPLE (el mismo estilo del filtro de La base): un botón abre la lista de valores con
 * cuántos renglones tiene cada uno; se escribe para buscar (varios códigos pegados juntos también valen), se marca
 * uno por uno o «todo lo buscado», y la tabla se filtra al instante. Sirve para SKU, ubicación, módulo y número.
 */
function SelectorMulti({ titulo, todos, unidad, ancho = false, opciones, elegidos, cambiar }: {
  titulo: string; todos: string; unidad: string; ancho?: boolean;
  opciones: Opcion[]; elegidos: ReadonlySet<string>; cambiar: (s: ReadonlySet<string>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) };
    document.addEventListener("mousedown", fuera); document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla) };
  }, [abierto]);

  const vistos = useMemo(() => {
    const ts = sinTildeF(q).split(/[\s,;]+/).filter(Boolean);
    if (!ts.length) return opciones;
    const soloCodigos = ts.every((x) => /^\d+$/.test(x));
    return opciones.filter((o) => soloCodigos ? ts.some((x) => o.clave.includes(x)) : ts.every((x) => sinTildeF(o.clave).includes(x) || sinTildeF(o.detalle).includes(x)));
  }, [opciones, q]);
  const todosVistos = vistos.length > 0 && vistos.every((o) => elegidos.has(o.clave));
  const alterna = (c: string) => { const n = new Set(elegidos); if (n.has(c)) n.delete(c); else n.add(c); cambiar(n) };
  const alternaVistos = () => { const n = new Set(elegidos); if (todosVistos) vistos.forEach((o) => n.delete(o.clave)); else vistos.forEach((o) => n.add(o.clave)); cambiar(n) };
  const nombreDe = (c: string) => opciones.find((o) => o.clave === c)?.detalle ?? "";
  const lista = [...elegidos].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

  return (
    <div className="cvx-sku" ref={caja}>
      <button type="button" className="cvx-sku-b" data-activo={elegidos.size ? "1" : undefined} aria-expanded={abierto} aria-haspopup="dialog" onClick={() => setAbierto(!abierto)}>
        {elegidos.size === 0 ? todos : elegidos.size === 1 ? `${titulo}: ${lista[0]}` : `${titulo}: ${elegidos.size} ${unidad}`}
        <span aria-hidden="true" className="cvx-sku-f">▾</span>
      </button>
      {abierto && (
        <div className="cvx-sku-pop" role="dialog" aria-label={`Escoger ${titulo}`}>
          <div className="cvx-sku-t">Filtrar · <b>{titulo}</b><span>{elegidos.size ? `${elegidos.size} marcados` : "sin filtro"}</span></div>
          {elegidos.size > 0 && (
            <div className="cvx-sku-chips">
              {lista.slice(0, 6).map((c) => (
                <button key={c} type="button" className="cvx-chip" title={nombreDe(c) || c} onClick={() => alterna(c)} aria-label={`Quitar ${c}`}>{c}<i aria-hidden="true">×</i></button>
              ))}
              {lista.length > 6 && <span className="cvx-chip mas">+{lista.length - 6}</span>}
            </div>
          )}
          <input className="cvx-sku-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={ancho ? "Código o nombre… (puedes pegar varios códigos)" : "Buscar…"}
                 aria-label={`Buscar ${titulo}`} onKeyDown={(e) => { if (e.key === "Enter") setAbierto(false) }} />
          <div className="cvx-sku-l">
            <label className="cvx-sku-todo">
              <input type="checkbox" checked={todosVistos} onChange={alternaVistos} />
              <span>(Seleccionar todo{q.trim() ? " lo buscado" : ""})</span>
            </label>
            {vistos.map((o) => (
              <label key={o.clave} data-on={elegidos.has(o.clave) ? "1" : undefined} className={ancho ? undefined : "corto"}>
                <input type="checkbox" checked={elegidos.has(o.clave)} onChange={() => alterna(o.clave)} />
                <b>{o.clave}</b>
                {ancho && <span>{o.detalle}</span>}
                <i>{o.n}</i>
              </label>
            ))}
            {vistos.length === 0 && <p className="cvx-sku-vacio">{opciones.length === 0 ? "No hay nada con los filtros puestos." : `Nada con «${q}».`}</p>}
          </div>
          <div className="cvx-sku-p">
            <button type="button" className="cvx-limpia" onClick={() => cambiar(new Set())} disabled={elegidos.size === 0}>Quitar filtro</button>
            <button type="button" className="cvx-sku-ok" onClick={() => setAbierto(false)}>Listo</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TablaUbicacion({ tab }: { tab: TablaUbDatos }) {
  const { fA, fB, cargando, error, listo, todosEstados, est, t, soloCambios, setEstado, setSoloCambios, hayConteos, unidades, factores, sinFactor, filtros, hayFiltro, quitarFiltros } = tab;
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
        <div className="cvx-barra">
          <label className="cvx-campo" data-activo={est ? "1" : undefined}>
            <span className="cvx-sr">Estado</span>
            <select value={est} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {todosEstados.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <SelectorMulti titulo="Ubicación" todos="Todas las ubicaciones" unidad="ubicaciones" {...filtros.sitio} />
          <SelectorMulti titulo="Módulo" todos="Todos los módulos" unidad="módulos" {...filtros.modulo} />
          <SelectorMulti titulo="Número" todos="Todos los números" unidad="números" {...filtros.numero} />
          <SelectorMulti titulo="SKU" todos="Todos los SKU" unidad="SKU" ancho {...filtros.sku} />
          {hayFiltro && <button type="button" className="cvx-limpia" onClick={quitarFiltros}>Quitar todos los filtros</button>}
          <button type="button" className="cvx-solo" aria-pressed={soloCambios} onClick={() => setSoloCambios(!soloCambios)}>Solo cambios</button>
        </div>
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
