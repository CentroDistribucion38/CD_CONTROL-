"use client";

/**
 * LA HOJA DEL DÍA PARA FIRMAR.
 *
 * «Que guarde y me salga el cuadro de generar el PDF; y si no, que en el
 * tablero de rotura haya una hoja con todos los PDF generados.»
 *
 * DOS PIEZAS:
 *
 *   EL CUADRO   una ventana encima de la pantalla con lo único que la
 *               base no sabe —quién elaboró, qué supervisor firma,
 *               observaciones— y el botón. Se abre SOLA después de cada
 *               Guardar de la rejilla, y también con el botón de la
 *               tarjeta de abajo.
 *   LA TARJETA  debajo de la rejilla: si la hoja de este día ya se
 *               generó, cuándo y quién, con el PDF a un toque; si no,
 *               que falta.
 *
 * LA VENTANA LA ABRE LA DIRECCIÓN, NO UN AVISO ENTRE COMPONENTES. Al
 * guardar, la rejilla cambia la dirección a «…&hoja=1» y la página se
 * vuelve a armar EN EL SERVIDOR con la pesada nueva adentro; recién ahí
 * se abre la ventana. Abrirla con un aviso directo —más corto de
 * escribir— la abriría ANTES de que llegaran los datos nuevos, y el PDF
 * saldría sin la pesada que se acababa de guardar: justo la que motivó
 * abrirla.
 *
 * CADA PDF QUE SE GENERA SE GUARDA TAL CUAL SE MANDÓ, con su renglón:
 * qué día, quién, a qué hora, a qué supervisor y qué cifras decía. Si
 * guardarlo falla —sin señal, falta la migración, quien lo genera no es
 * editor— el PDF se entrega igual y se dice que no quedó en el
 * historial: el supervisor no tiene por qué esperar a que vuelva la red.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FirmaDedo } from "./FirmaDedo";
import { createClient } from "@/lib/supabase/client";
import {
  armarHoja, dibujarHoja, nombreArchivo, fechaLarga, paletaDeTema, aRGB, type Paleta,
  type FilaDia, type MaqHoja, type LineaHoja, type FirmaHoja,
} from "@/modulos/rotlinea/hoja";
import type { HojaGuardada } from "@/modulos/rotlinea/datos";

const BUCKET = "rotlinea-hojas";
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hora = (s: string) =>
  new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

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

/**
 * LOS COLORES DEL TEMA DE QUIEN GENERA LA HOJA, leídos de la pantalla.
 *
 * Sin tema puesto —el oficial— devuelve nada y la hoja sale con la marca.
 * Con tema, se leen las mismas variables que pintan la app: así un tema
 * nuevo en globals.css cambia también el papel sin tocar esto.
 *
 * `getPropertyValue` devuelve el texto crudo de la variable —a veces un
 * `color-mix(…)` o `var(…)`—; se le pone de color a un elemento y se lee
 * lo que el navegador calculó.
 */
function leerPaleta(dentro: Element | null): Paleta | undefined {
  const conTema = dentro?.closest("[data-tema]");
  if (!conTema) return undefined;
  const leer = (v: string) => {
    const t = document.createElement("span");
    t.style.color = `var(${v})`;
    t.style.display = "none";
    conTema.appendChild(t);
    const c = aRGB(getComputedStyle(t).color);
    t.remove();
    return c;
  };
  const tinta = leer("--c-04203f"), acento = leer("--c-marca"), hondo = leer("--c-marca-hondo");
  if (!tinta || !acento) return undefined;
  return paletaDeTema(tinta, acento, hondo ?? acento);
}

