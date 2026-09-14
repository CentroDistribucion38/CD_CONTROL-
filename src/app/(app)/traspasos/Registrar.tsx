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

export function Registrar({ tipos, puntos, placas, rutas, placasM,
                            fecha, turnoSugerido,
                            planTurno, hechosTurno, planPorTipo, viajes, nombres }: {
  tipos: TipoViaje[];
  puntos: Punto[];
  placas: { placa: string; veces: number }[];
  rutas: { origen: string; destino: string; veces: number }[];
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
  const [tipo, setTipo] = useState("");
  const [placa, setPlaca] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [viajesN, setViajesN] = useState(1);
  const [carga, setCarga] = useState("");
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

  /* De los `viajesN` que se están registrando, cuántos se salen del
     plan. Si el tipo no estaba planeado, todos. */
  const linea = delPlan.find((p) => p.tipo === tipo);
  const faltan = linea ? Math.max(0, linea.planeado - linea.cumplido) : 0;
  const adicionales = !tipo || !hayPlan ? 0
    : Math.max(0, viajesN - faltan);
  const puedeMandar = modo === "vacio"
    ? viajesN >= 1
    : !!tipo && placa.trim() !== "" && origen.trim() !== "" && destino.trim() !== "";

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

  async function mandar() {
    setMandando(true);
    const esVacio = modo === "vacio";
    const { error } = await supabase.rpc("traspaso_registrar", {
      p_fecha: fecha, p_turno: turno,
      p_tipo: esVacio ? null : tipo,
      p_placa: esVacio ? null : placa,
      p_origen: esVacio ? null : origen,
      p_destino: esVacio ? null : destino,
      p_viajes: viajesN,
      p_vacio: esVacio,
      p_carga: esVacio || carga.trim() === "" ? null : Number(carga),
      p_unidad: null,
      p_nota: nota.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }

    avisar.bien(esVacio
      ? `${viajesN} viaje${viajesN === 1 ? "" : "s"} vacío${viajesN === 1 ? "" : "s"} en el turno ${turno}.`
      : adicionales === 0
        ? `${placa.toUpperCase()} registrado. El plan del turno ya lo cuenta.`
        : adicionales === viajesN
          ? `${placa.toUpperCase()} registrado como adicional. Va a salir en Control por encima del plan.`
          : `${placa.toUpperCase()} registrado: ${viajesN - adicionales} del plan y ${adicionales} adicional${adicionales === 1 ? "" : "es"}.`);

    /* SE LIMPIA LO DEL VIAJE Y SE DEJA LO DEL TURNO: quien registra
       varios seguidos del mismo tipo y la misma ruta no debería volver
       a escogerlos cada vez — es lo que hace que se dejen de registrar
       a media tarde. */
    setPlaca(""); setCarga(""); setNota(""); setViajesN(1);
    campoPlaca.current?.focus();
    router.refresh();
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
                      <input value={placaNueva} autoFocus autoComplete="off" spellCheck={false}
                             placeholder="ABC123" aria-label="Placa nueva"
                             onChange={(e) => setPlacaNueva(e.target.value)}
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
                                      + (tipo === p.tipo ? " on" : "")
                                      + (f === 0 ? " lleno" : "")}
                                    onClick={() => setTipo(p.tipo)}>
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
                                    className={tipo === t.clave ? "on" : ""}
                                    onClick={() => setTipo(t.clave)}>{t.nombre}</button>
                          ))}
                        </div>
                      )}

                      {/* SE DICE ANTES DE REGISTRAR, no después. Que un
                          viaje salga por encima del plan no es un error
                          —pasa todos los días— pero sí es algo que quien
                          lo registra tiene que saber que está haciendo. */}
                      {adicionales > 0 && (
                        <p className="guia adicional">
                          {adicionales === viajesN
                            ? <>Va como <b>adicional</b>: {linea ? "este tipo ya completó su plan del turno" : "no estaba en el plan del turno"}.</>
                            : <>Del plan caben <b>{faltan}</b>; {adicionales === 1 ? "el otro sale" : `los otros ${adicionales} salen`} como <b>adicional{adicionales === 1 ? "" : "es"}</b>.</>}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="chips">
                        {tipos.map((t) => (
                          <button key={t.clave} type="button"
                                  className={tipo === t.clave ? "on" : ""}
                                  onClick={() => setTipo(t.clave)}>{t.nombre}</button>
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

                  {/* LAS RUTAS QUE MÁS SE REPITEN. No son un maestro: es
                      una cuenta sobre los viajes ya registrados, así que
                      funciona desde el primer día y se afina sola. */}
                  {rutas.length > 0 && (
                    <div className="rutas-frec">
                      {rutas.map((r) => (
                        <button key={r.origen + r.destino} type="button"
                                onClick={() => { setOrigen(r.origen); setDestino(r.destino) }}>
                          {nombreBodega(puntos, r.origen)} → {nombreBodega(puntos, r.destino)}
                        </button>
                      ))}
                    </div>
                  )}

                  {puntosVivos.length === 0 && (
                    <p className="guia" style={{ marginTop: 10 }}>
                      Todavía no hay bodegas. Agrégalas aquí mismo con <b>Otra bodega…</b>, o
                      en <b>Maestro → Bodegas</b>.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="linea-campos">
              <div>
                <span className="rot-campo">
                  {modo === "vacio" ? "¿Cuántos viajes vacíos?" : "Cuántos viajes"}
                </span>
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
                    {modo === "vacio"
                      ? "No entran en el cumplido: cuestan igual y no mueven producto."
                      : "El plan se mide en viajes, no en canastas."}
                  </span>
                </div>
              </div>

              {modo === "carga" && (
                <div>
                  <span className="rot-campo">Cantidad (opcional)</span>
                  <input className="campo-suelto" value={carga} inputMode="numeric"
                         placeholder="Canastas, estibas…" aria-label="Cantidad"
                         onChange={(e) => setCarga(e.target.value.replace(/\D/g, ""))} />
                </div>
              )}
            </div>

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
                : !tipo ? (hayPlan ? "Escoge del plan" : "Falta el tipo")
                : !origen.trim() || !destino.trim() ? "Falta la ruta"
                /* El botón dice lo que va a pasar. "Registrar viaje" cuando
                   el viaje se sale del plan esconde justo lo que había que
                   avisar. */
                : adicionales === 0 ? "Registrar viaje"
                : adicionales === viajesN ? `Registrar ${viajesN === 1 ? "adicional" : `${viajesN} adicionales`}`
                : `Registrar (${adicionales} adicional${adicionales === 1 ? "" : "es"})`}
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
                        : `${v.tipo_nombre} · ${v.origen_nombre} → ${v.destino_nombre}`}
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

/** El nombre de una bodega a partir de su clave. Las rutas frecuentes
 *  vienen de la base con claves; la pantalla muestra nombres. */
function nombreBodega(puntos: Punto[], clave: string) {
  return puntos.find((p) => p.clave === clave)?.nombre ?? clave;
}
