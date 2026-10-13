import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { diasConConteo } from "@/modulos/inventario/balance";
import { diasConPasivos, leerCierresPasivos, leerMaestroPasivos, leerPasivos } from "@/modulos/pasivos/datos";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "./pasivos.css";
import { Pasivos } from "./Pasivos";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · PASIVOS — la base (la hoja DATA de BLOQUEADOS.xlsx).
 *
 * Se alimenta del balance (la diferencia en unidades de cada hoja) y de un archivo plano con la baja
 * proyectada y la rotura de línea. Lo demás lo calcula la base con el Maestro de Pasivos.
 */
export default async function PasivosPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; vista?: string }> }) {
  const q = await searchParams;
  const supabase = await createClient();
  const prueba = await supabase.from("pasivos_base").select("id").limit(1);
  if (prueba.error && /pasivos_base|PGRST|relation|does not exist/i.test(`${prueba.error.code} ${prueba.error.message}`)) {
    return (
      <div className="fe">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · BALANCE · PASIVOS</p>
          <h1>Falta crear esta parte en Supabase</h1>
          <p className="sub">Abre el editor de SQL y corre <b>supabase/migraciones/2026-10-pasivos.sql</b>. Se puede correr varias veces.</p>
        </div></section>
      </div>
    );
  }

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
  const dia = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : null);
  const [permisos, dias, conteo, maestro, cierres] = await Promise.all([misPermisos(), diasConPasivos(), diasConConteo(), leerMaestroPasivos(), leerCierresPasivos()]);
  /* Por defecto: el último día con algo cargado (o hoy). */
  const ultimo = dias[dias.length - 1] ?? hoy;
  const desde = dia(q.desde) ?? ultimo;
  const hasta = dia(q.hasta) ?? (dia(q.desde) ? desde : ultimo);
  const filas = await leerPasivos(desde <= hasta ? desde : hasta, desde <= hasta ? hasta : desde);

  return (
    <div className="fe bal pas">
      <Pasivos
        filas={filas.data} error={filas.error} desde={desde} hasta={hasta} dias={dias}
        diasConteo={conteo.dias} codigos={maestro.data.map((m) => m.codigo)}
        puedeEditar={permisos.puedeEditar("/inventario/balance/pasivos")}
        cierres={cierres.data} faltaCierres={cierres.falta} vista={q.vista === "historico" ? "historico" : "base"}
      />
    </div>
  );
}
