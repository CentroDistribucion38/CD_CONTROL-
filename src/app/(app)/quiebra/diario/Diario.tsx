"use client";

/**
 * QUIEBRA DIARIA — el segundo tablero.
 *
 * Es el mismo tablero de siempre, pero de la hoja QUIEBRA DIARIA: el mes
 * abierto día por día, con la meta, el Pareto de causales y el detalle,
 * y con UN día seleccionado que se puede escribir a mano abajo. Todo el
 * tablero se recalcula mientras se teclea, así se ve el efecto de la
 * cifra antes de guardarla.
 *
 * La regla de oro, que se ve en toda la pantalla:
 *   SAP y lo escrito a mano son DOS columnas, no una.
 * Importar vuelve a llenar la columna de SAP y no toca la otra. Lo
 * escrito manda al calcular, y cuando las dos no coinciden la pantalla
 * lo dice en vez de esconderlo. Así nadie pierde lo que tecleó a las
 * 6 a.m. porque a las 10 alguien subió el maestro, y nadie reporta una
 * cifra escrita a mano sin enterarse de que SAP dice otra cosa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  CAUSALES,
  NOMBRE_HOJA,
  leerRango,
  rangoDelMes,
  type DatosDiario,
} from "@/modulos/quiebra/diario";
import { Calendario } from "@/components/CalendarioRango";
import { TablaAnio } from "@/components/TablaAnio";
import { Rejilla, type ColumnaDia, type Campo } from "./Rejilla";

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio",
                     "agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_SEM = ["L","M","M","J","V","S","D"];

/** El color va atado al NOMBRE de la causal, igual que en el otro tablero:
 *  si mañana una causal sube o baja en el ranking, no se le cambia el color. */
const COLOR_CAUSAL: Record<string, string> = {
  "Sorting distribución": "#E4002B",
  "Presorting": "#B8001F",
  "Rotura máquina": "#8E0018",
  "Sorting envase": "#E9A81F",
  "Lavado / extrasucio": "#C58A12",
  "Otros": "#9AA9BB",
  "Rotura depósito": "#C6D0DC",
};
const color = (c: string) => COLOR_CAUSAL[c] ?? "#7E8CA0";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pf = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(d).replace(".", ",") + "%";

const partes = (f: string) => ({
  a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1, d: Number(f.slice(8, 10)),
});
const aTexto = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const bonita = (f: string) => {
  const { a, m, d } = partes(f);
  return `${d} de ${MESES_LARGO[m]} de ${a}`;
};
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
const primerDia = (a: number, m: number) => (new Date(Date.UTC(a, m, 1)).getUTCDay() + 6) % 7;
const mesDe = (f: string) => `${f.slice(0, 7)}-01`;

/** Corre un día sin pasar por Date y sin líos de zona horaria. */
function correr(f: string, paso: number): string {
  const { a, m, d } = partes(f);
  return new Date(Date.UTC(a, m, d + paso)).toISOString().slice(0, 10);
}

/** El lunes de la semana de esa fecha. La semana aquí empieza en lunes. */
function lunesDe(f: string): string {
  const { a, m, d } = partes(f);
  const dow = (new Date(Date.UTC(a, m, d)).getUTCDay() + 6) % 7; // 0 = lunes
  return correr(f, -dow);
}

/** Atajos para marcar días de un golpe. Marcar a mano también vale. */
type Atajo = "dia" | "semana" | "todos";

const bonitaCorta = (f: string) => {
  const { m, d } = partes(f);
  return `${d} ${MESES[m].toLowerCase()}`;
};

/** "22 – 28 sep 2026", y si el rango se monta en dos meses, los dos. */
function rangoBonito(desde: string, hasta: string): string {
  const a = partes(desde), b = partes(hasta);
  if (a.m === b.m && a.a === b.a) return `${a.d} – ${b.d} ${MESES[a.m].toLowerCase()} ${a.a}`;
  const ini = `${a.d} ${MESES[a.m].toLowerCase()}${a.a !== b.a ? ` ${a.a}` : ""}`;
  return `${ini} – ${b.d} ${MESES[b.m].toLowerCase()} ${b.a}`;
}
/**
 * Lee un número escrito como se escribe aquí: 12.400 son doce mil
 * cuatrocientos y 12,5 son doce y medio. Si el punto no está separando
 * miles (1.5), se toma como decimal para no inventar un 15.
 */
function aNumero(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const limpio = t.replace(/[^\d.,-]/g, "");
  if (limpio === "" || limpio === "-") return null;
  let normal: string;
  if (limpio.includes(",")) normal = limpio.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpio)) normal = limpio.replace(/\./g, "");
  else normal = limpio;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

const texto = (v: number | null | undefined) =>
  v == null ? "" : String(Math.round(v * 1000) / 1000).replace(".", ",");

/* ===================================================================
   LO QUE HAY ESCRITO EN LAS CASILLAS.

   Se guarda como TEXTO, no como número: mientras se teclea "1.2" todavía
   no es un número, y convertirlo en cada letra pelea con el cursor.

   Un día entra al mapa la primera vez que se le toca una casilla, y
   entra COMPLETO (sembrado con lo que ya estaba guardado). Así comparar
   "lo que hay" contra "lo que estaba" es comparar dos objetos de la
   misma forma, sin tener que adivinar qué campos se tocaron.
   =================================================================== */
type Edicion = {
  produccion: string;
  baja: string;
  le_produccion: string;
  le_baja: string;
  nota: string;
  causales: Record<string, string>;
};

const VACIA: Edicion = {
  produccion: "", baja: "", le_produccion: "", le_baja: "", nota: "", causales: {},
};

function guardadoDe(datos: DatosDiario, fecha: string): Edicion {
  const m = datos.manual[fecha];
  if (!m) return { ...VACIA, causales: {} };
  const causales: Record<string, string> = {};
  for (const c of CAUSALES) if (m.causales[c] != null) causales[c] = texto(m.causales[c]);
  return {
    produccion: texto(m.produccion),
    baja: texto(m.baja),
    le_produccion: texto(m.le_produccion),
    le_baja: texto(m.le_baja),
    nota: m.nota ?? "",
    causales,
  };
}

const igualEdicion = (a: Edicion, b: Edicion) =>
  a.produccion === b.produccion && a.baja === b.baja &&
  a.le_produccion === b.le_produccion && a.le_baja === b.le_baja &&
  a.nota === b.nota &&
  CAUSALES.every((c) => (a.causales[c] ?? "") === (b.causales[c] ?? ""));

