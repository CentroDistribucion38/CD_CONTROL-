/**
 * REGISTRO DE MÓDULOS DE CONTROL
 * ------------------------------------------------------------------
 * Única fuente de verdad de la plataforma. La portada (/inicio) y el menú
 * lateral se dibujan a partir de este archivo. No hay lista de módulos
 * escrita a mano en ningún componente.
 *
 * Para agregar un módulo:
 *   1. Agrega su entrada aquí con activo: true
 *   2. Crea las rutas en   src/app/(app)/<ruta>/
 *   3. Crea la lógica en   src/modulos/<id>/acciones.ts
 *   4. Crea el SQL en      supabase/modulos/<id>.sql
 *
 * activo  → el módulo existe y se puede entrar
 * oculto  → existe y funciona, pero no aparece en la portada ni en el menú
 *           (sigue accesible por URL; útil para módulos de soporte)
 */

export type Rol = "admin" | "supervisor" | "operador";

export type Seccion = {
  nombre: string;
  ruta: string;
  /**
   * Existe, funciona y SIGUE teniendo permiso propio en /admin/roles,
   * pero no se lista en el menú lateral. Es para las pantallas a las que
   * se entra desde otra pantalla y no por el menú: repetirlas arriba las
   * hace parecer dos cosas distintas.
   * OJO: quitarla del registro en vez de ocultarla sería otra cosa —
   * perdería su casilla de permisos y nadie podría volver a darla.
   */
  oculto?: boolean;
  /**
   * A qué rama del módulo pertenece, cuando el módulo tiene ramas.
   * El menú lateral muestra SOLO las secciones de la rama en la que uno
   * está: es lo que impide que dos submódulos que miden cosas distintas
   * se lean como una sola lista.
   */
  rama?: string;
};

/**
 * UNA RAMA de un módulo: un submódulo con sus propias pantallas.
 *
 * Existe para el caso en que un módulo agrupa dos cosas que comparten
 * tema pero NO comparten cifras —Roturas: unidades en sitio y kilos a la
 * salida—. La portada del módulo pinta una tarjeta por rama y el menú
 * lateral solo muestra la rama en la que uno está.
 */
export type Rama = {
  id: string;
  nombre: string;
  /** Etiqueta corta en mayúsculas: la unidad con la que mide esta rama. */
  eyebrow: string;
  ruta: string;
  descripcion: string;
  /**
   * LA PANTALLA CUYO PERMISO ES EL DE LA RAMA ENTERA, en /admin/roles.
   * Sin esto la rama sale con botones que marcan todas sus pantallas de
   * golpe. Con esto la rama ES esa pantalla: su fila controla solo esa,
   * y la pantalla no se lista otra vez debajo. Conteos es el informe
   * —el Tablero—, y «Contar» es otra cosa que se da aparte.
   */
  permiso?: string;
};

export type Modulo = {
  id: string;
  nombre: string;
  /** Etiqueta corta en mayúsculas sobre el nombre */
  eyebrow: string;
  descripcion: string;
  /** Color de acento: etiqueta y círculo de la flecha */
  acento: string;
  /** Color de respaldo y mezcla de la zona de imagen */
  fondo: string;
  /**
   * Dos o tres palabras que digan qué hay adentro. Si no se ponen, la
   * portada usa los nombres de las primeras secciones.
   */
  etiquetas?: string[];
  /** Ruta de la foto en /public. Si no existe, se ve solo el fondo. */
  imagen: string;
  /** La base del módulo. Es lo que se compara para saber "en qué módulo
   *  estoy" y lo que se pide como permiso, NO necesariamente adonde
   *  lleva la tarjeta. Para eso está `entrada`. */
  ruta: string;
  /**
   * Con qué pantalla se abre el módulo al entrar por la tarjeta.
   *
   * Sin esto, la tarjeta llevaba siempre a `ruta`, que en Sider es la
   * Fuente principal —una tabla para revisar—, cuando quien entra al
   * módulo casi siempre va a CERTIFICAR un vehículo que tiene enfrente.
   * Se resuelve con entradaDe() y no aquí a secas porque hay que
   * comprobar que la persona pueda ver esa pantalla: mandarla a una que
   * su rol no incluye sería cambiar la puerta por un letrero de "no
   * tienes permiso".
   */
  entrada?: string;
  activo: boolean;
  oculto?: boolean;
  roles?: Rol[];
  /** Si el módulo se parte en submódulos. Sin esto, `ruta` es una
   *  pantalla normal y las secciones se listan todas juntas. */
  ramas?: Rama[];
  secciones: Seccion[];
};

