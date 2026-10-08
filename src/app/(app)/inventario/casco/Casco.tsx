"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BuscarEnLista } from "@/components/BuscarEnLista";
import { esCuenta, suma } from "@/modulos/casco/suma";
import type { MaterialCasco, SitioCasco } from "@/modulos/casco/datos";

/**
 * CASCO DE VIDRIO — LAS CUATRO TABLAS DEL EXCEL, EN UNA PANTALLA.
 *
 * Se escoge el SITIO en el desplegable (Bodega 38, Fábrica, Carnaval,
 * Carnaval Palmar) y aparece su tabla: COD, descripción del maestro,
 * inventario de casco, la baja (si ese sitio la lleva) y el HL.
 *
 * LAS CANTIDADES SE TECLEAN COMO EN EL EXCEL: «24+15-36». El campo
 * muestra el resultado al lado. Lo que se guarda es el saldo y también
 * la cuenta, para poder seguir sumando encima.
 *
 * AL ABRIR UN DÍA SIN REGISTROS, la tabla arranca con el saldo del
 * último día registrado de ese sitio —en el Excel el saldo de ayer es el
 * punto de partida de hoy—. Se suma o se resta encima y se guarda.
 *
 * EL HL QUE SE VE AQUÍ ES UNA AYUDA: el que se guarda lo calcula la base
 * con el maestro, para que la pantalla no pueda inventar un HL.
 */

type Fila = { sku: string; inv: string; baja: string };
type RegistroDia = {
  ubicacion: string; sku: string; inventario: number | null; inv_expr: string | null;
  baja: number | null; baja_expr: string | null; hl: number; fecha: string;
};

const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const largo = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const aTexto = (n: number | null) => (n == null ? "" : String(Number(n)));

