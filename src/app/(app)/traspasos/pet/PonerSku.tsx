"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Desplegable } from "../comunes";

type Prod = { sku: string; nombre: string; formato_ml: number | null; cajas_por_estiba: number | null };
let cache: Prod[] | null = null;

/**
 * PONERLE EL SKU A UN VH DE PET QUE SE REGISTRÓ SIN ÉL (los de antes). Los mismos renglones que pide Registrar:
 * SKU de PET del maestro + estibas; el formato sale solo del SKU. Se guarda con la misma función (traspaso_pet_guardar).
 */
export function PonerSku({ viaje, carga, alGuardar, alCerrar }: { viaje: string; carga: number; alGuardar: () => void; alCerrar: () => void }) {
  const [cat, setCat] = useState<Prod[] | null>(cache);
  const [filas, setFilas] = useState<{ k: number; sku: string; est: string }[]>([{ k: 1, sku: "", est: carga ? String(carga) : "" }]);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (cat) return;
    void createClient().rpc("traspaso_pet_catalogo").then(({ data, error }) => {
      if (error) { setMsg(`No se pudo leer la lista de PET: ${error.message}`); setCat([]); return }
      cache = (data ?? []) as Prod[]; setCat(cache);
    });
  }, [cat]);

  const pon = (k: number, x: Partial<{ sku: string; est: string }>) => setFilas((f) => f.map((r) => (r.k === k ? { ...r, ...x } : r)));
  const num = (s: string) => Number(s.replace(",", "."));
  const ok = filas.length > 0 && filas.every((r) => r.sku && num(r.est) > 0);

  async function guardar() {
    setGuardando(true); setMsg(null);
    const r = await createClient().rpc("traspaso_pet_guardar", { p_viaje: viaje, p_filas: filas.map((x) => ({ sku: x.sku, estibas: num(x.est) })) });
    setGuardando(false);
    if (r.error) { setMsg(r.error.message); return }
    alGuardar();
  }

  return (
    <div className="tp-mat tp-pet pv-poner">
      <span className="rot-campo">SKU de este Vh <em className="rot-suave">el formato sale solo del SKU</em></span>
      {cat === null ? <p className="guia">Leyendo la lista de PET…</p> : cat.length === 0 ? <p className="guia">{msg ?? "No hay productos PET activos en el maestro."}</p> : (<>
        <div className="tp-mat-lista">
          {filas.map((m) => {
            const otros = new Set(filas.filter((x) => x.k !== m.k).map((x) => x.sku));
            return (
              <div key={m.k} className="tp-mat-fila">
                <div className="tp-mat-sku">
                  <Desplegable valor={m.sku} ariaLabel="SKU de PET" vacio="Escoge el SKU de PET…"
                    opciones={cat.filter((x) => !otros.has(x.sku) || x.sku === m.sku).map((x) => ({ valor: x.sku, texto: `${x.sku} · ${x.nombre}`, nota: x.formato_ml ? `${x.formato_ml} ml` : "sin formato en el maestro" }))}
                    alEscoger={(v) => pon(m.k, { sku: v })} />
                </div>
                <label className="tp-mat-est">
                  <input value={m.est} inputMode="decimal" placeholder="0" aria-label="Estibas" onChange={(e) => pon(m.k, { est: e.target.value })} />
                  <span>est.</span>
                </label>
                {filas.length > 1 && <button type="button" className="tp-mat-x" aria-label="Quitar" onClick={() => setFilas((f) => f.filter((x) => x.k !== m.k))}>×</button>}
              </div>
            );
          })}
        </div>
        <div className="pv-poner-pie">
          <button type="button" className="btn chico" onClick={() => setFilas((f) => [...f, { k: Math.max(...f.map((x) => x.k)) + 1, sku: "", est: "" }])}>＋ Otro SKU</button>
          <button type="button" className="btn chico" onClick={alCerrar}>Cancelar</button>
          <button type="button" className="btn si chico" disabled={!ok || guardando} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar"}</button>
          {msg && <span className="pv-poner-msg">{msg}</span>}
        </div>
      </>)}
    </div>
  );
}
