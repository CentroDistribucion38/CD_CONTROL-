import { misPermisos } from "@/lib/permisos";
import { maestroInventario, baseFefo } from "@/modulos/inventario/fefo";
import { Base } from "./Base";
import "../fefo.css";
import "./base.css";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · LA BASE.
 *
 * TODO LO CONTADO, TAL CUAL SE CONTÓ. El tablero contesta una sola
 * pregunta —qué se despacha primero— y para contestarla recorta: agrupa,
 * se queda con lo que tiene fecha, y tira lo demás. Esta pantalla es lo
 * contrario: el registro entero, renglón por renglón y con todas sus
 * columnas, para cuadrar contra la hoja y para buscar cualquier cosa.
 *
 * SON DOS MONTONES Y NO SE MEZCLAN. La base es lo ENVIADO —firmado con
 * nombre, fecha y hora, y ya sin poderse corregir—; los borradores son
 * lo que alguien tiene abierto ahora mismo, y están aquí SOLO PARA
 * MIRAR: no suman en ningún total y no se tocan desde aquí. Juntarlos
 * sería el error caro —un renglón a medio contar sumando en un total del
 * que alguien despacha— y por eso viven en pestañas separadas y cada una
 * lo dice.
 */
export default async function InventarioBasePage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestroInventario()]);

  if (!permisos.puedeVer("/inventario/base")) {
    return (
      <div className="fe">
        <section className="fe-arranque">
          <h2>Esta pantalla no es para tu rol</h2>
          <p>
            La base del conteo la ve quien la tiene asignada en{" "}
            <b>Administración → Roles</b>. Si la necesitas, pídela ahí.
          </p>
        </section>
      </div>
    );
  }

  if (m.falta) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>Falta preparar el módulo en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta, en orden:{" "}
            <code>supabase/modulos/inventario.sql</code>,{" "}
            <code>supabase/migraciones/2026-09-inventario-fefo.sql</code>,{" "}
            <code>supabase/datos/inventario-maestro-cd38.sql</code> y{" "}
            <code>supabase/migraciones/2026-09-conteo-borrador.sql</code>.
          </p>
        </section>
      </div>
    );
  }

  /* LA MISMA BODEGA QUE ESCOGE EL TABLERO, y con la misma regla: la
     primera activa que TENGA ubicaciones. Escogerla de otra manera aquí
     haría que las dos pantallas hablaran de sitios distintos sin
     decirlo. */
  const conUbi = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => b.activo && conUbi.has(b.id)) ?? m.bodegas[0] ?? null;
  const d = await baseFefo(bodega?.id ?? null);

  return (
    <div className="fe">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · LA BASE</p>
          <h1>La base</h1>
          <p className="sub">
            Todo lo contado, renglón por renglón y con todas sus columnas.
            {bodega && <> Bodega <b>{bodega.codigo}</b>.</>}
          </p>
        </div>
      </section>

      <Base
        enviadas={d.enviadas}
        abiertas={d.abiertas}
        conteos={d.conteos}
        tope={d.tope}
      />
    </div>
  );
}
