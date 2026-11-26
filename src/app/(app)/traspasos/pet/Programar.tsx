"use client";

import { useMemo, useState } from "react";
import {
  colorFormato, nombreFormato, programar, masDias, diaSemana, DIAS, TURNOS_PET,
  type BasePet, type FilaPet, type PlanFormato,
} from "@/modulos/traspasos/pet";
import { PetCabeza } from "./PetCabeza";

const plural = (dow: number) => (dow === 0 ? "domingos" : dow === 6 ? "sábados" : DIAS[dow]);
const corto = (f: string) => {
  const d = new Date(f + "T12:00:00Z");
  return `${d.getUTCDate()} ${d.toLocaleDateString("es-CO", { month: "short", timeZone: "UTC" }).replace(".", "")}`;
};
const dec = (x: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(x);

function Tendencia({ t, hay }: { t: number; hay: boolean }) {
  if (!hay) return <span className="pv-igual">—</span>;
  if (Math.abs(t) < 0.25) return <span className="pv-igual">= estable</span>;
  return t > 0 ? <span className="pv-sube">▲ +{dec(t)}</span> : <span className="pv-baja">▼ −{dec(-t)}</span>;
}

/* «Con base en»: los últimos días con PET (cualquier día) o los últimos iguales al día a programar. */
const BASES: { clave: string; base: BasePet; nombre: (dow: number) => string }[] = [
  { clave: "d7", base: { modo: "dias", n: 7 }, nombre: () => "Últimos 7 días con PET" },
  { clave: "d14", base: { modo: "dias", n: 14 }, nombre: () => "Últimos 14 días con PET" },
  { clave: "d28", base: { modo: "dias", n: 28 }, nombre: () => "Últimos 28 días con PET" },
  { clave: "s4", base: { modo: "semana", n: 4 }, nombre: (d) => `Últimos 4 ${plural(d)}` },
  { clave: "s8", base: { modo: "semana", n: 8 }, nombre: (d) => `Últimos 8 ${plural(d)}` },
];

function Num({ c }: { c: { promedio: number; sugerido: number } }) {
  return (<><b>{c.sugerido}</b><small>prom {dec(c.promedio)}</small></>);
}

/**
 * PET › PROGRAMAR. Cuántos Vhs de cada formato hay que hacer AL DÍA Y POR TURNO, según lo registrado: el promedio
 * de los días base (los últimos días con PET desde que se registra el formato, o los últimos días iguales). No llena
 * el Plan: el plan se sigue haciendo en Plan.
 */
export function Programar({ filas, hoy }: { filas: FilaPet[]; hoy: string }) {
  const [dow, setDow] = useState(diaSemana(masDias(hoy, 1)));
  const [clave, setClave] = useState("d7");
  const proximo = (d: number) => {
    for (let i = 1; i <= 7; i++) { const f = masDias(hoy, i); if (diaSemana(f) === d) return f; }
    return masDias(hoy, 1);
  };
  const fecha = proximo(dow);
  const b = BASES.find((x) => x.clave === clave) ?? BASES[0];
  const p = useMemo(() => programar(filas, fecha, b.base, hoy), [filas, fecha, b, hoy]);
  const dia = DIAS[dow];
  const n = p.dias.length;
  const hayTend = n >= 4;
  const deque = b.base.modo === "dias" ? `${n === 1 ? "día" : "días"} con PET` : plural(dow);
  const t = p.total;

  return (
    <>
      <PetCabeza
        v="programar"
        sub={<>Cuántos Vhs de PET hacer <b>al día y por turno</b>, por formato (200, 330, 1000, 1.500), según lo registrado. El detalle viaje por viaje está en <b>Vhs por formato</b>.</>}
        rot={`SUGERIDO · ${dia.toUpperCase()} ${corto(fecha).toUpperCase()}`}
        num={n ? t.dia.sugerido : "—"}
        pie={n ? <>Vhs de PET · turno C <b>{t.turnos.C.sugerido}</b> · A <b>{t.turnos.A.sugerido}</b> · B <b>{t.turnos.B.sugerido}</b></> : <>todavía no hay días con PET por formato</>}
      />

      <section className="filtros">
        <div className="arriba"><div className="tp-f1">
          <div className="sel"><span>Programar para</span>
            <div className="seg" role="group" aria-label="Día a programar">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => diaSemana(masDias(hoy, i))).map((d) => (
                <button key={d} type="button" className={d === dow ? "on" : ""} aria-pressed={d === dow} onClick={() => setDow(d)}>
                  {DIAS[d].slice(0, 3).replace(/^./, (c) => c.toUpperCase())} {Number(proximo(d).slice(8))}
                </button>
              ))}
            </div>
          </div>
          <label className="sel"><span>Con base en</span>
            <select value={clave} onChange={(e) => setClave(e.target.value)}>
              {BASES.map((x) => <option key={x.clave} value={x.clave}>{x.nombre(dow)}</option>)}
            </select>
          </label>
        </div></div>
      </section>

      {n === 0 ? (
        <section className="caja"><div className="vacio"><b>{p.inicioFormato ? `Todavía no hay ${b.base.modo === "dias" ? "días cerrados" : plural(dow)} con PET registrado por formato` : "Todavía no hay Vhs de PET registrados con su SKU"}</b>
          La cuenta arranca sola con los Vhs que se registren en Traspasos › Registrar con el tipo PET y su SKU.</div></section>
      ) : (<>
        <section className="caja pv-mat-caja">
          <div className="cab"><div>
            <h2>Vhs a programar · {dia} {corto(fecha)}</h2>
            <p>Promedio de {n === 1 ? "el" : "los"} {n} {deque} {n === 1 ? "" : "cerrados"} ({corto(p.dias[0])}{n > 1 ? ` – ${corto(p.dias[n - 1])}` : ""}). El número grande es lo que hay que hacer: los turnos suman el día y los formatos suman el total (un Vh con dos formatos cuenta en el que más llevó).</p>
          </div></div>
          <div className="pv-tabla-caja">
            <table className="pv-tabla pv-mat">
              <thead><tr>
                <th>Formato</th>
                {TURNOS_PET.map((x) => <th key={x} className="n">Turno {x}</th>)}
                <th className="n tt">Día</th>
                <th className="n">Cada día base</th>
                <th className="n">Tendencia</th>
              </tr></thead>
              <tbody>
                {p.formatos.map((f) => (
                  <tr key={String(f.formato)} className={f.dia.sugerido ? "" : "cero"}>
                    <td><i className="sw" style={{ background: colorFormato(f.formato) }} />{nombreFormato(f.formato)}</td>
                    {TURNOS_PET.map((x) => <td key={x} className="n"><Num c={f.turnos[x]} /></td>)}
                    <td className="n tt"><Num c={f.dia} /></td>
                    <td className="n pv-dias">{f.porDia.map((d) => d.vhs).join(" · ")}</td>
                    <td className="n"><Tendencia t={f.tendencia} hay={hayTend} /></td>
                  </tr>
                ))}
                <tr className="sum">
                  <td>Total Vhs de PET</td>
                  {TURNOS_PET.map((x) => <td key={x} className="n"><Num c={t.turnos[x]} /></td>)}
                  <td className="n tt"><Num c={t.dia} /></td>
                  <td className="n pv-dias">{t.porDia.map((d) => d.vhs).join(" · ")}</td>
                  <td className="n"><Tendencia t={t.tendencia} hay={hayTend} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {n < b.base.n && (
          <p className="aviso">Solo hay <b>{n} {deque}</b> con el formato registrado (se registra desde el {corto(p.inicioFormato!)}): el promedio sale de {n === 1 ? "ese" : "esos"} y se afina solo a medida que haya más.</p>
        )}
        {p.mezclan && (
          <p className="guia">Los formatos suman {p.formatos.reduce((a, x) => a + x.dia.sugerido, 0)} y el total es {t.dia.sugerido}: hay Vhs que llevan más de un formato. Al plan va el total de Vhs; el desglose dice qué cargar.</p>
        )}

        <section className="pv-graf">
          {p.formatos.filter((f) => f.serie.some((s) => s.vhs > 0)).map((f) => <Grafica key={String(f.formato)} f={f} dia={dia} fecha={fecha} />)}
        </section>
      </>)}
    </>
  );
}

