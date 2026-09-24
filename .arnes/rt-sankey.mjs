/* =====================================================================
   EL RECORRIDO DE LAS UNIDADES — la geometría, sin navegador.

   UN SANKEY MAL ARMADO NO SE VE MAL. Se ve perfecto y miente: una
   cinta más gorda de lo que le toca, un nodo que no suma lo que dice,
   y nadie lo nota porque la única forma de comprobarlo es rehacer la
   cuenta a mano. Esto la rehace.

   LAS TRES REGLAS:
     1. El alto de cada nodo es proporcional a su valor, en las tres
        columnas y con la misma escala.
     2. Lo que SALE de un nodo suma su alto, y lo que ENTRA también.
        Si no, el dibujo dice que se perdieron unidades en el camino.
     3. Nada se sale del lienzo.

     node .arnes/rt-sankey.mjs
   ===================================================================== */
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

const js = buildSync({
  entryPoints: [R("src/modulos/roturas/sankey.ts")], bundle: true, write: false,
  format: "esm", logLevel: "silent",
}).outputFiles[0].text;
const { armarSankey, masGrandes, COLOR_ASUMIDA, COLOR_NO_ASUMIDA } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const C = (id, valor, color = "#FFC400") => ({ id, rotulo: id, valor, color });

/* ---------------------------------------------------------------------
   EL CASO DE LA MAQUETA: dos causas, dos procesos, dos destinos.
   ------------------------------------------------------------------ */
const entrada = {
  columnas: [
    [C("estibas", 3000), C("maquina", 1230, "#E4002B")],
    [C("t1", 4200, "#B87F00"), C("lineas", 30, "#8A8E8A")],
    [C("vidrio", 3589, "#FFC400"), C("liquido", 641, "#B87F00")],
  ],
  tramos: [
    { de: "estibas", a: "t1", valor: 2985 },
    { de: "estibas", a: "lineas", valor: 15 },
    { de: "maquina", a: "t1", valor: 1215 },
    { de: "maquina", a: "lineas", valor: 15 },
    { de: "t1", a: "vidrio", valor: 3570 },
    { de: "t1", a: "liquido", valor: 630 },
    { de: "lineas", a: "vidrio", valor: 19 },
    { de: "lineas", a: "liquido", valor: 11 },
  ],
};
const s = armarSankey(entrada, 1160, 500);

/* ---------------------------------------------------------------------
   1 · LA MISMA ESCALA EN LAS TRES COLUMNAS
   ------------------------------------------------------------------ */
{
  const escalaDe = (id) => {
    const n = s.nodos.find((x) => x.id === id);
    return n.alto / n.valor;
  };
  const e0 = escalaDe("estibas");
  /* EL PISO ES UNA MENTIRA DELIBERADA SOBRE EL TAMAÑO, y es la única
     permitida: un nodo de 30 contra uno de 4200 mediría medio píxel y
     «no se ve» no es lo mismo que «no existe». Así que la regla de la
     escala se exige a los nodos QUE ESTÁN POR ENCIMA DEL PISO, y de
     los que están en el piso se exige otra cosa: que sea EXACTAMENTE
     el piso y no un número inventado. */
  /* UN NODO ESTÁ «LEVANTADO» cuando sus cintas —con el piso puesto—
     suman más que su tamaño a escala. Esos son los únicos que pueden
     salirse de la escala, y solo HACIA ARRIBA: encogerlos sería
     esconder algo, agrandarlos es dejarlo verse. */
  const escalaBase = s.nodos.reduce((m, n) => Math.min(m, n.alto / n.valor), Infinity);
  for (const id of ["maquina", "t1", "lineas", "vidrio", "liquido"]) {
    const n = s.nodos.find((x) => x.id === id);
    const aEscala = n.valor * escalaBase;
    if (n.alto > aEscala + 0.01) {
      /* Levantado: se exige que lo esté por una razón —sus cintas— y
         no por un número inventado. */
      const cintas = Math.max(
        s.cintas.filter((c) => c.de === id).reduce((a, c) => a + Math.max(1.5, c.valor * escalaBase), 0),
        s.cintas.filter((c) => c.a === id).reduce((a, c) => a + Math.max(1.5, c.valor * escalaBase), 0),
        1.5);
      ok(Math.abs(n.alto - cintas) < 0.05,
         `«${id}» mide ${n.alto.toFixed(2)} px, más de lo que le toca (${aEscala.toFixed(2)}), y no es lo que suman sus cintas (${cintas.toFixed(2)}): está agrandado sin razón`);
      continue;
    }
    ok(Math.abs(n.alto - aEscala) < 0.05,
       `«${id}» mide ${n.alto.toFixed(2)} px y a escala le tocan ${aEscala.toFixed(2)}: el dibujo miente sobre los tamaños`);
  }
  /* Y LA PROPORCIÓN SE CUMPLE DE VERDAD: estibas es 3000/1230 = 2,44
     veces máquina, y su barra tiene que serlo también. */
  const est = s.nodos.find((x) => x.id === "estibas");
  const maq = s.nodos.find((x) => x.id === "maquina");
  ok(Math.abs(est.alto / maq.alto - 3000 / 1230) < 0.01,
     `estibas mide ${(est.alto / maq.alto).toFixed(2)} veces máquina y debería medir 2.44`);
}

