"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { leerPlanEnvase, MEDIDAS, vistaSemana, type Bloque, type Medida, type Factores, type Pendiente, type SemanaPlan } from "@/modulos/inventario/plan-envase";

/**
 * INVENTARIO · RECEPCIÓN · PLAN DE ENVASE.
 *
 * Se sube el Instructivo de Envase (una hoja por semana) y para cada semana
 * se ve CUÁNTAS ESTIBAS van a llegar, qué día, en qué turno y de qué línea:
 *
 *   «Pendiente por envasar específico» → unidades por SKU
 *   ÷ referencia (envases por caja)    → cajas
 *   ÷ factor de estibado del Maestro   → estibas
 *   y la grilla de cada tren           → el día y el turno de cada bloque
 *
 * Lo que se sube se ve de inmediato como borrador («sin guardar»); al
 * guardar queda en Supabase para toda la bodega. Subir una semana que ya
 * estaba la reemplaza. Las estibas no se guardan: se calculan al mirar con
 * el factor de estibado que el Maestro tenga ese día.
 */

export type SemanaGuardada = {
  id: string; anio: number; semana: number; fecha_ini: string; fecha_fin: string;
  escenario: string | null; generado: string | null; archivo: string | null; cargado_en: string;
  pendientes: Pendiente[]; bloques: Bloque[];
};
type Mostrada = { llave: string; borrador: boolean; id?: string; s: Pick<SemanaPlan, "anio" | "semana" | "fecha_ini" | "fecha_fin" | "escenario" | "generado" | "pendientes" | "bloques" | "avisos">; archivo: string | null };

