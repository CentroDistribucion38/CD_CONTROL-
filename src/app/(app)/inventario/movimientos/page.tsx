import { createClient } from "@/lib/supabase/server";
import { FormMovimiento } from "@/components/FormMovimiento";
import { fmtNum, fmtFecha } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function MovimientosPage() {
  const supabase = await createClient();

  const [{ data: productos }, { data: bodegas }, { data: movimientos }] =
    await Promise.all([
      supabase.from("productos").select("id, sku, nombre").eq("activo", true).order("sku"),
      supabase.from("bodegas").select("id, codigo, nombre").eq("activo", true).order("codigo"),
      supabase
        .from("movimientos")
        .select(
          "id, fecha, tipo, cantidad, referencia, nota, productos(sku, nombre), bodegas!movimientos_bodega_id_fkey(codigo)"
        )
        .order("fecha", { ascending: false })
        .limit(100),
    ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <p className="text-sm text-tinta-500">Kardex de entradas, salidas y ajustes</p>
      </header>

      <FormMovimiento
        productos={(productos ?? []).map((p) => ({
          id: p.id,
          etiqueta: `${p.sku} · ${p.nombre}`,
        }))}
        bodegas={(bodegas ?? []).map((b) => ({
          id: b.id,
          etiqueta: `${b.codigo} · ${b.nombre}`,
        }))}
      />

      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Bodega</th>
              <th className="text-right">Cantidad</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {(movimientos ?? []).map((m) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const x = m as any;
              return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-tinta-500">{fmtFecha(m.fecha)}</td>
                  <td className="capitalize">{m.tipo}</td>
                  <td>
                    <span className="font-mono text-xs text-tinta-500">
                      {x.productos?.sku}
                    </span>{" "}
                    {x.productos?.nombre}
                  </td>
                  <td>{x.bodegas?.codigo ?? "—"}</td>
                  <td className="text-right font-medium">{fmtNum(m.cantidad)}</td>
                  <td className="text-tinta-500">{m.referencia ?? "—"}</td>
                </tr>
              );
            })}
            {(!movimientos || movimientos.length === 0) && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-tinta-400">
                  Aún no hay movimientos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
