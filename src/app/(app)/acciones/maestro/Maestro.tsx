"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Area, Motivo, Zona } from "@/modulos/acciones/datos";

/**
 * MAESTRO — las zonas, los motivos y las áreas.
 *
 * Son DATOS, no código: el día que abran el pasillo 5 nadie debería tener
 * que esperar un despliegue. Por eso se crean, se editan, se desactivan y
 * se borran aquí.
 *
 * BORRAR Y DESACTIVAR NO SON LO MISMO, y la diferencia es la que evita
 * perder el histórico:
 *
 *   DESACTIVAR  deja de ofrecerse al reportar, pero las acciones viejas
 *               siguen mostrando su zona y siguen contando para la
 *               reincidencia. Es lo que se hace el 99% de las veces.
 *   BORRAR      solo se puede si NADIE la ha usado nunca. Es para el
 *               error de dedo: creaste "AG01-PAS-O5" con O de oso y
 *               quieres que desaparezca sin dejar rastro.
 *
 * Si algo ya tiene acciones, el botón de borrar no aparece y en su lugar
 * se dice cuántas tiene. La base lo rechazaría de todas formas por la
 * llave foránea, pero un "violates foreign key constraint" no le explica
 * nada a nadie; decirlo antes sí.
 *
 * LA CLAVE NO SE EDITA. En las zonas es el código pegado en la pared que
 * lee la cámara: cambiarlo aquí dejaría el QR apuntando a algo que ya no
 * existe. En los motivos es con lo que se agrupa la reincidencia: al
 * cambiarla, las tres apariciones viejas dejarían de ser "lo mismo". Se
 * edita el NOMBRE, que es lo que la gente lee; la clave se queda quieta.
 */

type Hoja = "zonas" | "motivos" | "areas";

