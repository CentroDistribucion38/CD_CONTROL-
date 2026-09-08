"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  HOJA_BAJAS,
  HOJA_PROD,
  leerBajas,
  leerProduccion,
  type FilaBaja,
  type FilaProduccion,
  type Descarte,
} from "@/modulos/quiebra/importar";

export type Carga = {
  id: string;
  archivo: string | null;
  desde: string;
  hasta: string;
  filas_bajas: number;
  filas_produccion: number;
  cargado_en: string;
  usuario?: string;
};

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const nf = new Intl.NumberFormat("es-CO");
const LOTE = 500;
/** El maestro real pesa ~2,5 MB; 25 MB deja aire de sobra sin colgar el navegador. */
const TOPE_MB = 25;

const dia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const diaAnio = (f: string) => `${dia(f)} ${f.slice(0, 4)}`;

type Revision = {
  archivo: string;
  peso: number;
  bajas: FilaBaja[];
  produccion: FilaProduccion[];
  descartadas: number;
  ejemplos: Descarte[];
  desde: string;
  hasta: string;
  dias: number;
};

/** El error crudo de PostgREST no le dice nada a quien está importando. */
function traducir(mensaje: string, tabla: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("does not exist") || m.includes("schema cache") || m.includes("relation")) {
    return `Falta crear las tablas del módulo en Supabase. Abre el SQL Editor y ejecuta ` +
           `supabase/modulos/quiebra.sql — no existe "${tabla}".`;
  }
  if (m.includes("row-level security") || m.includes("permission")) {
    return "Tu usuario no tiene permiso para importar. Se necesita rol de supervisor o administrador.";
  }
  return mensaje;
}

