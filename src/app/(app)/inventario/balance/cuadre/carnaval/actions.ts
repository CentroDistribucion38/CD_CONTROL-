"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { misPermisos } from "@/lib/permisos";
import { compararPeldar, redondear, type Comparacion, type FilaPeldar } from "@/modulos/carnaval/logica";
import { faltaTabla, ingresosCargados, productosYCorte, RUTA_CUADRE, saldosA, SQL_FALTA } from "@/modulos/carnaval/datos";

/**
 * AG07 CARNAVAL · LO QUE SE GUARDA.
 *  · previsualizarPeldar: compara el archivo de hoy con lo ya cargado y NO guarda nada.
 *  · aplicarPeldar: guarda lo nuevo y SOLO los cambios que una persona aprobó.
 *  · registrarMovimiento: trasiego (resta) o ajuste (suma o resta, con nota).
 *  · anularMovimiento: nada se borra; lo equivocado se anula y queda la huella.
 */
const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const refrescar = () => revalidatePath(RUTA_CUADRE);

async function permiso() {
  const p = await misPermisos();
  return p.puedeEditar(RUTA_CUADRE) ? null : "No tienes permiso para registrar en Carnaval (Admin → Roles → Cuadre SAP).";
}

function leerFilas(json: string): FilaPeldar[] | null {
  try {
    const a = JSON.parse(json);
    if (!Array.isArray(a)) return null;
    return a.filter((f) => f && typeof f.codigo === "string" && esDia(String(f.fecha)) && Number(f.pallets) > 0 && String(f.remision ?? "").trim())
      .map((f) => ({ fecha: String(f.fecha), codigo: String(f.codigo).trim(), descripcion: String(f.descripcion ?? ""), remision: String(f.remision).trim(), placa: String(f.placa ?? "").trim().toUpperCase(), pallets: Number(f.pallets), und: Number(f.und) || 0 }));
  } catch { return null }
}

async function comparar(filas: FilaPeldar[]): Promise<{ error: string } | { c: Comparacion; corte: string }> {
  const pc = await productosYCorte();
  if (pc.error) return { error: faltaTabla(pc.error) ? SQL_FALTA : pc.error };
  const ex = await ingresosCargados();
  if (ex.error) return { error: faltaTabla(ex.error) ? SQL_FALTA : ex.error };
  return { c: compararPeldar(filas, ex.filas, new Set(pc.productos.map((p) => p.codigo)), pc.corte), corte: pc.corte };
}

export async function previsualizarPeldar(filasJson: string): Promise<{ error: string } | { c: Comparacion; corte: string; totalArchivo: number }> {
  const filas = leerFilas(filasJson);
  if (!filas?.length) return { error: "El archivo no se pudo leer." };
  const r = await comparar(filas);
  return "error" in r ? r : { ...r, totalArchivo: filas.length };
}

export async function aplicarPeldar(filasJson: string, aprobadas: string[]): Promise<{ error?: string; nuevas?: number; actualizadas?: number }> {
  const sin = await permiso(); if (sin) return { error: sin };
  const filas = leerFilas(filasJson);
  if (!filas?.length) return { error: "El archivo no se pudo leer." };
  const r = await comparar(filas);   // se rehace aquí: no se confía en lo que mostró la pantalla
  if ("error" in r) return r;
  const supabase = await createClient();
  const user = await usuarioActual();
  const quien = user?.email ?? user?.id ?? "";

  let nuevas = 0;
  for (let i = 0; i < r.c.nuevas.length; i += 400) {
    const lote = r.c.nuevas.slice(i, i + 400).map((f) => ({
      fecha: f.fecha, tipo: "INGRESO", codigo: f.codigo, pallets: f.pallets, und: f.und, clave: f.clave, remision: f.remision, placa: f.placa || null, nota: "Archivo Peldar",
    }));
    const { error } = await supabase.from("carnaval_movimientos").insert(lote);
    if (error) return { error: faltaTabla(error.message) ? SQL_FALTA : `Se guardaron ${nuevas} y falló el resto: ${error.message}`, nuevas };
    nuevas += lote.length;
  }

  let actualizadas = 0;
  const ok = new Set(aprobadas);
  for (const c of r.c.cambiadas.filter((x) => ok.has(x.clave))) {
    const { data: act } = await supabase.from("carnaval_movimientos").select("historial").eq("id", c.id).single();
    const historial = [...((act?.historial as unknown[]) ?? []), {
      antes: c.antes, despues: { fecha: c.fila.fecha, pallets: c.fila.pallets, und: c.fila.und }, por: quien, en: new Date().toISOString(),
    }];
    const { error } = await supabase.from("carnaval_movimientos").update({ fecha: c.fila.fecha, pallets: c.fila.pallets, und: c.fila.und, historial }).eq("id", c.id);
    if (error) return { error: `Cambio de ${c.clave}: ${error.message}`, nuevas, actualizadas };
    actualizadas++;
  }
  refrescar();
  return { nuevas, actualizadas };
}

export async function registrarMovimiento(f: { fecha: string; tipo: "TRASIEGO" | "AJUSTE"; codigo: string; pallets: number; nota: string }): Promise<{ error?: string; ok?: true }> {
  const sin = await permiso(); if (sin) return { error: sin };
  if (!esDia(f.fecha)) return { error: "Elige el día del movimiento." };
  if (f.tipo !== "TRASIEGO" && f.tipo !== "AJUSTE") return { error: "Tipo de movimiento inválido." };
  const pal = Number(f.pallets);
  if (!Number.isFinite(pal) || pal === 0) return { error: "Escribe los pallets (distinto de cero)." };
  const nota = (f.nota ?? "").trim();
  if (f.tipo === "AJUSTE" && nota.length < 3) return { error: "El ajuste necesita una nota: por qué se ajusta." };
  const pc = await productosYCorte();
  if (pc.error) return { error: faltaTabla(pc.error) ? SQL_FALTA : pc.error };
  if (!pc.productos.some((p) => p.codigo === f.codigo)) return { error: "Ese código no está en el maestro de Carnaval." };
  const pallets = f.tipo === "TRASIEGO" ? -Math.abs(pal) : pal;
  if (pallets < 0) {
    const s = await saldosA("9999-12-31");
    const hay = s.saldos.get(f.codigo) ?? 0;
    if (hay + pallets < 0) return { error: `No alcanza: hay ${redondear(hay)} pallets de ese código y se quieren sacar ${redondear(-pallets)}. Si el saldo está mal, corrígelo con un ajuste.` };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("carnaval_movimientos").insert({ fecha: f.fecha, tipo: f.tipo, codigo: f.codigo, pallets, nota: nota || null });
  if (error) return { error: faltaTabla(error.message) ? SQL_FALTA : error.message };
  refrescar();
  return { ok: true };
}

export async function anularMovimiento(id: string, motivo: string): Promise<{ error?: string; ok?: true }> {
  const sin = await permiso(); if (sin) return { error: sin };
  if (!(motivo ?? "").trim()) return { error: "Escribe el motivo de la anulación." };
  const supabase = await createClient();
  const { data: m } = await supabase.from("carnaval_movimientos").select("tipo, anulado").eq("id", id).single();
  if (!m) return { error: "No encontré ese movimiento." };
  if (m.tipo === "INICIAL") return { error: "El saldo inicial no se anula: corrígelo con un ajuste." };
  if (m.anulado) return { error: "Ya estaba anulado." };
  const user = await usuarioActual();
  const { error } = await supabase.from("carnaval_movimientos").update({ anulado: true, anulado_motivo: motivo.trim(), anulado_por: user?.id ?? null, anulado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  refrescar();
  return { ok: true };
}

