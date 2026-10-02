"use client";

import { useMemo, useState } from "react";
import { analizar, conteoPorDefecto, type ConteoRef, type Corte as CorteT, type LineaConteo, type RenglonCorte, type Sitio } from "@/modulos/inventario/corte";
import { tablasDelPar } from "./Diferencia";
import type { LineaC, MatC, UbiC } from "./Corte";

/* ===================================================================
   EL PROCESO, CORTE POR CORTE (solo para quien administra)

   «Quería verlo como flujo, por proceso, por estas etapas: Corte 1, la tarjeta con
   la info; si tiene corte final lo muestra, y sale el porcentaje de cómo va.»

   Cada corte inicial es un «Corte N» (el 1 es el primero que se hizo) y se ve en tres
   etapas:  ① Corte inicial  →  ② Corte final  →  ③ Diferencia.

   EL PORCENTAJE es el de LÍNEAS: de las líneas que se cortaron al empezar, cuántas ya tienen
   su corte final. 3 de 4 líneas = 75 %. Sin corte final es 0 %, y con todas es 100 %.
   La etapa ③ dice CUADRA / NO CUADRA / INCOMPLETO contra el conteo que le toca.
   Solo se mira: aquí no se toca nada.
   =================================================================== */

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(", ", " ");

type Estado = "cuadra" | "no_cuadra" | "incompleto";
const TXT: Record<Estado, string> = { cuadra: "CUADRA", no_cuadra: "NO CUADRA", incompleto: "INCOMPLETO" };
const peor = (l: Estado[]): Estado => (l.includes("no_cuadra") ? "no_cuadra" : l.includes("incompleto") ? "incompleto" : "cuadra");

