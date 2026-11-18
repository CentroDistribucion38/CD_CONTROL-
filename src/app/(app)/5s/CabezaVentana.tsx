/**
 * LA CABEZA DE LAS VENTANAS DE 5S — como las de los cierres: la cinta de la marca arriba, el logo de Bavaria (ABI),
 * la etiqueta y el título grande, y el botón de cerrar recto. Una sola pieza para todas las ventanas del módulo.
 */
export function CabezaVentana({ ojo, titulo, cerrar }: { ojo: string; titulo: string; cerrar: () => void }) {
  return (
    <header className="s5-mo-cab">
      <i className="cinta" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marca/logo-bavaria.png" alt="Bavaria" />
      <span className="sep" aria-hidden />
      <div><p>{ojo}</p><h3>{titulo}</h3></div>
      <button type="button" className="s5-mo-x" aria-label="Cerrar" onClick={cerrar}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>
  );
}
