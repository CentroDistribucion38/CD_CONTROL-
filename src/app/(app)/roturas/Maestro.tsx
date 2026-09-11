"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { Causa, Material, Proceso, Tolva } from "@/modulos/roturas/datos";
import { COLOR_VIDRIO, kilos } from "@/modulos/roturas/formato";

/**
 * MAESTRO — materiales, procesos, causas y tolvas.
 *
 * Son DATOS, no código: el día que llegue una tolva nueva o que Bavaria
 * agregue un formato, nadie debería tener que esperar un despliegue.
 *
 * BORRAR Y DESACTIVAR NO SON LO MISMO:
 *   DESACTIVAR  deja de ofrecerse al registrar, pero las roturas viejas
 *               siguen mostrando su causa y su proceso. Es lo que se
 *               hace casi siempre.
 *   BORRAR      solo si NADIE lo ha usado. Es para el error de dedo.
 * La base lo rechazaría igual por la llave foránea, pero "violates
 * foreign key constraint" no le explica nada a nadie.
 *
 * LA CLAVE NO SE EDITA. Es con lo que están amarradas las roturas
 * viejas: cambiarla dejaría un histórico apuntando a algo que ya no
 * existe. Se edita el NOMBRE, que es lo que la gente lee.
 *
 * LA TARA SÍ SE EDITA, y no rompe nada: se copia a la línea al pesar,
 * así que una salida de hace tres meses sigue mostrando la tara con la
 * que de verdad se pesó. Cambiarla aquí solo afecta lo que se pese de
 * ahora en adelante — y eso se dice en la pantalla, porque quien la
 * cambia normalmente teme justo lo contrario.
 */

export type Hoja = "materiales" | "procesos" | "causas" | "tolvas";

const NOMBRE: Record<Hoja, string> = {
  materiales: "Materiales", procesos: "Procesos", causas: "Causas", tolvas: "Tolvas",
};

const TABLA: Record<Hoja, string> = {
  materiales: "roturas_materiales",
  procesos: "roturas_procesos",
  causas: "roturas_causas",
  tolvas: "roturas_tolvas",
};

