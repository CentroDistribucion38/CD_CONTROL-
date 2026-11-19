import Link from "next/link";
import type { ReactNode } from "react";

/**
 * EL ENCABEZADO DE PET, igual al de Plan y Control: título, las dos vistas (Programar · Vhs por formato) y el panel
 * de la cifra que manda. «Solo debías agregar uno llamado PET y allí dentro todo lo relacionado.»
 */
export function PetCabeza({ v, sub, rot, num, pie }: { v: "programar" | "vhs"; sub: ReactNode; rot: string; num: ReactNode; pie: ReactNode }) {
  return (
    <section className="cabeza-ctl">
      <div>
        <p className="ojo">TRASPASOS · PET</p>
        <h1>PET</h1>
        <p className="sub">{sub}</p>
        <nav className="seg pet-vistas" aria-label="Vista">
          <Link href="/traspasos/pet" className={v === "programar" ? "on" : ""} aria-current={v === "programar" ? "page" : undefined}>Programar</Link>
          <Link href="/traspasos/pet?v=vhs" className={v === "vhs" ? "on" : ""} aria-current={v === "vhs" ? "page" : undefined}>Vhs por formato</Link>
        </nav>
      </div>
      <div className="der-ctl">
        <div className="panel-ojo">
          <div className="corte" aria-hidden />
          <div className="rot">{rot}</div>
          <div className="num">{num}</div>
          <div className="pie">{pie}</div>
        </div>
      </div>
    </section>
  );
}