/* ---------------------------------------------------------------------
   2 · LO QUE SALE DE UN NODO SUMA SU ALTO, Y LO QUE ENTRA TAMBIÉN

   Es la regla que hace que el dibujo NO PIERDA UNIDADES en el camino.
   ------------------------------------------------------------------ */
{
  const alto = (id) => s.nodos.find((x) => x.id === id).alto;
  const escala = s.nodos.reduce((m, n) => Math.min(m, n.alto / n.valor), Infinity);

  /* LAS CINTAS NO PUEDEN SUMAR MÁS QUE SU NODO: si suman más, el
     dibujo enseña unidades saliendo de donde no entraron. Sumar MENOS
     tampoco, salvo por el piso —una cinta diminuta se agranda hasta
     verse, y eso deja a las demás usando menos de lo suyo—. Así que se
     exige: nunca más que el nodo, y nunca menos salvo lo que el piso
     explica. */
  const grosor = (c) => Math.max(1.5, c.valor * escala);
  for (const id of ["estibas", "maquina", "t1", "lineas"]) {
    const cs = s.cintas.filter((c) => c.de === id);
    const sale = cs.reduce((a, c) => a + grosor(c), 0);
    ok(sale <= alto(id) + 0.5,
       `de «${id}» salen ${sale.toFixed(1)} px de cinta y el nodo mide ${alto(id).toFixed(1)}: el dibujo inventa unidades`);
    const pisadas = cs.filter((c) => c.valor * escala < 1.5).length;
    if (pisadas === 0) {
      ok(Math.abs(sale - alto(id)) < 0.5,
         `de «${id}» salen ${sale.toFixed(1)} px y el nodo mide ${alto(id).toFixed(1)}: el dibujo pierde unidades`);
    }
  }
  for (const id of ["t1", "lineas", "vidrio", "liquido"]) {
    const cs = s.cintas.filter((c) => c.a === id);
    const entra = cs.reduce((a, c) => a + grosor(c), 0);
    ok(entra <= alto(id) + 0.5,
       `a «${id}» entran ${entra.toFixed(1)} px de cinta y el nodo mide ${alto(id).toFixed(1)}: las cintas se salen del nodo`);
    const pisadas = cs.filter((c) => c.valor * escala < 1.5).length;
    if (pisadas === 0) {
      ok(Math.abs(entra - alto(id)) < 0.5,
         `a «${id}» entran ${entra.toFixed(1)} px y el nodo mide ${alto(id).toFixed(1)}`);
    }
  }
}

/* ---------------------------------------------------------------------
   3 · NADA SE SALE DEL LIENZO
   ------------------------------------------------------------------ */
{
  for (const n of s.nodos) {
    ok(n.y >= 0 && n.y + n.alto <= 500 + 0.5,
       `el nodo «${n.id}» va de ${n.y.toFixed(1)} a ${(n.y + n.alto).toFixed(1)} y el lienzo mide 500`);
    ok(n.x >= 0 && n.x + 20 <= 1160 + 0.5,
       `el nodo «${n.id}» se sale a lo ancho`);
    ok(n.y + 58 <= 500.5,
       `el rótulo de «${n.id}» se escribe en ${(n.y + 58).toFixed(0)} y el lienzo mide 500`);
  }
  /* Y LAS CINTAS TAMPOCO: se leen todos los números del `d`. */
  for (const c of s.cintas) {
    const ys = [...c.d.matchAll(/[ ,](-?\d+(?:\.\d+)?)(?=[ ,CLZ]|$)/g)]
      .map((m) => Number(m[1]));
    const malos = ys.filter((v) => v < -0.5 || v > 1160.5);
    ok(malos.length === 0,
       `la cinta ${c.de}→${c.a} tiene coordenadas fuera del lienzo: ${malos.slice(0, 3)}`);
  }
}

