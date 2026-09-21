"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Envase, Linea, Maquina, Sku, Uso } from "@/modulos/rotlinea/datos";

/**
 * EL MAESTRO DE ROTURA DE LÍNEA.
 *
 * Cuatro listas, y no son cuatro listas cualesquiera: son las cuatro
 * hojas del MAESTRO del Excel, que es de donde salió todo esto.
 *
 *   LÍNEAS    los cuatro trenes, con su centro de coste. Casi nunca
 *             cambian; están aquí para poder leerlas, no para tocarlas.
 *   MÁQUINAS  el recorrido del tren. El ORDEN de esta lista es el orden
 *             de la rejilla al registrar: cambiarlo aquí lo cambia allá.
 *   ENVASES   el peso por botella. ES EL DATO MÁS DELICADO DEL MÓDULO.
 *   SKU       a qué envase corresponde cada producto. Es el puente con
 *             la producción de SAP, y sin él no hay porcentaje.
 *
 * BORRAR SOLO LO QUE NUNCA SE USÓ, y no es una preferencia: los
 * registros los referencian por llave foránea, así que la base
 * rechazaría el borrado con un «violates foreign key constraint» que no
 * le explica nada a nadie. La pantalla lo dice antes, con el número.
 *
 * APAGAR ES LO QUE CASI SIEMPRE SE QUIERE: deja de poderse escoger al
 * registrar y los 24.000 registros viejos lo siguen nombrando.
 */
