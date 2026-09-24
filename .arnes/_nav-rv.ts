export const useRouter = () => ({ refresh() {}, push() {},
  replace(u: string) { (window as any).idas = [...((window as any).idas ?? []), u] } });
export const useSearchParams = () => new URLSearchParams("");