"use client";

/**
 * SEGURIDAD · CERTIFICACIONES · PERSONAS — la base de las licencias VACA, organizada para trabajar desde aquí.
 *
 *   · La tabla: persona, empresa, estado, nivel, la matriz de los 8 permisos, expedición, vencimiento (con su barra)
 *     y a quién se le exige (Interventor ABI · Coordinador de la contratista).
 *   · La ficha (tocar una fila): días que le quedan, permisos, responsables e HISTORIAL (cada validación y cada cambio).
 *   · REGISTRAR VALIDACIÓN: se escribe la cédula; si ya está, es una RENOVACIÓN (la anterior queda en el historial).
 *     El vencimiento y la fecha de la alerta se calculan solos con las Reglas del Maestro.
 *   · CAMBIAR ESTADO (activo, no activo, bloqueado con motivo, vacaciones) y GRUPO (otros responsables).
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  PERMISOS, URGENCIA, claveTexto, diasEntre, fechaCorta, masDias, urgencia, ESTADOS,
  type ConfigCert, type PersonaCert,
} from "@/modulos/seguridad/certificaciones";
import type { Empresa, EventoPersona, Grupo, Responsable, Validador, ValidacionPersona } from "@/modulos/seguridad/datos";
import { Ventana } from "../Ventana";
import { asignarResponsables, asignarGrupo, cambiarEstado, fichaPersona, registrarValidacion, type Registro } from "../actions";

const nf = new Intl.NumberFormat("es-CO");
const CORTO = ["Alt", "Cal", "SQ", "360", "Elé", "EC", "Izj", "HPRM"];
const NIVELES = ["Básico", "Intermedio", "Avanzado"];
const VENCE = [
  { k: "", t: "Vence: cualquiera" }, { k: "vencida", t: "Ya vencidas" }, { k: "critica", t: "En 7 días o menos" },
  { k: "aviso", t: "Este mes" }, { k: "vigente", t: "Más de un mes" },
];
const PAGINA = 80;
const fechaLarga = (f: string) => `${fechaCorta(f)} de ${f.slice(0, 4)}`;

type Props = {
  personas: PersonaCert[]; hoy: string; config: ConfigCert & { departamentos: string[] };
  empresas: Empresa[]; grupos: Grupo[]; responsables: Responsable[]; validadores: Validador[];
  puedeEditar: boolean;
  /** Llegar desde una alerta: ?cedula= abre su ficha; ?renovar= abre de una el registro de la renovación. */
  abrir?: string; renovar?: string;
};

