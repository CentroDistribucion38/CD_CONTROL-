import { createClient } from "@/lib/supabase/server";
import { balanceDelDia } from "@/modulos/inventario/balance";
import { leerMaestroPasivos, leerPasivos } from "@/modulos/pasivos/datos";
import "../../sider/sider.css";
import "../fefo.css";
import "./balance.css";
import { Balance } from "./Balance";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE
 *
 * El consolidado del DÍA QUE SE ESCOJA (por defecto el último con conteo enviado) contra el casco
 * de vidrio: las tablas dinámicas que el analista arma a mano en «CONTEO FABRICA.xlsx».
 * La cuenta vive en src/modulos/inventario/balance.ts.
 */
export default async function BalancePage({ searchParams }: { searchParams: Promise<{ fecha?: string; casco?: string }> }) {
  const q = await searchParams;
  const supabase = await createClient();

  /* Las tablas de ajustes y reclasificaciones salen del SQL de Balance. */
  const prueba = await supabase.from("balance_ajustes").select("id").limit(1);
  if (prueba.error && /balance_ajustes|PGRST|relation|does not exist/i.test(`${prueba.error.code} ${prueba.error.message}`)) {
    return (
      <div className="fe">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · BALANCE</p>
          <h1>Falta crear esta parte en Supabase</h1>
          <p className="sub">
            Abre el editor de SQL y corre <b>supabase/migraciones/2026-10-balance.sql</b>.
            Se puede correr varias veces: conserva los ajustes y las reclasificaciones.
          </p>
        </div></section>
      </div>
    );
  }

  const dia = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : null);
  const b = await balanceDelDia(dia(q.fecha), dia(q.casco));

  /* LA ROTURA DE LÍNEA DEL PASIVO DEL DÍA: para el Excel de lo pendiente por darle de baja. Si Pasivos no está creado o no hay nada, sale vacío. */
  let roturaLinea: { codigo: string; descripcion: string; unidades: number; almacen: string; unidades_por_caja: number | null; cajas_por_estiba: number | null }[] = [];
  if (b.fecha) {
    try {
      const [pas, maes] = await Promise.all([leerPasivos(b.fecha, b.fecha), leerMaestroPasivos()]);
      const m = new Map(maes.data.map((x) => [x.codigo, x]));
      roturaLinea = pas.data.filter((f) => /ROTURA\s+DE\s+L[IÍ]NEA/i.test(f.causal))
        .map((f) => ({ codigo: f.codigo, descripcion: f.descripcion, unidades: Number(f.unidades) || 0, almacen: f.almacen,
          unidades_por_caja: m.get(f.codigo)?.unidades_por_caja ?? null, cajas_por_estiba: m.get(f.codigo)?.cajas_por_estiba ?? null }));
    } catch { roturaLinea = [] }
  }

  return (
    <div className="fe bal">
      <Balance bloques={b.bloques} detalle={b.detalle} error={b.error} fecha={b.fecha} dias={b.dias}
               fechaCasco={b.fechaCasco} diasCasco={b.diasCasco} consolidado={b.consolidado} reasignaciones={b.reasignaciones} roturaLinea={roturaLinea} />
    </div>
  );
}
