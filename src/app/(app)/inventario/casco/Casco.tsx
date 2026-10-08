"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BuscarEnLista } from "@/components/BuscarEnLista";
import { esCuenta, suma } from "@/modulos/casco/suma";
import type { MaterialCasco, SitioCasco } from "@/modulos/casco/datos";

/**
 * CASCO DE VIDRIO — LAS CUATRO TABLAS DEL EXCEL, UNA DEBAJO DE OTRA.
 *
 * Es la hoja CASCO: Bodega 38, Fábrica, Carnaval y Carnaval Palmar, cada una con COD, descripción
 * del maestro, inventario de casco, la baja (si ese sitio la lleva), el HL, la columna
 * UBICACIONES (P19, P16/20…) y CALIDAD.
 *
 * LAS CANTIDADES SE TECLEAN COMO EN EL EXCEL: «24+15-36». El campo muestra el resultado al lado y
 * se guarda el saldo Y la cuenta, para poder seguir sumando encima.
 *
 * UN DÍA SIN REGISTROS ARRANCA CON EL ÚLTIMO SALDO de cada sitio (en el Excel el saldo de ayer es
 * el punto de partida de hoy): se suma o se resta encima y se guarda.
 *
 * EL HL QUE SE VE AQUÍ ES UNA AYUDA: el que se guarda lo calcula la base con el maestro.
 */

type Fila = { sku: string; inv: string; baja: string; puesto: string; calidad: string };
type Bloque = {
  filas: Fila[]; sucio: boolean; cargando: boolean;
  arranque: string | null;          // día del que se heredó el saldo
  guardado: boolean;                // ya hay registro de este día en este sitio
  guardando: boolean;
  aviso: { tipo: "ok" | "mal"; texto: string } | null;
};
type Reg = {
  ubicacion: string; sku: string; inventario: number | null; inv_expr: string | null;
  baja: number | null; baja_expr: string | null; hl: number; fecha: string;
  puesto: string | null; calidad: string | null;
};

const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const largo = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const aTexto = (n: number | null) => (n == null ? "" : String(Number(n)));
const VACIO: Bloque = { filas: [], sucio: false, cargando: true, arranque: null, guardado: false, guardando: false, aviso: null };
const COLS = "ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, fecha, puesto, calidad";

