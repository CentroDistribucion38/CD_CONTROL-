import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { MODULOS, entradaDeRama } from "@/modulos/registro";
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
  const [permisos, conteo, aver, casco, balance] = await Promise.all([
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

    /* EL ÚLTIMO DÍA DE CASCO REGISTRADO: se pide el día más reciente y
       luego sus renglones (como mucho unas decenas). Si la migración
       aún no se corrió, esto devuelve null y la tarjeta sale sin cifra. */
    (async () => {
      const supabase = await createClient();
      const { data: ult, error } = await supabase
        .from("casco_registros").select("fecha").order("fecha", { ascending: false }).limit(1);
      if (error || !ult?.length) return null;
      const fecha = ult[0].fecha as string;
      const { data } = await supabase.from("casco_registros").select("hl, ubicacion").eq("fecha", fecha);
      return {
        fecha,
        hl: (data ?? []).reduce((t, r) => t + Number(r.hl || 0), 0),
        sitios: new Set((data ?? []).map((r) => r.ubicacion as string)).size,
      };
    })(),

    /* EL BALANCE: materiales con diferencia en el último conteo.
       Si la vista no existe (no se ha corrido el SQL), devuelve null. */
    (async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("v_balance_bloques")
        .select("fecha, renglones, con_alerta, dif_cajas")
        .order("fecha", { ascending: false })
        .limit(10);
      if (error) return null;
      if (!data?.length) return null;
      /* Solo la fecha más reciente. */
      const fecha = (data[0] as { fecha: string }).fecha;
      const del_dia = data.filter((b: { fecha: string }) => b.fecha === fecha);
      const materiales = del_dia.reduce((t, b: { renglones: number }) => t + b.renglones, 0);
      const alertas = del_dia.reduce((t, b: { con_alerta: number }) => t + b.con_alerta, 0);
      const dif = del_dia.reduce((t, b: { dif_cajas: number }) => t + Math.abs(b.dif_cajas), 0);
      return { fecha, materiales, alertas, dif };
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

  /* ---------- LA CIFRA DE CASCO ---------- */
  const diasCasco = casco ? diasDesde(casco.fecha) : null;

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

  CIFRA.casco = casco == null ? null : {
    n: nf.format(Math.round(casco.hl)),
    u: "HL",
    pie: (diasCasco == null || diasCasco <= 0 ? "de casco registrado hoy" : `de casco · último registro hace ${diasCasco} día${diasCasco === 1 ? "" : "s"}`) +
      ` · ${casco.sitios} sitio${casco.sitios === 1 ? "" : "s"}`,
    /* LO MISMO QUE EL CONTEO: una foto de hace más de dos semanas ya no
       dice lo que hay. */
    mal: diasCasco != null && diasCasco > 14,
  };

  /* ---------- LA CIFRA DE BALANCE ---------- */
  CIFRA.balance = balance == null ? null : {
    n: nf.format(balance.materiales),
    u: balance.materiales === 1 ? "material" : "materiales",
    pie: balance.alertas > 0
      ? `${balance.alertas} alerta${balance.alertas === 1 ? "" : "s"} · dif absoluta ${nf.format(balance.dif)} cajas · conteo ${balance.fecha}`
      : `sin alertas · conteo ${balance.fecha}`,
    /* SI HAY ALERTAS, la tarjeta se pinta de rojo: algo no cuadra. */
    mal: balance.alertas > 0,
  };

  return (
    <div className="fe inv-p">
      <section className="inv-cabeza">
        <p className="ojo">INVENTARIO · LO QUE HAY EN LA BODEGA · CD38 AG01</p>
        <h1>¿Qué vas a mirar?</h1>
        <p className="sub">
          Tres cosas que se miden aparte: el <b>casco de vidrio</b> se cuenta en estibas y en HL; los <b>conteos</b> dicen
          qué hay y qué sale primero; las <b>averías</b>, qué ya no se puede vender. No se
          restan — una avería sigue en su posición y <b>ya está contada</b> hasta que llegue
          el documento de baja de SAP.
        </p>
      </section>

      <div className="inv-ramas">
        {ramas.map((r) => {
          const c = CIFRA[r.id];
          return (
            <Link key={r.id} href={entradaDeRama(modulo, r, permisos.puedeVer)} className="inv-rama">
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
