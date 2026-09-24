"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * LOS FILTROS DEL ANÁLISIS DE SALIDA.
 *
 * LOS FILTROS VIVEN EN LA DIRECCIÓN, no en el estado de esta pantalla.
 * Es lo que permite mandar por WhatsApp «mira los kilos de la NLW428 en
 * agosto» y que al otro le abra exactamente eso; y lo que hace que el
 * botón de atrás del navegador deshaga el filtro en vez de salirse del
 * módulo.
 *
 * MISMO VOCABULARIO QUE LOS FILTROS DE TRASPASOS —`arriba`, `rango-f`,
 * `sel fecha`, `atajo`, `grupo-f`, `limpiar`— con los tokens de
 * Roturas. El contenedor SÍ cambia de nombre: se llama `filtros-inf` y
 * no `filtros` porque en Roturas ya hay tres pantallas con un
 * `<div class="filtros">` que es otra cosa —una fila de campos suelta—
 * y tiene su propia regla. Reutilizar el nombre habría dejado dos
 * reglas peleándose por el mismo bloque; es la trampa que este proyecto
 * ya se comió cuatro veces. Quien sabe filtrar un informe de traspasos sabe filtrar
 * este sin que nadie le explique nada, y el día que se mejore uno de
 * los dos se sabe dónde está lo mismo en el otro.
 *
 * LOS ATAJOS SON CUATRO Y CUBREN LO QUE SE PREGUNTA DE VERDAD: hoy, la
 * semana, el mes corrido y todo. Cualquier otro rango se escribe en los
 * dos campos de al lado. Poner doce atajos es obligar a leer doce para
 * encontrar el que se usa siempre.
 *
 * «TODO» ES UN ATAJO Y NO LA AUSENCIA DE FILTRO. Sin él, quitar un
 * rango obliga a borrar dos campos de fecha a mano y a acordarse de que
 * eran dos.
 */
