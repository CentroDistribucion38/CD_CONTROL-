"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  HOJA_BAJAS,
  HOJA_PROD,
  leerBajas,
  leerProduccion,
  type FilaBaja,
  type FilaProduccion,
} from "@/modulos/quiebra/importar";

type Resumen = {
  archivo: string;
  bajas: FilaBaja[];
  produccion: FilaProduccion[];
  descartadas: number;
  desde: string;
  hasta: string;
};

const nf = new Intl.NumberFormat("es-CO");
const LOTE = 500;

export default function ImportarPage() {
  const router = useRouter();
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avance, setAvance] = useState(0);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null); setListo(null); setResumen(null); setLeyendo(true);

    try {
      const libro = XLSX.read(await archivo.arrayBuffer(), { cellDates: true });
      const faltan = [HOJA_BAJAS, HOJA_PROD].filter((h) => !libro.SheetNames.includes(h));
      if (faltan.length) {
        setError(
          `Al archivo le faltan las hojas ${faltan.join(" y ")}. ` +
          `Trae: ${libro.SheetNames.slice(0, 8).join(", ")}…`
        );
        setLeyendo(false);
        return;
      }

      const b = leerBajas(XLSX.utils.sheet_to_json(libro.Sheets[HOJA_BAJAS]));
      const p = leerProduccion(XLSX.utils.sheet_to_json(libro.Sheets[HOJA_PROD]));

      if (!b.filas.length && !p.filas.length) {
        setError("Las dos hojas están vacías o no se reconocieron las columnas.");
        setLeyendo(false);
        return;
      }

      const fechas = [...b.filas.map((x) => x.fecha), ...p.filas.map((x) => x.fecha)].sort();
      setResumen({
        archivo: archivo.name,
        bajas: b.filas,
        produccion: p.filas,
        descartadas: b.descartadas + p.descartadas,
        desde: fechas[0],
        hasta: fechas[fechas.length - 1],
      });
    } catch (err) {
      setError("No se pudo leer el archivo: " + (err as Error).message);
    }
    setLeyendo(false);
  }

  async function guardar() {
    if (!resumen) return;
    setGuardando(true); setError(null); setAvance(0);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Se borra SOLO el rango de fechas que trae el archivo, para que un
      //    archivo parcial no arrase con el histórico anterior.
      const { error: eLimpiar } = await supabase.rpc("quiebra_limpiar_rango", {
        p_desde: resumen.desde,
        p_hasta: resumen.hasta,
      });
      if (eLimpiar) throw new Error(eLimpiar.message);

      // 2. Bitácora de la carga
      const { data: carga, error: eCarga } = await supabase
        .from("quiebra_cargas")
        .insert({
          archivo: resumen.archivo,
          desde: resumen.desde,
          hasta: resumen.hasta,
          filas_bajas: resumen.bajas.length,
          filas_produccion: resumen.produccion.length,
          cargado_por: user?.id ?? null,
        })
        .select("id")
        .single();
      if (eCarga) throw new Error(eCarga.message);

      // 3. Inserción por lotes
      const total = resumen.bajas.length + resumen.produccion.length;
      let hechas = 0;

      for (let i = 0; i < resumen.bajas.length; i += LOTE) {
        const trozo = resumen.bajas.slice(i, i + LOTE).map((f) => ({ ...f, carga_id: carga.id }));
        const { error } = await supabase.from("quiebra_bajas").insert(trozo);
        if (error) throw new Error(error.message);
        hechas += trozo.length;
        setAvance(Math.round((hechas / total) * 100));
      }
      for (let i = 0; i < resumen.produccion.length; i += LOTE) {
        const trozo = resumen.produccion.slice(i, i + LOTE).map((f) => ({ ...f, carga_id: carga.id }));
        const { error } = await supabase.from("quiebra_produccion").insert(trozo);
        if (error) throw new Error(error.message);
        hechas += trozo.length;
        setAvance(Math.round((hechas / total) * 100));
      }

      setListo(
        `Quedaron ${nf.format(resumen.bajas.length)} bajas y ` +
        `${nf.format(resumen.produccion.length)} órdenes, del ${resumen.desde} al ${resumen.hasta}.`
      );
      setResumen(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setGuardando(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="banda">
        <div className="titulo">
          <p className="eyebrow">Envase retornable · Ag01</p>
          <h1>Importar el maestro</h1>
          <p>
            Sube el archivo y el tablero se actualiza. Se leen únicamente las hojas{" "}
            <b>{HOJA_BAJAS}</b> y <b>{HOJA_PROD}</b>; el resto del libro se ignora.
          </p>
        </div>
      </div>

      <div className="bloque">
        <label className="etiqueta" htmlFor="archivo">Archivo de Excel</label>
        <input
          id="archivo"
          type="file"
          accept=".xlsx,.xlsm,.xls"
          className="campo"
          onChange={elegir}
          disabled={leyendo || guardando}
        />
        <p className="sub" style={{ marginTop: 8 }}>
          Se procesa en tu navegador; nada se envía hasta que confirmes.
        </p>

        {leyendo && <p className="sub" style={{ marginTop: 12 }}>Leyendo el archivo…</p>}

        {error && (
          <p style={{ marginTop: 14, borderRadius: 8, padding: "10px 14px",
                      background: "#fdeceb", color: "#a4271c", fontSize: 13 }}>
            {error}
          </p>
        )}

        {listo && (
          <div style={{ marginTop: 14, borderRadius: 8, padding: "10px 14px",
                        background: "#e9f6ef", color: "#14653f", fontSize: 13 }}>
            {listo}{" "}
            <Link href="/quiebra" className="enlace">Ver el tablero</Link>
          </div>
        )}
      </div>

      {resumen && (
        <div className="bloque">
          <div className="bh">
            <div>
              <h2>Esto es lo que se va a cargar</h2>
              <p>Revisa antes de confirmar</p>
            </div>
          </div>

          <div className="cifras" style={{ boxShadow: "none" }}>
            <div className="cifra">
              <div className="ct">Bajas</div>
              <div className="cv">{nf.format(resumen.bajas.length)}</div>
              <div className="cn">movimientos</div>
            </div>
            <div className="cifra">
              <div className="ct">Producción</div>
              <div className="cv">{nf.format(resumen.produccion.length)}</div>
              <div className="cn">órdenes</div>
            </div>
            <div className="cifra">
              <div className="ct">Período</div>
              <div className="cv" style={{ fontSize: 17 }}>{resumen.desde}</div>
              <div className="cn">hasta {resumen.hasta}</div>
            </div>
          </div>

          <p className="sub" style={{ marginTop: 14 }}>
            Se reemplazan las fechas entre <b>{resumen.desde}</b> y <b>{resumen.hasta}</b>.
            Lo que esté fuera de ese rango no se toca.
            {resumen.descartadas > 0 && (
              <> Se descartaron {nf.format(resumen.descartadas)} filas sin fecha o con
              cantidad en cero.</>
            )}
          </p>

          {guardando && (
            <div style={{ marginTop: 14 }}>
              <div style={{ height: 6, borderRadius: 99, background: "var(--bv-linea)" }}>
                <div style={{ height: 6, borderRadius: 99, width: `${avance}%`,
                              background: "linear-gradient(90deg,#4c93ea,#1f6fd0)",
                              transition: "width .2s" }} />
              </div>
              <p className="sub" style={{ marginTop: 6 }}>Guardando… {avance}%</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn-primario" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Confirmar e importar"}
            </button>
            <button className="btn-secundario" onClick={() => setResumen(null)} disabled={guardando}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
