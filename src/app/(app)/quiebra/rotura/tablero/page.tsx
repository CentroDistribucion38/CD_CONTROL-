import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { maestros, tablero } from "@/modulos/rotlinea/datos";
import { letraDe } from "@/modulos/rotlinea/turnos";
import "../rotura.css";
import { Barras, Serie, Pareto, type Barra } from "./Graficas";
import { EscogerCorte } from "./Corte";
import { CORTES, type Corte } from "@/modulos/rotlinea/cortes";
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
      /* QUÉ PORCENTAJE DEL UNIVERSO SON ESAS «POCAS», de verdad. El
         rótulo decía «el 20 % que más rompe» siempre, y con 4 líneas
         las dos primeras son el 50 %: el informe llamaba «20 %» a la
         mitad del universo. Un número mal rotulado en un informe es peor
         que ningún número, porque nadie lo va a volver a comprobar. */
      pctVitalesDelN: n > 0 ? (cuantasVitales * 100) / n : 0,
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
        {paretoDatos.length >= 3 && und > 0 && (() => {
          /* ---------- LA LECTURA, EN TRES PUNTOS ----------

             UN PÁRRAFO LARGO NO SE LEE EN UNA REUNIÓN. La versión
             anterior decía lo correcto en seis renglones corridos, y en
             seis renglones corridos nadie encuentra el dato que quiere
             citar. Se parte en tres puntos numerados —qué pasa, por qué
             pasa, y qué hacer— que es el orden en que se sostiene un
             argumento y el orden en que alguien lo repite.

             LOS PUNTOS SE ARMAN AQUÍ Y NO EN LA PLANTILLA: así el
             recuadro de la recomendación y el titular salen de las
             MISMAS variables que el texto, y no pueden decir cosas
             distintas del mismo período. */
          const p1 = A.seCumple
            ? {
                t: `${A.n80} de ${A.n} explican el 80 %.`,
                c: <>{A.cuantasVitales === 1 ? "El primero concentra" : `Los ${A.cuantasVitales} de mayor incidencia concentran`}{" "}
                   el {A.pctVitales.toFixed(1)} % del total. El resto aporta de forma marginal:
                   es una distribución concentrada y admite una intervención dirigida.</>,
              }
            : {
                t: `${las[0].toUpperCase()}${las.slice(1)} están parejas.`,
                c: <>{A.cuantasVitales === 1 ? "La primera suma" : `Las ${A.cuantasVitales} de mayor incidencia suman`}{" "}
                   el {A.pctVitales.toFixed(1)} %, muy lejos del 80 % que describiría un proceso
                   con un punto crítico. Cubrir el 80 % exigiría tocar {A.n80} de {A.n}.</>,
              };

          const p2 = !A.seCumple && corte === "maquina"
            ? {
                t: "Ese resultado es de agregación, no de operación.",
                c: <>Las {A.n} estaciones existen en las cuatro líneas, así que cada barra
                   promedia la misma estación de la línea 1, la 2, la 4 y la 6, y el promedio
                   borra la dispersión.</>,
              }
            : A.seCumple
              ? {
                  t: "La lista corta cabe en una orden de trabajo.",
                  c: <>{A.vitales.map((x) => x.rotulo).slice(0, 3).join(", ")}
                     {A.cuantasVitales > 3 ? " y el resto del grupo" : ""} —
                     el {A.pctN80.toFixed(0)} % de {las}— es todo el frente que hay que abrir.</>,
                }
              : {
                  t: "Intervenir el 80 % es intervenir el proceso.",
                  c: <>{A.n80} de {A.n} {varios} es el {A.pctN80.toFixed(0)} % del universo: una
                     acción sobre ese conjunto no es una acción dirigida, es un cambio de proceso
                     y se planea como tal.</>,
                };

          const p3 = mejor
            ? {
                t: `Por ${DATOS[mejor.id].uno} sí hay dónde apretar.`,
                c: <>{mejor.a.n80} de {mejor.a.n} explican el 80 % y{" "}
                   {DATOS[mejor.id].datos[0].rotulo} solo aporta{" "}
                   {((DATOS[mejor.id].datos[0].valor * 100) / und).toFixed(1)} %. La intervención
                   debe dirigirse por esa dimensión.</>,
              }
            : A.seCumple
              ? {
                  t: "El efecto esperado es proporcional.",
                  c: <>Reducir a la mitad la rotura de ese grupo baja el total del período en
                     torno a {(A.pctVitales / 2).toFixed(1)} puntos. Es la única palanca de ese
                     tamaño disponible en este corte.</>,
                }
              : {
                  t: "Ninguna otra dimensión concentra mejor.",
                  c: <>La reducción pasa entonces por condiciones comunes al proceso —material,
                     ajuste de velocidad, turno— y no por un equipo en particular.</>,
                };

          const puntos = [p1, p2, p3];
          const titular = A.seCumple
            ? { normal: `La rotura se concentra`, marcado: `por ${uno}.` }
            : mejor
              ? { normal: `Por ${uno} no se concentra.`, marcado: `Por ${DATOS[mejor.id].uno} sí.` }
              : { normal: "La rotura no se concentra", marcado: "en ninguna dimensión." };
          const recomienda = A.seCumple
            ? { que: `Intervenir por ${uno}`,
                por: `${A.n80} de ${A.n} ${varios} explican el 80 % de la rotura` }
            : mejor
              ? { que: `Intervenir por ${DATOS[mejor.id].uno}`,
                  por: `${mejor.a.n80} de ${mejor.a.n} ${DATOS[mejor.id].varios} explican el 80 % de la rotura` }
              : { que: "Revisar condiciones de proceso",
                  por: "ninguna dimensión concentra la rotura del período" };

          return (
          <div className={"rl-lect" + (A.seCumple ? " si" : " no")}>
            <div className="rl-lect-cab">
              <div className="rl-lect-titu">
                <p className="rl-lect-ojo">Dónde se concentra la rotura</p>
                <h3>
                  {titular.normal} <mark>{titular.marcado}</mark>
                </h3>
                <p className="rl-lect-meta">
                  {dia(desde)} a {dia(hasta)} · {fmt(und)} unidades rotas ·{" "}
                  {maquinas.length} máquinas y {envases.length} envases
                </p>
              </div>

              {/* LA RECOMENDACIÓN, APARTE Y EN NEGRO. Es la única línea
                  del bloque que pide una decisión, y en un informe eso no
                  puede ir enterrado en el tercer renglón de un párrafo:
                  se lee primero y se cita solo. */}
              <aside className="rl-lect-rec">
                <span>Recomendación</span>
                <b>{recomienda.que}</b>
                <i>{recomienda.por}</i>
              </aside>
            </div>

            <div className="rl-lect-cuerpo">
              <p className="rl-lect-ojo">Interpretación</p>
              <ol className="rl-lect-puntos">
                {puntos.map((x) => (
                  <li key={x.t}><b>{x.t}</b> {x.c}</li>
                ))}
              </ol>
            </div>

            {/* Las de mayor incidencia, con su peso. El orden ES la
                información: es un ranking, no una decoración. */}
            <ol className="rl-8020-lista">
              {A.vitales.map((x) => (
                <li key={x.clave}>
                  <span>{x.rotulo}</span>
                  <b>{((x.valor * 100) / und).toFixed(1)} %</b>
                </li>
              ))}
            </ol>
          </div>
          );
        })()}
        <Pareto datos={paretoDatos} total={und} />

      </section>

      <Lectura maquinas={maquinas} total={und} dias={diasConDato} serie={serie}
               lineas={lineas} envases={envases} periodo={`${dia(desde)} a ${dia(hasta)}`}
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
/**
 * QUÉ DICE ESTO — la lectura del período, en casillas.
 *
 * ANTES ERA UNA LISTA DE VIÑETAS de tres renglones cada una. Decía lo
 * mismo, pero un hallazgo enterrado en el tercer renglón de un párrafo
 * no se ve al pasar: hay que leer los cuatro para saber cuál importa.
 *
 * AHORA CADA HALLAZGO ES UNA CASILLA con su cifra grande adelante, y la
 * cifra es lo que se compara de un vistazo entre las cuatro. La frase
 * queda para el que quiera el porqué, no para el que quiera el qué.
 *
 * LO QUE SE PUEDE CERRAR VA APARTE Y ABAJO, en su propia banda: no es un
 * hallazgo sobre el período, es trabajo pendiente de hoy, y mezclarlo
 * con los otros cuatro haría que se leyera como una observación más.
 */
