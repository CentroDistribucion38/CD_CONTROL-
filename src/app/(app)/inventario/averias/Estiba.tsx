"use client";

import { useEffect, useRef, useState } from "react";
import type { Causal } from "@/modulos/averias/hallazgos";

/* =====================================================================
   LA ESTIBA FANTASMA — las cajas averiadas que el sistema todavía cuenta,
   armadas en 3D con canastas de verdad.

   POR QUÉ UNA ESTIBA Y NO UNA BARRA. «36 cajas sin dar de baja» es un
   número que se lee y se olvida. Una estiba armada —tres de frente, tres
   de fondo, cuatro de alto— es un bulto que se reconoce desde el pasillo:
   el que la ve sabe, sin leer, que hay una estiba entera de producto que
   la bodega no tiene y el inventario sí. Esa es toda la pantalla.

   CADA CANASTA ES UNA CAJA. No es decoración con una cifra encima: si hay
   20 cajas se arman 20 canastas, y la hoja de colores que lleva pegada
   dice de qué causal es. Por eso se apilan agrupadas por causal y de
   abajo hacia arriba: el montón de color que más pesa se ve solo.

   SE DIBUJA CON POCOS TRAZOS. Una canasta suelta son unas veinte piezas;
   treinta y seis canastas serían setecientos dibujos por cuadro y el
   teléfono se arrodilla. Aquí las piezas de una canasta se funden en UNA
   sola figura y las 36 se pintan de un golpe (`InstancedMesh`): el
   teléfono pinta unos diez dibujos por cuadro, no setecientos.

   Y SI EL EQUIPO NO DA, no se queda un hueco: no hay WebGL, se pierde el
   contexto o el navegador es viejo, y en el mismo sitio aparece la misma
   estiba dibujada plana. Nunca un marco vacío.
   ===================================================================== */

export type PorCausal = Record<Causal, number>;

/** El color de la hoja de avería que lleva pegada cada canasta. Son
 *  colores de objeto —papel de verdad sobre plástico negro— y por eso no
 *  siguen el tema: lo que sigue al tema es el panel de alrededor. */
export const COLOR_CAUSAL: Record<Causal, string> = {
  deposito: "#C8102E",
  transporte: "#E8A600",
  contaminado: "#0F7A4A",
};
const NOMBRE_CAUSAL: Record<Causal, string> = {
  deposito: "Avería depósito",
  transporte: "Avería transporte",
  contaminado: "Producto contaminado",
};

/* LA ESTIBA LLENA. Tres de frente por tres de fondo por cuatro de alto es
   la estiba de canastas como se arma en AG01. Es el tope de lo que se
   dibuja: si hay más cajas pendientes, la cifra grande dice la verdad y
   debajo se avisa que la estiba está llena. */
const NX = 3, NZ = 3, NY = 4;
export const CUPO = NX * NZ * NY;

/** Las causales ordenadas de más a menos cajas, y la lista de canastas
 *  que sale de ahí. Se calcula aparte del dibujo porque el respaldo plano
 *  la necesita igual. */
