import Link from "next/link";

/**
 * LAS HOJAS DEL CUADRE SAP, vistas desde AG07 Carnaval: las mismas pestañas de siempre (AG18 · AG17 · AG16 · AG22 llevan
 * al Cuadre) y, debajo, las dos partes de Carnaval: Registro y Control.
 */
const ALMACENES = [["AG18", "AG18 · Fábrica"], ["AG17", "AG17 · Exportación"], ["AG16", "AG16 · BTS"], ["AG22", "AG22 · Bloqueado"]] as const;

export function Hojas({ activa, verRegistro, verControl }: { activa: "registro" | "control"; verRegistro: boolean; verControl: boolean }) {
  return (
    <>
      <nav className="bal-tabs cs-hojas" aria-label="Hojas del Cuadre SAP">
        {ALMACENES.map(([a, t]) => (
          <Link key={a} href={`/inventario/balance/cuadre?alm=${a}`} className="bal-tab"><span className="bal-tab-label">{t}</span></Link>
        ))}
        <Link href={activa === "registro" ? "/inventario/balance/carnaval/registro" : "/inventario/balance/carnaval/control"} className="bal-tab activa" aria-current="page">
          <span className="bal-tab-label">AG07 · Carnaval</span>
        </Link>
        <Link href="/inventario/balance/cuadre?vista=historico" className="bal-tab"><span className="bal-tab-label">Histórico</span></Link>
      </nav>
      <nav className="cv-sub" aria-label="Carnaval">
        {verControl && <Link href="/inventario/balance/carnaval/control" className={activa === "control" ? "on" : ""}>Control</Link>}
        {verRegistro && <Link href="/inventario/balance/carnaval/registro" className={activa === "registro" ? "on" : ""}>Registro</Link>}
      </nav>
    </>
  );
}
