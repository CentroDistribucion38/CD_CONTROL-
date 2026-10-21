"use client";

/**
 * CORREGIR LAS CIFRAS DE UNA ROTURA — del administrador, dentro del panel del caso.
 *
 * Sumar registra las rotas y las contaminadas, y a veces el dato viene mal. Se revisa cada
 * caso mirando la foto y se cambian las dos cantidades ANTES de cobrar. No se edita a
 * escondidas: el motivo es obligatorio y la base guarda lo que había antes
 * (`roturas_correcciones`). El cobro se recalcula solo; aquí se ve cómo cambia antes de guardar.
 *
 * Quien lo usa le pone `key={id + cifras}` para que, al cambiar de caso o al guardar, el
 * formulario arranque con las cifras vigentes.
 */
import { useState } from "react";
import type { Rotura } from "@/modulos/roturas/datos";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** El cobro de unas cantidades con los precios por caja de la rotura (null si falta un precio). */
export function cobroDe(r: Rotura, rotas: number, contam: number): number | null {
  const pe = r.precio_caja_envase, pp = r.precio_caja_producto;
  if (pe == null) return null;
  if (contam > 0 && pp == null) return null;
  return rotas * Number(pe) + (contam > 0 ? contam * (Number(pe) + Number(pp)) : 0);
}

export function Corregir({ r, decidida, guardando, guardar }: {
  r: Rotura;
  /** Ya se decidió o el OL ya contestó: lo que se cambia lo pudo haber leído alguien. */
  decidida: boolean;
  guardando: boolean;
  guardar: (rotas: number, contaminadas: number, motivo: string) => void;
}) {
  const esEER = r.tipo === "eer";
  const [rotas, setRotas] = useState(String(r.unidades));
  const [contam, setContam] = useState(String(r.contaminadas ?? 0));
  const [motivo, setMotivo] = useState("");

  /* UNA CASILLA VACÍA CUENTA COMO 0: no hay que llenar las dos, basta con la que cambia. */
  const entero = (s: string) => (s.trim() === "" ? 0 : /^\d+$/.test(s.trim()) ? Number(s) : NaN);
  const nr = entero(rotas), nc = esEER ? 0 : entero(contam);
  const valido = Number.isFinite(nr) && Number.isFinite(nc);
  const igual = valido && nr === r.unidades && nc === (r.contaminadas ?? 0);
  const vacia = valido && nr + nc === 0;
  const antes = r.cobro_total != null ? Number(r.cobro_total) : cobroDe(r, r.unidades, r.contaminadas ?? 0);
  const despues = valido ? cobroDe(r, nr, nc) : null;
  const falta = !valido ? "Pon solo números enteros"
    : vacia ? "No pueden quedar las dos en cero: si no pasó nada, se anula"
    : igual ? "Cambia alguna cifra"
    : motivo.trim().length < 4 ? "Escribe por qué se corrige"
    : "Guardar corrección";
  const puede = valido && !vacia && !igual && motivo.trim().length >= 4 && !guardando;
  const manda = (e: React.KeyboardEvent) => { if (e.key === "Enter" && puede) { e.preventDefault(); guardar(nr, nc, motivo.trim()) } };

  return (
    <section className="co-form" aria-label={`Corregir las cifras de ${r.codigo}`}>
      <h3>Corregir cantidades <small>(en cajas)</small></h3>
      {decidida && (
        <p className="co-aviso">Ya tiene decisión o el OL ya contestó: el cambio queda escrito junto a la cifra anterior y el cobro se recalcula.</p>
      )}
      <div className="co-cifras">
        <label><span>Rotas <em>antes {r.unidades}</em></span>
          <input inputMode="numeric" value={rotas} onChange={(e) => setRotas(e.target.value)} onKeyDown={manda} />
        </label>
        {!esEER && (
          <label><span>Contaminadas <em>antes {r.contaminadas ?? 0}</em></span>
            <input inputMode="numeric" value={contam} onChange={(e) => setContam(e.target.value)} onKeyDown={manda} />
          </label>
        )}
      </div>
      <p className="co-cobro">
        <b>Cobro</b> {antes != null ? cop.format(antes) : "sin precio o sin factor"}
        {!igual && valido && !vacia && <> → <b>{despues != null ? cop.format(despues) : "sin precio o sin factor"}</b></>}
      </p>
      <label className="co-motivo"><span>Por qué se corrige</span>
        <textarea rows={2} value={motivo} placeholder="Queda escrito junto a la cifra anterior"
                  onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <button type="button" className="btn si co-guardar" disabled={!puede}
              onClick={() => guardar(nr, nc, motivo.trim())}>{guardando ? "Guardando…" : falta}</button>
    </section>
  );
}
