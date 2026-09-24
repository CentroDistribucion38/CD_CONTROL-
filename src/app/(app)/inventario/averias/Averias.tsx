"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { usePedirTexto } from "@/components/PedirTexto";
import { BuscarEnLista } from "@/components/BuscarEnLista";
import type {
  AveriaFila, CausalFila, ProductoFila, UbicacionFila,
} from "@/modulos/averias/datos";

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

/**
 * LA CALLE DE UNA AVERÍA.
 *
 * AHORA VIENE DE LA COLUMNA, no de adivinarla partiendo el texto. La
 * ubicación sale del maestro de Inventario y trae `calle` de verdad;
 * la expresión se queda SOLO para las averías viejas, registradas
 * cuando la ubicación se tecleaba a mano y podía decir «A3 M12» o
 * «a03-m12». Sin ese respaldo esas filas se agruparían bajo una calle
 * vacía y el tablero diría que no hay concentración en ninguna parte.
 */
const calleDe = (a: { calle?: string | null; ubicacion: string }) =>
  a.calle ?? (a.ubicacion.trim().match(/^[A-Za-z]+/)?.[0] ?? a.ubicacion).toUpperCase();

type Vista = "pendientes" | "bajas" | "todas";

const VACIO = {
  /* LA UBICACIÓN SON TRES COSAS y se escogen en cascada: calle →
     módulo → lado. Es el mismo gesto del maestro de Inventario, y es
     el orden en que se camina la bodega. Un solo desplegable con las
     428 ubicaciones juntas sería la misma lista de treinta pantallazos
     que ya obligó a poner un buscador en el producto. */
  calle: "", modulo: "", lado: "", ubicacion_id: "",
  sku: "", cajas: "", unidades: "",
  causal: "", reporto: "", vence: "", nota: "",
  /* «PASÓ ANTES» NO ESTÁ EN EL FORMULARIO: aparece solo si alguien lo
     pide. La fecha, la hora y el turno los pone la base. */
  paso_antes: "",
};

