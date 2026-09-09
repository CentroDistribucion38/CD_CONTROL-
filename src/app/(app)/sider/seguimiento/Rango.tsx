"use client";

/**
 * EL RANGO DE FECHAS — un día, del 3 al 17, un mes, un año.
 * ------------------------------------------------------------------
 * Era un <select> de meses porque el ZLDE se guardaba resumido por mes:
 * el mes era el único corte que la base podía contestar. Ahora se guarda
 * por día, así que el corte lo elige quien mira.
 *
 * TRES MODOS Y NO UNO. Días, meses y años son tres preguntas distintas
 * —"qué pasó el martes", "cómo cerró agosto", "cómo va el año"— y meter
 * las tres en una rejilla de días obliga a hacer treinta y un clics para
 * pedir un mes. Cada modo se pide como se piensa.
 *
 * LOS DÍAS SIN DATOS VAN APAGADOS, no escondidos. Un calendario que
 * deja tocar cualquier día y después contesta "no hay nada" obliga a
 * buscar a ciegas; uno que los apaga contesta la pregunta antes de que
 * se haga. La lista de días con datos viene de la base (v_sider_dias),
 * no de un rango inventado.
 *
 * NADA SE APLICA HASTA QUE SE TOCA APLICAR. Elegir un rango son dos
 * clics, y navegar en el primero recargaría la pantalla a medio camino
 * —con desde = hasta— y volvería a cargarla al segundo clic. El borrador
 * vive aquí adentro y sale una sola vez.
 *
 * Sigue el patrón del calendario de Quiebra: panel colgado con su filo
 * de color arriba, atajos a la izquierda, cabecera con flechas, y el pie
 * con lo elegido y los dos botones.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { MESES_LARGO, mesCompleto, nombreRango } from "@/modulos/sider/comun";

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun",
                     "jul", "ago", "sep", "oct", "nov", "dic"];
/* La semana arranca en lunes: es la semana de la operación. */
const DIAS_CORTO = ["L", "M", "M", "J", "V", "S", "D"];

type Modo = "dias" | "meses" | "anios";
export type Dia = { fecha: string; hl_zlde: number; viajes: number };

