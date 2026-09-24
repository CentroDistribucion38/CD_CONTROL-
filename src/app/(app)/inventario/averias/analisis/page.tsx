import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { averias } from "@/modulos/averias/datos";
import { hallazgos, CAUSAL_NOMBRE, type Averia } from "@/modulos/averias/hallazgos";
import "../../fefo.css";
import "../averias.css";
import "./analisis.css";
import { BotonInformeAverias } from "./BotonInformeAverias";

export const dynamic = "force-dynamic";

const hoyBogota = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }))
    .toLocaleDateString("en-CA");

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const MES = ["ene", "feb", "mar", "abr", "may", "jun",
             "jul", "ago", "sep", "oct", "nov", "dic"];
const calleDe = (u: string) => (u.trim().match(/^[A-Za-z]+/)?.[0] ?? u).toUpperCase();

/**
 * AVERÍAS · ANÁLISIS.
 *
 * «Haz con averías algo brutal y sobre todo profesional, con hallazgos
 *  y todo en el informe.»
 *
 * LOS HALLAZGOS NO SE CALCULAN AQUÍ. Salen de `modulos/averias/
 * hallazgos.ts`, que es una función pura, y los MISMOS que se ven en
 * pantalla viajan al PDF. Si la pantalla y el papel sacaran cada uno
 * sus cuentas, el día que cambie una regla dirían cosas distintas y
 * quien está en la reunión con el papel no tendría cómo saber cuál es
 * la buena.
 *
 * Y NINGUNO SE INVENTA: el motor tiene pisos —un mínimo de averías, un
 * mínimo de concentración— y cuando no los pasa, el hallazgo no sale.
 * Un informe que siempre encuentra algo deja de creerse a la tercera
 * vez, igual que uno que cambia solo.
 */
