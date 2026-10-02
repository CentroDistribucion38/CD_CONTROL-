"use client";

/**
 * LA BASE — todo lo contado, tal cual se contó, YA CRUZADO.
 *
 * SE PARECE A LA HOJA A PROPÓSITO. Quien va a usar esto lleva años
 * cuadrando en «FEFO 002.xlsx»: filtra arriba, mira la tabla, ordena por
 * una columna y la baja a Excel. Inventarle otra forma de trabajar no lo
 * haría más rápido, lo haría desconfiar de la pantalla.
 *
 * LA PREGUNTA DE ARRIBA ES «¿QUÉ RECORRIDOS?». Un calendario y una fila
 * de fichas —una por recorrido enviado de esos días— que se marcan o se
 * desmarcan. Lo que se ve debajo es UNA base, no la suma: si una
 * ubicación se contó en dos recorridos VALE EL ÚLTIMO (la misma regla del
 * tablero y del Excel consolidado; ver `base-cruce.ts`). Por eso cada
 * renglón dice qué recorrido es el que vale, a quién reemplazó y cuánto
 * decía antes: sin eso la cifra cambia sin que nadie sepa por qué.
 *
 * «ESTADO» ES OTRA COSA QUE «ENVIADO». PASADO = alguien ya digitó ese
 * renglón en el sistema oficial y lo marcó aquí a mano (queda en la base
 * con quién y cuándo). Un renglón nuevo —porque la ubicación se volvió a
 * contar— es otro renglón y sale POR PASAR: lo que se pasó fue lo de antes.
 *
 * DOS MONTONES Y DOS PESTAÑAS. La base es lo ENVIADO: firmado con
 * nombre, fecha y hora, y ya sin poderse corregir. Los borradores son lo
 * que alguien tiene abierto AHORA MISMO, y están aquí solo para mirar:
 * no se cruzan, no suman en ningún total y no se tocan. Mezclarlos sería
 * el error caro: un renglón a medio contar sumando en un total del que
 * alguien despacha no da error, no avisa, y la diferencia aparece
 * semanas después cuando ya nadie sabe de dónde salió.
 *
 * LA TABLA ES CORTA y la hoja entera —las veintiséis columnas— está a un
 * botón («Ver todas las columnas»). Lo que se baja a Excel son las
 * veintiséis más Estado, filtradas y ordenadas igual que lo que se ve.
 *
 * LA ÚNICA EXCEPCIÓN A «NO SE TOCA»: quien administra la plataforma
 * puede ELIMINAR renglones o FEFO enteros de lo ENVIADO desde
 * «⋯ Administrador» (el que sobra, el de otro día que quedó metido en el
 * recorrido). Pide confirmar y la base lo vuelve a comprobar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Renglon, ConteoFefo } from "@/modulos/inventario/fefo";
import { cruzar, sufijoRecorrido, type Vigente } from "@/modulos/inventario/base-cruce";
import { EliminarFefos } from "./EliminarFefos";
import { QuitarRenglones } from "./QuitarRenglones";
import { MarcarPasados } from "./MarcarPasados";
import { Calendario, type Atajo } from "@/components/CalendarioRango";
import { sumarDias } from "@/modulos/inventario/fiscal";
import { leerPaleta } from "../informe";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const POR_PAGINA = 100;
const TZ = "America/Bogota";

/** Un renglón de la tabla: el que vale (o el borrador) con lo que hace falta para pintarlo, calculado una vez. */
type Fila = Vigente & {
  pasado: boolean;
  unidades: number | null;
  quien: string;
  /** Cuándo se ENVIÓ el recorrido (fecha y hora reales). Vacío si todavía no se envía: no se inventa una hora. */
  cuando: string;
  /** Lo que se escribe cuando no hay hora de envío: «sin enviar · abierto 1 oct» (borrador) o solo «1 oct» (viejo, sin hora). */
  sinEnvio: string;
  /** Día AAAA-MM-DD del recorrido, para ordenar cuando no hay hora de envío. */
  dia: string;
  /** «-03», o «30/09 -01» si no es del día más reciente de los escogidos. */
  etiqueta: string;
  /** Lo que dice debajo del recorrido: «Reemplazó a -01 (9:12)». */
  reemplazo: string | null;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «1 oct», en hora de Colombia. Los meses van escritos: `toLocaleDateString` de es-CO devuelve «1 de oct» y
 *  «30 de sept», y la maqueta —y el ojo de quien cuadra— quiere «1 oct» y «30 sep». */
const diaCorto = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "numeric" }).formatToParts(new Date(iso));
  return `${Number(p.find((x) => x.type === "day")?.value)} ${MESES[Number(p.find((x) => x.type === "month")?.value) - 1]}`;
};
/** «9:34», 24 horas, en hora de Colombia. */
const hora = (iso: string | null) => {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso));
  return `${Number(p.find((x) => x.type === "hour")?.value)}:${p.find((x) => x.type === "minute")?.value}`;
};
/** «30 sep» de un día AAAA-MM-DD (sin hora: no pasa por el huso). */
const diaDe = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const rangoTexto = (d: string, h: string) => {
  const y = (f: string) => f.slice(0, 4);
  return d === h ? `${diaDe(d)} ${y(d)}` : y(d) === y(h) ? `${diaDe(d)} – ${diaDe(h)} ${y(h)}` : `${diaDe(d)} ${y(d)} – ${diaDe(h)} ${y(h)}`;
};

