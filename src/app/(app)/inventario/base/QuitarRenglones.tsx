"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { ConteoFefo, Renglon } from "@/modulos/inventario/fefo";

/* ===================================================================
   ELIMINAR RENGLONES SUELTOS DE LO ENVIADO — solo quien administra.

   «No me deja eliminar registros»: en La base se ve un renglón que no debería
   estar (el de otro día, contado el sábado dentro del recorrido de hoy) y hace
   falta sacarlo SIN borrar el recorrido entero. La tabla pone una casilla en
   cada fila; esta barra dice cuántos hay marcados, pide confirmar una vez y los
   manda todos en una sola llamada (todo o nada). La base vuelve a comprobar que
   sea administrador, que sean renglones de FEFO y que ningún FEFO se quede
   vacío. Queda en el registro de Administración.

   SI LO MARCADO ES TODO LO QUE TIENE UN FEFO (un recorrido de un solo renglón,
   como el -08 con D11_IZQ RETORNO), quitar renglones lo dejaría vacío y la base
   no lo deja. Antes eso terminaba en un error y había que ir a «Eliminar FEFO»;
   ahora la pregunta lo dice («se elimina el FEFO completo») y, al confirmar, se
   elimina ese FEFO entero y los demás renglones marcados, en una sola acción.

   Vive en su propio archivo a propósito: Base.tsx es una pantalla de LECTURA (de
   los borradores no se toca nada) y no habla con la base; esto solo se monta
   para el administrador y solo en la pestaña de lo enviado.
   =================================================================== */
export function QuitarRenglones({ elegidos, conteos, alQuitar }: {
  /** Los renglones marcados que se ven ahora. */
  elegidos: Renglon[];
  /** Los recorridos, para saber cuántos renglones tiene cada uno. */
  conteos: ConteoFefo[];
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

  /* LOS FEFO QUE SE QUEDARÍAN VACÍOS: los marcados son todos los renglones que tienen. */
  const porConteo = new Map<string, number>();
  for (const r of elegidos) porConteo.set(r.conteo_id, (porConteo.get(r.conteo_id) ?? 0) + 1);
  const enteros = conteos.filter((c) => porConteo.has(c.id) && porConteo.get(c.id)! >= Number(c.renglones ?? 0) && Number(c.renglones ?? 0) > 0);
  const idsEnteros = new Set(enteros.map((c) => c.id));
  const sueltos = elegidos.filter((r) => !idsEnteros.has(r.conteo_id));

  async function quitar() {
    setMal(null); setAviso(null); setOcupado(true);
    const supabase = createClient();
    const hechos: string[] = [];
    /* Primero los renglones sueltos (todo o nada en una llamada)… */
    if (sueltos.length) {
      const { data, error } = await supabase.rpc("conteo_fefo_lineas_eliminar", { p_lineas: sueltos.map((r) => r.id) });
      if (error) { setOcupado(false); setPide(false); setMal(`No se eliminó ningún renglón: ${traducirError(error.message)}`); return }
      const por = ((data ?? []) as { codigo: string; eliminados: number }[]).map((x) => `${x.codigo} (${x.eliminados})`).join(", ");
      hechos.push(`${sueltos.length === 1 ? "se eliminó 1 renglón" : `se eliminaron ${sueltos.length} renglones`}${por ? ` de ${por}` : ""}`);
    }
    /* …y después los FEFO que quedaban vacíos, enteros. */
    for (const c of enteros) {
      const { error } = await supabase.rpc("conteo_fefo_eliminar", { p_conteo: c.id, p_codigo: c.codigo });
      if (error) {
        setOcupado(false); setPide(false);
        setMal(`${hechos.length ? hechos.join("; ") + ". Pero " : ""}no se pudo eliminar el FEFO ${c.codigo}: ${traducirError(error.message)}`);
        if (hechos.length) { alQuitar(); router.refresh() }
        return;
      }
      hechos.push(`se eliminó el FEFO ${c.codigo} completo (era su único renglón${porConteo.get(c.id)! > 1 ? "es" : ""})`);
    }
    setOcupado(false); setPide(false);
    const t = hechos.join("; ");
    setAviso(t.charAt(0).toUpperCase() + t.slice(1) + ".");
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
          {enteros.length > 0
            ? <>{enteros.map((c) => c.codigo).join(", ")} {enteros.length === 1 ? "se quedaría" : "se quedarían"} sin renglones: se {enteros.length === 1 ? "elimina ese FEFO completo" : "eliminan esos FEFO completos"}{sueltos.length ? ` y ${sueltos.length === 1 ? "1 renglón más" : `${sueltos.length} renglones más`}` : ""}. No se puede deshacer.</>
            : <>¿Eliminar {n === 1 ? "este renglón" : `estos ${n} renglones`}? No se puede deshacer.</>}
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
