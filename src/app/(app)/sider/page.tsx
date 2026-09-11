import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { viajesSider, maestroSider, nombresDe } from "@/modulos/sider/datos";
import "./sider.css";
import { BotonExportar } from "./Exportar";
import { Viajes } from "./Viajes";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export default async function FuentePrincipalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  /* El maestro se trae para los desplegables de la corrección: quien
     corrige un viaje escoge de la MISMA lista de la que escogió quien
     lo certificó, no escribe el nombre a mano. */
  const [{ viajes, falta }, maestro, permisos] = await Promise.all([
    viajesSider(),
    maestroSider(),
    misPermisos(),
  ]);
  /* El permiso es de ESTA pantalla, no un "es admin o supervisor"
     global: un rol puede certificar y no tocar el maestro. */
  const esEditor = permisos.puedeEditar("/sider");
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

  /* Los KPI cuentan los viajes VIVOS. Un viaje anulado no movió envase,
     y sumarlo diría que sí: es el error que la anulación existe para
     evitar. El seguimiento del mes ya los descartaba en la base; aquí
     no, y ese desacuerdo entre dos pantallas del mismo módulo es peor
     que cualquiera de los dos números por separado. */
  const vivos = viajes.filter((v) => v.estado !== "anulado");

  /* Los días que tienen viajes, para que el calendario de Exportar apague
     los vacíos. Salen de los viajes YA cargados y no de otra consulta:
     así los días encendidos son exactamente los que se van a exportar, y
     no se paga un viaje más a la base por dibujar un calendario. */
  const porDia = new Map<string, number>();
  for (const v of vivos) {
    const d = String(v.fecha).slice(0, 10);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  const diasConViajes = [...porDia.entries()]
    .map(([fecha, n]) => ({ fecha, hl_zlde: 0, viajes: n }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const enTransito = vivos.filter((v) => v.estado === "en_transito");
  const totalHl = vivos.reduce((s, v) => s + Number(v.hl ?? 0), 0);
  const totalSider = vivos.reduce((s, v) => s + Number(v.sider ?? 0), 0);
  const sinFactores = vivos.filter((v) => v.faltan_factores).length;
  const anulados = viajes.length - vivos.length;

  return (
    <div className="sd">
      <section className="cabeza">
        <div>
          <h1>Fuente principal</h1>
          <p className="sub">
            Donde llega toda la información de T1 / T2. Es la hoja{" "}
            <b>Base de Datos</b> del archivo, pero de las 16 columnas solo se guardan las
            cinco que alguien teclea — placa, origen, material, estibas y cuándo — y las
            once restantes se calculan al leer, con las mismas fórmulas.{" "}
            <Link href="/sider/seguimiento">Ver el seguimiento del mes</Link>
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">VEHÍCULOS EN TRÁNSITO</div>
          <div className="num">{enTransito.length}<span className="u">de {vivos.length}</span></div>
          <div className="pie">
            <span>{nf2.format(totalSider)} sider certificados</span>
            <Link href="/sider/transito" className="chip">Ver el tránsito</Link>
          </div>
        </div>
      </section>

      <section className="cifras">
        <div className="cifra">
          <div className="rot">VIAJES</div>
          <div className="n">{nf.format(vivos.length)}</div>
          <div className="u">
            {anulados ? `certificados · ${anulados} anulado${anulados === 1 ? "" : "s"} aparte` : "certificados en el sistema"}
          </div>
        </div>
        <div className="cifra">
          <div className="rot">HECTOLITROS</div>
          <div className="n">{nf.format(totalHl)}</div>
          <div className="u">HL de envase movido</div>
        </div>
        <div className="cifra">
          <div className="rot">PLACAS</div>
          <div className="n">{new Set(vivos.map((v) => v.placa)).size}</div>
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
          <BotonExportar dias={diasConViajes} />
        </div>
        <Viajes
          viajes={viajes}
          nombres={nombres}
          origenes={maestro.origenes.filter((o) => o.activo).map((o) => ({ planta: o.planta, cd_origen: o.cd_origen }))}
          skus={maestro.skus.filter((k) => k.activo).map((k) => ({ sku: k.sku, descripcion: k.descripcion }))}
          manda={permisos.manda}
          esEditor={esEditor}
        />
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
