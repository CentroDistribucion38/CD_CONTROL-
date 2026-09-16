"use client";

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

  function poner(clave: string, valor: string) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(clave, valor); else p.delete(clave);
    router.push(`${pathname}?${p.toString()}`);
  }

  /* ------------------------------------------------------------------
     FILTROS DE VARIOS A LA VEZ

     UN <select> NO SIRVE PARA ESTO, y no es cuestión de gusto: un
     desplegable normal escoge UNA cosa. Para ver el turno A y el C
     juntos —dejando fuera el B— no hay forma de decírselo. El
     <select multiple> sí existe, pero se usa con ctrl+clic, en el
     celular no se puede y nadie sabe que hay que hacerlo.

     BOTONES QUE SE PRENDEN Y SE APAGAN. Se ve de un vistazo qué está
     puesto —sin abrir nada—, se toca con el dedo, y prender dos es
     tocar dos. El precio es que ocupan más sitio que un desplegable
     cerrado; para tres turnos y nueve tipos, cabe.

     NINGUNO PRENDIDO SIGNIFICA TODOS, que es como funciona cualquier
     filtro: no filtrar es ver todo. Obligar a prender los tres para ver
     los tres sería pedir trabajo para no pedir nada.

     EN LA DIRECCIÓN VAN SEPARADOS POR COMA —?turno=A,C— así que un
     enlace con dos turnos se puede mandar por chat igual que antes, y
     los enlaces viejos de un solo turno siguen abriendo lo mismo. */
  const lista = (clave: string) =>
    (params.get(clave) ?? "").split(",").map((x) => x.trim()).filter(Boolean);

  function alternar(clave: string, valor: string) {
    const puestos = lista(clave);
    const nuevos = puestos.includes(valor)
      ? puestos.filter((x) => x !== valor)
      : [...puestos, valor];
    poner(clave, nuevos.join(","));
  }

  const hay = params.get("dias") || params.get("turno") || params.get("tipo") || params.get("d");

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
    const p = new URLSearchParams(params.toString());
    if (v === "m") { p.set("d", mañana); p.delete("dias") }
    else {
      p.delete("d");
      if (v === "0") p.delete("dias"); else p.set("dias", v);
    }
    const q = p.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
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
      <section className="filtros">
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
            <button type="button" className="limpiar" onClick={() => router.push(pathname)}>
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
