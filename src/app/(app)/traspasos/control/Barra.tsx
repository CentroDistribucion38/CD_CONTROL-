"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { TipoViaje } from "@/modulos/traspasos/datos";
import { TURNOS } from "@/modulos/traspasos/formato";

/**
 * LOS FILTROS Y LOS DOS BOTONES.
 *
 * LOS FILTROS VIVEN EN LA DIRECCIÓN, no en el estado de esta pantalla.
 * Es lo que permite mandar por WhatsApp "mira el turno C de ayer" y que
 * al otro le abra exactamente eso; y lo que hace que el botón de atrás
 * del navegador deshaga el filtro en vez de salirse del módulo. De paso,
 * el filtrado lo hace la base: con un año de viajes, filtrar en el
 * navegador obligaría a bajarlos todos para mirar un turno.
 *
 * EL PDF LO HACE EL NAVEGADOR. No hay librería ni servidor que lo arme:
 * lo que imprime es exactamente lo que se está viendo —con los filtros
 * puestos—, que es justo lo que nunca cuadra cuando el PDF se genera
 * aparte.
 */
export function Barra({ tipos, soloBotones, soloFiltros, hoy, dia }: {
  tipos: TipoViaje[];
  /** El día de hoy y el día en el que está parada la pantalla. */
  hoy?: string;
  dia?: string;
  /* Se parte en dos porque las dos mitades van en sitios distintos de
     la página —los botones arriba a la derecha, los filtros a lo ancho
     debajo del título— y separarlas en dos componentes obligaría a
     repetir el manejo de la dirección en los dos. */
  soloBotones?: boolean;
  soloFiltros?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [cargando, empezar] = useTransition();

  /* ==================================================================
     POR QUÉ ESTO NO NAVEGA EN CADA TOQUE

     Cambiar un filtro vuelve a dibujar la pantalla EN EL SERVIDOR: se
     piden los viajes otra vez y se manda el HTML nuevo. Con un botón
     por cada turno y cada tipo, prender «A» y «C» eran DOS viajes
     completos al servidor —y el primero se tiraba a la basura apenas
     se tocaba el segundo—. Escoger tres tipos, tres. Por eso se sentía
     trabado: no era la conexión, era que se estaba pidiendo el trabajo
     una vez por clic.

     DOS COSAS, Y HACEN FALTA LAS DOS:

     1. EL BOTÓN SE PRENDE DE UNA, sin esperar al servidor. Lo que se
        acaba de tocar se guarda aquí y la pantalla lo pinta ya. Sin
        esto, entre el clic y la respuesta no pasaba nada visible y el
        remedio de todo el mundo es volver a hacer clic — pedir el
        mismo trabajo dos veces.

     2. LA CONSULTA ESPERA A QUE TERMINES DE ESCOGER. Cada toque
        reinicia un reloj de 400 ms; solo cuando pasan sin que toques
        nada más, se manda UNA consulta con todo lo escogido. Prender
        A, B y C seguidos es un viaje al servidor, no tres.

     400 ms no es un número al azar: por debajo de 250 el reloj se
     dispara entre dos clics seguidos y vuelve a ser una consulta por
     botón; por encima de 600 se siente que la pantalla se quedó
     pensando después del último toque.

     LO QUE ESTÁ PUESTO SIGUE VIVIENDO EN LA DIRECCIÓN. Esto es una
     copia de paso, no un estado paralelo: en cuanto la dirección
     cambia —por esta consulta o por el botón de atrás del navegador—
     la copia se tira y manda la dirección otra vez. Si se quedara,
     el botón de atrás cambiaría la URL y los filtros seguirían
     pintando lo anterior.
     ================================================================== */
  const ESPERA = 400;
  const [local, setLocal] = useState<Record<string, string>>({});
  const pendiente = useRef<Record<string, string>>({});
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* La dirección cambió: lo que se estaba escogiendo ya llegó (o alguien
     le dio atrás). Se suelta la copia y vuelve a mandar la URL. */
  const urlActual = params.toString();
  useEffect(() => {
    pendiente.current = {};
    setLocal({});
  }, [urlActual]);

  /* Y si el componente se va mientras el reloj corre, no queda un
     temporizador apuntando a una pantalla que ya no existe. */
  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current) }, []);

  const valorDe = (clave: string) => local[clave] ?? params.get(clave) ?? "";

  function mandar(vals: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(vals)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    const q = p.toString();
    empezar(() => router.push(q ? `${pathname}?${q}` : pathname));
  }

  /* Se pinta ya y se manda después. */
  function poner(clave: string, valor: string) {
    const nuevo = { ...pendiente.current, [clave]: valor };
    pendiente.current = nuevo;
    setLocal(nuevo);
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => mandar(nuevo), ESPERA);
  }

  const lista = (clave: string) =>
    valorDe(clave).split(",").map((x) => x.trim()).filter(Boolean);

  function alternar(clave: string, valor: string) {
    const puestos = lista(clave);
    const nuevos = puestos.includes(valor)
      ? puestos.filter((x) => x !== valor)
      : [...puestos, valor];
    poner(clave, nuevos.join(","));
  }

  const hay = valorDe("dias") || valorDe("turno") || valorDe("tipo") || params.get("d");

  /* MAÑANA ES UN PERÍODO, no un caso aparte.
     El plan se arma para mañana y hasta ahora no había dónde mirarlo:
     la ventana terminaba siempre en hoy. Poner la fecha en la barra de
     arriba ya lo resuelve, pero nadie va a buscar ahí lo que todo el
     mundo busca en «Período» — que es la palabra que dice qué rango se
     está viendo. Así que mañana entra aquí, y de paso los rótulos dejan
     de mentir cuando la pantalla está parada en otro día. */
  const mañana = hoy
    ? new Date(Date.parse(hoy + "T12:00:00") + 86400_000).toISOString().slice(0, 10)
    : "";
  const enMañana = !!dia && dia === mañana;
  const dias = params.get("dias") ?? "0";
  const valor = enMañana ? "m" : dias;

  /* El período y el día son el MISMO control: escoger "mañana" mueve la
     fecha y deja la ventana en un día; escoger cualquier otro vuelve a
     hoy. Si fueran dos, se podría pedir "últimos 30 días terminando
     mañana", que no quiere decir nada. */
  function periodo(v: string) {
    /* Va por ponerYa y no por poner: un desplegable se escoge una sola
       vez, no se encadena con otro, así que esperar 400 ms sería
       retraso puro sin nada que agrupar. */
    if (v === "m") ponerYa2({ d: mañana, dias: "" });
    else ponerYa2({ d: "", dias: v === "0" ? "" : v });
  }

  /* Dos claves de un golpe: el período toca `d` y `dias` a la vez, y
     mandarlas por separado dispararía dos consultas. */
  function ponerYa2(vals: Record<string, string>) {
    if (reloj.current) clearTimeout(reloj.current);
    mandar({ ...pendiente.current, ...vals });
  }

  return (
    <>
      {!soloFiltros && (
      <div className="acciones-informe">
        <button type="button" className="accion" onClick={() => router.refresh()}>
          <svg viewBox="0 0 24 24"><path d="M20 11.5A8 8 0 1 1 17.7 6" /><path d="M20 4v6h-6" /></svg>
          Actualizar
        </button>
        <button type="button" className="accion" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24"><path d="M8 3.5h5.5L18 8v12.5H6V3.5z" /><path d="M13.5 3.5V8H18" /></svg>
          Generar PDF
        </button>
      </div>
      )}

      {!soloBotones && (
      <section className={"filtros" + (cargando ? " cargando" : "")}>
        <div className="arriba">
          <label className="sel">
            <span>Período</span>
            <select value={valor} onChange={(e) => periodo(e.target.value)}>
              {/* MAÑANA VA DE PRIMERO: el plan se arma para mañana, y
                  revisarlo antes de que empiece el turno es lo único
                  que todavía se puede arreglar. Lo de atrás ya pasó. */}
              {mañana && <option value="m">Mañana · solo el plan</option>}
              <option value="0">Hoy</option>
              <option value="1">Ayer y hoy</option>
              <option value="6">Últimos 7 días</option>
              <option value="29">Últimos 30 días</option>
            </select>
          </label>

          <Grupo rotulo="Turno" clave="turno" vacio="Todos"
                 opciones={TURNOS.map((t) => ({ id: t, nombre: t }))}
                 puestos={lista("turno")} alternar={alternar} poner={poner} />

          <Grupo rotulo="Tipo de viaje" clave="tipo" vacio="Todos"
                 opciones={tipos.map((t) => ({ id: t.clave, nombre: t.nombre }))}
                 puestos={lista("tipo")} alternar={alternar} poner={poner} />

          {hay && (
            <button type="button" className="limpiar" onClick={() => {
              if (reloj.current) clearTimeout(reloj.current);
              pendiente.current = {};
              setLocal({ dias: "", turno: "", tipo: "" });
              empezar(() => router.push(pathname));
            }}>
              Restablecer
            </button>
          )}
        </div>
      </section>
      )}
    </>
  );
}

