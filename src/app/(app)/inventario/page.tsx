import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtCOP, fmtNum, fmtFecha } from "@/lib/formato";

export const dynamic = "force-dynamic";

type FilaExistencia = {
  sku: string;
  producto: string;
  bodega_nombre: string;
  cantidad: number;
  stock_min: number;
  bajo_minimo: boolean;
  valor: number;
  unidad: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: existencias }, { data: movimientos }, { count: nProductos }] =
    await Promise.all([
      supabase.from("v_existencias").select("*").returns<FilaExistencia[]>(),
      supabase
        .from("movimientos")
        .select("id, fecha, tipo, cantidad, referencia, productos(sku, nombre)")
        .order("fecha", { ascending: false })
        .limit(8),
      supabase
        .from("productos")
        .select("*", { count: "exact", head: true })
        .eq("activo", true),
    ]);

  const filas = existencias ?? [];
  const valorTotal = filas.reduce((a, f) => a + Number(f.valor ?? 0), 0);
  const bajoMinimo = filas.filter((f) => f.bajo_minimo);

  const tarjetas = [
    { titulo: "Productos activos", valor: fmtNum(nProductos ?? 0) },
    { titulo: "Valor del inventario", valor: fmtCOP(valorTotal) },
    { titulo: "Referencias bajo mínimo", valor: fmtNum(bajoMinimo.length) },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Inventario</h1>
        <p className="text-sm text-tinta-500">Estado general del módulo</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="tarjeta">
            <p className="text-xs uppercase tracking-wide text-tinta-500">
              {t.titulo}
            </p>
            <p className="mt-2 text-2xl font-semibold">{t.valor}</p>
          </div>
        ))}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="tarjeta">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Bajo mínimo</h2>
            <Link href="/inventario/productos" className="text-xs text-tinta-500 hover:underline">
              Ver productos
            </Link>
          </div>
          {bajoMinimo.length === 0 ? (
            <p className="py-6 text-center text-sm text-tinta-400">
              Sin alertas de stock.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Bodega</th>
                    <th className="text-right">Saldo</th>
                    <th className="text-right">Mín.</th>
                  </tr>
                </thead>
                <tbody>
                  {bajoMinimo.slice(0, 10).map((f) => (
                    <tr key={`${f.sku}-${f.bodega_nombre}`}>
                      <td className="font-mono text-xs">{f.sku}</td>
                      <td>{f.producto}</td>
                      <td className="text-tinta-500">{f.bodega_nombre}</td>
                      <td className="text-right font-medium text-red-600">
                        {fmtNum(f.cantidad)}
                      </td>
                      <td className="text-right text-tinta-500">
                        {fmtNum(f.stock_min)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="tarjeta">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Últimos movimientos</h2>
            <Link href="/inventario/movimientos" className="text-xs text-tinta-500 hover:underline">
              Ver todos
            </Link>
          </div>
          {!movimientos || movimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-tinta-400">
              Todavía no hay movimientos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Producto</th>
                    <th className="text-right">Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const p = (m as any).productos;
                    return (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap text-tinta-500">
                          {fmtFecha(m.fecha)}
                        </td>
                        <td className="capitalize">{m.tipo}</td>
                        <td>{p?.nombre ?? "—"}</td>
                        <td className="text-right font-medium">
                          {fmtNum(m.cantidad)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