/* ---------------------------------------------------------------------
   3bis · LA ESCALA SALE DE LA COLUMNA QUE MENOS SITIO TIENE

   Los huecos entre nodos son fijos, así que una columna de SEIS nodos
   tiene menos alto libre que una de UNO para el mismo total. Si la
   escala se tomara de una columna cualquiera —la última que se mire,
   por decir— la otra se saldría por abajo.

   Lo destapó una mutación: cambiar `Math.min` por la escala de la
   última columna salía VERDE, porque en el caso de la maqueta las tres
   columnas tienen casi los mismos nodos. Este caso las descuadra a
   propósito.
   ------------------------------------------------------------------ */
{
  const seis = armarSankey({
    columnas: [
      [C("a", 100), C("b", 100), C("c", 100), C("d", 100), C("e", 100), C("f", 100)],
      [C("p", 600)],
      [C("z", 600)],
    ],
    tramos: [
      ...["a", "b", "c", "d", "e", "f"].map((x) => ({ de: x, a: "p", valor: 100 })),
      { de: "p", a: "z", valor: 600 },
    ],
  }, 1160, 500);
  for (const n of seis.nodos) {
    ok(n.y + n.alto <= 500.5,
       `con seis nodos en una columna y uno en otra, «${n.id}» termina en ${(n.y + n.alto).toFixed(1)} y el lienzo mide 500`);
  }
  /* Y SIGUEN TODOS A LA MISMA ESCALA: encoger solo la columna apretada
     arreglaría el desborde y rompería la regla 1. */
  const e1 = seis.nodos.find((n) => n.id === "a").alto / 100;
  const e2 = seis.nodos.find((n) => n.id === "p").alto / 600;
  ok(Math.abs(e1 - e2) < 1e-6,
     `la columna apretada quedó a otra escala (${e1.toFixed(4)} contra ${e2.toFixed(4)})`);
}

/* ---------------------------------------------------------------------
   4 · LAS COLUMNAS ESTÁN DONDE VAN, Y EN ORDEN
   ------------------------------------------------------------------ */
{
  const x = (id) => s.nodos.find((n) => n.id === id).x;
  ok(x("estibas") === x("maquina"), "los dos nodos de la primera columna no están alineados");
  ok(x("t1") === x("lineas"), "los dos nodos de la segunda columna no están alineados");
  ok(x("estibas") < x("t1") && x("t1") < x("vidrio"),
     "las columnas no van de izquierda a derecha");
  /* EL ORDEN DENTRO DE LA COLUMNA ES EL DE LOS DATOS, y no lo reordena
     nadie: si el dibujo reacomodara los nodos por su cuenta, una causa
     cambiaría de sitio entre dos visitas sin que los datos cambien y
     nadie sabría si fue el algoritmo o el dato. */
  const est = s.nodos.find((n) => n.id === "estibas");
  const maq = s.nodos.find((n) => n.id === "maquina");
  ok(est.y < maq.y, "la primera columna se reordenó sola");
}

/* ---------------------------------------------------------------------
   5 · LA CINTA LLEVA EL COLOR DE DONDE SALE

   La pregunta de la pantalla es «de qué causa salió»: seguir un color
   desde la izquierda es como se lee.
   ------------------------------------------------------------------ */
{
  const c = s.cintas.find((x) => x.de === "maquina" && x.a === "t1");
  ok(c.color === "#E4002B",
     `la cinta de «falla de máquina» sale color ${c.color} y debe salir el de su causa`);
}

