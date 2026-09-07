"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { correoDeUsuario, normalizarUsuario, USUARIO_PATRON } from "@/lib/auth";
import { avanzarConTeclado } from "@/lib/teclado";
import { BarraSuperior } from "@/components/BarraSuperior";

/**
 * Nunca se muestra el error crudo de Supabase ni se dice cuál de los dos
 * campos falló: eso confirmaría qué usuarios existen.
 */
const ERROR_CREDENCIALES =
  "Usuario o contraseña incorrectos. Verifica e intenta de nuevo.";

function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("email not confirmed"))
    return "Tu cuenta está pendiente de activación. Habla con tu supervisor.";
  if (m.includes("rate limit"))
    return "Demasiados intentos. Espera un momento y vuelve a probar.";
  return ERROR_CREDENCIALES;
}

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const siguiente = params.get("next") ?? "/inicio";

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const escrito = usuario.trim();
    const limpio = escrito.includes("@")
      ? escrito.toLowerCase()
      : normalizarUsuario(escrito);

    if (!limpio) {
      setError(ERROR_CREDENCIALES);
      setCargando(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: correoDeUsuario(limpio),
      password: clave,
    });

    if (error) {
      setError(traducirError(error.message));
      setCargando(false);
    } else {
      router.push(siguiente);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <BarraSuperior usuario={usuario || "??"} />

      <div className="grid flex-1 md:grid-cols-2">
        {/* Columna informativa — oculta en móvil */}
        <section
          className="hidden flex-col justify-center px-12 md:flex"
          style={{ background: "#F7F9FC" }}
        >
          <p
            className="text-[11px] font-medium tracking-[0.14em]"
            style={{ color: "var(--bv-azul)" }}
          >
            OPERACIÓN LOGÍSTICA
          </p>
          <h1
            className="mt-3 max-w-md text-[34px] font-medium leading-tight tracking-[-0.02em]"
            style={{ color: "var(--bv-tinta)" }}
          >
            Una sola plataforma para toda la bodega
          </h1>
          <p className="mt-4 max-w-md text-[13px] leading-[1.6] text-slate-600">
            Recibo, almacenamiento, inventario, averías y despacho en el mismo
            lugar. Lo que se registra en piso queda disponible al instante para
            quien tiene que decidir.
          </p>

          <div className="mt-8 flex gap-10 border-t border-slate-200 pt-6">
            {[
              { n: "6", t: "módulos" },
              { n: "3", t: "roles" },
              { n: "1", t: "sesión" },
            ].map((d) => (
              <div key={d.t}>
                <p
                  className="text-[26px] font-medium"
                  style={{ color: "var(--bv-tinta)" }}
                >
                  {d.n}
                </p>
                <p className="text-[12px] text-slate-500">{d.t}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tarjeta de acceso */}
        <section
          className="flex items-center justify-center px-6 py-12"
          style={{ background: "var(--bv-tinta)" }}
        >
          <div className="w-full max-w-sm">
            <div
              className="overflow-hidden rounded-[12px] border"
              style={{
                borderColor: "var(--bv-linea)",
                background: "var(--bv-panel)",
              }}
            >
              <div className="px-6 py-4" style={{ background: "var(--bv-azul)" }}>
                <h2 className="text-[16px] font-medium text-white">
                  Iniciar sesión
                </h2>
              </div>

              <form
                onSubmit={enviar}
                onKeyDown={avanzarConTeclado}
                className="space-y-4 p-6"
              >
                <div>
                  <label className="etiqueta" htmlFor="usuario">
                    Usuario
                  </label>
                  <input
                    id="usuario"
                    className="campo"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    pattern={USUARIO_PATRON}
                    title="Tu nombre de usuario, por ejemplo: admin"
                    placeholder="admin"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="etiqueta" htmlFor="clave">
                    Contraseña
                  </label>
                  <input
                    id="clave"
                    type="password"
                    className="campo"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  {error && (
                    <p
                      className="mt-2 text-[12px] leading-[1.5]"
                      style={{ color: "var(--bv-alerta)" }}
                      role="alert"
                    >
                      {error}
                    </p>
                  )}
                </div>

                <button className="btn-primario w-full" disabled={cargando}>
                  {cargando ? "Accediendo…" : "Acceder"}
                </button>
              </form>
            </div>

            <p
              className="mt-5 text-center text-[12px]"
              style={{ color: "var(--bv-texto-2)" }}
            >
              ¿Olvidaste la contraseña? Habla con tu supervisor.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
