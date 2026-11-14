/**
 * LA IMAGEN DEL TABLERO DE LICENCIAS VACA — para copiar, compartir o descargar, como los cierres de turno.
 * Cabecera con el logo, el semáforo, el radar de los próximos días y la lista de a quién exigirle (por responsable y
 * empresa). Mismos colores de urgencia que la pantalla.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, cabecera, espaciado, letra, pie, recortar } from "@/modulos/foto";
import { URGENCIA, diaSemana, fechaCorta, permisosTexto, type TableroCert } from "./certificaciones";

type Extra = { paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date };

export function dibujarTableroCert(t: TableroCert, extra: Extra = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const W = FOTO.ancho, M = MARGEN, G = HUECO, ancho = W - 2 * M;

  const yK = 106, hK = 120;
  const yR = yK + hK + G, hR = 230;
  const yL = yR + hR + G;
  const hCabT = 40, hGrupo = 48, hEmp = 32, hFila = 34;
  const filas = t.grupos.reduce((n, g) => n + hGrupo + g.empresas.reduce((m, e) => m + hEmp + e.personas.length * hFila, 0), 0);
  const hL = 54 + hCabT + (filas || 60) + 10;
  const H = yL + hL + G + 34;

  const c = document.createElement("canvas");
  c.width = W * FOTO.escala; c.height = H * FOTO.escala;
  const ctx = c.getContext("2d")!;
  ctx.scale(FOTO.escala, FOTO.escala); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);

  cabecera(ctx, W, ["Logística", `Aviso ${t.config.diasAviso} días`], P, extra.logo, "Licencias VACA · alertas",
    `Licencia para cuidar · ${t.activos} personas trabajando · corte del ${fechaCorta(t.hoy)} de ${t.hoy.slice(0, 4)}`);

  /* ---------- EL SEMÁFORO ---------- */
  const vig = t.activos - t.vencidas - t.criticas - t.avisos;
  const wRoja = 420;
  ctx.fillStyle = URGENCIA.vencida.color; ctx.fillRect(M, yK, wRoja, hK);
  ctx.fillStyle = "#C8102E"; ctx.fillRect(M, yK + hK - 5, wRoja, 5);
  letra(ctx, 800, 13); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left"; espaciado(ctx, "VENCIDAS Y TRABAJANDO", M + 26, yK + 24, 1.3);
  letra(ctx, 900, 56); ctx.fillText(String(t.vencidas), M + 26, yK + 68);
  letra(ctx, 600, 13); ctx.fillText(t.vencidas ? "activos con la licencia vencida: exigir ya" : "nadie trabaja con la licencia vencida", M + 26, yK + hK - 20);
  const cifras: [string, number, string, string][] = [
    ["VENCEN EN 7 DÍAS", t.criticas, URGENCIA.critica.color, `${t.config.diasCriticos} días o menos`],
    ["VENCEN ESTE MES", t.avisos, URGENCIA.aviso.color, `de ${t.config.diasCriticos + 1} a ${t.config.diasAviso} días`],
    ["VIGENTES", vig, URGENCIA.vigente.color, `más de ${t.config.diasAviso} días`],
    ["BLOQUEADOS", t.bloqueados, "#8A94A3", "no entran"],
  ];
  const xC = M + wRoja + G, wC = (W - M - xC - G * 3) / 4;
  cifras.forEach(([k, n, col, sub], i) => {
    const x = xC + i * (wC + G);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x, yK, wC, hK);
    ctx.strokeStyle = BORDE; ctx.strokeRect(x + .5, yK + .5, wC - 1, hK - 1);
    ctx.fillStyle = col; ctx.fillRect(x, yK, 6, hK);
    letra(ctx, 800, 13); ctx.fillStyle = GRIS; espaciado(ctx, k, x + 22, yK + 24, 1.1);
    letra(ctx, 900, 44); ctx.fillStyle = col === URGENCIA.critica.color ? URGENCIA.critica.texto : col === "#8A94A3" ? "#5F6B79" : TINTA; ctx.fillText(String(n), x + 22, yK + 66);
    letra(ctx, 600, 13); ctx.fillStyle = GRIS; ctx.fillText(sub, x + 22, yK + hK - 20);
  });

  /* ---------- EL RADAR ---------- */
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(M, yR, ancho, hR);
  ctx.strokeStyle = BORDE; ctx.strokeRect(M + .5, yR + .5, ancho - 1, hR - 1);
  ctx.fillStyle = ACENTO; ctx.fillRect(M + 16, yR + 18, 10, 10);
  letra(ctx, 800, 15); ctx.fillStyle = TINTA; espaciado(ctx, `RADAR DE VENCIMIENTOS · PRÓXIMOS ${t.config.diasAviso} DÍAS`, M + 34, yR + 24);
  const cols = t.radar.length + 1, x0 = M + 16, wCol = (ancho - 32 - 14) / cols, base = yR + hR - 46, alto = hR - 110;
  const max = Math.max(1, t.vencidas, ...t.radar.map((d) => d.personas.length));
  const barra = (i: number, segs: string[], n: number, arriba: string, abajo: string, rojoFondo = false) => {
    const x = x0 + i * wCol + (i > 0 ? 14 : 0), w = wCol - 4;
    if (rojoFondo) { ctx.fillStyle = "#EDEDED"; ctx.fillRect(x - 2, yR + 44, w + 4, hR - 52) }
    const h = (alto / max);
    segs.forEach((col, k) => { ctx.fillStyle = col; ctx.fillRect(x + 2, base - (k + 1) * h + 1, w - 4, Math.max(2, h - 2)) });
    letra(ctx, 800, 12); ctx.fillStyle = TINTA; ctx.textAlign = "center";
    if (n) ctx.fillText(String(n), x + w / 2, base - segs.length * h - 10);
    ctx.fillStyle = TINTA; ctx.fillRect(x, base + 4, w, 2);
    letra(ctx, 800, 13); ctx.fillText(arriba, x + w / 2, base + 18);
    letra(ctx, 600, 10); ctx.fillStyle = GRIS; ctx.fillText(abajo, x + w / 2, base + 33);
    ctx.textAlign = "left";
  };
  barra(0, Array(t.vencidas).fill(URGENCIA.vencida.color), t.vencidas, "YA", "VENCIDAS", true);

  t.radar.forEach((d, i) => barra(i + 1, d.personas.map((p) => URGENCIA[p.urgencia].color), d.personas.length,
    String(Number(d.fecha.slice(8, 10))), i === 0 ? "HOY" : diaSemana(d.fecha).toUpperCase()));

  /* ---------- A QUIÉN EXIGIRLE ---------- */
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(M, yL, ancho, hL);
  ctx.strokeStyle = BORDE; ctx.strokeRect(M + .5, yL + .5, ancho - 1, hL - 1);
  ctx.fillStyle = ACENTO; ctx.fillRect(M + 16, yL + 22, 10, 10);
  letra(ctx, 800, 15); ctx.fillStyle = TINTA; espaciado(ctx, "A QUIÉN EXIGIRLE", M + 34, yL + 28);
  letra(ctx, 600, 13); ctx.fillStyle = GRIS; ctx.textAlign = "right";
  ctx.fillText(`${t.alertas.length} ${t.alertas.length === 1 ? "persona" : "personas"} con alerta`, W - M - 16, yL + 28); ctx.textAlign = "left";
  const xi = M + 16, wi = ancho - 32;
  const C = { dias: xi + 12, nom: xi + 130, ced: xi + wi * 0.42, perm: xi + wi * 0.54, emp: xi + wi * 0.74, vence: xi + wi - 12 };
  let y = yL + 54;
  ctx.fillStyle = TINTA; ctx.fillRect(xi, y, wi, hCabT);
  letra(ctx, 800, 11); ctx.fillStyle = "#FFFFFF";
  ([["DÍAS", C.dias], ["NOMBRE", C.nom], ["CÉDULA", C.ced], ["PERMISOS", C.perm], ["NIVEL", C.emp]] as const).forEach(([tx, x]) => espaciado(ctx, tx, x, y + hCabT / 2, .8));
  ctx.textAlign = "right"; ctx.fillText("VENCE", C.vence, y + hCabT / 2); ctx.textAlign = "left";
  y += hCabT;
  if (!t.grupos.length) { letra(ctx, 600, 15); ctx.fillStyle = GRIS; ctx.fillText("Todas las licencias de quienes trabajan están al día.", xi + 12, y + 30) }
  for (const g of t.grupos) {
    ctx.fillStyle = g.interventor || g.coordinador ? "#2A2F36" : "#4A5059"; ctx.fillRect(xi, y, wi, hGrupo);
    ctx.fillStyle = ACENTO; ctx.fillRect(xi, y + hGrupo - 3, wi, 3);
    letra(ctx, 800, 14); ctx.fillStyle = "#FFFFFF";
    ctx.fillText(g.interventor || g.coordinador ? `Interventor ABI: ${g.interventor ?? "—"}   ·   Coordinador de la contratista: ${g.coordinador ?? "—"}` : "Sin interventor ABI ni coordinador asignado", xi + 12, y + hGrupo / 2);
    letra(ctx, 700, 13); ctx.textAlign = "right";
    ctx.fillText(`${g.vencidas ? `${g.vencidas} vencidas · ` : ""}${g.criticas ? `${g.criticas} en 7 días · ` : ""}${g.total} en total`, xi + wi - 12, y + hGrupo / 2);
    ctx.textAlign = "left"; y += hGrupo;
    for (const e of g.empresas) {
      ctx.fillStyle = "#EEF1F5"; ctx.fillRect(xi, y, wi, hEmp);
      letra(ctx, 800, 13); ctx.fillStyle = TINTA; espaciado(ctx, `${e.empresa.toUpperCase()}  ·  ${e.personas.length}`, xi + 12, y + hEmp / 2, .6);
      y += hEmp;
      e.personas.forEach((a, k) => {
        if (k % 2) { ctx.fillStyle = "#FAFBFC"; ctx.fillRect(xi, y, wi, hFila) }
        const U = URGENCIA[a.urgencia];
        ctx.fillStyle = U.color; ctx.fillRect(xi, y, 4, hFila);
        ctx.fillStyle = U.suave; ctx.fillRect(C.dias - 4, y + 5, 104, hFila - 10);
        letra(ctx, 900, 15); ctx.fillStyle = U.texto;
        ctx.fillText(`${Math.abs(a.dias)} ${a.dias < 0 ? "vencida" : Math.abs(a.dias) === 1 ? "día" : "días"}`, C.dias + 4, y + hFila / 2);
        letra(ctx, 700, 14); ctx.fillStyle = TINTA; ctx.fillText(recortar(ctx, a.nombre, C.ced - C.nom - 14), C.nom, y + hFila / 2);
        letra(ctx, 500, 13); ctx.fillStyle = GRIS; ctx.fillText(a.cedula, C.ced, y + hFila / 2);
        ctx.fillText(recortar(ctx, permisosTexto(a.permisos) || "—", C.emp - C.perm - 14), C.perm, y + hFila / 2);
        ctx.fillText(a.nivel ?? "—", C.emp, y + hFila / 2);
        letra(ctx, 800, 14); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(fechaCorta(a.vencimiento), C.vence, y + hFila / 2); ctx.textAlign = "left";
        ctx.fillStyle = "#EEF1F5"; ctx.fillRect(xi, y + hFila - 1, wi, 1);
        y += hFila;
      });
    }
  }
  pie(ctx, W, H, extra.generado ?? new Date(),
    `Solo Logística. Licencia = expedición + ${t.config.vigencia} días. Alerta desde ${t.config.diasAviso} días antes; solo cuenta a quien está ACTIVO.`);
  return c;
}
export const nombreTableroCert = (hoy: string) => `licencias-vaca-logistica-${hoy}.png`;

