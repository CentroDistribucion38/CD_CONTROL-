"use client";

import { useMemo, useState } from "react";
import { Repetir } from "./Repetir";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Control, PlanLinea, TipoViaje } from "@/modulos/traspasos/datos";
import { TURNOS, HORARIO } from "@/modulos/traspasos/formato";

type Rejilla = Record<string, number>;      // "A|pet" → 6
type Vacios  = Record<string, number>;      // "A"     → 2

const k = (turno: string, tipo: string) => `${turno}|${tipo}`;

/**
 * EL PLAN DEL DÍA, EN UNA SOLA REJILLA.
 *
 * Nueve tipos por tres turnos son veintisiete decisiones. Tomadas de a
 * una en un formulario —escoge turno, escoge tipo, escribe el número,
 * guarda, y otra vez— son veintisiete formularios: nadie planea el día
 * así dos veces. En una rejilla se ven todas, se comparan entre turnos
 * de un vistazo, y se guardan de una.
 *
 * SE ARMA COMO BORRADOR Y DESPUÉS SE PUBLICA. Mientras se arma, el
 * turno sigue viendo el plan que estaba vigente: sin eso, los
 * supervisores verían un plan a medias y el porcentaje de cumplimiento
 * daría saltos sin sentido durante los diez minutos que toma armarlo.
 *
 * LO CUMPLIDO NO SE TOCA DESDE AQUÍ —sale de contar los viajes—, pero
 * SÍ SE VE: debajo de la celda, en verde, cuántos van hechos. Planear
 * el turno B sin saber que el A ya lleva cuatro es planear a ciegas.
 */
