import { balanceDelDia, cruzaConCasco, type FilaBalance, type LineaConsolidado } from "@/modulos/inventario/balance";

/**
 * LAS ALERTAS DEL BALANCE — el Balance de un día contra el del DÍA ANTERIOR CON CONTEO ENVIADO.
 *
 * «Ayer tenía en el balance en extrasucio 34 y hoy esos 34 no los contaron en el inventario: yo no soy adivina,
 *  quiero una hojita aparte donde pueda ver esas alertas comparando con el día anterior para saber si me toca hacer
 *  un ajuste o reasignar.»
 *
 * Se compara cada «material · estado · zona» (la misma fila del Balance) y salen solo DOS alertas, las que piden decisión:
 *   · SIN CONTAR      el conteo de ese material y estado bajó y Control no bajó lo mismo → ¿no lo contaron? (recontar o ajustar)
 *   · REASIGNACIÓN    lo que bajó en un estado SUBIÓ en otro (misma zona y material) → ¿lo contaron con otro estado?
 * Solo lee lo que el Balance ya calcula: no toca ninguna cuenta.
 */
export type TipoAlerta = "sin_contar" | "reasignacion";
export type Lado = { conteo: number; casco: number; ajuste: number; dif: number };
export type Alerta = {
  id: string; tipo: TipoAlerta;
  alcance: string; zona: "Fábrica" | "Bodega 38"; estado: string; codigo: string; material: string | null;
  ayer: Lado; hoy: Lado;
  /** Las cajas de la alerta (lo que no se contó, lo que se movió de estado, o la diferencia). */
  cajas: number; estibas: number | null; unidades: number | null;
  /** Solo REASIGNACIÓN: a qué estado apareció esa cantidad. */
  haciaEstado: string | null;
  donde: string; accion: string; detalle: string;
};
export type DatosAlertas = {
  fecha: string | null; anterior: string | null; dias: string[];
  alertas: Alerta[]; filasHoy: number; filasAyer: number; error: string | null;
};

