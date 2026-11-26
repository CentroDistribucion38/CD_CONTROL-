"use client";

/**
 * 5S · CRONOGRAMA — las auditorías programadas en un diagrama de Gantt.
 *
 * Cada barra es una auditoría: de qué área, quién la hace y entre qué fechas. Su estado NO se marca a mano: la base
 * lo calcula. Cuando alguien guarda una inspección de esa área dentro de esas fechas, la barra pasa sola a «Hecha»
 * con su puntaje (y un rombo el día en que se hizo); si se pasa la fecha sin inspección, queda «Vencida».
 * Lo de INOVA tenía el estado como un campo más que alguien tenía que acordarse de cambiar.
 *
 * Se agrupa por área o por auditor; las que se cruzan en una misma fila se acomodan en carriles. «Repetir» programa
 * de una vez las auditorías semanales o mensuales, que es como se lleva un 5S.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { logoMarca, useFotoCompartir, type TipoFoto } from "@/components/FotoCompartir";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import { CabezaVentana } from "../CabezaVentana";
import {
  ESTADOS, fechaLarga, hoyCo, pct, semanaIso,
  type Area5S, type EstadoProg, type Prioridad, type Programada5S, type Responsable5S,
} from "@/modulos/cinco-s/cinco-s";

import { CampoFecha } from "@/components/CampoFecha";
/* ------------------------------ fechas ------------------------------ */
const DIA = 86400000;
const aD = (f: string) => new Date(f + "T00:00:00Z");
const aF = (d: Date) => d.toISOString().slice(0, 10);
const mas = (f: string, n: number) => aF(new Date(aD(f).getTime() + n * DIA));
const dias = (a: string, b: string) => Math.round((aD(b).getTime() - aD(a).getTime()) / DIA);
const lunes = (f: string) => mas(f, -((aD(f).getUTCDay() + 6) % 7));
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (f: string) => `${aD(f).getUTCDate()} ${MES[aD(f).getUTCMonth()]}`;

const RANGOS = [
  { id: "4s", t: "4 semanas", dias: 28, px: 36 },
  { id: "8s", t: "8 semanas", dias: 56, px: 20 },
  { id: "3m", t: "3 meses", dias: 91, px: 13 },
] as const;
type RangoId = (typeof RANGOS)[number]["id"];

const PRIORIDADES: { v: Prioridad; t: string }[] = [{ v: "baja", t: "Baja" }, { v: "media", t: "Media" }, { v: "alta", t: "Alta" }];
const REPETIR = [
  { v: 0, t: "No se repite" }, { v: 7, t: "Cada semana" }, { v: 14, t: "Cada 2 semanas" }, { v: 28, t: "Cada 4 semanas" },
] as const;

type Form = {
  id?: string; area_id: string; auditor_id: string; actividad: string; desde: string; hasta: string;
  prioridad: Prioridad; nota: string; cancelada?: boolean; cada: number; veces: number;
  estado?: EstadoProg; inspeccion_id?: string | null; cumplimiento?: number | null; hecha_el?: string | null;
};

