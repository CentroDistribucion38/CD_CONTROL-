/* =====================================================================
   EL PARETO DE ROTURAS EN SITIO — causa, área y OPM.

   Un Pareto no es un ranking con una línea encima: contesta CUÁNTAS hay
   que atacar para tapar la mayor parte, y esa respuesta es un número
   —«3 de 7 son el 80 %»— que es lo único que cambia lo que alguien hace
   el lunes.

   Lo que puede salir mal:

   1. QUE `hasta80` MIENTA. Es LA cifra: si dice 3 y son 5, alguien
      ataca tres cosas y se queda a mitad de camino creyendo que
      terminó. Y se cuenta sobre el acumulado REAL, no sobre los
      porcentajes redondeados — con ocho barras, ocho redondeos pueden
      dar 79 o 101.

   2. QUE «SIN DATO» SE MEZCLE CON LAS DEMÁS. Una rotura sin área no es
      una causa que se pueda atacar: es un registro que hay que
      arreglar. Puesta arriba se lee como si fuera el problema
      principal.

   3. QUE «OTROS» SE CORTE EN VEZ DE JUNTARSE. Cortar la cola cambia el
      total y entonces el acumulado no llega al 100 %.

   4. QUE UNA PLATA QUE FALTA SE SUME COMO CERO. Al material le falta el
      precio en el maestro: media cifra con cara de entera es peor que
      ninguna.

     node .arnes/rl-pareto.mjs
   ===================================================================== */
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

buildSync({ entryPoints: [R("src/modulos/roturas/pareto.ts")],
  outfile: R(".arnes/_pareto.mjs"), bundle: true, format: "esm", logLevel: "silent" });
const { pareto } = await import(R(".arnes/_pareto.mjs") + "?" + Date.now());

const f = (nombre, valor, plata = 0) => ({ nombre, valor, plata });

/* =====================================================================
   1 · LA RESPUESTA: CUÁNTAS HACEN FALTA PARA EL 80 %
   ---------------------------------------------------------------------
   60 + 25 = 85 de 100. Dos barras bastan; la tercera ya está de más.
   ===================================================================== */
{
  const p = pareto([f("A", 60), f("B", 25), f("C", 10), f("D", 5)]);
  ok(p.total === 100, `el total dio ${p.total} y son 100`);
  ok(p.hasta80 === 2,
     `dice que hacen falta ${p.hasta80} y son 2: 60 + 25 = 85. Si esta cifra miente, alguien ` +
     "ataca de menos y se queda a mitad de camino creyendo que terminó");
  ok(p.barras.map((b) => b.nombre).join() === "A,B,C,D",
     `no quedaron de mayor a menor: ${p.barras.map((b) => b.nombre)}`);
  ok(p.barras.at(-1).acumulado === 100,
     `el acumulado de la última dice ${p.barras.at(-1).acumulado} y tiene que ser 100`);
}

/* UNA SOLA QUE SE LO LLEVA TODO: hace falta una, no cero. */
{
  const p = pareto([f("A", 90), f("B", 10)]);
  ok(p.hasta80 === 1, `con una del 90 % dice ${p.hasta80} y es 1`);
}
/* Y TODAS IGUALES: hacen falta casi todas, que es lo que un Pareto
   plano viene a decir — aquí no hay pocas cosas que arreglar. */
{
  const p = pareto([f("A", 10), f("B", 10), f("C", 10), f("D", 10), f("E", 10)]);
  ok(p.hasta80 === 4,
     `con cinco iguales dice ${p.hasta80} y son 4: un Pareto plano avisa de que NO hay pocas ` +
     "cosas que arreglar, y esa es información");
}

/* EL REDONDEO NO DECIDE, Y HAY QUE PONERLO EN EL FILO PARA VERLO.
   400 + 398 de 1.000 es 79,8 % — todavía NO llega al 80 %, hacen falta
   tres. Pero redondeado ese 79,8 se enseña como «80 %», y quien cuente
   sobre la columna redondeada dirá dos. Un caso más cómodo (tres tercios,
   por ejemplo) da lo mismo por las dos vías y no delata nada. */
{
  const p = pareto([f("A", 400), f("B", 398), f("C", 200), f("D", 2)]);
  ok(p.hasta80 === 3,
     `en el filo dice ${p.hasta80} y son 3: 400 + 398 es 79,8 % y todavía no llega al 80 %, ` +
     "aunque la columna del acumulado lo enseñe redondeado como «80 %»");
  ok(p.barras[1].acumulado === 80,
     `y la columna sí enseña ${p.barras[1].acumulado} %: el redondeo es para leer, no para decidir`);
  ok(p.barras.at(-1).acumulado === 100,
     `el acumulado de la última dice ${p.barras.at(-1).acumulado}`);
}
/* Tres tercios: que el acumulado cierre en 100 aunque 33+33+33 = 99. */
{
  const p = pareto([f("A", 1), f("B", 1), f("C", 1)]);
  ok(p.barras.at(-1).acumulado === 100,
     `el acumulado de la última dice ${p.barras.at(-1).acumulado} con tres tercios`);
}

