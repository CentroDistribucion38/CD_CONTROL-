"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Hallazgo, TemaHallazgo } from "@/modulos/acciones/hallazgos";
import { informeHallazgosPdf, type FotoLista } from "./pdf";

/**
 * EL INFORME DE HALLAZGOS — lo que se escoge y lo que se manda.
 *
 * ---------------------------------------------------------------------
 * SE VE ANTES DE EXPORTARSE
 * ---------------------------------------------------------------------
 * La hoja de abajo es lo mismo que va a salir en el PDF. Un informe que
 * se descubre mal DESPUÉS de mandarlo ya se mandó, y estos van a
 * gerencia.
 *
 * ---------------------------------------------------------------------
 * SOLO ENTRA LO REDACTADO Y APROBADO
 * ---------------------------------------------------------------------
 * Un hallazgo en borrador es un dictado de bodega sin revisar. No entra,
 * y la pantalla dice CUÁNTOS quedaron por fuera con un enlace para ir a
 * redactarlos: esconderlos haría creer que eso fue todo lo que se
 * encontró.
 *
 * ---------------------------------------------------------------------
 * LAS FOTOS SE FIRMAN AL EXPORTAR, NO AL CARGAR
 * ---------------------------------------------------------------------
 * Firmar las de quinientos hallazgos para que alguien exporte seis es
 * trabajo que se paga en espera. La vista previa muestra los huecos y
 * dice cuántas fotos tiene cada uno; las imágenes se traen cuando se
 * aprieta Exportar.
 */

const dma = (f: string) => f.split("-").reverse().join("/");

const SEV: Record<string, string> = {
  observacion: "Observación", hallazgo: "Hallazgo", critico: "Crítico",
};

