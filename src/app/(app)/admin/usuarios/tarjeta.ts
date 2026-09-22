/**
 * LA TARJETA DE ACCESO, EN IMAGEN — para mandarla por WhatsApp.
 *
 * «Te dejo cómo debería verse»: la franja del color del tema con el sello
 * y la esquina clara, el círculo con las iniciales, el nombre, el rol en
 * su color vivo, el usuario, la clave en la caja punteada y el pie con la
 * dirección. Se dibuja en un canvas al doble de resolución; el logo es el
 * PNG de public/marca, tal cual.
 */
import { colorRol, type ColoresLibro } from "@/modulos/admin/colores-rol";

export type DatosTarjeta = {
  nombre: string; usuario: string; clave: string; rol: string; rolNombre: string;
  roles: { clave: string; manda: boolean }[]; colores: ColoresLibro; lugar: string; host: string;
};

const cargar = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src;
});
const mezcla = (h: string, t: number) => "#" + [0, 2, 4].map((i) => Math.round(255 - (255 - parseInt(h.slice(i, i + 2), 16)) * t).toString(16).padStart(2, "0")).join("");
const hondo = (h: string, k: number) => "#" + [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("");
const iniciales = (s: string) => s.replace(/[_.\-]+/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";

export async function dibujarTarjeta(d: DatosTarjeta): Promise<Blob> {
  const W = 579, H = 725, E = 2;
  const cv = document.createElement("canvas"); cv.width = W * E; cv.height = H * E;
  const g = cv.getContext("2d")!; g.scale(E, E);
  const tinta = "#" + d.colores.tinta, banda = "#" + d.colores.banda;
  const sans = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const mono = "ui-monospace, 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace";
  const esp = (px: number) => { (g as unknown as { letterSpacing: string }).letterSpacing = `${px}px` };
  const texto = (t: string, x: number, y: number, font: string, color: string, al: CanvasTextAlign = "left", ls = 0) => {
    g.font = font; g.fillStyle = color; g.textAlign = al; esp(ls); g.fillText(t, x, y); esp(0);
  };
  const ajustar = (t: string, max: number, peso: string, tam: number, fam: string) => {
    let s = tam; g.font = `${peso} ${s}px ${fam}`;
    while (g.measureText(t).width > max && s > 12) { s -= 1; g.font = `${peso} ${s}px ${fam}` }
    return `${peso} ${s}px ${fam}`;
  };

  /* el fondo y la tarjeta con su sombra */
  g.fillStyle = mezcla(d.colores.tinta, 0.08); g.fillRect(0, 0, W, H);
  const x = 42, y = 42, w = W - 84, h = H - 84, R = 24;
  g.save(); g.shadowColor = "rgba(0,0,0,.14)"; g.shadowBlur = 30; g.shadowOffsetY = 10;
  g.beginPath(); g.roundRect(x, y, w, h, R); g.fillStyle = "#fff"; g.fill(); g.restore();
  g.save(); g.beginPath(); g.roundRect(x, y, w, h, R); g.clip();
  /* la franja: el color del tema y la esquina más clara en diagonal */
  const FR = 144;
  g.fillStyle = banda; g.fillRect(x, y, w, FR);
  g.beginPath(); g.moveTo(x + w * 0.8, y); g.lineTo(x + w, y); g.lineTo(x + w, y + FR); g.lineTo(x + w * 0.66, y + FR); g.closePath();
  g.fillStyle = "rgba(255,255,255,.22)"; g.fill();
  /* el pie */
  g.fillStyle = mezcla(d.colores.tinta, 0.05); g.fillRect(x, y + h - 86, w, 86);
  g.restore();

  const sello = await cargar("/marca/logo-b.png");
  if (sello) g.drawImage(sello, x + 27, y + 26, 50, 50);
  texto("CONTROL", x + 94, y + 51, `900 23px ${sans}`, tinta, "left", 2.5);
  texto(d.lugar, x + 94, y + 75, `500 15px ${sans}`, hondo(d.colores.banda, 0.42));

  /* las iniciales */
  const cx = x + w / 2, cy = y + FR;
  g.beginPath(); g.arc(cx, cy, 54, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
  g.beginPath(); g.arc(cx, cy, 47, 0, Math.PI * 2); g.fillStyle = tinta; g.fill();
  g.textBaseline = "middle"; texto(iniciales(d.nombre), cx, cy + 2, `900 33px ${sans}`, banda, "center"); g.textBaseline = "alphabetic";

  /* nombre y rol */
  g.font = ajustar(d.nombre, w - 60, "900", 31, sans);
  texto(d.nombre, cx, y + 248, g.font, tinta, "center");
  const rc = colorRol(d.rol, d.roles, d.colores);
  const rot = d.rolNombre.toUpperCase();
  g.font = `800 13px ${sans}`; esp(2.6); const aw = g.measureText(rot).width; esp(0);
  const pw = aw + 46, px = cx - pw / 2, py = y + 266;
  g.beginPath(); g.roundRect(px, py, pw, 32, 16); g.fillStyle = "#" + rc.fondo; g.fill();
  g.textBaseline = "middle"; texto(rot, cx + 1.3, py + 17, `800 13px ${sans}`, "#" + rc.letra, "center", 2.6); g.textBaseline = "alphabetic";

  /* usuario */
  const gris = mezcla(d.colores.tinta, 0.62);
  texto("USUARIO", x + 33, y + 336, `800 12px ${sans}`, gris, "left", 2.2);
  texto(d.usuario, x + 33, y + 370, ajustar(d.usuario, w - 66, "500", 26, mono), tinta);

  /* la clave, en la caja punteada */
  const bx = x + 33, by = y + 390, bw = w - 66, bh = 134;
  g.beginPath(); g.roundRect(bx, by, bw, bh, 14); g.fillStyle = mezcla(d.colores.tinta, 0.05); g.fill();
  g.setLineDash([7, 5]); g.lineWidth = 2; g.strokeStyle = mezcla(d.colores.tinta, 0.2); g.stroke(); g.setLineDash([]);
  texto("CLAVE PROVISIONAL", cx, by + 36, `800 12px ${sans}`, hondo(d.colores.banda, 0.55), "center", 2.4);
  texto(d.clave, cx + 4, by + 102, `700 46px ${mono}`, tinta, "center", 8);

  /* el pie */
  g.font = `400 15px ${sans}`; const a = "Entra en "; const aw2 = g.measureText(a).width;
  g.font = `700 15px ${sans}`; const bw2 = g.measureText(d.host).width;
  const x0 = cx - (aw2 + bw2) / 2;
  texto(a, x0, y + h - 52, `400 15px ${sans}`, gris);
  texto(d.host, x0 + aw2, y + h - 52, `700 15px ${sans}`, tinta);
  texto("y cámbiala la primera vez que entres.", cx, y + h - 27, `400 15px ${sans}`, gris, "center");

  return new Promise((ok, mal) => cv.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
}

/** Compartirla (WhatsApp en el celular) o, si no se puede, bajarla. */
export async function entregarTarjeta(b: Blob, nombre: string) {
  const f = new File([b], nombre, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await nav.share({ files: [f], title: "Acceso a CONTROL" }); return } catch { /* cancelado: se baja */ }
  }
  bajarBlob(b, nombre);
}

export function bajarBlob(b: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
