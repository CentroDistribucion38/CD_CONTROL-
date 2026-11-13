"use client";

import { useRouter } from "next/navigation";
import { Selector } from "@/components/Selector";
import type { Ciclico } from "@/modulos/inventario/producto-dif";

/** EL INVENTARIO CÍCLICO QUE SE ANALIZA: lista desplegable (no texto libre), el más reciente primero. */
export function SelectorCiclico({ lista, actual, paso }: { lista: Ciclico[]; actual: string | null; paso: string }) {
  const router = useRouter();
  const dd = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
  return (
    <div className="ad-dia"><span>Inventario cíclico</span>
      <Selector valor={actual ?? ""} ariaLabel="Inventario cíclico" vacio="Escoge el cíclico…" style={{ minWidth: 300 }}
        opciones={lista.map((c) => ({ valor: c.id, codigo: dd(c.fecha), etiqueta: `${c.nombre}${c.familias.length ? ` · ${c.familias.join(", ")}` : ""}` }))}
        onCambiar={(v) => router.push(`/inventario/producto/analisis?c=${v}${paso !== "analisis" ? `&paso=${paso}` : ""}`)} />
    </div>
  );
}
