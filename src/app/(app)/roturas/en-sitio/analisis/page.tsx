import Link from "next/link";
import { roturas as leerRoturas } from "@/modulos/roturas/datos";
import { Filtros } from "../../Filtros";
import {
  armarSankey, masGrandes, COLOR_ASUMIDA, COLOR_NO_ASUMIDA,
  COLOR_PROCESO, COLOR_PROCESO_2, COLOR_VIDRIO, COLOR_LIQUIDO,
} from "@/modulos/roturas/sankey";
import { medirCobro } from "@/modulos/roturas/cobro";
import { hallazgosSitio } from "@/modulos/roturas/hallazgos-sitio";
import { pesos } from "@/modulos/roturas/formato";
import { Recorrido } from "./Recorrido";
import { BotonInformeSitio } from "./BotonInformeSitio";
import type { DatosSitio } from "./informe";
import "../../roturas.css";
import { SinTablas } from "../../comunes";

export const dynamic = "force-dynamic";

/**
 * ANÁLISIS DE EN SITIO — por qué se sigue rompiendo lo mismo.
 *
 * AQUÍ NO HAY UN SOLO KILO, a propósito. Esta rama cuenta unidades por
 * causa y por proceso: contesta de quién fue la rotura y de dónde salió.
 * Los kilos viven en el análisis de la salida y contestan otra pregunta.
 * Juntarlos en una pantalla es lo que termina en un informe con un
 * factor de conversión inventado — una botella de 330 y una de 750 pesan
 * distinto, el vidrio se acumula días antes de salir, y parte de lo que
 * se pesa nunca se contó aquí.
 *
 * Todo se calcula sobre lo que ya se trajo. Una pantalla de análisis que
 * pide seis consultas más para decir lo que ya estaba en la primera es
 * lenta sin necesidad.
 */
/** EL DÍA DE HOY EN BARRANQUILLA, no en UTC. A las 7 de la noche UTC ya
 *  es mañana, y «Hoy» traería el día equivocado media jornada. */
