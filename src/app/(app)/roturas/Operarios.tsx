"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { Operario } from "@/modulos/roturas/datos";

/**
 * EL MAESTRO DE OPERARIOS OPM.
 *
 * «Colocaré el PIN a cada OPM, que ese será como la clave para que en el
 *  informe oculto tengamos hora, turno, fecha, nombre del operador. Todo
 *  eso lo traerá el PIN del operador, que estaría asociado en el
 *  maestro. Que a ellos no les aparezca, porque nos sirve para validar
 *  lo que están registrando.»
 *
 * NO SON USUARIOS DE LA APP. No entran, no tienen pantalla, no tienen
 * contraseña. Son cuatro dígitos que, delante de quien registra, traen
 * un nombre y un turno. Meterlos como usuarios sería crear cien cuentas
 * que nadie va a usar nunca.
 *
 * ESTA PANTALLA ES SOLO DE QUIEN MANDA, y no por costumbre: aquí se ven
 * los PIN. La base lo sostiene sola —`operarios_listar()` devuelve vacío
 * a quien no manda, y la tabla no se le da a la aplicación—, así que
 * esconder el menú es comodidad, no la protección.
 *
 * EL PIN SE VE EN CLARO, Y ES UNA DECISIÓN. Lo primero que uno piensa es
 * taparlo con puntitos; entonces el administrador no puede recordárselo
 * al operario que lo olvidó, que es media razón de existir del maestro.
 * Lo que sí protege es no dárselo a nadie más.
 *
 * NO HAY BORRAR. Un operario que ya reportó roturas no se puede quitar
 * sin dejar esas roturas apuntando a nadie; y uno que no reportó
 * ninguna, tampoco hace daño apagado. Se DESACTIVA: deja de servir el
 * PIN y las roturas viejas siguen diciendo quién las reportó.
 */

const VACIO = { pin: "", nombre: "", empresa: "Easy", turno: "", nota: "" };

type Fila = { nombre: string; turno: string; empresa: string; pin: string };
type Cargado = Fila & { estado: string };

/**
 * LEER LO QUE SE PEGÓ DE EXCEL.
 *
 * Excel copia con TABULADOR entre columnas y salto de línea entre
 * filas. También se acepta punto y coma —es lo que sale de un CSV
 * guardado en español— y, si no hay ninguno de los dos, la línea
 * entera es el nombre, que es el caso de pegar una sola columna.
 *
 * LA COMA NO SE PARTE, a propósito: «Padilla, Cristian» es un nombre
 * escrito al revés, no dos columnas, y partirlo ahí crearía dos
 * operarios de una persona.
 *
 * EL ORDEN ES NOMBRE · TURNO · EMPRESA, salvo que la primera columna
 * sean puros dígitos: entonces es PIN · NOMBRE · TURNO · EMPRESA. Se
 * puede distinguir sin adivinar porque un nombre nunca es solo
 * números — y por eso se acepta, en vez de obligarlo a reordenar el
 * Excel.
 *
 * NADA DE ESTO SE HACE A CIEGAS: lo leído se enseña en una tabla
 * antes de cargar. Es la única respuesta honesta a un formato que
 * llega como llegue.
 */
export function leerPegado(texto: string): Fila[] {
  const filas: Fila[] = [];
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    const cols = (/[\t;]/.test(linea) ? linea.split(/[\t;]/) : [linea])
      .map((c) => c.trim().replace(/\s+/g, " "));

    let pin = "";
    let resto = cols;
    if (/^\d{3,9}$/.test(cols[0] ?? "")) { pin = cols[0]; resto = cols.slice(1) }

    const nombre = resto[0] ?? "";
    if (!nombre) continue;
    /* UNA CABECERA PEGADA DE ARRASTRE NO ES UN OPERARIO. Copiar desde
       Excel con el título incluido es lo más normal del mundo. */
    if (/^(nombre|operario|nombres?|opm)$/i.test(nombre)) continue;

    filas.push({ nombre, turno: resto[1] ?? "", empresa: resto[2] ?? "", pin });
  }
  return filas;
}

