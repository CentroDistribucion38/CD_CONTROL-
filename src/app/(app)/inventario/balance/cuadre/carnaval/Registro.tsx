"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Producto, Movimiento } from "@/modulos/carnaval/datos";
import type { Comparacion } from "@/modulos/carnaval/logica";
import { leerPeldar, type Lectura } from "@/modulos/carnaval/leer";
import { anularMovimiento, aplicarPeldar, previsualizarPeldar, registrarMovimiento } from "./actions";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const TIPO: Record<string, string> = { INICIAL: "Inicial", INGRESO: "Ingreso Peldar", TRASIEGO: "Trasiego", AJUSTE: "Ajuste" };
const conSigno = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
type Aviso = { t: string; mal?: boolean } | null;

export function Registro({ productos, corte, hoy, puedeEditar, movimientos }: { productos: Producto[]; corte: string; hoy: string; puedeEditar: boolean; movimientos: Movimiento[] }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [pend, start] = useTransition();
  const [aviso, setAviso] = useState<Aviso>(null);
  const nombre = useMemo(() => new Map(productos.map((p) => [p.codigo, p.descripcion])), [productos]);

  /* ----- el archivo de Peldar ----- */
  const [lect, setLect] = useState<Lectura | null>(null);
  const [archivo, setArchivo] = useState("");
  const [comp, setComp] = useState<{ c: Comparacion; corte: string; totalArchivo: number; anterioresLocal: number; enviadas: string } | null>(null);
  const [aprob, setAprob] = useState<Record<string, boolean>>({});

  async function alElegir(f: File | undefined) {
    if (!f) return;
    setAviso(null); setComp(null);
    const l = await leerPeldar(f);
    setLect(l); setArchivo(f.name);
    if (l.error) { setAviso({ t: l.error, mal: true }); return }
    const nuevas = l.filas.filter((x) => x.fecha > corte);
    const anterioresLocal = l.filas.length - nuevas.length;
    const enviadas = JSON.stringify(nuevas);
    start(async () => {
      const r = await previsualizarPeldar(enviadas);
      if ("error" in r) { setAviso({ t: r.error, mal: true }); return }
      setComp({ ...r, anterioresLocal, enviadas });
      setAprob({});
      dlg.current?.showModal();
    });
  }
  useEffect(() => { const d = dlg.current; const cerrar = () => setAprob({}); d?.addEventListener("close", cerrar); return () => d?.removeEventListener("close", cerrar) }, []);

  const c = comp?.c;
  const aprobadas = c ? c.cambiadas.filter((x) => aprob[x.clave]).map((x) => x.clave) : [];
  const nuevasPorCodigo = useMemo(() => {
    const m = new Map<string, { filas: number; pallets: number }>();
    for (const f of c?.nuevas ?? []) { const x = m.get(f.codigo) ?? { filas: 0, pallets: 0 }; x.filas++; x.pallets += f.pallets; m.set(f.codigo, x) }
    return [...m];
  }, [c]);
  const hayAlgo = !!c && (c.nuevas.length > 0 || aprobadas.length > 0);

  function guardarArchivo() {
    if (!comp) return;
    start(async () => {
      const r = await aplicarPeldar(comp.enviadas, aprobadas);
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      dlg.current?.close();
      setAviso({ t: `Listo: ${r.nuevas} ingresos nuevos${r.actualizadas ? ` y ${r.actualizadas} cambios aprobados` : ""}.` });
      setComp(null); setLect(null);
      router.refresh();
    });
  }

  /* ----- trasiego / ajuste ----- */
  const [tipo, setTipo] = useState<"TRASIEGO" | "AJUSTE">("TRASIEGO");
  const [fecha, setFecha] = useState(hoy);
  const [codigo, setCodigo] = useState("");
  const [pallets, setPallets] = useState("");
  const [nota, setNota] = useState("");
  function registrar() {
    setAviso(null);
    start(async () => {
      const r = await registrarMovimiento({ fecha, tipo, codigo, pallets: Number(pallets.replace(",", ".")), nota });
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      setAviso({ t: `${TIPO[tipo]} registrado.` });
      setPallets(""); setNota("");
      router.refresh();
    });
  }

  /* ----- anular ----- */
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  function anular(id: string) {
    start(async () => {
      const r = await anularMovimiento(id, motivo);
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      setAnulando(null); setMotivo(""); setAviso({ t: "Movimiento anulado." });
      router.refresh();
    });
  }

  return (
    <>
      {aviso && <p className={`cv-msg ${aviso.mal ? "mal" : ""}`} role="status">{aviso.t}</p>}
      {!puedeEditar && <p className="cv-msg mal">Tu rol solo puede ver. Para registrar necesitas permiso de «editar» en Cuadre SAP (Admin → Roles).</p>}

      <section className="cv-bloque">
        <h2>1 · Archivo de Peldar (suma)</h2>
        <div>
          <div className="cv-form">
            <label className="ancho">Archivo del día (Excel con Fecha de recibo, Codigo, remision, Placa, # PAL, Und)
              <input type="file" accept=".xlsx,.xlsm,.xls" disabled={pend || !puedeEditar} onChange={(e) => { void alElegir(e.target.files?.[0]); e.target.value = "" }} />
            </label>
            {comp && <button type="button" className="cs-bt alt" onClick={() => dlg.current?.showModal()}>Ver la revisión de {archivo}</button>}
          </div>
          <p className="cv-nota">Se agrega lo que todavía no está cargado y se revisa lo que ya estaba: si algo cambió (por ejemplo 50 pallets ayer y 45 hoy), no se cambia solo: sale en una ventana para que una persona lo apruebe o lo deje como estaba. Cada fila se identifica por remisión + placa + código. Lo recibido hasta el {corte} ya está dentro del saldo inicial y no se vuelve a sumar.</p>
        </div>
      </section>

      <section className="cv-bloque">
        <h2>2 · Trasiego (resta) o ajuste (suma o resta)</h2>
        <div>
          <div className="cv-form">
            <label>Movimiento
              <select value={tipo} onChange={(e) => setTipo(e.target.value as "TRASIEGO" | "AJUSTE")} disabled={!puedeEditar}>
                <option value="TRASIEGO">Trasiego (resta)</option>
                <option value="AJUSTE">Ajuste (+ o −)</option>
              </select>
            </label>
            <label>Día
              <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} disabled={!puedeEditar} />
            </label>
            <label>Código
              <select value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={!puedeEditar}>
                <option value="">Elige…</option>
                {productos.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.descripcion}</option>)}
              </select>
            </label>
            <label>Pallets {tipo === "TRASIEGO" ? "(los que salen)" : "(con − si resta)"}
              <input inputMode="decimal" value={pallets} onChange={(e) => setPallets(e.target.value)} placeholder={tipo === "TRASIEGO" ? "20" : "-3"} style={{ width: 120 }} disabled={!puedeEditar} />
            </label>
            <label className="ancho">Nota {tipo === "AJUSTE" ? "(obligatoria)" : "(opcional)"}
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === "AJUSTE" ? "Por qué se ajusta" : "A dónde fue"} disabled={!puedeEditar} />
            </label>
            <button type="button" className="cs-bt" disabled={pend || !puedeEditar || !codigo || !pallets} onClick={registrar}>Registrar</button>
          </div>
        </div>
      </section>

      <details className="cv-hist">
        <summary>Últimos movimientos ({movimientos.length})</summary>
        <div className="cv-tabla-cont">
          <table className="cv-tabla">
            <thead><tr><th>Día</th><th>Movimiento</th><th>Código</th><th className="r">Pallets</th><th>Remisión · placa</th><th>Nota</th><th /></tr></thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id} className={m.anulado ? "anulado" : ""}>
                  <td>{m.fecha}</td>
                  <td>{TIPO[m.tipo]}{m.historial.length > 0 && <small title="Tuvo un cambio aprobado"> · corregido</small>}</td>
                  <td><code>{m.codigo}</code> <small>{nombre.get(m.codigo)}</small></td>
                  <td className="r">{conSigno(m.pallets)}</td>
                  <td>{[m.remision, m.placa].filter(Boolean).join(" · ")}</td>
                  <td>{m.anulado ? `Anulado: ${m.anulado_motivo ?? ""}` : m.nota}</td>
                  <td>
                    {puedeEditar && !m.anulado && m.tipo !== "INICIAL" && (anulando === m.id
                      ? <span className="cv-form"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" style={{ height: 30, width: 150 }} />
                          <button type="button" className="cs-bt" style={{ minHeight: 30 }} disabled={pend || !motivo.trim()} onClick={() => anular(m.id)}>Anular</button>
                          <button type="button" className="cs-bt alt" style={{ minHeight: 30 }} onClick={() => { setAnulando(null); setMotivo("") }}>No</button></span>
                      : <button type="button" className="cv-anular" onClick={() => { setAnulando(m.id); setMotivo("") }}>Anular</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* LA VENTANA DE APROBACIÓN: lo nuevo se agrega; lo que cambió se aprueba fila por fila */}
      <dialog ref={dlg} className="cv-dlg" aria-label="Revisión del archivo de Peldar">
        <div className="cv-dlg-caja">
          <div className="cv-dlg-cab">
            <div><p>Carnaval · archivo de Peldar</p><h2>{archivo || "Revisión"}</h2></div>
            <button type="button" className="cv-dlg-x" aria-label="Cerrar" onClick={() => dlg.current?.close()}>×</button>
          </div>
          {c && comp && (
            <div className="cv-dlg-cuerpo">
              <div className="cv-resumen">
                <span><b>{c.nuevas.length}</b> nuevas</span>
                <span className={c.cambiadas.length ? "alerta" : ""}><b>{c.cambiadas.length}</b> con cambios</span>
                <span><b>{c.iguales}</b> iguales</span>
                <span><b>{comp.anterioresLocal + c.anteriores}</b> hasta el corte ({corte}), no se suman</span>
                {c.ausentes.length > 0 && <span className="alerta"><b>{c.ausentes.length}</b> ya cargadas que hoy no vienen</span>}
                {c.sinProducto.length > 0 && <span className="alerta"><b>{c.sinProducto.reduce((t, x) => t + x.n, 0)}</b> sin código en Carnaval</span>}
                {lect && lect.omitidas.otraBodega + lect.omitidas.invalidas > 0 && <span>{lect.omitidas.otraBodega} de otra bodega · {lect.omitidas.invalidas} incompletas</span>}
              </div>

              {c.cambiadas.length > 0 && (
                <div>
                  <h3>Lo que ya estaba cargado y hoy viene distinto. Marca los que SÍ quieres cambiar; los demás se quedan como estaban.</h3>
                  <div className="cv-tabla-cont"><table className="cv-tabla">
                    <thead><tr><th>Aceptar</th><th>Remisión · placa</th><th>Código</th><th>Antes</th><th /><th>Hoy</th></tr></thead>
                    <tbody>
                      {c.cambiadas.map((x) => (
                        <tr key={x.clave} className="cv-cambio">
                          <td><input type="checkbox" checked={!!aprob[x.clave]} onChange={(e) => setAprob((a) => ({ ...a, [x.clave]: e.target.checked }))} aria-label={`Aceptar el cambio de ${x.clave}`} /></td>
                          <td>{x.fila.remision} · {x.fila.placa}</td>
                          <td><code>{x.fila.codigo}</code></td>
                          <td>{nf.format(x.antes.pallets)} pallets{x.antes.fecha !== x.fila.fecha ? ` · ${x.antes.fecha}` : ""}</td>
                          <td className="cv-flecha">→</td>
                          <td><b>{nf.format(x.fila.pallets)} pallets</b>{x.antes.fecha !== x.fila.fecha ? ` · ${x.fila.fecha}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                  <div className="cv-form" style={{ marginTop: 8 }}>
                    <button type="button" className="cs-bt alt" onClick={() => setAprob(Object.fromEntries(c.cambiadas.map((x) => [x.clave, true])))}>Aceptar todos</button>
                    <button type="button" className="cs-bt alt" onClick={() => setAprob({})}>Dejar todos como estaban</button>
                  </div>
                </div>
              )}

              {nuevasPorCodigo.length > 0 && (
                <div>
                  <h3>Entran nuevas ({c.nuevas.length} filas)</h3>
                  <div className="cv-tabla-cont"><table className="cv-tabla">
                    <thead><tr><th>Código</th><th>Descripción</th><th className="r">Filas</th><th className="r">Pallets</th></tr></thead>
                    <tbody>{nuevasPorCodigo.map(([cod, v]) => <tr key={cod}><td><code>{cod}</code></td><td>{nombre.get(cod)}</td><td className="r">{v.filas}</td><td className="r">+{nf.format(v.pallets)}</td></tr>)}</tbody>
                  </table></div>
                </div>
              )}

              {c.sinProducto.length > 0 && (
                <div><h3>Códigos que no están en Carnaval (no se cargan; pídele al administrador agregarlos)</h3>
                  <p className="cv-nota">{c.sinProducto.map((x) => `${x.codigo} (${x.n} filas)`).join(" · ")}</p></div>
              )}
              {c.ausentes.length > 0 && (
                <div><h3>Ya cargadas que el archivo de hoy no trae (no se tocan; si fue un error de Peldar, anúlalas en Últimos movimientos)</h3>
                  <p className="cv-nota">{c.ausentes.slice(0, 12).map((x) => `${x.clave.split("|").join(" · ")} (${nf.format(x.pallets)})`).join(" — ")}{c.ausentes.length > 12 ? ` … y ${c.ausentes.length - 12} más` : ""}</p></div>
              )}
              {!c.nuevas.length && !c.cambiadas.length && <p className="cv-nota">No hay nada nuevo ni distinto: todo lo del archivo ya estaba cargado.</p>}
            </div>
          )}
          <div className="cv-dlg-pie">
            <span className="cv-nota" style={{ margin: 0 }}>{c ? `Se guardará: ${c.nuevas.length} nuevas y ${aprobadas.length} cambios aprobados.` : ""}</span>
            <span className="cv-form">
              <button type="button" className="cs-bt alt" onClick={() => dlg.current?.close()}>Cancelar</button>
              <button type="button" className="cs-bt" disabled={pend || !hayAlgo} onClick={guardarArchivo}>{pend ? "Guardando…" : "Guardar"}</button>
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
