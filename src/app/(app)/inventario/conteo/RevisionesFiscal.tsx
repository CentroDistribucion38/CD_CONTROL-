"use client";

/* ===================================================================
   «REVISA ESTA UBICACIÓN» — LO QUE VE CADA PERSONA CUANDO EL FISCAL MANDA A VALIDAR

   El fiscal ve diferencias en el cruce y manda a validar unas ubicaciones. A las DOS
   personas de la hoja les sale aquí, por cada ubicación, lo que ellas mismas anotaron
   (nunca lo de su pareja: el conteo sigue a ciegas) y dos caminos:

     · «Está bien»: lo que conté es correcto. No cambia nada, solo avisa que ya revisó.
     · «Contar de nuevo»: se abre lo que anotó en ese módulo; lo corrige, agrega o quita
       renglones (o dice «aquí no hay nada») y lo envía. Lo enviado REEMPLAZA lo anterior
       de ese módulo; todo o nada.

   La revisión es por CALLE Y MÓDULO (A01): nunca se muestra el lado, porque delataría dónde
   está cada cosa. Solo al contar de nuevo la persona dice en qué lado puso cada renglón
   (así queda guardado), pero esa pregunta no sale en la lista.

   Sigue funcionando aunque la persona ya haya terminado su hoja: la base deja tocar solo
   las ubicaciones que el fiscal mandó a validar. Cuando las dos responden, el fiscal ve el
   cruce otra vez y aprueba (o la manda a otra ronda).
   =================================================================== */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { Material } from "@/modulos/inventario/fefo";
import { argumentosFiscal, revisarFiscal, totalCajas, VACIO_FISCAL, type BorradorFiscal, type RenglonFiscal } from "@/modulos/inventario/fiscal-contar";

type RevisionMia = {
  fiscal_id: string; hoja_id: string; hoja: number; ubicacion_id: string; ubicacion: string;
  ronda: number; nota: string | null; pedido_en: string | null; ya_envie: boolean;
};
type Reng = BorradorFiscal & { k: number; ub: string };
/** Un módulo (A01) = sus dos lados juntos. */
type Modulo = { modulo: string; filas: RevisionMia[]; ronda: number; nota: string | null; yaEnvie: boolean };
const moduloDe = (clave: string) => clave.replace(/_(IZQ|DER)$/i, "");
const ladoDe = (clave: string) => (/_IZQ$/i.test(clave) ? "Izquierdo" : /_DER$/i.test(clave) ? "Derecho" : "");

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const dd = (n: number | null) => (n == null ? "··" : String(n).padStart(2, "0"));
const dos = (v: string) => v.replace(/\D/g, "").slice(0, 2);

/** Cantidad contada → texto de la casilla. */
const aTexto = (n: number | null) => (n == null ? "" : String(n));
function desdeRenglon(r: RenglonFiscal, k: number): Reng {
  return {
    ...VACIO_FISCAL, k, ub: r.ubicacion_id,
    base: "x", lado: "x", codigo: r.sku,
    dia: r.venc_dia == null ? "" : dd(r.venc_dia), mes: r.venc_mes == null ? "" : dd(r.venc_mes), anio: r.venc_anio == null ? "" : dd(r.venc_anio),
    modo: r.cajas != null ? "cajas" : "estibas",
    estibas: aTexto(r.estibas), saldo: aTexto(r.saldo), cajas: aTexto(r.cajas), nota: r.nota ?? "",
  };
}

