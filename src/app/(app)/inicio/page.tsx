import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MODULOS, puedeVer } from "@/modulos/registro";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
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
  const modulos = MODULOS.filter((m) => puedeVer(m, rol));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Menú principal</h1>
        <p className="text-sm text-tinta-500">
          {(perfil?.nombre ?? "").split(" ")[0] || "Bienvenido"} ·{" "}
          <span className="uppercase tracking-wide">{rol}</span>
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {modulos.map((m) => {
          const interior = (
            <>
              <span className="text-2xl font-bold tracking-tight opacity-90">
                {m.sigla}
              </span>
              <span className="mt-auto text-sm font-semibold leading-tight">
                {m.nombre}
              </span>
              <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug opacity-75">
                {m.activo ? m.descripcion : "Próximamente"}
              </span>
            </>
          );

          const base =
            "flex aspect-square flex-col rounded-xl p-4 text-white shadow-sm transition";

          return m.activo ? (
            <Link
              key={m.id}
              href={m.ruta}
              className={`${base} ${m.color} hover:-translate-y-0.5 hover:shadow-md`}
            >
              {interior}
            </Link>
          ) : (
            <div
              key={m.id}
              className={`${base} bg-tinta-300 cursor-not-allowed`}
              aria-disabled
            >
              {interior}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-tinta-400">
        Los módulos se declaran en <code>src/modulos/registro.ts</code>. Agrega uno
        nuevo ahí y aparece en este menú.
      </p>
    </div>
  );
}
