import { createClient } from "@/lib/supabase/server";
import { modulosVisibles } from "@/modulos/registro";
import { TarjetaModulo, type DatoPie } from "@/components/TarjetaModulo";
import { fmtNum } from "@/lib/formato";

export const dynamic = "force-dynamic";

/**
 * Datos del pie de cada tarjeta. Cada consulta va aislada: si una falla o el
 * módulo todavía no tiene tablas, esa tarjeta se queda sin dato y la portada
 * sigue funcionando.
 */
async function datosPorModulo(): Promise<Record<string, DatoPie>> {
  const supabase = await createClient();
  const datos: Record<string, DatoPie> = {};

  const [productos, quiebrasPendientes, existencias] = await Promise.allSettled([
    supabase.from("productos").select("*", { count: "exact", head: true }).eq("activo", true),
    supabase.from("quiebras").select("*", { count: "exact", head: true }).eq("estado", "reportada"),
    supabase.from("v_existencias").select("cantidad"),
  ]);

  if (productos.status === "fulfilled" && productos.value.count !== null) {
    datos.inventario = { texto: `${fmtNum(productos.value.count)} materiales` };
  }

  if (quiebrasPendientes.status === "fulfilled" && quiebrasPendientes.value.count !== null) {
    const n = quiebrasPendientes.value.count;
    datos.quiebra =
      n > 0
        ? { texto: `${n} por aprobar`, enAlerta: true }
        : { texto: "Sin pendientes" };
  }

  if (existencias.status === "fulfilled" && existencias.value.data) {
    const total = existencias.value.data.reduce(
      (a, f) => a + Number((f as { cantidad: number }).cantidad ?? 0),
      0
    );
    datos.__unidades = { texto: fmtNum(total) };
  }

  return datos;
}

export default async function PortadaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, rol")
    .eq("id", user!.id)
    .single();

  const rol = perfil?.rol ?? "operador";
  const modulos = modulosVisibles(rol);
  const datos = await datosPorModulo();

  const unidades = datos.__unidades?.texto;
  const pendientes = datos.quiebra?.enAlerta ? datos.quiebra.texto : null;

  const resumen = [
    unidades ? `${unidades} unidades en existencia` : null,
    pendientes ? `${pendientes.replace(" por aprobar", "")} averías por aprobar` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-[22px] font-medium">
          Selecciona el módulo con el que vas a trabajar
        </h1>
        {resumen.length > 0 && (
          <p className="mt-1 text-[13px]" style={{ color: "var(--bv-texto-2)" }}>
            {resumen.join(" · ")}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.map((m) => (
          <TarjetaModulo key={m.id} m={m} dato={datos[m.id]} />
        ))}
      </div>
    </div>
  );
}
