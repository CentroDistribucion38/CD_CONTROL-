"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { diaColombia } from "@/modulos/inventario/corte";
import {
  agregarHojas, aPayload, hojasVacias, ponerPersona, quitarHoja, revisar, textoResumen,
  type Equipo, type HojaForm,
} from "@/modulos/inventario/fiscal";

/* ===================================================================
   EL INVENTARIO FISCAL, PANTALLA DE QUIEN LO ORGANIZA

   Una lista de los inventarios fiscales (el más reciente primero) y un
   formulario para armar uno: nombre, fecha y las hojas. Cada hoja lleva su
   número y dos personas: la del operador logístico y la de Bavaria. Las hojas
   son las que hagan falta —se agregan y se quitan—, y una puede quedar con una
   sola persona mientras se arman las parejas.

   Una persona no puede estar en dos sitios: en las listas, quien ya está en otra
   hoja sale deshabilitado con el número de esa hoja, y si aun así se repite
   (por ejemplo al editar) el formulario lo dice y no deja guardar.
   =================================================================== */
export type Persona = { id: string; nombre: string; activo: boolean };
export type FiscalBD = { id: string; nombre: string; fecha: string; estado: "abierto" | "cerrado"; hojas: HojaForm[] };
type FormF = { id: string | null; nombre: string; fecha: string; hojas: HojaForm[] };

const fechaLarga = (d: string) => { const [a, m, di] = d.split("-"); return `${di}/${m}/${a}` };

