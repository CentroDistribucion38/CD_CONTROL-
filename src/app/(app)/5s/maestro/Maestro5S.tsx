"use client";

/**
 * 5S · MAESTRO — lo que hay que tener listo antes de auditar, en el orden en que se arma:
 *   1. Responsables (los dueños de las áreas)  →  2. Áreas (con su responsable y, si quiere, su meta)  →  3. Checklist.
 * El checklist tiene puntos GENERALES (valen para todas las áreas) y puntos PROPIOS de un área. Al escoger un área se ve
 * exactamente lo que se le va a preguntar: los generales y los suyos.
 * Nada se borra: se desactiva. Las inspecciones viejas guardan su copia de cada pregunta, así que cambiar o quitar un
 * punto no cambia lo que ya se auditó.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import {
  LAS_S, NOMBRE_S, checklistDe, pct,
  type Area5S, type ClaveS, type Punto5S, type Responsable5S,
} from "@/modulos/cinco-s/cinco-s";

type Tab = "responsables" | "areas" | "checklist";
type Edit =
  | { que: "responsable"; v: Partial<Responsable5S> }
  | { que: "area"; v: Partial<Area5S> & { metaTxt?: string } }
  | { que: "punto"; v: Partial<Punto5S> & { pesoTxt?: string } };

export function Maestro5S({ meta, areas, responsables, puntos, puedeEditar }: {
  meta: number; areas: Area5S[]; responsables: Responsable5S[]; puntos: Punto5S[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [tab, setTab] = useState<Tab>(areas.length ? "checklist" : responsables.length ? "areas" : "responsables");
  const [para, setPara] = useState<string>("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [metaTxt, setMetaTxt] = useState(String(meta));
  const [ocupado, setOcupado] = useState(false);

  const nomResp = (id: string | null) => responsables.find((r) => r.id === id)?.nombre ?? null;
  const propios = (areaId: string) => puntos.filter((p) => p.activo && p.area_id === areaId).length;
  const generales = puntos.filter((p) => p.activo && p.area_id === null).length;

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
    } else {
      const v = edit.v;
      const peso = Number((v.pesoTxt ?? "1").replace(",", "."));
      const fila = { s: v.s as ClaveS, pregunta: (v.pregunta ?? "").trim(), area_id: v.area_id || null, peso, exige_foto: !!v.exige_foto };
      if (!fila.s) { avisar.mal("Escoge a cuál S pertenece."); return }
      if (!fila.pregunta) { avisar.mal("Escribe el punto a revisar."); return }
      if (!(peso > 0 && peso <= 100)) { avisar.mal("El peso va de 0,1 a 100."); return }
      const orden = v.id ? v.orden : Math.max(0, ...puntos.filter((p) => p.s === fila.s).map((p) => p.orden)) + 1;
      await correr(() => v.id ? sb.from("s5_puntos").update(fila).eq("id", v.id) : sb.from("s5_puntos").insert({ ...fila, orden }),
        v.id ? "Punto actualizado." : `Punto agregado a la ${NOMBRE_S[fila.s].n}S.`);
    }
  }

  async function activar(tabla: "s5_responsables" | "s5_areas" | "s5_puntos", id: string, campo: "activo" | "activa", valor: boolean, que: string) {
    const sb = createClient();
    await correr(() => sb.from(tabla).update({ [campo]: valor }).eq("id", id), valor ? `${que}: activo otra vez.` : `${que}: desactivado.`);
  }

  async function guardarMeta() {
    const n = Number(metaTxt.replace(",", "."));
    if (!(n >= 1 && n <= 100)) { avisar.mal("La meta va de 1 a 100 %."); return }
    const sb = createClient();
    await correr(() => sb.from("s5_reglas").update({ meta: n, actualizado: new Date().toISOString() }).eq("id", 1), `Meta general: ${pct(n)}.`);
  }

  const areaPara = areas.find((a) => a.id === para) ?? null;
  const verPuntos = para ? checklistDe(puntos, para) : puntos.filter((p) => p.area_id === null).sort((a, b) => a.orden - b.orden);
  const inactivosPara = puntos.filter((p) => !p.activo && (para ? p.area_id === para : p.area_id === null));

  return (
    <div className="s5">
      {avisos}
      <header className="s5-cab">
        <div>
          <p className="s5-ojo">5S · ORDEN Y ASEO</p>
          <h1>Maestro</h1>
          <p className="s5-sub">Primero los responsables, después las áreas con su responsable y al final el checklist.</p>
        </div>
      </header>

      <nav className="s5-tabs" aria-label="Partes del maestro">
        <button type="button" className={tab === "responsables" ? "on" : ""} onClick={() => setTab("responsables")}>1 · Responsables<i>{responsables.filter((r) => r.activo).length}</i></button>
        <button type="button" className={tab === "areas" ? "on" : ""} onClick={() => setTab("areas")}>2 · Áreas<i>{areas.filter((a) => a.activa).length}</i></button>
        <button type="button" className={tab === "checklist" ? "on" : ""} onClick={() => setTab("checklist")}>3 · Checklist<i>{puntos.filter((p) => p.activo).length}</i></button>
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

      {tab === "checklist" && (
        <section className="s5-card">
          <header>
            <h2>{areaPara ? `Lo que se le pregunta a ${areaPara.nombre}` : "Checklist general"}</h2>
            <div className="s5-acc">
              <label className="s5-campo" style={{ minWidth: 220 }}>
                <span>Ver</span>
                <select value={para} onChange={(e) => setPara(e.target.value)}>
                  <option value="">General (todas las áreas)</option>
                  {areas.filter((a) => a.activa).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </label>
              {puedeEditar && <button type="button" className="s5-bt osc" style={{ alignSelf: "end" }}
                onClick={() => setEdit({ que: "punto", v: { area_id: para || null, pesoTxt: "1", exige_foto: false } })}>+ Nuevo punto</button>}
            </div>
            <p>{areaPara ? `Los ${generales} generales y los propios de ${areaPara.nombre}. Un punto propio solo se le pregunta a esta área.` : "Estos puntos se le preguntan a todas las áreas. Cada punto es de una S."}</p>
          </header>
          {LAS_S.map((s) => {
            const de = verPuntos.filter((p) => p.s === s.clave);
            if (!de.length) return null;
            return (
              <div key={s.clave}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 6px" }}>
                  <span className="s5-n" style={{ width: 34, height: 34, fontSize: 14 }}>{s.n}S</span>
                  <b style={{ font: "900 15px var(--s5-titulo)" }}>{s.nombre}</b>
                  <small style={{ color: "var(--s5-gris)" }}>{s.jp} · {s.que}</small>
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
                    <div><span className="s5-chip">{NOMBRE_S[p.s].n}S</span> {p.pregunta}</div>
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
            <header>
              <div>
                <p>5S · MAESTRO</p>
                <h3>{edit.que === "responsable" ? (edit.v.id ? "Editar responsable" : "Nuevo responsable")
                  : edit.que === "area" ? (edit.v.id ? "Editar área" : "Nueva área")
                  : (edit.v.id ? "Editar punto" : "Nuevo punto del checklist")}</h3>
              </div>
              <button type="button" className="s5-x" aria-label="Cerrar" onClick={() => setEdit(null)}>×</button>
            </header>
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
                <div className="s5-campo ancho"><span>¿De cuál S?</span>
                  <div className="s5-s-pick" role="radiogroup" aria-label="S">
                    {LAS_S.map((s) => (
                      <button key={s.clave} type="button" role="radio" aria-checked={edit.v.s === s.clave} className={edit.v.s === s.clave ? "on" : ""}
                              onClick={() => setEdit({ que: "punto", v: { ...edit.v, s: s.clave } })}><b>{s.n}S</b><span>{s.nombre}</span></button>
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
