/**
 * EXPORTAR ACCIONES CORRECTIVAS.
 *
 * Se arma en el SERVIDOR y no en el navegador: en un celular, armar un
 * libro de mil filas en memoria es medio minuto de teléfono trabado.
 * Aquí se arma y al navegador le llega un archivo.
 *
 * Y SIGUE APLICANDO RLS: el cliente lleva la sesión del usuario, no una
 * llave de servicio. Nadie exporta lo que no podría ver en pantalla.
 *
 * Esta ruta solo BUSCA. Armar el libro es de src/modulos/acciones/libro.ts,
 * que se puede correr con datos de prueba y abrir el archivo para ver si
 * de verdad quedó bien, sin levantar el servidor.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acciones, porArea, parametros } from "@/modulos/acciones/datos";
import { nombresTodos } from "@/modulos/sider/datos";
import { armarLibro } from "@/modulos/acciones/libro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const [datos, areas, par, nombres] = await Promise.all([
    acciones(5000),
    porArea(),
    parametros(),
    nombresTodos(),
  ]);

  if (datos.falta) {
    return NextResponse.json(
      { error: "Falta correr supabase/modulos/acciones.sql en Supabase." }, { status: 500 });
  }

  const buffer = await armarLibro({
    acciones: datos.acciones,
    areas,
    nombres,
    meta: par.par["meta_efectividad"] ?? 90,
    tope: par.par["reincidencia_veces"] ?? 3,
  });

  const hoy = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="acciones-cd38-${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
