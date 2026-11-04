"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dmh, type Colaborador, type EventoV } from "@/modulos/roturas/seguridad";
import { Ventana } from "./piezas";

/**
 * ASIGNAR (O CAMBIAR) EL RESPONSABLE de una rotura de comportamiento. Es lo que hace que el evento
 * cuente a una persona. Cambiarlo o quitarlo exige un motivo: queda en la bitácora, que nadie edita.
 */
export function Asignar({ evento, colaboradores, cerrar, listo, falla }: {
  evento: EventoV; colaboradores: Colaborador[]; cerrar: () => void; listo: (m: string) => void; falla: (m: string) => void;
}) {
  const [quien, setQuien] = useState(evento.responsable_id ?? "");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambia = !!evento.responsable_id;
  const nuevo = colaboradores.find((c) => c.id === quien);
  const sirve = !!quien && quien !== evento.responsable_id && (!cambia || motivo.trim().length >= 3);

  const guardar = async () => {
    if (!sirve || guardando) return;
    setGuardando(true);
    const { error } = await createClient().rpc("rotura_responsable_poner", { p_id: evento.rotura_id, p_responsable: quien, p_motivo: motivo.trim() || null });
    setGuardando(false);
    if (error) return falla(error.message);
    listo(`${evento.codigo} queda a cargo de ${nuevo?.nombre ?? "la persona escogida"}. Se recalcularon sus eventos del mes.`);
  };

  return (
    <Ventana ojo="ROTURAS · EN SITIO · SEGURIDAD" titulo={cambia ? "Cambiar el responsable" : "Asignar el responsable"} sub={`${evento.codigo} · ${dmh(evento.reportada_en)} · ${evento.cajas} cajas`} cerrar={cerrar} ancho={560}>
      <div className="plr-as">
        <p>Quien causó la rotura. Con esto el evento cuenta a su nombre y se numera dentro del mes. {evento.reportante && <>Quien la reportó fue <b>{evento.reportante}</b>; eso no cuenta en su contra.</>}</p>
        {!colaboradores.length ? <p className="plr-falla-d">No se pudo leer la lista de colaboradores. Falta correr el SQL del plan de reacción o tu rol no tiene Editar en esta pantalla.</p> : (
          <>
            <label htmlFor="plr-quien">Colaborador</label>
            <select id="plr-quien" value={quien} onChange={(e) => setQuien(e.target.value)}>
              <option value="">Escoge a la persona…</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` · ${c.empresa}` : ""}</option>)}
            </select>
            {cambia && (
              <>
                <label htmlFor="plr-motivo">Motivo del cambio</label>
                <textarea id="plr-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={`Hoy figura ${evento.responsable}. ¿Por qué se cambia?`} />
              </>
            )}
          </>
        )}
        <div className="plr-as-b">
          <button type="button" className="plr-bt plr-claro" onClick={cerrar}>Cancelar</button>
          <button type="button" className="plr-bt plr-oro" onClick={guardar} disabled={!sirve || guardando}>{guardando ? "Guardando…" : cambia ? "Cambiar responsable" : "Asignar"}</button>
        </div>
      </div>
    </Ventana>
  );
}
