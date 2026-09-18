"use client";

/**
 * EL CRUCE CONTRA SAP.
 *
 * QUÉ CONTESTA. Si lo que se registró en el sistema es lo que SAP dice
 * que salió. Se sube el corte —el Excel de siempre— y la pantalla parte
 * los documentos en tres montones: los que faltan, los que sobran y los
 * que cuadran.
 *
 * EL EXCEL TRAE MOVIMIENTOS, NO DOCUMENTOS, y esa es toda la dificultad:
 *
 *   7687019429  -36  ← salió
 *   7687019429  +36  ← se anuló
 *   7687019429  -28  ← se rehízo bien
 *
 * son UN documento y no tres. Y +36 / -36 a secas es NINGUNO. La regla
 * —agrupar por referencia, sumar, y contar el que no dé cero— NO SE HACE
 * AQUÍ: se manda el archivo tal cual y la agrupa la base. Es a propósito.
 * Esa regla decide qué falta y qué no, y una regla que vive en la
 * pantalla se queda en esa pantalla: mañana la necesita el tablero,
 * pasado un informe, y ahí empiezan las tres versiones que no se parecen.
 *
 * AQUÍ SOLO SE LEE EL ARCHIVO Y SE RECONOCEN LAS COLUMNAS. Eso sí tiene
 * que estar aquí: el que sube el archivo es el único que puede ver que
 * se equivocó de hoja.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { LineaCruce } from "@/modulos/traspasos/datos";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const fecha = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO") : "—";

/* ---------------------------------------------------------------------
   RECONOCER LAS COLUMNAS POR SU NOMBRE, no por su posición

   El corte se saca de SAP y nadie garantiza el orden de las columnas:
   basta con que alguien mueva una, o exporte con otro layout, para que
   «Cantidad» caiga donde se esperaba «Referencia». Leyendo por nombre,
   el archivo se puede reordenar entero y sigue funcionando; y cuando de
   verdad falta una columna, se dice CUÁL falta en vez de cargar números
   equivocados sin que nada chille.

   Se compara sin tildes ni mayúsculas porque SAP las escribe distinto
   según quién exporte: «Almacén», «ALMACEN», «Almacen».
   --------------------------------------------------------------------- */
const pelar = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const COLUMNAS: { clave: string; nombres: string[]; obliga: boolean }[] = [
  { clave: "referencia",  nombres: ["referencia"],                       obliga: true },
  { clave: "fecha",       nombres: ["fecha de entrada", "fecha"],        obliga: true },
  { clave: "cantidad",    nombres: ["cantidad"],                         obliga: true },
  { clave: "hora",        nombres: ["hora de entrada", "hora"],          obliga: false },
  { clave: "material",    nombres: ["material"],                         obliga: false },
  { clave: "descripcion", nombres: ["texto breve de material", "texto breve", "descripcion"], obliga: false },
  { clave: "centro",      nombres: ["centro"],                           obliga: false },
  { clave: "almacen",     nombres: ["almacen"],                          obliga: false },
];

/* Una fecha de Excel puede llegar como Date —con `cellDates`— o como
   texto. Las dos se dejan en «2026-09-17», que es lo que entiende la
   base. Un serial pelado no se adivina: si llega, se descarta la fila y
   se dice cuántas se descartaron. */
