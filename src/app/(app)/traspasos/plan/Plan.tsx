"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Seguimiento, TipoViaje } from "@/modulos/traspasos/datos";
import { TURNOS } from "@/modulos/traspasos/formato";

/**
 * EL PLAN DEL TURNO.
 *
 * Se planea por (fecha, turno, tipo): cuántos viajes con carga y
 * cuántos vacíos. Planear dos veces el mismo tipo el mismo turno
 * ACTUALIZA la línea en vez de crear otra — es lo que la persona quería
 * hacer, y dos líneas del mismo tipo es un renglón que después nadie
 * sabe si sumar o escoger.
 *
 * LO CUMPLIDO NO SE TOCA DESDE AQUÍ, y por eso la columna se ve pero no
 * se puede escribir: sale de contar los viajes registrados. Si esta
 * pantalla lo dejara editar, volvería el problema del que salimos.
 *
 * LO ADICIONAL SE MARCA Y NO SE ESCONDE. Un turno que cumplió 10 de 10
 * y metió 6 adicionales no planeó bien, y esa es justamente la cifra
 * que el plan tiene que dejar ver.
 */
export function Plan({ filas, tipos, fecha, puedeEditar }: {
  filas: Seguimiento[];
  tipos: TipoViaje[];
  fecha: string;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [turno, setTurno] = useState(1);
  const [tipo, setTipo] = useState("");
  const [planeado, setPlaneado] = useState("");
  const [vacios, setVacios] = useState("");
  const [adicional, setAdicional] = useState(false);
  const [mandando, setMandando] = useState(false);

  const delTurno = filas.filter((f) => f.turno === turno);

  async function guardar() {
    setMandando(true);
    const { error } = await supabase.rpc("traspaso_planear", {
      p_fecha: fecha, p_turno: turno, p_tipo: tipo,
      p_planeado: Number(planeado) || 0,
      p_vacios: Number(vacios) || 0,
      p_adicional: adicional,
      p_nota: null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const n = tipos.find((t) => t.clave === tipo)?.nombre ?? tipo;
    avisar.bien(`${n}: ${planeado} viajes planeados para el turno ${turno}.`);
    setPlaneado(""); setVacios(""); setAdicional(false);
    router.refresh();
  }

  return (
    <>
      {avisos}

      {puedeEditar && (
        <section className="caja">
          <div className="cab">
            <div>
              <h2>Planear el turno</h2>
              <p>
                Cuántos viajes de cada tipo lleva el turno. Si el tipo ya estaba planeado, se
                actualiza esa línea en vez de crear otra.
              </p>
            </div>
          </div>

          <div style={{ padding: 16 }}>
            <div className="campo">
              <label>Turno</label>
              <div className="opciones">
                {TURNOS.map((t) => (
                  <button key={t} type="button"
                          className={"op" + (turno === t ? " on" : "")}
                          onClick={() => setTurno(t)}>Turno {t}</button>
                ))}
              </div>
            </div>

            <div className="campo">
              <label>Tipo de viaje</label>
              <div className="opciones">
                {tipos.map((t) => (
                  <button key={t.clave} type="button"
                          className={"op" + (tipo === t.clave ? " on" : "")}
                          onClick={() => setTipo(t.clave)}>{t.nombre}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="campo">
                <label htmlFor="tp-pl">Viajes con carga</label>
                <input id="tp-pl" type="number" inputMode="numeric" min={0} value={planeado}
                       onChange={(e) => setPlaneado(e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="tp-va">Viajes vacíos</label>
                <input id="tp-va" type="number" inputMode="numeric" min={0} value={vacios}
                       onChange={(e) => setVacios(e.target.value)} />
              </div>
            </div>

            <label style={{ display: "flex", gap: 9, alignItems: "center",
                            cursor: "pointer", marginBottom: 13 }}>
              <input type="checkbox" checked={adicional} style={{ width: 18, height: 18, minHeight: 0 }}
                     onChange={(e) => setAdicional(e.target.checked)} />
              <span style={{ fontSize: 12.5 }}>
                Adicional — entró después de cerrada la planeación del turno. Se marca y no se
                esconde: un turno que cumple todo lo planeado y mete seis adicionales no planeó
                bien, y eso hay que poderlo ver.
              </span>
            </label>

            <button type="button" className="btn si" style={{ width: "100%", minHeight: 50 }}
                    disabled={!tipo || planeado.trim() === "" || mandando}
                    onClick={guardar}>
              {mandando ? "Guardando…"
                : !tipo ? "Escoge el tipo de viaje"
                : planeado.trim() === "" ? "Di cuántos viajes"
                : `Planear para el turno ${turno}`}
            </button>
          </div>
        </section>
      )}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>Plan del turno {turno}</h2>
            <p>
              Lo cumplido no se escribe aquí: lo cuenta la base sobre los viajes registrados.
            </p>
          </div>
        </div>

        {delTurno.length === 0 ? (
          <div className="vacio">
            <b>El turno {turno} no tiene nada planeado</b>
            Se puede registrar viajes igual — aparecerían como «sin planear» en el seguimiento.
          </div>
        ) : (
          <div className="tabla-envuelta">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th className="n">Planeado</th>
                  <th className="n">Cumplido</th>
                  <th className="n">Faltan</th>
                  <th className="n">Vacíos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {delTurno.map((f) => (
                  <tr key={f.tipo} className={f.sin_planear ? "sin-plan" : undefined}>
                    <td className="tipo">
                      {f.tipo_nombre}
                      {f.es_adicional && <> <span className="eti">ADICIONAL</span></>}
                      {f.sin_planear && <> <span className="eti ojo">SIN PLANEAR</span></>}
                    </td>
                    <td className="n">{f.planeado}</td>
                    <td className="n">
                      {f.cumplido}
                      {f.de_mas > 0 && <span className="eti" style={{ marginLeft: 6 }}>+{f.de_mas}</span>}
                    </td>
                    <td className="n">{f.faltan > 0 ? f.faltan : "—"}</td>
                    <td className="n">
                      {f.vacios_hechos}
                      {f.vacios_planeados > 0 && <span style={{ opacity: .6 }}> / {f.vacios_planeados}</span>}
                    </td>
                    <td className="n">
                      {f.pct != null && (
                        <span className="barra" aria-label={`${f.pct}%`}>
                          <i className={f.pct < 100 ? undefined : undefined}
                             style={{ width: `${Math.min(100, f.pct)}%` }} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
