"use client";

/**
 * INVENTARIO · CORTE DE LÍNEAS.
 *
 * Antes de contar se «corta» cada línea (L1, L2, L4, L6): a una hora, las
 * cajas que han pasado por la depaletizadora, de dónde estaban tomando y
 * dónde estaban ubicados (calle · módulo · lado, con cuántas estibas o
 * cajas hay). Ese es el INICIAL. Después se hace el FINAL, y de la resta
 * sale la diferencia (las cuentas están en `modulos/inventario/corte.ts`).
 *
 * SE LLENA DE PIE, EN EL CELULAR, frente al módulo: una línea por tarjeta,
 * los tres pasos de la ubicación en tres casillas, y el final trae ya
 * puestos los módulos del inicial —solo hay que cambiar las cantidades—.
 *
 * Una línea que no se toca NO se corta (no todas corren a la vez). Una
 * línea a medias sí avisa qué le falta, por su nombre.
 *
 * QUIÉN PUEDE lo decide la base (inv_corte_guardar pide editar
 * «/inventario/corte»); esconder botones aquí es comodidad, no seguridad.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { analizar, duracion, type Corte as CorteT, type Lado, type Sitio, type Unidad } from "@/modulos/inventario/corte";

export type UbiC = { id: string; calle: string; modulo: string; lado: "IZQ" | "DER" | null };
export type MatC = { id: string; sku: string; nombre: string; cajas_por_estiba: number | null };
export type LineaC = { clave: string; nombre: string };

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const fmt = (n: number) => nf.format(n);
const conSigno = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));

/* «30/09/2026 06:00» (sin la coma que mete toLocaleString) y siempre en la
   hora de Colombia, que es la del reloj de la bodega. */
const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(", ", " ");

/* «2026-09-30T06:00» para el <input type=datetime-local>, en la hora de
   Colombia: la bodega piensa en su reloj, no en el del servidor. */
