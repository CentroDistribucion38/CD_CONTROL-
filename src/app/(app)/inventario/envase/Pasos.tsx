import Link from "next/link";

/* LOS SEIS PASOS DE PLAN VS NOTIFICADO, en el orden del trabajo (el mismo del menú): antes, cada día y cada semana. */
export const PASOS = [
  { ruta: "/inventario/envase/cargar", nombre: "Cargar archivos", bloque: "Antes" },
  { ruta: "/inventario/envase/plan", nombre: "Plan de la semana", bloque: "Antes" },
  { ruta: "/inventario/envase/cruce", nombre: "Cruce a la hora", bloque: "Cada día" },
  { ruta: "/inventario/envase", nombre: "Validación", bloque: "Cada día" },
  { ruta: "/inventario/envase/corte", nombre: "Corte de inventario", bloque: "Cada día" },
  { ruta: "/inventario/envase/cierre", nombre: "Cierre de la semana", bloque: "Cada semana" },
] as const;

/**
 * «PASO 3 DE 6 · CADA DÍA · sigue: Validación →» — arriba de cada pantalla de Plan vs notificado, para saber en qué paso
 * se está y a cuál ir después. Lo que sigue después del 6 es volver a cargar (la semana nueva).
 */
export function Pasos({ ruta }: { ruta: string }) {
  const i = PASOS.findIndex((p) => p.ruta === ruta);
  if (i < 0) return null;
  const sig = PASOS[(i + 1) % PASOS.length], ant = i > 0 ? PASOS[i - 1] : null;
  return (
    <nav className="pe-pasos" aria-label="Pasos de Plan vs notificado">
      <span className="n">Paso {i + 1} de {PASOS.length}</span>
      <span className="b">{PASOS[i].bloque}</span>
      <span className="fil" aria-hidden="true">{PASOS.map((p, k) => <Link key={p.ruta} href={p.ruta} title={`${k + 1} · ${p.nombre}`} className={k === i ? "on" : k < i ? "hecho" : ""}>{k + 1}</Link>)}</span>
      {ant && <Link className="ant" href={ant.ruta}>← {ant.nombre}</Link>}
      <Link className="sig" href={sig.ruta}>{i === PASOS.length - 1 ? "Semana nueva: " : "Sigue: "}{sig.nombre} →</Link>
    </nav>
  );
}
