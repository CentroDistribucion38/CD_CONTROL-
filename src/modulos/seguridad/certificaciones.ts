/**
 * SEGURIDAD · CERTIFICACIONES — LICENCIAS VACA («Licencia para cuidar»).
 *
 * «Tomar como variable solo el departamento de LOGÍSTICA; a cierto grupo de personas se le asigna el interventor y el
 *  coordinador para uno saber a quién exigirle; que emita una alerta con un mes de antelación de quién se va a vencer;
 *  una dashboard para copiar y pegar.»
 *
 * Aquí está TODA la cuenta, sin base y sin pantalla (funciones puras): qué es una licencia vencida, por vencer o
 * vigente; quién cuenta para las alertas; a quién se le exige; el radar de los próximos días y la imagen para compartir.
 *
 * LA LICENCIA DURA 180 DÍAS desde la expedición (la fórmula del Excel). Si el archivo trae una fecha de vencimiento
 * escrita a mano, manda esa. Los días de aviso (30) y la vigencia (180) son del Maestro, no de este archivo.
 *
 * QUIÉN CUENTA PARA LAS ALERTAS: el que está trabajando (ACTIVO). Un NO ACTIVO o en VACACIONES con la licencia
 * vencida no es una alerta de hoy: no está entrando. Un BLOQUEADO se cuenta aparte: no entra, tenga o no licencia.
 */

export const PERMISOS = [
  { k: "ALTURA", t: "Altura" },
  { k: "CALIENTE", t: "Caliente" },
  { k: "SQ", t: "SQ" },
  { k: "360", t: "$360" },
  { k: "ELECTRICO", t: "Eléctrico" },
  { k: "EC", t: "EC" },
  { k: "IZAJE", t: "Izaje" },
  { k: "HPRM", t: "HPRM" },
] as const;
export type Permiso = (typeof PERMISOS)[number]["k"];

export const ESTADOS = ["ACTIVO", "VACACIONES", "NO ACTIVO", "BLOQUEADO"] as const;
export type Estado = (typeof ESTADOS)[number];

export type PersonaCert = {
  cedula: string;
  nombre: string;
  empresa: string;
  departamento: string;
  permisos: string[];
  expedicion: string;          // yyyy-mm-dd
  vencimiento: string;         // yyyy-mm-dd
  sop?: string | null;
  nivel?: string | null;
  validador?: string | null;
  estado: string;
  motivo?: string | null;
  /** A quién se le exige: el de su grupo si está en uno; si no, el de su empresa. */
  interventor?: string | null;
  coordinador?: string | null;
  empresa_id?: string | null;
  grupo_id?: string | null;
  grupo?: string | null;
  /** Cuántas validaciones tiene (1 = nunca ha renovado). */
  validaciones?: number;
};

export type ConfigCert = { diasAviso: number; diasCriticos: number; vigencia: number };
export const CONFIG_CERT: ConfigCert = { diasAviso: 30, diasCriticos: 7, vigencia: 180 };

export type Urgencia = "vencida" | "critica" | "aviso" | "vigente";
/** LOS TONOS DE LOS INFORMES (los del tablero de casco): carbón, ocre, amarillo y crema. `color` es el relleno,
 *  `texto` el color para escribir sobre blanco y `sobre` el del texto encima del relleno. El rojo de Bavaria queda
 *  solo para las cifras que van mal. */
export const URGENCIA: Record<Urgencia, { t: string; color: string; texto: string; sobre: string; suave: string }> = {
  vencida: { t: "Vencida", color: "#3B3B3B", texto: "#2A2A2A", sobre: "#FFFFFF", suave: "#E6E6E6" },
  critica: { t: "Vence en 7 días o menos", color: "#B58200", texto: "#8A6300", sobre: "#FFFFFF", suave: "#F3E3B8" },
  aviso: { t: "Vence este mes", color: "#FFC300", texto: "#8A6300", sobre: "#1B1B1B", suave: "#FFF1C2" },
  vigente: { t: "Vigente", color: "#FFDCA3", texto: "#7A5A1E", sobre: "#1B1B1B", suave: "#FFF6E3" },
};
export const ROJO = "#C8102E";