export function Cronograma({ filas, areas, responsables, puedeEditar }: {
  filas: Programada5S[]; areas: Area5S[]; responsables: Responsable5S[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const hoy = hoyCo();
  const [rango, setRango] = useState<RangoId>("8s");
  const R = RANGOS.find((r) => r.id === rango)!;
  const [inicio, setInicio] = useState(() => mas(lunes(hoy), -7));
  const [grupo, setGrupo] = useState<"area" | "auditor">("area");
  const [ocultos, setOcultos] = useState<Set<EstadoProg>>(new Set(["cancelada"]));
  const [form, setForm] = useState<Form | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const fin = mas(inicio, R.dias - 1);
  const enRango = filas.filter((f) => f.hasta >= inicio && f.desde <= fin);
  const visibles = enRango.filter((f) => !ocultos.has(f.estado));
  const cuenta = (e: EstadoProg) => enRango.filter((f) => f.estado === e).length;

  /* LO QUE IMPORTA DEL RANGO: cuántas, cuántas se cumplieron, cuántas se dejaron vencer y qué viene. */
  const vivas = enRango.filter((f) => f.estado !== "cancelada");
  const cerradas = vivas.filter((f) => f.estado === "hecha" || f.estado === "vencida");
  const cumplido = cerradas.length ? (100 * cerradas.filter((f) => f.estado === "hecha").length) / cerradas.length : null;
  const proximas = filas.filter((f) => !f.cancelada && f.estado !== "hecha" && f.desde <= mas(hoy, 7) && f.hasta >= hoy);

  /* LAS FILAS DEL GANTT: una por área (o auditor); las barras que se cruzan bajan a otro carril. */
  const grupos = useMemo(() => {
    const llave = (f: Programada5S) => grupo === "area" ? f.area : f.auditor ?? "Sin auditor asignado";
    const base = grupo === "area"
      ? areas.filter((a) => a.activa || visibles.some((f) => f.area_id === a.id)).map((a) => a.nombre)
      : [...responsables.filter((r) => r.activo).map((r) => r.nombre), ...(visibles.some((f) => !f.auditor) ? ["Sin auditor asignado"] : [])];
    const nombres = [...new Set([...base, ...visibles.map(llave)])];
    return nombres.map((n) => {
      const suyas = visibles.filter((f) => llave(f) === n).sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta));
      const carriles: string[] = [];
      const lane = new Map<string, number>();
      for (const f of suyas) {
        let i = carriles.findIndex((h) => h < f.desde);
        if (i < 0) { i = carriles.length; carriles.push(f.hasta) } else carriles[i] = f.hasta;
        lane.set(f.id, i);
      }
      return { nombre: n, barras: suyas, lane, carriles: Math.max(1, carriles.length) };
    });
  }, [visibles, grupo, areas, responsables]);

  const diasR = Array.from({ length: R.dias }, (_, i) => mas(inicio, i));
  const meses = diasR.reduce<{ t: string; n: number }[]>((acc, d) => {
    const t = `${MES[aD(d).getUTCMonth()]} ${aD(d).getUTCFullYear()}`;
    if (acc.length && acc[acc.length - 1].t === t) acc[acc.length - 1].n++; else acc.push({ t, n: 1 });
    return acc;
  }, []);
  const semanas = diasR.filter((d, i) => i === 0 || aD(d).getUTCDay() === 1);
  const hoyX = dias(inicio, hoy);
  const ANCHO = R.dias * R.px;
  const ALTO_CARRIL = 34;

  /* EL CRONOGRAMA PARA COPIAR: el mismo Gantt que se ve (rango, agrupación y estados), en una imagen. */
  const foto = useFotoCompartir(async (_t: TipoFoto) => {
    const [{ dibujarCrono5S, nombreCrono5S }, logo] = await Promise.all([import("@/modulos/cinco-s/foto-crono"), logoMarca()]);
    const lienzo = dibujarCrono5S({
      grupos, inicio, dias: R.dias, hoy, porArea: grupo === "area", rango: R.t,
      visibles: (Object.keys(ESTADOS) as EstadoProg[]).filter((e) => !ocultos.has(e)),
      kpis: { enRango: vivas.length, cumplido, hechas: cerradas.filter((f) => f.estado === "hecha").length, cerradas: cerradas.length,
        vencidas: cuenta("vencida"), proximas: proximas.length, proximasTxt: proximas.slice(0, 3).map((f) => f.area).join(", ") },
    }, { logo, paleta: leerPaleta(caja.current) ?? undefined });
    return { lienzo, nombre: nombreCrono5S(inicio, fin) };
  }, "Cronograma 5S", { dashboard: "Cronograma" }, undefined, ["dashboard"]);

  function mover(n: number) { setInicio((i) => mas(i, n)) }
  function irHoy() { setInicio(mas(lunes(hoy), -7)) }
  function alternar(e: EstadoProg) { setOcultos((o) => { const n = new Set(o); if (n.has(e)) n.delete(e); else n.add(e); return n }) }

  function nueva(area_id = "", desde = lunes(hoy) < hoy ? hoy : lunes(hoy)) {
    setForm({ area_id: area_id || areas.find((a) => a.activa)?.id || "", auditor_id: "", actividad: "Auditoría 5S",
      desde, hasta: mas(desde, Math.max(0, 4 - ((aD(desde).getUTCDay() + 6) % 7))), prioridad: "media", nota: "", cada: 0, veces: 4 });
  }
  function abrir(f: Programada5S) {
    setForm({ id: f.id, area_id: f.area_id, auditor_id: f.auditor_id ?? "", actividad: f.actividad, desde: f.desde, hasta: f.hasta,
      prioridad: f.prioridad, nota: f.nota ?? "", cancelada: f.cancelada, cada: 0, veces: 1,
      estado: f.estado, inspeccion_id: f.inspeccion_id, cumplimiento: f.cumplimiento, hecha_el: f.hecha_el });
  }

  async function guardar() {
    if (!form) return;
    if (!form.area_id) { avisar.mal("Escoge el área."); return }
    if (!form.desde || !form.hasta || form.hasta < form.desde) { avisar.mal("La fecha final no puede ser antes de la inicial."); return }
    const sb = createClient();
    const base = { area_id: form.area_id, auditor_id: form.auditor_id || null, actividad: form.actividad.trim() || "Auditoría 5S",
      prioridad: form.prioridad, nota: form.nota.trim() || null };
    setOcupado(true);
    let error: { message: string } | null = null;
    let n = 1;
    if (form.id) {
      ({ error } = await sb.from("s5_cronograma").update({ ...base, desde: form.desde, hasta: form.hasta }).eq("id", form.id));
    } else {
      const largo = dias(form.desde, form.hasta);
      n = form.cada ? Math.max(1, Math.min(52, form.veces)) : 1;
      const filasNuevas = Array.from({ length: n }, (_, i) => ({ ...base, desde: mas(form.desde, i * form.cada), hasta: mas(form.desde, i * form.cada + largo) }));
      ({ error } = await sb.from("s5_cronograma").insert(filasNuevas));
    }
    setOcupado(false);
    if (error) { avisar.mal(/s5_cronograma|schema cache/i.test(error.message) ? "Falta correr 2026-11-cinco-s-2.sql en Supabase." : error.message); return }
    const area = areas.find((a) => a.id === form.area_id)?.nombre ?? "";
    avisar.bien(form.id ? "Auditoría actualizada." : n > 1 ? `${n} auditorías de ${area} programadas.` : `Auditoría de ${area} programada.`);
    setForm(null);
    router.refresh();
  }
  async function cancelar(valor: boolean) {
    if (!form?.id) return;
    const sb = createClient();
    setOcupado(true);
    const { error } = await sb.from("s5_cronograma").update({ cancelada: valor }).eq("id", form.id);
    setOcupado(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(valor ? "Auditoría cancelada." : "Auditoría activa otra vez.");
    setForm(null); router.refresh();
  }
  async function borrar() {
    if (!form?.id) return;
    if (!(await pedir({ titulo: "¿Borrar esta auditoría del cronograma?", dice: "Si solo no se va a hacer, mejor cancélala: así queda el registro.", confirmar: "Borrar", peligro: true }))) return;
    const sb = createClient();
    const { error } = await sb.from("s5_cronograma").delete().eq("id", form.id);
    if (error) { avisar.mal(error.message); return }
    avisar.bien("Auditoría borrada."); setForm(null); router.refresh();
  }

  const nomArea = (id: string) => areas.find((a) => a.id === id)?.nombre ?? "";

  return (
    <div className="s5">
      {avisos}{dialogo}{foto.vista}
      <header className="s5-cab">
        <div>
          <p className="s5-ojo">5S · ORDEN Y ASEO</p>
          <h1>Cronograma</h1>
          <p className="s5-sub">Las auditorías programadas. Se marcan solas como hechas cuando se guarda la inspección del área en esas fechas.</p>
        </div>
        <div className="s5-acc">
          <button type="button" className="s5-bt" onClick={() => foto.abrir("dashboard")} disabled={foto.armando != null || areas.length === 0}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="5" width="18" height="15" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
            {foto.armando ? "Armando…" : "Cronograma para copiar"}
          </button>
          {puedeEditar && <button type="button" className="s5-bt osc" onClick={() => nueva()}>+ Programar auditoría</button>}
        </div>
      </header>

      <section className="s5-kpis" aria-label="Resumen del rango">
        <div className="s5-kpi"><span>En el rango</span><b>{vivas.length}</b><small>{corta(inicio)} – {corta(fin)}</small></div>
        <div className={"s5-kpi" + (cumplido != null && cumplido < 100 ? " bajo" : "")}><span>Cumplimiento del plan</span><b>{pct(cumplido)}</b><small>{cerradas.length ? `${cerradas.filter((f) => f.estado === "hecha").length} de ${cerradas.length} hechas (las que ya cerraron)` : "aún no cierra ninguna"}</small></div>
        <div className={"s5-kpi" + (cuenta("vencida") ? " bajo" : "")}><span>Vencidas</span><b>{cuenta("vencida")}</b><small>pasó la fecha sin inspección</small></div>
        <div className="s5-kpi"><span>Próximos 7 días</span><b>{proximas.length}</b><small>{proximas.slice(0, 2).map((f) => f.area).join(", ") || "nada pendiente"}</small></div>
      </section>

      <div className="s5-gantt-barra">
        <div className="s5-seg" role="group" aria-label="Rango">
          {RANGOS.map((r) => <button key={r.id} type="button" className={rango === r.id ? "on" : ""} onClick={() => setRango(r.id)}>{r.t}</button>)}
        </div>
        <div className="s5-seg" role="group" aria-label="Moverse">
          <button type="button" onClick={() => mover(-7)} aria-label="Semana anterior">‹</button>
          <button type="button" onClick={irHoy}>Hoy</button>
          <button type="button" onClick={() => mover(7)} aria-label="Semana siguiente">›</button>
        </div>
        <div className="s5-seg" role="group" aria-label="Agrupar por">
          <button type="button" className={grupo === "area" ? "on" : ""} onClick={() => setGrupo("area")}>Por área</button>
          <button type="button" className={grupo === "auditor" ? "on" : ""} onClick={() => setGrupo("auditor")}>Por auditor</button>
        </div>
        <div className="s5-leyenda" role="group" aria-label="Estados que se ven">
          {(Object.keys(ESTADOS) as EstadoProg[]).map((e) => (
            <button key={e} type="button" className={"est " + e + (ocultos.has(e) ? " apagado" : "")} aria-pressed={!ocultos.has(e)} onClick={() => alternar(e)}>
              <i aria-hidden />{ESTADOS[e]} <b>{cuenta(e)}</b>
            </button>
          ))}
        </div>
      </div>

      {areas.length === 0 ? (
        <p className="s5-vacio">Primero crea las áreas en <b>5S › Maestro</b>.</p>
      ) : (
        <div className="s5-gantt" ref={caja}>
          <div className="s5-g-in" style={{ gridTemplateColumns: `var(--s5-g-izq) ${ANCHO}px` }}>
            {/* CABECERA: meses, semanas y días */}
            <div className="s5-g-esq">{grupo === "area" ? "Área" : "Auditor"}</div>
            <div className="s5-g-cab" style={{ width: ANCHO }}>
              <div className="s5-g-meses">{meses.map((m, i) => <span key={i} style={{ width: m.n * R.px }}>{m.t}</span>)}</div>
              <div className="s5-g-sem">
                {semanas.map((d, i) => {
                  const sig = semanas[i + 1] ?? mas(fin, 1);
                  return <span key={d} style={{ width: dias(d, sig) * R.px }}>S{semanaIso(d)}</span>;
                })}
              </div>
              <div className="s5-g-dias">
                {diasR.map((d) => {
                  const dw = aD(d).getUTCDay();
                  return <span key={d} className={(dw === 0 || dw === 6 ? "fds" : "") + (d === hoy ? " hoy" : "")} style={{ width: R.px }}>
                    {R.px >= 20 ? aD(d).getUTCDate() : dw === 1 ? aD(d).getUTCDate() : ""}
                  </span>;
                })}
              </div>
            </div>

            {/* LAS FILAS */}
            {grupos.map((g) => (
              <div key={g.nombre} className="s5-g-fila" style={{ display: "contents" }}>
                <div className="s5-g-nom" style={{ height: g.carriles * ALTO_CARRIL + 12 }}>
                  <b>{g.nombre}</b>
                  <small>{g.barras.filter((b) => b.estado === "hecha").length}/{g.barras.filter((b) => b.estado !== "cancelada").length} hechas</small>
                </div>
                <div className="s5-g-pista" style={{ height: g.carriles * ALTO_CARRIL + 12, width: ANCHO }}
                     onDoubleClick={(e) => {
                       if (!puedeEditar || grupo !== "area") return;
                       const x = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
                       const d = mas(inicio, Math.floor(x / R.px));
                       nueva(areas.find((a) => a.nombre === g.nombre)?.id ?? "", d < hoy ? hoy : d);
                     }}>
                  {diasR.map((d, i) => { const dw = aD(d).getUTCDay(); return (dw === 0 || dw === 6) ? <i key={d} className="fds" style={{ left: i * R.px, width: R.px }} /> : null })}
                  {semanas.slice(1).map((d) => <i key={"s" + d} className="sem" style={{ left: dias(inicio, d) * R.px }} />)}
                  {g.barras.map((b) => {
                    const x0 = Math.max(0, dias(inicio, b.desde));
                    const x1 = Math.min(R.dias, dias(inicio, b.hasta) + 1);
                    const w = (x1 - x0) * R.px;
                    const etiqueta = grupo === "area" ? (b.auditor ?? "Sin auditor") : b.area;
                    const titulo = `${b.area} · ${ESTADOS[b.estado]} · ${fechaLarga(b.desde)} – ${fechaLarga(b.hasta)}` +
                      (b.auditor ? ` · ${b.auditor}` : "") + (b.cumplimiento != null ? ` · ${pct(b.cumplimiento)}` : "");
                    return (
                      <button key={b.id} type="button" className={`s5-g-bar ${b.estado} p-${b.prioridad}` + (b.desde < inicio ? " corta-i" : "") + (b.hasta > fin ? " corta-d" : "")}
                              style={{ left: x0 * R.px + 1, width: Math.max(R.px - 2, w - 2), top: 6 + (g.lane.get(b.id) ?? 0) * ALTO_CARRIL }}
                              title={titulo} aria-label={titulo} onClick={() => abrir(b)}>
                        {b.prioridad === "alta" && b.estado !== "hecha" && <em className="prio" aria-hidden>!</em>}
                        {/* SI NO CABE ADENTRO, EL NOMBRE VA AL LADO: una barra de un día también dice quién la hace. */}
                        {w > 60 ? <span>{etiqueta}</span> : <span className="fuera">{etiqueta}{b.estado === "hecha" && b.cumplimiento != null ? ` · ${Math.round(b.cumplimiento)}%` : ""}</span>}
                        {b.estado === "hecha" && b.cumplimiento != null && w > 60 && <b className={b.meta != null && b.cumplimiento < b.meta ? "bajo" : ""}>{Math.round(b.cumplimiento)}%</b>}
                        {b.hecha_el && b.hecha_el >= inicio && b.hecha_el <= fin && (
                          <i className="rombo" style={{ left: (dias(inicio, b.hecha_el) - x0) * R.px + R.px / 2 - 5 }} aria-hidden />
                        )}
                      </button>
                    );
                  })}
                  {hoyX >= 0 && hoyX < R.dias && <i className="hoy" style={{ left: hoyX * R.px + R.px / 2 }} aria-hidden />}
                </div>
              </div>
            ))}
          </div>
          {grupos.length === 0 && <p className="s5-vacio">No hay {grupo === "area" ? "áreas" : "auditores"} para mostrar.</p>}
        </div>
      )}
      {puedeEditar && grupo === "area" && areas.length > 0 && <p className="s5-sub">Doble clic en un día de la fila de un área programa una auditoría ahí.</p>}

      {/* LO QUE VIENE, en lista: en el celular el Gantt es para mirar; esto es para hacer. */}
      {proximas.length > 0 && (
        <section className="s5-card">
          <header><h2>Lo que viene esta semana</h2></header>
          <ul className="s5-filas">
            {proximas.map((f) => (
              <li key={f.id} className="s5-fila">
                <div>
                  <b>{f.area}</b> <span className={"s5-chip est-" + f.estado}>{ESTADOS[f.estado]}</span>{f.prioridad === "alta" && <span className="s5-chip foto">prioridad alta</span>}
                  <small>{corta(f.desde)} – {corta(f.hasta)} · {f.auditor ?? "sin auditor"}{f.nota ? ` · ${f.nota}` : ""}</small>
                </div>
                <Link className="s5-bt" href="/5s">Inspeccionar</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {form && (
        <div className="s5-velo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null) }}
             onKeyDown={(e) => { if (e.key === "Escape") setForm(null) }}>
          <form className="s5-mo" role="dialog" aria-modal="true" aria-label="Auditoría programada" onSubmit={(e) => { e.preventDefault(); guardar() }}>
            <CabezaVentana ojo={`5S · CRONOGRAMA${form.estado ? ` · ${ESTADOS[form.estado].toUpperCase()}` : ""}`}
                           titulo={form.id ? "Auditoría programada" : "Programar auditoría"} cerrar={() => setForm(null)} />
            {/* LO QUE VA A QUEDAR, en grande y en vivo: área, fechas, quién y prioridad. */}
            {(() => {
              const n = form.desde && form.hasta ? dias(form.desde, form.hasta) + 1 : 0;
              const quien = responsables.find((r) => r.id === form.auditor_id)?.nombre;
              return (
                <div className={"s5-mo-res p-" + form.prioridad}>
                  <div className="area"><span>Área</span><b>{nomArea(form.area_id) || "—"}</b></div>
                  <div><span>Fechas · S{form.desde ? semanaIso(form.desde) : "—"}</span>
                    <b>{form.desde ? corta(form.desde) : "—"}{form.hasta && form.hasta !== form.desde ? ` → ${corta(form.hasta)}` : ""}</b>
                    <small>{n > 0 ? `${n} ${n === 1 ? "día" : "días"}` : ""}{!form.id && form.cada ? ` · ×${Math.max(1, Math.min(52, form.veces))}` : ""}</small></div>
                  <div><span>Audita</span><b className={quien ? "" : "sin"}>{quien ?? "Sin asignar"}</b></div>
                  <div className="prio"><span>Prioridad</span><b>{PRIORIDADES.find((p) => p.v === form.prioridad)?.t}</b></div>
                </div>
              );
            })()}
            {form.estado === "hecha" && (
              <div className="s5-aviso" style={{ margin: "12px 16px 0" }}>
                Hecha el {fechaLarga(form.hecha_el!)} · {pct(form.cumplimiento)}. <Link href="/5s/historial">Ver en el historial</Link>
              </div>
            )}
            <fieldset className="s5-mo-b" disabled={!puedeEditar} style={{ border: 0 }}>
              <label className="s5-campo"><span>Área</span>
                <select value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
                  {areas.filter((a) => a.activa || a.id === form.area_id).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select></label>
              <label className="s5-campo"><span>¿Quién audita?</span>
                <select value={form.auditor_id} onChange={(e) => setForm({ ...form, auditor_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {responsables.filter((r) => r.activo || r.id === form.auditor_id).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select></label>
              <label className="s5-campo"><span>Desde</span>
                <CampoFecha value={form.desde} onChange={(e) => {
                  const d = e.target.value; const largo = Math.max(0, dias(form.desde, form.hasta));
                  setForm({ ...form, desde: d, hasta: d ? mas(d, largo) : form.hasta });
                }} hasta={form.hasta} alHasta={(e) => setForm({ ...form, hasta: e.target.value })} /></label>
              <label className="s5-campo"><span>Hasta</span>
                <CampoFecha value={form.hasta} min={form.desde} onChange={(e) => setForm({ ...form, hasta: e.target.value })} desde={form.desde} alDesde={(e) => {
                  const d = e.target.value; const largo = Math.max(0, dias(form.desde, form.hasta));
                  setForm({ ...form, desde: d, hasta: d ? mas(d, largo) : form.hasta });
                }} /></label>
              <div className="s5-campo"><span>Prioridad</span>
                <div className="s5-seg ancho" role="radiogroup" aria-label="Prioridad">
                  {PRIORIDADES.map((p) => <button key={p.v} type="button" role="radio" aria-checked={form.prioridad === p.v} className={form.prioridad === p.v ? "on" : ""} onClick={() => setForm({ ...form, prioridad: p.v })}>{p.t}</button>)}
                </div></div>
              <label className="s5-campo"><span>Actividad</span>
                <input value={form.actividad} maxLength={80} onChange={(e) => setForm({ ...form, actividad: e.target.value })} /></label>
              {!form.id && (<>
                <label className="s5-campo"><span>Repetir</span>
                  <select value={form.cada} onChange={(e) => setForm({ ...form, cada: Number(e.target.value) })}>
                    {REPETIR.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
                  </select></label>
                {form.cada > 0 && (
                  <label className="s5-campo"><span>Cuántas veces</span>
                    <input type="number" min={2} max={52} value={form.veces} onChange={(e) => setForm({ ...form, veces: Number(e.target.value) })} /></label>
                )}
                {form.cada > 0 && form.desde && (
                  <p className="s5-sub ancho">Programa {Math.max(1, Math.min(52, form.veces))} auditorías: la primera {corta(form.desde)} y la última {corta(mas(form.desde, (Math.max(1, Math.min(52, form.veces)) - 1) * form.cada))}.</p>
                )}
              </>)}
              <label className="s5-campo ancho"><span>Nota (opcional)</span>
                <input value={form.nota} maxLength={200} placeholder="Revisar la zona de casco con el jefe de turno" onChange={(e) => setForm({ ...form, nota: e.target.value })} /></label>
            </fieldset>
            <footer className="s5-mo-f" style={{ justifyContent: "space-between" }}>
              <span className="s5-acc">
                {form.id && puedeEditar && form.estado !== "hecha" && <button type="button" className="s5-bt" disabled={ocupado} onClick={() => cancelar(!form.cancelada)}>{form.cancelada ? "Reactivar" : "Cancelar auditoría"}</button>}
                {form.id && puedeEditar && <button type="button" className="s5-bt peligro" disabled={ocupado} onClick={borrar}>Borrar</button>}
              </span>
              <span className="s5-acc">
                <button type="button" className="s5-bt" onClick={() => setForm(null)}>Cerrar</button>
                {puedeEditar && <button type="submit" className="s5-bt osc" disabled={ocupado}>{ocupado ? "Guardando…" : form.id ? "Guardar" : "Programar"}</button>}
              </span>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