const dosDig = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dosDig(m)}-${dosDig(d)}`;
/** Cuántos días tiene ese mes. El truco del día 0 del siguiente. */
const ultimoDia = (a: number, m: number) => new Date(a, m, 0).getDate();
/** Lunes = 0. getDay() da domingo = 0, y aquí la semana empieza el lunes. */
const finDeSemana = (a: number, m: number, d: number) => {
  const s = new Date(a, m - 1, d).getDay();
  return s === 0 || s === 6;
};
const columnaDe = (a: number, m: number, d: number) => (new Date(a, m - 1, d).getDay() + 6) % 7;

export function Rango({ desde, hasta, dias, alElegir }: {
  desde: string;
  hasta: string;
  /** Los días que tienen algo, para apagar los vacíos. */
  dias: Dia[];
  alElegir: (desde: string, hasta: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<Modo>("dias");
  /* El borrador. Al abrir, arranca en lo que está aplicado. */
  const [bDesde, setBDesde] = useState(desde);
  const [bHasta, setBHasta] = useState(hasta);
  /* Si el siguiente clic cierra el rango o empieza uno nuevo. */
  const [cerrando, setCerrando] = useState(false);
  const [anioVista, setAnioVista] = useState(Number(desde.slice(0, 4)));
  const [mesVista, setMesVista] = useState(Number(desde.slice(5, 7)));
  const caja = useRef<HTMLDivElement>(null);

  const conDatos = useMemo(() => new Set(dias.map((d) => d.fecha)), [dias]);
  /* Los meses y los años que tienen algo: son los que se pueden tocar en
     los otros dos modos. */
  const mesesConDatos = useMemo(
    () => new Set(dias.map((d) => d.fecha.slice(0, 7))), [dias]);
  const aniosConDatos = useMemo(
    () => [...new Set(dias.map((d) => d.fecha.slice(0, 4)))].sort(), [dias]);

  /* El día con datos más viejo y el más nuevo: las flechas no salen de
     ahí y los atajos se recortan a eso. */
  const limites = useMemo(() => {
    const f = dias.map((d) => d.fecha).sort();
    return f.length ? { min: f[0], max: f[f.length - 1] } : null;
  }, [dias]);

  /* Al abrir, el borrador vuelve a lo aplicado: si alguien dejó a medias
     un rango y cerró, no debe encontrárselo al volver. */
  function abrir() {
    setBDesde(desde); setBHasta(hasta); setCerrando(false);
    setAnioVista(Number(desde.slice(0, 4)));
    setMesVista(Number(desde.slice(5, 7)));
    setAbierto(true);
  }

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  /* ---------- Elegir ---------- */
  function tocarDia(f: string) {
    if (!cerrando) { setBDesde(f); setBHasta(f); setCerrando(true); return; }
    /* Segundo clic: cierra el rango, en el orden que sea. */
    if (f < bDesde) { setBHasta(bDesde); setBDesde(f) } else { setBHasta(f) }
    setCerrando(false);
  }
  function tocarMes(aaaamm: string) {
    const m = mesCompleto(aaaamm);
    if (!cerrando) { setBDesde(m.desde); setBHasta(m.hasta); setCerrando(true); return; }
    /* Un rango de meses va del primer día del más viejo al último del
       más nuevo: pedir "de marzo a agosto" y recibir hasta el 1 de
       agosto sería recibir otra cosa. */
    if (m.desde < bDesde) { setBHasta(mesCompleto(bDesde.slice(0, 7)).hasta); setBDesde(m.desde) }
    else { setBHasta(m.hasta) }
    setCerrando(false);
  }
  function tocarAnio(a: string) {
    setBDesde(`${a}-01-01`); setBHasta(`${a}-12-31`); setCerrando(false);
  }

  const aplicar = () => { setAbierto(false); alElegir(bDesde, bHasta) };

  /* ---------- Los atajos ---------- */
  const hoy = new Date();
  const atajos: { t: string; d: string; h: string }[] = [];
  {
    const a = hoy.getFullYear(), m = hoy.getMonth() + 1;
    const esteMes = mesCompleto(`${a}-${dosDig(m)}`);
    const ant = m === 1 ? { a: a - 1, m: 12 } : { a, m: m - 1 };
    const mesPasado = mesCompleto(`${ant.a}-${dosDig(ant.m)}`);
    atajos.push({ t: "Hoy", d: iso(a, m, hoy.getDate()), h: iso(a, m, hoy.getDate()) });
    atajos.push({ t: "Este mes", d: esteMes.desde, h: esteMes.hasta });
    atajos.push({ t: "Mes pasado", d: mesPasado.desde, h: mesPasado.hasta });
    atajos.push({ t: "Este año", d: `${a}-01-01`, h: `${a}-12-31` });
    if (limites) atajos.push({ t: "Todo lo cargado", d: limites.min, h: limites.max });
  }

  /* ---------- La rejilla de días del mes que se está viendo ---------- */
  const rejilla = useMemo(() => {
    const total = ultimoDia(anioVista, mesVista);
    const huecos = columnaDe(anioVista, mesVista, 1);
    const celdas: (number | null)[] = Array(huecos).fill(null);
    for (let d = 1; d <= total; d++) celdas.push(d);
    while (celdas.length % 7) celdas.push(null);
    return celdas;
  }, [anioVista, mesVista]);

  const mesActual = `${anioVista}-${dosDig(mesVista)}`;
  const puedeMesAntes = !limites || mesActual > limites.min.slice(0, 7);
  const puedeMesDespues = !limites || mesActual < limites.max.slice(0, 7);
  const puedeAnioAntes = !limites || anioVista > Number(limites.min.slice(0, 4));
  const puedeAnioDespues = !limites || anioVista < Number(limites.max.slice(0, 4));

  function moverMes(paso: number) {
    let m = mesVista + paso, a = anioVista;
    if (m < 1) { m = 12; a-- } else if (m > 12) { m = 1; a++ }
    setMesVista(m); setAnioVista(a);
  }

  const cambio = bDesde !== desde || bHasta !== hasta;

  return (
    <div className="sel sg-mes" ref={caja}>
      <span>Periodo</span>
      <button
        type="button"
        className={"mes-campo" + (abierto ? " abierta" : "")}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-haspopup="dialog"
        aria-expanded={abierto}
      >
        <span>{nombreRango(desde, hasta)}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
        </svg>
      </button>

      {abierto && (
        <div className="mes-panel" role="dialog" aria-label="Elegir el periodo">
          <div className="mes-modos" role="tablist" aria-label="Cómo elegir">
            {([["dias", "Días"], ["meses", "Meses"], ["anios", "Años"]] as [Modo, string][])
              .map(([id, t]) => (
                <button key={id} type="button" role="tab" aria-selected={modo === id}
                        className={modo === id ? "act" : ""}
                        onClick={() => { setModo(id); setCerrando(false) }}>
                  {t}
                </button>
              ))}
          </div>

          <div className="mes-cuerpo">
            <div className="mes-atajos">
              {atajos.map((a) => (
                <button key={a.t} type="button"
                        className={bDesde === a.d && bHasta === a.h ? "on" : ""}
                        onClick={() => { setBDesde(a.d); setBHasta(a.h); setCerrando(false) }}>
                  {a.t}
                </button>
              ))}
            </div>

            <div className="mes-lado">
              {modo === "dias" && (
                <>
                  <div className="mes-anio">
                    <button type="button" onClick={() => moverMes(-1)}
                            disabled={!puedeMesAntes} aria-label="Mes anterior">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg>
                    </button>
                    <b>{MESES_LARGO[mesVista - 1]} {anioVista}</b>
                    <button type="button" onClick={() => moverMes(1)}
                            disabled={!puedeMesDespues} aria-label="Mes siguiente">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg>
                    </button>
                  </div>
                  <div className="mes-semana" aria-hidden="true">
                    {DIAS_CORTO.map((d, i) => <span key={i}>{d}</span>)}
                  </div>
                  <div className="mes-dias">
                    {rejilla.map((d, i) => {
                      if (d == null) return <span key={"h" + i} />;
                      const f = iso(anioVista, mesVista, d);
                      const tiene = conDatos.has(f);
                      const dentro = f > bDesde && f < bHasta;
                      const punta = f === bDesde || f === bHasta;
                      return (
                        <button
                          key={f}
                          type="button"
                          disabled={!tiene}
                          onClick={() => tocarDia(f)}
                          aria-label={`${d} de ${MESES_LARGO[mesVista - 1]}${tiene ? "" : " — sin datos"}`}
                          className={
                            (punta ? "punta " : dentro ? "dentro " : "") +
                            (tiene ? "" : "mes-nada ") +
                            (finDeSemana(anioVista, mesVista, d) ? "finde" : "")
                          }
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {modo === "meses" && (
                <>
                  <div className="mes-anio">
                    <button type="button" onClick={() => setAnioVista((a) => a - 1)}
                            disabled={!puedeAnioAntes} aria-label="Año anterior">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg>
                    </button>
                    <b>{anioVista}</b>
                    <button type="button" onClick={() => setAnioVista((a) => a + 1)}
                            disabled={!puedeAnioDespues} aria-label="Año siguiente">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg>
                    </button>
                  </div>
                  <div className="mes-doce">
                    {MESES_CORTO.map((corto, i) => {
                      const clave = `${anioVista}-${dosDig(i + 1)}`;
                      const tiene = mesesConDatos.has(clave);
                      const m = mesCompleto(clave);
                      const punta = m.desde === bDesde || m.hasta === bHasta;
                      const dentro = m.desde > bDesde && m.hasta < bHasta;
                      return (
                        <button key={clave} type="button" disabled={!tiene}
                                onClick={() => tocarMes(clave)}
                                className={(punta ? "punta " : dentro ? "dentro " : "") + (tiene ? "" : "mes-nada")}
                                aria-label={`${MESES_LARGO[i]} ${anioVista}${tiene ? "" : " — sin datos"}`}>
                          {corto}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {modo === "anios" && (
                <div className="mes-anios">
                  {aniosConDatos.length === 0 && <p className="mes-pie">No hay nada cargado todavía.</p>}
                  {aniosConDatos.map((a) => (
                    <button key={a} type="button"
                            className={bDesde === `${a}-01-01` && bHasta === `${a}-12-31` ? "punta" : ""}
                            onClick={() => tocarAnio(a)}>
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mes-pie-cal">
            <span className="dice">
              {cerrando
                ? <>Toca el <b>otro extremo</b>, o aplica para ver solo {modo === "meses" ? "ese mes" : "ese día"}.</>
                : <>Vas a ver <b>{nombreRango(bDesde, bHasta)}</b></>}
            </span>
            <span className="btns">
              <button type="button" className="cancelar" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
              <button type="button" className="aplicar" onClick={aplicar} disabled={!cambio}>
                Aplicar
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
