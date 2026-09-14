"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Punto, TipoViaje } from "@/modulos/traspasos/datos";
import { TURNOS } from "@/modulos/traspasos/formato";

/**
 * REGISTRAR UN VIAJE.
 *
 * Es la pantalla del supervisor, de pie al lado del vehículo, con el
 * celular en una mano. Por eso los turnos y los tipos son botones
 * grandes y no listas desplegables: una lista de nueve tipos en un
 * celular son dos toques y una mirada; nueve botones es uno.
 *
 * NO PIDE EL "CUMPLIDO" POR NINGÚN LADO, y eso es el punto del módulo.
 * Registrar este viaje ES el cumplimiento: el plan se actualiza solo.
 * La versión anterior tenía las dos cosas —viajes por un lado, un
 * número escrito a mano por el otro— y cuando no coincidían nadie sabía
 * cuál creer.
 *
 * LA PLACA VA PRIMERO porque es lo que la persona está mirando. El
 * resto se puede reconstruir de memoria; la placa no.
 */
export function Registrar({ tipos, puntos, fecha, turnoSugerido }: {
  tipos: TipoViaje[];
  puntos: Punto[];
  fecha: string;
  /** El turno que va según la hora. Se propone, no se impone: quien
   *  registra a las 6:05 casi siempre está cerrando el turno anterior. */
  turnoSugerido: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [turno, setTurno] = useState(turnoSugerido);
  const [tipo, setTipo] = useState("");
  const [placa, setPlaca] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("");
  const [vacio, setVacio] = useState(false);
  const [nota, setNota] = useState("");
  const [mandando, setMandando] = useState(false);

  /* El maestro puede estar vacío la primera semana. Si lo está, los
     puntos se escriben y quedan marcados: obligar a llenar el maestro
     antes de poder registrar el primer viaje sería trabar el trabajo
     para tener la lista bonita. */
  const hayMaestro = puntos.length > 0;

  const puedeMandar = !!tipo && placa.trim() !== ""
    && origen.trim() !== "" && destino.trim() !== ""
    && (vacio || cantidad.trim() !== "");

  async function mandar() {
    setMandando(true);
    const { error } = await supabase.rpc("traspaso_registrar", {
      p_fecha: fecha,
      p_turno: turno,
      p_tipo: tipo,
      p_placa: placa,
      p_origen: origen,
      p_destino: destino,
      p_cantidad: vacio ? 0 : Number(cantidad) || 0,
      p_vacio: vacio,
      p_unidad: unidad.trim() || null,
      p_nota: nota.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }

    avisar.bien(
      vacio
        ? `Viaje vacío de ${placa.toUpperCase()} registrado.`
        : `Viaje de ${placa.toUpperCase()} registrado. El plan del turno ya lo cuenta.`);

    /* SE LIMPIA LO DEL VIAJE Y SE DEJA LO DEL TURNO. Quien registra
       viajes registra varios seguidos del mismo tipo y la misma ruta:
       volver a escoger las cuatro cosas cada vez es lo que hace que se
       dejen de registrar a media tarde. */
    setPlaca(""); setCantidad(""); setNota(""); setVacio(false);
    router.refresh();
  }

  return (
    <section className="caja">
      {avisos}
      <div className="cab">
        <div>
          <h2>Registrar un viaje</h2>
          <p>
            Cada viaje que sale. No hay que escribir cuántos se cumplieron: el plan del turno
            los cuenta solo a medida que se registran.
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
                      onClick={() => setTurno(t)}>
                Turno {t}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <label htmlFor="tp-placa">Placa del vehículo</label>
          <input id="tp-placa" value={placa} autoComplete="off"
                 placeholder="ABC123"
                 style={{ textTransform: "uppercase", fontWeight: 800, letterSpacing: ".05em" }}
                 onChange={(e) => setPlaca(e.target.value)} />
          {/* Se dice ANTES, no después de rechazarlo: quien escribe con
              guion no está haciendo nada malo. */}
          <p className="guia" style={{ marginTop: 6 }}>
            Da igual con guion o sin guion: se guarda siempre igual para que el informe por
            placa no parta el mismo vehículo en tres.
          </p>
        </div>

        <div className="campo">
          <label>Tipo de viaje</label>
          <div className="opciones">
            {tipos.map((t) => (
              <button key={t.clave} type="button"
                      className={"op" + (tipo === t.clave ? " on" : "")}
                      onClick={() => setTipo(t.clave)}>
                {t.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <label htmlFor="tp-origen">De dónde sale</label>
          <input id="tp-origen" list="tp-puntos" value={origen} autoComplete="off"
                 placeholder={hayMaestro ? "Escoge o escribe" : "Escribe el sitio"}
                 onChange={(e) => setOrigen(e.target.value)} />
        </div>

        <div className="campo">
          <label htmlFor="tp-destino">A dónde va</label>
          <input id="tp-destino" list="tp-puntos" value={destino} autoComplete="off"
                 placeholder={hayMaestro ? "Escoge o escribe" : "Escribe el sitio"}
                 onChange={(e) => setDestino(e.target.value)} />
        </div>

        <datalist id="tp-puntos">
          {puntos.map((p) => <option key={p.clave} value={p.nombre} />)}
        </datalist>

        {!hayMaestro && (
          <div className="aviso" style={{ marginBottom: 13 }}>
            El maestro de puntos está vacío. Se puede registrar igual escribiendo el sitio: lo
            escrito queda marcado y aparece en <b>Maestro</b> para agregarlo de una. La primera
            semana arma sola la lista de los puntos que de verdad se usan.
          </div>
        )}

        <div className="campo">
          <label>¿Qué movió?</label>
          <div className="opciones" style={{ marginBottom: 10 }}>
            <button type="button" className={"op" + (!vacio ? " on" : "")}
                    onClick={() => setVacio(false)}>Movió carga</button>
            <button type="button" className={"op" + (vacio ? " on" : "")}
                    onClick={() => { setVacio(true); setCantidad(""); }}>Va vacío</button>
          </div>

          {vacio ? (
            <p className="guia">
              Los viajes vacíos se cuentan aparte y <b>no entran en el cumplido</b>: cuestan lo
              mismo —el vehículo, el conductor, el tiempo— pero no mueven producto. Meterlos en
              el cumplido haría ver cumplido un turno que movió aire.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input type="number" inputMode="numeric" min={0} value={cantidad}
                     placeholder="Cuánto" aria-label="Cantidad"
                     onChange={(e) => setCantidad(e.target.value)} />
              <input value={unidad} placeholder="Canastas, estibas…" aria-label="Unidad"
                     autoComplete="off" onChange={(e) => setUnidad(e.target.value)} />
            </div>
          )}
        </div>

        <div className="campo">
          <label htmlFor="tp-nota">Novedad (opcional)</label>
          <textarea id="tp-nota" value={nota} placeholder="Solo si pasó algo que haya que contar"
                    onChange={(e) => setNota(e.target.value)} />
        </div>

        <button type="button" className="btn si" style={{ width: "100%", minHeight: 52 }}
                disabled={!puedeMandar || mandando} onClick={mandar}>
          {mandando ? "Registrando…"
            : !tipo ? "Escoge el tipo de viaje"
            : !placa.trim() ? "Falta la placa"
            : !origen.trim() || !destino.trim() ? "Falta la ruta"
            : !vacio && !cantidad.trim() ? "Di cuánto movió, o márcalo vacío"
            : "Registrar el viaje"}
        </button>
      </div>
    </section>
  );
}
