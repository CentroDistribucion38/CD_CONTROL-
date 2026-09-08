import Link from "next/link";
import { AccionesApp } from "./AccionesApp";
import { Ruta } from "./Ruta";

/**
 * Barra superior. Azul profundo con la trama de rombos y el filo rojo: el
 * mismo lenguaje de la pantalla de acceso, para que entrar a CONTROL no se
 * sienta como pasar a otra aplicación.
 *
 * El logo ocupa una celda de 64px que se alinea con el riel de módulos de
 * abajo, así la columna de la izquierda se lee como una sola pieza.
 */
export function BarraSuperior({
  usuario,
  turno,
}: {
  usuario: string;
  turno?: string;
}) {
  const iniciales = usuario
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .padEnd(1, "·");

  return (
    <header className="sh-barra">
      <Link href="/inicio" className="esquina" aria-label="Ir a los módulos">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-b.png" alt="Bavaria" />
      </Link>

      <Ruta />

      <div className="der">
        {turno && <span className="turno">{turno}</span>}
        <AccionesApp />
        <Link
          href="/perfil"
          className="sh-avatar"
          title={`${usuario} — Mi perfil`}
          aria-label={`${usuario}. Ir a mi perfil`}
        >
          {iniciales}
        </Link>
      </div>
    </header>
  );
}