/* ---------------------------------------------------------------------
   6 · UN NODO CHIQUITO NO DESAPARECE

   «Líneas» son 30 unidades contra 4200 de T1: a escala pura mide medio
   píxel. «No se ve» y «no existe» son dos cosas distintas que en un
   dibujo se ven igual.
   ------------------------------------------------------------------ */
{
  /* SE PRUEBA CON UNO DE VERDAD CHICO. «Líneas» son 30 contra 4200 y a
     escala pura ya mide 3 px: con ese, quitar el piso no cambia nada y
     la mutación salía VERDE. Dos unidades contra cuatro mil sí lo
     prueba — y es el caso real del primer día de un proceso nuevo. */
  const chico = armarSankey({
    columnas: [[C("gordo", 4200), C("pulga", 2)],
               [C("uno", 4202)],
               [C("fin", 4202)]],
    tramos: [{ de: "gordo", a: "uno", valor: 4200 },
             { de: "pulga", a: "uno", valor: 2 },
             { de: "uno", a: "fin", valor: 4202 }],
  }, 1160, 500);
  const p = chico.nodos.find((n) => n.id === "pulga");
  ok(p.alto >= 1.5,
     `un nodo de 2 unidades contra 4200 mide ${p.alto.toFixed(2)} px: desaparece, y «no se ve» no es lo mismo que «no existe»`);
  const c = chico.cintas.find((x) => x.de === "pulga");
  const altoCinta = Math.abs(
    Number(c.d.match(/L\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/)[1])
    - Number(c.d.match(/^M\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/)[1]));
  ok(altoCinta >= 1.5,
     `la cinta de 2 unidades mide ${altoCinta.toFixed(2)} px de grosor: no se ve`);

  const l = s.nodos.find((n) => n.id === "lineas");
  ok(l.alto >= 1.5, `el nodo chico mide ${l.alto.toFixed(2)} px: desaparece`);
}

/* ---------------------------------------------------------------------
   7 · CON UNA SOLA CAUSA, Y CON NINGUNA, NO REVIENTA

   Es el primer día del módulo y el día que alguien filtre hasta dejar
   una sola: las dos pantallas tienen que seguir dibujándose.
   ------------------------------------------------------------------ */
{
  const uno = armarSankey({
    columnas: [[C("a", 10)], [C("b", 10)], [C("c", 10)]],
    tramos: [{ de: "a", a: "b", valor: 10 }, { de: "b", a: "c", valor: 10 }],
  }, 1160, 500);
  ok(uno.nodos.length === 3, "con una sola causa el diagrama pierde nodos");
  ok(uno.nodos.every((n) => n.alto > 0 && n.y + n.alto <= 500.5),
     "con una sola causa algún nodo se sale o mide cero");

  const vacio = armarSankey({ columnas: [[], [], []], tramos: [] }, 1160, 500);
  ok(vacio.nodos.length === 0 && vacio.cintas.length === 0,
     "el diagrama vacío inventa algo");
}

/* ---------------------------------------------------------------------
   8 · «OTROS» JUNTA, NO CORTA

   Cortar la cola cambiaría el total del diagrama, y entonces el dibujo
   diría una cifra y el KPI de arriba otra.
   ------------------------------------------------------------------ */
{
  const filas = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: "c" + i, valor: i * 10 }));
  const total = filas.reduce((a, f) => a + f.valor, 0);
  const { filas: quedan, juntados } = masGrandes(filas, 4);
  ok(quedan.length === 4, `quedaron ${quedan.length} y se pidieron 4`);
  ok(quedan.reduce((a, f) => a + f.valor, 0) === total,
     "al juntar en «otros» se perdieron unidades: el dibujo va a decir otra cifra que el KPI");
  ok(juntados === 5, `dice que juntó ${juntados} y fueron 5`);
  ok(quedan[0].valor >= quedan[1].valor, "no quedaron ordenados de mayor a menor");
  /* Y si caben todos, no se inventa un «otros» de cero. */
  const pocos = masGrandes(filas.slice(0, 3), 6);
  ok(pocos.juntados === 0 && pocos.filas.length === 3,
     "con menos filas que el tope igual se armó un «otros»");
}

