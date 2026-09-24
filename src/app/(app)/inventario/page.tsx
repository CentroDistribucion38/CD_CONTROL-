import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { MODULOS } from "@/modulos/registro";
import "./fefo.css";
import "./portada.css";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/**
 * LA PORTADA DE INVENTARIO — dos ramas, y hay que escoger una.
 *
 * ESTA PANTALLA FALTABA Y SE NOTABA: «le doy a Conteos y no me sale
 * nada». El menú no tenía dónde escoger porque /inventario ERA el
 * tablero de FEFO. `ramaDeRuta` lo dice con todas las letras: la ruta
 * del módulo nunca puede caer dentro de una rama, porque estando parado
 * ahí el riel tiene que mostrar las ramas y no las pantallas de una de
 * ellas. Con el tablero ocupando /inventario, entrar al módulo era
 * entrar YA a Conteos, y la bifurcación no existía. El tablero se mudó
 * a /inventario/tablero y aquí quedó la bifurcación.
 *
 * LAS DOS RAMAS COMPARTEN TEMA Y NO COMPARTEN CIFRAS:
 *
 *   CONTEOS   CAJAS QUE HAY. Lo que se caminó y se firmó; de ahí sale
 *             qué se despacha primero.
 *   AVERÍAS   CAJAS QUE YA NO SE VENDEN pero siguen en la estiba.
 *
 * Y NO SE RESTAN. La tentación es leer «12.400 contadas − 180
 * averiadas = 12.220 buenas», y está mal por dos lados: una avería
 * sigue física en su posición y YA ESTÁ DENTRO de las cajas contadas
 * —mientras no llegue el documento de baja de SAP, cuenta en el
 * inventario—, y las dos cifras ni siquiera son del mismo momento: el
 * conteo es la foto del último recorrido y las averías son todo lo que
 * está pendiente, de cualquier fecha. Restarlas descuenta dos veces lo
 * mismo y encima mezcla dos relojes.
 *
 * CADA TARJETA TRAE SU CIFRA VIVA. Una portada que solo repite dos
 * nombres es un clic de peaje: quien entra ya sabía adónde iba.
 */
