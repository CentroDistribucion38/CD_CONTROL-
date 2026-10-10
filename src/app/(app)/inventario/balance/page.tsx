import { createClient } from "@/lib/supabase/server";
import "../../fefo.css";
import "./balance.css";
import { Balance } from "./Balance";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE
 *
 * El cruce del ultimo conteo FEFO contra el casco de vidrio: las cinco tablas
 * dinamicas que hoy el analista arma a mano en "CONTEO FABRICA.xlsx".
 *
 * Las vistas v_balance y v_balance_bloques hacen todo el calculo. La pagina
 * solo lee y presenta.
 */
export default async function BalancePage() {
  const supabase = await createClient();

  /* Probar si la vista existe: si no, el usuario no ha corrido el SQL. */
  const prueba = await supabase.from("v_balance_bloques").select("fecha").limit(1);
  if (prueba.error && /v_balance_bloques|PGRST|relation|does not exist/i.test(
    `${prueba.error.code} ${prueba.error.message}`)) {
    return (
      <div className="fe">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · BALANCE</p>
          <h1>Falta crear esta parte en Supabase</h1>
          <p className="sub">
            Abre el editor de SQL y corre <b>supabase/migraciones/2026-10-balance.sql</b>.
            Se puede correr varias veces sin romper nada.
          </p>
        </div></section>
      </div>
    );
  }

  /* Los bloques: un renglon por cada combinacion estado x alcance. */
  const { data: bloques, error: errBloques } = await supabase
    .from("v_balance_bloques")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(10);

  /* El detalle: todos los renglones del ultimo conteo. */
  const { data: detalle, error: errDetalle } = await supabase
    .from("v_balance")
    .select("*")
    .order("codigo");

  const error = errBloques?.message || errDetalle?.message || null;

  return (
    <div className="fe bal">
      <Balance
        bloques={bloques ?? []}
        detalle={detalle ?? []}
        error={error}
      />
    </div>
  );
}
