import Link from "next/link";
import { hoyLocal, petRango } from "@/modulos/traspasos/datos";
import { masDias } from "@/modulos/traspasos/pet";
import "../../traspasos.css";
import "../pet.css";
import { Programar } from "./Programar";

export const dynamic = "force-dynamic";

/**
 * TRASPASOS › PROGRAMAR PET — ¿cuántos Vhs de cada formato programo para tal día?
 * Se lee el PET de las últimas 10 semanas (alcanza para 8 días iguales y la gráfica de 28 días) y la cuenta
 * la hace la pantalla, para que cambiar el día, la base o el turno no vuelva a pedirle nada a la base.
 */
export default async function ProgramarPetPage() {
  const hoy = hoyLocal();
  const r = await petRango(masDias(hoy, -70), hoy);

  return (
    <div className="tp tp-pet-v">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · PET · PROGRAMAR</p>
          <h1>¿Cuántos Vhs de PET programo?</h1>
          <p className="sub">
            Para el día que escojas: cuántos Vhs de cada formato salieron los últimos días iguales, si va subiendo o
            bajando, y el número para el plan. El detalle viaje por viaje está en <Link href="/traspasos/pet">PET</Link>.
          </p>
        </div>
      </section>
      {r.falta ? (
        <section className="sin-tablas">
          <h2>Falta un paso en Supabase</h2>
          <p>Corre <code>supabase/migraciones/2026-11-traspasos-pet.sql</code> en el SQL Editor. Desde ahí, cada Vh de PET
            que se registre con su SKU entra a esta cuenta.</p>
        </section>
      ) : r.error ? (
        <section className="sin-tablas"><h2>No se pudo leer el PET</h2><p>{r.error}</p></section>
      ) : (
        <Programar filas={r.filas} hoy={hoy} />
      )}
    </div>
  );
}
