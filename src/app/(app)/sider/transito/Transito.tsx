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
import type { Viaje } from "@/modulos/sider/comun";
import { leerPlacas, normPlaca } from "@/modulos/sider/placas";
import type { MaestrosAi } from "@/modulos/sider/ai";
import { FormularioAi } from "@/modulos/sider/FormularioAi";
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

export function Transito({ viajes, nombres, esEditor, esAdmin, trabados, sinEvidencia,
                           maestrosAi, cabeza }: {
  esAdmin?: boolean;
  viajes: Viaje[];
  nombres: Record<string, string>;
  esEditor: boolean;
  /** Los maestros de la revisión AI. null = ningún vehículo la lleva. */
  maestrosAi: MaestrosAi | null;
  trabados: number;
  sinEvidencia: number;
  /** La cabeza de la página. La dibuja el servidor, la esconde el cliente. */
  cabeza: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  /** El viaje abierto para certificar la llegada. */
  const [abierto, setAbierto] = useState<Viaje | null>(null);

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

  async function pedirAi(v: Viaje) {
    /* PEDIRLA PREGUNTA EL MOTIVO; QUITARLA PIDE CONFIRMACIÓN. Pedir la
       revisión se deshace con otro clic; quitarla puede estar borrando
       una decisión que alguien tomó por algo, y en el muelle un clic de
       más es fácil. */
    const ok = v.requiere_ai
      ? await pedir({
          titulo: `¿Quitar la revisión AI de ${v.placa}?`,
          dice: <>Al llegar se certifica como cualquier otro vehículo, sin muestra
                 ni conteo de defectos. Se puede volver a pedir después.</>,
          confirmar: "Quitar la revisión",
          peligro: true,
        })
      : await pedir({
          titulo: `¿Solicitar revisión AI obligatoria para ${v.placa}?`,
          dice: <>Al llegar, quien certifique tendrá que sacar la muestra en el
                 muelle y contar los defectos <b>antes de descargar</b>.</>,
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
      : `${v.placa} queda con revisión AI al llegar.`);
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
      if (f.solo === "fotos" && v.fotos_salida >= 3) return false;
      if (f.solo === "trabados" && horasEnCamino(v.en_camino) <= HORAS_LARGAS) return false;
      /* La fecha que se filtra es la de SALIDA, no la de creación: es la
         que le importa a quien pregunta "¿qué salió el martes y todavía
         no llega?". Se compara en texto YYYY-MM-DD contra la fecha local
         del vehículo; comparar objetos Date arrastraría la hora y el
         día completo "hasta" se quedaría por fuera. */
      if (f.desde || f.hasta) {
        if (!v.salida_en) return false;
        const d = new Date(v.salida_en);
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
    return [...m.entries()]
      .map(([cd, vs]) => ({
        cd,
        viajes: vs,
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
        viaje={abierto}
        supabase={supabase}
        maestrosAi={maestrosAi}
        cerrar={() => setAbierto(null)}
        listo={() => { setAbierto(null); router.refresh(); }}
      />
    );
  }

  return (
    <>
      {dialogo}
      {avisos}
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

      {/* EN EL CELULAR ruedan JUNTOS los filtros y la lista, dentro de
          .tr-cuerpo. En escritorio no: allá los filtros se quedan
          quietos y rueda solo la lista, que es lo cómodo con cien
          vehículos. En un celular no cabe nada quieto —cabeza, alertas
          y filtros abiertos suman 488px de los 640— y fijar los filtros
          dejaba la lista en sesenta pixeles. */}
      <div className="tr-cuerpo">
      {viajes.length > 1 && (
        <button type="button" className="tr-abrir" aria-expanded={verFiltros}
                onClick={() => setVerFiltros((v) => !v)}>
          {hayFiltro ? `Filtrando · ${filtrados.length} de ${viajes.length}` : "Filtrar"}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}

      {viajes.length > 1 && (
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
              {g.viajes.length} {g.viajes.length === 1 ? "vehículo" : "vehículos"}
              {g.hl > 0 && <> · {nf.format(g.hl)} HL</>}
            </span>
            {g.horas > HORAS_LARGAS && <em className="tr-tarde">el más viejo lleva {Math.floor(g.horas)} h</em>}
          </h2>
          <div className="tr-rejilla">
        {g.viajes.map((v) => {
          const largo = horasEnCamino(v.en_camino) > HORAS_LARGAS;
          const faltanFotos = v.fotos_salida < 3;
          /* EL COLOR DICE EL ESTADO ANTES DE LEER NADA, y por eso la
             marca de AI tiene el suyo: morado, que no es el de nada más
             en esta pantalla —turquesa es normal, oro es va tarde, rojo
             es error—. Y el morado FUERTE, con el fondo teñido, es para
             el que ya llegó y sigue sin revisar: ese no está esperando
             en la carretera, está esperando a alguien. */
          const cls = "tr-vh" + (v.ai_pendiente ? " ai-falta" : v.requiere_ai ? " ai" : largo ? " largo" : "");
          return (
            <article key={v.id} className={cls} id={"tr-vh-" + normPlaca(v.placa)}>
              <header>
                <b className="placa">{v.placa}</b>
                {/* EL SELLO DE AI VA EN LA CABECERA, junto a la placa y
                    no escondido abajo: quien recibe el camión tiene que
                    saber ANTES de descargarlo que a este le toca
                    revisión, porque la muestra se saca en el muelle y
                    después ya está el envase revuelto. */}
                {v.requiere_ai && (
                  <span className={"sello ai" + (v.ai_pendiente ? " falta" : "")}
                        title={v.ai_motivo ?? "Revisión AI pedida por el administrador"}>
                    <i />{v.ai_pendiente ? "FALTA LA REVISIÓN AI" : "REVISIÓN AI"}
                  </span>
                )}
                {/* El que ya llegó no lleva el reloj de «en camino»: ese
                    número hablaría de un viaje que ya terminó. */}
                {!v.ai_pendiente && (
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

              <p className="tr-mat">
                {v.descripcion}
                <em>{v.sku}{v.tipo_envase ? ` · ${v.tipo_envase}` : ""}</em>
              </p>

              <dl className="tr-cifras">
                <div><dt>Estibas</dt><dd>{nf2.format(v.estibas)}</dd></div>
                <div><dt>Sider</dt><dd>{nf2.format(v.sider)}</dd></div>
                <div><dt>Cajas</dt><dd>{v.cajas == null ? "—" : nf.format(v.cajas)}</dd></div>
                <div><dt>HL</dt><dd>{v.hl == null ? "—" : nf2.format(v.hl)}</dd></div>
              </dl>

              <footer>
                <div className="tr-salio">
                  {v.ai_pendiente ? <>Llegó {hora(v.llegada_en)}</> : <>Salió {hora(v.salida_en)}</>}
                  <em>
                    {v.creado_por ? nombres[v.creado_por] ?? "—" : "—"}
                    {" · "}
                    <b className={faltanFotos ? "mal" : undefined}>{v.fotos_salida}/3 fotos</b>
                    {v.salida_direccion ? ` · ${v.salida_direccion}` : ""}
                  </em>
                </div>
                <div className="tr-botones">
                  {/* PEDIR LA REVISIÓN ES SOLO DEL ADMINISTRADOR. Aquí
                      solo se decide si se pinta el botón; el candado de
                      verdad está en la base, que rechaza la marca venga
                      de donde venga. Esconder un botón no es un
                      permiso. */}
                  {/* AL QUE YA LLEGÓ NO SE LE OFRECE QUITAR LA MARCA:
                      la muestra ya se sacó o se perdió, y desmarcarlo
                      solo serviría para que el pendiente desaparezca de
                      la lista sin que nadie contara nada. */}
                  {esAdmin && !v.ai_pendiente && (
                    <button type="button"
                            className={"tr-ai" + (v.requiere_ai ? " on" : "")}
                            disabled={marcando === v.id}
                            onClick={() => pedirAi(v)}>
                      {marcando === v.id ? "…" : v.requiere_ai ? "Quitar AI" : "Pedir revisión AI"}
                    </button>
                  )}
                  {esEditor && (
                    <button type="button" className={"btn" + (v.ai_pendiente ? " ai" : "")}
                            onClick={() => setAbierto(v)}>
                      {v.ai_pendiente ? "Hacer la revisión AI" : "Certificar llegada"}
                    </button>
                  )}
                </div>
              </footer>

              {v.requiere_ai && (
                <p className={"tr-ojo ai" + (v.ai_pendiente ? " falta" : "")}>
                  {v.ai_pendiente ? (
                    <>
                      <b>Llegó y nadie ha contado la muestra.</b> Se queda en esta lista
                      hasta que alguien la registre: mientras tanto, al socio se le abona
                      todo lo que mandó.
                    </>
                  ) : (
                    <>
                      A este vehículo le toca <b>revisión AI</b> al llegar.
                      {v.ai_motivo ? ` ${v.ai_motivo}` : ""}
                      {v.ai_pedido_por ? ` — la pidió ${nombres[v.ai_pedido_por] ?? "un administrador"}.` : ""}
                      {" "}La muestra se saca en el muelle, antes de descargar.
                    </>
                  )}
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
function Llegada({ viaje, supabase, maestrosAi, cerrar, listo }: {
  viaje: Viaje;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  supabase: any;
  maestrosAi: MaestrosAi | null;
  cerrar: () => void;
  listo: () => void;
}) {
  const router = useRouter();
  const pos = usePosicion();
  const [paso, setPaso] = useState(viaje.ai_pendiente ? 2 : 0);
  const [fotos, setFotos] = useState<Partial<Record<RanuraCualquiera, Foto>>>({});
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [avance, setAvance] = useState("");
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  /* ---------- LA REVISIÓN AI, DENTRO DE ESTE MISMO RECORRIDO ----------
     El administrador marca el vehículo desde la lista; quien lo recibe
     no tiene que ir a buscar otra pantalla ni acordarse de que existe.
     Cierra la llegada y el formulario sale solo, como tercer paso.

     Y VA DESPUÉS DE CERTIFICAR, no antes, porque la base no acepta una
     revisión de un viaje cuya llegada no esté certificada —y con razón:
     una revisión de algo que nunca se recibió no se puede auditar—. Por
     eso, si aquí se cae la señal, lo que ya quedó guardado es la
     llegada, y la revisión se retoma desde la tarjeta del vehículo. */
  const revisaAi = !!viaje.requiere_ai && !!maestrosAi && !maestrosAi.falta;
  /* EL QUE YA LLEGÓ ENTRA DIRECTO AL FORMULARIO. Su llegada se certificó
     hace rato —por eso salió de «en camino» y aparece con el morado
     fuerte—, así que los dos primeros pasos ya están hechos: pedirle la
     ubicación y tres fotos otra vez sería hacerle repetir algo que la
     base ya tiene y que ya no aceptaría. */
  const [yaCertifico, setYaCertifico] = useState(!!viaje.ai_pendiente);

  const faltanFotos = RANURAS.filter((r) => !fotos[r.id]);
  const sinEvidenciaSalida = viaje.fotos_salida < 3;
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

    const { data, error } = await supabase.rpc("sider_certificar_llegada", {
      p_viaje_id: viaje.id,
      p_lat: pos.ubi!.lat,
      p_lng: pos.ubi!.lng,
      p_precision_m: Math.round(pos.ubi!.precision),
      p_ubicado_en: pos.ubi!.en,
      p_nota: nota.trim() || null,
      p_direccion: pos.direccion.trim() || null,
    });

    if (error) {
      setAviso({ mal: true, texto: traducir(error.message) });
      setEnviando(false);
      setAvance("");
      return;
    }

    const mal = await subirFotos(supabase, {
      viajeId: viaje.id,
      certId: data as string,
      punta: "llegada",
      fotos,
      avance: setAvance,
    });

    setAvance("");
    setEnviando(false);
    if (mal) {
      setAviso({
        mal: true,
        texto:
          `${viaje.placa} quedó recibido, pero ${mal}. Búscalo en la Fuente principal ` +
          `y vuelve a intentar la foto.`,
      });
      return;
    }
    /* Con revisión pendiente NO se sale: la llegada ya quedó, y ahora
       toca la muestra en el muelle. Salir aquí sería mandar a alguien a
       buscar en otro sitio lo que puede hacer sin moverse. */
    if (revisaAi) { setYaCertifico(true); setPaso(2); return }
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
    { t: "Dónde", ok: !!pos.ubi || !!viaje.ai_pendiente },
    { t: "Fotos", ok: faltanFotos.length === 0 || !!viaje.ai_pendiente },
    ...(revisaAi ? [{ t: "Revisión AI", ok: false }] : []),
  ];

  /* La misma regla que en la salida: a un paso solo se llega si los
     anteriores están listos, y la ubicación es requisito duro porque es
     lo que prueba que quien certificó estaba ahí.

     Y UNA VEZ CERTIFICADA LA LLEGADA NO SE VUELVE ATRÁS: los dos
     primeros pasos ya se guardaron en la base y volver a mandarlos solo
     sirve para ver un error. Se quedan marcados en verde, que es lo que
     son: hechos. */
  const alcanzable = (i: number) =>
    yaCertifico ? i === 2 : i === 0 || pasos.slice(0, i).every((p) => p.ok);

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
                {paso === 0 ? `Llegó ${viaje.placa}`
                  : paso === 1 ? `Tres fotos de ${viaje.placa}`
                    : `Revisión AI de ${viaje.placa}`}
              </h2>
              <p className="ct-dice">
                {paso === 0 ? (
                  <>
                    Desde <b>{viaje.cd_origen}</b> · {viaje.descripcion} ·{" "}
                    {nf2.format(viaje.estibas)} estibas · salió {hora(viaje.salida_en)}
                    {" — "}solo falta dónde llegó y la prueba de que llegó.
                  </>
                ) : paso === 1 ? (
                  <>
                    Cada una queda sellada con la placa, la fecha, la hora y las
                    coordenadas quemadas en la esquina. Si algo llegó mal, déjalo
                    dicho abajo y, si se puede, fotografíalo.
                  </>
                ) : viaje.ai_pendiente ? (
                  <>
                    <b>La llegada se certificó {hora(viaje.llegada_en)}.</b> Lo que falta
                    es la muestra, y de lo que se cuente aquí sale lo que se le abona al
                    socio.
                  </>
                ) : (
                  <>
                    <b>La llegada ya quedó registrada.</b> Falta la muestra: se saca en
                    el muelle, antes de descargar, y de lo que se cuente aquí sale lo
                    que se le abona al socio.
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

          {/* EL TERCER PASO: la revisión AI, aquí mismo.
              Es el MISMO formulario que vivía en la pantalla suelta —no
              una copia—, solo que ahora quien decide a dónde se va
              después es esta pantalla y no él. El vehículo no se vuelve
              a digitar: sale del viaje que ya está abierto. */}
          {paso === 2 && revisaAi && maestrosAi && (
            <FormularioAi
              viaje={{
                viaje_id: viaje.id, placa: viaje.placa, planta: viaje.planta,
                fecha: viaje.fecha, sku: viaje.sku,
                llego_en: viaje.llegada_en ?? null,
                ai_motivo: viaje.ai_motivo ?? null,
              }}
              revision={null}
              detalle={[]}
              defectos={maestrosAi.defectos}
              envases={maestrosAi.envases}
              socios={maestrosAi.socios}
              canales={maestrosAi.canales}
              alGuardar={listo}
              /* «Después» y no «Cancelar»: la llegada YA se guardó, así
                 que salir de aquí no deshace nada — deja la revisión
                 pendiente, y la tarjeta del vehículo la sigue pidiendo.
                 Decirle «cancelar» haría creer que se perdió todo. */
              alCancelar={listo}
              rotuloCancelar="Después"
            />
          )}
        </div>

        {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
      </section>
    </>
  );
}
