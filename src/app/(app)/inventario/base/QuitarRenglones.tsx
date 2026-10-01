"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { Renglon } from "@/modulos/inventario/fefo";

/* ===================================================================
   ELIMINAR RENGLONES SUELTOS DE LO ENVIADO — solo quien administra.

   «No me deja eliminar registros»: en La base se ve un renglón que no debería
   estar (el de otro día, contado el sábado dentro del recorrido de hoy) y hace
   falta sacarlo SIN borrar el recorrido entero. La tabla pone una casilla en
   cada fila; esta barra dice cuántos hay marcados, pide confirmar una vez y los
   manda todos en una sola llamada (todo o nada). La base vuelve a comprobar que
   sea administrador, que sean renglones de FEFO y que ningún FEFO se quede
   vacío. Queda en el registro de Administración.

   Vive en su propio archivo a propósito: Base.tsx es una pantalla de LECTURA (de
   los borradores no se toca nada) y no habla con la base; esto solo se monta
   para el administrador y solo en la pestaña de lo enviado.
   =================================================================== */
export function QuitarRenglones({ elegidos, alQuitar }: {
  /** Los renglones marcados que se ven ahora. */
  elegidos: Renglon[];
  /** Se llama cuando la base ya los eliminó (para limpiar las marcas). */
  alQuitar: () => void;
}) {
  const router = useRouter();
  const [pide, setPide] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /* Cambiar las marcas cierra la pregunta vieja (se confirmaría otra cosa) y borra los avisos viejos. */
  const firma = elegidos.map((r) => r.id).join("|");
  useEffect(() => {
    setPide(false);
    if (firma !== "") { setMal(null); setAviso(null) }
  }, [firma]);

  async function quitar() {
    setMal(null); setAviso(null); setOcupado(true);
    const ids = elegidos.map((r) => r.id);
    const { data, error } = await createClient().rpc("conteo_fefo_lineas_eliminar", { p_lineas: ids });
    setOcupado(false); setPide(false);
    if (error) { setMal(`No se eliminó ningún renglón: ${traducirError(error.message)}`); return }
    const por = ((data ?? []) as { codigo: string; eliminados: number }[]).map((x) => `${x.codigo} (${x.eliminados})`).join(", ");
    setAviso(`${ids.length === 1 ? "Se eliminó 1 renglón" : `Se eliminaron ${ids.length} renglones`}${por ? ` de ${por}` : ""}.`);
    alQuitar();
    router.refresh();
  }

  const n = elegidos.length;
  return (
    <div className="ba-quitar" role="group" aria-label="Eliminar renglones (solo administrador)">
      <span className="ba-quitar-cuenta" aria-live="polite">
        {n === 0
          ? "Administrador: marca con la casilla los renglones que sobran para eliminarlos."
          : `${n} ${n === 1 ? "renglón marcado" : "renglones marcados"}`}
      </span>
      {!pide && (
        <button type="button" className="btn plano mal ba-quitar-ir" disabled={n === 0 || ocupado}
                onClick={() => { setPide(true); setMal(null); setAviso(null) }}>
          {n > 1 ? `Eliminar ${n} renglones` : "Eliminar renglón"}
        </button>
      )}
      {pide && n > 0 && (
        <span className="ba-quitar-conf" role="alertdialog" aria-label="Confirmar eliminación de renglones">
          ¿Eliminar {n === 1 ? "este renglón" : `estos ${n} renglones`}? No se puede deshacer.
          <button type="button" className="btn plano mal" disabled={ocupado} onClick={quitar}>
            {ocupado ? "Eliminando…" : "Sí, eliminar"}
          </button>
          <button type="button" className="btn plano" disabled={ocupado} onClick={() => setPide(false)}>No</button>
        </span>
      )}
      {aviso && <span className="ba-elim-ok" role="status">{aviso}</span>}
      {mal && <span className="ba-conso-mal" role="alert">{mal}</span>}
    </div>
  );
}
