"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { moduloPorRuta, modulosVisibles } from "@/modulos/registro";

/**
 * Menú lateral. Solo aparece cuando estás dentro de un módulo: en la portada
 * estorba, porque la portada YA es el selector de módulos.
 */
export function Navegacion({ nombre, rol }: { nombre: string; rol: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const actual = moduloPorRuta(pathname);

  if (!actual) return null;

  async function salir() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const visibles = modulosVisibles(rol);

  return (
    <aside
      className="flex w-full shrink-0 flex-col border-b md:h-auto md:w-60 md:border-r md:border-b-0"
      style={{ borderColor: "var(--bv-linea)", background: "var(--bv-panel)" }}
    >
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        <Link
          href="/inicio"
          className="rounded-lg px-3 py-2 text-sm text-bv-texto-2 transition hover:bg-bv-tinta hover:text-bv-texto"
        >
          ← Todos los módulos
        </Link>

        <div>
          <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-bv-texto-2">
            {actual.nombre}
          </p>
          <div className="space-y-1">
            {actual.secciones.map((s) => {
              const activo = pathname === s.ruta;
              return (
                <Link
                  key={s.ruta}
                  href={s.ruta}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${
                    activo
                      ? "bg-bv-tinta font-medium text-bv-azul"
                      : "text-bv-texto-2 hover:bg-bv-tinta hover:text-bv-texto"
                  }`}
                >
                  {s.nombre}
                </Link>
              );
            })}
          </div>
        </div>

        {visibles.filter((m) => m.activo && m.id !== actual.id).length > 0 && (
          <div>
            <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-bv-texto-2">
              Otros módulos
            </p>
            <div className="space-y-1">
              {visibles
                .filter((m) => m.activo && m.id !== actual.id)
                .map((m) => (
                  <Link
                    key={m.id}
                    href={m.ruta}
                    className="block rounded-lg px-3 py-2 text-sm text-bv-texto-2 transition hover:bg-bv-tinta hover:text-bv-texto"
                  >
                    {m.nombre}
                  </Link>
                ))}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t px-5 py-4" style={{ borderColor: "var(--bv-linea)" }}>
        <p className="truncate text-sm font-medium">{nombre}</p>
        <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-bv-texto-2">
          {rol}
        </p>
        <button
          onClick={salir}
          className="text-xs text-bv-texto-2 transition hover:text-white"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
