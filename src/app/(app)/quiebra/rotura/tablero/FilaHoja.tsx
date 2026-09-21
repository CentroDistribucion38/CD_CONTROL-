"use client";

/**
 * UN INFORME GENERADO — su tarjeta en la hoja de informes, con lo que se
 * hace con él: verlo, descargarlo y, quien administra, anularlo o quitar
 * la anulación.
 *
 * TARJETA Y NO FILA DE TABLA: como tabla, en el celular «Abrir» quedaba
 * fuera de la pantalla y había que deslizar para encontrarlo.
 *
 * ANULAR Y NO EDITAR: el PDF es el papel que se firmó. Si se cambiaran
 * los datos del renglón, el PDF seguiría diciendo lo de antes.
 *
 * EL MOTIVO SE ESCRIBE AQUÍ MISMO y no en un `prompt()` del navegador:
 * en el teléfono esa ventanita tapa la hoja que se está anulando.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const fmt = (n: number) => Math.round(n).toLocaleString("es-CO");
export const dia = (f: string) =>
  new Date(Date.parse(f + "T12:00:00")).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
export const hora = (s: string) =>
  new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

export type HojaFila = {
  id: string; fecha: string; generado_en: string; unidades: number; kg?: number; lineas?: number;
  generado_nombre: string | null; elaboro: string | null; supervisor: string | null; url: string | null;
  anulada_en?: string | null; anulada_motivo?: string | null; anulada_nombre?: string | null;
};

/** El nombre con que se guarda al descargar: el día y la hora, para que dos del mismo día no se pisen. */
export const nombreDescarga = (h: HojaFila) =>
  `rotura-linea-${h.fecha}-${hora(h.generado_en).replace(/\D/g, "").slice(0, 4)}.pdf`;

export function TarjetaHoja({ h, vieja, cambio, puedeAnular, elegida, ver, descargar }: {
  h: HojaFila;
  /** No es la última del día: hay una generada después. */
  vieja: boolean;
  /** El día cambió después de generarla. */
  cambio: boolean;
  puedeAnular: boolean;
  /** Es la que se está viendo en la vista previa. */
  elegida: boolean;
  ver: () => void;
  descargar: () => void;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [haciendo, setHaciendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anulada = h.anulada_en != null;

  async function hacer() {
    setHaciendo(true);
    setError(null);
    const supabase = createClient();
    const { error } = anulada
      ? await supabase.rpc("rotlinea_hoja_restituir", { p_id: h.id })
      : await supabase.rpc("rotlinea_hoja_anular", { p_id: h.id, p_motivo: motivo.trim() });
    setHaciendo(false);
    if (error) {
      setError(/could not find the function|schema cache/i.test(error.message)
        ? "Falta correr 2026-09-rotura-linea-hojas.sql en Supabase."
        : error.message);
      return;
    }
    setAbierto(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <article className={"rl-inf" + (anulada ? " anulada" : vieja ? " vieja" : "") + (elegida ? " elegida" : "")}>
      <header className="rl-inf-cab">
        <p className="rl-inf-dia"><b>{dia(h.fecha)}</b><span>generada a las {hora(h.generado_en)}</span></p>
        <p className="rl-inf-und">
          {anulada ? <s className="rl-hojas-cifra">{fmt(Number(h.unidades))}</s> : fmt(Number(h.unidades))}
          <span> und</span>
        </p>
      </header>
      <p className="rl-inf-quien">
        Generó <b>{h.generado_nombre ?? h.elaboro ?? "—"}</b> · supervisor <b>{h.supervisor ?? "—"}</b>
      </p>
      {anulada && (
        <p className="rl-hojas-motivo">Anulada{h.anulada_nombre ? ` por ${h.anulada_nombre}` : ""}: {h.anulada_motivo}</p>
      )}
      {!anulada && cambio && <p className="rl-hojas-cambio">El día cambió después de generarla: genera otra.</p>}
      {!anulada && vieja && <p className="rl-inf-nota">Hay una más nueva de este día.</p>}

      <div className="rl-inf-acc">
        {h.url ? (
          <>
            <button type="button" className="rl-inf-btn si" onClick={ver} aria-pressed={elegida}>Ver</button>
            <button type="button" className="rl-inf-btn" onClick={descargar}>Descargar</button>
            <a className="rl-inf-btn" href={h.url} target="_blank" rel="noopener noreferrer">Abrir en pestaña</a>
          </>
        ) : (
          <span className="rl-hojas-sin">El PDF no se pudo abrir</span>
        )}
        {puedeAnular && (
          <button type="button" className="rl-hojas-accion" aria-expanded={abierto}
                  onClick={() => { setAbierto(!abierto); setError(null) }}>
            {anulada ? "Quitar anulación" : "Anular"}
          </button>
        )}
      </div>

      {puedeAnular && abierto && (
        <div className="rl-hojas-anular">
          {anulada ? (
            <p>La hoja del <b>{dia(h.fecha)}</b> de las {hora(h.generado_en)} vuelve a contar como la hoja de ese día.</p>
          ) : (
            <label>
              <span>Por qué se anula la hoja del {dia(h.fecha)} de las {hora(h.generado_en)}</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200}
                     placeholder="Ej.: se generó antes de cerrar el turno C" autoFocus />
            </label>
          )}
          {error && <p className="rl-hojas-error" role="alert">{error}</p>}
          <div className="rl-hojas-botones">
            <button type="button" className="rl-hojas-si" disabled={haciendo || (!anulada && motivo.trim().length < 5)}
                    onClick={hacer}>
              {haciendo ? "Un momento…" : anulada ? "Quitar la anulación" : "Anular la hoja"}
            </button>
            <button type="button" className="rl-hojas-no" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </article>
  );
}
