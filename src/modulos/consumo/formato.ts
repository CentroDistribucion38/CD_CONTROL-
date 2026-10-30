/** Formato de cifras del panel de consumo. Sin «server-only» para que lo use también la pantalla. */
export const nf = (d = 0) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: d });
export const fBytes = (b: number) =>
  b >= 1024 ** 3 ? `${nf(2).format(b / 1024 ** 3)} GB` : b >= 1024 ** 2 ? `${nf(1).format(b / 1024 ** 2)} MB` : `${nf(0).format(b / 1024)} KB`;