type Casilla = {
  cifra: string;
  /** Lo chico pegado a la cifra: «de 13», «×». */
  cola?: string;
  titulo: string;
  dice: string;
  /** La cifra en rojo: algo que hay que mirar, no algo que se describe. */
  ojo?: boolean;
};

function Lectura({ maquinas, total, dias, serie, lineas, envases,
                   sinFirmaApp, sinBaja, periodo }: {
  maquinas: Barra[]; total: number; dias: number;
  serie: { fecha: string; valor: number }[];
  lineas: Barra[]; envases: Barra[];
  sinFirmaApp: number; sinBaja: number;
  periodo: string;
}) {
  if (total <= 0 || maquinas.length === 0) return null;

  const nfl = (n: number) => n.toLocaleString("es-CO");
  const casillas: Casilla[] = [];

  /* ---- 1. La forma del pareto ---- */
  let acum = 0, hasta80 = 0;
  for (const m of maquinas) { acum += m.valor; hasta80++; if (acum >= total * 0.8) break }
  const primera = (maquinas[0].valor * 100) / total;
  const parejo = primera < 100 / maquinas.length * 1.6;

  casillas.push(parejo
    ? {
        cifra: String(hasta80), cola: `de ${maquinas.length}`,
        titulo: "Ninguna máquina manda",
        dice: `La más alta aporta ${primera.toFixed(1)} %. El problema atraviesa el proceso, ` +
              "no está en un equipo.",
      }
    : {
        cifra: String(hasta80), cola: `de ${maquinas.length}`,
        titulo: `${maquinas[0].rotulo} manda`,
        dice: `Ella sola pone el ${primera.toFixed(1)} %. Una hora de mantenimiento ahí rinde ` +
              `más que en las otras ${maquinas.length - hasta80} juntas.`,
      });

  /* ---- 2. El día que se salió del promedio ---- */
  if (serie.length >= 7) {
    const prom = total / serie.length;
    const pico = serie.reduce((m, p) => (p.valor > m.valor ? p : m), serie[0]);
    const veces = pico.valor / prom;
    if (veces >= 1.8) {
      const f = new Date(Date.parse(pico.fecha + "T12:00:00"))
        .toLocaleDateString("es-CO", { day: "numeric", month: "long" });
      casillas.push({
        cifra: veces.toFixed(1), cola: "×", ojo: true,
        titulo: `El ${f} se disparó`,
        dice: `${nfl(pico.valor)} contra un promedio de ${nfl(Math.round(prom))}. ` +
              "Vale la pena abrir ese turno.",
      });
    }
  }

  /* ---- 3. Dónde se concentra: línea y envase ---- */
  if (lineas.length >= 2) {
    const p = (lineas[0].valor * 100) / total;
    if (p >= 100 / lineas.length * 1.3) {
      casillas.push({
        cifra: `${p.toFixed(1)} %`,
        titulo: lineas[0].rotulo,
        dice: `De ${lineas.length} líneas. Cruzar con lo que produjo cada una antes de ` +
              "concluir: la que más produce rompe más sin estar peor.",
      });
    }
  }
  if (envases.length >= 2) {
    const p = (envases[0].valor * 100) / total;
    casillas.push({
      cifra: `${p.toFixed(1)} %`,
      titulo: envases[0].rotulo,
      dice: "Es el vidrio que más se va del período.",
    });
  }

  /* ---- 4. Lo que se puede cerrar HOY ---- */
  const pendientes: Casilla[] = [];
  if (sinFirmaApp > 0) {
    pendientes.push({
      cifra: nfl(sinFirmaApp), ojo: true,
      titulo: sinFirmaApp === 1 ? "turno sin firmar" : "turnos sin firmar",
      dice: "Registrados en la app. Esos sí se pueden cerrar hoy.",
    });
  }
  if (sinBaja > 0) {
    pendientes.push({
      cifra: nfl(sinBaja), ojo: true,
      titulo: "registros sin salir por SAP",
      dice: "Mientras no salgan, ese material sigue contando en el inventario.",
    });
  }

  return (
    <section className="rl-lee">
      <div className="rl-lee-cab">
        <h2>Qué dice esto</h2>
        <span>{periodo} · {dias} {dias === 1 ? "día" : "días"} con registro</span>
      </div>

      {/* LAS CASILLAS SE REPARTEN SOLAS. Son entre dos y cuatro según lo
          que haya pasado en el período —el pico solo aparece si hubo
          pico— así que una rejilla de cuatro fijas dejaría huecos que se
          leen como información que falta. */}
      <div className="rl-lee-rejilla">
        {casillas.map((c) => (
          <div className="rl-lee-c" key={c.titulo}>
            <p className={"rl-lee-num" + (c.ojo ? " ojo" : "")}>
              {c.cifra}{c.cola && <em>{c.cola}</em>}
            </p>
            <h3>{c.titulo}</h3>
            <p className="rl-lee-dice">{c.dice}</p>
          </div>
        ))}
      </div>

      {pendientes.map((c) => (
        <div className="rl-lee-hacer" key={c.titulo}>
          <b className={c.ojo ? "ojo" : undefined}>{c.cifra}</b>
          <div>
            <h3>{c.titulo}</h3>
            <p>{c.dice}</p>
          </div>
        </div>
      ))}

      <p className="rl-lee-pie">
        Todo se recalcula solo al cambiar el período o la línea.
      </p>
    </section>
  );
}

