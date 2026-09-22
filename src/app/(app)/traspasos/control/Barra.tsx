"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { TipoViaje } from "@/modulos/traspasos/datos";
import { TURNOS } from "@/modulos/traspasos/formato";
import { PALETA_MARCA, paletaDeTema, aRGB } from "@/modulos/rotlinea/hoja";

/** Los colores del tema de quien exporta, para que el Excel salga con
 *  ellos. Se leen del `[data-tema]` más cercano, igual que la hoja de
 *  rotura y el consolidado de inventario. */
function coloresDelTema(dentro: Element | null) {
  const conTema = dentro?.closest("[data-tema]");
  const P = (() => {
    if (!conTema) return PALETA_MARCA;
    const leer = (v: string) => {
      const t = document.createElement("span");
      t.style.color = `var(${v})`; t.style.display = "none";
      conTema.appendChild(t); const c = aRGB(getComputedStyle(t).color); t.remove(); return c;
    };
    const tinta = leer("--c-04203f"), acento = leer("--c-marca"), hondo = leer("--c-marca-hondo");
    return tinta && acento ? paletaDeTema(tinta, acento, hondo ?? acento) : PALETA_MARCA;
  })();
  const hx = (c: number[]) => c.map((v) => v.toString(16).padStart(2, "0")).join("");
  return { tinta: hx(P.tinta), banda: hx(P.cinta[1]?.[1] ?? P.acento) };
}

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
export function Barra({ tipos, soloBotones, soloFiltros, hoy, dia, desde, hasta }: {
  tipos: TipoViaje[];
  /** El día de hoy y el día en el que está parada la pantalla. */
  hoy?: string;
  dia?: string;
  /** El rango que la pantalla está mostrando, ya resuelto en el
   *  servidor: puede venir de `desde`/`hasta` o del día y la ventana.
   *  Es el que se le pide al Excel, para que el archivo diga lo mismo
   *  que la pantalla — que es todo el punto de poder bajarlo. */
  desde?: string;
  hasta?: string;
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

  const hay = valorDe("dias") || valorDe("turno") || valorDe("tipo") || params.get("d")
           || params.get("desde") || params.get("hasta");

  /* ==================================================================
     EL RANGO: DOS FECHAS Y YA.

     Antes era un desplegable de períodos fijos —hoy, ayer y hoy,
     últimos 7, últimos 30— y con eso no se podía pedir «del 1 al 15 de
     agosto». Dos campos de fecha piden cualquier cosa, incluido un día
     solo (las dos iguales) y MAÑANA, que es como se revisa el plan
     antes de que empiece el turno.

     LAS DOS FECHAS VIAJAN JUNTAS y borran `d` y `dias`: son la forma
     vieja de decir lo mismo, y dejarlas puestas haría que la pantalla
     obedeciera a una y el Excel a la otra.
     ================================================================== */
  const mañana = hoy
    ? new Date(Date.parse(hoy + "T12:00:00") + 86400_000).toISOString().slice(0, 10)
    : "";
  const rDesde = valorDe("desde") || desde || dia || hoy || "";
  const rHasta = valorDe("hasta") || hasta || dia || hoy || "";

  /* Las dos fechas se mandan juntas y con espera: escribir una fecha a
     mano pasa por estados a medio escribir («0002-08-…»), y sin la
     espera cada uno de esos sería una consulta. */
  function rango(cual: "desde" | "hasta", v: string) {
    const otro = cual === "desde" ? rHasta : rDesde;
    const nuevo = { ...pendiente.current,
      desde: cual === "desde" ? v : otro, hasta: cual === "hasta" ? v : otro,
      d: "", dias: "" };
    pendiente.current = nuevo;
    setLocal(nuevo);
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => mandar(nuevo), ESPERA);
  }
  const unDia = (f: string) => {
    if (reloj.current) clearTimeout(reloj.current);
    const nuevo = { ...pendiente.current, desde: f, hasta: f, d: "", dias: "" };
    pendiente.current = nuevo; setLocal(nuevo);
    mandar(nuevo);
  };

  /* ---------- BAJAR EL EXCEL ----------
     Se le pide al servidor el MISMO rango y los MISMOS filtros que la
     pantalla está mostrando: un archivo que dice otra cosa que el
     tablero no sirve para evidenciar nada. */
  const [bajando, setBajando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  async function bajarExcel() {
    if (bajando || !rDesde || !rHasta) return;
    setBajando(true); setMal(null);
    try {
      const c = coloresDelTema(document.querySelector(".tp"));
      const p = new URLSearchParams({ desde: rDesde, hasta: rHasta, tinta: c.tinta, banda: c.banda });
      const tu = valorDe("turno"), ti = valorDe("tipo");
      if (tu) p.set("turno", tu);
      if (ti) p.set("tipo", ti);
      const r = await fetch(`/api/traspasos/exportar?${p}`);
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setMal(j?.error ?? `No se pudo bajar (${r.status}).`);
        return;
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `traspasos-${rDesde}${rDesde === rHasta ? "" : `-a-${rHasta}`}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      setMal("No se pudo bajar el archivo. Revisa la conexión.");
    } finally {
      setBajando(false);
    }
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
        {/* EL EXCEL ES LA EVIDENCIA. El PDF es la foto de la pantalla;
            esto es la data, con el detalle viaje por viaje para cruzar
            con SAP. */}
        <button type="button" className="accion hoja" onClick={bajarExcel} disabled={bajando}>
          <svg viewBox="0 0 24 24"><path d="M12 3v12" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M4.5 20h15" /></svg>
          {bajando ? "Armando el Excel…" : "Bajar Excel"}
        </button>
        {mal && <p className="mal-informe" role="alert">{mal}</p>}
      </div>
      )}

      {!soloBotones && (
      <section className={"filtros" + (cargando ? " cargando" : "")}>
        <div className="arriba">
          {/* EL RANGO, A LA IZQUIERDA DE TODO: es lo primero que se
              escoge en un informe —qué días— y después ya se afina por
              turno y por tipo. */}
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
            {/* DOS ATAJOS Y NO CINCO. «Hoy» es a donde se vuelve, y
                «Mañana» es la única fecha del futuro que tiene sentido
                mirar: el plan antes de que empiece el turno. Todo lo
                demás se escribe en los dos campos de al lado. */}
            {hoy && (
              <button type="button" className={"atajo" + (rDesde === hoy && rHasta === hoy ? " on" : "")}
                      onClick={() => unDia(hoy)}>Hoy</button>
            )}
            {mañana && (
              <button type="button" className={"atajo" + (rDesde === mañana && rHasta === mañana ? " on" : "")}
                      onClick={() => unDia(mañana)}>Mañana</button>
            )}
          </div>

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
              setLocal({ dias: "", turno: "", tipo: "", desde: "", hasta: "" });
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
