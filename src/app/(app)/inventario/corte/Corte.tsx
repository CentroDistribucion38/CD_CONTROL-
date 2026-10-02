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

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { esFalloDeRed, guardarCola, leerCola, vaciarCola, type ItemCola, type Resultado } from "@/modulos/inventario/cola";
import { sinModulos, envaseDelRenglon, type ConteoRef, type Corte as CorteT, type LineaConteo, type Sitio, type Unidad } from "@/modulos/inventario/corte";
import { Historial } from "./Historial";
import { Proceso } from "./Proceso";

export type UbiC = { id: string; calle: string; modulo: string; lado: "IZQ" | "DER" | null };
export type MatC = { id: string; sku: string; nombre: string; cajas_por_estiba: number | null; unidades_por_caja: number | null; tipo: "PRODUCTO" | "ENVASE"; envase_sku?: string | null };
export type LineaC = { clave: string; nombre: string };

/* UN CORTE QUE NO SE PUDO MANDAR: lo mismo que recibe inv_corte_guardar, tal
   cual. Se guarda en el teléfono y se manda entero cuando vuelve la señal:
   un corte es una sola llamada, así que o llega completo o no llega. */
export type PendCorte = {
  bodega: string; tipo: "inicial" | "final"; inicial: string | null;
  cortado: string; nota: string | null; renglones: unknown[];
};
type ItemCorte = ItemCola<PendCorte>;

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
/* `envase` es lo que ENTRA a la línea (se toma del origen); `material` es el
   PRODUCTO que sale (queda ubicado en el destino). */
type LineaF = { cajas: string; material: string; envase: string; origen: SitioF[]; destino: SitioF[] };
const sitioVacio = (unidad: Unidad = "cajas"): SitioF => ({ calle: "", modulo: "", lado: "", cant: "", unidad });
const lineaVacia = (): LineaF => ({ cajas: "", material: "", envase: "", origen: [sitioVacio()], destino: [sitioVacio()] });
/* UNA LÍNEA ESTÁ «TOCADA» si alguien escribió algo en ella: cajas o
   cantidades, o si cambió el módulo o el material respecto de cómo
   arrancó. En el final los módulos vienen puestos del inicial: una línea
   que solo trae eso NO se tocó, y no se exige ni se guarda. */
const lugar = (s: SitioF) => `${s.calle}|${s.modulo}|${s.lado}`;
const lugares = (l: SitioF[]) => l.map(lugar).join(";");
const tocada = (l: LineaF, base: LineaF) =>
  !!(l.cajas.trim() || l.origen.some((s) => s.cant.trim()) || l.destino.some((s) => s.cant.trim()) ||
     l.material.trim() !== base.material.trim() || l.envase.trim() !== base.envase.trim() ||
     lugares(l.origen) !== lugares(base.origen) || lugares(l.destino) !== lugares(base.destino));

const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "" || !/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

