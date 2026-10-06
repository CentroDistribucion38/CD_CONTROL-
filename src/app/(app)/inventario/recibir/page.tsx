import { misPermisos } from "@/lib/permisos";
import { usuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { maestroInventario } from "@/modulos/inventario/fefo";
import "../fefo.css";
import "./recibir.css";
import "./plan-envase.css";
import Link from "next/link";
import { Recibir } from "./Recibir";
import { PlanEnvase, type SemanaGuardada } from "./PlanEnvase";
import { RotulosPlan } from "./RotulosPlan";
import type { Bloque, Pendiente } from "@/modulos/inventario/plan-envase";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · RECIBIR Y ROTULAR.
 *
 * Lo que entra al CD y el papel que se le pega a cada estiba.
 *
 * VA PRIMERO EN EL MENÚ DE INVENTARIO, antes de contar y antes del
 * FEFO, porque es el primer paso del proceso de verdad: el material
 * entra, se rotula, se ubica, y solo después se cuenta y se ordena por
 * vencimiento. El menú sigue el orden del proceso, no el orden en que
 * se construyeron las pantallas.
 *
 * EL MAESTRO ENTERO BAJA CON LA PÁGINA, igual que en el conteo: se abre
 * en el celular en el muelle, y reconocer el código MIENTRAS SE TECLEA
 * sin ir al servidor es lo que hace que no se sienta lento con señal de
 * bodega.
 */
export default async function RecibirPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const q = await searchParams;
  const rotulos = q.vista === "rotulos";
  const plan = q.vista === "plan" || rotulos;
  const supabase = await createClient();
  const user = await usuarioActual();
  const [permisos, m, { data: perfil }] = await Promise.all([
    misPermisos(),
    maestroInventario(),
    supabase.from("perfiles").select("nombre").eq("id", user!.id).maybeSingle(),
  ]);
  const puedeRecibir = permisos.puedeEditar("/inventario/recibir");

  if (m.falta) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>Falta preparar el inventario en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta{" "}
            <code>supabase/migraciones/2026-09-inventario-fefo.sql</code> y después{" "}
            <code>supabase/datos/inventario-maestro-cd38.sql</code>, en ese orden. Sin el
            maestro no hay material que rotular ni ubicación donde ponerlo.
          </p>
        </section>
      </div>
    );
  }

  /* LA BODEGA DEL CD. Con una sola no se pregunta: preguntar algo que
     tiene una sola respuesta posible es un paso de más frente a un
     camión descargando. */
  const conUbicaciones = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => conUbicaciones.has(b.id)) ?? m.bodegas[0] ?? null;
  const ubis = bodega
    ? m.ubicaciones.filter((u) => u.bodega_id === bodega.id && u.activa)
    : [];

  /* EL PLAN DE ENVASE: las semanas guardadas, con su pendiente y su grilla. Si la tabla todavía no existe
     (falta correr el SQL) se dice, en vez de dejar la pestaña en blanco. */
  let guardadas: SemanaGuardada[] = [];
  let faltaPlan = false;
  if (plan) {
    const { data: sems, error } = await supabase
      .from("plan_envase_semanas")
      .select("id,anio,semana,fecha_ini,fecha_fin,escenario,generado,archivo,cargado_en")
      .order("anio", { ascending: false }).order("semana", { ascending: false }).limit(60);
    if (error) faltaPlan = true;
    else if (sems && sems.length) {
      const ids = sems.map((x) => x.id);
      const [{ data: pend }, { data: bloq }] = await Promise.all([
        supabase.from("plan_envase_pendiente").select("semana_id,tren,sap,sku,eficiencia,formato,referencia,hl,unidades").in("semana_id", ids).limit(5000),
        supabase.from("plan_envase_bloques").select("semana_id,tren,sap,fecha,turno,hora_ini,horas,hl,unidades").in("semana_id", ids).order("fecha").limit(20000),
      ]);
      guardadas = sems.map((x) => ({
        ...x,
        pendientes: (pend ?? []).filter((p) => p.semana_id === x.id).map((p) => ({ tren: p.tren, sap: p.sap, sku: p.sku ?? "", eficiencia: p.eficiencia == null ? null : Number(p.eficiencia), formato: p.formato, referencia: p.referencia, hl: Number(p.hl), unidades: Number(p.unidades) })) as Pendiente[],
        bloques: (bloq ?? []).filter((b) => b.semana_id === x.id).map((b) => ({ tren: b.tren, sap: b.sap, fecha: b.fecha, turno: b.turno, hora_ini: b.hora_ini, horas: b.horas, hl: Number(b.hl), unidades: Number(b.unidades) })) as Bloque[],
      }));
    }
  }

  return (
    <div className="fe">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · RECEPCIÓN · CD38 AG01</p>
          <h1>{rotulos ? "Rótulos del plan" : plan ? "Plan de envase" : "Recepción y rotulado"}</h1>
          <p className="sub">
            {rotulos
              ? "Los rótulos de cada turno salen del plan, sin llenar nada: se escoge el día, el turno y la línea, se imprime y queda anotado cuántos van, cuántos faltan y cuáles se reimprimieron."
              : plan
              ? "Lo que se va a envasar en la semana convertido en estibas: cuántas llegan, qué día, en qué turno y de qué línea."
              : "Lo que entra al CD. Cada estiba sale con su rótulo: código y cantidad en letra grande para leerlos desde el pasillo, dónde queda, y un QR que la abre en el celular."}
          </p>
        </div>
      </section>

      <nav className="pe-pestanas" aria-label="Recepción">
        <Link href="/inventario/recibir" aria-current={plan ? undefined : "page"}>Recibir y rotular</Link>
        <Link href="/inventario/recibir?vista=plan" aria-current={plan && !rotulos ? "page" : undefined}>Plan de envase</Link>
        <Link href="/inventario/recibir?vista=rotulos" aria-current={rotulos ? "page" : undefined}>Rótulos del plan</Link>
      </nav>

      {plan ? (
        faltaPlan ? (
          <section className="sin-tablas">
            <h2>Falta preparar el plan de envase en Supabase</h2>
            <p>Abre el SQL Editor y ejecuta <code>supabase/migraciones/2026-10-plan-envase.sql</code>. Después recarga esta pantalla.</p>
          </section>
        ) : rotulos ? (
          <RotulosPlan
            guardadas={guardadas}
            factores={m.materiales.map((x) => [x.sku, { cajas_por_estiba: x.cajas_por_estiba, nombre: x.nombre }] as [string, { cajas_por_estiba: number | null; nombre: string | null }])}
            materiales={m.materiales.filter((x) => x.tipo_material === "PRODUCTO").map((x) => ({
              sku: x.sku, nombre: x.nombre, unidades_por_caja: x.unidades_por_caja, cajas_por_estiba: x.cajas_por_estiba, unidades_por_estiba: x.unidades_por_estiba,
              vida_util: x.vida_util, dias_minimo: x.dias_minimo, pat_largo: x.pat_largo, pat_ancho: x.pat_ancho, pat_nivel: x.pat_nivel,
            }))}
            puedeImprimir={puedeRecibir}
          />
        ) : (
          <PlanEnvase
            guardadas={guardadas}
            factores={m.materiales.map((x) => [x.sku, { cajas_por_estiba: x.cajas_por_estiba, nombre: x.nombre }] as [string, { cajas_por_estiba: number | null; nombre: string | null }])}
            puedeSubir={puedeRecibir}
          />
        )
      ) : (
      <>

      {/* POR AHORA NO SE GUARDA, Y SE DICE. Callarlo dejaría a alguien
          creyendo que el recibo quedó registrado y que el inventario ya
          lo tiene contado, que es exactamente el malentendido que
          descuadra un conteo. */}
      <div className="rc-aviso">
        <b>Por ahora esto solo imprime el rótulo: todavía no se guarda el recibo.</b>{" "}
        El inventario no se entera de lo que entra por aquí. Cuando esté la información de
        verdad se conecta, se guarda y el QR abre la estiba.
      </div>

      <Recibir
        materiales={m.materiales}
        ubicaciones={ubis}
        quien={perfil?.nombre ?? "—"}
        puedeRecibir={puedeRecibir}
      />
      </>
      )}
    </div>
  );
}
