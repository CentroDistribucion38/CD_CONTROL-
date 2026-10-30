"use client";

import { useActionState } from "react";
import { entrar } from "./actions";

export function Codigo() {
  const [estado, accion, cargando] = useActionState(entrar, null);
  return (
    <main className="ci-puerta">
      <form action={accion} className="ci-caja" autoComplete="off">
        <p className="ci-ojo">Acceso restringido</p>
        <h1>Código</h1>
        <input name="codigo" type="password" autoFocus required inputMode="text" autoComplete="off" aria-label="Código de acceso" aria-invalid={estado?.mal ? true : undefined} />
        {estado?.mal && <p className="ci-mal" role="alert">Código incorrecto.</p>}
        <button type="submit" disabled={cargando}>{cargando ? "Verificando…" : "Entrar"}</button>
      </form>
    </main>
  );
}