export function Importar({ cargas }: { cargas: Carga[] }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);

  const [encima, setEncima] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [rev, setRev] = useState<Revision | null>(null);
  const [verDescartes, setVerDescartes] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avance, setAvance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  function limpiar() {
    setRev(null);
    setVerDescartes(false);
    setError(null);
    if (entrada.current) entrada.current.value = "";
  }

  async function tomar(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setListo(null);
    setRev(null);
    setVerDescartes(false);

    if (!/\.(xlsx|xlsm)$/i.test(archivo.name)) {
      return setError("Ese archivo no es un Excel .xlsx o .xlsm.");
    }
    if (archivo.size > TOPE_MB * 1024 * 1024) {
      return setError(`El archivo pesa más de ${TOPE_MB} MB. Recorta el rango de fechas en SAP.`);
    }

    setLeyendo(true);
    try {
      const libro = XLSX.read(await archivo.arrayBuffer(), { cellDates: true });
      const faltan = [HOJA_BAJAS, HOJA_PROD].filter((h) => !libro.SheetNames.includes(h));
      if (faltan.length) {
        // Se rechaza completo: media carga deja el tablero mintiendo.
        setError(
          `Al archivo le faltan las hojas ${faltan.join(" y ")}. ` +
          `Trae: ${libro.SheetNames.slice(0, 8).join(", ")}…`
        );
        setLeyendo(false);
        return;
      }

      const b = leerBajas(XLSX.utils.sheet_to_json(libro.Sheets[HOJA_BAJAS]));
      const p = leerProduccion(XLSX.utils.sheet_to_json(libro.Sheets[HOJA_PROD]));

      if (!b.filas.length && !p.filas.length) {
        setError("Las dos hojas están vacías o no se reconocieron las columnas.");
        setLeyendo(false);
        return;
      }

      const fechas = [...b.filas.map((x) => x.fecha), ...p.filas.map((x) => x.fecha)].sort();
      setRev({
        archivo: archivo.name,
        peso: archivo.size,
        bajas: b.filas,
        produccion: p.filas,
        descartadas: b.descartadas + p.descartadas,
        ejemplos: [...b.ejemplos, ...p.ejemplos],
        desde: fechas[0],
        hasta: fechas[fechas.length - 1],
        dias: new Set(fechas).size,
      });
    } catch (err) {
      setError("No se pudo leer el archivo: " + (err as Error).message);
    }
    setLeyendo(false);
  }

  async function confirmar() {
    if (!rev) return;
    setGuardando(true);
    setError(null);
    setAvance(0);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Se borra SOLO el rango de fechas que trae el archivo, para que un
      // archivo parcial no arrase con el histórico anterior.
      for (const tabla of ["quiebra_bajas", "quiebra_produccion"]) {
        const { error } = await supabase
          .from(tabla)
          .delete()
          .gte("fecha", rev.desde)
          .lte("fecha", rev.hasta);
        if (error) throw new Error(traducir(error.message, tabla));
      }

      const { data: carga, error: eCarga } = await supabase
        .from("quiebra_cargas")
        .insert({
          archivo: rev.archivo,
          desde: rev.desde,
          hasta: rev.hasta,
          filas_bajas: rev.bajas.length,
          filas_produccion: rev.produccion.length,
          cargado_por: user?.id ?? null,
        })
        .select("id")
        .single();
      if (eCarga) throw new Error(traducir(eCarga.message, "quiebra_cargas"));

      const total = rev.bajas.length + rev.produccion.length;
      let hechas = 0;

      for (let i = 0; i < rev.bajas.length; i += LOTE) {
        const trozo = rev.bajas.slice(i, i + LOTE).map((f) => ({ ...f, carga_id: carga.id }));
        const { error } = await supabase.from("quiebra_bajas").insert(trozo);
        if (error) throw new Error(traducir(error.message, "quiebra_bajas"));
        hechas += trozo.length;
        setAvance(Math.round((hechas / total) * 100));
      }
      for (let i = 0; i < rev.produccion.length; i += LOTE) {
        const trozo = rev.produccion.slice(i, i + LOTE).map((f) => ({ ...f, carga_id: carga.id }));
        const { error } = await supabase.from("quiebra_produccion").insert(trozo);
        if (error) throw new Error(traducir(error.message, "quiebra_produccion"));
        hechas += trozo.length;
        setAvance(Math.round((hechas / total) * 100));
      }

      setListo(
        `Quedaron ${nf.format(rev.bajas.length)} bajas y ` +
        `${nf.format(rev.produccion.length)} órdenes, del ${diaAnio(rev.desde)} al ${diaAnio(rev.hasta)}.`
      );
      limpiar();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setGuardando(false);
  }

  return (
    <div className="qb">
      <section className="cabeza-simple">
        <div>
          <div className="ojo">ENVASE RETORNABLE · AG01</div>
          <h1>Importar el maestro</h1>
          <p className="sub">El archivo se lee en tu navegador. Nada se guarda hasta que confirmes.</p>
        </div>
        <p className="firma">Centro de Distribución 38 · Bavaria BAQ</p>
      </section>

      <section className="importar">
        <div className="columna">
          {/* -------- Archivo -------- */}
          <div className="tarjeta">
            <div className="cab">
              <div>
                <h2>Archivo de Excel</h2>
                <p>Formato .xlsx o .xlsm, hasta {TOPE_MB} MB</p>
              </div>
            </div>

            <div className="cuerpo">
              {!rev ? (
                <div
                  className={"soltar" + (encima ? " encima" : "")}
                  tabIndex={0}
                  role="button"
                  aria-label="Elegir el archivo de Excel"
                  onClick={() => entrada.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entrada.current?.click(); }
                  }}
                  onDragEnter={(e) => { e.preventDefault(); setEncima(true); }}
                  onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setEncima(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setEncima(false);
                    void tomar(e.dataTransfer.files?.[0]);
                  }}
                >
                  <svg viewBox="0 0 24 24" className="nube" aria-hidden="true">
                    <path d="M12 16.5V7M8.2 10.8L12 7l3.8 3.8" />
                    <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
                  </svg>
                  <b>{leyendo ? "Leyendo el archivo…" : "Arrastra el archivo aquí"}</b>
                  <span>o <u>búscalo en tu equipo</u></span>
                </div>
              ) : (
                <>
                  <div className="ficha">
                    <div className="icono">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 3h7l4 4v14H7z" />
                        <path d="M14 3v4h4" />
                        <path d="M10 12l4 6M14 12l-4 6" />
                      </svg>
                    </div>
                    <div className="datos">
                      <b>{rev.archivo}</b>
                      <span>
                        {(rev.peso / 1024 / 1024).toFixed(1).replace(".", ",")} MB ·
                        {" "}leído en tu navegador
                      </span>
                    </div>
                    <button
                      className="quitar"
                      type="button"
                      onClick={limpiar}
                      disabled={guardando}
                      aria-label="Quitar archivo"
                    >
                      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>

                  <div className="revision">
                    <div className="rotulo-rev">Esto es lo que se va a cargar</div>

                    <div className="conteos">
                      <div className="conteo">
                        <span className="rot">BAJAS</span>
                        <b>{nf.format(rev.bajas.length)}</b>
                        <span className="u">movimientos · hoja {HOJA_BAJAS}</span>
                      </div>
                      <div className="conteo">
                        <span className="rot">PRODUCCIÓN</span>
                        <b>{nf.format(rev.produccion.length)}</b>
                        <span className="u">órdenes · hoja {HOJA_PROD}</span>
                      </div>
                      <div className="conteo">
                        <span className="rot">PERÍODO</span>
                        <b className="fecha">{dia(rev.desde)} — {diaAnio(rev.hasta)}</b>
                        <span className="u">{nf.format(rev.dias)} días con movimiento</span>
                      </div>
                    </div>

                    <div className="linea aviso">
                      <span className="marca">!</span>
                      <span>
                        Se reemplazan los días entre el <b>{dia(rev.desde)}</b> y el{" "}
                        <b>{diaAnio(rev.hasta)}</b>. Lo que esté fuera de ese rango no se toca.
                      </span>
                    </div>

                    {rev.descartadas > 0 && (
                      <div className="linea neutra">
                        <span className="marca">–</span>
                        <span>
                          Se descartan <b>{nf.format(rev.descartadas)} filas</b> sin fecha o con
                          cantidad en cero.
                          <button
                            className="ver-descartes"
                            type="button"
                            onClick={() => setVerDescartes((v) => !v)}
                          >
                            {verDescartes ? "Ocultar" : "Ver cuáles"}
                          </button>
                        </span>
                      </div>
                    )}

                    {verDescartes && (
                      <div className="descartes">
                        <table>
                          <thead>
                            <tr>
                              <th>Hoja</th>
                              <th className="num">Fila</th>
                              <th>Motivo</th>
                              <th>Referencia</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rev.ejemplos.map((d, i) => (
                              <tr key={i}>
                                <td>{d.hoja}</td>
                                <td className="num">{d.fila}</td>
                                <td>{d.motivo}</td>
                                <td>{d.detalle}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {rev.descartadas > rev.ejemplos.length && (
                          <p className="nota-pie" style={{ padding: "10px 16px" }}>
                            Se muestran las primeras {rev.ejemplos.length} de{" "}
                            {nf.format(rev.descartadas)}.
                          </p>
                        )}
                      </div>
                    )}

                    {guardando && (
                      <div className="avance">
                        <div className="pista">
                          <div className="relleno" style={{ width: `${avance}%` }} />
                        </div>
                        <p>Guardando… {avance}%</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {error && (
                <div className="revision" style={{ marginTop: rev ? 14 : 18 }}>
                  <div className="linea mala">
                    <span className="marca">!</span>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {listo && (
                <div className="revision" style={{ marginTop: 18 }}>
                  <div className="linea ok">
                    <span className="marca">✓</span>
                    <span>
                      {listo} <Link href="/quiebra">Ver el tablero</Link>
                    </span>
                  </div>
                </div>
              )}

              <input
                ref={entrada}
                type="file"
                accept=".xlsx,.xlsm"
                hidden
                onChange={(e) => void tomar(e.target.files?.[0])}
              />
            </div>

            {rev && (
              <div className="acciones">
                <button className="btn" onClick={confirmar} disabled={guardando}>
                  {guardando ? "Importando…" : "Importar y reemplazar el rango"}
                </button>
                <button className="btn plano" onClick={limpiar} disabled={guardando}>
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* -------- Historial -------- */}
          <div className="tarjeta">
            <div className="cab">
              <div>
                <h2>Últimas importaciones</h2>
                <p>Quién cargó qué y sobre qué rango</p>
              </div>
            </div>
            <div className="cuerpo tabla">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Archivo</th>
                    <th>Rango</th>
                    <th className="num">Filas</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {cargas.map((c) => (
                    <tr key={c.id}>
                      <td className="mes">{dia(c.cargado_en.slice(0, 10))}</td>
                      <td>{c.archivo ?? "—"}</td>
                      <td>{dia(c.desde)} — {dia(c.hasta)}</td>
                      <td className="num">{nf.format(c.filas_bajas + c.filas_produccion)}</td>
                      <td>{c.usuario}</td>
                    </tr>
                  ))}
                  {!cargas.length && (
                    <tr><td className="vacio" colSpan={5}>Todavía no se ha importado nada</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* -------- Guía -------- */}
        <aside className="tarjeta guia">
          <div className="cab">
            <div>
              <h2>Qué se lee del libro</h2>
              <p>Las demás hojas se ignoran</p>
            </div>
          </div>
          <div className="cuerpo">
            <div className="hoja-req">
              <div className="titulo-hoja">
                <span className="chapa">{HOJA_BAJAS}</span> Bajas de SAP
              </div>
              <ul>
                <li><b>Texto cab.documento</b> — la causal</li>
                <li><b>Cantidad</b> — negativa; las positivas son reversos y restan</li>
                <li><b>Fe.contab.</b> — para ubicar el día</li>
              </ul>
            </div>
            <div className="hoja-req">
              <div className="titulo-hoja">
                <span className="chapa oro">{HOJA_PROD}</span> Producción
              </div>
              <ul>
                <li><b>Cantidad</b> — envase producido</li>
                <li><b>Fe.Cont</b> — fecha contable</li>
              </ul>
            </div>
            <p className="pista-guia">
              Si una hoja falta o le falta una columna, el archivo se rechaza completo.
              No se carga a medias.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