/**
 * UN GRUPO DE BOTONES QUE SE PRENDEN Y SE APAGAN.
 *
 * «TODOS» ES UN BOTÓN MÁS Y NO UNA X ESCONDIDA. Quitar tres filtros de
 * a uno son tres toques y hay que acordarse de cuáles estaban puestos;
 * «Todos» es uno y siempre está en el mismo sitio. Se pinta prendido
 * cuando no hay nada escogido, porque eso es exactamente lo que
 * significa: se están viendo todos.
 *
 * SIN ESTADO PROPIO. Lo que está puesto sale de la dirección y vuelve a
 * la dirección; el componente solo dibuja. Si guardara su propia copia,
 * el botón de atrás del navegador cambiaría la dirección y los botones
 * se quedarían pintando lo anterior.
 */
function Grupo({ rotulo, clave, vacio, opciones, puestos, alternar, poner }: {
  rotulo: string;
  clave: string;
  vacio: string;
  opciones: { id: string; nombre: string }[];
  puestos: string[];
  alternar: (clave: string, valor: string) => void;
  poner: (clave: string, valor: string) => void;
}) {
  const todos = puestos.length === 0;
  return (
    <div className="grupo-f" role="group" aria-label={rotulo}>
      <span className="grupo-r">
        {rotulo}
        {/* Cuántos hay puestos, al lado del rótulo. Con nueve tipos y
            tres escogidos, contar los botones prendidos es trabajo. */}
        {!todos && <i>{puestos.length}</i>}
      </span>
      <div className="grupo-b">
        <button type="button" className={todos ? "on" : ""}
                aria-pressed={todos}
                onClick={() => poner(clave, "")}>{vacio}</button>
        {opciones.map((o) => {
          const on = puestos.includes(o.id);
          return (
            <button key={o.id} type="button" className={on ? "on" : ""}
                    aria-pressed={on}
                    onClick={() => alternar(clave, o.id)}>{o.nombre}</button>
          );
        })}
      </div>
    </div>
  );
}
