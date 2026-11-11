"use client";

/** La gráfica del pareto dentro del cierre: el mismo dibujo que sale en la foto (`pintarGrafica`), ajustado al ancho de la ventana. */
import { useEffect, useRef } from "react";
import type { ParetoFila } from "@/modulos/sider/cierre-ai";
import { pintarGrafica } from "@/modulos/sider/foto-pareto";

const W = 1212, H = 405;

export function ParetoLienzo({ pareto }: { pareto: ParetoFila[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    pintarGrafica(ctx, 0, 0, W, H, pareto);
  }, [pareto]);
  const resumen = pareto.map((d) => `${d.nombre}: ${d.unidades} unidades, ${Math.round(d.acumulado * 100)} % acumulado`).join("; ");
  return <canvas ref={ref} className="ca-pareto" role="img" aria-label={`Pareto de defectos. ${resumen}`} />;
}
