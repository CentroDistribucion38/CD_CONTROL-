"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { Buscador } from "@/components/Buscador";
import { diaColombia } from "@/modulos/inventario/corte";
import {
  agregarHojas, agrupar, aPayload, completarRoles, conteoPorRol, fechaConDia, hojasVacias, opcionesPersonas,
  nombreAuto, ponerPersona, proximoDia, quitarHoja, revisar, rolPorDefecto, sumarDias, textoCuando, textoResumen,
  type Equipo, type HojaForm, type PersonaF, type RolF,
} from "@/modulos/inventario/fiscal";
import {
  estadoHoja, filaDesdeBD, ordenarCruce, puedeCruzar, resumenCruce, textoEquipo, textoVenc, titularCruce,
  TEXTO_ESTADO, TEXTO_FILA, type AvanceHoja, type FilaCruce, type FilaCruceBD,
} from "@/modulos/inventario/fiscal-cruce";

/* ===================================================================
   EL INVENTARIO FISCAL, PANTALLA DE QUIEN LO ORGANIZA

   Una lista de los inventarios fiscales (los que vienen primero, los ya hechos
   después) y un formulario para armar uno: nombre, FECHA DEL INVENTARIO y las
   hojas. Cada hoja lleva su número y dos personas: la del operador logístico y
   la de Bavaria. Las hojas son las que hagan falta —se agregan y se quitan— y
   una puede quedar con una sola persona mientras se arman las parejas.

   PLANIFICAR: «hoy planifico todo para el viernes». La fecha es la del
   inventario, no la de hoy: lleva su día de la semana, tres atajos (hoy,
   mañana, el próximo viernes) y la lista dice cuánto falta.

   ESCOGER A LA PERSONA: la lista de todos los usuarios es larga y mezcla a
   quien no cuenta. Cada columna se filtra por ROL (el del OL arranca en el rol
   que parece el suyo; el de Bavaria, en el suyo; el que se escoge se recuerda) y
   se busca tecleando. Quien ya está en otra hoja no sale: una persona no cuenta
   en dos sitios.
   =================================================================== */
const NADIE = "__nadie";
export type Persona = PersonaF;
export type FiscalBD = {
  id: string; nombre: string; fecha: string; estado: "abierto" | "cerrado"; hojas: HojaForm[];
  /** Cuándo se mostró en Contar (null = todavía es solo del plan). */
  publicado?: string | null;
  /** Por número de hoja: su id y cuánto lleva cada equipo (solo con 2026-10-fiscal-cruce.sql). */
  hojaIds?: Record<number, string>;
  avance?: Record<number, AvanceHoja>;
};
/** El cruce que se está mirando: de una hoja de un inventario. `filas` null = todavía cargando. */
type CruceAbierto = { fiscalId: string; hojaId: string; numero: number; filas: FilaCruce[] | null; error: string | null; soloDif: boolean };
/** `manual`: el nombre lo escribió alguien. Mientras no, sigue a la fecha («FISCAL OCTUBRE 2026 · viernes 02/10»). */
type FormF = { id: string | null; nombre: string; fecha: string; hojas: HojaForm[]; manual: boolean };

