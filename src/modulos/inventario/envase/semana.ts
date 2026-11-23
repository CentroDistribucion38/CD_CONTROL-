import { convertir, estadoDia, maestro, masDias, papeles, type FilaPlanBD } from "./calc";
import { hoyBogota, lunesDe, movimientosContab, planesDeSemana, productosDe, ultimaEntrada } from "./datos";

/**
 * EL CIERRE DE LA SEMANA PASADA Y CÓMO VA LA ACTUAL — en HL.
 *
 * «Así como subo toda la MB51 para revisar todo, me debería dar primero el cierre del plan de la semana pasada y la actual.»
 * Por semana (lunes a domingo) y día por día:
 *   · plan inicial y plan vigente (cada día con el último corte que lo cubre; si no hay corte, el inicial)
 *   · notificado = Z01 − Z02 con fecha de contabilización de ese día (lo de madrugada cuenta en su día)
 *   · cumplimiento = notificado ÷ plan vigente
 * La semana pasada queda CERRADA cuando la MB51 trae algo digitado desde las 6:00 del lunes siguiente (la madrugada del domingo
 * ya está). En la semana actual, hoy cuenta el plan hasta esta hora (la hora en curso, por minutos) y los días que vienen no cuentan.
 */
export type DiaSemana = { dia: string; planIni: number; planVig: number; planHasta: number; notif: number; estado: "cerrado" | "abierto" | "sin" | "futuro" };
export type ResumenSemana = {
  lunes: string; domingo: string; semana: number | null; estado: "cerrada" | "abierta" | "en curso" | "sin plan";
  dias: DiaSemana[]; planIni: number; planVig: number; planHasta: number; notif: number;
};

export async function cierreDeSemanas(): Promise<{ semanas: ResumenSemana[]; mb51: string | null; error: string | null }> {
  const hoy = hoyBogota();
  const ahora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const [hh, mm] = ahora.split(":").map(Number);
  const actual = lunesDe(hoy), pasada = masDias(actual, -7);
  const [u, pa, pb, mv] = await Promise.all([ultimaEntrada(), planesDeSemana(pasada), planesDeSemana(actual), movimientosContab(pasada, masDias(actual, 6))]);
  const error = pa.error ?? pb.error ?? mv.error ?? null;
  const skus = new Set<string>();
  for (const f of [...pa.filas, ...pb.filas]) if (f.sku) skus.add(f.sku);
  const movZ = mv.filas.filter((m) => (m.clase === "Z01" || m.clase === "Z02") && /P$/i.test(m.material));
  for (const m of movZ) skus.add(m.material.replace(/P$/i, ""));
  const M = maestro([...pa.filas, ...pb.filas], await productosDe([...skus]));
  const hl = (un: number, sku: string) => convertir(un, sku, "hl", M) ?? 0;

  /* Notificado en HL por día de contabilización. */
  const notifDia = new Map<string, number>();
  for (const m of movZ) {
    const q = m.clase === "Z02" ? -Math.abs(m.cantidad) : m.cantidad;
    notifDia.set(m.fecha_contab, (notifDia.get(m.fecha_contab) ?? 0) + hl(q, m.material.replace(/P$/i, "")));
  }

  const semana = (lunes: string, ps: typeof pa): ResumenSemana => {
    const P = papeles(ps.planes);
    const ini = P.inicial ? ps.filas.filter((f) => f.plan_id === P.inicial!.id) : [];
    const suma = (fs: FilaPlanBD[], dia: string, peso: (f: FilaPlanBD) => number = () => 1) => fs.reduce((a, f) => a + (f.fecha === dia ? Number(f.hl) * peso(f) : 0), 0);
    const dias: DiaSemana[] = [];
    for (let i = 0; i < 7; i++) {
      const dia = masDias(lunes, i);
      const c = P.corteDe(dia);
      const vig = c ? ps.filas.filter((f) => f.plan_id === c.id) : ini;
      const planVig = suma(vig, dia);
      const planHasta = dia < hoy ? planVig : dia > hoy ? 0 : suma(vig, dia, (f) => (f.hora < hh ? 1 : f.hora === hh ? mm / 60 : 0));
      dias.push({ dia, planIni: suma(ini, dia), planVig, planHasta, notif: dia > hoy ? 0 : notifDia.get(dia) ?? 0, estado: estadoDia(dia, u.valor, hoy) });
    }
    const t = (k: keyof DiaSemana) => dias.reduce((a, d) => a + (d[k] as number), 0);
    const domingo = masDias(lunes, 6);
    const cerrada = !!u.valor && u.valor >= `${masDias(lunes, 7)}T06:00:00`;
    return {
      lunes, domingo, semana: P.inicial?.semana ?? ps.planes[0]?.semana ?? null,
      estado: !ps.planes.length ? "sin plan" : domingo >= hoy ? "en curso" : cerrada ? "cerrada" : "abierta",
      dias, planIni: t("planIni"), planVig: t("planVig"), planHasta: t("planHasta"), notif: t("notif"),
    };
  };
  return { semanas: [semana(pasada, pa), semana(actual, pb)], mb51: u.valor, error };
}
