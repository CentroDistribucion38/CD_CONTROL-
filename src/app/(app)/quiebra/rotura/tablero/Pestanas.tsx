import Link from "next/link";

/**
 * LAS DOS HOJAS DEL TABLERO DE ROTURA: los números y los informes.
 *
 * «Quiero que esto sea una hoja dentro del tablero: que esa sea solo de
 * los informes generados, y tener la visual de visualizar, descargar y
 * demás.»
 *
 * SON PESTAÑAS Y NO OTRA ENTRADA DEL MENÚ: los informes son del tablero,
 * con el mismo permiso —quien ve el tablero ve sus informes— y el mismo
 * período. Cambiar de hoja se lleva las fechas puestas.
 */
export function Pestanas({ actual, desde, hasta, informes }: {
  actual: "tablero" | "informes";
  desde: string;
  hasta: string;
  /** Cuántos informes hay en el período, para el número de la pestaña. */
  informes?: number;
}) {
  const q = new URLSearchParams({ desde, hasta }).toString();
  return (
    <nav className="rl-pestanas" aria-label="Hojas del tablero de rotura">
      <Link href={`/quiebra/rotura/tablero?${q}`} aria-current={actual === "tablero" ? "page" : undefined}>
        Tablero
      </Link>
      <Link href={`/quiebra/rotura/tablero/informes?${q}`}
            aria-current={actual === "informes" ? "page" : undefined}>
        Informes generados{informes != null && <b>{informes}</b>}
      </Link>
    </nav>
  );
}
