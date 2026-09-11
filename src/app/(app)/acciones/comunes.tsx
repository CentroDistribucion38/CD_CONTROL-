"use client";

import type { Accion } from "@/modulos/acciones/datos";

/**
 * LO QUE COMPARTEN LAS TRES LISTAS.
 *
 * Mis acciones, Por verificar y Todas pintan la misma fila y la misma
 * forma de decir el tiempo. Si cada una tuviera su copia, el día que
 * "vence en 3 h" haya que decirlo distinto habría tres sitios donde
 * cambiarlo y dos se quedarían viejos.
 */

/** El tiempo en palabras. Lo vencido se dice en positivo y en rojo:
 *  "hace 3 días" se entiende; "-72 h" hay que traducirlo mentalmente. */
export function cuandoVence(a: Accion) {
  if (!a.viva) return { txt: "", mal: false };
  const h = a.horas_restantes;
  if (h < 0) {
    const d = Math.floor(-h / 24);
    return { txt: d >= 1 ? `vencida hace ${d} día${d === 1 ? "" : "s"}` : `vencida hace ${-h} h`, mal: true };
  }
  if (h < 24) return { txt: `vence en ${h} h`, mal: h <= 8 };
  const d = Math.round(h / 24);
  return { txt: `vence en ${d} día${d === 1 ? "" : "s"}`, mal: false };
}

export function fecha(s: string | null) {
  return s ? new Date(s).toLocaleString("es-CO", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }) : "";
}

export function quien(nombres: Record<string, string>, id: string | null) {
  return id ? (nombres[id] ?? "—") : "sin asignar";
}

/**
 * Una fila de acción. Los hijos son el panel que cada pantalla abre
 * debajo —cerrar, verificar, asignar—, que va DENTRO de la misma fila a
 * propósito: quien escribe qué hizo tiene que seguir viendo de cuál
 * acción está hablando.
 */
export function Fila({ a, nombres, derecha, children }: {
  a: Accion;
  nombres: Record<string, string>;
  derecha?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const v = cuandoVence(a);
  const hoy = a.viva && a.horas_restantes >= 0 && a.horas_restantes < 24;

  return (
    <div className={"fila" + (a.vencida ? " vencida" : hoy ? " hoy" : "")}>
      <div className="cod">{a.codigo}</div>

      <div>
        <div className="tit">{a.titulo}</div>
        <div className="meta">
          <span className={"eti " + a.prioridad}>{a.prioridad.toUpperCase()}</span>
          {a.tipo === "preventiva" && <span className="eti preventiva">PREVENTIVA</span>}
          <span>{a.area_nombre}</span>
          <span>·</span>
          <b>{a.zona_nombre ?? a.ubicacion}</b>
          {a.responsable && <><span>·</span><span>{quien(nombres, a.responsable)}</span></>}
          {a.veces_aqui > 1 && (
            <>
              <span>·</span>
              {/* No es un adorno: es el aviso de que esto se está
                  volviendo un problema de proceso y no de turno. */}
              <span className="eti alta">{a.veces_aqui}ª VEZ AQUÍ</span>
            </>
          )}
          {a.auto_verificada && (
            <>
              <span>·</span>
              <span title="La cerró y la verificó la misma persona">cerró y verificó el mismo</span>
            </>
          )}
        </div>
        {children}
      </div>

      <div className="der">
        {a.viva
          ? <span className={"plazo " + (v.mal ? "mal" : "ok")}>{v.txt}</span>
          : <span className={"eti " + a.estado}>{a.estado.toUpperCase()}</span>}
        {derecha}
      </div>
    </div>
  );
}

/** El mensaje de cuando falta correr el SQL. Dice qué archivo, no "error". */
export function SinTablas() {
  return (
    <section className="sin-tablas">
      <h2>Falta crear el módulo en Supabase</h2>
      <p>
        Abre el SQL Editor de Supabase y ejecuta <code>supabase/modulos/acciones.sql</code>.
        Ese archivo crea las tablas, siembra las zonas y los motivos, deja los plazos por
        prioridad y arma el bucket privado de las fotos. Se puede correr varias veces sin
        romper nada.
      </p>
    </section>
  );
}
