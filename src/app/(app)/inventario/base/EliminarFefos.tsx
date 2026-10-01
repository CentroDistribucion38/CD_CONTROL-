"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { ConteoFefo } from "@/modulos/inventario/fefo";

/* ===================================================================
   ELIMINAR FEFOs ESPECÍFICOS — solo quien administra la plataforma.

   «Que el super admin pueda eliminar algunos FEFO específicos.» Se escoge
   el FEFO de una lista (enviados, abiertos y anulados) y se confirma: se va
   con todos sus renglones y no se puede deshacer. La base lo vuelve a
   comprobar (solo manda()) y pide el código del FEFO, así que si cambió
   mientras se miraba, no se borra otra cosa. Queda en el registro de
   Administración.
   =================================================================== */
const ESTADO: Record<string, string> = {
  cerrado: "ENVIADO", en_proceso: "ABIERTO", borrador: "ABIERTO", anulado: "ANULADO",
};
const dia = (s: string | null) => (s ? new Date(s + "T12:00:00").toLocaleDateString("es-CO") : "—");

export function EliminarFefos({ conteos }: { conteos: ConteoFefo[] }) {
  const router = useRouter();
  const [pide, setPide] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = useMemo(() => [...conteos].sort((a, b) =>
    (b.fecha_analisis ?? "").localeCompare(a.fecha_analisis ?? "") || b.codigo.localeCompare(a.codigo, "es", { numeric: true })), [conteos]);

  async function eliminar(c: ConteoFefo) {
    setMal(null); setAviso(null); setOcupado(true);
    const { error } = await createClient().rpc("conteo_fefo_eliminar", { p_conteo: c.id, p_codigo: c.codigo });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setPide(null);
    setAviso(`Se eliminó el FEFO ${c.codigo}.`);
    router.refresh();
  }

  if (lista.length === 0) return null;
  return (
    <details className="ba-elim">
      <summary>Eliminar FEFOs <em>solo administrador</em></summary>
      <p className="ba-elim-ayuda">
        El FEFO se elimina <b>completo, con todos sus renglones</b>, y no se puede deshacer. Queda escrito en el
        registro de Administración. Si solo quieres sacarlo del Excel de un día, desmárcalo arriba en el consolidado.
      </p>
      {aviso && <p className="ba-elim-ok" role="status">{aviso}</p>}
      {mal && <p className="ba-conso-mal" role="alert">{mal}</p>}
      <ul className="ba-elim-lista">
        {lista.map((c) => (
          <li key={c.id} className={pide === c.id ? "pide" : ""}>
            <b>{c.codigo}</b>
            <i className={"ba-elim-estado " + c.estado}>{ESTADO[c.estado] ?? c.estado.toUpperCase()}</i>
            <span>{dia(c.fecha_analisis)} · {c.envio_nombre ?? c.responsable ?? "—"} · {Number(c.renglones ?? 0)} rengl.</span>
            {pide === c.id ? (
              <span className="ba-elim-conf">¿Eliminar {c.codigo}?
                <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => eliminar(c)}>
                  {ocupado ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button type="button" className="btn plano" disabled={ocupado} onClick={() => setPide(null)}>No</button>
              </span>
            ) : (
              <button type="button" className="btn plano" onClick={() => { setPide(c.id); setMal(null); setAviso(null) }}
                      aria-label={`Eliminar el FEFO ${c.codigo}`}>Eliminar</button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
