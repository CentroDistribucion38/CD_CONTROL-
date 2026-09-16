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

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizarUsuario } from "@/lib/auth";
import { useConfirmar } from "@/components/Confirmar";

type Persona = {
  id: string; usuario: string | null; nombre: string | null; rol: string;
  activo: boolean; clave_provisional: boolean;
  /** Lo de ESTA persona. Manda sobre el rol, y «ninguno» es un valor:
      es cómo se le quita una pantalla que su rol sí le da. */
  permisos_extra: Record<string, Nivel> | null;
};
type Rol = { clave: string; nombre: string; manda: boolean };
/** Una línea de rol_permisos: qué le da un rol a una sección. */
type PermisoRol = { rol: string; seccion: string; nivel: "ver" | "editar" };
type Modulo = {
  id: string; nombre: string; acento: string;
  secciones: { nombre: string; ruta: string }[];
};

/**
 * A QUÉ TIENE ACCESO ESTA PERSONA, Y A QUÉ NO.
 *
 * NO ES UN SELECTOR DE EXTRAS, aunque los extras se toquen aquí. Es la
 * tabla de acceso: pantalla por pantalla, qué le da el rol, qué se le
 * dio suelto, y —lo que de verdad importa— en qué queda. La versión
 * anterior solo enseñaba las casillas de lo suelto, así que para saber
 * si alguien ENTRA a una pantalla había que abrir /admin/roles en otra
 * pestaña, mirar su rol, y sumarlo de cabeza.
 *
 * EL RESULTADO VA A LA IZQUIERDA y es lo primero de cada renglón: se
 * baja la vista por la columna y se ve de un golpe a qué entra y a qué
 * no, que es la pregunta que trae a alguien a esta pantalla.
 *
 * LOS EXTRA SUMAN Y NUNCA RESTAN. Por eso un extra por debajo de lo que
 * el rol ya da no cambia nada —dar «ver» a quien el rol deja «editar» es
 * un permiso que se ve puesto y no hace nada—, y esos niveles se apagan.
 * Si uno YA estaba puesto sigue tocándose, para poder quitarlo: un botón
 * apagado del que no se puede salir es una trampa.
 */
type Nivel = "ninguno" | "ver" | "editar";
const NIVELES: Nivel[] = ["ninguno", "ver", "editar"];
const ROTULO: Record<Nivel, string> = { ninguno: "Sin acceso", ver: "Ver", editar: "Editar" };