/* ===================================================================
   Un día ya resuelto: qué cifra manda y de dónde salió.
   =================================================================== */
type Dia = {
  fecha: string;
  produccion: number;
  baja: number;
  pct: number | null;
  causales: Record<string, number>;
  origen: "escrito" | "sap" | "vacio";
};

/* =================================================================== */

type Props = {
  inicial: DatosDiario;
  fechaInicial: string;
  esEditor: boolean;
  hoy: string;
};

export function Diario({ inicial, fechaInicial, esEditor, hoy }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [datos, setDatos] = useState(inicial);
  /**
   * Tres cosas distintas, y conviene no confundirlas:
   *  · datos.desde/hasta — el RANGO que está en pantalla. Manda en las
   *    pastillas, las gráficas y la tabla.
   *  · elegidos          — los días MARCADOS dentro de ese rango. Mandan
   *    en el número grande, las cifras y el Pareto. Pueden ser uno,
   *    varios o ninguno (ninguno = todo el rango).
   *  · fecha             — el día que está abierto en la hoja de abajo.
   *    A mano se escribe UN día, así que la hoja necesita uno solo.
   */
  const [fecha, setFecha] = useState(fechaInicial);
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set([fechaInicial]));
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  /** Mapa fecha → lo escrito. Solo los días tocados están aquí. */
  const [edits, setEdits] = useState<Record<string, Edicion>>({});
  const [verDesglose, setVerDesglose] = useState(false);

  /** Lo que hay en las casillas de un día: lo tocado, o lo guardado. */
  const actual = useCallback(
    (f: string): Edicion => edits[f] ?? guardadoDe(datos, f),
    [edits, datos]
  );

  /** Los días cuyo contenido se aparta de lo guardado. */
  const tocados = useMemo(
    () => Object.keys(edits).filter((f) => !igualEdicion(edits[f], guardadoDe(datos, f))).sort(),
    [edits, datos]
  );
  const sucio = tocados.length > 0;

  const escribir = useCallback((f: string, campo: Campo, valor: string) => {
    setEdits((prev) => {
      const base = prev[f] ?? guardadoDe(datos, f);
      const n: Edicion = { ...base, causales: { ...base.causales } };
      if (campo === "produccion") n.produccion = valor;
      else if (campo === "baja") n.baja = valor;
      else n.causales[campo.causal] = valor;
      return { ...prev, [f]: n };
    });
  }, [datos]);

  const escribirCampo = useCallback((f: string, campo: "le_produccion" | "le_baja" | "nota", valor: string) => {
    setEdits((prev) => {
      const base = prev[f] ?? guardadoDe(datos, f);
      return { ...prev, [f]: { ...base, causales: { ...base.causales }, [campo]: valor } };
    });
  }, [datos]);

  const avisarSucio = useCallback(
    () => !sucio || confirm(
      `Hay ${tocados.length} día${tocados.length > 1 ? "s" : ""} sin guardar. ¿Salir de todos modos?`
    ),
    [sucio, tocados.length]
  );

  /** Trae otro rango del servidor. */
  const traer = useCallback(
    async (d: string, h: string, anclaNueva: string, marcar: Set<string>) => {
      setCargando(true);
      setAviso(null);
      try {
        const nuevo = await leerRango(supabase, d, h);
        setDatos(nuevo);
        setFecha(anclaNueva);
        setElegidos(marcar);
        setEdits({});
      } catch {
        setAviso({ mal: true, texto: "No se pudo leer el período. Revisa la conexión." });
      } finally {
        setCargando(false);
      }
    },
    [supabase]
  );

  /** Cambia el rango en pantalla. Si el día abierto se queda afuera, la
   *  hoja se pasa al primer día del rango nuevo. */
  const cambiarRango = useCallback(
    (d: string, h: string) => {
      if (!avisarSucio()) return;
      const ancla = fecha >= d && fecha <= h ? fecha : d;
      traer(d, h, ancla, new Set([ancla]));
    },
    [avisarSucio, fecha, traer]
  );

  /** Abre un día en la hoja. Si cae fuera del rango, el rango se corre a
   *  su mes: si no, se estaría editando algo que no se ve. */
  const irA = useCallback(
    (f: string) => {
      if (!avisarSucio()) return;
      setAviso(null);
      if (f < datos.desde || f > datos.hasta) {
        const [d, h] = rangoDelMes(f);
        traer(d, h, f, new Set([f]));
        return;
      }
      setFecha(f);
      setElegidos(new Set([f]));
    },
    [avisarSucio, datos, traer]
  );

  /** Marca o desmarca un día sin cambiar el que está abierto en la hoja,
   *  salvo que sea el primero que se marca. */
  const alternar = useCallback(
    (f: string) => {
      setElegidos((prev) => {
        const n = new Set(prev);
        if (n.has(f)) {
          // Nunca se quedan cero marcados por accidente: el último no se
          // puede desmarcar tocándolo.
          if (n.size > 1) n.delete(f);
        } else {
          n.add(f);
        }
        return n;
      });
    },
    []
  );

  /* ===================================================================
     RESOLVER UN DÍA — las tres capas, de lo más específico a lo general:
        desglose por causal  >  total escrito a mano  >  lo de SAP
     Se resuelve con lo que hay en las CASILLAS, no con lo guardado: por
     eso el tablero entero se mueve mientras se teclea, y se ve el efecto
     de la cifra antes de darle a Guardar.
     =================================================================== */
  const resolver = useCallback(
    (f: string): Dia => {
      const s = datos.sap[f];
      const e = actual(f);

      const prodEsc = aNumero(e.produccion);
      const totEsc = aNumero(e.baja);

      const cs: Record<string, number> = {};
      let hayDesglose = false;
      for (const c of CAUSALES) {
        const v = aNumero(e.causales[c] ?? "");
        if (v != null) { cs[c] = v; hayDesglose = true; }
      }

      const produccion = prodEsc ?? s?.produccion ?? 0;
      const baja = hayDesglose
        ? CAUSALES.reduce((x, c) => x + (cs[c] ?? 0), 0)
        : totEsc ?? s?.baja ?? 0;

      /* La mezcla por causal: si hay desglose escrito, es ese. Si se
         escribió solo el total, se reparte con las MISMAS proporciones
         que reportó SAP — son información real — de modo que las barras
         sumen el total escrito en vez de contradecirlo. Si SAP tampoco
         tiene mezcla, no se inventa ninguna. */
      let causales: Record<string, number> = {};
      if (hayDesglose) {
        causales = cs;
      } else if (s && s.baja !== 0 && Object.keys(s.causales).length) {
        const k = baja / s.baja;
        for (const [cc, v] of Object.entries(s.causales)) causales[cc] = v * k;
      }

      const escrito = prodEsc != null || totEsc != null || hayDesglose;
      return {
        fecha: f, produccion, baja,
        pct: produccion > 0 ? baja / produccion : null,
        causales,
        origen: escrito ? "escrito" : s ? "sap" : "vacio",
      };
    },
    [datos, actual]
  );

  /* ---- el día abierto: para la ficha que compara contra SAP ---- */
  const sap = datos.sap[fecha];
  const manual = datos.manual[fecha];
  const eAbierto = actual(fecha);

  const sapProd = sap?.produccion ?? null;
  const sapBaja = sap ? sap.baja : null;

  const escProd = aNumero(eAbierto.produccion);
  const escTot = aNumero(eAbierto.baja);
  const hayCausalEscrita = CAUSALES.some((c) => aNumero(eAbierto.causales[c] ?? "") != null);
  const escBaja = hayCausalEscrita
    ? CAUSALES.reduce((x, c) => x + (aNumero(eAbierto.causales[c] ?? "") ?? 0), 0)
    : escTot;

  const diaAbierto = resolver(fecha);
  const prod = diaAbierto.produccion || null;
  const baja = diaAbierto.baja;
  const pct = diaAbierto.pct;

  const leProd = aNumero(eAbierto.le_produccion);
  const leBaja = aNumero(eAbierto.le_baja);
  const lePct = leProd && leProd > 0 && leBaja != null ? leBaja / leProd : null;

  /* La meta es POR MES, así que un rango a caballo entre dos meses tiene
     dos. metaDe() resuelve la del día. */
  const metaDe = useCallback(
    (f: string): number | null => datos.metas[f.slice(0, 7)] ?? null,
    [datos.metas]
  );
  const meta = metaDe(fecha);
  const sobreMetaDia = pct != null && meta != null && pct > meta;

  const valorCausal = useCallback(
    (c: string): number | null => {
      const e = aNumero(actual(fecha).causales[c] ?? "");
      if (e != null) return e;
      if (hayCausalEscrita) return 0;
      return diaAbierto.causales[c] ?? null;
    },
    [actual, fecha, hayCausalEscrita, diaAbierto]
  );

  /* ===================================================================
     EL RANGO EN PANTALLA. Todos los días de datos.desde..datos.hasta.
     Es lo que dibujan las pastillas, las gráficas y la tabla.
     =================================================================== */
  const diasRango: Dia[] = useMemo(() => {
    const out: Dia[] = [];
    for (let f = datos.desde; f <= datos.hasta; f = correr(f, 1)) out.push(resolver(f));
    return out;
  }, [datos.desde, datos.hasta, resolver]);

  /* ===================================================================
     LOS DÍAS MARCADOS. Mandan en el número grande, las cifras y el
     Pareto. Sin nada marcado se toma el rango completo, porque una
     pantalla en cero no le dice nada a nadie.
     =================================================================== */
  const diasSel: Dia[] = useMemo(() => {
    const dentro = diasRango.filter((d) => elegidos.has(d.fecha));
    return dentro.length ? dentro : diasRango;
  }, [diasRango, elegidos]);

  const nSel = diasSel.length;
  const todoElRango = nSel === diasRango.length;

  /* ---- totales de lo marcado ---- */
  const prodA = diasSel.reduce((s, d) => s + d.produccion, 0);
  const bajaA = diasSel.reduce((s, d) => s + d.baja, 0);
  const pctA = prodA > 0 ? bajaA / prodA : null;

  /* Meta de lo marcado: ponderada por producción, no promediada. Un día
     de 9.000 cajas no pesa lo mismo que uno de 200.000, y un rango que
     cruza de mes tiene metas distintas. Es la misma regla del tablero
     del periodo. */
  const metaA = useMemo(() => {
    let num = 0, den = 0;
    for (const d of diasSel) {
      const mt = metaDe(d.fecha);
      if (mt == null || d.produccion <= 0) continue;
      num += d.produccion * mt;
      den += d.produccion;
    }
    return den > 0 ? num / den : metaDe(fecha);
  }, [diasSel, metaDe, fecha]);

  const sobreA = pctA != null && metaA != null && pctA > metaA;
  const ppA = pctA != null && metaA != null ? (pctA - metaA) * 100 : null;
  const permitido = metaA != null ? prodA * metaA : null;
  const exceso = permitido != null ? bajaA - permitido : null;

  /* ---- el rango completo, que se muestra siempre como contexto ---- */
  const prodRango = diasRango.reduce((s, d) => s + d.produccion, 0);
  const bajaRango = diasRango.reduce((s, d) => s + d.baja, 0);
  const pctRango = prodRango > 0 ? bajaRango / prodRango : null;
  const metaRango = useMemo(() => {
    let num = 0, den = 0;
    for (const d of diasRango) {
      const mt = metaDe(d.fecha);
      if (mt == null || d.produccion <= 0) continue;
      num += d.produccion * mt; den += d.produccion;
    }
    return den > 0 ? num / den : null;
  }, [diasRango, metaDe]);
  const sobreRango = pctRango != null && metaRango != null && pctRango > metaRango;

  const causalesA = useMemo(
    () => CAUSALES.map((c) => ({
      nom: c,
      v: diasSel.reduce((s, d) => s + (d.causales[c] ?? 0), 0),
      col: color(c),
    })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v),
    [diasSel]
  );

  /* ---- atajos de marcado ---- */
  const marcarAtajo = useCallback(
    (a: Atajo) => {
      if (a === "dia") { setElegidos(new Set([fecha])); return; }
      if (a === "todos") { setElegidos(new Set(diasRango.map((d) => d.fecha))); return; }
      const l = lunesDe(fecha);
      const n = new Set<string>();
      for (let i = 0; i < 7; i++) {
        const f = correr(l, i);
        if (f >= datos.desde && f <= datos.hasta) n.add(f);
      }
      setElegidos(n.size ? n : new Set([fecha]));
    },
    [fecha, diasRango, datos.desde, datos.hasta]
  );

  /** Cuál atajo está puesto ahora mismo, para prender su botón. */
  const atajoActivo: Atajo | null = useMemo(() => {
    if (todoElRango) return "todos";
    if (nSel === 1 && elegidos.has(fecha)) return "dia";
    const l = lunesDe(fecha);
    const semana = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const f = correr(l, i);
      if (f >= datos.desde && f <= datos.hasta) semana.add(f);
    }
    if (semana.size === nSel && [...semana].every((f) => elegidos.has(f))) return "semana";
    return null;
  }, [todoElRango, nSel, elegidos, fecha, datos.desde, datos.hasta]);

  /* ---- lo que la rejilla necesita de cada columna ---- */
  const columnas: ColumnaDia[] = useMemo(
    () => diasRango.map((d) => {
      const e = actual(d.fecha);
      const s = datos.sap[d.fecha];
      const causalesEsc: Record<string, string> = {};
      let hayDesglose = false;
      const causalVale: Record<string, number | null> = {};
      for (const c of CAUSALES) {
        const t = e.causales[c] ?? "";
        causalesEsc[c] = t;
        if (aNumero(t) != null) hayDesglose = true;
      }
      for (const c of CAUSALES) {
        const v = aNumero(e.causales[c] ?? "");
        causalVale[c] = v != null ? v : hayDesglose ? 0 : (s?.causales[c] ?? null);
      }
      return {
        fecha: d.fecha,
        produccion: d.produccion,
        baja: d.baja,
        pct: d.pct,
        meta: metaDe(d.fecha),
        sapProduccion: s?.produccion ?? null,
        sapBaja: s ? s.baja : null,
        produccionEsc: e.produccion,
        bajaEsc: e.baja,
        causalesEsc,
        hayDesglose,
        causalVale,
      };
    }),
    [diasRango, actual, datos.sap, metaDe]
  );

  const rotSel = todoElRango ? "QUIEBRA DEL PERÍODO"
               : nSel === 1 ? "QUIEBRA DEL DÍA"
               : `QUIEBRA DE ${nSel} DÍAS`;
  /* Días sueltos NO son un rango: decir "3 – 25 sep" cuando lo marcado
     es 3, 5, 11 y 25 es mentira. Si son seguidos va el rango; si no, van
     listados, y si son muchos se dice entre cuáles caen. */
  const pieSel = useMemo(() => {
    if (todoElRango) return rangoBonito(datos.desde, datos.hasta);
    if (nSel === 1) return bonita(diasSel[0].fecha);
    const primero = diasSel[0].fecha, ultimo = diasSel[nSel - 1].fecha;
    let seguidos = true;
    for (let i = 1; i < nSel; i++) {
      if (diasSel[i].fecha !== correr(diasSel[i - 1].fecha, 1)) { seguidos = false; break; }
    }
    if (seguidos) return rangoBonito(primero, ultimo);
    if (nSel <= 5) {
      const ds = diasSel.map((d) => partes(d.fecha).d);
      const mismoMes = diasSel.every((d) => d.fecha.slice(0, 7) === primero.slice(0, 7));
      const lista = ds.slice(0, -1).join(", ") + " y " + ds[ds.length - 1];
      return mismoMes
        ? `${lista} de ${MESES_LARGO[partes(primero).m]}`
        : diasSel.map((d) => bonitaCorta(d.fecha)).join(" · ");
    }
    return `${nSel} días entre el ${partes(primero).d} y el ${partes(ultimo).d} de ${MESES_LARGO[partes(ultimo).m]}`;
  }, [todoElRango, nSel, diasSel, datos.desde, datos.hasta]);
  const cajasDe = todoElRango ? "cajas del período"
                : nSel === 1 ? "cajas del día"
                : `cajas de ${nSel} días`;



  /* ---- cuadre del día ---- */
  const chequeos = useMemo(() => {
    const out: { estado: "grave" | "ojo" | "ok"; texto: string }[] = [];
    if (prod == null || prod === 0) {
      out.push({ estado: "grave", texto: "Sin producción del día no se puede calcular la quiebra. Escríbela abajo." });
    }
    if (baja != null && baja < 0) {
      out.push({ estado: "grave", texto: "La baja del día quedó negativa. Revisa las causales." });
    }
    if (escProd != null && sapProd != null && Math.abs(escProd - sapProd) > 0.5) {
      const dif = escProd - sapProd;
      out.push({ estado: "ojo", texto: `La producción escrita se aparta de SAP en ${nf.format(Math.abs(dif))} cajas (${dif > 0 ? "más" : "menos"}). Manda la escrita.` });
    }
    if (escBaja != null && sapBaja != null && Math.abs(escBaja - sapBaja) > 0.5) {
      const dif = escBaja - sapBaja;
      out.push({ estado: "ojo", texto: `La baja escrita se aparta de SAP en ${nf.format(Math.abs(dif))} cajas (${dif > 0 ? "más" : "menos"}). Manda la escrita.` });
    }
    if (hayCausalEscrita && sap) {
      const faltan = CAUSALES.filter((c) => (sap.causales[c] ?? 0) > 0 && aNumero(eAbierto.causales[c] ?? "") == null);
      if (faltan.length) {
        out.push({ estado: "ojo", texto: `SAP tiene ${faltan.join(", ")} en este día y quedaron en cero al escribir el desglose a mano.` });
      }
    }
    if (pct != null && meta != null) {
      out.push(pct > meta
        ? { estado: "grave", texto: `El día cerró en ${pf(pct)}, por encima de la meta de ${pf(meta)}.` }
        : { estado: "ok", texto: `El día cerró en ${pf(pct)}, dentro de la meta de ${pf(meta)}.` });
    }
    if (leProd != null && prod != null && prod > 0) {
      const dif = prod - leProd;
      out.push({ estado: "ojo", texto: `Producción real ${dif >= 0 ? "por encima" : "por debajo"} del LE en ${nf.format(Math.abs(dif))} cajas.` });
    }
    if (!sap && !manual) {
      out.push({ estado: "ojo", texto: "Este día no tiene nada: ni importado ni escrito." });
    }
    if (out.length === 0) out.push({ estado: "ok", texto: "El día cuadra." });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod, baja, escProd, escBaja, sapProd, sapBaja, pct, meta, leProd, eAbierto, sap, manual]);

  /* ===================================================================
     GUARDAR. Se manda TODO lo tocado en una sola llamada y es todo o
     nada: la rejilla deja tocar treinta días antes de guardar, y
     guardar la mitad sería peor que no guardar nada.
     =================================================================== */
  async function guardar() {
    if (!tocados.length) return;
    setGuardando(true);
    setAviso(null);

    const lote = tocados.map((f) => {
      const e = edits[f];
      const causales: Record<string, number> = {};
      for (const c of CAUSALES) {
        const v = aNumero(e.causales[c] ?? "");
        if (v != null) causales[c] = v;
      }
      return {
        fecha: f,
        produccion: aNumero(e.produccion),
        baja: aNumero(e.baja),
        le_produccion: aNumero(e.le_produccion),
        le_baja: aNumero(e.le_baja),
        nota: e.nota.trim() || null,
        causales,
      };
    });

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any).rpc("quiebra_diario_guardar_lote", { p_dias: lote });

    if (error) {
      const m = error.message.toLowerCase();
      setAviso({
        mal: true,
        texto: m.includes("does not exist") || m.includes("schema cache") || m.includes("function")
          ? "Falta crear las tablas del diario en Supabase: ejecuta supabase/modulos/quiebra-diario.sql en el SQL Editor."
          : m.includes("supervisor") || m.includes("row-level security") || m.includes("permission")
            ? "Tu usuario no tiene permiso para editar el diario. Se necesita rol de supervisor o administrador."
            : error.message,
      });
      setGuardando(false);
      return;
    }

    try {
      const nuevo = await leerRango(supabase, datos.desde, datos.hasta);
      setDatos(nuevo);
      setEdits({});
      setAviso({
        mal: false,
        texto: `${lote.length} día${lote.length > 1 ? "s" : ""} guardado${lote.length > 1 ? "s" : ""}.`,
      });
    } catch {
      setAviso({ mal: false, texto: "Guardado, pero no se pudo refrescar la pantalla." });
    }
    setGuardando(false);
  }

  /** Deshace lo tocado sin guardar. */
  const deshacer = () => setEdits({});

  /** Devuelve los días marcados a lo que dice SAP: borra su dato manual. */
  function volverASap() {
    const objetivo = diasSel.map((d) => d.fecha);
    if (!confirm(
      `Se borra lo escrito a mano en ${objetivo.length} día${objetivo.length > 1 ? "s" : ""} ` +
      `y vuelve a mandar lo importado de SAP. Hay que darle a Guardar para que quede. ¿Seguir?`
    )) return;
    setEdits((prev) => {
      const n = { ...prev };
      for (const f of objetivo) n[f] = { ...VACIA, causales: {} };
      return n;
    });
  }

  const autor = manual?.actualizado_por ? datos.autores[manual.actualizado_por] : null;
  return (
    <div className="qb qd">
      {/* ====================== Encabezado ====================== */}
      <section className="cabeza">
        <div className="texto">
          <h1>Quiebra diaria</h1>
          <p className="sub">
            El día a día de la hoja quiebra diaria. Trae lo importado de SAP y deja
            escribir a mano lo que todavía no llega; lo escrito manda y la importación
            no lo borra. <Link href="/quiebra">Ver el tablero del periodo</Link>
          </p>
        </div>
        {/* El color sigue la meta, igual que en el tablero del periodo: rojo
            si se pasó, verde si quedó dentro. */}
        <div className={"kpi" + (sobreA ? "" : " bajo")}>
          <div className="corte" />
          <div className="rot">{rotSel}</div>
          <div className="num">
            {pctA == null || !Number.isFinite(pctA)
              ? "—"
              : <>{(pctA * 100).toFixed(2).replace(".", ",")}<span className="pc">%</span></>}
          </div>
          <div className="pie">
            <span>{pieSel}</span>
            {metaA != null && <span className="delta">Meta {pf(metaA)}</span>}
          </div>
        </div>
      </section>

      {/* ====================== Los días del mes ====================== */}
      <TiraMes
        dias={diasRango} ancla={fecha} hoy={hoy} datos={datos}
        elegidos={elegidos} cargando={cargando}
        abrir={irA} alternar={alternar} cambiarRango={cambiarRango}
        atajo={atajoActivo} marcarAtajo={marcarAtajo}
      />

      {/* ====================== Cifras del mes ====================== */}
      <section className="cifras cuatro">
        <div className="cifra">
          <div className="rot">ENVASE PRODUCIDO</div>
          <div className="n">{nf.format(prodA)}</div>
          <div className="u">
            {cajasDe}
            {nSel > 1 && <> · {diasSel.filter((d) => d.origen !== "vacio").length} de {nSel} con dato</>}
          </div>
        </div>
        <div className="cifra">
          <div className="rot">ENVASE ROTO</div>
          <div className="n">{nf.format(bajaA)}</div>
          <div className="u">
            cajas
            {(() => {
              const esc = diasSel.filter((d) => d.origen === "escrito").length;
              return esc > 0
                ? <span className="qd-sello escrito">{esc} día{esc > 1 ? "s" : ""} a mano</span>
                : null;
            })()}
          </div>
        </div>
        {/* El período completo se muestra SIEMPRE, aunque haya días
            marcados: es la cifra que se reporta y no se puede perder de
            vista por estar mirando el detalle. */}
        <div className={"cifra" + (metaRango == null || pctRango == null ? "" : sobreRango ? " alerta" : " buena")}>
          <div className="rot">ACUMULADO DEL PERÍODO</div>
          <div className="n">{pf(pctRango)}</div>
          <div className="u">
            {metaRango != null
              ? <>meta {pf(metaRango)} · {nf.format(bajaRango)} de {nf.format(prodRango)} cajas</>
              : "no hay metas cargadas para este período"}
          </div>
        </div>
        {exceso != null ? (
          <div className={"cifra " + (exceso > 0 ? "alerta" : "buena")}>
            <div className="rot">{exceso > 0 ? "EXCESO SOBRE META" : "MARGEN BAJO LA META"}</div>
            <div className="n">{nf.format(Math.abs(Math.round(exceso)))}</div>
            <div className="u">
              cajas {exceso > 0 ? "por encima" : "por debajo"} de lo permitido
              {ppA != null && <> · {ppA >= 0 ? "+" : "−"}{Math.abs(ppA).toFixed(2).replace(".", ",")} pp</>}
            </div>
          </div>
        ) : (
          <div className="cifra">
            <div className="rot">META DEL MES</div>
            <div className="n">—</div>
            <div className="u">no hay meta cargada para este mes</div>
          </div>
        )}
      </section>

      {/* ====================== Fila 1: el día por día ====================== */}
      <section className="tarjetas">
        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>Quiebra día por día</h2>
              <p>
                Porcentaje sobre la producción del día · toca una barra para
                pararte en ese día
              </p>
            </div>
          </div>
          <div className="cuerpo">
            <div className="qd-lienzo">
              <GraficoDias dias={diasRango} metaDe={metaDe} elegidos={elegidos} ancla={fecha} elegir={alternar} />
            </div>
            <div className="leyenda abajo">
              <span><i style={{ background: "#0B4EA2" }} /> Bajo meta</span>
              <span><i style={{ background: "#E4002B" }} /> Sobre meta</span>
              <span><i className="meta" /> Meta del mes</span>
              <span><i className="qd-i-esc" /> Escrito a mano</span>
            </div>
          </div>
        </div>

        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>El día seleccionado</h2>
              <p>{bonita(fecha)}</p>
            </div>
            {manual && (
              <div className="qd-firma">
                <b>Editado a mano</b>
                <span>
                  {autor ? `${autor} · ` : ""}
                  {manual.actualizado_en
                    ? new Date(manual.actualizado_en).toLocaleString("es-CO", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })
                    : ""}
                </span>
              </div>
            )}
          </div>
          <div className="cuerpo doble">
            <div className="qd-mini">
              <Mini rot="PRODUCCIÓN" n={prod == null ? "—" : nf.format(prod)} u="cajas"
                    marca={escProd != null ? "escrito" : sap ? "sap" : "falta"} />
              <Mini rot="BAJA" n={baja == null ? "—" : nf.format(baja)} u="cajas"
                    marca={escBaja != null ? "escrito" : sap ? "sap" : "falta"} />
              <Mini rot="QUIEBRA" n={pf(pct)} u={meta != null ? `meta ${pf(meta)}` : "sin meta"}
                    tono={pct == null || meta == null ? undefined : pct > meta ? "alerta" : "buena"} />
              <Mini rot="LE DEL DÍA" n={pf(lePct)}
                    u={leBaja != null ? `${nf.format(leBaja)} cajas de plan` : "sin LE escrito"} />
            </div>
            <ul className="qd-checks">
              {chequeos.map((c, i) => (
                <li key={i} className={"qd-" + c.estado}><i /><span>{c.texto}</span></li>
              ))}
            </ul>
            <div className="parte abajo-parte">
              <div className="rotulo">De dónde salió la pérdida del día</div>
              <Barras
                datos={CAUSALES.map((c) => ({ nom: c, v: valorCausal(c) ?? 0, col: color(c) }))
                  .filter((x) => x.v > 0).sort((a, b) => b.v - a.v)}
                total={baja ?? 0}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ====================== Fila 2: de dónde sale ====================== */}
      <section className="tarjetas dos">
        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>Composición día por día</h2>
              <p>Cajas rotas por causal</p>
            </div>
          </div>
          <div className="cuerpo">
            <div className="qd-lienzo">
              <ApiladoDias dias={diasRango} elegidos={elegidos} />
            </div>
            <div className="leyenda abajo">
              {causalesA.map((c) => (
                <span key={c.nom}><i style={{ background: c.col }} /> {c.nom}</span>
              ))}
              {!causalesA.length && <span>Sin pérdida registrada.</span>}
            </div>
          </div>
        </div>

        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>De dónde sale la quiebra</h2>
              <p>Participación en {todoElRango ? "el período" : nSel === 1 ? "el día" : `los ${nSel} días`}</p>
            </div>
          </div>
          <div className="cuerpo">
            <Barras datos={causalesA} total={bajaA} />
          </div>
        </div>
      </section>

      {/* ====================== La rejilla ====================== */}
      <section className="tarjeta qd-hoja">
        <div className="cab">
          <div>
            <h2>La hoja del período</h2>
            <p>
              El espejo de <b>QUIEBRA DIARIA</b>: un día por columna. Las casillas
              blancas se escriben y lo escrito manda sobre SAP; en gris, debajo, está
              lo que dice el maestro. Dejar una casilla en blanco es volver a SAP.
            </p>
          </div>
          <div className={"qd-estado" + (sucio ? " sucio" : "")}>
            {sucio
              ? `${tocados.length} día${tocados.length > 1 ? "s" : ""} sin guardar`
              : "Todo guardado"}
          </div>
        </div>

        <Rejilla
          cols={columnas}
          editable={esEditor}
          abierto={fecha}
          escribir={escribir}
          abrir={irA}
          mostrarDesglose={verDesglose}
          alternarDesglose={() => setVerDesglose((v) => !v)}
        />

        {esEditor ? (
          <>
            <div className="qd-nota">
              <label htmlFor="qd-nota">Nota del {bonita(fecha)}</label>
              <textarea id="qd-nota" rows={2}
                        placeholder="Por qué se escribió a mano, qué turno faltaba, a quién se le pidió el dato…"
                        value={eAbierto.nota}
                        onChange={(e) => escribirCampo(fecha, "nota", e.target.value)} />
              <div className="qd-le">
                <span className="rot">LE del día</span>
                <label>
                  Producción
                  <input inputMode="decimal" value={eAbierto.le_produccion}
                         onChange={(e) => escribirCampo(fecha, "le_produccion", e.target.value)} />
                </label>
                <label>
                  Baja
                  <input inputMode="decimal" value={eAbierto.le_baja}
                         onChange={(e) => escribirCampo(fecha, "le_baja", e.target.value)} />
                </label>
                <b>{pf(lePct)}</b>
              </div>
            </div>

            <div className="qd-acciones">
              <button type="button" className="qd-btn" disabled={!sucio || guardando}
                      onClick={guardar}>
                {guardando
                  ? "Guardando…"
                  : sucio
                    ? `Guardar ${tocados.length} día${tocados.length > 1 ? "s" : ""}`
                    : "Guardar"}
              </button>
              <button type="button" className="qd-btn plano" disabled={!sucio || guardando}
                      onClick={deshacer}>Deshacer</button>
              <button type="button" className="qd-btn plano" disabled={guardando}
                      onClick={volverASap}>
                Volver a lo de SAP{nSel > 1 ? ` (${nSel} días)` : ""}
              </button>
            </div>
          </>
        ) : (
          <div className="qd-acciones">
            <span className="qd-estado">Solo lectura. Escribir el diario requiere rol de supervisor.</span>
          </div>
        )}
        {aviso && <div className={"qd-aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
      </section>

      {/* ====================== El año, mes por mes ====================== */}
      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>El año mes por mes</h2>
            <p>
              La segunda tabla de la hoja, ya con lo escrito a mano aplicado. La misma
              que sale en el tablero del periodo, y sale de la misma vista para que no
              puedan discrepar.
            </p>
          </div>
        </div>
        <TablaAnio
          anio={datos.anio}
          meses={datos.meses}
          metas={datos.metas}
          resaltar={Number(fecha.slice(5, 7))}
        />
      </section>

      <p className="nota-pie">
        Importar el maestro vuelve a llenar lo de SAP en todos los días del archivo. Lo
        escrito a mano vive en otra tabla y no se toca: por eso un día editado sigue
        editado después de importar, y por eso la casilla muestra en gris lo que dice el
        maestro cuando se apartan. Tres capas, de lo más específico a lo más general:
        el desglose por causal manda sobre el total escrito, y el total escrito sobre lo
        importado. Para devolver días a SAP, márcalos y usa <b>Volver a lo de SAP</b>.
      </p>
    </div>
  );
}