function aInput(iso: string): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
  return p.replace(" ", "T");
}
/* De vuelta: Colombia no tiene horario de verano, siempre es UTC−5. */
const deInput = (s: string): string | null => {
  const d = new Date(s + ":00-05:00");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const ordenCalle = (a: string, b: string) => a.length - b.length || a.localeCompare(b, "es", { numeric: true });

type SitioF = { calle: string; modulo: string; lado: string; cant: string; unidad: Unidad };
type LineaF = { cajas: string; material: string; origen: SitioF; destino: SitioF };
const sitioVacio = (unidad: Unidad = "estibas"): SitioF => ({ calle: "", modulo: "", lado: "", cant: "", unidad });
const lineaVacia = (): LineaF => ({ cajas: "", material: "", origen: sitioVacio(), destino: sitioVacio() });
/* UNA LÍNEA ESTÁ «TOCADA» si alguien escribió algo en ella: cajas o
   cantidades, o si cambió el módulo o el material respecto de cómo
   arrancó. En el final los módulos vienen puestos del inicial: una línea
   que solo trae eso NO se tocó, y no se exige ni se guarda. */
const lugar = (s: SitioF) => `${s.calle}|${s.modulo}|${s.lado}`;
const tocada = (l: LineaF, base: LineaF) =>
  !!(l.cajas.trim() || l.origen.cant.trim() || l.destino.cant.trim() ||
     l.material.trim() !== base.material.trim() ||
     lugar(l.origen) !== lugar(base.origen) || lugar(l.destino) !== lugar(base.destino));

const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "" || !/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

export function Corte({ bodegaId, lineas, ubicaciones, materiales, cortes, nombres, puedeEditar, manda, ahora }: {
  bodegaId: string;
  lineas: LineaC[];
  ubicaciones: UbiC[];
  materiales: MatC[];
  /** Todos los cortes con sus renglones, el más reciente primero. */
  cortes: CorteT[];
  nombres: Record<string, string>;
  puedeEditar: boolean;
  manda: boolean;
  /** «Ahora», del servidor: que la hora por defecto no dependa del reloj del teléfono. */
  ahora: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<null | { tipo: "inicial" | "final"; inicial: CorteT | null }>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<string | null>(null);

  const finalDe = useMemo(() => new Map(cortes.filter((c) => c.tipo === "final").map((c) => [c.inicial_id!, c])), [cortes]);
  const abiertos = cortes.filter((c) => c.tipo === "inicial" && !finalDe.has(c.id));
  const cerrados = cortes.filter((c) => c.tipo === "inicial" && finalDe.has(c.id));

  const ubi = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones]);
  const mat = useMemo(() => new Map(materiales.map((m) => [m.id, m])), [materiales]);
  const porEstiba = (id: string | null) => (id ? mat.get(id)?.cajas_por_estiba ?? null : null);
  const nombreUbi = (id: string) => {
    const u = ubi.get(id);
    return u ? `${u.calle} · ${u.modulo} · ${u.lado ?? "—"}` : "—";
  };
  const nombreLinea = (c: string) => lineas.find((l) => l.clave === c)?.nombre ?? c;

  async function eliminar(id: string) {
    setMal(null); setAviso(null); setOcupado(true);
    const { error } = await createClient().rpc("inv_corte_eliminar", { p_id: id });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setBorrar(null);
    setAviso("Corte eliminado.");
    router.refresh();
  }

  if (form) {
    return (
      <FormCorte
        tipo={form.tipo} inicial={form.inicial} bodegaId={bodegaId} lineas={lineas}
        ubicaciones={ubicaciones} materiales={materiales} ahora={ahora}
        nombreUbi={nombreUbi}
        onCerrar={() => setForm(null)}
        onGuardado={(t) => {
          setForm(null);
          setAviso(t === "inicial"
            ? "Corte inicial guardado. Cuando llegue la hora, haz el corte final."
            : "Corte final guardado. Abajo está la diferencia.");
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="cl">
      {aviso && <p className="cl-ok" role="status">{aviso}</p>}
      {mal && <p className="cl-mal" role="alert">{mal}</p>}

      {puedeEditar && (
        <div className="cl-acciones">
          <button type="button" className="btn grande" onClick={() => { setMal(null); setAviso(null); setForm({ tipo: "inicial", inicial: null }) }}>
            Nuevo corte inicial
          </button>
        </div>
      )}

      <h2 className="cl-h">Esperando el corte final <span>{abiertos.length}</span></h2>
      {abiertos.length === 0 ? (
        <p className="fe-vacio">No hay cortes iniciales abiertos. Empieza uno con «Nuevo corte inicial».</p>
      ) : (
        <div className="fe-lista">
          {abiertos.map((c) => (
            <article key={c.id} className="fe-fila cl-abierto">
              <div className="cl-cab">
                <b className="cl-hora">Inicial · {hora(c.cortado_en)}</b>
                <span className="cl-quien">{c.creado_por ? nombres[c.creado_por] ?? "—" : "—"}</span>
              </div>
              <p className="cl-res">
                {c.renglones.map((r) => `${r.linea} ${fmt(r.cajas_depa)}`).join(" · ")}
              </p>
              {c.nota && <p className="cl-nota">{c.nota}</p>}
              <div className="cl-botones">
                {puedeEditar && (
                  <button type="button" className="btn" onClick={() => { setMal(null); setAviso(null); setForm({ tipo: "final", inicial: c }) }}>
                    Hacer el corte final
                  </button>
                )}
                {manda && (borrar === c.id ? (
                  <span className="cl-conf">¿Eliminar este corte?
                    <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => eliminar(c.id)}>Sí, eliminar</button>
                    <button type="button" className="btn plano" onClick={() => setBorrar(null)}>No</button>
                  </span>
                ) : (
                  <button type="button" className="btn plano" onClick={() => setBorrar(c.id)}>Eliminar</button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="cl-h">La diferencia <span>{cerrados.length}</span></h2>
      {cerrados.length === 0 ? (
        <p className="fe-vacio">Todavía no hay cortes cerrados. Cuando hagas el final de uno, aquí sale cuánto pasó y cuánto se movió.</p>
      ) : (
        <div className="fe-lista">
          {cerrados.map((ini) => {
            const fin = finalDe.get(ini.id)!;
            const a = analizar(ini, fin, porEstiba);
            return (
              <article key={ini.id} className="fe-fila cl-par">
                <div className="cl-cab">
                  <b className="cl-hora">{hora(ini.cortado_en)} → {hora(fin.cortado_en)}</b>
                  <span className="cl-quien">{duracion(a.horas)} · {fmt(a.totalPasadas)} cajas por la depa</span>
                </div>
                {a.filas.map((f) => (
                  <section key={f.linea} className="cl-linea" aria-label={nombreLinea(f.linea)}>
                    <header>
                      <b>{f.linea}</b>
                      <span className="cl-pasadas">
                        {f.contadorAtras
                          ? <>El contador <b>retrocedió</b> ({fmt(f.ini)} → {fmt(f.fin)}): revisa si se reinició o se digitó mal</>
                          : <><b>{fmt(f.pasadas)}</b> cajas por la depa <i>({fmt(f.ini)} → {fmt(f.fin)})</i></>}
                      </span>
                    </header>
                    <LadoFila titulo="Tomando de" ini={ini} fin={fin} linea={f.linea} cual="origen" lado={f.origen}
                              accion="bajó" nombreUbi={nombreUbi} />
                    <LadoFila titulo="Ubicados en" ini={ini} fin={fin} linea={f.linea} cual="destino" lado={f.destino}
                              accion="subió" nombreUbi={nombreUbi} />
                  </section>
                ))}
                {(a.soloInicial.length > 0 || a.soloFinal.length > 0) && (
                  <p className="cl-nota">
                    {a.soloInicial.length > 0 && <>Solo se cortó en el inicial: <b>{a.soloInicial.join(", ")}</b>. </>}
                    {a.soloFinal.length > 0 && <>Solo se cortó en el final: <b>{a.soloFinal.join(", ")}</b>. </>}
                    Esas líneas no se pueden restar.
                  </p>
                )}
                {(ini.nota || fin.nota) && <p className="cl-nota">{[ini.nota, fin.nota].filter(Boolean).join(" · ")}</p>}
                {manda && (
                  <div className="cl-botones">
                    {borrar === ini.id ? (
                      <span className="cl-conf">¿Eliminar el inicial y el final?
                        <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => eliminar(ini.id)}>Sí, eliminar</button>
                        <button type="button" className="btn plano" onClick={() => setBorrar(null)}>No</button>
                      </span>
                    ) : (
                      <button type="button" className="btn plano" onClick={() => setBorrar(ini.id)}>Eliminar el par</button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Una fila «Tomando de / Ubicados en» del análisis: el módulo, de cuánto a
   cuánto, cuánto se movió y la diferencia con lo que contó la depa. */
function LadoFila({ titulo, ini, fin, linea, cual, lado, accion, nombreUbi }: {
  titulo: string; ini: CorteT; fin: CorteT; linea: string; cual: "origen" | "destino"; lado: Lado;
  accion: "bajó" | "subió"; nombreUbi: (id: string) => string;
}) {
  const a = ini.renglones.find((r) => r.linea === linea)?.[cual] ?? null;
  const b = fin.renglones.find((r) => r.linea === linea)?.[cual] ?? null;
  const cant = (s: Sitio | null) => (s ? `${fmt(s.cant)} ${s.unidad}` : "—");
  const mismo = a && b && a.ubicacion_id === b.ubicacion_id;
  return (
    <div className="cl-lado">
      <span className="cl-t">{titulo}</span>
      <span className="cl-ubi">
        {mismo ? nombreUbi(a!.ubicacion_id)
          : <>{a ? nombreUbi(a.ubicacion_id) : "—"} <i>→</i> {b ? nombreUbi(b.ubicacion_id) : "—"}</>}
      </span>
      <span className="cl-cant">{cant(a)} <i>→</i> {cant(b)}</span>
      {lado.dif !== null && lado.mov !== null ? (
        <span className={"cl-dif " + (Math.abs(lado.dif) < 0.5 ? "bien" : "mal")}>
          {accion} {fmt(lado.mov)} cajas · <b>diferencia {Math.abs(lado.dif) < 0.5 ? "0" : conSigno(lado.dif)}</b>
        </span>
      ) : (
        <span className="cl-dif sin">{lado.motivo}</span>
      )}
    </div>
  );
}

/* ===================================================================
   EL FORMULARIO DE UN CORTE (inicial o final)
   =================================================================== */
function FormCorte({ tipo, inicial, bodegaId, lineas, ubicaciones, materiales, ahora, nombreUbi, onCerrar, onGuardado }: {
  tipo: "inicial" | "final"; inicial: CorteT | null; bodegaId: string; lineas: LineaC[];
  ubicaciones: UbiC[]; materiales: MatC[]; ahora: string; nombreUbi: (id: string) => string;
  onCerrar: () => void; onGuardado: (t: "inicial" | "final") => void;
}) {
  const ubi = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones]);
  const etiqueta = (m: MatC) => `${m.sku} · ${m.nombre}`;
  const calles = useMemo(() => [...new Set(ubicaciones.map((u) => u.calle))].sort(ordenCalle), [ubicaciones]);
  const modulosDe = (calle: string) =>
    [...new Set(ubicaciones.filter((u) => u.calle === calle).map((u) => u.modulo))]
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const ladosDe = (calle: string, modulo: string) =>
    ubicaciones.filter((u) => u.calle === calle && u.modulo === modulo).map((u) => u.lado ?? "");
  const resolver = (s: SitioF): UbiC | null =>
    ubicaciones.find((u) => u.calle === s.calle && u.modulo === s.modulo && (u.lado ?? "") === s.lado) ?? null;

  /* EL FINAL ARRANCA CON LO DEL INICIAL: los mismos módulos, la misma
     unidad y el mismo material. Solo faltan las cantidades. */
  const desdeSitio = (s: Sitio | null): SitioF => {
    const u = s ? ubi.get(s.ubicacion_id) : null;
    return u ? { calle: u.calle, modulo: u.modulo, lado: u.lado ?? "", cant: "", unidad: s!.unidad } : sitioVacio();
  };
  const [base] = useState<Record<string, LineaF>>(() => armarBase());
  const [filas, setFilas] = useState<Record<string, LineaF>>(base);
  function armarBase(): Record<string, LineaF> {
    const o: Record<string, LineaF> = {};
    for (const l of lineas) {
      const r = inicial?.renglones.find((x) => x.linea === l.clave);
      o[l.clave] = r
        ? { cajas: "", material: (() => { const m = materiales.find((x) => x.id === r.material_id); return m ? etiqueta(m) : "" })(),
            origen: desdeSitio(r.origen), destino: desdeSitio(r.destino) }
        : lineaVacia();
    }
    return o;
  }
  const [cuando, setCuando] = useState(() => aInput(ahora));
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [faltan, setFaltan] = useState<string[]>([]);

  const cambia = (clave: string, f: (l: LineaF) => LineaF) =>
    setFilas((p) => ({ ...p, [clave]: f(p[clave]) }));

  const matDe = (txt: string): MatC | null => {
    const t = txt.trim();
    if (!t) return null;
    return materiales.find((m) => etiqueta(m) === t) ?? materiales.find((m) => m.sku === t.split(" ")[0]) ?? null;
  };

  function armar() {
    const falta: string[] = [];
    const renglones: Record<string, unknown>[] = [];
    for (const l of lineas) {
      const f = filas[l.clave];
      if (!tocada(f, base[l.clave])) continue;
      const aqui: string[] = [];
      const cajas = num(f.cajas);
      if (cajas === null || !Number.isInteger(cajas)) aqui.push("las cajas de la depa (un número entero)");
      const sitios: Record<string, unknown> = {};
      for (const [k, s, nom] of [["origen", f.origen, "de dónde tomaba"], ["destino", f.destino, "dónde estaba ubicado"]] as const) {
        const u = resolver(s), c = num(s.cant);
        if (!u) aqui.push(`${nom} (calle, módulo y lado)`);
        else if (c === null) aqui.push(`cuántas ${s.unidad} hay ${k === "origen" ? "donde tomaba" : "donde estaba ubicado"}`);
        else sitios[k] = { ubicacion_id: u.id, cant: c, unidad: s.unidad };
      }
      if (f.material.trim() && !matDe(f.material)) aqui.push("el material (escoge uno de la lista o déjalo vacío)");
      if (aqui.length) falta.push(`${l.clave}: ${aqui.join(", ")}`);
      else renglones.push({ linea: l.clave, cajas_depa: cajas, material_id: matDe(f.material)?.id ?? null, ...sitios });
    }
    if (!falta.length && renglones.length === 0) falta.push("Llena al menos una línea");
    const iso = deInput(cuando);
    if (!iso) falta.push("La fecha y la hora del corte");
    else if (Date.parse(iso) > Date.parse(ahora) + 10 * 60000) falta.push("La hora del corte no puede ser del futuro");
    else if (inicial && Date.parse(iso) <= Date.parse(inicial.cortado_en)) falta.push(`El final tiene que ser después del inicial (${hora(inicial.cortado_en)})`);
    return { falta, renglones, iso };
  }

  async function guardar() {
    setMal(null);
    const { falta, renglones, iso } = armar();
    setFaltan(falta);
    if (falta.length) return;
    setOcupado(true);
    const { error } = await createClient().rpc("inv_corte_guardar", {
      p_bodega: bodegaId, p_tipo: tipo, p_inicial: inicial?.id ?? null,
      p_cortado: iso, p_nota: nota.trim() || null, p_renglones: renglones,
    });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    onGuardado(tipo);
  }

  const bloque = (clave: string, k: "origen" | "destino", titulo: string, ayuda: string) => {
    const s = filas[clave][k];
    const mods = s.calle ? modulosDe(s.calle) : [];
    const lados = s.calle && s.modulo ? ladosDe(s.calle, s.modulo) : [];
    const cambiaSitio = (p: Partial<SitioF>) => cambia(clave, (l) => ({ ...l, [k]: { ...l[k], ...p } }));
    return (
      <fieldset className="cl-sitio">
        <legend>{titulo}<i>{ayuda}</i></legend>
        <label>
          <span>Calle</span>
          <select value={s.calle} onChange={(e) => cambiaSitio({ calle: e.target.value, modulo: "", lado: "" })}>
            <option value="">—</option>
            {calles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span>Módulo</span>
          <select value={s.modulo} disabled={!s.calle}
                  onChange={(e) => {
                    const m = e.target.value;
                    const ls = m ? ladosDe(s.calle, m) : [];
                    /* UN SOLO LADO POSIBLE: se pone solo. */
                    cambiaSitio({ modulo: m, lado: ls.length === 1 ? ls[0] : "" });
                  }}>
            <option value="">—</option>
            {mods.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          <span>Lado</span>
          <select value={s.lado} disabled={!s.modulo || lados.length <= 1}
                  onChange={(e) => cambiaSitio({ lado: e.target.value })}>
            {lados.length > 1 && <option value="">—</option>}
            {lados.map((x) => <option key={x || "solo"} value={x}>{x || "único"}</option>)}
          </select>
        </label>
        <label className="cl-cant-c">
          <span>¿Cuántas hay?</span>
          <input inputMode="decimal" value={s.cant} placeholder="0" onChange={(e) => cambiaSitio({ cant: e.target.value })} />
        </label>
        <div className="cl-unidad" role="group" aria-label="Unidad">
          {(["estibas", "cajas"] as const).map((u) => (
            <button key={u} type="button" className={s.unidad === u ? "on" : ""} aria-pressed={s.unidad === u}
                    onClick={() => cambiaSitio({ unidad: u })}>{u === "estibas" ? "Estibas" : "Cajas"}</button>
          ))}
        </div>
        {resolver(s) && <p className="cl-eco">{nombreUbi(resolver(s)!.id)}</p>}
      </fieldset>
    );
  };

  return (
    <div className="cl">
      <div className="cl-forma-cab">
        <h2 className="cl-h">{tipo === "inicial" ? "Corte inicial" : `Corte final del de las ${hora(inicial!.cortado_en)}`}</h2>
        <button type="button" className="btn plano" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
      </div>
      <p className="cl-sub">
        {tipo === "inicial"
          ? "Anota cada línea como está AHORA. Las líneas que no toques no se cortan."
          : "Los módulos vienen del corte inicial: cambia los que hayan cambiado y anota las cantidades de ahora."}
      </p>

      <label className="cl-cuando">
        <span>Fecha y hora del corte</span>
        <input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} />
      </label>

      {lineas.map((l) => {
        const f = filas[l.clave];
        return (
          <section key={l.clave} className={"cl-tarjeta" + (tocada(f, base[l.clave]) ? " on" : "")} aria-label={l.nombre}>
            <header><b>{l.clave}</b><span>{l.nombre}</span></header>
            <label className="cl-depa">
              <span>Cajas que han pasado por la depa</span>
              <input inputMode="numeric" value={f.cajas} placeholder="Ej. 18801"
                     onChange={(e) => cambia(l.clave, (x) => ({ ...x, cajas: e.target.value }))} />
            </label>
            {bloque(l.clave, "origen", "Tomando de", "el módulo de donde saca la línea")}
            {bloque(l.clave, "destino", "Ubicados en", "el módulo donde queda lo que sale")}
            <label className="cl-mat">
              <span>Material <em>(opcional: pasa las estibas a cajas)</em></span>
              <input list={"mat-" + l.clave} value={f.material} placeholder="Código o nombre"
                     onChange={(e) => cambia(l.clave, (x) => ({ ...x, material: e.target.value }))} />
              <datalist id={"mat-" + l.clave}>
                {materiales.map((m) => <option key={m.id} value={etiqueta(m)} />)}
              </datalist>
            </label>
          </section>
        );
      })}

      <label className="cl-cuando">
        <span>Nota <em>(opcional)</em></span>
        <input value={nota} maxLength={200} placeholder="Ej. L4 parada por mantenimiento"
               onChange={(e) => setNota(e.target.value)} />
      </label>

      {faltan.length > 0 && (
        <div className="cl-mal" role="alert">
          <b>Falta:</b>
          <ul>{faltan.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      {mal && <p className="cl-mal" role="alert">{mal}</p>}

      <div className="cl-guardar">
        <button type="button" className="btn grande" onClick={guardar} disabled={ocupado}>
          {ocupado ? "Guardando…" : tipo === "inicial" ? "Guardar el corte inicial" : "Guardar el corte final"}
        </button>
      </div>
    </div>
  );
}
