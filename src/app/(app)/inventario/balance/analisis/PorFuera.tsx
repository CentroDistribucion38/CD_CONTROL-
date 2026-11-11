import type { PorFuera as Fuera } from "@/modulos/inventario/analisis-dif";

/**
 * LA ALERTA DE LOS SKU QUE QUEDARON POR FUERA DE LA TABLA.
 * La tabla solo muestra lo que tiene SAP o conteo en Bodega 38; esto nombra lo que se vio y no llegó
 * (contado en Fábrica / AG17 / AG16, contado como algo que no es envase, barril o cilindro sin nada ese día)
 * y lo que SÍ está pero el filtro «solo con diferencia» esconde porque cuadró. Visible pero compacta: se abre al tocarla.
 */
export type Oculto = { codigo: string; descripcion: string; sap: number; conteo: number };

const n = (v: number) => v.toLocaleString("es-CO");

export function PorFuera({ fuera, ocultos }: { fuera: Fuera[]; ocultos: Oculto[] }) {
  const total = fuera.length + ocultos.length;
  if (!total) return null;
  return (
    <details className="ad-fuera">
      <summary>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.2v.1" /></svg>
        <b>{total} SKU {total === 1 ? "no sale" : "no salen"} en la tabla</b>
        <span>tocar para ver cuáles y por qué</span>
      </summary>
      {fuera.length > 0 && (
        <div className="ad-fuera-bloque">
          <h3>Por fuera del análisis</h3>
          <table>
            <thead><tr><th>Código</th><th>Descripción</th><th className="n">Cantidad</th><th>Por qué</th></tr></thead>
            <tbody>
              {fuera.map((x) => (
                <tr key={x.codigo}>
                  <td><b>{x.codigo}</b></td><td>{x.nombre}</td>
                  <td className="n">{x.cantidad ? n(x.cantidad) : "—"}</td>
                  <td>{x.motivos.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ocultos.length > 0 && (
        <div className="ad-fuera-bloque">
          <h3>Están, pero cuadran (el filtro «solo con diferencia» los esconde)</h3>
          <table>
            <thead><tr><th>Código</th><th>Descripción</th><th className="n">SAP</th><th className="n">Conteo</th></tr></thead>
            <tbody>
              {ocultos.map((x) => (
                <tr key={x.codigo}><td><b>{x.codigo}</b></td><td>{x.descripcion}</td><td className="n">{n(x.sap)}</td><td className="n">{n(x.conteo)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
