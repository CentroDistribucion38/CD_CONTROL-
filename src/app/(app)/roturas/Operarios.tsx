"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
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

export function Operarios({ lista, puedeEditar }: {
  lista: Operario[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(VACIO);
  const [mandando, setMandando] = useState(false);
  const [busca, setBusca] = useState("");

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
      {avisos}

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
          {puedeEditar && !nuevo && (
            <button type="button" className="btn si" onClick={abrirNuevo}>+ Agregar</button>
          )}
        </div>

        {nuevo && <div style={{ padding: 12 }}>{formulario}</div>}

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
