import { AccionesApp } from "./AccionesApp";

/**
 * Barra superior de la app. Azul profundo con la trama de rombos y el filo
 * rojo debajo: el mismo lenguaje de la pantalla de acceso, para que entrar
 * a CONTROL no se sienta como pasar a otra aplicación.
 *
 * El logo es /public/marca/logo-b.png (el escudo, con fondo transparente).
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marca/logo-b.png" alt="Bavaria" />
      <div className="div" />
      <div className="wm">CONTROL</div>

      <div className="der">
        {turno && <span className="turno">{turno}</span>}
        <AccionesApp />
        <div className="sh-avatar" title={usuario} aria-label={usuario}>
          {iniciales}
        </div>
      </div>
    </header>
  );
}
