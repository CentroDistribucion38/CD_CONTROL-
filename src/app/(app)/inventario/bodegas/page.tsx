import { createClient } from "@/lib/supabase/server";
import { crearBodega } from "@/modulos/inventario/acciones";

export const dynamic = "force-dynamic";

export default async function BodegasPage() {
  const supabase = await createClient();
  const { data: bodegas } = await supabase
    .from("bodegas")
    .select("*")
    .order("codigo");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Bodegas</h1>
        <p className="text-sm text-tinta-500">Ubicaciones de almacenamiento</p>
      </header>

      <form action={crearBodega} className="tarjeta grid gap-4 md:grid-cols-4">
        <div>
          <label className="etiqueta">Código *</label>
          <input name="codigo" className="campo" required />
        </div>
        <div>
          <label className="etiqueta">Nombre *</label>
          <input name="nombre" className="campo" required />
        </div>
        <div className="md:col-span-2">
          <label className="etiqueta">Dirección</label>
          <input name="direccion" className="campo" />
        </div>
        <div className="md:col-span-4">
          <button className="btn-primario">Agregar bodega</button>
        </div>
      </form>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Dirección</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(bodegas ?? []).map((b) => (
              <tr key={b.id}>
                <td className="font-mono text-xs">{b.codigo}</td>
                <td>{b.nombre}</td>
                <td className="text-tinta-500">{b.direccion ?? "—"}</td>
                <td>{b.activo ? "Activa" : "Inactiva"}</td>
              </tr>
            ))}
            {(!bodegas || bodegas.length === 0) && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-tinta-400">
                  Aún no hay bodegas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
