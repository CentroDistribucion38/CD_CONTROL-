"use client";

/**
 * LA FIRMA CON EL DEDO, O CON EL MOUSE.
 *
 * «Que cuando uno vaya a guardar ponga el nombre de quien elaboró, y
 * algo para digitar la firma con el dedo, lo que sea, cursor.»
 *
 * UN CANVAS CON EVENTOS DE PUNTERO: los mismos para el dedo, el lápiz y
 * el mouse, sin librería. `touch-action: none` en el CSS es lo que evita
 * que, al firmar con el dedo, el teléfono tome el trazo como un intento
 * de mover la página.
 *
 * SE DIBUJA AL DOBLE DE RESOLUCIÓN que se ve: en el PDF la firma se
 * imprime más grande que en la pantalla, y a resolución de pantalla
 * saldría escalonada.
 *
 * DEVUELVE UN PNG TRANSPARENTE (data URL), o null si se borró: tinta
 * sola, sin fondo, para que en el papel se vea sobre la raya y no como
 * un recuadro blanco pegado encima.
 */
import { useEffect, useRef, useState } from "react";

const ESCALA = 2;

/** LA FIRMA SOLA, SIN EL AIRE DEL LIENZO. El lienzo es tan ancho como la
 *  pantalla y la firma ocupa una parte; si se manda entero, en el PDF la
 *  firma sale chiquita en una esquina del hueco. Se recorta al trazo con
 *  un borde pequeño, y así ocupa el alto del hueco. */
export function recortar(c: HTMLCanvasElement): string {
  const ctx = c.getContext("2d");
  if (!ctx) return c.toDataURL("image/png");
  const { width: w, height: h } = c;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (x1 < 0) return c.toDataURL("image/png");
  const b = 6 * ESCALA;
  x0 = Math.max(0, x0 - b); y0 = Math.max(0, y0 - b);
  x1 = Math.min(w - 1, x1 + b); y1 = Math.min(h - 1, y1 + b);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d")?.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

export function FirmaDedo({ alCambiar }: { alCambiar: (png: string | null) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [hay, setHay] = useState(false);
  /* El mismo dato en una ref: al soltar el dedo, el render con `hay`
     nuevo puede no haber llegado todavía, y la firma no se entregaría. */
  const hayYa = useRef(false);
  const marcar = (v: boolean) => { hayYa.current = v; setHay(v); };

  /* EL TAMAÑO DEL LIENZO SIGUE AL DE LA CAJA, que cambia con la pantalla. */
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    /* Cambiar el tamaño de un canvas lo borra: solo se hace cuando de
       verdad cambió, y entonces se avisa que ya no hay firma. */
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * ESCALA));
      const h = Math.max(1, Math.round(r.height * ESCALA));
      if (w === c.width && h === c.height) return;
      c.width = w; c.height = h;
      if (hayYa.current) { marcar(false); alCambiar(null); }
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) * ESCALA, y: (e.clientY - r.top) * ESCALA };
  };

  function empezar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dibujando.current = true;
    ultimo.current = punto(e);
    trazo(e);
  }

  function trazo(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const c = lienzo.current, ctx = c?.getContext("2d");
    if (!c || !ctx || !ultimo.current) return;
    const p = punto(e);
    ctx.strokeStyle = "#12263A";
    ctx.lineWidth = 2.4 * ESCALA;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    ultimo.current = p;
    if (!hayYa.current) marcar(true);
  }

  function terminar() {
    if (!dibujando.current) return;
    dibujando.current = false;
    ultimo.current = null;
    const c = lienzo.current;
    if (c && hayYa.current) alCambiar(recortar(c));
  }

  function borrar() {
    const c = lienzo.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    marcar(false);
    alCambiar(null);
  }

  return (
    <div className={"rl-firma-dedo" + (hay ? " con" : "")}>
      <canvas ref={lienzo} aria-label="Firma: dibújala con el dedo o con el mouse"
              onPointerDown={empezar} onPointerMove={trazo}
              onPointerUp={terminar} onPointerCancel={terminar} onPointerLeave={terminar} />
      {!hay && <span className="rl-firma-guia" aria-hidden="true">Firma aquí con el dedo o el mouse</span>}
      <button type="button" className="rl-firma-borrar" onClick={borrar} disabled={!hay}>Borrar firma</button>
    </div>
  );
}
