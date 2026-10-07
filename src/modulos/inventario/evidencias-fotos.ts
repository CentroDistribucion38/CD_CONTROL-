/**
 * LAS FOTOS DE LAS EVIDENCIAS PARA EL INFORME — se bajan del bucket «inventario» y se achican.
 *
 * Una foto del celular pesa ~0,5 MB; sesenta en un PDF serían un archivo de 30 MB que nadie manda
 * por correo. Aquí cada una se baja a ~360 px de ancho (JPEG): se ve qué es y de dónde, y el
 * archivo queda en pocos MB. Si una no baja (sin señal, borrada) se omite y el informe sale igual.
 * Solo corre en el navegador.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Novedad } from "./evidencias";
import type { Foto } from "./evidencias-informe";

const ANCHO = 360;

async function achicar(blob: Blob): Promise<Foto | null> {
  try {
    let w = 0, h = 0, dibujar: (g: CanvasRenderingContext2D, cw: number, ch: number) => void;
    if (typeof createImageBitmap === "function") {
      const bm = await createImageBitmap(blob);
      w = bm.width; h = bm.height; dibujar = (g, cw, ch) => { g.drawImage(bm, 0, 0, cw, ch); bm.close?.() };
    } else {
      const url = URL.createObjectURL(blob);
      const im = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url });
      w = im.naturalWidth; h = im.naturalHeight; dibujar = (g, cw, ch) => { g.drawImage(im, 0, 0, cw, ch); URL.revokeObjectURL(url) };
    }
    if (!w || !h) return null;
    const k = Math.min(1, ANCHO / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, cw, ch); dibujar(g, cw, ch);
    return { jpg: c.toDataURL("image/jpeg", 0.72), w: cw, h: ch };
  } catch { return null }
}

/** Baja hasta `max` fotos distintas (las de los días más recientes primero). Devuelve ruta → miniatura. */
export async function cargarFotos(
  supabase: SupabaseClient, novs: Novedad[], max: number, progreso?: (hechas: number, total: number) => void,
): Promise<Map<string, Foto>> {
  const rutas: string[] = [];
  for (const n of [...novs].sort((a, b) => b.dia.localeCompare(a.dia))) {
    if (n.ruta && !rutas.includes(n.ruta)) rutas.push(n.ruta);
    if (rutas.length >= max) break;
  }
  const out = new Map<string, Foto>();
  let hechas = 0, i = 0;
  progreso?.(0, rutas.length);
  const obrero = async () => {
    while (i < rutas.length) {
      const ruta = rutas[i++];
      try {
        const { data, error } = await supabase.storage.from("inventario").download(ruta);
        if (!error && data) { const f = await achicar(data); if (f) out.set(ruta, f) }
      } catch { /* esa foto se omite */ }
      progreso?.(++hechas, rutas.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, rutas.length) }, obrero));
  return out;
}
