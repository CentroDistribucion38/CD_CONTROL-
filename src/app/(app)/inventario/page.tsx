import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { maestroInventario, tableroFefo, type Renglon } from "@/modulos/inventario/fefo";
import "./fefo.css";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const dia = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—";

/**
 * INVENTARIO · EL TABLERO.
 *
 * ES PARA LO QUE EL CONTEO EXISTE. Caminar la bodega y anotar 152
 * renglones no sirve de nada si después nadie puede decir QUÉ SE DESPACHA
 * PRIMERO. Esta pantalla contesta eso y nada más.
 *
 * «DÍAS PARA SALIR» ES LA CIFRA, no el vencimiento. No es cuándo se
 * vence: es cuándo TIENE QUE HABER SALIDO para llegar al cliente con vida
 * útil suficiente —vencimiento menos hoy menos el Mínimo T1 del
 * material—. En negativo ya se pasó, y eso es una decisión de HOY.
 *
 * Y SOLO LEE LO ENVIADO. Un borrador a medio caminar diría que la calle E
 * está vacía porque todavía no se ha llegado, y sobre eso alguien podría
 * decidir un despacho. Lo firmado es lo único que se puede afirmar.
 */
export default async function InventarioTableroPage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestroInventario()]);
  const puedeContar = permisos.puedeEditar("/inventario/conteo");

  if (m.falta) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>Falta preparar el módulo en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta, en orden:{" "}
            <code>supabase/modulos/inventario.sql</code>,{" "}
            <code>supabase/migraciones/2026-09-inventario-fefo.sql</code>,{" "}
            <code>supabase/datos/inventario-maestro-cd38.sql</code> y{" "}
            <code>supabase/migraciones/2026-09-conteo-borrador.sql</code>.
          </p>
        </section>
      </div>
    );
  }

  const conUbi = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => b.activo && conUbi.has(b.id)) ?? m.bodegas[0] ?? null;
  const t = await tableroFefo(bodega?.id ?? null);

  /* ---------- LO QUE DECIDE ----------
     Tres grupos y no una escala continua: lo que ya se pasó, lo que se
     pasa esta semana, y lo demás. Un semáforo de siete colores obliga a
     interpretar; tres grupos se leen de una y cada uno tiene una acción
     distinta —sacarlo hoy, programarlo, dejarlo quieto—. */
  const conFecha = t.lineas.filter((l) => l.dias_para_salir != null);
  const vencido = conFecha.filter((l) => (l.dias_para_salir ?? 0) < 0);
  const semana = conFecha.filter((l) => (l.dias_para_salir ?? 0) >= 0 && (l.dias_para_salir ?? 0) <= 7);
  const cajas = (xs: Renglon[]) => xs.reduce((a, l) => a + Number(l.total_cajas), 0);

  /* Lo urgente primero y por lo que más pesa: dos estibas pasadas de
     fecha no son lo mismo que doscientas cajas sueltas. */
  const urgentes = [...vencido, ...semana]
    .sort((a, b) => (a.dias_para_salir ?? 0) - (b.dias_para_salir ?? 0)
                 || Number(b.total_cajas) - Number(a.total_cajas))
    .slice(0, 40);

  /* Por material, para saber a quién llamar: quince renglones del mismo
     código en ocho módulos son UN problema, no quince. */
  const porMaterial = new Map<string, { nombre: string; cajas: number; sitios: Set<string> }>();
  for (const l of [...vencido, ...semana]) {
    const x = porMaterial.get(l.codigo) ?? { nombre: l.material, cajas: 0, sitios: new Set<string>() };
    x.cajas += Number(l.total_cajas);
    if (l.ubicacion) x.sitios.add(l.ubicacion);
    porMaterial.set(l.codigo, x);
  }
  const materiales = [...porMaterial.entries()].sort((a, b) => b[1].cajas - a[1].cajas).slice(0, 8);
  /* EL TOPE NUNCA PUEDE SER CERO. Las barras se dibujan como fracción
     del material que más pesa, y si ese pesa 0 —pasa: un material sin
     factor estibado contado en estibas da total 0— la división sale NaN,
     el `width: NaN%` se descarta y las barras desaparecen SIN UN SOLO
     ERROR. Es el mismo silencio que dejó la chispa del tablero de rotura
     en blanco con una serie plana. */
  const tope = Math.max(1, ...materiales.map(([, x]) => x.cajas));

  const sinFecha = t.lineas.filter((l) => l.dias_para_salir == null && l.tipo_material !== "ENVASE");

  return (
    <div className="fe">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · FEFO{bodega ? ` · ${bodega.codigo}` : ""}</p>
          <h1>Qué sale primero</h1>
          <p className="sub">
            De los conteos <b>enviados</b>. «Días para salir» no es cuándo se vence: es cuándo
            tiene que haber salido para llegar con vida útil suficiente — el vencimiento menos
            hoy menos el mínimo de cada material. En negativo ya se pasó.
          </p>
        </div>
        <div className={"kpi" + (vencido.length > 0 ? " alarma" : "")}>
          <div className="corte" />
          <div className="rot">YA SE PASÓ DE SALIDA</div>
          <div className="num">{nf.format(cajas(vencido))}</div>
          <div className="pie">
            cajas en {vencido.length} renglón{vencido.length === 1 ? "" : "es"}
          </div>
        </div>
      </section>

      {t.conteos.length === 0 ? (
        <section className="fe-vacio-grande">
          <h2>Todavía no hay conteos enviados</h2>
          <p>
            El tablero se llena con lo que se camina. Un borrador a medio recorrer no cuenta:
            diría que un módulo está vacío porque todavía no se ha llegado, y sobre eso
            alguien podría decidir un despacho.
          </p>
          {puedeContar && <Link className="btn grande" href="/inventario/conteo">Ir a contar</Link>}
        </section>
      ) : (
        <>
          <section className="fe-grupos">
            <div className="fe-grupo mal">
              <p className="rot">YA SE PASÓ</p>
              <p className="n">{nf.format(cajas(vencido))}</p>
              <p className="u">cajas · {vencido.length} renglones — sale hoy</p>
            </div>
            <div className="fe-grupo ojo">
              <p className="rot">SALE ESTA SEMANA</p>
              <p className="n">{nf.format(cajas(semana))}</p>
              <p className="u">cajas · {semana.length} renglones — hay que programarlo</p>
            </div>
            <div className="fe-grupo">
              <p className="rot">CONTADO</p>
              <p className="n">{nf.format(cajas(t.lineas))}</p>
              <p className="u">
                cajas · {new Set(t.lineas.map((l) => l.ubicacion)).size} módulos ·{" "}
                {t.conteos.length} conteo{t.conteos.length === 1 ? "" : "s"}
              </p>
            </div>
          </section>

          {sinFecha.length > 0 && (
            <section className="fe-faltan">
              <p>
                <b>{sinFecha.length} renglón{sinFecha.length > 1 ? "es" : ""} de producto sin
                fecha de vencimiento</b> — no entran en ningún grupo porque no se les puede
                calcular cuándo salen. Son de conteos viejos: hoy la fecha es obligatoria.
              </p>
            </section>
          )}

          {materiales.length > 0 && (
            <section className="fe-caja">
              <div className="fe-caja-cab">
                <h2>A quién llamar</h2>
                <p>
                  Lo urgente agrupado por material. Quince renglones del mismo código en ocho
                  módulos son <b>un</b> problema, no quince.
                </p>
              </div>
              <div className="fe-barras">
                {materiales.map(([cod, x]) => (
                  <div key={cod} className="fe-mat">
                    <span className="nom">
                      <b>{cod}</b> {x.nombre}
                    </span>
                    <span className="pista">
                      <i style={{ width: `${(x.cajas / tope) * 100}%` }} />
                    </span>
                    <span className="val">
                      {nf.format(x.cajas)}
                      <em>{x.sitios.size} módulo{x.sitios.size === 1 ? "" : "s"}</em>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="fe-caja">
            <div className="fe-caja-cab">
              <h2>Renglón por renglón</h2>
              <p>Lo más urgente arriba. Con lo que pesa, para saber por dónde empezar.</p>
            </div>
            <div className="fe-tabla">
              <table>
                <thead>
                  <tr>
                    <th>Días para salir</th><th>Material</th><th>Ubicación</th>
                    <th className="n">Cajas</th><th>Vence</th><th>Contó</th>
                  </tr>
                </thead>
                <tbody>
                  {urgentes.map((l) => (
                    <tr key={l.id} className={(l.dias_para_salir ?? 0) < 0 ? "mal" : ""}>
                      <td className="dias">{l.dias_para_salir}</td>
                      <td><b>{l.codigo}</b> <span>{l.material}</span></td>
                      <td>{l.ubicacion_combinada ?? l.ubicacion}</td>
                      <td className="n">{nf.format(Number(l.total_cajas))}</td>
                      <td>{l.vencimiento
                        ? new Date(l.vencimiento + "T00:00:00").toLocaleDateString("es-CO")
                        : "—"}</td>
                      <td>{l.conto ?? "—"}</td>
                    </tr>
                  ))}
                  {urgentes.length === 0 && (
                    <tr><td colSpan={6} className="nada">
                      Nada urgente: todo lo contado sale con más de una semana de margen.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="fe-caja">
            <div className="fe-caja-cab">
              <h2>Conteos enviados</h2>
              <p>Quién caminó qué, y cuándo lo firmó.</p>
            </div>
            <div className="fe-tabla">
              <table>
                <thead>
                  <tr>
                    <th>Conteo</th><th>Quien contó</th>
                    <th className="n">Renglones</th><th className="n">Módulos</th>
                    <th className="n">Cajas</th><th>Enviado</th>
                  </tr>
                </thead>
                <tbody>
                  {t.conteos.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.codigo}</b></td>
                      <td>{c.responsable ?? "—"}</td>
                      <td className="n">{c.renglones}</td>
                      <td className="n">{c.ubicaciones}</td>
                      <td className="n">{nf.format(Number(c.total_cajas))}</td>
                      <td>
                        {dia(c.enviado_en)}
                        {c.envio_nombre && c.envio_nombre !== c.responsable && (
                          <em> · por {c.envio_nombre}</em>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
