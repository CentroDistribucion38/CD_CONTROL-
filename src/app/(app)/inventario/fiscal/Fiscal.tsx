"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { Buscador } from "@/components/Buscador";
import { diaColombia } from "@/modulos/inventario/corte";
import Link from "next/link";
import { Ico } from "./PanelFiscal";
import { SelectorInventario } from "./SelectorInventario";
import {
  agregarHojas, agrupar, alternarFamilia, aPayload, completarRoles, conteoPorRol, fechaConDia, hojasVacias, opcionesPersonas,
  nombreAuto as nombreAutoBase, ponerCalle, ponerPersona, proximoDia, quitarHoja, revisar, rolPorDefecto, sumarDias, textoCuando, textoResumen,
  mismaFamilia, type Equipo, type HojaForm, type PersonaF, type RolF,
} from "@/modulos/inventario/fiscal";
import { MODULOS_DE_LA_HOJA } from "@/modulos/inventario/modulos-hoja";
import {
  estadoHoja, textoEquipo, TEXTO_ESTADO, type AvanceHoja, type EstadoHoja,
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

/** Cuánto lleva un equipo en su hoja. No se sabe cuántos renglones serán, así que no es un porcentaje:
    vacío = sin empezar, rayado = contando, lleno = terminó. */
function Medidor({ renglones, termino }: { renglones: number; termino: string | null }) {
  const est = termino !== null ? "listo" : renglones > 0 ? "contando" : "nada";
  return <span className={"fi-med " + est} aria-hidden="true"><i /></span>;
}

/** Las calles con las que se puede numerar una hoja, en orden (las de una letra primero). */
const CALLES = Object.keys(MODULOS_DE_LA_HOJA)
  .filter((c) => MODULOS_DE_LA_HOJA[c].some((m) => /^\d/.test(m)))
  .sort((a, b) => (a.length === 1 ? 0 : 1) - (b.length === 1 ? 0 : 1) || a.localeCompare(b, "es", { numeric: true }));
/** Los módulos numerados de una calle ("01"…"36"): por ahí se cruzan las dos personas. */
const numeradosDe = (calle: string | undefined): string[] =>
  calle ? (MODULOS_DE_LA_HOJA[calle] ?? []).filter((m) => /^\d/.test(m)) : [];

/** El mapa de la calle: por dónde empieza y hacia dónde va cada equipo, para que se crucen a mitad de camino. */
function MapaCalles({ hojas, nombre }: { hojas: HojaForm[]; nombre: Map<string, string> }) {
  const con = hojas.filter((h) => numeradosDe(h.calle).length >= 2);
  if (con.length === 0) return <p className="cl-nota">Ninguna hoja tiene calle todavía. Escógela en «Editar parejas y hojas».</p>;
  return (
    <div className="fi-mapa">
      {con.map((h) => {
        const mods = numeradosDe(h.calle);
        const medio = Math.ceil(mods.length / 2);
        return (
          <div key={h.numero} className="fi-mapa-hoja">
            <p className="fi-mapa-cab"><b>Hoja {h.numero}</b><span className="fi-calle">Calle {h.calle}</span></p>
            <p className="fi-flecha ol"><span>{h.ol ? nombre.get(h.ol) ?? "—" : "Operador logístico"}</span><em>{mods[0]} → {mods[mods.length - 1]}</em></p>
            <div className="fi-pista" style={{ gridTemplateColumns: `repeat(${mods.length}, minmax(0, 1fr))` }} aria-hidden="true">
              {mods.map((m, i) => <i key={m} className={i + 1 === medio ? "cruce" : ""} title={m} />)}
            </div>
            <p className="fi-flecha ba"><span>{h.bavaria ? nombre.get(h.bavaria) ?? "—" : "Bavaria"}</span><em>{mods[mods.length - 1]} → {mods[0]}</em></p>
            <p className="fi-mapa-pie">Si los dos van al mismo paso se cruzan hacia el módulo {mods[medio - 1]}.</p>
          </div>
        );
      })}
    </div>
  );
}

const ORDEN_ESTADOS: EstadoHoja[] = ["lista", "una-termino", "contando", "sin-empezar"];

/* ===================================================================
   LA MISMA PANTALLA PARA EL CÍCLICO DE PRODUCTO

   «Un módulo que no sea fiscal sino que se llame CÍCLICO: se elige lo mismo del fiscal, la familia, las
    parejas.» El armado es idéntico (hojas, calle, familias, parejas y el botón de Contar); cambian las
   palabras, las funciones de la base que guardan (con el permiso de Producto) y adónde se sigue después.
   =================================================================== */
export type ModoPlan = "fiscal" | "ciclico";
const TXT = {
  fiscal: {
    uno: "Inventario fiscal", el: "el inventario fiscal", prefijo: "FISCAL", ejemplo: "Ej. Fiscal octubre",
    ojo: "INVENTARIO · POR PAREJAS", titulo: "Plan fiscal", tarjeta: "Plan fiscal · por parejas",
    guardar: "inv_fiscal_guardar", publicar: "inv_fiscal_publicar",
  },
  ciclico: {
    uno: "Inventario cíclico", el: "el inventario cíclico", prefijo: "CÍCLICO", ejemplo: "Ej. Cíclico lata",
    ojo: "INVENTARIO · PRODUCTO · POR PAREJAS", titulo: "Plan cíclico", tarjeta: "Cíclico · por parejas",
    guardar: "inv_ciclico_guardar", publicar: "inv_ciclico_publicar",
  },
} as const;
export type Persona = PersonaF;
export type FiscalBD = {
  id: string; nombre: string; fecha: string; estado: "abierto" | "cerrado"; hojas: HojaForm[];
  /** Cuándo se mostró en Contar (null = todavía es solo del plan). */
  publicado?: string | null;
  /** Por número de hoja: su id y cuánto lleva cada equipo (solo con 2026-10-fiscal-cruce.sql). */
  hojaIds?: Record<number, string>;
  avance?: Record<number, AvanceHoja>;
};
/** `manual`: el nombre lo escribió alguien. Mientras no, sigue a la fecha («FISCAL OCTUBRE 2026 · viernes 02/10»). */
type FormF = { id: string | null; nombre: string; fecha: string; hojas: HojaForm[]; manual: boolean };

export function Fiscal({ bodegaId, personas, roles, fiscales, puedeEditar, puedePublicar = true, conCruce = true, conCalle = true, conFamilias = true, familias = [], manda, ahora, modo = "fiscal", cruces }: {
  bodegaId: string; personas: Persona[]; roles: RolF[]; fiscales: FiscalBD[];
  /** «fiscal» (Plan fiscal) o «ciclico» (Producto · Cíclico): mismo armado, otras palabras y otras funciones de la base. */
  modo?: ModoPlan;
  /** Solo en el cíclico: por id de hoja, cuántos renglones cruza y cuántos NO coinciden. La hoja queda cuadrada
   *  cuando todo coincide: nadie la aprueba ni la «termina». */
  cruces?: Record<string, { total: number; conDif: number; enviada?: boolean }>;
  puedeEditar: boolean; manda: boolean; ahora: string;
  /** false = a la base le falta 2026-10-fiscal-publicar.sql: no se ofrece el botón de Contar. */
  puedePublicar?: boolean;
  /** false = a la base le falta 2026-10-fiscal-cruce.sql: no hay avance ni cruce. */
  conCruce?: boolean;
  /** false = a la base le falta 2026-10-fiscal-calle.sql: no se ofrece escoger la calle. */
  conCalle?: boolean;
  /** false = a la base le falta 2026-11-fiscal-familias.sql: no se ofrece asignar familias. */
  conFamilias?: boolean;
  /** Las familias que se pueden asignar a una hoja, con su número de códigos. */
  familias?: { nombre: string; n: number; tipo?: "PT" | "EER" }[];
}) {
  const router = useRouter();
  const T = TXT[modo];
  const hoy = diaColombia(ahora);
  const [form, setForm] = useState<FormF | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<string | null>(null);
  const nombre = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);
  const { proximos, anteriores } = useMemo(() => agrupar(fiscales, hoy), [fiscales, hoy]);
  /* Una sola pantalla: el inventario escogido (el más próximo al abrir). */
  const todos = useMemo(() => [...proximos, ...anteriores], [proximos, anteriores]);
  const [selId, setSelId] = useState<string | null>(null);
  const sel = todos.find((f) => f.id === selId) ?? todos[0] ?? null;

  const nuevo = () => {
    setMal(null); setAviso(null);
    setForm({ id: null, nombre: nombreAutoBase(hoy, T.prefijo), fecha: hoy, hojas: hojasVacias(2), manual: false });
  };
  const editar = (f: FiscalBD) => {
    setMal(null); setAviso(null);
    setForm({ id: f.id, nombre: f.nombre, fecha: f.fecha, hojas: f.hojas.length ? f.hojas : hojasVacias(1), manual: f.nombre !== nombreAutoBase(f.fecha, T.prefijo) });
  };

  async function guardar() {
    if (!form) return;
    setMal(null); setOcupado(true);
    const { error } = await createClient().rpc(T.guardar, {
      p_id: form.id, p_bodega: bodegaId, p_nombre: form.nombre.trim(), p_fecha: form.fecha, p_hojas: aPayload(form.hojas),
    });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setForm(null);
    setAviso(form.id ? `${T.uno} actualizado.` : `${T.uno} guardado para el ${fechaConDia(form.fecha)}.`);
    router.refresh();
  }
  async function eliminar(id: string) {
    setMal(null); setAviso(null); setOcupado(true);
    const { error } = await createClient().rpc("inv_fiscal_eliminar", { p_id: id });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setBorrar(null);
    setAviso(`${T.uno} eliminado.`);
    router.refresh();
  }

  /* MOSTRAR EN CONTAR / QUITAR DE CONTAR: el botón que lleva el plan a la pantalla de quien cuenta. */
  async function publicar(f: FiscalBD, mostrar: boolean) {
    setMal(null); setAviso(null); setOcupado(true);
    const { error } = await createClient().rpc(T.publicar, { p_id: f.id, p_publicar: mostrar });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setAviso(mostrar
      ? `«${f.nombre}» ya se ve en Contar: cada persona encuentra su hoja y su pareja.`
      : `«${f.nombre}» ya no se ve en Contar.`);
    router.refresh();
  }

  const tarjeta = (f: FiscalBD) => {
    const r = revisar(f.hojas);
    /* «Quitar de Contar» solo esconde el conteo a quienes cuentan: el avance y el cruce siguen para quien analiza y valida. */
    const conAvance = conCruce && !!f.avance;
    const puedeVer = !(f.hojas.every((h) => !h.ol && !h.bavaria) || r.total === 0);
    const acciones = (
      <>
        {puedeEditar && puedePublicar && f.estado === "abierto" && (f.publicado ? (
          <button type="button" className="btn plano fi-quitar" disabled={ocupado} onClick={() => publicar(f, false)}>
            <Ico n="ojoNo" tam={16} /> Quitar de Contar
          </button>
        ) : (
          <button type="button" className="btn fi-mostrar" disabled={ocupado || !puedeVer}
                  title={!puedeVer ? "Asigna al menos una persona para poder mostrarlo" : undefined}
                  onClick={() => publicar(f, true)}>
            <Ico n="ojo" tam={16} /> Mostrar en Contar
          </button>
        ))}
        {modo === "fiscal" && f.hojas.length > 0 && (
          <Link className="btn plano" href={`/inventario/fiscal/planillas?fiscal=${f.id}`} title="Genera las planillas de conteo, una por pareja, para imprimir" aria-label="Planillas de conteo para imprimir">
            <Ico n="impresora" tam={16} /> Planillas
          </Link>
        )}
        {puedeEditar && (f.estado === "abierto" || manda) && (
          <button type="button" className="btn plano" onClick={() => editar(f)}><Ico n="lapiz" tam={16} /> Editar</button>
        )}
        {manda && (borrar === f.id ? (
          <span className="cl-conf">¿Eliminar {modo === "fiscal" ? "este inventario fiscal" : "este inventario cíclico"}?
            <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => eliminar(f.id)}>Sí, eliminar</button>
            <button type="button" className="btn plano" onClick={() => setBorrar(null)}>No</button>
          </span>
        ) : (
          <button type="button" className="btn plano" onClick={() => setBorrar(f.id)}><Ico n="papelera" tam={16} /> Eliminar</button>
        ))}
      </>
    );
    /* Cuántas hojas hay en cada punto: lo primero que se quiere saber el día del inventario. */
    const porEstado = new Map<EstadoHoja, number>();
    if (conAvance) for (const h of f.hojas) {
      const av = f.avance?.[h.numero];
      if (av) porEstado.set(estadoHoja(av), (porEstado.get(estadoHoja(av)) ?? 0) + 1);
    }
    const n = (e: EstadoHoja) => porEstado.get(e) ?? 0;
    /* EL CÍCLICO SE LEE POR EL CRUCE, no por «terminó»: cuadrada = todo coincide; si no, lo que falta por cruzar. */
    const cruceDe = (numero: number) => {
      const id = f.hojaIds?.[numero];
      return id && cruces ? cruces[id] : undefined;
    };
    const estadoCiclico = (numero: number): { clase: EstadoHoja; texto: string } => {
      const c = cruceDe(numero);
      if (c?.enviada) return { clase: "lista", texto: "Conteo enviado" };
      if (!c || c.total === 0) return { clase: "sin-empezar", texto: "Sin contar" };
      if (c.conDif > 0) return { clase: "contando", texto: `${c.conDif} por cruzar` };
      return { clase: "lista", texto: "Todo coincide · falta enviar" };
    };
    const enviadas = f.hojas.filter((h) => !!cruceDe(h.numero)?.enviada).length;
    const conDif = f.hojas.filter((h) => estadoCiclico(h.numero).clase === "contando").length;
    const cifras: { v: number; et: string; tono?: string }[] = modo === "ciclico" && cruces
      ? [
        { v: r.total, et: r.total === 1 ? "hoja" : "hojas" },
        { v: r.completas, et: r.completas === 1 ? "pareja completa" : "parejas completas" },
        { v: conDif, et: "con diferencias por cruzar", tono: "proceso" },
        { v: enviadas, et: enviadas === 1 ? "conteo enviado" : "conteos enviados", tono: "ok" },
      ]
      : conAvance
      ? [
        { v: r.total, et: r.total === 1 ? "hoja" : "hojas" },
        { v: r.completas, et: r.completas === 1 ? "pareja completa" : "parejas completas" },
        { v: n("contando") + n("una-termino"), et: "contando ahora", tono: "proceso" },
        { v: n("lista"), et: "listas para cruzar", tono: "ok" },
      ]
      : [
        { v: r.total, et: r.total === 1 ? "hoja" : "hojas" },
        { v: r.completas, et: r.completas === 1 ? "pareja completa" : "parejas completas", tono: "ok" },
        { v: r.aMedias, et: "a medias", tono: r.aMedias ? "proceso" : undefined },
        { v: r.vacias, et: "sin nadie", tono: r.vacias ? "proceso" : undefined },
      ];
    const sentidoDe = (calle: string | undefined, eq: Equipo) => {
      const m = numeradosDe(calle);
      return m.length < 2 ? undefined : eq === "ol" ? `${m[0]} → ${m[m.length - 1]}` : `${m[m.length - 1]} → ${m[0]}`;
    };
    const equipo = (id: string, et: string, renglones: number | undefined, termino: string | null | undefined, sentido?: string) => (
      <div className="fi-eq">
        <span className="fi-eq-et">{et}{sentido && <em className="fi-sentido">{sentido}</em>}</span>
        {id ? (
          <>
            <span className="fi-quien">{nombre.get(id) ?? "—"}</span>
            {renglones !== undefined && (
              <>
                <Medidor renglones={renglones} termino={termino ?? null} />
                <small className="fi-sub">{textoEquipo(renglones, termino ?? null)}</small>
              </>
            )}
          </>
        ) : <em className="fi-falta">Falta asignar</em>}
      </div>
    );
    const parejas = (
      <>
        <ul className="fi-cifras" aria-label="Resumen del inventario">
          {cifras.map((c) => (
            <li key={c.et} className={c.tono ?? ""}><b>{c.v}</b><span>{c.et}</span></li>
          ))}
        </ul>
        <ol className="fi-filas">
          {f.hojas.map((h) => {
            const av = conAvance ? f.avance?.[h.numero] : undefined;
            const ec = modo === "ciclico" && cruces ? estadoCiclico(h.numero) : null;
            const est = ec ? ec.clase : av ? estadoHoja(av) : "sin-empezar";
            return (
              <li key={h.numero} className={"fi-fila " + est}>
                <div className="fi-num"><small>Hoja</small><b>{h.numero}</b>{h.calle && <span className="fi-calle">Calle {h.calle}</span>}{conFamilias && (h.familias?.length ?? 0) > 0 && <span className="fi-calle fi-fams-ver" title="Familias que cuenta esta hoja">{h.familias!.join(" + ")}</span>}</div>
                {equipo(h.ol, "Operador logístico", av?.olRenglones, av?.olTermino, sentidoDe(h.calle, "ol"))}
                {equipo(h.bavaria, "Bavaria", av?.bavariaRenglones, av?.bavariaTermino, sentidoDe(h.calle, "bavaria"))}
                {ec ? <i className={"fi-av " + ec.clase}>{ec.texto}</i>
                  : conAvance && av && <i className={"fi-av " + est}>{TEXTO_ESTADO[est]}</i>}
              </li>
            );
          })}
        </ol>
        {puedeEditar && (f.estado === "abierto" || manda) && (
          <div className="cl-botones">
            <button type="button" className="btn" onClick={() => editar(f)}><Ico n="lapiz" tam={16} /> Editar parejas y hojas</button>
          </div>
        )}
      </>
    );
    /* Los avisos van al final y cerrados: lo principal es la tabla. */
    const avisos: ReactNode[] = [];
    if (!conCruce && puedeEditar) avisos.push(<>Para ver el avance de cada hoja y <b>cruzar a las dos personas</b> falta correr <code>supabase/migraciones/2026-10-fiscal-cruce.sql</code> en Supabase.</>);
    if (!puedePublicar && puedeEditar) avisos.push(<>Para poder <b>mostrar un plan en Contar</b> falta correr <code>supabase/migraciones/2026-10-fiscal-publicar.sql</code> en Supabase.</>);
    if (!conCalle && puedeEditar) avisos.push(<>Para poder <b>poner una calle a cada hoja</b> falta correr <code>supabase/migraciones/2026-10-fiscal-calle.sql</code> en Supabase.</>);
    if (!conFamilias && puedeEditar) avisos.push(<>Para poder <b>asignar familias a cada hoja</b> falta correr <code>supabase/migraciones/2026-11-fiscal-familias.sql</code> en Supabase.</>);
    if (f.publicado) avisos.push(modo === "fiscal"
      ? <>Ya se ve en Contar. Para seguir el avance en vivo y revisar las diferencias: <Link href="/inventario/control-fiscal">abrir el Control fiscal</Link>.</>
      : <>Ya se ve en <Link href="/inventario/producto/contar">Contar de Producto</Link>: la pareja cruza y, cuando todo coincide, envía el conteo. El avance y el Excel de los conteos están en el <Link href="/inventario/producto/control">Control cíclico</Link>.</>);
    return (
      <section key={f.id} className="vf fi-plan" aria-label={`${T.titulo} ${f.nombre}`}>
        <header className="vf-cab">
          <div className="vf-tit">
            <p className="vf-ojo">{T.tarjeta}</p>
            <h2>{f.nombre}</h2>
            <p className="vf-meta">
              <Ico n="calendario" tam={15} /> {fechaConDia(f.fecha)} · {textoCuando(hoy, f.fecha)}
              <span className={"vf-tag " + (f.estado === "abierto" ? "abierto" : "cerrado")}>{f.estado === "abierto" ? "Abierto" : "Cerrado"}</span>
              {f.publicado && <span className="vf-tag visible"><Ico n="ojo" tam={12} /> Visible en Contar</span>}
            </p>
          </div>
          <div className="vf-acc">{acciones}</div>
        </header>
        <div className="vf-parejas">{parejas}</div>
        {conCalle && f.hojas.some((h) => h.calle) && (
          <details className="fi-avisos">
            <summary>Mapa de la calle: por dónde cuenta cada equipo</summary>
            <MapaCalles hojas={f.hojas} nombre={nombre} />
          </details>
        )}
        {avisos.length > 0 && (
          <details className="fi-avisos">
            <summary>Avisos ({avisos.length})</summary>
            {avisos.map((a, i) => <p key={i} className="cl-nota" role="note">{a}</p>)}
          </details>
        )}
      </section>
    );
  };

  return (
    <>
      <section className="cabeza fi-cabeza">
        <div>
          <p className="ojo">{T.ojo}</p>
          <h1>{T.titulo}</h1>
          <p className="sub">
            Cada hoja la cuentan dos personas, <b>una del operador logístico y una de Bavaria</b>, cada una por su lado.
            {modo === "fiscal"
              ? " Escoge la fecha, arma las parejas y numera las hojas."
              : <> Escoge la fecha, la familia de producto de cada hoja y las parejas; después <b>habilita el Contar</b>. Se cuenta solo el código y la cantidad.</>}
          </p>
        </div>
      </section>

      {aviso && <p className="cl-ok" role="status">{aviso}</p>}
      {mal && !form && <p className="cl-mal" role="alert">{mal}</p>}

      {form ? (
        <FormFiscal modo={modo} form={form} setForm={setForm} personas={personas} roles={roles} hoy={hoy} ocupado={ocupado} mal={mal} conCalle={conCalle} conFamilias={conFamilias} familias={familias}
                    onGuardar={guardar} onCancelar={() => { setForm(null); setMal(null) }} />
      ) : (
        <>
          {puedeEditar && (
            <div className="cl-acciones">
              <button type="button" className="btn grande" onClick={nuevo}>Nuevo {T.el.replace(/^el /, "")}</button>
            </div>
          )}
          {fiscales.length === 0 && (
            <p className="fe-vacio">Todavía no hay ninguno. {puedeEditar ? "Arma el primero con el botón de arriba." : ""}</p>
          )}
          {todos.length > 1 && (
            <SelectorInventario actual={sel?.id ?? null} escoger={setSelId}
              items={todos.map((f) => ({ id: f.id, nombre: f.nombre, fecha: fechaConDia(f.fecha), cuando: textoCuando(hoy, f.fecha), abierto: f.estado === "abierto" }))} />
          )}
          {sel && tarjeta(sel)}
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

/** Las familias de una hoja: un solo campo; lo marcado queda como etiquetas con × y la lista se abre debajo.
    Producto y envase (EER) van en grupos aparte. Una hoja puede llevar todas las que se quiera. */
function SelectorFamilias({ familias, marcadas, alAlternar, alLimpiar, hoja }: {
  familias: { nombre: string; n: number; tipo?: "PT" | "EER" }[]; marcadas: string[];
  alAlternar: (nombre: string) => void; alLimpiar: () => void; hoja: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) };
    document.addEventListener("mousedown", fuera); document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla) };
  }, [abierto]);
  const esta = (n: string) => marcadas.some((x) => mismaFamilia(x, n));
  const lista = familias.filter((f) => esta(f.nombre));
  const sueltas = marcadas.filter((x) => !familias.some((f) => mismaFamilia(f.nombre, x)));
  const codigos = lista.reduce((t, f) => t + f.n, 0);
  const grupos = [["PT", "Producto"], ["EER", "Envase · EER"]] as const;
  return (
    <div className="fi-fams" ref={caja}>
      <div className="fi-fams-cab">
        <span className="fi-fams-t">Familias que cuentan</span>
        <span className="fi-fams-res">
          <b className="fi-pill">{marcadas.length} {marcadas.length === 1 ? "marcada" : "marcadas"}</b>
          <span className="fi-pill l">{codigos} {codigos === 1 ? "código" : "códigos"}</span>
        </span>
      </div>
      <div className={"fi-multi" + (abierto ? " abierto" : "")}>
        {lista.map((f) => (
          <span key={f.nombre} className={"fi-tag" + (f.tipo === "EER" ? " eer" : "")}>
            {f.nombre} <i>{f.n}</i>
            <button type="button" aria-label={`Quitar ${f.nombre} de la hoja ${hoja}`} onClick={() => alAlternar(f.nombre)}>×</button>
          </span>
        ))}
        {sueltas.map((n) => (
          <span key={n} className="fi-tag">{n}<button type="button" aria-label={`Quitar ${n}`} onClick={() => alAlternar(n)}>×</button></span>
        ))}
        <button type="button" className="fi-multi-b" aria-expanded={abierto} aria-haspopup="listbox" onClick={() => setAbierto((a) => !a)}>
          <span>{marcadas.length ? "Agregar familia…" : "Sin familias todavía: toca para elegir"}</span><i aria-hidden="true" />
        </button>
      </div>
      {abierto && (
        <div className="fi-menu" role="listbox" aria-multiselectable="true" aria-label={`Familias de la hoja ${hoja}`}>
          {grupos.map(([tp, tit]) => {
            const fs = familias.filter((f) => (f.tipo ?? "PT") === tp);
            if (!fs.length) return null;
            return (
              <div key={tp}>
                <div className={"fi-mg " + (tp === "EER" ? "eer" : "")}>{tit}</div>
                {fs.map((f) => {
                  const on = esta(f.nombre);
                  return (
                    <button key={f.nombre} type="button" role="option" aria-selected={on} className={"fi-mr" + (on ? " on" : "") + (tp === "EER" ? " eer" : "")} onClick={() => alAlternar(f.nombre)}>
                      <span className="fi-k" aria-hidden="true">{on ? "✓" : ""}</span>{f.nombre}<i>{f.n} {f.n === 1 ? "código" : "códigos"}</i>
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div className="fi-mpie">
            <button type="button" className="fi-link" disabled={marcadas.length === 0} onClick={alLimpiar}>Quitar todas</button>
            <button type="button" className="fi-link" onClick={() => setAbierto(false)}>Listo</button>
          </div>
        </div>
      )}
      <small className="fi-fams-nota">Es solo una guía para quien cuenta: no limita lo que puede anotar.</small>
    </div>
  );
}

function FormFiscal({ modo = "fiscal", form, setForm, personas, roles: rolesIn, hoy, ocupado, mal, conCalle, conFamilias, familias, onGuardar, onCancelar }: {
  modo?: ModoPlan; form: FormF; setForm: (f: FormF) => void; personas: Persona[]; roles: RolF[]; hoy: string; ocupado: boolean; mal: string | null; conCalle: boolean;
  conFamilias: boolean; familias: { nombre: string; n: number; tipo?: "PT" | "EER" }[];
  onGuardar: () => void; onCancelar: () => void;
}) {
  const T = TXT[modo];
  const nombreAuto = (f: string) => nombreAutoBase(f, T.prefijo);
  const roles = useMemo(() => completarRoles(personas, rolesIn), [personas, rolesIn]);
  const conteo = useMemo(() => conteoPorRol(personas, roles), [personas, roles]);
  const [cuantas, setCuantas] = useState("1");
  const [activa, setActiva] = useState(1);
  const [pidiendo, setPidiendo] = useState(false);
  const [rolOl, setRolOl] = useState("");
  const [rolBa, setRolBa] = useState("");
  /* El localStorage solo existe en el navegador: se lee después de montar. */
  useEffect(() => { setRolOl(rolInicial("ol", roles)); setRolBa(rolInicial("bavaria", roles)) }, [roles]);
  const escogeRol = (eq: Equipo, v: string) => {
    (eq === "ol" ? setRolOl : setRolBa)(v);
    try { localStorage.setItem("fiscal-rol-" + eq, v) } catch { /* no se pudo recordar: no pasa nada */ }
  };

  const r = revisar(form.hojas);
  /* Dónde cuenta ya cada persona. Una persona PUEDE contar en varias hojas (doble conteo): solo se avisa en la lista. */
  const donde = new Map<string, number[]>();
  for (const h of form.hojas) for (const id of [h.ol, h.bavaria]) if (id) donde.set(id, [...(donde.get(id) ?? []), h.numero]);
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
    const yaEn = del.filter((p) => donde.has(p.id)).length;
    return (
      <label className={"fi-rol " + (eq === "ol" ? "ol" : "ba")} key={eq}>
        <span><em className={"fi-bd " + (eq === "ol" ? "ol" : "ba")}>{eq === "ol" ? "OL" : "BA"}</em>{et}: buscar entre</span>
        <select value={rol} onChange={(e) => escogeRol(eq, e.target.value)}>
          <option value="">Todos los usuarios</option>
          {conteo.map((c) => <option key={c.clave} value={c.clave}>{c.nombre} ({c.n})</option>)}
        </select>
        <small>{del.length} {del.length === 1 ? "persona" : "personas"} · {yaEn} ya {yaEn === 1 ? "cuenta" : "cuentan"} en una hoja (puede repetirse: doble conteo)</small>
      </label>
    );
  };

  /* «Sin asignar» solo se ofrece si hay alguien que quitar; y lleva su propia clave para que la casilla
     vacía muestre «Teclea el nombre» y no «sin asignar». */
  const opcionesCasilla = (h: HojaForm, eq: Equipo) =>
    opcionesPersonas({ personas, roles, rol: rolDe(eq), ocupadas: new Set(eq === "ol" ? (h.bavaria ? [h.bavaria] : []) : (h.ol ? [h.ol] : [])), actual: h[eq], donde })
      .filter((o) => o.valor !== "" || h[eq] !== "")
      .map((o) => (o.valor === "" ? { ...o, valor: NADIE } : o));

  const casilla = (h: HojaForm, eq: Equipo, et: string) => (
    <div className={"fi-casilla " + (eq === "ol" ? "ol" : "ba")} key={eq}>
      <span className="fi-et"><em className={"fi-bd " + (eq === "ol" ? "ol" : "ba")}>{eq === "ol" ? "OL" : "BA"}</em>{et}</span>
      <Buscador
        valor={h[eq]}
        marcador="Teclea el nombre"
        sinOpciones="Nadie con ese rol. Cambia el rol de arriba."
        opciones={opcionesCasilla(h, eq)}
        onEscoge={(v) => cambia(ponerPersona(form.hojas, h.numero, eq, v === NADIE ? "" : v))}
      />
    </div>
  );

  return (
    <section className="fe-editor nuevo fi-form" aria-label={`${form.id ? "Editar" : "Nuevo"} ${T.el.replace(/^el /, "")}`}>
      <div className="fi-top">
        <h2>{form.id ? "Editar" : "Nuevo"} {T.el.replace(/^el /, "")}</h2>
        <div className="fi-prog" aria-label={`${r.completas} de ${r.total} parejas completas`}>
          <span><b>{r.completas}</b> de {r.total} {r.total === 1 ? "pareja completa" : "parejas completas"}</span>
          <div className="fi-bar" aria-hidden="true">
            <i className="ok" style={{ flexGrow: r.completas }} /><i className="me" style={{ flexGrow: r.aMedias }} /><i className="va" style={{ flexGrow: r.vacias }} />
          </div>
        </div>
      </div>
      <div className="fe-campos fi-g3">
        <label className="ancho">
          <span>Nombre</span>
          <input value={form.nombre} maxLength={80} placeholder={T.ejemplo}
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
        <div className="fi-fecha">
          <span className="fi-fecha-t">{form.fecha ? `${fechaConDia(form.fecha)} · ${textoCuando(hoy, form.fecha)}` : "Atajos"}</span>
          <span className="fi-atajos" role="group" aria-label="Atajos de fecha">
            <button type="button" className="btn plano" aria-pressed={form.fecha === hoy} onClick={() => ponFecha(hoy)}>Hoy</button>
            <button type="button" className="btn plano" aria-pressed={form.fecha === sumarDias(hoy, 1)} onClick={() => ponFecha(sumarDias(hoy, 1))}>Mañana</button>
            <button type="button" className="btn plano" aria-pressed={form.fecha === viernes} onClick={() => ponFecha(viernes)}>Viernes</button>
          </span>
        </div>
      </div>

      <h3 className="fi-t">Quién cuenta <small>filtra por rol y teclea el nombre</small></h3>
      <div className="fe-campos fi-roles">
        {filtroRol("ol", "Operador logístico")}
        {filtroRol("bavaria", "Bavaria")}
      </div>

      <h3 className="fi-t">Hojas y parejas <small>{textoResumen(r)}</small></h3>
      {(() => {
        const estadoDe = (h: HojaForm) => (h.ol && h.bavaria ? "ok" : h.ol || h.bavaria ? "me" : "va");
        const textoEstado = (h: HojaForm) => (h.ol && h.bavaria ? "Pareja completa" : h.ol ? "Falta Bavaria" : h.bavaria ? "Falta operador logístico" : "Sin nadie");
        const hAct = form.hojas.find((x) => x.numero === activa) ?? form.hojas[0];
        const agrega = (n: number) => {
          const nuevas = agregarHojas(form.hojas, n);
          cambia(nuevas);
          setActiva(nuevas.reduce((m, x) => Math.max(m, x.numero), 0));
        };
        const quita = (numero: number) => {
          const resto = quitarHoja(form.hojas, numero);
          cambia(resto);
          if (numero === (hAct?.numero ?? -1)) setActiva(resto.filter((x) => x.numero < numero).at(-1)?.numero ?? resto[0]?.numero ?? 1);
        };
        return (
          <>
            <div className="fi-tabs" role="tablist" aria-label="Hojas del inventario">
              {form.hojas.map((h) => {
                const rep = r.repetidas.size > 0 && [h.ol, h.bavaria].some((id) => id && r.repetidas.has(id));
                const on = hAct?.numero === h.numero;
                return (
                  <div key={h.numero} className={"fi-tab" + (on ? " on" : "") + (rep ? " mal" : "")}>
                    <button type="button" role="tab" aria-selected={on} id={`fi-tab-${h.numero}`} aria-controls="fi-cuerpo" className="fi-tab-b" onClick={() => setActiva(h.numero)}>
                      <span className={"fi-st " + estadoDe(h)} aria-hidden="true" />Hoja {h.numero}
                      <small>{h.calle ? `Calle ${h.calle}` : "Sin calle"}</small>
                      <span className="fi-sr">{textoEstado(h)}</span>
                    </button>
                    <button type="button" className="fi-tab-x" aria-label={`Quitar la hoja ${h.numero}`} onClick={() => quita(h.numero)}>×</button>
                  </div>
                );
              })}
              <button type="button" className="fi-mas" onClick={() => agrega(1)}>＋ Hoja</button>
              {pidiendo ? (
                <span className="fi-varias">
                  <input type="number" min={1} max={100} inputMode="numeric" value={cuantas} autoFocus
                         onChange={(e) => setCuantas(e.target.value)} aria-label="Cuántas hojas agregar"
                         onKeyDown={(e) => { if (e.key === "Enter") { agrega(Math.min(100, Math.max(1, Math.floor(Number(cuantas) || 1)))); setPidiendo(false) } if (e.key === "Escape") setPidiendo(false) }} />
                  <button type="button" className="fi-mas pleno" onClick={() => { agrega(Math.min(100, Math.max(1, Math.floor(Number(cuantas) || 1)))); setPidiendo(false) }}>Agregar</button>
                  <button type="button" className="fi-tab-x" aria-label="Cancelar" onClick={() => setPidiendo(false)}>×</button>
                </span>
              ) : <button type="button" className="fi-mas" onClick={() => setPidiendo(true)}>＋ Varias…</button>}
              <span className="fi-leyenda" aria-hidden="true"><i className="fi-st ok" />completa<i className="fi-st me" />a medias<i className="fi-st va" />sin nadie</span>
            </div>
            {hAct ? (
              <div className={"fi-cuerpo" + (r.repetidas.size > 0 && [hAct.ol, hAct.bavaria].some((id) => id && r.repetidas.has(id)) ? " mal" : "")} id="fi-cuerpo" role="tabpanel" aria-labelledby={`fi-tab-${hAct.numero}`}>
                <span className={"fi-est " + estadoDe(hAct)}>{textoEstado(hAct)}</span>
                {conCalle && (
                  <label className="fi-calle-sel">
                    <span>Calle donde se cuenta</span>
                    <select value={hAct.calle ?? ""} onChange={(e) => cambia(ponerCalle(form.hojas, hAct.numero, e.target.value))}>
                      <option value="">Sin calle todavía</option>
                      {CALLES.map((c) => <option key={c} value={c}>Calle {c}</option>)}
                    </select>
                  </label>
                )}
                {casilla(hAct, "ol", "Operador logístico")}
                {casilla(hAct, "bavaria", "Bavaria")}
                {conCalle && numeradosDe(hAct.calle).length >= 2 && (
                  <small className="fi-calle-nota">
                    El operador logístico cuenta de {numeradosDe(hAct.calle)[0]} a {numeradosDe(hAct.calle).at(-1)} y Bavaria de {numeradosDe(hAct.calle).at(-1)} a {numeradosDe(hAct.calle)[0]}: se cruzan a mitad de camino.
                  </small>
                )}
                {conFamilias && familias.length > 0 && (
                  <SelectorFamilias hoja={hAct.numero} familias={familias} marcadas={hAct.familias ?? []}
                    alAlternar={(n) => cambia(alternarFamilia(form.hojas, hAct.numero, n))}
                    alLimpiar={() => cambia(form.hojas.map((x) => (x.numero === hAct.numero ? { ...x, familias: [] } : x)))} />
                )}
              </div>
            ) : <p className="fi-vacio">No hay hojas. Toca «＋ Hoja» para agregar la primera.</p>}
          </>
        );
      })()}

      {(r.errores.length > 0 || mal) && (
        <div className="cl-mal" role="alert">
          {mal ?? "Revisa esto antes de guardar:"}
          {!mal && <ul>{r.errores.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
      )}
      <div className="fi-pie">
        <button type="button" className="btn plano" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
        <span className="fi-pie-nota">
          {r.errores.length === 0 && (r.aMedias > 0 || r.vacias > 0) && (<>
            {r.aMedias > 0 && <>{r.aMedias} {r.aMedias === 1 ? "hoja tiene" : "hojas tienen"} una sola persona. </>}
            {r.vacias > 0 && <>{r.vacias} {r.vacias === 1 ? "hoja no tiene" : "hojas no tienen"} a nadie todavía. </>}
            Se puede guardar así y completar después.
          </>)}
        </span>
        <button type="button" className="btn grande" disabled={!puede} onClick={onGuardar}>
          {ocupado ? "Guardando…" : form.id ? "Guardar los cambios" : `Guardar ${T.el}`}
        </button>
      </div>
    </section>
  );
}
