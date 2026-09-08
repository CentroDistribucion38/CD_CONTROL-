import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { viajesEnTransito, nombresDe } from "@/modulos/sider/datos";
import "../sider.css";
import { Transito } from "./Transito";

export const dynamic = "force-dynamic";

const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** Horas que lleva en camino, del intervalo de Postgres. */
function horas(iv: string | null): number {
  if (!iv) return 0;
  const m = iv.match(/(?:(\d+) days? )?(\d+):(\d+):/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 24 + Number(m[2]) + Number(m[3]) / 60;
}

export default async function TransitoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, { viajes, falta }] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    viajesEnTransito(),
  ]);
  /* Ver el tránsito lo puede todo el mundo: de eso se trata, que el que
     recibe sepa qué viene. Certificar la llegada, no. */
  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";
  const nombres = await nombresDe(viajes.map((v) => v.creado_por));

  if (falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Ejecuta <code>supabase/modulos/sider.sql</code> en el SQL Editor. Sin eso no
            hay dónde leer los viajes.
          </p>
        </section>
      </div>
    );
  }

  const totalSider = viajes.reduce((s, v) => s + Number(v.sider ?? 0), 0);
  const trabados = viajes.filter((v) => horas(v.en_camino) > 24).length;
  const sinEvidencia = viajes.filter((v) => v.fotos_salida < 3).length;

  return (
    <div className="sd">
      {/* La cabeza y las alertas se le pasan al cliente en vez de dibujarse
          aquí, porque cuando alguien abre un vehículo para cerrar su
          llegada las esconde: el conteo de los otros doce y el "12
          vehículos en camino" son ruido cuando se está cerrando UNO, y en
          el celular ese ruido se lleva 195 px de los 844 que hay —medido—.
          Desde el servidor no hay forma de saber que lo abrió. */}
      <Transito
        viajes={viajes}
        nombres={nombres}
        esEditor={esEditor}
        trabados={trabados}
        sinEvidencia={sinEvidencia}
        cabeza={
      <section className="cabeza">
        <div>
          <h1>En tránsito</h1>
          <p className="sub">
            Qué viene en camino hacia Barranquilla: placa, de dónde sale, qué trae y hace
            cuánto salió. {esEditor
              ? "Cuando uno llegue, se certifica la llegada desde su tarjeta."
              : "Certificar la llegada requiere rol de supervisor."}{" "}
            <Link href="/sider">Ver la fuente principal</Link>
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">VEHÍCULOS EN CAMINO</div>
          <div className="num">{viajes.length}</div>
          <div className="pie">
            <span>{nf2.format(totalSider)} sider en tránsito</span>
            {esEditor && <Link href="/sider/certificar" className="chip">Certificar salida</Link>}
          </div>
        </div>
      </section>
        }
      />
    </div>
  );
}
