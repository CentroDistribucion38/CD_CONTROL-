import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { crearConteo } from "@/modulos/inventario/acciones";
import { fmtFecha } from "@/lib/formato";

export const dynamic = "force-dynamic";

const COLOR_ESTADO: Record<string, string> = {
  borrador: "bg-tinta-100 text-tinta-700",
  en_proceso: "bg-amber-100 text-amber-800",
  cerrado: "bg-emerald-100 text-emerald-800",
  anulado: "bg-red-100 text-red-700",
};

export default async function ConteosPage() {
  const supabase = await createClient();

  const [{ data: bodegas }, { data: conteos }] = await Promise.all([
    supabase.from("bodegas").select("id, codigo, nombre").eq("activo", true).order("codigo"),
    supabase
      .from("conteos")
      .select("id, codigo, estado, iniciado_en, cerrado_en, bodegas(codigo, nombre)")
      .order("creado_en", { ascending: false }),
  ]);

  const sugerido = `CT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-01`;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Conteos físicos</h1>
        <p className="text-sm text-tinta-500">
          Toma física, diferencias contra teórico y ajuste automático
        </p>
      </header>

      <form action={crearConteo} className="tarjeta grid gap-4 md:grid-cols-4">
        <div>
          <label className="etiqueta">Código *</label>
          <input name="codigo" className="campo" defaultValue={sugerido} required />
        </div>
        <div>
          <label className="etiqueta">Bodega *</label>
          <select name="bodega_id" className="campo" required>
            <option value="">Selecciona…</option>
            {(bodegas ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} · {b.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiqueta">Nota</label>
          <input name="nota" className="campo" />
        </div>
        <div className="flex items-end">
          <button className="btn-primario w-full">Abrir conteo</button>
        </div>
        <p className="text-xs text-tinta-400 md:col-span-4">
          Al abrirlo se congela el saldo teórico de todos los productos activos de esa bodega.
        </p>
      </form>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th>Bodega</th>
              <th>Estado</th>
              <th>Iniciado</th>
              <th>Cerrado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(conteos ?? []).map((c) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const b = (c as any).bodegas;
              return (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.codigo}</td>
                  <td>{b ? `${b.codigo} · ${b.nombre}` : "—"}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        COLOR_ESTADO[c.estado] ?? "bg-tinta-100"
                      }`}
                    >
                      {c.estado.replace("_", " ")}
                    </span>
                  </td>
                  <td className="text-tinta-500">{fmtFecha(c.iniciado_en)}</td>
                  <td className="text-tinta-500">{fmtFecha(c.cerrado_en)}</td>
                  <td className="text-right">
                    <Link href={`/inventario/conteos/${c.id}`} className="text-sm hover:underline">
                      Abrir →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(!conteos || conteos.length === 0) && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-tinta-400">
                  Aún no hay conteos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
