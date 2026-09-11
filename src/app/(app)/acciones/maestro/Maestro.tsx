"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Motivo, Zona } from "@/modulos/acciones/datos";

/**
 * MAESTRO — las zonas y los motivos.
 *
 * Son DATOS, no código: el día que abran el pasillo 5 nadie debería tener
 * que esperar un despliegue. Por eso se editan aquí y no en un archivo.
 *
 * QUITAR ES DESACTIVAR, NO BORRAR. Una zona que ya tiene acciones no se
 * puede borrar sin romper el histórico, y el histórico es justamente lo
 * que cuenta la reincidencia: borrar el pasillo 3 haría que sus tres
 * apariciones desaparecieran y el bloqueo dejara de dispararse.
 *
 * EL CÓDIGO ES LA LLAVE y se escribe pegado en la pared. Por eso no se
 * puede cambiar: cambiarlo aquí dejaría el QR del pasillo apuntando a una
 * zona que ya no existe, y quien lo escanee vería "ese código no está en
 * el maestro" sin entender por qué.
 */
export function Maestro({ zonas, motivos, areas, puedeEditar }: {
  zonas: Zona[];
  motivos: Motivo[];
  areas: { clave: string; nombre: string }[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [hoja, setHoja] = useState<"zonas" | "motivos">("zonas");
  const [nueva, setNueva] = useState(false);
  const [z, setZ] = useState({ codigo: "", nombre: "", proceso: "", area: areas[0]?.clave ?? "" });
  const [mandando, setMandando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  async function guardarZona() {
    setMandando(true);
    setMal(null);
    const { error } = await supabase.from("acciones_zonas").insert({
      codigo: z.codigo.trim().toUpperCase(),
      nombre: z.nombre.trim(),
      proceso: z.proceso.trim() || null,
      area: z.area,
    });
    setMandando(false);
    if (error) { setMal(error.message); return }
    setNueva(false);
    setZ({ codigo: "", nombre: "", proceso: "", area: areas[0]?.clave ?? "" });
    router.refresh();
  }

  async function alternar(codigo: string, activo: boolean) {
    const { error } = await supabase.from("acciones_zonas")
      .update({ activo: !activo }).eq("codigo", codigo);
    if (error) { setMal(error.message); return }
    router.refresh();
  }

  const nombreArea = (c: string | null) =>
    areas.find((a) => a.clave === c)?.nombre ?? c ?? "—";

  return (
    <>
      <div className="filtros">
        <button type="button" className={"btn" + (hoja === "zonas" ? " si" : "")}
                onClick={() => setHoja("zonas")}>
          Zonas ({zonas.length})
        </button>
        <button type="button" className={"btn" + (hoja === "motivos" ? " si" : "")}
                onClick={() => setHoja("motivos")}>
          Motivos ({motivos.length})
        </button>
        {hoja === "zonas" && puedeEditar && (
          <button type="button" className="btn" onClick={() => { setNueva(!nueva); setMal(null); }}>
            {nueva ? "Cancelar" : "Agregar zona"}
          </button>
        )}
      </div>

      {mal && <div className="aviso rojo">{mal}</div>}

      {hoja === "zonas" && (
        <section className="caja">
          <div className="cab">
            <div>
              <h2>Las zonas de la bodega</h2>
              <p>
                El código es el que va pegado en la pared y el que lee la cámara: por eso no se
                puede cambiar. Quitar una zona es desactivarla — borrarla se llevaría por delante
                el histórico con el que se cuenta la reincidencia.
              </p>
            </div>
          </div>

          {nueva && (
            <div className="panel" style={{ margin: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 9 }}>
                <div>
                  <label>CÓDIGO (el del QR)</label>
                  <input value={z.codigo} placeholder="AG01-PAS-05"
                         onChange={(e) => setZ({ ...z, codigo: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <label>NOMBRE</label>
                  <input value={z.nombre} placeholder="Pasillo 5"
                         onChange={(e) => setZ({ ...z, nombre: e.target.value })} />
                </div>
                <div>
                  <label>PROCESO</label>
                  <input value={z.proceso} placeholder="Picking"
                         onChange={(e) => setZ({ ...z, proceso: e.target.value })} />
                </div>
                <div>
                  <label>ÁREA</label>
                  <select value={z.area} onChange={(e) => setZ({ ...z, area: e.target.value })}>
                    {areas.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="aviso">
                El área es la que agrupa el tablero: una acción reportada aquí va a contar para{" "}
                <b>{nombreArea(z.area)}</b>, no para el área del motivo.
              </div>
              <div className="acciones-panel">
                <button type="button" className="btn si"
                        disabled={mandando || z.codigo.trim().length < 4 || z.nombre.trim().length < 2}
                        onClick={guardarZona}>
                  {mandando ? "Guardando…" : "Agregar"}
                </button>
              </div>
            </div>
          )}

          <div className="rueda">
            {zonas.map((x) => (
              <div className="fila" key={x.codigo}>
                <div className="cod">{x.codigo}</div>
                <div>
                  <div className="tit">{x.nombre}{x.proceso ? ` · ${x.proceso}` : ""}</div>
                  <div className="meta">
                    <span>{nombreArea(x.area)}</span>
                    {!x.activo && <><span>·</span><span className="eti anulada">DESACTIVADA</span></>}
                    {x.lat == null && (
                      <>
                        <span>·</span>
                        <span title="Sin coordenadas no aparece en «otras zonas cerca»">sin coordenadas</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="der">
                  {puedeEditar && (
                    <button type="button" className={"btn" + (x.activo ? "" : " si")}
                            onClick={() => alternar(x.codigo, x.activo)}>
                      {x.activo ? "Desactivar" : "Activar"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {hoja === "motivos" && (
        <section className="caja">
          <div className="cab">
            <div>
              <h2>Los motivos</h2>
              <p>
                La lista cerrada de lo que se puede reportar. Es lista y no texto libre porque la
                reincidencia se cuenta por motivo y zona: “estibas mal apiladas” escrito de
                catorce maneras no se cuenta nunca como tres veces lo mismo. El detalle de cada
                caso sigue siendo libre.
              </p>
            </div>
          </div>
          <div className="rueda">
            {motivos.map((m) => (
              <div className="fila" key={m.clave}>
                <div className="cod">{m.clave}</div>
                <div>
                  <div className="tit">{m.nombre}</div>
                  <div className="meta">
                    <span>{nombreArea(m.area)}</span>
                    {m.critico && (
                      <>
                        <span>·</span>
                        <span className="eti alta">CRÍTICO</span>
                        <span>propone prioridad alta al reportarlo</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="der" />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
