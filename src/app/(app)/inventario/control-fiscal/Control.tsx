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
  conteoDesdeBD, estadoHoja, cruceModulo, filaDesdeBD, ordenarCruce, puedeCruzar,
  type ConteoPersona, type ConteoPersonaBD, type FilaCruce, type FilaCruceBD,
} from "@/modulos/inventario/fiscal-cruce";

/** Una línea de `inv_fiscal_bd_hoja` (solo lo que usa el Excel del cruce). */
type BdLinea = {
  equipo: string; persona: string | null; ubicacion: string; sku: string; material: string;
  cajas_por_estiba: number | null; estibas: number | null; saldo: number | null; cajas: number | null; total_cajas: number | string | null;
  venc_dia: number | null; venc_mes: number | null; venc_anio: number | null; nota: string | null; contado_en: string | null;
};

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
     Los CONTEOS de cada persona bajan de TODAS las hojas, hasta donde hayan llegado
     (contando, sin cruzar o cerradas). El cruce (diferencias) solo sale de las hojas
     donde las dos ya terminaron; nunca se inventa un cruce. */
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
        /* Lo que marcaron de los módulos (mezclado / sin acceso). Si falta el SQL, simplemente no hay pestaña. */
        let marcas: { ubicacion: string; equipo: "OL" | "BAVARIA"; mezclado: boolean; sin_acceso: boolean; foto: boolean }[] | null = null;
        if (id) {
          const mk = await sb.rpc("inv_fiscal_modulos_hoja", { p_hoja: id });
          if (!mk.error) marcas = ((mk.data ?? []) as { ubicacion: string; equipo: "OL" | "BAVARIA"; mezclado: boolean; sin_acceso: boolean; ruta: string | null }[])
            .map((m) => ({ ubicacion: m.ubicacion, equipo: m.equipo, mezclado: m.mezclado, sin_acceso: m.sin_acceso, foto: !!m.ruta }));
        }
        if (av && id && puedeCruzar(av)) {
          const cr = await sb.rpc("inv_fiscal_cruce", { p_hoja: id });
          if (cr.error) throw new Error(cr.error.message);
          filas = ordenarCruce(cruceModulo(((cr.data ?? []) as FilaCruceBD[]).map(filaDesdeBD)));
        }
        /* Lo que anotó cada persona, de TODAS las hojas y hasta donde llegaron: primero la BD completa de la hoja
           (cualquier estado); si a la base le falta esa función, la de conteos por persona (solo hojas cruzables). */
        if (id) {
          const bd = await sb.rpc("inv_fiscal_bd_hoja", { p_hoja: id });
          if (!bd.error) {
            conteos = ((bd.data ?? []) as BdLinea[]).map((l) => conteoDesdeBD({
              equipo: l.equipo, persona: l.persona, ubicacion: l.ubicacion, sku: l.sku, material: l.material,
              cajas_por_estiba: l.cajas_por_estiba, estibas: l.estibas, saldo: l.saldo, cajas: l.cajas, total_cajas: l.total_cajas,
              venc_dia: l.venc_dia, venc_mes: l.venc_mes, venc_anio: l.venc_anio, nota: l.nota, contado_en: l.contado_en,
            }));
          } else if (av && puedeCruzar(av)) {
            const co = await sb.rpc("inv_fiscal_conteos", { p_hoja: id });
            if (co.error) {
              if (/inv_fiscal_conteos|schema cache|does not exist|no existe la funci/i.test(co.error.message)) sinConteos = true;
              else throw new Error(co.error.message);
            } else conteos = ((co.data ?? []) as ConteoPersonaBD[]).map(conteoDesdeBD);
          } else if (/inv_fiscal_bd_hoja|schema cache|does not exist|no existe la funci/i.test(bd.error.message)) sinConteos = true;
          else throw new Error(bd.error.message);
        }
        return {
          numero: h.numero,
          ol: h.ol ? nombre.get(h.ol) ?? null : null,
          bavaria: h.bavaria ? nombre.get(h.bavaria) ?? null : null,
          estado: av ? estadoHoja(av) : ("sin-empezar" as const),
          olRenglones: av?.olRenglones ?? 0,
          bavariaRenglones: av?.bavariaRenglones ?? 0,
          olTermino: av?.olTermino ?? null, bavariaTermino: av?.bavariaTermino ?? null,
          filas, conteos, marcas,
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
      const renglones = hojas.reduce((t, h) => t + (h.conteos?.length ?? 0), 0);
      const conAlgo = hojas.filter((h) => (h.conteos?.length ?? 0) > 0).length;
      setAviso(sinConteos
        ? "Excel listo, pero SIN lo que contó cada persona: falta correr 2026-10-fiscal-TODO.sql en Supabase."
        : `Excel listo: ${renglones} renglones contados de ${conAlgo} de ${hojas.length} hojas, hasta donde llegó cada persona` +
          (n > 0 ? `; el cruce de diferencias sale de las ${n} hojas donde las dos ya terminaron.` : "; todavía ninguna hoja tiene a las dos personas terminadas, por eso aún no hay cruce de diferencias."));
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
