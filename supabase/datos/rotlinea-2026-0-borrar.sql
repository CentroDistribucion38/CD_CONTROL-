/* =====================================================================
   ROTURA DE LÍNEA — BORRAR ANTES DE VOLVER A CARGAR
   ---------------------------------------------------------------------
   La primera carga entró con 24.243 filas y el Excel tiene 24.245. La
   suma de unidades coincidía —1.889.816 en los dos— porque las dos
   filas que faltaban traían cero kilos, y por eso el error no se veía
   en ningún total: se veía contando.

   DE DÓNDE SALÍAN LAS DOS. El generador anterior daba por hecho que una
   combinación (día, línea, turno, envase, máquina) se pesaba una o dos
   veces, y numeraba la toma 1 o 2. En el Excel hay 26 combinaciones
   pesadas TRES veces y una pesada CUATRO —el 10 de enero, línea 2,
   turno 1, pasteurizadora—. Las que no cabían en la numeración se
   perdían.

   Este archivo deja la tabla vacía para volver a cargarla entera. Se
   corre UNA VEZ y solo antes de la recarga.
   ===================================================================== */

delete from public.rotlinea_registro;

select count(*) as debe_dar_cero from public.rotlinea_registro;
