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
          {/* ROTAS Y CONTAMINADAS, SEPARADAS. Las dos pierden el
              líquido, pero solo la rota pierde la botella: juntarlas en
              una cifra obligaría después a adivinar cuánto vidrio salió
              de ahí. Si una de las dos es cero no se pinta: un "0
              contaminadas" en cada fila es ruido. */}
          {r.unidades > 0 && (
            <>
              <span className="cant">{r.unidades}</span>
              <span>{r.unidades === 1 ? "rota" : "rotas"}</span>
            </>
          )}
          {!!r.contaminadas && (
            <>
              <span className="cant">{r.contaminadas}</span>
              <span>contaminada{r.contaminadas === 1 ? "" : "s"}</span>
            </>
          )}
          <span>Proceso {r.proceso_nombre}</span>
          <span className={"eti " + r.grupo}>
            {r.grupo === "no_asumida"
              ? `No asumida · ${r.causa_nombre.toLowerCase()}`
              : "Asumida por el OL"}
          </span>
          <span>{quien(nombres, r.reportada_por)} · {hace(r.minutos)}</span>
          {r.le_falta_foto && <span className="eti falta">LE FALTA LA FOTO</span>}
        </div>

        {/* EL PRODUCTO TERMINADO SE ABRE EN DOS: las unidades de afuera
            y las botellas de adentro. Sin esta línea, el vidrio que va
            dentro del líquido no aparece en ninguna parte. */}
        {r.tipo === "producto_terminado" && (
          <div className="meta">
            {!!r.botellas && (
              <span>
                De {r.unidades} unidad{r.unidades === 1 ? "" : "es"} rota{r.unidades === 1 ? "" : "s"},{" "}
                <b>{r.botellas} botella{r.botellas === 1 ? "" : "s"}</b> rotas dentro
              </span>
            )}
            {!!r.contaminadas && (
              <span>
                Las {r.contaminadas} contaminada{r.contaminadas === 1 ? "" : "s"} pierden{" "}
                <b>solo el líquido</b>: el envase vuelve a la línea
              </span>
            )}
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

/**
 * LA MISMA ROTURA, PERO EN COLUMNAS.
 *
 * `Fila` pone todo en un párrafo de etiquetas: sirve para leer UNA, y
 * es lo que usa Visto bueno, donde ABI mira una por una y decide. Esta
 * sirve para leer TREINTA de un vistazo, que es lo que se hace en la
 * pantalla de consulta: con las cifras en columna, el ojo las compara
 * bajando en línea recta en vez de buscar el número dentro de la frase.
 *
 * VIVE AQUÍ Y NO EN LA PANTALLA porque el día que el filo rojo del «no
 * asumida» haya que dibujarlo distinto tiene que haber UN sitio donde
 * cambiarlo. Visto bueno sigue con `Fila` a propósito —no se pidió
 * cambiarla y allí hace falta el detalle largo, no la comparación—,
 * pero las dos salen de este archivo.
 *
 * LAS COLUMNAS VAN EN EL CSS, no aquí: en celular esto mismo se apila
 * en tarjeta sin cambiar una línea de este componente.
 */
export function FilaTabla({ r, nombres, derecha, children }: {
  r: Rotura;
  nombres: Record<string, string>;
  derecha?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const est = r.estado === "esperando" ? "ESPERANDO VH"
            : r.estado === "cuenta" ? "CUENTA"
            : r.estado === "no_cuenta" ? "NO CUENTA" : "ANULADA";
  return (
    <div className={"tf" + (r.grupo === "no_asumida" ? " roja" : "")
                  + (r.estado === "anulada" ? " gris" : "")}>
      <div className="tf-cod" data-rot="Código">{r.codigo}</div>

      {/* LA FOTO SE DICE, NO SE TRAE. Las fotos viven en un bucket
          privado: pintarlas de verdad aquí serían treinta enlaces
          firmados cada vez que alguien abre la pantalla o toca un
          filtro, y la lista tardaría en aparecer. Lo que ABI necesita
          de un vistazo es si HAY —una no asumida sin foto se devuelve—,
          y eso cabe en el contador. La foto se ve al tocar Ver. */}
      <div className="tf-foto" data-rot="Foto">
        {r.fotos > 0
          ? <span className="tf-ev"><i aria-hidden />{r.fotos}</span>
          : <span className={"tf-sinfoto" + (r.le_falta_foto ? " falta" : "")}>
              {r.le_falta_foto ? "LE FALTA" : "sin foto"}
            </span>}
      </div>

      <div className="tf-pr" data-rot="Producto">
        <div className="tf-nom">{r.material_nombre}<Vidrio color={r.color} /></div>
        <div className="tf-sub">
          {r.causa_nombre ? r.causa_nombre : "Sin causa anotada"}
          {" · "}
          <b className={r.grupo}>
            {r.grupo === "no_asumida" ? "no asumida por el OL" : "asumida por el OL"}
          </b>
        </div>
        {children}
      </div>

      {/* ROTAS Y CONTAMINADAS, SEPARADAS. Las dos pierden el líquido,
          pero solo la rota pierde la botella: juntarlas obligaría
          después a adivinar cuánto vidrio salió de ahí. */}
      <div className="tf-und" data-rot="Unidades">
        <div className="tf-n">{r.unidades}<small>{r.unidades === 1 ? "rota" : "rotas"}</small></div>
        {!!r.contaminadas && (
          <div className="tf-n2">+{r.contaminadas} contaminada{r.contaminadas === 1 ? "" : "s"}</div>
        )}
      </div>

      <div className="tf-proc" data-rot="Proceso">{r.proceso_nombre}</div>

      <div className="tf-quien" data-rot="Registró">
        <b>{quien(nombres, r.reportada_por)}</b>
        {hace(r.minutos)}
      </div>

      <div className="tf-est" data-rot="Estado">
        <span className={"tf-pi " + r.estado}><i aria-hidden />{est}</span>
      </div>

      <div className="tf-ac">{derecha}</div>
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

/* =====================================================================
   LA FILA DE CIFRAS DE LA CADENA

   LA MISMA EN LAS DOS BANDEJAS, Y A PROPÓSITO. El visto bueno y los
   desacuerdos miden EL MISMO MONTÓN en momentos distintos: lo que
   espera, lo que se acordó, lo que está en pleito y lo que no se cobra.
   Dos filas de cifras dibujadas por separado se desincronizan —una
   cuenta anuladas y la otra no— y entonces las dos pantallas dicen
   números distintos del mismo mes, que es peor que no decir ninguno.

   LA PRIMERA ES LA DE QUIEN ESTÁ MIRANDO: la que él decide. Va con
   fondo crema y filo de color, como la pestaña en la que uno está
   parado. Las otras están para saber cómo va la conciliación sin tener
   que ir a otra pantalla.

   NO REEMPLAZA AL TÍTULO DE LA PÁGINA: lo reemplaza al `kpi` de la
   cabecera, que decía exactamente el mismo número dos dedos más
   arriba.
   ===================================================================== */
export type Cifra = {
  n: number;
  /** El rótulo en mayúsculas. */
  rot: string;
  /** La línea de abajo: qué significa ese número, no cómo se llama. */
  pie: string;
  /** La de quien está mirando: la que él decide. Solo una. */
  aqui?: boolean;
  /** Se pinta en rojo. Para lo que se perdió, no para lo que espera. */
  mal?: boolean;
};

export function Cifras({ cifras }: { cifras: Cifra[] }) {
  return (
    <div className="rt-cifras">
      {cifras.map((c) => (
        <div key={c.rot}
             className={"rt-c" + (c.aqui ? " aqui" : "") + (c.mal ? " mal" : "")}>
          <b>{c.n}</b>
          <span className="rt-cr">{c.rot}</span>
          <span className="rt-cp">{c.pie}</span>
        </div>
      ))}
    </div>
  );
}
