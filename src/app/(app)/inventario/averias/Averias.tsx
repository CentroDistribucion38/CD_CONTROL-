"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { AveriaFila, CausalFila, ProductoFila } from "@/modulos/averias/datos";

/**
 * AVERÍAS — lo que se dañó en la bodega, y su baja.
 *
 * LA PANTALLA SE ORGANIZA POR EL ESTADO DE LA BAJA, no por fecha, y
 * eso es la decisión de diseño entera:
 *
 *   SIN DOCUMENTO  la avería sigue contando en el inventario. Está
 *                  apartada en la bodega, nadie la va a vender, pero
 *                  el sistema cree que está. Esa diferencia es
 *                  exactamente lo que descuadra un conteo.
 *   CON DOCUMENTO  ya salió de la cuenta. Es historia.
 *
 * Por eso lo primero que se ve es CUÁNTAS ESTÁN SIN DAR DE BAJA y
 * cuántas cajas son. Una lista ordenada por fecha enseñaría arriba lo
 * de ayer —que no urge— y dejaría abajo lo de hace tres semanas, que
 * es justo lo que hay que ir a cobrar.
 */

const hoyBogota = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }))
    .toLocaleDateString("en-CA");

const dma = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
};
const pelado = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** LA CALLE ES LA LETRA. Misma regla que el motor de hallazgos: «A03 ·
 *  M12» es la calle A, y agrupar por «A03» reparte las averías de una
 *  misma calle en tantos grupos como módulos tenga. */
const calleDe = (u: string) => (u.trim().match(/^[A-Za-z]+/)?.[0] ?? u).toUpperCase();

type Vista = "pendientes" | "bajas" | "todas";

const VACIO = {
  ubicacion: "", sku: "", cajas: "", unidades: "",
  causal: "", reporto: "", vence: "", fecha: "", nota: "",
};

