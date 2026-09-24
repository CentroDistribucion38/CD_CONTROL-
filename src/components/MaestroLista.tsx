"use client";

/* =====================================================================
   LA LISTA DEL MAESTRO — UNA SOLA, PARA TODOS LOS MÓDULOS

   «Mira el maestro de traspaso… en Quiebra, en sitio, en maestro, que
    sea así. Copia el diseño del maestro de traspaso.»

   Y SE EXTRAJO EN VEZ DE COPIARSE. Copiar doscientas líneas de
   componente y ciento cincuenta de CSS a Roturas habría dado la misma
   pantalla HOY y dos pantallas distintas dentro de tres meses: se
   arregla el menú que se salía en una y no en la otra, y nadie se
   entera hasta que alguien lo ve. Es el mismo error que este proyecto
   ya cometió con dos editores para la misma tabla en Inventario.

   QUÉ TRAE CADA RENGLÓN, y por qué:
     · EL ASA para arrastrar. Con eventos de puntero y NO con la API de
       arrastrar del navegador: esa no existe en un celular, y el
       maestro se ordena tanto desde el escritorio como desde la
       tableta del muelle.
     · EL INTERRUPTOR a la vista. Apagar es lo que se hace casi
       siempre —no borrar—, y esconderlo en un menú lo convierte en
       algo que nadie sabe que existe.
     · LA CUENTA DE USO. Es lo que decide si se puede borrar, así que
       tiene que verse ANTES de abrir el menú.
     · EL MENÚ «⋯» para lo raro: renombrar y borrar. «Borrar» a la
       vista, al lado de un interruptor que se toca a diario, se toca
       por error.

   `unidad` ES LA PALABRA DE LA CUENTA: «viaje» en Traspasos, «rotura»
   en Roturas. Va como dato y no escrita adentro porque «159 viajes»
   en el maestro de causas de roturas sería mentira.

   Las clases van con prefijo `ml-` y viven en globals.css: las usan dos
   módulos, y una copia por módulo son dos sitios donde se
   desincronizan.
   ===================================================================== */

import { useEffect, useRef, useState } from "react";

export type FilaMaestro = {
  clave: string;
  nombre: string;
  sub: string | null;
  activo: boolean;
  /** Cuántas veces se ha usado. Es lo que decide si se puede borrar. */
  viajes: number;
};

