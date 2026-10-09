"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BuscarEnLista } from "@/components/BuscarEnLista";
import { CampoCuenta } from "./CampoCuenta";
import { useConfirmar } from "@/components/Confirmar";
import { esCuenta, suma } from "@/modulos/casco/suma";
import type { MaterialCasco, SitioCasco } from "@/modulos/casco/datos";
import type { UbicacionesInventario } from "@/modulos/casco/ubicaciones-inventario";

/** Qué estado del inventario alimenta las ubicaciones de cada tabla (igual que ESTADO_POR_CENTRO). */
const ESTADO_UBIC: Record<string, string> = { AG18: "LAVADO", AG22: "BAJA y EXTRASUCIO" };

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
  recuperado?: string | null;       // hora en que se dejó el borrador que se recuperó
  de?: string;                      // el día al que pertenecen estas filas (para que el borrador no cambie de día)
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

/* EL BORRADOR: «si me salgo de Registrar para revisar, que no se borre nada». Lo que se teclea y no
   se ha guardado queda en ESTE equipo (por día y por tabla) y vuelve al regresar. Se borra al
   guardar o al tocar «Descartar». Si el navegador no deja guardar (modo privado), sigue igual. */
const llaveBorrador = (fecha: string, clave: string) => `cd38:casco:borrador:${fecha}:${clave}`;
type Borrador = { filas: Fila[]; en: string };
const leerBorrador = (fecha: string, clave: string): Borrador | null => {
  try { const t = localStorage.getItem(llaveBorrador(fecha, clave)); return t ? JSON.parse(t) as Borrador : null } catch { return null }
};
const guardarBorrador = (fecha: string, clave: string, filas: Fila[]) => {
  try { localStorage.setItem(llaveBorrador(fecha, clave), JSON.stringify({ filas, en: new Date().toISOString() })) } catch { /* sin espacio o modo privado */ }
};
const borrarBorrador = (fecha: string, clave: string) => { try { localStorage.removeItem(llaveBorrador(fecha, clave)) } catch { /* nada */ } };
const hora = (iso: string) => new Date(iso).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Casco({ sitios, materiales, hoy, inicio, puestos, puedeEditar, delInventario = null }: {
  sitios: SitioCasco[]; materiales: MaterialCasco[]; hoy: string; inicio?: string; puestos: string[]; puedeEditar: boolean;
  /** Las ubicaciones del último inventario, por centro y material (null si no hay o tu rol no lo ve). */
  delInventario?: UbicacionesInventario | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [fecha, setFecha] = useState(inicio ?? hoy);
  const [bloques, setBloques] = useState<Record<string, Bloque>>({});
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [delDia, setDelDia] = useState<Record<string, number>>({});
  /* LOS FILTROS: ver un material en las cuatro tablas a la vez, una sola bodega, o solo lo que tiene saldo.
     Solo esconden filas: lo que se guarda sigue siendo la tabla entera. */
  const [fMat, setFMat] = useState("");
  const [fSitio, setFSitio] = useState("");
  const [fPuesto, setFPuesto] = useState("");
  const [fConSaldo, setFConSaldo] = useState(false);
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
    setBloques(Object.fromEntries(sitios.map((s) => [s.clave, { ...VACIO, de: f }])));
    const { data: delD, error } = await supabase.from("v_casco").select(COLS).eq("fecha", f).order("sku");
    if (error) {
      setErrorLectura(/puesto|calidad/i.test(error.message)
        ? "Falta correr 2026-10-casco-puesto-calidad.sql en Supabase (las columnas Ubicaciones y Calidad)."
        : "No se pudo leer: " + error.message);
      setBloques(Object.fromEntries(sitios.map((s) => [s.clave, { ...VACIO, cargando: false }])));
      return;
    }
    /* LA CUENTA COMPLETA, TAMBIÉN AL ARRANCAR CON EL SALDO DE AYER: «cuando selecciono no me muestra
       toda mi operación, todas mis partidas + y −». Se trae la cuenta (24+15-36…) y se sigue sumando
       encima, como en el Excel. Solo si la cuenta da el mismo saldo que está guardado; si no (la
       cuenta quedó vieja), va el saldo solo, que es el que manda. */
    const conCuenta = (expr: string | null, valor: number | null) => {
      if (!expr) return null;
      const r = suma(expr);
      return r != null && Math.abs(r - Number(valor ?? 0)) < 0.005 ? expr : null;
    };
    const aFilas = (rs: Reg[]): Fila[] => rs.map((r) => ({
      sku: r.sku,
      inv: conCuenta(r.inv_expr, r.inventario) ?? aTexto(r.inventario),
      baja: conCuenta(r.baja_expr, r.baja) ?? (Number(r.baja) ? aTexto(r.baja) : ""),
      puesto: r.puesto ?? "", calidad: r.calidad ?? "",
    }));
    /* LAS UBICACIONES SALEN DEL ÚLTIMO INVENTARIO: Fábrica (AG18) de lo que está en LAVADO y
       Bodega 38 (AG22) de lo que está en BAJA. Solo en días desde ese inventario y solo en los
       materiales que el inventario trae en ese estado. TAMBIÉN ENCIMA DE UN BORRADOR: el borrador
       guarda las cantidades tecleadas, que no se tocan; la ubicación la manda el inventario.
       Si cambia algo, la tabla queda «sin guardar». */
    const alimentar = (s: SitioCasco, base: Partial<Bloque>): Partial<Bloque> => {
      const centro = (s.centro ?? "").toUpperCase();
      const inv = delInventario?.porCentro[centro];
      const mapa = inv?.mapa;
      if (!inv || !mapa || f < inv.fecha || !base.filas) return base;
      let n = 0;
      const filas = base.filas.map((x) => {
        /* «Si no hay ubicación en el inventario, que no aparezca»: si el inventario no trae ese
           material en este estado, la ubicación queda VACÍA (no se deja un P19 viejo). */
        const u = mapa[x.sku] ?? "";
        if (u === x.puesto.trim() || u === x.puesto) return x;
        n++; return { ...x, puesto: u };
      });
      if (!n) return base;
      return { ...base, filas, sucio: true, aviso: { tipo: "ok", texto:
        `${n} ubicaci${n === 1 ? "ón puesta" : "ones puestas"} del inventario del ${largo(inv.fecha)} (${ESTADO_UBIC[centro]}). Guarda para dejarla${n === 1 ? "" : "s"}.` } };
    };
    /* Si hay un borrador de este día y esta tabla, manda el borrador (y se dice). */
    const conBorrador = (clave: string, base: Partial<Bloque>): Partial<Bloque> => {
      const br = leerBorrador(f, clave);
      const s = sitios.find((x) => x.clave === clave)!;
      return alimentar(s, br ? { ...base, filas: br.filas, sucio: true, recuperado: br.en } : { ...base, recuperado: null });
    };
    await Promise.all(sitios.map(async (s) => {
      const hoyRows = ((delD ?? []) as Reg[]).filter((r) => r.ubicacion === s.clave);
      if (hoyRows.length) {
        poner(s.clave, conBorrador(s.clave, { filas: aFilas(hoyRows), arranque: null, guardado: true, cargando: false, sucio: false }));
        return;
      }
      /* SIN REGISTRO ESE DÍA EN ESTE SITIO: se arranca con su último saldo. */
      const { data: ult } = await supabase.from("v_casco").select("fecha")
        .eq("ubicacion", s.clave).lt("fecha", f).order("fecha", { ascending: false }).limit(1);
      const dia = (ult?.[0]?.fecha as string | undefined) ?? null;
      if (dia) {
        const { data: prev } = await supabase.from("v_casco").select(COLS).eq("ubicacion", s.clave).eq("fecha", dia).order("sku");
        poner(s.clave, conBorrador(s.clave, { filas: aFilas((prev ?? []) as Reg[]), arranque: dia, guardado: false, cargando: false, sucio: false }));
      } else poner(s.clave, conBorrador(s.clave, { filas: [], arranque: null, guardado: false, cargando: false, sucio: false }));
    }));
  }, [supabase, sitios, poner, delInventario]);

  useEffect(() => { void cargar(fecha); void totalesDelDia(fecha) }, [fecha, cargar, totalesDelDia]);

  /* CADA CAMBIO SIN GUARDAR SE COPIA AL BORRADOR de su día y su tabla. */
  useEffect(() => {
    /* Con el día DE LAS FILAS (b.de), no con el del calendario: al cambiar de fecha, las filas viejas
       no deben quedar guardadas como borrador del día nuevo. */
    for (const [clave, b] of Object.entries(bloques)) if (b.sucio && !b.cargando && b.de) guardarBorrador(b.de, clave, b.filas);
  }, [bloques]);
  /** «Descartar»: se borra el borrador y la tabla vuelve a lo guardado. */
  const descartar = async (s: SitioCasco) => {
    const ok = await pedir({
      titulo: `¿Descartar los cambios de ${s.nombre}?`,
      dice: <>La tabla vuelve a lo que está guardado para el {largo(fecha)}. Lo que tecleaste y no guardaste se pierde.</>,
      confirmar: "Descartar", cancelar: "Seguir editando", peligro: true,
    });
    if (!ok) return;
    borrarBorrador(fecha, s.clave);
    void cargar(fecha);
  };

  /* ---------- LAS CUENTAS DE UN SITIO ---------- */
  const calcular = (s: SitioCasco, b: Bloque) => b.filas.map((f) => {
    const inv = suma(f.inv), baja = s.baja_rotulo ? suma(f.baja) : 0;
    const hlE = dato[f.sku]?.hl_estiba ?? null;
    const total = inv != null && baja != null ? inv + baja : null;
    return { inv, baja, hl: total != null && hlE != null ? total * hlE : null,
             /* NEGATIVO SE PERMITE (salió más de lo contado: 26 − 80 = −54) y se pinta en rojo. */
             malInv: inv == null, malBaja: baja == null, sinFactor: hlE == null,
             negInv: inv != null && inv < 0, negBaja: baja != null && baja < 0 };
  });
  const conError = (s: SitioCasco, b: Bloque) => calcular(s, b).some((c) => c.malInv || c.malBaja || c.sinFactor);

  /* QUÉ FILA PASA LOS FILTROS. Códigos (uno o varios, separados por espacio o coma) o palabras del nombre
     («marron 330»: deben estar todas). */
  const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const terminos = sinTilde(fMat).split(/[\s,;]+/).filter(Boolean);
  const todosCodigos = terminos.length > 0 && terminos.every((t) => /^\d+$/.test(t));
  const qPuesto = sinTilde(fPuesto.trim());
  const hayFiltro = terminos.length > 0 || qPuesto !== "" || fSitio !== "" || fConSaldo;
  const pasa = (f: Fila, x: { inv: number | null; baja: number | null }) => {
    if (terminos.length) {
      const nombre = sinTilde(dato[f.sku]?.nombre ?? "");
      const ok = todosCodigos ? terminos.some((t) => f.sku.includes(t)) : terminos.every((t) => f.sku.includes(t) || nombre.includes(t));
      if (!ok) return false;
    }
    if (qPuesto && !sinTilde(f.puesto).includes(qPuesto)) return false;
    if (fConSaldo && (x.inv ?? 0) + (x.baja ?? 0) <= 0) return false;
    return true;
  };
  const limpiarFiltros = () => { setFMat(""); setFSitio(""); setFPuesto(""); setFConSaldo(false) };
  /* LO QUE SE VE, SITIO POR SITIO: el resumen del filtro. */
  const resumen = hayFiltro ? sitios.filter((t) => !fSitio || t.clave === fSitio).map((t) => {
    const bb = bloques[t.clave] ?? VACIO, cc = calcular(t, bb);
    const v = bb.filas.map((_, i) => i).filter((i) => pasa(bb.filas[i], cc[i]));
    return {
      s: t, n: v.length, cargando: bb.cargando,
      inv: v.reduce((a, i) => a + (cc[i].inv ?? 0), 0), baja: v.reduce((a, i) => a + (cc[i].baja ?? 0), 0),
      hl: v.reduce((a, i) => a + (cc[i].hl ?? 0), 0),
    };
  }) : [];

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
    borrarBorrador(fecha, s.clave);
    poner(s.clave, { guardando: false, sucio: false, guardado: true, arranque: null, recuperado: null,
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
  /** La × pregunta primero: dice QUÉ material se va, de QUÉ tabla y cuánto tenía. */
  const quitarConfirmado = async (s: SitioCasco, i: number, sku: string, resumen: string) => {
    const ok = await pedir({
      titulo: `¿Quitar ${sku} de ${s.nombre}?`,
      dice: (<>
        <b>{dato[sku]?.nombre ?? sku}</b> — {resumen}. Sale de esta tabla y se borra de la base cuando guardes;
        si recargas la página antes de guardar, vuelve.
      </>),
      confirmar: "Quitar", cancelar: "Cancelar", peligro: true,
    });
    if (ok) quitar(s.clave, i);
  };

  const totalDia = Object.values(delDia).reduce((t, v) => t + v, 0);
  const nSucios = Object.values(bloques).filter((b) => b.sucio).length;
  const hayError = sitios.some((s) => bloques[s.clave]?.sucio && conError(s, bloques[s.clave]));
  const irA = (clave: string) => document.getElementById("cas-b-" + clave)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      {dialogo}
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · CONTROL</p>
          <h1>Control</h1>
          <p className="sub">
            Las cuatro tablas del Excel, juntas. Tecleas las cuentas como allá (<b className="cas-sub-cuenta">24+15-36</b>),
            escoges la ubicación de cada material y el HL sale solo, con el factor del maestro.
          </p>
          <p className="sub">
            Las bajas y los movimientos se registran en <Link href="/inventario/casco/registrar">Registrar</Link> y se suman aquí.
            {" "}<Link href="/inventario/casco/tablero">Ver el tablero →</Link>
          </p>
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
                   onChange={(e) => { if (e.target.value) setFecha(e.target.value) }} />
          </label>
          <p className="cas-nota">
            Estás viendo <b>{largo(fecha)}</b>. Cada tabla guarda por separado; arriba y abajo hay un botón para guardar todo.
            {" "}Lo que no guardes queda como borrador en este equipo: puedes salir a revisar y al volver sigue ahí.
          </p>
        </div>
        {errorLectura && <p className="cas-aviso mal">{errorLectura}</p>}
      </div>

      {/* LOS FILTROS: un material en todas las bodegas, una bodega, una ubicación, o solo lo que tiene saldo. */}
      <div className="cas-form cas-filtros-caja">
        <div className="cas-filtros">
          <label className="cas-c cas-f-mat">
            <span>Material (código o nombre)</span>
            <input type="search" value={fMat} placeholder="3500005 · 3500162 · marron 330…" onChange={(e) => setFMat(e.target.value)} />
          </label>
          <label className="cas-c">
            <span>Bodega</span>
            <select value={fSitio} onChange={(e) => setFSitio(e.target.value)}>
              <option value="">Todas</option>
              {sitios.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
            </select>
          </label>
          <label className="cas-c">
            <span>Ubicación</span>
            <input type="search" value={fPuesto} placeholder="Ej. P19" onChange={(e) => setFPuesto(e.target.value)} />
          </label>
          <label className="cas-check">
            <input type="checkbox" checked={fConSaldo} onChange={(e) => setFConSaldo(e.target.checked)} />
            <span>Solo con estibas</span>
          </label>
          {hayFiltro && <button type="button" className="btn" onClick={limpiarFiltros}>Limpiar filtros</button>}
        </div>

        {hayFiltro && (
          <div className="cas-tabla-caja">
            <table className="cas-tabla cas-resumen">
              <thead>
                <tr>
                  <th>Lo que se ve · {fecha.split("-").reverse().join("/")}</th>
                  <th className="n">Materiales</th><th className="n">Inventario (est)</th><th className="n">Baja (est)</th><th className="n">HL</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.s.clave} className={r.n === 0 ? "cas-sin" : ""}>
                    <td><a href={"#cas-b-" + r.s.clave}>{r.s.nombre}</a></td>
                    <td className="n">{r.cargando ? "…" : r.n}</td>
                    <td className="n">{nf0.format(r.inv)}</td>
                    <td className="n">{r.s.baja_rotulo ? nf0.format(r.baja) : "—"}</td>
                    <td className="n hl">{nf2.format(r.hl)}</td>
                  </tr>
                ))}
              </tbody>
              {resumen.length > 1 && (
                <tfoot>
                  <tr>
                    <td>TOTAL</td>
                    <td className="n">{resumen.reduce((a, r) => a + r.n, 0)}</td>
                    <td className="n">{nf0.format(resumen.reduce((a, r) => a + r.inv, 0))}</td>
                    <td className="n">{nf0.format(resumen.reduce((a, r) => a + r.baja, 0))}</td>
                    <td className="n hl">{nf2.format(resumen.reduce((a, r) => a + r.hl, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* LAS SUGERENCIAS DE LA COLUMNA UBICACIONES: se puede escoger o escribir. */}
      <datalist id="cas-puestos">{puestos.map((p) => <option key={p} value={p} />)}</datalist>

      {sitios.map((s) => {
        if (fSitio && s.clave !== fSitio) return null;
        const b = bloques[s.clave] ?? VACIO;
        const c = calcular(s, b);
        const vis = b.filas.map((_, i) => i).filter((i) => pasa(b.filas[i], c[i]));
        const visInv = vis.reduce((t, i) => t + (c[i].inv ?? 0), 0);
        const visBaja = vis.reduce((t, i) => t + (c[i].baja ?? 0), 0);
        const visHl = vis.reduce((t, i) => t + (c[i].hl ?? 0), 0);
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
                  {b.cargando ? "Cargando…" : b.sucio ? (b.recuperado ? `Borrador recuperado (lo dejaste el ${hora(b.recuperado)}) · sin guardar` : "Cambios sin guardar · quedan como borrador") : b.guardado ? "Guardado" : b.arranque ? `Arrancó con el saldo del ${largo(b.arranque)}` : "Sin registros"}
                </p>
              </div>
              <div className="cas-bloque-hl"><b>{nf2.format(totHl)}</b><i>HL · {nf0.format(totInv + totBaja)} estibas</i></div>
            </header>

            {ESTADO_UBIC[(s.centro ?? "").toUpperCase()] && (() => {
              const est = ESTADO_UBIC[(s.centro ?? "").toUpperCase()];
              const inv = delInventario?.porCentro[(s.centro ?? "").toUpperCase()];
              /* LO QUE TRAJO EL INVENTARIO, CONTADO: si no llena, que se vea por qué. */
              if (!delInventario) return (
                <p className="cas-nota cas-rojo">No pude leer el inventario: las ubicaciones van a mano (¿tu rol ve Inventario?).</p>
              );
              if (!inv) return (
                <p className="cas-nota cas-rojo">Ningún inventario enviado de las últimas semanas trae material en <b>{est}</b>: las ubicaciones van a mano.</p>
              );
              const total = Object.keys(inv.mapa).length;
              const aqui = b.filas.filter((x) => inv.mapa[x.sku]).length;
              const fuera = Object.keys(inv.mapa).filter((k) => !b.filas.some((x) => x.sku === k));
              return (
                <p className="cas-nota">
                  Las <b>ubicaciones</b> salen del inventario del <b>{largo(inv.fecha)}</b>, de lo que está en <b>{est}</b>:{" "}
                  {total} material{total === 1 ? "" : "es"}, {aqui} de ellos en esta tabla.
                  {fuera.length > 0 && <> No están en la tabla: {fuera.slice(0, 8).join(", ")}{fuera.length > 8 ? "…" : ""}.</>}
                  {" "}Las puedes corregir aquí; el próximo inventario las vuelve a poner.
                </p>
              );
            })()}

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
                  {!b.cargando && b.filas.length > 0 && vis.length === 0 && (
                    <tr><td colSpan={cols} className="cas-vacio">Ningún material de esta tabla con esos filtros.</td></tr>
                  )}
                  {!b.cargando && vis.map((i) => {
                    const f = b.filas[i];
                    const x = c[i];
                    return (
                      <tr key={f.sku} className={x.negInv || x.negBaja ? "cas-neg" : undefined}>
                        <td className="cod">{f.sku}</td>
                        <td>{dato[f.sku]?.nombre ?? f.sku}
                          {x.sinFactor && <em className="cas-mal">sin botellas por estiba o HL en el maestro</em>}
                        </td>
                        <td className="n">
                          <span className="cas-cuenta">
                            <CampoCuenta valor={f.inv} resultado={x.inv} deshabilitado={!puedeEditar} mal={x.malInv} negativo={x.negInv}
                                         rotulo={`Inventario de ${f.sku} en ${s.nombre}`}
                                         cambiar={(v) => cambiar(s.clave, i, "inv", v)} />
                          </span>
                        </td>
                        {s.baja_rotulo && (
                          <td className="n">
                            <span className="cas-cuenta">
                              <CampoCuenta valor={f.baja} resultado={x.baja} deshabilitado={!puedeEditar} mal={x.malBaja} negativo={x.negBaja}
                                           rotulo={`${s.baja_rotulo} de ${f.sku} en ${s.nombre}`}
                                           cambiar={(v) => cambiar(s.clave, i, "baja", v)} />
                            </span>
                          </td>
                        )}
                        <td className={"n hl" + (x.hl != null && x.hl < 0 ? " cas-rojo" : "")}>{x.hl == null ? "—" : nf2.format(x.hl)}</td>
                        <td>
                          {/* EN FÁBRICA Y BODEGA LA UBICACIÓN VIENE DEL INVENTARIO y puede ser larga
                              («FABRICA_PATIO_1 - FABRICA_PATIO_2 - A01_IZQ»): se ve COMPLETA, en
                              varias líneas, en vez de cortada en una casilla de una línea. */}
                          {ESTADO_UBIC[(s.centro ?? "").toUpperCase()] ? (
                            <textarea className="cas-txt cas-ubi" rows={1} value={f.puesto} disabled={!puedeEditar}
                                      placeholder="Ej. P19" aria-label={`Ubicaciones de ${f.sku} en ${s.nombre}`} title={f.puesto || undefined}
                                      onChange={(e) => cambiar(s.clave, i, "puesto", e.target.value.replace(/\n/g, " "))} />
                          ) : (
                            <input className="cas-txt" list="cas-puestos" value={f.puesto} disabled={!puedeEditar}
                                   placeholder="Ej. P19" aria-label={`Ubicaciones de ${f.sku} en ${s.nombre}`}
                                   onChange={(e) => cambiar(s.clave, i, "puesto", e.target.value)} />
                          )}
                        </td>
                        <td>
                          <input className="cas-txt cas-txt-ancho" value={f.calidad} disabled={!puedeEditar} maxLength={240}
                                 aria-label={`Calidad de ${f.sku} en ${s.nombre}`}
                                 onChange={(e) => cambiar(s.clave, i, "calidad", e.target.value)} />
                        </td>
                        <td className="x">
                          {puedeEditar && (
                            <button type="button" aria-label={`Quitar ${f.sku}`} title="Quitar este material de la tabla"
                                    onClick={() => quitarConfirmado(s, i, f.sku,
                                      (x.inv ?? 0) + (x.baja ?? 0) > 0
                                        ? `tiene ${nf0.format((x.inv ?? 0) + (x.baja ?? 0))} estibas · ${x.hl == null ? "—" : nf2.format(x.hl)} HL`
                                        : "no tiene estibas")}>×</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {!b.cargando && b.filas.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2}>{hayFiltro ? `LO QUE SE VE (${vis.length} de ${b.filas.length}) · ${s.nombre}` : `TOTAL · ${s.nombre}`}</td>
                      <td className={"n" + ((hayFiltro ? visInv : totInv) < 0 ? " cas-rojo" : "")}>{nf0.format(hayFiltro ? visInv : totInv)} estibas</td>
                      {s.baja_rotulo && <td className={"n" + ((hayFiltro ? visBaja : totBaja) < 0 ? " cas-rojo" : "")}>{nf0.format(hayFiltro ? visBaja : totBaja)} estibas</td>}
                      <td className={"n hl" + ((hayFiltro ? visHl : totHl) < 0 ? " cas-rojo" : "")}>{nf2.format(hayFiltro ? visHl : totHl)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="cas-pie-bloque">
              {b.aviso && <p className={"cas-aviso " + b.aviso.tipo} role="status">{b.aviso.texto}</p>}
              {err && b.sucio && <p className="cas-aviso mal">Revisa los campos marcados: una cuenta no se entiende o falta el factor del maestro.</p>}
              {c.some((x) => x.negInv || x.negBaja) && (
                <p className="cas-aviso neg">Hay {c.filter((x) => x.negInv || x.negBaja).length} material{c.filter((x) => x.negInv || x.negBaja).length === 1 ? "" : "es"} en negativo (en rojo): salió más de lo contado. Se puede guardar así; revísalo.</p>
              )}
              {puedeEditar && b.sucio && (
                <button type="button" className="btn cas-descartar" disabled={b.guardando} onClick={() => void descartar(s)}>Descartar cambios</button>
              )}
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
