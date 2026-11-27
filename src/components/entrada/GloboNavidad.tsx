"use client";

import { useEffect, useRef, type RefObject } from "react";
import "./entrada-navidad.css";

/**
 * EL GLOBO DE NIEVE DE NAVIDAD (entrada de la app en temporada, ver lib/temporada.ts).
 *
 * El movimiento del globo (cae, rebota, se sacude) y el gorro que se bambolea son CSS, para que arranquen con el
 * primer cuadro aunque la app tarde en cargar. La nieve es un canvas con una física sencilla: los copos están
 * quietos en el fondo; cuando el globo aterriza salen disparados hacia arriba, el agua los arremolina con la
 * sacudida y bajan despacio hasta volver a posarse. El reloj de la nieve es el de la animación CSS del globo,
 * así siempre van juntos. Cada vez que alguien entra, la nieve cae distinta.
 */
const CX = 220, CY = 185, R = 150;

/* La misma sacudida que las keyframes gn-cae (entrada-navidad.css): seno amortiguado desde que aterriza. */
const angulo = (t: number) => (t < 0.72 ? 0 : 10 * Math.sin(2 * Math.PI * 2.6 * (t - 0.72)) * Math.exp(-(t - 0.72) * 2.3));
const suelo = (x: number) => CY + R - 14 - Math.max(0, 22 * (1 - ((x - CX) / R) ** 2));

type Copo = { x: number; y: number; vx: number; vy: number; r: number; s: number; quieto: boolean; grande: boolean };

