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
      {/* EL CÓDIGO Y LA EVIDENCIA, JUNTOS Y A LA IZQUIERDA. Que se vea
          si hay foto SIN abrir nada es lo primero que ABI mira: una
          causa no asumida sin foto se devuelve, y decirlo aquí le ahorra
          el clic. */}
      <div className="izq">
        <div className="cod">{r.codigo}</div>
        {r.fotos > 0
          ? <div className="ev">EV<br />FOTO</div>
          : <div className="sinfoto">Sin foto</div>}
      </div>

      <div>
        <div className="tit">
          {r.material_nombre}
          <Vidrio color={r.color} />
        </div>

        <div className="meta">
          <span className="cant">{r.unidades}</span>
          <span>{r.tipo === "producto_terminado"
            ? (r.unidades === 1 ? "empaque" : "empaques")
            : (r.unidades === 1 ? "unidad" : "unidades")}</span>
          <span>Proceso {r.proceso_nombre}</span>
          <span className={"eti " + r.grupo}>
            {r.grupo === "no_asumida"
              ? `No asumida · ${r.causa_nombre.toLowerCase()}`
              : "Asumida por el OL"}
          </span>
          <span>{quien(nombres, r.reportada_por)} · {hace(r.minutos)}</span>
          {r.le_falta_foto && <span className="eti falta">LE FALTA LA FOTO</span>}
        </div>

        {/* EL PRODUCTO TERMINADO SE ABRE EN DOS: los empaques de afuera
            y las botellas de adentro. Sin esta línea, el vidrio que va
            dentro del líquido no aparece en ninguna parte. */}
        {r.tipo === "producto_terminado" && r.botellas != null && (
          <div className="meta">
            <span>
              De {r.unidades} empaque{r.unidades === 1 ? "" : "s"},{" "}
              <b>{r.botellas} botella{r.botellas === 1 ? "" : "s"}</b> rotas dentro
            </span>
          </div>
        )}

        {r.descripcion && (
          <div className="meta"><span>{r.descripcion}</span></div>
        )}

        {children}
      </div>

      <div className="der">
        {r.estado !== "esperando" && (
          <span className={"eti " + r.estado}>
            {r.estado === "cuenta" ? "CUENTA"
              : r.estado === "no_cuenta" ? "NO CUENTA" : "ANULADA"}
          </span>
        )}
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
