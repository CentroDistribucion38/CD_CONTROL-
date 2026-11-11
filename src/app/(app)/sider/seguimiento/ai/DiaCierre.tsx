"use client";

/**
 * EL DÍA DEL CIERRE: un calendario propio, recto, con el negro y el amarillo del cierre, en vez del selector del navegador
 * (ese sale con flechas sueltas, «Borrar» y «Hoy» y no deja ver de un vistazo qué día es hoy ni cuáles no se pueden elegir).
 * Un solo día. Los días futuros se ven apagados: no hay revisiones que cerrar de un día que no ha llegado.
 */
import { useEffect, useRef, useState } from "react";
import { MESES_LARGO } from "@/modulos/sider/comun";

const dos = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dos(m)}-${dos(d)}`;
const dmy = (f: string) => f.split("-").reverse().join("/");
const mover = (f: string, n: number) => { const [a, m, d] = f.split("-").map(Number); const x = new Date(Date.UTC(a, m - 1, d + n)); return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()) };
const SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

export function DiaCierre({ valor, hoy, alCambiar }: { valor: string; hoy: string; alCambiar: (f: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [anio, setAnio] = useState(Number(valor.slice(0, 4)));
  const [mes, setMes] = useState(Number(valor.slice(5, 7)));
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setAbierto(false) } };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla, true);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla, true) };
  }, [abierto]);

  function abrir() { setAnio(Number(valor.slice(0, 4))); setMes(Number(valor.slice(5, 7))); setAbierto((a) => !a) }
  function ir(n: number) { const x = new Date(anio, mes - 1 + n, 1); setAnio(x.getFullYear()); setMes(x.getMonth() + 1) }
  function elegir(f: string) { setAbierto(false); if (f !== valor) alCambiar(f) }

  const total = new Date(anio, mes, 0).getDate();
  const huecos = (new Date(anio, mes - 1, 1).getDay() + 6) % 7; /* la semana arranca el lunes */
  const celdas: (number | null)[] = [...Array(huecos).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const hoyA = Number(hoy.slice(0, 4)), hoyM = Number(hoy.slice(5, 7));
  const sigueFuturo = anio > hoyA || (anio === hoyA && mes >= hoyM);

  return (
    <div className="dc" ref={caja}>
      <button type="button" className={"dc-campo" + (abierto ? " abierto" : "")} aria-haspopup="dialog" aria-expanded={abierto} onClick={abrir}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="1" /><path d="M3.5 10h17M8 3.5v3M16 3.5v3" /></svg>
        <b>{dmy(valor)}</b>
        <svg className="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {abierto && (
        <div className="dc-panel" role="dialog" aria-label="Elegir el día del cierre">
          <div className="dc-cab">
            <button type="button" onClick={() => ir(-1)} aria-label="Mes anterior">‹</button>
            <b>{MESES_LARGO[mes - 1]} {anio}</b>
            <button type="button" onClick={() => ir(1)} disabled={sigueFuturo} aria-label="Mes siguiente">›</button>
          </div>
          <div className="dc-rej">
            {SEMANA.map((s, i) => <span key={i} className="dc-sem">{s}</span>)}
            {celdas.map((d, i) => {
              if (d === null) return <span key={i} />;
              const f = iso(anio, mes, d);
              const futuro = f > hoy;
              return (
                <button key={i} type="button" disabled={futuro} onClick={() => elegir(f)}
                        className={(f === valor ? "on " : "") + (f === hoy ? "hoy" : "")} aria-pressed={f === valor}>{d}</button>
              );
            })}
          </div>
          <div className="dc-pie">
            <button type="button" onClick={() => elegir(hoy)}>Hoy</button>
            <button type="button" onClick={() => elegir(mover(hoy, -1))}>Ayer</button>
            <button type="button" onClick={() => elegir(mover(hoy, -2))}>Hace 2 días</button>
            <span>{dmy(valor)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
