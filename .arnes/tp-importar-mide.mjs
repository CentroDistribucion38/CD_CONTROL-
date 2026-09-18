/* =====================================================================
   IMPORTAR — LO QUE SE VE, MEDIDO EN LOS SIETE TEMAS Y EN CUATRO ANCHOS

   QUÉ PUEDE SALIR MAL AQUÍ Y NO SE VE MIRÁNDOLO UNA VEZ:

   1. QUE LA PÁGINA SE VAYA DE LADO. Esta pantalla es de dos columnas y
      la de la derecha va a 360 px fijos. En una tableta eso deja a la
      izquierda sin ancho y algo se sale; y si la que se desplaza es la
      PÁGINA, el menú queda inalcanzable mientras se mira el botón.

   2. QUE «POR QUÉ ESTÁ APAGADO EL BOTÓN» NO SE LEA. Es lo único que
      contesta la pregunta del que subió un archivo y no pasa nada. Es
      rojo sobre el fondo gris del pie —dos tokens distintos— y en
      ninguno de los siete temas puede bajar de 4,5.

   3. QUE EL BOTÓN NO SE LEA. Va con el acento del tema y su tinta
      pareja; la pareja la garantiza la app, pero el botón APAGADO usa
      otros dos tokens que nadie emparejó.

   4. QUE LOS PASOS SE DISTINGAN. El paso activo lleva el acento y el
      hecho el verde: si el número no se lee encima, no dicen nada.

   5. QUE LA FICHITA DEL EJEMPLO SE LEA. Es ámbar sobre casi negro
      escrito a mano —no sale del tema— justamente porque el tema no
      garantiza esa pareja; escrito a mano hay que medirlo.

   6. QUE EL BOTÓN SIGA SIENDO DE DEDO EN EL CELULAR: 44 px.

   OJO CON LO QUE ESTO MIDE: mide el CSS con el armazón de la pantalla,
   no el JSX. Un cambio de clases en el componente que no se refleje
   aquí pasaría sin verse — por eso las clases se listan abajo y el
   arnés de al lado (tp-importar.mjs) es el que comprueba la lógica.
   ===================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const U = (p) => new URL(p, import.meta.url);
const glob = readFileSync(U("../src/app/globals.css"), "utf8");
const tp = readFileSync(U("../src/app/(app)/traspasos/traspasos.css"), "utf8");
const imp = readFileSync(U("../src/app/(app)/traspasos/cruce/importar.css"), "utf8");
const tsx = readFileSync(U("../src/app/(app)/traspasos/cruce/Importar.tsx"), "utf8");

const TEMAS = [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const ANCHOS = [[1440, "pc"], [1024, "portátil"], [820, "tableta"], [390, "celular"], [360, "360"]];

/* LAS CLASES QUE EL COMPONENTE USA DE VERDAD. Si el armazón de abajo se
   queda viejo, este cotejo lo dice en vez de medir una pantalla que ya
   no existe. */
const DEL_COMPONENTE = [...tsx.matchAll(/className=\{?"([^"{}]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/))
  .filter((c) => c.startsWith("cz-"));

