"use client";

/**
 * UNA HOJA GENERADA, EN LA LISTA DEL TABLERO — y lo que el administrador
 * puede hacer con ella: anularla, con motivo, o quitar la anulación.
 *
 * ANULAR Y NO EDITAR: el PDF es el papel que se firmó. Si se cambiaran
 * los datos del renglón, el PDF seguiría diciendo lo de antes.
 *
 * EL MOTIVO SE ESCRIBE AQUÍ MISMO, en una fila que se abre debajo, y no
 * en un `prompt()` del navegador: en el teléfono esa ventanita tapa la
 * hoja que se está anulando y no deja ver qué día era.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const fmt = (n: number) => Math.round(n).toLocaleString("es-CO");
const dia = (f: string) =>
  new Date(Date.parse(f + "T12:00:00")).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
const hora = (s: string) =>
  new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

export type HojaFila = {
  id: string; fecha: string; generado_en: string; unidades: number;
  generado_nombre: string | null; elaboro: string | null; supervisor: string | null; url: string | null;
  anulada_en?: string | null; anulada_motivo?: string | null; anulada_nombre?: string | null;
};

export function FilaHoja({ h, vieja, cambio, puedeAnular }: {
  h: HojaFila;
  /** No es la última del día: hay una generada después. */
  vieja: boolean;
  /** El día cambió después de generarla. */
  cambio: boolean;
  puedeAnular: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [haciendo, setHaciendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anulada = h.anulada_en != null;
  const columnas = puedeAnular ? 6 : 5;

  async function hacer() {
    setHaciendo(true);
    setError(null);
    const supabase = createClient();
    const { error } = anulada
      ? await supabase.rpc("rotlinea_hoja_restituir", { p_id: h.id })
      : await supabase.rpc("rotlinea_hoja_anular", { p_id: h.id, p_motivo: motivo.trim() });
    setHaciendo(false);
    if (error) {
      setError(/rotlinea_hoja_(anular|restituir)/.test(error.message)
        ? "Falta correr 2026-09-rotura-linea-hojas.sql en Supabase."
        : error.message);
      return;
    }
    setAbierto(false);
    setMotivo("");
    router.refresh();
  }

  const corto = motivo.trim().length < 5;

  return (
    <>
      <tr className={anulada ? "rl-hojas-anulada" : vieja ? "rl-hojas-vieja" : undefined}>
        <td>
          <b>{dia(h.fecha)}</b>
          <small>{hora(h.generado_en)}</small>
        </td>
        <td>{h.generado_nombre ?? h.elaboro ?? "—"}</td>
        <td>{h.supervisor ?? "—"}</td>
        <td className="cen rl-und">
          {anulada ? <s className="rl-hojas-cifra">{fmt(Number(h.unidades))}</s> : fmt(Number(h.unidades))}
          {anulada
            ? <span className="rl-hojas-motivo">Anulada{h.anulada_nombre ? ` por ${h.anulada_nombre}` : ""}: {h.anulada_motivo}</span>
            : cambio && <span className="rl-hojas-cambio">cambió después</span>}
        </td>
        <td className="cen">
          {h.url
            ? <a href={h.url} target="_blank" rel="noopener noreferrer">Abrir</a>
            : <span className="rl-hojas-sin">—</span>}
        </td>
        {puedeAnular && (
          <td className="cen">
            <button type="button" className="rl-hojas-accion" aria-expanded={abierto}
                    onClick={() => { setAbierto(!abierto); setError(null) }}>
              {anulada ? "Quitar anulación" : "Anular"}
            </button>
          </td>
        )}
      </tr>

      {puedeAnular && abierto && (
        <tr className="rl-hojas-anular">
          <td colSpan={columnas}>
            {anulada ? (
              <p>
                La hoja del <b>{dia(h.fecha)}</b> de las {hora(h.generado_en)} vuelve a contar como
                la hoja de ese día.
              </p>
            ) : (
              <label>
                <span>Por qué se anula la hoja del {dia(h.fecha)} de las {hora(h.generado_en)}</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200}
                       placeholder="Ej.: se generó antes de cerrar el turno C" autoFocus />
              </label>
            )}
            {error && <p className="rl-hojas-error" role="alert">{error}</p>}
            <div className="rl-hojas-botones">
              <button type="button" className="rl-hojas-si" disabled={haciendo || (!anulada && corto)}
                      onClick={hacer}>
                {haciendo ? "Un momento…" : anulada ? "Quitar la anulación" : "Anular la hoja"}
              </button>
              <button type="button" className="rl-hojas-no" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