/* ==================== Cifra chica ==================== */
function Mini({ rot, n, u, tono, marca }: {
  rot: string; n: string; u: string;
  tono?: "alerta" | "buena";
  marca?: "escrito" | "sap" | "falta";
}) {
  return (
    <div className={"qd-mini-c" + (tono ? " " + tono : "")}>
      <div className="rot">{rot}</div>
      <div className="n">{n}</div>
      <div className="u">
        {u}
        {marca === "escrito" && <span className="qd-sello escrito">a mano</span>}
        {marca === "sap" && <span className="qd-sello sap">SAP</span>}
        {marca === "falta" && <span className="qd-sello falta">sin dato</span>}
      </div>
    </div>
  );
}

/* ==================== Barras horizontales ==================== */
function Barras({ datos, total }: { datos: { nom: string; v: number; col: string }[]; total: number }) {
  const max = Math.max(1, ...datos.map((d) => d.v));
  return (
    <>
      {datos.map((d) => (
        <div className="fila" key={d.nom}>
          <div className="nom" title={d.nom}>{d.nom}</div>
          <div className="pista">
            <div className="relleno"
                 style={{ width: `${Math.max(0, (d.v / max) * 100)}%`, background: d.col }} />
          </div>
          <div className="pct">{total > 0 ? pf(d.v / total, 1) : "—"}</div>
        </div>
      ))}
      {!datos.length && <p className="nota-pie">Sin pérdida registrada.</p>}
    </>
  );
}

