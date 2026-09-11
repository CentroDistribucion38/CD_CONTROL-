"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import { COLOR_VIDRIO } from "@/modulos/roturas/formato";
import type { Causa, Material, Proceso } from "@/modulos/roturas/datos";

/**
 * REGISTRAR UNA ROTURA — dos pasos, en el orden en que pasan las cosas.
 *
 *   PASO 1  ¿QUÉ SE ROMPIÓ?      tipo, vidrio, material y cuántas
 *   PASO 2  ¿DE QUÉ PROCESO?     proceso, causa, foto y qué pasó
 *
 * DOS PASOS Y NO UNO. Quien registra está de pie al lado del vidrio, con
 * guantes y con el celular en una mano. Un formulario de catorce campos
 * en una sola pantalla se llena mal: se baja hasta el final, se toca
 * "enviar" y la mitad quedó en blanco.
 *
 * POR QUÉ "QUÉ" VA ANTES QUE "POR QUÉ". El material decide si hay que
 * preguntar botellas —el producto terminado se abre en dos y el EER
 * no—, así que preguntar la causa primero obligaría a volver atrás.
 *
 * EL GPS NO SE PIDE AL ABRIR. La primera versión lo pedía nada más
 * entrar, y lo primero que veía la persona era el cuadro del navegador
 * preguntando por su ubicación antes de haber hecho nada. Ahora se pide
 * cuando se va a tomar la foto, que es lo único que lo necesita: el
 * sello de la imagen. Quien registre una rotura sin foto no ve ese
 * cuadro nunca.
 */

