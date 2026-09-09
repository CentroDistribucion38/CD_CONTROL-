import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { maestroSider } from "@/modulos/sider/datos";
import type { Maestro } from "@/modulos/sider/deteccion";
import "../sider.css";
import { Importar } from "./Importar";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const supabase = await createClient();
  const maestro = await maestroSider();
  /* El permiso es de ESTA pantalla, no un "es admin o supervisor"
     global: un rol puede certificar y no tocar el maestro. */
  const esEditor = (await misPermisos()).puedeEditar("/sider/importar");

  if (maestro.falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Ejecuta <code>supabase/modulos/sider.sql</code> en el SQL Editor. Se puede
            correr varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  if (!esEditor) {
    return (
      <div className="sd">
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Solo lectura</h2>
              <p>
                Importar requiere rol de supervisor o administrador. El{" "}
                <Link href="/sider/seguimiento">seguimiento</Link> lo puedes ver igual.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* Qué hay cargado. Se agrupa acá y no en la base porque son unas
     docenas de filas y no vale una vista para esto. */
  const [{ data: zlde }, { data: viajes }] = await Promise.all([
    supabase.from("sider_zlde").select("mes, hl").order("mes", { ascending: false }).limit(2000),
    supabase.from("sider_viajes").select("fecha").eq("importado", true).limit(20000),
  ]);

  const porMesZlde = new Map<string, { cd: number; hl: number }>();
  for (const f of (zlde ?? []) as { mes: string; hl: number }[]) {
    const a = porMesZlde.get(f.mes) ?? { cd: 0, hl: 0 };
    porMesZlde.set(f.mes, { cd: a.cd + 1, hl: a.hl + Number(f.hl) });
  }
  const porMesViajes = new Map<string, number>();
  for (const v of (viajes ?? []) as { fecha: string | null }[]) {
    if (!v.fecha) continue;
    const k = `${v.fecha.slice(0, 7)}-01`;
    porMesViajes.set(k, (porMesViajes.get(k) ?? 0) + 1);
  }

  const estibas = maestro.parametros.find((p) => p.clave === "estibas_por_sider")?.valor ?? 36;
  const paraDetectar: Maestro = {
    origenes: maestro.origenes.map((o) => ({ planta: o.planta, cd_origen: o.cd_origen })),
    skus: maestro.skus.map((s) => ({
      sku: s.sku, clase: s.clase,
      cajas_x_estiba: s.cajas_x_estiba,
      unidades_x_caja: s.unidades_x_caja,
      hl_x_unidad: s.hl_x_unidad,
    })),
    estibasPorSider: Number(estibas) || 36,
  };

  return (
    <div className="sd">
      <section className="cabeza">
        <div>
          <h1>Importar</h1>
          <p className="sub">
            Los dos archivos que alimentan el{" "}
            <Link href="/sider/seguimiento">seguimiento</Link>: <b>ZLDE</b>, que dice cuánto
            envase llegó, y la <b>Base de datos</b>, los viajes que ya pasaron. La tercera
            tabla sale de esas dos y no se importa.
          </p>
        </div>
      </section>

      <Importar
        maestro={paraDetectar}
        zldeCargado={[...porMesZlde].map(([mes, v]) => ({ mes, ...v }))}
        importados={[...porMesViajes].map(([mes, viajes]) => ({ mes, viajes }))}
      />
    </div>
  );
}