export function Fiscal({ bodegaId, personas, fiscales, puedeEditar, manda, ahora }: {
  bodegaId: string; personas: Persona[]; fiscales: FiscalBD[];
  puedeEditar: boolean; manda: boolean; ahora: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormF | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<string | null>(null);
  const nombre = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);

  const nuevo = () => {
    setMal(null); setAviso(null);
    setForm({ id: null, nombre: "", fecha: diaColombia(ahora), hojas: hojasVacias(2) });
  };
  const editar = (f: FiscalBD) => {
    setMal(null); setAviso(null);
    setForm({ id: f.id, nombre: f.nombre, fecha: f.fecha, hojas: f.hojas.length ? f.hojas : hojasVacias(1) });
  };

  async function guardar() {
    if (!form) return;
    setMal(null); setOcupado(true);
    const { error } = await createClient().rpc("inv_fiscal_guardar", {
      p_id: form.id, p_bodega: bodegaId, p_nombre: form.nombre.trim(), p_fecha: form.fecha, p_hojas: aPayload(form.hojas),
    });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setForm(null);
    setAviso(form.id ? "Inventario fiscal actualizado." : "Inventario fiscal guardado.");
    router.refresh();
  }
  async function eliminar(id: string) {
    setMal(null); setAviso(null); setOcupado(true);
    const { error } = await createClient().rpc("inv_fiscal_eliminar", { p_id: id });
    setOcupado(false);
    if (error) return setMal(traducirError(error.message));
    setBorrar(null);
    setAviso("Inventario fiscal eliminado.");
    router.refresh();
  }

  return (
    <>
      <section className="cabeza fi-cabeza">
        <div>
          <p className="ojo">INVENTARIO · POR PAREJAS</p>
          <h1>Inventario fiscal</h1>
          <p className="sub">
            Cada hoja de conteo la cuentan dos personas, <b>una del operador logístico y una de Bavaria</b>,
            cada una por su lado. Aquí armas las parejas y numeras las hojas: son las que hagan falta, y una
            hoja puede quedar con una sola persona mientras terminas de armarlas.
          </p>
        </div>
      </section>

      {aviso && <p className="cl-ok" role="status">{aviso}</p>}
      {mal && !form && <p className="cl-mal" role="alert">{mal}</p>}

      {form ? (
        <FormFiscal form={form} setForm={setForm} personas={personas} ocupado={ocupado} mal={mal}
                    onGuardar={guardar} onCancelar={() => { setForm(null); setMal(null) }} />
      ) : (
        <>
          {puedeEditar && (
            <div className="cl-acciones">
              <button type="button" className="btn grande" onClick={nuevo}>Nuevo inventario fiscal</button>
            </div>
          )}
          <h2 className="cl-h">Inventarios fiscales <span>{fiscales.length}</span></h2>
          {fiscales.length === 0 ? (
            <p className="fe-vacio">Todavía no hay ninguno. {puedeEditar ? "Arma el primero con el botón de arriba." : ""}</p>
          ) : (
            <div className="fe-lista">
              {fiscales.map((f) => {
                const r = revisar(f.hojas);
                return (
                  <article key={f.id} className="fe-fila fi-fila">
                    <div className="cl-cab">
                      <b className="cl-hora">{f.nombre}</b>
                      <span className="cl-quien">{fechaLarga(f.fecha)} · <i className={"fi-estado " + f.estado}>{f.estado === "abierto" ? "ABIERTO" : "CERRADO"}</i></span>
                    </div>
                    <p className="cl-sub">{textoResumen(r)}</p>
                    <table className="fi-hojas">
                      <thead><tr><th>Hoja</th><th>Operador logístico</th><th>Bavaria</th></tr></thead>
                      <tbody>
                        {f.hojas.map((h) => (
                          <tr key={h.numero}>
                            <th scope="row">{h.numero}</th>
                            <td data-et="Operador logístico">{h.ol ? nombre.get(h.ol) ?? "—" : <em>falta</em>}</td>
                            <td data-et="Bavaria">{h.bavaria ? nombre.get(h.bavaria) ?? "—" : <em>falta</em>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="cl-botones">
                      {puedeEditar && f.estado === "abierto" && (
                        <button type="button" className="btn plano" onClick={() => editar(f)}>Editar</button>
                      )}
                      {manda && (borrar === f.id ? (
                        <span className="cl-conf">¿Eliminar este inventario fiscal?
                          <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => eliminar(f.id)}>Sí, eliminar</button>
                          <button type="button" className="btn plano" onClick={() => setBorrar(null)}>No</button>
                        </span>
                      ) : (
                        <button type="button" className="btn plano" onClick={() => setBorrar(f.id)}>Eliminar</button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function FormFiscal({ form, setForm, personas, ocupado, mal, onGuardar, onCancelar }: {
  form: FormF; setForm: (f: FormF) => void; personas: Persona[]; ocupado: boolean; mal: string | null;
  onGuardar: () => void; onCancelar: () => void;
}) {
  const [cuantas, setCuantas] = useState("1");
  const r = revisar(form.hojas);
  /* Dónde está ya cada persona, para deshabilitarla en las demás listas. */
  const dondeEsta = new Map<string, number>();
  for (const h of form.hojas) for (const id of [h.ol, h.bavaria]) if (id) dondeEsta.set(id, h.numero);
  const sinNombre = form.nombre.trim().length === 0;
  const puede = !ocupado && !sinNombre && r.errores.length === 0 && form.fecha !== "";
  const cambia = (hojas: HojaForm[]) => setForm({ ...form, hojas });

  const Lista = ({ h, eq, et }: { h: HojaForm; eq: Equipo; et: string }) => (
    <label>
      <span>{et}</span>
      <select value={h[eq]} onChange={(e) => cambia(ponerPersona(form.hojas, h.numero, eq, e.target.value))}>
        <option value="">— sin asignar —</option>
        {personas.map((p) => {
          const en = dondeEsta.get(p.id);
          const otra = en != null && p.id !== h[eq];
          return (
            <option key={p.id} value={p.id} disabled={otra}>
              {p.nombre}{!p.activo ? " (desactivado)" : ""}{otra ? ` · ya en la hoja ${en}` : ""}
            </option>
          );
        })}
      </select>
    </label>
  );

  return (
    <section className="fe-editor nuevo fi-form" aria-label={form.id ? "Editar inventario fiscal" : "Nuevo inventario fiscal"}>
      <h2>{form.id ? "Editar inventario fiscal" : "Nuevo inventario fiscal"}</h2>
      <div className="fe-campos">
        <label className="ancho">
          <span>Nombre</span>
          <input value={form.nombre} maxLength={80} placeholder="Ej. Fiscal octubre"
                 onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </label>
        <label>
          <span>Fecha</span>
          <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        </label>
      </div>

      <h3 className="fi-t">Hojas y parejas <small>{textoResumen(r)}</small></h3>
      <div className="fi-hojas-form">
        {form.hojas.map((h) => (
          <div key={h.numero} className={"fi-hoja" + (r.repetidas.size && [h.ol, h.bavaria].some((id) => id && r.repetidas.has(id)) ? " mal" : "")}>
            <div className="fi-hoja-cab">
              <b>Hoja {h.numero}</b>
              <button type="button" className="cl-quitar" onClick={() => cambia(quitarHoja(form.hojas, h.numero))}
                      aria-label={`Quitar la hoja ${h.numero}`}>Quitar</button>
            </div>
            <div className="fe-campos">
              <Lista h={h} eq="ol" et="Operador logístico" />
              <Lista h={h} eq="bavaria" et="Bavaria" />
            </div>
          </div>
        ))}
      </div>

      <div className="fi-agregar">
        <label>
          <span>Agregar</span>
          <input type="number" min={1} max={100} inputMode="numeric" value={cuantas}
                 onChange={(e) => setCuantas(e.target.value)} aria-label="Cuántas hojas agregar" />
        </label>
        <button type="button" className="btn plano" onClick={() => {
          const n = Math.min(100, Math.max(1, Math.floor(Number(cuantas) || 1)));
          cambia(agregarHojas(form.hojas, n));
        }}>hojas más</button>
      </div>

      {(r.errores.length > 0 || mal) && (
        <div className="cl-mal" role="alert">
          {mal ?? "Revisa esto antes de guardar:"}
          {!mal && <ul>{r.errores.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
      )}
      {r.errores.length === 0 && (r.aMedias > 0 || r.vacias > 0) && (
        <p className="cl-nota">
          {r.aMedias > 0 && <>{r.aMedias} {r.aMedias === 1 ? "hoja tiene" : "hojas tienen"} una sola persona. </>}
          {r.vacias > 0 && <>{r.vacias} {r.vacias === 1 ? "hoja no tiene" : "hojas no tienen"} a nadie todavía. </>}
          Se puede guardar así y completar después.
        </p>
      )}

      <div className="cl-botones">
        <button type="button" className="btn grande" disabled={!puede} onClick={onGuardar}>
          {ocupado ? "Guardando…" : form.id ? "Guardar los cambios" : "Guardar el inventario fiscal"}
        </button>
        <button type="button" className="btn plano" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
      </div>
    </section>
  );
}
