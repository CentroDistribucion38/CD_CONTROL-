"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aHojaGuardada, CENTRO_DE_CASCO, conAuto, limpio, SIN_SKU, type ContextoAuto, type SeccionHoja } from "@/modulos/carnaval/logica";
import type { Sku } from "@/modulos/carnaval/datos";
import { eliminarInventario, guardarHoja } from "./actions";
import { SelectorCodigo } from "./SelectorCodigo";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const IR = (f?: string) => `/inventario/balance/cuadre?alm=AG07&sub=inventario${f ? `&fecha=${f}` : ""}`;
const corto = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}` };

type Guardado = { fecha: string; secciones: SeccionHoja[]; validacion: { decision?: string }[]; actualizado_en: string } | null;

/**
 * LA HOJA DE EXISTENCIAS DEL DÍA, VIVA. No se sube nada: se abre el día, se actualiza lo que cambió y se guarda.
 *   · PALLET sale de la app (Control) · los dos CASCO salen de Casco de vidrio (AG07 y CA22): solo se leen.
 *   · Todo lo demás se escribe a mano. Un día nuevo arranca con la hoja del último día guardado.
 * Cada renglón lleva su código SKU y la descripción sale del maestro.
 */
export function Inventario({ fecha, hoy, guardado, base, dias, puedeEditar, maestro, ctx }: {
  fecha: string; hoy: string; guardado: Guardado; base: { fecha: string; secciones: SeccionHoja[] } | null; dias: string[];
  puedeEditar: boolean; maestro: Sku[]; ctx: ContextoAuto;
}) {
  const router = useRouter();
  const dlgBorrar = useRef<HTMLDialogElement>(null);
  const [pend, start] = useTransition();
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const [secs, setSecs] = useState<SeccionHoja[]>(guardado?.secciones ?? base?.secciones ?? []);
  const [sucio, setSucio] = useState(false);
  const [motivoBorrar, setMotivoBorrar] = useState("");
  const [anularAj, setAnularAj] = useState(true);
  /* «Lo que esté en cero no se ve, a menos que le dé el ojito» (como en Casco de vidrio). Por sección. Lo que se tocó o se agregó en esta sesión
     no se esconde aunque quede en cero (si no, la fila se iría mientras se escribe). */
  const [verCeros, setVerCeros] = useState<Record<number, boolean>>({});
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const tocar = (si: number, ref: number) => setTocados((t) => new Set(t).add(`${si}|${ref}`));

  const mapa = useMemo(() => new Map(maestro.map((m) => [m.codigo, m.descripcion])), [maestro]);
  const opciones = useMemo<Sku[]>(() => [{ codigo: SIN_SKU, descripcion: "No lleva código (no es un SKU)" }, ...maestro], [maestro]);
  const vista = useMemo(() => conAuto(secs, ctx), [secs, ctx]);
  const porGuardar = puedeEditar && (sucio || (!guardado && secs.length > 0));

  function cambiar(fn: (s: SeccionHoja[]) => SeccionHoja[]) { setSecs((s) => fn(s)); setSucio(true) }
  function poner(si: number, ref: number, campo: "a" | "b", v: string) {
    const n = v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", "."));
    if (n !== null && !Number.isFinite(n)) return;
    tocar(si, ref);
    cambiar((all) => all.map((s, i) => i !== si ? s : { ...s, filas: s.filas.map((f, j) => j !== ref ? f : { ...f, [campo]: n }) }));
  }
  function ponerCodigo(si: number, ref: number, cod: string) {
    cambiar((all) => all.map((s, i) => i !== si ? s : { ...s, filas: s.filas.map((f, j) => j !== ref ? f : { ...f, codigo: cod || null, concepto: cod && cod !== SIN_SKU ? (mapa.get(cod) ?? f.concepto) : f.concepto }) }));
  }
  function quitar(si: number, ref: number) {
    setTocados((t) => new Set([...t].flatMap((k) => { const [a, b] = k.split("|").map(Number); return a !== si ? [k] : b === ref ? [] : [`${a}|${b > ref ? b - 1 : b}`] })));
    cambiar((all) => all.map((s, i) => i !== si ? s : { ...s, filas: s.filas.filter((_, j) => j !== ref) }));
  }
  function agregar(si: number, cod: string) {
    if (!cod || cod === SIN_SKU) return;
    if (vista[si].filas.some((f) => f.codigo === cod)) { setAviso({ t: `El ${cod} ya está en ${vista[si].titulo}.`, mal: true }); return }
    setAviso(null);
    tocar(si, secs[si]?.filas.length ?? 0);
    cambiar((all) => all.map((s, i) => i !== si ? s : { ...s, filas: [...s.filas, { concepto: mapa.get(cod) ?? cod, codigo: cod, a: 0, b: s.colB ? 0 : null }] }));
  }
  function descartar() { setSecs(guardado?.secciones ?? base?.secciones ?? []); setSucio(false); setAviso(null); setTocados(new Set()) }

  function guardar() {
    start(async () => {
      const r = await guardarHoja(fecha, JSON.stringify({ secciones: secs }));
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      setSucio(false); setAviso({ t: `Inventario del ${fecha} guardado.` });
      router.refresh();
    });
  }

  const ajustesHechos = guardado ? guardado.validacion.filter((x) => x.decision === "ajustado").length : 0;
  function borrar() {
    if (!guardado) return;
    start(async () => {
      const r = await eliminarInventario(guardado.fecha, motivoBorrar, anularAj && ajustesHechos > 0);
      dlgBorrar.current?.close();
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      setMotivoBorrar(""); setAviso({ t: `Inventario del ${guardado.fecha} eliminado${r.anulados ? ` y ${r.anulados} ajuste(s) de pallets anulado(s)` : ""}.` });
      router.refresh();
    });
  }

  async function excel() {
    const XLSX = await import("xlsx");
    const datos: (string | number | null)[][] = [["EXISTENCIAS DIARIAS"], ["FECHA", fecha], []];
    for (const s of vista) {
      datos.push(["SKU", s.titulo, s.colA, ...(s.colB ? [s.colB] : [])]);
      for (const f of s.filas) datos.push([f.codigo && f.codigo !== SIN_SKU ? f.codigo : null, (f.codigo && mapa.get(f.codigo)) || f.concepto, f.a, ...(s.colB ? [f.b] : [])]);
      datos.push([]);
    }
    const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(datos), "Existencias");
    XLSX.writeFile(libro, `Existencias_AG07_${fecha}.xlsx`);
  }

  const sinCod = vista.reduce((t, s) => t + s.filas.filter((f) => !f.codigo).length, 0);
  const lleno = (v: number | null) => (v == null ? "" : nf.format(v));

  return (
    <>
      {aviso && <p className={`cv-msg ${aviso.mal ? "mal" : ""}`} role="status">{aviso.t}</p>}
      <div className="cv-barra">
        <label>Inventario del día
          <input type="date" className="cv-fecha" value={fecha} max={hoy} onChange={(e) => e.target.value && router.push(IR(e.target.value))} />
        </label>
        {dias.length > 0 && (
          <span className="cv-dias" aria-label="Días guardados">
            {dias.slice(0, 7).map((d) => <button key={d} type="button" className={d === fecha ? "on" : ""} onClick={() => router.push(IR(d))}>{corto(d)}</button>)}
          </span>
        )}
        <span className="grow" />
        {porGuardar ? (
          <>
            {sucio && <button type="button" className="cs-bt alt" disabled={pend} onClick={descartar}>Descartar cambios</button>}
            <button type="button" className="cs-bt" disabled={pend} onClick={guardar}>{pend ? "Guardando…" : `Guardar inventario del ${corto(fecha)}`}</button>
          </>
        ) : (
          <>
            {guardado && puedeEditar && <button type="button" className="cs-bt alt" onClick={() => { setMotivoBorrar(""); setAnularAj(true); dlgBorrar.current?.showModal() }}>Eliminar inventario</button>}
            {secs.length > 0 && <button type="button" className="cs-bt alt" onClick={excel}>Descargar Excel</button>}
          </>
        )}
      </div>

      {secs.length === 0 ? (
        <p className="cv-msg" style={{ borderLeftColor: "var(--fe-linea)", background: "#fff" }}>Todavía no hay una hoja de existencias cargada. Pídela al administrador (se carga una sola vez).</p>
      ) : (
        <>
          <p className="cv-nota" style={{ margin: "0 0 10px" }}>
            {guardado
              ? `Inventario del ${fecha} · guardado ${new Date(guardado.actualizado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}${sucio ? " · tienes cambios sin guardar" : ""}`
              : `El ${fecha} todavía no está guardado: arrancó con la hoja del ${base ? base.fecha : "último día"}. Actualiza lo que cambió y guarda.`}
            {sinCod > 0 ? ` · ${sinCod} renglón(es) sin código SKU (amarillo)` : ""}
          </p>
          <div className="cv-secs">
            {vista.map((s, si) => {
              const veces = new Map<string, number>();
              for (const f of s.filas) if (f.codigo) veces.set(f.codigo, (veces.get(f.codigo) ?? 0) + 1);
              const dosCols = !!s.colB;
              /* Un segundo bloque de CASCO que la hoja traía vacío: ya lo trae Casco de vidrio arriba, no se muestra. */
              if (CENTRO_DE_CASCO[limpio(s.titulo)] && s.fuente !== "casco" && s.filas.every((f) => !(f.a ?? 0) && !(f.b ?? 0))) return null;
              const enCero = (f: (typeof s.filas)[number]) => !(f.a ?? 0) && !(f.b ?? 0) && !(f.ref >= 0 && tocados.has(`${si}|${f.ref}`));
              const ceros = s.filas.filter(enCero).length;
              const oculta = !verCeros[si];
              const filasVis = oculta ? s.filas.filter((f) => !enCero(f)) : s.filas;
              return (
                <div key={si} className="cv-sec">
                  <table className="cv-tabla">
                    <thead><tr><th className="cod">SKU</th><th>{s.titulo}</th><th className="r">{s.colA}</th>{dosCols && <th className="r">{s.colB}</th>}<th className="x cv-ojo-th">{ceros > 0 && (
                      <button type="button" className={"cv-ojo" + (oculta ? "" : " on")} aria-pressed={!oculta}
                              title={oculta ? `Ver los ${ceros} en cero` : "Ocultar los que están en cero"} onClick={() => setVerCeros((v) => ({ ...v, [si]: !v[si] }))}>
                        <svg viewBox="0 0 24 24" aria-hidden><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{oculta && <path d="M4 4l16 16" />}</svg>
                        {oculta && <em>{ceros}</em>}
                      </button>)}</th></tr></thead>
                    <tbody>{filasVis.map((f, j) => {
                      const editable = puedeEditar && !f.auto && f.ref >= 0;
                      const desc = (f.codigo && mapa.get(f.codigo)) || f.concepto;
                      const repetido = !!f.codigo && (veces.get(f.codigo) ?? 0) > 1;
                      return (
                        <tr key={`${f.ref}-${j}-${f.codigo ?? ""}`} className={`${!f.a && !f.b ? "cero" : ""} ${!f.codigo ? "cv-dudosa" : ""}`}>
                          <td className="cod">{f.codigo && f.codigo !== SIN_SKU
                            ? <span className="cv-cod">{f.codigo}</span>
                            : editable && !f.codigo ? <SelectorCodigo compacto productos={opciones} value="" onChange={(c) => ponerCodigo(si, f.ref, c)} />
                            : <span className="cv-cod nada">—</span>}</td>
                          <td><span className="cv-sku">{desc}</span>{repetido && <span className="cv-sku-hoja">{f.concepto}</span>}{f.auto && <span className="cv-tag">{s.fuente === "pallet" ? "App" : "Casco"}</span>}</td>
                          <td className="r">{editable ? <input className="cv-cel" inputMode="decimal" value={f.a ?? ""} onChange={(e) => poner(si, f.ref, "a", e.target.value)} aria-label={`${desc} ${s.colA}`} /> : <span className="cv-num">{lleno(f.a)}</span>}</td>
                          {dosCols && <td className="r">{editable ? <input className="cv-cel" inputMode="decimal" value={f.b ?? ""} onChange={(e) => poner(si, f.ref, "b", e.target.value)} aria-label={`${desc} ${s.colB}`} /> : <span className="cv-num">{lleno(f.b)}</span>}</td>}
                          <td className="x">{puedeEditar && s.fuente !== "casco" && editable && <button type="button" className="cv-quitar" aria-label={`Quitar ${desc}`} title="Quitar este renglón" onClick={() => quitar(si, f.ref)}>×</button>}</td>
                        </tr>
                      );
                    })}</tbody>
                    {(s.nota || (puedeEditar && s.fuente !== "casco")) && (
                      <tfoot><tr><td colSpan={5 + (dosCols ? 0 : -1)} className="cv-pie-sec"><div className="cv-pie-in">
                        {s.nota && <span className="cv-pie-nota">{s.nota}</span>}
                        {puedeEditar && s.fuente !== "casco" && <span className="cv-add"><SelectorCodigo compacto productos={maestro} value="" placeholder="+ Agregar SKU" onChange={(c) => agregar(si, c)} /></span>}
                      </div></td></tr></tfoot>
                    )}
                  </table>
                </div>
              );
            })}
          </div>
          <details className="cv-hist" style={{ marginTop: 14 }}>
            <summary>De dónde sale cada dato</summary>
            <p className="cv-nota" style={{ margin: "8px 0 0" }}>
              PALLET: los pallets que lleva la app (pestaña Control) al cierre del día. CASCO DE VIDRIO B38: el saldo de AG07 Alm. Bodega Carnaval en Casco de vidrio. CASCO VIDRIO CERVECERIA ATLANTICO: el saldo de CA22 ERR Atlántico en Casco de vidrio.
              Esos tres no se escriben aquí: se actualizan solos cuando cambian en su módulo. Lo demás (envase, cajas, estibas de madera, pendiente de baja, lavado, caja mala) se escribe a mano. El nombre de cada SKU sale del maestro.
            </p>
          </details>
        </>
      )}

      {/* ELIMINAR UN DÍA: ventana propia, con motivo; los ajustes de pallets que hizo (hojas anteriores) se anulan, no se borran */}
      <dialog ref={dlgBorrar} className="cv-dlg chico" aria-label="Eliminar inventario">
        <div className="cv-dlg-caja">
          <div className="cv-dlg-cab">
            <div><p>Carnaval · inventario diario</p><h2>Eliminar el inventario del {guardado?.fecha}</h2></div>
            <button type="button" className="cv-dlg-x" aria-label="Cerrar" onClick={() => dlgBorrar.current?.close()}>×</button>
          </div>
          <div className="cv-dlg-cuerpo">
            <p style={{ margin: 0, fontSize: 13.5 }}>Se quita la hoja de ese día. Los pallets y los demás días no cambian.</p>
            {ajustesHechos > 0 && (
              <label className="cv-marca"><input type="checkbox" checked={anularAj} onChange={(e) => setAnularAj(e.target.checked)} />
                <span>Esa hoja hizo {ajustesHechos} ajuste(s) de pallets. Anularlos también (quedan anulados con el motivo, no se borran).</span></label>
            )}
            <label className="cv-form" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4 }}>Motivo
              <input type="text" className="cv-cel" style={{ width: "100%", textAlign: "left" }} value={motivoBorrar} onChange={(e) => setMotivoBorrar(e.target.value)} placeholder="Por qué se elimina (obligatorio)" />
            </label>
          </div>
          <div className="cv-dlg-pie">
            <span />
            <span className="cv-form">
              <button type="button" className="cs-bt alt" onClick={() => dlgBorrar.current?.close()}>Cancelar</button>
              <button type="button" className="cs-bt cv-bt-borrar" disabled={pend || !motivoBorrar.trim()} onClick={borrar}>{pend ? "Eliminando…" : "Eliminar inventario"}</button>
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
