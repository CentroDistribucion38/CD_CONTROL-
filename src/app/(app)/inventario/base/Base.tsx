"use client";

/**
 * LA BASE — todo lo contado, tal cual se contó.
 *
 * SE PARECE A LA HOJA A PROPÓSITO. Quien va a usar esto lleva años
 * cuadrando en «FEFO 002.xlsx»: filtra arriba, mira la tabla, ordena por
 * una columna y la baja a Excel. Inventarle otra forma de trabajar no lo
 * haría más rápido, lo haría desconfiar de la pantalla.
 *
 * DOS MONTONES Y DOS PESTAÑAS. La base es lo ENVIADO: firmado con
 * nombre, fecha y hora, y ya sin poderse corregir. Los borradores son lo
 * que alguien tiene abierto AHORA MISMO, y están aquí solo para mirar.
 *
 * Mezclarlos sería el error caro. Un renglón a medio contar sumando en
 * un total del que alguien despacha no da error, no avisa, y la
 * diferencia aparece semanas después cuando ya nadie sabe de dónde
 * salió. Por eso van aparte, cada pestaña dice qué es lo suyo, y los
 * totales de una nunca incluyen a la otra.
 *
 * Y DE LOS BORRADORES NO SE TOCA NADA. Ni corregir ni borrar: son de
 * quien los está caminando, y una fila que alguien arregla «de paso»
 * desde otra pantalla es un renglón que el que cuenta ya no reconoce.
 * Para corregir se entra a Contar, que es donde está el recorrido.
 */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Renglon, ConteoFefo } from "@/modulos/inventario/fefo";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const fecha = (s: string | null) =>
  s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-CO") : "";
const fechaHora = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "";
const siNo = (v: boolean | null) => (v == null ? "" : v ? "Sí" : "No");

/* ---------------------------------------------------------------------
   LAS COLUMNAS, COMO DATOS Y NO COMO JSX

   Son veintiséis. Escritas a mano en el `<thead>` y otra vez en el
   `<tbody>` y otra vez en el CSV serían TRES listas que hay que acordarse
   de cambiar juntas — y la que se olvida no da error: saca la tabla con
   una columna corrida, con los títulos de una y los datos de la de al
   lado. Aquí hay una sola lista y las tres cosas salen de ella.

   `texto` sirve para la celda Y para el Excel: así lo que se baja es
   exactamente lo que se ve, no una segunda versión con otro formato.
   `valor` solo existe donde ordenar por el texto daría un orden raro —un
   número se ordena como número y una fecha como fecha, no alfabéticamente.
   --------------------------------------------------------------------- */
type Col = {
  k: string;
  t: string;
  num?: boolean;
  texto: (r: Renglon) => string;
  valor?: (r: Renglon) => number | string;
  pinta?: (r: Renglon) => ReactNode;
};

