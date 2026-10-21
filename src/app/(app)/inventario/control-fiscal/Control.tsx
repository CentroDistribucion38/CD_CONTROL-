"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { diaColombia } from "@/modulos/inventario/corte";
import { leerPaleta } from "../informe";
import { Ico, VistaFiscal } from "../fiscal/PanelFiscal";
import type { FiscalBD, Persona } from "../fiscal/Fiscal";
import { agrupar, fechaConDia, textoCuando } from "@/modulos/inventario/fiscal";
import {
  conteoDesdeBD, estadoHoja, filaDesdeBD, ordenarCruce, puedeCruzar,
  type ConteoPersona, type ConteoPersonaBD, type FilaCruce, type FilaCruceBD,
} from "@/modulos/inventario/fiscal-cruce";

/* ===================================================================
   CONTROL FISCAL — VER Y EJECUTAR EL CONTROL DEL INVENTARIO FISCAL

   Lo que se arma en el Plan fiscal (fecha, hojas, parejas) se controla aquí:
   la torre en vivo (una tarjeta por pareja), la revisión del cruce y las
   diferencias, y el Excel del cruce de todas las hojas.
   Aquí no se arma ni se edita nada: eso es del Plan.
   =================================================================== */
export function Control({ personas, fiscales, conCruce, ahora, puedeEditar }: {
  personas: Persona[]; fiscales: FiscalBD[]; conCruce: boolean; ahora: string; puedeEditar: boolean;
}) {
  const hoy = diaColombia(ahora);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [armando, setArmando] = useState<string | null>(null);
  const nombre = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);
  const { proximos, anteriores } = useMemo(() => agrupar(fiscales, hoy), [fiscales, hoy]);
  const todos = useMemo(() => [...proximos, ...anteriores], [proximos, anteriores]);
  const [selId, setSelId] = useState<string | null>(null);
  const sel = todos.find((f) => f.id === selId) ?? todos[0] ?? null;

  /* EL EXCEL DEL CRUCE, EN UNO SOLO: el cruce de TODAS las hojas del inventario
     en un archivo (resumen por pareja, diferencias, por material y detalle).
     Las hojas que todavía no se pueden cruzar salen en el resumen con lo que
     les falta; nunca se inventa un cruce. */
  async function excelDelCruce(f: FiscalBD) {
    setMal(null); setAviso(null); setArmando(f.id);
    try {
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      const quien = (u.user && nombre.get(u.user.id)) || "";
      let sinConteos = false;
      const hojas = await Promise.all(f.hojas.map(async (h) => {
        const av = f.avance?.[h.numero];
        const id = f.hojaIds?.[h.numero];
        let filas: FilaCruce[] | null = null;
        let conteos: ConteoPersona[] | null = null;
        if (av && id && puedeCruzar(av)) {
          const [cr, co] = await Promise.all([sb.rpc("inv_fiscal_cruce", { p_hoja: id }), sb.rpc("inv_fiscal_conteos", { p_hoja: id })]);
          if (cr.error) throw new Error(cr.error.message);
          filas = ordenarCruce(((cr.data ?? []) as FilaCruceBD[]).map(filaDesdeBD));
          /* Lo que anotó cada persona viene de 2026-10-fiscal-conteos-por-persona.sql: si a la base le falta, el cruce sale igual y el libro lo avisa. */
          if (co.error) {
            if (/inv_fiscal_conteos|schema cache|does not exist|no existe la funci/i.test(co.error.message)) sinConteos = true;
            else throw new Error(co.error.message);
          } else conteos = ((co.data ?? []) as ConteoPersonaBD[]).map(conteoDesdeBD);
        }
        return {
          numero: h.numero,
          ol: h.ol ? nombre.get(h.ol) ?? null : null,
          bavaria: h.bavaria ? nombre.get(h.bavaria) ?? null : null,
          estado: av ? estadoHoja(av) : ("sin-empezar" as const),
          olRenglones: av?.olRenglones ?? 0,
          bavariaRenglones: av?.bavariaRenglones ?? 0,
          olTermino: av?.olTermino ?? null, bavariaTermino: av?.bavariaTermino ?? null,
          filas, conteos,
        };
      }));
      const P = leerPaleta(document.querySelector(".fe"));
      const hx = (c: number[]) => c.map((v) => v.toString(16).padStart(2, "0")).join("");
      const [{ armarCruceFiscal }, logo] = await Promise.all([
        import("@/modulos/inventario/libro-cruce-fiscal"),
        fetch("/marca/logo-b.png").then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
      ]);
      const buf = await armarCruceFiscal({
        nombre: f.nombre, fecha: f.fecha, quien, hojas, sinConteos, sello: logo,
        colores: { tinta: hx(P.tinta), banda: hx(P.cinta[1]?.[1] ?? P.acento) },
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `cruce-fiscal-${f.fecha}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      const n = hojas.filter((h) => h.filas).length;
      setAviso(`Excel del cruce listo: ${n} de ${hojas.length} hojas cruzadas en un solo archivo` +
        (n === 0 ? "." : sinConteos ? ", pero SIN lo que contó cada persona: falta correr 2026-10-fiscal-conteos-por-persona.sql en Supabase." : ", con lo que contó cada persona."));
    } catch (e) {
      setMal(e instanceof Error && e.message ? traducirError(e.message) : "No se pudo armar el Excel del cruce.");
    } finally { setArmando(null) }
  }


  const vista = (f: FiscalBD) => {
    const conAvance = conCruce && !!f.avance && !!f.publicado;
    const acciones = (
      <>
        {conAvance && (
          <button type="button" className="btn plano fi-excel" disabled={armando !== null} onClick={() => excelDelCruce(f)}
                  title="Un solo Excel con el cruce de todas las hojas: resumen por pareja, diferencias, por material y detalle">
            <Ico n="bajar" tam={16} /> {armando === f.id ? "Armando el Excel…" : "Excel del cruce"}
          </button>
        )}
        <Link href="/inventario/fiscal" className="btn plano"><Ico n="lapiz" tam={16} /> Ir al Plan fiscal</Link>
      </>
    );
    return (
      <VistaFiscal key={f.id} fiscalId={f.id} nombre={f.nombre} fechaTexto={fechaConDia(f.fecha)} cuando={textoCuando(hoy, f.fecha)}
                   abierto={f.estado === "abierto"} visible={!!f.publicado} hojas={f.hojas} avanceInicial={f.avance ?? {}}
                   conAvance={conAvance} puedeEditar={puedeEditar} quien={(id) => nombre.get(id) ?? "—"} acciones={acciones} />
    );
  };

  return (
    <>
      {aviso && <p className="cl-ok" role="status">{aviso}</p>}
      {mal && <p className="cl-mal" role="alert">{mal}</p>}
      {fiscales.length === 0 && (
        <p className="fe-vacio">Todavía no hay ningún inventario fiscal. Se arma en el <Link href="/inventario/fiscal">Plan fiscal</Link>.</p>
      )}
      {todos.length > 1 && (
        <div className="vf-sel" role="group" aria-label="Inventarios fiscales">
          {todos.map((f) => (
            <button type="button" key={f.id} className="vf-sel-b" aria-pressed={sel?.id === f.id} onClick={() => setSelId(f.id)}>
              {f.nombre}<small>{fechaConDia(f.fecha)} · {textoCuando(hoy, f.fecha)}</small>
            </button>
          ))}
        </div>
      )}
      {sel && vista(sel)}
      {!conCruce && (
        <details className="fi-avisos">
          <summary>Avisos (1)</summary>
          <p className="cl-nota" role="note">
            Para ver el avance de cada hoja y <b>cruzar a las dos personas</b> falta correr <code>supabase/migraciones/2026-10-fiscal-cruce.sql</code> en Supabase.
          </p>
        </details>
      )}
    </>
  );
}
