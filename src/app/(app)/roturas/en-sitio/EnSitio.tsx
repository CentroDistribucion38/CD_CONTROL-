"use client";

import { useEffect, useRef, useState } from "react";
import type { Area, Causa, Material, Proceso, Rotura } from "@/modulos/roturas/datos";
import { Fila } from "../comunes";
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
export function EnSitio({ esperando: enEspera, roturas, nombres, materiales, procesos,
                          areas, causas, puedeEditar }: {
  /** Cuántas esperan el visto bueno de ABI. Para el contador de la
   *  cabecera, que solo se pinta cuando NO se está registrando. */
  esperando: number;
  roturas: Rotura[];
  nombres: Record<string, string>;
  materiales: Material[];
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

  const lista = roturas.filter((r) => {
    if (f.estado && r.estado !== f.estado) return false;
    if (!f.estado && r.estado === "anulada") return false;
    if (f.grupo && r.grupo !== f.grupo) return false;
    if (f.proceso && r.proceso !== f.proceso) return false;
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
  const noAsumidasHoy = deHoy.filter((r) => r.grupo === "no_asumida").length;
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
      <div ref={caja}>
        <section className="cabeza">
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
            <Reportar materiales={materiales} procesos={procesos} areas={areas} causas={causas}
                      cerrar={() => setReportando(false)} />
          </div>

          <aside>
            <div className="hoy-cifra">
              <span className="corte" aria-hidden />
              <div className="rot">UNIDADES DE VIDRIO HOY</div>
              <div className="marca">
                <b>{vidrioHoy}</b>
                <span>en {deHoy.length} rotura{deHoy.length === 1 ? "" : "s"}</span>
              </div>
              {/* Un cuadro por rotura de hoy, rojo las no asumidas. Es la
                  misma idea de los cuadros del plan en Traspasos: «2 de
                  10» se entiende leyendo; los cuadros se entienden sin
                  leer, que es lo que hace falta a las cinco de la
                  mañana. */}
              <div className="huecos">
                {deHoy.slice(0, 24).map((r) => (
                  <i key={r.id} className={r.grupo === "no_asumida" ? "mal" : "lleno"} />
                ))}
                {deHoy.length === 0 && <i />}
              </div>
              <div className="pie-cifra">
                {noAsumidasHoy > 0
                  ? `${noAsumidasHoy} de hoy se están dando por no asumidas: esas exigen foto.`
                  : "Ninguna de hoy se está dando por no asumida."}
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
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · CD38 AG01</p>
          <h1>Lo que se rompió</h1>
          <p className="sub">
            Se cuenta en unidades, por causa y por proceso: es lo que contesta de quién fue la
            rotura y de dónde salió. Los kilos son otra cosa y viven en Salidas —el vidrio se
            acumula días antes de salir y parte de lo que se pesa nunca se contó aquí—, así que
            las dos cifras no se cuadran entre sí a propósito.
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">ESPERANDO VISTO BUENO</div>
          <div className="num">{enEspera}<span className="u">roturas</span></div>
          <div className="pie">ABI decide si cuentan o no</div>
        </div>
      </section>

      {/* ANTES ESTABA AQUÍ EL FORMULARIO Y NO VUELVE:

          esta es la pantalla de CONSULTA, y no lleva formulario.
          Registrar y mirar son dos cosas y ahora son dos pantallas de
          la misma ruta: el «+» de abajo lleva de esta a la otra. */}

      <section className="cifras">
        <div className={"cifra" + (esperando ? " ojo" : "")}>
          <div className="rot">ESPERAN VISTO BUENO</div>
          <div className="n">{esperando}</div>
          <div className="u">ABI todavía no ha dicho si cuentan</div>
        </div>
        <div className={"cifra" + (sinFoto ? " mal" : "")}>
          <div className="rot">SIN LA FOTO QUE EXIGEN</div>
          <div className="n">{sinFoto}</div>
          <div className="u">ABI las va a devolver así</div>
        </div>
        <div className={"cifra" + (noAsumidas ? " mal" : "")}>
          <div className="rot">NO ASUMIDAS</div>
          <div className="n">{noAsumidas}</div>
          <div className="u">se está diciendo que no fueron del OL</div>
        </div>
        <div className="cifra bien">
          <div className="rot">UNIDADES DE VIDRIO</div>
          <div className="n">{vidrio}</div>
          <div className="u">de lo que ya cuenta. No son kilos: esto no se cuadra con la salida</div>
        </div>
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
        {(f.estado || f.grupo || f.proceso || f.texto) && (
          <button type="button" className="btn plano"
                  onClick={() => setF({ estado: "", grupo: "", proceso: "", texto: "" })}>
            Quitar filtros
          </button>
        )}
      </div>

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{lista.length} rotura{lista.length === 1 ? "" : "s"}</h2>
            <p>
              Lo más reciente primero. El filo rojo marca las no asumidas: las que dicen que la
              rotura no fue del OL, y que por eso hay que probar con foto.
            </p>
          </div>
        </div>

      </section>

      <div className="filas">
          {lista.length === 0 && (
            <div className="caja"><div className="vacio">
              <b>Nada por aquí</b>
              {roturas.length
                ? "Con estos filtros no queda ninguna."
                : "Todavía no se ha registrado nada. El botón + abre el registro."}
            </div></div>
          )}

          {lista.map((r) => (
            <Fila key={r.id} r={r} nombres={nombres}
                  derecha={
                    <button type="button" className="btn"
                            onClick={() => setAbierta(abierta === r.id ? null : r.id)}>
                      {abierta === r.id ? "Cerrar" : `Ver${r.fotos ? ` · ${r.fotos} foto${r.fotos === 1 ? "" : "s"}` : ""}`}
                    </button>
                  }>
              {r.nota_decision && (
                <div className="meta" style={{ marginTop: 4 }}>
                  <span>ABI dijo: {r.nota_decision}</span>
                </div>
              )}
              {abierta === r.id && <Evidencia id={r.id} />}
            </Fila>
          ))}
      </div>

      {/* EL «+» SE ESCONDE MIENTRAS SE REGISTRA. Flota encima de la
          pantalla, y con el formulario abierto se le montaba a una de
          las causas: el dedo apuntaba a «Comportamiento del personal» y
          tocaba el botón de abrir otro registro. Además ya no ofrece
          nada — lo que abre ya está abierto. */}
      {puedeEditar && !reportando && (
        <button type="button" className="mas" onClick={() => setReportando(true)}
                aria-label="Registrar una rotura">+</button>
      )}
    </>
  );
}
