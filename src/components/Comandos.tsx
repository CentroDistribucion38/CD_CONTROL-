"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buscar, interpretar, parsear, type Comando } from "@/modulos/comandos";

/**
 * LA BARRA DE COMANDOS de la cabecera (como la de SAP). Ctrl+K lleva el
 * cursor ahí desde cualquier pantalla.
 *
 *   código + Enter        abre la pantalla en ESTA ventana
 *   /o código + Enter     la abre en OTRA ventana (misma sesión, mismo usuario)
 *   Shift+Enter           igual que /o
 *   ↑ ↓                   escoger de la lista
 *   Esc                   limpiar
 *
 * La lista solo trae las pantallas que la persona puede abrir (la arma el
 * layout con sus permisos). Otra ventana comparte la sesión del navegador,
 * así que entra con el mismo usuario sin volver a pedir la clave.
 */
export function Comandos({ comandos }: { comandos: Comando[] }) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [i, setI] = useState(0);
  const [mal, setMal] = useState<string | null>(null);
  /* El cierre al salir del campo espera un instante (para que un clic en la lista cuente); si se
     vuelve a entrar antes, ese cierre pendiente se cancela y no cierra la lista recién abierta. */
  const cierre = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { consulta, nueva } = parsear(texto);
  const lista = useMemo(() => buscar(comandos, consulta), [comandos, consulta]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        campo.current?.focus();
        campo.current?.select();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const ejecutar = (otra: boolean, c?: Comando | null) => {
    const a = interpretar(texto, comandos, c ?? lista[i] ?? null, otra);
    if (a.tipo === "error") { setMal(a.mensaje); return; }
    setMal(null); setTexto(""); setAbierto(false); setI(0);
    campo.current?.blur();
    if (a.nueva) window.open(a.ruta, "_blank");
    else router.push(a.ruta);
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setI((x) => Math.min(x + 1, Math.max(lista.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); ejecutar(e.shiftKey); }
    else if (e.key === "Escape") { setTexto(""); setMal(null); setAbierto(false); campo.current?.blur(); }
  };

  return (
    <div className="sh-cmd" role="search" data-abierto={abierto ? "si" : undefined}>
      <span className="sh-cmd-ic" aria-hidden>›</span>
      <input
        ref={campo}
        className="sh-cmd-in"
        value={texto}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="characters"
        aria-label="Barra de comandos"
        aria-expanded={abierto && lista.length > 0}
        aria-controls="sh-cmd-lista"
        placeholder="Comando…  Ctrl+K"
        onChange={(e) => { if (cierre.current) clearTimeout(cierre.current); setTexto(e.target.value); setI(0); setMal(null); setAbierto(true); }}
        onFocus={() => { if (cierre.current) clearTimeout(cierre.current); setAbierto(true); }}
        onBlur={() => { cierre.current = setTimeout(() => setAbierto(false), 120); }}
        onKeyDown={teclas}
      />
      {abierto && (texto.trim() || mal) && (
        <div className="sh-cmd-panel" id="sh-cmd-lista" role="listbox">
          {mal ? <p className="sh-cmd-mal">{mal}</p> : lista.length === 0 && consulta ? (
            <p className="sh-cmd-mal">No hay una pantalla «{consulta}» que puedas abrir.</p>
          ) : lista.map((c, k) => (
            <button type="button" key={c.codigo} role="option" aria-selected={k === i}
                    className={"sh-cmd-op" + (k === i ? " on" : "")}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setI(k)}
                    onClick={() => ejecutar(nueva, c)}>
              <code>{c.codigo}</code>
              <span>{c.nombre}</span>
              <small>{c.modulo}</small>
            </button>
          ))}
          <p className="sh-cmd-pie">Enter abre aquí · <b>/o</b> o Shift+Enter abre otra ventana</p>
        </div>
      )}
    </div>
  );
}