/** Una clave legible a partir del nombre: "Pasillo 5" → "pasillo_5". */
function aClave(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function Maestro({ zonas, motivos, areas, uso, puedeEditar }: {
  zonas: Zona[];
  motivos: Motivo[];
  areas: Area[];
  uso: { zonas: Record<string, number>; motivos: Record<string, number> };
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [hoja, setHoja] = useState<Hoja>("zonas");
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  /* Un solo formulario para las tres hojas: los campos que no aplican no
     se pintan. Tres formularios separados serían tres sitios donde
     arreglar el mismo detalle. */
  const vacio = { clave: "", nombre: "", proceso: "", area: areas[0]?.clave ?? "", critico: false };
  const [f, setF] = useState(vacio);

  const tabla = hoja === "zonas" ? "acciones_zonas"
              : hoja === "motivos" ? "acciones_motivos" : "acciones_areas";
  const llave = hoja === "zonas" ? "codigo" : "clave";

  function abrirNueva() {
    setF(vacio); setNueva(true); setEditando(null); setBorrando(null); setMal(null);
  }

  function abrirEditar(id: string) {
    setNueva(false); setBorrando(null); setMal(null);
    setEditando(editando === id ? null : id);
    if (hoja === "zonas") {
      const z = zonas.find((x) => x.codigo === id)!;
      setF({ clave: z.codigo, nombre: z.nombre, proceso: z.proceso ?? "", area: z.area, critico: false });
    } else if (hoja === "motivos") {
      const m = motivos.find((x) => x.clave === id)!;
      setF({ clave: m.clave, nombre: m.nombre, proceso: "", area: m.area ?? "", critico: m.critico });
    } else {
      const a = areas.find((x) => x.clave === id)!;
      setF({ clave: a.clave, nombre: a.nombre, proceso: "", area: "", critico: false });
    }
  }

  async function crear() {
    setMandando(true); setMal(null);
    const clave = hoja === "zonas"
      ? f.clave.trim().toUpperCase()
      : (f.clave.trim() || aClave(f.nombre));

    /* El tipo de la fila cambia con la hoja y PostgREST espera una forma
       concreta por tabla. Se arma como Record y se manda: tres inserts
       separados serían tres veces el mismo manejo de error. */
    const fila: Record<string, unknown> =
      hoja === "zonas"
        ? { codigo: clave, nombre: f.nombre.trim(), proceso: f.proceso.trim() || null, area: f.area }
        : hoja === "motivos"
          ? { clave, nombre: f.nombre.trim(), area: f.area || null, critico: f.critico }
          : { clave, nombre: f.nombre.trim() };

    const { error } = await supabase.from(tabla).insert(fila);
    setMandando(false);
    if (error) { setMal(traducir(error.message)); return }
    setNueva(false); setF(vacio); router.refresh();
  }

  async function guardar(id: string) {
    setMandando(true); setMal(null);
    const cambio: Record<string, unknown> =
      hoja === "zonas"
        ? { nombre: f.nombre.trim(), proceso: f.proceso.trim() || null, area: f.area }
        : hoja === "motivos"
          ? { nombre: f.nombre.trim(), area: f.area || null, critico: f.critico }
          : { nombre: f.nombre.trim() };

    const { error } = await supabase.from(tabla).update(cambio).eq(llave, id);
    setMandando(false);
    if (error) { setMal(traducir(error.message)); return }
    setEditando(null); router.refresh();
  }

  async function alternar(id: string, activo: boolean) {
    setMal(null);
    const { error } = await supabase.from(tabla).update({ activo: !activo }).eq(llave, id);
    if (error) { setMal(traducir(error.message)); return }
    router.refresh();
  }

  async function borrar(id: string) {
    setMandando(true); setMal(null);
    const { error } = await supabase.from(tabla).delete().eq(llave, id);
    setMandando(false);
    if (error) { setMal(traducir(error.message)); return }
    setBorrando(null); router.refresh();
  }

  const nombreArea = (c: string | null) => areas.find((a) => a.clave === c)?.nombre ?? c ?? "—";
  const usos = (id: string) =>
    hoja === "zonas" ? (uso.zonas[id] ?? 0)
    : hoja === "motivos" ? (uso.motivos[id] ?? 0)
    : 0;

  /* Las áreas no se cuentan por acción sino por lo que cuelga de ellas:
     una zona o un motivo apuntando a un área también impide borrarla. */
  const usosArea = (clave: string) =>
    zonas.filter((z) => z.area === clave).length + motivos.filter((m) => m.area === clave).length;

  const filas: { id: string; nombre: string; sub: string; activo: boolean; critico?: boolean }[] =
    hoja === "zonas"
      ? zonas.map((z) => ({
          id: z.codigo, nombre: z.nombre + (z.proceso ? ` · ${z.proceso}` : ""),
          sub: nombreArea(z.area), activo: z.activo,
        }))
      : hoja === "motivos"
        ? motivos.map((m) => ({
            id: m.clave, nombre: m.nombre, sub: nombreArea(m.area),
            activo: m.activo, critico: m.critico,
          }))
        : areas.map((a) => ({
            id: a.clave, nombre: a.nombre,
            sub: `${zonas.filter((z) => z.area === a.clave).length} zonas · ` +
                 `${motivos.filter((m) => m.area === a.clave).length} motivos`,
            activo: a.activo,
          }));

  const puedeGuardar = f.nombre.trim().length >= 2 &&
    (hoja !== "zonas" || f.clave.trim().length >= 4);

  return (
    <>
      <div className="filtros">
        {(["zonas", "motivos", "areas"] as Hoja[]).map((h) => (
          <button key={h} type="button" className={"btn" + (hoja === h ? " si" : "")}
                  onClick={() => { setHoja(h); setNueva(false); setEditando(null); setBorrando(null); setMal(null); }}>
            {h === "zonas" ? `Zonas (${zonas.length})`
             : h === "motivos" ? `Motivos (${motivos.length})`
             : `Áreas (${areas.length})`}
          </button>
        ))}
        {puedeEditar && (
          <button type="button" className="btn mas-chico" onClick={() => (nueva ? setNueva(false) : abrirNueva())}>
            {nueva ? "Cancelar" : `+  Agregar ${hoja === "zonas" ? "zona" : hoja === "motivos" ? "motivo" : "área"}`}
          </button>
        )}
      </div>

      {mal && <div className="aviso rojo">{mal}</div>}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{hoja === "zonas" ? "Las zonas de la bodega"
               : hoja === "motivos" ? "Los motivos" : "Las áreas"}</h2>
            <p>{TEXTO[hoja]}</p>
          </div>
        </div>

        {nueva && (
          <div className="panel" style={{ margin: 12 }}>
            <Campos hoja={hoja} f={f} setF={setF} areas={areas} nuevo />
            <div className="acciones-panel">
              <button type="button" className="btn si" disabled={mandando || !puedeGuardar}
                      onClick={crear}>
                {mandando ? "Guardando…" : "Agregar"}
              </button>
              <button type="button" className="btn plano" onClick={() => setNueva(false)}>Cancelar</button>
            </div>
          </div>
        )}

        <div className="rueda">
          {filas.length === 0 && (
            <div className="vacio">
              <b>Todavía no hay nada</b>
              El botón de arriba agrega {hoja === "zonas" ? "la primera zona" : hoja === "motivos" ? "el primer motivo" : "la primera área"}.
            </div>
          )}

          {filas.map((x) => {
            const n = hoja === "areas" ? usosArea(x.id) : usos(x.id);
            return (
              <div className={"fila dos" + (x.activo ? "" : " apagada")} key={x.id}>
                <div>
                  <div className="tit">{x.nombre}</div>
                  <div className="meta">
                    <code className="clave">{x.id}</code>
                    <span>·</span>
                    <span>{x.sub}</span>
                    {x.critico && <><span>·</span><span className="eti alta">CRÍTICO</span></>}
                    {!x.activo && <><span>·</span><span className="eti anulada">DESACTIVADA</span></>}
                    {n > 0 && (
                      <>
                        <span>·</span>
                        <span>{n} {hoja === "areas" ? "cosas colgando" : n === 1 ? "acción" : "acciones"}</span>
                      </>
                    )}
                  </div>

                  {editando === x.id && (
                    <div className="panel">
                      <Campos hoja={hoja} f={f} setF={setF} areas={areas} />
                      <div className="acciones-panel">
                        <button type="button" className="btn si" disabled={mandando || !puedeGuardar}
                                onClick={() => guardar(x.id)}>
                          {mandando ? "Guardando…" : "Guardar"}
                        </button>
                        <button type="button" className="btn plano" onClick={() => setEditando(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {borrando === x.id && (
                    <div className="panel">
                      <div className="aviso rojo">
                        Se borra <b>{x.nombre}</b> y no queda rastro. Nadie la ha usado todavía,
                        así que no se pierde nada — pero no hay deshacer.
                      </div>
                      <div className="acciones-panel">
                        <button type="button" className="btn mal" disabled={mandando}
                                onClick={() => borrar(x.id)}>
                          {mandando ? "Borrando…" : "Sí, borrar"}
                        </button>
                        <button type="button" className="btn plano" onClick={() => setBorrando(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {puedeEditar && (
                  <div className="der">
                    <div className="par">
                      <button type="button" className="btn" onClick={() => abrirEditar(x.id)}>
                        {editando === x.id ? "Cerrar" : "Editar"}
                      </button>
                      <button type="button" className={"btn" + (x.activo ? "" : " si")}
                              onClick={() => alternar(x.id, x.activo)}>
                        {x.activo ? "Desactivar" : "Activar"}
                      </button>
                      {n === 0 ? (
                        <button type="button" className="btn mal"
                                onClick={() => { setBorrando(borrando === x.id ? null : x.id); setEditando(null); }}>
                          Eliminar
                        </button>
                      ) : (
                        <span className="nota-chica" title="Borrarla se llevaría el histórico">
                          no se puede borrar, ya se usó
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

const TEXTO: Record<Hoja, string> = {
  zonas:
    "El código es el que va pegado en la pared y el que lee la cámara: por eso no se puede " +
    "cambiar. Desactivar la quita de la lista de reportar sin tocar el histórico; eliminar solo " +
    "se puede si nunca se usó.",
  motivos:
    "La lista cerrada de lo que se puede reportar. Es lista y no texto libre porque la " +
    "reincidencia se cuenta por motivo y zona: “estibas mal apiladas” escrito de catorce maneras " +
    "no se cuenta nunca como tres veces lo mismo. El detalle de cada caso sigue siendo libre.",
  areas:
    "Son los renglones de “Cumplimiento por área” del tablero. Cada zona y cada motivo apuntan " +
    "a una; por eso un área con cosas colgando no se puede borrar.",
};

/** Los campos del formulario, compartidos entre crear y editar. */
function Campos({ hoja, f, setF, areas, nuevo }: {
  hoja: Hoja;
  f: { clave: string; nombre: string; proceso: string; area: string; critico: boolean };
  setF: (v: { clave: string; nombre: string; proceso: string; area: string; critico: boolean }) => void;
  areas: Area[];
  nuevo?: boolean;
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 9 }}>
        {hoja === "zonas" && (
          <div>
            <label>CÓDIGO {nuevo ? "(el del QR)" : "· no se puede cambiar"}</label>
            <input value={f.clave} placeholder="AG01-PAS-05" disabled={!nuevo}
                   onChange={(e) => setF({ ...f, clave: e.target.value.toUpperCase() })} />
          </div>
        )}
        <div>
          <label>NOMBRE</label>
          <input value={f.nombre}
                 placeholder={hoja === "zonas" ? "Pasillo 5" : hoja === "motivos" ? "Estiba sin envolver" : "Calidad"}
                 onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </div>
        {hoja === "zonas" && (
          <div>
            <label>PROCESO</label>
            <input value={f.proceso} placeholder="Picking"
                   onChange={(e) => setF({ ...f, proceso: e.target.value })} />
          </div>
        )}
        {hoja !== "areas" && (
          <div>
            <label>ÁREA</label>
            <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
              {hoja === "motivos" && <option value="">Sin área fija</option>}
              {areas.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {hoja === "motivos" && (
        <label style={{ display: "flex", gap: 9, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={f.critico} style={{ width: 18, height: 18, minHeight: 0 }}
                 onChange={(e) => setF({ ...f, critico: e.target.checked })} />
          <span style={{ letterSpacing: 0, textTransform: "none", fontSize: 12.5 }}>
            Crítico — propone prioridad alta al reportarlo. Se puede bajar, pero hay que hacerlo
            a propósito.
          </span>
        </label>
      )}

      {hoja === "zonas" && (
        <div className="aviso">
          El área es la que agrupa el tablero: una acción reportada en esta zona va a contar para{" "}
          <b>{areas.find((a) => a.clave === f.area)?.nombre ?? "—"}</b>, no para el área del motivo.
        </div>
      )}
    </>
  );
}

/** Los errores de Postgres no le explican nada a quien está en la bodega. */
function traducir(m: string): string {
  const t = m.toLowerCase();
  if (t.includes("duplicate key")) return "Ya existe uno con esa clave. Escoge otra.";
  if (t.includes("foreign key")) {
    return "No se puede borrar: ya hay acciones que apuntan a esto. Desactívalo en vez de borrarlo — " +
           "borrarlo se llevaría por delante el histórico con el que se cuenta la reincidencia.";
  }
  if (t.includes("row-level security") || t.includes("permission")) {
    return "Tu usuario no tiene permiso para editar el maestro. Se necesita rol de supervisor o administrador.";
  }
  if (t.includes("does not exist") || t.includes("schema cache")) {
    return "Falta correr supabase/modulos/acciones.sql en el SQL Editor de Supabase.";
  }
  return m;
}
