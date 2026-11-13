import { misPermisos } from "@/lib/permisos";
import { maestroInventario } from "@/modulos/inventario/fefo";
import { createClient } from "@/lib/supabase/server";
import { diaColombia } from "@/modulos/inventario/corte";
import { hojasParaContar, type MiHojaBD } from "@/modulos/inventario/fiscal";
import { separarPorTipo } from "@/modulos/inventario/fiscal-tipos";
import "../../fefo.css";
import "../../conteo/asignado.css";
import "../../conteo/revisiones.css";
import "../../conteo/familias.css";
import "../../conteo/cruce-ciclico.css";
import { ContarFiscal } from "../../conteo/ContarFiscal";
import { FiscalAsignado } from "../../conteo/FiscalAsignado";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · PRODUCTO · CONTAR.
 *
 * «En Contar solo se habilita el cíclico, y cualquiera de los dos da clic para ir cruzando: solo se requiere
 *  SKU y cantidad, exactamente lo mismo del Contar del fiscal.»
 *
 * Aquí sale SOLO el inventario cíclico que le habilitaron a esta persona (nada del FEFO diario ni del fiscal):
 * el mismo renglón del Contar fiscal —dónde, código y cantidad, sin fecha— y debajo el cruce con su pareja.
 */
export default async function ContarProductoPage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestroInventario()]);
  const cabeza = (
    <section className="cabeza">
      <div>
        <p className="ojo">INVENTARIO · PRODUCTO · CÍCLICO</p>
        <h1>Contar</h1>
        <p className="sub">
          Cuenta tu hoja del inventario cíclico: el sitio, el código y la cantidad. Cada renglón queda guardado al momento
          con tu nombre. Cuando quieras, tú o tu pareja pueden <b>cruzar</b> para ver qué no coincide.
        </p>
      </div>
    </section>
  );

  if (m.falta) {
    return (
      <div className="fe contando">
        {cabeza}
        <section className="sin-tablas">
          <h2>Falta preparar el conteo en Supabase</h2>
          <p>Abre el SQL Editor y ejecuta <code>supabase/migraciones/2026-09-inventario-fefo.sql</code>.</p>
        </section>
      </div>
    );
  }
  const conUbicaciones = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => conUbicaciones.has(b.id)) ?? m.bodegas[0] ?? null;
  if (!bodega) {
    return (
      <div className="fe contando">
        {cabeza}
        <section className="sin-tablas"><h2>No hay bodega con ubicaciones</h2><p>Primero hacen falta las ubicaciones (Maestro).</p></section>
      </div>
    );
  }
  const ubis = m.ubicaciones.filter((u) => u.bodega_id === bodega.id);

  const sb = await createClient();
  const r = await sb.rpc("inv_fiscal_mis_hojas");
  const sep = r.error ? { fiscal: [], ciclico: [] as MiHojaBD[], conTipo: false } : await separarPorTipo(sb, (r.data ?? []) as MiHojaBD[]);
  const hoy = diaColombia(new Date().toISOString());
  const hojas = hojasParaContar(sep.ciclico);
  void permisos;

  return (
    <div className="fe contando">
      {cabeza}
      {!sep.conTipo && (
        <section className="sin-tablas">
          <h2>Falta preparar el inventario cíclico en Supabase</h2>
          <p>Abre el SQL Editor y ejecuta <code>supabase/migraciones/2026-11-producto-ciclico.sql</code>.</p>
        </section>
      )}
      <FiscalAsignado filas={sep.ciclico} hoy={hoy} />
      {hojas.length > 0 ? (
        <ContarFiscal ciclico hojas={hojas} bodegaId={bodega.id} materiales={m.materiales} ubicaciones={ubis} />
      ) : (
        <section className="fe-espera" role="status">
          <p className="fe-espera-ojo">EN ESPERA</p>
          <h2>Aún no te han habilitado un inventario cíclico</h2>
          <p>
            Cuando quien arma el cíclico te asigne una hoja y le dé «Mostrar en Contar», aparece aquí solo. Recarga la
            pantalla cuando te avisen.
          </p>
        </section>
      )}
    </div>
  );
}
