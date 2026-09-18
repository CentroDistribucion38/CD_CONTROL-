import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { maestros, delDia } from "@/modulos/rotlinea/datos";
import { turnoDeAhora, letraDe, horarioDe } from "@/modulos/rotlinea/turnos";
import "./rotura.css";
import { Dias } from "./Dias";
import { Rejilla } from "./Rejilla";

export const dynamic = "force-dynamic";

/** El día de hoy en Colombia, no en UTC. A las 7 p.m. del martes, UTC
 *  ya dice miércoles, y el turno 3 registraría en el día equivocado. */
function hoyLocal() {
  const d = new Date(Date.now() - 5 * 3600_000);
  return d.toISOString().slice(0, 10);
}

/**
 * ROTURA DE LÍNEA — la pantalla de registrar.
 *
 * El envase que se rompe MIENTRAS SE ENVASA, máquina por máquina a lo
 * largo del tren. Vive dentro de Quiebra porque es una pérdida de
 * material como las otras, pero se mide distinto: lo que importa no es
 * el número, es el porcentaje contra la producción.
 *
 * SE REGISTRA POR TURNO Y POR ENVASE, no viaje por viaje: es una
 * báscula en el muelle y una canastilla de vidrio roto por máquina.
 */
export default async function RoturaLineaPage({ searchParams }: {
  searchParams: Promise<{ d?: string }>;
}) {
  const q = await searchParams;
  const hoy = hoyLocal();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(q.d ?? "") ? q.d! : hoy;
  const esHoy = fecha === hoy;

  const [permisos, m, dia] = await Promise.all([misPermisos(), maestros(), delDia(fecha)]);
  const puedeEditar = permisos.puedeEditar("/quiebra/rotura");
  /* El turno se calcula en el SERVIDOR. En el navegador dependería del
     reloj del equipo, y un computador de bodega con la hora corrida dos
     horas registraría en el turno de al lado sin que nadie lo note. */
  const turnoAhora = turnoDeAhora();

  if (m.falta) {
    return (
      <div className="rl">
        <section className="rl-sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Abre el SQL Editor de Supabase y ejecuta{" "}
            <code>supabase/modulos/rotura-linea.sql</code>. Ese archivo crea las tablas y
            siembra los cuatro maestros —líneas, máquinas, envases y SKU— con lo que traía la
            hoja MAESTRO del Excel. Se puede correr varias veces sin romper nada.
          </p>
          <p>
            Después, el histórico de 2026 se carga en Table Editor → <code>rotlinea_registro</code>{" "}
            → «Import data from CSV», con{" "}
            <code>supabase/datos/rotlinea_registro_2026.csv</code>.
          </p>
        </section>
      </div>
    );
  }

  /* Las cifras del día, para el panel de la derecha. Se suman aquí
     porque ya vienen las filas del día: pedirlas otra vez agrupadas
     sería preguntar dos veces lo mismo y arriesgarse a que las dos
     respuestas no coincidan. */
  const und = dia.pesadas.reduce((a, p) => a + p.und, 0);
  const kg = dia.pesadas.reduce((a, p) => a + p.kg, 0);
  const pendientes = dia.pesadas.filter((p) => !p.baja);
  const porLinea = new Map<number, number>();
  for (const p of dia.pesadas) porLinea.set(p.linea, (porLinea.get(p.linea) ?? 0) + p.und);

  return (
    <div className="rl">
      <Dias dia={fecha} hoy={hoy} esHoy={esHoy} />

      <section className="rl-cabeza">
        <div>
          <p className="rl-ojo">
            QUIEBRA · ROTURA DE LÍNEA · TURNO {letraDe(turnoAhora)} · {horarioDe(turnoAhora)}
            {!esHoy && " · OTRO DÍA"}
          </p>
          <h1>Rotura de línea</h1>
          <p className="rl-sub">
            El envase que se rompe mientras se envasa, máquina por máquina. Se pesa la
            canastilla y se digita el kilo: <b>las unidades salen solas</b>, dividiendo por el
            peso de ese envase.
          </p>
        </div>

        <div className="rl-panel">
          <div className="rl-corte" aria-hidden />
          <div className="rl-rot">{esHoy ? "ROTAS HOY" : "ROTAS ESE DÍA"}</div>
          <div className="rl-num">{und.toLocaleString("es-CO")}</div>
          <div className="rl-pie">
            unidades · <b>{kg.toFixed(0)} kg</b>
            {dia.pesadas.length > 0 &&
              ` · ${dia.pesadas.length} pesada${dia.pesadas.length === 1 ? "" : "s"}`}
          </div>
        </div>
      </section>

      <div className="rl-marco">
        <Rejilla fecha={fecha} lineas={m.lineas} maquinas={m.maquinas} envases={m.envases}
                 pesadas={dia.pesadas} firmas={dia.firmas} turnoAhora={turnoAhora}
                 puedeEditar={puedeEditar} esAdmin={permisos.rol === "admin"} />

        <aside className="rl-lado">
          <div className="rl-caja">
            <div className="rl-cab"><h2>El día, por línea</h2></div>
            {porLinea.size === 0 ? (
              <div className="rl-vacio-chico">Todavía no hay nada registrado este día.</div>
            ) : (
              m.lineas.filter((l) => porLinea.has(l.linea)).map((l) => {
                const n = porLinea.get(l.linea) ?? 0;
                const pct = und > 0 ? Math.round(n * 100 / und) : 0;
                return (
                  <div className="rl-fila-linea" key={l.linea}>
                    <span className="rl-etq">Línea {l.linea}</span>
                    <span className="rl-pista"><i style={{ width: `${pct}%` }} /></span>
                    <span className="rl-v">{n.toLocaleString("es-CO")}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* PENDIENTE DE DAR DE BAJA. En el Excel era una columna en
              blanco dentro de 24.000 renglones: no se veía. Aquí es una
              cifra en la pantalla donde se registra. */}
          <div className={"rl-caja" + (pendientes.length ? " ojo" : "")}>
            <div className="rl-cab"><h2>Sin dar de baja</h2></div>
            <div className="rl-grande">{pendientes.length}</div>
            <p className="rl-explica">
              {pendientes.length === 0
                ? "Todo lo de este día ya salió por SAP."
                : <>pesada{pendientes.length === 1 ? "" : "s"} de este día que todavía no han
                   salido por SAP. Mientras no salgan, el material sigue contando en el
                   inventario.</>}
            </p>
          </div>

          <div className="rl-caja">
            <div className="rl-cab"><h2>De dónde sale esto</h2></div>
            <p className="rl-explica">
              Reemplaza el archivo «ROTURA DE LINEA 2026.xlsx». Los cuatro maestros —líneas,
              máquinas, envases con su peso, y los SKU— salieron de su hoja MAESTRO, y el
              histórico de 2026 está cargado: 24.243 registros del 1 de enero en adelante.
              Las descripciones y los pesos se miran y se cambian en el maestro.
            </p>
            <p className="rl-explica">
              <Link href="/quiebra/rotura/maestro">Ver el maestro</Link>
              {" · "}
              <Link href="/quiebra/tablero">Volver al tablero</Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
