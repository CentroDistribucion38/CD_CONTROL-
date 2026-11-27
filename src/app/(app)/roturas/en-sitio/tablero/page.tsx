import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { roturas as leerRoturas, materialesMaestro, causas as leerCausas, procesos as leerProcesos, areas as leerAreas } from "@/modulos/roturas/datos";
import type { Catalogos } from "./Editar";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { createClient } from "@/lib/supabase/server";
import type { Corr } from "./Caso";
import { Tablero } from "./Tablero";

export const dynamic = "force-dynamic";

/**
 * EN SITIO · TABLERO — todos los registros y su estado.
 *
 * VA APARTE DE LAS BANDEJAS y no como una pestaña suya, por la misma
 * razón que en Averías: en una bandeja cada rotura es UNA DECISIÓN y
 * se lee de una en una; aquí se viene a BUSCAR una entre trescientas,
 * o a ver de un vistazo cuántas quedaron sin origen. Son dos trabajos
 * distintos y necesitan dos formas distintas.
 */
export default async function TableroEnSitioPage() {
  const [permisos, datos, nombres] = await Promise.all([
    misPermisos(), leerRoturas(1000), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  /* LAS CORRECCIONES DE CANTIDADES, por rotura. SOLO PARA EL ADMINISTRADOR: el resto ni recibe estos datos (ni la marca «corregida» ni la de «revisada»).
     Tolerante: si todavía no se corrió
     2026-10-roturas-corregir-cifras.sql la tabla no existe y la pantalla sale sin marcas. */
  const correcciones: Record<string, Corr[]> = {};
  let falta = false;
  let revisadas: string[] = [];
  let catalogos: Catalogos | null = null;
  if (permisos.manda) {
    const supabase = await createClient();
    /* Con las columnas de «editar el caso completo» (2026-11-roturas-editar-caso.sql); si aún no existen, como antes. */
    const base = "rotura_id, antes_rotas, antes_contaminadas, despues_rotas, despues_contaminadas, motivo, corregida_por, corregida_en";
    const conCambios = await supabase.from("roturas_correcciones")
      .select(base + ", antes_material, despues_material, antes_causa, despues_causa, antes_proceso, despues_proceso, antes_area, despues_area")
      .order("corregida_en", { ascending: false }).limit(2000);
    const editarListo = !conCambios.error;
    const { data, error } = editarListo ? conCambios
      : await supabase.from("roturas_correcciones").select(base).order("corregida_en", { ascending: false }).limit(2000);
    if (error) falta = true;
    if (editarListo) {
      const [mm, ca, pr, ar] = await Promise.all([materialesMaestro(), leerCausas(false), leerProcesos(false), leerAreas(false)]);
      catalogos = { materiales: mm.materiales, causas: ca, procesos: pr, areas: ar };
    }
    const nomCausa = new Map((catalogos?.causas ?? []).map((x) => [x.clave, x.nombre]));
    const nomProc = new Map((catalogos?.procesos ?? []).map((x) => [x.clave, x.nombre]));
    const nomArea = new Map((catalogos?.areas ?? []).map((x) => [x.clave, x.nombre]));
    const cambio = (que: string, a: string | null | undefined, d: string | null | undefined, nom?: Map<string, string>) =>
      a !== undefined && d !== undefined && (a ?? null) !== (d ?? null)
        ? `${que}: ${a ? nom?.get(a) ?? a : "—"} → ${d ? nom?.get(d) ?? d : "—"}` : null;
    const rv = await supabase.from("roturas_revision").select("rotura_id").limit(5000);
    revisadas = ((rv.data ?? []) as { rotura_id: string }[]).map((x) => x.rotura_id);
    type Fila = {
      rotura_id: string; antes_rotas: number; antes_contaminadas: number | null; despues_rotas: number;
      despues_contaminadas: number | null; motivo: string; corregida_por: string | null; corregida_en: string;
      antes_material?: string | null; despues_material?: string | null; antes_causa?: string | null; despues_causa?: string | null;
      antes_proceso?: string | null; despues_proceso?: string | null; antes_area?: string | null; despues_area?: string | null;
    };
    for (const c of (data ?? []) as unknown as Fila[]) {
      (correcciones[c.rotura_id] ??= []).push({
        antes_rotas: c.antes_rotas, antes_contaminadas: c.antes_contaminadas,
        despues_rotas: c.despues_rotas, despues_contaminadas: c.despues_contaminadas,
        motivo: c.motivo, por: nombres[c.corregida_por ?? ""] ?? "—", en: c.corregida_en,
        cambios: [
          cambio("SKU", c.antes_material, c.despues_material),
          cambio("Causa", c.antes_causa, c.despues_causa, nomCausa),
          cambio("Proceso", c.antes_proceso, c.despues_proceso, nomProc),
          cambio("Área", c.antes_area, c.despues_area, nomArea),
        ].filter((x): x is string => !!x),
      });
    }
  }

  /* EL BOTÓN DE SEGURIDAD: solo para quien tiene la pantalla. La cifra del botón son las acciones
     del plan que ya pasaron su plazo; si la base todavía no tiene el plan (falta correr el SQL), el
     botón sale sin cifra en vez de inventar un cero. */
  let seguridad: { vencidas: number | null } | null = null;
  if (permisos.manda || permisos.puedeVer("/roturas/en-sitio/plan-reaccion")) {
    const supabase = await createClient();
    const { count, error } = await supabase.from("v_plan_acciones")
      .select("id", { count: "exact", head: true }).eq("estado", "pendiente").eq("vencida", true);
    seguridad = { vencidas: error ? null : (count ?? 0) };
  }

  const vivas = datos.roturas.filter((r) => r.estado !== "anulada");
  /* LAS DOS CIFRAS, NO UNA. El pie decía «341 unidades» contando solo
     las rotas, así que las contaminadas —que están guardadas en el mismo
     renglón— no aparecían por ninguna parte y parecía que no se habían
     registrado. Se dicen separadas porque no cuestan lo mismo: la rota
     se cobra solo el envase y la contaminada, el envase y el producto. */
  const rotas = vivas.reduce((s, r) => s + r.unidades, 0);
  const contam = vivas.reduce((s, r) => s + (r.contaminadas ?? 0), 0);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · TABLERO</p>
          <h1>Todo lo registrado</h1>
          <p className="sub">
            Cada rotura con el estado en que quedó: si espera al operador logístico, si está
            en desacuerdo, si se va a cobrar o si ya se descartó. Aquí se <b>busca</b>; las
            bandejas son para decidir, de una en una.
            {permisos.manda && <> Y aquí el administrador anula, borra —que no son lo mismo— y edita cada caso: SKU, causa, proceso, área y cantidades.</>}
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">REGISTRADAS</div>
          <div className="num">{vivas.length}</div>
          <div className="pie">
            <b>{rotas}</b> rotas
            {contam > 0 && <> · <b>{contam}</b> contaminadas</>}
            {datos.roturas.length !== vivas.length
              && ` · ${datos.roturas.length - vivas.length} anuladas`}
          </div>
        </div>
      </section>

      {falta && permisos.manda && (
        <div className="aviso">
          Para <b>corregir cantidades</b> falta correr <code>2026-10-roturas-corregir-cifras.sql</code> en Supabase.
        </div>
      )}

      <Tablero roturas={datos.roturas} nombres={nombres} manda={permisos.manda} correcciones={correcciones} revisadas={revisadas} seguridad={seguridad} catalogos={catalogos} />

      {!permisos.manda && (
        <div className="aviso">
          Estás viendo el tablero. <b>Anular y borrar</b> son del administrador: una rotura que
          desaparece después de haber entrado en la conciliación de alguien es un mes que
          cambió sin dejar nada que mirar.
        </div>
      )}

      <p className="rq-mas">
        <Link href="/roturas/en-sitio">← Registrar</Link>
        {"  ·  "}
        <Link href="/roturas/en-sitio/visto-bueno">Visto bueno</Link>
        {"  ·  "}
        <Link href="/roturas/en-sitio/analisis">Análisis</Link>
      </p>
    </div>
  );
}
