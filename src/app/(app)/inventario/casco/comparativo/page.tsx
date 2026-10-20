import { createClient } from "@/lib/supabase/server";
import { todas } from "@/modulos/inventario/paginas";
import { sitiosCasco, materialesCasco } from "@/modulos/casco/datos";
import { rellenarInventario, type Punto } from "@/modulos/casco/serie";
import "../../fefo.css";
import "../tablero/tablero.css";
import "./comparativo.css";
import { Comparativo } from "./Comparativo";
import type { ConteoDia } from "./TablaUbicacion";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · CASCO DE VIDRIO · COMPARATIVO.
 *
 * Dos días contra dos días: qué cambió entre el día A y el día B (por almacén, por material y por
 * material en cada almacén), en HL, estibas o cajas. Lee lo mismo que el Tablero —todo el casco en un
 * solo paquete— y compara en el navegador, para que cambiar una fecha no espere a la red.
 */
export default async function ComparativoCascoPage() {
  const [sitios, materiales] = await Promise.all([sitiosCasco(), materialesCasco()]);
  if (sitios.sinTabla) {
    return (
      <div className="fe">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · COMPARATIVO</p>
          <h1>Falta crear esta parte en Supabase</h1>
          <p className="sub">Corre <b>supabase/migraciones/2026-10-casco-de-vidrio.sql</b> y después el del historial de PARTIR.</p>
        </div></section>
      </div>
    );
  }

  const supabase = await createClient();
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
  /* Los sitios que un día no se registraron siguen mostrando su último inventario. */
  puntos = rellenarInventario(puntos);

  const nombres = Object.fromEntries(materiales.map((m) => [m.sku, m.nombre]));

  /* CAJAS POR ESTIBA, para pasar estibas a cajas: las del maestro de productos. El que no la trae sale
     sin cajas (nunca se inventa). */
  const { data: ps } = await supabase.from("productos")
    .select("sku, cajas_por_estiba, unidades_por_estiba, unidades_por_caja, hl").eq("activo", true).limit(3000);
  const cajasPorEstiba: Record<string, number | null> = {};
  /* HL de una estiba según el maestro (HL de una unidad × unidades por estiba): para los materiales que no son casco. */
  const hlPorEstibaMaestro: Record<string, number | null> = {};
  for (const p of ps ?? []) {
    const directo = p.cajas_por_estiba != null ? Number(p.cajas_por_estiba) : null;
    const deBotellas = p.unidades_por_estiba != null && p.unidades_por_caja ? Number(p.unidades_por_estiba) / Number(p.unidades_por_caja) : null;
    cajasPorEstiba[String(p.sku)] = directo || deBotellas || null;
    hlPorEstibaMaestro[String(p.sku)] = p.hl != null && p.unidades_por_estiba != null && Number(p.hl) > 0 ? Number(p.hl) * Number(p.unidades_por_estiba) : null;
  }

  /* LOS CONTEOS FÍSICOS CERRADOS de la bodega del último conteo (de los últimos 120 días), para la Tabla por
     ubicación: ahí se leen solo los dos que se comparan. Si no se pueden leer, la tabla lo dice. */
  let conteos: ConteoDia[] = [];
  try {
    const { data: ult } = await supabase.from("v_conteos_fefo").select("fecha_analisis, bodega_id")
      .eq("estado", "cerrado").not("fecha_analisis", "is", null).order("fecha_analisis", { ascending: false }).limit(1);
    if (ult?.length) {
      const hasta = String(ult[0].fecha_analisis).slice(0, 10);
      const desde = new Date(Date.parse(hasta + "T12:00:00Z") - 120 * 86400000).toISOString().slice(0, 10);
      const r = await todas<{ id: string; fecha_analisis: string }>((d, h) => supabase.from("v_conteos_fefo")
        .select("id, fecha_analisis").eq("bodega_id", ult[0].bodega_id).eq("estado", "cerrado")
        .gte("fecha_analisis", desde).lte("fecha_analisis", hasta).order("id").range(d, h));
      conteos = r.data.map((c) => ({ id: c.id, fecha: String(c.fecha_analisis).slice(0, 10) }));
    }
  } catch { conteos = [] }

  return (
    <div className="fe cvt cvc">
      <Comparativo puntos={puntos} sitios={sitios.lista} nombres={nombres} cajasPorEstiba={cajasPorEstiba} hlPorEstibaMaestro={hlPorEstibaMaestro} errorLectura={errorLectura} conteos={conteos} />
    </div>
  );
}