export function Casco({ sitios, materiales, hoy, puestos, puedeEditar }: {
  sitios: SitioCasco[]; materiales: MaterialCasco[]; hoy: string; puestos: string[]; puedeEditar: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [fecha, setFecha] = useState(hoy);
  const [bloques, setBloques] = useState<Record<string, Bloque>>({});
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [delDia, setDelDia] = useState<Record<string, number>>({});
  const dato = useMemo(() => Object.fromEntries(materiales.map((m) => [m.sku, m])), [materiales]);

  const poner = useCallback((clave: string, cambio: Partial<Bloque> | ((b: Bloque) => Partial<Bloque>)) =>
    setBloques((bs) => {
      const b = bs[clave] ?? VACIO;
      return { ...bs, [clave]: { ...b, ...(typeof cambio === "function" ? cambio(b) : cambio) } };
    }), []);

  const totalesDelDia = useCallback(async (f: string) => {
    const { data } = await supabase.from("casco_registros").select("ubicacion, hl").eq("fecha", f);
    const t: Record<string, number> = {};
    for (const r of data ?? []) t[r.ubicacion as string] = (t[r.ubicacion as string] ?? 0) + Number(r.hl || 0);
    setDelDia(t);
  }, [supabase]);

  /* ---------- LAS CUATRO TABLAS DE ESTE DÍA ---------- */
  const cargar = useCallback(async (f: string) => {
    setErrorLectura(null);
    setBloques(Object.fromEntries(sitios.map((s) => [s.clave, { ...VACIO }])));
    const { data: delD, error } = await supabase.from("v_casco").select(COLS).eq("fecha", f).order("sku");
    if (error) {
      setErrorLectura(/puesto|calidad/i.test(error.message)
        ? "Falta correr 2026-10-casco-puesto-calidad.sql en Supabase (las columnas Ubicaciones y Calidad)."
        : "No se pudo leer: " + error.message);
      setBloques(Object.fromEntries(sitios.map((s) => [s.clave, { ...VACIO, cargando: false }])));
      return;
    }
    const aFilas = (rs: Reg[], heredado: boolean): Fila[] => rs.map((r) => ({
      sku: r.sku,
      /* HEREDADO = solo el saldo: la cuenta larga de ayer no se arrastra. */
      inv: heredado || !r.inv_expr ? aTexto(r.inventario) : r.inv_expr,
      baja: heredado || !r.baja_expr ? (Number(r.baja) ? aTexto(r.baja) : "") : r.baja_expr,
      puesto: r.puesto ?? "", calidad: r.calidad ?? "",
    }));
    await Promise.all(sitios.map(async (s) => {
      const hoyRows = ((delD ?? []) as Reg[]).filter((r) => r.ubicacion === s.clave);
      if (hoyRows.length) {
        poner(s.clave, { filas: aFilas(hoyRows, false), arranque: null, guardado: true, cargando: false, sucio: false });
        return;
      }
      /* SIN REGISTRO ESE DÍA EN ESTE SITIO: se arranca con su último saldo. */
      const { data: ult } = await supabase.from("v_casco").select("fecha")
        .eq("ubicacion", s.clave).lt("fecha", f).order("fecha", { ascending: false }).limit(1);
      const dia = (ult?.[0]?.fecha as string | undefined) ?? null;
      if (dia) {
        const { data: prev } = await supabase.from("v_casco").select(COLS).eq("ubicacion", s.clave).eq("fecha", dia).order("sku");
        poner(s.clave, { filas: aFilas((prev ?? []) as Reg[], true), arranque: dia, guardado: false, cargando: false, sucio: false });
      } else poner(s.clave, { filas: [], arranque: null, guardado: false, cargando: false, sucio: false });
    }));
  }, [supabase, sitios, poner]);

  useEffect(() => { void cargar(fecha); void totalesDelDia(fecha) }, [fecha, cargar, totalesDelDia]);

  const hayCambios = Object.values(bloques).some((b) => b.sucio);
  const confirmarSalida = () => !hayCambios || window.confirm("Tienes cambios sin guardar. ¿Los descartas?");

  /* ---------- LAS CUENTAS DE UN SITIO ---------- */
  const calcular = (s: SitioCasco, b: Bloque) => b.filas.map((f) => {
    const inv = suma(f.inv), baja = s.baja_rotulo ? suma(f.baja) : 0;
    const hlE = dato[f.sku]?.hl_estiba ?? null;
    const total = inv != null && baja != null ? inv + baja : null;
    return { inv, baja, hl: total != null && hlE != null ? total * hlE : null,
             malInv: inv == null || inv < 0, malBaja: baja == null || baja < 0, sinFactor: hlE == null };
  });
  const conError = (s: SitioCasco, b: Bloque) => calcular(s, b).some((c) => c.malInv || c.malBaja || c.sinFactor);

  const guardarSitio = async (s: SitioCasco): Promise<boolean> => {
    const b = bloques[s.clave]; if (!b || b.guardando || conError(s, b)) return false;
    poner(s.clave, { guardando: true, aviso: null });
    const c = calcular(s, b);
    const payload = b.filas.map((f, i) => ({
      sku: f.sku, inventario: c[i].inv ?? 0, inv_expr: esCuenta(f.inv) ? f.inv.replace(/^\s*=/, "").trim() : "",
      baja: s.baja_rotulo ? c[i].baja ?? 0 : 0, baja_expr: s.baja_rotulo && esCuenta(f.baja) ? f.baja.replace(/^\s*=/, "").trim() : "",
      puesto: f.puesto.trim(), calidad: f.calidad.trim(),
    }));
    const { data, error } = await supabase.rpc("casco_guardar", { p_fecha: fecha, p_ubicacion: s.clave, p_filas: payload });
    if (error) { poner(s.clave, { guardando: false, aviso: { tipo: "mal", texto: error.message } }); return false }
    poner(s.clave, { guardando: false, sucio: false, guardado: true, arranque: null,
      aviso: { tipo: "ok", texto: `Guardado: ${data ?? payload.length} material${payload.length === 1 ? "" : "es"} en ${s.nombre}.` } });
    return true;
  };
  const guardarTodo = async () => {
    for (const s of sitios) if (bloques[s.clave]?.sucio) await guardarSitio(s);
    void totalesDelDia(fecha);
  };

  const cambiar = (s: string, i: number, k: keyof Fila, v: string) =>
    poner(s, (b) => ({ filas: b.filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)), sucio: true, aviso: null }));
  const agregar = (s: string, sku: string) =>
    poner(s, (b) => b.filas.some((f) => f.sku === sku) || !sku ? {} :
      { filas: [...b.filas, { sku, inv: "", baja: "", puesto: "", calidad: "" }], sucio: true, aviso: null });
  const quitar = (s: string, i: number) => poner(s, (b) => ({ filas: b.filas.filter((_, j) => j !== i), sucio: true }));

  const totalDia = Object.values(delDia).reduce((t, v) => t + v, 0);
  const nSucios = Object.values(bloques).filter((b) => b.sucio).length;
  const hayError = sitios.some((s) => bloques[s.clave]?.sucio && conError(s, bloques[s.clave]));
  const irA = (clave: string) => document.getElementById("cas-b-" + clave)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · REGISTRAR</p>
          <h1>Casco de vidrio</h1>
          <p className="sub">
            Las cuatro tablas del Excel, juntas. Tecleas las cuentas como allá (<b className="cas-sub-cuenta">24+15-36</b>),
            escoges la ubicación de cada material y el HL sale solo, con el factor del maestro.
          </p>
          <p className="sub"><Link href="/inventario/casco/tablero">Ver el tablero de control →</Link></p>
        </div>
      </section>

      {/* LOS SITIOS DEL DÍA: tocar uno baja a su tabla. */}
      <div className="cas-sitios">
        {sitios.map((x) => (
          <button key={x.clave} type="button" className="cas-sitio" onClick={() => irA(x.clave)}>
            <span className="cas-rot">{x.nombre}</span>
            <b>{delDia[x.clave] != null ? nf2.format(delDia[x.clave]) : "—"}</b>
            <i>HL ese día</i>
          </button>
        ))}
        <div className="cas-sitio cas-total">
          <span className="cas-rot">Total del día</span>
          <b>{nf2.format(totalDia)}</b>
          <i>HL en {Object.keys(delDia).length} sitio{Object.keys(delDia).length === 1 ? "" : "s"}</i>
        </div>
      </div>

      <div className="cas-form">
        <div className="cas-campos">
          <label className="cas-c">
            <span>Fecha</span>
            <input type="date" value={fecha} max={hoy}
                   onChange={(e) => { if (e.target.value && confirmarSalida()) setFecha(e.target.value) }} />
          </label>
          <p className="cas-nota">
            Estás viendo <b>{largo(fecha)}</b>. Cada tabla guarda por separado; arriba y abajo hay un botón para guardar todo.
          </p>
        </div>
        {errorLectura && <p className="cas-aviso mal">{errorLectura}</p>}
      </div>

      {/* LAS SUGERENCIAS DE LA COLUMNA UBICACIONES: se puede escoger o escribir. */}
      <datalist id="cas-puestos">{puestos.map((p) => <option key={p} value={p} />)}</datalist>

      {sitios.map((s) => {
        const b = bloques[s.clave] ?? VACIO;
        const c = calcular(s, b);
        const totInv = c.reduce((t, x) => t + (x.inv ?? 0), 0);
        const totBaja = c.reduce((t, x) => t + (x.baja ?? 0), 0);
        const totHl = c.reduce((t, x) => t + (x.hl ?? 0), 0);
        const err = conError(s, b);
        const cols = 5 + (s.baja_rotulo ? 1 : 0) + 2;
        const opciones = materiales.filter((m) => !b.filas.some((f) => f.sku === m.sku))
          .map((m) => ({ clave: m.sku, nombre: m.nombre, codigo: m.sku, corta: m.corto }));
        return (
          <section key={s.clave} id={"cas-b-" + s.clave} className="cas-bloque">
            <header className="cas-bloque-cab">
              <div>
                <h2>{s.nombre}</h2>
                <p className="cas-nota">
                  {b.cargando ? "Cargando…" : b.sucio ? "Cambios sin guardar" : b.guardado ? "Guardado" : b.arranque ? `Arrancó con el saldo del ${largo(b.arranque)}` : "Sin registros"}
                </p>
              </div>
              <div className="cas-bloque-hl"><b>{nf2.format(totHl)}</b><i>HL · {nf0.format(totInv + totBaja)} estibas</i></div>
            </header>

            {b.arranque && !b.sucio && (
              <p className="cas-nota cas-herencia">
                Esta tabla arrancó con el <b>último saldo de {s.nombre}</b> ({largo(b.arranque)}). Suma o resta encima y guarda para registrar {largo(fecha)}.
              </p>
            )}

            {puedeEditar && (
              <div className="cas-c cas-agregar">
                <span>Agregar material a {s.nombre}</span>
                <BuscarEnLista id={"cas-mat-" + s.clave} valor="" opciones={opciones}
                  rotulo="Escribe el código o el nombre del material" cambiar={(sku) => agregar(s.clave, sku)}
                  vacio="No hay más materiales para agregar." />
              </div>
            )}

            <div className="cas-tabla-caja">
              <table className="cas-tabla">
                <thead>
                  <tr>
                    <th>COD</th>
                    <th>Descripción casco vidrio · {s.nombre}</th>
                    <th className="n">Inventario casco de vidrio</th>
                    {s.baja_rotulo && <th className="n">{s.baja_rotulo}</th>}
                    <th className="n">HL</th>
                    <th>Ubicaciones</th>
                    <th>Calidad</th>
                    <th aria-label="Quitar" />
                  </tr>
                </thead>
                <tbody>
                  {b.cargando && <tr><td colSpan={cols} className="cas-vacio">Cargando…</td></tr>}
                  {!b.cargando && b.filas.length === 0 && (
                    <tr><td colSpan={cols} className="cas-vacio">Sin materiales. Agrégalos arriba.</td></tr>
                  )}
                  {!b.cargando && b.filas.map((f, i) => {
                    const x = c[i];
                    return (
                      <tr key={f.sku}>
                        <td className="cod">{f.sku}</td>
                        <td>{dato[f.sku]?.nombre ?? f.sku}
                          {x.sinFactor && <em className="cas-mal">sin botellas por estiba o HL en el maestro</em>}
                        </td>
                        <td className="n">
                          <span className="cas-cuenta">
                            <input value={f.inv} disabled={!puedeEditar} inputMode="text" spellCheck={false}
                                   aria-label={`Inventario de ${f.sku} en ${s.nombre}`} className={x.malInv ? "mal" : ""}
                                   onChange={(e) => cambiar(s.clave, i, "inv", e.target.value)} />
                            <b>{x.inv == null ? "?" : "= " + nf0.format(x.inv)}</b>
                          </span>
                        </td>
                        {s.baja_rotulo && (
                          <td className="n">
                            <span className="cas-cuenta">
                              <input value={f.baja} disabled={!puedeEditar} inputMode="text" spellCheck={false}
                                     aria-label={`${s.baja_rotulo} de ${f.sku} en ${s.nombre}`} className={x.malBaja ? "mal" : ""}
                                     onChange={(e) => cambiar(s.clave, i, "baja", e.target.value)} />
                              <b>{x.baja == null ? "?" : "= " + nf0.format(x.baja)}</b>
                            </span>
                          </td>
                        )}
                        <td className="n hl">{x.hl == null ? "—" : nf2.format(x.hl)}</td>
                        <td>
                          <input className="cas-txt" list="cas-puestos" value={f.puesto} disabled={!puedeEditar}
                                 placeholder="Ej. P19" aria-label={`Ubicaciones de ${f.sku} en ${s.nombre}`}
                                 onChange={(e) => cambiar(s.clave, i, "puesto", e.target.value)} />
                        </td>
                        <td>
                          <input className="cas-txt cas-txt-ancho" value={f.calidad} disabled={!puedeEditar} maxLength={240}
                                 aria-label={`Calidad de ${f.sku} en ${s.nombre}`}
                                 onChange={(e) => cambiar(s.clave, i, "calidad", e.target.value)} />
                        </td>
                        <td className="x">
                          {puedeEditar && <button type="button" onClick={() => quitar(s.clave, i)} aria-label={`Quitar ${f.sku}`}>×</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {!b.cargando && b.filas.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2}>TOTAL · {s.nombre}</td>
                      <td className="n">{nf0.format(totInv)} estibas</td>
                      {s.baja_rotulo && <td className="n">{nf0.format(totBaja)} estibas</td>}
                      <td className="n hl">{nf2.format(totHl)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="cas-pie-bloque">
              {b.aviso && <p className={"cas-aviso " + b.aviso.tipo} role="status">{b.aviso.texto}</p>}
              {err && b.sucio && <p className="cas-aviso mal">Revisa los campos en rojo: una cuenta no se entiende, quedó negativa o falta el factor del maestro.</p>}
              {puedeEditar && (
                <button type="button" className="btn" disabled={!b.sucio || err || b.guardando || b.cargando} onClick={() => void guardarSitio(s).then(() => totalesDelDia(fecha))}>
                  {b.guardando ? "Guardando…" : `Guardar ${s.nombre}`}
                </button>
              )}
            </div>
          </section>
        );
      })}

      <div className="cas-pie">
        {puedeEditar ? (
          <button type="button" className="btn grande" disabled={nSucios === 0 || hayError} onClick={() => void guardarTodo()}>
            {nSucios === 0 ? "Todo guardado" : `Guardar todo (${nSucios} tabla${nSucios === 1 ? "" : "s"} con cambios) · ${largo(fecha)}`}
          </button>
        ) : (
          <p className="cas-nota">Tu rol puede ver el casco de vidrio pero no registrarlo.</p>
        )}
      </div>
    </>
  );
}