export function Filtros({ hoy, placas, tolvas, colores }: {
  hoy: string;
  placas: string[];
  tolvas: string[];
  colores: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  const [cargando, empezar] = useTransition();

  /* UNA COPIA LOCAL MIENTRAS LA PÁGINA SE VUELVE A PEDIR. Sin ella, el
     campo de fecha se queda pintando lo viejo hasta que el servidor
     conteste, y quien está tecleando cree que no se registró la tecla. */
  const [local, setLocal] = useState<Record<string, string>>({});
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef<Record<string, string>>({});

  const leer = (k: string) => local[k] ?? q.get(k) ?? "";
  const rDesde = leer("desde");
  const rHasta = leer("hasta");

  function empujar(cambios: Record<string, string>) {
    const p = new URLSearchParams(q.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    const s = p.toString();
    empezar(() => router.push(s ? `${pathname}?${s}` : pathname));
  }

  /* LAS FECHAS SE ESPERAN UN POCO. Un `<input type=date>` dispara el
     cambio en cada parte que se teclea —día, mes, año— y sin esta
     espera la pantalla se vuelve a pedir tres veces por fecha. */
  function rango(k: "desde" | "hasta", v: string) {
    setLocal((x) => ({ ...x, [k]: v }));
    pendiente.current = { ...pendiente.current, [k]: v };
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => {
      const c = pendiente.current;
      pendiente.current = {};
      empujar(c);
    }, 450);
  }

  const dias = (n: number) => {
    const d = new Date(Date.parse(hoy + "T12:00:00") - n * 86400_000).toISOString().slice(0, 10);
    setLocal({ desde: d, hasta: hoy });
    empujar({ desde: d, hasta: hoy });
  };
  const esteMes = () => {
    const d = hoy.slice(0, 8) + "01";
    setLocal({ desde: d, hasta: hoy });
    empujar({ desde: d, hasta: hoy });
  };
  const todo = () => { setLocal({ desde: "", hasta: "" }); empujar({ desde: "", hasta: "" }) };

  const unDia = hoy;
  const semana = new Date(Date.parse(hoy + "T12:00:00") - 6 * 86400_000).toISOString().slice(0, 10);
  const mes1 = hoy.slice(0, 8) + "01";

  const hay = ["desde", "hasta", "placa", "tolva", "color"].some((k) => leer(k));

  return (
    <section className={"filtros-inf" + (cargando ? " cargando" : "")}>
      <div className="arriba">
        {/* EL RANGO VA PRIMERO: es lo primero que se escoge en un
            informe —qué días— y después ya se afina por placa. */}
        <div className="rango-f" role="group" aria-label="Rango de fechas">
          <label className="sel fecha">
            <span>Desde</span>
            <input type="date" value={rDesde} max={rHasta || undefined}
                   onChange={(e) => rango("desde", e.target.value)} />
          </label>
          <label className="sel fecha">
            <span>Hasta</span>
            <input type="date" value={rHasta} min={rDesde || undefined}
                   onChange={(e) => rango("hasta", e.target.value)} />
          </label>
          <button type="button" className={"atajo" + (rDesde === unDia && rHasta === unDia ? " on" : "")}
                  onClick={() => dias(0)}>Hoy</button>
          <button type="button" className={"atajo" + (rDesde === semana && rHasta === unDia ? " on" : "")}
                  onClick={() => dias(6)}>7 días</button>
          <button type="button" className={"atajo" + (rDesde === mes1 && rHasta === unDia ? " on" : "")}
                  onClick={esteMes}>Este mes</button>
          <button type="button" className={"atajo" + (!rDesde && !rHasta ? " on" : "")}
                  onClick={todo}>Todo</button>
        </div>

        <Grupo rotulo="Placa" clave="placa" puesto={leer("placa")}
               opciones={placas.map((p) => ({ id: p, nombre: p }))} empujar={empujar} />

        <Grupo rotulo="Color del vidrio" clave="color" puesto={leer("color")}
               opciones={colores} empujar={empujar} />

        <Grupo rotulo="Tolva" clave="tolva" puesto={leer("tolva")}
               opciones={tolvas.map((t) => ({ id: t, nombre: t }))} empujar={empujar} />

        {hay && (
          <button type="button" className="limpiar" onClick={() => {
            if (reloj.current) clearTimeout(reloj.current);
            pendiente.current = {};
            setLocal({ desde: "", hasta: "", placa: "", tolva: "", color: "" });
            empezar(() => router.push(pathname));
          }}>
            Restablecer
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * UN GRUPO DE BOTONES, UNO SOLO A LA VEZ.
 *
 * «TODAS» ES UN BOTÓN MÁS Y NO UNA X ESCONDIDA: quitar el filtro tiene
 * que estar en el mismo sitio donde se puso. Se pinta prendido cuando
 * no hay nada escogido, porque eso es exactamente lo que significa.
 *
 * SIN ESTADO PROPIO: lo que está puesto sale de la dirección y vuelve a
 * la dirección. Si guardara su propia copia, el botón de atrás del
 * navegador cambiaría la dirección y los botones seguirían pintando lo
 * anterior.
 *
 * CON MÁS DE OCHO OPCIONES SE VUELVE UN DESPLEGABLE. Veinte placas en
 * botones son dos renglones de ruido que tapan los filtros de al lado;
 * y con guante, veinte objetivos pequeños se aciertan peor que una
 * lista.
 */
function Grupo({ rotulo, clave, puesto, opciones, empujar }: {
  rotulo: string;
  clave: string;
  puesto: string;
  opciones: { id: string; nombre: string }[];
  empujar: (c: Record<string, string>) => void;
}) {
  if (opciones.length === 0) return null;

  if (opciones.length > 8) {
    return (
      <label className="sel">
        <span>{rotulo}</span>
        <select value={puesto} onChange={(e) => empujar({ [clave]: e.target.value })}>
          <option value="">Todas</option>
          {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      </label>
    );
  }

  return (
    <div className="grupo-f" role="group" aria-label={rotulo}>
      <span className="grupo-r">{rotulo}</span>
      <div className="grupo-b">
        <button type="button" className={puesto === "" ? "on" : ""}
                onClick={() => empujar({ [clave]: "" })}>Todas</button>
        {opciones.map((o) => (
          <button key={o.id} type="button" className={puesto === o.id ? "on" : ""}
                  onClick={() => empujar({ [clave]: puesto === o.id ? "" : o.id })}>
            {o.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}
