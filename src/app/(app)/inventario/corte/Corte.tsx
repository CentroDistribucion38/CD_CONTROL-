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
export type MatC = { id: string; sku: string; nombre: string; cajas_por_estiba: number | null; unidades_por_caja: number | null; tipo: "PRODUCTO" | "ENVASE" };
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
/* `envase` es lo que ENTRA a la línea (se toma del origen); `material` es el
   PRODUCTO que sale (queda ubicado en el destino). */
type LineaF = { cajas: string; material: string; envase: string; origen: SitioF; destino: SitioF };
const sitioVacio = (unidad: Unidad = "estibas"): SitioF => ({ calle: "", modulo: "", lado: "", cant: "", unidad });
const lineaVacia = (): LineaF => ({ cajas: "", material: "", envase: "", origen: sitioVacio(), destino: sitioVacio() });
/* UNA LÍNEA ESTÁ «TOCADA» si alguien escribió algo en ella: cajas o
   cantidades, o si cambió el módulo o el material respecto de cómo
   arrancó. En el final los módulos vienen puestos del inicial: una línea
   que solo trae eso NO se tocó, y no se exige ni se guarda. */
const lugar = (s: SitioF) => `${s.calle}|${s.modulo}|${s.lado}`;
const tocada = (l: LineaF, base: LineaF) =>
  !!(l.cajas.trim() || l.origen.cant.trim() || l.destino.cant.trim() ||
     l.material.trim() !== base.material.trim() || l.envase.trim() !== base.envase.trim() ||
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
      <>
        <Cabeza paso={form.tipo === "inicial" ? 1 : 2} abiertos={abiertos.length} cerrados={cerrados.length} anotando={form.tipo} />
        <FormCorte
          tipo={form.tipo} inicial={form.inicial} bodegaId={bodegaId} lineas={lineas}
          ubicaciones={ubicaciones} materiales={materiales} ahora={ahora}
          onCerrar={() => setForm(null)}
          onGuardado={(t) => {
            setForm(null);
            setAviso(t === "inicial"
              ? "Corte inicial guardado. Haz lo que tengas que hacer; cuando vuelvas, aquí abajo lo encuentras para hacer el corte final."
              : "Corte final guardado. Abajo está la diferencia.");
            router.refresh();
          }}
        />
      </>
    );
  }

  return (
    <>
    <Cabeza paso={abiertos.length > 0 ? 2 : 1} abiertos={abiertos.length} cerrados={cerrados.length} anotando={null} />
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
              <ul className="cl-res">
                {[...c.renglones].sort((a, b) => a.linea.localeCompare(b.linea, "es", { numeric: true })).map((r) => (
                  <li key={r.linea}>
                    <b>{r.linea}</b> {fmt(r.cajas_depa)} cajas por la depa
                    <span>
                      {r.origen ? <>Tomando de {nombreUbi(r.origen.ubicacion_id)}: {fmt(r.origen.cant)} {r.origen.unidad}{r.envase_id && mat.get(r.envase_id) ? <> de {mat.get(r.envase_id)!.nombre}</> : null}</> : null}
                      {r.origen && r.destino ? " · " : null}
                      {r.destino ? <>Ubicados en {nombreUbi(r.destino.ubicacion_id)}: {fmt(r.destino.cant)} {r.destino.unidad}{r.material_id && mat.get(r.material_id) ? <> de {mat.get(r.material_id)!.nombre}</> : null}</> : null}
                    </span>
                  </li>
                ))}
              </ul>
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
                              accion="bajó" nombreUbi={nombreUbi} material={mat.get(f.envase_id ?? "")?.nombre ?? null} />
                    <LadoFila titulo="Ubicados en" ini={ini} fin={fin} linea={f.linea} cual="destino" lado={f.destino}
                              accion="subió" nombreUbi={nombreUbi} material={mat.get(f.material_id ?? "")?.nombre ?? null} />
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
    </>
  );
}

/* LA CABEZA, con los tres pasos: el corte inicial se guarda, el final se hace
   cuando se vuelve (queda «esperando»), y la diferencia sale sola. */
