"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { ConteoFefo, Renglon } from "@/modulos/inventario/fefo";
import { alinearPasivosDeDias } from "../balance/actions";

/* ===================================================================
   CAMBIAR EL CÓDIGO DE UN RENGLÓN — solo quien administra.

   «Se contó con un código que no era»: se marca UN renglón de lo enviado en La base,
   se escribe el código correcto y se guarda. La cantidad, la ubicación, el vencimiento
   y las fotos quedan como estaban; solo cambia el material. La base vuelve a comprobar
   que sea administrador, que el código exista y sea del mismo tipo (producto con producto,
   envase con envase), que no choque con otro renglón igual y deja constancia de lo que
   había antes (conteo_lineas_correcciones).

   Vive en su propio archivo por la misma razón que CorregirRenglon: Base.tsx es una
   pantalla de LECTURA y esto solo se monta para el administrador.
   =================================================================== */
export function CambiarCodigo({ elegidos, conteos, alGuardar }: {
  elegidos: Renglon[];
  /** Los recorridos, para saber de qué día es el renglón (y alinear Pasivos con ese día). */
  conteos: ConteoFefo[];
  alGuardar: () => void;
}) {
  const router = useRouter();
  const r = elegidos.length === 1 ? elegidos[0] : null;
  const [abierto, setAbierto] = useState(false);
  const [cod, setCod] = useState("");
  /* Lo que dice el maestro del código escrito: null = no se ha buscado, "" = no existe. */
  const [nuevo, setNuevo] = useState<{ sku: string; nombre: string; tipo: string; activo: boolean } | "" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const id = r?.id ?? "";
  useEffect(() => {
    setAbierto(false);
    if (id !== "") { setMal(null); setAviso(null) }
  }, [id]);

  const limpio = cod.trim().toUpperCase();
  /* Cada vez que se escribe, se busca el código en el maestro para mostrar QUÉ material es antes de guardar. */
  useEffect(() => {
    setNuevo(null);
    if (!abierto || limpio.length < 3) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await createClient().from("productos").select("sku,nombre,tipo_material,activo").ilike("sku", limpio).limit(1);
      if (!vivo) return;
      const p = ((data ?? []) as { sku: string; nombre: string; tipo_material: string; activo: boolean }[])[0];
      setNuevo(p ? { sku: p.sku, nombre: p.nombre, tipo: p.tipo_material, activo: p.activo } : "");
    }, 300);
    return () => { vivo = false; clearTimeout(t) };
  }, [limpio, abierto]);

  function abrir() { setCod(""); setNuevo(null); setMal(null); setAviso(null); setAbierto(true) }

  const p = nuevo === null || nuevo === "" ? null : nuevo;
  const mismoTipo = p ? p.tipo === r?.tipo_material : false;
  const igual = !!p && p.sku.toUpperCase() === r?.codigo.toUpperCase();
  const sirve = !!p && p.activo && mismoTipo && !igual;
  const motivo = !limpio ? null
    : nuevo === "" ? `El código ${limpio} no existe en el maestro de materiales.`
    : p && !p.activo ? `El código ${p.sku} está inactivo.`
    : p && !mismoTipo ? `${p.sku} es ${p.tipo.toLowerCase()} y este renglón es ${String(r?.tipo_material).toLowerCase()}: solo se cambia entre códigos del mismo tipo.`
    : igual ? "Ese ya es el código del renglón."
    : null;

  async function guardar() {
    if (!r || !sirve) return;
    setOcupado(true); setMal(null);
    const { data, error } = await createClient().rpc("conteo_fefo_linea_cambiar_codigo", { p_linea: r.id, p_codigo: limpio });
    setOcupado(false);
    if (error) { setMal(traducirError(error.message)); return }
    const x = ((data ?? []) as { fefo: string; codigo_antes: string; codigo_nuevo: string; material_nuevo: string }[])[0];
    setAbierto(false);
    /* LA BASE DE PASIVOS SE ALINEA SOLA con el balance de ese día (como al corregir una cantidad). */
    const dia = conteos.find((c) => c.id === r.conteo_id)?.fecha_analisis ?? null;
    let pas = "";
    if (dia) {
      try {
        const a = await alinearPasivosDeDias([dia]);
        const n = a.pasivos[String(dia).slice(0, 10)];
        pas = n == null ? " Pasivos no se tocó (ese día no se ha traído del balance, o ya está cerrado)." : ` Pasivos quedó al día (${n} filas).`;
      } catch { pas = " No se pudo alinear Pasivos: vuelve a traer del balance." }
    }
    setAviso((x ? `FEFO ${x.fefo}: el renglón pasó del código ${x.codigo_antes} a ${x.codigo_nuevo} · ${x.material_nuevo}.` : "Código cambiado.") + pas);
    alGuardar();
    router.refresh();
  }

  return (
    <div className="ba-quitar ba-corregir" role="group" aria-label="Cambiar el código de un renglón (solo administrador)">
      <span className="ba-quitar-cuenta" aria-live="polite">
        {elegidos.length === 0 && "Administrador: marca UN renglón para cambiarle el código."}
        {elegidos.length > 1 && "Para cambiar un código marca un solo renglón."}
        {r && `${r.codigo} · ${r.material} · ${r.ubicacion_combinada ?? r.ubicacion ?? ""}`}
      </span>
      {!abierto && (
        <button type="button" className="btn plano" disabled={!r || ocupado} onClick={abrir}>Cambiar código</button>
      )}
      {abierto && r && (
        <div className="ba-corr-form" role="dialog" aria-label="Cambiar código">
          <label className="ba-corr-campo">Código nuevo
            <input value={cod} onChange={(ev) => setCod(ev.target.value)} autoFocus style={{ width: 170 }} autoComplete="off" />
          </label>
          <span className="ba-corr-total">
            Ahora: <b>{r.codigo}</b> · {r.material} → {sirve && p ? <><b>{p.sku}</b> · {p.nombre}</> : <b>—</b>}
            {" "}({r.total_cajas} cajas, no cambian)
          </span>
          <button type="button" className="btn" disabled={ocupado || !sirve} onClick={guardar}>{ocupado ? "Guardando…" : "Guardar"}</button>
          <button type="button" className="btn plano" disabled={ocupado} onClick={() => setAbierto(false)}>Cancelar</button>
        </div>
      )}
      {abierto && motivo && <span className="ba-conso-mal" role="alert">{motivo}</span>}
      {aviso && <span className="ba-elim-ok" role="status">{aviso}</span>}
      {mal && <span className="ba-conso-mal" role="alert">{mal}</span>}
    </div>
  );
}
