"use client";

import { zipSync, strToU8 } from "fflate";
import { createClient } from "@/lib/supabase/client";
import type { ConteoFefo, Renglon } from "@/modulos/inventario/fefo";

/**
 * TODAS LAS FOTOS DE LOS RECORRIDOS ESCOGIDOS, EN UN .ZIP — armado EN EL NAVEGADOR.
 *
 * «Que me baje todas las fotos, sin que afecte nada.» El Excel consolidado lo arma el servidor, que tiene
 * 60 s y no puede devolver más de 4,5 MB: por eso ahí van pocas fotos. Aquí el servidor no participa:
 * este equipo pide la lista de fotos (conteo_fotos), baja cada una del almacenamiento con la misma sesión
 * (RLS: solo lo que puede ver) y arma el .zip. Sin tope de tiempo ni de tamaño, y el Excel sigue igual.
 *
 * Dentro del .zip: una carpeta por día, cada foto con el código, la ubicación y el recorrido en el nombre,
 * y «indice.csv» con lo que es cada una.
 */
type FotoFila = { conteo_id: string; linea_id: string; ruta: string; tomada_en: string | null };

const A_LA_VEZ = 6;
const limpio = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
const csv = (v: unknown) => { const t = String(v ?? ""); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t };

export async function bajarFotosZip(
  conteos: ConteoFefo[], renglones: Renglon[], avance: (hechas: number, total: number) => void,
): Promise<{ ok: true; fotos: number; fallaron: number; nombre: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const ids = conteos.map((c) => c.id);
  if (!ids.length) return { ok: false, error: "Marca al menos un recorrido." };

  /* 1. La lista de fotos de esos recorridos. */
  const fotos: FotoFila[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabase.from("conteo_fotos").select("conteo_id, linea_id, ruta, tomada_en").in("conteo_id", ids.slice(i, i + 50));
    if (error) return { ok: false, error: /conteo_fotos|does not exist|PGRST205/i.test(error.message) ? "Todavía no hay fotos guardadas (falta la tabla de fotos)." : error.message };
    fotos.push(...((data ?? []) as FotoFila[]));
  }
  if (!fotos.length) return { ok: false, error: "Esos recorridos no tienen fotos." };

  const linea = new Map(renglones.map((r) => [r.id, r]));
  const conteo = new Map(conteos.map((c) => [c.id, c]));
  const archivos: Record<string, Uint8Array> = {};
  const indice: string[] = ["﻿archivo;dia;recorrido;codigo;material;ubicacion;tomada"];
  const usados = new Set<string>();
  let hechas = 0, fallaron = 0;
  avance(0, fotos.length);

  /* 2. Se bajan de a pocas a la vez (no se tumba la señal) y cada una con su nombre. */
  for (let i = 0; i < fotos.length; i += A_LA_VEZ) {
    await Promise.all(fotos.slice(i, i + A_LA_VEZ).map(async (f) => {
      try {
        const { data: blob, error } = await supabase.storage.from("inventario").download(f.ruta);
        if (error || !blob) { fallaron++; return }
        const r = linea.get(f.linea_id), c = conteo.get(f.conteo_id);
        const dia = c?.fecha_analisis ?? "sin-dia";
        const ext = (/\.(\w{3,4})$/.exec(f.ruta)?.[1] ?? "jpg").toLowerCase();
        const base = [r?.codigo, r?.ubicacion, r?.conteo ?? c?.codigo].filter(Boolean).map((x) => limpio(String(x))).join("_") || limpio(f.linea_id);
        let nombre = `${dia}/${base}.${ext}`, n = 2;
        while (usados.has(nombre)) nombre = `${dia}/${base}_${n++}.${ext}`;
        usados.add(nombre);
        archivos[nombre] = new Uint8Array(await blob.arrayBuffer());
        indice.push([nombre, dia, r?.conteo ?? c?.codigo ?? "", r?.codigo ?? "", r?.material ?? "", r?.ubicacion ?? "", f.tomada_en ?? ""].map(csv).join(";"));
      } catch { fallaron++ }
      finally { avance(++hechas, fotos.length) }
    }));
  }
  const n = Object.keys(archivos).length;
  if (!n) return { ok: false, error: "No se pudo bajar ninguna foto. Revisa la señal y vuelve a intentar." };

  /* 3. El .zip (las fotos ya vienen comprimidas: se guardan tal cual, es más rápido). */
  archivos["indice.csv"] = strToU8(indice.join("\r\n"));
  const zip = zipSync(archivos, { level: 0 });
  const dias = [...new Set(conteos.map((c) => c.fecha_analisis).filter(Boolean))].sort();
  const rango = dias.length ? (dias[0] === dias[dias.length - 1] ? dias[0] : `${dias[0]}_${dias[dias.length - 1]}`) : "fotos";
  const nombreZip = `fotos-conteo-${rango}.zip`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
  a.download = nombreZip;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20_000);
  return { ok: true, fotos: n, fallaron, nombre: nombreZip };
}
