"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";

export type FilaCargado = { id: string; lunes: string; generado: string; semana: number; desde: string; hasta: string; total_hl: number;
  subido_en: string; papel: string | null; es: "inicial" | "vigente" | "anterior" };

const fh = (g: string) => new Date(g.slice(0, 19) + "Z").toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const fecha = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * LO QUE HAY CARGADO, CON QUÉ HACERLE. «¿Cómo puedo eliminar, cambiar, editar? No me deja hacer nada.»
 *   · Hacer plan inicial / Pasar a corte: el papel lo pone solo la pantalla (el primero generado que cubre desde el lunes es el
 *     inicial); si se subió en otro orden, aquí se escoge a mano. «Automático» lo devuelve a la regla.
 *   · Eliminar: borra el instructivo con todas sus horas (se puede volver a subir el archivo).
 * Las confirmaciones van en la ventana de la app, no en el cuadro del navegador.
 */
export function TablaCargado({ filas, puede }: { filas: FilaCargado[]; puede: boolean }) {
  const router = useRouter();
  const [pedir, dialogo] = useConfirmar();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const falta = (m: string) => /papel|column/i.test(m)
    ? "Falta correr supabase/migraciones/2026-11-plan-envase-editar.sql en Supabase para poder cambiar el papel."
    : m;

  async function hacer(id: string, que: () => Promise<{ error: { message: string } | null }>) {
    setOcupado(id); setError(null);
    const r = await que();
    setOcupado(null);
    if (r.error) { setError(falta(r.error.message)); return }
    router.refresh();
  }
  const s = createClient();

  async function papel(f: FilaCargado, nuevo: "inicial" | "corte" | null) {
    await hacer(f.id, async () => {
      /* Solo un plan inicial escogido a mano por semana. */
      if (nuevo === "inicial") {
        const r0 = await s.from("pe_planes").update({ papel: null }).eq("lunes", f.lunes).eq("papel", "inicial").neq("id", f.id);
        if (r0.error) return r0;
      }
      return s.from("pe_planes").update({ papel: nuevo }).eq("id", f.id);
    });
  }
  async function eliminar(f: FilaCargado) {
    const ok = await pedir({
      titulo: `¿Eliminar el instructivo generado ${fh(f.generado)}?`,
      dice: <>Se borra con todas sus horas ({Math.round(f.total_hl).toLocaleString("es-CO")} HL, del {fecha(f.desde)} al {fecha(f.hasta)}).
        {f.es === "inicial" ? " Es el plan inicial de la semana: el siguiente que cubra desde el lunes pasa a serlo." : ""} Puedes volver a subir el archivo cuando quieras.</>,
      confirmar: "Eliminar", peligro: true,
    });
    if (!ok) return;
    await hacer(f.id, async () => s.from("pe_planes").delete().eq("id", f.id));
  }

  return (
    <>
      {dialogo}
      {error && <p className="pe-error">{error}</p>}
      <div className="pe-caja"><table className="pe-t">
        <thead><tr><th className="l">Instructivo</th><th className="l">Semana</th><th className="l">Cubre</th><th>Total HL</th><th className="l">Subido</th><th className="l">Papel</th>
          {puede && <th className="l">Cambiar</th>}</tr></thead>
        <tbody>{filas.map((f) => (
          <tr key={f.id} style={ocupado === f.id ? { opacity: 0.5 } : undefined}>
            <td className="l">Generado {fh(f.generado)}</td><td className="l">{f.semana}</td>
            <td className="l">{fecha(f.desde)} al {fecha(f.hasta)}</td><td>{Math.round(f.total_hl).toLocaleString("es-CO")}</td>
            <td className="l">{new Date(f.subido_en).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" })}</td>
            <td className="l">
              {f.es === "inicial" ? <span className="pe-tag t-g">Plan inicial</span> : f.es === "vigente" ? <span className="pe-tag t-a">Corte vigente</span> : <span className="pe-tag t-g">Corte anterior</span>}
              {f.papel && <small className="mut"> · a mano</small>}
            </td>
            {puede && (
              <td className="l"><span className="pe-acc">
                {f.es !== "inicial" && <button type="button" disabled={!!ocupado} onClick={() => papel(f, "inicial")}>Hacer plan inicial</button>}
                {f.es === "inicial" && <button type="button" disabled={!!ocupado} onClick={() => papel(f, "corte")}>Pasar a corte</button>}
                {f.papel && <button type="button" disabled={!!ocupado} onClick={() => papel(f, null)}>Automático</button>}
                <button type="button" className="mal" disabled={!!ocupado} onClick={() => eliminar(f)}>Eliminar</button>
              </span></td>
            )}
          </tr>
        ))}</tbody>
      </table></div>
    </>
  );
}
