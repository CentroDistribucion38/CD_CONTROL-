"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validarPallet, type FilaValidacion, type Hoja, type SeccionHoja } from "@/modulos/carnaval/logica";
import { guardarInventario, saldosAl } from "./actions";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const IR = (f?: string) => `/inventario/balance/cuadre?alm=AG07&sub=inventario${f ? `&fecha=${f}` : ""}`;
const val = (v: number | null) => (v == null ? "" : nf.format(v));
const corto = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}` };

type Guardado = { fecha: string; secciones: SeccionHoja[]; validacion: (FilaValidacion & { decision?: string })[]; foto_nombre: string | null; actualizado_en: string } | null;

/** La foto se baja de tamaño solo si es muy pesada; si no, va tal cual (la letra pequeña se lee mejor sin tocarla). */
async function aBase64(f: File): Promise<{ imagen: string; tipo: string }> {
  const url = await new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => mal(new Error("No se pudo abrir la foto.")); r.readAsDataURL(f) });
  if (f.size <= 3_500_000 && /^image\/(jpeg|png|webp)$/.test(f.type)) return { imagen: url.split(",")[1], tipo: f.type };
  const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error("No se pudo abrir la foto.")); i.src = url });
  const k = Math.min(1, 3000 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return { imagen: c.toDataURL("image/jpeg", 0.92).split(",")[1], tipo: "image/jpeg" };
}

export function Inventario({ fecha, hoy, guardado, dias, puedeEditar, nombres }: { fecha: string; hoy: string; guardado: Guardado; dias: string[]; puedeEditar: boolean; nombres: Record<string, string> }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [pend, start] = useTransition();
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [foto, setFoto] = useState("");
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [ajustar, setAjustar] = useState<Record<string, boolean>>({});

  async function alElegir(f: File | undefined) {
    if (!f) return;
    setAviso(null); setLeyendo(true);
    try {
      const { imagen, tipo } = await aBase64(f);
      const r = await fetch("/api/carnaval/inventario-foto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imagen, tipo }) });
      const j = await r.json();
      if (!r.ok) { setAviso({ t: j.error ?? "No se pudo leer la foto.", mal: true }); return }
      const dia = j.fecha ?? fecha;
      const s = await saldosAl(dia);
      if (s.error) { setAviso({ t: s.error, mal: true }); return }
      setSaldos(s.saldos ?? {}); setHoja({ fecha: dia, secciones: j.secciones }); setFoto(f.name); setAjustar({});
      dlg.current?.showModal();
    } catch (e) {
      setAviso({ t: e instanceof Error ? e.message : "No se pudo leer la foto.", mal: true });
    } finally { setLeyendo(false) }
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
      return { ...h, secciones: h.secciones.map((s, i) => i !== si ? s : { ...s, filas: s.filas.map((f, j) => j !== fi ? f : { ...f, [campo]: n }) }) };
    });
  }

  const v = useMemo(() => (hoja ? validarPallet(hoja, saldos, nombres) : null), [hoja, saldos, nombres]);
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
    for (const s of guardado.secciones) { datos.push([s.titulo, s.colA, s.colB]); for (const f of s.filas) datos.push([f.concepto, f.a, f.b]); datos.push([]) }
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
          <span><strong>{leyendo ? "Leyendo la foto…" : "Subir la foto del inventario del día"}</strong><small>La hoja «Existencias diarias» tal cual. Se lee, la revisas y se valida PALLET contra la app antes de guardar.</small></span>
          <span className="cv-btn">{leyendo ? "Un momento…" : "Seleccionar foto"}</span>
          <input type="file" accept="image/*" disabled={leyendo || pend} onChange={(e) => { void alElegir(e.target.files?.[0]); e.target.value = "" }} />
        </label>
      )}

      {!guardado ? (
        <p className="cv-msg" style={{ borderLeftColor: "var(--fe-linea)", background: "#fff" }}>No hay inventario cargado para el {fecha}.{puedeEditar ? " Sube la foto de ese día para guardarlo." : ""}</p>
      ) : (
        <>
          <p className="cv-nota" style={{ margin: "0 0 10px" }}>Inventario del {guardado.fecha} · guardado {new Date(guardado.actualizado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}{v0.length === 0 ? " · PALLET cuadró con la app" : ` · ${v0.length} diferencia(s) en PALLET (abajo)`}</p>
          <div className="cv-secs">
            {guardado.secciones.map((s, i) => (
              <div key={i} className="cv-sec">
                <table className="cv-tabla">
                  <thead><tr><th>{s.titulo}</th><th className="r">{s.colA}</th><th className="r">{s.colB}</th></tr></thead>
                  <tbody>{s.filas.map((f, j) => (
                    <tr key={j} className={!f.a && !f.b ? "cero" : ""}><td>{f.concepto}</td><td className="r">{val(f.a)}</td><td className="r">{val(f.b)}</td></tr>
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
            <div><p>Carnaval · inventario diario</p><h2>Revisar lo que leí de la foto</h2></div>
            <button type="button" className="cv-dlg-x" aria-label="Cerrar" onClick={() => dlg.current?.close()}>×</button>
          </div>
          {hoja && v && (
            <div className="cv-dlg-cuerpo">
              <div className="cv-form">
                <label>Día de la hoja
                  <input type="date" value={hoja.fecha} max={hoy} onChange={(e) => void cambiarDia(e.target.value)} />
                </label>
                <span className="cv-nota" style={{ margin: 0 }}>Si la foto no traía la fecha o la leí mal, corrígela aquí.{dias.includes(hoja.fecha) ? " Ya hay un inventario de ese día: se reemplaza." : ""}</span>
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

              <details open>
                <summary style={{ cursor: "pointer", font: "700 13px var(--fe-texto)", marginBottom: 8 }}>Lo que leí de la foto ({hoja.secciones.reduce((t, s) => t + s.filas.length, 0)} renglones) — corrige lo que esté mal</summary>
                <div className="cv-secs">
                  {hoja.secciones.map((s, si) => (
                    <div key={si} className="cv-sec">
                      <table className="cv-tabla">
                        <thead><tr><th>{s.titulo}</th><th className="r">{s.colA}</th><th className="r">{s.colB}</th></tr></thead>
                        <tbody>{s.filas.map((f, fi) => (
                          <tr key={fi}><td>{f.concepto}</td>
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
            <span className="cv-nota" style={{ margin: 0 }}>{hoja ? `Se guardará el inventario del ${hoja.fecha}${aAjustar.length ? ` y ${aAjustar.length} ajuste(s) de pallets` : ""}.` : ""}</span>
            <span className="cv-form">
              <button type="button" className="cs-bt alt" onClick={() => dlg.current?.close()}>Cancelar</button>
              <button type="button" className="cs-bt" disabled={pend || !hoja} onClick={guardar}>{pend ? "Guardando…" : "Guardar inventario"}</button>
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
