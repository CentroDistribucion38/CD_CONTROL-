/**
 * TIEMPOS GPS · LO QUE PASA CON CADA POSICIÓN QUE LLEGA (servidor), venga de la página «Compartir ubicación» o de la
 * app Traccar Client: (1) se registra (zonas, entradas y salidas), (2) si acaba de salir de una zona y tiene un viaje
 * con salida confirmada que sale de ahí, el viaje arranca solo, (3) se guarda con su viaje y se cierra al llegar,
 * (4) se revisa qué avisar al celular.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarCelular } from "./celular";
import { autoIniciar, seguirPosicion, type Seguimiento } from "./recorridos";
import { revisarAvisos } from "./avisos";

export type Fix = { lat: number; lng: number; en: string; precision: number | null; velocidad: number | null; rumbo: number | null };
export type Procesado =
  | { ok: true; zona: string | null; entradas: number; salidas: number; recorrido: Seguimiento | null; arranco: boolean }
  | { ok: false; estado: number; error: string };

export async function procesarPosicion(db: SupabaseClient, placa: string, fix: Fix): Promise<Procesado> {
  const r = await registrarCelular(db, { placa, ...fix });
  if (!r.ok) return r;
  const arranco = await autoIniciar(db, placa, r.salioDe).catch(() => null);
  const recorrido = await seguirPosicion(db, placa, fix, r.zonas).catch(() => null);
  await revisarAvisos(db, { placa, en: fix.en, zonaId: r.zonaId, zonaNombre: r.zona, seg: recorrido, arranco });
  return { ok: true, zona: r.zona, entradas: r.entradas, salidas: r.salidas, recorrido, arranco: !!arranco };
}
