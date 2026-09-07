import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Modulo } from "@/modulos/registro";

export type DatoPie = { texto: string; enAlerta?: boolean };

/**
 * La imagen va como background-image, no como <Image>: si el archivo no
 * existe se ve el color de fondo del módulo y no se rompe nada. La foto es
 * decorativa, así que no lleva texto alternativo — el nombre del módulo,
 * que está justo al lado, ya dice de qué se trata.
 */
export function TarjetaModulo({
  m,
  dato,
}: {
  m: Modulo;
  dato?: DatoPie;
}) {
  const contenido = (
    <>
      <div
        className="relative h-[120px] sm:h-[82px]"
        style={{ background: m.activo ? m.fondo : "#EDF1F7" }}
      >
        <div
          className="absolute inset-0 bg-cover bg-center opacity-90 transition-opacity group-hover:opacity-100"
          style={{ backgroundImage: `url(${m.imagen})` }}
          aria-hidden
        />
      </div>

      <div className="p-[14px] pb-4">
        <p
          className="text-[11px] font-medium tracking-[0.14em]"
          style={{ color: m.activo ? m.acento : "var(--bv-texto-2)" }}
        >
          {m.eyebrow}
        </p>

        <h2
          className="mt-[7px] text-[24px] font-medium tracking-[-0.02em]"
          style={{ color: "var(--bv-texto)" }}
        >
          {m.nombre}
        </h2>

        <p
          className="mt-2 text-[12px] leading-[1.5]"
          style={{ color: "var(--bv-texto-2)" }}
        >
          {m.descripcion}
        </p>

        <div
          className="mt-[14px] flex items-center justify-between border-t pt-3"
          style={{ borderColor: "var(--bv-linea)" }}
        >
          <span
            className="text-[13px]"
            style={{
              color: !m.activo
                ? "var(--bv-texto-2)"
                : dato?.enAlerta
                  ? "var(--bv-alerta)"
                  : "var(--bv-texto)",
            }}
          >
            {m.activo ? (dato?.texto ?? "") : "Próximamente"}
          </span>
          {m.activo && (
            <span
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full"
              style={{ background: m.acento }}
              aria-hidden
            >
              <ChevronRight size={15} color="#FFFFFF" />
            </span>
          )}
        </div>
      </div>
    </>
  );

  const clases =
    "group block overflow-hidden rounded-[12px] border transition-colors";
  const estilo = {
    background: "var(--bv-panel)",
    borderColor: "var(--bv-linea)",
  };

  if (!m.activo) {
    return (
      <div className={`${clases} opacity-60`} style={estilo} aria-disabled>
        {contenido}
      </div>
    );
  }

  return (
    <Link href={m.ruta} className={`${clases} hover:border-bv-azul hover:shadow-md`} style={estilo}>
      {contenido}
    </Link>
  );
}
