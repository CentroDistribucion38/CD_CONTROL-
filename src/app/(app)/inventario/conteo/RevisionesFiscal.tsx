"use client";

/* ===================================================================
   «REVISA ESTE MÓDULO» — LO QUE VE CADA PERSONA CUANDO EL FISCAL MANDA A VALIDAR

   El fiscal ve diferencias en el cruce y manda a validar unos módulos. A las DOS personas de la hoja
   les sale aquí, por cada módulo, SOLO lo que ellas mismas anotaron y no cuadra (nunca lo de su pareja:
   el conteo sigue a ciegas), y mientras haya algo por validar la pantalla de Contar oculta todo lo demás.

   Se va bajando y corrigiendo, con el MISMO formulario de Contar (código, vencimiento, estibas, saldo,
   calculadora, foto…):
     · «Corregir»: abre ese renglón en el formulario de Contar; se guarda en su sitio.
     · «Quitar»: lo saca (el que no debía estar).
     · «Agregar un renglón que falta»: el mismo formulario, ya puesto en ese módulo.
     · «Enviar este módulo»: avisa al fiscal que ya revisó. Si no hubo nada que cambiar, es lo mismo que
       decir «lo que conté está bien».

   La revisión es por CALLE Y MÓDULO (A01): el lado no se muestra ni se pregunta, porque delataría dónde
   está cada cosa. Lo que se muestra se FIJA al empezar la ronda: si fuera cambiando mientras corriges,
   uno podría ir probando cifras hasta que el renglón «cuadre» y adivinar lo de la pareja.

   Sigue funcionando aunque la persona ya haya terminado su hoja: la base deja tocar solo los módulos que
   el fiscal mandó a validar. Cuando las dos responden, el fiscal ve el cruce otra vez y aprueba (o la manda a otra ronda).
   =================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { RenglonFiscal } from "@/modulos/inventario/fiscal-contar";

type RevisionMia = {
  fiscal_id: string; hoja_id: string; hoja: number; ubicacion_id: string; ubicacion: string;
  ronda: number; nota: string | null; pedido_en: string | null; ya_envie: boolean;
};
/** Un módulo (A01) = sus dos lados juntos. */
export type ModuloRevision = { modulo: string; filas: RevisionMia[]; ronda: number; nota: string | null; yaEnvie: boolean };
const moduloDe = (clave: string) => clave.replace(/_(IZQ|DER)$/i, "");

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const dd = (n: number | null) => (n == null ? "··" : String(n).padStart(2, "0"));

