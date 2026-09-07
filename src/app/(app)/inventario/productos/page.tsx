import { createClient } from "@/lib/supabase/server";
import { crearProducto } from "@/modulos/inventario/acciones";
import { fmtCOP, fmtNum } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const supabase = await createClient();
  const { data: productos } = await supabase
    .from("productos")
    .select("*")
    .order("sku");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Productos</h1>
        <p className="text-sm text-tinta-500">Catálogo de referencias</p>
      </header>

      <form action={crearProducto} className="tarjeta grid gap-4 md:grid-cols-4">
        <div>
          <label className="etiqueta">SKU *</label>
          <input name="sku" className="campo" required />
        </div>
        <div className="md:col-span-2">
          <label className="etiqueta">Nombre *</label>
          <input name="nombre" className="campo" required />
        </div>
        <div>
          <label className="etiqueta">Código de barras</label>
          <input name="codigo_barras" className="campo" />
        </div>
        <div>
          <label className="etiqueta">Categoría</label>
          <input name="categoria" className="campo" />
        </div>
        <div>
          <label className="etiqueta">Unidad</label>
          <input name="unidad" className="campo" defaultValue="UND" />
        </div>
        <div>
          <label className="etiqueta">Costo unitario</label>
          <input name="costo_unitario" type="number" step="0.01" className="campo" defaultValue={0} />
        </div>
        <div>
          <label className="etiqueta">Stock mínimo</label>
          <input name="stock_min" type="number" step="0.001" className="campo" defaultValue={0} />
        </div>
        <div className="md:col-span-4">
          <button className="btn-primario">Agregar producto</button>
        </div>
      </form>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Unidad</th>
              <th className="text-right">Costo</th>
              <th className="text-right">Stock mín.</th>
            </tr>
          </thead>
          <tbody>
            {(productos ?? []).map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.sku}</td>
                <td>{p.nombre}</td>
                <td className="text-tinta-500">{p.categoria ?? "—"}</td>
                <td>{p.unidad}</td>
                <td className="text-right">{fmtCOP(p.costo_unitario)}</td>
                <td className="text-right">{fmtNum(p.stock_min)}</td>
              </tr>
            ))}
            {(!productos || productos.length === 0) && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-tinta-400">
                  Aún no hay productos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