const COLUMNAS: Col[] = [
  { k: "calle", t: "Calle", texto: (r) => r.calle ?? "" },
  { k: "modulo", t: "Módulo", texto: (r) => r.modulo ?? "" },
  { k: "lado", t: "Lado", texto: (r) => r.lado ?? "" },
  { k: "ubicacion_combinada", t: "Ubicación", texto: (r) => r.ubicacion_combinada ?? r.ubicacion ?? "" },
  { k: "codigo", t: "Código", texto: (r) => r.codigo },
  { k: "material", t: "Material", texto: (r) => r.material },
  { k: "familia", t: "Familia", texto: (r) => r.familia ?? "" },
  { k: "tipo_material", t: "Tipo", texto: (r) => r.tipo_material },
  { k: "vencimiento", t: "Vence", texto: (r) => fecha(r.vencimiento),
    valor: (r) => (r.vencimiento ? Date.parse(r.vencimiento) : Number.MAX_SAFE_INTEGER) },
  /* LA DE FÁBRICA SIGUE SALIENDO aunque hoy no se teclee: hubo un tramo
     en que se anotaba esa y esos renglones están en la base. Esconder
     una columna con datos dentro es la manera de que alguien jure que
     nunca se anotó. */
  { k: "fabricacion", t: "Se fabricó", texto: (r) => fecha(r.fabricacion),
    valor: (r) => (r.fabricacion ? Date.parse(r.fabricacion) : 0) },
  /* «DÍAS PARA SALIR» ES LA CIFRA DEL FEFO y va marcada: en negativo ya
     se pasó, aunque falten meses para vencer. */
  { k: "dias_para_salir", t: "Días para salir", num: true,
    texto: (r) => (r.dias_para_salir == null ? "" : String(r.dias_para_salir)),
    valor: (r) => r.dias_para_salir ?? Number.MAX_SAFE_INTEGER,
    pinta: (r) => (
      <span className={r.dias_para_salir != null && r.dias_para_salir < 0 ? "ba-mal" : undefined}>
        {r.dias_para_salir ?? "—"}
      </span>
    ) },
  { k: "dias_para_vencer", t: "Días para vencer", num: true,
    texto: (r) => (r.dias_para_vencer == null ? "" : String(r.dias_para_vencer)),
    valor: (r) => r.dias_para_vencer ?? Number.MAX_SAFE_INTEGER },
  { k: "estibas", t: "Estibas", num: true,
    texto: (r) => (r.estibas == null ? "" : String(r.estibas)), valor: (r) => r.estibas ?? -1 },
  { k: "saldo", t: "Saldo", num: true,
    texto: (r) => (r.saldo == null ? "" : String(r.saldo)), valor: (r) => r.saldo ?? -1 },
  { k: "cajas", t: "Cajas sueltas", num: true,
    texto: (r) => (r.cajas == null ? "" : String(r.cajas)), valor: (r) => r.cajas ?? -1 },
  { k: "total_cajas", t: "Total cajas", num: true,
    texto: (r) => String(r.total_cajas), valor: (r) => Number(r.total_cajas),
    pinta: (r) => <b>{nf.format(Number(r.total_cajas))}</b> },
  { k: "factor_estibado", t: "Factor", num: true,
    texto: (r) => (r.factor_estibado == null ? "" : String(r.factor_estibado)),
    valor: (r) => r.factor_estibado ?? -1 },
  { k: "capacidad", t: "Capacidad", num: true,
    texto: (r) => (r.capacidad == null ? "" : String(r.capacidad)),
    valor: (r) => r.capacidad ?? -1 },
  { k: "rotacion", t: "Rota", texto: (r) => siNo(r.rotacion) },
  { k: "averia", t: "Avería", texto: (r) => siNo(r.averia) },
  { k: "pnc", t: "PNC", texto: (r) => siNo(r.pnc) },
  { k: "estado_envase", t: "Estado envase", texto: (r) => r.estado_envase ?? "" },
  { k: "nota", t: "Observación", texto: (r) => r.nota ?? "" },
  /* DE QUÉ RECORRIDO, QUIÉN Y CUÁNDO VAN AL FINAL. El renglón se lee en
     el orden en que se llena —dónde estoy, qué es, cuándo vence, cuánto
     hay, cómo está— y eso es lo que se compara contra la hoja. Quién lo
     anotó y en qué recorrido es lo que se mira DESPUÉS, cuando un
     renglón no cuadra y hay que ir a preguntar. */
  { k: "conteo", t: "Recorrido", texto: (r) => r.conteo ?? "" },
  { k: "conto", t: "Quién contó", texto: (r) => r.conto ?? "" },
  { k: "contado_en", t: "Cuándo", texto: (r) => fechaHora(r.contado_en),
    valor: (r) => (r.contado_en ? Date.parse(r.contado_en) : 0) },
];

/* ---------------------------------------------------------------------
   EL EXCEL

   `sep=;` EN LA PRIMERA LÍNEA. Excel en español parte por punto y coma,
   pero solo si se lo dicen: sin esa línea, el archivo se abre con las
   veintiséis columnas apretadas en la A y hay que ir a «Texto en
   columnas» cada vez.

   Y EL BOM. Sin él, «Águila» se abre como «Ãguila» — Excel no adivina
   UTF-8, se lo tiene que decir el archivo.

   Se baja LO QUE SE ESTÁ VIENDO, filtrado y ordenado igual. Bajar
   siempre el total sería devolver el trabajo de filtrar al Excel, que es
   de donde se venía. Y la cuenta de arriba dice cuántos son, para que
   nadie crea que bajó todo cuando bajó tres.
   --------------------------------------------------------------------- */
