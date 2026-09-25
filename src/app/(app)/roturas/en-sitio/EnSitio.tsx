"use client";

import { useEffect, useRef, useState } from "react";
import type { Area, Causa, Material, Proceso, Rotura } from "@/modulos/roturas/datos";
import { FilaTabla } from "../comunes";
import { Evidencia } from "../Evidencia";
import { Reportar } from "../Reportar";

/**
 * EN SITIO — lo que se rompió, contado en UNIDADES.
 *
 * Esta pantalla no habla de kilos ni una sola vez, a propósito. En sitio
 * se cuentan unidades por causa y por proceso: contesta de quién fue y
 * de dónde salió. La salida pesa kilos de vidrio: contesta cuánto salió
 * por la puerta. Una botella de 330 y una de 750 pesan distinto, el
 * vidrio se acumula días antes de salir, y parte de lo que se pesa nunca
 * se contó aquí. Cuadrar las dos cifras sería inventar un factor de
 * conversión que no existe.
 */
export function EnSitio({ esperando: enEspera, roturas, nombres, materiales, materialesDe, materialesSinMarcar,
                          procesos, areas, causas, puedeEditar }: {
  /** Cuántas esperan el visto bueno de ABI. Para el contador de la
   *  cabecera, que solo se pinta cuando NO se está registrando. */
  esperando: number;
  roturas: Rotura[];
  nombres: Record<string, string>;
  materiales: Material[];
  /* DE DÓNDE SALEN los del desplegable. Si no salen del maestro de
     inventario, la pantalla lo DICE: callarlo es lo que hace que nadie
     corra el SQL nunca, y mientras tanto quien registra una rotura de
     un producto que no está en la lista corta la registra con otro. */
  materialesDe?: "inventario" | "sin_vista" | "vacia";
  /* LA VISTA LLEGÓ PERO NADIE ESTÁ MARCADO como «en sitio». El
     desplegable vuelve a abrir con los cuatrocientos y pico, igual
     que antes del cambio, y desde la pantalla no se distingue de que
     el cambio no se hizo. */
  materialesSinMarcar?: boolean;
  procesos: Proceso[];
  areas: Area[];
  causas: Causa[];
  puedeEditar: boolean;
}) {
  /* LA PANTALLA SE LLAMA «REGISTRAR», ASÍ QUE ABRE REGISTRANDO.

     «Si yo selecciono En sitio, de una debería salir el formulario para
     registrar, pero sale esa pantalla.» Tenía razón, y el nombre lo
     decía: en el menú esta pantalla se llama Registrar —no «Ver
     roturas»—. Entrar a Registrar y encontrarse una lista, con el
     formulario escondido detrás de un botón flotante, es cobrarle un
     toque a la única cosa por la que se entra.

     Quien solo viene a mirar lo cierra con Cancelar y queda la lista,
     con el «+» ahí mismo para volver a abrirlo. A quien no puede
     editar no se le abre nada: para esa persona esto SÍ es una
     pantalla de consulta. */
  const [reportando, setReportando] = useState(puedeEditar);

  /* AL ABRIRLO SE VA A ÉL —pero no al cargar la pantalla—. Metido
     dentro de la página, el formulario puede quedar fuera de la vista
     si la persona estaba mirando la lista: se tocaría el «+» y no
     pasaría nada visible. Al entrar no se desplaza nada: ya está
     arriba, y saltar solo al llegar se siente como un error. */
  const caja = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    if (reportando) caja.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [reportando]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [f, setF] = useState({ estado: "", grupo: "", proceso: "", texto: "" });

  /* LAS CUATRO CIFRAS DE ARRIBA FILTRAN.
     Antes solo informaban: se leía «2 esperan visto bueno» y para ver
     CUÁLES había que bajar a los desplegables y armar el mismo filtro a
     mano. Una cifra que dice cuántas hay y no lleva a ellas obliga a
     buscarlas dos veces.
     Se apaga tocándola otra vez, y «Quitar filtros» la apaga también:
     un filtro que no se ve dónde se quita es un filtro que se queda
     puesto y hace pensar que se perdieron registros. */
  const [foco, setFoco] = useState("");
  const tocarFoco = (v: string) => setFoco((a) => (a === v ? "" : v));

  const lista = roturas.filter((r) => {
    if (f.estado && r.estado !== f.estado) return false;
    if (!f.estado && r.estado === "anulada") return false;
    if (f.grupo && r.grupo !== f.grupo) return false;
    if (f.proceso && r.proceso !== f.proceso) return false;
    /* EL FOCO SE SUMA A LO DEMÁS, no lo reemplaza. Si la combinación no
       deja ninguna, el cartel de abajo ya dice que es por los filtros.
       Las anuladas nunca entran al foco: las cuatro cifras se cuentan
       sobre las vivas, y que el filtro trajera una anulada haría que la
       lista no cuadrara con el número que se acaba de tocar. */
    if (foco) {
      if (r.estado === "anulada") return false;
      if (foco === "esperando" && !r.esperando) return false;
      if (foco === "sin_foto" && !r.le_falta_foto) return false;
      if (foco === "no_asumida" && r.grupo !== "no_asumida") return false;
      if (foco === "cuentan" && !r.cuenta) return false;
    }
    const q = f.texto.trim().toLowerCase();
    if (q && !(r.codigo + " " + r.material_nombre + " " + r.causa_nombre + " " + r.proceso_nombre)
      .toLowerCase().includes(q)) return false;
    return true;
  });

  /* LO DE HOY, para el panel de la derecha. Se cuenta por el día de
     Barranquilla y no por el del navegador: la app se abre desde
     teléfonos que a veces vienen con otra zona puesta, y un «hoy» que
     cambia según el aparato es peor que no tener el dato. */
  const hoyBog = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const deHoy = roturas.filter((r) =>
    new Date(Date.parse(r.reportada_en) - 5 * 3600_000).toISOString().slice(0, 10) === hoyBog
    && r.estado !== "anulada");
  const vidrioHoy = deHoy.reduce((s, r) => s + r.unidades_vidrio, 0);
  /* Lo que está trancado en la bandeja de ABI. Va en la tarjeta oscura
     del panel: es otra cifra que la de hoy, no la misma dicha dos
     veces. */
  const esperandoLista = roturas.filter((r) => r.esperando);
  const sinFotoEsperando = esperandoLista.filter((r) => r.le_falta_foto).length;
  const hora = (s: string) =>
    new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  const vivas = roturas.filter((r) => r.estado !== "anulada");
  const esperando = vivas.filter((r) => r.esperando).length;
  const sinFoto = vivas.filter((r) => r.le_falta_foto).length;
  const noAsumidas = vivas.filter((r) => r.grupo === "no_asumida").length;
  const vidrio = vivas.filter((r) => r.cuenta)
    .reduce((s, r) => s + r.unidades_vidrio, 0);

  /* ---------------------------------------------------------------
     REGISTRANDO: LA PANTALLA ES EL FORMULARIO Y NADA MÁS.

     «El registro debe ser un solo módulo, no puede haber más cosas.»
     Antes el formulario salía ARRIBA y debajo seguía todo: el titular,
     el párrafo, las cuatro cifras, los filtros y la lista de lo
     registrado. Eso no es un formulario dentro de la pantalla: es un
     formulario encima de otra pantalla, que es justo lo que se vino a
     quitar. Quien entra a Registrar entra a registrar.

     Lo demás no se pierde: Cancelar cierra el formulario y ahí sí sale
     la pantalla de consulta —cifras, filtros y lista—, con el «+» para
     volver a registrar.
     --------------------------------------------------------------- */
  if (reportando) {
    return (
      /* EL MARCO LLEVA LA SEPARACIÓN. `.rt` es una columna con 16 px de
         hueco entre sus hijos, pero aquí sus hijos son UNO —este div—,
         así que la cabecera y la consola quedaban pegadas: el KPI y la
         tarjeta oscura del panel comparten la columna derecha y se
         leían como un solo bloque partido. «Quedó pegado.» */
      <div ref={caja} className="reg-marco">
        <section className="cabeza reg">
          <div>
            <p className="ojo">ROTURAS · EN SITIO · CD38 AG01</p>
            <h1>Registrar rotura</h1>
            <p className="sub">
              Lo que se rompió en la bodega, en unidades y con su causa. Es lo que contesta de
              quién fue y de dónde salió. Los kilos son otra cosa y viven en Salidas.
            </p>
          </div>
          <div className="kpi">
            <span className="corte" aria-hidden />
            <div className="rot">REGISTRADAS HOY</div>
            <div className="num">{deHoy.length}<span className="u">roturas</span></div>
            <div className="pie">{vidrioHoy} unidades de vidrio</div>
          </div>
        </section>

        {/* LA CONSOLA: el formulario a la izquierda y el contexto a la
            derecha, como en Traspasos.

            Esto NO es «más cosas» debajo del formulario —eso fue lo que
            se quitó—: es lo que hace falta PARA registrar. En Traspasos,
            a la derecha está el plan del turno y los viajes de hoy;
            aquí, cuánto se lleva roto hoy y las roturas de hoy. Sirve
            para lo mismo: saber si la que se está metiendo ya estaba, y
            ver subir el número al registrarla. */}
        <div className="consola">
          <div>
            {materialesDe && materialesDe !== "inventario" && (
              <div className="aviso rojo">
                <b>El desplegable de material no está saliendo del maestro de inventario.</b>{" "}
                {materialesDe === "sin_vista"
                  ? <>Falta correr <b>supabase/migraciones/2026-09-roturas-maestro-unico-y-opm.sql</b> en
                     el editor de SQL de Supabase. Se puede correr varias veces sin romper nada.</>
                  : <>El maestro de inventario no tiene ningún producto activo. Se revisa en
                     Inventario → Maestro.</>}{" "}
                Mientras tanto salen los {materiales.length} sembrados a mano, y una rotura de un
                producto que no esté en esa lista corta se va a registrar con otro.
              </div>
            )}

            {/* EL SQL DE LA LISTA CORTA TODAVÍA NO SE HA CORRIDO.
                No es rojo: aquí no hay nada roto ni nada que se vaya a
                registrar mal —salen todos los materiales, como siempre—.
                Lo único que pasa es que el desplegable no se acortó, y
                sin este renglón eso se ve EXACTAMENTE igual que si el
                cambio no se hubiera hecho. */}
            {materialesDe === "inventario" && materialesSinMarcar && (
              <div className="aviso">
                <b>El desplegable todavía abre con todos los materiales.</b>{" "}
                Ninguno está marcado como «se rompe en sitio», así que no hay lista corta que
                mostrar. Falta correr <b>supabase/migraciones/2026-09-material-en-sitio.sql</b> en
                el editor de SQL de Supabase —marca los 50 de una— o marcarlos a mano en
                Inventario → Maestro. Se puede correr varias veces sin romper nada.
              </div>
            )}

            <Reportar materiales={materiales} procesos={procesos} areas={areas} causas={causas}
                      cerrar={() => setReportando(false)} />
          </div>

          <aside>
            {/* LA TARJETA OSCURA DICE OTRA COSA QUE EL KPI DE ARRIBA.

                La primera versión ponía las dos con lo mismo —«0 roturas
                · 0 unidades de vidrio» arriba y «0 unidades de vidrio en
                0 roturas» abajo—, una pegada a la otra: se leían como un
                solo bloque partido en dos. En Traspasos no pasa porque
                el KPI cuenta EL DÍA y la tarjeta cuenta EL TURNO: son
                dos cifras distintas.

                Aquí el KPI cuenta lo de hoy y la tarjeta cuenta lo que
                está trancado: lo que ABI todavía no ha resuelto. Es la
                que de verdad hace falta mientras se registra, porque es
                la que dice si se está acumulando trabajo pendiente. */}
            <div className="hoy-cifra">
              <span className="corte" aria-hidden />
              <div className="rot">ESPERANDO VISTO BUENO</div>
              <div className="marca">
                <b>{enEspera}</b>
                <span>rotura{enEspera === 1 ? "" : "s"}</span>
              </div>
              {/* Un cuadro por rotura que espera, rojo las no asumidas.
                  Es la misma idea de los cuadros del plan en Traspasos:
                  «5 roturas, 2 no asumidas» se entiende leyendo; los
                  cuadros se entienden sin leer, que es lo que hace falta
                  a las cinco de la mañana. */}
              <div className="huecos">
                {esperandoLista.slice(0, 24).map((r) => (
                  <i key={r.id} className={r.grupo === "no_asumida" ? "mal" : "lleno"} />
                ))}
                {enEspera === 0 && <i />}
              </div>
              <div className="pie-cifra">
                {enEspera === 0
                  ? "ABI está al día: no hay nada esperando decisión."
                  : sinFotoEsperando > 0
                    ? `${sinFotoEsperando} de esas no tienen la foto que exigen: ABI las va a devolver.`
                    : "ABI decide si cuentan o no."}
              </div>
            </div>

            <div className="hoy">
              <div className="cab">
                <h3>Roturas de hoy</h3>
                <span className="cuantos">{deHoy.length} registradas</span>
              </div>
              {deHoy.length === 0 ? (
                <div className="vacio-hoy">
                  Todavía no se ha registrado nada hoy.<br />Lo que se registre aquí va saliendo.
                </div>
              ) : deHoy.slice(0, 8).map((r) => (
                <div key={r.id} className={"rota" + (r.estado === "anulada" ? " anulada" : "")}>
                  <span className="hora">{hora(r.reportada_en)}</span>
                  <span>
                    <b className="pl">{r.codigo}</b>
                    <span className="det">
                      {r.unidades} · {r.material_nombre} · {r.causa_nombre}
                    </span>
                  </span>
                  <span className={"pt" + (r.grupo === "no_asumida" ? " mal" : "")} aria-hidden />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="cabeza lista">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · CD38 AG01</p>
          <h1>Lo que se rompió</h1>
          {/* EL PÁRRAFO SE ACORTÓ A UN RENGLÓN. El largo explicaba por
              qué estas unidades no cuadran con los kilos de Salidas —el
              vidrio se acumula días antes de salir—, y eso sigue siendo
              cierto, pero es una explicación que se lee UNA vez y luego
              estorba todos los días encima de la lista. Vive en el
              manual; aquí queda la frase que ubica. */}
          <p className="sub corta">
            En unidades, por causa y por proceso. Los kilos van aparte, en Salidas.
          </p>
        </div>
        {/* ARRIBA EN PC, FLOTANTE EN CELULAR. Son el mismo botón en dos
            sitios según el ancho, nunca los dos a la vez: en pantalla
            grande el ojo arranca arriba a la derecha, y en el teléfono
            ahí no llega el pulgar sin reacomodar la mano. */}
        {puedeEditar && (
          <button type="button" className="btn oro solo-pc" onClick={() => setReportando(true)}>
            + Registrar rotura
          </button>
        )}
      </section>

      {/* ANTES ESTABA AQUÍ EL FORMULARIO Y NO VUELVE:

          esta es la pantalla de CONSULTA, y no lleva formulario.
          Registrar y mirar son dos cosas y ahora son dos pantallas de
          la misma ruta: el «+» de abajo lleva de esta a la otra. */}

      {/* SON BOTONES, NO RÓTULOS: cada cifra lleva a las suyas. Y llevan
          `aria-pressed` porque eso es lo que son —un interruptor que
          queda puesto—, no un enlace a otro sitio. */}
      <section className="cifras">
        <button type="button" aria-pressed={foco === "esperando"}
                className={"cifra ojo" + (foco === "esperando" ? " on" : "")}
                onClick={() => tocarFoco("esperando")}>
          <span className="rot">ESPERAN VISTO BUENO</span>
          <span className="n">{esperando}</span>
          <span className="u">ABI aún no decide</span>
        </button>
        <button type="button" aria-pressed={foco === "sin_foto"}
                className={"cifra" + (sinFoto ? " mal" : "") + (foco === "sin_foto" ? " on" : "")}
                onClick={() => tocarFoco("sin_foto")}>
          <span className="rot">SIN LA FOTO QUE EXIGEN</span>
          <span className="n">{sinFoto}</span>
          <span className="u">ABI las devuelve así</span>
        </button>
        <button type="button" aria-pressed={foco === "no_asumida"}
                className={"cifra" + (noAsumidas ? " mal" : "") + (foco === "no_asumida" ? " on" : "")}
                onClick={() => tocarFoco("no_asumida")}>
          <span className="rot">NO ASUMIDAS</span>
          <span className="n">{noAsumidas}</span>
          <span className="u">dicen que no fue del OL</span>
        </button>
        {/* ESTA CUENTA UNIDADES Y LAS DEMÁS CUENTAN ROTURAS, y por eso
            el pie lo dice: tocarla trae las roturas que hay detrás de
            esas unidades, que son menos renglones que el número. Sin esa
            línea, ver «100» y que salgan dos filas parece un error. */}
        <button type="button" aria-pressed={foco === "cuentan"}
                className={"cifra bien" + (foco === "cuentan" ? " on" : "")}
                onClick={() => tocarFoco("cuentan")}>
          <span className="rot">UNIDADES QUE CUENTAN</span>
          <span className="n">{vidrio}</span>
          <span className="u">vidrio con visto bueno</span>
        </button>
      </section>

      <div className="filtros">
        <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
          <option value="">Todas menos las anuladas</option>
          <option value="esperando">Esperando visto bueno</option>
          <option value="cuenta">Cuentan</option>
          <option value="no_cuenta">No cuentan</option>
          <option value="anulada">Anuladas</option>
        </select>
        <select value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })}>
          <option value="">Asumidas y no asumidas</option>
          <option value="asumida">Solo asumidas</option>
          <option value="no_asumida">Solo no asumidas</option>
        </select>
        <select value={f.proceso} onChange={(e) => setF({ ...f, proceso: e.target.value })}>
          <option value="">Todos los procesos</option>
          {procesos.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
        </select>
        <input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })}
               placeholder="Buscar código, material o causa" />
        {(f.estado || f.grupo || f.proceso || f.texto || foco) && (
          <button type="button" className="btn plano"
                  onClick={() => { setF({ estado: "", grupo: "", proceso: "", texto: "" }); setFoco("") }}>
            Quitar filtros
          </button>
        )}
      </div>

      {/* LA LISTA ES UNA TABLA, y el encabezado de columnas va UNA vez
          arriba y no repetido en cada fila: con treinta roturas, el ojo
          compara las cifras bajando en línea recta. En celular esas
          mismas columnas se apilan en tarjeta —ahí no hay treinta de un
          vistazo, hay una— y cada dato recupera su rótulo. */}
      <section className="tabla">
        <div className="tb-cab">
          <b>{lista.length} rotura{lista.length === 1 ? "" : "s"}</b>
          <span><i aria-hidden />no asumida · la más reciente arriba</span>
        </div>

        <div className="tb-cols" aria-hidden>
          <div>CÓDIGO</div><div>FOTO</div><div>PRODUCTO · CAUSA</div><div>UNIDADES</div>
          <div>PROCESO</div><div>REGISTRÓ</div><div>ESTADO</div><div />
        </div>

        {lista.length === 0 && (
          <div className="vacio">
            <b>Nada por aquí</b>
            {roturas.length
              ? "Con estos filtros no queda ninguna. «Quitar filtros» las trae todas de vuelta."
              : "Todavía no se ha registrado nada. El botón de registrar abre el formulario."}
          </div>
        )}

        {lista.map((r) => (
          <FilaTabla key={r.id} r={r} nombres={nombres}
                derecha={
                  <button type="button" className="btn"
                          onClick={() => setAbierta(abierta === r.id ? null : r.id)}>
                    {abierta === r.id ? "Cerrar" : "Ver"}
                  </button>
                }>
            {r.nota_decision && <div className="tf-nota">ABI dijo: {r.nota_decision}</div>}
            {abierta === r.id && <Evidencia id={r.id} />}
          </FilaTabla>
        ))}
      </section>

      {/* EL «+» SE ESCONDE MIENTRAS SE REGISTRA. Flota encima de la
          pantalla, y con el formulario abierto se le montaba a una de
          las causas: el dedo apuntaba a «Comportamiento del personal» y
          tocaba el botón de abrir otro registro. Además ya no ofrece
          nada — lo que abre ya está abierto.

          Y SOLO EN CELULAR: en PC el mismo botón está arriba a la
          derecha, con su nombre escrito. Dos caminos a lo mismo en la
          misma pantalla hacen dudar de si hacen lo mismo. */}
      {puedeEditar && !reportando && (
        <button type="button" className="mas solo-cel" onClick={() => setReportando(true)}
                aria-label="Registrar una rotura">+</button>
      )}
    </>
  );
}
