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
          <article key={g.fiscalId} className={"fa-caja" + (esHoy ? " hoy" : "")}>
            <p className="fa-ojo">INVENTARIO FISCAL · {g.hojas.length === 1 ? "TU HOJA" : "TUS HOJAS"}</p>
            <h2 className="fa-nombre">{g.nombre}</h2>
            <p className="fa-cuando">
              <b>{fechaConDia(g.fecha)}</b> · {esHoy ? <strong className="fa-hoy">HOY</strong> : textoCuando(hoy, g.fecha)}
            </p>
            <ul className="fa-hojas">
              {g.hojas.map((h) => (
                <li key={h.numero}>
                  <span className="fa-num" aria-label={`Hoja ${h.numero}`}>{h.numero}</span>
                  <span className="fa-det">
                    <b>Hoja {h.numero}</b>
                    {h.equipo && <> · cuentas por el <b>{h.equipo}</b></>}
                    <br />
                    {h.pareja
                      ? <>Tu pareja: <b>{h.pareja}</b>{h.parejaEquipo && <> ({h.parejaEquipo})</>}</>
                      : <em>Todavía sin pareja en esta hoja</em>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="fa-pie">Cada uno cuenta su hoja por su lado.</p>
          </article>
        );
      })}
    </section>
  );
}
