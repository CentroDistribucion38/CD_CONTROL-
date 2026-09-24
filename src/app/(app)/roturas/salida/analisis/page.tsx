import Link from "next/link";
import {
  salidas as leerSalidas, tolvas as leerTolvas, lineasDeSalidas,
  type Salida, type TolvaPesada,
} from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import { hoyLocal } from "@/modulos/traspasos/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Filtros } from "./Filtros";

export const dynamic = "force-dynamic";

const COLORES = [
  { id: "ambar", nombre: "Ámbar" },
  { id: "flint", nombre: "Flint" },
  { id: "green", nombre: "Green" },
];

/**
 * ANÁLISIS DE LA SALIDA — cuánto vidrio salió por la puerta.
 *
 * AQUÍ NO HAY UNA SOLA UNIDAD, a propósito. Esta rama pesa kilos; las
 * unidades por causa y por proceso viven en el análisis de En sitio y
 * contestan otra pregunta.
 *
 * TODO SE MIDE SOBRE SALIDAS DESPACHADAS. Una salida que todavía no ha
 * salido por la puerta se puede corregir: contarla aquí sería publicar
 * un número que mañana cambia, y un informe que cambia solo deja de
 * creerse a la tercera vez.
 *
 * ---------------------------------------------------------------------
 * LOS FILTROS, Y POR QUÉ SE FILTRA AQUÍ Y NO EN LA BASE
 * ---------------------------------------------------------------------
 * «Agrega los filtros de todo, o sea, falta.» No había ninguno: la
 * pantalla mostraba todo lo que existe, y «cuánto vidrio salió» sin
 * decir DE CUÁNDO no contesta ninguna pregunta que alguien tenga.
 *
 * El rango se aplica sobre LA FECHA EN QUE SALIÓ —no la de apertura—,
 * que es una cascada de tres columnas (despachada_en, validador_en,
 * supervisora_en: la historia del módulo escrita en las filas). Eso no
 * se puede pedir con un `gte` a PostgREST sin inventarse una columna, y
 * las salidas son cientos, no millones. Así que se traen y se filtran
 * aquí. El día que sean decenas de miles, esto pide una vista con la
 * fecha ya resuelta — y no antes: una vista más es otra cosa que
 * mantener.
 */