function hoyLocal() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export default async function AnalisisEnSitioPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const datos = await leerRoturas(2000);
  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  const q = await searchParams;
  const uno = (k: string) => { const v = q[k]; return (Array.isArray(v) ? v[0] : v) ?? "" };
  const desde = uno("desde"), hasta = uno("hasta");
  const fCausa = uno("causa"), fProceso = uno("proceso"), fArea = uno("area"), fGrupo = uno("grupo");

  const todas = datos.roturas.filter((r) => r.estado !== "anulada");

  /* LA FECHA QUE MANDA ES LA DEL REPORTE, no la del visto bueno: aquí se
     pregunta CUÁNDO SE ROMPIÓ. En el análisis de la salida manda la del
     despacho porque allá se pregunta cuándo salió; son dos preguntas y
     por eso son dos fechas distintas. */
  const enRango = (r: typeof todas[number]) => {
    const d = (r.reportada_en ?? "").slice(0, 10);
    if (!d) return !desde && !hasta;
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    return true;
  };
  const pasa = (r: typeof todas[number]) =>
    enRango(r)
    && (!fCausa   || r.causa === fCausa)
    && (!fProceso || r.proceso === fProceso)
    && (!fArea    || r.area === fArea)
    && (!fGrupo   || r.grupo === fGrupo);

  /* LAS OPCIONES SALEN DE LO QUE HAY, y de TODAS —no de lo ya filtrado—:
     si salieran de lo filtrado, escoger una causa borraría del
     desplegable las demás y no habría cómo cambiar de opinión. */
  const opciones = (
    clave: (r: typeof todas[number]) => string | null | undefined,
    nombre: (r: typeof todas[number]) => string | null | undefined,
  ) => {
    const m = new Map<string, string>();
    for (const r of todas) { const k = clave(r); if (k) m.set(k, nombre(r) ?? k) }
    return [...m.entries()].map(([id, n]) => ({ id, nombre: n }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  };

  const vivas = todas.filter(pasa);
  /* Se agrupa sobre lo que CUENTA, no sobre todo lo reportado: incluir
     lo que ABI devolvió haría que el ranking de causas midiera también
     los errores de digitación, y la conclusión saldría torcida. */
  const cuentan = vivas.filter((r) => r.cuenta);

  function agrupar(clave: (r: typeof cuentan[number]) => string) {
    const m = new Map<string, number>();
    for (const r of cuentan) m.set(clave(r), (m.get(clave(r)) ?? 0) + r.unidades_vidrio);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  const porCausa = agrupar((r) => r.causa_nombre);
  const porProceso = agrupar((r) => r.proceso_nombre);
  const maxCausa = porCausa[0]?.[1] ?? 1;
  const maxProceso = porProceso[0]?.[1] ?? 1;

  const total = cuentan.reduce((s, r) => s + r.unidades_vidrio, 0);
  const noAsumidas = cuentan.filter((r) => r.grupo === "no_asumida")
    .reduce((s, r) => s + r.unidades_vidrio, 0);
  const pctNoAsumida = total ? Math.round((noAsumidas / total) * 100) : 0;

  const devueltas = vivas.filter((r) => r.estado === "no_cuenta").length;
  const pctDevueltas = vivas.length ? Math.round((devueltas / vivas.length) * 100) : 0;
  /* LA BAJA DE LÍQUIDO Y LA DE VIDRIO SON DOS CIFRAS, no una. Las
     contaminadas pierden el líquido pero devuelven la botella, así que
     entran en la primera y no en la segunda. Sumarlas sería dar de baja
     un envase que sigue en la línea. */
  const liquido = cuentan.reduce((s, r) => s + r.unidades_liquido, 0);
  const contaminadas = cuentan.reduce((s, r) => s + (r.contaminadas ?? 0), 0);

  const causasNoAsumidas = new Set(cuentan.filter((r) => r.grupo === "no_asumida")
    .map((r) => r.causa_nombre));

  /* =====================================================================
     EL RECORRIDO DE LAS UNIDADES
     ---------------------------------------------------------------------
     «De qué causa salió · por dónde pasó · en qué termina.»

     TRES COLUMNAS Y DOS TRAMOS. Las dos barras de antes contestaban las
     dos primeras por separado, y la pregunta que nadie podía contestar
     era la que las une: de las tres mil de estibas malas, ¿cuántas
     pasaron por T1? Eso no se ve en dos rankings puestos uno debajo
     del otro, por mucho que cada uno esté bien.

     LA TERCERA COLUMNA ES EN QUÉ TERMINA, y hace falta porque las dos
     bajas NO son la misma: la rota pierde el líquido Y la botella; la
     contaminada pierde solo el líquido y el envase vuelve a la línea.
     Puestas juntas se daría de baja un envase que sigue trabajando.
     ===================================================================== */
  const causaCol = masGrandes(
    [...new Map(cuentan.map((r) => [r.causa_nombre, r])).values()].map((r) => ({
      id: "c:" + r.causa_nombre,
      rotulo: r.causa_nombre,
      pie: r.grupo === "no_asumida" ? "no asumida · exige foto" : "la asume el OL",
      valor: cuentan.filter((x) => x.causa_nombre === r.causa_nombre)
        .reduce((s, x) => s + x.unidades_vidrio, 0),
      color: r.grupo === "no_asumida" ? COLOR_NO_ASUMIDA : COLOR_ASUMIDA,
    })), 6);

  const procesoCol = masGrandes(
    [...new Set(cuentan.map((r) => r.proceso_nombre))].map((nombre) => ({
      id: "p:" + nombre,
      rotulo: nombre,
      valor: cuentan.filter((x) => x.proceso_nombre === nombre)
        .reduce((s, x) => s + x.unidades_vidrio + (x.contaminadas ?? 0), 0),
      color: COLOR_PROCESO,
    })), 6);
  /* EL QUE MÁS PESA VA EN OCRE Y LOS DEMÁS EN GRIS. El proceso dice
     DÓNDE pasó, no de quién fue: si compitiera de color con la causa,
     el ojo leería dos alarmas donde solo hay una. */
  procesoCol.filas.forEach((f, i) => { if (i > 0) f.color = COLOR_PROCESO_2 });

  /* EL VIDRIO Y EL LÍQUIDO SE CUENTAN POR SEPARADO y el diagrama mide
     el VIDRIO, que es lo que dice el KPI de arriba. La baja de líquido
     va en su cifra aparte: meterla como tercera salida haría que el
     total del dibujo no cuadrara con el titular. */
  /* ---------------------------------------------------------------
     LAS DOS SALIDAS, Y POR QUÉ NO SUMAN LO QUE LA MAQUETA DICE

     La maqueta parte 4.230 en «baja de vidrio 3.589» + «baja de
     líquido 641». ESO NO SE PUEDE SUMAR: una unidad ROTA pierde el
     líquido Y la botella, así que estaría en las dos columnas y el
     dibujo la contaría dos veces.

     Lo que sí son dos montones que no se pisan:
       BAJA DE VIDRIO       las rotas. Pierden botella (y líquido).
       SOLO BAJA DE LÍQUIDO las contaminadas. El envase vuelve a la
                            línea, así que no son baja de vidrio.

     Así el total del dibujo es rotas + contaminadas, cada unidad está
     en un solo sitio, y las dos cifras del pie —baja de líquido y de
     esas, contaminadas— siguen siendo las de siempre.
     --------------------------------------------------------------- */
  const rotas = cuentan.reduce((s, r) => s + Math.max(0, r.unidades_vidrio), 0);
  const soloLiquido = contaminadas;
  const recorrido = rotas + soloLiquido;

  /* ---------------------------------------------------------------
     LA PLATA — CUÁNTO SE LE ESTÁ COBRANDO AL OL

     «que la persona sepa, de acuerdo a lo que se ha ido a cobro,
      cuánto es.»

     SE SUMA SOLO LO QUE DE VERDAD ESTÁ A COBRO —etapa 'cobro'—, que no
     es lo mismo que «lo que tiene visto bueno»: una rotura objetada y
     luego resuelta a favor del OL tiene visto bueno y NO se cobra.
     Sumar el filtro entero daría una cifra más grande y más cómoda que
     nadie podría defender en la reunión del mes.

     Y LAS QUE NO SE PUEDEN CALCULAR SE CUENTAN APARTE. Si a un material
     le falta el precio en el maestro, su cobro viene nulo: sumarlo como
     cero daría un total corto con cara de exacto. Se dice cuántas son,
     que es lo que manda a arreglar el maestro.
     --------------------------------------------------------------- */
  const cobro = medirCobro(vivas);
  const { total: plata, rotas: plataRotas, contaminadas: plataCont,
          sinPrecio, porCausa: plataPorCausa } = cobro;

  const vistos = new Set([...causaCol.filas, ...procesoCol.filas].map((f) => f.id));
  const idCausa = (n: string) => (vistos.has("c:" + n) ? "c:" + n : causaCol.filas.at(-1)!.id);
  const idProceso = (n: string) => (vistos.has("p:" + n) ? "p:" + n : procesoCol.filas.at(-1)!.id);

  const sumar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const t1 = new Map<string, number>();
  const t2 = new Map<string, number>();
  for (const r of cuentan) {
    const u = Math.max(0, r.unidades_vidrio);
    if (u <= 0) continue;
    sumar(t1, `${idCausa(r.causa_nombre)}|${idProceso(r.proceso_nombre)}`, u);
    sumar(t2, `${idProceso(r.proceso_nombre)}|fin:vidrio`, u);
  }
  for (const r of cuentan) {
    const c = r.contaminadas ?? 0;
    if (c <= 0) continue;
    sumar(t1, `${idCausa(r.causa_nombre)}|${idProceso(r.proceso_nombre)}`, c);
    sumar(t2, `${idProceso(r.proceso_nombre)}|fin:liquido`, c);
  }

  const entradaReco = {
    columnas: [
      causaCol.filas,
      procesoCol.filas,
      [{ id: "fin:vidrio", rotulo: "Baja de vidrio",
         pie: "rota: pierde líquido y botella", valor: rotas, color: COLOR_VIDRIO },
       ...(soloLiquido > 0 ? [{ id: "fin:liquido", rotulo: "Solo baja de líquido",
         pie: "contaminada: vuelve el envase", valor: soloLiquido, color: COLOR_LIQUIDO }] : [])],
    ],
    tramos: [...t1, ...t2].map(([k, valor]) => {
      const [de, a] = k.split("|");
      return { de, a, valor };
    }),
  };
  const filasReco = Math.max(causaCol.filas.length, procesoCol.filas.length,
                             soloLiquido > 0 ? 2 : 1);
  const reco = armarSankey(entradaReco, 1160, Math.max(300, Math.min(660, 90 + filasReco * 104)));

  /* EL MISMO DIBUJO, ARMADO OTRA VEZ PARA EL PAPEL — y no es repetirse.
     `armarSankey` reparte el alto disponible entre los nodos, así que el
     alto del lienzo NO es un detalle de presentación: cambia la escala y
     con ella el grosor de cada cinta. El del papel es una hoja A4
     acostada, y ahí lo que cabe son 616 px de alto una vez llevados a
     milímetros. Con el lienzo de la pantalla —hasta 660— el dibujo salía
     por debajo del pie de página, y un diagrama cortado no dice nada.

     Y EL DEL PAPEL ES SIEMPRE EL ALTO ENTERO, no uno que crece con el
     número de nodos como el de la pantalla: la hoja mide lo que mide
     salgan dos causas o seis, y con el alto corto el diagrama quedaba
     arriba con media hoja en blanco debajo. El reparto sigue siendo
     proporcional —lo único que cambia es que las cintas salen más
     gordas—, así que no dice nada distinto.

     LAS DOS SALEN DE LA MISMA `entradaReco`, que es lo que garantiza que
     el papel y la pantalla enseñen el mismo recorrido. */
  const recoPapel = armarSankey(entradaReco, 1160, 616);

  /* LA LECTURA DE ABAJO: una sola, la que más pesa. Un diagrama sin
     una línea que diga qué mirar es un dibujo bonito, y a los treinta
     segundos la gente se va habiendo visto cintas. */
  const causaTop = causaCol.filas[0];

  /* =====================================================================
     LO QUE LLEVA EL PDF
     ---------------------------------------------------------------------
     Se arma AQUÍ, del mismo cálculo que pinta la pantalla —ver la nota
     larga de informe.ts—: si el PDF sacara sus propios totales, el día
     que cambie una regla el informe diría otra cifra y nadie se daría
     cuenta, porque las dos son creíbles y la que se manda por correo es
     la del PDF.
     ===================================================================== */
  const fLargo = (x: string) => x.split("-").reverse().join("/");
  const periodo = desde && hasta ? `del ${fLargo(desde)} al ${fLargo(hasta)}`
    : desde ? `desde el ${fLargo(desde)}`
    : hasta ? `hasta el ${fLargo(hasta)}`
    : "todo el histórico";
  const nombreDe = (lista: { id: string; nombre: string }[], id: string) =>
    lista.find((x) => x.id === id)?.nombre ?? id;
  const filtrosTexto = [
    fCausa && `causa ${nombreDe(opciones((r) => r.causa, (r) => r.causa_nombre), fCausa)}`,
    fProceso && `proceso ${nombreDe(opciones((r) => r.proceso, (r) => r.proceso_nombre), fProceso)}`,
    fArea && `área ${nombreDe(opciones((r) => r.area, (r) => r.area_nombre), fArea)}`,
    fGrupo && (fGrupo === "no_asumida" ? "no asumidas" : "asumidas por el OL"),
  ].filter(Boolean).join(" · ");

  /* LA ETAPA EN PALABRAS. En el papel no hay dónde pinchar para saber
     qué quiere decir «espera_ol». */
  const ETAPA_DICE: Record<string, string> = {
    espera_ol: "espera al OL", desacuerdo: "objetada, la mira ABI",
    cobro: "a cobro", no_cuenta: "no cuenta", anulada: "anulada",
  };

  const datosInforme: DatosSitio = {
    hoy: hoyLocal(), periodo, filtros: filtrosTexto,
    plata, plataRotas, plataCont,
    aCobro: cobro.aCobro, sinPrecio,
    porCausa: plataPorCausa,
    unidades: total, liquido, contaminadas,
    noAsumidas, pctNoAsumida, devueltas, pctDevueltas,
    roturasEnFiltro: vivas.length,
    hallazgos: hallazgosSitio(vivas, cuentan, cobro),
    recorrido: recoPapel.nodos.length
      ? { s: recoPapel, total: recorrido, juntados: causaCol.juntados + procesoCol.juntados }
      : null,
    /* LO MÁS NUEVO ARRIBA: quien abre el informe el lunes busca lo del
       fin de semana, no lo del primero de mes. */
    roturas: [...vivas]
      .sort((a, b) => (b.reportada_en ?? "").localeCompare(a.reportada_en ?? ""))
      .map((r) => ({
        codigo: r.codigo,
        fecha: (r.reportada_en ?? "").slice(0, 10),
        material: r.material,
        material_nombre: r.material_nombre,
        causa: r.causa_nombre,
        grupo: r.grupo,
        proceso: r.proceso_nombre,
        rotas: r.unidades_vidrio,
        contaminadas: r.contaminadas ?? 0,
        etapa: ETAPA_DICE[r.etapa ?? ""] ?? (r.cuenta ? "a cobro" : "sin decidir"),
        /* NULO Y NO CERO cuando falta el precio: un cero en la columna
           de plata se lee como «no se le cobra nada», que es lo
           contrario de lo que pasa. */
        cobro: r.cobro_total == null ? null : Number(r.cobro_total),
      })),
  };

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · ANÁLISIS</p>
          <h1>Por qué se rompe</h1>
          <p className="sub">
            Unidades de vidrio de lo que ya tiene visto bueno, por causa y por proceso. La causa
            dice de quién fue; el proceso, dónde pasó. Si un proceso pesa el doble que el
            siguiente, el problema es del proceso y no del turno que le tocó ese día.
            Y lo que cuesta cada una no es lo mismo: por la <b>rota</b> se le cobra al OL el
            envase; por la <b>contaminada</b>, el envase <b>y</b> el producto, porque un envase
            contaminado no se lava ni vuelve a la línea.
          </p>
        </div>
        {/* LA COLUMNA DERECHA VA EN UN SOLO HIJO: `.cabeza` es una
            rejilla de DOS columnas, y con tres hijos el tercero se va a
            la columna ancha y el KPI sale mocho. */}
        <div className="cabeza-der">
        <BotonInformeSitio datos={datosInforme} />
        {/* ARRIBA VA LA PLATA Y NO LAS UNIDADES. Las unidades siguen
            estando —en el recorrido y en las cifras de abajo— pero la
            pregunta con la que alguien entra a esta pantalla es cuánto
            se le está cobrando al OL, no cuántas botellas son. */}
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">SE LE COBRA AL OL</div>
          <div className="num">{pesos(plata) ?? "—"}</div>
          <div className="pie">
            {cobro.aCobro} rotura{cobro.aCobro === 1 ? "" : "s"} a cobro · {total} und de vidrio
            {sinPrecio > 0 && <> · <b>{sinPrecio} sin precio</b></>}
          </div>
        </div>
        </div>
      </section>

      <Filtros hoy={hoyLocal()}
        cuenta={`${vivas.length} rotura${vivas.length === 1 ? "" : "s"} en el filtro`}
        campos={[
        { clave: "causa",   rotulo: "Causa",   todas: "todas",
          opciones: opciones((r) => r.causa, (r) => r.causa_nombre) },
        { clave: "proceso", rotulo: "Proceso", todas: "todos",
          opciones: opciones((r) => r.proceso, (r) => r.proceso_nombre) },
        { clave: "area",    rotulo: "Área",    todas: "todas",
          opciones: opciones((r) => r.area, (r) => r.area_nombre) },
        { clave: "grupo",   rotulo: "Quién la asume", todas: "todas", opciones: [
          { id: "asumida",    nombre: "Asumida por el OL" },
          { id: "no_asumida", nombre: "No asumida" }] },
      ]} />

      <section className="cifras">
        <div className={"cifra" + (pctNoAsumida > 25 ? " mal" : "")}>
          <div className="rot">NO ASUMIDAS</div>
          <div className="n">{pctNoAsumida}%</div>
          <div className="u">{noAsumidas} unidades que se dice que no fueron del OL</div>
        </div>
        <div className={"cifra" + (pctDevueltas > 15 ? " mal" : "")}>
          <div className="rot">DEVUELTAS POR ABI</div>
          <div className="n">{pctDevueltas}%</div>
          <div className="u">{devueltas} que ABI marcó como que no cuentan</div>
        </div>
        <div className="cifra ojo">
          <div className="rot">BAJA DE LÍQUIDO</div>
          <div className="n">{liquido}</div>
          <div className="u">
            unidades de producto terminado: las rotas más las contaminadas
          </div>
        </div>
        <div className="cifra">
          <div className="rot">DE ESAS, CONTAMINADAS</div>
          <div className="n">{contaminadas}</div>
          <div className="u">
            pierden el líquido pero devuelven la botella: no cuentan como vidrio
          </div>
        </div>
      </section>

      {/* ============ DE QUÉ SE COMPONE LA PLATA ============
          La cifra de arriba sola no se puede discutir con nadie. Aquí
          se parte en las dos formas de cobrar —que no son la misma— y
          en las causas, que es de quién fue. */}
      {cobro.aCobro > 0 && (
        <section className="caja rq-plata">
          <div className="rq-h">
            <b>De dónde salen {pesos(plata) ?? "—"}</b>
            <span>precios del maestro, por botella</span>
          </div>
          <div className="rq-plata-dos">
            <div>
              <span className="rot">ROTAS · SOLO EL ENVASE</span>
              <b>{pesos(plataRotas) ?? "—"}</b>
              <em>se le cobra reponer la botella</em>
            </div>
            <div>
              <span className="rot">CONTAMINADAS · ENVASE Y PRODUCTO</span>
              <b>{pesos(plataCont) ?? "—"}</b>
              <em>el envase contaminado no vuelve a la línea</em>
            </div>
          </div>
          <table className="rq-plata-t">
            <thead>
              <tr><th>Causa</th><th>Quién la asume</th><th className="der">Se cobra</th></tr>
            </thead>
            <tbody>
              {plataPorCausa.map((c) => (
                <tr key={c.nombre}>
                  <td>{c.nombre}</td>
                  <td className={c.grupo === "no_asumida" ? "rq-no" : ""}>
                    {c.grupo === "no_asumida" ? "No asumida" : "El OL"}
                  </td>
                  <td className="der">{pesos(c.valor) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sinPrecio > 0 && (
            <p className="rq-mas">
              <b>{sinPrecio} rotura{sinPrecio === 1 ? "" : "s"} a cobro sin precio.</b> Al material
              le falta el suyo en el maestro, así que no entra en esta cuenta — el total de arriba
              se queda corto hasta que se llene en Inventario → Maestro.
            </p>
          )}
        </section>
      )}

      {/* =============================================================
          EL RECORRIDO. Reemplaza las dos barras —«por causa» y «por
          proceso»— que estaban una debajo de otra. Cada una estaba
          bien y ninguna contestaba la pregunta que las une: de las tres
          mil de estibas malas, ¿cuántas pasaron por T1?
          ============================================================= */}
      <section className="caja rq-flujo">
        <div className="rq-h">
          <b>El recorrido de las {recorrido} unidades</b>
          <span>el grosor de cada cinta son unidades</span>
        </div>
        <div className="rq-cols">
          <div>DE QUÉ CAUSA SALIÓ</div>
          <div>POR DÓNDE PASÓ</div>
          <div>EN QUÉ TERMINA</div>
        </div>

        <Recorrido s={reco} total={recorrido} />

        {causaTop && pctNoAsumida > 0 && (
          <div className="rq-lectura">
            <div className="n">{pctNoAsumida}%</div>
            <div>
              <b>
                {pctNoAsumida >= 30 ? "Casi un tercio" : `Un ${pctNoAsumida}%`} de lo roto se
                dice que no fue del OL
              </b>
              <span>
                {noAsumidas} unidades. Todas esas exigen foto, y todas van a discutirse con
                alguien: son las que hay que tener bien soportadas.
              </span>
            </div>
          </div>
        )}

        {(causaCol.juntados > 0 || procesoCol.juntados > 0) && (
          /* SE DICE QUE SE JUNTARON, y cuántas. Un «otros» mudo hace
             creer que hay una causa que se llama así. */
          <p className="rq-mas">
            Las {causaCol.juntados + procesoCol.juntados} más chicas están sumadas en «otros»:
            catorce cintas de dos píxeles se ven llenas y no dicen nada. El total no cambia.
          </p>
        )}
      </section>

      <div className="aviso">
        <b>Estas unidades no se cuadran con los kilos de la salida.</b> Miden cosas distintas:
        una botella de 330 y una de 750 pesan diferente, el vidrio se acumula días antes de
        salir, y parte de lo que se pesa nunca se contó aquí. Los kilos están en{" "}
        <Link href="/roturas/salida/analisis">Salida → Análisis</Link>, aparte y a propósito.
      </div>
    </div>
  );
}
