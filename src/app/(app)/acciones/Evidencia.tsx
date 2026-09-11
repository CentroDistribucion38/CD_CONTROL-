"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Accion, Comentario, FotoAccion } from "@/modulos/acciones/datos";

/**
 * LA EVIDENCIA — las fotos y el seguimiento de una acción.
 *
 * Sin esta pantalla, todo el trabajo de sellar fotos con hora y
 * coordenadas producía algo que nadie podía mirar. Aquí se mira.
 *
 * ANTES Y DESPUÉS, LADO A LADO. Las dos ranuras se pintan siempre, aunque
 * una esté vacía: el hueco del "después" es la pregunta "¿y cómo quedó?",
 * y esa pregunta es la que hace que alguien suba la segunda foto. Si la
 * ranura vacía no se dibujara, nadie sabría que existe.
 *
 * NINGUNA DE LAS DOS ES OBLIGATORIA, a propósito. Hay hallazgos que no se
 * pueden fotografiar —un olor, un procedimiento que nadie sigue— y una
 * foto obligatoria en esos casos produce fotos del piso con tal de pasar
 * al siguiente paso. Lo que sí se dice, con esas palabras, es qué pierde
 * una acción sin foto: la palabra de alguien contra la de otro cuando
 * llegue la hora de verificar.
 *
 * SE PIDE AL ABRIR, no antes. Firmar quinientas URL para que alguien mire
 * una es trabajo que se paga en espera.
 */

type Datos = {
  fotos: FotoAccion[];
  hilo: Comentario[];
  nombres: Record<string, string>;
};

const RANURAS = [
  { id: "hallazgo", t: "Cómo estaba", d: "La foto del hallazgo, del momento de reportar" },
  { id: "cierre", t: "Cómo quedó", d: "La foto de después, del momento de cerrar" },
] as const;

