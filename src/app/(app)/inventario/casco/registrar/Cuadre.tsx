"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { cargarCuadre, type Cuadre as ResultadoCuadre, type SitioResultado } from "@/modulos/casco/cuadre";
import type { MaterialCasco, SitioCasco } from "@/modulos/casco/datos";

/**
 * REGISTRAR · BAJA · EXPORTAR — «que el sistema me haga esa tabla para yo validar, y poder exportarla».
 *
 * Por cada tabla de Control y cada material: lo que había AYER + las BAJAS (y movimientos) de ese día = lo que
 * Control debería tener. Si Control tiene otra cosa, la fila sale marcada «Revisar» con lo que pasó. El mismo
 * resultado se baja a Excel (ruta /inventario/casco/registrar/cuadre): una hoja de resumen, una por tabla y las bajas.
 */
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const largo = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
const cero = (n: number) => Math.abs(n) < 0.005;
/** Una cantidad que suma o resta: «+10,51», «−2,00» o un guion si no hay nada. */
const mov = (n: number) => (cero(n) ? "—" : (n > 0 ? "+" : "−") + nf2.format(Math.abs(n)));
const dif = (n: number) => (cero(n) ? "0,00" : (n > 0 ? "+" : "−") + nf2.format(Math.abs(n)));

