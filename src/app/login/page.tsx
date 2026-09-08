"use client";

import { useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { correoDeUsuario, normalizarUsuario } from "@/lib/auth";
import { modulosActivos } from "@/modulos/registro";
import { AccionesApp } from "@/components/AccionesApp";
import "./acceso.css";

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
  if (m.includes("failed to fetch") || m.includes("network"))
    return "No hay conexión con el servidor. Revisa la red e intenta de nuevo.";
  return ERROR_CREDENCIALES;
}

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const siguiente = params.get("next") ?? "/inicio";

  const refUsuario = useRef<HTMLInputElement>(null);
  const refClave = useRef<HTMLInputElement>(null);

  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [mayus, setMayus] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [entro, setEntro] = useState(false);
  const [faltaU, setFaltaU] = useState(false);
  const [faltaC, setFaltaC] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ayuda, setAyuda] = useState(false);

  const modulos = modulosActivos();

  async function enviar(e: React.FormEvent) {
    e.preventDefault();

    const escrito = usuario.trim();
    const sinU = !escrito;
    const sinC = !clave;
    setFaltaU(sinU);
    setFaltaC(sinC);
    setError(null);
    if (sinU) return refUsuario.current?.focus();
    if (sinC) return refClave.current?.focus();

    setCargando(true);

    const limpio = escrito.includes("@")
      ? escrito.toLowerCase()
      : normalizarUsuario(escrito);

    const supabase = createClient();
    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: correoDeUsuario(limpio),
      password: clave,
    });

    if (fallo) {
      setError(traducirError(fallo.message));
      setCargando(false);
      refClave.current?.focus();
      return;
    }

    setEntro(true);

    // Si la persona eligió un módulo de arranque en Mi perfil, se abre ese.
    // El parámetro ?next= manda: significa que la traía una ruta concreta.
    let destino = siguiente;
    if (!params.get("next")) {
      const { data: usuarioActual } = await supabase.auth.getUser();
      if (usuarioActual.user) {
        const { data: perfil } = await supabase
          .from("perfiles")
          .select("modulo_inicio")
          .eq("id", usuarioActual.user.id)
          .single();
        const inicio = (perfil as { modulo_inicio?: string } | null)?.modulo_inicio;
        if (inicio) destino = inicio;
      }
    }

    router.push(destino);
    router.refresh();
  }

  return (
    <div className="acc">
      <div className="acc-escena">
        <div className="acc-hero">
          <div className="acc-fondo">
            <div className="acc-izq" />
            <div className="acc-banda" />
            <div className="acc-filo a" />
            <div className="acc-filo b" />
          </div>

          <div className="acc-marca">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/logo-b.png" alt="Bavaria" />
            <div className="barra" />
            <div className="nombre">CONTROL</div>
          </div>

          <div className="acc-discurso">
            <h1>
              <span className="l1">CONTROL</span>
              <span className="l2">
                <span className="acc-contorno">TEAM</span>
                <span className="acc-baq">
                  <span>BAQ</span>
                </span>
              </span>
            </h1>
            <p className="acc-firma">Centro de Distribución 38 · Bavaria BAQ</p>
            <div className="acc-modulos">
              {modulos.map((m) => (
                <span key={m.id} className="activo">
                  {m.nombre}
                </span>
              ))}
            </div>
          </div>
        </div>

        <section className="acc-tarjeta">
          {entro ? (
            <div className="acc-listo">
              <div className="tic">✓</div>
              <h3>Sesión iniciada</h3>
              <p>Abriendo el menú de módulos…</p>
            </div>
          ) : (
            <>
              <div className="acc-cabeza">
                <h2>Iniciar sesión</h2>
                <p className="sub">
                  Entra con el usuario que te asignó tu supervisor.
                </p>
              </div>

              <form className="acc-form" onSubmit={enviar} noValidate>
                <div className={"acc-campo" + (faltaU ? " malo" : "")}>
                  <label htmlFor="usuario">Usuario</label>
                  <div className="acc-caja">
                    <input
                      id="usuario"
                      ref={refUsuario}
                      value={usuario}
                      onChange={(e) => {
                        setUsuario(e.target.value);
                        if (e.target.value.trim()) setFaltaU(false);
                      }}
                      type="text"
                      inputMode="text"
                      placeholder="genesis.visbal"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                    />
                  </div>
                  {faltaU && (
                    <p className="acc-aviso">Escribe tu usuario para continuar.</p>
                  )}
                </div>

                <div className={"acc-campo" + (faltaC ? " malo" : "")}>
                  <label htmlFor="clave">Contraseña</label>
                  <div className="acc-caja">
                    <input
                      id="clave"
                      ref={refClave}
                      value={clave}
                      onChange={(e) => {
                        setClave(e.target.value);
                        if (e.target.value) setFaltaC(false);
                      }}
                      onKeyUp={(e) =>
                        setMayus(
                          typeof e.getModifierState === "function" &&
                            e.getModifierState("CapsLock")
                        )
                      }
                      type={verClave ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                    <button
                      className="acc-ver"
                      type="button"
                      aria-label={
                        verClave ? "Ocultar contraseña" : "Mostrar contraseña"
                      }
                      onClick={() => {
                        setVerClave((v) => !v);
                        refClave.current?.focus();
                      }}
                    >
                      {verClave ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                  {faltaC && (
                    <p className="acc-aviso">
                      Escribe tu contraseña para continuar.
                    </p>
                  )}
                  {mayus && (
                    <p className="acc-aviso">Tienes Bloq Mayús activado.</p>
                  )}
                </div>

                {error && (
                  <p className="acc-aviso" role="alert" aria-live="polite">
                    {error}
                  </p>
                )}

                <button className="acc-entrar" type="submit" disabled={cargando}>
                  {cargando ? "Verificando…" : "Entrar"}
                </button>
              </form>

              <div className="acc-pie">
                <span>
                  <b>CD38</b>
                </span>
                <span
                  style={{ display: "flex", gap: 16, alignItems: "center" }}
                >
                  <AccionesApp variante="enlace" />
                  {ayuda ? (
                    <span>Pídele el usuario a tu supervisor.</span>
                  ) : (
                    <button
                      type="button"
                      className="pedir"
                      onClick={() => setAyuda(true)}
                    >
                      ¿Sin acceso?
                    </button>
                  )}
                </span>
              </div>
            </>
          )}
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