/* ------------------------------ fechas ------------------------------ */
const DIA = 86_400_000;
const aUtc = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
export const diasEntre = (desde: string, hasta: string) => Math.round((aUtc(hasta) - aUtc(desde)) / DIA);
export const masDias = (f: string, n: number) => new Date(aUtc(f) + n * DIA).toISOString().slice(0, 10);
export const hoyCo = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const SEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const fechaCorta = (f: string) => `${Number(f.slice(8, 10))}-${MESES[Number(f.slice(5, 7)) - 1]}`;
export const diaSemana = (f: string) => SEM[new Date(aUtc(f)).getUTCDay()];

/* ------------------------------ nombres ------------------------------ */
/** «EASY LOGISTICA » y «Easy Logística» son la misma empresa: sin espacios de más, sin tildes, en mayúsculas. */
export const claveTexto = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
export const bonito = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

/* ------------------------------ la cuenta ------------------------------ */
export function urgencia(dias: number, c: ConfigCert = CONFIG_CERT): Urgencia {
  return dias < 0 ? "vencida" : dias <= c.diasCriticos ? "critica" : dias <= c.diasAviso ? "aviso" : "vigente";
}
/** Trabajando = ACTIVO. Vacaciones, no activo y bloqueado no entran hoy: no son una alerta de hoy. */
export const trabaja = (estado: string) => claveTexto(estado) === "ACTIVO";
export const bloqueado = (estado: string) => claveTexto(estado) === "BLOQUEADO";

export type Alerta = PersonaCert & { dias: number; urgencia: Urgencia };
export type GrupoExigir = {
  /** «Interventor · Coordinador» o «Sin responsable asignado». */
  clave: string; interventor: string | null; coordinador: string | null;
  empresas: { empresa: string; personas: Alerta[] }[];
  total: number; vencidas: number; criticas: number;
};
export type TableroCert = {
  hoy: string; config: ConfigCert;
  total: number; activos: number; bloqueados: number;
  vencidas: number; criticas: number; avisos: number;
  /** Cada día de hoy a hoy + días de aviso: quiénes vencen ese día. */
  radar: { fecha: string; personas: Alerta[] }[];
  alertas: Alerta[];
  grupos: GrupoExigir[];
  porEmpresa: { empresa: string; activos: number; alertas: number; vencidas: number }[];
  /** Vencidas o por vencer en el mes, por semana (para ver cuándo se viene la ola). */
};

export function armarTablero(personas: PersonaCert[], hoy: string, config: ConfigCert = CONFIG_CERT): TableroCert {
  const activos = personas.filter((p) => trabaja(p.estado));
  const alertas: Alerta[] = activos
    .map((p) => { const dias = diasEntre(hoy, p.vencimiento); return { ...p, dias, urgencia: urgencia(dias, config) } })
    .filter((a) => a.urgencia !== "vigente")
    .sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre, "es"));

  const radar = Array.from({ length: config.diasAviso + 1 }, (_, i) => {
    const fecha = masDias(hoy, i);
    return { fecha, personas: alertas.filter((a) => a.vencimiento === fecha) };
  });

  /* A QUIÉN EXIGIRLE: por interventor y coordinador; adentro, por empresa. Los sin asignar, al final. */
  const g = new Map<string, GrupoExigir>();
  for (const a of alertas) {
    const iv = bonito(a.interventor) || null, co = bonito(a.coordinador) || null;
    const clave = iv || co ? `${iv ?? "—"} · ${co ?? "—"}` : "Sin responsable asignado";
    const x = g.get(clave) ?? g.set(clave, { clave, interventor: iv, coordinador: co, empresas: [], total: 0, vencidas: 0, criticas: 0 }).get(clave)!;
    const emp = bonito(a.empresa);
    let e = x.empresas.find((z) => claveTexto(z.empresa) === claveTexto(emp));
    if (!e) x.empresas.push(e = { empresa: emp, personas: [] });
    e.personas.push(a);
    x.total++; if (a.urgencia === "vencida") x.vencidas++; if (a.urgencia === "critica") x.criticas++;
  }
  const grupos = [...g.values()]
    .map((x) => ({ ...x, empresas: x.empresas.sort((a, b) => b.personas.length - a.personas.length) }))
    .sort((a, b) => Number(a.clave === "Sin responsable asignado") - Number(b.clave === "Sin responsable asignado") || b.vencidas - a.vencidas || b.total - a.total);

  const pe = new Map<string, { empresa: string; activos: number; alertas: number; vencidas: number }>();
  for (const p of activos) {
    const k = claveTexto(p.empresa);
    const x = pe.get(k) ?? pe.set(k, { empresa: bonito(p.empresa), activos: 0, alertas: 0, vencidas: 0 }).get(k)!;
    x.activos++;
  }
  for (const a of alertas) { const x = pe.get(claveTexto(a.empresa)); if (x) { x.alertas++; if (a.urgencia === "vencida") x.vencidas++ } }

  return {
    hoy, config, total: personas.length, activos: activos.length, bloqueados: personas.filter((p) => bloqueado(p.estado)).length,
    vencidas: alertas.filter((a) => a.urgencia === "vencida").length,
    criticas: alertas.filter((a) => a.urgencia === "critica").length,
    avisos: alertas.filter((a) => a.urgencia === "aviso").length,
    radar, alertas, grupos,
    porEmpresa: [...pe.values()].sort((a, b) => b.alertas - a.alertas || b.activos - a.activos),
  };
}