/* ---------------------------------------------------------------------
   9 · EL DIBUJO: que el SVG diga lo que dice la geometría

   La aritmética ya está probada arriba, sin navegador. Lo que falta
   comprobar es que el componente PINTE eso y no otra cosa: que cada
   nodo tenga su barra del alto que le toca, que el texto de la última
   columna no se salga por la derecha, y que las cintas vayan DEBAJO de
   las barras —al revés, una cinta gorda tapa la barra de la que sale—.
   ------------------------------------------------------------------ */
{
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = (await import("react")).default;
  const { buildSync: bs } = await import("esbuild");
  /* SE ESCRIBE UN ARCHIVO DE VERDAD y no un `data:` URL: un data URL
     no puede resolver `react/jsx-runtime` —no tiene desde dónde buscar
     node_modules— y el arnés muere con «Invalid relative URL». */
  const { writeFileSync: escribir } = await import("node:fs");
  bs({
    entryPoints: [R("src/app/(app)/roturas/en-sitio/analisis/Recorrido.tsx")],
    outfile: R(".arnes/_rq-dibujo.mjs"),
    bundle: true, format: "esm", jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
    alias: { "@": R("src") }, logLevel: "silent",
  });
  const { Recorrido } = await import(R(".arnes/_rq-dibujo.mjs"));

  const html = renderToStaticMarkup(React.createElement(Recorrido, { s, total: 4230 }));

  /* UNA BARRA POR NODO, DEL ALTO QUE DICE LA GEOMETRÍA. */
  const rects = [...html.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g)]
    .map((m) => ({ y: Number(m[1]), h: Number(m[2]) }));
  ok(rects.length === s.nodos.length,
     `el dibujo pinta ${rects.length} barras y la geometría tiene ${s.nodos.length} nodos`);
  for (const n of s.nodos) {
    const r = rects.find((x) => Math.abs(x.h - n.alto) < 0.01 && Math.abs(x.y - n.y) < 0.01);
    ok(!!r, `el nodo «${n.id}» (y=${n.y.toFixed(1)} alto=${n.alto.toFixed(1)}) no está pintado`);
  }

  /* LAS CINTAS VAN ANTES QUE LAS BARRAS EN EL MARCADO: en SVG lo que
     se pinta después queda encima. */
  /* PRIMERO SE EXIGE QUE HAYA CINTAS. `indexOf` devuelve -1 cuando no
     encuentra, y -1 siempre es menor que cualquier índice: sin esta
     línea, un dibujo SIN NINGUNA CINTA pasaba la comprobación de que
     «las cintas van primero». Lo destapó una mutación que borraba las
     cintas enteras y salía VERDE. */
  const cintasPintadas = (html.match(/<path/g) ?? []).length;
  ok(cintasPintadas === s.cintas.length,
     `el dibujo pinta ${cintasPintadas} cintas y la geometría tiene ${s.cintas.length}`);
  ok(cintasPintadas > 0 && html.indexOf("<path") < html.indexOf("<rect"),
     "las barras se pintan antes que las cintas: una cinta gorda va a tapar la barra de la que sale");

  /* EL TEXTO DE LA ÚLTIMA COLUMNA VA A LA IZQUIERDA de su barra y
     anclado al final: a la derecha se saldría del lienzo de 1160. */
  const fin = s.nodos.find((n) => n.col === 2);
  const m = html.match(new RegExp(`<text x="([-\\d.]+)"[^>]*text-anchor="end"`));
  ok(!!m, "el rótulo de la última columna no está anclado a la derecha: se sale del lienzo");
  ok(m && Number(m[1]) < fin.x,
     `el rótulo de la última columna arranca en ${m && m[1]} y su barra está en ${fin.x}: queda encima o fuera`);

  /* Y NINGÚN TEXTO SE SALE. Es lo que pasa si alguien cambia el ancla
     y no mira: el nombre queda cortado por el borde del SVG. */
  const textos = [...html.matchAll(/<text x="([-\d.]+)"[^>]*text-anchor="(\w+)"/g)];
  for (const [, x, ancla] of textos) {
    if (ancla === "start") ok(Number(x) >= 0 && Number(x) < s.ancho,
      `un rótulo arranca en ${x} y el lienzo va de 0 a ${s.ancho}`);
    else ok(Number(x) > 0 && Number(x) <= s.ancho,
      `un rótulo termina en ${x} y el lienzo va de 0 a ${s.ancho}`);
  }

  /* Y CON CERO NODOS NO SE PINTA UN SVG VACÍO: se dice que no hay
     datos, que es distinto de un recuadro en blanco. */
  const nada = renderToStaticMarkup(React.createElement(Recorrido, {
    s: armarSankey({ columnas: [[], [], []], tramos: [] }, 1160, 300), total: 0,
  }));
  ok(!nada.includes("<svg"), "sin datos se pinta un SVG vacío en vez de decir que no hay nada");
  ok(/Sin datos/.test(nada), "sin datos no se dice que no hay datos");
}

