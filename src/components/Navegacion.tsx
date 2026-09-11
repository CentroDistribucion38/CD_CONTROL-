"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { moduloPorRuta, ramaDeRuta } from "@/modulos/registro";

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

const IconoAcciones = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M12 3.2l8 3.4v5.1c0 4.4-3.3 7.6-8 9.1-4.7-1.5-8-4.7-8-9.1V6.6z" />
    <path d="M8.8 12.2l2.3 2.3 4.1-4.6" />
  </svg>
);
const IconoMias = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20.5c.6-3.5 3.5-5.5 7-5.5s6.4 2 7 5.5" />
  </svg>
);
const IconoVerificar = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M4 6.5h10M4 12h10M4 17.5h6" />
    <path d="M15.5 18l2 2 4-4.5" />
  </svg>
);
const IconoAnalisis = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M4 17.5l5-5.5 3.5 3L20 6.5" />
    <path d="M20 11V6.5h-4.5" />
  </svg>
);

const IconoRoturas = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M9 2.8h6l-.6 4.3 1.8 2.4a3 3 0 0 1 .6 1.8v8.9a1.8 1.8 0 0 1-1.8 1.8H8a1.8 1.8 0 0 1-1.8-1.8v-8.9a3 3 0 0 1 .6-1.8l1.8-2.4z" />
    <path d="M8.4 14.2l2.4 1.6-1.1 2.1" />
  </svg>
);
const IconoTolva = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M3.4 5h17.2l-5.1 8v5.4a1 1 0 0 1-.6.9l-3.4 1.5a1 1 0 0 1-1.4-.9V13z" />
  </svg>
);
const IconoSello = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <circle cx="12" cy="9" r="5" />
    <path d="M9 13.6L8 21.2l4-2 4 2-1-7.6" />
  </svg>
);

/* La rama en la que uno está: una bifurcación. Dice "aquí el módulo se
   parte en dos" sin necesidad de una palabra. */
const IconoRama = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M6 21V9a3 3 0 0 1 3-3h9M18 6l-3-3M18 6l-3 3" />
    <circle cx="6" cy="21" r="1.6" />
  </svg>
);

const ICONO_MODULO: Record<string, () => React.ReactElement> = {
  roturas: IconoRoturas,
  quiebra: IconoQuiebra,
  sider: IconoSider,
  inventario: IconoInventario,
  acciones: IconoAcciones,
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
  "/acciones": IconoLista,
  "/acciones/mias": IconoMias,
  "/acciones/verificar": IconoVerificar,
  "/acciones/tablero": IconoTablero,
  "/acciones/analisis": IconoAnalisis,
  "/acciones/maestro": IconoLlave,
  "/roturas/en-sitio": IconoRoturas,
  "/roturas/en-sitio/visto-bueno": IconoSello,
  "/roturas/en-sitio/analisis": IconoAnalisis,
  "/roturas/en-sitio/maestro": IconoLlave,
  "/roturas/salida": IconoTolva,
  "/roturas/salida/verificacion": IconoVerificar,
  "/roturas/salida/validacion": IconoSello,
  "/roturas/salida/analisis": IconoAnalisis,
  "/roturas/salida/tolvas": IconoCaja,
};

