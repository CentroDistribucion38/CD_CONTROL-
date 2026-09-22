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
import { Buscador } from "@/components/Buscador";
import { leerPaleta } from "../informe";

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
  /* QUÉ RECORRIDO SE ESTÁ MIRANDO.
     · null   nadie ha escogido todavía → vale el ÚLTIMO, que es el que
              casi siempre se va a mirar.
     · ""     escogió «Todos» a propósito.
     · código ese recorrido.

     Los tres estados hacen falta: con un `""` que valiera las dos cosas
     no habría forma de distinguir «entré y no he tocado nada» de «quiero
     verlos todos», y al cambiar de pestaña habría que adivinar cuál era. */
  const [fRecorrido, setFRecorrido] = useState<string | null>(null);
  const [fCalle, setFCalle] = useState("");
  const [fModulo, setFModulo] = useState("");
  /* PRODUCTO O ENVASE. Son los dos mundos de esta bodega y casi nunca
     se miran juntos: el que cuadra producto terminado no quiere las
     canastas en medio, y al revés. Va como botones y no como un
     desplegable más porque es la primera pregunta que se hace sobre la
     base, no la quinta. */
  const [fTipo, setFTipo] = useState<"" | "PRODUCTO" | "ENVASE">("");
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
  /* LOS INVENTARIOS, POR FECHA Y CON SUS CIFRAS.

     «Cuando entre a la base deberían aparecer por fecha los registros
     que hicieron, consolidados en una sola base, con el fin de
     seleccionar qué inventario ver.»

     No es un desplegable más: es la PRIMERA pregunta de la pantalla.
     Un desplegable que dice «FEFO-0007» no dice de qué día es ni cuánto
     trae, así que había que escoger uno, mirar la tabla, y volver a
     escoger otro para saber si era ese. Aquí cada uno trae su fecha,
     quién lo firmó y cuánto pesa, y se escoge sabiendo.

     LAS CIFRAS SE CUENTAN DE LAS FILAS QUE HAY AQUÍ, no de la cabecera
     del recorrido: esta pestaña puede traer un tope, y enseñar «1.240
     renglones» encima de una tabla que trae 800 sería decir dos cosas
     distintas del mismo recorrido en la misma pantalla. */
  const recorridos = useMemo(() => {
    const cuenta = new Map<string, { renglones: number; cajas: number }>();
    for (const r of crudas) {
      if (!r.conteo) continue;
      const a = cuenta.get(r.conteo) ?? { renglones: 0, cajas: 0 };
      a.renglones += 1;
      a.cajas += Number(r.total_cajas);
      cuenta.set(r.conteo, a);
    }
    return [...cuenta.entries()]
      .map(([codigo, n]) => {
        const c = conteos.find((x) => x.codigo === codigo) ?? null;
        return {
          codigo, ...n,
          fecha: c?.fecha_analisis ?? null,
          quien: c?.envio_nombre ?? c?.responsable ?? null,
          ubicaciones: c?.ubicaciones ?? null,
        };
      })
      /* EL MÁS NUEVO ARRIBA. Se entra a mirar lo de ayer, no lo de hace
         cuatro meses; y con el orden al revés, el recorrido de hoy
         queda al final de la lista el día que haya cuarenta. */
      .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")
                   || b.codigo.localeCompare(a.codigo, "es", { numeric: true }));
  }, [crudas, conteos]);
  /* EL QUE SE ESTÁ MIRANDO DE VERDAD. Sin tocar nada vale el ÚLTIMO
     —que es el que casi siempre se va a mirar— y no la base entera:
     con meses de conteos, entrar a «todos» son miles de renglones cada
     vez, y la pregunta de todos los días es «¿cómo quedó el de ayer?».
     Verlos todos juntos sigue estando, a un toque. */
  const recorridoActivo = fRecorrido ?? recorridos[0]?.codigo ?? "";

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
      if (recorridoActivo && r.conteo !== recorridoActivo) return false;
      if (fCalle && r.calle !== fCalle) return false;
      if (fModulo && r.ubicacion !== fModulo) return false;
      if (fTipo && r.tipo_material !== fTipo) return false;
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
  }, [crudas, fTexto, recorridoActivo, fCalle, fModulo, fTipo, soloPasados, orden]);

  /* «FILTRANDO» NO INCLUYE EL RECORRIDO. Escoger cuál se mira no es
     recortar una tabla: es decir CUÁL tabla. Contarlo como filtro haría
     que «Quitar filtros» te sacara del recorrido que estás mirando, que
     es lo único que no querías soltar. */
  const filtrando = fTexto.trim() !== "" || fCalle !== ""
    || fModulo !== "" || fTipo !== "" || soloPasados;

  /* CUÁNTOS HAY DE CADA UNO, en lo que queda después de los demás
     filtros. Un botón «Envase» que lleva a una tabla vacía hace dudar
     de si se perdió algo; con la cifra al lado se ve que ese recorrido
     no tocó envases y no hay nada que buscar. */
  const porTipo = useMemo(() => {
    const base = crudas.filter((r) => recorridoActivo === "" || r.conteo === recorridoActivo);
    return {
      PRODUCTO: base.filter((r) => r.tipo_material === "PRODUCTO").length,
      ENVASE: base.filter((r) => r.tipo_material === "ENVASE").length,
      "": base.length,
    } as Record<string, number>;
  }, [crudas, recorridoActivo]);
  const cajas = filas.reduce((a, r) => a + Number(r.total_cajas), 0);
  const sitios = new Set(filas.map((r) => r.ubicacion_combinada ?? r.ubicacion)).size;
  const abiertos = conteos.filter((c) => c.estado === "en_proceso" || c.estado === "borrador");

  const ordenarPor = (k: string) =>
    setOrden((o) => (o.k === k ? { k, asc: !o.asc } : { k, asc: true }));

  return (
    <>
      <Consolidado conteos={conteos} />
      <div className="fe-pes ba-pes" role="tablist">
        <button type="button" role="tab" aria-selected={pestania === "base"}
                className={pestania === "base" ? "on" : ""}
                onClick={() => { setPestania("base"); setFRecorrido(null) }}>
          La base<em>{enviadas.length}</em>
        </button>
        <button type="button" role="tab" aria-selected={pestania === "borradores"}
                className={pestania === "borradores" ? "on" : ""}
                onClick={() => { setPestania("borradores"); setFRecorrido(null) }}>
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

      {/* ================= QUÉ INVENTARIO SE ESTÁ MIRANDO =================

          Va ANTES de los filtros porque es de otra clase de pregunta:
          los filtros recortan una tabla; esto decide CUÁL. Puesto entre
          los demás desplegables se leía como un filtro más, y un filtro
          se deja en blanco sin pensarlo — con lo que se acababa
          cuadrando contra todos los recorridos juntos creyendo estar
          mirando el de ayer.

          UNA LÍNEA, MIDA LO QUE MIDA LA HISTORIA. La primera versión
          era una fila de tarjetas, una por recorrido. Con tres se veía
          bien; a un conteo diario son ciento ochenta en seis meses y
          rodar de lado deja de ser «a la vista». Ahora son:

            · UN BUSCADOR, que se teclea igual que Calle y Módulo en
              Contar: se escribe «18/09» o «FEFO-…-03» y queda uno. Mide
              lo mismo con 3 que con 300.
            · TRES ATAJOS FIJOS —los dos últimos y «Todos»—, que es el
              caso normal: «el de ayer» y «el de antier». Son tres
              siempre, no crecen.

          Y CADA UNO LLEVA SU CÓDIGO, no solo la fecha: el mismo día
          puede tener dos y tres recorridos —turno A, B y C— y «18/9/2026»
          repetido tres veces no distingue nada. */}
      {recorridos.length > 0 && (
        <div className="ba-invs">
          <p className="ba-invs-rot">
            Qué inventario estás mirando
            <em>{recorridos.length} recorrido{recorridos.length === 1 ? "" : "s"}</em>
          </p>
          <div className="ba-invs-fila">
            <label className="ba-inv-buscar">
              <span className="sr">Buscar un recorrido por fecha o código</span>
              <Buscador
                valor={recorridoActivo}
                marcador="Escribe la fecha o el código…"
                sinOpciones="Ningún recorrido coincide."
                opciones={[
                  { valor: "", texto: "Todos los recorridos",
                    pista: `${nf.format(crudas.length)} renglones en total` },
                  ...recorridos.map((rc) => ({
                    valor: rc.codigo,
                    texto: `${rc.fecha ? fecha(rc.fecha) : "sin fecha"} · ${rc.codigo}`,
                    pista: [rc.quien, `${nf.format(rc.renglones)} renglones`,
                            `${nf.format(rc.cajas)} cajas`].filter(Boolean).join(" · "),
                  })),
                ]}
                onEscoge={(v) => { setFRecorrido(v); setFCalle(""); setFModulo("") }} />
            </label>

            {/* LOS ATAJOS. Dos recorridos y «Todos»: fijos, no crecen. */}
            <button type="button" className={"ba-inv todos" + (recorridoActivo === "" ? " on" : "")}
                    aria-pressed={recorridoActivo === ""}
                    onClick={() => { setFRecorrido(""); setFCalle(""); setFModulo("") }}>
              <b>Todos</b>
              <span>{nf.format(recorridos.length)} recorridos</span>
            </button>
            {recorridos.slice(0, 2).map((rc) => (
              <button key={rc.codigo}
                      className={"ba-inv" + (recorridoActivo === rc.codigo ? " on" : "")}
                      type="button" aria-pressed={recorridoActivo === rc.codigo}
                      onClick={() => { setFRecorrido(rc.codigo); setFCalle(""); setFModulo("") }}>
                <b>{rc.fecha ? fecha(rc.fecha) : "sin fecha"}</b>
                <span>{rc.codigo.slice(-2)} · {nf.format(rc.renglones)} rengl.</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ba-filtros">
        <label className="ancho">
          <span className="sr">Buscar por código, material, familia u observación</span>
          <input value={fTexto} onChange={(e) => setFTexto(e.target.value)}
                 placeholder="Código, material, familia u observación — 3128, aguila…" />
        </label>
        {/* PRODUCTO O ENVASE, EN BOTONES. «Que pueda filtrar por
            producto o por envase» dentro del inventario que se está
            mirando. Son dos mundos que casi nunca se miran juntos —el
            que cuadra producto terminado no quiere las canastas en
            medio— y por eso se ve de una cuál está puesto, sin abrir
            nada. Un desplegable más, cerrado, no dice cuál está. */}
        <div className="ba-tipos" role="group" aria-label="Producto o envase">
          {([["", "Todo"], ["PRODUCTO", "Producto"], ["ENVASE", "Envase"]] as const).map(
            ([v, t]) => (
              <button key={v || "todo"} type="button" aria-pressed={fTipo === v}
                      className={fTipo === v ? "on" : ""} onClick={() => setFTipo(v)}>
                {t}<em>{nf.format(porTipo[v] ?? 0)}</em>
              </button>
            ))}
        </div>
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
                                   setFModulo(""); setFTipo(""); setSoloPasados(false) }}>
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
                /* EL NOMBRE DEL ARCHIVO DICE QUÉ TRAE. Bajando tres
                   recorridos seguidos salían tres archivos con el mismo
                   nombre y un (1) y un (2) detrás, y a la media hora
                   nadie sabía cuál era cuál. */
                onClick={() => bajar(filas, [
                  "conteo", pestania, recorridoActivo || "todos",
                  fTipo ? fTipo.toLowerCase() : null,
                  new Date().toISOString().slice(0, 10),
                ].filter(Boolean).join("-") + ".csv")}>
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

/* =====================================================================
   EL CONSOLIDADO DEL DÍA

   «Consolidar los inventarios del día en una base y exportar la data
   espectacular, con el logo, como lo del sider: un Excel donde yo pueda
   validar todo.»

   Se escoge el DÍA —no el recorrido— y el servidor arma el libro con los
   recorridos enviados de ese día: de cada ubicación vale el último que
   pasó por ella. Seis hojas: resumen con el logo, la base, por material,
   por ubicación, validar y sin contar.
   ===================================================================== */
function Consolidado({ conteos }: { conteos: ConteoFefo[] }) {
  const dias = useMemo(() => {
    const m = new Map<string, { recorridos: number; cajas: number; renglones: number }>();
    for (const c of conteos) {
      if (c.estado !== "cerrado" || !c.fecha_analisis) continue;
      const x = m.get(c.fecha_analisis) ?? { recorridos: 0, cajas: 0, renglones: 0 };
      x.recorridos += 1; x.cajas += Number(c.total_cajas ?? 0); x.renglones += Number(c.renglones ?? 0);
      m.set(c.fecha_analisis, x);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [conteos]);
  const [dia, setDia] = useState<string>("");
  /* LOS FEFO QUE ENTRAN. Por defecto todos los del día; se pueden
     desmarcar los que no se quieren en el consolidado (uno de prueba,
     uno repetido, uno de otra zona). Se guardan los QUITADOS: así, al
     cambiar de día, arranca otra vez con todos. */
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  const [bajando, setBajando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const escogido = dia || dias[0]?.[0] || "";
  const delDia = useMemo(() => conteos.filter((c) => c.estado === "cerrado" && c.fecha_analisis === escogido)
    .sort((a, b) => (a.enviado_en ?? "").localeCompare(b.enviado_en ?? "")), [conteos, escogido]);
  const incluidos = delDia.filter((c) => !quitados.has(c.id));
  const alterna = (id: string) => setQuitados((x) => { const y = new Set(x); if (y.has(id)) y.delete(id); else y.add(id); return y });
  const hora = (s: string | null) => s ? new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "—";
  const largo = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

  async function bajar() {
    if (!escogido || !incluidos.length) return;
    setBajando(true); setMal(null);
    try {
      const todos = incluidos.length === delDia.length;
      /* LOS COLORES DEL TEMA de quien exporta, como la hoja de rotura y el
         informe de riesgo: la tinta y el color de la banda. */
      const P = leerPaleta(document.querySelector(".ba-conso"));
      const hx = (c: number[]) => c.map((v) => v.toString(16).padStart(2, "0")).join("");
      const r = await fetch(`/api/inventario/exportar?fecha=${escogido}` + (todos ? "" : `&ids=${incluidos.map((c) => c.id).join(",")}`)
        + `&tinta=${hx(P.tinta)}&banda=${hx(P.cinta[1]?.[1] ?? P.acento)}`);
      if (!r.ok) { const j = await r.json().catch(() => null); setMal(j?.error ?? `No se pudo (${r.status}).`); return }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `inventario-consolidado-${escogido}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch { setMal("Se cortó la conexión con el servidor.") }
    finally { setBajando(false) }
  }

  if (!dias.length) return null;
  return (
    <section className="ba-conso" aria-label="Consolidado del día">
      <div className="ba-conso-tx">
        <p className="ba-conso-o">CONSOLIDADO DEL DÍA · EXCEL</p>
        <h2>Toda la bodega de un día, en una base</h2>
        <p>Los recorridos enviados de ese día juntos —de cada ubicación vale el último que pasó—, con resumen, por material, por ubicación, lo que hay que validar y lo que quedó sin contar.</p>
      </div>
      <div className="ba-conso-acc">
        <label><span>Día</span>
          <select value={escogido} onChange={(e) => { setDia(e.target.value); setQuitados(new Set()) }}>
            {dias.map(([d, x]) => <option key={d} value={d}>{largo(d)} · {x.recorridos} recorrido{x.recorridos === 1 ? "" : "s"}</option>)}
          </select>
        </label>
        <button type="button" className="btn grande" onClick={bajar} disabled={bajando || !incluidos.length}>
          {bajando ? "Armando el Excel…" : !incluidos.length ? "Marca al menos un FEFO" : incluidos.length === delDia.length ? "Exportar consolidado" : `Exportar ${incluidos.length} de ${delDia.length} FEFO`}
        </button>
        <small>{nf.format(incluidos.reduce((a, c) => a + Number(c.renglones ?? 0), 0))} renglones · {nf.format(incluidos.reduce((a, c) => a + Number(c.total_cajas ?? 0), 0))} cajas en {incluidos.length} FEFO</small>
        {mal && <p className="ba-conso-mal" role="alert">{mal}</p>}
      </div>
      {/* QUÉ FEFO ENTRAN: uno por renglón, marcados todos al empezar. */}
      <div className="ba-conso-fefos" role="group" aria-label="FEFO que entran en el consolidado">
        <p className="ba-conso-fefos-cab">
          <span>FEFO de ese día · marca los que entran</span>
          {delDia.length > 1 && (
            <button type="button" className="ba-conso-todos"
                    onClick={() => setQuitados(incluidos.length === delDia.length ? new Set(delDia.map((c) => c.id)) : new Set())}>
              {incluidos.length === delDia.length ? "Quitar todos" : "Marcar todos"}
            </button>
          )}
        </p>
        {delDia.map((c) => {
          const on = !quitados.has(c.id);
          return (
            <label key={c.id} className={"ba-conso-fefo" + (on ? " on" : "")}>
              <input type="checkbox" checked={on} onChange={() => alterna(c.id)} />
              <b>{c.codigo}</b>
              <span>{c.responsable ?? "—"} · enviado {hora(c.enviado_en)}</span>
              <em>{nf.format(Number(c.renglones ?? 0))} rengl. · {nf.format(Number(c.ubicaciones ?? 0))} ubic. · {nf.format(Number(c.total_cajas ?? 0))} cajas</em>
            </label>
          );
        })}
      </div>
    </section>
  );
}
