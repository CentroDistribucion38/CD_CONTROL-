"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { moduloPorRuta, modulosVisibles } from "@/modulos/registro";

/**
 * Riel lateral de módulos. Colapsado en 64px, se abre al pasar el mouse o
 * se ancla desde el botón de abajo. Solo aparece dentro de un módulo: en la
 * portada estorba, porque la portada YA es el selector de módulos.
 *
 * Con el riel cerrado cada ícono muestra su nombre en un globo al pasar el
 * mouse: un ícono suelto no le dice nada a quien entra por primera vez.
 */

const P = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

const IconoQuiebra = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M10 2.5h4v3.2l2.1 2.6A3 3 0 0 1 16.8 10v9.5a2 2 0 0 1-2 2h-5.6a2 2 0 0 1-2-2V10a3 3 0 0 1 .7-1.7L10 5.7z" />
    <path d="M12.4 10.6l-1.9 3h3l-1.8 3.2" />
  </svg>
);
const IconoInventario = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M12 2.8l8.2 4.1v10.2L12 21.2 3.8 17.1V6.9z" />
    <path d="M3.8 6.9L12 11l8.2-4.1M12 11v10.2" />
  </svg>
);
const IconoTablero = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M8 16v-3.5M12 16V9M16 16v-5" />
  </svg>
);
const IconoImportar = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M12 14.5V3.5M8.5 7L12 3.5 15.5 7" />
    <path d="M4 14v4.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V14" />
  </svg>
);
const IconoLista = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);
const IconoCaja = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M3.5 7.5l8.5-4 8.5 4v9l-8.5 4-8.5-4z" />
    <path d="M3.5 7.5L12 11.5l8.5-4" />
  </svg>
);
const IconoBodega = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M3 10l9-6 9 6v10H3z" />
    <path d="M8 20v-6h8v6" />
  </svg>
);
const IconoMovimientos = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
);
const IconoConteos = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M9 9h6M9 13h6M9 17h3" />
  </svg>
);

const IconoDia = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M9 14.5h6" />
  </svg>
);

const IconoSider = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M2.5 7.5h11v9h-11z" />
    <path d="M13.5 10.5h4l3 3v3h-7z" />
    <circle cx="6.5" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </svg>
);
const IconoUbicacion = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);
const IconoRuta = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M6 20V9a3 3 0 0 1 3-3h6a3 3 0 0 0 3-3" />
    <circle cx="6" cy="20" r="1.8" />
    <circle cx="18" cy="4" r="1.8" />
  </svg>
);
const IconoLlave = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <circle cx="8" cy="8" r="4" />
    <path d="M11 11l8 8M16 16l-2 2M19 19l-2 2" />
  </svg>
);

const ICONO_MODULO: Record<string, () => React.ReactElement> = {
  quiebra: IconoQuiebra,
  sider: IconoSider,
  inventario: IconoInventario,
};
const ICONO_RUTA: Record<string, () => React.ReactElement> = {
  "/sider": IconoLista,
  "/sider/certificar": IconoUbicacion,
  "/sider/transito": IconoRuta,
  "/sider/maestro": IconoLlave,
  "/quiebra": IconoTablero,
  "/quiebra/diario": IconoDia,
  "/quiebra/importar": IconoImportar,
  "/inventario": IconoLista,
  "/inventario/productos": IconoCaja,
  "/inventario/bodegas": IconoBodega,
  "/inventario/movimientos": IconoMovimientos,
  "/inventario/conteos": IconoConteos,
};

export function Navegacion({ rol, permitidas, anclado, alternar }: {
  rol: string;
  /** Las rutas que esta persona puede ver. Vienen del layout ya resueltas. */
  permitidas: string[];
  anclado: boolean;
  alternar: () => void;
}) {
  const pathname = usePathname();
  const actual = moduloPorRuta(pathname);
  const deja = useMemo(() => new Set(permitidas), [permitidas]);
  if (!actual) return null;

  /* Solo lo que el rol puede ver. Un enlace a una pantalla cerrada no es
     una pista de que existe: es una puerta que no abre, y quien la toca
     cree que la app está rota. */
  const visibles = modulosVisibles(rol).filter(
    (m) => deja.has(m.ruta) || m.secciones.some((s) => deja.has(s.ruta))
  );
  const secciones = actual.secciones.filter((s) => deja.has(s.ruta));
  const IconoActual = ICONO_MODULO[actual.id] ?? IconoLista;

  return (
    <nav className="sh-lado" aria-label="Navegación de módulos">
      <div className="riel">
        <Link href="/inicio" className="volver">
          <svg viewBox="0 0 24 24" {...P}>
            <path d="M4 6h6M4 12h6M4 18h6M14 12h6M17 9l3 3-3 3" />
          </svg>
          <span className="texto">Todos los módulos</span>
          <span className="globo">Todos los módulos</span>
        </Link>

        <div className="grupo texto">MÓDULOS</div>

        <Link href={actual.ruta} className="modulo on">
          <IconoActual />
          <span className="texto">{actual.nombre}</span>
          <span className="globo">{actual.nombre}</span>
        </Link>

        {secciones.map((s) => {
          const Icono = ICONO_RUTA[s.ruta] ?? IconoTablero;
          const aqui = pathname === s.ruta;
          return (
            <Link
              key={s.ruta}
              href={s.ruta}
              className={"hijo" + (aqui ? " on" : "")}
              aria-current={aqui ? "page" : undefined}
            >
              <Icono />
              <span className="texto">{s.nombre}</span>
              <span className="globo">{s.nombre}</span>
            </Link>
          );
        })}

        {visibles
          .filter((m) => m.activo && m.id !== actual.id)
          .map((m) => {
            const Icono = ICONO_MODULO[m.id] ?? IconoLista;
            return (
              <Link key={m.id} href={m.ruta} className="modulo">
                <Icono />
                <span className="texto">{m.nombre}</span>
                <span className="globo">{m.nombre}</span>
              </Link>
            );
          })}

        <div className="pie-riel">
          <div className="vertical">CD38 · AG01</div>
          <div className="sello">
            <div className="tajo" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/logo-b.png" alt="" />
            <div className="texto letras">
              <b>CD38</b>
              <span>Ag01 · Barranquilla</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="anclar"
          onClick={alternar}
          aria-pressed={anclado}
          title={anclado ? "Soltar el menú" : "Dejar el menú abierto"}
        >
          <svg viewBox="0 0 24 24" {...P}>
            <path d="M14 6l6 6-6 6M20 12H8M4 5v14" />
          </svg>
          <span className="texto">{anclado ? "Soltar menú" : "Anclar menú"}</span>
        </button>
      </div>
    </nav>
  );
}
