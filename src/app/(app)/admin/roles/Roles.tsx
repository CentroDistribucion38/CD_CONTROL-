"use client";

/**
 * ROLES — crear roles y marcar qué ve cada uno, pantalla por pantalla.
 *
 * UN ROL A LA VEZ, no una matriz de todos contra todo. Una matriz de seis
 * roles por catorce secciones son ochenta y cuatro casillas: se ve
 * impresionante y nadie la lee. Aquí se escoge el rol, se marcan sus
 * pantallas y se guarda. La pregunta que alguien viene a hacer es "qué
 * puede hacer el de portería", no "cómo está todo el mundo".
 *
 * Y NADA SE GUARDA SOLO. Los cambios se acumulan y se guardan de una,
 * porque quitar un permiso a medias —guardando casilla por casilla— deja
 * a alguien afuera durante los segundos que uno tarda en marcar la
 * siguiente.
 */

import { useMemo, useState } from "react";
import { useConfirmar } from "@/components/Confirmar";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Nivel = "ninguno" | "ver" | "editar";
type Rol = {
  clave: string; nombre: string; descripcion: string | null;
  manda: boolean; sistema: boolean; orden: number | null;
};
type Permiso = { rol: string; seccion: string; nivel: Nivel };
type Persona = { id: string; nombre: string | null; usuario: string | null; activo: boolean; rol: string };
type Hist = {
  id: number; rol: string; rol_nombre: string; accion: "permisos" | "creado" | "duplicado" | "borrado";
  detalle: {
    cambios?: { seccion: string; antes: Nivel; despues: Nivel }[];
    de_nombre?: string; pantallas?: number;
    usuarios?: number; quienes?: string[]; a_nombre?: string | null;
  };
  hecho_nombre: string | null; hecho_en: string;
};
type Pestana = "pantallas" | "quienes" | "historial";
const cuando = (s: string) => new Date(s).toLocaleString("es-CO",
  { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const ROT_NIVEL: Record<Nivel, string> = { ninguno: "sin acceso", ver: "ver", editar: "editar" };
type Modulo = {
  id: string; nombre: string; acento: string;
  secciones: { nombre: string; ruta: string }[];
};

const NIVELES: { v: Nivel; t: string; d: string }[] = [
  { v: "ninguno", t: "Sin acceso", d: "No aparece en el menú" },
  { v: "ver", t: "Ver", d: "Entra y mira, sin guardar" },
  { v: "editar", t: "Editar", d: "Entra y modifica" },
];

/** "Portería" → "porteria". La clave no se teclea: se deriva del nombre. */
function aClave(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function Roles({ roles, permisos, catalogo, cuantos, gente, historial }: {
  roles: Rol[];
  permisos: Permiso[];
  catalogo: Modulo[];
  cuantos: Record<string, number>;
  gente: Persona[];
  /** null = falta correr 2026-09-admin-roles.sql. */
  historial: Hist[] | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  /* Reemplaza a window.confirm(): el cuadro gris del sistema sale con el
     dominio encima y sin los colores de la plataforma. */
  const [pedir, dialogo] = useConfirmar();
  const [cual, setCual] = useState(roles[0]?.clave ?? "");
  const [nuevo, setNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [descNueva, setDescNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  /** Lo marcado en pantalla. Arranca de lo guardado y se va tocando. */
  const [marcado, setMarcado] = useState<Record<string, Nivel>>(() => {
    const m: Record<string, Nivel> = {};
    for (const p of permisos) if (p.rol === (roles[0]?.clave ?? "")) m[p.seccion] = p.nivel;
    return m;
  });
  const [sucio, setSucio] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("pantallas");
  /* BORRAR y DUPLICAR se abren AQUÍ, debajo del título del rol, y no en
     una ventana: lo que se decide —a qué rol pasar a la gente, cómo se
     llama la copia— se decide mirando el rol. */
  const [panel, setPanel] = useState<null | "borrar" | "duplicar">(null);
  const [destino, setDestino] = useState("");
  const [nombreCopia, setNombreCopia] = useState("");

  const rol = roles.find((r) => r.clave === cual);

  async function cambiarRol(clave: string) {
    if (sucio && !(await pedir({
      titulo: "Hay cambios sin guardar en este rol",
      dice: "Si cambias de rol ahora, lo que marcaste se pierde.",
      confirmar: "Cambiar y perderlos",
      cancelar: "Seguir aquí",
      peligro: true,
    }))) return;
    const m: Record<string, Nivel> = {};
    for (const p of permisos) if (p.rol === clave) m[p.seccion] = p.nivel;
    setCual(clave);
    setMarcado(m);
    setSucio(false);
    setNuevo(false);
    setAviso(null);
    setPanel(null);
  }

  function poner(ruta: string, nivel: Nivel) {
    setMarcado((m) => ({ ...m, [ruta]: nivel }));
    setSucio(true);
  }

  /** Marcar todo un módulo de un golpe: son cinco clics menos. */
  function ponerModulo(m: Modulo, nivel: Nivel) {
    setMarcado((prev) => {
      const out = { ...prev };
      for (const s of m.secciones) out[s.ruta] = nivel;
      return out;
    });
    setSucio(true);
  }

  async function guardar() {
    if (!rol) return;
    setGuardando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;
    const filas = Object.entries(marcado)
      .filter(([, n]) => n !== "ninguno")
      .map(([seccion, nivel]) => ({ seccion, nivel }));

    const { data, error } = await cli.rpc("rol_permisos_guardar", {
      p_rol: rol.clave, p_permisos: filas,
    });
    setGuardando(false);
    if (error) { setAviso({ mal: true, texto: traducir(error.message) }); return; }
    setSucio(false);
    setAviso({
      mal: false,
      texto: data === 0
        ? `${rol.nombre} quedó sin ninguna pantalla habilitada.`
        : `${rol.nombre} quedó con ${data} pantalla${data === 1 ? "" : "s"} habilitada${data === 1 ? "" : "s"}.`,
    });
    router.refresh();
  }

  async function crear() {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    const clave = aClave(nombre);
    if (!clave) { setAviso({ mal: true, texto: "Ese nombre no deja armar una clave." }); return; }
    if (roles.some((r) => r.clave === clave)) {
      setAviso({ mal: true, texto: `Ya hay un rol con la clave "${clave}".` }); return;
    }
    setGuardando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;
    const { error } = await cli.rpc("rol_crear", {
      p_clave: clave, p_nombre: nombre, p_descripcion: descNueva.trim() || null, p_copiar_de: null,
    });
    setGuardando(false);
    if (error) { setAviso({ mal: true, texto: traducir(error.message) }); return; }
    setNombreNuevo(""); setDescNueva(""); setNuevo(false);
    setAviso({
      mal: false,
      texto: `Rol "${nombre}" creado. Nace SIN NINGUNA pantalla: márcale abajo lo que puede ver.`,
    });
    router.refresh();
  }

  const deEste = useMemo(() => gente.filter((p) => p.rol === cual), [gente, cual]);
  const otros = roles.filter((r) => r.clave !== cual);

  function abrir(que: "borrar" | "duplicar") {
    setAviso(null);
    if (panel === que) { setPanel(null); return }
    setPanel(que);
    if (que === "borrar") setDestino(otros.find((r) => r.clave === "operador")?.clave ?? otros.find((r) => !r.manda)?.clave ?? "");
    if (que === "duplicar") setNombreCopia(`Copia de ${rol?.nombre ?? ""}`);
  }

  /* BORRAR, PASANDO A SU GENTE A OTRO ROL. Todo lo hace la base en un
     solo paso: si algo falla, nadie queda a medio mover. */
  async function borrar() {
    if (!rol) return;
    const hay = deEste.length;
    const a = roles.find((r) => r.clave === destino);
    if (hay > 0 && !a) { setAviso({ mal: true, texto: "Escoge a qué rol pasar a sus usuarios." }); return }
    if (!(await pedir({
      titulo: `¿Borrar el rol «${rol.nombre}»?`,
      dice: hay > 0
        ? <>Sus <b>{hay}</b> {hay === 1 ? "usuario pasa" : "usuarios pasan"} a <b>{a!.nombre}</b>
            {a!.manda && <> — <b>ojo: ese rol administra la plataforma</b></>}. El rol y sus permisos
            se borran. Queda escrito en el historial.</>
        : <>No tiene usuarios. El rol y sus permisos se borran. Queda escrito en el historial.</>,
      confirmar: "Borrar el rol",
      peligro: true,
    }))) return;
    setGuardando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data, error } = await (supabase as any).rpc("rol_borrar", {
      p_clave: rol.clave, p_mover_a: hay > 0 ? destino : null,
    });
    setGuardando(false);
    if (error) { setAviso({ mal: true, texto: traducir(error.message) }); return; }
    setPanel(null);
    setAviso({ mal: false, texto: `Rol «${rol.nombre}» borrado.` +
      (Number(data) > 0 ? ` ${data} ${Number(data) === 1 ? "usuario pasó" : "usuarios pasaron"} a ${a?.nombre}.` : "") });
    const sig = roles.find((r) => r.clave !== rol.clave)?.clave ?? "";
    const m: Record<string, Nivel> = {};
    for (const x of permisos) if (x.rol === sig) m[x.seccion] = x.nivel;
    setCual(sig); setMarcado(m); setSucio(false);
    router.refresh();
  }

  /* DUPLICAR: un rol nuevo con los mismos permisos, para ajustar. */
  async function duplicar() {
    if (!rol) return;
    const nombre = nombreCopia.trim();
    const clave = aClave(nombre);
    if (!clave) { setAviso({ mal: true, texto: "Ese nombre no deja armar una clave." }); return }
    if (roles.some((r) => r.clave === clave || r.nombre.toLowerCase() === nombre.toLowerCase())) {
      setAviso({ mal: true, texto: `Ya hay un rol que se llama así.` }); return;
    }
    setGuardando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any).rpc("rol_crear", {
      p_clave: clave, p_nombre: nombre, p_descripcion: rol.descripcion, p_copiar_de: rol.clave,
    });
    setGuardando(false);
    if (error) { setAviso({ mal: true, texto: traducir(error.message) }); return; }
    setPanel(null);
    setAviso({ mal: false, texto: `«${nombre}» creado con los mismos permisos de ${rol.nombre}. Ya puedes ajustarlo.` });
    router.refresh();
  }

  const histDeEste = useMemo(() => (historial ?? []).filter((h) => h.rol === cual), [historial, cual]);
  const nRuta = (ruta: string) => {
    for (const m of catalogo) {
      const x = m.secciones.find((q) => q.ruta === ruta);
      if (x) return `${m.nombre} · ${x.nombre}`;
    }
    return ruta;
  };

  /** Cuántas pantallas tiene marcadas cada rol, para la lista. */
  const cuenta = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of permisos) if (p.nivel !== "ninguno") c[p.rol] = (c[p.rol] ?? 0) + 1;
    return c;
  }, [permisos]);

  const total = catalogo.reduce((a, m) => a + m.secciones.length, 0);
  const marcadas = Object.values(marcado).filter((n) => n !== "ninguno").length;

  return (
    <>
      {dialogo}
        <div className="rl-rejilla">
        {/* ---------- Los roles ---------- */}
        <section className="tarjeta rl-lista">
          <div className="cab">
            <div><h2>Los roles</h2></div>
            <button type="button" className="btn plano" onClick={() => setNuevo((v) => !v)}>
              {nuevo ? "Cancelar" : "+ Nuevo rol"}
            </button>
          </div>
  
          {nuevo && (
            <div className="rl-nuevo">
              <label>
                <span>Nombre</span>
                <input value={nombreNuevo} autoFocus placeholder="Portería"
                       onChange={(e) => setNombreNuevo(e.target.value)} />
                {!!nombreNuevo.trim() && <em>clave: {aClave(nombreNuevo) || "—"}</em>}
              </label>
              <label>
                <span>Para qué es (opcional)</span>
                <input value={descNueva} placeholder="Ve qué vehículos vienen en camino"
                       onChange={(e) => setDescNueva(e.target.value)} />
              </label>
              <button type="button" className="btn" disabled={!nombreNuevo.trim() || guardando}
                      onClick={crear}>Crear</button>
            </div>
          )}
  
          <ul className="rl-roles">
            {roles.map((r) => (
              <li key={r.clave}>
                <button type="button" className={r.clave === cual ? "aqui" : ""}
                        onClick={() => cambiarRol(r.clave)}>
                  <b>
                    {r.nombre}
                    {r.manda && <i className="rl-manda" title="Administra la plataforma">manda</i>}
                  </b>
                  <span>
                    {cuantos[r.clave] ?? 0} usuario{(cuantos[r.clave] ?? 0) === 1 ? "" : "s"}
                    {" · "}
                    {r.manda ? "todas las pantallas" : `${cuenta[r.clave] ?? 0} de ${total} pantallas`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
  
        {/* ---------- Las pantallas del rol escogido ---------- */}
        <section className="tarjeta rl-matriz">
          <div className="cab">
            <div>
              <h2>Qué ve {rol?.nombre ?? "—"}</h2>
              <p>
                {rol?.manda
                  ? "Este rol administra la plataforma: puede todo, en todas las pantallas, y es el único que entra aquí. No se le marcan permisos porque no tendría sentido quitarle uno."
                  : rol?.descripcion || "Marca pantalla por pantalla. Lo que quede en «sin acceso» no aparece ni en el menú."}
              </p>
            </div>
            {!rol?.manda && (
              <div className="rl-acciones">
                <span className="rl-cuenta">{marcadas} de {total}</span>
                <button type="button" className="btn" disabled={!sucio || guardando} onClick={guardar}>
                  {guardando ? "Guardando…" : sucio ? "Guardar cambios" : "Sin cambios"}
                </button>
              </div>
            )}
          </div>
  
          {/* LA BARRA DEL ROL: qué se mira de él, y qué se le puede hacer. */}
          {!!rol && (
            <div className="rl-herr">
              <div className="rl-pest" role="tablist" aria-label="Del rol">
                {([["pantallas", "Pantallas"], ["quienes", `Quiénes lo tienen · ${deEste.length}`],
                   ["historial", `Historial${historial ? " · " + histDeEste.length : ""}`]] as [Pestana, string][]).map(([k, t]) => (
                  <button key={k} type="button" role="tab" aria-selected={pestana === k}
                          className={pestana === k ? "aqui" : ""} onClick={() => setPestana(k)}>{t}</button>
                ))}
              </div>
              <div className="rl-herr-der">
                <button type="button" className={"btn sec" + (panel === "duplicar" ? " abierto" : "")}
                        onClick={() => abrir("duplicar")} disabled={guardando}>Duplicar</button>
                {rol.sistema || rol.manda ? (
                  <span className="rl-fijo" title="La aplicación usa este rol por su nombre: no se borra. Si no lo usas, quítale los permisos.">
                    De sistema · no se borra
                  </span>
                ) : (
                  <button type="button" className={"btn sec peligro" + (panel === "borrar" ? " abierto" : "")}
                          onClick={() => abrir("borrar")} disabled={guardando}>Borrar rol</button>
                )}
              </div>
            </div>
          )}

          {panel === "duplicar" && rol && (
            <div className="rl-caja">
              <p>Un rol nuevo con las mismas <b>{rol.manda ? "atribuciones" : `${marcadas} pantallas`}</b> de {rol.nombre}{rol.manda ? "" : ""}. Después lo ajustas.</p>
              <label><span>Nombre del rol nuevo</span>
                <input value={nombreCopia} onChange={(e) => setNombreCopia(e.target.value)} autoFocus /></label>
              <div className="rl-caja-pie">
                <button type="button" className="btn" disabled={!nombreCopia.trim() || guardando} onClick={duplicar}>
                  {guardando ? "Creando…" : "Crear la copia"}</button>
                <button type="button" className="btn plano" onClick={() => setPanel(null)}>Cancelar</button>
              </div>
            </div>
          )}

          {panel === "borrar" && rol && (
            <div className="rl-caja peligro">
              {deEste.length === 0 ? (
                <p>«{rol.nombre}» no tiene usuarios. Se borra con sus permisos.</p>
              ) : (
                <>
                  <p>«{rol.nombre}» tiene <b>{deEste.length}</b> {deEste.length === 1 ? "usuario" : "usuarios"}:{" "}
                    {deEste.slice(0, 6).map((x) => x.nombre || x.usuario).join(", ")}{deEste.length > 6 ? "…" : ""}.
                    Antes de borrarlo, ¿a qué rol {deEste.length === 1 ? "pasa" : "pasan"}?</p>
                  <label><span>Pasarlos a</span>
                    <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                      {otros.map((r) => <option key={r.clave} value={r.clave}>{r.nombre}{r.manda ? " (administra)" : ""}</option>)}
                    </select></label>
                </>
              )}
              <div className="rl-caja-pie">
                <button type="button" className="btn rojo" disabled={guardando || (deEste.length > 0 && !destino)} onClick={borrar}>
                  {guardando ? "Borrando…" : deEste.length > 0 ? `Pasar ${deEste.length} y borrar el rol` : "Borrar el rol"}</button>
                <button type="button" className="btn plano" onClick={() => setPanel(null)}>Cancelar</button>
              </div>
            </div>
          )}

          {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}

          {pestana === "pantallas" ? (
            <>
          {rol?.manda ? (
            <p className="rl-vacio">
              Para quitarle el mando, primero marca otro rol como administrador — la
              plataforma no deja quedarse sin ninguno.
            </p>
          ) : (
            <div className="rl-cuerpo">
              {catalogo.map((m) => {
                const niveles = m.secciones.map((s) => marcado[s.ruta] ?? "ninguno");
                const todas = (n: Nivel) => niveles.every((x) => x === n);
                return (
                  <div key={m.id} className="rl-modulo">
                    <header style={{ borderLeftColor: m.acento }}>
                      <b>{m.nombre}</b>
                      <div className="rl-todo">
                        {NIVELES.map((n) => (
                          <button key={n.v} type="button"
                                  className={todas(n.v) ? "aqui" : ""}
                                  onClick={() => ponerModulo(m, n.v)}>
                            {n.t}
                          </button>
                        ))}
                      </div>
                    </header>
                    <ul>
                      {m.secciones.map((s) => {
                        const actual = marcado[s.ruta] ?? "ninguno";
                        return (
                          <li key={s.ruta}>
                            <div className="rl-sec">
                              <b>{s.nombre}</b>
                              <em>{s.ruta}</em>
                            </div>
                            <div className="rl-niveles" role="radiogroup" aria-label={s.nombre}>
                              {NIVELES.map((n) => (
                                <button
                                  key={n.v} type="button" role="radio"
                                  aria-checked={actual === n.v}
                                  title={n.d}
                                  className={"rl-n rl-" + n.v + (actual === n.v ? " aqui" : "")}
                                  onClick={() => poner(s.ruta, n.v)}
                                >
                                  {n.t}
                                </button>
                              ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
  
            </>
          ) : pestana === "quienes" ? (
            deEste.length === 0 ? (
              <p className="rl-vacio">Nadie tiene este rol todavía. Se le asigna a alguien en <a href="/admin/usuarios">Usuarios</a>.</p>
            ) : (
              <ul className="rl-gente">
                {deEste.map((x) => (
                  <li key={x.id}>
                    <span className="rl-ini" aria-hidden>{(x.nombre || x.usuario || "?").slice(0, 1).toUpperCase()}</span>
                    <span className="rl-quien"><b>{x.nombre || x.usuario}</b><em>{x.usuario}</em></span>
                    {!x.activo && <span className="rl-inactivo">inactivo</span>}
                    <a className="rl-ir" href={`/admin/usuarios?q=${encodeURIComponent(x.usuario ?? x.nombre ?? "")}`}>Editar</a>
                  </li>
                ))}
              </ul>
            )
          ) : historial === null ? (
            <p className="rl-vacio">Falta correr <code>supabase/migraciones/2026-09-admin-roles.sql</code> en Supabase para guardar el historial.</p>
          ) : histDeEste.length === 0 ? (
            <p className="rl-vacio">Todavía no hay cambios guardados de este rol. Desde ahora queda escrito cada uno.</p>
          ) : (
            <ol className="rl-hist">
              {histDeEste.map((h) => (
                <li key={h.id}>
                  <p className="rl-hist-cab"><b>{h.hecho_nombre ?? "—"}</b> · {cuando(h.hecho_en)}</p>
                  {h.accion === "permisos" ? (
                    <ul>
                      {(h.detalle.cambios ?? []).map((c) => (
                        <li key={c.seccion}>
                          <span>{nRuta(c.seccion)}</span>
                          <em className={"rl-de rl-" + c.antes}>{ROT_NIVEL[c.antes]}</em> → <em className={"rl-de rl-" + c.despues}>{ROT_NIVEL[c.despues]}</em>
                        </li>
                      ))}
                    </ul>
                  ) : h.accion === "duplicado" ? (
                    <p>Creado como copia de <b>{h.detalle.de_nombre}</b>, con {h.detalle.pantallas} pantallas.</p>
                  ) : h.accion === "creado" ? (
                    <p>Rol creado.</p>
                  ) : (
                    <p>Rol borrado{h.detalle.usuarios ? <>; {h.detalle.usuarios} pasaron a <b>{h.detalle.a_nombre}</b></> : null}.</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* LOS ROLES QUE YA NO ESTÁN: su historial no se puede ver desde la
          lista, porque ya no están en ella. Aquí queda a la vista. */}
      {!!historial && historial.some((h) => h.accion === "borrado") && (
        <section className="tarjeta">
          <div className="cab"><div>
            <h2>Roles borrados</h2>
            <p>Quién los borró, cuándo y a dónde pasó su gente.</p>
          </div></div>
          <ol className="rl-hist">
            {historial.filter((h) => h.accion === "borrado").slice(0, 20).map((h) => (
              <li key={h.id}>
                <p className="rl-hist-cab"><b>{h.rol_nombre}</b> · {h.hecho_nombre ?? "—"} · {cuando(h.hecho_en)}</p>
                <p>{h.detalle.usuarios ? <>{h.detalle.usuarios} {h.detalle.usuarios === 1 ? "usuario pasó" : "usuarios pasaron"} a <b>{h.detalle.a_nombre}</b>: {(h.detalle.quienes ?? []).join(", ")}.</> : "No tenía usuarios."}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

/** Los errores de Postgres no le explican nada a quien está mirando. */
function traducir(m: string): string {
  if (/rol_crear|rol_borrar|roles_historial/i.test(m) && /does not exist|schema cache|could not find/i.test(m)) {
    return "Falta correr supabase/migraciones/2026-09-admin-roles.sql en el SQL Editor.";
  }
  if (/does not exist|schema cache/i.test(m)) {
    return "Falta correr supabase/02-roles.sql en el SQL Editor.";
  }
  if (/duplicate key/i.test(m)) return "Ya existe un rol con esa clave.";
  if (/row-level security|permission/i.test(m)) {
    return "Tu rol no administra la plataforma, así que no puede cambiar esto.";
  }
  // Los mensajes de los candados ya vienen escritos para leerse.
  return m;
}
