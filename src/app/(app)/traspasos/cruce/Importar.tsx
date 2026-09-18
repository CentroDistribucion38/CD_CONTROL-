"use client";

/**
 * TRASPASOS · IMPORTAR EL CORTE DE SAP.
 *
 * ESTA PANTALLA SOLO SUBE. No muestra el cruce, no tiene montones, no
 * tiene tabla de resultados: eso vive al pie de CONTROL, que es donde se
 * miran los números del día. Un cruce en pantalla propia obliga a que
 * alguien se acuerde de entrar a verlo, y lo que nadie abre no existe.
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
 * LO QUE SÍ TIENE QUE ESTAR AQUÍ es leer el archivo y RECONOCER LAS
 * COLUMNAS, porque el que sube el archivo es el único que puede ver que
 * se equivocó de hoja. Y si algo no se reconoce, se dice QUÉ y se
 * muestra el encabezado que sí se encontró — no «faltan columnas» a
 * secas, que obliga a adivinar.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Importacion } from "@/modulos/traspasos/datos";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const fecha = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO") : "—";

const cuando = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" })
       + " · " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
};

const peso = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
                   : `${Math.max(1, Math.round(b / 1024))} KB`;

/* ---------------------------------------------------------------------
   RECONOCER LAS COLUMNAS POR SU NOMBRE, no por su posición

   El corte se saca de SAP y nadie garantiza el orden de las columnas:
   basta con que alguien mueva una, o exporte con otro layout, para que
   «Cantidad» caiga donde se esperaba «Referencia». Leyendo por nombre,
   el archivo se puede reordenar entero y sigue funcionando.

   Se compara sin tildes ni mayúsculas porque SAP las escribe distinto
   según quién exporte: «Almacén», «ALMACEN», «Almacen». Y cada columna
   trae VARIOS nombres posibles porque el mismo dato se llama distinto
   según el layout: la fecha es «Fecha de entrada» en el corte de la
   bodega y «Fecha contabilización» en el de contabilidad.
   --------------------------------------------------------------------- */
const pelar = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").replace(/[.:]+$/, "").trim();

type Col = { clave: string; rotulo: string; nombres: string[]; obliga: boolean };

const COLUMNAS: Col[] = [
  { clave: "referencia", rotulo: "Referencia", obliga: true,
    nombres: ["referencia", "referencia documento", "no referencia", "nro referencia",
              "numero de referencia", "documento"] },
  { clave: "fecha", rotulo: "Fecha", obliga: true,
    nombres: ["fecha de entrada", "fecha entrada", "fecha contabilizacion",
              "fecha de contabilizacion", "fecha contab", "fecha de documento",
              "fecha documento", "fecha doc", "fecha"] },
  { clave: "cantidad", rotulo: "Cantidad", obliga: true,
    nombres: ["cantidad", "cantidad en um", "cantidad en um entrada", "ctd", "ctd en um"] },
  { clave: "hora", rotulo: "Hora", obliga: false,
    nombres: ["hora de entrada", "hora entrada", "hora contabilizacion", "hora"] },
  { clave: "material", rotulo: "Material", obliga: false,
    nombres: ["material", "codigo material", "codigo de material"] },
  { clave: "descripcion", rotulo: "Descripción", obliga: false,
    nombres: ["texto breve de material", "texto breve", "descripcion",
              "descripcion material", "descripcion del material"] },
  { clave: "centro", rotulo: "Centro", obliga: false, nombres: ["centro"] },
  { clave: "almacen", rotulo: "Almacén", obliga: false, nombres: ["almacen", "alm"] },
];

/* ---------------------------------------------------------------------
   LA CABECERA NO SIEMPRE ES LA PRIMERA FILA

   Un corte exportado de SAP suele traer encima el título del reporte, la
   fecha de generación y una fila en blanco. Leyendo la fila 1 a secas,
   el encabezado de verdad —el que dice «Fecha de entrada» y se ve
   clarito al abrir el Excel— queda como si fuera un dato, y la pantalla
   contesta que no encuentra la columna que cualquiera está viendo.

   Se miran las primeras filas y gana LA QUE MÁS COLUMNAS CONOCIDAS
   TENGA. No hace falta saber cuántas filas de adorno trae el layout de
   turno: la fila del encabezado es, por definición, la que se parece a
   un encabezado.
   --------------------------------------------------------------------- */