function Cabeza({ paso, abiertos, cerrados, anotando }: {
  paso: 1 | 2; abiertos: number; cerrados: number; anotando: "inicial" | "final" | null;
}) {
  return (
    <section className="cabeza cl-cabeza">
      <div>
        <p className="ojo">INVENTARIO · ANTES DE CONTAR</p>
        <h1>Corte de líneas</h1>
        <p className="sub">
          Antes del conteo se corta cada línea: cuántas cajas pasaron por la depaletizadora, qué material
          corre, de dónde estaba tomando y dónde queda ubicado. Ese es el <b>inicial</b> y se guarda; luego,
          cuando vuelvas, se hace el <b>final</b> y aquí sale la diferencia.
        </p>
      </div>
      <ol className="cl-flujo" aria-label="Los tres pasos">
        <li className={paso === 1 ? "on" : ""}>
          <span>PASO 1</span><b>Corte inicial</b><small>{anotando === "inicial" ? "anotando ahora" : "se guarda y espera"}</small>
        </li>
        <li className={paso === 2 ? "on" : ""}>
          <span>PASO 2</span><b>Corte final</b>
          <small>{anotando === "final" ? "anotando ahora" : `${abiertos} ${abiertos === 1 ? "abierto esperando" : "abiertos esperando"}`}</small>
        </li>
        <li>
          <span>PASO 3</span><b>Diferencia</b><small>{cerrados > 0 ? `${cerrados} ${cerrados === 1 ? "lista" : "listas"}` : "sale sola"}</small>
        </li>
      </ol>
    </section>
  );
}

/* Una fila «Tomando de / Ubicados en» del análisis: el módulo, de cuánto a
   cuánto, cuánto se movió y la diferencia con lo que contó la depa. */
