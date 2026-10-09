import { createClient } from "@/lib/supabase/server";
import { todas } from "@/modulos/inventario/paginas";
import { sitiosCasco, materialesCasco } from "@/modulos/casco/datos";
import { ubicacionesDelInventario } from "@/modulos/casco/ubicaciones-inventario";
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
  const [sitios, materiales, delInventario] = await Promise.all([sitiosCasco(), materialesCasco(), ubicacionesDelInventario()]);
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

  /* TODO EL CASCO EN UNA SOLA LECTURA: `casco_tablero_datos()` revisa el permiso una vez y devuelve
     todos los renglones en un paquete. Leer la tabla por páginas, con el permiso revisado en cada
     renglón, se pasaba del tiempo límite («statement timeout») con todo el historial. */
  type Crudo = [string, string, string, number | string, number | string | null, number | string | null, string | null, string | null];
  const num = (v: number | string | null) => (v == null ? null : Number(v));
  let puntos: Punto[] = [];
  let errorLectura: string | null = null;
  const rpc = await supabase.rpc("casco_tablero_datos");
  if (!rpc.error) {
    puntos = ((rpc.data ?? []) as Crudo[]).map((x) => ({
      fecha: x[0], ubicacion: x[1], sku: x[2], hl: Number(x[3]),
      inventario: num(x[4]), baja: num(x[5]), puesto: x[6] ?? null, calidad: x[7] ?? null,
    }));
  } else if (/casco_tablero_datos|PGRST202|could not find the function/i.test(`${rpc.error.code} ${rpc.error.message}`)) {
    /* Todavía no se corrió 2026-10-casco-tablero-rapido.sql: se lee como antes, por páginas. */
    type Fila = { fecha: string; ubicacion: string; sku: string; hl: number | string; inventario: number | string | null; baja: number | string | null };
    const r = await todas<Fila>((d, h) =>
      supabase.from("casco_registros").select("fecha, ubicacion, sku, hl, inventario, baja")
        .order("fecha").order("ubicacion").order("sku").range(d, h));
    errorLectura = r.error ? `${r.error}. Corre en Supabase supabase/migraciones/2026-10-casco-tablero-rapido.sql` : null;
    puntos = r.data.map((x) => ({
      fecha: x.fecha, ubicacion: x.ubicacion, sku: x.sku, hl: Number(x.hl),
      inventario: num(x.inventario), baja: num(x.baja), puesto: null, calidad: null,
    }));
  } else {
    errorLectura = rpc.error.message;
  }
  const nombres = Object.fromEntries(materiales.map((m) => [m.sku, m.nombre]));

  return (
    <div className="fe cvt">
      <TableroCasco puntos={puntos} sitios={sitios.lista} nombres={nombres} errorLectura={errorLectura} delInventario={delInventario} />
    </div>
  );
}