export default async function AnalisisSalidaPage({ searchParams }: {
  searchParams: Promise<{ desde?: string; hasta?: string; placa?: string; tolva?: string; color?: string }>;
}) {
  const q = await searchParams;
  const [sal, tol] = await Promise.all([leerSalidas(2000), leerTolvas(false)]);
  if (sal.falta) return <div className="rt"><SinTablas /></div>;

  const hoy = hoyLocal();
  const esFecha = (x?: string) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? "");
  const desde = esFecha(q.desde) ? q.desde! : "";
  const hasta = esFecha(q.hasta) ? q.hasta! : "";
  const placa = (q.placa ?? "").trim();
  const color = COLORES.some((c) => c.id === q.color) ? q.color! : "";
  const tolvaF = (q.tolva ?? "").trim();

  /* CUÁNDO SALIÓ DE VERDAD. Ver la nota de arriba: tres columnas en
     cascada, que son las tres épocas de este módulo. */
  const cuandoSalio = (s: Salida) =>
    s.despachada_en ?? s.validador_en ?? s.supervisora_en ?? null;
  const diaDe = (s: Salida) => (cuandoSalio(s) ?? "").slice(0, 10);

  const enRango = (s: Salida) => {
    const d = diaDe(s);
    if (!d) return !desde && !hasta;
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    return true;
  };
  const mismaPlaca = (s: Salida) => !placa || s.placa === placa;

  /* LAS LÍNEAS SOLO SI HACE FALTA. Filtrar por color o por tolva obliga
     a mirar tolva por tolva; sin esos filtros no se piden, y la
     pantalla cuesta una consulta menos. */
  const porLinea = !!color || !!tolvaF;
  const candidatas = sal.salidas.filter((s) => enRango(s) && mismaPlaca(s));
  const lineas: TolvaPesada[] = porLinea
    ? await lineasDeSalidas(candidatas.map((s) => s.id))
    : [];
  const dejaPasar = (id: string) => {
    if (!porLinea) return true;
    return lineas.some((l) =>
      l.salida_id === id && (!color || l.color === color) && (!tolvaF || l.tolva === tolvaF));
  };

  const vivas = candidatas.filter((s) => dejaPasar(s.id));

  /* LAS OPCIONES SALEN DE LO QUE HAY, no de una lista escrita aquí: una
     placa que nunca sacó vidrio no tiene por qué ofrecerse, y el día que
     aparezca una nueva sale sola. */
  const placasTodas = [...new Set(sal.salidas.map((s) => s.placa).filter(Boolean))].sort();
  const tolvasTodas = tol.filter((x) => x.activo).map((x) => x.codigo).sort();

  const completas = vivas.filter((s) => s.completa);
  const abiertas = vivas.filter((s) => s.estado === "abierta");
  const porSalir = vivas.filter((s) => s.estado === "cerrada" && !s.completa);

  const kg = completas.reduce((t, s) => t + Number(s.neto_kg), 0);
  const bruto = completas.reduce((t, s) => t + Number(s.bruto_kg), 0);
  const tara = completas.reduce((t, s) => t + Number(s.tara_kg), 0);
  const nTolvas = completas.reduce((t, s) => t + s.tolvas, 0);
  const promedio = nTolvas ? kg / nTolvas : 0;

  /* CUÁNTO SALE POR MES. Se agrupa por la fecha en que la salida quedó
     TERMINADA y no por la de apertura: una salida es del mes en que de
     verdad salió de la contabilidad.

     TRES CAMPOS EN CASCADA, Y NO ES INDECISIÓN — ES LA HISTORIA DEL
     MÓDULO, que está escrita en las filas de la tabla:
       · despachada_en  las de hoy: facturación despachó el vidrio con
                        el viaje;
       · validador_en   las de cuando existía Validación;
       · supervisora_en el último recurso, para que una fila rara no se
                        pierda del informe.

     ESTABA EN `validador_en!` A SECAS, y esa firma ya no se pone nunca:
     toda salida nueva daba `new Date(null)` → «Invalid Date», y el mes
     entero se iba a una barra con ese nombre. No revienta, no avisa, y
     el informe del mes simplemente deja de tener los meses. Es la clase
     de fallo que sobrevive años. */
  const porMes = new Map<string, number>();
  for (const s of completas) {
    const cuando = cuandoSalio(s);
    if (!cuando) continue;
    const k = new Date(cuando).toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
    porMes.set(k, (porMes.get(k) ?? 0) + Number(s.neto_kg));
  }
  const meses = [...porMes.entries()].slice(-8);
  const maxMes = Math.max(1, ...meses.map(([, v]) => v));

  /* Las taras en uso. Es el número que más silenciosamente puede estar
     mal: se teclea una vez en el maestro y después se copia a cada
     línea sin que nadie lo vuelva a mirar. */
  const activas = tol.filter((t) => t.activo);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA · ANÁLISIS</p>
          <h1>Cuánto vidrio salió</h1>
          <p className="sub">
            Kilos netos de lo que <b>ya salió por la puerta</b>. Las que se están pesando y las
            cédulas que todavía esperan Vh no entran: se pueden corregir, y un informe que
            cambia solo deja de creerse a la tercera vez.
            {(desde || hasta || placa || color || tolvaF) && (
              <> · Mirando <b>{vivas.length}</b> de {sal.salidas.length} salidas.</>
            )}
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">NETO DESPACHADO</div>
          <div className="num">{kilos(kg)}<span className="u">kg</span></div>
          <div className="pie">{completas.length} salida{completas.length === 1 ? "" : "s"} completas</div>
        </div>
      </section>

      {/* LOS FILTROS, DEBAJO DEL TÍTULO Y A LO ANCHO: son de toda la
          pantalla, no de una de sus cajas. Es el mismo sitio en que
          están en el control de Traspasos. */}
      <Filtros hoy={hoy} placas={placasTodas as string[]} tolvas={tolvasTodas} colores={COLORES} />

      <section className="cifras">
        <div className="cifra ojo">
          <div className="rot">TOLVAS DESPACHADAS</div>
          <div className="n">{nTolvas}</div>
          <div className="u">en esas mismas salidas</div>
        </div>
        <div className="cifra">
          <div className="rot">PROMEDIO POR TOLVA</div>
          <div className="n">{kilos(promedio)}</div>
          <div className="u">kg netos. Si una salida se sale mucho de aquí, vale la pena mirarla</div>
        </div>
        {/* «ESPERANDO VH» Y NO «ESPERANDO FIRMA»: lo que esperan desde
            que se quitó Validación es un camión, no una firma. Y no va
            en rojo: una cédula esperando su Vh es lo normal, no un
            problema — el rojo era de cuando esperaba una firma que
            alguien tenía que ir a poner. */}
        <div className="cifra">
          <div className="rot">ESPERANDO VH</div>
          <div className="n">{porSalir.length}</div>
          <div className="u">cédulas cerradas que todavía no han salido. No cuentan aquí</div>
        </div>
        <div className={"cifra" + (abiertas.length ? " ojo" : "")}>
          <div className="rot">ABIERTAS</div>
          <div className="n">{abiertas.length}</div>
          <div className="u">{kilos(abiertas.reduce((t, s) => t + Number(s.neto_kg), 0))} kg todavía pesándose</div>
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>La cuenta total</h2>
          <p>
            El neto sale de sumar las tolvas, aquí igual que en cada salida. No hay ningún total
            guardado en la base que pueda quedar desfasado de sus partes.
          </p>
        </div></div>
        <div style={{ padding: 14 }}>
          <div className="cuenta">
            <span className="caja-n"><small>BRUTO</small>{kilos(bruto)}</span>
            <span className="signo">−</span>
            <span className="caja-n tara"><small>TARA</small>{kilos(tara)}</span>
            <span className="signo">=</span>
            <span className="caja-n neto"><small>NETO KG</small>{kilos(kg)}</span>
          </div>
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>Por mes</h2>
          <p>Por el mes en que se facturó, que es cuando de verdad salió.</p>
        </div></div>
        <div className="barras">
          {meses.length === 0 && (
            <div className="vacio"><b>Sin datos</b>
            {desde || hasta || placa || color || tolvaF
              ? "Ninguna salida despachada cae en este filtro. Prueba con «Todo»."
              : "Todavía no hay vidrio despachado."}
          </div>
          )}
          {meses.map(([mes, v]) => (
            <div key={mes} className="b">
              <div className="et">{mes}</div>
              <div className="riel"><i style={{ width: `${Math.round((v / maxMes) * 100)}%` }} /></div>
              <div className="n">{kilos(v)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>Las taras en uso</h2>
          <p>
            Es el número que más silenciosamente puede estar mal: se teclea una vez y después se
            copia solo a cada línea. Si una tolva pesa distinto a la de al lado, que sea porque
            de verdad lo pesa.
          </p>
        </div></div>
        <div className="rueda">
          {activas.length === 0 && (
            <div className="vacio"><b>Sin tolvas</b>No hay ninguna activa en el maestro.</div>
          )}
          {activas.map((t) => (
            <div key={t.codigo} className="tolva">
              <div>
                <div className="nom">{t.codigo}</div>
                <div className="det">{t.modelo}</div>
              </div>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{kilos(t.tara_kg)} kg</div>
            </div>
          ))}
        </div>
      </section>

      <div className="aviso">
        <b>Estos kilos no se cuadran con las unidades de En sitio.</b> Miden cosas distintas:
        una botella de 330 y una de 750 pesan diferente, el vidrio se acumula días antes de
        salir, y parte de lo que se pesa nunca se contó en sitio. Las unidades están en{" "}
        <Link href="/roturas/en-sitio/analisis">En sitio → Análisis</Link>, aparte y a propósito.
      </div>
    </div>
  );
}
