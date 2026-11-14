"use client";

/**
 * SEGURIDAD · CERTIFICACIONES · MAESTRO — lo que no cambia todos los días.
 *   EMPRESAS      cada contratista con su Interventor ABI y su Coordinador de la contratista («a quién exigirle»),
 *                 y sus GRUPOS: parte de la gente de una empresa (ej. Easy) que responde a otros responsables.
 *   VALIDADORES   quién valida las licencias (la lista del registro).
 *   RESPONSABLES  interventores ABI y coordinadores: nombre y cédula.
 *   REGLAS        días de vigencia, desde cuándo se alerta, qué es urgente y qué departamentos entran.
 */
import { useMemo, useState, useTransition } from "react";
import { claveTexto, trabaja, type PersonaCert } from "@/modulos/seguridad/certificaciones";
import type { Empresa, Grupo, Reglas, Responsable, Validador } from "@/modulos/seguridad/datos";
import { useConfirmar } from "@/components/Confirmar";
import { Ventana } from "../Ventana";
import {
  asignarGrupo, borrarGrupo, borrarResponsable, crearEmpresa, guardarEmpresa, guardarGrupo, guardarReglas,
  guardarResponsable, guardarValidador,
} from "../actions";

const nf = new Intl.NumberFormat("es-CO");
const TIPO = { interventor: "Interventor ABI", coordinador: "Coordinador de la contratista" } as const;
const DEPTOS = ["LOGISTICA", "ENVASADO", "INGENIERIA", "ELABORACION", "PEOPLE", "CALIDAD", "AMBIENTAL", "SAFETY"];
const bonitoD = (d: string) => d.charAt(0) + d.slice(1).toLowerCase();
type Tab = "empresas" | "validadores" | "responsables" | "reglas";
type R = { error?: string; ok?: string };

type Props = {
  personas: PersonaCert[]; reglas: Reglas; empresas: Empresa[]; grupos: Grupo[];
  responsables: Responsable[]; validadores: Validador[]; puedeEditar: boolean;
};

