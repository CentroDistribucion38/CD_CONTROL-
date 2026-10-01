import type { FichaTotales, Totales } from "@/modulos/inventario/totales-conteo";

/* LA FICHA DE TOTALES DEL BORRADOR: estibas, cajas y unidades en grande, para
   compararlas con otro conteo de un vistazo. Producto y envase aparecen aparte
   (solo si hay de los dos), y si algún renglón no se pudo convertir se dice cuál,
   en vez de dejar un total que parece completo y no lo es. */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

const Tres = ({ t }: { t: Totales }) => (
  <dl className="fe-ficha-cifras">
    <div><dt>Estibas</dt><dd data-k="estibas">{nf1.format(t.estibas)}</dd></div>
    <div><dt>Cajas</dt><dd data-k="cajas">{nf.format(t.cajas)}</dd></div>
    <div><dt>Unidades</dt><dd data-k="unidades">{nf.format(t.unidades)}</dd></div>
  </dl>
);

const Linea = ({ nombre, t }: { nombre: string; t: Totales }) => (
  <li>
    <b>{nombre}</b>
    <span>{nf1.format(t.estibas)} estibas · {nf.format(t.cajas)} cajas · {nf.format(t.unidades)} unidades</span>
    <small>{t.renglones} {t.renglones === 1 ? "renglón" : "renglones"}</small>
  </li>
);

export function Ficha({ titulo, ficha, suave }: { titulo: string; ficha: FichaTotales; suave?: boolean }) {
  const g = ficha.general;
  const separar = ficha.producto.renglones > 0 && ficha.envase.renglones > 0;
  return (
    <section className={"fe-ficha" + (suave ? " suave" : "")} aria-label={titulo}>
      <h3>{titulo} <small>{g.renglones} {g.renglones === 1 ? "renglón" : "renglones"}</small></h3>
      <Tres t={g} />
      {separar && (
        <ul className="fe-ficha-tipos">
          <Linea nombre="Producto" t={ficha.producto} />
          <Linea nombre="Envase" t={ficha.envase} />
        </ul>
      )}
      {(g.sinFactor > 0 || g.sinUnidades > 0) && (
        <p className="fe-ficha-aviso" role="note">
          {g.sinFactor > 0 && <>{g.sinFactor} {g.sinFactor === 1 ? "renglón no tiene" : "renglones no tienen"} cajas por estiba: no suma{g.sinFactor === 1 ? "" : "n"} en estibas. </>}
          {g.sinUnidades > 0 && <>{g.sinUnidades} {g.sinUnidades === 1 ? "renglón no tiene" : "renglones no tienen"} unidades por caja: no suma{g.sinUnidades === 1 ? "" : "n"} en unidades.</>}
        </p>
      )}
    </section>
  );
}