const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corto = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)} ${MES[Number(m) - 1]}` };
const rango = (a: string, b: string) => `${corto(a)} – ${corto(b)}`;
const e0 = (n: number) => (n > 0.0049 ? nf0.format(n) : "·");

export function PlanEnvase({ guardadas, factores: fac, puedeSubir }: {
  guardadas: SemanaGuardada[];
  factores: [string, { cajas_por_estiba: number | null; nombre: string | null }][];
  puedeSubir: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const factores: Factores = useMemo(() => new Map(fac), [fac]);
  const [subidas, setSubidas] = useState<{ archivo: string; semanas: SemanaPlan[] } | null>(null);
  const [llave, setLlave] = useState<string | null>(null);
  const [turnos, setTurnos] = useState(false);
  const [medida, setMedida] = useState<Medida>("estibas");
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  /* Lo que hay para mirar: lo subido (borrador) manda sobre lo guardado de la misma semana. */
  const lista: Mostrada[] = useMemo(() => {
    const m = new Map<string, Mostrada>();
    for (const g of guardadas) m.set(`${g.anio}-${g.semana}`, { llave: `${g.anio}-${g.semana}`, borrador: false, id: g.id, s: { ...g, avisos: [] }, archivo: g.archivo });
    for (const s of subidas?.semanas ?? []) m.set(`${s.anio}-${s.semana}`, { llave: `${s.anio}-${s.semana}`, borrador: true, s, archivo: subidas!.archivo });
    return [...m.values()].sort((a, b) => b.s.anio - a.s.anio || b.s.semana - a.s.semana);
  }, [guardadas, subidas]);
  const actual = lista.find((x) => x.llave === llave) ?? lista[0] ?? null;
  const v = useMemo(() => (actual ? vistaSemana(actual.s, factores) : null), [actual, factores]);
  /* La tabla se pinta en la medida escogida (estibas, cajas, unidades o HL); las cifras de arriba siempre son estibas. */
  const vm = useMemo(() => (actual ? (medida === "estibas" ? v : vistaSemana(actual.s, factores, medida)) : null), [actual, factores, medida, v]);
  const med = MEDIDAS.find((m) => m.id === medida)!;

  async function leer(f: File | undefined) {
    if (!f) return;
    setLeyendo(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const semanas = leerPlanEnvase(wb as unknown as { SheetNames: string[]; Sheets: Record<string, unknown> });
      if (!semanas.length) { avisar.mal("No encontré hojas «Semana N» en ese archivo. Sube el Instructivo de Envase tal como sale de Suite 360."); return }
      setSubidas({ archivo: f.name, semanas });
      setLlave(`${semanas[0].anio}-${semanas[0].semana}`);
      avisar.info(`Leí ${semanas.length} ${semanas.length === 1 ? "semana" : "semanas"} de ${f.name}. Revísalas y guarda las que sirvan.`);
    } catch (e) {
      avisar.mal("No pude leer el archivo: " + (e instanceof Error ? e.message : "formato desconocido"));
    } finally { setLeyendo(false); if (entrada.current) entrada.current.value = "" }
  }

  async function guardar(cuales: SemanaPlan[]) {
    if (!subidas || !cuales.length) return;
    setGuardando(true);
    const supabase = createClient();
    let hechas = 0;
    for (const s of cuales) {
      const { error } = await supabase.rpc("plan_envase_guardar", {
        p_semana: { anio: s.anio, semana: s.semana, fecha_ini: s.fecha_ini, fecha_fin: s.fecha_fin, escenario: s.escenario, generado: s.generado, archivo: subidas.archivo, pendientes: s.pendientes, bloques: s.bloques },
      });
      if (error) { avisar.mal(`Semana ${s.semana}: ${error.message}`); break }
      hechas++;
    }
    setGuardando(false);
    if (!hechas) return;
    avisar.bien(hechas === 1 ? "Semana guardada." : `${hechas} semanas guardadas.`);
    const quedan = subidas.semanas.filter((s) => !cuales.slice(0, hechas).includes(s));
    setSubidas(quedan.length ? { ...subidas, semanas: quedan } : null);
    router.refresh();
  }

  async function borrar(m: Mostrada) {
    if (!m.id) return;
    if (!(await pedir({ titulo: `¿Borrar la semana ${m.s.semana}?`, dice: "Se quita el plan de esa semana de Supabase. Se puede volver a subir el Excel.", confirmar: "Borrar", peligro: true }))) return;
    const { error } = await createClient().rpc("plan_envase_borrar", { p_id: m.id });
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`Semana ${m.s.semana} borrada.`);
    setLlave(null); router.refresh();
  }

  async function bajar() {
    if (!actual || !v) return;
    const { armarPlanEnvase } = await import("@/modulos/inventario/libro-plan-envase");
    const otras = (["cajas", "unidades", "hl"] as const).map((m) => ({ nombre: `${MEDIDAS.find((x) => x.id === m)!.txt} por día`, unidad: MEDIDAS.find((x) => x.id === m)!.unidad, vista: vistaSemana(actual.s, factores, m) }));
    const logo = await fetch("/marca/logo-bavaria.png").then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    const buf = await armarPlanEnvase({ logo, semana: actual.s, vista: v, borrador: actual.borrador, archivo: actual.archivo, otras });
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = `Plan de envase · semana ${actual.s.semana} ${actual.s.anio}.xlsx`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const totalUni = v?.skus.reduce((a, f) => a + f.unidades, 0) ?? 0;
  const totalHl = actual?.s.pendientes.reduce((a, p) => a + p.hl, 0) ?? 0;
  const totalCajas = v?.skus.reduce((a, f) => a + (f.cajas ?? 0), 0) ?? 0;
  const diasConEnvase = v ? v.dias.filter((d) => (v.porDia[d] ?? 0) > 0).length : 0;
  const mayor = v ? v.dias.reduce((a, d) => ((v.porDia[d] ?? 0) > (v.porDia[a] ?? 0) ? d : a), v.dias[0]) : null;

  return (
    <section className="pe">
      {avisos}{dialogo}
      <div className="pe-barra">
        <div className="pe-sube">
          <input ref={entrada} type="file" accept=".xlsx,.xlsm" className="sr" id="pe-archivo" onChange={(e) => void leer(e.target.files?.[0])} />
          <label htmlFor="pe-archivo" className={`btn${puedeSubir ? "" : " plano"}`} aria-disabled={!puedeSubir} onClick={(e) => { if (!puedeSubir) e.preventDefault() }}>
            {leyendo ? "Leyendo…" : "Subir el plan (Excel)"}
          </label>
          <span className="pe-ayuda">{puedeSubir
            ? "El «Instructivo de Envase» de Suite 360: una hoja por semana."
            : "Puedes ver los planes guardados. Subir uno requiere permiso de edición en Recepción."}</span>
        </div>
        {subidas && (
          <div className="pe-borrador" role="status">
            <b>{subidas.semanas.length} {subidas.semanas.length === 1 ? "semana" : "semanas"} sin guardar</b> · {subidas.archivo}
            <span className="pe-acciones">
              {actual?.borrador && <button type="button" className="btn" disabled={guardando} onClick={() => void guardar(subidas.semanas.filter((s) => `${s.anio}-${s.semana}` === actual.llave))}>Guardar la semana {actual.s.semana}</button>}
              {subidas.semanas.length > 1 && <button type="button" className="btn plano" disabled={guardando} onClick={() => void guardar(subidas.semanas)}>Guardar las {subidas.semanas.length}</button>}
              <button type="button" className="btn plano" disabled={guardando} onClick={() => setSubidas(null)}>Descartar</button>
            </span>
          </div>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="fe-vacio">Todavía no hay ningún plan. Sube el Instructivo de Envase y aquí aparece, semana por semana, cuántas estibas van a llegar cada día.</p>
      ) : (
        <>
          <div className="pe-semanas" role="tablist" aria-label="Semanas del plan">
            {lista.map((x) => (
              <button key={x.llave} type="button" role="tab" aria-selected={x.llave === actual?.llave} className={`pe-sem${x.llave === actual?.llave ? " on" : ""}`} onClick={() => setLlave(x.llave)}>
                <b>Semana {x.s.semana}</b>
                <span>{rango(x.s.fecha_ini, x.s.fecha_fin)}</span>
                {x.borrador && <i>sin guardar</i>}
              </button>
            ))}
          </div>

          {actual && v && vm && (
            <>
              <div className="pe-kpis">
                <div className="pe-kpi grande"><span>Estibas de la semana</span><b>{nf0.format(v.total)}</b></div>
                <div className="pe-kpi"><span>Cajas</span><b>{nf0.format(totalCajas)}</b></div>
                <div className="pe-kpi"><span>Unidades</span><b>{nf0.format(totalUni)}</b></div>
                <div className="pe-kpi"><span>Hectolitros</span><b>{nf0.format(totalHl)}</b></div>
                <div className="pe-kpi"><span>SKU en el plan</span><b>{v.skus.length}</b></div>
                <div className="pe-kpi"><span>Día más cargado</span><b>{mayor ? `${DIAS[v.dias.indexOf(mayor)]} ${corto(mayor)}` : "—"}</b><small>{mayor ? `${nf0.format(v.porDia[mayor] ?? 0)} estibas` : ""}</small></div>
              </div>

              <div className="pe-fila">
                <p className="pe-nota">
                  Del <b>{corto(actual.s.fecha_ini)}</b> al <b>{corto(actual.s.fecha_fin)}</b> · {diasConEnvase} {diasConEnvase === 1 ? "día" : "días"} con envase
                  {actual.s.escenario ? <> · {actual.s.escenario}</> : null}{actual.s.generado ? <> · generado {corto(actual.s.generado)}</> : null}
                  {actual.archivo ? <> · {actual.archivo}</> : null}
                </p>
                <div className="pe-acciones">
                  <div className="pe-medidas" role="radiogroup" aria-label="Medida de la tabla">{MEDIDAS.map((m) => <button key={m.id} type="button" role="radio" aria-checked={m.id === medida} className={`pe-medida${m.id === medida ? " on" : ""}`} onClick={() => setMedida(m.id)}>{m.txt}</button>)}</div>
                  <label className="pe-interruptor"><input type="checkbox" checked={turnos} onChange={(e) => setTurnos(e.target.checked)} /> Ver por turno</label>
                  <button type="button" className="btn plano" onClick={() => void bajar()}>Bajar Excel</button>
                  {!actual.borrador && puedeSubir && <button type="button" className="btn plano" onClick={() => void borrar(actual)}>Borrar semana</button>}
                </div>
              </div>

              {(actual.s.avisos.length > 0 || v.sinFactor.length > 0) && (
                <div className="pe-avisos" role="status">
                  {v.sinFactor.length > 0 && (
                    <p><b>Sin factor de estibado en el Maestro:</b> {v.sinFactor.map((f) => `${f.sku} (${f.sap})`).join(", ")}. Esas estibas no se pueden calcular; ponles las «cajas por estiba» en Maestro.</p>
                  )}
                  {actual.s.avisos.map((a, i) => <p key={i}>{a}</p>)}
                </div>
              )}

              <h2 className="pe-t">{med.txt} por día</h2>
              <div className="pe-tabla" tabIndex={0} aria-label={`${med.txt} por SKU y día`}>
                <table>
                  <thead>
                    <tr>
                      <th rowSpan={turnos ? 2 : 1} className="pe-izq pe-c1">Línea</th>
                      <th rowSpan={turnos ? 2 : 1} className="pe-izq pe-c2">SKU</th>
                      <th rowSpan={turnos ? 2 : 1} className="pe-der" title="Cajas por estiba (factor de estibado del Maestro)">Caj/est</th>
                      {vm.dias.map((d, i) => <th key={d} colSpan={turnos ? 3 : 1} className={`pe-der pe-dia${(vm.porDia[d] ?? 0) > 0 ? "" : " vacio"}`}>{DIAS[i]} {corto(d)}</th>)}
                      <th rowSpan={turnos ? 2 : 1} className="pe-der pe-tot">Total</th>
                    </tr>
                    {turnos && <tr>{vm.dias.map((d) => ["T1", "T2", "T3"].map((t) => <th key={d + t} className="pe-der pe-turno">{t}</th>))}</tr>}
                  </thead>
                  <tbody>
                    {vm.skus.map((f, i) => {
                      const nuevo = i === 0 || vm.skus[i - 1].tren !== f.tren;
                      return (
                        <tr key={f.tren + f.sap} className={nuevo ? "pe-nuevo" : undefined}>
                          <th scope="row" className="pe-izq pe-c1">{nuevo ? f.tren : ""}</th>
                          <td className="pe-izq pe-c2"><span className="pe-sku">{f.sku}</span><small>SAP {f.sap}{f.formato && f.referencia ? ` · ${f.formato} cc × ${f.referencia}` : ""}</small></td>
                          <td className="pe-der pe-mut">{f.cpe ? nf0.format(f.cpe) : "—"}</td>
                          {vm.dias.map((d) => turnos
                            ? [0, 1, 2].map((k) => <td key={d + k} className="pe-der">{e0(f.porDia[d]?.t[k] ?? 0)}</td>)
                            : <td key={d} className="pe-der">{e0(f.porDia[d]?.total ?? 0)}</td>)}
                          <td className="pe-der pe-tot">{medida !== "estibas" || f.cpe ? nf0.format(f.enteras) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3} className="pe-izq">Total de {med.unidad}</th>
                      {vm.dias.map((d) => <Fragment key={d}>{turnos
                        ? [0, 1, 2].map((k) => <td key={d + k} className="pe-der">{e0(vm.skus.reduce((a, f) => a + (f.porDia[d]?.t[k] ?? 0), 0))}</td>)
                        : <td className="pe-der">{e0(vm.porDia[d] ?? 0)}</td>}</Fragment>)}
                      <td className="pe-der pe-tot">{nf0.format(vm.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="pe-pie">Cifras en estibas enteras: cada fila, columna y total suma exactamente lo que se ve (el redondeo se reparte, no se pierde). Estibas = unidades ÷ referencia ÷ cajas por estiba del Maestro. El día y el turno salen de la grilla del plan (T1 0–8 h · T2 8–16 h · T3 16–24 h) y cuentan el día en que se envasa.</p>

              <h2 className="pe-t">Por línea</h2>
              <div className="pe-tabla" tabIndex={0} aria-label={`${med.txt} por línea y día`}>
                <table className="pe-chica">
                  <thead><tr><th className="pe-izq">Línea</th>{vm.dias.map((d, i) => <th key={d} className="pe-der">{DIAS[i]} {corto(d)}</th>)}<th className="pe-der pe-tot">Total</th></tr></thead>
                  <tbody>
                    {vm.trenes.map((t) => (
                      <tr key={t.tren}><th scope="row" className="pe-izq">{t.tren}</th>{vm.dias.map((d) => <td key={d} className="pe-der">{e0(t.porDia[d] ?? 0)}</td>)}<td className="pe-der pe-tot">{nf0.format(t.total)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th className="pe-izq">Total</th>{vm.dias.map((d) => <td key={d} className="pe-der">{e0(vm.porDia[d] ?? 0)}</td>)}<td className="pe-der pe-tot">{nf0.format(vm.total)}</td></tr></tfoot>
                </table>
              </div>

              <details className="pe-cuadre">
                <summary>Cuadre con el Excel: unidades, cajas y estibas por SKU</summary>
                <div className="pe-tabla" tabIndex={0}>
                  <table className="pe-chica">
                    <thead><tr><th className="pe-izq">Línea</th><th className="pe-izq">SKU</th><th className="pe-der">SAP</th><th className="pe-der">Unidades</th><th className="pe-der">Referencia</th><th className="pe-der">Cajas</th><th className="pe-der">Caj/est</th><th className="pe-der pe-tot">Estibas</th></tr></thead>
                    <tbody>
                      {v.skus.map((f) => (
                        <tr key={f.tren + f.sap}><td className="pe-izq">{f.tren}</td><td className="pe-izq">{f.sku}</td><td className="pe-der">{f.sap}</td><td className="pe-der">{nf0.format(f.unidades)}</td><td className="pe-der">{f.referencia ?? "—"}</td><td className="pe-der">{f.cajas == null ? "—" : nf1.format(f.cajas)}</td><td className="pe-der">{f.cpe ?? "—"}</td><td className="pe-der pe-tot">{f.estibas == null ? "—" : nf1.format(f.estibas)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><th colSpan={3} className="pe-izq">Total</th><td className="pe-der">{nf0.format(totalUni)}</td><td /><td className="pe-der">{nf1.format(totalCajas)}</td><td /><td className="pe-der pe-tot">{nf1.format(v.skus.reduce((a, f) => a + (f.estibas ?? 0), 0))}</td></tr></tfoot>
                  </table>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