/**
 * En qué rama cae una ruta.
 *
 * DOS CAMINOS, Y HACEN FALTA LOS DOS.
 *
 * 1. POR LA DIRECCIÓN. Gana la coincidencia más larga: sin eso,
 *    "/roturas/salida" se llevaría también a "/roturas/salida/tolvas".
 *
 * 2. POR LA SECCIÓN, cuando la dirección no alcanza. Es lo que pasa en
 *    Quiebra: sus pantallas de envase son /quiebra/tablero,
 *    /quiebra/diario, /quiebra/importar y /quiebra/rotura, y lo único
 *    que comparten es /quiebra — que es la ruta del MÓDULO, la pantalla
 *    que precisamente sirve para escoger rama. Si la rama se declarara
 *    con ese prefijo, la portada caería dentro de su propia rama y no
 *    habría dónde escoger. Con esto, cada pantalla dice a qué rama
 *    pertenece porque ya lo dice su sección, y no hace falta que las
 *    direcciones se hayan diseñado para eso.
 *
 * LA RUTA DEL MÓDULO NUNCA CAE EN UNA RAMA. Es la bifurcación: estando
 * parado ahí, el riel tiene que mostrar las ramas, no las pantallas de
 * una de ellas.
 */
export function ramaDeRuta(m: Modulo, pathname: string): Rama | undefined {
  if (!m.ramas?.length) return undefined;
  if (pathname === m.ruta) return undefined;

  const porRuta = m.ramas
    .filter((r) => pathname === r.ruta || pathname.startsWith(r.ruta + "/"))
    .sort((a, b) => b.ruta.length - a.ruta.length)[0];
  if (porRuta) return porRuta;

  const seccion = m.secciones
    .filter((s) => !!s.rama && (pathname === s.ruta || pathname.startsWith(s.ruta + "/")))
    .sort((a, b) => b.ruta.length - a.ruta.length)[0];
  return seccion ? m.ramas.find((r) => r.id === seccion.rama) : undefined;
}

/**
 * A DÓNDE LLEVA UNA RAMA A ESTA PERSONA.
 *
 * `ruta` de la rama es la pantalla por la que se entra «en general» (en
 * Conteos, el Tablero). Pero a quien solo tiene abierta «Contar» esa
 * pantalla no le toca, y llevarlo ahí era enseñarle justo lo que se le
 * había cerrado. Por eso: si puede ver la de entrada, va a ella; si no,
 * a la primera pantalla de LA RAMA que sí puede ver, en el orden del menú.
 */
export function entradaDeRama(m: Modulo, r: Rama, puedeVer: (ruta: string) => boolean): string {
  if (puedeVer(r.ruta)) return r.ruta;
  return m.secciones.find((s) => s.rama === r.id && !s.oculto && puedeVer(s.ruta))?.ruta ?? r.ruta;
}

/**
 * LA SECCIÓN QUE ES EXACTAMENTE ESTA DIRECCIÓN, o nada.
 *
 * Solo coincidencia EXACTA a propósito: una dirección más honda que no
 * está registrada (un detalle, un formulario) no se cierra por un
 * permiso que no era el suyo. Y la portada de un módulo que no es una
 * sección tampoco: es donde se escoge rama.
 */
export function seccionExacta(pathname: string): { modulo: Modulo; seccion: Seccion } | undefined {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const m of MODULOS) {
    if (!m.activo || m.oculto) continue;
    const seccion = m.secciones.find((s) => s.ruta === p);
    if (seccion) return { modulo: m, seccion };
  }
  return undefined;
}

