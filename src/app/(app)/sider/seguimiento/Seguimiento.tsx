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
    const recibido = dentro.reduce((s, f) => s + Number(f.hl_recibido), 0);
    const bu = dentro.reduce((s, f) => s + Number(f.bu_mtd), 0);
    const real = dentro.reduce((s, f) => s + Number(f.real_mtd), 0);
    const viajes = dentro.reduce((s, f) => s + Number(f.viajes), 0);
    return { recibido, bu, real, viajes, pct: recibido > 0 ? real / recibido : null };
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
            <p>
              <b>BU MTD</b> es el {nf.format(meta * 100)}% del HL recibido: los hectolitros
              que deberían venir certificados. El <b>%</b> es Real contra{" "}
              <b>recibido</b>, no contra el BU — así una fila con 17,7% dice que se
              certificó 17,7% de lo que llegó, y no 177% de la meta.
            </p>
          </div>
        </div>
        <div className="marco sg-marco">
          <table className="sg-tabla">
            <thead>
              <tr>
                <th>Centro de Origen</th>
                <th className="num">HL EER Recibido</th>
                <th className="num">BU MTD</th>
                <th className="num">Real MTD</th>
                <th className="num">Viajes</th>
                <th className="num">% Certificación</th>
              </tr>
            </thead>
            <tbody>
              {dentro.map((f) => {
                const p = f.pct_certificacion == null ? null : Number(f.pct_certificacion);
                return (
                  <tr key={f.cd_origen}>
                    <td>{f.cd_origen}</td>
                    <td className="num">{nf.format(Number(f.hl_recibido))}</td>
                    <td className="num">{nf.format(Number(f.bu_mtd))}</td>
                    <td className="num">{nf.format(Number(f.real_mtd))}</td>
                    <td className="num apagado">{f.viajes || "—"}</td>
                    <td className={"num sg-pct" + (p == null ? " nulo" : p >= meta ? " bien" : " mal")}>
                      {pctTexto(p)}
                    </td>
                  </tr>
                );
              })}
              {!dentro.length && (
                <tr><td className="vacio" colSpan={6}>Este mes no tiene nada cargado.</td></tr>
              )}
            </tbody>
            {!!dentro.length && (
              <tfoot>
                <tr>
                  <td>Total general</td>
                  <td className="num">{nf.format(tot.recibido)}</td>
                  <td className="num">{nf.format(tot.bu)}</td>
                  <td className="num">{nf.format(tot.real)}</td>
                  <td className="num">{tot.viajes || "—"}</td>
                  <td className={"num sg-pct" + (tot.pct == null ? " nulo" : tot.pct >= meta ? " bien" : " mal")}>
                    {pctTexto(tot.pct)}
                  </td>
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
