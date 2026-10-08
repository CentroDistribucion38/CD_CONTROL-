import { createClient } from "@/lib/supabase/server";
import { todas } from "@/modulos/inventario/paginas";
import { sitiosCasco, materialesCasco } from "@/modulos/casco/datos";
import type { Punto } from "@/modulos/casco/serie";
import "../../fefo.css";
import "./tablero.css";
import { TableroCasco } from "./TableroCasco";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · CASCO DE VIDRIO · TABLERO.
 *
 * «Dentro del módulo quiero el tablero, o sea el control»: la gráfica de ENVASES PENDIENTES POR
 * PARTIR (HL) por día y por sitio, la dinámica fecha × ubicación con su total general, los
 * filtros de SKU, periodo y ubicación, y los viajes SERPRO. Lo que en el Excel era la hoja PARTIR.
 *
 * Se leen TODOS los renglones (por páginas: PostgREST corta en 1.000 sin avisar) y se filtra en
 * el navegador, para que cambiar un filtro no espere a la red.
 */
export default async function TableroCascoPage() {
  const [sitios, materiales] = await Promise.all([sitiosCasco(), materialesCasco()]);
  if (sitios.sinTabla) {
    return (
      <div className="fe">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · TABLERO</p>
          <h1>Falta crear esta parte en Supabase</h1>
          <p className="sub">Corre <b>supabase/migraciones/2026-10-casco-de-vidrio.sql</b> y después el del historial de PARTIR.</p>
        </div></section>
      </div>
    );
  }

  const supabase = await createClient();
  const r = await todas<{ fecha: string; ubicacion: string; sku: string; hl: number | string; inventario: number | string | null; baja: number | string | null }>((d, h) =>
    supabase.from("casco_registros").select("fecha, ubicacion, sku, hl, inventario, baja")
      .order("fecha").order("ubicacion").order("sku").range(d, h));

  const puntos: Punto[] = r.data.map((x) => ({
    fecha: x.fecha, ubicacion: x.ubicacion, sku: x.sku, hl: Number(x.hl),
    inventario: x.inventario == null ? null : Number(x.inventario), baja: x.baja == null ? null : Number(x.baja),
  }));
  const nombres = Object.fromEntries(materiales.map((m) => [m.sku, m.nombre]));

  return (
    <div className="fe cvt">
      <TableroCasco puntos={puntos} sitios={sitios.lista} nombres={nombres} errorLectura={r.error} />
    </div>
  );
}