export function Plan({ tipos, publicadas, borrador, vaciosGuardados, control,
                       promedio, ayer, fecha, hoy, esHoy, puedeEditar }: {
  tipos: TipoViaje[];
  publicadas: PlanLinea[];
  borrador: PlanLinea[];
  vaciosGuardados: { turno: string; vacios: number }[];
  /** Para enseñar cuántos van hechos por celda. */
  control: Control[];
  /** Promedio de lo que de verdad salió los últimos 4 días iguales. */
  promedio: { turno: string; tipo: string; promedio: number; dias: number }[];
  /** El plan publicado de ayer, para copiarlo. */
  ayer: PlanLinea[];
  fecha: string;
  hoy: string;
  esHoy: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [mandando, setMandando] = useState(false);

  /* La rejilla arranca en el borrador si lo hay, y si no en lo
     publicado: quien vuelve a la pantalla tiene que encontrar lo que
     dejó a medias, no una rejilla en blanco. */
  const inicial = useMemo(() => {
    const base = borrador.length ? borrador : publicadas;
    const r: Rejilla = {};
    for (const l of base) r[k(l.turno, l.tipo)] = l.planeado;
    return r;
  }, [borrador, publicadas]);

  const inicialVac = useMemo(() => {
    const v: Vacios = {};
    for (const x of vaciosGuardados) v[x.turno] = x.vacios;
    return v;
  }, [vaciosGuardados]);

  const [rejilla, setRejilla] = useState<Rejilla>(inicial);
  const [vacios, setVacios] = useState<Vacios>(inicialVac);

  /* CUÁNTOS CAMBIOS HAY SIN PUBLICAR. Se compara contra lo PUBLICADO y
     no contra el borrador: lo que la persona necesita saber es en qué
     se diferencia lo que está armando de lo que el turno está viendo. */
  const publicado = useMemo(() => {
    const r: Rejilla = {};
    for (const l of publicadas) r[k(l.turno, l.tipo)] = l.planeado;
    return r;
  }, [publicadas]);

  const cambios = useMemo(() => {
    const claves = new Set([...Object.keys(rejilla), ...Object.keys(publicado)]);
    let n = 0;
    for (const c of claves) if ((rejilla[c] ?? 0) !== (publicado[c] ?? 0)) n++;
    return n;
  }, [rejilla, publicado]);

  const hecho = useMemo(() => {
    const r: Rejilla = {};
    for (const c of control) r[k(c.turno, c.tipo)] = c.cumplido;
    return r;
  }, [control]);

  const val = (t: string, tipo: string) => rejilla[k(t, tipo)] ?? 0;
  const poner = (t: string, tipo: string, n: number) =>
    setRejilla((r) => ({ ...r, [k(t, tipo)]: Math.max(0, n) }));

  const totTurno = (t: string) => tipos.reduce((a, x) => a + val(t, x.clave), 0);
  const totTipo = (tipo: string) => TURNOS.reduce((a, t) => a + val(t, tipo), 0);
  const totalConCarga = tipos.reduce((a, x) => a + totTipo(x.clave), 0);
  const totalVacios = TURNOS.reduce((a, t) => a + (vacios[t] ?? 0), 0);

  const lineas = () => {
    const l: { turno: string; tipo: string; planeado: number }[] = [];
    for (const t of TURNOS) for (const x of tipos) {
      const n = val(t, x.clave);
      if (n > 0) l.push({ turno: t, tipo: x.clave, planeado: n });
    }
    return l;
  };

  async function guardar(publicar: boolean) {
    setMandando(true);
    const { error } = await supabase.rpc("traspaso_guardar_plan", {
      p_fecha: fecha,
      p_lineas: lineas(),
      p_vacios: TURNOS.map((t) => ({ turno: t, vacios: vacios[t] ?? 0 })),
    });
    if (error) { setMandando(false); avisar.mal(error.message); return }

    if (publicar) {
      const { error: e2 } = await supabase.rpc("traspaso_publicar_plan", { p_fecha: fecha });
      if (e2) { setMandando(false); avisar.mal(e2.message); return }
      avisar.bien(`Plan publicado: ${totalConCarga} viajes con carga y ${totalVacios} vacíos.`);
    } else {
      avisar.bien("Borrador guardado. El turno sigue viendo el plan anterior hasta que publiques.");
    }
    setMandando(false);
    router.refresh();
  }

  /* ATAJOS. Casi todos los días se parecen: empezar de cero una rejilla
     de veintisiete celdas es lo que hace que nadie planee. */
  function copiarAyer() {
    const r: Rejilla = {};
    for (const l of ayer) r[k(l.turno, l.tipo)] = l.planeado;
    setRejilla(r);
    avisar.bien(`Copiado el plan de ayer: ${ayer.reduce((a, l) => a + l.planeado, 0)} viajes.`);
  }

  function usarPromedio() {
    const r: Rejilla = {};
    for (const p of promedio) if (p.promedio > 0) r[k(p.turno, p.tipo)] = p.promedio;
    setRejilla(r);
    avisar.bien("Puesto el promedio de lo que DE VERDAD salió los últimos días iguales.");
  }

  const totalAyer = ayer.reduce((a, l) => a + l.planeado, 0);
  const totalProm = promedio.reduce((a, p) => a + p.promedio, 0);

  /* La referencia de la derecha: por tipo, el promedio real contra lo
     que se está planeando ahora. */
  const referencia = tipos.map((x) => {
    const prom = promedio.filter((p) => p.tipo === x.clave)
      .reduce((a, p) => a + p.promedio, 0);
    return { tipo: x, prom, plan: totTipo(x.clave), dif: totTipo(x.clave) - prom };
  }).filter((r) => r.prom > 0 || r.plan > 0).slice(0, 6);

  return (
    <>
      {avisos}

      <div className="plan-marco">
        <div>
          <section className="matriz">
            <div className="tabla-envuelta">
              <table>
                <thead>
                  <tr>
                    <th>Tipo de viaje</th>
                    {TURNOS.map((t) => (
                      <th key={t} className="cen">
                        Turno {t}
                        <span className="hor">{HORARIO[t]}</span>
                      </th>
                    ))}
                    <th className="cen dia">Día</th>
                  </tr>
                </thead>
                <tbody>
                  {tipos.map((x) => (
                    <tr key={x.clave}>
                      <td className="tipo">{x.nombre}</td>
                      {TURNOS.map((t) => (
                        <td key={t} className="cen">
                          <Celda n={val(t, x.clave)} puedeEditar={puedeEditar}
                                 onCambio={(n) => poner(t, x.clave, n)} />
                          {/* Lo hecho, debajo y en verde. Planear el
                              turno B sin saber que el A ya lleva cuatro
                              es planear a ciegas. */}
                          {esHoy && (hecho[k(t, x.clave)] ?? 0) > 0 && (
                            <span className="hecho">{hecho[k(t, x.clave)]} hechos</span>
                          )}
                        </td>
                      ))}
                      <td className="cen tot">{totTipo(x.clave) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total">
                    <td>TOTAL CON CARGA</td>
                    {TURNOS.map((t) => <td key={t} className="cen">{totTurno(t)}</td>)}
                    <td className="cen dia">{totalConCarga}</td>
                  </tr>

                  {/* LOS VACÍOS VAN DEBAJO DEL TOTAL Y EN LA MISMA TABLA.
                      No son una fila más de la rejilla —no llevan tipo,
                      porque un viaje sin carga no mueve un material— pero
                      sí tienen que caer bajo la columna de su turno: en
                      una tabla aparte los números quedaban corridos
                      respecto de los de arriba, y dos cifras del mismo
                      turno que no están alineadas se leen mal. */}
                  <tr className="vacios">
                    <td>
                      Viajes vacíos
                      <span>cuestan igual y no mueven producto</span>
                    </td>
                    {TURNOS.map((t) => (
                      <td className="cen" key={t}>
                        <Celda n={vacios[t] ?? 0} puedeEditar={puedeEditar}
                               onCambio={(n) => setVacios((v) => ({ ...v, [t]: Math.max(0, n) }))} />
                      </td>
                    ))}
                    <td className="cen tot">{totalVacios || "—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {puedeEditar && (
              <div className="pie-publicar">
                <button type="button" className="btn si" disabled={mandando}
                        onClick={() => guardar(true)}>
                  {mandando ? "Guardando…" : "Publicar plan del día"}
                </button>
                <button type="button" className="btn" disabled={mandando}
                        onClick={() => guardar(false)}>
                  Guardar borrador
                </button>

                {/* Va junto a Publicar y no arriba con los atajos: es la
                    ÚLTIMA decisión —ya miraste la rejilla y te cuadra—,
                    no una forma de empezarla. */}
                <Repetir fecha={fecha} hoy={hoy} lineas={lineas}
                         vacios={() => TURNOS.map((t) => ({ turno: t, vacios: vacios[t] ?? 0 }))}
                         totalViajes={totalConCarga} avisar={avisar} />
                <span className="aviso-cambios">
                  {cambios === 0
                    ? "Sin cambios sobre lo publicado"
                    : <><b>{cambios} {cambios === 1 ? "cambio" : "cambios"}</b> sin publicar</>}
                  {esHoy && totalHechos(hecho) > 0 &&
                    ` · ya hay ${totalHechos(hecho)} viajes hechos sobre este plan`}
                </span>
              </div>
            )}
          </section>
        </div>

        <aside className="lado-plan">
          <div className="resumen-dia">
            <div className="corte" aria-hidden />
            <div className="rot">CARGA DEL DÍA</div>
            <div className="gran">{totalConCarga + totalVacios}</div>
            <div className="sub">{totalConCarga} con carga · {totalVacios} vacíos</div>
            <div className="barras-turno">
              {TURNOS.map((t) => {
                const n = totTurno(t) + (vacios[t] ?? 0);
                const tope = Math.max(1, ...TURNOS.map((o) => totTurno(o) + (vacios[o] ?? 0)));
                return (
                  <div className="bt" key={t}>
                    <span>Turno {t}</span>
                    <span className="pista"><i style={{ width: `${(n / tope) * 100}%` }} /></span>
                    <span className="v">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {puedeEditar && (
            <div className="atajos-plan">
              <h3>Armar más rápido</h3>
              <p>Casi todos los días se parecen. No empieces de cero.</p>
              <div className="fila-a">
                <button type="button" disabled={!totalAyer} onClick={copiarAyer}>
                  Copiar el plan de ayer <span>{totalAyer || "—"}</span>
                </button>
                <button type="button" disabled={!totalProm} onClick={usarPromedio}>
                  Promedio del mismo día <span>{totalProm || "—"}</span>
                </button>
                <button type="button" onClick={() => { setRejilla({}); setVacios({}); }}>
                  Vaciar la rejilla <span>0</span>
                </button>
              </div>
            </div>
          )}

          {referencia.length > 0 && (
            <div className="referencia">
              <h3>Contra los últimos días iguales</h3>
              <p>
                Promedio de lo que de verdad salió, no de lo que se planeó: copiar cuatro veces
                un plan que estuvo mal es como un error se vuelve costumbre.
              </p>
              {referencia.map((r) => (
                <div className="ref-fila" key={r.tipo.clave}>
                  <span>{r.tipo.nombre}</span>
                  <span className="prom">prom. {r.prom}</span>
                  <span className={"dif " + (r.dif > 0 ? "mas" : r.dif < 0 ? "menos" : "")}>
                    {r.dif > 0 ? `+${r.dif}` : r.dif < 0 ? r.dif : "="}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function totalHechos(h: Rejilla) {
  return Object.values(h).reduce((a, n) => a + n, 0);
}

/** La celda de la rejilla. Con guantes, dos botones grandes ganan a
 *  teclear; con teclado, escribir gana. Por eso tiene las dos cosas. */
function Celda({ n, puedeEditar, onCambio }: {
  n: number; puedeEditar: boolean; onCambio: (n: number) => void;
}) {
  if (!puedeEditar) return <span className="solo-ver">{n || "—"}</span>;
  return (
    <span className={"cel-step" + (n === 0 ? " vacia" : "")}>
      <button type="button" onClick={() => onCambio(n - 1)} aria-label="uno menos">−</button>
      <input value={n} inputMode="numeric" aria-label="viajes planeados"
             onChange={(e) => onCambio(Number(e.target.value.replace(/\D/g, "")) || 0)} />
      <button type="button" onClick={() => onCambio(n + 1)} aria-label="uno más">+</button>
    </span>
  );
}
