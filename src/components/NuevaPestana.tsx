"use client";

import { useEffect } from "react";

/**
 * CTRL+K = OTRA PESTAÑA DE CONTROL (como abrir una sesión nueva en SAP).
 *
 * Abre CONTROL en otra pestaña, en la portada, y esa pestaña se usa normal,
 * igual que la primera: el mismo usuario (la sesión es la del navegador, no
 * pide la clave otra vez) y cada pestaña con su propio módulo. No se escribe
 * nada. Se le quita el uso que el navegador le da a Ctrl+K (su buscador).
 */
export function NuevaPestana() {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.open("/inicio", "_blank");
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  return null;
}
