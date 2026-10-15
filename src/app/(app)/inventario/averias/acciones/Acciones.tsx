"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { TIPO, TIPOS, hlTxt, unTxt, type TipoNovedad } from "@/modulos/inventario/evidencias";
import {
  CIERRE, CIERRES, ESTADOS, diasDesde, resumen,
  type Accion, type EstadoAccion, type RegistroAccion,
} from "@/modulos/averias/acciones";

type Vista = "pendientes" | EstadoAccion | "todas";
const VISTAS: { k: Vista; nombre: string }[] = [
  { k: "pendientes", nombre: "Pendientes" },
  { k: "abierta", nombre: "Abiertas" },
  { k: "en_gestion", nombre: "En gestión" },
  { k: "cerrada", nombre: "Cerradas" },
  { k: "todas", nombre: "Todas" },
];
const NOMBRE_ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.k, e.nombre])) as Record<EstadoAccion, string>;

const fh = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : "—";
const nf = new Intl.NumberFormat("es-CO");
const siNo = (b: boolean | null) => (b == null ? "—" : b ? "Sí" : "No");
const hace = (d: number) => (d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`);

function titulo(a: Accion) {
  return a.ubicacion ?? "Sin ubicación";
}
function lugar(a: Accion) {
  return [a.calle && `Calle ${a.calle}`, a.modulo && `Módulo ${a.modulo}`, a.lado && a.lado].filter(Boolean).join(" · ");
}
function linea(a: Accion) {
  if (a.tipo === "mezclado") return "Módulo con materiales mezclados";
  if (a.tipo === "sin_acceso") return "No hubo acceso al módulo";
  const p = [a.codigo, a.material].filter(Boolean).join(" ");
  return `${p || "Sin material"}${a.cajas != null ? ` · ${nf.format(a.cajas)} cajas` : ""}`;
}

export function Acciones({ acciones, nombres, dias, rangos, desde, hasta, puedeEditar }: {
  acciones: Accion[]; nombres: Record<string, string>; dias: number; rangos: number[];
  desde: string; hasta: string; puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [avisar, avisos] = useAvisos();

  /* Lo que se acaba de guardar se ve al instante, sin esperar a que la página vuelva a leer. */
  const [cambios, setCambios] = useState<Record<string, RegistroAccion>>({});
  const [yo, setYo] = useState<Record<string, string>>({});
  const quienes = useMemo(() => ({ ...nombres, ...yo }), [nombres, yo]);
  useEffect(() => { setCambios({}) }, [acciones]);
  const todas = useMemo(() => acciones.map((a) => {
    const r = cambios[a.clave];
    return r ? { ...a, reg: r, estado: r.estado } : a;
  }), [acciones, cambios]);

  const [vista, setVista] = useState<Vista>("pendientes");
  const [tipo, setTipo] = useState<TipoNovedad | "todos">("todos");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const ficha = useRef<HTMLDivElement>(null);

  const r = useMemo(() => resumen(todas), [todas]);
  const porVista = useMemo(() => todas.filter((a) =>
    vista === "todas" ? true : vista === "pendientes" ? a.estado !== "cerrada" : a.estado === vista), [todas, vista]);
  const cuentaTipo = (k: TipoNovedad) => porVista.filter((a) => a.tipo === k).length;
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return porVista.filter((a) => (tipo === "todos" || a.tipo === tipo) && (!t ||
      [a.ubicacion, a.codigo, a.material, a.conteo, a.persona, a.reg?.documento, a.calle]
        .some((x) => String(x ?? "").toLowerCase().includes(t))));
  }, [porVista, tipo, q]);
  const actual = lista.find((a) => a.clave === sel) ?? lista[0] ?? null;

  const escoger = (clave: string) => {
    setSel(clave);
    if (window.matchMedia("(max-width: 900px)").matches) setTimeout(() => ficha.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };

  async function guardar(a: Accion, cambio: Partial<RegistroAccion>, ok: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const ahora = new Date().toISOString();
    const base: RegistroAccion = a.reg ?? {
      clave: a.clave, tipo: a.tipo, conteo_id: a.conteo_id, linea_id: a.linea_id, ubicacion_id: a.ubicacion_id,
      estado: "abierta", que_se_hizo: null, documento: null, comentario: null,
      gestion_por: null, gestion_en: null, cerrada_por: null, cerrada_en: null, actualizado_en: null,
    };
    const fila: RegistroAccion = { ...base, ...cambio, actualizado_en: ahora };
    if (cambio.estado === "en_gestion") { fila.gestion_por = user?.id ?? null; fila.gestion_en = ahora }
    if (cambio.estado === "cerrada") { fila.cerrada_por = user?.id ?? null; fila.cerrada_en = ahora }
    const { error } = await supabase.from("averias_acciones").upsert({ ...fila, actualizado_por: user?.id ?? null }, { onConflict: "clave" });
    if (error) { avisar.mal(error.message); return false }
    if (user?.id && !nombres[user.id]) setYo({ [user.id]: "Tú" });
    setCambios((c) => ({ ...c, [a.clave]: fila }));
    avisar.bien(ok);
    router.refresh();
    return true;
  }

  return (
    <>
      {avisos}
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · AVERÍAS · ACCIONES</p>
          <h1>Acciones del conteo</h1>
          <p className="sub">
            Todo lo que los muchachos identificaron en un <b>conteo guardado</b> —avería, PNC, módulo mezclado o
            sin acceso— entra aquí solo, como una acción abierta. Escoge una, mira dónde está y todo lo que se
            anotó, y ciérrala diciendo qué se hizo.
          </p>
        </div>
        <div className="kpi">
          <i className="corte" />
          <div className="rot">PENDIENTES</div>
          <div className="num">{r.abiertas + r.gestion}</div>
          <div className="pie">{r.abiertas} abiertas · {r.gestion} en gestión</div>
        </div>
      </section>

      <div className="avc-cifras">
        <div className={"avc-cif" + (r.abiertas ? " avc-mal" : "")}><span>Abiertas</span><b>{r.abiertas}</b></div>
        <div className={"avc-cif" + (r.gestion ? " avc-ojo" : "")}><span>En gestión</span><b>{r.gestion}</b></div>
        <div className="avc-cif avc-bien"><span>Cerradas</span><b>{r.cerradas}</b></div>
        <div className={"avc-cif" + (r.vieja >= 3 ? " avc-mal" : "")}><span>Más vieja sin cerrar</span><b>{r.hayPend ? `${r.vieja} ${r.vieja === 1 ? "día" : "días"}` : "—"}</b></div>
      </div>

      <div className="fe-barra avc-barra">
        <div className="fe-pes">
          {VISTAS.map((v) => {
            const n = v.k === "todas" ? todas.length : v.k === "pendientes" ? r.abiertas + r.gestion : todas.filter((a) => a.estado === v.k).length;
            return <button key={v.k} type="button" className={vista === v.k ? "on" : ""} onClick={() => setVista(v.k)}>{v.nombre} <em>{n}</em></button>;
          })}
        </div>
        <label className="fe-busca"><input type="search" placeholder="Buscar ubicación, código, material, conteo, documento…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>

      <div className="avc-filtros">
        <div className="avc-chips">
          <button type="button" className={tipo === "todos" ? "on" : ""} onClick={() => setTipo("todos")}>Todos los tipos <em>{porVista.length}</em></button>
          {TIPOS.map((t) => (
            <button key={t.k} type="button" className={tipo === t.k ? "on" : ""} onClick={() => setTipo(t.k)}>
              <i style={{ background: t.color }} />{t.nombre} <em>{cuentaTipo(t.k)}</em>
            </button>
          ))}
        </div>
        <div className="avc-rango">
          <span>Conteos de los últimos</span>
          {rangos.map((d) => <Link key={d} href={`?dias=${d}`} className={d === dias ? "on" : ""} scroll={false}>{d === 365 ? "12 meses" : `${d} días`}</Link>)}
          <small>{desde} a {hasta}</small>
        </div>
      </div>

      <div className="avc-split">
        <div className="avc-lista" role="list">
          {lista.length === 0 && (
            <p className="avc-vacio">{todas.length === 0 ? "No hay novedades en los conteos guardados de este rango." : "Nada con este filtro."}</p>
          )}
          {lista.map((a) => {
            const d = diasDesde(a.hora);
            return (
              <button key={a.clave} type="button" role="listitem" className={"avc-it" + (actual?.clave === a.clave ? " sel" : "")} onClick={() => escoger(a.clave)}>
                <i className="avc-barra-t" style={{ background: TIPO[a.tipo].color }} />
                <span className="avc-it-tx">
                  <b>{TIPO[a.tipo].nombre.toUpperCase()} · {titulo(a)}</b>
                  <small>{linea(a)}</small>
                  <small>{a.conteo} · {a.persona ?? "—"} · {a.estado === "cerrada" ? `cerrada ${fh(a.reg?.cerrada_en)}` : hace(d)}</small>
                </span>
                <span className={"avc-est " + a.estado}>{NOMBRE_ESTADO[a.estado]}</span>
              </button>
            );
          })}
        </div>

        <div className="avc-ficha" ref={ficha}>
          {actual
            ? <Ficha key={actual.clave + actual.estado} a={actual} nombres={quienes} puedeEditar={puedeEditar} supabase={supabase} guardar={guardar} />
            : <p className="avc-vacio">Escoge una acción de la lista.</p>}
        </div>
      </div>
    </>
  );
}

function Ficha({ a, nombres, puedeEditar, supabase, guardar }: {
  a: Accion; nombres: Record<string, string>; puedeEditar: boolean;
  supabase: ReturnType<typeof createClient>;
  guardar: (a: Accion, c: Partial<RegistroAccion>, ok: string) => Promise<boolean>;
}) {
  const [que, setQue] = useState(a.reg?.que_se_hizo ?? "");
  const [doc, setDoc] = useState(a.reg?.documento ?? "");
  const [coment, setComent] = useState(a.reg?.comentario ?? "");
  const [mandando, setMandando] = useState(false);
  const [falta, setFalta] = useState<string | null>(null);
  const [fotos, setFotos] = useState<string[] | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!a.rutas.length) { setFotos([]); return }
    supabase.storage.from("inventario").createSignedUrls(a.rutas, 1800).then(({ data }) => {
      if (vivo) setFotos((data ?? []).map((x) => x.signedUrl).filter(Boolean) as string[]);
    });
    return () => { vivo = false };
  }, [a.rutas, supabase]);

  const t = TIPO[a.tipo];
  const d = diasDesde(a.hora);
  const cerrada = a.estado === "cerrada";
  const reg = a.reg;
  const quien = (id: string | null | undefined) => (id ? nombres[id] ?? "—" : "—");

  async function cerrar() {
    const c = CIERRE[que];
    if (!c) { setFalta("Escoge qué se hizo."); return }
    if (c.doc && !doc.trim()) { setFalta("Escribe el N° de documento de la baja."); return }
    if (c.coment && !coment.trim()) { setFalta("Escribe en el comentario por qué no procede."); return }
    setFalta(null); setMandando(true);
    await guardar(a, { estado: "cerrada", que_se_hizo: que, documento: doc.trim() || null, comentario: coment.trim() || null }, "Acción cerrada.");
    setMandando(false);
  }
  async function gestion() {
    setMandando(true);
    await guardar(a, { estado: "en_gestion", comentario: coment.trim() || a.reg?.comentario || null }, "Pasó a En gestión.");
    setMandando(false);
  }
  async function reabrir() {
    setMandando(true);
    await guardar(a, { estado: "abierta", que_se_hizo: null, documento: null, cerrada_por: null, cerrada_en: null }, "Acción reabierta.");
    setMandando(false);
  }

  return (
    <>
      <div className="avc-f-cab">
        <span className={"avc-tag t-" + a.tipo} style={{ background: t.color }}>{t.nombre.toUpperCase()}</span>
        <span className={"avc-est " + a.estado}>{NOMBRE_ESTADO[a.estado]}{!cerrada && ` · ${hace(d)}`}</span>
      </div>
      <h2>{titulo(a)}</h2>
      {lugar(a) && <p className="avc-lugar">{lugar(a)}</p>}
      <p className="avc-meta">Conteo <b>{a.conteo}</b> · contó <b>{a.persona ?? "—"}</b> · {fh(a.hora)}</p>

      <dl className="avc-datos">
        {a.tipo === "averia" || a.tipo === "pnc" ? <>
          <div><dt>Código</dt><dd>{a.codigo ?? "—"}</dd></div>
          <div><dt>Material</dt><dd>{a.material ?? "—"}</dd></div>
          <div><dt>Cajas</dt><dd>{a.cajas != null ? nf.format(a.cajas) : "—"}</dd></div>
          <div><dt>Unidades · hl</dt><dd>{unTxt(a.unidades)} · {hlTxt(a.hl)}</dd></div>
        </> : <>
          <div><dt>Qué se encontró</dt><dd>{a.tipo === "mezclado" ? "Módulo con materiales mezclados" : "No hubo acceso al módulo"}</dd></div>
          <div><dt>Día del conteo</dt><dd>{a.dia.split("-").reverse().join("/")}</dd></div>
        </>}
        {a.tipo === "pnc" && <>
          <div><dt>Tiene rótulo</dt><dd>{siNo(a.pnc_rotulo)}</dd></div>
          <div><dt>Bloqueo mecánico</dt><dd>{siNo(a.pnc_bloqueo_mecanico)}</dd></div>
          <div><dt>Cumple</dt><dd className={a.cumple === false ? "mal" : a.cumple ? "bien" : ""}>{siNo(a.cumple)}</dd></div>
        </>}
      </dl>

      <div className="avc-fotos">
        {fotos === null && <span className="avc-gris">Cargando foto…</span>}
        {fotos?.length === 0 && <span className="avc-gris">Sin foto en el conteo.</span>}
        {fotos?.map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Foto ${i + 1} de ${titulo(a)}`} /></a>
        ))}
      </div>

      {cerrada ? (
        <div className="avc-cierre hecho">
          <b>CERRADA</b>
          <p>{CIERRE[reg?.que_se_hizo ?? ""]?.nombre ?? reg?.que_se_hizo ?? "—"}{reg?.documento && <> · documento <b>{reg.documento}</b></>}</p>
          {reg?.comentario && <p className="avc-gris">«{reg.comentario}»</p>}
          {puedeEditar && <button type="button" className="btn plano" disabled={mandando} onClick={reabrir}>Reabrir</button>}
        </div>
      ) : puedeEditar ? (
        <div className="avc-cierre">
          <b>CERRAR LA ACCIÓN</b>
          <label><span>Qué se hizo</span>
            <select value={que} onChange={(e) => setQue(e.target.value)}>
              <option value="">Escoge…</option>
              {CIERRES.map((c) => <option key={c.k} value={c.k}>{c.nombre}</option>)}
            </select>
          </label>
          {CIERRE[que]?.doc && (
            <label><span>N° documento de baja</span><input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Ej. 4900123456" inputMode="numeric" /></label>
          )}
          <label><span>Comentario{CIERRE[que]?.coment ? " (obligatorio)" : ""}</span>
            <textarea rows={2} value={coment} onChange={(e) => setComent(e.target.value)} placeholder="Qué se encontró, con quién se habló…" />
          </label>
          {falta && <p className="avc-falta">{falta}</p>}
          <div className="avc-botones">
            <button type="button" className="btn" disabled={mandando} onClick={cerrar}>Cerrar acción</button>
            {a.estado === "abierta" && <button type="button" className="btn plano" disabled={mandando} onClick={gestion}>Pasar a En gestión</button>}
          </div>
        </div>
      ) : <p className="avc-gris">Puedes ver las acciones, pero no cerrarlas.</p>}

      <ol className="avc-tl">
        <li><i />{fh(a.hora)} · Detectada en el conteo {a.conteo} por {a.persona ?? "—"}</li>
        {reg?.gestion_en && <li><i />{fh(reg.gestion_en)} · En gestión ({quien(reg.gestion_por)})</li>}
        {reg?.cerrada_en && cerrada && <li><i className="ok" />{fh(reg.cerrada_en)} · Cerrada por {quien(reg.cerrada_por)}</li>}
      </ol>
    </>
  );
}
