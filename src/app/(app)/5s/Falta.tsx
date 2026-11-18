/** Lo que sale mientras no se haya corrido el SQL de 5S (o si la lectura falla). */
export function Falta5S({ titulo, error, sql = "2026-11-cinco-s.sql" }: { titulo: string; error?: string | null; sql?: string }) {
  return (
    <div className="s5">
      <header className="s5-cab"><div><p className="s5-ojo">5S · ORDEN Y ASEO</p><h1>{titulo}</h1></div></header>
      {error
        ? <p className="s5-aviso mal" role="alert">No se pudo leer 5S: {error}</p>
        : <p className="s5-aviso">Falta preparar la base: corre <b>{sql}</b> en el SQL Editor de Supabase y vuelve a entrar.</p>}
    </div>
  );
}
