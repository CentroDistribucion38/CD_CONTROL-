"use client";

/**
 * CALENDARIO DE RANGO — compartido.
 *
 * Vivía dentro de TableroQuiebra. Lo necesita también el tablero diario,
 * y dos copias del mismo calendario se separan sola la primera vez que
 * alguien arregla una en una y no en la otra. Aquí es una sola.
 *
 * Dos meses lado a lado, atajos a la izquierda, y el rango se arma con
 * dos toques: el primero abre, el segundo cierra.
 */

import { useEffect, useRef, useState } from "react";

const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio",
                     "agosto","septiembre","octubre","noviembre","diciembre"];
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DIAS_SEM = ["L","M","M","J","V","S","D"];

/* --------- fechas como texto AAAA-MM-DD: sin líos de zona horaria --------- */
export const aTexto = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const partes = (f: string) => ({
  a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1, d: Number(f.slice(8, 10)),
});
export const bonita = (f: string) => {
  const { a, m, d } = partes(f);
  return `${d} ${MESES[m].toLowerCase()} ${a}`;
};
export const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
/** 0 = lunes, para que la semana empiece como se lee aquí. */
export const primerDia = (a: number, m: number) => (new Date(Date.UTC(a, m, 1)).getUTCDay() + 6) % 7;

/* ==================== Calendario de rango ==================== */
export function Calendario({ desde, hasta, minF, maxF, aplicar }: {
  desde: string; hasta: string; minF: string; maxF: string;
  aplicar: (d: string, h: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ini, setIni] = useState(desde);
  const [fin, setFin] = useState(hasta);
  const [ancla, setAncla] = useState(() => partes(hasta || maxF || minF));
  const caja = useRef<HTMLDivElement>(null);
  useAfuera(caja, () => setAbierto(false));

  useEffect(() => { setIni(desde); setFin(hasta); }, [desde, hasta, abierto]);

  const hoy = maxF; // "hoy" del negocio es el último día con datos
  const atajos: { t: string; d: () => [string, string] }[] = [
    { t: "Todo el histórico", d: () => [minF, maxF] },
    { t: "Este año", d: () => [`${partes(maxF).a}-01-01`, maxF] },
    { t: "Este mes", d: () => {
        const { a, m } = partes(maxF);
        return [aTexto(a, m, 1), maxF];
      } },
    { t: "Mes pasado", d: () => {
        const { a, m } = partes(maxF);
        const am = m === 0 ? a - 1 : a, mm = m === 0 ? 11 : m - 1;
        return [aTexto(am, mm, 1), aTexto(am, mm, diasDelMes(am, mm))];
      } },
    { t: "Últimos 30 días", d: () => {
        const { a, m, d } = partes(maxF);
        const x = new Date(Date.UTC(a, m, d - 29));
        return [aTexto(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()), maxF];
      } },
  ];

  function tocar(f: string) {
    // Primer toque abre un rango nuevo; el segundo lo cierra.
    if (!ini || (ini && fin)) { setIni(f); setFin(""); return; }
    if (f < ini) { setFin(ini); setIni(f); } else setFin(f);
  }

  const listo = ini && fin;

  return (
    <div className="calendario" ref={caja}>
      <button
        type="button"
        className="disparo ancho"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <svg className="ico" viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
          <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
        </svg>
        <span className="txt">{bonita(desde)} — {bonita(hasta)}</span>
        <svg className="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {abierto && (
        <div className="panel" role="dialog" aria-label="Elegir período">
          <div className="cal-cuerpo">
            <div className="atajos">
              {atajos.map((a) => {
                const [d, h] = a.d();
                return (
                  <button
                    key={a.t}
                    type="button"
                    className={ini === d && fin === h ? "on" : ""}
                    onClick={() => { setIni(d); setFin(h); setAncla(partes(h)); }}
                  >
                    {a.t}
                  </button>
                );
              })}
            </div>

            <div className="meses">
              {[0, 1].map((k) => {
                const m = (ancla.m - 1 + k + 12) % 12;
                const a = ancla.a + Math.floor((ancla.m - 1 + k) / 12);
                return (
                  <Mes
                    key={k}
                    anio={a} mes={m}
                    ini={ini} fin={fin} hoy={hoy} minF={minF} maxF={maxF}
                    primero={k === 0} segundo={k === 1}
                    mover={(paso) => {
                      const nm = ancla.m + paso;
                      setAncla({ a: ancla.a + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12, d: 1 });
                    }}
                    tocar={tocar}
                  />
                );
              })}
            </div>
          </div>

          <div className="cal-pie">
            <div className="resumen">
              {listo ? (
                <>Del <b>{bonita(ini)}</b> al <b>{bonita(fin)}</b></>
              ) : (
                <>Elige el día en que termina</>
              )}
            </div>
            <div className="btns">
              <button className="cancelar" onClick={() => setAbierto(false)}>Cancelar</button>
              <button
                className="aplicar"
                disabled={!listo}
                onClick={() => { if (listo) { aplicar(ini, fin); setAbierto(false); } }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Mes({ anio, mes, ini, fin, hoy, minF, maxF, primero, segundo, mover, tocar }: {
  anio: number; mes: number; ini: string; fin: string; hoy: string;
  minF: string; maxF: string; primero: boolean; segundo: boolean;
  mover: (paso: number) => void; tocar: (f: string) => void;
}) {
  const hueco = primerDia(anio, mes);
  const dias = diasDelMes(anio, mes);

  return (
    <div className={"mes" + (segundo ? " segundo" : "")}>
      <div className="mes-cab">
        {primero ? (
          <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)}>
            <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6" /></svg>
          </button>
        ) : <span className="hueco" />}
        <div className="titulo-mes">{MESES_LARGO[mes]} {anio}</div>
        {segundo ? (
          <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)}>
            <svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6" /></svg>
          </button>
        ) : <span className="hueco" />}
      </div>

      <div className="semana">
        {DIAS_SEM.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div className="dias">
        {Array.from({ length: hueco }).map((_, i) => <span key={"h" + i} />)}
        {Array.from({ length: dias }).map((_, i) => {
          const f = aTexto(anio, mes, i + 1);
          const fuera = f < minF || f > maxF;
          const punta = f === ini || (!!fin && f === fin);
          const dentro = !!fin && f > ini && f < fin;
          const clases = [
            fuera ? "fuera" : "",
            punta ? "punta" : "",
            dentro ? "dentro" : "",
            f === ini ? "inicio" : "",
            fin && f === fin ? "fin" : "",
            f === hoy ? "hoy" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={f}
              type="button"
              className={clases}
              disabled={fuera}
              onClick={() => tocar(f)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Cierra un panel cuando se toca por fuera o se aprieta Escape. */
export function useAfuera(ref: React.RefObject<HTMLElement | null>, cerrar: () => void) {
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clic);
      document.removeEventListener("keydown", tecla);
    };
  }, [ref, cerrar]);
}

