import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { maestros, tablero } from "@/modulos/rotlinea/datos";
import { letraDe } from "@/modulos/rotlinea/turnos";
import "../rotura.css";
import { Barras, Serie, Pareto, type Barra } from "./Graficas";
import { EscogerCorte, CORTES, type Corte } from "./Corte";
import { Periodo } from "./Periodo";

export const dynamic = "force-dynamic";

function hoyLocal() {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}
const fmt = (n: number) => Math.round(n).toLocaleString("es-CO");

/**
 * EL TABLERO DE ROTURA DE LÍNEA.
 *
 * SE LEE DE ARRIBA ABAJO Y EN ESE ORDEN:
 *
 *   1. la cifra que manda ..... % de rotura contra la producción
 *   2. de dónde sale .......... las cuatro cifras que la componen
 *   3. cuál máquina ........... el pareto, que es LA pregunta del módulo
 *   4. cómo viene .............. la serie por día
 *   5. el detalle ............. por línea, por envase, y lo que falta firmar
 *
 * Quien pasa por el pasillo mira la primera línea y sigue. Quien está en
 * la reunión de la mañana baja hasta el pareto. Las dos cosas en la
 * misma pantalla, sin pestañas.
 *
 * EL PORCENTAJE ES LO QUE MANDA, no el número de botellas. Mil rotas en
 * un día de tres millones y mil en uno de ochocientas mil son dos cosas
 * muy distintas, y el número solo no las distingue.
 */
