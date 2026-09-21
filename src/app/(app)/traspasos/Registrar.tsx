"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { PlacaM, Punto, TipoViaje, Viaje } from "@/modulos/traspasos/datos";
import { TURNOS, hora, quien } from "@/modulos/traspasos/formato";
import { Desplegable } from "./comunes";

/**
 * REGISTRAR UN VIAJE.
 *
 * Es la pantalla del supervisor, de pie al lado del vehículo, con el
 * celular en una mano. Todo cabe sin desplazar, y LO QUE MÁS SE REPITE
 * YA ESTÁ DE UN TOQUE: las placas que pasaron esta semana, las rutas
 * que más se usan, el turno que va por la hora. Casi ningún viaje
 * obliga a teclear nada.
 *
 * Esas listas salen de lo que ya está registrado —no hay un maestro de
 * placas ni de rutas que alguien tenga que llenar—, así que funcionan
 * desde el primer día y se afinan solas.
 *
 * NO PIDE EL "CUMPLIDO" POR NINGÚN LADO, y eso es el punto del módulo:
 * registrar este viaje ES el cumplimiento.
 *
 * DOS COSAS QUE NO SE MEZCLAN. Un viaje CON CARGA lleva placa, ruta y
 * tipo. Los VACÍOS son un número de viajes del turno y ya: no llevan
 * tipo ni placa porque no los tienen, y pedirlos obligaría a
 * inventarlos.
 *
 * EL TIPO SE ESCOGE DEL PLAN, no de una lista de nueve. Lo que hay que
 * mover en este turno ya está decidido; la pregunta de quien está al
 * lado del vehículo es «de lo que falta, cuál es este viaje». Cada
 * tipo del plan dice CUÁNTOS FALTAN, que es la cifra que se usa —«4 de
 * 7» obliga a restar—. Lo que no estaba planeado no desaparece: vive
 * detrás del «+», y queda dicho en la pantalla que va como adicional.
 */
export type PlanTipo = {
  tipo: string; nombre: string; planeado: number; cumplido: number;
};

