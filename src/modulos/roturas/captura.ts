/**
 * FOTO DE UNA VENTANA — saca una imagen PNG de un recuadro de la pantalla (el flujograma, por ahora)
 * para pegarla en WhatsApp, Word o un correo. Se quitan los botones y el detalle abierto para que
 * quede limpia, y se fijan los colores que html2canvas no sabe leer (los `color-mix`).
 */
/** html2canvas no lee colores tipo `color(srgb …)` (así devuelve el navegador los `color-mix`): se pasan a rgb(). */
function fijarColores(doc: Document) {
  const lienzo = doc.createElement("canvas"); lienzo.width = lienzo.height = 1;
  const g = lienzo.getContext("2d", { willReadFrequently: true });
  if (!g) return;
  const aRgb = (v: string) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = v; g.fillRect(0, 0, 1, 1); const [r, gg, b, a] = g.getImageData(0, 0, 1, 1).data; return `rgba(${r}, ${gg}, ${b}, ${(a / 255).toFixed(3)})` };
  const props = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "textDecorationColor"] as const;
  const vista = doc.defaultView;
  if (!vista) return;
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cs = vista.getComputedStyle(el);
    for (const p of props) { const v = cs[p]; if (v && v.includes("color(")) el.style[p] = aRgb(v) }
  });
}

export async function fotografiar(el: HTMLElement, quitar: string[] = []): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const lienzo = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#FFFFFF",
    logging: false,
    useCORS: true,
    width: el.getBoundingClientRect().width,
    onclone: (doc: Document) => {
      for (const s of quitar) doc.querySelectorAll(s).forEach((e: Element) => e.remove());
      doc.querySelectorAll<HTMLElement>(".plr-ven").forEach((e: HTMLElement) => { e.style.animation = "none"; e.style.boxShadow = "none"; e.style.border = "0" });
      doc.querySelectorAll<HTMLElement>(".plr-dg").forEach((e: HTMLElement) => { e.style.background = "#F2F4F7" });
      fijarColores(doc);
    },
  });
  return await new Promise<Blob>((ok, mal) => lienzo.toBlob((b: Blob | null) => (b ? ok(b) : mal(new Error("No se pudo armar la imagen"))), "image/png"));
}

/** Baja el PNG al computador. */
export function descargarPng(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Copia el PNG al portapapeles. Devuelve false si el navegador no deja (entonces se descarga). */
export async function copiarPng(promesa: Promise<Blob>): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof ClipboardItem === "undefined") return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": promesa })]);
  return true;
}