export function Informe({ hallazgos, temas, nombres, hoy }: {
  hallazgos: Hallazgo[];
  temas: TemaHallazgo[];
  nombres: Record<string, string>;
  /** La fecha la pone el servidor: `new Date()` en el navegador toma la
      del reloj del computador, que en la bodega está descuadrado. */
  hoy: string;
}) {
  const [avisar, avisos] = useAvisos();
  const [exportando, setExportando] = useState(false);

  const haceUnMes = useMemo(() => {
    const d = new Date(hoy + "T12:00:00");
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  }, [hoy]);

  const [desde, setDesde] = useState(haceUnMes);
  const [hasta, setHasta] = useState(hoy);
  const [tema, setTema] = useState("");
  const [severidad, setSeveridad] = useState("");

  const delPeriodo = useMemo(() => hallazgos.filter((h) =>
    h.estado !== "anulado"
    && h.fecha >= desde && h.fecha <= hasta
    && (!tema || h.tema === tema)
    && (!severidad || h.severidad === severidad)),
    [hallazgos, desde, hasta, tema, severidad]);

  /* LOS QUE ENTRAN Y LOS QUE NO, contados aparte y los dos a la vista. */
  const entran = delPeriodo.filter((h) => (h.redaccion ?? "").trim() !== "");
  const fuera = delPeriodo.length - entran.length;

  async function exportar() {
    if (entran.length === 0) {
      avisar.mal("No hay ningún hallazgo redactado en ese periodo. Sin eso el informe saldría vacío.");
      return;
    }
    setExportando(true);
    try {
      const supabase = createClient();
      const ids = entran.map((h) => h.id);

      /* LAS FOTOS DE LOS QUE ENTRAN, y nada más. */
      const { data: filas, error } = await supabase
        .from("acciones_hallazgos_fotos")
        .select("*").in("hallazgo_id", ids)
        .order("momento", { ascending: true })
        .order("tomada_en", { ascending: true, nullsFirst: false })
        .limit(2000);
      if (error) throw new Error(error.message);

      const fotos: FotoLista[] = [];
      for (const f of (filas ?? []) as FotoLista[]) {
        const { data: d } = await supabase.storage
          .from("acciones").createSignedUrl(f.ruta, 900);
        /* SIN URL SE SIGUE: el informe sale con el hueco dicho y no se
           cae por una foto. */
        if (d?.signedUrl) fotos.push({ ...f, url: d.signedUrl });
      }

      await informeHallazgosPdf({
        hallazgos: entran, fotos, nombres, desde, hasta, sinRedaccion: fuera,
      }, new Date(hoy + "T12:00:00"));

      avisar.bien(`Informe con ${entran.length} hallazgo${entran.length === 1 ? "" : "s"} descargado.`);
    } catch (e) {
      avisar.mal("No se pudo armar el informe: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      {avisos}

      <div className="hz-inf-barra">
        <div className="hz-inf-campo">
          <label htmlFor="hz-desde" className="hz-rot">Desde</label>
          <input id="hz-desde" type="date" value={desde} max={hasta}
                 onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="hz-inf-campo">
          <label htmlFor="hz-hasta" className="hz-rot">Hasta</label>
          <input id="hz-hasta" type="date" value={hasta} min={desde}
                 onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="hz-inf-campo">
          <label htmlFor="hz-tema" className="hz-rot">Tema</label>
          <select id="hz-tema" value={tema} onChange={(e) => setTema(e.target.value)}>
            <option value="">Todos</option>
            {temas.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
          </select>
        </div>
        <div className="hz-inf-campo">
          <label htmlFor="hz-sev" className="hz-rot">Severidad</label>
          <select id="hz-sev" value={severidad} onChange={(e) => setSeveridad(e.target.value)}>
            <option value="">Todas</option>
            <option value="critico">Crítico</option>
            <option value="hallazgo">Hallazgo</option>
            <option value="observacion">Observación</option>
          </select>
        </div>

        <button type="button" className="btn si hz-empuja" onClick={exportar}
                disabled={exportando || entran.length === 0}>
          {exportando ? "Armando el PDF…" : `Exportar PDF · ${entran.length}`}
        </button>
      </div>

      {fuera > 0 && (
        <div className="aviso" style={{ marginBottom: 16 }}>
          <b>{fuera} hallazgo{fuera === 1 ? "" : "s"} del periodo no entra{fuera === 1 ? "" : "n"} en el informe</b>
          {" "}porque todavía no tiene{fuera === 1 ? "" : "n"} redacción aprobada. El informe lo
          dice también en la primera página: quien lo recibe tiene que saber que eso no fue todo
          lo que se encontró. Se redactan en <b>Acciones → ABI → Hallazgos</b>.
        </div>
      )}

      {/* ================= LA VISTA PREVIA ================= */}
      <div className="hz-hoja">
        <div className="hz-hoja-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-b.png" alt="" />
          <div>
            <h2>Informe de hallazgos de auditoría</h2>
            <p>ABI · CD38 AG01 · del {dma(desde)} al {dma(hasta)} · {entran.length} hallazgo{entran.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        {entran.length === 0 ? (
          <div className="hz-nada">
            <b>No hay nada que mostrar en ese periodo</b>
            Cambia las fechas, o redacta los hallazgos que están en borrador: al informe solo
            entra lo que alguien aprobó.
          </div>
        ) : entran.map((h) => (
          <VistaHallazgo key={h.id} h={h} />
        ))}
      </div>
    </>
  );
}

/**
 * UN HALLAZGO EN LA VISTA PREVIA.
 *
 * SIN LAS FOTOS DE VERDAD, a propósito: se dibuja el hueco y se dice
 * cuántas hay. Bajar dos fotos por hallazgo para una vista previa de
 * cuarenta hallazgos son ochenta descargas que nadie pidió.
 */
function VistaHallazgo({ h }: { h: Hallazgo }) {
  const donde = [h.zona_nombre ?? h.zona, h.ubicacion].filter(Boolean).join(" · ");
  return (
    <div className="hz-hoja-hz">
      <h3>
        {h.codigo} · {SEV[h.severidad] ?? h.severidad}
        <span style={{ fontWeight: 400, color: "#5b6b7f" }}>
          {"  ·  "}{dma(h.fecha)}{"  ·  "}{h.tema_nombre ?? h.tema}
          {donde ? `  ·  ${donde}` : ""}
          {h.tiene_accion && h.accion_codigo ? `  ·  acción ${h.accion_codigo}` : ""}
        </span>
      </h3>
      <p>{h.redaccion}</p>
      {h.recomendacion && (
        <p style={{ borderLeft: "3px solid #04203f", paddingLeft: 10, color: "#24384f" }}>
          <b style={{ fontSize: 10.5, letterSpacing: ".08em" }}>RECOMENDACIÓN</b><br />
          {h.recomendacion}
        </p>
      )}
      <div className="hz-hoja-par">
        <figure>
          <figcaption>Antes</figcaption>
          <div className="hz-hueco">
            {h.fotos_antes > 0
              ? `${h.fotos_antes} foto${h.fotos_antes === 1 ? "" : "s"} · sale en el PDF`
              : "Sin foto del antes"}
          </div>
        </figure>
        <figure>
          <figcaption>Después</figcaption>
          <div className="hz-hueco">
            {h.fotos_despues > 0
              ? `${h.fotos_despues} foto${h.fotos_despues === 1 ? "" : "s"} · sale en el PDF`
              : "Sin foto del después"}
          </div>
        </figure>
      </div>
    </div>
  );
}
