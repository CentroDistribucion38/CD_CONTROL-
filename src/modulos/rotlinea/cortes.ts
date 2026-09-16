/**
 * QUÉ SE PUEDE COMPARAR EN EL PARETO.
 *
 * VIVE EN UN ARCHIVO NORMAL, NO EN Corte.tsx. Esta lista estaba dentro
 * del componente, que es "use client", y la página del tablero —que es
 * del SERVIDOR— hacía `CORTES.some(...)` sobre ella. Next no le entrega
 * el arreglo al servidor: le entrega una referencia al cliente, y
 * llamarle `.some()` tumba la pantalla entera con «a server-side
 * exception has occurred».
 *
 * ES LA MISMA FRONTERA QUE YA SE CRUZÓ MAL CON `conDia`, y esta vez el
 * arnés que se hizo para eso no la cazó: daba por buena cualquier
 * importación con nombre en mayúscula, suponiendo que mayúscula =
 * componente de React. `CORTES` es mayúscula y no es un componente. La
 * regla del arnés ya está corregida —PascalCase es componente,
 * MAYÚSCULAS_ASÍ es una constante— y con ella este error se reporta
 * antes de compilar.
 *
 * La lección, otra vez: lo que una página del servidor va a USAR no
 * puede vivir detrás de un "use client", sea una función, un arreglo o
 * un número.
 */
export const CORTES = [
  { id: "maquina", rotulo: "Por máquina" },
  { id: "envase",  rotulo: "Por envase" },
  { id: "linea",   rotulo: "Por línea" },
] as const;

export type Corte = (typeof CORTES)[number]["id"];
