"use client";

/** La barra de arriba de las planillas: no sale en el papel. */
export function BarraPlanillas({ children }: { children: React.ReactNode }) {
  return (
    <div className="pl-barra">
      <div className="pl-barra-t">{children}</div>
      <button type="button" className="pl-imprimir" onClick={() => window.print()}>Imprimir o guardar en PDF</button>
    </div>
  );
}
