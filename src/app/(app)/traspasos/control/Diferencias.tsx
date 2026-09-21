"use client";

/**
 * EL RESUMEN DEL DÍA, AL PIE DEL TABLERO.
 *
 * DESDE FACTURACIÓN, «EL DOCUMENTO» ES EL QUE PONE FACTURACIÓN al
 * confirmar la salida: es el que SAP trae. La orden de cargue es el papel
 * del patio y no se cruza. Por eso los montones dicen «facturados» y
 * «por facturar», y lo que falta se completa en Facturación.
 *
 * QUÉ CONTESTA, EN UNA FRASE: de lo que se movió ese día, ¿qué quedó
 * bien anotado y qué no? La frase de arriba lo dice con palabras —«ese
 * día se registraron 16 traspasos: 7 con documento y 9 sin»— y debajo
 * están los montones, cada uno con su lista y su acción.
 *
 * POR QUÉ AQUÍ Y NO EN SU PROPIA PANTALLA. Tenía una, y era el error:
 * subir el corte es una acción de una vez al día, pero «¿qué salió y
 * nadie registró?» es una pregunta del tablero — se hace mirando los
 * números del día, con el turno delante. En pantalla aparte, la pregunta
 * se quedaba esperando a que alguien se acordara de ir a verla.
 *
 * ----------------------------------------------------------------------
 * POR QUÉ MONTONES Y NO UNA TABLA LARGA
 *
 * Cada montón tiene una acción distinta, y es lo único que los separa:
 *
 *   CON DOCUMENTO Y EN SAP   nada que hacer.
 *   CON DOCUMENTO Y SIN SAP  el número no aparece en el corte — casi
 *                            siempre un dedazo, y el documento que
 *                            «falta» abajo suele ser el mismo.
 *   SIN DOCUMENTO            salió con carga y nadie apuntó el papel.
 *                            Se completa entrando al viaje.
 *   EN SAP Y SIN REGISTRAR   SAP lo tiene y no hay viaje. Hay que
 *                            registrarlo.
 *
 * SE ABREN Y SE CIERRAN, y solo uno está abierto al entrar: el que tenga
 * trabajo. Con los cuatro desplegados la pantalla son cuatrocientas filas
 * y la frase de arriba —que es la respuesta— queda a seis pantallazos.
 *
 * EL COLOR DICE GRAVEDAD, NO IDENTIDAD. Verde lo que está bien, rojo lo
 * que SAP tiene y nadie registró, y el acento del módulo los dos del
 * medio: son la misma gravedad —algo que completar— y el rótulo dice
 * cuál es cuál. Inventarle un cuarto color a un montón obligaría a un
 * tono que en tres de los siete temas se colapsa contra el rojo.
 *
 * SIN CORTE NO SE AFIRMA NADA. Un «0 faltaron» sin haber comparado
 * contra nada es peor que no decir nada: se lee como que todo cuadra.
 * Sin corte importado, los dos montones que dependen de él no se pintan
 * y los que no dependen —con documento, sin documento— sí.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LineaCruce, Viaje } from "@/modulos/traspasos/datos";
import { hora as horaDe, quien } from "@/modulos/traspasos/formato";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const dma = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO") : "—";
/* EL NÚMERO CON QUE SE CRUZA: el de facturación, limpio como lo limpia
   la base —sin guiones ni espacios—, que es como viene en el cruce. */