function Pantallas({ catalogo, valor, cambiar, delRol, nombreRol, mandaElRol }: {
  catalogo: Modulo[];
  /** Lo que se le puso a ESTA persona. Lo que no está aquí sale del rol. */
  valor: Record<string, Nivel>;
  cambiar: (v: Record<string, Nivel>) => void;
  /** Lo que el rol elegido da, por ruta. Sin la ruta = el rol no la da,
      y por eso el valor lleva `undefined`: sin él, TypeScript da por
      hecho que toda ruta está y el `?? "ninguno"` queda como código
      muerto que nunca corre —cuando es justo el caso más común—. */
  delRol: Record<string, "ver" | "editar" | undefined>;
  nombreRol: string;
  /** El rol administra la plataforma: entra a todo y esto no aplica. */
  mandaElRol: boolean;
}) {
  const todas = catalogo.flatMap((m) => m.secciones.map((s) => s.ruta));
  /* LO DE LA PERSONA MANDA; lo que no se le tocó sale del rol. Es la
     MISMA regla que aplica el servidor en lib/permisos.ts, escrita
     igual: si las dos se separaran, esta pantalla mostraría un acceso
     que la aplicación no da. */
  const final = (ruta: string): Nivel =>
    mandaElRol ? "editar" : (valor[ruta] ?? delRol[ruta] ?? "ninguno");

  const entra = todas.filter((r) => final(r) !== "ninguno").length;
  const tocadas = todas.filter((r) => valor[r] && valor[r] !== (delRol[r] ?? "ninguno")).length;

  return (
    <>
      <p className="us-resumen">
        {mandaElRol ? (
          <>Su rol <b>{nombreRol}</b> administra la plataforma: <b>entra a todo</b> y
            nada de aquí le aplica. Para cerrarle una pantalla hay que darle otro rol.</>
        ) : (
          <>Entra a <b>{entra} de {todas.length}</b> pantallas.
            {tocadas > 0
              ? <> {tocadas} {tocadas === 1 ? "está puesta" : "están puestas"} a mano;
                  el resto sale de su rol <b>{nombreRol}</b>.</>
              : <> Todas salen de su rol <b>{nombreRol}</b>.</>}</>
        )}
      </p>
      <div className={"us-modulos" + (mandaElRol ? " manda" : "")}>
        {catalogo.map((m) => (
          <div key={m.id} className="us-mod">
            <b style={{ borderColor: m.acento }}>{m.nombre}</b>
            {m.secciones.map((sec) => {
              const puesto = valor[sec.ruta];
              const rol: Nivel = delRol[sec.ruta] ?? "ninguno";
              const res = final(sec.ruta);
              return (
                <div key={sec.ruta} className={"us-sec n-" + res}>
                  <span className={"us-res " + res}>
                    {res === "ninguno" ? "sin acceso" : res}
                  </span>
                  <span className="us-nom">
                    {sec.nombre}
                    <em>
                      {puesto
                        ? `a mano · el rol da ${rol === "ninguno" ? "nada" : rol}`
                        : `sale del rol · ${rol === "ninguno" ? "nada" : rol}`}
                    </em>
                  </span>
                  <div className="us-niveles tres">
                    {NIVELES.map((x) => (
                      <button key={x} type="button"
                              aria-pressed={puesto === x}
                              disabled={mandaElRol}
                              title={puesto === x
                                ? "Tócalo otra vez para que vuelva a salir del rol."
                                : `Ponerle «${ROTULO[x].toLowerCase()}» a esta persona, mande lo que mande su rol.`}
                              className={puesto === x ? "on" : ""}
                              onClick={() => {
                                const c = { ...valor };
                                /* Tocar el nivel que ya está puesto lo
                                   DEVUELVE AL ROL. Es la única forma de
                                   volver a «lo que diga el rol» sin un
                                   cuarto botón que diría eso mismo. */
                                if (c[sec.ruta] === x) delete c[sec.ruta]; else c[sec.ruta] = x;
                                cambiar(c);
                              }}>
                        {ROTULO[x]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

/** El usuario que se propone del nombre: "Génesis Visbal" → "gvisbal". */
function proponer(nombre: string): string {
  const partes = nombre.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return normalizarUsuario(partes[0]);
  return normalizarUsuario(partes[0][0] + partes[partes.length - 1]);
}

export function Usuarios({ gente, roles, delRol, catalogo, hayLlave, yo }: {
  gente: Persona[];
  roles: Rol[];
  /** Lo que ya da cada rol, para no dar suelto lo que ya venía puesto. */
  delRol: PermisoRol[];
  catalogo: Modulo[];
  hayLlave: boolean;
  /** Quién está mirando: a uno mismo no se le genera clave desde aquí. */
  yo: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  /* LA LISTA SE PINTA DE AQUÍ, no de la prop, y es por un síntoma que
     Cristian reportó: guardaba un usuario, no salía error, y la fila
     seguía mostrando lo de antes hasta recargar con F5. `router.refresh()`
     sigue estando —hace falta para todo lo demás que pueda haber
     cambiado— pero ya no es de lo que depende ver el resultado.

     Y NO SE ADIVINA LO QUE QUEDÓ: se pinta lo que el servidor CONTESTA
     que quedó guardado. Si un trigger cambiara algo por su cuenta, se
     vería aquí mismo en vez de descubrirse mañana. */
  const [lista, setLista] = useState(gente);
  useEffect(() => { setLista(gente) }, [gente]);

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [tocado, setTocado] = useState(false);
  const [rol, setRol] = useState(roles.find((r) => !r.manda)?.clave ?? roles[0]?.clave ?? "");
  const [extra, setExtra] = useState<Record<string, Nivel>>({});
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
    /* La clave nueva cambia lo que se VE —el estado pasa a «clave
       provisional»—, así que se pinta aquí igual que al editar y no se
       espera a que vuelva a consultarse. */
    setLista((l) => l.map((x) => (x.id === p.id ? { ...x, clave_provisional: true } : x)));
    router.refresh();
  }

  /* ---------- EDITAR NOMBRE Y USUARIO ----------
     Se edita EN LA MISMA FILA y no en una ventana aparte: lo que se
     está cambiando es lo que ya se estaba mirando, y una ventana encima
     tapa justamente el resto de la lista, que es contra lo que uno
     compara para no repetir un usuario.

     El nombre es libre. El usuario es con lo que la persona ENTRA, así
     que si cambia se pregunta antes: nadie debería quedarse por fuera
     porque un administrador arregló una tilde. */
  const [editando, setEditando] = useState<string | null>(null);
  const [edNombre, setEdNombre] = useState("");
  const [edUsuario, setEdUsuario] = useState("");
  const [edRol, setEdRol] = useState("");
  const [edExtra, setEdExtra] = useState<Record<string, Nivel>>({});
  const [guardando, setGuardando] = useState(false);
  const [pedir, dialogo] = useConfirmar();

  function abrirEdicion(p: Persona) {
    setMal(null);
    setEditando(p.id);
    setEdNombre(p.nombre ?? "");
    setEdUsuario(p.usuario ?? "");
    setEdRol(p.rol);
    /* Copia, no la referencia: tocar una pantalla y después Cancelar no
       puede dejar el objeto de la lista ya cambiado. */
    setEdExtra({ ...(p.permisos_extra ?? {}) });
  }

  async function guardarEdicion(p: Persona) {
    const nom = edNombre.trim();
    const usu = normalizarUsuario(edUsuario);
    if (nom.length < 3) { setMal("El nombre no puede quedar en blanco."); return }
    if (usu.length < 3) { setMal("El usuario necesita al menos tres caracteres."); return }

    const cambiaUsuario = usu !== (p.usuario ?? "");
    if (cambiaUsuario) {
      const ok = await pedir({
        titulo: `¿Cambiar el usuario a "${usu}"?`,
        dice: (
          <>
            <p>
              {p.nombre || p.usuario} entra hoy con <b>{p.usuario}</b>. Si lo cambias,
              a partir de ahora tiene que entrar con <b>{usu}</b> — la clave sigue
              siendo la misma.
            </p>
            <p>Avísale antes de guardar, o no va a poder entrar mañana.</p>
          </>
        ),
        confirmar: "Cambiar el usuario",
        cancelar: "Dejarlo como está",
      });
      if (!ok) return;
    }

    setMal(null); setGuardando(true);
    const r = await fetch("/api/admin/usuarios", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: p.id, nombre: nom, usuario: usu,
        rol: edRol, permisos_extra: edExtra,
      }),
    });
    const j = await r.json().catch(() => ({} as Record<string, string>));
    setGuardando(false);

    if (!r.ok) { setMal(j.error ?? "No se pudo guardar."); return }
    /* Mismo cuidado que en "Nueva clave": un 200 con el cuerpo vacío es
       una respuesta cortada, y decir "listo" ahí sería mentir. */
    if (!j.id) {
      setMal(
        "El servidor cortó la respuesta y no se sabe si guardó. Recarga la " +
        "página y mira cómo quedó antes de volver a intentar."
      );
      return;
    }
    if (j.cambioUsuario && j.eresTu) {
      setMal(
        `Listo. OJO: te cambiaste TU PROPIO usuario. Esta sesión sigue abierta, ` +
        `pero la próxima vez tienes que entrar como "${usu}".`
      );
    }
    setLista((l) => l.map((x) => (x.id === p.id ? {
      ...x,
      nombre: j.nombre as string,
      usuario: j.usuario as string,
      rol: (j.rol as string) ?? x.rol,
      permisos_extra: (j.permisos_extra as Record<string, Nivel>) ?? x.permisos_extra,
    } : x)));
    setEditando(null);
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
  /* LO QUE DA CADA ROL, indexado una vez. La tabla llega plana —una
     línea por rol y sección— y el selector la consulta por ruta en cada
     casilla: buscarla con un filter() ahí adentro sería recorrer la
     lista entera diecisiete veces por cada render. */
  const porRol = useMemo(() => {
    const m: Record<string, Record<string, "ver" | "editar">> = {};
    for (const p of delRol) (m[p.rol] ??= {})[p.seccion] = p.nivel;
    return m;
  }, [delRol]);

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
      {dialogo}
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
            <h2>{lista.length} {lista.length === 1 ? "persona" : "personas"}</h2>
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
                Se suma a lo que ya le da su rol y nunca le quita nada. Lo que el rol ya
                da aparece marcado. Es para la excepción; si son varios, el sitio es el rol.
              </p>
              <Pantallas catalogo={catalogo} valor={extra} cambiar={setExtra}
                         delRol={porRol[rol] ?? {}} nombreRol={nRol(rol)}
                         mandaElRol={!!roles.find((r) => r.clave === rol)?.manda} />
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
                <th>Pantallas extra</th><th>Estado</th><th className="us-acc">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const ex = Object.entries(p.permisos_extra ?? {});
                const enEdicion = editando === p.id;
                const fila = (
                  <tr key={p.id} className={enEdicion ? "us-editando" : undefined}>
                    <td>
                      {enEdicion ? (
                        <input className="us-campo" value={edNombre} autoFocus
                               aria-label="Nombre"
                               onChange={(e) => setEdNombre(e.target.value)} />
                      ) : (p.nombre || "—")}
                    </td>
                    <td className="cod">
                      {enEdicion ? (
                        <input className="us-campo cod" value={edUsuario}
                               aria-label="Usuario"
                               onChange={(e) => setEdUsuario(normalizarUsuario(e.target.value))} />
                      ) : (p.usuario || "—")}
                    </td>
                    <td>
                      {enEdicion ? (
                        <select className="us-campo" value={edRol} aria-label="Rol"
                                onChange={(e) => setEdRol(e.target.value)}>
                          {roles.map((r) => (
                            <option key={r.clave} value={r.clave}>{r.nombre}</option>
                          ))}
                        </select>
                      ) : nRol(p.rol)}
                    </td>
                    {/* LA CUENTA, NO LA LISTA. Aquí vivían las diecisiete
                        chapas de Santiago Leal, una debajo de otra: la
                        fila medía cinco veces las demás, la tabla dejaba
                        de leerse de un vistazo —que es para lo único que
                        sirve una tabla— y encima no se podía tocar
                        ninguna. La lista completa está a un clic, en el
                        editor, que es donde además se puede cambiar. */}
                    <td className="us-cuantas">
                      {enEdicion
                        ? <span className="us-editando-aqui">
                            {Object.keys(edExtra).length === 0
                              ? "ninguna" : `${Object.keys(edExtra).length} elegidas`} · abajo ↓
                          </span>
                        : ex.length === 0
                          ? <span className="apagado">—</span>
                          : <button type="button" className="us-chapa cuenta"
                                    disabled={!hayLlave || !!editando}
                                    title={ex.map(([r, n]) => `${nRuta(r)} · ${n}`).join("\n")}
                                    onClick={() => abrirEdicion(p)}>
                              {ex.length} pantalla{ex.length === 1 ? "" : "s"}
                              <em>ver y cambiar</em>
                            </button>}
                    </td>
                    <td>
                      {!p.activo
                        ? <span className="us-estado mal">inactivo</span>
                        : p.clave_provisional
                          ? <span className="us-estado ojo">clave provisional</span>
                          : <span className="us-estado bien">al día</span>}
                    </td>
                    <td className="us-acc">
                      {enEdicion ? (
                        <>
                          <button type="button" className="us-mini fuerte" disabled={guardando}
                                  onClick={() => guardarEdicion(p)}>
                            {guardando ? "Guardando…" : "Guardar"}
                          </button>
                          <button type="button" className="us-mini" disabled={guardando}
                                  onClick={() => { setEditando(null); setMal(null) }}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {/* EDITAR sí es para uno mismo: corregir el
                              propio nombre no encierra a nadie afuera, y
                              si además se cambia el usuario, la respuesta
                              lo advierte. */}
                          <button type="button" className="us-mini" disabled={!hayLlave || !!editando}
                                  onClick={() => abrirEdicion(p)}>
                            Editar
                          </button>
                          {p.id === yo ? (
                            /* La CLAVE a uno mismo no: sería encerrarse
                               afuera de la sesión con la que se está
                               administrando. Para eso está Mi perfil. */
                            <span className="apagado">eres tú</span>
                          ) : (
                            <button type="button" className="us-mini"
                                    disabled={!hayLlave || !!regenerando || !!editando}
                                    onClick={() => nuevaClave(p)}>
                              {regenerando === p.id ? "Generando…" : "Nueva clave"}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
                /* EL PANEL DE PANTALLAS VA EN SU PROPIA FILA, a todo lo
                   ancho, y no en una ventana encima: lo mismo que ya
                   valía para el nombre y el usuario vale aquí —una
                   ventana tapa justo el resto de la lista, que es contra
                   lo que uno compara—. Y a todo lo ancho porque son
                   diecisiete casillas: en una celda de tabla no caben
                   sin volver a reventar la fila. */
                return enEdicion ? (
                  <Fragment key={p.id}>
                    {fila}
                    <tr className="us-panel">
                      <td colSpan={6}>
                        <p className="us-rot">
                          A qué entra {p.nombre || p.usuario}
                          <em> — y a qué no</em>
                        </p>
                        <p className="us-dice">
                          A la izquierda, en qué queda cada pantalla. Los botones dan lo
                          <b> suelto</b>, que se SUMA a lo del rol y nunca le quita nada —por
                          eso lo que el rol ya da no se puede volver a dar—. Toca el nivel
                          otra vez para quitarlo. Y si a varias personas les hace falta la
                          misma pantalla, el sitio es el <b>rol</b>, no aquí.
                        </p>
                        <Pantallas catalogo={catalogo} valor={edExtra} cambiar={setEdExtra}
                                   delRol={porRol[edRol] ?? {}} nombreRol={nRol(edRol)}
                                   mandaElRol={!!roles.find((r) => r.clave === edRol)?.manda} />
                      </td>
                    </tr>
                  </Fragment>
                ) : fila;
              })}
              {lista.length === 0 && (
                <tr><td colSpan={6} className="apagado">Todavía no hay nadie.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