export function ListaMaestro({ filas, puedeEditar, mandando, sinUso, sinSub, sinRenombrar,
                               borrarSiempre, bandera, unidad = "uso",
                               alOrdenar, alPrender, alRenombrar, alBorrar }: {
  filas: FilaMaestro[];
  puedeEditar: boolean;
  mandando: boolean;
  sinUso: boolean;
  sinSub?: boolean;
  /** La palabra de la cuenta: «viaje», «rotura». Sin plural. */
  unidad?: string;
  /** Una ruta no tiene nombre propio: es el par de puntos. Cambiarle el
   *  nombre no querría decir nada, así que esa opción no se ofrece. */
  sinRenombrar?: boolean;
  /** SE PUEDE BORRAR AUNQUE SE HAYA USADO. Vale para placas y rutas, y
   *  no por relajar la regla: es que la regla no aplica. Ver abajo. */
  borrarSiempre?: boolean;
  /* UNA CASILLA MÁS DE LA FILA, la que solo tiene sentido en una de las
     listas. Hoy es «lleva vidrio en tolvas», de los tipos. Va aquí
     genérica y no dentro de `Fila` porque las otras tres listas no
     tienen ninguna, y una propiedad que casi siempre sobra se vuelve
     una que nadie sabe si hay que llenar. */
  bandera?: {
    rotulo: string;
    /** Lo que se pinta al lado del nombre cuando está puesta. */
    marca: string;
    puesta: (clave: string) => boolean;
    alCambiar: (clave: string, valor: boolean) => void;
  };
  alOrdenar: (claves: string[]) => void;
  alPrender: (clave: string, activo: boolean) => void;
  alRenombrar: (clave: string, nombre: string, sub: string | null) => void;
  alBorrar: (clave: string, nombre: string) => void;
}) {
  /* El orden que se está viendo. Sale de lo que llegó del servidor y
     solo se aparta de él mientras alguien arrastra. */
  const [orden, setOrden] = useState<string[]>(() => filas.map((f) => f.clave));
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const llaves = filas.map((f) => f.clave).join("|");
  useEffect(() => { setOrden(filas.map((f) => f.clave)) },
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [llaves]);

  const porClave = new Map(filas.map((f) => [f.clave, f]));
  const vistas = orden.map((c) => porClave.get(c)).filter(Boolean) as FilaMaestro[];

  /* ------------------------------------------------------------------
     ARRASTRAR CON EL DEDO O CON EL RATÓN.

     Con eventos de puntero y NO con la API de arrastrar del navegador:
     esa no existe en un celular, y el maestro se ordena tanto desde el
     escritorio como desde la tableta del muelle. La posición se calcula
     con la mitad de cada renglón, que es lo que hace que el salto pase
     cuando el dedo pasa por la mitad y no cuando toca el borde.
     ------------------------------------------------------------------ */
  function tomar(e: React.PointerEvent, clave: string) {
    if (!puedeEditar) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setMoviendo(clave);
  }

  function mover(e: React.PointerEvent) {
    if (!moviendo || !caja.current) return;
    const filasDom = Array.from(caja.current.querySelectorAll<HTMLElement>(".ml-item"));
    const y = e.clientY;
    let destino = filasDom.length - 1;
    for (let i = 0; i < filasDom.length; i++) {
      const r = filasDom[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { destino = i; break }
    }
    const desde = orden.indexOf(moviendo);
    if (desde < 0 || desde === destino) return;
    const siguiente = orden.slice();
    siguiente.splice(destino, 0, siguiente.splice(desde, 1)[0]);
    setOrden(siguiente);
  }

  function soltar() {
    if (!moviendo) return;
    setMoviendo(null);
    /* Solo se guarda si de verdad cambió: un toque en el asa sin
       arrastrar no tiene por qué escribir en la base. */
    if (orden.join("|") !== llaves) alOrdenar(orden);
  }

  return (
    <div ref={caja} data-ml-caja onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
      {vistas.map((f) => (
        <Renglon key={f.clave} f={f} sinSub={sinSub} sinUso={sinUso}
                 sinRenombrar={sinRenombrar} borrarSiempre={borrarSiempre}
                 puedeEditar={puedeEditar} mandando={mandando}
                 moviendo={moviendo === f.clave} unidad={unidad}
                 alTomar={(e) => tomar(e, f.clave)}
                 bandera={bandera}
                 alPrender={alPrender} alRenombrar={alRenombrar} alBorrar={alBorrar} />
      ))}
    </div>
  );
}

function Renglon({ f, sinSub, sinRenombrar, borrarSiempre, sinUso, puedeEditar, mandando,
                   moviendo, bandera, unidad, alTomar, alPrender, alRenombrar, alBorrar }: {
  f: FilaMaestro;
  sinSub?: boolean;
  sinRenombrar?: boolean;
  borrarSiempre?: boolean;
  sinUso: boolean;
  puedeEditar: boolean;
  mandando: boolean;
  moviendo: boolean;
  unidad: string;
  bandera?: {
    rotulo: string; marca: string;
    puesta: (clave: string) => boolean;
    alCambiar: (clave: string, valor: boolean) => void;
  };
  alTomar: (e: React.PointerEvent) => void;
  alPrender: (clave: string, activo: boolean) => void;
  alRenombrar: (clave: string, nombre: string, sub: string | null) => void;
  alBorrar: (clave: string, nombre: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  /* HACIA DÓNDE SE ABRE, y se mide contra LA TARJETA, no contra la
     pantalla. Abierto hacia abajo en el último renglón, el menú se
     montaba encima de la tarjeta de al lado: no se cortaba, pero se veía
     como si fuera parte de la otra. Así que si no cabe abajo y sí cabe
     arriba, se abre hacia arriba y queda dentro de su propia tarjeta.
     Solo cuando no cabe de ningún lado —una tarjeta de dos renglones—
     se decide por la pantalla, que es lo único que queda.
     null = todavía sin medir: se pinta invisible un cuadro. */
  const [arriba, setArriba] = useState<boolean | null>(null);
  const [editando, setEditando] = useState(false);
  const [nom, setNom] = useState(f.nombre);
  const [sub, setSub] = useState(f.sub ?? "");
  const cajaMenu = useRef<HTMLDivElement>(null);
  const disparo = useRef<HTMLButtonElement>(null);
  const hoja = useRef<HTMLDivElement>(null);

  /* SE MIDE EL MENÚ DE VERDAD, no se estima. Un menú con la nota de
     "los 44 viajes no se pierden" mide el doble que uno de dos
     opciones; calcularlo a ojo era equivocarse en la mitad de las
     filas. Se pinta invisible, se mide, se coloca — todo antes de que
     el ojo alcance a ver nada. */
  useEffect(() => {
    if (!menu) { setArriba(null); return }
    const m = hoja.current, d = disparo.current;
    if (!m || !d) return;
    const alto = m.offsetHeight;
    const r = d.getBoundingClientRect();
    const caja = (d.closest("[data-ml-caja]") ?? d.closest("main"))!.getBoundingClientRect();
    const abajo = caja.bottom - r.bottom - 4;
    const encima = r.top - caja.top - 4;
    if (alto <= abajo) setArriba(false);
    else if (alto <= encima) setArriba(true);
    else {
      const vAbajo = window.innerHeight - r.bottom;
      setArriba(alto > vAbajo && r.top > vAbajo);
    }
  }, [menu]);

  /* Un menú abierto se cierra al tocar cualquier otra parte. Sin esto
     quedan tres menús abiertos a la vez y el de abajo tapa al de
     arriba.
     SE PREGUNTA POR EL NODO Y NO SE CORTA EL EVENTO. React no cuelga
     sus escuchas de document sino de la raíz de la app, así que un
     stopPropagation de React no detiene esta escucha: el menú se
     cerraría antes de que llegara el clic y ninguna opción de adentro
     llegaría a funcionar nunca. */
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => {
      if (!cajaMenu.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [menu]);

  /* CUÁNDO SE PUEDE BORRAR, y por qué son dos reglas distintas.

     PUNTOS Y TIPOS: solo si nunca se usaron. La tabla de viajes los
     REFERENCIA por llave foránea —traspasos_viajes.origen, .destino y
     .tipo—, así que borrar uno usado lo rechazaría la base. Se dice
     antes en vez de dejar salir un "violates foreign key constraint".

     PLACAS Y RUTAS: siempre. No hay ninguna llave foránea hacia ellas:
     la placa se guarda como texto dentro de cada viaje y la ruta sale
     del origen y el destino de ese viaje. Borrarlas del maestro no
     toca un solo viaje —siguen con su placa y su ruta escritas—, solo
     dejan de ofrecerse al registrar. Copiar aquí la regla de puntos y
     tipos era prohibir algo que la base permite sin riesgo. */
  const sePuedeBorrar = puedeEditar && (borrarSiempre || (!sinUso && f.viajes === 0));

  if (editando) {
    return (
      <form className="ml-agregar"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nom.trim()) return;
              alRenombrar(f.clave, nom.trim(), sub.trim() || null);
              setEditando(false);
            }}>
        <input value={nom} autoFocus aria-label="Nombre"
               onChange={(e) => setNom(e.target.value)} />
        {!sinSub && (
          <input value={sub} placeholder="Subtítulo — Planta, Zona interna…"
                 aria-label="Subtítulo" onChange={(e) => setSub(e.target.value)} />
        )}
        <button type="submit" disabled={!nom.trim() || mandando}>Guardar</button>
        <button type="button" className="ml-plano" onClick={() => {
          setNom(f.nombre); setSub(f.sub ?? ""); setEditando(false);
        }}>Dejar así</button>
      </form>
    );
  }

  return (
    <div className={"ml-item" + (f.activo ? "" : " ml-apagado") + (moviendo ? " ml-moviendo" : "")}>
      {puedeEditar ? (
        <button type="button" className="ml-asa" onPointerDown={alTomar}
                aria-label={`Mover ${f.nombre}`} title="Arrastrar para cambiar el orden">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
          </svg>
        </button>
      ) : <span className="ml-asa" />}

      <div className="ml-nom">
        <b>{f.nombre}</b>
        {/* LA MARCA SE VE SIN ABRIR NADA. Una bandera que solo se
            asoma dentro de un menú de tres puntos es una bandera que
            nadie sabe que existe — y esta decide si al registrar sale
            el bloque del vidrio. */}
        {bandera?.puesta(f.clave) && <em className="ml-bandera">{bandera.marca}</em>}
        {!sinSub || f.sub ? <span>{f.sub}</span> : null}
      </div>

      <span className="ml-uso">
        {sinUso ? "—" : `${f.viajes.toLocaleString("es-CO")} ${unidad}${f.viajes === 1 ? "" : "s"}`}
      </span>

      <label className="ml-sw" title={f.activo ? "Se puede escoger" : "Ya no se puede escoger"}>
        <input type="checkbox" checked={f.activo} disabled={!puedeEditar || mandando}
               aria-label={`${f.nombre}: se puede escoger`}
               onChange={(e) => alPrender(f.clave, e.target.checked)} />
        <i />
      </label>

      <div className="ml-mas" ref={cajaMenu}>
        <button type="button" ref={disparo} aria-label={`Opciones de ${f.nombre}`}
                aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
        {menu && (
          <div ref={hoja}
               className={"ml-menu" + (arriba === null ? " ml-midiendo" : arriba ? " ml-arriba" : "")}>
            {!sinRenombrar && (
              <button type="button" disabled={!puedeEditar}
                      onClick={() => { setMenu(false); setEditando(true) }}>
                {sinSub ? "Cambiar el nombre" : "Cambiar nombre y subtítulo"}
              </button>
            )}
            <button type="button" disabled={!puedeEditar || mandando}
                    onClick={() => { setMenu(false); alPrender(f.clave, !f.activo) }}>
              {f.activo ? "Apagar" : "Prender"}
            </button>
            {bandera && (
              <button type="button" disabled={!puedeEditar || mandando}
                      onClick={() => { setMenu(false);
                                       bandera.alCambiar(f.clave, !bandera.puesta(f.clave)) }}>
                {bandera.puesta(f.clave) ? `Quitar: ${bandera.rotulo}` : bandera.rotulo}
              </button>
            )}
            {sePuedeBorrar ? (
              <>
                <button type="button" className="ml-mal" disabled={mandando}
                        onClick={() => { setMenu(false); alBorrar(f.clave, f.nombre) }}>
                  Borrar
                </button>
                {/* SE DICE QUÉ PASA CON LOS VIAJES. "Borrar" al lado de
                    "142 viajes" da a entender que se van con ella. */}
                {borrarSiempre && f.viajes > 0 && (
                  <div className="ml-nota">
                    Los {f.viajes} {unidad}{f.viajes === 1 ? "" : "s"} que lo nombran no se
                    pierden: queda escrita en cada uno. Solo deja de poderse escoger.
                  </div>
                )}
              </>
            ) : (
              <div className="ml-nota">
                {sinUso
                  ? "Para saber si se puede borrar falta correr la migración del maestro."
                  : `No se puede borrar: ya lo nombran ${f.viajes} ${unidad}${f.viajes === 1 ? "" : "s"}. Apágalo y deja de poderse escoger.`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
