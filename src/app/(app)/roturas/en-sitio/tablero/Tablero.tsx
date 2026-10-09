"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { usePedirTexto } from "@/components/PedirTexto";
import type { Rotura } from "@/modulos/roturas/datos";
import { Evidencia } from "../../Evidencia";
import { etiquetaRotura, HORARIO_TURNO, TURNOS, turnoYDia, type Etiqueta } from "@/modulos/roturas/cierre";
import { Cierre } from "./Cierre";
import { Rango, type Dia } from "../../../sider/seguimiento/Rango";

/**
 * EL TABLERO — todos los registros, con su estado.
 *
 * «Que haya otra página donde pueda ver absolutamente todos los
 *  registros y sus estados; es como una tabla para borrar, eliminar y
 *  demás si el súper admin quiere.»
 *
 * ES UNA TABLA Y NO TARJETAS, al revés que las bandejas. La diferencia
 * no es de gusto: en una bandeja cada rotura es UNA DECISIÓN y se lee
 * de una en una —por eso allá son tarjetas—. Aquí se viene a BUSCAR
 * una entre trescientas, o a ver de un vistazo cuántas quedaron sin
 * origen. Para eso hace falta que las columnas se alineen, y eso solo
 * lo hace una tabla.
 *
 * LA COLUMNA QUE MANDA ES EL ESTADO, y por eso va en color y no en
 * texto gris: la pregunta de esta pantalla es «¿en qué quedó?».
 *
 * BORRAR Y ANULAR NO SON LO MISMO, y la pantalla no deja confundirlos:
 *   BORRAR  solo lo que nadie ha decidido todavía. Es el error de dedo
 *           del mismo día: se registró dos veces, o donde no era.
 *   ANULAR  todo lo demás. Deja la fila, el motivo y quién, porque una
 *           rotura que ya entró en la conciliación de alguien y luego
 *           desaparece es un mes que cambió sin dejar nada que mirar.
 * El botón de borrar NI APARECE en lo ya decidido — no está apagado
 * «por ahora», es que a eso no se le borra nunca.
 */

const dma = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" });
const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const pelado = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** EL ESTADO SE TRADUCE EN UN SOLO SITIO —`etiquetaRotura`, en el módulo
 *  del cierre—: el tablero, la ficha del cierre y el PDF lo llaman igual.
 *  Tres pantallas poniéndole nombre por su cuenta son tres sitios donde
 *  se puede llamar distinto a lo mismo. */
const etiquetaDe = (r: Rotura): Etiqueta => etiquetaRotura(r);

