"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { misPermisos } from "@/lib/permisos";
import { aHojaGuardada, CENTRO_DE_CASCO, claveEq, compararPeldar, conClaves, emparejarClaves, conAuto, limpio, redondear, SIN_SKU, type Comparacion, type FilaPeldar, type Hoja } from "@/modulos/carnaval/logica";
import { contextoAuto, equivalencias, faltaTabla, ingresosAnulados, ingresosCargados, maestroSku, productosYCorte, RUTA_CUADRE, saldosA, SQL_FALTA } from "@/modulos/carnaval/datos";

/**
 * AG07 CARNAVAL · LO QUE SE GUARDA.
 *  · previsualizarPeldar: compara el archivo de hoy con lo ya cargado y NO guarda nada.
 *  · aplicarPeldar: guarda lo nuevo y SOLO los cambios que una persona aprobó.
 *  · registrarMovimiento: trasiego (resta) o ajuste (suma o resta, con nota).
 *  · anularMovimiento: nada se borra; lo equivocado se anula y queda la huella.
 */
const esSeccionCasco = (titulo: string) => limpio(titulo) in CENTRO_DE_CASCO;
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
      .map((f) => ({ fecha: String(f.fecha), codigo: String(f.codigo).trim(), descripcion: String(f.descripcion ?? ""), remision: String(f.remision).trim(), placa: String(f.placa ?? "").trim().toUpperCase(), pallets: Number(f.pallets), und: Number(f.und) || 0,
        ...(f.em !== undefined || f.ingreso !== undefined ? { ingreso: esDia(String(f.ingreso ?? "")) ? String(f.ingreso) : null, em: String(f.em ?? "").trim() || null } : {}) }));
  } catch { return null }
}

async function comparar(filas: FilaPeldar[]): Promise<{ error: string } | { c: Comparacion; corte: string }> {
  const pc = await productosYCorte();
  if (pc.error) return { error: faltaTabla(pc.error) ? SQL_FALTA : pc.error };
  const ex = await ingresosCargados();
  if (ex.error) return { error: faltaTabla(ex.error) ? SQL_FALTA : ex.error };
  const an = await ingresosAnulados();
  if (an.error) return { error: faltaTabla(an.error) ? SQL_FALTA : an.error };
  return { c: compararPeldar(filas, ex.filas, new Set(pc.productos.map((p) => p.codigo)), pc.corte, an.filas), corte: pc.corte };
}

export async function previsualizarPeldar(filasJson: string): Promise<{ error: string } | { c: Comparacion; corte: string; totalArchivo: number }> {
  const filas = leerFilas(filasJson);
  if (!filas?.length) return { error: "El archivo no se pudo leer." };
  const r = await comparar(filas);
  return "error" in r ? r : { ...r, totalArchivo: filas.length };
}

