"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PetCabeza } from "./PetCabeza";
import { PonerSku } from "./PonerSku";
import {
  cantidad, colorFormato, formatosDe, nombreFormato, DIAS, diaSemana,
  type FilaPet, type Unidad,
} from "@/modulos/traspasos/pet";

const nf = (u: Unidad) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: u === "hl" ? 2 : 1 });
const UNIDADES: [Unidad, string][] = [["estibas", "Estibas"], ["pacas", "Pacas"], ["hl", "HL"]];
const corto = (f: string) => {
  const d = new Date(f + "T12:00:00Z");
  return `${DIAS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${d.toLocaleDateString("es-CO", { month: "short", timeZone: "UTC" }).replace(".", "")}`;
};

type Vh = { viaje: string; fecha: string; turno: string; hora: string | null; placa: string | null;
            origen: string | null; destino: string | null; por: Map<number | null, number>; total: number; sinSku: boolean; carga: number;
            /** Lo que trasladó: cada SKU con su descripción, formato y cantidad (en la unidad escogida). */
            skus: { sku: string; desc: string; fm: number | null; q: number }[] };

/**
 * LA TABLA DE PET. Un renglón por Vh (los SKU del mismo formato se suman), una columna por formato con una barrita
 * de su color (se ve de un vistazo qué pesó más en cada Vh), agrupada por día con su subtotal, y arriba el resumen
 * del periodo. Origen, destino, placa y unidad filtran aquí mismo; las fechas van a la base.
 */
