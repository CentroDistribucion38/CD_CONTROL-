"use client";

/**
 * EDITAR EL CASO COMPLETO — del superadministrador, dentro del panel del caso.
 *
 * «Que yo pueda editar y cambiar hasta el código: cambiar el SKU si soy super admin.»
 *
 * Además de rotas y contaminadas, cambia el MATERIAL (SKU), la CAUSA, el PROCESO y el ÁREA. Nada se edita a
 * escondidas: el motivo es obligatorio y la base guarda lo de antes junto a lo nuevo
 * (`rotura_editar`, 2026-11-roturas-editar-caso.sql). El cobro se recalcula solo con los precios del material.
 *
 * Quien lo usa le pone una `key` con los datos vigentes del caso para que, al cambiar de caso o al guardar,
 * el formulario arranque con lo que está guardado.
 */
import { useMemo, useState } from "react";
import type { Area, Causa, Material, Proceso, Rotura } from "@/modulos/roturas/datos";
import { cobroDe } from "./Corregir";

export type Catalogos = { materiales: Material[]; causas: Causa[]; procesos: Proceso[]; areas: Area[] };
export type Cambios = { material: string; causa: string; proceso: string; area: string | null; rotas: number; contaminadas: number; motivo: string };

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function Editar({ r, cat, decidida, guardando, guardar }: {
  r: Rotura; cat: Catalogos; decidida: boolean; guardando: boolean;
  guardar: (c: Cambios) => void;
}) {
  const [material, setMaterial] = useState(r.material);
  const [causa, setCausa] = useState(r.causa);
  const [proceso, setProceso] = useState(r.proceso);
  const [area, setArea] = useState(r.area ?? "");
  const [rotas, setRotas] = useState(String(r.unidades));
  const [contam, setContam] = useState(String(r.contaminadas ?? 0));
  const [motivo, setMotivo] = useState("");

  const porClave = useMemo(() => new Map(cat.materiales.map((m) => [m.clave, m])), [cat.materiales]);
  const mat = porClave.get(material.trim());
  const otroMat = material.trim() !== r.material;
  const eer = (mat?.tipo ?? r.tipo) === "eer";

  const entero = (s: string) => (s.trim() === "" ? 0 : /^\d+$/.test(s.trim()) ? Number(s) : NaN);
  const nr = entero(rotas), nc = eer ? 0 : entero(contam);
  const valido = Number.isFinite(nr) && Number.isFinite(nc);
  const igual = !otroMat && causa === r.causa && proceso === r.proceso && (area || null) === (r.area ?? null)
    && valido && nr === r.unidades && nc === (r.contaminadas ?? 0);
  const antes = r.cobro_total != null ? Number(r.cobro_total) : cobroDe(r, r.unidades, r.contaminadas ?? 0);
  const despues = valido && !otroMat ? cobroDe(r, nr, nc) : null;
  const falta = otroMat && !mat ? "Ese SKU no está en el maestro"
    : !valido ? "Pon solo números enteros"
    : nr + nc === 0 ? "No pueden quedar las dos en cero: si no pasó nada, se anula"
    : igual ? "Cambia algo"
    : motivo.trim().length < 4 ? "Escribe por qué se edita"
    : "Guardar cambios";
  const puede = falta === "Guardar cambios" && !guardando;
  const enviar = () => puede && guardar({ material: material.trim(), causa, proceso, area: area || null, rotas: nr, contaminadas: nc, motivo: motivo.trim() });

  const lista = (xs: { clave: string; nombre: string; activo: boolean }[], actual: string) =>
    xs.filter((x) => x.activo || x.clave === actual);

  return (
    <section className="co-form" aria-label={`Editar ${r.codigo}`}>
      <h3>Editar el caso <small>(superadmin · queda el registro de lo de antes)</small></h3>
      {decidida && (
        <p className="co-aviso">Ya tiene decisión o el OL ya contestó: el cambio queda escrito junto a lo anterior y el cobro se recalcula.</p>
      )}

      <label className="co-motivo">
        <span>Material · SKU {otroMat && <em>antes {r.material}</em>}</span>
        <input list={`mat-${r.id}`} value={material} spellCheck={false} autoComplete="off"
               onChange={(e) => setMaterial(e.target.value.toUpperCase())} placeholder="Escribe el SKU o el nombre" />
        <datalist id={`mat-${r.id}`}>
          {cat.materiales.map((m) => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
        </datalist>
        <small className={"co-mat" + (otroMat && !mat ? " mal" : "")}>
          {mat ? `${mat.nombre} · ${mat.tipo === "eer" ? "envase (EER)" : "producto terminado"}` : material.trim() ? "No está en el maestro" : "Escoge el material"}
        </small>
      </label>

      <div className="co-cifras">
        <label><span>Causa</span>
          <select value={causa} onChange={(e) => setCausa(e.target.value)}>
            {lista(cat.causas, r.causa).map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
          </select>
        </label>
        <label><span>Proceso</span>
          <select value={proceso} onChange={(e) => setProceso(e.target.value)}>
            {lista(cat.procesos, r.proceso).map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
          </select>
        </label>
      </div>
      <div className="co-cifras">
        <label><span>Área</span>
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">— sin área —</option>
            {lista(cat.areas, r.area ?? "").map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
          </select>
        </label>
        <label><span>Rotas <em>antes {r.unidades}</em></span>
          <input inputMode="numeric" value={rotas} onChange={(e) => setRotas(e.target.value)} />
        </label>
        {!eer && (
          <label><span>Contam. <em>antes {r.contaminadas ?? 0}</em></span>
            <input inputMode="numeric" value={contam} onChange={(e) => setContam(e.target.value)} />
          </label>
        )}
      </div>

      <p className="co-cobro">
        <b>Cobro</b> {antes != null ? cop.format(antes) : "sin precio o sin factor"}
        {!igual && valido && (otroMat
          ? <> → <b>se recalcula con los precios de {material.trim()}</b></>
          : <> → <b>{despues != null ? cop.format(despues) : "sin precio o sin factor"}</b></>)}
      </p>
      <label className="co-motivo"><span>Por qué se edita</span>
        <textarea rows={2} value={motivo} placeholder="Queda escrito junto a lo que había antes"
                  onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <button type="button" className="btn si co-guardar" disabled={!puede} onClick={enviar}>{guardando ? "Guardando…" : falta}</button>
    </section>
  );
}