export const permisosTexto = (p: string[]) => p.map((k) => PERMISOS.find((x) => x.k === k)?.t ?? k).join(" · ");
export const diasTexto = (d: number) => (d < 0 ? `venció hace ${-d} ${d === -1 ? "día" : "días"}` : d === 0 ? "vence hoy" : d === 1 ? "vence mañana" : `vence en ${d} días`);

/* =============================== COPIAR (WhatsApp / correo) ===============================
 * TRES LISTAS, UNA POR COLUMNA: vencidas y trabajando, vencen en 7 días, vencen este mes. Cada una se copia sola
 * y va por la cadena del aviso: Interventor ABI → su Coordinador de la contratista → empresa → personas numeradas. */
const LISTA: Record<Exclude<Urgencia, "vigente">, { punto: string; titulo: (c: ConfigCert) => string; nota: string }> = {
  vencida: { punto: "⚫", titulo: () => "VENCIDAS Y TRABAJANDO", nota: "Exigir hoy: sin licencia vigente no pueden seguir trabajando." },
  critica: { punto: "🟤", titulo: (c) => `VENCEN EN ${c.diasCriticos} DÍAS`, nota: "Renovar esta semana." },
  aviso: { punto: "🟡", titulo: () => "VENCEN ESTE MES", nota: "Programar la renovación antes de la fecha." },
};
const cuando = (a: Alerta) =>
  a.dias < 0 ? `venció ${fechaCorta(a.vencimiento)} (hace ${-a.dias} ${a.dias === -1 ? "día" : "días"})`
    : a.dias === 0 ? `vence HOY ${fechaCorta(a.vencimiento)}`
      : `vence ${fechaCorta(a.vencimiento)} (${a.dias === 1 ? "mañana" : `en ${a.dias} días`})`;

