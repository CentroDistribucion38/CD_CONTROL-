"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { sellar, type Foto } from "@/lib/evidencia";
import type { TemaHallazgo } from "@/modulos/acciones/hallazgos";
import type { Zona } from "@/modulos/acciones/datos";

/**
 * LEVANTAR UN HALLAZGO — la pantalla de la auditoría.
 *
 * «Con ABI es cargar evidencias, hallazgos, colocar la información,
 *  guardar, y luego nosotros darle como que reescribir en palabras
 *  técnicas.»
 *
 * ---------------------------------------------------------------------
 * AQUÍ NO SE REDACTA, Y ES A PROPÓSITO
 * ---------------------------------------------------------------------
 * Esta pantalla se usa CAMINANDO: con guante, de pie, al lado de lo que
 * se acaba de encontrar. Lo que hay que capturar ahí es la foto y una
 * frase dicha como salga. Pedir la redacción técnica en ese momento es
 * lo que hace que la gente escriba «ok» o no levante el hallazgo.
 *
 * La redacción se hace después, sentado, en la pantalla de Hallazgos.
 * Por eso el hallazgo nace en `borrador` y no puede salir en el informe
 * hasta que alguien apruebe su texto.
 *
 * ---------------------------------------------------------------------
 * LA FOTO PRIMERO Y EL TEXTO DESPUÉS
 * ---------------------------------------------------------------------
 * El orden del formulario es el orden en que pasan las cosas: se ve
 * algo, se le toma la foto, y después se escribe. Al revés —campo de
 * texto arriba, foto abajo— la foto se queda sin tomar: quien ya
 * escribió cree que terminó.
 *
 * SE GUARDA AUNQUE NO HAYA FOTO, y se dice. Un hallazgo sin evidencia
 * vale menos, pero trabar el registro de algo que YA SE VIO por una
 * foto que no subió es perder el dato para siempre.
 */

const SEVERIDAD = [
  { id: "observacion", nom: "Observación", pie: "no conforma, pero conviene corregir" },
  { id: "hallazgo", nom: "Hallazgo", pie: "incumple y hay que corregir" },
  { id: "critico", nom: "Crítico", pie: "riesgo inmediato: se actúa hoy" },
] as const;

