"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { ConteoFefo } from "@/modulos/inventario/fefo";

/* ===================================================================
   ELIMINAR FEFOs ESPECÍFICOS — solo quien administra la plataforma.

   «Que el super admin pueda eliminar algunos FEFO específicos.» Se marcan
   uno o VARIOS de una lista (enviados, abiertos y anulados) y se confirma
   una sola vez: se van con todos sus renglones y no se puede deshacer. La base lo vuelve a
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
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [pide, setPide] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = useMemo(() => [...conteos].sort((a, b) =>
    (b.fecha_analisis ?? "").localeCompare(a.fecha_analisis ?? "") || b.codigo.localeCompare(a.codigo, "es", { numeric: true })), [conteos]);
  /* Solo cuentan los marcados que siguen en la lista (si uno ya se fue, no se manda). */
  const elegidos = lista.filter((c) => marcados.has(c.id));

  function marcar(id: string) {
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n });
    setPide(false); setMal(null); setAviso(null);
  }

  /* Uno por uno, y cada uno con su código: si algo falla a la mitad se sabe
     cuáles se fueron y cuáles no, y los que fallaron quedan marcados. */
  async function eliminar() {
    setMal(null); setAviso(null); setOcupado(true);
    const supabase = createClient();
    const idos: string[] = []; let falla: { codigo: string; texto: string } | null = null;
    for (const c of elegidos) {
      const { error } = await supabase.rpc("conteo_fefo_eliminar", { p_conteo: c.id, p_codigo: c.codigo });
      if (error) { falla = { codigo: c.codigo, texto: traducirError(error.message) }; break }
      idos.push(c.id);
    }
    setOcupado(false);
    const codigos = elegidos.filter((c) => idos.includes(c.id)).map((c) => c.codigo);
    setMarcados((m) => new Set([...m].filter((id) => !idos.includes(id))));
    setPide(false);
    if (codigos.length) { setAviso(codigos.length === 1 ? `Se eliminó el FEFO ${codigos[0]}.` : `Se eliminaron ${codigos.length} FEFO: ${codigos.join(", ")}.`); router.refresh() }
    if (falla) setMal(`No se pudo eliminar ${falla.codigo}: ${falla.texto}`);
  }

  if (lista.length === 0) return null;
  return (
    <details className="ba-elim">
      <summary>Eliminar FEFOs <em>solo administrador</em></summary>
      <p className="ba-elim-ayuda">
        Marca los FEFO que sobran —uno o varios— y elimínalos juntos. Se van <b>completos, con todos sus renglones</b>, y no se
        puede deshacer. Queda escrito en el registro de Administración. Si solo quieres sacarlos del Excel de un día,
        desmárcalos arriba en el consolidado.
      </p>
      {aviso && <p className="ba-elim-ok" role="status">{aviso}</p>}
      {mal && <p className="ba-conso-mal" role="alert">{mal}</p>}
      <div className="ba-elim-barra">
        <button type="button" className="btn plano" disabled={ocupado}
                onClick={() => { setMarcados(elegidos.length === lista.length ? new Set() : new Set(lista.map((c) => c.id))); setPide(false) }}>
          {elegidos.length === lista.length ? "Quitar todas las marcas" : "Marcar todos"}
        </button>
        <span className="ba-elim-cuenta" aria-live="polite">{elegidos.length === 0 ? "Ninguno marcado" : `${elegidos.length} marcado${elegidos.length === 1 ? "" : "s"}`}</span>
        {!pide && (
          <button type="button" className="btn plano mal ba-elim-ir" disabled={elegidos.length === 0 || ocupado} onClick={() => { setPide(true); setMal(null); setAviso(null) }}>
            {elegidos.length > 1 ? `Eliminar ${elegidos.length} FEFO` : "Eliminar FEFO"}
          </button>
        )}
      </div>
      {pide && elegidos.length > 0 && (
        <div className="ba-elim-conf" role="alertdialog" aria-label="Confirmar eliminación">
          <span>¿Eliminar {elegidos.length === 1 ? elegidos[0].codigo : `estos ${elegidos.length} FEFO`}? No se puede deshacer.</span>
          <button type="button" className="btn plano mal" disabled={ocupado} onClick={eliminar}>
            {ocupado ? "Eliminando…" : elegidos.length === 1 ? "Sí, eliminar" : `Sí, eliminar ${elegidos.length}`}
          </button>
          <button type="button" className="btn plano" disabled={ocupado} onClick={() => setPide(false)}>No</button>
        </div>
      )}
      <ul className="ba-elim-lista">
        {lista.map((c) => (
          <li key={c.id} className={marcados.has(c.id) ? "marcado" : ""}>
            <label>
              <input type="checkbox" checked={marcados.has(c.id)} disabled={ocupado} onChange={() => marcar(c.id)} aria-label={`Marcar el FEFO ${c.codigo}`} />
              <b>{c.codigo}</b>
              <i className={"ba-elim-estado " + c.estado}>{ESTADO[c.estado] ?? c.estado.toUpperCase()}</i>
              <span>{dia(c.fecha_analisis)} · {c.envio_nombre ?? c.responsable ?? "—"} · {Number(c.renglones ?? 0)} rengl.</span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}