/* ==================== Quiebra día por día ====================
   Misma escala del otro tablero: percentil 95 para que dos días de
   producción mínima no aplasten el mes entero. Lo que se sale va al
   tope con una punta.
   ============================================================ */
function GraficoDias({ dias, metaDe, elegidos, ancla, elegir }: {
  dias: Dia[]; metaDe: (f: string) => number | null;
  elegidos: Set<string>; ancla: string; elegir: (f: string) => void;
}) {
  const conPct = dias.filter((d) => d.pct != null);
  const orden = conPct.map((d) => d.pct!).sort((a, b) => a - b);
  const p95 = orden[Math.min(Math.max(0, orden.length - 1), Math.floor(orden.length * 0.95))] || 0.01;
  /* La meta es mensual: si el rango cruza de mes hay dos, y la línea de
     meta se dibuja por tramo en vez de una sola recta mentirosa. */
  const metas = dias.map((d) => metaDe(d.fecha));
  const metaMax = Math.max(0, ...metas.filter((m): m is number => m != null));
  const max = Math.max(metaMax * 1.6, p95) * 1.14 || 0.01;
  const fuera = conPct.filter((d) => d.pct! > max).length;

  const W = 1000, H = 420, m = { t: 28, r: 14, b: 48, l: 104 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const y = (v: number) => m.t + ih - (Math.min(v, max) / max) * ih;
  const paso = iw / Math.max(1, dias.length);
  const an = Math.max(3, Math.min(20, paso * 0.6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico g-dias" role="img"
         aria-label="Quiebra día por día del mes">
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (max * i) / 4;
        return (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="rejilla" />
            <text x={m.l - 12} y={y(v) + 6} className="eje" textAnchor="end">
              {pf(v, 1)}{i === 4 ? "+" : ""}
            </text>
          </g>
        );
      })}

      {dias.map((d, i) => {
        const mt = metas[i];
        if (mt == null) return null;
        return (
          <line key={"m" + d.fecha} className="meta"
                x1={m.l + paso * i} x2={m.l + paso * (i + 1)}
                y1={y(mt)} y2={y(mt)} />
        );
      })}

      {dias.map((d, i) => {
        const px = m.l + paso * i + (paso - an) / 2;
        const esSel = elegidos.has(d.fecha);
        const esAncla = d.fecha === ancla;
        const vacio = d.pct == null;
        const corta = !vacio && d.pct! > max;
        const yv = vacio ? m.t + ih : y(d.pct!);
        const mt = metas[i];
        const sobre = mt != null && !vacio && d.pct! > mt;
        return (
          <g key={d.fecha} className="qd-barra" onClick={() => elegir(d.fecha)}>
            {/* zona de toque: la barra sola es muy delgada para el dedo */}
            <rect x={m.l + paso * i} y={m.t} width={paso} height={ih}
                  fill={esSel ? "rgba(4,32,63,.08)" : "transparent"} />
            {!vacio && (
              <rect x={px} y={yv} width={an} height={Math.max(1.5, m.t + ih - yv)}
                    fill={sobre ? "#E4002B" : "#0B4EA2"}
                    stroke={d.origen === "escrito" ? "#04203F" : "none"}
                    strokeWidth={d.origen === "escrito" ? 1.6 : 0}>
                <title>{`${d.fecha}${d.origen === "escrito" ? " · escrito a mano" : ""}\nQuiebra ${pf(d.pct)}${corta ? " (fuera de escala)" : ""}\n${nf.format(d.baja)} de ${nf.format(d.produccion)} cajas`}</title>
              </rect>
            )}
            {corta && (
              <path d={`M${px - 2} ${yv} L${px + an / 2} ${yv - 10} L${px + an + 2} ${yv} Z`}
                    fill="#E4002B" />
            )}
            <text x={m.l + paso * i + paso / 2} y={H - 16}
                  className={"eje" + (esSel ? " sel" : "") + (esAncla ? " ancla" : "")
                             + (partes(d.fecha).d % 5 ? " menor" : "")}
                  textAnchor="middle">
              {partes(d.fecha).d}
            </text>
          </g>
        );
      })}

      {fuera > 0 && (
        <text x={W - m.r} y={m.t - 8} className="eje" textAnchor="end">
          {fuera} día{fuera > 1 ? "s" : ""} fuera de escala
        </text>
      )}
    </svg>
  );
}

