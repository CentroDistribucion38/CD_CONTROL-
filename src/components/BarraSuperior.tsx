/**
 * Barra superior. El logo es un PNG con fondo transparente en
 * /public/marca/logo-bavaria.png. Si el archivo no está, queda el espacio
 * reservado y nada se rompe.
 *
 * La barra es blanca a propósito: el logo es rojo y sobre el azul corporativo
 * pierde legibilidad y se ensucia.
 */
import { AccionesApp } from "./AccionesApp";

export function BarraSuperior({
  usuario,
  turno,
}: {
  usuario: string;
  turno?: string;
}) {
  return (
    <header
      className="flex items-center gap-4 border-b bg-white px-6 py-3"
      style={{ borderColor: "var(--bv-linea)" }}
    >
      <div
        className="h-[26px] w-[104px] bg-contain bg-left bg-no-repeat"
        style={{ backgroundImage: "url(/marca/logo-bavaria.png)" }}
        role="img"
        aria-label="Bavaria"
      />
      <span className="h-[26px] w-px" style={{ background: "var(--bv-linea)" }} />
      <p className="text-[15px] font-medium tracking-[0.06em]">CONTROL</p>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {turno && (
          <span className="hidden text-[12px] text-bv-texto-2 sm:inline">{turno}</span>
        )}
        <AccionesApp />
        <span
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[11px] text-bv-texto-2"
          style={{ borderColor: "var(--bv-linea)" }}
          title={usuario}
        >
          {usuario.slice(0, 2).toUpperCase()}
        </span>
      </div>
    </header>
  );
}