export function Averias({ lista, causales, productos, ubicaciones, puedeEditar, manda, quien,
                          modo = "tablero" }: {
  lista: AveriaFila[];
  causales: CausalFila[];
  productos: ProductoFila[];
  ubicaciones: UbicacionFila[];
  puedeEditar: boolean;
  manda: boolean;
  /** El nombre de quien está mirando: se propone como «reporta». */
  quien: string;
  /**
   * LA MISMA PIEZA EN DOS PANTALLAS, y no dos copias.
   *
   *   registrar  el formulario abierto y SOLO lo de hoy al lado. Quien
   *              entra a registrar viene a registrar: las pestañas y
   *              el buscador son tres toques antes del primer campo.
   *   tablero    todo lo que existe, con sus estados y sus filtros.
   *              Es donde se da de baja, se corrige y se anula.
   *
   * Dos componentes separados serían dos copias del formulario y de la
   * fila, y el día que se agregue un campo habría que acordarse de las
   * dos. Lo que cambia entre una pantalla y otra es POCO: qué se ve
   * primero y qué lista se enseña.
   */
  modo?: "registrar" | "tablero";
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const [pedirTexto, cuadro] = usePedirTexto();

  const hoy = hoyBogota();
  const [vista, setVista] = useState<Vista>("pendientes");
  const [busca, setBusca] = useState("");
  /* EN «REGISTRAR» EL FORMULARIO ABRE PUESTO: la pantalla se llama
     Registrar; obligar a tocar un «+» primero es un toque cobrado por
     nada, con guante. */
  const [registrando, setRegistrando] = useState(modo === "registrar");
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState({ ...VACIO, reporto: quien, causal: causales[0]?.clave ?? "" });
  /* «PASÓ ANTES» ESCONDIDO POR DEFECTO. Es el caso raro, y un campo de
     fecha permanente en el formulario es exactamente lo que se acaba de
     quitar: quien lo ve, lo llena. */
  const [pideAntes, setPideAntes] = useState(false);

  /* ---------- LA UBICACIÓN EN CASCADA ----------
     Las tres listas salen del MISMO maestro y se estrechan entre ellas.
     Se calculan aquí y no dentro del JSX: metidas en el render se
     recalculan en cada tecla del campo de la nota. */
  const calles = useMemo(
    () => [...new Set(ubicaciones.map((u) => u.calle))].sort(),
    [ubicaciones]);
  const modulos = useMemo(
    () => [...new Set(ubicaciones.filter((u) => u.calle === f.calle).map((u) => u.modulo))].sort(),
    [ubicaciones, f.calle]);
  const lados = useMemo(
    () => ubicaciones.filter((u) => u.calle === f.calle && u.modulo === f.modulo),
    [ubicaciones, f.calle, f.modulo]);

  /* AYER, EN HORA DE COLOMBIA: es el tope de «pasó antes». Hoy no vale
     —para eso está la fecha del registro— y mañana menos. */
  const ayer = new Date(Date.parse(hoy + "T12:00:00") - 86400_000).toLocaleDateString("en-CA");
  const hoyLargo = new Date(hoy + "T12:00:00").toLocaleDateString("es-CO",
    { day: "numeric", month: "long", year: "numeric" });
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

  /* LO DE HOY, para la pantalla de registrar: quien acaba de cargar
     una quiere verla aparecer, y quien lleva cinco quiere no repetir
     la misma. El histórico entero ahí sería tres pantallazos de ruido. */
  const deHoy = lista.filter((a) => a.fecha === hoy && !a.anulada_en);

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
      /* LA UBICACIÓN VUELVE DESDE EL MAESTRO, no desde el texto: si la
         avería es vieja y no tiene amarre, los tres desplegables salen
         vacíos y hay que volver a escogerla. Es correcto — esa avería
         nunca supo en qué calle estaba, solo cómo alguien la tecleó. */
      calle: a.calle ?? "", modulo: a.modulo ?? "", lado: a.lado ?? "",
      ubicacion_id: a.ubicacion_id ?? "",
      sku: a.producto_sku,
      cajas: String(a.cajas), unidades: String(a.unidades),
      causal: a.causal, reporto: a.reporto,
      vence: a.vence ?? "", nota: a.nota ?? "",
      paso_antes: a.paso_antes ?? "",
    });
  }

  function falta(): string | null {
    if (!f.calle) return "Falta la calle";
    if (!f.modulo) return "Falta el módulo";
    if (!f.ubicacion_id) return "Falta escoger el lado";
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
      /* VIAJA EL ID DEL MAESTRO Y NO EL TEXTO. El texto lo arma la base
         con `ubicacion_texto`, en un solo sitio: la pantalla, el PDF y
         la base armándolo cada uno por su cuenta son tres sitios donde
         un día uno pone guion y otro punto. */
      p_ubicacion_id: f.ubicacion_id,
      p_sku: f.sku,
      p_cajas: Number(f.cajas) || 0,
      p_unidades: Number(f.unidades) || 0,
      p_causal: f.causal,
      p_reporto: f.reporto.trim(),
      p_vence: f.vence || null,
      p_nota: f.nota.trim() || null,
      /* NI FECHA NI HORA NI TURNO: los pone la base. Mandarlos desde
         aquí sería volver a dejar que se puedan teclear. */
      p_paso_antes: f.paso_antes || null,
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
    /* EL NÚMERO SE PIDE EN UN CUADRO Y NO CON UN CAMPO EN LA FILA: es
       un dato que se teclea una vez en la vida de cada avería, mirando
       la pantalla de SAP que está al lado. Un campo permanente en cada
       renglón sería cien campos vacíos en la lista.

       EL CUADRO ES EL DE LA CASA, NO EL DEL NAVEGADOR. `window.prompt`
       salía con «cd-control-one.vercel.app dice» encima, en gris y con
       un campo pelado que no decía de qué avería hablaba. */
    const doc = await pedirTexto({
      titulo: `Documento de baja de ${a.codigo}`,
      dice: <>{a.producto} · <b>{a.cajas} cajas</b>. Es el número de SAP: con él, la avería
             deja de contar en el inventario.</>,
      rotulo: "Número del documento",
      marcador: "Como sale en SAP",
      confirmar: "Dar de baja",
    });
    if (doc === null) return;
    setMandando(true);
    const { error } = await supabase.rpc("averia_dar_baja", { p_id: a.id, p_documento: doc });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${a.codigo} salió del inventario con el documento ${doc}.`);
    router.refresh();
  }

  async function quitarBaja(a: AveriaFila) {
    const motivo = await pedirTexto({
      titulo: `¿Quitarle el documento a ${a.codigo}?`,
      dice: <>Tiene el <b>{a.documento}</b>. Quitárselo la devuelve a la cuenta del
             inventario: sus {a.cajas} cajas vuelven a sumar.</>,
      rotulo: "Por qué se le quita",
      confirmar: "Quitar el documento",
      minimo: 4,
      largo: true,
    });
    if (motivo === null) return;
    setMandando(true);
    const { error } = await supabase.rpc("averia_quitar_baja", { p_id: a.id, p_motivo: motivo });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${a.codigo} vuelve a contar en el inventario.`);
    router.refresh();
  }

  async function anular(a: AveriaFila) {
    const motivo = await pedirTexto({
      titulo: `¿Anular ${a.codigo}?`,
      dice: <>La fila <b>se queda</b> con el motivo y con quién la anuló, y deja de contar.
             Es lo que se hace con lo que de verdad pasó y ya no aplica.</>,
      rotulo: "Por qué se anula",
      marcador: "Queda escrito en la fila",
      confirmar: "Anular",
      minimo: 4,
      largo: true,
    });
    if (motivo === null) return;
    setMandando(true);
    const { error } = await supabase.rpc("averia_anular", { p_id: a.id, p_motivo: motivo });
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
        {/* ============ LA UBICACIÓN, EN CASCADA ============
            CALLE → MÓDULO → LADO, igual que el maestro de Inventario y
            en el orden en que se camina la bodega. Un solo desplegable
            con las cientos de ubicaciones juntas sería la misma lista
            de treinta pantallazos que ya obligó a poner un buscador en
            el producto. */}
        <label className="avr-c">
          <span>Calle</span>
          <select value={f.calle}
                  onChange={(e) => setF({ ...f, calle: e.target.value,
                                          modulo: "", lado: "", ubicacion_id: "" })}>
            <option value="">Escoge…</option>
            {calles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="avr-c">
          <span>Módulo</span>
          {/* APAGADO HASTA QUE HAYA CALLE, y dice por qué: un
              desplegable vacío y encendido se toca tres veces antes de
              que alguien entienda que falta lo de la izquierda. */}
          <select value={f.modulo} disabled={!f.calle}
                  onChange={(e) => {
                    const mod = e.target.value;
                    const lados = ubicaciones.filter((u) => u.calle === f.calle && u.modulo === mod);
                    /* SI EL MÓDULO NO TIENE LADOS, se escoge solo: pedir
                       «escoge el lado» donde no hay lados es pedir algo
                       que no existe. */
                    const solo = lados.length === 1 ? lados[0] : null;
                    setF({ ...f, modulo: mod,
                           lado: solo?.lado ?? "", ubicacion_id: solo?.id ?? "" });
                  }}>
            <option value="">{f.calle ? "Escoge…" : "Escoge la calle primero"}</option>
            {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label className="avr-c">
          <span>Lado</span>
          <select value={f.ubicacion_id} disabled={!f.modulo || lados.length <= 1}
                  onChange={(e) => {
                    const u = ubicaciones.find((x) => x.id === e.target.value);
                    setF({ ...f, ubicacion_id: e.target.value, lado: u?.lado ?? "" });
                  }}>
            <option value="">
              {!f.modulo ? "Escoge el módulo primero"
                : lados.length === 0 ? "Sin lados en el maestro" : "Escoge…"}
            </option>
            {lados.map((u) => (
              <option key={u.id} value={u.id}>{u.lado ?? "Sin lado"}</option>
            ))}
          </select>
        </label>

        <label className="avr-c avr-ancho">
          <span>Producto</span>
          {/* SE BUSCA ESCRIBIENDO, por nombre O POR CÓDIGO. Un `<select>`
              nativo con cientos de productos es una lista de treinta
              pantallazos donde solo se puede saltar tecleando el
              PRINCIPIO del nombre: quien tiene el código de la estiba a
              la vista no encontraba nada.

              ES EL MISMO COMPONENTE QUE ROTURAS, sacado a `components/`
              en vez de copiado. */}
          <BuscarEnLista id="avr-prod" valor={f.sku}
            opciones={productos.map((p) => ({ clave: p.sku, nombre: p.nombre, codigo: p.sku }))}
            rotulo="Escribe para buscar el producto"
            cambiar={(sku) => setF({ ...f, sku })}
            vacio="No hay productos activos en el maestro de inventario." />
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
        {/* «DÍA EN QUE PASÓ» YA NO ESTÁ.
            Una fecha que se teclea es una fecha que se puede poner mal
            —sin mala intención: el dedo se va— y con ella se movía una
            avería de mes. Ahora la fecha, LA HORA y EL TURNO los pone
            la base en el momento de guardar, y no hay forma de tocarlos
            desde aquí.

            LO QUE SÍ QUEDA es un «pasó antes» que aparece solo si
            alguien lo pide: para lo que se encuentra hoy y se dañó
            ayer. Son dos datos distintos —cuándo se registró es un
            hecho del sistema, cuándo pasó es lo que alguien cree— y por
            eso son dos campos y no uno. */}
        <div className="avr-c avr-ancho avr-antes">
          {!pideAntes ? (
            <button type="button" className="avr-enlace"
                    onClick={() => setPideAntes(true)}>
              ¿Esto pasó antes de hoy?
            </button>
          ) : (
            <>
              <span>Pasó antes de hoy — opcional</span>
              <input type="date" max={ayer} value={f.paso_antes}
                     onChange={(e) => setF({ ...f, paso_antes: e.target.value })} />
              <p className="avr-nota">
                Esto <b>no cambia</b> la fecha del registro, que sigue siendo hoy. Solo explica
                cuándo se dañó. Los informes cuentan por la fecha del registro.
              </p>
            </>
          )}
        </div>
      </div>

      {/* LO QUE SE VA A GUARDAR SOLO, DICHO ANTES DE GUARDAR. Es la
          trazabilidad que se pidió, y enseñarla aquí es lo que hace que
          nadie busque el campo de la fecha. */}
      <p className="avr-sello">
        Se va a guardar con <b>la fecha, la hora y el turno de ahora</b> ({hoyLargo}) y con tu
        usuario. Eso no se puede cambiar después.
      </p>

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
      {avisos}{dialogo}{cuadro}

      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · AVERÍAS · {modo === "registrar" ? "REGISTRAR" : "TABLERO"}</p>
          <h1>{modo === "registrar" ? "Registrar una avería" : "Lo que se dañó, y si ya salió de la cuenta"}</h1>
          <p className="sub">
            {modo === "registrar" ? (
              <>Lo que se dañó en la bodega, con su ubicación y su causal. Queda apartado y
              <b> sigue contando en el inventario</b> hasta que llegue el documento de baja de
              SAP — por eso se registra aquí y se le hace seguimiento en el Tablero.</>
            ) : (
              <>Mientras una avería no tenga <b>documento de baja</b>, sigue contando en el
              inventario: está apartada en la bodega y nadie la va a vender, pero el sistema
              cree que está. Esa diferencia es la que descuadra un conteo, y es lo que esta
              pantalla pone primero.</>
            )}
          </p>
        </div>
        <div className="kpi">
          <i className="corte" />
          <div className="rot">{modo === "registrar" ? "REGISTRADAS HOY" : "SIN DAR DE BAJA"}</div>
          <div className="num">{modo === "registrar" ? deHoy.length : pendientes.length}</div>
          <div className="pie">
            {modo === "registrar"
              ? <>{deHoy.reduce((s, a) => s + a.cajas, 0)} cajas · {pendientes.length} sin dar de baja en total</>
              : <>{cajasPend} cajas{unidPend > 0 && ` y ${unidPend} unidades`} que todavía cuentan</>}
          </div>
        </div>
      </section>

      {modo === "tablero" && <>
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
            for (const a of pendientes) m.set(calleDe(a),
              (m.get(calleDe(a)) ?? 0) + a.cajas);
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
      </>}

      {registrando && formulario}

      <p className="fe-cuenta">
        {modo === "registrar"
          ? `${deHoy.length} ${deHoy.length === 1 ? "avería registrada" : "averías registradas"} hoy`
          : `${vistas.length} ${vistas.length === 1 ? "avería" : "averías"}${q ? ` que dicen «${busca}»` : ""}`}
      </p>

      <div className="fe-lista">
        {(modo === "registrar" ? deHoy : vistas).length === 0 && (
          <p className="fe-vacio">
            {modo === "registrar"
              ? "Todavía no se ha registrado nada hoy. Lo que registres aquí va saliendo en esta lista."
              : lista.length === 0
              ? "Todavía no hay averías registradas. La primera se agrega con el botón de arriba."
              : vista === "pendientes"
              ? "Ninguna pendiente: todo lo averiado ya tiene su documento de baja."
              : "Ninguna con ese filtro."}
          </p>
        )}

        {(modo === "registrar" ? deHoy : vistas).map((a) => {
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
