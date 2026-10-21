import { misPermisos } from "@/lib/permisos";
import "../fefo.css";
import "../corte/corte.css";
import "./fiscal.css";
import "./torre.css";
import { Fiscal } from "./Fiscal";
import { cargarFiscales } from "./datos";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · PLAN FISCAL.
 *
 * Un inventario fiscal se cuenta por parejas: una persona del operador
 * logístico y una de Bavaria cuentan LA MISMA hoja, cada una por su lado, y
 * después se comparan. Aquí se arma: cuántas hojas (las que hagan falta,
 * numeradas) y quién cuenta cada una. Verlo en vivo y revisar las diferencias
 * es del CONTROL FISCAL (/inventario/control-fiscal).
 *
 * Esta pantalla es de quien organiza el inventario; quien cuenta entra por
 * «Contar». Se arma con calma en el escritorio, así que no tiene cola para
 * cuando se va la señal como sí la tienen Contar y el corte.
 */
export default async function FiscalPage() {
  const [permisos, r] = await Promise.all([misPermisos(), cargarFiscales()]);
  if ("fallo" in r) return r.fallo;
  const { bodegaId, personas, roles, fiscales, conPublicar, conCruce, conCalle } = r.datos;
  const puedeEditar = permisos.puedeEditar("/inventario/fiscal");

  return (
    <div className="fe">
      {!puedeEditar && (
        <section className="fe-faltan">
          <p><b>Solo de lectura.</b> Para armar un inventario fiscal hace falta permiso de edición en esta
          pantalla — pídelo en Admin → Roles.</p>
        </section>
      )}
      <Fiscal
        bodegaId={bodegaId}
        personas={personas}
        roles={roles}
        fiscales={fiscales}
        puedeEditar={puedeEditar}
        puedePublicar={conPublicar}
        conCruce={conCruce}
        conCalle={conCalle}
        manda={permisos.manda}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
