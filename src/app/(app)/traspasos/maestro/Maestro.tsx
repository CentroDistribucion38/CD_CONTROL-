"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { PlacaM, Punto, PuntoFaltante, RutaM, TipoViaje } from "@/modulos/traspasos/datos";

/**
 * EL MAESTRO DE TRASPASOS.
 *
 * Dos listas —puntos y tipos— y, entre medio, lo único que impide que
 * el maestro se vacíe solo: lo que la gente escribió a mano en el
 * registro porque todavía no estaba en la lista.
 *
 * ESO SE PARTE EN DOS PREGUNTAS DISTINTAS, y esta pantalla es la que
 * las separa:
 *
 *   ¿es un sitio NUEVO?     -> Agregar. Y al agregarlo, los viajes
 *                              viejos que lo nombraban pasan a
 *                              apuntarlo: si no, el contador baja y el
 *                              informe por punto sigue partido.
 *
 *   ¿es el MISMO mal        -> Unir. Abajo, con las dos escrituras y
 *    escrito?                  cuántos viajes lleva cada una a la
 *                              vista, porque quien aprieta el botón
 *                              tiene que poder ver que no se está
 *                              comiendo un sitio de verdad.
 *
 * NADA SE BORRA SI YA SE USÓ. La base lo rechazaría igual por la llave
 * foránea, pero "violates foreign key constraint" no le explica nada a
 * quien está mirando la pantalla: decirlo antes —"usado en 43 viajes"—
 * sí.
 */

type Uso = {
  tipos: Record<string, number>;
  puntos: Record<string, number>;
  placas: Record<string, number>;
  rutas: Record<string, number>;
  ultima: Record<string, string>;
  falta: boolean;
};

/** Es una lista del maestro: puntos o tipos. Los dos se pintan igual. */
type Fila = {
  clave: string;
  nombre: string;
  sub: string | null;
  activo: boolean;
  viajes: number;
};

