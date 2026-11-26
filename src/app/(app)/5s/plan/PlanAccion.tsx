"use client";

/**
 * 5S · PLAN DE ACCIÓN — que cada hallazgo se cierre.
 *
 * Un «no cumple» escrito en un informe y nada más no arregla el área. Aquí cada hallazgo:
 *   · recibe su plan: qué se va a hacer, quién (de los responsables 5S) y para cuándo;
 *   · se cierra con lo que se hizo y la FOTO DEL DESPUÉS (la base no deja cerrar sin foto);
 *   · si se cerró por error, se reabre.
 * El estado no se escribe: lo calcula la base (sin plan, en curso, vencido, cerrado). Lo vencido va primero.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { sellar, type Foto } from "@/lib/evidencia";
import {
  ESTADOS_H, NOMBRE_S, fechaLarga, hoyCo,
  type Area5S, type EstadoHallazgo, type Hallazgo5S, type Responsable5S,
} from "@/modulos/cinco-s/cinco-s";
import { CabezaVentana } from "../CabezaVentana";

import { CampoFecha } from "@/components/CampoFecha";
export type FotosH = Record<string, { antes: string[]; despues: string[] }>;

const ORDEN: Record<EstadoHallazgo, number> = { vencida: 0, sin_plan: 1, abierta: 2, cerrada: 3 };
const SEV: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const mas = (f: string, n: number) => new Date(new Date(f + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
const entre = (a: string, b: string) => Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 864e5);
const corta = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });

type Vista = "pendientes" | "cerrados" | "todos";
type FormPlan = { h: Hallazgo5S; accion: string; resp: string; fecha: string };
type FormCierre = { h: Hallazgo5S; nota: string; fotos: (Foto & { k: number })[] };

export function PlanAccion({ filas, areas, responsables, fotos, puedeEditar }: {
  filas: Hallazgo5S[]; areas: Area5S[]; responsables: Responsable5S[]; fotos: FotosH; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const [vista, setVista] = useState<Vista>("pendientes");
  const [area, setArea] = useState("");
  const [quien, setQuien] = useState("");
  const [plan, setPlan] = useState<FormPlan | null>(null);
  const [cierre, setCierre] = useState<FormCierre | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const contador = useRef(1);
  const hoy = hoyCo();

  const delArea = filas.filter((h) => (!area || h.area_id === area) && (!quien || h.accion_resp_id === quien));
  const cuenta = (e: EstadoHallazgo) => delArea.filter((h) => h.estado === e).length;
  const cerrados = delArea.filter((h) => h.estado === "cerrada");
  const aTiempo = cerrados.filter((h) => !h.accion_fecha || (h.cerrada_el ?? "").slice(0, 10) <= h.accion_fecha).length;
  const lista = useMemo(() => delArea
    .filter((h) => vista === "todos" || (vista === "cerrados" ? h.estado === "cerrada" : h.estado !== "cerrada"))
    .sort((a, b) => vista === "cerrados"
      ? (b.cerrada_el ?? "").localeCompare(a.cerrada_el ?? "")
      : ORDEN[a.estado] - ORDEN[b.estado] || (SEV[a.severidad ?? "media"] - SEV[b.severidad ?? "media"])
        || (a.accion_fecha ?? "9").localeCompare(b.accion_fecha ?? "9") || a.fecha.localeCompare(b.fecha)),
  [delArea, vista]);
  const pendientes = delArea.length - cerrados.length;
  const conPlan = responsables.filter((r) => filas.some((h) => h.accion_resp_id === r.id));

  /* ---------------- plan ---------------- */
  function abrirPlan(h: Hallazgo5S) {
    const dueno = areas.find((a) => a.id === h.area_id)?.responsable_id ?? "";
    setPlan({ h, accion: h.accion ?? "", resp: h.accion_resp_id ?? dueno, fecha: h.accion_fecha ?? mas(hoy, h.severidad === "alta" ? 2 : 7) });
  }
  async function guardarPlan() {
    if (!plan) return;
    if (!plan.accion.trim()) { avisar.mal("Escribe qué se va a hacer."); return }
    if (!plan.resp) { avisar.mal("Escoge quién lo hace."); return }
    if (!plan.fecha) { avisar.mal("Escoge la fecha compromiso."); return }
    setOcupado(true);
    const { error } = await createClient().rpc("s5_plan", { p_item: plan.h.id, p_accion: plan.accion.trim(), p_resp: plan.resp, p_fecha: plan.fecha });
    setOcupado(false);
    if (error) { avisar.mal(/s5_plan|schema cache/i.test(error.message) ? "Falta correr 2026-11-cinco-s-3.sql en Supabase." : error.message); return }
    avisar.bien(`Plan asignado a ${responsables.find((r) => r.id === plan.resp)?.nombre ?? "su responsable"} para el ${corta(plan.fecha)}.`);
    setPlan(null);
    router.refresh();
  }

  /* ---------------- cierre ---------------- */
  async function tomarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]; e.target.value = "";
    if (!archivo || !cierre) return;
    try {
      const f = await sellar(archivo, { titulo: `${cierre.h.area} · CIERRE`.toUpperCase(), ubi: null, direccion: "", etiqueta: "5S" });
      setCierre((c) => c && { ...c, fotos: [...c.fotos, { ...f, k: contador.current++ }] });
    } catch (err) {
      avisar.mal(err instanceof Error ? err.message : "No se pudo procesar esa foto.");
    }
  }
  function soltarCierre() {
    for (const f of cierre?.fotos ?? []) URL.revokeObjectURL(f.url);
    setCierre(null);
  }
  async function cerrar() {
    if (!cierre) return;
    if (cierre.fotos.length === 0) { avisar.mal("Toma la foto del después: sin ella no se puede cerrar."); return }
    if (!cierre.nota.trim()) { avisar.mal("Escribe qué se hizo."); return }
    setOcupado(true);
    const sb = createClient();
    const sello = Date.now();
    const subidas: { ruta: string; bytes: number }[] = [];
    for (const [i, f] of cierre.fotos.entries()) {
      const ruta = `${cierre.h.inspeccion_id}/cierre-${cierre.h.id}-${sello}-${i + 1}.jpg`;
      const { error } = await sb.storage.from("cinco-s").upload(ruta, f.blob, { contentType: "image/jpeg" });
      if (error) {
        if (subidas.length) await sb.storage.from("cinco-s").remove(subidas.map((x) => x.ruta));
        setOcupado(false);
        avisar.mal(`No subió la foto: ${error.message}. No se cerró nada; vuelve a intentar.`);
        return;
      }
      subidas.push({ ruta, bytes: f.blob.size });
    }
    const { error } = await sb.rpc("s5_cerrar", { p_item: cierre.h.id, p_nota: cierre.nota.trim(), p_fotos: subidas });
    setOcupado(false);
    if (error) {
      await sb.storage.from("cinco-s").remove(subidas.map((x) => x.ruta));
      avisar.mal(error.message);
      return;
    }
    avisar.bien(`Hallazgo de ${cierre.h.area} cerrado.`);
    soltarCierre();
    router.refresh();
  }
  async function reabrir(h: Hallazgo5S) {
    if (!(await pedir({
      titulo: "¿Reabrir este hallazgo?",
      dice: <>Vuelve a quedar pendiente y se quitan <b>sus fotos del después</b> y lo que se escribió al cerrarlo. El plan se conserva.</>,
      confirmar: "Reabrir", peligro: true,
    }))) return;
    const sb = createClient();
    const { data, error } = await sb.rpc("s5_reabrir", { p_item: h.id });
    if (error) { avisar.mal(error.message); return }
    const rutas = (data ?? []) as string[];
    if (rutas.length) await sb.storage.from("cinco-s").remove(rutas);
    avisar.bien("Hallazgo reabierto.");
    router.refresh();
  }

  const plazo = (h: Hallazgo5S) => {
    if (!h.accion_fecha) return null;
    if (h.estado === "cerrada") {
      const d = entre(h.accion_fecha, (h.cerrada_el ?? "").slice(0, 10));
      return d <= 0 ? <span className="ok">a tiempo</span> : <span className="mal">{d} {d === 1 ? "día" : "días"} tarde</span>;
    }
    const d = entre(hoy, h.accion_fecha);
    if (d < 0) return <span className="mal">venció hace {-d} {d === -1 ? "día" : "días"}</span>;
    if (d === 0) return <span className="mal">vence hoy</span>;
    return <span>{d === 1 ? "vence mañana" : `faltan ${d} días`}</span>;
  };

  return (
    <div className="s5">
      {avisos}{dialogo}
      <header className="s5-cab">
        <div>
          <p className="s5-ojo">5S · ORDEN Y ASEO</p>
          <h1>Plan de acción</h1>
        </div>
        <div className="s5-filtros">
          <label className="s5-campo"><span>Área</span>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.activa ? "" : " (inactiva)"}</option>)}
            </select></label>
          <label className="s5-campo"><span>Responsable del plan</span>
            <select value={quien} onChange={(e) => setQuien(e.target.value)}>
              <option value="">Todos</option>
              {conPlan.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select></label>
        </div>
      </header>

      {filas.length === 0 ? (
        <p className="s5-vacio">No hay hallazgos todavía. Cada <b>no cumple</b> de una inspección aparece aquí para asignarle su plan y cerrarlo con foto.</p>
      ) : (<>
        <section className="s5-kpis" aria-label="Resumen">
          <div className={"s5-kpi" + (cuenta("vencida") ? " bajo" : "")}><span>Vencidos</span><b>{cuenta("vencida")}</b><small>pasó la fecha compromiso</small></div>
          <div className={"s5-kpi" + (cuenta("sin_plan") ? " bajo" : "")}><span>Sin plan</span><b>{cuenta("sin_plan")}</b><small>nadie asignado todavía</small></div>
          <div className="s5-kpi"><span>En curso</span><b>{cuenta("abierta")}</b><small>con plan y a tiempo</small></div>
          <div className="s5-kpi"><span>Cerrados</span><b>{cerrados.length}</b><small>{cerrados.length ? `${Math.round((100 * aTiempo) / cerrados.length)} % a tiempo` : "—"}</small></div>
        </section>

        <div className="s5-seg" role="tablist" aria-label="Qué ver">
          {([["pendientes", `Pendientes · ${pendientes}`], ["cerrados", `Cerrados · ${cerrados.length}`], ["todos", `Todos · ${delArea.length}`]] as [Vista, string][])
            .map(([v, t]) => <button key={v} type="button" role="tab" aria-selected={vista === v} className={vista === v ? "on" : ""} onClick={() => setVista(v)}>{t}</button>)}
        </div>

        {lista.length === 0 ? (
          <p className="s5-vacio">{vista === "pendientes" ? "Nada pendiente con ese filtro: todo está cerrado." : "No hay hallazgos con ese filtro."}</p>
        ) : (
          <ul className="s5-hal">
            {lista.map((h) => {
              const ns = NOMBRE_S[h.s];
              const ft = fotos[h.id] ?? { antes: [], despues: [] };
              return (
                <li key={h.id} className={"est-" + h.estado}>
                  <a className="foto" href={ft.antes[0]} target="_blank" rel="noreferrer" aria-label="Ver la foto del hallazgo"
                     style={ft.antes[0] ? { backgroundImage: `url("${ft.antes[0]}")` } : undefined} onClick={(e) => { if (!ft.antes[0]) e.preventDefault() }}>
                    {!ft.antes[0] && <span>Sin foto</span>}
                    <i>Antes</i>
                  </a>
                  <div className="que">
                    <p className="meta">
                      <span className={"s5-chip est est-" + h.estado}>{ESTADOS_H[h.estado]}</span>
                      <b>{h.area}</b>{h.zona && <> · {h.zona}</>} · {ns.n}S {ns.nombre}
                      {h.severidad && <span className={"s5-chip sev-" + h.severidad}>{h.severidad}</span>}
                    </p>
                    <h3>{h.observacion ?? h.pregunta}</h3>
                    <p className="preg">{h.pregunta}</p>
                    <p className="ins">Inspección del {fechaLarga(h.fecha)} · {h.estado === "cerrada" ? `se cerró en ${h.dias} ${h.dias === 1 ? "día" : "días"}` : `abierto hace ${h.dias} ${h.dias === 1 ? "día" : "días"}`} · <Link href={`/5s/informe/${h.inspeccion_id}`}>Ver informe</Link></p>
                  </div>
                  <div className="plan">
                    {h.accion ? (<>
                      <span className="rot">Acción</span>
                      <p className="acc">{h.accion}</p>
                      <p className="quien"><b>{h.accion_resp}</b> · para el {corta(h.accion_fecha!)} · {plazo(h)}</p>
                    </>) : <p className="sin">Sin plan: falta decir qué se hace, quién y para cuándo.</p>}
                    {h.estado === "cerrada" && (
                      <div className="cierre">
                        {ft.despues[0] && <a className="foto chica" href={ft.despues[0]} target="_blank" rel="noreferrer" aria-label="Ver la foto del después"
                          style={{ backgroundImage: `url("${ft.despues[0]}")` }}><i>Después</i></a>}
                        <div><span className="rot">Cerrado el {fechaLarga(h.cerrada_el!.slice(0, 10))}{h.cerrada_por ? ` · ${h.cerrada_por}` : ""}</span><p>{h.cierre_nota}</p></div>
                      </div>
                    )}
                  </div>
                  {puedeEditar && (
                    <div className="bts">
                      {h.estado === "cerrada"
                        ? <button type="button" className="s5-bt" onClick={() => reabrir(h)}>Reabrir</button>
                        : (<>
                          <button type="button" className={"s5-bt" + (h.accion ? "" : " osc")} onClick={() => abrirPlan(h)}>{h.accion ? "Cambiar plan" : "Asignar plan"}</button>
                          <button type="button" className={"s5-bt" + (h.accion ? " osc" : "")} onClick={() => setCierre({ h, nota: "", fotos: [] })}>
                            <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>Cerrar con foto
                          </button>
                        </>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </>)}

      {plan && (
        <div className="s5-velo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPlan(null) }}
             onKeyDown={(e) => { if (e.key === "Escape") setPlan(null) }}>
          <form className="s5-mo" role="dialog" aria-modal="true" aria-label="Plan de acción" onSubmit={(e) => { e.preventDefault(); guardarPlan() }}>
            <CabezaVentana ojo={`5S · PLAN DE ACCIÓN · ${plan.h.area}`} titulo={plan.h.accion ? "Cambiar el plan" : "Asignar plan"} cerrar={() => setPlan(null)} />
            <Hallazgo h={plan.h} foto={fotos[plan.h.id]?.antes[0]} />
            <fieldset className="s5-mo-b" style={{ border: 0 }}>
              <label className="s5-campo ancho"><span>¿Qué se va a hacer?</span>
                <textarea value={plan.accion} maxLength={300} autoFocus placeholder="Retirar las estibas de envase y dejar libre el extintor de la calle 3"
                          onChange={(e) => setPlan({ ...plan, accion: e.target.value })} /></label>
              <label className="s5-campo"><span>¿Quién lo hace?</span>
                <select value={plan.resp} onChange={(e) => setPlan({ ...plan, resp: e.target.value })}>
                  <option value="">Escoger…</option>
                  {responsables.filter((r) => r.activo || r.id === plan.resp).map((r) => <option key={r.id} value={r.id}>{r.nombre}{r.cargo ? ` · ${r.cargo}` : ""}</option>)}
                </select></label>
              <label className="s5-campo"><span>Fecha compromiso</span>
                <CampoFecha value={plan.fecha} min={plan.h.fecha} onChange={(e) => setPlan({ ...plan, fecha: e.target.value })} /></label>
              <div className="s5-campo ancho"><span>Atajos</span>
                <div className="s5-seg" role="group" aria-label="Plazo">
                  {[["Hoy", 0], ["Mañana", 1], ["3 días", 3], ["1 semana", 7], ["2 semanas", 14]].map(([t, n]) => (
                    <button key={t} type="button" className={plan.fecha === mas(hoy, n as number) ? "on" : ""} onClick={() => setPlan({ ...plan, fecha: mas(hoy, n as number) })}>{t}</button>
                  ))}
                </div></div>
            </fieldset>
            <footer className="s5-mo-f">
              <button type="button" className="s5-bt" onClick={() => setPlan(null)}>Cancelar</button>
              <button type="submit" className="s5-bt osc" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar plan"}</button>
            </footer>
          </form>
        </div>
      )}

      {cierre && (
        <div className="s5-velo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) soltarCierre() }}
             onKeyDown={(e) => { if (e.key === "Escape" && !ocupado) soltarCierre() }}>
          <form className="s5-mo" role="dialog" aria-modal="true" aria-label="Cerrar hallazgo" onSubmit={(e) => { e.preventDefault(); cerrar() }}>
            <CabezaVentana ojo={`5S · CERRAR HALLAZGO · ${cierre.h.area}`} titulo="Cerrar con foto del después" cerrar={() => { if (!ocupado) soltarCierre() }} />
            <Hallazgo h={cierre.h} foto={fotos[cierre.h.id]?.antes[0]} />
            <fieldset className="s5-mo-b" style={{ border: 0 }} disabled={ocupado}>
              <div className="s5-campo ancho"><span>Foto del después (obligatoria)</span>
                <div className="s5-despues">
                  {cierre.fotos.map((f) => (
                    <figure key={f.k}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt="Foto del después" />
                      <button type="button" aria-label="Quitar esta foto" onClick={() => {
                        URL.revokeObjectURL(f.url);
                        setCierre((c) => c && { ...c, fotos: c.fotos.filter((y) => y.k !== f.k) });
                      }}>×</button>
                    </figure>
                  ))}
                  <button type="button" className={"tomar" + (cierre.fotos.length ? "" : " falta")} onClick={() => camara.current?.click()}>
                    <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                    {cierre.fotos.length ? "Otra foto" : "Tomar foto"}
                  </button>
                </div></div>
              <label className="s5-campo ancho"><span>¿Qué se hizo?</span>
                <textarea value={cierre.nota} maxLength={300} placeholder="Se retiraron las estibas y se demarcó el área del extintor"
                          onChange={(e) => setCierre({ ...cierre, nota: e.target.value })} /></label>
            </fieldset>
            <footer className="s5-mo-f">
              <button type="button" className="s5-bt" disabled={ocupado} onClick={soltarCierre}>Cancelar</button>
              <button type="submit" className="s5-bt osc" disabled={ocupado}>{ocupado ? "Cerrando…" : "Cerrar hallazgo"}</button>
            </footer>
          </form>
        </div>
      )}
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={tomarFoto} />
    </div>
  );
}

/** El hallazgo de la ventana, arriba y en grande: la foto del antes, qué se encontró, dónde y cuándo. */
function Hallazgo({ h, foto }: { h: Hallazgo5S; foto?: string }) {
  const ns = NOMBRE_S[h.s];
  return (
    <div className="s5-mo-hal">
      {foto ? <a href={foto} target="_blank" rel="noreferrer" style={{ backgroundImage: `url("${foto}")` }} aria-label="Ver la foto del antes" /> : <span className="nofoto">Sin foto</span>}
      <div>
        <span>{ns.n}S {ns.nombre}{h.zona ? ` · ${h.zona}` : ""}{h.severidad ? ` · severidad ${h.severidad}` : ""}</span>
        <b>{h.observacion ?? h.pregunta}</b>
        <small>Inspección del {fechaLarga(h.fecha)}</small>
      </div>
    </div>
  );
}
