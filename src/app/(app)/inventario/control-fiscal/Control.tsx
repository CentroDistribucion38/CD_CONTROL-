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
  ubicacion_id?: string | null; estado_envase?: string | null; averia?: boolean | null; pnc?: boolean | null;
};

/** El cruce de una hoja que todavía no se cierra, armado con lo contado HASTA AHORA (mismo criterio que `inv_fiscal_cruce`). */
function cruceParcial(l: BdLinea[]): FilaCruce[] {
  const m = new Map<string, FilaCruceBD>();
  for (const r of l) {
    const k = [r.ubicacion, r.sku, r.venc_dia ?? 0, r.venc_mes ?? 0, r.venc_anio ?? 0, r.estado_envase ?? "", r.averia ? 1 : 0, r.pnc ? 1 : 0].join("|");
    let f = m.get(k);
    if (!f) {
      f = { ubicacion_id: r.ubicacion_id ?? null, ubicacion: r.ubicacion, sku: r.sku, material: r.material, venc_dia: r.venc_dia, venc_mes: r.venc_mes, venc_anio: r.venc_anio,
            cajas_ol: null, cajas_bavaria: null, diferencia: 0, estado: "DIFIERE", estado_envase: r.estado_envase ?? null, averia: !!r.averia, pnc: !!r.pnc };
      m.set(k, f);
    }
    const t = Number(r.total_cajas) || 0;
    if (r.equipo === "BAVARIA") f.cajas_bavaria = (Number(f.cajas_bavaria) || 0) + t; else f.cajas_ol = (Number(f.cajas_ol) || 0) + t;
  }
  return ordenarCruce(cruceModulo([...m.values()].map((f) => filaDesdeBD({ ...f, diferencia: (Number(f.cajas_ol) || 0) - (Number(f.cajas_bavaria) || 0) }))));
}

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
     (contando, sin cruzar o cerradas). Las hojas donde las dos ya terminaron salen con su
     cruce completo; las demás salen con un cruce PARCIAL (lo contado hasta ahora), marcado
     como tal en el Resumen, para poder comparar OL contra Bavaria en las 5 hojas. */
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
        let parcial = false;
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
            /* Hoja que todavía no se puede cruzar: se compara con lo contado hasta ahora, marcado como PARCIAL. */
            if (!filas && ((bd.data ?? []) as BdLinea[]).length > 0) { filas = cruceParcial((bd.data ?? []) as BdLinea[]); parcial = true }
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
          filas, parcial, conteos, marcas,
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
      const n = hojas.filter((h) => h.filas && !h.parcial).length;
      const renglones = hojas.reduce((t, h) => t + (h.conteos?.length ?? 0), 0);
      const conAlgo = hojas.filter((h) => (h.conteos?.length ?? 0) > 0).length;
      setAviso(sinConteos
        ? "Excel listo, pero SIN lo que contó cada persona: falta correr 2026-10-fiscal-TODO.sql en Supabase."
        : `Excel listo: ${renglones} renglones contados de ${conAlgo} de ${hojas.length} hojas, hasta donde llegó cada persona` +
          (`; ${n} ${n === 1 ? "hoja cruzada completa" : "hojas cruzadas completas"}` + (conAlgo > n ? ` y ${conAlgo - n} con cruce PARCIAL (lo contado hasta ahora, marcado en el Resumen).` : ".")));
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
