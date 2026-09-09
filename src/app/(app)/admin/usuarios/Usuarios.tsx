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

export function Usuarios({ gente, roles, catalogo, hayLlave, yo }: {
  gente: Persona[];
  roles: Rol[];
  catalogo: Modulo[];
  hayLlave: boolean;
  /** Quién está mirando: a uno mismo no se le genera clave desde aquí. */
  yo: string;
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

  /* GENERARLE UNA CLAVE NUEVA a alguien que ya existe.
     La clave sale una sola vez y no se guarda: si no se alcanzó a
     dictar, esta es la única salida. Sin esto quedaba una cuenta a la
     que nadie puede entrar y un usuario ocupado para siempre. */
  const [regenerando, setRegenerando] = useState<string | null>(null);
  async function nuevaClave(p: Persona) {
    setMal(null); setRegenerando(p.id);
    const r = await fetch("/api/admin/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    const j = await r.json().catch(() => ({} as Record<string, string>));
    setRegenerando(null);
    /* Si la clave SÍ cambió pero algo más falló, el servidor la manda
       igual: perderla por un error posterior dejaría a la persona sin
       poder entrar y sin que nadie sepa con qué. */
    if (j.clave) setReciente({ usuario: j.usuario, nombre: j.nombre || j.usuario, clave: j.clave });
    if (!r.ok) {
      setMal(j.error ?? "No se pudo generar la clave.");
    } else if (!j.clave) {
      /* 200 con el cuerpo vacío: Vercel corta la respuesta a mitad. Sin
         esto el botón no hacía absolutamente nada y no había forma de
         saber si la clave cambió o no. Y sí puede haber cambiado: el
         corte pasa después. */
      setMal(
        `El servidor cortó la respuesta y la clave no llegó. Es posible que SÍ ` +
        `haya cambiado, así que la anterior puede que ya no sirva: vuelve a darle ` +
        `"Nueva clave" a ${p.nombre || p.usuario} y usa la que salga.`
      );
    }
    router.refresh();
  }

  async function crear() {
    setMal(null);
    setCreando(true);
    const r = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, usuario, rol, permisos_extra: extra }),
    });
    const j = await r.json().catch(() => ({} as Record<string, string>));
    setCreando(false);
    if (!r.ok) return setMal(j.error ?? "No se pudo crear.");

    /* UN 200 NO ALCANZA. Vercel devuelve 200 con el cuerpo vacío cuando
       la función se corta a mitad de respuesta, y entonces j.nombre es
       undefined: la pantalla reventaba entera al escribirlo en
       mayúsculas, y con ella se perdía la clave.
       Lo grave no es el error, es que la cuenta PUEDE haber quedado
       creada: el corte pasa después de crearla. Por eso esto no dice
       "no se pudo" —sería mentira— sino que hay que ir a mirar. */
    if (!j.clave || !j.usuario) {
      router.refresh();
      return setMal(
        "El servidor cortó la respuesta y la clave no llegó. La cuenta " +
        "PUEDE haber quedado creada: búscala en la lista de abajo. Si está, " +
        "no la vuelvas a crear — genérale una clave nueva. Si no está, " +
        "vuelve a intentarlo."
      );
    }
    setReciente({ usuario: j.usuario, nombre: j.nombre || j.usuario, clave: j.clave });
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
            Se pone una vez. En Supabase: <b>Settings → API Keys</b>, y copia la
            llave <b>secreta</b> — la nueva empieza por <code>sb_secret_</code>, y si
            todavía usas la vieja es la <code>service_role</code>. Sirve cualquiera
            de las dos. <em>Ojo: la página «Settings → API» ya no existe, Supabase la
            renombró.</em>
          </p>
          <p>
            En Vercel: <b>Settings → Environment Variables</b>, con el nombre{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>, marcando los tres entornos, y
            después <b>Deployments → ⋯ → Redeploy</b>: una variable nueva no entra al
            despliegue que ya está corriendo. En local, la misma línea en{" "}
            <code>.env.local</code> y reiniciar <code>npm run dev</code>.
          </p>
          <p>
            Esa llave se salta todos los permisos de la base, así que va solo en
            variables del servidor — nunca con <code>NEXT_PUBLIC_</code> — y no se
            escribe en ningún archivo que se suba a GitHub.
          </p>
        </section>
      )}

      {/* EL AVISO DE ERROR VA AQUÍ y no dentro del formulario.
          Estaba adentro, y el formulario está cerrado casi siempre: al
          darle "Nueva clave" desde la lista, un error se escribía en un
          sitio que nadie estaba viendo y el botón parecía no hacer
          nada. Medido: 403 y 200-vacío no mostraban absolutamente
          nada. */}
      {mal && <p className="us-mal suelto" role="alert">{mal}</p>}

      {/* La clave recién generada. Grande, para dictarla. */}
      {reciente && (
        <section className="us-clave" role="status">
          <div>
            {/* Con ?? por si acaso: esta tarjeta lleva la única copia de
                la clave, y si revienta al dibujarse se pierde. */}
            <p className="rot">
              CLAVE PROVISIONAL DE {(reciente.nombre ?? reciente.usuario ?? "").toUpperCase()}
            </p>
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
                <th>Pantallas extra</th><th>Estado</th><th className="us-acc">Clave</th>
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
                    <td className="us-acc">
                      {p.id === yo ? (
                        /* A uno mismo no: sería encerrarse afuera de la
                           sesión con la que se está administrando. */
                        <span className="apagado">eres tú</span>
                      ) : (
                        <button type="button" className="us-mini" disabled={!hayLlave || !!regenerando}
                                onClick={() => nuevaClave(p)}>
                          {regenerando === p.id ? "Generando…" : "Nueva clave"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {gente.length === 0 && (
                <tr><td colSpan={6} className="apagado">Todavía no hay nadie.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