function repartir(porCausal: PorCausal) {
  /* LA LEYENDA VA DE MAYOR A MENOR —se lee primero lo que más pesa— y la
     ESTIBA SE ARMA AL REVÉS, la causal más pequeña abajo.

     Lo que de verdad impide que una causal chica desaparezca es que la
     estiba se llene POR CAPAS y no por columnas (ver abajo); eso ya está
     medido y el arnés se pone rojo si se cambia. Esto de aquí es un paso
     más: con la causal pequeña abajo, sus canastas caen en la fila del
     frente de la primera capa —el sitio más visible de la estiba— en vez
     de quedar arriba, de medio lado, donde solo se ve su costado. El
     arnés NO se pone rojo si se quita, porque con el llenado por capas
     la causal chica se sigue viendo; se ve peor, y esa diferencia no se
     mide en píxeles. */
  const grupos = (Object.entries(porCausal) as [Causal, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const lista: Causal[] = [];
  for (const [c, n] of [...grupos].reverse()) for (let i = 0; i < n; i++) lista.push(c);
  return { grupos, lista: lista.slice(0, CUPO), total: lista.length };
}

export function Estiba({ porCausal }: { porCausal: PorCausal }) {
  const caja = useRef<HTMLDivElement>(null);
  /* TRES ESTADOS Y NO DOS. «Todavía no» no es lo mismo que «no se pudo»:
     mientras se descarga la librería el sitio se queda quieto y en calma,
     y solo si de verdad falla aparece el dibujo plano. Con un solo
     booleano el respaldo parpadearía en cada carga. */
  const [estado, setEstado] = useState<"esperando" | "listo" | "plano">("esperando");
  const { lista, total } = repartir(porCausal);
  const firma = lista.join("");

  useEffect(() => {
    const cont = caja.current;
    if (!cont || total === 0) { setEstado(total === 0 ? "plano" : "esperando"); return }

    let vivo = true;
    let soltar: (() => void) | null = null;

    /* NO SE ARRANCA HASTA QUE SE VE. La estiba abre la pantalla, así que
       casi siempre se ve de una; pero si alguien entra con el tablero ya
       rodado hacia abajo, descargar una librería de 600 kB y encender la
       tarjeta de video para algo que está fuera de la pantalla es gastar
       batería en nada. */
    const obs = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      arrancar();
    }, { rootMargin: "200px" });
    obs.observe(cont);

    async function arrancar() {
      try {
        const THREE = await import("three");
        const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
        if (!vivo) return;
        soltar = montar(THREE, mergeGeometries, cont!, lista);
        setEstado("listo");
      } catch {
        /* Puede fallar por WebGL apagado, por un navegador viejo o porque
           la red se cayó a mitad de la descarga. Los tres se ven igual
           desde aquí y los tres se resuelven igual. */
        if (vivo) setEstado("plano");
      }
    }

    return () => { vivo = false; obs.disconnect(); soltar?.() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  if (estado === "plano") return <EstibaPlana porCausal={porCausal} />;

  return (
    <div
      ref={caja}
      className="avr-lienzo"
      role="img"
      aria-label={
        `Estiba con ${total} caja${total === 1 ? "" : "s"} averiada${total === 1 ? "" : "s"} sin documento de baja` +
        (total > CUPO ? `, de las cuales se dibujan ${CUPO}` : "")
      }
    />
  );
}

/* =====================================================================
   EL DIBUJO PLANO — el respaldo, y no un consuelo.

   Es la misma estiba en isométrica, con las mismas canastas y los mismos
   colores. Se dibuja con SVG, pesa nada y se ve en cualquier cosa que
   tenga pantalla. Quien cae aquí no se entera de que cayó.
   ===================================================================== */
function EstibaPlana({ porCausal }: { porCausal: PorCausal }) {
  const { lista, total } = repartir(porCausal);
  if (total === 0) {
    return <div className="avr-lienzo avr-lienzo-vacio" role="img"
                aria-label="No hay cajas averiadas sin documento de baja" />;
  }
  /* ISOMÉTRICA A MANO, con las medidas de la canasta de 30 llevadas a
     píxeles: 40 de ancho, 33 de fondo, 29 de alto. Se dibujan las tres
     caras que se ven —tapa, costado izquierdo y costado derecho— y la
     hoja de avería va pegada en el costado derecho, que es el que mira a
     quien está en el pasillo. */
  /* Las medidas van estiradas a lo ancho respecto de la canasta real: la
     isométrica parte el ancho por la mitad al proyectarlo, y con las
     medidas literales la estiba sale como una torre. Estirando el ancho
     y el fondo, el bulto vuelve a tener la forma de una estiba. */
  const W = 54, D = 46, H = 30;
  const punto = (x: number, y: number, z: number): [number, number] =>
    [x * W / 2 - z * D / 2, x * W / 4 + z * D / 4 - y * H];

  /* El mismo reparto que en 3D: por capas, y dentro de la capa de atrás
     hacia adelante. Así el dibujo plano y la estiba cuentan lo mismo. */
  const PISO: [number, number][] = [];
  for (let z = NZ - 1; z >= 0; z--) for (let x = 0; x < NX; x++) PISO.push([x, z]);
  const piezas = lista.map((c, i) => {
    const capa = Math.floor(i / PISO.length), [x, z] = PISO[i % PISO.length];
    return { c, x, y: capa, z };
  });
  /* ORDEN DE PINTOR: primero lo que está lejos. En esta proyección lo
     que está más abajo en la pantalla está más cerca, y eso es x + z.
     Dentro de la misma distancia, primero lo de abajo. */
  piezas.sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.y - b.y);

  const caras = piezas.map(({ c, x, y, z }) => {
    const A = punto(x, y, z);                       // vértice de arriba de la tapa
    const B: [number, number] = [A[0] + W / 2, A[1] + W / 4];
    const C: [number, number] = [B[0] - D / 2, B[1] + D / 4];
    const E: [number, number] = [A[0] - D / 2, A[1] + D / 4];
    const baja = (p: [number, number]): [number, number] => [p[0], p[1] + H];
    /* La hoja, dentro de la cara derecha: se recorre la cara con sus dos
       vectores —hacia el frente y hacia abajo— y se recorta el rectángulo
       en esa rejilla, para que quede tumbada como la cara. */
    const hoja = ([u0, v0, u1, v1]: number[]) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
      .map(([u, v]) => `${B[0] + (C[0] - B[0]) * u},${B[1] + (C[1] - B[1]) * u + H * v}`).join(" ");
    return { c, tapa: [A, B, C, E], izq: [E, C, baja(C), baja(E)], der: [B, C, baja(C), baja(B)],
             papel: hoja([0.18, 0.16, 0.72, 0.6]) };
  });
  const todos = caras.flatMap((f) => [...f.tapa, ...f.izq, ...f.der]);
  const xs = todos.map((p) => p[0]), ys = todos.map((p) => p[1]);
  const x0 = Math.min(...xs) - 16, y0 = Math.min(...ys) - 10;
  const an = Math.max(...xs) - x0 + 16, al = Math.max(...ys) - y0 + 26;
  const pol = (ps: [number, number][]) => ps.map((p) => `${p[0]},${p[1]}`).join(" ");

  return (
    <div className="avr-lienzo avr-lienzo-plano" role="img"
         aria-label={`Estiba con ${total} caja${total === 1 ? "" : "s"} averiada${total === 1 ? "" : "s"} sin documento de baja`}>
      <svg viewBox={`${x0} ${y0} ${an} ${al}`} preserveAspectRatio="xMidYMid meet">
        {/* La tarima, debajo de todo. */}
        <polygon fill="#8A6A48" points={pol([
          punto(-0.35, 0, -0.35), punto(NX - 0.65, 0, -0.35),
          punto(NX - 0.65, 0, NZ - 0.65), punto(-0.35, 0, NZ - 0.65),
        ].map(([a, b]) => [a, b + H + 7] as [number, number]))} />
        {caras.map((f, i) => (
          <g key={i}>
            <polygon points={pol(f.tapa as [number, number][])} fill="#3C4142" />
            <polygon points={pol(f.izq as [number, number][])} fill="#1C1F20" />
            <polygon points={pol(f.der as [number, number][])} fill="#2A2E2F" />
            <polygon points={f.papel} fill={COLOR_CAUSAL[f.c]} />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* =====================================================================
   EL ARMADO EN 3D.

   Va fuera del componente a propósito: no toca estado de React, recibe lo
   que necesita y devuelve cómo desarmarse. Así se puede leer de corrido
   —es una escena, no una pantalla— y el día que haya que tocarla no hay
   que entender React para entenderla.
   ===================================================================== */
type TresD = typeof import("three");
type Fundir = typeof import("three/examples/jsm/utils/BufferGeometryUtils.js")["mergeGeometries"];
/* El tipo que `mergeGeometries` acepta, tomado de la propia función: si
   mañana cambia en three, cambia aquí solo. */
type Geos = Parameters<Fundir>[0];

function montar(THREE: TresD, fundir: Fundir, cont: HTMLElement, lista: Causal[]): () => void {
  /* ---------- QUÉ TAN FUERTE PEGARLE AL EQUIPO ----------
     No se pregunta «¿es celular?» —eso se adivina mal y envejece— sino
     por lo que de verdad importa: cuántos núcleos hay y qué tan ancho es
     el sitio. Un celular nuevo puede con las sombras y un portátil viejo
     de oficina no, y el mismo `if` acierta en los dos. */
  const nucleos = navigator.hardwareConcurrency ?? 4;
  const ancho = cont.clientWidth || 640;
  const fino = nucleos >= 8 && ancho >= 560;
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: fino, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, fino ? 2 : 1.5));
  renderer.shadowMap.enabled = fino;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y";
  cont.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
  cam.position.set(-3.75, 2.7, 5.7);
  cam.lookAt(0.05, 0.78, 0);
  /* EL ENCUADRE SE CALCULA, NO SE DEJA FIJO. Un ángulo de cámara fijo
     que encuadra bien en el panel ancho del computador recorta la estiba
     por los lados en el cuadrado del teléfono. Se mide el bulto —la
     estiba armada cabe en una esfera de 1,1 m— y se abre el ángulo justo
     lo necesario para que quepa con aire, sea cual sea la forma del
     hueco. */
  const RADIO = 1.12, AIRE = 1.22;
  const DIST = Math.hypot(3.75, 2.7 - 0.78, 5.7);
  const encuadrar = (aspecto: number) => {
    const medio = Math.atan((RADIO * AIRE) / DIST);
    cam.fov = aspecto >= 1
      ? (2 * medio * 180) / Math.PI
      : (2 * Math.atan(Math.tan(medio) / aspecto) * 180) / Math.PI;
  };

  /* ---------- LA LUZ DE LA BODEGA ----------
     El plástico de la canasta y el vidrio de la botella solo se ven a
     plástico y a vidrio si tienen algo que reflejar. Ese «algo» es un
     cielo pintado a mano: piso oscuro, pared clara y unas lámparas
     arriba. Sin él la canasta parece de cartón. */
  const lienzo = (w: number, h: number, f: (x: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    f(c.getContext("2d")!, w, h); return c;
  };
  const tex = (c: HTMLCanvasElement, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = fino ? 8 : 2; return t;
  };
  const ruido = (x: CanvasRenderingContext2D, w: number, h: number, a: number, n = 30) => {
    for (let i = 0; i < (w * h) / n; i++) {
      const v = Math.random() < 0.5 ? 255 : 0;
      x.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`;
      x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  };

  /* EL CIELO VA EN LOS DOS NIVELES. Se probó dejarlo solo en el equipo
     fino y el resultado fue una estiba de cajas negras: sin nada que
     reflejar, el plástico deja de parecer plástico y las botellas dejan
     de parecer vidrio. Cuesta una vez —no por cuadro— así que el ahorro
     era falso y el teléfono terminaba viendo un dibujo peor. Lo que sí
     se achica en el equipo flojo es el tamaño del cielo. */
  let pmrem: InstanceType<TresD["PMREMGenerator"]> | null = null;
  {
    const cielo = lienzo(fino ? 1024 : 512, fino ? 512 : 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#fbfaf6"); g.addColorStop(0.46, "#d9d6cf");
      g.addColorStop(0.52, "#8d8a83"); g.addColorStop(1, "#55524d");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = "#ffffff";
      for (let i = 0; i < 10; i++) x.fillRect(w * (.03 + i * .098), h * .08, w * .06, h * .02);
      x.fillStyle = "rgba(255,255,255,.9)"; x.fillRect(w * .37, h * .23, w * .25, h * .23);
    });
    const t = new THREE.CanvasTexture(cielo);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(t).texture;
    t.dispose();
  }

  scene.add(new THREE.HemisphereLight(0xf4f1ea, 0x5c5850, 0.5));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
  key.position.set(-3.2, 6.5, 4.2);
  if (fino) {
    key.castShadow = true;
    /* MAPA DE SOMBRA DE 1024 Y NO DE 2048. El panel más grande que va a
       existir mide unos 700 px de ancho; a ese tamaño la sombra de 2048
       no se ve mejor y cuesta cuatro veces más. Con un video integrado
       flojo —que es el que tiene un portátil de oficina, justo el que
       entra al nivel fino por tener ocho núcleos— la diferencia es entre
       aparecer de una y aparecer a los diez segundos. */
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.4, bottom: -1.6, near: 1, far: 16 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.015; key.shadow.radius = 6;
  }
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd6e2ff, 0.55); fill.position.set(4, 2.2, 1.5); scene.add(fill);
  const back = new THREE.DirectionalLight(0xffffff, 0.7); back.position.set(1.5, 3, -4); scene.add(back);

  const raiz = new THREE.Group(); scene.add(raiz);
  if (fino) {
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.3 }));
    piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; scene.add(piso);
  }

  /* ---------- LA CANASTA DE 30, EN UNA SOLA FIGURA ----------
     Medidas de la canasta real en metros. Las paredes se cortan con su
     ventana —el hueco por donde se agarra y por donde se ven las
     botellas— y después TODAS las piezas se funden en una figura sola.
     Ese `fundir` es lo que hace que 36 canastas cuesten un dibujo. */
  const L = 0.40, Wd = 0.33, Hc = 0.29, T = 0.011;
  const PW = 1.2, PD = 1.0, TOPE = 0.144;

  const pared = (w: number, h: number, v: [number, number, number, number, number]) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
    const [vx, vy, vw, vh, r] = v, hueco = new THREE.Path();
    hueco.moveTo(vx + r, vy); hueco.lineTo(vx + vw - r, vy);
    hueco.quadraticCurveTo(vx + vw, vy, vx + vw, vy + r); hueco.lineTo(vx + vw, vy + vh - r);
    hueco.quadraticCurveTo(vx + vw, vy + vh, vx + vw - r, vy + vh); hueco.lineTo(vx + r, vy + vh);
    hueco.quadraticCurveTo(vx, vy + vh, vx, vy + vh - r); hueco.lineTo(vx, vy + r);
    hueco.quadraticCurveTo(vx, vy, vx + r, vy);
    s.holes.push(hueco);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: T - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002,
      bevelSegments: fino ? 2 : 1, curveSegments: fino ? 10 : 4,
    });
    g.computeVertexNormals();
    return g;
  };

  const trozos: Geos = [];
  const poner = (g: Geos[number], x = 0, y = 0, z = 0, rotY = 0,
                 sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Matrix4()
      .compose(new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
        new THREE.Vector3(sx, sy, sz));
    const c = g.clone().applyMatrix4(m);
    /* TODAS SIN ÍNDICE ANTES DE FUNDIR. `fundir` se niega —y devuelve
       nada— si unas figuras traen índice y otras no, y las paredes
       (extruidas) no lo traen mientras que los cubos sí. Devolver nada
       deja la canasta sin figura y el panel en blanco, sin que nada
       falle a gritos: exactamente el error que no se ve leyendo. */
    trozos.push(c.index ? c.toNonIndexed() : c);
  };
  const gFrente = pared(L, Hc, [-L * 0.36, Hc * 0.17, L * 0.72, Hc * 0.19, 0.022]);
  const gLado = pared(Wd, Hc, [-Wd * 0.34, Hc * 0.17, Wd * 0.68, Hc * 0.19, 0.02]);
  const gCubo = new THREE.BoxGeometry(1, 1, 1);
  poner(gFrente, 0, 0, Wd / 2 - T + 0.002);
  poner(gFrente, 0, 0, -Wd / 2 + T - 0.002, Math.PI);
  poner(gLado, L / 2 - T + 0.002, 0, 0, Math.PI / 2);
  poner(gLado, -L / 2 + T - 0.002, 0, 0, -Math.PI / 2);
  poner(gCubo, 0, -Hc / 2 + 0.005, 0, 0, L - 2 * T, 0.01, Wd - 2 * T);          // el piso
  const labio = (y: number, hh: number, o: number) => {                          // labio y zócalo
    poner(gCubo, 0, y, Wd / 2, 0, L + o * 2, hh, T + o * 2);
    poner(gCubo, 0, y, -Wd / 2, 0, L + o * 2, hh, T + o * 2);
    poner(gCubo, L / 2, y, 0, 0, T + o * 2, hh, Wd + o * 2);
    poner(gCubo, -L / 2, y, 0, 0, T + o * 2, hh, Wd + o * 2);
  };
  labio(Hc / 2 - 0.009, 0.018, 0.004);
  labio(-Hc / 2 + 0.008, 0.016, 0.002);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])                   // costillas de esquina
    poner(gCubo, sx * (L / 2 - 0.003), 0, sz * (Wd / 2 - 0.003), 0, 0.02, Hc - 0.01, 0.02);
  const gCanasta = fundir(trozos, false)!;
  trozos.forEach((t) => t.dispose());
  gFrente.dispose(); gLado.dispose();

  const rugoso = tex(lienzo(512, 512, (x, w, h) => {
    x.fillStyle = "#8c8c8c"; x.fillRect(0, 0, w, h); ruido(x, w, h, 0.35, 6);
    x.strokeStyle = "rgba(40,40,40,.5)";
    for (let i = 0; i < 40; i++) {
      x.lineWidth = 0.6 + Math.random(); x.beginPath();
      const a = Math.random() * w, b = Math.random() * h;
      x.moveTo(a, b); x.lineTo(a + Math.random() * 80 - 40, b + Math.random() * 10 - 5); x.stroke();
    }
  }), false);
  rugoso.wrapS = rugoso.wrapT = THREE.RepeatWrapping;
  const plastico = new THREE.MeshStandardMaterial({
    color: "#2B2F30", roughness: 0.45, roughnessMap: rugoso, metalness: 0,
    envMapIntensity: 1.35,
  });

  const N = lista.length;
  const canastas = new THREE.InstancedMesh(gCanasta, plastico, N);
  canastas.castShadow = canastas.receiveShadow = fino;
  raiz.add(canastas);

  /* ---------- EL LOGO EN RELIEVE ----------
     ES EL ARCHIVO DE LA MARCA, no un logo dibujado a mano aquí. Se carga
     de /marca/logo-b.png; si no está, las canastas quedan lisas y no pasa
     nada más. Inventar el logo con trazos sería dibujar una marca ajena. */
  const gPlano = new THREE.PlaneGeometry(1, 1);
  const carasLogo = fundir([
    gPlano.clone().applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(0, -Hc * 0.14, Wd / 2 + 0.0025), new THREE.Quaternion(),
      new THREE.Vector3(L * 0.34, L * 0.34, 1))),
    gPlano.clone().applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(L / 2 + 0.0025, -Hc * 0.14, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
      new THREE.Vector3(Wd * 0.36, Wd * 0.36, 1))),
  ], false)!;
  const logoTex = new THREE.TextureLoader().load("/marca/logo-b.png", () => pedirCuadro());
  logoTex.colorSpace = THREE.SRGBColorSpace;
  const logos = new THREE.InstancedMesh(carasLogo, new THREE.MeshStandardMaterial({
    map: logoTex, transparent: true, roughness: 0.4, metalness: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  }), N);
  raiz.add(logos);

  /* ---------- LAS BOTELLAS ----------
     Treinta por canasta, en dos figuras: el vidrio ámbar y la cápsula
     dorada. Instanciadas TODAS juntas —1.080 botellas en dos dibujos— y
     no por canasta, que serían setenta y dos. */
  const perfil = [[0, 0], [.030, 0], [.031, .004], [.031, .135], [.029, .155], [.019, .178],
                  [.0135, .2], [.0135, .228], [0, .228]].map(([a, b]) => new THREE.Vector2(a, b));
  const gVidrio = new THREE.LatheGeometry(perfil, fino ? 20 : 8);
  const gMetal = fundir([
    new THREE.CylinderGeometry(.0142, .0158, .036, fino ? 18 : 8)
      .translate(0, .021, 0),
    new THREE.CylinderGeometry(.0148, .0148, .006, fino ? 18 : 8)
      .translate(0, .042, 0),
  ], false)!;
  const vidrio = new THREE.MeshStandardMaterial({ color: "#3a1905", roughness: 0.05, metalness: 0, envMapIntensity: 1.8 });
  const capsula = new THREE.MeshStandardMaterial({ color: "#b8923e", roughness: 0.3, metalness: 0.85, envMapIntensity: 1.2 });
  const BX = 6, BZ = 5, POR = BX * BZ;
  const dx = (L - 2 * T) / BX, dz = (Wd - 2 * T) / BZ;
  const botellas = new THREE.InstancedMesh(gVidrio, vidrio, N * POR);
  const cuellos = new THREE.InstancedMesh(gMetal, capsula, N * POR);
  botellas.castShadow = cuellos.castShadow = fino;
  raiz.add(botellas, cuellos);

  /* ---------- LA HOJA DE AVERÍA ----------
     Es lo que hace legible el montón: cada canasta lleva pegada su hoja,
     del color de la causal, en la cara del frente y en la del costado
     —porque desde la cámara solo se ven esas dos—. Una figura por causal,
     así que son tres dibujos más y no treinta y seis. */
  const hojaDe = (c: Causal) => tex(lienzo(200, 260, (x, w, h) => {
    x.fillStyle = COLOR_CAUSAL[c]; x.fillRect(0, 0, w, h); ruido(x, w, h, 0.08, 4);
    x.fillStyle = "rgba(255,255,255,.14)"; x.fillRect(0, 0, w, h * 0.3);
    x.fillStyle = c === "transporte" ? "#2a2200" : "#ffffff";
    x.font = '800 34px Archivo, Arial'; x.textAlign = "center"; x.fillText("AVERÍA", w / 2, 52);
    x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      x.beginPath(); x.moveTo(26, 100 + i * 28); x.lineTo(w - 26 - (i % 2) * 40, 100 + i * 28); x.stroke();
    }
    x.fillStyle = "rgba(245,240,225,.75)"; x.fillRect(w / 2 - 42, 0, 84, 18);   // la cinta
  }));
  const carasHoja = fundir([
    gPlano.clone().applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(L * 0.28, -Hc * 0.04, Wd / 2 + 0.004), new THREE.Quaternion(),
      new THREE.Vector3(0.085, 0.11, 1))),
    gPlano.clone().applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(L / 2 + 0.004, -Hc * 0.04, -Wd * 0.2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
      new THREE.Vector3(0.075, 0.1, 1))),
  ], false)!;
  const hojas = new Map<Causal, InstanceType<TresD["InstancedMesh"]>>();
  for (const c of new Set(lista)) {
    const n = lista.filter((k) => k === c).length;
    const m = new THREE.InstancedMesh(carasHoja, new THREE.MeshStandardMaterial({
      map: hojaDe(c), roughness: 0.9, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4,
    }), n);
    m.castShadow = fino;
    hojas.set(c, m); raiz.add(m);
  }

  /* ---------- LA TARIMA ----------
     Siete tablas arriba, tres tacos y tres tablas abajo: la estiba de
     madera clara de la bodega. También fundida en una sola figura. */
  const madera = tex(lienzo(512, 128, (x, w, h) => {
    x.fillStyle = "#9a7650"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(${Math.random() < .5 ? "110,80,45" : "235,215,180"},${.08 + Math.random() * .2})`;
      x.lineWidth = 1 + Math.random() * 2; const yy = Math.random() * h;
      x.beginPath(); x.moveTo(0, yy);
      x.bezierCurveTo(170, yy + Math.random() * 8 - 4, 340, yy + Math.random() * 8 - 4, w, yy); x.stroke();
    }
    x.fillStyle = "rgba(70,55,40,.13)";
    for (let i = 0; i < 14; i++) {
      x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, 6 + Math.random() * 14, 0, 0, 7); x.fill();
    }
    ruido(x, w, h, 0.12);
  }));
  const tablas: Geos = [];
  const tabla = (w: number, h: number, d: number, X: number, Y: number, Z: number) =>
    tablas.push(new THREE.BoxGeometry(w, h, d).translate(X, Y, Z));
  for (let i = 0; i < 7; i++) tabla(PW, .022, .1, 0, .133, -PD / 2 + .05 + i * (PD - .1) / 6);
  for (const k of [-1, 0, 1]) tabla(PW, .022, .1, 0, .1, k * (PD / 2 - .05));
  for (const k of [-1, 0, 1]) for (const j of [-1, 0, 1])
    tabla(k === 0 ? .145 : .1, .078, .1, k * (PW / 2 - .05), .05, j * (PD / 2 - .05));
  for (const k of [-1, 0, 1]) tabla(PW, .022, .1, 0, .011, k * (PD / 2 - .05));
  const tarima = new THREE.Mesh(fundir(tablas, false)!, new THREE.MeshStandardMaterial({ map: madera, roughness: 0.92 }));
  tarima.castShadow = tarima.receiveShadow = fino;
  tablas.forEach((t) => t.dispose());
  gPlano.dispose();
  raiz.add(tarima);

  /* La sombra de contacto: una mancha pintada debajo. Cuesta un dibujo y
     es lo que hace que la estiba se pose en el piso en vez de flotar
     —sobre todo cuando las sombras de verdad van apagadas. */
  const mancha = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.7),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(lienzo(256, 256, (x) => {
        const g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
        g.addColorStop(0, "rgba(0,0,0,.5)"); g.addColorStop(.6, "rgba(0,0,0,.16)"); g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      })), transparent: true, depthWrite: false,
    }));
  mancha.rotation.x = -Math.PI / 2; mancha.position.y = 0.001; raiz.add(mancha);

  /* ---------- DÓNDE VA CADA CANASTA ----------
     De atrás hacia adelante y de abajo hacia arriba, columna por columna.
     Como la lista viene ordenada por causal, el color queda en bloques y
     el montón que más pesa se ve de un vistazo. */
  /* SE LLENA POR CAPAS Y NO POR COLUMNAS, y esa es la diferencia entre
     que el dibujo hable o no hable.

     Llenando columna por columna, la causal más grande ocupa las
     columnas del frente y TAPA a las otras dos: el que mira ve una
     estiba de un solo color y se pierde justo lo que había que contar.
     Por capas, cada causal queda en una FRANJA horizontal que se ve
     entera desde el frente —20 cajas son dos capas y pico, 12 son una y
     pico, 4 son media— y el montón se lee como se lee una estiba mixta
     de verdad: por lo que tiene encima y lo que tiene debajo.

     Dentro de cada capa se llena de atrás hacia adelante, que es como la
     arma un montacarguista. */
  const PISO: [number, number][] = [];
  for (let z = NZ - 1; z >= 0; z--) for (let x = 0; x < NX; x++) PISO.push([x, z]);
  const sitio = lista.map((c, i) => {
    const capa = Math.floor(i / PISO.length), [cx, cz] = PISO[i % PISO.length];
    return {
      c, x: (cx - 1) * L, y: TOPE + Hc / 2 + capa * (Hc + 0.001), z: (cz - 1) * Wd,
      /* El retraso de la caída: primero la capa de abajo, y dentro de la
         capa las de atrás. */
      d: i * 0.05,
    };
  });

  /* Las posiciones de las botellas dentro de una canasta, calculadas una
     sola vez: son las mismas para las 36. */
  const enCanasta: InstanceType<TresD["Vector3"]>[] = [];
  const giro: InstanceType<TresD["Quaternion"]>[] = [];
  for (let a = 0; a < BX; a++) for (let b = 0; b < BZ; b++) {
    enCanasta.push(new THREE.Vector3(-L / 2 + T + dx * (a + .5), -Hc / 2 + .012, -Wd / 2 + T + dz * (b + .5)));
    giro.push(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((a * b) % 5) * 0.4));
  }
  const IDENT = new THREE.Quaternion();
  const UNO = new THREE.Vector3(1, 1, 1);

  /* EL RECORTE POR CÁMARA SE APAGA, como seguro y no como arreglo.

     three calcula la esfera que envuelve a las instancias UNA vez y no la
     vuelve a calcular cuando las matrices cambian. Las canastas empiezan
     el cuadro escondidas debajo del piso y terminan metro y medio más
     arriba, así que esa esfera se calcula sobre una posición que no es la
     final. En este encuadre no llega a estorbar —se probó quitándolo y no
     cambia un píxel— pero basta mover la cámara o alargar la caída para
     que se empiecen a borrar canastas a mitad de la animación, y eso no
     se entendería nunca mirando este archivo. Cuesta una línea. */
  for (const o of [canastas, logos, botellas, cuellos, ...hojas.values()]) o.frustumCulled = false;

  /* Los vectores se reservan UNA vez y se reescriben. Por cuadro se
     mueven 1.080 botellas: un `new Vector3` por botella serían 65.000
     objetos por segundo para el recolector de basura, y eso se siente
     como tirones justo mientras cae la estiba. */
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3();
  const contadores = new Map<Causal, number>();
  function colocar(altura: (i: number) => number) {
    contadores.clear();
    let b = 0;
    sitio.forEach((s, i) => {
      const y = altura(i);
      v3.set(s.x, y, s.z);
      m4.compose(v3, IDENT, UNO);
      canastas.setMatrixAt(i, m4);
      logos.setMatrixAt(i, m4);
      const hoja = hojas.get(s.c)!;
      const k = contadores.get(s.c) ?? 0;
      hoja.setMatrixAt(k, m4); contadores.set(s.c, k + 1);
      for (let j = 0; j < POR; j++, b++) {
        const p = enCanasta[j];
        v3.set(s.x + p.x, y + p.y, s.z + p.z);
        m4.compose(v3, giro[j], UNO);
        botellas.setMatrixAt(b, m4);
        cuellos.setMatrixAt(b, m4);
      }
    });
    canastas.instanceMatrix.needsUpdate = true;
    logos.instanceMatrix.needsUpdate = true;
    botellas.instanceMatrix.needsUpdate = true;
    cuellos.instanceMatrix.needsUpdate = true;
    for (const h of hojas.values()) h.instanceMatrix.needsUpdate = true;
  }
  /* Una canasta que todavía no ha caído se manda bajo el piso en vez de
     esconderla: con `InstancedMesh` no hay forma de apagar una sola, y un
     `scale` en cero deja la figura degenerada y el navegador avisa. */
  const ESCONDIDA = -99;

  /* ---------- LA CAÍDA ----------
     No es un adorno: es lo que cuenta la historia. Las canastas bajan una
     a una, capa por capa, y el bulto se ARMA delante de quien mira. Ver
     armarse una estiba entera de producto que no existe dice más que el
     número. Quien pidió menos movimiento la ve ya armada. */
  const suave = (t: number) => 1 - Math.pow(1 - t, 3);
  const t0 = performance.now();
  let rafId = 0, pendiente = false;
  function pedirCuadro() {
    if (pendiente) return;
    pendiente = true;
    rafId = requestAnimationFrame(() => { pendiente = false; renderer.render(scene, cam) });
  }
  function cuadro(ahora: number) {
    const t = (ahora - t0) / 1000;
    let vivo = false;
    colocar((i) => {
      const { y, d } = sitio[i];
      const k = Math.min(Math.max((t - d) / 0.45, 0), 1);
      /* «TODAVÍA NO EMPIEZA» TAMBIÉN ES ESTAR VIVO. Con la marca de vivo
         después del regreso temprano, en el primer cuadro NINGUNA canasta
         había empezado a caer —todas con k en cero—, así que el bucle se
         daba por terminado y la estiba no aparecía nunca: quedaba la
         tarima sola. Se veía perfecta en el código y vacía en pantalla. */
      if (k < 1) vivo = true;
      if (k <= 0) return ESCONDIDA;
      return y + (1 - suave(k)) * 1.6;
    });
    renderer.render(scene, cam);
    if (vivo) rafId = requestAnimationFrame(cuadro);
  }

  function ajustar() {
    const w = cont.clientWidth, h = cont.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; encuadrar(cam.aspect); cam.updateProjectionMatrix();
    pedirCuadro();
  }
  const ro = new ResizeObserver(ajustar);
  ro.observe(cont);
  ajustar();

  if (quieto) { colocar((i) => sitio[i].y); pedirCuadro() }
  else rafId = requestAnimationFrame(cuadro);

  /* ---------- DARLE LA VUELTA CON EL DEDO ----------
     La cara de atrás de la estiba no cuenta nada nuevo, pero poder
     girarla es lo que convierte un dibujo en un objeto: el que la
     arrastra entiende en un segundo que está mirando un bulto de verdad.
     `touch-action: pan-y` deja que el dedo siga rodando la página hacia
     abajo, que es lo que de verdad va a hacer casi siempre. */
  const tela = renderer.domElement;
  let desde: number | null = null;
  const baja = (e: PointerEvent) => {
    desde = e.clientX; tela.setPointerCapture(e.pointerId); tela.style.cursor = "grabbing";
  };
  const mueve = (e: PointerEvent) => {
    if (desde === null) return;
    raiz.rotation.y += (e.clientX - desde) * 0.006; desde = e.clientX; pedirCuadro();
  };
  const sube = () => { desde = null; tela.style.cursor = "grab" };
  tela.addEventListener("pointerdown", baja);
  tela.addEventListener("pointermove", mueve);
  tela.addEventListener("pointerup", sube);
  tela.addEventListener("pointercancel", sube);

  /* SI SE PIERDE EL CONTEXTO, no se deja el marco en negro. Pasa de
     verdad: el sistema operativo le quita la tarjeta al navegador cuando
     hay varias pestañas pesadas. */
  const perdido = (e: Event) => { e.preventDefault(); cont.classList.add("avr-lienzo-caido") };
  tela.addEventListener("webglcontextlost", perdido);

  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    tela.removeEventListener("pointerdown", baja);
    tela.removeEventListener("pointermove", mueve);
    tela.removeEventListener("pointerup", sube);
    tela.removeEventListener("pointercancel", sube);
    tela.removeEventListener("webglcontextlost", perdido);
    scene.traverse((o) => {
      const m = o as InstanceType<TresD["Mesh"]>;
      m.geometry?.dispose?.();
      const mat = m.material as InstanceType<TresD["MeshStandardMaterial"]> | undefined;
      if (mat) { (mat.map as { dispose?: () => void } | null)?.dispose?.(); mat.dispose?.() }
    });
    pmrem?.dispose();
    renderer.dispose();
    tela.remove();
  };
}

/** La leyenda: un cuadrito del color de la hoja y el nombre en la tinta
 *  del tema. El color va en el cuadro y NUNCA en la letra: tres de las
 *  siete apariencias son oscuras y el rojo sobre negro no se lee. */
export function LeyendaCausales({ porCausal }: { porCausal: PorCausal }) {
  const { grupos } = repartir(porCausal);
  if (!grupos.length) return null;
  return (
    <ul className="avr-ley">
      {grupos.map(([c, n]) => (
        <li key={c}>
          <i style={{ background: COLOR_CAUSAL[c] }} aria-hidden />
          {NOMBRE_CAUSAL[c]} · <b>{n}</b>
        </li>
      ))}
    </ul>
  );
}