export function Evidencia({ accion, puedeEditar }: {
  accion: Accion;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [grande, setGrande] = useState<FotoAccion | null>(null);
  const [texto, setTexto] = useState("");
  const [mandando, setMandando] = useState(false);

  const traer = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/acciones/evidencia/${accion.id}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json())?.error ?? "No se pudo leer la evidencia.");
      setDatos(await r.json());
    } catch (e) {
      avisar.mal((e as Error).message);
    }
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accion.id]);

  useEffect(() => { traer(); }, [traer]);

  async function comentar() {
    setMandando(true);
    const { error } = await supabase.rpc("accion_comentar", {
      p_id: accion.id, p_texto: texto.trim(),
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    setTexto("");
    await traer();
    router.refresh();
  }

  const fecha = (s: string | null) =>
    s ? new Date(s).toLocaleString("es-CO", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }) : "—";

  const quien = (id: string | null) => (id ? (datos?.nombres[id] ?? "—") : "—");

  return (
    <div className="panel ev">
      {avisos}

      {/* La foto en grande. Se abre sobre todo porque una foto de
          evidencia se mira para DECIDIR, y en 160 px no se decide nada. */}
      {grande && (
        <div className="ac-modal" role="dialog" aria-modal="true" onClick={() => setGrande(null)}>
          <button type="button" className="fondo" aria-label="Cerrar" />
          <div className="ventana foto-grande" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={grande.url ?? ""} alt={grande.ranura === "cierre" ? "Cómo quedó" : "Cómo estaba"} />
            <div className="pie-foto">
              <div>
                <b>{grande.ranura === "cierre" ? "Cómo quedó" : "Cómo estaba"}</b>
                {" · "}{fecha(grande.tomada_en ?? grande.subida_en)}
                {grande.lat != null && (
                  <> · {Number(grande.lat).toFixed(5)}, {Number(grande.lng).toFixed(5)}
                    {grande.precision_m != null && ` · ±${Math.round(Number(grande.precision_m))} m`}</>
                )}
              </div>
              <button type="button" onClick={() => setGrande(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <div className="ev-fotos">
        {RANURAS.map((r) => {
          const f = datos?.fotos.find((x) => x.ranura === r.id) ?? null;
          return (
            <div key={r.id} className={"ev-ranura" + (f ? "" : " vacia")}>
              <div className="rot">{r.t}</div>
              {f?.url ? (
                <button type="button" className="lienzo" onClick={() => setGrande(f)}
                        aria-label={`Ver ${r.t} en grande`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={r.t} />
                </button>
              ) : (
                <div className="lienzo hueco">
                  {cargando ? "…" : r.id === "cierre" && accion.viva
                    ? "Se toma al cerrar" : "Sin foto"}
                </div>
              )}
              <div className="pie">
                {f ? (
                  <>
                    {fecha(f.tomada_en ?? f.subida_en)}
                    {f.lat != null && (
                      <> · {Number(f.lat).toFixed(4)}, {Number(f.lng).toFixed(4)}
                        {f.precision_m != null && ` · ±${Math.round(Number(f.precision_m))} m`}</>
                    )}
                    <br />{quien(f.subida_por)}
                  </>
                ) : r.d}
              </div>
            </div>
          );
        })}
      </div>

      {!cargando && !datos?.fotos.length && (
        <div className="aviso">
          Esta acción no tiene fotos. No es obligatorio tenerlas —hay hallazgos que no se pueden
          fotografiar— pero sin una, a la hora de verificar queda la palabra de alguien contra la
          de otro.
        </div>
      )}

      {/* ---------------- DÓNDE ---------------- */}
      <div className="ev-donde">
        <span className="rot">DÓNDE</span>
        <span>
          <b>{accion.zona_nombre ?? accion.ubicacion}</b>
          {accion.zona && <> · <code>{accion.zona}</code></>}
          {accion.lat != null && (
            <> · {Number(accion.lat).toFixed(5)}, {Number(accion.lng).toFixed(5)}
              {accion.precision_m != null && ` · precisión ${Math.round(Number(accion.precision_m))} m`}</>
          )}
        </span>
      </div>

      {/* ---------------- SEGUIMIENTO ---------------- */}
      <div className="ev-hilo">
        <div className="rot">SEGUIMIENTO</div>

        {/* La historia entera, y en orden. Lo que escribió la base al
            verificar como no efectiva está aquí junto a lo que escribió
            la gente: es la misma conversación. */}
        <div className="ev-linea">
          <b>{quien(accion.reportada_por)}</b> reportó · {fecha(accion.reportada_en)}
          {accion.descripcion && <div className="dice">{accion.descripcion}</div>}
        </div>

        {accion.asignada_en && (
          <div className="ev-linea">
            <b>{quien(accion.asignada_por)}</b> se la asignó a{" "}
            <b>{quien(accion.responsable)}</b> · {fecha(accion.asignada_en)}
          </div>
        )}

        {accion.cerrada_en && (
          <div className="ev-linea">
            <b>{quien(accion.cerrada_por)}</b> cerró · {fecha(accion.cerrada_en)}
            <div className="dice">{accion.que_se_hizo}</div>
          </div>
        )}

        {accion.verificada_en && (
          <div className={"ev-linea" + (accion.efectiva ? "" : " mal")}>
            <b>{quien(accion.verificada_por)}</b> verificó ·{" "}
            {accion.efectiva ? "fue efectiva" : "NO fue efectiva"} · {fecha(accion.verificada_en)}
            {accion.nota_verificacion && <div className="dice">{accion.nota_verificacion}</div>}
          </div>
        )}

        {datos?.hilo.map((c) => (
          <div className="ev-linea" key={c.id}>
            <b>{quien(c.escrito_por)}</b> · {fecha(c.escrito_en)}
            <div className="dice">{c.texto}</div>
          </div>
        ))}

        {puedeEditar && (
          <div className="ev-decir">
            <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)}
                      placeholder="Escribe qué pasó con esta acción: se pidió el repuesto, falta el permiso de altura…" />
            <button type="button" className="btn si"
                    disabled={mandando || texto.trim().length < 3}
                    onClick={comentar}>
              {mandando ? "Guardando…" : "Agregar"}
            </button>
          </div>
        )}

        {/* Solo agrega, nunca edita ni borra. Una acción que lleva ocho
            días es una conversación, y si esa conversación se puede
            reescribir después no sirve para explicar por qué se demoró. */}
        <p className="ev-nota">
          El seguimiento solo se agrega: no se edita ni se borra.
        </p>
      </div>
    </div>
  );
}
