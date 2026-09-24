"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { usePedirTexto } from "@/components/PedirTexto";
import { ListaMaestro } from "@/components/MaestroLista";
import type { TemaHallazgo } from "@/modulos/acciones/hallazgos";

/**
 * EL MAESTRO DE TEMAS DE ABI.
 *
 * LA MISMA LISTA QUE TRASPASOS Y ROTURAS, no una copia. `ListaMaestro`
 * se extrajo justamente para esto: tres maestros con el mismo aspecto
 * hoy y tres maestros distintos dentro de tres meses es lo que pasa
 * cuando se copian doscientas líneas. Aquí solo se cambia la palabra de
 * la cuenta —«hallazgo»— y de dónde salen los datos.
 *
 * ESTO NO PASA POR UNA FUNCIÓN DE LA BASE, sino por la tabla derecho.
 * La tabla de temas tiene su política de RLS atada a
 * `hallazgo_puede_editar()`, que es la misma regla que protege todo lo
 * demás de la rama: una función encima solo agregaría un sitio más
 * donde la regla se puede escribir distinta.
 *
 * BORRAR SOLO CUANDO NADIE LO USÓ. Con un hallazgo apuntando al tema,
 * la llave foránea lo impide de todos modos, pero el error de Postgres
 * —«violates foreign key constraint»— no le dice nada a quien está
 * mirando. Se decide antes, con la cuenta a la vista.
 */
export function Temas({ temas, uso, puedeEditar }: {
  temas: TemaHallazgo[];
  uso: Record<string, number>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const [pedirTexto, cuadro] = usePedirTexto();
  const [mandando, setMandando] = useState(false);
  const [nuevo, setNuevo] = useState("");

  /* LA CLAVE SE DERIVA DEL NOMBRE Y NO SE PIDE. Pedir dos campos para
     agregar «Ruido» es pedir que alguien invente una palabra en
     minúsculas sin tildes, y ahí es donde salen las claves con espacios
     que después no se pueden buscar. */
  function claveDe(nombre: string) {
    return nombre.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  }

  async function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const clave = claveDe(nombre);
    if (!clave) { avisar.mal("Ese nombre no deja armar una clave. Escribe al menos una letra."); return }
    if (temas.some((t) => t.clave === clave)) {
      avisar.mal(`Ya existe un tema con esa clave (${clave}).`); return;
    }
    setMandando(true);
    const orden = Math.max(0, ...temas.map((t) => t.orden ?? 0)) + 1;
    const { error } = await supabase.from("acciones_hallazgos_temas")
      .insert({ clave, nombre, orden });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    setNuevo("");
    avisar.bien(`«${nombre}» queda disponible al levantar un hallazgo.`);
    router.refresh();
  }

  async function prender(clave: string, activo: boolean) {
    setMandando(true);
    const { error } = await supabase.from("acciones_hallazgos_temas")
      .update({ activo }).eq("clave", clave);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    router.refresh();
  }

  async function renombrar(clave: string, nombre: string) {
    const nuevoNombre = await pedirTexto({
      titulo: "Renombrar el tema",
      dice: <>La clave <b>{clave}</b> no cambia: es con la que están guardados los hallazgos
        que ya existen. Solo cambia cómo se lee.</>,
      rotulo: "Nombre",
      marcador: nombre,
      confirmar: "Renombrar",
      minimo: 2,
    });
    if (!nuevoNombre) return;
    setMandando(true);
    const { error } = await supabase.from("acciones_hallazgos_temas")
      .update({ nombre: nuevoNombre.trim() }).eq("clave", clave);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien("Listo.");
    router.refresh();
  }

  async function borrar(clave: string, nombre: string) {
    const n = uso[clave] ?? 0;
    if (n > 0) {
      avisar.mal(`«${nombre}» lo usan ${n} hallazgo${n === 1 ? "" : "s"}. Desactívalo en vez ` +
                 "de borrarlo: apagar deja de ofrecerlo al levantar y no toca lo viejo.");
      return;
    }
    const si = await pedir({
      titulo: `¿Borrar «${nombre}»?`,
      dice: "Nadie lo ha usado, así que no se pierde nada. Si vuelve a hacer falta, se agrega otra vez.",
      confirmar: "Borrar",
      peligro: true,
    });
    if (!si) return;
    setMandando(true);
    const { error } = await supabase.from("acciones_hallazgos_temas").delete().eq("clave", clave);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`«${nombre}» ya no está.`);
    router.refresh();
  }

  /* UNA SOLA LLAMADA CON LA LISTA ENTERA, por lo mismo que en Roturas:
     arrastrar un renglón cambia la posición de todos los de abajo, y
     una llamada por renglón son diez formas de quedar a medias cuando
     se cae la red en la quinta. */
  async function ordenar(claves: string[]) {
    setMandando(true);
    const { error } = await supabase.from("acciones_hallazgos_temas").upsert(
      claves.map((clave, i) => {
        const t = temas.find((x) => x.clave === clave)!;
        return { clave, nombre: t.nombre, activo: t.activo, orden: i + 1 };
      }),
      { onConflict: "clave" });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    router.refresh();
  }

  return (
    <>
      {avisos}{dialogo}{cuadro}

      <section className="ml-caja">
        <div className="ml-cab">
          <h2>Temas del hallazgo <em>{temas.length}</em></h2>
          <p>
            De qué trata lo que se encontró: inocuidad, seguridad, 5S… <b>Es una tabla y no una
            lista escrita en el código</b>, así que el día que ABI llegue con un tema nuevo se
            agrega aquí y no esperando un despliegue. Desactivar deja de ofrecerlo al levantar y
            no toca los hallazgos viejos; borrar solo aparece cuando nadie lo ha usado nunca.
            <b> Se arrastra para cambiar el orden</b>, y ese es el orden en que salen al
            levantar: poner de primero el que más sale ahorra un desplazamiento por hallazgo.
          </p>
        </div>

        {puedeEditar && (
          <div className="hz-agregar">
            <input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar() } }}
              placeholder="Nombre del tema nuevo"
              maxLength={60}
              aria-label="Nombre del tema nuevo"
            />
            <button type="button" className="btn" onClick={agregar} disabled={mandando || !nuevo.trim()}>
              + Agregar
            </button>
          </div>
        )}

        {temas.length === 0 ? (
          <div className="vacio">
            <b>Vacío</b>
            {puedeEditar
              ? "Agrega el primero con el campo de arriba."
              : "Todavía no hay temas y no tienes permiso para agregarlos."}
          </div>
        ) : (
          <ListaMaestro
            unidad="hallazgo"
            puedeEditar={puedeEditar}
            mandando={mandando}
            sinUso={false}
            sinSub
            filas={temas.map((t) => ({
              clave: t.clave,
              nombre: t.nombre,
              sub: null,
              activo: t.activo,
              viajes: uso[t.clave] ?? 0,
            }))}
            alOrdenar={ordenar}
            alPrender={(c, a) => prender(c, !a)}
            alRenombrar={(c) => {
              const t = temas.find((x) => x.clave === c);
              if (t) renombrar(c, t.nombre);
            }}
            alBorrar={(c, n) => borrar(c, n)}
          />
        )}
      </section>
    </>
  );
}