const EPS = 0.5;
const r1 = (v: number) => Math.round(v * 10) / 10;
const llave = (f: Pick<FilaBalance, "estado" | "alcance" | "codigo">) => `${f.estado}|${f.alcance}|${f.codigo}`;
const lado = (f?: FilaBalance): Lado => (f ? { conteo: f.fisico_cajas, casco: f.cajas_casco, ajuste: f.ajuste_cajas, dif: f.dif_cajas } : { conteo: 0, casco: 0, ajuste: 0, dif: 0 });
const zonaDe = (alcance: string) => (alcance === "SORTING" ? "Fábrica" as const : "Bodega 38" as const);
const n0 = (v: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(v);

/** Por «material · estado · zona»: de qué ubicaciones salen las cajas (del consolidado del día). */
function ubicaciones(lineas: LineaConsolidado[]) {
  const m = new Map<string, Map<string, number>>();
  for (const l of lineas) {
    const k = `${l.codigo}|${l.estado}|${l.zona}`;
    const u = m.get(k) ?? new Map<string, number>();
    u.set(l.ubicacion, (u.get(l.ubicacion) ?? 0) + l.cajas);
    m.set(k, u);
  }
  return m;
}
const texto = (u?: Map<string, number>, solo?: Set<string>) =>
  [...(u ?? [])].filter(([k]) => !solo || solo.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k} (${n0(c)})`).join(", ");

export async function alertasBalance(pedida?: string | null): Promise<DatosAlertas> {
  const hoy = await balanceDelDia(pedida);
  const vacio: DatosAlertas = { fecha: hoy.fecha, anterior: null, dias: hoy.dias, alertas: [], filasHoy: hoy.detalle.length, filasAyer: 0, error: hoy.error };
  if (!hoy.fecha || hoy.error) return vacio;
  const i = hoy.dias.indexOf(hoy.fecha);
  const anterior = hoy.dias[i + 1] ?? null;
  if (!anterior) return vacio;
  const ayer = await balanceDelDia(anterior);
  if (ayer.error) return { ...vacio, anterior, error: ayer.error };

  const filasH = new Map(hoy.detalle.map((f) => [llave(f), f]));
  const filasA = new Map(ayer.detalle.map((f) => [llave(f), f]));
  const claves = [...new Set([...filasH.keys(), ...filasA.keys()])];
  const ubH = ubicaciones(hoy.consolidado), ubA = ubicaciones(ayer.consolidado);

  type Info = { k: string; f: FilaBalance; H: Lado; A: Lado; dC: number; perdio: number; gano: number };
  const infos = new Map<string, Info>();
  for (const k of claves) {
    const f = filasH.get(k) ?? filasA.get(k)!;
    const H = lado(filasH.get(k)), A = lado(filasA.get(k));
    const dC = H.conteo - A.conteo;
    infos.set(k, { k, f, H, A, dC, perdio: dC < -EPS ? -dC : 0, gano: dC > EPS ? dC : 0 });
  }

  const alertas: Alerta[] = [];
  const participa = new Set<string>();
  const perdidoRestante = new Map<string, number>();
  const cajasA = (f: FilaBalance, cajas: number) => ({
    cajas, estibas: f.cajas_estiba ? r1(cajas / f.cajas_estiba) : null, unidades: f.un_caja ? cajas * f.un_caja : null,
  });
  const base = (info: Info) => ({
    alcance: info.f.alcance, zona: zonaDe(info.f.alcance), estado: info.f.estado, codigo: info.f.codigo, material: info.f.material,
    ayer: info.A, hoy: info.H,
  });

  /* ---- REASIGNACIÓN: lo que bajó en un estado y subió en otro (misma zona y material) ---- */
  const grupos = new Map<string, Info[]>();
  for (const x of infos.values()) { const g = `${x.f.alcance}|${x.f.codigo}`; (grupos.get(g) ?? grupos.set(g, []).get(g)!).push(x); }
  for (const lista of grupos.values()) {
    const bajan = lista.filter((x) => x.perdio > 0).sort((a, b) => b.perdio - a.perdio);
    const suben = lista.filter((x) => x.gano > 0).sort((a, b) => b.gano - a.gano);
    const resto = new Map(suben.map((x) => [x.k, x.gano]));
    for (const b of bajan) {
      let falta = b.perdio;
      for (const s of suben) {
        const disp = resto.get(s.k) ?? 0;
        const m = Math.min(falta, disp);
        if (m < EPS) continue;
        if (!cruzaConCasco(b.f.estado, b.f.alcance) && !cruzaConCasco(s.f.estado, s.f.alcance)) continue;
        resto.set(s.k, disp - m); falta -= m;
        participa.add(b.k); participa.add(s.k);
        const dondeA = texto(ubA.get(`${b.f.codigo}|${b.f.estado}|${zonaDe(b.f.alcance)}`));
        const dondeH = texto(ubH.get(`${s.f.codigo}|${s.f.estado}|${zonaDe(s.f.alcance)}`));
        alertas.push({
          id: `re|${b.k}|${s.f.estado}`, tipo: "reasignacion", ...base(b), ...cajasA(b.f, m), haciaEstado: s.f.estado,
          donde: [dondeA && `Ayer en ${b.f.estado}: ${dondeA}`, dondeH && `Hoy en ${s.f.estado}: ${dondeH}`].filter(Boolean).join(" · "),
          accion: `Reasignar en Consolidado: pasar ${n0(m)} cajas de ${b.f.estado} a ${s.f.estado}`,
          detalle: `En ${b.f.estado} el conteo bajó ${n0(b.perdio)} cajas y en ${s.f.estado} subió ${n0(s.gano)}: parece que lo contaron con otro estado.`,
        });
      }
      perdidoRestante.set(b.k, falta);
    }
  }

  /* ---- SIN CONTAR · DIFERENCIA NUEVA · PERSISTE (solo donde hay casco que comparar) ---- */
  for (const x of infos.values()) {
    if (!cruzaConCasco(x.f.estado, x.f.alcance)) continue;
    if (participa.has(x.k)) continue;
    const rem = perdidoRestante.get(x.k) ?? x.perdio;
    const cascoBajo = Math.max(0, x.A.casco - x.H.casco);
    const sinContar = Math.min(rem - cascoBajo, -x.H.dif);
    if (rem > EPS && sinContar > EPS && x.H.dif < -EPS) {
      const quedan = new Set([...(ubH.get(`${x.f.codigo}|${x.f.estado}|${zonaDe(x.f.alcance)}`)?.keys() ?? [])]);
      const ayerU = ubA.get(`${x.f.codigo}|${x.f.estado}|${zonaDe(x.f.alcance)}`);
      const falto = new Set([...(ayerU?.keys() ?? [])].filter((u) => !quedan.has(u)));
      const donde = texto(ayerU, falto.size ? falto : undefined);
      alertas.push({
        id: `sc|${x.k}`, tipo: "sin_contar", ...base(x), ...cajasA(x.f, sinContar), haciaEstado: null,
        donde: donde ? `Ayer estaba en: ${donde}` : "Sin ubicaciones contadas hoy",
        accion: "Recontar esa ubicación; si de verdad no está, ajuste en Balance",
        detalle: `El conteo pasó de ${n0(x.A.conteo)} a ${n0(x.H.conteo)} cajas y Control sigue en ${n0(x.H.casco)}.`,
      });
      continue;
    }
  }

  const orden: Record<TipoAlerta, number> = { sin_contar: 0, reasignacion: 1 };
  alertas.sort((a, b) => orden[a.tipo] - orden[b.tipo] || b.cajas - a.cajas || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  return { fecha: hoy.fecha, anterior, dias: hoy.dias, alertas, filasHoy: hoy.detalle.length, filasAyer: ayer.detalle.length, error: null };
}
