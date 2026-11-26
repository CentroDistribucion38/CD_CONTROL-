"use client";

/**
 * 5S · MAESTRO — lo que hay que tener listo antes de auditar, en el orden en que se arma:
 *   1. Responsables  →  2. Áreas (con su responsable y su meta)  →  3. Formatos (qué se evalúa: 5S, PTL… y sus
 *   secciones)  →  4. Checklist (los puntos de cada formato).
 * El checklist tiene puntos GENERALES (valen para todas las áreas) y puntos PROPIOS de un área. Al escoger un área se ve
 * exactamente lo que se le va a preguntar: los generales y los suyos.
 * Nada se borra: se desactiva. Las inspecciones viejas guardan su copia de cada pregunta, así que cambiar o quitar un
 * punto no cambia lo que ya se auditó.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { CabezaVentana } from "../CabezaVentana";
import {
  FORMATO_5S, checklistDe, mapaSecciones, pct,
  type Area5S, type ClaveS, type Formato5S, type Punto5S, type Responsable5S, type Seccion5S, type Zona5S,
} from "@/modulos/cinco-s/cinco-s";

type Tab = "responsables" | "areas" | "formatos" | "checklist";
type Edit =
  | { que: "responsable"; v: Partial<Responsable5S> }
  | { que: "area"; v: Partial<Area5S> & { metaTxt?: string } }
  | { que: "punto"; v: Partial<Punto5S> & { pesoTxt?: string } }
  | { que: "formato"; v: Partial<Formato5S> & { metaTxt?: string } }
  | { que: "seccion"; v: Partial<Seccion5S> & { formato_id: string } };

/** «Revisión de montacargas» → «revision_de_montacargas» (las claves de la base: minúsculas, números y _). */
const slug = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "x";

