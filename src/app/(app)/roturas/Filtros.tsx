"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * LOS FILTROS DE LOS DOS ANÁLISIS DE ROTURAS.
 *
 * UNO SOLO PARA LAS DOS PANTALLAS: «En sitio» filtra por causa, proceso
 * y área; «Salida» por placa, color y tolva. Lo que cambia son las
 * columnas, no la manera de filtrar, y tener dos componentes parecidos
 * termina siempre igual — se arregla uno y el otro se queda atrás.
 *
 * LOS FILTROS VIVEN EN LA DIRECCIÓN, no en el estado de la pantalla.
 * Es lo que permite mandar por WhatsApp «mira los kilos de la NLW428 en
 * agosto» y que al otro le abra exactamente eso; y lo que hace que el
 * botón de atrás deshaga el filtro en vez de salirse del módulo.
 *
 * ---------------------------------------------------------------------
 * UNA SOLA LÍNEA, Y CADA FILTRO DICE LO QUE TIENE PUESTO
 * ---------------------------------------------------------------------
 *   [📅 7 – 23 sep 2026 · 17 días ▾] [Placa todas ▾] [Color ámbar ▾]
 *   [Tolva todas ▾]   1 salida en el filtro                  Limpiar
 *
 * CADA CHIP LLEVA SU RÓTULO Y SU VALOR. No hay que abrir nada para
 * saber qué está puesto, y el que tiene algo puesto se pinta en oro: de
 * un vistazo se ve si la cifra de al lado es el total o un pedazo. Ese
 * es el error caro de una pantalla de informe y esto es lo que lo evita.
 *
 * NO HAY BOTÓN «FILTROS» NI PANEL QUE SE ABRA. Un panel esconde lo
 * puesto justo cuando importa, y obliga a dos toques para cambiar una
 * placa.
 *
 * ---------------------------------------------------------------------
 * TODOS LOS CHIPS ABREN ALGO DONDE SE PUEDE ESCRIBIR
 * ---------------------------------------------------------------------
 * «Que en los filtros pueda escribir para ir filtrando.»
 *
 * Placa, color y tolva abren una lista con un campo de texto arriba que
 * toma el foco solo: se toca el chip y se teclea. La primera versión
 * usaba un `<select>` de verdad —que en el celular abre el selector del
 * sistema, grande y fácil con guante— y esa ventaja NO COMPENSA no
 * poder escribir: con cuarenta placas, el selector nativo es recorrer
 * una rueda de a seis renglones buscando una que uno ya sabe cómo se
 * llama.
 *
 * El de fecha abre un calendario, porque un rango no cabe en una lista:
 * atajos a la izquierda, dos meses con el rango pintado, y abajo lo que
 * se escogió en palabras —«del lunes 7 al miércoles 23 · 17 días»—.
 *
 * SE APLICA CON «APLICAR», no a cada toque. Escoger un rango son DOS
 * toques y el primero deja un rango que no es el que se quiere: aplicar
 * al vuelo recargaría la pantalla con un rango de un día que nadie pidió.
 */

type Campo = {
  clave: string;
  rotulo: string;
  /** Cómo se lee cuando no hay nada puesto: «todas», «todos». */
  todas: string;
  opciones: { id: string; nombre: string }[];
};

const ISO = (d: Date) => d.toISOString().slice(0, 10);
const deISO = (s: string) => new Date(Date.parse(s + "T12:00:00"));
const menos = (s: string, n: number) => ISO(new Date(Date.parse(s + "T12:00:00") - n * 86400_000));
const mesDe = (s: string) => {
  const d = deISO(s);
  return [
    ISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))),
    ISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))),
  ] as const;
};
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                   "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIA_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function atajos(hoy: string) {
  const [m1] = mesDe(hoy);
  const [p1, p2] = mesDe(menos(m1, 1));
  const a = deISO(hoy).getUTCFullYear();
  return [
    { id: "hoy",    nombre: "Hoy",             desde: hoy,           hasta: hoy },
    { id: "ayer",   nombre: "Ayer",            desde: menos(hoy, 1), hasta: menos(hoy, 1) },
    { id: "7",      nombre: "Últimos 7 días",  desde: menos(hoy, 6), hasta: hoy },
    { id: "30",     nombre: "Últimos 30 días", desde: menos(hoy, 29), hasta: hoy },
    { id: "mes",    nombre: "Este mes",        desde: m1,            hasta: hoy },
    { id: "pasado", nombre: "Mes pasado",      desde: p1,            hasta: p2 },
    { id: "anio",   nombre: "Este año",        desde: `${a}-01-01`,  hasta: hoy },
    { id: "todo",   nombre: "Todo",            desde: "",            hasta: "" },
  ];
}

