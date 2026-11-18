"use client";

/**
 * 5S · HISTORIAL — las inspecciones guardadas: cómo va cada área y qué se encontró.
 * Arriba lo que importa del periodo (promedio contra la meta, cuántas bajo la meta, hallazgos); abajo la lista,
 * y cada inspección se abre en su sitio con el % de cada S, los hallazgos con sus fotos y todos los puntos.
 * El «Ver historial» de INOVA era un botón sin nada detrás: este es ese historial.
 */

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import {
  LAS_S, NOMBRE_S, fechaLarga, pct, semanaIso,
  type Area5S, type Inspeccion5S, type ItemInspeccion,
} from "@/modulos/cinco-s/cinco-s";

type Detalle = { items: ItemInspeccion[]; fotos: Record<string, { ruta: string; url: string }[]> } | "cargando" | { error: string };

export function Historial({ filas, areas, puedeBorrar }: { filas: Inspeccion5S[]; areas: Area5S[]; puedeBorrar: boolean }) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const [area, setArea] = useState("");
  const meses = useMemo(() => [...new Set(filas.map((f) => f.fecha.slice(0, 7)))], [filas]);
  const [mes, setMes] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [det, setDet] = useState<Record<string, Detalle>>({});
  const [borradas, setBorradas] = useState<Set<string>>(new Set());

  const vista = filas.filter((f) => !borradas.has(f.id) && (!area || f.area_id === area || (!f.area_id && f.area === area)) && (!mes || f.fecha.startsWith(mes)));
  const prom = vista.length ? vista.reduce((t, f) => t + f.cumplimiento, 0) / vista.length : null;
  const bajo = vista.filter((f) => f.cumplimiento < f.meta).length;
  const hallazgos = vista.reduce((t, f) => t + f.no_cumple, 0);
  const metaRef = vista.length ? vista.reduce((t, f) => t + f.meta, 0) / vista.length : null;
  const nomMes = (m: string) => new Date(m + "-15T12:00:00").toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  async function abrir(id: string) {
    if (abierta === id) { setAbierta(null); return }
    setAbierta(id);
    if (det[id] && det[id] !== "cargando" && !("error" in (det[id] as object))) return;
    setDet((d) => ({ ...d, [id]: "cargando" }));
    const sb = createClient();
    const [it, ft] = await Promise.all([
      sb.from("s5_inspeccion_puntos").select("*").eq("inspeccion_id", id),
      /* «*»: con el paso 3 trae `momento`. Aquí van las del antes; las del cierre se ven en el Plan de acción y el informe. */
      sb.from("s5_fotos").select("*").eq("inspeccion_id", id).order("ruta"),
    ]);
    if (it.error || ft.error) { setDet((d) => ({ ...d, [id]: { error: (it.error ?? ft.error)!.message } })); return }
    ft.data = (ft.data ?? []).filter((f) => f.momento !== "despues");
    const rutas = (ft.data ?? []).map((f) => f.ruta as string);
    const firmadas = rutas.length ? await sb.storage.from("cinco-s").createSignedUrls(rutas, 3600) : { data: [] as { path: string | null; signedUrl: string }[] };
    const url = new Map((firmadas.data ?? []).map((x) => [x.path, x.signedUrl]));
    const fotos: Record<string, { ruta: string; url: string }[]> = {};
    for (const f of ft.data ?? []) (fotos[f.item_id as string] ??= []).push({ ruta: f.ruta as string, url: url.get(f.ruta as string) ?? "" });
    const iS = (s: string) => LAS_S.findIndex((x) => x.clave === s);
    const items = ((it.data ?? []) as ItemInspeccion[]).map((x) => ({ ...x, peso: Number(x.peso) }))
      .sort((a, b) => iS(a.s) - iS(b.s) || a.orden - b.orden);
    setDet((d) => ({ ...d, [id]: { items, fotos } }));
  }

  async function borrar(f: Inspeccion5S) {
    if (!(await pedir({
      titulo: "¿Borrar esta inspección?",
      dice: <>La de <b>{f.area}</b> del {fechaLarga(f.fecha)} ({pct(f.cumplimiento)}), con sus puntos y sus {f.fotos} fotos. No se puede deshacer.</>,
      confirmar: "Borrar inspección", peligro: true,
    }))) return;
    const sb = createClient();
    const { data, error } = await sb.rpc("s5_borrar", { p_id: f.id });
    if (error) { avisar.mal(error.message); return }
    const rutas = (data ?? []) as string[];
    if (rutas.length) await sb.storage.from("cinco-s").remove(rutas);
    setBorradas((b) => new Set(b).add(f.id));
    setAbierta(null);
    avisar.bien(`Inspección de ${f.area} borrada.`);
    router.refresh();
  }

  return (
    <div className="s5">
      {avisos}{dialogo}
      <header className="s5-cab">
        <div>
          <p className="s5-ojo">5S · ORDEN Y ASEO</p>
          <h1>Historial</h1>
        </div>
        <div className="s5-filtros">
          <label className="s5-campo">
            <span>Área</span>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.activa ? "" : " (inactiva)"}</option>)}
            </select>
          </label>
          <label className="s5-campo">
            <span>Mes</span>
            <select value={mes} onChange={(e) => setMes(e.target.value)}>
              <option value="">Todos</option>
              {meses.map((m) => <option key={m} value={m}>{nomMes(m)}</option>)}
            </select>
          </label>
        </div>
      </header>

      {filas.length === 0 ? (
        <p className="s5-vacio">Todavía no hay inspecciones. Se hacen en <b>5S › Inspeccionar</b>.</p>
      ) : (
        <>
          <section className="s5-kpis" aria-label="Resumen">
            <div className={"s5-kpi" + (prom != null && metaRef != null && prom < metaRef ? " bajo" : "")}>
              <span>Promedio</span><b>{pct(prom)}</b><small>meta {pct(metaRef)}</small>
            </div>
            <div className="s5-kpi"><span>Inspecciones</span><b>{vista.length}</b><small>{area ? "de esta área" : `en ${new Set(vista.map((f) => f.area)).size} áreas`}</small></div>
            <div className={"s5-kpi" + (bajo ? " bajo" : "")}><span>Bajo la meta</span><b>{bajo}</b><small>{vista.length ? `${Math.round((100 * bajo) / vista.length)} % de las inspecciones` : "—"}</small></div>
            <div className={"s5-kpi" + (hallazgos ? " bajo" : "")}><span>Hallazgos</span><b>{hallazgos}</b><small>puntos que no cumplen</small></div>
          </section>

          <div className="s5-tabla-caja">
            <table className="s5-tabla">
              <thead>
                <tr>
                  <th>Fecha</th><th>Área</th><th>Auditor</th><th>Por S</th>
                  <th className="num">No cumple</th><th className="num">Fotos</th><th className="num">Cumplimiento</th><th className="inf">Informe</th>
                </tr>
              </thead>
              <tbody>
                {vista.length === 0 && <tr><td colSpan={8} className="s5-vacio">No hay inspecciones con ese filtro.</td></tr>}
                {vista.map((f) => {
                  const d = det[f.id];
                  return (
                    <Fragment key={f.id}>
                      <tr className={"fila" + (abierta === f.id ? " abierta" : "")} onClick={() => abrir(f.id)}
                          tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(f.id) } }}
                          aria-expanded={abierta === f.id}>
                        <td className="fecha"><b>{fechaLarga(f.fecha)}</b><small>S{semanaIso(f.fecha)}</small></td>
                        <td><b>{f.area}</b>{f.responsable && <small style={{ display: "block", color: "var(--s5-gris)" }}>{f.responsable}</small>}</td>
                        <td>{f.auditor_nombre ?? "—"}</td>
                        <td>
                          <span className="s5-mini" title={LAS_S.map((s) => `${s.n}S ${s.nombre}: ${pct(f.por_s[s.clave])}`).join(" · ")}>
                            {LAS_S.map((s) => {
                              const v = f.por_s[s.clave];
                              return <i key={s.clave} className={v == null ? "nada" : v < f.meta ? "bajo" : ""} style={v == null ? undefined : { height: `${Math.max(8, v)}%` }} />;
                            })}
                          </span>
                        </td>
                        <td className={"num" + (f.no_cumple ? " nc" : "")}>{f.no_cumple}</td>
                        <td className="num">{f.fotos}</td>
                        <td className={"num pct" + (f.cumplimiento < f.meta ? " bajo" : "")}>{pct(f.cumplimiento)}</td>
                        {/* EL OJITO: ver el informe de esa inspección; la flecha: bajarlo en PDF. Sin abrir la fila. */}
                        <td className="inf" onClick={(e) => e.stopPropagation()}>
                          <Link className="s5-ico" href={`/5s/informe/${f.id}`} title="Ver el informe" aria-label={`Ver el informe de ${f.area} del ${fechaLarga(f.fecha)}`}>
                            <svg viewBox="0 0 24 24" aria-hidden><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                          </Link>
                          <Link className="s5-ico osc" href={`/5s/informe/${f.id}?pdf=1`} title="Descargar en PDF" aria-label={`Descargar en PDF el informe de ${f.area} del ${fechaLarga(f.fecha)}`}>
                            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                          </Link>
                        </td>
                      </tr>
                      {abierta === f.id && (
                        <tr><td colSpan={8} style={{ padding: 0 }}>
                          <div className="s5-det">
                            {d === "cargando" || !d ? <p className="s5-sub">Abriendo la inspección…</p>
                              : "error" in d ? <p className="s5-aviso mal">No se pudo abrir: {d.error}</p>
                              : <DetalleInsp f={f} items={d.items} fotos={d.fotos} puedeBorrar={puedeBorrar} borrar={() => borrar(f)} />}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function DetalleInsp({ f, items, fotos, puedeBorrar, borrar }: {
  f: Inspeccion5S; items: ItemInspeccion[]; fotos: Record<string, { ruta: string; url: string }[]>; puedeBorrar: boolean; borrar: () => void;
}) {
  const ordenSev = { alta: 0, media: 1, baja: 2 } as const;
  const malos = items.filter((i) => i.resultado === "no_cumple").sort((a, b) => ordenSev[a.severidad ?? "media"] - ordenSev[b.severidad ?? "media"]);
  const notas = items.filter((i) => i.resultado !== "no_cumple" && (i.observacion || fotos[i.id]?.length));
  const n = (i: ItemInspeccion) => items.indexOf(i) + 1;
  return (
    <>
      <div className="s5-det-top">
        <div>
          <h3>Cumplimiento por S</h3>
          <ul className="s5-det-s">
            {LAS_S.map((s) => {
              const v = f.por_s[s.clave];
              if (v === undefined) return null;
              return (
                <li key={s.clave}>
                  <span>{s.n}S {s.nombre}</span>
                  <div aria-hidden><i style={{ width: `${v ?? 0}%` }} className={v != null && v < f.meta ? "bajo" : ""} /></div>
                  <b>{pct(v)}</b>
                </li>
              );
            })}
          </ul>
        </div>
        <dl className="s5-det-meta">
          <dt>Responsable</dt><dd>{f.responsable ?? "Sin asignar"}</dd>
          <dt>Auditor</dt><dd>{f.auditor_nombre ?? "—"}</dd>
          <dt>Evaluados</dt><dd>{f.evaluados} de {items.length} puntos</dd>
          <dt>Meta</dt><dd>{pct(f.meta)}</dd>
          {f.nota && <><dt>Nota</dt><dd style={{ fontWeight: 500 }}>{f.nota}</dd></>}
        </dl>
      </div>

      <h3 style={{ marginTop: 18 }}>{malos.length ? `Hallazgos (${malos.length})` : "Sin hallazgos: todo lo evaluado cumple"}</h3>
      {(malos.length > 0 || notas.length > 0) && (
        <ul className="s5-hallazgos">
          {[...malos, ...notas].map((i) => (
            <li key={i.id} className={"s5-hz" + (i.resultado === "no_cumple" ? "" : " ok")}>
              <span className={"s5-hz-sev " + (i.resultado === "no_cumple" ? i.severidad ?? "media" : "nota")}>
                {i.resultado === "no_cumple" ? i.severidad ?? "media" : i.resultado === "cumple" ? "cumple" : "n/a"}
              </span>
              <div>
                <b><em>{NOMBRE_S[i.s]?.n}S · #{n(i)}{i.zona ? ` · ${i.zona}` : ""}</em>{i.pregunta}</b>
                {i.observacion && <p>{i.observacion}</p>}
                {fotos[i.id]?.length ? (
                  <div className="s5-fotos">
                    {fotos[i.id].map((ft) => (
                      <a key={ft.ruta} href={ft.url} target="_blank" rel="noreferrer" aria-label="Abrir foto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ft.url} alt={"Foto: " + i.pregunta} loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="s5-todos">
        <summary>Todos los puntos ({items.length})</summary>
        <ol>
          {items.map((i) => (
            <li key={i.id}>{i.pregunta}<span className={i.resultado}>{i.resultado === "cumple" ? "Cumple" : i.resultado === "no_cumple" ? "No cumple" : "N/A"}</span></li>
          ))}
        </ol>
      </details>

      <div className="s5-det-pie">
        <p>Guardada el {new Date(f.creado).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</p>
        <span className="s5-acc">
          <Link className="s5-bt" href={`/5s/informe/${f.id}`}>Ver informe</Link>
          <Link className="s5-bt osc" href={`/5s/informe/${f.id}?pdf=1`}>Informe PDF</Link>
          {puedeBorrar && <button type="button" className="s5-bt peligro" onClick={borrar}>Borrar inspección</button>}
        </span>
      </div>
    </>
  );
}