const MIRAR = 15;

function cabeceraDe(crudo: unknown[][]) {
  let mejor = { fila: 0, donde: {} as Record<string, number>, aciertos: -1,
                titulos: [] as string[] };

  for (let i = 0; i < Math.min(MIRAR, crudo.length); i++) {
    const cab = (crudo[i] as unknown[]).map(pelar);
    const donde: Record<string, number> = {};
    const tomados = new Set<number>();

    /* PRIMERO LOS NOMBRES EXACTOS. Si no se hiciera en dos vueltas,
       «fecha» —que es el último alias y calza como prefijo de todo—
       podría quedarse con la columna «Fecha de entrada» antes de que
       «cantidad» mire la suya. */
    for (const c of COLUMNAS) {
      const j = cab.findIndex((h, k) => h !== "" && !tomados.has(k) && c.nombres.includes(h));
      if (j >= 0) { donde[c.clave] = j; tomados.add(j) }
    }
    /* Y DESPUÉS, PARA LAS QUE QUEDARON SUELTAS, por cómo empieza el
       título: «Fecha de entrada al almacén» sigue siendo la fecha. */
    for (const c of COLUMNAS) {
      if (donde[c.clave] !== undefined) continue;
      const j = cab.findIndex((h, k) =>
        h !== "" && !tomados.has(k) && c.nombres.some((n) => h.startsWith(n)));
      if (j >= 0) { donde[c.clave] = j; tomados.add(j) }
    }

    const aciertos = Object.keys(donde).length;
    if (aciertos > mejor.aciertos) {
      mejor = { fila: i, donde, aciertos, titulos: (crudo[i] as unknown[]).map((x) => String(x ?? "").trim()) };
    }
  }
  return mejor;
}

/* Una fecha de Excel puede llegar como Date —con `cellDates`— o como
   texto. Las dos se dejan en «2026-09-17», que es lo que entiende la
   base. Un serial pelado no se adivina: si llega, se descarta la fila y
   se dice cuántas se descartaron y por qué. */