export function TablaPet({ filas, desde, hasta }: { filas: FilaPet[]; desde: string; hasta: string }) {
  const router = useRouter();
  const [unidad, setUnidad] = useState<Unidad>("estibas");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [placa, setPlaca] = useState("");
  const [d1, setD1] = useState(desde);
  const [d2, setD2] = useState(hasta);
  /* El Vh sin SKU al que se le está poniendo (los de antes). */
  const [poniendo, setPoniendo] = useState<string | null>(null);

  const formatos = useMemo(() => formatosDe(filas), [filas]);
  const opc = (k: "origen" | "destino" | "placa") => [...new Set(filas.map((f) => f[k]).filter(Boolean) as string[])].sort();
  const vistas = filas.filter((f) => (!origen || f.origen === origen) && (!destino || f.destino === destino) && (!placa || f.placa === placa));

  const vhs = useMemo(() => {
    const m = new Map<string, Vh>();
    for (const f of vistas) {
      const v: Vh = m.get(f.viaje) ?? { viaje: f.viaje, fecha: f.fecha, turno: f.turno, hora: f.hora, placa: f.placa,
                                    origen: f.origen, destino: f.destino, por: new Map(), total: 0, sinSku: true, carga: 0, skus: [] };
      if (f.sku) v.sinSku = false;
      v.carga += f.estibas;
      const c = cantidad(f, unidad);
      v.por.set(f.formato_ml, (v.por.get(f.formato_ml) ?? 0) + c);
      if (f.sku) {
        const y = v.skus.find((x) => x.sku === f.sku);
        if (y) y.q += c; else v.skus.push({ sku: f.sku, desc: f.descripcion, fm: f.formato_ml, q: c });
      }
      v.total += c;
      m.set(f.viaje, v);
    }
    const orden = { C: 0, A: 1, B: 2 } as Record<string, number>;
    return [...m.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || (orden[a.turno] ?? 9) - (orden[b.turno] ?? 9) || (a.hora ?? "").localeCompare(b.hora ?? ""));
  }, [vistas, unidad]);

  const dias = [...new Set(vhs.map((v) => v.fecha))];
  /* Lo mismo que la hoja «Por SKU» del Excel: qué se trasladó, de mayor a menor. */
  const porSku = useMemo(() => {
    const m = new Map<string, { sku: string; desc: string; fm: number | null; q: number; vhs: Set<string>; placas: Set<string> }>();
    for (const v of vhs) for (const k of v.skus) {
      const x = m.get(k.sku) ?? { sku: k.sku, desc: k.desc, fm: k.fm, q: 0, vhs: new Set(), placas: new Set() };
      x.q += k.q; x.vhs.add(v.viaje); if (v.placa) x.placas.add(v.placa); m.set(k.sku, x);
    }
    return [...m.values()].sort((a, b) => b.q - a.q);
  }, [vhs]);
  const tot = (lista: Vh[], fm?: number | null) => lista.reduce((a, v) => a + (fm === undefined ? v.total : v.por.get(fm) ?? 0), 0);
  const enVhs = (fm: number | null) => vhs.filter((v) => (v.por.get(fm) ?? 0) > 0).length;
  const T = tot(vhs);
  const visibles = formatos.filter((fm) => (formatos.indexOf(fm) < 4) || enVhs(fm) > 0);
  const max = Math.max(1, ...vhs.flatMap((v) => [...v.por.values()]));
  const n = nf(unidad);
  const u = UNIDADES.find((x) => x[0] === unidad)![1].toLowerCase();

  function buscar() {
    const p = new URLSearchParams({ desde: d1 <= d2 ? d1 : d2, hasta: d1 <= d2 ? d2 : d1 });
    router.push(`/traspasos/pet?v=vhs&${p}`);
  }
  /* El Excel con la cara de CONTROL: los Vhs con sus SKU y descripción, por SKU y los promedios (como Programar). */
  const [bajando, setBajando] = useState(false);
  const [errExcel, setErrExcel] = useState<string | null>(null);
  async function excel() {
    setBajando(true); setErrExcel(null);
    try {
      const { armarLibroPet } = await import("@/modulos/traspasos/libro-pet");
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const filtro = [origen && `Origen ${origen}`, destino && `Destino ${destino}`, placa && `Placa ${placa}`].filter(Boolean).join(" · ");
      const buf = await armarLibroPet({ filas: vistas, unidad, desde, hasta, hoy, filtro });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `PET ${desde} a ${hasta} - ${u}.xlsx`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { setErrExcel(`No se pudo armar el Excel: ${e instanceof Error ? e.message : e}`) }
    finally { setBajando(false) }
  }

  return (
    <>
      <PetCabeza
        v="vhs"
        sub={<>Cada Vh que movió PET y cuánto llevó de cada formato, agrupado por día. El formato sale del SKU que se escoge al registrar el viaje.</>}
        rot={`VHS DE PET · ${corto(desde).toUpperCase()} AL ${corto(hasta).toUpperCase()}`}
        num={vhs.length}
        pie={<><b>{n.format(T)}</b> {u} en el periodo</>}
      />

      <section className="filtros">
        <div className="arriba"><div className="tp-f1">
          <label className="sel fecha"><span>Desde</span><input type="date" value={d1} max={d2} onChange={(e) => setD1(e.target.value)} /></label>
          <label className="sel fecha"><span>Hasta</span><input type="date" value={d2} onChange={(e) => setD2(e.target.value)} /></label>
          <button type="button" className="btn" onClick={buscar} disabled={d1 === desde && d2 === hasta}>Ver</button>
          <button type="button" className="btn si pv-plan" onClick={() => void excel()} disabled={vhs.length === 0 || bajando}>{bajando ? "Armando Excel…" : "Descargar Excel"}</button>
        </div><div className="tp-f2">
          <label className="sel"><span>Origen</span><select value={origen} onChange={(e) => setOrigen(e.target.value)}><option value="">Todos</option>{opc("origen").map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="sel"><span>Destino</span><select value={destino} onChange={(e) => setDestino(e.target.value)}><option value="">Todos</option>{opc("destino").map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="sel"><span>Placa</span><select value={placa} onChange={(e) => setPlaca(e.target.value)}><option value="">Todas</option>{opc("placa").map((x) => <option key={x}>{x}</option>)}</select></label>
          <div className="sel"><span>Unidad</span>
            <div className="seg" role="group" aria-label="Unidad">
              {UNIDADES.map(([k, t]) => <button key={k} type="button" className={unidad === k ? "on" : ""} aria-pressed={unidad === k} onClick={() => setUnidad(k)}>{t}</button>)}
            </div>
          </div>
        </div></div>
      </section>
      {errExcel && <p className="aviso" role="alert">{errExcel}</p>}

      {vhs.length === 0 ? (
        <section className="caja"><div className="vacio">
          {filas.length === 0
            ? <><b>No hay Vhs de PET con SKU entre estas fechas</b>Salen aquí los viajes de un tipo PET registrados con su SKU (Traspasos › Registrar).</>
            : <><b>Ningún Vh con esos filtros</b>Quita algún filtro para ver más.</>}
        </div></section>
      ) : (<>
        <section className="cifras pv-cifras" aria-label="Resumen del periodo">
          {visibles.map((fm) => {
            const t = tot(vhs, fm);
            return (
              <div key={String(fm)} className="cifra" style={{ borderLeftColor: colorFormato(fm) }}>
                <div className="rot">{nombreFormato(fm).toUpperCase()}</div>
                <div className="n">{n.format(t)}</div>
                <div className="u">{u} · {T ? Math.round((100 * t) / T) : 0} % del PET · en {enVhs(fm)} {enVhs(fm) === 1 ? "Vh" : "Vhs"}</div>
              </div>
            );
          })}
        </section>

        <div className="caja pv-tabla-caja">
          <table className="pv-tabla">
            <thead>
              <tr>
                <th>Turno</th><th>Hora</th><th>Placa</th><th>Origen → destino</th><th>SKU · descripción</th>
                {visibles.map((fm) => <th key={String(fm)} className="n"><i className="sw" style={{ background: colorFormato(fm) }} />{nombreFormato(fm)}</th>)}
                <th className="n tt">Total</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d) => {
                const del = vhs.filter((v) => v.fecha === d);
                return [
                  <tr key={d} className="dia">
                    <td colSpan={5}><b>{corto(d)}</b><small>{del.length} {del.length === 1 ? "Vh" : "Vhs"} · {n.format(tot(del))} {u}</small></td>
                    {visibles.map((fm) => <td key={String(fm)} className="n">{tot(del, fm) ? n.format(tot(del, fm)) : "—"}</td>)}
                    <td className="n tt">{n.format(tot(del))}</td>
                  </tr>,
                  ...del.flatMap((v) => [
                    <tr key={v.viaje}>
                      <td><span className="turno">{v.turno}</span></td>
                      <td>{v.hora?.slice(0, 5) ?? ""}</td>
                      <td>{v.placa ? <span className="pl">{v.placa}</span> : "—"}</td>
                      <td className="pv-ruta"><b>{v.origen ?? "—"}</b> <span>→</span> {v.destino ?? "—"}</td>
                      <td className="pv-skus">
                        {v.skus.length ? v.skus.map((k) => (
                          <span key={k.sku} className="pv-sku"><i className="sw" style={{ background: colorFormato(k.fm) }} /><b>{k.sku}</b> {k.desc}{v.skus.length > 1 && <em> · {n.format(k.q)}</em>}</span>
                        )) : <span className="pv-sku sin">Sin SKU</span>}
                      </td>
                      {visibles.map((fm) => {
                        const c = v.por.get(fm) ?? 0;
                        return (
                          <td key={String(fm)} className="n">
                            {c ? <span className="cel">
                                   {fm === null && v.sinSku && <button type="button" className="pv-ponerbt" onClick={() => setPoniendo(poniendo === v.viaje ? null : v.viaje)}>Poner SKU</button>}
                                   <u style={{ width: `${Math.max(4, Math.round((64 * c) / max))}px`, background: colorFormato(fm) }} /><em>{n.format(c)}</em></span>
                               : <span className="cel z"><em>—</em></span>}
                          </td>
                        );
                      })}
                      <td className="n tt"><b>{n.format(v.total)}</b></td>
                    </tr>,
                    ...(poniendo === v.viaje ? [
                      <tr key={`${v.viaje}-poner`} className="pv-poner-fila"><td colSpan={6 + visibles.length}>
                        <PonerSku viaje={v.viaje} carga={v.carga} alCerrar={() => setPoniendo(null)} alGuardar={() => { setPoniendo(null); router.refresh() }} />
                      </td></tr>,
                    ] : []),
                  ]),
                ];
              })}
              <tr className="sum">
                <td colSpan={5}>Total · {vhs.length} {vhs.length === 1 ? "Vh" : "Vhs"} · {porSku.length} SKU</td>
                {visibles.map((fm) => <td key={String(fm)} className="n">{n.format(tot(vhs, fm))}</td>)}
                <td className="n tt">{n.format(T)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <details className="caja pv-porsku">
          <summary><b>Por SKU</b> · qué se trasladó, de mayor a menor ({porSku.length} SKU)</summary>
          <div className="pv-tabla-caja">
            <table className="pv-tabla">
              <thead><tr><th>SKU</th><th>Descripción</th><th>Formato</th><th className="n">Vhs</th><th>Placas</th><th className="n tt">Total ({u})</th><th className="n">% del total</th></tr></thead>
              <tbody>
                {porSku.map((k) => (
                  <tr key={k.sku}>
                    <td><b>{k.sku}</b></td>
                    <td className="pv-desc">{k.desc}</td>
                    <td><i className="sw" style={{ background: colorFormato(k.fm) }} />{nombreFormato(k.fm)}</td>
                    <td className="n">{k.vhs.size}</td>
                    <td className="pv-desc">{[...k.placas].join(" · ")}</td>
                    <td className="n tt"><b>{n.format(k.q)}</b></td>
                    <td className="n">{T ? `${n.format((100 * k.q) / T)} %` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="guia">Del {corto(desde)} al {corto(hasta)} · {DIAS[diaSemana(hasta)]} incluido. Un Vh que lleva dos SKU del mismo formato suma los dos en esa columna. A los viajes de antes el formato se les saca del documento SAP del viaje (Traspasos › Importar) o de la nota; «Sin formato» son los que no traen ninguno de los dos: cuentan como Vh con su carga.</p>
      </>)}
    </>
  );
}