export function HojaFirma({ fecha, filas, maquinas, lineas, firmas, elaboro: quien,
                            hojas, abrir, faltaHistorial }: {
  fecha: string;
  filas: FilaDia[];
  maquinas: MaqHoja[];
  lineas: LineaHoja[];
  firmas: FirmaHoja[];
  /** El nombre de quien está en la app: casi siempre es quien elaboró. */
  elaboro: string;
  /** Las hojas que ya se generaron para ESTE día, la más nueva primero. */
  hojas: HojaGuardada[];
  /** La dirección trae «hoja=1»: se acaba de guardar, se abre sola. */
  abrir: boolean;
  /** Falta correr la migración del historial. */
  faltaHistorial: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const ventana = useRef<HTMLDialogElement>(null);

  const [elaboro, setElaboro] = useState(quien);
  const [supervisor, setSupervisor] = useState(hojas[0]?.supervisor ?? "");
  const [observaciones, setObservaciones] = useState("");
  /* LA FIRMA DE QUIEN ELABORÓ, dibujada: un PNG, o null si no ha firmado. */
  const [firma, setFirma] = useState<string | null>(null);
  /* SIN NOMBRE Y SIN FIRMA NO SALE LA HOJA: «que cuando uno vaya a
     guardar ponga el nombre de quien elaboró, y algo para la firma». */
  const falta = !elaboro.trim() ? "Escribe quién elaboró" : !firma ? "Falta la firma de quien elaboró" : null;
  const [haciendo, setHaciendo] = useState(false);
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null);

  const hoja = useMemo(
    () => armarHoja({ fecha, filas, maquinas, lineas, firmas }),
    [fecha, filas, maquinas, lineas, firmas]);
  const vacio = hoja.lineas.length === 0;
  /* LA HOJA DEL DÍA ES LA ÚLTIMA QUE NO SE ANULÓ. Una anulada no cuenta:
     si todas lo están, el día vuelve a pedir hoja. */
  const vigentes = hojas.filter((h) => h.anulada_en == null);
  const ultima = vigentes[0] ?? null;
  const anuladaUltima = !ultima && hojas.length > 0 ? hojas[0] : null;
  /* LA HOJA QUEDÓ VIEJA si el día cambió después de generarla: lo que se
     firmó ya no es lo que dice la base. Se dice, para generar otra. */
  const vieja = ultima != null && Number(ultima.unidades) !== hoja.und;

  /* SE ABRE SOLA cuando la dirección lo pide —después de Guardar—, y
     solo si hay algo que poner en la hoja. */
  useEffect(() => {
    if (abrir && !vacio && ventana.current && !ventana.current.open) {
      setAviso(null);
      ventana.current.showModal();
    }
  }, [abrir, vacio]);

  /** Cierra y quita «hoja=1» de la dirección: si no, al recargar la
   *  página la ventana volvería a salir sola. */
  function cerrar() {
    ventana.current?.close();
    if (abrir) router.replace(`?d=${fecha}`, { scroll: false });
  }

  async function guardarEnHistorial(pdf: Blob): Promise<string | null> {
    /* EL NOMBRE EMPIEZA POR LA FECHA —la base lo exige—, y la hora hace
       que dos hojas del mismo día no se pisen. */
    const ruta = `${fecha}/${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
    const sube = await supabase.storage.from(BUCKET)
      .upload(ruta, pdf, { contentType: "application/pdf", upsert: false });
    if (sube.error) return sube.error.message;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("rotlinea_hojas").insert({
      fecha, ruta, bytes: pdf.size,
      unidades: hoja.und, kg: Math.round(hoja.kg * 100) / 100, lineas: hoja.lineas.length,
      elaboro: elaboro.trim() || null, supervisor: supervisor.trim() || null,
      observaciones: observaciones.trim() || null,
      generado_por: user?.id,
    });
    return error ? error.message : null;
  }

  async function generar(modo: "compartir" | "descargar") {
    setHaciendo(true);
    setAviso(null);
    try {
      /* jsPDF Y LOS LOGOS SE CARGAN AL TOCAR, no al abrir la pantalla:
         son 350 KB que quien solo viene a registrar no tiene por qué
         bajar. Los logos son los PNG de public/marca/, tal cual. */
      const [{ jsPDF }, palabra, sello] = await Promise.all([
        import("jspdf"),
        comoDataUrl("/marca/logo-bavaria.png"),
        comoDataUrl("/marca/logo-b.png"),
      ]);
      const doc = dibujarHoja(jsPDF, hoja, {
        elaboro, supervisor, observaciones, generado: new Date(), firmaElaboro: firma ?? undefined,
        /* Los logos, tal cual en cualquier tema; lo demás, del tema. */
        marca: { palabra: palabra ?? undefined, sello: sello ?? undefined },
        paleta: leerPaleta(ventana.current),
      });
      const blob = doc.output("blob");
      const nombre = nombreArchivo(fecha);
      const archivo = new File([blob], nombre, { type: "application/pdf" });

      /* PRIMERO SE GUARDA, DESPUÉS SE MANDA. Al revés, el menú de
         compartir del teléfono se queda con la pantalla y quien lo cierra
         puede irse antes de que se guarde. Si guardar falla, se manda
         igual. */
      const fallo = await guardarEnHistorial(blob);

      /* COMPARTIR SOLO SI EL EQUIPO SABE COMPARTIR ARCHIVOS: se pregunta
         con `canShare` y los archivos puestos, que es lo que de verdad
         va a pasar. En un PC casi nunca: ahí se descarga. */
      let compartido = false;
      if (modo === "compartir" && typeof navigator !== "undefined" &&
          navigator.canShare?.({ files: [archivo] })) {
        try {
          await navigator.share({
            files: [archivo],
            title: `Rotura en línea · ${fecha}`,
            text: `Hoja de rotura en línea del ${fechaLarga(fecha)} para firmar.`,
          });
          compartido = true;
        } catch (e) {
          /* CERRAR EL MENÚ DE COMPARTIR NO ES UN ERROR: el teléfono lo
             cuenta como uno —AbortError— y decir «falló» porque alguien
             cambió de idea es enseñarle a desconfiar del botón. La hoja
             ya quedó guardada. */
          if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
        }
      } else {
        doc.save(nombre);
      }

      if (fallo) {
        setAviso({ bien: false, texto: faltaHistorial
          ? "El PDF salió, pero no quedó en el historial: falta correr 2026-09-rotura-linea-hojas.sql en Supabase."
          : `El PDF salió, pero no quedó en el historial: ${fallo}` });
        return;
      }
      /* QUEDÓ GUARDADA: se cierra y la tarjeta de abajo ya la muestra. */
      ventana.current?.close();
      router.replace(`?d=${fecha}`, { scroll: false });
      router.refresh();
      setAviso({ bien: true, texto: compartido
        ? "Listo: quedó guardada y se abrió para compartir."
        : `Listo: quedó guardada y se descargó «${nombre}».` });
    } catch (e) {
      setAviso({ bien: false, texto: "No se pudo generar el PDF: " +
        (e instanceof Error ? e.message : String(e)) });
    } finally {
      setHaciendo(false);
    }
  }

  return (
    <>
      {/* ---------------- LA TARJETA ---------------- */}
      <section className="rl-caja rl-hoja">
        <div className="rl-hoja-fila">
          <div className="rl-hoja-estado">
            <h2>Hoja del día para firmar</h2>
            <p className={"rl-hoja-dice" + (ultima && !vieja ? " bien" : vacio ? "" : " ojo")}>
              {vacio
                ? "Todavía no hay rotura registrada este día."
                : anuladaUltima
                  ? <>La hoja de este día se anuló{anuladaUltima.anulada_nombre && <> ({anuladaUltima.anulada_nombre})</>}:
                     «{anuladaUltima.anulada_motivo}». Genera otra.</>
                : !ultima
                  ? "Todavía no se ha generado la hoja de este día."
                  : vieja
                    ? <>La última hoja ({hora(ultima.generado_en)}) decía <b>{nf.format(Number(ultima.unidades))}</b> unidades
                       y el día ahora lleva <b>{nf.format(hoja.und)}</b>: cambió después. Genera otra.</>
                    : <>Generada a las <b>{hora(ultima.generado_en)}</b>
                       {ultima.generado_nombre && <> por {ultima.generado_nombre}</>}
                       {vigentes.length > 1 && <> · {vigentes.length} versiones</>}.</>}
            </p>
          </div>
          <div className="rl-hoja-acciones">
            {ultima?.url && (
              <a className="rl-hoja-no" href={ultima.url} target="_blank" rel="noreferrer">
                Abrir la última
              </a>
            )}
            <button type="button" className="rl-hoja-si" disabled={vacio}
                    onClick={() => { setAviso(null); ventana.current?.showModal() }}>
              {ultima ? "Generar otra" : "Generar hoja"}
            </button>
          </div>
        </div>
        {aviso && !haciendo && (
          <p className={"rl-hoja-aviso" + (aviso.bien ? "" : " mal")} role="status">{aviso.texto}</p>
        )}
      </section>

      {/* ---------------- EL CUADRO ----------------
          UN <dialog> DEL NAVEGADOR y no una caja pintada encima: trae
          solo lo que una ventana tiene que traer —Escape la cierra, el
          foco no se escapa a la página de atrás, el lector de pantalla
          sabe que es una ventana— sin una línea más de código. */}
      <dialog ref={ventana} className="rl-ventana" aria-labelledby="rl-ventana-titulo"
              onCancel={(e) => { e.preventDefault(); cerrar() }}>
        <div className="rl-ventana-cab">
          <p className="rl-ventana-ojo">{abrir ? "GUARDADO · " : ""}HOJA DEL DÍA PARA FIRMAR</p>
          <h2 id="rl-ventana-titulo">
            {nf.format(hoja.und)} unidades
            <span> · {hoja.lineas.length} línea{hoja.lineas.length === 1 ? "" : "s"}</span>
          </h2>
          <p className="rl-ventana-sub">
            {fechaLarga(fecha).charAt(0).toUpperCase() + fechaLarga(fecha).slice(1)}.
            Sale en PDF con estas cifras y el espacio para que el supervisor firme.
          </p>
        </div>

        <div className="rl-hoja-campos">
          <label>
            <span>Elaboró</span>
            <input value={elaboro} onChange={(e) => setElaboro(e.target.value)}
                   maxLength={60} autoComplete="name" required aria-required="true" />
          </label>
          <label>
            <span>Supervisor que firma</span>
            {/* Opcional: si se deja en blanco sale una raya para que lo
                escriba a mano. Obligarlo frenaría la hoja por un dato que
                el propio supervisor pone al firmar. */}
            <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)}
                   maxLength={60} placeholder="Opcional" />
          </label>
          <label className="ancho">
            <span>Observaciones</span>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                      rows={3} maxLength={600} placeholder="Opcional" />
          </label>
        </div>

        {aviso && haciendo === false && !aviso.bien && (
          <p className="rl-hoja-aviso mal" role="status">{aviso.texto}</p>
        )}

        {/* LA FIRMA, DEBAJO DE LOS CAMPOS Y ANTES DE LOS BOTONES: es lo
            último que se hace antes de generar, como en el papel. Sale
            dibujada en el recuadro ELABORÓ del PDF. */}
        <div className="rl-hoja-firma">
          <span className="rl-hoja-firma-rot">Firma de quien elaboró</span>
          <FirmaDedo alCambiar={setFirma} />
        </div>

        <div className="rl-hoja-pie">
          {falta && <p className="rl-hoja-falta" role="status">{falta} para generar la hoja.</p>}
          <button type="button" className="rl-hoja-si" disabled={vacio || haciendo || !!falta}
                  onClick={() => generar("compartir")}>
            {haciendo ? "Generando…" : "Generar PDF y compartir"}
          </button>
          <button type="button" className="rl-hoja-no" disabled={vacio || haciendo || !!falta}
                  onClick={() => generar("descargar")}>
            Solo descargar
          </button>
          {/* «AHORA NO» NO PIERDE NADA: el día queda en el tablero como
              pendiente de hoja, y desde ahí se genera cuando se quiera. */}
          <button type="button" className="rl-hoja-luego" disabled={haciendo} onClick={cerrar}>
            Ahora no
          </button>
        </div>
      </dialog>
    </>
  );
}
