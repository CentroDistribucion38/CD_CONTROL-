"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Diagrama as Dg, Forma } from "@/modulos/gestion/referencia/diagramas-datos";

/**
 * UN DIAGRAMA DEL EXCEL (mapa de procesos, flujos, árbol dibujado) con las formas en su sitio, las flechas y los rótulos.
 * Es solo para mirar: se acerca, se aleja, se arrastra con el mouse y se abre en pantalla completa. Los datos salen de
 * src/modulos/gestion/referencia (generados desde el Excel), no de la base.
 */
const PASO = 1.25;

const Llave = () => (
  <svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
    <path d="M10 0 C4 0 4 8 4 18 L4 38 C4 45 0 50 0 50 C0 50 4 55 4 62 L4 82 C4 92 4 100 10 100" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
  </svg>
);

function Pieza({ f }: { f: Forma }) {
  if (f.g === "llave") return <div className="dg-f g-llave" style={{ left: f.x, top: f.y, width: Math.max(f.w, 14), height: f.h }}><Llave /></div>;
  return (
    <div className={`dg-f g-${f.g} k-${f.k}`} style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
      <i className="b" /><i className="r" />
      <span>{f.t}</span>
    </div>
  );
}

export function Diagrama({ d }: { d: Dg }) {
  const marco = useRef<HTMLElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const arr = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const [z, setZ] = useState(0.5);
  const [pantalla, setPantalla] = useState(false);

  const ajustar = useCallback(() => {
    const el = caja.current;
    if (!el) return;
    setZ(Math.max(0.12, Math.min(1, (el.clientWidth - 2) / d.w)));
    el.scrollTo({ left: 0, top: 0 });
  }, [d.w]);
  useEffect(() => { ajustar() }, [ajustar]);
  useEffect(() => {
    const h = () => setPantalla(document.fullscreenElement === marco.current);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  /* Acercar/alejar dejando en el centro lo que se estaba mirando. */
  const poner = (nuevo: number) => {
    const el = caja.current;
    const n = Math.max(0.12, Math.min(2, nuevo));
    if (!el) { setZ(n); return }
    const cx = (el.scrollLeft + el.clientWidth / 2) / z, cy = (el.scrollTop + el.clientHeight / 2) / z;
    setZ(n);
    requestAnimationFrame(() => { el.scrollLeft = cx * n - el.clientWidth / 2; el.scrollTop = cy * n - el.clientHeight / 2 });
  };
  const completa = () => {
    const m = marco.current;
    if (!m) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void m.requestFullscreen?.();
  };

  const abajo = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = caja.current;
    if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
    arr.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    el.setPointerCapture(e.pointerId);
    el.classList.add("mueve");
  };
  const mueve = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = caja.current, a = arr.current;
    if (!el || !a) return;
    el.scrollLeft = a.l - (e.clientX - a.x);
    el.scrollTop = a.t - (e.clientY - a.y);
  };
  const suelta = () => { arr.current = null; caja.current?.classList.remove("mueve") };

  const marca = `dg-flecha-${d.id}`;
  return (
    <figure className={"dg" + (pantalla ? " completa" : "")} ref={marco}>
      <div className="dg-barra">
        <b>{d.titulo}</b>
        <span className="dg-botones">
          <button type="button" onClick={() => poner(z / PASO)} aria-label="Alejar">−</button>
          <output>{Math.round(z * 100)}%</output>
          <button type="button" onClick={() => poner(z * PASO)} aria-label="Acercar">+</button>
          <button type="button" onClick={ajustar}>Ajustar</button>
          <button type="button" onClick={() => poner(1)}>100%</button>
          <button type="button" onClick={completa}>{pantalla ? "Salir" : "Pantalla completa"}</button>
        </span>
      </div>
      <div className="dg-vista" ref={caja} onPointerDown={abajo} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta}>
        <div className="dg-lienzo" style={{ width: d.w * z, height: d.h * z }}>
          <div className="dg-capa" style={{ width: d.w, height: d.h, transform: `scale(${z})` }}>
            <svg className="dg-lineas" width={d.w} height={d.h} aria-hidden="true">
              <defs>
                <marker id={marca} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {d.guias.map((g, i) => <line key={"g" + i} className="gu" x1={g[0]} y1={g[1]} x2={g[2]} y2={g[3]} />)}
              {d.lineas.map((l, i) => (
                <polyline key={i} points={l.p.map((q) => q.join(",")).join(" ")} fill="none"
                  markerEnd={l.a & 1 ? `url(#${marca})` : undefined} markerStart={l.a & 2 ? `url(#${marca})` : undefined} />
              ))}
            </svg>
            {d.rotulos.map((r, i) => <div key={"r" + i} className={"dg-r" + (/^N\d:/.test(r.t) ? " n" : "")} style={{ left: r.x, top: r.y }}>{r.t}</div>)}
            {d.formas.map((f) => <Pieza key={f.i} f={f} />)}
          </div>
        </div>
      </div>
      <figcaption>Arrastra para mover · {d.hoja}</figcaption>
    </figure>
  );
}