export function Levantar({ temas, zonas, areas, puedeEditar }: {
  temas: TemaHallazgo[];
  zonas: Zona[];
  areas: { clave: string; nombre: string }[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();
  const camara = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({
    tema: temas[0]?.clave ?? "",
    severidad: "hallazgo" as (typeof SEVERIDAD)[number]["id"],
    area: "",
    zona: "",
    ubicacion: "",
    visto: "",
    recomendacion: "",
  });
  /* LAS FOTOS SE ACUMULAN ANTES DE GUARDAR. No se suben una por una al
     escogerlas: si el hallazgo no se llega a guardar, quedarían fotos
     huérfanas en el bucket que nadie puede borrar ni encontrar. */
  /* LAS FOTOS YA SELLADAS, no los archivos crudos.
     Subir el `File` tal cual daba dos problemas: en el iPhone una foto
     que está en iCloud y no descargada llega con CERO bytes —y el error
     que salía era «No content provided», que no le dice nada a quien
     está en la bodega— y una foto de celular pesa seis u ocho megas,
     que con la señal de un pasillo es un minuto por foto. `sellar` lee
     el archivo de verdad, lo encoge a 1600 px y le quema la hora. */
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [sellando, setSellando] = useState(false);
  const [mandando, setMandando] = useState(false);

  const faltaSitio = !f.zona && !f.ubicacion.trim();
  const faltaTexto = f.visto.trim().length < 10;
  const puedeGuardar = !!f.tema && !faltaSitio && !faltaTexto;

  async function agregarFotos(fs: FileList | null) {
    if (!fs?.length) return;
    setSellando(true);
    /* SEIS Y NO MÁS. Un hallazgo con veinte fotos no lo abre nadie, y
       el informe se vuelve impaginable. Si de verdad hacen falta más,
       son dos hallazgos. Se recorta ANTES de sellar: sellar nueve para
       tirar tres es hacer esperar por nada. */
    const caben = Math.max(0, 6 - fotos.length);
    const nuevas: Foto[] = [];
    let malas = 0;
    for (const f of Array.from(fs).slice(0, caben)) {
      try { nuevas.push(await sellar(f, {
        titulo: "HALLAZGO", ubi: null, direccion: "", etiqueta: "ABI",
      })) } catch { malas++ }
    }
    setSellando(false);
    if (nuevas.length) setFotos((antes) => [...antes, ...nuevas].slice(0, 6));
    /* SE DICE CUÁNTAS NO SIRVIERON. «Se agregaron» cuando dos de tres
       se quedaron fuera es peor que no decir nada. */
    if (malas > 0) {
      avisar.mal(`${malas} foto${malas === 1 ? "" : "s"} llegó vacía o no se pudo abrir. ` +
                 "Si la escogiste del carrete, ábrela primero en Fotos para que se descargue.");
    }
  }

  async function guardar() {
    setMandando(true);
    const { data, error } = await supabase.rpc("hallazgo_registrar", {
      p_tema: f.tema,
      p_lo_que_se_vio: f.visto.trim(),
      p_severidad: f.severidad,
      p_area: f.area || null,
      p_zona: f.zona || null,
      p_ubicacion: f.ubicacion.trim() || null,
      p_recomendacion: f.recomendacion.trim() || null,
    });
    if (error) {
      setMandando(false);
      const falta = /does not exist|schema cache|could not find the function/i.test(error.message);
      avisar.mal(falta
        ? "Falta correr supabase/migraciones/2026-09-acciones-abi-hallazgos.sql en Supabase."
        : error.message);
      return;
    }
    const fila = Array.isArray(data) ? data[0] : data;
    const id = fila?.id as string | undefined;
    const codigo = (fila?.codigo as string) ?? "El hallazgo";

    /* LAS FOTOS VAN DESPUÉS DEL HALLAZGO, y si alguna falla se dice
       CUÁNTAS — sin perder el hallazgo. «Se guardó» cuando tres de
       cinco fotos no subieron es peor que no decir nada: alguien cierra
       el informe creyendo que la evidencia está. */
    let malas = 0;
    if (id && fotos.length) {
      for (const foto of fotos) {
        const ruta = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: eSubir } = await supabase.storage
          .from("acciones").upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
        if (eSubir) { malas++; continue }
        const { error: eFila } = await supabase.from("acciones_hallazgos_fotos").insert({
          hallazgo_id: id, ruta, tomada_en: foto.tomada,
        });
        if (eFila) malas++;
      }
    }
    setMandando(false);

    if (malas > 0) {
      avisar.mal(`${codigo} quedó guardado, pero ${malas} de ${fotos.length} foto` +
                 `${fotos.length === 1 ? "" : "s"} no subió. Vuelve a subirlas desde Hallazgos.`);
    } else {
      avisar.bien(`${codigo} quedó levantado${fotos.length ? ` con ${fotos.length} foto${fotos.length === 1 ? "" : "s"}` : ""}. ` +
                  "Falta redactarlo para que salga en el informe.");
    }
    setF({ tema: temas[0]?.clave ?? "", severidad: "hallazgo", area: "", zona: "",
           ubicacion: "", visto: "", recomendacion: "" });
    setFotos([]);
    router.refresh();
  }

  if (!puedeEditar) {
    return (
      <div className="aviso">
        Estás viendo la rama de ABI, pero levantar hallazgos es de quien tenga <b>Editar</b> en
        esta pantalla. Los campos aparecen cuando tengas ese permiso.
      </div>
    );
  }

  return (
    <>
      {avisos}

      <section className="caja hz-caja">
        <div className="cab">
          <div>
            <h2>Levantar un hallazgo</h2>
            <p>
              Lo que se acaba de encontrar, con su foto y dicho como salga. <b>La redacción
              técnica se hace después</b>, sentado, en Hallazgos: pedirla aquí es lo que hace
              que la gente escriba «ok» o no levante el hallazgo.
            </p>
          </div>
        </div>

        <div className="hz-form">
          {/* ---------- 1. LA EVIDENCIA, PRIMERO ----------
              El orden del formulario es el orden en que pasan las
              cosas: se ve algo, se le toma la foto, y después se
              escribe. Al revés, la foto se queda sin tomar — quien ya
              escribió cree que terminó. */}
          <div className="hz-bloque">
            <span className="hz-rot">1 · LA EVIDENCIA</span>
            <div className="hz-fotos">
              {fotos.map((x, i) => (
                <span key={i} className="hz-foto">
                  {/* SE VE LA FOTO, no su nombre: el iPhone las llama
                      todas «image.jpg» y así no hay forma de saber cuál
                      se quita. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.url} alt={`Evidencia ${i + 1}`} />
                  <button type="button" aria-label={`Quitar la evidencia ${i + 1}`}
                          onClick={() => {
                            URL.revokeObjectURL(x.url);
                            setFotos(fotos.filter((_, j) => j !== i));
                          }}>×</button>
                </span>
              ))}
              {fotos.length < 6 && (
                <button type="button" className="hz-tomar" disabled={mandando || sellando}
                        onClick={() => camara.current?.click()}>
                  {sellando ? "Preparando…" : "+ Foto"}
                </button>
              )}
              <input ref={camara} type="file" accept="image/*" capture="environment" multiple
                     style={{ display: "none" }}
                     onChange={(e) => { agregarFotos(e.target.files); e.target.value = "" }} />
            </div>
            {/* SE GUARDA SIN FOTO Y SE DICE. Trabar el registro de algo
                que YA SE VIO por una foto que no subió es perder el
                dato para siempre. */}
            <p className="hz-pie">
              {fotos.length === 0
                ? "Sin foto también se guarda, pero el hallazgo vale menos en el informe."
                : `${fotos.length} de 6. Se suben al guardar, no antes: si el hallazgo no se ` +
                  "llega a guardar, quedarían fotos sueltas que nadie puede encontrar."}
            </p>
          </div>

          {/* ---------- 2. QUÉ Y DÓNDE ---------- */}
          <div className="hz-bloque">
            <span className="hz-rot">2 · QUÉ Y DÓNDE</span>
            <div className="hz-rejilla">
              <label>
                <span>Tema</span>
                <select value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })}>
                  {temas.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
                </select>
              </label>
              <label>
                <span>Área</span>
                <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
                  <option value="">Sin área</option>
                  {areas.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
                </select>
              </label>
              <label>
                <span>Zona</span>
                <select value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })}>
                  <option value="">Escribir el sitio</option>
                  {zonas.map((z) => <option key={z.codigo} value={z.codigo}>{z.nombre}</option>)}
                </select>
              </label>
              <label>
                <span>Sitio exacto {f.zona ? "(opcional)" : ""}</span>
                <input value={f.ubicacion} placeholder="Estante 4, nivel alto"
                       onChange={(e) => setF({ ...f, ubicacion: e.target.value })} />
              </label>
            </div>
            {faltaSitio && (
              <p className="hz-pie hz-falta">
                Falta dónde fue: un hallazgo sin sitio no se puede ir a mirar.
              </p>
            )}

            {/* LA SEVERIDAD EN BOTONES Y NO EN UN DESPLEGABLE: son tres
                y cada una dice lo que significa. Un desplegable esconde
                la diferencia justo donde importa. */}
            <span className="hz-rot" style={{ marginTop: 14 }}>SEVERIDAD</span>
            <div className="hz-sev">
              {SEVERIDAD.map((s) => (
                <button key={s.id} type="button"
                        className={"btn" + (f.severidad === s.id ? " on" : "")}
                        onClick={() => setF({ ...f, severidad: s.id })}>
                  <b>{s.nom}</b><i>{s.pie}</i>
                </button>
              ))}
            </div>
          </div>

          {/* ---------- 3. LO QUE SE VIO ---------- */}
          <div className="hz-bloque">
            <span className="hz-rot">3 · LO QUE SE VIO</span>
            <textarea rows={3} value={f.visto}
                      placeholder="Dilo como salga. Esto no sale en el informe: sale la redacción técnica que se aprueba después."
                      onChange={(e) => setF({ ...f, visto: e.target.value })} />
            <p className="hz-pie">
              {/* SE GUARDAN LOS DOS TEXTOS, Y SE DICE AQUÍ. Si se
                  pierde este, nadie puede comprobar que la redacción
                  del informe dice lo mismo que se vio. */}
              Esto se guarda tal cual y no se reemplaza: es contra lo que se compara la
              redacción del informe el día que alguien la discuta.
            </p>

            <span className="hz-rot" style={{ marginTop: 14 }}>QUÉ SE RECOMIENDA (OPCIONAL)</span>
            <textarea rows={2} value={f.recomendacion}
                      placeholder="Lo que uno cree que debería hacerse"
                      onChange={(e) => setF({ ...f, recomendacion: e.target.value })} />
            <p className="hz-pie">
              {/* VA APARTE DEL HALLAZGO: el hallazgo es lo que SE VIO y
                  la recomendación es lo que ALGUIEN OPINA. Mezclarlos
                  es como un informe termina diciendo que se vio una
                  cosa que en realidad se supuso. */}
              Va aparte a propósito: el hallazgo es lo que se vio; esto es lo que alguien opina
              que se haga.
            </p>
          </div>

          <div className="hz-acciones">
            <button type="button" className="btn si grande"
                    disabled={mandando || !puedeGuardar} onClick={guardar}>
              {/* EL BOTÓN DICE QUÉ FALTA: apagado y mudo se toca tres
                  veces y después se llama a preguntar. */}
              {mandando ? "Guardando…"
                : !f.tema ? "Escoge el tema"
                : faltaSitio ? "Falta dónde fue"
                : faltaTexto ? "Escribe qué se vio"
                : `Guardar el hallazgo${fotos.length ? ` y ${fotos.length} foto${fotos.length === 1 ? "" : "s"}` : ""}`}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
