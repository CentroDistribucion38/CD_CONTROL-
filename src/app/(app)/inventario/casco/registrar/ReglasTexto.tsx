"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import { NOMBRE_DESTINO, reglaDe, type DestinoRegla, type ReglaTexto } from "@/modulos/casco/baja";

type Fila = ReglaTexto & { llave: string };

/**
 * LAS REGLAS DE TEXTOS DE LAS BAJAS (casco_reglas_texto), en una ventana: qué textos suman, restan o solo quedan en el
 * registro, y a dónde. Se agregan, se editan, se ordenan (↑ ↓: gana la primera que cuadra), se apagan y se quitan.
 * Arriba de todo, fija, la nota «NO HAGA NADA»; abajo, fija, «cualquier otro texto suma al inventario».
 * Con «Probar un texto» se ve qué haría una fila antes de subir el archivo.
 */
export function ReglasTexto({ reglas, puedeEditar, falta, cerrar, guardadas }: {
  reglas: ReglaTexto[]; puedeEditar: boolean; falta: boolean; cerrar: () => void; guardadas: (r: ReglaTexto[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const orig = () => [...reglas].sort((a, b) => a.orden - b.orden).map((r) => ({ ...r, llave: r.id ?? Math.random().toString(36).slice(2) }));
  const [filas, setFilas] = useState<Fila[]>(orig);
  const [prueba, setPrueba] = useState({ texto: "", desc: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialogo) cerrar() };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [cerrar, dialogo]);

  const editable = puedeEditar && !falta;
  const poner = (k: number, c: Partial<Fila>) => setFilas((x) => x.map((f, j) => (j === k ? { ...f, ...c } : f)));
  const mover = (k: number, d: -1 | 1) => setFilas((x) => { const y = [...x], j = k + d; if (j < 0 || j >= y.length) return x; [y[k], y[j]] = [y[j], y[k]]; return y });
  const agregar = () => setFilas((x) => [...x, { patron: "", busca: "texto", destino: "registro", orden: 0, activo: true, llave: "n" + Math.random().toString(36).slice(2) }]);
  const quitar = async (k: number) => {
    const f = filas[k];
    if (f.id && !(await pedir({ titulo: `¿Quitar la regla «${f.patron}»?`, dice: "Las bajas que ya se aplicaron no cambian; desde ahora ese texto sigue la siguiente regla que cuadre (o suma al inventario).", confirmar: "Quitar", peligro: true }))) return;
    setFilas((x) => x.filter((_, j) => j !== k));
  };
  const ordenadas = filas.map((f, k) => ({ ...f, orden: (k + 1) * 10 }));
  const r = prueba.texto.trim() || prueba.desc.trim() ? reglaDe(prueba.texto, prueba.desc, ordenadas) : undefined;

  async function guardar() {
    if (filas.some((f) => !f.patron.trim())) { setError("Hay una regla sin texto."); return }
    setGuardando(true); setError(null);
    try {
      const antes = new Set(reglas.map((x) => x.id).filter(Boolean) as string[]);
      const quedan = new Set(ordenadas.map((x) => x.id).filter(Boolean) as string[]);
      const borrar = [...antes].filter((id) => !quedan.has(id));
      if (borrar.length) { const { error: e } = await supabase.from("casco_reglas_texto").delete().in("id", borrar); if (e) throw e }
      for (const f of ordenadas) {
        const fila = { patron: f.patron.trim().toUpperCase(), busca: f.busca, destino: f.destino, orden: f.orden, activo: f.activo, nota: f.nota ?? null, actualizado_en: new Date().toISOString() };
        const { error: e } = f.id ? await supabase.from("casco_reglas_texto").update(fila).eq("id", f.id) : await supabase.from("casco_reglas_texto").insert(fila);
        if (e) throw e;
      }
      const { data, error: e } = await supabase.from("casco_reglas_texto").select("*").order("orden");
      if (e) throw e;
      guardadas((data ?? []) as ReglaTexto[]);
      cerrar();
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      setError(/row-level security|permission/i.test(m) ? "Tu rol no puede cambiar las reglas." : m);
    } finally { setGuardando(false) }
  }

  const dest = (d: DestinoRegla) => <span className={"reg-etq" + (d === "baja" ? " baja" : d === "registro" ? " solo" : "")}>{NOMBRE_DESTINO[d]}</span>;

  return (
    <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="rt-t" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      {dialogo}
      <div className="cf-caja rt-caja">
        <h2 id="rt-t">Reglas de textos de la baja</h2>
        <p className="cf-dice">El <b>Texto cab.documento</b> decide a dónde va cada fila. Se revisan de arriba hacia abajo y <b>gana la primera</b> que cuadra.
          Una regla cuadra si el texto trae <b>todas sus palabras</b> (sin importar tildes ni mayúsculas; «OBSOLET» sirve para obsoleto y obsoleta).</p>
        {falta && <p className="cas-aviso mal">Falta correr <b>supabase/migraciones/2026-11-casco-reglas-texto.sql</b>: por ahora valen las reglas de siempre y no se pueden cambiar.</p>}

        <div className="rt-tabla">
          <div className="rt-fija"><span className="rt-n">★</span><b>«NO HAGA NADA»</b> en cualquier celda de la fila <i>(siempre gana)</i>{dest("registro")}</div>
          <div className="rt-cab"><span /><span>Si el texto dice</span><span>Busca en</span><span>Va a</span><span>Activa</span><span /></div>
          {filas.map((f, k) => (
            <div key={f.llave} className={"rt-fila" + (f.activo ? "" : " off")}>
              <span className="rt-mover">
                <button type="button" disabled={!editable || k === 0} onClick={() => mover(k, -1)} aria-label="Subir">↑</button>
                <button type="button" disabled={!editable || k === filas.length - 1} onClick={() => mover(k, 1)} aria-label="Bajar">↓</button>
              </span>
              <input value={f.patron} disabled={!editable} onChange={(e) => poner(k, { patron: e.target.value })} placeholder="Ej.: BAJA TALLER" aria-label="Texto" />
              <select value={f.busca} disabled={!editable} onChange={(e) => poner(k, { busca: e.target.value as ReglaTexto["busca"] })} aria-label="Busca en">
                <option value="texto">El texto</option><option value="texto_desc">Texto o descripción</option>
              </select>
              <select value={f.destino} disabled={!editable} onChange={(e) => poner(k, { destino: e.target.value as DestinoRegla })} aria-label="Va a" className={"rt-dest " + f.destino}>
                <option value="inventario">{NOMBRE_DESTINO.inventario}</option>
                <option value="baja">{NOMBRE_DESTINO.baja}</option>
                <option value="registro">{NOMBRE_DESTINO.registro}</option>
              </select>
              <label className="rt-act"><input type="checkbox" checked={f.activo} disabled={!editable} onChange={(e) => poner(k, { activo: e.target.checked })} /></label>
              <button type="button" className="rt-x" disabled={!editable} onClick={() => void quitar(k)} aria-label={`Quitar ${f.patron}`}>✕</button>
            </div>
          ))}
          <div className="rt-fija"><span className="rt-n">∗</span><b>Cualquier otro texto</b> (sorting, presorting…) {dest("inventario")}</div>
        </div>
        {editable && <button type="button" className="cf-btn plano rt-mas" onClick={agregar}>+ Agregar texto</button>}

        <div className="rt-prueba">
          <b>Probar un texto</b>
          <input value={prueba.texto} onChange={(e) => setPrueba({ ...prueba, texto: e.target.value })} placeholder="Texto cab.documento (ej.: BAJA SORTING JG)" aria-label="Texto de prueba" />
          <input value={prueba.desc} onChange={(e) => setPrueba({ ...prueba, desc: e.target.value })} placeholder="Descripción del material (opcional)" aria-label="Descripción de prueba" />
          {r !== undefined && <p>→ {r ? <>cuadra con <b>«{r.patron}»</b>: {dest(r.destino)}</> : <>ninguna regla cuadra: {dest("inventario")}</>}</p>}
        </div>

        <p className="cf-dice">«Resta en «… con baja»» va a la columna de baja del almacén de la fila (Lavado con baja en Fábrica, Extrasucio con baja en Bodega 38).
          Cambiar una regla no toca las bajas ya aplicadas: vale para lo que se suba desde ahora.</p>
        {error && <p className="cas-aviso mal">{error}</p>}
        <div className="cf-botones">
          <button type="button" className="cf-btn plano" onClick={cerrar}>{editable ? "Cancelar" : "Cerrar"}</button>
          {editable && <button type="button" className="cf-btn" disabled={guardando} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar reglas"}</button>}
        </div>
      </div>
    </div>
  );
}