export function Maestro({ tipos, puntos, placas, rutas, faltantes, uso, puedeEditar }: {
  tipos: TipoViaje[];
  puntos: Punto[];
  placas: PlacaM[];
  rutas: RutaM[];
  faltantes: PuntoFaltante[];
  uso: Uso;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [mandando, setMandando] = useState(false);

  const [nuevoPunto, setNuevoPunto] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState("");
  const [nuevaPlaca, setNuevaPlaca] = useState("");
  const [rOrigen, setROrigen] = useState("");
  const [rDestino, setRDestino] = useState("");

  /* Para armar una ruta solo sirven los puntos ACTIVOS: ofrecer uno
     apagado sería ofrecer una ruta que el registro no va a aceptar. */
  const puntosVivos = puntos.filter((p) => p.activo);

  /* SOLO QUEDAN LOS DUPLICADOS. La franja de "sitios escritos a mano"
     se fue, y no por gusto: existía porque Registrar dejaba escribir el
     sitio a mano. Ahora Registrar escoge del maestro, así que por ahí ya
     no entra nada nuevo — la franja solo podía mostrar restos viejos.

     Lo que SÍ sigue haciendo falta es unir esos restos con el punto al
     que pertenecen: mientras estén sueltos no cuentan en ningún informe
     por punto. Eso es la sección de abajo, y esa se queda. */
  const dobles = faltantes.filter((f) => f.parecido);

  /* ------------------------------------------------------------------
     AGREGAR UN PUNTO.

     Va por la función y no por un insert directo porque la función es
     la que adopta los viajes que ya venían nombrando ese sitio a mano.
     Si la función todavía no está —falta correr la migración— se cae
     al insert de antes en vez de dejar la pantalla muerta, y se dice
     qué archivo falta.
     ------------------------------------------------------------------ */
  async function agregarPunto(nombre: string, sub?: string | null) {
    const n = nombre.trim();
    if (!n) return;
    setMandando(true);
    const r = await supabase.rpc("traspaso_agregar_punto", {
      p_nombre: n, p_descripcion: sub ?? null,
    });
    setMandando(false);

    if (!r.error) {
      const adoptados = (r.data as { adoptados: number }[] | null)?.[0]?.adoptados ?? 0;
      setNuevoPunto("");
      avisar.bien(
        adoptados
          ? `${n} quedó en el maestro y se llevó ${adoptados} viaje${adoptados === 1 ? "" : "s"} que estaban sueltos.`
          : `${n} quedó en el maestro. Los viajes nuevos ya lo pueden escoger.`,
      );
      router.refresh();
      return;
    }

    if (!faltaLaFuncion(r.error.message)) { avisar.mal(r.error.message); return }

    const { error } = await supabase.from("traspasos_puntos")
      .insert({ clave: clave(n), nombre: n });
    if (error) { avisar.mal(error.message); return }
    setNuevoPunto("");
    avisar.bien(
      `${n} quedó en el maestro. Los viajes viejos que lo nombraban siguen sueltos: ` +
      `para que se los lleve hay que correr supabase/migraciones/2026-09-traspasos-maestro.sql.`,
    );
    router.refresh();
  }

  async function unir(texto: string, clavePunto: string, nombrePunto: string) {
    setMandando(true);
    const { data, error } = await supabase.rpc("traspaso_unir_punto",
      { p_texto: texto, p_clave: clavePunto });
    setMandando(false);
    if (error) {
      avisar.mal(faltaLaFuncion(error.message)
        ? "Para unir puntos falta correr supabase/migraciones/2026-09-traspasos-maestro.sql en Supabase."
        : error.message);
      return;
    }
    const n = (data as number) ?? 0;
    avisar.bien(`${n} viaje${n === 1 ? "" : "s"} que decían «${texto}» ahora cuentan en ${nombrePunto}.`);
    router.refresh();
  }

  async function agregarPlaca() {
    const n = nuevaPlaca.trim();
    if (!n) return;
    setMandando(true);
    const { data, error } = await supabase.rpc("traspaso_agregar_placa",
      { p_placa: n, p_nota: null });
    setMandando(false);
    if (error) {
      avisar.mal(faltaLaFuncion(error.message)
        ? "Falta correr supabase/migraciones/2026-09-traspasos-placas-rutas.sql en Supabase."
        : error.message);
      return;
    }
    setNuevaPlaca("");
    /* Se dice CÓMO quedó guardada. Normalizar en silencio es la manera
       más rápida de que alguien jure que escribió otra cosa. */
    avisar.bien(`${data} quedó en el maestro de placas.`);
    router.refresh();
  }

  /** El punto que ya existe, buscado como lo busca la base: sin acentos,
   *  sin espacios y sin mayúsculas. Si no está, devuelve null. */
  function puntoDe(texto: string) {
    const k = clave(texto);
    return puntos.find((p) => clave(p.clave) === k || clave(p.nombre) === k) ?? null;
  }

  async function agregarRuta() {
    const to = rOrigen.trim(), td = rDestino.trim();
    if (!to || !td) return;
    setMandando(true);

    /* EL PUNTO QUE FALTE SE CREA. Mandar a alguien a otra caja a agregar
       dos puntos para poder volver aquí a armar una ruta es trabajo
       inventado. */
    const creados: string[] = [];
    for (const t of [to, td]) {
      if (puntoDe(t)) continue;
      const r = await supabase.rpc("traspaso_agregar_punto",
        { p_nombre: t, p_descripcion: null });
      if (r.error) {
        setMandando(false);
        avisar.mal(faltaLaFuncion(r.error.message)
          ? "Falta correr supabase/migraciones/2026-09-traspasos-maestro.sql en Supabase."
          : r.error.message);
        return;
      }
      creados.push(t);
    }

    const { error } = await supabase.rpc("traspaso_agregar_ruta",
      { p_origen: to, p_destino: td });
    setMandando(false);
    if (error) {
      avisar.mal(faltaLaFuncion(error.message)
        ? "Falta correr supabase/migraciones/2026-09-traspasos-placas-rutas.sql en Supabase."
        : error.message);
      return;
    }
    setROrigen(""); setRDestino("");
    avisar.bien(`${to} → ${td} quedó en el maestro de rutas.`
      + (creados.length
        ? ` Y ${creados.join(" y ")} ${creados.length === 1 ? "se agregó" : "se agregaron"} a Puntos.`
        : ""));
    router.refresh();
  }

  async function agregarTipo() {
    const n = nuevoTipo.trim();
    if (!n) return;
    setMandando(true);
    const { error } = await supabase.from("traspasos_tipos")
      .insert({ clave: clave(n).toLowerCase(), nombre: n,
                orden: (tipos.at(-1)?.orden ?? 0) + 1 });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    setNuevoTipo("");
    avisar.bien(`${n} quedó en la lista de tipos.`);
    router.refresh();
  }

  /* La columna llave no siempre se llama `clave`: en placas es `placa` y
     en rutas es `id`. Se pasa como parámetro en vez de darla por hecha. */
  async function cambiar(tabla: string, col: string, c: string,
                         campos: Record<string, unknown>) {
    setMandando(true);
    const { error } = await supabase.from(tabla).update(campos).eq(col, c);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    router.refresh();
  }

  async function borrar(tabla: string, col: string, c: string, nombre: string) {
    setMandando(true);
    const { error } = await supabase.from(tabla).delete().eq(col, c);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${nombre} se borró del maestro.`);
    router.refresh();
  }

  async function ordenar(fn: string, claves: string[]) {
    /* traspaso_ordenar_rutas recibe uuid[] y su parámetro se llama
       p_ids. PostgREST casa por nombre, así que mandar p_claves ahí
       sería "no encuentro la función" sin decir por qué. */
    const arg = fn.endsWith("_rutas") ? { p_ids: claves } : { p_claves: claves };
    const { error } = await supabase.rpc(fn, arg);
    if (error) {
      avisar.mal(faltaLaFuncion(error.message)
        ? "Para cambiar el orden falta correr supabase/migraciones/2026-09-traspasos-maestro.sql en Supabase."
        : error.message);
      router.refresh();
      return;
    }
    router.refresh();
  }

  const filasPuntos: Fila[] = puntos.map((p) => ({
    clave: p.clave, nombre: p.nombre,
    sub: p.descripcion ?? (p.externo ? "Fuera del centro" : "Dentro del centro"),
    activo: p.activo, viajes: uso.puntos[p.clave] ?? 0,
  }));

  const filasPlacas: Fila[] = placas.map((p) => ({
    clave: p.placa, nombre: p.placa, sub: p.nota,
    activo: p.activo, viajes: uso.placas[p.placa] ?? 0,
  }));

  const filasRutas: Fila[] = rutas.map((r) => ({
    clave: r.id, nombre: `${r.origen_nombre} → ${r.destino_nombre}`, sub: null,
    activo: r.activo, viajes: uso.rutas[`${r.origen}>${r.destino}`] ?? 0,
  }));

  const filasTipos: Fila[] = tipos.map((t) => ({
    clave: t.clave, nombre: t.nombre,
    sub: subDeTipo(uso.ultima["tipo:" + t.clave]),
    activo: t.activo, viajes: uso.tipos[t.clave] ?? 0,
  }));

  return (
    <>
      {avisos}

      {uso.falta && (
        <div className="aviso">
          Las cuentas de uso vienen de una vista que todavía no existe: hasta que corras{" "}
          <b>supabase/migraciones/2026-09-traspasos-maestro.sql</b> todo va a decir 0 viajes,
          así que aquí no se ofrece borrar nada.
        </div>
      )}

      <section className="maestro">
        {/* ---------------- PUNTOS ---------------- */}
        <div className="caja-m">
          <div className="cab-m">
            <h2>Puntos <em>{puntos.length}</em></h2>
            <p>De dónde sale y a dónde llega un viaje.</p>
          </div>

          {puedeEditar && (
            <form className="agregar-m"
                  onSubmit={(e) => { e.preventDefault(); agregarPunto(nuevoPunto) }}>
              <input value={nuevoPunto} placeholder="Nombre del punto — Ag01, Planta, Patio…"
                     onChange={(e) => setNuevoPunto(e.target.value)} />
              <button type="submit" disabled={!nuevoPunto.trim() || mandando}>Agregar</button>
            </form>
          )}

          {puntos.length === 0 ? (
            <div className="vacio">
              <b>El maestro está vacío</b>
              Mientras tanto los sitios se escriben a mano en el registro y aparecen arriba
              para agregarlos de un toque.
            </div>
          ) : (
            <Lista filas={filasPuntos} puedeEditar={puedeEditar} mandando={mandando}
                   sinUso={uso.falta}
                   alOrdenar={(cs) => ordenar("traspaso_ordenar_puntos", cs)}
                   alPrender={(c, a) => cambiar("traspasos_puntos", "clave", c, { activo: a })}
                   alRenombrar={(c, nom, sub) =>
                     cambiar("traspasos_puntos", "clave", c, { nombre: nom, descripcion: sub })}
                   alBorrar={(c, n) => borrar("traspasos_puntos", "clave", c, n)} />
          )}
        </div>

        {/* ---------------- TIPOS ---------------- */}
        <div className="caja-m">
          <div className="cab-m">
            <h2>Tipos de viaje <em>{tipos.length}</em></h2>
            <p>
              Qué se mueve. Un tipo apagado no se borra: las planeaciones viejas lo siguen
              nombrando, solo deja de poderse escoger.
            </p>
          </div>

          {puedeEditar && (
            <form className="agregar-m"
                  onSubmit={(e) => { e.preventDefault(); agregarTipo() }}>
              <input value={nuevoTipo} placeholder="Nombre del tipo"
                     onChange={(e) => setNuevoTipo(e.target.value)} />
              <button type="submit" disabled={!nuevoTipo.trim() || mandando}>Agregar</button>
            </form>
          )}

          <Lista filas={filasTipos} puedeEditar={puedeEditar} mandando={mandando}
                 sinUso={uso.falta} sinSub
                 alOrdenar={(cs) => ordenar("traspaso_ordenar_tipos", cs)}
                 alPrender={(c, a) => cambiar("traspasos_tipos", "clave", c, { activo: a })}
                 alRenombrar={(c, nom) => cambiar("traspasos_tipos", "clave", c, { nombre: nom })}
                 alBorrar={(c, n) => borrar("traspasos_tipos", "clave", c, n)} />
        </div>
        {/* ---------------- PLACAS ---------------- */}
        <div className="caja-m">
          <div className="cab-m">
            <h2>Placas <em>{placas.length}</em></h2>
            <p>
              Los vehículos que se pueden escoger al registrar. Se guardan sin espacios ni
              guiones y en mayúsculas, así «abc 123» y «ABC-123» son un solo vehículo.
            </p>
          </div>

          {puedeEditar && (
            <form className="agregar-m"
                  onSubmit={(e) => { e.preventDefault(); agregarPlaca() }}>
              <input value={nuevaPlaca} placeholder="Placa — ABC123"
                     autoComplete="off" spellCheck={false}
                     onChange={(e) => setNuevaPlaca(e.target.value)} />
              <button type="submit" disabled={!nuevaPlaca.trim() || mandando}>Agregar</button>
            </form>
          )}

          {placas.length === 0 ? (
            <div className="vacio">
              <b>Todavía no hay placas</b>
              Al correr la migración se siembran solas con las que ya se venían registrando.
            </div>
          ) : (
            <Lista filas={filasPlacas} puedeEditar={puedeEditar} mandando={mandando}
                   sinUso={uso.falta}
                   alOrdenar={(cs) => ordenar("traspaso_ordenar_placas", cs)}
                   alPrender={(c, a) => cambiar("traspasos_placas", "placa", c, { activo: a })}
                   alRenombrar={(c, _nom, sub) =>
                     cambiar("traspasos_placas", "placa", c, { nota: sub })}
                   alBorrar={(c, n) => borrar("traspasos_placas", "placa", c, n)} />
          )}
        </div>

        {/* ---------------- RUTAS ---------------- */}
        <div className="caja-m">
          <div className="cab-m">
            <h2>Rutas <em>{rutas.length}</em></h2>
            <p>
              Un par de puntos, no un texto: por eso el informe por punto y el informe por
              ruta siempre cuadran. Si falta un punto, agrégalo arriba primero.
            </p>
          </div>

          {/* SE ESCRIBE O SE ESCOGE, y el punto que falte se crea solo.
              Antes, con menos de dos puntos, esta caja decía "faltan
              puntos" y no dejaba hacer nada: mandaba a la persona a otra
              caja a hacer dos cosas para poder volver a hacer una. Lo que
              quiere decir es "de aquí a allá", y eso se escribe de una. */}
          {puedeEditar && (
            <form className="agregar-m ruta-nueva"
                  onSubmit={(e) => { e.preventDefault(); agregarRuta() }}>
              <input list="tp-m-puntos" value={rOrigen} autoComplete="off"
                     aria-label="De dónde sale" placeholder="De dónde sale"
                     onChange={(e) => setROrigen(e.target.value)} />
              <span className="fl" aria-hidden>→</span>
              <input list="tp-m-puntos" value={rDestino} autoComplete="off"
                     aria-label="A dónde va" placeholder="A dónde va"
                     onChange={(e) => setRDestino(e.target.value)} />
              <datalist id="tp-m-puntos">
                {puntosVivos.map((p) => <option key={p.clave} value={p.nombre} />)}
              </datalist>
              <button type="submit"
                      disabled={!rOrigen.trim() || !rDestino.trim() || mandando}>
                Agregar
              </button>
            </form>
          )}

          {rutas.length === 0 ? (
            <div className="vacio">
              <b>Todavía no hay rutas</b>
              {puntosVivos.length === 0
                ? "Escribe los dos sitios arriba: se agregan a Puntos y la ruta queda armada."
                : "Arma la primera arriba. Al correr la migración también se siembran con las que ya se venían registrando."}
            </div>
          ) : (
            <Lista filas={filasRutas} puedeEditar={puedeEditar} mandando={mandando}
                   sinUso={uso.falta} sinSub sinRenombrar
                   alOrdenar={(cs) => ordenar("traspaso_ordenar_rutas", cs)}
                   alPrender={(c, a) => cambiar("traspasos_rutas", "id", c, { activo: a })}
                   alRenombrar={() => {}}
                   alBorrar={(c, n) => borrar("traspasos_rutas", "id", c, n)} />
          )}
        </div>
      </section>

      {/* ---------------- DUPLICADOS ---------------- */}
      {dobles.length > 0 && (
        <section className="duplicados">
          <h3>Posibles duplicados</h3>
          <p>
            Mismo sitio escrito de dos formas. Si se dejan así, el informe por punto parte el
            mismo lugar en dos y ninguno cuadra. Unir no borra nada: los viajes que decían la
            forma de la izquierda pasan a contar en la de la derecha.
          </p>
          {dobles.map((f) => (
            <div className="par-dup" key={f.texto}>
              <span className="tx">{f.texto}</span>
              <span className="cuantos">{f.veces} viaje{f.veces === 1 ? "" : "s"}</span>
              <span className="fl" aria-hidden>→</span>
              <span className="tx gana">{f.parecido_nombre}</span>
              <span className="cuantos">{f.parecido_viajes ?? 0} viajes</span>
              {puedeEditar && (
                <button type="button" className="unir" disabled={mandando}
                        onClick={() => unir(f.texto, f.parecido!, f.parecido_nombre!)}>
                  Unir en {f.parecido_nombre}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/* =====================================================================
   LA LISTA
   ===================================================================== */

function Lista({ filas, puedeEditar, mandando, sinUso, sinSub, sinRenombrar,
                 alOrdenar, alPrender, alRenombrar, alBorrar }: {
  filas: Fila[];
  puedeEditar: boolean;
  mandando: boolean;
  sinUso: boolean;
  sinSub?: boolean;
  /** Una ruta no tiene nombre propio: es el par de puntos. Cambiarle el
   *  nombre no querría decir nada, así que esa opción no se ofrece. */
  sinRenombrar?: boolean;
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
  const vistas = orden.map((c) => porClave.get(c)).filter(Boolean) as Fila[];

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
    const filasDom = Array.from(caja.current.querySelectorAll<HTMLElement>(".item"));
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
    <div ref={caja} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
      {vistas.map((f) => (
        <Renglon key={f.clave} f={f} sinSub={sinSub} sinUso={sinUso}
                 sinRenombrar={sinRenombrar}
                 puedeEditar={puedeEditar} mandando={mandando}
                 moviendo={moviendo === f.clave}
                 alTomar={(e) => tomar(e, f.clave)}
                 alPrender={alPrender} alRenombrar={alRenombrar} alBorrar={alBorrar} />
      ))}
    </div>
  );
}

function Renglon({ f, sinSub, sinRenombrar, sinUso, puedeEditar, mandando, moviendo,
                   alTomar, alPrender, alRenombrar, alBorrar }: {
  f: Fila;
  sinSub?: boolean;
  sinRenombrar?: boolean;
  sinUso: boolean;
  puedeEditar: boolean;
  mandando: boolean;
  moviendo: boolean;
  alTomar: (e: React.PointerEvent) => void;
  alPrender: (clave: string, activo: boolean) => void;
  alRenombrar: (clave: string, nombre: string, sub: string | null) => void;
  alBorrar: (clave: string, nombre: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nom, setNom] = useState(f.nombre);
  const [sub, setSub] = useState(f.sub ?? "");
  const cajaMenu = useRef<HTMLDivElement>(null);

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

  /* Se puede borrar solo si NUNCA se usó — y solo si sabemos cuánto se
     usó. Con la vista de uso ausente todo dice 0 y ofrecer "borrar"
     sería ofrecer un error de llave foránea. */
  const sePuedeBorrar = puedeEditar && !sinUso && f.viajes === 0;

  if (editando) {
    return (
      <form className="agregar-m"
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
        <button type="button" className="btn" onClick={() => {
          setNom(f.nombre); setSub(f.sub ?? ""); setEditando(false);
        }}>Dejar así</button>
      </form>
    );
  }

  return (
    <div className={"item" + (f.activo ? "" : " apagado") + (moviendo ? " arrastrando" : "")}>
      {puedeEditar ? (
        <button type="button" className="asa" onPointerDown={alTomar}
                aria-label={`Mover ${f.nombre}`} title="Arrastrar para cambiar el orden">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
          </svg>
        </button>
      ) : <span className="asa" />}

      <div className="nom">
        <b>{f.nombre}</b>
        {!sinSub || f.sub ? <span>{f.sub}</span> : null}
      </div>

      <span className="uso">
        {sinUso ? "—" : `${f.viajes.toLocaleString("es-CO")} viaje${f.viajes === 1 ? "" : "s"}`}
      </span>

      <label className="sw" title={f.activo ? "Se puede escoger" : "Ya no se puede escoger"}>
        <input type="checkbox" checked={f.activo} disabled={!puedeEditar || mandando}
               aria-label={`${f.nombre}: se puede escoger`}
               onChange={(e) => alPrender(f.clave, e.target.checked)} />
        <i />
      </label>

      <div className="mas" ref={cajaMenu}>
        <button type="button" aria-label={`Opciones de ${f.nombre}`} aria-expanded={menu}
                onClick={() => setMenu((v) => !v)}>⋯</button>
        {menu && (
          <div className="menu">
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
            {sePuedeBorrar ? (
              <button type="button" className="mal" disabled={mandando}
                      onClick={() => { setMenu(false); alBorrar(f.clave, f.nombre) }}>
                Borrar
              </button>
            ) : (
              <div className="nota">
                {sinUso
                  ? "Para saber si se puede borrar falta correr la migración del maestro."
                  : `No se puede borrar: ya lo nombran ${f.viajes} viaje${f.viajes === 1 ? "" : "s"}. Apágalo y deja de poderse escoger.`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   AYUDAS
   ===================================================================== */

/** La clave a partir del nombre: sin acentos, sin espacios, en
 *  mayúsculas. Se genera y no se pide, porque nadie debería tener que
 *  inventarse un código para agregar "Patio de vacíos". Es la misma
 *  regla que traspaso_norm() en la base. */
function clave(nombre: string) {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 40);
}

function faltaLaFuncion(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache")
      || t.includes("could not find the function");
}

/** El subtítulo de un tipo: cuándo se usó por última vez. Es lo que
 *  dice si un tipo sigue vivo sin tener que abrir un informe. */
function subDeTipo(ultima: string | undefined) {
  if (!ultima) return "sin uso";
  const dias = Math.floor((Date.now() - new Date(ultima + "T12:00:00").getTime()) / 86_400_000);
  if (dias <= 31) return "usado este mes";
  if (dias <= 93) return "usado hace unos meses";
  return "sin uso desde hace más de tres meses";
}