export function Fiscal({ bodegaId, personas, roles, fiscales, puedeEditar, puedePublicar = true, conCruce = true, manda, ahora }: {
  bodegaId: string; personas: Persona[]; roles: RolF[]; fiscales: FiscalBD[];
  puedeEditar: boolean; manda: boolean; ahora: string;
  /** false = a la base le falta 2026-10-fiscal-publicar.sql: no se ofrece el botón de Contar. */
  puedePublicar?: boolean;
  /** false = a la base le falta 2026-10-fiscal-cruce.sql: no hay avance ni cruce. */
  conCruce?: boolean;
}) {
  const router = useRouter();
  const hoy = diaColombia(ahora);
  const [form, setForm] = useState<FormF | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<string | null>(null);
  const [cruce, setCruce] = useState<CruceAbierto | null>(null);
  const nombre = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);
  const { proximos, anteriores } = useMemo(() => agrupar(fiscales, hoy), [fiscales, hoy]);

  const nuevo = () => {
    setMal(null); setAviso(null);
    setForm({ id: null, nombre: nombreAuto(hoy), fecha: hoy, hojas: hojasVacias(2), manual: false });
  };
  const editar = (f: FiscalBD) => {
    setMal(null); setAviso(null);
    setForm({ id: f.id, nombre: f.nombre, fecha: f.fecha, hojas: f.hojas.length ? f.hojas : hojasVacias(1), manual: f.nombre !== nombreAuto(f.fecha) });
  };

  async function guardar() {
    if (!form) return;
    setMal(null); setOcupado(true);
    const { error } = await createClient().rpc("inv_fiscal_guardar", {
      p_id: form.id, p_bodega: bodegaId, p_nombre: form.nombre.trim(), p_fecha: form.fecha, p_hojas: aPayload(form.hojas),
    });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setForm(null);
    setAviso(form.id ? "Inventario fiscal actualizado." : `Inventario fiscal guardado para el ${fechaConDia(form.fecha)}.`);
    router.refresh();
  }
  async function eliminar(id: string) {
    setMal(null); setAviso(null); setOcupado(true);
    const { error } = await createClient().rpc("inv_fiscal_eliminar", { p_id: id });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setBorrar(null);
    setAviso("Inventario fiscal eliminado.");
    router.refresh();
  }

  /* MOSTRAR EN CONTAR / QUITAR DE CONTAR: el botón que lleva el plan a la pantalla de quien cuenta. */
  async function publicar(f: FiscalBD, mostrar: boolean) {
    setMal(null); setAviso(null); setOcupado(true);
    const { error } = await createClient().rpc("inv_fiscal_publicar", { p_id: f.id, p_publicar: mostrar });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setAviso(mostrar
      ? `«${f.nombre}» ya se ve en Contar: cada persona encuentra su hoja y su pareja.`
      : `«${f.nombre}» ya no se ve en Contar.`);
    router.refresh();
  }

  /* VER EL CRUCE: lo de las dos personas de una hoja, lado a lado. Lo pide quien arma el plan. */
  async function verCruce(f: FiscalBD, numero: number) {
    const hojaId = f.hojaIds?.[numero];
    if (!hojaId) return;
    setMal(null); setAviso(null);
    setCruce({ fiscalId: f.id, hojaId, numero, filas: null, error: null, soloDif: false });
    const { data, error } = await createClient().rpc("inv_fiscal_cruce", { p_hoja: hojaId });
    if (error) return setCruce((c) => (c && c.hojaId === hojaId ? { ...c, error: traducirError(error.message) } : c));
    const filas = ordenarCruce(((data ?? []) as FilaCruceBD[]).map(filaDesdeBD));
    setCruce((c) => (c && c.hojaId === hojaId ? { ...c, filas } : c));
  }

  const tarjeta = (f: FiscalBD) => {
    const r = revisar(f.hojas);
    const conAvance = conCruce && !!f.avance && !!f.publicado;
    return (
      <article key={f.id} className="fe-fila fi-fila">
        <div className="cl-cab">
          <b className="cl-hora">{f.nombre}</b>
          <span className="cl-quien">
            <span className="fi-cuando">{fechaConDia(f.fecha)} · {textoCuando(hoy, f.fecha)}</span>{" "}
            <i className={"fi-estado " + f.estado}>{f.estado === "abierto" ? "ABIERTO" : "CERRADO"}</i>
            {f.publicado && <>{" "}<i className="fi-estado visible">VISIBLE EN CONTAR</i></>}
          </span>
        </div>
        <p className="cl-sub">{textoResumen(r)}</p>
        <table className="fi-hojas">
          <thead><tr><th>Hoja</th><th>Operador logístico</th><th>Bavaria</th>{conAvance && <th>Avance</th>}</tr></thead>
          <tbody>
            {f.hojas.map((h) => {
              const av = conAvance ? f.avance?.[h.numero] : undefined;
              return (
                <tr key={h.numero}>
                  <th scope="row">{h.numero}</th>
                  <td data-et="Operador logístico">{h.ol ? nombre.get(h.ol) ?? "—" : <em>falta</em>}
                    {av && h.ol && <small className="fi-sub">{textoEquipo(av.olRenglones, av.olTermino)}</small>}</td>
                  <td data-et="Bavaria">{h.bavaria ? nombre.get(h.bavaria) ?? "—" : <em>falta</em>}
                    {av && h.bavaria && <small className="fi-sub">{textoEquipo(av.bavariaRenglones, av.bavariaTermino)}</small>}</td>
                  {conAvance && (
                    <td data-et="Avance">
                      {av ? (
                        <span className="fi-av-celda">
                          <i className={"fi-av " + estadoHoja(av)}>{TEXTO_ESTADO[estadoHoja(av)]}</i>
                          {puedeEditar && puedeCruzar(av) && f.hojaIds?.[h.numero] && (
                            <button type="button" className="btn plano fi-cruzar" aria-label={`Ver el cruce de la hoja ${h.numero}`}
                                    onClick={() => verCruce(f, h.numero)}>Ver cruce</button>
                          )}
                        </span>
                      ) : <em>—</em>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {cruce && cruce.fiscalId === f.id && <PanelCruce c={cruce} setC={setCruce} />}
        <div className="cl-botones">
          {puedeEditar && puedePublicar && f.estado === "abierto" && (f.publicado ? (
            <button type="button" className="btn plano fi-quitar" disabled={ocupado} onClick={() => publicar(f, false)}>Quitar de Contar</button>
          ) : (
            <button type="button" className="btn fi-mostrar" disabled={ocupado || revisar(f.hojas).total === 0 || f.hojas.every((h) => !h.ol && !h.bavaria)}
                    title={f.hojas.every((h) => !h.ol && !h.bavaria) ? "Asigna al menos una persona para poder mostrarlo" : undefined}
                    onClick={() => publicar(f, true)}>Mostrar en Contar</button>
          ))}
          {puedeEditar && (f.estado === "abierto" || manda) && (
            <button type="button" className="btn plano" onClick={() => editar(f)}>Editar</button>
          )}
          {manda && (borrar === f.id ? (
            <span className="cl-conf">¿Eliminar este inventario fiscal?
              <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => eliminar(f.id)}>Sí, eliminar</button>
              <button type="button" className="btn plano" onClick={() => setBorrar(null)}>No</button>
            </span>
          ) : (
            <button type="button" className="btn plano" onClick={() => setBorrar(f.id)}>Eliminar</button>
          ))}
        </div>
      </article>
    );
  };

  return (
    <>
      <section className="cabeza fi-cabeza">
        <div>
          <p className="ojo">INVENTARIO · POR PAREJAS</p>
          <h1>Inventario fiscal</h1>
          <p className="sub">
            Cada hoja de conteo la cuentan dos personas, <b>una del operador logístico y una de Bavaria</b>,
            cada una por su lado. Aquí lo planificas con tiempo: escoges la fecha del inventario, armas las
            parejas y numeras las hojas. Son las que hagan falta, y una hoja puede quedar con una sola
            persona mientras terminas de armarlas.
          </p>
        </div>
      </section>

      {aviso && <p className="cl-ok" role="status">{aviso}</p>}
      {!conCruce && puedeEditar && (
        <p className="cl-nota" role="note">
          Para ver el avance de cada hoja y <b>cruzar a las dos personas</b> falta correr <code>supabase/migraciones/2026-10-fiscal-cruce.sql</code> en Supabase.
        </p>
      )}
      {!puedePublicar && puedeEditar && (
        <p className="cl-nota" role="note">
          Para poder <b>mostrar un plan en Contar</b> falta correr <code>supabase/migraciones/2026-10-fiscal-publicar.sql</code> en Supabase.
        </p>
      )}
      {mal && !form && <p className="cl-mal" role="alert">{mal}</p>}

      {form ? (
        <FormFiscal form={form} setForm={setForm} personas={personas} roles={roles} hoy={hoy} ocupado={ocupado} mal={mal}
                    onGuardar={guardar} onCancelar={() => { setForm(null); setMal(null) }} />
      ) : (
        <>
          {puedeEditar && (
            <div className="cl-acciones">
              <button type="button" className="btn grande" onClick={nuevo}>Nuevo inventario fiscal</button>
            </div>
          )}
          {fiscales.length === 0 && (
            <p className="fe-vacio">Todavía no hay ninguno. {puedeEditar ? "Arma el primero con el botón de arriba." : ""}</p>
          )}
          {proximos.length > 0 && (
            <>
              <h2 className="cl-h">Próximos <span>{proximos.length}</span></h2>
              <div className="fe-lista">{proximos.map(tarjeta)}</div>
            </>
          )}
          {anteriores.length > 0 && (
            <>
              <h2 className="cl-h">Anteriores <span>{anteriores.length}</span></h2>
              <div className="fe-lista">{anteriores.map(tarjeta)}</div>
            </>
          )}
        </>
      )}
    </>
  );
}

/** El rol con el que arranca cada columna: el que se escogió la última vez, o el que parece ser el suyo. */
function rolInicial(equipo: Equipo, roles: RolF[]): string {
  try {
    const g = localStorage.getItem("fiscal-rol-" + equipo);
    if (g !== null && (g === "" || roles.some((r) => r.clave === g))) return g;
  } catch { /* sin almacenamiento: se usa el de por defecto */ }
  return rolPorDefecto(roles, equipo);
}

function FormFiscal({ form, setForm, personas, roles: rolesIn, hoy, ocupado, mal, onGuardar, onCancelar }: {
  form: FormF; setForm: (f: FormF) => void; personas: Persona[]; roles: RolF[]; hoy: string; ocupado: boolean; mal: string | null;
  onGuardar: () => void; onCancelar: () => void;
}) {
  const roles = useMemo(() => completarRoles(personas, rolesIn), [personas, rolesIn]);
  const conteo = useMemo(() => conteoPorRol(personas, roles), [personas, roles]);
  const [cuantas, setCuantas] = useState("1");
  const [rolOl, setRolOl] = useState("");
  const [rolBa, setRolBa] = useState("");
  /* El localStorage solo existe en el navegador: se lee después de montar. */
  useEffect(() => { setRolOl(rolInicial("ol", roles)); setRolBa(rolInicial("bavaria", roles)) }, [roles]);
  const escogeRol = (eq: Equipo, v: string) => {
    (eq === "ol" ? setRolOl : setRolBa)(v);
    try { localStorage.setItem("fiscal-rol-" + eq, v) } catch { /* no se pudo recordar: no pasa nada */ }
  };

  const r = revisar(form.hojas);
  /* Dónde está ya cada persona: no se ofrece en las demás casillas. */
  const ocupadas = new Set<string>();
  for (const h of form.hojas) for (const id of [h.ol, h.bavaria]) if (id) ocupadas.add(id);
  const sinNombre = form.nombre.trim().length === 0;
  const puede = !ocupado && !sinNombre && r.errores.length === 0 && form.fecha !== "";
  const cambia = (hojas: HojaForm[]) => setForm({ ...form, hojas });
  const rolDe = (eq: Equipo) => (eq === "ol" ? rolOl : rolBa);
  const viernes = proximoDia(hoy, 5);
  /* Cambiar la fecha arrastra el nombre, salvo que alguien lo haya escrito a mano. */
  const ponFecha = (f: string) => setForm({ ...form, fecha: f, nombre: form.manual || f === "" ? form.nombre : nombreAuto(f) });

  const filtroRol = (eq: Equipo, et: string) => {
    const rol = rolDe(eq);
    const del = personas.filter((p) => p.activo && (rol === "" || p.rol === rol));
    const libres = del.filter((p) => !ocupadas.has(p.id)).length;
    return (
      <label className="fi-rol" key={eq}>
        <span>{et}: buscar entre</span>
        <select value={rol} onChange={(e) => escogeRol(eq, e.target.value)}>
          <option value="">Todos los usuarios</option>
          {conteo.map((c) => <option key={c.clave} value={c.clave}>{c.nombre} ({c.n})</option>)}
        </select>
        <small>{libres} {libres === 1 ? "disponible" : "disponibles"} · {del.length - libres} ya en una hoja</small>
      </label>
    );
  };

  /* «Sin asignar» solo se ofrece si hay alguien que quitar; y lleva su propia clave para que la casilla
     vacía muestre «Teclea el nombre» y no «sin asignar». */
  const opcionesCasilla = (actual: string, eq: Equipo) =>
    opcionesPersonas({ personas, roles, rol: rolDe(eq), ocupadas, actual })
      .filter((o) => o.valor !== "" || actual !== "")
      .map((o) => (o.valor === "" ? { ...o, valor: NADIE } : o));

  const casilla = (h: HojaForm, eq: Equipo, et: string) => (
    <div className="fi-casilla" key={eq}>
      <span className="fi-et">{et}</span>
      <Buscador
        valor={h[eq]}
        marcador="Teclea el nombre"
        sinOpciones="Nadie con ese rol. Cambia el rol de arriba."
        opciones={opcionesCasilla(h[eq], eq)}
        onEscoge={(v) => cambia(ponerPersona(form.hojas, h.numero, eq, v === NADIE ? "" : v))}
      />
    </div>
  );

  return (
    <section className="fe-editor nuevo fi-form" aria-label={form.id ? "Editar inventario fiscal" : "Nuevo inventario fiscal"}>
      <h2>{form.id ? "Editar inventario fiscal" : "Nuevo inventario fiscal"}</h2>
      <div className="fe-campos">
        <label className="ancho">
          <span>Nombre</span>
          <input value={form.nombre} maxLength={80} placeholder="Ej. Fiscal octubre"
                 onChange={(e) => setForm({ ...form, nombre: e.target.value, manual: true })} />
          {form.manual && form.fecha !== "" && form.nombre !== nombreAuto(form.fecha) && (
            <button type="button" className="btn plano fi-auto" onClick={() => setForm({ ...form, nombre: nombreAuto(form.fecha), manual: false })}>
              Usar el nombre automático: {nombreAuto(form.fecha)}
            </button>
          )}
        </label>
        <label>
          <span>Fecha del inventario</span>
          <input type="date" value={form.fecha} onChange={(e) => ponFecha(e.target.value)} />
        </label>
      </div>
      <div className="fi-fecha">
        {form.fecha && <b>{fechaConDia(form.fecha)} · {textoCuando(hoy, form.fecha)}</b>}
        <span className="fi-atajos" role="group" aria-label="Atajos de fecha">
          <button type="button" className="btn plano" aria-pressed={form.fecha === hoy} onClick={() => ponFecha(hoy)}>Hoy</button>
          <button type="button" className="btn plano" aria-pressed={form.fecha === sumarDias(hoy, 1)} onClick={() => ponFecha(sumarDias(hoy, 1))}>Mañana</button>
          <button type="button" className="btn plano" aria-pressed={form.fecha === viernes} onClick={() => ponFecha(viernes)}>Viernes</button>
        </span>
      </div>

      <h3 className="fi-t">Quién cuenta <small>filtra por rol y teclea el nombre</small></h3>
      <div className="fe-campos fi-roles">
        {filtroRol("ol", "Operador logístico")}
        {filtroRol("bavaria", "Bavaria")}
      </div>

      <h3 className="fi-t">Hojas y parejas <small>{textoResumen(r)}</small></h3>
      <div className="fi-hojas-form">
        {form.hojas.map((h) => (
          <div key={h.numero} className={"fi-hoja" + (r.repetidas.size && [h.ol, h.bavaria].some((id) => id && r.repetidas.has(id)) ? " mal" : "")}>
            <div className="fi-hoja-cab">
              <b>Hoja {h.numero}</b>
              <button type="button" className="cl-quitar" onClick={() => cambia(quitarHoja(form.hojas, h.numero))}
                      aria-label={`Quitar la hoja ${h.numero}`}>Quitar</button>
            </div>
            <div className="fi-pareja">
              {casilla(h, "ol", "Operador logístico")}
              {casilla(h, "bavaria", "Bavaria")}
            </div>
          </div>
        ))}
      </div>

      <div className="fi-agregar">
        <label>
          <span>Agregar</span>
          <input type="number" min={1} max={100} inputMode="numeric" value={cuantas}
                 onChange={(e) => setCuantas(e.target.value)} aria-label="Cuántas hojas agregar" />
        </label>
        <button type="button" className="btn plano" onClick={() => {
          const n = Math.min(100, Math.max(1, Math.floor(Number(cuantas) || 1)));
          cambia(agregarHojas(form.hojas, n));
        }}>hojas más</button>
      </div>

      {(r.errores.length > 0 || mal) && (
        <div className="cl-mal" role="alert">
          {mal ?? "Revisa esto antes de guardar:"}
          {!mal && <ul>{r.errores.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
      )}
      {r.errores.length === 0 && (r.aMedias > 0 || r.vacias > 0) && (
        <p className="cl-nota">
          {r.aMedias > 0 && <>{r.aMedias} {r.aMedias === 1 ? "hoja tiene" : "hojas tienen"} una sola persona. </>}
          {r.vacias > 0 && <>{r.vacias} {r.vacias === 1 ? "hoja no tiene" : "hojas no tienen"} a nadie todavía. </>}
          Se puede guardar así y completar después.
        </p>
      )}

      <div className="cl-botones">
        <button type="button" className="btn grande" disabled={!puede} onClick={onGuardar}>
          {ocupado ? "Guardando…" : form.id ? "Guardar los cambios" : "Guardar el inventario fiscal"}
        </button>
        <button type="button" className="btn plano" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
      </div>
    </section>
  );
}

/** El cruce de una hoja: arriba el titular y las cifras, debajo cada renglón (las diferencias primero). */
function PanelCruce({ c, setC }: { c: CruceAbierto; setC: (x: CruceAbierto | null) => void }) {
  const nf = useMemo(() => new Intl.NumberFormat("es-CO"), []);
  const r = c.filas ? resumenCruce(c.filas) : null;
  const vistas = c.filas ? (c.soloDif ? c.filas.filter((f) => f.estado !== "COINCIDE") : c.filas) : [];
  return (
    <section className="fi-cruce" aria-label={`Cruce de la hoja ${c.numero}`}>
      <div className="fi-cruce-cab">
        <b>Cruce · Hoja {c.numero}</b>
        <button type="button" className="btn plano fi-cruce-cerrar" onClick={() => setC(null)}>Cerrar</button>
      </div>
      {c.error && <p className="cl-mal" role="alert">{c.error}</p>}
      {!c.error && !c.filas && <p className="cl-nota" role="status">Cruzando…</p>}
      {r && (
        <>
          <p className={"fi-cruce-titular" + (r.conDiferencia === 0 ? " bien" : " mal")} role="status">{titularCruce(r)}</p>
          <ul className="fi-cruce-cifras" aria-label="Resumen del cruce">
            <li><b>{r.coinciden}</b> coinciden</li>
            <li><b>{r.difieren}</b> {r.difieren === 1 ? "difiere" : "difieren"}</li>
            <li><b>{r.soloOl}</b> solo el operador</li>
            <li><b>{r.soloBavaria}</b> solo Bavaria</li>
          </ul>
          {r.conDiferencia > 0 && r.coinciden > 0 && (
            <button type="button" className="btn plano fi-cruce-filtro" aria-pressed={c.soloDif} onClick={() => setC({ ...c, soloDif: !c.soloDif })}>
              {c.soloDif ? "Mostrar también los que coinciden" : "Ocultar los que coinciden"}
            </button>
          )}
          {vistas.length > 0 && (
            <table className="fi-cruce-tabla">
              <thead><tr><th>Estado</th><th>Sitio</th><th>Material</th><th>Vence</th><th>Operador</th><th>Bavaria</th><th>Diferencia</th></tr></thead>
              <tbody>
                {vistas.map((f, i) => (
                  <tr key={i} className={"fi-f " + f.estado.toLowerCase()}>
                    <td data-et="Estado"><i className={"fi-ef " + f.estado.toLowerCase()}>{TEXTO_FILA[f.estado]}</i></td>
                    <td data-et="Sitio">{f.ubicacion}</td>
                    <td data-et="Material"><b>{f.sku}</b> {f.material}</td>
                    <td data-et="Vence">{textoVenc(f.vencDia, f.vencMes, f.vencAnio)}</td>
                    <td data-et="Operador" className="num">{f.cajasOl === null ? "—" : nf.format(f.cajasOl)}</td>
                    <td data-et="Bavaria" className="num">{f.cajasBavaria === null ? "—" : nf.format(f.cajasBavaria)}</td>
                    <td data-et="Diferencia" className="num">{f.diferencia === 0 ? "0" : (f.diferencia > 0 ? "+" : "") + nf.format(f.diferencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="fi-cruce-pie">Cajas contadas (estibas × cajas por estiba + saldo + cajas sueltas). Lo que contó solo uno de los dos cuenta como diferencia.</p>
        </>
      )}
    </section>
  );
}
