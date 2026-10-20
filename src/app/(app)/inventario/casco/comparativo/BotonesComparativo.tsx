"use client";

import { useRef, useState } from "react";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import { BotonesFoto, logoMarca, useFotoCompartir, type TipoFoto } from "@/components/FotoCompartir";
import { PALETA_MARCA } from "@/modulos/rotlinea/hoja";
import type { Unidad } from "@/modulos/casco/comparar";
import type { DatosComparativo, DatosTablaFoto } from "@/modulos/casco/foto-comparativo";

/**
 * LOS BOTONES DE FOTO DEL COMPARATIVO: Dashboard y Tabla, cada uno una imagen para copiar y pegar en
 * un correo o en WhatsApp (igual que en el Tablero). Sale con las fechas, la unidad y los filtros que
 * estén puestos. La foto de la Tabla lee los dos conteos si todavía no se han abierto.
 */
const VALORES = [{ k: "hl", t: "HL" }, { k: "est", t: "Estibas" }, { k: "caj", t: "Cajas" }];

export function BotonesComparativo({ datos, cargarTabla, unidad, cambiarUnidad, unidadesTabla, alternarUnidadTabla }: {
  datos: DatosComparativo | null;
  cargarTabla: () => Promise<DatosTablaFoto | null>;
  unidad: Unidad;
  cambiarUnidad: (u: Unidad) => void;
  /** La Tabla puede llevar varias unidades a la vez. */
  unidadesTabla: Unidad[];
  alternarUnidadTabla: (u: Unidad) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  const fotos = useFotoCompartir(async (tipo: TipoFoto) => {
    setMotivo(null);
    const paleta = leerPaleta(caja.current) ?? PALETA_MARCA;
    const [fo, logo] = await Promise.all([import("@/modulos/casco/foto-comparativo"), logoMarca()]);
    if (tipo === "dashboard") {
      if (!datos) { setMotivo("No hay casco para comparar con esos filtros."); throw new Error("sin datos") }
      return { lienzo: fo.dibujarDashboardComparativo(datos, { paleta, logo }), nombre: fo.nombreDashboardComparativo(datos.diaA, datos.diaB, datos.unidad) };
    }
    const t = await cargarTabla();
    if (!t) { setMotivo("Para la foto de la Tabla escoge dos fechas que caigan en conteos distintos."); throw new Error("sin tabla") }
    return { lienzo: fo.dibujarTablaComparativo(t, { paleta, logo }), nombre: fo.nombreTablaComparativo(t.fA, t.fB, t.unidades) };
  }, "Comparativo de casco", { dashboard: "Dashboard", detalle: "Tabla" }, (tipo: TipoFoto) => tipo === "dashboard"
    ? { titulo: "Unidad", actual: unidad, cambiar: (k) => cambiarUnidad(k as Unidad), valores: VALORES }
    : { titulo: "Unidades", actual: unidadesTabla, cambiar: (k) => alternarUnidadTabla(k as Unidad), valores: VALORES });

  return (
    <div className="cvt-inf" ref={caja}>
      <div className="cvt-inf-bts">
        <BotonesFoto abrir={fotos.abrir} armando={fotos.armando} abierta={fotos.abierta} deshabilitado={false} clase="cvt-inf-bt foto" etiquetaDetalle="Tabla" />
      </div>
      <p className="cvt-inf-nota">Imagen para copiar y pegar, con las fechas y filtros que estén puestos.</p>
      {fotos.mal && <p className="cvt-inf-mal" role="alert">{motivo ?? "No se pudo armar. Recarga la página y vuelve a intentar."}</p>}
      {fotos.vista}
    </div>
  );
}