export function Maestro({ lineas, maquinas, envases, skus, uso, puedeEditar }: {
  lineas: Linea[]; maquinas: Maquina[]; envases: Envase[]; skus: Sku[];
  uso: Uso[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const [mandando, setMandando] = useState(false);

  const usoDe = (clase: string, clave: string) =>
    uso.find((u) => u.clase === clase && u.clave === clave);

  async function escribir(tabla: string, fila: Record<string, unknown>, quees: string) {
    setMandando(true);
    const { error } = await supabase.from(tabla).upsert(fila);
    setMandando(false);
    if (error) { avisar.mal(error.message); return false }
    avisar.bien(`${quees} guardado.`);
    router.refresh();
    return true;
  }

  async function prender(tabla: string, llave: string, valor: string | number, activo: boolean) {
    setMandando(true);
    const { error } = await supabase.from(tabla).update({ activo }).eq(llave, valor);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(activo ? "Prendido: ya se puede escoger." : "Apagado: deja de poderse escoger.");
    router.refresh();
  }

  /* EL ORDEN DE LOS ENVASES ES EL DE LA LISTA PARA ESCOGER al registrar:
     «que yo ubique primero lo que más van a usar para que en la lista
     desplegable se vea de esa manera». Se renumera la lista entera —1, 2,
     3…— y se guardan solo los que cambiaron de puesto, de una vez. */
  async function ordenarEnvases(nueva: Envase[], quees: string) {
    const cambian = nueva.map((e, i) => ({ e, orden: i + 1 })).filter((x) => x.e.orden !== x.orden);
    if (cambian.length === 0) return;
    setMandando(true);
    const { error } = await supabase.from("rotlinea_envases").upsert(cambian.map(({ e, orden }) => ({
      material: e.material, descripcion: e.descripcion, peso_kg: e.peso_kg, activo: e.activo, orden,
    })));
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(quees);
    router.refresh();
  }
  const mover = (i: number, a: number) => {
    const n = [...envases];
    const [x] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, a)), 0, x);
    ordenarEnvases(n, a === 0 ? `${x.descripcion}: ahora sale primero en la lista.` : `${x.descripcion}: queda de ${a + 1}.`);
  };
  /* Por lo que más se usa: el número de registros que ya se ve en cada
     renglón. Un toque, y después se ajusta a mano lo que haga falta. */
  const porUso = () => ordenarEnvases(
    [...envases].sort((a, b) => (usoDe("envase", b.material)?.registros ?? 0) - (usoDe("envase", a.material)?.registros ?? 0)),
    "Envases ordenados por lo que más se registra.");

  async function borrar(tabla: string, llave: string, valor: string | number, nombre: string) {
    setMandando(true);
    const { error } = await supabase.from(tabla).delete().eq(llave, valor);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(`${nombre} borrado del maestro.`);
    router.refresh();
  }

  return (
    <div className="rl-maestro">
      {avisos}

      {/* ---------- ENVASES ---------- */}
      <section className="rl-caja-m">
        <div className="rl-cab-m">
          <h2>Envases <em>{envases.length}</em></h2>
          <p>
            Lo que se rompe. El <b>peso por botella</b> es lo que convierte los kilos de la
            báscula en unidades. <b>El orden de esta lista es el de la lista para escoger</b> al
            registrar: sube lo que más se usa.
          </p>
          {puedeEditar && envases.length > 1 && (
            <button type="button" className="rl-btn chico rl-por-uso" disabled={mandando} onClick={porUso}>
              Ordenar por lo más usado
            </button>
          )}
        </div>

        <div className="rl-ojo-nota">
          <b>Cambiar un peso no reescribe el pasado.</b> Las unidades se calculan al guardar
          cada pesada, con el peso de ese momento, y se quedan quietas. Así una corrección de
          hoy no mueve tres meses de informes ya entregados — pero también significa que
          corregir un peso mal puesto <b>no arregla</b> lo que ya se registró con él.
        </div>

        {puedeEditar && (
          <Agregar campos={[
            { k: "material", r: "Material", ph: "3500162" },
            { k: "descripcion", r: "Descripción", ph: "Envase Marron 330R", ancho: true },
            { k: "peso_kg", r: "Peso (kg)", ph: "0.21", num: true },
          ]} mandando={mandando}
             alGuardar={(v) => escribir("rotlinea_envases", {
               material: String(v.material).trim(),
               descripcion: String(v.descripcion).trim(),
               peso_kg: Number(v.peso_kg),
               orden: envases.length + 1,
             }, "Envase")} />
        )}

        {envases.map((e, i) => {
          const u = usoDe("envase", e.material);
          return (
            <Renglon key={e.material} activo={e.activo} mandando={mandando}
                     puesto={{ n: i + 1, primero: i === 0, ultimo: i === envases.length - 1,
                               subir: () => mover(i, i - 1), bajar: () => mover(i, i + 1), arriba: () => mover(i, 0) }}
                     puedeEditar={puedeEditar}
                     clave={e.material} titulo={e.descripcion}
                     sub={<><b>{Number(e.peso_kg)} kg</b> por botella</>}
                     uso={u}
                     campos={[
                       { k: "descripcion", r: "Descripción", v: e.descripcion, ancho: true },
                       { k: "peso_kg", r: "Peso (kg)", v: String(Number(e.peso_kg)), num: true },
                     ]}
                     alGuardar={(v) => escribir("rotlinea_envases", {
                       material: e.material,
                       descripcion: String(v.descripcion).trim(),
                       peso_kg: Number(v.peso_kg),
                       activo: e.activo, orden: e.orden,
                     }, "Envase")}
                     alPrender={(a) => prender("rotlinea_envases", "material", e.material, a)}
                     alBorrar={() => borrar("rotlinea_envases", "material", e.material, e.descripcion)} />
          );
        })}
      </section>

      {/* ---------- MÁQUINAS ---------- */}
      <section className="rl-caja-m">
        <div className="rl-cab-m">
          <h2>Máquinas <em>{maquinas.length}</em></h2>
          <p>
            El recorrido del tren. <b>El orden de esta lista es el orden de la rejilla</b> al
            registrar: quien la llena va siguiendo la botella, no una lista alfabética.
          </p>
        </div>

        {puedeEditar && (
          <Agregar campos={[
            { k: "item", r: "Ítem", ph: "14", num: true },
            { k: "nombre", r: "Nombre", ph: "INSPECTORA DE VACÍOS", ancho: true },
            { k: "orden", r: "Orden", ph: String(maquinas.length + 1), num: true },
          ]} mandando={mandando}
             alGuardar={(v) => escribir("rotlinea_maquinas", {
               item: Number(v.item),
               nombre: String(v.nombre).trim().toUpperCase(),
               orden: Number(v.orden) || maquinas.length + 1,
             }, "Máquina")} />
        )}

        {maquinas.map((m) => {
          const u = usoDe("maquina", String(m.item));
          return (
            <Renglon key={m.item} activo={m.activo} mandando={mandando}
                     puedeEditar={puedeEditar}
                     clave={String(m.item)} titulo={m.nombre}
                     sub={<>puesto <b>{m.orden ?? "—"}</b> del recorrido</>}
                     uso={u}
                     campos={[
                       { k: "nombre", r: "Nombre", v: m.nombre, ancho: true },
                       { k: "orden", r: "Orden", v: String(m.orden ?? ""), num: true },
                     ]}
                     alGuardar={(v) => escribir("rotlinea_maquinas", {
                       item: m.item,
                       nombre: String(v.nombre).trim().toUpperCase(),
                       orden: Number(v.orden) || null,
                       activo: m.activo,
                     }, "Máquina")}
                     alPrender={(a) => prender("rotlinea_maquinas", "item", m.item, a)}
                     alBorrar={() => borrar("rotlinea_maquinas", "item", m.item, m.nombre)} />
          );
        })}
      </section>

      {/* ---------- SKU ---------- */}
      <section className="rl-caja-m">
        <div className="rl-cab-m">
          <h2>SKU y su envase <em>{skus.length}</em></h2>
          <p>
            El puente con la producción. La rotura se registra por <b>envase</b> —lo que se
            rompe es vidrio— pero SAP manda la producción por <b>SKU de producto</b>. Sin esta
            tabla no hay forma de dividir una cosa por la otra, y sin esa división no hay
            porcentaje de rotura.
          </p>
        </div>

        {puedeEditar && (
          <Agregar campos={[
            { k: "sku", r: "SKU", ph: "3617P" },
            { k: "descripcion", r: "Descripción", ph: "Costeñita R 175cc X 38", ancho: true },
            { k: "envase", r: "Envase", opciones: envases.map((e) => ({
                v: e.material, t: `${e.descripcion} · ${e.material}` })) },
          ]} mandando={mandando}
             alGuardar={(v) => escribir("rotlinea_skus", {
               sku: String(v.sku).trim().toUpperCase(),
               descripcion: String(v.descripcion).trim(),
               corto: String(v.sku).trim().replace(/[^0-9]/g, "") || null,
               envase: String(v.envase),
               orden: skus.length + 1,
             }, "SKU")} />
        )}

        {skus.map((s) => {
          const e = envases.find((x) => x.material === s.envase);
          const u = usoDe("sku", s.sku);
          return (
            <Renglon key={s.sku} activo={s.activo} mandando={mandando}
                     puedeEditar={puedeEditar}
                     clave={s.sku} titulo={s.descripcion}
                     sub={<>envase: <b>{e?.descripcion ?? s.envase}</b></>}
                     uso={u} usoDice="órdenes de producción"
                     campos={[
                       { k: "descripcion", r: "Descripción", v: s.descripcion, ancho: true },
                       { k: "envase", r: "Envase", v: s.envase,
                         opciones: envases.map((x) => ({
                           v: x.material, t: `${x.descripcion} · ${x.material}` })) },
                     ]}
                     alGuardar={(v) => escribir("rotlinea_skus", {
                       sku: s.sku, descripcion: String(v.descripcion).trim(),
                       corto: s.corto, envase: String(v.envase),
                       activo: s.activo, orden: s.orden,
                     }, "SKU")}
                     alPrender={(a) => prender("rotlinea_skus", "sku", s.sku, a)}
                     alBorrar={() => borrar("rotlinea_skus", "sku", s.sku, s.descripcion)} />
          );
        })}
      </section>

      {/* ---------- LÍNEAS ---------- */}
      <section className="rl-caja-m">
        <div className="rl-cab-m">
          <h2>Líneas <em>{lineas.length}</em></h2>
          <p>
            Los cuatro trenes con su centro de coste — el que usa contabilidad, y lo que
            amarra esta rotura con el costo en SAP.
          </p>
        </div>

        {lineas.map((l) => {
          const u = usoDe("linea", String(l.linea));
          return (
            <Renglon key={l.linea} activo={l.activo} mandando={mandando}
                     puedeEditar={puedeEditar} sinBorrar
                     clave={String(l.linea)} titulo={`Línea ${l.linea} · ${l.tren}`}
                     sub={<>centro de coste <b>{l.centro_coste}</b></>}
                     uso={u}
                     campos={[
                       { k: "tren", r: "Tren", v: l.tren },
                       { k: "centro_coste", r: "Centro de coste", v: l.centro_coste, ancho: true },
                     ]}
                     alGuardar={(v) => escribir("rotlinea_lineas", {
                       linea: l.linea, tren: String(v.tren).trim().toUpperCase(),
                       centro_coste: String(v.centro_coste).trim().toUpperCase(),
                       activo: l.activo, orden: l.orden,
                     }, "Línea")}
                     alPrender={(a) => prender("rotlinea_lineas", "linea", l.linea, a)}
                     alBorrar={() => {}} />
          );
        })}
      </section>
    </div>
  );
}

