import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { maestroSider } from "@/modulos/sider/datos";
import "../sider.css";
import { Zlde } from "./Zlde";

export const dynamic = "force-dynamic";

export default async function ZldePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, maestro] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    maestroSider(),
  ]);
  /* El permiso es de ESTA pantalla, no un "es admin o supervisor"
     global: un rol puede certificar y no tocar el maestro. */
  const esEditor = (await misPermisos()).puedeEditar("/sider/zlde");

  /* Qué meses ya están cargados. Se agrupa acá y no en la base porque son
     unas docenas de filas y no vale una vista para esto. */
  const { data: zlde, error } = await supabase
    .from("sider_zlde")
    .select("mes, hl")
    .order("mes", { ascending: false })
    .limit(1000);

  if (error || maestro.falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear la tabla de ZLDE en Supabase</h2>
          <p>
            Vuelve a ejecutar <code>supabase/modulos/sider.sql</code> en el SQL Editor: el
            archivo creció con la tabla <code>sider_zlde</code> y la vista del seguimiento.
            Se puede correr varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  const porMes = new Map<string, { cd: number; hl: number }>();
  for (const f of (zlde ?? []) as { mes: string; hl: number }[]) {
    const a = porMes.get(f.mes) ?? { cd: 0, hl: 0 };
    porMes.set(f.mes, { cd: a.cd + 1, hl: a.hl + Number(f.hl) });
  }
  const ultimos = [...porMes].map(([mes, v]) => ({ mes, ...v })).slice(0, 12);

  if (!esEditor) {
    return (
      <div className="sd">
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Solo lectura</h2>
              <p>
                Cargar ZLDE requiere rol de supervisor o administrador. El{" "}
                <Link href="/sider/seguimiento">seguimiento</Link> lo puedes ver igual.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="sd">
      <section className="cabeza">
        <div>
          <h1>Cargar ZLDE</h1>
          <p className="sub">
            El <b>HL EER recibido</b> por CD de origen: la primera de las tres tablas del{" "}
            <Link href="/sider/seguimiento">seguimiento</Link>. Es lo único que la
            plataforma no puede calcular sola, porque sale de SAP.
          </p>
        </div>
      </section>

      <Zlde origenes={maestro.origenes} ultimos={ultimos} />
    </div>
  );
}
