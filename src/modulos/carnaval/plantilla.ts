import type { SeccionHoja } from "./logica";

/**
 * LA HOJA «EXISTENCIAS DIARIAS» VACÍA: las secciones y los renglones tal como están hoy en Carnaval.
 * Sirve de molde cuando se lee una foto: el lector solo tiene que sacar los NÚMEROS de cada renglón; los nombres salen de aquí
 * (o del último inventario guardado, si ya hay uno), así no dependen de cómo lea las letras.
 */
export const PLANTILLA_INICIAL: SeccionHoja[] = [
 {
  "titulo": "ENVASE",
  "colA": "ESTIBA",
  "colB": "CAJA",
  "filas": [
   {
    "concepto": "Envase Marron 330R (Nuevo)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Marron 330R (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Marron 750R (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 250 CC (Nuevo) en caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint 330R (Nuevo)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint 330R (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint 750R (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 1000CC (36)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 1000CC  (36) Retorno",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase FLINT 1000R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase FLINT 1000R (RETORNO)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Costeñita 175R (Nuevo)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Costeñita 175R (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase TROPHY",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase TROPHY (Retorno )",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase TROPHY 850  (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 250 CC (Nuevo)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 250 CC (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 250 CC (Retorno) Caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase FLINT 250  (Nuevo )",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase FLINT 250 CC (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase FLINT 250 CC (Retorno) Caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Budweiser 250 CC (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Marron 225 (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Clover CC320 (NUEVO)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Clover CC320 (RETORNO)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint Coronita 210 (Retorno) caja 225",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint Coronita 210 (Retorno) caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint Coronita 210 (Retorno) caja 250",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "CAJA PLASTICA",
  "colA": "ESTIBA",
  "colB": "CAJA",
  "filas": [
   {
    "concepto": "Caja Plástica Café 225cc X 38",
    "a": null,
    "b": null
   },
   {
    "concepto": "Caja Plástica Café 330cc X 30",
    "a": null,
    "b": null
   },
   {
    "concepto": "CAJA PLASTICA MARRON 1000cc x13",
    "a": null,
    "b": null
   },
   {
    "concepto": "CAJA PLASTICA MARRON 250cc x38",
    "a": null,
    "b": null
   },
   {
    "concepto": "CAJA PLASTICA MARRON 750cc x 16",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "PALLET",
  "colA": "CANTIDAD",
  "colB": "Columna1",
  "filas": [
   {
    "concepto": "Marron 330R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Flint 330R",
    "a": null,
    "b": null
   },
   {
    "concepto": "MARRON 1000CC",
    "a": null,
    "b": null
   },
   {
    "concepto": "FLINT 1000R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Costeñita 175R",
    "a": null,
    "b": null
   },
   {
    "concepto": "TROPHY",
    "a": null,
    "b": null
   },
   {
    "concepto": "MARRON 250 CC",
    "a": null,
    "b": null
   },
   {
    "concepto": "Flint 250",
    "a": null,
    "b": null
   },
   {
    "concepto": "Palleth Clover CC320",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "ESTIBAS DE MADERA CERV",
  "colA": "CANT",
  "colB": "Columna1",
  "filas": [
   {
    "concepto": "TIPO A",
    "a": null,
    "b": null
   },
   {
    "concepto": "TIPO B",
    "a": null,
    "b": null
   },
   {
    "concepto": "TIPO C",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "CASCO DE VIDRIO B38",
  "colA": "ESTIBA",
  "colB": "CAJA",
  "filas": [
   {
    "concepto": "Envase Marron 330R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint 175",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint 330R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase FLINT 1000R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 1000CC",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase TROPHY",
    "a": null,
    "b": null
   },
   {
    "concepto": "Estiba Casco de Vidrio Ambar 850",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase TROPHY 850",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Costeña Bacana",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Costeñita 175R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase coronita 210 caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase corona 355 caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase corona 330 caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase coronita 210 caja 250",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase coronita 210 caja 225",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint 250",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Marron 225",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Marron 250",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Flint 250 caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Estiba Casco de Vidrio Flint 750",
    "a": null,
    "b": null
   },
   {
    "concepto": "Estiba Casco de Vidrio Ambar 750",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Marron 225 (Retorno)",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 250 CAJA 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 250 CC (Nuevo) en caja 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Budweiser 250 Casco Vidrio",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "PENDIENTE DE BAJA",
  "colA": "ESTIBA",
  "colB": "CAJA",
  "filas": [
   {
    "concepto": "Envase TROPHY 850",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase FLINT 1000R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase MARRON 1000CC",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Costeñita 175R",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "ENVASE LAVADO PARA REVIISON",
  "colA": "ESTIBA",
  "colB": "CAJA",
  "filas": [
   {
    "concepto": "Envase Costeñita 175R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Costeñita PENDIENTE REV  S ANTIAGO",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Costeñita 175R  Pico arriba OK AUTORIZADO SANTIAGO",
    "a": null,
    "b": null
   },
   {
    "concepto": "Cuerpo extraño costeñita 175R",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase Costeñita 175R revisado Pico abajo",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "CAJA MALA",
  "colA": "ESTIBA",
  "colB": "CAJA",
  "filas": [
   {
    "concepto": "Caja Plástica Café 225cc X 38",
    "a": null,
    "b": null
   },
   {
    "concepto": "CAJA PLASTICA MARRON 250cc x38",
    "a": null,
    "b": null
   },
   {
    "concepto": "Caja Plástica Café 330cc X 30",
    "a": null,
    "b": null
   },
   {
    "concepto": "CAJA PLASTICA MARRON 1000cc x13",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "CASCO VIDRIO CERVECERIA ATLANTICO",
  "colA": "ESTIBA",
  "colB": "CAJA",
  "filas": [
   {
    "concepto": "Estiba Casco de Vidrio Ambar 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Estiba Casco de Vidrio Flint 330",
    "a": null,
    "b": null
   },
   {
    "concepto": "Envase coronita 210 caja 330",
    "a": null,
    "b": null
   }
  ]
 },
 {
  "titulo": "CASCO VIDRIO CERVECERIA ATLANTICO",
  "colA": "ESTIBA",
  "colB": "CAJA",
  "filas": [
   {
    "concepto": "Caja Plástica Café 330cc X 30",
    "a": null,
    "b": null
   }
  ]
 }
];
