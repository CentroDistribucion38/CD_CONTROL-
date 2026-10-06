"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { rotulosPdf, type Rotulo } from "@/modulos/inventario/rotulo";
import type { Factores } from "@/modulos/inventario/plan-envase";
import { armarRotulo, bloquesDelPlan, folioDe, llaveBloque, type BloquePlan, type CierreBloque, type LoteImpreso, type MaterialRotulo, type ResumenBloque } from "@/modulos/inventario/rotulos-plan";
import { VisorPdf } from "@/components/VisorPdf";
import type { SemanaGuardada } from "./PlanEnvase";

/**
 * INVENTARIO · RECEPCIÓN · RÓTULOS DEL PLAN.
 *
 * Del plan de envase salen los rótulos sin llenar nada: se escoge el día, el
 * turno y la línea, y cada SKU muestra cuántas estibas están planeadas, cuántos
 * rótulos ya se imprimieron y cuántos faltan. Imprimir da los folios, anota
 * quién y cuándo, y deja el PDF listo para la impresora. Lo que pase del plan
 * queda como ADICIONAL; lo que se reimprime queda con su motivo.
 */

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corto = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)} ${MES[Number(m) - 1]}` };
const hora = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const MAX_PDF = 400;
const MOTIVOS = ["Dañado", "Perdido", "Dato equivocado", "Otro"] as const;
const hoyIso = () => new Date().toLocaleDateString("sv");

export function RotulosPlan({ guardadas, factores: fac, materiales: mats, puedeImprimir }: {
  guardadas: SemanaGuardada[];
  factores: [string, { cajas_por_estiba: number | null; nombre: string | null }][];
  materiales: MaterialRotulo[];
  puedeImprimir: boolean;
}) {
  const [avisar, avisos] = useAvisos();
  /* `avisar` cambia en cada pintado: si `cargar` dependiera de él se volvería a pedir todo sin parar. */
  const avisarRef = useRef(avisar); avisarRef.current = avisar;
  const factores: Factores = useMemo(() => new Map(fac), [fac]);
  const materiales = useMemo(() => new Map(mats.map((m) => [m.sku, m])), [mats]);
  const [llave, setLlave] = useState<string | null>(null);
  const actual = guardadas.find((g) => `${g.anio}-${g.semana}` === llave) ?? guardadas[0] ?? null;
  const [dia, setDia] = useState<string | null>(null);
  const idxSem = Math.max(0, guardadas.findIndex((g) => g.id === actual?.id));
  const irSemana = (i: number) => { const g = guardadas[i]; if (g) { setLlave(`${g.anio}-${g.semana}`); setDia(null); } };
  const [turno, setTurno] = useState(0);
  const [tren, setTren] = useState("");
  const [resumen, setResumen] = useState<Map<string, ResumenBloque>>(new Map());
  const [lotes, setLotes] = useState<LoteImpreso[]>([]);
  const [cierres, setCierres] = useState<Map<string, number>>(new Map());
  const [sobra, setSobra] = useState<Record<string, string>>({});
  const [listaSem, setListaSem] = useState(false);
  const semRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listaSem) return;
    const fuera = (e: MouseEvent) => { if (semRef.current && !semRef.current.contains(e.target as Node)) setListaSem(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setListaSem(false); };
    document.addEventListener("mousedown", fuera); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [listaSem]);
  const [faltaSql, setFaltaSql] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [pdfListo, setPdfListo] = useState<{ url: string; n: number; nombre: string } | null>(null);
  const [reimp, setReimp] = useState<{ l: LoteImpreso; desde: string; hasta: string; motivo: string } | null>(null);

  const bloques = useMemo(() => (actual ? bloquesDelPlan(actual, factores, materiales) : []), [actual, factores, materiales]);
  const dias = useMemo(() => {
    if (!actual) return [] as string[];
    const d0 = new Date(actual.fecha_ini + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(d0); d.setDate(d.getDate() + i); return d.toLocaleDateString("sv") });
  }, [actual]);
  const diaOn = dia && dias.includes(dia) ? dia : (dias.includes(hoyIso()) ? hoyIso() : bloques[0]?.fecha ?? dias[0] ?? null);
  const trenes = useMemo(() => [...new Set(bloques.map((b) => b.tren))], [bloques]);

  const cargar = useCallback(async () => {
    if (!actual) return;
    const supabase = createClient();
    const [r, l, c] = await Promise.all([
      supabase.rpc("rotulos_plan_resumen", { p_anio: actual.anio, p_semana: actual.semana }),
      supabase.rpc("rotulos_plan_lotes", { p_anio: actual.anio, p_semana: actual.semana }),
      supabase.rpc("rotulos_plan_cierres", { p_anio: actual.anio, p_semana: actual.semana }),
    ]);
    const err = r.error ?? l.error ?? c.error;
    if (err) { if (/does not exist|schema cache|Could not find/i.test(err.message)) setFaltaSql(true); else avisarRef.current.mal(err.message); return }
    setFaltaSql(false);
    setResumen(new Map(((r.data ?? []) as ResumenBloque[]).map((x) => [llaveBloque(x), x])));
    setLotes((l.data ?? []) as LoteImpreso[]);
    setCierres(new Map(((c.data ?? []) as CierreBloque[]).map((x) => [llaveBloque(x), x.sobrantes])));
    setSobra({});
  }, [actual]);
  useEffect(() => { void cargar() }, [cargar]);

  const filas = useMemo(() => bloques.filter((b) => b.fecha === diaOn && (!turno || b.turno === turno) && (!tren || b.tren === tren)), [bloques, diaOn, turno, tren]);
  const est = (b: BloquePlan) => {
    const r = resumen.get(llaveBloque(b));
    const imp = r?.impresos ?? 0;
    const adic = r?.adicionales ?? 0;
    const sob = cierres.get(llaveBloque(b));
    /* LO ÚNICO QUE SE ESCRIBE ES LO QUE SOBRÓ: usados = impresos vigentes − sobrantes; lo demás sale solo. */
    const usados = sob == null ? null : imp + adic - sob;
    return { imp, adic, rei: r?.reimpresos ?? 0, faltan: Math.max(0, b.planeadas - imp), sob, usados, vs: usados == null ? null : usados - b.planeadas };
  };
  const tot = filas.reduce((a, b) => { const e = est(b); return { plan: a.plan + b.planeadas, imp: a.imp + e.imp, faltan: a.faltan + e.faltan, adic: a.adic + e.adic, rei: a.rei + e.rei, sob: a.sob + (e.sob ?? 0), usados: a.usados + (e.usados ?? 0), extra: a.extra + Math.max(0, e.vs ?? 0) } }, { plan: 0, imp: 0, faltan: 0, adic: 0, rei: 0, sob: 0, usados: 0, extra: 0 });
  const guardarSobra = async (b: BloquePlan, texto: string) => {
    if (!actual) return;
    const k = llaveBloque(b);
    const e = est(b);
    const nuevo = texto.trim() === "" ? null : Number(texto);
    if ((nuevo ?? null) === (e.sob ?? null)) { setSobra((m) => { const { [k]: _, ...r } = m; return r }); return }
    if (nuevo != null && !(Number.isInteger(nuevo) && nuevo >= 0)) { avisarRef.current.mal("Escribe cuántos sobraron: un número desde 0"); return }
    if (nuevo != null && nuevo > e.imp + e.adic) { avisarRef.current.mal(`Sobraron ${nuevo} pero solo hay ${e.imp + e.adic} rótulos impresos en este bloque`); return }
    const { error } = await createClient().rpc("rotulos_plan_cierre_guardar", { p_anio: actual.anio, p_semana: actual.semana, p_fecha: b.fecha, p_turno: b.turno, p_tren: b.tren, p_sap: b.sap, p_sobrantes: nuevo });
    if (error) { avisarRef.current.mal(error.message); return }
    setCierres((m) => { const n = new Map(m); if (nuevo == null) n.delete(k); else n.set(k, nuevo); return n });
    setSobra((m) => { const { [k]: _, ...r } = m; return r });
  };
  const lotesVis = lotes.filter((l) => l.fecha === diaOn && (!turno || l.turno === turno) && (!tren || l.tren === tren));

  /* EL PDF SE VE DENTRO DE LA PANTALLA (VisorPdf), no en una pestaña nueva: la app instalada y el celular
     bloquean las pestañas que se abren después de esperar y los folios quedaban gastados sin papel. */
  const abrirPdf = async (rotulos: Rotulo[], nombre: string) => {
    const pdf = await rotulosPdf(rotulos, { base: typeof window !== "undefined" ? window.location.origin : null });
    pdf.autoPrint();
    const url = String(pdf.output("bloburl"));
    setPdfListo((antes) => { if (antes) URL.revokeObjectURL(antes.url); return { url, n: rotulos.length, nombre } });
  };

  /* Imprime uno o varios bloques en un solo PDF. Cada tanda queda anotada en la base ANTES de pintarse:
     si algo falla a medias, lo ya anotado sale igual en el PDF (no queda un folio gastado sin papel). */
  async function imprimir(items: { b: BloquePlan; n: number }[]) {
    if (!actual || !items.length) return;
    setTrabajando(true);
    const supabase = createClient();
    const rotulos: Rotulo[] = [];
    let error: string | null = null;
    for (const { b, n } of items) {
      const m = materiales.get(b.sap);
      if (!m || !b.cajas || b.problema) continue;
      const cupo = MAX_PDF - rotulos.length;
      if (cupo <= 0) break;
      const cant = Math.min(n, cupo);
      const { data, error: e } = await supabase.rpc("rotulos_plan_imprimir", {
        p_anio: actual.anio, p_semana: actual.semana, p_fecha: b.fecha, p_turno: b.turno, p_tren: b.tren, p_sap: b.sap,
        p_cantidad: cant, p_planeadas: b.planeadas, p_cajas: b.cajas,
      });
      if (e) { error = e.message; break }
      for (const x of (data ?? []) as { folio: string; numero: number }[]) {
        rotulos.push(armarRotulo({ folio: x.folio, numero: x.numero, planeadas: b.planeadas, cajas: b.cajas, fecha: b.fecha, turno: b.turno, tren: b.tren, horaIni: b.horaIni, m }));
      }
    }
    try {
      if (rotulos.length) {
        await abrirPdf(rotulos, `Rótulos ${corto(items[0].b.fecha)}${items.length === 1 ? " · " + items[0].b.tren + " T" + items[0].b.turno + " · " + items[0].b.sku : ""}`);
        avisar.bien(rotulos.length === 1 ? "Rótulo listo." : `${rotulos.length} rótulos listos, numerados y anotados.`);
      }
      if (error) avisar.mal(error + (rotulos.length ? " — lo ya anotado salió en el PDF." : ""));
    } catch (e) {
      avisar.mal("Quedaron anotados pero no se pudo armar el PDF: " + ((e as Error).message ?? e) + ". Usa «Reimprimir» en la lista de abajo.");
    } finally {
      setTrabajando(false);
      setCantidades({});
      void cargar();
    }
  }

  /* VOLVER A ABRIR: arma otra vez el PDF de una impresión que ya está anotada, SIN gastar folios nuevos ni anotar nada.
     Sirve cuando el PDF no se llegó a ver o la impresora se tragó la tanda. */
  async function reabrir(l: LoteImpreso) {
    const b = bloques.find((x) => llaveBloque(x) === llaveBloque(l));
    const m = materiales.get(l.sap);
    if (!b || !m || !b.cajas) { avisar.mal("Ese SKU ya no está en el plan o en el Maestro."); return }
    setTrabajando(true);
    try {
      const rs: Rotulo[] = [];
      for (let n = l.desde; n <= l.hasta; n++) rs.push(armarRotulo({ folio: folioDe(l, n), numero: n, planeadas: b.planeadas, cajas: b.cajas, fecha: l.fecha, turno: l.turno, tren: l.tren, horaIni: b.horaIni, m }));
      await abrirPdf(rs, `Rótulos ${corto(l.fecha)} · ${l.tren} T${l.turno} · ${b.sku}`);
    } catch (e) { avisar.mal("No se pudo armar el PDF: " + ((e as Error).message ?? e)) }
    finally { setTrabajando(false) }
  }

  async function reimprimir() {
    if (!reimp || !actual) return;
    const { l, desde, hasta, motivo } = reimp;
    const a = Math.round(Number(desde)), z = Math.round(Number(hasta));
    if (!(a >= 1) || !(z >= a)) { avisar.mal("Pon el rótulo de inicio y el de final (el final no puede ser menor)."); return }
    const b = bloques.find((x) => llaveBloque(x) === llaveBloque(l));
    const m = materiales.get(l.sap);
    if (!b || !m) { avisar.mal("Ese SKU ya no está en el plan o en el Maestro."); return }
    setTrabajando(true);
    const { data, error } = await createClient().rpc("rotulos_plan_reimprimir_rango", {
      p_anio: actual.anio, p_semana: actual.semana, p_fecha: l.fecha, p_turno: l.turno, p_tren: l.tren, p_sap: l.sap, p_desde: a, p_hasta: z, p_motivo: motivo,
    });
    if (error) { avisar.mal(error.message); setTrabajando(false); return }
    try {
      const rows = (data ?? []) as { folio: string; numero: number; cajas: number | null; planeadas: number }[];
      await abrirPdf(rows.map((x) => armarRotulo({ folio: x.folio, numero: x.numero, planeadas: x.planeadas || b.planeadas, cajas: x.cajas ?? b.cajas ?? 0, fecha: l.fecha, turno: l.turno, tren: l.tren, horaIni: b.horaIni, m })), `Reimpresión ${l.tren} T${l.turno} · ${b.sku}`);
      avisar.bien(`${rows.length} ${rows.length === 1 ? "rótulo reimpreso" : "rótulos reimpresos"} (${motivo.toLowerCase()}).`);
      setReimp(null);
    } catch (e) { avisar.mal("Quedaron anotados pero no se pudo armar el PDF: " + ((e as Error).message ?? e)) }
    finally { setTrabajando(false); void cargar() }
  }

  if (!guardadas.length) {
    return <section className="pe"><p className="fe-vacio">Todavía no hay ningún plan guardado. Sube y guarda el Instructivo en «Plan de envase» y aquí salen los rótulos de cada turno.</p></section>;
  }
  if (faltaSql) {
    return <section className="sin-tablas"><h2>Falta preparar los rótulos del plan en Supabase</h2><p>Abre el SQL Editor y ejecuta <code>supabase/migraciones/2026-10-rotulos-plan.sql</code>. Después recarga esta pantalla.</p></section>;
  }

  const imprimibles = filas.filter((b) => !b.problema && est(b).faltan > 0);

  return (
    <section className="pe rp">
      {avisos}
      <section className="rp-panel" aria-label="Filtros de rótulos">
        <div className="rp-fila">
          <div className="rp-sem" ref={semRef}>
            <button type="button" aria-label="Semana anterior" disabled={idxSem >= guardadas.length - 1} onClick={() => irSemana(idxSem + 1)}>‹</button>
            <button type="button" className="rp-sem-med" aria-haspopup="listbox" aria-expanded={listaSem} onClick={() => setListaSem((v) => !v)}>
              <b>Semana {actual?.semana}</b><small>{actual ? `${corto(actual.fecha_ini)} – ${corto(actual.fecha_fin)}` : ""}</small>
              <i aria-hidden="true">▾</i>
            </button>
            <button type="button" aria-label="Semana siguiente" disabled={idxSem <= 0} onClick={() => irSemana(idxSem - 1)}>›</button>
            {listaSem && (
              <ul className="rp-sem-lista" role="listbox" aria-label="Semanas del plan">
                {guardadas.map((g, i) => (
                  <li key={g.id} role="option" aria-selected={i === idxSem}>
                    <button type="button" className={i === idxSem ? "on" : ""} onClick={() => { irSemana(i); setListaSem(false); }}>
                      <b>Semana {g.semana}</b><span>{corto(g.fecha_ini)} – {corto(g.fecha_fin)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rp-dias" role="radiogroup" aria-label="Día">
            {dias.map((d, i) => {
              const hay = bloques.some((b) => b.fecha === d);
              return (
                <button key={d} type="button" role="radio" aria-checked={d === diaOn} disabled={!hay} className={`rp-d${d === diaOn ? " on" : ""}${i === 6 ? " fin" : ""}`} onClick={() => setDia(d)}>
                  <small>{DIAS[i]}</small><b>{Number(d.slice(8))}</b>
                </button>
              );
            })}
          </div>
          <button type="button" className="rp-hoy" disabled={!dias.includes(hoyIso()) || !bloques.some((b) => b.fecha === hoyIso())} onClick={() => setDia(hoyIso())}>Hoy</button>
        </div>
        <div className="rp-fila">
          <span className="rp-lb">Turno</span>
          <div className="rp-seg" role="radiogroup" aria-label="Turno">
            {[[0, "Todos", ""], [1, "T1", "0–8 h"], [2, "T2", "8–16 h"], [3, "T3", "16–24 h"]].map(([k, t, h]) => (
              <button key={k} type="button" role="radio" aria-checked={turno === k} className={turno === k ? "on" : ""} onClick={() => setTurno(Number(k))}>{t}{h ? <small>{h}</small> : null}</button>
            ))}
          </div>
          <span className="rp-sep" aria-hidden="true" />
          <span className="rp-lb">Tren</span>
          <div className="rp-seg" role="radiogroup" aria-label="Tren">
            <button type="button" role="radio" aria-checked={!tren} className={!tren ? "on" : ""} onClick={() => setTren("")}>Todos</button>
            {trenes.map((t) => <button key={t} type="button" role="radio" aria-checked={tren === t} className={tren === t ? "on" : ""} onClick={() => setTren(t)}>{t.replace("TREN-", "")}</button>)}
          </div>
          <div className="rp-res">
            Viendo <b>{diaOn ? `${DIAS[Math.max(0, dias.indexOf(diaOn))]} ${corto(diaOn)}` : "—"} · {turno ? `turno ${turno}` : "todos los turnos"} · {tren ? tren.replace("TREN-", "tren ") : "todos los trenes"}</b>
            {(turno !== 0 || tren !== "") && <button type="button" className="rp-limpiar" onClick={() => { setTurno(0); setTren(""); }}>Limpiar</button>}
          </div>
        </div>
      </section>

      {pdfListo && <VisorPdf url={pdfListo.url} titulo={pdfListo.nombre} cantidad={pdfListo.n} onCerrar={() => { URL.revokeObjectURL(pdfListo.url); setPdfListo(null) }} />}

      <div className="pe-kpis rp-kpis">
        <div className="pe-kpi grande"><span>Estibas planeadas</span><b>{nf.format(tot.plan)}</b></div>
        <div className="pe-kpi"><span>Rótulos impresos</span><b>{nf.format(tot.imp)}</b></div>
        <div className="pe-kpi"><span>Faltan por imprimir</span><b>{nf.format(tot.faltan)}</b></div>
        <div className="pe-kpi"><span>Adicionales</span><b>{nf.format(tot.adic)}</b></div>
        <div className="pe-kpi"><span>Reimpresos</span><b>{nf.format(tot.rei)}</b></div>
        <div className="pe-kpi"><span>Sobraron</span><b>{nf.format(tot.sob)}</b></div>
        <div className="pe-kpi"><span>Usados</span><b>{nf.format(tot.usados)}</b></div>
      </div>

      <div className="pe-fila">
        <p className="pe-nota">{diaOn ? <>Plan del <b>{corto(diaOn)}</b>{turno ? <> · turno {turno}</> : null}{tren ? <> · {tren}</> : null}. La cantidad de cada rótulo es la estiba completa del Maestro; la fecha de producción es el día del plan y el vencimiento se calcula con la vida útil.</> : "Esta semana no tiene envase."}</p>
        {puedeImprimir && imprimibles.length > 0 && (
          <button type="button" className="btn" disabled={trabajando} onClick={() => void imprimir(imprimibles.map((b) => ({ b, n: est(b).faltan })))}>
            {trabajando ? "Armando…" : `Imprimir lo que falta (${nf.format(Math.min(MAX_PDF, imprimibles.reduce((a, b) => a + est(b).faltan, 0)))})`}
          </button>
        )}
      </div>
      {imprimibles.reduce((a, b) => a + est(b).faltan, 0) > MAX_PDF && <p className="pe-pie">Salen hasta {MAX_PDF} rótulos por PDF; después de imprimir vuelve a pulsar para el resto.</p>}

      {filas.length === 0 ? (
        <p className="fe-vacio">No hay envase planeado con ese filtro.</p>
      ) : (
        <div className="pe-tabla rp-bloques" tabIndex={0} aria-label="Bloques del plan para imprimir">
          <table>
            <thead>
              <tr>
                <th className="pe-izq">Línea</th><th className="pe-izq">Turno</th><th className="pe-izq">SKU</th>
                <th className="pe-der">Plan</th><th className="pe-der">Impresos</th><th className="pe-der">Faltan</th><th className="pe-der">Adic.</th>
                <th className="pe-der">Imprimir</th><th />
                <th className="pe-der">Sobraron</th><th className="pe-der">Usados</th><th className="pe-der">Vs plan</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((b, i) => {
                const e = est(b), k = llaveBloque(b);
                const nuevo = i === 0 || filas[i - 1].tren !== b.tren;
                const cant = cantidades[k] ?? String(Math.min(e.faltan, MAX_PDF));
                return (
                  <tr key={k} className={nuevo ? "pe-nuevo" : undefined}>
                    <th scope="row" className="pe-izq">{nuevo ? b.tren : ""}</th>
                    <td className="pe-izq">T{b.turno}</td>
                    <td className="pe-izq"><span className="pe-sku">{b.sku}</span><small>{b.problema ? <span className="rp-mal">{b.problema}</span> : `SAP ${b.sap} · ${b.cajas} cajas por estiba`}</small></td>
                    <td className="pe-der">{nf.format(b.planeadas)}</td>
                    <td className="pe-der">{nf.format(e.imp)}</td>
                    <td className={`pe-der${e.faltan === 0 ? " rp-ok" : ""}`}>{e.faltan === 0 ? "Listo" : nf.format(e.faltan)}</td>
                    <td className="pe-der">{e.adic ? nf.format(e.adic) : "·"}</td>
                    <td className="pe-der">
                      <input className="rp-cant" inputMode="numeric" aria-label={`Cuántos rótulos de ${b.sku}`} value={cant} disabled={!puedeImprimir || !!b.problema}
                        onChange={(ev) => setCantidades((c) => ({ ...c, [k]: ev.target.value.replace(/\D/g, "").slice(0, 3) }))} />
                    </td>
                    <td className="pe-der">
                      <button type="button" className="btn plano" disabled={!puedeImprimir || trabajando || !!b.problema || !(Number(cant) >= 1)} onClick={() => void imprimir([{ b, n: Math.min(Number(cant), MAX_PDF) }])}>Imprimir</button>
                    </td>
                    <td className="pe-der">
                      <input className="rp-cant rp-sobra" inputMode="numeric" aria-label={`Cuántos sobraron de ${b.sku}`} placeholder={e.imp + e.adic > 0 ? "—" : ""}
                        value={sobra[k] ?? (e.sob == null ? "" : String(e.sob))} disabled={!puedeImprimir || !!b.problema || e.imp + e.adic === 0}
                        onChange={(ev) => setSobra((m) => ({ ...m, [k]: ev.target.value.replace(/\D/g, "").slice(0, 3) }))}
                        onBlur={(ev) => void guardarSobra(b, ev.target.value)}
                        onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className="pe-der">{e.usados == null ? "·" : nf.format(e.usados)}</td>
                    <td className={`pe-der ${e.vs == null ? "" : e.vs > 0 ? "rp-mal" : e.vs < 0 ? "rp-mal" : "rp-ok"}`}>
                      {e.vs == null ? "·" : e.vs === 0 ? "Cuadra" : e.vs > 0 ? `+${nf.format(e.vs)} adicionales` : `${nf.format(e.vs)} menos`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!puedeImprimir && <p className="pe-pie">Puedes ver lo impreso. Imprimir rótulos requiere permiso de edición en Recepción.</p>}
      <p className="pe-pie">Si imprimes más estibas de las planeadas, las que pasan quedan como <b>adicionales</b>. Un rótulo dañado se reimprime desde la lista de abajo y queda anotado el motivo.</p>

      <h2 className="pe-t">Lo que se imprimió</h2>
      {lotesVis.length === 0 ? (
        <p className="fe-vacio">Todavía no se ha impreso nada con este filtro.</p>
      ) : (
        <div className="pe-tabla" tabIndex={0} aria-label="Impresiones">
          <table className="pe-chica">
            <thead><tr><th className="pe-izq">Cuándo</th><th className="pe-izq">Quién</th><th className="pe-izq">Línea · turno</th><th className="pe-izq">SKU</th><th className="pe-der">Rótulos</th><th className="pe-izq">Folios</th><th className="pe-izq">Tipo</th><th /></tr></thead>
            <tbody>
              {lotesVis.map((l) => {
                const b = bloques.find((x) => llaveBloque(x) === llaveBloque(l));
                const abierto = reimp?.l.lote === l.lote && reimp.l.sap === l.sap && reimp.l.turno === l.turno && reimp.l.tren === l.tren;
                return (
                  <FilaLote key={l.lote + l.tren + l.turno + l.sap} l={l} sku={b?.sku ?? l.sap} abierto={abierto} reimp={reimp} puede={puedeImprimir && !trabajando}
                    onReabrir={() => void reabrir(l)} onAbrir={() => setReimp({ l, desde: String(l.desde), hasta: String(l.hasta), motivo: "Dañado" })} onCambio={setReimp} onCerrar={() => setReimp(null)} onReimprimir={() => void reimprimir()} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FilaLote({ l, sku, abierto, reimp, puede, onReabrir, onAbrir, onCambio, onCerrar, onReimprimir }: {
  l: LoteImpreso; sku: string; abierto: boolean; puede: boolean;
  reimp: { l: LoteImpreso; desde: string; hasta: string; motivo: string } | null;
  onReabrir: () => void; onAbrir: () => void; onCambio: (r: { l: LoteImpreso; desde: string; hasta: string; motivo: string }) => void; onCerrar: () => void; onReimprimir: () => void;
}) {
  return (
    <>
      <tr>
        <td className="pe-izq">{hora(l.impreso_en)}</td>
        <td className="pe-izq">{l.quien}</td>
        <td className="pe-izq">{l.tren} · T{l.turno}</td>
        <td className="pe-izq">{sku}</td>
        <td className="pe-der">{nf.format(l.cantidad)}</td>
        <td className="pe-izq rp-folios">{l.primero}{l.cantidad > 1 ? <> → {l.ultimo}</> : null}</td>
        <td className="pe-izq">{l.reimpresion ? <>Reimpresión · {l.motivo}</> : "Impresión"}{l.vigentes < l.cantidad ? <small> · {l.cantidad - l.vigentes} ya reemplazados</small> : null}</td>
        <td className="pe-der rp-botones">
          {!l.reimpresion && l.vigentes === l.cantidad && <button type="button" className="btn plano" disabled={!puede} onClick={onReabrir}>Volver a abrir</button>}
          {l.vigentes > 0 && <button type="button" className="btn plano" disabled={!puede} onClick={onAbrir}>Reimprimir</button>}
        </td>
      </tr>
      {abierto && reimp && (
        <tr className="rp-reimp">
          <td colSpan={8}>
            <div className="rp-reimp-caja">
              <label>Desde el rótulo <input inputMode="numeric" value={reimp.desde} onChange={(e) => onCambio({ ...reimp, desde: e.target.value.replace(/\D/g, "") })} /></label>
              <label>hasta el <input inputMode="numeric" value={reimp.hasta} onChange={(e) => onCambio({ ...reimp, hasta: e.target.value.replace(/\D/g, "") })} /></label>
              <label>Motivo <select value={reimp.motivo} onChange={(e) => onCambio({ ...reimp, motivo: e.target.value })}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select></label>
              <button type="button" className="btn" disabled={!puede} onClick={onReimprimir}>Reimprimir</button>
              <button type="button" className="btn plano" onClick={onCerrar}>Cancelar</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
