"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Analisis as Datos } from "@/modulos/inventario/analisis-dif";
import { guardarEmpaque } from "./actions";

/**
 * CÓMO VA EMPACADO CADA PRODUCTO. Hay productos que van en cartón y no en caja plástica; el análisis solo puede
 * saberlo si alguien lo define. Aquí se define producto por producto y queda guardado: «Va en cartón» no suma caja
 * plástica; «Caja plástica» suma la que se escoja; lo que no se defina sigue la regla de siempre (maestro / presentación).
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);

type Caja = { codigo: string; nombre: string };

function Selector({ sku, valor, sugerida, cajas, auto, puedeEditar, onError }: {
  sku: string; valor: string; sugerida?: string | null; cajas: Caja[]; auto?: string; puedeEditar: boolean; onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const cambiar = (v: string) => {
    if (v === valor) return;
    onError(null);
    start(async () => {
      const r = v === "sin" ? await guardarEmpaque(sku, "sin", null)
        : v === "carton" ? await guardarEmpaque(sku, "carton", null)
        : await guardarEmpaque(sku, "plastica", v.slice(2));
      if (r && "error" in r && r.error) { onError(r.error); return }
      router.refresh();
    });
  };
  const sug = sugerida ? cajas.find((c) => c.codigo === sugerida) : null;
  return (
    <select className="ad-emp-sel" value={valor} disabled={!puedeEditar || pend} onChange={(e) => cambiar(e.target.value)} aria-label={`Empaque del producto ${sku}`}>
      <option value="sin">{auto ? `Automática · ${auto}` : "Sin definir"}</option>
      <option value="carton">Va en cartón</option>
      {sug && <optgroup label="Sugerida por la presentación"><option value={`p:${sug.codigo}`}>Caja plástica · {sug.nombre}</option></optgroup>}
      <optgroup label="Caja plástica">
        {cajas.filter((c) => c.codigo !== sug?.codigo).map((c) => <option key={c.codigo} value={`p:${c.codigo}`}>{c.codigo} · {c.nombre}</option>)}
        {valor.startsWith("p:") && !cajas.some((c) => `p:${c.codigo}` === valor) && <option value={valor}>{valor.slice(2)}</option>}
      </optgroup>
    </select>
  );
}

export function Empaque({ datos, puedeEditar }: { datos: Datos; puedeEditar: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const sin = datos.sinCaja ?? [], cart = datos.cartones ?? [], con = datos.conCaja ?? [], cajas = datos.cajasLista ?? [];
  if (!sin.length && !cart.length && !con.length) return null;
  const q = filtro.trim().toLowerCase();
  const conF = q ? con.filter((x) => x.codigo.includes(q) || x.nombre.toLowerCase().includes(q)) : con;
  return (
    <div className="ad-emp">
      {error && <p className="ad-emp-err" role="alert">{error}</p>}

      {sin.length > 0 && (
        <details className="ad-sincaja">
          <summary><b>{sin.length} {sin.length === 1 ? "producto contado no suma" : "productos contados no suman"} caja plástica</b> · {n(sin.reduce((t, x) => t + x.cajas, 0))} cajas · define cómo van empacados</summary>
          <table className="ad-t"><thead><tr><th>Código</th><th>Producto</th><th className="n">Cajas</th><th>Por qué no suma</th><th>Cómo va empacado</th></tr></thead>
            <tbody>{sin.map((x) => (
              <tr key={x.codigo}><td className="mono">{x.codigo}</td><td>{x.nombre}</td><td className="n">{n(x.cajas)}</td><td>{x.motivo}</td>
                <td><Selector sku={x.codigo} valor="sin" sugerida={x.sugerida} cajas={cajas} puedeEditar={puedeEditar} onError={setError} /></td></tr>
            ))}</tbody></table>
        </details>
      )}

      {cart.length > 0 && (
        <details className="ad-cartones">
          <summary><b>{cart.length} {cart.length === 1 ? "producto va" : "productos van"} en cartón</b> · {n(cart.reduce((t, x) => t + x.cajas, 0))} cajas · no suman caja plástica</summary>
          <table className="ad-t"><thead><tr><th>Código</th><th>Producto</th><th className="n">Cajas</th><th>Cómo va empacado</th></tr></thead>
            <tbody>{cart.map((x) => (
              <tr key={x.codigo}><td className="mono">{x.codigo}</td><td>{x.nombre}</td><td className="n">{n(x.cajas)}</td>
                <td><Selector sku={x.codigo} valor="carton" cajas={cajas} puedeEditar={puedeEditar} onError={setError} /></td></tr>
            ))}</tbody></table>
        </details>
      )}

      {con.length > 0 && (
        <details className="ad-concaja">
          <summary><b>{con.length} productos sí suman caja plástica</b> · {n(con.reduce((t, x) => t + x.cajas, 0))} cajas · si alguno va en cartón, márcalo</summary>
          <input className="ad-emp-filtro" type="search" placeholder="Buscar producto o código" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <table className="ad-t"><thead><tr><th>Código</th><th>Producto</th><th className="n">Cajas</th><th>Caja que suma</th><th>Cómo va empacado</th></tr></thead>
            <tbody>{conF.map((x) => (
              <tr key={x.codigo}><td className="mono">{x.codigo}</td><td>{x.nombre}</td><td className="n">{n(x.cajas)}</td><td>{x.caja} · {x.cajaNombre}</td>
                <td><Selector sku={x.codigo} valor={x.definido ? `p:${x.caja}` : "sin"} auto={x.definido ? undefined : x.cajaNombre} cajas={cajas} puedeEditar={puedeEditar} onError={setError} /></td></tr>
            ))}</tbody></table>
        </details>
      )}
    </div>
  );
}