/** «7 – 23 sep 2026», «23 sep 2026», «7 sep – 3 oct 2026». */
function comoSeLee(desde: string, hasta: string) {
  if (!desde && !hasta) return "Todo el histórico";
  if (!desde) return `Hasta el ${corto(hasta)}`;
  if (!hasta) return `Desde el ${corto(desde)}`;
  const a = deISO(desde), b = deISO(hasta);
  if (desde === hasta) return corto(desde);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    if (a.getUTCMonth() === b.getUTCMonth()) {
      return `${a.getUTCDate()} – ${b.getUTCDate()} ${MES_CORTO[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
    }
    return `${a.getUTCDate()} ${MES_CORTO[a.getUTCMonth()]} – ${corto(hasta)}`;
  }
  return `${corto(desde)} – ${corto(hasta)}`;
}
function corto(s: string) {
  const d = deISO(s);
  return `${d.getUTCDate()} ${MES_CORTO[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const cuantos = (desde: string, hasta: string) =>
  !desde || !hasta ? 0
    : Math.round((Date.parse(hasta + "T12:00:00") - Date.parse(desde + "T12:00:00")) / 86400_000) + 1;

const CAL = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M7 3v3m10-3v3M3.5 9h17M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5Z" />
  </svg>
);

export function Filtros({ hoy, campos, cuenta }: {
  hoy: string;
  campos: Campo[];
  /** «1 salida en el filtro». Lo arma la pantalla porque solo ella sabe
   *  si cuenta salidas, roturas o kilos. */
  cuenta?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  const [cargando, empezar] = useTransition();

  /* UNA COPIA LOCAL MIENTRAS LA PÁGINA SE VUELVE A PEDIR: sin ella el
     chip se queda pintando lo viejo hasta que el servidor conteste, y
     quien acaba de escoger cree que no le registró el toque. */
  const [local, setLocal] = useState<Record<string, string> | null>(null);
  const leer = (k: string) => local?.[k] ?? q.get(k) ?? "";
  const desde = leer("desde"), hasta = leer("hasta");

  function empujar(cambios: Record<string, string>) {
    setLocal((x) => ({ ...(x ?? {}), ...cambios }));
    const p = new URLSearchParams(q.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    const s = p.toString();
    empezar(() => router.push(s ? `${pathname}?${s}` : pathname));
  }

  const hay = !!desde || !!hasta || campos.some((c) => leer(c.clave));
  const dias = cuantos(desde, hasta);

  return (
    <section className={"filtros-inf" + (cargando ? " cargando" : "")}>
      <div className="renglon">
        <ChipFecha hoy={hoy} desde={desde} hasta={hasta}
                   onAplicar={(d, h) => empujar({ desde: d, hasta: h })}>
          {CAL}
          <b>{comoSeLee(desde, hasta)}</b>
          {dias > 1 && <span className="flojo">· {dias} días</span>}
        </ChipFecha>

        {campos.map((c) => c.opciones.length === 0 ? null : (
          <ChipLista key={c.clave} campo={c} puesto={leer(c.clave)}
                     dice={c.opciones.find((o) => o.id === leer(c.clave))?.nombre ?? c.todas}
                     onEscoger={(v) => empujar({ [c.clave]: v })} />
        ))}

        {cuenta && <span className="cuantas">{cuenta}</span>}

        {hay && (
          <button type="button" className="limpiar" onClick={() => {
            setLocal(Object.fromEntries(
              ["desde", "hasta", ...campos.map((c) => c.clave)].map((k) => [k, ""])));
            empezar(() => router.push(pathname));
          }}>
            Limpiar
          </button>
        )}
      </div>
    </section>
  );
}

/* =====================================================================
   EL CHIP DE FECHA Y SU CALENDARIO
   ===================================================================== */
function ChipFecha({ hoy, desde, hasta, onAplicar, children }: {
  hoy: string; desde: string; hasta: string;
  onAplicar: (desde: string, hasta: string) => void;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  /* SE CIERRA AL TOCAR AFUERA Y CON ESCAPE. Un flotante que solo se
     cierra con su propio botón se queda abierto tapando la pantalla. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div className="chip-f" ref={caja}>
      <button type="button" className={"chip fecha" + ((desde || hasta) ? " on" : "")}
              aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        {children}
        <i className="pico" aria-hidden />
      </button>
      {abierto && (
        <Calendario hoy={hoy} desde={desde} hasta={hasta}
                    onCerrar={() => setAbierto(false)}
                    onAplicar={(d, h) => { onAplicar(d, h); setAbierto(false) }} />
      )}
    </div>
  );
}

function Calendario({ hoy, desde, hasta, onAplicar, onCerrar }: {
  hoy: string; desde: string; hasta: string;
  onAplicar: (d: string, h: string) => void;
  onCerrar: () => void;
}) {
  /* EL BORRADOR. Tocar un día NO recarga la pantalla: escoger un rango
     son dos toques, y el primero deja un rango de un día que nadie
     pidió. Se aplica con «Aplicar». */
  const [d1, setD1] = useState(desde);
  const [d2, setD2] = useState(hasta);
  /* En qué mes está parado el calendario. Arranca donde está el rango,
     no en hoy: quien abre «mes pasado» quiere ver mes pasado. */
  const [ancla, setAncla] = useState(() => mesDe(desde || hasta || hoy)[0]);

  const lista = atajos(hoy);
  const cual = lista.find((a) => a.desde === d1 && a.hasta === d2);

  function tocar(f: string) {
    /* PRIMER TOQUE ABRE, SEGUNDO CIERRA. Y si el segundo es anterior al
       primero se voltean, en vez de rechazarlo: quien toca 23 y después
       7 quiere del 7 al 23, no un error. */
    if (!d1 || (d1 && d2)) { setD1(f); setD2("") }
    else if (f < d1) { setD2(d1); setD1(f) }
    else setD2(f);
  }

  const mover = (n: number) => {
    const d = deISO(ancla);
    setAncla(ISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))));
  };

  const finDia = d2 || d1;
  const dias = cuantos(d1, finDia);
  const frase = !d1 && !d2 ? "Todo el histórico"
    : !d2 ? `Desde el ${enPalabras(d1)} · falta el día final`
    : d1 === d2 ? `Solo el ${enPalabras(d1)}`
    : `Del ${enPalabras(d1)} al ${enPalabras(d2)} · ${dias} días`;

  const segundo = (() => {
    const d = deISO(ancla);
    return ISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  })();

  return (
    <div className="cal" role="dialog" aria-label="Escoger el rango de fechas">
      <div className="cal-cuerpo">
        <div className="cal-atajos">
          <p className="cal-rot">ATAJOS</p>
          {lista.map((a) => (
            <button key={a.id} type="button" className={cual?.id === a.id ? "on" : ""}
                    onClick={() => { setD1(a.desde); setD2(a.hasta);
                                     if (a.desde) setAncla(mesDe(a.desde)[0]) }}>
              {a.nombre}
            </button>
          ))}
        </div>

        <div className="cal-meses">
          <div className="cal-cab">
            <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)}>‹</button>
            <span>{deISO(ancla).getUTCFullYear()}</span>
            <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)}>›</button>
          </div>
          <div className="cal-dos">
            <Mes ancla={ancla} d1={d1} d2={finDia} hoy={hoy} tocar={tocar} />
            {/* EL SEGUNDO MES SE ESCONDE EN EL CELULAR, no se quita: dos
                meses en 360 px son columnas de 18 px que nadie acierta. */}
            <div className="cal-mes2">
              <Mes ancla={segundo} d1={d1} d2={finDia} hoy={hoy} tocar={tocar} />
            </div>
          </div>
        </div>
      </div>

      <div className="cal-pie">
        <p className="cal-frase">{frase}</p>
        <button type="button" className="cal-no" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="cal-si" disabled={!!d1 && !d2}
                onClick={() => onAplicar(d1, d2)}>Aplicar</button>
      </div>
    </div>
  );
}

