"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { ConteoFefo } from "@/modulos/inventario/fefo";

/**
 * BORRAR UN BORRADOR, ahí mismo en la pestaña Borradores — solo quien administra la plataforma.
 * «Ayúdame a eliminar el borrador que está ahora mismo»: antes había que ir a ⋯ Administrador, abrir la lista de todos
 * los FEFO y buscarlo. Aquí sale un botón por cada recorrido abierto. Es la misma función de la base
 * (conteo_fefo_eliminar: solo manda(), pide el código y queda en el registro de Administración) y pide confirmar.
 */
export function BorrarBorradores({ abiertos }: { abiertos: ConteoFefo[] }) {
  const router = useRouter();
  const [pide, setPide] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  if (abiertos.length === 0 && !ok) return null;

  async function borrar(c: ConteoFefo) {
    setOcupado(true); setMal(null);
    const { error } = await createClient().rpc("conteo_fefo_eliminar", { p_conteo: c.id, p_codigo: c.codigo });
    setOcupado(false); setPide(null);
    if (error) { setMal(`No se pudo eliminar ${c.codigo}: ${traducirError(error.message)}`); return }
    setOk(`Se eliminó el borrador ${c.codigo}.`);
    router.refresh();
  }

  return (
    <div className="ba-borr" aria-label="Eliminar borradores">
      {ok && <p className="ba-elim-ok" role="status">{ok}</p>}
      {mal && <p className="ba-conso-mal" role="alert">{mal}</p>}
      {abiertos.map((c) => pide === c.id ? (
        <div key={c.id} className="ba-elim-conf" role="alertdialog" aria-label={`Confirmar eliminar ${c.codigo}`}>
          <span>¿Eliminar el borrador <b>{c.codigo}</b> de {c.responsable ?? "—"}, con sus {Number(c.renglones ?? 0)} renglones? Si esa persona lo tiene abierto, pierde lo que lleva. No se puede deshacer.</span>
          <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => borrar(c)}>{ocupado ? "Eliminando…" : "Sí, eliminar"}</button>
          <button type="button" className="btn plano" disabled={ocupado} onClick={() => setPide(null)}>No</button>
        </div>
      ) : (
        <button key={c.id} type="button" className="btn plano mal" disabled={ocupado} onClick={() => { setPide(c.id); setMal(null); setOk(null) }}>
          Eliminar borrador {c.codigo} ({c.responsable ?? "—"})
        </button>
      ))}
    </div>
  );
}
