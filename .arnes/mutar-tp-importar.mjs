/* =====================================================================
   ¿EL ARNÉS DE IMPORTAR CAZA DE VERDAD LO QUE DICE CAZAR?

   Un arnés en verde no prueba nada por sí solo: prueba que no encontró
   lo que buscó, y buscar mal también sale verde. Aquí se le vuelve a
   meter CADA error que el arnés afirma cazar, uno por uno, y se exige
   que se ponga rojo. El que no se ponga rojo es una afirmación que la
   pantalla no tiene.

   DOS REGLAS QUE ESTE PROYECTO APRENDIÓ A GOLPES:

   · `str.replace` NO AVISA cuando no encuentra nada: escribe el archivo
     idéntico y el arnés aprueba lo mismo de siempre. Por eso cada
     mutación comprueba que DE VERDAD cambió el archivo.

   · La mutación tiene que romper LO QUE LA AFIRMACIÓN DICE MEDIR. Un
     error cazado por otra cosa —por el compilador, por otra prueba— no
     demuestra que esa afirmación sirva para algo.
   ===================================================================== */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const U = (p) => new URL(p, import.meta.url);
const IMP = U("../src/app/(app)/traspasos/cruce/Importar.tsx");
const CSS = U("../src/app/(app)/traspasos/cruce/importar.css");
const REG = U("../src/modulos/registro.ts");
const CTL = U("../src/app/(app)/traspasos/control/page.tsx");
const DIF = U("../src/app/(app)/traspasos/control/Diferencias.tsx");
const DAT = U("../src/modulos/traspasos/datos.ts");

const COPIA = new Map();
for (const f of [IMP, REG, CTL, CSS, DIF, DAT]) {
  const b = new URL(f.href + ".bak");
  copyFileSync(f, b); COPIA.set(f, b);
}
const restaurar = () => { for (const [f, b] of COPIA) copyFileSync(b, f) };
process.on("exit", () => { for (const [, b] of COPIA) { try { unlinkSync(b) } catch {} } });

/* Rojo = el arnés falló, que es lo que se busca en una mutación. */
function corre(cual = "./tp-importar.mjs") {
  try { execFileSync("node", [U(cual).pathname], { stdio: "pipe" }); return null }
  catch (e) { return String(e.stderr ?? "") + String(e.stdout ?? "") }
}
const MIDE = "./tp-importar-mide.mjs";

const cambia = (f, de, a) => {
  const antes = readFileSync(f, "utf8");
  const despues = antes.replace(de, a);
  if (despues === antes) throw new Error(`la mutación no aplicó en ${f.pathname}: ${de}`);
  writeFileSync(f, despues);
};