function aFecha(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const t = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function aHora(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  const t = String(v ?? "").trim();
  const m = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  let h = Number(m[1]);
  /* «1:17:22 p. m.» — SAP exporta en doce horas con el sufijo en
     español. Sin esto, la tarde se guarda como la madrugada y el
     documento cambia de turno. */
  if (/p\.?\s*m\.?/i.test(t) && h < 12) h += 12;
  if (/a\.?\s*m\.?/i.test(t) && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

type Leido = {
  filas: Record<string, string>[];
  hoja: string;
  descartadas: number;
  faltan: string[];
};

export function Cruce({ lineas, resumen, puedeImportar }: {
  lineas: LineaCruce[];
  resumen: { documentos: number; desde: string | null; hasta: string | null;
             importado_en: string | null; quien: string | null } | null;
  puedeImportar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [leido, setLeido] = useState<Leido | null>(null);
  const [nombre, setNombre] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [mandando, setMandando] = useState(false);
  const [pestania, setPestania] = useState<"falta" | "sobra" | "cuadra">("falta");
  const campo = useRef<HTMLInputElement>(null);

  async function leer(f: File) {
    setNombre(f.name); setLeyendo(true); setLeido(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      /* LA PRIMERA HOJA QUE TENGA LA COLUMNA «Referencia», no la
         primera a secas. El corte viene con una sola hoja hoy, pero el
         día que traiga una portada delante, buscar por nombre de
         columna es lo que impide leer la portada y decir «no trae
         ningún movimiento». */
      let mejor: Leido | null = null;
      for (const n of wb.SheetNames) {
        const crudo = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], {
          header: 1, blankrows: false, defval: null, raw: false, dateNF: "yyyy-mm-dd",
        });
        if (crudo.length < 2) continue;
        const cab = (crudo[0] as unknown[]).map(pelar);
        const donde: Record<string, number> = {};
        for (const c of COLUMNAS) {
          const i = cab.findIndex((h) => c.nombres.includes(h));
          if (i >= 0) donde[c.clave] = i;
        }
        const faltan = COLUMNAS.filter((c) => c.obliga && donde[c.clave] === undefined)
          .map((c) => c.nombres[0]);
        if (faltan.length) { mejor = mejor ?? { filas: [], hoja: n, descartadas: 0, faltan }; continue }

        const filas: Record<string, string>[] = [];
        let descartadas = 0;
        for (const r of crudo.slice(1) as unknown[][]) {
          const ref = String(r[donde.referencia] ?? "").trim();
          const fec = aFecha(r[donde.fecha]);
          /* SIN REFERENCIA O SIN FECHA NO ES UN MOVIMIENTO. En el corte
             de verdad son las filas amarillas del final —los totales—,
             que no son datos. Se cuentan y se dicen, en vez de callarse:
             «se descartaron 2» deja comprobar que eran las dos que uno
             ve con sus ojos, y no veinte que no se esperaban. */
          if (!ref || !fec) { descartadas++; continue }
          filas.push({
            referencia: ref,
            fecha: fec,
            cantidad: String(r[donde.cantidad] ?? "0").replace(/[^\d.,-]/g, "").replace(",", "."),
            hora: aHora(r[donde.hora]) ?? "",
            material: String(r[donde.material] ?? "").trim(),
            descripcion: String(r[donde.descripcion] ?? "").trim(),
            centro: String(r[donde.centro] ?? "").trim(),
            almacen: String(r[donde.almacen] ?? "").trim(),
          });
        }
        mejor = { filas, hoja: n, descartadas, faltan: [] };
        break;
      }
      if (!mejor) { avisar.mal("Ese archivo no tiene ninguna hoja con datos."); return }
      setLeido(mejor);
      if (mejor.faltan.length) {
        avisar.mal(`A la hoja «${mejor.hoja}» le faltan columnas: ${mejor.faltan.join(", ")}. `
                 + "¿Seguro que es el corte de SAP?");
      }
    } catch {
      avisar.mal("No se pudo leer ese archivo. Tiene que ser .xlsx, .xls o .csv.");
    } finally {
      setLeyendo(false);
    }
  }

  async function importar() {
    if (!leido?.filas.length) return;
    setMandando(true);
    const { data, error } = await supabase.rpc("traspaso_sap_importar", { p_filas: leido.filas });
    setMandando(false);
    if (error) {
      avisar.mal(/does not exist|schema cache/i.test(error.message)
        ? "Falta correr supabase/migraciones/2026-09-traspasos-cruce-sap.sql en Supabase."
        : error.message);
      return;
    }
    const r = (Array.isArray(data) ? data[0] : data) as
      { documentos: number; movimientos_leidos: number; anulados: number } | null;
    avisar.bien(`${nf.format(r?.documentos ?? 0)} documentos de ${nf.format(r?.movimientos_leidos ?? 0)} `
      + `movimientos${(r?.anulados ?? 0) > 0 ? ` · ${r!.anulados} anulados en SAP, que no cuentan` : ""}.`);
    setLeido(null); setNombre("");
    if (campo.current) campo.current.value = "";
    router.refresh();
  }

  const faltan = useMemo(() => lineas.filter((l) => l.estado === "falta"), [lineas]);
  const sobran = useMemo(() => lineas.filter((l) => l.estado === "sobra"), [lineas]);
  const cuadran = useMemo(() => lineas.filter((l) => l.estado === "cuadra"), [lineas]);
  const otroDia = useMemo(() => cuadran.filter((l) => l.dia_distinto), [cuadran]);
  const vistas = pestania === "falta" ? faltan : pestania === "sobra" ? sobran : cuadran;

  return (
    <>
      {avisos}

      {puedeImportar && (
        <section className="caja">
          <div className="cab">
            <div>
              <h2>Subir el corte de SAP</h2>
              <p>
                El Excel tal como sale. Se leen las columnas por su nombre, así que el orden
                no importa. Volver a subirlo actualiza lo que ya está, no lo duplica.
              </p>
            </div>
          </div>

          <div className="cr-subir">
            <input ref={campo} type="file" accept=".xlsx,.xls,.csv"
                   aria-label="Corte de SAP"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f) }} />
            {leyendo && <span className="cr-nota">Leyendo {nombre}…</span>}
          </div>

          {/* LO QUE SE LEYÓ, ANTES DE GUARDARLO. Un archivo que se
              importa a ciegas y sale mal obliga a deshacerlo; leído
              primero, el que lo sube ve si se equivocó de hoja sin haber
              tocado nada. */}
          {leido && !leido.faltan.length && (
            <div className="cr-leido">
              <p>
                <b>{nf.format(leido.filas.length)}</b> movimientos en la hoja{" "}
                <b>{leido.hoja}</b>
                {leido.descartadas > 0 && (
                  <> · {leido.descartadas} fila{leido.descartadas === 1 ? "" : "s"} sin
                     referencia o sin fecha, que no se suben — en el corte suelen ser los
                     totales del final</>
                )}
              </p>
              <p className="cr-nota">
                Los movimientos del mismo documento los agrupa la base: −36, +36 y −28 del
                mismo número son <b>un</b> documento; +36 y −36 a secas no son ninguno.
              </p>
              <button type="button" className="btn si" disabled={mandando}
                      onClick={importar}>
                {mandando ? "Subiendo…" : "Cruzar contra lo registrado"}
              </button>
            </div>
          )}
        </section>
      )}

      {resumen == null || resumen.documentos === 0 ? (
        <section className="caja">
          <div className="vacio">
            <b>Todavía no se ha subido ningún corte</b>
            Sube el Excel de SAP y la pantalla dice qué documentos salieron y nadie registró.
          </div>
        </section>
      ) : (
        <>
          <section className="caja">
            <div className="cab">
              <div>
                <h2>
                  {faltan.length === 0
                    ? "Todo lo de SAP está registrado"
                    : `${faltan.length} documento${faltan.length === 1 ? "" : "s"} sin registrar`}
                </h2>
                <p>
                  Corte del <b>{fecha(resumen.desde)}</b> al <b>{fecha(resumen.hasta)}</b> ·{" "}
                  {nf.format(resumen.documentos)} documentos
                  {resumen.quien && <> · subido por {resumen.quien}</>}
                </p>
              </div>
            </div>

            <div className="cr-marcador">
              <button type="button" className={"cr-grupo mal" + (pestania === "falta" ? " on" : "")}
                      onClick={() => setPestania("falta")}>
                <span className="n">{faltan.length}</span>
                <span className="q">faltan</span>
                <span className="p">SAP los tiene y nadie los registró</span>
              </button>
              <button type="button" className={"cr-grupo ojo" + (pestania === "sobra" ? " on" : "")}
                      onClick={() => setPestania("sobra")}>
                <span className="n">{sobran.length}</span>
                <span className="q">sobran</span>
                <span className="p">registrados y SAP no los tiene — casi siempre un dedazo</span>
              </button>
              <button type="button" className={"cr-grupo bien" + (pestania === "cuadra" ? " on" : "")}
                      onClick={() => setPestania("cuadra")}>
                <span className="n">{cuadran.length}</span>
                <span className="q">cuadran</span>
                <span className="p">
                  {otroDia.length > 0
                    ? `${otroDia.length} con el día cambiado`
                    : "los dos los tienen"}
                </span>
              </button>
            </div>
          </section>

          <section className="caja">
            <div className="cab">
              <div>
                <h2>
                  {pestania === "falta" ? "Faltaron" : pestania === "sobra" ? "Sobran" : "Cuadran"}
                  {" "}· {vistas.length}
                </h2>
                <p>
                  {pestania === "falta"
                    ? "SAP dice que estos documentos salieron y no hay viaje registrado con ese número."
                    : pestania === "sobra"
                      ? "Estos viajes tienen un documento que SAP no reporta en esos días. Casi siempre es un dígito mal tecleado: busca al lado el que aparece como que falta."
                      : "Están en los dos lados. Los marcados llevan el día cambiado: el viaje quedó en un día y SAP lo reporta en otro."}
                </p>
              </div>
            </div>

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
                      <th>Registrado</th>
                      <th>Viaje</th>
                      <th>Placa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vistas.map((l) => (
                      <tr key={l.documento} className={l.dia_distinto ? "ojo" : undefined}>
                        <td className="cr-doc">{l.documento}</td>
                        <td>{l.sap_fecha ? `${fecha(l.sap_fecha)}${l.sap_hora ? " " + l.sap_hora.slice(0, 5) : ""}` : "—"}</td>
                        <td className="num">{l.sap_movimientos ?? "—"}</td>
                        <td className="num">{l.sap_neto == null ? "—" : nf.format(l.sap_neto)}</td>
                        <td>{l.sis_fecha ? `${fecha(l.sis_fecha)} · ${l.sis_turno ?? ""}` : "—"}</td>
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
      )}
    </>
  );
}