export function Proceso({ cortes, lineas, ubicaciones, materiales, conteos, lineasConteo, nombres }: {
  cortes: CorteT[]; lineas: LineaC[]; ubicaciones: UbiC[]; materiales: MatC[];
  conteos: ConteoRef[]; lineasConteo: LineaConteo[]; nombres: Record<string, string>;
}) {
  /* Primero el más viejo (el Corte 1) o primero el más nuevo: el número del corte no cambia. */
  const [nuevoPrimero, setNuevoPrimero] = useState(false);

  const mat = useMemo(() => new Map(materiales.map((m) => [m.id, m])), [materiales]);
  const ubi = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones]);
  const nombreUbi = useMemo(() => (id: string) => {
    const u = ubi.get(id);
    return u ? `${u.calle} · ${u.modulo} · ${u.lado ?? "—"}` : "—";
  }, [ubi]);
  const porConteo = useMemo(() => {
    const m = new Map<string, LineaConteo[]>();
    for (const l of lineasConteo) { const x = m.get(l.conteo_id); if (x) x.push(l); else m.set(l.conteo_id, [l]); }
    return m;
  }, [lineasConteo]);
  const nombreLinea = (c: string) => lineas.find((l) => l.clave === c)?.nombre ?? c;
  const sitios = (l: Sitio[]) => l.map((x) => `${nombreUbi(x.ubicacion_id)}: ${nf.format(x.cant)} ${x.unidad}`).join(" + ");

  const items = useMemo(() => {
    const finalDe = new Map(cortes.filter((c) => c.tipo === "final").map((c) => [c.inicial_id!, c]));
    const porEstiba = (id: string | null) => (id ? mat.get(id)?.cajas_por_estiba ?? null : null);
    const iniciales = cortes.filter((c) => c.tipo === "inicial").sort((a, b) => a.cortado_en.localeCompare(b.cortado_en));
    return iniciales.map((ini, i) => {
      const fin = finalDe.get(ini.id) ?? null;
      const conFinal = fin ? ini.renglones.filter((r) => fin.renglones.some((x) => x.linea === r.linea)).length : 0;
      const total = ini.renglones.length;
      const pct = total === 0 ? 0 : Math.round((conFinal / total) * 100);
      let estado: Estado | null = null;
      if (fin) {
        const t = tablasDelPar(analizar(ini, fin, porEstiba, nombreUbi), conteoPorDefecto(ini, conteos), porConteo, nombreUbi);
        estado = t.length === 0 ? "incompleto" : peor(t.map((x) => x.estado));
      }
      return { n: i + 1, ini, fin, conFinal, total, pct, estado };
    });
  }, [cortes, mat, nombreUbi, conteos, porConteo]);

  const lista = nuevoPrimero ? [...items].reverse() : items;
  const completos = items.filter((x) => x.pct === 100).length;

  const cuerpo = (r: RenglonCorte | undefined) => {
    if (!r) return null;
    const o = r.origenes.length > 0 ? <>Tomando de {sitios(r.origenes)}{r.envase_id && mat.get(r.envase_id) ? <> de {mat.get(r.envase_id)!.nombre}</> : null}</> : null;
    const d = r.destinos.length > 0 ? <>Ubicados en {sitios(r.destinos)}{r.material_id && mat.get(r.material_id) ? <> de {mat.get(r.material_id)!.nombre}</> : null}</> : null;
    return <span className="pr-det">{o}{o && d ? " · " : null}{d}</span>;
  };

  return (
    <div className="pr">
      <div className="pr-barra">
        <span className="pr-resumen">{completos} de {items.length} {items.length === 1 ? "corte completo" : "cortes completos"}</span>
        <button type="button" className="btn plano" aria-pressed={nuevoPrimero} onClick={() => setNuevoPrimero((x) => !x)}>
          {nuevoPrimero ? "Ver del primero al último" : "Ver del último al primero"}
        </button>
      </div>
      {lista.length === 0 && <p className="fe-vacio">Todavía no se ha hecho ningún corte.</p>}
      {lista.map((x, k) => (
        <details key={x.ini.id} className="pr-corte" open={k === 0}>
          <summary>
            <span className="pr-num">Corte {x.n}{x.n === 1 && <em className="cl-primero">EL PRIMERO</em>}</span>
            <span className="pr-cuando">{hora(x.ini.cortado_en)} · {x.ini.creado_por ? nombres[x.ini.creado_por] ?? "—" : "—"}</span>
            <span className="pr-pasos" aria-label="Etapas">
              <b className="pr-paso hecho">① Inicial</b>
              <b className={"pr-paso " + (x.fin ? "hecho" : "falta")}>② Final</b>
              <b className={"pr-paso " + (x.estado ?? "falta")}>③ {x.estado ? TXT[x.estado] : "Diferencia"}</b>
            </span>
            <span className="pr-pct" role="img" aria-label={`${x.pct} por ciento`}>
              <span className="pr-riel"><i style={{ width: `${x.pct}%` }} /></span>
              <b>{x.pct}%</b>
            </span>
          </summary>
          <div className="pr-cuerpo">
            <p className="pr-dice">
              {x.fin
                ? <>Corte final hecho el <b>{hora(x.fin.cortado_en)}</b> · <b>{x.conFinal} de {x.total}</b> {x.total === 1 ? "línea" : "líneas"} con su corte final ({x.pct}%).</>
                : <>Todavía falta el corte final: <b>0 de {x.total}</b> {x.total === 1 ? "línea" : "líneas"} (0%).</>}
            </p>
            <div className="tw">
              <table className="pr-tabla">
                <thead><tr><th>Línea</th><th>① Corte inicial</th><th>② Corte final</th><th className="pr-der">Pasó por la depa</th></tr></thead>
                <tbody>
                  {[...x.ini.renglones].sort((a, b) => a.linea.localeCompare(b.linea, "es", { numeric: true })).map((r) => {
                    const f = x.fin?.renglones.find((q) => q.linea === r.linea);
                    return (
                      <tr key={r.linea}>
                        <td data-t="Línea"><b>{r.linea}</b><small>{nombreLinea(r.linea) !== r.linea ? nombreLinea(r.linea) : ""}</small></td>
                        <td data-t="① Corte inicial"><b>{nf.format(r.cajas_depa)}</b> cajas por la depa{cuerpo(r)}{r.nota ? <small className="pr-nota">{r.nota}</small> : null}</td>
                        <td data-t="② Corte final">{f ? <><b>{nf.format(f.cajas_depa)}</b> cajas por la depa{cuerpo(f)}{f.nota ? <small className="pr-nota">{f.nota}</small> : null}</>
                              : <span className="pr-falta">{x.fin ? "Esta línea no se cortó al final" : "Falta el corte final"}</span>}</td>
                        <td className="pr-der" data-t="Pasó por la depa">{f ? <b>{(f.cajas_depa - r.cajas_depa > 0 ? "+" : "") + nf.format(f.cajas_depa - r.cajas_depa)}</b> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {x.ini.nota && <p className="cl-nota">Nota del inicial: {x.ini.nota}</p>}
            {x.fin?.nota && <p className="cl-nota">Nota del final: {x.fin.nota}</p>}
          </div>
        </details>
      ))}
    </div>
  );
}