export default async function InventarioPortada() {
  const [permisos, conteo, aver] = await Promise.all([
    misPermisos(),

    /* SOLO EL ÚLTIMO RECORRIDO ENVIADO, una fila. El tablero trae los
       200 conteos y sus cinco mil renglones porque calcula el FEFO
       entero; esta pantalla necesita UN número, y cobrarle a cada
       entrada el precio del informe es cómo una portada se vuelve la
       pantalla lenta del módulo. */
    (async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("v_conteos_fefo")
        .select("codigo, fecha_analisis, enviado_en, total_cajas, ubicaciones")
        .eq("estado", "cerrado")
        .order("enviado_en", { ascending: false })
        .limit(1);
      if (error) return null;
      return (data?.[0] ?? null) as {
        codigo: string; fecha_analisis: string; enviado_en: string | null;
        total_cajas: number; ubicaciones: number;
      } | null;
    })(),

    /* LAS AVERÍAS PENDIENTES DE BAJA. Se piden tres columnas y no `*`:
       la vista trae treinta y siete, y traer el ancho entero para
       sumar una columna es pagar el informe otra vez. */
    (async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("v_averias")
        .select("cajas, dias_baja")
        .eq("pendiente_baja", true)
        .is("anulada_en", null)
        .limit(2000);
      if (error) return null;
      return (data ?? []) as { cajas: number; dias_baja: number | null }[];
    })(),
  ]);

  const modulo = MODULOS.find((m) => m.id === "inventario")!;
  /* SOLO LAS RAMAS QUE EL ROL TIENE ABIERTAS. Pintar una tarjeta que
     lleva a un «no tienes permiso» es peor que no pintarla: manda a
     alguien a estrellarse contra una puerta. */
  const ramas = (modulo.ramas ?? []).filter((r) =>
    modulo.secciones.some((s) => s.rama === r.id && permisos.puedeVer(s.ruta)));

  /* ---------- LA CIFRA DE CONTEOS ---------- */
  const diasDesde = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return Math.floor((Date.now() - d.getTime()) / 86_400_000);
  };
  const diasConteo = diasDesde(conteo?.enviado_en ?? conteo?.fecha_analisis ?? null);

  /* ---------- LA CIFRA DE AVERÍAS ---------- */
  const cajasAv = (aver ?? []).reduce((t, a) => t + Number(a.cajas || 0), 0);
  const masVieja = (aver ?? []).reduce<number | null>(
    (m, a) => (a.dias_baja == null ? m : m == null || a.dias_baja > m ? a.dias_baja : m), null);

  const CIFRA: Record<string, { n: string; u: string; pie: string; mal: boolean } | null> = {
    conteos: conteo == null ? null : {
      n: nf.format(Number(conteo.total_cajas)),
      u: Number(conteo.total_cajas) === 1 ? "caja" : "cajas",
      /* LA FECHA VA EN EL PIE Y NO ES ADORNO: una foto de hace tres
         semanas se lee igual de firme que la de ayer, y sobre ella
         alguien despacha. */
      pie: diasConteo == null
        ? `contadas en ${conteo.codigo}`
        : diasConteo <= 0
          ? `contadas hoy en ${conteo.codigo} · ${conteo.ubicaciones} módulos`
          : `contadas hace ${diasConteo} día${diasConteo === 1 ? "" : "s"} en ${conteo.codigo}` +
            ` · ${conteo.ubicaciones} módulos`,
      /* DOS SEMANAS ES EL CORTE, el mismo que usa el tablero para decir
         que un módulo lleva sin mirarse más de un ciclo de conteo. Si
         el ciclo cambia, los dos cambian. */
      mal: diasConteo != null && diasConteo > 14,
    },
    averias: aver == null ? null : {
      n: nf.format(cajasAv),
      u: cajasAv === 1 ? "caja" : "cajas",
      pie: cajasAv === 0
        ? "nada apartado esperando documento de baja"
        : masVieja == null
          ? "apartadas esperando el documento de baja de SAP"
          : `apartadas esperando baja · la más vieja hace ${masVieja} día${masVieja === 1 ? "" : "s"}`,
      /* UN MES ESPERANDO LA BAJA ES EL PROBLEMA QUE ESTA RAMA EXISTE
         PARA DESTAPAR: la caja sigue sumando en el inventario y el
         conteo sigue cuadrando contra algo que ya no se vende. */
      mal: masVieja != null && masVieja > 30,
    },
  };

  return (
    <div className="fe inv-p">
      <section className="inv-cabeza">
        <p className="ojo">INVENTARIO · LO QUE HAY EN LA BODEGA · CD38 AG01</p>
        <h1>¿Qué vas a mirar?</h1>
        <p className="sub">
          Dos cosas que viven en la misma estiba y se miden aparte: los <b>conteos</b> dicen
          qué hay y qué sale primero; las <b>averías</b>, qué ya no se puede vender. No se
          restan — una avería sigue en su posición y <b>ya está contada</b> hasta que llegue
          el documento de baja de SAP.
        </p>
      </section>

      <div className="inv-ramas">
        {ramas.map((r) => {
          const c = CIFRA[r.id];
          return (
            <Link key={r.id} href={r.ruta} className="inv-rama">
              <span className="inv-corte" aria-hidden />
              <span className="inv-rot">{r.eyebrow}</span>
              <span className="inv-nom">{r.nombre}</span>
              <span className="inv-des">{r.descripcion}</span>
              {c && (
                <span className={"inv-cifra" + (c.mal ? " mal" : "")}>
                  <b>{c.n}</b><i>{c.u}</i>
                  <em>{c.pie}</em>
                </span>
              )}
              <span className="inv-entrar">Entrar <svg viewBox="0 0 24 24" fill="none"
                strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 7l5 5-5 5" /></svg></span>
            </Link>
          );
        })}
      </div>

      {ramas.length === 0 && (
        <div className="inv-aviso">
          Tu rol no tiene abierta ninguna de las dos ramas de Inventario. Pídele al
          administrador que te dé permiso en <b>Administración → Roles</b>.
        </div>
      )}
    </div>
  );
}