export function RevisionesFiscal({ hojaId, mios, alCambiar, avisar, ocupado, alCorregir, alQuitar, alAgregar, alHaberPendientes }: {
  hojaId: string;
  /** Lo que esta persona lleva anotado en su hoja (todas las ubicaciones). */
  mios: RenglonFiscal[] | null;
  /** Después de enviar: la hoja vuelve a leer lo suyo. */
  alCambiar: () => Promise<void>;
  avisar: { bien: (m: string) => void; mal: (m: string) => void };
  /** Algo se está guardando en la pantalla de Contar. */
  ocupado: boolean;
  /** Abre ese renglón en el formulario de Contar. */
  alCorregir: (r: RenglonFiscal) => void;
  alQuitar: (r: RenglonFiscal) => void;
  /** Abre el formulario de Contar para agregar un renglón en ese módulo. */
  alAgregar: (m: ModuloRevision) => void;
  /** Cuántos módulos tiene esta persona por responder (0 = nada: Contar vuelve a verse completo). */
  alHaberPendientes: (n: number) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [revs, setRevs] = useState<RevisionMia[]>([]);
  const [mal, setMal] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /* Ids de MIS renglones que no cuadran con mi pareja. null = la base aún no tiene la función (se muestra todo, como antes). */
  const [difieren, setDifieren] = useState<Set<string> | null>(null);
  const [difCargado, setDifCargado] = useState(false);
  /* LO QUE SE MUESTRA SE FIJA al empezar cada ronda de cada módulo (ver arriba): qué renglones no cuadraban y cuáles había. */
  const fijado = useRef<Record<string, { dif: Set<string> | null; todos: Set<string> }>>({});
  const [, repintar] = useState(0);

  const leer = useCallback(async () => {
    const { data, error } = await supabase.rpc("inv_fiscal_mis_revisiones");
    /* Si a la base le falta 2026-10-fiscal-validar.sql, la persona no ve nada y cuenta como siempre. */
    if (error) { setRevs([]); return }
    setRevs(((data ?? []) as RevisionMia[]).filter((r) => r.hoja_id === hojaId));
    const d = await supabase.rpc("inv_fiscal_mis_diferencias", { p_hoja: hojaId });
    setDifieren(d.error ? null : new Set(((d.data ?? []) as { conteo_id: string }[]).map((x) => x.conteo_id)));
    setDifCargado(true);
  }, [supabase, hojaId]);

  useEffect(() => {
    void leer();
    const t = setInterval(() => { if (!document.hidden) void leer() }, 20_000);
    return () => clearInterval(t);
  }, [leer]);

  const modulos = useMemo<ModuloRevision[]>(() => {
    const m = new Map<string, ModuloRevision>();
    for (const r of revs) {
      const k = moduloDe(r.ubicacion);
      const x = m.get(k) ?? { modulo: k, filas: [], ronda: 0, nota: null, yaEnvie: true };
      x.filas.push(r);
      x.ronda = Math.max(x.ronda, r.ronda);
      x.nota = x.nota ?? r.nota;
      if (!r.ya_envie) x.yaEnvie = false;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => a.modulo.localeCompare(b.modulo, "es", { numeric: true }));
  }, [revs]);
  const pendientes = modulos.filter((m) => !m.yaEnvie);
  const enviadas = modulos.filter((m) => m.yaEnvie);

  const todosDe = useCallback((m: ModuloRevision) => (mios ?? []).filter((r) => m.filas.some((f) => f.ubicacion_id === r.ubicacion_id)), [mios]);

  /* Al empezar la ronda de un módulo se anota qué había y qué no cuadraba; no se vuelve a tocar hasta la ronda siguiente. */
  useEffect(() => {
    if (mios === null || !difCargado) return;
    let nuevo = false;
    for (const m of pendientes) {
      const k = `${m.modulo}|${m.ronda}`;
      if (fijado.current[k]) continue;
      fijado.current[k] = { dif: difieren, todos: new Set(todosDe(m).map((r) => r.id)) };
      nuevo = true;
    }
    if (nuevo) repintar((n) => n + 1);
  }, [mios, difCargado, difieren, pendientes, todosDe]);

  useEffect(() => { alHaberPendientes(pendientes.length) }, [pendientes.length, alHaberPendientes]);

  if (revs.length === 0) return null;

  /** Solo lo que no cuadra (y lo que esta persona agregó en esta ronda); lo que coincide con la pareja no se muestra, para no enredar. */
  const misDe = (m: ModuloRevision): RenglonFiscal[] | null => {
    const f = fijado.current[`${m.modulo}|${m.ronda}`];
    if (!f) return null;
    return todosDe(m).filter((r) => f.dif === null || f.dif.has(r.id) || !f.todos.has(r.id));
  };
  const textoCant = (r: RenglonFiscal) => {
    if (r.cajas != null) return `${nf.format(r.cajas)} caja${r.cajas === 1 ? "" : "s"}`;
    const e = r.estibas ?? 0, s = r.saldo ?? 0;
    return [e > 0 || s === 0 ? `${nf.format(e)} estiba${e === 1 ? "" : "s"}` : "", s > 0 ? `${nf.format(s)} caja${s === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
  };

  async function enviar(m: ModuloRevision) {
    setEnviando(true); setMal(null);
    const { error } = await supabase.rpc("inv_fiscal_revision_enviar_modulo", { p_hoja: hojaId, p_ubicaciones: m.filas.map((f) => f.ubicacion_id), p_renglones: null });
    setEnviando(false);
    if (error) {
      setMal(/inv_fiscal_revision_enviar_modulo|schema cache|does not exist|no existe la funci/i.test(error.message)
        ? "Falta correr 2026-10-fiscal-modulo.sql en Supabase."
        : traducirError(error.message));
      return;
    }
    avisar.bien(`${m.modulo}: enviado al fiscal.`);
    await Promise.all([leer(), alCambiar()]);
  }

  return (
    <section className="rv" aria-label="Módulos que te pidieron revisar" role="region">
      <header className="rv-cab">
        <b>{pendientes.length > 0 ? `Revisa ${pendientes.length === 1 ? "este módulo" : `estos ${pendientes.length} módulos`}` : "Revisión enviada"}</b>
        <span>{pendientes.length > 0 ? "Solo ves lo que el fiscal pide confirmar: ve bajando y corrigiendo" : "Falta la aprobación del fiscal"}</span>
      </header>
      {mal && <p className="cl-mal" role="alert">{mal}</p>}
      <ul className="rv-lista">
        {pendientes.map((r) => {
          const mias = misDe(r);
          return (
            <li key={r.modulo} className="rv-ub">
              <h3>{r.modulo}<span className="rv-ronda">Ronda {r.ronda}</span></h3>
              {r.nota && <p className="rv-nota"><b>Nota del fiscal:</b> {r.nota}</p>}
              {mias === null ? <p className="rv-vacio">Cargando lo que anotaste…</p>
                : mias.length === 0 ? <p className="rv-vacio">En este módulo no tienes renglones con diferencia. Si falta algo por anotar, agrégalo; si no, envíalo.</p> : (
                <ul className="rv-mios" aria-label={`Lo que anotaste en ${r.modulo}`}>
                  {mias.map((x) => (
                    <li key={x.id}>
                      <b>{x.sku}</b> {x.material}{[x.estado_envase, x.averia && "AVERÍA", x.pnc && "PNC"].filter(Boolean).length > 0 ? <> · {[x.estado_envase, x.averia && "AVERÍA", x.pnc && "PNC"].filter(Boolean).join(" · ")}</> : null}<br />
                      <span>{textoCant(x)} = <b>{nf.format(Number(x.total_cajas))}</b> cajas
                        {x.venc_dia != null && <> · vence {dd(x.venc_dia)}/{dd(x.venc_mes)}/{dd(x.venc_anio)}</>}
                        {x.nota && <> · {x.nota}</>}</span>
                      <div className="rv-acc">
                        <button type="button" className="btn" disabled={ocupado || enviando} onClick={() => alCorregir(x)}>Corregir</button>
                        <button type="button" className="btn plano" disabled={ocupado || enviando} onClick={() => alQuitar(x)}>Quitar</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="rv-acc">
                <button type="button" className="btn plano" disabled={ocupado || enviando} onClick={() => alAgregar(r)}>Agregar un renglón que falta</button>
                <button type="button" className="btn" disabled={ocupado || enviando} onClick={() => void enviar(r)}>Enviar este módulo</button>
              </div>
              <p className="rv-vacio">Cuando termines de corregir, envíalo. Si no había nada que cambiar, enviarlo es decir «lo que conté está bien».</p>
            </li>
          );
        })}
        {enviadas.map((r) => (
          <li key={r.modulo} className="rv-ub">
            <h3>{r.modulo}<span className="rv-ronda">Ronda {r.ronda}</span></h3>
            <p className="rv-enviada">Ya enviaste este módulo. Falta la aprobación del fiscal.</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
