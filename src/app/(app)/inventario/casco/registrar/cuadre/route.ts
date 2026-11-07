import { misPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import { materialesCasco, sitiosCasco } from "@/modulos/casco/datos";
import { cargarCuadre } from "@/modulos/casco/cuadre";
import { construirLibroCuadre } from "@/modulos/casco/cuadre-excel";

export const dynamic = "force-dynamic";

/**
 * EXPORTAR LA VALIDACIÓN «AYER + BAJAS = HOY» A EXCEL (Casco → Registrar → Baja → Exportar).
 *
 * Es el mismo cálculo que muestra la pantalla (`@/modulos/casco/cuadre`), escrito en un libro: Resumen, una hoja por
 * tabla de Control con la cuenta material por material (fórmulas vivas) y las bajas del día.
 * ?fecha=AAAA-MM-DD (por defecto, hoy en hora de Colombia).
 */
export async function GET(req: Request) {
  const permisos = await misPermisos();
  if (!permisos.puedeVer("/inventario/casco/registrar")) return new Response("Sin permiso", { status: 403 });

  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
  const pedida = new URL(req.url).searchParams.get("fecha") ?? "";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida <= hoy ? pedida : hoy;

  const [sitios, materiales] = await Promise.all([sitiosCasco(), materialesCasco()]);
  if (sitios.sinTabla) return new Response("Falta crear las tablas de casco de vidrio en Supabase.", { status: 409 });

  const supabase = await createClient();
  const r = await cargarCuadre(supabase, fecha, sitios.lista, materiales);
  if ("error" in r) return new Response("No se pudo calcular: " + r.error, { status: 500 });

  const wb = construirLibroCuadre(r.cuadre);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Casco_ayer-mas-bajas-igual-hoy_${fecha}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