export function Navegacion({ permitidas, anclado, alternar }: {
  /** Las rutas que esta persona puede ver. Vienen del layout ya resueltas. */
  permitidas: string[];
  anclado: boolean;
  alternar: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const actual = moduloPorRuta(pathname);
  const deja = useMemo(() => new Set(permitidas), [permitidas]);

  /* ADELANTAR LA PANTALLA ANTES DE QUE LA TOQUEN.
     Al pasar el mouse por encima —o al APOYAR el dedo, que en celular
     pasa un buen rato antes de que el toque termine— se le pide a Next
     que vaya trayendo esa sección. Cuando el toque se completa, muchas
     veces ya llegó y el cambio es instantáneo.

     Se adelanta al pasar por encima y no todas de una: todas serían seis
     consultas a Supabase cada vez que alguien abre el menú, para cinco
     pantallas que no va a mirar. Y una sola vez por sección: el mouse
     entra y sale diez veces mientras uno decide. */
  const pedidas = useRef(new Set<string>());
  const adelantar = (ruta: string) => {
    if (pedidas.current.has(ruta)) return;
    pedidas.current.add(ruta);
    router.prefetch(ruta);
  };

  if (!actual) return null;

  /* Solo lo que el rol puede ver. Un enlace a una pantalla cerrada no es
     una pista de que existe: es una puerta que no abre, y quien la toca
     cree que la app está rota. */
  const visibles = actual.secciones.filter((s) => !s.oculto && deja.has(s.ruta));
  const IconoActual = ICONO_MODULO[actual.id] ?? IconoLista;

  /* EN UN MÓDULO CON RAMAS SE MUESTRA UNA SOLA RAMA.
     Roturas mide dos cosas que no se suman —unidades en sitio y kilos a
     la salida—, y un riel con las siete pantallas seguidas las presenta
     como una sola lista, que es justo el error que el módulo existe para
     evitar. Estando dentro de una rama se ven sus pantallas; parado en
     la portada del módulo se ven las ramas, no sus pantallas. */
  const rama = ramaDeRuta(actual, pathname);
  const secciones = actual.ramas?.length
    ? (rama ? visibles.filter((s) => s.rama === rama.id) : [])
    : visibles;

  /* Las ramas que esta persona puede abrir. Una rama sin ninguna
     pantalla abierta no se ofrece: sería una puerta a un pasillo vacío. */
  const ramas = rama || !actual.ramas?.length ? [] : actual.ramas.filter((r) =>
    visibles.some((s) => s.rama === r.id));

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

        <div className="grupo texto">ESTÁS EN</div>

        <Link href={actual.ruta} className={"modulo" + (rama ? "" : " on")}>
          <IconoActual />
          <span className="texto">{actual.nombre}</span>
          <span className="globo">{actual.nombre}</span>
        </Link>

        {/* La rama, debajo del módulo y marcada como el sitio actual: es
            la que manda sobre lo que se ve abajo, y tocarla devuelve a su
            primera pantalla. El enlace de arriba sigue siendo la salida
            hacia la otra rama. */}
        {rama && (
          <Link href={rama.ruta} className="hijo on">
            <IconoRama />
            <span className="texto">{rama.nombre}</span>
            <span className="globo">{actual.nombre} · {rama.nombre}</span>
          </Link>
        )}

        {ramas.map((r) => {
          const Icono = ICONO_RUTA[r.ruta] ?? IconoLista;
          return (
            <Link key={r.id} href={r.ruta} className="hijo"
                  prefetch={false}
                  onMouseEnter={() => adelantar(r.ruta)}
                  onPointerDown={() => adelantar(r.ruta)}
                  onFocus={() => adelantar(r.ruta)}>
              <Icono />
              <span className="texto">{r.nombre}</span>
              <span className="globo">{r.nombre} · {r.eyebrow.toLowerCase()}</span>
            </Link>
          );
        })}

        {secciones.map((s) => {
          const Icono = ICONO_RUTA[s.ruta] ?? IconoTablero;
          const aqui = pathname === s.ruta;
          return (
            <Link
              key={s.ruta}
              href={s.ruta}
              className={"hijo" + (aqui ? " on" : "")}
              aria-current={aqui ? "page" : undefined}
              /* prefetch={false} apaga el automático, que dispara al
                 aparecer el enlace en pantalla: con el menú anclado eso
                 es traerlas TODAS al entrar. Aquí se trae la que la
                 persona está mirando, no las seis. */
              prefetch={false}
              onMouseEnter={() => adelantar(s.ruta)}
              onPointerDown={() => adelantar(s.ruta)}
              onFocus={() => adelantar(s.ruta)}
            >
              <Icono />
              <span className="texto">{s.nombre}</span>
              <span className="globo">{s.nombre}</span>
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
