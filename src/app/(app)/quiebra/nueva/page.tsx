import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormQuiebra } from "@/components/FormQuiebra";

export const dynamic = "force-dynamic";

export default async function NuevaQuiebraPage() {
  const supabase = await createClient();

  const [{ data: productos }, { data: bodegas }, { data: causas }] =
    await Promise.all([
      supabase
        .from("productos")
        .select("id, sku, nombre, unidad")
        .eq("activo", true)
        .order("sku"),
      supabase
        .from("bodegas")
        .select("id, codigo, nombre")
        .eq("activo", true)
        .order("codigo"),
      supabase
        .from("causas_quiebra")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre"),
    ]);

  const faltaCatalogo = !productos?.length || !bodegas?.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="/quiebra" className="text-xs text-bv-texto-2 hover:text-white">
          ← Quiebra
        </Link>
        <h1 className="mt-1 text-[24px] font-medium tracking-[-0.02em]">
          Reportar avería
        </h1>
        <p className="text-[13px] text-bv-texto-2">
          El producto no sale del inventario hasta que un supervisor apruebe.
        </p>
      </header>

      {faltaCatalogo ? (
        <div className="tarjeta">
          <p className="text-sm">
            Todavía no hay {!productos?.length ? "productos" : "bodegas"}{" "}
            cargados. Sin catálogo no se puede reportar una avería.
          </p>
          <p className="mt-3 text-[13px] text-bv-texto-2">
            Cárgalos en{" "}
            <Link
              href={!productos?.length ? "/inventario/productos" : "/inventario/bodegas"}
              className="underline hover:text-white"
            >
              Inventario →{" "}
              {!productos?.length ? "Productos" : "Bodegas"}
            </Link>
            .
          </p>
        </div>
      ) : (
        <FormQuiebra
          productos={(productos ?? []).map((p) => ({
            id: p.id,
            etiqueta: `${p.sku} · ${p.nombre} (${p.unidad})`,
          }))}
          bodegas={(bodegas ?? []).map((b) => ({
            id: b.id,
            etiqueta: `${b.codigo} · ${b.nombre}`,
          }))}
          causas={(causas ?? []).map((c) => ({ id: c.id, etiqueta: c.nombre }))}
        />
      )}
    </div>
  );
}