export function Operarios({ lista, puedeEditar }: {
  lista: Operario[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();

  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(VACIO);
  const [mandando, setMandando] = useState(false);
  const [busca, setBusca] = useState("");

  /* PEGAR LA LISTA DE EXCEL. «Yo solo coloco los nombres: copio en
     Excel, pego allí, y de una genera los PIN.» */
  const [pegando, setPegando] = useState(false);
  const [pegado, setPegado] = useState("");
  const [cargado, setCargado] = useState<Cargado[] | null>(null);

  const pelado = (t: string) =>
    t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = pelado(busca.trim());
  const vistos = q
    ? lista.filter((o) => pelado(`${o.nombre} ${o.pin} ${o.empresa} ${o.turno ?? ""}`).includes(q))
    : lista;

  const activos = lista.filter((o) => o.activo).length;
  /* CUÁNTOS NO HAN REPORTADO NADA. Es la cifra que dice si el maestro
     se cargó y se usa, o si se cargó y ahí quedó: un PIN que nadie ha
     usado en un mes no es un operario, es una fila. */
  const mudos = lista.filter((o) => o.activo && o.roturas === 0).length;

  function abrirNuevo() { setF(VACIO); setNuevo(true); setEditando(null) }

  function abrirEditar(o: Operario) {
    setNuevo(false);
    setEditando(editando === o.id ? null : o.id);
    setF({ pin: o.pin, nombre: o.nombre, empresa: o.empresa,
           turno: o.turno ?? "", nota: o.nota ?? "" });
  }

  async function guardar(id: string | null, activo = true) {
    /* EL PIN YA VIENE LIMPIO, Y AQUÍ NO SE VUELVE A LIMPIAR. Había un
       `.replace(/\D/g, "")` en esta línea y EL ARNÉS DEMOSTRÓ QUE
       SOBRABA: el campo filtra al teclear, así que `f.pin` nunca tiene
       otra cosa que dígitos, y la mutación que rompía este segundo
       filtro salía VERDE —no cambiaba nada en ninguna prueba—.
       Se quitó en vez de dejarlo «por si acaso»: un filtro que nunca
       filtra hace creer que ahí hay una regla, y el día que alguien
       toque el campo de arriba va a confiar en una que no existe.
       El filtro vive en el `onChange`, que además es donde se ve: no
       se puede ni teclear una letra. */
    const pin = f.pin;
    /* SE DICE AQUÍ LO QUE LA BASE TAMBIÉN DICE. La función lo rechaza
       igual, pero «El PIN son de cuatro a ocho dígitos» llegando como
       error rojo después de guardar es peor que no dejar guardar. */
    if (!f.nombre.trim()) { avisar.mal("Falta el nombre: el PIN solo sirve para traerlo."); return }
    if (pin.length < 4 || pin.length > 8) { avisar.mal("El PIN son de cuatro a ocho dígitos."); return }
    /* Y EL REPETIDO SE VE ANTES DE MANDARLO: la base tiene el único
       índice de verdad, pero decirlo aquí evita el viaje y el error. */
    const choca = lista.find((o) => o.pin === pin && o.id !== id);
    if (choca) { avisar.mal(`Ese PIN ya es de ${choca.nombre}: dos con el mismo PIN no prueban nada.`); return }

    setMandando(true);
    const { error } = await supabase.rpc("operario_guardar", {
      p_id: id, p_pin: pin, p_nombre: f.nombre.trim(),
      p_empresa: f.empresa.trim() || "Easy",
      p_turno: f.turno.trim() || null, p_activo: activo,
      p_nota: f.nota.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(id ? "Guardado." : `${f.nombre.trim()} ya puede reportar con su PIN.`);
    setNuevo(false); setEditando(null); setF(VACIO);
    router.refresh();
  }

  async function alternar(o: Operario) {
    setMandando(true);
    const { error } = await supabase.rpc("operario_guardar", {
      p_id: o.id, p_pin: o.pin, p_nombre: o.nombre, p_empresa: o.empresa,
      p_turno: o.turno, p_activo: !o.activo, p_nota: o.nota,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(o.activo
      ? `${o.nombre} queda apagado: su PIN deja de servir y lo que reportó se queda.`
      : `${o.nombre} vuelve a poder reportar.`);
    router.refresh();
  }

  const leidas = leerPegado(pegado);
  /* LOS QUE YA ESTÁN SE MARCAN ANTES DE MANDAR NADA. La base los
     resuelve igual —devuelve el PIN que ya tenían—, pero verlo antes
     evita el susto de «pegué cien y solo entraron cuarenta». */
  const yaEstaba = (n: string) => lista.some((o) =>
    pelado(o.nombre).replace(/\s+/g, " ") === pelado(n).replace(/\s+/g, " "));
  const nuevos = leidas.filter((x) => !yaEstaba(x.nombre)).length;

  async function cargarLista() {
    if (!leidas.length) return;
    setMandando(true);
    const { data, error } = await supabase.rpc("operarios_cargar", {
      p_lista: leidas.map((x) => ({
        nombre: x.nombre, turno: x.turno || null,
        empresa: x.empresa || null, pin: x.pin || null,
      })),
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const r = (data ?? []) as Cargado[];
    setCargado(r);
    setPegado("");
    const n = r.filter((x) => x.estado === "nuevo").length;
    avisar.bien(n ? `${n} operario${n === 1 ? "" : "s"} con PIN nuevo.` : "No había ninguno nuevo.");
    router.refresh();
  }

  /* COPIAR LA LISTA CON LOS PIN. Sin esto, la pantalla acaba de
     generar cien números que hay que repartir y no hay forma de
     sacarlos: tocaría teclearlos a mano uno por uno mirando la
     pantalla. Se copia con tabulador, que es lo que Excel pega en
     columnas. */
  async function copiarPines(filas: Cargado[]) {
    const txt = ["PIN\tNombre\tTurno\tEmpresa",
      ...filas.filter((x) => x.estado === "nuevo" || x.estado === "ya estaba")
              .map((x) => [x.pin, x.nombre, x.turno ?? "", x.empresa ?? ""].join("\t"))].join("\n");
    try {
      await navigator.clipboard.writeText(txt);
      avisar.bien("Copiado. Se pega en Excel y cae en columnas.");
    } catch {
      /* SIN PORTAPAPELES NO SE PIERDE LA LISTA. El navegador lo niega
         sin https o sin permiso, y ahí lo peor sería un aviso de
         error y unos PIN que ya no se pueden sacar. */
      avisar.mal("El navegador no dejó copiar. La lista está abajo: se puede seleccionar a mano.");
    }
  }

  /* BORRAR ES PARA EL ERROR DE DEDO, y solo para eso: se cargó la lista
     dos veces, o se creó uno de prueba. Al que YA REPORTÓ no se le
     ofrece —el botón no está—, porque borrarlo dejaría esas roturas sin
     quién las vio. Ese se apaga: el PIN deja de servir y lo que reportó
     se queda diciendo su nombre.

     NO SE OFRECE Y ADEMÁS LA BASE LO FRENA. Que el botón no esté es
     comodidad; la regla vive en `operario_borrar`. */
  async function borrar(o: Operario) {
    if (!(await pedir({
      titulo: `¿Borrar a ${o.nombre}?`,
      dice: "No ha reportado ninguna rotura, así que no se pierde nada. " +
            "Su PIN queda libre para otra persona. Esto no se puede deshacer.",
      confirmar: "Borrar",
      peligro: true,
    }))) return;
    setMandando(true);
    const { error } = await supabase.rpc("operario_borrar", { p_id: o.id });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${o.nombre} se borró.`);
    router.refresh();
  }

  const formulario = (
    <div className="panel">
      <label htmlFor="op-pin">PIN — de cuatro a ocho dígitos</label>
      {/* `type="text"` con teclado numérico: con `type="number"` el
          navegador se come los ceros de adelante y «0412» se guarda
          como «412», que es un PIN distinto y nadie lo va a notar
          hasta que el operario no pueda reportar. */}
      <input id="op-pin" type="text" inputMode="numeric" maxLength={8} value={f.pin}
             onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
             placeholder="4021" />
      <label htmlFor="op-nom">Nombre completo</label>
      <input id="op-nom" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })}
             placeholder="Genesis Visbal" />
      <label htmlFor="op-emp">Empresa</label>
      <input id="op-emp" value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })}
             placeholder="Easy" />
      <label htmlFor="op-tur">Turno — se puede dejar vacío</label>
      <input id="op-tur" value={f.turno} onChange={(e) => setF({ ...f, turno: e.target.value })}
             placeholder="B" />
      <label htmlFor="op-nota">Nota — para quien administre esto después</label>
      <input id="op-nota" value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })}
             placeholder="Entró en septiembre" />

      <div className="acciones-panel">
        <button type="button" className="btn si" disabled={mandando}
                onClick={() => guardar(editando,
                  editando ? (lista.find((o) => o.id === editando)?.activo ?? true) : true)}>
          {mandando ? "Guardando…" : editando ? "Guardar" : "Agregar"}
        </button>
        <button type="button" className="btn plano"
                onClick={() => { setNuevo(false); setEditando(null) }}>
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <>
      {avisos}{dialogo}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{activos} {activos === 1 ? "operario" : "operarios"} con PIN</h2>
            <p>
              El PIN se teclea al registrar una rotura y trae el nombre, el turno y la hora.
              No es una clave de la aplicación: con él no se entra a nada.
              {mudos > 0 && ` ${mudos} todavía no ha${mudos === 1 ? "" : "n"} reportado ninguna.`}
            </p>
          </div>
          {puedeEditar && !nuevo && !pegando && (
            <div className="par">
              {/* PEGAR LA LISTA VA DE PRIMERO Y ES EL BOTÓN LLENO: es lo
                  que se hace UNA VEZ con los cien operarios, y agregar
                  de a uno es lo de después, cuando entra alguien. */}
              <button type="button" className="btn si"
                      onClick={() => { setPegando(true); setCargado(null) }}>
                Pegar lista de Excel
              </button>
              <button type="button" className="btn" onClick={abrirNuevo}>+ Agregar uno</button>
            </div>
          )}
        </div>

        {nuevo && <div style={{ padding: 12 }}>{formulario}</div>}

        {pegando && (
          <div className="panel op-pegar">
            <label htmlFor="op-pegado">
              Pega aquí los nombres — uno por línea, tal como salen de Excel
            </label>
            <textarea id="op-pegado" rows={7} value={pegado} autoFocus
                      onChange={(e) => setPegado(e.target.value)}
                      placeholder={"Genesis Visbal\nJose Palacio\nMarta Ospino"} />
            <p className="op-como">
              Solo los nombres basta: el PIN lo pone el sistema, distinto para cada uno.
              Si tu Excel tiene más columnas, el orden es <b>Nombre · Turno · Empresa</b>;
              y si la primera columna son puros números, se lee como <b>PIN · Nombre · Turno · Empresa</b>.
              Lo que se lea se ve abajo antes de cargar nada.
            </p>

            {leidas.length > 0 && (
              <>
                <div className="op-cuenta">
                  <b>{leidas.length}</b> {leidas.length === 1 ? "línea leída" : "líneas leídas"}
                  {nuevos !== leidas.length && (
                    <span> · {nuevos} {nuevos === 1 ? "nuevo" : "nuevos"},{" "}
                      {leidas.length - nuevos} ya {leidas.length - nuevos === 1 ? "está" : "están"} en el maestro
                    </span>
                  )}
                </div>
                {/* LO LEÍDO SE VE ANTES DE CARGARLO. Es la única
                    respuesta honesta a un pegado que llega como
                    llegue: no se adivina en silencio, se enseña. */}
                <div className="op-previa">
                  <table>
                    <thead>
                      <tr><th>Nombre</th><th>Turno</th><th>Empresa</th><th>PIN</th></tr>
                    </thead>
                    <tbody>
                      {leidas.slice(0, 60).map((x, i) => (
                        <tr key={i} className={yaEstaba(x.nombre) ? "op-repe" : ""}>
                          <td>{x.nombre}</td>
                          <td>{x.turno || <em>—</em>}</td>
                          <td>{x.empresa || <em>Easy</em>}</td>
                          <td>{x.pin || <em>lo pone el sistema</em>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {leidas.length > 60 && (
                    <p className="op-mas">y {leidas.length - 60} más, que también se cargan</p>
                  )}
                </div>
              </>
            )}

            <div className="acciones-panel">
              <button type="button" className="btn si" disabled={mandando || !leidas.length}
                      onClick={cargarLista}>
                {mandando ? "Cargando…"
                  : !leidas.length ? "Pega la lista arriba"
                  : `Cargar ${leidas.length}`}
              </button>
              <button type="button" className="btn plano"
                      onClick={() => { setPegando(false); setPegado("") }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* EL RESULTADO, CON LOS PIN A LA VISTA Y COPIABLES. La pantalla
            acaba de sortear cien números que hay que repartir: si no se
            pueden sacar de aquí, hay que teclearlos a mano mirando la
            lista. */}
        {cargado && cargado.length > 0 && (
          <div className="panel op-hecho">
            <div className="op-cuenta">
              <b>{cargado.filter((x) => x.estado === "nuevo").length}</b> con PIN nuevo
              {cargado.some((x) => x.estado !== "nuevo") && (
                <span> · {cargado.filter((x) => x.estado === "ya estaba").length} ya estaban
                  {cargado.some((x) => x.estado !== "nuevo" && x.estado !== "ya estaba") &&
                    ` · ${cargado.filter((x) => x.estado !== "nuevo" && x.estado !== "ya estaba").length} con problema`}
                </span>
              )}
            </div>
            <div className="op-previa">
              <table>
                <thead><tr><th>PIN</th><th>Nombre</th><th>Turno</th><th></th></tr></thead>
                <tbody>
                  {cargado.map((x, i) => (
                    <tr key={i} className={x.estado === "nuevo" ? "" : "op-repe"}>
                      <td className="op-pin">{x.pin}</td>
                      <td>{x.nombre}</td>
                      <td>{x.turno || <em>—</em>}</td>
                      <td><span className="eti">{x.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="acciones-panel">
              <button type="button" className="btn si" onClick={() => copiarPines(cargado)}>
                Copiar los PIN
              </button>
              <button type="button" className="btn plano" onClick={() => setCargado(null)}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* BUSCAR, PORQUE ESTO SE CARGA DE A CIEN. Un maestro de siete
            filas no lo necesita; uno de operarios de un centro de
            distribución sí, y el día que haga falta nadie va a volver
            a abrir este archivo. */}
        {lista.length > 8 && (
          <div style={{ padding: "10px 12px 0" }}>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
                   className="op-busca" placeholder="Buscar por nombre, PIN o turno"
                   aria-label="Buscar un operario" />
          </div>
        )}

        <div className="rueda">
          {lista.length === 0 && (
            <div className="vacio">
              <b>Todavía no hay operarios</b>
              Mientras esté vacío, en Registrar solo se puede decir «me la encontré»: no hay
              ningún PIN que reconocer.
            </div>
          )}
          {lista.length > 0 && vistos.length === 0 && (
            <div className="vacio"><b>Ninguno dice «{busca}»</b>Prueba con otra parte del nombre.</div>
          )}
          {vistos.map((o) => (
            <div key={o.id} className={"fila" + (o.activo ? "" : " gris")}>
              {/* EL PIN VA EN LA COLUMNA DEL CÓDIGO: es lo que se
                  teclea, así que es lo que se viene a buscar aquí. */}
              <div className="cod op-pin">{o.pin}</div>
              <div>
                <div className="tit">{o.nombre}</div>
                <div className="meta">
                  <span>{o.empresa}</span>
                  {o.turno && <><span>·</span><span>turno {o.turno}</span></>}
                  <span>·</span>
                  <span>{o.roturas === 0 ? "sin roturas reportadas" : `${o.roturas} reportada${o.roturas === 1 ? "" : "s"}`}</span>
                  {!o.activo && <><span>·</span><span className="eti">APAGADO</span></>}
                  {o.nota && <><span>·</span><span>{o.nota}</span></>}
                </div>
                {editando === o.id && formulario}
              </div>
              <div className="der">
                {puedeEditar && (
                  <div className="par">
                    <button type="button" className="btn" onClick={() => abrirEditar(o)}>
                      {editando === o.id ? "Cerrar" : "Editar"}
                    </button>
                    <button type="button" className="btn" disabled={mandando}
                            onClick={() => alternar(o)}>
                      {o.activo ? "Apagar" : "Encender"}
                    </button>
                    {/* BORRAR SOLO AL QUE NO HA REPORTADO NADA. Al que
                        sí, el botón ni aparece: no es que esté apagado
                        «por ahora», es que a ese no se le borra nunca. */}
                    {o.roturas === 0 && (
                      <button type="button" className="btn mal" disabled={mandando}
                              onClick={() => borrar(o)}>
                        Borrar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
