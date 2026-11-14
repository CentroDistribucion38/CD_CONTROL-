"use client";

/**
 * SEGURIDAD · CERTIFICACIONES · DASHBOARD LICENCIAS — cómo vamos con las licencias VACA.
 *   · «Dashboard» arma TODO en una sola imagen (como el de Pasivos); en las pestañas, cada lista por separado:
 *     vencidas, vencen en 7 días y vencen este mes. Copiar, compartir o descargar.
 *   · La franja: índice de cumplimiento (activos con la licencia al día), vencidas trabajando, renovadas a tiempo,
 *     validadas este mes y los días promedio que le quedan a una licencia vigente.
 *   · La ola de renovaciones (12 semanas) contra el ritmo de validación de las últimas 8 semanas.
 *   · La cobertura de cada permiso hoy y en 30 días (si nadie renueva).
 *   · El mapa de calor empresa × semana, el cumplimiento por empresa, el ritmo por mes, quién valida, los niveles y
 *     los bloqueos.
 */
import { useMemo, useRef } from "react";
import { armarIndicadores, fechaCorta, type ConfigCert, type PersonaCert, type ValidacionHist } from "@/modulos/seguridad/certificaciones";
import { BotonDashboard, useFotosVaca } from "../FotosVaca";

const nf = new Intl.NumberFormat("es-CO");
const pc = (x: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(x * 100) + " %";

export function IndicadoresCert({ personas, hist, hoy, config, departamentos }: {
  personas: PersonaCert[]; hist: ValidacionHist[]; hoy: string; config: ConfigCert; departamentos: string[];
}) {
  const caja = useRef<HTMLDivElement>(null);
  const I = useMemo(() => armarIndicadores(personas, hist, hoy, config), [personas, hist, hoy, config]);
  const deptos = departamentos.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(", ");

  /* LAS IMÁGENES: el Dashboard y, en pestañas, cada lista (vencidas, 7 días, este mes). */
  const foto = useFotosVaca({ personas, hist, hoy, config, departamentos, caja });

  /* LA OLA: barras por semana; en ocre las que pasan el ritmo de validación. */
  const W = I.semanas.length, bw = 46, g = 18, h = 190;
  const mx = Math.max(4, ...I.semanas.map((s) => s.vencen), I.ritmo) + 4;
  const yR = 30 + h - (I.ritmo / mx) * h;
  const r = 58, C = 2 * Math.PI * r;
  const maxCob = Math.max(1, ...I.cobertura.map((c) => c.hoy));
  const maxCal = Math.max(1, ...I.calor.flatMap((c) => c.semanas));
  const maxMes = Math.max(1, ...I.meses.map((m) => m.n));
  const maxVal = Math.max(1, ...I.validadores.map((v) => v.n));
  const totNiv = Math.max(1, I.niveles.reduce((t, n) => t + n.n, 0));

  return (
    <div className="sg" ref={caja}>
      <header className="sg-cab">
        <div>
          <p className="sg-ojo">SEGURIDAD · CERTIFICACIONES</p>
          <h1>Dashboard licencias <span className="sg-tag">{deptos}</span></h1>
          <p className="sg-sub">Licencias VACA · corte {fechaCorta(hoy)} de {hoy.slice(0, 4)} · {nf.format(I.activos)} activos de {nf.format(personas.length)} en la base</p>
        </div>
        <div className="sg-acc">
          <BotonDashboard foto={foto} />
        </div>
      </header>
      {foto.mal && <p className="sg-aviso mal" role="alert">No se pudo armar la imagen. Recarga la página y vuelve a intentar.</p>}

      <section className="sg-hero" aria-label="Indicadores principales">
        <div className="anillo">
          <svg viewBox="0 0 150 150" aria-hidden>
            <circle cx="75" cy="75" r={r} fill="none" stroke="#EEF1F5" strokeWidth="14" />
            <circle cx="75" cy="75" r={r} fill="none" stroke="#FFC300" strokeWidth="14" strokeDasharray={`${C * I.cumplimiento} ${C}`} transform="rotate(-90 75 75)" />
            <text x="75" y="78" textAnchor="middle" style={{ font: "900 25px Archivo, system-ui", fill: "#0d0d0d" }}>{pc(I.cumplimiento).replace(" ", "")}</text>
            <text x="75" y="100" textAnchor="middle" style={{ font: "800 10px sans-serif", fill: "#8A6300", letterSpacing: ".14em" }}>AL DÍA</text>
          </svg>
          <div>
            <span>ÍNDICE DE CUMPLIMIENTO</span>
            <b>{nf.format(I.alDia)} de {nf.format(I.activos)}</b>
            <small>activos con la licencia al día</small>
          </div>
        </div>
        <div className={I.vencidas ? "mal" : ""}><span>VENCIDAS TRABAJANDO</span><b>{I.vencidas}</b><small>meta: 0</small></div>
        <div><span>RENOVADAS A TIEMPO</span><b>{I.renovaciones ? pc(I.aTiempo / I.renovaciones) : "—"}</b>
          <small>{I.renovaciones ? `${I.aTiempo} de ${I.renovaciones} renovaron antes de vencer` : "aún no hay renovaciones registradas"}</small></div>
        <div><span>VALIDADAS ESTE MES</span><b>{I.validadasMes}</b><small>{I.validadasMesAnterior} el mes pasado</small></div>
        <div><span>DÍAS PROMEDIO A VENCER</span><b>{I.diasPromedio}</b><small>de {config.vigencia} que dura la licencia</small></div>
      </section>

      <div className="sg-g a">
        <section className="sg-card">
          <header><h2>La ola de renovaciones</h2><span className="sg-leg">vencen por semana · en ocre, las semanas que pasan el ritmo de validación</span></header>
          <div className="sg-pad">
            <svg className="sg-ola" viewBox={`0 0 ${50 + W * (bw + g)} ${h + 62}`} role="img" aria-label="Licencias que vencen por semana">
              {I.semanas.map((s, i) => {
                const x = 40 + i * (bw + g), bh = (s.vencen / mx) * h, sobre = s.vencen > I.ritmo;
                return (
                  <g key={s.desde}>
                    <rect x={x} y={30 + h - bh} width={bw} height={bh} fill={sobre ? "#B58200" : "#FFDCA3"} />
                    <text x={x + bw / 2} y={24 + h - bh} textAnchor="middle" className="v">{s.vencen}</text>
                    <text x={x + bw / 2} y={h + 50} textAnchor="middle" className="l">{fechaCorta(s.desde)}</text>
                  </g>
                );
              })}
              {I.ritmo > 0 && <>
                <line x1="30" x2={40 + W * (bw + g)} y1={yR} y2={yR} stroke="#0d0d0d" strokeWidth="2.5" strokeDasharray="8 5" />
                <text x={36 + W * (bw + g)} y="14" textAnchor="end" className="r">ritmo actual ≈ {nf.format(I.ritmo)} validaciones/semana</text>
              </>}
            </svg>
          </div>
        </section>

        <section className="sg-card">
          <header><h2>Cobertura de permisos</h2><span className="sg-leg"><i style={{ background: "#B58200" }} />hoy <i style={{ background: "#FFC300" }} />en {config.diasAviso} días</span></header>
          <div className="sg-pad">
            {I.cobertura.map((c) => {
              const baja = c.hoy ? (c.hoy - c.en30) / c.hoy : 0;
              return (
                <div key={c.k} className="sg-cob">
                  <span>{c.t}</span>
                  <div className="sg-cob-t"><i className="h" style={{ width: `${(c.hoy / maxCob) * 100}%` }} /><i className="f" style={{ width: `${(c.en30 / maxCob) * 100}%` }} /></div>
                  <b>{c.hoy}</b>
                  <em className={baja >= 0.25 ? "mal" : ""}>{c.en30}<small>{c.hoy === 0 ? " —" : c.en30 < c.hoy ? ` −${Math.round(baja * 100)}%` : " ="}</small></em>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="sg-g a">
        <section className="sg-card">
          <header><h2>Mapa de calor · quién vence cuándo</h2><span className="sg-leg">empresa × semana</span></header>
          <div className="sg-pad sg-calor">
            <div><span /> {I.semanas.map((s) => <em key={s.desde}>{fechaCorta(s.desde)}</em>)}</div>
            {I.calor.map((c) => (
              <div key={c.empresa}>
                <span title={c.empresa}>{c.empresa}</span>
                {c.semanas.map((v, i) => {
                  const a = v ? 0.15 + (v / maxCal) * 0.85 : 0.05;
                  return <i key={i} style={{ background: `rgba(181,130,0,${a.toFixed(2)})`, color: a > 0.5 ? "#fff" : "#5a4100" }}>{v || ""}</i>;
                })}
              </div>
            ))}
          </div>
        </section>
        <section className="sg-card">
          <header><h2>Cumplimiento por empresa</h2><span className="sg-leg">% de activos al día</span></header>
          <div className="sg-pad">
            {I.empresas.slice(0, 12).map((e) => (
              <div key={e.empresa} className="sg-emp">
                <span title={e.empresa}>{e.empresa}</span>
                <div className="sg-emp-t"><i style={{ width: `${e.pct * 100}%`, background: e.pct < 0.8 ? "#C8102E" : e.pct < 0.95 ? "#B58200" : "#FFC300" }} /></div>
                <b style={{ color: e.pct < 0.8 ? "#C8102E" : undefined }}>{Math.round(e.pct * 100)}%</b>
                <small>{e.activos} act.</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="sg-g b">
        <section className="sg-card">
          <header><h2>Ritmo de validación</h2><span className="sg-leg">validaciones por mes</span></header>
          <div className="sg-pad sg-meses">
            {I.meses.map((m, i) => <div key={i}><i style={{ height: `${(m.n / maxMes) * 100}%` }} /><b>{m.n}</b><span>{m.mes}</span></div>)}
          </div>
        </section>
        <section className="sg-card">
          <header><h2>Quién valida</h2><span className="sg-leg">últimos 90 días</span></header>
          <div className="sg-pad">
            {I.validadores.length === 0 && <p className="sg-sm">Sin validaciones en los últimos 90 días.</p>}
            {I.validadores.map((v) => <div key={v.nombre} className="sg-val"><span title={v.nombre}>{v.nombre}</span><i style={{ width: `${(v.n / maxVal) * 100}%` }} /><b>{v.n}</b></div>)}
          </div>
        </section>
        <section className="sg-card">
          <header><h2>Niveles</h2><span className="sg-leg">activos</span></header>
          <div className="sg-pad sg-pir">
            {I.niveles.map((n) => <div key={n.nivel} style={{ width: `${40 + 60 * (n.n / totNiv)}%` }}><b>{n.n}</b>{n.nivel}</div>)}
          </div>
        </section>
        <section className="sg-card">
          <header><h2>Bloqueos</h2><span className="sg-leg">{I.bloqueados} bloqueados</span></header>
          <div className="sg-pad">
            {I.bloqueos.length === 0 ? <p className="sg-sm">Nadie bloqueado.</p> : (
              <ul className="sg-blq">{I.bloqueos.map((b) => <li key={b.motivo}><b>{b.n}</b>{b.motivo}</li>)}</ul>
            )}
          </div>
        </section>
      </div>
      {foto.vista}
    </div>
  );
}