export function Registrar({ tipos, puntos, placas, placasM,
                            fecha, turnoSugerido,
                            planTurno, hechosTurno, planPorTipo, viajes, nombres }: {
  tipos: TipoViaje[];
  puntos: Punto[];
  placas: { placa: string; veces: number }[];
  /** El maestro de placas. Lo que se puede escoger, ya no texto libre. */
  placasM: PlacaM[];
  fecha: string;
  turnoSugerido: string;
  /** Cuántos viajes lleva planeados el turno escogido, y cuántos van. */
  planTurno: Record<string, number>;
  hechosTurno: Record<string, number>;
  /** El plan del turno, tipo por tipo: qué falta de cada uno. */
  planPorTipo: Record<string, PlanTipo[]>;
  viajes: Viaje[];
  nombres: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [modo, setModo] = useState<"carga" | "vacio">("carga");
  const [turno, setTurno] = useState(turnoSugerido);
  /* VARIOS TIPOS A LA VEZ, cada uno con su cantidad.

     UN CAMIÓN PUEDE SALIR CON CASCO Y ESTIBAS, y hasta hoy había que
     escoger uno de los dos: el otro desaparecía del plan. No se podía
     registrar dos veces porque el documento es UNO —el del papel que va
     con el vehículo— y no se puede repetir.

     Se guarda como Map y no como lista para que escoger y desescoger
     sea una sola operación, y para que la cantidad de un tipo no se
     pierda al desescoger el de al lado. */
  const [tipos_, setTipos] = useState<Map<string, string>>(new Map());
  const [placa, setPlaca] = useState("");
  /* EL DOCUMENTO ES UN NÚMERO Y LLEVA DIEZ CIFRAS COMO MÁXIMO.
     Se limpia DESDE LA TECLA y no al guardar: quien teclea de más vería
     una cosa en la pantalla y otra en la tabla de abajo, y la primera
     pregunta sería si se guardó bien. Y quien pega dos documentos
     seguidos —que es como se cuelan los de veinte cifras— ve en el acto
     que solo entraron diez. */
  const [documento, setDocumento] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [viajesN, setViajesN] = useState(1);
  /* LA CANTIDAD YA NO ES UNA SOLA: va por tipo, dentro de `tipos_`. La
     del PRIMER tipo se guarda además en la columna `carga` del viaje
     —lo hace la base— para que todo lo que ya la lee siga leyéndola. */
  const [nota, setNota] = useState("");
  const [mandando, setMandando] = useState(false);
  const [verOtros, setVerOtros] = useState(false);
  const [placaNueva, setPlacaNueva] = useState<string | null>(null);
  const [bodegaNueva, setBodegaNueva] = useState<{ lado: "o" | "d"; texto: string } | null>(null);
  const campoPlaca = useRef<HTMLButtonElement>(null);

  const hayMaestro = puntos.length > 0;
  const puntosVivos = puntos.filter((p) => p.activo);

  /* LAS BODEGAS SON UNA SOLA LISTA. La misma es origen unas veces y
     destino otras, así que no hay dos maestros ni una lista de pares:
     hay bodegas, y un viaje escoge dos. */
  const bodegas = puntosVivos.map((p) => ({
    valor: p.clave, texto: p.nombre, nota: p.descripcion,
  }));

  /* ------------------------------------------------------------------
     AGREGAR SOBRE LA MARCHA.

     El desplegable trae un «＋». Nadie se queda parado en el muelle
     esperando a que alguien con permiso entre al Maestro — y lo que se
     agrega así es exactamente lo que de verdad se usa.
     ------------------------------------------------------------------ */
  async function guardarPlacaNueva() {
    const t = (placaNueva ?? "").trim();
    if (!t) return;
    setMandando(true);
    const { data, error } = await supabase.rpc("traspaso_agregar_placa",
      { p_placa: t, p_nota: null });
    setMandando(false);
    if (error) { avisar.mal(mensajeFalta(error.message)); return }
    setPlaca(data as string);
    setPlacaNueva(null);
    avisar.bien(`${data} quedó en el maestro de placas.`);
    router.refresh();
  }

  async function guardarBodegaNueva() {
    const b = bodegaNueva;
    const t = (b?.texto ?? "").trim();
    if (!b || !t) return;
    setMandando(true);
    const { data, error } = await supabase.rpc("traspaso_agregar_punto",
      { p_nombre: t, p_descripcion: null });
    setMandando(false);
    if (error) {
      avisar.mal(/does not exist|could not find the function|schema cache/i.test(error.message)
        ? "Falta correr supabase/migraciones/2026-09-traspasos-maestro.sql en Supabase."
        : error.message);
      return;
    }
    const cl = (data as { clave: string }[] | null)?.[0]?.clave ?? "";
    if (b.lado === "o") setOrigen(cl); else setDestino(cl);
    setBodegaNueva(null);
    avisar.bien(`${t} quedó en el maestro de bodegas.`);
    router.refresh();
  }

  function mensajeFalta(m: string) {
    return /does not exist|could not find the function|schema cache/i.test(m)
      ? "Falta correr supabase/migraciones/2026-09-traspasos-placas-rutas.sql en Supabase."
      : m;
  }

  /* ------------------------------------------------------------------
     LO PLANEADO Y LO DEMÁS.

     `delPlan` son los tipos que este turno prometió mover. `otros` es
     todo lo que existe en el maestro y no está en el plan: se puede
     registrar igual —el plan no es una reja— pero detrás del «+», para
     que el camino corto sea el del plan.
     ------------------------------------------------------------------ */
  const delPlan = planPorTipo[turno] ?? [];
  const enPlan = new Set(delPlan.map((p) => p.tipo));
  const otros = tipos.filter((t) => !enPlan.has(t.clave));
  const hayPlan = delPlan.length > 0;

  /* EL ORDEN EN QUE SE ESCOGIERON. El primero es el que queda como tipo
     del viaje, así que no puede depender de cómo esté ordenado el
     maestro: es el que la persona tocó primero. */
  const escogidos = [...tipos_.keys()];
  const nombreTipo = (c: string) =>
    tipos.find((t) => t.clave === c)?.nombre ?? c;

  /* CUÁLES DE LOS TIPOS ESCOGIDOS SE SALEN DEL PLAN.
     Cada tipo avanza SU plan, así que la cuenta es por tipo: uno puede
     ir dentro del plan y el de al lado por encima, en el mismo viaje.
     Antes era una sola cifra porque había un solo tipo. */
  const fueraDelPlan = escogidos.filter((c) => {
    if (!hayPlan) return true;
    const l = delPlan.find((p) => p.tipo === c);
    return !l || l.planeado - l.cumplido <= 0;
  });
  /* UN VACÍO NO LLEVA DOCUMENTO. No es un olvido: es un número de
     viajes del turno, no un traslado con papel. Pedírselo obligaría a
     inventar un número, y un número inventado en una columna que no se
     puede repetir bloquea el día que alguien lo vuelva a inventar. */
  const puedeMandar = modo === "vacio"
    ? viajesN >= 1
    : escogidos.length > 0 && placa.trim() !== "" && documento.trim() !== ""
      && origen.trim() !== "" && destino.trim() !== "";

  /* CTRL+ENTER MANDA. Quien registra veinte viajes seguidos desde el
     escritorio no quiere soltar el teclado para buscar el botón. */
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && puedeMandar && !mandando) {
        e.preventDefault(); mandar();
      }
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  });

  /* Escoger y desescoger un tipo. La cantidad de los demás no se toca:
     quien ya escribió «120 canastas de PET» y se equivocó de segundo
     tipo no tiene por qué volver a teclear lo primero. */
  function tocarTipo(clave: string) {
    setTipos((m) => {
      const n = new Map(m);
      if (n.has(clave)) n.delete(clave); else n.set(clave, "");
      return n;
    });
  }
  function ponCantidad(clave: string, v: string) {
    setTipos((m) => new Map(m).set(clave, v.replace(/\D/g, "")));
  }
  async function mandar() {
    setMandando(true);
    const esVacio = modo === "vacio";
    /* DOS PUERTAS, Y CADA UNA ES LA SUYA.
       El vacío sigue por `traspaso_registrar`: no lleva tipo ni placa ni
       documento, es un número de viajes del turno, y meterlo por la
       función de varios tipos obligaría a inventarle un tipo.
       El viaje con carga va por `traspaso_registrar_varios`, que cuelga
       los tipos y fuerza el viaje en 1 — un vehículo es un viaje. */
    const { error } = esVacio
      ? await supabase.rpc("traspaso_registrar", {
          p_fecha: fecha, p_turno: turno,
          p_tipo: null, p_placa: null, p_origen: null, p_destino: null,
          p_viajes: viajesN, p_vacio: true,
          p_carga: null, p_unidad: null,
          p_nota: nota.trim() || null, p_documento: null,
        })
      : await supabase.rpc("traspaso_registrar_varios", {
          p_fecha: fecha, p_turno: turno,
          p_tipos: escogidos.map((c) => ({
            tipo: c,
            cantidad: (tipos_.get(c) ?? "").trim() === "" ? null : Number(tipos_.get(c)),
          })),
          p_placa: placa,
          p_origen: origen,
          p_destino: destino,
          p_documento: documento.trim() || null,
          p_nota: nota.trim() || null,
        });
    setMandando(false);
    if (error) { avisar.mal(mensajeRegistro(error.message)); return }

    const cuantos = escogidos.length;
    avisar.bien(esVacio
      ? `${viajesN} viaje${viajesN === 1 ? "" : "s"} vacío${viajesN === 1 ? "" : "s"} en el turno ${turno}.`
      /* SE DICE CUÁNTOS PLANES MOVIÓ, no «un viaje». Un camión con tres
         tipos avanza tres planes, y el total del turno va a subir tres:
         quien lo registró tiene que saberlo en el momento, no
         descubrirlo en Control preguntándose de dónde salieron. */
      : fueraDelPlan.length === 0
        ? `${placa.toUpperCase()} registrado · ${cuantos} tipo${cuantos === 1 ? "" : "s"}. El plan del turno ya lo cuenta.`
        : fueraDelPlan.length === cuantos
          ? `${placa.toUpperCase()} registrado · ${cuantos} tipo${cuantos === 1 ? "" : "s"}, ${cuantos === 1 ? "fuera del plan" : "todos fuera del plan"}. Va a salir en Control por encima.`
          : `${placa.toUpperCase()} registrado · ${cuantos - fueraDelPlan.length} del plan y ${fueraDelPlan.length} por encima.`);

    /* SE LIMPIA LO DEL VIAJE Y SE DEJA LO DEL TURNO: quien registra
       varios seguidos del mismo tipo y la misma ruta no debería volver
       a escogerlos cada vez — es lo que hace que se dejen de registrar
       a media tarde. */
    /* EL DOCUMENTO SE LIMPIA SIEMPRE, y es de las cosas que más
       importan de esta pantalla: dejarlo puesto haría que el siguiente
       viaje saliera rechazado por repetido —o peor, que alguien lo
       registrara con el documento del anterior sin darse cuenta—. */
    setPlaca(""); setDocumento(""); setNota(""); setViajesN(1);
    /* LOS TIPOS TAMBIÉN SE LIMPIAN. Se quedaban puestos «porque el
       siguiente suele ser igual», y con varios tipos eso es otra cosa:
       un camión de casco registrado detrás de uno de casco+estibas+PET
       avanzaría tres planes sin que nadie lo tocara. */
    setTipos(new Map());
    campoPlaca.current?.focus();
    router.refresh();
  }

  /* El índice único habla en su idioma. Quien está de pie al lado de un
     camión no tiene por qué leer «duplicate key value violates unique
     constraint». La base ya manda el mensaje bueno cuando puede; esto
     cubre el caso en que llegue el crudo. */
  function mensajeRegistro(m: string) {
    if (/does not exist|could not find the function|schema cache/i.test(m)) {
      return "Falta correr supabase/migraciones/2026-09-traspasos-documento.sql en Supabase.";
    }
    if (/duplicate key|traspasos_viajes_documento_unico/i.test(m)) {
      return `La orden de cargue ${documento.trim()} ya está registrada en otro viaje. `
           + "Revisa el número; si el otro registro está malo, anúlalo y este entra.";
    }
    /* LA REGLA DE LAS DIEZ CIFRAS TAMBIÉN ESTÁ EN LA BASE, y ahí habla
       en su idioma. La pantalla ya no deja teclear otra cosa, así que si
       este mensaje llega es porque el registro entró por otra puerta —o
       porque a alguien se le pasó un documento viejo con letras—. Aun
       así se traduce: un «violates check constraint» no le dice nada a
       quien está al lado de un camión. */
    if (/traspasos_viajes_documento_diez/i.test(m)) {
      return "La orden de cargue va en números y con diez cifras como máximo.";
    }
    return m;
  }

  const plan = planTurno[turno] ?? 0;
  const hechos = hechosTurno[turno] ?? 0;

  return (
    <>
      {avisos}
      <div className="consola">
        <section className="tarj-reg">
          <div className="cab">
            <h2>Viaje nuevo</h2>
            <p>Todo cabe en una pantalla. Lo que más se repite ya está de un toque.</p>
          </div>

          <div className="cuerpo-f">
            <div className="linea-campos">
              <div>
                <span className="rot-campo">¿Qué se registra?</span>
                <div className="seg">
                  <button type="button" className={modo === "carga" ? "on" : ""}
                          onClick={() => setModo("carga")}>Viaje con carga</button>
                  <button type="button" className={modo === "vacio" ? "on" : ""}
                          onClick={() => setModo("vacio")}>Viaje vacío</button>
                </div>
              </div>
              <div>
                <span className="rot-campo">Turno</span>
                <div className="seg turno">
                  {TURNOS.map((t) => (
                    <button key={t} type="button" className={turno === t ? "on" : ""}
                            onClick={() => setTurno(t)}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            {modo === "carga" && (
              <>
                {/* EL DOCUMENTO VA PRIMERO, ANTES DE LA PLACA.

                    Es el orden en que llega la información a la mano de
                    quien registra: el papel se recibe, se lee su número,
                    y de ese papel se saca de qué vehículo es. Pedir
                    primero la placa obliga a mirar el vehículo, soltar,
                    volver al papel y volver a mirar.

                    Y ES EL CAMPO QUE PUEDE RECHAZAR EL REGISTRO: si ese
                    número ya está en otro viaje, no entra. Descubrirlo
                    de primero cuesta un campo; descubrirlo al final
                    cuesta el formulario entero.

                    DIEZ CIFRAS Y SOLO CIFRAS, limpiadas desde la tecla.
                    Así, pegar dos documentos seguidos —que es como se
                    cuelan los de veinte— se ve en el acto. */}
                {/* SE LLAMA «ORDEN DE CARGUE» —«que el documento que está en
                    Registrar se llame Orden de cargue»—. Es el papel del
                    patio. El número de documento lo pone FACTURACIÓN al
                    confirmar la salida, y es ese el que se cruza con SAP. */}
                <div>
                  <span className="rot-campo">Orden de cargue</span>
                  <input className="campo-suelto doc" value={documento}
                         autoComplete="off" spellCheck={false}
                         inputMode="numeric" maxLength={10}
                         aria-label="Orden de cargue del viaje"
                         placeholder="El número de la orden — hasta 10 cifras"
                         onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 10))} />
                  <p className="guia" style={{ marginTop: 8 }}>
                    Solo números, hasta diez. <b>No se puede repetir</b>: si este número ya
                    está en otro viaje, la pantalla te dice en cuál. Si ese otro registro
                    está malo, anúlalo y este entra.
                  </p>
                </div>

                <div>
                  <span className="rot-campo">Placa</span>
                  {/* DE LISTA, NO A MANO. Las placas salen del maestro: una
                      equivocación tecleada una vez ya no entra en la lista
                      ni se vuelve a ofrecer. El «＋» está al lado para que
                      un vehículo nuevo no trabe el registro. */}
                  <div className="placa">
                    <Desplegable grande disparoRef={campoPlaca} valor={placa}
                                 ariaLabel="Placa del vehículo" vacio="Escoge la placa…"
                                 opciones={placasM.map((p) => ({
                                   valor: p.placa, texto: p.placa, nota: p.nota,
                                 }))}
                                 extra="Otra placa…"
                                 alEscoger={setPlaca}
                                 alExtra={() => setPlacaNueva("")} />
                  </div>

                  {placaNueva !== null && (
                    <div className="alta">
                      {/* MAYÚSCULA DESDE LA TECLA. La base ya la sube al
                          guardar —upper() en traspaso_agregar_placa— pero
                          quien teclea «nlw428» vería una cosa en la
                          pantalla y otra en la lista de abajo, y la
                          primera pregunta sería si se guardó bien. */}
                      <input value={placaNueva} autoFocus autoComplete="off" spellCheck={false}
                             placeholder="ABC123" aria-label="Placa nueva"
                             onChange={(e) => setPlacaNueva(e.target.value.toUpperCase())}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") { e.preventDefault(); guardarPlacaNueva() }
                               if (e.key === "Escape") setPlacaNueva(null);
                             }} />
                      <button type="button" className="btn si chico" disabled={mandando}
                              onClick={guardarPlacaNueva}>Agregar</button>
                      <button type="button" className="btn chico"
                              onClick={() => setPlacaNueva(null)}>Dejar así</button>
                    </div>
                  )}
                  {/* LAS PLACAS DE LA SEMANA. Casi siempre el vehículo
                      que está en la puerta ya pasó: tocarla es un gesto,
                      teclearla con guantes son diez segundos y un error
                      de dedo. */}
                  {placas.length > 0 && (
                    <div className="recientes">
                      {placas.map((p) => (
                        <button key={p.placa} type="button"
                                onClick={() => setPlaca(p.placa)}>{p.placa}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <span className="rot-campo">
                    {hayPlan ? `Del plan del turno ${turno}` : "Tipo de viaje"}
                  </span>

                  {hayPlan ? (
                    <>
                      <div className="chips-plan">
                        {delPlan.map((p) => {
                          const f = Math.max(0, p.planeado - p.cumplido);
                          const sobra = Math.max(0, p.cumplido - p.planeado);
                          return (
                            <button key={p.tipo} type="button"
                                    className={"chip-plan"
                                      + (tipos_.has(p.tipo) ? " on" : "")
                                      + (f === 0 ? " lleno" : "")}
                                    aria-pressed={tipos_.has(p.tipo)}
                                    onClick={() => tocarTipo(p.tipo)}>
                              <b>{p.nombre}</b>
                              <span className="falta">
                                {f > 0 ? `Faltan ${f}`
                                  : sobra > 0 ? `+${sobra} sobre el plan`
                                  : "Completo"}
                              </span>
                              <span className="prog">{p.cumplido} / {p.planeado}</span>
                            </button>
                          );
                        })}

                        {/* LO QUE NO ESTABA PLANEADO. El plan no es una
                            reja: si llegó un viaje de algo que nadie
                            previó, se registra —y Control lo va a
                            mostrar como «sin planear», que es
                            justamente el dato que sirve—. */}
                        {otros.length > 0 && (
                          <button type="button"
                                  className={"chip-mas" + (verOtros ? " on" : "")}
                                  aria-expanded={verOtros}
                                  onClick={() => setVerOtros((v) => !v)}>
                            <b>+</b>
                            <span className="falta">Adicional</span>
                            <span className="prog">fuera del plan</span>
                          </button>
                        )}
                      </div>

                      {verOtros && (
                        <div className="chips otros-tipos">
                          {otros.map((t) => (
                            <button key={t.clave} type="button"
                                    className={tipos_.has(t.clave) ? "on" : ""}
                                    aria-pressed={tipos_.has(t.clave)}
                                    onClick={() => tocarTipo(t.clave)}>{t.nombre}</button>
                          ))}
                        </div>
                      )}

                      {/* SE DICE ANTES DE REGISTRAR, no después. Que un
                          viaje salga por encima del plan no es un error
                          —pasa todos los días— pero sí es algo que quien
                          lo registra tiene que saber que está haciendo. */}
                      {fueraDelPlan.length > 0 && (
                        <p className="guia adicional">
                          {fueraDelPlan.length === 1
                            ? <><b>{nombreTipo(fueraDelPlan[0])}</b> va como <b>adicional</b>: ya completó su plan del turno o no estaba en él.</>
                            : <>Van como <b>adicionales</b>: {fueraDelPlan.map(nombreTipo).join(", ")}. Ya completaron su plan del turno o no estaban en él.</>}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="chips">
                        {tipos.map((t) => (
                          <button key={t.clave} type="button"
                                  className={tipos_.has(t.clave) ? "on" : ""}
                                  aria-pressed={tipos_.has(t.clave)}
                                  onClick={() => tocarTipo(t.clave)}>{t.nombre}</button>
                        ))}
                      </div>
                      <p className="guia" style={{ marginTop: 10 }}>
                        El turno {turno} no tiene plan publicado, así que se escoge de la lista
                        completa. Todo lo que se registre va a salir como «sin planear» en Control.
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <span className="rot-campo">Ruta</span>

                  {/* DOS BODEGAS, NO UNA "RUTA". Una ruta no es una cosa
                      que exista por sí sola: es de dónde sale y a dónde
                      llega, y las dos salen de la MISMA lista — la misma
                      bodega es origen unas veces y destino otras.

                      Hubo aquí un maestro de rutas, una lista de pares
                      aparte de la de bodegas. Era mantener dos listas
                      donde hay una, y el día que se desajustaran nadie
                      sabría cuál creer. Se botó antes de llegar a la
                      base. */}
                  <div className="ruta">
                    <Desplegable valor={origen} ariaLabel="De dónde sale"
                                 vacio="De dónde sale…" opciones={bodegas}
                                 extra="Otra bodega…"
                                 alEscoger={setOrigen}
                                 alExtra={() => setBodegaNueva({ lado: "o", texto: "" })} />

                    {/* VOLTEAR. La mitad de los viajes son el regreso del
                        anterior, y ahora que las dos puntas salen de la
                        misma lista voltearlas siempre tiene sentido. */}
                    <button type="button" className="voltear" aria-label="voltear la ruta"
                            disabled={!origen && !destino}
                            title="Voltear: la ruta de vuelta"
                            onClick={() => { const o = origen; setOrigen(destino); setDestino(o) }}>
                      <svg viewBox="0 0 24 24"><path d="M7 10h13M7 10l3-3M7 10l3 3" />
                        <path d="M17 14H4M17 14l-3-3M17 14l-3 3" /></svg>
                    </button>

                    <Desplegable valor={destino} ariaLabel="A dónde va"
                                 vacio="A dónde va…"
                                 opciones={bodegas.filter((b) => b.valor !== origen)}
                                 extra="Otra bodega…"
                                 alEscoger={setDestino}
                                 alExtra={() => setBodegaNueva({ lado: "d", texto: "" })} />
                  </div>

                  {bodegaNueva !== null && (
                    <div className="alta">
                      <input value={bodegaNueva.texto} autoFocus autoComplete="off"
                             aria-label="Bodega nueva"
                             placeholder={bodegaNueva.lado === "o"
                               ? "Nombre de la bodega de origen"
                               : "Nombre de la bodega de destino"}
                             onChange={(e) => setBodegaNueva({ ...bodegaNueva, texto: e.target.value })}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") { e.preventDefault(); guardarBodegaNueva() }
                               if (e.key === "Escape") setBodegaNueva(null);
                             }} />
                      <button type="button" className="btn si chico"
                              disabled={!bodegaNueva.texto.trim() || mandando}
                              onClick={guardarBodegaNueva}>Agregar</button>
                      <button type="button" className="btn chico"
                              onClick={() => setBodegaNueva(null)}>Dejar así</button>
                    </div>
                  )}

                  {/* AQUÍ ESTABAN LAS RUTAS FRECUENTES —una fila de
                      atajos «FABRICA → BODEGA 38»— y las quitó Cristian.

                      La idea era ahorrar dos toques; lo que hacía era
                      poner SEIS botones grandes debajo de los dos
                      campos que acaban de contestar lo mismo. Y crecen:
                      cada par nuevo que alguien registra suma otro
                      botón, así que la fila se alarga sola hasta empujar
                      el resto del formulario fuera de la pantalla.

                      Los dos desplegables de arriba ya se teclean y
                      filtran; el atajo no ahorraba lo suficiente para
                      pagar el sitio que ocupaba.

                      Y SE FUE TAMBIÉN LA CONSULTA. `rutasFrecuentes()`
                      corría en cada carga de la pantalla para llenar
                      estos seis botones; dejarla pedida «por si acaso»
                      es trabajo que alguien paga en tiempo de carga sin
                      que nada lo use. La cuenta sale de los viajes ya
                      registrados, así que el día que se quiera —como
                      pista al lado del destino, por ejemplo— se vuelve
                      a pedir y ya. La función sigue en `datos.ts`. */}

                  {puntosVivos.length === 0 && (
                    <p className="guia" style={{ marginTop: 10 }}>
                      Todavía no hay bodegas. Agrégalas aquí mismo con <b>Otra bodega…</b>, o
                      en <b>Maestro → Bodegas</b>.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ---------- CUÁNTO LLEVA DE CADA TIPO ----------

                EL CONTADOR DE VIAJES SE FUE DEL VIAJE CON CARGA, y no es
                que se esconda: es que ya no existe. Un vehículo es UN
                viaje; lo que puede ser más de uno son los tipos que
                lleva encima, y eso ahora se escoge arriba. Dejar el
                contador al lado invitaría a poner 3 y registrar nueve
                planes con un solo camión.

                Los VACÍOS sí lo conservan: un vacío no es un vehículo
                con papel, es un número de viajes del turno, y meter los
                cinco de una es justo para lo que sirve. */}
            {modo === "vacio" ? (
              <div className="linea-campos">
                <div>
                  <span className="rot-campo">¿Cuántos viajes vacíos?</span>
                  <div className="conteo">
                    <span className="cel-step grande">
                      <button type="button" onClick={() => setViajesN(Math.max(1, viajesN - 1))}
                              aria-label="uno menos">−</button>
                      <input value={viajesN} inputMode="numeric" aria-label="cuántos viajes"
                             onChange={(e) =>
                               setViajesN(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))} />
                      <button type="button" onClick={() => setViajesN(viajesN + 1)}
                              aria-label="uno más">+</button>
                    </span>
                    <span className="nota-conteo">
                      No entran en el cumplido: cuestan igual y no mueven producto.
                    </span>
                  </div>
                </div>
              </div>
            ) : escogidos.length > 0 && (
              <div>
                <span className="rot-campo">
                  Cuánto lleva de cada tipo <em className="rot-suave">(opcional)</em>
                </span>
                <div className="por-tipo">
                  {escogidos.map((c, i) => (
                    <label key={c} className="pt-fila">
                      <span className="pt-nombre">
                        {nombreTipo(c)}
                        {/* CUÁL ES EL PRINCIPAL, DICHO. Es el que queda
                            en la columna del viaje y el que sale en la
                            lista de abajo; sin decirlo, el orden en que
                            se tocaron los chips sería una regla
                            invisible. */}
                        {i === 0 && escogidos.length > 1 && <i>principal</i>}
                      </span>
                      <input value={tipos_.get(c) ?? ""} inputMode="numeric"
                             placeholder="Canastas, estibas…"
                             aria-label={`Cuánto lleva de ${nombreTipo(c)}`}
                             onChange={(e) => ponCantidad(c, e.target.value)} />
                    </label>
                  ))}
                </div>
                <p className="guia" style={{ marginTop: 8 }}>
                  Este viaje avanza <b>{escogidos.length}</b> plan
                  {escogidos.length === 1 ? "" : "es"} del turno, uno por tipo. El vehículo
                  salió una vez; el plan se mide por tipo.
                </p>
              </div>
            )}

            {/* LA NOVEDAD VA PLEGADA: se usa en uno de cada veinte
                viajes, y un campo grande que casi nunca se llena empuja
                el botón fuera de la pantalla en el celular. */}
            <details className="extra">
              <summary>Agregar novedad</summary>
              <textarea value={nota} placeholder="Solo si pasó algo que haya que contar"
                        onChange={(e) => setNota(e.target.value)} />
            </details>
          </div>

          <div className="pie-reg">
            <button type="button" className="btn si" disabled={!puedeMandar || mandando}
                    onClick={mandar}>
              {mandando ? "Registrando…"
                : modo === "vacio" ? `Registrar ${viajesN} vacío${viajesN === 1 ? "" : "s"}`
                : !placa.trim() ? "Falta la placa"
                : !documento.trim() ? "Falta la orden de cargue"
                : escogidos.length === 0 ? (hayPlan ? "Escoge del plan" : "Falta el tipo")
                : !origen.trim() || !destino.trim() ? "Falta la ruta"
                /* El botón dice lo que va a pasar. "Registrar viaje" cuando
                   el viaje se sale del plan esconde justo lo que había que
                   avisar. Y con varios tipos dice CUÁNTOS, porque el total
                   del turno va a subir esa cifra y no uno. */
                : fueraDelPlan.length === 0
                  ? (escogidos.length === 1 ? "Registrar viaje" : `Registrar · ${escogidos.length} tipos`)
                : fueraDelPlan.length === escogidos.length
                  ? `Registrar ${escogidos.length === 1 ? "adicional" : `${escogidos.length} adicionales`}`
                : `Registrar (${fueraDelPlan.length} adicional${fueraDelPlan.length === 1 ? "" : "es"})`}
            </button>
            <span className="atajo">o pulsa <kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
          </div>
        </section>

        <aside>
          {/* EL PLAN DEL TURNO, EN CUADRITOS. Un cuadro por viaje
              planeado, encendido al registrarlo. "4 de 16" se entiende
              leyendo; doce cuadros apagados se entienden sin leer. */}
          <div className="plan-turno">
            <div className="corte" aria-hidden />
            <div className="rot">PLAN DEL TURNO {turno}</div>
            <div className="marca">
              {/* "1 de 0 viajes" no quiere decir nada. Sin plan, la cifra
                  que hay es cuántos van registrados y ya. */}
              <b>{hechos}</b>
              <span>{plan > 0 ? `de ${plan} viajes` : hechos === 1 ? "viaje, sin plan" : "viajes, sin plan"}</span>
            </div>
            {plan > 0 ? (
              <>
                <div className="huecos">
                  {Array.from({ length: Math.min(plan, 30) }, (_, i) => (
                    <i key={i} className={i < hechos ? "lleno" : undefined} />
                  ))}
                </div>
                <div className="pie-plan">Cada cuadro es un viaje del plan. Se prende al registrarlo.</div>
              </>
            ) : (
              <div className="pie-plan">
                Este turno no tiene plan publicado. Se puede registrar igual — va a salir como
                «sin planear» en Control.
              </div>
            )}
          </div>

          <div className="hoy">
            <div className="cab">
              <h3>Viajes de hoy</h3>
              <span className="cuantos">{viajes.filter((v) => v.vale).length} registrados</span>
            </div>
            {viajes.length === 0 ? (
              <div className="vacio-hoy">
                Todavía no hay viajes hoy.<br />El primero que registres aparece aquí.
              </div>
            ) : (
              viajes.slice(0, 12).map((v) => (
                <div className={"viaje" + (v.vale ? "" : " anulado")} key={v.id}>
                  <span className="hora">{hora(v.hora)}</span>
                  <span>
                    <span className="pl">{v.vacio ? `${v.viajes} vacíos` : v.placa}</span>
                    <span className="det">
                      {v.vacio
                        ? `Turno ${v.turno} · ${quien(nombres, v.registrado_por)}`
                        /* EL DOCUMENTO DE PRIMERO en este renglón: la
                           lista de al lado se mira para responder «¿ya
                           metí este papel?», y la respuesta es el
                           número, no la ruta. */
                        : `${v.documento ?? "sin orden de cargue"} · ${v.tipo_nombre}`
                          + ` · ${v.origen_nombre} → ${v.destino_nombre}`}
                    </span>
                  </span>
                  {!v.vale && <span className="eti mal">ANULADO</span>}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </>
  );
}


