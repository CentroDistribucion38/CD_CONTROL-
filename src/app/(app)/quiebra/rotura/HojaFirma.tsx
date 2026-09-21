"use client";

/**
 * LA HOJA DEL DÍA PARA FIRMAR.
 *
 * «Que llenen la información, la persona pueda generar el PDF,
 * enviárselo por WhatsApp o lo que sea al supervisor, y esté el espacio
 * para que lo firmen.»
 *
 * VA DEBAJO DE LA REJILLA, que es el orden del día: primero se registra,
 * después se genera la hoja, después se firma. Arriba sería ofrecer un
 * papel de un día que todavía no se ha llenado.
 *
 * UN BOTÓN, Y EN EL CELULAR ABRE «COMPARTIR». El teléfono ofrece
 * WhatsApp, correo o lo que tenga, con el PDF ya adjunto: un toque. En
 * un computador —donde compartir archivos casi nunca existe— el mismo
 * botón lo descarga. Imprimir desde el navegador para «guardar como PDF»
 * serían cinco pasos en un celular y un archivo que después hay que ir a
 * buscar para mandarlo.
 *
 * LO QUE SE LLENA AQUÍ es solo lo que la base no sabe: quién elaboró,
 * quién es el supervisor que va a firmar y las observaciones. Las cifras
 * no se tocan en la hoja: salen de lo registrado, y un papel donde se
 * pudieran corregir sería un segundo registro que no cuadra con el
 * primero.
 */

import { useMemo, useState } from "react";
import {
  armarHoja, dibujarHoja, nombreArchivo, fechaLarga,
  type FilaDia, type MaqHoja, type LineaHoja, type FirmaHoja,
} from "@/modulos/rotlinea/hoja";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Un PNG de /public como data URL, que es lo que jsPDF sabe pegar. Null
 *  si no carga: la hoja no se frena por un logo. */
async function comoDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise<string | null>((listo) => {
      const lector = new FileReader();
      lector.onload = () => listo(typeof lector.result === "string" ? lector.result : null);
      lector.onerror = () => listo(null);
      lector.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

export function HojaFirma({ fecha, filas, maquinas, lineas, firmas, elaboro: quien }: {
  fecha: string;
  filas: FilaDia[];
  maquinas: MaqHoja[];
  lineas: LineaHoja[];
  firmas: FirmaHoja[];
  /** El nombre de quien está en la app: casi siempre es quien elaboró. */
  elaboro: string;
}) {
  const [elaboro, setElaboro] = useState(quien);
  const [supervisor, setSupervisor] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [haciendo, setHaciendo] = useState(false);
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null);

  /* LA HOJA SE ARMA AQUÍ MISMO, para enseñar lo que va a decir el papel
     antes de generarlo: quien lo manda ve el total que va a firmar el
     supervisor. */
  const hoja = useMemo(
    () => armarHoja({ fecha, filas, maquinas, lineas, firmas }),
    [fecha, filas, maquinas, lineas, firmas]);

  async function generar(modo: "compartir" | "descargar") {
    setHaciendo(true);
    setAviso(null);
    try {
      /* jsPDF SE CARGA AL TOCAR, no al abrir la pantalla: son 350 KB que
         quien solo viene a registrar no tiene por qué bajar. */
      const [{ jsPDF }, palabra, sello] = await Promise.all([
        import("jspdf"),
        /* LOS LOGOS, LOS MISMOS PNG QUE SUBISTE A public/marca/. Se
           piden al tocar, junto con jsPDF, y si alguno no llega la hoja
           sale igual sin él: una hoja sin marca se firma, una que no
           sale no. */
        comoDataUrl("/marca/logo-bavaria.png"),
        comoDataUrl("/marca/logo-b.png"),
      ]);
      const doc = dibujarHoja(jsPDF, hoja, {
        elaboro, supervisor, observaciones, generado: new Date(),
        marca: { palabra: palabra ?? undefined, sello: sello ?? undefined },
      });
      const nombre = nombreArchivo(fecha);
      const archivo = new File([doc.output("blob")], nombre, { type: "application/pdf" });

      /* COMPARTIR SOLO SI EL EQUIPO SABE COMPARTIR ARCHIVOS. `share` a
         secas existe en muchos navegadores de escritorio que después no
         aceptan un PDF: se pregunta con `canShare` y los archivos
         puestos, que es lo que de verdad va a pasar. */
      if (modo === "compartir" && typeof navigator !== "undefined" &&
          navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({
          files: [archivo],
          title: `Rotura en línea · ${fecha}`,
          text: `Hoja de rotura en línea del ${fechaLarga(fecha)} para firmar.`,
        });
        setAviso({ bien: true, texto: "Listo. Se abrió para compartir." });
      } else {
        doc.save(nombre);
        setAviso({ bien: true, texto: `Se descargó «${nombre}». Mándalo por WhatsApp o correo.` });
      }
    } catch (e) {
      /* CERRAR EL MENÚ DE COMPARTIR NO ES UN ERROR. El teléfono lo
         cuenta como uno —AbortError— y decirle a alguien «falló» porque
         cambió de idea es enseñarle a desconfiar del botón. */
      if (e instanceof DOMException && e.name === "AbortError") return;
      setAviso({ bien: false, texto: "No se pudo generar el PDF: " +
        (e instanceof Error ? e.message : String(e)) });
    } finally {
      setHaciendo(false);
    }
  }

  const vacio = hoja.lineas.length === 0;

  return (
    <section className="rl-caja rl-hoja">
      <div className="rl-cab">
        <h2>Hoja del día para firmar</h2>
      </div>
      <p className="rl-explica">
        {vacio
          ? <>Todavía no hay rotura registrada este día. La hoja se genera con lo que se
             registre arriba.</>
          : <>Sale en PDF con las cifras de arriba —<b>{nf.format(hoja.und)} unidades</b> en{" "}
             {hoja.lineas.length} línea{hoja.lineas.length === 1 ? "" : "s"}— y el espacio para que
             el supervisor firme. En el celular se abre para mandarla por WhatsApp.</>}
      </p>

      <div className="rl-hoja-campos">
        <label>
          <span>Elaboró</span>
          <input value={elaboro} onChange={(e) => setElaboro(e.target.value)}
                 maxLength={60} autoComplete="name" />
        </label>
        <label>
          <span>Supervisor que firma</span>
          {/* SE PUEDE DEJAR EN BLANCO: entonces sale una raya para que lo
              escriba a mano. Obligarlo aquí frenaría la hoja por un dato
              que el propio supervisor pone al firmar. */}
          <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)}
                 maxLength={60} placeholder="Opcional — si no, se escribe a mano" />
        </label>
        <label className="ancho">
          <span>Observaciones</span>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                    rows={3} maxLength={600}
                    placeholder="Opcional. Lo que el supervisor tenga que saber de este día." />
        </label>
      </div>

      <div className="rl-hoja-pie">
        <button type="button" className="rl-hoja-si" disabled={vacio || haciendo}
                onClick={() => generar("compartir")}>
          {haciendo ? "Generando…" : "Generar PDF y compartir"}
        </button>
        <button type="button" className="rl-hoja-no" disabled={vacio || haciendo}
                onClick={() => generar("descargar")}>
          Solo descargar
        </button>
      </div>
      {aviso && (
        <p className={"rl-hoja-aviso" + (aviso.bien ? "" : " mal")} role="status">{aviso.texto}</p>
      )}
    </section>
  );
}