export function Tablero({ roturas, nombres, manda }: {
  roturas: Rotura[];
  nombres: Record<string, string>;
  manda: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const [pedirTexto, cuadro] = usePedirTexto();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "espera_ol" | "desacuerdo" | "cobro" | "anulada">("todas");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  /* EL DÍA Y EL TURNO. El turno no se guarda en la rotura: sale de la hora
     en que se registró (ver `modulos/roturas/cierre.ts`), con el mismo
     horario de Traspasos. Vacíos = sin filtrar. */
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [turnos, setTurnos] = useState<string[]>([]);
  const [cierre, setCierre] = useState(false);

  const q = pelado(busca.trim());
  /* LO QUE PASÓ POR EL ESTADO Y LA BÚSQUEDA, sin día ni turno. Es lo que
     recibe el cierre: él aplica el día y el turno por su cuenta porque,
     con el rango puesto, tiene que enseñar también los turnos en cero. */
  const porEstado = useMemo(() => {
    const base = filtro === "todas" ? roturas
      : filtro === "anulada" ? roturas.filter((r) => r.estado === "anulada")
      : roturas.filter((r) => r.estado !== "anulada" && r.etapa === filtro);
    if (!q) return base;
    return base.filter((r) => pelado(
      `${r.codigo} ${r.material_nombre} ${r.causa_nombre} ${r.proceso_nombre} ${r.area_nombre ?? ""} ${nombres[r.reportada_por ?? ""] ?? ""}`
    ).includes(q));
  }, [roturas, filtro, q, nombres]);

  const vistas = useMemo(() => {
    if (!desde && !hasta && turnos.length === 0) return porEstado;
    return porEstado.filter((r) => {
      const { turno, dia } = turnoYDia(r.reportada_en);
      return (!turnos.length || turnos.includes(turno))
        && (!desde || dia >= desde) && (!hasta || dia <= hasta);
    });
  }, [porEstado, desde, hasta, turnos]);

  /* LOS DÍAS CON ALGO, para apagar los vacíos del calendario: son los días
     (de turno: el C de las 22:00 es del día siguiente) de lo registrado. */
  const diasConDatos = useMemo<Dia[]>(() => {
    const n = new Map<string, number>();
    for (const r of roturas) { const d = turnoYDia(r.reportada_en).dia; n.set(d, (n.get(d) ?? 0) + 1) }
    return [...n].map(([fecha, viajes]) => ({ fecha, hl_zlde: 0, viajes }));
  }, [roturas]);

  const hayDiaTurno = Boolean(desde || hasta || turnos.length);
  const alTurno = (t: string) =>
    setTurnos((p) => (p.includes(t) ? p.filter((x) => x !== t) : TURNOS.filter((x) => x === t || p.includes(x))));
  /* LOS FILTROS EN PALABRAS: van en la ficha y en el pie de cada hoja del
     PDF. Un cierre filtrado que no lo diga se lee como el día entero. */
  const filtrosTxt = [
    filtro !== "todas" && `Estado: ${({ espera_ol: "esperan al OL", desacuerdo: "en desacuerdo", cobro: "a cobro", anulada: "anuladas" } as Record<string, string>)[filtro]}`,
    busca.trim() && `Búsqueda «${busca.trim()}»`,
    turnos.length > 0 && turnos.length < 3 && `Turno${turnos.length > 1 ? "s" : ""} ${turnos.join(" y ")}`,
  ].filter(Boolean).join(" · ");

  const cuenta = (f: typeof filtro) =>
    f === "todas" ? roturas.length
      : f === "anulada" ? roturas.filter((r) => r.estado === "anulada").length
      : roturas.filter((r) => r.estado !== "anulada" && r.etapa === f).length;

  /* SIN ORIGEN es un hueco que hay que ir a completar, no un error que
     se pueda esconder: sin él, el informe oculto no puede decir quién
     vio la rotura. */
  const sinOrigen = roturas.filter((r) => r.estado !== "anulada" && !r.ol_respuesta
    && (r as { sin_origen?: boolean }).sin_origen).length;

  async function anular(r: Rotura) {
    /* NADA DE `window.prompt()`. Salía con «cd-control-one.vercel.app
       dice» encima, en gris, con un campo pelado y con los botones del
       navegador: enseñar eso en una reunión parece que la aplicación se
       rompió. Y peor que feo — el navegador puede ofrecer «no permitir
       más cuadros de este sitio», y desde ahí anular deja de funcionar
       EN SILENCIO. */
    const motivo = await pedirTexto({
      titulo: `¿Anular ${r.codigo}?`,
      dice: <>La fila <b>se queda</b> con el motivo y con quién la anuló, y deja de contar
             en los informes. Es lo que se hace con lo que de verdad pasó y ya no aplica.</>,
      rotulo: "Por qué se anula",
      marcador: "Queda escrito en la fila",
      confirmar: "Anular",
      minimo: 4,
      largo: true,
    });
    if (motivo === null) return;
    setMandando(true);
    const { error } = await supabase.rpc("rotura_anular", { p_id: r.id, p_motivo: motivo });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${r.codigo} quedó anulada. La fila se queda, con el motivo.`);
    router.refresh();
  }

  async function borrar(r: Rotura) {
    /* DOS CUADROS DISTINTOS PARA LA MISMA PALABRA, y la diferencia es
       real. Borrar lo que NADIE ha decidido es deshacer un error de
       dedo del mismo día: se pregunta y ya. Borrar algo que YA SE
       DECIDIÓ —o que el OL ya contestó— desaparece una cifra que puede
       estar dentro de un informe que alguien ya leyó, y no hay forma de
       saber después que estuvo ahí. Eso no se pide con un «¿seguro?»:
       se pide tecleando el código.

       LO DIGO AQUÍ PORQUE LO DIJE EN EL CHAT: esto es peor que anular.
       Anular deja la fila, el motivo y quién; borrar no deja nada. */
    const virgen = r.estado === "esperando" && !r.ol_respuesta;
    let motivo: string | null = null;

    if (virgen) {
      if (!(await pedir({
        titulo: `¿Borrar ${r.codigo}?`,
        dice: "Borrar es para el error de dedo del mismo día: se registró dos veces, o donde " +
              "no era. Si de verdad pasó y ya no aplica, se ANULA — así queda la fila y el " +
              "motivo. Esto no se puede deshacer.",
        confirmar: "Borrar",
        peligro: true,
      }))) return;
    } else {
      const razon = await pedirTexto({
        titulo: `¿Borrar ${r.codigo}, que ya se decidió?`,
        dice: <>Esta rotura ya tiene decisión ({etiquetaDe(r).txt.toLowerCase()}) y sus{" "}
               <b>{r.unidades} unidades</b> pueden estar dentro de un informe que alguien
               ya leyó. Borrarla <b>no deja rastro</b>: después no hay forma de saber que
               estuvo. Si lo que quieres es que deje de contar, <b>anúlala</b> — eso deja
               la fila, el motivo y tu nombre.</>,
        rotulo: "Por qué se borra",
        marcador: "Queda en el registro de la plataforma, no en la fila",
        confirmar: "Borrar sin rastro",
        peligro: true,
        minimo: 8,
        largo: true,
        /* TECLEAR EL CÓDIGO no es un obstáculo decorativo: es la
           diferencia entre borrar la fila que se quería y la de al
           lado. En una tabla de trescientas filas con el botón en la
           misma columna, eso pasa. */
        debesEscribir: r.codigo,
      });
      if (razon === null) return;
      motivo = razon;
    }

    setMandando(true);
    const { error } = await supabase.rpc("rotura_borrar", { p_id: r.id, p_motivo: motivo });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${r.codigo} se borró.`);
    router.refresh();
  }

  return (
    <>
      {avisos}{dialogo}{cuadro}

      <div className="filtros">
        {([["todas", "Todas"], ["espera_ol", "Esperan al OL"],
           ["desacuerdo", "En desacuerdo"], ["cobro", "A cobro"],
           ["anulada", "Anuladas"]] as const).map(([v, txt]) => (
          <button key={v} type="button" className={"btn" + (filtro === v ? " si" : "")}
                  onClick={() => setFiltro(v)}>
            {txt} <em className="tb-n">{cuenta(v)}</em>
          </button>
        ))}
        <input type="search" className="tb-busca" value={busca}
               onChange={(e) => setBusca(e.target.value)}
               placeholder="Buscar por código, material, causa, proceso o quién la reportó"
               aria-label="Buscar una rotura" />
      </div>

      {/* EL DÍA, EL TURNO Y EL CIERRE. Van aparte de los estados porque
          contestan otra pregunta: los chips dicen «en qué quedó»; esto
          dice «cuándo se registró». El botón abre la ficha con EXACTAMENTE
          lo que está filtrado aquí. */}
      <div className="filtros tb-cuando-fila" role="group" aria-label="Fecha y turno">
        <Rango rotulo="Fecha" clase="tb-campo sg-mes" desde={desde} hasta={hasta} dias={diasConDatos}
               alElegir={(d, h) => { setDesde(d); setHasta(h) }}
               alLimpiar={() => { setDesde(""); setHasta("") }} />
        <div className="tb-campo" role="group" aria-label="Turno">
          <span className="tb-rot">Turno</span>
          <div className="tb-turnos">
            {TURNOS.map((t) => (
              <button key={t} type="button" aria-pressed={turnos.includes(t)}
                      className={"tb-turno" + (turnos.includes(t) ? " on" : "")}
                      title={`Turno ${t} · ${HORARIO_TURNO[t]}`} onClick={() => alTurno(t)}>
                <b>{t}</b> <small>{HORARIO_TURNO[t]}</small>
              </button>
            ))}
          </div>
        </div>
        {hayDiaTurno && (
          <button type="button" className="tb-quitar" onClick={() => { setDesde(""); setHasta(""); setTurnos([]) }}>
            Quitar fecha y turno
          </button>
        )}
        <button type="button" className="btn si tb-cierre" onClick={() => setCierre(true)}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M7 3h8l4 4v14H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
          Cierre de turno
        </button>
      </div>

      {cierre && (
        <Cierre roturas={porEstado} nombres={nombres} desde={desde} hasta={hasta} turnos={turnos}
                filtros={filtrosTxt} cerrar={() => setCierre(false)} />
      )}

      {sinOrigen > 0 && (
        <div className="aviso">
          <b>{sinOrigen} sin origen.</b> No dicen si las reportó un OPM o si alguien se las
          encontró, así que el informe no puede decir quién las vio. Se completan abriendo
          cada una desde aquí.
        </div>
      )}

      <section className="caja">
        <div className="cab"><div>
          <h2>{vistas.length} de {roturas.length}</h2>
          <p>
            Todo lo registrado, con el estado en que quedó. Se busca aquí; las bandejas son
            para decidir, de una en una.
          </p>
        </div></div>

        {/* LA TABLA SE DESPLAZA SOLA A LO ANCHO y no arrastra la
            página: nueve columnas no caben en un teléfono, y una
            página que se mueve entera al deslizar es lo que hace que
            nadie la use de pie. */}
        <div className="tb-rueda">
          <table className="tb-tabla">
            <thead>
              <tr>
                {/* ROTAS Y CONTAMINADAS, EN DOS COLUMNAS Y NO EN UNA.
                    Una sola columna «Und.» enseñaba solo las rotas: se
                    registraban 200 rotas y 100 contaminadas y el tablero
                    decía 200. Las contaminadas SÍ estaban guardadas —en
                    el mismo renglón— pero no se veían en ninguna parte,
                    así que parecía que no se habían registrado.

                    Y van SEPARADAS, no sumadas: no cuestan lo mismo. La
                    rota pierde el líquido Y el envase; la contaminada
                    pierde solo el líquido, porque la botella queda
                    entera y vuelve. Sumarlas en una cifra sería perder
                    justo el dato con el que se cobra. */}
                <th>Código</th><th>Cuándo</th><th>Material</th>
                <th className="tb-num">Rotas</th>
                <th className="tb-num">Contam.</th>
                <th>Causa</th><th>Proceso</th><th>Quién</th>
                <th>Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {vistas.length === 0 && (
                <tr><td colSpan={10} className="tb-vacio">
                  {roturas.length === 0
                    ? "Todavía no hay roturas registradas."
                    : "Ninguna con ese filtro."}
                </td></tr>
              )}
              {vistas.map((r) => {
                const e = etiquetaDe(r);
                /* QUIEN MANDA PUEDE BORRAR CUALQUIERA. «El admin: yo
                   puedo editar, eliminar, anular, borrar.»

                   La versión anterior escondía el botón en todo lo ya
                   decidido, y estaba defendiendo algo real —borrar no
                   deja rastro— pero de la forma equivocada: un botón
                   que no existe no explica nada, así que la pantalla
                   contestaba «no» sin decir por qué ni ofrecer la
                   salida buena.

                   Ahora el botón está siempre para quien manda, y lo
                   que cambia es LO QUE CUESTA: lo que nadie decidió se
                   borra con un «¿seguro?»; lo ya decidido pide el
                   motivo Y teclear el código. La fricción está donde
                   está el riesgo, no en esconder la puerta. */
                const sePuedeBorrar = manda;
                return (
                  <tr key={r.id} className={r.estado === "anulada" ? "tb-anulada" : ""}>
                    <td className="tb-cod">
                      <button type="button" className="tb-link"
                              onClick={() => setAbierta(abierta === r.id ? null : r.id)}>
                        {r.codigo}
                      </button>
                    </td>
                    <td className="tb-cuando">
                      {dma(r.reportada_en)} <span>{hm(r.reportada_en)}</span>
                      <i className="tb-t" title={`Turno ${turnoYDia(r.reportada_en).turno}`}>{turnoYDia(r.reportada_en).turno}</i>
                    </td>
                    <td>{r.material_nombre}</td>
                    <td className="tb-num">{r.unidades}</td>
                    {/* EN EER NO HAY CONTAMINADAS: es envase vacío, no
                        hay líquido que se pueda contaminar. Un cero ahí
                        diría «se contaminaron cero» —un dato— y lo que
                        pasa es que la pregunta no aplica. */}
                    <td className={"tb-num" + (r.contaminadas ? " tb-cont" : "")}>
                      {r.tipo === "eer" ? <span className="tb-na">—</span> : (r.contaminadas ?? 0)}
                    </td>
                    <td className={r.grupo === "no_asumida" ? "tb-no" : ""}>{r.causa_nombre}</td>
                    <td>{r.proceso_nombre}</td>
                    <td>{nombres[r.reportada_por ?? ""] ?? "—"}</td>
                    <td><span className={"tb-eti " + e.clase}>{e.txt}</span></td>
                    <td className="tb-acc">
                      {/* ANULAR SOLO LO QUE NO ESTÉ YA ANULADO; BORRAR
                          hasta lo anulado, que es precisamente lo que
                          alguien querría sacar de la lista del todo. */}
                      {manda && r.estado !== "anulada" && (
                        <button type="button" className="btn" disabled={mandando}
                                onClick={() => anular(r)}>Anular</button>
                      )}
                      {sePuedeBorrar && (
                        <button type="button" className="btn mal" disabled={mandando}
                                onClick={() => borrar(r)}>Borrar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {abierta && vistas.some((r) => r.id === abierta) && (
                <tr className="tb-detalle">
                  <td colSpan={10}>
                    {(() => {
                      const r = vistas.find((x) => x.id === abierta)!;
                      return (
                        <div className="tb-ficha">
                          <div className="tb-datos">
                            <div><b>Área</b> {r.area_nombre ?? "—"}</div>
                            {/* LO QUE SE PERDIÓ Y LO QUE SE COBRA: cajas × unid. por caja × precio de la botella (v_roturas). */}
                            <div><b>Se perdió</b>{" "}
                              {`${r.unidades} caja${r.unidades === 1 ? "" : "s"} ${r.tipo === "eer" ? "de envase" : "rotas"}`
                                + (r.contaminadas ? ` y ${r.contaminadas} contaminada${r.contaminadas === 1 ? "" : "s"}` : "")
                                + (r.factor_caja ? ` · ${r.factor_caja} por caja` : " · sin unid. por caja en el maestro")}
                            </div>
                            <div><b>Cobro</b>{" "}
                              {r.cobro_total != null
                                ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(r.cobro_total))
                                : "sin precio o sin factor"}
                            </div>
                            <div><b>Fotos</b> {r.fotos}</div>
                            {r.ol_nota && <div><b>Dice el OL</b> «{r.ol_nota}»</div>}
                            {r.nota_decision && <div><b>Decisión</b> {r.nota_decision}</div>}
                            {r.motivo_anulacion && (
                              <div><b>Anulada porque</b> {r.motivo_anulacion}</div>
                            )}
                            {r.descripcion && <div><b>Qué pasó</b> {r.descripcion}</div>}
                          </div>
                          <Evidencia id={r.id} />
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

