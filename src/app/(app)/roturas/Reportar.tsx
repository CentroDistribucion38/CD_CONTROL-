"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import type { Causa, Material, Proceso } from "@/modulos/roturas/datos";

/**
 * REGISTRAR UNA ROTURA — dos pasos, en el orden en que pasan las cosas.
 *
 *   PASO 1  QUÉ SE ROMPIÓ   tipo, material y cuántas
 *   PASO 2  POR QUÉ         proceso, causa, foto y qué pasó
 *
 * DOS PASOS Y NO UNO. Quien registra está de pie al lado del vidrio, con
 * guantes y con el celular en una mano. Un formulario de catorce campos
 * en una sola pantalla se llena mal: se baja hasta el final, se toca
 * "enviar" y la mitad quedó en blanco. Dos pasos con botones grandes se
 * llenan de pie.
 *
 * POR QUÉ "QUÉ" VA ANTES QUE "POR QUÉ". El material decide si hay que
 * preguntar botellas —el producto terminado se abre en dos y el EER no—,
 * así que preguntar la causa primero obligaría a volver atrás.
 *
 * LA FOTO SE EXIGE AQUÍ, no al revisar. Una causa "no asumida" dice que
 * la rotura no fue del OL, y eso hay que probarlo en el momento y en el
 * sitio: una foto tomada mañana desde la oficina no prueba nada. La base
 * además impide que ABI marque CUENTA una no asumida sin foto, así que
 * sin este aviso el reporte simplemente se devolvería.
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

  /* Se pide el GPS al abrir, sin que nadie lo toque: quien abrió esto
     está al lado del vidrio AHORA, y cada toque de más es un toque con
     guantes puestos. */
  useEffect(() => { pedir(); }, [pedir]);

  const delTipo = materiales.filter((m) => m.tipo === tipo);
  const mat = materiales.find((m) => m.clave === material) ?? null;
  const cau = causas.find((c) => c.clave === causa) ?? null;
  const exigeFoto = !!cau?.exige_foto;

  /* EL EMPAQUE COMPLETO COMO PROPUESTA, no como dato fijo. Cuando una
     estiba se cae, lo más probable es que se rompa todo lo que iba
     dentro; y si no, se corrige con dos toques. Proponer cero obligaría
     a teclear el número correcto SIEMPRE, y el que no lo teclee deja el
     vidrio de adentro fuera del conteo. */
  useEffect(() => {
    if (tipo !== "producto_terminado" || !mat?.botellas_x_empaque) { setBotellas(null); return }
    if (!tocoBotellas) setBotellas(unidades * mat.botellas_x_empaque);
  }, [tipo, mat, unidades, tocoBotellas]);

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
        titulo: (mat?.nombre ?? "ROTURA").toUpperCase(),
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
       accesorio. Se dice que faltó la foto y se sigue. */
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
            {exigeFoto && " Como la causa es no asumida, ABI la va a mirar con la foto."}
          </p>
          {mal && <div className="negro"><span className="punto" /><span>{mal}</span></div>}
          <button type="button" className="otra" onClick={() => {
            /* Se vuelve al paso 2 con el material puesto: cuando se cae
               una estiba no se rompe una sola caja, y volver a escoger
               el mismo material cinco veces es lo que hace que la quinta
               no se registre. */
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
      <div className="pasos">
        <i className="on" /><i className={paso >= 2 ? "on" : ""} />
      </div>

      <div className="cuerpo">
        {paso === 1 ? (
          <>
            <h2>¿Qué se rompió?</h2>
            <p className="guia">
              El producto terminado se cuenta en empaques y además en botellas rotas adentro;
              el EER va en unidades.
            </p>

            <div className="opciones dos">
              {(["producto_terminado", "eer"] as const).map((t) => (
                <button key={t} type="button" className={tipo === t ? "on" : ""}
                        onClick={() => { setTipo(t); setMaterial(""); setTocoBotellas(false) }}>
                  <span className="p">{t === "eer" ? "EER" : "Producto terminado"}</span>
                  <span className="h">
                    {t === "eer" ? "Envase, empaque y estiba retornables" : "Producto lleno, con botellas adentro"}
                  </span>
                </button>
              ))}
            </div>

            <div className="campo">
              <label htmlFor="rt-mat">Material</label>
              <select id="rt-mat" value={material}
                      onChange={(e) => { setMaterial(e.target.value); setTocoBotellas(false) }}>
                <option value="">Escoge el material</option>
                {delTipo.map((m) => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
              </select>
            </div>

            <div className="campo">
              <label>{tipo === "eer" ? "Unidades rotas" : "Empaques rotos"}</label>
              <div className="contador">
                <button type="button" onClick={() => setUnidades((n) => Math.max(1, n - 1))}
                        aria-label="Una menos">−</button>
                <input type="number" inputMode="numeric" min={1} value={unidades}
                       onChange={(e) => setUnidades(Math.max(1, Number(e.target.value) || 1))} />
                <button type="button" onClick={() => setUnidades((n) => n + 1)}
                        aria-label="Una más">+</button>
              </div>
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
                <div className="negro" style={{ marginTop: 10 }}>
                  <span className="punto" />
                  <span>
                    Va propuesto el <b>empaque completo</b>. Si quedaron botellas sanas,
                    corrige el número: el vidrio que no se cuente aquí no aparece en ningún lado.
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h2>¿Por qué se rompió?</h2>
            <p className="guia">
              El proceso dice dónde pasó; la causa, de quién fue. Las dos juntas son lo que
              después contesta por qué se sigue rompiendo lo mismo en el mismo sitio.
            </p>

            <div className="campo">
              <label htmlFor="rt-pro">Proceso</label>
              <select id="rt-pro" value={proceso} onChange={(e) => setProceso(e.target.value)}>
                <option value="">Escoge el proceso</option>
                {procesos.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
              </select>
            </div>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", marginBottom: 5, color: "var(--rt-gris)" }}>
              CAUSA
            </label>
            <div className="opciones">
              {causas.map((c) => (
                <button key={c.clave} type="button"
                        className={(causa === c.clave ? "on" : "") + (c.grupo === "no_asumida" ? " roja" : "")}
                        onClick={() => setCausa(c.clave)}>
                  <span className="p">{c.nombre}</span>
                  <span className="h">
                    {c.grupo === "no_asumida" ? "No asumida — no fue del OL" : "Asumida por el OL"}
                    {c.exige_foto ? " · exige foto" : ""}
                  </span>
                </button>
              ))}
            </div>

            {exigeFoto && (
              <div className="negro" style={{ marginBottom: 12 }}>
                <span className="punto" />
                <span>
                  <b>Esta causa exige foto.</b> Estás diciendo que la rotura no fue del OL, y
                  eso se prueba aquí y ahora. Sin foto, ABI no la puede marcar como que cuenta.
                </span>
              </div>
            )}

            <div className="foto">
              <div className="lienzo">
                {foto
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={foto.url} alt="La rotura" />
                  : <span>{sellando ? "SELLANDO…" : "SIN FOTO"}</span>}
              </div>
              <div className="sello">
                {foto
                  ? <>Sellada con la hora y el punto donde se tomó. <b>Queda así</b>: la banda es parte de la imagen.</>
                  : <>La hora y el lugar se graban en la imagen al tomarla, no al subirla.</>}
              </div>
            </div>
            <input ref={camara} type="file" accept="image/*" capture="environment"
                   onChange={tomarFoto} hidden />
            <button type="button" className="otra" onClick={() => camara.current?.click()}
                    disabled={sellando}>
              {foto ? "Tomar otra foto" : "Tomar la foto"}
            </button>

            <div className="campo" style={{ marginTop: 14 }}>
              <label htmlFor="rt-des">Qué pasó (opcional)</label>
              <textarea id="rt-des" rows={3} value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        placeholder="Se cayó la estiba al bajar del montacargas" />
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
            : mandando ? "Registrando…"
            : exigeFoto && !foto ? "Falta la foto" : "Registrar"}
        </button>
      </div>
    </div>
  );
}
