"use client";

/**
 * LA BANDEJA DE FACTURACIÓN.
 *
 * CADA VIAJE ES UNA TARJETA Y NO UNA FILA DE TABLA. En el celular una
 * tabla de ocho columnas deja el botón fuera de la pantalla —ya pasó en
 * el tablero de rotura—; aquí el botón es lo que se viene a tocar, así
 * que va siempre a la vista, al lado del campo del número.
 *
 * LA ORDEN DE CARGUE VA DE PRIMERO Y EN GRANDE: es el papel que
 * facturación tiene en la mano, y con ese número busca el viaje.
 *
 * EL NÚMERO SE LIMPIA DESDE LA TECLA —solo cifras, diez como máximo—,
 * igual que la orden de cargue en el patio. Enter confirma.
 *
 * LO QUE SALIÓ SE VE DEBAJO, tres días hacia atrás: es para ver lo que
 * se acaba de hacer y, si hubo un error, que el administrador lo reabra
 * con motivo. Facturación no reabre: un número confirmado es un papel
 * que ya salió.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { Viaje } from "@/modulos/traspasos/datos";
import { quien } from "@/modulos/traspasos/formato";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const dia = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
const hora = (s: string) =>
  new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const ruta = (v: Viaje) => [v.origen_nombre, v.destino_nombre].filter(Boolean).join(" → ") || "—";
const limpio = (s: string) => s.replace(/\D/g, "").slice(0, 10);

/** Lo que se busca: orden de cargue, placa o número de documento, sin espacios ni guiones. */
const coincide = (v: Viaje, q: string) => {
  if (!q) return true;
  const n = q.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return [v.documento, v.placa, v.factura_documento, v.codigo]
    .some((x) => (x ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().includes(n));
};

export function Bandeja({ pendientes, salieron, nombres, puedeConfirmar, puedeReabrir, puedeDepurar = false }: {
  pendientes: Viaje[];
  salieron: Viaje[];
  nombres: Record<string, string>;
  puedeConfirmar: boolean;
  puedeReabrir: boolean;
  /** Solo quien administra la plataforma: anular, no se factura, eliminar. */
  puedeDepurar?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [avisar, avisos] = useAvisos();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const marcar = (id: string) => setSel((x) => { const y = new Set(x); if (y.has(id)) y.delete(id); else y.add(id); return y });
  const pend = useMemo(() => pendientes.filter((v) => coincide(v, busca)), [pendientes, busca]);
  const sal = useMemo(() => salieron.filter((v) => coincide(v, busca)), [salieron, busca]);
  const masViejo = pendientes[0] ?? null;

  return (
    <div className="tp fc">
      {avisos}
      <section className="fc-cabeza">
        <div>
          <p className="ojo">TRASPASOS · FACTURACIÓN</p>
          <h1>
            {pendientes.length === 0
              ? <>No hay viajes <em>por facturar</em></>
              : <><span className="fc-n">{nf.format(pendientes.length)}</span> viaje
                  {pendientes.length === 1 ? "" : "s"} <em>por facturar</em></>}
          </h1>
          <p className="sub">
            {pendientes.length === 0
              ? "Todo lo que registró el patio ya tiene su número de documento y su salida confirmada."
              : <>El que más lleva esperando es del <b>{dia(masViejo!.fecha)}</b>, turno {masViejo!.turno}.
                  Pon el número de documento de cada uno y confirma la salida: ese número es el
                  que se cruza con SAP.</>}
          </p>
        </div>
        <label className="fc-busca">
          <span>Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off"
                 placeholder="Placa o número de documento" spellCheck={false} />
        </label>
      </section>

      {puedeDepurar && pend.length > 0 && (
        <div className="fc-dep-todos">
          <label className="fc-check">
            <input type="checkbox" checked={pend.every((v) => sel.has(v.id))}
                   onChange={(e) => setSel(e.target.checked ? new Set(pend.map((v) => v.id)) : new Set())} />
            <span>Seleccionar {busca ? "los que coinciden" : "todos"} ({pend.length})</span>
          </label>
          <span className="fc-dep-nota">Depurar es solo de quien administra: anular, no se factura o eliminar.</span>
        </div>
      )}

      {!puedeConfirmar && (
        <p className="fc-solo-ver">
          Puedes ver la bandeja, pero confirmar la salida es de facturación: pide el rol
          Facturación en Administración → Roles.
        </p>
      )}

      <section className="fc-lista" aria-label="Viajes por facturar">
        {pend.length === 0 ? (
          <div className="fc-vacio">
            {busca ? <>Ningún viaje por facturar coincide con «{busca}».</> : <>Nada pendiente.</>}
          </div>
        ) : pend.map((v) => (
          <Pendiente key={v.id} v={v} nombres={nombres} puede={puedeConfirmar}
                     depurar={puedeDepurar ? { marcado: sel.has(v.id), marcar: () => marcar(v.id) } : null}
                     listo={(m) => avisar.bien(m)} fallo={(m) => avisar.mal(m)} />
        ))}
      </section>

      {puedeDepurar && sel.size > 0 && (
        <Depurar ids={[...sel]} viajes={pendientes.filter((v) => sel.has(v.id))} limpiar={() => setSel(new Set())}
                 listo={(m) => avisar.bien(m)} fallo={(m) => avisar.mal(m)} />
      )}

      <section className="fc-salieron">
        <h2>Salieron <span>· últimos tres días</span></h2>
        {sal.length === 0 ? (
          <div className="fc-vacio">
            {busca ? <>Ninguna salida reciente coincide con «{busca}».</> : <>Todavía no hay salidas confirmadas.</>}
          </div>
        ) : sal.map((v) => (
          <Salido key={v.id} v={v} puedeReabrir={puedeReabrir}
                  listo={(m) => avisar.bien(m)} fallo={(m) => avisar.mal(m)} />
        ))}
      </section>
    </div>
  );
}

/* =====================================================================
   UN VIAJE ESPERANDO SU NÚMERO
   ===================================================================== */
function Pendiente({ v, nombres, puede, depurar, listo, fallo }: {
  v: Viaje;
  depurar: { marcado: boolean; marcar: () => void } | null;
  nombres: Record<string, string>;
  puede: boolean;
  listo: (m: string) => void;
  fallo: (m: string) => void;
}) {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [mandando, setMandando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (!numero || mandando) return;
    setMandando(true);
    setError(null);
    const { error } = await createClient().rpc("traspaso_confirmar_salida", {
      p_id: v.id, p_documento: numero,
    });
    setMandando(false);
    if (error) {
      const m = /could not find the function|schema cache/i.test(error.message)
        ? "Falta correr 2026-09-traspasos-facturacion.sql en Supabase."
        : /traspasos_viajes_factura_unico|duplicate key/i.test(error.message)
          ? `El documento ${numero} ya está en otro viaje.`
          : error.message;
      setError(m);
      fallo(m);
      return;
    }
    listo(`Salió: ${v.placa ?? "el viaje"} con el documento ${numero}.`);
    router.refresh();
  }

  return (
    <article className={"fc-viaje" + (depurar ? " con-check" : "") + (depurar?.marcado ? " marcado" : "")}>
      {depurar && (
        <label className="fc-check solo" title="Seleccionar para depurar">
          <input type="checkbox" checked={depurar.marcado} onChange={depurar.marcar}
                 aria-label={`Seleccionar ${v.codigo ?? v.placa ?? "viaje"}`} />
        </label>
      )}
      <div className="fc-datos">
        {/* LA PLACA ARRIBA: el registro ya no lleva orden de cargue, y
            es la placa lo que facturación tiene al frente. Los viajes
            de antes que sí la traen la muestran debajo. */}
        <p className="fc-oc">
          <span>PLACA</span>
          <b>{v.placa ?? "—"}</b>
          {v.codigo && <code className="fc-cod" title="Código del viaje">{v.codigo}</code>}
        </p>
        {v.documento && <p className="fc-placa">Orden de cargue {v.documento}</p>}
        <p className="fc-meta">
          {dia(v.fecha)} · turno {v.turno} · {hora(v.hora)}
          {v.tipo_nombre && <> · {v.tipo_nombre}</>}
          {v.carga != null && <> · {nf.format(v.carga)} {v.unidad ?? "und"}</>}
        </p>
        <p className="fc-meta">{ruta(v)} · registró {quien(nombres, v.registrado_por)}</p>
      </div>

      {puede && (
        <form className="fc-confirmar" onSubmit={(e) => { e.preventDefault(); confirmar() }}>
          <label>
            <span>Número de documento</span>
            <input value={numero} onChange={(e) => { setNumero(limpio(e.target.value)); setError(null) }}
                   inputMode="numeric" maxLength={10} autoComplete="off" spellCheck={false}
                   placeholder="Hasta 10 cifras" aria-invalid={error ? true : undefined} />
          </label>
          <button type="submit" className="btn si" disabled={!numero || mandando}>
            {mandando ? "Confirmando…" : "Confirmar salida"}
          </button>
          {error && <p className="fc-error" role="alert">{error}</p>}
        </form>
      )}
    </article>
  );
}

/* =====================================================================
   UN VIAJE QUE YA SALIÓ — y, para quien administra, reabrirlo
   ===================================================================== */
function Salido({ v, puedeReabrir, listo, fallo }: {
  v: Viaje;
  puedeReabrir: boolean;
  listo: (m: string) => void;
  fallo: (m: string) => void;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [mandando, setMandando] = useState(false);

  async function reabrir() {
    setMandando(true);
    const { error } = await createClient().rpc("traspaso_reabrir_salida", {
      p_id: v.id, p_motivo: motivo.trim(),
    });
    setMandando(false);
    if (error) { fallo(error.message); return }
    setAbierto(false);
    listo(`${v.placa ?? "El viaje"} volvió a la bandeja: se puede corregir en el patio y confirmar otra vez.`);
    router.refresh();
  }

  return (
    <article className="fc-salido">
      <div className="fc-salido-fila">
        <p className="fc-doc"><span>DOCUMENTO</span><b>{v.factura_documento}</b></p>
        <p className="fc-meta">
          <b>{v.placa ?? "—"}</b>{v.codigo && <> · <code className="fc-cod">{v.codigo}</code></>}{v.documento && <> · orden {v.documento}</>} · {dia(v.fecha)} turno {v.turno}
          <br />
          Salió a las {v.salida_en ? hora(v.salida_en) : "—"}
          {v.salida_nombre && <> · confirmó {v.salida_nombre}</>}
        </p>
        {puedeReabrir && (
          <button type="button" className="btn chico" aria-expanded={abierto}
                  onClick={() => setAbierto(!abierto)}>
            {abierto ? "Cancelar" : "Reabrir"}
          </button>
        )}
      </div>
      {puedeReabrir && abierto && (
        <div className="fc-reabrir">
          <label>
            <span>¿Por qué se reabre?</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200}
                   placeholder="Número equivocado, placa del otro camión…" autoFocus />
          </label>
          <p>
            El viaje vuelve a la bandeja sin número. Mientras tanto el patio puede corregirlo o
            anularlo, y facturación lo confirma otra vez. Queda escrito quién lo reabrió y por qué.
          </p>
          <button type="button" className="btn si" disabled={motivo.trim().length < 5 || mandando}
                  onClick={reabrir}>
            {mandando ? "Reabriendo…" : "Reabrir la salida"}
          </button>
        </div>
      )}
    </article>
  );
}

/* =====================================================================
   DEPURAR — la barra de abajo cuando quien administra marca viajes.

   Tres cosas y una sola barra: ANULAR (queda a la vista con su motivo),
   NO SE FACTURA (igual, pero el motivo dice por qué no lleva documento)
   y ELIMINAR (se borra de verdad y queda escrito en Administración ›
   Inicio). Siempre con motivo; eliminar pregunta otra vez. El candado de
   verdad está en la base: traspaso_depurar solo responde a manda().
   ===================================================================== */
type Accion = "anular" | "sin_factura" | "eliminar";
const ACCIONES: { k: Accion; rot: string; dice: string }[] = [
  { k: "anular", rot: "Anular", dice: "Queda a la vista como anulado, con el motivo. Sale de la bandeja y del cumplido." },
  { k: "sin_factura", rot: "No se factura", dice: "Se anula con «No se factura: …». Para viajes que no llevan documento." },
  { k: "eliminar", rot: "Eliminar", dice: "Se borra de verdad, con sus tipos. Queda escrito quién, cuándo y por qué." },
];

function Depurar({ ids, viajes, limpiar, listo, fallo }: {
  ids: string[]; viajes: Viaje[]; limpiar: () => void; listo: (m: string) => void; fallo: (m: string) => void;
}) {
  const router = useRouter();
  const [pedir, dialogo] = useConfirmar();
  const [accion, setAccion] = useState<Accion>("anular");
  const [motivo, setMotivo] = useState("");
  const [mandando, setMandando] = useState(false);
  const n = ids.length;
  const a = ACCIONES.find((x) => x.k === accion)!;

  async function hacer() {
    if (motivo.trim().length < 5 || mandando) return;
    if (accion === "eliminar" && !(await pedir({
      titulo: `¿Eliminar ${n} viaje${n === 1 ? "" : "s"}?`,
      dice: <>Se borra{n === 1 ? "" : "n"} de verdad: {viajes.slice(0, 6).map((v) => v.codigo ?? v.placa).join(", ")}{n > 6 ? "…" : ""}. No se puede deshacer.</>,
      confirmar: "Eliminar", peligro: true,
    }))) return;
    setMandando(true);
    const { data, error } = await createClient().rpc("traspaso_depurar", { p_ids: ids, p_accion: accion, p_motivo: motivo.trim() });
    setMandando(false);
    if (error) {
      fallo(/could not find the function|schema cache/i.test(error.message)
        ? "Falta correr 2026-09-traspasos-depurar.sql en Supabase." : error.message);
      return;
    }
    const k = Number(data ?? n);
    listo(`${k} viaje${k === 1 ? "" : "s"} ${accion === "eliminar" ? "eliminado" : "anulado"}${k === 1 ? "" : "s"}.`);
    setMotivo(""); limpiar(); router.refresh();
  }

  return (
    <div className="fc-dep" role="region" aria-label="Depurar viajes seleccionados">
      {dialogo}
      <div className="fc-dep-in">
        <p className="fc-dep-n"><b>{n}</b> seleccionado{n === 1 ? "" : "s"}</p>
        <div className="fc-dep-seg" role="radiogroup" aria-label="Qué hacer">
          {ACCIONES.map((x) => (
            <button key={x.k} type="button" role="radio" aria-checked={accion === x.k}
                    className={(accion === x.k ? "on" : "") + (x.k === "eliminar" ? " peligro" : "")}
                    onClick={() => setAccion(x.k)}>{x.rot}</button>
          ))}
        </div>
        <input className="fc-dep-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200}
               placeholder="Motivo (obligatorio): duplicado, prueba, viaje interno…" aria-label="Motivo" />
        <div className="fc-dep-bot">
          <button type="button" className="btn" onClick={limpiar}>Quitar selección</button>
          <button type="button" className={"btn si" + (accion === "eliminar" ? " peligro" : "")}
                  disabled={motivo.trim().length < 5 || mandando} onClick={hacer}>
            {mandando ? "Haciendo…" : `${a.rot} ${n}`}
          </button>
        </div>
        <p className="fc-dep-dice">{a.dice}</p>
      </div>
    </div>
  );
}