/** Una clave legible a partir del nombre: "Caída en el cargue" → "caida_en_el_cargue". */
function aClave(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function Maestro({ hojas, materiales, procesos, causas, tolvas, uso, puedeEditar }: {
  /* QUÉ HOJAS LLEVA ESTA PANTALLA. El maestro está partido igual que el
     módulo: los materiales, los procesos y las causas son de En sitio;
     las tolvas, de la Salida. Un solo maestro con las cuatro hojas
     volvería a juntar en una pantalla lo que las dos ramas separan. */
  hojas: Hoja[];
  materiales: Material[];
  procesos: Proceso[];
  causas: Causa[];
  tolvas: Tolva[];
  /** Cuántas roturas usan cada clave. Decide si el botón de borrar sale. */
  uso: { materiales: Record<string, number>; procesos: Record<string, number>;
         causas: Record<string, number>; tolvas: Record<string, number> };
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();

  const [hoja, setHoja] = useState<Hoja>(hojas[0]);
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);

  const vacio = {
    clave: "", nombre: "",
    tipo: "eer" as "eer" | "producto_terminado",
    color: "ambar" as "ambar" | "flint" | "green",
    botellas: "30",
    grupo: "asumida" as "asumida" | "no_asumida",
    exige_foto: false,
    modelo: "Tolva estándar", tara: "111",
  };
  const [f, setF] = useState(vacio);

  const llave = hoja === "tolvas" ? "codigo" : "clave";
  const usos = uso[hoja] ?? {};

  function abrirNueva() { setF(vacio); setNueva(true); setEditando(null) }

  function abrirEditar(id: string) {
    setNueva(false);
    setEditando(editando === id ? null : id);
    if (hoja === "materiales") {
      const m = materiales.find((x) => x.clave === id)!;
      setF({ ...vacio, clave: m.clave, nombre: m.nombre, tipo: m.tipo,
             color: (m.color ?? "ambar") as typeof vacio.color,
             botellas: m.botellas_x_empaque != null ? String(m.botellas_x_empaque) : "" });
    } else if (hoja === "procesos") {
      const p = procesos.find((x) => x.clave === id)!;
      setF({ ...vacio, clave: p.clave, nombre: p.nombre });
    } else if (hoja === "causas") {
      const c = causas.find((x) => x.clave === id)!;
      setF({ ...vacio, clave: c.clave, nombre: c.nombre, grupo: c.grupo, exige_foto: c.exige_foto });
    } else {
      const t = tolvas.find((x) => x.codigo === id)!;
      setF({ ...vacio, clave: t.codigo, nombre: t.codigo, modelo: t.modelo, tara: String(t.tara_kg) });
    }
  }

  /* Una sola función arma la fila de las cuatro hojas. Cuatro inserts
     separados serían cuatro veces el mismo manejo de error, y el día que
     haya que agregar "creado_por" habría que acordarse de los cuatro. */
  function fila(clave: string): Record<string, unknown> {
    if (hoja === "materiales") return {
      clave, nombre: f.nombre.trim(), tipo: f.tipo,
      color: f.tipo === "eer" ? f.color : null,
      botellas_x_empaque: f.tipo === "producto_terminado" ? (Number(f.botellas) || null) : null,
    };
    if (hoja === "procesos") return { clave, nombre: f.nombre.trim() };
    if (hoja === "causas") return {
      clave, nombre: f.nombre.trim(), grupo: f.grupo, exige_foto: f.exige_foto,
    };
    return {
      codigo: clave, modelo: f.modelo.trim() || "Tolva estándar",
      tara_kg: Number(f.tara.replace(",", ".")) || 0,
    };
  }

  async function crear() {
    const clave = hoja === "tolvas"
      ? f.clave.trim().toUpperCase()
      : (f.clave.trim() || aClave(f.nombre));
    if (!clave) { avisar.mal("Falta el nombre."); return }
    setMandando(true);
    const { error } = await supabase.from(TABLA[hoja]).insert(fila(clave));
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${f.nombre.trim() || clave} quedó agregado.`);
    setNueva(false); setF(vacio); router.refresh();
  }

  async function guardar(id: string) {
    setMandando(true);
    const cambio = fila(id);
    delete cambio[llave];               // la clave no se toca
    const { error } = await supabase.from(TABLA[hoja]).update(cambio).eq(llave, id);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien("Guardado.");
    setEditando(null); router.refresh();
  }

  async function alternar(id: string, activo: boolean) {
    const { error } = await supabase.from(TABLA[hoja]).update({ activo: !activo }).eq(llave, id);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(activo
      ? "Desactivado: deja de ofrecerse, y lo viejo sigue igual."
      : "Activado: vuelve a ofrecerse.");
    router.refresh();
  }

  async function borrar(id: string, nombre: string) {
    const ok = await pedir({
      titulo: `¿Borrar ${nombre}?`,
      dice: "Nadie lo ha usado todavía, así que desaparece sin dejar rastro. Si algún día se usó, desactívalo en vez de borrarlo.",
      confirmar: "Borrar",
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.from(TABLA[hoja]).delete().eq(llave, id);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${nombre} se borró.`);
    router.refresh();
  }

  /* ================= Una fila, según la hoja ================= */
  type Item = { id: string; titulo: string; detalle: string; activo: boolean };
  const items: Item[] =
    hoja === "materiales" ? materiales.map((m) => ({
      id: m.clave, titulo: m.nombre, activo: m.activo,
      detalle: (m.tipo === "eer"
        ? `EER · ${COLOR_VIDRIO[m.color ?? ""] ?? "sin color"}`
        : `Producto terminado${m.botellas_x_empaque ? ` · ${m.botellas_x_empaque} botellas por empaque` : ""}`),
    }))
    : hoja === "procesos" ? procesos.map((p) => ({
      id: p.clave, titulo: p.nombre, activo: p.activo, detalle: p.clave,
    }))
    : hoja === "causas" ? causas.map((c) => ({
      id: c.clave, titulo: c.nombre, activo: c.activo,
      detalle: (c.grupo === "no_asumida" ? "No asumida — no fue del OL" : "Asumida por el OL")
        + (c.exige_foto ? " · exige foto" : ""),
    }))
    : tolvas.map((t) => ({
      id: t.codigo, titulo: t.codigo, activo: t.activo,
      detalle: `${t.modelo} · tara ${kilos(t.tara_kg)} kg`,
    }));

  const formulario = (
    <div className="panel">
      {hoja !== "tolvas" ? (
        <>
          <label htmlFor="m-nom">Nombre</label>
          <input id="m-nom" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })}
                 placeholder={hoja === "causas" ? "Caída en el cargue" : "Líneas"} />
        </>
      ) : (
        <>
          <label htmlFor="m-cod">Código de la tolva</label>
          <input id="m-cod" value={f.clave} disabled={!!editando}
                 onChange={(e) => setF({ ...f, clave: e.target.value })}
                 placeholder="TOLVA-5" />
          <label htmlFor="m-mod">Modelo</label>
          <input id="m-mod" value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} />
          <label htmlFor="m-tara">Tara en kg — lo que pesa vacía</label>
          <input id="m-tara" type="number" inputMode="decimal" step="0.1" value={f.tara}
                 onChange={(e) => setF({ ...f, tara: e.target.value })} />
          <div className="aviso">
            Cambiar la tara no toca las salidas viejas: la tara se copia a cada línea al pesar,
            así que una salida de hace tres meses sigue mostrando la que de verdad se usó.
            Esto aplica desde el próximo pesaje.
          </div>
        </>
      )}

      {hoja === "materiales" && (
        <>
          <label htmlFor="m-tipo">Tipo</label>
          <select id="m-tipo" value={f.tipo}
                  onChange={(e) => setF({ ...f, tipo: e.target.value as typeof f.tipo })}>
            <option value="eer">EER — envase, empaque y estiba retornables</option>
            <option value="producto_terminado">Producto terminado</option>
          </select>
          {f.tipo === "eer" ? (
            <>
              <label htmlFor="m-color">Color del vidrio</label>
              <select id="m-color" value={f.color}
                      onChange={(e) => setF({ ...f, color: e.target.value as typeof f.color })}>
                {Object.entries(COLOR_VIDRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </>
          ) : (
            <>
              <label htmlFor="m-bot">Botellas por empaque</label>
              <input id="m-bot" type="number" inputMode="numeric" value={f.botellas}
                     onChange={(e) => setF({ ...f, botellas: e.target.value })} />
            </>
          )}
        </>
      )}

      {hoja === "causas" && (
        <>
          <label htmlFor="m-grupo">Grupo</label>
          <select id="m-grupo" value={f.grupo}
                  onChange={(e) => setF({
                    ...f,
                    grupo: e.target.value as typeof f.grupo,
                    /* Se propone exigir foto en las no asumidas, que es
                       lo que son hoy todas. Se puede quitar: por eso el
                       campo existe en la tabla y no en el código. */
                    exige_foto: e.target.value === "no_asumida",
                  })}>
            <option value="asumida">Asumida — el OL reconoce que fue suya</option>
            <option value="no_asumida">No asumida — se dice que no fue del OL</option>
          </select>
          <label style={{ display: "flex", gap: 8, alignItems: "center", textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={f.exige_foto} style={{ width: "auto" }}
                   onChange={(e) => setF({ ...f, exige_foto: e.target.checked })} />
            Exige foto al registrar
          </label>
        </>
      )}

      <div className="acciones-panel">
        <button type="button" className="btn si" disabled={mandando}
                onClick={() => (editando ? guardar(editando) : crear())}>
          {mandando ? "Guardando…" : editando ? "Guardar" : "Agregar"}
        </button>
        <button type="button" className="btn plano"
                onClick={() => { setNueva(false); setEditando(null) }}>
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <>
      {avisos}{dialogo}

      {/* Con una sola hoja no hay pestañas: una pestaña única no da a
          escoger nada y solo hace creer que falta algo al lado. */}
      {hojas.length > 1 && (
        <div className="filtros">
          {hojas.map((h) => (
            <button key={h} type="button"
                    className={"btn" + (hoja === h ? " si" : "")}
                    onClick={() => { setHoja(h); setNueva(false); setEditando(null) }}>
              {NOMBRE[h]}
            </button>
          ))}
        </div>
      )}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{items.length} {NOMBRE[hoja].toLowerCase()}</h2>
            <p>
              Desactivar deja de ofrecerlo al registrar y no toca lo viejo. Borrar solo aparece
              cuando nadie lo ha usado nunca.
            </p>
          </div>
          {puedeEditar && !nueva && (
            <button type="button" className="btn si" onClick={abrirNueva}>+ Agregar</button>
          )}
        </div>

        {nueva && <div style={{ padding: 12 }}>{formulario}</div>}

        <div className="rueda">
          {items.length === 0 && (
            <div className="vacio"><b>Vacío</b>Agrega el primero con el botón de arriba.</div>
          )}
          {items.map((it) => {
            const n = usos[it.id] ?? 0;
            return (
              <div key={it.id} className={"fila" + (it.activo ? "" : " gris")}>
                <div className="cod">{it.id}</div>
                <div>
                  <div className="tit">{it.titulo}</div>
                  <div className="meta">
                    <span>{it.detalle}</span>
                    {!it.activo && <><span>·</span><span className="eti">DESACTIVADO</span></>}
                    {n > 0 && <><span>·</span><span>usado en {n}</span></>}
                  </div>
                  {editando === it.id && formulario}
                </div>
                <div className="der">
                  {puedeEditar && (
                    <div className="par">
                      <button type="button" className="btn" onClick={() => abrirEditar(it.id)}>
                        {editando === it.id ? "Cerrar" : "Editar"}
                      </button>
                      <button type="button" className="btn"
                              onClick={() => alternar(it.id, it.activo)}>
                        {it.activo ? "Desactivar" : "Activar"}
                      </button>
                      {n === 0 && (
                        <button type="button" className="btn mal"
                                onClick={() => borrar(it.id, it.titulo)}>
                          Borrar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
