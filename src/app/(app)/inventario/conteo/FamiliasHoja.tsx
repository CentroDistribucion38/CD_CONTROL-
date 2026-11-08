"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Material } from "@/modulos/inventario/fefo";
import { mismaFamilia } from "@/modulos/inventario/fiscal";

/* ===================================================================
   CONTAR · FISCAL · «MIS FAMILIAS»

   «Un ícono pequeño que no estorbe y que abra un toolbox con las familias que
    me tocó y sus códigos: SKU, descripción y factor de estibado.»

   Quien armó el plan le asignó a esta hoja una o dos familias (Lata, Tw, Ret,
   Pet, Barril). Aquí se ven solo esas, una pestaña por familia, con el factor de
   estibado de cada material: las CAJAS que lleva una estiba, que es lo que
   multiplica al contar.

   ES DE CONSULTA. No limita lo que se puede anotar: si alguien encuentra otro
   material en su calle, lo anota igual. Si la hoja no tiene familias (o la base
   todavía no sabe de ellas) el ícono no aparece.
   =================================================================== */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Codigo = { sku: string; descripcion: string; familia: string; tipo: "PT" | "EER"; cajas_por_estiba: number | null };

export function FamiliasHoja({ hojaId, numero, materiales }: { hojaId: string; numero: number; materiales: Material[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [familias, setFamilias] = useState<string[]>([]);
  /* Los códigos de las familias de la hoja, de los dos maestros (producto y envase EER). Llegan con 2026-11-fiscal-familias-envase.sql. */
  const [codigos, setCodigos] = useState<Codigo[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState("");
  const boton = useRef<HTMLButtonElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);

  /* Las familias de ESTA hoja. Cambia la hoja → se vuelve a preguntar. */
  useEffect(() => {
    let vivo = true;
    setFamilias([]); setCodigos(null); setAbierto(false); setTab(0); setQ("");
    void (async () => {
      const { data, error } = await supabase.rpc("inv_fiscal_hoja_familias", { p_hoja: hojaId });
      if (vivo) setFamilias(!error && Array.isArray(data) ? (data as string[]) : []);
      const c = await supabase.rpc("inv_fiscal_hoja_codigos", { p_hoja: hojaId });
      if (vivo) setCodigos(!c.error && Array.isArray(c.data) ? (c.data as Codigo[]) : null);
    })();
    return () => { vivo = false };
  }, [hojaId, supabase]);

  /* Cada familia con sus códigos. Si la base todavía no trae los envases, se arma con los productos del maestro como antes. */
  const lista = useMemo(() => familias.map((f) => ({
    nombre: f,
    filas: (codigos
      ? codigos.filter((c) => mismaFamilia(c.familia, f)).map((c) => ({ id: `${c.tipo}-${c.sku}`, sku: c.sku, nombre: c.descripcion, cajas_por_estiba: c.cajas_por_estiba, eer: c.tipo === "EER" }))
      : materiales.filter((m) => m.activo && m.tipo_material === "PRODUCTO" && mismaFamilia(m.familia, f))
          .map((m) => ({ id: m.id, sku: m.sku, nombre: m.nombre, cajas_por_estiba: m.cajas_por_estiba, eer: false }))
    ).sort((a, b) => a.sku.localeCompare(b.sku, "es", { numeric: true })),
  })), [familias, materiales, codigos]);

  /* Escape cierra; el fondo no se desplaza mientras está abierto; el foco vuelve al ícono. */
  useEffect(() => {
    if (!abierto) return;
    const atras = boton.current;
    cerrar.current?.focus();
    const sobre = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) };
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = sobre; atras?.focus() };
  }, [abierto]);

  if (familias.length === 0) return null;
  const actual = lista[Math.min(tab, lista.length - 1)];
  const buscado = sinTilde(q.trim());
  const filas = buscado ? actual.filas.filter((m) => m.sku.includes(buscado) || sinTilde(m.nombre).includes(buscado)) : actual.filas;
  const total = lista.reduce((n, f) => n + f.filas.length, 0);

  return (
    <>
      <button ref={boton} type="button" className="fam-ico" onClick={() => setAbierto(true)}
              aria-label={`Mis familias: ${familias.join(" y ")}`} title={`Mis familias: ${familias.join(" y ")}`}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="M4 5h3M10 5h10M4 12h3M10 12h10M4 19h3M10 19h10" />
        </svg>
        <em>{familias.length}</em>
      </button>

      {abierto && (
        <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="fam-titulo"
             onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
          <div className="fam-caja">
            <header className="fam-cab">
              <div>
                <h2 id="fam-titulo">Mis familias · Hoja {numero}</h2>
                <p>{familias.join(" y ")} · {nf.format(total)} código{total === 1 ? "" : "s"}</p>
              </div>
              <button ref={cerrar} type="button" className="fam-x" onClick={() => setAbierto(false)} aria-label="Cerrar">×</button>
            </header>

            {lista.length > 1 && (
              <div className="fam-tabs" role="tablist">
                {lista.map((f, i) => (
                  <button key={f.nombre} type="button" role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""}
                          onClick={() => { setTab(i); setQ("") }}>
                    {f.nombre}<em>{nf.format(f.filas.length)}</em>
                  </button>
                ))}
              </div>
            )}

            <input className="fam-busca" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Buscar código o nombre…" aria-label="Buscar en la familia" />

            <div className="fam-tabla">
              <table>
                <thead><tr><th>Código</th><th>Descripción</th><th className="n" title="Cajas que lleva una estiba">Cajas por estiba</th></tr></thead>
                <tbody>
                  {filas.length === 0 && <tr><td colSpan={3} className="fam-vacio">{buscado ? "Ningún material con esa búsqueda." : "Esta familia no tiene materiales."}</td></tr>}
                  {filas.map((m) => (
                    <tr key={m.id}>
                      <td className="cod">{m.sku}</td>
                      <td>{m.nombre}</td>
                      <td className="n">{m.cajas_por_estiba ? nf.format(m.cajas_por_estiba) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fam-pie">Solo de consulta: puedes anotar cualquier material.</p>
          </div>
        </div>
      )}
    </>
  );
}
