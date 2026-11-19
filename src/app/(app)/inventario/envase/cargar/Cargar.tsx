"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { leerInstructivo, leerMB51, queEs, type FilaMB51, type PlanLeido } from "@/modulos/inventario/envase/leer";
import { masDias } from "@/modulos/inventario/envase/calc";

type Existente = { lunes: string; generado: string; desde: string; semana: number };
type Leido =
  | { id: string; nombre: string; tipo: "plan"; plan: PlanLeido; incluir: boolean }
  | { id: string; nombre: string; tipo: "mb51"; filas: FilaMB51[]; incluir: boolean };

const n0 = (x: number) => Math.round(x).toLocaleString("es-CO");
const fecha = (f: string) => new Date(f.slice(0, 10) + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");
const fh = (g: string) => `${fecha(g)} ${g.slice(11, 16)}`;

/**
 * CARGAR. Un solo lugar para los dos tipos de archivo, tal como salen de Suite 360 y de SAP. La pantalla reconoce
 * qué es cada uno, muestra lo que leyó (y si cuadra) y nada se guarda hasta «Guardar».
 */
export function Cargar({ existentes, puedeCargar }: { existentes: Existente[]; puedeCargar: boolean }) {
  const router = useRouter();
  const entradaRef = useRef<HTMLInputElement>(null);
  const [leidos, setLeidos] = useState<Leido[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [sobre, setSobre] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  async function leer(archivos: FileList | File[]) {
    setHecho(null); setLeyendo(true);
    const nuevos: Leido[] = [], errs: string[] = [];
    for (const f of Array.from(archivos)) {
      try {
        const buf = await f.arrayBuffer();
        const t = await queEs(buf, f.name);
        if (t === "instructivo") {
          const r = await leerInstructivo(buf, f.name, f.lastModified);
          if (r.error) errs.push(`${f.name}: ${r.error}`);
          for (const p of r.planes) nuevos.push({ id: `${f.name}|${p.hoja}`, nombre: f.name, tipo: "plan", plan: p, incluir: true });
        } else if (t === "mb51") {
          const r = await leerMB51(buf);
          if (r.error) errs.push(`${f.name}: ${r.error}`);
          else nuevos.push({ id: f.name, nombre: f.name, tipo: "mb51", filas: r.filas, incluir: true });
        } else errs.push(`${f.name}: no es un instructivo de envase ni una MB51.`);
      } catch (e) { errs.push(`${f.name}: no se pudo leer (${e instanceof Error ? e.message : "error"}).`) }
    }
    setLeidos((x) => [...x.filter((y) => !nuevos.some((n) => n.id === y.id)), ...nuevos]);
    setErrores(errs); setLeyendo(false);
  }

  /* Qué papel tendría cada plan: el primero que cubre desde el lunes es el inicial; los demás, cortes. */
  function papel(p: PlanLeido) {
    const mismos = [
      ...existentes.filter((e) => e.lunes === p.lunes && e.generado.slice(0, 19) !== p.generado),
      ...leidos.filter((l): l is Extract<Leido, { tipo: "plan" }> => l.tipo === "plan" && l.incluir && l.plan.lunes === p.lunes).map((l) => l.plan),
    ].sort((a, b) => a.generado.localeCompare(b.generado));
    const inicial = mismos.find((x) => x.desde <= x.lunes);
    const repite = existentes.some((e) => e.lunes === p.lunes && e.generado.slice(0, 19) === p.generado);
    if (inicial && inicial.generado === p.generado) return { t: "PLAN INICIAL", c: "ok", txt: `Es el primero de la semana ${p.semana} que cubre desde el lunes: queda como plan inicial (la base fija).`, repite };
    if (!inicial) return { t: "CORTE", c: "av", txt: `La semana ${p.semana} no tiene plan inicial (este empieza el ${fecha(p.desde)}): entra como corte. Sube también el instructivo con que arrancó la semana.`, repite };
    return { t: "CORTE", c: "ok", txt: `Ya hay plan inicial de la semana ${p.semana}: este entra como corte y manda desde el ${fecha(p.desde)}.`, repite };
  }

  async function guardar() {
    const s = createClient();
    const sel = leidos.filter((l) => l.incluir);
    const partes: string[] = [];
    try {
      for (const l of sel.filter((x): x is Extract<Leido, { tipo: "plan" }> => x.tipo === "plan")) {
        const p = l.plan;
        setGuardando(`Guardando ${p.hoja}…`);
        const r = await s.rpc("pe_guardar_plan", {
          p_cabeza: { anio: p.anio, semana: p.semana, generado: p.generado, archivo: p.archivo, desde: p.desde, hasta: p.hasta, lunes: p.lunes, total_hl: Math.round(p.total_hl * 100) / 100 },
          p_filas: p.filas,
        });
        if (r.error) throw new Error(/pe_guardar_plan|does not exist|PGRST202/i.test(r.error.message) ? "Falta correr 2026-11-plan-envase.sql en Supabase." : r.error.message);
        partes.push(`${p.hoja} (${n0(p.total_hl)} HL)`);
      }
      for (const l of sel.filter((x): x is Extract<Leido, { tipo: "mb51" }> => x.tipo === "mb51")) {
        let nuevos = 0;
        for (let i = 0; i < l.filas.length; i += 500) {
          setGuardando(`Guardando la MB51… ${Math.min(l.filas.length, i + 500).toLocaleString("es-CO")} de ${l.filas.length.toLocaleString("es-CO")}`);
          const r = await s.rpc("pe_guardar_mb51", { p_filas: l.filas.slice(i, i + 500) });
          if (r.error) throw new Error(/pe_guardar_mb51|does not exist|PGRST202/i.test(r.error.message) ? "Falta correr 2026-11-plan-envase.sql en Supabase." : r.error.message);
          nuevos += Number(r.data) || 0;
        }
        partes.push(`MB51: ${n0(nuevos)} movimientos nuevos, ${n0(l.filas.length - nuevos)} ya estaban`);
      }
      setHecho(`Guardado: ${partes.join(" · ")}.`); setLeidos([]); setErrores([]);
      router.refresh();
    } catch (e) {
      setErrores([e instanceof Error ? e.message : "No se pudo guardar."]);
    } finally { setGuardando(null) }
  }

  const marcar = (id: string) => setLeidos((x) => x.map((l) => (l.id === id ? { ...l, incluir: !l.incluir } : l)));
  const hay = leidos.some((l) => l.incluir);

  return (
    <>
      <div
        className={`pe-drop${sobre ? " sobre" : ""}`} role="button" tabIndex={0}
        onClick={() => entradaRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entradaRef.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)}
        onDrop={(e) => { e.preventDefault(); setSobre(false); if (e.dataTransfer.files.length) void leer(e.dataTransfer.files) }}
      >
        <span className="ic" aria-hidden>↥</span>
        <div><b>{leyendo ? "Leyendo…" : "Arrastra aquí el instructivo o la MB51 (uno o varios a la vez)"}</b>
          <span>Tal como salen: Instructivo_Envase_Barranquilla_*.xlsx de Suite 360 y la MB51 exportada de SAP. La MB51 se puede subir completa cada vez: lo repetido se salta solo.</span></div>
        <span className="pe-bt">Escoger archivo</span>
        <input ref={entradaRef} type="file" accept=".xlsx,.xls,.XLSX" multiple hidden onChange={(e) => { if (e.target.files?.length) void leer(e.target.files); e.target.value = "" }} />
      </div>

      {errores.map((e, i) => <p key={i} className="pe-error">{e}</p>)}
      {hecho && <p className="pe-ok">{hecho}</p>}

      {leidos.length > 0 && (<>
        <div className="pe-lec">
          {leidos.map((l) => {
            if (l.tipo === "plan") {
              const p = l.plan, pp = papel(p), cuadra = Math.abs(p.total_hl - p.totalEspecifico) < 1;
              const trenes = [...new Set(p.filas.map((f) => f.tren.replace(/^TREN-?/i, "")))].join(", ");
              const skus = new Set(p.filas.map((f) => f.sku).filter(Boolean)).size;
              return (
                <section key={l.id} className={`pe-card pe-lc lc-${!cuadra || p.sinSku.length ? "mal" : pp.c}`}>
                  <h4><span className="pe-tag t-n">{pp.t}</span>{p.hoja}
                    <label><input type="checkbox" checked={l.incluir} onChange={() => marcar(l.id)} /> guardar</label></h4>
                  <p className="f">{l.nombre}</p>
                  <dl>
                    <dt>Generado</dt><dd>{fh(p.generado)}</dd>
                    <dt>Semana</dt><dd>{p.semana} · {fecha(p.lunes)} al {fecha(masDias(p.lunes, 6))}</dd>
                    <dt>Cubre</dt><dd>{fecha(p.desde)} al {fecha(p.hasta)}</dd>
                    <dt>Trenes · SKU</dt><dd>{trenes} · {skus}</dd>
                    <dt>Total</dt><dd>{n0(p.total_hl)} HL</dd>
                    <dt>Cuadre</dt><dd className={cuadra ? "bien" : "mal"}>{cuadra ? "= pendiente específico ✓" : `rejilla ${n0(p.total_hl)} ≠ ${n0(p.totalEspecifico)} HL`}</dd>
                  </dl>
                  {p.sinSku.length > 0 && <p className="pe-error">No supe a qué SKU va: {p.sinSku.join(" · ")}</p>}
                  <p className={pp.c === "av" ? "pe-aviso" : "pe-ok"}>{pp.txt}{pp.repite ? " Ya estaba cargado: se reemplaza." : ""}</p>
                </section>
              );
            }
            const f = l.filas;
            const contab = f.map((x) => x.fecha_contab).sort();
            const ult = f.map((x) => `${x.fecha_entrada}T${x.hora_entrada}`).sort().at(-1)!;
            const clases = [...new Set(f.map((x) => x.clase))].sort().join(" ");
            const diaUlt = ult.slice(0, 10);
            const abierto = ult < `${diaUlt}T06:00:00` ? masDias(diaUlt, -1) : diaUlt;
            return (
              <section key={l.id} className="pe-card pe-lc lc-av">
                <h4><span className="pe-tag t-n">MB51</span>{[...new Set(f.map((x) => x.centro))].filter(Boolean).join(", ") || "SAP"}
                  <label><input type="checkbox" checked={l.incluir} onChange={() => marcar(l.id)} /> guardar</label></h4>
                <p className="f">{l.nombre}</p>
                <dl>
                  <dt>Movimientos</dt><dd>{n0(f.length)}</dd>
                  <dt>Contabilizado</dt><dd>{fecha(contab[0])} al {fecha(contab.at(-1)!)}</dd>
                  <dt>Último digitado</dt><dd>{fh(ult)}</dd>
                  <dt>Clases</dt><dd>{clases}</dd>
                  <dt>Repetidos</dt><dd>se saltan solos</dd>
                </dl>
                <p className="pe-aviso">El <b>{fecha(abierto)}</b> queda abierto: la noche se notifica de madrugada. Se cierra cuando subas una MB51 sacada después de las 6:00 del día siguiente.</p>
              </section>
            );
          })}
        </div>
        <div className="pe-acciones">
          <button type="button" className="pe-bt" onClick={() => { setLeidos([]); setErrores([]) }} disabled={!!guardando}>Cancelar</button>
          <button type="button" className="pe-bt am" onClick={guardar} disabled={!hay || !!guardando || !puedeCargar}>
            {guardando ?? (puedeCargar ? "Guardar" : "Sin permiso para guardar")}
          </button>
        </div>
      </>)}
    </>
  );
}