/** Barras de 28 días + el sugerido punteado a la derecha + la raya del promedio de los días iguales. */
function Grafica({ f, dia, fecha }: { f: PlanFormato; dia: string; fecha: string }) {
  const c = colorFormato(f.formato);
  const W = 640, H = 170, izq = 24, slots = f.serie.length + 2, bw = (W - izq) / slots;
  const mx = Math.max(1, ...f.serie.map((s) => s.vhs), f.dia.sugerido, Math.ceil(f.dia.promedio));
  const paso = Math.max(1, Math.ceil(mx / 5));
  const tope = Math.ceil(mx / paso) * paso;
  const y = (v: number) => H - (v * (H - 18)) / tope;
  const xs = izq + (slots - 1) * bw;
  const lineas: number[] = [];
  for (let v = paso; v <= tope; v += paso) lineas.push(v);
  return (
    <div className="caja">
      <div className="cab"><div><h2><i className="pv-sw" style={{ background: c }} />{nombreFormato(f.formato)}</h2>
        <p><span className="pv-ley" style={{ background: c }} />días base · <span className="pv-ley gris" />otros días · – – promedio · el punteado es el sugerido</p></div>
        <p>últimos {f.serie.length} días</p></div>
      <svg className="pv-svg" viewBox={`0 0 ${W} ${H + 24}`} role="img"
           aria-label={`${nombreFormato(f.formato)}: Vhs por día de los últimos ${f.serie.length} días; sugerido ${f.dia.sugerido} para el ${dia}`}>
        {lineas.map((v) => (
          <g key={v}>
            <line x1={izq - 4} x2={W} y1={y(v)} y2={y(v)} style={{ stroke: "var(--tp-fondo)" }} />
            <text x={izq - 8} y={y(v) + 4} textAnchor="end" fontSize="10" style={{ fill: "var(--tp-gris)" }}>{v}</text>
          </g>
        ))}
        {f.serie.map((s, i) => s.vhs > 0 && (
          <rect key={s.fecha} x={izq + i * bw} y={y(s.vhs)} width={bw - 4} height={H - y(s.vhs)} style={{ fill: s.igual ? c : "var(--tp-linea)" }}>
            <title>{`${corto(s.fecha)}: ${s.vhs} ${s.vhs === 1 ? "Vh" : "Vhs"}`}</title>
          </rect>
        ))}
        {f.dia.promedio > 0 && <line x1={izq - 4} x2={xs - 4} y1={y(f.dia.promedio)} y2={y(f.dia.promedio)} strokeDasharray="5 4" style={{ stroke: "var(--tp-tinta)" }} />}
        {f.dia.sugerido > 0 && (<>
          <rect x={xs} y={y(f.dia.sugerido)} width={bw - 4} height={H - y(f.dia.sugerido)} strokeWidth="2" strokeDasharray="4 3" style={{ fill: "var(--tp-papel)", stroke: c }} />
          <text x={xs + (bw - 4) / 2} y={y(f.dia.sugerido) - 6} textAnchor="middle" fontSize="13" fontWeight="700" style={{ fill: "var(--tp-tinta)" }}>{f.dia.sugerido}</text>
        </>)}
        <line x1={izq - 4} x2={W} y1={H} y2={H} style={{ stroke: "var(--tp-tinta)" }} />
        {f.serie.map((s, i) => i % 7 === 0 && <text key={s.fecha} x={izq + i * bw} y={H + 16} fontSize="11" style={{ fill: "var(--tp-gris)" }}>{corto(s.fecha)}</text>)}
        <text x={xs + (bw - 4) / 2} y={H + 16} textAnchor="end" fontSize="11" fontWeight="700" style={{ fill: "var(--tp-tinta)" }}>{dia.slice(0, 3)} {Number(fecha.slice(8))}</text>
      </svg>
    </div>
  );
}
