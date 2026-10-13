"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MODULOS, entradaDeRama, moduloPorRuta, ramaDeRuta, type Modulo, type Seccion } from "@/modulos/registro";

/**
 * MIGAS DE PAN QUE SE ABREN: CONTROL › Módulo › Rama › (Grupo) › Pantalla.
 *
 * «Que yo pueda ir seleccionando y me deje ir abriendo.» Cada nivel es un botón: al tocarlo se
 * despliega lo que hay en ese nivel (los módulos, las ramas del módulo, las pantallas de la rama…)
 * y se salta a cualquiera. Solo se ofrece lo que esta persona puede ver: `permitidas` baja del
 * layout ya resuelto, igual que al menú lateral.
 */
type Opcion = { nombre: string; ruta: string; actual: boolean; sub?: boolean; titulo?: boolean };

const enRuta = (pathname: string, ruta: string) => pathname === ruta || pathname.startsWith(ruta + "/");

/** La pantalla en la que se está: la exacta o, si no, la de dirección más larga que la contiene. */
function seccionDe(m: Modulo, pathname: string): Seccion | undefined {
  return m.secciones.find((s) => s.ruta === pathname)
    ?? m.secciones.filter((s) => enRuta(pathname, s.ruta)).sort((a, b) => b.ruta.length - a.ruta.length)[0];
}

export function Ruta({ permitidas = [] }: { permitidas?: string[] }) {
  const pathname = usePathname();
  const deja = useMemo(() => new Set(permitidas), [permitidas]);
  const puede = (r: string) => deja.has(r);
  const [abierto, setAbierto] = useState<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  /* Se cierra al cambiar de pantalla, al tocar afuera y con Escape. */
  useEffect(() => { setAbierto(null) }, [pathname]);
  useEffect(() => {
    if (abierto == null) return;
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(null) };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(null) };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla) };
  }, [abierto]);

  const modulo = moduloPorRuta(pathname);
  const rama = modulo ? ramaDeRuta(modulo, pathname) : undefined;
  const seccion = modulo ? seccionDe(modulo, pathname) : undefined;
  const visiblesDe = (m: Modulo) => m.secciones.filter((s) => !s.oculto && puede(s.ruta));
  const entradaDe = (m: Modulo) => (m.entrada && puede(m.entrada) ? m.entrada : puede(m.ruta) ? m.ruta : visiblesDe(m)[0]?.ruta ?? m.ruta);

  /* Las pantallas de una lista, con sus grupos (Pasivos: Base, Informe, Maestro) un nivel adentro. */
  const conGrupos = (ss: Seccion[]): Opcion[] => {
    const out: Opcion[] = [];
    const vistos = new Set<string>();
    for (const s of ss) {
      if (!s.grupo) { out.push({ nombre: s.nombre, ruta: s.ruta, actual: s.ruta === seccion?.ruta }); continue }
      if (vistos.has(s.grupo)) continue;
      vistos.add(s.grupo);
      out.push({ nombre: s.grupo, ruta: s.ruta, actual: false, titulo: true });
      for (const g of ss.filter((x) => x.grupo === s.grupo)) out.push({ nombre: g.nombre, ruta: g.ruta, actual: g.ruta === seccion?.ruta, sub: true });
    }
    return out;
  };

  type Nivel = { texto: string; clase: string; opciones: Opcion[] };
  const niveles: Nivel[] = [];

  /* 1 · CONTROL: los módulos. */
  niveles.push({
    texto: "CONTROL", clase: "wm",
    opciones: [{ nombre: "Inicio", ruta: "/inicio", actual: pathname === "/inicio" },
      ...MODULOS.filter((m) => m.activo && !m.oculto && (puede(m.ruta) || visiblesDe(m).length > 0))
        .map((m) => ({ nombre: m.nombre, ruta: entradaDe(m), actual: m.id === modulo?.id }))],
  });

  if (modulo) {
    const visibles = visiblesDe(modulo);
    /* 2 · EL MÓDULO: sus ramas (o sus pantallas, si no tiene ramas). */
    const ramas = (modulo.ramas ?? []).filter((r) => visibles.some((s) => s.rama === r.id));
    niveles.push({
      texto: modulo.nombre, clase: "modulo",
      opciones: ramas.length
        ? ramas.map((r) => ({ nombre: r.nombre, ruta: entradaDeRama(modulo, r, puede), actual: r.id === rama?.id }))
        : conGrupos(visibles),
    });
    /* 3 · LA RAMA: sus pantallas, con los grupos adentro. */
    if (rama) niveles.push({ texto: rama.nombre, clase: "rama", opciones: conGrupos(visibles.filter((s) => s.rama === rama.id)) });
    /* 4 · EL GRUPO (Pasivos): sus pantallas. */
    if (seccion?.grupo) {
      const delGrupo = visibles.filter((s) => s.grupo === seccion.grupo && s.rama === seccion.rama);
      niveles.push({ texto: seccion.grupo, clase: "rama", opciones: delGrupo.map((s) => ({ nombre: s.nombre, ruta: s.ruta, actual: s.ruta === seccion.ruta })) });
    }
  }
  /* 5 · LA PANTALLA (si no repite el nombre del nivel anterior: «Balance › Balance»). */
  const hoja = seccion && seccion.nombre !== niveles[niveles.length - 1]?.texto ? seccion.nombre : null;

  const flecha = (
    <svg className="sep" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" aria-hidden="true">
      <path d="M10 6l6 6-6 6" />
    </svg>
  );

  return (
    <>
    {/* EN EL CELULAR, LAS MIGAS DE SIEMPRE (Módulo › Pantalla), sin menús: «solo para PC y tablet; en el
        celular no, porque se enreda». La de abajo se ve en PC y tablet; cuál se muestra lo decide el CSS. */}
    <div className="ruta ruta-cel">
      {modulo && <span className="modulo">{modulo.nombre}</span>}
      {seccion && <>{flecha}<span className="hoja">{seccion.nombre}</span></>}
    </div>
    <div className="ruta ruta-pc" ref={caja}>
      {niveles.map((nv, i) => (
        <span key={i} className="ruta-nivel">
          {i > 0 && flecha}
          <span className="ruta-caja">
            <button type="button" className={`ruta-bt ${nv.clase}`} aria-haspopup="menu" aria-expanded={abierto === i}
                    disabled={nv.opciones.length === 0} onClick={() => setAbierto(abierto === i ? null : i)}>
              {nv.texto}
              {nv.opciones.length > 0 && (
                <svg className="ruta-v" viewBox="0 0 24 24" fill="none" strokeWidth="2.4" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
              )}
            </button>
            {abierto === i && (
              <div className="ruta-menu" role="menu">
                {nv.opciones.map((o) => o.titulo
                  ? <span key={`t-${o.nombre}`} className="ruta-op titulo">{o.nombre}</span>
                  : (
                    <Link key={o.ruta + o.nombre} href={o.ruta} role="menuitem" className={"ruta-op" + (o.actual ? " actual" : "") + (o.sub ? " sub" : "")}
                          aria-current={o.actual ? "page" : undefined} onClick={() => setAbierto(null)}>
                      {o.nombre}
                    </Link>
                  ))}
              </div>
            )}
          </span>
        </span>
      ))}
      {hoja && <>{flecha}<span className="hoja">{hoja}</span></>}
    </div>
    </>
  );
}
