import Link from "next/link";
import type { HojaGuardada } from "@/modulos/rotlinea/datos";
import { resumirHojas } from "@/modulos/rotlinea/historial";

/**
 * EN EL TABLERO, LOS INFORMES VAN EN UN RENGLÓN QUE LLEVA A SU HOJA.
 *
 * La lista, la vista previa y la descarga viven en la hoja «Informes
 * generados». Aquí queda solo la respuesta —cuántos hay y si falta
 * alguno— y el camino. Los días sin hoja se dicen también aquí porque
 * son trabajo pendiente, y lo pendiente no se esconde detrás de un clic.
 */
export function ResumenHojas({ hojas, dias, conLinea, falta, desde, hasta }: {
  hojas: HojaGuardada[];
  dias: { fecha: string; und: number }[];
  conLinea: boolean;
  falta: boolean;
  desde: string;
  hasta: string;
}) {
  const q = new URLSearchParams({ desde, hasta }).toString();
  if (falta) {
    return (
      <section className="rl-tarj rl-hojas">
        <p className="rl-hojas-falta">
          Los informes generados se listan cuando se corra{" "}
          <code>supabase/migraciones/2026-09-rotura-linea-hojas.sql</code>.
        </p>
      </section>
    );
  }
  const r = resumirHojas(hojas, dias, { conLinea });
  const pend = r.sinHoja.length;
  const ojo = pend > 0 || r.cambio.size > 0;
  return (
    <Link href={`/quiebra/rotura/tablero/informes?${q}`} className={`rl-tarj rl-hojas rl-hojas-ir${ojo ? " ojo" : ""}`}>
      <span className="rl-hojas-tit">Informes generados</span>
      <span className="rl-hojas-dice">
        <b>{r.total}</b> {r.total === 1 ? "hoja" : "hojas"} de {r.dias} {r.dias === 1 ? "día" : "días"}
        {pend > 0 && <> · <em>{pend} {pend === 1 ? "día" : "días"} sin hoja</em></>}
        {r.cambio.size > 0 && <> · <em>{r.cambio.size} {r.cambio.size === 1 ? "cambió" : "cambiaron"} después</em></>}
        {!ojo && r.total > 0 && <> · ninguna pendiente</>}
      </span>
      <span className="rl-hojas-flecha">Ver, descargar y anular →</span>
    </Link>
  );
}
