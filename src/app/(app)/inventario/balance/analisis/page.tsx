import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { armarAnalisis } from "@/modulos/inventario/analisis-dif";
import { leerAjustes, leerHistorico, leerPrecios } from "@/modulos/inventario/analisis-ajustes";
import { Analisis } from "./Analisis";
import { Ajustes } from "./Ajustes";
import { Historico } from "./Historico";
import { Final } from "./Final";
import { Valor } from "./Valor";
import { Recurrencia } from "./Recurrencia";
import { ContraAyer } from "./ContraAyer";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "./analisis.css";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · ANÁLISIS DE DIFERENCIA — la hoja «CONTEOS» de 2026.10.14_BODEGA_38.xlsx hecha pantalla.
 *
 * El Excel arma la existencia de Bodega 38 en dos lados y los compara por código (en unidades):
 *   · lado CONTEO = lo contado + lo que existe pero no se ve en el conteo (depa, pasivos, balance, novedades);
 *   · lado SAP    = la ZEXI de las 6 a. m. + lo que SAP todavía no tiene (entregas pendientes, balance que entra).
 * DIFERENCIA = CONTEO − SAP.
 *
 * PRIMER PASO: el mapa de dónde sale cada renglón (qué ya está en la app y qué falta importar) y la plantilla
 * de las novedades. La cuenta se arma en el siguiente paso.
 */
type Fuente = { renglon: string; lado: "CONTEO" | "SAP"; deDonde: string; estado: "ok" | "falta" | "parcial"; nota?: string };

const FUENTES: Fuente[] = [
  { renglon: "CONTEO", lado: "CONTEO", deDonde: "La BD del conteo del día (todas las ubicaciones de Bodega 38, en unidades). La caja plástica en la que va el producto contado también suma como caja.", estado: "ok" },
  { renglon: "DEPA L1 · L2 · L4 · L6", lado: "CONTEO", deDonde: "Corte inicial del día: lo que marca la depaletizadora de cada línea (envase en unidades y su caja plástica en cajas).", estado: "ok", nota: "Ej. L1: 3500005 330.714 u y 3500231 8.703 cajas. Si no hay corte inicial ese día, se sube en la plantilla con el tipo DEPA L1, DEPA L2, DEPA L4 o DEPA L6 (la caja plástica sale sola del envase); si la línea sí viene del corte, la plantilla no se cuenta." },
  { renglon: "PEND BAJA PRESORTING", lado: "CONTEO", deDonde: "Pasivos AG22 · causal PRESORTING.", estado: "ok" },
  { renglon: "PEND BAJA ROTURA LÍNEA", lado: "CONTEO", deDonde: "Pasivos AG22 · causal ROTURA DE LINEA.", estado: "ok" },
  { renglon: "CON BAJA EXTRASUCIO", lado: "CONTEO", deDonde: "Pasivos AG22 · causal EXTRASUCIO.", estado: "ok" },
  { renglon: "BALANCE · de AG22 a AG18 · AG17 · AG16", lado: "CONTEO", deDonde: "Cuadre SAP de AG18, AG17 y AG16 · paso 2 · lista «Pasar de AG22 a …», tal cual (cantidad en unidades; cajas plásticas en cajas). Cada almacén sale como su propia partida.", estado: "ok",
    nota: "Verificado con el 14/10: 3500005 164.236 · 3500162 347.910 · 3501225 47.994 · 3500159 5.769… igual al Excel." },
  { renglon: "BAJA PENDIENTE POR DISPOSICIÓN", lado: "CONTEO", deDonde: "Plantilla de novedades (suma su caja plástica).", estado: "falta" },
  { renglon: "SINIESTRO", lado: "CONTEO", deDonde: "Plantilla de novedades (suma su caja plástica).", estado: "falta" },
  { renglon: "AJUSTE INV BAJA PRESORTING", lado: "CONTEO", deDonde: "Plantilla de novedades.", estado: "falta" },
  { renglon: "CONTEO TW", lado: "CONTEO", deDonde: "Plantilla de novedades: informativo, no entra en la diferencia.", estado: "falta" },
  { renglon: "ZEXI de las 6 a. m.", lado: "SAP", deDonde: "Plantilla de novedades, tipo ZEXI 6 AM: la ZEXI de Bodega 38 descargada a las 6, ANTES de balancear (Total General por código, en unidades; el cilindro de AG01 también).", estado: "falta",
    nota: "Si se descarga después de balancear, ya no sirve." },
  { renglon: "BALANCE · de AG18 · AG17 · AG16 a AG22", lado: "SAP", deDonde: "Cuadre SAP de AG18, AG17 y AG16 · paso 2 · lista «Pasar de … a AG22», tal cual. El Cuadre de AG22 no se suma: es el otro lado del 311 y sus pasivos ya entran arriba.", estado: "ok",
    nota: "Si la ZEXI de las 6 a. m. no está en la plantilla, el lado SAP solo trae este Balance." },
  { renglon: "PEND NOVEDADES CD", lado: "SAP", deDonde: "Plantilla de novedades: una fila por entrega pendiente, con su N° de entrega (o SOCIO); suma su caja plástica.", estado: "falta" },
];
const ETQ = { ok: "Ya está en la app", falta: "Falta: plantilla", parcial: "Falta importar" } as const;