const MUTACIONES = [
  {
    n: "1 · el encabezado vuelve a ser SIEMPRE la primera fila",
    espera: /^\s*·\s*1[b-z]?\(/m,
    hacer: () => cambia(IMP, "for (let i = 0; i < Math.min(MIRAR, crudo.length); i++) {",
                             "for (let i = 0; i < Math.min(1, crudo.length); i++) {"),
  },
  {
    n: "2 · nunca se dice que falte una columna obligatoria",
    espera: /^\s*·\s*2[b-z]?\(/m,
    hacer: () => cambia(IMP, "const faltan = COLUMNAS.filter((c) => c.obliga && cab.donde[c.clave] === undefined);",
                             "const faltan = COLUMNAS.filter(() => false);"),
  },
  {
    n: "3 · se dejan de pelar las tildes (SAP escribe «Almacén», «ALMACEN», «Almacen»)",
    espera: /^\s*·\s*3[b-z]?\(/m,
    hacer: () => cambia(IMP, '.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")', ""),
  },
  {
    n: "4 · la cantidad vuelve a limpiarse a manotazos",
    espera: /^\s*·\s*4[a-z]?\(/m,
    hacer: () => cambia(IMP, "        cantidad: aNumero(r[cab.donde.cantidad]),",
      '        cantidad: String(r[cab.donde.cantidad] ?? "0").replace(/[^\\d.,-]/g, "").replace(",", "."),'),
  },
  {
    n: "5 · las filas en blanco se saltan al leer (los números de fila dejan de ser los del Excel)",
    espera: /^\s*·\s*5b\(/m,
    hacer: () => cambia(IMP, "header: 1, blankrows: true, defval: null, raw: true,",
                             "header: 1, blankrows: false, defval: null, raw: true,"),
  },
  {
    n: "6 · la fila en blanco vuelve a contar como descarte",
    espera: /^\s*·\s*5a\(/m,
    hacer: () => cambia(IMP, '      if (r.every((c) => c == null || String(c).trim() === "")) continue;', ""),
  },
  {
    n: "7 · se vuelve a escoger la primera hoja con datos",
    espera: /^\s*·\s*7[b-z]?\(/m,
    hacer: () => cambia(IMP, "    if (p > puntos) { puntos = p; mejor = l }",
                             "    if (mejor === null) { puntos = p; mejor = l }"),
  },
  {
    n: "8 · la regla de agrupar se cuela en la pantalla",
    espera: /^\s*·\s*8[b-z]?\(/m,
    hacer: () => cambia(IMP, "  const listo = !!leido && !leido.faltan.length && leido.filas.length > 0;",
      "  const neto = (leido?.filas ?? []).reduce((a, f) => a + Number(f.cantidad), 0);\n"
      + "  void neto;\n"
      + "  const listo = !!leido && !leido.faltan.length && leido.filas.length > 0;"),
  },
  {
    n: "9 · se renombra la ruta junto con el nombre visible (y los permisos se pierden en silencio)",
    espera: /^\s*·\s*9[b-z]?\(/m,
    hacer: () => cambia(REG, '{ nombre: "Importar", ruta: "/traspasos/cruce" }',
                             '{ nombre: "Importar", ruta: "/traspasos/importar" }'),
  },
  {
    n: "10 · las diferencias suben por encima de la tabla en vez de quedarse al pie",
    espera: /^\s*·\s*9e\(/m,
    hacer: () => {
      const s = readFileSync(CTL, "utf8");
      const i = s.indexOf("      {!cruce.falta && (");
      const j = s.indexOf("      )}", i) + "      )}\n".length;
      if (i < 0 || j <= i) throw new Error("no se encontró el bloque de diferencias");
      const bloque = s.slice(i, j);
      const arriba = s.indexOf("      {/* 4 ─ EL DETALLE */}");
      if (arriba < 0) throw new Error("no se encontró el detalle");
      const sin = s.slice(0, i) + s.slice(j);
      const k = sin.indexOf("      {/* 4 ─ EL DETALLE */}");
      const fuera = sin.slice(0, k) + bloque + sin.slice(k);
      if (fuera === s) throw new Error("la mutación no aplicó");
      writeFileSync(CTL, fuera);
    },
  },

  /* ── Y LO QUE SE VE. Esas afirmaciones se comprueban con el otro
        arnés, así que la mutación tiene que decir con cuál. ───────── */
  {
    n: "11 · la explicación de por qué está apagado el botón se vuelve gris claro",
    arnes: MIDE,
    espera: /«por qué está apagado el botón»/,
    hacer: () => cambia(CSS, "  font-size: 12.5px; font-weight: 600; color: var(--tp-mal); min-width: 0; line-height: 1.45;",
                             "  font-size: 12.5px; font-weight: 600; color: #B9B9B9; min-width: 0; line-height: 1.45;"),
  },
  {
    n: "12 · la ficha de columna encontrada usa la tinta del tema sobre un blanco escrito a mano",
    arnes: MIDE,
    espera: /«la columna que sí se encontró»|«el título de la columna encontrada»/,
    hacer: () => cambia(CSS, "  font-size: 12.5px; background: var(--tp-papel); color: var(--tp-tinta);",
                             "  font-size: 12.5px; background: var(--tp-papel); color: #EDEDEA;"),
  },
  {
    n: "13 · la columna de pasos deja de encogerse y la página se va de lado",
    arnes: MIDE,
    espera: /la página se va de lado/,
    hacer: () => cambia(CSS, "@media (max-width: 1040px) {\n  .tp .cz-duo { grid-template-columns: minmax(0, 1fr) }\n}",
                             "@media (max-width: 1040px) {\n  .tp .cz-duo { grid-template-columns: 900px 360px }\n}"),
  },
  {
    n: "14 · el botón de importar deja de ser de dedo en el celular",
    arnes: MIDE,
    espera: /el botón de importar quedó en/,
    hacer: () => cambia(CSS, "  height: 48px; padding: 0 24px; border: 0; border-radius: 8px; flex: none;",
                             "  height: 30px; padding: 0 24px; border: 0; border-radius: 8px; flex: none;"),
  },
  /* ── EL SEGUNDO CONTROL ──────────────────────────────────────── */
  {
    n: "16 · el tablero deja de mostrar los viajes registrados sin documento",
    espera: /^\s*·\s*10\(/m,
    hacer: () => cambia(DIF, "          hijos={tablaViajes(sinDocumento, false)} />",
                             "          hijos={null} />"),
  },
  {
    n: "17 · los viajes sin documento se piden a mano y se cuelan los vacíos",
    espera: /^\s*·\s*10b\(/m,
    hacer: () => cambia(DAT, '.eq("fecha", fecha).eq("por_facturar", true)',
                             '.eq("fecha", fecha).is("factura_documento", null)'),
  },
  {
    n: "18 · sin corte importado, el control de «sin documento» desaparece",
    espera: /^\s*·\s*10c\(/m,
    hacer: () => {
      cambia(DIF, "        <Monton\n          cual=\"sindoc\"", "        {hayCorte && (<Monton\n          cual=\"sindoc\"");
      cambia(DIF, "          hijos={tablaViajes(sinDocumento, false)} />", "          hijos={tablaViajes(sinDocumento, false)} />)}");
    },
  },
  {
    n: "19 · el viaje sin documento no dice quién lo registró",
    espera: /^\s*·\s*10d\(/m,
    hacer: () => cambia(DIF, "<td>{quien(nombres, v.registrado_por)}</td>",
                             "<td>{v.registrado_por ?? \"\u2014\"}</td>"),
  },
  {
    n: "15 · el armazón que se mide se queda viejo cuando el componente cambia de clase",
    arnes: MIDE,
    espera: /ARMAZÓN\(/,
    hacer: () => cambia(IMP, 'className="cz-regla"', 'className="cz-reglamento"'),
  },
];

if (corre() !== null || corre(MIDE) !== null) {
  console.error("El arnés ya estaba en rojo ANTES de mutar nada. Arregla eso primero.");
  process.exit(1);
}

const sordas = [];
for (const m of MUTACIONES) {
  /* Atajo para trabajar: `SOLO="ruta" node .arnes/mutar-tp-importar.mjs`
     corre nada más las mutaciones cuyo nombre contenga eso. Va ANTES de
     tocar nada y de apuntar sordas, para que una corrida normal —sin
     SOLO— salga exactamente igual que siempre. */
  if (process.env.SOLO && !m.n.includes(process.env.SOLO)) continue;
  restaurar();
  try { m.hacer() } catch (e) { restaurar(); console.error(`✗ ${m.n}\n   ${e.message}`); process.exit(1) }
  const salida = corre(m.arnes ?? "./tp-importar.mjs");
  if (salida === null) sordas.push(`${m.n}  → el arnés NO se dio cuenta`);
  else if (!m.espera.test(salida)) {
    sordas.push(`${m.n}  → se puso rojo, pero por otra cosa:\n      `
      + salida.trim().split("\n").slice(0, 4).join("\n      "));
  } else {
    console.log(`✓ ${m.n}`);
  }
}
restaurar();

if (sordas.length) {
  console.error("\nAFIRMACIONES QUE NO SE SOSTIENEN:\n  · " + sordas.join("\n  · "));
  process.exit(1);
}
console.log(`\nLas ${MUTACIONES.length} mutaciones se cazaron, cada una por su propia prueba.`);
