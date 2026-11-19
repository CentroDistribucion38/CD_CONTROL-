import Link from "next/link";
import { hoyLocal, petRango } from "@/modulos/traspasos/datos";
import { masDias } from "@/modulos/traspasos/pet";
import "../traspasos.css";
import "./pet.css";
import { TablaPet } from "./TablaPet";

export const dynamic = "force-dynamic";

/**
 * TRASPASOS › PET — cada Vh que movió PET y cuánto llevó de cada formato (200, 330, 1000, 1.500 ml).
 * Arriba el resumen del periodo; abajo los Vhs agrupados por día. Se filtra, se suma y se descarga.
 * Las fechas viajan en la dirección (?desde=…&hasta=…): la búsqueda se puede mandar tal cual.
 */
export default async function PetPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const q = await searchParams;
  const esF = (x?: string) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? "");
  const hoy = hoyLocal();
  const hasta = esF(q.hasta) ? q.hasta! : hoy;
  const desde = esF(q.desde) && q.desde! <= hasta ? q.desde! : masDias(hasta, -6);
  const r = await petRango(desde, hasta);

  return (
    <div className="tp tp-pet-v">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · PET</p>
          <h1>Vhs de PET por formato</h1>
          <p className="sub">
            Cada Vh que movió PET y cuánto llevó de cada formato, agrupado por día. El formato sale del SKU que se
            escoge al registrar el viaje. Para saber cuántos programar: <Link href="/traspasos/pet/programar">Programar PET</Link>.
          </p>
        </div>
      </section>
      {r.falta ? (
        <section className="sin-tablas">
          <h2>Falta un paso en Supabase</h2>
          <p>Corre <code>supabase/migraciones/2026-11-traspasos-pet.sql</code> en el SQL Editor. Desde ahí, cada Vh de PET
            que se registre con su SKU sale aquí por formato.</p>
        </section>
      ) : r.error ? (
        <section className="sin-tablas"><h2>No se pudo leer el PET</h2><p>{r.error}</p></section>
      ) : (
        <TablaPet filas={r.filas} desde={desde} hasta={hasta} />
      )}
    </div>
  );
}