export default async function AveriasAnalisisPage() {
  const [permisos, av] = await Promise.all([misPermisos(), averias()]);
  const hoy = hoyBogota();

  if (av.sinTabla || !permisos.puedeVer("/inventario/averias")) {
    return (
      <div className="fe">
        <section className="cabeza">
          <div>
            <p className="ojo">INVENTARIO · AVERÍAS · ANÁLISIS</p>
            <h1>{av.sinTabla ? "Falta crear esta parte en Supabase" : "Sin acceso"}</h1>
            <p className="sub">
              {av.sinTabla
                ? "Corre supabase/migraciones/2026-09-averias.sql en el editor de SQL."
                : "Esta pantalla es de quien lleva el inventario."}
            </p>
          </div>
        </section>
      </div>
    );
  }

  /* SE ANALIZAN LAS VIVAS. Una anulada es una que se dijo que no pasó:
     meterla en el análisis es contar dos veces lo que alguien ya
     corrigió. */
  const vivas = av.lista.filter((a) => !a.anulada_en);

  const datos: Averia[] = vivas.map((a) => ({
    codigo: a.codigo, fecha: a.fecha, ubicacion: a.ubicacion,
    producto_codigo: a.producto_sku, producto: a.producto,
    cajas: a.cajas, unidades: a.unidades, vence: a.vence,
    causal: a.causal, reporto: a.reporto,
    documento: a.documento, documento_en: a.documento_en,
  }));

  const hs = hallazgos(datos, hoy);

  const cajas = vivas.reduce((s, a) => s + a.cajas, 0);
  const unidades = vivas.reduce((s, a) => s + a.unidades, 0);
  const pend = vivas.filter((a) => a.pendiente_baja);
  const cajasPend = pend.reduce((s, a) => s + a.cajas, 0);

  /* POR MES, por el mes en que PASÓ la avería y no en el que se
     registró: una avería del 30 registrada el 2 es de su mes. */
  const porMes = new Map<string, number>();
  for (const a of vivas) {
    const k = a.fecha.slice(0, 7);
    porMes.set(k, (porMes.get(k) ?? 0) + a.cajas);
  }
  const meses = [...porMes.entries()].sort().slice(-8);
  const maxMes = Math.max(1, ...meses.map(([, v]) => v));

  const porCalle = new Map<string, number>();
  for (const a of vivas) {
    const c = calleDe(a.ubicacion);
    porCalle.set(c, (porCalle.get(c) ?? 0) + a.cajas);
  }
  const calles = [...porCalle.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  const maxCalle = Math.max(1, ...calles.map(([, v]) => v));

  const porCausal = new Map<string, number>();
  for (const a of vivas) porCausal.set(a.causal, (porCausal.get(a.causal) ?? 0) + a.cajas);
  const causalesOrd = [...porCausal.entries()].sort((x, y) => y[1] - x[1]);

  const porProducto = new Map<string, { nombre: string; cajas: number }>();
  for (const a of vivas) {
    const x = porProducto.get(a.producto_sku) ?? { nombre: a.producto, cajas: 0 };
    x.cajas += a.cajas;
    porProducto.set(a.producto_sku, x);
  }
  const productos = [...porProducto.entries()]
    .sort((x, y) => y[1].cajas - x[1].cajas).slice(0, 6);
  const maxProd = Math.max(1, ...productos.map(([, v]) => v.cajas));

  const periodo = vivas.length
    ? `${vivas.reduce((v, a) => (a.fecha < v ? a.fecha : v), vivas[0].fecha)} a ${hoy}`
    : hoy;

  return (
    <div className="fe avr avra">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · AVERÍAS · ANÁLISIS</p>
          <h1>Qué se está averiando, y dónde</h1>
          <p className="sub">
            Sobre las averías que siguen vivas —las anuladas no cuentan, porque son las
            que alguien ya dijo que no pasaron—. Los hallazgos de abajo son los mismos
            que van en el PDF: no hay dos cuentas.
          </p>
        </div>
        <div className="cabeza-der">
          <div className="kpi">
            <i className="corte" />
            <div className="rot">CAJAS AVERIADAS</div>
            <div className="num">{nf.format(cajas)}</div>
            <div className="pie">
              {vivas.length} {vivas.length === 1 ? "avería" : "averías"}
              {unidades > 0 && ` · ${nf.format(unidades)} unidades sueltas`}
            </div>
          </div>
          <BotonInformeAverias datos={{
            hoy, periodo, filtros: "",
            averias: datos,
          }} />
        </div>
      </section>

      {/* ------------------------------------------------------------
          LOS HALLAZGOS VAN ARRIBA, antes de las gráficas.
          Una gráfica enseña un número; un hallazgo dice qué hacer con
          él. Puestas primero las gráficas, quien entra treinta segundos
          se va habiendo visto barras.
          ------------------------------------------------------------ */}
      <section className="avra-hall">
        <h2>Lo que dicen los números</h2>
        {hs.length === 0 ? (
          <p className="fe-vacio">
            Todavía no hay suficientes averías para decir nada que no sea inventado.
            Los hallazgos salen cuando hay de dónde sacarlos.
          </p>
        ) : (
          <div className="avra-lista">
            {hs.map((h, i) => (
              <article key={i} className={"avra-h avra-" + h.peso}>
                <div className="avra-cifra">{h.cifra}</div>
                <div className="avra-txt">
                  <div className="avra-dice">{h.dice}</div>
                  <div className="avra-porque">{h.porque}</div>
                  {/* LA CUENTA QUE LO SOSTIENE, para que no haya que
                      creerle al informe: quien lo mire puede rehacerla. */}
                  <div className="avra-cuenta">{h.cuenta}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="avra-rejilla">
        <section className="avra-caja">
          <h3>Por mes</h3>
          <p className="avra-nota">Por el mes en que pasó, no en el que se registró.</p>
          {meses.length === 0 ? <p className="fe-vacio">Sin datos.</p> : (
            <div className="avra-barras">
              {meses.map(([k, v]) => (
                <div key={k} className="avra-b">
                  <span className="avra-et">{MES[Number(k.slice(5, 7)) - 1]} {k.slice(2, 4)}</span>
                  <span className="avra-linea"><i style={{ width: `${(v / maxMes) * 100}%` }} /></span>
                  <span className="avra-val">{nf.format(v)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="avra-caja">
          <h3>Por calle</h3>
          <p className="avra-nota">
            La calle es la letra: «A03 · M12» es la calle A. Agrupar por el módulo
            reparte una misma calle en tantos grupos como módulos tenga.
          </p>
          {calles.length === 0 ? <p className="fe-vacio">Sin datos.</p> : (
            <div className="avra-barras">
              {calles.map(([k, v]) => (
                <div key={k} className="avra-b">
                  <span className="avra-et">Calle {k}</span>
                  <span className="avra-linea"><i style={{ width: `${(v / maxCalle) * 100}%` }} /></span>
                  <span className="avra-val">{nf.format(v)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="avra-caja">
          <h3>Por causal</h3>
          <p className="avra-nota">
            Transporte llega averiado —es de afuera—; depósito se hizo aquí.
          </p>
          <div className="avra-barras">
            {causalesOrd.length === 0 ? <p className="fe-vacio">Sin datos.</p> :
              causalesOrd.map(([k, v]) => (
                <div key={k} className="avra-b">
                  <span className="avra-et">
                    {CAUSAL_NOMBRE[k as keyof typeof CAUSAL_NOMBRE] ?? k}
                  </span>
                  <span className="avra-linea">
                    <i className={k === "transporte" ? "avra-fuera" : ""}
                       style={{ width: `${(v / Math.max(1, causalesOrd[0][1])) * 100}%` }} />
                  </span>
                  <span className="avra-val">{nf.format(v)}</span>
                </div>
              ))}
          </div>
        </section>

        <section className="avra-caja">
          <h3>Qué producto se avería más</h3>
          <p className="avra-nota">En cajas, no en veces: una estiba pesa más que un caso suelto.</p>
          {productos.length === 0 ? <p className="fe-vacio">Sin datos.</p> : (
            <div className="avra-barras">
              {productos.map(([sku, p]) => (
                <div key={sku} className="avra-b">
                  <span className="avra-et" title={p.nombre}>{p.nombre}</span>
                  <span className="avra-linea"><i style={{ width: `${(p.cajas / maxProd) * 100}%` }} /></span>
                  <span className="avra-val">{nf.format(p.cajas)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="avra-deuda">
        <h3>Lo que todavía cuenta en el inventario</h3>
        <p>
          <b>{pend.length}</b> {pend.length === 1 ? "avería" : "averías"} sin documento de
          baja, <b>{nf.format(cajasPend)}</b> cajas. Mientras no lo tengan, el sistema cree
          que ese producto está disponible.
        </p>
        <p className="avr-pie-link">
          <Link href="/inventario/averias">← Volver a la lista y dar de baja</Link>
        </p>
      </section>
    </div>
  );
}