const fecha = (s: string | null) =>
  s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-CO") : "";
const fechaHora = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "";
const siNo = (v: boolean | null) => (v == null ? "" : v ? "Sí" : "No");

/* ---------------------------------------------------------------------
   LAS COLUMNAS, COMO DATOS Y NO COMO JSX

   Escritas a mano en el `<thead>`, otra vez en el `<tbody>` y otra vez en
   el CSV serían TRES listas que hay que acordarse de cambiar juntas — y la
   que se olvida no da error: saca la tabla con una columna corrida, con
   los títulos de una y los datos de la de al lado. Aquí hay una sola
   lista por vista y las tres cosas salen de ella.

   `texto` sirve para la celda Y para el Excel: así lo que se baja es
   exactamente lo que se ve, no una segunda versión con otro formato.
   `valor` solo existe donde ordenar por el texto daría un orden raro —un
   número se ordena como número y una fecha como fecha, no alfabéticamente.
   --------------------------------------------------------------------- */
type Col<T> = {
  k: string;
  t: string;
  num?: boolean;
  texto: (r: T) => string;
  valor?: (r: T) => number | string;
  pinta?: (r: T) => ReactNode;
};

const COLUMNAS: Col<Renglon>[] = [
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
function bajar(filas: Fila[], columnas: Col<Fila>[], nombre: string) {
  const escapa = (v: string) =>
    /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lineas = [
    "sep=;",
    columnas.map((c) => escapa(c.t)).join(";"),
    ...filas.map((r) => columnas.map((c) => escapa(c.texto(r))).join(";")),
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


/* Las columnas de la tabla CORTA. Las veintiséis están en COLUMNAS. */
const ubi = (r: Renglon) => r.ubicacion_combinada ?? r.ubicacion ?? "";
const CORTAS: Col<Fila>[] = [
  { k: "ub", t: "Ubicación", texto: ubi, pinta: (r) => <span className="ba-ub">{ubi(r) || "—"}</span> },
  { k: "material", t: "Material", texto: (r) => r.material,
    pinta: (r) => (
      <span className="ba-mat">
        <b>{r.material}</b>
        <small>{r.codigo} · {r.tipo_material === "ENVASE" ? "envase" : "producto"}</small>
      </span>
    ) },
  { k: "estibas", t: "Estibas", num: true, texto: (r) => String(r.total_estibas ?? 0),
    valor: (r) => Number(r.total_estibas ?? 0) },
  { k: "cajas", t: "Cajas", num: true, texto: (r) => String(r.total_cajas), valor: (r) => Number(r.total_cajas),
    pinta: (r) => (
      <span className="ba-cajas">
        {nf.format(Number(r.total_cajas))}
        {r.antes != null && <s>antes {nf.format(r.antes)}</s>}
      </span>
    ) },
  { k: "unidades", t: "Unidades", num: true, texto: (r) => (r.unidades == null ? "" : String(r.unidades)),
    valor: (r) => r.unidades ?? -1,
    pinta: (r) => (r.unidades == null ? <span className="ba-sin" title="El maestro no trae unidades por caja de este material">—</span> : nf.format(r.unidades)) },
  { k: "recorrido", t: "Recorrido que vale", texto: (r) => r.conteo, valor: (r) => r.cuando || r.dia,
    pinta: (r) => (
      <span className="ba-rec">
        <span className="ba-tag-fila">
          <span className={"ba-tag" + (r.reemplaza ? " nuevo" : "")}>{r.etiqueta}</span>
          {r.cuando ? <> {diaCorto(r.cuando)} {hora(r.cuando)}</> : r.sinEnvio ? <> <span className="ba-sinenvio">{r.sinEnvio}</span></> : null}
        </span>
        <small>{r.quien}</small>
        {r.reemplazo && <span className="ba-reemplazo">{r.reemplazo}</span>}
      </span>
    ) },
];
const ESTADO: Col<Fila> = {
  k: "estado", t: "Estado", texto: (r) => (r.pasado ? "PASADO" : "POR PASAR"), valor: (r) => (r.pasado ? 1 : 0),
  pinta: (r) => <span className={r.pasado ? "ba-pas" : "ba-pen"}>{r.pasado ? "PASADO" : "POR PASAR"}</span>,
};

export function Base({
  enviadas, abiertas, conteos, tope, manda = false, bodega = null, uxc = {},
  pasados = [], pasadosOk = true, puedeMarcar = false,
}: {
  enviadas: Renglon[]; abiertas: Renglon[]; conteos: ConteoFefo[]; tope: boolean;
  /** Quien administra la plataforma: es el único que puede eliminar FEFOs y renglones. */
  manda?: boolean;
  /** Código de la bodega, para el título. */
  bodega?: string | null;
  /** Unidades por caja, por código de material (del maestro). */
  uxc?: Record<string, number | null>;
  /** Ids de los renglones que ya se pasaron al sistema oficial. */
  pasados?: string[];
  /** false = todavía no se corrió el SQL de «pasados»: se dice y no se deja marcar. */
  pasadosOk?: boolean;
  /** Puede editar «La base» (o administra): ve las casillas y marca PASADO. */
  puedeMarcar?: boolean;
}) {
  const [pestania, setPestania] = useState<"base" | "borradores">("base");
  const [fTexto, setFTexto] = useState("");
  const [fRec, setFRec] = useState("");
  const [fCalle, setFCalle] = useState("");
  const [fModulo, setFModulo] = useState("");
  /* QUIÉN CONTÓ: las personas que se escogieron, una a una (vacío = todas). Se guarda el nombre porque
     una misma persona puede tener varios recorridos y se quiere ver todo lo suyo junto. */
  const [fQuien, setFQuien] = useState<ReadonlySet<string>>(new Set());
  /* PRODUCTO O ENVASE: son los dos mundos de esta bodega y casi nunca se miran juntos. Va en botones
     y no en un desplegable porque es la primera pregunta sobre la base, y porque un desplegable cerrado
     no dice cuál está puesto. */
  const [fTipo, setFTipo] = useState<"" | "PRODUCTO" | "ENVASE">("");
  const [completa, setCompleta] = useState(false);
  const [pag, setPag] = useState(0);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [admin, setAdmin] = useState(false);
  /* El orden arranca por ubicación, que es el orden en que se camina la bodega y el de la hoja. */
  const [orden, setOrden] = useState<{ k: string; asc: boolean }>({ k: "ub", asc: true });
  const [bajando, setBajando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  /* ============== QUÉ RECORRIDOS SE CRUZAN ============== */
  const dias = useMemo(() => {
    const m = new Set<string>();
    for (const c of conteos) if (c.estado === "cerrado" && c.fecha_analisis) m.add(c.fecha_analisis);
    return m;
  }, [conteos]);
  const ordenados = useMemo(() => [...dias].sort(), [dias]);
  const minF = ordenados[0] ?? "";
  const maxF = ordenados[ordenados.length - 1] ?? "";
  /* Arranca en el ÚLTIMO día con algo enviado: la pregunta de todos los días es «¿cómo quedó lo de ayer?»,
     y con meses de conteos, entrar a «todo» son miles de renglones cada vez. */
  const [rango, setRango] = useState<[string, string] | null>(null);
  const [desde, hasta] = rango && rango[0] >= minF && rango[1] <= maxF ? rango : [maxF, maxF];
  const atajos = useMemo<Atajo[]>(() => [
    { t: "Último día enviado", d: () => [maxF, maxF] },
    { t: "Últimos 7 días", d: () => [sumarDias(maxF, -6) < minF ? minF : sumarDias(maxF, -6), maxF] },
    { t: "Este mes", d: () => [maxF.slice(0, 8) + "01" < minF ? minF : maxF.slice(0, 8) + "01", maxF] },
    { t: "Todo lo enviado", d: () => [minF, maxF] },
  ], [minF, maxF]);

  /* LAS FICHAS: los recorridos enviados de esos días. Se guardan los QUITADOS y no los puestos: al
     cambiar de período arranca otra vez con todos. */
  const [quitados, setQuitados] = useState<ReadonlySet<string>>(new Set());
  const delPeriodo = useMemo(() => conteos
    .filter((c) => c.estado === "cerrado" && !!c.fecha_analisis && c.fecha_analisis >= desde && c.fecha_analisis <= hasta)
    /* El más nuevo primero, dentro del día y entre días: se entra a mirar lo de ayer. */
    .sort((a, b) => (b.fecha_analisis ?? "").localeCompare(a.fecha_analisis ?? "")
      || (b.enviado_en ?? "").localeCompare(a.enviado_en ?? "")
      || b.codigo.localeCompare(a.codigo, "es", { numeric: true })), [conteos, desde, hasta]);
  const incluidos = useMemo(() => delPeriodo.filter((c) => !quitados.has(c.id)), [delPeriodo, quitados]);
  const alterna = (id: string) =>
    setQuitados((x) => { const y = new Set(x); if (y.has(id)) y.delete(id); else y.add(id); return y });

  /* EL CRUCE: de cada ubicación vale el último recorrido que pasó por ella. */
  const cruce = useMemo(() => {
    const ids = new Set(incluidos.map((c) => c.id));
    return cruzar(enviadas.filter((r) => ids.has(r.conteo_id)), incluidos);
  }, [enviadas, incluidos]);

  const porId = useMemo(() => new Map(conteos.map((c) => [c.id, c])), [conteos]);
  const yaPasados = useMemo(() => new Set(pasados), [pasados]);
  const diaTope = incluidos.reduce((m, c) => ((c.fecha_analisis ?? "") > m ? (c.fecha_analisis ?? "") : m), "");

  const enriquecer = (r: Vigente): Fila => {
    const c = porId.get(r.conteo_id);
    const f = c?.fecha_analisis ?? "";
    const suf = sufijoRecorrido(r.conteo);
    const u = uxc[r.codigo];
    const rp = r.reemplaza;
    const cp = rp ? porId.get(rp.conteoId) : null;
    return {
      ...r,
      pasado: yaPasados.has(r.id),
      unidades: u ? Number(r.total_cajas) * u : null,
      quien: c?.envio_nombre ?? c?.responsable ?? "—",
      cuando: c?.enviado_en ?? "",
      dia: f,
      sinEnvio: c?.enviado_en || !f ? "" : c?.estado === "cerrado" ? diaDe(f) : `sin enviar · abierto ${diaDe(f)}`,
      etiqueta: !f || f === diaTope ? suf : `${ddmm(f)} ${suf}`,
      reemplazo: rp
        ? `Reemplazó a ${cp?.fecha_analisis && cp.fecha_analisis !== f ? ddmm(cp.fecha_analisis) + " " : ""}${sufijoRecorrido(rp.conteo)}${rp.cuando ? ` (${hora(rp.cuando)})` : ""}`
        : null,
    };
  };

  /* LAS FILAS DE ESTA PESTAÑA, antes de filtrar. Los borradores NO se cruzan: son lo que alguien tiene
     abierto, y cruzarlos los haría pasar por lo contado. */
  const crudas = useMemo<Fila[]>(() => pestania === "base"
    ? cruce.vigentes.map(enriquecer)
    : abiertas.map((r) => enriquecer({ ...r, reemplaza: null, antes: null })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [pestania, cruce, abiertas, porId, yaPasados, uxc, diaTope]);

  const recorridosDe = pestania === "base" ? incluidos
    : conteos.filter((c) => c.estado === "en_proceso" || c.estado === "borrador");

  const calles = useMemo(
    () => [...new Set(crudas.map((r) => r.calle).filter(Boolean))].sort() as string[], [crudas]);
  const modulos = useMemo(
    () => [...new Set(crudas.filter((r) => fCalle === "" || r.calle === fCalle)
      .map((r) => r.ubicacion).filter(Boolean))].sort() as string[], [crudas, fCalle]);

  /* Lo que pasa los demás filtros, SIN mirar quién: de ahí salen los números de cada persona. */
  const sinQuien = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    return crudas.filter((r) => {
      if (q && !`${r.codigo} ${r.material} ${r.familia ?? ""} ${r.nota ?? ""}`.toLowerCase().includes(q)) return false;
      if (fRec && r.conteo_id !== fRec) return false;
      if (fCalle && r.calle !== fCalle) return false;
      if (fModulo && r.ubicacion !== fModulo) return false;
      return true;
    });
  }, [crudas, fTexto, fRec, fCalle, fModulo]);
  /* LAS PERSONAS: todas las que tienen un recorrido en esta pestaña, aunque todavía no tengan ni un
     renglón guardado (sale «0»: así se ve que está abierto pero vacío, y no que «faltó»). */
  const personas = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of recorridosDe) m.set(c.envio_nombre ?? c.responsable ?? "—", 0);
    for (const r of sinQuien) if (!fTipo || r.tipo_material === fTipo) m.set(r.quien, (m.get(r.quien) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [recorridosDe, sinQuien, fTipo]);
  const todasN = fTipo ? sinQuien.filter((r) => r.tipo_material === fTipo).length : sinQuien.length;
  const sinTipo = useMemo(
    () => (fQuien.size ? sinQuien.filter((r) => fQuien.has(r.quien)) : sinQuien), [sinQuien, fQuien]);
  const alternaQuien = (n: string) => setFQuien((a) => { const x = new Set(a); if (x.has(n)) x.delete(n); else x.add(n); return x });
  /* CUÁNTOS HAY DE CADA UNO, en lo que queda después de los demás filtros: un botón «Envase» que lleva a
     una tabla vacía hace dudar de si se perdió algo; con la cifra al lado se ve que no hay nada que buscar. */
  const porTipo = {
    "": sinTipo.length,
    PRODUCTO: sinTipo.filter((r) => r.tipo_material === "PRODUCTO").length,
    ENVASE: sinTipo.filter((r) => r.tipo_material === "ENVASE").length,
  } as Record<string, number>;

  const columnas: Col<Fila>[] = useMemo(() => {
    const base: Col<Fila>[] = completa ? (COLUMNAS as Col<Fila>[]) : CORTAS;
    return pestania === "base" ? [...base, ESTADO] : base;
  }, [completa, pestania]);

  const filas = useMemo(() => {
    const vistas = fTipo ? sinTipo.filter((r) => r.tipo_material === fTipo) : sinTipo;
    const col = columnas.find((c) => c.k === orden.k)
      ?? (COLUMNAS.some((c) => c.k === orden.k) ? (COLUMNAS.find((c) => c.k === orden.k) as Col<Fila>) : columnas[0]);
    /* Se ordena sobre una COPIA: `sort` muta, y mutar aquí reordenaría el arreglo del cruce. */
    return [...vistas].sort((a, b) => {
      const va = col.valor ? col.valor(a) : col.texto(a);
      const vb = col.valor ? col.valor(b) : col.texto(b);
      const c = typeof va === "number" && typeof vb === "number"
        ? va - vb : String(va).localeCompare(String(vb), "es", { numeric: true });
      return orden.asc ? c : -c;
    });
  }, [sinTipo, fTipo, orden, columnas]);

  const firma = `${pestania}|${fTexto}|${fRec}|${fCalle}|${fModulo}|${fTipo}|${[...fQuien].join(",")}|${orden.k}${orden.asc}|${desde}|${hasta}|${[...quitados].join(",")}`;
  useEffect(() => { setPag(0) }, [firma]);
  const ultima = Math.max(0, Math.ceil(filas.length / POR_PAGINA) - 1);
  const pagina = Math.min(pag, ultima);
  const visibles = filas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  const filtrando = fTexto.trim() !== "" || fCalle !== "" || fModulo !== "" || fRec !== "" || fTipo !== "" || fQuien.size > 0;
  const cajas = filas.reduce((a, r) => a + Number(r.total_cajas), 0);

  /* LAS CIFRAS DE ARRIBA son las de la base ya cruzada, sin los filtros de la tabla: «Renglones» dice
     cuántos hay después de cruzar, no cuántos pasaron por la búsqueda. */
  const kp = useMemo(() => ({
    renglones: cruce.vigentes.length,
    cajas: cruce.vigentes.reduce((a, r) => a + Number(r.total_cajas), 0),
    ubicaciones: new Set(cruce.vigentes.map((r) => r.ubicacion_id ?? r.ubicacion ?? "—")).size,
    repetidas: cruce.repetidas,
  }), [cruce]);

  /* ============== SELECCIÓN ============== */
  const hayCasillas = pestania === "base" && (puedeMarcar || manda);
  /* Solo cuentan los marcados que SE VEN: si un filtro esconde uno, no se manda a cambiar a ciegas. */
  const elegidos = hayCasillas ? filas.filter((r) => marcados.has(r.id)) : [];
  const marcar = (id: string) =>
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n });
  const todosMarcados = visibles.length > 0 && visibles.every((r) => marcados.has(r.id));
  const ordenarPor = (k: string) => setOrden((o) => (o.k === k ? { k, asc: !o.asc } : { k, asc: true }));

  /* ============== EL CONSOLIDADO (Excel de 6 hojas, lo arma el servidor) ============== */
  async function exportar() {
    if (!desde || !incluidos.length) return;
    setBajando(true); setMal(null);
    try {
      const todos = incluidos.length === delPeriodo.length;
      /* LOS COLORES DEL TEMA de quien exporta: la tinta y el color de la banda. */
      const P = leerPaleta(raiz.current);
      const hx = (c: number[]) => c.map((v) => v.toString(16).padStart(2, "0")).join("");
      const r = await fetch(`/api/inventario/exportar?desde=${desde}&hasta=${hasta}` + (todos ? "" : `&ids=${incluidos.map((c) => c.id).join(",")}`)
        + `&tinta=${hx(P.tinta)}&banda=${hx(P.cinta[1]?.[1] ?? P.acento)}`);
      if (!r.ok) { const j = await r.json().catch(() => null); setMal(j?.error ?? `No se pudo (${r.status}).`); return }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `inventario-consolidado-${desde === hasta ? desde : `${desde}_${hasta}`}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch { setMal("Se cortó la conexión con el servidor.") }
    finally { setBajando(false) }
  }

  const quitarFiltros = () => { setFTexto(""); setFRec(""); setFCalle(""); setFModulo(""); setFTipo(""); setFQuien(new Set()) };
  const hayEnviados = dias.size > 0;
  const abiertosN = recorridosDe.length;

  return (
    <div className="ba" ref={raiz}>
      {/* ================= CABECERA ================= */}
      <header className="ba-cab">
        <div>
          <p className="ba-eti">Inventario{bodega ? <> · Bodega {bodega}</> : null}</p>
          <h1>La base</h1>
          <p className="ba-sub">Todo lo contado, renglón por renglón. Solo entran recorridos <b>enviados</b>.</p>
        </div>
        <div className="ba-acc">
          {manda && (
            <button type="button" className="ba-sec ba-adm" aria-expanded={admin} onClick={() => setAdmin((x) => !x)}>
              ⋯ Administrador
            </button>
          )}
          <button type="button" className="ba-sec" disabled={filas.length === 0}
                  /* EL NOMBRE DEL ARCHIVO DICE QUÉ TRAE: bajando tres vistas seguidas salían tres archivos
                     con el mismo nombre y un (1) y un (2) detrás. */
                  onClick={() => bajar(filas, [...COLUMNAS as Col<Fila>[], ...(pestania === "base" ? [ESTADO] : [])], [
                    "conteo", pestania, pestania === "base" ? (desde === hasta ? desde : `${desde}_${hasta}`) : null,
                    fTipo ? fTipo.toLowerCase() : null, new Date().toISOString().slice(0, 10),
                  ].filter(Boolean).join("-") + ".csv")}>
            ↓ Bajar esta vista
          </button>
          <button type="button" className="ba-prim" onClick={exportar} disabled={bajando || !incluidos.length}
                  title={!hayEnviados ? "Todavía no hay recorridos enviados" : !incluidos.length ? "Marca al menos un recorrido" : undefined}>
            {bajando ? "Armando el Excel…" : "↓ Exportar consolidado"}
          </button>
        </div>
      </header>
      {mal && <p className="ba-error" role="alert">{mal}</p>}

      {/* ============ ADMINISTRADOR: eliminar FEFO enteros o renglones sueltos ============ */}
      {manda && admin && (
        <section className="ba-admin" aria-label="Administrador">
          <EliminarFefos conteos={conteos} />
          {pestania === "base" && <QuitarRenglones elegidos={elegidos} alQuitar={() => setMarcados(new Set())} />}
        </section>
      )}

      {tope && (
        <p className="ba-tope">
          <b>Se llegó al tope de filas que esta pantalla trae de una.</b> Lo que ves está
          bien, pero no está todo: faltan los recorridos más viejos. Si hace falta llegar a
          ellos, hay que sacarlos por rango de fechas — dímelo y lo agrego.
        </p>
      )}

      {/* ================= QUÉ RECORRIDOS: calendario + fichas =================
          Va ANTES de los filtros porque es de otra clase de pregunta: los filtros recortan una tabla;
          esto decide CUÁL. Y cada ficha lleva su código y su hora de envío —no solo la fecha—: el mismo
          día puede tener tres recorridos y «1 oct» repetido tres veces no distingue nada. */}
      {pestania === "base" && hayEnviados && (
        <section className="ba-ctrl" aria-label="Qué recorridos se cruzan">
          <div className="ba-cal">
            <Calendario desde={desde} hasta={hasta} minF={minF} maxF={maxF} atajos={atajos} marcados={dias} unDia flechaAntesEnMovil
                        aplicar={(d, h) => { setRango([d, h]); setQuitados(new Set()) }} />
          </div>
          <div className="ba-fichas" role="group" aria-label="Recorridos enviados del período">
            {delPeriodo.length === 0 && <span className="ba-nada">Sin recorridos enviados en esas fechas.</span>}
            {delPeriodo.map((c, i) => {
              const on = !quitados.has(c.id);
              const nuevo = i === 0 || delPeriodo[i - 1].fecha_analisis !== c.fecha_analisis;
              const act = cruce.actualiza.get(c.id); /* el cruce ya sale solo de las fichas marcadas */
              return (
                <span key={c.id} className="ba-ficha-gr">
                  {nuevo && <span className="ba-dl">{diaDe(c.fecha_analisis)}</span>}
                  <button type="button" aria-pressed={on} className={"ba-ch" + (on ? " on" : "") + (act ? " re" : "")}
                          title={`${c.envio_nombre ?? c.responsable ?? "—"} · ${nf.format(Number(c.renglones ?? 0))} rengl.`
                            + (act ? ` · actualiza ${act.ubicaciones} ubicaci${act.ubicaciones === 1 ? "ón" : "ones"} de ${act.de.map(sufijoRecorrido).join(", ")}` : "")}
                          onClick={() => alterna(c.id)}>
                    <i aria-hidden="true">{on ? "✓" : ""}</i>
                    <span className="ba-ch-cod">{sufijoRecorrido(c.codigo)}</span>
                    {c.enviado_en && <small>{hora(c.enviado_en)}</small>}
                  </button>
                </span>
              );
            })}
          </div>
          <div className="ba-cnt">
            <span>{incluidos.length} de {delPeriodo.length} recorrido{delPeriodo.length === 1 ? "" : "s"}</span>
            <button type="button" className="ba-link" disabled={quitados.size === 0}
                    onClick={() => setQuitados(new Set())}>Todos</button>
          </div>
        </section>
      )}

      {/* ================= LAS CUATRO CIFRAS ================= */}
      {pestania === "base" && hayEnviados && (
        <section className="ba-kp" aria-label="Resumen de la base cruzada">
          <div><span className="ba-eti">Renglones</span><b>{nf.format(kp.renglones)}</b><small>después de cruzar</small></div>
          <div><span className="ba-eti">Cajas</span><b>{nf.format(kp.cajas)}</b><small>en la base</small></div>
          <div><span className="ba-eti">Ubicaciones</span><b>{nf.format(kp.ubicaciones)}</b><small>distintas</small></div>
          <div className="az"><span className="ba-eti">Repetidas</span><b>{nf.format(kp.repetidas)}</b><small>vale el último conteo</small></div>
        </section>
      )}

      {/* QUÉ ES CADA PESTAÑA, ESCRITO. Sin esto, las dos son una tabla igual con números distintos, y ahí
          es donde alguien suma la equivocada. */}
      {pestania === "borradores" && (
        <p className="ba-dice ojo">
          Recorridos que alguien tiene <b>abiertos ahora mismo</b>
          {abiertosN > 0 && <> — {recorridosDe.map((c) => `${c.codigo} (${c.responsable ?? "?"})`).join(" · ")}</>}.
          Están aquí <b>solo para mirar</b>: no entran en la base, no se cruzan, no suman en ningún total y
          desde aquí no se tocan. Para corregir uno se entra a <b>Contar</b>, que es donde
          está el recorrido.
        </p>
      )}

      {/* ================= PESTAÑAS, BÚSQUEDA Y FILTROS ================= */}
      <div className="ba-barra">
        <div className="ba-tabs" role="tablist">
          {([["base", "La base", kp.renglones], ["borradores", "Borradores", abiertas.length]] as const).map(([k, t, n]) => (
            <button key={k} type="button" role="tab" aria-selected={pestania === k} className={pestania === k ? "on" : ""}
                    onClick={() => { setPestania(k); setFRec(""); setFCalle(""); setFModulo(""); setFQuien(new Set()); setMarcados(new Set()) }}>
              {t}<i>{nf.format(n)}</i>
            </button>
          ))}
        </div>
        <label className="ba-busca">
          <span className="sr">Buscar por código, material, familia u observación</span>
          <span aria-hidden="true">⌕</span>
          <input value={fTexto} onChange={(e) => setFTexto(e.target.value)}
                 placeholder="Código, material, familia u observación…" />
        </label>
        <div className="ba-seg" role="group" aria-label="Producto o envase">
          {([["", "Todo"], ["PRODUCTO", "Producto"], ["ENVASE", "Envase"]] as const).map(([v, t]) => (
            <button key={v || "todo"} type="button" aria-pressed={fTipo === v} className={fTipo === v ? "on" : ""}
                    onClick={() => setFTipo(v)}>
              {t}<i>{nf.format(porTipo[v] ?? 0)}</i>
            </button>
          ))}
        </div>
        <label className="ba-sel">
          <span className="sr">Recorrido</span>
          <select value={fRec} onChange={(e) => setFRec(e.target.value)}>
            <option value="">Recorrido</option>
            {recorridosDe.map((c) => <option key={c.id} value={c.id}>{c.fecha_analisis ? ddmm(c.fecha_analisis) + " " : ""}{sufijoRecorrido(c.codigo)}</option>)}
          </select>
        </label>
        <label className="ba-sel">
          <span className="sr">Calle</span>
          <select value={fCalle} onChange={(e) => { setFCalle(e.target.value); setFModulo("") }}>
            <option value="">Calle</option>
            {calles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="ba-sel">
          <span className="sr">Módulo</span>
          <select value={fModulo} onChange={(e) => setFModulo(e.target.value)}>
            <option value="">Módulo</option>
            {modulos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {filtrando && <button type="button" className="ba-sec" onClick={quitarFiltros}>Quitar filtros</button>}
      </div>

      {/* ================= QUIÉN CONTÓ: una persona, varias, o todas ================= */}
      {personas.length > 0 && (
        <div className="ba-quien" role="group" aria-label="Filtrar por quién contó">
          <span className="ba-quien-t">{pestania === "base" ? "Envió" : "Está contando"}</span>
          <button type="button" aria-pressed={fQuien.size === 0} className={"ba-qn" + (fQuien.size === 0 ? " on" : "")}
                  onClick={() => setFQuien(new Set())}>
            Todas<i>{nf.format(todasN)}</i>
          </button>
          {personas.map(([n, k]) => (
            <button key={n} type="button" aria-pressed={fQuien.has(n)} className={"ba-qn" + (fQuien.has(n) ? " on" : "")}
                    onClick={() => alternaQuien(n)}>
              {n}<i>{nf.format(k)}</i>
            </button>
          ))}
        </div>
      )}

      {pestania === "base" && puedeMarcar && (pasadosOk
        ? <MarcarPasados elegidos={elegidos} pasados={yaPasados} alCambiar={() => setMarcados(new Set())} />
        : <p className="ba-tope" role="alert">
            Para marcar renglones como <b>PASADO</b> falta correr en Supabase{" "}
            <code>supabase/migraciones/2026-10-base-pasados.sql</code>.
          </p>)}

      {/* ================= LA TABLA ================= */}
      <section className="ba-tabla">
        <div className="ba-th">
          <span>
            Mostrando <b>{nf.format(filas.length)}</b> {filas.length === 1 ? "renglón" : "renglones"}
            {filtrando && <> de {nf.format(crudas.length)}</>} · <b>{nf.format(cajas)}</b> cajas
          </span>
          <button type="button" className="ba-link" aria-pressed={completa} onClick={() => setCompleta((x) => !x)}>
            {completa ? "Ver menos columnas" : "Ver todas las columnas"}
          </button>
        </div>

        {filas.length === 0 ? (
          <p className="ba-vacio">
            {crudas.length === 0
              ? pestania === "base"
                ? hayEnviados
                  ? "Con los recorridos marcados no hay ningún renglón."
                  : "Todavía no hay ningún recorrido enviado. Lo que se anota en Contar entra aquí cuando se envía."
                : "Nadie tiene un recorrido abierto en este momento."
              : "Ningún renglón coincide con el filtro."}
          </p>
        ) : (
          /* LA TABLA SE DESPLAZA DENTRO DE SU CAJA, no arrastrando la página: en el celular la tabla corta
             tampoco cabe, y una página que se va de lado deja el menú y los filtros inalcanzables. */
          <div className="ba-marco">
            <table className="ba-t">
              <thead>
                <tr>
                  {hayCasillas && (
                    <th className="ba-chk">
                      <input type="checkbox" checked={todosMarcados}
                             aria-label="Marcar todos los renglones de esta página"
                             onChange={() => setMarcados((m) => {
                               const n = new Set(m);
                               if (todosMarcados) visibles.forEach((r) => n.delete(r.id)); else visibles.forEach((r) => n.add(r.id));
                               return n;
                             })} />
                    </th>
                  )}
                  {columnas.map((c) => (
                    <th key={c.k} className={c.num ? "num" : undefined}
                        aria-sort={orden.k === c.k ? (orden.asc ? "ascending" : "descending") : "none"}>
                      <button type="button" onClick={() => ordenarPor(c.k)}>
                        {c.t}<i aria-hidden="true">{orden.k === c.k ? (orden.asc ? "▲" : "▼") : ""}</i>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr key={r.id} className={hayCasillas && marcados.has(r.id) ? "marcado" : undefined}>
                    {hayCasillas && (
                      <td className="ba-chk">
                        <input type="checkbox" checked={marcados.has(r.id)} onChange={() => marcar(r.id)}
                               aria-label={`Marcar el renglón ${ubi(r)} · ${r.codigo} (${r.conteo})`} />
                      </td>
                    )}
                    {columnas.map((c) => (
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

        <div className="ba-pie">
          <span>
            {filas.length === 0 ? "0" : `${nf.format(pagina * POR_PAGINA + 1)}–${nf.format(Math.min(filas.length, (pagina + 1) * POR_PAGINA))}`} de {nf.format(filas.length)}
          </span>
          {ultima > 0 && (
            <span className="ba-pags">
              <button type="button" className="ba-sec" disabled={pagina === 0} onClick={() => setPag(pagina - 1)}>← Anterior</button>
              <button type="button" className="ba-sec" disabled={pagina >= ultima} onClick={() => setPag(pagina + 1)}>Siguiente →</button>
            </span>
          )}
          <span className="ba-pista">
            {pestania !== "base" ? ""
              : manda ? "Marca renglones para eliminarlos desde ⋯ Administrador"
              : puedeMarcar ? "Marca renglones para dejarlos como PASADO" : ""}
          </span>
        </div>
      </section>
    </div>
  );
}
