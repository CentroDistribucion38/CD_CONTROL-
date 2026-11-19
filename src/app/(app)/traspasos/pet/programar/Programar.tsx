"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  colorFormato, nombreFormato, programar, masDias, diaSemana, DIAS,
  type FilaPet, type PlanFormato,
} from "@/modulos/traspasos/pet";

const TURNOS: [string, string][] = [["D", "Día"], ["C", "C"], ["A", "A"], ["B", "B"]];
const plural = (dow: number) => (dow === 0 ? "domingos" : dow === 6 ? "sábados" : DIAS[dow]);
const corto = (f: string) => {
  const d = new Date(f + "T12:00:00Z");
  return `${d.getUTCDate()} ${d.toLocaleDateString("es-CO", { month: "short", timeZone: "UTC" }).replace(".", "")}`;
};
const dec = (x: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(x);

function Tendencia({ t, hay }: { t: number; hay: boolean }) {
  if (!hay) return <span className="pv-igual">sin tendencia todavía (faltan días)</span>;
  if (Math.abs(t) < 0.25) return <span className="pv-igual">= estable</span>;
  return t > 0
    ? <span className="pv-sube">▲ sube +{dec(t)} Vh</span>
    : <span className="pv-baja">▼ baja −{dec(-t)} Vh</span>;
}

/**
 * PROGRAMAR PET. Arriba el número para el plan (total y por formato) con de dónde sale: los últimos días iguales,
 * su promedio y si va subiendo o bajando. Abajo, una gráfica por formato de los últimos 28 días: los días que
 * entraron al promedio en su color, los demás en gris, la raya del promedio y, a la derecha, el sugerido.
 * «Pasar al Plan» abre el plan de ese día con la celda de PET ya llena; se revisa y se publica allá.
 */
export function Programar({ filas, hoy }: { filas: FilaPet[]; hoy: string }) {
  const [dow, setDow] = useState(diaSemana(masDias(hoy, 1)));
  const [base, setBase] = useState(4);
  const [turno, setTurno] = useState("D");

  /* El día a programar: el próximo de ese día de la semana, desde mañana. */
  const proximo = (d: number) => {
    for (let i = 1; i <= 7; i++) { const f = masDias(hoy, i); if (diaSemana(f) === d) return f; }
    return masDias(hoy, 1);
  };
  const fecha = proximo(dow);
  const p = useMemo(() => programar(filas, fecha, base, turno, 28, hoy), [filas, fecha, base, turno, hoy]);
  const dia = DIAS[dow];
  const hayTend = p.usados >= 4;
  const sumaFormatos = p.formatos.reduce((a, x) => a + x.sugerido, 0);
  const enTurno = turno === "D" ? "" : ` · turno ${turno}`;

  return (
    <>
      <div className="pv-filtros">
        <div className="pv-campo"><span>Programar para</span>
          <div className="pv-seg" role="group" aria-label="Día a programar">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => diaSemana(masDias(hoy, i))).map((d) => (
              <button key={d} type="button" className={d === dow ? "on" : ""} aria-pressed={d === dow} onClick={() => setDow(d)}>
                {DIAS[d].slice(0, 3).replace(/^./, (c) => c.toUpperCase())} {Number(proximo(d).slice(8))}
              </button>
            ))}
          </div>
        </div>
        <label className="pv-campo"><span>Con base en</span>
          <select value={base} onChange={(e) => setBase(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>Últimos {n} {plural(dow)}</option>)}
          </select>
        </label>
        <div className="pv-campo"><span>Turno</span>
          <div className="pv-seg" role="group" aria-label="Turno">
            {TURNOS.map(([k, t]) => <button key={k} type="button" className={turno === k ? "on" : ""} aria-pressed={turno === k} onClick={() => setTurno(k)}>{t}</button>)}
          </div>
        </div>
      </div>

      {p.usados === 0 ? (
        <p className="pv-vacio">
          Todavía no hay un {dia} con Vhs de PET registrados con su SKU. La cuenta arranca sola desde el primer {dia} que
          se registre (Traspasos › Registrar, tipo PET).
        </p>
      ) : (<>
        {p.usados < base && (
          <p className="pv-aviso">
            Solo hay <b>{p.usados} {p.usados === 1 ? dia : plural(dow)}</b> con registro de PET (desde el {corto(p.total.iguales[0].fecha)}):
            el promedio sale de {p.usados === 1 ? "ese" : "esos"}. Se afina solo a medida que haya más.
          </p>
        )}

        <section className="pv-hero" style={{ ["--nf" as string]: p.formatos.length }}>
          <div>
            <span className="l">Programar el {dia} {corto(fecha)}{enTurno}</span>
            <div className="big">{p.total.sugerido}<small>{p.total.sugerido === 1 ? "Vh" : "Vhs"} de PET</small></div>
            <div className="d">
              {plural(dow)}: {p.total.iguales.map((x) => x.vhs).join(" · ")} · promedio <b>{dec(p.total.promedio)}</b><br />
              <Tendencia t={p.total.tendencia} hay={hayTend} />
            </div>
          </div>
          {p.formatos.map((f) => (
            <div key={String(f.formato)} style={{ ["--c" as string]: colorFormato(f.formato) }}>
              <div className="fm"><i />{nombreFormato(f.formato)}</div>
              <div className="n">{f.sugerido}<small>{f.sugerido === 1 ? "Vh" : "Vhs"}</small></div>
              <div className="d">
                {f.iguales.map((x) => x.vhs).join(" · ")} · prom. <b>{dec(f.promedio)}</b><br />
                <Tendencia t={f.tendencia} hay={hayTend} />
              </div>
            </div>
          ))}
          <div className="go">
            <Link className="pv-bt am" href={`/traspasos/plan?d=${fecha}&pet=${p.total.sugerido}&pt=${turno}`}>
              Pasar al Plan del {dia}
            </Link>
            <p>Llena la fila PET{turno === "D" ? " del día" : ` del turno ${turno}`} con {p.total.sugerido}; se puede cambiar antes de publicar.</p>
          </div>
        </section>

        {p.mezclan && (
          <p className="pv-nota">
            Los formatos suman {sumaFormatos} y el total es {p.total.sugerido}: hay Vhs que llevan más de un formato. Al plan
            va el total de Vhs; el desglose dice qué cargar.
          </p>
        )}

        <section className="pv-graf">
          {p.formatos.map((f) => <Grafica key={String(f.formato)} f={f} dia={dia} plural={plural(dow)} fecha={fecha} />)}
        </section>
      </>)}
    </>
  );
}

