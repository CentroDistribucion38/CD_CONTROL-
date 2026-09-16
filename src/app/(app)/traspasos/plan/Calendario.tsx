"use client";

import { useEffect, useRef, useState } from "react";
/* LOS NOMBRES DE LAS FECHAS VIENEN DE formato.ts, que es un archivo
   normal. Estaban aquí, y como este archivo es "use client", la página
   de Registrar —que es del servidor— reventaba al llamar conDia para
   cualquier día que no fuera hoy. Lo que el servidor va a llamar no
   puede vivir detrás de un "use client". */
import { MESES, partes, diaSemana, bonita, conDia } from "@/modulos/traspasos/formato";

/**
 * EL CALENDARIO DEL PLAN.
 *
 * Dos usos que comparten la misma rejilla de días:
 *
 *   IR A UN DÍA        una sola fecha. Las flechas de ± un día siguen
 *                      sirviendo para "mañana", pero moverse a fin de
 *                      mes eran veinte toques.
 *
 *   ESCOGER UN RANGO   para aplicar la rejilla a varios días.
 *
 * NO SE REUSA EL CALENDARIO DE QUIEBRA aunque exista: sus estilos viven
 * dentro de quiebra.css, y traerlos aquí significaría cargar la hoja
 * entera de otro módulo para dibujar siete columnas. La lógica de
 * fechas sí es la misma y está escrita igual a propósito.
 */

/** Empieza en lunes, que es como se lee un calendario de trabajo. */
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];

export const aTexto = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const cuantosDias = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
/** 0 = lunes. */
const huecoInicial = (a: number, m: number) => (new Date(Date.UTC(a, m, 1)).getUTCDay() + 6) % 7;




/** Todos los días entre dos fechas, incluidas las dos puntas. */
export function rango(desde: string, hasta: string) {
  const out: string[] = [];
  const fin = Date.parse(hasta + "T12:00:00");
  for (let t = Date.parse(desde + "T12:00:00"); t <= fin; t += 86400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/* ==================== La rejilla de un mes ==================== */

export function Mes({ ancla, ini, fin, hoy, mover, tocar, ocupados }: {
  ancla: { a: number; m: number };
  ini: string;
  fin: string;
  hoy: string;
  mover: (paso: number) => void;
  tocar: (f: string) => void;
  /** Días que ya tienen plan publicado. Se marcan para que quien escoge
   *  el rango vea de una cuáles se van a saltar, en vez de enterarse
   *  después por un mensaje. */
  ocupados?: Set<string>;
}) {
  const hueco = huecoInicial(ancla.a, ancla.m);
  const total = cuantosDias(ancla.a, ancla.m);

  return (
    <div className="cal">
      <div className="cal-cab">
        <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)}>
          <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6" /></svg>
        </button>
        <div className="cal-titulo">{MESES[ancla.m]} {ancla.a}</div>
        <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)}>
          <svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6" /></svg>
        </button>
      </div>

      <div className="cal-sem">{DIAS.map((d, i) => <span key={i}>{d}</span>)}</div>

      <div className="cal-dias">
        {Array.from({ length: hueco }).map((_, i) => <span key={"h" + i} />)}
        {Array.from({ length: total }).map((_, i) => {
          const f = aTexto(ancla.a, ancla.m, i + 1);
          const clases = [
            f === ini ? "punta inicio" : "",
            fin && f === fin ? "punta fin" : "",
            fin && f > ini && f < fin ? "dentro" : "",
            /* cal-hoy y no "hoy": esa clase ya es la tarjeta
               "Viajes de hoy" de Registrar, y su margin-top
               desalineaba el día dentro de la rejilla. */
            f === hoy ? "cal-hoy" : "",
            ocupados?.has(f) ? "ocupado" : "",
          ].filter(Boolean).join(" ");
          return (
            <button key={f} type="button" className={clases} onClick={() => tocar(f)}
                    title={ocupados?.has(f) ? "Ya tiene plan publicado" : undefined}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Cierra al tocar por fuera. Sin esto quedan dos calendarios abiertos
 *  a la vez y el de abajo tapa al de arriba. */
export function useAfuera(ref: React.RefObject<HTMLElement | null>, cerrar: () => void) {
  useEffect(() => {
    const f = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("pointerdown", f);
    return () => document.removeEventListener("pointerdown", f);
  }, [ref, cerrar]);
}

/* ==================== Escoger UN día ==================== */

export function EscogerDia({ dia, hoy, alEscoger }: {
  dia: string; hoy: string; alEscoger: (f: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState(() => partes(dia));
  const caja = useRef<HTMLDivElement>(null);
  useAfuera(caja, () => setAbierto(false));

  useEffect(() => { if (abierto) setAncla(partes(dia)) }, [abierto, dia]);

  const mover = (p: number) => setAncla((x) => {
    const m = x.m + p;
    return { ...x, a: x.a + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });

  return (
    <div className="cal-caja" ref={caja}>
      <button type="button" className="cal-disparo" aria-expanded={abierto}
              onClick={() => setAbierto((v) => !v)}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        {conDia(dia)}
      </button>
      {abierto && (
        <div className="cal-flota">
          <Mes ancla={ancla} ini={dia} fin="" hoy={hoy} mover={mover}
               tocar={(f) => { setAbierto(false); alEscoger(f) }} />
        </div>
      )}
    </div>
  );
}
