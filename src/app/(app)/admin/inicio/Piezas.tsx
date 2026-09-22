"use client";

import { useState } from "react";
import { useConfirmar } from "@/components/Confirmar";

/** Copiar la ruta del SQL que falta, con un toque. */
export function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1600) })}
            aria-label={`Copiar ${texto}`}>
      <svg viewBox="0 0 24 24" aria-hidden><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
      {ok ? "Copiado" : "Copiar"}
    </button>
  );
}

/**
 * ENVIAR ACCESO a quien no ha entrado.
 *
 * La clave no se guarda en ninguna parte, así que no hay «la de antes»
 * para reenviar: se genera una nueva (provisional, la cambia al entrar) y
 * sale el mensaje listo —dirección, usuario y clave— para copiar o
 * mandar por WhatsApp.
 */
export function EnviarAcceso({ id, nombre }: { id: string; nombre: string }) {
  const [pedir, dialogo] = useConfirmar();
  const [msg, setMsg] = useState<string | null>(null);
  const [mal, setMal] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function enviar() {
    if (!(await pedir({
      titulo: `¿Enviar acceso a ${nombre}?`,
      dice: <p>Se le genera una <b>clave nueva</b> (la anterior deja de servir) y te sale el mensaje para mandárselo. Al entrar le pedirá cambiarla.</p>,
      confirmar: "Generar y enviar",
    }))) return;
    setYendo(true); setMal(null);
    const r = await fetch("/api/admin/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const j = await r.json().catch(() => ({} as Record<string, string>));
    setYendo(false);
    if (!j.clave) { setMal(j.error ?? "No llegó la clave. Vuelve a intentarlo."); return }
    setMsg(`Hola ${j.nombre || nombre}, ya tienes acceso a CONTROL.\n` +
      `Entra a ${window.location.origin}\nUsuario: ${j.usuario}\nClave: ${j.clave}\n` +
      `Al entrar te va a pedir que la cambies.`);
  }

  if (msg) {
    return (
      <div className="ain-acceso">
        <pre>{msg}</pre>
        <div>
          <button type="button" onClick={() => navigator.clipboard?.writeText(msg).then(() => setCopiado(true))}>{copiado ? "Copiado" : "Copiar mensaje"}</button>
          <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </div>
    );
  }
  return (
    <>
      {dialogo}
      <button type="button" className="ain-enviar" onClick={enviar} disabled={yendo}>{yendo ? "Generando…" : "Enviar acceso"}</button>
      {mal && <span className="ain-mal" role="alert">{mal}</span>}
    </>
  );
}