/* =====================================================================
   2 · «SIN DATO» VA AL FINAL Y SE LLAMA POR SU NOMBRE
   ---------------------------------------------------------------------
   Aunque pese más que todas. No es una causa que se pueda atacar: es un
   registro al que le falta un campo.
   ===================================================================== */
{
  const p = pareto([f(null, 500), f("A", 100), f("  ", 50), f("B", 30)]);
  const ult = p.barras.at(-1);
  ok(ult.nombre === "Sin dato" && ult.clase === "sinDato",
     `«sin dato» quedó como ${JSON.stringify(ult)} y tiene que ir al final y llamarse así: ` +
     "arriba se lee como si fuera el problema principal");
  ok(ult.valor === 550, `los dos sin nombre son 550 juntos y dieron ${ult.valor}`);
  ok(p.barras[0].nombre === "A",
     `arriba quedó «${p.barras[0].nombre}» y tiene que ser la mayor CON nombre`);
}

/* =====================================================================
   3 · LA COLA SE JUNTA, NO SE CORTA
   ===================================================================== */
{
  const muchas = Array.from({ length: 12 }, (_, i) => f("C" + i, 12 - i));
  const p = pareto(muchas, 5);
  ok(p.barras.length === 5, `con tope 5 salieron ${p.barras.length} barras`);
  ok(p.barras.at(-1).nombre === "Otros" && p.barras.at(-1).clase === "otros",
     `la última tiene que ser «Otros» y es ${JSON.stringify(p.barras.at(-1))}`);
  const suma = p.barras.reduce((s, b) => s + b.valor, 0);
  ok(suma === p.total,
     `las barras suman ${suma} y el total dice ${p.total}: cortar la cola cambia el total y el ` +
     "acumulado deja de llegar al 100 %");
  ok(p.barras.at(-1).acumulado === 100, "el acumulado no llega al 100 % con «otros»");
  ok(p.juntados === 8, `se juntaron ${p.juntados} y son 8`);
}

/* «SIN DATO» NUNCA SE JUNTA EN «OTROS», por chico que sea. */
{
  const muchas = [...Array.from({ length: 12 }, (_, i) => f("C" + i, 12 - i)), f(null, 1)];
  const p = pareto(muchas, 5);
  ok(p.barras.some((b) => b.clase === "sinDato"),
     "«sin dato» se fue dentro de «otros»: son dos cosas distintas —«varias pequeñas» y «no se " +
     "sabe»— y la segunda es la que hay que ir a arreglar al registro");
}

/* =====================================================================
   4 · UNA PLATA QUE FALTA DEJA LA SUMA EN NULO
   ===================================================================== */
{
  const p = pareto([
    { nombre: "A", valor: 10, plata: 1000 },
    { nombre: "A", valor: 10, plata: null },
    { nombre: "B", valor: 5, plata: 500 },
    { nombre: "B", valor: 5, plata: 250 },
  ]);
  const a = p.barras.find((b) => b.nombre === "A");
  const b = p.barras.find((b) => b.nombre === "B");
  ok(a.plata === null,
     `a «A» le falta el precio de una y su plata dice ${a.plata}: sumarla como 1.000 es media ` +
     "cifra con cara de entera");
  ok(b.plata === 750, `«B» tiene las dos y da ${b.plata}, que son 750`);
}

/* =====================================================================
   5 · SIN NADA, NADA — Y NO UN HUECO NI UNA DIVISIÓN POR CERO
   ===================================================================== */
{
  const p = pareto([]);
  ok(p.barras.length === 0 && p.total === 0 && p.hasta80 === 0,
     `sin filas salió ${JSON.stringify(p)}`);
  const q = pareto([f("A", 0), f("B", 0)]);
  ok(q.barras.length === 0 && q.total === 0, `con todo en cero salió ${JSON.stringify(q)}`);
}

if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ El Pareto: ordena de mayor a menor y dice CUÁNTAS hacen falta para el 80 % —la " +
            "cifra que se viene a buscar—, contándolo sobre el acumulado real y no sobre " +
            "porcentajes redondeados; «sin dato» va al final y con su nombre porque es un " +
            "registro que arreglar y no una causa que atacar; la cola se junta en «otros» sin " +
            "cambiar el total; y una plata que falta deja la suma en nulo en vez de entrar como " +
            "cero.");
