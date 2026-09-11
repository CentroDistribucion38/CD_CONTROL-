"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";

type Persona = {
  id: string; usuario: string | null; nombre: string | null;
  rol: string; recibe: boolean;
};

/**
 * QUIÉN RECIBE ACCIONES.
 *
 * La lista de asignar mostraba a TODOS los usuarios: el administrador,
 * la cuenta de la bodega, el operador de turno. A ninguno de esos se le
 * asigna una correctiva. Con cinco usuarios ya estorba; con veinte,
 * escoger al que es se vuelve buscar.
 *
 * ESTO NO ES UN PERMISO. Quien no esté marcado entra a la plataforma
 * igual y ve lo mismo: lo único que cambia es que no aparece en la
 * lista de a quién pasarle trabajo.
 *
 * SI NO HAY NADIE MARCADO APARECEN TODOS, y se dice con esas palabras.
 * Una lista vacía dejaría la pantalla de asignar sin nadie, y de ahí no
 * se sale: de la lista larga se sale escogiendo.
 */
export function QuienRecibe({ gente, todos, falta, puedeEditar }: {
  gente: Persona[];
  todos: boolean;
  falta: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [lista, setLista] = useState(gente);
  const [mandando, setMandando] = useState<string | null>(null);

  const marcados = lista.filter((p) => p.recibe).length;

  async function cambiar(p: Persona) {
    setMandando(p.id);
    const { error } = await supabase.rpc("accion_asignable", {
      p_id: p.id, p_recibe: !p.recibe,
    });
    setMandando(null);
    if (error) { avisar.mal(error.message); return }
    setLista(lista.map((x) => (x.id === p.id ? { ...x, recibe: !x.recibe } : x)));
    router.refresh();
  }

  return (
    <section className="caja">
      {avisos}
      <div className="cab">
        <div>
          <h2>¿Quién recibe acciones?</h2>
          <p>
            Solo los marcados salen en la lista de asignar. No es un permiso: quien no esté
            marcado entra igual y ve lo mismo, solo que no se le pasa trabajo desde aquí.
          </p>
        </div>
      </div>

      {falta ? (
        <div className="aviso" style={{ margin: 12 }}>
          Falta correr <code>supabase/migraciones/2026-09-quien-recibe-acciones.sql</code> en el
          SQL Editor de Supabase. Mientras tanto aparecen todos.
        </div>
      ) : (
        <>
          {todos && (
            <div className="aviso" style={{ margin: 12 }}>
              No hay nadie marcado, así que en asignar <b>aparecen todos</b>. Marca a quien
              responde por el centro y la lista se reduce a eso.
            </div>
          )}

          <div className="ac-defecto">
            {lista.map((p) => (
              <button key={p.id} type="button" disabled={!puedeEditar || mandando === p.id}
                      className={"ac-def-q" + (p.recibe ? " on" : "")}
                      onClick={() => cambiar(p)}>
                <span className="n">
                  {p.nombre || p.usuario}
                  {p.recibe && <b className="si"> ✓ recibe</b>}
                </span>
                <span className="c">{p.rol}</span>
              </button>
            ))}
          </div>

          {marcados > 0 && (
            <p className="guia" style={{ margin: "0 12px 12px" }}>
              {marcados === 1
                ? "Solo uno marcado: todas las acciones van a caer ahí."
                : `${marcados} marcados. En asignar salen solo ellos.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
