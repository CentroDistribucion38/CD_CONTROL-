"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { PlacaM, Punto, TipoViaje, Viaje } from "@/modulos/traspasos/datos";
import { TURNOS } from "@/modulos/traspasos/formato";
import { Desplegable, FilaViaje, type Opcion } from "./comunes";

/**
 * LOS VIAJES DEL DÍA, lo último arriba.
 *
 * ANULAR PIDE MOTIVO Y NO BORRA. El script anterior borraba la fila de
 * la hoja: un viaje que existió y desapareció deja el plan cuadrando
 * por arte de magia y sin nadie a quien preguntarle. Aquí el viaje
 * sigue, marcado, con quién lo anuló y por qué — y deja de contar para
 * el cumplido en el mismo segundo.
 *
 * CORREGIR ES OTRA COSA, Y ES SOLO DEL ADMINISTRADOR. Anular dice "esto
 * no pasó"; corregir reescribe lo que pasó, y eso pesa más. Por una
 * placa con un dígito cambiado, anular y volver a teclear los ocho
 * campos es tanto trabajo que nadie lo hace y el dato malo se queda: de
 * ahí que exista este formulario. Cada corrección guarda la fila entera
 * como estaba y como quedó, y el renglón queda marcado CORREGIDO.
 */
export function Viajes({ viajes, nombres, puedeEditar, esAdmin = false, esHoy = true,
                         tipos = [], puntos = [], placas = [] }: {
  viajes: Viaje[];
  nombres: Record<string, string>;
  puedeEditar: boolean;
  /** Si la pantalla está parada en hoy o en otro día. Solo cambia el texto. */
  esHoy?: boolean;
  /** Solo el administrador corrige. El candado de verdad está en la base. */
  esAdmin?: boolean;
  tipos?: TipoViaje[];
  puntos?: Punto[];
  placas?: PlacaM[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);

  async function anular(id: string) {
    setMandando(true);
    const { error } = await supabase.rpc("traspaso_anular_viaje", {
      p_id: id, p_motivo: motivo,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    setAnulando(null); setMotivo("");
    avisar.bien("Viaje anulado. El cumplido del turno ya lo descontó.");
    router.refresh();
  }

  return (
    <section className="caja">
      {avisos}
      <div className="cab">
        <div>
          <h2>{viajes.length} viaje{viajes.length === 1 ? "" : "s"}{esHoy ? " hoy" : " ese día"}</h2>
          <p>Lo último arriba. Los anulados siguen a la vista, con su motivo.</p>
        </div>
      </div>

      {viajes.length === 0 ? (
        <div className="vacio">
          <b>{esHoy ? "Todavía no hay viajes hoy" : "Ese día no tiene viajes registrados"}</b>
          El primero que se registre va a aparecer aquí y a contar en el plan del turno.
        </div>
      ) : (
        viajes.map((v) => (
          <div key={v.id}>
            <FilaViaje v={v} nombres={nombres} derecha={
              /* LO QUE YA SALIÓ NO SE CORRIGE NI SE ANULA AQUÍ: facturación
                 ya lo dio por salido con su documento. Si está mal, el
                 administrador reabre la salida en Facturación. La base lo
                 impide igual; esto evita el botón que lleva a un error. */
              puedeEditar && v.vale && !v.salida_en ? (
                <>
                  {/* CORREGIR VA ANTES QUE ANULAR: es lo que se quiere
                      hacer nueve de cada diez veces, y lo que menos
                      destruye. Anular queda a la derecha, de último. */}
                  {esAdmin && (
                    <button type="button" className="btn chico"
                            onClick={() => {
                              setCorrigiendo(corrigiendo === v.id ? null : v.id);
                              setAnulando(null);
                            }}>
                      {corrigiendo === v.id ? "Cancelar" : "Corregir"}
                    </button>
                  )}
                  <button type="button" className="btn chico"
                          onClick={() => {
                            setAnulando(anulando === v.id ? null : v.id);
                            setCorrigiendo(null); setMotivo("");
                          }}>
                    {anulando === v.id ? "Cancelar" : "Anular"}
                  </button>
                </>
              ) : null
            } />

            {corrigiendo === v.id && (
              <Corregir v={v} tipos={tipos} puntos={puntos} placas={placas}
                        cerrar={() => setCorrigiendo(null)}
                        listo={(m) => { setCorrigiendo(null); avisar.bien(m); router.refresh() }}
                        fallo={(m) => avisar.mal(m)} />
            )}

            {anulando === v.id && (
              <div className="pie-accion">
                <div className="campo">
                  <label htmlFor={"m-" + v.id}>¿Por qué se anula?</label>
                  <input id={"m-" + v.id} value={motivo} autoFocus
                         placeholder="Se digitó dos veces, el viaje no salió…"
                         onChange={(e) => setMotivo(e.target.value)} />
                </div>
                <p className="guia">
                  El viaje no se borra: se queda marcado con este motivo y deja de contar para
                  el cumplido. Borrarlo dejaría el plan cuadrando sin que nadie sepa por qué.
                  {esAdmin && " Si lo que está mal es un dato, no lo anules: corrígelo."}
                </p>
                <button type="button" className="btn si"
                        disabled={!motivo.trim() || mandando}
                        onClick={() => anular(v.id)}>
                  {mandando ? "Anulando…" : "Anular este viaje"}
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}

/* =====================================================================
   EL FORMULARIO DE CORRECCIÓN

   ARRANCA CON LO QUE EL VIAJE DICE HOY, no vacío. Corregir es cambiar
   una cosa de ocho, y un formulario en blanco obliga a volver a teclear
   las siete que estaban bien — que es justo el trabajo del que esto
   viene a librar.

   Y MANDA LA FILA COMPLETA. La función de la base espera cómo tiene que
   quedar el viaje, no qué cambió: así se puede BORRAR una observación,
   cosa que con "solo lo que cambió" no se puede expresar nunca.
   ===================================================================== */
function Corregir({ v, tipos, puntos, placas, cerrar, listo, fallo }: {
  v: Viaje;
  tipos: TipoViaje[];
  puntos: Punto[];
  placas: PlacaM[];
  cerrar: () => void;
  listo: (mensaje: string) => void;
  fallo: (mensaje: string) => void;
}) {
  const supabase = createClient();
  const [fecha, setFecha] = useState(v.fecha);
  const [turno, setTurno] = useState(v.turno);
  const [vacio, setVacio] = useState(v.vacio);
  const [tipo, setTipo] = useState(v.tipo ?? "");
  const [placa, setPlaca] = useState(v.placa ?? "");
  const [documento, setDocumento] = useState(v.documento ?? "");
  const [origen, setOrigen] = useState(v.origen ?? v.origen_nombre ?? "");
  const [destino, setDestino] = useState(v.destino ?? v.destino_nombre ?? "");
  const [cuantos, setCuantos] = useState(String(v.viajes));
  const [carga, setCarga] = useState(v.carga == null ? "" : String(v.carga));
  const [unidad, setUnidad] = useState(v.unidad ?? "");
  const [nota, setNota] = useState(v.nota ?? "");
  const [porque, setPorque] = useState("");
  const [mandando, setMandando] = useState(false);

  const bodegas: Opcion[] = puntos.filter((p) => p.activo).map((p) => ({
    valor: p.clave, texto: p.nombre, nota: p.descripcion,
  }));
  const placasOp: Opcion[] = placas.filter((p) => p.activo).map((p) => ({
    valor: p.placa, texto: p.placa, nota: p.nota,
  }));
  const tiposOp: Opcion[] = tipos.filter((t) => t.activo).map((t) => ({
    valor: t.clave, texto: t.nombre,
  }));

  async function guardar() {
    setMandando(true);
    const { error } = await supabase.rpc("traspaso_editar_viaje", {
      p_id: v.id,
      p_fecha: fecha,
      p_turno: turno,
      p_tipo: vacio ? null : tipo,
      p_placa: vacio ? null : placa,
      p_origen: vacio ? null : origen,
      p_destino: vacio ? null : destino,
      p_viajes: Math.max(1, Number(cuantos) || 1),
      p_vacio: vacio,
      p_carga: vacio || carga.trim() === "" ? null : Number(carga),
      p_unidad: vacio ? null : unidad.trim() || null,
      p_nota: nota.trim() || null,
      p_motivo: porque.trim() || null,
      p_documento: vacio ? null : documento.trim() || null,
    });
    setMandando(false);
    if (error) {
      fallo(/does not exist|could not find the function|schema cache/i.test(error.message)
        ? "Falta correr supabase/migraciones/2026-09-traspasos-documento.sql en Supabase."
        : /duplicate key|traspasos_viajes_documento_unico/i.test(error.message)
          ? `La orden de cargue ${documento.trim()} ya está en otro viaje registrado.`
          : error.message);
      return;
    }
    listo(`${v.codigo ?? "El viaje"} quedó corregido. Queda escrito qué decía antes.`);
  }

  /* Qué le falta para poder guardar. Se dice ANTES de mandarlo: que la
     base lo rechace después de tocar Guardar es enterarse tarde. */
  const falta = vacio
    ? null
    : !tipo ? "Falta el tipo de viaje"
    : !placa.trim() ? "Falta la placa"
    : !documento.trim() ? "Falta la orden de cargue"
    : !origen ? "Falta la bodega de origen"
    : !destino ? "Falta la bodega de destino"
    : origen === destino ? "El viaje sale y llega al mismo sitio"
    : null;

  return (
    <div className="pie-accion corregir">
      <p className="guia">
        Corriges el viaje <b>{v.codigo}</b>. Se guarda cómo quedó y también cómo estaba:
        la corrección no borra lo que decía antes.
      </p>

      <div className="rejilla-corregir">
        <div className="campo">
          <label htmlFor={"f-" + v.id}>Día</label>
          <input id={"f-" + v.id} type="date" value={fecha}
                 onChange={(e) => setFecha(e.target.value)} />
        </div>

        <div className="campo">
          <label>Turno</label>
          <div className="seg turno">
            {TURNOS.map((t) => (
              <button key={t} type="button" className={turno === t ? "on" : ""}
                      onClick={() => setTurno(t)}>{t}</button>
            ))}
          </div>
        </div>

        <div className="campo">
          <label>¿Qué es?</label>
          <div className="seg">
            <button type="button" className={vacio ? "" : "on"}
                    onClick={() => setVacio(false)}>Con carga</button>
            <button type="button" className={vacio ? "on" : ""}
                    onClick={() => setVacio(true)}>Vacío</button>
          </div>
        </div>

        <div className="campo">
          <label htmlFor={"c-" + v.id}>¿Cuántos viajes?</label>
          <input id={"c-" + v.id} type="number" min={1} inputMode="numeric"
                 value={cuantos} onChange={(e) => setCuantos(e.target.value)} />
        </div>

        {/* UN VACÍO NO TIENE TIPO, NI PLACA, NI RUTA. No se ocultan los
            campos "por limpieza": es que no existen para un vacío, y la
            base los borra. Decirlo evita la pregunta de a dónde se fue
            la placa. */}
        {vacio ? (
          <p className="guia ancho">
            Un viaje vacío no lleva tipo, ni placa, ni ruta: es un número de viajes del turno.
            Si lo pasas a vacío, esos datos se borran de este viaje.
          </p>
        ) : (
          <>
            <div className="campo">
              <label>Tipo de viaje</label>
              <Desplegable valor={tipo} opciones={tiposOp} vacio="Escoge el tipo"
                           alEscoger={setTipo} ariaLabel="Tipo de viaje" />
            </div>

            <div className="campo">
              <label>Placa</label>
              <Desplegable valor={placa} opciones={placasOp} vacio="Escoge la placa"
                           alEscoger={setPlaca} ariaLabel="Placa" />
            </div>

            {/* AQUÍ SE COMPLETAN LOS VIEJOS. Un viaje de antes de que el
                documento existiera llega a este formulario vacío en este
                campo, y no se puede guardar sin llenarlo: es el único
                momento en que alguien está mirando ese viaje con el
                papel al lado. */}
            <div className="campo">
              <label htmlFor={"d-" + v.id}>Orden de cargue</label>
              <input id={"d-" + v.id} value={documento} autoComplete="off" spellCheck={false}
                     placeholder={v.documento ? "" : "Este viaje todavía no lo tiene"}
                     inputMode="numeric" maxLength={10}
                     onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 10))} />
            </div>

            <div className="campo">
              <label>Sale de</label>
              <Desplegable valor={origen} opciones={bodegas} vacio="Bodega de origen"
                           alEscoger={setOrigen} ariaLabel="Bodega de origen" />
            </div>

            <div className="campo">
              <label>Llega a</label>
              <Desplegable valor={destino} opciones={bodegas} vacio="Bodega de destino"
                           alEscoger={setDestino} ariaLabel="Bodega de destino" />
            </div>

            <div className="campo">
              <label htmlFor={"ca-" + v.id}>Cantidad (opcional)</label>
              <input id={"ca-" + v.id} type="number" inputMode="numeric" value={carga}
                     placeholder="Sin dato" onChange={(e) => setCarga(e.target.value)} />
            </div>

            <div className="campo">
              <label htmlFor={"u-" + v.id}>Unidad</label>
              <input id={"u-" + v.id} value={unidad} placeholder="canastas, estibas…"
                     onChange={(e) => setUnidad(e.target.value)} />
            </div>
          </>
        )}

        <div className="campo ancho">
          <label htmlFor={"n-" + v.id}>Observación</label>
          <input id={"n-" + v.id} value={nota} placeholder="Sin observación"
                 onChange={(e) => setNota(e.target.value)} />
        </div>

        <div className="campo ancho">
          <label htmlFor={"p-" + v.id}>¿Por qué se corrige? (opcional)</label>
          <input id={"p-" + v.id} value={porque}
                 placeholder="Se digitó la placa del otro camión…"
                 onChange={(e) => setPorque(e.target.value)} />
        </div>
      </div>

      <div className="fila-btn">
        <button type="button" className="btn si" disabled={mandando || !!falta}
                onClick={guardar}>
          {mandando ? "Guardando…" : "Guardar la corrección"}
        </button>
        <button type="button" className="btn" disabled={mandando} onClick={cerrar}>
          Dejar así
        </button>
        {falta && <span className="aviso-cambios">{falta}</span>}
      </div>
    </div>
  );
}
