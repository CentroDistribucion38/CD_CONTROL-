"use client";

import { zipSync, strToU8 } from "fflate";
import { createClient } from "@/lib/supabase/client";
import type { Rotura } from "@/modulos/roturas/datos";
import type { FotoLibro } from "@/modulos/roturas/libro-roturas";

/**
 * EL TABLERO EN EXCEL + TODAS LAS FOTOS EN .ZIP — armado EN EL NAVEGADOR.
 *
 * «Que cuando exporte se descargue absolutamente todo, y no solo algunas fotos.»
 * El servidor tiene 60 s y no puede devolver más de 4,5 MB: por eso su Excel traía pocas fotos
 * (3 por rotura y las que cupieran). Aquí el servidor no participa: este equipo pide la lista de
 * fotos de lo filtrado, baja cada una del almacenamiento con la misma sesión (RLS: solo lo que
 * puede ver) y entrega:
 *   · el .xlsx con TODAS las fotos achicadas (≈ 900 px) en Evidencias, una columna por foto;
 *   · el .zip con TODAS las fotos tal como se subieron, con el código de la rotura en el nombre
 *     y un «indice.csv». Si pesan mucho se parte en varios .zip (~250 MB) para no agotar la memoria.
 */
type FilaFoto = { rotura_id: string; ruta: string; papel?: "rotura" | "descargo"; subida_en: string };

const A_LA_VEZ = 6;
const PARTE_MAX = 250 * 1024 * 1024;
const LADO_FOTO = 900;
const sello = () => new Date().toLocaleString("sv", { timeZone: "America/Bogota" }).replace(/[-:]/g, "").replace(" ", "-").slice(0, 13);
const limpio = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
const csv = (v: unknown) => { const t = String(v ?? ""); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bajar(blob: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/** Achica una foto para el Excel (JPEG de ≈ 900 px). null si el navegador no la sabe leer (p. ej. HEIC). */
async function achicar(b: Blob): Promise<{ buf: Uint8Array; ancho: number; alto: number } | null> {
  try {
    const img = await createImageBitmap(b, { imageOrientation: "from-image" });
    const k = Math.min(1, LADO_FOTO / Math.max(img.width, img.height));
    const ancho = Math.max(1, Math.round(img.width * k)), alto = Math.max(1, Math.round(img.height * k));
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho; lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) { img.close(); return null }
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);
    img.close();
    const salida = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.62));
    if (!salida) return null;
    return { buf: new Uint8Array(await salida.arrayBuffer()), ancho, alto };
  } catch { return null }
}

export type ResultadoExportar = { roturas: number; fotos: number; fallaron: number; enExcel: number; zips: number; excel: string };

