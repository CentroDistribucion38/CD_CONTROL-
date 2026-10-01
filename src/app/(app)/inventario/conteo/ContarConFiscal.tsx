"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Material, Ubicacion } from "@/modulos/inventario/fefo";
import type { HojaParaContar } from "@/modulos/inventario/fiscal";
import { fechaConDia } from "@/modulos/inventario/fiscal";
import { ContarFiscal } from "./ContarFiscal";

/* ===================================================================
   «QUÉ VAS A CONTAR»: EL FEFO DIARIO O LA HOJA DEL FISCAL

   Solo sale para quien tiene una hoja asignada de un inventario fiscal que ya se
   mostró en Contar. Quien no la tiene ve Contar tal cual, sin selector.

   AL ENTRAR, EL DÍA DE LA HOJA, SALE UN AVISO: «tienes un inventario fiscal asignado», con
   dos salidas —continuar con el fiscal o hacer el conteo diario—. Solo en la fecha asignada
   (antes no hay nada que contar) y una vez por pestaña del navegador: si recarga, no vuelve
   a preguntar; el selector de arriba sigue ahí para cambiar cuando quiera.

   El día del inventario abre en el fiscal —es lo que toca hoy—; los demás días, en
   el FEFO. Las dos pantallas siguen montadas y solo se esconde la que no se usa:
   así lo que se tecleó (o el borrador y la cola del FEFO) no se pierde al cambiar.
   =================================================================== */
export function ContarConFiscal({
  hojas, bodegaId, materiales, ubicaciones, children,
}: {
  hojas: HojaParaContar[];
  bodegaId: string;
  materiales: Material[];
  ubicaciones: Ubicacion[];
  /** El conteo FEFO de siempre (o el aviso de solo lectura). */
  children: ReactNode;
}) {
  const hayHoy = hojas.some((h) => h.puedeContar);
  const [modo, setModo] = useState<"fefo" | "fiscal">(hayHoy ? "fiscal" : "fefo");
  const [aviso, setAviso] = useState(false);
  const continuar = useRef<HTMLButtonElement>(null);
  const llaveAviso = "fiscal.aviso." + hojas.filter((h) => h.puedeContar).map((h) => h.hojaId).join(",");
  /* Una vez por pestaña. Sin sessionStorage (modo privado) pregunta cada vez, que es lo seguro. */
  useEffect(() => {
    if (!hayHoy) return;
    let visto = false;
    try { visto = sessionStorage.getItem(llaveAviso) === "1" } catch { /* sin almacenamiento */ }
    if (!visto) setAviso(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llaveAviso]);
  useEffect(() => {
    if (!aviso) return;
    continuar.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cierraAviso() };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso]);
  function cierraAviso() {
    setAviso(false);
    try { sessionStorage.setItem(llaveAviso, "1") } catch { /* ver arriba */ }
  }
  if (hojas.length === 0) return <>{children}</>;

  const unaSola = hojas.length === 1 ? hojas[0] : null;
  const deHoy = hojas.filter((h) => h.puedeContar);
  return (
    <>
      {aviso && (
        <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="fc-aviso-t"
             onClick={(e) => { if (e.target === e.currentTarget) cierraAviso() }}>
          <div className="cf-caja fc-aviso">
            <p className="fc-aviso-ojo">INVENTARIO FISCAL · ASIGNADO PARA HOY</p>
            <h2 id="fc-aviso-t">Tienes un inventario fiscal asignado</h2>
            <ul className="fc-aviso-lista">
              {deHoy.map((h) => (
                <li key={h.hojaId}>
                  <b>{h.nombre}</b>
                  <span>Hoja {h.numero}{h.equipo && <>{h.equipo === "Bavaria" ? " · cuentas por " : " · cuentas por el "}<b>{h.equipo}</b></>}</span>
                  <span>{h.pareja ? <>Tu pareja: <b>{h.pareja}</b>{h.parejaEquipo && <> ({h.parejaEquipo})</>}</> : "Todavía sin pareja en esta hoja"}</span>
                  <span>{fechaConDia(h.fecha)} · <b>HOY</b></span>
                </li>
              ))}
            </ul>
            <p className="fc-aviso-pie">Continúa y haces el conteo del fiscal aquí mismo. Si hoy toca el conteo diario, escógelo; después puedes cambiar con el selector de arriba.</p>
            <div className="cf-botones fc-aviso-botones">
              <button type="button" className="cf-btn plano" onClick={() => { setModo("fefo"); cierraAviso() }}>Conteo diario (FEFO)</button>
              <button type="button" className="cf-btn" ref={continuar} onClick={() => { setModo("fiscal"); cierraAviso() }}>Continuar con el fiscal</button>
            </div>
          </div>
        </div>
      )}
      <div className="fc-modo" role="tablist" aria-label="Qué vas a contar">
        <button type="button" role="tab" aria-selected={modo === "fefo"} className={modo === "fefo" ? "on" : ""}
                onClick={() => setModo("fefo")}>
          <b>FEFO diario</b><span>el recorrido de siempre</span>
        </button>
        <button type="button" role="tab" aria-selected={modo === "fiscal"} className={modo === "fiscal" ? "on" : ""}
                onClick={() => setModo("fiscal")}>
          <b>Fiscal{unaSola ? ` · Hoja ${unaSola.numero}` : ""}</b>
          <span>{hayHoy ? "se cuenta hoy" : "próximamente"}</span>
        </button>
      </div>
      <div hidden={modo !== "fefo"}>{children}</div>
      <div hidden={modo !== "fiscal"}>
        <ContarFiscal hojas={hojas} bodegaId={bodegaId} materiales={materiales} ubicaciones={ubicaciones} />
      </div>
    </>
  );
}
