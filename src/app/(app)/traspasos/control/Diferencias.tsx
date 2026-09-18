"use client";

/**
 * LAS DIFERENCIAS CONTRA SAP, AL PIE DEL TABLERO.
 *
 * POR QUÉ AQUÍ Y NO EN SU PROPIA PANTALLA. Tenía una, y era el error:
 * subir el corte es una acción de una vez al día, pero «¿qué salió y
 * nadie registró?» es una pregunta del tablero — se hace mirando los
 * números del día, con el turno delante. En pantalla aparte, la pregunta
 * se quedaba esperando a que alguien se acordara de ir a verla.
 *
 * TRES MONTONES Y NO UNA ESCALA. Cada uno tiene una acción distinta:
 *
 *   FALTAN   SAP lo tiene y nadie lo registró → hay que ir a registrarlo.
 *   SOBRAN   está registrado y SAP no lo tiene → casi siempre un dedazo
 *            en el número; el que falta al lado suele ser el mismo.
 *   CUADRAN  nada que hacer, salvo los del día cambiado.
 *
 * Por eso son tres botones y no tres cifras sueltas: se toca el montón
 * que se va a trabajar.
 *
 * SIN CORTE NO SE AFIRMA NADA. Un «0 faltaron» sin haber comparado
 * contra nada es peor que no decir nada: se lee como que todo cuadra.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LineaCruce, Viaje } from "@/modulos/traspasos/datos";
import { hora as horaDe, quien } from "@/modulos/traspasos/formato";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const dma = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO") : "—";

type Monton = "falta" | "sobra" | "cuadra";

export function Diferencias({ lineas, hayCorte, rotulo, desde, hasta, tope,
                              sinDocumento, nombres }: {
  lineas: LineaCruce[];
  hayCorte: boolean;
  rotulo: string;
  desde: string | null;
  hasta: string | null;
  tope: boolean;
  sinDocumento: Viaje[];
  nombres: Record<string, string>;
}) {
  const faltan = useMemo(() => lineas.filter((l) => l.estado === "falta"), [lineas]);
  const sobran = useMemo(() => lineas.filter((l) => l.estado === "sobra"), [lineas]);
  const cuadran = useMemo(() => lineas.filter((l) => l.estado === "cuadra"), [lineas]);
  const otroDia = useMemo(() => cuadran.filter((l) => l.dia_distinto), [cuadran]);

  /* SE ABRE EN EL MONTÓN QUE TENGA TRABAJO. Abrir siempre en «faltan»
     estando vacío obliga a tocar dos veces para llegar a lo que sí hay
     que revisar. */
  const [monton, setMonton] = useState<Monton>(
    faltan.length > 0 ? "falta" : sobran.length > 0 ? "sobra" : "cuadra");
  const vistas = monton === "falta" ? faltan : monton === "sobra" ? sobran : cuadran;

  /* =================================================================
     CONTROL 1 · LOS QUE SE REGISTRARON SIN DOCUMENTO

     VA PRIMERO Y NO DEPENDE DEL CORTE. Es el agujero más grande de los
     dos: un viaje sin número no aparece en NINGUNO de los tres montones
     del cruce —no tiene con qué emparejarse— así que sin este bloque
     desaparece del tablero entero. Y al documento de SAP que nadie
     registró se llega por el corte; a este no se llega por ningún lado.
     ================================================================= */
  const sinDoc = (
    <section className="caja">
      <div className="cab">
        <div>
          <h2>
            {sinDocumento.length === 0
              ? `Todos los viajes con carga llevan su documento · ${rotulo}`
              : `${sinDocumento.length} viaje${sinDocumento.length === 1 ? "" : "s"} registrado${sinDocumento.length === 1 ? "" : "s"} sin documento · ${rotulo}`}
          </h2>
          <p>
            {sinDocumento.length === 0
              ? <>Nada que completar. Los vacíos no llevan documento y no se cuentan aquí.</>
              : <>Salieron con carga y nadie apuntó el número del papel. <b>No aparecen en el
                 cruce de abajo</b> —no hay número con qué emparejarlos—, así que este es el
                 único sitio donde se ven. Se completan entrando al viaje en Registrar.</>}
          </p>
        </div>
      </div>

      {sinDocumento.length > 0 && (
        <div className="cr-marco">
          <table className="cr-tabla">
            <thead>
              <tr>
                <th>Viaje</th>
                <th>Turno</th>
                <th>Hora</th>
                <th>Placa</th>
                <th>Tipo</th>
                <th className="num">Carga</th>
                <th>Origen → destino</th>
                <th>Registró</th>
              </tr>
            </thead>
            <tbody>
              {sinDocumento.map((v) => (
                <tr key={v.id} className="ojo">
                  <td className="cr-doc">{v.codigo ?? "—"}</td>
                  <td>{v.turno}</td>
                  <td>{horaDe(v.hora)}</td>
                  <td>{v.placa ?? "—"}</td>
                  <td>{v.tipo_nombre ?? v.tipo ?? "—"}</td>
                  <td className="num">
                    {v.carga == null ? "—" : `${nf.format(v.carga)}${v.unidad ? " " + v.unidad : ""}`}
                  </td>
                  <td>{[v.origen_nombre, v.destino_nombre].filter(Boolean).join(" → ") || "—"}</td>
                  <td>{quien(nombres, v.registrado_por)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  if (!hayCorte) {
    return (
      <>
        {sinDoc}
      <section className="caja">
        <div className="cab"><div>
          <h2>Diferencias contra SAP · {rotulo}</h2>
          <p>
            {desde == null
              ? <>Todavía no se ha subido ningún corte de SAP.{" "}
                  <Link href="/traspasos/cruce">Importar el corte</Link> y esta parte se llena sola.</>
              : <>El corte que hay importado va del <b>{dma(desde)}</b> al <b>{dma(hasta)}</b>, y
                  este día no está adentro. Mientras no se importe, no se puede decir que falte
                  nada — y decir «0 faltaron» sin haber comparado sería peor.{" "}
                  <Link href="/traspasos/cruce">Importar el corte</Link>.</>}
          </p>
        </div></div>
      </section>
      </>
    );
  }

  return (
    <>
    {sinDoc}
    <section className="caja">
      <div className="cab">
        <div>
          <h2>
            {faltan.length === 0
              ? `Ningún documento sin registrar · ${rotulo}`
              : `${faltan.length} documento${faltan.length === 1 ? "" : "s"} sin registrar · ${rotulo}`}
          </h2>
          <p>
            El corte de SAP de este día contra los viajes registrados. Un documento que se
            anuló y se rehízo cuenta <b>una vez</b>; uno que se anuló y quedó en cero no
            aparece. El corte importado va del <b>{dma(desde)}</b> al <b>{dma(hasta)}</b> ·{" "}
            <Link href="/traspasos/cruce">Importar otro</Link>.
          </p>
        </div>
      </div>

      {tope && (
        <p className="cr-tope">
          <b>Se llegó al tope de documentos que esta parte trae de una.</b> Lo que ves está
          bien, pero no está todo.
        </p>
      )}

      <div className="cr-marcador">
        <button type="button" className={"cr-grupo mal" + (monton === "falta" ? " on" : "")}
                onClick={() => setMonton("falta")}>
          <span className="n">{faltan.length}</span>
          <span className="q">faltan</span>
          <span className="p">SAP los tiene y nadie los registró</span>
        </button>
        <button type="button" className={"cr-grupo ojo" + (monton === "sobra" ? " on" : "")}
                onClick={() => setMonton("sobra")}>
          <span className="n">{sobran.length}</span>
          <span className="q">sobran</span>
          <span className="p">registrados y SAP no los tiene — casi siempre un dedazo</span>
        </button>
        <button type="button" className={"cr-grupo bien" + (monton === "cuadra" ? " on" : "")}
                onClick={() => setMonton("cuadra")}>
          <span className="n">{cuadran.length}</span>
          <span className="q">cuadran</span>
          <span className="p">
            {otroDia.length > 0 ? `${otroDia.length} con el día cambiado` : "los dos los tienen"}
          </span>
        </button>
      </div>

      <p className="cr-pista">
        {monton === "falta"
          ? "SAP dice que estos documentos salieron y no hay viaje registrado con ese número."
          : monton === "sobra"
            ? "Estos viajes tienen un documento que SAP no reporta. Casi siempre es un dígito mal tecleado: el que aparece como que falta suele ser el mismo."
            : "Están en los dos lados. Los marcados llevan el día cambiado: el viaje quedó en un día y SAP lo reporta en otro, y eso descuadra el cumplido de los dos a la vez."}
      </p>

      {vistas.length === 0 ? (
        <div className="vacio"><b>Nada por aquí</b>Este montón está vacío.</div>
      ) : (
        <div className="cr-marco">
          <table className="cr-tabla">
            <thead>
              <tr>
                <th>Documento</th>
                <th>SAP</th>
                <th className="num">Mov.</th>
                <th className="num">Cantidad</th>
                <th>Material</th>
                <th>Registrado</th>
                <th>Viaje</th>
                <th>Placa</th>
              </tr>
            </thead>
            <tbody>
              {vistas.map((l) => (
                <tr key={l.documento} className={l.dia_distinto ? "ojo" : undefined}>
                  <td className="cr-doc">{l.documento}</td>
                  <td>
                    {l.sap_fecha
                      ? `${dma(l.sap_fecha)}${l.sap_hora ? " " + l.sap_hora.slice(0, 5) : ""}`
                      : "—"}
                  </td>
                  <td className="num">{l.sap_movimientos ?? "—"}</td>
                  <td className="num">{l.sap_neto == null ? "—" : nf.format(l.sap_neto)}</td>
                  <td>{l.sap_descripcion || "—"}</td>
                  <td>{l.sis_fecha ? `${dma(l.sis_fecha)} · ${l.sis_turno ?? ""}` : "—"}</td>
                  <td>{l.viaje ?? "—"}</td>
                  <td>{l.sis_placa ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
    </>
  );
}
