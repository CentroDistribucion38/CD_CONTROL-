"use client";

import { useState, useTransition } from "react";
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
 * UN RENGLÓN, Y LO DEMÁS DETRÁS DE «FILTROS»
 * ---------------------------------------------------------------------
 * «Todas esas placas así no me gustan, igual el color del vidrio» y
 * «ese desde-hasta puede ir en una sola, no así por separado».
 *
 * La primera versión pintaba TODO a la vez: dos campos de fecha, cuatro
 * atajos y una fila de botones por cada dimensión —siete placas, tres
 * colores, las tolvas—. Doce a quince controles antes de la primera
 * cifra, que de lejos parecen un menú de navegación y no un filtro.
 *
 * Ahora el renglón lleva SOLO lo que se toca todos los días —los cuatro
 * atajos de tiempo— y a su lado, en texto, LO QUE ESTÁ PUESTO. El resto
 * vive detrás de «Filtros» y se abre cuando hace falta.
 *
 * EL RESUMEN NO ES DECORACIÓN: es lo único que evita el error caro de
 * esta pantalla, que es leer una cifra filtrada creyendo que es el
 * total. Con el panel cerrado, sigue diciendo en letras que se está
 * mirando una sola placa.
 *
 * LOS ATAJOS SÍ SON BOTONES, y los de adentro no. No es contradicción:
 * cuatro botones que siempre son los mismos se aprenden de memoria y se
 * aciertan de un toque; veinte placas en botones son dos renglones que
 * tapan la pantalla. La forma la decide cuántos son y cada cuánto se
 * usan, no la coherencia.
 *
 * LA DIRECCIÓN LLEVA `desde` Y `hasta`, no el nombre del atajo. Un
 * enlace que diga «este mes» significa otra cosa el mes que viene; uno
 * que diga 01/09 a 23/09 significa lo mismo siempre. Cuál atajo está
 * prendido SE DEDUCE de esas dos fechas.
 */

type Campo = {
  clave: string;
  rotulo: string;
  /** Cómo se lee en el resumen: «Todas las placas», «Todos los colores». */
  todas: string;
  opciones: { id: string; nombre: string }[];
};

const dia = (hoy: string, n: number) =>
  new Date(Date.parse(hoy + "T12:00:00") - n * 86400_000).toISOString().slice(0, 10);

function mesDe(ancla: string) {
  const d = new Date(Date.parse(ancla + "T12:00:00"));
  return [
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10),
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10),
  ] as const;
}

/* CUATRO Y NO DOCE. Cubren lo que se pregunta todos los días; cualquier
   otro rango se escribe adentro. Poner doce atajos es obligar a leer
   doce para encontrar el que se usa siempre. */
function atajos(hoy: string) {
  const [m1] = mesDe(hoy);
  return [
    { id: "hoy", nombre: "Hoy",       desde: hoy,          hasta: hoy },
    { id: "7",   nombre: "7 días",    desde: dia(hoy, 6),  hasta: hoy },
    { id: "mes", nombre: "Este mes",  desde: m1,           hasta: hoy },
    { id: "todo", nombre: "Todo",     desde: "",           hasta: "" },
  ];
}

const ICONO = (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M7 12h10M10 18h4" /></svg>
);

export function Filtros({ hoy, campos }: { hoy: string; campos: Campo[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  const [cargando, empezar] = useTransition();
  const [abierto, setAbierto] = useState(false);

  /* UNA COPIA LOCAL MIENTRAS LA PÁGINA SE VUELVE A PEDIR. Sin ella el
     control se queda pintando lo viejo hasta que el servidor conteste, y
     quien acaba de escoger cree que no le registró el toque. */
  const [local, setLocal] = useState<Record<string, string> | null>(null);
  const leer = (k: string) => local?.[k] ?? q.get(k) ?? "";

  const lista = atajos(hoy);
  const desde = leer("desde");
  const hasta = leer("hasta");
  const cual = lista.find((a) => a.desde === desde && a.hasta === hasta);

  function empujar(cambios: Record<string, string>) {
    setLocal((x) => ({ ...(x ?? {}), ...cambios }));
    const p = new URLSearchParams(q.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    const s = p.toString();
    empezar(() => router.push(s ? `${pathname}?${s}` : pathname));
  }

  /* CUÁNTOS FILTROS HAY PUESTOS ADENTRO. Va en el botón, porque un panel
     cerrado que esconde tres filtros puestos es justo cómo se lee mal
     una cifra. */
  const puestos = campos.filter((c) => leer(c.clave)).length + (!cual ? 1 : 0);

  return (
    <section className={"filtros-inf" + (cargando ? " cargando" : "") + (abierto ? " abierto" : "")}>
      <div className="renglon">
        {lista.map((a) => (
          <button key={a.id} type="button"
                  className={"chip" + (cual?.id === a.id ? " on" : "")}
                  aria-pressed={cual?.id === a.id}
                  onClick={() => empujar({ desde: a.desde, hasta: a.hasta })}>
            {a.nombre}
          </button>
        ))}

        <span className="sep" aria-hidden />

        <span className="resumen">
          {!cual && (desde || hasta) && (
            <><b>{desde || "…"} a {hasta || "…"}</b>{campos.length ? " · " : ""}</>
          )}
          {campos.map((c, i) => {
            const v = leer(c.clave);
            const o = c.opciones.find((x) => x.id === v);
            return (
              <span key={c.clave}>
                {i > 0 && " · "}
                {v ? <b>{o?.nombre ?? v}</b> : <><b>Todas</b> {c.todas}</>}
              </span>
            );
          })}
        </span>

        <button type="button" className={"bt" + (puestos ? " con" : "")}
                aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
          {ICONO}Filtros{puestos > 0 && <i className="cu">{puestos}</i>}
        </button>
      </div>

      {abierto && (
        <div className="panel-f">
          <div className="rango-f" role="group" aria-label="Otras fechas">
            <label className="sel fecha">
              <span>Desde</span>
              <input type="date" value={desde} max={hasta || undefined}
                     onChange={(e) => empujar({ desde: e.target.value })} />
            </label>
            <label className="sel fecha">
              <span>Hasta</span>
              <input type="date" value={hasta} min={desde || undefined}
                     onChange={(e) => empujar({ hasta: e.target.value })} />
            </label>
          </div>

          {campos.map((c) => c.opciones.length === 0 ? null : (
            <label className="sel" key={c.clave}>
              <span>{c.rotulo}</span>
              <select value={leer(c.clave)}
                      onChange={(e) => empujar({ [c.clave]: e.target.value })}>
                <option value="">Todas</option>
                {c.opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </label>
          ))}

          {puestos > 0 && (
            <button type="button" className="limpiar" onClick={() => {
              setLocal(Object.fromEntries(
                ["desde", "hasta", ...campos.map((c) => c.clave)].map((k) => [k, ""])));
              empezar(() => router.push(pathname));
            }}>
              Restablecer
            </button>
          )}
        </div>
      )}
    </section>
  );
}
