/**
 * 5S · EL DASHBOARD EN UNA IMAGEN — para copiar y pegar en WhatsApp o en un correo, como el de Pasivos y VACA.
 *
 *   ARRIBA   las cuatro cifras: cumplimiento contra la meta, áreas bajo la meta, la S más floja, el plan.
 *   CENTRO   cumplimiento por área (la peor arriba, con la raya de su meta) · las 5 S en columnas.
 *   ABAJO    semana a semana contra la meta · lo que más se repite como «no cumple».
 *
 * No calcula nada: pinta el mismo `Tablero5S` que la pantalla. Tonos de los informes: carbón lo que está bien,
 * rojo de Bavaria solo bajo la meta. 1800 × 1000 al doble de resolución.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, cabecera, espaciado, letra, pie, recortar, type Caja } from "@/modulos/foto";
import { piso, type Tablero5S } from "./tablero";

const CARBON = "#3B3B3B", ROJO = "#C8102E", AMARILLO = "#FFC300", RIEL = "#ECEEF1";
const n1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const pc = (v: number | null | undefined) => (v == null ? "—" : `${n1.format(v)} %`);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;

export function nombreDashboard5S(hoy: string, area: string) {
  return `Dashboard 5S - ${area.replace(/[\\/:*?"<>|]/g, "-")} - ${hoy}.png`;
}

export function dibujarDashboard5S(T: Tablero5S, o: {
  logo?: CanvasImageSource | null; paleta?: Paleta; periodo: string; area: string; desde: string; hasta: string; generado?: Date;
}): HTMLCanvasElement {
  const P = o.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const { ancho: W, alto: H, escala: S } = FOTO;
  const c = document.createElement("canvas");
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);

  const panel = (b: Caja, titulo: string, nota?: string) => {
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
    ctx.fillStyle = ACENTO; ctx.fillRect(b.x + 16, b.y + 19, 8, 8);
    letra(ctx, 800, 15); ctx.fillStyle = TINTA; ctx.textAlign = "left";
    espaciado(ctx, titulo.toUpperCase(), b.x + 32, b.y + 24);
    if (nota) { letra(ctx, 600, 12.5); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(nota, b.x + b.w - 16, b.y + 24) }
    return { x: b.x + 16, y: b.y + 48, w: b.w - 32, h: b.h - 62 };
  };

  cabecera(ctx, W, [o.periodo, o.area], P, o.logo, `Auditorías ${T.formato.nombre.split("·")[0].trim()} · CD38`,
    `Orden y aseo del ${corta(o.desde)} al ${corta(o.hasta)} · ${T.vista.length} ${T.vista.length === 1 ? "inspección" : "inspecciones"}`);

  const M = MARGEN, G = HUECO;
  /* ---------------- LAS CUATRO CIFRAS ---------------- */
  const Y0 = 106, HK = 138, WK = (W - 2 * M - 3 * G) / 4;
  const kpis: { t: string; v: string; sub: string; mal: boolean }[] = [
    { t: "Cumplimiento", v: pc(T.general), sub: `meta ${pc(T.metaRef)}`, mal: T.general != null && T.general < T.metaRef },
    { t: "Áreas bajo la meta", v: `${T.bajoMeta} de ${T.porArea.length}`, sub: T.porArea[0] && T.porArea[0].pct < T.porArea[0].meta ? `la más baja: ${T.porArea[0].nombre}` : "todas cumplen", mal: T.bajoMeta > 0 },
    { t: T.formato.clave === "5s" ? "La S más floja" : "La sección más floja", v: T.peorS ? `${T.peorS.corto} ${T.peorS.nombre}` : "—", sub: T.peorS ? pc(T.peorS.pct) : "", mal: !!T.peorS && T.peorS.pct! < T.metaRef },
    { t: "Cumplimiento del plan", v: pc(T.cumplePlan), sub: T.cerradas ? `${T.hechas} de ${T.cerradas} auditorías programadas` : "sin auditorías programadas", mal: T.cumplePlan != null && T.cumplePlan < 100 },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (WK + G);
    ctx.fillStyle = "#fff"; ctx.fillRect(x, Y0, WK, HK);
    ctx.strokeStyle = BORDE; ctx.strokeRect(x + .5, Y0 + .5, WK - 1, HK - 1);
    ctx.fillStyle = k.mal ? ROJO : AMARILLO; ctx.fillRect(x, Y0, WK, 6);
    letra(ctx, 700, 13); ctx.fillStyle = GRIS; ctx.textAlign = "left"; espaciado(ctx, k.t.toUpperCase(), x + 22, Y0 + 32, 1.2);
    letra(ctx, 900, k.v.length > 11 ? 40 : 56); ctx.fillStyle = k.mal ? ROJO : TINTA; ctx.fillText(recortar(ctx, k.v, WK - 44), x + 22, Y0 + 80);
    letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.fillText(recortar(ctx, k.sub, WK - 44), x + 22, Y0 + 118);
  });

  /* ---------------- POR ÁREA ---------------- */
  const Y1 = Y0 + HK + G, H1 = 372, WA = Math.round((W - 2 * M - G) * 0.62);
  {
    const r = panel({ x: M, y: Y1, w: WA, h: H1 }, "Cumplimiento por área", "la raya = meta del área");
    const max = Math.max(1, Math.floor(r.h / 34));
    const lista = T.porArea.slice(0, max);
    const fila = Math.min(62, r.h / Math.max(lista.length, 1));
    const xb = r.x + 250, wb = r.w - 250 - 170;
    lista.forEach((a, i) => {
      const y = r.y + i * fila + fila / 2;
      const malo = a.pct < a.meta;
      letra(ctx, 800, 15); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(recortar(ctx, a.nombre, 236), r.x, y - 7);
      letra(ctx, 500, 11.5); ctx.fillStyle = GRIS; ctx.fillText(recortar(ctx, `${a.responsable ?? "sin responsable"} · ${a.n} insp.`, 236), r.x, y + 10);
      ctx.fillStyle = RIEL; ctx.fillRect(xb, y - 7, wb, 14);
      ctx.fillStyle = malo ? ROJO : CARBON; ctx.fillRect(xb, y - 7, (wb * Math.min(100, a.pct)) / 100, 14);
      ctx.fillStyle = "#0d0d0d"; ctx.fillRect(xb + (wb * a.meta) / 100 - 1, y - 12, 2.5, 24);
      letra(ctx, 900, 19); ctx.fillStyle = malo ? ROJO : TINTA; ctx.textAlign = "right"; ctx.fillText(pc(a.pct), r.x + r.w - 76, y);
      letra(ctx, 600, 12); ctx.fillStyle = a.hallazgos ? ROJO : GRIS; ctx.fillText(a.hallazgos ? `${a.hallazgos} hall.` : "—", r.x + r.w, y);
    });
    if (T.porArea.length > max) { letra(ctx, 600, 12); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(`y ${T.porArea.length - max} áreas más`, r.x, r.y + r.h - 4) }
  }

  /* ---------------- LAS 5 S ---------------- */
  {
    const x0 = M + WA + G, w0 = W - M - x0;
    const r = panel({ x: x0, y: Y1, w: w0, h: H1 }, T.formato.clave === "5s" ? "Las 5 S" : "Por sección", `meta ${pc(T.metaRef)}`);
    const col = r.w / 5, alto = r.h - 70, base = r.y + 28 + alto;
    const p0 = piso(T.porS.map((x) => x.pct), T.metaRef), esc = (v: number) => (alto * Math.max(0, v - p0)) / (100 - p0);
    T.porS.forEach((s, i) => {
      const cx = r.x + col * i + col / 2, cw = Math.min(64, col * .55);
      const malo = s.pct != null && s.pct < T.metaRef;
      ctx.fillStyle = RIEL; ctx.fillRect(cx - cw / 2, base - alto, cw, alto);
      if (s.pct != null) { ctx.fillStyle = malo ? ROJO : CARBON; ctx.fillRect(cx - cw / 2, base - esc(s.pct), cw, esc(s.pct)) }
      letra(ctx, 900, 20); ctx.fillStyle = malo ? ROJO : TINTA; ctx.textAlign = "center";
      ctx.fillText(s.pct == null ? "—" : String(Math.round(s.pct)), cx, base - alto - 14);
      letra(ctx, 900, 16); ctx.fillStyle = TINTA; ctx.fillText(s.corto, cx, base + 20);
      letra(ctx, 500, 12); ctx.fillStyle = GRIS; ctx.fillText(s.nombre, cx, base + 38);
    });
    const ym = base - esc(T.metaRef);
    ctx.strokeStyle = "#0d0d0d"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(r.x, ym); ctx.lineTo(r.x + r.w, ym); ctx.stroke(); ctx.setLineDash([]);
    if (p0 > 0) { letra(ctx, 600, 11); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(`eje desde ${p0}`, r.x, base + 54) }
  }

  /* ---------------- SEMANA A SEMANA ---------------- */
  const Y2 = Y1 + H1 + G, H2 = H - Y2 - 34;
  {
    const r = panel({ x: M, y: Y2, w: WA, h: H2 }, "Semana a semana", "promedio de cada semana");
    const sem = T.semanas;
    const alto = r.h - 58, base = r.y + 28 + alto;
    const ancho = r.w / Math.max(sem.length, 8);
    const p0 = piso(sem.map((x) => x.pct), T.metaRef), esc = (v: number) => (alto * Math.max(0, v - p0)) / (100 - p0);
    sem.forEach((s, i) => {
      const x = r.x + i * ancho + ancho * .16, w = ancho * .68, h = esc(s.pct);
      const malo = s.pct < T.metaRef;
      ctx.fillStyle = malo ? ROJO : CARBON; ctx.fillRect(x, base - h, w, h);
      letra(ctx, 800, 13); ctx.textAlign = "center";
      if (h > 26) { ctx.fillStyle = "#fff"; ctx.fillText(String(Math.round(s.pct)), x + w / 2, base - h + 13) }
      else { ctx.fillStyle = TINTA; ctx.fillText(String(Math.round(s.pct)), x + w / 2, base - h - 10) }
      letra(ctx, 600, 11.5); ctx.fillStyle = GRIS; ctx.fillText(`S${s.s}`, x + w / 2, base + 14);
    });
    const ym = base - esc(T.metaRef);
    ctx.strokeStyle = "#0d0d0d"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(r.x, ym); ctx.lineTo(r.x + r.w, ym); ctx.stroke(); ctx.setLineDash([]);
    /* La etiqueta de la meta va en una cajita blanca, para que no se pise con los números de las columnas. */
    letra(ctx, 800, 12); const tm = `meta ${n1.format(T.metaRef)}`, wm = ctx.measureText(tm).width + 10;
    ctx.fillStyle = "#fff"; ctx.fillRect(r.x + r.w - wm, ym - 9, wm, 18);
    ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(tm, r.x + r.w - 5, ym);
    if (p0 > 0) { letra(ctx, 600, 11); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(`eje desde ${p0}`, r.x, r.y + 8) }
  }

  /* ---------------- LO QUE MÁS SE REPITE ---------------- */
  {
    const x0 = M + WA + G, w0 = W - M - x0;
    const r = panel({ x: x0, y: Y2, w: w0, h: H2 }, "Lo que más se repite", "veces que no cumple");
    const lista = T.repetidos.slice(0, 5);
    if (!lista.length) { letra(ctx, 600, 15); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText("Ningún punto se incumplió en el periodo.", r.x, r.y + 20) }
    const fila = r.h / 5, max = lista[0]?.n ?? 1;
    lista.forEach((x, i) => {
      const y = r.y + i * fila;
      ctx.fillStyle = AMARILLO; ctx.fillRect(r.x, y + 4, 34, 26);
      letra(ctx, 900, 11); ctx.fillStyle = "#1b1b1b"; ctx.textAlign = "center"; ctx.fillText(T.formato.secciones.find((z) => z.clave === x.s)?.corto ?? "", r.x + 17, y + 17);
      letra(ctx, 700, 13); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(recortar(ctx, x.pregunta, r.w - 100), r.x + 46, y + 11);
      ctx.fillStyle = RIEL; ctx.fillRect(r.x + 46, y + 25, r.w - 100, 6);
      ctx.fillStyle = ROJO; ctx.fillRect(r.x + 46, y + 25, ((r.w - 100) * x.n) / max, 6);
      letra(ctx, 900, 19); ctx.fillStyle = ROJO; ctx.textAlign = "right"; ctx.fillText(`${x.n}×`, r.x + r.w, y + 18);
    });
  }

  pie(ctx, W, H, o.generado ?? new Date(), T.formato.nombre.toUpperCase());
  return c;
}
