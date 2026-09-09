"use client";

/**
 * CREAR UN USUARIO Y VER LOS QUE HAY.
 *
 * El formulario pide TRES cosas: nombre, rol, y —opcional— una pantalla
 * extra. El usuario se propone solo a partir del nombre y la clave la
 * genera el servidor: dos campos menos que llenar y dos menos donde
 * equivocarse.
 *
 * LA CLAVE APARECE UNA SOLA VEZ, en una tarjeta grande, para dictarla.
 * No se guarda en ninguna parte nuestra: si se pierde, el administrador
 * la vuelve a generar. Mostrarla dos veces sería empezar a guardarla.
 *
 * El usuario se comprueba MIENTRAS SE ESCRIBE, contra la base, para
 * decir "ya está tomado" antes de llenar el resto.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizarUsuario } from "@/lib/auth";

type Persona = {
  id: string; usuario: string | null; nombre: string | null; rol: string;
  activo: boolean; clave_provisional: boolean;
  permisos_extra: Record<string, "ver" | "editar"> | null;
};
type Rol = { clave: string; nombre: string; manda: boolean };
type Modulo = {
  id: string; nombre: string; acento: string;
  secciones: { nombre: string; ruta: string }[];
};

/** El usuario que se propone del nombre: "Génesis Visbal" → "gvisbal". */
function proponer(nombre: string): string {
  const partes = nombre.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return normalizarUsuario(partes[0]);
  return normalizarUsuario(partes[0][0] + partes[partes.length - 1]);
}