export default async function AnalisisPage({ searchParams }: { searchParams: Promise<{ fecha?: string; paso?: string }> }) {
  const q = await searchParams;
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : hoy;
  const PASOS = ["ajustes", "final", "historico", "valor", "recurrencia", "ayer"] as const;
  const paso = (PASOS as readonly string[]).includes(q.paso ?? "") ? (q.paso as (typeof PASOS)[number]) : "analisis";
  const permisos = await misPermisos();
  const puedeEditar = permisos.puedeEditar("/inventario/balance/analisis");
  /* LOS DOS PASOS: 1 el análisis (se arma en vivo) → «Guardar» → 2 los ajustes (salen de lo guardado). */
  const pasos = (
    <nav className="ad-pasos" aria-label="Pasos">
      <Link href={`/inventario/balance/analisis?fecha=${fecha}`} className={paso === "analisis" ? "on" : ""}><b>1</b> Análisis</Link>
      <Link href={`/inventario/balance/analisis?fecha=${fecha}&paso=ajustes`} className={paso === "ajustes" ? "on" : ""}><b>2</b> Ajustes</Link>
      <Link href={`/inventario/balance/analisis?fecha=${fecha}&paso=final`} className={paso === "final" ? "on" : ""}><b>3</b> Análisis final</Link>
      <Link href={`/inventario/balance/analisis?fecha=${fecha}&paso=historico`} className={paso === "historico" ? "on" : ""}><b>4</b> Histórico</Link>
      <Link href={`/inventario/balance/analisis?fecha=${fecha}&paso=valor`} className={paso === "valor" ? "on" : ""}><b>$</b> Valor</Link>
      <Link href={`/inventario/balance/analisis?fecha=${fecha}&paso=recurrencia`} className={paso === "recurrencia" ? "on" : ""}><b>↻</b> Recurrencia</Link>
      <Link href={`/inventario/balance/analisis?fecha=${fecha}&paso=ayer`} className={paso === "ayer" ? "on" : ""}><b>⇄</b> Contra ayer</Link>
    </nav>
  );
  if (paso === "final") {
    const aj = await leerAjustes(fecha);
    return (
      <div className="fe bal ad">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · BALANCE · ANÁLISIS DE DIFERENCIA</p>
          <h1>Análisis final</h1>
          <p className="sub">Cómo queda SAP con los ajustes realizados: SAP inicial + compensación hecha + ajuste hecho = SAP final, contra el mismo conteo. Lo que siga con diferencia es lo que falta.</p>
        </div></section>
        {pasos}
        <Final fecha={fecha} guardado={aj.guardado} ajustes={aj.filas} final={aj.final} puedeEditar={puedeEditar}
               faltaSql={aj.faltaSql ? "Falta correr supabase/migraciones/2026-10-analisis-diferencia-ajustes.sql en Supabase." : aj.faltaSqlFinal ? "Falta correr supabase/migraciones/2026-10-analisis-diferencia-final.sql en Supabase." : null} />
      </div>
    );
  }
  /* LAS HOJAS APARTE: valor en pesos, recurrencia y contra ayer. No cambian nada de los pasos 1 a 4. */
  const cabeza = (titulo: string, sub: string) => (
    <section className="cabeza"><div>
      <p className="ojo">INVENTARIO · BALANCE · ANÁLISIS DE DIFERENCIA</p>
      <h1>{titulo}</h1>
      <p className="sub">{sub}</p>
    </div></section>
  );
  if (paso === "valor") {
    const [aj, precios] = await Promise.all([leerAjustes(fecha), leerPrecios()]);
    return (
      <div className="fe bal ad">
        {cabeza("Valor en pesos", "Cada diferencia y cada ajuste con su valor: cuánta plata hay en juego, no solo unidades.")}
        {pasos}
        {aj.faltaSql ? <p className="ad-msg mal">Falta correr supabase/migraciones/2026-10-analisis-diferencia-ajustes.sql en Supabase.</p>
          : <Valor fecha={fecha} guardado={aj.guardado} ajustes={aj.filas} precios={precios} />}
      </div>
    );
  }
  if (paso === "recurrencia" || paso === "ayer") {
    const h = await leerHistorico();
    return (
      <div className="fe bal ad">
        {paso === "recurrencia"
          ? cabeza("Recurrencia", "Qué códigos se repiten día tras día en el rango que escojas: el error de un día contra el problema de fondo.")
          : cabeza("Contra ayer", "El día guardado contra el anterior: qué empeoró, qué mejoró, qué apareció y qué se cerró.")}
        {pasos}
        {h.faltaSql ? <p className="ad-msg mal">Falta correr supabase/migraciones/2026-10-analisis-diferencia-ajustes.sql en Supabase.</p>
          : paso === "recurrencia" ? <Recurrencia dias={h.dias} detalle={h.detalle} /> : <ContraAyer fecha={fecha} dias={h.dias} detalle={h.detalle} />}
      </div>
    );
  }
  if (paso === "historico") {
    const h = await leerHistorico();
    return (
      <div className="fe bal ad">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · BALANCE · ANÁLISIS DE DIFERENCIA</p>
          <h1>Histórico</h1>
          <p className="sub">Los días que se han guardado, con lo que se compensó y lo que quedó por ajustar. Abre cualquiera o baja todo en Excel.</p>
        </div></section>
        {pasos}
        <Historico dias={h.dias} detalle={h.detalle} faltaSql={h.faltaSql} />
      </div>
    );
  }
  if (paso === "ajustes") {
    const aj = await leerAjustes(fecha);
    return (
      <div className="fe bal ad">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · BALANCE · ANÁLISIS DE DIFERENCIA</p>
          <h1>Ajustes</h1>
          <p className="sub">
            Del análisis guardado: lo que se <b>compensa</b> entre el envase retornable y su NR nuevo, y lo que queda por
            <b> ajustar</b> en SAP, sobrante o faltante, con la observación de cada código.
          </p>
        </div></section>
        {pasos}
        <Ajustes fecha={fecha} guardado={aj.guardado} filas={aj.filas} puedeEditar={puedeEditar} faltaSql={aj.faltaSql} finalEn={aj.final?.en ?? null} />
      </div>
    );
  }
  const [datos, guardado] = await Promise.all([armarAnalisis(fecha), leerAjustes(fecha)]);
  return (
    <div className="fe bal ad">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · BALANCE · ANÁLISIS DE DIFERENCIA</p>
        <h1>Análisis de diferencia</h1>
        <p className="sub">
          La hoja que abarca todo: la existencia de Bodega 38 armada en dos lados, <b>CONTEO</b> y <b>SAP</b>, por código y en unidades.
          Diferencia = CONTEO − SAP. Así lo arma hoy <i>2026.10.14_BODEGA_38.xlsx</i> (hoja CONTEOS).
        </p>
      </div></section>

      {pasos}
      <Analisis datos={datos} hoy={hoy} puedeEditar={puedeEditar} guardadoEn={guardado.guardado?.guardado_en ?? null}
                guardadoPor={guardado.guardado?.guardado_por ?? null}
                obs={Object.fromEntries(guardado.filas.filter((f) => f.observacion).map((f) => [f.codigo, f.observacion]))} />

      {/* «Solo muéstrame lo que falta, porque hasta puedo poner más partidas.» Lo que ya trae la app va en una línea. */}
      <details className="ad-que">
      <summary>Qué trae la app y qué va en la plantilla</summary>
      <p className="ad-ya"><b>Esto lo trae la app sola:</b> {FUENTES.filter((f) => f.estado === "ok").map((f) => f.renglon).join(" · ")}.</p>

      <section className="ad-caja">
        <h2>Lo que falta: va en la plantilla</h2>
        <div className="ad-tabla-caja">
          <table className="ad-t">
            <thead><tr><th>Renglón del Excel</th><th>Suma en</th><th>De dónde lo saca la app</th><th>Estado</th></tr></thead>
            <tbody>
              {FUENTES.filter((f) => f.estado !== "ok").map((f) => (
                <tr key={f.renglon}>
                  <td><b>{f.renglon}</b></td>
                  <td><span className={"ad-lado " + (f.lado === "SAP" ? "sap" : "con")}>{f.lado}</span></td>
                  <td>{f.deDonde}{f.nota && <small>{f.nota}</small>}</td>
                  <td><span className={"ad-est " + f.estado}>{ETQ[f.estado]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ad-nota"><b>¿Otra partida?</b> Agrégala en la hoja TIPOS de la plantilla (nombre, en qué lado suma, si pide N° de entrega y si suma su caja plástica): sale sola en la lista.</p>
        <p className="ad-nota">No entran (igual que en el Cuadre SAP): los envases nuevos 412644, 412671, 412707, los barriles y lo que saques en el toolbox de excluidos.</p>
      </section>

      </details>

      <p className="ad-nota">Las partidas automáticas salen de: <Link href="/inventario/balance/cuadre">Cuadre SAP</Link> · <Link href="/inventario/balance/pasivos">Pasivos</Link> · <Link href="/inventario/corte">Cortes</Link>.</p>    </div>
  );
}
