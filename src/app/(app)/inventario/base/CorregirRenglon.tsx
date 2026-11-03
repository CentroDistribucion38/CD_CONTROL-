"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { ConteoFefo, Renglon } from "@/modulos/inventario/fefo";
import { alinearPasivosDeDias } from "../balance/actions";

/* ===================================================================
   CORREGIR LA CANTIDAD DE UN RENGLÓN — solo quien administra.

   «Me colocaron 30 y son 25: quiero poder poner 25.» Se marca UN renglón de lo
   enviado en La base, se abre este formulario con lo que tiene, se cambian las
   cantidades y se guarda. La base vuelve a comprobar que sea administrador y
   que el renglón sea de un FEFO, respeta la regla «o cajas a secas, o estibas
   con saldo» y deja constancia de lo que había antes (conteo_lineas_correcciones).

   Vive en su propio archivo por la misma razón que QuitarRenglones: Base.tsx
   es una pantalla de LECTURA y solo se monta esto para el administrador.
   =================================================================== */
const aNum = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

export function CorregirRenglon({ elegidos, conteos, alGuardar }: {
  elegidos: Renglon[];
  /** Los recorridos, para saber de qué día es el renglón (y alinear Pasivos con ese día). */
  conteos: ConteoFefo[];
  alGuardar: () => void;
}) {
  const router = useRouter();
  const r = elegidos.length === 1 ? elegidos[0] : null;
  const [abierto, setAbierto] = useState(false);
  const [forma, setForma] = useState<"estibas" | "cajas">("estibas");
  const [est, setEst] = useState(""); const [sal, setSal] = useState(""); const [caj, setCaj] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /* Si el renglón tiene cajas ya reasignadas en el Balance y la cantidad nueva no las alcanza, se avisa y se pide confirmar. */
  const [choque, setChoque] = useState<string | null>(null);

  /* Cambiar de renglón marcado cierra el formulario y lo vuelve a llenar con ese renglón. */
  const id = r?.id ?? "";
  useEffect(() => {
    setAbierto(false); setChoque(null);
    if (id !== "") { setMal(null); setAviso(null) }
  }, [id]);

  function abrir() {
    if (!r) return;
    setForma(r.cajas != null ? "cajas" : "estibas");
    setEst(r.estibas == null ? "" : String(r.estibas));
    setSal(r.saldo == null ? "" : String(r.saldo));
    setCaj(r.cajas == null ? "" : String(r.cajas));
    setMal(null); setAviso(null); setChoque(null); setAbierto(true);
  }

  const e = forma === "estibas" ? aNum(est) : null;
  const s = forma === "estibas" ? aNum(sal) : null;
  const c = forma === "cajas" ? aNum(caj) : null;
  const invalido = [e, s, c].some((x) => Number.isNaN(x));
  const vacio = e == null && s == null && c == null;
  const factor = Number(r?.factor_estibado ?? 0);
  const nuevo = (factor * (e ?? 0)) + (s ?? 0) + (c ?? 0);

  async function guardar() {
    if (!r || invalido || vacio) return;
    setOcupado(true); setMal(null);
    const supabase = createClient();
    /* REASIGNACIONES PARCIALES: «de las 4.320 pasé 2.000 a RETORNO». Si lo nuevo ya no alcanza para esa parte, el Balance la
       descarta y TODO el renglón vuelve al estado en que se contó (puede subir LAVADO y Pasivos). Se avisa antes de guardar. */
    if (!choque) {
      try {
        const { data: dv } = await supabase.from("balance_divisiones").select("cajas").eq("conteo_envase_id", r.id);
        const sep = ((dv ?? []) as { cajas: number | string }[]).reduce((t, x) => t + (Number(x.cajas) || 0), 0);
        if (sep > 0 && sep >= nuevo) {
          setChoque(`Este renglón tiene ${sep.toLocaleString("es-CO")} cajas ya reasignadas en el Balance y con ${nuevo.toLocaleString("es-CO")} no caben: esa reasignación se pierde y todo el renglón vuelve a «${r.estado_envase ?? "su estado contado"}». Deja el renglón en más de ${sep.toLocaleString("es-CO")} cajas, o vuelve a reasignar después de guardar.`);
          setOcupado(false);
          return;
        }
      } catch { /* sin permiso o sin tabla: se sigue como siempre */ }
    }
    const { data, error } = await supabase.rpc("conteo_fefo_linea_corregir", {
      p_linea: r.id, p_estibas: e, p_saldo: s, p_cajas: c,
    });
    setOcupado(false); setChoque(null);
    if (error) { setMal(traducirError(error.message)); return }
    const x = ((data ?? []) as { codigo: string; antes: number; despues: number }[])[0];
    setAbierto(false);
    /* LA BASE DE PASIVOS SE ALINEA SOLA con el balance de ese día (como al reasignar). */
    const dia = conteos.find((c) => c.id === r.conteo_id)?.fecha_analisis ?? null;
    let pas = "";
    if (dia) {
      try {
        const a = await alinearPasivosDeDias([dia]);
        const n = a.pasivos[String(dia).slice(0, 10)];
        pas = n == null ? " Pasivos no se tocó (ese día no se ha traído del balance, o ya está cerrado)." : ` Pasivos quedó al día (${n} filas).`;
      } catch { pas = " No se pudo alinear Pasivos: vuelve a traer del balance." }
    }
    setAviso((x ? `FEFO ${x.codigo}: el renglón pasó de ${x.antes} a ${x.despues} cajas.` : "Renglón corregido.") + pas);
    alGuardar();
    router.refresh();
  }

  return (
    <div className="ba-quitar ba-corregir" role="group" aria-label="Corregir cantidad de un renglón (solo administrador)">
      <span className="ba-quitar-cuenta" aria-live="polite">
        {elegidos.length === 0 && "Administrador: marca UN renglón para corregir su cantidad."}
        {elegidos.length > 1 && "Para corregir una cantidad marca un solo renglón."}
        {r && `${r.codigo} · ${r.material} · ${r.ubicacion_combinada ?? r.ubicacion ?? ""}`}
      </span>
      {!abierto && (
        <button type="button" className="btn plano" disabled={!r || ocupado} onClick={abrir}>Corregir cantidad</button>
      )}
      {abierto && r && (
        <div className="ba-corr-form" role="dialog" aria-label="Corregir cantidad">
          <div className="ba-corr-forma" role="radiogroup" aria-label="Forma de contar">
            <label><input type="radio" name="forma-corr" checked={forma === "estibas"} onChange={() => setForma("estibas")} /> Estibas + saldo</label>
            <label><input type="radio" name="forma-corr" checked={forma === "cajas"} onChange={() => setForma("cajas")} /> Cajas</label>
          </div>
          {forma === "estibas" ? (
            <>
              <label className="ba-corr-campo">Estibas
                <input inputMode="numeric" value={est} onChange={(ev) => setEst(ev.target.value)} />
              </label>
              <label className="ba-corr-campo">Saldo
                <input inputMode="numeric" value={sal} onChange={(ev) => setSal(ev.target.value)} />
              </label>
            </>
          ) : (
            <label className="ba-corr-campo">Cajas
              <input inputMode="numeric" value={caj} onChange={(ev) => setCaj(ev.target.value)} />
            </label>
          )}
          <span className="ba-corr-total">
            Antes: <b>{r.total_cajas}</b> cajas → ahora: <b>{invalido || vacio ? "—" : nuevo}</b> cajas
          </span>
          <button type="button" className="btn" disabled={ocupado || invalido || vacio} onClick={guardar}>
            {ocupado ? "Guardando…" : choque ? "Guardar de todos modos" : "Guardar"}
          </button>
          <button type="button" className="btn plano" disabled={ocupado} onClick={() => setAbierto(false)}>Cancelar</button>
        </div>
      )}
      {invalido && abierto && <span className="ba-conso-mal" role="alert">Solo números enteros, sin negativos.</span>}
      {choque && abierto && <span className="ba-conso-mal" role="alert">{choque}</span>}
      {aviso && <span className="ba-elim-ok" role="status">{aviso}</span>}
      {mal && <span className="ba-conso-mal" role="alert">{mal}</span>}
    </div>
  );
}