/* =====================================================================
   UNA LISTA POR IMAGEN: vencidas · vencen en 7 días · vencen este mes.
   «Toda la foto completa no se entiende»: cada lista sale sola, con su cifra grande arriba y la gente por la
   cadena del aviso (Interventor ABI → su Coordinador), numerada, con empresa, permisos y cuándo vence.
   ===================================================================== */
export type ListaCert = "vencida" | "critica" | "aviso";
const LISTAS: Record<ListaCert, { titulo: (d: number) => string; nota: string }> = {
  vencida: { titulo: () => "Vencidas y trabajando", nota: "Exigir hoy: sin licencia vigente no pueden seguir trabajando." },
  critica: { titulo: (d) => `Vencen en ${d} días`, nota: "Renovar esta semana, antes de que se venzan." },
  aviso: { titulo: () => "Vencen este mes", nota: "Programar la renovación antes de la fecha." },
};

export function dibujarListaCert(t: TableroCert, u: ListaCert, extra: Extra & { deptos?: string } = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const U = URGENCIA[u], L0 = LISTAS[u];
  const W = 1400, M = MARGEN, G = HUECO, ancho = W - 2 * M;
  const gente = t.alertas.filter((a) => a.urgencia === u);

  /* LA CADENA: interventor → coordinador → personas (por días y nombre). */
  const ivs = new Map<string, Map<string, typeof gente>>();
  for (const a of gente) {
    const iv = (a.interventor ?? "").trim(), co = (a.coordinador ?? "").trim();
    const cos = ivs.get(iv) ?? ivs.set(iv, new Map()).get(iv)!;
    cos.set(co, [...(cos.get(co) ?? []), a]);
  }
  const n = (m: Map<string, typeof gente>) => [...m.values()].reduce((s, l) => s + l.length, 0);
  const orden = [...ivs].sort((a, b) => Number(a[0] === "") - Number(b[0] === "") || n(b[1]) - n(a[1]));

  const yB = 106, hB = 118, yT = yB + hB + G;
  const hCab = 40, hIv = 46, hCo = 34, hFila = 36;
  const filasAlto = orden.reduce((s, [, cos]) => s + hIv + [...cos.values()].reduce((x, l) => x + hCo + l.length * hFila, 0), 0);
  const hT = 54 + hCab + (gente.length ? filasAlto : 70) + 12;
  const H = yT + hT + G + 34;

  const c = document.createElement("canvas");
  c.width = W * FOTO.escala; c.height = H * FOTO.escala;
  const ctx = c.getContext("2d")!;
  ctx.scale(FOTO.escala, FOTO.escala); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);
  const deptos = extra.deptos ?? "Logística";
  cabecera(ctx, W, [deptos, `Aviso ${t.config.diasAviso} días`], P, extra.logo, L0.titulo(t.config.diasCriticos),
    `Licencias VACA · ${deptos} · corte del ${fechaCorta(t.hoy)} de ${t.hoy.slice(0, 4)}`);

  /* ---------- LA CIFRA ---------- */
  ctx.fillStyle = U.color; ctx.fillRect(M, yB, ancho, hB);
  if (u === "vencida" && gente.length) { ctx.fillStyle = "#C8102E"; ctx.fillRect(M, yB + hB - 5, ancho, 5) }
  const sobre = U.sobre;
  letra(ctx, 900, 64); ctx.fillStyle = sobre; ctx.textAlign = "left"; ctx.fillText(String(gente.length), M + 26, yB + hB / 2 + 2);
  const wN = ctx.measureText(String(gente.length)).width;
  letra(ctx, 800, 15); espaciado(ctx, L0.titulo(t.config.diasCriticos).toUpperCase(), M + 50 + wN, yB + 42, 1.2);
  letra(ctx, 600, 15); ctx.fillText(L0.nota, M + 50 + wN, yB + 72);
  const empresas = new Set(gente.map((a) => a.empresa.trim().toUpperCase())).size;
  letra(ctx, 700, 14); ctx.textAlign = "right";
  ctx.fillText(`${empresas} ${empresas === 1 ? "empresa" : "empresas"} · ${orden.length} ${orden.length === 1 ? "interventor" : "interventores"}`, W - M - 26, yB + hB / 2);
  ctx.textAlign = "left";

  /* ---------- LA LISTA ---------- */
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(M, yT, ancho, hT);
  ctx.strokeStyle = BORDE; ctx.strokeRect(M + .5, yT + .5, ancho - 1, hT - 1);
  ctx.fillStyle = ACENTO; ctx.fillRect(M + 16, yT + 22, 10, 10);
  letra(ctx, 800, 15); ctx.fillStyle = TINTA; espaciado(ctx, "A QUIÉN EXIGIRLE", M + 34, yT + 28);
  const xi = M + 16, wi = ancho - 32;
  const C = { num: xi + 12, nom: xi + 52, ced: xi + wi * 0.40, emp: xi + wi * 0.52, perm: xi + wi * 0.70, vence: xi + wi - 12 };
  let y = yT + 54;
  ctx.fillStyle = TINTA; ctx.fillRect(xi, y, wi, hCab);
  letra(ctx, 800, 11); ctx.fillStyle = "#FFFFFF";
  ([["#", C.num], ["NOMBRE", C.nom], ["CÉDULA", C.ced], ["EMPRESA", C.emp], ["PERMISOS · NIVEL", C.perm]] as const).forEach(([tx, x]) => espaciado(ctx, tx, x, y + hCab / 2, .8));
  ctx.textAlign = "right"; ctx.fillText("VENCE", C.vence, y + hCab / 2); ctx.textAlign = "left";
  y += hCab;
  if (!gente.length) { letra(ctx, 600, 16); ctx.fillStyle = GRIS; ctx.fillText("Nadie en esta lista.", xi + 12, y + 34) }
  let k = 0;
  for (const [iv, cos] of orden) {
    ctx.fillStyle = "#3B3B3B"; ctx.fillRect(xi, y, wi, hIv);
    ctx.fillStyle = ACENTO; ctx.fillRect(xi, y + hIv - 3, wi, 3);
    letra(ctx, 800, 15); ctx.fillStyle = "#FFFFFF";
    ctx.fillText(iv ? `Interventor ABI: ${iv}` : "Sin Interventor ABI asignado", xi + 12, y + hIv / 2);
    letra(ctx, 700, 13); ctx.textAlign = "right"; ctx.fillText(`${n(cos)} ${n(cos) === 1 ? "persona" : "personas"}`, xi + wi - 12, y + hIv / 2); ctx.textAlign = "left";
    y += hIv;
    for (const [co, lista] of [...cos].sort((a, b) => Number(a[0] === "") - Number(b[0] === "") || b[1].length - a[1].length)) {
      ctx.fillStyle = "#FFF6E3"; ctx.fillRect(xi, y, wi, hCo);
      ctx.fillStyle = "#B58200"; ctx.fillRect(xi, y, 4, hCo);
      letra(ctx, 800, 13.5); ctx.fillStyle = "#8A6300"; ctx.fillText(`↳  ${co ? `Coordinador: ${co}` : "Sin coordinador asignado"}`, xi + 14, y + hCo / 2);
      letra(ctx, 700, 12.5); ctx.textAlign = "right"; ctx.fillText(String(lista.length), xi + wi - 12, y + hCo / 2); ctx.textAlign = "left";
      y += hCo;
      lista.sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre, "es")).forEach((a, i) => {
        if (i % 2) { ctx.fillStyle = "#FAFBFC"; ctx.fillRect(xi, y, wi, hFila) }
        letra(ctx, 800, 13); ctx.fillStyle = GRIS; ctx.fillText(String(++k), C.num, y + hFila / 2);
        letra(ctx, 700, 14.5); ctx.fillStyle = TINTA; ctx.fillText(recortar(ctx, a.nombre.toUpperCase(), C.ced - C.nom - 14), C.nom, y + hFila / 2);
        letra(ctx, 500, 13.5); ctx.fillStyle = GRIS; ctx.fillText(a.cedula, C.ced, y + hFila / 2);
        letra(ctx, 600, 13); ctx.fillStyle = TINTA; ctx.fillText(recortar(ctx, a.empresa.toUpperCase(), C.perm - C.emp - 14), C.emp, y + hFila / 2);
        letra(ctx, 500, 12.5); ctx.fillStyle = GRIS;
        ctx.fillText(recortar(ctx, `${permisosTexto(a.permisos) || "—"} · ${a.nivel ?? "—"}`, C.vence - C.perm - 190), C.perm, y + hFila / 2);
        const cuando = a.dias < 0 ? `hace ${-a.dias} ${a.dias === -1 ? "día" : "días"}` : a.dias === 0 ? "HOY" : a.dias === 1 ? "mañana" : `en ${a.dias} días`;
        letra(ctx, 600, 12.5); ctx.textAlign = "right"; ctx.fillStyle = u === "vencida" ? "#C8102E" : U.texto; ctx.fillText(cuando, C.vence - 70, y + hFila / 2);
        letra(ctx, 800, 14.5); ctx.fillStyle = TINTA; ctx.fillText(fechaCorta(a.vencimiento), C.vence, y + hFila / 2); ctx.textAlign = "left";
        ctx.fillStyle = "#EEF1F5"; ctx.fillRect(xi, y + hFila - 1, wi, 1);
        y += hFila;
      });
    }
  }
  pie(ctx, W, H, extra.generado ?? new Date(), `Solo quien está ACTIVO. Licencia = expedición + ${t.config.vigencia} días.`);
  return c;
}
export const nombreListaCert = (hoy: string, u: ListaCert) =>
  `licencias-vaca-${u === "vencida" ? "vencidas" : u === "critica" ? "7-dias" : "este-mes"}-${hoy}.png`;