export function RevisionesFiscal({ hojaId, mios, materiales, alCambiar, avisar }: {
  hojaId: string;
  /** Lo que esta persona lleva anotado en su hoja (todas las ubicaciones). */
  mios: RenglonFiscal[] | null;
  materiales: Material[];
  /** Después de enviar: la hoja vuelve a leer lo suyo. */
  alCambiar: () => Promise<void>;
  avisar: { bien: (m: string) => void; mal: (m: string) => void };
}) {
  const supabase = useMemo(() => createClient(), []);
  const [revs, setRevs] = useState<RevisionMia[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [rengs, setRengs] = useState<Reng[]>([]);
  const [mal, setMal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const leer = useCallback(async () => {
    const { data, error } = await supabase.rpc("inv_fiscal_mis_revisiones");
    /* Si a la base le falta 2026-10-fiscal-validar.sql, la persona no ve nada y cuenta como siempre. */
    if (error) { setRevs([]); return }
    setRevs(((data ?? []) as RevisionMia[]).filter((r) => r.hoja_id === hojaId));
  }, [supabase, hojaId]);

  useEffect(() => {
    void leer();
    const t = setInterval(() => { if (!document.hidden && editando === null) void leer() }, 20_000);
    return () => clearInterval(t);
  }, [leer, editando]);

  const modulos = useMemo<Modulo[]>(() => {
    const m = new Map<string, Modulo>();
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
  if (revs.length === 0) return null;

  const matDe = (sku: string) => materiales.find((m) => m.activo && m.sku === sku.trim()) ?? null;
  const misDe = (m: Modulo) => (mios ?? []).filter((r) => m.filas.some((f) => f.ubicacion_id === r.ubicacion_id));
  const textoCant = (r: RenglonFiscal) => {
    if (r.cajas != null) return `${nf.format(r.cajas)} caja${r.cajas === 1 ? "" : "s"}`;
    const e = r.estibas ?? 0, s = r.saldo ?? 0;
    return [e > 0 || s === 0 ? `${nf.format(e)} estiba${e === 1 ? "" : "s"}` : "", s > 0 ? `${nf.format(s)} caja${s === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
  };

  async function enviar(m: Modulo, renglones: object[] | null) {
    setOcupado(true); setMal(null);
    const { error } = await supabase.rpc("inv_fiscal_revision_enviar_modulo", { p_hoja: hojaId, p_ubicaciones: m.filas.map((f) => f.ubicacion_id), p_renglones: renglones });
    setOcupado(false);
    if (error) {
      setMal(/inv_fiscal_revision_enviar_modulo|schema cache|does not exist|no existe la funci/i.test(error.message)
        ? "Falta correr 2026-10-fiscal-modulo.sql en Supabase."
        : traducirError(error.message));
      return false;
    }
    avisar.bien(renglones === null ? `${m.modulo}: enviaste que está bien.` : `${m.modulo}: enviaste tu nuevo conteo.`);
    setEditando(null);
    await Promise.all([leer(), alCambiar()]);
    return true;
  }

  function abrirEditor(m: Modulo) {
    setMal(null);
    setRengs(misDe(m).map((x, i) => desdeRenglon(x, i)));
    setEditando(m.modulo);
  }
  const ponRen = (k: number, cambio: Partial<BorradorFiscal>) => setRengs((l) => l.map((x) => (x.k === k ? { ...x, ...cambio } : x)));

  function enviarNuevo(m: Modulo) {
    const claves = new Set<string>();
    const salida: object[] = [];
    for (const x of rengs) {
      const mat = matDe(x.codigo);
      const falla = revisarFiscal(x, mat, "x");
      if (falla || !mat) { setMal(`${x.codigo.trim() || "Un renglón"}: ${falla ?? "falta el código del material."}`); return }
      const ub = m.filas.length === 1 ? m.filas[0].ubicacion_id : x.ub;
      if (!ub) { setMal(`${mat.sku}: dime en qué lado del módulo ${m.modulo} lo pusiste.`); return }
      const a = argumentosFiscal(hojaId, ub, mat, x);
      const clave = `${ub}|${mat.id}|${a.p_dia ?? ""}|${a.p_mes ?? ""}|${a.p_anio ?? ""}`;
      if (claves.has(clave)) { setMal(`${mat.sku} está dos veces con el mismo vencimiento y lado: junta las cantidades en un solo renglón.`); return }
      claves.add(clave);
      salida.push({ ubicacion_id: ub, producto_id: a.p_producto, estibas: a.p_estibas, saldo: a.p_saldo, cajas: a.p_cajas, dia: a.p_dia, mes: a.p_mes, anio: a.p_anio, nota: a.p_nota });
    }
    void enviar(m, salida);
  }

  return (
    <section className="rv" aria-label="Módulos que te pidieron revisar" role="region">
      <header className="rv-cab">
        <b>{pendientes.length > 0 ? `Revisa ${pendientes.length === 1 ? "este módulo" : `estos ${pendientes.length} módulos`}` : "Revisión enviada"}</b>
        <span>{pendientes.length > 0 ? "El fiscal te pide confirmar tu conteo" : "Falta la aprobación del fiscal"}</span>
      </header>
      <ul className="rv-lista">
        {pendientes.map((r) => {
          const mias = misDe(r);
          const abierto = editando === r.modulo;
          return (
            <li key={r.modulo} className="rv-ub">
              <h3>{r.modulo}<span className="rv-ronda">Ronda {r.ronda}</span></h3>
              {r.nota && <p className="rv-nota"><b>Nota del fiscal:</b> {r.nota}</p>}
              {!abierto && (
                <>
                  {mias.length === 0 ? <p className="rv-vacio">En este módulo anotaste que no hay nada (o no anotaste nada).</p> : (
                    <ul className="rv-mios" aria-label={`Lo que anotaste en ${r.modulo}`}>
                      {mias.map((x) => (
                        <li key={x.id}><b>{x.sku}</b> {x.material}<br /><span>{textoCant(x)} = <b>{nf.format(Number(x.total_cajas))}</b> cajas
                          {x.venc_dia != null && <> · vence {dd(x.venc_dia)}/{dd(x.venc_mes)}/{dd(x.venc_anio)}</>}</span></li>
                      ))}
                    </ul>
                  )}
                  <div className="rv-acc">
                    <button type="button" className="btn" disabled={ocupado} onClick={() => enviar(r, null)}>Está bien, lo que conté es correcto</button>
                    <button type="button" className="btn plano" disabled={ocupado} onClick={() => abrirEditor(r)}>Contar de nuevo</button>
                  </div>
                </>
              )}
              {abierto && (
                <div className="rv-ed">
                  <p>Cuenta otra vez este módulo. Lo que envíes <b>reemplaza</b> lo que habías anotado aquí. Si no hay nada, quita todos los renglones y envía.</p>
                  {mal && <p className="cl-mal" role="alert">{mal}</p>}
                  {rengs.map((x) => {
                    const mat = matDe(x.codigo);
                    const env = mat?.tipo_material === "ENVASE";
                    const cuenta = totalCajas(x, mat);
                    return (
                      <div key={x.k} className="rv-ren">
                        <label className="rv-w"><span>Código</span>
                          <input inputMode="numeric" value={x.codigo} placeholder="Teclea el código" onChange={(e) => ponRen(x.k, { codigo: e.target.value })} /></label>
                        <p className={"rv-desc" + (x.codigo && !mat ? " mal" : "")}>
                          {!x.codigo ? "Teclea el código y te digo qué es." : mat ? `✓ ${mat.nombre}${mat.cajas_por_estiba != null ? ` · ${mat.cajas_por_estiba} cajas/estiba` : ""}` : "Ese código no está en el maestro."}
                        </p>
                        {r.filas.length > 1 && (
                          <label className="rv-w"><span>Lado donde lo pusiste</span>
                            <select value={x.ub} onChange={(e) => ponRen(x.k, { ub: e.target.value } as Partial<BorradorFiscal>)}>
                              <option value="">Escoge el lado…</option>
                              {r.filas.map((f) => <option key={f.ubicacion_id} value={f.ubicacion_id}>{ladoDe(f.ubicacion) || f.ubicacion}</option>)}
                            </select>
                          </label>
                        )}
                        <div className="rv-w">
                          <span className="fe-etiq-fecha">Vence{env ? " (sin fecha)" : ""}</span>
                          <div className="rv-fecha">
                            <input inputMode="numeric" maxLength={2} placeholder="DD" aria-label="Día" value={x.dia} onChange={(e) => ponRen(x.k, { dia: dos(e.target.value) })} />
                            <input inputMode="numeric" maxLength={2} placeholder="MM" aria-label="Mes" value={x.mes} onChange={(e) => ponRen(x.k, { mes: dos(e.target.value) })} />
                            <input inputMode="numeric" maxLength={2} placeholder="AA" aria-label="Año" value={x.anio} onChange={(e) => ponRen(x.k, { anio: dos(e.target.value) })} />
                          </div>
                        </div>
                        <div className="rv-modo rv-w" role="group" aria-label="Qué cuentas">
                          <button type="button" className={x.modo === "estibas" ? "on" : ""} aria-pressed={x.modo === "estibas"} onClick={() => ponRen(x.k, { modo: "estibas" })}>Estibas</button>
                          <button type="button" className={x.modo === "cajas" ? "on" : ""} aria-pressed={x.modo === "cajas"} onClick={() => ponRen(x.k, { modo: "cajas" })}>Cajas</button>
                        </div>
                        {x.modo === "estibas" ? (
                          <>
                            <label><span>Estibas completas</span><input inputMode="numeric" value={x.estibas} onChange={(e) => ponRen(x.k, { estibas: e.target.value })} /></label>
                            <label><span>Saldo · cajas</span><input inputMode="numeric" value={x.saldo} onChange={(e) => ponRen(x.k, { saldo: e.target.value })} /></label>
                          </>
                        ) : (
                          <label className="rv-w"><span>Cajas</span><input inputMode="numeric" value={x.cajas} onChange={(e) => ponRen(x.k, { cajas: e.target.value })} /></label>
                        )}
                        <p className="rv-desc rv-w">{cuenta?.total != null ? <>Total: <b>{nf.format(cuenta.total)}</b> cajas</> : "Total: —"}</p>
                        <label className="rv-w"><span>Observación</span><input value={x.nota} placeholder="Opcional" onChange={(e) => ponRen(x.k, { nota: e.target.value })} /></label>
                        <button type="button" className="btn plano rv-w" disabled={ocupado} onClick={() => setRengs((l) => l.filter((y) => y.k !== x.k))}>Quitar este renglón</button>
                      </div>
                    );
                  })}
                  <div className="rv-acc">
                    <button type="button" className="btn plano" disabled={ocupado}
                            onClick={() => setRengs((l) => [...l, { ...VACIO_FISCAL, base: "x", lado: "x", ub: r.filas.length === 1 ? r.filas[0].ubicacion_id : "", k: Math.max(-1, ...l.map((y) => y.k)) + 1 }])}>
                      Agregar un renglón
                    </button>
                  </div>
                  <div className="rv-acc">
                    <button type="button" className="btn" disabled={ocupado} onClick={() => enviarNuevo(r)}>
                      {rengs.length === 0 ? "Enviar: aquí no hay nada" : "Enviar mi nuevo conteo"}
                    </button>
                    <button type="button" className="btn plano" disabled={ocupado} onClick={() => { setEditando(null); setMal(null) }}>Cancelar</button>
                  </div>
                </div>
              )}
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
