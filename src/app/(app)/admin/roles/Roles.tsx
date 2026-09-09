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

export function Roles({ roles, permisos, catalogo, cuantos }: {
  roles: Rol[];
  permisos: Permiso[];
  catalogo: Modulo[];
  cuantos: Record<string, number>;
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
    const { error } = await cli.from("roles").insert({
      clave, nombre, descripcion: descNueva.trim() || null,
      orden: (roles.reduce((a, r) => Math.max(a, r.orden ?? 0), 0) || 0) + 1,
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

  async function borrar() {
    if (!rol) return;
    if (!(await pedir({
      titulo: `¿Borrar el rol «${rol.nombre}»?`,
      dice: <>Esto <b>no se puede deshacer</b>. Quien tenga este rol se queda sin
            ninguno hasta que le asignes otro.</>,
      confirmar: "Borrar el rol",
      peligro: true,
    }))) return;
    setGuardando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;
    const { error } = await cli.from("roles").delete().eq("clave", rol.clave);
    setGuardando(false);
    if (error) { setAviso({ mal: true, texto: traducir(error.message) }); return; }
    setCual(roles[0]?.clave ?? "");
    router.refresh();
  }

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
  
          {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
  
          {!!rol && !rol.sistema && (
            <div className="rl-pie">
              <button type="button" className="btn plano peligro" onClick={borrar} disabled={guardando}>
                Borrar el rol «{rol.nombre}»
              </button>
              <span>
                Solo si no tiene usuarios. Los roles de sistema no se pueden borrar.
              </span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Los errores de Postgres no le explican nada a quien está mirando. */
function traducir(m: string): string {
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