function LadoFila({ titulo, ini, fin, linea, cual, lado, accion, nombreUbi, material }: {
  titulo: string; ini: CorteT; fin: CorteT; linea: string; cual: "origen" | "destino"; lado: Lado;
  accion: "bajó" | "subió"; nombreUbi: (id: string) => string; material: string | null;
}) {
  const a = ini.renglones.find((r) => r.linea === linea)?.[cual] ?? null;
  const b = fin.renglones.find((r) => r.linea === linea)?.[cual] ?? null;
  const cant = (s: Sitio | null) => (s ? `${fmt(s.cant)} ${s.unidad}` : "—");
  const mismo = a && b && a.ubicacion_id === b.ubicacion_id;
  return (
    <div className="cl-lado">
      <span className="cl-t">{titulo}{material && <small>{material}</small>}</span>
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

   UNA LÍNEA A LA VEZ: a la izquierda la fecha y las líneas con su estado
   (SIN TOCAR / ANOTANDO / A MEDIAS / ANOTADA); a la derecha la línea que
   se está anotando. «Siguiente» pasa a la otra; «Guardar» manda todas
   las que se tocaron. En el celular la lista de líneas queda arriba.
   =================================================================== */
function FormCorte({ tipo, inicial, bodegaId, lineas, ubicaciones, materiales, ahora, onCerrar, onGuardado }: {
  tipo: "inicial" | "final"; inicial: CorteT | null; bodegaId: string; lineas: LineaC[];
  ubicaciones: UbiC[]; materiales: MatC[]; ahora: string;
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
            envase: (() => { const m = materiales.find((x) => x.id === r.envase_id); return m ? etiqueta(m) : "" })(),
            origen: desdeSitio(r.origen), destino: desdeSitio(r.destino) }
        : lineaVacia();
    }
    return o;
  }
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
    const sitios: Record<string, unknown> = {};
    for (const [k, s, nom] of [["origen", f.origen, "de dónde tomaba"], ["destino", f.destino, "dónde estaba ubicado"]] as const) {
      const u = resolver(s), c = num(s.cant);
      if (!u) aqui.push(`${nom} (calle, módulo y lado)`);
      else if (c === null) aqui.push(`cuántas ${s.unidad} hay ${k === "origen" ? "donde tomaba" : "donde estaba ubicado"}`);
      else sitios[k] = { ubicacion_id: u.id, cant: c, unidad: s.unidad };
    }
    if (f.envase.trim() && !envDe(f.envase)) aqui.push("el envase (escoge uno de la lista o déjalo vacío)");
    if (f.material.trim() && !matDe(f.material)) aqui.push("el material (escoge uno de la lista o déjalo vacío)");
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
    setOcupado(true);
    const { error } = await createClient().rpc("inv_corte_guardar", {
      p_bodega: bodegaId, p_tipo: tipo, p_inicial: inicial?.id ?? null,
      p_cortado: iso, p_nota: nota.trim() || null, p_renglones: renglones,
    });
    setOcupado(false);
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
  const equivale = (s: SitioF, m: MatC | null, que: "envase" | "material"): string => {
    const c = num(s.cant);
    if (c === null) return "";
    const cajas = s.unidad === "cajas" ? c : m?.cajas_por_estiba && m.cajas_por_estiba > 0 ? c * m.cajas_por_estiba : null;
    if (cajas === null) return m ? `Este ${que} no tiene cajas por estiba en el maestro` : `Escoge el ${que} para pasar las estibas a cajas`;
    return `${fmt(cajas)} cajas` + (m?.unidades_por_caja ? ` · ${fmt(cajas * m.unidades_por_caja)} unidades` : "");
  };

  const bloque = (clave: string, k: "origen" | "destino", titulo: string, ayuda: string) => {
    const s = filas[clave][k];
    const mods = s.calle ? modulosDe(s.calle) : [];
    const lados = s.calle && s.modulo ? ladosDe(s.calle, s.modulo) : [];
    const cambiaSitio = (p: Partial<SitioF>) => cambia(clave, (l) => ({ ...l, [k]: { ...l[k], ...p } }));
    const esEnv = k === "origen";
    const eq = esEnv ? equivale(s, envDe(filas[clave].envase), "envase") : equivale(s, matDe(filas[clave].material), "material");
    return (
      <fieldset className={"cl-sitio " + k} aria-label={titulo}>
        <div className="cl-leg">
          <span className="cl-ic" aria-hidden>{k === "origen" ? "→" : "↓"}</span>
          <b>{titulo}</b><i>{ayuda}</i>
        </div>
        {esEnv ? (
          <MaterialCampo lista={envases} valor={filas[clave].envase} etiqueta={etiqueta} resolver={envDe}
                         titulo="Envase" nota="lo que entra a la línea" sin="Sin envase"
                         onCambia={(v) => cambia(clave, (x) => ({ ...x, envase: v }))} />
        ) : (
          <MaterialCampo lista={productos} valor={filas[clave].material} etiqueta={etiqueta} resolver={matDe}
                         titulo="Material" nota="el producto que sale" sin="Sin material"
                         onCambia={(v) => cambia(clave, (x) => ({ ...x, material: v }))} />
        )}
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
            {(lados.length > 1 || !s.modulo) && <option value="">—</option>}
            {lados.map((x) => <option key={x || "solo"} value={x}>{x === "IZQ" ? "Izquierdo" : x === "DER" ? "Derecho" : "único"}</option>)}
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
        <p className={"cl-eco" + (eq && !/cajas$|unidades$/.test(eq) ? " aviso" : "")}>{eq || "Se convierte con el factor del material"}</p>
      </fieldset>
    );
  };

  return (
    <div className="cl">
      <p className="cl-sub">
        {tipo === "inicial"
          ? "Anota cada línea como está AHORA. Las líneas que no toques no se cortan."
          : `Corte final del inicial de las ${hora(inicial!.cortado_en)}: los módulos vienen puestos; cambia los que hayan cambiado y anota las cantidades de ahora.`}
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
                  <span className="cl-lin-t"><b>{l.nombre}</b><small>{m ? m.nombre : "sin material"}</small></span>
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
              <div className="cl-r1">
                <label className="cl-depa">
                  <span>Cajas que han pasado por la depa</span>
                  <input inputMode="numeric" value={f.cajas} placeholder="Ej. 18801"
                         onChange={(e) => cambia(linea.clave, (x) => ({ ...x, cajas: e.target.value }))} />
                  <em>Lo que marca el contador de la depaletizadora</em>
                </label>
              </div>
              <div className="cl-r2">
                {bloque(linea.clave, "origen", "Tomando de", "el módulo de donde saca la línea")}
                {bloque(linea.clave, "destino", "Ubicados en", "el módulo donde queda lo que sale")}
              </div>
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
