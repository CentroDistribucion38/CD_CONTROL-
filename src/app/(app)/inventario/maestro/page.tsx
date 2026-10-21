import { misPermisos } from "@/lib/permisos";
import { maestroInventario } from "@/modulos/inventario/fefo";
import "../fefo.css";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · MAESTRO.
 *
 * Los materiales y las ubicaciones con las que se cuenta. El SQL los
 * siembra una vez desde «FEFO 002.xlsx» y de ahí en adelante manda esta
 * pantalla: se agrega, se corrige y se apaga.
 *
 * SIN MAESTRO NO HAY CONTEO, y por eso va primero en el menú aunque sea
 * lo que menos se abre: el código que se teclea en el muelle no trae
 * descripción si no está aquí, y sin factor estibado no hay forma de
 * convertir una estiba en cajas.
 */
export default async function InventarioMaestroPage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestroInventario({ caja: true })]);
  const esEditor = permisos.puedeEditar("/inventario/maestro");

  if (m.falta) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>Falta preparar el maestro en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta{" "}
            <code>supabase/migraciones/2026-09-inventario-fefo.sql</code> y después{" "}
            <code>supabase/datos/inventario-maestro-cd38.sql</code>, en ese orden — el
            segundo escribe en las columnas que crea el primero. Los dos se pueden correr
            varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  /* LOS MATERIALES SIN FACTOR ESTIBADO SE CUENTAN AQUÍ Y SE DICEN.
     Es el único dato del maestro del que dependen las cuentas: sin él,
     una estiba no se puede convertir a cajas y el conteo de ese material
     sale en CERO sin avisar. Está en null a propósito —poner un 1 sería
     inventárselo— así que lo que corresponde es decir cuáles son. */
  const sinFactor = m.materiales.filter((x) => x.activo && x.cajas_por_estiba == null);
  const envases = m.materiales.filter((x) => x.tipo_material === "ENVASE").length;

  return (
    <div className="fe">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · MAESTRO</p>
          <h1>Las bases del conteo</h1>
          <p className="sub">
            Con lo que se cuenta: los materiales, los módulos por los que se camina y las
            bodegas de las que cuelgan. El código trae la descripción y el factor estibado que
            hacen las cuentas.{" "}
            {esEditor
              ? "Se agrega, se corrige y se apaga desde aquí."
              : "Corregir el maestro requiere rol de supervisor."}
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">EN EL MAESTRO</div>
          <div className="num">{m.materiales.length}</div>
          <div className="pie">
            materiales ({envases} envases) · {m.ubicaciones.length} ubicaciones ·{" "}
            {m.bodegas.length} bodega{m.bodegas.length === 1 ? "" : "s"}
          </div>
        </div>
      </section>

      {/* EL CRUCE SIN CORRER SE DICE AQUÍ Y NO SE DISIMULA.
          Sin él, categoría, tipo de envase, HL y referencia salen todas
          en raya, y desde la pantalla eso se ve exactamente igual que
          «el maestro no tiene ese dato». Son dos cosas distintas: una se
          arregla con un SQL y la otra yendo a pedirle el dato a la
          cervecería. */}
      {!m.cruce && (
        <section className="fe-faltan">
          <p>
            <b>Falta correr el cruce del maestro.</b> Categoría, tipo de envase, HL y
            referencia todavía no existen como columnas, así que salen vacías en los{" "}
            {m.materiales.length} materiales — no es que falte el dato, es que falta el SQL.
          </p>
          <p className="cuales">
            Abre el SQL Editor de Supabase y corre{" "}
            <code>supabase/migraciones/2026-09-maestro-cruce-2026-09-26.sql</code>. Se puede
            correr varias veces sin romper nada.
          </p>
        </section>
      )}

      {sinFactor.length > 0 && (
        <section className="fe-faltan">
          <p>
            <b>{sinFactor.length} material{sinFactor.length > 1 ? "es" : ""} sin factor
            estibado</b> — de esa cifra sale el total de cajas de cada estiba contada. Sin
            ella, lo que se cuente de esos materiales sale en cero.
          </p>
          <p className="cuales">
            {sinFactor.slice(0, 12).map((x) => x.nombre).join(" · ")}
            {sinFactor.length > 12 && ` … y ${sinFactor.length - 12} más`}
          </p>
        </section>
      )}

      {/* LA CAJA PLÁSTICA DE CADA PRODUCTO TERMINADO, validada. «Producto terminado» = material PRODUCTO activo que viene en
          botella; cada uno debe estar amarrado a su caja (Maestro Sku vs Caja de la cervecería), y la caja tiene que existir en
          este maestro y ser de las mismas unidades por caja. Lo que no cumpla se dice aquí, no se calla. */}
      {!m.cajaOk ? (
        <section className="fe-faltan">
          <p><b>Falta correr el SQL de la caja plástica.</b> Sin él no se puede amarrar cada producto a su caja.</p>
          <p className="cuales">Corre <code>supabase/migraciones/2026-10-maestro-caja-plastica.sql</code> en el SQL Editor de Supabase. Se puede correr varias veces.</p>
        </section>
      ) : (() => {
        const porSku = new Map(m.materiales.map((x) => [x.sku, x]));
        const prods = m.materiales.filter((x) => x.activo && x.tipo_material === "PRODUCTO");
        const botella = prods.filter((x) => /^botella/i.test(x.tipo_envase ?? ""));
        const sinCaja = botella.filter((x) => !x.caja_sku);
        const cajaFantasma = prods.filter((x) => x.caja_sku && !porSku.has(x.caja_sku));
        const noCuadra = prods.filter((x) => {
          if (!x.caja_sku) return false;
          const c = porSku.get(x.caja_sku); const f = Number(c?.nombre.match(/\bx\s*(\d+)\s*$/i)?.[1]);
          return c && Number.isFinite(f) && x.unidades_por_caja != null && x.unidades_por_caja !== f;
        });
        const sinTipo = prods.filter((x) => !x.tipo_envase && !x.caja_sku).length;
        const conCaja = prods.filter((x) => x.caja_sku).length;
        const lista = (xs: typeof prods) => xs.slice(0, 15).map((x) => `${x.sku} ${x.nombre}`).join(" · ") + (xs.length > 15 ? ` … y ${xs.length - 15} más` : "");
        return (
          <>
            <section className="fe-faltan" style={{ borderLeftColor: sinCaja.length || cajaFantasma.length || noCuadra.length ? undefined : "#1F7A3D" }}>
              <p><b>Caja plástica de los productos:</b> {conCaja} amarrados · {sinCaja.length} productos en botella sin caja · {cajaFantasma.length} con una caja que no está en el maestro · {noCuadra.length} cuya caja no coincide en unidades por caja.</p>
              {sinTipo > 0 && <p className="cuales">{sinTipo} productos activos no tienen tipo de envase ni caja: no se pueden evaluar hasta completar el tipo de envase.</p>}
            </section>
            {sinCaja.length > 0 && <section className="fe-faltan"><p><b>Producto en botella sin caja plástica ({sinCaja.length})</b> — no aportan caja al análisis. Asígnala en Editar, o si va en cartón déjala así.</p><p className="cuales">{lista(sinCaja)}</p></section>}
            {cajaFantasma.length > 0 && <section className="fe-faltan"><p><b>Caja que no existe en el maestro ({cajaFantasma.length})</b> — el código de la caja no es un material de este maestro.</p><p className="cuales">{lista(cajaFantasma)}</p></section>}
            {noCuadra.length > 0 && <section className="fe-faltan"><p><b>Caja que no cuadra con el producto ({noCuadra.length})</b> — las unidades por caja del producto no son las de la caja (ej. producto ×30 en caja ×16).</p><p className="cuales">{lista(noCuadra)}</p></section>}
          </>
        );
      })()}

      <Maestro materiales={m.materiales} ubicaciones={m.ubicaciones}
               bodegas={m.bodegas} esEditor={esEditor} cajaOk={m.cajaOk} />
    </div>
  );
}
