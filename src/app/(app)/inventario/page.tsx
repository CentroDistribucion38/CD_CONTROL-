import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { maestroInventario, tableroFefo } from "@/modulos/inventario/fefo";
import { medirRiesgo } from "@/modulos/inventario/riesgo";
import { Riesgo } from "./Riesgo";
import "./fefo.css";
import "./riesgo.css";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/* UNA FECHA, CORTA. Sirve para las dos formas en que llegan: la del
   recorrido es un día pelado —«2026-09-18»—, y la última vez que se
   contó una posición trae hora y zona. Sin el «T00:00:00» el día pelado
   se interpreta en UTC y en Barranquilla sale el día anterior. */
const fechaCorta = (s: string) =>
  new Date(s.length === 10 ? s + "T00:00:00" : s)
    .toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
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

  /* EL RIESGO: la foto de la bodega (el último recorrido de cada
     ubicación, no la suma de todos) por franja de salida y por material. */
  const uxc = Object.fromEntries(m.materiales.map((x) => [x.sku, x.unidades_por_caja]));
  const { foto, ...riesgo } = medirRiesgo(t.lineas, t.conteos, uxc);

  const sinFecha = foto.filter((l) => l.dias_para_salir == null && l.tipo_material !== "ENVASE");

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
  for (const l of foto) {
    if (!l.ubicacion || l.capacidad == null || l.capacidad <= 0) continue;
    const x = porModulo.get(l.ubicacion)
      ?? { clave: l.ubicacion, capacidad: l.capacidad, estibas: 0, renglones: 0 };
    x.estibas += Number(l.total_estibas);
    x.renglones += 1;
    porModulo.set(l.ubicacion, x);
  }
  /* =================================================================
     LO QUE QUEDÓ SIN CONTAR EN EL ÚLTIMO RECORRIDO

     «Faltaría una tabla o algo que les muestre si quedó algún módulo
     sin contar; necesito información con la que yo pueda tener alertas
     y la visual.»

     ES LA ADVERTENCIA DE TODO LO DEMÁS. Las cifras de arriba salen de
     lo que se caminó: un módulo que nadie tocó no sale como cero, sale
     como que no existe, y sobre esa foto alguien despacha. Por eso va
     pegado a los grupos y no al final.

     SE ORDENA POR DÍAS SIN CONTAR Y NO POR CALLE. La lista alfabética
     empieza siempre por A01 —que probablemente se contó ayer— y deja
     abajo el que lleva tres semanas, que es el único que hay que ir a
     caminar hoy. Lo que nunca se ha contado va de primero: no tiene
     días que contar y es lo más grave. */
  const sinContar = [...t.sinContar].sort((a, b) =>
    (b.dias_sin_contar ?? Number.MAX_SAFE_INTEGER) - (a.dias_sin_contar ?? Number.MAX_SAFE_INTEGER)
    || a.clave.localeCompare(b.clave, "es", { numeric: true }));
  const nunca = sinContar.filter((u) => u.dias_sin_contar == null);
  /* DOS SEMANAS ES EL CORTE. No es un número mío: es el que separa «no
     tocó este recorrido» de «lleva sin mirarse más de lo que dura un
     ciclo de conteo». Si el ciclo cambia, este número cambia con él.

     Y LOS QUE NUNCA SE CONTARON NO CUENTAN AQUÍ. Estaban entrando con
     un `?? 999` y se reportaban DOS VECES: «420 nunca se han contado.
     420 llevan más de dos semanas sin mirarse» — los mismos 420, dichos
     como si fueran ochocientos cuarenta. Un módulo que nunca se contó
     no lleva días sin mirarse: no tiene desde cuándo. */
  const viejos = sinContar.filter((u) => u.dias_sin_contar != null && u.dias_sin_contar > 14);

  /* CUÁNTAS POSICIONES ACTIVAS TIENE LA BODEGA. Es el denominador de
     todo este bloque: «427 sin contar» no dice nada sin decir de
     cuántas. 427 de 427 es una bodega que nadie ha caminado; 427 de
     1.200 es media jornada pendiente. */
  const activas = m.ubicaciones.filter((u) => u.activa && u.bodega_id === bodega?.id).length;
  /* LA VISUAL: por calle, que es como se camina la bodega. «38 módulos
     sin contar» no dice por dónde empezar; «la calle E entera» sí. */
  const porCalle = (() => {
    const cuenta = new Map<string, { calle: string; falta: number; total: number }>();
    /* EL TOTAL DE CADA CALLE SALE DEL MAESTRO, que es quien sabe
       cuántas posiciones tiene. Contarlas de lo contado daría el
       denominador equivocado justo en la calle que nadie caminó: «2 de
       2 sin contar» en vez de «2 de 34». */
    for (const u of m.ubicaciones) {
      if (!u.activa || u.bodega_id !== bodega?.id) continue;
      const k = u.calle ?? "—";
      const x = cuenta.get(k) ?? { calle: k, falta: 0, total: 0 };
      x.total += 1;
      cuenta.set(k, x);
    }
    for (const u of t.sinContar) {
      const k = u.calle ?? "—";
      const x = cuenta.get(k) ?? { calle: k, falta: 0, total: 0 };
      x.falta += 1;
      cuenta.set(k, x);
    }
    return [...cuenta.values()]
      .filter((x) => x.falta > 0)
      .sort((a, b) => b.falta - a.falta || a.calle.localeCompare(b.calle, "es", { numeric: true }));
  })();

  const pasados = [...porModulo.values()]
    .filter((m) => m.estibas > m.capacidad)
    .map((m) => ({ ...m, sobra: m.estibas - m.capacidad, pct: m.estibas / m.capacidad }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="fe">
      {t.conteos.length === 0 && (
        <section className="cabeza">
          <div>
            <p className="ojo">INVENTARIO · FEFO{bodega ? ` · ${bodega.codigo}` : ""}</p>
            <h1>Qué se vence y dónde está</h1>
          </div>
        </section>
      )}
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
          <Riesgo r={riesgo} bodega={bodega?.codigo ?? ""} sinContar={t.faltaSinContar ? 0 : sinContar.length}
                  ultimo={t.ultimo?.codigo ?? null} activas={activas} />

          {/* ============ QUÉ QUEDÓ SIN CONTAR ============

              Va pegado a los grupos y no al final porque es la
              ADVERTENCIA de todo lo de arriba: las cifras salen de lo
              que se caminó, y un módulo que nadie tocó no sale como
              cero —sale como que no existe—. Sobre esa foto alguien
              despacha.

              Y SE DICE TAMBIÉN CUANDO ESTÁ EN CERO. «Nada quedó sin
              contar» es una afirmación que se puede hacer y que alguien
              necesita: sin ella, la ausencia de la caja se lee igual
              que no haber mirado. */}
          {t.faltaSinContar ? (
            <section className="fe-faltan">
              <p>
                <b>No se puede decir qué quedó sin contar.</b> Falta correr{" "}
                <code>supabase/migraciones/2026-09-conteo-preanotacion.sql</code> en Supabase.
                Todo lo demás del tablero funciona igual.
              </p>
            </section>
          ) : t.ultimo && sinContar.length === 0 ? (
            <section className="fe-faltan bien">
              <p>
                <b>Nada quedó sin contar</b> en el último recorrido
                {t.ultimo.fecha_analisis && <> ({fechaCorta(t.ultimo.fecha_analisis)})</>}: se
                caminaron las {nf.format(activas)} posiciones activas.
              </p>
            </section>
          ) : t.ultimo && (
            /* CERRADO AL ENTRAR, Y EN UNA LÍNEA.

               La primera versión pintaba once barras de calle y una
               tabla de sesenta filas, siempre abiertas: una pantalla
               entera para un dato que casi todos los días es «faltan
               tres». Y el día que falta TODO —427 de 427— las once
               barras salen al 100 % y no dicen nada: cuando falta casi
               todo, el gráfico por calle es ruido.

               Así que la respuesta va en la tapa —cuántos, de cuántos,
               y qué tan viejos— y el detalle se abre si alguien lo
               pide. Es un `<details>` del navegador y no un botón con
               estado: esta pantalla se dibuja en el servidor, y montar
               React aquí para abrir un cajón sería pagar con carga lo
               que el navegador hace solo. */
            <details className="fe-caja fe-sincontar">
              <summary className="fe-sc-tapa">
                <span className="n">{nf.format(sinContar.length)}</span>
                <span className="tx">
                  <b>
                    módulo{sinContar.length === 1 ? "" : "s"} sin contar en el último
                    recorrido
                  </b>
                  <span>
                    de {nf.format(activas)} activos
                    {nunca.length > 0 && <> · {nf.format(nunca.length)} nunca contado{nunca.length === 1 ? "" : "s"}</>}
                    {viejos.length > 0 && <> · {nf.format(viejos.length)} hace más de 2 semanas</>}
                    {" · "}{t.ultimo.codigo}
                  </span>
                </span>
                <span className="fl" aria-hidden="true">▾</span>
              </summary>

              {/* UNA SOLA BARRA: lo contado contra el total. Once barras
                  al 100 % ocupaban una pantalla para decir lo que esta
                  dice en 6 px de alto. */}
              <div className="fe-sc-barra" role="img"
                   aria-label={`${nf.format(activas - sinContar.length)} de ${nf.format(activas)} posiciones contadas`}>
                <i style={{ width: `${activas > 0 ? ((activas - sinContar.length) / activas) * 100 : 0}%` }} />
              </div>

              <div className="fe-sc-cuerpo">
                <p className="fe-sc-nota">
                  Las cifras de arriba salen de lo que se caminó: un módulo que nadie contó
                  no aparece como cero, <b>no aparece</b>. Por calle:
                </p>

                {/* POR CALLE, EN FICHAS Y NO EN BARRAS. «P 88/88» dice lo
                    mismo que una barra llena y cabe once veces en dos
                    renglones. La barra solo gana cuando hay que comparar
                    proporciones distintas, y aquí lo que se compara es
                    un par de números que ya están escritos. */}
                <p className="fe-sc-calles">
                  {porCalle.map((c) => (
                    <span key={c.calle}
                          className={c.total > 0 && c.falta / c.total > 0.5 ? "mal" : undefined}>
                      {c.calle}<em>{nf.format(c.falta)}/{nf.format(c.total)}</em>
                    </span>
                  ))}
                </p>

                <div className="fe-tabla">
                  <table>
                    <thead>
                      <tr>
                        <th>Módulo</th><th>Familia</th><th className="n">Cabe</th>
                        <th className="n">Sin contar hace</th><th>Última vez</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sinContar.slice(0, 60).map((u) => (
                        <tr key={u.ubicacion_id}
                            className={u.dias_sin_contar == null || u.dias_sin_contar > 14 ? "mal" : undefined}>
                          <td><b>{u.clave}</b></td>
                          <td>{u.familia ?? "—"}</td>
                          <td className="n">{u.capacidad == null ? "—" : nf.format(u.capacidad)}</td>
                          <td className="n dias">
                            {u.dias_sin_contar == null
                              ? "nunca"
                              : `${nf.format(u.dias_sin_contar)} día${u.dias_sin_contar === 1 ? "" : "s"}`}
                          </td>
                          <td>{u.ultimo_en ? fechaCorta(u.ultimo_en) : "no se ha contado nunca"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sinContar.length > 60 && (
                  <p className="fe-pie-nota">
                    Salen los <b>60</b> que llevan más tiempo sin contarse, de{" "}
                    {nf.format(sinContar.length)}.
                  </p>
                )}
              </div>
            </details>
          )}

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