export const MODULOS: Modulo[] = [
  {
    id: "quiebra",
    nombre: "Quiebra",
    eyebrow: "PÉRDIDA DE MATERIAL",
    descripcion:
      "Todo lo que se pierde: el envase retornable medido contra producción, " +
      "lo que se rompe en la bodega y el vidrio que sale por la puerta.",
    acento: "#E4002B",
    fondo: "#FBEFD6",
    etiquetas: ["Envase contra producción", "Roturas en sitio y a la salida"],
    imagen: "/modulos/quiebra.jpg",
    ruta: "/quiebra",
    activo: true,

    /* ROTURAS SE MUDÓ AQUÍ ADENTRO, Y LAS DIRECCIONES NO SE TOCARON.
       Sus pantallas siguen viviendo en /roturas/... a propósito: los
       permisos de cada persona están guardados EN LA BASE como el texto
       de la dirección —«/roturas/salida», «/roturas/en-sitio/maestro»—,
       en rol_permisos y en los permisos extra de cada perfil. Cambiar
       una ruta deja esas filas apuntando a algo que no existe y la
       persona pierde la pantalla EN SILENCIO: no da error, deja de
       verse. Es el mismo motivo por el que el módulo que la gente llama
       T1/T2 sigue viviendo en /sider.

       TRES RAMAS, Y NINGUNA SE SUMA CON OTRA:
         Envase   mide un PORCENTAJE contra la producción del mes.
         En sitio cuenta UNIDADES por causa y por proceso.
         Salida   pesa KILOS de vidrio.
       No existe el factor que convierta una en otra —una botella de 330
       y una de 750 pesan distinto, el vidrio se acumula días antes de
       salir, y parte de lo que se pesa nunca se contó en sitio—. Un
       menú plano con las catorce pantallas seguidas invita justamente a
       leerlas como una sola cuenta. */
    ramas: [
      {
        id: "envase",
        nombre: "Envase",
        eyebrow: "% CONTRA PRODUCCIÓN",
        ruta: "/quiebra/tablero",
        descripcion:
          "El envase retornable que se da de baja, medido contra lo que se produjo. " +
          "Contesta cómo vamos contra la meta del mes.",
      },
      {
        id: "en-sitio",
        nombre: "En sitio",
        eyebrow: "UNIDADES",
        ruta: "/roturas/en-sitio",
        descripcion:
          "Lo que se rompió en la bodega, contado por causa y por proceso. " +
          "Contesta de quién fue y de dónde salió.",
      },
      {
        id: "salida",
        nombre: "Salida",
        eyebrow: "KILOS",
        ruta: "/roturas/salida",
        descripcion:
          "El vidrio que sale por la puerta, pesado en tolvas y firmado por tres " +
          "personas. Contesta cuánto salió.",
      },
    ],

    secciones: [
      /* ENVASE. El tablero se mudó de /quiebra a /quiebra/tablero porque
         /quiebra pasó a ser la bifurcación. Es la ÚNICA ruta que cambió
         en todo esto, y va con su migración: el nivel que cada rol tenía
         en /quiebra se copia a /quiebra/tablero, así que nadie pierde
         nada. */
      { nombre: "Tablero", ruta: "/quiebra/tablero", rama: "envase" },
      { nombre: "Quiebra diaria", ruta: "/quiebra/diario", rama: "envase" },
      { nombre: "Importar", ruta: "/quiebra/importar", rama: "envase" },
      /* ROTURA DE LÍNEA VA DE ÚLTIMA, y el maestro detrás de ella. Es
         una pérdida de material como las otras, medida también contra la
         producción, pero es su propio flujo: quien entra a Envase va al
         tablero, al día a día y a importar. Meterla en medio partía en
         dos lo que se lee de corrido. */
      { nombre: "Rotura de línea", ruta: "/quiebra/rotura", rama: "envase" },
      { nombre: "Tablero de rotura", ruta: "/quiebra/rotura/tablero", rama: "envase" },
      { nombre: "Maestro de rotura", ruta: "/quiebra/rotura/maestro", rama: "envase" },

      /* EN SITIO. El orden es el de la cadena, de principio a fin:
         se registra → Easy da el visto bueno → ABI resuelve lo que se
         objetó → el tablero con lo que va a cobro → el análisis → quién
         reporta → la configuración.

         Visto bueno va ANTES que Desacuerdos porque Easy contesta
         primero y solo lo que objeta llega a ABI. Y los dos van ANTES
         del Tablero porque el tablero es donde termina todo: lo que se
         cobra —también las «encontradas», que se van derechas a cobro
         sin pasar por Visto bueno ni Desacuerdos—. */
      { nombre: "Registrar", ruta: "/roturas/en-sitio", rama: "en-sitio" },
      { nombre: "Visto bueno", ruta: "/roturas/en-sitio/visto-bueno", rama: "en-sitio" },
      { nombre: "Desacuerdos", ruta: "/roturas/en-sitio/desacuerdos", rama: "en-sitio" },
      { nombre: "Tablero", ruta: "/roturas/en-sitio/tablero", rama: "en-sitio" },
      { nombre: "Análisis", ruta: "/roturas/en-sitio/analisis", rama: "en-sitio" },
      /* OPERARIOS VA ANTES DEL MAESTRO: quién reporta es parte del
         recorrido, y el Maestro cierra porque no es un paso sino la
         configuración. Sigue siendo la única de la rama que no la ve
         todo el mundo: aquí se ven los PIN. No es una hoja del Maestro
         por eso mismo —una hoja más habría amarrado el permiso de los
         PIN al de materiales y causas—. */
      { nombre: "Operarios", ruta: "/roturas/en-sitio/operarios", rama: "en-sitio" },
      { nombre: "Maestro", ruta: "/roturas/en-sitio/maestro", rama: "en-sitio" },

      /* SALIDA: una pantalla por etapa de la cadena, y en el orden en que
         pasa. Las dos firmas son de dos personas distintas y cada una
         trabaja en un sitio distinto: la supervisora en la báscula y
         quien valida dando el aval de salida. Con las dos firmas en una
         sola hoja, la misma persona ve los dos botones, toca los dos, y
         la base le contesta que no —que es tener la regla como regaño
         en vez de como camino—. Aquí la salida AVANZA: sale de una
         bandeja y aparece en la siguiente.

         ERAN TRES Y AHORA SON DOS: se quitó Verificación. Lo que no se
         quitó es que sean DOS PERSONAS: quien pesa no da la salida. */
      { nombre: "Pesar", ruta: "/roturas/salida", rama: "salida" },
      /* VALIDACIÓN SE FUE, Y SE QUEDA OCULTA EN VEZ DE BORRARSE.
         «Que facturación no haga doble trabajo validando allá en salida
         y en traspaso.» El aval del vidrio se da ahora en
         /traspasos/facturacion, al dar la salida al viaje: se escoge la
         cédula —el código con el que la salida nace, SR-0001—, se
         cuentan las tolvas, y si cuadran el Vh sale con las dos cosas
         resueltas de una.

         QUITARLA DEL REGISTRO EN VEZ DE OCULTARLA SERÍA OTRA COSA: le
         quitaría su casilla en /admin/roles, y entonces las filas de
         permiso que cada rol ya tiene sobre «/roturas/salida/validacion»
         quedarían sin forma de verse ni de cambiarse. La migración las
         borra; el registro conserva la pantalla por si hay que
         devolverla. */
      { nombre: "Validación (se mudó a Facturación)", ruta: "/roturas/salida/validacion",
        rama: "salida", oculto: true },
      { nombre: "Análisis", ruta: "/roturas/salida/analisis", rama: "salida" },
      { nombre: "Tolvas", ruta: "/roturas/salida/tolvas", rama: "salida" },

      /* LA VIEJA PORTADA DE ROTURAS. Ya no se lista —su trabajo lo hace
         ahora la de Quiebra— pero la pantalla sigue existiendo y manda
         para acá: hay gente con ese enlace guardado y en la app
         instalada no hay barra de direcciones donde corregirlo.

         Y SE QUEDA REGISTRADA, oculta, en vez de borrarse: quitarla del
         registro le quitaría su casilla en /admin/roles, y entonces la
         fila de permiso que cada rol ya tiene sobre «/roturas» quedaría
         sin forma de verse ni de cambiarse. */
      { nombre: "Roturas (portada vieja)", ruta: "/roturas", oculto: true },
    ],
  },
  {
    id: "sider",
    /* El nombre es literal: así se llama el módulo en el CD. La RUTA
       sigue siendo /sider y no se toca — las direcciones están guardadas
       como texto en rol_permisos y en los permisos extra de cada persona
       ("/sider", "/sider/certificar", …), así que cambiarlas dejaría esas
       filas apuntando a algo que ya no existe y todo el mundo perdería el
       permiso EN SILENCIO: la pantalla no da error, simplemente deja de
       verse. Lo que lee la gente y lo que identifica la pantalla son dos
       cosas distintas y aquí se separan. */
    nombre: "T1 / T2",
    eyebrow: "ENVASE EN TRÁNSITO",
    descripcion:
      "Certificación de vehículos con ubicación y evidencia fotográfica, en la salida del CD origen y en la llegada a Barranquilla.",
    acento: "#0B7285",
    fondo: "#DFF1F3",
    etiquetas: ["Certificación en dos puntas", "% de certificación"],
    imagen: "/modulos/sider.jpg",
    ruta: "/sider",
    /* Quien abre Sider está casi siempre al lado de un vehículo, no
       revisando la tabla. */
    entrada: "/sider/certificar",
    activo: true,
    // OJO: aquí solo van secciones que YA tienen su página. Registrar una
    // ruta que no existe pone un enlace en el menú que lleva a un 404, y
    // quien lo toca no tiene forma de saber que es una pantalla pendiente
    // y no una app rota. scripts/rutas.mjs revienta el build si pasa.
    // EL MENÚ VA EN EL ORDEN DEL PROCESO, no en el orden en que se fueron
    // construyendo las pantallas. De arriba abajo es lo que pasa de
    // verdad con un vehículo:
    //
    //   Certificar        sale del CD origen
    //   En tránsito       viene en camino y llega a Barranquilla
    //   Revisión AI       ya llegado, se revisa por dentro (y ahí se crea el Vh Interno)
    //   Informe AI        el cobro al socio, con lo que salió de la revisión
    //   Fuente principal  ahí queda el viaje, ya completo
    //   Seguimiento       el informe de todos
    //   Novedades         lo que salió mal, que solo se sabe al final
    //
    // Maestro cierra porque no es un paso: es la configuración —los
    // orígenes y los materiales— y se toca una vez cada mucho.
    secciones: [
      { nombre: "Certificar", ruta: "/sider/certificar" },
      /* DAR SALIDA VA DESPUÉS DE CERTIFICAR: en el patio se certifica el
         camión y queda una ficha; el facturador escribe la factura y le da
         salida aquí, y solo entonces pasa a En tránsito. Es de OTRA persona
         que Certificar, por eso tiene su propio permiso. */
      { nombre: "Dar salida", ruta: "/sider/salida" },
      { nombre: "En tránsito", ruta: "/sider/transito" },
      /* PEDIR O QUITAR LA REVISIÓN AI NO ES UNA PANTALLA: es el botón de
         cada vehículo en En tránsito. Está aquí, oculto, SOLO para tener su
         casilla en Roles —«Pedir / quitar revisión AI»—: antes era «solo el
         administrador», y para que otra persona la pidiera había que
         volverla administradora. El administrador la tiene siempre. */
      { nombre: "Pedir / quitar revisión AI", ruta: "/sider/transito/revision-ai", oculto: true },
      /* REVISIÓN AI VA JUSTO DESPUÉS DE TRÁNSITO: es lo que se hace apenas
         el camión llega. Lista lo que falta revisar una vez CERTIFICADA la
         llegada, en dos clases: «certificada» (camión de Sider) y «normal»
         (los «Vh Interno», que se crean ahí mismo con el «+»). LA RUTA
         SIGUE SIENDO /sider/sorting: los permisos de cada rol están
         guardados con ese texto y cambiarlo dejaría a todos sin acceso. */
      { nombre: "Revisión AI", ruta: "/sider/sorting" },
      /* EL «+» DE «VH INTERNO» NO ES UNA PANTALLA: es un botón flotante de
         Revisión AI. Está aquí, oculto, SOLO para tener su casilla en Roles
         —«Vh Interno (+)»—: no todos los que hacen revisiones pueden crear
         un camión. Su página redirige a Revisión AI. */
      { nombre: "Vh Interno (+)", ruta: "/sider/sorting/nuevo", oculto: true },
      /* CORREGIR UNA REVISIÓN YA CERRADA TAMPOCO ES UNA PANTALLA: es el
         botón «Corregir» de «Hechas». Tiene su casilla para que quien
         cuenta pueda cerrar sin poder cambiar después lo que ya cobró. El
         administrador la tiene siempre; el candado está en la base. */
      { nombre: "Corregir revisión AI", ruta: "/sider/sorting/corregir", oculto: true },
      /* EL INFORME AI VA DETRÁS DE LA REVISIÓN: es lo que sale de ella, el
         cobro al socio. Después, Fuente principal, donde queda el viaje
         completo. */
      { nombre: "Informe AI", ruta: "/sider/seguimiento/ai" },
      { nombre: "Fuente principal", ruta: "/sider" },
      { nombre: "Seguimiento", ruta: "/sider/seguimiento" },
      /* Se entra por el botón Importar de Seguimiento, que es donde se
         necesita. En el menú era el mismo destino dicho dos veces. */
      { nombre: "Importar", ruta: "/sider/importar", oculto: true },
      { nombre: "Novedades", ruta: "/sider/novedades" },
      { nombre: "Maestro", ruta: "/sider/maestro" },
    ],
  },
  /* ROTURAS YA NO ES UN MÓDULO APARTE: se mudó dentro de Quiebra, arriba,
     como dos de sus tres ramas —«En sitio» y «Salida»—. Las tres miden
     material perdido y ahora se entra a las tres por la misma puerta.

     SUS DIRECCIONES NO CAMBIARON. Siguen siendo /roturas/…, y eso es a
     propósito: los permisos están guardados en la base como el TEXTO de
     la dirección, y moverlas habría dejado a cada persona sin sus
     pantallas en silencio. Lo que cambió es dónde se entra, no dónde
     vive. */

  {
    id: "traspasos",
    nombre: "Traspasos",
    eyebrow: "VIAJES ENTRE PUNTOS",
    descripcion:
      "Lo que se planea mover en cada turno y lo que de verdad se movió, viaje por viaje y con su placa. El cumplido no se escribe: se cuenta.",
    acento: "#0B4EA2",
    fondo: "#E6EEF9",
    etiquetas: ["Plan del turno", "Viajes con placa"],
    imagen: "/modulos/traspasos.jpg",
    ruta: "/traspasos",
    /* Quien abre Traspasos casi siempre viene a registrar un viaje que
       tiene enfrente, no a mirar el plan. El plan se hace una vez por
       turno; los viajes se registran todo el turno. */
    entrada: "/traspasos",
    activo: true,
    /* EL ORDEN DEL PROCESO, no el de las pantallas: primero se planea el
       turno, después se registra lo que sale, después se compara, y la
       configuración de último. */
    secciones: [
      { nombre: "Plan", ruta: "/traspasos/plan" },
      { nombre: "Registrar", ruta: "/traspasos" },
      /* FACTURACIÓN, DESPUÉS DE REGISTRAR: es el paso siguiente del mismo
         viaje. El patio lo registra con la orden de cargue; facturación
         le pone el número de documento y confirma que salió. Va DENTRO de
         Traspasos —«no debías crearlo allí, sino en el mismo módulo»—.
         Quien solo tiene el rol Facturación ve Traspasos con esta sola
         pantalla. */
      { nombre: "Facturación", ruta: "/traspasos/facturacion" },
      { nombre: "Control", ruta: "/traspasos/control" },
      /* IMPORTAR VA DESPUÉS DE CONTROL Y ANTES DEL MAESTRO, porque ese
         es el orden del proceso: se planea, se registra lo que sale, se
         mira si se cumplió el plan, y al final del día se sube el corte
         de SAP para comprobar que lo registrado es lo que de verdad
         salió. El maestro no es un paso del día: es lo que se mantiene
         de vez en cuando, y por eso cierra la lista.

         SE LLAMA «IMPORTAR» Y VIVE EN /traspasos/cruce. El nombre
         cambió porque la pantalla cambió —ya no muestra el cruce, solo
         sube el archivo; las diferencias salen al pie de Control—, pero
         LA DIRECCIÓN NO SE PUEDE TOCAR: los permisos de cada persona
         están guardados en la base como el texto de la ruta, en
         rol_permisos y en los permisos extra de cada perfil. Renombrar
         la ruta deja esas filas apuntando a algo que no existe y la
         gente pierde la pantalla EN SILENCIO. */
      { nombre: "Importar", ruta: "/traspasos/cruce" },
      { nombre: "Maestro", ruta: "/traspasos/maestro" },
    ],
  },
  {
    id: "acciones",
    nombre: "Acciones",
    eyebrow: "CORRECTIVAS Y PREVENTIVAS",
    descripcion:
      "Lo que se encontró mal, con plazo según la prioridad, responsable con nombre y verificación de si de verdad sirvió.",
    /* Rojo de la casa: es el módulo que habla de lo que está mal, y el
       día que se abre no es para dar una buena noticia. */
    acento: "#E4002B",
    fondo: "#FDE8EC",
    etiquetas: ["Plazo por prioridad", "Se verifica, no se cierra y ya"],
    imagen: "/modulos/acciones.jpg",
    ruta: "/acciones",
    /* Quien abre Acciones casi siempre viene a ver LO SUYO, no el
       tablero de todos: el tablero es de la reunión de arranque de
       turno, y a esa se entra con la pantalla ya puesta en la TV. */
    entrada: "/acciones/mias",
    activo: true,
    /* DOS RAMAS, igual que Roturas e Inventario. Comparten tema —lo
       que se encontró mal— y NO comparten unidad ni ritmo:

         OL   una ACCIÓN: algo que hay que corregir, con responsable,
              plazo y verificación de si de verdad sirvió. Se abre
              todos los días.
         ABI  un HALLAZGO: lo que se encontró en una auditoría, con su
              evidencia y una redacción que va a un informe que sale
              del CD. Se levanta el día de la auditoría.

       Un hallazgo no es una acción a medias: es el paso de antes. De
       un hallazgo PUEDE nacer una acción —y quedan amarrados— pero hay
       hallazgos que solo se documentan, y meterlos en la lista de
       acciones los volvería acciones sin dueño que el tablero
       señalaría para siempre. */
    ramas: [
      {
        id: "ol",
        nombre: "OL",
        eyebrow: "ACCIONES",
        ruta: "/acciones/mias",
        descripcion:
          "Lo que hay que corregir, con responsable y plazo. El plazo lo pone la prioridad " +
          "y cerrar no es resolver: después alguien verifica si de verdad sirvió.",
      },
      {
        id: "abi",
        nombre: "ABI",
        eyebrow: "HALLAZGOS",
        ruta: "/acciones/abi",
        descripcion:
          "Lo que se encuentra en la auditoría: evidencia, la redacción técnica y el " +
          "informe. De un hallazgo se puede abrir una acción sin salir de aquí.",
      },
    ],
    // El orden del proceso, de arriba abajo: me toca → lo hice → alguien
    // verifica → así vamos → por qué se repite → la configuración.
    secciones: [
      { nombre: "Mis acciones", ruta: "/acciones/mias", rama: "ol" },
      { nombre: "Por verificar", ruta: "/acciones/verificar", rama: "ol" },
      /* «TODAS» SE MUDÓ DE /acciones A /acciones/todas, y es lo mismo
         que pasó en Inventario: con dos ramas, la ruta del módulo tiene
         que ser la BIFURCACIÓN. Con «Todas» encima de /acciones, entrar
         a Acciones sería entrar ya a OL y no habría dónde escoger.
         El permiso se muda con ella en 2026-09-acciones-abi-hallazgos.sql:
         los permisos se guardan como el TEXTO de la dirección, y mover
         la pantalla sin mover el permiso deja a la gente sin ella EN
         SILENCIO. */
      { nombre: "Todas", ruta: "/acciones/todas", rama: "ol" },
      { nombre: "Tablero", ruta: "/acciones/tablero", rama: "ol" },
      { nombre: "Indicadores", ruta: "/acciones/analisis", rama: "ol" },
      { nombre: "Maestro", ruta: "/acciones/maestro", rama: "ol" },
      /* ABI, EN EL ORDEN DEL PROCESO: se levanta el hallazgo con su
         evidencia, se redacta, y de ahí sale el informe. El maestro de
         temas al final, como en todos los módulos. */
      { nombre: "Levantar", ruta: "/acciones/abi", rama: "abi" },
      { nombre: "Hallazgos", ruta: "/acciones/abi/hallazgos", rama: "abi" },
      { nombre: "Informe", ruta: "/acciones/abi/informe", rama: "abi" },
      { nombre: "Maestro", ruta: "/acciones/abi/maestro", rama: "abi" },
    ],
  },
  {
    id: "admin",
    nombre: "Administración",
    eyebrow: "PLATAFORMA",
    descripcion:
      "Usuarios, roles y permisos: quién entra, quién ve qué pantalla y quién puede modificar. Los roles son datos, no código.",
    acento: "#4C3BCF",
    fondo: "#EDEBFA",
    etiquetas: ["Crear usuarios", "Roles por sección", "Borrar datos puntuales"],
    imagen: "/modulos/admin.jpg",
    ruta: "/admin/inicio",
    activo: true,
    secciones: [
      /* PRIMERO LA PORTADA: quién entra, qué falta y qué se cambió. */
      { nombre: "Inicio", ruta: "/admin/inicio" },
      { nombre: "Roles", ruta: "/admin/roles" },
      { nombre: "Usuarios", ruta: "/admin/usuarios" },
      /* QUIÉN USA LA APP: después de la gente, antes de lo destructivo. */
      { nombre: "Uso", ruta: "/admin/uso" },
      /* AL FINAL: borrar es lo último que se hace, y lo más raro. */
      { nombre: "Borrar datos", ruta: "/admin/datos" },
    ],
  },
  {
    id: "inventario",
    nombre: "Inventario",
    eyebrow: "STOCK",
    descripcion:
      "Maestro de materiales y ubicaciones, conteo por módulo con vencimientos, " +
      "kardex de movimientos y existencias por bodega.",
    acento: "#E9A81F",
    fondo: "#E2EDF9",
    etiquetas: ["Conteo por ubicación", "Días para salir"],
    imagen: "/modulos/inventario.jpg",
    ruta: "/inventario",
    activo: true,
    /* DOS RAMAS, igual que Roturas. Comparten tema —lo que hay en la
       bodega— y NO comparten cifras: los conteos miden EXISTENCIAS y
       las averías miden lo que ya no se puede vender. Con las ocho
       pantallas en una sola lista, el menú de Inventario pedía leerse
       entero para encontrar cualquier cosa, y «Maestro» aparecía dos
       veces queriendo decir cosas distintas. */
    ramas: [
      {
        id: "conteos",
        nombre: "Conteos",
        eyebrow: "EXISTENCIAS",
        /* ENTRA POR EL TABLERO Y NO POR "/inventario": "/inventario" es
           ahora la portada, y una tarjeta que apunta a la pantalla
           donde está la tarjeta es un botón que no lleva a ningún
           lado. */
        ruta: "/inventario/tablero",
        permiso: "/inventario/tablero",
        descripcion:
          "El maestro de materiales y ubicaciones, el conteo por módulo con sus " +
          "vencimientos y la base de lo contado. Contesta qué hay y qué sale primero.",
      },
      {
        id: "averias",
        nombre: "Averías",
        eyebrow: "CAJAS",
        ruta: "/inventario/averias",
        descripcion:
          "Lo que se dañó y sigue en la estiba. Mientras no tenga documento de baja " +
          "cuenta en el inventario: contesta cuánto hay apartado y desde cuándo.",
      },
      {
        id: "casco",
        nombre: "Casco de vidrio",
        eyebrow: "ESTIBAS · HL",
        ruta: "/inventario/casco",
        descripcion:
          "El vidrio vacío que hay en AG22, AG18, AG07 y CA22, en estibas y en HL. " +
          "Se registran las bajas y los movimientos, Control lleva el saldo por día y almacén, y de ahí sale el análisis de PARTIR.",
      },
      {
        id: "balance",
        nombre: "Balance",
        eyebrow: "CUADRE",
        ruta: "/inventario/balance",
        descripcion:
          "El cruce del conteo físico contra el casco de vidrio: las cinco tablas de " +
          "baja, lavado y extrasucio con el cuadre al lado. Lo que el Excel arma a mano, aquí sale del último conteo.",
      },
    ],
    secciones: [
      /* EL ORDEN LO PUSO QUIEN LA USA («organicemos esto»): se corta lo que
         movieron las líneas, se camina la bodega contando (el FEFO diario y,
         el día que toca, la hoja del inventario fiscal), se arma/consulta el
         inventario fiscal, y queda el registro con su tablero. El maestro y la
         recepción —lo que se prepara de vez en cuando— van al final.

         LA BASE VA ANTES QUE EL TABLERO porque el tablero SALE de ella:
         es la misma lectura, una entera y la otra recortada a una sola
         pregunta.

         Aquí había siete pantallas de demostración (Resumen, Productos,
         Bodegas, Movimientos, Conteos físicos…) que duplicaban el maestro:
         dos editores para una misma tabla es cómo dos personas se pisan el
         dato sin enterarse. Ya no están. */
      /* EL INVENTARIO FISCAL VA PRIMERO («inventario fiscal antes que el corte
         de líneas»): se arma el plan (día, hojas, parejas del operador
         logístico y de Bavaria), y de ahí sale lo que cada quien encuentra en
         «Contar». */
      { nombre: "Inventario fiscal", ruta: "/inventario/fiscal", rama: "conteos" },
      { nombre: "Corte de líneas", ruta: "/inventario/corte", rama: "conteos" },
      /* CONTAR LLEVA DOS CONTEOS: el FEFO diario y la hoja del inventario fiscal
         (esta última solo a quien el plan le asignó una). */
      { nombre: "Contar", ruta: "/inventario/conteo", rama: "conteos" },
      { nombre: "La base", ruta: "/inventario/base", rama: "conteos" },
      /* EL TABLERO VIVE EN /inventario/tablero Y NO EN /inventario.
         Ocupando la ruta del módulo, entrar a Inventario era entrar ya
         a Conteos y la bifurcación no existía. `ramaDeRuta` lo dice arriba:
         la ruta del módulo nunca puede caer dentro de una rama. */
      { nombre: "Tablero", ruta: "/inventario/tablero", rama: "conteos" },
      { nombre: "Maestro", ruta: "/inventario/maestro", rama: "conteos" },
      { nombre: "Recepción", ruta: "/inventario/recibir", rama: "conteos" },
      /* AVERÍAS VA DESPUÉS DEL TABLERO, y el análisis detrás de ella.
         Es el mismo orden del proceso: se mantiene el maestro, se
         cuenta, queda el registro, se decide qué sale primero — y lo
         que se dañó y no va a salir nunca se aparta aquí. Mientras no
         tenga documento de baja sigue contando en «La base», que es
         justamente la diferencia que descuadra un conteo. */
      /* AVERÍAS ES UN MÓDULO ENTERO, no dos enlaces sueltos: se
         registra, se le hace seguimiento, se analiza y se configura,
         igual que rotura de línea. Y el orden es el del proceso. */
      { nombre: "Registrar", ruta: "/inventario/averias", rama: "averias" },
      { nombre: "Tablero", ruta: "/inventario/averias/tablero", rama: "averias" },
      { nombre: "Análisis", ruta: "/inventario/averias/analisis", rama: "averias" },
      { nombre: "Maestro", ruta: "/inventario/averias/maestro", rama: "averias" },
      /* CASCO DE VIDRIO: se registra el saldo del día por sitio (el HL lo
         calcula la base con el maestro) y de esos registros sale el
         análisis. Es el mismo orden del proceso. */
      /* REGISTRAR → CONTROL → TABLERO. Registrar es donde ENTRA lo que mueve el casco (la baja de SAP en
         unidades, que se pasa a estibas con el maestro, y después los movimientos); Control son las cuatro
         tablas por almacén que esas entradas alimentan; el tablero sale de Control. Control conserva la
         dirección de siempre (/inventario/casco) para no mover permisos ni registros. */
      { nombre: "Registrar", ruta: "/inventario/casco/registrar", rama: "casco" },
      { nombre: "Control", ruta: "/inventario/casco", rama: "casco" },
      { nombre: "Tablero", ruta: "/inventario/casco/tablero", rama: "casco" },
      /* BALANCE: el cruce del último conteo FEFO contra el casco de vidrio.
         Son las cinco tablas dinámicas que hoy se arman a mano en el Excel
         (CONTEO FABRICA.xlsx), con la diferencia y la alerta al lado. Una
         sola pantalla: no hay nada que registrar ni que configurar. */
      { nombre: "Balance", ruta: "/inventario/balance", rama: "balance" },
    ],
  },
];