export function GloboNavidad({ bRef }: { bRef: RefObject<HTMLDivElement | null> }) {
  const globo = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = lienzo.current, el = globo.current;
    if (!cv || !el) return;
    const c = cv.getContext("2d");
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = 440 * dpr; cv.height = 440 * dpr; c.scale(dpr, dpr);
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const copos: Copo[] = Array.from({ length: 170 }, () => {
      const x = CX + (Math.random() * 2 - 1) * (R - 30);
      return { x, y: suelo(x) + Math.random() * 10 - 2, vx: 0, vy: 0, r: 1.3 + Math.random() * 2.6, s: Math.random() * 6.28, quieto: true, grande: Math.random() < 0.12 };
    });
    /* Con «reducir movimiento» la nieve queda repartida y quieta, sin física. */
    if (reducir) copos.forEach((p) => { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * (R - 12); p.x = CX + d * Math.cos(a); p.y = CY + d * Math.sin(a) });

    let tSim = 0, lanzado = false, angAnt = 0, velAnt = 0;
    const paso = (dt: number, t: number) => {
      const a = angulo(t), v = (a - angAnt) / dt, ac = (v - velAnt) / dt;
      angAnt = a; velAnt = v;
      if (!lanzado && t >= 0.78) {
        lanzado = true;
        copos.forEach((p) => { p.quieto = false; p.vy = -(240 + Math.random() * 320); p.vx = (CX - p.x) * 0.4 + (Math.random() * 2 - 1) * 150 });
      }
      for (const p of copos) {
        if (p.quieto) continue;
        /* El agua se queda atrás cuando el globo gira: remolino. */
        p.vx += -ac * 0.0045 * (p.y - CY) * dt * 0.96;
        p.vy += ac * 0.0045 * (p.x - CX) * dt * 0.96;
        p.vy += 55 * dt;
        const roce = Math.exp(-(p.grande ? 2.2 : 2.8) * dt);
        p.vx *= roce; p.vy *= roce;
        p.vx += Math.sin(t * 1.7 + p.s) * 14 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const dx = p.x - CX, dy = p.y - CY, d = Math.hypot(dx, dy), lim = R - 8 - p.r;
        if (d > lim) {
          const nx = dx / d, ny = dy / d; p.x = CX + nx * lim; p.y = CY + ny * lim;
          const vn = p.vx * nx + p.vy * ny; if (vn > 0) { p.vx -= 1.6 * vn * nx; p.vy -= 1.6 * vn * ny }
        }
        if (t > 2.2 && p.vy > 0 && p.y > suelo(p.x)) { p.y = suelo(p.x); p.quieto = true }
      }
    };
    const dibuja = () => {
      c.clearRect(0, 0, 440, 440);
      c.save(); c.beginPath(); c.arc(CX, CY, R - 3, 0, 7); c.clip();
      c.fillStyle = "#fff"; c.shadowColor = "rgba(255,255,255,.95)";
      for (const p of copos) {
        c.shadowBlur = 4; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); c.shadowBlur = 0;
        if (p.grande) {
          c.strokeStyle = "#fff"; c.lineWidth = 1.3;
          for (let k = 0; k < 3; k++) {
            const an = k * Math.PI / 3 + p.s, l = p.r * 1.9;
            c.beginPath(); c.moveTo(p.x - Math.cos(an) * l, p.y - Math.sin(an) * l); c.lineTo(p.x + Math.cos(an) * l, p.y + Math.sin(an) * l); c.stroke();
          }
        }
      }
      c.restore();
    };
    if (reducir) { dibuja(); return }

    /* El reloj: el tiempo de la animación CSS del globo (si el navegador no la expone, desde ahora). */
    const inicio = performance.now();
    const reloj = () => {
      const an = el.getAnimations?.().find((x) => (x as CSSAnimation).animationName === "gn-cae");
      const ms = an && typeof an.currentTime === "number" ? an.currentTime : performance.now() - inicio;
      return ms / 1000;
    };
    let raf = 0;
    const cuadro = () => {
      const t = Math.min(reloj(), 8);
      let n = 0;
      while (tSim < t && n++ < 600) { tSim += 1 / 120; paso(1 / 120, tSim) }
      dibuja();
      if (t < 8) raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div className="gn-glow" />
      <div className="gn">
        <div className="gn-globo" ref={globo}>
          <svg viewBox="0 0 440 440">
            <defs>
              <radialGradient id="gn-agua" cx=".5" cy=".42" r=".62"><stop offset="0" stopColor="#eef5fc" /><stop offset=".6" stopColor="#cfe0f1" /><stop offset="1" stopColor="#9fbbd8" /></radialGradient>
              <clipPath id="gn-esf"><circle cx={CX} cy={CY} r={R - 2} /></clipPath>
            </defs>
            <circle cx={CX} cy={CY} r={R} fill="url(#gn-agua)" />
            <g clipPath="url(#gn-esf)">
              <ellipse cx={CX} cy={CY + R - 6} rx={R} ry={40} fill="#f7fbff" />
              <ellipse cx={CX - 50} cy={CY + R - 20} rx={70} ry={24} fill="#fff" />
              <ellipse cx={CX + 60} cy={CY + R - 16} rx={60} ry={20} fill="#fbfdff" />
            </g>
          </svg>
          <div className="gn-b" ref={bRef}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="b" src="/marca/logo-b-hd.png" alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="gn-gorro" src="/marca/gorro-navidad.svg" alt="" />
          </div>
          <canvas ref={lienzo} width={440} height={440} />
          <svg viewBox="0 0 440 440">
            <defs>
              <radialGradient id="gn-vidrio" cx=".35" cy=".3" r=".85"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".75" stopColor="#dfe9f3" stopOpacity=".22" /><stop offset="1" stopColor="#9fb6cc" stopOpacity=".55" /></radialGradient>
              <linearGradient id="gn-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e4152d" /><stop offset="1" stopColor="#7d0712" /></linearGradient>
              <linearGradient id="gn-oro" x1="0" x2="1"><stop offset="0" stopColor="#b8862b" /><stop offset=".5" stopColor="#f6dc86" /><stop offset="1" stopColor="#b8862b" /></linearGradient>
              <linearGradient id="gn-brillo" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
              <clipPath id="gn-esf2"><circle cx={CX} cy={CY} r={R - 2} /></clipPath>
            </defs>
            <circle cx={CX} cy={CY} r={R} fill="url(#gn-vidrio)" stroke="#c4d3e2" strokeWidth="2" />
            <g clipPath="url(#gn-esf2)"><g className="gn-barre"><rect x={0} y={0} width={90} height={440} fill="url(#gn-brillo)" transform="skewX(-18)" /></g></g>
            <path d={`M${CX - 110},${CY - 70} A${R - 22},${R - 22} 0 0 1 ${CX - 40},${CY - 128}`} stroke="#fff" strokeWidth="10" fill="none" strokeLinecap="round" opacity=".85" />
            <path d={`M${CX - 122},${CY - 30} A${R - 22},${R - 22} 0 0 1 ${CX - 118},${CY - 50}`} stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".7" />
            <path d={`M${CX - 120},${CY + R - 28} L${CX + 120},${CY + R - 28} L${CX + 146},${CY + R + 52} L${CX - 146},${CY + R + 52} Z`} fill="url(#gn-base)" />
            <rect x={CX - 124} y={CY + R - 34} width={248} height={10} fill="url(#gn-oro)" />
            <rect x={CX - 146} y={CY + R + 48} width={292} height={8} fill="url(#gn-oro)" />
            <text x={CX} y={CY + R + 24} textAnchor="middle" fontFamily="Archivo, system-ui, sans-serif" fontWeight="800" fontSize="20" letterSpacing="10" fill="url(#gn-oro)">CD38</text>
          </svg>
        </div>
        <div className="gn-ley">FELIZ NAVIDAD · <b>CD38</b></div>
      </div>
    </>
  );
}