function aFecha(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const t = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const m2 = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
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

/* ---------------------------------------------------------------------
   LA CANTIDAD

   Se lee CRUDA —`raw: true`— así que casi siempre llega como número y no
   hay nada que interpretar. El camino de texto es para el corte que
   alguien guardó como .csv: ahí «1.234,50» viene escrito a la colombiana
   y limpiarlo a manotazos —quitar lo que no sea dígito y cambiar la coma
   por punto— daba «1.234.50», que no es un número y la base lo rechaza o,
   peor, lo trunca.

   EL ÚLTIMO SEPARADOR MANDA cuando vienen los dos: en «1.234,50» el
   decimal es la coma; en «1,234.50» es el punto. Con un solo punto y tres
   dígitos detrás —«1.234»— se toma como separador de MILES, porque una
   cantidad de cajas con tres decimales no existe y mil doscientas
   treinta y cuatro sí.

   Y SAP ESCRIBE EL MENOS DETRÁS: «36-» es menos treinta y seis. Sin esto,
   una anulación entraba como salida y el documento dejaba de dar cero.
   --------------------------------------------------------------------- */
export function aNumero(v: unknown): string {
  if (typeof v === "number" && isFinite(v)) return String(v);
  const bruto = String(v ?? "").trim();
  if (!bruto) return "0";
  const negativo = /^-/.test(bruto) || /-\s*$/.test(bruto) || /^\(.*\)$/.test(bruto);
  const t = bruto.replace(/[^\d.,]/g, "");
  if (!t) return "0";

  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  let dec: number;
  if (coma >= 0 && punto >= 0) dec = Math.max(coma, punto);
  else if (coma >= 0) dec = coma;
  else if (punto >= 0) dec = (t.indexOf(".") === punto && /\.\d{3}$/.test(t)) ? -1 : punto;
  else dec = -1;

  const ent = (dec >= 0 ? t.slice(0, dec) : t).replace(/[.,]/g, "");
  const frac = dec >= 0 ? t.slice(dec + 1).replace(/[.,]/g, "") : "";
  const n = (ent || "0") + (frac ? "." + frac : "");
  return (negativo ? "-" : "") + n;
}

type Descarte = { fila: number; por: string };

type Leido = {
  filas: Record<string, string>[];
  hoja: string;
  filaCab: number;
  titulos: string[];
  donde: Record<string, number>;
  descartes: Descarte[];
  descartadas: number;
  faltan: Col[];
};

const TOPE_EJEMPLOS = 40;

/* ---------------------------------------------------------------------
   LEER UNA HOJA. Está FUERA del componente y no toca React ni XLSX a
   propósito: entra una matriz de celdas y sale lo que se leyó. Es lo
   único de esta pantalla que puede equivocarse en silencio —tomar la
   fila de adorno como encabezado, tragarse las filas de totales, darle
   la columna de cantidad a la fecha— y sacarla aparte es lo que permite
   probarla con un Excel de verdad en vez de mirándola.
   --------------------------------------------------------------------- */
export function leerHoja(crudo: unknown[][], hoja: string): Leido {
  const cab = cabeceraDe(crudo);
  const faltan = COLUMNAS.filter((c) => c.obliga && cab.donde[c.clave] === undefined);

  const filas: Record<string, string>[] = [];
  const descartes: Descarte[] = [];
  let descartadas = 0;

  if (!faltan.length) {
    for (let i = cab.fila + 1; i < crudo.length; i++) {
      const r = (crudo[i] ?? []) as unknown[];
      /* LA FILA EN BLANCO NO SE CUENTA NI COMO DESCARTE. Las hojas se
         leen CON las filas vacías —`blankrows: true`— para que el número
         de fila que se le muestra a la gente sea el mismo que ve en el
         Excel; si se saltaran al leer, «fila 8» señalaría la 11 y quien
         va a mirarla encuentra otra cosa. Pero una fila vacía tampoco es
         un movimiento que se descartó: sumarla al contador llenaría el
         «se descartaron 23» de filas que nadie escribió. */
      if (r.every((c) => c == null || String(c).trim() === "")) continue;
      const ref = String(r[cab.donde.referencia] ?? "").trim();
      const fec = aFecha(r[cab.donde.fecha]);
      /* SIN REFERENCIA O SIN FECHA NO ES UN MOVIMIENTO. En el corte de
         verdad son las filas amarillas del final —los totales—, que no
         son datos. Se cuentan Y SE DICE CUÁL ERA CUÁL: «se descartaron
         2» deja comprobar que eran las dos que uno ve con sus ojos, y no
         veinte que no se esperaban. */
      if (!ref || !fec) {
        descartadas++;
        if (descartes.length < TOPE_EJEMPLOS) {
          descartes.push({
            fila: i + 1,
            por: !ref && !fec ? "sin referencia y sin fecha"
               : !ref ? "sin referencia"
               : `la fecha no se entiende: «${String(r[cab.donde.fecha] ?? "").trim() || "vacía"}»`,
          });
        }
        continue;
      }
      filas.push({
        referencia: ref,
        fecha: fec,
        cantidad: aNumero(r[cab.donde.cantidad]),
        hora: aHora(r[cab.donde.hora]) ?? "",
        material: String(r[cab.donde.material] ?? "").trim(),
        descripcion: String(r[cab.donde.descripcion] ?? "").trim(),
        centro: String(r[cab.donde.centro] ?? "").trim(),
        almacen: String(r[cab.donde.almacen] ?? "").trim(),
      });
    }
  }

  return { filas, hoja, filaCab: cab.fila, titulos: cab.titulos,
           donde: cab.donde, descartes, descartadas, faltan };
}

/* CUÁNTO LLEGÓ A LEER UNA HOJA, para escoger entre varias. Primero la
   que no le falte ninguna obligatoria —eso pesa más que todo lo demás
   junto— y entre esas, la que más filas traiga. */
export function puntaje(l: Leido): number {
  return (l.faltan.length ? 0 : 1_000_000) + l.filas.length
       + Object.keys(l.donde).length;
}

/* ---------------------------------------------------------------------
   CUÁL DE LAS HOJAS ES EL CORTE

   NO ES «LA PRIMERA». El corte viene con una sola hoja hoy, pero el día
   que traiga una portada delante —el título del reporte, quién lo generó
   y poco más—, quedarse con la primera es leer la portada y contestar
   que el archivo no trae ningún movimiento. Con el archivo bueno en la
   mano y la pantalla diciendo que está vacío, nadie vuelve a intentarlo.

   GANA LA QUE MÁS LEJOS LLEGUE, que es lo que mide `puntaje`.
   --------------------------------------------------------------------- */
export function escogerHoja(hojas: { nombre: string; crudo: unknown[][] }[]): Leido | null {
  let mejor: Leido | null = null;
  let puntos = -1;
  for (const h of hojas) {
    if (h.crudo.length < 2) continue;
    const l = leerHoja(h.crudo, h.nombre);
    const p = puntaje(l);
    if (p > puntos) { puntos = p; mejor = l }
  }
  return mejor;
}

export function Importar({ puedeImportar, importaciones }: {
  puedeImportar: boolean;
  importaciones: Importacion[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [leido, setLeido] = useState<Leido | null>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; bytes: number } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [mandando, setMandando] = useState(false);
  const [verPorQue, setVerPorQue] = useState(false);
  const [hecho, setHecho] = useState<{ documentos: number; movimientos: number; anulados: number } | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  async function leer(f: File) {
    setArchivo({ nombre: f.name, bytes: f.size });
    setLeyendo(true); setLeido(null); setHecho(null); setVerPorQue(false);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });

      /* LA HOJA QUE MÁS COLUMNAS CONOCIDAS TENGA, no la primera a secas.
         El corte viene con una sola hoja hoy, pero el día que traiga una
         portada delante, escoger por contenido es lo que impide leer la
         portada y decir «no trae ningún movimiento». */
      /* CRUDO Y CON LAS FECHAS COMO FECHA. Formateado —`raw: false`— la
         cantidad llegaba ya escrita a la colombiana y había que deshacer
         el formato para volver a tener el número; crudo llega el número
         tal cual. Y `blankrows: true` es lo que hace que el número de
         fila que se le muestra a la gente sea el del Excel. */
      const mejor = escogerHoja(wb.SheetNames.map((n) => ({
        nombre: n,
        crudo: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], {
          header: 1, blankrows: true, defval: null, raw: true,
        }),
      })));

      if (!mejor) { avisar.mal("Ese archivo no tiene ninguna hoja con datos."); return }
      setLeido(mejor);
      if (mejor.faltan.length) {
        avisar.mal(`En la hoja «${mejor.hoja}» no se encontró: `
          + mejor.faltan.map((c) => c.rotulo).join(", ") + ".");
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
    setHecho({ documentos: r?.documentos ?? 0, movimientos: r?.movimientos_leidos ?? 0,
               anulados: r?.anulados ?? 0 });
    avisar.bien(`${nf.format(r?.documentos ?? 0)} documentos de `
      + `${nf.format(r?.movimientos_leidos ?? 0)} movimientos. Las diferencias están en Control.`);
    setLeido(null); setArchivo(null);
    if (campo.current) campo.current.value = "";
    router.refresh();
  }

  /* CUÁNTAS REFERENCIAS DISTINTAS TRAE EL ARCHIVO. Es un CONTEO, no la
     regla: el documento que se anuló y quedó en cero todavía cuenta
     aquí y no contará en la base. Se muestra porque es lo que deja ver
     de un vistazo que 412 movimientos no son 412 documentos — y se
     rotula como lo que es, para que nadie lo cuadre contra el otro. */
  const referencias = useMemo(() => {
    if (!leido) return 0;
    return new Set(leido.filas.map((f) => f.referencia)).size;
  }, [leido]);

  const listo = !!leido && !leido.faltan.length && leido.filas.length > 0;
  const razon = !leido ? null
    : leido.faltan.length
      ? { que: `No se puede importar: no se encontró ${leido.faltan.map((c) => c.rotulo).join(" ni ")}`,
          como: `En la hoja «${leido.hoja}» se tomó como encabezado la fila ${leido.filaCab + 1}: `
              + (leido.titulos.filter(Boolean).slice(0, 8).join(" · ") || "vacía")
              + ". ¿Seguro que es el corte de SAP?" }
    : leido.filas.length === 0
      ? { que: "No se puede importar: 0 movimientos válidos",
          como: `Se leyeron ${leido.descartadas} filas y ninguna traía referencia y fecha a la vez.` }
      : null;

  /* LOS CUATRO PASOS. No son adorno: dicen en qué momento va uno y qué
     falta para el siguiente, que es la pregunta del que subió un archivo
     y ve un botón apagado. */
  const paso = !archivo ? 1 : !leido ? 2 : listo ? 3 : 2;

  return (
    <>
      {avisos}

      <div className="cz-duo">
        <section className="cz-caja">
          <div className="cz-h">
            <h2>Corte de SAP</h2>
            <p>
              El Excel tal como sale. Las columnas se leen por su nombre y el encabezado se
              busca en las primeras filas, así que el orden —y el título que SAP mete
              arriba— no importan. Volver a subirlo actualiza lo que ya está, no lo duplica.
            </p>
          </div>

          <div className="cz-c">
            <input ref={campo} type="file" accept=".xlsx,.xls,.csv"
                   className="cz-oculto" aria-label="Corte de SAP"
                   disabled={!puedeImportar}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f) }} />

            {!archivo ? (
              <button type="button" className="cz-zona" disabled={!puedeImportar}
                      onClick={() => campo.current?.click()}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                  <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
                </svg>
                <b>{puedeImportar ? "Escoge el corte de SAP" : "Tu rol no puede importar"}</b>
                <span>
                  {puedeImportar
                    ? ".xlsx, .xls o .csv — el archivo tal como lo bajaste"
                    : "Se pide en Administración → Roles"}
                </span>
              </button>
            ) : (
              <div className="cz-arch">
                <span className="ic" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" />
                    <path d="M10 12l4 6M14 12l-4 6" />
                  </svg>
                </span>
                <div>
                  <b>{archivo.nombre}</b>
                  <span>
                    {peso(archivo.bytes)}
                    {leyendo ? " · leyendo…"
                      : leido ? ` · hoja «${leido.hoja}» · encabezado en la fila ${leido.filaCab + 1}`
                      : ""}
                  </span>
                </div>
                <button type="button" onClick={() => campo.current?.click()}>Cambiar</button>
              </div>
            )}

            {/* LO QUE SE LEYÓ, ANTES DE GUARDARLO. Un archivo que se
                importa a ciegas y sale mal obliga a deshacerlo; leído
                primero, el que lo sube ve si se equivocó de hoja sin
                haber tocado nada. */}
            {leido && (
              <>
                <div className="cz-lectura">
                  <div className={leido.filas.length === 0 ? "mal" : undefined}>
                    <div className="n">{nf.format(leido.filas.length)}</div>
                    <div className="t">MOVIMIENTOS VÁLIDOS</div>
                  </div>
                  <div>
                    <div className="n">{nf.format(leido.descartadas)}</div>
                    <div className="t">FILAS DESCARTADAS</div>
                    {leido.descartadas > 0 && (
                      <button type="button" className="ver"
                              onClick={() => setVerPorQue((v) => !v)}>
                        {verPorQue ? "Ocultar" : "Ver por qué"}
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="n">{leido.filas.length ? nf.format(referencias) : "—"}</div>
                    <div className="t">REFERENCIAS DISTINTAS</div>
                  </div>
                </div>

                {verPorQue && leido.descartes.length > 0 && (
                  <div className="cz-porque">
                    <div className="t">POR QUÉ SE DESCARTARON</div>
                    <ul>
                      {leido.descartes.map((d) => (
                        <li key={d.fila}><b>Fila {d.fila}</b> · {d.por}</li>
                      ))}
                    </ul>
                    {leido.descartadas > leido.descartes.length && (
                      <p className="mas">
                        y {nf.format(leido.descartadas - leido.descartes.length)} más.
                      </p>
                    )}
                  </div>
                )}

                <div className="cz-cols">
                  {COLUMNAS.map((c) => {
                    const hay = leido.donde[c.clave] !== undefined;
                    return (
                      <span key={c.clave} className={"cz-col " + (hay ? "ok" : c.obliga ? "no" : "gris")}>
                        <i aria-hidden>{hay ? "✓" : "✕"}</i> {c.rotulo}
                        {hay
                          ? <em>{leido.titulos[leido.donde[c.clave]] || "—"}</em>
                          : <em>{c.obliga ? "no se encontró" : "no viene · opcional"}</em>}
                      </span>
                    );
                  })}
                </div>
              </>
            )}

            <div className="cz-regla">
              <div className="t">CÓMO SE AGRUPA UN DOCUMENTO</div>
              <div className="cuerpo">
                <div className="cz-caso">
                  <span className="cz-mov neg">−36</span>
                  <span className="cz-mov pos">+36</span>
                  <span className="cz-mov neg">−28</span>
                  <span className="cz-igual" aria-hidden>=</span>
                  <span className="cz-res">1 documento</span>
                  <span className="nota">Salió, se anuló y se rehízo. Cuenta una vez.</span>
                </div>
                <div className="cz-caso">
                  <span className="cz-mov pos">+36</span>
                  <span className="cz-mov neg">−36</span>
                  <span className="cz-igual" aria-hidden>=</span>
                  <span className="cz-res cero">ninguno</span>
                  <span className="nota">Se anuló y quedó en cero. No cuenta.</span>
                </div>
              </div>
              <p className="pie-regla">
                La agrupación la hace la base, no esta pantalla: es la misma regla que después
                usa el tablero, y una regla escrita dos veces termina dando dos respuestas.
              </p>
            </div>
          </div>

          <div className="cz-pie">
            <button type="button" disabled={!listo || mandando || !puedeImportar}
                    onClick={importar}>
              {mandando ? "Subiendo…" : "Importar el corte"}
            </button>

            {hecho && (
              <div className="razon bien">
                Importado: {nf.format(hecho.documentos)} documentos de {nf.format(hecho.movimientos)} movimientos
                {hecho.anulados > 0 && <> · {nf.format(hecho.anulados)} anulados en SAP, que no cuentan</>}
                <span>
                  Las diferencias están al pie de{" "}
                  <Link href="/traspasos/control">Control y ejecución</Link>.
                </span>
              </div>
            )}

            {razon && (
              <div className="razon">
                {razon.que}
                <span>{razon.como}</span>
              </div>
            )}

            {!hecho && !razon && listo && (
              <div className="razon neutra">
                Se van a subir {nf.format(leido!.filas.length)} movimientos
                <span>Del {fecha(leido!.filas.reduce((a, f) => f.fecha < a ? f.fecha : a, leido!.filas[0].fecha))}
                  {" "}al {fecha(leido!.filas.reduce((a, f) => f.fecha > a ? f.fecha : a, leido!.filas[0].fecha))}.</span>
              </div>
            )}
          </div>
        </section>

        <aside className="cz-caja cz-lado">
          <div className="cz-h"><h2>Cómo va</h2></div>
          <div className="cz-c">
            <div className={"cz-paso " + (paso > 1 ? "hecho" : "activo")}>
              <i aria-hidden>{paso > 1 ? "✓" : "1"}</i>
              <div><b>Subir el corte</b>{archivo ? archivo.nombre : "El Excel tal como sale de SAP"}</div>
            </div>
            <div className={"cz-paso " + (listo ? "hecho" : paso === 2 ? "activo" : "")}>
              <i aria-hidden>{listo ? "✓" : "2"}</i>
              <div>
                <b>Leer los movimientos</b>
                {!leido ? "Se reconocen las columnas por su nombre"
                  : leido.faltan.length ? `No se encontró ${leido.faltan.map((c) => c.rotulo).join(" ni ")}`
                  : `${nf.format(leido.filas.length)} movimientos válidos`}
              </div>
            </div>
            <div className={"cz-paso " + (hecho ? "hecho" : listo ? "activo" : "")}>
              <i aria-hidden>{hecho ? "✓" : "3"}</i>
              <div>
                <b>Importar</b>
                {hecho ? `${nf.format(hecho.documentos)} documentos guardados`
                       : "Agrupa los movimientos en documentos y los guarda"}
              </div>
            </div>
            <div className={"cz-paso " + (hecho ? "activo" : "")}>
              <i aria-hidden>4</i>
              <div>
                <b>Revisar las diferencias</b>
                <Link href="/traspasos/control">Al pie de Control y ejecución</Link>
                {" "}— lo que salió en SAP y nadie registró.
              </div>
            </div>
          </div>

          <div className="cz-hist">
            <div className="t">IMPORTACIONES ANTERIORES</div>
            {importaciones.length === 0 ? (
              <p className="nada">Todavía no se ha subido ningún corte.</p>
            ) : (
              importaciones.map((i) => (
                <div className="cz-fila" key={i.cuando}>
                  <b>{cuando(i.cuando)}</b>
                  <span>
                    {nf.format(i.documentos)} docs
                    {" · "}
                    <em className={i.sin_registrar > 0 ? "mal" : "bien"}>
                      {i.sin_registrar} sin registrar
                    </em>
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
