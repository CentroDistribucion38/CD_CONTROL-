"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Punto, PuntoFaltante, TipoViaje } from "@/modulos/traspasos/datos";

/**
 * EL MAESTRO: tipos de viaje y puntos.
 *
 * LO IMPORTANTE DE ESTA PANTALLA ES LA PRIMERA CAJA, no las listas.
 * Los puntos que alguien escribió a mano porque no estaban en la lista
 * aparecen arriba con cuántas veces se usaron, y se agregan de un
 * toque. Sin eso, el "se puede escribir otro" del registro sería la
 * puerta por la que el maestro se vacía solo: dentro de un mes habría
 * cuarenta escrituras distintas del mismo sitio y ningún informe por
 * ruta cuadraría.
 *
 * NADA SE BORRA SI YA SE USÓ. La base lo rechazaría igual por la llave
 * foránea, pero "violates foreign key constraint" no le explica nada a
 * quien está mirando la pantalla: decirlo antes —"usado en 43"— sí.
 */
export function Maestro({ tipos, puntos, faltantes, uso, puedeEditar }: {
  tipos: TipoViaje[];
  puntos: Punto[];
  faltantes: PuntoFaltante[];
  uso: { tipos: Record<string, number>; puntos: Record<string, number> };
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [mandando, setMandando] = useState(false);

  const [nuevoPunto, setNuevoPunto] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState("");

  /** La clave a partir del nombre: sin acentos, sin espacios, en
   *  mayúsculas. Se genera y no se pide, porque nadie debería tener que
   *  inventarse un código para agregar "Patio de vacíos". */
  function clave(nombre: string) {
    return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 40);
  }

  async function agregarPunto(nombre: string) {
    const n = nombre.trim();
    if (!n) return;
    setMandando(true);
    const { error } = await supabase.from("traspasos_puntos")
      .insert({ clave: clave(n), nombre: n });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    setNuevoPunto("");
    avisar.bien(`${n} quedó en el maestro. Los viajes nuevos ya lo pueden escoger.`);
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

  async function cambiarActivo(tabla: string, c: string, activo: boolean) {
    setMandando(true);
    const { error } = await supabase.from(tabla).update({ activo }).eq("clave", c);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    router.refresh();
  }

  async function borrar(tabla: string, c: string) {
    setMandando(true);
    const { error } = await supabase.from(tabla).delete().eq("clave", c);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    router.refresh();
  }

  return (
    <>
      {avisos}

      {/* LO PRIMERO: lo que la gente escribió y todavía no está. */}
      {faltantes.length > 0 && (
        <section className="caja">
          <div className="cab">
            <div>
              <h2>Sitios escritos a mano ({faltantes.length})</h2>
              <p>
                No estaban en la lista, así que se escribieron para no trabar el registro. Lo
                que se escribió varias veces es un punto real: agrégalo y los viajes nuevos lo
                van a escoger en vez de volver a escribirlo distinto.
              </p>
            </div>
          </div>
          {faltantes.map((f) => (
            <div className="fila" key={f.texto}>
              <div className="placa">{f.veces}</div>
              <div>
                <div className="ruta">{f.texto}</div>
                <div className="meta">
                  <span>{f.veces === 1 ? "usado una vez" : `usado ${f.veces} veces`}</span>
                  <span>última vez: {f.ultima}</span>
                </div>
              </div>
              <div className="der">
                {puedeEditar && (
                  <button type="button" className="btn si chico" disabled={mandando}
                          onClick={() => agregarPunto(f.texto)}>
                    Agregar al maestro
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* LOS PUNTOS */}
      <section className="caja">
        <div className="cab">
          <div>
            <h2>Puntos ({puntos.length})</h2>
            <p>
              De dónde sale y a dónde llega un viaje. Nacen vacíos a propósito: los puntos de
              este centro son un dato de este centro, no del programa.
            </p>
          </div>
        </div>

        {puedeEditar && (
          <div style={{ padding: 16, borderBottom: "1px solid var(--tp-linea)",
                        display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={nuevoPunto} placeholder="Nombre del punto — Ag01, Planta, Patio…"
                   style={{ flex: "1 1 240px", minHeight: 46, fontSize: 16, padding: "11px 13px",
                            borderRadius: 9, border: "1px solid var(--tp-linea)" }}
                   onChange={(e) => setNuevoPunto(e.target.value)} />
            <button type="button" className="btn si" disabled={!nuevoPunto.trim() || mandando}
                    onClick={() => agregarPunto(nuevoPunto)}>Agregar</button>
          </div>
        )}

        {puntos.length === 0 ? (
          <div className="vacio">
            <b>El maestro está vacío</b>
            Mientras tanto los sitios se escriben a mano en el registro y aparecen arriba para
            agregarlos de un toque.
          </div>
        ) : (
          puntos.map((p) => (
            <div className="fila" key={p.clave}>
              <div className="placa">{p.clave.slice(0, 6)}</div>
              <div>
                <div className="ruta">{p.nombre}</div>
                <div className="meta">
                  <span>{uso.puntos[p.clave] ?? 0} viaje{(uso.puntos[p.clave] ?? 0) === 1 ? "" : "s"}</span>
                  {p.externo && <span className="eti">FUERA DEL CENTRO</span>}
                  {!p.activo && <span className="eti mal">DESACTIVADO</span>}
                </div>
              </div>
              <div className="der">
                {puedeEditar && (
                  <>
                    <button type="button" className="btn chico" disabled={mandando}
                            onClick={() => cambiarActivo("traspasos_puntos", p.clave, !p.activo)}>
                      {p.activo ? "Desactivar" : "Activar"}
                    </button>
                    {/* Borrar solo si NUNCA se usó. Un punto usado se
                        desactiva: los viajes viejos lo siguen nombrando. */}
                    {!(uso.puntos[p.clave] ?? 0) && (
                      <button type="button" className="btn chico" disabled={mandando}
                              onClick={() => borrar("traspasos_puntos", p.clave)}>
                        Borrar
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      {/* LOS TIPOS */}
      <section className="caja">
        <div className="cab">
          <div>
            <h2>Tipos de viaje ({tipos.length})</h2>
            <p>
              Qué se mueve. Un tipo desactivado no se borra —las planeaciones viejas lo siguen
              nombrando—: solo deja de poderse escoger.
            </p>
          </div>
        </div>

        {puedeEditar && (
          <div style={{ padding: 16, borderBottom: "1px solid var(--tp-linea)",
                        display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={nuevoTipo} placeholder="Nombre del tipo"
                   style={{ flex: "1 1 240px", minHeight: 46, fontSize: 16, padding: "11px 13px",
                            borderRadius: 9, border: "1px solid var(--tp-linea)" }}
                   onChange={(e) => setNuevoTipo(e.target.value)} />
            <button type="button" className="btn si" disabled={!nuevoTipo.trim() || mandando}
                    onClick={agregarTipo}>Agregar</button>
          </div>
        )}

        {tipos.map((t) => (
          <div className="fila" key={t.clave}>
            <div className="placa">{uso.tipos[t.clave] ?? 0}</div>
            <div>
              <div className="ruta">{t.nombre}</div>
              <div className="meta">
                <span>{uso.tipos[t.clave] ?? 0} viaje{(uso.tipos[t.clave] ?? 0) === 1 ? "" : "s"}</span>
                {!t.activo && <span className="eti mal">DESACTIVADO</span>}
              </div>
            </div>
            <div className="der">
              {puedeEditar && (
                <>
                  <button type="button" className="btn chico" disabled={mandando}
                          onClick={() => cambiarActivo("traspasos_tipos", t.clave, !t.activo)}>
                    {t.activo ? "Desactivar" : "Activar"}
                  </button>
                  {!(uso.tipos[t.clave] ?? 0) && (
                    <button type="button" className="btn chico" disabled={mandando}
                            onClick={() => borrar("traspasos_tipos", t.clave)}>
                      Borrar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