/* ==================== Composición apilada por día ==================== */
function ApiladoDias({ dias, elegidos }: { dias: Dia[]; elegidos: Set<string> }) {
  const W = 1000, H = 380, m = { t: 24, r: 12, b: 46, l: 96 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const cs = CAUSALES.filter((c) => dias.some((d) => (d.causales[c] ?? 0) > 0));
  const max = Math.max(1, ...dias.map((d) => d.baja)) * 1.12;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const paso = iw / Math.max(1, dias.length);
  const an = Math.max(3, Math.min(20, paso * 0.6));

  const etiqueta = (v: number) =>
    v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + "M"
             : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico g-apilado-dias" role="img"
         aria-label="Composición diaria por causal">
      {[0, 1, 2, 3].map((i) => {
        const v = (max * i) / 3;
        return (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="rejilla" />
            <text x={m.l - 12} y={y(v) + 6} className="eje" textAnchor="end">{etiqueta(v)}</text>
          </g>
        );
      })}
      {dias.map((d, i) => {
        const x = m.l + paso * i + (paso - an) / 2;
        let ac = 0;
        return (
          <g key={d.fecha}>
            {elegidos.has(d.fecha) && (
              <rect x={m.l + paso * i} y={m.t} width={paso} height={ih} fill="rgba(4,32,63,.08)" />
            )}
            {cs.map((c) => {
              const v = d.causales[c] ?? 0;
              if (v <= 0) return null;
              const y0 = y(ac + v), h = Math.max(1, y(ac) - y0 - 1.2);
              ac += v;
              return (
                <rect key={c} x={x} y={y0} width={an} height={h} fill={color(c)}>
                  <title>{`${d.fecha} · ${c}\n${nf.format(v)} cajas`}</title>
                </rect>
              );
            })}
            <text x={m.l + paso * i + paso / 2} y={H - 15}
                  className={"eje" + (elegidos.has(d.fecha) ? " sel" : "") + (partes(d.fecha).d % 5 ? " menor" : "")}
                  textAnchor="middle">
              {partes(d.fecha).d}
            </text>
          </g>
        );
      })}
      {!cs.length && (
        <text x={W / 2} y={H / 2} className="eje" textAnchor="middle">
          Sin pérdida registrada en el mes
        </text>
      )}
    </svg>
  );
}

