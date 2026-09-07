"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const siguiente = params.get("next") ?? "/inicio";

  const [modo, setModo] = useState<"entrar" | "registrar">("entrar");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setMensaje(null);

    const supabase = createClient();

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({
        email: correo,
        password: clave,
      });
      if (error) setError(error.message);
      else {
        router.push(siguiente);
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email: correo,
        password: clave,
        options: {
          data: { nombre },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) setError(error.message);
      else setMensaje("Cuenta creada. Revisa tu correo para confirmarla.");
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
              <label className="etiqueta">Nombre</label>
              <input
                className="campo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label className="etiqueta">Correo</label>
            <input
              type="email"
              className="campo"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
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
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {mensaje && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {mensaje}
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
              setMensaje(null);
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
