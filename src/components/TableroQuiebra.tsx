"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Baja, Produccion, Meta, Carga } from "@/modulos/quiebra/datos";

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const COL    = ["#1f6fd0","#e8551f","#0f9e6a","#e09400","#d95d92","#5b3fd6","#8b9bb3"];
const COL_HI = ["#4c93ea","#f57c46","#2fc48c","#f5b52e","#ef86b0","#8570ec","#a9b6c8"];

const nf = new Intl.NumberFormat("es-CO");
const pf = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : (v * 100).toFixed(d).replace(".", ",") + "%";
const mesDe = (f: string) => Number(f.slice(5, 7));

type Props = {
  bajas: Baja[];
  produccion: Produccion[];
  metas: Meta[];
  ultimaCarga: Carga | null;
  esEditor: boolean;
};

export function TableroQuiebra({ bajas, produccion, metas, ultimaCarga, esEditor }: Props) {
  const causales = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bajas) m.set(b.causal, (m.get(b.causal) ?? 0) + Number(b.cantidad));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }, [bajas]);

  const almacenes = useMemo(
    () => [...new Set(bajas.map((b) => b.almacen).filter(Boolean))].sort() as string[],
    [bajas]
  );
  const lineas = useMemo(
    () => [...new Set(produccion.map((p) => p.linea).filter((l) => l != null))].sort(
      (a, b) => Number(a) - Number(b)
    ) as number[],
    [produccion]
  );
  const mesesDato = useMemo(
    () => [...new Set([...produccion.map((p) => mesDe(p.fecha)), ...bajas.map((b) => mesDe(b.fecha))])]
      .sort((a, b) => a - b),
    [bajas, produccion]
  );

  const [desde, setDesde] = useState(mesesDato[0] ?? 1);
  const [hasta, setHasta] = useState(mesesDato[mesesDato.length - 1] ?? 12);
  const [almacen, setAlmacen] = useState("");
  const [linea, setLinea] = useState("");
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());

  const metaDe = (m: number) => metas.find((x) => x.mes === m)?.meta ?? 0.016;

  const bj = useMemo(
    () =>
      bajas.filter((b) => {
        const m = mesDe(b.fecha);
        return m >= desde && m <= hasta &&
          (almacen === "" || b.almacen === almacen) &&
          !apagadas.has(b.causal);
      }),
    [bajas, desde, hasta, almacen, apagadas]
  );
  const pr = useMemo(
    () =>
      produccion.filter((p) => {
        const m = mesDe(p.fecha);
        return m >= desde && m <= hasta && (linea === "" || String(p.linea) === linea);
      }),
    [produccion, desde, hasta, linea]
  );

  const perdida = bj.reduce((a, b) => a + Number(b.cantidad), 0);
  const total = pr.reduce((a, p) => a + Number(p.cantidad), 0);
  const pct = total > 0 ? perdida / total : null;

  const prodMes = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of pr) m.set(mesDe(p.fecha), (m.get(mesDe(p.fecha)) ?? 0) + Number(p.cantidad));
    return m;
  }, [pr]);
  const perdMes = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of bj) m.set(mesDe(b.fecha), (m.get(mesDe(b.fecha)) ?? 0) + Number(b.cantidad));
    return m;
  }, [bj]);

  const meta = useMemo(() => {
    let a = 0, t = 0;
    for (const [m, v] of prodMes) { a += v * metaDe(m); t += v; }
    return t ? a / t : 0.016;
  }, [prodMes, metas]);

  const exceso = Math.round(total * ((pct ?? 0) - meta));
  const sobre = pct != null && pct > meta;
  const pp = ((pct ?? 0) - meta) * 100;
  const parcial = apagadas.size > 0;

  if (bajas.length === 0 && produccion.length === 0) {
    return (
      <div className="bloque" style={{ textAlign: "center", padding: "56px 24px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Todavía no hay datos cargados</h2>
        <p className="sub" style={{ margin: "8px auto 20px", maxWidth: "46ch" }}>
          El tablero se arma con las hojas <b>BAJA MB51</b> y <b>ZPREC</b> del maestro.
          Importa el archivo y aparece solo.
        </p>
        {esEditor ? (
          <Link href="/quiebra/importar" className="btn-primario">Importar el maestro</Link>
        ) : (
          <p className="sub">Pídele a un supervisor que lo importe.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Banda pct={pct} meta={meta} sobre={sobre} pp={pp} parcial={parcial}
             ultimaCarga={ultimaCarga} esEditor={esEditor} />

      <div className="filtros">
        <Campo etiqueta="Desde">
          <select className="campo" value={desde} onChange={(e) => {
            const v = +e.target.value; setDesde(v); if (hasta < v) setHasta(v);
          }}>
            {mesesDato.map((m) => <option key={m} value={m}>{MESES[m - 1]}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Hasta">
          <select className="campo" value={hasta} onChange={(e) => {
            const v = +e.target.value; setHasta(v); if (desde > v) setDesde(v);
          }}>
            {mesesDato.map((m) => <option key={m} value={m}>{MESES[m - 1]}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Almacén">
          <select className="campo" value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
            <option value="">Todos</option>
            {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Línea">
          <select className="campo" value={linea} onChange={(e) => setLinea(e.target.value)}>
            <option value="">Todas</option>
            {lineas.map((l) => <option key={l} value={String(l)}>Línea {l}</option>)}
          </select>
        </Campo>
        <div className="f" style={{ flex: 1, minWidth: 300 }}>
          <label className="etiqueta">Causales</label>
          <div className="chips">
            {causales.map((c, i) => {
              const on = !apagadas.has(c);
              return (
                <button key={c} className="chip" aria-pressed={on} onClick={() => {
                  const n = new Set(apagadas);
                  if (on && apagadas.size < causales.length - 1) n.add(c); else n.delete(c);
                  setApagadas(n);
                }}>
                  <i style={{ background: COL[i % 7] }} />{c}
                </button>
              );
            })}
          </div>
        </div>
        <button className="btn-secundario" onClick={() => {
          setDesde(mesesDato[0]); setHasta(mesesDato[mesesDato.length - 1]);
          setAlmacen(""); setLinea(""); setApagadas(new Set());
        }}>Restablecer</button>
      </div>

      <div className="cifras">
        <Cifra t="Envase producido" v={nf.format(total)} n="unidades" />
        <Cifra t="Envase roto" v={nf.format(perdida)} n="neto de reversos" />
        <Cifra t={exceso > 0 ? "Exceso sobre meta" : "Bajo la meta"}
               v={nf.format(Math.abs(exceso))} n="unidades"
               clase={exceso > 0 ? "malo" : "bien"} />
      </div>

      <div className="rej">
        <section className="c7"><div className="bloque">
          <Cab titulo="Quiebra mensual contra meta" sub="Porcentaje sobre la producción del mes"
               leyenda={[["linear-gradient(180deg,#4c93ea,#1257ab)","Bajo meta"],
                         ["linear-gradient(180deg,#f2444f,#c30a17)","Sobre meta"],
                         ["#c9d4e2","Meta"]]} />
          <GraficoMes prodMes={prodMes} perdMes={perdMes} metaDe={metaDe} />
        </div></section>

        <section className="c5"><div className="bloque">
          <Cab titulo="De dónde sale la quiebra" sub="Participación por causal" />
          <GraficoPareto bajas={bj} causales={causales} />
        </div></section>

        <section className="c8"><div className="bloque">
          <Cab titulo="Día a día" sub="" leyenda={[["linear-gradient(180deg,#4c93ea,#1257ab)","Bajo meta"],
                         ["linear-gradient(180deg,#f2444f,#c30a17)","Sobre meta"],["#c9d4e2","Meta"]]} />
          <GraficoDia bajas={bj} prod={pr} meta={meta} />
        </div></section>

        <section className="c4"><div className="bloque">
          <Cab titulo="Composición mes a mes" sub="Unidades por causal" />
          <GraficoApilado bajas={bj} causales={causales} />
        </div></section>

        <section className="c5"><div className="bloque">
          <Cab titulo="Quiebra por envase" sub="Top 8 del período" />
          <TablaMateriales bajas={bj} total={perdida} />
        </div></section>

        <section className="c3"><div className="bloque">
          <Cab titulo="Por almacén" sub="Dónde se registra la baja" />
          <TablaAlmacen bajas={bj} total={perdida} />
        </div></section>

        <section className="c4"><div className="bloque">
          <Cab titulo="Detalle mensual" sub="Producción, quiebra y meta" />
          <TablaMes prodMes={prodMes} perdMes={perdMes} metaDe={metaDe} />
        </div></section>
      </div>

      <p className="pie">
        {nf.format(bj.length)} de {nf.format(bajas.length)} movimientos de baja y{" "}
        {nf.format(pr.length)} de {nf.format(produccion.length)} órdenes de producción en el
        filtro actual. La quiebra es neta: los reversos con cantidad positiva restan.
      </p>
    </div>
  );
}

/* ---------------- piezas ---------------- */

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return <div className="f"><label className="etiqueta">{etiqueta}</label>{children}</div>;
}

function Cifra({ t, v, n, clase = "" }: { t: string; v: string; n: string; clase?: string }) {
  return (
    <div className="cifra">
      <div className="ct">{t}</div>
      <div className={`cv ${clase}`}>{v}</div>
      <div className="cn">{n}</div>
    </div>
  );
}

function Cab({ titulo, sub, leyenda }: {
  titulo: string; sub: string; leyenda?: [string, string][];
}) {
  return (
    <div className="bh">
      <div><h2>{titulo}</h2>{sub && <p>{sub}</p>}</div>
      {leyenda && (
        <div className="leyenda">
          {leyenda.map(([c, t]) => (
            <span key={t}><i style={{ background: c }} />{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Defs({ vertical }: { vertical: boolean }) {
  const s = vertical ? "v" : "h";
  const g = (id: string, a: string, b: string) => (
    <linearGradient key={id} id={id} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0"}>
      <stop offset="0%" stopColor={a} /><stop offset="100%" stopColor={b} />
    </linearGradient>
  );
  return (
    <defs>
      {COL.map((c, i) => g(`gc${i}${s}`, COL_HI[i], c))}
      {g(`greal${s}`, "#4c93ea", "#1257ab")}
      {g(`gmalo${s}`, "#f2444f", "#c30a17")}
      {g(`gmeta${s}`, "#d6dfea", "#bcc8d8")}
    </defs>
  );
}

const Vacio = ({ w, h }: { w: number; h: number }) => (
  <text x={w / 2} y={h / 2} textAnchor="middle" className="eje">Sin datos con este filtro</text>
);

function GraficoMes({ prodMes, perdMes, metaDe }: {
  prodMes: Map<number, number>; perdMes: Map<number, number>; metaDe: (m: number) => number;
}) {
  const W = 900, H = 300, m = { t: 26, r: 16, b: 36, l: 50 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const meses = [...prodMes.keys()].sort((a, b) => a - b);
  const filas = meses.map((mm) => {
    const prod = prodMes.get(mm) ?? 0, perd = perdMes.get(mm) ?? 0;
    return { mm, prod, perd, pct: prod ? perd / prod : 0, meta: metaDe(mm) };
  });
  const max = Math.max(0.01, ...filas.map((f) => Math.max(f.pct, f.meta))) * 1.2;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const paso = iw / Math.max(1, filas.length), an = Math.min(24, paso * 0.32);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Quiebra mensual contra meta">
      <Defs vertical />
      {!filas.length && <Vacio w={W} h={H} />}
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (max * i) / 4;
        return (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="gridline" />
            <text x={m.l - 9} y={y(v) + 4} className="eje" textAnchor="end">{pf(v, 1)}</text>
          </g>
        );
      })}
      {filas.map((f, i) => {
        const cx = m.l + paso * i + paso / 2;
        return (
          <g key={f.mm}>
            <rect x={cx + 3} y={y(f.meta)} width={an} height={Math.max(3, m.t + ih - y(f.meta))}
                  rx={5} fill="url(#gmetav)" />
            <rect x={cx - an - 3} y={y(f.pct)} width={an} height={Math.max(3, m.t + ih - y(f.pct))}
                  rx={5} fill={f.pct > f.meta ? "url(#gmalov)" : "url(#grealv)"}>
              <title>{`${MESES[f.mm - 1]}\nQuiebra ${pf(f.pct)} · Meta ${pf(f.meta)}\n${nf.format(f.perd)} de ${nf.format(f.prod)} und`}</title>
            </rect>
            <text x={cx - an / 2 - 3} y={y(f.pct) - 9} className="dato" textAnchor="middle"
                  fill={f.pct > f.meta ? "#c33b2e" : "#1b8a5a"}>{pf(f.pct, 1)}</text>
            <text x={cx} y={H - 13} className="eje" textAnchor="middle">{MESES[f.mm - 1]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function GraficoPareto({ bajas, causales }: { bajas: Baja[]; causales: string[] }) {
  const W = 560, H = 300, m = { t: 6, r: 64, b: 6, l: 156 };
  const iw = W - m.l - m.r;
  const map = new Map<string, number>();
  for (const b of bajas) map.set(b.causal, (map.get(b.causal) ?? 0) + Number(b.cantidad));
  const d = [...map.entries()].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const tot = d.reduce((a, x) => a + x[1], 0);
  const alto = (H - m.t - m.b) / Math.max(1, d.length);
  const max = d[0]?.[1] ?? 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Quiebra por causal">
      <Defs vertical={false} />
      {!d.length && <Vacio w={W} h={H} />}
      {d.map(([c, v], i) => {
        const idx = causales.indexOf(c), yy = m.t + alto * i;
        const h = Math.min(26, alto * 0.56), w = Math.max(4, (v / max) * iw);
        return (
          <g key={c}>
            <rect x={m.l} y={yy + (alto - h) / 2} width={iw} height={h} rx={5} fill="#eef3f9" />
            <rect x={m.l} y={yy + (alto - h) / 2} width={w} height={h} rx={5}
                  fill={`url(#gc${(idx < 0 ? 6 : idx) % 7}h)`}>
              <title>{`${c}\n${nf.format(v)} und · ${pf(v / tot, 1)}`}</title>
            </rect>
            <text x={m.l - 11} y={yy + alto / 2 + 4} className="eje" textAnchor="end">{c}</text>
            <text x={m.l + iw + 10} y={yy + alto / 2 + 4} className="dato" fill="#0f1f38">
              {pf(v / tot, 1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function GraficoDia({ bajas, prod, meta }: { bajas: Baja[]; prod: Produccion[]; meta: number }) {
  const W = 980, H = 260, m = { t: 16, r: 14, b: 30, l: 48 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const pd = new Map<string, number>(), ld = new Map<string, number>();
  for (const p of prod) pd.set(p.fecha, (pd.get(p.fecha) ?? 0) + Number(p.cantidad));
  for (const b of bajas) ld.set(b.fecha, (ld.get(b.fecha) ?? 0) + Number(b.cantidad));
  const dias = [...new Set([...pd.keys(), ...ld.keys()])].sort();
  const filas = dias.map((f) => {
    const p = pd.get(f) ?? 0, q = ld.get(f) ?? 0;
    return { f, prod: p, perd: q, pct: p ? q / p : 0 };
  });
  // Percentil 95: unos pocos días de producción mínima disparan porcentajes
  // enormes y aplastan el resto. Los que se salen van al tope con una punta.
  const orden = filas.map((x) => x.pct).sort((a, b) => a - b);
  const p95 = orden[Math.min(orden.length - 1, Math.floor(orden.length * 0.95))] || 0.01;
  const max = Math.max(meta * 1.6, p95) * 1.12 || 0.01;
  const y = (v: number) => m.t + ih - (Math.min(v, max) / max) * ih;
  const paso = iw / Math.max(1, filas.length);
  const an = Math.max(2, Math.min(15, paso * 0.66));
  const cada = Math.ceil(filas.length / 22) || 1;
  const fuera = filas.filter((x) => x.pct > max).length;

  return (
    <>
      <p className="sub" style={{ marginTop: -8, marginBottom: 10 }}>
        {filas.length
          ? `${filas.length} días · ${filas[0].f} a ${filas[filas.length - 1].f}` +
            (fuera ? ` · ${fuera} día${fuera > 1 ? "s" : ""} fuera de escala` : "")
          : ""}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Quiebra diaria">
        <Defs vertical />
        {!filas.length && <Vacio w={W} h={H} />}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (max * i) / 4;
          return (
            <g key={i}>
              <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="gridline" />
              <text x={m.l - 9} y={y(v) + 4} className="eje" textAnchor="end">{pf(v, 1)}</text>
            </g>
          );
        })}
        {!!filas.length && (
          <line x1={m.l} x2={W - m.r} y1={y(meta)} y2={y(meta)} stroke="#c9d4e2"
                strokeWidth={2} strokeDasharray="5 4" />
        )}
        {filas.map((x, i) => {
          const px = m.l + paso * i + (paso - an) / 2;
          const corta = x.pct > max, yv = y(x.pct);
          return (
            <g key={x.f}>
              <rect x={px} y={yv} width={an} height={Math.max(1.5, m.t + ih - yv)}
                    rx={Math.min(3, an / 2)}
                    fill={x.pct > meta ? "url(#gmalov)" : "url(#grealv)"}>
                <title>{`${x.f}\nQuiebra ${pf(x.pct)}${corta ? " (fuera de escala)" : ""}\n${nf.format(x.perd)} de ${nf.format(x.prod)} und`}</title>
              </rect>
              {corta && <path d={`M${px - 1} ${yv - 3} L${px + an / 2} ${yv - 8} L${px + an + 1} ${yv - 3} Z`} fill="#c30a17" />}
              {i % cada === 0 && (
                <text x={px + an / 2} y={H - 10} className="eje" textAnchor="middle">
                  {x.f.slice(8)}/{x.f.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </>
  );
}

function GraficoApilado({ bajas, causales }: { bajas: Baja[]; causales: string[] }) {
  const W = 480, H = 250, m = { t: 12, r: 8, b: 28, l: 52 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const meses = [...new Set(bajas.map((b) => mesDe(b.fecha)))].sort((a, b) => a - b);
  const cs = [...new Set(bajas.map((b) => b.causal))]
    .sort((a, b) => causales.indexOf(a) - causales.indexOf(b));
  const mat = meses.map((mm) =>
    cs.map((c) => bajas.filter((b) => mesDe(b.fecha) === mm && b.causal === c)
      .reduce((a, b) => a + Number(b.cantidad), 0))
  );
  const tot = mat.map((f) => f.reduce((a, b) => a + Math.max(0, b), 0));
  const max = Math.max(1, ...tot) * 1.12;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const paso = iw / Math.max(1, meses.length), an = Math.min(28, paso * 0.58);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Composición mensual por causal">
        <Defs vertical />
        {!meses.length && <Vacio w={W} h={H} />}
        {[0, 1, 2, 3].map((i) => {
          const v = (max * i) / 3;
          return (
            <g key={i}>
              <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="gridline" />
              <text x={m.l - 8} y={y(v) + 4} className="eje" textAnchor="end">
                {v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1e3) + "k"}
              </text>
            </g>
          );
        })}
        {meses.map((mm, i) => {
          const x = m.l + paso * i + (paso - an) / 2;
          let ac = 0;
          return (
            <g key={mm}>
              {cs.map((c, j) => {
                const v = mat[i][j];
                if (v <= 0) return null;
                const y0 = y(ac + v), h = Math.max(1, y(ac) - y0 - 2);
                ac += v;
                const idx = causales.indexOf(c);
                return (
                  <rect key={c} x={x} y={y0} width={an} height={h} rx={2}
                        fill={`url(#gc${(idx < 0 ? 6 : idx) % 7}v)`}>
                    <title>{`${MESES[mm - 1]} · ${c}\n${nf.format(v)} und`}</title>
                  </rect>
                );
              })}
              <text x={x + an / 2} y={H - 9} className="eje" textAnchor="middle">{MESES[mm - 1]}</text>
            </g>
          );
        })}
      </svg>
      <div className="leyenda" style={{ marginTop: 12 }}>
        {cs.map((c) => (
          <span key={c}><i style={{ background: COL[Math.max(0, causales.indexOf(c)) % 7] }} />{c}</span>
        ))}
      </div>
    </>
  );
}

function TablaMateriales({ bajas, total }: { bajas: Baja[]; total: number }) {
  const map = new Map<string, { den: string; v: number }>();
  for (const b of bajas) {
    const k = b.material ?? "—";
    const a = map.get(k) ?? { den: b.denominacion ?? k, v: 0 };
    a.v += Number(b.cantidad); map.set(k, a);
  }
  const top = [...map.entries()].filter((x) => x[1].v > 0).sort((a, b) => b[1].v - a[1].v).slice(0, 8);
  const mx = top[0]?.[1].v ?? 1;
  return (
    <table>
      <tbody>
        <tr><th>Envase</th><th className="n">Unidades</th><th className="n">Part.</th><th style={{ width: 84 }} /></tr>
        {top.map(([cod, x]) => (
          <tr key={cod}>
            <td>{x.den}<br /><span className="cod">{cod}</span></td>
            <td className="n">{nf.format(x.v)}</td>
            <td className="n">{pf(x.v / total, 1)}</td>
            <td><div className="barrita" style={{ width: Math.max(4, (x.v / mx) * 76) }} /></td>
          </tr>
        ))}
        {!top.length && <tr><td colSpan={4} className="vacio">Sin datos</td></tr>}
      </tbody>
    </table>
  );
}

function TablaAlmacen({ bajas, total }: { bajas: Baja[]; total: number }) {
  const map = new Map<string, number>();
  for (const b of bajas) map.set(b.almacen ?? "—", (map.get(b.almacen ?? "—") ?? 0) + Number(b.cantidad));
  const d = [...map.entries()].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const mx = d[0]?.[1] ?? 1;
  return (
    <table>
      <tbody>
        <tr><th>Almacén</th><th className="n">Unidades</th><th className="n">Part.</th></tr>
        {d.map(([a, v]) => (
          <tr key={a}>
            <td>{a}<div className="barrita" style={{ width: Math.max(4, (v / mx) * 100), marginTop: 6 }} /></td>
            <td className="n">{nf.format(v)}</td>
            <td className="n">{pf(v / total, 1)}</td>
          </tr>
        ))}
        {!d.length && <tr><td colSpan={3} className="vacio">Sin datos</td></tr>}
      </tbody>
    </table>
  );
}

function TablaMes({ prodMes, perdMes, metaDe }: {
  prodMes: Map<number, number>; perdMes: Map<number, number>; metaDe: (m: number) => number;
}) {
  const meses = [...prodMes.keys()].sort((a, b) => a - b);
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <tbody>
          <tr><th>Mes</th><th className="n">Producción</th><th className="n">Quiebra</th><th className="n">%</th><th className="n">Meta</th></tr>
          {meses.map((mm) => {
            const p = prodMes.get(mm) ?? 0, q = perdMes.get(mm) ?? 0, pc = p ? q / p : 0;
            return (
              <tr key={mm}>
                <td>{MESES[mm - 1]}</td>
                <td className="n">{nf.format(p)}</td>
                <td className="n">{nf.format(q)}</td>
                <td className={`n ${pc > metaDe(mm) ? "malo" : "bien"}`}>{pf(pc)}</td>
                <td className="n">{pf(metaDe(mm))}</td>
              </tr>
            );
          })}
          {!meses.length && <tr><td colSpan={5} className="vacio">Sin datos</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Banda({ pct, meta, sobre, pp, parcial, ultimaCarga, esEditor }: {
  pct: number | null; meta: number; sobre: boolean; pp: number; parcial: boolean;
  ultimaCarga: Carga | null; esEditor: boolean;
}) {
  return (
    <div className="banda">
      <div className="titulo">
        <p className="eyebrow">Envase retornable · Ag01</p>
        <h1>Quiebra de envase</h1>
        <p>
          Rotura medida contra la producción del período.
          {ultimaCarga && (
            <> Datos del {ultimaCarga.desde} al {ultimaCarga.hasta}.</>
          )}
          {esEditor && <> <Link href="/quiebra/importar" className="enlace">Actualizar</Link></>}
        </p>
      </div>
      <div className={`hero ${sobre ? "sobre" : "bajo"}`}>
        <div className="ht">Quiebra del período</div>
        <div className="hv">{pf(pct)}</div>
        <div className="hr">
          <span className="hmeta">Meta {pf(meta)}{parcial ? " · filtrado" : ""}</span>
          <span className="hbadge">
            {sobre ? "▲" : "▼"} {pp > 0 ? "+" : ""}{pp.toFixed(2).replace(".", ",")} pp
          </span>
        </div>
      </div>
    </div>
  );
}
