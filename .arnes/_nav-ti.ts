const w = window as any;
export const useRouter = () => ({
  push(u: string) { w.rutas = [...(w.rutas ?? []), u]; w.url = u; w.pintar?.() },
  refresh() { w.refrescos = (w.refrescos ?? 0) + 1 },
  replace() {},
});
export const usePathname = () => "/traspasos/control";
export const useSearchParams = () => new URLSearchParams((w.url ?? "").split("?")[1] ?? "");