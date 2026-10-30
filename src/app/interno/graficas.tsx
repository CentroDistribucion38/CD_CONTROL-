/* Gráficas del panel de consumo: SVG puro, sin librerías. Colores fijos (no variables CSS) para que «Copiar imagen» las pinte igual. */
import { nf } from "@/modulos/consumo/formato";

export const COL = { lav: "#FFC300", baja: "#A87B00", ext: "#2B2B2B", rojo: "#D5001C", tinta: "#111111", gris: "#6B6B6B", linea: "#D9D9D9", verde: "#1E7F3C" };

/** Columnas por día. `datos` tiene un lugar por día; null = ese día no hay foto. */
export function Columnas({ datos, etiquetas, hoy, prom, color = COL.lav }: { datos: (number | null)[]; etiquetas: string[]; hoy: number; prom: number | null; color?: string }) {
  const W = 1000, H = 300, pl = 44, pr = 8, pt = 26, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
  const vals = datos.filter((v): v is number => v != null);
  const mx = Math.max(10, ...vals, prom ?? 0) * 1.2;
  const bonito = (() => { const p = 10 ** Math.floor(Math.log10(mx)); const m = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= mx) ?? mx; return m; })();
  const y = (v: number) => pt + ih - (v / bonito) * ih;
  const paso = iw / datos.length, bw = paso * 0.68;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Consultas por día" style={{ display: "block", maxHeight: 330 }} fontFamily="inherit">
      {[0, 1, 2, 3, 4].map((t) => { const v = (bonito * t) / 4; return (<g key={t}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke={COL.linea} /><text x={pl - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill={COL.gris}>{nf(0).format(v)}</text></g>); })}
      {datos.map((v, i) => {
        const cx = pl + paso * i + paso / 2, on = i === hoy;
        return (
          <g key={i}>
            {on && <rect x={cx - paso / 2 + 1} y={pt - 14} width={paso - 2} height={ih + 14} fill="#FFC30022" />}
            {v != null && <rect x={cx - bw / 2} y={y(v)} width={bw} height={Math.max(ih - (y(v) - pt), 1.5)} fill={color} />}
            {v != null && on && <text x={cx} y={y(v) - 6} fontSize="13" fontWeight={800} textAnchor="middle" fill={COL.tinta}>{nf(0).format(v)}</text>}
            {(i % 2 === 0 || on) && <text x={cx} y={H - 8} fontSize="11" fontWeight={on ? 800 : 500} textAnchor="middle" fill={on ? COL.tinta : COL.gris}>{etiquetas[i]}</text>}
          </g>
        );
      })}
      {prom != null && (<g><line x1={pl} x2={W - pr} y1={y(prom)} y2={y(prom)} stroke={COL.rojo} strokeWidth="1.6" strokeDasharray="6 4" /><text x={pl + 4} y={y(prom) - 6} fontSize="11" fontWeight={800} fill={COL.rojo} stroke="#fff" strokeWidth="3" paintOrder="stroke">Promedio {nf(0).format(prom)}</text></g>)}
    </svg>
  );
}

/** Línea con área; el último punto va en rojo. */
export function Linea({ datos, color = COL.lav, trazo = "#C89A00", w = 360, h = 64 }: { datos: number[]; color?: string; trazo?: string; w?: number; h?: number }) {
  if (datos.length < 2) return <p className="ci-vacio">La curva se arma con una foto por día; empieza a llenarse hoy.</p>;
  const lo = Math.min(...datos) * 0.985, hi = Math.max(...datos) * 1.015 || 1, p = 8;
  const X = (i: number) => p + ((w - 2 * p) * i) / (datos.length - 1), Y = (v: number) => p + (h - 2 * p) - ((v - lo) / (hi - lo || 1)) * (h - 2 * p);
  const d = datos.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const e = datos.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: "block", maxHeight: h }} aria-hidden="true">
      <path d={`${d} L${X(e)} ${h - p} L${X(0)} ${h - p} Z`} fill={color} opacity=".32" />
      <path d={d} fill="none" stroke={trazo} strokeWidth="2" />
      <circle cx={X(e)} cy={Y(datos[e])} r="4.5" fill={COL.rojo} stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function Dona({ partes, centro, sub }: { partes: { v: number; c: string }[]; centro: string; sub: string }) {
  const S = 200, r = S / 2, ri = r * 0.62, tot = partes.reduce((t, p) => t + p.v, 0) || 1;
  let a = -Math.PI / 2;
  const trozos = partes.filter((p) => p.v > 0).map((p, i) => {
    const da = (p.v / tot) * Math.PI * 2, a2 = a + (da >= Math.PI * 2 ? Math.PI * 2 - 0.0001 : da), big = da > Math.PI ? 1 : 0;
    const P = (rr: number, aa: number) => [r + rr * Math.cos(aa), r + rr * Math.sin(aa)];
    const [x1, y1] = P(r - 1, a), [x2, y2] = P(r - 1, a2), [x3, y3] = P(ri, a2), [x4, y4] = P(ri, a);
    a += da;
    return <path key={i} d={`M${x1} ${y1} A${r - 1} ${r - 1} 0 ${big} 1 ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 ${big} 0 ${x4} ${y4} Z`} fill={p.c} stroke="#fff" strokeWidth="2" />;
  });
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ display: "block", maxWidth: 210, margin: "0 auto" }} role="img" aria-label={`${centro} ${sub}`}>
      {trozos}
      <text x={r} y={r + 6} fontSize="32" fontWeight={900} textAnchor="middle" fill={COL.tinta}>{centro}</text>
      <text x={r} y={r + 26} fontSize="13" fontWeight={600} textAnchor="middle" fill={COL.gris}>{sub}</text>
    </svg>
  );
}

/** Barra de cuota: relleno = lo usado; rayita roja = hacia dónde va el mes. */
export function Cuota({ pct, proy }: { pct: number; proy?: number }) {
  const vis = Math.max(pct, 0.8), p = proy ?? pct;
  return (
    <svg viewBox="0 0 400 26" width="100%" style={{ display: "block" }} role="img" aria-label={`${nf(1).format(pct)} % usado`}>
      <rect x="0" y="4" width="400" height="18" fill="#E6E6E6" />
      <rect x="0" y="4" width={Math.min(vis, 100) * 4} height="18" fill={COL.lav} />
      <rect x={Math.max(Math.min(p, 99.5) * 4 - 1.5, 0)} y="0" width="3" height="26" fill={COL.rojo} />
    </svg>
  );
}
