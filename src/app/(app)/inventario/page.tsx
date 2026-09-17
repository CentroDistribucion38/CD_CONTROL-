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

  /* ---------- LOS MÓDULOS QUE SE PASARON DE CAPACIDAD ----------
     CONTAR NO LO IMPIDE, Y ES A PROPÓSITO. Un módulo por encima de su
     capacidad PASA: se recibe de más, se arruma en el pasillo, se deja
     una estiba encima mientras se despacha otra. Bloquear el conteo
     obligaría a quien está caminando a mentir para poder seguir —anotar
     menos de lo que ve— y entonces el inventario diría lo que cabe en
     vez de lo que hay.

     Así que se anota lo que hay y se dice aquí, con las dos cifras al
     lado: cuánto cabe y cuánto hay. La decisión es de quien planea el
     almacén, no del que está contando.

     Se suman las ESTIBAS y no las cajas: la capacidad del maestro está
     en estibas —A01_DER son 96— y comparar cajas contra estibas daría
     que todos los módulos están al 4.000 %. */
  const porModulo = new Map<string, { clave: string; capacidad: number; estibas: number; renglones: number }>();
  for (const l of t.lineas) {
    if (!l.ubicacion || l.capacidad == null || l.capacidad <= 0) continue;
    const x = porModulo.get(l.ubicacion)
      ?? { clave: l.ubicacion, capacidad: l.capacidad, estibas: 0, renglones: 0 };
    x.estibas += Number(l.total_estibas);
    x.renglones += 1;
    porModulo.set(l.ubicacion, x);
  }
  const pasados = [...porModulo.values()]
    .filter((m) => m.estibas > m.capacidad)
    .map((m) => ({ ...m, sobra: m.estibas - m.capacidad, pct: m.estibas / m.capacidad }))
    .sort((a, b) => b.pct - a.pct);

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

          {pasados.length > 0 && (
            <section className="fe-caja">
              <div className="fe-caja-cab">
                <h2>Módulos por encima de su capacidad</h2>
                <p>
                  Lo que se contó pesa más de lo que el maestro dice que cabe. No es un error
                  del conteo: se anota lo que hay, no lo que cabe. Aquí están las dos cifras
                  para que se pueda decidir qué se reacomoda.
                </p>
              </div>
              <div className="fe-tabla">
                <table>
                  <thead>
                    <tr>
                      <th>Módulo</th><th className="n">Cabe</th><th className="n">Hay</th>
                      <th className="n">Sobran</th><th className="n">Ocupación</th>
                      <th className="n">Renglones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pasados.map((m) => (
                      <tr key={m.clave} className="mal">
                        <td><b>{m.clave}</b></td>
                        <td className="n">{nf.format(m.capacidad)}</td>
                        <td className="n">{nf.format(m.estibas)}</td>
                        <td className="n dias">+{nf.format(m.sobra)}</td>
                        <td className="n">{Math.round(m.pct * 100)} %</td>
                        <td className="n">{m.renglones}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="fe-pie-nota">
                En estibas, que es como está la capacidad en el maestro. Si una capacidad está
                mal puesta, se corrige en <b>Maestro → Ubicaciones</b>.
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
