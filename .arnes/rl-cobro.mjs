/* =====================================================================
   ROTURAS EN SITIO · LA PLATA QUE SE LE COBRA AL OL

   Es la única parte de este proyecto donde un número equivocado sale de
   la pantalla y entra en una reunión. Así que se mide la CUENTA, con
   números a mano y contra el ejemplo que dio Cristian:

     2182 Pony Malta R 330cc X 30  ·  producto $233,50
     su envase 3500162 Envase Marron 330R  ·  $100,00

     200 rotas        200 × 100,00              =  20.000
     100 contaminadas 100 × (100,00 + 233,50)   =  33.350
                                        total      53.350

   Lo que puede salir mal, y por qué importa:

   1. QUE SUME LO QUE NO SE COBRA. «A cobro» no es «tiene visto bueno»:
      una objetada y resuelta a favor del OL tiene visto bueno y no se
      le cobra. Sumarla da una cifra más grande y más cómoda que nadie
      puede defender.

   2. QUE UN PRECIO QUE FALTA SE SUME COMO CERO. Daría un total corto
      con cara de exacto — la peor clase de número. Tiene que quedar
      fuera y contarse aparte.

   3. QUE LAS DOS FORMAS DE COBRAR SE MEZCLEN. La rota cobra el envase;
      la contaminada, el envase y el producto. Si se suman en una sola
      cifra no hay cómo revisar la cuenta.

   4. QUE LA ANULADA SE COBRE. Anular es decir que esa rotura no debió
      existir.

     node .arnes/rl-cobro.mjs
   ===================================================================== */
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

buildSync({ entryPoints: [R("src/modulos/roturas/cobro.ts")],
  outfile: R(".arnes/_cobro.mjs"), bundle: true, format: "esm", logLevel: "silent" });
const { medirCobro } = await import(R(".arnes/_cobro.mjs") + "?" + Date.now());

/* Los precios del MM60, los de verdad. */
const ENV = 100.00, PROD = 233.50;
let n = 0;
const R0 = (o) => ({
  id: "r" + ++n, codigo: "RB-" + String(n).padStart(4, "0"),
  material: "2182", material_nombre: "Pony Malta R 330cc X 30",
  tipo: "producto_terminado", causa: "estibas_malas",
  causa_nombre: "Estibas en mal estado", grupo: "asumida",
  estado: "cuenta", etapa: "cobro",
  unidades: 0, contaminadas: 0,
  precio_envase: ENV, precio_producto: PROD,
  cobro_rotas: 0, cobro_contaminadas: 0, cobro_total: 0,
  ...o,
});
/* La cuenta de la base, reproducida aquí para armar los casos: si el
   arnés la calculara con la misma función que mide, no mediría nada. */
const pt = (rotas, cont, o = {}) => R0({
  unidades: rotas, contaminadas: cont,
  cobro_rotas: rotas * ENV,
  cobro_contaminadas: cont * (ENV + PROD),
  cobro_total: rotas * ENV + cont * (ENV + PROD),
  ...o,
});

/* =====================================================================
   1 · EL EJEMPLO DE CRISTIAN, NÚMERO POR NÚMERO
   ===================================================================== */
{
  const c = medirCobro([pt(200, 100)]);
  ok(c.rotas === 20000, `las 200 rotas dan ${c.rotas} y son 20.000 (200 × $100)`);
  ok(c.contaminadas === 33350,
     `las 100 contaminadas dan ${c.contaminadas} y son 33.350 (100 × ($100 + $233,50))`);
  ok(c.total === 53350, `el total da ${c.total} y son 53.350`);
  ok(c.aCobro === 1 && c.cobrables === 1 && c.sinPrecio === 0,
     `el conteo salió ${JSON.stringify([c.aCobro, c.cobrables, c.sinPrecio])}`);
}

/* =====================================================================
   2 · SOLO SE SUMA LO QUE ESTÁ A COBRO
   ---------------------------------------------------------------------
   Cuatro roturas idénticas en las cuatro etapas. Solo una se cobra.
   ===================================================================== */
{
  const c = medirCobro([
    pt(10, 0),                                   // a cobro
    pt(10, 0, { etapa: "espera_ol", estado: "esperando" }),
    pt(10, 0, { etapa: "desacuerdo", estado: "esperando" }),
    pt(10, 0, { etapa: "no_cuenta", estado: "no_cuenta" }),
  ]);
  ok(c.aCobro === 1,
     `se están contando ${c.aCobro} roturas a cobro y solo una lo está: «tiene visto bueno» no ` +
     "es «se cobra», y la diferencia es una cifra que nadie puede defender");
  ok(c.total === 1000, `el total da ${c.total} y son 1.000 (solo la que está a cobro)`);
}

