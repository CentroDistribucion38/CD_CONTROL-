"use client";

import { useState } from "react";
import type { Barra, Med, TipoEv } from "@/modulos/roturas/seguridad";

/**
 * EL PARETO — barras ordenadas de mayor a menor, la línea del acumulado y el corte del 80 %.
 * Cada barra va del color de lo que la compone (comportamiento / condición / externa), y se toca
 * para filtrar todo lo demás por ella.
 */
const COLOR: Record<TipoEv, string> = {
  comportamiento: "var(--rt-tinta)", condicion: "var(--rt-oro)", externa: "#9AA5B1", sin_clasificar: "#C9D0D9",
};
const W = 760, H = 318, L = 46, R = 46, T = 28, B = 74;

const paso = (max: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1))));
  return ([1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= max / 4) ?? p);
};
const partir = (t: string, n = 14): string[] => {
  const pal = t.split(" "); const ls: string[] = []; let a = "";
  for (const w of pal) { if ((a + " " + w).trim().length > n && a) { ls.push(a); a = w } else a = (a + " " + w).trim() }
  if (a) ls.push(a);
  const dos = ls.slice(0, 2);
  if (ls.length > 2) dos[1] = dos[1].slice(0, n - 1) + "…";
  return dos.map((x) => (x.length > n + 2 ? x.slice(0, n) + "…" : x));
};

export function Pareto({ barras, total, med, foco, onBarra }: {
  barras: Barra[]; total: number; med: Med; foco: string | null; onBarra: (k: string) => void;
}) {
  const [sobre, setSobre] = useState<number | null>(null);
  if (!barras.length) return <p className="plr-vacio">No hay eventos con estos filtros.</p>;
  const iw = W - L - R, ih = H - T - B;
  const max = Math.max(...barras.map((b) => b.v), 1), st = paso(max), yMax = Math.ceil(max / st) * st;
  const y = (v: number) => T + ih - (v / yMax) * ih, y2 = (p: number) => T + ih - p * ih;
  const pw = iw / barras.length, bw = Math.min(58, pw * 0.58);
  const cx = (i: number) => L + pw * i + pw / 2;
  const ticks: number[] = []; for (let t = 0; t <= yMax + 1e-9; t += st) ticks.push(t);
  const linea = barras.map((b, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${y2(b.ac).toFixed(1)}`).join(" ");
  const h = sobre != null ? barras[sobre] : null;
  const u = med === "eventos" ? "eventos" : "cajas";
  return (
    <div className="plr-par">
      <p className="plr-lectura" aria-live="polite">
        {h ? <><b>{h.k}</b> · {h.v} {u} · {total ? Math.round((h.v / total) * 100) : 0} % del total · acumulado {Math.round(h.ac * 100)} %</>
           : <>{total} {u} en total. <span>Toca una barra para filtrar el resto de la pantalla.</span></>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pareto de ${u}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} style={{ stroke: "var(--rt-linea)" }} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="plr-eje">{t}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((p) => <text key={p} x={W - R + 8} y={y2(p) + 4} className="plr-eje">{p * 100}%</text>)}
        <line x1={L} x2={W - R} y1={y2(0.8)} y2={y2(0.8)} className="plr-corte" />
        <text x={W - R - 4} y={y2(0.8) - 6} textAnchor="end" className="plr-corte-t">80 %</text>
        {barras.map((b, i) => {
          const alto = Math.max(1.5, T + ih - y(b.v)), activa = foco === b.k;
          return (
            <g key={b.k} className={"plr-barra" + (activa ? " on" : "") + (b.otros ? " otros" : "")} tabIndex={b.otros ? -1 : 0} role={b.otros ? undefined : "button"}
               aria-label={`${b.k}: ${b.v} ${u}`} aria-pressed={b.otros ? undefined : activa}
               onMouseEnter={() => setSobre(i)} onMouseLeave={() => setSobre(null)} onFocus={() => setSobre(i)} onBlur={() => setSobre(null)}
               onClick={() => !b.otros && onBarra(b.k)} onKeyDown={(e) => { if (!b.otros && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onBarra(b.k) } }}>
              <rect x={cx(i) - pw / 2 + 2} y={T} width={pw - 4} height={ih} className="plr-zona" />
              <rect x={cx(i) - bw / 2} y={y(b.v)} width={bw} height={alto} style={{ fill: b.otros ? "#C9D0D9" : COLOR[b.dom] }} className="plr-rect" />
              <text x={cx(i)} y={y(b.v) - 7} textAnchor="middle" className="plr-val">{b.v}</text>
              {partir(b.k).map((l, j) => <text key={j} x={cx(i)} y={T + ih + 18 + j * 13} textAnchor="middle" className="plr-lab">{l}</text>)}
            </g>
          );
        })}
        <path d={linea} className="plr-acum" />
        {barras.map((b, i) => <circle key={i} cx={cx(i)} cy={y2(b.ac)} r={3.6} className="plr-acum-p" />)}
      </svg>
      <div className="plr-leyenda" aria-hidden>
        <span><i style={{ background: COLOR.comportamiento }} />Comportamiento</span>
        <span><i style={{ background: COLOR.condicion }} />Condición</span>
        <span><i style={{ background: COLOR.externa }} />Externa u otros</span>
        <span className="plr-leyenda-l"><i className="ln" />Acumulado</span>
      </div>
    </div>
  );
}