export function PersonasCert(P: Props) {
  const { personas, hoy, config } = P;
  const [estado, setEstado] = useState("ACTIVO");
  const [empresa, setEmpresa] = useState("");
  const [permiso, setPermiso] = useState("");
  const [vence, setVence] = useState("");
  const [busca, setBusca] = useState("");
  const [ver, setVer] = useState(PAGINA);
  const [sel, setSel] = useState<string | null>(P.renovar ?? P.abrir ?? null);
  const [registro, setRegistro] = useState<{ cedula?: string } | null>(P.renovar && P.puedeEditar ? { cedula: P.renovar } : null);
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const [resp, setResp] = useState("");
  /* LA SELECCIÓN DE LA MATRIZ: varias filas para asignarles Interventor ABI y Coordinador de una vez. */
  const [marca, setMarca] = useState<Set<string>>(new Set());
  const [aIv, setAIv] = useState(""), [aCo, setACo] = useState("");
  const [pendA, startA] = useTransition();
  const interv = P.responsables.filter((r) => r.tipo === "interventor" && r.activo);
  const coord = P.responsables.filter((r) => r.tipo === "coordinador" && r.activo && (!aIv || r.interventor_id === aIv));
  const nombresIv = [...new Set(personas.map((p) => p.interventor).filter(Boolean) as string[])].sort();

  const cuenta = useMemo(() => {
    const c: Record<string, number> = { TODOS: personas.length };
    for (const p of personas) c[p.estado] = (c[p.estado] ?? 0) + 1;
    return c;
  }, [personas]);
  const empresas = [...new Set(personas.map((p) => p.empresa.trim()))].sort();
  const filas = useMemo(() => personas
    .map((p) => { const dias = diasEntre(hoy, p.vencimiento); return { p, dias, u: urgencia(dias, config) } })
    .filter(({ p, u }) =>
      (estado === "TODOS" || p.estado === estado) &&
      (!empresa || claveTexto(p.empresa) === claveTexto(empresa)) &&
      (!permiso || p.permisos.includes(permiso)) &&
      (!vence || u === vence) &&
      (!resp || (resp === "-" ? !p.interventor && !p.coordinador : p.interventor === resp)) &&
      (!busca || claveTexto(`${p.nombre} ${p.cedula}`).includes(claveTexto(busca))))
    .sort((a, b) => a.dias - b.dias || a.p.nombre.localeCompare(b.p.nombre, "es")), [personas, hoy, config, estado, empresa, permiso, vence, busca, resp]);
  useEffect(() => setVer(PAGINA), [estado, empresa, permiso, vence, busca, resp]);
  const todasMarcadas = filas.length > 0 && filas.every(({ p }) => marca.has(p.cedula));
  const alternar = (c: string) => setMarca((m) => { const n = new Set(m); if (n.has(c)) n.delete(c); else n.add(c); return n });
  function asignar(quitar = false) {
    const ced = [...marca];
    startA(async () => {
      const r = await asignarResponsables(ced, quitar ? null : aIv || null, quitar ? null : aCo || null);
      if (r.error) decir(r.error, true); else { decir(r.ok ?? "Listo."); setMarca(new Set()) }
    });
  }

  const persona = sel ? personas.find((p) => p.cedula === sel) ?? null : null;
  const decir = (t: string, mal = false) => { setAviso({ t, mal }); window.setTimeout(() => setAviso(null), 4500) };

  return (
    <div className="sg">
      <header className="sg-cab">
        <div>
          <p className="sg-ojo">SEGURIDAD · CERTIFICACIONES</p>
          <h1>Personas <span className="sg-tag">{config.departamentos.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(", ")}</span></h1>
          <p className="sg-sub">La base de las licencias VACA · {nf.format(personas.length)} personas · se actualiza registrando aquí o con el Excel en Base</p>
        </div>
        {P.puedeEditar && (
          <div className="sg-acc">
            <button type="button" className="sg-bt osc" onClick={() => setRegistro({})}>+ Registrar validación</button>
          </div>
        )}
      </header>
      {aviso && <p className={"sg-aviso" + (aviso.mal ? " mal" : "")} role="status">{aviso.t}</p>}

      <div className="sg-filtros">
        <div className="sg-seg" role="radiogroup" aria-label="Estado">
          {(["ACTIVO", "NO ACTIVO", "BLOQUEADO", "VACACIONES", "TODOS"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={estado === k} className={estado === k ? "on" : ""} onClick={() => setEstado(k)}>
              {k === "TODOS" ? "Todos" : k === "NO ACTIVO" ? "No activos" : k.charAt(0) + k.slice(1).toLowerCase() + (k === "VACACIONES" ? "" : "s")}<i>{cuenta[k] ?? 0}</i>
            </button>
          ))}
        </div>
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={permiso} onChange={(e) => setPermiso(e.target.value)} aria-label="Permiso">
          <option value="">Cualquier permiso</option>
          {PERMISOS.map((x) => <option key={x.k} value={x.k}>{x.t}</option>)}
        </select>
        <select value={vence} onChange={(e) => setVence(e.target.value)} aria-label="Vencimiento">
          {VENCE.map((v) => <option key={v.k} value={v.k}>{v.t}</option>)}
        </select>
        <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Interventor ABI">
          <option value="">Cualquier interventor</option>
          <option value="-">Sin interventor ni coordinador</option>
          {nombresIv.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <input type="search" placeholder="Nombre o cédula" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar persona" />
      </div>

      {P.puedeEditar && marca.size > 0 && (
        <div className="sg-asignar" role="region" aria-label="Asignar a las personas escogidas">
          <b>{marca.size} {marca.size === 1 ? "persona escogida" : "personas escogidas"}</b>
          <select value={aIv} onChange={(e) => { setAIv(e.target.value); if (e.target.value && P.responsables.find((r) => r.id === aCo)?.interventor_id !== e.target.value) setACo("") }} aria-label="Interventor ABI">
            <option value="">Interventor ABI…</option>
            {interv.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <span aria-hidden>→</span>
          <select value={aCo} onChange={(e) => { setACo(e.target.value); const c = P.responsables.find((r) => r.id === e.target.value); if (c?.interventor_id) setAIv(c.interventor_id) }} aria-label="Coordinador de la contratista">
            <option value="">Coordinador…</option>
            {coord.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <button type="button" className="sg-bt osc" disabled={pendA || (!aIv && !aCo)} onClick={() => asignar()}>{pendA ? "Guardando…" : "Asignar"}</button>
          <button type="button" className="sg-bt" disabled={pendA} onClick={() => asignar(true)} title="Vuelven a responder a los de su grupo o su empresa">Quitar asignación</button>
          <button type="button" className="sg-bt" onClick={() => setMarca(new Set())}>Limpiar</button>
          {interv.length === 0 && <small>Primero agrega interventores y coordinadores en Maestro › Responsables.</small>}
        </div>
      )}

      <div className={"sg-split" + (persona ? "" : " solo")}>
        <section className="sg-card">
          {filas.length === 0 ? <p className="sg-vacio">Nadie con esos filtros.</p> : (
            <div className="sg-tabla-rueda">
              <table className="sg-tabla">
                <thead><tr>{P.puedeEditar && <th className="ck"><input type="checkbox" checked={todasMarcadas} aria-label="Escoger todas las de este filtro"
                  onChange={() => setMarca((m) => { const n = new Set(m); for (const { p } of filas) { if (todasMarcadas) n.delete(p.cedula); else n.add(p.cedula) } return n })} /></th>}<th>Persona</th><th>Empresa</th><th>Estado</th><th>Nivel</th><th>Permisos</th><th className="n">Expedición</th><th>Vence</th><th>Interventor ABI · Coordinador</th></tr></thead>
                <tbody>
                  {filas.slice(0, ver).map(({ p, dias, u }) => (
                    <tr key={p.cedula} className={(sel === p.cedula ? "sel" : "") + (marca.has(p.cedula) ? " marcada" : "")} onClick={() => setSel(sel === p.cedula ? null : p.cedula)}
                        tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSel(p.cedula) }}>
                      {P.puedeEditar && <td className="ck" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={marca.has(p.cedula)} onChange={() => alternar(p.cedula)} aria-label={`Escoger a ${p.nombre}`} /></td>}
                      <td className="sg-pp"><b>{p.nombre}</b><small>CC {p.cedula}</small></td>
                      <td>{p.empresa}</td>
                      <td><span className={"sg-st " + p.estado.split(" ")[0]}>{p.estado.charAt(0) + p.estado.slice(1).toLowerCase()}</span></td>
                      <td>{p.nivel ?? "—"}</td>
                      <td className="sg-mx">{PERMISOS.map((x, i) => <i key={x.k} className={p.permisos.includes(x.k) ? "y" : ""} title={x.t}>{CORTO[i]}</i>)}</td>
                      <td className="n">{fechaCorta(p.expedicion)}</td>
                      <td className="sg-ven">
                        <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, (dias / config.vigencia) * 100))}%`, background: URGENCIA[u].color }} /></div>
                        <span style={{ color: u === "vencida" ? "#C8102E" : URGENCIA[u].texto }}><b>{fechaCorta(p.vencimiento)}</b> {dias < 0 ? `−${-dias}` : dias} d</span>
                      </td>
                      <td className="sg-resp-c">{p.interventor || p.coordinador ? <><b>{p.interventor ?? "—"}</b><br />↳ {p.coordinador ?? "—"}{(p.interventor_propio_id || p.coordinador_propio_id) && <i className="sg-propio" title="Asignado a la persona (no por su empresa)">propio</i>}</> : <em>sin asignar</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="sg-pie-tabla">
            <span>{nf.format(Math.min(ver, filas.length))} de {nf.format(filas.length)} personas{marca.size > 0 ? ` · ${marca.size} escogidas` : ""}</span>
            {filas.length > ver && <button type="button" className="sg-bt" onClick={() => setVer((v) => v + PAGINA)}>Ver {Math.min(PAGINA, filas.length - ver)} más</button>}
          </div>
        </section>

        {persona && (
          <Ficha key={persona.cedula} p={persona} hoy={hoy} config={config} grupos={P.grupos} puedeEditar={P.puedeEditar}
                 cerrar={() => setSel(null)} renovar={() => setRegistro({ cedula: persona.cedula })} decir={decir} />
        )}
      </div>

      {registro && (
        <RegistrarValidacion inicial={registro.cedula} {...P} cerrar={() => setRegistro(null)}
          listo={(t, ced) => { setRegistro(null); decir(t); setSel(ced) }} />
      )}
    </div>
  );
}

/* ================================ LA FICHA ================================ */
function Ficha({ p, hoy, config, grupos, puedeEditar, cerrar, renovar, decir }: {
  p: PersonaCert; hoy: string; config: ConfigCert; grupos: Grupo[]; puedeEditar: boolean;
  cerrar: () => void; renovar: () => void; decir: (t: string, mal?: boolean) => void;
}) {
  const [hist, setHist] = useState<{ validaciones: ValidacionPersona[]; eventos: EventoPersona[] } | null>(null);
  const [estado, setEstado] = useState(false);
  const [grupo, setGrupo] = useState(false);
  const dias = diasEntre(hoy, p.vencimiento), u = urgencia(dias, config), U = URGENCIA[u];
  useEffect(() => { fichaPersona(p.cedula).then((r) => setHist(r)) }, [p.cedula, p.vencimiento, p.estado, p.grupo_id]);
  const linea = [
    ...(hist?.validaciones ?? []).map((v) => ({ k: "v" + v.expedicion, en: v.expedicion, cls: "v", t: `${fechaLarga(v.expedicion)}`, d: `Validación · ${v.nivel ?? "—"} · ${v.validador ?? "—"}`, s: `Vence ${fechaLarga(v.vencimiento)}${v.sop ? ` · SOP-DTO ${v.sop}` : ""}${v.origen === "importe" ? " · del Excel" : ""}` })),
    ...(hist?.eventos ?? []).filter((e) => !["importe", "renovacion", "nueva"].includes(e.tipo)).map((e, i) => ({ k: "e" + i, en: e.en.slice(0, 10), cls: "e", t: fechaLarga(e.en.slice(0, 10)), d: e.detalle ?? e.tipo, s: e.por_nombre ? `por ${e.por_nombre}` : "" })),
  ].sort((a, b) => b.en.localeCompare(a.en));
  const gruposEmp = grupos.filter((g) => g.empresa_id === p.empresa_id);

  return (
    <aside className="sg-ficha" aria-label={`Ficha de ${p.nombre}`}>
      <header>
        <div><p>FICHA · CC {p.cedula}</p><h3>{p.nombre}</h3><small>{p.empresa} · {p.departamento}{p.grupo ? ` · ${p.grupo}` : ""}</small></div>
        <button type="button" className="sg-x" onClick={cerrar} aria-label="Cerrar la ficha"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </header>
      <div className="sg-ficha-big" style={{ background: U.color, color: U.sobre }}>
        <span>{dias < 0 ? "VENCIDA HACE" : dias === 0 ? "VENCE" : "VENCE EN"}</span>
        <b>{dias === 0 ? "HOY" : `${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`}</b>
        <small>{fechaLarga(p.vencimiento)} · expedida {fechaLarga(p.expedicion)}</small>
      </div>
      {puedeEditar && (
        <div className="sg-ficha-acc">
          <button type="button" className="sg-bt osc" onClick={renovar}>Renovar validación</button>
          <button type="button" className="sg-bt" onClick={() => setEstado(true)}>Cambiar estado</button>
          <button type="button" className="sg-bt" onClick={() => setGrupo(true)} disabled={!gruposEmp.length && !p.grupo_id}
                  title={gruposEmp.length ? "Pasar a un grupo con otros responsables" : "Esta empresa no tiene grupos (se crean en el Maestro)"}>Grupo</button>
        </div>
      )}
      <div className="sg-ficha-sec">
        <h4>PERMISOS</h4>
        <div className="sg-pg">{PERMISOS.map((x) => <span key={x.k} className={p.permisos.includes(x.k) ? "y" : ""}>{x.t}</span>)}</div>
      </div>
      <div className="sg-ficha-sec dos">
        <div><h4>INTERVENTOR ABI</h4><b>{p.interventor ?? "Sin asignar"}</b></div>
        <div><h4>COORDINADOR DE LA CONTRATISTA</h4><b>{p.coordinador ?? "Sin asignar"}</b></div>
        <div><h4>NIVEL</h4><b>{p.nivel ?? "—"}</b></div>
        <div><h4>ESTADO</h4><b>{p.estado.charAt(0) + p.estado.slice(1).toLowerCase()}</b>{p.motivo && <small className="sg-sm"><br />{p.motivo}</small>}</div>
        <div><h4>VALIDÓ</h4><b>{p.validador ?? "—"}</b></div>
        <div><h4>SOP-DTO OUTSAFETY</h4><b>{p.sop ?? "—"}</b></div>
      </div>
      <div className="sg-ficha-sec">
        <h4>HISTORIAL</h4>
        {!hist ? <p className="sg-sm">Leyendo…</p> : (
          <ul className="sg-tl">{linea.map((l) => <li key={l.k} className={l.cls}><b>{l.t}</b><span>{l.d}</span>{l.s && <small>{l.s}</small>}</li>)}</ul>
        )}
      </div>
      {estado && <CambiarEstado p={p} cerrar={() => setEstado(false)} listo={(t) => { setEstado(false); decir(t) }} />}
      {grupo && <CambiarGrupo p={p} grupos={gruposEmp} cerrar={() => setGrupo(false)} listo={(t, mal) => { setGrupo(false); decir(t, mal) }} />}
    </aside>
  );
}

/* ============================ REGISTRAR VALIDACIÓN ============================ */
function RegistrarValidacion({ inicial, personas, hoy, config, empresas, grupos, responsables, validadores, cerrar, listo }: Props & {
  inicial?: string; cerrar: () => void; listo: (t: string, cedula: string) => void;
}) {
  const [f, setF] = useState<Registro>({
    cedula: inicial ?? "", nombre: "", empresa_id: "", departamento: config.departamentos[0] ?? "LOGISTICA", estado: "ACTIVO",
    expedicion: hoy, permisos: ["360"], nivel: "Básico", validador: "", sop: "", grupo_id: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [pend, start] = useTransition();
  /* EL CAMPO BUSCA POR CÉDULA O POR NOMBRE: con letras, sale la lista de quienes coinciden y se toca uno. */
  const porNombre = /[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}/.test(f.cedula);
  const ced = porNombre ? "" : f.cedula.replace(/[^0-9A-Za-z]/g, "");
  const parecidos = porNombre ? personas.filter((p) => claveTexto(p.nombre).includes(claveTexto(f.cedula))).slice(0, 6) : [];
  const ya = personas.find((p) => p.cedula === ced) ?? null;

  /* SI LA CÉDULA YA ESTÁ, SE CARGA LO QUE SE SABE: es una renovación, no una persona nueva. */
  useEffect(() => {
    if (!ya) return;
    setF((x) => ({
      ...x, nombre: ya.nombre, empresa_id: ya.empresa_id ?? x.empresa_id, departamento: ya.departamento || x.departamento,
      estado: ya.estado === "NO ACTIVO" ? "ACTIVO" : ya.estado, permisos: ya.permisos.length ? ya.permisos : x.permisos,
      nivel: ya.nivel && NIVELES.includes(ya.nivel) ? ya.nivel : x.nivel, sop: "", grupo_id: ya.grupo_id ?? null,
    }));
  }, [ya?.cedula]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Registro>(k: K, v: Registro[K]) => setF((x) => ({ ...x, [k]: v }));
  const vence = f.expedicion ? masDias(f.expedicion, config.vigencia) : null;
  const emp = empresas.find((e) => e.id === f.empresa_id);
  const grp = grupos.find((g) => g.id === f.grupo_id);
  const nombreR = (id: string | null | undefined) => responsables.find((r) => r.id === id)?.nombre ?? null;
  const iv = nombreR(grp?.interventor_id ?? emp?.interventor_id), co = nombreR(grp?.coordinador_id ?? emp?.coordinador_id);
  const esRenov = !!ya && !!f.expedicion && f.expedicion > ya.expedicion;

  function guardar() {
    setError(null);
    start(async () => {
      const r = await registrarValidacion({ ...f, cedula: ced, grupo_id: f.grupo_id || null });
      if (r.error) setError(r.error); else listo(r.ok ?? "Guardado.", ced);
    });
  }

  return (
    <Ventana ojo="REGISTRAR VALIDACIÓN" titulo={ya ? (esRenov ? `Renovación · ${ya.nombre}` : `Corregir · ${ya.nombre}`) : "Persona nueva"} cerrar={cerrar}
      pie={<>
        <button type="button" className="sg-bt" onClick={cerrar}>Cancelar</button>
        <button type="button" className="sg-bt osc" onClick={guardar} disabled={pend || !ced || !f.nombre.trim() || !f.empresa_id || !f.expedicion}>
          {pend ? "Guardando…" : ya ? (esRenov ? "Guardar renovación" : "Guardar corrección") : "Guardar persona"}
        </button>
      </>}>
      <div className="sg-mo-b">
        <div className="sg-campo full">
          <label htmlFor="sg-ced">CÉDULA O NOMBRE</label>
          <input id="sg-ced" value={f.cedula} onChange={(e) => set("cedula", e.target.value)} autoFocus={!inicial} placeholder="Escribe la cédula o el nombre para buscar" />
          {porNombre && (parecidos.length
            ? <div className="sg-parecidos" role="listbox" aria-label="Personas que coinciden">
                {parecidos.map((p) => (
                  <button key={p.cedula} type="button" role="option" aria-selected={false} onClick={() => set("cedula", p.cedula)}>
                    <b>{p.nombre}</b><span>CC {p.cedula} · {p.empresa} · vence {fechaCorta(p.vencimiento)}</span>
                  </button>
                ))}
              </div>
            : <p className="sg-hit nuevo">Nadie con ese nombre. Para una persona nueva, escribe su cédula.</p>)}
          {ced && (ya
            ? <p className="sg-hit">Ya está en la base: <b>{ya.nombre}</b> · {ya.empresa} · {diasEntre(hoy, ya.vencimiento) < 0 ? `venció el ${fechaLarga(ya.vencimiento)}` : `vence el ${fechaLarga(ya.vencimiento)}`}.
                {esRenov ? <> Con una fecha nueva esto es una <b>RENOVACIÓN</b>: la licencia anterior queda en su historial.</> : <> Con la misma fecha de expedición se <b>corrige</b> esa validación.</>}</p>
            : <p className="sg-hit nuevo">Cédula nueva: se crea la persona con esta validación.</p>)}
        </div>
        <div className="sg-campo"><label htmlFor="sg-nom">NOMBRE</label><input id="sg-nom" value={f.nombre} onChange={(e) => set("nombre", e.target.value.toUpperCase())} /></div>
        <div className="sg-campo"><label htmlFor="sg-emp">EMPRESA</label>
          <select id="sg-emp" value={f.empresa_id} onChange={(e) => { set("empresa_id", e.target.value); set("grupo_id", null) }}>
            <option value="">Escoger…</option>
            {empresas.filter((e) => e.activa || e.id === f.empresa_id).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div className="sg-campo"><label htmlFor="sg-dep">DEPARTAMENTO</label>
          <select id="sg-dep" value={f.departamento} onChange={(e) => set("departamento", e.target.value)}>
            {config.departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="sg-campo"><label htmlFor="sg-val">QUIÉN VALIDÓ</label>
          <select id="sg-val" value={f.validador} onChange={(e) => set("validador", e.target.value)}>
            <option value="">Escoger…</option>
            {validadores.filter((v) => v.activo).map((v) => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
          </select>
        </div>
        <div className="sg-campo full">
          <label>PERMISOS QUE QUEDAN HABILITADOS</label>
          <div className="sg-tg">
            {PERMISOS.map((x) => {
              const on = f.permisos.includes(x.k);
              return <button key={x.k} type="button" aria-pressed={on} className={on ? "on" : ""}
                onClick={() => set("permisos", on ? f.permisos.filter((k) => k !== x.k) : [...f.permisos, x.k])}>{x.t}</button>;
            })}
          </div>
        </div>
        <div className="sg-campo"><label>NIVEL</label>
          <div className="sg-seg" role="radiogroup" aria-label="Nivel">
            {NIVELES.map((n) => <button key={n} type="button" role="radio" aria-checked={f.nivel === n} className={f.nivel === n ? "on" : ""} style={{ flex: 1 }} onClick={() => set("nivel", n)}>{n}</button>)}
          </div>
        </div>
        <div className="sg-campo"><label htmlFor="sg-exp">FECHA DE EXPEDICIÓN</label><input id="sg-exp" type="date" max={hoy} value={f.expedicion} onChange={(e) => set("expedicion", e.target.value)} /></div>
        <div className="sg-campo"><label htmlFor="sg-sop">SOP-DTO OUTSAFETY</label><input id="sg-sop" value={f.sop} onChange={(e) => set("sop", e.target.value)} /></div>
        <div className="sg-campo"><label htmlFor="sg-est">ESTADO</label>
          <select id="sg-est" value={f.estado} onChange={(e) => set("estado", e.target.value)}>{ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </div>
        <div className="sg-campo full"><label htmlFor="sg-grp">INTERVENTOR ABI Y COORDINADOR DE LA CONTRATISTA</label>
          <select id="sg-grp" value={f.grupo_id ?? ""} onChange={(e) => set("grupo_id", e.target.value || null)} disabled={!f.empresa_id}>
            <option value="">Los de su empresa{emp ? ` (${nombreR(emp.interventor_id) ?? "sin interventor"} · ${nombreR(emp.coordinador_id) ?? "sin coordinador"})` : ""}</option>
            {grupos.filter((g) => g.empresa_id === f.empresa_id).map((g) => <option key={g.id} value={g.id}>Grupo {g.nombre}</option>)}
          </select>
        </div>
        <div className="sg-res full">
          <div><span>VENCE</span><b>{vence ? fechaLarga(vence) : "—"}</b><small>expedición + {config.vigencia} días</small></div>
          <div><span>ALERTA DESDE</span><b>{vence ? fechaLarga(masDias(vence, -config.diasAviso)) : "—"}</b><small>{config.diasAviso} días antes</small></div>
          <div><span>A QUIÉN SE EXIGE</span><b>{iv || co ? `${iv ?? "—"} · ${co ?? "—"}` : "Sin asignar"}</b><small>{grp ? `grupo ${grp.nombre}` : "los de su empresa (Maestro)"}</small></div>
        </div>
        {error && <p className="sg-err full" role="alert">{error}</p>}
      </div>
    </Ventana>
  );
}

/* ============================ CAMBIAR ESTADO ============================ */
function CambiarEstado({ p, cerrar, listo }: { p: PersonaCert; cerrar: () => void; listo: (t: string) => void }) {
  const [est, setEst] = useState(p.estado);
  const [motivo, setMotivo] = useState(p.motivo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pend, start] = useTransition();
  return (
    <Ventana ojo={`CAMBIAR ESTADO · CC ${p.cedula}`} titulo={p.nombre} chica cerrar={cerrar}
      pie={<>
        <button type="button" className="sg-bt" onClick={cerrar}>Cancelar</button>
        <button type="button" className="sg-bt osc" disabled={pend || (est === p.estado && motivo === (p.motivo ?? ""))}
          onClick={() => start(async () => { const r = await cambiarEstado(p.cedula, est, motivo); if (r.error) setError(r.error); else listo(r.ok ?? "Listo.") })}>
          {pend ? "Guardando…" : "Guardar estado"}
        </button>
      </>}>
      <div className="sg-mo-b">
        <div className="sg-campo full"><label>ESTADO</label>
          <div className="sg-tg">
            {ESTADOS.map((s) => <button key={s} type="button" aria-pressed={est === s} className={est === s ? "on" : ""} onClick={() => setEst(s)}>{s.charAt(0) + s.slice(1).toLowerCase()}</button>)}
          </div>
        </div>
        {est !== "ACTIVO" && (
          <div className="sg-campo full"><label htmlFor="sg-mot">MOTIVO {est === "BLOQUEADO" ? "(obligatorio)" : ""}</label>
            <textarea id="sg-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={est === "BLOQUEADO" ? "Positivo alcoholimetría, comportamiento inseguro…" : "Opcional"} />
          </div>
        )}
        {error && <p className="sg-err full" role="alert">{error}</p>}
      </div>
    </Ventana>
  );
}

/* ============================ GRUPO ============================ */
function CambiarGrupo({ p, grupos, cerrar, listo }: { p: PersonaCert; grupos: Grupo[]; cerrar: () => void; listo: (t: string, mal?: boolean) => void }) {
  const [g, setG] = useState(p.grupo_id ?? "");
  const [pend, start] = useTransition();
  return (
    <Ventana ojo={`GRUPO · CC ${p.cedula}`} titulo={p.nombre} chica cerrar={cerrar}
      pie={<>
        <button type="button" className="sg-bt" onClick={cerrar}>Cancelar</button>
        <button type="button" className="sg-bt osc" disabled={pend || g === (p.grupo_id ?? "")}
          onClick={() => start(async () => { const r = await asignarGrupo([p.cedula], g || null); listo(r.error ?? r.ok ?? "Listo.", !!r.error) })}>
          {pend ? "Guardando…" : "Guardar"}
        </button>
      </>}>
      <div className="sg-mo-b">
        <div className="sg-campo full"><label htmlFor="sg-g">RESPONDE A</label>
          <select id="sg-g" value={g} onChange={(e) => setG(e.target.value)}>
            <option value="">Los responsables de {p.empresa}</option>
            {grupos.map((x) => <option key={x.id} value={x.id}>Grupo {x.nombre}</option>)}
          </select>
        </div>
      </div>
    </Ventana>
  );
}
