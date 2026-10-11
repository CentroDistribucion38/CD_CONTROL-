import { createClient } from "@/lib/supabase/server";
import { balanceDelDia } from "@/modulos/inventario/balance";
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
export default async function BalancePage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
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

  const b = await balanceDelDia(/^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : null);

  return (
    <div className="fe bal">
      <Balance bloques={b.bloques} detalle={b.detalle} error={b.error} fecha={b.fecha} dias={b.dias} />
    </div>
  );
}
