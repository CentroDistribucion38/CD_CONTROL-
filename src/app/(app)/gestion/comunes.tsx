import { ESTADOS, SQL_GESTION, type Estado } from "@/modulos/gestion/semaforo";

const NOMBRE = Object.fromEntries(ESTADOS.map((e) => [e.k, e.nombre])) as Record<Estado, string>;

/** El semáforo de un número: punto de color + palabra, para que no dependa solo del color. */
export function Semaforo({ estado, corto }: { estado: Estado | null; corto?: boolean }) {
  if (!estado) return <span className="gs-sem sin"><i />{corto ? "—" : "Sin captura"}</span>;
  return <span className={`gs-sem ${estado}`}><i />{NOMBRE[estado]}</span>;
}

/** Lo que se ve cuando todavía no se corrió el SQL (o la base falló). */
export function Falta({ ojo, falta, error }: { ojo: string; falta: boolean; error: string | null }) {
  return (
    <div className="fe gs">
      <section className="cabeza">
        <div>
          <p className="ojo">{ojo}</p>
          <h1>{falta ? "Falta crear esta parte en Supabase" : "No se pudieron leer los datos de Gestión"}</h1>
          <p className="sub">
            {falta
              ? <>Abre el editor de SQL y corre <b>{SQL_GESTION}</b>. Se puede correr varias veces sin romper nada.</>
              : error}
          </p>
        </div>
      </section>
    </div>
  );
}

/** Quién eres y qué puedes: las pantallas de Gestión avisan cuando solo se puede mirar. */
export function SoloVer() {
  return <p className="gs-solover">Tienes este módulo en modo lectura: puedes mirar, no guardar.</p>;
}
