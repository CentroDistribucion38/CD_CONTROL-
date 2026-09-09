"use client";

/**
 * SEGUIMIENTO — las tres tablas de tu hoja, cada una por separado.
 * ------------------------------------------------------------------
 * En el Excel son tres cosas encadenadas, y el orden ES el proceso:
 *
 *   1 · LO QUE LLEGÓ        pivote de ZLDE (Planta = Barranquilla,
 *                           Clase = EER) por CD de origen.
 *   2 · LO QUE SE CERTIFICÓ pivote de la Base de Datos por CD de
 *                           origen. Hoy sale de la Fuente principal.
 *   3 · EL INFORME          se calcula de las dos anteriores.
 *
 * Van en TRES pestañas, en ese orden, y no mezcladas: cada una es una
 * pregunta distinta —qué llegó, qué se certificó, cómo vamos— y cada una
 * trae sus propios filtros y sus propias cifras arriba. Apiladas en una
 * sola página serían tres pantallas de desplazamiento, y la regla de
 * este módulo es que la página no se mueva.
 *
 * EL SEMÁFORO DEL % ES EL TUYO, leído del formato condicional de la
 * hoja (W5:W15), no inventado:
 *      < 5%   rojo
 *   5% a 9%   naranja
 *      > 9%   verde
 * Antes estaba con un solo corte en la meta del 10%, y un 5,3% salía
 * rojo igual que un 0%. En tu hoja el 5,3% es naranja.
 *
 * LAS CUENTAS, verificadas contra el informe de agosto:
 *   BU MTD          = HL recibido × meta          (la meta es 10%)
 *   % Cumplimiento  = Real MTD ÷ BU MTD           (llegar al BU es 100%)
 *   % Certificación = Real MTD ÷ HL recibido      (NO contra el BU)
 * Curumani 697/3.937 = 17,7% · Turbaco 2.462/31.042 = 7,9% ·
 * total 8.359/246.268 = 3,4%. Las once filas cuadran.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type FilaSeguimiento, MESES_LARGO } from "@/modulos/sider/comun";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
/* Un decimal SIEMPRE en los porcentajes: si no, un cero sale "0%" al
   lado de un "1,4%" y la columna deja de leerse como una columna. */
const nfp = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const pctTexto = (p: number | null) => (p == null ? "—" : `${nfp.format(p * 100)}%`);

/** El semáforo de tu hoja: rojo por debajo del 5%, naranja hasta el 9%, verde arriba. */
function semaforo(p: number | null): string {
  if (p == null) return " nulo";
  if (p < 0.05) return " mal";
  if (p <= 0.09) return " medio";
  return " bien";
}
/** Cumplir es llegar al BU: el corte es el 100%, no la meta. */
const cumple = (p: number | null) => (p == null ? " nulo" : p >= 1 ? " bien" : p >= 0.5 ? " medio" : " mal");

type Vista = "llego" | "certifico" | "informe";
type Orden = { col: string; desc: boolean };

const num = (x: unknown) => Number(x ?? 0);

