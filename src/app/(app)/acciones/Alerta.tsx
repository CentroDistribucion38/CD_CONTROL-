"use client";

import Link from "next/link";

/**
 * LA ALERTA DEL TURNO — lo que te toca a TI, ahora.
 *
 * Sin esto, el módulo dependía de que la gente entrara a mirar. Nadie
 * entra a mirar si algo le venció: entra cuando tiene tiempo, que es
 * justo cuando ya no lo tiene.
 *
 * QUÉ DICE Y EN QUÉ ORDEN. Primero lo vencido, después lo que vence hoy,
 * después lo que se le asignó desde la última vez. Es el orden en que hay
 * que actuar, no el orden en que llegó.
 *
 * SOLO SALE SI HAY ALGO. Una barra permanente que dice "0 pendientes" se
 * vuelve parte del fondo en tres días, y el día que diga 6 nadie la va a
 * ver. La alerta que no aparece siempre es la que se lee cuando aparece.
 *
 * POR QUÉ NO ES UNA NOTIFICACIÓN DEL TELÉFONO. Las notificaciones push de
 * verdad necesitan llaves VAPID y un servidor que las mande; eso no está
 * montado y prometerlo sin montarlo sería peor que no tenerlo. Esto es lo
 * que sí se puede sostener hoy: al abrir la app, lo tuyo primero. Cuando
 * haya push, esta barra sigue sirviendo igual.
 */
export function Alerta({ vencidas, hoy, sinVer, esMio }: {
  vencidas: number;
  hoy: number;
  /** Asignadas y todavía sin abrir por quien las tiene. */
  sinVer: number;
  /** true = es la pantalla de "mis acciones"; false = la del supervisor. */
  esMio: boolean;
}) {
  if (!vencidas && !hoy && !sinVer) return null;

  const grave = vencidas > 0;

  return (
    <div className={"ac-alerta" + (grave ? " grave" : "")} role="status">
      <span className="signo" aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M12 3.2l9 15.8H3z" />
          <path d="M12 10v4M12 17v.01" />
        </svg>
      </span>

      <span className="txt">
        {vencidas > 0 && (
          <>
            <b>{vencidas} {esMio ? "tuya" : ""}{vencidas === 1 ? "" : "s"} se pasó del plazo</b>
            {vencidas === 1 ? "" : "n"}
            {hoy > 0 || sinVer > 0 ? " · " : ". "}
          </>
        )}
        {hoy > 0 && (
          <>
            {hoy} vence{hoy === 1 ? "" : "n"} <b>hoy</b>
            {sinVer > 0 ? " · " : ". "}
          </>
        )}
        {sinVer > 0 && (
          <>
            {sinVer} recién asignada{sinVer === 1 ? "" : "s"}
            {esMio ? " a ti" : " sin abrir"}.{" "}
          </>
        )}
        {grave
          ? "Esas son las que se van a nombrar en el arranque de turno."
          : "Todavía se alcanzan."}
      </span>

      {!esMio && (
        <Link href="/acciones/mias" className="ir">Ver las mías</Link>
      )}
    </div>
  );
}