export function Corte({ bodegaId, lineas, ubicaciones, materiales, cortes, nombres, puedeEditar, manda, verDiferencia, ahora, conteos = [], lineasConteo = [], manualInicial = false }: {
  /** Abrir de entrada «anotar también dónde quedó ubicado» (por defecto cerrado: solo se anota de dónde se toma). */
  manualInicial?: boolean;
  bodegaId: string;
  lineas: LineaC[];
  ubicaciones: UbiC[];
  materiales: MatC[];
  /** Todos los cortes con sus renglones, el más reciente primero. */
  cortes: CorteT[];
  nombres: Record<string, string>;
  puedeEditar: boolean;
  manda: boolean;
  /** La diferencia (el análisis) es de quien administra: quien hace los cortes llega hasta el corte final. */
  verDiferencia: boolean;
  /** «Ahora», del servidor: que la hora por defecto no dependa del reloj del teléfono. */
  ahora: string;
  /** Los conteos ENVIADOS de la bodega y sus renglones, para comparar el corte contra el inventario. */
  conteos?: ConteoRef[];
  lineasConteo?: LineaConteo[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<null | { tipo: "inicial" | "final"; inicial: CorteT | null }>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<string | null>(null);

  /* ---------- LOS CORTES SIN SEÑAL ----------
     Mismo trato que Contar: el corte que no se pudo mandar queda en ESTE
     teléfono y se manda solo al volver la señal, o con «Enviar ahora». La
     lógica (orden, qué es red, qué es duplicado) es la de
     modulos/inventario/cola.ts, ya probada. */
  const llaveCola = `corte.cola.${bodegaId}`;
  const [cola, setCola] = useState<ItemCorte[]>([]);
  const colaRef = useRef<ItemCorte[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [enviandoCola, setEnviandoCola] = useState(false);
  const colaOcupada = useRef(false);

  function ponerCola(nueva: ItemCorte[]) {
    colaRef.current = nueva;
    setCola(nueva);
    guardarCola(llaveCola, nueva);
  }

  function encolar(p: PendCorte) {
    const claves = [...new Set(p.renglones.map((r) => (r as { linea: string }).linea))];
    const it: ItemCorte = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      t: Date.now(), bb: p, sku: `Corte ${p.tipo}`, lugar: claves.join(", "), ubicacionId: null,
    };
    ponerCola([...colaRef.current, it]);
    setForm(null); setMal(null);
    setAviso("Sin señal: el corte quedó guardado en este teléfono y se envía solo cuando vuelva.");
  }

  async function enviarCola(manual = false) {
    if (colaOcupada.current) return;
    const pend = colaRef.current;
    if (pend.length === 0) return;
    if (!navigator.onLine) {
      if (manual) setMal("Todavía no hay señal. Los cortes siguen guardados en este teléfono.");
      return;
    }
    colaOcupada.current = true; setEnviandoCola(true);
    try {
      const supabase = createClient();
      const r = await vaciarCola(pend, async (it): Promise<Resultado> => {
        const p = it.bb;
        /* LA SEÑAL PUDO CAERSE DESPUÉS DE QUE EL INICIAL LLEGÓ, antes de la
           respuesta: mandarlo otra vez lo duplicaría (la base solo impide
           un segundo FINAL). Un inicial de esa bodega a esa misma hora ES
           ese mismo corte. */
        if (p.tipo === "inicial") {
          const { data, error } = await supabase.from("inv_cortes").select("id")
            .eq("bodega_id", p.bodega).eq("tipo", "inicial").eq("cortado_en", p.cortado).limit(1);
          if (error) return esFalloDeRed(error.message) ? { red: true } : { error: error.message };
          if (data && data.length > 0) return { ok: true };
        }
        const { error } = await supabase.rpc("inv_corte_guardar", {
          p_bodega: p.bodega, p_tipo: p.tipo, p_inicial: p.inicial,
          p_cortado: p.cortado, p_nota: p.nota, p_renglones: p.renglones,
        });
        if (!error) return { ok: true };
        return esFalloDeRed(error.message) ? { red: true } : { error: error.message };
      });
      ponerCola(r.quedan);
      const n = r.enviados.length;
      if (n > 0) {
        setAviso(`${n} ${n === 1 ? "corte pendiente enviado" : "cortes pendientes enviados"}.`);
        router.refresh();
      }
      if (r.quedan.some((x) => x.error)) setMal("Hay cortes que la base no aceptó. Míralos arriba.");
      else if (r.quedan.length > 0 && manual) setMal("Se cortó la señal. Quedan pendientes en este teléfono.");
    } finally {
      colaOcupada.current = false; setEnviandoCola(false);
    }
  }
  /* El evento «online» se registra UNA vez: apunta siempre a la última versión. */
  const enviarColaRef = useRef(enviarCola);
  enviarColaRef.current = enviarCola;

  useEffect(() => {
    const guardada = leerCola<PendCorte>(llaveCola);
    colaRef.current = guardada;
    setCola(guardada);
    setEnLinea(navigator.onLine);
    const sube = () => { setEnLinea(true); void enviarColaRef.current() };
    const baja = () => setEnLinea(false);
    window.addEventListener("online", sube);
    window.addEventListener("offline", baja);
    if (navigator.onLine && colaRef.current.length > 0) void enviarColaRef.current();
    return () => { window.removeEventListener("online", sube); window.removeEventListener("offline", baja) };
  }, [llaveCola]);

  const bannerCola = (!enLinea || cola.length > 0) && (
    <section className={"fe-cola" + (!enLinea ? " sin" : "")} role="status" aria-live="polite">
      <p>
        {!enLinea && <><b>Sin señal.</b> Lo que guardes queda en este teléfono y se envía solo cuando vuelva. </>}
        {cola.length > 0 && <><b>{cola.length}</b> {cola.length === 1 ? "corte" : "cortes"} sin enviar.</>}
      </p>
      {cola.length > 0 && enLinea && (
        <button type="button" className="fe-mini" disabled={enviandoCola} onClick={() => enviarCola(true)}>
          {enviandoCola ? "Enviando…" : "Enviar ahora"}
        </button>
      )}
      {cola.length > 0 && (
        <details open={cola.some((x) => x.error)}>
          <summary>Ver los pendientes</summary>
          <ul>
            {cola.map((it) => (
              <li key={it.id}>
                <span><b>{it.sku}</b> · {hora(it.bb.cortado)} · {it.lugar}{it.error && <em> — {traducirError(it.error)}</em>}</span>
                <button type="button" className="fe-mini" disabled={enviandoCola}
                        onClick={() => ponerCola(colaRef.current.filter((x) => x.id !== it.id))}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );

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
  /* «A · 01 · DER: 30 estibas + A · 02 · DER: 20 estibas»: todos los módulos de un lado. */
  const sitiosTxt = (l: Sitio[]) => l.map((x) => `${nombreUbi(x.ubicacion_id)}: ${fmt(x.cant)} ${x.unidad}`).join(" + ");
  const nombreLinea = (c: string) => lineas.find((l) => l.clave === c)?.nombre ?? c;

  /* LO QUE SE ANOTÓ EN UN CORTE, línea por línea: el contador de la depa, de dónde tomaban y dónde estaban ubicados. */
  const renglonesDe = (c: CorteT) => (
    <ul className="cl-res">
                {[...c.renglones].sort((a, b) => a.linea.localeCompare(b.linea, "es", { numeric: true })).map((r) => (
                  <li key={r.linea}>
                    <b>{r.linea}</b> {fmt(r.cajas_depa)} cajas por la depa
                    <span>
                      {sinModulos(r) ? <>Envase: {(() => { const e = envaseDelRenglon(r.envase_id, r.material_id, materiales); return e.m ? `${e.m.sku} · ${e.m.nombre}${e.delMaestro ? " (del maestro)" : ""}` : "sin escoger"; })()} · de dónde toma sale del FEFO</> : null}
                      {r.origenes.length > 0 ? <>Tomando de {sitiosTxt(r.origenes)}<> {(() => { const e = envaseDelRenglon(r.envase_id, r.material_id, materiales); return e.m ? `de ${e.m.sku} · ${e.m.nombre}${e.delMaestro ? " (envase del maestro)" : ""}` : "(sin envase anotado)"; })()}</></> : null}
                      {r.origenes.length > 0 && r.destinos.length > 0 ? " · " : null}
                      {r.destinos.length > 0 ? <>Ubicados en {sitiosTxt(r.destinos)}<> {r.material_id && mat.get(r.material_id) ? `de ${mat.get(r.material_id)!.sku} · ${mat.get(r.material_id)!.nombre}` : "(sin producto anotado)"}</></> : null}
                    </span>
                  </li>
                ))}
    </ul>
  );

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
      <>
        <Cabeza paso={form.tipo === "inicial" ? 1 : 2} abiertos={abiertos.length} cerrados={cerrados.length} anotando={form.tipo} verDiferencia={verDiferencia} />
        {bannerCola}
        <FormCorte
          tipo={form.tipo} inicial={form.inicial} bodegaId={bodegaId} lineas={lineas}
          ubicaciones={ubicaciones} materiales={materiales} ahora={ahora} manualInicial={manualInicial}
          onCerrar={() => setForm(null)}
          onPendiente={encolar}
          onGuardado={(t) => {
            setForm(null);
            setAviso(t === "inicial"
              ? "Corte inicial guardado. Haz lo que tengas que hacer; cuando vuelvas, aquí abajo lo encuentras para hacer el corte final."
              : verDiferencia ? "Corte final guardado. Abajo está la diferencia." : "Corte final guardado.");
            router.refresh();
          }}
        />
      </>
    );
  }

  return (
    <>
    <Cabeza paso={abiertos.length > 0 ? 2 : 1} abiertos={abiertos.length} cerrados={cerrados.length} anotando={null} verDiferencia={verDiferencia} />
    {bannerCola}
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
              {renglonesDe(c)}
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

      {manda && verDiferencia && (
        <>
          <h2 className="cl-h">El proceso, corte por corte <span>{cortes.filter((c) => c.tipo === "inicial").length}</span></h2>
          <Proceso cortes={cortes} lineas={lineas} ubicaciones={ubicaciones} materiales={materiales}
                   conteos={conteos} lineasConteo={lineasConteo} nombres={nombres} />
        </>
      )}

      {verDiferencia && (
        <>
        <h2 className="cl-h" id="cl-diferencia">La diferencia <span>{cerrados.length}</span></h2>
        {cerrados.length === 0 ? (
          <p className="fe-vacio">Todavía no hay cortes cerrados. Cuando hagas el final de uno, aquí sale cuánto pasó y cuánto se movió.</p>
        ) : (
          <Historial cortes={cortes} lineas={lineas} ubicaciones={ubicaciones} materiales={materiales}
            conteos={conteos} lineasConteo={lineasConteo} manda={manda} borrar={borrar} ocupado={ocupado}
            onBorrar={setBorrar} onConfirmar={eliminar} />
        )}
        </>
      )}
    </div>
    </>
  );
}

/* LA CABEZA, con los tres pasos: el corte inicial se guarda, el final se hace
   cuando se vuelve (queda «esperando»), y la diferencia sale sola. */
function Cabeza({ paso, abiertos, cerrados, anotando, verDiferencia }: {
  paso: 1 | 2; abiertos: number; cerrados: number; anotando: "inicial" | "final" | null; verDiferencia: boolean;
}) {
  return (
    <section className="cabeza cl-cabeza">
      <div>
        <p className="ojo">INVENTARIO · ANTES DE CONTAR</p>
        <h1>Corte de líneas</h1>
        <p className="sub">
          Antes del conteo se corta cada línea: cuántas cajas pasaron por la depaletizadora, qué material
          corre, de dónde estaba tomando y dónde queda ubicado. Ese es el <b>inicial</b> y se guarda; luego,
          cuando vuelvas, se hace el <b>final</b>{verDiferencia ? " y aquí sale la diferencia." : "."}
        </p>
      </div>
      <ol className="cl-flujo" aria-label={verDiferencia ? "Los tres pasos" : "Los dos pasos"}>
        <li className={paso === 1 ? "on" : ""}>
          <span>PASO 1</span><b>Corte inicial</b><small>{anotando === "inicial" ? "anotando ahora" : "se guarda y espera"}</small>
        </li>
        <li className={paso === 2 ? "on" : ""}>
          <span>PASO 2</span><b>Corte final</b>
          <small>{anotando === "final" ? "anotando ahora" : `${abiertos} ${abiertos === 1 ? "abierto esperando" : "abiertos esperando"}`}</small>
        </li>
        {verDiferencia && (
          <li>
            <span>PASO 3</span><b>Diferencia</b><small>{cerrados > 0 ? `${cerrados} ${cerrados === 1 ? "lista" : "listas"}` : "sale sola"}</small>
          </li>
        )}
      </ol>
    </section>
  );
}

/* ===================================================================
   EL FORMULARIO DE UN CORTE (inicial o final)

   UNA LÍNEA A LA VEZ: a la izquierda la fecha y las líneas con su estado
   (SIN TOCAR / ANOTANDO / A MEDIAS / ANOTADA); a la derecha la línea que
   se está anotando. «Siguiente» pasa a la otra; «Guardar» manda todas
   las que se tocaron. En el celular la lista de líneas queda arriba.
   =================================================================== */
function FormCorte({ tipo, inicial, bodegaId, lineas, ubicaciones, materiales, ahora, manualInicial, onCerrar, onGuardado, onPendiente }: {
  manualInicial: boolean;
  tipo: "inicial" | "final"; inicial: CorteT | null; bodegaId: string; lineas: LineaC[];
  ubicaciones: UbiC[]; materiales: MatC[]; ahora: string;
  onCerrar: () => void; onGuardado: (t: "inicial" | "final") => void;
  /* Sin señal: el corte no se perdió, quedó pendiente en el teléfono. */
  onPendiente: (p: PendCorte) => void;
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
  const desdeSitio = (s: Sitio): SitioF => {
    const u = ubi.get(s.ubicacion_id);
    return u ? { calle: u.calle, modulo: u.modulo, lado: u.lado ?? "", cant: "", unidad: "cajas" } : sitioVacio();
  };
  const [base] = useState<Record<string, LineaF>>(() => armarBase());
  const [filas, setFilas] = useState<Record<string, LineaF>>(base);
  function armarBase(): Record<string, LineaF> {
    const o: Record<string, LineaF> = {};
    for (const l of lineas) {
      const r = inicial?.renglones.find((x) => x.linea === l.clave);
      o[l.clave] = r
        ? { cajas: "", material: (() => { const m = materiales.find((x) => x.id === r.material_id); return m ? etiqueta(m) : "" })(),
            envase: (() => { const m = materiales.find((x) => x.id === r.envase_id); return m ? etiqueta(m) : "" })(),
            origen: r.origenes.length ? r.origenes.map(desdeSitio) : [sitioVacio()],
            destino: r.destinos.length ? r.destinos.map(desdeSitio) : [sitioVacio()] }
        : lineaVacia();
    }
    return o;
  }
  /* POR DEFECTO SE PIDE LA DEPA, EL PRODUCTO Y DE DÓNDE SE TOMA EL ENVASE. Dónde queda ubicado no se pide: no entra al análisis. */
  const [manual, setManual] = useState(manualInicial);
  const [cuando, setCuando] = useState(() => aInput(ahora));
  const [nota, setNota] = useState("");
  const [sel, setSel] = useState(lineas[0]?.clave ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [faltan, setFaltan] = useState<{ linea: string | null; texto: string }[]>([]);

  const cambia = (clave: string, f: (l: LineaF) => LineaF) =>
    setFilas((p) => ({ ...p, [clave]: f(p[clave]) }));

  /* Lo que se TOMA es envase y lo que queda UBICADO es producto: cada
     casilla de material solo reconoce los de su tipo. */
  const productos = useMemo(() => materiales.filter((m) => m.tipo === "PRODUCTO"), [materiales]);
  const envases = useMemo(() => materiales.filter((m) => m.tipo === "ENVASE"), [materiales]);
  const buscaEn = (lista: MatC[], txt: string): MatC | null => {
    const t = txt.trim();
    if (!t) return null;
    return lista.find((m) => etiqueta(m) === t) ?? lista.find((m) => m.sku === t.split(" ")[0]) ?? null;
  };
  const matDe = (txt: string) => buscaEn(productos, txt);
  const envDe = (txt: string) => buscaEn(envases, txt);

  /* LO QUE FALTA EN UNA LÍNEA, por su nombre, y su renglón si ya está completa. */
  function revisarLinea(clave: string) {
    const f = filas[clave];
    const aqui: string[] = [];
    const cajas = num(f.cajas);
    if (cajas === null || !Number.isInteger(cajas)) aqui.push("las cajas de la depa (un número entero)");
    /* CADA LADO ES UNA LISTA DE MÓDULOS. El primero es obligatorio; un módulo
       extra que se dejó en blanco no dice nada y se ignora. El mismo módulo
       dos veces en un lado es un error: sumaría dos veces lo mismo. */
    const sitios: Record<string, unknown> = {};
    for (const [k, lista, nom, donde] of (manual ? [
      ["origenes", f.origen, "de dónde tomaba", "donde tomaba"],
      ["destinos", f.destino, "dónde estaba ubicado", "donde estaba ubicado"],
    ] : [
      ["origenes", f.origen, "de dónde tomaba", "donde tomaba"],
    ]) as readonly (readonly ["origenes" | "destinos", SitioF[], string, string])[]) {
      const vistos = new Set<string>();
      const salen: { ubicacion_id: string; cant: number; unidad: Unidad }[] = [];
      lista.forEach((s, i) => {
        if (i > 0 && !s.calle && !s.modulo && !s.cant.trim()) return;
        const suf = lista.length > 1 ? ` (módulo ${i + 1})` : "";
        const u = resolver(s), c = num(s.cant);
        if (!u) aqui.push(`${nom}${suf} (calle, módulo y lado)`);
        else if (c === null) aqui.push(`cuántas ${s.unidad} hay ${donde}${suf}`);
        else if (vistos.has(u.id)) aqui.push(`${nom}: el módulo ${i + 1} está repetido`);
        else { vistos.add(u.id); salen.push({ ubicacion_id: u.id, cant: c, unidad: s.unidad }) }
      });
      sitios[k] = salen;
    }
    if (!manual) sitios.destinos = [];
    if (!manual && !f.material.trim()) aqui.push("el producto (la referencia que sale de la línea)");
    if (f.envase.trim() && !envDe(f.envase)) aqui.push("el envase (escoge uno de la lista o déjalo vacío)");
    if (f.material.trim() && !matDe(f.material)) aqui.push("el producto (escoge uno de la lista)");
    return {
      aqui,
      renglon: aqui.length ? null : {
        linea: clave, cajas_depa: cajas, material_id: matDe(f.material)?.id ?? null,
        envase_id: envDe(f.envase)?.id ?? null, ...sitios,
      },
    };
  }
  const estadoDe = (clave: string): "sin" | "medias" | "ok" =>
    !tocada(filas[clave], base[clave]) ? "sin" : revisarLinea(clave).aqui.length ? "medias" : "ok";

  function armar() {
    const falta: { linea: string | null; texto: string }[] = [];
    const renglones: Record<string, unknown>[] = [];
    for (const l of lineas) {
      if (!tocada(filas[l.clave], base[l.clave])) continue;
      const r = revisarLinea(l.clave);
      if (r.aqui.length) falta.push({ linea: l.clave, texto: `${l.clave}: ${r.aqui.join(", ")}` });
      else renglones.push(r.renglon!);
    }
    if (!falta.length && renglones.length === 0) falta.push({ linea: null, texto: "Llena al menos una línea" });
    const iso = deInput(cuando);
    if (!iso) falta.push({ linea: null, texto: "La fecha y la hora del corte" });
    else if (Date.parse(iso) > Date.parse(ahora) + 10 * 60000) falta.push({ linea: null, texto: "La hora del corte no puede ser del futuro" });
    else if (inicial && Date.parse(iso) <= Date.parse(inicial.cortado_en)) falta.push({ linea: null, texto: `El final tiene que ser después del inicial (${hora(inicial.cortado_en)})` });
    return { falta, renglones, iso };
  }

  async function guardar() {
    setMal(null);
    const { falta, renglones, iso } = armar();
    setFaltan(falta);
    if (falta.length) {
      /* Salta a la primera línea que quedó a medias: es donde hay que mirar. */
      const primera = falta.find((x) => x.linea);
      if (primera?.linea) setSel(primera.linea);
      return;
    }
    if (!iso) return;
    const pend: PendCorte = {
      bodega: bodegaId, tipo, inicial: inicial?.id ?? null,
      cortado: iso, nota: nota.trim() || null, renglones,
    };
    /* SIN SEÑAL NO SE ESPERA NI SE PIERDE NADA: lo tecleado pasa a la cola
       del teléfono y la pantalla vuelve a la lista. Solo cuenta como
       «sin señal» lo que de verdad lo es: si la base contesta con un error
       (permiso, dato malo), eso se dice aquí y NO se encola. */
    if (typeof navigator !== "undefined" && !navigator.onLine) return onPendiente(pend);
    setOcupado(true);
    let error: { message: string } | null = null;
    try {
      ({ error } = await createClient().rpc("inv_corte_guardar", {
        p_bodega: pend.bodega, p_tipo: pend.tipo, p_inicial: pend.inicial,
        p_cortado: pend.cortado, p_nota: pend.nota, p_renglones: pend.renglones,
      }));
    } catch (e) {
      error = { message: (e as Error)?.message ?? String(e) };
    }
    setOcupado(false);
    if (error && esFalloDeRed(error.message)) return onPendiente(pend);
    if (error) return setMal(traducirError(error.message));
    onGuardado(tipo);
  }

  const linea = lineas.find((l) => l.clave === sel) ?? lineas[0];
  const f = linea ? filas[linea.clave] : null;
  const idx = lineas.findIndex((l) => l.clave === linea?.clave);
  const siguiente = idx >= 0 && idx < lineas.length - 1 ? lineas[idx + 1] : null;
  const anotadas = lineas.filter((l) => estadoDe(l.clave) === "ok").length;
  const isoCuando = deInput(cuando);

  /* CUÁNTAS CAJAS (Y UNIDADES) SON LO QUE SE ESCRIBIÓ: lo que hace falta
     para no sumar estibas con cajas en la cabeza. */
  const cajasDe = (s: SitioF, m: MatC | null): number | null => {
    const c = num(s.cant);
    if (c === null) return null;
    return s.unidad === "cajas" ? c : m?.cajas_por_estiba && m.cajas_por_estiba > 0 ? c * m.cajas_por_estiba : null;
  };
  const equivale = (s: SitioF, m: MatC | null, que: "envase" | "material"): string => {
    if (num(s.cant) === null) return "";
    const cajas = cajasDe(s, m);
    if (cajas === null) return m ? `Este ${que} no tiene cajas por estiba en el maestro` : `Escoge el ${que} para pasar las estibas a cajas`;
    return `${fmt(cajas)} cajas` + (m?.unidades_por_caja ? ` · ${fmt(cajas * m.unidades_por_caja)} unidades` : "");
  };

  const bloque = (clave: string, k: "origen" | "destino", titulo: string, ayuda: string, conEnvase = true) => {
    const lista = filas[clave][k];
    const esEnv = k === "origen";
    const m = esEnv ? envDe(filas[clave].envase) : matDe(filas[clave].material);
    const que = esEnv ? "envase" : "material";
    const cambiaSitio = (i: number, p: Partial<SitioF>) =>
      cambia(clave, (l) => ({ ...l, [k]: l[k].map((x, j) => (j === i ? { ...x, ...p } : x)) }));
    const agregar = () =>
      cambia(clave, (l) => ({ ...l, [k]: [...l[k], sitioVacio(l[k][l[k].length - 1]?.unidad)] }));
    const quitar = (i: number) => cambia(clave, (l) => ({ ...l, [k]: l[k].filter((_, j) => j !== i) }));
    /* El total de todos los módulos, solo si TODOS se pueden pasar a cajas. */
    const llenos = lista.filter((x) => num(x.cant) !== null);
    const cajasTot = llenos.map((x) => cajasDe(x, m));
    const total = lista.length > 1 && llenos.length > 0 && cajasTot.every((x) => x !== null)
      ? (cajasTot as number[]).reduce((t, x) => t + x, 0) : null;
    return (
      <fieldset className={"cl-sitio " + k} aria-label={titulo}>
        <div className="cl-leg">
          <span className="cl-ic" aria-hidden>{k === "origen" ? "→" : "↓"}</span>
          <b>{titulo}</b><i>{ayuda}</i>
        </div>
        {esEnv ? (conEnvase &&
          <MaterialCampo lista={envases} valor={filas[clave].envase} etiqueta={etiqueta} resolver={envDe}
                         titulo="Envase" nota="lo que entra a la línea" sin="Sin envase"
                         onCambia={(v) => cambia(clave, (x) => ({ ...x, envase: v }))} />
        ) : (
          <MaterialCampo lista={productos} valor={filas[clave].material} etiqueta={etiqueta} resolver={matDe}
                         titulo="Material" nota="el producto que sale" sin="Sin material"
                         onCambia={(v) => cambia(clave, (x) => ({ ...x, material: v }))} />
        )}
        {lista.map((s, i) => {
          const mods = s.calle ? modulosDe(s.calle) : [];
          const lados = s.calle && s.modulo ? ladosDe(s.calle, s.modulo) : [];
          const eq = equivale(s, m, que);
          return (
            <div key={i} className="cl-mod">
              {lista.length > 1 && (
                <div className="cl-mod-cab">
                  <b>Módulo {i + 1}</b>
                  <button type="button" className="cl-quitar" onClick={() => quitar(i)}>Quitar este módulo</button>
                </div>
              )}
              <label>
                <span>Calle</span>
                <select value={s.calle} onChange={(e) => cambiaSitio(i, { calle: e.target.value, modulo: "", lado: "" })}>
                  <option value="">—</option>
                  {calles.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                <span>Módulo</span>
                <select value={s.modulo} disabled={!s.calle}
                        onChange={(e) => {
                          const mo = e.target.value;
                          const ls = mo ? ladosDe(s.calle, mo) : [];
                          /* UN SOLO LADO POSIBLE: se pone solo. */
                          cambiaSitio(i, { modulo: mo, lado: ls.length === 1 ? ls[0] : "" });
                        }}>
                  <option value="">—</option>
                  {mods.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
                </select>
              </label>
              <label>
                <span>Lado</span>
                <select value={s.lado} disabled={!s.modulo || lados.length <= 1}
                        onChange={(e) => cambiaSitio(i, { lado: e.target.value })}>
                  {(lados.length > 1 || !s.modulo) && <option value="">—</option>}
                  {lados.map((x) => <option key={x || "solo"} value={x}>{x === "IZQ" ? "Izquierdo" : x === "DER" ? "Derecho" : "único"}</option>)}
                </select>
              </label>
              <label className="cl-cant-c">
                <span>{s.unidad === "cajas" ? "¿Cuántas cajas?" : `¿Cuántas ${s.unidad}?`}</span>
                <input inputMode="decimal" value={s.cant} placeholder="0" onChange={(e) => cambiaSitio(i, { cant: e.target.value })} />
              </label>
              <p className={"cl-eco" + (eq && !/cajas$|unidades$/.test(eq) ? " aviso" : "")}>{eq || "Se convierte con el factor del material"}</p>
            </div>
          );
        })}
        {total !== null && (
          <p className="cl-total">Total de los {lista.length} módulos: <b>{fmt(total)} cajas</b>{m?.unidades_por_caja ? ` · ${fmt(total * m.unidades_por_caja)} unidades` : ""}</p>
        )}
        <button type="button" className="cl-mas" onClick={agregar}>
          + Agregar otro módulo {esEnv ? "de donde se toma" : "donde quedó ubicado"}
        </button>
      </fieldset>
    );
  };

  const depaCampo = linea && f ? (
    <label className="cl-depa">
      <span>Cajas que han pasado por la depa</span>
      <input inputMode="numeric" value={f.cajas} placeholder="Ej. 18801"
             onChange={(e) => cambia(linea.clave, (x) => ({ ...x, cajas: e.target.value }))} />
      <em>Lo que marca el contador de la depaletizadora</em>
    </label>
  ) : null;

  return (
    <div className="cl">
      <p className="cl-sub">
        {tipo === "inicial"
          ? "Anota cada línea como está AHORA: lo que marca el contador de la depa, el producto y de dónde toma el envase. Las líneas que no toques no se cortan."
          : `Corte final del inicial de las ${hora(inicial!.cortado_en)}: el producto y los módulos vienen puestos; cambia los que hayan cambiado y anota las cantidades de ahora.`}
      </p>

      <div className="cl-grid">
        <aside className="cl-barra">
          <label className="cl-cuando">
            <span>Fecha y hora del corte</span>
            <input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} />
          </label>
          <div className="cl-lineas" role="tablist" aria-label="Líneas">
            {lineas.map((l) => {
              const e = estadoDe(l.clave);
              const m = matDe(filas[l.clave].material) ?? envDe(filas[l.clave].envase);
              const actual = l.clave === linea?.clave;
              return (
                <button key={l.clave} type="button" role="tab" aria-selected={actual}
                        className={"cl-lin " + e + (actual ? " on" : "")} onClick={() => setSel(l.clave)}>
                  <span className="cl-cod">{l.clave}</span>
                  <span className="cl-lin-t"><b>{l.nombre}</b><small>{m ? `${m.sku} · ${m.nombre}` : "sin producto"}</small></span>
                  <span className={"cl-st " + (e === "ok" ? "ok" : e === "medias" ? "med" : actual ? "cur" : "no")}>
                    {e === "ok" ? "ANOTADA" : e === "medias" ? "A MEDIAS" : actual ? "ANOTANDO" : "SIN TOCAR"}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="cl-cuando">
            <span>Nota <em>(opcional)</em></span>
            <input value={nota} maxLength={200} placeholder="Ej. L4 parada por mantenimiento"
                   onChange={(e) => setNota(e.target.value)} />
          </label>
        </aside>

        {linea && f && (
          <section className={"cl-ficha" + (estadoDe(linea.clave) !== "sin" ? " on" : "")} aria-label={linea.nombre}>
            <header className="cl-ficha-cab">
              <span className="cl-grande">{linea.clave}</span>
              <h2>{linea.nombre}<small>Corte {tipo} · {isoCuando ? hora(isoCuando).replace(/\/\d{4}/, "") : "—"}</small></h2>
              {tocada(f, base[linea.clave]) && (
                <button type="button" className="cl-no" onClick={() => { cambia(linea.clave, () => base[linea.clave]); setFaltan([]) }}>
                  No cortar esta línea
                </button>
              )}
            </header>
            <div className="cl-cuerpo">
              {manual ? (
                <div className="cl-r1">{depaCampo}</div>
              ) : (
                /* COMO EN EL DISEÑO: el envase que entra → las cajas que pasaron por la depa. */
                <div className="cl-envdepa">
                  <MaterialCampo lista={envases} valor={f.envase} etiqueta={etiqueta} resolver={envDe}
                                 titulo="Envase" nota="del maestro" sin="Sin envase"
                                 onCambia={(v) => cambia(linea.clave, (x) => ({ ...x, envase: v }))} />
                  <span className="cl-flecha" aria-hidden>→</span>
                  {depaCampo}
                </div>
              )}
              {manual ? (
                <>
                  <div className="cl-r2">
                    {bloque(linea.clave, "origen", "Tomando de", "el módulo de donde saca la línea")}
                    {bloque(linea.clave, "destino", "Ubicados en", "el módulo donde queda lo que sale")}
                  </div>
                  <button type="button" className="btn plano cl-manual" onClick={() => setManual(false)}>
                    Quitar «dónde quedó ubicado»
                  </button>
                </>
              ) : (
                <>
                  {/* EL PRODUCTO (CON SU SKU): a qué referencia le está entrando el envase. */}
                  <MaterialCampo lista={productos} valor={f.material} etiqueta={etiqueta} resolver={matDe}
                                 titulo="Producto" nota="la referencia que sale de la línea" sin="Sin producto"
                                 onCambia={(v) => cambia(linea.clave, (x) => ({ ...x, material: v }))} />
                  <div className="cl-r2 una">
                    {bloque(linea.clave, "origen", "Tomando de", "el módulo de donde saca la línea", false)}
                  </div>
                  <button type="button" className="btn plano cl-manual" onClick={() => setManual(true)}>
                    Anotar también dónde quedó ubicado (opcional)
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {faltan.length > 0 && (
        <div className="cl-mal" role="alert">
          <b>Falta:</b>
          <ul>
            {faltan.map((x) => (
              <li key={x.texto}>
                {x.linea
                  ? <button type="button" className="cl-ir" onClick={() => setSel(x.linea!)}>{x.texto}</button>
                  : x.texto}
              </li>
            ))}
          </ul>
        </div>
      )}
      {mal && <p className="cl-mal" role="alert">{mal}</p>}

      <div className="cl-guardar">
        <div className="cl-prog">
          <span className="cl-progbar" aria-hidden><i style={{ width: `${lineas.length ? (anotadas / lineas.length) * 100 : 0}%` }} /></span>
          <span><b>{anotadas} de {lineas.length}</b> líneas anotadas</span>
        </div>
        <button type="button" className="btn plano" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
        {siguiente && (
          <button type="button" className="btn plano" onClick={() => setSel(siguiente.clave)}>Siguiente: {siguiente.clave} →</button>
        )}
        <button type="button" className="btn grande cl-go" onClick={guardar} disabled={ocupado}>
          {ocupado ? "Guardando…" : `Guardar corte ${tipo}`}
        </button>
      </div>
    </div>
  );
}

/* UN MATERIAL (envase o producto): una tarjeta con lo que dice el maestro y
   «Cambiar». Sin material escogido, o al cambiarlo, se busca por código o por
   nombre SOLO entre los de su tipo (`lista`): el envase no ofrece productos ni
   al revés. */
function MaterialCampo({ lista, valor, etiqueta, resolver, titulo, nota, sin, onCambia }: {
  lista: MatC[]; valor: string; etiqueta: (m: MatC) => string;
  resolver: (t: string) => MatC | null; titulo: string; nota: string; sin: string;
  onCambia: (v: string) => void;
}) {
  const m = resolver(valor);
  const [buscando, setBuscando] = useState(!m);
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const hallados = t
    ? lista.filter((x) => x.sku.toLowerCase().includes(t) || x.nombre.toLowerCase().includes(t)).slice(0, 6)
    : [];
  const datos = (x: MatC) =>
    [x.sku, x.unidades_por_caja ? `${fmt(x.unidades_por_caja)} por caja` : null,
     x.cajas_por_estiba ? `${fmt(x.cajas_por_estiba)} cajas por estiba` : null].filter(Boolean).join(" · ");
  return (
    <div className="cl-mat">
      <span className="cl-mat-t">{titulo} <em>({nota})</em></span>
      {m && !buscando ? (
        <div className="cl-mae">
          <span className="cl-mae-ic" aria-hidden>▮</span>
          <div><b>{m.nombre}</b><small>{datos(m)}</small></div>
          <button type="button" className="btn plano" onClick={() => { setQ(""); setBuscando(true) }}>Cambiar</button>
        </div>
      ) : (
        <div className="cl-busca">
          <input value={q} placeholder="Busca por código o nombre" aria-label={`Buscar ${titulo.toLowerCase()}`}
                 onChange={(e) => setQ(e.target.value)} />
          {hallados.length > 0 && (
            <ul>
              {hallados.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => { onCambia(etiqueta(x)); setBuscando(false); setQ("") }}>
                    <b>{x.nombre}</b><small>{datos(x)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {t && hallados.length === 0 && <p className="cl-nada">Ningún {titulo.toLowerCase()} coincide.</p>}
          {m ? (
            <button type="button" className="btn plano" onClick={() => { setBuscando(false); setQ("") }}>Dejar el que estaba</button>
          ) : null}
          {m ? (
            <button type="button" className="btn plano" onClick={() => { onCambia(""); setQ("") }}>{sin}</button>
          ) : null}
        </div>
      )}
    </div>
  );
}
