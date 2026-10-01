#!/usr/bin/env bash
cd /home/claude/cd38-inventario
R=src/modulos/registro.ts; P="src/app/(app)/roturas/Reportar.tsx"; T="src/app/(app)/roturas/en-sitio/tablero/Tablero.tsx"
m(){ bash .arnes/_mutar.sh "$@"; }
m $R '{ nombre: "Desacuerdos", ruta: "/roturas/en-sitio/desacuerdos", rama: "en-sitio" },
      { nombre: "Tablero", ruta: "/roturas/en-sitio/tablero", rama: "en-sitio" },' '{ nombre: "Tablero", ruta: "/roturas/en-sitio/tablero", rama: "en-sitio" },
      { nombre: "Desacuerdos", ruta: "/roturas/en-sitio/desacuerdos", rama: "en-sitio" },' .arnes/qb-registro.mjs
m $R '{ nombre: "Operarios", ruta: "/roturas/en-sitio/operarios", rama: "en-sitio" },
      { nombre: "Maestro", ruta: "/roturas/en-sitio/maestro", rama: "en-sitio" },' '{ nombre: "Maestro", ruta: "/roturas/en-sitio/maestro", rama: "en-sitio" },
      { nombre: "Operarios", ruta: "/roturas/en-sitio/operarios", rama: "en-sitio" },' .arnes/qb-registro.mjs
m "$P" 'origen === "encontrada" ? "Registrar y mandar a cobro" : "Enviar a ABI"' '"Enviar a ABI"' .arnes/rt-sitio.mjs
m "$P" '{origen === "encontrada"
            ? "Pasó directo a cobro.' '{false
            ? "Pasó directo a cobro.' .arnes/rt-sitio.mjs
m "$P" '{origen === "encontrada"
              ? "Va directo a cobro, en el Tablero' '{false
              ? "Va directo a cobro, en el Tablero' .arnes/rt-sitio.mjs
m "$T" 'r.origen === "encontrada" && !r.ol_respuesta' 'false' .arnes/rt-tablero-sitio.mjs
