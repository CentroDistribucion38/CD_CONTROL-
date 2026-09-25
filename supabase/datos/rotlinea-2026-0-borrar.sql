/* =====================================================================
   ROTURA DE LÍNEA — BORRAR ANTES DE VOLVER A CARGAR
   ---------------------------------------------------------------------
   POR QUÉ SE REHACE LA CARGA. La primera entró con 24.243 filas y la
   hoja BASE del Excel tiene 24.245. Faltaban dos.

   Y EL ERROR NO SE VEÍA EN NINGÚN TOTAL, que es lo peor que le puede
   pasar a un dato malo: las dos filas perdidas —18 de julio, máquina
   13, líneas 2 y 6— traían CERO kilos y CERO unidades. La suma daba
   1.889.816 con ellas y sin ellas. Solo se notaba contando filas, que
   fue exactamente como lo encontró Cristian: seleccionando la columna
   en Excel y mirando el «Recuento».

   ESTA CARGA SE COMPROBÓ AL REVÉS. No se confía en el generador: se
   vuelven a leer los seis archivos ya escritos, se cuentan sus tuplas y
   se comparan contra el Excel. 24.245 filas, 1.889.816 unidades,
   426.367 kilos, cero llaves repetidas. Las tres cifras cuadran.

   OJO CON LO QUE SE LLEVA POR DELANTE: esto vacía la tabla ENTERA,
   incluida cualquier pesada registrada a mano desde la app. A la fecha
   era una sola, de prueba, del 15 de septiembre.

   Se corre UNA VEZ y solo antes de la recarga.
   ===================================================================== */

delete from public.rotlinea_registro;

select count(*) as debe_dar_cero from public.rotlinea_registro;