/* ---------------------------------------------------------------------
   10 · LOS DOS COLORES DE LA CAUSA SE DISTINGUEN, EN LOS SIETE TEMAS

   El diagrama existe para separar lo que ASUME el OL de lo que no.
   La primera versión usaba `--rt-oro` para «asumida» — el acento de la
   app — y en el tema OFICIAL de Bavaria ese acento ES EL ROJO: las dos
   causas salían exactamente del mismo color y el dibujo perdía lo
   único que venía a decir. Se vio MIRANDO la captura; el arnés pasaba.

   Esto es lo que lo convierte en una falla: se mide la distancia entre
   los dos colores, y se exige que ninguno sea un token de tema.
   ------------------------------------------------------------------ */
{
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  ok(/^#[0-9A-Fa-f]{6}$/.test(COLOR_ASUMIDA) && /^#[0-9A-Fa-f]{6}$/.test(COLOR_NO_ASUMIDA),
     "los colores de la causa son tokens del tema: en el tema oficial el acento ES el rojo y las dos causas salen iguales");
  const [r1, g1, b1] = rgb(COLOR_ASUMIDA);
  const [r2, g2, b2] = rgb(COLOR_NO_ASUMIDA);
  /* Distancia euclídea en RGB: burda, pero suficiente para lo que se
     está frenando —que sean EL MISMO color— y no hace falta más. */
  const d = Math.round(Math.hypot(r1 - r2, g1 - g2, b1 - b2));
  ok(d >= 90,
     `«asumida» y «no asumida» se parecen demasiado (distancia ${d}): es la única distinción que el dibujo viene a hacer`);
  /* Y EL DE «NO ASUMIDA» TIRA A ROJO, que es lo que la gente lee como
     alarma sin que nadie se lo explique. */
  ok(r2 > g2 + 120 && r2 > b2 + 120,
     `el color de «no asumida» no se lee como alarma: ${COLOR_NO_ASUMIDA}`);
}

/* ---------------------------------------------------------------------
   11 · LOS RÓTULOS NO SE MONTAN UNO SOBRE OTRO

   El rótulo son tres líneas —nombre, cifra y pie— y ocupa hasta y+58.
   Con el hueco de 14 px que tenía, dos nodos chicos seguidos escribían
   uno encima del otro: se vio «Líneas 30» montado sobre el borde de la
   caja. El hueco no es aire, es el sitio del texto.
   ------------------------------------------------------------------ */
{
  const chicos = armarSankey({
    columnas: [
      [C("g", 4000), C("p1", 3), C("p2", 3), C("p3", 3)],
      [C("u", 4009)],
      [C("f", 4009)],
    ],
    tramos: [
      ...["g", "p1", "p2", "p3"].map((x, i) => ({ de: x, a: "u", valor: [4000, 3, 3, 3][i] })),
      { de: "u", a: "f", valor: 4009 },
    ],
  }, 1160, 620);

  const col0 = chicos.nodos.filter((n) => n.col === 0).sort((a, b) => a.y - b.y);
  for (let i = 1; i < col0.length; i++) {
    const anterior = col0[i - 1];
    /* El rótulo del de arriba llega hasta su y+58; el de abajo empieza
       en su propio y. Si el de abajo arranca antes, se escriben encima. */
    ok(col0[i].y >= anterior.y + 58,
       `el rótulo de «${anterior.id}» llega a ${(anterior.y + 58).toFixed(0)} y «${col0[i].id}» arranca en ${col0[i].y.toFixed(0)}: se montan`);
  }
  for (const n of chicos.nodos) {
    ok(n.y + n.alto <= 620.5,
       `con cuatro nodos y rótulo de tres líneas, «${n.id}» se sale por abajo`);
    /* Y EL RÓTULO TAMPOCO. El texto llega hasta y+58: si el lienzo
       termina en el borde de la barra, ese rótulo sale colgando por
       debajo de la caja. Pasó con «Líneas 30». */
    ok(n.y + 58 <= 620.5,
       `el rótulo de «${n.id}» se escribe en ${(n.y + 58).toFixed(0)} y el lienzo mide 620: sale colgando`);
  }
}

if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("✓ El recorrido: las tres columnas van a la MISMA escala, lo que sale de cada nodo suma su alto y lo que entra también —el dibujo no pierde ni inventa unidades—, nada se sale del lienzo, el orden es el de los datos y no lo reacomoda nadie, la cinta lleva el color de donde SALE, un nodo de 30 contra uno de 4200 no desaparece, y «otros» junta en vez de cortar.");
