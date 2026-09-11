"use client";

import type { Rotura } from "@/modulos/roturas/datos";
import { COLOR_VIDRIO, fecha, hace, kilos, quien } from "@/modulos/roturas/formato";

/**
 * LO QUE COMPARTEN LAS PANTALLAS DE ROTURAS.
 *
 * En sitio y Visto bueno pintan la misma fila. Si cada una tuviera su
 * copia, el día que el filo rojo del "no asumida" haya que dibujarlo
 * distinto habría dos sitios donde cambiarlo y uno se quedaría viejo.
 *
 * Las funciones de formato viven en modulos/roturas/formato.ts y aquí
 * solo se reexportan: este archivo es "use client", y lo que se importe
 * de él desde una página del servidor llegaría como referencia y no como
 * función.
 */

export { fecha, hace, kilos, quien };

/** El color del vidrio como punto: es lo que se separa para vender. */
export function Vidrio({ color }: { color: string | null }) {
  if (!color) return null;
  return (
    <span className={"vidrio " + color}>
      <i aria-hidden />{COLOR_VIDRIO[color] ?? color}
    </span>
  );
}

/**
 * Una rotura. El FILO ROJO del "no asumida" no es decoración: es la
 * diferencia entre "el OL lo reconoce" y "estamos diciendo que no fue
 * nuestro", que es justo la decisión que ABI toma de un vistazo.
 */
export function Fila({ r, nombres, derecha, children }: {
  r: Rotura;
  nombres: Record<string, string>;
  derecha?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={"fila" + (r.grupo === "no_asumida" ? " roja" : "")
                  + (r.estado === "anulada" ? " gris" : "")}>
      <div className="cod">{r.codigo}</div>

      <div>
        <div className="tit">
          {r.material_nombre}
          {" · "}
          {r.tipo === "producto_terminado"
            ? `${r.unidades} empaque${r.unidades === 1 ? "" : "s"}`
              + (r.botellas != null ? ` · ${r.botellas} botella${r.botellas === 1 ? "" : "s"}` : "")
            : `${r.unidades} unidad${r.unidades === 1 ? "" : "es"}`}
        </div>
        <div className="meta">
          <span className={"eti " + r.grupo}>
            {r.grupo === "no_asumida" ? "NO ASUMIDA" : "ASUMIDA"}
          </span>
          <Vidrio color={r.color} />
          <span>·</span>
          <b>{r.proceso_nombre}</b>
          <span>·</span>
          <span>{r.causa_nombre}</span>
          {r.le_falta_foto && (
            <>
              <span>·</span>
              {/* Se dice ANTES de que ABI la abra: es lo que va a
                  devolver, y devolverlo aquí ahorra el viaje. */}
              <span className="eti falta">LE FALTA LA FOTO</span>
            </>
          )}
        </div>
        <div className="meta">
          <span>{hace(r.minutos)}</span>
          <span>·</span>
          <span>{quien(nombres, r.reportada_por)}</span>
          {r.descripcion && <><span>·</span><span>{r.descripcion}</span></>}
        </div>
        {children}
      </div>

      <div className="der">
        <span className={"eti " + r.estado}>
          {r.estado === "esperando" ? "ESPERA VISTO BUENO"
            : r.estado === "cuenta" ? "CUENTA"
            : r.estado === "no_cuenta" ? "NO CUENTA" : "ANULADA"}
        </span>
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
        Abre el SQL Editor de Supabase y ejecuta <code>supabase/modulos/roturas.sql</code>.
        Ese archivo crea las tablas, siembra los materiales, los procesos, las causas y las
        tolvas con su tara, y arma el bucket privado de las fotos. Se puede correr varias
        veces sin romper nada.
      </p>
    </section>
  );
}
