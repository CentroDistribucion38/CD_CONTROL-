import { armarDesdeLineas, type Armada, type LineaLeida } from "./ocr";
import type { SeccionHoja } from "./logica";

/**
 * LEER LA FOTO DEL INVENTARIO EN EL NAVEGADOR, sin llave ni servidor: se agranda la foto, se pasa a grises y un lector de texto
 * (tesseract.js) saca las líneas. Luego `armarDesdeTexto` pone los nombres del molde y saca los números, marcando lo dudoso.
 * La primera vez baja el lector (unos MB); las siguientes ya lo tiene en el navegador.
 */
async function preparar(archivo: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error("No se pudo abrir la foto.")); i.src = url });
    /* el texto de la hoja se lee mejor a ~1400 px de ancho */
    const k = Math.max(1, Math.min(4, 1400 / img.width));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    if (c.width * c.height > 40_000_000) throw new Error("La foto es demasiado grande. Prueba con una captura de pantalla de la hoja.");
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.imageSmoothingQuality = "high";
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    /* grises + contraste estirado de punta a punta */
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    let lo = 255, hi = 0;
    for (let i = 0; i < p.length; i += 4) { const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000; p[i] = y; if (y < lo) lo = y; if (y > hi) hi = y }
    const esc = hi > lo ? 255 / (hi - lo) : 1;
    for (let i = 0; i < p.length; i += 4) { const y = Math.max(0, Math.min(255, (p[i] - lo) * esc)); p[i] = p[i + 1] = p[i + 2] = y }
    g.putImageData(d, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url) }
}

export async function leerFotoLocal(archivo: File, molde: SeccionHoja[], progreso?: (texto: string) => void): Promise<Armada> {
  progreso?.("Preparando la foto…");
  const lienzo = await preparar(archivo);
  const { createWorker, PSM } = await import("tesseract.js");
  progreso?.("Cargando el lector (la primera vez tarda un poco)…");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status?: string; progress?: number }) => { if (m.status === "recognizing text" && typeof m.progress === "number") progreso?.(`Leyendo la foto… ${Math.round(m.progress * 100)} %`) },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const { data } = await worker.recognize(lienzo);
    /* línea por línea, con la seguridad del lector en cada trozo */
    const lineas: LineaLeida[] = [];
    for (const l of data.lines ?? []) {
      const ws = (l.words ?? []).filter((w) => w.text.trim());
      if (ws.length) lineas.push({ toks: ws.map((w) => w.text.trim()), conf: ws.map((w) => w.confidence) });
    }
    return armarDesdeLineas(lineas, molde, data.text);
  } finally { await worker.terminate() }
}
