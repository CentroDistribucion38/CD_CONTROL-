import Link from "next/link";

/**
 * LAS HOJAS DEL CUADRE SAP, vistas desde AG07 Carnaval: las mismas pestañas de siempre (AG18 · AG17 · AG16 · AG22 · Histórico
 * llevan al Cuadre) y, debajo, las partes de Carnaval, en el orden del proceso: Registro, Control, Inventario y Cuadre SAP AG07.
 */
const ALMACENES = [["AG18", "AG18 · Fábrica"], ["AG17", "AG17 · Exportación"], ["AG16", "AG16 · BTS"], ["AG22", "AG22 · Bloqueado"]] as const;
const A = "/inventario/balance/cuadre";

export function Hojas({ activa }: { activa: "registro" | "control" | "inventario" | "cuadre" }) {
  return (
    <>
      <nav className="bal-tabs cs-hojas" aria-label="Hojas del Cuadre SAP">
        {ALMACENES.map(([a, t]) => (
          <Link key={a} href={`${A}?alm=${a}`} className="bal-tab"><span className="bal-tab-label">{t}</span></Link>
        ))}
        <Link href={`${A}?alm=AG07&sub=${activa}`} className="bal-tab activa" aria-current="page"><span className="bal-tab-label">AG07 · Carnaval</span></Link>
        <Link href={`${A}?vista=historico`} className="bal-tab"><span className="bal-tab-label">Histórico</span></Link>
      </nav>
      <nav className="cv-sub" aria-label="Carnaval">
        <Link href={`${A}?alm=AG07&sub=registro`} className={activa === "registro" ? "on" : ""}>Registro</Link>
        <Link href={`${A}?alm=AG07&sub=control`} className={activa === "control" ? "on" : ""}>Control</Link>
        <Link href={`${A}?alm=AG07&sub=inventario`} className={activa === "inventario" ? "on" : ""}>Inventario</Link>
        <Link href={`${A}?alm=AG07&sub=cuadre`} className={activa === "cuadre" ? "on" : ""}>Cuadre SAP AG07</Link>
      </nav>
    </>
  );
}
