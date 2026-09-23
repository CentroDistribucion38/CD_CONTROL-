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
import { Depurar } from "../Depurar";
import type { Viaje } from "@/modulos/traspasos/datos";
/* placaClave y Cedula salen de formato.ts y NO de datos.ts: datos.ts es
   del servidor —pide next/headers— y esta pantalla es "use client".
   Importar de allá se arrastra el módulo del servidor al navegador. */
import { quien, placaClave, type Cedula, type EnBascula } from "@/modulos/traspasos/formato";

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

export function Bandeja({ pendientes, salieron, nombres, cedulas = {}, bascula = {},
                         faltaCedulas = false,
                         puedeConfirmar, puedeReabrir, puedeDepurar = false }: {
  pendientes: Viaje[];
  salieron: Viaje[];
  nombres: Record<string, string>;
  /** Las cédulas de vidrio sin despachar, agrupadas por placa normalizada. */
  cedulas?: Record<string, Cedula[]>;
  /** Las salidas de vidrio que siguen ABIERTAS en la báscula, por placa.
   *  No se pueden despachar, pero hay que decir que están ahí. */
  bascula?: Record<string, EnBascula[]>;
  /** La migración del vidrio todavía no se ha corrido en esta base. */
  faltaCedulas?: boolean;
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

      {/* SI FALTA LA MIGRACIÓN DEL VIDRIO, SE DICE Y SE SIGUE TRABAJANDO.
          La bandeja confirma sin cédula, que es como trabajaba ayer.
          Quitarle a facturación la pantalla entera por esto sería cambiar
          un aviso por una pared. */}
      {faltaCedulas && puedeConfirmar && (
        <p className="fc-falta-vidrio">
          El vidrio todavía no sale con el viaje: falta correr{" "}
          <code>supabase/migraciones/2026-09-vidrio-cedula-facturacion.sql</code> en Supabase.
          Mientras tanto se confirma la salida sin cédula, como siempre.
        </p>
      )}

      <section className="fc-lista" aria-label="Viajes por facturar">
        {pend.length === 0 ? (
          <div className="fc-vacio">
            {busca ? <>Ningún viaje por facturar coincide con «{busca}».</> : <>Nada pendiente.</>}
          </div>
        ) : pend.map((v) => (
          <Pendiente key={v.id} v={v} nombres={nombres} puede={puedeConfirmar}
                     cedulas={cedulas[placaClave(v.placa)] ?? []}
                     bascula={bascula[placaClave(v.placa)] ?? []}
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
function Pendiente({ v, nombres, puede, cedulas, bascula, depurar, listo, fallo }: {
  v: Viaje;
  depurar: { marcado: boolean; marcar: () => void } | null;
  nombres: Record<string, string>;
  /** Las cédulas de vidrio sin despachar de ESTA placa. Casi siempre vacío. */
  cedulas: Cedula[];
  /** Lo que esta placa tiene en la báscula, sin cerrar. */
  bascula: EnBascula[];
  puede: boolean;
  listo: (m: string) => void;
  fallo: (m: string) => void;
}) {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [mandando, setMandando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* EL VIDRIO. Si la placa no tiene nada pendiente, nada de esto se
     pinta: la inmensa mayoría de los viajes no llevan tolvas y una
     casilla vacía en cada tarjeta sería ruido en cincuenta tarjetas.

     CUANDO HAY UNA SOLA —que es el caso normal— VIENE ESCOGIDA. Obligar
     a abrir un desplegable de un solo renglón es hacer tocar dos veces
     para decir lo único que se podía decir. */
  const hayVidrio = cedulas.length > 0;
  /* EN LA BÁSCULA. No es una cédula todavía —el número de tolvas puede
     cambiar hasta que quien pesó cierre— pero facturación tiene que
     saber que está ahí. Se pinta aunque también haya cédulas listas:
     son cosas distintas y puede haber las dos a la vez. */
  const enBascula = bascula.length > 0;
  const [cedulaId, setCedulaId] = useState<string>(cedulas.length === 1 ? cedulas[0].id : "");
  const [tolvas, setTolvas] = useState("");
  const ced = cedulas.find((c) => c.id === cedulaId) ?? null;

  /* LAS TOLVAS NO VIENEN PUESTAS A PROPÓSITO. Poner el número que dice
     la cédula y pedir que lo confirmen es pedirle a alguien que apruebe
     su propia respuesta: se toca «Confirmar» sin mirar el camión y el
     freno no frena nada. El número lo pone quien cuenta. */
  const contadas = tolvas === "" ? null : Number(tolvas);
  const cuadra = ced != null && contadas != null && contadas === ced.tolvas;
  const listoParaMandar = !!numero && (!hayVidrio || cuadra);

  async function confirmar() {
    if (!listoParaMandar || mandando) return;
    setMandando(true);
    setError(null);
    const { error } = await createClient().rpc("traspaso_confirmar_salida", {
      p_id: v.id, p_documento: numero,
      ...(hayVidrio ? { p_cedula: cedulaId, p_tolvas: contadas } : {}),
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
    listo(hayVidrio
      ? `Salió: ${v.placa ?? "el viaje"} con el documento ${numero} y la cédula ${ced?.cedula} (${contadas} tolva${contadas === 1 ? "" : "s"}).`
      : `Salió: ${v.placa ?? "el viaje"} con el documento ${numero}.`);
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
        <form className={"fc-confirmar" + (hayVidrio || enBascula ? " con-vidrio" : "")}
              onSubmit={(e) => { e.preventDefault(); confirmar() }}>

          {/* EL VIDRIO VA ANTES DEL NÚMERO, y no es un detalle de
              maquetación: es el orden en que pasa. Primero se mira el
              camión y se cuentan las tolvas, después se escribe el
              documento y sale. Con el número arriba, el campo que ya se
              sabe llenar se llena primero y el del camión se toca de
              afán. */}
          {/* LO QUE ESTÁ EN LA BÁSCULA, ANTES QUE TODO. Es lo único de
              esta tarjeta que dice «espera»: si va debajo del número, se
              lee cuando el documento ya está escrito. */}
          {enBascula && (
            <div className="fc-bascula">
              <p className="fc-bascula-ojo">ESTE VH TIENE VIDRIO EN LA BÁSCULA, SIN CERRAR</p>
              <ul>
                {bascula.map((b) => (
                  <li key={b.id}>
                    <b>{b.cedula}</b>
                    <span>{b.tolvas} tolva{b.tolvas === 1 ? "" : "s"} pesada
                      {b.tolvas === 1 ? "" : "s"} · {nf.format(b.neto_kg)} kg</span>
                    {b.horas_abierta >= 2 && <em>lleva {b.horas_abierta} h abierta</em>}
                  </li>
                ))}
              </ul>
              <p className="fc-bascula-que">
                Todavía no se puede despachar: quien pesó tiene que <b>cerrarla</b> en
                Quiebra → Salida → Pesar. Apenas la cierre aparece aquí para escogerla.
              </p>
            </div>
          )}

          {hayVidrio && (
            <div className="fc-vidrio">
              <p className="fc-vidrio-ojo">
                ESTE VH LLEVA VIDRIO
                {cedulas.length > 1 && <span> · {cedulas.length} cédulas pendientes</span>}
              </p>

              {cedulas.length > 1 ? (
                <label>
                  <span>Cédula de la salida</span>
                  <select value={cedulaId}
                          onChange={(e) => { setCedulaId(e.target.value); setTolvas(""); setError(null) }}>
                    <option value="">Escoge la cédula…</option>
                    {cedulas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.cedula} · {c.tolvas} tolva{c.tolvas === 1 ? "" : "s"} · {nf.format(c.neto_kg)} kg
                        {c.dias_esperando > 0 && ` · lleva ${c.dias_esperando} día${c.dias_esperando === 1 ? "" : "s"}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="fc-cedula-una">
                  Cédula <b>{cedulas[0].cedula}</b>
                  {cedulas[0].dias_esperando > 0 &&
                    <span className="fc-espera"> · lleva {cedulas[0].dias_esperando} día
                      {cedulas[0].dias_esperando === 1 ? "" : "s"} esperando</span>}
                </p>
              )}

              {ced && (
                <div className="fc-cuenta">
                  {/* LO PESADO EN GRANDE, A LA IZQUIERDA. Es contra lo
                      que se cuenta, así que tiene que leerse de un
                      vistazo desde el muelle. */}
                  <p className="fc-pesadas">
                    <span>PESADAS</span>
                    <b>{ced.tolvas}</b>
                    <i>{nf.format(ced.neto_kg)} kg</i>
                  </p>
                  <label>
                    <span>¿Cuántas lleva el Vh?</span>
                    <input value={tolvas}
                           onChange={(e) => { setTolvas(e.target.value.replace(/\D/g, "").slice(0, 3)); setError(null) }}
                           inputMode="numeric" maxLength={3} autoComplete="off"
                           placeholder="Cuéntalas"
                           aria-invalid={contadas != null && !cuadra ? true : undefined} />
                  </label>
                  {/* EL AVISO SOLO APARECE CUANDO YA SE CONTÓ. Un «no
                      cuadra» en rojo sobre un campo vacío regaña por no
                      haber empezado. */}
                  {contadas != null && (
                    <p className={"fc-cuadra" + (cuadra ? " si" : " no")} role="status">
                      {cuadra
                        ? <>Cuadra: {ced.tolvas} y {ced.tolvas}.</>
                        : <>No cuadra: la cédula tiene <b>{ced.tolvas}</b> y contaste <b>{contadas}</b>.
                            El Vh no sale hasta que cuadre.</>}
                    </p>
                  )}
                  {ced.observacion && <p className="fc-obs">Nota del pesaje: {ced.observacion}</p>}
                </div>
              )}
            </div>
          )}

          <label className="fc-numero">
            <span>Número de documento</span>
            <input value={numero} onChange={(e) => { setNumero(limpio(e.target.value)); setError(null) }}
                   inputMode="numeric" maxLength={10} autoComplete="off" spellCheck={false}
                   placeholder="Hasta 10 cifras" aria-invalid={error ? true : undefined} />
          </label>
          <button type="submit" className="btn si" disabled={!listoParaMandar || mandando}>
            {mandando ? "Confirmando…" : hayVidrio ? "Confirmar salida y despachar" : "Confirmar salida"}
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