export async function aplicarPeldar(filasJson: string, aprobadas: string[]): Promise<{ error?: string; nuevas?: number; reactivadas?: number; actualizadas?: number; conEM?: number; sinEM?: number; avisoEM?: string }> {
  const sin = await permiso(); if (sin) return { error: sin };
  const filas = leerFilas(filasJson);
  if (!filas?.length) return { error: "El archivo no se pudo leer." };
  const r = await comparar(filas);   // se rehace aquí: no se confía en lo que mostró la pantalla
  if ("error" in r) return r;
  const supabase = await createClient();
  const user = await usuarioActual();
  const quien = user?.email ?? user?.id ?? "";

  /* Las que estaban anuladas y el archivo vuelve a traer se REACTIVAN (la llave es única: no se pueden insertar otra vez). */
  let reactivadas = 0;
  for (const x of r.c.reactivar) {
    const { data: act } = await supabase.from("carnaval_movimientos").select("historial, fecha, pallets, und").eq("id", x.id).single();
    const historial = [...((act?.historial as unknown[]) ?? []), {
      antes: { anulado: true, fecha: act?.fecha, pallets: act?.pallets, und: act?.und }, despues: { anulado: false, fecha: x.fila.fecha, pallets: x.fila.pallets, und: x.fila.und }, reactivado: true, por: quien, en: new Date().toISOString(),
    }];
    const { error } = await supabase.from("carnaval_movimientos").update({ anulado: false, anulado_motivo: null, anulado_por: null, anulado_en: null, fecha: x.fila.fecha, pallets: x.fila.pallets, und: x.fila.und, historial }).eq("id", x.id);
    if (error) return { error: `Reactivar ${x.clave}: ${error.message}`, reactivadas };
    reactivadas++;
  }

  let nuevas = 0;
  for (let i = 0; i < r.c.nuevas.length; i += 400) {
    const lote = r.c.nuevas.slice(i, i + 400).map((f) => ({
      fecha: f.fecha, tipo: "INGRESO", codigo: f.codigo, pallets: f.pallets, und: f.und, clave: f.clave, remision: f.remision, placa: f.placa || null, nota: "Archivo Peldar",
    }));
    const { error } = await supabase.from("carnaval_movimientos").insert(lote);
    if (error) return { error: faltaTabla(error.message) ? SQL_FALTA : `Se guardaron ${nuevas} y falló el resto: ${error.message}`, nuevas, reactivadas };
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
  /* LA ENTRADA DE MERCANCÍA no es un cambio de cantidades: se pone sola en todas las filas del archivo que la traen (ya cargadas o recién cargadas). */
  let conEM = 0, sinEM = 0, avisoEM: string | undefined;
  const ex0 = await ingresosCargados();
  const conDato = emparejarClaves(conClaves(filas), ex0.filas).filter((f) => f.em !== undefined && f.fecha > r.corte);
  if (conDato.length) {
    const ex = ex0;
    const porClave = new Map(ex.filas.map((e) => [e.clave, e]));
    const lote = conDato.flatMap((f) => {
      const e = porClave.get(f.clave); if (!e) return [];
      return [{ id: e.id, fecha: e.fecha, tipo: "INGRESO", codigo: f.codigo, pallets: e.pallets, ingreso: f.ingreso ?? null, entrada_mercancia: f.em ?? null, em_leida: true }];
    });
    for (let i = 0; i < lote.length; i += 200) {
      const { error } = await supabase.from("carnaval_movimientos").upsert(lote.slice(i, i + 200), { onConflict: "id" });
      if (error) { avisoEM = /ingreso|entrada_mercancia|em_leida|schema cache/i.test(error.message) ? "Falta correr supabase/migraciones/2026-10-carnaval-cuadre-sap.sql para guardar la entrada de mercancía." : `Entrada de mercancía: ${error.message}`; break }
    }
    if (!avisoEM) { conEM = lote.length; sinEM = lote.filter((x) => !x.entrada_mercancia || !x.ingreso).length }
  }
  refrescar();
  return { nuevas, reactivadas, actualizadas, conEM, sinEM, avisoEM };
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


/** Los pallets que lleva la app de cada código al cierre de un día (para validar la hoja de inventario). */
export async function saldosAl(fecha: string): Promise<{ error?: string; saldos?: Record<string, number> }> {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const r = await saldosA(fecha);
  if (r.error) return { error: faltaTabla(r.error) ? SQL_FALTA : r.error };
  return { saldos: Object.fromEntries(r.saldos) };
}

/** Un código de SKU: letras, números y guion (el guion solo = «no es un SKU»). */
const codigoLimpio = (v: unknown): string | null => { const c = typeof v === "string" ? v.trim() : ""; return /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$|^-$/.test(c) ? c : null };

function leerHoja(json: string): Hoja | null {
  try {
    const h = JSON.parse(json);
    if (!h || !esDia(String(h.fecha)) || !Array.isArray(h.secciones) || !h.secciones.length) return null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      fecha: String(h.fecha),
      secciones: h.secciones.map((s: { titulo?: string; colA?: string; colB?: string; filas?: { concepto?: string; a?: unknown; b?: unknown; codigo?: unknown }[] }) => ({
        titulo: String(s.titulo ?? "").trim(), colA: String(s.colA ?? ""), colB: String(s.colB ?? ""),
        filas: (s.filas ?? []).map((f) => ({ concepto: String(f.concepto ?? "").trim(), a: num(f.a), b: num(f.b), codigo: codigoLimpio(f.codigo) })).filter((f) => f.concepto),
      })).filter((s: { titulo: string }) => s.titulo),
    };
  } catch { return null }
}

/**
 * GUARDAR LA HOJA DE UN DÍA. Lo que se trae solo (pallets de la app, casco de AG07 y CA22) se vuelve a leer AQUÍ y se pone encima:
 * no se confía en lo que mande la pantalla. Lo escrito a mano se guarda tal cual. Volver a guardar un día reemplaza la hoja de ese día.
 */
export async function guardarHoja(fecha: string, hojaJson: string): Promise<{ error?: string; ok?: true }> {
  const sin = await permiso(); if (sin) return { error: sin };
  if (!esDia(fecha)) return { error: "Día inválido." };
  let bruta: Record<string, unknown> = {};
  try { bruta = JSON.parse(hojaJson) } catch { /* se avisa abajo */ }
  const leida = leerHoja(JSON.stringify({ ...bruta, fecha }));
  if (!leida) return { error: "La hoja no se pudo leer: revisa que tenga secciones." };
  const eq = await equivalencias();
  const secs = leida.secciones.map((s) => ({ ...s, filas: s.filas.map((f) => ({ ...f, codigo: f.codigo ?? eq[claveEq(s.titulo, f.concepto)] ?? null })) }));
  const { error: eAuto, ctx } = await contextoAuto(fecha);
  if (eAuto) return { error: faltaTabla(eAuto) ? SQL_FALTA : eAuto };
  const finales = aHojaGuardada(conAuto(secs, ctx));
  const supabase = await createClient();
  /* lo que la persona amarró a un SKU queda aprendido para los renglones nuevos */
  const nuevas = finales.flatMap((s) => s.filas.filter((f) => f.codigo && eq[claveEq(s.titulo, f.concepto)] !== f.codigo && !esSeccionCasco(s.titulo)).map((f) => ({ seccion: limpio(s.titulo), concepto: limpio(f.concepto), codigo: f.codigo as string })));
  const unicas = [...new Map(nuevas.map((n) => [`${n.seccion}|${n.concepto}`, n])).values()];
  if (unicas.length) {
    const user = await usuarioActual();
    const { error: e2 } = await supabase.from("carnaval_equivalencias").upsert(unicas.map((n) => ({ ...n, actualizado_por: user?.id ?? null, actualizado_en: new Date().toISOString() })), { onConflict: "seccion,concepto" });
    if (e2) return { error: /carnaval_equivalencias|does not exist|schema cache/i.test(e2.message) ? "Falta correr supabase/migraciones/2026-10-carnaval-codigos.sql en Supabase." : e2.message };
  }
  const { error } = await supabase.from("carnaval_existencias").upsert(
    { fecha, secciones: finales, validacion: [], foto_nombre: null, actualizado_en: new Date().toISOString() }, { onConflict: "fecha" });
  if (error) return { error: /carnaval_existencias|does not exist|schema cache/i.test(error.message) ? "Falta correr supabase/migraciones/2026-10-carnaval-inventario.sql en Supabase." : error.message };
  refrescar();
  return { ok: true };
}

/**
 * AMARRAR UN RENGLÓN DE LA HOJA A UN SKU: «en la sección X, lo que la hoja llama Y es el código Z». Queda para todos los días
 * (la descripción de ese renglón sale desde ahora del maestro). Código «-» = no es un SKU. Código vacío = soltar el amarre.
 */
export async function asignarCodigo(seccion: string, concepto: string, codigo: string): Promise<{ error?: string; ok?: true }> {
  const sin = await permiso(); if (sin) return { error: sin };
  const s = limpio(seccion ?? ""), c = limpio(concepto ?? "");
  if (!s || !c) return { error: "No se entendió el renglón." };
  const supabase = await createClient();
  const cod = (codigo ?? "").trim();
  if (!cod) {
    /* no se borra nada: se vuelve a dejar el renglón sin código ("" no existe en la tabla, así que se marca con el guion y se avisa) */
    return { error: "Elige un código (o «No lleva código»)." };
  }
  if (cod !== SIN_SKU) {
    const m = await maestroSku();
    if (!m.some((x) => x.codigo === cod)) return { error: `El código ${cod} no está en el maestro de SKU.` };
  }
  const user = await usuarioActual();
  const { error } = await supabase.from("carnaval_equivalencias").upsert({ seccion: s, concepto: c, codigo: cod, actualizado_por: user?.id ?? null, actualizado_en: new Date().toISOString() }, { onConflict: "seccion,concepto" });
  if (error) return { error: /carnaval_equivalencias|does not exist|schema cache/i.test(error.message) ? "Falta correr supabase/migraciones/2026-10-carnaval-codigos.sql en Supabase." : error.message };
  refrescar();
  return { ok: true };
}


/**
 * ELIMINAR EL INVENTARIO DE UN DÍA (la hoja guardada). Si esa hoja hizo ajustes de pallets, se pueden anular también (quedan
 * anulados con el motivo, no se borran: el movimiento conserva su huella). Pide motivo.
 */
export async function eliminarInventario(fecha: string, motivo: string, anularAjustes: boolean): Promise<{ error?: string; ok?: true; anulados?: number }> {
  const sin = await permiso(); if (sin) return { error: sin };
  if (!esDia(fecha)) return { error: "Día inválido." };
  const m = (motivo ?? "").trim();
  if (!m) return { error: "Escribe el motivo." };
  const supabase = await createClient();
  const { data: borradas, error } = await supabase.from("carnaval_existencias").delete().eq("fecha", fecha).select("fecha");
  if (error) return { error: faltaTabla(error.message) || /carnaval_existencias|does not exist|schema cache/i.test(error.message) ? "Falta correr supabase/migraciones/2026-10-carnaval-inventario-eliminar.sql en Supabase." : error.message };
  if (!borradas || borradas.length === 0) return { error: "No se pudo eliminar: ya no existe, o falta correr supabase/migraciones/2026-10-carnaval-inventario-eliminar.sql en Supabase." };
  let anulados = 0;
  if (anularAjustes) {
    const user = await usuarioActual();
    const { data, error: e2 } = await supabase.from("carnaval_movimientos")
      .update({ anulado: true, anulado_motivo: `Se eliminó el inventario del ${fecha}: ${m}`, anulado_por: user?.id ?? null, anulado_en: new Date().toISOString() })
      .eq("tipo", "AJUSTE").eq("fecha", fecha).eq("anulado", false).like("nota", `Ajuste por inventario del ${fecha}%`).select("id");
    if (e2) return { error: `El inventario se eliminó, pero no se pudieron anular sus ajustes: ${e2.message}` };
    anulados = data?.length ?? 0;
  }
  refrescar();
  return { ok: true, anulados };
}

/** CUADRE SAP DE AG07: guarda la ZEXI del día (la última subida reemplaza a la anterior) o la quita. */
export async function guardarZexiAg07(fecha: string, filasJson: string, archivo: string): Promise<{ error?: string; ok?: true }> {
  const sin = await permiso(); if (sin) return { error: sin };
  if (!esDia(fecha)) return { error: "Día inválido." };
  let filas: unknown;
  try { filas = JSON.parse(filasJson) } catch { return { error: "La ZEXI no se pudo leer." } }
  if (!Array.isArray(filas) || !filas.length) return { error: "La ZEXI no trae filas." };
  const supabase = await createClient();
  const { error } = await supabase.from("carnaval_zexi").upsert({ fecha, filas, archivo: archivo.slice(0, 200), actualizado_en: new Date().toISOString() }, { onConflict: "fecha" });
  if (error) return { error: faltaTabla(error.message) || /carnaval_zexi/.test(error.message) ? "Falta correr supabase/migraciones/2026-10-carnaval-cuadre-sap.sql en Supabase." : error.message };
  refrescar();
  return { ok: true };
}
export async function quitarZexiAg07(fecha: string): Promise<{ error?: string; ok?: true }> {
  const sin = await permiso(); if (sin) return { error: sin };
  if (!esDia(fecha)) return { error: "Día inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("carnaval_zexi").delete().eq("fecha", fecha);
  if (error) return { error: error.message };
  refrescar();
  return { ok: true };
}
