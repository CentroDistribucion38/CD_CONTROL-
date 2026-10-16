import { FilasDinamicas } from "./FilasDinamicas";

/** Todo el módulo Balance: sus tablas resaltan la fila bajo el cursor / el teclado y dejan marcar filas (ver FilasDinamicas). */
export default function BalanceLayout({ children }: { children: React.ReactNode }) {
  return <FilasDinamicas>{children}</FilasDinamicas>;
}
