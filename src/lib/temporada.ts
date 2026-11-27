/**
 * TEMPORADAS DE LA APP: cuándo la entrada y el sonido se visten de fiesta.
 *
 * NAVIDAD: del 25 de noviembre al 6 de enero (Reyes), con la fecha de Colombia, igual en el servidor y en el
 * celular (así la entrada no cambia entre el HTML del servidor y la app). Para cambiar las fechas, solo aquí.
 */
const NAVIDAD_DESDE = "11-25"; // mes-día, incluido
const NAVIDAD_HASTA = "01-06"; // mes-día, incluido (del año siguiente)

function mesDiaBogota(fecha: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", month: "2-digit", day: "2-digit" }).formatToParts(fecha);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${v("month")}-${v("day")}`;
}

export function esNavidad(fecha: Date = new Date()): boolean {
  const md = mesDiaBogota(fecha);
  return md >= NAVIDAD_DESDE || md <= NAVIDAD_HASTA;
}