/* =====================================================================
   3 · LA ANULADA NO SE COBRA
   ---------------------------------------------------------------------
   Anular es decir que esa rotura no debió existir. Si su etapa quedó en
   'cobro' —porque se anuló después de decidirla— sigue sin cobrarse.
   ===================================================================== */
{
  const c = medirCobro([pt(10, 0), pt(10, 0, { estado: "anulada" })]);
  ok(c.total === 1000,
     `una rotura ANULADA se está cobrando: el total da ${c.total} y son 1.000`);
}

/* =====================================================================
   4 · UN PRECIO QUE FALTA NO SE SUMA COMO CERO
   ---------------------------------------------------------------------
   Es lo que pasa cuando a un material le falta el precio en el maestro.
   Sumarlo como cero da un total corto con cara de exacto.
   ===================================================================== */
{
  const c = medirCobro([
    pt(10, 0),
    R0({ unidades: 50, cobro_rotas: null, cobro_contaminadas: null, cobro_total: null,
         precio_envase: null, material: "9999" }),
  ]);
  ok(c.aCobro === 2, `a cobro hay ${c.aCobro} y son 2`);
  ok(c.cobrables === 1, `se pueden calcular ${c.cobrables} y es 1`);
  ok(c.sinPrecio === 1,
     `las que no se pueden calcular salen ${c.sinPrecio} y es 1: si no se cuentan, el total se ` +
     "queda corto y nadie se entera");
  ok(c.total === 1000,
     `el total da ${c.total} y son 1.000: la que no tiene precio no puede entrar como cero`);
}

/* =====================================================================
   5 · POR CAUSA, DE MAYOR A MENOR Y CUADRANDO CON EL TOTAL
   ===================================================================== */
{
  const c = medirCobro([
    pt(10, 0),                                                    // estibas: 1.000
    pt(5, 0),                                                     // estibas: 500
    /* CON CONTAMINADAS, y eso importa: con todas las filas en cero
       contaminadas, `cobro_rotas` y `cobro_total` valen lo mismo y la
       prueba no distingue una de otra. Una mutación que cambie la
       columna del reparto salía VERDE por eso. */
    pt(30, 4, { causa: "condiciones", causa_nombre: "Condiciones del sitio" }), // 3.000 + 1.334
    pt(2, 0, { causa: "falla_maquinas", causa_nombre: "Falla de las máquinas",
               grupo: "no_asumida" }),                            // 200
  ]);
  ok(c.porCausa.length === 3, `salieron ${c.porCausa.length} causas y son 3`);
  ok(c.porCausa[0].nombre === "Condiciones del sitio" && c.porCausa[0].valor === 4334,
     `la primera causa es ${JSON.stringify(c.porCausa[0])} y debe ser Condiciones del sitio con ` +
     "4.334: 30 rotas ($3.000) más 4 contaminadas ($1.334)");
  ok(c.porCausa[1].valor === 1500,
     `«Estibas en mal estado» da ${c.porCausa[1].valor} y son 1.500: las dos roturas juntas`);
  /* QUE EL REPARTO SUME EL TOTAL. Si no cuadran, una de las dos cifras
     de la pantalla está mal y las dos se ven igual de bien. */
  const suma = c.porCausa.reduce((s, x) => s + x.valor, 0);
  ok(suma === c.total,
     `el reparto por causa suma ${suma} y el total dice ${c.total}: dos cifras de la misma ` +
     "pantalla que no cuadran entre ellas");
  /* Y QUE EL GRUPO VIAJE: la no asumida se pinta en rojo porque es plata
     que alguien va a discutir. */
  ok(c.porCausa.some((x) => x.grupo === "no_asumida"),
     "el reparto por causa perdió de quién es cada una");
}

/* =====================================================================
   6 · SIN NADA A COBRO, CERO Y NO UN HUECO
   ===================================================================== */
{
  const c = medirCobro([pt(10, 0, { etapa: "espera_ol", estado: "esperando" })]);
  ok(c.total === 0 && c.aCobro === 0 && c.porCausa.length === 0,
     `sin nada a cobro salió ${JSON.stringify(c)}`);
}

if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ El cobro al OL: 200 rotas y 100 contaminadas del 2182 dan $53.350 repartidos en " +
            "$20.000 de envase y $33.350 de envase más producto; solo se suma lo que está a " +
            "cobro —ni lo que espera, ni lo anulado—, un precio que falta se cuenta aparte en vez " +
            "de entrar como cero, y el reparto por causa cuadra con el total.");
