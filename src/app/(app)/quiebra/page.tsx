import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { aprobarQuiebra, rechazarQuiebra } from "@/modulos/quiebra/acciones";
import { fmtCOP, fmtNum, fmtFecha } from "@/lib/formato";

export const dynamic = "force-dynamic";

type Fila = {
  id: string;
  consecutivo: string;
  estado: "reportada" | "aprobada" | "rechazada";
  cantidad: number;
  lote: string | null;
  nota: string | null;
  reportado_en: string;
  resuelto_en: string | null;
  sku: string;
  producto: string;
  unidad: string;
  valor_perdido: number;
  bodega_codigo: string;
  bodega: string;
  causa: string | null;
  reportado_por: string | null;
  resuelto_por: string | null;
};

const ESTILO_ESTADO: Record<string, string> = {
  reportada: "bg-bv-alerta/15 text-bv-alerta",
  aprobada: "bg-emerald-400/15 text-emerald-300",
  rechazada: "bg-slate-400/15 text-slate-300",
};

export default async function QuiebraPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const filtro = estado ?? "reportada";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user!.id)
    .single();

  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";

  let consulta = supabase
    .from("v_quiebras")
    .select("*")
    .order("reportado_en", { ascending: false })
    .limit(200);

  if (filtro !== "todas") consulta = consulta.eq("estado", filtro);

  const [{ data: filas }, { data: todas }] = await Promise.all([
    consulta.returns<Fila[]>(),
    supabase.from("v_quiebras").select("estado, valor_perdido, cantidad").returns<
      { estado: string; valor_perdido: number; cantidad: number }[]
    >(),
  ]);

  const lista = filas ?? [];
  const universo = todas ?? [];
  const pendientes = universo.filter((q) => q.estado === "reportada");
  const aprobadas = universo.filter((q) => q.estado === "aprobada");

  const tarjetas = [
    { titulo: "Por aprobar", valor: fmtNum(pendientes.length), alerta: pendientes.length > 0 },
    { titulo: "Averías aprobadas", valor: fmtNum(aprobadas.length) },
    {
      titulo: "Unidades perdidas",
      valor: fmtNum(aprobadas.reduce((a, q) => a + Number(q.cantidad ?? 0), 0)),
    },
    {
      titulo: "Valor perdido",
      valor: fmtCOP(aprobadas.reduce((a, q) => a + Number(q.valor_perdido ?? 0), 0)),
    },
  ];

  const filtros = [
    { clave: "reportada", texto: "Por aprobar" },
    { clave: "aprobada", texto: "Aprobadas" },
    { clave: "rechazada", texto: "Rechazadas" },
    { clave: "todas", texto: "Todas" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-bv-alerta">
            AVERÍAS
          </p>
          <h1 className="mt-1 text-[24px] font-medium tracking-[-0.02em]">
            Quiebra
          </h1>
          <p className="text-[13px] text-bv-texto-2">
            Producto averiado reportado en piso
          </p>
        </div>
        <Link href="/quiebra/nueva" className="btn-primario">
          Reportar avería
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="tarjeta">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bv-texto-2">
              {t.titulo}
            </p>
            <p
              className="mt-2 text-[24px] font-medium"
              style={{ color: t.alerta ? "var(--bv-alerta)" : "var(--bv-texto)" }}
            >
              {t.valor}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <Link
            key={f.clave}
            href={`/quiebra?estado=${f.clave}`}
            className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
              filtro === f.clave
                ? "border-bv-azul bg-bv-azul text-white"
                : "border-bv-linea text-bv-texto-2 hover:text-white"
            }`}
          >
            {f.texto}
          </Link>
        ))}
      </div>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="tabla">
          <thead>
            <tr>
              <th>N.º</th>
              <th>Producto</th>
              <th>Bodega</th>
              <th className="text-right">Cantidad</th>
              <th>Causa</th>
              <th className="text-right">Valor</th>
              <th>Reportó</th>
              <th>Estado</th>
              {esEditor && <th className="text-right">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((q) => (
              <tr key={q.id}>
                <td className="whitespace-nowrap font-mono text-xs">
                  {q.consecutivo}
                  <span className="block text-bv-texto-2">
                    {fmtFecha(q.reportado_en)}
                  </span>
                </td>
                <td>
                  <span className="font-mono text-xs text-bv-texto-2">{q.sku}</span>{" "}
                  {q.producto}
                  {q.lote && (
                    <span className="block text-xs text-bv-texto-2">
                      Lote {q.lote}
                    </span>
                  )}
                </td>
                <td className="text-bv-texto-2">{q.bodega_codigo}</td>
                <td className="whitespace-nowrap text-right font-medium">
                  {fmtNum(q.cantidad)} {q.unidad}
                </td>
                <td className="text-bv-texto-2">{q.causa ?? "—"}</td>
                <td className="whitespace-nowrap text-right">
                  {fmtCOP(q.valor_perdido)}
                </td>
                <td className="text-bv-texto-2">{q.reportado_por ?? "—"}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      ESTILO_ESTADO[q.estado]
                    }`}
                  >
                    {q.estado}
                  </span>
                </td>
                {esEditor && (
                  <td className="text-right">
                    {q.estado === "reportada" ? (
                      <div className="flex justify-end gap-2">
                        <form action={aprobarQuiebra}>
                          <input type="hidden" name="quiebra_id" value={q.id} />
                          <button className="btn-primario px-3 py-1 text-xs">
                            Aprobar
                          </button>
                        </form>
                        <form action={rechazarQuiebra}>
                          <input type="hidden" name="quiebra_id" value={q.id} />
                          <button className="btn-peligro px-3 py-1 text-xs">
                            Rechazar
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-bv-texto-2">
                        {q.resuelto_por ?? "—"}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td
                  colSpan={esEditor ? 9 : 8}
                  className="py-10 text-center text-bv-texto-2"
                >
                  No hay averías en este estado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!esEditor && (
        <p className="text-xs text-bv-texto-2">
          Solo un supervisor o administrador puede aprobar. Tu reporte queda
          pendiente hasta que lo revisen.
        </p>
      )}
    </div>
  );
}
