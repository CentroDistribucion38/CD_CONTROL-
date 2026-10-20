/**
 * LOS AVISOS DEL ANÁLISIS: solo un icono de alerta con su número; la lista se abre si se toca.
 * Son notas para tener en cuenta, no errores.
 */
export function Avisos({ avisos }: { avisos: string[] }) {
  if (!avisos.length) return null;
  const t = avisos.length === 1 ? "1 aviso" : `${avisos.length} avisos`;
  return (
    <details className="ad-avisos">
      <summary title={t} aria-label={`${t}: tocar para ver`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.2v.1" /></svg>
        <b>{avisos.length}</b>
      </summary>
      <ul>{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
    </details>
  );
}
