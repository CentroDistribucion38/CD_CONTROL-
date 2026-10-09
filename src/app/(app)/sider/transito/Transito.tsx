"use client";

/**
 * EN TRÁNSITO — la otra punta del viaje.
 *
 * Dos usos en una sola pantalla, y por eso no es una tabla:
 *
 *   · Quien NO certifica (el que recibe en el patio, el de turno) abre
 *     esto para saber qué viene: qué placa, de dónde, qué trae y hace
 *     cuánto salió. Eso lo ve todo el mundo.
 *   · Quien SÍ certifica toca el vehículo que acaba de llegar y cierra
 *     la llegada: ubicación y tres fotos, igual que en la salida.
 *
 * El que llega no escoge origen ni material ni estibas: eso ya lo dijo
 * la salida. Solo aporta la evidencia de que llegó, y dónde.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import { useAvisos } from "@/components/Aviso";
import { traducirError } from "@/lib/errores";
import type { Viaje } from "@/modulos/sider/comun";
import { leerPlacas, normPlaca } from "@/modulos/sider/placas";
import type { OrigenMaestro, SkuMaestro } from "../sorting/NuevoInterno";
import {
  RANURAS, RANURA_OBS, type Ranura, type RanuraCualquiera, type Foto,
  usePosicion, TarjetaUbicacion, CampoDireccion, Ranurita, CajaObservacion,
  HuecoFaltante, completarFoto, sellar, subirFotos, traducir,
} from "@/modulos/sider/evidencia";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const hora = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      }) : "—";

/** "3 h 40 min": el intervalo de Postgres llega como texto. */
export function enCamino(iv: string | null): string {
  if (!iv) return "—";
  const m = iv.match(/(?:(\d+) days? )?(\d+):(\d+):/);
  if (!m) return iv;
  const d = Number(m[1] ?? 0), h = Number(m[2]), mi = Number(m[3]);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${mi} min`;
  return `${mi} min`;
}

/** Horas en el camino, para saber cuál lleva demasiado. */
function horasEnCamino(iv: string | null): number {
  if (!iv) return 0;
  const m = iv.match(/(?:(\d+) days? )?(\d+):(\d+):/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 24 + Number(m[2]) + Number(m[3]) / 60;
}

/* Un viaje que lleva más de esto sin llegar no está "en camino": está
   trabado, o alguien olvidó cerrarlo. Se marca para que se vea, no para
   bloquear nada. */
const HORAS_LARGAS = 24;

export function Transito({ viajes, nombres, esEditor, puedePedirAi, manda, origenes, skus,
                           trabados, sinEvidencia, cabeza }: {
  /** El permiso «Pedir / quitar revisión AI» (el administrador lo tiene siempre). */
  puedePedirAi?: boolean;
  viajes: Viaje[];
  nombres: Record<string, string>;
  esEditor: boolean;
  /** Administra la plataforma: puede corregir y anular, igual que en la
   *  fuente principal. El candado de verdad está en la base. */
  manda?: boolean;
  /** Para los desplegables de la corrección: la base valida la planta y el
   *  material contra el maestro, así que aquí no puede haber campo libre —
   *  un texto tecleado a mano solo da un error al guardar. */
  origenes?: OrigenMaestro[];
  skus?: SkuMaestro[];
  trabados: number;
  sinEvidencia: number;
  /** La cabeza de la página. La dibuja el servidor, la esconde el cliente. */
  cabeza: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  /** Los viajes abiertos para certificar la llegada: casi siempre uno, pero
   *  un camión que trae varios materiales con la misma factura es UNA sola
   *  tarjeta y su llegada se certifica UNA sola vez, para todos. */
  const [abierto, setAbierto] = useState<Viaje[] | null>(null);

  /* CORREGIR Y ANULAR. Los dos cuadros son los mismos que los de Fuente
     principal, y llaman a las mismas funciones de la base. */
  const [edit, setEdit] = useState<null | {
    id: string; placa: string; planta: string; sku: string;
    estibas: string; observacion: string;
  }>(null);
  /* ANULAR LLEVA UNA LISTA Y NO UN VIAJE, aunque casi siempre traiga
     uno. Con dos estados —uno para «este» y otro para «los marcados»—
     el cuadro, el motivo, el botón y el error existirían por duplicado,
     y el día que cambie el texto uno se queda viejo. */
  const [anular, setAnular] = useState<null | { vs: Viaje[]; motivo: string }>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  /* LOS ESCOGIDOS PARA ANULAR DE UNA. «No me deja seleccionar los
     viajes para eliminar.»

     Cuando una importación se metió dos veces son ocho o diez
     vehículos, y anularlos de uno en uno es abrir y cerrar el mismo
     cuadro diez veces escribiendo el mismo motivo. */
  const [escogidos, setEscogidos] = useState<Set<string>>(new Set());
  const marcar = (id: string) => setEscogidos((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  /* PEDIR O QUITAR LA REVISIÓN AI.
     El id del viaje que se está mandando, para apagar SOLO ese botón: un
     estado booleano apagaría los doce de la pantalla, y entonces parece
     que se cayó todo en vez de que uno está trabajando. */
  const [marcando, setMarcando] = useState<string | null>(null);

  /* NADA DE CUADROS DEL NAVEGADOR. Esto usaba prompt(), confirm() y
     alert(), que salen con "cd-control-one.vercel.app dice" encima, en
     gris, con un campo pelado que no dice de qué vehículo habla y con
     botones que no son los de la plataforma. Enseñar eso en una reunión
     parece que la aplicación se rompió.

     Los dos cuadros de la casa ya existían y esta pantalla era la ÚNICA
     de toda la aplicación que no los usaba: useConfirmar pregunta antes,
     useAvisos cuenta después. */
  const [pedir, dialogo] = useConfirmar();
  const [avisar, avisos] = useAvisos();

  /* ---------------------------------------------------------------
     CORREGIR, ANULAR Y DEVOLVER

     Las tres llaman a las funciones que YA existen y que ya usa Fuente
     principal. No se escribió SQL nuevo a propósito: dos funciones que
     hacen lo mismo se separan en cuanto alguien toca una, y entonces
     anular desde una pantalla deja el viaje distinto que anularlo desde
     la otra.

     EL ERROR SE ENSEÑA TAL COMO LO MANDA LA BASE. Los mensajes están
     escritos para leerse —«Ese viaje está anulado. Devuélvelo antes de
     corregirlo.»—, y traducirlos aquí sería reescribir a mano la misma
     frase en dos sitios.
     --------------------------------------------------------------- */
  async function guardarCorreccion() {
    if (!edit) return;
    setMal(null); setOcupado(true);
    const { error } = await supabase.rpc("sider_viaje_editar", {
      p_id: edit.id,
      p_placa: edit.placa,
      p_planta: edit.planta,
      p_sku: edit.sku,
      /* LA COMA DECIMAL SE CAMBIA POR PUNTO: aquí se escribe «0,83» y
         `Number("0,83")` es NaN, que la base rechaza con un mensaje
         sobre las estibas que no dice nada del teclado. */
      p_estibas: Number(edit.estibas.replace(",", ".")),
      p_observacion: edit.observacion,
    });
    setOcupado(false);
    if (error) return setMal(error.message);
    setEdit(null);
    router.refresh();
  }

  async function confirmarAnular() {
    if (!anular) return;
    setMal(null); setOcupado(true);

    /* UNO POR UNO, PORQUE LA FUNCIÓN ES DE UNO. `sider_viaje_anular`
       recibe un viaje, y se reusa tal cual a propósito: una función
       nueva «de varios» sería una segunda forma de anular que hay que
       mantener igual a la primera para siempre.

       LO QUE NO SE HACE ES CALLAR LO QUE FALLÓ. Si se caen tres de diez
       —la red, un rol que no manda—, decir «anulados» a secas deja
       siete fuera y tres dentro sin que nadie se entere; y decir «falló»
       a secas hace pensar que no se anuló ninguno, cuando sí se fueron
       siete. Se cuentan los dos lados y se nombran los que quedaron. */
    const hechos: string[] = [];
    const fallados: { placa: string; por: string }[] = [];
    for (const v of anular.vs) {
      const { error } = await supabase.rpc("sider_viaje_anular", {
        p_id: v.id, p_motivo: anular.motivo,
      });
      if (error) fallados.push({ placa: v.placa, por: error.message });
      else hechos.push(v.placa);
    }
    setOcupado(false);

    if (fallados.length && !hechos.length) {
      /* NINGUNO SE FUE: el cuadro se queda abierto con el motivo ya
         escrito, para no obligar a teclearlo otra vez. */
      return setMal(fallados[0].por);
    }
    setAnular(null);
    setEscogidos(new Set());
    /* SE DICE QUE SE FUERON Y A DÓNDE. Las tarjetas desaparecen de esta
       lista —solo pinta los que están en tránsito—, y algo que se esfuma
       sin una palabra parece un fallo. */
    if (hechos.length) {
      avisar.bien(hechos.length === 1
        ? `${hechos[0]} quedó anulado y salió de «en camino». Está en Fuente principal, en gris, y se puede devolver.`
        : `${hechos.length} viajes anulados. Salieron de «en camino» y están en Fuente principal, en gris; se pueden devolver.`);
    }
    if (fallados.length) {
      avisar.mal(`No se pudo anular ${fallados.map((f) => f.placa).join(", ")}: ${fallados[0].por}`);
    }
    router.refresh();
  }

  async function pedirAi(v: Viaje) {
    /* PEDIRLA PREGUNTA EL MOTIVO; QUITARLA PIDE CONFIRMACIÓN. Pedir la
       revisión se deshace con otro clic; quitarla puede estar borrando
       una decisión que alguien tomó por algo, y en el muelle un clic de
       más es fácil. */
    const ok = v.requiere_ai
      ? await pedir({
          titulo: `¿Quitar la revisión AI de ${v.placa}?`,
          dice: <>Al llegar se certifica como cualquier otro vehículo y no pasa a
                 Revisión AI. Se puede volver a pedir después.</>,
          confirmar: "Quitar la revisión",
          peligro: true,
        })
      : await pedir({
          titulo: `¿Solicitar revisión AI obligatoria para ${v.placa}?`,
          dice: <>Apenas se certifique la llegada, el vehículo <b>pasa a la pantalla
                 Revisión AI</b> como <b>certificada</b>, para que se saque la muestra y se
                 cuenten los defectos.</>,
          confirmar: "Solicitar revisión",
        });
    if (!ok) return;

    setMarcando(v.id);
    const supabase = createClient();
    /* SIN MOTIVO, a propósito. Hubo un campo para escribirlo y se quitó:
       la revisión es obligatoria o no lo es, y un campo opcional que
       nadie llena es un paso de más en el muelle. La columna sigue en la
       base —hay filas viejas que sí lo traen y la tarjeta las pinta—,
       pero desde aquí ya no se escribe ninguno. */
    const { error } = await supabase.rpc("sider_ai_marcar", {
      p_viaje: v.id,
      p_marcar: !v.requiere_ai,
      p_motivo: null,
    });
    setMarcando(null);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(v.requiere_ai
      ? `${v.placa} ya no lleva revisión AI.`
      : `${v.placa} pasará a Revisión AI – certificada cuando llegue.`);
    router.refresh();
  }

  /* `solo` no es un filtro más de la fila de filtros: es el que ponen
     los chips de la cinta de arriba. Vive en el mismo objeto para que
     «Limpiar» lo borre también —si viviera aparte, limpiar dejaría la
     lista filtrada sin ningún filtro visible, que es la peor forma de
     quedarse sin vehículos—. */
  const [f, setF] = useState({ placa: "", origen: "", desde: "", hasta: "", solo: "" });
  /* En el celular los filtros arrancan PLEGADOS. Desplegados miden 207px
     de los 640 de la pantalla y, con la cabeza y las alertas, no queda
     sitio ni para media tarjeta: quien abre esta pantalla en el patio
     quiere ver qué viene, no cuatro campos vacíos.
     En escritorio no se pliegan nunca —ahí sobra el sitio— y este
     estado no los toca: eso lo decide el CSS, que es quien sabe de qué
     tamaño es la pantalla. */
  const [verFiltros, setVerFiltros] = useState(false);

  /* LA LISTA DE PLACAS PEGADA. Null = no hay lista y el campo filtra por
     «parte de la placa» como siempre. Vive aparte del campo porque el
     campo es de UNA placa escrita a mano, y la lista puede traer
     cincuenta: metida en el campo no se podría leer. */
  const [lista, setLista] = useState<string[] | null>(null);
  const [copiado, setCopiado] = useState<"" | "no" | "tabla">("");
  const [verPl, setVerPl] = useState<"todas" | "si" | "no">("todas");
  const limpiar = () => { setF({ placa: "", origen: "", desde: "", hasta: "", solo: "" }); setLista(null) };

  /* AL PEGAR VARIAS, SE VUELVEN LISTA. Una sola placa pegada se queda en
     el campo como si se hubiera escrito: es lo que se espera. */
  function alPegar(e: React.ClipboardEvent<HTMLInputElement>) {
    const placas = leerPlacas(e.clipboardData.getData("text"));
    if (placas.length < 2) return;
    e.preventDefault();
    setLista(placas);
    setF({ ...f, placa: "" });
    setCopiado("");
  }

  /* DE LA LISTA, CUÁLES VIENEN Y CUÁLES NO — contra TODO lo que está en
     camino, no contra lo ya filtrado: que el filtro de origen esconda un
     camión no quiere decir que no venga. */
  const cruce = useMemo(() => {
    if (!lista) return null;
    /* De cada placa que SÍ viene, su viaje: de dónde sale y hace cuánto.
       Si trae dos viajes abiertos se muestra el más viejo. */
    const porPlaca = new Map<string, Viaje>();
    for (const v of viajes) {
      const k = normPlaca(v.placa);
      const ya = porPlaca.get(k);
      if (!ya || horasEnCamino(v.en_camino) > horasEnCamino(ya.en_camino)) porPlaca.set(k, v);
    }
    return {
      vienen: lista.filter((p) => porPlaca.has(p)).map((p) => ({ placa: p, v: porPlaca.get(p)! })),
      noVienen: lista.filter((p) => !porPlaca.has(p)),
    };
  }, [lista, viajes]);

  /* LAS FILAS DE LA TABLITA, en el orden en que se pegaron. */
  const filas = useMemo(() => {
    if (!lista || !cruce) return [];
    const m = new Map(cruce.vienen.map((x) => [x.placa, x.v]));
    return lista.map((placa, i) => ({ i: i + 1, placa, v: m.get(placa) ?? null }));
  }, [lista, cruce]);

  async function copiar(cual: "no" | "tabla") {
    if (!cruce) return;
    /* UNA POR RENGLÓN y separada por tabuladores: así se pega en Excel
       como columnas. */
    const t = cual === "no" ? cruce.noVienen.join("\n")
      : ["Placa\tViene\tCD origen\tMaterial\tEstibas\tHL\tSalió\tEn camino",
         ...filas.map((x) => x.v
           ? [x.placa, "Sí", x.v.cd_origen, x.v.descripcion, x.v.estibas, x.v.hl ?? "", hora(x.v.salida_en), enCamino(x.v.en_camino)].join("\t")
           : [x.placa, "No"].join("\t"))].join("\n");
    try { await navigator.clipboard.writeText(t); setCopiado(cual) }
    catch { setCopiado("") }
  }
  /* Tocar una placa que sí viene lleva a su tarjeta. */
  const irA = (placa: string) => {
    const el = document.getElementById("tr-vh-" + placa);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("resalta"); setTimeout(() => el?.classList.remove("resalta"), 1600);
  };

  /* Los orígenes que DE VERDAD tienen algo en camino. Ofrecer los 16 del
     maestro cuando solo cinco tienen vehículos hace buscar en una lista
     donde la mayoría de opciones no devuelve nada. */
  const listaOrigenes = useMemo(
    () => [...new Set(viajes.map((v) => v.cd_origen))].sort((a, b) => a.localeCompare(b, "es")),
    [viajes]
  );

  const filtrados = useMemo(() => {
    const p = f.placa.trim().toUpperCase();
    const enLista = lista ? new Set(lista) : null;
    return viajes.filter((v) => {
      if (enLista && !enLista.has(normPlaca(v.placa))) return false;
      if (p && !v.placa.toUpperCase().includes(p)) return false;
      if (f.origen && v.cd_origen !== f.origen) return false;
      /* Los dos asuntos de la cinta. La misma cuenta que hace el
         contador de arriba, para que el chip que dice «2» muestre
         exactamente esos dos. */
      /* UN INTERNO NO TIENE SALIDA, así que no puede «salir sin fotos»:
         se cuenta igual que en el contador de la página. */
      if (f.solo === "fotos" && (v.interno || v.fotos_salida >= 3)) return false;
      if (f.solo === "trabados" && horasEnCamino(v.en_camino) <= HORAS_LARGAS) return false;
      /* La fecha que se filtra es la de SALIDA, no la de creación: es la
         que le importa a quien pregunta "¿qué salió el martes y todavía
         no llega?". Se compara en texto YYYY-MM-DD contra la fecha local
         del vehículo; comparar objetos Date arrastraría la hora y el
         día completo "hasta" se quedaría por fuera. */
      if (f.desde || f.hasta) {
        /* Sin salida —los internos— vale cuándo se crearon. */
        const desde = v.salida_en ?? v.creado_en;
        if (!desde) return false;
        const d = new Date(desde);
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (f.desde && dia < f.desde) return false;
        if (f.hasta && dia > f.hasta) return false;
      }
      return true;
    });
  }, [viajes, f, lista]);

  const hayFiltro = !!f.placa.trim() || !!f.origen || !!f.desde || !!f.hasta || !!f.solo || !!lista;

  /* AGRUPADAS POR CD ORIGEN, que era el problema: veinte tarjetas
     sueltas en una rejilla no dejan ver que doce vienen de Galapa.
     Los grupos van ordenados por el vehículo que lleva MÁS tiempo en
     camino, no por nombre: el que está por llegar —o el que se trabó—
     es el que hay que atender, y ese tiene que quedar arriba. */
  const grupos = useMemo(() => {
    const m = new Map<string, Viaje[]>();
    for (const v of filtrados) {
      const g = m.get(v.cd_origen);
      if (g) g.push(v); else m.set(v.cd_origen, [v]);
    }
    /* UNA TARJETA POR CAMIÓN, NO POR MATERIAL. Cuando el facturador da salida a
       una ficha con dos materiales nacen dos viajes con la misma placa, la
       misma factura y la misma hora de salida: para quien mira esto es UN
       camión, y verlo dos veces —con dos botones de llegada— confunde. Sin
       factura o sin salida (importados, internos) cada viaje va solo. */
    const juntar = (vs: Viaje[]) => {
      const porCamion = new Map<string, Viaje[]>();
      for (const v of vs) {
        const k = !v.interno && v.factura && v.salida_en
          ? `${normPlaca(v.placa)}|${v.factura}|${v.salida_en}` : v.id;
        const g = porCamion.get(k);
        if (g) g.push(v); else porCamion.set(k, [v]);
      }
      return [...porCamion.values()].map((x) => x.sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es")));
    };
    return [...m.entries()]
      .map(([cd, vs]) => ({
        cd,
        viajes: vs,
        tarjetas: juntar(vs),
        horas: Math.max(...vs.map((v) => horasEnCamino(v.en_camino))),
        hl: vs.reduce((s, v) => s + Number(v.hl ?? 0), 0),
      }))
      .sort((a, b) => b.horas - a.horas);
  }, [filtrados]);

  /* Certificando no se dibuja la cabeza: la pantalla es de un vehículo,
     no del tablero, y el título del paso ya dice de cuál. */
  if (abierto) {
    return (
      <Llegada
        viajes={abierto}
        supabase={supabase}
        cerrar={() => setAbierto(null)}
        listo={() => {
          /* «PASÓ A REVISIÓN AI» SE DICE Y SE DICE CUÁL. Apenas se
             certifica la llegada el camión desaparece de esta lista y
             aparece en otra pantalla; sin el aviso, quien lo recibió cree
             que se perdió. Si trae las dos, se dicen las dos. */
          const paso = abierto[0];
          const todos = abierto;
          setAbierto(null);
          router.refresh();
          const clases = [
            todos.some((x) => x.requiere_ai) ? "certificada" : null,
            todos.some((x) => x.requiere_sorting || x.interno) ? "normal" : null,
          ].filter(Boolean);
          const cuantos = todos.length > 1 ? ` (${todos.length} materiales)` : "";
          if (clases.length) {
            avisar.bien(`${paso.placa}${cuantos} llegó y pasó a Revisión AI – ${clases.join(" y ")}.`);
          } else {
            avisar.bien(`${paso.placa}${cuantos} quedó recibido.`);
          }
        }}
      />
    );
  }

  /* LOS DOS CUADROS DEL ADMINISTRADOR, escritos una vez y colgados
     fuera del listado: dentro de la tarjeta se abrirían DENTRO de su
     `overflow` y quedarían recortados por el borde del grupo. */
  const cuadrosAdmin = (
    <>
      {/* ---------- Corregir ---------- */}
      {edit && (
        <div className="vj-velo" role="dialog" aria-modal="true"
             onClick={(e) => { if (e.target === e.currentTarget && !ocupado) setEdit(null) }}>
          <div className="vj-caja">
            <p className="vj-ojo">CORREGIR EL VIAJE</p>
            <h3>{edit.placa || "—"}</h3>
            <p className="vj-dice">
              Se corrige lo que alguien tecleó: la placa, el origen, el material y las
              estibas. <b>Los hectolitros y el sider no se tocan</b> — se vuelven a calcular
              solos con las fórmulas del maestro.
            </p>
            <div className="vj-campos">
              <label>
                <span>Placa</span>
                <input value={edit.placa} autoFocus maxLength={10}
                       onChange={(e) => setEdit({ ...edit, placa: e.target.value.toUpperCase() })} />
              </label>
              {/* DESPLEGABLES Y NO CAMPO LIBRE: la base valida los dos
                  contra el maestro, así que un texto a mano solo puede
                  acabar en un error al guardar. */}
              <label>
                <span>CD origen</span>
                <select value={edit.planta} onChange={(e) => setEdit({ ...edit, planta: e.target.value })}>
                  <option value="">—</option>
                  {(origenes ?? []).map((o) => (
                    <option key={o.planta} value={o.planta}>{o.cd_origen}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Material</span>
                <select value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })}>
                  <option value="">—</option>
                  {(skus ?? []).map((k) => (
                    <option key={k.sku} value={k.sku}>{k.descripcion}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Estibas</span>
                <input value={edit.estibas} inputMode="decimal"
                       onChange={(e) => setEdit({ ...edit, estibas: e.target.value })} />
              </label>
              <label className="ancho">
                <span>Observación</span>
                <input value={edit.observacion} maxLength={200}
                       placeholder="Opcional"
                       onChange={(e) => setEdit({ ...edit, observacion: e.target.value })} />
              </label>
            </div>
            {mal && <p className="vj-mal" role="alert">{mal}</p>}
            <div className="vj-botones">
              <button type="button" className="btn oro" onClick={guardarCorreccion}
                      disabled={ocupado || !edit.placa.trim() || !edit.planta || !edit.sku}>
                {ocupado ? "Guardando…" : "Guardar la corrección"}
              </button>
              <button type="button" className="btn plano" onClick={() => setEdit(null)} disabled={ocupado}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Anular ---------- */}
      {anular && (
        <div className="vj-velo" role="dialog" aria-modal="true"
             onClick={(e) => { if (e.target === e.currentTarget && !ocupado) setAnular(null) }}>
          <div className="vj-caja">
            <p className="vj-ojo">{anular.vs.length === 1 ? "ANULAR UN VIAJE" : `ANULAR ${anular.vs.length} VIAJES`}</p>
            {/* SE NOMBRAN LAS PLACAS, hasta seis. Anular «5 viajes» sin
                decir cuáles es pedir una firma en blanco: con las
                casillas es fácil marcar una de más de un barrido, y la
                última oportunidad de verlo es aquí. */}
            <h3>{anular.vs.length === 1
              ? `${anular.vs[0].placa} · ${anular.vs[0].cd_origen}`
              : [...new Set(anular.vs.map((x) => x.placa))].slice(0, 6).join(", ")
                + (new Set(anular.vs.map((x) => x.placa)).size > 6 ? ` y ${new Set(anular.vs.map((x) => x.placa)).size - 6} más` : "")}</h3>
            {/* SE DICE QUE NO SE BORRA, y se dice aquí y no en el manual:
                quien viene buscando «eliminar» tiene que enterarse en el
                momento de que esto no destruye la evidencia, o lo va a
                buscar por otro lado. */}
            <p className="vj-dice">
              {anular.vs.length === 1 ? <>El viaje <b>no se borra</b>:</> : <>Los viajes <b>no se borran</b>:</>}
              {" "}{anular.vs.length === 1 ? "sale" : "salen"} de «en camino» y se {anular.vs.length === 1 ? "queda" : "quedan"} en
              Fuente principal marcado{anular.vs.length === 1 ? "" : "s"} como anulado{anular.vs.length === 1 ? "" : "s"},
              con sus fotos y su ubicación, y deja{anular.vs.length === 1 ? "" : "n"} de contar en los
              hectolitros y en el porcentaje de certificación. Se puede devolver.
            </p>
            {/* EL MOTIVO ES OBLIGATORIO, Y AHORA SE DICE.

                Estaba puesto —el botón se quedaba apagado hasta
                escribirlo— pero en ningún sitio se decía POR QUÉ, y el
                resultado fue «¿por qué no me deja eliminar?» delante de
                un botón pálido y un campo vacío. Un botón apagado que no
                explica qué le falta se lee como que la aplicación está
                rota, no como que falta un dato.

                La base lo exige de verdad: `sider_viaje_anular` levanta
                «Escribe por qué se anula. En tres meses nadie va a
                acordarse.» si llega vacío. Aquí no se está inventando un
                requisito, se está enseñando el que ya había. */}
            <label className="vj-motivo-campo">
              <span>¿Por qué se anula? <i className="vj-obliga">obligatorio</i></span>
              <input value={anular.motivo} autoFocus maxLength={200}
                     aria-invalid={anular.motivo.trim().length < 4}
                     placeholder="Se digitó dos veces, el vehículo no salió…"
                     onChange={(e) => setAnular({ ...anular, motivo: e.target.value })} />
              <em>En tres meses nadie va a acordarse. Queda guardado con tu nombre.</em>
            </label>
{mal && <p className="vj-mal" role="alert">{mal}</p>}

            {/* SE DICE QUÉ FALTA, Y CAMBIA SEGÚN LO QUE FALTE. «Rellena
                los campos» obliga a adivinar cuál; nombrar el que falta
                es la diferencia entre corregirlo en un segundo y
                cerrar el cuadro pensando que no funciona. */}
            {!ocupado && anular.motivo.trim().length < 4 && (
              <p className="vj-falta">
                {anular.motivo.trim().length === 0
                  ? <>Falta escribir <b>por qué se anula</b>. Sin eso el botón no se enciende.</>
                  : <>Escribe un poco más: con <b>{anular.motivo.trim().length}</b>{" "}
                     {anular.motivo.trim().length === 1 ? "letra" : "letras"} nadie va a entender
                     nada dentro de tres meses.</>}
              </p>
            )}

            <div className="vj-botones">
              <button type="button" className="btn mal" onClick={confirmarAnular}
                      disabled={ocupado || anular.motivo.trim().length < 4}>
                {ocupado ? "Anulando…"
                  : anular.vs.length === 1 ? "Anular el viaje" : `Anular los ${anular.vs.length}`}
              </button>
              <button type="button" className="btn plano" onClick={() => setAnular(null)} disabled={ocupado}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {dialogo}
      {avisos}
      {cuadrosAdmin}

      {/* LA BARRA DE LO ESCOGIDO, PEGADA ABAJO.

          Va fija al pie y no arriba del listado a propósito: con ocho
          vehículos marcados el dedo está abajo, en la última tarjeta
          que acaba de tocar, y un botón que se quedó tres pantallas
          más arriba obliga a subir para rematar lo que ya se decidió.

          Y SOLO EXISTE CUANDO HAY ALGO ESCOGIDO: una barra vacía
          permanente se come 56 px del teléfono todo el día para no
          decir nada. */}
      {manda && escogidos.size > 0 && (
        <div className="tr-barra" role="region" aria-label="Viajes escogidos">
          <span className="tr-barra-n">
            <b>{escogidos.size}</b> {escogidos.size === 1 ? "viaje escogido" : "viajes escogidos"}
          </span>
          <button type="button" className="tr-adm" onClick={() => setEscogidos(new Set())}>
            Quitar la selección
          </button>
          <button type="button" className="tr-adm mal fuerte"
                  onClick={() => setAnular({
                    vs: viajes.filter((v) => escogidos.has(v.id)), motivo: "",
                  })}>
            Anular {escogidos.size === 1 ? "el escogido" : `los ${escogidos.size}`}
          </button>
        </div>
      )}

      {cabeza}


      {/* ---------- LA CINTA DE ASUNTOS ----------

            ANTES ERA UN PÁRRAFO CREMA de dos renglones que decía lo
            mismo y no llevaba a ninguna parte: había que leerlo, buscar
            los vehículos a mano y filtrar uno por uno. Y ocupaba
            noventa píxeles de la lista, que en una pantalla donde lo
            que importa son los camiones es el peor sitio para gastar.

            AHORA CADA ASUNTO ES UN BOTÓN que filtra la lista. Un aviso
            que no lleva al sitio del problema obliga a hacer a mano lo
            que la pantalla ya sabe.

            UNA SOLA LÍNEA, y negra. El negro la separa del resto sin
            gritar —no es una alarma, es un estado— y el número de cada
            chip lleva el color de su gravedad: rojo lo que bloquea el
            cierre, ámbar lo que hay que mirar. */}
      {(trabados > 0 || sinEvidencia > 0) && (
        <section className="tr-cinta">
          <span className="tr-rot">REQUIERE ATENCIÓN</span>
          {sinEvidencia > 0 && (
            <button type="button" className="tr-chip"
                    onClick={() => setF({ ...f, solo: f.solo === "fotos" ? "" : "fotos" })}
                    aria-pressed={f.solo === "fotos"}>
              <b>{sinEvidencia}</b>
              <span>{sinEvidencia === 1 ? "salió" : "salieron"} sin las tres fotos · no se{" "}
                {sinEvidencia === 1 ? "puede" : "pueden"} cerrar</span>
              <i aria-hidden>→</i>
            </button>
          )}
          {trabados > 0 && (
            <button type="button" className="tr-chip amb"
                    onClick={() => setF({ ...f, solo: f.solo === "trabados" ? "" : "trabados" })}
                    aria-pressed={f.solo === "trabados"}>
              <b>{trabados}</b>
              <span>más de 24 h sin llegar</span>
              <i aria-hidden>→</i>
            </button>
          )}
          {f.solo && (
            <button type="button" className="tr-quitar" onClick={() => setF({ ...f, solo: "" })}>
              Ver todos
            </button>
          )}
        </section>
      )}

      {/* RUEDA LA PÁGINA ENTERA, en el celular y en el escritorio: los filtros
          y la lista van juntos dentro de .tr-cuerpo y nada se queda
          inmovilizado arriba ni rueda en una caja con barra propia. */}
      <div className="tr-cuerpo">
      {/* LOS FILTROS SIEMPRE, aunque haya un solo vehículo: la lista de placas pegadas
          sirve justo para saber cuáles de las que espero NO vienen. */}
      {viajes.length > 0 && (
        <button type="button" className="tr-abrir" aria-expanded={verFiltros}
                onClick={() => setVerFiltros((v) => !v)}>
          {hayFiltro ? `Filtrando · ${filtrados.length} de ${viajes.length}` : "Filtrar"}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}

      {viajes.length > 0 && (
        <div className={"tr-filtros" + (verFiltros ? "" : " plegado")}>
          {lista ? (
            <div className="tr-placa tr-lista-on">
              <span>Placas</span>
              <p>
                <b>{lista.length} pegadas</b>
                <button type="button" className="tr-enlace" onClick={() => setLista(null)}>
                  Quitar la lista
                </button>
              </p>
            </div>
          ) : (
            <label className="tr-placa">
              <span>Placa</span>
              <input value={f.placa} placeholder="Una placa, o pega varias de Excel"
                     onPaste={alPegar}
                     onChange={(e) => setF({ ...f, placa: e.target.value })} />
            </label>
          )}
          <label>
            <span>CD origen</span>
            <select value={f.origen} onChange={(e) => setF({ ...f, origen: e.target.value })}>
              <option value="">Todos los orígenes</option>
              {listaOrigenes.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          {/* Fecha de SALIDA. Con input type=date, que abre el calendario
              del propio sistema: en el celular sale el selector nativo,
              que se toca mejor con guantes que cualquier rejilla que
              dibujemos nosotros, y no hay que mantenerla. */}
          <label>
            <span>Salió desde</span>
            <input type="date" value={f.desde} max={f.hasta || undefined}
                   onChange={(e) => setF({ ...f, desde: e.target.value })} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={f.hasta} min={f.desde || undefined}
                   onChange={(e) => setF({ ...f, hasta: e.target.value })} />
          </label>
          <button type="button" className="btn plano" disabled={!hayFiltro}
                  onClick={limpiar}>
            Limpiar
          </button>
          {hayFiltro && (
            <span className="tr-cuenta">{filtrados.length} de {viajes.length}</span>
          )}
        </div>
      )}

      {/* LA RESPUESTA A LA LISTA, ANTES DE LAS TARJETAS: cuántas vienen y,
          sobre todo, CUÁLES NO — que no tienen tarjeta y por eso no se
          verían en ninguna otra parte. Las que no vienen se pueden
          copiar de vuelta, una por renglón, para pegarlas en Excel. */}
      {cruce && lista && (
        <section className="tr-lista" aria-live="polite">
          <p className="tr-lista-frase">
            De <b>{lista.length}</b> placas, <b className="si">{cruce.vienen.length} vienen en camino</b>
            {" "}y <b className={cruce.noVienen.length ? "no" : ""}>{cruce.noVienen.length} no</b>.
          </p>
          {/* LA TABLITA: cada placa pegada en su renglón, en el orden en
              que se pegó, con si viene o no y —la que viene— de dónde,
              qué trae y hace cuánto salió. Se filtra por Sí / No y se
              copia entera para Excel. Tocar una que viene lleva a su
              tarjeta. */}
          <div className="tr-pl-bar">
            <div className="tr-pl-seg" role="group" aria-label="Ver">
              {([["todas", `Todas · ${lista.length}`], ["si", `Sí vienen · ${cruce.vienen.length}`], ["no", `No vienen · ${cruce.noVienen.length}`]] as const).map(([k, t]) => (
                <button key={k} type="button" className={(verPl === k ? "on " : "") + k} onClick={() => setVerPl(k)}>{t}</button>
              ))}
            </div>
            <button type="button" className="btn plano" onClick={() => copiar("tabla")}>
              {copiado === "tabla" ? "Copiada" : "Copiar la tabla (Excel)"}
            </button>
            {cruce.noVienen.length > 0 && (
              <button type="button" className="btn plano" onClick={() => copiar("no")}>
                {copiado === "no" ? "Copiadas" : "Copiar las que no vienen"}
              </button>
            )}
          </div>
          <div className="tr-pl-marco">
            <table className="tr-pl">
              <thead>
                <tr><th className="n">#</th><th>Placa</th><th>¿Viene?</th><th>CD origen</th><th>Material</th>
                  <th className="n">Estibas</th><th className="n">HL</th><th>Salió</th><th>En camino</th><th /></tr>
              </thead>
              <tbody>
                {filas.filter((x) => verPl === "todas" || (verPl === "si") === !!x.v).map((x) => (
                  <tr key={x.placa + x.i} className={x.v ? "si" : "no"}>
                    <td className="n">{x.i}</td>
                    <td><b className="placa">{x.placa}</b></td>
                    <td><span className={"tr-pl-pill " + (x.v ? "si" : "no")}>{x.v ? "Sí viene" : "No viene"}</span></td>
                    {x.v ? (<>
                      <td>{x.v.cd_origen}</td>
                      <td className="mat">{x.v.descripcion}<small>{x.v.sku}</small></td>
                      <td className="n">{nf.format(x.v.estibas)}</td>
                      <td className="n">{x.v.hl == null ? "—" : nf2.format(Number(x.v.hl))}</td>
                      <td>{hora(x.v.salida_en)}</td>
                      <td className={horasEnCamino(x.v.en_camino) > HORAS_LARGAS ? "tarde" : ""}>{enCamino(x.v.en_camino)}</td>
                      <td><button type="button" className="tr-pl-ir" onClick={() => irA(x.placa)}>Ver tarjeta</button></td>
                    </>) : (
                      <td colSpan={7} className="nada">No está en tránsito: no salió certificada hacia Barranquilla o ya llegó.</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* UNA sola caja que rueda, con los grupos adentro. Si rodara cada
          grupo por su lado saldrían tres barras de desplazamiento en la
          misma pantalla y ninguna diría cuánto falta por ver. */}
      <div className="tr-grupos">
      {grupos.map((g) => (
        <section key={g.cd} className="tr-grupo">
          <h2 className="tr-grupo-cab">
            <b>{g.cd}</b>
            <span>
              {g.tarjetas.length} {g.tarjetas.length === 1 ? "vehículo" : "vehículos"}
              {g.hl > 0 && <> · {nf.format(g.hl)} HL</>}
            </span>
            {/* TODO EL CD DE UN TOQUE. El caso que trae a alguien aquí
                es una importación metida dos veces, y eso llega por CD
                entero. Entran TODOS, incluidos los que esperan la
                muestra: son justo los que llevan semanas trabados. */}
            {manda && (() => {
              const suyos = g.viajes;
              if (suyos.length < 2) return null;
              const todos = suyos.every((x) => escogidos.has(x.id));
              return (
                <label className="tr-marca todos">
                  <input type="checkbox" checked={todos}
                         onChange={() => setEscogidos((sel) => {
                           const n = new Set(sel);
                           suyos.forEach((x) => todos ? n.delete(x.id) : n.add(x.id));
                           return n;
                         })} />
                  {/* EL RÓTULO NO CAMBIA CON EL ESTADO. Decía «Ninguno»
                      cuando estaban todos marcados —para anunciar lo que
                      haría el clic— y con la casilla ENCENDIDA al lado se
                      leía al revés: parecía decir que no había ninguno
                      escogido. La casilla ya dice si están o no; el
                      rótulo solo tiene que decir a quiénes toca. */}
                  <span>Los {suyos.length}</span>
                </label>
              );
            })()}
            {g.horas > HORAS_LARGAS && <em className="tr-tarde">el más viejo lleva {Math.floor(g.horas)} h</em>}
          </h2>
          <div className="tr-rejilla">
        {g.tarjetas.map((vs) => {
          /* `v` es el camión: placa, ruta, factura y salida son las mismas para
             todos sus materiales. Lo que cambia por material —cifras, revisión
             AI, corregir— sale de `vs`. */
          const v = vs[0];
          const multi = vs.length > 1;
          const nAi = vs.filter((x) => x.requiere_ai).length;
          const suma = (f: (x: Viaje) => number | null | undefined) =>
            vs.some((x) => f(x) == null) ? null : vs.reduce((a, x) => a + Number(f(x)), 0);
          const largo = horasEnCamino(v.en_camino) > HORAS_LARGAS;
          /* UN INTERNO NO TIENE SALIDA: no le «faltan» fotos que nunca
             hubo, y decirlo lo dejaría marcado como un error que no es. */
          const faltanFotos = !v.interno && v.fotos_salida < 3;
          /* EL COLOR DICE EL ESTADO ANTES DE LEER NADA, y por eso la
             marca de AI tiene el suyo: morado, que no es el de nada más
             en esta pantalla —turquesa es normal, oro es va tarde, rojo
             es error—. Lo que pasa a «Revisión AI – normal» lleva el
             magenta. Un camión con las dos se ve morado: la certificada
             se cuenta primero y es la que ya venía pedida. */
          const cls = "tr-vh" + (multi ? " multi" : "") + (nAi ? " ai"
                      : (v.requiere_sorting || v.interno) ? " so" : largo ? " largo" : "");
          return (
            <article key={vs.map((x) => x.id).join("+")} className={cls} id={"tr-vh-" + normPlaca(v.placa)}>
              <header>
                <b className="placa">{v.placa}</b>
                {/* EL SELLO DE AI VA EN LA CABECERA, junto a la placa y
                    no escondido abajo: quien recibe el camión tiene que
                    saber ANTES de descargarlo que a este le toca
                    revisión, porque la muestra se saca en el muelle y
                    después ya está el envase revuelto. */}
                {nAi > 0 && (
                  <span className="sello ai"
                        title={v.ai_motivo ?? "Al llegar pasa a Revisión AI – certificada"}>
                    <i />{multi && nAi < vs.length
                      ? `REVISIÓN AI · ${nAi} DE ${vs.length} MATERIALES`
                      : "REVISIÓN AI · CERTIFICADA"}
                  </span>
                )}
                {/* EL INTERNO SE DICE: lo creó control con el «+» y Sider no
                    lo certificó. Y pasa a la revisión NORMAL, así que no
                    lleva un segundo sello con lo mismo. */}
                {v.interno ? (
                  <span className="sello interno"
                        title="Vh Interno: lo creó control en Revisión AI y no lo certificó Sider. Al llegar pasa a Revisión AI – normal">
                    <i />VH INTERNO · REVISIÓN NORMAL
                  </span>
                ) : v.requiere_sorting && (
                  <span className="sello sorting"
                        title="Al certificar la llegada pasa a Revisión AI – normal">
                    <i />REVISIÓN AI · NORMAL
                  </span>
                )}
                {/* El interno no lleva reloj de «en camino»: no hubo una
                    salida desde donde contarlo. */}
                {!v.interno && (
                  <span className={"sello " + (largo ? "falta" : "transito")}>
                    <i />{enCamino(v.en_camino)}
                  </span>
                )}
              </header>

              <div className="tr-ruta">
                <b>{v.cd_origen}</b>
                <svg viewBox="0 0 24 8" aria-hidden="true">
                  <path d="M0 4h20M16 1l4 3-4 3" fill="none" stroke="currentColor"
                        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <b>{v.cd_destino}</b>
              </div>

              {!multi && (
                <p className="tr-mat">
                  {v.descripcion}
                  <em>{v.sku}{v.tipo_envase ? ` · ${v.tipo_envase}` : ""}</em>
                </p>
              )}

              {/* VARIOS MATERIALES, UNA FACTURA: cada material con lo suyo y,
                  al lado, lo único que se decide POR material: si lleva
                  revisión AI y, para el administrador, corregirlo. Abajo, el
                  total del camión. */}
              {multi && (
                <>
                  <p className="tr-factura">
                    Factura <b>{v.factura}</b> · {vs.length} materiales
                  </p>
                  <ul className="tr-mats">
                    {vs.map((x) => (
                      <li key={x.id} className={x.requiere_ai ? "ai" : undefined}>
                        <div className="tr-m-nom">
                          <b>{x.descripcion}</b>
                          <em>{x.sku}{x.tipo_envase ? ` · ${x.tipo_envase}` : ""}</em>
                        </div>
                        <div className="tr-m-est"><b>{nf2.format(x.estibas)}</b><span>estibas</span></div>
                        <div className="tr-m-cif">
                          {x.cajas == null ? "—" : nf.format(x.cajas)} cajas · {x.hl == null ? "—" : nf2.format(x.hl)} HL
                        </div>
                        {(puedePedirAi || manda) && (
                          <div className="tr-m-acc">
                            {puedePedirAi && (
                              <button type="button"
                                      className={"tr-ai" + (x.requiere_ai ? " on" : "")}
                                      disabled={marcando === x.id}
                                      aria-label={`${x.requiere_ai ? "Quitar" : "Pedir"} revisión AI de ${x.descripcion}`}
                                      onClick={() => pedirAi(x)}>
                                {marcando === x.id ? "…" : x.requiere_ai ? "Quitar revisión AI" : "Pedir revisión AI"}
                              </button>
                            )}
                            {manda && (
                              <button type="button" className="tr-adm"
                                      aria-label={`Corregir ${x.descripcion}`}
                                      onClick={() => setEdit({
                                        id: x.id, placa: x.placa, planta: x.planta ?? "",
                                        sku: x.sku ?? "", estibas: String(x.estibas ?? ""),
                                        observacion: x.observacion ?? "",
                                      })}>
                                Corregir
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <dl className="tr-cifras">
                <div><dt>Estibas</dt><dd>{nf2.format(suma((x) => x.estibas) ?? 0)}</dd></div>
                <div><dt>Sider</dt><dd>{nf2.format(suma((x) => x.sider) ?? 0)}</dd></div>
                <div><dt>Cajas</dt><dd>{suma((x) => x.cajas) == null ? "—" : nf.format(suma((x) => x.cajas)!)}</dd></div>
                <div><dt>HL</dt><dd>{suma((x) => x.hl) == null ? "—" : nf2.format(suma((x) => x.hl)!)}</dd></div>
              </dl>

              {/* LOS DOS INTERRUPTORES DEL ADMINISTRADOR VAN EN SU PROPIA FILA,
                  a lo ancho de la tarjeta, y no en el pie. Con uno solo cabían
                  junto a «Certificar llegada»; con dos —AI y Sorting— más ese
                  botón, un pie de 330 px los apila en tres renglones y la
                  tarjeta crece 90 px solo para alojar una decisión que se toma
                  una vez. Además son de OTRA persona: quien recibe el camión
                  certifica; quien decide qué se le pide es el administrador,
                  y separarlos en filas lo deja ver. */}
              {puedePedirAi && !v.interno && !multi && (
                <div className="tr-pedidos">
                  {/* PEDIR LA REVISIÓN ES SOLO DEL ADMINISTRADOR. Aquí solo
                      se decide si se pinta el botón; el candado de verdad
                      está en la base, que rechaza la marca venga de donde
                      venga. Esconder un botón no es un permiso.

                      Y NO SE OFRECE A UN INTERNO: la certificada es para
                      lo que llegó certificado por Sider, y el interno ya
                      lleva su revisión normal. La base también lo rechaza.

                      LA REVISIÓN NORMAL YA NO SE PIDE AQUÍ: nace sola
                      cuando control crea un camión con el «+». */}
                  <button type="button"
                          className={"tr-ai" + (v.requiere_ai ? " on" : "")}
                          disabled={marcando === v.id}
                          onClick={() => pedirAi(v)}>
                    {marcando === v.id ? "…" : v.requiere_ai ? "Quitar revisión AI" : "Pedir revisión AI"}
                  </button>
                </div>
              )}

              <footer>
                <div className="tr-salio">
                  {v.interno ? <>Creado {hora(v.creado_en)}</> : <>Salió {hora(v.salida_en)}</>}
                  <em>
                    {v.creado_por ? nombres[v.creado_por] ?? "—" : "—"}
                    {" · "}
                    {v.interno
                      ? <b>sin salida certificada</b>
                      : <b className={faltanFotos ? "mal" : undefined}>{v.fotos_salida}/3 fotos</b>}
                    {v.salida_direccion ? ` · ${v.salida_direccion}` : ""}
                  </em>
                </div>
                <div className="tr-botones">
                  {esEditor && (
                    <button type="button" className="btn" onClick={() => setAbierto(vs)}>
                      Certificar llegada
                    </button>
                  )}

                  {/* CORREGIR Y ANULAR, AQUÍ Y NO SOLO EN LA FUENTE.
                      Un vehículo que se digitó dos veces, o que nunca
                      salió, se queda en «en camino» para siempre y
                      ensucia la cifra de arriba y las horas del más
                      viejo. Arreglarlo obligaba a salir a Fuente
                      principal y buscar la placa entre casi doscientas
                      filas — y quien está mirando esta lista ya tiene
                      la placa delante.

                      SON LAS MISMAS FUNCIONES de Fuente principal, no
                      unas nuevas: `sider_viaje_editar` y
                      `sider_viaje_anular`, que comprueban `manda()` por
                      su cuenta. Esconder el botón aquí es comodidad, no
                      seguridad: el candado está en la base y rechaza la
                      llamada venga de donde venga. */}
                </div>
              </footer>

              {/* LA FRANJA DEL ADMINISTRADOR VA APARTE, debajo y con su
                  propia línea, y no junto a «Certificar llegada».

                  Metidos en la misma fila, los tres botones se envolvían
                  y cada tarjeta quedaba de un alto distinto — con dos
                  vehículos al lado, uno terminaba dos renglones más
                  abajo que el otro. Y peor: ponía «Anular» a la misma
                  altura y del mismo tamaño que la acción de todos los
                  días, que es la que se toca con guante y sin mirar.

                  Certificar es lo que se hace doce veces al día;
                  corregir y anular, una vez al mes. */}
              {manda && (
                <div className="tr-admin">
                  {/* LA CASILLA VA A LA IZQUIERDA Y CON SU PALABRA.
                      Una casilla pelada al lado de dos botones no dice
                      qué escoge: «Escoger» lo dice, y de paso el rótulo
                      es parte del área que se toca, que en el teléfono
                      es la diferencia entre darle y no darle. */}
                  <label className="tr-marca">
                    <input type="checkbox" checked={vs.every((x) => escogidos.has(x.id))}
                           onChange={() => setEscogidos((sel) => {
                             const n = new Set(sel);
                             const todos = vs.every((x) => n.has(x.id));
                             vs.forEach((x) => todos ? n.delete(x.id) : n.add(x.id));
                             return n;
                           })} />
                    <span>{vs.every((x) => escogidos.has(x.id)) ? "Escogido" : "Escoger"}</span>
                  </label>
                  {!multi && (
                    <button type="button" className="tr-adm"
                            onClick={() => setEdit({
                              id: v.id, placa: v.placa, planta: v.planta ?? "",
                              sku: v.sku ?? "", estibas: String(v.estibas ?? ""),
                              observacion: v.observacion ?? "",
                            })}>
                      Corregir
                    </button>
                  )}
                  <button type="button" className="tr-adm mal"
                          onClick={() => setAnular({ vs, motivo: "" })}>
                    {multi ? "Anular todo" : "Anular"}
                  </button>
                </div>
              )}

              {nAi > 0 && !multi && (
                <p className="tr-ojo ai">
                  A este vehículo le toca <b>Revisión AI – certificada</b> al llegar.
                  {v.ai_motivo ? ` ${v.ai_motivo}` : ""}
                  {v.ai_pedido_por ? ` — la pidió ${nombres[v.ai_pedido_por] ?? "un administrador"}.` : ""}
                  {" "}Apenas se certifique la llegada, pasa a esa pantalla.
                </p>
              )}
              {nAi > 0 && multi && (
                <p className="tr-ojo ai">
                  Al llegar, <b>{vs.filter((x) => x.requiere_ai).map((x) => x.descripcion).join(", ")}</b>{" "}
                  pasa{nAi > 1 ? "n" : ""} a <b>Revisión AI – certificada</b>
                  {nAi < vs.length ? <>; {nAi === 1 ? "el otro material queda" : "los demás quedan"} recibido{nAi === vs.length - 1 ? "" : "s"} sin revisión</> : null}.
                </p>
              )}

              {faltanFotos && (
                <p className="tr-ojo">
                  A la salida le faltan fotos. La llegada no se puede cerrar hasta que
                  estén las tres: si se pudiera, la evidencia sería opcional en la
                  práctica.
                </p>
              )}
            </article>
          );
        })}
          </div>
        </section>
      ))}
      </div>

      {!filtrados.length && (
        <div className="tr-vacio">
          {viajes.length ? (
            <>Ningún vehículo coincide con el filtro.{" "}
              <button type="button" className="tr-enlace"
                      onClick={limpiar}>
                Quitar el filtro
              </button></>
          ) : (
            "No hay vehículos en tránsito. Cuando alguien certifique una salida, aparece aquí."
          )}
        </div>
      )}
      </div>
    </>
  );
}

/* ==================== Certificar la llegada ====================
   Dos pasos, no seis: el viaje ya sabe qué trae. Lo único que falta es
   dónde llegó y la prueba de que llegó.

   Y son DOS PASOS y no una sola pantalla con dos columnas —que es como
   estaba— porque en el celular no cabía: medido, se salía 197 px en un
   390x844 y 254 en un 360x740. Se podía apretar el texto hasta que
   entrara, pero eso es dejar la letra ilegible para no admitir que son
   dos cosas distintas. El que recibe está de pie al lado del vehículo:
   primero dice dónde está, después toma las fotos.
   =============================================================== */
function Llegada({ viajes, supabase, cerrar, listo }: {
  /** Los viajes del camión que llega. Casi siempre uno; con varios
   *  materiales de una factura son varios, y la llegada —ubicación y
   *  fotos— se certifica UNA vez y se aplica a cada uno. */
  viajes: Viaje[];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  supabase: any;
  cerrar: () => void;
  listo: () => void;
}) {
  const router = useRouter();
  const viaje = viajes[0];
  const pos = usePosicion();
  const [paso, setPaso] = useState(0);
  const [fotos, setFotos] = useState<Partial<Record<RanuraCualquiera, Foto>>>({});
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [avance, setAvance] = useState("");
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  /* LA REVISIÓN AI YA NO VIVE AQUÍ. Antes era un tercer paso de este
     recorrido; ahora, apenas se certifica la llegada, el camión sale de
     Tránsito y espera en la pantalla «Revisión AI» —la certificada si el
     administrador la pidió, la normal si lo creó control con el «+»—.
     Este recorrido solo prueba que llegó y dónde. */

  const faltanFotos = RANURAS.filter((r) => !fotos[r.id]);
  /* UN INTERNO NO TIENE SALIDA QUE COMPLETAR: lo creó control con el «+»
     y nunca hubo certificación de salida ni sus tres fotos. La base
     tampoco se las exige. A los demás sí: sin las tres el viaje no se
     puede cerrar. */
  const sinEvidenciaSalida = !viaje.interno && viaje.fotos_salida < 3;
  const puede = !!pos.ubi && faltanFotos.length === 0 && !sinEvidenciaSalida;

  /* ---------- LA SALIDA INCOMPLETA, ARREGLABLE DESDE AQUÍ ----------
     Esta pantalla es donde alguien DESCUBRE que la salida quedó sin
     fotos: llega al vehículo, llena sus tres, y el botón sigue gris.
     Antes el aviso solo lo informaba y el arreglo estaba dos pantallas
     más allá, en el ojito de la Fuente principal. Peor: el aviso decía
     "0 de 3" justo encima de tres huecos que SÍ se llenan, y se entendía
     —con toda razón— que hablaba de esos. Ahora dice de cuáles habla y
     se pueden llenar aquí mismo. */
  const [saliCert, setSaliCert] = useState<{ id: string; faltan: Ranura[] } | null>(null);
  const [completando, setCompletando] = useState<Ranura | null>(null);
  const [abrirSalida, setAbrirSalida] = useState(false);

  useEffect(() => {
    if (!sinEvidenciaSalida) { setSaliCert(null); return }
    let vivo = true;
    fetch(`/api/sider/evidencia/${viaje.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (!vivo) return;
        type P = { id: string; punta: string; fotos: { ranura: string }[] };
        const sal = (j.puntas as P[]).find((x) => x.punta === "salida");
        if (!sal) { setSaliCert(null); return }
        setSaliCert({
          id: sal.id,
          faltan: RANURAS.filter((r) => !sal.fotos.some((f) => f.ranura === r.id)).map((r) => r.id),
        });
      })
      .catch(() => { if (vivo) setSaliCert(null) });
    return () => { vivo = false };
  }, [viaje.id, sinEvidenciaSalida]);

  async function completarSalida(ranura: Ranura, archivo: File) {
    if (!saliCert) return;
    setAviso(null);
    setCompletando(ranura);
    const mal = await completarFoto(supabase, {
      viajeId: viaje.id, certId: saliCert.id, placa: viaje.placa,
      punta: "salida", ranura, ubi: pos.ubi, direccion: pos.direccion, archivo,
    });
    setCompletando(null);
    if (mal) { setAviso({ mal: true, texto: mal }); return }
    setSaliCert((c) => (c ? { ...c, faltan: c.faltan.filter((x) => x !== ranura) } : c));
    /* refresh() vuelve a leer fotos_salida del servidor, que es lo que
       destranca el botón de certificar. */
    router.refresh();
  }

  async function tomar(ranura: Ranura, archivo: File) {
    try {
      const foto = await sellar(archivo, {
        titulo: viaje.placa,
        ubi: pos.ubi,
        direccion: pos.direccion.trim(),
        etiqueta: `LLEGADA · ${RANURAS.find((r) => r.id === ranura)!.t}`,
      });
      setFotos((f) => {
        if (f[ranura]) URL.revokeObjectURL(f[ranura]!.url);
        return { ...f, [ranura]: foto };
      });
    } catch {
      setAviso({ mal: true, texto: "No se pudo procesar esa foto. Vuelve a tomarla." });
    }
  }

  /* La foto de la observación se sella igual que las otras —placa, hora,
     coordenadas quemadas en la esquina—, porque si no se sellara sería la
     única de las cuatro que no prueba dónde ni cuándo se tomó, y es
     justamente la que alguien va a discutir. */
  async function tomarObs(archivo: File) {
    try {
      const foto = await sellar(archivo, {
        titulo: viaje.placa,
        ubi: pos.ubi,
        direccion: pos.direccion.trim(),
        etiqueta: `LLEGADA · OBSERVACIÓN`,
      });
      setFotos((f) => {
        if (f.observacion) URL.revokeObjectURL(f.observacion.url);
        return { ...f, observacion: foto };
      });
    } catch {
      setAviso({ mal: true, texto: "No se pudo procesar esa foto. Vuelve a tomarla." });
    }
  }

  function quitarObs() {
    setFotos((f) => {
      if (f.observacion) URL.revokeObjectURL(f.observacion.url);
      const { observacion: _, ...resto } = f;
      return resto;
    });
  }

  async function certificar() {
    if (!puede) return;
    setEnviando(true);
    setAviso(null);
    setAvance("Registrando la llegada…");

    /* UNA LLEGADA, VARIOS VIAJES. Es un solo camión que llegó una sola vez:
       la ubicación, la nota y las fotos son las mismas, y se aplican a cada
       material. Uno por uno, con la misma función de siempre. Si uno falla
       a medias se dice cuáles ya quedaron, porque esos ya no están en
       tránsito y volver a intentar todo daría error en ellos. */
    const hechos: string[] = [];
    for (const vj of viajes) {
      const { data, error } = await supabase.rpc("sider_certificar_llegada", {
        p_viaje_id: vj.id,
        p_lat: pos.ubi!.lat,
        p_lng: pos.ubi!.lng,
        p_precision_m: Math.round(pos.ubi!.precision),
        p_ubicado_en: pos.ubi!.en,
        p_nota: nota.trim() || null,
        p_direccion: pos.direccion.trim() || null,
      });

      if (error) {
        setAviso({
          mal: true,
          texto: (hechos.length
            ? `Ya quedó recibido ${hechos.join(", ")}, pero con ${vj.descripcion}: ${traducir(error.message)} Cierra esta pantalla: en la lista solo queda lo que falta.`
            : traducir(error.message)),
        });
        setEnviando(false);
        setAvance("");
        if (hechos.length) router.refresh();
        return;
      }

      const mal = await subirFotos(supabase, {
        viajeId: vj.id,
        certId: data as string,
        punta: "llegada",
        fotos,
        avance: setAvance,
      });
      hechos.push(vj.descripcion);

      if (mal) {
        setAvance("");
        setEnviando(false);
        setAviso({
          mal: true,
          texto:
            `${viaje.placa} quedó recibido, pero ${mal}. Búscalo en la Fuente principal ` +
            `y vuelve a intentar la foto.`,
        });
        if (viajes.length > 1) router.refresh();
        return;
      }
    }

    setAvance("");
    setEnviando(false);
    listo();
  }

  /* Soltar los blobs al cerrar. Esta pantalla nunca lo hizo —la de salida
     sí— y cada foto sellada son varios megas que se quedaban en memoria
     hasta recargar la página. Con la cuarta ranura se nota más, así que
     va aquí en vez de en una lista de pendientes.
     Sin dependencias: corre UNA vez al desmontar y lee el estado del
     momento a través de la referencia, no la copia del primer render. */
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  useEffect(() => () => {
    for (const f of Object.values(fotosRef.current)) if (f) URL.revokeObjectURL(f.url);
  }, []);

  const pasos = [
    { t: "Dónde", ok: !!pos.ubi },
    { t: "Fotos", ok: faltanFotos.length === 0 },
  ];

  /* La misma regla que en la salida: a un paso solo se llega si los
     anteriores están listos, y la ubicación es requisito duro porque es
     lo que prueba que quien certificó estaba ahí. */
  const alcanzable = (i: number) => i === 0 || pasos.slice(0, i).every((p) => p.ok);

  return (
    <>
      <ol className="ct-pasos tr-pasos">
        {pasos.map((p, i) => {
          const abierto = alcanzable(i);
          const razon = abierto
            ? undefined
            : "Primero activa tu ubicación: sin ella la certificación no prueba nada.";
          return (
            <li
              key={p.t}
              className={(i === paso ? "aqui " : "") + (p.ok ? "listo " : "") + (abierto ? "" : "trancado")}
            >
              <button
                type="button"
                onClick={() => setPaso(i)}
                disabled={enviando || !abierto}
                title={razon}
                aria-label={razon ? `${p.t} — ${razon}` : p.t}
              >
                <i>{p.ok ? "✓" : i + 1}</i>
                <span>{p.t}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {!pos.ubi && (
        <p className="ct-tranca">
          <b>La ubicación es obligatoria.</b> Las fotos se abren cuando la actives:
          es lo que prueba que el vehículo llegó a donde dice.
        </p>
      )}

      {/* Sin la clase "ct": en globals.css es una utilidad de RÓTULO
          —10px, mayúscula, letra separada, gris— y aquí se había puesto
          queriendo decir "certificar". Colisión de nombres: la heredaba
          TODO el contenido de la tarjeta, así que cada párrafo de esta
          pantalla salía gritando en mayúscula y en gris claro. Por eso
          el aviso de "faltan las fotos de la salida" era ilegible. Las
          clases ct-* de abajo son otras y no se tocan. */}
      <section className="tarjeta">
        <div className="ct-paso tr-llegada">
          <div className="tr-quien">
            <div>
              <h2>
                {paso === 0 ? `Llegó ${viaje.placa}` : `Tres fotos de ${viaje.placa}`}
              </h2>
              <p className="ct-dice">
                {paso === 0 ? (
                  <>
                    Desde <b>{viaje.cd_origen}</b> ·{" "}
                    {viajes.map((x) => `${x.descripcion} (${nf2.format(x.estibas)} estibas)`).join(" + ")}
                    {viaje.interno ? ` · creado ${hora(viaje.creado_en)} por control` : ` · salió ${hora(viaje.salida_en)}`}
                    {" — "}solo falta dónde llegó y la prueba de que llegó.
                    {(viajes.some((x) => x.requiere_ai) || viaje.requiere_sorting || viaje.interno) && (
                      <>
                        {" "}Al certificarla pasa a <b>Revisión AI – {[
                          viajes.some((x) => x.requiere_ai) ? "certificada" : null,
                          viaje.requiere_sorting || viaje.interno ? "normal" : null,
                        ].filter(Boolean).join(" y ")}</b>{viajes.length > 1 && viajes.some((x) => !x.requiere_ai) ? " (solo los materiales que la llevan)" : ""}.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Cada una queda sellada con la placa, la fecha, la hora y las
                    coordenadas quemadas en la esquina. Si algo llegó mal, déjalo
                    dicho abajo y, si se puede, fotografíalo.
                  </>
                )}
              </p>
            </div>
            <button type="button" className="btn plano" onClick={cerrar} disabled={enviando}>
              ← Volver al tránsito
            </button>
          </div>

          {sinEvidenciaSalida && (
            <div className="tr-tranca">
              <p className="tr-tranca-qué">
                <b>Faltan las fotos de la SALIDA</b> — las de cuando {viaje.placa} salió
                de <b>{viaje.cd_origen}</b>, no las de esta pantalla. Hay{" "}
                <b>{viaje.fotos_salida} de 3</b> guardadas, y sin las tres el viaje no se
                puede cerrar.
              </p>

              {saliCert == null ? (
                <p className="tr-tranca-cómo">Buscando qué falta…</p>
              ) : saliCert.faltan.length === 0 ? (
                /* Ya están las tres pero el número de la tabla viene del
                   servidor: se pide recargar en vez de mentir diciendo
                   que ya se puede. */
                <p className="tr-tranca-cómo">
                  Ya quedaron las tres. Recarga la página para que se destranque el botón.
                </p>
              ) : !abrirSalida ? (
                <button type="button" className="btn" onClick={() => setAbrirSalida(true)}>
                  Completarlas aquí mismo
                </button>
              ) : (
                <>
                  <p className="tr-tranca-cómo">
                    {pos.ubi ? (
                      <>
                        Cada una se sella con la hora y el sitio de <b>AHORA</b> y con la
                        palabra <b>AÑADIDA DESPUÉS</b>: se toma tarde y la foto lo dice.
                      </>
                    ) : (
                      <>Primero activa tu ubicación arriba: es lo que prueba dónde se tomó.</>
                    )}
                  </p>
                  <div className="tr-huecos">
                    {RANURAS.filter((r) => saliCert.faltan.includes(r.id)).map((r) => (
                      <HuecoFaltante key={r.id} r={r} puede={!!pos.ubi}
                                     ocupado={completando === r.id}
                                     tomar={(f) => completarSalida(r.id, f)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ================= 0 · Dónde ================= */}
          {paso === 0 && (
            <>
              {!pos.ubi && (
                <button type="button" className="ct-grande" onClick={pos.pedir} disabled={pos.buscando}>
                  {pos.buscando ? "Buscando el GPS…" : "Activar mi ubicación"}
                </button>
              )}
              {pos.errUbi && <div className="aviso mal ct-suelto">{pos.errUbi}</div>}

              {pos.ubi && (
                <>
                  <div className="tr-dos">
                    <TarjetaUbicacion ubi={pos.ubi} />
                    {/* La observación ya NO vive aquí: se fue al paso de
                        las fotos, junto a la foto que la respalda. */}
                    <CampoDireccion
                      direccion={pos.direccion}
                      setDireccion={pos.setDireccion}
                      buscandoDir={pos.buscandoDir}
                    />
                  </div>
                  <div className="ct-botones">
                    <button type="button" className="btn" onClick={() => setPaso(1)}>
                      Seguir a las fotos
                    </button>
                    <button type="button" className="btn plano" onClick={pos.pedir} disabled={pos.buscando}>
                      Volver a tomarla
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ================= 1 · Fotos ================= */}
          {paso === 1 && (
            <>
              <div className="ct-fotos">
                {RANURAS.map((r) => (
                  <Ranurita key={r.id} r={r} foto={fotos[r.id]} tomar={tomar} />
                ))}
              </div>

              <CajaObservacion
                punta="llegada"
                nota={nota}
                setNota={setNota}
                foto={fotos[RANURA_OBS.id]}
                tomar={tomarObs}
                quitar={quitarObs}
              />

              <div className="ct-botones">
                <button type="button" className="btn" onClick={certificar} disabled={!puede || enviando}>
                  {/* El botón dice POR QUÉ está gris. Antes, con las tres
                      de la llegada puestas y la salida incompleta, decía
                      "Certificar la llegada de JYN245" y no hacía nada:
                      quien está al lado del vehículo no tenía forma de
                      saber que el problema era de la otra punta. */}
                  {enviando ? avance || "Certificando…"
                    : faltanFotos.length
                      ? `Faltan ${faltanFotos.length} foto${faltanFotos.length > 1 ? "s" : ""} de esta llegada`
                      : sinEvidenciaSalida
                        ? "Faltan las fotos de la salida (arriba)"
                        : `Certificar la llegada de ${viaje.placa}`}
                </button>
                <button type="button" className="btn plano" onClick={() => setPaso(0)} disabled={enviando}>
                  Volver
                </button>
              </div>
            </>
          )}
        </div>

        {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
      </section>
    </>
  );
}
