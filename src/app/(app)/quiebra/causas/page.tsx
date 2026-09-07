import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { crearCausa, alternarCausa } from "@/modulos/quiebra/acciones";

export const dynamic = "force-dynamic";

export default async function CausasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: perfil }, { data: causas }] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    supabase.from("causas_quiebra").select("*").order("nombre"),
  ]);

  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";

  return (
    <div className="space-y-6">
      <header>
        <Link href="/quiebra" className="text-xs text-bv-texto-2 hover:text-white">
          ← Quiebra
        </Link>
        <h1 className="mt-1 text-[24px] font-medium tracking-[-0.02em]">Causas</h1>
        <p className="text-[13px] text-bv-texto-2">
          Motivos por los que se avería el producto. Alimentan el reporte de
          pérdida por causa.
        </p>
      </header>

      {esEditor && (
        <form action={crearCausa} className="tarjeta grid gap-4 sm:grid-cols-4">
          <div>
            <label className="etiqueta">Código *</label>
            <input
              name="codigo"
              className="campo uppercase"
              placeholder="GOLPE"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="etiqueta">Nombre *</label>
            <input
              name="nombre"
              className="campo"
              placeholder="Golpe o caída en manipulación"
              required
            />
          </div>
          <div className="flex items-end">
            <button className="btn-primario w-full">Agregar</button>
          </div>
        </form>
      )}

      <div className="tarjeta overflow-x-auto p-0">
        <table className="tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Estado</th>
              {esEditor && <th className="text-right">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {(causas ?? []).map((c) => (
              <tr key={c.id}>
                <td className="font-mono text-xs">{c.codigo}</td>
                <td>{c.nombre}</td>
                <td className={c.activo ? "" : "text-bv-texto-2"}>
                  {c.activo ? "Activa" : "Inactiva"}
                </td>
                {esEditor && (
                  <td className="text-right">
                    <form action={alternarCausa}>
                      <input type="hidden" name="causa_id" value={c.id} />
                      <input
                        type="hidden"
                        name="activo"
                        value={c.activo ? "false" : "true"}
                      />
                      <button className="btn-secundario px-3 py-1 text-xs">
                        {c.activo ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {(!causas || causas.length === 0) && (
              <tr>
                <td colSpan={esEditor ? 4 : 3} className="py-10 text-center text-bv-texto-2">
                  No hay causas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-bv-texto-2">
        Las causas no se borran, se desactivan: así las averías ya reportadas
        conservan su motivo.
      </p>
    </div>
  );
}
