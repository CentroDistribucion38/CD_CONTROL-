import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · DESPACHO FIFO — ya no es una pantalla aparte: vive DENTRO del Tablero (hoja «Despacho FIFO»).
 * Esta dirección se deja solo para que los enlaces y favoritos de antes sigan llegando al mismo sitio.
 */
export default async function DespachoFifoPage({ searchParams }: { searchParams?: Promise<{ dia?: string; sku?: string }> }) {
  const sp = (await searchParams) ?? {};
  const q = new URLSearchParams({ vista: "despacho" });
  if (sp.dia) q.set("dia", sp.dia);
  if (sp.sku) q.set("sku", sp.sku);
  redirect(`/inventario/tablero?${q.toString()}`);
}