export async function exportarTodo(o: {
  roturas: Rotura[]; nombres: Record<string, string>; periodo: string; filtros: string;
  avance: (texto: string) => void;
}): Promise<ResultadoExportar> {
  const supabase = createClient();
  const ids = o.roturas.map((r) => r.id);
  const porId = new Map(o.roturas.map((r) => [r.id, r]));

  /* 1. LA LISTA DE FOTOS de lo filtrado (de a 200 id por consulta: la URL tiene tope). */
  const filas: FilaFoto[] = [];
  const conFotos = o.roturas.filter((r) => Number(r.fotos) > 0 || Number(r.fotos_descargo) > 0).map((r) => r.id);
  for (let i = 0; i < conFotos.length; i += 200) {
    const tanda = conFotos.slice(i, i + 200);
    const con = await supabase.from("roturas_fotos").select("rotura_id, ruta, papel, subida_en").in("rotura_id", tanda).order("subida_en");
    /* Sin la columna `papel` (falta el SQL del descargo): todas son de la rotura. */
    const datos = con.error
      ? (await supabase.from("roturas_fotos").select("rotura_id, ruta, subida_en").in("rotura_id", tanda).order("subida_en")).data
      : con.data;
    filas.push(...((datos ?? []) as FilaFoto[]));
  }
  /* Lo más reciente primero, con las de la rotura antes que el descargo del OL. */
  filas.sort((a, b) => {
    const fa = porId.get(a.rotura_id)?.reportada_en ?? "", fb = porId.get(b.rotura_id)?.reportada_en ?? "";
    if (fa !== fb) return fb.localeCompare(fa);
    if (a.rotura_id !== b.rotura_id) return a.rotura_id.localeCompare(b.rotura_id);
    const pa = (a.papel ?? "rotura") === "rotura" ? 0 : 1, pb = (b.papel ?? "rotura") === "rotura" ? 0 : 1;
    return pa !== pb ? pa - pb : a.subida_en.localeCompare(b.subida_en);
  });

  /* 2. SE BAJAN DE A POCAS (no se tumba la señal). Cada una va al .zip tal cual y, achicada, al Excel. */
  const fotosExcel: FotoLibro[] = [];
  const indice: string[] = ["﻿archivo;codigo;material;papel;registrada;causa"];
  const contador = new Map<string, number>();
  const usados = new Set<string>();
  const sel = sello();
  let parte: Record<string, Uint8Array> = {}, pesoParte = 0, nZips = 0, hechas = 0, fallaron = 0, enZip = 0;

  async function soltarParte() {
    if (!Object.keys(parte).length) return;
    nZips++;
    const nombre = `fotos-roturas-${sel}-parte-${nZips}.zip`;
    const archivos = { ...parte };
    parte = {}; pesoParte = 0;
    o.avance(`Armando ${nombre}…`);
    /* Las fotos ya vienen comprimidas: se guardan tal cual (level 0), es más rápido. */
    bajar(new Blob([zipSync(archivos, { level: 0 }) as BlobPart], { type: "application/zip" }), nombre);
    if (nZips > 1) await espera(700);   // el navegador no se traga bien varias descargas pegadas
  }

  o.avance(`Bajando fotos 0/${filas.length}…`);
  for (let i = 0; i < filas.length; i += A_LA_VEZ) {
    const tanda = filas.slice(i, i + A_LA_VEZ);
    const bajadas = await Promise.all(tanda.map(async (f) => {
      try {
        const { data: blob, error } = await supabase.storage.from("roturas").download(f.ruta);
        if (error || !blob) return null;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const chica = await achicar(blob);
        return { f, bytes, chica };
      } catch { return null }
    }));
    for (const x of bajadas) {
      hechas++;
      if (!x) { fallaron++; continue }
      const r = porId.get(x.f.rotura_id);
      const papel = x.f.papel ?? "rotura";
      const clave = `${x.f.rotura_id}|${papel}`;
      const n = (contador.get(clave) ?? 0) + 1; contador.set(clave, n);
      const ext = (/\.(\w{3,4})$/.exec(x.f.ruta)?.[1] ?? "jpg").toLowerCase();
      const base = `${limpio(r?.codigo ?? x.f.rotura_id)}_${papel}_${n}`;
      let nombre = `${base}.${ext}`, k = 2;
      while (usados.has(nombre)) nombre = `${base}_${k++}.${ext}`;
      usados.add(nombre);
      parte[nombre] = x.bytes; pesoParte += x.bytes.byteLength; enZip++;
      indice.push([nombre, r?.codigo ?? "", r?.material_nombre ?? "", papel, r?.reportada_en ?? "", r?.causa_nombre ?? ""].map(csv).join(";"));
      if (x.chica) fotosExcel.push({ rotura_id: x.f.rotura_id, papel, foto: x.chica.buf, ancho: x.chica.ancho, alto: x.chica.alto, extension: "jpeg" });
    }
    o.avance(`Bajando fotos ${hechas}/${filas.length}…`);
    if (pesoParte >= PARTE_MAX) await soltarParte();
  }
  if (enZip) {
    parte["indice.csv"] = strToU8(indice.join("\r\n"));
    await soltarParte();
  }

  /* 3. EL EXCEL, con todas las fotos que se pudieron achicar. */
  o.avance("Armando el Excel…");
  const { data: { user } } = await supabase.auth.getUser();
  const yoR = user ? await supabase.from("perfiles").select("usuario, nombre").eq("id", user.id).maybeSingle() : null;
  const yo = yoR?.data as { usuario: string | null; nombre: string | null } | null;
  const logo = await fetch("/marca/logo-b.png").then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  const { armarLibroRoturas } = await import("@/modulos/roturas/libro-roturas");
  const libro = await armarLibroRoturas({
    roturas: o.roturas, nombres: o.nombres, fotos: fotosExcel, fotosFuera: Math.max(0, enZip - fotosExcel.length),
    periodo: o.periodo, filtros: o.filtros, quien: yo?.nombre || yo?.usuario || "—",
    logo: logo ? new Uint8Array(logo) : null,
  });
  const nombreExcel = `roturas-en-sitio-${sel}.xlsx`;
  if (nZips) await espera(700);
  bajar(new Blob([libro], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreExcel);

  return { roturas: ids.length, fotos: enZip, fallaron, enExcel: fotosExcel.length, zips: nZips, excel: nombreExcel };
}
