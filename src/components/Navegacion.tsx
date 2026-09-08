"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldCheck, Boxes, BarChart3, Upload, Package, Warehouse,
  ArrowLeftRight, ClipboardList, LayoutGrid, ChevronLeft,
} from "lucide-react";
import { moduloPorRuta, modulosVisibles } from "@/modulos/registro";

/**
 * Riel lateral de íconos. Solo aparece cuando estás dentro de un módulo: en
 * la portada estorba, porque la portada YA es el selector de módulos.
 *
 * Está colapsado a 64px y se abre al pasar el mouse. En bodega se trabaja
 * en pantallas chicas y llenas de tabla: el menú no puede comerse el ancho
 * todo el tiempo. En celular y tableta se convierte en una fila de pestañas.
 */

/** Los íconos viven aquí y no en el registro: el registro es solo datos. */
const ICONO_MODULO: Record<string, typeof ShieldCheck> = {
  quiebra: ShieldCheck,
  inventario: Boxes,
};

const ICONO_RUTA: Record<string, typeof ShieldCheck> = {
  "/quiebra": BarChart3,
  "/quiebra/importar": Upload,
  "/inventario": LayoutGrid,
  "/inventario/productos": Package,
  "/inventario/bodegas": Warehouse,
  "/inventario/movimientos": ArrowLeftRight,
  "/inventario/conteos": ClipboardList,
};

export function Navegacion({ rol }: { nombre?: string; rol: string }) {
  const pathname = usePathname();
  const actual = moduloPorRuta(pathname);
  if (!actual) return null;

  const visibles = modulosVisibles(rol);
  const IconoActual = ICONO_MODULO[actual.id] ?? LayoutGrid;

  return (
    <nav className="sh-lado" aria-label="Navegación de módulos">
      <div className="riel">
        <Link href="/inicio" className="volver">
          <ChevronLeft />
          <span className="texto">Todos los módulos</span>
        </Link>

        <div className="grupo texto">MÓDULOS</div>

        {/* módulo en el que estás, con sus pantallas debajo */}
        <Link href={actual.ruta} className="item modulo on">
          <IconoActual />
          <span className="texto">{actual.nombre}</span>
        </Link>

        {actual.secciones.map((s) => {
          const Icono = ICONO_RUTA[s.ruta] ?? BarChart3;
          return (
            <Link
              key={s.ruta}
              href={s.ruta}
              className={"item hijo" + (pathname === s.ruta ? " on" : "")}
              aria-current={pathname === s.ruta ? "page" : undefined}
            >
              <Icono />
              <span className="texto">{s.nombre}</span>
            </Link>
          );
        })}

        {/* los demás módulos, para saltar sin volver a la portada */}
        {visibles
          .filter((m) => m.activo && m.id !== actual.id)
          .map((m) => {
            const Icono = ICONO_MODULO[m.id] ?? LayoutGrid;
            return (
              <Link key={m.id} href={m.ruta} className="item modulo">
                <Icono />
                <span className="texto">{m.nombre}</span>
              </Link>
            );
          })}
      </div>
    </nav>
  );
}
