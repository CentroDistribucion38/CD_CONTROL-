"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";

/* ===================================================================
   EL NOMBRE DE UNA HOJA, con su lápiz para cambiarlo (solo quien puede editar el fiscal).

   «Hoja 2» pasa a verse «Exportación». El número sigue siendo la llave de la hoja; el nombre
   es solo lo que se lee en las pantallas. Dejarlo vacío devuelve «Hoja N». La base comprueba el
   permiso, que el inventario no esté cerrado y que no se repita el nombre en el mismo inventario.
   =================================================================== */
export function NombreHoja({ numero, nombre, hojaId, puedeEditar, alGuardar }: {
  numero: number;
  /** El nombre propio de la hoja; undefined = todavía se llama «Hoja N». */
  nombre?: string;
  hojaId?: string;
  puedeEditar: boolean;
  alGuardar: () => Promise<void> | void;
}) {
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const visto = nombre?.trim() ? nombre : `Hoja ${numero}`;

  async function guardar() {
    if (!hojaId) return;
    setOcupado(true); setMal(null);
    const { error } = await createClient().rpc("inv_fiscal_hoja_renombrar", { p_hoja: hojaId, p_nombre: txt });
    setOcupado(false);
    if (error) {
      setMal(/inv_fiscal_hoja_renombrar|schema cache|does not exist|no existe la funci/i.test(error.message)
        ? "Falta correr 2026-11-fiscal-hojas-nombre.sql en Supabase." : traducirError(error.message));
      return;
    }
    setEditando(false);
    await alGuardar();
  }

  if (!editando) {
    return (
      <>
        <h3>{visto}</h3>
        {puedeEditar && hojaId && (
          <button type="button" className="btn plano" onClick={() => { setTxt(nombre ?? ""); setMal(null); setEditando(true) }}
                  aria-label={`Cambiar el nombre de ${visto}`} title="Cambiar el nombre de la hoja"
                  style={{ padding: "2px 7px", minHeight: 0, opacity: 0.6 }}>✎</button>
        )}
      </>
    );
  }
  return (
    <span role="group" aria-label={`Nombre de la hoja ${numero}`} style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <input value={txt} maxLength={40} autoFocus placeholder={`Hoja ${numero}`} aria-label="Nombre de la hoja"
             onChange={(e) => setTxt(e.target.value)}
             onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") setEditando(false) }}
             style={{ minHeight: 36, width: 190, padding: "0 8px", border: "1px solid #b6bcc5", borderRadius: 0, fontSize: 15 }} />
      <button type="button" className="btn" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar"}</button>
      <button type="button" className="btn plano" disabled={ocupado} onClick={() => setEditando(false)}>Cancelar</button>
      {mal && <small role="alert" style={{ color: "#b71c1c", flexBasis: "100%" }}>{mal}</small>}
      {!mal && <small style={{ color: "#5b6b7f", flexBasis: "100%" }}>Vacío = vuelve a llamarse «Hoja {numero}».</small>}
    </span>
  );
}
