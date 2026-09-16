import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { maestros, tablero } from "@/modulos/rotlinea/datos";
import { letraDe } from "@/modulos/rotlinea/turnos";
import "../rotura.css";
import { Barras, Serie, type Barra } from "./Graficas";
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
  searchParams: Promise<{ desde?: string; hasta?: string; linea?: string }>;
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
  const tresPrimeras = maquinas.slice(0, 3).reduce((a, x) => a + x.valor, 0);

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

  /* ---------- La serie ---------- */
  const porDia = new Map<string, number>();
  for (const d of t.dias) porDia.set(d.fecha, (porDia.get(d.fecha) ?? 0) + Number(d.und));
  const serie = [...porDia.entries()].sort().map(([fecha, valor]) => ({ fecha, valor }));

  /* ---------- Lo que falta firmar ---------- */
  const sinFirma = t.sinFirma.length;
  const sinFirmaUnd = t.sinFirma.reduce((a, f) => a + Number(f.und), 0);
  const ultimosSinFirma = [...t.sinFirma]
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.linea - b.linea)
    .slice(0, 6);

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
            <h2>¿Cuál máquina se come el envase?</h2>
            <p>
              Unidades rotas por máquina en el período, de mayor a menor. Es la pregunta que se
              hace con esto: no cuánto se rompió, sino <b>dónde</b>.
            </p>
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
        <Barras datos={maquinas} total={und} max={15} />
        {maquinas.length >= 3 && und > 0 && (
          <p className="rl-t-pie">
            Las tres primeras suman <b>{fmt(tresPrimeras)}</b> unidades —{" "}
            <b>{((tresPrimeras * 100) / und).toFixed(1)} %</b> del total del período. Ahí es
            donde una hora de mantenimiento rinde más que en las otras doce juntas.
          </p>
        )}
      </section>

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