const ARMAZON = `
<div class="tp">
 <section class="cabeza-ctl"><div>
   <p class="ojo">TRASPASOS · SAP</p><h1>Importar</h1>
   <p class="sub">El corte de SAP contra lo que se registró. Sirve para ver <b>qué documentos
   salieron y nadie registró</b> — y eso sale al pie de Control, no aquí.</p>
 </div></section>
 <div class="cz-duo">
  <section class="cz-caja">
   <div class="cz-h"><h2>Corte de SAP</h2>
     <p>El Excel tal como sale. Las columnas se leen por su nombre y el encabezado se busca en
     las primeras filas, así que el orden no importa.</p></div>
   <div class="cz-c">
     <div class="cz-arch">
       <span class="ic"><svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/></svg></span>
       <div><b>BASE DE DATOS GENESIS AGOSTO 2026.xlsx</b>
         <span>1,8 MB · hoja «Sheet1» · encabezado en la fila 4</span></div>
       <button type="button">Cambiar</button>
     </div>
     <div class="cz-lectura">
       <div class="mal"><div class="n">0</div><div class="t">MOVIMIENTOS VÁLIDOS</div></div>
       <div><div class="n">23</div><div class="t">FILAS DESCARTADAS</div>
         <button type="button" class="ver">Ver por qué</button></div>
       <div><div class="n">—</div><div class="t">REFERENCIAS DISTINTAS</div></div>
     </div>
     <div class="cz-porque"><div class="t">POR QUÉ SE DESCARTARON</div>
       <ul><li><b>Fila 9</b> · sin referencia</li><li><b>Fila 10</b> · la fecha no se entiende: «Total»</li></ul>
     </div>
     <div class="cz-cols">
       <span class="cz-col ok"><i>✓</i> Referencia<em>Referencia</em></span>
       <span class="cz-col ok"><i>✓</i> Cantidad<em>Cantidad</em></span>
       <span class="cz-col no"><i>✕</i> Fecha<em>no se encontró</em></span>
       <span class="cz-col gris"><i>✕</i> Centro<em>no viene · opcional</em></span>
     </div>
     <div class="cz-regla"><div class="t">CÓMO SE AGRUPA UN DOCUMENTO</div>
       <div class="cuerpo">
         <div class="cz-caso"><span class="cz-mov neg">−36</span><span class="cz-mov pos">+36</span>
           <span class="cz-mov neg">−28</span><span class="cz-igual">=</span>
           <span class="cz-res">1 documento</span>
           <span class="nota">Salió, se anuló y se rehízo. Cuenta una vez.</span></div>
         <div class="cz-caso"><span class="cz-mov pos">+36</span><span class="cz-mov neg">−36</span>
           <span class="cz-igual">=</span><span class="cz-res cero">ninguno</span>
           <span class="nota">Se anuló y quedó en cero. No cuenta.</span></div>
       </div>
       <p class="pie-regla">La agrupación la hace la base, no esta pantalla.</p>
     </div>
   </div>
   <div class="cz-pie">
     <button type="button" disabled>Importar el corte</button>
     <div class="razon">No se puede importar: no se encontró Fecha
       <span>En la hoja «Sheet1» se tomó como encabezado la fila 4: Material · Cantidad · Referencia.</span></div>
   </div>
  </section>
  <aside class="cz-caja cz-lado">
   <div class="cz-h"><h2>Cómo va</h2></div>
   <div class="cz-c">
     <div class="cz-paso hecho"><i>✓</i><div><b>Subir el corte</b>BASE DE DATOS GENESIS.xlsx</div></div>
     <div class="cz-paso activo"><i>2</i><div><b>Leer los movimientos</b>No se encontró Fecha</div></div>
     <div class="cz-paso"><i>3</i><div><b>Importar</b>Agrupa los movimientos en documentos y los guarda</div></div>
     <div class="cz-paso"><i>4</i><div><b>Revisar las diferencias</b>Al pie de Control y ejecución</div></div>
   </div>
   <div class="cz-hist"><div class="t">IMPORTACIONES ANTERIORES</div>
     <div class="cz-fila"><b>6 sept · 10:12</b><span>412 docs · <em class="mal">7 sin registrar</em></span></div>
     <div class="cz-fila"><b>30 ago · 09:40</b><span>388 docs · <em class="bien">0 sin registrar</em></span></div>
   </div>
  </aside>
 </div>

 <!-- EL ESTADO DE ANTES DE ESCOGER ARCHIVO. Es el primero que se ve al
      entrar, así que también se mide: la zona de soltar y el campo
      escondido —escondido pero alcanzable con el teclado—. -->
 <div class="cz-duo">
  <section class="cz-caja"><div class="cz-c">
    <input type="file" class="cz-oculto" aria-label="Corte de SAP">
    <button type="button" class="cz-zona">
      <svg viewBox="0 0 24 24"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/></svg>
      <b>Escoge el corte de SAP</b>
      <span>.xlsx, .xls o .csv — el archivo tal como lo bajaste</span>
    </button>
  </div></section>
 </div>
</div>`;

const CLASES = new Set([...ARMAZON.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith("cz-")));

const fallas = [];
const mal = (t) => fallas.push(t);

/* El armazón se queda viejo en silencio: se cambia una clase en el
   componente y esto seguiría midiendo la de antes. */
for (const c of new Set(DEL_COMPONENTE)) {
  if (!CLASES.has(c)) mal(`ARMAZÓN(el componente usa .${c} y este arnés no la pinta: está midiendo otra pantalla)`);
}

const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const razon = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* EL CHROMIUM QUE YA ESTÁ EN LA MÁQUINA. La versión de Playwright del
   proyecto pide uno más nuevo que no está descargado; el que hay sirve
   igual para medir CSS. */
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pagina = await navegador.newPage();