/* =====================================================================
   UN RENGLÓN
   Cerrado muestra lo que hay; abierto, los campos. No hay un modo
   "editar" de toda la lista: se edita uno y los demás siguen legibles.
   ===================================================================== */
type Campo = {
  k: string; r: string; v?: string; ph?: string;
  num?: boolean; ancho?: boolean; opciones?: { v: string; t: string }[];
};

function Renglon({ clave, titulo, sub, activo, uso, usoDice = "registros",
                   campos, puedeEditar, mandando, sinBorrar, puesto,
                   alGuardar, alPrender, alBorrar }: {
  clave: string; titulo: string; sub: React.ReactNode; activo: boolean;
  /** Mover en la lista: puesto, y subir, bajar o llevar al primero. */
  puesto?: { n: number; primero: boolean; ultimo: boolean; subir: () => void; bajar: () => void; arriba: () => void };
  uso?: { registros: number; unidades: number; ultima: string } | undefined;
  usoDice?: string;
  campos: Campo[];
  puedeEditar: boolean; mandando: boolean; sinBorrar?: boolean;
  alGuardar: (v: Record<string, string>) => Promise<boolean> | void;
  alPrender: (activo: boolean) => void;
  alBorrar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [confirma, setConfirma] = useState(false);
  const [val, setVal] = useState<Record<string, string>>(
    Object.fromEntries(campos.map((c) => [c.k, c.v ?? ""])));

  const usado = (uso?.registros ?? 0) > 0;
  const sePuedeBorrar = puedeEditar && !sinBorrar && !usado;

  return (
    <div className={"rl-item" + (activo ? "" : " apagado")}>
      <div className="rl-item-cab">
        <div className="rl-item-nom">
          <b>{puesto && <em className="rl-orden-n" title="Puesto en la lista para escoger">{puesto.n}</em>}{titulo}</b>
          <span>{clave} · {sub}</span>
        </div>

        <span className="rl-item-uso">
          {usado
            ? <>{uso!.registros.toLocaleString("es-CO")} {usoDice}</>
            : <i>sin uso</i>}
        </span>

        {puedeEditar && (
          <>
            <label className="rl-sw" title={activo ? "Se puede escoger" : "Ya no se puede escoger"}>
              <input type="checkbox" checked={activo} disabled={mandando}
                     aria-label={`${titulo}: se puede escoger`}
                     onChange={(e) => alPrender(e.target.checked)} />
              <i />
            </label>
            <button type="button" className="rl-btn chico"
                    onClick={() => { setAbierto((v) => !v); setConfirma(false) }}>
              {abierto ? "Cerrar" : "Editar"}
            </button>
          </>
        )}
        {puesto && puedeEditar && (
          <div className="rl-orden" role="group" aria-label={`Puesto de ${titulo} en la lista`}>
            <button type="button" disabled={mandando || puesto.primero} onClick={puesto.subir}
                    aria-label={`Subir ${titulo}`} title="Subir uno">▲</button>
            <button type="button" disabled={mandando || puesto.ultimo} onClick={puesto.bajar}
                    aria-label={`Bajar ${titulo}`} title="Bajar uno">▼</button>
            <button type="button" className="rl-orden-1" disabled={mandando || puesto.primero} onClick={puesto.arriba}
                    aria-label={`Poner ${titulo} de primero`} title="Poner de primero">1º</button>
          </div>
        )}
      </div>

      {abierto && (
        <div className="rl-item-form">
          <div className="rl-campos">
            {campos.map((c) => (
              <div key={c.k} className={"rl-campo" + (c.ancho ? " rl-ancho" : "")}>
                <label htmlFor={`${clave}-${c.k}`}>{c.r}</label>
                {c.opciones ? (
                  <select id={`${clave}-${c.k}`} value={val[c.k]}
                          onChange={(e) => setVal((v) => ({ ...v, [c.k]: e.target.value }))}>
                    {c.opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                  </select>
                ) : (
                  <input id={`${clave}-${c.k}`} value={val[c.k]}
                         type={c.num ? "number" : "text"} step={c.num ? "0.000001" : undefined}
                         onChange={(e) => setVal((v) => ({ ...v, [c.k]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>

          <div className="rl-fila-btn">
            <button type="button" className="rl-btn si" disabled={mandando}
                    onClick={async () => { if (await alGuardar(val)) setAbierto(false) }}>
              {mandando ? "Guardando…" : "Guardar"}
            </button>

            {sePuedeBorrar && !confirma && (
              <button type="button" className="rl-enlace-mal" onClick={() => setConfirma(true)}>
                Borrar del maestro
              </button>
            )}
            {sePuedeBorrar && confirma && (
              <>
                <button type="button" className="rl-btn mal" disabled={mandando}
                        onClick={alBorrar}>Sí, borrar</button>
                <button type="button" className="rl-btn" onClick={() => setConfirma(false)}>
                  Dejar así
                </button>
              </>
            )}

            {/* SE DICE POR QUÉ NO SE PUEDE, con el número. "No se puede
                borrar" a secas es lo que hace que alguien lo intente
                cinco veces. */}
            {puedeEditar && !sinBorrar && usado && (
              <span className="rl-nota">
                No se puede borrar: <b>{uso!.registros.toLocaleString("es-CO")} {usoDice}</b> lo
                nombran. Apágalo con el interruptor — deja de poderse escoger y lo viejo se queda.
              </span>
            )}
            {sinBorrar && (
              <span className="rl-nota">
                Las líneas no se borran: son los trenes de la planta. Se apagan si dejan de correr.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Agregar uno nuevo ---------- */
function Agregar({ campos, mandando, alGuardar }: {
  campos: Campo[];
  mandando: boolean;
  alGuardar: (v: Record<string, string>) => Promise<boolean> | void;
}) {
  const vacio = Object.fromEntries(campos.map((c) => [c.k, c.opciones?.[0]?.v ?? ""]));
  const [val, setVal] = useState<Record<string, string>>(vacio);
  const falta = campos.some((c) => !String(val[c.k] ?? "").trim());

  return (
    <form className="rl-agregar"
          onSubmit={async (e) => {
            e.preventDefault();
            if (falta) return;
            if (await alGuardar(val)) setVal(vacio);
          }}>
      {campos.map((c) => (
        <div key={c.k} className={"rl-campo" + (c.ancho ? " rl-ancho" : "")}>
          <span className="rl-rot">{c.r}</span>
          {c.opciones ? (
            <select value={val[c.k]} aria-label={c.r}
                    onChange={(e) => setVal((v) => ({ ...v, [c.k]: e.target.value }))}>
              {c.opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
            </select>
          ) : (
            <input value={val[c.k]} placeholder={c.ph} aria-label={c.r}
                   type={c.num ? "number" : "text"} step={c.num ? "0.000001" : undefined}
                   onChange={(e) => setVal((v) => ({ ...v, [c.k]: e.target.value }))} />
          )}
        </div>
      ))}
      <button type="submit" className="rl-btn si" disabled={mandando || falta}>Agregar</button>
    </form>
  );
}
