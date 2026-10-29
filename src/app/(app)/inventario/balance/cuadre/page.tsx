import { armarCuadre } from "@/modulos/inventario/cuadre";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "./cuadre.css";
import { Cuadre } from "./Cuadre";
import { Ag07 } from "./carnaval/Ag07";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · CUADRE SAP — el conteo del día contra el stock de SAP (ZEXI) de AG18.
 * Paso 1: el cuadre y la diferencia. Paso 2: qué mover en SAP (311). Paso 3: con la transacción
 * del 311 ya bajada de SAP, cómo quedó y si todo quedó balanceado. La cuenta: modulos/inventario/cuadre.ts.
 */
export default async function CuadrePage({ searchParams }: { searchParams: Promise<{ fecha?: string; vista?: string; alm?: string; sub?: string }> }) {
  const q = await searchParams;
  if (q.alm === "AG07") return <Ag07 sub={q.sub === "registro" ? "registro" : "control"} fecha={q.fecha} />;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : null;
  const almacen = q.alm === "AG22" || q.alm === "AG17" || q.alm === "AG16" ? q.alm : "AG18";
  const c = await armarCuadre(dia, almacen);

  if (c.faltaSql) {
    return (
      <div className="fe bal cs">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · BALANCE · CUADRE SAP</p>
          <h1>Falta crear esta parte en Supabase</h1>
          <p className="sub">Abre el editor de SQL y corre <b>supabase/migraciones/2026-10-cuadre-sap.sql</b>. Se puede correr varias veces.</p>
        </div></section>
      </div>
    );
  }
  return (
    <div className="fe bal cs">
      <Cuadre fecha={c.fecha} dias={c.dias} filas={c.filas} guardado={c.guardado} estibasBodega={c.estibasBodega} avisos={c.avisos} error={c.error} otros={c.otros} envases={c.envases} aplicados={c.aplicados} excluidos={c.excluidos} historial={c.historial} faltaHist={c.faltaHist} partidas311={c.partidas311} vista={q.vista === "historico" ? "historico" : "cuadre"} almacen={almacen} />
    </div>
  );
}
