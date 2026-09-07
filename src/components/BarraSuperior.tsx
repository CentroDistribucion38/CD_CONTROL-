/**
 * Barra superior azul. El logo sale de /public/marca/logo-bavaria.svg;
 * si el archivo no está, queda el espacio reservado vacío y nada se rompe.
 * El logo no se genera desde código: es un asset de marca y su uso en una
 * herramienta interna debería tener visto bueno de comunicaciones.
 */
export function BarraSuperior({
  usuario,
  turno,
}: {
  usuario: string;
  turno?: string;
}) {
  return (
    <header
      className="flex items-center justify-between px-[22px] py-[13px]"
      style={{ background: "var(--bv-azul)" }}
    >
      <div className="flex items-center gap-[18px]">
        <div
          className="h-7 w-[92px] bg-contain bg-left bg-no-repeat"
          style={{ backgroundImage: "url(/marca/logo-bavaria.svg)" }}
          role="img"
          aria-label="Bavaria"
        />
        <span className="h-[30px] w-px" style={{ background: "#3E8AC9" }} />
        <p className="text-[16px] font-medium tracking-[0.06em] text-white">
          CONTROL
        </p>
      </div>

      <div className="flex items-center gap-3">
        {turno && (
          <span className="hidden text-[12px] sm:inline" style={{ color: "#BBD8F0" }}>
            {turno}
          </span>
        )}
        <span
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[11px] text-white"
          style={{ borderColor: "#56A0D8" }}
          title={usuario}
        >
          {usuario.slice(0, 2).toUpperCase()}
        </span>
      </div>
    </header>
  );
}
