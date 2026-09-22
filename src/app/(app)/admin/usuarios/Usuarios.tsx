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
import { PanelLado, Ini, Aviso } from "./PanelLado";

type Persona = {
  id: string; usuario: string | null; nombre: string | null; rol: string;
  activo: boolean; clave_provisional: boolean;
  /** Lo de ESTA persona. Manda sobre el rol, y «ninguno» es un valor:
      es cómo se le quita una pantalla que su rol sí le da. */
  permisos_extra: Record<string, Nivel> | null;
};
type Rol = { clave: string; nombre: string; manda: boolean; descripcion?: string | null };
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

/** «hace 3 días», «hoy 10:42», «nunca». Lo que se lee de un vistazo. */
function haceCuanto(s: string | null | undefined): string {
  if (!s) return "nunca";
  const t = new Date(s), ahora = new Date();
  const dias = Math.floor((ahora.getTime() - t.getTime()) / 86_400_000);
  const hora = t.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  if (t.toDateString() === ahora.toDateString()) return `hoy ${hora}`;
  if (dias < 1) return `ayer ${hora}`;
  if (dias < 30) return `hace ${dias + 1} días`;
  return t.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

type Estado = "todos" | "activos" | "inactivos" | "provisional" | "nunca";
type Orden = "nombre" | "ingreso" | "rol" | "registros";
type Resultado = { nombre: string; usuario: string; ok: boolean; clave?: string; error?: string };
/** Una clave lista para entregar. */
type Clave = { nombre: string; usuario: string; clave: string };
/** Lo que está abierto en el panel de la derecha. */
type Panel =
  | { tipo: "menu" }
  | { tipo: "rol"; ids: string[] }
  | { tipo: "eliminar"; ids: string[] }
  | { tipo: "claves"; titulo: string; filas: Clave[]; fallas: Resultado[]; rol?: string };

/** Los nombres pegados —de Excel, de un chat— a una fila por persona. */
export function leerNombres(texto: string): string[] {
  return texto.split(/\r?\n|;/).map((x) => x.split("\t")[0].replace(/\s+/g, " ").trim()).filter((x) => x.length >= 3);
}

/** Usuarios propuestos para un lote: sin chocar con los que ya existen
 *  ni entre ellos. «gvisbal», «gvisbal2», «gvisbal3». */
export function proponerLote(nombres: string[], tomados: Set<string>): string[] {
  const usados = new Set(tomados);
  return nombres.map((n) => {
    const base = proponer(n) || "usuario";
    let u = base, k = 2;
    while (usados.has(u)) u = `${base}${k++}`;
    usados.add(u);
    return u;
  });
}

export function Usuarios({ gente, roles, delRol, catalogo, hayLlave, yo, ingresos, registros, buscar }: {
  gente: Persona[];
  roles: Rol[];
  /** Lo que ya da cada rol, para no dar suelto lo que ya venía puesto. */
  delRol: PermisoRol[];
  catalogo: Modulo[];
  hayLlave: boolean;
  /** Quién está mirando: a uno mismo no se le genera clave desde aquí. */
  yo: string;
  /** Última vez que entró cada uno. null = falta el SQL. */
  ingresos: Record<string, string | null> | null;
  /** Cuántos registros ha dejado cada uno. null = falta el SQL. */
  registros: Record<string, number> | null;
  /** Lo que llega en ?q= (desde Roles › Quiénes lo tienen). */
  buscar: string;
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

  /* ---------- BUSCAR, FILTRAR Y ORDENAR ---------- */
  const [q, setQ] = useState(buscar);
  const [fRol, setFRol] = useState("");
  const [fEstado, setFEstado] = useState<Estado>("todos");
  const [orden, setOrden] = useState<Orden>("nombre");
  const plano = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visibles = useMemo(() => {
    const t = plano(q.trim());
    const out = lista.filter((p) =>
      (!t || plano(`${p.nombre ?? ""} ${p.usuario ?? ""}`).includes(t)) &&
      (!fRol || p.rol === fRol) &&
      (fEstado === "todos" ? true
        : fEstado === "activos" ? p.activo
        : fEstado === "inactivos" ? !p.activo
        : fEstado === "provisional" ? p.activo && p.clave_provisional
        : !ingresos?.[p.id]));
    const ing = (p: Persona) => (ingresos?.[p.id] ? Date.parse(ingresos[p.id]!) : 0);
    out.sort((a, b) =>
      orden === "ingreso" ? ing(b) - ing(a)
      : orden === "registros" ? (registros?.[b.id] ?? 0) - (registros?.[a.id] ?? 0)
      : orden === "rol" ? a.rol.localeCompare(b.rol) || (a.nombre ?? "").localeCompare(b.nombre ?? "")
      : (a.nombre ?? a.usuario ?? "").localeCompare(b.nombre ?? b.usuario ?? "", "es"));
    return out;
  }, [lista, q, fRol, fEstado, orden, ingresos, registros]);

  /* ---------- VARIOS A LA VEZ ---------- */
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [enLote, setEnLote] = useState(false);
  const [bien, setBien] = useState<string | null>(null);
  const marcar = (id: string) => setSel((s0) => { const s1 = new Set(s0); if (s1.has(id)) s1.delete(id); else s1.add(id); return s1 });
  const todosVisibles = visibles.length > 0 && visibles.every((p) => sel.has(p.id));
  const marcarTodos = () => setSel(todosVisibles ? new Set() : new Set(visibles.map((p) => p.id)));

  /* ---------- CREAR VARIOS ---------- */
  const [varios, setVarios] = useState(false);
  const [texto, setTexto] = useState("");
  const [rolVarios, setRolVarios] = useState(roles.find((r) => !r.manda)?.clave ?? roles[0]?.clave ?? "");
  const [propuestos, setPropuestos] = useState<string[]>([]);
  const nombresLote = useMemo(() => leerNombres(texto), [texto]);
  useEffect(() => {
    setPropuestos(proponerLote(nombresLote, new Set(lista.map((p) => p.usuario ?? ""))));
  }, [nombresLote, lista]);

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [tocado, setTocado] = useState(false);
  const [rol, setRol] = useState(roles.find((r) => !r.manda)?.clave ?? roles[0]?.clave ?? "");
  const [extra, setExtra] = useState<Record<string, Nivel>>({});
  const [libre, setLibre] = useState<boolean | null>(null);
  const [creando, setCreando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  /* EL PANEL DE LA DERECHA: cambiar rol, eliminar, o las claves recién
     generadas. Uno a la vez. */
  const [panel, setPanel] = useState<Panel | null>(null);
  const [rolPanel, setRolPanel] = useState("");
  const [escrito, setEscrito] = useState("");
  const abrir = (x: Panel) => { setPanel(x); setRolPanel(""); setEscrito(""); setMal(null); setBien(null) };

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
  /** Una clave nueva para una persona. Devuelve la clave, o null y deja
   *  dicho el porqué en `mal`. */
  async function generarClave(p: Persona): Promise<Clave | null> {
    setRegenerando(p.id);
    const r = await fetch("/api/admin/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    const j = await r.json().catch(() => ({} as Record<string, string>));
    setRegenerando(null);
    /* La clave nueva cambia lo que se VE —el estado pasa a «clave
       provisional»—, así que se pinta aquí y no se espera a consultar. */
    setLista((l) => l.map((x) => (x.id === p.id ? { ...x, clave_provisional: true } : x)));
    /* Si la clave SÍ cambió pero algo más falló, el servidor la manda
       igual: perderla por un error posterior dejaría a la persona sin
       poder entrar y sin que nadie sepa con qué. */
    if (j.clave) {
      if (!r.ok) setMal(j.error ?? null);
      return { usuario: j.usuario || p.usuario || "", nombre: j.nombre || p.nombre || j.usuario || "", clave: j.clave };
    }
    setMal(!r.ok ? (j.error ?? "No se pudo generar la clave.")
      /* 200 con el cuerpo vacío: Vercel corta la respuesta a mitad. Y la
         clave SÍ puede haber cambiado: el corte pasa después. */
      : `El servidor cortó la respuesta y la clave no llegó. Es posible que SÍ ` +
        `haya cambiado, así que la anterior puede que ya no sirva: vuelve a darle ` +
        `"Nueva clave" a ${p.nombre || p.usuario} y usa la que salga.`);
    return null;
  }
  /* GENERARLE UNA CLAVE NUEVA a una o a varias personas. Las claves salen
     juntas en el panel, UNA vez, y no se guardan en ninguna parte. */
  async function nuevasClaves(ps: Persona[]) {
    if (ps.some((p) => p.id === yo)) { setMal("Tú estás en la selección: tu clave se cambia en Mi perfil."); return }
    setMal(null); setBien(null);
    const filas: Clave[] = [];
    for (const p of ps) { const c = await generarClave(p); if (c) filas.push(c) }
    router.refresh();
    if (filas.length) {
      setPanel({ tipo: "claves", titulo: filas.length === 1 ? "Nueva clave" : `${filas.length} claves nuevas`, filas, fallas: [] });
      setSel(new Set());
    }
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
  const [errVarios, setErrVarios] = useState<string | null>(null);
  const [avance, setAvance] = useState<string | null>(null);

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
    abrir({ tipo: "claves", titulo: "Usuario creado", rol,
            filas: [{ usuario: j.usuario, nombre: j.nombre || j.usuario, clave: j.clave }], fallas: [] });
    setAbierto(false);
    limpiar();
    router.refresh();
  }

  /* ---------- VARIOS: ROL, ACTIVAR, DESACTIVAR, ELIMINAR ----------
     Todo pasa por la misma ruta y se confirma diciendo A QUIÉNES: una
     acción de a varios que no nombra a nadie es cómo se desactiva a quien
     no era. */
  const nomDe = (ids: string[]) => {
    const n = ids.map((id) => { const p = lista.find((x) => x.id === id); return p?.nombre || p?.usuario || "?" });
    return n.length <= 5 ? n.join(", ") : `${n.slice(0, 5).join(", ")} y ${n.length - 5} más`;
  };
  async function lote(accion: "rol" | "activar" | "desactivar" | "eliminar", ids: string[], rolNuevo?: string,
                      yaConfirmado = false) {
    if (ids.length === 0) return;
    const conmigo = ids.includes(yo) && accion !== "activar";
    if (conmigo) { setMal("Tú estás en la selección: quítate para cambiar el rol, desactivar o eliminar."); return }
    const quien = nomDe(ids);
    const conRastro = ids.filter((id) => (registros?.[id] ?? 0) > 0);
    /* Cambiar rol y eliminar se confirman EN EL PANEL —que ya nombra a
       quiénes y dice qué va a pasar—; preguntar otra vez sería pedir el
       mismo sí dos veces. */
    const ok = yaConfirmado || await pedir(
      accion === "rol" ? {
        titulo: `¿Pasar ${ids.length === 1 ? "a esta persona" : `a estas ${ids.length} personas`} a ${nRol(rolNuevo ?? "")}?`,
        dice: <><p>{quien}.</p><p>Desde que vuelvan a abrir una pantalla ven lo de <b>{nRol(rolNuevo ?? "")}</b>.</p></>,
        confirmar: "Cambiar el rol",
      } : accion === "activar" ? {
        titulo: `¿Activar ${ids.length === 1 ? "a esta persona" : `a estas ${ids.length} personas`}?`,
        dice: <p>{quien}. Vuelven a poder entrar con su usuario y su clave.</p>,
        confirmar: "Activar",
      } : accion === "desactivar" ? {
        titulo: `¿Desactivar ${ids.length === 1 ? "a esta persona" : `a estas ${ids.length} personas`}?`,
        dice: <><p>{quien}.</p><p>No pueden entrar más, ni con una sesión que tengan abierta. Lo que registraron
          se queda con su nombre. Se puede volver a activar.</p></>,
        confirmar: "Desactivar", peligro: true,
      } : {
        titulo: `¿Eliminar ${ids.length === 1 ? "a esta persona" : `a estas ${ids.length} personas`}?`,
        dice: <><p>{quien}.</p>
          {conRastro.length > 0 && <p><b>{conRastro.length === ids.length ? (ids.length === 1 ? "Tiene" : "Todas tienen") : `${conRastro.length} tienen`} registros</b>
            ({nomDe(conRastro)}): {conRastro.length === 1 ? "esa se desactiva" : "esas se desactivan"} en vez de borrarse, para no perder quién hizo qué.</p>}
          {conRastro.length < ids.length && <p>{conRastro.length > 0 ? "Las demás no" : ids.length === 1 ? "No" : "No"} han registrado nada: se borran del todo y su usuario queda libre. <b>No se puede deshacer.</b></p>}</>,
        confirmar: "Eliminar", peligro: true,
      });
    if (!ok) return;
    setEnLote(true); setMal(null); setBien(null);
    const r = await fetch("/api/admin/usuarios/lote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion, ids, rol: rolNuevo }),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>));
    setEnLote(false);
    if (!r.ok) { setMal(String(j.error ?? "No se pudo.")); return }
    if (accion === "eliminar") {
      const rs = (j.resultados ?? []) as { id: string; nombre: string; hecho: string; registros: number; error?: string }[];
      const el = rs.filter((x) => x.hecho === "eliminado"), de = rs.filter((x) => x.hecho === "desactivado"), er = rs.filter((x) => x.hecho === "error");
      setLista((l) => l.filter((x) => !el.some((e) => e.id === x.id)).map((x) => de.some((d) => d.id === x.id) ? { ...x, activo: false } : x));
      const dicho = [el.length && `${el.length} eliminado${el.length === 1 ? "" : "s"}`,
               de.length && `${de.length} desactivado${de.length === 1 ? "" : "s"} porque ${de.length === 1 ? "tenía" : "tenían"} registros`].filter(Boolean).join(" · ");
      setBien(dicho ? dicho + "." : null);
      if (er.length) setMal(er.map((x) => `${x.nombre}: ${x.error}`).join(" · "));
    } else {
      setLista((l) => l.map((x) => !ids.includes(x.id) ? x
        : accion === "rol" ? { ...x, rol: rolNuevo! } : { ...x, activo: accion === "activar" }));
      const n = Number(j.cambiados ?? ids.length);
      setBien(`${n} ${n === 1 ? "persona" : "personas"}: ${accion === "rol" ? `ahora con rol ${nRol(rolNuevo!)}` : accion === "activar" ? "activadas" : "desactivadas"}.`
        + (Number(j.sinBloqueo) ? ` A ${j.sinBloqueo} no se les pudo bloquear la sesión abierta.` : ""));
    }
    setSel(new Set());
    setPanel(null);
    router.refresh();
  }

  /* ---------- CREAR VARIOS ---------- */
  async function crearVarios() {
    const personas = nombresLote.map((nombre, i) => ({ nombre, usuario: propuestos[i] }));
    if (personas.length === 0) return;
    if (!(await pedir({
      titulo: `¿Crear ${personas.length} ${personas.length === 1 ? "usuario" : "usuarios"} con rol ${nRol(rolVarios)}?`,
      dice: <p>Cada uno sale con su clave provisional, que se muestra una sola vez al terminar.</p>,
      confirmar: `Crear ${personas.length}`,
    }))) return;
    /* DE A CINCO, NO TODOS DE UNA. Crear una cuenta son varias idas a
       Supabase; con quince de una sola vez el servidor se pasaba del
       tiempo, cortaba la respuesta y la pantalla se quedaba como si nada
       —las cuentas quedaban creadas o no, sin que nadie supiera—. Así
       cada tanda llega con sus claves, y el avance se ve en el botón. */
    setEnLote(true); setMal(null); setBien(null); setErrVarios(null); setAvance(`0 de ${personas.length}`);
    const rs: Resultado[] = [];
    let corte: string | null = null;
    for (let i = 0; i < personas.length; i += 5) {
      const tanda = personas.slice(i, i + 5);
      try {
        const r = await fetch("/api/admin/usuarios/lote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "crear", rol: rolVarios, personas: tanda }),
        });
        const j = await r.json().catch(() => null) as { resultados?: Resultado[]; error?: string } | null;
        if (!r.ok || !j?.resultados?.length) {
          corte = j?.error ?? (r.status === 504 || r.status === 502
            ? "El servidor tardó demasiado en contestar."
            : `El servidor contestó ${r.status} sin decir qué pasó.`);
          break;
        }
        rs.push(...j.resultados);
      } catch {
        corte = "Se cortó la conexión con el servidor.";
        break;
      }
      setAvance(`${Math.min(i + 5, personas.length)} de ${personas.length}`);
    }
    setEnLote(false); setAvance(null);
    router.refresh();
    if (corte) {
      const faltan = personas.slice(rs.length).map((p) => p.nombre);
      setErrVarios(`${corte} ${rs.length ? `Se alcanzaron a procesar ${rs.length}; ` : ""}` +
        `faltan: ${faltan.join(", ")}. Quedaron en la lista de nombres: dale «Crear» otra vez.`);
      setTexto(faltan.join("\n"));
      if (!rs.length) return;
    }
    abrir({ tipo: "claves", titulo: `${rs.filter((x) => x.ok).length} de ${personas.length} usuarios creados`,
            filas: rs.filter((x) => x.ok).map((x) => ({ nombre: x.nombre, usuario: x.usuario, clave: x.clave ?? "" })),
            fallas: rs.filter((x) => !x.ok), rol: rolVarios });
    if (!corte) { setTexto(""); setVarios(false) }
  }
  /* EL MENSAJE PARA MANDAR: el enlace de entrada y, por persona, su
     usuario y su clave — listo para pegar en WhatsApp o en un correo. */
  function copiarMensaje(filas: Clave[]) {
    const url = typeof window === "undefined" ? "" : `${location.origin}/login`;
    const t = [`Accesos a CONTROL · ${url}`, "", ...filas.map((x) => `${x.nombre}\nUsuario: ${x.usuario}\nClave: ${x.clave}\n`),
      "Al entrar la primera vez te pide cambiar la clave."].join("\n");
    navigator.clipboard?.writeText(t).then(
      () => setBien("Mensaje copiado: pégalo en WhatsApp o en un correo."),
      () => setMal("No se pudo copiar."));
  }
  function copiarClaves(filas: Clave[]) {
    const t = filas.length === 1 ? `${filas[0].usuario}\t${filas[0].clave}`
      : ["Nombre\tUsuario\tClave provisional", ...filas.map((x) => `${x.nombre}\t${x.usuario}\t${x.clave}`)].join("\n");
    navigator.clipboard?.writeText(t).then(
      () => setBien(filas.length === 1 ? `Copiada la de ${filas[0].nombre}.` : "Copiadas: pégalas en Excel o en un chat."),
      () => setMal("No se pudo copiar."));
  }
  function bajarClaves(filas: Clave[], rolNombre: string) {
    const f = [["Nombre", "Usuario", "Clave provisional", "Rol"], ...filas.map((x) => [x.nombre, x.usuario, x.clave, rolNombre])];
    const csv = "\ufeff" + f.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `claves-provisionales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
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

  /* ================= EL PANEL DE LA DERECHA ================= */
  /* Con alguien marcado y nada abierto, el panel enseña qué se puede
     hacer con ellos (paso 1). */
  const visto: Panel | null = panel ?? (sel.size > 0 ? { tipo: "menu" } : null);
  const persona = (id: string) => lista.find((x) => x.id === id);
  const nom = (p?: Persona) => p?.nombre || p?.usuario || "?";
  const cuantasPantallas = (clave: string) =>
    roles.find((r) => r.clave === clave)?.manda ? catalogo.reduce((a, m) => a + m.secciones.length, 0)
      : Object.keys(porRol[clave] ?? {}).length;

  function pintarPanel(x: Panel) {
    /* ‹ VUELVE al paso anterior —lo que se puede hacer con los
       seleccionados— y × CIERRA del todo, soltando la selección. */
    const volver = () => setPanel(null);
    const cerrar = () => { setPanel(null); setSel(new Set()) };

    /* PASO 1 · QUÉ HACER CON LOS SELECCIONADOS. Sale solo al marcar a
       alguien, al lado de la tabla —como el diseño—, sin tener que
       buscar un botón. */
    if (x.tipo === "menu") {
      const ps = lista.filter((p) => sel.has(p.id));
      const nombres = ps.map(nom);
      const n = ps.length;
      const conmigo = sel.has(yo);
      const acciones: { que: string; dice: string; hacer: () => void; peligro?: boolean; no?: boolean }[] = [
        { que: "Cambiar rol", dice: "Pasarlos a otro rol y ver cómo queda", hacer: () => abrir({ tipo: "rol", ids: [...sel] }) },
        { que: "Nueva clave", dice: "Una clave provisional para entregar", hacer: () => nuevasClaves(ps), no: conmigo || !!regenerando },
        ...(ps.some((p) => !p.activo) ? [{ que: "Activar", dice: "Que vuelvan a poder entrar", hacer: () => lote("activar", [...sel]) }] : []),
        ...(ps.some((p) => p.activo) ? [{ que: "Desactivar", dice: "Que no entren; se puede revertir", hacer: () => lote("desactivar", [...sel]) }] : []),
        { que: "Eliminar", dice: "Borrar la cuenta; quien tiene registros se desactiva", hacer: () => abrir({ tipo: "eliminar", ids: [...sel] }), peligro: true },
      ];
      return (
        <PanelLado menu titulo={`${n} ${n === 1 ? "seleccionado" : "seleccionados"}`}
          sub={n <= 3 ? nombres.join(n === 2 ? " y " : ", ") : `${nombres.slice(0, 2).join(", ")} y ${n - 2} más`}
          cerrar={cerrar}
          pie={<button type="button" className="btn sec" onClick={cerrar}>Quitar selección</button>}>
          <p className="us-pnl-rot">Qué quieres hacer</p>
          <div className="us-pnl-menu">
            {acciones.map((a) => (
              <button key={a.que} type="button" className={"us-pnl-acc" + (a.peligro ? " peligro" : "")}
                      disabled={enLote || !hayLlave || !!a.no} onClick={a.hacer}>
                <span><b>{a.que}</b><small>{a.dice}</small></span>
                <svg viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
              </button>
            ))}
          </div>
          <div className="us-pnl-chips">
            {ps.map((p) => (
              <span className="us-pnl-chip" key={p.id}>
                <Ini de={nom(p)} />{nom(p)}
                <button type="button" onClick={() => marcar(p.id)} aria-label={`Quitar a ${nom(p)}`}>×</button>
              </span>
            ))}
          </div>
        </PanelLado>
      );
    }

    if (x.tipo === "claves") {
      return (
        <PanelLado fijo titulo={x.titulo} sub="Lista para entregar" cerrar={volver} volver={volver}
          pie={<>
            <button type="button" className="btn" onClick={() => copiarMensaje(x.filas)} disabled={!x.filas.length}>
              Copiar para compartir
            </button>
            <button type="button" className="btn sec" onClick={() => copiarClaves(x.filas)} disabled={!x.filas.length}>
              {x.filas.length === 1 ? "Copiar" : x.filas.length === 2 ? "Copiar las dos" : `Copiar las ${x.filas.length}`}
            </button>
            {/* El Excel es para un lote de creados; para una o dos claves
                sobra un botón y en el celular no caben tres. */}
            {x.filas.length > 2 && (
              <button type="button" className="btn sec" onClick={() => bajarClaves(x.filas, nRol(x.rol ?? ""))}>Bajar Excel</button>
            )}
            <button type="button" className="btn sec" onClick={volver}>Listo</button>
          </>}>
          <Aviso tono="amb">
            <b>Se muestra{x.filas.length === 1 ? "" : "n"} una sola vez.</b> Cópiala{x.filas.length === 1 ? "" : "s"} ahora;
            al cerrar este panel ya no se puede{x.filas.length === 1 ? "" : "n"} volver a ver. En el primer ingreso
            {x.filas.length === 1 ? " le" : " les"} pedirá cambiarla.
          </Aviso>
          {/* LA TABLITA PARA ENTREGAR: nombre, usuario y clave, cada una
              con su botón de copiar. Arriba, el mensaje listo para mandar
              por WhatsApp o correo con el enlace de entrada. */}
          <div className="us-marco us-claves-marco">
            <table className="us-tabla us-tabla-claves">
              <thead><tr><th>#</th><th>Nombre</th><th>Usuario</th><th>Clave provisional</th><th /></tr></thead>
              <tbody>
                {x.filas.map((c, i) => (
                  <tr key={c.usuario}>
                    <td className="apagado">{i + 1}</td>
                    <td>{c.nombre}</td>
                    <td><span className="cod">{c.usuario}</span></td>
                    <td><code className="us-clave-cod">{c.clave}</code></td>
                    <td>
                      <button type="button" className="us-pnl-copiar" onClick={() => copiarClaves([c])}
                              aria-label={`Copiar usuario y clave de ${c.nombre}`} title="Copiar">
                        <svg viewBox="0 0 24 24" aria-hidden><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {x.fallas.length > 0 && (
            <Aviso tono="mal">
              <b>{x.fallas.length === 1 ? "Uno no se creó" : `${x.fallas.length} no se crearon`}:</b>{" "}
              {x.fallas.map((f) => `${f.nombre} (${f.usuario}): ${f.error}`).join(" · ")}
            </Aviso>
          )}
        </PanelLado>
      );
    }

    const gente = x.ids.map(persona).filter(Boolean) as Persona[];
    const quitar = (id: string) => {
      const ids = x.ids.filter((y) => y !== id);
      if (ids.length === 0) { setPanel(null); setSel(new Set()); return }
      setPanel({ ...x, ids });
      setSel(new Set(ids));
    };
    const conmigo = x.ids.includes(yo);

    if (x.tipo === "rol") {
      const nombres = gente.map(nom);
      const sub = nombres.length <= 3 ? nombres.join(nombres.length === 2 ? " y " : ", ")
        : `${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} más`;
      const cambian = gente.filter((p) => p.rol !== rolPanel);
      return (
        <PanelLado titulo="Cambiar rol" sub={sub} cerrar={cerrar} volver={volver}
          pie={<>
            <button type="button" className="btn sec" onClick={volver}>Cancelar</button>
            <button type="button" className="btn" disabled={!rolPanel || cambian.length === 0 || enLote || conmigo}
                    onClick={() => lote("rol", cambian.map((p) => p.id), rolPanel, true)}>
              {enLote ? "Cambiando…" : rolPanel ? `Cambiar a ${nRol(rolPanel)}` : "Escoge el rol"}
            </button>
          </>}>
          {conmigo && <Aviso tono="mal">Tú estás en la selección: quítate para cambiar el rol.</Aviso>}
          <p className="us-pnl-rot">Escoge el rol nuevo</p>
          <div className="us-pnl-roles" role="radiogroup" aria-label="Rol nuevo">
            {roles.map((r) => {
              const hoy = gente.filter((p) => p.rol === r.clave).map(nom);
              const n = cuantasPantallas(r.clave);
              return (
                <button key={r.clave} type="button" role="radio" aria-checked={rolPanel === r.clave}
                        className={"us-pnl-ro" + (rolPanel === r.clave ? " on" : "")}
                        onClick={() => setRolPanel(r.clave)}>
                  <span className="rd" aria-hidden />
                  <span className="tx">
                    <b>{r.nombre}{hoy.length > 0 && (
                      <em className="hoy">HOY · {hoy.length <= 2 ? hoy.join(", ") : `${hoy.length} de ellos`}</em>)}</b>
                    <small>{r.descripcion || (r.manda ? "Administra la plataforma, incluido Usuarios" : `${n} pantalla${n === 1 ? "" : "s"}`)}</small>
                  </span>
                  <span className="pt" title={`${n} pantallas`} aria-label={`${n} pantallas`}>{n}</span>
                </button>
              );
            })}
          </div>
          {rolPanel && (
            <>
              <p className="us-pnl-rot">Así queda</p>
              <div className="us-pnl-queda">
                {gente.map((p) => (
                  <div className="l" key={p.id}>
                    <Ini de={nom(p)} />
                    <b>{nom(p)}</b>
                    {p.rol === rolPanel
                      ? <span className="igual">ya es {nRol(rolPanel)}</span>
                      : <span className="cambio"><s>{nRol(p.rol)}</s><span aria-hidden>→</span><span className="a">{nRol(rolPanel)}</span></span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </PanelLado>
      );
    }

    /* ELIMINAR. Lo que de verdad pasa, no lo que suena bien: quien no
       ha registrado nada se borra del todo; quien sí, se DESACTIVA,
       porque sus registros siguen en los informes con su nombre. */
    const conRastro = gente.filter((p) => (registros?.[p.id] ?? 0) > 0);
    const sinRastro = gente.filter((p) => (registros?.[p.id] ?? 0) === 0);
    const regs = conRastro.reduce((a, p) => a + (registros?.[p.id] ?? 0), 0);
    const listo = escrito.trim().toUpperCase() === "ELIMINAR";
    const n = gente.length;
    return (
      <PanelLado titulo={`Eliminar ${n === 1 ? nom(gente[0]) : `${n} usuarios`}`} sub="Esto no se deshace" cerrar={cerrar} volver={volver}
        pie={<>
          <button type="button" className="btn sec" onClick={volver}>Cancelar</button>
          <button type="button" className="btn rojo" disabled={!listo || enLote || conmigo}
                  onClick={() => lote("eliminar", x.ids, undefined, true)}>
            {enLote ? "Eliminando…" : `Eliminar ${n === 1 ? "usuario" : `${n} usuarios`}`}
          </button>
        </>}>
        {conmigo && <Aviso tono="mal">Tú estás en la selección: quítate para poder eliminar.</Aviso>}
        <Aviso tono="mal">
          {sinRastro.length > 0 && <><b>{sinRastro.length === n ? (n === 1 ? "Se borra la cuenta" : "Se borran las cuentas") : `${sinRastro.length} se borran del todo`}</b>
            {" "}y su usuario queda libre: no han registrado nada. </>}
          {conRastro.length > 0 && <><b>{conRastro.length === 1 ? (n === 1 ? "Tiene" : `${nom(conRastro[0])} tiene`) : `${conRastro.length} tienen`} {regs.toLocaleString("es-CO")} registro{regs === 1 ? "" : "s"}</b>:
            {" "}{conRastro.length === 1 ? "se desactiva" : "se desactivan"} en vez de borrarse, para que los informes sigan firmados con su nombre.</>}
        </Aviso>
        <div className="us-pnl-chips">
          {gente.map((p) => (
            <span className="us-pnl-chip" key={p.id}>
              <Ini de={nom(p)} />{nom(p)}
              <button type="button" onClick={() => quitar(p.id)} aria-label={`Quitar a ${nom(p)}`}>×</button>
            </span>
          ))}
        </div>
        <Aviso tono="amb">
          Si solo quieres que no entren, <b>desactivar</b> es suficiente y se puede revertir.{" "}
          <button type="button" className="us-pnl-link" disabled={enLote || conmigo}
                  onClick={() => lote("desactivar", x.ids, undefined, true)}>Desactivar en su lugar</button>
        </Aviso>
        <label className="us-pnl-conf">
          <span className="us-pnl-rot">Escribe ELIMINAR para confirmar</span>
          <input value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="ELIMINAR"
                 autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </label>
      </PanelLado>
    );
  }

  return (
    <>
      {dialogo}
      {/* LAS CLAVES, EN GRANDE Y AL CENTRO: es lo único que importa en ese
          momento y se ven una sola vez. Al lado de la lista se podían
          quedar fuera de la vista. */}
      {visto?.tipo === "claves" && (
        <div className="us-modal-velo" role="dialog" aria-modal="true" aria-label={visto.titulo}>
          <div className="us-modal">{pintarPanel(visto)}</div>
        </div>
      )}
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
      {bien && <p className="us-bien suelto" role="status">{bien}</p>}

      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>{lista.length} {lista.length === 1 ? "persona" : "personas"}</h2>
            <p>Quién entra a CONTROL y con qué rol.</p>
          </div>
          <div className="us-cab-bot">
            <button type="button" className="btn" disabled={!hayLlave}
                    onClick={() => { setAbierto((v) => !v); setVarios(false) }}>
              {abierto ? "Cerrar" : "Crear usuario"}
            </button>
            <button type="button" className="btn sec" disabled={!hayLlave}
                    onClick={() => { setVarios((v) => !v); setAbierto(false) }}>
              {varios ? "Cerrar" : "Crear varios"}
            </button>
          </div>
        </div>

        {/* CREAR VARIOS EN UN MISMO ROL: se pegan los nombres —de Excel, de
            un chat—, uno por renglón; el usuario de cada uno se propone
            solo, sin chocar con los que hay, y se puede corregir antes. */}
        {varios && (
          <div className="us-form us-varios">
            <div className="us-varios-rej">
              <label className="us-varios-rol">
                <span>Rol para todos</span>
                <select value={rolVarios} onChange={(e) => setRolVarios(e.target.value)}>
                  {roles.map((r) => (
                    <option key={r.clave} value={r.clave}>{r.nombre}{r.manda ? " · administra la plataforma" : ""}</option>
                  ))}
                </select>
              </label>
              <label className="us-varios-texto">
                <span>Nombres completos, uno por renglón</span>
                <textarea value={texto} rows={6} onChange={(e) => setTexto(e.target.value)}
                          placeholder={"Génesis Visbal\nSantiago Leal\nAna María Pérez"} />
                <em>Puedes pegar una columna de Excel. Máximo 50 por vez.</em>
              </label>
            </div>
            {nombresLote.length > 0 && (
              <div className="us-marco">
                <table className="us-tabla us-tabla-lote">
                  <thead><tr><th>#</th><th>Nombre</th><th>Usuario con que entra</th></tr></thead>
                  <tbody>
                    {nombresLote.map((n, i) => {
                      const u = propuestos[i] ?? "";
                      const choca = lista.some((p) => p.usuario === u) || propuestos.filter((x) => x === u).length > 1;
                      return (
                        <tr key={i}>
                          <td className="apagado">{i + 1}</td>
                          <td>{n}</td>
                          <td>
                            <input className="us-campo cod" value={u} aria-label={`Usuario de ${n}`}
                                   onChange={(e) => setPropuestos((ps) => ps.map((x, k) => k === i ? normalizarUsuario(e.target.value) : x))} />
                            {(choca || u.length < 3) && <em className="us-choca">{u.length < 3 ? "muy corto" : "ya está tomado"}</em>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="us-acciones">
              <button type="button" className="btn" onClick={crearVarios}
                      disabled={enLote || nombresLote.length === 0 || nombresLote.length > 50 ||
                        propuestos.some((u, i) => u.length < 3 || lista.some((p) => p.usuario === u) || propuestos.indexOf(u) !== i)}>
                {enLote ? `Creando… ${avance ?? ""}` : nombresLote.length === 0 ? "Pega los nombres"
                  : nombresLote.length > 50 ? `Son ${nombresLote.length}: máximo 50`
                  : `Crear ${nombresLote.length} ${nombresLote.length === 1 ? "usuario" : "usuarios"} · ${nRol(rolVarios)}`}
              </button>
              <button type="button" className="btn plano" onClick={() => { setVarios(false); setTexto("") }}>Cancelar</button>
            </div>
            {/* EL ERROR AQUÍ, al lado del botón que se tocó: arriba de la
                página nadie lo ve si bajó a pegar los nombres. */}
            {errVarios && <p className="us-mal" role="alert">{errVarios}</p>}
          </div>
        )}

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

        {/* BUSCAR Y FILTRAR: arriba de la tabla, en una fila. */}
        <div className="us-filtros">
          <label className="us-buscar">
            <span>Buscar</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Nombre o usuario" aria-label="Buscar por nombre o usuario" />
          </label>
          <label>
            <span>Rol</span>
            <select value={fRol} onChange={(e) => setFRol(e.target.value)}>
              <option value="">Todos</option>
              {roles.map((r) => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value as Estado)}>
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="provisional">Con clave provisional</option>
              {ingresos && <option value="nunca">Nunca han entrado</option>}
            </select>
          </label>
          <label>
            <span>Ordenar</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="nombre">Por nombre</option>
              <option value="rol">Por rol</option>
              {ingresos && <option value="ingreso">Último ingreso</option>}
              {registros && <option value="registros">Más registros</option>}
            </select>
          </label>
          <p className="us-cuenta">{visibles.length === lista.length ? `${lista.length} en total` : `${visibles.length} de ${lista.length}`}</p>
        </div>

        {/* LA BARRA DE LOS SELECCIONADOS: solo aparece cuando hay alguno. */}
        {sel.size > 0 && (
          <div className="us-lote" role="region" aria-label="Acciones para los seleccionados">
            <b>{sel.size} {sel.size === 1 ? "seleccionado" : "seleccionados"}</b>
            <button type="button" className="btn sec" disabled={enLote || !hayLlave}
                    onClick={() => abrir({ tipo: "rol", ids: [...sel] })}>Cambiar rol</button>
            <button type="button" className="btn sec" disabled={enLote || !hayLlave || !!regenerando}
                    onClick={() => nuevasClaves(lista.filter((p) => sel.has(p.id)))}>
              {regenerando ? "Generando…" : "Nueva clave"}</button>
            <button type="button" className="btn sec" disabled={enLote || !hayLlave} onClick={() => lote("activar", [...sel])}>Activar</button>
            <button type="button" className="btn sec" disabled={enLote || !hayLlave} onClick={() => lote("desactivar", [...sel])}>Desactivar</button>
            <button type="button" className="btn sec peligro" disabled={enLote || !hayLlave}
                    onClick={() => abrir({ tipo: "eliminar", ids: [...sel] })}>Eliminar</button>
            <button type="button" className="btn plano" onClick={() => setSel(new Set())}>Quitar selección</button>
          </div>
        )}

        {/* LA TABLA Y EL PANEL, LADO A LADO — como el diseño: al lado de la
            lista, no encima. Así se ve a quién se marcó mientras se decide,
            y no depende de nada flotando por encima de la página. En
            tableta y celular el panel va arriba de la tabla, a todo lo
            ancho. */}
        <div className={"us-cuerpo" + (visto ? " con-panel" + (visto.tipo === "menu" ? " es-menu" : "") : "")}>
        {visto && visto.tipo !== "claves" && pintarPanel(visto)}
        <div className="us-marco">
          <table className="us-tabla">
            <thead>
              <tr>
                <th className="us-marca"><input type="checkbox" checked={todosVisibles} onChange={marcarTodos}
                                                aria-label="Seleccionar todos los de la lista" /></th>
                <th>Nombre</th><th>Usuario</th><th>Rol</th>
                <th>Estado</th>
                <th>Último ingreso</th><th className="num">Registros</th>
                <th className="us-acc">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const ex = Object.entries(p.permisos_extra ?? {});
                const enEdicion = editando === p.id;
                const fila = (
                  <tr key={p.id} className={(enEdicion ? "us-editando" : "") + (sel.has(p.id) ? " us-sel" : "")}>
                    <td className="us-marca">
                      <input type="checkbox" checked={sel.has(p.id)} onChange={() => marcar(p.id)}
                             aria-label={`Seleccionar a ${p.nombre || p.usuario}`} />
                    </td>
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
                      {/* LAS PANTALLAS SUELTAS, debajo de su rol: es de lo que
                          se desvían. La cuenta, no la lista —la lista completa
                          está a un clic, en el editor—. */}
                      <div className="us-cuantas">
                      {enEdicion
                        ? <span className="us-editando-aqui">
                            {Object.keys(edExtra).length === 0
                              ? "ninguna" : `${Object.keys(edExtra).length} elegidas`} · abajo ↓
                          </span>
                        : ex.length === 0
                          ? null
                          : <button type="button" className="us-chapa cuenta"
                                    disabled={!hayLlave || !!editando}
                                    title={ex.map(([r, n]) => `${nRuta(r)} · ${n}`).join("\n")}
                                    onClick={() => abrirEdicion(p)}>
                              {ex.length} pantalla{ex.length === 1 ? "" : "s"}
                              <em>ver y cambiar</em>
                            </button>}
                    </div>
                    </td>
                    <td>
                      {!p.activo
                        ? <span className="us-estado mal">inactivo</span>
                        : p.clave_provisional
                          ? <span className="us-estado ojo">clave provisional</span>
                          : <span className="us-estado bien">al día</span>}
                    </td>
                    <td className="us-ingreso">{ingresos ? haceCuanto(ingresos[p.id]) : "—"}</td>
                    <td className="num">{registros ? (registros[p.id] ?? 0).toLocaleString("es-CO") : "—"}</td>
                    <td className="us-acc"><div className="us-acc-in">
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
                                    onClick={() => nuevasClaves([p])}>
                              {regenerando === p.id ? "Generando…" : "Nueva clave"}
                            </button>
                          )}
                          {p.id !== yo && (
                            <button type="button" className="us-mini"
                                    disabled={!hayLlave || enLote || !!editando}
                                    onClick={() => lote(p.activo ? "desactivar" : "activar", [p.id])}>
                              {p.activo ? "Desactivar" : "Activar"}
                            </button>
                          )}
                          {p.id !== yo && (
                            <button type="button" className="us-mini peligro"
                                    disabled={!hayLlave || enLote || !!editando}
                                    title={(registros?.[p.id] ?? 0) > 0 ? "Tiene registros: se desactiva en vez de borrarse" : "No ha registrado nada: se borra del todo"}
                                    onClick={() => abrir({ tipo: "eliminar", ids: [p.id] })}>
                              Eliminar
                            </button>
                          )}
                        </>
                      )}
                    </div></td>
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
                      <td colSpan={9}>
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
              {visibles.length === 0 && (
                <tr><td colSpan={9} className="apagado">{lista.length === 0 ? "Todavía no hay nadie." : "Nadie coincide con la búsqueda o los filtros."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </section>
    </>
  );
}
