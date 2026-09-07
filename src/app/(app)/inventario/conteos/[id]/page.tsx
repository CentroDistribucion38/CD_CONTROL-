import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { guardarLinea, cerrarConteo } from "@/modulos/inventario/acciones";
import { fmtCOP, fmtNum } from "@/lib/formato";

export const dynamic = "force-dynamic";

type Linea = {
  id: string;
  cantidad_teorica: number;
  cantidad_contada: number | null;
  nota: string | null;
  productos: { sku: string; nombre: string; unidad: string; costo_unitario: number } | null;
};

export default async function ConteoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conteo } = await supabase
    .from("conteos")
    .select("id, codigo, estado, nota, bodegas(codigo, nombre)")
    .eq("id", id)
    .single();

  if (!conteo) notFound();

  const { data: lineasRaw } = await supabase
    .from("conteo_lineas")
    .select(
      "id, cantidad_teorica, cantidad_contada, nota, productos(sku, nombre, unidad, costo_unitario)"
    )
    .eq("conteo_id", id);

  const lineas = ((lineasRaw ?? []) as unknown as Linea[]).sort((a, b) =>
    (a.productos?.sku ?? "").localeCompare(b.productos?.sku ?? "")
  );

  const contadas = lineas.filter((l) => l.cantidad_contada !== null);
  const conDiferencia = contadas.filter(
    (l) => Number(l.cantidad_contada) !== Number(l.cantidad_teorica)
  );
  const impacto = conDiferencia.reduce(
    (a, l) =>
      a +
      (Number(l.cantidad_contada) - Number(l.cantidad_teorica)) *
        Number(l.productos?.costo_unitario ?? 0),
    0
  );
  const abierto = conteo.estado === "en_proceso";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodega = (conteo as any).bodegas;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/inventario/conteos" className="text-xs text-tinta-500 hover:underline">
            ← Conteos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{conteo.codigo}</h1>
          <p className="text-sm text-tinta-500">
            {bodega ? `${bodega.codigo} · ${bodega.nombre}` : "—"} ·{" "}
            {conteo.estado.replace("_", " ")}
          </p>
        </div>

        {abierto && (
          <form action={cerrarConteo}>
            <input type="hidden" name="conteo_id" value={conteo.id} />
            <button className="btn-primario">
              Cerrar y generar ajustes ({conDiferencia.length})
            </button>
          </form>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-tinta-500">Líneas</p>
          <p className="mt-1 text-xl font-semibold">{lineas.length}</p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-tinta-500">Contadas</p>
          <p className="mt-1 text-xl font-semibold">{contadas.length}</p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-tinta-500">Con diferencia</p>
          <p className="mt-1 text-xl font-semibold">{conDiferencia.length}</p>
        </div>
        <div className="tarjeta">
          <p className="text-xs uppercase tracking-wide text-tinta-500">Impacto</p>
          <p
            className={`mt-1 text-xl font-semibold ${
              impacto < 0 ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {fmtCOP(impacto)}
          </p>
        </div>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th className="text-right">Teórico</th>
              <th className="w-40">Contado</th>
              <th className="text-right">Diferencia</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => {
              const dif =
                l.cantidad_contada === null
                  ? null
                  : Number(l.cantidad_contada) - Number(l.cantidad_teorica);
              return (
                <tr key={l.id}>
                  <td className="font-mono text-xs">{l.productos?.sku}</td>
                  <td>
                    {l.productos?.nombre}
                    <span className="ml-1 text-xs text-tinta-400">
                      ({l.productos?.unidad})
                    </span>
                  </td>
                  <td className="text-right text-tinta-500">
                    {fmtNum(l.cantidad_teorica)}
                  </td>
                  <td colSpan={3} className="p-0">
                    <form action={guardarLinea} className="flex items-center gap-2 px-3 py-1">
                      <input type="hidden" name="linea_id" value={l.id} />
                      <input type="hidden" name="conteo_id" value={conteo.id} />
                      <input
                        name="cantidad_contada"
                        type="number"
                        step="0.001"
                        className="campo w-28 py-1"
                        defaultValue={l.cantidad_contada ?? ""}
                        disabled={!abierto}
                      />
                      <span
                        className={`w-24 text-right text-sm font-medium ${
                          dif === null
                            ? "text-tinta-300"
                            : dif === 0
                              ? "text-tinta-400"
                              : dif < 0
                                ? "text-red-600"
                                : "text-emerald-700"
                        }`}
                      >
                        {dif === null ? "—" : `${dif > 0 ? "+" : ""}${fmtNum(dif)}`}
                      </span>
                      <input
                        name="nota"
                        className="campo flex-1 py-1"
                        placeholder="Nota"
                        defaultValue={l.nota ?? ""}
                        disabled={!abierto}
                      />
                      {abierto && (
                        <button className="btn-secundario px-3 py-1 text-xs">
                          Guardar
                        </button>
                      )}
                    </form>
                  </td>
                </tr>
              );
            })}
            {lineas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-tinta-400">
                  Este conteo no tiene líneas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
