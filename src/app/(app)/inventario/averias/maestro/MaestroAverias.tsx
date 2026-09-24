"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { CausalFila } from "@/modulos/averias/datos";

/**
 * EL MAESTRO DE AVERÍAS — las causales.
 *
 * SON DATOS, NO CÓDIGO. Hoy son tres —transporte, depósito,
 * contaminado— y ya se mencionó una cuarta: «avería del proveedor». El
 * día que llegue, nadie debería tener que esperar un despliegue.
 *
 * POR ESO NO SON UN ENUM. En PostgreSQL un valor de enum no se puede
 * quitar y agregar uno obliga a una migración; con tabla, esta pantalla
 * basta.
 *
 * «SI LA CULPA ES DE AFUERA» ES UNA CASILLA Y NO SE SACA DEL NOMBRE.
 * Una avería de transporte LLEGA averiada —es del transportador—; una
 * de depósito se hizo aquí. Es la distinción que decide a quién se le
 * cobra, y adivinarla leyendo la palabra «transporte» funciona hasta la
 * primera causal que se llame distinto.
 *
 * NO HAY BORRAR, SE APAGA. Una causal que ya se usó no se puede quitar
 * sin dejar esas averías apuntando a nada. Apagar la saca del
 * desplegable y deja lo viejo diciendo lo que decía.
 */
const VACIA = { clave: "", nombre: "", externa: false };

/** «Avería del proveedor» → «averia_del_proveedor». */
function aClave(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function MaestroAverias({ causales, uso, puedeEditar }: {
  causales: CausalFila[];
  /** Cuántas averías usa cada causal. Decide si se ofrece apagarla. */
  uso: Record<string, number>;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(VACIA);
  const [mandando, setMandando] = useState(false);

  function abrirNueva() { setF(VACIA); setNueva(true); setEditando(null) }
  function abrirEditar(c: CausalFila) {
    setNueva(false);
    setEditando(editando === c.clave ? null : c.clave);
    setF({ clave: c.clave, nombre: c.nombre, externa: c.externa });
  }

  async function guardar() {
    const nombre = f.nombre.trim();
    if (!nombre) { avisar.mal("Falta el nombre de la causal."); return }
    /* LA CLAVE NO SE EDITA: es con lo que están amarradas las averías
       viejas, y cambiarla dejaría un histórico apuntando a algo que ya
       no existe. Se edita el NOMBRE, que es lo que la gente lee. */
    const clave = editando ?? aClave(nombre);
    if (!clave) { avisar.mal("Ese nombre no deja armar una clave."); return }
    if (!editando && causales.some((c) => c.clave === clave)) {
      avisar.mal(`Ya hay una causal con esa clave: «${clave}».`); return;
    }

    setMandando(true);
    const { error } = editando
      ? await supabase.from("averias_causales")
          .update({ nombre, externa: f.externa }).eq("clave", clave)
      : await supabase.from("averias_causales")
          .insert({ clave, nombre, externa: f.externa,
                    orden: (causales.at(-1)?.orden ?? 0) + 1 });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(editando ? "Guardada." : `«${nombre}» ya se puede escoger al registrar.`);
    setNueva(false); setEditando(null); setF(VACIA);
    router.refresh();
  }

  async function alternar(c: CausalFila) {
    setMandando(true);
    const { error } = await supabase.from("averias_causales")
      .update({ activo: !c.activo }).eq("clave", c.clave);
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    avisar.bien(c.activo
      ? `«${c.nombre}» deja de ofrecerse al registrar. Las averías viejas la siguen diciendo.`
      : `«${c.nombre}» vuelve al desplegable.`);
    router.refresh();
  }

  const formulario = (
    <div className="avr-form">
      <div className="avr-campos">
        <label className="avr-c avr-ancho">
          <span>Nombre de la causal</span>
          <input value={f.nombre} placeholder="Avería del proveedor"
                 onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </label>
      </div>

      <label className="avr-chk">
        <input type="checkbox" checked={f.externa}
               onChange={(e) => setF({ ...f, externa: e.target.checked })} />
        <span>
          <b>La culpa es de afuera</b> — el producto <i>llega</i> averiado y no se dañó aquí.
          Es lo que decide a quién se le cobra, y por eso es una casilla y no algo que se
          adivine leyendo el nombre.
        </span>
      </label>

      <div className="avr-acciones">
        <button type="button" className="btn" disabled={mandando} onClick={guardar}>
          {mandando ? "Guardando…" : editando ? "Guardar" : "Agregar la causal"}
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
      {avisos}

      <div className="fe-barra">
        <p className="fe-cuenta">
          {causales.filter((c) => c.activo).length} causales activas de {causales.length}
        </p>
        {puedeEditar && !nueva && (
          <button type="button" className="btn" onClick={abrirNueva}>+ Agregar causal</button>
        )}
      </div>

      {nueva && formulario}

      <div className="fe-lista">
        {causales.length === 0 && (
          <p className="fe-vacio">
            No hay causales. Sin al menos una, no se puede registrar ninguna avería.
          </p>
        )}
        {causales.map((c) => {
          const n = uso[c.clave] ?? 0;
          return (
            <article key={c.clave} className={"avr-fila" + (c.activo ? "" : " avr-anulada")}>
              <div className="avr-cod">
                <b>{c.clave}</b>
              </div>
              <div className="avr-que">
                <div className="avr-tit">{c.nombre}</div>
                <div className="avr-meta">
                  <span className={c.externa ? "avr-ext" : ""}>
                    {c.externa ? "Llega averiado — la culpa es de afuera" : "Se dañó aquí"}
                  </span>
                  <span>·</span>
                  <span>{n === 0 ? "sin usar todavía" : `usada en ${n}`}</span>
                  {!c.activo && <><span>·</span><span className="avr-eti avr-gris">APAGADA</span></>}
                </div>
                {editando === c.clave && <div className="avr-editando">{formulario}</div>}
              </div>
              <div className="avr-estado" />
              {puedeEditar && (
                <div className="avr-btns">
                  <button type="button" className="btn plano" onClick={() => abrirEditar(c)}>
                    {editando === c.clave ? "Cerrar" : "Editar"}
                  </button>
                  <button type="button" className="btn plano" disabled={mandando}
                          onClick={() => alternar(c)}>
                    {c.activo ? "Apagar" : "Encender"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
