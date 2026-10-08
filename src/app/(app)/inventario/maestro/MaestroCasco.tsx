"use client";

/**
 * EL MAESTRO DE CASCO DE VIDRIO — los desplegables de «Registrar · Movimiento».
 *
 * «Esos desplegables deben estar en el módulo Maestro, con este diseño. Registrar es solo para registrar
 *  y ver lo que se va registrando.»
 *
 * Tres listas en una pestaña: ALMACÉN ORIGEN, ALMACÉN RECEPTOR y CLIENTE. Cada renglón puede decir a cuál de
 * las cuatro tablas de Control suma o resta (el cliente no tiene), y los de origen, si lo que sale de ahí
 * descuenta el inventario por defecto (CA22 → AG07 se registra sin descontar).
 *
 * BORRAR AQUÍ SÍ BORRA, y es seguro: los movimientos ya registrados guardan el nombre tal como estaba.
 * La búsqueda y el botón «Agregar» son los de la barra del Maestro; esta pieza solo dibuja la lista.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { Pedido } from "@/components/Confirmar";

type Tipo = "origen" | "receptor" | "cliente";
type Item = {
  id: string; tipo: Tipo; codigo: string | null; nombre: string; ubicacion: string | null;
  orden: number | null; descuenta: boolean;
};
type Tabla = { clave: string; nombre: string };

const TITULO: Record<Tipo, string> = { origen: "Almacén origen", receptor: "Almacén receptor", cliente: "Cliente" };
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MaestroCasco({ busca, esEditor, nuevo, pedir, avisar }: {
  busca: string;
  esEditor: boolean;
  /** Sube de 0 en 0 cada vez que se aprieta «Agregar» en la barra del Maestro. */
  nuevo: number;
  pedir: (p: Pedido) => Promise<boolean>;
  avisar: { bien: (t: string) => void; mal: (t: string) => void };
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[] | null>(null);
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [falla, setFalla] = useState<string | null>(null);
  const [lista, setLista] = useState<"" | Tipo>("");
  const [editando, setEditando] = useState<string | null>(null);   // id, o «nuevo»
  const [b, setB] = useState<{ tipo: Tipo; codigo: string; nombre: string; ubicacion: string; descuenta: boolean }>(
    { tipo: "origen", codigo: "", nombre: "", ubicacion: "", descuenta: true });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [m, t] = await Promise.all([
      supabase.from("casco_mov_maestro").select("*").order("tipo").order("orden"),
      supabase.from("casco_ubicaciones").select("clave, nombre").eq("activo", true).order("orden"),
    ]);
    if (m.error) {
      setItems([]);
      setFalla(/does not exist|schema cache/i.test(m.error.message)
        ? "Falta correr supabase/migraciones/2026-10-casco-movimientos.sql en Supabase."
        : traducirError(m.error.message));
      return;
    }
    setFalla(null);
    setItems((m.data ?? []) as Item[]);
    setTablas((t.data ?? []) as Tabla[]);
  }, [supabase]);
  useEffect(() => { void cargar() }, [cargar]);

  const poner = <K extends keyof typeof b>(k: K, v: (typeof b)[K]) => setB((x) => ({ ...x, [k]: v }));

  /* «Agregar» de la barra: abre el formulario de uno nuevo (con la lista que se está mirando, si hay una). */
  useEffect(() => {
    if (nuevo === 0 || !esEditor) return;
    setB({ tipo: lista || "origen", codigo: "", nombre: "", ubicacion: "", descuenta: true });
    setEditando("nuevo");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevo]);

  const q = sinTilde(busca.trim());
  const visibles = useMemo(() => (items ?? []).filter((i) =>
    (!lista || i.tipo === lista) &&
    (!q || sinTilde(`${i.codigo ?? ""} ${i.nombre} ${TITULO[i.tipo]}`).includes(q))), [items, lista, q]);
  const cuantos = (t: Tipo) => (items ?? []).filter((i) => i.tipo === t).length;
  const nombreTabla = (clave: string | null) => (clave ? tablas.find((t) => t.clave === clave)?.nombre ?? clave : null);

  async function guardar(id: string | null) {
    if (!b.nombre.trim()) { avisar.mal("Falta el nombre."); return }
    setGuardando(true);
    const { error } = await supabase.rpc("casco_mov_maestro_guardar", {
      p_id: id, p_tipo: b.tipo, p_codigo: b.codigo.trim(), p_nombre: b.nombre.trim(),
      p_ubicacion: b.tipo === "cliente" ? "" : b.ubicacion, p_descuenta: b.descuenta,
    });
    setGuardando(false);
    if (error) { avisar.mal(traducirError(error.message)); return }
    avisar.bien(id ? `${b.nombre.trim()} guardado.` : `${b.nombre.trim()} agregado a ${TITULO[b.tipo].toLowerCase()}.`);
    setEditando(null);
    await cargar();
  }

  async function borrar(i: Item) {
    const ok = await pedir({
      titulo: `¿Borrar «${i.nombre}» de ${TITULO[i.tipo].toLowerCase()}?`,
      dice: <>Sale del desplegable de Registrar · Movimiento. Los movimientos que ya registraste con él no cambian:
             guardan el nombre tal como estaba.</>,
      confirmar: "Borrar", peligro: true,
    });
    if (!ok) return;
    setGuardando(true);
    const { error } = await supabase.rpc("casco_mov_maestro_borrar", { p_id: i.id });
    setGuardando(false);
    if (error) { avisar.mal(traducirError(error.message)); return }
    avisar.bien(`${i.nombre} borrado.`);
    setEditando(null);
    await cargar();
  }

  const abrir = (i: Item) => {
    setB({ tipo: i.tipo, codigo: i.codigo ?? "", nombre: i.nombre, ubicacion: i.ubicacion ?? "", descuenta: i.descuenta });
    setEditando(i.id);
  };

  /* Los campos del formulario, iguales para uno nuevo y para editar. */
  const campos = (conTipo: boolean) => (
    <div className="fe-campos">
      {conTipo && (
        <label><span>Lista</span>
          <select value={b.tipo} onChange={(e) => poner("tipo", e.target.value as Tipo)}>
            {(["origen", "receptor", "cliente"] as Tipo[]).map((t) => <option key={t} value={t}>{TITULO[t]}</option>)}
          </select></label>
      )}
      <label><span>Código</span>
        <input value={b.codigo} placeholder={b.tipo === "cliente" ? "0005201060" : "AG22"} onChange={(e) => poner("codigo", e.target.value)} /></label>
      <label className="ancho"><span>Nombre</span>
        <input value={b.nombre} placeholder={b.tipo === "cliente" ? "CRISTALERIA PELDAR S A" : "AG22 EER Barranquilla"}
               onChange={(e) => poner("nombre", e.target.value)} /></label>
      {b.tipo !== "cliente" && (
        <label className="ancho"><span>Tabla de Control que mueve</span>
          <select value={b.ubicacion} onChange={(e) => poner("ubicacion", e.target.value)}>
            <option value="">Ninguna — solo se registra</option>
            {tablas.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
          </select></label>
      )}
      {b.tipo === "origen" && (
        <label className="fe-check"><input type="checkbox" checked={b.descuenta} onChange={(e) => poner("descuenta", e.target.checked)} />
          <span>Lo que sale de aquí descuenta el inventario</span></label>
      )}
    </div>
  );

  return (
    <>
      <p className="fe-cuenta">
        Estas listas son los desplegables de <b>Registrar · Movimiento</b>: de dónde sale el casco, a qué almacén llega y a
        qué cliente se despacha. Las cuatro tablas de Control se mueven según la «tabla» de cada almacén.
      </p>

      <div className="fe-pes" role="group" aria-label="Qué lista ver" style={{ marginBottom: 12 }}>
        <button type="button" className={lista === "" ? "on" : ""} aria-pressed={lista === ""} onClick={() => setLista("")}>
          Todas<em>{items?.length ?? 0}</em>
        </button>
        {(["origen", "receptor", "cliente"] as Tipo[]).map((t) => (
          <button key={t} type="button" className={lista === t ? "on" : ""} aria-pressed={lista === t} onClick={() => setLista(t)}>
            {TITULO[t]}<em>{cuantos(t)}</em>
          </button>
        ))}
      </div>

      {falla && <p className="fe-faltan"><b>{falla}</b></p>}

      {editando === "nuevo" && esEditor && (
        <section className="fe-editor nuevo">
          <h2>Renglón nuevo</h2>
          {campos(true)}
          <div className="fe-pie">
            <button type="button" className="btn" disabled={guardando} onClick={() => void guardar(null)}>
              {guardando ? "Guardando…" : "Agregar"}
            </button>
            <button type="button" className="btn plano" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <div className="fe-lista">
        {items !== null && !falla && visibles.length === 0 && (
          <p className="fe-cuenta">{items.length === 0 ? "Todavía no hay renglones." : "Ninguno con esa búsqueda."}</p>
        )}
        {visibles.map((i) => {
          const abierto = editando === i.id;
          return (
            <article key={i.id} className="fe-fila">
              <div className="fe-cab">
                <b className="fe-cod">{i.codigo || "—"}</b>
                <span className="fe-desc">{i.nombre}</span>
                <span className="fe-tipo">{TITULO[i.tipo]}</span>
                {esEditor && !abierto && <button type="button" className="fe-mini" onClick={() => abrir(i)}>Editar</button>}
              </div>
              <dl className="fe-cifras">
                {i.tipo !== "cliente" && (
                  <div><dt>Tabla de Control</dt><dd>{nombreTabla(i.ubicacion) ?? "Ninguna"}</dd></div>
                )}
                {i.tipo === "origen" && (
                  <div><dt>Al salir descuenta</dt><dd>{i.descuenta ? "Sí" : "No, solo registro"}</dd></div>
                )}
                {i.tipo === "cliente" && <div><dt>Control</dt><dd>No tiene tabla</dd></div>}
              </dl>
              {abierto && (
                <div className="fe-editor">
                  {campos(false)}
                  <div className="fe-pie">
                    <button type="button" className="btn" disabled={guardando} onClick={() => void guardar(i.id)}>
                      {guardando ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" className="btn plano" onClick={() => setEditando(null)}>Cancelar</button>
                    <button type="button" className="fe-quitar" disabled={guardando} onClick={() => void borrar(i)}>
                      Borrar
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
