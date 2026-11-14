/** Lo que sale mientras no se haya corrido el SQL del módulo (o si la lectura falla). */
export function FaltaCert({ titulo, error }: { titulo: string; error?: string | null }) {
  return (
    <div className="sg">
      <header className="sg-cab"><div><p className="sg-ojo">SEGURIDAD · CERTIFICACIONES</p><h1>{titulo}</h1></div></header>
      {error
        ? <p className="sg-aviso mal" role="alert">No se pudo leer la base de licencias: {error}</p>
        : <p className="sg-aviso">Falta preparar la base: corre <b>2026-11-seguridad-certificaciones.sql</b> en el SQL Editor de Supabase y vuelve a entrar.</p>}
    </div>
  );
}