/** Una lista: solo las personas de esa columna, por responsable y empresa. */
export function textoLista(t: TableroCert, u: Exclude<Urgencia, "vigente">, deptos = "LOGÍSTICA"): string {
  const L0 = LISTA[u];
  const gente = t.alertas.filter((a) => a.urgencia === u);
  const L: string[] = [`${L0.punto} *${L0.titulo(t.config)} · ${gente.length}*`, `Licencias VACA · ${deptos} · ${fechaCorta(t.hoy)}`];
  if (!gente.length) { L.push("", "Nadie en esta lista. ✅"); return L.join("\n") }
  L.push(`_${L0.nota}_`);
  /* LA CADENA: interventor → sus coordinadores → empresas → personas. Los sin asignar, al final. */
  type Emp = Map<string, Alerta[]>;
  const ivs = new Map<string, Map<string, Emp>>();
  for (const a of gente) {
    const iv = bonito(a.interventor), co = bonito(a.coordinador);
    const cos = ivs.get(iv) ?? ivs.set(iv, new Map()).get(iv)!;
    const emp = cos.get(co) ?? cos.set(co, new Map()).get(co)!;
    const e = bonito(a.empresa).toUpperCase();
    emp.set(e, [...(emp.get(e) ?? []), a]);
  }
  const cuenta = (m: Map<string, unknown>): number =>
    [...m.values()].reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : cuenta(v as Map<string, unknown>)), 0);
  const orden = <T,>(m: Map<string, T>) => [...m].sort((a, b) => Number(a[0] === "") - Number(b[0] === "") || cuenta(b[1] as Map<string, unknown>) - cuenta(a[1] as Map<string, unknown>) || a[0].localeCompare(b[0], "es"));
  let n = 0;
  for (const [iv, cos] of orden(ivs)) {
    L.push("");
    L.push(iv ? `👷 *Interventor ABI: ${iv}* (${cuenta(cos)})` : `👷 *Sin Interventor ABI asignado* (${cuenta(cos)})`);
    for (const [co, emps] of orden(cos)) {
      L.push(co ? `↳ *Coordinador: ${co}*` : "↳ *Sin coordinador asignado*");
      for (const [emp, lista] of [...emps].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "es"))) {
        L.push(`_${emp}_ (${lista.length})`);
        for (const a of lista) L.push(`${++n}. ${bonito(a.nombre).toUpperCase()} · CC ${a.cedula} · ${cuando(a)}`);
      }
    }
  }
  return L.join("\n");
}

/** Las tres listas seguidas, en orden de urgencia. */
export function textoAlertas(t: TableroCert, deptos = "LOGÍSTICA"): string {
  return [
    `*LICENCIAS VACA · ${deptos}* — ${fechaCorta(t.hoy)}`,
    `⚫ Vencidas trabajando: ${t.vencidas} · 🟤 Vencen en ${t.config.diasCriticos} días: ${t.criticas} · 🟡 Vencen este mes: ${t.avisos}`,
    ...(["vencida", "critica", "aviso"] as const).map((u) => "\n— — — — —\n" + textoLista(t, u, deptos)),
  ].join("\n");
}

