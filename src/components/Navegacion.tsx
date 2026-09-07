"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MODULOS, moduloPorRuta, puedeVer } from "@/modulos/registro";

export function Navegacion({ nombre, rol }: { nombre: string; rol: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const actual = moduloPorRuta(pathname);

  async function salir() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const visibles = MODULOS.filter((m) => m.activo && puedeVer(m, rol));

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-tinta-200 bg-white md:h-screen md:w-64 md:border-r md:border-b-0">
      <Link href="/inicio" className="flex items-center gap-2 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tinta-900 text-xs font-bold text-white">
          C
        </div>
        <span className="text-sm font-semibold tracking-wide">CONTROL</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
        <div className="space-y-1">
          <Link
            href="/inicio"
            className={`block rounded-lg px-3 py-2 text-sm transition ${
              pathname === "/inicio"
                ? "bg-tinta-100 font-medium text-tinta-900"
                : "text-tinta-600 hover:bg-tinta-50"
            }`}
          >
            Inicio
          </Link>
        </div>

        <div>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-tinta-400">
            Módulos
          </p>
          <div className="space-y-1">
            {visibles.map((m) => {
              const esActual = actual?.id === m.id;
              return (
                <div key={m.id}>
                  <Link
                    href={m.ruta}
                    className={`block rounded-lg px-3 py-2 text-sm transition ${
                      esActual
                        ? "bg-tinta-100 font-medium text-tinta-900"
                        : "text-tinta-600 hover:bg-tinta-50"
                    }`}
                  >
                    {m.nombre}
                  </Link>

                  {esActual && m.secciones.length > 0 && (
                    <div className="mt-1 ml-3 border-l border-tinta-200 pl-3">
                      {m.secciones.map((s) => (
                        <Link
                          key={s.ruta}
                          href={s.ruta}
                          className={`block rounded-md px-2 py-1.5 text-sm transition ${
                            pathname === s.ruta
                              ? "font-medium text-tinta-900"
                              : "text-tinta-500 hover:text-tinta-900"
                          }`}
                        >
                          {s.nombre}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="border-t border-tinta-200 px-5 py-4">
        <p className="truncate text-sm font-medium">{nombre}</p>
        <p className="mb-2 text-xs uppercase tracking-wide text-tinta-400">{rol}</p>
        <button onClick={salir} className="text-xs text-tinta-500 hover:text-tinta-900">
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