const clave = (v: Viaje) => (v.factura_documento ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const ruta = (v: Viaje) =>
  [v.origen_nombre, v.destino_nombre].filter(Boolean).join(" → ") || "—";

/** El nombre del montón que está abierto, o null si están todos cerrados. */
type Abierto = "ok" | "dedazo" | "sindoc" | "falta" | null;

export function Diferencias({ lineas, hayCorte, rotulo, desde, hasta, tope,
                              sinDocumento, conDocumento, nombres }: {
  lineas: LineaCruce[];
  hayCorte: boolean;
  rotulo: string;
  desde: string | null;
  hasta: string | null;
  tope: boolean;
  sinDocumento: Viaje[];
  conDocumento: Viaje[];
  nombres: Record<string, string>;
}) {
  const faltan = useMemo(() => lineas.filter((l) => l.estado === "falta"), [lineas]);

  /* LOS DOS MONTONES DE «CON DOCUMENTO» SALEN DEL CRUCE, no de una
     segunda consulta: el documento del viaje se busca en el corte y con
     eso se sabe de cuál de los dos es. Preguntarlo aparte sería tener
     dos respuestas a la misma pregunta esperando a discrepar. */
  const enSap = useMemo(() => {
    const s = new Set<string>();
    for (const l of lineas) if (l.estado === "cuadra" && l.documento) s.add(l.documento);
    return s;
  }, [lineas]);

  /* EL DÍA CAMBIADO NO SE PIERDE. El viaje quedó en un día y SAP lo
     reporta en otro: cuadran por número, pero descuadran el cumplido de
     los DOS días a la vez. Antes se veía porque «cuadran» era una lista
     de documentos; ahora que la lista es de viajes, la marca viaja en
     un conjunto para no perder el aviso al cambiar de lado. */
  const otroDia = useMemo(() => {
    const s = new Set<string>();
    for (const l of lineas) if (l.dia_distinto && l.documento) s.add(l.documento);
    return s;
  }, [lineas]);

  const cuadran = useMemo(
    () => (hayCorte ? conDocumento.filter((v) => enSap.has(clave(v))) : conDocumento),
    [conDocumento, enSap, hayCorte]);
  const dedazos = useMemo(
    () => (hayCorte ? conDocumento.filter((v) => !enSap.has(clave(v))) : []),
    [conDocumento, enSap, hayCorte]);

  /* CUÁNTOS SE REGISTRARON ESE DÍA. Es el denominador de la frase de
     arriba: «9 sin documento» no dice nada sin decir sobre cuántos. */
  const registrados = conDocumento.length + sinDocumento.length;
  const pct = (n: number) =>
    registrados === 0 ? "" : `${Math.round((n / registrados) * 100)} %`;

  /* SE ABRE EL QUE TENGA TRABAJO, uno solo. En orden de urgencia: lo que
     SAP tiene y nadie registró es lo que se pierde del inventario; lo
     que salió sin papel se completa; el dedazo se corrige. */
  const [abierto, setAbierto] = useState<Abierto>(
    faltan.length > 0 ? "falta"
      : sinDocumento.length > 0 ? "sindoc"
        : dedazos.length > 0 ? "dedazo" : null);
  const alterna = (cual: Exclude<Abierto, null>) =>
    setAbierto((x) => (x === cual ? null : cual));

  /* ------------------------------------------------------------------
     UN MONTÓN. La tapa con su cifra, y el cuerpo solo si está abierto.
     ------------------------------------------------------------------ */
  function Monton({ cual, tono, n, titulo, pie, nota, hijos }: {
    cual: Exclude<Abierto, null>;
    tono: "bien" | "ojo" | "mal";
    n: number;
    titulo: string;
    pie: string;
    nota: React.ReactNode;
    hijos: React.ReactNode;
  }) {
    const on = abierto === cual;
    return (
      <div className={`tp-rz-monton ${tono}` + (on ? " on" : "")}>
        <button type="button" className="tp-rz-tapa" aria-expanded={on}
                onClick={() => alterna(cual)}>
          <span className="n">{nf.format(n)}</span>
          <span className="tx"><b>{titulo}</b><span>{pie}</span></span>
          <span className="pct">{pct(n)}</span>
          {/* LA FLECHA NO ES SOLO ADORNO: es lo único que dice que la
              tapa se abre. Sin ella, cuatro cifras grandes se leen como
              cuatro cifras y nadie las toca. */}
          <span className="fl" aria-hidden="true">{on ? "▴" : "▾"}</span>
        </button>
        {on && (
          <div className="tp-rz-cuerpo">
            <p className="tp-rz-nota">{nota}</p>
            {n === 0
              ? <div className="vacio"><b>Nada por aquí</b>Este montón está vacío.</div>
              : hijos}
          </div>
        )}
      </div>
    );
  }

  /* LA TABLA DE VIAJES, la misma para los tres montones que los
     enseñan: el que la mira compara filas entre montones, y tres
     columnas distintas en cada uno obligarían a releer la cabecera. */
  const tablaViajes = (vs: Viaje[], conDoc: boolean) => (
    <div className="cr-marco">
      <table className="cr-tabla">
        <thead>
          <tr>
            <th>Viaje</th>
            {conDoc && <th>Documento</th>}
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
          {vs.map((v) => (
            <tr key={v.id} className={otroDia.has(clave(v)) ? "ojo" : undefined}>
              <td className="cr-doc">{v.codigo ?? "—"}</td>
              {conDoc && (
                <td>
                  {v.factura_documento ?? "—"}
                  {otroDia.has(clave(v)) && (
                    <em className="tp-rz-marca">SAP lo reporta en otro día</em>
                  )}
                </td>
              )}
              <td>{v.turno}</td>
              <td>{horaDe(v.hora)}</td>
              <td>{v.placa ?? "—"}</td>
              <td>{v.tipo_nombre ?? v.tipo ?? "—"}</td>
              <td className="num">
                {v.carga == null ? "—" : `${nf.format(v.carga)}${v.unidad ? " " + v.unidad : ""}`}
              </td>
              <td className="cr-ruta">{ruta(v)}</td>
              <td>{quien(nombres, v.registrado_por)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="caja tp-rz">
      <p className="tp-rz-ojo">TRASPASOS · {rotulo.toUpperCase()}</p>

      {/* LA RESPUESTA, EN UNA FRASE Y EN GRANDE. Lo que estaba arriba
          era un título —«Diferencias contra SAP»— que nombra la
          pantalla y no contesta nada. Quien entra no quiere saber cómo
          se llama esto: quiere saber cómo quedó el día. */}
      <h2 className="tp-rz-frase">
        {registrados === 0 ? (
          <>Ese día <em>no se registró</em> ningún traspaso.</>
        ) : (
          <>
            Ese día se registraron <em>{nf.format(registrados)} traspaso
            {registrados === 1 ? "" : "s"}</em>:{" "}
            {nf.format(conDocumento.length)} facturado{conDocumento.length === 1 ? "" : "s"} y{" "}
            {sinDocumento.length === 0
              ? <>ninguno por facturar.</>
              : <><span className="mal">{nf.format(sinDocumento.length)} por facturar</span>.</>}
          </>
        )}
      </h2>

      <p className="tp-rz-sub">
        {!hayCorte ? (
          desde == null
            ? <>Todavía no se ha subido ningún corte de SAP, así que de este día no se puede
                decir qué salió y nadie facturó.{" "}
                <Link href="/traspasos/cruce">Importar el corte</Link>.</>
            : <>El corte importado va del <b>{dma(desde)}</b> al <b>{dma(hasta)}</b>, y este día
                no está adentro: mientras no se importe no se puede decir que falte nada.{" "}
                <Link href="/traspasos/cruce">Importar el corte</Link>.</>
        ) : faltan.length === 0 ? (
          <>Y en el corte de SAP no quedó ningún documento sin facturar. El corte va del{" "}
            <b>{dma(desde)}</b> al <b>{dma(hasta)}</b> ·{" "}
            <Link href="/traspasos/cruce">Importar otro</Link>.</>
        ) : (
          <>Y en el corte de SAP hay <b>{nf.format(faltan.length)} documento
            {faltan.length === 1 ? "" : "s"}</b> que salieron y nadie facturó. El corte va del{" "}
            <b>{dma(desde)}</b> al <b>{dma(hasta)}</b> ·{" "}
            <Link href="/traspasos/cruce">Importar otro</Link>.</>
        )}
      </p>

      {/* LA BARRA ES LA FRASE, DIBUJADA. Mide lo mismo que la frase
          cuenta —con papel contra sin papel— y no lo del corte: mezclar
          en una sola barra lo que la gente registró con lo que SAP
          reporta sumaría dos cosas que no son partes de un mismo todo. */}
      {registrados > 0 && (
        <>
          <div className="tp-rz-barra" role="img"
               aria-label={`${conDocumento.length} facturados y ${sinDocumento.length} por facturar`}>
            <i className="bien" style={{ width: `${(conDocumento.length / registrados) * 100}%` }} />
            <i className="ojo" style={{ width: `${(sinDocumento.length / registrados) * 100}%` }} />
          </div>
          <p className="tp-rz-leg">
            <span><i className="bien" /> {nf.format(conDocumento.length)} facturados</span>
            <span><i className="ojo" /> {nf.format(sinDocumento.length)} por facturar</span>
          </p>
        </>
      )}

      {tope && (
        <p className="cr-tope">
          <b>Se llegó al tope de documentos que esta parte trae de una.</b> Lo que ves está
          bien, pero no está todo.
        </p>
      )}

      <div className="tp-rz-lista">
        {/* 1 · LO QUE QUEDÓ BIEN. Va primero aunque no haya nada que
            hacer con él: es el denominador de todo lo demás. */}
        <Monton
          cual="ok" tono="bien" n={cuadran.length}
          titulo={hayCorte ? "Facturados y en SAP" : "Facturados"}
          pie={hayCorte
            ? "Facturación puso el número y el corte lo confirma"
            : "Facturación puso el número y confirmó la salida"}
          nota={hayCorte
            ? (otroDia.size > 0
                ? <>Cuadran contra el corte de SAP. Los <b>{nf.format(otroDia.size)}</b> marcados
                    llevan el día cambiado: el viaje quedó en un día y SAP lo reporta en otro, y
                    eso descuadra el cumplido de los dos a la vez.</>
                : <>Cuadran contra el corte de SAP. Nada que hacer con estos.</>)
            : <>Sin corte importado no se puede decir si SAP los tiene. Llevan su número de
                facturación, que es lo que esta pantalla vigila.</>}
          hijos={tablaViajes(cuadran, true)} />

        {/* 2 · EL DEDAZO. Solo existe habiendo corte: sin él, «SAP no lo
            tiene» no se puede afirmar. */}
        {hayCorte && (
          <Monton
            cual="dedazo" tono="ojo" n={dedazos.length}
            titulo="Facturados con un número que SAP no tiene"
            pie="Facturación puso el número, pero no aparece en el corte"
            nota={<>Casi siempre es un dígito mal tecleado: el documento que aparece
                   abajo como <b>sin facturar</b> suele ser este mismo con una cifra
                   cambiada. Lo corrige el administrador: reabre la salida en{" "}
                   <Link href="/traspasos/facturacion">Facturación</Link> y se confirma con el número bueno.</>}
            hijos={tablaViajes(dedazos, true)} />
        )}

        {/* 3 · SIN DOCUMENTO. NO DEPENDE DEL CORTE, y ese es el punto:
            un viaje sin número no aparece en NINGÚN montón del cruce
            —no tiene con qué emparejarse— así que sin este bloque
            desaparece del tablero entero. */}
        <Monton
          cual="sindoc" tono="ojo" n={sinDocumento.length}
          titulo="Por facturar"
          pie="Salieron con carga y facturación no ha puesto el número"
          nota={<>No aparecen en el corte de SAP: sin el número de facturación no hay con qué
                 emparejarlos, así que este es el único sitio donde se ven. Los vacíos no
                 llevan documento y no se cuentan aquí. Se completan en{" "}
                 <Link href="/traspasos/facturacion">Facturación</Link>.</>}
          hijos={tablaViajes(sinDocumento, false)} />

        {/* 4 · LO QUE SAP TIENE Y NADIE REGISTRÓ. */}
        {hayCorte && (
          <Monton
            cual="falta" tono="mal" n={faltan.length}
            titulo="En SAP y sin facturar"
            pie="SAP los tiene y ningún viaje salió con ese número en CONTROL"
            nota={<>Un documento que se anuló y se rehízo cuenta <b>una vez</b>; uno que se
                   anuló y quedó en cero no aparece.</>}
            hijos={
              <div className="cr-marco">
                <table className="cr-tabla">
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>SAP</th>
                      <th className="num">Mov.</th>
                      <th className="num">Cantidad</th>
                      <th>Material</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faltan.map((l) => (
                      <tr key={l.documento}>
                        <td className="cr-doc">{l.documento}</td>
                        <td>
                          {l.sap_fecha
                            ? `${dma(l.sap_fecha)}${l.sap_hora ? " " + l.sap_hora.slice(0, 5) : ""}`
                            : "—"}
                        </td>
                        <td className="num">{l.sap_movimientos ?? "—"}</td>
                        <td className="num">{l.sap_neto == null ? "—" : nf.format(l.sap_neto)}</td>
                        <td className="cr-ruta">{l.sap_descripcion || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            } />
        )}
      </div>
    </section>
  );
}