/* =============================== INDICADORES =============================== */
export type ValidacionHist = { cedula: string; expedicion: string; vencimiento: string; validador: string | null };
export type Indicadores = {
  activos: number; alDia: number; cumplimiento: number; vencidas: number;
  renovaciones: number; aTiempo: number;
  validadasMes: number; validadasMesAnterior: number; diasPromedio: number;
  semanas: { desde: string; vencen: number }[]; ritmo: number;
  cobertura: { k: string; t: string; hoy: number; en30: number }[];
  empresas: { empresa: string; activos: number; alDia: number; pct: number }[];
  calor: { empresa: string; semanas: number[] }[];
  meses: { mes: string; n: number }[];
  validadores: { nombre: string; n: number }[];
  niveles: { nivel: string; n: number }[];
  bloqueos: { motivo: string; n: number }[]; bloqueados: number;
};
const MESES_L = MESES;
export function armarIndicadores(personas: PersonaCert[], hist: ValidacionHist[], hoy: string, config: ConfigCert = CONFIG_CERT): Indicadores {
  const act = personas.filter((p) => trabaja(p.estado));
  const vigente = (p: PersonaCert, f = hoy) => p.vencimiento >= f;
  const alDia = act.filter((p) => vigente(p)).length;
  /* RENOVÓ A TIEMPO: la validación siguiente se expidió antes de que venciera la anterior. */
  const porCed = new Map<string, ValidacionHist[]>();
  for (const v of hist) (porCed.get(v.cedula) ?? porCed.set(v.cedula, []).get(v.cedula)!).push(v);
  let renov = 0, aTiempo = 0;
  for (const l of porCed.values()) {
    l.sort((a, b) => a.expedicion.localeCompare(b.expedicion));
    for (let i = 1; i < l.length; i++) { renov++; if (l[i].expedicion <= l[i - 1].vencimiento) aTiempo++ }
  }
  const mesDe = (f: string) => f.slice(0, 7);
  const mesHoy = hoy.slice(0, 7);
  const mesAnt = (() => { const y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}` })();
  /* LAS SEMANAS: de lunes a domingo, 12 hacia adelante desde la semana de hoy. */
  const dow = (new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10)))).getUTCDay() + 6) % 7;
  const lunes = masDias(hoy, -dow);
  const semanas = Array.from({ length: 12 }, (_, i) => {
    const desde = masDias(lunes, 7 * i), hasta = masDias(desde, 6);
    return { desde, vencen: act.filter((p) => p.vencimiento >= desde && p.vencimiento <= hasta).length };
  });
  const hace56 = masDias(hoy, -56);
  const ritmo = Math.round((hist.filter((v) => v.expedicion > hace56 && v.expedicion <= hoy).length / 8) * 10) / 10;
  const cobertura = PERMISOS.map((x) => ({
    k: x.k, t: x.t,
    hoy: act.filter((p) => p.permisos.includes(x.k) && vigente(p)).length,
    en30: act.filter((p) => p.permisos.includes(x.k) && vigente(p, masDias(hoy, config.diasAviso))).length,
  })).filter((x) => x.k !== "360").sort((a, b) => b.hoy - a.hoy);
  const em = new Map<string, { empresa: string; activos: number; alDia: number }>();
  for (const p of act) { const k = claveTexto(p.empresa); const x = em.get(k) ?? em.set(k, { empresa: bonito(p.empresa), activos: 0, alDia: 0 }).get(k)!; x.activos++; if (vigente(p)) x.alDia++ }
  const empresas = [...em.values()].map((x) => ({ ...x, pct: x.activos ? x.alDia / x.activos : 0 })).sort((a, b) => a.pct - b.pct || b.activos - a.activos);
  const top = [...em.values()].sort((a, b) => b.activos - a.activos).slice(0, 8);
  const calor = top.map((x) => ({
    empresa: x.empresa,
    semanas: semanas.map((s) => act.filter((p) => claveTexto(p.empresa) === claveTexto(x.empresa) && p.vencimiento >= s.desde && p.vencimiento <= masDias(s.desde, 6)).length),
  }));
  const meses = Array.from({ length: 12 }, (_, i) => {
    const y0 = Number(hoy.slice(0, 4)), m0 = Number(hoy.slice(5, 7)) - 11 + i;
    const y = y0 + Math.floor((m0 - 1) / 12), m = ((m0 - 1) % 12 + 12) % 12 + 1;
    const k = `${y}-${String(m).padStart(2, "0")}`;
    return { mes: MESES_L[m - 1], n: hist.filter((v) => mesDe(v.expedicion) === k).length };
  });
  const hace90 = masDias(hoy, -90);
  const vc = new Map<string, number>();
  for (const v of hist) if (v.expedicion > hace90 && v.validador) vc.set(bonito(v.validador), (vc.get(bonito(v.validador)) ?? 0) + 1);
  const nv = new Map<string, number>();
  for (const p of act) { const k = bonito(p.nivel ?? "Sin nivel"); const t = k.charAt(0).toUpperCase() + k.slice(1).toLowerCase(); nv.set(t, (nv.get(t) ?? 0) + 1) }
  const bl = new Map<string, number>();
  const bloqueados = personas.filter((p) => bloqueado(p.estado));
  for (const p of bloqueados) { const k = bonito(p.motivo) || "Sin motivo"; const t = k.charAt(0).toUpperCase() + k.slice(1).toLowerCase(); bl.set(t, (bl.get(t) ?? 0) + 1) }
  const vig = act.filter((p) => vigente(p));
  return {
    activos: act.length, alDia, cumplimiento: act.length ? alDia / act.length : 1, vencidas: act.length - alDia,
    renovaciones: renov, aTiempo,
    validadasMes: hist.filter((v) => mesDe(v.expedicion) === mesHoy).length,
    validadasMesAnterior: hist.filter((v) => mesDe(v.expedicion) === mesAnt).length,
    diasPromedio: vig.length ? Math.round(vig.reduce((t, p) => t + diasEntre(hoy, p.vencimiento), 0) / vig.length) : 0,
    semanas, ritmo, cobertura, empresas, calor, meses,
    validadores: [...vc].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    niveles: ["Avanzado", "Intermedio", "Básico"].map((nivel) => ({ nivel, n: nv.get(nivel) ?? 0 })),
    bloqueos: [...bl].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 6), bloqueados: bloqueados.length,
  };
}