export function MaestroCert(P: Props) {
  const [tab, setTab] = useState<Tab>("empresas");
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const [pend, start] = useTransition();
  const [pedir, dialogo] = useConfirmar();
  const hacer = (f: () => Promise<R>) => start(async () => {
    const r = await f();
    setAviso({ t: r.error ?? r.ok ?? "Listo.", mal: !!r.error });
    window.setTimeout(() => setAviso(null), 4500);
  });
  const ctx = { ...P, hacer, pend, pedir };

  return (
    <div className="sg">
      <header className="sg-cab">
        <div>
          <p className="sg-ojo">SEGURIDAD · CERTIFICACIONES</p>
          <h1>Maestro</h1>
          <p className="sg-sub">Empresas y a quién exigirle · validadores · responsables · reglas de vigencia y alerta</p>
        </div>
      </header>
      {!P.puedeEditar && <p className="sg-aviso">Estás en modo consulta: para cambiar el maestro pide el permiso «Maestro» en editar (Administración › Roles).</p>}
      {aviso && <p className={"sg-aviso" + (aviso.mal ? " mal" : "")} role="status">{aviso.t}</p>}

      <nav className="sg-tabs" role="tablist" aria-label="Maestro">
        {([["empresas", "Empresas", P.empresas.length], ["validadores", "Validadores", P.validadores.length],
           ["responsables", "Responsables", P.responsables.length], ["reglas", "Reglas", null]] as const).map(([k, t, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {t}{n != null && <i>{n}</i>}
          </button>
        ))}
      </nav>

      {tab === "empresas" && <Empresas {...ctx} />}
      {tab === "validadores" && <Validadores {...ctx} />}
      {tab === "responsables" && <Responsables {...ctx} />}
      {tab === "reglas" && <ReglasTab {...ctx} />}
      {dialogo}
    </div>
  );
}

type Ctx = Props & { hacer: (f: () => Promise<R>) => void; pend: boolean; pedir: ReturnType<typeof useConfirmar>[0] };

/* ================================ EMPRESAS ================================ */
function Empresas({ personas, empresas, grupos, responsables, puedeEditar, hacer, pend, pedir, reglas }: Ctx) {
  const [sel, setSel] = useState<string | null>(empresas[0]?.id ?? null);
  const [nueva, setNueva] = useState("");
  const [ver, setVer] = useState<"activas" | "todas">("activas");
  const gente = useMemo(() => {
    const m = new Map<string, { total: number; activos: number }>();
    for (const p of personas) {
      if (!p.empresa_id) continue;
      const x = m.get(p.empresa_id) ?? { total: 0, activos: 0 };
      x.total++; if (trabaja(p.estado)) x.activos++;
      m.set(p.empresa_id, x);
    }
    return m;
  }, [personas]);
  const lista = empresas.filter((e) => ver === "todas" || e.activa)
    .sort((a, b) => (gente.get(b.id)?.activos ?? 0) - (gente.get(a.id)?.activos ?? 0) || a.nombre.localeCompare(b.nombre, "es"));
  const interv = responsables.filter((r) => r.tipo === "interventor" && r.activo);
  const coord = responsables.filter((r) => r.tipo === "coordinador" && r.activo);
  const sinAsignar = lista.filter((e) => e.activa && (!e.interventor_id || !e.coordinador_id) && (gente.get(e.id)?.activos ?? 0) > 0).length;
  const emp = empresas.find((e) => e.id === sel) ?? null;

  return (
    <div className={"sg-mae" + (emp ? "" : " solo")}>
      <section className="sg-card">
        <header>
          <h2>Empresas · a quién exigirle</h2>
          <div className="sg-seg" role="radiogroup" aria-label="Qué empresas">
            {(["activas", "todas"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={ver === k} className={ver === k ? "on" : ""} onClick={() => setVer(k)}>{k === "activas" ? "Activas" : "Todas"}</button>)}
          </div>
        </header>
        {sinAsignar > 0 && <p className="sg-aviso" style={{ margin: "0 16px 10px" }}>{sinAsignar} {sinAsignar === 1 ? "empresa con gente activa no tiene" : "empresas con gente activa no tienen"} Interventor ABI o Coordinador: sus alertas salen «sin asignar».</p>}
        <div className="sg-tabla-rueda">
          <table className="sg-tabla">
            <thead><tr><th>Empresa</th><th className="n">Activos</th><th>Interventor ABI</th><th>Coordinador de la contratista</th><th className="n">Grupos</th><th>Activa</th></tr></thead>
            <tbody>
              {lista.map((e) => {
                const g = gente.get(e.id);
                return (
                  <tr key={e.id} className={sel === e.id ? "sel" : ""} onClick={() => setSel(e.id)}>
                    <td className="sg-pp"><b>{e.nombre}</b><small>{bonitoD(e.departamento)}{e.alias?.length ? ` · también «${e.alias.join("», «")}»` : ""}</small></td>
                    <td className="n"><b>{nf.format(g?.activos ?? 0)}</b><small className="sg-sm"> / {nf.format(g?.total ?? 0)}</small></td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <select className={e.interventor_id ? "set" : ""} value={e.interventor_id ?? ""} disabled={!puedeEditar || pend} aria-label={`Interventor ABI de ${e.nombre}`}
                        onChange={(ev) => {
                          const iv = ev.target.value || null;
                          const co = coord.find((c) => c.id === e.coordinador_id);
                          /* Si el coordinador que tenía responde a otro interventor, se suelta: la cadena tiene que cuadrar. */
                          hacer(() => guardarEmpresa({ id: e.id, interventor_id: iv, ...(co && iv && co.interventor_id !== iv ? { coordinador_id: null } : {}) }));
                        }}>
                        <option value="">Sin asignar</option>
                        {interv.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                    </td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <select className={e.coordinador_id ? "set" : ""} value={e.coordinador_id ?? ""} disabled={!puedeEditar || pend} aria-label={`Coordinador de ${e.nombre}`}
                        onChange={(ev) => {
                          const co = coord.find((c) => c.id === ev.target.value);
                          /* Escoger el coordinador pone solo a su interventor. */
                          hacer(() => guardarEmpresa({ id: e.id, coordinador_id: co?.id ?? null, ...(co?.interventor_id ? { interventor_id: co.interventor_id } : {}) }));
                        }}>
                        <option value="">Sin asignar</option>
                        {coord.filter((r) => !e.interventor_id || r.interventor_id === e.interventor_id || r.id === e.coordinador_id).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                    </td>
                    <td className="n">{grupos.filter((x) => x.empresa_id === e.id).length || "—"}</td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <button type="button" className={"sg-sw" + (e.activa ? " on" : "")} aria-pressed={e.activa} aria-label={`${e.nombre} activa`}
                        disabled={!puedeEditar || pend} onClick={() => hacer(() => guardarEmpresa({ id: e.id, activa: !e.activa }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(interv.length === 0 || coord.length === 0) && (
          <p className="sg-sm" style={{ padding: "10px 16px 0", margin: 0 }}>Para escoger aquí, primero agrega los interventores ABI y coordinadores en la pestaña <b>Responsables</b>.</p>
        )}
        {puedeEditar && (
          <div className="sg-nuevo">
            <input placeholder="Nombre de la empresa nueva" value={nueva} onChange={(e) => setNueva(e.target.value)} aria-label="Empresa nueva" />
            <button type="button" className="sg-bt osc" disabled={pend || !nueva.trim()}
              onClick={() => { hacer(() => crearEmpresa(nueva, reglas.departamentos[0] ?? "LOGISTICA")); setNueva("") }}>Crear empresa</button>
          </div>
        )}
      </section>

      {emp && <GruposEmpresa key={emp.id} emp={emp} personas={personas.filter((p) => p.empresa_id === emp.id)} grupos={grupos.filter((g) => g.empresa_id === emp.id)}
        responsables={responsables} puedeEditar={puedeEditar} hacer={hacer} pend={pend} pedir={pedir} />}
    </div>
  );
}

function GruposEmpresa({ emp, personas, grupos, responsables, puedeEditar, hacer, pend, pedir }: {
  emp: Empresa; personas: PersonaCert[]; grupos: Grupo[]; responsables: Responsable[]; puedeEditar: boolean;
  hacer: Ctx["hacer"]; pend: boolean; pedir: Ctx["pedir"];
}) {
  const [edita, setEdita] = useState<Partial<Grupo> | null>(null);
  const [gente, setGente] = useState<Grupo | null>(null);
  const nom = (id: string | null) => responsables.find((r) => r.id === id)?.nombre ?? "Sin asignar";
  const activos = personas.filter((p) => trabaja(p.estado)).length;

  return (
    <aside className="sg-card sg-grp">
      <header>
        <p>EMPRESA</p>
        <h3>{emp.nombre}</h3>
        <small>{nf.format(activos)} activos · {nom(emp.interventor_id)} · {nom(emp.coordinador_id)}</small>
      </header>
      <div className="sg-gi">
        <div className="sg-gi-t"><b>Toda la empresa</b><span>{nf.format(personas.filter((p) => !p.grupo_id).length)} personas</span></div>
        <div className="sg-gi-r"><span><em>INTERVENTOR ABI</em>{nom(emp.interventor_id)}</span><span><em>COORDINADOR</em>{nom(emp.coordinador_id)}</span></div>
      </div>
      {grupos.map((g) => (
        <div key={g.id} className="sg-gi">
          <div className="sg-gi-t"><b>Grupo {g.nombre}</b><span>{nf.format(personas.filter((p) => p.grupo_id === g.id).length)} personas</span></div>
          <div className="sg-gi-r"><span><em>INTERVENTOR ABI</em>{nom(g.interventor_id)}</span><span><em>COORDINADOR</em>{nom(g.coordinador_id)}</span></div>
          {puedeEditar && (
            <div className="sg-gi-acc">
              <button type="button" onClick={() => setEdita(g)}>Editar</button>
              <button type="button" onClick={() => setGente(g)}>Personas</button>
              <button type="button" disabled={pend} onClick={async () => {
                if (await pedir({ titulo: `¿Quitar el grupo ${g.nombre}?`, dice: "Su gente vuelve a responder al Interventor ABI y al Coordinador de la empresa. Las licencias no se tocan.", confirmar: "Quitar grupo", peligro: true }))
                  hacer(() => borrarGrupo(g.id));
              }}>Quitar</button>
            </div>
          )}
        </div>
      ))}
      {grupos.length === 0 && <p className="sg-sm" style={{ padding: "12px 16px", margin: 0 }}>Sin grupos: toda la gente responde a los mismos. Crea un grupo cuando una parte de la empresa tenga otros responsables (ej. un turno o un frente de Easy).</p>}
      {puedeEditar && <div className="sg-nuevo"><button type="button" className="sg-bt osc" onClick={() => setEdita({ empresa_id: emp.id, nombre: "", interventor_id: emp.interventor_id, coordinador_id: emp.coordinador_id })}>+ Nuevo grupo</button></div>}

      {edita && (
        <EditarGrupo g={edita} responsables={responsables} pend={pend} cerrar={() => setEdita(null)}
          guardar={(g) => { hacer(() => guardarGrupo({ id: g.id, empresa_id: emp.id, nombre: g.nombre ?? "", interventor_id: g.interventor_id ?? null, coordinador_id: g.coordinador_id ?? null })); setEdita(null) }} />
      )}
      {gente && (
        <GenteGrupo g={gente} personas={personas} pend={pend} cerrar={() => setGente(null)}
          guardar={(entran, salen) => {
            hacer(async () => {
              if (entran.length) { const r = await asignarGrupo(entran, gente.id); if (r.error) return r }
              if (salen.length) { const r = await asignarGrupo(salen, null); if (r.error) return r }
              return { ok: `Grupo ${gente.nombre}: ${entran.length} entran, ${salen.length} salen.` };
            });
            setGente(null);
          }} />
      )}
    </aside>
  );
}

function EditarGrupo({ g, responsables, pend, cerrar, guardar }: { g: Partial<Grupo>; responsables: Responsable[]; pend: boolean; cerrar: () => void; guardar: (g: Partial<Grupo>) => void }) {
  const [f, setF] = useState(g);
  return (
    <Ventana ojo={g.id ? "EDITAR GRUPO" : "GRUPO NUEVO"} titulo={g.id ? `Grupo ${g.nombre}` : "Gente con otros responsables"} chica cerrar={cerrar}
      pie={<><button type="button" className="sg-bt" onClick={cerrar}>Cancelar</button>
        <button type="button" className="sg-bt osc" disabled={pend || !f.nombre?.trim()} onClick={() => guardar(f)}>Guardar grupo</button></>}>
      <div className="sg-mo-b">
        <div className="sg-campo full"><label htmlFor="sg-gn">NOMBRE DEL GRUPO</label>
          <input id="sg-gn" value={f.nombre ?? ""} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Turno noche, Frente patio…" autoFocus /></div>
        <div className="sg-campo"><label htmlFor="sg-gi">INTERVENTOR ABI</label>
          <select id="sg-gi" value={f.interventor_id ?? ""} onChange={(e) => {
            const iv = e.target.value || null, co = responsables.find((r) => r.id === f.coordinador_id);
            setF({ ...f, interventor_id: iv, coordinador_id: co && iv && co.interventor_id !== iv ? null : f.coordinador_id });
          }}>
            <option value="">Sin asignar</option>
            {responsables.filter((r) => r.tipo === "interventor" && r.activo).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select></div>
        <div className="sg-campo"><label htmlFor="sg-gc">COORDINADOR DE LA CONTRATISTA</label>
          <select id="sg-gc" value={f.coordinador_id ?? ""} onChange={(e) => {
            const co = responsables.find((r) => r.id === e.target.value);
            setF({ ...f, coordinador_id: co?.id ?? null, interventor_id: co?.interventor_id ?? f.interventor_id });
          }}>
            <option value="">Sin asignar</option>
            {responsables.filter((r) => r.tipo === "coordinador" && r.activo && (!f.interventor_id || r.interventor_id === f.interventor_id || r.id === f.coordinador_id)).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select></div>
      </div>
    </Ventana>
  );
}

function GenteGrupo({ g, personas, pend, cerrar, guardar }: { g: Grupo; personas: PersonaCert[]; pend: boolean; cerrar: () => void; guardar: (entran: string[], salen: string[]) => void }) {
  const antes = useMemo(() => new Set(personas.filter((p) => p.grupo_id === g.id).map((p) => p.cedula)), [personas, g.id]);
  const [marca, setMarca] = useState<Set<string>>(() => new Set(antes));
  const [busca, setBusca] = useState("");
  const lista = personas.filter((p) => !busca || claveTexto(`${p.nombre} ${p.cedula}`).includes(claveTexto(busca)))
    .sort((a, b) => Number(marca.has(b.cedula)) - Number(marca.has(a.cedula)) || a.nombre.localeCompare(b.nombre, "es"));
  const entran = [...marca].filter((c) => !antes.has(c)), salen = [...antes].filter((c) => !marca.has(c));
  return (
    <Ventana ojo={`GRUPO ${g.nombre.toUpperCase()}`} titulo="¿Quiénes responden a este grupo?" cerrar={cerrar}
      pie={<><span className="sg-sm" style={{ marginRight: "auto", alignSelf: "center" }}>{marca.size} en el grupo · {entran.length} entran · {salen.length} salen</span>
        <button type="button" className="sg-bt" onClick={cerrar}>Cancelar</button>
        <button type="button" className="sg-bt osc" disabled={pend || (!entran.length && !salen.length)} onClick={() => guardar(entran, salen)}>Guardar</button></>}>
      <div className="sg-mo-b">
        <div className="sg-campo full"><input type="search" placeholder="Nombre o cédula" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" /></div>
        <div className="sg-lista-sel full">
          {lista.map((p) => (
            <label key={p.cedula}>
              <input type="checkbox" checked={marca.has(p.cedula)} onChange={() => setMarca((m) => { const n = new Set(m); if (n.has(p.cedula)) n.delete(p.cedula); else n.add(p.cedula); return n })} />
              {p.nombre}<small>{p.grupo && p.grupo_id !== g.id ? `en ${p.grupo} · ` : ""}{p.estado.toLowerCase()} · CC {p.cedula}</small>
            </label>
          ))}
        </div>
      </div>
    </Ventana>
  );
}

/* ================================ VALIDADORES ================================ */
function Validadores({ personas, validadores, puedeEditar, hacer, pend }: Ctx) {
  const [nuevo, setNuevo] = useState("");
  const cuenta = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of personas) if (p.validador) m.set(claveTexto(p.validador), (m.get(claveTexto(p.validador)) ?? 0) + 1);
    return m;
  }, [personas]);
  return (
    <section className="sg-card">
      <h2>Quién valida las licencias</h2>
      <div className="sg-tabla-rueda">
        <table className="sg-tabla">
          <thead><tr><th>Validador</th><th className="n">Licencias vigentes que validó</th><th>Sale en el registro</th></tr></thead>
          <tbody>
            {[...validadores].sort((a, b) => (cuenta.get(claveTexto(b.nombre)) ?? 0) - (cuenta.get(claveTexto(a.nombre)) ?? 0)).map((v) => (
              <tr key={v.id} style={{ cursor: "default" }}>
                <td><b>{v.nombre}</b></td>
                <td className="n">{nf.format(cuenta.get(claveTexto(v.nombre)) ?? 0)}</td>
                <td><button type="button" className={"sg-sw" + (v.activo ? " on" : "")} aria-pressed={v.activo} aria-label={`${v.nombre} activo`}
                  disabled={!puedeEditar || pend} onClick={() => hacer(() => guardarValidador({ id: v.id, nombre: v.nombre, activo: !v.activo }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {validadores.length === 0 && <p className="sg-vacio">Se llenan solos al importar el Excel (columna «QUIÉN VALIDÓ»), o agrégalos aquí.</p>}
      {puedeEditar && (
        <div className="sg-nuevo">
          <input placeholder="Nombre del validador" value={nuevo} onChange={(e) => setNuevo(e.target.value)} aria-label="Validador nuevo" />
          <button type="button" className="sg-bt osc" disabled={pend || !nuevo.trim()} onClick={() => { hacer(() => guardarValidador({ nombre: nuevo })); setNuevo("") }}>Agregar validador</button>
        </div>
      )}
    </section>
  );
}

/* ================================ RESPONSABLES ================================ */
/* LA CADENA DEL AVISO: la app le avisa al Interventor ABI y el interventor a su Coordinador de la contratista.
   Por eso la lista va por interventor y, debajo de cada uno, los coordinadores que le responden. */
function Responsables({ empresas, grupos, responsables, puedeEditar, hacer, pend, pedir }: Ctx) {
  const vacio = { nombre: "", tipo: "interventor" as Responsable["tipo"], cedula: "", interventor_id: "" };
  const [n, setN] = useState(vacio);
  const [edita, setEdita] = useState<Responsable | null>(null);
  const aCargo = (r: Responsable) => {
    const k = r.tipo === "interventor" ? "interventor_id" : "coordinador_id";
    return empresas.filter((e) => e[k] === r.id).map((e) => e.nombre)
      .concat(grupos.filter((g) => g[k] === r.id).map((g) => `${empresas.find((e) => e.id === g.empresa_id)?.nombre ?? ""} · ${g.nombre}`));
  };
  const porNombre = (a: Responsable, b: Responsable) => a.nombre.localeCompare(b.nombre, "es");
  const interventores = responsables.filter((r) => r.tipo === "interventor").sort(porNombre);
  const ids = new Set(interventores.map((r) => r.id));
  const sueltos = responsables.filter((r) => r.tipo === "coordinador" && !ids.has(r.interventor_id ?? "")).sort(porNombre);
  const fila = (r: Responsable, hijo: boolean) => {
    const c = aCargo(r);
    return (
      <tr key={r.id} className={hijo ? "" : "iv"} onClick={() => puedeEditar && setEdita(r)} style={puedeEditar ? undefined : { cursor: "default" }}>
        <td className={hijo ? "hijo" : ""}>{hijo && <span aria-hidden className="sg-flecha">↳</span>}<b>{r.nombre}</b></td>
        <td className="n" style={{ textAlign: "left" }}>{r.cedula ?? "—"}</td>
        <td>{TIPO[r.tipo]}</td>
        <td className="sg-sm">{c.length ? c.join(" · ") : "—"}</td>
        <td onClick={(ev) => ev.stopPropagation()}>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <button type="button" className={"sg-sw" + (r.activo ? " on" : "")} aria-pressed={r.activo} aria-label={`${r.nombre} activo`}
              disabled={!puedeEditar || pend} onClick={() => hacer(() => guardarResponsable({ ...r, telefono: undefined, correo: undefined, activo: !r.activo }))} />
            {!hijo && puedeEditar && (
              <button type="button" className="sg-bt" style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }}
                onClick={() => setN({ ...vacio, tipo: "coordinador", interventor_id: r.id })}>+ Coordinador</button>
            )}
          </span>
        </td>
      </tr>
    );
  };
  return (
    <section className="sg-card">
      <h2>Interventores ABI y sus coordinadores</h2>
      <p className="sg-cadena">La app le avisa al <b>Interventor ABI</b> <span aria-hidden>→</span> el interventor le avisa a su <b>Coordinador de la contratista</b>.</p>
      <div className="sg-tabla-rueda">
        <table className="sg-tabla">
          <thead><tr><th>Nombre</th><th>Cédula</th><th>Rol</th><th>A cargo de</th><th>Activo</th></tr></thead>
          <tbody>
            {interventores.flatMap((iv) => [fila(iv, false),
              ...responsables.filter((r) => r.tipo === "coordinador" && r.interventor_id === iv.id).sort(porNombre).map((c) => fila(c, true))])}
            {sueltos.length > 0 && <tr className="iv"><td colSpan={5}><b>Coordinadores sin interventor</b> <span className="sg-sm">· tócalos para decir a quién responden</span></td></tr>}
            {sueltos.map((c) => fila(c, true))}
          </tbody>
        </table>
      </div>
      {responsables.length === 0 && <p className="sg-vacio">Primero agrega a los interventores ABI; luego, a cada uno, sus coordinadores. Después se asignan a cada empresa.</p>}
      {puedeEditar && (
        <div className="sg-nuevo">
          <select value={n.tipo} onChange={(e) => setN({ ...n, tipo: e.target.value as Responsable["tipo"] })} aria-label="Rol">
            <option value="interventor">{TIPO.interventor}</option><option value="coordinador">{TIPO.coordinador}</option>
          </select>
          <input placeholder={n.tipo === "interventor" ? "Nombre del interventor ABI" : "Nombre del coordinador"} value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} aria-label="Nombre" />
          <input placeholder="Cédula" inputMode="numeric" value={n.cedula} onChange={(e) => setN({ ...n, cedula: e.target.value })} aria-label="Cédula" />
          {n.tipo === "coordinador" && (
            <select value={n.interventor_id} onChange={(e) => setN({ ...n, interventor_id: e.target.value })} aria-label="Interventor ABI al que responde">
              <option value="">Responde a…</option>
              {interventores.filter((r) => r.activo).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          )}
          <button type="button" className="sg-bt osc" disabled={pend || !n.nombre.trim() || (n.tipo === "coordinador" && !n.interventor_id)}
            onClick={() => { hacer(() => guardarResponsable({ ...n, interventor_id: n.interventor_id || null })); setN(vacio) }}>Agregar</button>
        </div>
      )}
      {edita && (
        <EditarResponsable r={edita} interventores={interventores} pend={pend} cerrar={() => setEdita(null)}
          guardar={(r) => { hacer(() => guardarResponsable({ ...r, telefono: undefined, correo: undefined })); setEdita(null) }}
          quitar={async () => {
            const hijos = responsables.filter((r) => r.interventor_id === edita.id).length;
            if (await pedir({ titulo: `¿Quitar a ${edita.nombre}?`, dice: `Las empresas y grupos que tenía a cargo quedan «sin asignar» hasta que les pongas otro.${hijos ? ` Sus ${hijos} coordinadores quedan sin interventor.` : ""}`, confirmar: "Quitar", peligro: true })) {
              hacer(() => borrarResponsable(edita.id)); setEdita(null);
            }
          }} />
      )}
    </section>
  );
}

function EditarResponsable({ r, interventores, pend, cerrar, guardar, quitar }: { r: Responsable; interventores: Responsable[]; pend: boolean; cerrar: () => void; guardar: (r: Responsable) => void; quitar: () => void }) {
  const [f, setF] = useState(r);
  return (
    <Ventana ojo={TIPO[f.tipo].toUpperCase()} titulo={r.nombre} chica cerrar={cerrar}
      pie={<><button type="button" className="sg-bt" style={{ marginRight: "auto", color: "#C8102E" }} onClick={quitar}>Quitar</button>
        <button type="button" className="sg-bt" onClick={cerrar}>Cancelar</button>
        <button type="button" className="sg-bt osc" disabled={pend || !f.nombre.trim() || (f.tipo === "coordinador" && !f.interventor_id)} onClick={() => guardar(f)}>Guardar</button></>}>
      <div className="sg-mo-b">
        <div className="sg-campo"><label htmlFor="sg-rn">NOMBRE</label><input id="sg-rn" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div className="sg-campo"><label htmlFor="sg-rk">CÉDULA</label><input id="sg-rk" inputMode="numeric" value={f.cedula ?? ""} onChange={(e) => setF({ ...f, cedula: e.target.value })} /></div>
        <div className="sg-campo"><label htmlFor="sg-rt">ROL</label>
          <select id="sg-rt" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Responsable["tipo"] })}>
            <option value="interventor">{TIPO.interventor}</option><option value="coordinador">{TIPO.coordinador}</option>
          </select></div>
        {f.tipo === "coordinador" ? (
          <div className="sg-campo"><label htmlFor="sg-ri">RESPONDE AL INTERVENTOR ABI</label>
            <select id="sg-ri" value={f.interventor_id ?? ""} onChange={(e) => setF({ ...f, interventor_id: e.target.value || null })}>
              <option value="">Escoger…</option>
              {interventores.filter((x) => x.activo || x.id === f.interventor_id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select></div>
        ) : <div />}
      </div>
    </Ventana>
  );
}

/* ================================ REGLAS ================================ */
function ReglasTab({ reglas, puedeEditar, hacer, pend }: Ctx) {
  const [f, setF] = useState({ vigencia: reglas.vigencia, aviso: reglas.diasAviso, criticos: reglas.diasCriticos, departamentos: reglas.departamentos });
  const cambio = f.vigencia !== reglas.vigencia || f.aviso !== reglas.diasAviso || f.criticos !== reglas.diasCriticos || f.departamentos.join() !== reglas.departamentos.join();
  const faltan = DEPTOS.filter((d) => !f.departamentos.includes(d));
  const num = (k: "vigencia" | "aviso" | "criticos", v: string) => setF({ ...f, [k]: Math.max(0, Number(v.replace(/\D/g, "")) || 0) });
  return (
    <section className="sg-card">
      <h2>Reglas de la licencia</h2>
      <div className="sg-reglas">
        <div className="sg-campo"><label htmlFor="sg-vg">VIGENCIA (DÍAS)</label><input id="sg-vg" inputMode="numeric" value={f.vigencia} disabled={!puedeEditar} onChange={(e) => num("vigencia", e.target.value)} />
          <small className="sg-sm">Si el Excel o el registro no traen vencimiento: expedición + estos días.</small></div>
        <div className="sg-campo"><label htmlFor="sg-av">ALERTA DESDE (DÍAS ANTES)</label><input id="sg-av" inputMode="numeric" value={f.aviso} disabled={!puedeEditar} onChange={(e) => num("aviso", e.target.value)} />
          <small className="sg-sm">La columna «Vencen este mes» de Alertas.</small></div>
        <div className="sg-campo"><label htmlFor="sg-cr">URGENTE (DÍAS O MENOS)</label><input id="sg-cr" inputMode="numeric" value={f.criticos} disabled={!puedeEditar} onChange={(e) => num("criticos", e.target.value)} />
          <small className="sg-sm">La columna «Vencen en {f.criticos} días».</small></div>
        <div className="sg-campo" style={{ gridColumn: "1 / -1" }}>
          <label>DEPARTAMENTOS QUE ENTRAN</label>
          <div className="sg-chips">
            {f.departamentos.map((d) => (
              <span key={d}>{bonitoD(d)}{puedeEditar && f.departamentos.length > 1 && <button type="button" aria-label={`Quitar ${d}`} onClick={() => setF({ ...f, departamentos: f.departamentos.filter((x) => x !== d) })}>×</button>}</span>
            ))}
            {puedeEditar && faltan.length > 0 && (
              <select value="" onChange={(e) => e.target.value && setF({ ...f, departamentos: [...f.departamentos, e.target.value] })} aria-label="Agregar departamento" style={{ minHeight: 32 }}>
                <option value="">+ Agregar departamento</option>
                {faltan.map((d) => <option key={d} value={d}>{bonitoD(d)}</option>)}
              </select>
            )}
          </div>
          <small className="sg-sm">Al agregar uno, vuelve a cargar el Excel en «Importar Excel» para que entre su gente.</small>
        </div>
      </div>
      {puedeEditar && (
        <div className="sg-nuevo" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="sg-bt" disabled={!cambio} onClick={() => setF({ vigencia: reglas.vigencia, aviso: reglas.diasAviso, criticos: reglas.diasCriticos, departamentos: reglas.departamentos })}>Deshacer</button>
          <button type="button" className="sg-bt osc" disabled={pend || !cambio} onClick={() => hacer(() => guardarReglas(f))}>Guardar reglas</button>
        </div>
      )}
    </section>
  );
}