export function Usuarios({ gente, roles, catalogo, hayLlave }: {
  gente: Persona[];
  roles: Rol[];
  catalogo: Modulo[];
  hayLlave: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [tocado, setTocado] = useState(false);
  const [rol, setRol] = useState(roles.find((r) => !r.manda)?.clave ?? roles[0]?.clave ?? "");
  const [extra, setExtra] = useState<Record<string, "ver" | "editar">>({});
  const [libre, setLibre] = useState<boolean | null>(null);
  const [creando, setCreando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  /* Lo que se acaba de crear, con su clave. Sale una vez. */
  const [reciente, setReciente] = useState<{ usuario: string; nombre: string; clave: string } | null>(null);

  /* Mientras nadie toque el campo del usuario, se propone del nombre. Al
     tocarlo, deja de moverse solo: nada peor que un campo que se
     reescribe mientras se escribe. */
  useEffect(() => {
    if (!tocado) setUsuario(proponer(nombre));
  }, [nombre, tocado]);

  /* ¿Está libre? Se pregunta con un respiro para no consultar en cada
     tecla. */
  useEffect(() => {
    if (usuario.length < 3) { setLibre(null); return }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("usuario_libre", { p_usuario: usuario });
      if (vivo) setLibre(data === true);
    }, 350);
    return () => { vivo = false; clearTimeout(t) };
  }, [usuario, supabase]);

  function limpiar() {
    setNombre(""); setUsuario(""); setTocado(false); setExtra({});
    setLibre(null); setMal(null);
  }

  async function crear() {
    setMal(null);
    setCreando(true);
    const r = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, usuario, rol, permisos_extra: extra }),
    });
    const j = await r.json().catch(() => ({ error: "El servidor no contestó." }));
    setCreando(false);
    if (!r.ok) return setMal(j.error ?? "No se pudo crear.");
    setReciente({ usuario: j.usuario, nombre: j.nombre, clave: j.clave });
    setAbierto(false);
    limpiar();
    router.refresh();
  }

  const puede = nombre.trim().length >= 3 && usuario.length >= 3 && !!rol && libre === true;
  const nRol = (c: string) => roles.find((r) => r.clave === c)?.nombre ?? c;
  const nRuta = (ruta: string) => {
    for (const m of catalogo) {
      const s = m.secciones.find((x) => x.ruta === ruta);
      if (s) return `${m.nombre} · ${s.nombre}`;
    }
    return ruta;
  };

  return (
    <>
      {!hayLlave && (
        <section className="us-aviso">
          <b>Falta la llave del servidor para poder crear cuentas.</b>
          <p>
            Se pone una vez: en Supabase, <b>Project Settings → API → service_role</b>;
            en Vercel, <b>Settings → Environment Variables</b>, con el nombre{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>, y un redeploy. En local, la misma
            línea en <code>.env.local</code>.
          </p>
          <p>
            Esa llave se salta todos los permisos de la base, así que va solo en
            variables del servidor — nunca con <code>NEXT_PUBLIC_</code> — y no se
            escribe en ningún archivo que se suba a GitHub.
          </p>
        </section>
      )}

      {/* La clave recién generada. Grande, para dictarla. */}
      {reciente && (
        <section className="us-clave" role="status">
          <div>
            <p className="rot">CLAVE PROVISIONAL DE {reciente.nombre.toUpperCase()}</p>
            <p className="num">{reciente.clave}</p>
            <p className="dice">
              Entra con el usuario <b>{reciente.usuario}</b> y esta clave. La
              aplicación le va a pedir cambiarla antes de dejarlo entrar a nada.
            </p>
            <p className="ojo">
              Anótala o díctala ahora: <b>no se vuelve a mostrar</b> y no queda
              guardada en ninguna parte. Si se pierde, se genera otra.
            </p>
          </div>
          <button type="button" className="btn plano" onClick={() => setReciente(null)}>
            Ya la dicté
          </button>
        </section>
      )}

      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>{gente.length} {gente.length === 1 ? "persona" : "personas"}</h2>
            <p>Quién entra a CONTROL y con qué rol.</p>
          </div>
          <button type="button" className="btn" disabled={!hayLlave}
                  onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Cerrar" : "Crear usuario"}
          </button>
        </div>

        {abierto && (
          <div className="us-form">
            <div className="us-campos">
              <label className="ancho">
                <span>Nombre completo</span>
                <input value={nombre} autoFocus maxLength={80}
                       placeholder="Génesis Visbal"
                       onChange={(e) => setNombre(e.target.value)} />
              </label>

              <label>
                <span>Usuario</span>
                <input value={usuario} maxLength={60} placeholder="gvisbal"
                       onChange={(e) => { setTocado(true); setUsuario(normalizarUsuario(e.target.value)) }} />
                <em className={libre === false ? "mal" : libre === true ? "bien" : ""}>
                  {usuario.length < 3
                    ? "Al menos tres caracteres."
                    : libre === null ? "Comprobando…"
                    : libre ? "Libre." : "Ya está tomado."}
                </em>
              </label>

              <label>
                <span>Rol</span>
                <select value={rol} onChange={(e) => setRol(e.target.value)}>
                  {roles.map((r) => (
                    <option key={r.clave} value={r.clave}>
                      {r.nombre}{r.manda ? " · administra la plataforma" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="us-extra">
              <p className="us-rot">
                Una pantalla más, solo para esta persona <em>(opcional)</em>
              </p>
              <p className="us-dice">
                Se suma a lo que ya le da su rol y nunca le quita nada. Es para la
                excepción; si son varios, el sitio es el rol.
              </p>
              <div className="us-modulos">
                {catalogo.map((m) => (
                  <div key={m.id} className="us-mod">
                    <b style={{ borderColor: m.acento }}>{m.nombre}</b>
                    {m.secciones.map((s) => {
                      const n = extra[s.ruta];
                      return (
                        <div key={s.ruta} className="us-sec">
                          <span>{s.nombre}</span>
                          <div className="us-niveles">
                            {(["ver", "editar"] as const).map((x) => (
                              <button key={x} type="button"
                                      aria-pressed={n === x}
                                      className={n === x ? "on" : ""}
                                      onClick={() => setExtra((e) => {
                                        const c = { ...e };
                                        if (c[s.ruta] === x) delete c[s.ruta]; else c[s.ruta] = x;
                                        return c;
                                      })}>
                                {x === "ver" ? "Ver" : "Editar"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {mal && <p className="us-mal" role="alert">{mal}</p>}

            <div className="us-acciones">
              <button type="button" className="btn" onClick={crear} disabled={!puede || creando}>
                {creando ? "Creando…" : "Crear y generar la clave"}
              </button>
              <button type="button" className="btn plano" onClick={() => { setAbierto(false); limpiar() }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="us-marco">
          <table className="us-tabla">
            <thead>
              <tr>
                <th>Nombre</th><th>Usuario</th><th>Rol</th>
                <th>Pantallas extra</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {gente.map((p) => {
                const ex = Object.entries(p.permisos_extra ?? {});
                return (
                  <tr key={p.id}>
                    <td>{p.nombre || "—"}</td>
                    <td className="cod">{p.usuario || "—"}</td>
                    <td>{nRol(p.rol)}</td>
                    <td>
                      {ex.length === 0
                        ? <span className="apagado">—</span>
                        : ex.map(([ruta, n]) => (
                            <span key={ruta} className="us-chapa">
                              {nRuta(ruta)} <em>{n}</em>
                            </span>
                          ))}
                    </td>
                    <td>
                      {!p.activo
                        ? <span className="us-estado mal">inactivo</span>
                        : p.clave_provisional
                          ? <span className="us-estado ojo">clave provisional</span>
                          : <span className="us-estado bien">al día</span>}
                    </td>
                  </tr>
                );
              })}
              {gente.length === 0 && (
                <tr><td colSpan={5} className="apagado">Todavía no hay nadie.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
