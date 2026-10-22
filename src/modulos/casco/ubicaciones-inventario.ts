import { createClient } from "@/lib/supabase/server";
import { porTandas, todas } from "@/modulos/inventario/paginas";
import { esDueno } from "@/modulos/inventario/duenos";
import { armarUbicaciones, type RenglonUbic, type UbicacionesInventario } from "./ubicaciones-armar";

/**
 * LAS UBICACIONES DE CONTROL SALEN DEL ÚLTIMO INVENTARIO.
 *
 * «Esas ubicaciones deben alimentarse del último inventario: si es AG18 EER Fábrica, del filtro
 *  LAVADO; si es AG22 EER Barranquilla, de lo que dice BAJA.»
 *
 * Es la misma lectura de la hoja «Ubicaciones por estado» del consolidado: del último día con
 * recorridos ENVIADOS, los renglones cuyo estado del envase es el de esa tabla, y por material
 * todas sus ubicaciones en una línea («C04_IZQ - C05_DER - D11_IZQ»), en orden de calle y sin la
 * palabra del estado repetida («C04_IZQ BAJA» con el filtro BAJA dice lo mismo dos veces).
 *
 * Solo las dos tablas que tienen un estado propio. Carnaval y Atlántico se siguen escribiendo a mano.
 */
/* La regla (qué estado le toca a cada columna, qué zona a cada almacén, cómo se arma la línea)
   vive en ubicaciones-armar.ts, que no tiene nada de servidor: la usan también Control y el tablero. */
export type { UbicacionesInventario } from "./ubicaciones-armar";

/** Cuántos días hacia atrás se buscan inventarios enviados. */
const DIAS_ATRAS = 45;

/**
 * Los inventarios enviados de las últimas semanas. Con la sesión de quien mira (RLS): si su rol no ve
 * el inventario, devuelve null y Control sigue igual que siempre, con las ubicaciones a mano.
 */
export async function ubicacionesDelInventario(): Promise<UbicacionesInventario | null> {
  try {
    const supabase = await createClient();
    const { data: ult, error } = await supabase.from("v_conteos_fefo").select("fecha_analisis, bodega_id")
      .eq("estado", "cerrado").not("fecha_analisis", "is", null)
      .order("fecha_analisis", { ascending: false }).limit(1);
    if (error || !ult?.length) return null;
    const ultima = String(ult[0].fecha_analisis).slice(0, 10);
    const desde = new Date(Date.parse(ultima + "T12:00:00Z") - DIAS_ATRAS * 86400000).toISOString().slice(0, 10);
    const { data: cs, error: eC } = await todas<{ id: string; fecha_analisis: string }>((d, h) => supabase.from("v_conteos_fefo")
      .select("id, fecha_analisis").eq("bodega_id", ult[0].bodega_id).eq("estado", "cerrado")
      .gte("fecha_analisis", desde).lte("fecha_analisis", ultima).order("id").range(d, h));
    if (eC || !cs.length) return null;
    const diaDe = new Map(cs.map((c) => [c.id, String(c.fecha_analisis).slice(0, 10)]));
    /* El estado se compara sin mayúsculas ni espacios aquí, no en la consulta: «Baja» o «BAJA »
       también cuentan. */
    const { data: rs, error: eR } = await porTandas<Omit<RenglonUbic, "fecha"> & { id: string; conteo_id: string }>(cs.map((c) => c.id), (t, d, h) => supabase.from("v_conteo_fefo")
      .select("id, conteo_id, codigo, ubicacion, ubicacion_combinada, calle, estado_envase")
      .in("conteo_id", t).not("estado_envase", "is", null)
      .order("id").range(d, h));
    if (eR) return null;
    const base: RenglonUbic[] = rs.map((x) => ({ ...x, fecha: diaDe.get(x.conteo_id) ?? "" }));

    /* ANDINA Y HEINEKEN NO SON UN CÓDIGO DEL CONTEO: son renglones de otros códigos que el Balance reasignó al dueño del envase
       (balance_reclasificaciones). Sus ubicaciones son las de esos renglones: se agregan al conteo como si «ANDINA» / «HEINEKEN»
       se hubieran contado en BAJA, para que el Casco las ponga y no diga «No está en el conteo». Si no se pueden leer, se sigue sin ellas. */
    try {
      const rc = await porTandas<{ conteo_envase_id: string; estado_nuevo: string }>(rs.map((x) => x.id), (t, d, h) =>
        supabase.from("balance_reclasificaciones").select("conteo_envase_id, estado_nuevo, creado_en")
          .in("conteo_envase_id", t).order("creado_en").order("id").range(d, h), 100);
      if (!rc.error) {
        const nuevo = new Map<string, string>();
        for (const x of rc.data) nuevo.set(String(x.conteo_envase_id), x.estado_nuevo);   // la más nueva de cada renglón manda
        for (const x of rs) {
          const dueno = nuevo.get(String(x.id));
          if (!esDueno(dueno)) continue;
          /* Sin la palabra del estado ni la nota «(Andina)»: en la fila de ANDINA solo van los nombres de los sitios. */
          base.push({ codigo: dueno!.trim().toUpperCase(), ubicacion: x.ubicacion ?? x.ubicacion_combinada, ubicacion_combinada: null,
                      calle: x.calle, estado_envase: "BAJA", fecha: diaDe.get(x.conteo_id) ?? "" });
        }
      }
    } catch { /* sin reasignaciones: queda como antes */ }
    return armarUbicaciones(base);
  } catch {
    return null;
  }
}
