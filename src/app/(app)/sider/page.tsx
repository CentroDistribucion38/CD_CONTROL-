import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { viajesSider, nombresDe, MESES_LARGO } from "@/modulos/sider/datos";
import "./sider.css";
import { OjoEvidencia } from "./Evidencia";
import { BotonExportar } from "./Exportar";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const hora = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      }) : "—";

/** "3 h 40 min": el intervalo de Postgres llega como texto. */
function enCamino(iv: string | null): string {
  if (!iv) return "—";
  const m = iv.match(/(?:(\d+) days? )?(\d+):(\d+):/);
  if (!m) return iv;
  const d = Number(m[1] ?? 0), h = Number(m[2]), mi = Number(m[3]);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${mi} min`;
  return `${mi} min`;
}

export default async function FuentePrincipalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, { viajes, falta }] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    viajesSider(),
  ]);
  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";
  const nombres = await nombresDe(viajes.map((v) => v.creado_por));

  if (falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Abre el SQL Editor de Supabase y ejecuta{" "}
            <code>supabase/modulos/sider.sql</code>. Ese archivo crea las tablas, siembra
            el maestro con los 16 orígenes y los 21 materiales de tu Excel, y arma el
            bucket privado de las fotos. Se puede correr varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  const enTransito = viajes.filter((v) => v.estado === "en_transito");
  const totalHl = viajes.reduce((s, v) => s + Number(v.hl ?? 0), 0);
  const totalSider = viajes.reduce((s, v) => s + Number(v.sider ?? 0), 0);
  const sinFactores = viajes.filter((v) => v.faltan_factores).length;

  return (
    <div className="sd">
      <section className="cabeza">
        <div>
          <h1>Fuente principal</h1>
          <p className="sub">
            Donde llega toda la información de Sider Certificado. Es la hoja{" "}
            <b>Base de Datos</b> del archivo, pero de las 16 columnas solo se guardan las
            cinco que alguien teclea — placa, origen, material, estibas y cuándo — y las
            once restantes se calculan al leer, con las mismas fórmulas.{" "}
            <Link href="/sider/seguimiento">Ver el seguimiento del mes</Link>
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">VEHÍCULOS EN TRÁNSITO</div>
          <div className="num">{enTransito.length}<span className="u">de {viajes.length}</span></div>
          <div className="pie">
            <span>{nf2.format(totalSider)} sider certificados</span>
            <Link href="/sider/transito" className="chip">Ver el tránsito</Link>
          </div>
        </div>
      </section>

      <section className="cifras">
        <div className="cifra">
          <div className="rot">VIAJES</div>
          <div className="n">{nf.format(viajes.length)}</div>
          <div className="u">certificados en el sistema</div>
        </div>
        <div className="cifra">
          <div className="rot">HECTOLITROS</div>
          <div className="n">{nf.format(totalHl)}</div>
          <div className="u">HL de envase movido</div>
        </div>
        <div className="cifra">
          <div className="rot">PLACAS</div>
          <div className="n">{new Set(viajes.map((v) => v.placa)).size}</div>
          <div className="u">vehículos distintos</div>
        </div>
        <div className="cifra">
          <div className="rot">SIN FACTORES</div>
          <div className="n">{sinFactores}</div>
          <div className="u">
            {sinFactores
              ? <>viajes con material sin factores · <Link href="/sider/maestro">arreglar</Link></>
              : "todos los materiales tienen factores"}
          </div>
        </div>
      </section>

      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>Los viajes</h2>
            <p>
              Las columnas en gris no se guardan: se calculan del material y las estibas
              cada vez que se leen, así que nunca pueden quedar desfasadas de su fórmula.
              El ojo de cada fila abre sus fotos y lo que se llenó en el formulario.
            </p>
          </div>
          <BotonExportar />
        </div>
        <div className="marco">
          <table>
            <thead>
              <tr>
                <th>Placa</th>
                <th>CD origen</th>
                <th>Material</th>
                <th className="num">Estibas</th>
                <th className="num">Sider</th>
                <th className="num">Cajas</th>
                <th className="num">Unidades</th>
                <th className="num">HL</th>
                <th>Salida</th>
                <th>Llegada</th>
                <th>Estado</th>
                <th>Quién</th>
                <th className="ojo-col">Evidencia</th>
              </tr>
            </thead>
            <tbody>
              {viajes.map((v) => (
                <tr key={v.id}>
                  <td className="placa">{v.placa}</td>
                  <td>
                    <div>{v.cd_origen}</div>
                    <div className="cod">
                      {MESES_LARGO[v.num_mes - 1]} {v.anio} · sem {v.semana}
                    </div>
                  </td>
                  <td>
                    <div>{v.descripcion}</div>
                    <div className="cod">{v.sku}{v.tipo_envase ? ` · ${v.tipo_envase}` : ""}</div>
                  </td>
                  <td className="num">{nf2.format(v.estibas)}</td>
                  <td className="num">{nf2.format(v.sider)}</td>
                  <td className="num">{v.cajas == null ? "—" : nf.format(v.cajas)}</td>
                  <td className="num">{v.unidades == null ? "—" : nf.format(v.unidades)}</td>
                  <td className="num">{v.hl == null ? "—" : nf2.format(v.hl)}</td>
                  <td>
                    <div>{hora(v.salida_en)}</div>
                    <div className="cod">{v.fotos_salida}/3 fotos</div>
                  </td>
                  <td>
                    <div>{hora(v.llegada_en)}</div>
                    <div className="cod">
                      {v.estado === "en_transito" ? enCamino(v.en_camino) : `${v.fotos_llegada}/3 fotos`}
                    </div>
                  </td>
                  <td>
                    <span className={"sello " + (v.faltan_factores ? "falta" : v.estado === "recibido" ? "recibido" : v.estado === "anulado" ? "anulado" : "transito")}>
                      <i />
                      {v.faltan_factores ? "sin factores"
                        : v.estado === "recibido" ? "recibido"
                        : v.estado === "anulado" ? "anulado" : "en tránsito"}
                    </span>
                  </td>
                  <td>{v.creado_por ? nombres[v.creado_por] ?? "—" : "—"}</td>
                  <td className="ojo-col"><OjoEvidencia viaje={v} nombres={nombres} /></td>
                </tr>
              ))}
              {!viajes.length && (
                <tr>
                  <td className="vacio" colSpan={13}>
                    Todavía no hay viajes certificados.
                    {esEditor && <> <Link href="/sider/certificar">Certifica el primero</Link>.</>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="nota-pie">
        Un sider son {`${36}`} estibas, y ese número vive en el maestro como parámetro con
        nombre — en el Excel estaba escrito a mano dentro de la fórmula{" "}
        <code>=estibas/36</code>. Los orígenes y los materiales también se editan en el{" "}
        <Link href="/sider/maestro">maestro</Link>: son datos, no código.
      </p>
    </div>
  );
}
