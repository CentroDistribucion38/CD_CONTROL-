/**
 * EL CIERRE DE TIEMPOS DE CONTEO — las cuentas del informe que se comparte (módulo puro, sin React).
 *
 * Parte de las mismas filas del tablero (`conteo_tiempos`) y de las mismas cuentas (`ranking`, `porHora`), así que
 * lo que sale en la foto es lo que se ve en la pantalla. Aquí solo se ordena: el ranking, y la LÍNEA DE TIEMPO
 * —cada conteo con su hora de inicio y de final, día por día y de la más temprana a la más tarde—.
 */
import { duracion, estadoConteo, horaCo, porHora, ranking, type Estado, type FilaTiempo, type Posicion } from "./tiempos";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const diaTxt = (iso: string) => { const f = new Date(iso + "T12:00:00Z"); return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} ${MES[f.getUTCMonth()]}` };
export const periodoTxt = (desde: string, hasta: string) => (desde === hasta ? diaTxt(desde) : `${diaTxt(desde)} – ${diaTxt(hasta)}`);

export type ConteoLinea = {
  id: string; persona: string; dia: string;
  /** Minutos desde la medianoche (hora de Colombia) a los que se anotó el primer renglón. */
  ini: number; dur: number;
  horaIni: string; horaFin: string;
  estado: Estado; renglones: number; activoMin: number; rph: number | null;
};
export type DiaLinea = { dia: string; filas: ConteoLinea[]; renglones: number };
export type CierreTiempos = {
  conteos: number; renglones: number; activoMin: number; pausasMin: number; rph: number | null;
  personas: number; sinEnviar: number; rank: Posicion[]; dias: DiaLinea[];
  /** El eje de horas de la línea de tiempo, en minutos desde la medianoche, a horas cerradas. */
  eje: { ini: number; fin: number };
};

const aMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return ((h % 24) * 60) + (m || 0) };

export function armarCierreTiempos(filas: FilaTiempo[], ahora: number = Date.now()): CierreTiempos {
  const hechos = filas.filter((f) => f.enviado);
  const tot = hechos.reduce((a, f) => ({ r: a.r + f.renglones, act: a.act + Number(f.activo_min), pau: a.pau + Number(f.pausas_min) }), { r: 0, act: 0, pau: 0 });
  const rank = ranking(filas);

  const porDia = new Map<string, ConteoLinea[]>();
  let minIni = 24 * 60, maxFin = 0;
  for (const f of [...filas].sort((a, b) => a.primer_renglon.localeCompare(b.primer_renglon))) {
    const estado = estadoConteo(f, ahora);
    const ini = aMin(horaCo(f.primer_renglon));
    const finIso = f.enviado ? f.fin : f.ultimo_renglon;
    const dur = Math.max(1, finIso ? Math.round((new Date(finIso).getTime() - new Date(f.primer_renglon).getTime()) / 60000) : 1);
    const l: ConteoLinea = {
      id: f.conteo_id, persona: f.persona ?? "Sin nombre", dia: f.dia, ini, dur,
      horaIni: horaCo(f.primer_renglon), horaFin: finIso ? horaCo(finIso) : "—",
      estado, renglones: f.renglones, activoMin: Number(f.activo_min), rph: porHora(f.renglones, Number(f.activo_min)),
    };
    minIni = Math.min(minIni, ini); maxFin = Math.max(maxFin, Math.min(24 * 60, ini + dur));
    const a = porDia.get(f.dia) ?? []; a.push(l); porDia.set(f.dia, a);
  }
  const dias = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, fs]) => ({ dia, filas: fs, renglones: fs.reduce((t, x) => t + x.renglones, 0) }));
  let ei = Math.floor(minIni / 60) * 60, ef = Math.ceil(maxFin / 60) * 60;
  if (!dias.length) { ei = 6 * 60; ef = 18 * 60 }
  if (ef - ei < 180) ef = Math.min(24 * 60, ei + 180);
  if (ef - ei < 180) ei = Math.max(0, ef - 180);
  return {
    conteos: hechos.length, renglones: tot.r, activoMin: tot.act, pausasMin: tot.pau, rph: porHora(tot.r, tot.act),
    personas: rank.length, sinEnviar: filas.length - hechos.length, rank, dias, eje: { ini: ei, fin: ef },
  };
}

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const num = (n: number) => nf.format(n);
export const num1 = (n: number | null) => (n == null ? "—" : nf1.format(n));
export const horasEje = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;
export const lineasObs = (txt: string) => txt.split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
export const marcaEstado = (e: Estado) => (e === "enviado" ? "" : e === "en_curso" ? "en curso" : e === "cerrado" ? "cerrado sin enviar" : "sin enviar");

/** El informe como texto, para pegarlo en un mensaje. Las mismas cifras que la foto. */
export function textoCierreTiempos(c: CierreTiempos, titulo: string, periodo: string, generado: Date, obs: string[]): string {
  const hora = generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const L: string[] = [];
  L.push(`${titulo.toUpperCase()} · ${periodo} · foto de las ${hora}`, "");
  L.push(`${num1(c.rph)} renglones por hora activa · ${num(c.conteos)} conteos enviados · ${num(c.renglones)} renglones · ${duracion(c.activoMin)} de trabajo activo${c.sinEnviar ? ` · ${c.sinEnviar} sin enviar` : ""}`, "");
  L.push("RANKING · renglones por hora activa");
  c.rank.forEach((p, i) => L.push(`${p.rph == null ? "·" : i + 1}. ${p.persona} — ${num1(p.rph)} rengl./h · ${p.conteos} conteo${p.conteos === 1 ? "" : "s"} · ${num(p.renglones)} renglones · ${duracion(p.activo_min)} activo`));
  L.push("", "LÍNEA DE TIEMPO · inicio → final");
  for (const d of c.dias) {
    L.push(`${diaTxt(d.dia)} · ${d.filas.length} conteo${d.filas.length === 1 ? "" : "s"} · ${num(d.renglones)} renglones`);
    for (const f of d.filas) {
      const m = marcaEstado(f.estado);
      L.push(`  ${f.horaIni} → ${f.horaFin} · ${f.persona} · ${duracion(f.dur)} · ${num(f.renglones)} rengl. · ${num1(f.rph)}/h${m ? ` · ${m}` : ""}`);
    }
  }
  if (obs.length) { L.push("", "OBSERVACIONES"); obs.forEach((o) => L.push(`- ${o}`)) }
  return L.join("\n");
}
