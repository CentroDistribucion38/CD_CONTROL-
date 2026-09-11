"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Carga } from "@/modulos/acciones/datos";

/**
 * A QUIÉN NACE ASIGNADA UNA ACCIÓN NUEVA.
 *
 * Quien reporta casi siempre le pasa la acción al mismo: el operador
 * logístico que responde por el centro. Escogerlo una por una no aporta
 * nada y es donde se pierden las asignaciones —se cierra la app, entra
 * una llamada, y la acción queda huérfana—.
 *
 * ESTÁ AQUÍ Y NO EN EL CÓDIGO porque el nombre del contratista es un
 * DATO de este centro de distribución, no una regla del programa: el día
 * que cambie el OL se cambia aquí y no hay que tocar nada más.
 *
 * Se puede dejar en NADIE, y entonces las acciones nacen sin dueño, como
 * antes. No es lo mismo "sin dueño" que "mal asignada": una acción sin
 * dueño se ve y molesta en Todas; una asignada al que no es se ve
 * tranquila y no la cierra nadie.
 */
export function PorDefecto({ gente, actual, falta, puedeEditar }: {
  gente: Carga[];
  actual: string | null;
  /** Falta correr la migración. Se dice qué archivo, no "error". */
  falta: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [puesto, setPuesto] = useState<string | null>(actual);
  const [mandando, setMandando] = useState(false);

  async function poner(id: string | null) {
    setMandando(true);
    const { error } = await supabase.rpc("accion_responsable_defecto", { p_id: id });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    setPuesto(id);
    avisar.bien(id
      ? `Las acciones nuevas van a nacer asignadas a ${
          gente.find((g) => g.id === id)?.nombre
          ?? gente.find((g) => g.id === id)?.usuario ?? "—"}.`
      : "Las acciones nuevas van a nacer sin dueño.");
    router.refresh();
  }

  return (
    <section className="caja">
      {avisos}
      <div className="cab">
        <div>
          <h2>¿A quién le llegan las acciones nuevas?</h2>
          <p>
            Al reportar, la acción queda asignada sola a quien esté puesto aquí. Se puede cambiar
            en la misma pantalla que confirma que quedó reportada, sin salir.
          </p>
        </div>
      </div>

      {falta ? (
        <div className="aviso" style={{ margin: 12 }}>
          Falta correr <code>supabase/migraciones/2026-09-responsable-defecto.sql</code> en el
          SQL Editor de Supabase. Mientras tanto las acciones nacen sin dueño.
        </div>
      ) : (
        <div className="ac-defecto">
          <button type="button" disabled={!puedeEditar || mandando}
                  className={"ac-def-q" + (puesto === null ? " on" : "")}
                  onClick={() => poner(null)}>
            <span className="n">Nadie</span>
            <span className="c">Nacen sin dueño y se asignan a mano</span>
          </button>

          {gente.map((g) => (
            <button key={g.id} type="button" disabled={!puedeEditar || mandando}
                    className={"ac-def-q" + (puesto === g.id ? " on" : "")}
                    onClick={() => poner(g.id)}>
              <span className="n">{g.nombre || g.usuario}</span>
              <span className="c">{g.rol}</span>
            </button>
          ))}
        </div>
      )}

      {!puedeEditar && !falta && (
        <div className="aviso" style={{ margin: 12 }}>
          Esto lo cambia el administrador: define a quién le cae todo lo que se reporte de aquí
          en adelante, que es una decisión del centro y no de un turno.
        </div>
      )}
    </section>
  );
}