export function Maestro5S({ meta, areas, responsables, puntos, zonas = [], formatos = [FORMATO_5S], puedeEditar }: {
  meta: number; areas: Area5S[]; responsables: Responsable5S[]; puntos: Punto5S[]; zonas?: Zona5S[]; formatos?: Formato5S[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [tab, setTab] = useState<Tab>(areas.length ? "checklist" : responsables.length ? "areas" : "responsables");
  const [para, setPara] = useState<string>("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [metaTxt, setMetaTxt] = useState(String(meta));
  const [ocupado, setOcupado] = useState(false);
  const [zonaNueva, setZonaNueva] = useState<{ area: string; txt: string } | null>(null);
  /* El checklist se ve por formato: 5S, PTL… */
  const [fmtId, setFmtId] = useState<string>(formatos[0]?.id ?? "");
  const fmt = formatos.find((f) => f.id === fmtId) ?? formatos[0] ?? FORMATO_5S;
  const conFormatos = formatos.some((f) => f.id);   // false = falta correr el SQL del paso 6
  const secc = mapaSecciones(formatos);
  const deFmt = (p: Punto5S) => !fmt.id || !p.formato_id || p.formato_id === fmt.id;

  const nomResp = (id: string | null) => responsables.find((r) => r.id === id)?.nombre ?? null;
  const propios = (areaId: string) => puntos.filter((p) => p.activo && p.area_id === areaId && deFmt(p)).length;
  const generales = puntos.filter((p) => p.activo && p.area_id === null && deFmt(p)).length;

  async function correr(f: () => PromiseLike<{ error: { message: string } | null }>, bien: string) {
    setOcupado(true);
    const { error } = await f();
    setOcupado(false);
    if (error) {
      avisar.mal(/duplicate key|unique/i.test(error.message) ? "Ya existe uno con ese nombre." : error.message);
      return false;
    }
    avisar.bien(bien);
    setEdit(null);
    router.refresh();
    return true;
  }

  async function guardarEdit() {
    if (!edit) return;
    const sb = createClient();
    if (edit.que === "responsable") {
      const v = edit.v;
      const fila = { nombre: (v.nombre ?? "").trim(), cedula: v.cedula?.trim() || null, cargo: v.cargo?.trim() || null };
      if (!fila.nombre) { avisar.mal("Escribe el nombre."); return }
      await correr(() => v.id ? sb.from("s5_responsables").update(fila).eq("id", v.id) : sb.from("s5_responsables").insert(fila),
        v.id ? `${fila.nombre} actualizado.` : `${fila.nombre} agregado.`);
    } else if (edit.que === "area") {
      const v = edit.v;
      const m = (v.metaTxt ?? "").trim().replace(",", ".");
      const metaN = m === "" ? null : Number(m);
      if (metaN !== null && !(metaN >= 1 && metaN <= 100)) { avisar.mal("La meta va de 1 a 100 %, o vacía para usar la general."); return }
      const fila = { nombre: (v.nombre ?? "").trim().toUpperCase(), descripcion: v.descripcion?.trim() || null, responsable_id: v.responsable_id || null, meta: metaN };
      if (!fila.nombre) { avisar.mal("Escribe el nombre del área."); return }
      await correr(() => v.id ? sb.from("s5_areas").update(fila).eq("id", v.id)
        : sb.from("s5_areas").insert({ ...fila, orden: areas.length + 1 }),
        v.id ? `${fila.nombre} actualizada.` : `${fila.nombre} creada.`);
    } else if (edit.que === "punto") {
      const v = edit.v;
      const peso = Number((v.pesoTxt ?? "1").replace(",", "."));
      const fila = { s: v.s as ClaveS, pregunta: (v.pregunta ?? "").trim(), area_id: v.area_id || null, peso, exige_foto: !!v.exige_foto,
        ...(fmt.id ? { formato_id: v.formato_id || fmt.id } : {}) };
      if (!fila.s) { avisar.mal("Escoge a cuál sección pertenece."); return }
      if (!fila.pregunta) { avisar.mal("Escribe el punto a revisar."); return }
      if (!(peso > 0 && peso <= 100)) { avisar.mal("El peso va de 0,1 a 100."); return }
      const orden = v.id ? v.orden : Math.max(0, ...puntos.filter((p) => p.s === fila.s).map((p) => p.orden)) + 1;
      const sx = secc.get(fila.s);
      await correr(() => v.id ? sb.from("s5_puntos").update(fila).eq("id", v.id) : sb.from("s5_puntos").insert({ ...fila, orden }),
        v.id ? "Punto actualizado." : `Punto agregado a ${sx ? `${sx.corto} · ${sx.nombre}` : "la sección"}.`);
    } else if (edit.que === "formato") {
      const v = edit.v;
      const m = (v.metaTxt ?? "").trim().replace(",", ".");
      const metaN = m === "" ? null : Number(m);
      if (metaN !== null && !(metaN >= 1 && metaN <= 100)) { avisar.mal("La meta va de 1 a 100 %, o vacía para usar la del área o la general."); return }
      const nombre = (v.nombre ?? "").trim();
      if (!nombre) { avisar.mal("Escribe el nombre del formato."); return }
      const fila = { nombre, descripcion: v.descripcion?.trim() || null, meta: metaN };
      let clave = slug(nombre.split("·")[0]);
      while (formatos.some((f) => f.clave === clave)) clave += "_2";
      await correr(() => v.id ? sb.from("s5_formatos").update(fila).eq("id", v.id)
        : sb.from("s5_formatos").insert({ ...fila, clave, orden: formatos.length + 1 }),
        v.id ? `${nombre} actualizado.` : `Formato ${nombre} creado. Ahora agrégale sus secciones.`);
    } else {
      const v = edit.v;
      const nombre = (v.nombre ?? "").trim();
      const corto = (v.corto ?? "").trim().toUpperCase();
      if (!nombre) { avisar.mal("Escribe el nombre de la sección."); return }
      if (!corto || corto.length > 6) { avisar.mal("La ficha corta va de 1 a 6 letras (ej.: UBI)."); return }
      const f = formatos.find((x) => x.id === v.formato_id);
      const fila = { nombre, corto, que: v.que?.trim() || null };
      let clave = `${f?.clave ?? "f"}_${slug(nombre)}`;
      while (!v.clave && secc.has(clave)) clave += "_2";
      await correr(() => v.clave ? sb.from("s5_secciones").update(fila).eq("clave", v.clave)
        : sb.from("s5_secciones").insert({ ...fila, clave, formato_id: v.formato_id, orden: (f?.secciones.length ?? 0) + 1 }),
        v.clave ? `Sección ${nombre} actualizada.` : `Sección ${nombre} agregada a ${f?.nombre ?? "el formato"}.`);
    }
  }

  async function activar(tabla: "s5_responsables" | "s5_areas" | "s5_puntos" | "s5_zonas" | "s5_formatos", id: string, campo: "activo" | "activa", valor: boolean, que: string) {
    const sb = createClient();
    await correr(() => sb.from(tabla).update({ [campo]: valor }).eq("id", id), valor ? `${que}: activo otra vez.` : `${que}: desactivado.`);
  }

  /* LAS ZONAS DE UN ÁREA: calle 1, calle 2, muelle… En la inspección, cada «no cumple» dice en cuál fue. */
  async function agregarZona() {
    if (!zonaNueva) return;
    const nombre = zonaNueva.txt.trim().toUpperCase();
    if (!nombre) { setZonaNueva(null); return }
    const sb = createClient();
    const ya = zonas.find((z) => z.area_id === zonaNueva.area && z.nombre === nombre);
    const ok = await correr(() => ya ? sb.from("s5_zonas").update({ activa: true }).eq("id", ya.id)
      : sb.from("s5_zonas").insert({ area_id: zonaNueva.area, nombre, orden: zonas.filter((z) => z.area_id === zonaNueva.area).length + 1 }),
      `Zona ${nombre} agregada.`);
    if (ok) setZonaNueva({ area: zonaNueva.area, txt: "" });
  }

  async function guardarMeta() {
    const n = Number(metaTxt.replace(",", "."));
    if (!(n >= 1 && n <= 100)) { avisar.mal("La meta va de 1 a 100 %."); return }
    const sb = createClient();
    await correr(() => sb.from("s5_reglas").update({ meta: n, actualizado: new Date().toISOString() }).eq("id", 1), `Meta general: ${pct(n)}.`);
  }

  const areaPara = areas.find((a) => a.id === para) ?? null;
  const verPuntos = para ? checklistDe(puntos, para, fmt) : puntos.filter((p) => p.area_id === null && deFmt(p)).sort((a, b) => a.orden - b.orden);
  const inactivosPara = puntos.filter((p) => !p.activo && deFmt(p) && (para ? p.area_id === para : p.area_id === null));

  return (
    <div className="s5">
      {avisos}
      <header className="s5-cab">
        <div>
          <p className="s5-ojo">EVALUACIONES · 5S Y PTL</p>
          <h1>Maestro</h1>
          <p className="s5-sub">Primero los responsables, después las áreas, los formatos (qué se evalúa) y al final el checklist de cada formato.</p>
        </div>
      </header>

      <nav className="s5-tabs" aria-label="Partes del maestro">
        <button type="button" className={tab === "responsables" ? "on" : ""} onClick={() => setTab("responsables")}>1 · Responsables<i>{responsables.filter((r) => r.activo).length}</i></button>
        <button type="button" className={tab === "areas" ? "on" : ""} onClick={() => setTab("areas")}>2 · Áreas<i>{areas.filter((a) => a.activa).length}</i></button>
        <button type="button" className={tab === "formatos" ? "on" : ""} onClick={() => setTab("formatos")}>3 · Formatos<i>{formatos.filter((f) => f.activo).length}</i></button>
        <button type="button" className={tab === "checklist" ? "on" : ""} onClick={() => setTab("checklist")}>4 · Checklist<i>{puntos.filter((p) => p.activo).length}</i></button>
      </nav>

      {tab === "responsables" && (
        <section className="s5-card">
          <header>
            <h2>Responsables de área</h2>
            {puedeEditar && <button type="button" className="s5-bt osc" onClick={() => setEdit({ que: "responsable", v: {} })}>+ Nuevo responsable</button>}
            <p>Quien responde por el orden y aseo de un área. Sale solo en la inspección y en el historial.</p>
          </header>
          {responsables.length === 0 ? <p className="s5-vacio">Todavía no hay responsables.</p> : (
            <ul className="s5-filas">
              {responsables.map((r) => {
                const suyas = areas.filter((a) => a.responsable_id === r.id).map((a) => a.nombre);
                return (
                  <li key={r.id} className={"s5-fila" + (r.activo ? "" : " inactiva")}>
                    <div>
                      <b>{r.nombre}</b>{!r.activo && <span className="s5-chip">inactivo</span>}
                      <small>{[r.cargo, r.cedula && `C.C. ${r.cedula}`, suyas.length ? `Áreas: ${suyas.join(", ")}` : "Sin áreas"].filter(Boolean).join(" · ")}</small>
                    </div>
                    {puedeEditar && (
                      <div className="s5-acc">
                        <button type="button" className="s5-bt" onClick={() => setEdit({ que: "responsable", v: r })}>Editar</button>
                        <button type="button" className="s5-bt" disabled={ocupado} onClick={() => activar("s5_responsables", r.id, "activo", !r.activo, r.nombre)}>{r.activo ? "Desactivar" : "Activar"}</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "areas" && (
        <>
          <section className="s5-card">
            <header>
              <h2>Meta general</h2>
              <p>La que usan las áreas que no tienen meta propia. Bajo la meta, el puntaje sale en rojo.</p>
            </header>
            <div className="s5-meta-gen">
              <label className="s5-campo"><span>Meta (%)</span>
                <input inputMode="decimal" value={metaTxt} disabled={!puedeEditar} onChange={(e) => setMetaTxt(e.target.value.replace(/[^0-9,.]/g, ""))} />
              </label>
              {puedeEditar && <button type="button" className="s5-bt" disabled={ocupado || Number(metaTxt.replace(",", ".")) === meta} onClick={guardarMeta}>Guardar meta</button>}
            </div>
          </section>
          <section className="s5-card">
            <header>
              <h2>Áreas que se auditan</h2>
              {puedeEditar && <button type="button" className="s5-bt osc" onClick={() => setEdit({ que: "area", v: { metaTxt: "" } })}>+ Nueva área</button>}
              <p>Bodega 38, Fábrica, patio, oficinas, taller… Cada una con su responsable.</p>
            </header>
            {areas.length === 0 ? <p className="s5-vacio">Todavía no hay áreas.</p> : (
              <ul className="s5-filas">
                {areas.map((a) => (
                  <li key={a.id} className={"s5-fila" + (a.activa ? "" : " inactiva")}>
                    <div>
                      <b>{a.nombre}</b>{!a.activa && <span className="s5-chip">inactiva</span>}
                      <small>
                        {nomResp(a.responsable_id) ?? "Sin responsable"} · meta {a.meta != null ? `${pct(a.meta)} (propia)` : `${pct(meta)} (general)`}
                        {" · "}{generales + propios(a.id)} puntos{propios(a.id) ? ` (${propios(a.id)} propios)` : ""}
                        {a.descripcion ? ` · ${a.descripcion}` : ""}
                      </small>
                      <div className="s5-zonas">
                        <span>Zonas</span>
                        {zonas.filter((z) => z.area_id === a.id && z.activa).map((z) => (
                          <span key={z.id} className="s5-zona-chip">{z.nombre}
                            {puedeEditar && <button type="button" aria-label={"Quitar zona " + z.nombre} disabled={ocupado}
                              onClick={() => activar("s5_zonas", z.id, "activa", false, `Zona ${z.nombre}`)}>×</button>}
                          </span>
                        ))}
                        {zonas.filter((z) => z.area_id === a.id && z.activa).length === 0 && !(zonaNueva?.area === a.id) && <em>sin zonas</em>}
                        {puedeEditar && (zonaNueva?.area === a.id ? (
                          <form className="s5-zona-nueva" onSubmit={(e) => { e.preventDefault(); agregarZona() }}>
                            <input autoFocus value={zonaNueva.txt} placeholder="CALLE 3" aria-label="Nueva zona"
                                   onChange={(e) => setZonaNueva({ area: a.id, txt: e.target.value })}
                                   onKeyDown={(e) => { if (e.key === "Escape") setZonaNueva(null) }} />
                            <button type="submit" className="s5-bt" disabled={ocupado}>Agregar</button>
                            <button type="button" className="s5-link" onClick={() => setZonaNueva(null)}>listo</button>
                          </form>
                        ) : <button type="button" className="s5-link" onClick={() => setZonaNueva({ area: a.id, txt: "" })}>+ zona</button>)}
                      </div>
                    </div>
                    {puedeEditar && (
                      <div className="s5-acc">
                        <button type="button" className="s5-bt" onClick={() => setEdit({ que: "area", v: { ...a, metaTxt: a.meta == null ? "" : String(a.meta) } })}>Editar</button>
                        <button type="button" className="s5-bt" disabled={ocupado} onClick={() => activar("s5_areas", a.id, "activa", !a.activa, a.nombre)}>{a.activa ? "Desactivar" : "Activar"}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === "formatos" && (
        <section className="s5-card">
          <header>
            <h2>Formatos de evaluación</h2>
            {puedeEditar && conFormatos && <button type="button" className="s5-bt osc" onClick={() => setEdit({ que: "formato", v: { metaTxt: "" } })}>+ Nuevo formato</button>}
            <p>Qué se evalúa: 5S, PTL y los que vengan (check de montacargas, FMS…). Cada uno con sus secciones; el % sale por sección y total.</p>
          </header>
          {!conFormatos ? (
            <p className="s5-vacio">Falta correr <b>2026-11-cinco-s-6-formatos.sql</b> en Supabase: mientras tanto solo existe 5S.</p>
          ) : (
            <ul className="s5-filas">
              {formatos.map((f) => {
                const n = puntos.filter((p) => p.activo && p.formato_id === f.id).length;
                return (
                  <li key={f.id} className={"s5-fila" + (f.activo ? "" : " inactiva")}>
                    <div>
                      <b>{f.nombre}</b>{!f.activo && <span className="s5-chip">inactivo</span>}
                      <small>{[f.descripcion, `${n} puntos`, f.meta != null ? `meta ${pct(f.meta)}` : "meta del área o la general"].filter(Boolean).join(" · ")}</small>
                      <div className="s5-zonas">
                        <span>Secciones</span>
                        {f.secciones.map((x) => (
                          puedeEditar
                            ? <button key={x.clave} type="button" className="s5-zona-chip" title="Editar sección" onClick={() => setEdit({ que: "seccion", v: { ...x, formato_id: f.id } })}><b>{x.corto}</b>&nbsp;{x.nombre}</button>
                            : <span key={x.clave} className="s5-zona-chip"><b>{x.corto}</b>&nbsp;{x.nombre}</span>
                        ))}
                        {f.secciones.length === 0 && <em>sin secciones</em>}
                        {puedeEditar && <button type="button" className="s5-link" onClick={() => setEdit({ que: "seccion", v: { formato_id: f.id } })}>+ sección</button>}
                      </div>
                    </div>
                    {puedeEditar && (
                      <div className="s5-acc">
                        <button type="button" className="s5-bt" onClick={() => { setFmtId(f.id); setTab("checklist") }}>Ver checklist</button>
                        <button type="button" className="s5-bt" onClick={() => setEdit({ que: "formato", v: { ...f, metaTxt: f.meta == null ? "" : String(f.meta) } })}>Editar</button>
                        <button type="button" className="s5-bt" disabled={ocupado} onClick={() => activar("s5_formatos", f.id, "activo", !f.activo, f.nombre)}>{f.activo ? "Desactivar" : "Activar"}</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "checklist" && (
        <section className="s5-card">
          <header>
            <h2>{fmt.nombre} · {areaPara ? `lo que se le pregunta a ${areaPara.nombre}` : "checklist general"}</h2>
            <div className="s5-acc">
              {formatos.length > 1 && (
                <label className="s5-campo" style={{ minWidth: 200 }}>
                  <span>Formato</span>
                  <select value={fmt.id} onChange={(e) => setFmtId(e.target.value)}>
                    {formatos.map((f) => <option key={f.id} value={f.id}>{f.nombre}{f.activo ? "" : " (inactivo)"}</option>)}
                  </select>
                </label>
              )}
              <label className="s5-campo" style={{ minWidth: 220 }}>
                <span>Ver</span>
                <select value={para} onChange={(e) => setPara(e.target.value)}>
                  <option value="">General (todas las áreas)</option>
                  {areas.filter((a) => a.activa).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </label>
              {puedeEditar && <button type="button" className="s5-bt osc" style={{ alignSelf: "end" }}
                onClick={() => setEdit({ que: "punto", v: { area_id: para || null, pesoTxt: "1", exige_foto: false, formato_id: fmt.id, s: fmt.secciones[0]?.clave } })}>+ Nuevo punto</button>}
            </div>
            <p>{areaPara ? `Los ${generales} generales y los propios de ${areaPara.nombre}. Un punto propio solo se le pregunta a esta área.` : "Estos puntos se le preguntan a todas las áreas. Cada punto es de una sección."}</p>
          </header>
          {fmt.secciones.map((s) => {
            const de = verPuntos.filter((p) => p.s === s.clave);
            if (!de.length) return null;
            return (
              <div key={s.clave}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 6px" }}>
                  <span className="s5-n" style={{ minWidth: 34, height: 34, fontSize: s.corto.length > 3 ? 11 : 14, padding: "0 4px" }}>{s.corto}</span>
                  <b style={{ font: "900 15px var(--s5-titulo)" }}>{s.nombre}</b>
                  <small style={{ color: "var(--s5-gris)" }}>{[s.jp, s.que].filter(Boolean).join(" · ")}</small>
                </div>
                <ul className="s5-filas">
                  {de.map((p) => (
                    <li key={p.id} className="s5-fila">
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{p.pregunta}</span>
                        {p.area_id === null && para && <span className="s5-chip">general</span>}
                        {p.area_id && !para && <span className="s5-chip area">{areas.find((a) => a.id === p.area_id)?.nombre}</span>}
                        {p.peso !== 1 && <span className="s5-chip">peso {p.peso}</span>}
                        {p.exige_foto && <span className="s5-chip foto">exige foto</span>}
                      </div>
                      {puedeEditar && (p.area_id === (para || null)) && (
                        <div className="s5-acc">
                          <button type="button" className="s5-bt" onClick={() => setEdit({ que: "punto", v: { ...p, pesoTxt: String(p.peso) } })}>Editar</button>
                          <button type="button" className="s5-bt" disabled={ocupado} onClick={() => activar("s5_puntos", p.id, "activo", false, "El punto")}>Quitar</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {verPuntos.length === 0 && <p className="s5-vacio">No hay puntos aquí todavía.</p>}
          {inactivosPara.length > 0 && (
            <details style={{ padding: "8px 16px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 13 }}>Puntos quitados ({inactivosPara.length})</summary>
              <ul className="s5-filas">
                {inactivosPara.map((p) => (
                  <li key={p.id} className="s5-fila inactiva">
                    <div><span className="s5-chip">{secc.get(p.s)?.corto ?? p.s}</span> {p.pregunta}</div>
                    {puedeEditar && <button type="button" className="s5-bt" disabled={ocupado} onClick={() => activar("s5_puntos", p.id, "activo", true, "El punto")}>Volver a poner</button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {edit && (
        <div className="s5-velo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null) }}
             onKeyDown={(e) => { if (e.key === "Escape") setEdit(null) }}>
          <form className="s5-mo" role="dialog" aria-modal="true" aria-label="Editar" onSubmit={(e) => { e.preventDefault(); guardarEdit() }}>
            <CabezaVentana ojo="5S · MAESTRO" cerrar={() => setEdit(null)}
              titulo={edit.que === "responsable" ? (edit.v.id ? "Editar responsable" : "Nuevo responsable")
                : edit.que === "area" ? (edit.v.id ? "Editar área" : "Nueva área")
                : edit.que === "formato" ? (edit.v.id ? "Editar formato" : "Nuevo formato")
                : edit.que === "seccion" ? (edit.v.clave ? "Editar sección" : "Nueva sección")
                : (edit.v.id ? "Editar punto" : `Nuevo punto · ${fmt.nombre}`)} />
            <div className="s5-mo-b">
              {edit.que === "responsable" && (<>
                <label className="s5-campo ancho"><span>Nombre</span>
                  <input autoFocus value={edit.v.nombre ?? ""} onChange={(e) => setEdit({ que: "responsable", v: { ...edit.v, nombre: e.target.value } })} /></label>
                <label className="s5-campo"><span>Cédula</span>
                  <input inputMode="numeric" value={edit.v.cedula ?? ""} onChange={(e) => setEdit({ que: "responsable", v: { ...edit.v, cedula: e.target.value.replace(/\D/g, "") } })} /></label>
                <label className="s5-campo"><span>Cargo</span>
                  <input value={edit.v.cargo ?? ""} placeholder="Supervisor, jefe de turno…" onChange={(e) => setEdit({ que: "responsable", v: { ...edit.v, cargo: e.target.value } })} /></label>
              </>)}
              {edit.que === "area" && (<>
                <label className="s5-campo ancho"><span>Nombre del área</span>
                  <input autoFocus value={edit.v.nombre ?? ""} placeholder="BODEGA 38" style={{ textTransform: "uppercase" }}
                         onChange={(e) => setEdit({ que: "area", v: { ...edit.v, nombre: e.target.value } })} /></label>
                <label className="s5-campo"><span>Responsable</span>
                  <select value={edit.v.responsable_id ?? ""} onChange={(e) => setEdit({ que: "area", v: { ...edit.v, responsable_id: e.target.value || null } })}>
                    <option value="">Sin responsable</option>
                    {responsables.filter((r) => r.activo || r.id === edit.v.responsable_id).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select></label>
                <label className="s5-campo"><span>Meta propia (%)</span>
                  <input inputMode="decimal" value={edit.v.metaTxt ?? ""} placeholder={`vacía = ${pct(meta)}`}
                         onChange={(e) => setEdit({ que: "area", v: { ...edit.v, metaTxt: e.target.value.replace(/[^0-9,.]/g, "") } })} /></label>
                <label className="s5-campo ancho"><span>Descripción (opcional)</span>
                  <input value={edit.v.descripcion ?? ""} placeholder="Calles 1 a 12, zona de casco…" onChange={(e) => setEdit({ que: "area", v: { ...edit.v, descripcion: e.target.value } })} /></label>
              </>)}
              {edit.que === "punto" && (<>
                <div className="s5-campo ancho"><span>¿De cuál sección?</span>
                  <div className="s5-s-pick" role="radiogroup" aria-label="Sección">
                    {(formatos.find((f) => f.id === edit.v.formato_id) ?? fmt).secciones.map((s) => (
                      <button key={s.clave} type="button" role="radio" aria-checked={edit.v.s === s.clave} className={edit.v.s === s.clave ? "on" : ""}
                              onClick={() => setEdit({ que: "punto", v: { ...edit.v, s: s.clave } })}><b>{s.corto}</b><span>{s.nombre}</span></button>
                    ))}
                  </div></div>
                <label className="s5-campo ancho"><span>Qué se revisa</span>
                  <textarea autoFocus rows={2} value={edit.v.pregunta ?? ""} placeholder="Los pasillos están libres y demarcados."
                            onChange={(e) => setEdit({ que: "punto", v: { ...edit.v, pregunta: e.target.value } })} /></label>
                <label className="s5-campo"><span>Para</span>
                  <select value={edit.v.area_id ?? ""} onChange={(e) => setEdit({ que: "punto", v: { ...edit.v, area_id: e.target.value || null } })}>
                    <option value="">Todas las áreas</option>
                    {areas.filter((a) => a.activa || a.id === edit.v.area_id).map((a) => <option key={a.id} value={a.id}>Solo {a.nombre}</option>)}
                  </select></label>
                <label className="s5-campo"><span>Peso</span>
                  <input inputMode="decimal" value={edit.v.pesoTxt ?? "1"} onChange={(e) => setEdit({ que: "punto", v: { ...edit.v, pesoTxt: e.target.value.replace(/[^0-9,.]/g, "") } })} /></label>
                <label className="s5-check ancho">
                  <input type="checkbox" checked={!!edit.v.exige_foto} onChange={(e) => setEdit({ que: "punto", v: { ...edit.v, exige_foto: e.target.checked } })} />
                  Exige foto cada vez que se evalúa
                </label>
              </>)}
              {edit.que === "formato" && (<>
                <label className="s5-campo ancho"><span>Nombre</span>
                  <input autoFocus value={edit.v.nombre ?? ""} placeholder="Check de montacargas"
                         onChange={(e) => setEdit({ que: "formato", v: { ...edit.v, nombre: e.target.value } })} /></label>
                <label className="s5-campo ancho"><span>Qué evalúa (opcional)</span>
                  <input value={edit.v.descripcion ?? ""} placeholder="Una línea que se ve al escogerlo en la inspección."
                         onChange={(e) => setEdit({ que: "formato", v: { ...edit.v, descripcion: e.target.value } })} /></label>
                <label className="s5-campo"><span>Meta propia (%)</span>
                  <input inputMode="decimal" value={edit.v.metaTxt ?? ""} placeholder="vacía = la del área"
                         onChange={(e) => setEdit({ que: "formato", v: { ...edit.v, metaTxt: e.target.value.replace(/[^0-9,.]/g, "") } })} /></label>
              </>)}
              {edit.que === "seccion" && (<>
                <label className="s5-campo ancho"><span>Nombre de la sección</span>
                  <input autoFocus value={edit.v.nombre ?? ""} placeholder="Ubicación"
                         onChange={(e) => setEdit({ que: "seccion", v: { ...edit.v, nombre: e.target.value } })} /></label>
                <label className="s5-campo"><span>Ficha corta (1 a 6)</span>
                  <input value={edit.v.corto ?? ""} maxLength={6} placeholder="UBI" style={{ textTransform: "uppercase" }}
                         onChange={(e) => setEdit({ que: "seccion", v: { ...edit.v, corto: e.target.value } })} /></label>
                <label className="s5-campo"><span>Qué busca (opcional)</span>
                  <input value={edit.v.que ?? ""} placeholder="Cada producto en su módulo"
                         onChange={(e) => setEdit({ que: "seccion", v: { ...edit.v, que: e.target.value } })} /></label>
              </>)}
            </div>
            <footer className="s5-mo-f">
              <button type="button" className="s5-bt" onClick={() => setEdit(null)}>Cancelar</button>
              <button type="submit" className="s5-bt osc" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
