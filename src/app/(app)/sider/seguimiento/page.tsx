import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { mesesSeguimiento, seguimientoSider, zldeDelMes, MESES_LARGO } from "@/modulos/sider/datos";
import "../sider.css";
import { Seguimiento } from "./Seguimiento";

export const dynamic = "force-dynamic";

/** El mes de la URL, o el más reciente que tenga algo. */
function normaliza(mes: string | undefined, disponibles: string[]): string | null {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) return `${mes}-01`;
  return disponibles[0] ?? null;
}

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: pedido } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, { meses, falta }] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    mesesSeguimiento(),
  ]);
  /* El permiso es de ESTA pantalla, no un "es admin o supervisor"
     global: un rol puede certificar y no tocar el maestro. */
  const esEditor = (await misPermisos()).puedeEditar("/sider/seguimiento");

  if (falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear el seguimiento en Supabase</h2>
          <p>
            Vuelve a ejecutar <code>supabase/modulos/sider.sql</code> en el SQL Editor: el
            archivo creció con la tabla de ZLDE y la vista del informe. Se puede correr
            varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  const mes = normaliza(pedido, meses);
  /* Dos consultas y no una: el informe sale de la vista —clavada en
     Barranquilla y EER, porque eso es el indicador— y la pantalla de
     ZLDE sale de la tabla cruda, para poder mover planta y clase como
     los segmentadores del pivote. */
  const [{ filas }, { filas: zlde }] = mes
    ? await Promise.all([seguimientoSider(mes), zldeDelMes(mes)])
    : [{ filas: [] }, { filas: [] }];

  const dentro = filas.filter((f) => f.aplica_sider);
  const recibido = dentro.reduce((s, f) => s + Number(f.hl_recibido), 0);
  const real = dentro.reduce((s, f) => s + Number(f.real_mtd), 0);
  const meta = filas[0]?.meta ?? 0.1;
  const pct = recibido > 0 ? real / recibido : null;
  const nombreMes = mes
    ? `${MESES_LARGO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
    : "—";

  return (
    <div className="sd">
      <section className="cabeza">
        <div>
          <h1>Seguimiento</h1>
          <p className="sub">
            Cuánto del envase que llegó a Barranquilla vino certificado. Son tres tablas
            encadenadas: lo que <b>ZLDE</b> dice que llegó, lo que{" "}
            <Link href="/sider">nuestra Fuente principal</Link> dice que se certificó, y
            el informe que sale de las dos.
          </p>
        </div>
        <div className={"kpi" + (pct != null && pct < meta ? " corto" : "")}>
          <div className="corte" />
          <div className="rot">% CERTIFICACIÓN · {nombreMes.toUpperCase()}</div>
          <div className="num">
            {pct == null ? "—" : (pct * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })}
            <span className="u">%</span>
          </div>
          <div className="pie">
            <span>meta {(meta * 100).toLocaleString("es-CO", { maximumFractionDigits: 0 })}%</span>
            {esEditor && <Link href="/sider/importar" className="chip">Importar</Link>}
          </div>
        </div>
      </section>

      {!mes ? (
        <section className="sin-tablas">
          <h2>Todavía no hay nada que seguir</h2>
          <p>
            El seguimiento necesita las dos puntas: el <b>HL EER recibido</b> de ZLDE y los
            viajes certificados. Empieza por{" "}
            {esEditor
              ? <Link href="/sider/importar">importar el archivo de ZLDE</Link>
              : "pedirle a un supervisor que cargue el archivo de ZLDE"}.
          </p>
        </section>
      ) : (
        <Seguimiento
          filas={filas}
          zlde={zlde}
          mes={mes}
          meses={meses}
          nombreMes={nombreMes}
          esEditor={esEditor}
        />
      )}
    </div>
  );
}
