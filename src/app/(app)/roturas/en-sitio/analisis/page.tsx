import Link from "next/link";
import { roturas as leerRoturas } from "@/modulos/roturas/datos";
import { Filtros } from "../../Filtros";
import { medirCobro } from "@/modulos/roturas/cobro";
import { hallazgosSitio } from "@/modulos/roturas/hallazgos-sitio";
import { pareto } from "@/modulos/roturas/pareto";
import { pesos } from "@/modulos/roturas/formato";
import { Pareto } from "./Pareto";
import { DeDondeSale } from "./Cobro";
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

  /* AQUÍ VIVÍA EL RECORRIDO —el diagrama de cintas de causa a proceso a
     baja— y se fue entero, con su armado de columnas y tramos. Estaba
     bien hecho y contestaba una pregunta de una sola pasada; la que se
     hace todos los meses la contesta el Pareto de abajo. Dejar el
     cálculo aquí sin nadie que lo pinte es lo que convierte una pantalla
     en un desván: se sigue manteniendo y ya no se ve.

     `modulos/roturas/sankey.ts` se queda con su arnés — no cuesta nada y
     el día que haga falta un recorrido está probado. */

  /* ---------------------------------------------------------------
     LA PLATA — CUÁNTO SE LE ESTÁ COBRANDO AL OL

     SE SUMA SOLO LO QUE DE VERDAD ESTÁ A COBRO —etapa 'cobro'—, que no
     es lo mismo que «lo que tiene visto bueno»: una rotura objetada y
     luego resuelta a favor del OL tiene visto bueno y NO se cobra.
     Sumar el filtro entero daría una cifra más grande y más cómoda que
     nadie podría defender en la reunión del mes.

     Y LAS QUE NO SE PUEDEN CALCULAR SE CUENTAN APARTE. Si a un material
     le falta el precio en el maestro, su cobro viene nulo: sumarlo como
     cero daría un total corto con cara de exacto.
     --------------------------------------------------------------- */
  /* LA EXCEPCIÓN: LO QUE NO SE LE VA A COBRAR AL OL.
     Son las que ABI resolvió a favor de Easy —etapa `no_cuenta`—. No es
     lo mismo que «devueltas por ABI» por un error de digitación: esto es
     una rotura que existió y que se decidió no cobrar, y es la resta que
     explica por qué el total es menor de lo que la gente recuerda haber
     reportado. */
  const noSeCobran = vivas.filter((r) => r.etapa === "no_cuenta");
  const excepcion = {
    n: noSeCobran.length,
    plata: noSeCobran.reduce((s, r) => s + (Number(r.cobro_total) || 0), 0),
  };

  const cobro = medirCobro(vivas);
  const { total: plata, rotas: plataRotas, contaminadas: plataCont,
          sinPrecio, porCausa: plataPorCausa } = cobro;

  /* =====================================================================
     LOS TRES PARETOS: CAUSA, ÁREA Y OPM
     ---------------------------------------------------------------------
     «El gráfico que sea un pareto de causa, área y OPM, que estén las 3.»

     LAS TRES CONTESTAN PREGUNTAS DISTINTAS y por eso van las tres: la
     causa dice QUÉ pasó, el área DÓNDE, y el OPM QUIÉN lo reportó. Una
     sola de ellas manda a arreglar lo que no es —una causa que se
     concentra en un área es un problema de ese sitio, y la misma causa
     repartida en toda la bodega es un problema del proceso—.

     SE MIDEN EN UNIDADES MOVIDAS —rotas más contaminadas— y la plata va
     al lado. Ordenar por plata sería ordenar por un dato que puede estar
     incompleto: a un material le puede faltar el precio en el maestro, y
     entonces su causa valdría cero y saldría la última siendo la
     primera. Ver la nota larga de `modulos/roturas/pareto`.
     ===================================================================== */
  const filasPareto = (nombre: (r: typeof cuentan[number]) => string | null | undefined) =>
    cuentan.map((r) => ({
      nombre: nombre(r),
      valor: Math.max(0, r.unidades_vidrio) + (r.contaminadas ?? 0),
      plata: r.cobro_total == null ? null : Number(r.cobro_total),
    }));

  const paretoCausa = pareto(filasPareto((r) => r.causa_nombre));
  const paretoArea = pareto(filasPareto((r) => r.area_nombre));
  /* EL OPM SOLO CUANDO LA ROTURA LA REPORTÓ UNO. Las que alguien se
     encontró sin dueño no tienen operario, y meterlas como «sin dato»
     las contaría como un registro mal hecho cuando es lo normal. */
  const paretoOpm = pareto(filasPareto((r) =>
    r.origen === "encontrada" ? "Encontrada sin dueño" : r.opm_nombre));

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
    excepcion,
    /* LOS MISMOS TRES PARETOS QUE LA PANTALLA, de la misma función. El
       papel y la pantalla no pueden decir cosas distintas: quien discute
       el cobro tiene delante el papel. */
    paretos: [
      { titulo: "Por causa · qué pasó", d: paretoCausa },
      { titulo: "Por área · dónde pasó", d: paretoArea },
      { titulo: "Por OPM · quién la reportó", d: paretoOpm },
    ],
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

      {/* ============ LAS CINCO CIFRAS DE ARRIBA ============
          «Total roturas (# de eventos), total contaminadas, total rotas,
           excepción (cuántas se les dejarán de cobrar) y cuánto le
           estamos cobrando.»

          EL ORDEN NO ES DECORATIVO: primero cuántas veces pasó, después
          qué salió de ahí partido en las dos formas que no cuestan lo
          mismo, después lo que NO se va a cobrar —que es lo que explica
          por qué el total es menor de lo que la gente recuerda haber
          reportado— y al final la plata, que es la conclusión. */}
      <section className="cifras cinco">
        <div className="cifra">
          <div className="rot">TOTAL ROTURAS</div>
          <div className="n">{vivas.length}</div>
          <div className="u">
            eventos registrados en el filtro{cuentan.length !== vivas.length
              && <> · {cuentan.length} con visto bueno</>}
          </div>
        </div>
        <div className="cifra">
          <div className="rot">TOTAL CONTAMINADAS</div>
          <div className="n">{contaminadas}</div>
          <div className="u">
            unidades que salieron contaminadas: pierden el líquido y el envase vuelve a la línea
          </div>
        </div>
        <div className="cifra">
          <div className="rot">TOTAL ROTAS</div>
          <div className="n">{total}</div>
          <div className="u">
            unidades que salieron rotas: pierden el líquido y la botella
          </div>
        </div>
        {/* LA EXCEPCIÓN ES LO QUE NO SE COBRA, y por eso va antes de la
            plata: es la resta que explica el total de al lado. */}
        <div className={"cifra" + (excepcion.n > 0 ? " aparte" : "")}>
          <div className="rot">EXCEPCIÓN · NO SE COBRA</div>
          {/* LA CIFRA GRANDE ES LA PLATA, NO EL CONTEO. «Son las que se
              dejan de cobrar por acuerdos, pero para que sepan cuánto han
              dejado de pagar»: lo que se viene a buscar aquí es el monto
              que el OL no va a pagar, y el número de roturas es el
              detalle. Puestas al revés, la cifra que importa quedaba en
              letra chica. */}
          <div className="n">{excepcion.n === 0 ? "—" : (pesos(excepcion.plata) ?? "—")}</div>
          <div className="u">
            {excepcion.n === 0
              ? "ninguna se deja de cobrar en este filtro"
              : <>que el OL no va a pagar · {excepcion.n} rotura
                  {excepcion.n === 1 ? "" : "s"} resuelta{excepcion.n === 1 ? "" : "s"} a su favor</>}
          </div>
        </div>
        <div className="cifra ojo">
          <div className="rot">SE LE COBRA AL OL</div>
          <div className="n">{pesos(plata) ?? "—"}</div>
          <div className="u">
            {cobro.aCobro} rotura{cobro.aCobro === 1 ? "" : "s"} a cobro
            {sinPrecio > 0 && <> · <b>{sinPrecio} sin precio</b></>}
          </div>
        </div>
      </section>

      {/* ============ DE QUÉ SE COMPONE LA PLATA ============
          La cifra de arriba sola no se puede discutir con nadie: esto es
          la cuenta que la sostiene. Vive en su propio componente para
          poder medirla sin montar la página entera — ver la nota larga
          de Cobro.tsx. */}
      {cobro.aCobro > 0 && (
        <DeDondeSale c={{
          total: plata, rotas: plataRotas, contaminadas: plataCont,
          sinPrecio, porCausa: plataPorCausa,
        }} />
      )}

      {/* =============================================================
          LOS TRES PARETOS
          -------------------------------------------------------------
          AQUÍ ESTABA EL RECORRIDO —el diagrama de cintas— y se va. Era
          bonito y contestaba «de qué causa salió y por dónde pasó», que
          es una pregunta de una sola pasada. Un Pareto contesta la que
          se hace todos los meses: CUÁNTAS hay que atacar para tapar la
          mayor parte. Esa respuesta es un número, y con ella se decide.

          VAN LAS TRES DIMENSIONES, no una con selector: la gracia está
          en compararlas. Una causa concentrada en un área es un problema
          de ese sitio; la misma causa repartida por toda la bodega es
          del proceso. Con un selector hay que recordar la anterior de
          memoria, y nadie lo hace.
          ============================================================= */}
      <section className="caja rq-paretos">
        <div className="rq-h">
          <b>Qué poco explica lo mucho</b>
          <span>unidades movidas: rotas más contaminadas</span>
        </div>
        {/* QUÉ ES LA ÚLTIMA COLUMNA, UNA VEZ Y PARA LOS TRES. Es la que
            convierte esto en un Pareto y no en un ranking, así que tiene
            que estar escrito — pero repetido debajo de cada uno deja de
            leerse, y arrastra consigo lo que sí es particular de cada
            Pareto. */}
        <p className="rq-paretos-lee">
          La última columna de cada lista es el <b>acumulado</b>: dónde pasa del 80 % es hasta
          dónde hay que atacar para tapar la mayor parte.
        </p>
        <div className="rq-paretos-tres">
          <div>
            <p className="rot">POR CAUSA · QUÉ PASÓ</p>
            <Pareto d={paretoCausa} medida="unidades" />
          </div>
          <div>
            <p className="rot">POR ÁREA · DÓNDE PASÓ</p>
            <Pareto d={paretoArea} medida="unidades" />
          </div>
          <div>
            <p className="rot">POR OPM · QUIÉN LA REPORTÓ</p>
            <Pareto d={paretoOpm} medida="unidades" />
          </div>
        </div>
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