export function Casco({ sitios, materiales, hoy, puedeEditar }: {
  sitios: SitioCasco[]; materiales: MaterialCasco[]; hoy: string; puedeEditar: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [fecha, setFecha] = useState(hoy);
  const [sitio, setSitio] = useState(sitios[0]?.clave ?? "");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [arranque, setArranque] = useState<string | null>(null);   // día del que se heredó el saldo
  const [guardadoDe, setGuardadoDe] = useState(false);             // ¿ya hay registro de este día y sitio?
  const [aviso, setAviso] = useState<{ tipo: "ok" | "mal"; texto: string } | null>(null);
  const [delDia, setDelDia] = useState<Record<string, number>>({});

  const dato = useMemo(() => Object.fromEntries(materiales.map((m) => [m.sku, m])), [materiales]);
  const s = sitios.find((x) => x.clave === sitio);
  const lleva_baja = !!s?.baja_rotulo;

  /* ---------- LO DEL DÍA: el HL de cada sitio, para las tarjetas de arriba ---------- */
  const totalesDelDia = useCallback(async (f: string) => {
    const { data } = await supabase.from("casco_registros").select("ubicacion, hl").eq("fecha", f);
    const t: Record<string, number> = {};
    for (const r of data ?? []) t[r.ubicacion as string] = (t[r.ubicacion as string] ?? 0) + Number(r.hl || 0);
    setDelDia(t);
  }, [supabase]);

  /* ---------- LA TABLA DE ESTE DÍA Y SITIO ---------- */
  const cargar = useCallback(async (f: string, u: string) => {
    setCargando(true); setAviso(null);
    const cols = "ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, fecha";
    const { data: hoyRows, error } = await supabase.from("v_casco").select(cols)
      .eq("fecha", f).eq("ubicacion", u).order("sku");
    if (error) { setAviso({ tipo: "mal", texto: "No se pudo leer: " + error.message }); setCargando(false); return }

    const aFilas = (rs: RegistroDia[], heredado: boolean): Fila[] => rs.map((r) => ({
      sku: r.sku,
      /* HEREDADO = solo el saldo; la cuenta larga de ayer no se arrastra. */
      inv: heredado || !r.inv_expr ? aTexto(r.inventario) : r.inv_expr,
      baja: heredado || !r.baja_expr ? (Number(r.baja) ? aTexto(r.baja) : "") : r.baja_expr,
    }));

    if (hoyRows && hoyRows.length) {
      setFilas(aFilas(hoyRows as RegistroDia[], false)); setArranque(null); setGuardadoDe(true);
    } else {
      /* SIN REGISTRO ESE DÍA: se arranca con el último saldo del sitio. */
      const { data: ult } = await supabase.from("v_casco").select("fecha")
        .eq("ubicacion", u).lt("fecha", f).order("fecha", { ascending: false }).limit(1);
      const dia = (ult?.[0]?.fecha as string | undefined) ?? null;
      if (dia) {
        const { data: prev } = await supabase.from("v_casco").select(cols).eq("ubicacion", u).eq("fecha", dia).order("sku");
        setFilas(aFilas((prev ?? []) as RegistroDia[], true)); setArranque(dia);
      } else { setFilas([]); setArranque(null) }
      setGuardadoDe(false);
    }
    setSucio(false); setCargando(false);
  }, [supabase]);

  useEffect(() => { void cargar(fecha, sitio) }, [fecha, sitio, cargar]);
  useEffect(() => { void totalesDelDia(fecha) }, [fecha, totalesDelDia]);

  const confirmarSalida = () => !sucio || window.confirm("Tienes cambios sin guardar en esta tabla. ¿Los descartas?");

  /* ---------- LAS CUENTAS ---------- */
  const calc = filas.map((f) => {
    const inv = suma(f.inv), baja = lleva_baja ? suma(f.baja) : 0;
    const hlE = dato[f.sku]?.hl_estiba ?? null;
    const total = inv != null && baja != null ? inv + baja : null;
    return { inv, baja, hlE, hl: total != null && hlE != null ? total * hlE : null,
             malInv: inv == null || inv < 0, malBaja: baja == null || baja < 0, sinFactor: hlE == null };
  });
  const totInv = calc.reduce((t, c) => t + (c.inv ?? 0), 0);
  const totBaja = calc.reduce((t, c) => t + (c.baja ?? 0), 0);
  const totHl = calc.reduce((t, c) => t + (c.hl ?? 0), 0);
  const hayError = calc.some((c) => c.malInv || c.malBaja || c.sinFactor);

  const cambiar = (i: number, k: "inv" | "baja", v: string) => {
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f))); setSucio(true); setAviso(null);
  };
  const agregar = (sku: string) => {
    if (!sku || filas.some((f) => f.sku === sku)) return;
    setFilas((fs) => [...fs, { sku, inv: "", baja: "" }]); setSucio(true); setAviso(null);
  };
  const quitar = (i: number) => { setFilas((fs) => fs.filter((_, j) => j !== i)); setSucio(true) };

  const guardar = async () => {
    if (hayError || guardando) return;
    setGuardando(true); setAviso(null);
    const payload = filas.map((f, i) => ({
      sku: f.sku, inventario: calc[i].inv ?? 0, inv_expr: esCuenta(f.inv) ? f.inv.replace(/^\s*=/, "").trim() : "",
      baja: lleva_baja ? calc[i].baja ?? 0 : 0, baja_expr: lleva_baja && esCuenta(f.baja) ? f.baja.replace(/^\s*=/, "").trim() : "",
    }));
    const { data, error } = await supabase.rpc("casco_guardar", { p_fecha: fecha, p_ubicacion: sitio, p_filas: payload });
    setGuardando(false);
    if (error) { setAviso({ tipo: "mal", texto: error.message }); return }
    setSucio(false); setGuardadoDe(true); setArranque(null);
    setAviso({ tipo: "ok", texto: `Guardado: ${data ?? payload.length} material${payload.length === 1 ? "" : "es"} en ${s?.nombre}, ${largo(fecha)}.` });
    void totalesDelDia(fecha);
  };

  const opciones = materiales
    .filter((m) => !filas.some((f) => f.sku === m.sku))
    .map((m) => ({ clave: m.sku, nombre: m.nombre, codigo: m.sku, corta: m.corto }));

  const totalDia = Object.values(delDia).reduce((t, v) => t + v, 0);

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · REGISTRAR</p>
          <h1>Casco de vidrio</h1>
          <p className="sub">
            Cuántas estibas de envase vacío hay en cada sitio. Tecleas las cuentas como en el
            Excel (<b className="cas-sub-cuenta">24+15-36</b>) y el HL sale solo, con el factor del maestro.
          </p>
        </div>
      </section>

      {/* LOS CUATRO SITIOS DEL DÍA: tocar uno es lo mismo que escogerlo en el desplegable. */}
      <div className="cas-sitios">
        {sitios.map((x) => (
          <button key={x.clave} type="button" className={"cas-sitio" + (x.clave === sitio ? " on" : "")}
                  onClick={() => { if (x.clave !== sitio && confirmarSalida()) setSitio(x.clave) }}>
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
          <label className="cas-c">
            <span>Ubicación</span>
            <select value={sitio} onChange={(e) => { if (confirmarSalida()) setSitio(e.target.value) }}>
              {sitios.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
            </select>
          </label>
          <div className="cas-c cas-ancho">
            <span>Agregar material</span>
            <BuscarEnLista id="cas-mat" valor="" opciones={opciones}
              rotulo="Escribe el código o el nombre del material"
              cambiar={agregar} vacio="No hay más materiales para agregar." />
          </div>
        </div>

        {arranque && (
          <p className="cas-nota">
            Esta tabla arrancó con el <b>saldo del {largo(arranque)}</b>, el último registro de {s?.nombre}.
            Suma o resta encima y guarda para registrar {largo(fecha)}.
          </p>
        )}
        {!arranque && !guardadoDe && !cargando && filas.length === 0 && (
          <p className="cas-nota">Todavía no hay nada de {s?.nombre}. Agrega los materiales arriba.</p>
        )}
      </div>

      <div className="cas-tabla-caja">
        <table className="cas-tabla">
          <thead>
            <tr>
              <th>COD</th>
              <th>Descripción casco vidrio · {s?.nombre}</th>
              <th className="n">Inventario casco de vidrio</th>
              {lleva_baja && <th className="n">{s?.baja_rotulo}</th>}
              <th className="n">HL</th>
              <th aria-label="Quitar" />
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={lleva_baja ? 6 : 5} className="cas-vacio">Cargando…</td></tr>}
            {!cargando && filas.length === 0 && (
              <tr><td colSpan={lleva_baja ? 6 : 5} className="cas-vacio">Sin materiales.</td></tr>
            )}
            {!cargando && filas.map((f, i) => {
              const c = calc[i];
              return (
                <tr key={f.sku}>
                  <td className="cod">{f.sku}</td>
                  <td>{dato[f.sku]?.nombre ?? f.sku}
                    {c.sinFactor && <em className="cas-mal">sin botellas por estiba o HL en el maestro</em>}
                  </td>
                  <td className="n">
                    <span className="cas-cuenta">
                      <input value={f.inv} disabled={!puedeEditar} inputMode="text" spellCheck={false}
                             aria-label={`Inventario de ${f.sku}`} className={c.malInv ? "mal" : ""}
                             onChange={(e) => cambiar(i, "inv", e.target.value)} />
                      <b>{c.inv == null ? "?" : "= " + nf0.format(c.inv)}</b>
                    </span>
                  </td>
                  {lleva_baja && (
                    <td className="n">
                      <span className="cas-cuenta">
                        <input value={f.baja} disabled={!puedeEditar} inputMode="text" spellCheck={false}
                               aria-label={`${s?.baja_rotulo} de ${f.sku}`} className={c.malBaja ? "mal" : ""}
                               onChange={(e) => cambiar(i, "baja", e.target.value)} />
                        <b>{c.baja == null ? "?" : "= " + nf0.format(c.baja)}</b>
                      </span>
                    </td>
                  )}
                  <td className="n hl">{c.hl == null ? "—" : nf2.format(c.hl)}</td>
                  <td className="x">
                    {puedeEditar && <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${f.sku}`}>×</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!cargando && filas.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>TOTAL · {s?.nombre}</td>
                <td className="n">{nf0.format(totInv)} estibas</td>
                {lleva_baja && <td className="n">{nf0.format(totBaja)} estibas</td>}
                <td className="n hl">{nf2.format(totHl)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="cas-pie">
        {aviso && <p className={"cas-aviso " + aviso.tipo} role="status">{aviso.texto}</p>}
        {puedeEditar ? (
          <button type="button" className="btn grande" disabled={!sucio || hayError || guardando || cargando} onClick={guardar}>
            {guardando ? "Guardando…" : guardadoDe && !sucio ? "Guardado" : `Guardar ${s?.nombre ?? ""} · ${largo(fecha)}`}
          </button>
        ) : (
          <p className="cas-nota">Tu rol puede ver el casco de vidrio pero no registrarlo.</p>
        )}
        {hayError && sucio && (
          <p className="cas-aviso mal">Revisa los campos en rojo: una cuenta no se entiende, quedó negativa o falta el factor del maestro.</p>
        )}
      </div>
    </>
  );
}
