
let ultima = "";
export const useRouter = () => ({
  push(u: string) { ultima = u; (window as any).__ruta = u },
  refresh() {}, replace(u: string) { ultima = u; (window as any).__ruta = u },
});
export const usePathname = () => "/roturas/salida/analisis";
export const useSearchParams = () => new URLSearchParams((window as any).__q ?? "");
