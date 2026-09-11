"use client";

import { useState } from "react";
import type { Causa, Material, Proceso, Rotura } from "@/modulos/roturas/datos";
import { Fila } from "./comunes";
import { Evidencia } from "./Evidencia";
import { Reportar } from "./Reportar";

/**
 * EN SITIO — lo que se rompió, contado en UNIDADES.
 *
 * Esta pantalla no habla de kilos ni una sola vez, a propósito. En sitio
 * se cuentan unidades por causa y por proceso: contesta de quién fue y
 * de dónde salió. La salida pesa kilos de vidrio: contesta cuánto salió
 * por la puerta. Una botella de 330 y una de 750 pesan distinto, el
 * vidrio se acumula días antes de salir, y parte de lo que se pesa nunca
 * se contó aquí. Cuadrar las dos cifras sería inventar un factor de
 * conversión que no existe.
 */
export function EnSitio({ roturas, nombres, materiales, procesos, causas, puedeEditar }: {
  roturas: Rotura[];
  nombres: Record<string, string>;
  materiales: Material[];
  procesos: Proceso[];
  causas: Causa[];
  puedeEditar: boolean;
}) {
  const [reportando, setReportando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [f, setF] = useState({ estado: "", grupo: "", proceso: "", texto: "" });

  const lista = roturas.filter((r) => {
    if (f.estado && r.estado !== f.estado) return false;
    if (!f.estado && r.estado === "anulada") return false;
    if (f.grupo && r.grupo !== f.grupo) return false;
    if (f.proceso && r.proceso !== f.proceso) return false;
    const q = f.texto.trim().toLowerCase();
    if (q && !(r.codigo + " " + r.material_nombre + " " + r.causa_nombre + " " + r.proceso_nombre)
      .toLowerCase().includes(q)) return false;
    return true;
  });

  const vivas = roturas.filter((r) => r.estado !== "anulada");
  const esperando = vivas.filter((r) => r.esperando).length;
  const sinFoto = vivas.filter((r) => r.le_falta_foto).length;
  const noAsumidas = vivas.filter((r) => r.grupo === "no_asumida").length;
  const vidrio = vivas.filter((r) => r.cuenta)
    .reduce((s, r) => s + r.unidades_vidrio, 0);

  return (
    <>
      {reportando && (
        <Reportar materiales={materiales} procesos={procesos} causas={causas}
                  cerrar={() => setReportando(false)} />
      )}

      <section className="cifras">
        <div className={"cifra" + (esperando ? " ojo" : "")}>
          <div className="rot">ESPERAN VISTO BUENO</div>
          <div className="n">{esperando}</div>
          <div className="u">ABI todavía no ha dicho si cuentan</div>
        </div>
        <div className={"cifra" + (sinFoto ? " mal" : "")}>
          <div className="rot">SIN LA FOTO QUE EXIGEN</div>
          <div className="n">{sinFoto}</div>
          <div className="u">ABI las va a devolver así</div>
        </div>
        <div className={"cifra" + (noAsumidas ? " mal" : "")}>
          <div className="rot">NO ASUMIDAS</div>
          <div className="n">{noAsumidas}</div>
          <div className="u">se está diciendo que no fueron del OL</div>
        </div>
        <div className="cifra bien">
          <div className="rot">UNIDADES DE VIDRIO</div>
          <div className="n">{vidrio}</div>
          <div className="u">de lo que ya cuenta. No son kilos: esto no se cuadra con la salida</div>
        </div>
      </section>

      <div className="filtros">
        <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
          <option value="">Todas menos las anuladas</option>
          <option value="esperando">Esperando visto bueno</option>
          <option value="cuenta">Cuentan</option>
          <option value="no_cuenta">No cuentan</option>
          <option value="anulada">Anuladas</option>
        </select>
        <select value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })}>
          <option value="">Asumidas y no asumidas</option>
          <option value="asumida">Solo asumidas</option>
          <option value="no_asumida">Solo no asumidas</option>
        </select>
        <select value={f.proceso} onChange={(e) => setF({ ...f, proceso: e.target.value })}>
          <option value="">Todos los procesos</option>
          {procesos.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
        </select>
        <input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })}
               placeholder="Buscar código, material o causa" />
        {(f.estado || f.grupo || f.proceso || f.texto) && (
          <button type="button" className="btn plano"
                  onClick={() => setF({ estado: "", grupo: "", proceso: "", texto: "" })}>
            Quitar filtros
          </button>
        )}
      </div>

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{lista.length} rotura{lista.length === 1 ? "" : "s"}</h2>
            <p>
              Lo más reciente primero. El filo rojo marca las no asumidas: las que dicen que la
              rotura no fue del OL, y que por eso hay que probar con foto.
            </p>
          </div>
        </div>

        <div className="rueda">
          {lista.length === 0 && (
            <div className="vacio">
              <b>Nada por aquí</b>
              {roturas.length
                ? "Con estos filtros no queda ninguna."
                : "Todavía no se ha registrado nada. El botón + abre el registro."}
            </div>
          )}

          {lista.map((r) => (
            <Fila key={r.id} r={r} nombres={nombres}
                  derecha={
                    <button type="button" className="btn"
                            onClick={() => setAbierta(abierta === r.id ? null : r.id)}>
                      {abierta === r.id ? "Cerrar" : `Ver${r.fotos ? ` · ${r.fotos} foto${r.fotos === 1 ? "" : "s"}` : ""}`}
                    </button>
                  }>
              {r.nota_decision && (
                <div className="meta" style={{ marginTop: 4 }}>
                  <span>ABI dijo: {r.nota_decision}</span>
                </div>
              )}
              {abierta === r.id && <Evidencia id={r.id} />}
            </Fila>
          ))}
        </div>
      </section>

      {puedeEditar && (
        <button type="button" className="mas" onClick={() => setReportando(true)}
                aria-label="Registrar una rotura">+</button>
      )}
    </>
  );
}