/* ==================== La barra de días ====================
   El calendario fija el RANGO (1 ago → 31 ago). Las pastillas son los
   días de ese rango: tocarlas marca y desmarca, y se pueden marcar uno,
   varios o todos. Los atajos marcan de un golpe.

   Marcar (un toque) y ABRIR en la hoja (doble toque) son dos cosas
   distintas a propósito: marcar cinco días para ver su porcentaje no
   debería cambiar el día que se está escribiendo abajo.
   ==================================================== */
function TiraMes({
  dias, ancla, hoy, datos, elegidos, cargando,
  abrir, alternar, cambiarRango, atajo, marcarAtajo,
}: {
  dias: Dia[]; ancla: string; hoy: string; datos: DatosDiario;
  elegidos: Set<string>; cargando: boolean;
  abrir: (f: string) => void;
  alternar: (f: string) => void;
  cambiarRango: (d: string, h: string) => void;
  atajo: Atajo | null;
  marcarAtajo: (a: Atajo) => void;
}) {
  const marcados = dias.filter((d) => elegidos.has(d.fecha)).length;
  const minF = dias.length ? correr(datos.desde, -400) : datos.desde;
  const maxF = correr(hoy, 400);

  return (
    <section className={"qd-dias" + (cargando ? " cargando" : "")}>
      <div className="qd-mando">
        {/* El mismo control del tablero del periodo, con su rótulo. */}
        <div className="sel">
          <label>Período</label>
          <Calendario
            desde={datos.desde} hasta={datos.hasta}
            minF={minF} maxF={maxF}
            aplicar={cambiarRango}
          />
        </div>
        <button type="button" className="qd-hoy"
                onClick={() => cambiarRango(...rangoDelMes(hoy))}>
          Este mes
        </button>
      </div>

      <div className="qd-atajos" role="group" aria-label="Marcar días">
        <span className="rot">Marcar</span>
        {([["dia", "El día"], ["semana", "Su semana"], ["todos", "Todos"]] as [Atajo, string][])
          .map(([v, t]) => (
            <button key={v} type="button"
                    className={atajo === v ? "on" : ""}
                    aria-pressed={atajo === v}
                    onClick={() => marcarAtajo(v)}>
              {t}
            </button>
          ))}
      </div>

      <div className="qd-pastillas">
        {dias.map((d) => {
          const marcado = elegidos.has(d.fecha);
          return (
            <button
              key={d.fecha}
              type="button"
              className={[
                "qd-p",
                marcado ? "sel" : "",
                d.fecha === ancla ? "ancla" : "",
                d.origen,
                d.fecha === hoy ? "hoy" : "",
              ].filter(Boolean).join(" ")}
              aria-pressed={marcado}
              onClick={() => alternar(d.fecha)}
              onDoubleClick={() => abrir(d.fecha)}
              title={`${bonita(d.fecha)}${d.pct != null ? ` · ${pf(d.pct)}` : " · sin dato"}` +
                     `${d.origen === "escrito" ? " · escrito a mano" : ""}` +
                     `\nUn toque marca o desmarca · doble toque lo abre para escribir`}
            >
              <span className="n">{partes(d.fecha).d}</span>
              <span className="pt" />
            </button>
          );
        })}
      </div>

      <div className="qd-ley">
        <span><i className="esc" />escrito</span>
        <span><i className="sap" />importado</span>
        <span><i className="no" />en blanco</span>
        <b>{marcados} de {dias.length} marcados</b>
      </div>
    </section>
  );
}
