const moneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const numero = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 3,
});

export const fmtCOP = (v: number | null | undefined) => moneda.format(v ?? 0);
export const fmtNum = (v: number | null | undefined) => numero.format(v ?? 0);

export const fmtFecha = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