for (const tema of TEMAS) {
  for (const [ancho, comoSeLlama] of ANCHOS) {
    await pagina.setViewportSize({ width: ancho, height: 900 });
    await pagina.setContent(
      `<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}><head><meta charset="utf-8">
       <style>${glob}${tp}${imp}
       body{margin:0;padding:18px;background:var(--c-fondo,#fff)}</style></head>
       <body>${ARMAZON}</body></html>`, { waitUntil: "load" });

    const donde = `${tema ?? "oficial"}/${comoSeLlama}`;

    /* 1 · LA PÁGINA NO SE VA DE LADO */
    const ancho_ = await pagina.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      vis: document.documentElement.clientWidth,
    }));
    if (ancho_.doc > ancho_.vis + 1) {
      mal(`1(${donde}: la página se va de lado — ${ancho_.doc}px de contenido en ${ancho_.vis}px)`);
    }

    /* 6 · EL BOTÓN SIGUE SIENDO DE DEDO */
    if (ancho <= 420) {
      const alto = await pagina.evaluate(() =>
        document.querySelector(".cz-pie > button").getBoundingClientRect().height);
      if (alto < 44) mal(`6(${donde}: el botón de importar quedó en ${Math.round(alto)}px y el dedo pide 44)`);
    }

    /* Contrastes. Se mide contra el primer ANTEPASADO PINTADO, no contra
       el padre a secas: un padre transparente deja medir contra un color
       que nadie ve. */
    const medidas = await pagina.evaluate(() => {
      const pintado = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && !/rgba?\(0, 0, 0, 0\)|transparent/.test(c)) return c;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      /* `color-mix()` DEVUELVE «color(srgb 0.98 0.94 0.95)», con los
         canales de 0 a 1 — no «rgb(250, 240, 242)». Leerlo como si
         fueran 0-255 da un color casi negro, y entonces CUALQUIER mezcla
         clara sale reprobada con 2,0. Es el error que hizo que este
         arnés acusara un contraste que estaba bien: medir mal también
         se ve rojo. */
      const rgb = (s) => {
        const n = (s.match(/-?\d*\.?\d+/g) ?? []).map(Number).slice(0, 3);
        return /^color\(/.test(s) ? n.map((v) => Math.round(v * 255)) : n;
      };
      const par = (sel, que) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return { que, txt: rgb(getComputedStyle(el).color), fondo: rgb(pintado(el)) };
      };
      return [
        par(".cz-pie .razon", "por qué está apagado el botón"),
        par(".cz-pie .razon span", "cómo arreglarlo"),
        par(".cz-pie > button[disabled]", "el botón apagado"),
        par(".cz-paso.activo i", "el número del paso activo"),
        par(".cz-paso.hecho i", "el visto del paso hecho"),
        par(".cz-res", "la fichita «1 documento»"),
        par(".cz-lectura .ver", "«Ver por qué»"),
        /* LAS FICHAS VERDE Y ROJA SE PINTAN MEZCLANDO CON #fff, un
           blanco escrito a mano: en los temas oscuros la tinta del tema
           es CLARA, así que hay que comprobar que no quede claro sobre
           claro. Es exactamente el error que ya se pagó una vez en este
           módulo con --c-oro. */
        par(".cz-col.ok", "la columna que sí se encontró"),
        par(".cz-col.ok em", "el título de la columna encontrada"),
        par(".cz-col.ok i", "el visto de la columna encontrada"),
        par(".cz-col.no i", "la equis de la columna que falta"),
        par(".cz-col.no", "la columna que falta"),
        par(".cz-col.no em", "el título que no se encontró"),
        par(".cz-col.gris", "la columna opcional que no vino"),
        par(".cz-porque li", "por qué se descartó una fila"),
        par(".cz-fila em.mal", "los que siguen sin registrar"),
        par(".cz-h p", "la explicación de la caja"),
        par(".cz-zona b", "«Escoge el corte de SAP»"),
        par(".cz-zona span", "qué archivos valen"),
        par(".cz-arch span", "el pie del archivo escogido"),
      ].filter(Boolean);
    });

    for (const m of medidas) {
      const r = razon(m.txt, m.fondo);
      if (r < 4.5) mal(`2-5(${donde}: «${m.que}» da ${r.toFixed(1)} y necesita 4,5)`);
    }
  }
}

await navegador.close();

if (fallas.length) {
  const unicas = [...new Set(fallas)];
  console.error("IMPORTAR (lo que se ve):\n  · " + unicas.join("\n  · "));
  process.exit(1);
}
console.log(`IMPORTAR (lo que se ve) ok — ${TEMAS.length} temas × ${ANCHOS.length} anchos,`);
console.log("               sin desplazamiento lateral, todo por encima de 4,5 y el botón de dedo.");