export function Averias({ lista, causales, productos, ubicaciones, puedeEditar, manda, quien }: {
  lista: AveriaFila[];
  causales: CausalFila[];
  productos: ProductoFila[];
  ubicaciones: string[];
  puedeEditar: boolean;
  manda: boolean;
  /** El nombre de quien está mirando: se propone como «reporta». */
  quien: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();

  const hoy = hoyBogota();
  const [vista, setVista] = useState<Vista>("pendientes");
  const [busca, setBusca] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState({ ...VACIO, reporto: quien, causal: causales[0]?.clave ?? "" });
  const [mandando, setMandando] = useState(false);

  const vivas = lista.filter((a) => !a.anulada_en);
  const pendientes = vivas.filter((a) => a.pendiente_baja);

  /* LAS CIFRAS DE ARRIBA SON LAS DE LA DEUDA, no las del total
     histórico: «cuántas averías hemos tenido» no es una pregunta que
     alguien tenga a las siete de la mañana. «Cuántas siguen contando
     en el inventario» sí. */
  const cajasPend = pendientes.reduce((s, a) => s + a.cajas, 0);
  const unidPend = pendientes.reduce((s, a) => s + a.unidades, 0);
  /* LA MÁS VIEJA SIN BAJA. Una sola cifra que dice si el papeleo está
     al día o si hay algo represado desde hace un mes. */
  const masVieja = pendientes.reduce<string | null>(
    (v, a) => (v === null || a.fecha < v ? a.fecha : v), null);
  const diasVieja = masVieja
    ? Math.round((Date.parse(hoy + "T12:00:00") - Date.parse(masVieja + "T12:00:00")) / 86400_000)
    : 0;
  /* LO QUE SE VENCE ESTANDO TODAVÍA SIN BAJA es lo peor de los dos
     mundos: producto que ya no sirve y que además sigue contando. */
  const venciendo = pendientes.filter(
    (a) => a.dias_para_vencer !== null && a.dias_para_vencer <= 30);

  const q = pelado(busca.trim());
  const vistas = useMemo(() => {
    const base = vista === "pendientes" ? pendientes
      : vista === "bajas" ? vivas.filter((a) => !a.pendiente_baja)
      : lista;
    if (!q) return base;
    return base.filter((a) => pelado(
      `${a.codigo} ${a.ubicacion} ${a.producto} ${a.producto_sku} ${a.reporto} ${a.causal_nombre} ${a.documento ?? ""}`
    ).includes(q));
  }, [vista, q, lista]);

  function abrirNueva() {
    setF({ ...VACIO, reporto: quien, causal: causales[0]?.clave ?? "" });
    setEditando(null);
    setRegistrando(true);
  }

  function abrirEditar(a: AveriaFila) {
    setRegistrando(false);
    setEditando(editando === a.id ? null : a.id);
    setF({
      ubicacion: a.ubicacion, sku: a.producto_sku,
      cajas: String(a.cajas), unidades: String(a.unidades),
      causal: a.causal, reporto: a.reporto,
      vence: a.vence ?? "", fecha: a.fecha, nota: a.nota ?? "",
    });
  }

  function falta(): string | null {
    if (!f.ubicacion.trim()) return "Falta la ubicación";
    if (!f.sku) return "Falta el producto";
    if ((Number(f.cajas) || 0) <= 0 && (Number(f.unidades) || 0) <= 0)
      return "Falta decir cuánto";
    if (!f.causal) return "Falta la causal";
    if (!f.reporto.trim()) return "Falta quién la reporta";
    return null;
  }

  async function guardar() {
    const m = falta();
    if (m) { avisar.mal(m + "."); return }
    setMandando(true);
    const args = {
      p_ubicacion: f.ubicacion.trim(),
      p_sku: f.sku,
      p_cajas: Number(f.cajas) || 0,
      p_unidades: Number(f.unidades) || 0,
      p_causal: f.causal,
      p_reporto: f.reporto.trim(),
      p_vence: f.vence || null,
      p_fecha: f.fecha || null,
      p_nota: f.nota.trim() || null,
    };
    const { data, error } = editando
      ? await supabase.rpc("averia_corregir", { p_id: editando, ...args })
      : await supabase.rpc("averia_registrar", args);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const fila = Array.isArray(data) ? data[0] : data;
    avisar.bien(editando ? "Corregida."
      : `${(fila?.codigo as string) ?? "La avería"} quedó registrada.`);
    setRegistrando(false); setEditando(null);
    router.refresh();
  }

  async function darBaja(a: AveriaFila) {
    /* EL NÚMERO SE PIDE CON `prompt` Y NO CON UN CAMPO EN LA FILA: es
       un dato que se teclea una vez en la vida de cada avería, mirando
       la pantalla de SAP que está al lado. Un campo permanente en cada
       renglón sería cien campos vacíos en la lista. */
    const doc = window.prompt(
      `Documento de baja de ${a.codigo} — ${a.producto}\n\n` +
      "Es el número de SAP. Con él, la avería deja de contar en el inventario.");
    if (doc === null) return;
    if (!doc.trim()) { avisar.mal("Sin número no hay baja."); return }
    setMandando(true);
    const { error } = await supabase.rpc("averia_dar_baja", { p_id: a.id, p_documento: doc.trim() });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${a.codigo} salió del inventario con el documento ${doc.trim()}.`);
    router.refresh();
  }

  async function quitarBaja(a: AveriaFila) {
    const motivo = window.prompt(
      `Quitarle el documento ${a.documento} a ${a.codigo}\n\n` +
      "Esto la devuelve a la cuenta del inventario. ¿Por qué?");
    if (motivo === null) return;
    if (!motivo.trim()) { avisar.mal("Hay que decir por qué."); return }
    setMandando(true);
    const { error } = await supabase.rpc("averia_quitar_baja", { p_id: a.id, p_motivo: motivo.trim() });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${a.codigo} vuelve a contar en el inventario.`);
    router.refresh();
  }

  async function anular(a: AveriaFila) {
    const motivo = window.prompt(`Anular ${a.codigo}\n\n¿Por qué?`);
    if (motivo === null) return;
    if (!motivo.trim()) { avisar.mal("Hay que decir por qué se anula."); return }
    setMandando(true);
    const { error } = await supabase.rpc("averia_anular", { p_id: a.id, p_motivo: motivo.trim() });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${a.codigo} quedó anulada. La fila se queda, con el motivo.`);
    router.refresh();
  }

  async function borrar(a: AveriaFila) {
    if (!(await pedir({
      titulo: `¿Borrar ${a.codigo}?`,
      dice: "Borrar es para el error de dedo del mismo día: se registró dos veces, " +
            "o se registró donde no era. Si de verdad pasó y ya no aplica, se ANULA — " +
            "así queda la fila y el motivo. Esto no se puede deshacer.",
      confirmar: "Borrar",
      peligro: true,
    }))) return;
    setMandando(true);
    const { error } = await supabase.rpc("averia_borrar", { p_id: a.id });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${a.codigo} se borró.`);
    router.refresh();
  }

  const formulario = (
    <div className="avr-form">
      <div className="avr-campos">
        <label className="avr-c">
          <span>Ubicación</span>
          <input list="avr-ubis" value={f.ubicacion} placeholder="A03 · M12"
                 onChange={(e) => setF({ ...f, ubicacion: e.target.value })} />
          {/* SE PROPONEN LAS QUE YA SE USARON, y no hay maestro de
              ubicaciones: un maestro obligaría a dar de alta la calle
              antes de poder registrar, y así es como se pierde el
              registro de algo que ya pasó. Proponerlas evita que la
              misma calle se escriba de cuatro formas, que es lo que
              revienta el hallazgo de concentración. */}
          <datalist id="avr-ubis">
            {ubicaciones.map((u) => <option key={u} value={u} />)}
          </datalist>
        </label>

        <label className="avr-c avr-ancho">
          <span>Producto</span>
          <select value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })}>
            <option value="">Escoge el producto…</option>
            {productos.map((p) => (
              <option key={p.sku} value={p.sku}>{p.sku} — {p.nombre}</option>
            ))}
          </select>
        </label>

        <label className="avr-c">
          <span>Cajas</span>
          <input type="number" inputMode="numeric" min={0} value={f.cajas}
                 onChange={(e) => setF({ ...f, cajas: e.target.value })} />
        </label>
        <label className="avr-c">
          <span>Unidades sueltas</span>
          <input type="number" inputMode="numeric" min={0} value={f.unidades}
                 onChange={(e) => setF({ ...f, unidades: e.target.value })} />
        </label>

        <label className="avr-c">
          <span>Se vence</span>
          <input type="date" value={f.vence}
                 onChange={(e) => setF({ ...f, vence: e.target.value })} />
        </label>
        <label className="avr-c">
          <span>Día en que pasó</span>
          {/* LA FECHA DEL HECHO, no la de hoy: una avería que se
              encuentra el lunes y se registra el miércoles pasó el
              lunes, y el informe del mes tiene que contarla en su día. */}
          <input type="date" max={hoy} value={f.fecha || hoy}
                 onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </label>
      </div>

      <div className="avr-c">
        <span>Causal</span>
        <div className="avr-seg">
          {causales.map((c) => (
            <button key={c.clave} type="button"
                    className={f.causal === c.clave ? "on" : ""}
                    onClick={() => setF({ ...f, causal: c.clave })}>
              {c.nombre}
              {/* SI LA CULPA ES DE AFUERA se dice aquí: es lo que
                  decide a quién se le cobra, y no se puede sacar del
                  nombre sin adivinar. */}
              {c.externa && <em>llega averiado</em>}
            </button>
          ))}
        </div>
      </div>

      <div className="avr-campos">
        <label className="avr-c">
          <span>La reporta</span>
          <input value={f.reporto} onChange={(e) => setF({ ...f, reporto: e.target.value })} />
        </label>
        <label className="avr-c avr-ancho">
          <span>Nota — opcional</span>
          <input value={f.nota} placeholder="La estiba se cayó del montacargas"
                 onChange={(e) => setF({ ...f, nota: e.target.value })} />
        </label>
      </div>

      <div className="avr-acciones">
        <button type="button" className="btn" disabled={mandando} onClick={guardar}>
          {mandando ? "Guardando…" : falta() ?? (editando ? "Guardar" : "Registrar la avería")}
        </button>
        <button type="button" className="btn plano"
                onClick={() => { setRegistrando(false); setEditando(null) }}>
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <>
      {avisos}{dialogo}

      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · AVERÍAS</p>
          <h1>Lo que se dañó, y si ya salió de la cuenta</h1>
          <p className="sub">
            Mientras una avería no tenga <b>documento de baja</b>, sigue contando en el
            inventario: está apartada en la bodega y nadie la va a vender, pero el sistema
            cree que está. Esa diferencia es la que descuadra un conteo, y es lo que esta
            pantalla pone primero.
          </p>
        </div>
        <div className="kpi">
          <i className="corte" />
          <div className="rot">SIN DAR DE BAJA</div>
          <div className="num">{pendientes.length}</div>
          <div className="pie">
            {cajasPend} cajas{unidPend > 0 && ` y ${unidPend} unidades`} que todavía cuentan
          </div>
        </div>
      </section>

      {/* LAS TRES CIFRAS QUE CAMBIAN LO QUE SE HACE HOY. No son «cuántas
          averías hemos tenido» —eso no es una pregunta que alguien
          tenga a las siete de la mañana— sino qué está represado. */}
      <div className="avr-cifras">
        <div className={"avr-cif" + (diasVieja > 15 ? " avr-alerta" : "")}>
          <span className="avr-rot">LA MÁS VIEJA SIN BAJA</span>
          <b>{masVieja ? `${diasVieja} días` : "—"}</b>
          <span className="avr-pie">
            {masVieja
              ? `desde el ${dma(masVieja)}. Cada día que pasa es inventario que no cuadra.`
              : "no hay ninguna pendiente"}
          </span>
        </div>
        <div className={"avr-cif" + (venciendo.length > 0 ? " avr-alerta" : "")}>
          <span className="avr-rot">SE VENCEN Y SIGUEN CONTANDO</span>
          <b>{venciendo.length}</b>
          <span className="avr-pie">
            {venciendo.length
              ? "producto que ya no sirve y que además no ha salido de la cuenta"
              : "ninguna de las pendientes se vence en 30 días"}
          </span>
        </div>
        <div className="avr-cif">
          <span className="avr-rot">DÓNDE SE CONCENTRAN</span>
          <b>{(() => {
            const m = new Map<string, number>();
            for (const a of pendientes) m.set(calleDe(a.ubicacion),
              (m.get(calleDe(a.ubicacion)) ?? 0) + a.cajas);
            const top = [...m.entries()].sort((x, y) => y[1] - x[1])[0];
            return top ? `Calle ${top[0]}` : "—";
          })()}</b>
          <span className="avr-pie">
            la calle con más cajas averiadas sin dar de baja
          </span>
        </div>
      </div>

      <div className="fe-barra">
        <div className="fe-pes">
          {([["pendientes", "Sin dar de baja", pendientes.length],
             ["bajas", "Ya dadas de baja", vivas.length - pendientes.length],
             ["todas", "Todas", lista.length]] as const).map(([v, txt, n]) => (
            <button key={v} type="button" className={vista === v ? "on" : ""}
                    onClick={() => setVista(v as Vista)}>
              {txt} <em>{n}</em>
            </button>
          ))}
        </div>
        <label className="fe-busca">
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
                 placeholder="Buscar por código, ubicación, producto o documento"
                 aria-label="Buscar una avería" />
        </label>
        {puedeEditar && !registrando && (
          <button type="button" className="btn" onClick={abrirNueva}>+ Registrar avería</button>
        )}
      </div>

      {registrando && formulario}

      <p className="fe-cuenta">
        {vistas.length} {vistas.length === 1 ? "avería" : "averías"}
        {q && ` que dicen «${busca}»`}
      </p>

      <div className="fe-lista">
        {vistas.length === 0 && (
          <p className="fe-vacio">
            {lista.length === 0
              ? "Todavía no hay averías registradas. La primera se agrega con el botón de arriba."
              : vista === "pendientes"
              ? "Ninguna pendiente: todo lo averiado ya tiene su documento de baja."
              : "Ninguna con ese filtro."}
          </p>
        )}

        {vistas.map((a) => {
          const vencido = a.dias_para_vencer !== null && a.dias_para_vencer < 0;
          const pronto = a.dias_para_vencer !== null
            && a.dias_para_vencer >= 0 && a.dias_para_vencer <= 30;
          return (
            <article key={a.id}
                     className={"avr-fila" + (a.anulada_en ? " avr-anulada" : "")}>
              <div className="avr-cod">
                <b>{a.codigo}</b>
                <span>{dma(a.fecha)}</span>
              </div>

              <div className="avr-que">
                <div className="avr-tit">{a.producto}</div>
                <div className="avr-meta">
                  <span className="avr-ubi">{a.ubicacion}</span>
                  <span>·</span>
                  <span>
                    {a.cajas > 0 && `${a.cajas} ${a.cajas === 1 ? "caja" : "cajas"}`}
                    {a.cajas > 0 && a.unidades > 0 && " y "}
                    {a.unidades > 0 && `${a.unidades} ${a.unidades === 1 ? "unidad" : "unidades"}`}
                  </span>
                  <span>·</span>
                  <span className={a.externa ? "avr-ext" : ""}>{a.causal_nombre}</span>
                  <span>·</span>
                  <span>{a.reporto}</span>
                  {a.nota && <><span>·</span><span>{a.nota}</span></>}
                </div>
                {a.anulada_en && (
                  <div className="avr-motivo">ANULADA — {a.motivo_anulacion}</div>
                )}
              </div>

              <div className="avr-estado">
                {a.anulada_en ? (
                  <span className="avr-eti avr-gris">ANULADA</span>
                ) : a.pendiente_baja ? (
                  <>
                    <span className="avr-eti avr-esp">SIN DAR DE BAJA</span>
                    <span className="avr-sub">sigue contando en el inventario</span>
                  </>
                ) : (
                  <>
                    <span className="avr-eti avr-ok">DE BAJA</span>
                    <span className="avr-sub">
                      {a.documento}
                      {a.dias_baja !== null && ` · ${a.dias_baja} ${a.dias_baja === 1 ? "día" : "días"}`}
                    </span>
                  </>
                )}
                {/* EL VENCIMIENTO SOLO SE DICE CUANDO IMPORTA. Una fecha
                    lejana en cada renglón es ruido; una vencida o a
                    punto es lo que hace mover a alguien. */}
                {(vencido || pronto) && !a.anulada_en && (
                  <span className={"avr-eti " + (vencido ? "avr-mal" : "avr-ojo")}>
                    {vencido ? "VENCIDO" : `VENCE EN ${a.dias_para_vencer} D`}
                  </span>
                )}
              </div>

              {puedeEditar && !a.anulada_en && (
                <div className="avr-btns">
                  {a.pendiente_baja ? (
                    <button type="button" className="btn" disabled={mandando}
                            onClick={() => darBaja(a)}>
                      Dar de baja
                    </button>
                  ) : manda && (
                    <button type="button" className="btn plano" disabled={mandando}
                            onClick={() => quitarBaja(a)}>
                      Quitar la baja
                    </button>
                  )}
                  {manda && (
                    <>
                      <button type="button" className="btn plano" onClick={() => abrirEditar(a)}>
                        {editando === a.id ? "Cerrar" : "Editar"}
                      </button>
                      <button type="button" className="btn plano" disabled={mandando}
                              onClick={() => anular(a)}>
                        Anular
                      </button>
                      {/* BORRAR SOLO MIENTRAS NO TENGA DOCUMENTO. Con
                          documento, borrarla deja ese número de SAP
                          apuntando a algo que no existe. */}
                      {a.pendiente_baja && (
                        <button type="button" className="btn plano avr-borrar" disabled={mandando}
                                onClick={() => borrar(a)}>
                          Borrar
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {editando === a.id && <div className="avr-editando">{formulario}</div>}
            </article>
          );
        })}
      </div>
    </>
  );
}
