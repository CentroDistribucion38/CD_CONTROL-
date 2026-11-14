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
