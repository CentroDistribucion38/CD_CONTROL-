import Link from "next/link";
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
  { renglon: "CONTEO", lado: "CONTEO", deDonde: "La BD del conteo del día (todas las ubicaciones de Bodega 38, en unidades).", estado: "ok" },
  { renglon: "DEPA L1 · L2 · L4 · L6", lado: "CONTEO", deDonde: "Corte inicial del día: lo que marca la depaletizadora de cada línea (envase en unidades y su caja plástica en cajas).", estado: "ok", nota: "Ej. L1: 3500005 330.714 u y 3500231 8.703 cajas." },
  { renglon: "PEND BAJA PRESORTING", lado: "CONTEO", deDonde: "Pasivos AG22 · causal PRESORTING.", estado: "ok" },
  { renglon: "PEND BAJA ROTURA LÍNEA", lado: "CONTEO", deDonde: "Pasivos AG22 · causal ROTURA DE LINEA.", estado: "ok" },
  { renglon: "CON BAJA EXTRASUCIO", lado: "CONTEO", deDonde: "Pasivos AG22 · causal EXTRASUCIO.", estado: "ok" },
  { renglon: "BALANCE · de AG22 a AG18", lado: "CONTEO", deDonde: "Cuadre SAP AG18 · paso 2 · lista «Pasar de AG22 a AG18», tal cual (cantidad en unidades; cajas plásticas en cajas).", estado: "ok",
    nota: "Verificado con el 14/10: 3500005 164.236 · 3500162 347.910 · 3501225 47.994 · 3500159 5.769… igual al Excel." },
  { renglon: "BAJA PENDIENTE POR DISPOSICIÓN", lado: "CONTEO", deDonde: "Plantilla de novedades (suma su caja plástica).", estado: "falta" },
  { renglon: "SINIESTRO", lado: "CONTEO", deDonde: "Plantilla de novedades (suma su caja plástica).", estado: "falta" },
  { renglon: "AJUSTE INV BAJA PRESORTING", lado: "CONTEO", deDonde: "Plantilla de novedades.", estado: "falta" },
  { renglon: "CONTEO TW", lado: "CONTEO", deDonde: "Plantilla de novedades: informativo, no entra en la diferencia.", estado: "falta" },
  { renglon: "ZEXI de las 6 a. m.", lado: "SAP", deDonde: "Plantilla de novedades, tipo ZEXI 6 AM: la ZEXI de Bodega 38 descargada a las 6, ANTES de balancear (Total General por código, en unidades; el cilindro de AG01 también).", estado: "falta",
    nota: "Si se descarga después de balancear, ya no sirve." },
  { renglon: "BALANCE · de AG18 a AG22", lado: "SAP", deDonde: "Cuadre SAP AG18 · paso 2 · lista «Pasar de AG18 a AG22», tal cual.", estado: "ok" },
  { renglon: "PEND NOVEDADES CD", lado: "SAP", deDonde: "Plantilla de novedades: una fila por entrega pendiente, con su N° de entrega (o SOCIO); suma su caja plástica.", estado: "falta" },
];
const ETQ = { ok: "Ya está en la app", falta: "Falta: plantilla", parcial: "Falta importar" } as const;

export default function AnalisisPage() {
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

      <section className="ad-caja">
        <h2>De dónde sale cada renglón</h2>
        <div className="ad-tabla-caja">
          <table className="ad-t">
            <thead><tr><th>Renglón del Excel</th><th>Suma en</th><th>De dónde lo saca la app</th><th>Estado</th></tr></thead>
            <tbody>
              {FUENTES.map((f) => (
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
        <p className="ad-nota">No entran (igual que en el Cuadre SAP): los envases nuevos 412644, 412671, 412707, los barriles y lo que saques en el toolbox de excluidos.</p>
      </section>

      <section className="ad-caja ad-plantilla">
        <div>
          <h2>Las novedades: la plantilla</h2>
          <p>La fecha viene con hoy. Una fila por novedad: el tipo, el código y la cantidad (en <b>estibas, cajas o unidades</b>, la que tengas). La plantilla
            pasa a unidades, saca sola las cajas plásticas que las guardan (la 330 guarda los de 330 y 320) y valida cada fila: debe decir <b>OK</b>.</p>
        </div>
        <a className="ad-bt" href="/plantillas/analisis-diferencia-novedades.xlsx" download>Descargar plantilla</a>
      </section>

      <p className="ad-nota">Siguiente paso: subir la plantilla y la ZEXI de las 6, y armar la tabla CONTEO vs SAP por código. Mientras tanto: <Link href="/inventario/balance/cuadre">Cuadre SAP</Link> · <Link href="/inventario/balance/pasivos">Pasivos</Link>.</p>
    </div>
  );
}
