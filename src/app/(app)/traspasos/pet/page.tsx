import { hoyLocal, petRango } from "@/modulos/traspasos/datos";
import { masDias } from "@/modulos/traspasos/pet";
import "../traspasos.css";
import "./pet.css";
import { TablaPet } from "./TablaPet";
import { Programar } from "./Programar";

export const dynamic = "force-dynamic";

/**
 * TRASPASOS › PET — todo lo de PET en un solo lugar, en dos vistas:
 *   · Programar (por defecto): cuántos Vhs de cada formato programar para un día, según los últimos días iguales.
 *   · Vhs por formato (?v=vhs&desde&hasta): cada Vh que movió PET y cuánto llevó de 200, 330, 1000 y 1.500.
 */
export default async function PetPage({ searchParams }: { searchParams: Promise<{ v?: string; desde?: string; hasta?: string }> }) {
  const q = await searchParams;
  const esF = (x?: string) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? "");
  const hoy = hoyLocal();
  const vista = q.v === "vhs" ? "vhs" : "programar";
  const hasta = esF(q.hasta) ? q.hasta! : hoy;
  const desde = esF(q.desde) && q.desde! <= hasta ? q.desde! : masDias(hasta, -6);
  /* Programar mira 10 semanas hacia atrás (8 días iguales y la gráfica de 28 días). */
  const r = vista === "vhs" ? await petRango(desde, hasta) : await petRango(masDias(hoy, -70), hoy);

  return (
    <div className="tp tp-pet-v">
      {r.falta ? (
        <section className="sin-tablas">
          <h2>Falta un paso en Supabase</h2>
          <p>Corre <code>supabase/migraciones/2026-11-traspasos-pet.sql</code> en el SQL Editor. Desde ahí, cada Vh de PET
            que se registre con su SKU sale aquí por formato.</p>
        </section>
      ) : r.error ? (
        <section className="sin-tablas"><h2>No se pudo leer el PET</h2><p>{r.error}</p></section>
      ) : vista === "vhs" ? (
        <TablaPet filas={r.filas} desde={desde} hasta={hasta} />
      ) : (
        <Programar filas={r.filas} hoy={hoy} />
      )}
    </div>
  );
}
