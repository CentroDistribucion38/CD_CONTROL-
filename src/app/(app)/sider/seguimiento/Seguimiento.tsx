"use client";

/**
 * SEGUIMIENTO — las tres tablas de la hoja "Seguimiento".
 *
 * En el Excel eran tres cosas separadas: un pivote de ZLDE, un pivote de
 * la hoja "Base de Datos", y a mano una tabla que restaba las dos. Aquí
 * el informe es la tabla principal —es la pregunta que alguien viene a
 * hacer— y las dos fuentes van debajo, para poder contestar la siguiente
 * pregunta, que siempre es "de dónde sale ese número".
 *
 * LAS CUENTAS, verificadas contra el informe de agosto:
 *   BU MTD          = HL recibido × meta          (la meta es 10%)
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

const pctTexto = (p: number | null) =>
  p == null ? "—" : `${nfp.format(p * 100)}%`;

/* Verde o rojo según su propio umbral: el de certificación es la meta
   (10%), el de cumplimiento es el 100% —cumplir es llegar al BU—. Con un
   solo umbral para los dos, la columna de cumplimiento salía verde con
   un 11%. */
const clase = (p: number | null, umbral: number) =>
  p == null ? " nulo" : p >= umbral ? " bien" : " mal";

export function Seguimiento({ filas, mes, meses, nombreMes, esEditor }: {
  filas: FilaSeguimiento[];
  mes: string;
  meses: string[];
  nombreMes: string;
  esEditor: boolean;
}) {
  const router = useRouter();
  /* PESTAÑAS y no un "ver más" que apila. Con las tres tablas una debajo
     de otra la página medía 1.2 pantallas de más en el celular y media en
     el PC —medido—, y la regla de este módulo es que la página no se
     desplace. Además son dos preguntas distintas: "cómo vamos" y "de
     dónde sale ese número". Cada una en su vista. */
  const [vista, setVista] = useState<"informe" | "fuentes">("informe");

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

  const tot = useMemo(() => {
    const su = (k: keyof FilaSeguimiento) => dentro.reduce((s, f) => s + Number(f[k] ?? 0), 0);
    const recibido = su("hl_recibido"), bu = su("bu_mtd"), real = su("real_mtd");
    const vhRec = su("vh_recibidos"), vhBu = su("vh_bu_mtd"), vhReal = su("vh_real_mtd");
    return {
      recibido, bu, real, viajes: su("viajes"), vhRec, vhBu, vhReal,
      pctVh: vhBu > 0 ? vhReal / vhBu : null,
      pctCumpl: bu > 0 ? real / bu : null,
      pct: recibido > 0 ? real / recibido : null,
    };
  }, [dentro]);

  /* Para la tabla de "lo que se certificó": solo los que certificaron
     algo. Una lista de quince ceros no es una fuente, es ruido. */
  const certificaron = useMemo(
    () => filas.filter((f) => Number(f.real_mtd) > 0)
               .sort((a, b) => Number(b.real_mtd) - Number(a.real_mtd)),
    [filas]
  );
  const conRecibido = useMemo(
    () => filas.filter((f) => Number(f.hl_recibido) > 0)
               .sort((a, b) => Number(b.hl_recibido) - Number(a.hl_recibido)),
    [filas]
  );

  return (
    <>
      <div className="sg-barra">
        <label>
          <span>Mes</span>
          <select
            value={mes.slice(0, 7)}
            onChange={(e) => router.push(`/sider/seguimiento?mes=${e.target.value}`)}
          >
            {meses.map((m) => (
              <option key={m} value={m.slice(0, 7)}>
                {MESES_LARGO[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}
              </option>
            ))}
          </select>
        </label>
        <div className="sg-pes" role="tablist">
          <button type="button" role="tab" aria-selected={vista === "informe"}
                  className={vista === "informe" ? "aqui" : ""}
                  onClick={() => setVista("informe")}>El informe</button>
          <button type="button" role="tab" aria-selected={vista === "fuentes"}
                  className={vista === "fuentes" ? "aqui" : ""}
                  onClick={() => setVista("fuentes")}>De dónde sale</button>
        </div>
        <a className="btn" href={`/api/sider/exportar?mes=${mes.slice(0, 7)}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="ic">
            <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                  fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Exportar a Excel
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
            {huerfanos.map((h) => `${h.cd_origen} (${nf.format(Number(h.hl_recibido))} HL)`).join(" · ")}
          </p>
        </section>
      )}

      {/* ============ EL INFORME ============ */}
      {vista === "informe" && (
      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>Sider certificado · {nombreMes}</h2>
            {/* Corto a propósito: cada renglón de texto aquí es un CD
                menos a la vista, y la tabla ya se explica sola. */}
            <p>
              <b>BU MTD</b> = {nf.format(meta * 100)}% de lo recibido ·{" "}
              <b>% Cumpl.</b> = Real ÷ BU · <b>% Certificación</b> = Real ÷ recibido, que es
              el número del informe.
            </p>
          </div>
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
                <th>Centro de Origen</th>
                <th className="num corta">Vh Recibidos</th>
                <th className="num">BU MTD</th>
                <th className="num">Real MTD</th>
                <th className="num">% Cumpl.</th>
                <th className="num corta">HL EER Recibido</th>
                <th className="num">BU MTD</th>
                <th className="num">Real MTD</th>
                <th className="num">% Cumpl.</th>
                <th className="num">% Certificación</th>
              </tr>
            </thead>
            <tbody>
              {dentro.map((f) => {
                const p = f.pct_certificacion == null ? null : Number(f.pct_certificacion);
                const pc = f.pct_cumplimiento == null ? null : Number(f.pct_cumplimiento);
                const pv = f.pct_cumplimiento_vh == null ? null : Number(f.pct_cumplimiento_vh);
                return (
                  <tr key={f.cd_origen}>
                    <td>{f.cd_origen}</td>
                    <td className="num corta">{nf1.format(Number(f.vh_recibidos))}</td>
                    <td className="num">{nf1.format(Number(f.vh_bu_mtd))}</td>
                    <td className="num">{nf1.format(Number(f.vh_real_mtd))}</td>
                    <td className={"num sg-pct" + clase(pv, 1)}>{pctTexto(pv)}</td>
                    <td className="num corta">{nf.format(Number(f.hl_recibido))}</td>
                    <td className="num">{nf.format(Number(f.bu_mtd))}</td>
                    <td className="num">{nf.format(Number(f.real_mtd))}</td>
                    <td className={"num sg-pct" + clase(pc, 1)}>{pctTexto(pc)}</td>
                    <td className={"num sg-pct" + clase(p, meta)}>{pctTexto(p)}</td>
                  </tr>
                );
              })}
              {!dentro.length && (
                <tr><td className="vacio" colSpan={10}>Este mes no tiene nada cargado.</td></tr>
              )}
            </tbody>
            {!!dentro.length && (
              <tfoot>
                <tr>
                  <td>Total general</td>
                  <td className="num corta">{nf1.format(tot.vhRec)}</td>
                  <td className="num">{nf1.format(tot.vhBu)}</td>
                  <td className="num">{nf1.format(tot.vhReal)}</td>
                  <td className={"num sg-pct" + clase(tot.pctVh, 1)}>{pctTexto(tot.pctVh)}</td>
                  <td className="num corta">{nf.format(tot.recibido)}</td>
                  <td className="num">{nf.format(tot.bu)}</td>
                  <td className="num">{nf.format(tot.real)}</td>
                  <td className={"num sg-pct" + clase(tot.pctCumpl, 1)}>{pctTexto(tot.pctCumpl)}</td>
                  <td className={"num sg-pct" + clase(tot.pct, meta)}>{pctTexto(tot.pct)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!!fuera.length && (
          <p className="sg-aparte">
            Fuera del total, por estar marcados <b>no aplica sider</b> en el maestro:{" "}
            {fuera.map((f) => `${f.cd_origen} (${nf.format(Number(f.hl_recibido))} HL)`).join(" · ")}.
            {" "}Son {nf.format(fuera.reduce((s, f) => s + Number(f.hl_recibido), 0))} HL que no
            cuentan ni arriba ni abajo — y se muestran para que se sepa.
          </p>
        )}
      </section>
      )}

      {/* ============ LAS DOS FUENTES ============ */}
      {vista === "fuentes" && (
        <div className="sg-fuentes">
          <section className="tarjeta">
            <div className="cab">
              <div>
                <h2>1 · Lo que llegó</h2>
                <p>
                  De <b>ZLDE</b>, con Planta = Barranquilla y Clase = EER, agrupado por CD
                  de origen. Es la columna <b>HL EER Recibido</b>.
                </p>
              </div>
            </div>
            <div className="marco sg-marco chico">
              <table>
                <thead>
                  <tr><th>CD de origen</th><th className="num">Hectolitros</th></tr>
                </thead>
                <tbody>
                  {conRecibido.map((f) => (
                    <tr key={f.cd_origen}>
                      <td className={f.aplica_sider ? undefined : "apagado"}>
                        {f.cd_origen}
                        {!f.aplica_sider && <div className="cod">no aplica sider</div>}
                        {f.fuera_del_maestro && <div className="cod">fuera del maestro</div>}
                      </td>
                      <td className="num">{nf1.format(Number(f.hl_recibido))}</td>
                    </tr>
                  ))}
                  {!conRecibido.length && (
                    <tr><td className="vacio" colSpan={2}>No hay ZLDE cargado de este mes.</td></tr>
                  )}
                </tbody>
                {!!conRecibido.length && (
                  <tfoot>
                    <tr>
                      <td>Total general</td>
                      <td className="num">
                        {nf1.format(conRecibido.reduce((s, f) => s + Number(f.hl_recibido), 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <section className="tarjeta">
            <div className="cab">
              <div>
                <h2>2 · Lo que se certificó</h2>
                <p>
                  De nuestra <Link href="/sider">Fuente principal</Link>: los HL de los
                  viajes de ese mes que no están anulados. Es la columna <b>Real MTD</b>.
                  Antes esto era la hoja <b>Base de Datos</b> que alguien llenaba a mano.
                </p>
              </div>
            </div>
            <div className="marco sg-marco chico">
              <table>
                <thead>
                  <tr>
                    <th>Centro de Origen</th>
                    <th className="num">Viajes</th>
                    <th className="num">Estibas</th>
                    <th className="num">HL</th>
                  </tr>
                </thead>
                <tbody>
                  {certificaron.map((f) => (
                    <tr key={f.cd_origen}>
                      <td>{f.cd_origen}</td>
                      <td className="num">{f.viajes}</td>
                      <td className="num">{nf1.format(Number(f.estibas))}</td>
                      <td className="num">{nf.format(Number(f.real_mtd))}</td>
                    </tr>
                  ))}
                  {!certificaron.length && (
                    <tr><td className="vacio" colSpan={4}>Nadie certificó nada este mes.</td></tr>
                  )}
                </tbody>
                {!!certificaron.length && (
                  <tfoot>
                    <tr>
                      <td>Total general</td>
                      <td className="num">{certificaron.reduce((s, f) => s + Number(f.viajes), 0)}</td>
                      <td className="num">
                        {nf1.format(certificaron.reduce((s, f) => s + Number(f.estibas), 0))}
                      </td>
                      <td className="num">
                        {nf.format(certificaron.reduce((s, f) => s + Number(f.real_mtd), 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