export function Cuadre({ sitios, materiales, hoy }: { sitios: SitioCasco[]; materiales: MaterialCasco[]; hoy: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [fecha, setFecha] = useState(hoy);
  const [res, setRes] = useState<ResultadoCuadre | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [soloRevisar, setSoloRevisar] = useState(false);
  const turno = useRef(0);

  const cargar = useCallback(async () => {
    const mio = ++turno.current;
    setCargando(true);
    const r = await cargarCuadre(supabase, fecha, sitios, materiales);
    if (mio !== turno.current) return;            // llegó tarde: ya se pidió otro día
    if ("error" in r) { setFalla(traducirError(r.error)); setRes(null) } else { setFalla(null); setRes(r.cuadre) }
    setCargando(false);
  }, [supabase, fecha, sitios, materiales]);
  useEffect(() => { void cargar() }, [cargar]);

  const total = res ? res.cuadran + res.revisar : 0;
  const vistos = res?.sitios.filter((s) => s.filas.length > 0) ?? [];
  const sinRegistro = res?.sitios.filter((s) => s.filas.length === 0) ?? [];
  const soloReg = res?.bajas.filter((b) => b.destino === "registro") ?? [];

  return (
    <section className="cas-bloque reg-compacto" id="reg-exportar">
      <header className="cas-bloque-cab">
        <p className="cas-nota">
          Lo de <b>ayer + las bajas</b> (y los movimientos de ese día) tiene que ser igual a lo que hoy dice Control. Aquí lo ves
          material por material y lo bajas a Excel.
        </p>
      </header>

      <div className="reg-filtros cu-barra">
        <label className="cas-c"><span>Día de Control</span>
          <input type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </label>
        <div className="cu-acciones">
          <button type="button" className="btn" disabled={cargando} onClick={() => void cargar()}>{cargando ? "Calculando…" : "Actualizar"}</button>
          <a className="btn grande" href={`/inventario/casco/registrar/cuadre?fecha=${fecha}`} download
            title={`Excel con el resumen, una hoja por tabla y las bajas del ${largo(fecha)}`}>Exportar a Excel</a>
        </div>
      </div>

      {falla && <p className="cas-aviso mal" role="alert">{falla}</p>}

      {res && !falla && (
        <p className={"cas-aviso " + (total === 0 ? "" : res.revisar ? "mal" : "ok")} role="status">
          {total === 0
            ? `El ${largo(fecha)} no hay registros en Control ni bajas: no hay nada que comparar.`
            : res.revisar === 0
              ? <>Todo cuadra: <b>{res.cuadran} de {total}</b> celdas son iguales a lo de ayer más las bajas.</>
              : <><b>{res.revisar} celda{res.revisar === 1 ? "" : "s"} por revisar</b> de {total}. Están arriba de cada tabla, marcadas en rojo, con lo que pasó.</>}
        </p>
      )}

      {vistos.length > 0 && (
        <div className="reg-resumen reg-tarjetas" aria-live="polite">
          {vistos.map((s) => {
            const t = s.totales, ayer = t.ayerInv + t.ayerBaja, bajas = t.bajasInv + t.bajasBaja, movs = t.movInv + t.movBaja;
            const d = t.hoyInv + t.hoyBaja - (t.esperadoInv + t.esperadoBaja);
            return (
              <div key={s.sitio.clave} className={"reg-sitio cu-tarjeta" + (s.revisar ? " mal" : "")}>
                <span className="cas-rot">{s.sitio.nombre}</span>
                <b>{nf2.format(t.hoyInv + t.hoyBaja)} est.</b>
                <i>
                  ayer {nf2.format(ayer)} {mov(bajas) !== "—" && <>· bajas {mov(bajas)} </>}{mov(movs) !== "—" && <>· mov. {mov(movs)} </>}
                  = {nf2.format(t.esperadoInv + t.esperadoBaja)} esperado
                </i>
                <i className={cero(d) ? "cu-bien" : "cu-mal"}>
                  {cero(d) ? "sin diferencia" : `diferencia ${dif(d)}`} · {s.cuadran} de {s.filas.length} celdas cuadran
                </i>
              </div>
            );
          })}
        </div>
      )}

      {res && res.revisar > 0 && (
        <label className="cu-solo"><input type="checkbox" checked={soloRevisar} onChange={(e) => setSoloRevisar(e.target.checked)} /> Ver solo lo que hay que revisar</label>
      )}

      {vistos.map((s) => <TablaSitio key={s.sitio.clave} s={s} soloRevisar={soloRevisar} />)}

      {sinRegistro.length > 0 && (
        <p className="cas-nota">
          Sin registros ese día: {sinRegistro.map((s) => s.sitio.nombre).join(", ")}. Control mostraría el último saldo, no hay nada que comparar.
        </p>
      )}

      {res && (soloReg.length > 0 || res.sinTabla.length > 0) && (
        <details className="cu-notas">
          <summary>Lo que no entra en la cuenta</summary>
          {soloReg.length > 0 && (
            <p className="cas-nota">
              {soloReg.length} fila{soloReg.length === 1 ? "" : "s"} «solo registro» ({[...new Set(soloReg.map((b) => b.texto).filter(Boolean))].join(", ")}):
              constan en Bajas registradas pero no mueven Control, por eso no se suman.
            </p>
          )}
          {res.sinTabla.length > 0 && (
            <p className="cas-nota cu-mal">
              {res.sinTabla.length} baja{res.sinTabla.length === 1 ? "" : "s"} caen en un almacén sin tabla en Control ({[...new Set(res.sinTabla.map((b) => b.ubicacion))].join(", ")}).
            </p>
          )}
        </details>
      )}

      <details className="cu-notas">
        <summary>Cómo se calcula</summary>
        <ul className="reg-lista">
          <li><b>Ayer</b> es el último día anterior con registros de esa tabla (no tiene que ser el día de calendario anterior).</li>
          <li><b>Esperado</b> = ayer + bajas registradas ese día + movimientos y ajustes de ese día (lo que llega suma, lo que sale resta).</li>
          <li><b>Cuadra</b> cuando Control tiene lo esperado (se perdona 0,01 est. por el redondeo de cada baja) y el HL coincide con el del maestro.</li>
          <li><b>Revisar</b>: si Control tiene de más, suele ser el resto de una baja deshecha o algo tecleado a mano; si tiene de menos, una baja no llegó o Control se guardó con datos viejos.</li>
        </ul>
      </details>
    </section>
  );
}

function TablaSitio({ s, soloRevisar }: { s: SitioResultado; soloRevisar: boolean }) {
  const rot = s.sitio.baja_rotulo || "Con baja";
  const conBaja = s.filas.some((f) => f.ayerBaja || f.hoyBaja || f.bajasBaja || f.movBaja);
  const filas = soloRevisar ? s.filas.filter((f) => f.estado === "revisar") : s.filas;
  const t = s.totales;
  return (
    <div className="cu-sitio">
      <h3 className="cu-titulo">
        {s.sitio.nombre}
        <small>{s.diaAyer ? `ayer = ${largo(s.diaAyer)}` : "sin día anterior"} · {s.nBajas} baja{s.nBajas === 1 ? "" : "s"}</small>
        <span className={"reg-etq " + (s.revisar ? "mal" : "ok")}>{s.revisar ? `${s.revisar} por revisar` : "Todo cuadra"}</span>
      </h3>
      <div className="cas-tabla-caja">
        <table className="cas-tabla cu-tabla">
          <thead>
            <tr>
              <th>COD</th><th>Descripción</th>
              <th className="n">Ayer</th><th className="n">+ Bajas</th><th className="n">± Mov.</th><th className="n">Esperado</th><th className="n">Hoy</th><th className="n">Dif.</th>
              {conBaja && <><th className="n">{rot} ayer</th><th className="n">± Baja y mov.</th><th className="n">{rot} hoy</th><th className="n">Dif.</th></>}
              <th className="n">HL hoy</th><th className="n">HL esp.</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={conBaja ? 15 : 11} className="cas-vacio">Nada que revisar en esta tabla.</td></tr>}
            {filas.map((f) => (
              <tr key={f.sku} className={f.estado === "revisar" ? "cu-fila-mal" : ""}>
                <td className="cod">{f.sku}</td>
                <td>
                  {f.descripcion}
                  {f.motivo && <small className="cu-motivo">{f.motivo}</small>}
                  {!f.motivo && f.soloRegistro > 0 && <small className="reg-nota">{f.soloRegistro} fila{f.soloRegistro === 1 ? "" : "s"} «solo registro»: no mueven nada</small>}
                </td>
                <td className="n">{nf2.format(f.ayerInv)}</td>
                <td className="n">{mov(f.bajasInv)}</td>
                <td className="n">{mov(f.movInv)}</td>
                <td className="n est">{nf2.format(f.esperadoInv)}</td>
                <td className="n est">{nf2.format(f.hoyInv)}</td>
                <td className={"n cu-dif" + (Math.abs(f.difInv) > 0.011 ? " mal" : "")}>{dif(f.difInv)}</td>
                {conBaja && <>
                  <td className="n">{nf2.format(f.ayerBaja)}</td>
                  <td className="n">{mov(f.bajasBaja + f.movBaja)}</td>
                  <td className="n est">{nf2.format(f.hoyBaja)}</td>
                  <td className={"n cu-dif" + (Math.abs(f.difBaja) > 0.011 ? " mal" : "")}>{dif(f.difBaja)}</td>
                </>}
                <td className="n">{nf1.format(f.hlHoy)}</td>
                <td className={"n" + (f.difHl != null && Math.abs(f.difHl) > 0.15 ? " cu-dif mal" : "")}>{f.hlEsperado != null ? nf1.format(f.hlEsperado) : "—"}</td>
                <td><span className={"reg-etq " + (f.estado === "revisar" ? "mal" : "ok")}>{f.estado === "revisar" ? "Revisar" : "Cuadra"}</span></td>
              </tr>
            ))}
          </tbody>
          {!soloRevisar && (
            <tfoot>
              <tr>
                <td /><td>TOTAL</td>
                <td className="n">{nf2.format(t.ayerInv)}</td><td className="n">{mov(t.bajasInv)}</td><td className="n">{mov(t.movInv)}</td>
                <td className="n">{nf2.format(t.esperadoInv)}</td><td className="n">{nf2.format(t.hoyInv)}</td><td className="n">{dif(t.difInv)}</td>
                {conBaja && <><td className="n">{nf2.format(t.ayerBaja)}</td><td className="n">{mov(t.bajasBaja + t.movBaja)}</td><td className="n">{nf2.format(t.hoyBaja)}</td><td className="n">{dif(t.difBaja)}</td></>}
                <td className="n">{nf1.format(t.hlHoy)}</td><td className="n">{nf1.format(t.hlEsperado)}</td><td>{s.cuadran} de {s.filas.length}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
