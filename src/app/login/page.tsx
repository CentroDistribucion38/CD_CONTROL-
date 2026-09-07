"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { correoDeUsuario, normalizarUsuario, USUARIO_PATRON } from "@/lib/auth";

function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Usuario o contraseña incorrectos.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ese usuario ya existe.";
  if (m.includes("password should be at least"))
    return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("email not confirmed"))
    return "La cuenta está sin confirmar. Pídele al administrador que desactive la confirmación por correo en Supabase.";
  return mensaje;
}

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const siguiente = params.get("next") ?? "/inicio";

  const [modo, setModo] = useState<"entrar" | "registrar">("entrar");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const supabase = createClient();
    const limpio = normalizarUsuario(usuario);

    if (!limpio) {
      setError("Escribe un usuario válido.");
      setCargando(false);
      return;
    }

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({
        email: correoDeUsuario(limpio),
        password: clave,
      });
      if (error) setError(traducirError(error.message));
      else {
        router.push(siguiente);
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: correoDeUsuario(limpio),
        password: clave,
        options: { data: { usuario: limpio, nombre: nombre.trim() || limpio } },
      });

      if (error) {
        setError(traducirError(error.message));
      } else if (data.session) {
        router.push("/inicio");
        router.refresh();
      } else {
        setError(
          "Cuenta creada, pero quedó pendiente de confirmación. Desactiva «Confirm email» en Supabase → Authentication → Providers → Email y vuelve a entrar."
        );
      }
    }

    setCargando(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-tinta-900 text-sm font-bold text-white">
            C
          </div>
          <h1 className="text-xl font-semibold tracking-wide">CONTROL</h1>
          <p className="mt-1 text-sm text-tinta-500">
            {modo === "entrar" ? "Ingresa a tu cuenta" : "Crea tu cuenta"}
          </p>
        </div>

        <form onSubmit={enviar} className="tarjeta space-y-4">
          {modo === "registrar" && (
            <div>
              <label className="etiqueta">Nombre completo</label>
              <input
                className="campo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Juan Pérez"
                required
              />
            </div>
          )}

          <div>
            <label className="etiqueta">Usuario</label>
            <input
              className="campo lowercase"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              pattern={USUARIO_PATRON}
              title="Entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo."
              placeholder="jperez"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="etiqueta">Contraseña</label>
            <input
              type="password"
              className="campo"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              minLength={6}
              autoComplete={
                modo === "entrar" ? "current-password" : "new-password"
              }
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button className="btn-primario w-full" disabled={cargando}>
            {cargando
              ? "Procesando…"
              : modo === "entrar"
                ? "Entrar"
                : "Registrarme"}
          </button>

          <button
            type="button"
            className="w-full text-center text-sm text-tinta-500 hover:text-tinta-900"
            onClick={() => {
              setModo(modo === "entrar" ? "registrar" : "entrar");
              setError(null);
            }}
          >
            {modo === "entrar"
              ? "¿No tienes cuenta? Regístrate"
              : "Ya tengo cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-tinta-400">
          El primer usuario registrado queda como administrador.
        </p>
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