export function Seguimiento({ filas, mes, meses, nombreMes, esEditor }: {
  filas: FilaSeguimiento[];
  mes: string;
  meses: string[];
  nombreMes: string;
  esEditor: boolean;
}) {
  const router = useRouter();
  /* Arranca en el informe: es la pregunta que alguien viene a hacer. Las
     dos fuentes están al lado para contestar la siguiente, que siempre
     es "de dónde sale ese número". */
  const [vista, setVista] = useState<Vista>("informe");
  const [cd, setCd] = useState("");
  const [orden, setOrden] = useState<Orden>({ col: "hl_recibido", desc: true });

  const meta = filas[0]?.meta ?? 0.1;

  /* Tres grupos, y cada uno existe por una razón distinta:
     · dentro  — los CD que cuentan para el total
     · fuera   — los marcados "no aplica sider" en el maestro. No se
                 borran de la vista: un CD que desaparece sin decir por
                 qué es un CD que nadie va a volver a mirar.
     · huerfanos — nombres que vienen en ZLDE y no están en el maestro.
                 Puede ser un CD nuevo o un nombre escrito distinto, y
                 las dos cosas hay que verlas. */
  const { dentro, fuera, huerfanos } = useMemo(() => {
    const d: FilaSeguimiento[] = [], f: FilaSeguimiento[] = [], h: FilaSeguimiento[] = [];
    for (const x of filas) {
      if (x.fuera_del_maestro) h.push(x);
      else if (x.aplica_sider) d.push(x);
      else f.push(x);
    }
    return { dentro: d, fuera: f, huerfanos: h };
  }, [filas]);

  /** El filtro de CD aplica a las tres tablas: es el mismo eje. */
  const filtra = (xs: FilaSeguimiento[]) => (cd ? xs.filter((x) => x.cd_origen === cd) : xs);

  /* El orden lo elige quien mira, tocando el encabezado. En tu hoja el
     orden de los CD es el que quedó escrito a mano; aquí cada uno lo
     pone como necesite y no hay que adivinar cuál era. */
  const ordena = (xs: FilaSeguimiento[]) => {
    const k = orden.col as keyof FilaSeguimiento;
    return [...xs].sort((a, b) => {
      const va = a[k], vb = b[k];
      const cmp = typeof va === "string" || typeof vb === "string"
        ? String(va ?? "").localeCompare(String(vb ?? ""))
        : num(va) - num(vb);
      return orden.desc ? -cmp : cmp;
    });
  };

  const suma = (xs: FilaSeguimiento[], k: keyof FilaSeguimiento) =>
    xs.reduce((s, f) => s + num(f[k]), 0);

  const conCd = filtra(dentro);
  const tot = useMemo(() => {
    const recibido = suma(conCd, "hl_recibido"), bu = suma(conCd, "bu_mtd"), real = suma(conCd, "real_mtd");
    const vhRec = suma(conCd, "vh_recibidos"), vhBu = suma(conCd, "vh_bu_mtd"), vhReal = suma(conCd, "vh_real_mtd");
    return {
      recibido, bu, real, vhRec, vhBu, vhReal,
      viajes: suma(conCd, "viajes"), estibas: suma(conCd, "estibas"), lineas: suma(conCd, "lineas_zlde"),
      pctVh: vhBu > 0 ? vhReal / vhBu : null,
      pctCumpl: bu > 0 ? real / bu : null,
      pct: recibido > 0 ? real / recibido : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conCd]);

  /* Todo lo que llegó, aplique sider o no: la tabla 1 es el pivote de
     ZLDE tal cual, y en tu hoja también salen los quince. */
  const llego = ordena(filtra(filas).filter((f) => num(f.hl_recibido) > 0));
  const certifico = ordena(filtra(filas).filter((f) => num(f.real_mtd) > 0 || num(f.viajes) > 0));

  /** ZLDE cargado pero nada certificado: falta la otra mitad del informe. */
  const faltaBase = tot.recibido > 0 && tot.real === 0;

  const cabecera = (col: string, texto: string, alDerecho = true) => (
    <th className={(alDerecho ? "num " : "") + "sg-orden" + (orden.col === col ? " aqui" : "")}
        onClick={() => setOrden((o) => ({ col, desc: o.col === col ? !o.desc : true }))}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOrden((o) => ({ col, desc: o.col === col ? !o.desc : true })); }}>
      {texto}<i>{orden.col === col ? (orden.desc ? "▾" : "▴") : ""}</i>
    </th>
  );

  const cifra = (rot: string, valor: string, tono?: string) => (
    <div className={"sg-cifra" + (tono ?? "")} key={rot}>
      <span>{rot}</span>
      <b>{valor}</b>
    </div>
  );

  const cds = [...new Set(filas.map((f) => f.cd_origen))].sort();

  return (
    <>
      <div className="sg-barra">
        <label>
          <span>Mes</span>
          <select value={mes.slice(0, 7)}
                  onChange={(e) => router.push(`/sider/seguimiento?mes=${e.target.value}`)}>
            {meses.map((m) => (
              <option key={m} value={m.slice(0, 7)}>
                {MESES_LARGO[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}
              </option>
            ))}
          </select>
        </label>
        {/* "CD de origen" y no "CD": Barranquilla no está en esta lista y
            no debe estar —es el destino, ahí llega todo—. Con el rótulo
            corto la primera pregunta es siempre por qué no sale. */}
        <label>
          <span>CD de origen</span>
          <select value={cd} onChange={(e) => setCd(e.target.value)}>
            <option value="">todos los orígenes</option>
            {cds.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {/* Las tres pestañas EN EL ORDEN DEL PROCESO, numeradas: lo que
            llegó, lo que se certificó, y el informe que sale de las dos.
            El número no decora — dice que la tercera no existe sin las
            dos primeras. */}
        <div className="sg-pes" role="tablist">
          {([["llego", "1 · Llegó"], ["certifico", "2 · Certificado"], ["informe", "3 · Informe"]] as const)
            .map(([v, t]) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v}
                      className={vista === v ? "aqui" : ""} onClick={() => setVista(v)}>{t}</button>
            ))}
        </div>
        <a className="btn" href={`/api/sider/exportar?mes=${mes.slice(0, 7)}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="ic">
            <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                  fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Exportar<span className="rotulo-largo"> a Excel</span>
        </a>
      </div>

      {!!huerfanos.length && (
        <section className="m-faltan">
          <p>
            <b>{huerfanos.length} nombre{huerfanos.length > 1 ? "s" : ""} de ZLDE que no
            está{huerfanos.length > 1 ? "n" : ""} en el maestro</b>
            {" — "}o es un CD nuevo, o el nombre viene escrito distinto. Mientras no
            coincida, sus HL no entran en ningún total.{" "}
            {esEditor && <Link href="/sider/maestro">Arreglarlo en el maestro</Link>}
          </p>
          <p className="cuales">
            {huerfanos.map((h) => `${h.cd_origen} (${nf.format(num(h.hl_recibido))} HL)`).join(" · ")}
          </p>
        </section>
      )}

      {/* Sin la segunda mitad el informe es una columna de ceros, y un
          cero se lee como "no certificaron nada" cuando lo cierto es
          "todavía no lo cargaste". */}
      {faltaBase && (
        <section className="m-faltan">
          <p>
            <b>Llegó ZLDE pero no hay nada certificado en {nombreMes}</b> — el informe va a
            salir en 0% hasta que entre la otra mitad.{" "}
            {esEditor
              ? <><Link href="/sider/importar">Importa la pestaña «Base de datos»</Link> con los
                  viajes de ese mes, o certifícalos desde{" "}
                  <Link href="/sider/certificar">Certificar</Link>.</>
              : "Pídele a un supervisor que importe la base de datos del mes."}
          </p>
        </section>
      )}

      {/* ============ 1 · LO QUE LLEGÓ ============ */}
      {vista === "llego" && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>1 · Lo que llegó · {nombreMes}</h2>
              <p>
                El pivote de <b>ZLDE</b> con Planta = Barranquilla y Clase = EER, por CD de
                origen. Es la columna <b>HL EER Recibido</b> del informe, y lo único que no
                sale de la app: se{" "}
                {esEditor ? <Link href="/sider/importar">importa</Link> : "importa"} de SAP.
              </p>
            </div>
          </div>
          <div className="sg-cifras">
            {cifra("HL EER RECIBIDO", nf.format(suma(filtra(filas), "hl_recibido")))}
            {cifra("VEHÍCULOS", nf1.format(suma(filtra(filas), "vh_recibidos")))}
            {cifra("CD CON MOVIMIENTO", String(llego.length))}
            {cifra("LÍNEAS DE SAP", nf.format(suma(filtra(filas), "lineas_zlde")))}
          </div>
          <div className="marco sg-marco">
            <table className="sg-tabla">
              <thead>
                <tr>
                  {cabecera("cd_origen", "Centro de Origen", false)}
                  {cabecera("vh_recibidos", "Vehículos")}
                  {cabecera("hl_recibido", "Hectolitros")}
                  {cabecera("lineas_zlde", "Líneas de SAP")}
                </tr>
              </thead>
              <tbody>
                {llego.map((f) => (
                  <tr key={f.cd_origen}>
                    <td className={f.aplica_sider && !f.fuera_del_maestro ? undefined : "apagado"}>
                      {f.cd_origen}
                      {!f.aplica_sider && <div className="cod">no aplica sider</div>}
                      {f.fuera_del_maestro && <div className="cod">fuera del maestro</div>}
                    </td>
                    <td className="num">{nf1.format(num(f.vh_recibidos))}</td>
                    <td className="num">{nf1.format(num(f.hl_recibido))}</td>
                    <td className="num cod">{nf.format(num(f.lineas_zlde))}</td>
                  </tr>
                ))}
                {!llego.length && (
                  <tr><td className="vacio" colSpan={4}>
                    No hay ZLDE cargado de {nombreMes}.
                    {esEditor && <> <Link href="/sider/importar">Impórtalo</Link>.</>}
                  </td></tr>
                )}
              </tbody>
              {!!llego.length && (
                <tfoot>
                  <tr>
                    <td>Total general</td>
                    <td className="num">{nf1.format(suma(llego, "vh_recibidos"))}</td>
                    <td className="num">{nf1.format(suma(llego, "hl_recibido"))}</td>
                    <td className="num">{nf.format(suma(llego, "lineas_zlde"))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* ============ 2 · LO QUE SE CERTIFICÓ ============ */}
      {vista === "certifico" && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>2 · Lo que se certificó · {nombreMes}</h2>
              <p>
                Los viajes de <Link href="/sider">la Fuente principal</Link> de ese mes que no
                están anulados, por CD de origen. Es la columna <b>Real MTD</b>. Antes era la
                hoja <b>Base de Datos</b> que alguien llenaba a mano; ahora sale de lo que se
                certifica en la app y de lo que se{" "}
                {esEditor ? <Link href="/sider/importar">importa</Link> : "importa"} de esa hoja.
              </p>
            </div>
          </div>
          <div className="sg-cifras">
            {cifra("REAL MTD (HL)", nf.format(suma(filtra(filas), "real_mtd")))}
            {cifra("VIAJES", nf.format(suma(filtra(filas), "viajes")))}
            {cifra("ESTIBAS", nf1.format(suma(filtra(filas), "estibas")))}
            {cifra("VEHÍCULOS", nf1.format(suma(filtra(filas), "vh_real_mtd")))}
          </div>
          <div className="marco sg-marco">
            <table className="sg-tabla">
              <thead>
                <tr>
                  {cabecera("cd_origen", "Centro de Origen", false)}
                  {cabecera("viajes", "Viajes")}
                  {cabecera("estibas", "Estibas")}
                  {cabecera("vh_real_mtd", "Vehículos")}
                  {cabecera("real_mtd", "Hectolitros")}
                </tr>
              </thead>
              <tbody>
                {certifico.map((f) => (
                  <tr key={f.cd_origen}>
                    <td>{f.cd_origen}</td>
                    <td className="num">{nf.format(num(f.viajes))}</td>
                    <td className="num">{nf1.format(num(f.estibas))}</td>
                    <td className="num">{nf1.format(num(f.vh_real_mtd))}</td>
                    <td className="num">{nf.format(num(f.real_mtd))}</td>
                  </tr>
                ))}
                {!certifico.length && (
                  <tr><td className="vacio" colSpan={5}>
                    Nadie certificó nada en {nombreMes}.
                    {esEditor && <> <Link href="/sider/importar">Importa la base de datos</Link> o{" "}
                      <Link href="/sider/certificar">certifica un viaje</Link>.</>}
                  </td></tr>
                )}
              </tbody>
              {!!certifico.length && (
                <tfoot>
                  <tr>
                    <td>Total general</td>
                    <td className="num">{nf.format(suma(certifico, "viajes"))}</td>
                    <td className="num">{nf1.format(suma(certifico, "estibas"))}</td>
                    <td className="num">{nf1.format(suma(certifico, "vh_real_mtd"))}</td>
                    <td className="num">{nf.format(suma(certifico, "real_mtd"))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* ============ 3 · EL INFORME ============ */}
      {vista === "informe" && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>3 · Sider certificado · {nombreMes}</h2>
              <p>
                <b>BU MTD</b> = {nf.format(meta * 100)}% de lo recibido ·{" "}
                <b>% Cumpl.</b> = Real ÷ BU · <b>% Certificación</b> = Real ÷ recibido, que es
                el número del informe.
              </p>
            </div>
          </div>
          <div className="sg-cifras">
            {cifra("% CERTIFICACIÓN", pctTexto(tot.pct), semaforo(tot.pct))}
            {cifra("% CUMPLIMIENTO", pctTexto(tot.pctCumpl), cumple(tot.pctCumpl))}
            {cifra("HL EER RECIBIDO", nf.format(tot.recibido))}
            {cifra("REAL MTD", nf.format(tot.real))}
          </div>
          <div className="marco sg-marco">
            <table className="sg-tabla ancha">
              <thead>
                {/* Los dos bloques, cada uno bajo su rótulo: sin esta fila
                    son nueve columnas seguidas de números y no hay forma
                    de saber cuál BU pertenece a cuál. */}
                <tr className="sg-grupo">
                  <th className="hueco" />
                  <th className="vh" colSpan={4}>Vehículos</th>
                  <th className="hl" colSpan={5}>Hectolitros</th>
                </tr>
                <tr>
                  {cabecera("cd_origen", "Centro de Origen", false)}
                  <th className="num corta sg-orden" onClick={() => setOrden({ col: "vh_recibidos", desc: true })}>Vh Recibidos</th>
                  {cabecera("vh_bu_mtd", "BU MTD")}
                  {cabecera("vh_real_mtd", "Real MTD")}
                  {cabecera("pct_cumplimiento_vh", "% Cumpl.")}
                  <th className="num corta sg-orden" onClick={() => setOrden({ col: "hl_recibido", desc: true })}>HL EER Recibido</th>
                  {cabecera("bu_mtd", "BU MTD")}
                  {cabecera("real_mtd", "Real MTD")}
                  {cabecera("pct_cumplimiento", "% Cumpl.")}
                  {cabecera("pct_certificacion", "% Certificación")}
                </tr>
              </thead>
              <tbody>
                {ordena(conCd).map((f) => {
                  const p = f.pct_certificacion == null ? null : Number(f.pct_certificacion);
                  const pc = f.pct_cumplimiento == null ? null : Number(f.pct_cumplimiento);
                  const pv = f.pct_cumplimiento_vh == null ? null : Number(f.pct_cumplimiento_vh);
                  return (
                    <tr key={f.cd_origen}>
                      <td>{f.cd_origen}</td>
                      <td className="num corta">{nf1.format(num(f.vh_recibidos))}</td>
                      <td className="num">{nf1.format(num(f.vh_bu_mtd))}</td>
                      <td className="num">{nf1.format(num(f.vh_real_mtd))}</td>
                      <td className={"num sg-pct" + cumple(pv)}>{pctTexto(pv)}</td>
                      <td className="num corta">{nf.format(num(f.hl_recibido))}</td>
                      <td className="num">{nf.format(num(f.bu_mtd))}</td>
                      <td className="num">{nf.format(num(f.real_mtd))}</td>
                      <td className={"num sg-pct" + cumple(pc)}>{pctTexto(pc)}</td>
                      <td className={"num sg-pct" + semaforo(p)}>{pctTexto(p)}</td>
                    </tr>
                  );
                })}
                {!conCd.length && (
                  <tr><td className="vacio" colSpan={10}>Este mes no tiene nada cargado.</td></tr>
                )}
              </tbody>
              {!!conCd.length && (
                <tfoot>
                  <tr>
                    <td>Total general</td>
                    <td className="num corta">{nf1.format(tot.vhRec)}</td>
                    <td className="num">{nf1.format(tot.vhBu)}</td>
                    <td className="num">{nf1.format(tot.vhReal)}</td>
                    <td className={"num sg-pct" + cumple(tot.pctVh)}>{pctTexto(tot.pctVh)}</td>
                    <td className="num corta">{nf.format(tot.recibido)}</td>
                    <td className="num">{nf.format(tot.bu)}</td>
                    <td className="num">{nf.format(tot.real)}</td>
                    <td className={"num sg-pct" + cumple(tot.pctCumpl)}>{pctTexto(tot.pctCumpl)}</td>
                    <td className={"num sg-pct" + semaforo(tot.pct)}>{pctTexto(tot.pct)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* Plegada: son 2.218 HL de cuatro CD que nadie consulta todos
              los días, y desplegada se llevaba 61 px de tabla. Lo que no
              puede pasar es que desaparezcan sin decir por qué. */}
          {!!fuera.length && !cd && (
            <details className="sg-aparte-det">
              <summary>
                {fuera.length} CD fuera del total ·{" "}
                {nf.format(suma(fuera, "hl_recibido"))} HL marcados <b>no aplica sider</b>
              </summary>
              <p>
                {fuera.map((f) => `${f.cd_origen} (${nf.format(num(f.hl_recibido))} HL)`).join(" · ")}.
                {" "}No cuentan ni arriba ni abajo, y se muestran para que se sepa. Se cambia
                en el <Link href="/sider/maestro">maestro</Link>.
              </p>
            </details>
          )}
        </section>
      )}
    </>
  );
}
