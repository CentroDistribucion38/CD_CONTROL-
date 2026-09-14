"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * MOVERSE DE DÍA.
 *
 * Misma idea que la barra de Traspasos —flechas de ± un día, la fecha
 * en el medio, HOY para volver— pero con su propio marcado: la de allá
 * vive dentro de `.tp` y arrastra el CSS del otro módulo. Copiar cien
 * líneas de estilos para reusar tres botones sale más caro que estos
 * treinta renglones.
 *
 * EL DÍA VIAJA EN LA DIRECCIÓN, no en el estado de la pantalla: así el
 * turno de la noche puede dejar abierto el día anterior, mandarlo por
 * chat y que al otro le abra lo mismo.
 */
export function Dias({ dia, hoy, esHoy }: { dia: string; hoy: string; esHoy: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  /* Se cambia la fecha y se deja lo demás que traiga la dirección. */
  const con = (cambio: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params.toString());
    cambio(p);
    const q = p.toString();
    router.push(q ? `/quiebra/rotura?${q}` : "/quiebra/rotura");
  };
  const ir = (f: string) => con((p) => p.set("d", f));
  const mover = (n: number) =>
    ir(new Date(Date.parse(dia + "T12:00:00") + n * 86400_000).toISOString().slice(0, 10));

  const bonita = new Date(Date.parse(dia + "T12:00:00")).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="rl-dias">
      <button type="button" onClick={() => mover(-1)} aria-label="día anterior">
        <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
      </button>

      {/* Un input de fecha de verdad y no un calendario propio: en el
          celular abre el selector del sistema, que es el que la gente
          ya sabe usar y el que tiene el tamaño correcto para el dedo. */}
      <label className="rl-fecha">
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span>{bonita}</span>
        <input type="date" value={dia} aria-label="Día"
               onChange={(e) => e.target.value && ir(e.target.value)} />
      </label>

      <button type="button" onClick={() => mover(1)} aria-label="día siguiente">
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>

      <button type="button" className={"rl-hoy" + (esHoy ? " on" : "")} disabled={esHoy}
              onClick={() => con((p) => p.delete("d"))}>HOY</button>
    </div>
  );
}