/**
 * Todas las rutas que el registro promete. El chequeo de que existan vive
 * en scripts/rutas.mjs y corre en cada build: una sección registrada sin
 * su carpeta en src/app/(app)/ es un enlace a un 404, y el que lo toca no
 * puede distinguir "pantalla pendiente" de "app rota".
 */
export function rutasRegistradas(): string[] {
  const out: string[] = [];
  for (const m of MODULOS) {
    if (!m.activo) continue;
    out.push(m.ruta);
    for (const s of m.secciones) out.push(s.ruta);
  }
  return [...new Set(out)];
}

/** Módulos que se pueden usar. */
export const modulosActivos = () => MODULOS.filter((m) => m.activo);

/** Módulos que se muestran en portada y menú. */
export function modulosVisibles(rol: string): Modulo[] {
  return MODULOS.filter((m) => !m.oculto && puedeVer(m, rol));
}

/**
 * Encuentra el módulo al que pertenece una ruta (incluidos los ocultos).
 *
 * Mira la ruta del módulo Y LA DE SUS SECCIONES. Antes solo miraba la del
 * módulo, y eso dejaba pantallas huérfanas: Administración entra por
 * /admin/roles, que NO es prefijo de /admin/usuarios, así que Usuarios se
 * quedaba sin módulo. Sin módulo no hay migas de pan y —peor— Marco no
 * dibuja el riel: la pantalla quedaba sin ninguna forma de salir, y en la
 * app instalada no hay botón de atrás del navegador que te salve.
 *
 * Gana la coincidencia MÁS LARGA, para que un módulo que cuelgue de otro
 * no se lo robe.
 */
export function moduloPorRuta(pathname: string): Modulo | undefined {
  let mejor: Modulo | undefined;
  let largo = -1;
  for (const m of MODULOS) {
    if (!m.activo) continue;
    for (const r of [m.ruta, ...m.secciones.map((s) => s.ruta)]) {
      if (pathname !== r && !pathname.startsWith(`${r}/`)) continue;
      if (r.length > largo) { largo = r.length; mejor = m }
    }
  }
  return mejor;
}

export function puedeVer(modulo: Modulo, rol: string): boolean {
  if (!modulo.roles || modulo.roles.length === 0) return true;
  return modulo.roles.includes(rol as Rol);
}