export function Reportar({ materiales, procesos, causas, cerrar }: {
  materiales: Material[];
  procesos: Proceso[];
  causas: Causa[];
  cerrar: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [paso, setPaso] = useState(1);

  const [tipo, setTipo] = useState<"producto_terminado" | "eer">("producto_terminado");
  const [vidrio, setVidrio] = useState<"ambar" | "flint" | "green">("ambar");
  const [material, setMaterial] = useState("");
  const [unidades, setUnidades] = useState(1);
  const [botellas, setBotellas] = useState<number | null>(null);
  const [tocoBotellas, setTocoBotellas] = useState(false);

  const [proceso, setProceso] = useState("");
  const [causa, setCausa] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [foto, setFoto] = useState<Foto | null>(null);
  const [sellando, setSellando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);

  const [mandando, setMandando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const { ubi, direccion, pedir } = usePosicion();

  /* En EER el vidrio se separa por color porque se vende por color, así
     que escoger el color es escoger de qué lista salen los materiales.
     En producto terminado no hay color: el vidrio va dentro del líquido. */
  const delTipo = materiales.filter((m) =>
    m.tipo === tipo && (tipo !== "eer" || m.color === vidrio));
  const mat = materiales.find((m) => m.clave === material) ?? null;
  const cau = causas.find((c) => c.clave === causa) ?? null;
  const exigeFoto = !!cau?.exige_foto;

  /* Si al cambiar de tipo o de color el material escogido ya no está en
     la lista, se suelta. Dejarlo puesto haría enviar un EER ámbar con
     "flint" marcado en la pantalla. */
  useEffect(() => {
    if (material && !delTipo.some((m) => m.clave === material)) setMaterial("");
  }, [material, delTipo]);

  /* TODAS LAS BOTELLAS COMO PROPUESTA, no como dato fijo. Cuando una
     estiba se cae, lo más probable es que se rompa todo lo que iba
     dentro; y si no, se corrige con dos toques. Proponer cero obligaría
     a teclear el número correcto SIEMPRE, y el que no lo teclee deja el
     vidrio de adentro fuera del conteo. */
  useEffect(() => {
    if (tipo !== "producto_terminado" || !mat?.botellas_x_empaque) { setBotellas(null); return }
    if (!tocoBotellas) setBotellas(unidades * mat.botellas_x_empaque);
  }, [tipo, mat, unidades, tocoBotellas]);

  async function abrirCamara() {
    /* Se pide el punto AQUÍ y no al abrir el asistente. Si la persona
       dice que no, la foto se toma igual y la banda sale sin
       coordenadas: la evidencia vale menos, pero el reporte no se
       pierde por un permiso. */
    pedir();
    camara.current?.click();
  }

  async function tomarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSellando(true);
    setMal(null);
    try {
      /* Se sella AQUÍ, en el teléfono, al tomarla. Entre tomar la foto y
         subirla pueden pasar veinte minutos sin señal en un pasillo, y
         la hora que quedaría escrita sería la de la subida. */
      const f = await sellar(archivo, {
        titulo: (procesos.find((p) => p.clave === proceso)?.nombre ?? "ROTURA").toUpperCase(),
        ubi, direccion, etiqueta: "ROTURA",
      });
      if (foto) URL.revokeObjectURL(foto.url);
      setFoto(f);
    } catch {
      setMal("No se pudo procesar esa foto. Vuelve a tomarla.");
    }
    setSellando(false);
  }

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  const puedeSeguir = paso === 1
    ? !!material && unidades > 0
    : !!proceso && !!causa && (!exigeFoto || !!foto);

  async function mandar() {
    setMandando(true);
    setMal(null);

    const { data, error } = await supabase.rpc("rotura_registrar", {
      p_material: material,
      p_unidades: unidades,
      p_botellas: tipo === "producto_terminado" ? botellas : null,
      p_proceso: proceso,
      p_causa: causa,
      p_descripcion: descripcion.trim() || null,
      p_lat: ubi?.lat ?? null,
      p_lng: ubi?.lng ?? null,
      p_precision: ubi ? Math.round(ubi.precision) : null,
    });

    if (error) { setMandando(false); setMal(error.message); return }

    const fila = Array.isArray(data) ? data[0] : data;
    const id = fila?.id as string;

    /* La foto va DESPUÉS, porque su ruta lleva el id de la rotura. Si
       falla, la rotura YA existe y eso es lo correcto: perder el reporte
       porque no subió una imagen sería cambiar lo importante por lo
       accesorio. */
    let aviso = "";
    if (foto && id) {
      const ruta = `${id}/rotura.jpg`;
      const { error: eSubir } = await supabase.storage
        .from("roturas")
        .upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
      if (eSubir) {
        aviso = exigeFoto
          ? "La foto no subió, y esta causa la exige: ábrela desde la lista y agrégala, o ABI la va a devolver."
          : "La foto no subió; se puede agregar después.";
      } else {
        const { error: eFila } = await supabase.from("roturas_fotos").insert({
          rotura_id: id, ruta, ancho: foto.ancho, alto: foto.alto, bytes: foto.blob.size,
          tomada_en: ubi?.en ?? new Date().toISOString(),
          lat: ubi?.lat ?? null, lng: ubi?.lng ?? null,
          precision_m: ubi ? Math.round(ubi.precision) : null,
        });
        if (eFila) aviso = "La foto subió pero no quedó registrada: " + eFila.message;
      }
    }

    setMandando(false);
    setListo((fila?.codigo as string) ?? "");
    if (aviso) setMal(aviso);
    router.refresh();
  }

  const sello = [
    new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }),
    new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    procesos.find((p) => p.clave === proceso)?.nombre,
    ubi ? `precisión ${Math.round(ubi.precision)} m` : "sin ubicación",
  ].filter(Boolean).join(" · ");

  if (listo !== null) {
    return (
      <div className="rt-rep">
        <div className="barra">
          <span className="t">REGISTRADA</span>
          <button type="button" onClick={cerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="cuerpo">
          <h2>Quedó registrada</h2>
          <p className="guia">
            <b>{listo}</b> — {mat?.nombre}. Pasa a la bandeja de ABI para el visto bueno.
          </p>
          {mal && <div className="negro"><span className="punto" /><span>{mal}</span></div>}
          <button type="button" className="otra" onClick={() => {
            /* Se vuelve al paso 1 con todo puesto menos la cuenta:
               cuando se cae una estiba no se rompe una sola caja, y
               volver a escoger el mismo material cinco veces es lo que
               hace que la quinta no se registre. */
            setListo(null); setMal(null); setPaso(1);
            setUnidades(1); setTocoBotellas(false);
            if (foto) { URL.revokeObjectURL(foto.url); setFoto(null) }
          }}>
            Registrar otra
          </button>
        </div>
        <div className="pie">
          <button type="button" onClick={cerrar}>Cerrar</button>
          <button type="button" className="si" onClick={cerrar}>Listo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rt-rep" role="dialog" aria-modal="true" aria-label="Registrar una rotura">
      <div className="barra">
        <span className="t">ROTURA EN SITIO</span>
        <button type="button" onClick={cerrar} aria-label="Cerrar">✕</button>
      </div>
      {/* Cuatro tramos que se llenan de a dos. Un tramo por paso, con dos
          pasos, deja la barra en la mitad todo el tiempo y no se siente
          que avance. */}
      <div className="pasos">
        {[1, 2, 3, 4].map((i) => <i key={i} className={paso * 2 >= i ? "on" : ""} />)}
      </div>

      <div className="cuerpo">
        {paso === 1 ? (
          <>
            <h2>¿Qué se rompió?</h2>

            <div className="opciones dos" style={{ marginTop: 18 }}>
              {(["producto_terminado", "eer"] as const).map((t) => (
                <button key={t} type="button" className={tipo === t ? "on" : ""}
                        onClick={() => { setTipo(t); setTocoBotellas(false) }}>
                  <span className="p">{t === "eer" ? "EER" : "Producto terminado"}</span>
                  <span className="h">
                    {t === "eer" ? "Envase retornable vacío" : "Cerveza envasada"}
                  </span>
                </button>
              ))}
            </div>

            {tipo === "eer" && (
              <>
                <span className="rotulo">Tipo de vidrio</span>
                <div className="vidrios">
                  {(["ambar", "flint", "green"] as const).map((c) => (
                    <button key={c} type="button"
                            className={c + (vidrio === c ? " on" : "")}
                            onClick={() => setVidrio(c)}>
                      <i aria-hidden />
                      <b>{COLOR_VIDRIO[c]}</b>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="campo">
              <label htmlFor="rt-mat">Material</label>
              <select id="rt-mat" value={material}
                      onChange={(e) => { setMaterial(e.target.value); setTocoBotellas(false) }}>
                <option value="">Escoge el material</option>
                {delTipo.map((m) => (
                  <option key={m.clave} value={m.clave}>{m.nombre} · {m.clave}</option>
                ))}
              </select>
              {delTipo.length === 0 && (
                <p className="nota">
                  No hay materiales {tipo === "eer" ? `de vidrio ${COLOR_VIDRIO[vidrio].toLowerCase()}` : "de producto terminado"} en
                  el maestro. Se agregan en Maestro, sin esperar un despliegue.
                </p>
              )}
            </div>

            <div className="campo">
              <label>Unidades rotas</label>
              <div className="contador">
                <button type="button" onClick={() => setUnidades((n) => Math.max(1, n - 1))}
                        aria-label="Una menos">−</button>
                <input type="number" inputMode="numeric" min={1} value={unidades}
                       onChange={(e) => setUnidades(Math.max(1, Number(e.target.value) || 1))} />
                <button type="button" onClick={() => setUnidades((n) => n + 1)}
                        aria-label="Una más">+</button>
              </div>
              <p className="nota">
                En sitio siempre se cuenta en unidades. Los kilos son de la salida, no de aquí.
              </p>
            </div>

            {tipo === "producto_terminado" && mat?.botellas_x_empaque && (
              <div className="campo">
                <label htmlFor="rt-bot">
                  Botellas rotas adentro — caben {unidades * mat.botellas_x_empaque}
                </label>
                <input id="rt-bot" type="number" inputMode="numeric" min={0}
                       max={unidades * mat.botellas_x_empaque}
                       value={botellas ?? 0}
                       onChange={(e) => {
                         setTocoBotellas(true);
                         setBotellas(Math.max(0, Number(e.target.value) || 0));
                       }} />
                <div className="negro">
                  <span className="punto" />
                  <span>
                    Van propuestas <b>todas las que caben</b>. Si quedaron botellas sanas,
                    corrige: el vidrio que no se cuente aquí no aparece en ningún lado.
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h2>¿De qué proceso viene?</h2>

            <div className="chips" style={{ marginTop: 18 }}>
              {procesos.map((p) => (
                <button key={p.clave} type="button"
                        className={proceso === p.clave ? "on" : ""}
                        onClick={() => setProceso(p.clave)}>
                  {p.nombre}
                </button>
              ))}
            </div>

            <span className="rotulo">Causa</span>
            <div className="opciones">
              {causas.map((c) => (
                <button key={c.clave} type="button"
                        className={(causa === c.clave ? "on" : "") + (c.grupo === "no_asumida" ? " roja" : "")}
                        onClick={() => setCausa(c.clave)}>
                  <span className="p conpunto"><i className="punto" aria-hidden />{c.nombre}</span>
                  <span className="h">
                    {c.grupo === "no_asumida"
                      ? "No asumida — se dice que no fue del OL"
                      : "Asumida por el OL"}
                    {c.exige_foto ? " · exige foto" : ""}
                  </span>
                </button>
              ))}
            </div>

            {exigeFoto && (
              <div className="exige">
                <b>Esta causa exige foto.</b> Es lo que sostiene que la rotura no es del OL. Sin
                evidencia, ABI la va a devolver.
              </div>
            )}

            <div className="foto">
              <div className="lienzo">
                {foto
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={foto.url} alt="La rotura" />
                  : <span>{sellando ? "SELLANDO…" : "FOTO DE LA NOVEDAD"}</span>}
              </div>
              <div className="sello">{sello}</div>
            </div>
            <input ref={camara} type="file" accept="image/*" capture="environment"
                   onChange={tomarFoto} hidden />
            <button type="button" className="otra" onClick={abrirCamara} disabled={sellando}>
              {foto ? "Tomar otra foto" : "Tomar la foto"}
            </button>

            <div className="campo">
              <label htmlFor="rt-des">Qué pasó</label>
              <textarea id="rt-des" rows={3} value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        placeholder="La transportadora de la T1 se atascó y tumbó la fila de envase." />
            </div>

            {mal && <div className="negro"><span className="punto" /><span>{mal}</span></div>}
          </>
        )}
      </div>

      <div className="pie">
        <button type="button" onClick={() => (paso === 1 ? cerrar() : setPaso(1))}>
          {paso === 1 ? "Cancelar" : "Atrás"}
        </button>
        <button type="button" className="si" disabled={!puedeSeguir || mandando}
                onClick={() => (paso === 1 ? setPaso(2) : mandar())}>
          {paso === 1 ? "Siguiente"
            : mandando ? "Enviando…"
            : exigeFoto && !foto ? "Falta la foto" : "Enviar a ABI"}
        </button>
      </div>
    </div>
  );
}