function bajar(filas: Renglon[], nombre: string) {
  const escapa = (v: string) =>
    /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lineas = [
    "sep=;",
    COLUMNAS.map((c) => escapa(c.t)).join(";"),
    ...filas.map((r) => COLUMNAS.map((c) => escapa(c.texto(r))).join(";")),
  ];
    /* EL BOM VA ESCRITO —"\\uFEFF"— y no pegado como carácter. Quedó
     pegado en la primera versión y es invisible: en el editor se ve
     `new Blob([" " + ...])` con lo que parece un espacio raro, y el
     primero que «limpie» esa línea rompe el Excel de todo el mundo
     sin enterarse. Escrito, se lee lo que es. */
  const blob = new Blob(["\uFEFF" + lineas.join("\r\n")],
    { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Base({
  enviadas, abiertas, conteos, tope,
}: {
  enviadas: Renglon[]; abiertas: Renglon[]; conteos: ConteoFefo[]; tope: boolean;
}) {
  const [pestania, setPestania] = useState<"base" | "borradores">("base");
  const [fTexto, setFTexto] = useState("");
  const [fRecorrido, setFRecorrido] = useState("");
  const [fCalle, setFCalle] = useState("");
  const [fModulo, setFModulo] = useState("");
  const [soloPasados, setSoloPasados] = useState(false);
  /* El orden arranca por ubicación, que es el orden en que se camina la
     bodega y el de la hoja. Cualquier otro obliga a reordenar antes de
     poder comparar contra lo que se tiene en la mano. */
  const [orden, setOrden] = useState<{ k: string; asc: boolean }>({ k: "ubicacion_combinada", asc: true });

  const crudas = pestania === "base" ? enviadas : abiertas;

  /* LAS LISTAS DE LOS FILTROS SALEN DE LO QUE HAY EN ESTA PESTAÑA, no
     del maestro: ofrecer la calle J cuando no hay nada contado en J es
     ofrecer un filtro que devuelve vacío y hace dudar de si se perdió
     algo. */
  const recorridos = useMemo(
    () => [...new Set(crudas.map((r) => r.conteo).filter(Boolean))].sort().reverse() as string[],
    [crudas]);
  const calles = useMemo(
    () => [...new Set(crudas.map((r) => r.calle).filter(Boolean))].sort() as string[],
    [crudas]);
  const modulos = useMemo(
    () => [...new Set(crudas
      .filter((r) => fCalle === "" || r.calle === fCalle)
      .map((r) => r.ubicacion).filter(Boolean))].sort() as string[],
    [crudas, fCalle]);

  const filas = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    const vistas = crudas.filter((r) => {
      if (q && !`${r.codigo} ${r.material} ${r.familia ?? ""} ${r.nota ?? ""}`
        .toLowerCase().includes(q)) return false;
      if (fRecorrido && r.conteo !== fRecorrido) return false;
      if (fCalle && r.calle !== fCalle) return false;
      if (fModulo && r.ubicacion !== fModulo) return false;
      if (soloPasados && !(r.dias_para_salir != null && r.dias_para_salir < 0)) return false;
      return true;
    });
    const col = COLUMNAS.find((c) => c.k === orden.k) ?? COLUMNAS[0];
    /* Se ordena sobre una COPIA. `sort` muta, y mutar aquí reordenaría
       el arreglo que vino del servidor: al cambiar de pestaña y volver,
       las filas ya no estarían donde el useMemo cree. */
    return [...vistas].sort((a, b) => {
      const va = col.valor ? col.valor(a) : col.texto(a);
      const vb = col.valor ? col.valor(b) : col.texto(b);
      const c = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "es", { numeric: true });
      return orden.asc ? c : -c;
    });
  }, [crudas, fTexto, fRecorrido, fCalle, fModulo, soloPasados, orden]);

  const filtrando = fTexto.trim() !== "" || fRecorrido !== "" || fCalle !== ""
    || fModulo !== "" || soloPasados;
  const cajas = filas.reduce((a, r) => a + Number(r.total_cajas), 0);
  const sitios = new Set(filas.map((r) => r.ubicacion_combinada ?? r.ubicacion)).size;
  const abiertos = conteos.filter((c) => c.estado === "en_proceso" || c.estado === "borrador");

  const ordenarPor = (k: string) =>
    setOrden((o) => (o.k === k ? { k, asc: !o.asc } : { k, asc: true }));

  return (
    <>
      <div className="fe-pes ba-pes" role="tablist">
        <button type="button" role="tab" aria-selected={pestania === "base"}
                className={pestania === "base" ? "on" : ""}
                onClick={() => setPestania("base")}>
          La base<em>{enviadas.length}</em>
        </button>
        <button type="button" role="tab" aria-selected={pestania === "borradores"}
                className={pestania === "borradores" ? "on" : ""}
                onClick={() => setPestania("borradores")}>
          Borradores<em>{abiertas.length}</em>
        </button>
      </div>

      {/* QUÉ ES CADA PESTAÑA, ESCRITO. Sin esto, las dos son una tabla
          igual con números distintos, y ahí es donde alguien suma la
          equivocada. */}
      {pestania === "base" ? (
        <p className="ba-dice">
          Recorridos <b>enviados</b>: firmados con nombre, fecha y hora, y ya no se pueden
          corregir. Es lo único sobre lo que se puede afirmar algo.
        </p>
      ) : (
        <p className="ba-dice ojo">
          Recorridos que alguien tiene <b>abiertos ahora mismo</b>
          {abiertos.length > 0 && <> — {abiertos.map((c) => `${c.codigo} (${c.responsable ?? "?"})`).join(" · ")}</>}.
          Están aquí <b>solo para mirar</b>: no entran en la base, no suman en ningún total, y
          desde aquí no se tocan. Para corregir uno se entra a <b>Contar</b>, que es donde
          está el recorrido.
        </p>
      )}

      {/* EL TOPE, DICHO. PostgREST contesta hasta cierto número de filas
          y no avisa: una lista corta se ve perfectamente normal y
          alguien cuadra contra ella. */}
      {tope && (
        <p className="ba-tope">
          <b>Se llegó al tope de filas que esta pantalla trae de una.</b> Lo que ves está
          bien, pero no está todo: faltan los recorridos más viejos. Si hace falta llegar a
          ellos, hay que sacarlos por rango de fechas — dímelo y lo agrego.
        </p>
      )}

      <div className="ba-filtros">
        <label className="ancho">
          <span className="sr">Buscar por código, material, familia u observación</span>
          <input value={fTexto} onChange={(e) => setFTexto(e.target.value)}
                 placeholder="Código, material, familia u observación — 3128, aguila…" />
        </label>
        <label>
          <span className="sr">Recorrido</span>
          <select value={fRecorrido} onChange={(e) => setFRecorrido(e.target.value)}>
            <option value="">Todos los recorridos</option>
            {recorridos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span className="sr">Calle</span>
          <select value={fCalle} onChange={(e) => { setFCalle(e.target.value); setFModulo("") }}>
            <option value="">Todas las calles</option>
            {calles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span className="sr">Módulo</span>
          <select value={fModulo} onChange={(e) => setFModulo(e.target.value)}>
            <option value="">Todos los módulos</option>
            {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="fe-check">
          <input type="checkbox" checked={soloPasados}
                 onChange={(e) => setSoloPasados(e.target.checked)} />
          <span>Solo lo que ya se pasó</span>
        </label>
        {filtrando && (
          <button type="button" className="btn plano"
                  onClick={() => { setFTexto(""); setFRecorrido(""); setFCalle("");
                                   setFModulo(""); setSoloPasados(false) }}>
            Quitar filtros
          </button>
        )}
      </div>

      <div className="ba-cuenta">
        <p>
          <b>{nf.format(filas.length)}</b> renglón{filas.length === 1 ? "" : "es"}
          {filtrando && <> de {nf.format(crudas.length)}</>} ·{" "}
          <b>{nf.format(cajas)}</b> cajas · {nf.format(sitios)} ubicacion{sitios === 1 ? "" : "es"}
        </p>
        <button type="button" className="btn" disabled={filas.length === 0}
                onClick={() => bajar(filas,
                  `conteo-${pestania}-${new Date().toISOString().slice(0, 10)}.csv`)}>
          Bajar a Excel
        </button>
      </div>

      {filas.length === 0 ? (
        <p className="fe-vacio">
          {crudas.length === 0
            ? pestania === "base"
              ? "Todavía no hay ningún recorrido enviado. Lo que se anota en Contar entra aquí cuando se envía."
              : "Nadie tiene un recorrido abierto en este momento."
            : "Ningún renglón coincide con el filtro."}
        </p>
      ) : (
        /* LA TABLA SE DESPLAZA DENTRO DE SU CAJA, no arrastrando la
           página. Veintiséis columnas no caben en ninguna pantalla, y
           una página que se va de lado deja el menú y los filtros
           inalcanzables mientras se mira la columna veinte. */
        <div className="ba-marco">
          <table className="ba-tabla">
            <thead>
              <tr>
                {COLUMNAS.map((c) => (
                  <th key={c.k} className={c.num ? "num" : undefined}
                      aria-sort={orden.k === c.k ? (orden.asc ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => ordenarPor(c.k)}>
                      {c.t}
                      <i aria-hidden="true">{orden.k === c.k ? (orden.asc ? "▲" : "▼") : ""}</i>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id}>
                  {COLUMNAS.map((c) => (
                    <td key={c.k} className={c.num ? "num" : undefined}>
                      {c.pinta ? c.pinta(r) : c.texto(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
