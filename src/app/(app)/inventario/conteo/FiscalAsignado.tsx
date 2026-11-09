import { agruparMisHojas, fechaConDia, textoCuando, type MiHojaBD } from "@/modulos/inventario/fiscal";

/* ===================================================================
   «TU HOJA» DEL INVENTARIO FISCAL, EN CONTAR

   Quien arma el plan oprime «Mostrar en Contar» y cada persona encuentra aquí lo
   suyo, según el equipo en que la pusieron (operador logístico o Bavaria): el
   inventario, el día, el número de su hoja y quién es su pareja. Cada una cuenta
   la hoja por su lado. Si a la persona no le tocó nada, esto no sale.
   =================================================================== */
export function FiscalAsignado({ filas, hoy }: { filas: MiHojaBD[]; hoy: string }) {
  const grupos = agruparMisHojas(filas);
  if (grupos.length === 0) return null;
  return (
    <section className="fa" aria-label="Tu inventario fiscal">
      {grupos.map((g) => {
        const esHoy = g.fecha === hoy;
        return (
          <article key={g.fiscalId} className={"fa-caja fa-mini" + (esHoy ? " hoy" : "")}>
            <p className="fa-linea">
              <b>{g.nombre}</b>
              <span>{fechaConDia(g.fecha)}</span>
              {esHoy ? <strong className="fa-hoy">HOY</strong> : <span>{textoCuando(hoy, g.fecha)}</span>}
            </p>
            <ul className="fa-hojas">
              {g.hojas.map((h) => (
                <li key={h.numero}>
                  <span className="fa-num" aria-label={`Hoja ${h.numero}`}>{h.numero}</span>
                  <span className="fa-det">
                    {h.equipo ? <b>{h.equipo}</b> : <b>Hoja {h.numero}</b>}
                    {" · "}
                    {h.pareja
                      ? <>con <b>{h.pareja}</b>{h.parejaEquipo && <> ({h.parejaEquipo})</>}</>
                      : <em>sin pareja aún</em>}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
