"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aplicarCodigos, esSeccionPallet, limpio, SIN_SKU, sinCodigo, validarPallet, type FilaHoja, type FilaValidacion, type Hoja, type SeccionHoja } from "@/modulos/carnaval/logica";
import type { Sku } from "@/modulos/carnaval/datos";
import { PLANTILLA_INICIAL } from "@/modulos/carnaval/plantilla";
import { leerFotoLocal } from "@/modulos/carnaval/leerFoto";
import { leerInventario } from "@/modulos/carnaval/leerInventario";
import { asignarCodigo, guardarInventario, saldosAl } from "./actions";
import { SelectorCodigo } from "./SelectorCodigo";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const IR = (f?: string) => `/inventario/balance/cuadre?alm=AG07&sub=inventario${f ? `&fecha=${f}` : ""}`;
const val = (v: number | null) => (v == null ? "" : nf.format(v));
const corto = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}` };

type Guardado = { fecha: string; secciones: SeccionHoja[]; validacion: (FilaValidacion & { decision?: string })[]; foto_nombre: string | null; actualizado_en: string } | null;

export function Inventario({ fecha, hoy, guardado, dias, puedeEditar, nombres, molde, maestro, eq }: { fecha: string; hoy: string; guardado: Guardado; dias: string[]; puedeEditar: boolean; nombres: Record<string, string>; molde: SeccionHoja[] | null; maestro: Sku[]; eq: Record<string, string> }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [pend, start] = useTransition();
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [sobrantes, setSobrantes] = useState(0);
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [foto, setFoto] = useState("");
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [ajustar, setAjustar] = useState<Record<string, boolean>>({});
  /* el maestro de SKU: de aquí sale la descripción oficial de cada renglón */
  const mapa = useMemo(() => new Map(maestro.map((m) => [m.codigo, m.descripcion])), [maestro]);
  const opciones = useMemo<Sku[]>(() => [{ codigo: SIN_SKU, descripcion: "No lleva código (no es un SKU)" }, ...maestro], [maestro]);
  const guardadaConCodigos = useMemo(() => (guardado ? aplicarCodigos(guardado.secciones, eq) : []), [guardado, eq]);

  async function alElegir(f: File | undefined) {
    if (!f) return;
    setAviso(null); setLeyendo(true);
    try {
      let dia: string, secciones: SeccionHoja[];
      if (/\.(xlsx|xlsm|xls)$/i.test(f.name)) {
        /* EL EXCEL: se lee aquí mismo, exacto y sin llave. */
        const r = await leerInventario(f);
        if (r.error || !r.hoja) { setAviso({ t: r.error ?? "No se pudo leer el Excel.", mal: true }); return }
        dia = r.hoja.fecha || fecha; secciones = r.hoja.secciones;
      } else {
        /* LA FOTO: se lee aquí mismo, sin llave. Los nombres salen del último inventario guardado (o del molde inicial) y de la foto
           solo se sacan los números; lo que no quedó claro sale marcado en amarillo. */
        const base = molde && molde.length ? molde : PLANTILLA_INICIAL;
        const r = await leerFotoLocal(f, base, setProgreso);
        dia = r.fecha ?? fecha; secciones = r.secciones; setSobrantes(r.sobrantes.length);
      }
      const s = await saldosAl(dia);
      if (s.error) { setAviso({ t: s.error, mal: true }); return }
      setSaldos(s.saldos ?? {}); setHoja({ fecha: dia, secciones: aplicarCodigos(secciones, eq) }); setFoto(f.name); setAjustar({});
      dlg.current?.showModal();
    } catch (e) {
      setAviso({ t: e instanceof Error ? e.message : "No se pudo leer el archivo.", mal: true });
    } finally { setLeyendo(false); setProgreso("") }
  }

  /* Si se corrige el día en la ventana, se traen los pallets de la app de ESE día. */
  async function cambiarDia(d: string) {
    if (!hoja || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    setHoja({ ...hoja, fecha: d });
    const s = await saldosAl(d);
    if (s.saldos) setSaldos(s.saldos);
    setAjustar({});
  }
  function poner(si: number, fi: number, campo: "a" | "b", v: string) {
    setHoja((h) => {
      if (!h) return h;
      const n = v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", "."));
      if (n !== null && !Number.isFinite(n)) return h;
      return { ...h, secciones: h.secciones.map((s, i) => i !== si ? s : { ...s, filas: s.filas.map((f, j) => j !== fi ? f : { ...f, [campo]: n, dudosa: false }) }) };
    });
  }

  function limpiar(soloPallet: boolean) {
    setHoja((h) => h && ({ ...h, secciones: h.secciones.map((x) => (soloPallet && !esSeccionPallet(x.titulo) ? x : { ...x, filas: x.filas.map((f) => ({ ...f, dudosa: false })) })) }));
  }
  function marcarBien(si: number, fi: number) {
    setHoja((h) => h && ({ ...h, secciones: h.secciones.map((x, i) => i !== si ? x : { ...x, filas: x.filas.map((f, j) => j !== fi ? f : { ...f, dudosa: false }) }) }));
  }
  function ponerCodigo(si: number, fi: number, cod: string) {
    setHoja((h) => h && ({ ...h, secciones: h.secciones.map((x, i) => i !== si ? x : { ...x, filas: x.filas.map((f, j) => j !== fi ? f : { ...f, codigo: cod || null }) }) }));
  }
  function amarrarGuardada(titulo: string, concepto: string, cod: string) {
    if (!cod) return;
    start(async () => {
      const r = await asignarCodigo(titulo, concepto, cod);
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      router.refresh();
    });
  }
  /** El renglón: la descripción OFICIAL del SKU (del maestro) y, abajo en gris, cómo lo llama la hoja si es distinto. */
  function Concepto({ f }: { f: FilaHoja }) {
    const cod = f.codigo;
    if (!cod || cod === SIN_SKU) return <>{f.concepto}</>;
    const desc = mapa.get(cod);
    if (!desc) return <><span className="cv-sku">{f.concepto}</span><span className="cv-sku-mal">El código {cod} no está en el maestro de SKU</span></>;
    return <><span className="cv-sku">{desc}</span>{limpio(desc) !== limpio(f.concepto) && <span className="cv-sku-hoja">En la hoja: {f.concepto}</span>}</>;
  }
  const v = useMemo(() => (hoja ? validarPallet(hoja, saldos, nombres) : null), [hoja, saldos, nombres]);
  const faltanCodigos = hoja ? sinCodigo(hoja.secciones) : 0;
  const dudosas = hoja ? hoja.secciones.reduce((t, x) => t + x.filas.filter((f) => f.dudosa).length, 0) : 0;
  const palletDudoso = hoja ? hoja.secciones.some((x) => esSeccionPallet(x.titulo) && x.filas.some((f) => f.dudosa)) : false;
  const aAjustar = v ? v.filas.filter((f) => ajustar[f.codigo]).map((f) => f.codigo) : [];
  useEffect(() => { const d = dlg.current; const x = () => setAjustar({}); d?.addEventListener("close", x); return () => d?.removeEventListener("close", x) }, []);

  function guardar() {
    if (!hoja) return;
    start(async () => {
      const r = await guardarInventario(JSON.stringify(hoja), aAjustar, foto);
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      dlg.current?.close();
      const dia = hoja.fecha; setHoja(null);
      setAviso({ t: `Inventario del ${dia} guardado${r.ajustes ? ` y ${r.ajustes} ajuste(s) de pallets registrados` : ""}.` });
      router.push(IR(dia)); router.refresh();
    });
  }

  async function excel() {
    if (!guardado) return;
    const XLSX = await import("xlsx");
    const datos: (string | number | null)[][] = [["EXISTENCIAS DIARIAS"], ["FECHA", guardado.fecha], []];
    for (const s of guardadaConCodigos) {
      datos.push([s.titulo, s.colA, s.colB, "CÓDIGO SKU", "DESCRIPCIÓN SKU"]);
      for (const f of s.filas) datos.push([f.concepto, f.a, f.b, f.codigo && f.codigo !== SIN_SKU ? f.codigo : null, f.codigo && f.codigo !== SIN_SKU ? (mapa.get(f.codigo) ?? null) : null]);
      datos.push([]);
    }
    const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(datos), "Existencias");
    XLSX.writeFile(libro, `Existencias_AG07_${guardado.fecha}.xlsx`);
  }

  const v0 = guardado?.validacion ?? [];
  return (
    <>
      {aviso && <p className={`cv-msg ${aviso.mal ? "mal" : ""}`} role="status">{aviso.t}</p>}
      <div className="cv-barra">
        <label>Inventario del día
          <input type="date" className="cv-fecha" value={fecha} max={hoy} onChange={(e) => e.target.value && router.push(IR(e.target.value))} />
        </label>
        {dias.length > 0 && (
          <span className="cv-dias" aria-label="Días con inventario">
            {dias.slice(0, 7).map((d) => <button key={d} type="button" className={d === fecha ? "on" : ""} onClick={() => router.push(IR(d))}>{corto(d)}</button>)}
          </span>
        )}
        <span className="grow" />
        {guardado && <button type="button" className="cs-bt alt" onClick={excel}>Descargar Excel</button>}
      </div>

      {puedeEditar && (
        <label className={`cv-drop ${leyendo || pend ? "off" : ""}`} style={{ marginBottom: 14 }}>
          <span><strong>{leyendo ? (progreso || "Leyendo…") : "Subir el inventario del día (foto o Excel)"}</strong><small>La foto de «Existencias diarias» tal cual, o su Excel. Se lee sola; lo que no quede claro sale en amarillo para que lo revises, y PALLET se valida contra la app antes de guardar.</small></span>
          <span className="cv-btn">{leyendo ? "Un momento…" : "Seleccionar archivo"}</span>
          <input type="file" accept=".xlsx,.xlsm,.xls,image/*" disabled={leyendo || pend} onChange={(e) => { void alElegir(e.target.files?.[0]); e.target.value = "" }} />
        </label>
      )}

      {!guardado ? (
        <p className="cv-msg" style={{ borderLeftColor: "var(--fe-linea)", background: "#fff" }}>No hay inventario cargado para el {fecha}.{puedeEditar ? " Sube el archivo de ese día para guardarlo." : ""}</p>
      ) : (
        <>
          <p className="cv-nota" style={{ margin: "0 0 10px" }}>Inventario del {guardado.fecha} · guardado {new Date(guardado.actualizado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}{v0.length === 0 ? " · PALLET cuadró con la app" : ` · ${v0.length} diferencia(s) en PALLET (abajo)`}{sinCodigo(guardadaConCodigos) > 0 ? ` · ${sinCodigo(guardadaConCodigos)} renglón(es) sin código SKU (amarillo: elige su código y queda para todos los días)` : " · todos los renglones amarrados a un SKU"}</p>
          <div className="cv-secs">
            {guardadaConCodigos.map((s, i) => (
              <div key={i} className="cv-sec">
                <table className="cv-tabla">
                  <thead><tr><th className="cod">Código</th><th>{s.titulo}</th><th className="r">{s.colA}</th><th className="r">{s.colB}</th></tr></thead>
                  <tbody>{s.filas.map((f, j) => (
                    <tr key={j} className={!f.a && !f.b ? "cero" : ""}>
                      <td className="cod">{puedeEditar
                        ? <SelectorCodigo compacto productos={opciones} value={f.codigo ?? ""} disabled={pend} onChange={(c) => amarrarGuardada(s.titulo, f.concepto, c)} />
                        : <span className={`cv-cod ${f.codigo && f.codigo !== SIN_SKU ? "" : "nada"}`}>{f.codigo && f.codigo !== SIN_SKU ? f.codigo : "—"}</span>}</td>
                      <td><Concepto f={f} /></td><td className="r">{val(f.a)}</td><td className="r">{val(f.b)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </div>
          {v0.length > 0 && (
            <details className="cv-hist" style={{ marginTop: 14 }}>
              <summary>Diferencias de PALLET contra la app ({v0.length})</summary>
              <div className="cv-tabla-cont"><table className="cv-tabla">
                <thead><tr><th>Código</th><th>Hoja</th><th className="r">Hoja</th><th className="r">App</th><th className="r">Dif</th><th>Qué se hizo</th></tr></thead>
                <tbody>{v0.map((f) => (
                  <tr key={f.codigo}><td><code>{f.codigo}</code></td><td>{f.nombreHoja}</td><td className="r">{nf.format(f.hoja)}</td><td className="r">{nf.format(f.app)}</td><td className="r cv-neg">{f.dif > 0 ? "+" : ""}{nf.format(f.dif)}</td><td>{f.decision === "ajustado" ? "Se ajustó la app a la hoja" : "Se dejó como estaba"}</td></tr>
                ))}</tbody>
              </table></div>
            </details>
          )}
        </>
      )}

      {/* LA VENTANA DE REVISIÓN: primero lo que importa (¿PALLET cuadra con la app?), luego lo que se leyó de la foto, para corregirlo */}
      <dialog ref={dlg} className="cv-dlg" aria-label="Revisión del inventario">
        <div className="cv-dlg-caja">
          <div className="cv-dlg-cab">
            <div><p>Carnaval · inventario diario</p><h2>Revisar lo que leí</h2></div>
            <button type="button" className="cv-dlg-x" aria-label="Cerrar" onClick={() => dlg.current?.close()}>×</button>
          </div>
          {hoja && v && (
            <div className="cv-dlg-cuerpo">
              <div className="cv-form">
                <label>Día de la hoja
                  <input type="date" value={hoja.fecha} max={hoy} onChange={(e) => void cambiarDia(e.target.value)} />
                </label>
                <span className="cv-nota" style={{ margin: 0 }}>Si el archivo no traía la fecha o la leí mal, corrígela aquí.{dias.includes(hoja.fecha) ? " Ya hay un inventario de ese día: se reemplaza." : ""}</span>
              </div>

              <div>
                <h3>PALLET contra la app</h3>
                {v.sinSeccion ? <p className="cv-msg mal" style={{ margin: 0 }}>No encontré la sección PALLET en lo que leí. Revisa que la foto la traiga.</p>
                  : v.filas.length === 0 ? <p className="cv-msg" style={{ margin: 0 }}>Cuadra: lo que dice la hoja es lo que lleva la app.</p>
                  : (<>
                    <p className="cv-msg mal" style={{ margin: "0 0 8px" }}>{v.filas.length} línea(s) no coinciden. Escoge qué hacer con cada una.</p>
                    <div className="cv-tabla-cont"><table className="cv-tabla">
                      <thead><tr><th>Código</th><th>En la hoja</th><th className="r">Hoja</th><th className="r">App</th><th className="r">Dif</th><th>Qué hago</th></tr></thead>
                      <tbody>{v.filas.map((f) => (
                        <tr key={f.codigo} className="cv-cambio">
                          <td><code>{f.codigo}</code></td><td>{f.nombreHoja}{f.faltaEnHoja ? " (no viene en la hoja)" : ""}</td>
                          <td className="r">{nf.format(f.hoja)}</td><td className="r">{nf.format(f.app)}</td><td className="r cv-neg">{f.dif > 0 ? "+" : ""}{nf.format(f.dif)}</td>
                          <td>
                            <span className="cv-seg">
                              <button type="button" className={!ajustar[f.codigo] ? "on" : ""} onClick={() => setAjustar((a) => ({ ...a, [f.codigo]: false }))}>Dejar como está</button>
                              <button type="button" className={ajustar[f.codigo] ? "on" : ""} onClick={() => setAjustar((a) => ({ ...a, [f.codigo]: true }))}>Ajustar la app a la hoja</button>
                            </span>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table></div>
                    <p className="cv-nota">«Ajustar» registra un AJUSTE por la diferencia (con nota) el {hoja.fecha}. «Dejar como está» solo guarda la alerta junto al inventario.</p>
                  </>)}
                {v.sinEmparejar.length > 0 && <p className="cv-nota">Líneas de PALLET con cantidad que no conozco (no se comparan): {v.sinEmparejar.join(", ")}.</p>}
              </div>

              {palletDudoso && (() => {
                const si = hoja.secciones.findIndex((x) => esSeccionPallet(x.titulo));
                const sec = hoja.secciones[si];
                return (
                  <div>
                    <h3>Confirma los números de PALLET con tu foto</h3>
                    <p className="cv-msg mal" style={{ margin: "0 0 8px" }}>No quedé seguro de algún número de PALLET. Compáralos con la foto, corrige los que estén mal y confirma.</p>
                    <div className="cv-tabla-cont"><table className="cv-tabla">
                      <thead><tr><th>Línea de PALLET</th><th className="r">En la foto</th><th className="r">La app tiene</th></tr></thead>
                      <tbody>{sec.filas.map((f, fi) => {
                        const cod = f.codigo && f.codigo !== SIN_SKU ? f.codigo : null;
                        return (
                          <tr key={fi} className={f.dudosa ? "cv-dudosa" : ""}><td><Concepto f={f} /></td>
                            <td className="r"><input className="cv-cel" inputMode="decimal" value={f.a ?? ""} onChange={(e) => poner(si, fi, "a", e.target.value)} aria-label={`${f.concepto} cantidad`} /></td>
                            <td className="r">{cod ? nf.format(saldos[cod] ?? 0) : "—"}</td></tr>
                        );
                      })}</tbody>
                    </table></div>
                    <div className="cv-form" style={{ marginTop: 8 }}><button type="button" className="cs-bt" onClick={() => limpiar(true)}>Confirmo los números de PALLET</button></div>
                  </div>
                );
              })()}

              <p className={`cv-msg ${faltanCodigos ? "mal" : ""}`} style={{ margin: 0 }}>{faltanCodigos
                ? `${faltanCodigos} renglón(es) sin código SKU (en amarillo en la columna Código). Elige el SKU de cada uno: la descripción sale del maestro y queda aprendido para los próximos días. Los que no son un SKU (estibas de madera, por ejemplo) se marcan «No lleva código».`
                : "Todos los renglones están amarrados a un SKU del maestro."}</p>

              <details open>
                <summary style={{ cursor: "pointer", font: "700 13px var(--fe-texto)", marginBottom: 8 }}>Lo que leí ({hoja.secciones.reduce((t, s) => t + s.filas.length, 0)} renglones) — corrige lo que esté mal</summary>
                {dudosas > 0 && <p className="cv-msg mal" style={{ margin: "0 0 10px" }}>{dudosas} renglón(es) en amarillo: no estoy seguro de cómo leí sus números. Compáralos con tu foto, corrige o toca «Está bien».{sobrantes > 0 ? ` Además ${sobrantes} línea(s) de la foto no pude ubicarlas.` : ""} <button type="button" className="cv-ok" onClick={() => limpiar(false)}>Está todo bien</button></p>}
                <div className="cv-secs">
                  {hoja.secciones.map((s, si) => (
                    <div key={si} className="cv-sec">
                      <table className="cv-tabla">
                        <thead><tr><th className="cod">Código</th><th>{s.titulo}</th><th className="r">{s.colA}</th><th className="r">{s.colB}</th></tr></thead>
                        <tbody>{s.filas.map((f, fi) => (
                          <tr key={fi} className={f.dudosa ? "cv-dudosa" : ""}>
                            <td className="cod"><SelectorCodigo compacto productos={opciones} value={f.codigo ?? ""} onChange={(c) => ponerCodigo(si, fi, c)} /></td>
                            <td><Concepto f={f} />{f.dudosa && <button type="button" className="cv-ok" onClick={() => marcarBien(si, fi)}>Está bien</button>}</td>
                            <td className="r"><input className="cv-cel" inputMode="decimal" value={f.a ?? ""} onChange={(e) => poner(si, fi, "a", e.target.value)} aria-label={`${f.concepto} ${s.colA}`} /></td>
                            <td className="r"><input className="cv-cel" inputMode="decimal" value={f.b ?? ""} onChange={(e) => poner(si, fi, "b", e.target.value)} aria-label={`${f.concepto} ${s.colB}`} /></td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
          <div className="cv-dlg-pie">
            <span className="cv-nota" style={{ margin: 0 }}>{palletDudoso ? "Antes de guardar, revisa los números de PALLET marcados en amarillo." : hoja ? `Se guardará el inventario del ${hoja.fecha}${aAjustar.length ? ` y ${aAjustar.length} ajuste(s) de pallets` : ""}.` : ""}</span>
            <span className="cv-form">
              <button type="button" className="cs-bt alt" onClick={() => dlg.current?.close()}>Cancelar</button>
              <button type="button" className="cs-bt" disabled={pend || !hoja || palletDudoso} title={palletDudoso ? "Revisa primero los números de PALLET marcados en amarillo" : undefined} onClick={guardar}>{pend ? "Guardando…" : "Guardar inventario"}</button>
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
