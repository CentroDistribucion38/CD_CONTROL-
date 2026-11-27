"use client";

/**
 * 5S · INSPECCIONAR — la auditoría de un área, punto por punto, con el marcador en vivo.
 *
 * Lo que cambia frente al de INOVA (y por qué):
 *   · CADA PUNTO SE RESPONDE. Allá todo arrancaba en N/A, y un punto que nadie miró contaba como «no aplica»: el
 *     porcentaje salía bueno sin haber revisado. Aquí arranca vacío y no se guarda hasta que esté todo.
 *   · EL PUNTO ES DE UNA S. El marcador da el % de cada S: «la 3S (Limpiar) está en 60 %» dice qué hacer;
 *     «82 %» a secas no.
 *   · NO CUMPLE PIDE QUÉ SE ENCONTRÓ (y su severidad). Un hallazgo sin descripción no se puede cerrar.
 *   · LA FOTO SE TOMA CON LA CÁMARA y queda sellada con fecha y hora; sube al almacenamiento, no a la base.
 *   · EL AUDITOR sale como quien entró y el responsable sale del área; tocando cualquiera de los dos se abre la
 *     lista para escoger otra persona (la de responsables de 5S).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { sellar, type Foto } from "@/lib/evidencia";
import {
  FORMATO_5S, SEVERIDADES, checklistDe, cumplimiento, pct, semanaIso, hoyCo,
  type Area5S, type Formato5S, type Punto5S, type Zona5S, type Responsable5S, type Resultado, type Severidad,
} from "@/modulos/cinco-s/cinco-s";

import { CampoFecha } from "@/components/CampoFecha";
type Resp = { resultado: Resultado | null; severidad: Severidad; observacion: string; conNota: boolean; zona: string; fotos: (Foto & { k: number })[] };
const VACIA: Resp = { resultado: null, severidad: "media", observacion: "", conNota: false, zona: "", fotos: [] };
const RECORDAR = "s5-area";
const RECORDAR_F = "s5-formato";

export function Inspeccionar({ areas, responsables, puntos, zonas = [], formatos = [FORMATO_5S], metaGeneral, auditor, puedeEditar }: {
  areas: Area5S[]; responsables: Responsable5S[]; puntos: Punto5S[]; zonas?: Zona5S[]; formatos?: Formato5S[]; metaGeneral: number; auditor: string; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const activas = areas.filter((a) => a.activa);
  const [areaId, setAreaId] = useState<string>("");
  /* QUÉ SE EVALÚA: 5S, PTL… (se escoge arriba; cada formato trae su checklist y sus secciones). */
  const formatosAct = formatos.filter((f) => f.activo);
  const [formatoId, setFormatoId] = useState<string>(formatosAct[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoyCo());
  const [nota, setNota] = useState("");
  const [resp, setResp] = useState<Record<string, Resp>>({});
  const [guardando, setGuardando] = useState(false);
  const [hecha, setHecha] = useState<{ id: string; area: string; pct: number; meta: number } | null>(null);
  const [verFaltas, setVerFaltas] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const fotoPara = useRef<string | null>(null);
  const contador = useRef(1);

  /* EL ÁREA DE LA ÚLTIMA VEZ: quien audita casi siempre vuelve a la misma. */
  useEffect(() => {
    let a = "";
    try { a = localStorage.getItem(RECORDAR) ?? "" } catch { /* sin almacenamiento */ }
    setAreaId(activas.some((x) => x.id === a) ? a : activas[0]?.id ?? "");
    let fm = "";
    try { fm = localStorage.getItem(RECORDAR_F) ?? "" } catch { /* sin almacenamiento */ }
    if (formatosAct.some((x) => x.id === fm)) setFormatoId(fm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const area = activas.find((a) => a.id === areaId) ?? null;
  const formato = formatosAct.find((f) => f.id === formatoId) ?? formatosAct[0] ?? FORMATO_5S;
  const meta = area?.meta ?? formato.meta ?? metaGeneral;
  /* EL RESPONSABLE: se ve el del área; si se toca, se escoge otro de la lista (queda en esta inspección). */
  const [respId, setRespId] = useState<string | null>(null);
  const duenno = responsables.find((r) => r.id === (respId ?? area?.responsable_id)) ?? null;
  const cambiado = respId != null && respId !== area?.responsable_id;
  /* El auditor: quien entró, salvo que se escoja otra persona de la lista. */
  const [audId, setAudId] = useState("");
  const otroAuditor = responsables.find((r) => r.id === audId) ?? null;
  const lista = useMemo(() => (area ? checklistDe(puntos, area.id, formato) : []), [puntos, area, formato]);
  const r = (id: string) => resp[id] ?? VACIA;
  const zonasArea = zonas.filter((z) => z.activa && z.area_id === area?.id);

  const respondidos = lista.filter((p) => r(p.id).resultado).length;
  const tieneAlgo = respondidos > 0 || Object.values(resp).some((x) => x.fotos.length);
  const items = lista.map((p) => ({ peso: p.peso, resultado: r(p.id).resultado }));
  const total = cumplimiento(items);
  const porS = formato.secciones.map((s) => {
    const de = lista.filter((p) => p.s === s.clave);
    return { ...s, puntos: de.length, hechos: de.filter((p) => r(p.id).resultado).length, pct: cumplimiento(de.map((p) => ({ peso: p.peso, resultado: r(p.id).resultado }))) };
  });
  const cuenta = (v: Resultado) => lista.filter((p) => r(p.id).resultado === v).length;

  /* LO QUE FALTA PARA GUARDAR, dicho punto por punto: cada uno lleva a su fila. */
  const faltas = lista.flatMap((p) => {
    const x = r(p.id);
    if (!x.resultado) return [{ id: p.id, que: "sin responder" }];
    const f: { id: string; que: string }[] = [];
    if (x.resultado === "no_cumple" && !x.observacion.trim()) f.push({ id: p.id, que: "no cumple sin decir qué se encontró" });
    if (p.exige_foto && x.resultado !== "na" && x.fotos.length === 0) f.push({ id: p.id, que: "exige foto" });
    return f;
  });
  const sinResponder = faltas.filter((f) => f.que === "sin responder").length;
  const otras = faltas.length - sinResponder;
  const todoNA = lista.length > 0 && respondidos === lista.length && total === null;
  const listo = !!area && lista.length > 0 && faltas.length === 0 && !todoNA && !!fecha;

  /* QUE NO SE PIERDA UNA AUDITORÍA A MEDIAS por un toque en «atrás». */
  useEffect(() => {
    if (!tieneAlgo || hecha) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault() };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [tieneAlgo, hecha]);

  function poner(id: string, c: Partial<Resp>) {
    setResp((m) => ({ ...m, [id]: { ...(m[id] ?? VACIA), ...c } }));
  }
  async function cambiarArea(id: string) {
    if (tieneAlgo && !hecha && !(await pedir({
      titulo: "¿Cambiar de área?",
      dice: <>Lo que llevas respondido de <b>{area?.nombre}</b> (y sus fotos) se pierde: cada área tiene su propio checklist.</>,
      confirmar: "Cambiar de área", peligro: true,
    }))) return;
    for (const x of Object.values(resp)) for (const f of x.fotos) URL.revokeObjectURL(f.url);
    setAreaId(id); setResp({}); setNota(""); setHecha(null); setVerFaltas(false); setRespId(null);
    try { localStorage.setItem(RECORDAR, id) } catch { /* sin almacenamiento */ }
  }
  async function cambiarFormato(id: string) {
    if (id === formatoId) return;
    const nuevo = formatosAct.find((f) => f.id === id);
    if (tieneAlgo && !hecha && !(await pedir({
      titulo: `¿Pasar a ${nuevo?.nombre ?? "otro formato"}?`,
      dice: <>Lo que llevas respondido de <b>{formato.nombre}</b> (y sus fotos) se pierde: cada formato tiene su propio checklist.</>,
      confirmar: "Cambiar de formato", peligro: true,
    }))) return;
    for (const x of Object.values(resp)) for (const f of x.fotos) URL.revokeObjectURL(f.url);
    setFormatoId(id); setResp({}); setNota(""); setHecha(null); setVerFaltas(false);
    try { localStorage.setItem(RECORDAR_F, id) } catch { /* sin almacenamiento */ }
  }
  function irA(id: string) {
    const el = document.getElementById("p-" + id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }
  function pedirFoto(id: string) { fotoPara.current = id; camara.current?.click() }
  async function tomarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]; e.target.value = "";
    const id = fotoPara.current;
    if (!archivo || !id || !area) return;
    try {
      const f = await sellar(archivo, { titulo: area.nombre.toUpperCase(), ubi: null, direccion: "", etiqueta: formato.clave.toUpperCase() });
      setResp((m) => { const x = m[id] ?? VACIA; return { ...m, [id]: { ...x, fotos: [...x.fotos, { ...f, k: contador.current++ }] } } });
    } catch (err) {
      avisar.mal(err instanceof Error ? err.message : "No se pudo procesar esa foto.");
    }
  }
  function quitarFoto(id: string, k: number) {
    setResp((m) => {
      const x = m[id] ?? VACIA; const f = x.fotos.find((y) => y.k === k); if (f) URL.revokeObjectURL(f.url);
      return { ...m, [id]: { ...x, fotos: x.fotos.filter((y) => y.k !== k) } };
    });
  }

  async function guardar() {
    if (!area) return;
    if (!listo) { setVerFaltas(true); if (faltas[0]) irA(faltas[0].id); return }
    setGuardando(true);
    const sb = createClient();
    const id = crypto.randomUUID();
    const subidas: string[] = [];
    /* PRIMERO LAS FOTOS (con la ruta de la inspección), DESPUÉS LA INSPECCIÓN: la base revisa que las que exige estén. */
    const fotosDe: Record<string, { ruta: string; bytes: number }[]> = {};
    for (const p of lista) {
      const x = r(p.id);
      if (x.resultado === "na") continue;
      for (const [i, f] of x.fotos.entries()) {
        const ruta = `${id}/${p.id}-${i + 1}.jpg`;
        const { error } = await sb.storage.from("cinco-s").upload(ruta, f.blob, { contentType: "image/jpeg" });
        if (error) {
          if (subidas.length) await sb.storage.from("cinco-s").remove(subidas);
          setGuardando(false);
          avisar.mal(`No subió una foto («${p.pregunta}»): ${error.message}. No se guardó nada; vuelve a intentar.`);
          return;
        }
        subidas.push(ruta);
        (fotosDe[p.id] ??= []).push({ ruta, bytes: f.blob.size });
      }
    }
    const { error } = await sb.rpc("s5_guardar", {
      p: {
        id, fecha, area_id: area.id, formato_id: formato.id || null, responsable_id: duenno?.id ?? null, auditor_id: otroAuditor?.id ?? null, nota: nota.trim() || null,
        puntos: lista.map((p) => {
          const x = r(p.id);
          return {
            punto_id: p.id, resultado: x.resultado,
            severidad: x.resultado === "no_cumple" ? x.severidad : null,
            zona_id: x.resultado === "no_cumple" && x.zona ? x.zona : null,
            observacion: (x.resultado === "no_cumple" || x.conNota ? x.observacion.trim() : "") || null,
            fotos: fotosDe[p.id] ?? [],
          };
        }),
      },
    });
    setGuardando(false);
    if (error) {
      if (subidas.length) await sb.storage.from("cinco-s").remove(subidas);
      avisar.mal(/s5_guardar|schema cache/i.test(error.message)
        ? "Falta correr 2026-11-cinco-s.sql en Supabase."
        : error.message);
      return;
    }
    for (const x of Object.values(resp)) for (const f of x.fotos) URL.revokeObjectURL(f.url);
    setHecha({ id, area: `${formato.nombre} · ${area.nombre}`, pct: total ?? 0, meta });
    setResp({}); setNota(""); setVerFaltas(false);
    /* EL RESULTADO DE LA INSPECCIÓN ES SU INFORME: se abre y el PDF se descarga solo. */
    router.push(`/5s/informe/${id}?pdf=1`);
  }

  if (activas.length === 0) {
    return (
      <div className="s5">
        <Cabeza formato={formato.nombre} />
        <p className="s5-vacio">
          Todavía no hay áreas para auditar. Créalas en <b>5S › Maestro</b> (Bodega 38, Fábrica, patio, oficinas…) con su
          responsable; el checklist general ya viene cargado con tres puntos por S.
        </p>
      </div>
    );
  }

  const estado = total == null ? "" : total >= meta ? "sobre" : "bajo";

  return (
    <div className="s5">
      {avisos}{dialogo}
      <Cabeza formato={formato.nombre} />

      {/* QUÉ SE EVALÚA: un toque. Solo sale si hay más de un formato. */}
      {formatosAct.length > 1 && (
        <div className="s5-formatos" role="radiogroup" aria-label="Qué se evalúa">
          {formatosAct.map((f) => (
            <button key={f.id || f.clave} type="button" role="radio" aria-checked={f.id === formato.id}
                    className={f.id === formato.id ? "on" : ""} disabled={guardando} onClick={() => cambiarFormato(f.id)}>
              <b>{f.nombre}</b>
              {f.descripcion && <small>{f.descripcion}</small>}
            </button>
          ))}
        </div>
      )}

      {hecha && (
        <div className={"s5-hecha " + (hecha.pct >= hecha.meta ? "sobre" : "bajo")} role="status">
          <b>{pct(hecha.pct)}</b>
          <div>
            <strong>Inspección de {hecha.area} guardada</strong>
            <span>{hecha.pct >= hecha.meta ? "Cumple la meta" : "Quedó bajo la meta"} de {pct(hecha.meta)}.</span>
          </div>
          <Link href={`/5s/informe/${hecha.id}?pdf=1`} className="s5-bt osc">Informe PDF</Link>
          <button type="button" className="s5-x" aria-label="Cerrar" onClick={() => setHecha(null)}>×</button>
        </div>
      )}

      {/* LA FICHA: área y fecha se escogen; responsable y auditor salen solos, y tocándolos se cambian. */}
      <section className="s5-ficha">
        <label className="s5-campo grande">
          <span>Área</span>
          <select value={areaId} onChange={(e) => cambiarArea(e.target.value)} disabled={guardando}>
            {activas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <label className="s5-campo">
          <span>Fecha · S{semanaIso(fecha || hoyCo())}</span>
          <CampoFecha value={fecha} max={hoyCo()} onChange={(e) => setFecha(e.target.value)} disabled={guardando} />
        </label>
        <label className="s5-dato s5-dato-sel" title="Tocar para escoger otro responsable">
          <span>Responsable del área{cambiado && " · cambiado"}</span>
          <b>{duenno?.nombre ?? "Sin asignar"} <i aria-hidden>▾</i></b>
          {duenno?.cargo ? <small>{duenno.cargo}</small> : <small>toca para escoger</small>}
          <select aria-label="Responsable del área" value={duenno?.id ?? ""} disabled={guardando}
                  onChange={(e) => setRespId(e.target.value || null)}>
            {!duenno && <option value="">Sin asignar</option>}
            {responsables.filter((x) => x.activo || x.id === duenno?.id).map((x) => (
              <option key={x.id} value={x.id}>{x.nombre}{x.cargo ? ` · ${x.cargo}` : ""}{x.id === area?.responsable_id ? " (del área)" : ""}</option>
            ))}
          </select>
        </label>
        <label className="s5-dato s5-dato-sel" title="Tocar para escoger otro auditor">
          <span>Auditor{otroAuditor && " · cambiado"}</span>
          <b>{otroAuditor?.nombre ?? (auditor || "—")} <i aria-hidden>▾</i></b>
          <small>{otroAuditor ? (otroAuditor.cargo ?? "escogido de la lista") : "quien entró a la app"}</small>
          <select aria-label="Auditor" value={otroAuditor?.id ?? ""} disabled={guardando} onChange={(e) => setAudId(e.target.value)}>
            <option value="">{auditor || "Yo"} (quien entró)</option>
            {responsables.filter((x) => x.activo || x.id === otroAuditor?.id).map((x) => (
              <option key={x.id} value={x.id}>{x.nombre}{x.cargo ? ` · ${x.cargo}` : ""}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="s5-trabajo">
        {/* EL CHECKLIST, por S. */}
        <div className="s5-lista">
          {lista.length === 0 && (
            <p className="s5-vacio">Esta área no tiene puntos de <b>{formato.nombre}</b>. Agrégalos en <b>5S › Maestro › Checklist</b>.</p>
          )}
          {porS.filter((s) => s.puntos > 0).map((s) => (
            <section key={s.clave} className="s5-bloque" aria-labelledby={"s-" + s.clave}>
              <header>
                <span className={"s5-n" + (s.corto.length > 2 ? " largo" : "")}>{s.corto}</span>
                <div>
                  <h2 id={"s-" + s.clave}>{s.nombre} {s.jp && <i>{s.jp}</i>}</h2>
                  <small>{s.que}</small>
                </div>
                <div className="s5-bloque-pct">
                  <b>{pct(s.pct)}</b>
                  <small>{s.hechos}/{s.puntos}</small>
                </div>
              </header>
              <ol>
                {lista.filter((p) => p.s === s.clave).map((p) => {
                  const x = r(p.id);
                  const n = lista.indexOf(p) + 1;
                  const malFoto = verFaltas && p.exige_foto && x.resultado && x.resultado !== "na" && x.fotos.length === 0;
                  const malObs = verFaltas && x.resultado === "no_cumple" && !x.observacion.trim();
                  const malResp = verFaltas && !x.resultado;
                  const compacta = x.resultado === "cumple" && !p.exige_foto && x.fotos.length === 0 && !x.conNota;
                  return (
                    <li key={p.id} id={"p-" + p.id} className={"s5-p " + (x.resultado ?? "") + (malResp || malObs || malFoto ? " falta" : "")}>
                      <div className="s5-p-cab">
                        <span className="s5-p-n">{n}</span>
                        <div className="s5-p-q">
                          <p>{p.pregunta}</p>
                          <div className="s5-p-tags">
                            {p.peso !== 1 && <span>peso {p.peso}</span>}
                            {p.exige_foto && <span className="foto">exige foto</span>}
                            {p.area_id && <span>de {area?.nombre}</span>}
                            {/* CUMPLE NO NECESITA MÁS: foto y nota quedan a un toque, sin ocupar una fila entera. */}
                            {compacta && <>
                              <button type="button" className="s5-link" onClick={() => pedirFoto(p.id)} disabled={guardando}>+ foto</button>
                              <button type="button" className="s5-link" onClick={() => poner(p.id, { conNota: true })}>+ nota</button>
                            </>}
                          </div>
                        </div>
                        <div className="s5-res" role="radiogroup" aria-label={"Resultado: " + p.pregunta}>
                          {([["cumple", "Cumple"], ["no_cumple", "No cumple"], ["na", "N/A"]] as const).map(([v, t]) => (
                            <button key={v} type="button" role="radio" aria-checked={x.resultado === v}
                                    className={v + (x.resultado === v ? " on" : "")} disabled={guardando}
                                    onClick={() => poner(p.id, { resultado: x.resultado === v ? null : v })}>{t}</button>
                          ))}
                        </div>
                      </div>

                      {x.resultado === "no_cumple" && (
                        <div className="s5-hallazgo">
                          <div className="s5-sev" role="radiogroup" aria-label="Severidad">
                            <span>Severidad</span>
                            {SEVERIDADES.map((v) => (
                              <button key={v.v} type="button" role="radio" aria-checked={x.severidad === v.v}
                                      className={v.v + (x.severidad === v.v ? " on" : "")}
                                      onClick={() => poner(p.id, { severidad: v.v })}>{v.t}</button>
                            ))}
                          </div>
                          {/* EN QUÉ ZONA: «no cumple en Bodega 38» no dice adónde ir; «en la calle 3» sí. */}
                          {zonasArea.length > 0 && (
                            <select className="s5-zona" value={x.zona} aria-label="Zona" onChange={(e) => poner(p.id, { zona: e.target.value })}>
                              <option value="">Zona…</option>
                              {zonasArea.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                            </select>
                          )}
                          <textarea value={x.observacion} rows={2} maxLength={600} aria-invalid={malObs || undefined}
                                    placeholder="¿Qué se encontró? Dónde, qué y cuánto (ej.: vidrio en la calle 4, junto a la columna 12)."
                                    onChange={(e) => poner(p.id, { observacion: e.target.value })} />
                        </div>
                      )}
                      {x.resultado === "cumple" && x.conNota && (
                        <textarea className="s5-obs-ok" value={x.observacion} rows={1} maxLength={600} autoFocus
                                  placeholder="Nota (opcional): algo que vale la pena dejar dicho aunque cumpla."
                                  onChange={(e) => poner(p.id, { observacion: e.target.value })} />
                      )}

                      {x.resultado && x.resultado !== "na" && !compacta && (
                        <div className="s5-fotos">
                          {x.fotos.map((f) => (
                            <figure key={f.k}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={f.url} alt={"Foto de: " + p.pregunta} />
                              <button type="button" aria-label="Quitar foto" onClick={() => quitarFoto(p.id, f.k)}>×</button>
                            </figure>
                          ))}
                          <button type="button" className={"s5-foto-bt" + (malFoto ? " falta" : "")} onClick={() => pedirFoto(p.id)} disabled={guardando}>
                            <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                            {x.fotos.length ? "Otra foto" : p.exige_foto ? "Tomar foto (exigida)" : "Foto"}
                          </button>
                          {x.resultado === "cumple" && !x.conNota && (
                            <button type="button" className="s5-link" onClick={() => poner(p.id, { conNota: true })}>+ nota</button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {lista.length > 0 && (
            <label className="s5-campo nota">
              <span>Nota general (opcional)</span>
              <textarea value={nota} rows={2} maxLength={1000} onChange={(e) => setNota(e.target.value)}
                        placeholder="Lo que vale la pena decir de la visita y no es de un punto." />
            </label>
          )}
        </div>

        {/* EL MARCADOR: lo que va dando, contra la meta del área. */}
        <aside className={"s5-marcador " + estado} aria-label="Marcador de la inspección">
          <div className="s5-m-top">
            <span>Cumplimiento</span>
            <b>{pct(total)}</b>
            <small>{total == null ? "Responde para ver el puntaje" : estado === "sobre" ? `Sobre la meta de ${pct(meta)}` : `Bajo la meta de ${pct(meta)}`}</small>
            <div className="s5-m-barra" aria-hidden><i style={{ width: `${total ?? 0}%` }} /><em style={{ left: `${meta}%` }} /></div>
          </div>
          <ul className="s5-m-s">
            {porS.filter((s) => s.puntos > 0).map((s) => (
              <li key={s.clave}>
                <span>{s.corto}{s.corto.toLowerCase() !== s.nombre.toLowerCase() && <> <em>{s.nombre}</em></>}</span>
                <div aria-hidden><i style={{ width: `${s.pct ?? 0}%` }} className={s.pct != null && s.pct < meta ? "bajo" : ""} /></div>
                <b>{s.pct == null ? "—" : Math.round(s.pct)}</b>
              </li>
            ))}
          </ul>
          <dl className="s5-m-cuenta">
            <div><dt>Cumple</dt><dd>{cuenta("cumple")}</dd></div>
            <div className="nc"><dt>No cumple</dt><dd>{cuenta("no_cumple")}</dd></div>
            <div><dt>N/A</dt><dd>{cuenta("na")}</dd></div>
            <div><dt>Faltan</dt><dd>{lista.length - respondidos}</dd></div>
          </dl>
          {verFaltas && faltas.length > 0 && (
            <div className="s5-m-faltas">
              <p>{sinResponder > 0 && `${sinResponder} sin responder`}{sinResponder > 0 && otras > 0 && " · "}{otras > 0 && `${otras} por completar`}</p>
              <button type="button" onClick={() => irA(faltas[0].id)}>Ir al primero →</button>
            </div>
          )}
          {todoNA && <div className="s5-m-faltas"><p>Todo quedó en N/A: no hay nada que calificar.</p></div>}
          {puedeEditar ? (
            <button type="button" className="s5-bt osc s5-guardar" onClick={guardar} disabled={guardando || !area || lista.length === 0}>
              {guardando ? "Guardando…" : listo ? "Guardar inspección" : `Guardar · ${respondidos}/${lista.length}`}
            </button>
          ) : (
            <p className="s5-m-nota">Tu rol puede ver esta pantalla pero no guardar inspecciones.</p>
          )}
        </aside>
      </div>

      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={tomarFoto} />
    </div>
  );
}

function Cabeza({ formato }: { formato: string }) {
  return (
    <header className="s5-cab">
      <div>
        <p className="s5-ojo">{formato.toUpperCase()}</p>
        <h1>Inspeccionar</h1>
      </div>
    </header>
  );
}