function enPalabras(s: string) {
  const d = deISO(s);
  return `${DIA_LARGO[d.getUTCDay()]} ${d.getUTCDate()} de ${MES_LARGO[d.getUTCMonth()]}`;
}

function Mes({ ancla, d1, d2, hoy, tocar }: {
  ancla: string; d1: string; d2: string; hoy: string; tocar: (f: string) => void;
}) {
  const d = deISO(ancla);
  const a = d.getUTCFullYear(), m = d.getUTCMonth();
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  /* LUNES PRIMERO. `getUTCDay()` cuenta desde el domingo; la semana de
     la bodega empieza el lunes y un calendario corrido un día se lee
     mal sin que nadie sepa por qué. */
  const salto = (new Date(Date.UTC(a, m, 1)).getUTCDay() + 6) % 7;

  const celdas: (string | null)[] = [
    ...Array(salto).fill(null),
    ...Array.from({ length: ultimo }, (_, i) => ISO(new Date(Date.UTC(a, m, i + 1)))),
  ];

  return (
    <div className="cal-mes">
      <p className="cal-mes-t">{MES_LARGO[m][0].toUpperCase() + MES_LARGO[m].slice(1)}</p>
      <div className="cal-rejilla">
        {["L", "M", "M", "J", "V", "S", "D"].map((x, i) => (
          <span key={i} className="cal-dia-r">{x}</span>
        ))}
        {celdas.map((f, i) => f === null ? <span key={i} /> : (
          <button key={i} type="button"
                  className={[
                    "cal-d",
                    f === d1 || f === d2 ? "punta" : "",
                    d1 && d2 && f > d1 && f < d2 ? "medio" : "",
                    f === hoy ? "cal-hoy" : "",
                  ].filter(Boolean).join(" ")}
                  aria-pressed={f === d1 || f === d2}
                  onClick={() => tocar(f)}>
            {deISO(f).getUTCDate()}
          </button>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
   UN CHIP QUE ABRE UNA LISTA CON BUSCADOR
   =====================================================================
   «Que en placa yo pueda filtrar por desplegable y pueda escribir.»

   POR QUÉ ESTE NO USA EL `select` DEL SISTEMA. Los otros sí, y a
   propósito: en el celular abren el selector nativo, que se acierta con
   guante mejor que cualquier lista dibujada. Pero un `<select>` NO SE
   PUEDE ESCRIBIR, y con cuarenta placas eso es recorrer la rueda de a
   seis renglones buscando una. Aquí se cambia el selector nativo por
   poder teclear tres letras, que con esa cantidad gana de lejos.

   SE ESCRIBE Y YA: el campo toma el foco solo al abrir, así que quien
   toca el chip puede teclear sin apuntarle a nada más.

   BUSCA EN CUALQUIER PARTE DEL TEXTO, no solo al principio: quien
   recuerda «428» de la NLW428 la encuentra igual. Y sin tildes ni
   mayúsculas — «ambar» encuentra «Ámbar», que es como lo va a escribir
   cualquiera con prisa.

   «TODAS» ES LA PRIMERA OPCIÓN DE LA LISTA y no una X escondida: quitar
   el filtro tiene que estar donde se puso.
*/
const pelado = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function ChipLista({ campo, puesto, dice, onEscoger }: {
  campo: Campo;
  puesto: string;
  dice: string;
  onEscoger: (valor: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const campoTexto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setTexto(""); setActivo(0);
    campoTexto.current?.focus();
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const t = pelado(texto.trim());
  const filtradas = t ? campo.opciones.filter((o) => pelado(o.nombre).includes(t)) : campo.opciones;
  /* «Todas» solo cuando no se está buscando: escribiendo «NLW» estorba. */
  const lista = t ? filtradas : [{ id: "", nombre: campo.todas[0].toUpperCase() + campo.todas.slice(1) }, ...filtradas];

  function escoger(v: string) { onEscoger(v); setAbierto(false) }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setAbierto(false); return }
    if (e.key === "ArrowDown") { e.preventDefault(); setActivo((i) => Math.min(i + 1, lista.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter") { e.preventDefault(); if (lista[activo]) escoger(lista[activo].id) }
  }

  return (
    <div className="chip-f" ref={caja}>
      <button type="button" className={"chip" + (puesto ? " on" : "")}
              aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        <b>{campo.rotulo}</b>
        <span className="flojo">{dice}</span>
        <i className="pico" aria-hidden />
      </button>
      {abierto && (
        <div className="busca" role="dialog" aria-label={campo.rotulo}>
          <input ref={campoTexto} value={texto} type="search"
                 placeholder={`Buscar ${campo.rotulo.toLowerCase()}…`}
                 aria-label={`Buscar ${campo.rotulo.toLowerCase()}`}
                 onChange={(e) => { setTexto(e.target.value); setActivo(0) }}
                 onKeyDown={tecla} />
          <ul className="busca-lista">
            {lista.length === 0 && (
              <li className="busca-nada">Ninguna dice «{texto.trim()}».</li>
            )}
            {lista.map((o, i) => (
              <li key={o.id || "_todas"}>
                <button type="button"
                        className={(i === activo ? "activo " : "") + (o.id === puesto ? "on" : "")}
                        onMouseEnter={() => setActivo(i)}
                        onClick={() => escoger(o.id)}>
                  {o.nombre}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
