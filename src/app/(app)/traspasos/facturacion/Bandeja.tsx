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

export function Bandeja({ pendientes, salieron, nombres, puedeConfirmar, puedeReabrir }: {
  pendientes: Viaje[];
  salieron: Viaje[];
  nombres: Record<string, string>;
  puedeConfirmar: boolean;
  puedeReabrir: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [avisar, avisos] = useAvisos();
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
                     listo={(m) => avisar.bien(m)} fallo={(m) => avisar.mal(m)} />
        ))}
      </section>

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
function Pendiente({ v, nombres, puede, listo, fallo }: {
  v: Viaje;
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
    <article className="fc-viaje">
      <div className="fc-datos">
        {/* LA PLACA ARRIBA: el registro ya no lleva orden de cargue, y
            es la placa lo que facturación tiene al frente. Los viajes
            de antes que sí la traen la muestran debajo. */}
        <p className="fc-oc">
          <span>PLACA</span>
          <b>{v.placa ?? "—"}</b>
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
          <b>{v.placa ?? "—"}</b>{v.documento && <> · orden {v.documento}</>} · {dia(v.fecha)} turno {v.turno}
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