/** Barras de 28 días + el sugerido punteado a la derecha + la raya del promedio de los días iguales. */
function Grafica({ f, dia, plural, fecha }: { f: PlanFormato; dia: string; plural: string; fecha: string }) {
  const c = colorFormato(f.formato);
  const W = 640, H = 170, izq = 24, slots = f.serie.length + 2, bw = (W - izq) / slots;
  const mx = Math.max(1, ...f.serie.map((s) => s.vhs), f.sugerido, Math.ceil(f.promedio));
  const paso = Math.max(1, Math.ceil(mx / 5));
  const tope = Math.ceil(mx / paso) * paso;
  const y = (v: number) => H - (v * (H - 18)) / tope;
  const xs = f.sugerido ? izq + (slots - 1) * bw : 0;
  const lineas: number[] = [];
  for (let v = paso; v <= tope; v += paso) lineas.push(v);
  return (
    <div className="pv-fc" style={{ ["--c" as string]: c }}>
      <h3><i />{nombreFormato(f.formato)}<span>últimos {f.serie.length} días</span></h3>
      <div className="pv-leg">
        <span><i style={{ background: c }} />{plural}</span>
        <span><i style={{ background: "var(--tp-linea)" }} />otros días</span>
        <span><i style={{ background: "transparent", outline: `2px dashed ${c}`, outlineOffset: -2 }} />sugerido</span>
        <span>– – promedio de los {plural}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img"
           aria-label={`${nombreFormato(f.formato)}: Vhs por día de los últimos ${f.serie.length} días; sugerido ${f.sugerido} para el ${dia}`}>
        {lineas.map((v) => (
          <g key={v}>
            <line x1={izq - 4} x2={W} y1={y(v)} y2={y(v)} style={{ stroke: "var(--tp-fondo)" }} />
            <text x={izq - 8} y={y(v) + 4} textAnchor="end" fontSize="10" style={{ fill: "var(--tp-gris)" }}>{v}</text>
          </g>
        ))}
        {f.serie.map((s, i) => s.vhs > 0 && (
          <rect key={s.fecha} x={izq + i * bw} y={y(s.vhs)} width={bw - 4} height={H - y(s.vhs)}
                style={{ fill: s.igual ? c : "var(--tp-linea)" }}>
            <title>{`${corto(s.fecha)}: ${s.vhs} ${s.vhs === 1 ? "Vh" : "Vhs"}`}</title>
          </rect>
        ))}
        {f.promedio > 0 && (
          <line x1={izq - 4} x2={izq + (slots - 1) * bw - 4} y1={y(f.promedio)} y2={y(f.promedio)}
                strokeDasharray="5 4" style={{ stroke: "var(--tp-tinta)" }} />
        )}
        {f.sugerido > 0 && (
          <>
            <rect x={xs} y={y(f.sugerido)} width={bw - 4} height={H - y(f.sugerido)} strokeWidth="2" strokeDasharray="4 3"
                  style={{ fill: "var(--tp-papel)", stroke: c }} />
            <text x={xs + (bw - 4) / 2} y={y(f.sugerido) - 6} textAnchor="middle" fontSize="13" fontWeight="800" style={{ fill: "var(--tp-tinta)" }}>{f.sugerido}</text>
          </>
        )}
        <line x1={izq - 4} x2={W} y1={H} y2={H} style={{ stroke: "var(--tp-tinta)" }} />
        {f.serie.map((s, i) => i % 7 === 0 && (
          <text key={s.fecha} x={izq + i * bw} y={H + 16} fontSize="11" style={{ fill: "var(--tp-gris)" }}>{corto(s.fecha)}</text>
        ))}
        <text x={izq + (slots - 1) * bw + (bw - 4) / 2} y={H + 16} textAnchor="end" fontSize="11" fontWeight="700" style={{ fill: "var(--tp-tinta)" }}>
          {dia.slice(0, 3)} {Number(fecha.slice(8))}
        </text>
      </svg>
    </div>
  );
}