export default async function TableroRoturaPage({ searchParams }: {
  searchParams: Promise<{ desde?: string; hasta?: string; linea?: string; corte?: string }>;
}) {
  const q = await searchParams;
  const hoy = hoyLocal();
  const fecha = (s: string | undefined, x: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? s! : x;

  /* POR DEFECTO, LO QUE VA DEL AÑO. Es el período con el que se habla
     de rotura —"vamos en 0,32 %"— y el que tiene con qué comparar. */
  const desde = fecha(q.desde, `${hoy.slice(0, 4)}-01-01`);
  const hasta = fecha(q.hasta, hoy);
  const linea = Number(q.linea) || undefined;

  const [permisos, m, t] = await Promise.all([
    misPermisos(), maestros(), tablero(desde, hasta, linea),
  ]);
  void permisos;

  if (t.falta) {
    return (
      <div className="rl">
        <section className="rl-sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Ejecuta <code>supabase/modulos/rotura-linea.sql</code> y después{" "}
            <code>supabase/migraciones/2026-09-rotura-linea-tablero.sql</code>, que es de donde
            lee esta pantalla.
          </p>
        </section>
      </div>
    );
  }

  /* ---------- Las cifras ---------- */
  const und = t.dias.reduce((a, d) => a + Number(d.und), 0);
  const kg = t.dias.reduce((a, d) => a + Number(d.kg), 0);
  const producidas = t.produccion.reduce((a, p) => a + Number(p.producidas), 0);
  const pct = producidas > 0 ? (und * 100) / producidas : null;
  const sinBaja = t.dias.reduce((a, d) => a + d.sin_baja, 0);
  const diasConDato = new Set(t.dias.map((d) => d.fecha)).size;

  /* ---------- El pareto por máquina ----------
     YA VIENEN SUMADAS: una fila por máquina, no una por máquina y día.
     Aquí había un bucle que las volvía a agrupar, y agrupaba lo que la
     base ya había agrupado —diez mil filas de ida para producir quince
     barras—. La suma se hace donde están los datos. */
  const maquinas: Barra[] = t.maquinas
    .map((r) => ({ clave: String(r.maquina), rotulo: r.maquina_nombre,
                   valor: Number(r.rotas) }))
    .sort((a, b) => b.valor - a.valor);

  /* LAS QUE SE COMEN LA MITAD. Es la frase que sale de un pareto y la
     que nadie calcula mirando las barras. */
  let acum = 0, cuantasMitad = 0;
  for (const x of maquinas) { acum += x.valor; cuantasMitad++; if (acum >= und / 2) break }



  /* ---------- Por línea y por envase ---------- */
  const porLinea = new Map<number, number>();
  for (const d of t.dias) porLinea.set(d.linea, (porLinea.get(d.linea) ?? 0) + Number(d.und));
  const lineas: Barra[] = m.lineas
    .filter((l) => porLinea.has(l.linea))
    .map((l) => ({ clave: String(l.linea), rotulo: `Línea ${l.linea} · ${l.tren}`,
                   valor: porLinea.get(l.linea) ?? 0 }))
    .sort((a, b) => b.valor - a.valor);

  /* Igual que las máquinas: una fila por envase, ya sumada. */
  const envases: Barra[] = t.envases
    .map((r) => ({ clave: r.envase, rotulo: r.envase_nombre, valor: Number(r.und) }))
    .sort((a, b) => b.valor - a.valor);

  /* ---------- EL 80/20, sobre lo que se esté comparando ----------

     LA MISMA CUENTA SIRVE PARA LOS TRES CORTES, así que se escribe una
     vez. Y se hace por LOS DOS LADOS de la regla, porque con uno solo
     uno se puede creer lo que quiera:

       · ¿cuánto aporta el 20 % que más rompe?   (debería ser ~80 %)
       · ¿cuántos hacen falta para el 80 %?      (debería ser ~20 %)

     EL 20 % SE REDONDEA HACIA ARRIBA Y NUNCA BAJA DE 2. Con 4 líneas,
     el 20 % es 0,8: redondeado daría una sola, y «la primera aporta el
     36 %» no es un pareto, es el máximo. Dos es el mínimo para que la
     palabra «unas pocas» signifique algo. */
  const analiza = (datos: Barra[], total: number) => {
    const n = datos.length;
    const cuantasVitales = Math.min(n, Math.max(2, Math.ceil(n * 0.2)));
    const vitales = datos.slice(0, cuantasVitales);
    const undVitales = vitales.reduce((a, x) => a + x.valor, 0);
    const pctVitales = total > 0 ? (undVitales * 100) / total : 0;
    let a = 0, n80 = 0;
    for (const x of datos) { a += x.valor; n80++; if (a >= total * 0.8) break }
    return {
      n, vitales, cuantasVitales, undVitales, pctVitales, n80,
      pctN80: n > 0 ? (n80 * 100) / n : 0,
      /* SE CUMPLE cuando para el 80 % basta con la tercera parte. No es
         un número mágico: es donde «unas pocas» deja de ser una forma
         de hablar y pasa a ser una lista que cabe en una orden de
         trabajo. Con 12 envases son 4; con 13 máquinas serían 4 y hacen
         falta 10. */
      seCumple: n > 0 && n80 <= Math.max(2, Math.ceil(n / 3)),
    };
  };

  /* ---------- QUÉ SE COMPARA ---------- */
  const corte: Corte = CORTES.some((c) => c.id === q.corte)
    ? (q.corte as Corte) : "maquina";
  /* El artículo va en la tabla y no se arma con un if en la plantilla:
     «el 77 % de las máquinas» y «el 33 % de los envases» son la misma
     frase con dos géneros, y resolverlo en el sitio donde se escribe es
     lo que evita el «de lo/la/los» que sale de concatenar. */
  const DATOS: Record<Corte, { datos: Barra[]; uno: string; varios: string; las: string }> = {
    maquina: { datos: maquinas, uno: "máquina", varios: "máquinas", las: "las máquinas" },
    envase:  { datos: envases,  uno: "envase",  varios: "envases",  las: "los envases" },
    linea:   { datos: lineas,   uno: "línea",   varios: "líneas",   las: "las líneas" },
  };
  const { datos: paretoDatos, uno, varios, las } = DATOS[corte];
  const A = analiza(paretoDatos, und);

  /* EL CORTE QUE SÍ CONCENTRA, para poder decírselo a quien está
     mirando el que no. Es la diferencia entre «aquí no hay nada» y
     «aquí no, pero al lado sí». */
  const otros = CORTES
    .filter((c) => c.id !== corte)
    .map((c) => ({ ...c, a: analiza(DATOS[c.id].datos, und), n: DATOS[c.id].varios }))
    .filter((c) => c.a.seCumple && c.a.n >= 5)
    .sort((x, y) => x.a.n80 / x.a.n - y.a.n80 / y.a.n);
  const mejor = otros[0];

  /* ---------- La serie ---------- */
  const porDia = new Map<string, number>();
  for (const d of t.dias) porDia.set(d.fecha, (porDia.get(d.fecha) ?? 0) + Number(d.und));
  const serie = [...porDia.entries()].sort().map(([fecha, valor]) => ({ fecha, valor }));

  /* ---------- Lo que falta firmar ---------- */
  /* CONTADOS EN LA BASE, no aquí. Contar las filas que llegaron daba
     exactamente 1000 —el tope de PostgREST— y nadie se enteraba: la
     consulta no falla, solo contesta de menos. */
  const sinFirma = Number(t.resumenFirma?.turnos ?? 0);
  const sinFirmaUnd = Number(t.resumenFirma?.unidades ?? 0);
  /* Los que de verdad se pueden cerrar hoy: los que alguien registró en
     la app. El histórico del Excel nunca lo firmó nadie ni lo va a
     firmar, y contarlo como pendiente vuelve la alarma un adorno. */
  const sinFirmaApp = Number(t.resumenFirma?.turnos_app ?? 0);
  const ultimosSinFirma = t.sinFirma;

  const dia = (f: string) =>
    new Date(Date.parse(f + "T12:00:00")).toLocaleDateString("es-CO",
      { day: "numeric", month: "short" });

  return (
    <div className="rl">
      <Periodo desde={desde} hasta={hasta} linea={linea} hoy={hoy} lineas={m.lineas} />

      {/* 1 ─ LA CIFRA QUE MANDA */}
      <section className="rl-cabeza">
        <div>
          <p className="rl-ojo">
            QUIEBRA · ROTURA DE LÍNEA · {dia(desde)} a {dia(hasta)}
            {linea && ` · LÍNEA ${linea}`}
          </p>
          <h1>Tablero</h1>
          <p className="rl-sub">
            {pct == null ? (
              <>Todavía no hay producción cargada para este período, así que no hay contra qué
              medir la rotura. Lo que se ve son <b>cantidades</b>; el porcentaje sale cuando
              entre el ZPREC de SAP.</>
            ) : (
              <>De cada cien botellas envasadas, <b>{pct.toFixed(2)}</b> se rompieron en la
              línea. Es la cifra que manda: el número de botellas solo no distingue un día de
              tres millones de uno de ochocientas mil.</>
            )}
          </p>
        </div>

        <div className="rl-panel">
          <div className="rl-corte" aria-hidden />
          <div className="rl-rot">{pct == null ? "ROTAS EN EL PERÍODO" : "% DE ROTURA"}</div>
          <div className="rl-num">{pct == null ? fmt(und) : `${pct.toFixed(2)}%`}</div>
          <div className="rl-pie">
            {pct == null
              ? <>unidades · <b>{fmt(kg)} kg</b></>
              : <><b>{fmt(und)}</b> rotas de {fmt(producidas)} envasadas</>}
          </div>
        </div>
      </section>

      {/* 2 ─ DE DÓNDE SALE */}
      <section className="rl-cifras">
        <div className="rl-cifra">
          <div className="rl-c-rot">UNIDADES ROTAS</div>
          <div className="rl-c-n">{fmt(und)}</div>
          <div className="rl-c-u">{fmt(kg)} kg de vidrio · {diasConDato} días con registro</div>
        </div>
        <div className="rl-cifra">
          <div className="rl-c-rot">PROMEDIO AL DÍA</div>
          <div className="rl-c-n">{diasConDato ? fmt(und / diasConDato) : "—"}</div>
          <div className="rl-c-u">unidades, solo contando los días que tienen registro</div>
        </div>
        <div className={"rl-cifra" + (sinFirma ? " ojo" : "")}>
          <div className="rl-c-rot">TURNOS SIN FIRMAR</div>
          <div className="rl-c-n">{sinFirma}</div>
          <div className="rl-c-u">
            {sinFirma === 0
              ? "todo lo del período está validado"
              : <>con <b>{fmt(sinFirmaUnd)}</b> unidades que nadie ha dado por buenas</>}
          </div>
        </div>
        <div className={"rl-cifra" + (sinBaja ? " ojo" : "")}>
          <div className="rl-c-rot">SIN DAR DE BAJA</div>
          <div className="rl-c-n">{fmt(sinBaja)}</div>
          <div className="rl-c-u">
            {sinBaja === 0 ? "todo salió por SAP"
                           : "registros que todavía no han salido por SAP"}
          </div>
        </div>
      </section>

      {/* 3 ─ EL PARETO. Es LA pregunta del módulo. */}
      <section className="rl-tarj">
        <div className="rl-t-cab">
          <div>
            <h2>¿Por dónde se está yendo el envase?</h2>
            <p>
              Pareto de las unidades rotas en el período. La pregunta no es cuánto se rompió,
              sino <b>dónde meter la mano</b> — y eso depende de qué se compare.
            </p>
            <EscogerCorte corte={corte} />
          </div>
          {maquinas.length > 0 && und > 0 && (
            <div className="rl-t-clave">
              <b>{cuantasMitad}</b>
              <span>
                {cuantasMitad === 1 ? "máquina se come" : "máquinas se comen"} la mitad de todo
                lo que se rompe
              </span>
            </div>
          )}
        </div>

        {/* ---------- EL 80/20, en cifras y con veredicto ----------
            Va ARRIBA del pareto y no debajo: es la pregunta con la que
            se entra al cuadro —«¿dónde meto la mano?»— y la respuesta
            tiene que estar antes de las barras, no después de
            estudiarlas. */}
        {paretoDatos.length >= 3 && und > 0 && (
          <div className={"rl-8020" + (A.seCumple ? " si" : " no")}>
            <div className="rl-8020-cifras">
              <div className="rl-8020-c">
                <span className="rl-8020-r">El 20 % que más rompe</span>
                <b>{A.pctVitales.toFixed(1)} %</b>
                <i>{A.cuantasVitales} de {A.n} {varios} · {fmt(A.undVitales)} unidades</i>
              </div>
              <div className="rl-8020-flecha" aria-hidden>·</div>
              <div className="rl-8020-c">
                <span className="rl-8020-r">Para juntar el 80 %</span>
                <b>{A.n80} de {A.n}</b>
                <i>o sea el {A.pctN80.toFixed(0)} % de {las}</i>
              </div>
            </div>

            <p className="rl-8020-fallo">
              {A.seCumple ? (
                <>
                  <b>Se cumple el 80/20.</b> Con {A.n80} {A.n80 === 1 ? uno : varios} de {A.n} se
                  cubre el 80 % de todo lo que se rompe. Esa es la lista corta, y cabe en una
                  orden de trabajo.
                </>
              ) : (
                <>
                  <b>Por {uno} no se cumple el 80/20.</b> Para llegar al 80 % hacen falta{" "}
                  <b>{A.n80} de {A.n}</b>, y diez frentes a la vez no son un plan.
                  {corte === "maquina" && (
                    <> Y no es que la cuenta esté mal: las {A.n} máquinas son las estaciones que
                    <b> todas las líneas tienen</b>, así que esta barra junta la desempacadora de
                    la línea 1 con la de la 2, la 4 y la 6. Cuatro máquinas distintas promediadas
                    dan siempre algo parecido a la media — por eso salen parejas.</>
                  )}
                  {mejor && (
                    <> Donde sí se concentra es <b>por {DATOS[mejor.id].uno}</b>:{" "}
                    <b>{mejor.a.n80} de {mejor.a.n}</b> {DATOS[mejor.id].varios} hacen el 80 %,
                    y el primero solo pone{" "}
                    <b>{((DATOS[mejor.id].datos[0].valor * 100) / und).toFixed(1)} %</b>. Ese es
                    el frente por el que se ataca. Cámbialo aquí arriba y lo ves.</>
                  )}
                </>
              )}
            </p>

            {/* La lista corta. Aunque no se cumpla el 80/20, si hay que
                empezar por algún lado se empieza por estos. */}
            <ol className="rl-8020-lista">
              {A.vitales.map((x) => (
                <li key={x.clave}>
                  <span>{x.rotulo}</span>
                  <b>{((x.valor * 100) / und).toFixed(1)} %</b>
                </li>
              ))}
            </ol>
          </div>
        )}
        <Pareto datos={paretoDatos} total={und} />

      </section>

      <Lectura maquinas={maquinas} total={und} dias={diasConDato} serie={serie}
               lineas={lineas} envases={envases}
               sinFirmaApp={sinFirmaApp} sinBaja={sinBaja} />

      {/* 4 ─ CÓMO VIENE */}
      <section className="rl-tarj">
        <div className="rl-t-cab">
          <div>
            <h2>Cómo viene, día por día</h2>
            <p>Unidades rotas cada día del período, con el promedio marcado.</p>
          </div>
        </div>
        <Serie puntos={serie} />
      </section>

      {/* 5 ─ EL DETALLE */}
      <div className="rl-dos">
        <section className="rl-tarj">
          <div className="rl-t-cab">
            <div>
              <h2>Por línea</h2>
              <p>Cuál tren aporta más al total. Sin cruzar con su producción todavía.</p>
            </div>
          </div>
          <Barras datos={lineas} total={und} max={6} />
        </section>

        <section className="rl-tarj">
          <div className="rl-t-cab">
            <div>
              <h2>Por envase</h2>
              <p>Cuál vidrio es el que se está yendo.</p>
            </div>
          </div>
          <Barras datos={envases} total={und} max={8} />
        </section>
      </div>

      {sinFirma > 0 && (
        <section className="rl-tarj ojo">
          <div className="rl-t-cab">
            <div>
              <h2>Turnos sin firmar</h2>
              <p>
                Tienen rotura registrada y nadie los ha dado por buenos. Un turno sin firma no
                dice si el número está bien o si se quedó a medias.
              </p>
            </div>
          </div>
          <div className="rl-lista-firma">
            {ultimosSinFirma.map((f) => (
              <Link key={`${f.fecha}-${f.linea}-${f.turno}`} className="rl-chip-firma"
                    href={`/quiebra/rotura?d=${f.fecha}`}>
                <b>{dia(f.fecha)}</b>
                <span>Línea {f.linea} · Turno {letraDe(f.turno)}</span>
                <i>{fmt(Number(f.und))} und</i>
              </Link>
            ))}
            {sinFirma > ultimosSinFirma.length && (
              <span className="rl-mas-firma">y {sinFirma - ultimosSinFirma.length} más</span>
            )}
          </div>
        </section>
      )}

      {/* LA TABLA. Las gráficas se leen; la tabla se copia y se audita. */}
      <section className="rl-tarj">
        <div className="rl-t-cab">
          <div>
            <h2>El detalle, en números</h2>
            <p>Lo mismo del pareto, para copiar o para revisar cifra por cifra.</p>
          </div>
        </div>
        <div className="rl-tabla-env">
          <table className="rl-tabla">
            <thead>
              <tr>
                <th>Máquina</th>
                <th className="cen">Unidades</th>
                <th className="cen">% del total</th>
                <th className="cen">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {(() => { let a = 0; return maquinas.map((x) => {
                a += x.valor;
                return (
                  <tr key={x.clave}>
                    <td className="rl-maq">{x.rotulo}</td>
                    <td className="cen rl-und">{fmt(x.valor)}</td>
                    <td className="cen">{und ? ((x.valor * 100) / und).toFixed(1) : "0"} %</td>
                    <td className="cen">{und ? ((a * 100) / und).toFixed(1) : "0"} %</td>
                  </tr>
                );
              })})()}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL DEL PERÍODO</td>
                <td className="cen">{fmt(und)}</td>
                <td className="cen">100 %</td>
                <td className="cen">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="rl-volver">
        <Link href="/quiebra/rotura">Registrar rotura</Link>
        {" · "}
        <Link href="/quiebra/rotura/maestro">Maestro</Link>
      </p>
    </div>
  );
}

/* =====================================================================
   LA LECTURA

   LO QUE UN TABLERO NO HACE SOLO ES DECIRTE QUÉ SIGNIFICA. Trece barras
   parecidas y una curva no le dicen nada a quien entra dos minutos
   entre turno y turno: hay que mirarlas, compararlas y sacar la
   conclusión, y eso lo hace quien ya sabe qué busca. Esto escribe la
   conclusión.

   NO ES UN TEXTO FIJO CON HUECOS. Las frases cambian según lo que digan
   los números, porque la conclusión correcta depende de la forma de los
   datos: si una máquina se dispara, la lectura señala esa máquina; si
   están todas parejas —que es lo que pasa hoy— la lectura dice
   justamente eso, que NO hay una culpable, y que buscarla es perder el
   tiempo. Un texto que siempre dijera «concéntrate en la primera»
   mandaría a mantenimiento a perseguir un fantasma.

   Y SE MOJA. «La rotura está repartida» es una lectura; «los datos
   muestran variaciones» no es nada. Si el número no da para afirmar,
   no se pone la frase.
   ===================================================================== */
function Lectura({ maquinas, total, dias, serie, lineas, envases, sinFirmaApp, sinBaja }: {
  maquinas: Barra[]; total: number; dias: number;
  serie: { fecha: string; valor: number }[];
  lineas: Barra[]; envases: Barra[];
  sinFirmaApp: number; sinBaja: number;
}) {
  if (total <= 0 || maquinas.length === 0) return null;

  const frases: React.ReactNode[] = [];

  /* ---- 1. La forma del pareto ---- */
  let acum = 0, hasta80 = 0;
  for (const m of maquinas) { acum += m.valor; hasta80++; if (acum >= total * 0.8) break }
  const primera = (maquinas[0].valor * 100) / total;
  const parejo = primera < 100 / maquinas.length * 1.6;

  if (parejo) {
    frases.push(
      <>
        <b>No hay una máquina culpable.</b> La más alta —{maquinas[0].rotulo}— aporta el{" "}
        <b>{primera.toFixed(1)} %</b>, y para juntar el 80 % hacen falta{" "}
        <b>{hasta80} de {maquinas.length}</b>. Cuando la rotura está repartida así de pareja,
        el problema no suele ser una máquina desajustada sino algo que las atraviesa a todas:
        el estado del envase que entra, el manejo, o la velocidad a la que va la línea.
        Cambiar una máquina movería el {primera.toFixed(0)} % en el mejor de los casos.
      </>);
  } else {
    frases.push(
      <>
        <b>{hasta80} {hasta80 === 1 ? "máquina hace" : "máquinas hacen"} el 80 %</b> de toda la
        rotura del período, y {maquinas[0].rotulo} sola pone el <b>{primera.toFixed(1)} %</b>.
        Ahí una hora de mantenimiento rinde más que en las otras {maquinas.length - hasta80}{" "}
        juntas.
      </>);
  }

  /* ---- 2. El día más alto contra el promedio ---- */
  if (serie.length >= 7) {
    const prom = total / serie.length;
    const pico = serie.reduce((m, p) => (p.valor > m.valor ? p : m), serie[0]);
    const veces = pico.valor / prom;
    if (veces >= 1.8) {
      const f = new Date(Date.parse(pico.fecha + "T12:00:00"))
        .toLocaleDateString("es-CO", { day: "numeric", month: "long" });
      frases.push(
        <>
          El <b>{f}</b> se rompió <b>{veces.toFixed(1)} veces</b> el promedio del período
          ({pico.valor.toLocaleString("es-CO")} contra {Math.round(prom).toLocaleString("es-CO")}).
          Un día así no es ruido: o pasó algo ese turno, o alguien registró dos veces. Vale la
          pena abrirlo.
        </>);
    }
  }

  /* ---- 3. Dónde se concentra: línea y envase ---- */
  if (lineas.length >= 2) {
    const p = (lineas[0].valor * 100) / total;
    if (p >= 100 / lineas.length * 1.3) {
      frases.push(
        <>
          <b>{lineas[0].rotulo}</b> aporta el <b>{p.toFixed(1)} %</b> con{" "}
          {lineas.length} líneas en juego. Antes de sacar conclusiones conviene cruzarlo con
          cuánto produjo cada una: la que más produce rompe más sin estar peor.
        </>);
    }
  }
  if (envases.length >= 2) {
    const p = (envases[0].valor * 100) / total;
    frases.push(
      <>
        El vidrio que más se va es <b>{envases[0].rotulo}</b>: <b>{p.toFixed(1)} %</b> de las
        unidades del período.
      </>);
  }

  /* ---- 4. Lo que hay que hacer, no solo lo que pasó ---- */
  const pendientes: React.ReactNode[] = [];
  if (sinFirmaApp > 0) {
    pendientes.push(
      <>
        <b>{sinFirmaApp}</b> {sinFirmaApp === 1 ? "turno registrado en la app está" : "turnos registrados en la app están"}{" "}
        sin firmar. Esos sí se pueden cerrar hoy.
      </>);
  }
  if (sinBaja > 0) {
    pendientes.push(
      <>
        <b>{sinBaja.toLocaleString("es-CO")}</b> registros no han salido por SAP. Mientras no
        salgan, ese material sigue contando en el inventario.
      </>);
  }

  return (
    <section className="rl-lectura">
      <div className="rl-l-cab">
        <h2>Qué dice esto</h2>
        <p>La lectura del período, en palabras. Sale de los mismos números de arriba.</p>
      </div>
      <ul className="rl-l-lista">
        {frases.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
      {pendientes.length > 0 && (
        <div className="rl-l-hacer">
          <h3>Y esto se puede cerrar</h3>
          <ul>{pendientes.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      <p className="rl-l-nota">
        {dias} {dias === 1 ? "día" : "días"} con registro en el período.
        {" "}Todo esto se recalcula solo cuando cambias el período o la línea.
      </p>
    </section>
  );
}
